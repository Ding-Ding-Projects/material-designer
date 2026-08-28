/**
 * ui.js — the interaction layer for the Material Designer site.
 * ============================================================================
 *
 * Four surfaces live here, because they share one plumbing (the notification
 * record store) and one set of conventions (M3 tokens, language modes, tone
 * levels, reduced motion):
 *
 *   1. Toasts             — a non-blocking corner stack.
 *   2. Notification centre — the reviewable history of every toast raised.
 *   3. Command palette     — Ctrl+Shift+F over every command, setting and page.
 *   4. Dim sum surprise    — a 1-in-10 draw on load, from the bundled catalogue.
 *
 * NOTHING here is modal except the command palette, which is modal because the
 * user deliberately opened a thing whose whole job is to take the next
 * keystroke. Everything that merely informs is a toast.
 *
 * ----------------------------------------------------------------------------
 * CONTRACT WITH THE REST OF THE SITE
 * ----------------------------------------------------------------------------
 *
 * This module is built to be resilient: it is loaded alongside i18n.js,
 * appearance.js, tabs.js and main.js, and it must not break if one of them
 * exposes a different shape than expected. So:
 *
 *   * It imports i18n.js as a NAMESPACE (`import * as i18n`). A namespace
 *     import tolerates any export shape — a missing named export is simply
 *     `undefined` rather than a link-time error that would take the whole
 *     module graph down with it.
 *   * It asks i18n for three tiny things only — the language mode, the two tone
 *     levels, and a change subscription — and probes several plausible function
 *     names for each. If none is found it falls back to `<html>` data
 *     attributes, then to English at level 5.
 *   * It carries its OWN copy for the strings it owns (see UI_STRINGS below),
 *     in English and Cantonese at five tone levels, so the interaction layer
 *     reads correctly even standalone. It registers that catalogue with i18n
 *     when i18n offers a way to accept it.
 *   * It never imports appearance.js or tabs.js. Those register with it, or are
 *     discovered from the DOM (see below).
 *   * It injects its own stylesheet, built only on the M3 tokens, at the TOP of
 *     <head> — so app.css, which comes later in the cascade, can override any
 *     of it without a specificity fight.
 *
 * DOM attributes this module wires up automatically, so index.html needs no
 * JavaScript of its own:
 *
 *   data-md-notifications-toggle   on a button   → opens/closes the centre
 *   data-md-notification-count     on a badge    → kept in sync with the unread count
 *   data-md-palette-open           on a button   → opens the command palette
 *   data-md-command="Label"        on a button   → appears in the palette; running it clicks the button
 *   data-md-setting="Label"        on an input/select/radiogroup
 *                                                → appears in the palette WITH a live inline
 *                                                  control that drives the real one
 *   data-md-setting-yue="標籤"      optional Cantonese label for the above
 *   data-md-setting-section="…"    optional grouping for the above
 *   role="tab" + aria-controls     on the tab strip
 *                                                → every tab appears as a palette destination
 *
 * Custom events on `document` (the loose bus, for modules that would rather not
 * import anything):
 *
 *   listens  md:toast          {detail: <notify spec>}  → raises a toast
 *   listens  md:lang-change                             → re-renders open surfaces
 *   listens  md:appearance-change                       → re-renders open surfaces
 *   fires    md:notify         {detail: {record}}
 *   fires    md:navigate       {detail: {id}}           → tabs.js may act on this
 *   fires    md:palette-open / md:palette-close
 *
 * ----------------------------------------------------------------------------
 * HONESTY
 * ----------------------------------------------------------------------------
 * The tone level restyles VOICE, never FACTS. Dish names, timestamps, counts,
 * setting values and error text are identical at level 1 and level 5; only the
 * sentence around them changes. The dim sum surprise has NO opt-out and this
 * module deliberately registers no setting to disable it.
 */

import * as i18n from './i18n.js';
import * as regex from './regex.js';

export const version = '1.0.0';

/* ==========================================================================
 * 0. Small utilities
 * ========================================================================== */

const STORE_PREFIX = 'md.ui.';
const MAX_RECORDS = 200; // the notification centre keeps this many, newest first

/** localStorage that cannot throw — private mode, disabled storage, quota. */
const store = {
  get(key, fallback) {
    try {
      const raw = window.localStorage.getItem(STORE_PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(STORE_PREFIX + key, JSON.stringify(value));
    } catch {
      /* Storage is a nicety here, never a requirement. */
    }
  },
};

/** `prefers-reduced-motion` is read live, not cached — users change it mid-session. */
function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Element factory. `props.html` is only ever used for our own inline SVG. */
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);
  }
  return node;
}

let idSeq = 0;
const nextId = (prefix) => `${prefix}-${Date.now().toString(36)}-${(idSeq += 1).toString(36)}`;

/* --- Icons -----------------------------------------------------------------
 * Material Symbols is a web font and this site ships no web fonts, so every
 * glyph is inline SVG. 24px grid, currentColor, marked decorative — the
 * meaning is always carried by adjacent text or an aria-label.
 * -------------------------------------------------------------------------- */

const ICON_PATHS = {
  info: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1 5h2v2h-2V7Zm0 4h2v6h-2v-6Z',
  success: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1.2 14.3-4.1-4.1 1.4-1.4 2.7 2.7 5.7-5.7 1.4 1.4-7.1 7.1Z',
  warning: 'M1 21h22L12 2 1 21Zm12-3h-2v-2h2v2Zm0-4h-2v-4h2v4Z',
  error: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-2h2v2Zm0-4h-2V7h2v6Z',
  progress: 'M12 4V1L8 5l4 4V6a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8Z',
  close: 'M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4Z',
  bell: 'M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2Zm6-6v-5.1A6 6 0 0 0 13 5.1V4a1 1 0 1 0-2 0v1.1A6 6 0 0 0 6 10.9V16l-2 2v1h16v-1l-2-2Z',
  search: 'M15.5 14h-.8l-.3-.3a6.5 6.5 0 1 0-.7.7l.3.3v.8l5 5 1.5-1.5-5-5Zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9Z',
  check: 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z',
  trash: 'M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12ZM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4Z',
  expand: 'M4 4h6v2H6v4H4V4Zm10 0h6v6h-2V6h-4V4ZM4 14h2v4h4v2H4v-6Zm14 0h2v6h-6v-2h4v-4Z',
  collapse: 'M8 4h2v4H6V6h2V4Zm6 0h2v2h2v2h-4V4ZM6 16h4v4H8v-2H6v-2Zm8 0h4v2h-2v2h-2v-4Z',
  chevron: 'M9.3 6 8 7.4 12.6 12 8 16.6 9.3 18l6-6-6-6Z',
  page: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm-1 7V3.5L18.5 9H13Z',
  command: 'M6 2a4 4 0 0 0 0 8h2V8H6a2 2 0 1 1 2-2v12a4 4 0 1 0 4-4h-2v2h2a2 2 0 1 1-2 2V6a4 4 0 1 0-4 4V8H6Z',
  slider: 'M3 17v2h6v-2H3ZM3 5v2h10V5H3Zm10 16v-2h8v-2h-8v-2h-2v6h2ZM7 9v2H3v2h4v2h2V9H7Zm14 4v-2H11v2h10Zm-6-4h2V7h4V5h-4V3h-2v6Z',
  dimsum: 'M12 4c-4 0-7.2 2.4-7.2 5.4 0 .9.3 1.8.8 2.6H4a1 1 0 0 0 0 2h1.1A7.5 7.5 0 0 0 12 20a7.5 7.5 0 0 0 6.9-6H20a1 1 0 0 0 0-2h-1.6c.5-.8.8-1.7.8-2.6C19.2 6.4 16 4 12 4Z',
};

function icon(name, size = 20) {
  const path = ICON_PATHS[name] || ICON_PATHS.info;
  return el('span', {
    class: 'md-ui-icon',
    'aria-hidden': 'true',
    html:
      `<svg viewBox="0 0 24 24" width="${size}" height="${size}" focusable="false" fill="currentColor">` +
      `<path d="${path}"/></svg>`,
  });
}

/* ==========================================================================
 * 1. Language modes and tone levels
 * ==========================================================================
 * We ask i18n.js for the current state and re-render when it changes. Every
 * probe is defensive: this module must render correct copy even if i18n.js is
 * a stub. Tone changes VOICE only — every fact below is spelled identically at
 * all five levels.
 */

/** Try a list of candidate function names on the i18n namespace. */
function probe(names, ...args) {
  for (const name of names) {
    const fn = i18n && i18n[name];
    if (typeof fn === 'function') {
      try {
        const out = fn(...args);
        if (out !== undefined && out !== null) return out;
      } catch {
        /* A throwing i18n helper must not take the UI down. */
      }
    }
  }
  return undefined;
}

/** 'en' | 'yue' | 'bi' — normalised from whatever i18n or the DOM reports. */
function langMode() {
  const raw =
    probe(['getMode', 'getLanguageMode', 'getLanguage', 'getLang', 'mode', 'lang']) ??
    (typeof i18n?.mode === 'string' ? i18n.mode : undefined) ??
    document.documentElement.dataset.lang ??
    document.documentElement.dataset.language ??
    document.documentElement.dataset.mode ??
    'en';
  const value = String(raw).toLowerCase();
  if (/^(bi|both|bilingual|en-yue|dual)/.test(value)) return 'bi';
  if (/^(yue|zh|can|hk|cantonese|zh-hant|zh-hk)/.test(value)) return 'yue';
  return 'en';
}

/** 1..5 for one language. Defaults to 5, the site's maximum playful setting. */
function toneLevel(lang) {
  const raw =
    probe(['getFunny', 'getFunnyLevel', 'getTone', 'getToneLevel', 'getLevel'], lang) ??
    document.documentElement.dataset[lang === 'yue' ? 'funnyYue' : 'funnyEn'] ??
    document.documentElement.dataset[lang === 'yue' ? 'toneYue' : 'toneEn'];
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : 3;
}

/**
 * The strings this module owns.
 *
 * A value is either a plain string (identical at every level) or
 * `{ en: [l1..l5], yue: [l1..l5] }`. Short arrays are clamped to their last
 * entry, so a string that only has two registers does not need five copies.
 *
 * `{n}` / `{q}` / `{name}` placeholders are substituted verbatim — they carry
 * facts and are never rephrased by the tone level.
 */
export const UI_STRINGS = {
  /* --- Notification centre ------------------------------------------------ */
  'ui.notifications.title': {
    en: [
      'Notifications',
      'Notifications',
      'Notification centre',
      'Notification centre — the receipts',
      'Notification centre: every beep, kept for the record',
    ],
    yue: [
      '通知',
      '通知',
      '通知中心',
      '通知中心 — 一單都走唔甩',
      '通知中心：叫過你嘅嘢一單都冇漏，全部喺呢度等緊你',
    ],
  },
  'ui.notifications.empty': {
    en: [
      'No notifications.',
      'No notifications yet.',
      'Nothing here yet.',
      'Nothing here yet. Enjoy the quiet.',
      'Empty — quiet as a teahouse before the trolleys come out.',
    ],
    yue: [
      '暫時冇通知。',
      '暫時冇通知。',
      '呢度暫時乜都冇。',
      '呢度暫時乜都冇，得閒飲杯茶先啦。',
      '吉㗎，靜到好似啲點心車都未推出嚟嘅茶樓咁。',
    ],
  },
  'ui.notifications.unread': {
    en: ['{n} unread', '{n} unread', '{n} unread', '{n} still unread', '{n} still waiting for you'],
    yue: ['{n} 個未讀', '{n} 個未讀', '{n} 個未讀', '仲有 {n} 個未睇', '仲有 {n} 個喺度等緊你睇喎'],
  },
  'ui.notifications.markAllRead': {
    en: ['Mark all read', 'Mark all read', 'Mark all read', 'Mark them all read', 'Call them all read'],
    yue: ['全部標記為已讀', '全部標記為已讀', '全部當睇咗', '全部當睇咗佢', '一鋪過當睇晒佢'],
  },
  'ui.notifications.clear': {
    en: ['Clear all', 'Clear all', 'Clear all', 'Clear the lot', 'Clear the lot'],
    yue: ['清除全部', '清除全部', '全部清走', '全部清走佢', '一鋪清袋'],
  },
  'ui.notifications.cleared': {
    en: [
      'Notification history cleared.',
      'Notification history cleared.',
      'Notification history cleared.',
      'History cleared. Clean slate.',
      'History cleared — table wiped down, next round please.',
    ],
    yue: [
      '通知記錄已清除。',
      '通知記錄已清除。',
      '通知記錄清走晒喇。',
      '記錄清走晒喇，乾乾淨淨。',
      '記錄清走晒喇，抹乾淨張枱，落單過。',
    ],
  },
  'ui.notifications.close': { en: 'Close notifications', yue: '閂咗通知' },
  'ui.notifications.open': { en: 'Notifications', yue: '通知' },

  /* --- Command palette ---------------------------------------------------- */
  'ui.palette.title': {
    en: ['Command palette', 'Command palette', 'Command palette', 'Command palette', 'Command palette'],
    yue: ['指令面板', '指令面板', '指令面板', '指令面板', '指令面板'],
  },
  'ui.palette.placeholder': {
    en: [
      'Search commands, settings and pages',
      'Search commands, settings and pages',
      'Search commands, settings and pages',
      'Type anything — commands, settings, pages',
      'Type anything at all — commands, settings, pages, it will find it',
    ],
    yue: [
      '搜尋指令、設定同頁面',
      '搜尋指令、設定同頁面',
      '搵指令、設定同頁面',
      '求其打幾個字 — 指令、設定、頁面都搵到',
      '求其打幾個字啦 — 指令、設定、頁面，梗係幫你搵到嘅',
    ],
  },
  'ui.palette.empty': {
    en: [
      'No matches for "{q}".',
      'No matches for "{q}".',
      'Nothing matches "{q}".',
      'Nothing matches "{q}". Try fewer letters?',
      'Nothing matches "{q}" — maybe try fewer letters, or a different dish entirely.',
    ],
    yue: [
      '搵唔到「{q}」。',
      '搵唔到「{q}」。',
      '搵唔到「{q}」喎。',
      '搵唔到「{q}」喎，不如打少幾個字再試下？',
      '搵唔到「{q}」喎，不如打少幾個字，或者索性轉個字試下啦。',
    ],
  },
  'ui.palette.hint': {
    en: '↑ ↓ to move · Enter to choose · Esc to close',
    yue: '↑ ↓ 揀 · Enter 撳落去 · Esc 收工',
  },
  'ui.palette.sizeCard': { en: 'Card', yue: '卡片' },
  'ui.palette.sizeFull': { en: 'Full window', yue: '全視窗' },
  'ui.palette.sizeLabel': { en: 'Palette size', yue: '面板大細' },
  'ui.palette.toFull': { en: 'Expand to full window', yue: '放大做全視窗' },
  'ui.palette.toCard': { en: 'Shrink to card', yue: '縮返做卡片' },
  'ui.palette.editHint': { en: 'Press Enter to change', yue: '撳 Enter 改' },
  'ui.palette.section.commands': { en: 'Commands', yue: '指令' },
  'ui.palette.section.settings': { en: 'Settings', yue: '設定' },
  'ui.palette.section.pages': { en: 'Pages', yue: '頁面' },
  'ui.palette.open': { en: 'Open command palette', yue: '打開指令面板' },
  'ui.palette.results': { en: '{n} results', yue: '{n} 個結果' },
  'ui.palette.regex': { en: 'Use a regular expression', yue: '用正規表達式' },
  'ui.palette.builder': { en: 'Open the pattern builder', yue: '打開 pattern 產生器' },

  /* --- Toast chrome ------------------------------------------------------- */
  'ui.toast.dismiss': { en: 'Dismiss', yue: '閂咗佢' },
  'ui.toast.region': { en: 'Notifications', yue: '通知' },

  /* --- Dim sum surprise ---------------------------------------------------
   * The DISH NAME and the catalogue's own alt text are facts and never change.
   * Only these two framing strings take a register. */
  'ui.dimsum.title': {
    en: [
      'Dim sum',
      'A dim sum surprise',
      'A dim sum surprise',
      'Surprise — the trolley stopped at your table',
      'Surprise! The trolley stopped at your table and it is not moving on',
    ],
    yue: [
      '點心',
      '點心一則',
      '點心突襲',
      '嘩，點心車停咗喺你張枱前面喎',
      '嘩！點心車停咗喺你張枱前面，仲唔郁添',
    ],
  },
  'ui.dimsum.note': {
    en: [
      'Shown at random on one page load in ten.',
      'Shown at random on one page load in ten.',
      'One page load in ten gets a dish. This was yours.',
      'One load in ten gets a dish and this one was yours. There is no off switch.',
      'One load in ten gets a dish and today the draw came up yours. There is no off switch, so pour the tea and settle in.',
    ],
    yue: [
      '每十次載入隨機出現一次。',
      '每十次載入隨機出現一次。',
      '十次入面有一次會有碟嘢食，今次畀你抽中咗。',
      '十次入面有一次會有碟嘢食，今次畀你抽中咗喇，而且冇得閂㗎。',
      '十次入面有一次會有碟嘢食，今次畀你抽中咗喇。冇得閂㗎，斟啖茶坐低慢慢嘆啦。',
    ],
  },
};

/** Pull the register-appropriate variant out of a catalogue value. */
function pick(value, lang) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  const branch = value[lang] ?? value.en ?? value.yue ?? '';
  if (typeof branch === 'string') return branch;
  if (!Array.isArray(branch) || branch.length === 0) return '';
  const level = toneLevel(lang);
  return branch[Math.min(level - 1, branch.length - 1)];
}

function fill(text, vars) {
  if (!vars) return text;
  return String(text).replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match,
  );
}

/**
 * Resolve a string spec into `{ primary, secondary }`.
 *
 * A spec is a catalogue key, a plain string, `{ en, yue }`, or `{ key, vars }`.
 * In bilingual mode `secondary` carries the Cantonese; otherwise it is null and
 * the caller renders one line.
 */
function resolve(spec, vars) {
  if (spec === null || spec === undefined || spec === '') return { primary: '', secondary: null };

  let source = spec;
  let localVars = vars;
  if (typeof spec === 'object' && !Array.isArray(spec) && typeof spec.key === 'string') {
    localVars = { ...(spec.vars || {}), ...(vars || {}) };
    source = UI_STRINGS[spec.key] ?? spec.key;
  } else if (typeof spec === 'string' && Object.prototype.hasOwnProperty.call(UI_STRINGS, spec)) {
    source = UI_STRINGS[spec];
  }

  const mode = langMode();
  if (mode === 'bi') {
    const en = fill(pick(source, 'en'), localVars);
    const yue = fill(pick(source, 'yue'), localVars);
    return { primary: en, secondary: yue && yue !== en ? yue : null };
  }
  return { primary: fill(pick(source, mode), localVars), secondary: null };
}

/** One-line form, for aria-labels, titles and anywhere two lines will not fit. */
function text(spec, vars) {
  const { primary, secondary } = resolve(spec, vars);
  return secondary ? `${primary} · ${secondary}` : primary;
}

/**
 * Render a spec into an element, adding a compact secondary line in bilingual
 * mode. Bilingual must not crowd the interface: the primary label keeps full
 * prominence and the second language is rendered smaller and dimmer beneath.
 */
function line(spec, { tag = 'p', class: cls = '', vars } = {}) {
  const { primary, secondary } = resolve(spec, vars);
  const frag = document.createDocumentFragment();
  if (primary) frag.append(el(tag, { class: cls, text: primary }));
  if (secondary) frag.append(el(tag, { class: `${cls} md-ui-alt`.trim(), text: secondary, lang: 'yue-Hant-HK' }));
  return frag;
}

/* Publish our catalogue to i18n so the site-wide search can index it, if
 * i18n.js offers any way to accept extra strings. Entirely optional. */
(function registerCatalogue() {
  for (const name of ['register', 'addStrings', 'extend', 'defineStrings', 'merge']) {
    if (typeof i18n?.[name] === 'function') {
      try {
        i18n[name](UI_STRINGS);
        return;
      } catch {
        /* Not our contract to enforce. */
      }
    }
  }
})();

/* Re-render open surfaces when language or tone changes. Subscribe through
 * whichever channel i18n offers, and always also listen on the DOM bus. */
const languageListeners = new Set();
function onLanguageChange(fn) {
  languageListeners.add(fn);
}
function announceLanguageChange() {
  for (const fn of languageListeners) {
    try {
      fn();
    } catch {
      /* One broken listener must not stop the others. */
    }
  }
}
/* Subscribe through whichever channel i18n offers. The calling convention
 * differs between plausible shapes, so try the one each name implies rather
 * than guessing: `subscribe(fn)` and `onChange(fn)` take a bare callback,
 * `addEventListener('change', fn)` and `on('change', fn)` take an event name.
 * Stop at the first success so a re-render is not queued twice. The DOM bus
 * below is the guaranteed channel regardless. */
const SUBSCRIBE_SHAPES = [
  ['subscribe', (fn) => [fn]],
  ['onChange', (fn) => [fn]],
  ['on', (fn) => ['change', fn]],
  ['addEventListener', (fn) => ['change', fn]],
];
for (const [name, args] of SUBSCRIBE_SHAPES) {
  if (typeof i18n?.[name] !== 'function') continue;
  try {
    i18n[name](...args(announceLanguageChange));
    break;
  } catch {
    /* Try the next shape; the DOM bus still covers us. */
  }
}
for (const evt of ['md:lang-change', 'md:language-change', 'md:i18n-change', 'md:appearance-change']) {
  document.addEventListener(evt, announceLanguageChange);
}

/* ==========================================================================
 * 2. Stylesheet
 * ==========================================================================
 * Built only on M3 tokens, with the mockup's literal values as var() fallbacks
 * so this still renders correctly if tokens.css has not loaded. Injected at the
 * top of <head> so app.css wins any conflict without needing !important.
 */

const STYLES = `
.md-ui-icon { display:inline-flex; align-items:center; justify-content:center; flex:none; }
/* The bilingual secondary line. display:block regardless of the tag used:
   rendered as a span it would otherwise flow into the primary label and read
   as one run-on string ("Notification centre通知中心"). */
.md-ui-alt { display:block; opacity:.72; font-size:.86em; margin-top:2px; font-weight:400; }
.md-ui-sr {
  position:absolute; width:1px; height:1px; margin:-1px; padding:0;
  overflow:hidden; clip:rect(0 0 0 0); clip-path:inset(50%); white-space:nowrap; border:0;
}

/* --- Toast stack --------------------------------------------------------- */
.md-toast-stack {
  position:fixed; z-index:9100;
  left:max(24px, env(safe-area-inset-left)); bottom:max(24px, env(safe-area-inset-bottom));
  display:flex; flex-direction:column; gap:12px;
  width:min(400px, calc(100vw - 48px));
  pointer-events:none;
}
.md-toast {
  pointer-events:auto; position:relative; overflow:hidden;
  display:grid; grid-template-columns:auto 1fr auto; gap:12px; align-items:start;
  padding:14px 12px 14px 16px;
  border-radius:var(--md-sys-shape-corner-l, 16px);
  background:var(--md-sys-color-inverse-surface, #382E2B);
  color:var(--md-sys-color-inverse-on-surface, #FFEDE8);
  box-shadow:0 6px 20px rgba(0,0,0,.28);
  animation:md-toast-in 300ms var(--md-sys-motion-emphasized-decel, cubic-bezier(.05,.7,.1,1)) both;
}
.md-toast[data-leaving="true"] {
  animation:md-toast-out 180ms var(--md-sys-motion-emphasized, cubic-bezier(.2,0,0,1)) both;
}
/* Success, warning and error carry meaning, so they leave the inverse surface
   and take a role colour the theme guarantees contrast for. */
.md-toast[data-kind="success"] { background:var(--md-sys-color-success-container, #B8F0C8); color:var(--md-sys-color-on-surface, #221A17); }
.md-toast[data-kind="warning"] { background:var(--md-sys-color-tertiary-container, #F5E0A7); color:var(--md-sys-color-on-tertiary-container, #231B00); }
.md-toast[data-kind="error"]   { background:var(--md-sys-color-error-container, #FFDAD6); color:var(--md-sys-color-on-error-container, #410002); }
.md-toast[data-kind="dimsum"]  { background:var(--md-sys-color-surface-container-high, #F6E4DE); color:var(--md-sys-color-on-surface, #221A17); grid-template-columns:1fr auto; }
.md-toast__icon { margin-top:1px; opacity:.9; }
.md-toast__text { min-width:0; }
.md-toast__title { margin:0; font-size:14px; font-weight:600; line-height:1.4; }
.md-toast__body  { margin:4px 0 0; font-size:13px; line-height:1.5; opacity:.92; }
.md-toast__actions { display:flex; gap:4px; align-items:center; align-self:center; }
.md-toast__action {
  font:inherit; font-size:13px; font-weight:600; cursor:pointer;
  padding:8px 12px; border:0; border-radius:var(--md-sys-shape-corner-full, 9999px);
  background:transparent; color:var(--md-sys-color-inverse-primary, #FFB59B);
  transition:background 200ms var(--md-sys-motion-emphasized, cubic-bezier(.2,0,0,1));
}
.md-toast[data-kind="success"] .md-toast__action,
.md-toast[data-kind="warning"] .md-toast__action,
.md-toast[data-kind="error"] .md-toast__action,
.md-toast[data-kind="dimsum"] .md-toast__action { color:var(--md-sys-color-primary, #8F4C34); }
.md-toast__action:hover { background:rgba(255,255,255,.12); }
.md-toast[data-kind="success"] .md-toast__action:hover,
.md-toast[data-kind="warning"] .md-toast__action:hover,
.md-toast[data-kind="error"] .md-toast__action:hover,
.md-toast[data-kind="dimsum"] .md-toast__action:hover { background:var(--ripple, rgba(0,0,0,.08)); }
.md-toast__close {
  flex:none; width:40px; height:40px; display:grid; place-items:center; cursor:pointer;
  border:0; border-radius:var(--md-sys-shape-corner-full, 9999px);
  background:transparent; color:inherit; opacity:.8;
  transition:background 200ms var(--md-sys-motion-emphasized, cubic-bezier(.2,0,0,1));
}
.md-toast__close:hover { opacity:1; background:rgba(255,255,255,.12); }
.md-toast[data-kind="success"] .md-toast__close:hover,
.md-toast[data-kind="warning"] .md-toast__close:hover,
.md-toast[data-kind="error"] .md-toast__close:hover,
.md-toast[data-kind="dimsum"] .md-toast__close:hover { background:var(--ripple, rgba(0,0,0,.08)); }
.md-toast__timer {
  position:absolute; left:0; right:0; bottom:0; height:2px; transform-origin:left center;
  background:currentColor; opacity:.35;
  animation-name:md-toast-timer; animation-timing-function:linear; animation-fill-mode:forwards;
}
.md-toast__timer[data-indeterminate="true"] {
  animation-name:md-toast-indeterminate; animation-duration:1.6s; animation-iteration-count:infinite;
  width:40%;
}
.md-toast__figure { margin:0; grid-column:1 / -1; }
.md-toast__figure img {
  display:block; width:100%; height:150px; object-fit:cover;
  border-radius:var(--md-sys-shape-corner-m, 12px);
  background:var(--md-sys-color-surface-container-highest, #F1DED8);
}
.md-toast__names { margin:8px 0 2px; }
.md-toast__dish { margin:0; font-size:15px; font-weight:600; line-height:1.35; }
.md-toast__dish-zh { margin:1px 0 0; font-size:14px; font-weight:600; line-height:1.35; }
.md-toast__dish-rom { margin:2px 0 0; font-size:11px; letter-spacing:.02em; opacity:.7;
  font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

@keyframes md-toast-in  { from { opacity:0; transform:translateY(14px) scale(.985); } to { opacity:1; transform:none; } }
@keyframes md-toast-out { to { opacity:0; transform:translateY(6px) scale(.98); } }
@keyframes md-toast-timer { from { transform:scaleX(1); } to { transform:scaleX(0); } }
@keyframes md-toast-indeterminate { from { transform:translateX(-100%); } to { transform:translateX(280%); } }

/* --- Notification centre ------------------------------------------------- */
.md-notif {
  position:fixed; z-index:9000; top:0; right:0; bottom:0;
  width:min(400px, 100vw);
  display:flex; flex-direction:column;
  background:var(--md-sys-color-surface-container-low, #FFF1EC);
  color:var(--md-sys-color-on-surface, #221A17);
  border-left:1px solid var(--md-sys-color-outline-variant, #D8C2BB);
  box-shadow:-12px 0 32px rgba(0,0,0,.22);
  animation:md-notif-in 320ms var(--md-sys-motion-emphasized-decel, cubic-bezier(.05,.7,.1,1)) both;
}
@keyframes md-notif-in { from { opacity:0; transform:translateX(24px); } to { opacity:1; transform:none; } }
.md-notif__head {
  display:flex; align-items:center; gap:12px;
  padding:16px 8px 16px 20px; border-bottom:1px solid var(--md-sys-color-outline-variant, #D8C2BB);
}
.md-notif__title { margin:0; font-size:18px; font-weight:600; line-height:1.3; flex:1; min-width:0; }
.md-notif__count {
  font-size:11px; font-weight:600; padding:3px 9px;
  border-radius:var(--md-sys-shape-corner-full, 9999px);
  background:var(--md-sys-color-secondary-container, #FFDBCF);
  color:var(--md-sys-color-on-secondary-container, #2C160D);
  white-space:nowrap;
}
.md-notif__tools { display:flex; gap:6px; padding:10px 12px; border-bottom:1px solid var(--md-sys-color-outline-variant, #D8C2BB); flex-wrap:wrap; }
.md-notif__list { flex:1; min-height:0; overflow-y:auto; overflow-x:hidden; padding:8px; margin:0; list-style:none; }
.md-notif__item {
  display:grid; grid-template-columns:auto 1fr; gap:12px; padding:12px;
  border-radius:var(--md-sys-shape-corner-m, 12px);
}
.md-notif__item + .md-notif__item { margin-top:4px; }
.md-notif__item[data-read="false"] { background:var(--md-sys-color-surface-container-high, #F6E4DE); }
.md-notif__item-title { margin:0; font-size:14px; font-weight:600; line-height:1.4; }
.md-notif__item-body  { margin:3px 0 0; font-size:13px; line-height:1.5; color:var(--md-sys-color-on-surface-variant, #53433E); }
.md-notif__time { display:block; margin-top:6px; font-size:11px; color:var(--md-sys-color-on-surface-variant, #53433E); }
.md-notif__empty { padding:40px 24px; text-align:center; color:var(--md-sys-color-on-surface-variant, #53433E); font-size:14px; }
.md-notif__empty p { margin:0; }

/* --- Command palette ----------------------------------------------------- */
.md-palette-scrim {
  position:fixed; inset:0; z-index:9200;
  display:flex; justify-content:center;
  background:var(--md-sys-color-scrim, rgba(0,0,0,.32));
  padding:96px 24px 24px;
  animation:md-fade-in 160ms linear both;
}
.md-palette-scrim[data-mode="full"] { padding:0; }
@keyframes md-fade-in { from { opacity:0; } to { opacity:1; } }
.md-palette {
  display:flex; flex-direction:column; width:100%; min-width:0; max-width:720px; max-height:70vh;
  border-radius:var(--md-sys-shape-corner-xl, 28px);
  background:var(--md-sys-color-surface-container-high, #F6E4DE);
  color:var(--md-sys-color-on-surface, #221A17);
  box-shadow:0 24px 64px rgba(0,0,0,.4); overflow:hidden;
  animation:md-toast-in 260ms var(--md-sys-motion-emphasized-decel, cubic-bezier(.05,.7,.1,1)) both;
}
.md-palette-scrim[data-mode="full"] .md-palette { max-width:none; max-height:none; height:100%; border-radius:0; }
.md-palette__search { display:flex; align-items:center; gap:12px; padding:6px 8px 6px 20px; border-bottom:1px solid var(--md-sys-color-outline-variant, #D8C2BB); }
.md-palette__input {
  flex:1; min-width:0; height:56px; border:0; background:transparent; outline:none;
  font:inherit; font-size:17px; color:inherit;
}
.md-palette__input::placeholder { color:var(--md-sys-color-on-surface-variant, #53433E); opacity:1; }
.md-palette__list { flex:1; min-height:0; overflow-y:auto; overflow-x:hidden; padding:8px; margin:0; list-style:none; }
.md-palette__group { padding:12px 12px 6px; font-size:11px; font-weight:700; letter-spacing:.08em;
  text-transform:uppercase; color:var(--md-sys-color-on-surface-variant, #53433E); }
/* minmax(0,1fr) rather than a bare 1fr: a bare 1fr track refuses to shrink
   below its min-content width, which pushed the whole card past a narrow
   viewport and clipped the inline controls off the right edge. */
.md-palette__row {
  display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:12px; align-items:center;
  padding:10px 12px; border-radius:var(--md-sys-shape-corner-m, 12px); cursor:pointer;
  transition:background 160ms var(--md-sys-motion-emphasized, cubic-bezier(.2,0,0,1));
}
.md-palette__row[aria-selected="true"] { background:var(--md-sys-color-secondary-container, #FFDBCF); color:var(--md-sys-color-on-secondary-container, #2C160D); }
.md-palette__row:hover { background:var(--ripple, rgba(0,0,0,.08)); }
.md-palette__row[aria-selected="true"]:hover { background:var(--md-sys-color-secondary-container, #FFDBCF); }
.md-palette__labelwrap { min-width:0; }
.md-palette__label { margin:0; font-size:14px; font-weight:500; line-height:1.4;
  min-width:0; overflow-wrap:anywhere; }
.md-palette__hint { font-size:11px; opacity:.7; white-space:nowrap;
  font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.md-palette__control { display:flex; align-items:center; justify-content:flex-end; gap:8px; min-width:0; }
.md-palette__foot {
  display:flex; align-items:center; justify-content:space-between; gap:12px;
  padding:10px 20px; border-top:1px solid var(--md-sys-color-outline-variant, #D8C2BB);
  font-size:11px; color:var(--md-sys-color-on-surface-variant, #53433E);
}
.md-palette__empty { padding:40px 24px; text-align:center; color:var(--md-sys-color-on-surface-variant, #53433E); font-size:14px; }
.md-palette__empty p { margin:0; }

/* --- Shared small controls ----------------------------------------------- */
.md-ui-btn {
  display:inline-flex; align-items:center; gap:8px; cursor:pointer;
  font:inherit; font-size:13px; font-weight:600; padding:0 14px; height:36px;
  border:1px solid var(--md-sys-color-outline, #85736D);
  border-radius:var(--md-sys-shape-corner-full, 9999px);
  background:transparent; color:var(--md-sys-color-on-surface, #221A17);
  transition:background 200ms var(--md-sys-motion-emphasized, cubic-bezier(.2,0,0,1));
}
.md-ui-btn:hover { background:var(--ripple, rgba(0,0,0,.08)); }
.md-ui-iconbtn {
  display:inline-grid; place-items:center; width:40px; height:40px; flex:none; cursor:pointer;
  border:0; border-radius:var(--md-sys-shape-corner-full, 9999px);
  background:transparent; color:inherit;
  transition:background 200ms var(--md-sys-motion-emphasized, cubic-bezier(.2,0,0,1));
}
.md-ui-iconbtn:hover { background:var(--ripple, rgba(0,0,0,.08)); }
.md-switch { width:52px; height:32px; flex:none; padding:0; cursor:pointer; border:0; background:transparent; }
.md-switch__track {
  display:block; width:52px; height:32px; border-radius:var(--md-sys-shape-corner-full, 9999px);
  background:var(--md-sys-color-surface-container-highest, #F1DED8);
  border:2px solid var(--md-sys-color-outline, #85736D);
  position:relative;
  transition:background 200ms var(--md-sys-motion-emphasized, cubic-bezier(.2,0,0,1)), border-color 200ms;
}
.md-switch__thumb {
  position:absolute; top:50%; left:6px; width:16px; height:16px; margin-top:-8px;
  border-radius:var(--md-sys-shape-corner-full, 9999px);
  background:var(--md-sys-color-outline, #85736D);
  transition:transform 250ms var(--md-sys-motion-spring, cubic-bezier(.2,0,0,1)), width 200ms, height 200ms, margin 200ms, background 200ms;
}
.md-switch[aria-checked="true"] .md-switch__track { background:var(--md-sys-color-primary, #8F4C34); border-color:var(--md-sys-color-primary, #8F4C34); }
.md-switch[aria-checked="true"] .md-switch__thumb {
  width:24px; height:24px; margin-top:-12px; transform:translateX(18px);
  background:var(--md-sys-color-on-primary, #FFFFFF);
}
.md-ui-range { width:min(132px, 34vw); min-width:72px; accent-color:var(--md-sys-color-primary, #8F4C34); height:24px; }
.md-ui-select, .md-ui-text {
  font:inherit; font-size:13px; height:36px; min-width:0; max-width:min(180px, 46vw); padding:0 10px;
  border:1px solid var(--md-sys-color-outline, #85736D);
  border-radius:var(--md-sys-shape-corner-s, 8px);
  background:var(--md-sys-color-surface-container-lowest, #FFFFFF);
  color:var(--md-sys-color-on-surface, #221A17);
}
.md-ui-color { width:44px; height:32px; padding:2px; border:1px solid var(--md-sys-color-outline, #85736D);
  border-radius:var(--md-sys-shape-corner-s, 8px); background:transparent; cursor:pointer; }
.md-ui-value { font-size:12px; min-width:44px; text-align:right; opacity:.8;
  font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

/* Focus is never removed, only restyled — every surface here is keyboard-first. */
.md-toast :focus-visible, .md-notif :focus-visible, .md-palette :focus-visible, .md-palette__row:focus-visible {
  outline:3px solid var(--md-sys-color-primary, #8F4C34); outline-offset:2px;
}

/* The brief "here it is" pulse after the palette navigates somewhere. */
.md-ui-flash { animation:md-ui-flash 1600ms var(--md-sys-motion-emphasized, cubic-bezier(.2,0,0,1)) both;
  border-radius:var(--md-sys-shape-corner-s, 8px); }
@keyframes md-ui-flash {
  0%   { box-shadow:0 0 0 0 var(--md-sys-color-primary, #8F4C34); }
  12%  { box-shadow:0 0 0 4px var(--md-sys-color-primary, #8F4C34); }
  100% { box-shadow:0 0 0 0 rgba(0,0,0,0); }
}

@media (max-width: 520px) {
  .md-toast-stack { left:12px; right:12px; width:auto; bottom:12px; }
  .md-notif { width:100vw; }
  .md-palette-scrim { padding:16px; }
  .md-palette { max-height:82vh; }
  /* Below this width a label and its control cannot share a line without one of
     them being squeezed to nothing, so the control drops to its own row and
     right-aligns under the label. Nothing is hidden and nothing is clipped. */
  .md-palette__row { grid-template-columns:auto minmax(0,1fr); row-gap:8px; }
  .md-palette__control { grid-column:1 / -1; }
  .md-ui-select, .md-ui-text { max-width:100%; }
  .md-ui-range { width:min(160px, 50vw); }
}

@media (prefers-reduced-motion: reduce) {
  /* The toast timer bar is excluded on purpose: it is a functional countdown
     whose animationend event is what dismisses the toast. It is a 2px line, not
     motion anyone asked to be spared. */
  .md-toast, .md-notif, .md-palette, .md-palette-scrim, .md-ui-flash,
  .md-switch__thumb, .md-switch__track, .md-palette__row {
    animation-duration:1ms !important; transition-duration:1ms !important;
  }
}
`;

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected || document.getElementById('md-ui-styles')) return;
  const style = el('style', { id: 'md-ui-styles', text: STYLES });
  // First child of <head> so anything the site author writes later wins.
  document.head.insertBefore(style, document.head.firstChild);
  stylesInjected = true;
}

/* ==========================================================================
 * 3. Notification records
 * ==========================================================================
 * Every toast is also a record. Records hold BOTH languages so switching the
 * language mode re-renders old records correctly rather than freezing them in
 * whatever language happened to be active when they were raised.
 */

let records = normaliseRecords(store.get('records', []));

function normaliseRecords(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r) => r && typeof r === 'object' && typeof r.at === 'string')
    .slice(0, MAX_RECORDS);
}

function persistRecords() {
  store.set('records', records.slice(0, MAX_RECORDS));
}

/** Freeze a string spec into a language-stable `{en, yue}` pair. */
function freezeSpec(spec, vars) {
  if (spec === null || spec === undefined || spec === '') return null;
  let source = spec;
  let localVars = vars;
  if (typeof spec === 'object' && !Array.isArray(spec) && typeof spec.key === 'string') {
    localVars = { ...(spec.vars || {}), ...(vars || {}) };
    source = UI_STRINGS[spec.key] ?? spec.key;
  } else if (typeof spec === 'string' && Object.prototype.hasOwnProperty.call(UI_STRINGS, spec)) {
    source = UI_STRINGS[spec];
  }
  return { en: fill(pick(source, 'en'), localVars), yue: fill(pick(source, 'yue'), localVars) };
}

function addRecord(spec) {
  const record = {
    id: spec.id || nextId('notif'),
    kind: spec.kind || 'info',
    at: new Date().toISOString(),
    read: false,
    title: freezeSpec(spec.title),
    body: freezeSpec(spec.body),
  };
  records.unshift(record);
  if (records.length > MAX_RECORDS) records.length = MAX_RECORDS;
  persistRecords();
  syncBadges();
  if (notifPanel) renderNotifList();
  document.dispatchEvent(new CustomEvent('md:notify', { detail: { record } }));
  return record;
}

function unreadCount() {
  return records.reduce((n, r) => n + (r.read ? 0 : 1), 0);
}

/** Keep every `[data-md-notification-count]` badge in the page truthful. */
function syncBadges() {
  const n = unreadCount();
  for (const node of document.querySelectorAll('[data-md-notification-count]')) {
    node.textContent = n > 99 ? '99+' : String(n);
    node.hidden = n === 0;
  }
  for (const node of document.querySelectorAll('[data-md-notifications-toggle]')) {
    node.setAttribute(
      'aria-label',
      n === 0 ? text('ui.notifications.open') : `${text('ui.notifications.open')} — ${text('ui.notifications.unread', { n })}`,
    );
  }
}

/** Relative time, in the active language. The absolute time rides along in `title`. */
function relativeTime(iso) {
  const mode = langMode();
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  const zh = mode === 'yue';
  const both = mode === 'bi';
  const en =
    secs < 45 ? 'just now'
      : secs < 5400 ? `${Math.round(secs / 60)} min ago`
        : secs < 86400 ? `${Math.round(secs / 3600)} h ago`
          : `${Math.round(secs / 86400)} d ago`;
  const yue =
    secs < 45 ? '啱啱'
      : secs < 5400 ? `${Math.round(secs / 60)} 分鐘前`
        : secs < 86400 ? `${Math.round(secs / 3600)} 個鐘前`
          : `${Math.round(secs / 86400)} 日前`;
  if (both) return `${en} · ${yue}`;
  return zh ? yue : en;
}

/* ==========================================================================
 * 4. Toasts
 * ========================================================================== */

let toastStack = null;

function ensureStack() {
  if (toastStack && toastStack.isConnected) return toastStack;
  injectStyles();
  toastStack = el('div', {
    class: 'md-toast-stack',
    id: 'md-toast-stack',
    role: 'region',
    'aria-label': text('ui.toast.region'),
    // Politely announced: additions only, so dismissals are silent and an
    // error is no more shouty than a success. Never assertive.
    'aria-live': 'polite',
    'aria-relevant': 'additions',
  });
  document.body.append(toastStack);
  return toastStack;
}

const DEFAULT_TIMEOUTS = {
  info: 6000,
  success: 5000,
  progress: 0, // resolved by the caller
  warning: 0, // persists until dismissed — required by the standard
  error: 0, // persists until dismissed — required by the standard
  dimsum: 14000,
};

/**
 * Raise a non-blocking toast.
 *
 * @param {object} spec
 * @param {'info'|'success'|'warning'|'error'|'progress'|'dimsum'} [spec.kind]
 * @param {*} [spec.title]   catalogue key, string, {en,yue} or {key,vars}
 * @param {*} [spec.body]    same
 * @param {Array<{label:*, onClick?:Function, closes?:boolean, href?:string}>} [spec.actions]
 * @param {number} [spec.timeout]  ms; 0 means "until dismissed"
 * @param {boolean} [spec.record=true]  also write to the notification centre
 * @param {object} [spec.figure]  {src, alt, dish} — used by the dim sum surprise
 * @returns {{id:string, dismiss:Function, update:Function, setTimeout:Function, element:HTMLElement}}
 */
export function notify(spec = {}) {
  const kind = spec.kind || 'info';
  const stack = ensureStack();
  const id = spec.id || nextId('toast');
  const timeout = spec.timeout === undefined ? DEFAULT_TIMEOUTS[kind] ?? 6000 : spec.timeout;

  const node = el('div', {
    class: 'md-toast',
    id,
    role: 'group',
    dataset: { kind },
    'aria-label': text(spec.title) || kind,
  });

  const textWrap = el('div', { class: 'md-toast__text' });
  if (spec.title) textWrap.append(line(spec.title, { class: 'md-toast__title' }));
  // `extra` sits between the title and the body — the slot the dim sum dish
  // name uses, so the toast reads title → what it is → why you are seeing it.
  if (spec.extra) textWrap.append(spec.extra);
  if (spec.body) textWrap.append(line(spec.body, { class: 'md-toast__body' }));

  if (spec.figure) {
    // Dim sum layout: picture on top spanning the full width, text beneath.
    node.append(buildFigure(spec.figure), textWrap);
  } else {
    node.append(icon(kind === 'dimsum' ? 'dimsum' : kind), textWrap);
  }

  const actions = el('div', { class: 'md-toast__actions' });
  for (const action of spec.actions || []) {
    const btn = el('button', {
      type: 'button',
      class: 'md-toast__action',
      text: text(action.label),
      onClick: () => {
        try {
          action.onClick?.();
        } finally {
          if (action.closes !== false) handle.dismiss();
        }
      },
    });
    actions.append(btn);
  }
  const closeBtn = el('button', {
    type: 'button',
    class: 'md-toast__close',
    'aria-label': text('ui.toast.dismiss'),
    title: text('ui.toast.dismiss'),
    onClick: () => handle.dismiss(),
  });
  closeBtn.append(icon('close', 18));
  actions.append(closeBtn);
  node.append(actions);

  const bar = el('div', { class: 'md-toast__timer', 'aria-hidden': 'true' });
  node.append(bar);

  /* The countdown is the bar's own CSS animation, and `animationend` is what
   * dismisses the toast. That gets pause-on-hover and pause-on-focus for free:
   * pausing the animation pauses the dismissal, so a toast can never vanish
   * while it is being read or operated. */
  function startTimer(ms) {
    if (!ms || ms <= 0) {
      bar.style.display = 'none';
      bar.style.animationName = 'none';
      return;
    }
    bar.style.display = '';
    bar.removeAttribute('data-indeterminate');
    bar.style.animationName = 'md-toast-timer';
    bar.style.animationDuration = `${ms}ms`;
    bar.style.animationPlayState = 'running';
  }
  bar.addEventListener('animationend', (event) => {
    if (event.animationName === 'md-toast-timer') handle.dismiss();
  });

  const pause = () => {
    bar.style.animationPlayState = 'paused';
  };
  const resume = () => {
    if (bar.style.animationName && bar.style.animationName !== 'none') bar.style.animationPlayState = 'running';
  };
  node.addEventListener('pointerenter', pause);
  node.addEventListener('pointerleave', resume);
  node.addEventListener('focusin', pause);
  node.addEventListener('focusout', (event) => {
    if (!node.contains(event.relatedTarget)) resume();
  });
  // Escape dismisses the toast you are actually in, and nothing else.
  node.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      handle.dismiss();
    }
  });

  let dismissed = false;
  const handle = {
    id,
    element: node,
    dismiss() {
      if (dismissed) return;
      dismissed = true;
      node.dataset.leaving = 'true';
      const remove = () => node.remove();
      if (reducedMotion()) remove();
      else {
        node.addEventListener('animationend', remove, { once: true });
        window.setTimeout(remove, 400); // belt and braces if the event is missed
      }
    },
    /** Restyle a live toast — used by progress toasts as they resolve. */
    update(patch = {}) {
      if (patch.kind) {
        node.dataset.kind = patch.kind;
        const iconNode = node.querySelector(':scope > .md-ui-icon');
        if (iconNode) iconNode.replaceWith(icon(patch.kind));
      }
      if ('title' in patch || 'body' in patch) {
        textWrap.replaceChildren();
        if (patch.title) textWrap.append(line(patch.title, { class: 'md-toast__title' }));
        if (patch.body) textWrap.append(line(patch.body, { class: 'md-toast__body' }));
        node.setAttribute('aria-label', text(patch.title) || node.dataset.kind);
      }
      if ('timeout' in patch) startTimer(patch.timeout);
      return handle;
    },
    setTimeout: startTimer,
  };

  stack.append(node);

  if (kind === 'progress' && !timeout) {
    bar.dataset.indeterminate = 'true';
    bar.style.animationName = 'md-toast-indeterminate';
  } else {
    startTimer(timeout);
  }

  if (spec.record !== false) addRecord({ ...spec, id, kind });

  return handle;
}

/** Alias — `toast()` reads better at call sites that are clearly not errors. */
export const toast = notify;

function buildFigure(figure) {
  const fig = el('figure', { class: 'md-toast__figure' });
  const img = el('img', {
    src: figure.src,
    alt: figure.alt || '',
    // Never on the critical path: decoded off-thread, and the layout reserves
    // its box up front so nothing reflows when it lands.
    decoding: 'async',
    loading: 'eager',
    width: figure.width || 400,
    height: figure.height || 150,
  });
  fig.append(img);
  if (figure.onSettle) {
    img.addEventListener('load', figure.onSettle, { once: true });
    img.addEventListener('error', figure.onSettle, { once: true });
  }
  if (figure.onError) img.addEventListener('error', figure.onError, { once: true });
  return fig;
}

/* ==========================================================================
 * 5. Notification centre
 * ==========================================================================
 * Non-modal by design: it informs, so it must not gate the page. It closes on
 * Escape and on a click outside, and hands focus back where it came from.
 */

let notifPanel = null;
let notifOpener = null;
let notifListNode = null;

function renderNotifList() {
  if (!notifListNode) return;
  notifListNode.replaceChildren();

  if (records.length === 0) {
    const empty = el('div', { class: 'md-notif__empty' });
    empty.append(line('ui.notifications.empty'));
    notifListNode.append(empty);
    return;
  }

  const mode = langMode();
  for (const record of records) {
    const item = el('li', { class: 'md-notif__item', dataset: { read: String(!!record.read) } });
    item.append(icon(record.kind === 'dimsum' ? 'dimsum' : record.kind || 'info'));

    const body = el('div', { class: 'md-notif__body' });
    if (record.title) body.append(recordLine(record.title, 'md-notif__item-title', mode));
    if (record.body) body.append(recordLine(record.body, 'md-notif__item-body', mode));

    const stamp = el('time', {
      class: 'md-notif__time',
      datetime: record.at,
      // The exact instant is always available, whatever the relative wording says.
      title: new Date(record.at).toLocaleString(),
      text: relativeTime(record.at),
    });
    body.append(stamp);
    item.append(body);
    notifListNode.append(item);
  }
}

/** Records store both languages, so rendering one is not the same as `line()`. */
function recordLine(pair, cls, mode) {
  const frag = document.createDocumentFragment();
  if (mode === 'bi') {
    if (pair.en) frag.append(el('p', { class: cls, text: pair.en }));
    if (pair.yue && pair.yue !== pair.en) {
      frag.append(el('p', { class: `${cls} md-ui-alt`, text: pair.yue, lang: 'yue-Hant-HK' }));
    }
  } else {
    const value = mode === 'yue' ? pair.yue || pair.en : pair.en || pair.yue;
    if (value) frag.append(el('p', { class: cls, text: value, lang: mode === 'yue' ? 'yue-Hant-HK' : null }));
  }
  return frag;
}

function openNotifications(opener) {
  if (notifPanel) return;
  injectStyles();
  notifOpener = opener || document.activeElement;

  notifPanel = el('aside', {
    class: 'md-notif',
    role: 'dialog',
    // Explicitly NOT modal: this only informs, so it never traps the page.
    'aria-modal': 'false',
    'aria-label': text('ui.notifications.title'),
  });

  const head = el('div', { class: 'md-notif__head' });
  const heading = el('h2', { class: 'md-notif__title' });
  heading.append(line('ui.notifications.title', { tag: 'span' }));
  head.append(heading);

  const n = unreadCount();
  if (n > 0) head.append(el('span', { class: 'md-notif__count', text: text('ui.notifications.unread', { n }) }));

  const close = el('button', {
    type: 'button',
    class: 'md-ui-iconbtn',
    'aria-label': text('ui.notifications.close'),
    title: text('ui.notifications.close'),
    onClick: () => closeNotifications(),
  });
  close.append(icon('close', 20));
  head.append(close);

  const tools = el('div', { class: 'md-notif__tools' });
  const markBtn = el('button', {
    type: 'button',
    class: 'md-ui-btn',
    onClick: () => {
      markAllRead();
      renderNotifList();
      const badge = notifPanel?.querySelector('.md-notif__count');
      if (badge) badge.remove();
    },
  });
  markBtn.append(icon('check', 18), el('span', { text: text('ui.notifications.markAllRead') }));

  const clearBtn = el('button', {
    type: 'button',
    class: 'md-ui-btn',
    onClick: () => {
      clearRecords();
      renderNotifList();
      const badge = notifPanel?.querySelector('.md-notif__count');
      if (badge) badge.remove();
      // Confirming the clear is informational, so it is a toast, not a dialog.
      // It is deliberately not recorded — recording it would immediately refill
      // the history the user just emptied.
      notify({ kind: 'info', title: 'ui.notifications.cleared', record: false, timeout: 4000 });
    },
  });
  clearBtn.append(icon('trash', 18), el('span', { text: text('ui.notifications.clear') }));
  tools.append(markBtn, clearBtn);

  notifListNode = el('ul', { class: 'md-notif__list' });
  notifPanel.append(head, tools, notifListNode);
  document.body.append(notifPanel);
  renderNotifList();

  for (const node of document.querySelectorAll('[data-md-notifications-toggle]')) {
    node.setAttribute('aria-expanded', 'true');
  }

  close.focus();
  document.addEventListener('keydown', notifKeydown, true);
  // `setTimeout` so the click that opened the panel does not immediately close it.
  window.setTimeout(() => document.addEventListener('pointerdown', notifOutside, true), 0);
}

function notifKeydown(event) {
  if (event.key === 'Escape' && notifPanel) {
    event.stopPropagation();
    closeNotifications();
  }
}

function notifOutside(event) {
  if (!notifPanel) return;
  if (notifPanel.contains(event.target)) return;
  if (event.target.closest?.('[data-md-notifications-toggle]')) return; // the toggle handles itself
  closeNotifications();
}

function closeNotifications() {
  if (!notifPanel) return;
  notifPanel.remove();
  notifPanel = null;
  notifListNode = null;
  document.removeEventListener('keydown', notifKeydown, true);
  document.removeEventListener('pointerdown', notifOutside, true);
  for (const node of document.querySelectorAll('[data-md-notifications-toggle]')) {
    node.setAttribute('aria-expanded', 'false');
  }
  if (notifOpener?.isConnected) notifOpener.focus();
  notifOpener = null;
}

function markAllRead() {
  let changed = false;
  for (const record of records) {
    if (!record.read) {
      record.read = true;
      changed = true;
    }
  }
  if (changed) {
    persistRecords();
    syncBadges();
  }
}

function clearRecords() {
  records = [];
  persistRecords();
  syncBadges();
}

/** Public handle on the notification centre. */
export const notifications = {
  /** A defensive copy — callers must not mutate the store directly. */
  list: () => records.map((r) => ({ ...r })),
  unread: unreadCount,
  markAllRead,
  clear: clearRecords,
  open: openNotifications,
  close: closeNotifications,
  toggle(opener) {
    if (notifPanel) closeNotifications();
    else openNotifications(opener);
  },
  isOpen: () => notifPanel !== null,
};

/* ==========================================================================
 * 6. Command palette
 * ==========================================================================
 * The registry accepts three kinds of entry. Anything not registered is
 * discovered from the DOM on every open, so the palette is complete even if no
 * other module ever calls register*.
 */

const registry = new Map(); // id -> entry

function addEntry(entry) {
  if (!entry || !entry.id) return () => {};
  registry.set(entry.id, entry);
  return () => registry.delete(entry.id);
}

/** @returns {Function} an unregister function. */
export function registerCommand(spec) {
  return addEntry({ ...spec, type: 'command' });
}

/**
 * A setting row renders its live control inline in the palette, and changing it
 * there changes the setting for real.
 *
 * `control` is one of:
 *   {kind:'toggle'}
 *   {kind:'range', min, max, step, unit}
 *   {kind:'select', options:[{value,label}]}
 *   {kind:'color'}
 *   {kind:'text'}
 */
export function registerSetting(spec) {
  return addEntry({ ...spec, type: 'setting' });
}

/** A destination is a tab or an anchor the palette can navigate to. */
export function registerDestination(spec) {
  return addEntry({ ...spec, type: 'destination' });
}

export function unregister(id) {
  registry.delete(id);
}

/* --- DOM discovery -------------------------------------------------------- */

function labelForControl(node) {
  const explicit = node.getAttribute('data-md-setting');
  if (explicit) return explicit;
  if (node.id) {
    const label = document.querySelector(`label[for="${CSS.escape(node.id)}"]`);
    if (label) return label.textContent.trim();
  }
  const wrapping = node.closest('label');
  if (wrapping) return wrapping.textContent.trim();
  return node.getAttribute('aria-label') || node.name || node.id || 'Setting';
}

/**
 * Turn a real control in the page into a palette setting entry whose inline
 * control proxies it: reads its value, writes it back, and fires the `input`
 * and `change` events the owning module is listening for. This is what makes
 * the palette's settings genuinely live without any coordination.
 */
function entryFromDomControl(node, index) {
  const enLabel = labelForControl(node);
  const yueLabel = node.getAttribute('data-md-setting-yue');
  const section = node.getAttribute('data-md-setting-section') || 'ui.palette.section.settings';
  const id = `dom-setting:${node.id || enLabel}:${index}`;

  // A container marked as a setting may hold a radio group rather than a single
  // control — present that as a select, which is the same choice in one row.
  let target = node;
  let radios = null;
  if (!(node instanceof HTMLInputElement) && !(node instanceof HTMLSelectElement) && !(node instanceof HTMLTextAreaElement)) {
    const inner = node.querySelectorAll('input, select, textarea');
    const radioList = [...inner].filter((i) => i.type === 'radio');
    if (radioList.length > 1) radios = radioList;
    else if (inner.length > 0) [target] = inner;
    else return null;
  }

  const fire = (element) => {
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };

  if (radios) {
    return {
      id,
      type: 'setting',
      title: yueLabel ? { en: enLabel, yue: yueLabel } : enLabel,
      section,
      element: node,
      control: {
        kind: 'select',
        options: radios.map((r) => ({ value: r.value, label: labelForControl(r) })),
      },
      get: () => radios.find((r) => r.checked)?.value ?? '',
      set: (value) => {
        const hit = radios.find((r) => r.value === value);
        if (!hit) return;
        hit.checked = true;
        fire(hit);
      },
    };
  }

  const type = (target.type || target.tagName).toLowerCase();
  let control;
  if (type === 'checkbox') control = { kind: 'toggle' };
  else if (type === 'range') {
    control = {
      kind: 'range',
      min: Number(target.min || 0),
      max: Number(target.max || 100),
      step: Number(target.step || 1),
      unit: target.getAttribute('data-md-setting-unit') || '',
    };
  } else if (type === 'color') control = { kind: 'color' };
  else if (type === 'select' || type === 'select-one') {
    control = { kind: 'select', options: [...target.options].map((o) => ({ value: o.value, label: o.label || o.text })) };
  } else control = { kind: 'text' };

  return {
    id,
    type: 'setting',
    title: yueLabel ? { en: enLabel, yue: yueLabel } : enLabel,
    section,
    element: target,
    control,
    get: () => (control.kind === 'toggle' ? target.checked : target.value),
    set: (value) => {
      if (control.kind === 'toggle') target.checked = !!value;
      else target.value = value;
      fire(target);
    },
  };
}

/** Rebuild the discovered half of the entry list. Runs on every palette open. */
function discover() {
  const found = [];

  // Destinations: every tab in the strip, wherever tabs.js put it.
  document.querySelectorAll('[role="tab"]').forEach((tab, i) => {
    const controls = tab.getAttribute('aria-controls');
    const id = `dom-dest:${controls || tab.id || i}`;
    if (registry.has(id)) return;
    found.push({
      id,
      type: 'destination',
      title: (tab.getAttribute('data-md-title') || tab.textContent || '').trim() || `Tab ${i + 1}`,
      section: 'ui.palette.section.pages',
      element: controls ? document.getElementById(controls) : null,
      activate: () => tab.click(),
    });
  });

  // Explicitly marked destinations that are not tabs.
  document.querySelectorAll('[data-md-destination]').forEach((node, i) => {
    const id = `dom-dest-x:${node.id || i}`;
    if (registry.has(id)) return;
    found.push({
      id,
      type: 'destination',
      title: node.getAttribute('data-md-destination') || node.textContent.trim(),
      section: 'ui.palette.section.pages',
      element: node,
      activate: () => node.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' }),
    });
  });

  // Commands: any button that says it is one.
  document.querySelectorAll('[data-md-command]').forEach((node, i) => {
    const id = `dom-cmd:${node.id || i}`;
    if (registry.has(id)) return;
    const enLabel = node.getAttribute('data-md-command') || node.textContent.trim();
    found.push({
      id,
      type: 'command',
      title: node.getAttribute('data-md-command-yue') ? { en: enLabel, yue: node.getAttribute('data-md-command-yue') } : enLabel,
      section: node.getAttribute('data-md-command-section') || 'ui.palette.section.commands',
      run: () => node.click(),
    });
  });

  // Settings: real controls, mirrored with a live proxy.
  document.querySelectorAll('[data-md-setting]').forEach((node, i) => {
    const entry = entryFromDomControl(node, i);
    if (entry && !registry.has(entry.id)) found.push(entry);
  });

  return found;
}

function allEntries() {
  return [...registry.values(), ...discover()];
}

/* --- Fuzzy matching ------------------------------------------------------- */

/**
 * Subsequence scoring: consecutive characters and word starts score higher, and
 * shorter haystacks win ties. Works on CJK too, since it operates on code
 * points rather than words. Returns -1 for no match.
 */
function fuzzyScore(needle, haystack) {
  if (!needle) return 0;
  const hay = haystack.toLowerCase();
  const pin = needle.toLowerCase();
  let cursor = 0;
  let score = 0;
  let streak = 0;
  for (const ch of pin) {
    if (ch === ' ') continue;
    const at = hay.indexOf(ch, cursor);
    if (at < 0) return -1;
    let point = 1;
    if (at === cursor) {
      streak += 1;
      point += streak * 2;
    } else streak = 0;
    if (at === 0 || /[\s\-_/·:.、，]/.test(hay[at - 1])) point += 3;
    score += point;
    cursor = at + 1;
  }
  return score - Math.min(hay.length / 12, 4);
}

/** A title may be a catalogue key, so search must match the COPY, not the key. */
function titleIn(spec, lang) {
  if (spec === null || spec === undefined) return '';
  const source =
    typeof spec === 'string' && Object.prototype.hasOwnProperty.call(UI_STRINGS, spec) ? UI_STRINGS[spec] : spec;
  return pick(source, lang);
}

function scoreEntry(entry, query) {
  if (!query) return 0;
  const titleEn = titleIn(entry.title, 'en');
  const titleYue = titleIn(entry.title, 'yue');
  const keywords = [].concat(entry.keywords || []).join(' ');
  const sectionText = text(entry.section || '');
  const candidates = [
    [titleEn, 1],
    [titleYue, 1],
    [keywords, 0.7],
    [sectionText, 0.4],
  ];
  let best = -1;
  for (const [candidate, weight] of candidates) {
    if (!candidate) continue;
    const raw = fuzzyScore(query, String(candidate));
    if (raw >= 0) best = Math.max(best, raw * weight);
  }
  return best;
}

/* --- Inline controls ------------------------------------------------------ */

/**
 * Build the live control for a setting row. Changing it changes the setting.
 * `onChanged` fires after every write so the row's accessible label can be
 * brought back in step — a label that still says "off" after the switch was
 * clicked is worse than no label at all.
 */
function buildControl(entry, onChanged = () => {}) {
  const control = entry.control || { kind: 'text' };
  const wrap = el('div', { class: 'md-palette__control' });
  const label = text(entry.title);
  let node;

  if (control.kind === 'toggle') {
    node = el('button', {
      type: 'button',
      class: 'md-switch',
      role: 'switch',
      tabindex: '-1',
      'aria-checked': String(!!entry.get()),
      'aria-label': label,
    });
    node.append(el('span', { class: 'md-switch__track' }, [el('span', { class: 'md-switch__thumb' })]));
    node.addEventListener('click', (event) => {
      event.stopPropagation();
      const next = !(node.getAttribute('aria-checked') === 'true');
      entry.set(next);
      onChanged();
      node.setAttribute('aria-checked', String(next));
    });
    wrap.append(node);
  } else if (control.kind === 'range') {
    const readout = el('span', { class: 'md-ui-value' });
    node = el('input', {
      type: 'range',
      class: 'md-ui-range',
      tabindex: '-1',
      min: control.min ?? 0,
      max: control.max ?? 100,
      step: control.step ?? 1,
      value: entry.get(),
      'aria-label': label,
    });
    const paint = () => {
      readout.textContent = `${node.value}${control.unit || ''}`;
    };
    paint();
    node.addEventListener('input', (event) => {
      event.stopPropagation();
      entry.set(node.value);
      onChanged();
      paint();
    });
    node.addEventListener('click', (event) => event.stopPropagation());
    wrap.append(node, readout);
  } else if (control.kind === 'select') {
    node = el('select', { class: 'md-ui-select', tabindex: '-1', 'aria-label': label });
    for (const option of control.options || []) {
      node.append(el('option', { value: option.value, text: text(option.label ?? option.value) }));
    }
    node.value = entry.get();
    node.addEventListener('change', (event) => {
      event.stopPropagation();
      entry.set(node.value);
      onChanged();
    });
    node.addEventListener('click', (event) => event.stopPropagation());
    wrap.append(node);
  } else if (control.kind === 'color') {
    const readout = el('span', { class: 'md-ui-value' });
    node = el('input', { type: 'color', class: 'md-ui-color', tabindex: '-1', value: entry.get(), 'aria-label': label });
    const paint = () => {
      readout.textContent = String(node.value).toUpperCase();
    };
    paint();
    node.addEventListener('input', (event) => {
      event.stopPropagation();
      entry.set(node.value);
      onChanged();
      paint();
    });
    node.addEventListener('click', (event) => event.stopPropagation());
    wrap.append(node, readout);
  } else {
    node = el('input', { type: 'text', class: 'md-ui-text', tabindex: '-1', value: entry.get() ?? '', 'aria-label': label });
    node.addEventListener('change', (event) => {
      event.stopPropagation();
      entry.set(node.value);
      onChanged();
    });
    node.addEventListener('click', (event) => event.stopPropagation());
    wrap.append(node);
  }

  wrap.dataset.controlKind = control.kind;
  return { wrap, node };
}

/* --- Palette shell -------------------------------------------------------- */

let paletteScrim = null;
let paletteOpener = null;
let paletteInput = null;
let paletteList = null;
let paletteRows = [];
let paletteActive = 0;
let paletteRegexController = null;
let paletteMode = store.get('palette.mode', 'card') === 'full' ? 'full' : 'card';

function setPaletteMode(mode) {
  paletteMode = mode === 'full' ? 'full' : 'card';
  store.set('palette.mode', paletteMode);
  if (paletteScrim) {
    paletteScrim.dataset.mode = paletteMode;
    const btn = paletteScrim.querySelector('[data-palette-size]');
    if (btn) paintSizeButton(btn);
  }
}

function paintSizeButton(btn) {
  const toFull = paletteMode === 'card';
  btn.setAttribute('aria-label', text(toFull ? 'ui.palette.toFull' : 'ui.palette.toCard'));
  btn.title = btn.getAttribute('aria-label');
  btn.replaceChildren(icon(toFull ? 'expand' : 'collapse', 20));
}

function openPalette(opener) {
  if (paletteScrim) return;
  injectStyles();
  paletteOpener = opener instanceof HTMLElement ? opener : document.activeElement;

  paletteScrim = el('div', { class: 'md-palette-scrim', dataset: { mode: paletteMode } });
  paletteScrim.addEventListener('pointerdown', (event) => {
    if (event.target === paletteScrim) closePalette();
  });

  const card = el('div', {
    class: 'md-palette',
    role: 'dialog',
    // Modal on purpose: the palette exists to take the next keystroke, which is
    // exactly the case the standard reserves modality for.
    'aria-modal': 'true',
    'aria-label': text('ui.palette.title'),
  });

  const listId = 'md-palette-list';
  paletteInput = el('input', {
    type: 'text',
    class: 'md-palette__input',
    role: 'combobox',
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-expanded': 'true',
    'aria-controls': listId,
    'aria-autocomplete': 'list',
    'aria-label': text('ui.palette.placeholder'),
    placeholder: text('ui.palette.placeholder'),
  });
  paletteInput.addEventListener('input', () => renderPalette());

  const regexMode = el('button', {
    type: 'button', class: 'md-ui-iconbtn', text: '.*',
    'aria-label': text('ui.palette.regex'), 'aria-pressed': 'false',
  });
  const regexBuilder = el('button', {
    type: 'button', class: 'md-ui-iconbtn', text: '⌘',
    'aria-label': text('ui.palette.builder'), 'aria-haspopup': 'dialog',
    'aria-expanded': 'false',
  });
  try {
    paletteRegexController = regex.attachRegexBuilder(paletteInput, {
      key: 'ui.palette.search', trigger: regexBuilder, modeToggle: regexMode,
      dialect: 'ECMAScript (JavaScript RegExp)', onChange: () => renderPalette(),
    });
  } catch (error) {
    paletteRegexController = null;
    console.warn('[ui] palette regex builder failed to attach', error);
  }

  const sizeBtn = el('button', { type: 'button', class: 'md-ui-iconbtn', dataset: { paletteSize: 'true' } });
  paintSizeButton(sizeBtn);
  sizeBtn.addEventListener('click', () => setPaletteMode(paletteMode === 'card' ? 'full' : 'card'));

  const search = el('div', { class: 'md-palette__search' }, [icon('search', 22), paletteInput, regexMode, regexBuilder, sizeBtn]);
  paletteList = el('ul', { class: 'md-palette__list', id: listId, role: 'listbox', 'aria-label': text('ui.palette.title') });

  const foot = el('div', { class: 'md-palette__foot' }, [
    el('span', { text: text('ui.palette.hint') }),
    el('span', { class: 'md-palette__count', 'aria-live': 'polite' }),
  ]);

  card.append(search, paletteList, foot);
  paletteScrim.append(card);
  document.body.append(paletteScrim);

  card.addEventListener('keydown', paletteKeydown);
  renderPalette();
  paletteInput.focus();
  document.dispatchEvent(new CustomEvent('md:palette-open'));
}

function closePalette() {
  if (!paletteScrim) return;
  paletteScrim.remove();
  paletteScrim = null;
  paletteInput = null;
  paletteList = null;
  paletteRows = [];
  paletteRegexController?.destroy?.();
  paletteRegexController = null;
  paletteActive = 0;
  if (paletteOpener?.isConnected) paletteOpener.focus();
  paletteOpener = null;
  document.dispatchEvent(new CustomEvent('md:palette-close'));
}

const SECTION_ORDER = ['ui.palette.section.commands', 'ui.palette.section.settings', 'ui.palette.section.pages'];

function paletteRegexScore(entry, query) {
  if (!paletteRegexController || paletteRegexController.getState().mode !== 'regex') return scoreEntry(entry, query);
  const state = paletteRegexController.getState();
  const matcher = paletteRegexController.matcher();
  matcher.reset?.();
  if (!state.valid || !matcher.isUsable()) return -1;
  const haystack = [
    titleIn(entry.title, 'en'),
    titleIn(entry.title, 'yue'),
    [].concat(entry.keywords || []).join(' '),
    text(entry.section || ''),
  ].join(' ');
  return matcher(haystack) ? 1 : -1;
}

function renderPalette() {
  if (!paletteList) return;
  const query = paletteInput.value.trim();

  const scored = allEntries()
    .map((entry) => ({ entry, score: paletteRegexScore(entry, query) }))
    .filter((row) => row.score >= 0);

  // No query: keep the registration/discovery order, grouped by section, so the
  // palette reads as a stable table of contents rather than shuffling on open.
  if (query) scored.sort((a, b) => b.score - a.score);

  paletteList.replaceChildren();
  paletteRows = [];

  if (scored.length === 0) {
    const empty = el('div', { class: 'md-palette__empty' });
    empty.append(line('ui.palette.empty', { vars: { q: query } }));
    paletteList.append(empty);
    updateCount(0);
    return;
  }

  const groups = new Map();
  for (const { entry } of scored) {
    const key = entry.section || defaultSection(entry);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  const keys = [...groups.keys()].sort((a, b) => {
    const ia = SECTION_ORDER.indexOf(a);
    const ib = SECTION_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  for (const key of keys) {
    paletteList.append(el('li', { class: 'md-palette__group', role: 'presentation', text: text(key) }));
    for (const entry of groups.get(key)) paletteList.append(buildRow(entry));
  }

  paletteActive = 0;
  paintActive();
  updateCount(scored.length);
}

function defaultSection(entry) {
  if (entry.type === 'setting') return 'ui.palette.section.settings';
  if (entry.type === 'destination') return 'ui.palette.section.pages';
  return 'ui.palette.section.commands';
}

function updateCount(n) {
  const node = paletteScrim?.querySelector('.md-palette__count');
  if (node) node.textContent = text('ui.palette.results', { n });
}

function buildRow(entry) {
  const rowId = `md-prow-${paletteRows.length}`;
  const row = el('li', {
    class: 'md-palette__row',
    id: rowId,
    role: 'option',
    'aria-selected': 'false',
    dataset: { type: entry.type },
  });

  row.append(icon(entry.type === 'setting' ? 'slider' : entry.type === 'destination' ? 'page' : 'command', 20));

  const labelWrap = el('div', { class: 'md-palette__labelwrap' });
  labelWrap.append(line(entry.title, { class: 'md-palette__label' }));
  row.append(labelWrap);

  // Declared before the listeners that close over it; the listeners only ever
  // run after this function has returned, so the binding is always initialised.
  const record = { entry, row, controlNode: null };

  let controlNode = null;
  if (entry.type === 'setting' && typeof entry.get === 'function' && typeof entry.set === 'function') {
    // A screen reader hears the name, the CURRENT value, and how to change it —
    // the inline control is reachable with Enter, so the row is fully operable.
    // Re-run on every write so the announced value never goes stale.
    const relabel = () => {
      row.setAttribute('aria-label', `${text(entry.title)}, ${describeValue(entry)} — ${text('ui.palette.editHint')}`);
    };
    const built = buildControl(entry, relabel);
    controlNode = built.node;
    row.append(built.wrap);
    relabel();
  } else if (entry.shortcut) {
    row.append(el('span', { class: 'md-palette__hint', text: entry.shortcut }));
  }
  // No empty placeholder for a row with neither control nor shortcut: an empty
  // span still occupies a grid cell, and in the narrow two-column layout it
  // wrapped onto an implicit third row.

  record.controlNode = controlNode;

  row.addEventListener('pointerdown', (event) => {
    // Clicking the inline control operates it; clicking anywhere else runs the row.
    if (controlNode && controlNode.contains(event.target)) return;
    event.preventDefault();
    paletteActive = paletteRows.indexOf(record);
    paintActive();
  });
  row.addEventListener('click', (event) => {
    if (controlNode && controlNode.contains(event.target)) return;
    activateRow(record);
  });

  paletteRows.push(record);
  return row;
}

function describeValue(entry) {
  try {
    const value = entry.get();
    if (entry.control?.kind === 'toggle') return value ? 'on' : 'off';
    if (entry.control?.kind === 'select') {
      const hit = (entry.control.options || []).find((o) => String(o.value) === String(value));
      return text(hit?.label ?? value);
    }
    return `${value}${entry.control?.unit || ''}`;
  } catch {
    return '';
  }
}

function paintActive() {
  paletteRows.forEach((record, i) => {
    const on = i === paletteActive;
    record.row.setAttribute('aria-selected', String(on));
    if (on) {
      paletteInput?.setAttribute('aria-activedescendant', record.row.id);
      record.row.scrollIntoView({ block: 'nearest' });
    }
  });
  if (paletteRows.length === 0) paletteInput?.removeAttribute('aria-activedescendant');
}

function activateRow(record) {
  const { entry } = record;

  if (entry.type === 'setting') {
    // Enter on a toggle just flips it — no reason to make anyone visit a
    // sub-control for a binary. Everything else takes focus so it can be
    // operated natively, and Escape hands focus back to the search field.
    if (entry.control?.kind === 'toggle' && record.controlNode) {
      record.controlNode.click(); // its own handler writes the value and relabels the row
      return;
    }
    record.controlNode?.focus();
    return;
  }

  if (entry.type === 'command') {
    closePalette();
    try {
      entry.run?.();
    } catch (error) {
      notify({ kind: 'error', title: text(entry.title), body: String(error?.message || error) });
    }
    return;
  }

  // Destination: navigate, then say where we landed.
  closePalette();
  window.setTimeout(() => {
    if (typeof entry.activate === 'function') entry.activate();
    else document.dispatchEvent(new CustomEvent('md:navigate', { detail: { id: entry.id, entry } }));
    const target = typeof entry.target === 'function' ? entry.target() : entry.element;
    if (target) flash(target);
  }, 0);
}

function paletteKeydown(event) {
  // "Editing" means focus is inside a row's inline control — not merely
  // somewhere other than the search field. The size button, for instance, must
  // keep its own Enter and its own arrow keys.
  const editing = !!document.activeElement?.closest?.('.md-palette__control');

  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    if (editing) paletteInput?.focus(); // step out of a control first, then close
    else closePalette();
    return;
  }

  if (editing) {
    // While a control has focus the arrows belong to it, not to the list.
    if (event.key === 'Enter') {
      event.preventDefault();
      paletteInput?.focus();
    }
    if (event.key === 'Tab') trapTab(event);
    return;
  }

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      if (paletteRows.length) {
        paletteActive = (paletteActive + 1) % paletteRows.length;
        paintActive();
      }
      break;
    case 'ArrowUp':
      event.preventDefault();
      if (paletteRows.length) {
        paletteActive = (paletteActive - 1 + paletteRows.length) % paletteRows.length;
        paintActive();
      }
      break;
    case 'Home':
      if (paletteRows.length) {
        event.preventDefault();
        paletteActive = 0;
        paintActive();
      }
      break;
    case 'End':
      if (paletteRows.length) {
        event.preventDefault();
        paletteActive = paletteRows.length - 1;
        paintActive();
      }
      break;
    case 'ArrowLeft':
    case 'ArrowRight': {
      // Nudge a slider without leaving the search field — the common case for
      // UI scale and tone levels.
      const record = paletteRows[paletteActive];
      if (record?.entry.control?.kind === 'range' && record.controlNode) {
        event.preventDefault();
        const input = record.controlNode;
        const step = Number(input.step) || 1;
        const delta = event.key === 'ArrowRight' ? step : -step;
        input.value = String(Number(input.value) + delta);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      break;
    }
    case 'Enter': {
      const record = paletteRows[paletteActive];
      if (record) {
        event.preventDefault();
        activateRow(record);
      }
      break;
    }
    case 'Tab':
      trapTab(event);
      break;
    default:
      break;
  }
}

/** Focus stays inside the palette while it is open — it is modal. */
function trapTab(event) {
  const card = paletteScrim?.querySelector('.md-palette');
  if (!card) return;
  // `tabindex="-1"` is excluded explicitly: the inline setting controls carry it
  // so they stay out of the Tab cycle and are reached with Enter instead.
  const focusable = [...card.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')].filter(
    (node) => !node.disabled && node.getAttribute('tabindex') !== '-1' && node.offsetParent !== null,
  );
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export const palette = {
  open: openPalette,
  close: closePalette,
  toggle(opener) {
    if (paletteScrim) closePalette();
    else openPalette(opener);
  },
  isOpen: () => paletteScrim !== null,
  getMode: () => paletteMode,
  setMode: setPaletteMode,
  /** Re-render if it happens to be open — for modules that register late. */
  refresh: () => {
    if (paletteScrim) renderPalette();
  },
};

/** Briefly ring an element so the user sees where the palette just took them. */
export function flash(target) {
  const node = typeof target === 'string' ? document.querySelector(target) : target;
  if (!node) return;
  node.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
  node.classList.remove('md-ui-flash');
  // Force a reflow so the animation restarts if the same target is hit twice.
  void node.offsetWidth;
  node.classList.add('md-ui-flash');
  window.setTimeout(() => node.classList.remove('md-ui-flash'), 1800);
}

/* ==========================================================================
 * 7. Dim sum surprise
 * ==========================================================================
 * A 10% draw on load. One draw per load, never two. It cannot block, delay or
 * steal focus, and there is deliberately NO setting to turn it off — so it must
 * stay polite, which is why it is a toast and not a dialog.
 */

const DIM_SUM_CHANCE = 0.1;
let dimSumDrawn = false;

/** Where the catalogue lives, resolved from this module's own URL so the site
 *  works under the /material-designer/ path prefix and from a subdirectory. */
function catalogueUrl() {
  const override = document.documentElement.getAttribute('data-md-dimsum-index');
  if (override) return new URL(override, document.baseURI);
  return new URL('../../../assets/dim-sum/index.json', import.meta.url);
}

async function maybeDimSum() {
  if (dimSumDrawn) return; // never twice in one load
  dimSumDrawn = true;

  // Fresh draw every load. Decided BEFORE the fetch, so a losing draw costs
  // nothing at all — no request, no parse, no work on the critical path.
  if (Math.random() >= DIM_SUM_CHANCE) return;

  let catalogue;
  const indexUrl = catalogueUrl();
  try {
    const response = await fetch(indexUrl, { cache: 'force-cache' });
    if (!response.ok) return;
    catalogue = await response.json();
  } catch {
    // Opened from file:// or the catalogue moved. A missing surprise is not an
    // error worth telling anyone about, and inventing a dish is forbidden.
    return;
  }

  const dishes = Array.isArray(catalogue?.dishes) ? catalogue.dishes : [];
  if (dishes.length === 0) return;

  const dish = dishes[Math.floor(Math.random() * dishes.length)];
  if (!dish?.image || !dish?.name) return;

  const mode = langMode();
  // The catalogue's own alt text, verbatim. It describes the actual photograph,
  // which is the whole point of alt text, and it is not ours to rewrite.
  const alt =
    mode === 'yue'
      ? dish.alt?.yue || dish.alt?.en || ''
      : mode === 'bi'
        ? [dish.alt?.en, dish.alt?.yue].filter(Boolean).join(' · ')
        : dish.alt?.en || dish.alt?.yue || '';

  const src = new URL(dish.image, new URL('./', indexUrl)).href;

  // The countdown starts once, whichever of the three routes gets there first:
  // the image loading, the image failing, or the safety timer below.
  let clockStarted = false;
  const startClock = () => {
    if (clockStarted) return;
    clockStarted = true;
    handle.setTimeout(DEFAULT_TIMEOUTS.dimsum);
  };

  // The dish's own names — exact in both languages, at every tone level, in
  // every language mode. This is the fact the surprise exists to deliver, so it
  // is never abbreviated, translated away or restyled by the tone slider.
  const names = el('div', { class: 'md-toast__names' }, [
    el('p', { class: 'md-toast__dish', text: dish.name.en }),
    el('p', { class: 'md-toast__dish-zh', text: dish.name.zhHant, lang: 'zh-Hant-HK' }),
  ]);
  if (dish.jyutping) names.append(el('p', { class: 'md-toast__dish-rom', text: dish.jyutping }));

  const handle = notify({
    kind: 'dimsum',
    title: 'ui.dimsum.title',
    extra: names,
    body: 'ui.dimsum.note',
    // Held open until the photograph has actually arrived, so the toast is never
    // dismissed before there is anything to look at.
    timeout: 0,
    figure: { src, alt, onSettle: startClock },
  });

  // Belt and braces: if neither load nor error ever fires, start the clock anyway.
  window.setTimeout(startClock, 6000);

  // Record it with the dish named, so the notification centre is truthful about
  // what was actually shown.
  const last = records[0];
  if (last && last.kind === 'dimsum') {
    last.body = {
      en: `${dish.name.en} · ${dish.name.zhHant}`,
      yue: `${dish.name.zhHant} · ${dish.name.en}`,
    };
    persistRecords();
    if (notifPanel) renderNotifList();
  }
}

/* ==========================================================================
 * 8. Wiring and initialisation
 * ========================================================================== */

let initialised = false;

/** Idempotent — main.js may call this, and the module also self-starts. */
export function init() {
  if (initialised) return api;
  initialised = true;
  injectStyles();
  syncBadges();

  // Delegated so buttons added later still work, and so index.html needs no
  // JavaScript of its own.
  document.addEventListener('click', (event) => {
    const notifToggle = event.target.closest?.('[data-md-notifications-toggle]');
    if (notifToggle) {
      event.preventDefault();
      notifications.toggle(notifToggle);
      return;
    }
    const paletteBtn = event.target.closest?.('[data-md-palette-open]');
    if (paletteBtn) {
      event.preventDefault();
      palette.toggle(paletteBtn);
    }
  });

  // Ctrl+Shift+F is the one global palette shortcut. Captured so a focused
  // text field cannot swallow it. Ctrl+K is deliberately not a competing
  // default.
  document.addEventListener(
    'keydown',
    (event) => {
      // `event.key` is absent on some synthetic events; guard rather than throw
      // inside a capture-phase listener bound to the whole document.
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && String(event.key || '').toLowerCase() === 'f') {
        event.preventDefault();
        palette.toggle(document.activeElement);
      }
    },
    true,
  );

  // The loose bus: any module can raise a toast without importing this one.
  document.addEventListener('md:toast', (event) => {
    if (event.detail) notify(event.detail);
  });

  // Language or tone changed — re-render whatever is open. Toasts already on
  // screen keep the wording they were raised with; the centre re-renders fully.
  onLanguageChange(() => {
    syncBadges();
    if (notifPanel) {
      const heading = notifPanel.querySelector('.md-notif__title');
      if (heading) heading.replaceChildren(...line('ui.notifications.title', { tag: 'span' }).childNodes);
      notifPanel.setAttribute('aria-label', text('ui.notifications.title'));
      renderNotifList();
    }
    if (paletteScrim) {
      paletteInput.placeholder = text('ui.palette.placeholder');
      renderPalette();
    }
    if (toastStack) toastStack.setAttribute('aria-label', text('ui.toast.region'));
  });

  // This module's own palette entries. Everything else registers itself.
  registerCommand({
    id: 'ui.cmd.notifications',
    title: { en: 'Open notification centre', yue: '打開通知中心' },
    keywords: ['notifications', 'alerts', 'history', '通知', '記錄'],
    section: 'ui.palette.section.commands',
    run: () => notifications.open(),
  });
  registerCommand({
    id: 'ui.cmd.markRead',
    title: { en: 'Mark all notifications read', yue: '全部通知當睇咗' },
    keywords: ['read', 'unread', 'clear badge', '已讀'],
    section: 'ui.palette.section.commands',
    run: () => {
      markAllRead();
      notify({ kind: 'success', title: { en: 'All notifications marked read.', yue: '全部通知當睇咗喇。' }, record: false });
    },
  });
  registerCommand({
    id: 'ui.cmd.clearNotifications',
    title: { en: 'Clear notification history', yue: '清走通知記錄' },
    keywords: ['clear', 'empty', 'history', '清除'],
    section: 'ui.palette.section.commands',
    run: () => {
      clearRecords();
      notify({ kind: 'info', title: 'ui.notifications.cleared', record: false });
    },
  });
  registerSetting({
    id: 'ui.set.paletteMode',
    title: { en: 'Command palette size', yue: '指令面板大細' },
    keywords: ['palette', 'size', 'full', 'card', '面板', '大細'],
    section: 'ui.palette.section.settings',
    control: {
      kind: 'select',
      options: [
        { value: 'card', label: 'ui.palette.sizeCard' },
        { value: 'full', label: 'ui.palette.sizeFull' },
      ],
    },
    get: () => paletteMode,
    set: (value) => setPaletteMode(value),
  });

  // Off the critical path entirely: the draw happens when the browser is idle,
  // so a winning draw still cannot delay first paint or interaction.
  const runDraw = () => {
    maybeDimSum().catch(() => {
      /* Never let the surprise become a problem. */
    });
  };
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(runDraw, { timeout: 2500 });
  else window.setTimeout(runDraw, 400);

  return api;
}

const api = {
  version,
  notify,
  toast,
  notifications,
  palette,
  registerCommand,
  registerSetting,
  registerDestination,
  unregister,
  flash,
  init,
  UI_STRINGS,
};

// Self-start. Module scripts are deferred, so the DOM is parsed by now; the
// readyState check covers a dynamic import from an early inline script.
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();

export default api;
