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
actually supplied. The current version corrects the reference hash, records an
exact ordered manifest for all seven checked-in reference dependencies, rejects
filesystem indirection before opening any of them, and separates targets from
evidence that has not yet been captured.

- `tools/design-reference-app/main.mjs`, a developer-only Electron entry that
  renders the checked-in reference directly, resolves its React runtime from
  installed local packages and refuses unrelated network requests;
- `.codex/verification/design-parity/routes.json`, the hand-written list of ten
  required screen/state routes and the exact reference-control steps used to
  reach them;
- `.codex/verification/design-parity/inventory.json`, one stable base row per
  screen plus six explicit presentation bindings under every row. The 60
  bindings retain the base row identity while each owns an exact tuple, pair ID,
  reference and application route, audit target, seven evidence targets, pending
  statuses and reviewed deviations;
- `scripts/verify-design-parity.mjs`, which pins the exact ten route IDs,
  validates route protocols and query keys, checks immutable reference assets,
  rejects reused or escaping evidence targets, and uses stable failure codes in
  its structural negative mode.
- `tools/design-reference-app/parity-route-contract.mjs`, the shared deterministic
  route contract used by the reference launcher and the future product adapter.
  It accepts only the exact ordered tuple query, resolves all ten destinations to
  canonical browser paths, resolves by both row ID and presentation ID across all
  60 pairs, and emits pair-bound route identity plus capture-isolation metadata
  compatible with the per-click receipt shape. The reference launcher loads the checked-in reference
  file directly and publishes a non-writable route witness; it does not copy the
  reference into another fixture.
- `.codex/verification/design-parity/routes.schema.json` and
  `.codex/verification/design-parity/inventory.schema.json`, the machine-readable
  schemas for route identity, capture isolation, audit requirements, evidence
  targets, and the ten-row by six-presentation hand-written inventory. All 60 statuses intentionally
  remain pending until the hosted build and real captures exist.
- `scripts/test-design-parity-contract.ps1`, a pure PowerShell source and registry
  check that watches deliberate red then restored green mutations for missing rows,
  detached or commented route registration, duplicate paths, stale references,
  tuple mismatches, unbound time or randomness, capture policy, audit requirements,
  evidence targets and hashes, image inspection, and deviation review. It does not
  start Node, build the product, create captures, or claim visual parity.
- `scripts/strict-json.mjs`, which rejects duplicate keys, unsafe object keys,
  unknown trailing content, oversized strings, lists, object keys and numbers,
  excessive nesting, and malformed JSON before a parity registry is trusted. Its
  recursive schema validator resolves local `$ref` entries and enforces every
  nested type, required field, constant, enum, range, pattern, list and
  `additionalProperties` boundary. The reference launcher, shared route contract
  and verifier all use this one loader; neither launcher source contains a raw
  `JSON.parse` registry path.
- `scripts/design-parity-production.mjs`, which validates both complete registry
  schemas and pins the canonical HTML plus `support.js`, both local SVGs, the
  deterministic font stylesheet and all three local font binaries. It walks every
  existing path component, rejects symbolic links, junctions, mount points and
  lexical-versus-realpath indirection, then hashes the regular file before the
  reference or a dependency can be loaded.
- `scripts/design-parity-png.mjs`, a bounded PNG decoder used by the evidence
  validator. It checks the signature, IHDR placement and length, recognized
  critical chunks, palette and transparency ordering, contiguous IDAT chunks,
  every chunk bound and CRC, the exact decompressed scanline ceiling before
  inflation, every filter, every palette index, IEND and trailing bytes. Indexed
  zero-alpha pixels are blank. Receipt booleans and tool names cannot substitute
  for those checks. `scripts/test-design-parity-evidence.mjs` exercises forged,
  transparent indexed, bad-CRC, missing-IEND, unknown-critical-chunk, palette
  size/order, transparency order, split-IDAT, invalid-filter, trailing-data,
  inflate-bomb and late-palette-index boundaries without writing a capture file.
- `scripts/design-parity-evidence-contract.mjs`, the production receipt schema and
  validator used directly by the verifier and hosted Node contract check. It
  validates every nested receipt object, binds row ID, presentation ID, pair ID,
  source and artifact commits, route,
  tuple, PNG hash and dimensions, original-image inspection, tool provenance,
  fixture path/revision/hash, and the complete 21-field renderer witness. The test
  imports this helper rather than keeping a smaller second receipt validator.
- `.codex/verification/design-parity/application-artifact-manifest.schema.json`,
  the closed version-1 contract for a future packaged application artifact. Each
  pending row-presentation pair names its own manifest target, while the manifest binds the row,
  presentation and pair identities plus the explicit
  intended source commit, built-from commit, canonical evidence-root artifact
  path, SHA-256, byte count, `open-design-packaged-app` package identity, version,
  `x64` architecture, and build-provenance path/hash. Structure mode requires the
  target and executable schema but does not require a manifest file while a row is
  pending.
- `validateApplicationArtifactEvidence`, the production filesystem admission
  helper. Full evidence verification uses it to require the manifest, artifact and
  provenance as reparse-safe regular files beneath `.codex/verification/evidence/`,
  recomputes both hashes and the artifact byte count, and rejects unavailable or
  incomplete provenance. Accepted provenance must name the same source commit and
  package, carry a valid UTC build time, prove clean output, and prove that signing
  inputs were cleared, certificate discovery was disabled, process auditing was
  complete, no signer ran, and all three signing controls remained false. Its
  build log must be a nonempty regular file beneath the exact
  `.codex/verification/evidence/application-artifact/logs/` root, use a `.log`
  filename, remain at most 16 MiB, and match the provenance path, SHA-256 and byte
  count. The verified log binding is returned with the application-artifact
  evidence and is mandatory in the application receipt expectation and receipt.
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

  This bounded evidence-foundation preparation deliberately does not modify the
  shared desktop runtime seam. The renderer-owned readiness witness graph still
  needs the recursively frozen `globalThis.__MATERIAL_DESIGNER_DEEP_FREEZE__`
  consumer before application routing can be marked implemented. The source
  contract reports that exact boundary as `pending-shared-seam` while
  `applicationImplementation.status` remains `unimplemented`, and requires the
  deep-freeze consumer as soon as that status changes.
- `design/apps/packaged/src/protocol.ts`, which registers the packaged `od://`
  proxy on that same capture session, validates the exact loopback sidecar
  origin, blocks redirects in capture mode, preserves normal launch redirect
  behaviour, and returns an idempotent disposer for teardown.

The reference application now consumes the recursively validated registries
directly. It verifies the exact reference and dependency hashes before load,
freezes the clock, randomness and motion before page scripts execute, uses
committed local Roboto Flex, Roboto Mono and Material Symbols Rounded files,
blocks unrelated network requests, uses Chromium device scaling instead of
renderer zoom, and checks the measured viewport, device-pixel ratio and loaded
fonts before it reports readiness.

Unexpected blocked resources are a failed capture, not a successful offline
substitution. The reference launcher classifies the explicitly allowlisted local
script substitutions first, then records every other blocked request with its URL
and resource type and refuses to publish a ready or capture-settled result. The
network and witness probe covers blocked script, stylesheet and image requests.
The renderer derives the current route from the visible header landmark declared
for each hand-written route. It recursively freezes the tuple, nested viewport,
identity, observed route, exact reference path/hash, renderer witness,
capture-settled witness and published snapshot. The main process reads that state
twice instead of injecting it. The production readiness and post-settle helpers
compare the route ID/path/state, fixture path/revision/hash, tuple, network state,
freeze results and every one of the 19 fixed witness fields before any readiness
output.

The production application now has the first capture-only application route:
the desktop foundation owns the raw `material-designer://studio` launch
address and translates it to the exact canonical
`od://app/projects/fixture-studio-project/conversations/fixture-studio-conversation/files/orders-dashboard.html`
renderer handoff. The renderer accepts only that canonical path, the exact
tuple query, and the desktop-owned frozen tuple witness. The accepted route activates a
public-safe fixture provider and resolves to the ordinary concrete project,
conversation, and file route. The provider feeds the existing project,
conversation, message, run, project-file, tab, and live-artifact request seams;
the production `ProjectView`, `ChatPane`, `FileWorkspace`, and `FileViewer`
therefore render the fixture. Its declared `orders-dashboard.html` selection
is applied only during initial route hydration. File refreshes, project
switches, and later tab changes do not select a file implicitly. The provider
also rejects external network requests, intercepts only the fixture's `/api/`
seams, leaves browser-managed bundled assets outside the scripted fetch seam, and
accepts only the exact `od:` renderer origin or a separately validated HTTP loopback
API origin. A scripted fetch from a capture-shaped location is refused rather than
forwarded to the ordinary network path. The provider stays bound to the fixture project and conversation while
the user explicitly changes among the three known files. Its live-artifact
preview uses a direct-loadable fixture transport, and refresh returns the real
`{ artifact, refresh }` consumer envelope. The renderer publishes
`data-od-renderer-route-path`, `data-od-renderer-route-state`,
`data-od-fixture-source`, and `data-od-fixture-revision` witnesses for the
desktop readiness receipt. The fixture config is explicit and contains no local
credentials, account identity, customization, or telemetry consent; analytics
and direct error buffers are disabled for the capture lifetime. The provider is
inactive for ordinary routes. This is source-level route readiness only: no
hosted build, installed capture, or provider reachability is claimed here.

The fixture boundary is session-scoped as well. A canonical renderer handoff
must carry the desktop-owned per-run capture identity and exact tuple witness;
queryless file continuations are accepted only while that same identity and
witness remain live. Fixture runs, messages, versions, live-artifact scopes and
text previews use finite public IDs and declared project/conversation query
scopes; foreign or malformed values return structured 404/400 responses rather
than falling through to a live daemon or an internal error. The hand-written
fixture consumer manifest covers Vela status (including refresh), AMR models,
the complete version response and the empty `providers` object. Capture
appearance and language settings are forced from the tuple/fixture presentation
in per-run storage, config and provider writes are suppressed, and the direct
artifact data preview carries a bounded reload identity so refreshes cannot
reuse stale bytes.

The lifecycle is fail-closed in both directions. Any address with the canonical
fixture path but a missing, malformed, stale, or mismatched tuple/run witness
publishes an explicit capture-refused/unready state and installs a refusal fetch
boundary; it never falls through to the ordinary daemon or browser fetch. Once a
valid session leaves the launch URL, only its validated queryless project,
conversation, and known-file continuation remains active. Leaving that location
disposes the fixture provider, clears readiness and renderer data attributes,
rehydrates ordinary language/configuration/appearance state, and resumes the
ordinary active-context write. While capture is locked, language, funny-level,
appearance, config, host-scale, analytics, and error-context setters return before
mutating live React, module, DOM, or host state. Project-tab localStorage and wall
clock timestamps are bypassed for the session, with the frozen fixture time and a
run-scoped request namespace used instead. Direct artifact previews require the
current session plus the matching project, conversation, artifact, and creating
run witness; matching IDs on an ordinary route return no preview.

The lifecycle lease is generation-scoped. Reserved fixture-shaped `od://`
paths are recognized before route or live-fetch resolution, including cold
malformed query and port variants. Every delayed fixture request rechecks its
run, generation, and route lease after body parsing. Fetch decoration uses a
token-owned multiplexer so fixture, analytics, and one-shot request-ID teardown
restores the exact ordinary predecessor in any order. Analytics rehydrates its
ordinary consent, client, headers, identity and exception context after a
capture exit even when locale and version are unchanged. Project display,
coalesced project reads, runtime version reads, and every tab cache operation
are partitioned by lifecycle namespace; refused capture reads use safe defaults
and writes/removals are inert. Artifact preview memo keys include session,
creating run, timestamps, status, and entry identity. Hosted typecheck, built
rendering, installed launch, and visual parity evidence remain pending.

The capture storage inventory is hand-written and complete: composer drafts,
queued sends, todo/continued state, chat-panel width, Designs mode, run-turn
state, App session state, analytics identity/session state, onboarding state,
appearance preferences/presets/recent colors, project tabs, and every
fixture-mounted store are listed. Capture reads return safe defaults; writes
and removals are inert or use the run/refusal namespace, while ordinary mode
continues to use its existing storage.

## Evidence boundary

The inventory is structurally complete and all 60 row-presentation bindings are
currently marked `pending`. The ten base rows remain stable summary identities;
they do not stand in for the other 50 presentation bindings. That is deliberate:
source code and route strings do not prove
visual parity. The installed application contains the strict tuple resolver and
capture startup context, but the default verifier still stops before capture
evidence. Six rows have production route paths, yet they still detect ordinary
daemon-backed data and do not have deterministic screen fixtures. The Studio
row now has a source-level application route and fixture provider, but the
desktop route resolver has not integrated that destination and no installed
build has been captured at the declared tuple. Library, Appearance, and Handoff
also have real source destinations now, while their capture-route mappings
remain fail-closed and unresolved.

Every binding owns separate reference and application receipt targets. The
receipt contract requires the row ID, presentation ID, pair ID, exact route and
exact tuple together; a receipt from another presentation is refused even when
its base row is the same. Focused source checks exercise 60 reference and 60
application receipt shapes, and deliberately cross-bind one before restoring the
correct pair. These checks prove admission structure only and create no evidence.

Unexpected blocked requests fail readiness. This is deliberate foundation
status, not a visual-parity verdict. The runtime refuses raw capture operations
while the predicate is unready; no live-daemon screen can be interacted with or
promoted into parity evidence. Every capture run has a unique lease beneath the
forced capture root; the exact run is retired by a marker while its evidence
bytes remain retained for review, and a duplicate run identity is rejected
rather than reused. Dark presentation also remains fail-closed as
`route.theme_dark_unresolved` until the product and route fixture can prove it.

A row-presentation binding becomes verified only after the checked-in reference and real installed
Squirrel application are launched through the approved hidden-desktop route at
the exact same normalized tuple. Both raw captures and versioned receipts must
be retained and hashed; the receipts must record the exact route, measured
dimensions, device scale, semantic-state check, nonblank check, privacy check
and capture-tool provenance. A labelled comparison and machine-readable visual
diff must bind to the raw hashes, and a hand-reviewed audit must enumerate the
visible controls individually. The required matrix also covers light and dark,
normal and narrow layouts, 100/125/150/200% display scale, and bilingual copy.
Full verification additionally requires exactly one explicit
`--intended-source <40-character SHA>` argument. That SHA must resolve through
`git rev-parse --verify <sha>^{commit}` to the exact commit object, equal `HEAD`,
equal the row's `sourceCommit`, equal the manifest's intended and built-from
commits, and equal both application and reference receipt source fields. A
40-character string, tag object, older commit, stale row SHA, or artifact built
from another commit is refused before evidence can be promoted.
The production helper opens and hashes the provenance build log through the same
reparse-safe pinned-file resolver as the manifest, application artifact and
provenance file. A missing log, changed bytes, stale hash, wrong byte count,
noncanonical path, path escape, junction or symbolic-link ancestor, omitted
receipt expectation, or mismatched receipt log binding is refused.

Run the structural and negative checks with:

```text
node scripts/verify-design-parity.mjs --structure
node scripts/verify-design-parity.mjs --negative
```

The project-local boundary keeps ordinary Node execution on the hosted Windows
route. That hosted route also runs the direct production-helper checks:

```text
node scripts/test-design-parity-strict-json.mjs
node scripts/test-design-parity-network-witness.mjs
node scripts/test-design-parity-evidence.mjs
```

On a local Windows checkout, the permitted source/registry contract runs under
both Windows PowerShell 5.1 and PowerShell 7:

```text
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-design-parity-contract.ps1
pwsh.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-design-parity-contract.ps1
```

Those checks do not build, launch, capture, or promote evidence.

After all rows have real evidence, full verification uses the reviewed commit:

```text
node scripts/verify-design-parity.mjs --intended-source <exact-HEAD-commit>
```

The structural negative mode proves missing rows, registry routes, protocols,
query keys, every tuple field, both route-side tuple mismatches, audit/evidence
targets, receipt targets, missing variants, duplicate pairs, tuple drift, route
drift, base-only coverage and deviation approval red then restored green with stable failure
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
