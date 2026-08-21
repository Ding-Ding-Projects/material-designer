# Desktop project creation and agent handoff

**Status: implemented in source, not yet verified in a built application.** An
explicit desktop application choice now creates a real project scaffold and can
optionally hand a typed desktop-specific brief to the already selected local
coding agent through the existing first-run run path. No installer or release is
created by this flow.

## Requirement

Choosing the desktop application target is a product intent, not a label added to
an otherwise ordinary web prototype. Project creation must materialize a
versioned scaffold with a real HTML entry point, package metadata, Electron main,
preload and renderer files. The generated shell keeps context isolation and
sandboxing enabled, disables Node integration and webviews, blocks network and
out-of-root local-file requests, denies secondary windows, and exposes only a
narrow typed preload marker. It must not expose arbitrary shell, filesystem,
environment, credential, or untyped IPC access.

The optional wire-up choice shows the currently selected agent and accepts an
editable brief. When enabled, creation stores a `not_started` wire-up receipt,
then uses the existing first-run auto-send path. Run status remains authoritative
for queued, running, completed, cancelled, and failed outcomes; this feature does
not create a second run or event protocol.

## Generated project state

The daemon owns `desktopScaffold` and `desktopWireup` metadata. Scaffold state is
versioned by `schemaVersion` and `revision`, records the source entry and renderer
bootstrap, and names every generated file role. Generated files are written only
after the project row and seed conversation are prepared; a write failure removes
the new project record and its directory rather than returning a half-scaffolded
project.

The source starter is intentionally small and editable: `index.html`,
`styles.css`, and `app.js` provide a real local entry without user data, network
access, or a fake completed product. The companion `desktop/` folder contains
the package, main, preload, renderer, configuration, and README files needed for
the next implementation step. It is a source scaffold, not an installer.

## Export

The complete project ZIP export is project-scoped and does not depend on the
currently active file. It can prepare an empty project with only the generated
handoff/manifests, and it refuses
case-insensitive collisions with project-owned `desktop/` files, requires an HTML
entry, and records Squirrel.Windows as the eventual Windows packaging target with
code signing disabled. The export does not run a package manager, create an
installer, or publish anything.

The desktop scaffold remains a separately named target. The ordinary project
handoff never silently adds or substitutes the scaffold; both paths share the
same project-root source boundary and staged editor/download receipt.

## Failure and security boundaries

- An absolute, escaping, or non-HTML entry file is rejected before generation.
- Existing generated paths are rejected rather than overwritten.
- The renderer receives no Node integration and no arbitrary IPC capability.
- Navigation and requests are limited to the exported source root and local
  `file:` content; network requests and secondary windows are denied.
- The selected agent is the existing application selection. No credentials or
  shell command text is accepted from the project metadata.
- A wire-up prompt is bounded before it is persisted and is sent only through the
  existing first-run run machinery.

## Verification

Source-level coverage is present in:

- `design/apps/daemon/tests/desktop-scaffold.test.ts`
- `design/apps/daemon/tests/project-archive.test.ts`
- `design/packages/contracts/tests/system-prompt.test.ts`
- `design/packages/contracts/tests/scenario-defaults.test.ts`
- `design/apps/daemon/tests/prompts/system.test.ts`
- `design/apps/web/tests/components/NewProjectPanel.test.tsx`

Those tests were not run locally because this repository's local lane does not
run Node, pnpm, Electron, builds, or test suites. The remaining proof is a hosted
source/test run plus a cheap-headless interaction that creates a desktop project,
inspects the generated file roles and metadata, exercises the optional wire-up,
and confirms the run state through the existing route.

## Suggested reading

- [export-and-bulk-actions.md](export-and-bulk-actions.md) — complete-tree ZIP handoffs
- [external-editor.md](external-editor.md) — opening exported source in an editor
- [long-operations.md](long-operations.md) — truthful operation progress and re-entry refusal
- [full-folder-browser.md](full-folder-browser.md) — selecting a project location
- [../architecture/desktop-shell.md](../architecture/desktop-shell.md) — desktop capability boundaries
