/*
 * tabs.js — browser-style tabbed navigation for the Material Designer site.
 * ---------------------------------------------------------------------------
 * The site's pages are tabs, not one long scroll. This module owns the tab
 * strip: rendering it, reordering by drag and by keyboard, pinning, the
 * overflow surface, the searchable tab list, persistence, and the ARIA
 * relationships between each tab and its panel.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO
 *   docs/standards/tabs.md also requires tab *grouping* and the two *bulk-close*
 *   actions. Neither applies to this surface, and pretending otherwise would be
 *   worse than saying so: the site has exactly ten permanent sections, so
 *   there is nothing to group them into, and a "close" would make a section of
 *   the documentation unreachable with no way to reopen it. Of the standard's
 *   four tab-discovery searches only #1 (the current strip) exists here, because
 *   there are no groups to search inside of and no second window to search
 *   across. This is recorded in the standard's own conformance notes rather than
 *   left as a silent gap.
 *
 * DEPENDENCIES — both optional, both probed at run time
 *   ./regex.js  supplies the anchored pattern builder for every search field
 *               below. If it is absent or exports something unexpected, the
 *               fields keep working on this module's own bounded engine and the
 *               builder affordance is not rendered (an affordance that cannot
 *               open anything is a broken control, not a placeholder).
 *   ./i18n.js   supplies translated tab labels. If it is absent, or has no entry
 *               for a tab, the built-in labels at DEFAULT_TABS are used so the
 *               language modes still work for navigation.
 *
 *   main.js should wire both explicitly — setRegexIntegration() and
 *   setI18nIntegration() — because an explicit call cannot silently mismatch the
 *   way name-probing can.
 *
 * STORAGE
 *   One localStorage key, TABS_STORAGE_KEY, holding { v, order, pinned, active }.
 *   Tabs are identified by a stable string id, never by index — see the
 *   "Persistence needs a stable identity" note in docs/standards/tabs.md.
 */

/* ========================================================================== *
 * 1. Public constants
 * ========================================================================== */

/** Shared prefix for every localStorage key this site writes (set by i18n.js). */
export const STORAGE_PREFIX = 'md-designer.site.';

/** The single key this module reads and writes. */
export const TABS_STORAGE_KEY = STORAGE_PREFIX + 'tabs';

/** Bumped only when the stored shape changes incompatibly. */
const STORAGE_VERSION = 1;

/**
 * The site's pages, in their default order.
 *
 * `label` carries built-in copy for all three language modes. i18n.js is asked
 * first (key `tabs.<id>.label`); these are the fallback so that navigation is
 * never left untranslated if the catalogue is missing an entry. The Cantonese
 * here is deliberately plain rather than playful: a tab label is a signpost and
 * has to stay scannable at every funny level. The funny-level sliders restyle
 * prose, not navigation.
 */
export const DEFAULT_TABS = Object.freeze([
  { id: 'overview',    icon: 'overview',   en: 'Overview',           yue: '總覽' },
  { id: 'features',    icon: 'features',   en: 'Features',           yue: '功能' },
  { id: 'install',     icon: 'install',    en: 'Install',            yue: '安裝' },
  { id: 'releases',    icon: 'releases',   en: 'Releases',           yue: '發佈版本' },
  { id: 'building',    icon: 'building',   en: 'Building',           yue: '自己砌' },
  { id: 'verifying',   icon: 'verifying',  en: 'Verifying the port', yue: '驗證移植' },
  { id: 'standards',   icon: 'standards',  en: 'Standards',          yue: '標準' },
  { id: 'docs',        icon: 'docs',       en: 'Documentation',      yue: '文件' },
  { id: 'provenance',  icon: 'provenance', en: 'Provenance',         yue: '出處' },
  { id: 'settings',    icon: 'settings',   en: 'Settings',           yue: '設定' },
].map(Object.freeze));

/**
 * The engine every search field on this strip actually runs. Named in the
 * interface because docs/standards/regex-builder.md requires it: a builder that
 * implies one dialect while the search runs another is the worst outcome, since
 * the patterns preview correctly and fail in use.
 */
export const REGEX_DIALECT = 'ECMAScript (JavaScript RegExp)';

/* Bounds on pattern evaluation. Tab labels are short, so the realistic risk here
 * is a pasted pathological pattern rather than a slow one; these caps plus the
 * zero-width guard in safeFindMatches() are what keep a bad pattern from
 * freezing the page. */
const MAX_PATTERN_LENGTH = 512;
const MAX_TEXT_LENGTH = 4096;
const MATCH_BUDGET_MS = 50;
const MAX_MATCHES_PER_TEXT = 500;

/* ========================================================================== *
 * 2. Small utilities
 * ========================================================================== */

/** Create an element with attributes and children in one call. */
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** localStorage that never throws — private-browsing modes deny access. */
const store = {
  read(key) {
    try { return window.localStorage.getItem(key); } catch { return null; }
  },
  write(key, value) {
    try { window.localStorage.setItem(key, value); return true; } catch { return false; }
  },
};

/** True when the visitor has asked for reduced motion. */
function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Escape a literal string so it can be used as a regular-expression body. */
function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Escape text for safe insertion as HTML. */
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

/** A tiny event emitter, so main.js can observe without importing internals. */
function createEmitter() {
  const listeners = new Map();
  return {
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type)?.delete(fn);
    },
    off(type, fn) { listeners.get(type)?.delete(fn); },
    emit(type, detail) {
      for (const fn of listeners.get(type) ?? []) {
        // One misbehaving listener must not stop the strip from rendering.
        try { fn(detail); } catch (error) { console.error('[tabs] listener failed', error); }
      }
    },
  };
}

/* ========================================================================== *
 * 3. Integration adapters — i18n and the regex builder
 * ========================================================================== */

let i18nApi = null;
let regexApi = null;
const integrationWaiters = new Set();

/**
 * Wire the language layer. Expected shape (every member optional):
 *   { t(key, fallback?) -> string, getMode?() -> 'en'|'yue'|'both',
 *     onChange?(fn) -> unsubscribe }
 */
export function setI18nIntegration(api) {
  i18nApi = api || null;
  registerOwnCopy();
  if (api && typeof api.onChange === 'function') {
    // A mode change or a funny-level change must redraw the strip, because the
    // labels themselves change length and the overflow point moves with them.
    api.onChange(() => { for (const w of integrationWaiters) w('i18n'); });
  }
  for (const w of integrationWaiters) w('i18n');
}

/**
 * Wire the pattern builder — regex.js's own module namespace is the expected
 * argument. The contract used is:
 *
 *   attachRegexBuilder(inputEl, { key, trigger, modeToggle, onChange })
 *     -> { matcher(), getState(), setMode(), destroy(), … }
 *
 * Each field passes its OWN input and its own `key`, so each gets an
 * independent controller with independent query, pattern, flags and mode.
 * docs/standards/tabs.md and regex-builder.md both forbid one shared builder
 * writing into whichever field was touched last, and passing distinct inputs is
 * what makes that structurally impossible rather than merely intended.
 */
export function setRegexIntegration(api) {
  regexApi = api || null;
  for (const w of integrationWaiters) w('regex');
}

/** Resolve whichever attach-style function ./regex.js actually exports. */
function resolveRegexAttach() {
  if (!regexApi) return null;
  const candidates = [
    regexApi.attach, regexApi.attachRegexBuilder, regexApi.attachBuilder,
    regexApi.createRegexBuilder, regexApi.mountRegexBuilder, regexApi.default,
  ];
  for (const fn of candidates) if (typeof fn === 'function') return fn.bind(regexApi);
  return null;
}

/**
 * Best-effort auto-wiring, so the strip still gets its builder if main.js
 * forgets to call setRegexIntegration(). A failed import is not an error here —
 * the search fields degrade to this module's own engine.
 */
async function probeIntegrations() {
  if (!regexApi) {
    try {
      const mod = await import('./regex.js');
      // Only adopt it if something attach-shaped is actually exported.
      const probe = { ...mod };
      regexApi = probe;
      if (!resolveRegexAttach()) {
        regexApi = null;
        console.warn(
          '[tabs] ./regex.js loaded but exports no attach-style function; ' +
          'call setRegexIntegration({ attach }) from main.js to wire the builder.',
        );
      }
    } catch { /* regex.js absent — search fields keep working without it. */ }
  }
  if (!i18nApi) {
    try {
      const mod = await import('./i18n.js');
      if (typeof mod.tParts === 'function' || typeof mod.t === 'function') setI18nIntegration(mod);
    } catch { /* i18n.js absent — built-in labels are used. */ }
  }
  for (const w of integrationWaiters) w('probe');
}

/**
 * The active language mode. i18n.js calls the bilingual mode 'bilingual'; the
 * older 'both' spelling is still accepted from a stored value or an attribute
 * so a profile written by an earlier build does not silently fall back to
 * English.
 */
function currentLanguageMode() {
  const normalise = (value) => {
    if (value === 'en' || value === 'yue') return value;
    if (value === 'bilingual' || value === 'both') return 'bilingual';
    return null;
  };
  if (i18nApi && typeof i18nApi.getMode === 'function') {
    const mode = normalise(i18nApi.getMode());
    if (mode) return mode;
  }
  return normalise(store.read(STORAGE_PREFIX + 'lang.mode'))
    ?? normalise(document.documentElement.getAttribute('data-language'))
    ?? 'en';
}

/**
 * Chrome copy: the i18n key, then the English and Cantonese fallbacks used when
 * i18n.js is absent. The keys that already exist in the catalogue are reused
 * rather than redefined; the rest are registered by registerOwnCopy() so they
 * go through the real tone system and show up in i18n's own coverage audit.
 */
const CHROME_KEYS = {
  striplabel:  ['tabs.strip.label',        'Site sections',            '站內分頁'],
  more:        ['tabs.overflow',           'More tabs',                '更多分頁'],
  findTabs:    ['tabs.search.label',       'Search the open tabs',     '搵開咗嘅分頁'],
  searchPlace: ['tabs.search.placeholder', 'Search tabs',              '搵分頁'],
  pin:         ['tabs.pin',                'Pin this tab',             '釘住呢個分頁'],
  unpin:       ['tabs.unpin',              'Unpin this tab',           '解開呢個分頁'],
  pinned:      ['tabs.pinned',             'Pinned',                   '已釘住'],
  listHeading: ['tabs.list.heading',       'All tabs',                 '全部分頁'],
  tabActions:  ['tabs.actions.label',      'Tab actions',              '分頁動作'],
  filterPlace: ['tabs.filter.placeholder', 'Filter',                   '篩選'],
  regexOn:     ['tabs.regex.toggle',       'Use a regular expression', '用正則表達式'],
  builder:     ['tabs.regex.builder',      'Open the pattern builder', '打開 pattern 產生器'],
  moveLeft:    ['tabs.move.left',          'Move left',                '向左移'],
  moveRight:   ['tabs.move.right',         'Move right',               '向右移'],
  noMatch:     ['tabs.filter.nomatch',     'No tab matches that search.', '冇分頁夾到你搵嘅嘢。'],
  hiddenNote:  ['tabs.hidden.note',        'Hidden because the strip ran out of room — still reachable here.',
                                           '分頁條唔夠位收埋咗，喺呢度一樣揀到。'],
  emptyQuery:  ['tabs.filter.empty',       'Type to filter the list.', '打字就篩選。'],
  invalid:     ['tabs.pattern.error',      'Pattern error',            'Pattern 有錯'],
  invalidDetail:['tabs.pattern.invalidDetail','The pattern was rejected before matching.', '個式樣喺比對前已經被拒絕。'],
  refused:     ['tabs.pattern.refused', 'Pattern refused before matching because it was unsafe to evaluate.', '個式樣有安全風險，所以未比對就拒絕咗。'],
  timedOut:    ['tabs.pattern.timedOut', 'Pattern evaluation timed out before this list was complete.', '個式樣比對超時，清單未完成。'],
  incomplete:  ['tabs.pattern.incomplete', 'Search stopped at its bounded evaluation budget; the visible list may be incomplete.', '搜尋去到有上限嘅剖析額度就停咗，畫面上嘅清單可能未完整。'],
  engineNote:  ['tabs.engine.note',        `Engine: ${REGEX_DIALECT}`, `引擎：${REGEX_DIALECT}`],
};

/** Add the keys this module owns to the catalogue, without redefining any. */
function registerOwnCopy() {
  if (!i18nApi || typeof i18nApi.register !== 'function') return;
  const entries = {};
  const add = (key, en, yue) => {
    if (typeof i18nApi.has === 'function' && i18nApi.has(key)) return;
    entries[key] = { en, yue };
  };
  for (const [key, en, yue] of Object.values(CHROME_KEYS)) add(key, en, yue);
  for (const tab of DEFAULT_TABS) add(`tabs.${tab.id}.label`, tab.en, tab.yue);
  if (Object.keys(entries).length) {
    try { i18nApi.register(entries); } catch (error) { console.warn('[tabs] i18n.register failed', error); }
  }
}

/**
 * Resolve a key into { primary, secondary, full }. In bilingual mode the
 * secondary is the Cantonese half, rendered small and dim so both languages
 * show without crowding the strip; `full` is the one-line joined form that an
 * aria-label or a title attribute needs.
 */
function partsFor(key, fallbackEn, fallbackYue) {
  if (i18nApi && typeof i18nApi.tParts === 'function'
      && (typeof i18nApi.has !== 'function' || i18nApi.has(key))) {
    try {
      const parts = i18nApi.tParts(key);
      const primary = parts.primary ?? fallbackEn;
      const secondary = parts.secondary ?? '';
      return { primary, secondary, full: secondary ? `${primary} · ${secondary}` : primary };
    } catch { /* fall through to the built-in copy */ }
  }
  const mode = currentLanguageMode();
  if (mode === 'yue') return { primary: fallbackYue, secondary: '', full: fallbackYue };
  if (mode === 'bilingual') {
    return { primary: fallbackEn, secondary: fallbackYue, full: `${fallbackEn} · ${fallbackYue}` };
  }
  return { primary: fallbackEn, secondary: '', full: fallbackEn };
}

/** The label parts for one tab. */
function labelFor(tab) {
  return partsFor(`tabs.${tab.id}.label`, tab.en, tab.yue);
}

/** One-line chrome string for an aria-label, a title or a note. */
function chrome(key) {
  const entry = CHROME_KEYS[key];
  if (!entry) return key;
  return partsFor(entry[0], entry[1], entry[2]).full;
}

/* ========================================================================== *
 * 4. Bounded matching
 * ========================================================================== */

/**
 * Conservative parser for the synchronous fallback. A worker is the normal
 * evaluator in regex.js, but this route must remain safe when a worker cannot
 * be created. Track nested groups, alternation and quantifiers while skipping
 * escapes and character classes, then refuse an ambiguous quantified group.
 */
function looksCatastrophic(pattern) {
  const frames = [];
  let inClass = false;
  let escaped = false;
  const quantifierEnd = (at) => {
    const ch = pattern[at];
    if (ch === '*' || ch === '+' || ch === '?') return at + 1;
    if (ch !== '{') return at;
    const close = pattern.indexOf('}', at + 1);
    if (close < 0 || !/^\{(?:\d+|\d*,\d*)\}/.test(pattern.slice(at, close + 1))) return at;
    return close + 1;
  };
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '[') { inClass = true; continue; }
    if (ch === ']' && inClass) { inClass = false; continue; }
    if (inClass) continue;
    if (ch === '(') {
      frames.push({ hasQuantifier: false, hasAlternation: false });
      continue;
    }
    if (ch === '|') {
      for (const frame of frames) frame.hasAlternation = true;
      continue;
    }
    if (ch === ')') {
      const frame = frames.pop();
      const end = quantifierEnd(i + 1);
      if (frame && end > i + 1 && (frame.hasQuantifier || frame.hasAlternation)) return true;
      continue;
    }
    if (ch === '?' && pattern[i - 1] === '(') continue;
    const end = quantifierEnd(i);
    if (end > i) {
      for (const frame of frames) frame.hasQuantifier = true;
      i = end - 1;
    }
  }
  return /\\(?:\d+|k<[^>]+>)[+*{]/.test(pattern);
}

/**
 * Compile the field's state into a predicate plus a match locator.
 * Returns { ok, error, test(text), find(text) }. Never throws: a partially typed
 * pattern is invalid far more often than it is valid, and an unguarded compile
 * throws on nearly every keystroke inside a character class.
 */
export function createTabMatcher({ query, mode, flags }) {
  const raw = String(query ?? '');
  if (!raw) return { ok: true, empty: true, error: null, test: () => true, find: () => [] };

  const pattern = mode === 'regex' ? raw : escapeRegExp(raw);
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return failedMatcher(`Pattern is longer than ${MAX_PATTERN_LENGTH} characters.`);
  }
  if (mode === 'regex' && looksCatastrophic(pattern)) {
    return failedMatcher('Nested quantifier refused — this shape can backtrack catastrophically.');
  }

  let re;
  try {
    // 'g' is added only inside safeFindMatches; a sticky/global lastIndex on the
    // shared object would make consecutive test() calls disagree with each other.
    re = new RegExp(pattern, (flags ?? 'i').replace(/[gy]/g, ''));
  } catch (error) {
    return failedMatcher(error.message); // The engine's own message beats a paraphrase.
  }

  return {
    ok: true,
    empty: false,
    error: null,
    test(text) {
      const subject = String(text ?? '').slice(0, MAX_TEXT_LENGTH);
      try { return re.test(subject); } catch { return false; }
    },
    find(text) {
      return safeFindMatches(String(text ?? '').slice(0, MAX_TEXT_LENGTH), re);
    },
  };
}

function failedMatcher(message) {
  return { ok: false, empty: false, error: message, test: () => false, find: () => [] };
}

/**
 * All match ranges in `text`, with the two guards that matter: a zero-width
 * match advances lastIndex by hand (otherwise a pattern matching the empty
 * string loops forever — the single most common way a pattern tester hangs),
 * and the loop abandons on a time budget.
 */
function safeFindMatches(text, re) {
  const ranges = [];
  let global;
  try { global = new RegExp(re.source, re.flags + 'g'); } catch { return ranges; }
  const started = performance.now();
  let match;
  while ((match = global.exec(text)) !== null) {
    if (match[0].length === 0) {
      const unicode = global.unicode || global.flags.indexOf('v') !== -1;
      const next = unicode && text.codePointAt(global.lastIndex) > 0xffff ? global.lastIndex + 2 : global.lastIndex + 1;
      if (next === global.lastIndex || global.lastIndex >= text.length) break;
      global.lastIndex = Math.min(text.length, next);
    } // zero-width guard
    else ranges.push([match.index, match.index + match[0].length]);
    if (ranges.length >= MAX_MATCHES_PER_TEXT) break;
    if (performance.now() - started > MATCH_BUDGET_MS) break;
    if (global.lastIndex > text.length) break;
  }
  return ranges;
}

/** Wrap match ranges in <mark>, escaping everything else. */
function highlight(text, ranges) {
  if (!ranges.length) return escapeHtml(text);
  let out = '';
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start < cursor) continue; // ignore overlaps rather than nesting marks
    out += escapeHtml(text.slice(cursor, start));
    out += `<mark>${escapeHtml(text.slice(start, end))}</mark>`;
    cursor = end;
  }
  return out + escapeHtml(text.slice(cursor));
}

/* ========================================================================== *
 * 5. Icons — inline SVG, because no icon font may be loaded
 * ========================================================================== */

const ICON_PATHS = {
  overview:   '<path d="M3.2 10.4 12 3.2l8.8 7.2V20a1 1 0 0 1-1 1h-4.6v-6H8.8v6H4.2a1 1 0 0 1-1-1z"/>',
  features:   '<rect x="3.8" y="3.8" width="6.4" height="6.4" rx="1.6"/><rect x="13.8" y="3.8" width="6.4" height="6.4" rx="1.6"/><rect x="3.8" y="13.8" width="6.4" height="6.4" rx="1.6"/><rect x="13.8" y="13.8" width="6.4" height="6.4" rx="1.6"/>',
  install:    '<path d="M12 3.5v11"/><path d="M7.8 10.4 12 14.6l4.2-4.2"/><path d="M4.2 20.2h15.6"/>',
  building:   '<path d="m12 3.2 8 4v9.6l-8 4-8-4V7.2z"/><path d="m4 7.2 8 4 8-4"/><path d="M12 11.2v9.6"/>',
  verifying:  '<circle cx="12" cy="12" r="8.6"/><path d="m8.2 12.2 2.6 2.6 5-5.4"/>',
  standards:  '<path d="M4 6.4h8.4M4 12h8.4M4 17.6h8.4"/><path d="m16 5.6 1.6 1.6 3-3"/><path d="m16 16.4 1.6 1.6 3-3"/>',
  releases:   '<path d="M11.4 3.8H4.6a.8.8 0 0 0-.8.8v6.8l8.6 8.6a.8.8 0 0 0 1.2 0l6.6-6.6a.8.8 0 0 0 0-1.2z"/><circle cx="8.2" cy="8.2" r="1.5"/>',
  docs:       '<path d="M5.6 4.2h7.6l4.4 4.4v11a.8.8 0 0 1-.8.8H5.6a.8.8 0 0 1-.8-.8V5a.8.8 0 0 1 .8-.8z"/><path d="M13 4.4v4.4h4.4"/><path d="M8.2 13.4h7M8.2 16.6h4.6"/>',
  provenance: '<path d="M3.6 12a8.4 8.4 0 1 0 2.5-6"/><path d="M3.2 3.8v4.4h4.4"/><path d="M12 7.8v4.6l3.2 1.9"/>',
  settings:   '<path d="M3.6 7.4h9.2M17.6 7.4h2.8M3.6 16.6h2.8M11 16.6h9.4"/><circle cx="15.2" cy="7.4" r="2.6"/><circle cx="8.6" cy="16.6" r="2.6"/>',
  more:       '<circle cx="5" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.8" fill="currentColor" stroke="none"/>',
  search:     '<circle cx="10.8" cy="10.8" r="6.4"/><path d="m15.6 15.6 4.4 4.4"/>',
  pin:        '<path d="M14.2 3.4h-4.4v5.8l-3 3v2.2h4.4v6.6h1.6v-6.6h4.4v-2.2l-3-3z"/>',
  builder:    '<path d="M4.4 12h3.2M16.4 12h3.2"/><path d="m9.6 6.4 4.8 11.2"/><circle cx="12" cy="12" r="2.4"/>',
  close:      '<path d="m6.4 6.4 11.2 11.2M17.6 6.4 6.4 17.6"/>',
  chevronL:   '<path d="m14.4 5.6-6.4 6.4 6.4 6.4"/>',
  chevronR:   '<path d="m9.6 5.6 6.4 6.4-6.4 6.4"/>',
};

/**
 * Build an inline SVG icon. `filled` thickens the stroke for the active tab —
 * the Material Symbols FILL variation axis has no SVG equivalent, so weight
 * stands in for it. The icon is aria-hidden because every control that uses one
 * carries its own accessible name.
 */
function icon(name, { size = 16, filled = false } = {}) {
  const paths = ICON_PATHS[name] ?? ICON_PATHS.features;
  const svg = el('span', { class: 'md-tab-icon', 'aria-hidden': 'true' });
  svg.innerHTML =
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" ` +
    `stroke="currentColor" stroke-width="${filled ? 2.15 : 1.7}" ` +
    `stroke-linecap="round" stroke-linejoin="round" focusable="false">${paths}</svg>`;
  return svg;
}

/* ========================================================================== *
 * 6. Styles
 * ========================================================================== */

/*
 * Injected as the FIRST child of <head> so anything authored in app.css wins on
 * equal specificity. Everything is expressed in M3 tokens with a literal
 * fallback, so the strip is still correct if tokens.css has not loaded.
 */
const STYLE_ID = 'md-tabs-style';
const STYLES = `
.md-tabs{
  --md-tabs-strip-h:42px; --md-tabs-tab-h:36px;
  display:flex; align-items:flex-end; gap:8px;
  min-height:var(--md-tabs-strip-h); padding:0 8px;
  background:var(--md-sys-color-surface-container,#FCEAE4);
  border-bottom:1px solid var(--md-sys-color-outline-variant,#D8C2BB);
  position:relative; user-select:none;
}
.md-tabs__strip{
  flex:1 1 auto; min-width:0; display:flex; align-items:flex-end; gap:2px;
  overflow:visible; scrollbar-width:thin;
}
/* Last-resort escape hatch: if even the pinned and active tabs cannot fit, the
   strip scrolls rather than clipping a tab out of existence. */
.md-tabs__strip[data-cramped="true"]{ overflow-x:auto; overflow-y:hidden; }
.md-tabs__actions{ flex:0 0 auto; display:flex; align-items:center; gap:2px; padding-bottom:3px; }

.md-tab{
  position:relative; flex:0 0 auto; display:inline-flex; align-items:center; gap:8px;
  height:var(--md-tabs-tab-h); max-width:260px; padding:0 12px 0 14px;
  border:0; background:transparent; cursor:pointer;
  font-family:inherit; font-size:13px; font-weight:500; line-height:1;
  color:var(--md-sys-color-on-surface-variant,#53433E);
  border-radius:var(--md-sys-shape-corner-m,12px) var(--md-sys-shape-corner-m,12px) 0 0;
  transition:background 180ms var(--md-sys-motion-emphasized,cubic-bezier(.2,0,0,1)),
             color 180ms var(--md-sys-motion-emphasized,cubic-bezier(.2,0,0,1));
}
/* Every rule below sets a display value, which beats the user-agent's
   [hidden] { display:none } on equal specificity. Anything this module hides
   with the hidden attribute therefore needs saying again, explicitly, or it
   stays on screen — a closed popover that still paints is indistinguishable
   from a broken one. (No backticks in here: this block is a template literal.) */
.md-tab[hidden],
.md-tab__alt[hidden],
.md-tab__pin[hidden],
.md-tabs__btn[hidden],
.md-field__btn[hidden],
.md-pop[hidden]{ display:none !important; }
.md-tab:hover{ background:var(--ripple,rgba(0,0,0,.08)); }
.md-tab[aria-selected="true"]{
  background:var(--md-sys-color-surface,#FFF8F6);
  color:var(--md-sys-color-on-surface,#221A17);
}
/* The M3 active indicator. Kept as a real element edge rather than a shadow so
   it survives forced-colours mode. */
.md-tab[aria-selected="true"]::after{
  content:""; position:absolute; left:10px; right:10px; bottom:0; height:3px;
  border-radius:var(--md-sys-shape-corner-full,9999px) var(--md-sys-shape-corner-full,9999px) 0 0;
  background:var(--md-sys-color-primary,#8F4C34);
}
.md-tab:focus-visible{
  outline:3px solid var(--md-sys-color-primary,#8F4C34); outline-offset:-3px;
}
.md-tab__label{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.md-tab__alt{
  font-size:11px; font-weight:400; opacity:.72;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.md-tab__pin{ flex:0 0 auto; opacity:.75; }
/* Compact form for pinned tabs when the strip runs out of room. The label is
   removed visually only — aria-label and title still carry the full name. */
.md-tab[data-compact="true"]{ padding:0 10px; max-width:none; }
.md-tab[data-compact="true"] .md-tab__label,
.md-tab[data-compact="true"] .md-tab__alt{
  position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%);
}
.md-tab[data-dragging="true"]{ opacity:.45; }
.md-tab[data-drop="before"]{ box-shadow:inset 3px 0 0 0 var(--md-sys-color-primary,#8F4C34); }
.md-tab[data-drop="after"]{ box-shadow:inset -3px 0 0 0 var(--md-sys-color-primary,#8F4C34); }

.md-tabs__btn{
  flex:0 0 auto; display:inline-flex; align-items:center; justify-content:center; gap:6px;
  height:32px; min-width:32px; padding:0 8px; border:0; cursor:pointer;
  background:transparent; color:var(--md-sys-color-on-surface-variant,#53433E);
  border-radius:var(--md-sys-shape-corner-full,9999px);
  font-family:inherit; font-size:12px; font-weight:600;
  transition:background 180ms var(--md-sys-motion-emphasized,cubic-bezier(.2,0,0,1));
}
.md-tabs__btn:hover{ background:var(--ripple,rgba(0,0,0,.08)); }
.md-tabs__btn:focus-visible{ outline:3px solid var(--md-sys-color-primary,#8F4C34); outline-offset:2px; }
.md-tabs__btn[aria-pressed="true"],.md-tabs__btn[aria-expanded="true"]{
  background:var(--md-sys-color-secondary-container,#FFDBCF);
  color:var(--md-sys-color-on-secondary-container,#2C160D);
}
.md-tabs__count{
  min-width:16px; height:16px; padding:0 4px; border-radius:var(--md-sys-shape-corner-full,9999px);
  background:var(--md-sys-color-primary,#8F4C34); color:var(--md-sys-color-on-primary,#fff);
  font-size:10px; font-weight:700; display:inline-flex; align-items:center; justify-content:center;
}

/* --- Overlays: every popover paints its own surface, is bounded by the
   viewport, and scrolls internally rather than hiding its overflow. --- */
/* z-index 50 is deliberate: regex.js draws its builder at 60, and a builder
   opened from a field inside one of these popovers has to sit above it. ui.js
   owns 9000+ for toasts, the drawer and the palette, which cover everything. */
.md-pop{
  position:fixed; z-index:50; display:flex; flex-direction:column;
  min-width:280px; max-width:min(440px,calc(100vw - 24px));
  max-height:min(60vh,520px); overflow:hidden;
  background:var(--md-sys-color-surface-container-high,#F6E4DE);
  color:var(--md-sys-color-on-surface,#221A17);
  border:1px solid var(--md-sys-color-outline-variant,#D8C2BB);
  border-radius:var(--md-sys-shape-corner-l,16px);
  box-shadow:0 12px 28px rgba(0,0,0,.16);
  animation:md-tabs-pop 160ms var(--md-sys-motion-emphasized-decel,cubic-bezier(.05,.7,.1,1)) both;
}
@keyframes md-tabs-pop{ from{ opacity:0; transform:translateY(-6px) scale(.99);} to{ opacity:1; transform:none; } }
.md-pop__head{ flex:0 0 auto; padding:10px 12px 6px; display:flex; flex-direction:column; gap:8px; }
.md-pop__body{ flex:1 1 auto; min-height:0; overflow-y:auto; padding:4px 6px 8px; }
.md-pop__note{
  padding:6px 12px 10px; font-size:11px; line-height:1.45;
  color:var(--md-sys-color-on-surface-variant,#53433E);
}
.md-pop__note[data-error="true"]{ color:var(--md-sys-color-error,#BA1A1A); font-weight:600; }

.md-field{
  display:flex; align-items:center; gap:4px; height:40px; padding:0 4px 0 12px;
  background:var(--md-sys-color-surface-container-highest,#F1DED8);
  border-radius:var(--md-sys-shape-corner-full,9999px);
}
.md-field:focus-within{ outline:2px solid var(--md-sys-color-primary,#8F4C34); outline-offset:1px; }
.md-field input{
  flex:1 1 auto; min-width:0; height:36px; border:0; background:transparent;
  font-family:inherit; font-size:13px; color:inherit; outline:none;
}
.md-field__mono{ font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
.md-field__btn{
  flex:0 0 auto; width:32px; height:32px; display:inline-flex; align-items:center;
  justify-content:center; border:0; cursor:pointer; background:transparent; color:inherit;
  border-radius:var(--md-sys-shape-corner-full,9999px);
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:11px; font-weight:700;
}
.md-field__btn:hover{ background:var(--ripple,rgba(0,0,0,.08)); }
.md-field__btn[aria-pressed="true"]{
  background:var(--md-sys-color-primary,#8F4C34); color:var(--md-sys-color-on-primary,#fff);
}
.md-field__btn:focus-visible{ outline:2px solid var(--md-sys-color-primary,#8F4C34); outline-offset:2px; }

.md-pop__row{
  display:flex; align-items:center; gap:2px; width:100%; padding:2px;
  border-radius:var(--md-sys-shape-corner-s,8px);
}
.md-pop__row:hover{ background:var(--ripple,rgba(0,0,0,.08)); }
.md-pop__pick{
  flex:1 1 auto; min-width:0; display:flex; align-items:center; gap:10px;
  padding:8px 10px; border:0; background:transparent; cursor:pointer; text-align:left;
  font-family:inherit; font-size:13px; color:inherit;
  border-radius:var(--md-sys-shape-corner-s,8px);
}
.md-pop__pick:focus-visible,.md-pop__mini:focus-visible{
  outline:2px solid var(--md-sys-color-primary,#8F4C34); outline-offset:-2px;
}
.md-pop__name{ display:flex; flex-direction:column; gap:2px; min-width:0; }
.md-pop__name b{ font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.md-pop__meta{ font-size:11px; color:var(--md-sys-color-on-surface-variant,#53433E); }
.md-pop__pick mark{
  background:var(--md-sys-color-tertiary-container,#F5E0A7);
  color:var(--md-sys-color-on-tertiary-container,#231B00);
  border-radius:3px; padding:0 1px;
}
.md-pop__mini{
  flex:0 0 auto; width:32px; height:32px; display:inline-flex; align-items:center;
  justify-content:center; border:0; cursor:pointer; background:transparent; color:inherit;
  border-radius:var(--md-sys-shape-corner-full,9999px);
}
.md-pop__mini:hover{ background:var(--ripple,rgba(0,0,0,.08)); }
.md-pop__mini[aria-pressed="true"]{ color:var(--md-sys-color-primary,#8F4C34); }
.md-pop__empty{
  padding:18px 14px; font-size:13px; line-height:1.5;
  color:var(--md-sys-color-on-surface-variant,#53433E);
}
.md-pop__shortcut{
  margin-left:auto; padding-left:16px; flex:0 0 auto;
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:11px;
  color:var(--md-sys-color-on-surface-variant,#53433E);
}

/* --- Panels --- */
[data-tab-panel][hidden]{ display:none !important; }
.md-panel--highlight{
  animation:md-tabs-target 1400ms var(--md-sys-motion-emphasized,cubic-bezier(.2,0,0,1)) both;
}
@keyframes md-tabs-target{
  0%,70%{ box-shadow:inset 0 0 0 3px var(--md-sys-color-primary,#8F4C34); }
  100%{ box-shadow:inset 0 0 0 3px transparent; }
}

.md-tabs__live{
  position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%);
  white-space:nowrap;
}

@media (prefers-reduced-motion: reduce){
  .md-tab,.md-tabs__btn,.md-pop,.md-panel--highlight{ transition:none !important; animation:none !important; }
  /* The target highlight still needs to be *visible*, just not animated. */
  .md-panel--highlight{ box-shadow:inset 0 0 0 3px var(--md-sys-color-primary,#8F4C34); }
}
@media (forced-colors: active){
  .md-tab[aria-selected="true"]{ border-bottom:3px solid Highlight; }
  .md-pop{ border:1px solid CanvasText; }
}
`;

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = el('style', { id: STYLE_ID, text: STYLES });
  document.head.prepend(style); // first, so authored CSS overrides it
}

/* ========================================================================== *
 * 7. A search field — one independent state object per field
 * ========================================================================== */

/**
 * Build a search field with its OWN query, mode, flags and validation state,
 * plus its own anchored builder trigger. Three of these exist on this strip (the
 * tab-list search, the overflow filter and the context-menu filter) and none of
 * them shares a byte of state with the others.
 */
function createSearchField({ owner, placeholder, onChange, compact = false }) {
  const input = el('input', {
    type: 'search',
    id: `md-tabs-search-${owner}`, // stable id, so regex.js can persist per field
    placeholder,
    'aria-label': placeholder,
    autocomplete: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
  });

  // Both controls are created here and handed to regex.js, so the builder lives
  // inside this field's own pill instead of being injected after it.
  const modeToggle = el('button', {
    type: 'button',
    class: 'md-field__btn',
    'aria-pressed': 'false',
    title: `${chrome('regexOn')} — ${chrome('engineNote')}`,
    'aria-label': chrome('regexOn'),
    text: '.*',
  });
  const builderBtn = el('button', {
    type: 'button',
    class: 'md-field__btn',
    'aria-haspopup': 'dialog',
    'aria-expanded': 'false',
    title: chrome('builder'),
    'aria-label': chrome('builder'),
    hidden: true, // shown only once a builder is actually attached
  }, icon('builder', { size: 16 }));

  const field = el('div', { class: 'md-field' }, input, modeToggle, builderBtn);
  if (compact) field.style.height = '36px';

  /** Set when regex.js is wired; null when this field is on the fallback engine. */
  let controller = null;
  /** Only used on the fallback path — regex.js owns the mode when attached. */
  let fallbackMode = 'text';

  const api = {
    el: field,
    input,
    owner,
    dialect: REGEX_DIALECT,
    getQuery: () => input.value,
    getMode: () => (controller ? controller.getState().mode : fallbackMode),
    focus() { input.focus(); input.select?.(); },
    setQuery(value, { silent = false } = {}) {
      input.value = String(value ?? '');
      if (!silent) onChange?.(api);
    },

    /**
     * The predicate this field's search should run, normalised across both
     * engines into { ok, empty, error, test }.
     */
    matcher() {
      if (controller) {
        const state = controller.getState();
        const fn = controller.matcher();
        fn.reset?.(); // a fresh time budget for each pass over the list
        return {
          ok: state.valid && fn.isUsable(),
          empty: !input.value,
          error: state.error || null,
          test: (text) => fn(text),
        };
      }
      const fallback = createTabMatcher({ query: input.value, mode: fallbackMode, flags: 'i' });
      return { ok: fallback.ok, empty: fallback.empty, error: fallback.error, test: fallback.test };
    },

    /** Evaluate one visible tab label through the field's worker-backed controller. */
    evaluateText(text) {
      if (controller) {
        return controller.evaluateText(text).then((result) => ({
          ok: Boolean(result.ok),
          matched: Boolean(result.ok && Array.isArray(result.matches) && result.matches.length),
          timedOut: Boolean(result.timedOut),
          truncated: Boolean(result.truncated),
          refused: result.error === 'HIGH_RISK_PATTERN',
          ranges: result.ranges || [],
          error: result.error || null,
        }));
      }
      const fallback = createTabMatcher({ query: input.value, mode: fallbackMode, flags: 'i' });
      return Promise.resolve({
        ok: fallback.ok,
        matched: Boolean(fallback.ok && fallback.test(text)),
        timedOut: false,
        truncated: false,
        refused: !fallback.ok,
        ranges: fallback.ok ? fallback.find(String(text ?? '').slice(0, MAX_TEXT_LENGTH)) : [],
        error: fallback.error || null,
      });
    },

    /**
     * Match ranges for highlighting. regex.js's matcher is a boolean predicate,
     * so the ranges are computed here from the pattern and flags it reports —
     * the same source, so the highlight can never disagree with the filter.
     */
    ranges(text) {
      if (controller) return [];
      const fallback = createTabMatcher({ query: input.value, mode: fallbackMode, flags: 'i' });
      return fallback.ok ? fallback.find(String(text ?? '').slice(0, MAX_TEXT_LENGTH)) : [];
    },

    destroy() {
      integrationWaiters.delete(refreshBuilder);
      try { controller?.destroy?.(); } catch { /* already gone */ }
      controller = null;
    },
  };

  input.addEventListener('input', () => onChange?.(api));

  // Fallback mode toggle. regex.js takes this element over when it attaches, so
  // this listener only ever does anything on the fallback path.
  modeToggle.addEventListener('click', () => {
    if (controller) return;
    fallbackMode = fallbackMode === 'regex' ? 'text' : 'regex';
    modeToggle.setAttribute('aria-pressed', String(fallbackMode === 'regex'));
    input.focus();
    onChange?.(api);
  });

  function refreshBuilder() {
    const attach = resolveRegexAttach();
    if (!attach || controller) return;
    try {
      controller = attach(input, {
        key: `tabs.${owner}`,   // per-field persistence under its own key
        trigger: builderBtn,
        modeToggle,
        onChange: () => onChange?.(api),
      });
      builderBtn.hidden = false;
    } catch (error) {
      // A builder that cannot attach leaves an affordance that opens nothing,
      // so the button stays hidden rather than becoming a dead control.
      console.warn('[tabs] regex builder failed to attach', error);
      controller = null;
      builderBtn.hidden = true;
    }
  }
  refreshBuilder();
  integrationWaiters.add(refreshBuilder);

  return api;
}

/* ========================================================================== *
 * 8. Popover plumbing
 * ========================================================================== */

/**
 * A non-modal popover anchored to `trigger`, bounded by the viewport, closing on
 * Escape, on an outside click, and on focus leaving. Focus returns to the
 * trigger, which is what docs/standards/regex-builder.md requires of every
 * surface opened from a field.
 */
function createPopover({ trigger, role = 'dialog', label, onOpen, onClose, returnFocusTo }) {
  const panel = el('div', {
    class: 'md-pop',
    role,
    'aria-label': label,
    hidden: true,
  });
  document.body.append(panel);

  let open = false;

  function position() {
    const rect = trigger.getBoundingClientRect();
    panel.style.visibility = 'hidden';
    panel.hidden = false;
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const margin = 8;

    // Prefer below-and-left-aligned; flip and shift only to stay on screen.
    let left = rect.left;
    if (left + width > window.innerWidth - margin) left = window.innerWidth - width - margin;
    if (left < margin) left = margin;

    let top = rect.bottom + 6;
    if (top + height > window.innerHeight - margin) {
      const above = rect.top - height - 6;
      top = above >= margin ? above : Math.max(margin, window.innerHeight - height - margin);
    }
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
    panel.style.visibility = '';
  }

  function onDocPointer(event) {
    if (!open) return;
    if (panel.contains(event.target) || trigger.contains(event.target)) return;
    // The pattern builder renders its own popover as a sibling on <body>, so a
    // click inside it is not an "outside" click as far as this popover is
    // concerned — closing here would tear down the field being edited.
    if (event.target instanceof Element && event.target.closest('.mdrx-pop')) return;
    api.close();
  }
  function onKey(event) {
    if (!open || event.key !== 'Escape') return;
    // This listener is on the capture phase, so it would otherwise swallow the
    // Escape that closes the pattern builder stacked on top of this popover.
    // The builder gets first refusal on its own key.
    if (event.target instanceof Element && event.target.closest('.mdrx-pop')) return;
    event.stopPropagation();
    api.close();
  }
  function onViewportChange() { if (open) position(); }

  const api = {
    panel,
    get isOpen() { return open; },
    open() {
      if (open) return;
      open = true;
      panel.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      onOpen?.();
      position();
      document.addEventListener('pointerdown', onDocPointer, true);
      document.addEventListener('keydown', onKey, true);
      window.addEventListener('resize', onViewportChange);
      window.addEventListener('scroll', onViewportChange, true);
    },
    close({ restoreFocus = true } = {}) {
      if (!open) return;
      open = false;
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', onDocPointer, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
      onClose?.();
      // Focus returns to the field or control the popover was opened from —
      // required of every surface opened from a search field. `returnFocusTo`
      // exists because the context menu's trigger is an invisible anchor parked
      // at the pointer, which would be a black hole to focus.
      const target = (typeof returnFocusTo === 'function' ? returnFocusTo() : null) ?? trigger;
      if (restoreFocus && target?.isConnected) target.focus();
    },
    toggle() { open ? api.close() : api.open(); },
    reposition: position,
    destroy() { api.close({ restoreFocus: false }); panel.remove(); },
  };
  return api;
}

/* ========================================================================== *
 * 9. The tab strip
 * ========================================================================== */

class TabStrip {
  constructor(options = {}) {
    this.options = options;
    this.emitter = createEmitter();
    this.definitions = new Map();
    this.nodes = new Map();
    this.panels = new Map();
    this.order = [];
    this.pinned = new Set();
    this.activeId = null;
    this.hiddenIds = [];
    this.dragId = null;
    this.relayoutQueued = false;
    this.destroyed = false;

    const source = options.tabs ?? DEFAULT_TABS;
    for (const tab of source) this.definitions.set(tab.id, { ...tab });
    this.order = source.map((tab) => tab.id);

    injectStyles();
    this.#buildChrome();
    this.#restore();
    this.#findPanels();
    this.render();
    this.#bindGlobal();

    // Deep links: a hash naming a tab wins over the stored active tab, so a
    // shared URL opens on the section it names. The initial activation is
    // silent — initTabs() has not returned yet, so nobody could have subscribed
    // to a 'change' event, and firing one that no listener can hear only makes
    // the event stream look like it dropped an entry. Read getActiveId() after
    // init instead.
    const fromHash = this.#tabFromHash();
    this.activate(fromHash ?? this.activeId ?? this.order[0], {
      store: false, focus: false, emitChange: false, hash: Boolean(fromHash),
    });

    probeIntegrations();
    integrationWaiters.add(this.onIntegrationChange = () => { if (!this.destroyed) this.render(); });
  }

  /* ---------------------------------------------------------------- chrome */

  #buildChrome() {
    const mount = this.#resolveMount();
    this.root = mount;
    this.root.classList.add('md-tabs');

    // If the page shipped placeholder tab markup, remove it. Leaving it would
    // put two tablists and two sets of role="tab" elements on the page, which
    // breaks the ARIA relationships far more quietly than an empty strip would.
    const stale = mount.querySelectorAll('[role="tab"],[role="tablist"]');
    if (stale.length) {
      console.warn('[tabs] removing %d placeholder tab element(s) from the mount.', stale.length);
      for (const node of stale) node.remove();
    }

    this.strip = el('div', {
      class: 'md-tabs__strip',
      role: 'tablist',
      'aria-label': chrome('striplabel'),
      'aria-orientation': 'horizontal',
    });

    this.moreBtn = el('button', {
      type: 'button',
      class: 'md-tabs__btn',
      'aria-haspopup': 'dialog',
      'aria-expanded': 'false',
      dataset: { mdTabs: 'more' }, // stable hook: the label is translated
      hidden: true,
    }, icon('more', { size: 18 }), this.moreCount = el('span', { class: 'md-tabs__count', text: '0' }));

    this.findBtn = el('button', {
      type: 'button',
      class: 'md-tabs__btn',
      'aria-haspopup': 'dialog',
      'aria-expanded': 'false',
      dataset: { mdTabs: 'find' },
    }, icon('search', { size: 16 }));

    this.live = el('div', { class: 'md-tabs__live', role: 'status', 'aria-live': 'polite' });

    this.actions = el('div', { class: 'md-tabs__actions' }, this.moreBtn, this.findBtn);
    this.root.append(this.strip, this.actions, this.live);

    this.#buildOverflowPopover();
    this.#buildTabListPopover();
    this.#buildContextMenu();
  }

  /** Find, or failing that create, the element the strip lives in. */
  #resolveMount() {
    const given = this.options.mount;
    if (given instanceof HTMLElement) return given;
    if (typeof given === 'string') {
      const found = document.querySelector(given);
      if (found) return found;
    }
    for (const selector of ['#tab-strip', '[data-tabs-mount]', '.md-tabs']) {
      const found = document.querySelector(selector);
      if (found) return found;
    }
    console.warn('[tabs] no mount element found; creating one at the top of <body>.');
    const created = el('div', { id: 'tab-strip' });
    document.body.prepend(created);
    return created;
  }

  /* ------------------------------------------------------------ persistence */

  #restore() {
    let saved = null;
    try {
      const raw = store.read(TABS_STORAGE_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch {
      // Corrupt or hand-edited state must never stop the site from rendering.
      saved = null;
    }
    if (!saved || typeof saved !== 'object' || saved.v !== STORAGE_VERSION) return;

    // Stored ids that no longer exist are dropped; tabs added since the state
    // was written keep their default position relative to what remains.
    if (Array.isArray(saved.order)) {
      const known = saved.order.filter((id) => this.definitions.has(id));
      const missing = this.order.filter((id) => !known.includes(id));
      const merged = [...known];
      for (const id of missing) {
        const defaultIndex = this.order.indexOf(id);
        let insertAt = merged.length;
        for (let i = 0; i < merged.length; i += 1) {
          if (this.order.indexOf(merged[i]) > defaultIndex) { insertAt = i; break; }
        }
        merged.splice(insertAt, 0, id);
      }
      this.order = merged;
    }
    if (Array.isArray(saved.pinned)) {
      this.pinned = new Set(saved.pinned.filter((id) => this.definitions.has(id)));
    }
    if (typeof saved.active === 'string' && this.definitions.has(saved.active)) {
      this.activeId = saved.active;
    }
    this.#normalise();
  }

  #persist() {
    store.write(TABS_STORAGE_KEY, JSON.stringify({
      v: STORAGE_VERSION,
      order: this.order,
      pinned: [...this.pinned],
      active: this.activeId,
    }));
  }

  /** Invariant: pinned tabs occupy a stable region at the head of the order. */
  #normalise() {
    const pinned = this.order.filter((id) => this.pinned.has(id));
    const rest = this.order.filter((id) => !this.pinned.has(id));
    this.order = [...pinned, ...rest];
  }

  /* ---------------------------------------------------------------- panels */

  #findPanels() {
    for (const id of this.definitions.keys()) {
      const panel = document.querySelector(`[data-tab-panel="${CSS.escape(id)}"]`)
        ?? document.getElementById(`panel-${id}`)
        ?? document.getElementById(`tab-panel-${id}`);
      if (panel) this.registerPanel(id, panel);
    }
  }

  /** Adopt a panel element, wiring the ARIA relationship in both directions. */
  registerPanel(id, panel) {
    if (!this.definitions.has(id) || !(panel instanceof HTMLElement)) return;
    this.panels.set(id, panel);
    if (!panel.id) panel.id = `tab-panel-${id}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('tabindex', '0');
    panel.setAttribute('aria-labelledby', `tab-${id}`);
    panel.dataset.tabPanel = id;
    panel.hidden = id !== this.activeId;
    const node = this.nodes.get(id);
    if (node) node.setAttribute('aria-controls', panel.id);
  }

  /* ---------------------------------------------------------------- render */

  render() {
    if (this.destroyed) return;
    this.strip.setAttribute('aria-label', chrome('striplabel'));
    this.moreBtn.setAttribute('aria-label', chrome('more'));
    this.moreBtn.title = chrome('more');
    this.findBtn.setAttribute('aria-label', chrome('findTabs'));
    this.findBtn.title = chrome('findTabs');

    this.#normalise();
    for (const id of this.order) this.#renderTab(id);

    // DOM order is the visual order, so assistive technology and keyboard
    // navigation agree with what is on screen without any CSS `order` trickery.
    for (const id of this.order) this.strip.append(this.nodes.get(id));

    this.#layout();
  }

  #renderTab(id) {
    const def = this.definitions.get(id);
    const { primary, secondary, full } = labelFor(def);
    let node = this.nodes.get(id);

    if (!node) {
      node = el('button', {
        type: 'button',
        role: 'tab',
        id: `tab-${id}`,
        class: 'md-tab',
        draggable: 'true',
        dataset: { tabId: id },
      });
      node.append(
        el('span', { class: 'md-tab__icon-slot' }),
        el('span', { class: 'md-tab__label' }),
        el('span', { class: 'md-tab__alt' }),
        el('span', { class: 'md-tab__pin', hidden: true }, icon('pin', { size: 13 })),
      );
      this.#bindTab(node, id);
      this.nodes.set(id, node);
    }

    const selected = id === this.activeId;
    const iconSlot = node.querySelector('.md-tab__icon-slot');
    iconSlot.replaceChildren(icon(def.icon ?? 'features', { size: 16, filled: selected }));

    node.querySelector('.md-tab__label').textContent = primary;
    const alt = node.querySelector('.md-tab__alt');
    alt.textContent = secondary;
    alt.hidden = !secondary;
    node.querySelector('.md-tab__pin').hidden = !this.pinned.has(id);

    node.setAttribute('aria-selected', String(selected));
    node.setAttribute('tabindex', selected ? '0' : '-1'); // roving tabindex
    // The accessible name always carries the full label plus the pinned state,
    // so a compacted pinned tab is never anonymous.
    node.setAttribute('aria-label', this.pinned.has(id) ? `${full} — ${chrome('pinned')}` : full);
    node.title = full;
    const panel = this.panels.get(id);
    if (panel) node.setAttribute('aria-controls', panel.id);
    else node.removeAttribute('aria-controls');
  }

  /* ------------------------------------------------------- overflow layout */

  /**
   * Decide which tabs fit. Pinned tabs and the active tab are always shown;
   * everything that does not fit moves into the overflow menu. Nothing is ever
   * merely clipped — that is the failure docs/standards/tabs.md names first.
   */
  #layout() {
    if (this.dragId) return; // no reflow churn mid-drag

    const tabs = this.order.map((id) => this.nodes.get(id));
    // Measure with everything shown and uncompacted. This all happens inside one
    // task, so the browser never paints the intermediate state.
    for (const node of tabs) { node.hidden = false; node.dataset.compact = 'false'; }
    this.strip.dataset.cramped = 'false';
    this.moreBtn.hidden = true;

    const available = this.strip.clientWidth;
    const GAP = 2;
    const widths = new Map();
    for (const node of tabs) widths.set(node.dataset.tabId, node.offsetWidth);
    const total = tabs.reduce((sum, node) => sum + widths.get(node.dataset.tabId) + GAP, 0);

    if (total <= available) { this.#applyHidden([]); return; }

    // Something must give: reserve room for the overflow button.
    this.moreBtn.hidden = false;
    const reserve = this.moreBtn.offsetWidth + 8;
    let budget = available - reserve;

    const mustShow = this.order.filter((id) => this.pinned.has(id) || id === this.activeId);
    let mustWidth = mustShow.reduce((sum, id) => sum + widths.get(id) + GAP, 0);

    // Step two: compact the pinned tabs to icon-only if the required set alone
    // overflows. The full name survives in aria-label and title.
    if (mustWidth > budget) {
      for (const id of this.pinned) {
        const node = this.nodes.get(id);
        node.dataset.compact = 'true';
        widths.set(id, node.offsetWidth);
      }
      mustWidth = mustShow.reduce((sum, id) => sum + widths.get(id) + GAP, 0);
    }

    // Step three: if even that does not fit, let the strip scroll. Every tab is
    // still in the overflow menu, so nothing is unreachable either way.
    if (mustWidth > budget) {
      this.strip.dataset.cramped = 'true';
      this.#applyHidden(this.order.filter((id) => !mustShow.includes(id)));
      return;
    }

    let used = mustWidth;
    const hidden = [];
    for (const id of this.order) {
      if (mustShow.includes(id)) continue;
      const width = widths.get(id) + GAP;
      if (used + width <= budget) used += width;
      else hidden.push(id);
    }
    this.#applyHidden(hidden);
  }

  #applyHidden(hiddenIds) {
    this.hiddenIds = hiddenIds;
    for (const id of this.order) {
      const node = this.nodes.get(id);
      const isHidden = hiddenIds.includes(id);
      node.hidden = isHidden; // `hidden` also removes it from the a11y tree
    }
    this.moreBtn.hidden = hiddenIds.length === 0;
    this.moreCount.textContent = String(hiddenIds.length);
    this.moreBtn.setAttribute(
      'aria-label',
      `${chrome('more')} (${hiddenIds.length})`,
    );
    this.emitter.emit('overflow', { hiddenIds: [...hiddenIds] });
  }

  #queueLayout() {
    if (this.relayoutQueued) return;
    this.relayoutQueued = true;
    requestAnimationFrame(() => { this.relayoutQueued = false; this.#layout(); });
  }

  /* ------------------------------------------------------------ activation */

  /**
   * Show a tab. `highlight` briefly outlines the panel — the command palette
   * uses it so a user who teleported to a setting can see where they landed.
   */
  activate(id, {
    focus = false, highlight = false, store: shouldStore = true,
    hash = true, emitChange = true,
  } = {}) {
    if (!this.definitions.has(id)) return false;
    const previousId = this.activeId;
    this.activeId = id;

    for (const [tabId, node] of this.nodes) {
      const selected = tabId === id;
      node.setAttribute('aria-selected', String(selected));
      node.setAttribute('tabindex', selected ? '0' : '-1');
      const def = this.definitions.get(tabId);
      node.querySelector('.md-tab__icon-slot')
        .replaceChildren(icon(def.icon ?? 'features', { size: 16, filled: selected }));
    }
    for (const [panelId, panel] of this.panels) panel.hidden = panelId !== id;

    if (focus) this.nodes.get(id)?.focus();
    if (shouldStore) this.#persist();
    if (hash && this.options.useHash !== false) {
      // replaceState keeps the back button meaning "the previous page", not
      // "the previous tab" — eight entries deep after a browse is worse.
      try { history.replaceState(null, '', `#${id}`); } catch { /* file:// */ }
    }
    this.#queueLayout();

    if (highlight) this.#highlightPanel(id);
    if (emitChange && previousId !== id) this.emitter.emit('change', { id, previousId });
    return true;
  }

  #highlightPanel(id) {
    const panel = this.panels.get(id);
    if (!panel) return;
    panel.classList.remove('md-panel--highlight');
    void panel.offsetWidth; // restart the animation
    panel.classList.add('md-panel--highlight');
    const clear = () => panel.classList.remove('md-panel--highlight');
    if (prefersReducedMotion()) setTimeout(clear, 1400);
    else panel.addEventListener('animationend', clear, { once: true });
  }

  #tabFromHash() {
    let raw = (location.hash || '').replace(/^#/, '');
    // A malformed escape such as "#%" throws out of decodeURIComponent; a bad
    // hash must not stop the strip from initialising.
    try { raw = decodeURIComponent(raw); } catch { /* use the raw form */ }
    // A hash that names an in-page heading rather than a tab is left alone.
    return this.definitions.has(raw) ? raw : null;
  }

  /* -------------------------------------------------------- pin and reorder */

  togglePin(id) { return this.setPinned(id, !this.pinned.has(id)); }

  setPinned(id, pinned) {
    if (!this.definitions.has(id)) return false;
    if (pinned) this.pinned.add(id); else this.pinned.delete(id);
    this.#normalise();
    this.#persist();
    this.render();
    // A toast and a live-region announcement would speak the same sentence
    // twice, so the live region is the fallback for when no toast system is
    // wired — never both at once.
    const message = `${labelFor(this.definitions.get(id)).full} — ${pinned ? chrome('pinned') : chrome('unpin')}`;
    if (typeof this.options.notify === 'function') this.options.notify(message, { kind: 'info' });
    else this.#announce(message);
    this.emitter.emit('pinchange', { id, pinned });
    this.emitter.emit('order', { order: [...this.order], pinned: [...this.pinned] });
    return true;
  }

  /**
   * Move a tab one place. Crossing the pinned boundary toggles its pinned state
   * rather than silently snapping it back, which is what the normalisation
   * invariant would otherwise do and would read as the move having failed.
   */
  moveTab(id, delta) {
    const from = this.order.indexOf(id);
    if (from < 0) return false;
    const to = from + Math.sign(delta);
    if (to < 0 || to >= this.order.length) return false;

    const neighbour = this.order[to];
    if (this.pinned.has(id) !== this.pinned.has(neighbour)) {
      return this.setPinned(id, !this.pinned.has(id));
    }
    this.order.splice(from, 1);
    this.order.splice(to, 0, id);
    this.#normalise();
    this.#persist();
    this.render();
    this.#announce(
      `${labelFor(this.definitions.get(id)).full} — ${this.order.indexOf(id) + 1} / ${this.order.length}`,
    );
    this.emitter.emit('order', { order: [...this.order], pinned: [...this.pinned] });
    return true;
  }

  /** Drop `id` immediately before `beforeId` (or at the end when null). */
  #moveBefore(id, beforeId) {
    const from = this.order.indexOf(id);
    if (from < 0) return;
    const wasPinned = this.pinned.has(id);
    this.order.splice(from, 1);
    const index = beforeId ? this.order.indexOf(beforeId) : this.order.length;
    const insertAt = index < 0 ? this.order.length : index;

    // Pin state follows the drop position, but only when a pinned region exists
    // to drop into. With nothing pinned, dragging can never pin by accident.
    const pinnedCount = this.order.filter((tabId) => this.pinned.has(tabId)).length;
    let nowPinned = wasPinned;
    if (pinnedCount > 0) {
      if (insertAt < pinnedCount) nowPinned = true;
      else if (insertAt > pinnedCount) nowPinned = false;
    }
    this.order.splice(insertAt, 0, id);
    if (nowPinned) this.pinned.add(id); else this.pinned.delete(id);

    this.#normalise();
    this.#persist();
    this.render();
    if (nowPinned !== wasPinned) {
      this.#announce(`${labelFor(this.definitions.get(id)).full} — ${nowPinned ? chrome('pinned') : chrome('unpin')}`);
    }
    this.emitter.emit('order', { order: [...this.order], pinned: [...this.pinned] });
  }

  #announce(message) {
    this.live.textContent = '';
    // A fresh text node in the next frame is what makes a live region re-announce
    // the same string twice.
    requestAnimationFrame(() => { this.live.textContent = message; });
  }

  /* ------------------------------------------------------------- behaviour */

  #bindTab(node, id) {
    node.addEventListener('click', () => this.activate(id, { focus: true }));

    node.addEventListener('keydown', (event) => {
      const visible = this.order.filter((tabId) => !this.nodes.get(tabId).hidden);
      const index = visible.indexOf(id);

      // Ctrl/Cmd + arrows reorder; bare arrows navigate. Both are required —
      // reordering must not be drag-only.
      if ((event.ctrlKey || event.metaKey) && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault();
        if (this.moveTab(id, event.key === 'ArrowRight' ? 1 : -1)) this.nodes.get(id).focus();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        this.togglePin(id);
        this.nodes.get(id)?.focus();
        return;
      }

      let nextId = null;
      switch (event.key) {
        case 'ArrowLeft':  nextId = visible[(index - 1 + visible.length) % visible.length]; break;
        case 'ArrowRight': nextId = visible[(index + 1) % visible.length]; break;
        case 'Home':       nextId = visible[0]; break;
        case 'End':        nextId = visible[visible.length - 1]; break;
        case 'Enter':
        case ' ':          event.preventDefault(); this.activate(id, { focus: true }); return;
        case 'F10':
          if (event.shiftKey) { event.preventDefault(); this.#openContextMenu(node, id); }
          return;
        case 'ContextMenu': event.preventDefault(); this.#openContextMenu(node, id); return;
        default: return;
      }
      if (!nextId) return;
      event.preventDefault();
      // Automatic activation: the panels are static markup, so following focus
      // costs nothing and matches what the APG recommends for cheap panels.
      this.activate(nextId, { focus: true });
    });

    node.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      this.#openContextMenu(node, id, { x: event.clientX, y: event.clientY });
    });

    /* --- drag reordering --- */
    node.addEventListener('dragstart', (event) => {
      this.dragId = id;
      node.dataset.dragging = 'true';
      event.dataTransfer.effectAllowed = 'move';
      try { event.dataTransfer.setData('text/plain', id); } catch { /* Safari */ }
    });
    node.addEventListener('dragend', () => {
      this.dragId = null;
      node.dataset.dragging = 'false';
      this.#clearDropMarkers();
      this.#queueLayout();
    });
    node.addEventListener('dragover', (event) => {
      if (!this.dragId || this.dragId === id) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const rect = node.getBoundingClientRect();
      const after = event.clientX > rect.left + rect.width / 2;
      this.#clearDropMarkers();
      node.dataset.drop = after ? 'after' : 'before';
    });
    node.addEventListener('dragleave', () => { delete node.dataset.drop; });
    node.addEventListener('drop', (event) => {
      if (!this.dragId) return;
      event.preventDefault();
      const after = node.dataset.drop === 'after';
      this.#clearDropMarkers();
      const dragged = this.dragId;
      this.dragId = null;
      if (dragged === id) return;
      const visible = this.order.filter((tabId) => !this.nodes.get(tabId).hidden);
      const position = visible.indexOf(id) + (after ? 1 : 0);
      this.#moveBefore(dragged, visible[position] ?? null);
      this.nodes.get(dragged)?.focus();
    });
  }

  #clearDropMarkers() {
    for (const node of this.nodes.values()) delete node.dataset.drop;
  }

  #bindGlobal() {
    // Observe the ROOT, not the strip. Hiding an overflowing tab changes the
    // strip's own content width, so observing the strip would re-enter layout
    // forever; the root's width is driven by the page and settles immediately.
    this.resizeObserver = new ResizeObserver(() => this.#queueLayout());
    this.resizeObserver.observe(this.root);

    this.onHashChange = () => {
      const id = this.#tabFromHash();
      if (id && id !== this.activeId) this.activate(id, { hash: false });
    };
    window.addEventListener('hashchange', this.onHashChange);

    this.moreBtn.addEventListener('click', () => this.#openOverflow());
    this.findBtn.addEventListener('click', () => this.openTabSearch());
  }

  /* --------------------------------------------------- overflow popover */

  #buildOverflowPopover() {
    this.overflowField = createSearchField({
      owner: 'tab-strip-overflow',
      placeholder: chrome('filterPlace'),
      compact: true,
      onChange: () => this.#renderOverflowList(),
    });
    this.overflowList = el('div', { class: 'md-pop__body', role: 'none' });
    this.overflowNote = el('p', { class: 'md-pop__note', text: chrome('hiddenNote') });

    this.overflowPop = createPopover({
      trigger: this.moreBtn,
      role: 'dialog',
      label: chrome('more'),
      onOpen: () => {
        this.#renderOverflowList();
        requestAnimationFrame(() => this.overflowField.focus());
      },
    });
    this.overflowPop.panel.append(
      el('div', { class: 'md-pop__head' }, this.overflowField.el),
      this.overflowList,
      this.overflowNote,
    );
  }

  #openOverflow() {
    this.overflowPop.toggle();
  }

  #renderOverflowList() {
    this.overflowNote.textContent = chrome('hiddenNote');
    this.overflowNote.dataset.error = 'false';
    this.overflowList.replaceChildren(
      ...this.#buildRows(this.hiddenIds, this.overflowField, this.overflowNote, { pop: this.overflowPop }),
    );
  }

  /* --------------------------------------------------- searchable tab list */

  #buildTabListPopover() {
    this.listField = createSearchField({
      owner: 'tab-strip-search',
      placeholder: chrome('searchPlace'),
      onChange: () => this.#renderTabList(),
    });
    this.listBody = el('div', { class: 'md-pop__body', role: 'none' });
    this.listNote = el('p', { class: 'md-pop__note' });

    this.listPop = createPopover({
      trigger: this.findBtn,
      role: 'dialog',
      label: chrome('findTabs'),
      onOpen: () => {
      this.#renderTabList();
        requestAnimationFrame(() => this.listField.focus());
      },
    });
    this.listPop.panel.append(
      el('div', { class: 'md-pop__head' }, this.listField.el),
      this.listBody,
      this.listNote,
    );
  }

  openTabSearch() {
    if (!this.listPop.isOpen) this.listPop.open();
    else this.listField.focus();
  }

  async #renderTabList() {
    this.listNote.textContent = chrome('engineNote');
    this.listNote.dataset.error = 'false';
    this.listBody.replaceChildren(
      ...(await this.#buildRows(this.order, this.listField, this.listNote, { pop: this.listPop, manage: true })),
    );
  }

  /**
   * Rows for a tab list. Results identify the tab's visible label, its pinned
   * state and whether the strip is currently hiding it, and offer the same
   * management actions without losing the active query.
   */
  async #buildRows(ids, field, note, { pop, manage = false } = {}) {
    const matcher = field.matcher();
    field.input.setAttribute('aria-invalid', String(!matcher.ok));
    // A controller may still be compiling or may have refused the pattern.
    // Let its worker result decide the visible state, rather than turning an
    // unresolved predicate into a definitive no-match message.

    const rows = [];
    const started = performance.now();
    let incomplete = false;
    for (const id of ids) {
      if (performance.now() - started > MATCH_BUDGET_MS * 4) {
        incomplete = true;
        break;
      }
      const def = this.definitions.get(id);
      const { full } = labelFor(def);
      let matchRanges = [];
      if (!matcher.empty) {
        const result = await field.evaluateText(full);
        if (!result.ok || result.refused) {
          note.textContent = result.timedOut
            ? chrome('timedOut')
            : result.truncated
              ? chrome('incomplete')
              : result.refused
                ? chrome('refused')
                : `${chrome('invalid')}: ${chrome('invalidDetail')}`;
          note.dataset.error = 'true';
          return [el('p', { class: 'md-pop__empty', text: note.textContent })];
        }
        if (result.timedOut || result.truncated) {
          note.textContent = result.timedOut ? chrome('timedOut') : chrome('incomplete');
          note.dataset.error = 'true';
          incomplete = true;
        }
        if (!result.matched) continue;
        matchRanges = result.ranges;
      }

      const isPinned = this.pinned.has(id);
      const isHiddenNow = this.hiddenIds.includes(id);
      const meta = [
        isPinned ? chrome('pinned') : null,
        isHiddenNow ? chrome('more') : null,
        id === this.activeId ? '●' : null,
      ].filter(Boolean).join(' · ');

      const name = el('span', { class: 'md-pop__name' });
      const strong = el('b');
      strong.innerHTML = matcher.empty ? escapeHtml(full) : highlight(full, matchRanges);
      name.append(strong);
      if (meta) name.append(el('span', { class: 'md-pop__meta', text: meta }));

      const pick = el('button', {
        type: 'button',
        class: 'md-pop__pick',
        onclick: () => { pop?.close({ restoreFocus: false }); this.activate(id, { focus: true, highlight: true }); },
      }, icon(def.icon ?? 'features', { size: 16 }), name);

      const row = el('div', { class: 'md-pop__row' }, pick);

      if (manage) {
        row.append(
          el('button', {
            type: 'button', class: 'md-pop__mini', 'aria-pressed': String(isPinned),
            title: isPinned ? chrome('unpin') : chrome('pin'),
            'aria-label': `${isPinned ? chrome('unpin') : chrome('pin')} — ${full}`,
            onclick: () => { this.togglePin(id); this.#renderTabList(); pop?.reposition(); },
          }, icon('pin', { size: 15 })),
          el('button', {
            type: 'button', class: 'md-pop__mini',
            title: chrome('moveLeft'), 'aria-label': `${chrome('moveLeft')} — ${full}`,
            onclick: () => { this.moveTab(id, -1); this.#renderTabList(); },
          }, icon('chevronL', { size: 15 })),
          el('button', {
            type: 'button', class: 'md-pop__mini',
            title: chrome('moveRight'), 'aria-label': `${chrome('moveRight')} — ${full}`,
            onclick: () => { this.moveTab(id, 1); this.#renderTabList(); },
          }, icon('chevronR', { size: 15 })),
        );
      }
      rows.push(row);
    }

    if (incomplete) {
      note.textContent = chrome('incomplete');
      note.dataset.error = 'true';
    }

    if (!rows.length) {
      // An honest no-match message naming what was filtered, never an empty box
      // that reads as a loading failure.
      return [el('p', { class: 'md-pop__empty', text: matcher.empty ? chrome('emptyQuery') : chrome('noMatch') })];
    }
    return rows;
  }

  /* ------------------------------------------------------- context menu */

  #buildContextMenu() {
    // Per the shared rules every context menu carries its own local filter, with
    // its own independent state and its own builder affordance.
    this.menuField = createSearchField({
      owner: 'tab-context-menu',
      placeholder: chrome('filterPlace'),
      compact: true,
      onChange: () => this.#renderContextMenu(),
    });
    this.menuBody = el('div', { class: 'md-pop__body', role: 'none' });
    this.menuAnchor = el('span', { tabindex: '-1' }); // repositioned per invocation
    this.menuTargetId = null;

    // role="dialog", not role="menu". A menu's children must be menu items, and
    // this surface carries a filter field as well — a malformed menu is worse
    // for assistive technology than an honestly-labelled small dialog.
    this.menuPop = createPopover({
      trigger: this.menuAnchor,
      role: 'dialog',
      label: chrome('tabActions'),
      onOpen: () => {
      void this.#renderContextMenu();
        requestAnimationFrame(() => this.menuField.focus());
      },
      returnFocusTo: () => this.nodes.get(this.menuTargetId),
    });
    this.menuPop.panel.style.minWidth = '260px';
    this.menuPop.panel.append(
      el('div', { class: 'md-pop__head' }, this.menuField.el),
      this.menuBody,
    );
  }

  #openContextMenu(node, id, point) {
    this.menuTargetId = id;
    // The popover positions against its trigger's rect, so park a zero-size
    // anchor at the pointer (or at the tab, for the keyboard route).
    const rect = node.getBoundingClientRect();
    Object.assign(this.menuAnchor.style, {
      position: 'fixed',
      left: `${point ? point.x : rect.left + 12}px`,
      top: `${point ? point.y : rect.bottom - 4}px`,
      width: '0', height: '0',
    });
    if (!this.menuAnchor.isConnected) document.body.append(this.menuAnchor);
    this.menuField.setQuery('', { silent: true });
    this.menuPop.close({ restoreFocus: false });
    this.menuPop.open();
  }

  async #renderContextMenu() {
    const id = this.menuTargetId;
    if (!id) return;
    const isPinned = this.pinned.has(id);
    const items = [
      { label: isPinned ? chrome('unpin') : chrome('pin'), keys: 'Ctrl+Shift+P',
        run: () => this.togglePin(id) },
      { label: chrome('moveLeft'),  keys: 'Ctrl+←', run: () => this.moveTab(id, -1) },
      { label: chrome('moveRight'), keys: 'Ctrl+→', run: () => this.moveTab(id, 1) },
      { label: chrome('findTabs'),  keys: '',        run: () => this.openTabSearch() },
    ];

    const matcher = this.menuField.matcher();
    this.menuField.input.setAttribute('aria-invalid', String(!matcher.ok));

    const rows = [];
    for (const item of items) {
      if (!matcher.empty) {
        const result = await this.menuField.evaluateText(item.label);
        if (!result.ok || result.refused || result.timedOut || result.truncated) {
          this.menuBody.replaceChildren(el('p', { class: 'md-pop__empty', text: result.timedOut ? chrome('timedOut') : result.truncated ? chrome('incomplete') : result.refused ? chrome('refused') : `${chrome('invalid')}: ${chrome('invalidDetail')}` }));
          return;
        }
        if (!result.matched) continue;
      }
      rows.push(el('div', { class: 'md-pop__row' },
        el('button', {
          type: 'button', class: 'md-pop__pick',
          onclick: () => { this.menuPop.close(); item.run(); },
        },
        el('span', { class: 'md-pop__name' }, el('b', { text: item.label })),
        // The shortcut is shown because a hidden shortcut is one nobody learns.
        // It is decorative text to AT, since the menu item itself is the target.
        item.keys ? el('span', { class: 'md-pop__shortcut', 'aria-hidden': 'true', text: item.keys }) : null),
      ));
    }

    this.menuBody.replaceChildren(
      ...(rows.length ? rows : [el('p', { class: 'md-pop__empty', text: chrome('noMatch') })]),
    );
  }

  /* ------------------------------------------------------------ public API */

  on(type, fn) { return this.emitter.on(type, fn); }
  off(type, fn) { this.emitter.off(type, fn); }
  getActiveId() { return this.activeId; }
  getOrder() { return [...this.order]; }
  getPinned() { return [...this.pinned]; }
  getHidden() { return [...this.hiddenIds]; }
  /** Every tab as plain data — the command palette builds its destinations from this. */
  listTabs() {
    return this.order.map((id) => {
      const def = this.definitions.get(id);
      const { full } = labelFor(def);
      return { id, label: full, icon: def.icon, pinned: this.pinned.has(id), active: id === this.activeId };
    });
  }
  /** Re-read labels from i18n and relay out. Call after a language change. */
  refresh() { this.render(); }

  destroy() {
    this.destroyed = true;
    integrationWaiters.delete(this.onIntegrationChange);
    this.resizeObserver?.disconnect();
    window.removeEventListener('hashchange', this.onHashChange);
    this.overflowPop?.destroy();
    this.listPop?.destroy();
    this.menuPop?.destroy();
    this.overflowField?.destroy();
    this.listField?.destroy();
    this.menuField?.destroy();
    this.menuAnchor?.remove();
    this.strip?.remove();
    this.actions?.remove();
    this.live?.remove();
    // Release the module singleton so a later initTabs() builds a fresh strip
    // rather than handing back this dead one.
    if (instance === this) instance = null;
  }
}

/* ========================================================================== *
 * 10. Module entry points
 * ========================================================================== */

let instance = null;

/**
 * Create the tab strip. Safe to call once; a second call returns the first.
 *
 * options:
 *   mount     element or selector for the strip (default: #tab-strip)
 *   tabs      tab definitions (default: DEFAULT_TABS)
 *   useHash   keep location.hash in step with the active tab (default: true)
 *   notify    (message, { kind }) => void — routes confirmations to the toast
 *             system in ui.js, so this module never has to own one
 */
export function initTabs(options = {}) {
  if (instance) return instance;
  instance = new TabStrip(options);
  return instance;
}

/** The live strip controller, or null before initTabs(). */
export function getTabStrip() { return instance; }

/**
 * Convenience for the command palette: navigate to a tab and briefly highlight
 * the panel so a user who teleported can see where they landed.
 */
export function goToTab(id, options = {}) {
  return instance ? instance.activate(id, { highlight: true, ...options }) : false;
}

/** Open the searchable tab list — a palette destination in its own right. */
export function openTabSearch() { instance?.openTabSearch(); }

export default {
  initTabs, getTabStrip, goToTab, openTabSearch,
  DEFAULT_TABS, TABS_STORAGE_KEY, STORAGE_PREFIX, REGEX_DIALECT,
};
