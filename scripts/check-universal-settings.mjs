import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const checks = [
  {
    file: 'design/apps/web/src/components/universal-settings/index.ts',
    label: 'universal settings public seam',
    patterns: [
      /export \{ UniversalSettingsPanel \} from '\.\/UniversalSettingsPanel';/,
      /export \{ UniversalSettingsRuntime \} from '\.\/UniversalSettingsRuntime';/,
      /StartupSurpriseController/,
      /SCHOOL_MODE_SUPPRESSED_SECTIONS/,
    ],
  },
  {
    file: 'design/apps/web/src/components/universal-settings/universalSettings.ts',
    label: 'versioned universal settings record',
    patterns: [
      /^export const UNIVERSAL_SETTINGS_SCHEMA_VERSION\b/m,
      /^export function normalizeUniversalSettings\b/m,
      /^export function readUniversalSettings\b/m,
      /^export function writeUniversalSettings\b/m,
      /^export function subscribeUniversalSettings\b/m,
      /^export function validateScheduleRule\b/m,
      /^export function resolveScheduledSettings\b/m,
    ],
  },
  {
    file: 'design/apps/web/src/components/universal-settings/UniversalSettingsPanel.tsx',
    label: 'settings panel',
    patterns: [
      /^export function UniversalSettingsPanel\b/m,
      /role="tablist"/,
      /<RegexSearchField\b/g,
      /data-testid="universal-settings-panel"/,
      /control\.hidden = Boolean\(query\.trim\(\)\) && !matches\(value\)/,
      /DestructiveGate/,
      /useNotifications\(\)/,
    ],
  },
  {
    file: 'design/apps/web/src/components/universal-settings/UniversalSettingsRuntime.tsx',
    label: 'live settings runtime',
    patterns: [
      /^export function UniversalSettingsRuntime\b/m,
      /data-universal-school-mode/,
      /data-universal-adhd-/,
      /setFunnyLevel/,
      /writeUniversalSettingsPatch\(\{ momentumSnoozedUntil:/,
      /setNotificationQuietMode\(effective\.adhd\.lowStimulation\)/,
    ],
  },
  {
    file: 'design/apps/web/src/components/universal-settings/adhd.ts',
    label: 'attention mode contract',
    patterns: [
      /^export const ADHD_MODE_ORDER\b/m,
      /^export function createDefaultAdhdState\b/m,
      /^export function enabledAdhdModes\b/m,
    ],
  },
  {
    file: 'design/apps/web/src/components/universal-settings/scheduledSettings.ts',
    label: 'scheduled settings contract',
    patterns: [
      /^export function scheduledSettingsAt\b/m,
      /^export function scheduleSourceRequiresNetwork\b/m,
    ],
  },
  {
    file: 'design/apps/web/src/components/universal-settings/schoolMode.ts',
    label: 'school mode contract',
    patterns: [
      /^export const SCHOOL_MODE_SUPPRESSED_SECTIONS\b/m,
      /^export const SCHOOL_MODE_CONSUMER_INVENTORY\b/m,
      /^export function subscribeSchoolMode\b/m,
      /^export function registerSchoolModeConsumer\b/m,
      /^export function schoolModeSuppressionIsComplete\b/m,
      /^export function schoolModeSuppressesSection\b/m,
      /^export function schoolModeDisplay\b/m,
    ],
  },
  {
    file: 'design/apps/web/src/components/universal-settings/startup-surprise.ts',
    label: 'startup surprise contract',
    patterns: [
      /^export const STARTUP_SURPRISE_PROBABILITY = 0\.1;/m,
      /^export function drawStartupSurprise\b/m,
      /^export class StartupSurpriseController\b/m,
    ],
  },
  {
    file: 'design/apps/web/src/components/universal-settings/StartupSurpriseSurface.tsx',
    label: 'startup surprise surface',
    patterns: [
      /^export function StartupSurpriseSurface\b/m,
      /role="status"/,
      /alt={candidate\.nameEn/,
      /schoolModeEnabled/,
      /window\.setTimeout/,
    ],
  },
  {
    file: 'design/apps/web/src/components/narrator/queue.ts',
    label: 'narrator tuning state',
    patterns: [
      /englishVoiceId: string \| null/,
      /cantoneseVoiceId: string \| null/,
      /rate: number/,
      /pitch: number/,
      /voiceId: language === 'en'/,
    ],
  },
  {
    file: 'design/apps/web/src/components/narrator/speech.ts',
    label: 'narrator speech preferences',
    patterns: [
      /utterance\.voiceId/,
      /spoken\.rate = Math\.max/,
      /spoken\.pitch = Math\.max/,
    ],
  },
  {
    file: 'design/apps/web/src/components/narrator/narrator.ts',
    label: 'narrator preference normalization',
    patterns: [
      /normalizeNarratorPreferences\(next\)/,
      /writeStoredNarratorPreferences\(normalized\)/,
    ],
  },
  {
    file: 'design/apps/web/src/components/notifications/notificationStore.ts',
    label: 'notification bulk state',
    patterns: [
      /^export function clearNotificationIds\b/m,
      /^export function markNotificationIdsRead\b/m,
      /^export function setNotificationQuietMode\b/m,
      /for \(const id of ids\) clearTimer\(id\)/,
    ],
  },
  {
    file: 'design/apps/desktop/src/main/universal-settings-store.ts',
    label: 'desktop settings host seam',
    patterns: [
      /^export class UniversalSettingsStore\b/m,
      /^export function createUniversalSettingsStore\(/m,
      /^export function validateUniversalScheduleSourceRequest\(value: unknown\)/m,
      /^export const universalAddressIsPrivate = isPrivateAddress;/m,
      /^  async resolveScheduleSource\(request: unknown\)/m,
      /redirect: 'error'/,
      /UNIVERSAL_SCHEDULE_RESPONSE_MAX_BYTES/,
      /UNIVERSAL_SCHEDULE_TIMEOUT_MS/,
      /normalizeRemoteValues\(parsed\.values\)/,
    ],
  },
  {
    file: 'site/assets/js/universal-settings.js',
    label: 'documentation settings seam',
    patterns: [
      /^function setupUniversalSettings\(options = \{\}\)/m,
      /^function registerUniversalSettingsPage\(options = \{\}\)/m,
      /acknowledgeMount: \(\) =>/,
      /^function renderStartupSurprise\(\{/m,
      /^function scheduleMatches\(rule, date = new Date\(\)\)/m,
      /function scheduleValueFields\(rule, index\)/,
      /Scheduled accent colour/,
      /Scheduled UI font family/,
      /item\.hidden = !visible/,
      /requestDestructiveConfirmation/,
      /momentumSnoozedUntil/,
      /voiceFor\(window\.speechSynthesis\.getVoices\(\)/,
      /data-universal-school-suppressed/,
      /function validScheduleUrl\(value\)/,
      /function voiceFor\(voices, language, preferred\)/,
      /function narratorLanguageOrder\(language\)/,
      /function renderStartupSurprise\(\{/,
    ],
  },
];

async function readCheckSource(check) {
  try {
    return await readFile(resolve(root, check.file), 'utf8');
  } catch {
    return null;
  }
}

function failuresFor(check, source) {
  if (source === null) return [check.label + ': file is missing (' + check.file + ')'];
  return check.patterns.flatMap((pattern) => {
    if (pattern.global) pattern.lastIndex = 0;
    return pattern.test(source) ? [] : [check.label + ': required boundary is missing (' + pattern + ')'];
  });
}

const failures = [];
for (const check of checks) failures.push(...failuresFor(check, await readCheckSource(check)));

if (process.argv.includes('--negative')) {
  const negativeCases = [
    ['desktop source validation', 'design/apps/desktop/src/main/universal-settings-store.ts', /^export function validateUniversalScheduleSourceRequest\(value: unknown\)/m],
    ['site registration', 'site/assets/js/universal-settings.js', /^function registerUniversalSettingsPage\(options = \{\}\)/m],
    ['mount acknowledgement status', 'site/assets/js/universal-settings.js', /The page module is source-ready but awaits explicit registration acknowledgement/],
    ['host redirect refusal', 'design/apps/desktop/src/main/universal-settings-store.ts', /redirect: 'error'/],
    ['host bounded body', 'design/apps/desktop/src/main/universal-settings-store.ts', /^async function readBoundedBody\(response: Response\)/m],
    ['host timeout', 'design/apps/desktop/src/main/universal-settings-store.ts', /setTimeout\(\(\) => controller\.abort\(\), UNIVERSAL_SCHEDULE_TIMEOUT_MS\)/],
    ['notification bulk API', 'design/apps/web/src/components/notifications/notificationStore.ts', /^export function clearNotificationIds\b/m],
    ['search hiding', 'design/apps/web/src/components/universal-settings/UniversalSettingsPanel.tsx', /control\.hidden = Boolean\(query\.trim\(\)\) && !matches\(value\)/],
    ['narrator tuning', 'design/apps/web/src/components/narrator/speech.ts', /spoken\.rate = Math\.max/],
    ['schedule matcher', 'design/apps/web/src/components/universal-settings/universalSettings.ts', /^export function scheduleRuleMatches\(rule: UniversalScheduleRule, date: Date\)/m],
    ['School consumer inventory', 'design/apps/web/src/components/universal-settings/schoolMode.ts', /^export const SCHOOL_MODE_CONSUMER_INVENTORY\b/m],
    ['surprise surface', 'design/apps/web/src/components/universal-settings/StartupSurpriseSurface.tsx', /^export function StartupSurpriseSurface\b/m],
    ['momentum snooze', 'design/apps/web/src/components/universal-settings/UniversalSettingsRuntime.tsx', /^  const snoozeMomentum = \(\): void => \{\r?\n    writeUniversalSettingsPatch\(\{ momentumSnoozedUntil:/m],
    ['status remains unrun', 'site/assets/js/universal-settings.js', /The page module is source-ready but awaits explicit registration acknowledgement/],
  ];
  for (const [label, file, pattern] of negativeCases) {
    const source = await readFile(resolve(root, file), 'utf8');
    const broken = source.replace(pattern, '');
    if (broken === source || !pattern.test(source) || pattern.test(broken)) {
      failures.push('negative regression did not remove exact boundary: ' + label);
    } else {
      console.log('negative regression expected red: ' + label);
    }
  }
}

if (failures.length > 0) {
  console.error('Universal settings completeness check failed.');
  for (const failure of failures) console.error('- ' + failure);
  process.exitCode = 1;
} else {
  console.log('Universal settings completeness check passed for ' + checks.length + ' owned modules.');
}
