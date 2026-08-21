import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { LIBRARY_UI_VISIBLE } from '../src/features/libraryUi';
import { buildPath, parseRoute } from '../src/router';
import { parseLibraryNextOffset } from '../src/providers/registry';

function source(relative: string): string {
  return readFileSync(new URL(`../src/${relative}`, import.meta.url), 'utf8');
}

describe('production Library route contract', () => {
  it('cannot silently regress to the hidden feature flag', () => {
    expect(LIBRARY_UI_VISIBLE).toBe(true);
    expect(source('features/libraryUi.ts')).not.toMatch(/LIBRARY_UI_VISIBLE\s*=\s*false/);
  });

  it('recognizes and builds the canonical route', () => {
    const route = { kind: 'home', view: 'library' } as const;
    expect(parseRoute('/library')).toEqual(route);
    expect(buildPath(route)).toBe('/library');
    expect(parseRoute(buildPath(route))).toEqual(route);
  });

  it('mounts the real LibrarySection behind the normal entry shell', () => {
    const shell = source('components/EntryShell.tsx');
    const rail = source('components/EntryNavRail.tsx');
    expect(shell).toMatch(/import \{ LibrarySection \} from ['"]\.\/LibrarySection['"]/);
    expect(shell).toMatch(/data-testid="entry-view-library"/);
    expect(shell).toMatch(/<LibrarySection\s+active=\{view === 'library'\}/);
    expect(rail).toMatch(/testId="entry-nav-library"/);
    expect(rail).toMatch(/selectView\('library'\)/);
  });

  it('keeps the command palette Library destination single and route-backed', () => {
    const commands = source('components/command-palette/commands.ts');
    const settingsIndex = source('components/command-palette/settingsIndex.ts');
    expect(commands).toMatch(/id: 'go\.library'/);
    expect(commands).toMatch(/view: 'library'/);
    expect(commands).toMatch(/if \(entry\.section === 'library'\) continue/);
    expect(settingsIndex).not.toMatch(/section:\s*'library'/);
  });
});

describe('LibrarySection local search contract', () => {
  it('owns one controller and its adjacent anchored builder', () => {
    const library = source('components/LibrarySection.tsx');
    expect(library).toMatch(/useRegexSearch\(search, setSearch\)/);
    expect(library).toMatch(/<RegexSearchField/);
    expect(library).toMatch(/search=\{librarySearch\}/);
    expect(library).toMatch(/testId="library-search"/);
    expect(library).toMatch(/VisuallyHidden[^>]*role="status"/);
    // No module-level/shared builder state: the host owns the controller and
    // RegexSearchField owns focus return for this field's own popover.
    expect(library).not.toMatch(/const\s+\[.*regex.*\]\s*=\s*useState/);
  });

  it('keeps the dropdown/menu rule explicit in the inventory', () => {
    const library = source('components/LibrarySection.tsx');
    // Kind, source, and dynamic design-system surfaces each own their local
    // controller and anchored builder; no native select or shared menu search
    // is allowed to bypass that rule.
    expect(library).toMatch(/filterByKind/);
    expect(library).toMatch(/filterBySource/);
    expect(library).toMatch(/role="menu"/);
    expect(library).toMatch(/function LibraryFilterCombobox/);
    expect(library).toMatch(/testId=\{`\$\{testId\}-search`\}/);
    expect(library).toMatch(/library-design-system-menu-search/);
    expect(library).not.toMatch(/<select\b/);
  });
});

describe('Library provider, continuation, and live-refresh contracts', () => {
  it('accepts terminal/null and numeric cursors but rejects coercible lookalikes', () => {
    expect(parseLibraryNextOffset(undefined)).toEqual({ ok: true, nextOffset: null });
    expect(parseLibraryNextOffset(null)).toEqual({ ok: true, nextOffset: null });
    expect(parseLibraryNextOffset(0)).toEqual({ ok: true, nextOffset: 0 });
    expect(parseLibraryNextOffset(500)).toEqual({ ok: true, nextOffset: 500 });
    for (const invalid of ['500', false, true, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(parseLibraryNextOffset(invalid)).toEqual({ ok: false });
    }
  });

  it('uses a typed page result and exhaustive bounded continuation', () => {
    const provider = source('providers/registry.ts');
    const daemonRoute = readFileSync(
      new URL('../../../apps/daemon/src/routes/library.ts', import.meta.url),
      'utf8',
    );
    const store = readFileSync(
      new URL('../../../apps/daemon/src/library-store.ts', import.meta.url),
      'utf8',
    );
    expect(provider).toMatch(/export type LibraryAssetFetchResult\s*=/);
    expect(provider).toMatch(/ok: false/);
    expect(provider).toMatch(/fetchAllLibraryAssets/);
    expect(provider).toMatch(/pagination-limit/);
    expect(provider).toMatch(/result\.nextOffset/);
    expect(provider).toMatch(/parseLibraryNextOffset\(json\.nextOffset\)/);
    expect(provider).toMatch(/typeof value !== 'number'/);
    expect(provider).not.toMatch(/Number\(json\.nextOffset\)/);
    expect(daemonRoute).toMatch(/nextOffset:/);
    expect(daemonRoute).toMatch(/pageSize \+ 1/);
    expect(store).toMatch(/OFFSET \$\{offset\}/);
    // A fixed one-page cap is the regression this contract prevents.
    expect(provider).not.toMatch(/fetchLibraryAssets\([^)]*\)\s*:\s*Promise<LibraryAsset\[\]>/);
  });

  it('keeps refresh failures typed, non-destructive, and retryable', () => {
    const section = source('components/LibrarySection.tsx');
    const picker = source('components/LibraryPicker.tsx');
    expect(section).toMatch(/setLibraryError\(result\.error\)/);
    expect(section).toMatch(/finally\s*\{[\s\S]*setLoading\(false\)/);
    expect(section).toMatch(/data-testid="library-load-error"/);
    expect(section).toMatch(/t\('library\.retry'\)/);
    expect(picker).toMatch(/setLoadError\(result\.error\)/);
    expect(picker).toMatch(/data-testid="library-picker-load-error"/);
    expect(picker).toMatch(/fetchAllLibraryAssets/);
  });

  it('broadcasts and consumes reconciliation refreshes', () => {
    const route = readFileSync(
      new URL('../../../apps/daemon/src/routes/library.ts', import.meta.url),
      'utf8',
    );
    const section = source('components/LibrarySection.tsx');
    const picker = source('components/LibraryPicker.tsx');
    expect(route).toMatch(/emit\('reconcile', summary\)/);
    expect(route).toContain('await runReconcile(false).catch(() => {});');
    expect(route).toContain("if (summary.total > 0) emit('reconcile', summary);");
    expect(section).toMatch(/addEventListener\('reconcile', onReconcile\)/);
    expect(picker).toMatch(/addEventListener\('reconcile', refresh\)/);
  });

  it('keeps element filtering open to both image and HTML-backed captures', () => {
    const section = source('components/LibrarySection.tsx');
    const meta = source('components/LibraryAssetMeta.tsx');
    expect(section).toContain("if (kind && kind !== 'element') q.kind = kind;");
    expect(section).toContain('matchesKindFilter(a, kind as KindFilterValue)');
    expect(meta).toContain('return elementMetaOf(asset) ? \'element\' : asset.kind;');
    expect(meta).toContain('metadata.element');
  });

  it('does not let stale page walks commit rows or errors', () => {
    for (const component of ['components/LibrarySection.tsx', 'components/LibraryPicker.tsx']) {
      const text = source(component);
      expect(text).toContain('loadGenerationRef.current + 1');
      expect(text).toContain('loadAbortRef.current?.abort()');
      expect(text).toContain('if (generation !== loadGenerationRef.current) return;');
      expect(text).toContain('if (generation === loadGenerationRef.current)');
    }
  });
});

describe('Library interaction regression contracts', () => {
  it('keeps the collapsed rail visible and operable', () => {
    const rail = source('components/EntryNavRail.tsx');
    expect(rail).not.toMatch(/setAttribute\('inert'/);
    expect(rail).not.toMatch(/aria-hidden=\{open \? undefined : true\}/);
    expect(rail).toMatch(/testId="entry-nav-library"/);
  });

  it('keeps visible-only selection and explicit scope', () => {
    const section = source('components/LibrarySection.tsx');
    expect(section).toMatch(/visibleAssetsRef/);
    expect(section).toMatch(/visibleAssetEntries\.map\(\(\{ asset \}\)/);
    expect(section).toMatch(/scopeVisible/);
    expect(section).toMatch(/data-testid="library-selection-scope"/);
  });

  it('uses the shared dialog focus scope for all Library modal surfaces', () => {
    for (const modal of ['LibraryPicker.tsx', 'LibraryUploadModal.tsx', 'LibraryPreviewModal.tsx']) {
      const text = source(`components/${modal}`);
      expect(text).toMatch(/<Dialog/);
      expect(text).toMatch(/ariaLabelledBy/);
      expect(text).toMatch(/closeOnEscape/);
      expect(text).toMatch(/onClose=/);
    }
    const upload = source('components/LibraryUploadModal.tsx');
    expect(upload).toMatch(/inFlight\.current > 0/);
    expect(upload).toMatch(/disabled=\{pending\}/);
  });

  it('keeps each handoff/search menu labelled and independently searchable', () => {
    const picker = source('components/LibraryPicker.tsx');
    const section = source('components/LibrarySection.tsx');
    const commands = source('components/command-palette/commands.ts');
    expect(picker).toMatch(/testId="library-picker-search"/);
    expect(picker).toMatch(/useRegexSearch\(search, setSearch\)/);
    expect(section).toMatch(/dsMenuSearch = useRegexSearch/);
    expect(section).toMatch(/moveDesignSystemMenuFocus/);
    expect(section).toMatch(/closeDsMenu/);
    expect(section).toMatch(/event\.key === 'ArrowDown'/);
    expect(section).toMatch(/event\.key === 'Escape'/);
    expect(section).toMatch(/dsMenuButtonRef\.current\?\.focus/);
    expect(commands).toMatch(/if \(entry\.section === 'library'\) continue/);
  });

  it('keeps search controls outside the menu/listbox ownership boundary', () => {
    const section = source('components/LibrarySection.tsx');
    const picker = source('components/LibraryPicker.tsx');
    expect(section).toContain('className={styles.dsMenu}\n                role="group"');
    expect(section).toContain('className={styles.dsMenuItems}\n                  role="menu"');
    expect(section).toContain('className={styles.dsMenuDivider} role="separator"');
    expect(section).toContain('className={styles.dsMenuHeader} role="presentation"');
    expect(section).not.toContain('className={styles.dsMenu}\n                role="menu"');
    expect(section).toContain('className={styles.filterComboPanel}\n          role="group"');
    expect(section).toContain('id={listId} role="listbox"');
    expect(picker).toContain('className={styles.kinds} role="group"');
    expect(picker).toContain('aria-pressed={kind === k}');
    expect(picker).not.toContain('role="tablist"');
  });

  it('keeps uploads cancellable, bounded, measurable, and partially reportable', () => {
    const upload = source('components/LibraryUploadModal.tsx');
    const provider = source('providers/registry.ts');
    expect((upload.match(/e\.preventDefault\(\)/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(upload).toContain('value={overallProgress}');
    expect(upload).toContain('uploadAbortRef.current?.abort()');
    expect(upload).toContain("status: cancelled ? 'cancelled' : 'error'");
    expect(provider).toContain('xhr.upload.addEventListener');
    expect(provider).toContain('options.signal?.addEventListener');
    expect(provider).toContain('new Blob([text]).size > LIBRARY_UPLOAD_MAX_BYTES');
  });

  it('keeps Library destructive and recovery copy declared in both shipped dictionaries', () => {
    const section = source('components/LibrarySection.tsx');
    const english = source('i18n/locales/en.ts');
    const traditional = source('i18n/locales/zh-TW.ts');
    const types = source('i18n/types.ts');
    for (const key of [
      'deleteAction',
      'deleteTarget',
      'deleteItemOwned',
      'deleteItemReferenced',
      'deleteMore',
      'deleteDetailMixed',
      'deleteDetailOwned',
      'deleteDetailReferenced',
      'handoffPrompt',
    ]) {
      expect(section).toContain(`library.${key}`);
      expect(english).toContain(`'library.${key}'`);
      expect(traditional).toContain(`'library.${key}'`);
      expect(types).toContain(`'library.${key}'`);
    }
    expect(section).not.toContain('Nothing in Open Design');
  });

  it('keeps selection controls visible to keyboard focus and wraps narrow actions', () => {
    const sectionCss = source('components/LibrarySection.module.css');
    const pickerCss = source('components/LibraryPicker.module.css');
    expect(sectionCss).toMatch(/\.card:focus-within \.selectCheck/);
    expect(sectionCss).toMatch(/\.selectCheck:focus-visible/);
    expect(sectionCss).toMatch(/@media \(max-width: 760px\)/);
    expect(pickerCss).toMatch(/@media \(max-width: 560px\)/);
  });
});
