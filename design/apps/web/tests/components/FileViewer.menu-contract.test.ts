import { readFileSync } from 'node:fs';

const fileViewerSource = readFileSync(
  new URL('../../src/components/FileViewer.tsx', import.meta.url),
  'utf8',
);
const menuPrimitiveSource = readFileSync(
  new URL('../../src/components/FileViewerMenuSearch.tsx', import.meta.url),
  'utf8',
);
const regexFieldSource = readFileSync(
  new URL('../../src/components/regex/RegexSearchField.tsx', import.meta.url),
  'utf8',
);
const outsideDismissSource = readFileSync(
  new URL('../../src/hooks/useDismissOnOutsideInteraction.ts', import.meta.url),
  'utf8',
);
const viewerToolsSource = readFileSync(
  new URL('../../src/styles/viewer/tools.css', import.meta.url),
  'utf8',
);
const viewerCoreSource = readFileSync(
  new URL('../../src/styles/viewer/core.css', import.meta.url),
  'utf8',
);

// This is deliberately hand-written. A discovery-only scan would disappear
// with the menu it was meant to protect.
const FILE_VIEWER_MENU_INVENTORY = [
  { id: 'live-artifact-present-menu', kind: 'menu', opener: 'presentTriggerRef' },
  { id: 'live-artifact-zoom-menu', kind: 'menu', opener: 'zoomTriggerRef' },
  { id: 'file-version-head-download-menu', kind: 'menu', opener: 'versionHeadDownloadTriggerRef' },
  { id: 'file-version-footer-download-menu', kind: 'menu', opener: 'versionFooterDownloadTriggerRef' },
  { id: 'react-component-share-menu', kind: 'mixed', opener: 'shareTriggerRef' },
  { id: 'html-viewer-zoom-menu', kind: 'menu', opener: 'zoomTriggerRef' },
  { id: 'html-viewer-toolbar-more-menu', kind: 'menu', opener: 'toolbarMoreTriggerRef' },
  { id: 'html-viewer-present-menu', kind: 'menu', opener: 'presentTriggerRef' },
  { id: 'html-viewer-share-menu', kind: 'mixed', opener: 'shareTriggerRef' },
  { id: 'markdown-download-menu', kind: 'menu', opener: 'downloadTriggerRef' },
] as const;

function assertMenuBoundary(source: string) {
  expect(source).toContain('data-file-viewer-menu-surface={menuId}');
  expect(source).toContain("role={kind === 'mixed' ? 'dialog' : 'group'}");
  expect(source).toContain("role={kind === 'menu' ? 'menu' : 'group'}");
  expect(source).toContain('data-file-viewer-menu-actions={menuId}');
  expect(source).toContain('const [registry, setRegistry]');
  expect(source).toContain('readableActionLabel');
  expect(source).toContain("element.closest('[role=\"listbox\"], [role=\"tree\"], [role=\"tablist\"]')");
  expect(source).toContain('surface.scrollWidth');
  expect(source).toContain('maxHeight');
  expect(source).toContain("event.key === 'Tab'");
}

describe('FileViewer menu search contract', () => {
  it('keeps every inventoried FileViewer menu on the field-owned primitive', () => {
    expect(FILE_VIEWER_MENU_INVENTORY).toHaveLength(10);
    for (const menu of FILE_VIEWER_MENU_INVENTORY) {
      expect(fileViewerSource).toContain(`menuId="${menu.id}"`);
      expect(fileViewerSource).toContain(menu.opener);
      if (menu.kind === 'mixed') {
        expect(fileViewerSource).toContain(`kind="mixed"`);
      }
    }
    expect(fileViewerSource.match(/<FileViewerMenuSearch\b/g) ?? []).toHaveLength(
      FILE_VIEWER_MENU_INVENTORY.length,
    );
    // A raw menu is the exact boundary this inventory protects. A renamed
    // wrapper or a comment cannot satisfy the positive list above.
    expect(fileViewerSource).not.toMatch(/<div[^>]*role="menu"/);
    expect(fileViewerSource).toContain("origin: 'head' | 'footer'");
    expect(fileViewerSource).toContain("origin === 'head'");
    expect(fileViewerSource).toContain("origin === 'footer'");
  });

  it('keeps search state and focus behaviour per menu', () => {
    assertMenuBoundary(menuPrimitiveSource);
    expect(menuPrimitiveSource).toContain('useRegexSearch(query, setQuery)');
    expect(menuPrimitiveSource).toContain('ariaControls={resolvedActionsId}');
    expect(menuPrimitiveSource).toContain('autoFocus');
    expect(menuPrimitiveSource).toContain("event.key === 'ArrowDown'");
    expect(menuPrimitiveSource).toContain("event.key === 'ArrowUp'");
    expect(menuPrimitiveSource).toContain("event.key === 'Home'");
    expect(menuPrimitiveSource).toContain("event.key === 'End'");
    expect(menuPrimitiveSource).toContain("event.key === 'Enter'");
    expect(menuPrimitiveSource).toContain("event.key === 'Escape'");
    expect(menuPrimitiveSource).toContain('setQuery(\'\')');
    expect(menuPrimitiveSource).toContain('return () => focusMenuTrigger(triggerRef)');
    expect(menuPrimitiveSource).toContain('kind === \'mixed\'');
    expect(menuPrimitiveSource).toContain('focusableElements(surfaceRef.current, menuId)');
    expect(menuPrimitiveSource).toContain("t('homeHero.noResults'");
    expect(menuPrimitiveSource).toContain("t('promptTemplates.countLabel'");
  });

  it('keeps the regex field bound to the owning menu collection', () => {
    expect(regexFieldSource).toContain('aria-controls={ariaControls}');
    expect(regexFieldSource).toContain('ariaControls?: string;');
    expect(regexFieldSource).toContain('data-file-viewer-menu-builder');
    expect(outsideDismissSource).toContain('data-file-viewer-menu-builder');
    expect(outsideDismissSource).toContain('ownerToken');
    expect(outsideDismissSource).toContain('data-file-viewer-menu-surface');
    expect(menuPrimitiveSource).toContain('id={`${resolvedMenuId}-search`}');
    expect(menuPrimitiveSource).toContain('CSS.escape(menuId)');
  });

  it('fails closed when a surface, owner token, nested-widget exclusion, or geometry rule disappears', () => {
    const required = [
      'data-file-viewer-menu-surface={menuId}',
      'data-file-viewer-menu-builder="${CSS.escape(menuId)}"',
      "element.closest('[role=\"listbox\"], [role=\"tree\"], [role=\"tablist\"]')",
      'surface.scrollWidth',
      'maxHeight',
    ];
    for (const needle of required) {
      expect(() => {
        const broken = menuPrimitiveSource.replace(needle, '');
        expect(broken).toContain(needle);
      }).toThrow();
    }
  });

  it('keeps direct labels wrappable at narrow bilingual widths', () => {
    expect(viewerToolsSource).toContain('.share-menu-item > span:not(.share-menu-icon)');
    expect(viewerToolsSource).toContain('overflow-wrap: anywhere;');
    expect(viewerToolsSource).toContain('white-space: normal;');
    expect(viewerToolsSource).toContain('min-width: 0;');
    expect(viewerCoreSource).toContain('.viewer-toolbar-more-item span');
    expect(viewerCoreSource).toContain('overflow-wrap: anywhere;');
    expect(viewerToolsSource).toContain('min-height: 48px;');
    expect(viewerToolsSource).toContain('.file-viewer-menu-search__field > button');
    expect(viewerCoreSource).toContain('.viewer-toolbar-more-item {');
  });
});
