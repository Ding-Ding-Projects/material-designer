# Full UI drive and per-click capture evidence

## 2026-08-29 status

The integrated Groups A through E source work strengthens the window-chrome,
viewport, overlay, deterministic-route, and token contracts that a future drive
will use. It does not create evidence receipts. No built application,
installed package, screenshot, rendered geometry measurement, display-scale
matrix, or bilingual matrix was exercised, and no per-click capture ledger is
claimed. The source parity structure check is green, while the full parity
verifier remains red at `route.application_implementation`.

The hand-written inventory and its negative checks remain the source of truth.
The next drive must use the exact installed commit and capture tuple, retain a
real inspected image after every action, and record semantic state, artifact
hash, tuple, privacy result, and source commit for each receipt.

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
| `scripts/test-ui-drive-evidence-negative.ps1` | Deliberate red-then-green regression covering disappearance of an entire surface, feature, destination, interaction field, and false evidence on an unverified row. |

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
