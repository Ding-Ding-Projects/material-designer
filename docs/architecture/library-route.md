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
  fabricate sample assets.
- A malformed or stalled continuation is a typed provider failure. The UI keeps
  the prior rows and exposes retry instead of claiming a complete list.
- An invalid or partially typed regex is handled by the shared bounded matcher;
  the last valid pattern is retained where the shared controller supports it,
  and the UI never sends the raw pattern to the daemon keyword query.
- A query with no visible matches produces an explicit no-match state and a
  screen-reader result-count update rather than a blank loading surface.
- Destructive actions remain behind the existing two-key confirmation and are
  not made easier by the route or search changes.

## Security considerations

The search projection stays in the renderer and is evaluated only over records
the Library provider already returned. Pattern and sample state are not sent to
the daemon, and the shared regex implementation bounds pattern length and match
work. Continuation page size and page count are both bounded, with malformed or
non-advancing offsets rejected. The route does not add a network source, fixture
archive, catalog image, or alternate asset store. Existing upload, raw-asset,
project handoff and destructive-provider boundaries remain the source of truth.

## Verification

Commit [`e4fcbfab1`](https://github.com/Ding-Ding-Projects/material-designer/commit/e4fcbfab1680cde38235d663bb21f499d2d998d0)
adds the initial route and search seam. The follow-up repair commit is recorded
in the handoff and changelog with focused continuation, failure, SSE, combobox,
selection, modal, and localization contracts. `scripts/verify-port.sh` and its
JSON form remain the permitted source-only checks; this lane deliberately did
not run Node, package-manager commands, builds, type checks, tests, UI actions or
captures locally. Hosted verification, installed interaction, and a deterministic
provider/API-backed capture fixture remain pending.

## Suggested reading

- [../standards/regex-builder.md](../standards/regex-builder.md)
- [../standards/design-reference-parity.md](../standards/design-reference-parity.md)
- [web-runtime.md](web-runtime.md)
- [../api/README.md](../api/README.md)
