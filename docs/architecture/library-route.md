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
default and continues to use the daemon's bounded keyword query after the
debounce; explicit regex mode evaluates locally against a bounded text
projection of each loaded `LibraryAsset`. The adjacent `RegexSearchField`
popover owns its pattern, flags, validation, focus return, and field identity.
A live status announces the visible result count to assistive technology.

## Configuration

The route's staged-rollout seam is `LIBRARY_UI_VISIBLE` in
`apps/web/src/features/libraryUi.ts`, and the production value is `true`.
`parseRoute` and `buildPath` use `/library` as the canonical path. The normal
navigation rail uses the existing `library.title` translation and the existing
icon system. No deterministic capture fixture is enabled in this source lane:
fixture selection remains pending until it can pass public-safe records through
the real provider/API boundary.

Existing kind/source filter selects and the multi-action design-system menu are
kept intact. If a future change touches one of those dropdown/menu surfaces, it
must add that surface's own local search and adjacent anchored full regex
builder in the same change; a shared builder or hidden state is not an
equivalent.

## Failure modes

- A daemon/API failure leaves the existing Library empty/error behavior in place;
  the route does not fabricate sample assets.
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
work. The route does not add a network source, fixture archive, catalog image,
or alternate asset store. Existing upload, raw-asset, project handoff and
destructive-provider boundaries remain the source of truth.

## Verification

Commit [`e4fcbfab1`](https://github.com/Ding-Ding-Projects/material-designer/commit/e4fcbfab1680cde38235d663bb21f499d2d998d0)
adds focused route, rail, render-seam, search-builder, accessibility and
hidden-flag source contracts. `scripts/verify-port.sh` and its JSON form both
reported zero gaps for the imported tree in the lane. The lane deliberately did
not run Node, package-manager commands, builds, type checks, tests, UI actions or
captures locally. Hosted verification, installed interaction, and a deterministic
provider/API-backed capture fixture remain pending.

## Suggested reading

- [../standards/regex-builder.md](../standards/regex-builder.md)
- [../standards/design-reference-parity.md](../standards/design-reference-parity.md)
- [web-runtime.md](web-runtime.md)
- [../api/README.md](../api/README.md)
