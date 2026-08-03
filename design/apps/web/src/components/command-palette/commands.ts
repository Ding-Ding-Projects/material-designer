// The command registry: every command, every setting and every destination the
// app has, as one flat list of rows.
//
// Kept pure — no React, no DOM — for two reasons. The obvious one is that a
// registry is exactly the shape a unit test wants. The less obvious one is that
// "the palette lists everything" is a claim that has to stay true as the app
// grows, and the only way to check a claim like that is to be able to build the
// list in a test and assert over it.
//
// Rows come in three kinds and they are not interchangeable:
//   command     — does something. Enter runs it.
//   destination — goes somewhere. Enter opens the surface AND reveals the exact
//                 control there (see `reveal.ts`); landing on the right tab is
//                 not arriving.
//   setting     — IS a setting. The row renders that setting's live control
//                 inline, so changing it in the palette changes it for real.
//                 Enter still opens the section, for the user who wants the
//                 surrounding context.

import type { Route } from '../../router';
import type { IconName } from '../Icon';
import type { Dict } from '../../i18n/types';
import { LIBRARY_UI_VISIBLE } from '../../features/libraryUi';
import { SETTINGS_INDEX, type SettingsIndexEntry } from './settingsIndex';

export type PaletteTranslate = (key: keyof Dict, vars?: Record<string, string | number>) => string;

/**
 * Scopes. `all` is the default; the rest are reachable from the scope chips and
 * from a one-character prefix typed into the query.
 */
export type PaletteScopeId = 'all' | 'commands' | 'settings' | 'go' | 'files';

export interface PaletteScopeDefinition {
  id: PaletteScopeId;
  labelKey: keyof Dict;
  /** Typed prefix that switches to this scope. `all` has none. */
  prefix: string | null;
}

export const PALETTE_SCOPES: readonly PaletteScopeDefinition[] = [
  { id: 'all', labelKey: 'commandPalette.scopeAll', prefix: null },
  { id: 'commands', labelKey: 'commandPalette.scopeCommands', prefix: '>' },
  { id: 'settings', labelKey: 'commandPalette.scopeSettings', prefix: '@' },
  { id: 'go', labelKey: 'commandPalette.scopeGo', prefix: '/' },
  { id: 'files', labelKey: 'commandPalette.scopeFiles', prefix: '#' },
];

interface PaletteRowCommon {
  id: string;
  title: string;
  hint?: string;
  /** Translated group heading, rendered above runs of rows that share one. */
  group: string;
  icon: IconName;
  /** Untranslated aliases folded into the search haystack. */
  keywords?: readonly string[];
}

export type PaletteRow =
  | (PaletteRowCommon & { kind: 'command'; run: () => void })
  | (PaletteRowCommon & { kind: 'destination'; run: () => void })
  | (PaletteRowCommon & { kind: 'setting'; entry: SettingsIndexEntry; run: () => void });

export function paletteRowScope(row: PaletteRow): PaletteScopeId {
  if (row.kind === 'command') return 'commands';
  if (row.kind === 'setting') return 'settings';
  return 'go';
}

export interface PaletteRegistryContext {
  t: PaletteTranslate;
  /** Open the settings section this entry lives in and reveal its control. */
  openSettingsEntry: (entry: SettingsIndexEntry) => void;
  /** Navigate the app shell. */
  goTo: (route: Route) => void;
  /** Open a route as a NEW workspace tab rather than replacing the current one. */
  openInNewTab: (route: Route) => void;
  /** Palette-owned commands. */
  setScope: (scope: PaletteScopeId) => void;
  toggleFullWindow: () => void;
  fullWindow: boolean;
  /** Cycle system → light → dark → system. Absent when no config bridge exists. */
  cycleTheme?: () => void;
  /** Flip single ⇄ bilingual copy. */
  toggleLanguageMode?: () => void;
}

interface DestinationSpec {
  id: string;
  labelKey: keyof Dict;
  icon: IconName;
  route: Route;
  keywords: readonly string[];
}

const DESTINATIONS: readonly DestinationSpec[] = [
  {
    id: 'go.home',
    labelKey: 'entry.navHome',
    icon: 'home',
    route: { kind: 'home', view: 'home' },
    keywords: ['home', 'start', 'new project'],
  },
  {
    id: 'go.projects',
    labelKey: 'entry.navProjects',
    icon: 'folder',
    route: { kind: 'home', view: 'projects' },
    keywords: ['projects', 'files', 'workspaces'],
  },
  {
    id: 'go.tasks',
    labelKey: 'entry.navTasks',
    icon: 'kanban',
    route: { kind: 'home', view: 'tasks' },
    keywords: ['tasks', 'automations', 'routines'],
  },
  {
    id: 'go.plugins',
    labelKey: 'entry.navPlugins',
    icon: 'grid',
    route: { kind: 'home', view: 'plugins' },
    keywords: ['plugins', 'extensions'],
  },
  {
    id: 'go.designSystems',
    labelKey: 'entry.navDesignSystems',
    icon: 'blocks',
    route: { kind: 'home', view: 'design-systems' },
    keywords: ['design systems', 'brands', 'tokens'],
  },
  {
    id: 'go.integrations',
    labelKey: 'entry.navIntegrations',
    icon: 'link',
    route: { kind: 'home', view: 'integrations' },
    keywords: ['integrations', 'connectors', 'mcp'],
  },
  {
    id: 'go.marketplace',
    labelKey: 'workspaceTabs.marketplace',
    icon: 'grid',
    route: { kind: 'marketplace' },
    keywords: ['marketplace', 'catalog', 'browse plugins'],
  },
];

/**
 * Build every row. Deterministic and side-effect free: the `run` closures are
 * the only thing that touches the app, and nothing invokes them here.
 */
export function buildPaletteRows(ctx: PaletteRegistryContext): PaletteRow[] {
  const { t } = ctx;
  const commandGroup = t('commandPalette.groupCommands');
  const goGroup = t('commandPalette.groupGo');
  const settingsGroup = t('commandPalette.groupSettings');

  const rows: PaletteRow[] = [];

  rows.push({
    kind: 'command',
    id: 'command.searchFiles',
    title: t('commandPalette.commandSearchFiles'),
    hint: t('commandPalette.commandSearchFilesHint'),
    group: commandGroup,
    icon: 'search',
    keywords: ['quick switcher', 'go to file', 'open file', 'tabs'],
    run: () => ctx.setScope('files'),
  });
  rows.push({
    kind: 'command',
    id: 'command.newTab',
    title: t('commandPalette.commandNewTab'),
    group: commandGroup,
    icon: 'plus',
    keywords: ['new tab', 'workspace tab'],
    run: () => ctx.openInNewTab({ kind: 'home', view: 'home' }),
  });
  rows.push({
    kind: 'command',
    id: 'command.toggleFullWindow',
    title: ctx.fullWindow
      ? t('commandPalette.commandExitFullWindow')
      : t('commandPalette.commandFullWindow'),
    hint: t('commandPalette.commandFullWindowHint'),
    group: commandGroup,
    icon: ctx.fullWindow ? 'minimize' : 'maximize',
    keywords: ['full window', 'expand palette', 'size'],
    run: ctx.toggleFullWindow,
  });
  if (ctx.cycleTheme) {
    const cycleTheme = ctx.cycleTheme;
    rows.push({
      kind: 'command',
      id: 'command.cycleTheme',
      title: t('commandPalette.commandCycleTheme'),
      group: commandGroup,
      icon: 'sun-moon',
      keywords: ['theme', 'dark mode', 'light mode'],
      run: cycleTheme,
    });
  }
  if (ctx.toggleLanguageMode) {
    const toggleLanguageMode = ctx.toggleLanguageMode;
    rows.push({
      kind: 'command',
      id: 'command.toggleLanguageMode',
      title: t('commandPalette.commandToggleLanguageMode'),
      group: commandGroup,
      icon: 'languages',
      keywords: ['bilingual', 'language mode', 'both languages'],
      run: toggleLanguageMode,
    });
  }

  for (const destination of DESTINATIONS) {
    rows.push({
      kind: 'destination',
      id: destination.id,
      title: t(destination.labelKey),
      group: goGroup,
      icon: destination.icon,
      keywords: destination.keywords,
      run: () => ctx.goTo(destination.route),
    });
  }
  if (LIBRARY_UI_VISIBLE) {
    rows.push({
      kind: 'destination',
      id: 'go.library',
      title: t('commandPalette.destinationLibrary'),
      group: goGroup,
      icon: 'image',
      keywords: ['library', 'assets'],
      run: () => ctx.goTo({ kind: 'home', view: 'library' }),
    });
  }

  for (const entry of SETTINGS_INDEX) {
    // `library` is indexed for coverage but has no settings panel and no
    // visible surface while `LIBRARY_UI_VISIBLE` is false. Offering a row that
    // leads nowhere is worse than offering none.
    if (entry.section === 'library' && !LIBRARY_UI_VISIBLE) continue;
    rows.push({
      kind: 'setting',
      id: `setting:${entry.id}`,
      title: t(entry.titleKey),
      hint: entry.hintKey ? t(entry.hintKey) : undefined,
      group: settingsGroup,
      icon: entry.control ? 'sliders' : 'settings',
      keywords: entry.keywords,
      entry,
      run: () => ctx.openSettingsEntry(entry),
    });
  }

  return rows;
}

export interface ParsedPaletteQuery {
  /** The scope the prefix asked for, or `null` when the raw query carries none. */
  scope: PaletteScopeId | null;
  /** The query with any scope prefix stripped. */
  query: string;
}

export function parsePaletteQuery(raw: string): ParsedPaletteQuery {
  for (const scope of PALETTE_SCOPES) {
    if (scope.prefix && raw.startsWith(scope.prefix)) {
      return { scope: scope.id, query: raw.slice(scope.prefix.length).trimStart() };
    }
  }
  return { scope: null, query: raw };
}

/**
 * Cheap ranking, same shape as the quick switcher's: exact beats prefix beats
 * word-start beats substring, and a hit on the title beats the same hit on a
 * keyword. Enough for a list of this size, and predictable enough that a user
 * who types the first three letters of a setting gets that setting first.
 */
export function scorePaletteRow(row: PaletteRow, needle: string): number {
  if (!needle) return 1;
  const title = row.title.toLocaleLowerCase();
  if (title === needle) return 1000;
  if (title.startsWith(needle)) return 600;
  if (wordStarts(title).some((word) => word.startsWith(needle))) return 420;
  if (title.includes(needle)) return 300;

  const keywords = row.keywords ?? [];
  for (const keyword of keywords) {
    const value = keyword.toLocaleLowerCase();
    if (value === needle) return 260;
    if (value.startsWith(needle)) return 200;
    if (value.includes(needle)) return 140;
  }
  const hint = row.hint?.toLocaleLowerCase() ?? '';
  if (hint.includes(needle)) return 80;
  return 0;
}

function wordStarts(value: string): string[] {
  return value.split(/[\s/·—–-]+/u).filter(Boolean);
}

export function filterPaletteRows(
  rows: readonly PaletteRow[],
  query: string,
  scope: PaletteScopeId,
  limit = 60,
): PaletteRow[] {
  const needle = query.trim().toLocaleLowerCase();
  const inScope = scope === 'all'
    ? rows
    : rows.filter((row) => paletteRowScope(row) === scope);
  if (!needle) return inScope.slice(0, limit);
  return inScope
    .map((row, index) => ({ row, index, score: scorePaletteRow(row, needle) }))
    .filter((entry) => entry.score > 0)
    // Registry order is the tiebreak so equal scores stay stable rather than
    // reshuffling between keystrokes.
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .slice(0, limit)
    .map((entry) => entry.row);
}
