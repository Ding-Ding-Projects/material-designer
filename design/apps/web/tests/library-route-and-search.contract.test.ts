import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { LIBRARY_UI_VISIBLE } from '../src/features/libraryUi';
import { buildPath, parseRoute } from '../src/router';

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
    // This lane leaves the existing kind/source selects and design-system
    // menu actions intact. Any future edit to either surface must add that
    // surface's own local search and anchored builder in the same change.
    expect(library).toMatch(/filterByKind/);
    expect(library).toMatch(/filterBySource/);
    expect(library).toMatch(/role="menu"/);
    expect(library).toMatch(/RegexSearchField/);
  });
});
