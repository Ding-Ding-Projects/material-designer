// The web app's side of `/api/history`.
//
// Thin on purpose. The daemon owns the snapshot repository, the append-only
// guarantee and the redaction of sensitive domains; this module's only job is
// to move typed values across the wire and to turn a failure into something the
// panel can *say* rather than an unhandled rejection.
//
// The one rule worth stating: a history read that fails must never take a
// surface down with it. Every function here resolves — `ok: false` with the
// daemon's own message — instead of throwing, so a panel that cannot reach
// history renders an honest "history is unavailable" line rather than a blank
// card or a crashed tree.

import type {
  HistoryListQuery,
  HistoryListResponse,
  HistoryPruneRequest,
  HistoryPruneResponse,
  HistoryRestoreRequest,
  HistoryRestoreResponse,
  HistoryRetentionPolicy,
  HistoryRetentionResponse,
  HistoryRevisionResponse,
} from '@open-design/contracts';

export type HistoryResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Pull the daemon's own error message out of the shared error envelope, so the
 * panel shows "history search pattern is longer than 200 characters" rather
 * than "Request failed with status 400".
 */
async function readError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null) {
      const record = body as Record<string, unknown>;
      const error = record.error;
      if (typeof error === 'string' && error.length > 0) return error;
      if (typeof error === 'object' && error !== null) {
        const message = (error as Record<string, unknown>).message;
        if (typeof message === 'string' && message.length > 0) return message;
      }
      const message = record.message;
      if (typeof message === 'string' && message.length > 0) return message;
    }
  } catch {
    // A non-JSON body is not worth a second failure path; fall through.
  }
  return `${response.status} ${response.statusText}`.trim();
}

async function request<T>(path: string, init?: RequestInit): Promise<HistoryResult<T>> {
  try {
    const response = await fetch(path, init);
    if (!response.ok) return { ok: false, error: await readError(response) };
    const value = (await response.json()) as T;
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function jsonPost(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/**
 * Build the list query string.
 *
 * Deliberately narrow: the panel pushes only paging to the daemon and does its
 * date, action and search filtering locally over the loaded page. Sending the
 * date range as epoch milliseconds would mean two different notions of "which
 * day is this" — the daemon's UTC boundary and the calendar the user is
 * clicking — and a revision written late in the evening would drop out of the
 * range that names the day it visibly happened.
 */
export function historyListSearch(query: Pick<HistoryListQuery, 'limit' | 'offset'>): string {
  const params = new URLSearchParams();
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.offset !== undefined) params.set('offset', String(query.offset));
  const search = params.toString();
  return search.length > 0 ? `?${search}` : '';
}

/** The daemon's own ceiling (`MAX_LIST_LIMIT` in `history/service.ts`). */
export const HISTORY_PAGE_SIZE = 500;

export function fetchHistoryPage(offset: number): Promise<HistoryResult<HistoryListResponse>> {
  return request<HistoryListResponse>(
    `/api/history${historyListSearch({ limit: HISTORY_PAGE_SIZE, offset })}`,
  );
}

export function fetchHistoryRevision(
  revisionId: string,
  entryPath?: string,
): Promise<HistoryResult<HistoryRevisionResponse>> {
  const suffix =
    entryPath === undefined ? '' : `?path=${encodeURIComponent(entryPath)}`;
  return request<HistoryRevisionResponse>(
    `/api/history/${encodeURIComponent(revisionId)}${suffix}`,
  );
}

export function restoreHistoryRevision(
  request_: HistoryRestoreRequest,
): Promise<HistoryResult<HistoryRestoreResponse>> {
  return request<HistoryRestoreResponse>('/api/history/restore', jsonPost(request_));
}

export function setHistoryRetention(
  policy: HistoryRetentionPolicy,
): Promise<HistoryResult<HistoryRetentionResponse>> {
  return request<HistoryRetentionResponse>('/api/history/retention', jsonPost(policy));
}

/**
 * Prune. Dry run by default at the daemon, and the panel always asks for the
 * dry run first — the preview is what the user confirms against, so nothing is
 * removed before somebody has read the list of what would go.
 */
export function pruneHistory(
  request_: HistoryPruneRequest,
): Promise<HistoryResult<HistoryPruneResponse>> {
  return request<HistoryPruneResponse>('/api/history/prune', jsonPost(request_));
}
