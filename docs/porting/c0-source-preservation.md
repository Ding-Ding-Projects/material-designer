# C0 terminal source-preservation inventory

The offline-documentation C0 change stream is tracked by one bounded, hand-written
inventory. Its terminal path set is derived from:

```text
git diff --name-only dd43dda7^ dfb5c168
```

That command yields exactly 51 paths. At the source-current commit
`901890c3d7f97e8f145f0ef7c6138a3859e130c1`, 30 paths are byte-identical to the
terminal baseline `dfb5c168c5f086671f8cd6e66698f7886805f1e9`. The other 21 paths
are intentional semantic differences: `MODIFICATIONS.md`, the typed translation
contract, and 19 direct locale catalogs. Every semantic row records a concrete
reason and contract. The older unsubstantiated 56-path claim is not used.

## Files and evidence

| File | Purpose |
| --- | --- |
| [`c0-source-preservation.json`](c0-source-preservation.json) | Hand-written 51-row record with exact baseline and source-current blob ids and SHA-256 values, plus current-tree values. |
| [`../../scripts/verify-c0-source-preservation.ps1`](../../scripts/verify-c0-source-preservation.ps1) | PowerShell 5.1-compatible fail-closed verifier. |
| [`../../scripts/test-c0-source-preservation-negative.ps1`](../../scripts/test-c0-source-preservation-negative.ps1) | Deliberate red-green mutation suite. |

Run the focused verifier from the repository root:

```text
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verify-c0-source-preservation.ps1
```

It checks the exact base, source-current, and range commits; derives the path set
again; rejects missing, extra, duplicate, or renamed paths; validates every Git blob
id and SHA-256; compares every row with the current tree; requires a reason and
contract for each semantic row; and checks that the documentation index remains
attached to the inventory and verifier. The `MODIFICATIONS.md` row intentionally
records its post-summary-update current-tree hash while retaining the exact
`901890c3d` source-current blob for provenance.

The negative suite copies the inventory to a temporary file and removes or alters
one exact boundary at a time: a path, duplicate, classification, semantic reason,
base commit, source-current commit, baseline blob, current blob, current hash,
derived range, rename prohibition, documentation registration, and current-tree
value. Each mutation must turn the verifier red, then the untouched inventory must
return green. No mutation touches the checked-in inventory or source tree.

## Scope

This record proves source preservation only. It does not claim a build, package,
installed interaction, or visual capture. The ordinary port verifier remains a
separate check and must continue to report zero gaps:

```text
scripts/verify-port.sh --json
```

## Suggested reading

- [verification.md](verification.md) for the imported-tree byte comparison.
- [feature-lineage.md](feature-lineage.md) for the broader history inventory.
- [../site/offline-documentation-browser.md](../site/offline-documentation-browser.md) for the C0 feature contract.
