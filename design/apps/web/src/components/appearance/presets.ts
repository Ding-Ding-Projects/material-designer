// Named presets, user-saved themes, and the file they travel in.
//
// A theme is worth saving only if it survives leaving the machine, so the
// unit here is a complete appearance — theme, accent, seed, density, scale
// and every typography property including the ones this platform cannot
// honour — and the file format is plain JSON with a version on it.
//
// Import is total and loud. It never throws on a malformed file, it never
// half-applies one, and it never silently discards an entry: everything it
// refuses comes back in `skipped` with the reason, so the editor can say
// "3 imported, 1 skipped: no name" instead of quietly importing three and
// letting the user believe there were three.

import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_APPEARANCE_PREFERENCES,
  normalizeAppearancePreferences,
  resolveAccentColor,
  type AppearancePreferences,
} from '../../state/appearance';
import type { AppTheme } from '../../types';

/**
 * A complete, shareable appearance.
 *
 * `theme` and `accentColor` live in `AppConfig` at runtime rather than in
 * `AppearancePreferences`, so they are named separately here — but a
 * preset that carried only half of a look would not be a theme, it would
 * be a trap, so the file carries all of it and applying one writes through
 * both paths.
 */
export interface AppearancePreset {
  id: string;
  name: string;
  /** ISO timestamp. Absent on the built-ins, which were never "saved". */
  savedAt?: string;
  theme: AppTheme;
  accentColor: string;
  preferences: AppearancePreferences;
}

export const PRESET_FILE_KIND = 'open-design.appearance';
export const PRESET_FILE_VERSION = 1;

export interface PresetFile {
  kind: typeof PRESET_FILE_KIND;
  version: number;
  exportedAt: string;
  presets: AppearancePreset[];
}

/**
 * The built-in presets.
 *
 * Every one is expressible in the token sheet — each seed has its block,
 * each density has its block — so none of them invents a colour. Their
 * names are i18n keys rather than literals because a preset list is UI
 * copy like any other; `nameKey` is resolved by the editor.
 */
export interface BuiltInPreset {
  id: string;
  nameKey:
  | 'appearance.preset.sunset'
  | 'appearance.preset.violet'
  | 'appearance.preset.teal'
  | 'appearance.preset.lime'
  | 'appearance.preset.compact'
  | 'appearance.preset.readable';
  theme: AppTheme;
  accentColor: string;
  preferences: AppearancePreferences;
}

export const BUILT_IN_PRESETS: readonly BuiltInPreset[] = [
  {
    id: 'built-in:sunset',
    nameKey: 'appearance.preset.sunset',
    theme: 'system',
    accentColor: DEFAULT_ACCENT_COLOR,
    preferences: DEFAULT_APPEARANCE_PREFERENCES,
  },
  {
    id: 'built-in:violet',
    nameKey: 'appearance.preset.violet',
    theme: 'system',
    accentColor: DEFAULT_ACCENT_COLOR,
    preferences: { ...DEFAULT_APPEARANCE_PREFERENCES, seed: 'violet' },
  },
  {
    id: 'built-in:teal',
    nameKey: 'appearance.preset.teal',
    theme: 'system',
    accentColor: DEFAULT_ACCENT_COLOR,
    preferences: { ...DEFAULT_APPEARANCE_PREFERENCES, seed: 'teal' },
  },
  {
    id: 'built-in:lime',
    nameKey: 'appearance.preset.lime',
    theme: 'system',
    accentColor: DEFAULT_ACCENT_COLOR,
    preferences: { ...DEFAULT_APPEARANCE_PREFERENCES, seed: 'lime' },
  },
  {
    id: 'built-in:compact',
    nameKey: 'appearance.preset.compact',
    theme: 'system',
    accentColor: DEFAULT_ACCENT_COLOR,
    preferences: {
      ...DEFAULT_APPEARANCE_PREFERENCES,
      density: 'compact',
      uiScale: 0.9,
      typography: { ...DEFAULT_APPEARANCE_PREFERENCES.typography, fontSizePx: 12.5 },
    },
  },
  {
    id: 'built-in:readable',
    nameKey: 'appearance.preset.readable',
    theme: 'system',
    accentColor: DEFAULT_ACCENT_COLOR,
    preferences: {
      ...DEFAULT_APPEARANCE_PREFERENCES,
      density: 'comfortable',
      uiScale: 1.15,
      typography: {
        ...DEFAULT_APPEARANCE_PREFERENCES.typography,
        fontSizePx: 15,
        lineHeight: 1.65,
      },
    },
  },
];

const PRESETS_STORAGE_KEY = 'open-design:appearance:presets';

function isTheme(value: unknown): value is AppTheme {
  return value === 'system' || value === 'light' || value === 'dark';
}

/**
 * `crypto.randomUUID` where it exists, a timestamp-plus-counter where it
 * does not. The id only has to be unique inside one list, and a preset
 * saved in a context without WebCrypto still deserves one.
 */
let idCounter = 0;
export function newPresetId(): string {
  const cryptoRef = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return `preset:${cryptoRef.randomUUID()}`;
  }
  idCounter += 1;
  return `preset:${Date.now().toString(36)}-${idCounter}`;
}

export function normalizePreset(value: unknown): AppearancePreset | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  // A nameless preset is unusable in the list it is being imported into,
  // and inventing "Preset 4" would put a name in the user's library they
  // never chose. Refusing is the honest option; the caller reports it.
  if (!name) return null;
  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : newPresetId(),
    name: name.slice(0, 80),
    savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : undefined,
    theme: isTheme(raw.theme) ? raw.theme : 'system',
    accentColor: resolveAccentColor(raw.accentColor),
    preferences: normalizeAppearancePreferences(raw.preferences),
  };
}

export function readStoredPresets(): AppearancePreset[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const presets: AppearancePreset[] = [];
    for (const entry of parsed) {
      const preset = normalizePreset(entry);
      if (preset) presets.push(preset);
    }
    return presets;
  } catch {
    return [];
  }
}

export function writeStoredPresets(presets: AppearancePreset[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
  } catch {
    /* ignore — a blocked store must not lose the live appearance too */
  }
}

export function buildPresetFile(presets: AppearancePreset[], now: Date = new Date()): PresetFile {
  return {
    kind: PRESET_FILE_KIND,
    version: PRESET_FILE_VERSION,
    exportedAt: now.toISOString(),
    presets,
  };
}

export function serializePresets(presets: AppearancePreset[], now?: Date): string {
  // Two-space indent: a theme file is something people read, diff and edit
  // by hand, and a single-line blob is none of those things.
  return `${JSON.stringify(buildPresetFile(presets, now), null, 2)}\n`;
}

export type ImportSkipReason =
  /** Not an object, or missing the name every preset needs. */
  | 'malformed'
  /** A preset with this name is already in the library. */
  | 'duplicate-name';

export interface ImportSkip {
  /** Whatever the entry called itself, for the report. Empty if it had none. */
  name: string;
  reason: ImportSkipReason;
}

export type ImportFailure =
  /** The text is not JSON at all. */
  | 'not-json'
  /** Valid JSON, but not an appearance file. */
  | 'wrong-kind'
  /** Written by a newer build than this one understands. */
  | 'future-version'
  /** An appearance file with no presets in it. */
  | 'empty';

export type ImportResult =
  | { ok: true; presets: AppearancePreset[]; skipped: ImportSkip[] }
  | { ok: false; failure: ImportFailure };

/**
 * Read a theme file.
 *
 * `existingNames` is how a re-import of the same file stops silently
 * doubling someone's library. The comparison is case-insensitive and
 * trimmed, because "Midnight" and "midnight " are the same preset to
 * everyone except a string comparison.
 */
export function parsePresetFile(text: string, existingNames: readonly string[] = []): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, failure: 'not-json' };
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false, failure: 'wrong-kind' };
  const file = parsed as Record<string, unknown>;
  if (file.kind !== PRESET_FILE_KIND) return { ok: false, failure: 'wrong-kind' };
  const version = typeof file.version === 'number' ? file.version : 0;
  // A newer file may carry properties whose *meaning* this build would get
  // wrong, which is worse than not importing it. An older one is fine:
  // `normalizeAppearancePreferences` fills what it lacks.
  if (version > PRESET_FILE_VERSION) return { ok: false, failure: 'future-version' };
  if (!Array.isArray(file.presets)) return { ok: false, failure: 'wrong-kind' };

  const taken = new Set(existingNames.map((name) => name.trim().toLowerCase()));
  const presets: AppearancePreset[] = [];
  const skipped: ImportSkip[] = [];

  for (const entry of file.presets) {
    const preset = normalizePreset(entry);
    if (!preset) {
      const name =
        entry && typeof entry === 'object' && typeof (entry as { name?: unknown }).name === 'string'
          ? ((entry as { name: string }).name)
          : '';
      skipped.push({ name, reason: 'malformed' });
      continue;
    }
    const key = preset.name.trim().toLowerCase();
    if (taken.has(key)) {
      skipped.push({ name: preset.name, reason: 'duplicate-name' });
      continue;
    }
    taken.add(key);
    presets.push(preset);
  }

  if (presets.length === 0 && skipped.length === 0) return { ok: false, failure: 'empty' };
  return { ok: true, presets, skipped };
}
