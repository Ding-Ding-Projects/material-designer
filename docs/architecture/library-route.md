# Production Library route

## Behaviour

The web application exposes the existing provider-backed LibrarySection at
`/library`. The same destination is available from the persistent entry
navigation rail for local and workspace users, and the command palette keeps its
destination row in the same route model. The route renders the real Library
records returned by `/api/library/assets`; it does not seed cards, replace the
provider boundary, or inject replacement DOM.

LibrarySection retains its existing upload, sync, preview, project/design-system
handoff, multi-selection, and destructive-action confirmation behavior. Its
toolbar search is owned by one `useRegexSearch` controller. Plain text is the
default and, like explicit regex mode, evaluates locally against the complete
paged `LibraryAsset` projection returned through the provider. The daemon's
500-row first-page default is never a hidden search cap: the provider follows
bounded `nextOffset` continuations and reports a typed pagination failure rather
than truncating silently. The adjacent `RegexSearchField` popover owns its
pattern, flags, validation, focus return, and field identity. A live status
announces the visible result count to assistive technology.

Kind and source filters are searchable combobox popovers, each with its own
plain-text-first regex controller and anchored builder. The design-system
handoff menu and every `LibraryPicker` instance have independent searchable
builders, keyboard roving focus, Escape handling, and trigger focus return.
Reconciliation emits an SSE refresh event consumed by every active Library view.
Bulk selection and handoff actions operate on visible matching ids only and show
the visible scope beside the count.

The kind chips in `LibraryPicker` are an `aria-pressed` button group rather than
tabs without a panel. Search inputs remain outside the owned listbox/menu
containers; the dynamic handoff menu's role is limited to its actual menu-item
children, while its search, divider, heading, and no-match status stay in the
surrounding presentation group. This keeps the outer dialog's focus scope and
the inner widget ownership contracts separate.

The picker keeps previously loaded rows visible while a refresh is in flight or
has failed; a retry/error row is shown inline and the full empty/error state is
used only before the first successful response. While a picker confirmation is
busy, its search, kind chips, cards, and close routes are disabled and the
reviewed selection is frozen. A partial callback result keeps failed/skipped
ids selected, lists each item, and offers retry without closing the picker.
Bulk delete previews freeze the visible matching id list when the gate opens, so
later selection changes cannot retarget an already reviewed action. SSE merges
and full loads share one generation/abort domain and a bounded worker pool;
stale work cannot overwrite the accepted projection. The shared dialog focus
trap includes the portalled regex builder by scope id, and filter popovers
measure their trigger, flip above when needed, and stay within the viewport.

Element captures are a badge-level filter, not a storage kind: both image
screenshots and HTML snapshots carrying `metadata.element` are included. The
daemon query therefore stays open for `element`, and the renderer applies the
same `badgeKind` projection used by the picker and grid.

## Configuration

The route's staged-rollout seam is `LIBRARY_UI_VISIBLE` in
`apps/web/src/features/libraryUi.ts`, and the production value is `true`.
`parseRoute` and `buildPath` use `/library` as the canonical path. The normal
navigation rail uses the existing `library.title` translation and the existing
icon system. No deterministic capture fixture is enabled in this source lane:
fixture selection remains pending until it can pass public-safe records through
the real provider/API boundary.

Kind/source filter controls are searchable comboboxes rather than native
`select` elements. The dynamic design-system menu has its own local search and
anchored full regex builder; each picker owns its own query and builder state.
No menu or dropdown borrows a hidden controller from another surface.

## Failure modes

- A daemon/API failure leaves already loaded assets in place, clears loading in
  `finally`, and shows a localized non-blocking retry action; the route does not
  fabricate sample assets. Initial-load and retained-row refresh errors are
  distinct states.
- A malformed or stalled continuation is a typed provider failure. The UI keeps
  the prior rows and exposes retry instead of claiming a complete list.
- A continuation is terminal only when `nextCursor` is omitted or `null`.
  The cursor is an opaque, bounded keyset token containing a point-in-time
  snapshot cutoff and the final `(archivedDate, createdAt, id)` tuple. The
  daemon rejects malformed, oversized, non-advancing, or incomplete cursor
  values rather than coercing them. New ingests after the first page are outside
  that snapshot, and deletes cannot shift a later page into a duplicate.
- Page walks carry an `AbortController` and generation identity. A newer search,
  filter, retry, unmount, or SSE refresh cancels the older walk, and neither its
  rows nor its error may overwrite the current view. Targeted hydration and
  bulk deletion use a four-worker bounded pool with a per-item ledger.
- An invalid or partially typed regex is handled by the shared bounded matcher;
  the last valid pattern is retained where the shared controller supports it,
  and the UI never sends the raw pattern to the daemon keyword query.
- A query with no visible matches produces an explicit no-match state and a
  screen-reader result-count update rather than a blank loading surface.
- Destructive actions remain behind the existing two-key confirmation and are
  not made easier by the route or search changes. A partial delete removes only
  successful rows, keeps failed rows selected, holds the gate in its failed
state, and exposes itemized retry.
- A daemon-owned delete retries transient file locks, keeps the database row on
  primary-byte failure, removes verified `.element.html` and `.od-figma.json`
  sidecars, and returns bounded residue labels when a sidecar remains.
- Destructive action, target, item, blast-radius, and recovery copy comes from
  the locale catalog; no upstream product name is embedded in the Library gate.
- Manual uploads prevent the browser's default drop/paste action, refuse
  re-entry while a batch is active, expose byte-backed per-file and aggregate
  progress, allow bounded cancellation, and retain done, deduped, failed, and
  cancelled rows so partial outcomes are visible. Progress updates are
  throttled without inventing progress, late upload callbacks are ignored after
  unmount or batch replacement, and stable daemon error codes map to localized
  messages; raw error detail remains diagnostic-only.

## Security considerations

The search projection stays in the renderer and is evaluated only over records
the Library provider already returned. Pattern and sample state are not sent to
the daemon, and the shared regex implementation bounds pattern length and match
work. Continuation page size and page count are both bounded, with malformed or
non-advancing snapshot cursors rejected. The daemon accepts only bounded `limit`
values on the HTTP route and uses a point-in-time keyset cursor. The route does
not add a network source, fixture
archive, catalog image, or alternate asset store. Existing upload, raw-asset,
project handoff and destructive-provider boundaries remain the source of truth.
Upload request progress uses the browser's cancellable XHR upload boundary, and
the aggregate is weighted by each file's byte size rather than averaging files
of wildly different sizes. Text uploads are subject to the same byte ceiling as
file uploads before a request is sent. Preview media that is decorative in a
card is hidden from assistive technology, while the full video preview has an
explicit accessible name; the HTML disclosure exposes a stable labelled region.

## Verification

Commit [`e4fcbfab1`](https://github.com/Ding-Ding-Projects/material-designer/commit/e4fcbfab1680cde38235d663bb21f499d2d998d0)
adds the initial route and search seam. Repair commit
[`06e45980d`](https://github.com/Ding-Ding-Projects/material-designer/commit/06e45980d892f493d0915dd75e0949a7022661de)
adds focused continuation, failure, SSE, combobox,
selection, modal, and localization contracts. `scripts/verify-port.sh` and its
JSON form remain the permitted source-only checks; this lane deliberately did
not run Node, package-manager commands, builds, type checks, tests, UI actions or
captures locally. Hosted verification, installed interaction, and a deterministic
provider/API-backed capture fixture remain pending.

The follow-up source repair also pins strict terminal-cursor parsing, stale-walk
abort/generation boundaries, element filtering across image and HTML snapshots,
menu/listbox ARIA ownership, kind-button semantics, and cancellable byte-backed
upload progress. The final boundary repair adds immutable delete previews,
targeted SSE abort/generation checks, portal-aware dialog focus, measured filter
geometry, 48×48 interaction targets, localized upload error codes, and
post-unmount upload suppression. These changes are source-only until the hosted
Chut runs.

## Suggested reading

- [../standards/regex-builder.md](../standards/regex-builder.md)
- [../standards/design-reference-parity.md](../standards/design-reference-parity.md)
- [web-runtime.md](web-runtime.md)
- [../api/README.md](../api/README.md)
