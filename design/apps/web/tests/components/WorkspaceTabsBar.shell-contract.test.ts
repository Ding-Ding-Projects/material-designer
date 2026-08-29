import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), 'src');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

function directShellChildren(source: string): string[] {
  const start = source.indexOf('      <div\n        className={`workspace-shell');
  const end = source.indexOf('\n      </div>\n      {clientType', start);
  if (start < 0 || end < 0) throw new Error('workspace shell JSX is missing');

  const markup = source.slice(start, end);
  const children: string[] = [];
  let depth = 0;
  let rootSeen = false;
  let offset = 0;
  while (offset < markup.length) {
    const startTag = markup.indexOf('<', offset);
    if (startTag < 0) break;
    let braceDepth = 0;
    let quote: string | null = null;
    let escaped = false;
    let endTag = -1;
    for (let index = startTag + 1; index < markup.length; index += 1) {
      const character = markup[index]!;
      if (quote !== null) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === quote) quote = null;
        continue;
      }
      if (character === '"' || character === "'") {
        quote = character;
        continue;
      }
      if (character === '{') {
        braceDepth += 1;
        continue;
      }
      if (character === '}') {
        braceDepth -= 1;
        continue;
      }
      if (character === '>' && braceDepth === 0) {
        endTag = index;
        break;
      }
    }
    if (endTag < 0) throw new Error('workspace shell contains an unterminated JSX tag');
    const token = markup.slice(startTag, endTag + 1);
    offset = endTag + 1;
    if (token === '<>') {
      depth += 1;
      continue;
    }
    if (token === '</>') {
      depth -= 1;
      continue;
    }
    const closing = token.startsWith('</');
    const selfClosing = /\/\s*>$/.test(token);
    const name = /^<\/?([A-Za-z][A-Za-z0-9.]*)/.exec(token)?.[1];
    if (!name) continue;
    if (!rootSeen) {
      if (closing || name !== 'div' || selfClosing) {
        throw new Error('workspace shell root must be an opening div');
      }
      rootSeen = true;
      depth = 1;
      continue;
    }
    if (closing) {
      depth -= 1;
      continue;
    }
    if (depth === 1) children.push(name);
    if (!selfClosing) depth += 1;
  }
  if (!rootSeen || depth !== 1) throw new Error(`workspace shell JSX nesting is unbalanced at depth ${depth}`);
  return children;
}

function assertDirectShellContract(source: string): void {
  expect(directShellChildren(source)).toEqual([
    'WindowTitleBar',
    'FrontScreenProvenance',
    'div',
    'AppStatusBar',
  ]);
}

function assertBalancedCss(source: string): void {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
  let depth = 0;
  for (const character of withoutComments) {
    if (character === '{') depth += 1;
    if (character === '}') depth -= 1;
    if (depth < 0) throw new Error('CSS closes a block before it opens one');
  }
  if (depth !== 0) throw new Error(`CSS leaves ${depth} block(s) open`);
}

function assertShellRows(source: string): void {
  if (!source.includes('grid-template-rows: 0 42px minmax(0, 1fr) 28px')) {
    throw new Error('native-caption shell rows are not explicit');
  }
  if (!source.includes('grid-template-rows: 40px 42px minmax(0, 1fr) 28px')) {
    throw new Error('frameless shell rows are not explicit');
  }
  if (!source.includes("grid-row: 4;")) throw new Error('status row is implicit');
  if (source.includes('grid-template-rows: 44px minmax(0, 1fr)')) {
    throw new Error('legacy two-row shell still wins');
  }
}

describe('shared shell chrome source contract', () => {
  it('mounts the native title bar first and the status bar last', () => {
    const app = read('App.tsx');
    expect(app).toMatch(/import \{ WindowTitleBar \} from ['"]\.\/components\/WindowTitleBar['"]/);
    expect(app).toMatch(/import \{ AppStatusBar \} from ['"]\.\/components\/AppStatusBar['"]/);
    assertDirectShellContract(app);
    expect(app).toContain('<AppStatusBar\n          daemonLive={daemonLive}');
    expect(app).toContain('          config={config}\n          designSystems={designSystems}');
    expect(app).toContain('          version={appVersionInfo?.version}');

    const nestedTitleBar = app.replace(
      '        <WindowTitleBar />\n',
      '        <div>\n          <WindowTitleBar />\n        </div>\n',
    );
    expect(nestedTitleBar).not.toBe(app);
    expect(() => assertDirectShellContract(nestedTitleBar)).toThrow();

    const statusMarkup =
      '        <AppStatusBar\n'
      + '          daemonLive={daemonLive}\n'
      + '          config={config}\n'
      + '          designSystems={designSystems}\n'
      + '          version={appVersionInfo?.version}\n'
      + '        />';
    const nestedStatusBar = app.replace(
      statusMarkup,
      `        <div>\n${statusMarkup.replace(/^        /gm, '          ')}\n        </div>`,
    );
    expect(nestedStatusBar).not.toBe(app);
    expect(() => assertDirectShellContract(nestedStatusBar)).toThrow();
  });

  it('keeps the shell, routines and entry layout syntactically balanced', () => {
    assertBalancedCss(read('../src/styles/shell.css'));
    assertBalancedCss(read('../src/styles/viewer/routines.css'));
    assertBalancedCss(read('../src/styles/home/entry-layout.css'));
  });

  it('owns four explicit shell rows and scale-aware dimensions', () => {
    const shell = read('../src/styles/shell.css');
    assertShellRows(shell);
    expect(shell).toContain('width: var(--od-vw, 100dvw)');
    expect(shell).toContain('height: var(--od-vh, 100dvh)');
    expect(shell).not.toMatch(/(?:^|\n)\s*(?:width|max-width|height): 100vw;/);
    expect(shell).not.toMatch(/(?:^|\n)\s*height: 100vh;/);
  });

  it('does not allow the legacy rail width or malformed routine geometry back in', () => {
    const rail = read('../src/styles/home/entry-layout.css');
    const routines = read('../src/styles/viewer/routines.css');
    expect(rail).not.toContain('--entry-rail-width: 236px');
    expect(rail).toContain('--entry-rail-width: 88px');
    expect(rail).toContain('--entry-rail-width-expanded: 260px');
    expect(routines).toContain('height: 36px;');
    expect(routines).not.toContain('grid-template-rows: 52px minmax(0, 1fr)');
  });

  it('keeps the final shell contract stronger than the imported routine sheet', () => {
    const index = read('../src/index.css');
    const shell = read('../src/styles/shell.css');
    expect(index.indexOf("@import './styles/shell.css'"))
      .toBeLessThan(index.indexOf("@import './styles/viewer/routines.css'"));
    expect(shell).toContain('.workspace-shell[data-client-type]');
    expect(shell).toContain('.workspace-shell[data-client-type]:has(> [data-window-title-bar])');
  });

  it('keeps rail controls to one icon and one sighted label', () => {
    const rail = read('../src/components/EntryNavRail.tsx');
    expect(rail).toContain('entry-nav-rail__btn-icon');
    expect(rail).toContain('entry-nav-rail__btn-label');
    expect(rail).not.toContain('<span className="entry-nav-rail__label">');
    expect(rail).not.toContain('⌘K');
    expect(rail).toContain("formatShortcut('commandPalette.open'");
  });

  it('keeps tabs field-owned and uses a bounded Move picker', () => {
    const tabs = read('../src/components/WorkspaceTabsBar.tsx');
    expect(tabs).toContain('RegexSearchField');
    expect(tabs).toContain('TabGroupMovePicker');
    expect(tabs).toContain('groupMoveTabId');
    expect(tabs).toContain('role="tablist"');
    expect(tabs).toContain('tabIndex={active ? 0 : -1}');
    expect(tabs).not.toContain('{groups.map((group) => (');
  });

  it('turns red when a required shell row is deliberately removed', () => {
    const shell = read('../src/styles/shell.css');
    expect(() => assertShellRows(shell.replace('grid-row: 4;', 'grid-row: auto;'))).toThrow();
    expect(() => assertShellRows(shell)).not.toThrow();
  });
});
