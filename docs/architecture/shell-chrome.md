# Shared shell chrome

This page records the source contract for the shared desktop chrome: the
renderer title bar, workspace tabs, entry navigation rail, entry search, and
bottom status strip. It is a source-level handoff, not a claim that a packaged
build has passed the visual matrix.

## Geometry

`design/apps/web/src/styles/shell.css` owns four explicit rows:

1. `40px` for the renderer title bar on the frameless Windows surface, or a
   zero-height first row where native caption chrome remains;
2. `42px` for the workspace tab strip;
3. `minmax(0, 1fr)` for the active content body; and
4. `28px` for the status strip.

The title bar, tab strip, body, and status bar are assigned to those rows by
selectors. A stray child cannot create an implicit row. Window dimensions use
the scale-aware `--od-vw` and `--od-vh` values, with dynamic viewport units only
as their fallback.

The entry rail uses `88px` in icon mode and `260px` in labelled mode. It remains
present in both states, and the inline `236px` override was removed so the grid
and the component share one source of truth.

## Controls and accessibility

Each rail destination has one icon and one sighted label. The button's
`aria-label` is the only accessible name; hidden glyph wrappers do not create a
second announcement. Focus remains visible and destination buttons retain a
48px-or-larger interaction target where the surrounding shell permits it.

The entry topbar search is a field-owned `RegexSearchField`, with plain text as
the default and an anchored builder for that field. The palette shortcut is the
single `Ctrl+Shift+F`/`Cmd+Shift+F` binding from the shared shortcut registry;
the previous competing `Ctrl+K` route is not registered.

Workspace tabs use `tablist`/`tab` roles, roving focus, the 42px strip and 36px
tab anatomy. Their discovery surface keeps independent field-owned builders.
Tab context menus expose `Edit tab appearance…` through the existing group/tab
appearance paths, and group movement uses one bounded `Move…` picker with its
own searchable regex field, group colour and member count, a no-group choice,
and a create-group path. The picker is viewport bounded and returns focus to
the invoking tab menu path on close.

## Status and themes

The status strip keeps daemon state, model, design system, UI scale and density,
and now includes the resolved build version. All chrome surfaces use the
Material Design 3 role tokens, including dark-surface roles; the Windows close
button's red hover remains the documented platform exception.

## Verification boundary

The source guard is
`design/apps/web/tests/components/WorkspaceTabsBar.shell-contract.test.ts`.
It checks CSS balance, explicit rows, scale-aware dimensions, rail width
ownership, import-order precedence, one-icon/one-label rail anatomy, the
field-owned tab picker, and a deliberate red-then-green row mutation. The
permitted local evidence for this lane is `git diff --check` plus the pure port
verifier. The real built artifact still requires hosted checks and the approved
headless capture matrix:

- light and dark themes;
- normal and narrow widths;
- 100%, 125%, 150% and 200% display scale;
- English, Cantonese and bilingual labels;
- collapsed and expanded rail;
- title bar, tabs, topbar search/builder, group picker and status strip;
- project and entry routes; and
- keyboard focus, tab discovery, context-menu movement and notification access.

No runtime or visual claim is promoted until those captures are inspected.

## Suggested reading

- [desktop-shell.md](desktop-shell.md) — privileged window and preload boundary
- [../standards/material-design-3.md](../standards/material-design-3.md) —
  tokens, component anatomy and scale rules
- [../standards/tabs.md](../standards/tabs.md) — tab groups, discovery and
  bulk close
- [../standards/accessibility.md](../standards/accessibility.md) — focus,
  names, roles and sizing
- [../standards/regex-builder.md](../standards/regex-builder.md) —
  field-owned anchored builders
