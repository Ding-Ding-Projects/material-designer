# Search-surface inventory

This is the hand-written inventory for the current desktop renderer and the
documentation site. It is deliberately separate from source discovery. A
surface disappearing from the source must still remain in this file and must
make the inventory check fail.

The desktop renderer uses the real JavaScript `RegExp` engine through
`RegexSearchField`. Each row names the owning component, its field identity,
the source path, and the state owner that keeps query, mode, flags, pattern,
validation, sample text, and matcher state isolated. The site uses the same
contract through `data-regex-builder` and one controller per input.

## Current rows

| ID | Surface | Owner and source | State boundary | Evidence status |
| --- | --- | --- | --- | --- |
| `desktop-entry-topbar` | Entry topbar search | `design/apps/web/src/components/EntryTopbarSearch.tsx` | `useRegexSearch` in the component | wired at source level |
| `desktop-command-palette` | Command palette search | `design/apps/web/src/components/command-palette/CommandPalette.tsx` | palette-owned controller | wired at source level |
| `desktop-settings` | Settings search | `design/apps/web/src/components/SettingsDialog.tsx` | settings-owned controller | wired at source level |
| `desktop-settings-overflow` | Settings tab overflow search | `design/apps/web/src/components/settings/SettingsTabStrip.tsx` | menu-owned controller | wired at source level |
| `desktop-changelog` | Changelog search | `design/apps/web/src/components/changelog/ChangelogDialog.tsx` | changelog-owned controller | wired at source level |
| `desktop-history` | Version-history search | `design/apps/web/src/components/history/VersionHistoryDialog.tsx` | history-owned controller | wired at source level |
| `desktop-notifications` | Notification-centre search | `design/apps/web/src/components/notifications/NotificationCenter.tsx` | notification-owned controller | wired at source level |
| `desktop-handoff` | Handoff registry search | `design/apps/web/src/components/handoff/HandoffView.tsx` | separate token and component controllers | wired at source level |
| `desktop-file-viewer-present-menu` | FileViewer presentation menus | `design/apps/web/src/components/FileViewer.tsx` | two menu-owned controllers with stable field ids | wired at source level |
| `desktop-file-viewer-zoom-menu` | FileViewer zoom menu | `design/apps/web/src/components/FileViewer.tsx` | zoom-menu-owned controller | wired at source level |
| `desktop-file-viewer-live-zoom-menu` | LiveArtifactViewer zoom menu | `design/apps/web/src/components/FileViewer.tsx` | live-zoom-menu-owned controller | wired at source level |
| `desktop-file-viewer-toolbar-more-menu` | FileViewer toolbar More menu | `design/apps/web/src/components/FileViewer.tsx` | toolbar-more-owned controller | wired at source level |
| `desktop-file-viewer-version-download-menu` | FileViewer header and footer version download menus | `design/apps/web/src/components/FileViewer.tsx` | two menu-owned fields over one origin-aware version-download state | wired at source level |
| `desktop-file-viewer-unified-action-menu` | FileViewer unified share and export menu | `design/apps/web/src/components/FileViewer.tsx` | unified-action-owned controller | wired at source level |
| `desktop-file-viewer-component-unified-menu` | ReactComponentViewer unified share and export menu | `design/apps/web/src/components/FileViewer.tsx` | component-unified-menu-owned controller | wired at source level |
| `desktop-file-viewer-markdown-download-menu` | MarkdownViewer download menu | `design/apps/web/src/components/FileViewer.tsx` | markdown-download-menu-owned controller | wired at source level |
| `desktop-tabs-current-strip` | Current tab-strip search | `design/apps/web/src/components/workspace-tabs/WorkspaceTabDiscovery.tsx` | strip-owned controller | wired at source level |
| `desktop-tabs-inside-group` | Search inside a tab group | `design/apps/web/src/components/workspace-tabs/WorkspaceTabDiscovery.tsx` | group-owned controller | wired at source level |
| `desktop-tabs-groups` | Tab-group name search | `design/apps/web/src/components/workspace-tabs/WorkspaceTabDiscovery.tsx` | group-list-owned controller | wired at source level |
| `desktop-tabs-master` | Master open-tab search | `design/apps/web/src/components/workspace-tabs/WorkspaceTabDiscovery.tsx` | app-owned controller | wired at source level |
| `desktop-library` | Library search (`library-search`) | `design/apps/web/src/components/LibrarySection.tsx` | **RED: current route still uses its original raw input; Library lane** | not wired |
| `desktop-library-picker` | Library picker search (`library-picker-search`) | `design/apps/web/src/components/LibraryPicker.tsx` | **RED: no current field-owned builder; Library lane** | not wired |
| `desktop-library-kind-filter` | Library kind filter (`library-kind-filter-search`) | `design/apps/web/src/components/LibrarySection.tsx` | **RED: no independent field; Library lane** | not wired |
| `desktop-library-source-filter` | Library source filter (`library-source-filter-search`) | `design/apps/web/src/components/LibrarySection.tsx` | **RED: no independent field; Library lane** | not wired |
| `desktop-library-design-system-menu` | Library design-system menu (`library-design-system-menu-search`) | `design/apps/web/src/components/LibrarySection.tsx` | **RED: no local builder; Library lane** | not wired |
| `documentation-site` | Documentation content search | `site/index.html`, `site/assets/js/main.js` | **RED: field/controller split has no single-row proof; site lane** | not wired |
| `documentation-settings` | Documentation settings search | `site/index.html`, `site/assets/js/main.js` | **RED: field/controller split has no single-row proof; site lane** | not wired |
| `site-tab-overflow` | Documentation tab overflow search (`md-tabs-search-tab-strip-overflow`) | `site/assets/js/tabs.js` | overflow-local controller | wired at source level |
| `site-tab-list` | Documentation searchable tab list (`md-tabs-search-tab-strip-search`) | `site/assets/js/tabs.js` | list controller | wired at source level |
| `site-context-menu` | Documentation tab context-menu filter (`md-tabs-search-tab-context-menu`) | `site/assets/js/tabs.js` | menu-local controller | wired at source level |
| `site-tabs-inside-group` | Documentation search inside each tab group | `site/assets/js/tabs.js` | **RED: no persisted group model or field yet** | not wired, owned by tabs lane |
| `site-tab-groups` | Documentation tab-group name search | `site/assets/js/tabs.js` | **RED: no group-name surface or field yet** | not wired, owned by tabs lane |
| `site-tabs-master` | Documentation master open-tab search | `site/assets/js/tabs.js` | **RED: no cross-window model or field yet** | not wired, owned by tabs lane |

The rows above are the currently enumerated desktop and site search surfaces
covered by this lane. Ten rows are deliberately marked RED: five Library
search/filter surfaces remain with their owning Library lane, two split-source
documentation fields remain with the site lane, and three documentation
tab-discovery models remain with the tabs lane. Each wired row carries exact field ids, and reusable
surfaces enumerate their dynamic id template separately. The desktop source also contains search inputs
inside feature work that is not in the active route inventory, including model
pickers, project-reference dialogs, plugin lists, and several import panels.
Those are not silently counted as complete here: they remain open follow-up
rows until their owning surface is promoted into this inventory with a real
field-owned builder and isolated state. The inventory check fails when one of
the rows above is removed, renamed, or loses its builder registration.

## Contract per row

Every row owes all of the following:

- plain text is the initial mode, and regex is an explicit opt-in;
- the raw pattern, flags, validation and guided parts are bidirectionally
  synchronized within that field;
- the workbench is anchored to the field that opened it and returns focus on
  close;
- the interface names the actual engine and dialect, and keeps unsupported
  constructs visible with an exact reason;
- sample matching is local, bounded, zero-width safe, and reports captures,
  truncation, timing and backtracking risk. High-risk backtracking shapes are
  refused before synchronous engine evaluation, while any cumulative budget
  exhaustion remains visibly labelled and never silently hides rows;
- the field's query, flags, sample, matcher and saved snippets never share
  hidden state with a neighbouring field; and
- the focused source contract and the real built-artifact interaction evidence
  are recorded against the same row before it is promoted to verified.

## Negative regression

[`scripts/check-regex-search-inventory.sh`](../../scripts/check-regex-search-inventory.sh)
uses a hard-coded expected ID list and exact source registrations. It does not
derive the list from the files it checks. Its companion negative run removes a
row and a builder registration in disposable copies. Each mutation must turn
the check red; the untouched copies must turn it green. This is source-level
evidence only. Hosted build, packaged interaction, and visual capture evidence
remain separate checks.

## Verification boundary

The current evidence is source-level. No claim here promotes a hosted build,
packaged runtime, keyboard drive, accessibility drive, or visual capture. Those
checks must run against the exact built commit through the approved headless
route before any row changes from source-level to verified.

## Suggested reading

- [regex-builder.md](regex-builder.md)
- [context-menu-shortcuts.md](context-menu-shortcuts.md)
- [tabs.md](tabs.md)
- [accessibility.md](accessibility.md)
