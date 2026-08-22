# Design-reference parity

Material Designer treats `mockups/open-design-m3/Open Design M3.dc.html` as the
public-safe checked-in form of the user-supplied Material Design 3 redesign. The
private source archive is not copied into this public repository. Its account,
organization, repository, endpoint and internal-tool sample values are replaced
with fictional fixtures; those replacements are intentional deviations, not
visual licence to redesign the reference.

## Implementation

Commit [`8129ac77`](https://github.com/Ding-Ding-Projects/material-designer/commit/8129ac77)
introduced the first structural scaffold. The v0.20.2 migration exposed several
places where that scaffold had become stale or described stronger proof than it
actually supplied. The current version corrects the reference hash, records the
reference dependency hashes, and separates targets from evidence that has not
yet been captured.

- `tools/design-reference-app/main.mjs`, a developer-only Electron entry that
  renders the checked-in reference directly, resolves its React runtime from
  installed local packages and refuses unrelated network requests;
- `.codex/verification/design-parity/routes.json`, the hand-written list of ten
  required screen/state routes and the exact reference-control steps used to
  reach them;
- `.codex/verification/design-parity/inventory.json`, one explicit row per
  screen with matching reference/application tuples, complete deterministic
  inputs, per-control audit targets, raw/receipt/comparison/diff targets and
  reviewed deviations;
- `scripts/verify-design-parity.mjs`, which pins the exact ten route IDs,
  validates route protocols and query keys, checks immutable reference assets,
  rejects reused or escaping evidence targets, and uses stable failure codes in
  its structural negative mode.
- `design/apps/desktop/src/main/deterministic-parity-route.ts`, a pure,
  developer/capture-only parser for the normalized v2 tuple. Packaged startup
  passes only an explicitly enabled `material-designer://` argument through the
  Squirrel outer launcher, maps semantically owned rows to the real `od://app`
  router, and rejects unresolved rows with stable blocker codes rather than
  pretending that a similar page is the reference screen.
- `design/apps/desktop/src/main/runtime.ts`, which installs the frozen clock,
  seeded random source, motion policy and locale context before the real
  renderer's first document, bounds the capture viewport/device scale, blocks
  external network requests in an isolated capture session, suppresses the
  separate pet window, allows only the exact accepted `od://` route through
  both main-frame navigation events, rejects capture-mode external navigation,
  uses a forced capture root with a unique per-launch run lease, separate
  storage identity, evidence-retention retirement marker, and no ordinary
  existing-window or single-instance handoff. The run id is embedded in the
  sidecar namespace, stamps, IPC paths and renderer partition; lexical root
  checks lstat existing components and retirement is serialized and idempotent.
  Capture sidecars clear telemetry, provider, update, and proxy egress
  environment; both sidecars force manual redirects, reject non-loopback or
  credentialed final origins, and direct Vela requests refuse external capture
  traffic. Readiness stays false until that network audit is explicitly proven.
  A ready receipt is invalidated by renderer loss, failed main-frame load or an
  HTTP error document, which returns the hidden content to the capture-failure
  splash. It records a typed readiness receipt
  only after the canonical route
  URL/search, actual theme, viewport, device scale, bundled fonts,
  renderer-owned route witness, capture-settled witness, route-specific
  component invariant, mount state and capture network proof agree across a
  bounded stability interval and final route recheck. Every readiness
  evaluation and renderer operation has a main-process timeout. Screenshot,
  click, eval, capture-page and export RPCs share one predicate requiring a
  ready receipt, an installed receipt witness, and a revealed window; all
  refuse before that predicate is true. The capture prelude exposes a
  non-writable run id and does not mutate ordinary user localStorage.
  Capture also installs an explicit handler/process/environment inventory:
  agent detection and run/chat launch, Vela, connector, MCP, terminal and
  browser-session child paths receive fixture status or a structured refusal;
  the legacy payload handoff, native menus, diagnostics, invite protocol,
  folder/path/PDF/update side effects and standalone Next mode are disabled.
  Pre-readiness renderer loss and any other unready result keep live content
  hidden and show a self-contained capture-failure splash. The fixture/provider
  is intentionally absent today, and the sidecar boundary is source-only until
  hosted runtime proof, so the receipt remains `ready: false` until those
  product seams exist.
- `design/apps/packaged/src/protocol.ts`, which registers the packaged `od://`
  proxy on that same capture session, validates the exact loopback sidecar
  origin, blocks redirects in capture mode, preserves normal launch redirect
  behaviour, and returns an idempotent disposer for teardown.

The reference application now consumes that registry directly. It freezes the
clock, randomness and motion before page scripts execute, uses committed local
Roboto Flex, Roboto Mono and Material Symbols Rounded files, blocks unrelated
network requests, uses Chromium device scaling instead of renderer zoom, and
checks the measured viewport, device-pixel ratio and loaded fonts before it
reports readiness.

## Evidence boundary

The inventory is structurally complete and all ten rows are currently marked
`pending`. That is deliberate: source code and route strings do not prove
visual parity. The installed application now contains the strict tuple resolver
and capture startup context, but the default verifier still stops before capture
evidence. Only six rows currently have semantically identical production paths,
and none is runtime-ready for parity evidence yet: the real renderer witness
proves the route component, but ordinary daemon-backed data is detected and no
capture fixture/provider exists; the sidecar boundary is source-only until
hosted runtime proof.
Unexpected blocked requests also fail readiness. This is deliberate
fail-closed foundation status, not a visual-parity verdict. The runtime refuses
raw capture operations while that predicate is unready; no live-daemon screen
can be interacted with or promoted into parity evidence. Every capture run has a
unique lease beneath the forced capture root; the exact run is retired by a
marker while its evidence bytes remain retained for review, and a duplicate run
identity is rejected rather than reused.
The remaining rows are intentionally unresolved: `route.studio_unresolved` (no
production Studio route), `route.library_hidden` (the Library component is
hidden by its product feature flag), `route.settings_appearance_unresolved`
(the Settings page does not yet accept the appearance state from this route),
and `route.handoff_unresolved` (handoff is currently project/file-scoped rather
than a standalone destination). These are product-route blockers, not permission
to inject DOM or to label a different page as parity evidence. Dark presentation
is also fail-closed as `route.theme_dark_unresolved` because the product's
appearance state is currently light-only.

A row becomes verified only after the checked-in reference and real installed
Squirrel application are launched through the approved hidden-desktop route at
the exact same normalized tuple. Both raw captures and versioned receipts must
be retained and hashed; the receipts must record the exact route, measured
dimensions, device scale, semantic-state check, nonblank check, privacy check
and capture-tool provenance. A labelled comparison and machine-readable visual
diff must bind to the raw hashes, and a hand-reviewed audit must enumerate the
visible controls individually. The required matrix also covers light and dark,
normal and narrow layouts, 100/125/150/200% display scale, and bilingual copy.

Run the structural and negative checks with:

```text
node scripts/verify-design-parity.mjs --structure
node scripts/verify-design-parity.mjs --negative
```

The structural negative mode proves missing rows, registry routes, protocols,
query keys, every tuple field, both route-side tuple mismatches, audit/evidence
targets and deviation approval red then restored green with stable failure
codes. It does not claim that missing runtime artifacts have been captured.

After the production route, audits and evidence exist, omit `--structure`; the
default mode requires route implementation, every per-control audit, both raw
capture receipts, every artifact hash, source commit, matrix status, diff
metrics/provenance/review and verified row status.

## Failure modes

- Never replace a raw capture with a cropped, annotated or resized image.
- Never compare different themes, viewport sizes, display scales, locales or
  fixture revisions.
- Never treat the mockup's external-font convenience, private sample data,
  shared regex panel or unguarded destructive controls as behavior to port.
- Never call a row verified because its pixel metric is below a threshold;
  changed pixels remain visible and require review.

## Suggested reading

- [material-design-3.md](material-design-3.md)
- [accessibility.md](accessibility.md)
- [../release/release-pipeline.md](../release/release-pipeline.md)
