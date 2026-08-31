import type { UniversalAdhdMode, UniversalSettingsState } from './universalSettings';

export const ADHD_MODE_ORDER: readonly UniversalAdhdMode[] = [
  'focus',
  'lowStimulation',
  'timeAwareness',
  'oneThing',
  'momentum',
];

export const ADHD_MODE_LABELS: Readonly<Record<UniversalAdhdMode, { en: string; yue: string }>> = {
  focus: { en: 'Focus', yue: '專注' },
  lowStimulation: { en: 'Low stimulation', yue: '低刺激' },
  timeAwareness: { en: 'Time awareness', yue: '時間感' },
  oneThing: { en: 'One thing at a time', yue: '一次一件事' },
  momentum: { en: 'Momentum', yue: '動力' },
};

export function createDefaultAdhdState(): Record<UniversalAdhdMode, boolean> {
  return {
    focus: false,
    lowStimulation: false,
    timeAwareness: false,
    oneThing: false,
    momentum: false,
  };
}

export function enabledAdhdModes(state: UniversalSettingsState): UniversalAdhdMode[] {
  return ADHD_MODE_ORDER.filter((mode) => state.adhd[mode]);
}

export function adhdModeIsActive(state: UniversalSettingsState, mode: UniversalAdhdMode): boolean {
  return state.adhd[mode] === true;
}
