#!/usr/bin/env node

/**
 * Fail-closed source contract for the design handoff registry.
 *
 * This guard is intentionally not a discovery tool. Its identifiers, source
 * paths, locale keys and wiring boundaries are hand-written here so removing
 * the whole surface cannot make the check quietly discover an empty list.
 * `--negative` removes each exact boundary in memory and requires the guard to
 * turn red before restoring the original source.
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const web = (...parts) => path.join(root, 'design', 'apps', 'web', 'src', ...parts);
const registryPath = web('components', 'handoff', 'registry.ts');
const selectionPath = web('components', 'handoff', 'selection.ts');
const viewPath = web('components', 'handoff', 'HandoffView.tsx');
const cssPath = web('components', 'handoff', 'HandoffView.module.css');
const routerPath = web('router.ts');
const settingsPath = web('components', 'SettingsDialog.tsx');
const tabsPath = web('components', 'settings', 'settingsTabs.ts');
const indexPath = web('components', 'command-palette', 'settingsIndex.ts');
const palettePath = web('components', 'command-palette', 'CommandPalette.tsx');
const localesDir = web('i18n', 'locales');

const TOKEN_IDS = [
  'color-primary-accent', 'color-on-primary-contrast', 'color-surface-bg',
  'color-surface-bg-app', 'color-surface-container-low-panel',
  'color-surface-container-subtle', 'color-surface-container-high-muted',
  'color-surface-container-highest-elevated', 'color-on-surface-text',
  'color-on-surface-text-strong', 'color-on-surface-variant-muted',
  'color-outline-variant-border', 'color-outline-border-strong',
  'shape-corner-medium-radius', 'shape-corner-large-radius',
  'shape-corner-full-pill', 'elevation-two-shadow-md', 'typeface-plain-sans',
];
const OWNER_IDS = [
  'entry-shell', 'entry-nav-rail', 'entry-topbar-search', 'workspace-tabs-bar',
  'settings-dialog', 'settings-tab-strip', 'command-palette',
  'regex-search-field', 'appearance-runtime', 'app-status-bar',
  'button-primitive', 'text-field-primitive',
];
const LOCALE_KEYS = [
  'handoff.title', 'handoff.tabHint', 'handoff.eyebrow', 'handoff.subtitle',
  'handoff.statusNote', 'handoff.backToSettings', 'handoff.exportAria',
  'handoff.exportLabel', 'handoff.copySelected', 'handoff.copyAll',
  'handoff.exportSelected', 'handoff.exportAll', 'handoff.tokensTitle',
  'handoff.tokensDescription', 'handoff.componentsTitle',
  'handoff.componentsDescription', 'handoff.selectionCount',
  'handoff.searchAria', 'handoff.searchPlaceholder', 'handoff.bulkAria',
  'handoff.selectThisList', 'handoff.selectAllMatches',
  'handoff.invertSelection', 'handoff.clearSelection', 'handoff.noMatches',
  'handoff.selectRow', 'handoff.swatchAria', 'handoff.privacyNote',
];

function read(file) {
  if (!fs.existsSync(file)) throw new Error(`missing file: ${path.relative(root, file)}`);
  return fs.readFileSync(file, 'utf8');
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

function balancedBraces(source) {
  const clean = stripComments(source);
  let depth = 0;
  for (const char of clean) {
    if (char === '{') depth += 1;
    else if (char === '}' && --depth < 0) return false;
  }
  return depth === 0;
}

function assertExactIds(source, declaration, ids) {
  const match = source.match(new RegExp(`export const ${declaration}[^=]*= \\[([\\s\\S]*?)\\] as const;`));
  if (!match) throw new Error(`missing exact ${declaration} declaration`);
  const actual = [...match[1].matchAll(/id:\s*'([^']+)'/g)].map((item) => item[1]);
  if (actual.length !== ids.length || actual.some((id, index) => id !== ids[index])) {
    throw new Error(`${declaration} ids drifted: expected ${ids.length} exact rows, got ${actual.join(', ')}`);
  }
}

function assertContains(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`missing ${label}: ${needle}`);
}

function runChecks(sources = null) {
  const files = {
    registry: sources?.registry ?? read(registryPath),
    selection: sources?.selection ?? read(selectionPath),
    view: sources?.view ?? read(viewPath),
    css: sources?.css ?? read(cssPath),
    router: sources?.router ?? read(routerPath),
    settings: sources?.settings ?? read(settingsPath),
    tabs: sources?.tabs ?? read(tabsPath),
    index: sources?.index ?? read(indexPath),
    palette: sources?.palette ?? read(palettePath),
  };
  for (const [name, source] of Object.entries(files)) {
    if (!balancedBraces(source)) throw new Error(`${name} has unbalanced braces`);
  }
  assertExactIds(files.registry, 'HANDOFF_TOKEN_MAPPINGS', TOKEN_IDS);
  assertExactIds(files.registry, 'HANDOFF_COMPONENT_OWNERS', OWNER_IDS);
  assertContains(files.registry, 'HANDOFF_REGISTRY_SOURCE_PATHS', 'registry source-path declaration');
  assertContains(files.registry, "'apps/web/src/styles/md3-tokens.css'", 'Material Design 3 source path');
  assertContains(files.registry, "'apps/web/src/styles/tokens.css'", 'application token source path');
  assertContains(files.registry, "status: 'implemented'", 'implemented status');
  assertContains(files.registry, "status: 'partial'", 'partial status');
  assertContains(files.registry, "status: 'unverified'", 'unverified status');
  if ((files.registry.match(/md3Token:/g) ?? []).length !== 18) throw new Error('token mapping declaration count is not 18');
  if ((files.registry.match(/appVariable:/g) ?? []).length !== 18) throw new Error('application-variable declaration count is not 18');
  assertContains(files.view, "schema: 'material-designer.handoff.v1'", 'export schema');
  assertContains(files.view, 'privateData: \'omitted\'', 'private-data omission');
  assertContains(files.view, 'useRegexSearch(tokenQuery', 'token-owned regex controller');
  assertContains(files.view, 'useRegexSearch(componentQuery', 'component-owned regex controller');
  assertContains(files.view, 'handoff-token-search', 'token search route');
  assertContains(files.view, 'handoff-component-search', 'component search route');
  assertContains(files.view, "['json', 'markdown', 'csv']", 'faithful export format set');
  assertContains(files.view, 'selectHandoffIds(selection, filteredIds)', 'this-list selection');
  assertContains(files.view, 'selectHandoffIds(selection, allIds)', 'all-match selection');
  assertContains(files.view, 'invertHandoffSelection(selection, filteredIds)', 'inverse selection');
  if (!/var\(--md-sys-[^)]+\)/.test(files.css) || !/var\(--md-ref-[^)]+\)/.test(files.css)) throw new Error('handoff CSS does not consume Material Design 3 roles');
  if (/#(?:[0-9a-f]{3,8})\b/i.test(files.css)) throw new Error('handoff CSS contains copied literal colors');
  assertContains(files.router, "| 'handoff'", 'EntryHomeView handoff member');
  assertContains(files.router, "parts[0] === 'handoff'", 'handoff route parser');
  assertContains(files.router, "route.view === 'handoff'", 'handoff route builder');
  assertContains(files.settings, "| 'handoff'", 'SettingsSection handoff member');
  assertContains(files.settings, "section === 'handoff'", 'virtual SettingsSection route');
  assertContains(files.tabs, "section: 'handoff'", 'settings virtual tab');
  assertContains(files.tabs, "value !== 'handoff'", 'handoff non-restorable boundary');
  assertContains(files.index, 'handoff: true', 'settings index token');
  assertContains(files.index, "sectionAnchorFor('handoff')", 'settings index handoff anchor');
  assertContains(files.palette, "entry.section === 'handoff'", 'palette handoff route');
  const localeFiles = fs.readdirSync(localesDir).filter((file) => file.endsWith('.ts'));
  if (localeFiles.length !== 20) throw new Error(`expected 20 locale dictionaries, found ${localeFiles.length}`);
  for (const file of localeFiles) {
    const source = read(path.join(localesDir, file));
    for (const key of LOCALE_KEYS) {
      if (!new RegExp(`['\"]${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['\"]\\s*:`).test(source)) {
        throw new Error(`${file} is missing locale key ${key}`);
      }
    }
  }
  return { tokenRows: TOKEN_IDS.length, ownerRows: OWNER_IDS.length, locales: localeFiles.length };
}

function runNegative() {
  const original = {
    registry: read(registryPath), selection: read(selectionPath), view: read(viewPath),
    css: read(cssPath), router: read(routerPath), settings: read(settingsPath),
    tabs: read(tabsPath), index: read(indexPath), palette: read(palettePath),
  };
  const boundaries = [
    ['token', 'registry', "id: 'color-primary-accent',"],
    ['component', 'registry', "id: 'entry-shell',"],
    ['source', 'registry', "'apps/web/src/styles/md3-tokens.css'"],
    ['status', 'registry', "status: 'unverified'"],
    ['route', 'router', "parts[0] === 'handoff'"],
    ['tab', 'tabs', "section: 'handoff'"],
    ['palette', 'palette', "entry.section === 'handoff'"],
    ['export', 'view', "['json', 'markdown', 'csv']"],
    ['search', 'view', 'useRegexSearch(tokenQuery'],
  ];
  for (const [label, file, needle] of boundaries) {
    const changed = { ...original };
    changed[file] = changed[file].replace(needle, '');
    let failed = false;
    try { runChecks(changed); } catch { failed = true; }
    if (!failed) throw new Error(`negative boundary stayed green: ${label}`);
    process.stdout.write(`RED then restored: ${label}\n`);
  }
  runChecks(original);
  process.stdout.write('GREEN after restoring every handoff boundary\n');
}

try {
  const result = runChecks();
  if (process.argv.includes('--negative')) runNegative();
  else process.stdout.write(`handoff contract green: ${JSON.stringify(result)}\n`);
} catch (error) {
  process.stderr.write(`handoff contract red: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
