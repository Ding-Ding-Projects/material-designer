# App-logo customization

The application and documentation site have source-ready local app-logo
customization modules. The feature changes the mark shown by a surface, not the
stable identity used by packaging, updates, storage, or diagnostics. The
feature is not mounted yet: C0 still owns the application, locale, daemon,
chrome, palette, and documentation-site registration seams.

## What the surface provides

- Four bundled, project-appropriate presets.
- A semantic local file picker accepting static PNG, JPEG, and WebP input.
- Signature-first validation before a decoder is invoked.
- Bounds of 8 MiB input, 4096 pixels per side, 16 megapixels, one frame, and
  2 MiB converted output.
- Rejection of malformed, animated, unsupported, over-sized, and
  decompression-bomb-shaped input without partially applying it.
- Local conversion to a validated PNG with signature, dimension, alpha, and
  decoder round-trip checks. Decode and rasterization run in a terminable
  isolated worker with a hard timeout, so a stalled decoder cannot hold the
  page thread or survive a cancelled generation. Each request carries a
  monotonically increasing request ID, and late responses are ignored.
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
  previously valid selection active. The feature-owned store records the
  validated presentation state and exposes a host bridge contract for the
  daemon `app-config.json` and existing local Git-backed append-only settings
  history. Those app integrations are prerequisites owned by C0 and are not
  mounted in this leaf. When C0 supplies the real bridge, it receives a
  monotonically increasing mutation request `{ sequence, state, signal }`; the
  bridge must reject stale sequences and honor the signal so an older
  acknowledgement cannot overwrite a newer choice. A mount without a
  real bridge does not register a success callback or claim daemon persistence.
  Source bytes, source paths, and credentials remain excluded.
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
- The source exposes a live preset-selector contract for the command palette, so
  C0 can make palette and Settings changes reach the same persisted state. The
  palette registration is not mounted in this leaf.
- The canonical validated source is retained only in the private bounded cache,
  while daemon app-config history and appearance exports receive a redacted
  derivative-only state. Later editor changes regenerate every target variant
  from that source, never from a prior derivative.

The recovered modules do not alter `App.tsx`, locale dictionaries, daemon
configuration, chrome styles, palette registration, or `site/index.html`.
Those mounting and global-copy changes remain unmounted C0 work. The feature
source supplies a typed `LogoCopy` contract and one shared external state
store, so C0 can connect all required surfaces without making each host invent
a separate store. The C0 owner has priority over C1 and C4 when more than one
mount supplies a bridge. Initial uploads, derivative refreshes, every editor
action, schedule-driven selection, and daemon acknowledgements carry generation
and cancellation guards. The documentation-site first upload calls the same
`supersedeConversions` authority used by derivative refresh, assigns its upload
generation from that returned intent generation, and applies only the first
valid result. Persistence refusal leaves the newest in-memory choice
authoritative while reporting that durable storage is unavailable.

The React surface exposes one state-and-callback contract for its three host
seams, `C0`, `C1`, and `C4`. `LogoCustomizationC0`, `LogoCustomizationC1`, and
`LogoCustomizationC4` are explicit wrappers over the same component, and the
rendered section carries `data-logo-mount-point` so a host can verify which
seam mounted it without creating a second store.

## Index handoff

The central index is intentionally outside this lane. C0 should add this exact
row to `docs/standards/README.md` under **The sixteen numbered standards**:

`| [app-logo-customization.md](app-logo-customization.md) | Local app-logo presets, validated custom upload, safe conversion, target previews, schedules, and stable identity boundaries. |`

## Security and privacy

The upload is read locally and never sent to a server. The source path is not
stored. Only bounded validated source and derived PNG data URLs plus
presentation metadata are kept in the private local cache. The original source
is retained only to regenerate derivatives after later edits, and is stripped
before app-config history, export, logs, telemetry, captures, or public records.
The validator does not trust a file extension or MIME claim.

The documentation-site module keeps metadata-only history records in browser
storage when its host mounts it. It can browse, search, restore safe presentation
settings, and require history acknowledgement before reporting a logo mutation as
complete. Its source module remains unmounted until C0 and C12 connect the site
shell and global registration. Because the browser surface cannot own the app's
Git directory, restoring a deleted custom source never invents image bytes; it
restores only settings still available in the current private cache.

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
- `site/assets/js/logo.js` and its decoder worker, which are source-ready but
  remain unmounted until the C0 and C12 registration lanes connect them to the
  documentation-site shell.

The app/daemon/CSS/palette integration, global locale registration, documentation
site main wiring, real packaged interaction, every-click capture ledger, and
display-target inspection remain open. They must be recorded against the exact
packaged commit before this feature is promoted from source-ready to mounted or
verified.

## Suggested articles

- [appearance-customization.md](appearance-customization.md)
- [local-assets.md](local-assets.md)
- [accessibility.md](accessibility.md)
- [ui-drive-evidence.md](ui-drive-evidence.md)
