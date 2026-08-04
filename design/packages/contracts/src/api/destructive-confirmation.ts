// Destructive-delete confirmation tokens — the shared web/daemon contract for
// the authorization half of Standard 7 (`docs/standards/super-confirmation.md`).
//
// The two-key-plus-slider gate in `apps/web/src/components/destructive/` and
// the `od … delete --confirm` flag are *interface* gates: they make a human
// prove intent at the surface they happen to be standing in. Neither is an
// authorization boundary, because neither is on the code path a third caller
// takes. `curl -X DELETE /api/projects/p1` passed both of them by never
// meeting either.
//
// The standard is explicit about where the boundary belongs — "enforced in the
// handler, never in the interface" — and about what an authorization is worth:
// "Completing the slider authorizes one execution of one captured set. It does
// not authorize a retry, a second identical action, or the same action after
// the selection changed."
//
// So the daemon issues a confirmation the caller must *obtain* rather than
// *assert*:
//
//   POST /api/projects/:id/confirm-delete   -> { token, expiresAt, summary }
//   DELETE /api/projects/:id
//     x-od-confirm-token: <token>
//
// The token is unguessable, bound to one resource kind and one id, valid once,
// and short-lived. A `?confirm=true` query flag would have been none of those
// four things: anything that can call the route can also set a constant.
//
// Pure TypeScript: no Node, browser, or daemon imports (contracts purity).

/**
 * The resource families whose deletion the daemon refuses without a token.
 *
 * Membership is decided by one question: **can local version history bring it
 * back?** `apps/daemon/src/history/domains.ts` snapshots settings, connectors,
 * BYOK profiles, MCP servers, memory, the automation library and orbit from
 * disk, and the `routines` / `templates` SQLite tables through
 * `history/sqlite-domain.ts`. A delete inside one of those domains records a
 * revision and can be restored, so gating it would add ceremony without
 * safety — and the standard says as much: "Where an action is genuinely
 * reversible through the local version history, prefer a notification with an
 * undo action."
 *
 * These five are outside every domain, deliberately and permanently:
 *
 * - `project` — `projects/` is excluded from history on purpose (mirroring
 *   every artifact byte would double the largest thing on disk). The delete
 *   cancels in-flight agent runs, drops the SQLite row and removes the whole
 *   project directory. Nothing records it and nothing can undo it.
 * - `brand` — removes the brand directory and the design system it registered.
 *   Installed-extension trees are excluded from history; a user-authored brand
 *   has no other copy.
 * - `library-asset` — unlinks the library's own content-addressed bytes and
 *   drops the row. `LIBRARY_DIR` is in no history domain.
 * - `project-folder` — `DELETE /api/projects/:id/folders` is an `rm -rf` of a
 *   subtree. It is deliberately NOT the same case as a single project file:
 *   that route calls `markProjectFileVersionStoreDeleted`, which tombstones the
 *   per-file version manifest and leaves every revision restorable, which is
 *   exactly why `od files delete` is ungated. The folder route writes no
 *   revision of any kind, and takes every non-versioned byte in the subtree —
 *   images, data files, build output — with it.
 * - `design-system` — a *user-authored*, editable design system under the data
 *   root's `design-systems/` tree, which `history/domains.ts` names in its list
 *   of deliberate absences. Only the `user:`-prefixed ids reach this: the same
 *   URL also serves a marketplace **uninstall** for non-`user:` ids, and that
 *   one is re-installable from its source, so it is not gated. See
 *   `routes/static-resource.ts`, which handles the uninstall and hands the
 *   `user:` ids on to `routes/design-systems.ts`.
 */
export const DESTRUCTIVE_RESOURCE_KINDS = [
  'project',
  'brand',
  'library-asset',
  'project-folder',
  'design-system',
] as const;

export type DestructiveResourceKind = (typeof DESTRUCTIVE_RESOURCE_KINDS)[number];

/**
 * The header the DELETE carries the token in.
 *
 * A header rather than a query parameter or a path segment, for one reason
 * that matters more than tidiness: request logs, proxy logs, browser history
 * and shell history all record method and URL. A token in the URL is a token
 * written to disk in five places by machinery nobody remembers configuring. A
 * header is not logged by default anywhere in this stack.
 */
export const CONFIRM_DELETE_HEADER = 'x-od-confirm-token';

/** How long an issued token stays valid. */
export const CONFIRM_DELETE_TTL_MS = 120_000;

/** The path segment appended to a resource URL to mint a token for it. */
export const CONFIRM_DELETE_PATH_SEGMENT = 'confirm-delete';

/**
 * What the DELETE is actually going to destroy, computed by the daemon at the
 * moment the token is minted.
 *
 * The gate's copy must name the real scope ("Name the real scope" in the
 * standard's security notes), and the only place that knows the real scope is
 * the handler. Returning it with the token means the interface renders the
 * daemon's account of the blast radius rather than its own guess at it, and
 * the two cannot drift.
 */
export type DestructiveDeleteSummary = {
  kind: DestructiveResourceKind;
  id: string;
  /** The record's own name, for the gate's `target`. Falls back to the id. */
  label: string;
  /** One line per distinct thing that goes. Renders as the gate's `items`. */
  items: string[];
  /**
   * Always `false` for every kind in {@link DESTRUCTIVE_RESOURCE_KINDS} — the
   * field exists so a future reversible kind cannot be added without someone
   * having to write `false` and notice they are lying.
   */
  reversible: false;
};

/** `POST /api/<resource>/:id/confirm-delete` — 200. */
export interface ConfirmDeleteResponse {
  /** Opaque, single-use, bound to `summary.kind` + `summary.id`. */
  token: string;
  /** Epoch milliseconds after which the token is refused as expired. */
  expiresAt: number;
  /** Convenience for clients that would otherwise diff against a skewed clock. */
  expiresInMs: number;
  summary: DestructiveDeleteSummary;
}

/**
 * `details` on the 428 refusal, so a client can act on it without scraping
 * prose: it names the resource, the exact URL that mints a token for it, and
 * the header to send the token back in.
 */
// A `type` rather than an `interface` on purpose: this value is assigned to
// `ApiError.details`, which is `JsonValue`. TypeScript grants an implicit index
// signature to an object *type alias* and not to an interface, so an interface
// here would fail to satisfy `{ [key: string]: JsonValue }` at every call site.
export type ConfirmationRequiredDetails = {
  kind: 'confirmation-required';
  resource: { kind: DestructiveResourceKind; id: string };
  /** The reason this particular request was refused. */
  reason: ConfirmationRefusalReason;
  /** Absolute-path URL to POST to for a token. */
  confirmUrl: string;
  header: string;
};

/**
 * Why a confirmation was refused. Distinguished so a client can tell "you
 * never asked for a token" from "your token was for a different project" —
 * the first is a caller that has not implemented the flow, the second is a
 * caller whose flow has a bug, and only the first should be retried blindly.
 */
export type ConfirmationRefusalReason =
  /** No `x-od-confirm-token` header at all. */
  | 'missing'
  /** The header was present but names no live token (never issued, or reused). */
  | 'unknown'
  /** Issued, but past `expiresAt`. */
  | 'expired'
  /** Live and valid, but issued for a different resource. */
  | 'resource-mismatch';

/** Builds the mint URL a refusal points at. Shared so the two sides agree. */
export function confirmDeleteUrlFor(resourcePath: string): string {
  const trimmed = resourcePath.endsWith('/') ? resourcePath.slice(0, -1) : resourcePath;
  return `${trimmed}/${CONFIRM_DELETE_PATH_SEGMENT}`;
}

/**
 * One folder path, spelled one way.
 *
 * Exported because the daemon needs the same reading twice for one request —
 * once to bind the token and once to describe the subtree it is about to
 * remove — and two copies of a normalization rule is how the two legs come to
 * disagree about whether `drafts` and `drafts/` are the same folder.
 *
 * Deliberately not a sanitizer: it strips surrounding separators and
 * whitespace and settles on forward slashes, and nothing else. Containment and
 * escape checks belong to `deleteProjectFolder`, which does them against the
 * real filesystem; a second, weaker copy here would only invite callers to
 * trust the wrong one.
 */
export function normalizeProjectFolderPath(folderPath: string): string {
  return folderPath.trim().replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '');
}

/**
 * The resource id a `project-folder` token is bound to.
 *
 * `DELETE /api/projects/:id/folders` is the one gated route whose subject is
 * not fully in the URL: the folder comes from the request body, so the project
 * id alone would be the wrong binding — a token minted to delete `drafts/`
 * would then authorize deleting `final/` in the same project, which is exactly
 * the "authorizes one execution of one captured set" property the token exists
 * to hold.
 *
 * Both sides call this on the *raw* value they were given rather than on a
 * separately normalized one, so mint and consume cannot disagree about a
 * trailing slash. Normalization here is limited to stripping surrounding
 * separators and whitespace: it exists to stop `drafts` and `drafts/` reading
 * as two different grants, not to sanitize a path (`deleteProjectFolder` does
 * the containment checks, and doing them twice in two places is how they drift).
 */
export function projectFolderResourceId(projectId: string, folderPath: string): string {
  // A separator no path segment and no project id can contain, so two
  // different (project, folder) pairs cannot spell one another's id.
  return `${projectId}${String.fromCharCode(31)}${normalizeProjectFolderPath(folderPath)}`;
}
