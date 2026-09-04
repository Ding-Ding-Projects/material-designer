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
import { isPersonalVocabularySuppressed } from '../../lib/personal-vocabulary';
import type { TranslationVars } from '../../i18n';

export type PaletteTranslate = (key: keyof Dict, vars?: TranslationVars) => string;

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
  /** Permission snapshot for dialog-owned Workspace settings. */
  workspaceSettingsVisible?: boolean;
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
  labelKey?: keyof Dict;
  label?: string;
  hint?: string;
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
  {
    id: 'go.authenticator',
    label: 'Authenticator',
    hint: 'Local codes, registration, and protected history',
    icon: 'key',
    route: { kind: 'home', view: 'authenticator' },
    keywords: ['authenticator', 'one-time password', 'totp', 'otp', 'codes', 'unlock ladder'],
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
      title: destination.labelKey ? t(destination.labelKey) : destination.label ?? destination.id,
      ...(destination.hint ? { hint: destination.hint } : {}),
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
    // Library has one production destination result above. Do not add the
    // stale settings anchor as a second visible result; every Library result
    // must navigate through the real `/library` route.
    if (entry.section === 'library') continue;
    if (entry.section === 'workspace' && ctx.workspaceSettingsVisible === false) continue;
    if (entry.id === 'personalVocabulary' && isPersonalVocabularySuppressed()) continue;
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

/**
 * A compiled pattern handed in from a search field that had regex switched on.
 *
 * The palette never compiles a user's pattern twice or shares a `RegExp` with
 * the field that built it: a global regex carries `lastIndex` between calls, so
 * a borrowed one would match every other row. The caller passes source + flags
 * and the palette builds its own bounded matcher.
 */
export interface PaletteRegexFilter {
  /** The pattern as written, for display. Never re-parsed here. */
  source: string;
  flags: string;
  /** Row predicate. Must never throw and must never hide rows on failure. */
  matches: (text: string) => boolean;
}

/**
 * Where a pattern hit, expressed on the same scale `scorePaletteRow` uses so
 * the two ranking paths order a list the same way.
 *
 * A regex either matches or it does not — there is no "starts with" to reward —
 * so the only ranking signal left is *which* field it matched. Title beats
 * keyword beats hint, exactly as it does for text.
 */
export function scorePaletteRowByRegex(row: PaletteRow, filter: PaletteRegexFilter): number {
  if (filter.matches(row.title)) return 600;
  for (const keyword of row.keywords ?? []) {
    if (filter.matches(keyword)) return 200;
  }
  if (row.hint && filter.matches(row.hint)) return 80;
  return 0;
}

export function filterPaletteRows(
  rows: readonly PaletteRow[],
  query: string,
  scope: PaletteScopeId,
  limit = 60,
  /** When present, `query` is ignored and this decides membership. */
  regex: PaletteRegexFilter | null = null,
): PaletteRow[] {
  const needle = query.trim().toLocaleLowerCase();
  const inScope = scope === 'all'
    ? rows
    : rows.filter((row) => paletteRowScope(row) === scope);
  if (regex) {
    // Deliberately no empty-query shortcut: an empty pattern matches every
    // row, which is the honest answer rather than a special case.
    return inScope
      .map((row, index) => ({ row, index, score: scorePaletteRowByRegex(row, regex) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => (b.score - a.score) || (a.index - b.index))
      .slice(0, limit)
      .map((entry) => entry.row);
  }
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
