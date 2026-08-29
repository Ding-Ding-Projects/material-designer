import type { UniversalSettingsState } from './universalSettings';

export const SCHOOL_MODE_SUPPRESSED_SECTIONS = Object.freeze([
  'language',
  'narrator',
  'schedule',
  'adhd',
  'notifications',
] as const);

export const SCHOOL_MODE_VISIBLE_SECTIONS = Object.freeze(['school', 'status'] as const);

export const SCHOOL_MODE_CONSUMER_INVENTORY = Object.freeze([
  'routes',
  'command-palette',
  'notifications',
  'vocabulary',
  'dim-sum',
  'language',
  'funny-levels',
  'narrator',
  'scheduled-settings',
  'adhd',
] as const);

export type SchoolModeConsumer = (typeof SCHOOL_MODE_CONSUMER_INVENTORY)[number];

export interface SchoolModeSnapshot {
  enabled: boolean;
  name: string;
}

let schoolModeSnapshot: SchoolModeSnapshot = { enabled: false, name: 'School mode' };
const schoolModeListeners = new Set<(snapshot: SchoolModeSnapshot) => void>();
const registeredConsumers = new Set<SchoolModeConsumer>();

export function schoolModeVisibleSections(enabled: boolean): readonly string[] | null {
  return enabled ? SCHOOL_MODE_VISIBLE_SECTIONS : null;
}

export function schoolModeSuppressesSection(enabled: boolean, section: string): boolean {
  return enabled && (SCHOOL_MODE_SUPPRESSED_SECTIONS as readonly string[]).includes(section);
}

export function schoolModeSuppressesConsumer(enabled: boolean, consumer: string): boolean {
  return enabled && (SCHOOL_MODE_CONSUMER_INVENTORY as readonly string[]).includes(consumer);
}

export function registerSchoolModeConsumer(consumer: SchoolModeConsumer): () => void {
  registeredConsumers.add(consumer);
  return () => registeredConsumers.delete(consumer);
}

export function schoolModeSuppressionIsComplete(): boolean {
  return SCHOOL_MODE_CONSUMER_INVENTORY.every((consumer) => registeredConsumers.has(consumer));
}

export function publishSchoolMode(snapshot: SchoolModeSnapshot): void {
  const next = {
    enabled: snapshot.enabled === true,
    name: typeof snapshot.name === 'string' && snapshot.name.trim() ? snapshot.name.trim() : 'School mode',
  };
  if (next.enabled === schoolModeSnapshot.enabled && next.name === schoolModeSnapshot.name) return;
  schoolModeSnapshot = next;
  for (const listener of [...schoolModeListeners]) listener({ ...next });
}

export function readSchoolModeSnapshot(): SchoolModeSnapshot {
  return { ...schoolModeSnapshot };
}

export function subscribeSchoolMode(listener: (snapshot: SchoolModeSnapshot) => void): () => void {
  schoolModeListeners.add(listener);
  listener({ ...schoolModeSnapshot });
  return () => schoolModeListeners.delete(listener);
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
