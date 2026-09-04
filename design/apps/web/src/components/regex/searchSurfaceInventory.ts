// Hand-written completeness inventory for the current desktop and documentation
// search surfaces. This is intentionally not discovered from JSX: a missing
// component would otherwise disappear from the list and make a green check
// meaningless.

export type SearchSurfaceKind = 'desktop' | 'documentation';
export type SearchSurfaceStatus = 'wired' | 'not-wired' | 'not-applicable';

export interface SearchSurfaceInventoryRow {
  id: string;
  surface: SearchSurfaceKind;
  owner: string;
  sourcePath: string;
  searchMarker: string;
  builderMarker: string;
  stateMarker: string;
  /** Stable field ids, one per rendered search field instance. */
  fieldIds: readonly string[];
  instances: number;
  status: SearchSurfaceStatus;
  scopeNote: string;
}

/**
 * Every required row is listed once. `instances` is explicit for a reusable
 * host such as the ten FileViewer menus, so adding a new call site requires a
 * deliberate inventory edit instead of silently inheriting generic coverage.
 */
export const REGEX_SEARCH_SURFACE_INVENTORY: readonly SearchSurfaceInventoryRow[] = [
  { id: 'desktop-entry-topbar', surface: 'desktop', owner: 'EntryTopbarSearch', sourcePath: 'design/apps/web/src/components/EntryTopbarSearch.tsx', searchMarker: 'testId="entry-topbar-search-field"', builderMarker: '<RegexSearchField', stateMarker: 'search={search}', fieldIds: ['entry-topbar-search-field'], instances: 1, status: 'wired', scopeNote: 'Shell search and command-palette handoff.' },
  { id: 'desktop-command-palette', surface: 'desktop', owner: 'CommandPalette', sourcePath: 'design/apps/web/src/components/command-palette/CommandPalette.tsx', searchMarker: 'testId="command-palette-search"', builderMarker: '<RegexSearchField', stateMarker: 'search={search}', fieldIds: ['command-palette-search'], instances: 1, status: 'wired', scopeNote: 'Palette command, setting, and destination search.' },
  { id: 'desktop-settings', surface: 'desktop', owner: 'SettingsDialog', sourcePath: 'design/apps/web/src/components/SettingsDialog.tsx', searchMarker: 'testId="settings-search"', builderMarker: '<RegexSearchField', stateMarker: 'search={settingsSearch}', fieldIds: ['settings-search'], instances: 1, status: 'wired', scopeNote: 'Settings page search.' },
  { id: 'desktop-settings-overflow', surface: 'desktop', owner: 'SettingsTabStrip', sourcePath: 'design/apps/web/src/components/settings/SettingsTabStrip.tsx', searchMarker: 'testId="settings-tabs-overflow-search"', builderMarker: '<RegexSearchField', stateMarker: 'search={menuSearch}', fieldIds: ['settings-tabs-overflow-search'], instances: 1, status: 'wired', scopeNote: 'Settings tab overflow menu search.' },
  { id: 'desktop-changelog', surface: 'desktop', owner: 'ChangelogDialog', sourcePath: 'design/apps/web/src/components/changelog/ChangelogDialog.tsx', searchMarker: 'testId="changelog-search"', builderMarker: '<RegexSearchField', stateMarker: 'search={searchRegex}', fieldIds: ['changelog-search'], instances: 1, status: 'wired', scopeNote: 'Changelog text search.' },
  { id: 'desktop-history', surface: 'desktop', owner: 'VersionHistoryDialog', sourcePath: 'design/apps/web/src/components/history/VersionHistoryDialog.tsx', searchMarker: 'testId="history-search"', builderMarker: '<RegexSearchField', stateMarker: 'search={searchRegex}', fieldIds: ['history-search'], instances: 1, status: 'wired', scopeNote: 'Local history search.' },
  { id: 'desktop-notifications', surface: 'desktop', owner: 'NotificationCenter', sourcePath: 'design/apps/web/src/components/notifications/NotificationCenter.tsx', searchMarker: 'testId="notification-search"', builderMarker: '<RegexSearchField', stateMarker: 'search={search}', fieldIds: ['notification-search'], instances: 1, status: 'wired', scopeNote: 'Notification history search.' },
  { id: 'desktop-handoff', surface: 'desktop', owner: 'HandoffView', sourcePath: 'design/apps/web/src/components/handoff/HandoffView.tsx', searchMarker: 'searchId="handoff-token-search"', builderMarker: '<RegexSearchField', stateMarker: 'search={tokenSearch}', fieldIds: ['handoff-token-search', 'handoff-component-search'], instances: 2, status: 'wired', scopeNote: 'Token and component registry searches use separate controllers.' },
  { id: 'desktop-file-viewer-present-menu', surface: 'desktop', owner: 'FileViewer', sourcePath: 'design/apps/web/src/components/FileViewer.tsx', searchMarker: '<FileViewerMenuSearch', builderMarker: 'fieldId="file-viewer-present-menu-search"', stateMarker: 'open={presentMenuOpen}', fieldIds: ['file-viewer-live-present-menu-search', 'file-viewer-present-menu-search'], instances: 2, status: 'wired', scopeNote: 'The two actual FileViewer presentation menus each mount the shared menu search helper with a stable field id.' },
  { id: 'desktop-file-viewer-zoom-menu', surface: 'desktop', owner: 'FileViewer', sourcePath: 'design/apps/web/src/components/FileViewer.tsx', searchMarker: '<FileViewerMenuSearch', builderMarker: 'fieldId="file-viewer-zoom-menu-search"', stateMarker: 'open={zoomMenuOpen}', fieldIds: ['file-viewer-zoom-menu-search'], instances: 1, status: 'wired', scopeNote: 'The actual FileViewer zoom menu owns its stable search field.' },
  { id: 'desktop-file-viewer-live-zoom-menu', surface: 'desktop', owner: 'LiveArtifactViewer', sourcePath: 'design/apps/web/src/components/FileViewer.tsx', searchMarker: '<FileViewerMenuSearch', builderMarker: 'fieldId="file-viewer-live-zoom-menu-search"', stateMarker: 'open={zoomMenuOpen}', fieldIds: ['file-viewer-live-zoom-menu-search'], instances: 1, status: 'wired', scopeNote: 'The actual live-artifact FileViewer zoom menu owns its stable search field.' },
  { id: 'desktop-file-viewer-toolbar-more-menu', surface: 'desktop', owner: 'FileViewer', sourcePath: 'design/apps/web/src/components/FileViewer.tsx', searchMarker: '<FileViewerMenuSearch', builderMarker: 'fieldId="file-viewer-toolbar-more-menu-search"', stateMarker: 'open={toolbarMoreOpen}', fieldIds: ['file-viewer-toolbar-more-menu-search'], instances: 1, status: 'wired', scopeNote: 'The actual FileViewer toolbar More menu owns its stable search field.' },
  { id: 'desktop-file-viewer-version-download-menu', surface: 'desktop', owner: 'FileViewer', sourcePath: 'design/apps/web/src/components/FileViewer.tsx', searchMarker: '<FileViewerMenuSearch', builderMarker: 'fieldId="file-viewer-version-download-menu-search"', stateMarker: 'open={Boolean(downloadMenuVersionId)}', fieldIds: ['file-viewer-version-download-menu-search'], instances: 1, status: 'wired', scopeNote: 'The actual FileViewer version-download menu owns its stable search field.' },
  { id: 'desktop-file-viewer-unified-action-menu', surface: 'desktop', owner: 'FileViewer', sourcePath: 'design/apps/web/src/components/FileViewer.tsx', searchMarker: '<FileViewerMenuSearch', builderMarker: 'fieldId="file-viewer-unified-action-menu-search"', stateMarker: 'open={deployMenuOpen}', fieldIds: ['file-viewer-unified-action-menu-search'], instances: 1, status: 'wired', scopeNote: 'The actual FileViewer unified share and export menu owns its stable search field.' },
  { id: 'desktop-file-viewer-component-unified-menu', surface: 'desktop', owner: 'ReactComponentViewer', sourcePath: 'design/apps/web/src/components/FileViewer.tsx', searchMarker: '<FileViewerMenuSearch', builderMarker: 'fieldId="file-viewer-component-unified-menu-search"', stateMarker: 'open={shareMenuOpen}', fieldIds: ['file-viewer-component-unified-menu-search'], instances: 1, status: 'wired', scopeNote: 'The actual React component FileViewer share and export menu owns its stable search field.' },
  { id: 'desktop-file-viewer-markdown-download-menu', surface: 'desktop', owner: 'MarkdownViewer', sourcePath: 'design/apps/web/src/components/FileViewer.tsx', searchMarker: '<FileViewerMenuSearch', builderMarker: 'fieldId="file-viewer-markdown-download-menu-search"', stateMarker: 'open={downloadMenuOpen}', fieldIds: ['file-viewer-markdown-download-menu-search'], instances: 1, status: 'wired', scopeNote: 'The actual Markdown FileViewer download menu owns its stable search field.' },
  { id: 'desktop-tabs-current-strip', surface: 'desktop', owner: 'WorkspaceTabDiscovery', sourcePath: 'design/apps/web/src/components/workspace-tabs/WorkspaceTabDiscovery.tsx', searchMarker: 'testId="workspace-tabs-strip-search"', builderMarker: '<RegexSearchField', stateMarker: 'search={search}', fieldIds: ['workspace-tabs-strip-search'], instances: 1, status: 'wired', scopeNote: 'Current strip discovery.' },
  { id: 'desktop-tabs-groups', surface: 'desktop', owner: 'WorkspaceTabDiscovery', sourcePath: 'design/apps/web/src/components/workspace-tabs/WorkspaceTabDiscovery.tsx', searchMarker: 'testId="workspace-tabs-group-search"', builderMarker: '<RegexSearchField', stateMarker: 'search={search}', fieldIds: ['workspace-tabs-group-search'], instances: 1, status: 'wired', scopeNote: 'Tab-group discovery.' },
  { id: 'desktop-tabs-inside-group', surface: 'desktop', owner: 'WorkspaceTabDiscovery', sourcePath: 'design/apps/web/src/components/workspace-tabs/WorkspaceTabDiscovery.tsx', searchMarker: 'testId={`workspace-tabs-group-tab-search-${group.id}`}', builderMarker: '<RegexSearchField', stateMarker: 'search={search}', fieldIds: ['workspace-tabs-group-tab-search-${group.id}'], instances: 1, status: 'wired', scopeNote: 'Search within one group.' },
  { id: 'desktop-tabs-master', surface: 'desktop', owner: 'WorkspaceTabDiscovery', sourcePath: 'design/apps/web/src/components/workspace-tabs/WorkspaceTabDiscovery.tsx', searchMarker: 'testId="workspace-tabs-master-search"', builderMarker: '<RegexSearchField', stateMarker: 'search={search}', fieldIds: ['workspace-tabs-master-search'], instances: 1, status: 'wired', scopeNote: 'Master open-tab search.' },
  { id: 'desktop-library', surface: 'desktop', owner: 'LibrarySection', sourcePath: 'design/apps/web/src/components/LibrarySection.tsx', searchMarker: 'testId="library-search"', builderMarker: '<RegexSearchField', stateMarker: 'search={librarySearch}', fieldIds: ['library-search'], instances: 1, status: 'wired', scopeNote: 'Library asset search.' },
  { id: 'desktop-library-picker', surface: 'desktop', owner: 'LibraryPicker', sourcePath: 'design/apps/web/src/components/LibraryPicker.tsx', searchMarker: 'testId="library-picker-search"', builderMarker: '<RegexSearchField', stateMarker: 'search={searchRegex}', fieldIds: ['library-picker-search'], instances: 1, status: 'wired', scopeNote: 'Library selection search.' },
  { id: 'desktop-library-kind-filter', surface: 'desktop', owner: 'LibraryFilterCombobox', sourcePath: 'design/apps/web/src/components/LibrarySection.tsx', searchMarker: 'testId={`${testId}-search`}', builderMarker: '<RegexSearchField', stateMarker: 'search={search}', fieldIds: ['library-kind-filter-search'], instances: 1, status: 'wired', scopeNote: 'Kind filter picker search.' },
  { id: 'desktop-library-source-filter', surface: 'desktop', owner: 'LibraryFilterCombobox', sourcePath: 'design/apps/web/src/components/LibrarySection.tsx', searchMarker: 'testId={`${testId}-search`}', builderMarker: '<RegexSearchField', stateMarker: 'search={search}', fieldIds: ['library-source-filter-search'], instances: 1, status: 'wired', scopeNote: 'Source filter picker search.' },
  { id: 'desktop-library-design-system-menu', surface: 'desktop', owner: 'LibrarySection', sourcePath: 'design/apps/web/src/components/LibrarySection.tsx', searchMarker: 'testId="library-design-system-menu-search"', builderMarker: '<RegexSearchField', stateMarker: 'search={dsSearch}', fieldIds: ['library-design-system-menu-search'], instances: 1, status: 'wired', scopeNote: 'Design-system action menu search.' },
  { id: 'documentation-site', surface: 'documentation', owner: 'site/assets/js/main.js', sourcePath: 'site/index.html', searchMarker: 'id="site-search-input"', builderMarker: 'id="site-search-builder"', stateMarker: 'regex.attachRegexBuilder', fieldIds: ['site-search-input'], instances: 1, status: 'wired', scopeNote: 'Documentation-page content search.' },
  { id: 'documentation-settings', surface: 'documentation', owner: 'site/assets/js/main.js', sourcePath: 'site/index.html', searchMarker: 'id="settings-search-input"', builderMarker: 'id="settings-search-builder"', stateMarker: 'regex.attachRegexBuilder', fieldIds: ['settings-search-input'], instances: 1, status: 'wired', scopeNote: 'Documentation-page settings search.' },
  { id: 'site-tab-overflow', surface: 'documentation', owner: 'site/assets/js/tabs.js', sourcePath: 'site/assets/js/tabs.js', searchMarker: 'id: `md-tabs-search-${owner}`', builderMarker: 'attachRegexBuilder', stateMarker: 'REGEX_DIALECT', fieldIds: ['md-tabs-search-tab-strip-overflow'], instances: 1, status: 'wired', scopeNote: 'Documentation tab overflow search.' },
  { id: 'site-tab-list', surface: 'documentation', owner: 'site/assets/js/tabs.js', sourcePath: 'site/assets/js/tabs.js', searchMarker: 'id: `md-tabs-search-${owner}`', builderMarker: 'attachRegexBuilder', stateMarker: 'REGEX_DIALECT', fieldIds: ['md-tabs-search-tab-strip-search'], instances: 1, status: 'wired', scopeNote: 'Documentation searchable tab list.' },
  { id: 'site-context-menu', surface: 'documentation', owner: 'site/assets/js/tabs.js', sourcePath: 'site/assets/js/tabs.js', searchMarker: 'id: `md-tabs-search-${owner}`', builderMarker: 'attachRegexBuilder', stateMarker: 'REGEX_DIALECT', fieldIds: ['md-tabs-search-tab-context-menu'], instances: 1, status: 'wired', scopeNote: 'Documentation tab context-menu filter.' },
  { id: 'site-tabs-inside-group', surface: 'documentation', owner: 'site/assets/js/tabs.js', sourcePath: 'site/assets/js/tabs.js', searchMarker: 'NOT_WIRED:site-tabs-inside-group', builderMarker: 'NOT_WIRED', stateMarker: 'NOT_WIRED', fieldIds: ['site-tabs-inside-group'], instances: 1, status: 'not-wired', scopeNote: 'RED: site has no persisted tab-group model yet; the tabs lane must add the field before release.' },
  { id: 'site-tab-groups', surface: 'documentation', owner: 'site/assets/js/tabs.js', sourcePath: 'site/assets/js/tabs.js', searchMarker: 'NOT_WIRED:site-tab-groups', builderMarker: 'NOT_WIRED', stateMarker: 'NOT_WIRED', fieldIds: ['site-tab-groups'], instances: 1, status: 'not-wired', scopeNote: 'RED: site has no tab-group-name surface yet; the tabs lane must add the field before release.' },
  { id: 'site-tabs-master', surface: 'documentation', owner: 'site/assets/js/tabs.js', sourcePath: 'site/assets/js/tabs.js', searchMarker: 'NOT_WIRED:site-tabs-master', builderMarker: 'NOT_WIRED', stateMarker: 'NOT_WIRED', fieldIds: ['site-tabs-master'], instances: 1, status: 'not-wired', scopeNote: 'RED: site owns one strip and no cross-window model yet; the tabs lane must add the master field before release.' },
] as const;

/** Deliberately repeated by hand so deleting a row turns the regression red. */
export const EXPECTED_REGEX_SEARCH_SURFACE_IDS = [
  'desktop-entry-topbar',
  'desktop-command-palette',
  'desktop-settings',
  'desktop-settings-overflow',
  'desktop-changelog',
  'desktop-history',
  'desktop-notifications',
  'desktop-handoff',
  'desktop-file-viewer-present-menu',
  'desktop-file-viewer-zoom-menu',
  'desktop-file-viewer-live-zoom-menu',
  'desktop-file-viewer-toolbar-more-menu',
  'desktop-file-viewer-version-download-menu',
  'desktop-file-viewer-unified-action-menu',
  'desktop-file-viewer-component-unified-menu',
  'desktop-file-viewer-markdown-download-menu',
  'desktop-tabs-current-strip',
  'desktop-tabs-groups',
  'desktop-tabs-inside-group',
  'desktop-tabs-master',
  'desktop-library',
  'desktop-library-picker',
  'desktop-library-kind-filter',
  'desktop-library-source-filter',
  'desktop-library-design-system-menu',
  'documentation-site',
  'documentation-settings',
  'site-tab-overflow',
  'site-tab-list',
  'site-context-menu',
  'site-tabs-inside-group',
  'site-tab-groups',
  'site-tabs-master',
] as const;

export function validateRegexSearchSurfaceInventory(
  rows: readonly SearchSurfaceInventoryRow[] = REGEX_SEARCH_SURFACE_INVENTORY,
): void {
  const ids = rows.map((row) => row.id);
  if (ids.length !== EXPECTED_REGEX_SEARCH_SURFACE_IDS.length) {
    throw new Error('Regex search-surface inventory is incomplete.');
  }
  for (const expected of EXPECTED_REGEX_SEARCH_SURFACE_IDS) {
    if (!ids.includes(expected)) throw new Error(`Regex search surface is missing: ${expected}`);
  }
  if (new Set(ids).size !== ids.length) throw new Error('Regex search-surface inventory contains a duplicate id.');
  for (const row of rows) {
    if (!row.owner || !row.sourcePath || !row.searchMarker || !row.builderMarker || !row.stateMarker || row.instances < 1 || row.fieldIds.length !== row.instances) {
      throw new Error(`Regex search surface registration is incomplete: ${row.id}`);
    }
    if (row.status === 'not-wired' && !row.scopeNote.startsWith('RED:')) {
      throw new Error(`Unwired regex search surface needs an explicit red scope note: ${row.id}`);
    }
  }
  const fieldIds = rows.flatMap((row) => row.fieldIds);
  if (new Set(fieldIds).size !== fieldIds.length) throw new Error('Regex search field ids must be unique.');
}

// Fail closed when this registry is consumed by the application or its tests.
// The explicit expected-id list above is the negative-regression boundary.
validateRegexSearchSurfaceInventory();
