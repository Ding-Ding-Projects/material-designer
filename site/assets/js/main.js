/**
 * main.js — wiring.
 *
 * Every feature on this page lives in its own module; this file is only the
 * place they are introduced to each other and to the markup. It deliberately
 * contains no feature logic of its own, so a reader looking for "how does the
 * regex builder work" goes to regex.js rather than finding half the answer here.
 *
 * Load order matters in one respect only: the stored appearance is restored by
 * a tiny inline script in the document head, before first paint. This module
 * re-applies the full set once, which is a no-op when the two agree.
 */

import * as i18n from './i18n.js';
import * as appearance from './appearance.js';
import * as regex from './regex.js';
import * as tabs from './tabs.js';
import * as ui from './ui.js';
import * as elementAppearance from './element-appearance.js';
import { initToyLocks } from './toy-locks.js';

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

/** Translate if the catalogue knows the key, otherwise use the given text. */
function label(key, fallback) {
  return i18n.has(key) ? i18n.t(key) : fallback;
}

/* ------------------------------------------------------------------ *
 * 1. Language: mode radios, funny sliders, live samples
 * ------------------------------------------------------------------ */

function wireLanguage() {
  i18n.init();

  const modes = { en: $('#lang-mode-en'), yue: $('#lang-mode-yue'), bilingual: $('#lang-mode-bilingual') };
  const sliders = { en: $('#funny-en'), yue: $('#funny-yue') };
  const outputs = { en: $('#funny-en-out'), yue: $('#funny-yue-out') };
  const samples = { en: $('#funny-en-sample'), yue: $('#funny-yue-sample') };
  const modeSamples = {
    en: $('#mode-sample-en'), yue: $('#mode-sample-yue'), bilingual: $('#mode-sample-bilingual'),
  };

  function paint() {
    const state = i18n.getState();
    const mode = state.mode;
    const levels = state.funny;

    for (const [key, input] of Object.entries(modes)) {
      if (input) input.checked = key === mode;
    }

    for (const lang of ['en', 'yue']) {
      const level = levels[lang];
      if (sliders[lang]) sliders[lang].value = String(level);
      if (outputs[lang]) {
        outputs[lang].textContent = label('settings.funny.level.' + level, String(level));
      }
      // The sample is the point of the slider: it shows this level's voice in
      // that language, so the control demonstrates itself rather than
      // describing itself.
      if (samples[lang] && i18n.TONE_SAMPLES) {
        const bank = i18n.TONE_SAMPLES[lang];
        if (bank && bank[level]) samples[lang].textContent = bank[level];
      }
    }

    if (i18n.MODE_SAMPLES) {
      for (const [key, node] of Object.entries(modeSamples)) {
        if (node && i18n.MODE_SAMPLES[key]) node.textContent = i18n.MODE_SAMPLES[key];
      }
    }

    const status = $('#status-lang');
    if (status) status.textContent = label('settings.language.mode.' + mode, mode);
  }

  function refresh() {
    i18n.applyI18n(document);
    paint();
    document.dispatchEvent(new CustomEvent('md-i18n-applied'));
  }

  for (const [key, input] of Object.entries(modes)) {
    if (!input) continue;
    input.addEventListener('change', () => {
      if (!input.checked) return;
      i18n.setMode(key);
      refresh();
      ui.notify({ title: label('toast.language.changed', 'Language mode changed'), tone: 'info' });
    });
  }

  for (const lang of ['en', 'yue']) {
    const slider = sliders[lang];
    if (!slider) continue;
    slider.addEventListener('input', () => {
      const level = Number(slider.value);
      i18n.setFunny(lang, level);
      refresh();
    });
  }

  document.addEventListener(appearance.LANGUAGE_EVENT, refresh);
  refresh();
  return refresh;
}

/* ------------------------------------------------------------------ *
 * 2. Appearance and the colour translator
 * ------------------------------------------------------------------ */

function wireAppearance() {
  appearance.apply();

  const host = $('[data-appearance-controls]');
  if (host) {
    appearance.mountAppearanceControls(host, { translate: (k, f) => label(k, f) });
    appearance.mountColorTranslator(host, { translate: (k, f) => label(k, f) });
  }

  // The title-bar toggle is a shortcut for the setting, not a second source of
  // truth: it writes through the same module and the settings control follows.
  const toggle = $('#theme-toggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const now = document.documentElement.getAttribute('data-theme');
      const next = now === 'dark' ? 'light' : 'dark';
      appearance.setTheme(next);
    });
  }

  const status = $('#status-appearance');
  const paintStatus = () => {
    if (!status) return;
    const root = document.documentElement;
    status.textContent = [
      root.getAttribute('data-theme') || 'system',
      root.getAttribute('data-seed') || 'custom',
      root.getAttribute('data-density') || 'default',
    ].join(' · ');
  };
  document.addEventListener(appearance.CHANGE_EVENT, paintStatus);
  paintStatus();
}

/* ------------------------------------------------------------------ *
 * 3. Tabs
 * ------------------------------------------------------------------ */

function wireTabs() {
  tabs.setI18nIntegration({ t: i18n.t, has: i18n.has, tParts: i18n.tParts });
  tabs.setRegexIntegration({ attach: regex.attachRegexBuilder, dialect: tabs.REGEX_DIALECT });

  tabs.initTabs({ mount: '#tab-strip', panelAttribute: 'data-tab-panel' });

  // Anything in the page can ask to navigate; the palette uses the same route.
  for (const el of $$('[data-goto-tab]')) {
    el.addEventListener('click', (event) => {
      event.preventDefault();
      tabs.goToTab(el.getAttribute('data-goto-tab'));
    });
  }

  // "Jump to this setting" links land on the section and flash it, so a user
  // who teleported can see where they arrived.
  for (const el of $$('[data-jump-to]')) {
    el.addEventListener('click', (event) => {
      event.preventDefault();
      const id = el.getAttribute('data-jump-to');
      tabs.goToTab('settings');
      requestAnimationFrame(() => {
        const target = document.getElementById(id);
        if (!target) return;
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        ui.flash(target);
      });
    });
  }
}

/* ------------------------------------------------------------------ *
 * 4. Search — page content, and the settings surface
 * ------------------------------------------------------------------ */

/**
 * Build a searchable index of the page's own text.
 *
 * One entry per section heading and per card, holding the tab it lives on so a
 * result can navigate there. Rebuilt whenever the language changes, because the
 * text it indexes changes with it.
 */
function buildContentIndex() {
  const entries = [];
  for (const panel of $$('[data-tab-panel]')) {
    const tabId = panel.getAttribute('data-tab-panel');
    const selectors = 'h1, h2, h3, p, li, .md-card, .setting-row__label';
    for (const node of $$(selectors, panel)) {
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (text.length < 3 || text.length > 400) continue;
      entries.push({ tabId, node, text });
    }
  }
  return entries;
}

function wireSearch(fieldId, modeId, builderId, statusId, onQuery) {
  const input = $('#' + fieldId);
  if (!input) return null;

  const state = { mode: 'plain', matcher: null };

  const modeBtn = $('#' + modeId);
  const builderBtn = $('#' + builderId);
  const status = statusId ? $('#' + statusId) : null;

  // Each field gets its OWN builder instance bound to that field. One shared
  // builder that applies to whichever input was touched last is the failure
  // this avoids.
  let builder = null;
  if (builderBtn && regex.attachRegexBuilder) {
    builder = regex.attachRegexBuilder(input, {
      trigger: builderBtn,
      translate: (k, f) => label(k, f),
      onApply: (pattern, flags) => {
        state.mode = 'regex';
        input.value = pattern;
        if (modeBtn) modeBtn.setAttribute('aria-pressed', 'true');
        run(flags);
      },
    });
  }

  function currentMatcher(flags) {
    const query = input.value.trim();
    if (!query) return null;
    if (state.mode !== 'regex') {
      const needle = query.toLowerCase();
      return (text) => text.toLowerCase().includes(needle);
    }
    try {
      const re = new RegExp(query, flags || 'i');
      if (status) status.textContent = '';
      return (text) => { re.lastIndex = 0; return re.test(text); };
    } catch (error) {
      // An invalid pattern reports itself and stops matching, rather than
      // silently returning nothing and looking like "no results".
      if (status) status.textContent = label('search.invalid', 'Invalid pattern') + ': ' + error.message;
      return 'invalid';
    }
  }

  function run(flags) {
    const matcher = currentMatcher(flags);
    state.matcher = matcher;
    onQuery(matcher, input.value.trim(), state.mode);
  }

  input.addEventListener('input', () => run());
  input.addEventListener('search', () => run());

  if (modeBtn) {
    modeBtn.addEventListener('click', () => {
      state.mode = state.mode === 'regex' ? 'plain' : 'regex';
      modeBtn.setAttribute('aria-pressed', String(state.mode === 'regex'));
      modeBtn.setAttribute('data-mode', state.mode);
      const hint = state.mode === 'regex'
        ? label('search.mode.regex', 'Regular expression')
        : label('search.mode.plain', 'Plain text');
      if (status) status.textContent = hint;
      run();
    });
  }

  return { run, get builder() { return builder; } };
}

function wireContentSearch() {
  let index = buildContentIndex();
  document.addEventListener('md-i18n-applied', () => { index = buildContentIndex(); });

  const results = $('#search-results');
  const list = $('#search-results-list');
  const scroll = $('#app-scroll');

  wireSearch('site-search-input', 'site-search-mode', 'site-search-builder', 'site-search-status',
    (matcher, query) => {
      if (!results || !list) return;

      if (!query || matcher === 'invalid') {
        results.hidden = true;
        if (scroll) scroll.hidden = false;
        return;
      }

      const hits = index.filter((entry) => matcher(entry.text)).slice(0, 60);
      list.textContent = '';

      for (const hit of hits) {
        const item = document.createElement('li');
        item.className = 'md-list-item';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'md-btn md-btn--text';
        button.style.textAlign = 'left';
        button.textContent = hit.text.length > 160 ? hit.text.slice(0, 157) + '…' : hit.text;
        button.addEventListener('click', () => {
          results.hidden = true;
          if (scroll) scroll.hidden = false;
          tabs.goToTab(hit.tabId);
          requestAnimationFrame(() => {
            hit.node.scrollIntoView({ behavior: 'smooth', block: 'center' });
            ui.flash(hit.node);
          });
        });

        const where = document.createElement('span');
        where.className = 'md-list-item__supporting';
        where.textContent = hit.tabId;

        item.append(button, where);
        list.append(item);
      }

      if (!hits.length) {
        const empty = document.createElement('li');
        empty.className = 'md-empty__body';
        empty.textContent = label('search.empty', 'Nothing on this page matches that.');
        list.append(empty);
      }

      results.hidden = false;
      if (scroll) scroll.hidden = true;
    });
}

function wireSettingsSearch() {
  const units = () => $$('#tab-panel-settings [data-setting-unit], .settings-group');

  wireSearch('settings-search-input', 'settings-search-mode', 'settings-search-builder',
    'settings-search-status', (matcher, query) => {
      const all = units();
      if (!query || matcher === 'invalid') {
        for (const unit of all) unit.hidden = false;
        return;
      }
      for (const unit of all) {
        const text = (unit.textContent || '').replace(/\s+/g, ' ').trim();
        unit.hidden = !matcher(text);
      }
      // A group whose every row is hidden hides itself too, so the surface does
      // not end up as a column of empty headings.
      for (const group of $$('.settings-group')) {
        const rows = $$('[data-setting-unit]', group);
        if (!rows.length) continue;
        group.hidden = rows.every((row) => row.hidden);
      }
    });
}

/* ------------------------------------------------------------------ *
 * 5. Command palette
 * ------------------------------------------------------------------ */

function wirePalette() {
  for (const tab of tabs.DEFAULT_TABS) {
    ui.registerDestination({
      id: 'go.' + tab.id,
      title: tab.en,
      subtitle: tab.yue,
      group: label('palette.group.navigate', 'Go to'),
      run: () => tabs.goToTab(tab.id),
    });
  }

  ui.registerSetting({
    id: 'set.theme',
    title: label('settings.appearance.theme', 'Theme'),
    group: label('palette.group.settings', 'Settings'),
    control: 'select',
    options: appearance.THEMES.map((value) => ({ value, label: label('settings.appearance.theme.' + value, value) })),
    get: () => document.documentElement.getAttribute('data-theme') || 'system',
    set: (value) => appearance.setTheme(value),
  });

  ui.registerSetting({
    id: 'set.density',
    title: label('settings.appearance.density', 'Density'),
    group: label('palette.group.settings', 'Settings'),
    control: 'select',
    options: appearance.DENSITIES.map((value) => ({ value, label: label('settings.appearance.density.' + value, value) })),
    get: () => document.documentElement.getAttribute('data-density') || 'default',
    set: (value) => appearance.setDensity(value),
  });

  ui.registerSetting({
    id: 'set.language',
    title: label('settings.language.heading', 'Language mode'),
    group: label('palette.group.settings', 'Settings'),
    control: 'select',
    options: i18n.LANG_MODES.map((value) => ({ value, label: label('settings.language.mode.' + value, value) })),
    get: () => i18n.getState().mode,
    set: (value) => {
      i18n.setMode(value);
      i18n.applyI18n(document);
      const input = $('#lang-mode-' + value);
      if (input) input.checked = true;
    },
  });

  for (const lang of ['en', 'yue']) {
    ui.registerSetting({
      id: 'set.funny.' + lang,
      title: label('settings.funny.' + lang + '.label', 'Funny level (' + lang + ')'),
      group: label('palette.group.settings', 'Settings'),
      control: 'range',
      min: i18n.FUNNY_MIN,
      max: i18n.FUNNY_MAX,
      step: 1,
      get: () => i18n.getState().funny[lang],
      set: (value) => {
        i18n.setFunny(lang, Number(value));
        i18n.applyI18n(document);
        const slider = $('#funny-' + lang);
        if (slider) slider.value = String(value);
      },
    });
  }

  ui.registerCommand({
    id: 'cmd.tabsearch',
    title: label('tabs.search.label', 'Search the tabs'),
    group: label('palette.group.actions', 'Actions'),
    run: () => tabs.openTabSearch(),
  });

  ui.registerCommand({
    id: 'cmd.notifications',
    title: label('notify.center.open', 'Notification history'),
    group: label('palette.group.actions', 'Actions'),
    run: () => ui.notifications.open(),
  });

  // The palette and notification buttons are delegated inside ui.init() off
  // their data-md-* attributes, so they are deliberately not wired again here.
}

/* ------------------------------------------------------------------ *
 * 6. Resets
 * ------------------------------------------------------------------ */

function wireResets() {
  const on = (id, fn) => { const el = $('#' + id); if (el) el.addEventListener('click', fn); };

  on('reset-language', () => {
    i18n.resetLanguageSettings();
    i18n.applyI18n(document);
    ui.notify({ title: label('toast.settings.reset', 'Reset'), tone: 'success' });
    document.dispatchEvent(new CustomEvent(appearance.LANGUAGE_EVENT));
  });

  on('reset-tabs', () => {
    try { localStorage.removeItem(tabs.TABS_STORAGE_KEY); } catch (e) { /* storage disabled */ }
    ui.notify({ title: label('toast.settings.reset', 'Reset'), tone: 'success' });
    location.reload();
  });

  // Clearing everything is the one destructive action here, so it confirms
  // first. It only touches this site's own keys in this browser.
  on('reset-all', () => {
    // Clearing is reversible in the sense that it only restores defaults, but it
    // is still the one action here that throws away something the user chose,
    // so it asks first.
    const question = label('se.reset.all.desc',
      'This clears the language, appearance, tab and notification settings this site stored in this browser.');
    if (window.confirm(question)) clearEverything();
  });

  function clearEverything() {
    try {
      const doomed = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key && key.startsWith('md-designer')) doomed.push(key);
      }
      for (const key of doomed) localStorage.removeItem(key);
    } catch (e) { /* storage disabled — nothing was stored to clear */ }
    location.reload();
  }
}

/* ------------------------------------------------------------------ *
 * 8. Token swatches — the palette showing itself
 * ------------------------------------------------------------------ */

function paintTokenSwatches() {
  const host = $('#token-swatches');
  if (!host) return;

  const roles = [
    'primary', 'on-primary', 'primary-container', 'on-primary-container',
    'secondary', 'secondary-container', 'tertiary', 'tertiary-container',
    'error', 'error-container', 'surface', 'surface-container',
    'surface-container-high', 'on-surface', 'on-surface-variant', 'outline',
  ];

  const paint = () => {
    const styles = getComputedStyle(document.documentElement);
    host.textContent = '';
    for (const role of roles) {
      const value = styles.getPropertyValue('--md-sys-color-' + role).trim();
      if (!value) continue;
      const cell = document.createElement('div');
      cell.className = 'md-card md-card--outlined';
      cell.style.padding = '0';
      cell.style.overflow = 'hidden';

      const well = document.createElement('div');
      well.className = 'color-well';
      well.style.background = value;
      well.style.height = '3rem';

      const name = document.createElement('div');
      name.className = 'md-label-small mono';
      name.style.padding = '0.5rem';
      name.textContent = role;

      const hex = document.createElement('div');
      hex.className = 'md-body-small on-surface-variant mono';
      hex.style.padding = '0 0.5rem 0.5rem';
      hex.textContent = value;

      cell.append(well, name, hex);
      host.append(cell);
    }
  };

  paint();
  document.addEventListener(appearance.CHANGE_EVENT, paint);
}

/* ------------------------------------------------------------------ *
 * Start
 * ------------------------------------------------------------------ */

function start() {
  // ui.init() first: everything after it may want to raise a toast, and a
  // notification with nowhere to go is a silently swallowed one.
  ui.init();

  wireLanguage();
  wireAppearance();
  elementAppearance.init({ regex, i18n });
  wireTabs();
  wireContentSearch();
  wireSettingsSearch();
  wirePalette();
  wireResets();
  initToyLocks({ notify: ui.notify });
  paintTokenSwatches();

  if (regex.setRegexTranslator) regex.setRegexTranslator((k, f) => label(k, f));

  const engine = $('#status-engine');
  if (engine) engine.textContent = tabs.REGEX_DIALECT;

  // The dim sum draw is ui.js's own — ui.init() runs it. Doing it here as well
  // would risk two dishes in one load, which the surprise is explicitly not
  // allowed to do.
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
