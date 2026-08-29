# Full UI drive and per-interaction capture evidence

This project fails closed on UI interaction evidence. Source code, a component test,
a filename list, a copied image, or a handwritten success flag cannot prove that a
packaged application exposed a feature or reached an expected state.

## Honest current state

The committed ledger is empty. No receipt, image, capture-run manifest, artifact,
artifact provenance record, or every-element audit from a real current build is
checked in or claimed by this work. The scene registry contains zero captured
scenes. Feature and destination rows remain `absent`, `unreachable`, or `partial`
until real evidence is produced and the complete chain verifies.

The committed live-driver registry is also empty. The production entry was
source-tested against an unreachable scene and returned `structural-only` before
resolving or invoking the driver. It created no evidence root and changed no ledger
bytes. No live driver run occurred.

The scripts include disposable test fixtures. Each fixture creates a temporary Git
repository, temporary records, and a small test PNG, exercises deliberate failures,
and deletes the fixture. Those files are tests of the validator, not product evidence,
and never enter the committed ledger.

## Authoritative files

| File | Purpose |
| --- | --- |
| `.codex/verification/ui-drive/authority.json` | Separate hand-written authority for exactly 30 feature IDs, 2 surface IDs, 10 destination IDs, and 70 scene IDs. |
| `.codex/verification/ui-drive/authority.schema.json` | Bounded draft-2020-12 schema for the authority. The scene verifier also checks an independent canonical-content digest, so matching edits to the authority and data files still fail. |
| `.codex/verification/ui-drive/inventory.json` | Hand-written per-surface feature, destination, and interaction inventory. |
| `.codex/verification/ui-drive/inventory.schema.json` | Strict bounded draft-2020-12 inventory schema. |
| `.codex/verification/ui-drive/scene-registry.json` | Hand-written 70-scene registry, with 60 feature scenes and 10 desktop destination scenes. |
| `.codex/verification/ui-drive/scene-registry.schema.json` | Strict scene, capture tuple, input, semantic, and network-isolation schema. |
| `.codex/verification/ui-drive/click-receipt.schema.json` | Version 3 receipt schema for one feature or destination interaction. |
| `.codex/verification/ui-drive/artifact-provenance.schema.json` | Artifact hash, byte count, builder, real Git commit, and exact intended-commit policy. |
| `.codex/verification/ui-drive/capture-run.schema.json` | Approved-driver run and session identity, process-image hash, window facts, action, every semantic poll, original image, and receipt binding. |
| `.codex/verification/ui-drive/every-element-audit.schema.json` | Exact surface, scene, build, run, element count, route, and original-image inspection audit. |
| `.codex/verification/ui-drive/approved-output-manifest.schema.json` | Fixed receipt-backed allowlist for eight outputs, including live-origin and driver-transcript records. |
| `.codex/verification/ui-drive/live-driver-registry.json` | Hand-written live automation bindings. It is intentionally empty while every scene is unreachable. |
| `.codex/verification/ui-drive/live-driver-registry.schema.json` | Strict binding contract for target selection, window identity, action input, semantic probes, and the every-element audit probe. |
| `.codex/verification/ui-drive/driver-transcript.schema.json` | Bounded per-call hashes for the fixed cheap headless executable and same-session nonce digest. |
| `.codex/verification/ui-drive/live-origin.schema.json` | Live-only origin binding helper sources, executable, transcript, process, window, action, polls, fresh image time, and replay key. |
| `.codex/verification/ui-drive/ledger.json` | Honest empty version 2 durable append-only ledger. |
| `.codex/verification/ui-drive/ledger.schema.json` | Full row identity contract, including every source, artifact, run, audit, image, action, semantic, tuple, and network field. |
| `scripts/ui-drive-evidence-lib.ps1` | PS5.1-compatible strict JSON admission, draft-2020-12 validation, path, Git-object, digest, tuple, and sharing-retry primitives. |
| `scripts/run-approved-ui-drive-live.ps1` | Sole production entry that imports and calls the live-origin module. |
| `scripts/ui-drive-live-origin.psm1` | Owns the private in-process capability, driver lifecycle, dynamic target facts, action, polls, image, private writer, append, and revocation. |
| `scripts/ui-drive-lowlevel-stdin-bridge.ps1` | Bounded stdin bridge that derives the one fixed approved cheap executable from the known Documents location and invokes only allowlisted tools in a minimal environment. |
| `scripts/verify-ui-drive-live-origin-source.ps1` | AST proof for the production import, call, private writer, capability checks, revocation, bridge, fixed executable, and static refusal. |
| `scripts/validate-ui-drive-receipt.ps1` | Revalidates one complete evidence chain from original bytes. |
| `scripts/append-ui-drive-ledger.ps1` | Public static append refusal. It cannot write a verified row. |
| `scripts/verify-ui-drive-evidence.ps1` | Revalidates static structure, but returns structural-only for any nonempty ledger and never promotes live origin. |
| `scripts/verify-ui-drive-scenes.ps1` | Proves exact authority, inventory, registry, tuple, network, and captured-status alignment. |
| `scripts/inspect-ui-drive-image.ps1` | Bounds bytes, dimensions, and decoded pixels; validates PNG structure; rejects text metadata and uniform images; and decodes the original image. |
| `scripts/run-ui-drive-privacy.ps1` | Reads only the fixed approved-output manifest, bounds all text, checks every record, rejects PNG text metadata, optionally checks private vocabulary through in-memory digest-derived rules, and emits aggregate counts only. |
| `scripts/test-ui-drive-live-origin-negative.ps1` | Live-origin negatives for manual promotion, replay, freshness, process, window, action, polls, nonce, executable, capability injection, environment injection, and helper detachment. |

## Strict JSON and schema admission

Every evidence JSON file is admitted before `ConvertFrom-Json` runs. The admission
parser rejects duplicate keys, including escaped duplicates, unsafe object keys,
invalid syntax, trailing content, excessive byte size, nesting depth, string length,
array length, and object-property count. Only then does the draft-2020-12 validator
execute the schema constraints used by the evidence contracts, including local
references, types, required and unknown properties, constants, enums, patterns,
numeric and collection bounds, uniqueness, and composition keywords.

The inventory, scene registry, live-driver registry, ledger, receipt, artifact
provenance, capture-run, driver transcript, live-origin record, every-element audit,
approved-output manifest, and separate authority are all schema-validated. Merely
declaring a `$schema` field does not count as validation.

## Canonical identity authority

The authority file is deliberately separate from both the inventory and scene
registry. It fixes the complete identity lists independently. The verifier checks
the exact authority contents against a digest stored in executable source and then
compares every list and row against the authority.

This catches the dangerous coordinated edit where a feature ID is removed or renamed
in the declared list, both surfaces, and every matching scene at once. Empty lists,
renames that retain the original name as a substring, CRLF variants of a mutated
authority, and replacement of the whole authority all turn the focused tests red.

## Receipt and provenance chain

A version 3 receipt binds exactly one `featureId` or `destinationId`, never both.
The chain includes:

- a full `sourceCommit` that resolves to a real commit in this repository and is an
  ancestor of the verification `HEAD`;
- an artifact whose `builtFromCommit` and provenance `intendedSourceCommit` exactly
  equal `sourceCommit`;
- the artifact path, byte count, SHA-256, provenance path, and provenance SHA-256;
- one capture-run manifest generated inside the active live orchestrator process;
- one live-origin record and one driver transcript binding the current orchestrator,
  private module, stdin bridge, fixed cheap executable path digest and hash, and
  same-session nonce digest;
- run and session IDs, target process ID, exact process-image path and SHA-256,
  window class, title, and nonzero dimensions;
- the exact action, target, accessible name, input method, and ordered semantic polls;
- the complete scene tuple, including the ordered `allowedOrigins` list;
- one bounded original PNG with byte, dimension, pixel, hash, format, and content
  verdicts recomputed by the independent inspector;
- one every-element audit with equal required, audited, and element-row counts and
  an empty missing-element list;
- one fixed manifest containing exactly eight approved kinds: receipt, image, artifact,
  artifact provenance, capture run, every-element audit, live origin, and driver
  transcript.

The fixed evidence namespace is deterministic:

```text
receipts/<receipt-id>.json
runs/<run-id>.json
audits/<audit-id>.json
origins/<origin-id>.json
transcripts/<transcript-id>.json
images/<run-id>/<sequence>-<scene-id>.png
artifacts/<artifact-sha256>/<process-image-name>
provenance/<artifact-sha256>.artifact-provenance.json
manifests/<receipt-id>.approved-outputs.json
```

Repository screenshots, paths outside the canonical evidence root, arbitrary output
lists, source previews, mocks, repeated scenes, copied receipts, self-authored approval
booleans, serialized capabilities, environment-provided capabilities, and stale hashes
are refused.

Static JSON can prove only structure. It cannot mint the nonserializable capability,
cannot satisfy reference equality with the module's active object, cannot know the live
nonce held by that process, and cannot call the private writer. Static receipt validation
therefore reports `STRUCTURAL_ONLY`, and public static append always refuses.

## Live-only origin path

The production entry imports one module and calls one exported orchestrator function.
The module first checks the committed scene and live-driver registry. An unreachable
scene returns structural-only before resolving the driver, creating an evidence root,
or starting a child process.

For a future capture-ready scene with one committed binding, the module:

1. creates a random 32-byte nonce and a private object capability;
2. resolves the approved executable from one fixed path derived from the operating
   system's known Documents folder, never from `PATH`, an argument, or an environment
   override;
3. starts the fixed stdin bridge with a minimal environment;
4. launches the exact artifact on a hidden desktop and resolves exactly one current
   process window by PID, class, title, and nonzero dimensions;
5. delivers the committed action and input through the cheap headless driver;
6. collects bounded semantic poll samples and every-element data from the live renderer;
7. requests the original PNG from the same target window and rejects an old, replayed,
   later-touched, mismatched, or out-of-window timestamp;
8. verifies bridge, driver, transcript, process, window, action, poll, image, nonce,
   capability, and source hashes;
9. passes only the private live object and private capability to the unexported writer;
10. writes the eight-file bundle, privacy-checks it, atomically appends the row, and
    revokes and clears capability material in `finally`.

## Captured status

Scene status is no longer permanently forced to `unreachable`.

- `unreachable` has no receipt and no ledger row.
- `partial` may be capture-ready and may be used while the append is being staged, but
  it does not satisfy final evidence verification.
- `verified` can be established only by the live orchestrator while its private
  capability is active.

Static verification never promotes the registry or inventory. A nonempty ledger is
reported structural-only outside the originating live process. The current committed
ledger has zero rows, every scene remains unreachable or partial, and no verified claim
exists.

## Durable append behavior

Only the unexported live writer may append evidence. It requires object reference
equality with the module's active capability, the same live nonce, a non-consumed
session, verified driver and transcript facts, exact process and window identity,
the committed action, matching bounded polls, and an image written during that run.
The public append script contains only a refusal.

The writer validates the candidate, flushes it to disk, and uses atomic replacement.
Windows sharing violations receive a bounded retry. A backup is retained until the
replacement is reopened, hashed, schema-validated, and every receipt chain is checked
again. If final verification fails, the backup is restored atomically. A refused or
corrupt append leaves the previous ledger bytes unchanged.

## Path and privacy boundaries

Every existing component of every evidence read or write path is checked. A symlink,
junction, or other reparse component in the evidence root, an ancestor directory, the
target file, the ledger directory, or the Git-admin lock path is refused. Lexical path
checks prevent `..` escape before any read or write.

Privacy verification reads no caller-selected file list. It reads the one receipt-backed
approved-output manifest, confirms every path, byte count, and hash, bounds per-record and
aggregate input, scans every JSON record, and sends images through the strict PNG inspector.
Optional private-vocabulary rules are derived in memory from a caller-supplied private
source, tracked by digests, and never printed. Output contains only aggregate counts.

## Focused validation

Run the same scripts under Windows PowerShell 5.1 and PowerShell 7:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-ui-drive-schema.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verify-ui-drive-scenes.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verify-ui-drive-evidence.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-ui-drive-evidence-negative.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-ui-drive-live-origin-negative.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verify-ui-drive-live-origin-source.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-ui-drive-privacy.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-ui-drive-reparse.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-ui-drive-ledger-concurrency.ps1
```

The focused suites prove 13 valid schema fixtures, 22 strict-admission and schema
negatives, 18 evidence-integrity negatives, 15 live-origin negatives, 5 privacy
negatives, 3 reparse negatives, six observed atomic-replace sharing retries, and two
cross-process generic lock writes. Public static evidence append remains unavailable.

No application build, launch, UI interaction, or capture is part of these source-only
checks. The complete UI drive remains open until the approved driver produces a real
receipt and inspected image for every one of the 70 scenes.

## Suggested articles

- [Design-reference parity](design-reference-parity.md)
- [Accessibility](accessibility.md)
- [Material Design 3](material-design-3.md)
- [Regex builder](regex-builder.md)
