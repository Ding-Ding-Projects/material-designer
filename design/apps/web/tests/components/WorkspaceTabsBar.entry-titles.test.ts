import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const sourceRoot = resolve(process.cwd(), 'src');
const readSource = (file: string) => readFileSync(resolve(sourceRoot, file), 'utf8');

function entryHomeViews(routerSource: string): string[] {
  const declaration = routerSource.match(
    /export type EntryHomeView\s*=\s*([\s\S]*?);\s*\n\s*\/\*\* Settings subsections/,
  );
  if (!declaration) throw new Error('EntryHomeView declaration is missing');
  return [...declaration[1].matchAll(/\|\s*'([^']+)'/g)].map((match) => match[1]);
}

function entryTitleKeys(tabsSource: string): string[] {
  const declaration = tabsSource.match(
    /const entryTitle: Record<EntryHomeView, string> = \{([\s\S]*?)\n\s*\};\n\s*const entryIcon:/,
  );
  if (!declaration) throw new Error('entryTitle mapping is missing');
  return [...declaration[1].matchAll(/^\s*(?:'([^']+)'|([a-z][a-z-]*)):/gm)].map(
    (match) => match[1] ?? match[2],
  );
}

function entryIconKeys(tabsSource: string): string[] {
  const declaration = tabsSource.match(
    /const entryIcon: Record<EntryHomeView, IconName> = \{([\s\S]*?)\n\s*\};\n\s*return \{/,
  );
  if (!declaration) throw new Error('entryIcon mapping is missing');
  return [...declaration[1].matchAll(/^\s*(?:'([^']+)'|([a-z][a-z-]*)):/gm)].map(
    (match) => match[1] ?? match[2],
  );
}

describe('WorkspaceTabsBar entry titles', () => {
  it('maps every EntryHomeView exactly once and uses the canonical handoff title', () => {
    const router = readSource('router.ts');
    const tabs = readSource('components/WorkspaceTabsBar.tsx');

    expect(entryTitleKeys(tabs).sort()).toEqual(entryHomeViews(router).sort());
    expect(tabs).toMatch(/^\s*handoff: t\('handoff\.title'\),$/m);
  });

  it('turns red when the handoff title mapping is deliberately removed', () => {
    const tabs = readSource('components/WorkspaceTabsBar.tsx');
    const withoutHandoff = tabs.replace(/^\s*handoff: t\('handoff\.title'\),\r?\n/m, '');

    expect(entryTitleKeys(withoutHandoff).sort()).not.toEqual(
      entryHomeViews(readSource('router.ts')).sort(),
    );
  });

  it('maps every EntryHomeView icon exactly once and uses the canonical handoff icon', () => {
    const router = readSource('router.ts');
    const tabs = readSource('components/WorkspaceTabsBar.tsx');

    expect(entryIconKeys(tabs).sort()).toEqual(entryHomeViews(router).sort());
    expect(tabs).toMatch(/^\s*handoff: 'layers-filled',$/m);
  });

  it('turns red when the handoff icon mapping is deliberately removed', () => {
    const tabs = readSource('components/WorkspaceTabsBar.tsx');
    const withoutHandoff = tabs.replace(/^\s*handoff: 'layers-filled',\r?\n/m, '');

    expect(entryIconKeys(withoutHandoff).sort()).not.toEqual(
      entryHomeViews(readSource('router.ts')).sort(),
    );
  });
});
