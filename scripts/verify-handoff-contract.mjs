#!/usr/bin/env node

/**
 * Fail-closed source contract for the design handoff registry.
 *
 * This is an explicit contract, not a discovery report. It parses the two
 * registry arrays, validates their exact row sets and schemas, resolves every
 * referenced path against the exact case-sensitive Git index, and checks the
 * route/search/settings/export boundaries. `--negative` removes each complete
 * boundary in memory and requires red, then restores the original source and
 * requires green.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const design = (...parts) => path.join(root, 'design', ...parts);
const web = (...parts) => design('apps', 'web', 'src', ...parts);
const registryPath = web('components', 'handoff', 'registry.ts');
const selectionPath = web('components', 'handoff', 'selection.ts');
const exportPath = web('components', 'handoff', 'export.ts');
const viewPath = web('components', 'handoff', 'HandoffView.tsx');
const cssPath = web('components', 'handoff', 'HandoffView.module.css');
const regexFieldPath = web('components', 'regex', 'RegexSearchField.tsx');
const routerPath = web('router.ts');
const appPath = web('App.tsx');
const settingsPath = web('components', 'SettingsDialog.tsx');
const tabsPath = web('components', 'settings', 'settingsTabs.ts');
const indexPath = web('components', 'command-palette', 'settingsIndex.ts');
const palettePath = web('components', 'command-palette', 'CommandPalette.tsx');
const localesDir = web('i18n', 'locales');
const funnyEnglishPath = web('i18n', 'funny', 'en.ts');
const funnyCantonesePath = web('i18n', 'funny', 'zh-HK.ts');

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
const EXPECTED_OWNER_PATHS = new Map([
  ['button-primitive', 'packages/components/src/button.tsx'],
  ['text-field-primitive', 'packages/components/src/form-controls.tsx'],
]);
const LOCALE_KEYS = [
  'handoff.title', 'handoff.tabHint', 'handoff.eyebrow', 'handoff.subtitle',
  'handoff.statusNote', 'handoff.backToSettings', 'handoff.exportAria',
  'handoff.exportLabel', 'handoff.copySelected', 'handoff.copyAll',
  'handoff.downloadSucceeded', 'handoff.downloadFailed', 'handoff.regexInvalid',
  'handoff.statusImplemented', 'handoff.statusPartial', 'handoff.statusUnverified',
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

/** Strip comments without treating comment-like text inside quoted strings as comments. */
function stripComments(source) {
  let output = '';
  let state = 'code';
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (state === 'line') {
      if (char === '\n') { state = 'code'; output += char; }
      else output += ' ';
      continue;
    }
    if (state === 'block') {
      if (char === '*' && next === '/') { state = 'code'; output += '  '; index += 1; }
      else output += char === '\n' ? '\n' : ' ';
      continue;
    }
    if (state === 'single' || state === 'double' || state === 'template') {
      output += char;
      if (char === '\\') { output += next ?? ''; index += 1; continue; }
      if ((state === 'single' && char === "'")
        || (state === 'double' && char === '"')
        || (state === 'template' && char === '`')) state = 'code';
      continue;
    }
    if (char === '/' && next === '/') { state = 'line'; output += '  '; index += 1; continue; }
    if (char === '/' && next === '*') { state = 'block'; output += '  '; index += 1; continue; }
    if (char === "'") { state = 'single'; output += char; continue; }
    if (char === '"') { state = 'double'; output += char; continue; }
    if (char === '`') { state = 'template'; output += char; continue; }
    output += char;
  }
  return output;
}

function findMatching(source, start, open, close) {
  let depth = 0;
  let quote = null;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === '\\') { index += 1; continue; }
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') { quote = char; continue; }
    if (char === open) depth += 1;
    if (char === close && --depth === 0) return index;
  }
  return -1;
}

function arrayBody(source, declaration) {
  const clean = stripComments(source);
  const declarationStart = clean.indexOf(`export const ${declaration}`);
  if (declarationStart < 0) throw new Error(`missing ${declaration} declaration`);
  // The type annotation (`readonly Row[]`) carries its own `[]` before the
  // initializer, so the array literal is the first `[` after the `=`.
  const assignment = clean.indexOf('=', declarationStart);
  if (assignment < 0) throw new Error(`${declaration} has no initializer`);
  const open = clean.indexOf('[', assignment);
  const close = findMatching(clean, open, '[', ']');
  if (open < 0 || close < 0) throw new Error(`${declaration} is not a balanced array`);
  return clean.slice(open + 1, close);
}

function objectRows(arrayText) {
  const rows = [];
  let depth = 0;
  let start = -1;
  let quote = null;
  for (let index = 0; index < arrayText.length; index += 1) {
    const char = arrayText[index];
    if (quote) {
      if (char === '\\') { index += 1; continue; }
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') { quote = char; continue; }
    if (char === '{') {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0) rows.push(arrayText.slice(start, index + 1));
    }
  }
  return rows;
}

function property(row, name) {
  const match = row.match(new RegExp(`(?:^|[,\\n])\\s*${name}:\\s*'([^']*)'`));
  return match?.[1] ?? null;
}

function parseRegistry(source, declaration, ids) {
  const rows = objectRows(arrayBody(source, declaration));
  if (rows.length !== ids.length) throw new Error(`${declaration} has ${rows.length} rows, expected ${ids.length}`);
  const actual = rows.map((row) => property(row, 'id'));
  if (actual.some((id, index) => id !== ids[index])) throw new Error(`${declaration} ids drifted: ${actual.join(', ')}`);
  return rows;
}

function assertContains(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`missing ${label}: ${needle}`);
}

function exactCaseTrackedPaths() {
  return new Set(execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean));
}

function assertRegistrySchema(registry, tracked) {
  const tokens = parseRegistry(registry, 'HANDOFF_TOKEN_MAPPINGS', TOKEN_IDS);
  const owners = parseRegistry(registry, 'HANDOFF_COMPONENT_OWNERS', OWNER_IDS);
  const statuses = new Set(['implemented', 'partial', 'unverified']);
  for (const row of tokens) {
    for (const field of ['md3Token', 'appVariable', 'designSourcePath', 'appSourcePath', 'status', 'evidence']) {
      if (!property(row, field)) throw new Error(`token row ${property(row, 'id')} is missing ${field}`);
    }
    if (!statuses.has(property(row, 'status'))) throw new Error(`invalid token status on ${property(row, 'id')}`);
    if (property(row, 'designSourcePath') !== 'apps/web/src/styles/md3-tokens.css'
      || property(row, 'appSourcePath') !== 'apps/web/src/styles/tokens.css') throw new Error(`token source path drift on ${property(row, 'id')}`);
  }
  for (const row of owners) {
    for (const field of ['owner', 'sourcePath', 'status', 'evidence']) {
      if (!property(row, field)) throw new Error(`owner row ${property(row, 'id')} is missing ${field}`);
    }
    if (!statuses.has(property(row, 'status'))) throw new Error(`invalid owner status on ${property(row, 'id')}`);
    const expectedPath = EXPECTED_OWNER_PATHS.get(property(row, 'id'));
    if (expectedPath && property(row, 'sourcePath') !== expectedPath) throw new Error(`case-sensitive owner path drift on ${property(row, 'id')}`);
    const trackedPath = `design/${property(row, 'sourcePath')}`;
    if (!tracked.has(trackedPath)) throw new Error(`owner path is not exactly tracked: ${trackedPath}`);
  }
  for (const sourcePath of ['design/apps/web/src/styles/md3-tokens.css', 'design/apps/web/src/styles/tokens.css']) {
    if (!tracked.has(sourcePath)) throw new Error(`registry source path is not exactly tracked: ${sourcePath}`);
  }
}

function runChecks(sources = null) {
  const files = {
    registry: sources?.registry ?? read(registryPath),
    selection: sources?.selection ?? read(selectionPath),
    export: sources?.export ?? read(exportPath),
    view: sources?.view ?? read(viewPath),
    css: sources?.css ?? read(cssPath),
    regexField: sources?.regexField ?? read(regexFieldPath),
    router: sources?.router ?? read(routerPath),
    app: sources?.app ?? read(appPath),
    settings: sources?.settings ?? read(settingsPath),
    tabs: sources?.tabs ?? read(tabsPath),
    index: sources?.index ?? read(indexPath),
    palette: sources?.palette ?? read(palettePath),
  };
  for (const [name, source] of Object.entries(files)) if (!balancedBraces(source)) throw new Error(`${name} has unbalanced braces`);
  assertRegistrySchema(files.registry, exactCaseTrackedPaths());
  for (const needle of ['HANDOFF_EXPORT_SCHEMA', 'HANDOFF_EXPORT_OMISSIONS', 'HANDOFF_TOKEN_EXPORT_FIELDS', 'HANDOFF_COMPONENT_EXPORT_FIELDS', 'assertHandoffRegistry']) assertContains(files.registry, needle, `registry contract ${needle}`);
  for (const needle of ['assertHandoffRegistry();', 'canonicalRows', 'designSourcePath', 'appSourcePath', 'row.designSourcePath', 'row.appSourcePath', 'copyToClipboard', 'downloadTextDeferred', 'notify({', 'ariaInvalid={Boolean(search.error)}', 'handoff.regexInvalid', 'selectHandoffIds(selection, filteredIds)', 'toggleHandoffSelection(selection, id, filteredIds', 'invertHandoffSelection(selection, filteredIds)', 'data-handoff-row', 'type="checkbox"', 'HANDOFF_EXPORT_OMISSIONS', '^[\\t ]*[=+\\-@]', "['json', 'markdown', 'csv']", 'useRegexSearch(tokenQuery']) assertContains(files.view, needle, `handoff view contract ${needle}`);
  assertContains(files.export, 'setTimeout', 'deferred object URL revocation');
  assertContains(files.regexField, 'ariaInvalid?: boolean', 'search field invalid prop');
  assertContains(files.regexField, 'ariaDescribedBy?: string', 'search field description prop');
  if (!/var\(--md-sys-[^)]+\)/.test(files.css) || !/var\(--md-ref-[^)]+\)/.test(files.css)) throw new Error('handoff CSS does not consume Material Design 3 roles');
  if (/#(?:[0-9a-f]{3,8})\b/i.test(files.css)) throw new Error('handoff CSS contains copied literal colors');
  if (!/min-height:\s*48px/.test(files.css)) throw new Error('handoff bulk target is below 48px');
  for (const [source, needles] of [[files.router, ["| 'handoff'", "parts[0] === 'handoff'", "route.view === 'handoff'"]], [files.settings, ["| 'handoff'"]], [files.app, ["if (section === 'handoff') {", "navigate({ kind: 'home', view: 'handoff' });"]], [files.tabs, ["section: 'handoff'", "value !== 'handoff'"]], [files.index, ['handoff: true', "sectionAnchorFor('handoff')"]], [files.palette, ["entry.section === 'handoff'", 'requestSettingsReveal(null)']]]) for (const needle of needles) assertContains(source, needle, `route/settings contract ${needle}`);
  const localeFiles = fs.readdirSync(localesDir).filter((name) => name.endsWith('.ts'));
  if (localeFiles.length !== 20) throw new Error(`expected 20 locale dictionaries, found ${localeFiles.length}`);
  for (const file of localeFiles) {
    const source = read(path.join(localesDir, file));
    for (const key of LOCALE_KEYS) if (!source.includes(`'${key}':`) && !source.includes(`"${key}":`)) throw new Error(`${file} is missing locale key ${key}`);
  }
  for (const funnyFile of [funnyEnglishPath, funnyCantonesePath]) for (const key of ['handoff.statusImplemented', 'handoff.statusPartial', 'handoff.statusUnverified']) if (!read(funnyFile).includes(`'${key}':`)) throw new Error(`${path.basename(funnyFile)} is missing funny status key ${key}`);
  return { tokenRows: TOKEN_IDS.length, ownerRows: OWNER_IDS.length, locales: localeFiles.length };
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

function removeAll(source, needle) { return source.split(needle).join(''); }

function removeObjectById(source, id) {
  const clean = stripComments(source);
  const idIndex = clean.indexOf(`id: '${id}'`);
  if (idIndex < 0) return source;
  const start = clean.lastIndexOf('{', idIndex);
  const end = findMatching(clean, start, '{', '}');
  if (start < 0 || end < 0) return source;
  let removeEnd = end + 1;
  while (source[removeEnd] === ',' || source[removeEnd] === '\r' || source[removeEnd] === '\n' || source[removeEnd] === ' ') removeEnd += 1;
  return source.slice(0, start) + source.slice(removeEnd);
}

function runNegative() {
  const original = { registry: read(registryPath), selection: read(selectionPath), export: read(exportPath), view: read(viewPath), css: read(cssPath), regexField: read(regexFieldPath), router: read(routerPath), app: read(appPath), settings: read(settingsPath), tabs: read(tabsPath), index: read(indexPath), palette: read(palettePath) };
  const boundaries = [
    ['token', 'registry', (source) => removeObjectById(source, TOKEN_IDS[0])],
    ['component', 'registry', (source) => removeObjectById(source, OWNER_IDS[0])],
    ['source', 'registry', (source) => removeAll(source, 'apps/web/src/styles/md3-tokens.css')],
    ['status', 'registry', (source) => removeAll(source, "status: 'unverified'")],
    ['route', 'router', (source) => removeAll(source, "parts[0] === 'handoff'")],
    ['settings-intercept', 'app', (source) => removeAll(source, "if (section === 'handoff') {")],
    ['tab', 'tabs', (source) => removeAll(source, "'handoff'")],
    ['palette', 'palette', (source) => removeAll(source, "entry.section === 'handoff'")],
    ['export', 'view', (source) => removeAll(source, "['json', 'markdown', 'csv']")],
    ['search', 'view', (source) => removeAll(source, 'useRegexSearch(tokenQuery')],
  ];
  for (const [label, file, mutate] of boundaries) {
    const changed = { ...original, [file]: mutate(original[file]) };
    let red = false;
    try { runChecks(changed); } catch { red = true; }
    if (!red) throw new Error(`negative boundary stayed green: ${label}`);
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
