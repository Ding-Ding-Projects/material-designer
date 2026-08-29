import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));

const stringToken = (value) => ({ type: 'string', value });

const requiredFiles = [
  ['universal settings public seam', 'design/apps/web/src/components/universal-settings/index.ts'],
  ['versioned universal settings record', 'design/apps/web/src/components/universal-settings/universalSettings.ts'],
  ['settings panel', 'design/apps/web/src/components/universal-settings/UniversalSettingsPanel.tsx'],
  ['live settings runtime', 'design/apps/web/src/components/universal-settings/UniversalSettingsRuntime.tsx'],
  ['attention mode contract', 'design/apps/web/src/components/universal-settings/adhd.ts'],
  ['scheduled settings contract', 'design/apps/web/src/components/universal-settings/scheduledSettings.ts'],
  ['school mode contract', 'design/apps/web/src/components/universal-settings/schoolMode.ts'],
  ['startup surprise contract', 'design/apps/web/src/components/universal-settings/startup-surprise.ts'],
  ['startup surprise surface', 'design/apps/web/src/components/universal-settings/StartupSurpriseSurface.tsx'],
  ['narrator tuning state', 'design/apps/web/src/components/narrator/queue.ts'],
  ['narrator speech preferences', 'design/apps/web/src/components/narrator/speech.ts'],
  ['narrator preference normalization', 'design/apps/web/src/components/narrator/narrator.ts'],
  ['notification bulk state', 'design/apps/web/src/components/notifications/notificationStore.ts'],
  ['desktop settings host seam', 'design/apps/desktop/src/main/universal-settings-store.ts'],
  ['desktop host focused tests', 'design/apps/desktop/tests/main/universal-settings-store.test.ts'],
  ['web bridge focused tests', 'design/apps/web/tests/components/universalSettings.test.ts'],
  ['narrator compatibility focused tests', 'design/apps/web/tests/components/narrator/speech.test.ts'],
  ['documentation settings seam', 'site/assets/js/universal-settings.js'],
];

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

function tokenize(source) {
  const tokens = [];
  const regexPrefixKeywords = new Set([
    'await', 'case', 'delete', 'do', 'else', 'in', 'instanceof', 'of', 'return',
    'throw', 'typeof', 'void', 'yield',
  ]);
  const canStartRegex = () => {
    const previous = tokens.at(-1);
    if (!previous) return true;
    if (previous.type === 'identifier') return regexPrefixKeywords.has(previous.value);
    if (previous.type !== 'punctuation') return false;
    if (previous.value === '<') return false;
    return '([{=,:;!?&|+-*%^~'.includes(previous.value);
  };
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
    if (character === '/' && canStartRegex()) {
      let cursor = index + 1;
      let inCharacterClass = false;
      let closed = false;
      while (cursor < source.length) {
        if (source[cursor] === '\\') {
          cursor += 2;
          continue;
        }
        if (source[cursor] === '[') inCharacterClass = true;
        if (source[cursor] === ']' && inCharacterClass) inCharacterClass = false;
        if (source[cursor] === '/' && !inCharacterClass) {
          cursor += 1;
          while (cursor < source.length && /[A-Za-z]/u.test(source[cursor])) cursor += 1;
          tokens.push({ type: 'regex', value: source.slice(index, cursor) });
          index = cursor;
          closed = true;
          break;
        }
        cursor += 1;
      }
      if (closed) continue;
    }
    if (character === "'" || character === '"' || character === '`') {
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

function tokenMatches(token, expected) {
  if (expected === '<any>') return true;
  if (typeof expected === 'object') return token.type === expected.type && token.value === expected.value;
  return token.type !== 'string' && token.type !== 'regex' && token.value === expected;
}

function findTokenSequence(tokens, sequence, start = 0, end = tokens.length) {
  for (let index = start; index <= Math.min(end, tokens.length) - sequence.length; index += 1) {
    if (sequence.every((expected, offset) => tokenMatches(tokens[index + offset], expected))) return index;
  }
  return -1;
}

function hasTokenSequence(tokens, sequence, start = 0, end = tokens.length) {
  return findTokenSequence(tokens, sequence, start, end) !== -1;
}

function hasTopLevelTokenSequence(tokens, sequence) {
  return findTopLevelTokenSequence(tokens, sequence) !== -1;
}

function findTopLevelTokenSequence(tokens, sequence) {
  let braceDepth = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index].type === 'punctuation' && tokens[index].value === '}') braceDepth = Math.max(0, braceDepth - 1);
    if (braceDepth === 0 && hasTokenSequence(tokens, sequence, index, index + sequence.length)) return index;
    if (tokens[index].type === 'punctuation' && tokens[index].value === '{') braceDepth += 1;
  }
  return -1;
}

function findArrayBody(tokens, sequence, prefix = findTokenSequence(tokens, sequence)) {
  if (prefix === -1) return null;
  const arrayIndex = prefix + sequence.length - 1;
  let depth = 0;
  for (let index = arrayIndex; index < tokens.length; index += 1) {
    if (tokens[index].type === 'punctuation' && tokens[index].value === '[') depth += 1;
    if (tokens[index].type === 'punctuation' && tokens[index].value === ']') {
      depth -= 1;
      if (depth === 0) return { start: arrayIndex + 1, end: index };
    }
  }
  return null;
}

function directObjectRanges(tokens, range) {
  const ranges = [];
  let arrayDepth = 0;
  let objectDepth = 0;
  let objectStart = -1;
  for (let index = range.start; index < range.end; index += 1) {
    const token = tokens[index];
    if (token.type !== 'punctuation') continue;
    if (token.value === '[') arrayDepth += 1;
    if (token.value === ']') arrayDepth = Math.max(0, arrayDepth - 1);
    if (token.value === '{') {
      if (arrayDepth === 0 && objectDepth === 0) objectStart = index;
      objectDepth += 1;
    }
    if (token.value === '}') {
      objectDepth = Math.max(0, objectDepth - 1);
      if (arrayDepth === 0 && objectDepth === 0 && objectStart !== -1) {
        ranges.push({ start: objectStart, end: index + 1 });
        objectStart = -1;
      }
    }
  }
  return ranges;
}

function centralInventoryFailuresForSource(source) {
  const tokens = tokenize(source);
  const prefix = [
    'export', 'const', 'UNIVERSAL_SETTINGS_CENTRAL_HANDOFF_INVENTORY', '=',
    'Object', '.', 'freeze', '(', '[',
  ];
  const topLevelPrefix = findTopLevelTokenSequence(tokens, prefix);
  if (topLevelPrefix === -1) {
    return ['central handoff inventory: exact top-level exported Object.freeze array is missing'];
  }
  const range = findArrayBody(tokens, prefix, topLevelPrefix);
  if (!range) return ['central handoff inventory: executable array is not closed'];
  const rows = directObjectRanges(tokens, range);
  const failures = [];
  if (rows.length !== centralInventory.length) {
    failures.push('central handoff inventory: expected ' + centralInventory.length + ' direct rows, found ' + rows.length);
  }
  centralInventory.forEach(([id, path], index) => {
    const row = rows[index];
    const expected = [
      '{', 'id', ':', stringToken(id), ',', 'path', ':', stringToken(path),
      ',', 'status', ':', stringToken('pending-c0'), '}',
    ];
    if (!row || !hasTokenSequence(tokens, expected, row.start, row.end) ||
        findTokenSequence(tokens, expected, row.start, row.end) !== row.start) {
      failures.push('central handoff inventory: canonical pending row is missing at index ' + index + ' (' + id + ')');
    }
  });
  return failures;
}

const syntaxChecks = [
  ['public panel export', 'design/apps/web/src/components/universal-settings/index.ts', ['export', '{', 'UniversalSettingsPanel', '}', 'from', stringToken('./UniversalSettingsPanel'), ';'], 'top-level'],
  ['public runtime export', 'design/apps/web/src/components/universal-settings/index.ts', ['export', '{', 'UniversalSettingsRuntime', '}', 'from', stringToken('./UniversalSettingsRuntime'), ';'], 'top-level'],
  ['public startup controller export', 'design/apps/web/src/components/universal-settings/index.ts', ['export', '{', 'STARTUP_SURPRISE_PROBABILITY', ',', 'StartupSurpriseController', ','], 'top-level'],
  ['public suppression export', 'design/apps/web/src/components/universal-settings/index.ts', ['export', '{', 'SCHOOL_MODE_SUPPRESSED_SECTIONS', ',', 'SCHOOL_MODE_VISIBLE_SECTIONS', ',', 'SCHOOL_MODE_CONSUMER_INVENTORY', ','], 'top-level'],
  ['settings schema declaration', 'design/apps/web/src/components/universal-settings/universalSettings.ts', ['export', 'const', 'UNIVERSAL_SETTINGS_SCHEMA_VERSION', '='], 'top-level'],
  ['normalize settings declaration', 'design/apps/web/src/components/universal-settings/universalSettings.ts', ['export', 'function', 'normalizeUniversalSettings', '('], 'top-level'],
  ['read settings declaration', 'design/apps/web/src/components/universal-settings/universalSettings.ts', ['export', 'function', 'readUniversalSettings', '('], 'top-level'],
  ['write settings declaration', 'design/apps/web/src/components/universal-settings/universalSettings.ts', ['export', 'function', 'writeUniversalSettings', '('], 'top-level'],
  ['subscribe settings declaration', 'design/apps/web/src/components/universal-settings/universalSettings.ts', ['export', 'function', 'subscribeUniversalSettings', '('], 'top-level'],
  ['schedule validation declaration', 'design/apps/web/src/components/universal-settings/universalSettings.ts', ['export', 'function', 'validateScheduleRule', '('], 'top-level'],
  ['scheduled resolution declaration', 'design/apps/web/src/components/universal-settings/universalSettings.ts', ['export', 'function', 'resolveScheduledSettings', '('], 'top-level'],
  ['settings panel declaration', 'design/apps/web/src/components/universal-settings/UniversalSettingsPanel.tsx', ['export', 'function', 'UniversalSettingsPanel', '('], 'top-level'],
  ['settings tablist', 'design/apps/web/src/components/universal-settings/UniversalSettingsPanel.tsx', ['role', '=', stringToken('tablist')]],
  ['settings regex field', 'design/apps/web/src/components/universal-settings/UniversalSettingsPanel.tsx', ['<', 'RegexSearchField']],
  ['settings panel test id', 'design/apps/web/src/components/universal-settings/UniversalSettingsPanel.tsx', ['data', '-', 'testid', '=', stringToken('universal-settings-panel')]],
  ['mount acknowledgement prop', 'design/apps/web/src/components/universal-settings/UniversalSettingsPanel.tsx', ['mountAcknowledged', '?', ':', 'boolean']],
  ['mount acknowledgement handoff', 'design/apps/web/src/components/universal-settings/UniversalSettingsPanel.tsx', ['mountedAcknowledged', '=', '{', 'mountAcknowledged', '}']],
  ['search hiding assignment', 'design/apps/web/src/components/universal-settings/UniversalSettingsPanel.tsx', ['control', '.', 'hidden', '=', 'Boolean', '(']],
  ['destructive confirmation use', 'design/apps/web/src/components/universal-settings/UniversalSettingsPanel.tsx', ['<', 'DestructiveGate']],
  ['notification hook use', 'design/apps/web/src/components/universal-settings/UniversalSettingsPanel.tsx', ['useNotifications', '(', ')', ';']],
  ['unrun status expression', 'design/apps/web/src/components/universal-settings/UniversalSettingsPanel.tsx', ['state', ':', 'mountedAcknowledged', '?', stringToken('running'), 'as', 'const', ':', stringToken('unavailable'), 'as', 'const']],
  ['runtime declaration', 'design/apps/web/src/components/universal-settings/UniversalSettingsRuntime.tsx', ['export', 'function', 'UniversalSettingsRuntime', '('], 'top-level'],
  ['runtime School attribute', 'design/apps/web/src/components/universal-settings/UniversalSettingsRuntime.tsx', ['root', '.', 'setAttribute', '(', stringToken('data-universal-school-mode'), ',']],
  ['runtime ADHD attribute', 'design/apps/web/src/components/universal-settings/UniversalSettingsRuntime.tsx', ['root', '.', 'setAttribute', '(', stringToken('data-universal-adhd-${mode}'), ',']],
  ['runtime funny-level setter', 'design/apps/web/src/components/universal-settings/UniversalSettingsRuntime.tsx', ['setFunnyLevel', '(', stringToken('en'), ',', '1', ')']],
  ['runtime momentum writer', 'design/apps/web/src/components/universal-settings/UniversalSettingsRuntime.tsx', ['writeUniversalSettingsPatch', '(', '{', 'momentumSnoozedUntil', ':']],
  ['runtime quiet-state setter', 'design/apps/web/src/components/universal-settings/UniversalSettingsRuntime.tsx', ['setNotificationQuietMode', '(', 'effective', '.', 'adhd', '.', 'lowStimulation', ')']],
  ['ADHD order declaration', 'design/apps/web/src/components/universal-settings/adhd.ts', ['export', 'const', 'ADHD_MODE_ORDER', ':', 'readonly', 'UniversalAdhdMode', '[', ']', '='], 'top-level'],
  ['ADHD defaults declaration', 'design/apps/web/src/components/universal-settings/adhd.ts', ['export', 'function', 'createDefaultAdhdState', '('], 'top-level'],
  ['ADHD enabled declaration', 'design/apps/web/src/components/universal-settings/adhd.ts', ['export', 'function', 'enabledAdhdModes', '('], 'top-level'],
  ['scheduled values declaration', 'design/apps/web/src/components/universal-settings/scheduledSettings.ts', ['export', 'function', 'scheduledSettingsAt', '('], 'top-level'],
  ['scheduled network declaration', 'design/apps/web/src/components/universal-settings/scheduledSettings.ts', ['export', 'function', 'scheduleSourceRequiresNetwork', '('], 'top-level'],
  ['School suppression declaration', 'design/apps/web/src/components/universal-settings/schoolMode.ts', ['export', 'const', 'SCHOOL_MODE_SUPPRESSED_SECTIONS', '='], 'top-level'],
  ['School consumer inventory declaration', 'design/apps/web/src/components/universal-settings/schoolMode.ts', ['export', 'const', 'SCHOOL_MODE_CONSUMER_INVENTORY', '='], 'top-level'],
  ['School subscription declaration', 'design/apps/web/src/components/universal-settings/schoolMode.ts', ['export', 'function', 'subscribeSchoolMode', '('], 'top-level'],
  ['School registration declaration', 'design/apps/web/src/components/universal-settings/schoolMode.ts', ['export', 'function', 'registerSchoolModeConsumer', '('], 'top-level'],
  ['School completeness declaration', 'design/apps/web/src/components/universal-settings/schoolMode.ts', ['export', 'function', 'schoolModeSuppressionIsComplete', '('], 'top-level'],
  ['School section suppression declaration', 'design/apps/web/src/components/universal-settings/schoolMode.ts', ['export', 'function', 'schoolModeSuppressesSection', '('], 'top-level'],
  ['School display declaration', 'design/apps/web/src/components/universal-settings/schoolMode.ts', ['export', 'function', 'schoolModeDisplay', '('], 'top-level'],
  ['surprise probability declaration', 'design/apps/web/src/components/universal-settings/startup-surprise.ts', ['export', 'const', 'STARTUP_SURPRISE_PROBABILITY', '=', '0.1', ';'], 'top-level'],
  ['surprise draw declaration', 'design/apps/web/src/components/universal-settings/startup-surprise.ts', ['export', 'function', 'drawStartupSurprise', '('], 'top-level'],
  ['surprise controller declaration', 'design/apps/web/src/components/universal-settings/startup-surprise.ts', ['export', 'class', 'StartupSurpriseController'], 'top-level'],
  ['surprise surface declaration', 'design/apps/web/src/components/universal-settings/StartupSurpriseSurface.tsx', ['export', 'function', 'StartupSurpriseSurface', '('], 'top-level'],
  ['surprise status role', 'design/apps/web/src/components/universal-settings/StartupSurpriseSurface.tsx', ['role', '=', stringToken('status')]],
  ['surprise alt text', 'design/apps/web/src/components/universal-settings/StartupSurpriseSurface.tsx', ['alt', '=', '{', 'candidate', '.', 'nameEn', '+']],
  ['surprise School state', 'design/apps/web/src/components/universal-settings/StartupSurpriseSurface.tsx', ['if', '(', '!', 'candidate', '|', '|', 'schoolModeEnabled', '|', '|']],
  ['surprise auto-dismiss', 'design/apps/web/src/components/universal-settings/StartupSurpriseSurface.tsx', ['window', '.', 'setTimeout']],
  ['English voice id state', 'design/apps/web/src/components/narrator/queue.ts', ['englishVoiceId', ':', 'string', '|', 'null']],
  ['Cantonese voice id state', 'design/apps/web/src/components/narrator/queue.ts', ['cantoneseVoiceId', ':', 'string', '|', 'null']],
  ['narrator rate state', 'design/apps/web/src/components/narrator/queue.ts', ['rate', ':', 'number']],
  ['narrator pitch state', 'design/apps/web/src/components/narrator/queue.ts', ['pitch', ':', 'number']],
  ['narrator language voice selection', 'design/apps/web/src/components/narrator/queue.ts', ['voiceId', ':', 'language', '=', '=', '=', stringToken('en'), '?']],
  ['narrator preferred voice compatibility', 'design/apps/web/src/components/narrator/speech.ts', ['isVoiceCompatible', '(', 'voice', ',', 'utterance', '.', 'language', ')']],
  ['narrator voice assignment', 'design/apps/web/src/components/narrator/speech.ts', ['const', 'preferred', '=', 'utterance', '.', 'voiceId', '?']],
  ['narrator rate clamp', 'design/apps/web/src/components/narrator/speech.ts', ['spoken', '.', 'rate', '=', 'Math', '.', 'max']],
  ['narrator pitch clamp', 'design/apps/web/src/components/narrator/speech.ts', ['spoken', '.', 'pitch', '=', 'Math', '.', 'max']],
  ['narrator preference normalization', 'design/apps/web/src/components/narrator/narrator.ts', ['normalizeNarratorPreferences', '(', 'next', ')']],
  ['narrator preference persistence', 'design/apps/web/src/components/narrator/narrator.ts', ['writeStoredNarratorPreferences', '(', 'normalized', ')']],
  ['notification clear declaration', 'design/apps/web/src/components/notifications/notificationStore.ts', ['export', 'function', 'clearNotificationIds', '('], 'top-level'],
  ['notification read declaration', 'design/apps/web/src/components/notifications/notificationStore.ts', ['export', 'function', 'markNotificationIdsRead', '('], 'top-level'],
  ['notification quiet declaration', 'design/apps/web/src/components/notifications/notificationStore.ts', ['export', 'function', 'setNotificationQuietMode', '('], 'top-level'],
  ['notification bulk export', 'design/apps/web/src/components/notifications/notificationStore.ts', ['export', 'const', 'notificationBulkApi', '='], 'top-level'],
  ['notification bulk outcome type', 'design/apps/web/src/components/notifications/notificationStore.ts', ['export', 'interface', 'NotificationBulkOutcome', '{'], 'top-level'],
  ['notification not-attempted state', 'design/apps/web/src/components/notifications/notificationStore.ts', ['notAttempted', ':', 'readonly', 'NotificationRecord', '[', ']']],
  ['notification cancelled state', 'design/apps/web/src/components/notifications/notificationStore.ts', ['cancelled', ':', 'boolean']],
  ['notification timer cleanup', 'design/apps/web/src/components/notifications/notificationStore.ts', ['for', '(', 'const', 'id', 'of', 'ids', ')', 'clearTimer', '(', 'id', ')']],
  ['desktop store declaration', 'design/apps/desktop/src/main/universal-settings-store.ts', ['export', 'class', 'UniversalSettingsStore'], 'top-level'],
  ['desktop store factory', 'design/apps/desktop/src/main/universal-settings-store.ts', ['export', 'function', 'createUniversalSettingsStore', '('], 'top-level'],
  ['desktop source validation', 'design/apps/desktop/src/main/universal-settings-store.ts', ['export', 'function', 'validateUniversalScheduleSourceRequest', '('], 'top-level'],
  ['desktop address export', 'design/apps/desktop/src/main/universal-settings-store.ts', ['export', 'const', 'universalAddressIsPrivate', '=', 'isPrivateAddress', ';'], 'top-level'],
  ['desktop source resolver', 'design/apps/desktop/src/main/universal-settings-store.ts', ['async', 'resolveScheduleSource', '(', 'request', ':', 'unknown', ')']],
  ['desktop redirect refusal', 'design/apps/desktop/src/main/universal-settings-store.ts', ['response', '.', 'status', '>', '=', '300', '&', '&', 'response', '.', 'status', '<', '400']],
  ['desktop response bound', 'design/apps/desktop/src/main/universal-settings-store.ts', ['export', 'const', 'UNIVERSAL_SCHEDULE_RESPONSE_MAX_BYTES', '='], 'top-level'],
  ['desktop request timeout', 'design/apps/desktop/src/main/universal-settings-store.ts', ['export', 'const', 'UNIVERSAL_SCHEDULE_TIMEOUT_MS', '='], 'top-level'],
  ['desktop DNS timeout', 'design/apps/desktop/src/main/universal-settings-store.ts', ['export', 'const', 'UNIVERSAL_SCHEDULE_DNS_TIMEOUT_MS', '='], 'top-level'],
  ['desktop normalized remote values', 'design/apps/desktop/src/main/universal-settings-store.ts', ['normalizeRemoteValues', '(', 'parsed', '.', 'values', ')']],
  ['desktop momentum schema', 'design/apps/desktop/src/main/universal-settings-store.ts', [stringToken('nextAction'), ',', stringToken('momentumSnoozedUntil'), ',', stringToken('notifications')]],
  ['desktop pinned request', 'design/apps/desktop/src/main/universal-settings-store.ts', ['await', 'requestPinnedHttps', '(']],
  ['desktop TLS server name', 'design/apps/desktop/src/main/universal-settings-store.ts', ['servername', ':', 'hostname']],
  ['desktop certificate validation', 'design/apps/desktop/src/main/universal-settings-store.ts', ['rejectUnauthorized', ':', 'true']],
  ['host snooze focused test', 'design/apps/desktop/tests/main/universal-settings-store.test.ts', [stringToken('persists momentum snooze state and records the field in redacted history')]],
  ['host source focused test', 'design/apps/desktop/tests/main/universal-settings-store.test.ts', ['resolveScheduleSource']],
  ['host request timeout focused test', 'design/apps/desktop/tests/main/universal-settings-store.test.ts', ['UNIVERSAL_SCHEDULE_TIMEOUT_MS']],
  ['host DNS timeout focused test', 'design/apps/desktop/tests/main/universal-settings-store.test.ts', ['UNIVERSAL_SCHEDULE_DNS_TIMEOUT_MS']],
  ['host private host focused test', 'design/apps/desktop/tests/main/universal-settings-store.test.ts', [stringToken('rejects private or loopback literal hosts without fetching')]],
  ['host rebind focused test', 'design/apps/desktop/tests/main/universal-settings-store.test.ts', [stringToken('bounds DNS lookup and rejects a mixed public/private DNS answer')]],
  ['host abort focused test', 'design/apps/desktop/tests/main/universal-settings-store.test.ts', [stringToken('aborts an unresolved source at the bounded timeout')]],
  ['web bridge focused test', 'design/apps/web/tests/components/universalSettings.test.ts', [stringToken('keeps the optional host bridge revision and momentum seam typed')]],
  ['web bridge type boundary', 'design/apps/web/tests/components/universalSettings.test.ts', ['const', 'bridge', ':', 'UniversalSettingsHostBridge', '=']],
  ['web narrator ordering focused test', 'design/apps/web/tests/components/universalSettings.test.ts', ['expect', '(', 'narratorLanguageOrder', '(']],
  ['web School completeness focused test', 'design/apps/web/tests/components/universalSettings.test.ts', ['expect', '(', 'schoolModeSuppressionIsComplete', '(', ')', ')']],
  ['narrator cross-language focused test', 'design/apps/web/tests/components/narrator/speech.test.ts', [stringToken('never treats a cross-language preferred identity as compatible')]],
  ['narrator English compatibility focused test', 'design/apps/web/tests/components/narrator/speech.test.ts', ['isVoiceCompatible', '(', 'english', ',', stringToken('zh-HK'), ')']],
  ['narrator Cantonese compatibility focused test', 'design/apps/web/tests/components/narrator/speech.test.ts', ['isVoiceCompatible', '(', 'cantonese', ',', stringToken('en'), ')']],
  ['site setup declaration', 'site/assets/js/universal-settings.js', ['function', 'setupUniversalSettings', '(', 'options', '=', '{', '}', ')'], 'top-level'],
  ['site registration declaration', 'site/assets/js/universal-settings.js', ['function', 'registerUniversalSettingsPage', '(', 'options', '=', '{', '}', ')'], 'top-level'],
  ['site acknowledgement property', 'site/assets/js/universal-settings.js', ['acknowledgeMount', ':', '(', ')', '=', '>']],
  ['site surprise declaration', 'site/assets/js/universal-settings.js', ['function', 'renderStartupSurprise', '(', '{'], 'top-level'],
  ['site schedule declaration', 'site/assets/js/universal-settings.js', ['function', 'scheduleMatches', '(', 'rule', ',', 'date', '=', 'new', 'Date', '(', ')', ')'], 'top-level'],
  ['site wall-clock declaration', 'site/assets/js/universal-settings.js', ['function', 'scheduleWallClockMatches', '(', 'rule', ',', 'clock', ')'], 'top-level'],
  ['site schedule values declaration', 'site/assets/js/universal-settings.js', ['function', 'scheduleValueFields', '(', 'rule', ',', 'index', ')']],
  ['site accent value control', 'site/assets/js/universal-settings.js', [stringToken('Scheduled accent colour')]],
  ['site font value control', 'site/assets/js/universal-settings.js', [stringToken('Scheduled UI font family')]],
  ['site search hiding assignment', 'site/assets/js/universal-settings.js', ['item', '.', 'hidden', '=', '!', 'visible']],
  ['site destructive confirmation seam', 'site/assets/js/universal-settings.js', ['options', '.', 'requestDestructiveConfirmation']],
  ['site momentum state', 'site/assets/js/universal-settings.js', ['state', '.', 'momentumSnoozedUntil']],
  ['site voice enumeration', 'site/assets/js/universal-settings.js', ['voiceFor', '(', 'window', '.', 'speechSynthesis', '.', 'getVoices', '(', ')']],
  ['site School suppression marker', 'site/assets/js/universal-settings.js', ['tab', '.', 'toggleAttribute', '(', stringToken('data-universal-school-suppressed'), ',']],
  ['site URL validator', 'site/assets/js/universal-settings.js', ['function', 'validScheduleUrl', '(', 'value', ')'], 'top-level'],
  ['site voice fallback declaration', 'site/assets/js/universal-settings.js', ['function', 'voiceFor', '(', 'voices', ',', 'language', ',', 'preferred', ')'], 'top-level'],
  ['site narrator ordering declaration', 'site/assets/js/universal-settings.js', ['function', 'narratorLanguageOrder', '(', 'language', ')'], 'top-level'],
];

function syntaxBoundaryPresent(source, sequence, scope) {
  const tokens = tokenize(source);
  return scope === 'top-level' ? hasTopLevelTokenSequence(tokens, sequence) : hasTokenSequence(tokens, sequence);
}

async function readSource(file) {
  return readFile(resolve(root, file), 'utf8').catch(() => null);
}

const failures = [];
for (const [label, file] of requiredFiles) {
  if (await readSource(file) === null) failures.push(label + ': file is missing (' + file + ')');
}
for (const [label, file, sequence, scope] of syntaxChecks) {
  const source = await readSource(file);
  if (source === null || !syntaxBoundaryPresent(source, sequence, scope)) {
    failures.push('syntax ' + label + ': executable boundary is missing');
  }
}

const centralSource = await readSource('design/apps/web/src/components/universal-settings/universalSettings.ts');
if (centralSource === null) failures.push('central handoff inventory: source file is missing');
else failures.push(...centralInventoryFailuresForSource(centralSource));

function checkNegativeCase(label, source, sequence, mutate, scope) {
  const before = syntaxBoundaryPresent(source, sequence, scope);
  const brokenSource = mutate(source);
  const broken = syntaxBoundaryPresent(brokenSource, sequence, scope);
  const restored = syntaxBoundaryPresent(source, sequence, scope);
  if (!before || broken || !restored) {
    failures.push('negative regression did not turn red then green: ' + label);
  } else {
    console.log('negative regression expected red: ' + label);
  }
}

if (process.argv.includes('--negative')) {
  const panelDeclaration = ['export', 'function', 'UniversalSettingsPanel', '('];
  const sourceNegativeCases = [
    ['desktop source validation', 'design/apps/desktop/src/main/universal-settings-store.ts', ['export', 'function', 'validateUniversalScheduleSourceRequest', '('], (source) => source.replace('validateUniversalScheduleSourceRequest', 'validateUniversalScheduleSourceRequestRenamed'), 'top-level'],
    ['site registration', 'site/assets/js/universal-settings.js', ['function', 'registerUniversalSettingsPage', '('], (source) => source.replace('registerUniversalSettingsPage', 'registerUniversalSettingsPageRenamed'), 'top-level'],
    ['mount acknowledgement status', 'site/assets/js/universal-settings.js', [stringToken('The page module is source-ready but awaits explicit registration acknowledgement.')], (source) => source.replace('The page module is source-ready but awaits explicit registration acknowledgement.', 'mount acknowledgement text removed'), undefined],
    ['host redirect refusal', 'design/apps/desktop/src/main/universal-settings-store.ts', ['response', '.', 'status', '>', '=', '300', '&', '&', 'response', '.', 'status', '<', '400'], (source) => source.replace('response.status >= 300 && response.status < 400', 'response.status >= 300 && response.status < 401'), undefined],
    ['host bounded body', 'design/apps/desktop/src/main/universal-settings-store.ts', ['UNIVERSAL_SCHEDULE_RESPONSE_MAX_BYTES'], (source) => source.replaceAll('UNIVERSAL_SCHEDULE_RESPONSE_MAX_BYTES', 'UNIVERSAL_SCHEDULE_RESPONSE_LIMIT'), undefined],
    ['host timeout', 'design/apps/desktop/src/main/universal-settings-store.ts', ['UNIVERSAL_SCHEDULE_TIMEOUT_MS'], (source) => source.replaceAll('UNIVERSAL_SCHEDULE_TIMEOUT_MS', 'UNIVERSAL_SCHEDULE_TIMEOUT_LIMIT'), undefined],
    ['notification bulk API', 'design/apps/web/src/components/notifications/notificationStore.ts', ['export', 'const', 'notificationBulkApi', '='], (source) => source.replace('notificationBulkApi', 'notificationBulkApiRenamed'), 'top-level'],
    ['search hiding', 'design/apps/web/src/components/universal-settings/UniversalSettingsPanel.tsx', ['control', '.', 'hidden', '=', 'Boolean', '('], (source) => source.replace('control.hidden = Boolean(', 'control.hidden = BooleanRenamed('), undefined],
    ['narrator tuning', 'design/apps/web/src/components/narrator/speech.ts', ['spoken', '.', 'rate', '=', 'Math', '.', 'max'], (source) => source.replace('spoken.rate = Math.max', 'spoken.rate = Math.min'), undefined],
    ['schedule matcher', 'design/apps/web/src/components/universal-settings/universalSettings.ts', ['export', 'function', 'scheduleRuleMatches', '(', 'rule', ':', 'UniversalScheduleRule', ',', 'date', ':', 'Date', ')'], (source) => source.replace('scheduleRuleMatches', 'scheduleRuleMatchesRenamed'), 'top-level'],
    ['School consumer inventory', 'design/apps/web/src/components/universal-settings/schoolMode.ts', ['export', 'const', 'SCHOOL_MODE_CONSUMER_INVENTORY', '='], (source) => source.replace('SCHOOL_MODE_CONSUMER_INVENTORY', 'SCHOOL_MODE_CONSUMER_INVENTORY_RENAMED'), 'top-level'],
    ['surprise surface', 'design/apps/web/src/components/universal-settings/StartupSurpriseSurface.tsx', ['export', 'function', 'StartupSurpriseSurface', '('], (source) => source.replace('export function StartupSurpriseSurface', 'export function StartupSurpriseSurfaceRenamed'), 'top-level'],
    ['momentum snooze', 'design/apps/web/src/components/universal-settings/UniversalSettingsRuntime.tsx', ['writeUniversalSettingsPatch', '(', '{', 'momentumSnoozedUntil', ':'], (source) => source.replace('writeUniversalSettingsPatch({ momentumSnoozedUntil:', 'writeUniversalSettingsPatch({ momentumSnoozedUntilRenamed:'), undefined],
    ['status remains unrun', 'site/assets/js/universal-settings.js', [stringToken('The page module is source-ready but awaits explicit registration acknowledgement.')], (source) => source.replace('The page module is source-ready but awaits explicit registration acknowledgement.', 'status copy removed'), undefined],
    ['regex-literal impostor', 'design/apps/web/src/components/universal-settings/UniversalSettingsPanel.tsx', panelDeclaration, (source) => source.replace('export function UniversalSettingsPanel(', 'const decoy = /export function UniversalSettingsPanel\\(/; function Replacement('), 'top-level'],
  ];
  for (const [label, file, sequence, mutate, scope] of sourceNegativeCases) {
    const source = await readSource(file);
    if (source === null) failures.push('negative regression source file is missing: ' + label);
    else checkNegativeCase(label, source, sequence, mutate, scope);
  }

  const structuralNegativeCases = [
    ['comment declaration', '// export function UniversalSettingsPanel() {}', panelDeclaration, 'top-level'],
    ['inert-string declaration', "const note = 'export function UniversalSettingsPanel()';", panelDeclaration, 'top-level'],
    ['template-literal declaration', 'const note = `export function UniversalSettingsPanel()`;', panelDeclaration, 'top-level'],
    ['rename declaration', 'export function UniversalSettingsPanelRenamed() {}', panelDeclaration, 'top-level'],
    ['descendant declaration', 'function Wrapper() { export function UniversalSettingsPanel() {} }', panelDeclaration, 'top-level'],
    ['regex-literal declaration', 'const note = /export function UniversalSettingsPanel\\(\\)/;', panelDeclaration, 'top-level'],
  ];
  for (const [label, source, sequence, scope] of structuralNegativeCases) {
    if (syntaxBoundaryPresent(source, sequence, scope)) failures.push('structural negative regression stayed satisfied: ' + label);
    else console.log('structural negative regression expected red: ' + label);
  }

  const rows = centralInventory.map(([id, path]) => `{ id: '${id}', path: '${path}', status: 'pending-c0' }`).join(',\n');
  const validInventoryFixture = `export const UNIVERSAL_SETTINGS_CENTRAL_HANDOFF_INVENTORY = Object.freeze([\n${rows}\n]);`;
  if (centralInventoryFailuresForSource(validInventoryFixture).length !== 0) {
    failures.push('structural negative baseline did not remain green: canonical central inventory fixture');
  } else {
    console.log('structural negative baseline green: canonical central inventory fixture');
  }
  const nestedInventoryFixture = `export const UNIVERSAL_SETTINGS_CENTRAL_HANDOFF_INVENTORY = Object.freeze([[\n${rows}\n]]);`;
  const reorderedRows = centralInventory.slice().reverse().map(([id, path]) => `{ id: '${id}', path: '${path}', status: 'pending-c0' }`).join(',\n');
  const reorderedInventoryFixture = `export const UNIVERSAL_SETTINGS_CENTRAL_HANDOFF_INVENTORY = Object.freeze([\n${reorderedRows}\n]);`;
  for (const [label, source] of [['nested inventory node', nestedInventoryFixture], ['reordered inventory rows', reorderedInventoryFixture]]) {
    if (centralInventoryFailuresForSource(source).length === 0) failures.push('structural negative regression stayed satisfied: ' + label);
    else console.log('structural negative regression expected red: ' + label);
  }
}

if (failures.length > 0) {
  console.error('Universal settings completeness check failed.');
  for (const failure of failures) console.error('- ' + failure);
  process.exitCode = 1;
} else {
  console.log('Universal settings completeness check passed for ' + requiredFiles.length + ' owned modules and ' + syntaxChecks.length + ' syntax-aware boundaries.');
}
