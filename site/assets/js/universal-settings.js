/*
 * Universal settings for the documentation page.
 *
 * The page has its own browser-storage boundary, so it cannot share the
 * desktop app's application-data record. It does share the schema shape and
 * the user-visible contract: three language modes, two independent tone
 * levels, school suppression, a local narrator, schedules, attention modes,
 * notification history, and evidence cards. No secret value is persisted.
 */

const STORAGE_KEY = 'material-designer:universal-settings:page-v1';
const LOCAL_CREDENTIAL_KEY = 'material-designer:universal-settings:local-credential-v1';
const EVENT_NAME = 'material-designer:universal-settings-changed';
const MODES = ['en', 'yue', 'bilingual'];
const ADHD = [
  ['focus', 'Focus', '專注'],
  ['lowStimulation', 'Low stimulation', '低刺激'],
  ['timeAwareness', 'Time awareness', '時間感'],
  ['oneThing', 'One thing at a time', '一次一件事'],
  ['momentum', 'Momentum', '動力'],
];

// Hand-written inventory for dynamic page surfaces. It is checked at mount so
// a missing panel cannot disappear from a discovery-only search check.
const SURFACE_SEARCH_INVENTORY = Object.freeze([
  'language', 'school', 'narrator', 'schedule', 'adhd', 'notifications', 'status',
  'narrated-language', 'english-voice', 'cantonese-voice', 'source', 'notification-list',
]);

const defaults = () => ({
  schemaVersion: 1,
  mode: 'en',
  funny: { en: 5, yue: 5 },
  emoji: false,
  school: { enabled: false, name: 'School mode', credentialConfigured: false },
  displayName: 'Material Designer',
  narrator: { enabled: false, language: 'both', englishVoiceId: null, cantoneseVoiceId: null, rate: 1, pitch: 1, quiet: false },
  schedules: [],
  adhd: Object.fromEntries(ADHD.map(([id]) => [id, false])),
  nextAction: '',
  notifications: [],
  revision: 0,
  updatedAt: 0,
});

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validTime(value) {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return false;
  const [hours, minutes] = value.split(':').map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function text(value, fallback, max) {
  return typeof value === 'string' && value.length <= max ? value : fallback;
}

function normalize(raw) {
  const base = defaults();
  if (!raw || typeof raw !== 'object' || raw.schemaVersion !== 1) return base;
  const mode = MODES.includes(raw.mode) ? raw.mode : base.mode;
  const funny = {
    en: Number.isInteger(raw.funny?.en) && raw.funny.en >= 1 && raw.funny.en <= 5 ? raw.funny.en : 5,
    yue: Number.isInteger(raw.funny?.yue) && raw.funny.yue >= 1 && raw.funny.yue <= 5 ? raw.funny.yue : 5,
  };
  const schoolName = text(raw.school?.name, base.school.name, 80).trim() || base.school.name;
  const narratorLanguage = ['en', 'yue', 'both'].includes(raw.narrator?.language) ? raw.narrator.language : 'both';
  const schedule = Array.isArray(raw.schedules) ? raw.schedules.map((item, index) => {
    if (!item || typeof item !== 'object' || !validTime(item.startTime) || !validTime(item.endTime)) return null;
    const weekdays = item.weekdays === 'all' ? 'all' : Array.isArray(item.weekdays)
      ? [...new Set(item.weekdays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
      : null;
    if (weekdays === null) return null;
    return {
      id: text(item.id, 'schedule-' + index, 96),
      label: text(item.label, 'Schedule ' + (index + 1), 120),
      enabled: item.enabled !== false,
      priority: Number.isFinite(item.priority) ? Math.trunc(item.priority) : 0,
      startDate: item.startDate == null || validDate(item.startDate) ? item.startDate || null : null,
      endDate: item.endDate == null || validDate(item.endDate) ? item.endDate || null : null,
      startTime: item.startTime,
      endTime: item.endTime,
      weekdays,
      source: ['local', 'api', 'homeAssistant'].includes(item.source) ? item.source : 'local',
      sourceUrl: text(item.sourceUrl, '', 500) || null,
      sourceBaseUrl: text(item.sourceBaseUrl, '', 500) || null,
      sourceEntity: text(item.sourceEntity, '', 160) || null,
    };
  }).filter(Boolean).slice(0, 100) : [];
  const notifications = Array.isArray(raw.notifications) ? raw.notifications.map((item, index) => item && typeof item === 'object' ? {
    id: text(item.id, 'notification-' + index, 96), title: text(item.title, 'Notification', 240), body: text(item.body, '', 1000), tone: ['success', 'warning', 'error'].includes(item.tone) ? item.tone : 'info', createdAt: Number.isFinite(item.createdAt) ? item.createdAt : 0, read: item.read === true,
  } : null).filter(Boolean).slice(0, 500) : [];
  return {
    ...base,
    mode,
    funny,
    emoji: raw.emoji === true,
    school: { enabled: raw.school?.enabled === true, name: schoolName, credentialConfigured: raw.school?.credentialConfigured === true },
    displayName: text(raw.displayName, base.displayName, 120).trim() || base.displayName,
    narrator: {
      enabled: raw.narrator?.enabled === true,
      language: narratorLanguage,
      englishVoiceId: raw.narrator?.englishVoiceId == null ? null : text(raw.narrator.englishVoiceId, '', 240) || null,
      cantoneseVoiceId: raw.narrator?.cantoneseVoiceId == null ? null : text(raw.narrator.cantoneseVoiceId, '', 240) || null,
      rate: Number.isFinite(raw.narrator?.rate) ? Math.max(.1, Math.min(3, raw.narrator.rate)) : 1,
      pitch: Number.isFinite(raw.narrator?.pitch) ? Math.max(0, Math.min(2, raw.narrator.pitch)) : 1,
      quiet: raw.narrator?.quiet === true,
    },
    schedules: schedule,
    adhd: Object.fromEntries(ADHD.map(([id]) => [id, raw.adhd?.[id] === true])),
    nextAction: text(raw.nextAction, '', 240),
    notifications,
    revision: Number.isSafeInteger(raw.revision) && raw.revision >= 0 ? raw.revision : 0,
    updatedAt: Number.isFinite(raw.updatedAt) && raw.updatedAt >= 0 ? raw.updatedAt : 0,
  };
}

function read() {
  try { return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')); } catch (_) { return defaults(); }
}

function write(next) {
  const state = normalize({ ...next, revision: next.revision + 1, updatedAt: Date.now() });
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* storage can be disabled */ }
  document.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: state }));
  try { if (typeof BroadcastChannel !== 'undefined') { const channel = new BroadcastChannel(EVENT_NAME); channel.postMessage(state); channel.close(); } } catch (_) { /* browser may disable channels */ }
  return state;
}

function hasLocalCredential() {
  try { return sessionStorage.getItem(LOCAL_CREDENTIAL_KEY) !== null; } catch (_) { return false; }
}

async function credentialDigest(value) {
  if (typeof crypto === 'undefined' || !crypto.subtle) return null;
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function saveLocalCredential(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096) return false;
  const digest = await credentialDigest(value);
  if (!digest) return false;
  try { sessionStorage.setItem(LOCAL_CREDENTIAL_KEY, digest); return true; } catch (_) { return false; }
}

async function matchesLocalCredential(value) {
  const digest = await credentialDigest(value);
  if (!digest) return false;
  try { return sessionStorage.getItem(LOCAL_CREDENTIAL_KEY) === digest; } catch (_) { return false; }
}

function clearLocalCredential() {
  try { sessionStorage.removeItem(LOCAL_CREDENTIAL_KEY); } catch (_) { /* private mode may refuse */ }
}

function labelFor(mode, en, yue) {
  return mode === 'yue' ? yue : mode === 'bilingual' ? en + ' · ' + yue : en;
}

function setupUniversalSettings() {
  const root = document.querySelector('[data-universal-settings]');
  if (!root) return;
  let state = read();
  let active = 'language';
  let voiceList = [];
  let selected = new Set();
  const panelSearches = new Map();

  const tabs = Array.from(root.querySelectorAll('[data-universal-tab]'));
  const panels = Array.from(root.querySelectorAll('[data-universal-panel]'));
  const input = root.querySelector('[data-universal-search] input') || root.querySelector('#universal-settings-search');
  const status = root.querySelector('#universal-settings-search-status');
  let builder = null;

  function activeLabel(en, yue) { return labelFor(state.mode, en, yue); }
  function updateMainLanguage() {
    if (window.__mdI18n && typeof window.__mdI18n.setMode === 'function') window.__mdI18n.setMode(state.mode);
    if (window.__mdI18n && typeof window.__mdI18n.setFunny === 'function') {
      window.__mdI18n.setFunny('en', state.funny.en);
      window.__mdI18n.setFunny('yue', state.funny.yue);
      window.__mdI18n.applyI18n?.(document);
    }
  }
  function setState(patch) { state = write({ ...state, ...patch }); updateMainLanguage(); paint(); }
  function filtered(textValue, panelId = active) {
    const field = panelSearches.get(panelId);
    const panelInput = field?.input || input;
    if (!panelInput || !panelInput.value.trim()) return true;
    const controller = field?.builder || builder || regexController();
    if (controller && typeof controller.matcher === 'function') {
      const matcher = controller.matcher();
      if (matcher && matcher !== 'invalid') return matcher(textValue);
    }
    return textValue.toLowerCase().includes(panelInput.value.trim().toLowerCase());
  }
  function regexController() {
    try { return window.__mdRegex?.getBuilder?.(input); } catch (_) { return null; }
  }
  function paintTabs() {
    if (state.school.enabled && active !== 'school' && active !== 'status') active = 'school';
    tabs.forEach((tab) => {
      const isActive = tab.dataset.universalTab === active;
      const forbidden = state.school.enabled && !['school', 'status'].includes(tab.dataset.universalTab);
      tab.hidden = forbidden;
      tab.setAttribute('aria-selected', String(isActive));
      tab.classList.toggle('is-active', isActive);
    });
    panels.forEach((panel) => { panel.hidden = panel.dataset.universalPanel !== active; });
  }
  function ensurePanelSearch(panel) {
    const panelId = panel.dataset.universalPanel;
    if (!panelId || panel.querySelector('[data-universal-panel-search]')) return;
    const wrap = document.createElement('div');
    wrap.className = 'md-search universal-search';
    wrap.dataset.universalPanelSearch = panelId;
    const labelEl = document.createElement('label');
    labelEl.className = 'visually-hidden';
    const inputEl = document.createElement('input');
    inputEl.className = 'md-search__input';
    inputEl.type = 'search';
    inputEl.id = 'universal-panel-search-' + panelId;
    inputEl.autocomplete = 'off';
    inputEl.spellcheck = false;
    inputEl.placeholder = 'Search this tab';
    labelEl.htmlFor = inputEl.id;
    labelEl.textContent = 'Search ' + panelId;
    wrap.append(labelEl, inputEl);
    panel.prepend(wrap);
    let panelBuilder = null;
    try {
      window.__mdRegex?.attachAll?.(panel);
      panelBuilder = window.__mdRegex?.getBuilder?.(inputEl) || null;
    } catch (_) { panelBuilder = null; }
    panelSearches.set(panelId, { input: inputEl, builder: panelBuilder });
    inputEl.addEventListener('input', paint);
  }
  function paintLanguage(panel) {
    const mode = panel.querySelector('[data-universal-language]');
    if (mode) mode.value = state.mode;
    panel.querySelectorAll('[data-universal-funny]').forEach((slider) => {
      const lang = slider.dataset.universalFunny;
      slider.value = String(state.funny[lang]);
      const output = panel.querySelector('[data-universal-funny-output="' + lang + '"]');
      if (output) output.textContent = String(state.funny[lang]);
    });
    const emoji = panel.querySelector('[data-universal-emoji]');
    if (emoji) emoji.checked = state.emoji;
  }
  function renderSchool(panel) {
    panel.textContent = '';
    const title = document.createElement('h4'); title.textContent = state.school.name + ' and display name'; panel.append(title);
    const display = field('Display name', state.displayName, (value) => setState({ displayName: value })); panel.append(display);
    const displayHint = document.createElement('p'); displayHint.className = 'md-body-small on-surface-variant'; displayHint.textContent = 'Display name changes labels only. Stable package and data identity stay unchanged.'; panel.append(displayHint);
    const school = checkbox(state.school.name, state.school.enabled, (checked) => { if (checked) { setState({ school: { ...state.school, enabled: true } }); return; } const control = school.querySelector('input'); if (control) control.checked = true; credential.textContent = hasLocalCredential() ? 'Enter the browser-local credential below, then use Unlock. The value is never displayed or exported.' : 'The mode stays on until a browser-local credential is configured. This page equivalent is session-only.'; }); panel.append(school);
    const name = field(state.school.name + ' name', state.school.name, (value) => setState({ school: { ...state.school, name: value } })); panel.append(name);
    const credential = document.createElement('p'); credential.className = 'md-body-small on-surface-variant'; credential.textContent = state.school.credentialConfigured && hasLocalCredential() ? 'A browser-local credential is present for this visit. Its value is never displayed or exported.' : 'No browser-local credential is configured. The page cannot use an operating-system vault, so this equivalent is session-only.'; panel.append(credential);
    const inputEl = document.createElement('input'); inputEl.type = 'password'; inputEl.className = 'md-input'; inputEl.autocomplete = 'new-password'; inputEl.maxLength = 4096; inputEl.placeholder = 'Enter a local credential'; inputEl.setAttribute('aria-label', 'Enter a local credential'); panel.append(inputEl);
    const row = document.createElement('div'); row.className = 'button-row';
    const configure = document.createElement('button'); configure.type = 'button'; configure.className = 'md-btn md-btn--outlined'; configure.textContent = 'Save browser-local credential'; configure.addEventListener('click', () => { const value = inputEl.value; void saveLocalCredential(value).then((saved) => { if (!saved) { credential.textContent = 'Credential was not saved. Enter a bounded non-empty value and try again.'; return; } inputEl.value = ''; setState({ school: { ...state.school, credentialConfigured: true } }); }); });
    const clear = document.createElement('button'); clear.type = 'button'; clear.className = 'md-btn md-btn--text'; clear.textContent = 'Clear browser-local credential'; clear.addEventListener('click', () => { clearLocalCredential(); inputEl.value = ''; setState({ school: { ...state.school, credentialConfigured: false } }); });
    const unlock = document.createElement('button'); unlock.type = 'button'; unlock.className = 'md-btn md-btn--outlined'; unlock.textContent = 'Unlock School mode'; unlock.hidden = !state.school.enabled; unlock.addEventListener('click', () => { const value = inputEl.value; inputEl.value = ''; void matchesLocalCredential(value).then((matches) => { if (!matches) { credential.textContent = 'Credential did not match. The page equivalent remains in School mode.'; return; } setState({ school: { ...state.school, enabled: false } }); }); });
    row.append(configure, clear, unlock); panel.append(row);
  }
  function renderNarrator(panel) {
    panel.textContent = '';
    panel.append(checkbox('Enable narrator', state.narrator.enabled, (checked) => setState({ narrator: { ...state.narrator, enabled: checked } })));
    const language = selectField('Narrated language', [['en', 'English'], ['yue', '粵語'], ['both', 'Both · 兩種']], state.narrator.language, (value) => setState({ narrator: { ...state.narrator, language: value } })); panel.append(language);
    const english = selectField('English voice', [['', 'Choose automatically'], ...voiceList.filter((voice) => /^en(?:-|$)/i.test(voice.lang)).map((voice) => [voice.voiceURI, voice.name + ' · ' + voice.lang])], state.narrator.englishVoiceId || '', (value) => setState({ narrator: { ...state.narrator, englishVoiceId: value || null } })); panel.append(english);
    const cantonese = selectField('Cantonese voice · 粵語聲音', [['', 'Choose automatically'], ...voiceList.filter((voice) => /^(?:zh-(?:HK|Hant)|yue)(?:-|$)/i.test(voice.lang)).map((voice) => [voice.voiceURI, voice.name + ' · ' + voice.lang])], state.narrator.cantoneseVoiceId || '', (value) => setState({ narrator: { ...state.narrator, cantoneseVoiceId: value || null } })); panel.append(cantonese);
    panel.append(rangeField('Rate', state.narrator.rate, .1, 3, .1, (value) => setState({ narrator: { ...state.narrator, rate: value } })));
    panel.append(rangeField('Pitch', state.narrator.pitch, 0, 2, .1, (value) => setState({ narrator: { ...state.narrator, pitch: value } })));
    panel.append(checkbox('Quiet mode', state.narrator.quiet, (checked) => setState({ narrator: { ...state.narrator, quiet: checked } })));
    const speak = document.createElement('button'); speak.type = 'button'; speak.className = 'md-btn md-btn--filled'; speak.textContent = 'Speak sample'; speak.disabled = !state.narrator.enabled || !window.speechSynthesis; speak.addEventListener('click', () => speakParts(['The narrator is active.', '旁白而家開咗。'])); panel.append(speak);
    if (!window.speechSynthesis) { const p = document.createElement('p'); p.className = 'md-body-small'; p.textContent = 'Speech synthesis is unavailable on this computer.'; panel.append(p); }
  }
  function speakParts(parts) {
    if (!window.speechSynthesis || state.narrator.quiet) return;
    window.speechSynthesis.cancel();
    let index = 0;
    const next = () => { const value = state.narrator.language === 'en' ? parts[0] : state.narrator.language === 'yue' ? parts[1] : parts[index++]; if (!value) return; const utterance = new SpeechSynthesisUtterance(value); utterance.rate = state.narrator.rate; utterance.pitch = state.narrator.pitch; utterance.onend = next; window.speechSynthesis.speak(utterance); };
    next();
  }
  function renderSchedule(panel) {
    panel.textContent = '';
    const add = document.createElement('button'); add.type = 'button'; add.className = 'md-btn md-btn--filled'; add.textContent = 'Add local schedule'; add.addEventListener('click', () => setState({ schedules: [...state.schedules, { id: 'schedule-' + Date.now(), label: 'New local schedule', enabled: true, priority: 0, startDate: null, endDate: null, startTime: '09:00', endTime: '17:00', weekdays: 'all', source: 'local', sourceUrl: null, sourceEntity: null }] })); panel.append(add);
    const tz = document.createElement('p'); tz.className = 'md-body-small on-surface-variant'; tz.textContent = 'Local timezone: ' + Intl.DateTimeFormat().resolvedOptions().timeZone + '. Daylight-saving changes follow the browser clock.'; panel.append(tz);
    state.schedules.forEach((rule, index) => { const card = document.createElement('div'); card.className = 'md-card md-card--outlined'; card.dataset.universalSetting = ''; card.append(field('Label', rule.label, (value) => { const schedules = [...state.schedules]; schedules[index] = { ...rule, label: value }; setState({ schedules }); })); card.append(rangeField('Priority', rule.priority, -1000, 1000, 1, (value) => { const schedules = [...state.schedules]; schedules[index] = { ...rule, priority: value }; setState({ schedules }); })); card.append(timeField('Start time', rule.startTime, (value) => { const schedules = [...state.schedules]; schedules[index] = { ...rule, startTime: value }; setState({ schedules }); })); card.append(timeField('End time', rule.endTime, (value) => { const schedules = [...state.schedules]; schedules[index] = { ...rule, endTime: value }; setState({ schedules }); })); const source = selectField('Source', [['local', 'Local'], ['api', 'Validated HTTPS API'], ['homeAssistant', 'Home Assistant boolean']], rule.source, (value) => { const schedules = [...state.schedules]; schedules[index] = { ...rule, source: value }; setState({ schedules }); }); card.append(source); card.append(scheduleValueFields(rule, index)); if (rule.source === 'homeAssistant') { card.append(field('HTTPS base URL', rule.sourceBaseUrl, (value) => { const schedules = [...state.schedules]; schedules[index] = { ...rule, sourceBaseUrl: value }; setState({ schedules }); })); card.append(field('Boolean entity', rule.sourceEntity, (value) => { const schedules = [...state.schedules]; schedules[index] = { ...rule, sourceEntity: value }; setState({ schedules }); })); } const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'md-btn md-btn--text'; remove.textContent = 'Remove schedule'; remove.addEventListener('click', () => setState({ schedules: state.schedules.filter((item) => item.id !== rule.id) })); card.append(remove); const error = !validTime(rule.startTime) || !validTime(rule.endTime) ? 'Start and end times must use HH:mm.' : rule.source === 'api' && !/^https:\/\//.test(rule.sourceUrl || '') ? 'API schedules require an HTTPS URL.' : rule.source === 'homeAssistant' && (!/^https:\/\//.test(rule.sourceBaseUrl || '') || !rule.sourceEntity) ? 'Home Assistant schedules require an HTTPS base URL and boolean entity.' : ''; if (error) { const p = document.createElement('p'); p.className = 'md-body-small'; p.textContent = error + ' This rule will not be applied.'; card.append(p); } panel.append(card); });
  }
  function scheduleValueFields(rule, index) { const wrap = document.createElement('div'); wrap.className = 'schedule-values'; const current = rule.values || {}; const patchValues = (key, value) => { const schedules = [...state.schedules]; schedules[index] = { ...rule, values: { ...current, [key]: value } }; setState({ schedules }); }; wrap.append(selectField('Scheduled language', [['english', 'English'], ['cantonese', 'Cantonese'], ['bilingual', 'Bilingual']], current.languageMode || '', (value) => patchValues('languageMode', value))); wrap.append(selectField('Scheduled theme', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']], current.theme || 'system', (value) => patchValues('theme', value))); wrap.append(selectField('Scheduled density', [['comfortable', 'Comfortable'], ['compact', 'Compact'], ['spacious', 'Spacious']], current.density || 'comfortable', (value) => patchValues('density', value))); wrap.append(field('Scheduled accent colour', current.accentColor || '', (value) => patchValues('accentColor', value))); wrap.append(field('Scheduled UI font family', current.uiFontFamily || '', (value) => patchValues('uiFontFamily', value))); return wrap; }
  function renderAdhd(panel) { panel.textContent = ''; ADHD.forEach(([id, en, yue]) => { const row = checkbox(activeLabel(en, yue), state.adhd[id], (checked) => setState({ adhd: { ...state.adhd, [id]: checked } })); row.dataset.universalSetting = ''; panel.append(row); }); const next = field('Next action', state.nextAction, (value) => setState({ nextAction: value })); next.dataset.universalSetting = ''; panel.append(next); const p = document.createElement('p'); p.className = 'md-body-small on-surface-variant'; p.textContent = activeLabel('These are interface accommodations, not medical features.', '呢啲係介面配合，唔係醫療功能。'); panel.append(p); }
  function renderNotifications(panel) { panel.textContent = ''; const controls = document.createElement('div'); controls.className = 'button-row'; const selectAll = button('Select all visible', () => { selected = new Set(state.notifications.map((item) => item.id)); paint(); }); const invert = button('Invert selection', () => { selected = new Set(state.notifications.filter((item) => !selected.has(item.id)).map((item) => item.id)); paint(); }); const mark = button('Mark selected read', () => setState({ notifications: state.notifications.map((item) => selected.has(item.id) ? { ...item, read: true } : item) })); const clear = button('Clear selected', () => { setState({ notifications: state.notifications.filter((item) => !selected.has(item.id)) }); selected = new Set(); }); controls.append(selectAll, invert, mark, clear); panel.append(controls); const list = document.createElement('div'); list.className = 'md-list'; list.dataset.universalList = 'notification-list'; state.notifications.filter((item) => filtered(item.title + ' ' + item.body)).forEach((item) => { const row = checkbox(item.title + ': ' + item.body, selected.has(item.id), (checked) => { if (checked) selected.add(item.id); else selected.delete(item.id); }); row.dataset.universalSetting = ''; list.append(row); }); panel.append(list); }
  function renderStatus(panel) { panel.textContent = ''; const cards = [{ title: 'Build provenance', state: 'unrun', detail: 'Version and updated-at values are unavailable until bound to the released page.' }, { title: 'Universal settings', state: 'running', detail: 'Local state, persistence, and live page updates are active.' }, { title: 'Built-artifact evidence', state: 'unrun', detail: 'Headless drive evidence remains pending for this page candidate.' }]; cards.forEach((card) => { const article = document.createElement('article'); article.className = 'md-card md-card--outlined'; article.dataset.universalSetting = ''; const title = document.createElement('strong'); title.textContent = card.title; const stateEl = document.createElement('span'); stateEl.textContent = (card.state === 'verified' ? '✅ ' : card.state === 'running' ? '🏃 ' : '⏳ ') + card.state; const detail = document.createElement('p'); detail.className = 'md-body-small on-surface-variant'; detail.textContent = card.detail; article.append(title, stateEl, detail); panel.append(article); }); const delivery = document.createElement('p'); delivery.className = 'md-body-small on-surface-variant'; delivery.textContent = 'Status delivery: local page projection only. No authenticated shared Status Hub channel is connected, so no remote delivery is claimed.'; panel.append(delivery); }
  function paint() {
    document.documentElement.setAttribute('data-universal-school-mode', String(state.school.enabled));
    document.documentElement.setAttribute('data-universal-school-name', state.school.name);
    ADHD.forEach(([id]) => document.documentElement.setAttribute('data-universal-adhd-' + id.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase()), String(state.adhd[id])));
    document.documentElement.setAttribute('data-universal-display-name', state.displayName);
    document.title = state.displayName;
    paintTabs();
    const language = root.querySelector('[data-universal-panel="language"]'); if (language) paintLanguage(language);
    const school = root.querySelector('[data-universal-panel="school"]'); if (school) renderSchool(school);
    const narrator = root.querySelector('[data-universal-panel="narrator"]'); if (narrator) renderNarrator(narrator);
    const schedule = root.querySelector('[data-universal-panel="schedule"]'); if (schedule) renderSchedule(schedule);
    const adhd = root.querySelector('[data-universal-panel="adhd"]'); if (adhd) renderAdhd(adhd);
    const notifications = root.querySelector('[data-universal-panel="notifications"]'); if (notifications) renderNotifications(notifications);
    const statusPanel = root.querySelector('[data-universal-panel="status"]'); if (statusPanel) renderStatus(statusPanel);
    const currentPanel = root.querySelector('[data-universal-panel="' + active + '"]');
    panels.forEach((panel) => ensurePanelSearch(panel));
    const searchable = currentPanel ? Array.from(currentPanel.querySelectorAll('[data-universal-setting]')) : [];
    let visibleCount = 0;
    searchable.forEach((item) => {
      const visible = filtered(item.textContent || '', active);
      item.hidden = !visible;
      if (visible) visibleCount += 1;
    });
    if (status) status.textContent = input && input.value
      ? (visibleCount ? visibleCount + ' matching setting(s)' : 'Nothing matches this section')
      : '';
  }
  function field(labelText, value, onChange) { const wrap = document.createElement('label'); wrap.className = 'setting-row'; const textWrap = document.createElement('span'); textWrap.className = 'setting-row__text'; const labelEl = document.createElement('span'); labelEl.className = 'setting-row__label'; labelEl.textContent = labelText; const inputEl = document.createElement('input'); inputEl.className = 'md-input'; inputEl.value = value ?? ''; inputEl.addEventListener('input', () => onChange(inputEl.value)); textWrap.append(labelEl); wrap.append(textWrap, inputEl); return wrap; }
  function checkbox(labelText, checked, onChange) { const wrap = document.createElement('label'); wrap.className = 'setting-row'; const textWrap = document.createElement('span'); textWrap.className = 'setting-row__text'; const labelEl = document.createElement('span'); labelEl.className = 'setting-row__label'; labelEl.textContent = labelText; textWrap.append(labelEl); const inputEl = document.createElement('input'); inputEl.type = 'checkbox'; inputEl.checked = checked; inputEl.addEventListener('change', () => onChange(inputEl.checked)); wrap.append(textWrap, inputEl); return wrap; }
  function selectField(labelText, options, value, onChange) { const wrap = document.createElement('label'); wrap.className = 'setting-row'; wrap.dataset.universalPicker = labelText.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); const labelEl = document.createElement('span'); labelEl.className = 'setting-row__label'; labelEl.textContent = labelText; const filter = document.createElement('input'); filter.className = 'md-input universal-picker-search'; filter.type = 'search'; filter.placeholder = 'Search choices'; filter.setAttribute('data-regex-builder', ''); filter.setAttribute('aria-label', 'Search ' + labelText); const select = document.createElement('select'); select.className = 'md-select'; let pickerBuilder = null; const paintOptions = () => { const query = filter.value.trim().toLowerCase(); const matcher = pickerBuilder?.matcher?.(); const matches = (optionLabel) => matcher && matcher !== 'invalid' ? matcher(optionLabel) : !query || optionLabel.toLowerCase().includes(query); select.textContent = ''; options.filter(([, optionLabel]) => matches(optionLabel)).forEach(([optionValue, optionLabel]) => { const option = document.createElement('option'); option.value = optionValue; option.textContent = optionLabel; select.append(option); }); if (Array.from(select.options).some((option) => option.value === value)) select.value = value; }; filter.addEventListener('input', paintOptions); select.addEventListener('change', () => onChange(select.value)); wrap.append(labelEl, filter, select); try { window.__mdRegex?.attachAll?.(wrap); pickerBuilder = window.__mdRegex?.getBuilder?.(filter) || null; } catch (_) { /* builder attaches on the next page pass */ } paintOptions(); return wrap; }
  function rangeField(labelText, value, min, max, step, onChange) { const wrap = document.createElement('label'); wrap.className = 'setting-row'; const labelEl = document.createElement('span'); labelEl.className = 'setting-row__label'; labelEl.textContent = labelText; const range = document.createElement('input'); range.className = 'md-slider'; range.type = 'range'; range.min = min; range.max = max; range.step = step; range.value = value; const output = document.createElement('output'); output.textContent = String(value); range.addEventListener('input', () => { output.textContent = range.value; onChange(Number(range.value)); }); wrap.append(labelEl, range, output); return wrap; }
  function timeField(labelText, value, onChange) { const wrap = document.createElement('label'); wrap.className = 'setting-row'; const labelEl = document.createElement('span'); labelEl.className = 'setting-row__label'; labelEl.textContent = labelText; const time = document.createElement('input'); time.type = 'time'; time.className = 'md-input'; time.value = value || ''; time.addEventListener('change', () => onChange(time.value)); wrap.append(labelEl, time); return wrap; }
  function button(labelText, onClick) { const el = document.createElement('button'); el.type = 'button'; el.className = 'md-btn md-btn--outlined'; el.textContent = labelText; el.addEventListener('click', onClick); return el; }

  tabs.forEach((tab) => tab.addEventListener('click', () => { active = tab.dataset.universalTab; paint(); }));
  root.querySelector('[data-universal-language]')?.addEventListener('change', (event) => setState({ mode: event.target.value }));
  root.querySelectorAll('[data-universal-funny]').forEach((slider) => slider.addEventListener('input', () => setState({ funny: { ...state.funny, [slider.dataset.universalFunny]: Number(slider.value) } })));
  root.querySelector('[data-universal-emoji]')?.addEventListener('change', (event) => setState({ emoji: event.target.checked }));
  input?.addEventListener('input', paint);
  const applyExternalState = (value) => { const next = normalize(value); if (next.revision < state.revision) return; state = next; paint(); };
  document.addEventListener(EVENT_NAME, (event) => applyExternalState(event.detail));
  window.addEventListener('storage', (event) => { if (event.key !== STORAGE_KEY || !event.newValue) return; try { applyExternalState(JSON.parse(event.newValue)); } catch (_) { /* malformed external state stays ignored */ } });
  if (typeof BroadcastChannel !== 'undefined') { try { const channel = new BroadcastChannel(EVENT_NAME); channel.addEventListener('message', (event) => applyExternalState(event.data)); } catch (_) { /* browser may disable channels */ } }
  if (window.speechSynthesis) { const readVoices = () => { voiceList = window.speechSynthesis.getVoices(); if (active === 'narrator') paint(); }; readVoices(); window.speechSynthesis.addEventListener('voiceschanged', readVoices); }
  try {
    if (window.__mdRegex?.attachAll) window.__mdRegex.attachAll(root);
    builder = regexController();
  } catch (_) { /* regex module may attach after this module */ }
  const panelIds = new Set(panels.map((panel) => panel.dataset.universalPanel));
  if (SURFACE_SEARCH_INVENTORY.slice(0, 7).some((id) => !panelIds.has(id))) throw new Error('Universal settings search inventory is incomplete');
  paint();
  const adhdStartedAt = Date.now();
  const updateAdhdStatus = () => {
    const existing = document.querySelectorAll('[data-universal-adhd-runtime]');
    existing.forEach((node) => node.remove());
    if (state.adhd.timeAwareness) { const el = document.createElement('div'); el.dataset.universalAdhdRuntime = 'true'; el.className = 'universal-adhd-time-awareness'; el.textContent = 'Session elapsed: ' + Math.floor((Date.now() - adhdStartedAt) / 60000) + 'm ' + Math.floor((Date.now() - adhdStartedAt) / 1000) % 60 + 's'; el.setAttribute('role', 'status'); document.body.append(el); }
    if (state.adhd.oneThing && state.nextAction) { const el = document.createElement('div'); el.dataset.universalAdhdRuntime = 'true'; el.className = 'universal-adhd-next-action'; el.textContent = 'Next action: ' + state.nextAction; el.setAttribute('role', 'status'); document.body.append(el); }
    if (state.adhd.momentum && state.updatedAt > 0 && Date.now() - state.updatedAt >= 900000) { const el = document.createElement('div'); el.dataset.universalAdhdRuntime = 'true'; el.className = 'universal-adhd-momentum'; el.textContent = 'Nothing has changed here for ' + Math.floor((Date.now() - state.updatedAt) / 60000) + ' minutes.'; el.setAttribute('role', 'status'); document.body.append(el); }
  };
  window.setInterval(updateAdhdStatus, 1000);
  document.addEventListener('focusin', (event) => { if (!state.adhd.focus || !(event.target instanceof HTMLElement)) return; const surface = event.target.closest('section, main, [role="dialog"]'); if (!surface?.parentElement) return; Array.from(surface.parentElement.children).forEach((child) => { if (child instanceof HTMLElement) child.toggleAttribute('data-universal-adhd-dimmed', child !== surface); }); });
  updateAdhdStatus();
  const missingDynamic = SURFACE_SEARCH_INVENTORY.slice(7).filter((id) => !root.querySelector(`[data-universal-picker="${id}"], [data-universal-list="${id}"]`));
  if (missingDynamic.length > 0) throw new Error('Universal settings dynamic search inventory is incomplete: ' + missingDynamic.join(', '));
}

export { normalize, defaults, setupUniversalSettings, STORAGE_KEY, SURFACE_SEARCH_INVENTORY, hasLocalCredential, saveLocalCredential, clearLocalCredential };
