# Feature lineage inventory

The feature-lineage inventory is the hand-written record of how this repository
relates to its upstream source and how the project-specific feature contract is
represented on each user-facing surface. It is intentionally separate from the
byte-verbatim import manifest: the import manifest answers whether files match,
while this inventory answers which history and feature surfaces are accounted for.

## Exact membership

The inventory records the 98 commits returned by `git log -n 98` at upstream
target `a554d017c8fa12d8913354ba6cf792d26d0c3b54`, beginning at that target and
ending at the commit immediately before the current 98-commit window. It records
the full SHA and subject for every row, not a count inferred from a discovery
query. It also records the 13 unique commits held by the two linked task branches
`codex/download-menu-accessibility` and `codex/folder-browser-final-repair`, plus
all 22 preservation branches present in the remote inventory.

The static list is checked for order, uniqueness, full SHA shape, and exact target
metadata. When an upstream checkout is available, the validator compares every
recorded SHA and subject against the actual target history as an independent proof:

```text
py -3 scripts/verify-feature-lineage.py
py -3 scripts/verify-feature-lineage.py --upstream-repo <upstream-checkout>
```

The optional checkout is only used for verification. It is not copied into this
repository and no generated history is used as a replacement for the checked-in
list.

## Surface coverage

The inventory names exactly 30 canonical feature IDs in a fixed order. Each ID has
one row for the Windows desktop application and one row for the documentation site,
for 60 surface rows total. Every feature and surface row carries the same explicit
fields:

| Field | Meaning |
| --- | --- |
| `lineageCommits` | Full SHAs that establish or materially repair the feature. |
| `behavior` | The user-visible contract being tracked. |
| `paths` | Repository-relative implementation or documentation paths. |
| `apisOrStorage` | The API, storage, or honest absence of proof. |
| `desktopImplementation` / `siteImplementation` | Implementation status and paths for the two surfaces. |
| `materialDesign3` | Material Design conformance status. |
| `localization` | Language-mode and localized-copy status. |
| `persistence` | Persistence status. |
| `tests` | Focused test and built-artifact verification status. |
| `negativeProof` | Negative-regression evidence status. |
| `interactions` | Required interaction identifiers. |
| `captures` | Real capture receipts, when available. |
| `state` | `implemented`, `partial`, `absent`, or `unreachable`. |

Rows deliberately preserve honest partial and absent states. An inventory entry is
not a claim that the feature is shipped, tested, or captured. Empty capture arrays
and unverified fields identify work that still needs evidence.

## Files and fail-closed checks

- `.codex/verification/feature-lineage/inventory.json` is the explicit data record.
- `.codex/verification/feature-lineage/inventory.schema.json` documents the bounded
  JSON shape and minimum row counts.
- `scripts/verify-feature-lineage.py` checks exact membership, required fields,
  counts, and the two-surface matrix.
- `scripts/test-feature-lineage-negative.ps1` removes the complete upstream lineage
  boundary from a temporary copy, proves the validator turns red, restores the copy,
  and proves it returns to green.

Run the focused negative proof with:

```text
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/test-feature-lineage-negative.ps1
git diff --check
```

The negative regression changes only its temporary copy. It never changes the
checked-in inventory and never deletes a branch, checkout, or user data.

## Scope and limitations

The inventory is a lineage and evidence boundary, not a substitute for feature
implementation, focused tests, built-artifact interaction, or real captures. Those
proofs remain required by the per-surface UI-drive inventory. A missing or stale
feature row is a validation failure even when the implementation is present, and an
implementation without its evidence fields remains honestly unverified.

## Suggested reading

- [verification.md](verification.md) for byte-level import verification.
- [../standards/ui-drive-evidence.md](../standards/ui-drive-evidence.md) for built-artifact interaction receipts.
- [../standards/front-screen-provenance.md](../standards/front-screen-provenance.md) for the version and timestamp contract.
