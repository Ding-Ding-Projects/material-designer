import { describe, expect, it } from 'vitest';

import {
  appendNotification,
  chooseVoiceId,
  createDefaultUniversalSettings,
  createScheduleRule,
  narrationParts,
  normalizeUniversalSettings,
  resolveScheduledSettings,
  scheduleRuleMatches,
  validateScheduleRule,
  UNIVERSAL_SURFACE_SEARCH_INVENTORY,
} from '../../src/components/universal/universalSettings';
import { normalizeNarratorPreferences } from '../../src/components/narrator/settings';

describe('universal settings contract', () => {
  it('rejects an unknown schema and retains the shipped defaults', () => {
    const value = normalizeUniversalSettings({ schemaVersion: 99, languageMode: 'cantonese' });
    expect(value.schemaVersion).toBe(1);
    expect(value.languageMode).toBe('english');
    expect(value.funnyEnglish).toBe(5);
    expect(value.funnyCantonese).toBe(5);
    expect(value.school.enabled).toBe(false);
    expect(value.narrator.enabled).toBe(false);
  });

  it('bounds malformed nested values without applying partial state', () => {
    const value = normalizeUniversalSettings({
      schemaVersion: 1,
      funnyEnglish: 99,
      funnyCantonese: 2,
      displayName: 'x'.repeat(500),
      accentColor: 'not-a-colour',
      narrator: { rate: 999, pitch: -4, englishVoiceId: 'v' },
      schedules: [{ startTime: '25:00', endTime: '17:00', weekdays: 'all' }],
    });
    expect(value.funnyEnglish).toBe(5);
    expect(value.funnyCantonese).toBe(2);
    expect(value.displayName).toBe('Material Designer');
    expect(value.accentColor).toBe('#6750A4');
    expect(value.narrator.rate).toBe(3);
    expect(value.narrator.pitch).toBe(0);
    expect(value.schedules).toHaveLength(0);
  });

  it('validates and resolves ordinary, cross-midnight, date, weekday and source rules', () => {
    const ordinary = createScheduleRule({
      id: 'ordinary', startTime: '09:00', endTime: '17:00', weekdays: [1], values: { density: 'compact' },
    });
    expect(validateScheduleRule(ordinary)).toBeNull();
    expect(scheduleRuleMatches(ordinary, new Date(2026, 7, 24, 10, 0))).toBe(true);
    expect(scheduleRuleMatches(ordinary, new Date(2026, 7, 25, 10, 0))).toBe(false);

    const overnight = createScheduleRule({
      id: 'overnight', startTime: '22:00', endTime: '02:00', weekdays: 'all', values: { theme: 'dark' },
    });
    expect(scheduleRuleMatches(overnight, new Date(2026, 7, 24, 23, 30))).toBe(true);
    expect(scheduleRuleMatches(overnight, new Date(2026, 7, 24, 12, 0))).toBe(false);

    const invalidApi = createScheduleRule({ source: 'api', sourceUrl: 'http://example.test' });
    expect(validateScheduleRule(invalidApi)).toContain('HTTPS');
    const validApi = createScheduleRule({ source: 'api', sourceUrl: 'https://example.test/settings' });
    expect(validateScheduleRule(validApi)).toBeNull();
    const invalidHomeAssistant = createScheduleRule({ source: 'homeAssistant', sourceEntity: null });
    expect(validateScheduleRule(invalidHomeAssistant)).toContain('boolean entity');

    const base = createDefaultUniversalSettings();
    const resolved = resolveScheduledSettings(base, [
      createScheduleRule({ id: 'low', priority: 1, values: { theme: 'dark' } }),
      createScheduleRule({ id: 'high', priority: 2, values: { theme: 'light' } }),
    ], new Date(2026, 7, 24, 10, 0));
    expect(resolved.theme).toBe('light');
  });

  it('keeps notification bulk updates and voice identities data-only', () => {
    const state = appendNotification(createDefaultUniversalSettings(), {
      title: 'Saved', body: 'The setting was saved.', tone: 'success',
    });
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]?.read).toBe(false);
    const voices = [
      { voiceURI: 'en-1', lang: 'en-US', name: 'English' },
      { voiceURI: 'yue-1', lang: 'zh-HK', name: 'Cantonese' },
    ] as SpeechSynthesisVoice[];
    expect(chooseVoiceId(voices, 'english', null)).toBe('en-1');
    expect(chooseVoiceId(voices, 'cantonese', null)).toBe('yue-1');
    expect(narrationParts({ english: 'One', cantonese: '一' }, 'both')).toEqual(['One', '一']);
  });

  it('keeps a hand-written search inventory for every universal page surface', () => {
    expect(UNIVERSAL_SURFACE_SEARCH_INVENTORY).toEqual(expect.arrayContaining([
      'language', 'school', 'narrator', 'schedule', 'adhd', 'notifications', 'status',
      'english-voice-picker', 'cantonese-voice-picker', 'notification-list',
    ]));
  });

  it('passes bounded voice identity, rate, and pitch into narrator preferences', () => {
    const value = normalizeNarratorPreferences({ enabled: true, language: 'both', englishVoiceId: 'en-stable', cantoneseVoiceId: 'yue-stable', rate: 7, pitch: -1 });
    expect(value.englishVoiceId).toBe('en-stable');
    expect(value.cantoneseVoiceId).toBe('yue-stable');
    expect(value.rate).toBe(3);
    expect(value.pitch).toBe(0);
  });
});
