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
const regexBuilderSource = readFileSync(
  new URL('../../src/components/regex/RegexBuilder.tsx', import.meta.url),
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
  { id: 'live-artifact-present-menu', kind: 'menu', opener: 'presentTriggerRef', open: 'open={presentMenuOpen}', onClose: 'onClose={() => setPresentMenuOpen(false)}', className: 'className="present-menu"' },
  { id: 'live-artifact-zoom-menu', kind: 'menu', opener: 'zoomTriggerRef', open: 'open={zoomMenuOpen}', onClose: 'onClose={() => setZoomMenuOpen(false)}', className: 'className="zoom-menu-popover"' },
  { id: 'file-version-head-download-menu', kind: 'menu', opener: 'versionHeadDownloadTriggerRef', open: 'open', onClose: 'onClose={() => setDownloadMenuVersionId(null)}', className: 'className="share-menu-popover file-version-download-menu"' },
  { id: 'file-version-footer-download-menu', kind: 'menu', opener: 'versionFooterDownloadTriggerRef', open: 'open', onClose: 'onClose={() => setDownloadMenuVersionId(null)}', className: 'className="artifact-version-panel__popover share-menu-popover file-version-download-menu"' },
  { id: 'react-component-share-menu', kind: 'mixed', opener: 'shareTriggerRef', open: 'open={shareMenuOpen}', onClose: 'onClose={() => setShareMenuOpen(false)}', className: 'className="share-menu-popover chrome-unified-popover"' },
  { id: 'html-viewer-zoom-menu', kind: 'menu', opener: 'zoomTriggerRef', open: 'open={zoomMenuOpen}', onClose: 'onClose={() => setZoomMenuOpen(false)}', className: 'className="zoom-menu-popover"' },
  { id: 'html-viewer-toolbar-more-menu', kind: 'menu', opener: 'toolbarMoreTriggerRef', open: 'open={toolbarMoreOpen}', onClose: 'onClose={() => setToolbarMoreOpen(false)}', className: 'className="viewer-toolbar-more-menu"' },
  { id: 'html-viewer-present-menu', kind: 'menu', opener: 'presentTriggerRef', open: 'open={presentMenuOpen}', onClose: 'onClose={() => setPresentMenuOpen(false)}', className: 'className="present-menu"' },
  { id: 'html-viewer-share-menu', kind: 'mixed', opener: 'shareTriggerRef', open: 'open={deployMenuOpen}', onClose: 'onClose={() => setDeployMenuOpen(false)}', className: 'className="share-menu-popover chrome-unified-popover"' },
  { id: 'markdown-download-menu', kind: 'menu', opener: 'downloadTriggerRef', open: 'open={downloadMenuOpen}', onClose: 'onClose={() => setDownloadMenuOpen(false)}', className: 'className="share-menu-popover"' },
] as const;

function countExact(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

function menuBlocks(source: string): string[] {
  const blocks: string[] = [];
  let cursor = 0;
  while (true) {
    const start = source.indexOf('<FileViewerMenuSearch', cursor);
    if (start < 0) return blocks;
    const close = source.indexOf('</FileViewerMenuSearch>', start);
    expect(close).toBeGreaterThan(start);
    blocks.push(source.slice(start, close + '</FileViewerMenuSearch>'.length));
    cursor = close + '</FileViewerMenuSearch>'.length;
  }
}

function menuBlock(source: string, menuId: string): string {
  const idIndex = source.indexOf(`menuId="${menuId}"`);
  expect(idIndex).toBeGreaterThanOrEqual(0);
  const start = source.lastIndexOf('<FileViewerMenuSearch', idIndex);
  const close = source.indexOf('</FileViewerMenuSearch>', idIndex);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(close).toBeGreaterThan(start);
  return source.slice(start, close + '</FileViewerMenuSearch>'.length);
}

function expectRedThenGreenExactMutation(
  source: string,
  needle: string,
  mutate: (value: string) => string,
  expectedCount = 1,
) {
  expect(countExact(source, needle)).toBe(expectedCount);
  expect(() => expect(countExact(mutate(source), needle)).toBe(expectedCount)).toThrow();
  expect(countExact(source, needle)).toBe(expectedCount);
}

function expectRedThenGreenNegativeMutation(source: string, needle: string, mutate: (value: string) => string) {
  expect(countExact(source, needle)).toBe(0);
  expect(() => expect(countExact(mutate(source), needle)).toBe(0)).toThrow();
  expect(countExact(source, needle)).toBe(0);
}

function assertMenuBoundary(source: string) {
  expect(source).toContain('data-file-viewer-menu-surface={resolvedSurfaceId}');
  expect(source).toContain("role={kind === 'mixed' ? 'dialog' : 'group'}");
  expect(source).toContain("role={kind === 'menu' ? 'menu' : 'group'}");
  expect(source).toContain('data-file-viewer-menu-actions={resolvedSurfaceId}');
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
    const blocks = menuBlocks(fileViewerSource);
    expect(blocks).toHaveLength(FILE_VIEWER_MENU_INVENTORY.length);
    for (const menu of FILE_VIEWER_MENU_INVENTORY) {
      const block = menuBlock(fileViewerSource, menu.id);
      expect(countExact(block, `menuId="${menu.id}"`)).toBe(1);
      expect(block).toContain(`triggerRef={${menu.opener}}`);
      expect(block).toContain(menu.open);
      expect(block).toContain(menu.onClose);
      expect(block).toContain(menu.className);
      if (menu.kind === 'mixed') {
        expect(block).toContain('kind="mixed"');
      }
    }
    // A raw menu is the exact boundary this inventory protects. Mutating the
    // structural opening tag must turn this check red, not leave a substring
    // in a comment or descendant selector to satisfy it.
    expectRedThenGreenNegativeMutation(
      fileViewerSource,
      '<div role="menu"',
      (source) => source.replace('<FileViewerMenuSearch', '<div role="menu"/><FileViewerMenuSearch'),
    );
    expect(fileViewerSource).toContain("origin: 'head' | 'footer'");
    expect(fileViewerSource).toContain("origin === 'head'");
    expect(fileViewerSource).toContain("origin === 'footer'");
  });

  it('keeps search state and focus behaviour per menu', () => {
    assertMenuBoundary(menuPrimitiveSource);
    expect(menuPrimitiveSource).toContain('useRegexSearch(query, setQuery)');
    expect(menuPrimitiveSource).toContain('ariaControls={resolvedActionsId}');
    expect(menuPrimitiveSource).toContain('autoFocus={Boolean(triggerRef?.current)}');
    expect(menuPrimitiveSource).toContain("event.key === 'ArrowDown'");
    expect(menuPrimitiveSource).toContain("event.key === 'ArrowUp'");
    expect(menuPrimitiveSource).toContain("event.key === 'Home'");
    expect(menuPrimitiveSource).toContain("event.key === 'End'");
    expect(menuPrimitiveSource).toContain("event.key === 'Enter'");
    expect(menuPrimitiveSource).toContain("event.key === 'Escape'");
    expect(menuPrimitiveSource).toContain('setQuery(\'\')');
    expect(menuPrimitiveSource).toContain('return () => focusMenuTrigger(triggerRef)');
    expect(menuPrimitiveSource).toContain('isOwnedTrigger(event.target, triggerRef)');
    expect(menuPrimitiveSource).toContain('kind === \'mixed\'');
    expect(menuPrimitiveSource).toContain('focusableElements(surfaceRef.current, resolvedSurfaceId)');
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
    expect(menuPrimitiveSource).toContain('id={`${resolvedSurfaceId}-search`}');
    expect(menuPrimitiveSource).toContain('CSS.escape(resolvedSurfaceId)');
  });

  it('fails closed when a surface, owner token, nested-widget exclusion, or geometry rule disappears', () => {
    expectRedThenGreenExactMutation(menuPrimitiveSource, 'data-file-viewer-menu-surface={resolvedSurfaceId}', (source) => source.replace('data-file-viewer-menu-surface={resolvedSurfaceId}', 'data-file-viewer-menu-surface={menuId}'));
    expectRedThenGreenExactMutation(menuPrimitiveSource, 'data-file-viewer-menu-actions={resolvedSurfaceId}', (source) => source.replace('data-file-viewer-menu-actions={resolvedSurfaceId}', 'data-file-viewer-menu-actions={menuId}'));
    expectRedThenGreenExactMutation(menuPrimitiveSource, 'isOwnedRegexBuilder(event.target, resolvedSurfaceId)', (source) => source.replace('isOwnedRegexBuilder(event.target, resolvedSurfaceId)', 'isOwnedRegexBuilder(event.target, menuId)'), 2);
    expectRedThenGreenExactMutation(menuPrimitiveSource, "element.closest('[role=\"listbox\"], [role=\"tree\"], [role=\"tablist\"]')", (source) => source.replace("element.closest('[role=\"listbox\"], [role=\"tree\"], [role=\"tablist\"]')", 'element'));
    expectRedThenGreenExactMutation(menuPrimitiveSource, 'surface.scrollWidth', (source) => source.replace('surface.scrollWidth', 'surface.clientWidth'));
    expectRedThenGreenExactMutation(menuPrimitiveSource, 'maxHeight', (source) => source.replace('maxHeight', 'height'), 3);
  });

  it('keeps no-opener, disabled, mixed-focus, portal and inactive-viewer boundaries explicit', () => {
    expect(menuPrimitiveSource).toContain('if (!trigger) {');
    expect(menuPrimitiveSource).toContain('if (triggerRef?.current) searchInputRef.current?.focus();');
    expect(menuPrimitiveSource).toContain("!action.element.matches(':disabled')");
    expect(menuPrimitiveSource).toContain('isOwnedSurface(event.target, resolvedSurfaceId)');
    expect(menuPrimitiveSource).toContain('isOwnedTrigger(event.target, triggerRef)');
    expect(menuPrimitiveSource).toContain('data-file-viewer-menu-builder={resolvedSurfaceId}');
    expect(fileViewerSource).toContain('workspaceActive={workspaceActive}\n        downloadRequest={downloadRequest}');
    expect(fileViewerSource).toContain('{workspaceActive && downloadMenuOpen ? (');
    expect(fileViewerSource).toContain('viewerOnly || !workspaceActive');
    expect(regexBuilderSource).toContain('role="alert"');
    expect(menuPrimitiveSource).toContain('search.matches(action.label)');
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
