import type { UniversalSettingsState } from './universalSettings';

export const SCHOOL_MODE_SUPPRESSED_SECTIONS = Object.freeze([
  'language',
  'narrator',
  'schedule',
  'adhd',
  'notifications',
] as const);

export const SCHOOL_MODE_VISIBLE_SECTIONS = Object.freeze(['school', 'status'] as const);

export function schoolModeVisibleSections(enabled: boolean): readonly string[] | null {
  return enabled ? SCHOOL_MODE_VISIBLE_SECTIONS : null;
}

export function schoolModeSuppressesSection(enabled: boolean, section: string): boolean {
  return enabled && (SCHOOL_MODE_SUPPRESSED_SECTIONS as readonly string[]).includes(section);
}

export function schoolModeDisplay(state: UniversalSettingsState): {
  enabled: boolean;
  name: string;
  languageMode: 'english';
  funnyEnglish: 1;
  funnyCantonese: 1;
  suppressesDimSum: boolean;
} {
  return {
    enabled: state.school.enabled,
    name: state.school.name,
    languageMode: 'english',
    funnyEnglish: 1,
    funnyCantonese: 1,
    suppressesDimSum: state.school.enabled,
  };
}
