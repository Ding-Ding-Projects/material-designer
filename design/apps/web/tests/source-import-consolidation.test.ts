import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const CONSOLIDATED_IMPORTS = [
  [new URL('../src/App.tsx', import.meta.url), '@open-design/contracts'],
  [new URL('../src/App.tsx', import.meta.url), './components/WorkspaceTabsBar'],
  [new URL('../src/App.tsx', import.meta.url), './state/projects'],
  [new URL('../src/App.tsx', import.meta.url), './types'],
  [new URL('../src/components/AvatarMenu.tsx', import.meta.url), './agentModelSelection'],
  [new URL('../src/components/ChatPane.tsx', import.meta.url), '@open-design/contracts'],
  [new URL('../src/components/ChatPane.tsx', import.meta.url), '../i18n'],
  [new URL('../src/components/ChatPane.tsx', import.meta.url), '../runtime/todos'],
  [new URL('../src/components/DesignFilesPanel.tsx', import.meta.url), 'react'],
  [new URL('../src/components/DesignFilesPanel.tsx', import.meta.url), '../i18n'],
  [new URL('../src/components/DesignKitView.tsx', import.meta.url), '../i18n'],
  [new URL('../src/components/DesignKitView.tsx', import.meta.url), '../providers/registry'],
  [new URL('../src/components/DesignsTab.tsx', import.meta.url), 'react'],
  [new URL('../src/components/DesignsTab.tsx', import.meta.url), '@open-design/components'],
  [new URL('../src/components/EntryNavRail.tsx', import.meta.url), 'react'],
  [new URL('../src/components/FigmaImportModal.tsx', import.meta.url), '@open-design/contracts'],
  [new URL('../src/components/FigmaImportModal.tsx', import.meta.url), '@open-design/components'],
  [new URL('../src/components/FileWorkspace.tsx', import.meta.url), '@open-design/contracts/analytics'],
  [new URL('../src/components/FileWorkspace.tsx', import.meta.url), '../state/projects'],
  [new URL('../src/components/PluginsView.tsx', import.meta.url), '../i18n'],
  [new URL('../src/components/RecentProjectsStrip.tsx', import.meta.url), 'react'],
  [new URL('../src/components/RecentProjectsStrip.tsx', import.meta.url), '@open-design/components'],
  [new URL('../../../tools/pack/tests/win-lifecycle.test.ts', import.meta.url), 'node:fs/promises'],
] as const;

function moduleImportCount(source: string, moduleName: string): number {
  const singleQuotedSuffix = `from '${moduleName}';`;
  const doubleQuotedSuffix = `from "${moduleName}";`;

  return source
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(
      (line) =>
        (line.startsWith('import ') || line.startsWith('} from ')) &&
        (line.endsWith(singleQuotedSuffix) || line.endsWith(doubleQuotedSuffix)),
    ).length;
}

describe('source import consolidation', () => {
  it('keeps the hand-written consolidation inventory complete', () => {
    expect(CONSOLIDATED_IMPORTS).toHaveLength(23);
  });

  it('counts repeated declarations independently', () => {
    const source = [
      "import { first } from './same-module';",
      "import { second } from './same-module';",
    ].join('\n');

    expect(moduleImportCount(source, './same-module')).toBe(2);
  });

  it.each(CONSOLIDATED_IMPORTS)(
    'keeps audited module %# imported once',
    async (sourceUrl, moduleName) => {
      const source = await readFile(sourceUrl, 'utf8');

      expect(moduleImportCount(source, moduleName), `${sourceUrl.pathname}: ${moduleName}`).toBe(1);
    },
  );
});
