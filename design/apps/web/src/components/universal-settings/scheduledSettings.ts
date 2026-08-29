import {
  createScheduleRule,
  resolveScheduledSettings,
  scheduleRuleMatches,
  validateScheduleRule,
  type UniversalScheduleRule,
  type UniversalSettingsState,
} from './universalSettings';

export {
  createScheduleRule,
  resolveScheduledSettings,
  scheduleRuleMatches,
  validateScheduleRule,
};

export function scheduledSettingsAt(
  base: UniversalSettingsState,
  rules: readonly UniversalScheduleRule[],
  date: Date,
): UniversalSettingsState {
  return resolveScheduledSettings(base, rules, date);
}

export function scheduleSourceRequiresNetwork(rule: UniversalScheduleRule): boolean {
  return rule.source === 'api' || rule.source === 'homeAssistant';
}
