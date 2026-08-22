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

The reference application now consumes that registry directly. It freezes the
clock, randomness and motion before page scripts execute, uses committed local
Roboto Flex, Roboto Mono and Material Symbols Rounded files, blocks unrelated
network requests, uses Chromium device scaling instead of renderer zoom, and
checks the measured viewport, device-pixel ratio and loaded fonts before it
reports readiness.

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

The inventory is structurally complete and all ten rows are currently marked
`pending`. That is deliberate: source code and route strings do not prove
visual parity. The Studio row now has a source-level application route and
fixture provider, but the installed application has not yet been built and
captured at the declared tuple. The default verifier therefore still stops at
the remaining built-artifact/evidence boundary before accepting capture
evidence.

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
