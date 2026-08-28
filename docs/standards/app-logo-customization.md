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
- Crop with numeric values, fit modes (contain, cover, and fill), focal point,
  safe-area preview, transparent background, and an infinite colour picker for
  an opaque background.
- Favicon, toolbar, title-bar, sidebar, and installer target previews.
- Local persistence, replacement, reset, and a failure path that keeps the
  previously valid selection active.
- A local search field with an adjacent anchored regular-expression builder.

The web application restores the selected mark before its first interactive
frame through `App.tsx`, and the existing home chrome consumes the bounded CSS
image variable. The navigation action and accessible name remain unchanged.
The app surface provides complete English and Hong Kong Cantonese copy, with
the other bundled locales using the normal canonical English fallback until
their catalogue supplies a translated logo namespace.

## Security and privacy

The upload is read locally and never sent to a server. The source path is not
stored. Only a bounded derived PNG data URL and presentation metadata are kept
in the private local store. No uploaded bytes, source path, custom mark, or
private cache is included in logs, telemetry, exports, history, captures, or
public records. The validator does not trust a file extension or MIME claim.

Custom marks do not alter the package identifier, executable name, installer
identity, update feed, application-data location, or code-signing state.

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
