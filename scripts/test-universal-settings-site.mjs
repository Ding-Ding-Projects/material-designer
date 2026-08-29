import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const moduleUrl = pathToFileURL(resolve('site/assets/js/universal-settings.js')).href;
const site = await import(moduleUrl);

const base = site.defaults();
assert.equal(base.mode, 'en');
assert.deepEqual(base.funny, { en: 5, yue: 5 });
assert.equal(base.narrator.enabled, false);
assert.equal(base.momentumSnoozedUntil, 0);

assert.deepEqual(site.normalize({ schemaVersion: 99, mode: 'yue' }), base);
assert.deepEqual(site.normalize({ schemaVersion: 1, unknown: true }), base);
const bounded = site.normalize({
  ...base,
  schemaVersion: 1,
  schedules: [{
    id: 'overnight',
    label: 'Overnight',
    enabled: true,
    priority: 2,
    startDate: null,
    endDate: null,
    startTime: '22:00',
    endTime: '02:00',
    weekdays: [1],
    source: 'local',
    sourceUrl: null,
    sourceBaseUrl: null,
    sourceEntity: null,
    values: { theme: 'dark', density: 'compact' },
  }],
});
assert.equal(bounded.schedules[0].values.theme, 'dark');
assert.equal(site.scheduleMatches(bounded.schedules[0], new Date(2026, 7, 24, 23, 30)), true);
assert.equal(site.scheduleMatches(bounded.schedules[0], new Date(2026, 7, 25, 1, 30)), true);
assert.equal(site.scheduleMatches(bounded.schedules[0], new Date(2026, 7, 25, 12, 0)), false);
assert.equal(site.scheduleMatches({ ...bounded.schedules[0], startTime: '09:00', endTime: '09:00' }, new Date(2026, 7, 24, 9, 0)), true);
const dstWindow = { ...bounded.schedules[0], startTime: '02:00', endTime: '04:00', weekdays: 'all' };
assert.equal(site.scheduleWallClockMatches(dstWindow, { date: '2026-03-08', previousDate: '2026-03-07', day: 0, previousDay: 6, time: '03:30' }), true);
const foldClock = { date: '2026-11-01', previousDate: '2026-10-31', day: 0, previousDay: 6, time: '01:30' };
assert.equal(site.scheduleWallClockMatches({ ...bounded.schedules[0], startTime: '01:00', endTime: '02:00', weekdays: 'all' }, foldClock), true);
assert.equal(site.scheduleWallClockMatches({ ...bounded.schedules[0], startTime: '01:00', endTime: '02:00', weekdays: 'all' }, foldClock), true);
const external = site.normalize({
  ...base,
  schemaVersion: 1,
  schedules: [{ ...bounded.schedules[0], source: 'api', sourceUrl: 'https://example.test/settings', values: { theme: 'dark' } }],
});
assert.equal(site.resolveSchedules(external, new Date(2026, 7, 24, 23, 30)).theme, 'system');
const localLanguage = site.normalize({
  ...base,
  schemaVersion: 1,
  schedules: [{ ...bounded.schedules[0], source: 'local', values: { languageMode: 'bilingual', theme: 'dark' } }],
});
assert.equal(site.resolveSchedules(localLanguage, new Date(2026, 7, 24, 23, 30)).mode, 'bilingual');
assert.equal(site.resolveSchedules(localLanguage, new Date(2026, 7, 24, 23, 30)).theme, 'dark');
const invalidRemoteValue = site.normalize({
  ...base,
  schemaVersion: 1,
  schedules: [{ ...bounded.schedules[0], source: 'local', values: { theme: 'sunset' } }],
});
assert.equal(invalidRemoteValue.schedules.length, 0);

assert.equal(site.SURFACE_SEARCH_INVENTORY.includes('notification-list'), true);
assert.equal(site.SURFACE_SEARCH_INVENTORY.includes('english-voice'), true);
assert.deepEqual(site.narratorLanguageOrder('en'), ['en']);
assert.deepEqual(site.narratorLanguageOrder('yue'), ['yue']);
assert.deepEqual(site.narratorLanguageOrder('both'), ['en', 'yue']);

const source = await (await import('node:fs/promises')).readFile(resolve('site/assets/js/universal-settings.js'), 'utf8');
for (const [label, pattern] of [
  ['registration seam', /^function registerUniversalSettingsPage\(options = \{\}\)/m],
  ['mount acknowledgement seam', /acknowledgeMount: \(\) =>/],
  ['source validation', /^function validScheduleUrl\(value\)/m],
  ['DST wall-clock matcher', /^function scheduleWallClockMatches\(rule, clock\)/m],
  ['voice fallback', /^function voiceFor\(voices, language, preferred\)/m],
  ['narrator language order', /^function narratorLanguageOrder\(language\)/m],
  ['search hiding', /item\.hidden = !visible/],
  ['destructive confirmation seam', /requestDestructiveConfirmation/],
  ['momentum snooze', /momentumSnoozedUntil/],
  ['surprise surface', /^function renderStartupSurprise\(\{/m],
  ['surprise local asset boundary', /candidate\.imageUrl\.startsWith\('\/\/'\)/],
]) assert.match(source, pattern, label);

console.log('Site universal settings focused checks passed.');
