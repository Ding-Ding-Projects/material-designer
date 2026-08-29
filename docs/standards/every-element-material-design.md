# Every-element Material Design registry

This project keeps a hand-written registry for every rendered surface that is
currently represented in the desktop shell or the documentation site. The
registry is evidence inventory, not a claim that every item is complete. A row
may be `partial` or `unverified` when the source exists but the built-artifact
interaction, capture, or accessibility evidence has not landed yet.

## Source of truth

The registry lives at
`.codex/verification/lang-gui/registry.json`, with its structural contract in
`.codex/verification/lang-gui/registry.schema.json`. The separately hand-written
source-owner inventory lives at
`.codex/verification/lang-gui/source-owners.json`. Its boundary is the complete
set of current top-level rendered owner registrations. It does not silently
discover new files, and it includes the native update-menu registration beside
the web renderer owners.

| Surface | Current source | Explicit elements |
| --- | --- | --- |
| Windows desktop application | `design/apps/web/src/App.tsx` plus the native update-menu registration | 27 explicit owners: the application root, update menu, and every top-level renderer component registered by `App.tsx` |
| Documentation site | `site/index.html` and `site/assets/js/` | 15 explicit owners: top bar, front-screen provenance, tabs, content search, command palette, notification control, theme toggle, search results, overview hero, language settings, funny-level settings, appearance settings, toy-lock settings, reset settings, status bar |

Each of the 42 element rows has a stable identifier, an owner, a route, and one
canonical source-registration anchor. Import registrations are checked inside
their import braces, so the validator rejects zero matches, duplicates, comments,
renamed descendants, and anchors that are not owner registrations. Removing a
source owner therefore turns the check red instead of silently leaving a stale
row behind.

## Required row contract

Every row carries all of the following, even when its status is not yet verified:

- roles, accessible names, actions, keyboard route, and touch route;
- normal, hover, focus, pressed, selected, disabled, dragged, validation,
  loading, success, warning, and error states;
- Material primitive and anatomy, color roles, typography, shape, elevation,
  state layers, motion, density, focus behavior, minimum target size, and
  contrast boundary;
- a responsive matrix covering a standard light tuple, a scaled dark tuple,
  narrow light content, and narrow high-scale dark content;
- target-specific context-menu actions for appearance editing and locking, with
  a field-owned anchored regex-builder route;
- an appearance-editor route, all six toy-lock policies, and a plain-text-first
  search route with an anchored full regex builder;
- the three language modes, local persistence fields, focused tests, and the
  negative-regression contract;
- an interaction receipt and capture tuple. Missing real built-artifact proof is
  represented by `status: "unverified"`, a null path, and a privacy verdict,
  never by an invented receipt or capture path;
- a current status and a reason that explains the evidence boundary.

The six lock policies are listed explicitly in every row: PIN, password, PIN
plus password, password plus TOTP, PIN plus TOTP, and password plus PIN plus
TOTP. The responsive matrix and the state list are also exact, so adding a row
with a convenient subset cannot pass by accident.

## Validator and negative regression

Run the validator from the project root:

```text
node scripts/verify-lang-gui-elements.mjs
node scripts/verify-lang-gui-elements.mjs --negative
```

The first command checks JSON shape, exact row membership, source paths and
anchors, all required fields, all required states, the six lock policies, the
three language modes, the responsive tuple matrix, and the honest evidence
boundaries. The second command deliberately removes, in memory, a whole
element row, a surface membership row, a state, a required field, and a source
anchor. Each mutation must turn red. The untouched registry is then checked
green again. No changed file is written by the negative run.

This is a source and inventory check. It does not turn source presence into
built-artifact proof. The interaction ledger and capture workflow still need to
populate each row with an existing immutable receipt, a real package digest,
full source commit, viewport, scale, theme, contrast result, and screenshot
before its status can become verified. A verified status with fabricated paths,
hashes, a short commit, or an unverified contrast result is rejected.

## Current evidence boundary

The desktop rows record the current privileged shell routes and their focused
source tests. They remain partial because this lane does not build or drive the
desktop package. The site rows record the current static markup and controller
anchors. They remain partial because a deployed-page interaction and capture
run is not part of this lane. The registry is therefore exhaustive about source
owners but intentionally narrow about runtime claims.

## Maintenance rule

When a new rendered surface, component, state, field, or route is added, add its
explicit row and source anchor in the same change. Update the surface membership
list, the documentation status, focused evidence, and the negative regression
boundary together. Renaming a source symbol or moving a route without changing
the registry must fail. A row that disappears entirely must fail through the
exact membership lists rather than being lost from a discovery-only scan.
