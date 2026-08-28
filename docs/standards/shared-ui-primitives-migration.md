# Shared menu and dropdown primitive migration

This is the hand-written migration inventory for the shared menu and dropdown
primitives. It is intentionally explicit. A checked row means the surface has
been reviewed and uses the shared primitive, not that a text search happened to
find one of its descendants. An unchecked row is a red migration row and stays
visible until its owning feature lane migrates it.

## Shared primitive rows

| Row | Source | Contract | State |
| --- | --- | --- | --- |
| primitive-context-menu | `design/apps/web/src/components/ContextMenu.tsx` | Target-specific menu with required localized labels and disabled-reason copy, field-owned plain-text-first search, anchored regex builder, stable field id forwarded to the regex workbench, isolated menu state, positive result count, keyboard navigation that excludes unavailable rows, active scrolling, focus return, viewport recompute, shortcut registry display, typed appearance and lock lifecycle receipts (`requested`, `opened`, `completed`, `cancelled`) with phase-specific authorization, duplicate-id refusal, sanitized DOM identity collision checks, and fail-closed destructive confirmation receipt handoff. Snippet/history persistence is owned by the regex workbench, not duplicated here. | [x] implemented, mounted tests present |
| primitive-custom-select | `design/apps/web/src/components/CustomSelect.tsx` | Target-specific dropdown with readonly option/group types, explicit stable option ids, required localized labels and duplicate/disabled reason copy, field-owned plain-text-first search, anchored regex builder, stable field id forwarded to the regex workbench, isolated select state, filtered groups, positive result count, keyboard navigation, focus return, active-option scrolling, viewport recompute, duplicate owner/id refusal markers including sanitized DOM identity collisions, typed locked-trigger pointer/touch/keyboard/AT/programmatic lifecycle receipts (`requested`, `opened`, `completed`, `cancelled`), visible disabled reasons, context-menu wrapper, and an optional trigger context-menu handoff. Snippet/history persistence is owned by the regex workbench, not duplicated here. | [x] implemented, mounted tests present |
| primitive-regex-active-result | `design/apps/web/src/components/regex/RegexSearchField.tsx` | Search fields can expose the active filtered result to their own listbox or menu through `aria-activedescendant` without sharing controller state. | [x] implemented, mounted tests present |

## Native select rows

Every row below is an exact remaining migration target. The application still
uses the native control at the listed location, so each row is deliberately red
until its feature owner supplies equivalent options, localization, validation,
search, and the adjacent anchored regex builder.

| Row | Source location | Owning surface | State |
| --- | --- | --- | --- |
| select-collab-role | `design/apps/web/src/collab/CollabDemoView.tsx:146` | Collaboration demo role | [x] migrated to `CustomSelect`, mounted builder coverage added |
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
| search-regex-shared | `design/apps/web/src/components/regex/RegexSearchField.tsx:222` | [x] green, shared primitive owns the builder |

## Search-like controls beyond literal `type="search"`

The following source rows are search-like controls identified by their local
search/filter containers, placeholders, or labels. They are listed separately
because a text input can be a search field without declaring an HTML search
type. Each row is RED until it has the same field-owned builder contract.

| Row | Source location | State |
| --- | --- | --- |
| searchlike-chat-composer-plus-1 | `design/apps/web/src/components/ChatComposer.tsx:725` | [ ] RED |
| searchlike-chat-composer-plus-2 | `design/apps/web/src/components/ChatComposer.tsx:887` | [ ] RED |
| searchlike-chat-composer-tools-plugins | `design/apps/web/src/components/ChatComposer.tsx:4258` | [ ] RED |
| searchlike-chat-composer-tools-mcp | `design/apps/web/src/components/ChatComposer.tsx:4365` | [ ] RED |
| searchlike-chat-composer-toolbox | `design/apps/web/src/components/ChatComposer.tsx:4570` | [ ] RED |
| searchlike-chat-composer-skills | `design/apps/web/src/components/ChatComposer.tsx:4772` | [ ] RED |
| searchlike-chat-history | `design/apps/web/src/components/ChatPane.tsx:2579` | [ ] RED |
| searchlike-connectors | `design/apps/web/src/components/ConnectorsBrowser.tsx:874` | [ ] RED |
| searchlike-design-browser-use | `design/apps/web/src/components/DesignBrowserPanel.tsx:2796` | [ ] RED |
| searchlike-design-browser-reference | `design/apps/web/src/components/DesignBrowserPanel.tsx:3364` | [ ] RED |
| searchlike-design-system-picker | `design/apps/web/src/components/DesignSystemPicker.tsx:313` | [ ] RED |
| searchlike-designs-tab | `design/apps/web/src/components/DesignsTab.tsx:654` | [ ] RED |
| searchlike-design-systems-tab | `design/apps/web/src/components/DesignSystemsTab.tsx:1037` | [ ] RED |
| searchlike-entry-shell | `design/apps/web/src/components/EntryShell.tsx:4356` | [ ] RED |
| searchlike-examples | `design/apps/web/src/components/ExamplesTab.tsx:357` | [ ] RED |
| searchlike-file-viewer | `design/apps/web/src/components/FileViewer.tsx:4061` | [ ] RED |
| searchlike-file-workspace | `design/apps/web/src/components/FileWorkspace.tsx:8095` | [ ] RED |
| searchlike-library | `design/apps/web/src/components/LibrarySection.tsx:1157` | [ ] RED |
| searchlike-mcp | `design/apps/web/src/components/McpClientSection.tsx:674` | [ ] RED |
| searchlike-model-options | `design/apps/web/src/components/modelOptions.tsx:613` | [ ] RED |
| searchlike-project-prompts | `design/apps/web/src/components/NewProjectPanel.tsx:1928` | [ ] RED |
| searchlike-project-design-system | `design/apps/web/src/components/NewProjectPanel.tsx:2406` | [ ] RED |
| searchlike-project-model | `design/apps/web/src/components/NewProjectPanel.tsx:2939` | [ ] RED |
| searchlike-next-step | `design/apps/web/src/components/NextStepActions.tsx:933` | [ ] RED |
| searchlike-plugins-home | `design/apps/web/src/components/PluginsHomeSection.tsx:562` | [ ] RED |
| searchlike-plugins-marketplace | `design/apps/web/src/components/PluginsView.tsx:2131` | [ ] RED |
| searchlike-plugins-available | `design/apps/web/src/components/PluginsView.tsx:3038` | [ ] RED |
| searchlike-project-reference | `design/apps/web/src/components/ProjectReferenceModal.tsx:173` | [ ] RED |
| searchlike-project-search | `design/apps/web/src/components/ProjectSearchModal.tsx:134` | [ ] RED |
| searchlike-prompt-templates | `design/apps/web/src/components/PromptTemplatesTab.tsx:104` | [ ] RED |
| searchlike-quick-switcher | `design/apps/web/src/components/QuickSwitcher.tsx:161` | [ ] RED |
| searchlike-skills | `design/apps/web/src/components/SkillsSection.tsx:627` | [ ] RED |
| searchlike-tab-launcher | `design/apps/web/src/components/workspace/TabLauncherMenu.tsx:218` | [ ] RED |

## Context-menu rows

The source currently contains exactly 50 `role="menu"` containers. This is a
hand-written list, not a discovery result. Every row below must eventually use
the shared menu contract or document a verified equivalent. Rows marked RED are
unfinished and remain completion blockers.

| Row | Source location | State |
| --- | --- | --- |
| menu-chat-composer-1 | `design/apps/web/src/components/ChatComposer.tsx:2860` | [ ] RED |
| menu-chat-composer-2 | `design/apps/web/src/components/ChatComposer.tsx:2920` | [ ] RED |
| menu-chat-history | `design/apps/web/src/components/ChatPane.tsx:2545` | [ ] RED |
| menu-composer-mode | `design/apps/web/src/components/ComposerModePicker.tsx:238` | [ ] RED |
| menu-composer-plus-1 | `design/apps/web/src/components/ComposerPlusMenu.tsx:601` | [ ] RED |
| menu-composer-plus-2 | `design/apps/web/src/components/ComposerPlusMenu.tsx:985` | [ ] RED |
| menu-context-primitive | `design/apps/web/src/components/ContextMenu.tsx:467` | [~] partial, shared primitive is covered but no genuine production caller exists in this lane |
| menu-design-browser-1 | `design/apps/web/src/components/DesignBrowserPanel.tsx:2588` | [ ] RED |
| menu-design-browser-2 | `design/apps/web/src/components/DesignBrowserPanel.tsx:2791` | [ ] RED |
| menu-design-files | `design/apps/web/src/components/DesignFilesPanel.tsx:1349` | [ ] RED |
| menu-design-kit | `design/apps/web/src/components/DesignKitView.tsx:2033` | [ ] RED |
| menu-designs-tab | `design/apps/web/src/components/DesignsTab.tsx:973` | [ ] RED |
| menu-entry-help | `design/apps/web/src/components/EntryHelpMenu.tsx:102` | [ ] RED |
| menu-entry-nav-account | `design/apps/web/src/components/EntryNavRail.tsx:842` | [ ] RED |
| menu-entry-nav-overflow | `design/apps/web/src/components/EntryNavRail.tsx:1530` | [ ] RED |
| menu-entry-settings-1 | `design/apps/web/src/components/EntrySettingsMenu.tsx:196` | [ ] RED |
| menu-entry-settings-2 | `design/apps/web/src/components/EntrySettingsMenu.tsx:232` | [ ] RED |
| menu-examples-share | `design/apps/web/src/components/ExamplesTab.tsx:694` | [ ] RED |
| menu-file-viewer-present-1 | `design/apps/web/src/components/FileViewer.tsx:2383` | [~] partial owner-specific search, shared migration open |
| menu-file-viewer-zoom-2 | `design/apps/web/src/components/FileViewer.tsx:2465` | [~] partial owner-specific search, shared migration open |
| menu-file-viewer-actions-1 | `design/apps/web/src/components/FileViewer.tsx:4253` | [~] partial owner-specific search, shared migration open |
| menu-file-viewer-share-1 | `design/apps/web/src/components/FileViewer.tsx:6954` | [~] partial owner-specific search, shared migration open |
| menu-file-viewer-zoom-3 | `design/apps/web/src/components/FileViewer.tsx:15941` | [~] partial owner-specific search, shared migration open |
| menu-file-viewer-more | `design/apps/web/src/components/FileViewer.tsx:15983` | [~] partial owner-specific search, shared migration open |
| menu-file-viewer-present-2 | `design/apps/web/src/components/FileViewer.tsx:16167` | [~] partial owner-specific search, shared migration open |
| menu-file-viewer-share-2 | `design/apps/web/src/components/FileViewer.tsx:16268` | [~] partial owner-specific search, shared migration open |
| menu-file-viewer-share-3 | `design/apps/web/src/components/FileViewer.tsx:19243` | [~] partial owner-specific search, shared migration open |
| menu-home-subtype | `design/apps/web/src/components/HomeHero.tsx:3617` | [ ] RED |
| menu-home-more | `design/apps/web/src/components/HomeHero.tsx:3768` | [ ] RED |
| menu-inline-model | `design/apps/web/src/components/InlineModelSwitcher.tsx:1294` | [ ] RED |
| menu-language | `design/apps/web/src/components/LanguageMenu.tsx:69` | [ ] RED |
| menu-library | `design/apps/web/src/components/LibrarySection.tsx:1278` | [ ] RED |
| menu-next-step-1 | `design/apps/web/src/components/NextStepActions.tsx:860` | [ ] RED |
| menu-next-step-2 | `design/apps/web/src/components/NextStepActions.tsx:924` | [ ] RED |
| menu-next-step-3 | `design/apps/web/src/components/NextStepActions.tsx:995` | [ ] RED |
| menu-plugin-scenario | `design/apps/web/src/components/plugin-details/PluginScenarioDetail.tsx:187` | [ ] RED |
| menu-plugin-share | `design/apps/web/src/components/plugin-details/PluginShareMenu.tsx:234` | [ ] RED |
| menu-plugin-card | `design/apps/web/src/components/plugins-home/PluginCard.tsx:329` | [ ] RED |
| menu-plugins-marketplace | `design/apps/web/src/components/PluginsView.tsx:2360` | [ ] RED |
| menu-preview-1 | `design/apps/web/src/components/PreviewModal.tsx:620` | [ ] RED |
| menu-preview-2 | `design/apps/web/src/components/PreviewModal.tsx:686` | [ ] RED |
| menu-recent-projects-1 | `design/apps/web/src/components/RecentProjectsStrip.tsx:1443` | [ ] RED |
| menu-recent-projects-2 | `design/apps/web/src/components/RecentProjectsStrip.tsx:1479` | [ ] RED |
| menu-recent-projects-3 | `design/apps/web/src/components/RecentProjectsStrip.tsx:1539` | [ ] RED |
| menu-recent-projects-4 | `design/apps/web/src/components/RecentProjectsStrip.tsx:1931` | [ ] RED |
| menu-session-mode | `design/apps/web/src/components/SessionModeToggle.tsx:344` | [ ] RED |
| menu-settings-tabs | `design/apps/web/src/components/settings/SettingsTabStrip.tsx:480` | [ ] RED |
| menu-working-dir-1 | `design/apps/web/src/components/WorkingDirPicker.tsx:117` | [ ] RED |
| menu-working-dir-2 | `design/apps/web/src/components/WorkingDirPicker.tsx:155` | [ ] RED |
| menu-workspace-switcher | `design/apps/web/src/components/WorkspaceSwitcher.tsx:89` | [ ] RED |

The legacy sketch adapter is also tracked even though it has no `role="menu"`
container in this source scan:

| Row | Source location | State |
| --- | --- | --- |
| context-menu-sketch-adapter | `design/apps/web/src/components/SketchEditor.tsx:209-210,773-782` | [ ] RED, legacy inline menu adapter remains |

## Migration rule

Feature-owned migration rows must use `CustomSelect` for dropdowns or
`RegexSearchField` for searches, pass a distinct field controller, and add a
focused mounted test. Native controls may remain only when the owning feature
has a documented platform limitation and a usable equivalent with an explicit
red inventory row. The inventory itself is not a discovery registry. Removing a
row without migrating its source is an invalid green result.
