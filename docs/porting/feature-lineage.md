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
metadata. An upstream object source is mandatory: use the initialized
`vendor/open-design` submodule or a task-local checkout containing the exact target
object. The validator compares every recorded SHA and subject against that target
history as an independent proof. A count-only run is refused:

```text
py -3 scripts/verify-feature-lineage.py --upstream-repo vendor/open-design
py -3 scripts/verify-feature-lineage.py --upstream-repo <upstream-checkout>
```

The checkout is used only for verification. It is not copied into this repository
and no generated history is used as a replacement for the checked-in list. An
unavailable source or an omitted `--upstream-repo` argument is a failed validation,
not an unverified success.

The linked commit `919073e7ae3cc0d55316000549ba1aa2cf15c810` has a literal `\\n`
escape sequence in its Git subject after the title. Its inventory row records the
public first-line title and marks `subjectMode` as
`literal-escape-first-line-public`; the validator compares that exact first-line
representation to Git without copying the rest of the subject into public records.

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

Feature and surface lineage entries are not bare SHA strings. Each is an explicit
`{ "sha", "source" }` pair. The validator carries a hand-written pair allowlist for
every feature, including the two deliberately different sources used by local
history and the source used by each other preserved feature stream. A SHA that is
reachable from more than one ref still fails when its declared pair is wrong or its
pair order drifts.

## Files and fail-closed checks

- `.codex/verification/feature-lineage/inventory.json` is the explicit data record.
- `.codex/verification/feature-lineage/inventory.schema.json` documents the bounded
  JSON shape and minimum row counts.
- `scripts/verify-feature-lineage.py` executes and validates the checked-in schema,
  then checks exact membership, commit objects, peeled preservation refs, explicit
  feature/source pairs, referenced files, required fields, counts, subject bytes,
  and the two-surface matrix. Source refs are checked as raw refs first with
  `git cat-file -t`, must be direct commits, and are only then peeled with
  `^{commit}` for comparison. Annotated tags are refused even when they peel
  cleanly. It rejects symlink and reparse-point candidates before path resolution.
- `scripts/test-feature-lineage-negative.ps1` exercises nonexistent and
  descendant-only paths, empty implementation objects, bogus valid SHAs, moved refs,
  unavailable sources, omitted source arguments, subject mismatches, source-pair
  overlap and order drift, annotated ref substitutions, schema keyword misuse, and
  file, directory-junction, internal-link, and external-link candidates. It proves
  every mutation turns the validator red, then restores the inventory and proves it
  returns to green.

Run the focused negative proof with:

```text
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/test-feature-lineage-negative.ps1 -UpstreamRepo <upstream-checkout>
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
