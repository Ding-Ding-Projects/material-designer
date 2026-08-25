# Design handoff registry

**Status: source implementation added; installed runtime and visual parity are unverified.**

The application now has a dedicated `/handoff` destination for the current
design reference inventory. It is a read-only surface for agents and maintainers;
it is not the existing website export, conversation handoff, or installer flow.

## What the surface records

- Exactly 18 hand-authored Material Design 3 token to application-variable
  mappings. Each row names both checked-in stylesheet paths, a status and source
  evidence.
- Exactly 12 current component owners. Each row names its source path, status
  and evidence state. Unverified means no running-artifact claim is being made.
- A versioned `material-designer.handoff.v1` export schema. Private user data,
  credentials, machine-specific paths and runtime payloads are omitted.

The registry is source data in
`design/apps/web/src/components/handoff/registry.ts`. The renderer consumes this
typed registry directly; it validates the exact row schema before rendering or
exporting, does not parse arbitrary CSS, and does not copy static colours.
Swatches resolve `var(...)` from the live stylesheet instead of storing colour
literals in the handoff data.

## Search, selection and export

The token list and component list own separate `RegexSearchField` controllers.
Plain text is the default, regex is an explicit opt-in, and each builder stays
anchored to its own field. Both lists support click selection, Shift range
selection, keyboard activation, selecting this list, selecting all matches,
inverse selection and clearing. Empty filters report a real no-match state.

Selected rows and all rows can be copied as JSON or exported as JSON, Markdown
or CSV. One canonical export allowlist feeds all three formats, including every
visible source field. Markdown escapes table separators and inline code; CSV
neutralizes formula-like cells. Each format states the schema and omission
policy. There are no destructive list actions because this surface owns no user
records.

## Routing and settings reachability

`EntryHomeView` parses and builds `/handoff`. Settings exposes a virtual Handoff
tab, search entry and command-palette entry that all navigate to the dedicated
route. The virtual section is intentionally excluded from the last-settings
section persistence, so reopening Settings never restores the read-only handoff
page as if it were a mutable preference panel. The page's Back to Settings
control returns to the normal `/settings` focus entry point.

The settings token and the route interception are one contract. A source-file
recovery must preserve both `SettingsSection` membership and the
`App.openSettings` handoff branch. Keeping only the tab definition leaves a
type-invalid registry, while removing the definition makes the documented
destination undiscoverable. The focused settings-handoff test checks the token,
non-restorable behavior, palette entry, and dedicated route wiring together.

## Verification

Run the source contract from the repository root:

```text
node scripts/verify-handoff-contract.mjs
node scripts/verify-handoff-contract.mjs --negative
```

The guard uses bounded comment-stripped brace/declaration checks and explicit
sets for rows, source paths, statuses, locales, route, settings tab, palette,
search and export boundaries. Negative mode removes each complete exact boundary
in memory, requires a red result, restores it and requires green. No hosted build,
installed interaction or reference/application capture has been run for this
lane yet; those remain parent integration work.

## Suggested articles

- [material-design-3.md](material-design-3.md)
- [design-reference-parity.md](design-reference-parity.md)
- [regex-builder.md](regex-builder.md)
- [export-and-bulk-actions.md](export-and-bulk-actions.md)
