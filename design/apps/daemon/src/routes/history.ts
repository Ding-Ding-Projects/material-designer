import { createHash } from 'node:crypto';

import type { Express, RequestHandler, Response } from 'express';
import type {
  HistoryDomainsResponse,
  HistoryEntryContent,
  HistoryListQuery,
  HistoryListResponse,
  HistoryPruneRequest,
  HistoryPruneResponse,
  HistoryRestoreRequest,
  HistoryRestoreResponse,
  HistoryRetentionPolicy,
  HistoryRetentionResponse,
  HistoryRevisionKind,
  HistoryRevisionResponse,
} from '@open-design/contracts';
import { HISTORY_REVISION_KINDS } from '@open-design/contracts';

import { sendApiError } from '../http/api-errors.js';
import type { HistoryService } from '../history/service.js';
import { HistoryRevisionNotFoundError } from '../history/store.js';
import { domainIdForRepoPath } from '../history/domains.js';

export interface RegisterHistoryRoutesDeps {
  history: HistoryService;
  http: {
    requireLocalDaemonRequest: RequestHandler;
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readString(query: Record<string, unknown>, key: string): string | undefined {
  const value = query[key];
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const first: unknown = value[0];
    if (typeof first === 'string') return first;
  }
  return undefined;
}

function readNumber(query: Record<string, unknown>, key: string): number | undefined {
  const raw = readString(query, key);
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readFlag(query: Record<string, unknown>, key: string): boolean {
  const raw = readString(query, key);
  return raw === '1' || raw === 'true';
}

function parseKind(value: string | undefined): HistoryRevisionKind | undefined {
  if (value === undefined) return undefined;
  return HISTORY_REVISION_KINDS.find((kind) => kind === value);
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries = (value as unknown[])
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
  return entries.length > 0 ? entries : undefined;
}

function readNullableCount(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

/**
 * Decide how to hand the stored bytes back. History mirrors bytes verbatim, so
 * an entry can be anything a record store writes — including ciphertext. Text
 * that survives a UTF-8 round trip goes back as text; everything else goes back
 * as base64 rather than being mangled into replacement characters.
 */
function encodeEntry(entryPath: string, bytes: Buffer, redacted: boolean): HistoryEntryContent {
  const digest = createHash('sha256').update(bytes).digest('hex');
  const asText = bytes.toString('utf8');
  const isUtf8 = !bytes.includes(0) && Buffer.from(asText, 'utf8').equals(bytes);
  return {
    path: entryPath,
    size: bytes.length,
    digest,
    encoding: isUtf8 ? 'utf8' : 'base64',
    content: redacted ? null : (isUtf8 ? asText : bytes.toString('base64')),
    redacted,
  };
}

function failed(res: Response, error: unknown): Response {
  if (error instanceof HistoryRevisionNotFoundError) {
    return sendApiError(res, 404, 'NOT_FOUND', error.message);
  }
  return sendApiError(
    res,
    500,
    'INTERNAL_ERROR',
    error instanceof Error ? error.message : String(error),
  );
}

/**
 * Local, Git-backed version history.
 *
 * Every route is gated behind `requireLocalDaemonRequest`, the same guard the
 * diagnostics export uses. History mirrors credential stores, so it sits in the
 * same threat tier and must stay unreachable when the daemon is bound to a
 * non-loopback address. Sensitive domains additionally never return their
 * stored bytes at all: the response carries the size and the digest so a
 * revision is still verifiable, without turning history into a side channel
 * that reads out a secret the normal API would refuse to hand over.
 *
 * The literal paths are registered before `/:revisionId` so `domains`,
 * `retention`, `restore` and `prune` are not swallowed by the parameter route.
 */
export function registerHistoryRoutes(app: Express, ctx: RegisterHistoryRoutesDeps): void {
  const { history } = ctx;
  const { requireLocalDaemonRequest } = ctx.http;

  app.get('/api/history', requireLocalDaemonRequest, async (req, res) => {
    const params = asRecord(req.query);
    const query: HistoryListQuery = {};
    const domainId = readString(params, 'domainId');
    if (domainId) query.domainId = domainId;
    const rawKind = readString(params, 'kind');
    const kind = parseKind(rawKind);
    if (rawKind !== undefined && kind === undefined) {
      // Silently dropping an unrecognized filter would show the caller every
      // revision and let them believe it was filtered.
      return sendApiError(
        res,
        400,
        'BAD_REQUEST',
        `unknown kind: ${rawKind} (expected ${HISTORY_REVISION_KINDS.join(' | ')})`,
      );
    }
    if (kind) query.kind = kind;
    const since = readNumber(params, 'since');
    if (since !== undefined) query.since = since;
    const until = readNumber(params, 'until');
    if (until !== undefined) query.until = until;
    const search = readString(params, 'query');
    if (search) query.query = search;
    if (readFlag(params, 'regex')) query.regex = true;
    const limit = readNumber(params, 'limit');
    if (limit !== undefined) query.limit = limit;
    const offset = readNumber(params, 'offset');
    if (offset !== undefined) query.offset = offset;

    try {
      const payload: HistoryListResponse = await history.list(query);
      return res.json(payload);
    } catch (error) {
      // A bad search pattern is the caller's input, not a daemon fault.
      if (error instanceof Error && /pattern/u.test(error.message)) {
        return sendApiError(res, 400, 'BAD_REQUEST', error.message);
      }
      return failed(res, error);
    }
  });

  app.get('/api/history/domains', requireLocalDaemonRequest, async (_req, res) => {
    try {
      const listing = await history.list({ limit: 1 });
      const payload: HistoryDomainsResponse = {
        available: listing.available,
        unavailableReason: listing.unavailableReason,
        domains: listing.domains,
      };
      return res.json(payload);
    } catch (error) {
      return failed(res, error);
    }
  });

  app.get('/api/history/retention', requireLocalDaemonRequest, async (_req, res) => {
    try {
      const payload: HistoryRetentionResponse = { retention: await history.getRetention() };
      return res.json(payload);
    } catch (error) {
      return failed(res, error);
    }
  });

  app.post('/api/history/retention', requireLocalDaemonRequest, async (req, res) => {
    const body = asRecord(req.body);
    // Writes the whole policy: a limit the caller leaves out is cleared, not
    // silently kept from whatever was stored before.
    const policy: HistoryRetentionPolicy = {
      maxRevisions: readNullableCount(body.maxRevisions),
      maxAgeDays: readNullableCount(body.maxAgeDays),
    };
    try {
      const payload: HistoryRetentionResponse = { retention: await history.setRetention(policy) };
      return res.json(payload);
    } catch (error) {
      return failed(res, error);
    }
  });

  app.post('/api/history/restore', requireLocalDaemonRequest, async (req, res) => {
    const body = asRecord(req.body);
    const revisionId = typeof body.revisionId === 'string' ? body.revisionId.trim() : '';
    if (!revisionId) {
      return sendApiError(res, 400, 'BAD_REQUEST', 'revisionId is required');
    }
    const request: HistoryRestoreRequest = { revisionId };
    const domainIds = readStringArray(body.domainIds);
    if (domainIds) request.domainIds = domainIds;
    if (typeof body.label === 'string' && body.label.trim().length > 0) {
      request.label = body.label.trim();
    }
    try {
      const payload: HistoryRestoreResponse = await history.restore(request);
      return res.json(payload);
    } catch (error) {
      return failed(res, error);
    }
  });

  app.post('/api/history/prune', requireLocalDaemonRequest, async (req, res) => {
    const body = asRecord(req.body);
    // Dry run by default: nothing is removed until the caller says so.
    const request: HistoryPruneRequest = { dryRun: body.dryRun !== false };
    if (typeof body.policy === 'object' && body.policy !== null && !Array.isArray(body.policy)) {
      const raw = asRecord(body.policy);
      request.policy = {
        maxRevisions: readNullableCount(raw.maxRevisions),
        maxAgeDays: readNullableCount(raw.maxAgeDays),
      };
    }
    try {
      const payload: HistoryPruneResponse = await history.prune(request);
      return res.json(payload);
    } catch (error) {
      return failed(res, error);
    }
  });

  app.get('/api/history/:revisionId', requireLocalDaemonRequest, async (req, res) => {
    const revisionId = String(req.params.revisionId ?? '').trim();
    if (!revisionId) {
      return sendApiError(res, 400, 'BAD_REQUEST', 'revisionId is required');
    }
    const entryPath = readString(asRecord(req.query), 'path');
    try {
      const revision = await history.show(revisionId);
      let entry: HistoryEntryContent | null = null;
      if (entryPath) {
        const bytes = await history.readEntry(revisionId, entryPath);
        if (bytes === null) {
          return sendApiError(
            res,
            404,
            'NOT_FOUND',
            `entry ${entryPath} is not present in revision ${revisionId}`,
          );
        }
        const domainId = domainIdForRepoPath(entryPath);
        entry = encodeEntry(
          entryPath,
          bytes,
          domainId !== null && history.isSensitiveDomain(domainId),
        );
      }
      const payload: HistoryRevisionResponse = { revision, entry };
      return res.json(payload);
    } catch (error) {
      if (error instanceof Error && /out of scope/u.test(error.message)) {
        return sendApiError(res, 400, 'BAD_REQUEST', error.message);
      }
      return failed(res, error);
    }
  });
}
