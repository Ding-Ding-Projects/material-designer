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

## Evidence boundary

The inventory is structurally complete and all ten rows are currently marked
`pending`. That is deliberate: source code and route strings do not prove
visual parity. The installed application does not yet implement the declared
`material-designer://` tuple resolver, so the default verifier stops at that
route boundary before accepting capture evidence.

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
