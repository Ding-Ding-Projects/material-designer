# App-logo customization

The application and documentation site expose a local app-logo customization
surface. It changes the mark shown by the surface, not the stable identity used
by packaging, updates, storage, or diagnostics.

## What the surface provides

- Four bundled, project-appropriate presets.
- A semantic local file picker accepting static PNG, JPEG, and WebP input.
- Signature-first validation before a decoder is invoked.
- Bounds of 8 MiB input, 4096 pixels per side, 16 megapixels, one frame, and
  2 MiB converted output.
- Rejection of malformed, animated, unsupported, over-sized, and
  decompression-bomb-shaped input without partially applying it.
- Local conversion to a validated PNG with signature, dimension, alpha, and
  decoder round-trip checks.
- Complete PNG chunk order and CRC checks, JPEG segment framing and EOI checks,
  and RIFF/WebP chunk and image checks before decoding.
- Crop with numeric values, fit modes (contain, cover, and fill), focal point,
  safe-area preview, transparent or animated-rainbow background, and an
  infinite colour picker for an opaque background. Rainbow is a sentinel with
  one global speed level and settles to one hue when reduced motion is active.
- Favicon, toolbar, title-bar, sidebar, and installer target previews.
- Target-specific derived PNGs are generated with the selected crop, fit, focal
  point, safe-area, background, and transparency choices, and each variant is
  independently signature- and decoder-validated. A render-options fingerprint
  refreshes the bounded variants after later editor changes, with cancellation
  of superseded generations so stale output never replaces the latest choice.
- Local persistence, replacement, reset, and a failure path that keeps the
  previously valid selection active. The application mirrors the validated
  presentation state through daemon `app-config.json`, so the existing local
  Git-backed append-only settings history captures logo changes. The history
  manager can browse, search, diff, restore, and label those settings commits;
  restoring creates a new commit, while source bytes, source paths, and
  credentials remain excluded.
- Versioned appearance JSON export/import with unknown-schema refusal and a
  bounded local schedule editor that applies temporary presets in the local
  timezone without rewriting the base selection. Rules store local wall-clock
  values together with their IANA timezone, so daylight-saving transitions do
  not reinterpret a saved clock time through the host timezone. Rules have labels, enabled
  state, start/end, weekdays, timezone, edit and delete actions, and capture
  every exposed logo value. Every persisted custom state
  must include all five target variants; malformed or incomplete cached variants
  are rejected as one state rather than partially applied.
- A wall-clock time that is skipped by a daylight-saving transition never
  matches. A repeated wall-clock time matches for both occurrences because
  matching is against the rule timezone's displayed wall clock, not a host
  instant guessed during authoring.
- Appearance export and import share one 16 MiB transfer bound, large enough
  for the bounded eight MiB derived-output aggregate plus JSON framing while
  still refusing unbounded payloads.
- A local search field with an adjacent anchored regular-expression builder.
- The command palette owns a live preset selector for this setting, so changing
  the mark from the palette and from Settings reaches the same persisted state.
- The canonical validated source is retained only in the private bounded cache,
  while daemon app-config history and appearance exports receive a redacted
  derivative-only state. Later editor changes regenerate every target variant
  from that source, never from a prior derivative.

The web application restores the selected mark before its first interactive
frame through `App.tsx`, and the existing home chrome consumes the bounded CSS
image variable. The navigation action and accessible name remain unchanged.
The app surface provides complete English and Hong Kong Cantonese copy, with
the other bundled locales using the normal canonical English fallback until
their catalogue supplies a translated logo namespace.

## Security and privacy

The upload is read locally and never sent to a server. The source path is not
stored. Only bounded validated source and derived PNG data URLs plus
presentation metadata are kept in the private local cache. The original source
is retained only to regenerate derivatives after later edits, and is stripped
before app-config history, export, logs, telemetry, captures, or public records.
The validator does not trust a file extension or MIME claim.

The Day Teet Hui keeps its own metadata-only local history manager in browser
storage. It can browse, search, restore safe presentation settings, and require
history acknowledgement before reporting a logo mutation as complete. Because
the browser surface cannot own the app's Git directory, restoring a deleted
custom source never invents image bytes; it restores only settings still
available in the current private cache.

Custom marks do not alter the package identifier, executable name, installer
identity, update feed, application-data location, or code-signing state.
Source format, metadata, profile, transparency, and crop loss are disclosed
before the converted mark becomes active; the source file remains unchanged.

## Failure behavior

Validation errors are shown inline with a next action. A decoder or conversion
failure leaves the previous valid mark active. If browser storage is unavailable,
the current selection remains active for the session without claiming durable
persistence. Unsupported properties remain visible with an explanation rather
than being silently discarded.

## Verification

The source contract is covered by:

- `design/apps/web/tests/state/logoCustomization.test.ts`, which verifies the
  signature-first parser, bounds, animated-input refusal, and state
  normalization.
- `design/apps/web/tests/components/AppLogoCustomization.contract.test.ts`,
  which verifies the hand-written surface inventory and local-only boundary.
- the site `data-logo-customization` surface, wired to
  `site/assets/js/logo.js`, which uses the same signature and conversion
  boundaries.

The real packaged desktop interaction, every-click capture ledger, and
display-target inspection remain release-lane evidence. They must be recorded
against the exact packaged commit before this feature is promoted from source
implemented to verified.

## Suggested articles

- [appearance-customization.md](appearance-customization.md)
- [local-assets.md](local-assets.md)
- [accessibility.md](accessibility.md)
- [ui-drive-evidence.md](ui-drive-evidence.md)
