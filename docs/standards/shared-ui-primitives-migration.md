# Shared menu and dropdown primitive migration

This is the hand-written migration inventory for the shared menu and dropdown
primitives. It is intentionally explicit. A checked row means the surface has
been reviewed and uses the shared primitive, not that a text search happened to
find one of its descendants. An unchecked row is a red migration row and stays
visible until its owning feature lane migrates it.

## Shared primitive rows

| Row | Source | Contract | State |
| --- | --- | --- | --- |
| primitive-context-menu | `design/apps/web/src/components/ContextMenu.tsx` | Target-specific menu with a field-owned plain-text-first search, anchored regex builder, isolated state, result status, keyboard navigation, focus return, viewport bounds, shortcut registry display, and real appearance/lock callback seams. | [x] implemented, mounted tests present |
| primitive-custom-select | `design/apps/web/src/components/CustomSelect.tsx` | Target-specific dropdown with a field-owned plain-text-first search, anchored regex builder, isolated state, filtered groups, result status, keyboard navigation, focus return, viewport bounds, and an optional context-menu handoff. | [x] implemented, mounted tests present |
| primitive-regex-active-result | `design/apps/web/src/components/regex/RegexSearchField.tsx` | Search fields can expose the active filtered result to their own listbox or menu through `aria-activedescendant` without sharing controller state. | [x] implemented, mounted tests present |

## Native select rows

Every row below is an exact remaining migration target. The application still
uses the native control at the listed location, so each row is deliberately red
until its feature owner supplies equivalent options, localization, validation,
search, and the adjacent anchored regex builder.

| Row | Source location | Owning surface | State |
| --- | --- | --- | --- |
| select-collab-role | `design/apps/web/src/collab/CollabDemoView.tsx:145` | Collaboration demo role | [ ] RED, native select remains |
| select-avatar-account | `design/apps/web/src/components/AvatarMenu.tsx:596` | Avatar account picker | [ ] RED, native select remains |
| select-avatar-owner | `design/apps/web/src/components/AvatarMenu.tsx:618` | Avatar owner picker | [ ] RED, native select remains |
| select-design-browser | `design/apps/web/src/components/DesignBrowserPanel.tsx:3075` | Design browser filter | [ ] RED, native select remains |
| select-design-system-section | `design/apps/web/src/components/DesignSystemsSection.tsx:496` | Design system filter | [ ] RED, native select remains |
| select-design-system-tab | `design/apps/web/src/components/DesignSystemsTab.tsx:1111` | Design system control | [ ] RED, native select remains |
| select-file-viewer-1 | `design/apps/web/src/components/FileViewer.tsx:17627` | File viewer control | [ ] RED, native select remains |
| select-file-viewer-2 | `design/apps/web/src/components/FileViewer.tsx:17643` | File viewer control | [ ] RED, native select remains |
| select-file-viewer-3 | `design/apps/web/src/components/FileViewer.tsx:17732` | File viewer control | [ ] RED, native select remains |
| select-generated-surface | `design/apps/web/src/components/GenUISurfaceRenderer.tsx:793` | Generated UI select | [ ] RED, native select remains |
| select-library-kind | `design/apps/web/src/components/LibrarySection.tsx:1167` | Library kind filter | [ ] RED, native select remains |
| select-library-source | `design/apps/web/src/components/LibrarySection.tsx:1174` | Library source filter | [ ] RED, native select remains |
| select-manual-edit-1 | `design/apps/web/src/components/ManualEditPanel.tsx:1013` | Manual edit field | [ ] RED, native select remains |
| select-manual-edit-2 | `design/apps/web/src/components/ManualEditPanel.tsx:1048` | Manual edit field | [ ] RED, native select remains |
| select-mcp-client-1 | `design/apps/web/src/components/McpClientSection.tsx:927` | MCP client setting | [ ] RED, native select remains |
| select-mcp-client-2 | `design/apps/web/src/components/McpClientSection.tsx:990` | MCP client setting | [ ] RED, native select remains |
| select-memory | `design/apps/web/src/components/MemorySection.tsx:1998` | Memory setting | [ ] RED, native select remains |
| select-narrator | `design/apps/web/src/components/narrator/NarratorSettingsPanel.tsx:74` | Narrator voice setting | [ ] RED, native select remains |
| select-automation | `design/apps/web/src/components/NewAutomationModal.tsx:1148` | Automation setting | [ ] RED, native select remains |
| select-project-video | `design/apps/web/src/components/NewProjectPanel.tsx:2701` | Project video duration | [ ] RED, native select remains |
| select-project-audio | `design/apps/web/src/components/NewProjectPanel.tsx:2740` | Project audio duration | [ ] RED, native select remains |
| select-plugin-input | `design/apps/web/src/components/PluginInputsForm.tsx:120` | Plugin input adapter | [ ] RED, native select remains |
| select-plugins-view-1 | `design/apps/web/src/components/PluginsView.tsx:3067` | Plugin filter | [ ] RED, native select remains |
| select-plugins-view-2 | `design/apps/web/src/components/PluginsView.tsx:3305` | Plugin filter | [ ] RED, native select remains |
| select-plugins-view-3 | `design/apps/web/src/components/PluginsView.tsx:3584` | Plugin setting | [ ] RED, native select remains |
| select-plugins-view-4 | `design/apps/web/src/components/PluginsView.tsx:3624` | Plugin setting | [ ] RED, native select remains |
| select-question-form | `design/apps/web/src/components/QuestionForm.tsx:609` | Question field | [ ] RED, native select remains |
| select-routines-1 | `design/apps/web/src/components/RoutinesSection.tsx:381` | Routine setting | [ ] RED, native select remains |
| select-routines-2 | `design/apps/web/src/components/RoutinesSection.tsx:804` | Routine setting | [ ] RED, native select remains |
| select-settings-1 | `design/apps/web/src/components/SettingsDialog.tsx:4263` | Settings section | [ ] RED, feature-owned migration pending |
| select-settings-2 | `design/apps/web/src/components/SettingsDialog.tsx:5766` | Settings section | [ ] RED, feature-owned migration pending |
| select-settings-3 | `design/apps/web/src/components/SettingsDialog.tsx:5791` | Settings section | [ ] RED, feature-owned migration pending |
| select-settings-4 | `design/apps/web/src/components/SettingsDialog.tsx:5811` | Settings section | [ ] RED, feature-owned migration pending |
| select-settings-5 | `design/apps/web/src/components/SettingsDialog.tsx:5906` | Settings section | [ ] RED, feature-owned migration pending |
| select-settings-6 | `design/apps/web/src/components/SettingsDialog.tsx:7409` | Settings section | [ ] RED, feature-owned migration pending |
| select-skills-1 | `design/apps/web/src/components/SkillsSection.tsx:649` | Skills filter | [ ] RED, native select remains |
| select-skills-2 | `design/apps/web/src/components/SkillsSection.tsx:669` | Skills filter | [ ] RED, native select remains |
| select-skills-3 | `design/apps/web/src/components/SkillsSection.tsx:690` | Skills setting | [ ] RED, native select remains |
| select-theater | `design/apps/web/src/components/Theater/TheaterTranscript.tsx:88` | Transcript setting | [ ] RED, native select remains |
| select-tab-appearance | `design/apps/web/src/components/workspace-tabs/TabGroupAppearanceEditor.tsx:252` | Tab appearance property | [ ] RED, feature-owned migration pending |
| select-tab-discovery | `design/apps/web/src/components/workspace-tabs/WorkspaceTabDiscovery.tsx:526` | Tab discovery filter | [ ] RED, feature-owned migration pending |

The two text matches below are comments, not controls, and are recorded so the
inventory does not mistake them for hidden rows:

| Row | Source location | State |
| --- | --- | --- |
| select-comment-new-project | `design/apps/web/src/components/NewProjectPanel.tsx:2117` | [x] excluded, documentation comment only |
| select-comment-settings | `design/apps/web/src/components/SettingsDialog.tsx:7436` | [x] excluded, test-description comment only |

## Direct search rows

These are the current direct `input type="search"` rows. Existing
`RegexSearchField` owners are green. Other rows remain red until they are
migrated or explicitly replaced by a feature-owned equivalent that preserves the
same field-owned controller contract.

| Row | Source location | State |
| --- | --- | --- |
| search-brand-reference | `design/apps/web/src/components/BrandReferencePicker.tsx:284` | [ ] RED |
| search-brands | `design/apps/web/src/components/BrandsTab.tsx:188` | [ ] RED |
| search-chat | `design/apps/web/src/components/ChatPane.tsx:2582` | [ ] RED |
| search-community | `design/apps/web/src/components/CommunityView.tsx:265` | [ ] RED, currently read-only |
| search-connectors | `design/apps/web/src/components/ConnectorsBrowser.tsx:880` | [ ] RED |
| search-design-browser | `design/apps/web/src/components/DesignBrowserPanel.tsx:2799` | [ ] RED |
| search-design-browser-2 | `design/apps/web/src/components/DesignBrowserPanel.tsx:3370` | [ ] RED |
| search-design-systems | `design/apps/web/src/components/DesignSystemsSection.tsx:489` | [ ] RED |
| search-design-system-tab | `design/apps/web/src/components/DesignSystemsTab.tsx:1057` | [ ] RED |
| search-design-system-switcher | `design/apps/web/src/components/DesignSystemSwitchPicker.tsx:125` | [ ] RED |
| search-entry-shell | `design/apps/web/src/components/EntryShell.tsx:4361` | [ ] RED |
| search-examples | `design/apps/web/src/components/ExamplesTab.tsx:362` | [ ] RED |
| search-file-viewer | `design/apps/web/src/components/FileViewer.tsx:4064` | [ ] RED |
| search-library | `design/apps/web/src/components/LibraryPicker.tsx:179` | [ ] RED |
| search-library-section | `design/apps/web/src/components/LibrarySection.tsx:1161` | [ ] RED |
| search-mcp-client | `design/apps/web/src/components/McpClientSection.tsx:673` | [ ] RED |
| search-model-options | `design/apps/web/src/components/modelOptions.tsx:616` | [ ] RED |
| search-plugins-home | `design/apps/web/src/components/PluginsHomeSection.tsx:565` | [ ] RED |
| search-plugins | `design/apps/web/src/components/PluginsView.tsx:3042` | [ ] RED |
| search-project-reference | `design/apps/web/src/components/ProjectReferenceModal.tsx:177` | [ ] RED |
| search-skills | `design/apps/web/src/components/SkillsSection.tsx:628` | [ ] RED |
| search-regex-shared | `design/apps/web/src/components/regex/RegexSearchField.tsx:212` | [x] green, shared primitive owns the builder |

## Context-menu rows

| Row | Source location | State |
| --- | --- | --- |
| context-menu-primitive | `design/apps/web/src/components/ContextMenu.tsx` | [x] green, shared primitive now owns filtering and callbacks |
| context-menu-sketch | `design/apps/web/src/components/SketchEditor.tsx:209-210,773-782` | [ ] RED, legacy inline menu adapter remains |

## Migration rule

Feature-owned migration rows must use `CustomSelect` for dropdowns or
`RegexSearchField` for searches, pass a distinct field controller, and add a
focused mounted test. Native controls may remain only when the owning feature
has a documented platform limitation and a usable equivalent with an explicit
red inventory row. The inventory itself is not a discovery registry. Removing a
row without migrating its source is an invalid green result.
