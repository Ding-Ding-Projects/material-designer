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
      /for \(const id of ids\) clearTimer\(id\)/,
    ],
  },
];

const failures = [];
for (const check of checks) {
  let source;
  try {
    source = await readFile(resolve(root, check.file), 'utf8');
  } catch {
    failures.push(check.label + ': file is missing (' + check.file + ')');
    continue;
  }
  for (const pattern of check.patterns) {
    if (pattern.global) pattern.lastIndex = 0;
    if (!pattern.test(source)) failures.push(check.label + ': required boundary is missing (' + pattern + ')');
  }
}

if (failures.length > 0) {
  console.error('Universal settings completeness check failed.');
  for (const failure of failures) console.error('- ' + failure);
  process.exitCode = 1;
} else {
  console.log('Universal settings completeness check passed for ' + checks.length + ' owned modules.');
}
