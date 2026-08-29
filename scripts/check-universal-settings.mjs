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
      /^export const UNIVERSAL_SETTINGS_CENTRAL_HANDOFF_INVENTORY\b/m,
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
      /mountAcknowledged\?: boolean/,
      /mountedAcknowledged=\{mountAcknowledged\}/,
      /control\.hidden = Boolean\(query\.trim\(\)\) && !matches\(value\)/,
      /DestructiveGate/,
      /useNotifications\(\)/,
      /state: mountedAcknowledged \? 'running' as const : 'unavailable' as const/,
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
      /isVoiceCompatible\(voice, utterance\.language\)/,
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
      /export const notificationBulkApi = Object\.freeze/,
      /NotificationBulkOutcome/,
      /notAttempted: readonly NotificationRecord\[\]/,
      /cancelled: boolean/,
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
      /response\.status >= 300 && response\.status < 400/,
      /UNIVERSAL_SCHEDULE_RESPONSE_MAX_BYTES/,
      /UNIVERSAL_SCHEDULE_TIMEOUT_MS/,
      /UNIVERSAL_SCHEDULE_DNS_TIMEOUT_MS/,
      /normalizeRemoteValues\(parsed\.values\)/,
      /momentumSnoozedUntil/,
      /requestPinnedHttps\(/,
      /servername: hostname/,
      /rejectUnauthorized: true/,
    ],
  },
  {
    file: 'design/apps/desktop/tests/main/universal-settings-store.test.ts',
    label: 'desktop host focused tests',
    patterns: [
      /momentum snooze state/,
      /resolveScheduleSource/,
      /UNIVERSAL_SCHEDULE_TIMEOUT_MS/,
      /UNIVERSAL_SCHEDULE_DNS_TIMEOUT_MS/,
      /private or loopback literal hosts/,
      /mixed public\/private DNS answer/,
      /aborts an unresolved source/,
    ],
  },
  {
    file: 'design/apps/web/tests/components/universalSettings.test.ts',
    label: 'web bridge focused tests',
    patterns: [
      /optional host bridge revision and momentum seam/,
      /UniversalSettingsHostBridge/,
      /narratorLanguageOrder/,
      /schoolModeSuppressionIsComplete/,
    ],
  },
  {
    file: 'design/apps/web/tests/components/narrator/speech.test.ts',
    label: 'narrator compatibility focused tests',
    patterns: [
      /cross-language preferred identity/,
      /isVoiceCompatible\(english, 'zh-HK'\)/,
      /isVoiceCompatible\(cantonese, 'en'\)/,
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
      /^function scheduleWallClockMatches\(rule, clock\)/m,
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

function tokenize(source) {
  const tokens = [];
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];
    if (/\s/u.test(character)) {
      index += 1;
      continue;
    }
    if (character === '/' && next === '/') {
      index += 2;
      while (index < source.length && source[index] !== '\n' && source[index] !== '\r') index += 1;
      continue;
    }
    if (character === '/' && next === '*') {
      index += 2;
      while (index + 1 < source.length && !(source[index] === '*' && source[index + 1] === '/')) index += 1;
      index += 2;
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      const quote = character;
      const valueStart = index + 1;
      let valueEnd = source.length;
      index += 1;
      while (index < source.length) {
        if (source[index] === '\\') {
          index += 2;
          continue;
        }
        if (source[index] === quote) {
          valueEnd = index;
          index += 1;
          break;
        }
        index += 1;
      }
      tokens.push({ type: 'string', value: source.slice(valueStart, valueEnd) });
      continue;
    }
    const identifier = source.slice(index).match(/^[A-Za-z_$][A-Za-z0-9_$]*/u);
    if (identifier) {
      tokens.push({ type: 'identifier', value: identifier[0] });
      index += identifier[0].length;
      continue;
    }
    const number = source.slice(index).match(/^(?:\d+(?:\.\d+)?)/u);
    if (number) {
      tokens.push({ type: 'number', value: number[0] });
      index += number[0].length;
      continue;
    }
    tokens.push({ type: 'punctuation', value: character });
    index += 1;
  }
  return tokens;
}

function tokenValues(tokens) {
  return tokens.map((token) => token.value);
}

function findTokenSequence(tokens, sequence, start = 0, end = tokens.length) {
  const values = tokenValues(tokens);
  for (let index = start; index <= Math.min(end, values.length) - sequence.length; index += 1) {
    let matches = true;
    for (let offset = 0; offset < sequence.length; offset += 1) {
      if (sequence[offset] !== '<any>' && values[index + offset] !== sequence[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) return index;
  }
  return -1;
}

function hasTokenSequence(tokens, sequence, start = 0, end = tokens.length) {
  return findTokenSequence(tokens, sequence, start, end) !== -1;
}

function hasTopLevelTokenSequence(tokens, sequence) {
  const values = tokenValues(tokens);
  let braceDepth = 0;
  for (let index = 0; index < values.length; index += 1) {
    if (tokens[index].type === 'punctuation' && values[index] === '}') braceDepth = Math.max(0, braceDepth - 1);
    if (braceDepth === 0 && hasTokenSequence(tokens, sequence, index, index + sequence.length)) return true;
    if (tokens[index].type === 'punctuation' && values[index] === '{') braceDepth += 1;
  }
  return false;
}

function findArrayBody(tokens, sequence) {
  const arrayStart = findTokenSequence(tokens, sequence);
  if (arrayStart === -1) return null;
  const values = tokenValues(tokens);
  let depth = 0;
  for (let index = arrayStart; index < values.length; index += 1) {
    if (values[index] === '[') depth += 1;
    if (values[index] === ']') {
      depth -= 1;
      if (depth === 0) return { start: arrayStart + 1, end: index };
    }
  }
  return null;
}

function centralInventoryFailuresForSource(source) {
  const tokens = tokenize(source);
  const range = findArrayBody(tokens, [
    'UNIVERSAL_SETTINGS_CENTRAL_HANDOFF_INVENTORY', '=', 'Object', '.', 'freeze', '(', '[',
  ]);
  if (!range) return ['central handoff inventory: executable Object.freeze array is missing'];
  const values = tokenValues(tokens);
  let objectDepth = 0;
  let objectCount = 0;
  for (let index = range.start; index < range.end; index += 1) {
    if (values[index] === '{') {
      if (objectDepth === 0) objectCount += 1;
      objectDepth += 1;
    }
    if (values[index] === '}') objectDepth -= 1;
  }
  const failures = [];
  if (objectCount !== centralInventory.length) {
    failures.push('central handoff inventory: expected ' + centralInventory.length + ' executable rows, found ' + objectCount);
  }
  const boundedTokens = tokens.slice(range.start, range.end);
  for (const [id, path] of centralInventory) {
    const row = ['id', ':', id, ',', 'path', ':', path, ',', 'status', ':', 'pending-c0'];
    if (!hasTokenSequence(boundedTokens, row)) {
      failures.push('central handoff inventory: exact pending row is missing (' + id + ')');
    }
  }
  return failures;
}

const structuralChecks = [
  ['web settings panel declaration', 'design/apps/web/src/components/universal-settings/UniversalSettingsPanel.tsx', ['export', 'function', 'UniversalSettingsPanel', '(']],
  ['web runtime declaration', 'design/apps/web/src/components/universal-settings/UniversalSettingsRuntime.tsx', ['export', 'function', 'UniversalSettingsRuntime', '(']],
  ['web search hiding executable assignment', 'design/apps/web/src/components/universal-settings/UniversalSettingsPanel.tsx', ['control', '.', 'hidden', '=', 'Boolean', '(']],
  ['web notification store hook', 'design/apps/web/src/components/universal-settings/UniversalSettingsPanel.tsx', ['useNotifications', '(', ')']],
  ['web destructive confirmation component', 'design/apps/web/src/components/universal-settings/UniversalSettingsPanel.tsx', ['<', 'DestructiveGate']],
  ['web school consumer inventory declaration', 'design/apps/web/src/components/universal-settings/schoolMode.ts', ['export', 'const', 'SCHOOL_MODE_CONSUMER_INVENTORY', '=']],
  ['web school subscription declaration', 'design/apps/web/src/components/universal-settings/schoolMode.ts', ['export', 'function', 'subscribeSchoolMode', '(']],
  ['web startup surprise declaration', 'design/apps/web/src/components/universal-settings/StartupSurpriseSurface.tsx', ['export', 'function', 'StartupSurpriseSurface', '(']],
  ['web narrator compatibility call', 'design/apps/web/src/components/narrator/speech.ts', ['isVoiceCompatible', '(', 'voice', ',', 'utterance', '.', 'language', ')']],
  ['web notification bulk declaration', 'design/apps/web/src/components/notifications/notificationStore.ts', ['export', 'const', 'notificationBulkApi', '=']],
  ['desktop store declaration', 'design/apps/desktop/src/main/universal-settings-store.ts', ['export', 'class', 'UniversalSettingsStore']],
  ['desktop source validation declaration', 'design/apps/desktop/src/main/universal-settings-store.ts', ['export', 'function', 'validateUniversalScheduleSourceRequest', '(']],
  ['desktop pinned HTTPS call', 'design/apps/desktop/src/main/universal-settings-store.ts', ['requestPinnedHttps', '(']],
  ['desktop TLS server-name option', 'design/apps/desktop/src/main/universal-settings-store.ts', ['servername', ':', 'hostname']],
  ['desktop certificate validation option', 'design/apps/desktop/src/main/universal-settings-store.ts', ['rejectUnauthorized', ':', 'true']],
  ['desktop bounded DNS timer', 'design/apps/desktop/src/main/universal-settings-store.ts', ['UNIVERSAL_SCHEDULE_DNS_TIMEOUT_MS']],
  ['desktop momentum schema field', 'design/apps/desktop/src/main/universal-settings-store.ts', ['momentumSnoozedUntil']],
  ['site registration declaration', 'site/assets/js/universal-settings.js', ['function', 'registerUniversalSettingsPage', '(']],
  ['site mount acknowledgement property', 'site/assets/js/universal-settings.js', ['acknowledgeMount', ':']],
  ['site schedule matcher declaration', 'site/assets/js/universal-settings.js', ['function', 'scheduleWallClockMatches', '(']],
  ['site search hiding executable assignment', 'site/assets/js/universal-settings.js', ['item', '.', 'hidden', '=', '!', 'visible']],
  ['site narrator language order declaration', 'site/assets/js/universal-settings.js', ['function', 'narratorLanguageOrder', '(']],
  ['site surprise declaration', 'site/assets/js/universal-settings.js', ['function', 'renderStartupSurprise', '(']],
  ['site momentum field', 'site/assets/js/universal-settings.js', ['momentumSnoozedUntil']],
];

const topLevelStructuralLabels = new Set([
  'web settings panel declaration',
  'web runtime declaration',
  'web school consumer inventory declaration',
  'web school subscription declaration',
  'web startup surprise declaration',
  'desktop store declaration',
  'desktop source validation declaration',
  'site registration declaration',
  'site schedule matcher declaration',
]);

const centralInventory = [
  ['settings-panel', 'design/apps/web/src/components/SettingsDialog.tsx'],
  ['shell-runtime', 'design/apps/web/src/App.tsx'],
  ['command-palette', 'design/apps/web/src/components/command-palette/CommandPalette.tsx'],
  ['notification-center', 'design/apps/web/src/components/notifications/NotificationCenter.tsx'],
  ['school-consumers', 'design/apps/web/src/components/school-mode-consumers.ts'],
  ['desktop-host-bridge', 'design/apps/desktop/src/main/preload.cts'],
  ['desktop-host-runtime', 'design/apps/desktop/src/main/runtime.ts'],
  ['page-registration', 'site/assets/js/main.js'],
  ['page-markup', 'site/index.html'],
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

for (const [label, file, sequence] of structuralChecks) {
  const source = await readFile(resolve(root, file), 'utf8').catch(() => null);
  const tokens = source === null ? null : tokenize(source);
  const found = tokens !== null && (topLevelStructuralLabels.has(label)
    ? hasTopLevelTokenSequence(tokens, sequence)
    : hasTokenSequence(tokens, sequence));
  if (!found) {
    failures.push('structural ' + label + ': executable token boundary is missing');
  }
}

const centralInventorySource = await readFile(resolve(root, 'design/apps/web/src/components/universal-settings/universalSettings.ts'), 'utf8').catch(() => null);
if (centralInventorySource === null) {
  failures.push('central handoff inventory: source file is missing');
} else {
  failures.push(...centralInventoryFailuresForSource(centralInventorySource));
}

if (process.argv.includes('--negative')) {
  const negativeCases = [
    ['desktop source validation', 'design/apps/desktop/src/main/universal-settings-store.ts', /^export function validateUniversalScheduleSourceRequest\(value: unknown\)/m],
    ['site registration', 'site/assets/js/universal-settings.js', /^function registerUniversalSettingsPage\(options = \{\}\)/m],
    ['mount acknowledgement status', 'site/assets/js/universal-settings.js', /The page module is source-ready but awaits explicit registration acknowledgement/],
    ['host redirect refusal', 'design/apps/desktop/src/main/universal-settings-store.ts', /response\.status >= 300 && response\.status < 400/],
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

  const panelDeclaration = ['export', 'function', 'UniversalSettingsPanel', '('];
  const structuralNegativeCases = [
    ['comment declaration', '// export function UniversalSettingsPanel() {}', panelDeclaration],
    ['inert-string declaration', "const note = 'export function UniversalSettingsPanel()';", panelDeclaration],
    ['rename declaration', 'export function UniversalSettingsPanelRenamed() {}', panelDeclaration],
    ['detached-node declaration', 'function Wrapper() { export function UniversalSettingsPanel() {} }', panelDeclaration],
  ];
  for (const [label, source, sequence] of structuralNegativeCases) {
    if (hasTopLevelTokenSequence(tokenize(source), sequence)) {
      failures.push('structural negative regression stayed satisfied: ' + label);
    } else {
      console.log('structural negative regression expected red: ' + label);
    }
  }

  const detachedInventory = [
    'export const UNIVERSAL_SETTINGS_CENTRAL_HANDOFF_INVENTORY = Object.freeze([]);',
    "const detached = [{ id: 'settings-panel', path: 'design/apps/web/src/components/SettingsDialog.tsx', status: 'pending-c0' }];",
  ].join('\n');
  if (centralInventoryFailuresForSource(detachedInventory).length === 0) {
    failures.push('structural negative regression stayed satisfied: detached central inventory node');
  } else {
    console.log('structural negative regression expected red: detached central inventory node');
  }
}

if (failures.length > 0) {
  console.error('Universal settings completeness check failed.');
  for (const failure of failures) console.error('- ' + failure);
  process.exitCode = 1;
} else {
  console.log('Universal settings completeness check passed for ' + checks.length + ' owned modules and ' + structuralChecks.length + ' executable boundaries.');
}
