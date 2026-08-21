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
  'live-artifact-present-menu',
  'live-artifact-zoom-menu',
  'file-version-head-download-menu',
  'file-version-footer-download-menu',
  'react-component-share-menu',
  'html-viewer-zoom-menu',
  'html-viewer-toolbar-more-menu',
  'html-viewer-present-menu',
  'html-viewer-share-menu',
  'markdown-download-menu',
] as const;

describe('FileViewer menu search contract', () => {
  it('keeps every inventoried FileViewer menu on the field-owned primitive', () => {
    expect(FILE_VIEWER_MENU_INVENTORY).toHaveLength(10);
    for (const menuId of FILE_VIEWER_MENU_INVENTORY) {
      expect(fileViewerSource).toContain(`menuId="${menuId}"`);
    }
    expect(fileViewerSource.match(/<FileViewerMenuSearch\b/g) ?? []).toHaveLength(
      FILE_VIEWER_MENU_INVENTORY.length,
    );
    // A raw menu is the exact boundary this inventory protects. A renamed
    // wrapper or a comment cannot satisfy the positive list above.
    expect(fileViewerSource).not.toMatch(/<div[^>]*role="menu"/);
  });

  it('keeps search state and focus behaviour per menu', () => {
    expect(menuPrimitiveSource).toContain('useRegexSearch(query, setQuery)');
    expect(menuPrimitiveSource).toContain('aria-controls={resolvedMenuId}');
    expect(menuPrimitiveSource).toContain('autoFocus');
    expect(menuPrimitiveSource).toContain("event.key === 'ArrowDown'");
    expect(menuPrimitiveSource).toContain("event.key === 'ArrowUp'");
    expect(menuPrimitiveSource).toContain("event.key === 'Home'");
    expect(menuPrimitiveSource).toContain("event.key === 'End'");
    expect(menuPrimitiveSource).toContain("event.key === 'Enter'");
    expect(menuPrimitiveSource).toContain("event.key === 'Escape'");
    expect(menuPrimitiveSource).toContain('setQuery(\'\')');
    expect(menuPrimitiveSource).toContain('return () => focusMenuTrigger(triggerRef)');
    expect(menuPrimitiveSource).toContain("t('homeHero.noResults'");
    expect(menuPrimitiveSource).toContain("t('promptTemplates.countLabel'");
  });

  it('keeps the regex field bound to the owning menu collection', () => {
    expect(regexFieldSource).toContain('aria-controls={ariaControls}');
    expect(regexFieldSource).toContain('ariaControls?: string;');
    expect(regexFieldSource).toContain('data-file-viewer-menu-builder');
    expect(outsideDismissSource).toContain('data-file-viewer-menu-builder');
    expect(menuPrimitiveSource).toContain('id={`${resolvedMenuId}-search`}');
  });

  it('keeps direct labels wrappable at narrow bilingual widths', () => {
    expect(viewerToolsSource).toContain('.share-menu-item > span:not(.share-menu-icon)');
    expect(viewerToolsSource).toContain('overflow-wrap: anywhere;');
    expect(viewerToolsSource).toContain('white-space: normal;');
    expect(viewerToolsSource).toContain('min-width: 0;');
    expect(viewerCoreSource).toContain('.viewer-toolbar-more-item span');
    expect(viewerCoreSource).toContain('overflow-wrap: anywhere;');
  });
});
