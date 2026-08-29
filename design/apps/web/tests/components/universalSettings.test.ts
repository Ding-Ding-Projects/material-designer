import { describe, expect, it } from 'vitest';

import {
  appendNotification,
  chooseVoiceId,
  createDefaultUniversalSettings,
  createScheduleRule,
  createStatusCards,
  narrationParts,
  narratorLanguageOrder,
  normalizeUniversalSettings,
  resolveScheduledSettings,
  scheduleRuleMatches,
  validateScheduleRule,
  UNIVERSAL_SURFACE_SEARCH_INVENTORY,
} from '../../src/components/universal-settings/universalSettings';
import { normalizeNarratorPreferences } from '../../src/components/narrator/settings';
import { ADHD_MODE_ORDER, createDefaultAdhdState, enabledAdhdModes } from '../../src/components/universal-settings/adhd';
import { scheduleSourceRequiresNetwork, scheduledSettingsAt } from '../../src/components/universal-settings/scheduledSettings';
import { SCHOOL_MODE_CONSUMER_INVENTORY, SCHOOL_MODE_SUPPRESSED_SECTIONS, publishSchoolMode, readSchoolModeSnapshot, schoolModeDisplay, schoolModeSuppressionIsComplete, schoolModeSuppressesConsumer, schoolModeSuppressesSection, subscribeSchoolMode } from '../../src/components/universal-settings/schoolMode';
import { StartupSurpriseController, drawStartupSurprise } from '../../src/components/universal-settings/startup-surprise';

describe('universal settings contract', () => {
  it('rejects an unknown schema and retains the shipped defaults', () => {
    const value = normalizeUniversalSettings({ schemaVersion: 99, languageMode: 'cantonese' });
    expect(value.schemaVersion).toBe(1);
    expect(value.languageMode).toBe('english');
    expect(value.funnyEnglish).toBe(5);
    expect(value.funnyCantonese).toBe(5);
    expect(value.school.enabled).toBe(false);
    expect(value.narrator.enabled).toBe(false);
    expect(value.momentumSnoozedUntil).toBe(0);
    expect(createStatusCards(null, null).find((card) => card.id === 'settings')?.state).toBe('unrun');
    expect(createStatusCards(null, null, true).find((card) => card.id === 'settings')?.state).toBe('running');
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
    const exactMinute = createScheduleRule({ id: 'exact', startTime: '09:00', endTime: '09:00', weekdays: 'all' });
    expect(scheduleRuleMatches(exactMinute, new Date(2026, 7, 24, 9, 0))).toBe(true);
    expect(scheduleRuleMatches(exactMinute, new Date(2026, 7, 24, 9, 1))).toBe(false);
    expect(normalizeUniversalSettings({
      ...createDefaultUniversalSettings(),
      schedules: [{ ...exactMinute, values: { theme: 'sunset' as never } }],
    }).schedules).toHaveLength(0);

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
    expect(narratorLanguageOrder('english')).toEqual(['english']);
    expect(narratorLanguageOrder('cantonese')).toEqual(['cantonese']);
    expect(narratorLanguageOrder('both')).toEqual(['english', 'cantonese']);
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

  it('keeps dedicated surface modules fail-closed and independently addressable', () => {
    const base = createDefaultUniversalSettings();
    expect(createDefaultAdhdState()).toEqual(base.adhd);
    expect(enabledAdhdModes({ ...base, adhd: { ...base.adhd, momentum: true } })).toEqual(['momentum']);
    expect(ADHD_MODE_ORDER).toHaveLength(5);
    expect(SCHOOL_MODE_SUPPRESSED_SECTIONS).toContain('notifications');
    expect(SCHOOL_MODE_CONSUMER_INVENTORY).toEqual(expect.arrayContaining(['routes', 'command-palette', 'notifications', 'vocabulary', 'dim-sum']));
    expect(schoolModeSuppressionIsComplete()).toBe(false);
    expect(schoolModeSuppressesSection(true, 'notifications')).toBe(true);
    expect(schoolModeSuppressesSection(false, 'notifications')).toBe(false);
    expect(schoolModeSuppressesConsumer(true, 'dim-sum')).toBe(true);
    expect(schoolModeSuppressesConsumer(false, 'dim-sum')).toBe(false);
    expect(schoolModeDisplay({ ...base, school: { ...base.school, enabled: true } }).languageMode).toBe('english');
    expect(scheduleSourceRequiresNetwork(createScheduleRule({ source: 'api' }))).toBe(true);
    expect(scheduleSourceRequiresNetwork(createScheduleRule({ source: 'local' }))).toBe(false);
    expect(scheduledSettingsAt(base, [], new Date(2026, 7, 24, 10, 0))).toEqual(base);
    const observed: { enabled: boolean; name: string }[] = [];
    const unsubscribe = subscribeSchoolMode((snapshot) => observed.push(snapshot));
    publishSchoolMode({ enabled: true, name: 'Quiet study' });
    expect(readSchoolModeSnapshot()).toEqual({ enabled: true, name: 'Quiet study' });
    expect(observed.at(-1)).toEqual({ enabled: true, name: 'Quiet study' });
    unsubscribe();
    publishSchoolMode({ enabled: false, name: 'School mode' });
    expect(normalizeUniversalSettings({ ...base, momentumSnoozedUntil: Number.POSITIVE_INFINITY }).momentumSnoozedUntil).toBe(0);
  });

  it('keeps startup surprise at ten percent and never draws twice in one launch', () => {
    const candidates = [{ id: 'har-gow', nameEn: 'Classic Har Gow', nameZhHant: '蝦餃', imageUrl: '/har-gow.webp' }];
    const context = { firstRun: false, errorPath: false, updateInProgress: false, userMidTask: false };
    expect(drawStartupSurprise(candidates, context, () => 0.2).shown).toBe(false);
    const controller = new StartupSurpriseController();
    expect(controller.draw(candidates, context, (() => { const values = [0.01, 0]; return () => values.shift() ?? 0; })()).shown).toBe(true);
    expect(controller.draw(candidates, context, () => 0.01)).toEqual({ shown: false, candidate: null });
  });

  it('rejects unknown record fields instead of silently accepting an unbounded shape', () => {
    const value = normalizeUniversalSettings({ schemaVersion: 1, unknown: true });
    expect(value).toEqual(createDefaultUniversalSettings());
  });
});
