# Full UI drive and per-click capture evidence

This project fails closed on UI interaction evidence. A source route, unit test,
filename-only manifest, or old screenshot cannot establish that the current built
application exposes a feature or that an interaction reached its expected state.

## Authoritative files

| File | Purpose |
| --- | --- |
| `.codex/verification/ui-drive/inventory.json` | Hand-written completeness inventory for the Windows desktop application and documentation site. It names all mandatory feature targets even when they are absent or unreachable. |
| `.codex/verification/ui-drive/inventory.schema.json` | Versioned contract for surface, destination, feature, and required-interaction rows. |
| `.codex/verification/ui-drive/click-receipt.schema.json` | Versioned contract for one interaction and the inspected PNG captured immediately afterward. |
| `scripts/verify-ui-drive-evidence.ps1` | Exact validator for surface, feature, destination, interaction, evidence, and optional receipt bindings. |
| `scripts/test-ui-drive-evidence-negative.ps1` | Deliberate red-then-green regression covering whole surfaces, features, destinations, exact interaction and scene identities, tuple and network policy fields, ledger gaps, and false evidence on an unverified row. |
| `.codex/verification/ui-drive/scene-registry.json` | Hand-authored registry of 70 exact capture scenes: 30 feature scenes on each surface and ten desktop destination scenes. |
| `.codex/verification/ui-drive/scene-registry.schema.json` | Strict bounded schema for scene identity, tuple, semantic expectations, input route, and capture-aware network isolation. |
| `.codex/verification/ui-drive/ledger.json` | Append-only receipt ledger. It starts empty because no current built capture exists. |
| `.codex/verification/ui-drive/ledger.schema.json` | Strict bounded one-receipt-per-interaction ledger contract. |
| `scripts/verify-ui-drive-scenes.ps1` | Fails closed when a hand-authored feature, destination, scene, tuple, or network-isolation identity disappears or detaches. |
| `scripts/validate-ui-drive-receipt.ps1` | Validates one receipt against the inventory and scene registry, the real packaged build, an independent original-image inspection, and its privacy and audit records. |
| `scripts/append-ui-drive-ledger.ps1` | Appends one validated receipt only at the next sequence, refusing duplicates, moving identities, stale scenes, and gaps. |
| `scripts/inspect-ui-drive-image.ps1` | Opens the original PNG with the platform decoder and reports dimensions, signature, SHA-256, and nonblank state without writing or emitting pixels. |
| `scripts/run-ui-drive-privacy.ps1` | Scans only explicitly approved evidence outputs under the evidence root and emits aggregate verdicts without payloads or paths. |
| `scripts/test-ui-drive-schema.ps1` | Focused strict-schema and exact-count check for the inventory, scene registry, receipt schema, and empty baseline ledger. |
| `scripts/test-ui-drive-privacy.ps1` | Privacy self-test that accepts safe output and rejects sensitive content and path escape without emitting fixture payloads. |

The ten rows in `.codex/verification/design-parity/inventory.json` are an explicit
input to the desktop destination list. They do not define feature completeness.
The separate hand-written `requiredFeatureIds` list prevents a completely absent
feature from disappearing from discovery and therefore disappearing from the
validator.

## Honest current state

The inventory records the desktop application as unreachable because there is no
launchable packaged artifact from the current commit in this checkout. The
documentation site is partial. All feature rows without real built-artifact proof
remain `absent`, `unreachable`, or `partial`, and their `evidenceReceipts` arrays
remain empty. These states are failing release evidence, not exemptions.

No capture receipt is checked in by this foundation task. A future receipt is
accepted only when it binds one exact inventory interaction to:

- a full source commit and a built artifact made from that commit;
- the artifact SHA-256 and approved cheap headless route;
- route, theme, language, viewport, and display scale;
- expected and observed state before and after the action;
- the immediate PNG path, hash, dimensions, signature, and nonblank verdict;
- a privacy verdict and a human inspection of the original image;
- any visual defects found at that exact state.

## Scene and ledger contract

`scene-registry.json` is deliberately explicit rather than runtime-discovered. It
contains 70 rows: one for every feature interaction on each of the two surfaces,
plus one destination scene for each of the ten desktop parity destinations. Every
row names an exact screen, state, theme, locale, viewport, display scale, route,
approved `cheap-lowlevel-headless` route, disabled-external-network policy, action
target, accessible name, input method, and expected semantic before/after state.
All rows remain `unreachable` until a real current-commit packaged build is driven.

`ledger.json` is the durable append-only index. `scripts/append-ui-drive-ledger.ps1`
first validates the receipt, then requires the next contiguous sequence and one
unused receipt, interaction, and scene identity. The first row establishes the
source commit and packaged-build hash; later rows must retain both identities.
The writer uses a temporary file followed by replacement only after all checks pass,
so a rejected receipt cannot advance the ledger. It never creates a PNG, receipt,
hash, or evidence row on behalf of a capture run.

Receipts are version 2. They add `receiptId`, `sceneId`, accessible name and input
method, a bounded semantic poll record, the full capture tuple and network policy,
packaged-build provenance, an independent original-image inspection record, and an
every-element audit link. The validator recomputes the packaged-build and PNG
hashes, opens the original PNG, checks its signature and nonblank pixels, compares
the inspection record, and invokes the privacy runner over only the approved
receipt and image paths. Source previews, DOM injection, synthetic receipts,
repeated images, stale scenes, detached interaction rows, and missing audit links
cannot satisfy the contract.

The exact future capture sequence is: resolve the current packaged build and its
source commit, create a fresh isolated profile and named hidden desktop, launch
through the approved cheap Lowlevel headless route, resolve the application window
by current process, title, class, and non-zero dimensions, and prove the loopback
debugging target list contains exactly one intended page. For each hand-authored
scene, perform the listed action, wait for its bounded semantic poll, validate the
post-state, run the privacy scan, capture and inspect one original PNG, then append
the receipt before starting the next action. Cleanup is recorded only after the
run ends and never turns an unreachable scene into evidence.

## Validation

The local policy forbids heavyweight application commands. The evidence foundation
therefore uses Windows PowerShell only:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verify-ui-drive-evidence.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-ui-drive-evidence-negative.ps1
```

When real evidence exists, validate one receipt with:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verify-ui-drive-evidence.ps1 -Receipt <receipt.json>
```

The validator checks receipt structure and inventory binding. It does not replace
opening the original PNG and judging whether the pixels show the claimed state,
whether clipping exists, or whether sensitive content was overlooked.

The focused foundation checks are:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verify-ui-drive-scenes.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verify-ui-drive-evidence.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-ui-drive-evidence-negative.ps1
```

The negative suite mutates whole surfaces, whole features, destinations, scenes,
scene tuples, exact interaction identities, accessible names, input methods,
network isolation, ledger ordering, and receipt paths. Each mutation must turn the
validator red, and the untouched inventory, registry, and empty ledger must return
green. It also exercises commented or detached identity boundaries by replacing
exact scene and interaction bindings rather than accepting a substring match.

## Failure modes

- Removing an entire mandatory row fails, even if discovery can no longer see it.
- A partial or absent row carrying a receipt fails. Evidence cannot be attached to
  make an unfinished feature look verified.
- A `verified` row with no exact receipt fails.
- A receipt whose source commit differs from the artifact commit fails.
- Any route other than `cheap-lowlevel-headless`, an unsafe privacy verdict, a
  blank or invalid image, or an uninspected original fails.
- A successful click without a matched semantic state fails. Command completion is
  not proof that the intended surface opened.

## Next evidence work

After a current-commit packaged artifact exists, the approved headless driver must
execute every inventoried interaction. It must retain and inspect one PNG after
every click, create one receipt per transition, record visual defects against the
exact failing step, and keep absent or unreachable features red until their real
flows exist.

## Suggested articles

- [Design-reference parity](design-reference-parity.md)
- [Accessibility](accessibility.md)
- [Material Design 3](material-design-3.md)
- [Regex builder](regex-builder.md)
