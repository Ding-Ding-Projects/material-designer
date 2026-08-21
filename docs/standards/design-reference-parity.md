# Design-reference parity

Material Designer treats `mockups/open-design-m3/Open Design M3.dc.html` as the
public-safe checked-in form of the user-supplied Material Design 3 redesign. The
private source archive is not copied into this public repository. Its account,
organization, repository, endpoint and internal-tool sample values are replaced
with fictional fixtures; those replacements are intentional deviations, not
visual licence to redesign the reference.

## Implementation

Commit [`8129ac77`](https://github.com/Ding-Ding-Projects/material-designer/commit/8129ac77)
adds:

- `tools/design-reference-app/main.mjs`, a developer-only Electron entry that
  renders the checked-in reference directly, resolves its React runtime from
  installed local packages and refuses unrelated network requests;
- `.codex/verification/design-parity/routes.json`, the hand-written list of ten
  required screens;
- `.codex/verification/design-parity/inventory.json`, one explicit row per
  screen with matching reference/application tuples, per-component Material
  Design 3 audit states, evidence paths and reviewed deviations;
- `scripts/verify-design-parity.mjs`, which fails on a missing screen, route,
  tuple field, audit, evidence path or unapproved deviation and has an in-memory
  negative mode that proves each structural boundary red then green.

## Evidence boundary

The inventory is structurally complete and all ten rows are currently marked
`unverified`. That is deliberate: source code, a route string and a non-empty
PNG do not prove visual parity. A row becomes verified only after the checked-in
reference and the real installed Squirrel application are launched through the
approved hidden-desktop route at the same screen, state, theme, 1440×900 CSS
viewport, display scale, locale and fixture revision. Both raw captures must be
retained and hashed; a labelled comparison and machine-readable visual diff
must bind to those hashes; and the component audit must be reviewed.

Run the structural and negative checks with:

```text
node scripts/verify-design-parity.mjs --structure
node scripts/verify-design-parity.mjs --negative
```

After evidence exists, omit `--structure`; the default mode requires every raw
capture, comparison, diff receipt, source commit and verified row status.

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
