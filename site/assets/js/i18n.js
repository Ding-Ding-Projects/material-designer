/*
 * i18n.js — language modes, funny levels, and the string catalogue.
 * Material Designer site (https://ding-ding-projects.github.io/material-designer/)
 *
 * =============================================================================
 * WHAT THIS MODULE IS
 * =============================================================================
 *
 * Three language modes  : 'en' | 'yue' | 'bilingual'   (bilingual is the default)
 * Two funny levels      : one for English, one for Cantonese, 1..5, persisted
 *                         separately. Defaults: English 3, Cantonese 4.
 *
 * The funny level changes VOICE ONLY. It never changes FACTS. A version number,
 * a commit id, a file count, a licence term, a placeholder or a warning must
 * read identically at level 1 and at level 5, and identically in English and in
 * Cantonese. That is not a hope — `auditFacts()` below extracts every fact-like
 * token from every variant of every entry and reports any that drift. Run it
 * with `?i18nAudit=1` on the URL, or import it from a test.
 *
 * =============================================================================
 * CATALOGUE AUTHORING RULES
 * =============================================================================
 *
 * Each entry is `{ en, yue }`. Each side is either:
 *
 *   a string  — one correct form at every funny level (identifiers, nav labels,
 *               licence names, anything where humour has nothing to add), or
 *   an array  — authored variants, index 0 = level 1 .. index 4 = level 5.
 *
 * Arrays shorter than 5 CARRY FORWARD: the last authored variant applies to
 * every higher level. So `['neutral']` behaves exactly like the plain string,
 * and `['a','b','c']` means levels 3, 4 and 5 all read 'c'. This is what makes
 * the mechanism general — a new string starts as one line and grows variants
 * later without any change to the resolver.
 *
 * Variants are AUTHORED, never generated. Do not try to produce tone by
 * transforming a neutral string at runtime: that is exactly how a warning loses
 * the clause that named the file.
 *
 * Interpolation uses {braces}: `t('dimsum.body', { dish: 'Wonton Noodles' })`.
 * Every placeholder present in the level-1 English variant must appear in all
 * the others — the audit enforces it, because a dropped placeholder is a
 * dropped fact wearing a disguise.
 *
 * Cantonese is written Hong Kong Cantonese (係 / 嘅 / 唔 / 咗 / 喇 / 喺 / 而家),
 * not Mandarin set in Traditional characters. Technical tokens stay in English
 * with spaces around them, the way they are actually written and said in Hong
 * Kong. Humour targets the code, the situation, or this page. Never the reader.
 *
 * =============================================================================
 * NO MARKUP IN STRINGS
 * =============================================================================
 *
 * Catalogue strings are written into the DOM with `textContent`, never
 * `innerHTML`. There is no opt-in. If a sentence needs emphasis, split it into
 * two keys and let the markup live in index.html where it can be read. This
 * removes a whole class of injection bug for the cost of a small inconvenience.
 *
 * =============================================================================
 * HTML CONTRACT (what index.html marks up, what app.css must style)
 * =============================================================================
 *
 *   <h1 data-i18n="hero.headline"></h1>
 *       Text content is replaced on every apply.
 *
 *   <button data-i18n-attr="aria-label:a11y.copy; title:common.copy">
 *       Attributes are filled from keys. Pairs are `attr:key`, separated by ';'.
 *       Attribute values are always joined on one line in bilingual mode,
 *       because an attribute cannot carry two languages structurally.
 *
 *   <button><svg …></svg><span class="i18n-text" data-i18n="common.copy"></span></button>
 *       When an element already contains markup (an icon), put the text in a
 *       child. `data-i18n` on a parent writes into its direct `.i18n-text`
 *       child when one exists, so the icon survives.
 *
 *   <span data-i18n="nav.home" data-i18n-inline></span>
 *       `data-i18n-inline` asks for the two bilingual halves on one line
 *       separated by ' · ' instead of stacked. Use it inside buttons, chips and
 *       tabs where a second line would break the control's height.
 *
 *   <span data-i18n="search.results.other" data-i18n-params='{"count":12}'></span>
 *       Static parameters as JSON. Dynamic ones go through `t()` in JS.
 *
 * In bilingual mode an element's content becomes:
 *
 *   <span class="i18n-primary"   lang="en"   >English</span>
 *   <span class="i18n-sep" aria-hidden="true"> · </span>
 *   <span class="i18n-secondary" lang="zh-HK">粵語</span>
 *
 * app.css must therefore provide, at minimum:
 *
 *   .i18n-secondary { display:block; font-size:.86em; opacity:.72; }
 *   .i18n-sep       { display:none; }
 *   .i18n-inline-content .i18n-secondary { display:inline; }
 *   .i18n-inline-content .i18n-sep       { display:inline; }
 *
 * …so the default is the stacked "primary prominent, secondary a smaller muted
 * line beneath" layout, and `data-i18n-inline` opts into the compact one.
 *
 * `i18n-inline-content` is set by this module on whichever node actually
 * received the text — which is the `.i18n-text` slot when there is one, and
 * the element itself otherwise. Style that class rather than the
 * `data-i18n-inline` attribute, so the rule lands on the same node in both
 * cases. Use the `.i18n-secondary` font-size and opacity to keep the second
 * language clearly secondary; do not hide it, and do not truncate it — that
 * second line is the mode's whole purpose.
 *
 * The `lang` attributes are not decoration: they are what makes a screen reader
 * switch from an English voice to a Cantonese one mid-page.
 *
 * =============================================================================
 * STORAGE
 * =============================================================================
 *
 *   md-designer.site.lang.mode       'en' | 'yue' | 'bilingual'
 *   md-designer.site.lang.funny.en   '1'..'5'
 *   md-designer.site.lang.funny.yue  '1'..'5'
 *   md-designer.site.lang.disclosed  '1' once the personality notice is seen
 *
 * localStorage can throw outright in a locked-down browser profile, so every
 * access is guarded and falls back to an in-memory map for the session.
 */

/* ========================================================================== *
 * 1. Constants
 * ========================================================================== */

/** Shared by every module on this site, so preferences are findable in one go. */
export const STORAGE_PREFIX = 'md-designer.site.';

const STORE_KEYS = {
  mode: STORAGE_PREFIX + 'lang.mode',
  funnyEn: STORAGE_PREFIX + 'lang.funny.en',
  funnyYue: STORAGE_PREFIX + 'lang.funny.yue',
  disclosed: STORAGE_PREFIX + 'lang.disclosed',
};

/** The three language modes, in the order the settings surface should list them. */
export const LANG_MODES = ['en', 'yue', 'bilingual'];

/** The two authored languages. 'bilingual' is a rendering mode, not a language. */
export const LANGUAGES = ['en', 'yue'];

export const FUNNY_MIN = 1;
export const FUNNY_MAX = 5;

/** Documented in docs/standards/language-modes.md; mirrors the design mockup. */
export const DEFAULTS = { mode: 'bilingual', funnyEn: 3, funnyYue: 4 };

/** BCP 47 tags, used for `lang` attributes and `document.documentElement.lang`. */
const BCP47 = { en: 'en', yue: 'zh-HK' };

/** Separator between the two halves of a bilingual string. Matches the mockup. */
const BILINGUAL_SEPARATOR = ' · ';

/* ========================================================================== *
 * 2. Storage helpers
 * ========================================================================== */

/** Session fallback for when localStorage is unavailable or throws. */
const memoryStore = new Map();
let storageWarned = false;

function readStored(key) {
  try {
    const value = window.localStorage.getItem(key);
    if (value !== null) return value;
  } catch (error) {
    warnStorageOnce(error);
  }
  return memoryStore.has(key) ? memoryStore.get(key) : null;
}

function writeStored(key, value) {
  memoryStore.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    warnStorageOnce(error);
  }
}

function warnStorageOnce(error) {
  if (storageWarned) return;
  storageWarned = true;
  console.warn(
    '[i18n] localStorage is unavailable; language preferences will not survive ' +
      'a reload in this browser profile.',
    error,
  );
}

/* ========================================================================== *
 * 3. State
 * ========================================================================== */

const state = {
  mode: normaliseMode(readStored(STORE_KEYS.mode)),
  funny: {
    en: normaliseLevel(readStored(STORE_KEYS.funnyEn), DEFAULTS.funnyEn),
    yue: normaliseLevel(readStored(STORE_KEYS.funnyYue), DEFAULTS.funnyYue),
  },
};

function normaliseMode(value) {
  return LANG_MODES.includes(value) ? value : DEFAULTS.mode;
}

function normaliseLevel(value, fallback) {
  const level = Number.parseInt(value, 10);
  if (!Number.isFinite(level)) return fallback;
  return Math.min(FUNNY_MAX, Math.max(FUNNY_MIN, level));
}

/* ========================================================================== *
 * 4. The catalogue
 * ========================================================================== *
 *
 * Ordered roughly the way the page reads. Entries with five authored variants
 * per language are the "meaningful subset" the funny sliders visibly move:
 * headline, taglines, section introductions, the no-release notice, empty
 * states, button labels and toast messages. Everything else has one correct
 * form and the tone system leaves it alone — which is itself part of the
 * standard, not a gap in it.
 */

const CATALOGUE = {
  /* ---- identity ------------------------------------------------------- */

  // A product name is a product name at every level, in every language.
  'site.name': { en: 'Material Designer', yue: 'Material Designer' },

  'site.title': {
    en: 'Material Designer — a local-first design workspace',
    yue: 'Material Designer — 本機優先嘅設計工作區',
  },

  'site.tagline': {
    en: [
      'A local-first design workspace, rebuilt on Material Design 3.',
      'A local-first design workspace, rebuilt on Material Design 3. Your machine, your files.',
      'A design workspace that lives on your own machine, rebuilt on Material Design 3.',
      'A design workspace that never phones home, rebuilt on Material Design 3.',
      'A design workspace that refuses to leave your machine, because the cloud is just somebody else’s laptop. Rebuilt on Material Design 3.',
    ],
    yue: [
      '本機優先嘅設計工作區，用 Material Design 3 重新起過。',
      '本機優先嘅設計工作區，用 Material Design 3 重新起過。啲檔案一直喺你部機度。',
      '成個設計工作區住喺你部機入面，用 Material Design 3 重新起過。',
      '唔上雲、唔打電話返屋企嘅設計工作區，用 Material Design 3 由頭起過。',
      '個設計工作區死賴喺你部機度唔肯走，因為所謂雲端其實都係人哋部機。用 Material Design 3 由頭起過。',
    ],
  },

  /* ---- navigation ----------------------------------------------------- */

  'nav.home': { en: 'Home', yue: '主頁' },
  'nav.product': { en: 'What it does', yue: '佢做到啲乜' },
  'nav.status': { en: 'Status', yue: '進度' },
  'nav.design': { en: 'Design system', yue: '設計系統' },
  'nav.docs': { en: 'Documentation', yue: '文件' },
  'nav.download': { en: 'Download', yue: '下載' },
  'nav.settings': { en: 'Settings', yue: '設定' },
  'nav.about': { en: 'About', yue: '關於' },

  /* ---- hero ----------------------------------------------------------- */

  'hero.headline': {
    en: [
      'Design artifacts, generated on your own machine.',
      'Design artifacts, generated right here on your own machine.',
      'Prototypes, decks and dashboards, generated on your own machine.',
      'Prototypes, decks and dashboards, made by the coding agent you already have.',
      'Your coding agent has been idling. Hand it a prompt and take prototypes, decks and dashboards off it — without a single byte leaving the building.',
    ],
    yue: [
      '設計檔案，喺你自己部機上面生成。',
      '設計檔案，就喺你自己部機上面生成，唔使出街。',
      '原型、簡報、儀表板，全部喺你自己部機度整。',
      '原型、簡報、儀表板，交畀你部機入面本來就有嘅 coding agent 去砌。',
      '你部機入面隻 coding agent 得閒到喊，落張單畀佢啦：原型、簡報、儀表板照做，一個 byte 都唔使出街。',
    ],
  },

  'hero.tagline': {
    en: [
      'A local daemon detects the coding-agent command-line tool you already have installed and drives it. Projects, files and database stay on local disk.',
      'A local daemon finds the coding-agent command-line tool you already have and drives it. Projects, files and database stay on local disk.',
      'A local daemon goes looking for whichever coding-agent command-line tool you already installed, and drives it. Projects, files and database stay on local disk.',
      'A local daemon works out which coding-agent command-line tool you already installed, and puts it to work. Projects, files and database stay on local disk.',
      'A local daemon rummages through your machine, finds whichever coding-agent command-line tool you already installed, and quietly puts it to work. Projects, files and database stay on local disk — there is nowhere else for them to go.',
    ],
    yue: [
      '本機 daemon 會偵測到你本身裝咗嘅 coding-agent 命令列工具，然後驅動佢。項目、檔案同資料庫全部留喺本機硬碟。',
      '本機 daemon 會搵到你本身裝咗嘅 coding-agent 命令列工具，然後驅動佢。項目、檔案同資料庫全部留喺本機硬碟。',
      '本機 daemon 會自己去搵你部機入面裝咗邊個 coding-agent 命令列工具，跟住驅動佢。項目、檔案同資料庫全部留喺本機硬碟。',
      '本機 daemon 會查清楚你裝咗邊隻 coding-agent 命令列工具，然後拉佢出嚟開工。項目、檔案同資料庫全部留喺本機硬碟。',
      '本機 daemon 會喺你部機度周圍摷，搵到你裝咗嘅 coding-agent 命令列工具，靜靜雞拉佢出嚟開工。項目、檔案同資料庫全部留喺本機硬碟 — 佢哋想去第度都冇路。',
    ],
  },

  'hero.cta.docs': {
    en: ['Read the documentation', 'Read the documentation', 'Read the docs', 'Read the docs', 'Go read the docs'],
    yue: ['閱讀文件', '閱讀文件', '睇下文件', '入去睇文件', '入去睇文件啦'],
  },
  'hero.cta.status': {
    en: [
      'See what is verified',
      'See what is verified',
      'See what has actually been verified',
      'See what has actually been verified',
      'See what has actually been verified, and what is still a promise',
    ],
    yue: [
      '睇下咩已經驗證過',
      '睇下咩已經驗證過',
      '睇下咩真係驗證過',
      '睇下咩真係驗證過',
      '睇下咩真係驗證過，咩仲係得個講字',
    ],
  },
  'hero.cta.source': { en: 'View the source', yue: '睇原始碼' },

  /* ---- the release notice --------------------------------------------- *
   *
   * The most important strings on the site. Nothing has been built from this
   * repository: no installer, no version number, no continuous-integration
   * run. Every variant says all three, in both languages, at every level.
   * The joke is allowed to be about the absence. It is never allowed to hint
   * that something might be there.
   */

  'release.heading': { en: 'Download', yue: '下載' },

  'release.none.title': {
    en: [
      'No release yet',
      'No release yet',
      'No release yet — nothing to download',
      'No release yet, and no download button to go with it',
      'No release yet, so this is where the download button is not',
    ],
    yue: [
      '暫時未有版本',
      '暫時未有版本',
      '暫時未有版本 — 冇嘢可以載',
      '暫時未有版本，連下載掣都冇埋',
      '暫時未有版本，所以呢度就係「冇下載掣」嗰笪位',
    ],
  },

  'release.none.body': {
    en: [
      'Nothing has been built from this repository, so there is no installer and no version number. A release will appear here once continuous integration publishes one.',
      'Nothing has been built from this repository yet, so there is no installer and no version number. A release appears here as soon as continuous integration publishes one.',
      'Nothing has been built from this repository yet: no installer, no version number, nothing to hand you. A release appears here the moment continuous integration publishes one.',
      'There is no download button here because there is nothing to download. Nothing has been built from this repository yet — no installer, no version number. Continuous integration will publish one to this exact spot when it does.',
      'The download button is missing, and that is the honest version. Nothing has been built from this repository yet: no installer, no version number, nothing to hand you at all. The moment continuous integration publishes one it lands right here, and this paragraph finally gets to retire.',
    ],
    yue: [
      '呢個 repository 未 build 過，所以冇安裝檔、亦冇版本號。等 continuous integration 出咗第一個 release，就會喺呢度出現。',
      '呢個 repository 到而家都未 build 過，所以冇安裝檔、亦冇版本號。continuous integration 一出 release，佢就會喺呢度出現。',
      '呢個 repository 到而家都未 build 過：冇安裝檔、冇版本號、乜都畀唔到你。continuous integration 一出 release，就會即刻喺呢度出現。',
      '呢度冇下載掣，因為根本冇嘢畀你載。呢個 repository 由頭到尾未 build 過 — 冇安裝檔、冇版本號。continuous integration 出到嘅時候，就會擺喺呢個位。',
      '下載掣唔見咗，而呢個就係老實版本。呢個 repository 由頭到尾未 build 過：冇安裝檔、冇版本號，真係一樣都攞唔出。等 continuous integration 出咗第一個 release，佢就會落喺呢度，到時呢段字就可以收工。',
    ],
  },

  // Deliberately level-invariant: this is the mechanism, not the mood.
  'release.none.note': {
    en: 'Until then, the only way to run this is to build it from source. The exact commands, toolchain versions and Windows prerequisites are in the documentation.',
    yue: '喺嗰之前，唯一行到嘅方法就係自己由原始碼 build。詳細指令、toolchain 版本同 Windows 前置需求全部喺文件度。',
  },

  'release.ci.explainer': {
    en: 'Continuous integration builds on every push, tests before it publishes, and attaches the installer it actually built. A failed test publishes nothing.',
    yue: 'Continuous integration 每次 push 都會 build，測試通過先至出版，而且會附上真係 build 出嚟嗰個安裝檔。測試唔過就乜都唔會出。',
  },

  'release.buildFromSource': { en: 'Build from source', yue: '由原始碼 build' },

  /* ---- what it does today --------------------------------------------- */

  'section.today.heading': { en: 'What it does today', yue: '而家做到啲乜' },

  'section.today.intro': {
    en: [
      'This is the ported upstream functionality: what the application already does, inherited verbatim from Open Design v0.16.1.',
      'This is the ported upstream functionality — what the application already does, inherited verbatim from Open Design v0.16.1.',
      'Everything below already works. It is the ported upstream functionality, inherited verbatim from Open Design v0.16.1, and this project did not write it.',
      'Everything below already works, and this project deserves no credit for any of it: it is the ported upstream functionality, inherited verbatim from Open Design v0.16.1.',
      'Everything below already works, and none of it is ours to boast about. It is the ported upstream functionality, inherited verbatim from Open Design v0.16.1 — copied so exactly that a script can prove it rather than a paragraph having to ask you to believe it.',
    ],
    yue: [
      '呢啲係移植返嚟嘅上游功能：即係個 app 本身已經做到嘅嘢，原封不動繼承自 Open Design v0.16.1。',
      '呢啲係移植返嚟嘅上游功能 — 即係個 app 本身已經做到嘅嘢，原封不動繼承自 Open Design v0.16.1。',
      '下面每樣都已經行得。呢啲係移植返嚟嘅上游功能，原封不動繼承自 Open Design v0.16.1，唔係呢個項目寫嘅。',
      '下面每樣都已經行得，不過本項目一分功勞都唔敢認：全部係移植返嚟嘅上游功能，原封不動繼承自 Open Design v0.16.1。',
      '下面每樣都已經行得，但冇一樣輪到我哋𠺘。全部係移植返嚟嘅上游功能，原封不動繼承自 Open Design v0.16.1 — 抄到一個字都唔差，所以有 script 可以驗畀你睇，唔使靠一段字求你信。',
    ],
  },

  'feature.agents.title': { en: 'Drives the agent you already have', yue: '驅動你本身有嘅 agent' },
  'feature.agents.body': {
    en: 'A local daemon detects whichever coding-agent command-line tool is installed on the machine and drives it. Nothing new to sign up for.',
    yue: '本機 daemon 會偵測部機裝咗邊個 coding-agent 命令列工具，然後驅動佢。唔使再開多個新戶口。',
  },
  'feature.artifacts.title': { en: 'Single-page design artifacts', yue: '單頁設計檔案' },
  'feature.artifacts.body': {
    en: 'Prototypes, live dashboards, decks, images and motion pieces, each generated as a single self-contained page.',
    yue: '原型、即時儀表板、簡報、圖像同動態作品，每份都係一個自足嘅單頁。',
  },
  'feature.preview.title': { en: 'Sandboxed preview', yue: '沙盒預覽' },
  'feature.preview.body': {
    en: 'Generated pages render in a sandboxed preview rather than being trusted with the application’s own privileges.',
    yue: '生成出嚟嘅頁面喺沙盒預覽入面 render，唔會攞住個 app 本身嘅權限亂咁行。',
  },
  'feature.export.title': { en: 'Exports', yue: '匯出' },
  'feature.export.body': {
    en: 'Export to HTML, PDF, PPTX, ZIP, Markdown and MP4.',
    yue: '可以匯出做 HTML、PDF、PPTX、ZIP、Markdown 同 MP4。',
  },
  'feature.local.title': { en: 'Local disk, local database', yue: '本機硬碟、本機資料庫' },
  'feature.local.body': {
    en: 'Projects, files and database stay on local disk. The workspace runs entirely on your own machine.',
    yue: '項目、檔案同資料庫全部留喺本機硬碟。成個工作區淨係喺你自己部機度行。',
  },

  /* ---- what this project is building ---------------------------------- */

  'section.building.heading': { en: 'What this project is building', yue: '呢個項目而家喺度整緊乜' },

  'section.building.intro': {
    en: [
      'The Material Design 3 redesign and the standards work are in progress. None of it is implemented yet.',
      'The Material Design 3 redesign and the standards work are in progress. None of it is implemented yet, and this page will not imply otherwise.',
      'Everything in this section is in progress. The Material Design 3 redesign and the standards work are specified and not implemented — there is a mockup, and there is not yet an application that looks like it.',
      'Everything in this section is a plan, not a product. The Material Design 3 redesign and the standards work are specified and not implemented: there is a mockup, and there is not yet an application that looks like it.',
      'Everything in this section is a promise with a mockup attached. The Material Design 3 redesign and the standards work are specified and not implemented — the design exists, the application that looks like it does not, and the honest thing to do is say so on the page rather than in a footnote nobody opens.',
    ],
    yue: [
      'Material Design 3 重新設計同各項標準工作仲進行緊，全部都未實作。',
      'Material Design 3 重新設計同各項標準工作仲進行緊，全部都未實作，呢版都唔會扮做咗。',
      '呢一節入面每樣都仲進行緊。Material Design 3 重新設計同各項標準工作得個規格，未實作 — 有 mockup，但未有一個似 mockup 嘅 app。',
      '呢一節入面每樣都係計劃，唔係成品。Material Design 3 重新設計同各項標準工作得個規格，未實作：有 mockup，但未有一個似 mockup 嘅 app。',
      '呢一節入面每樣都係「講咗、附埋 mockup」。Material Design 3 重新設計同各項標準工作得個規格，未實作 — 設計有，似設計嗰個 app 就未有。老實嘅做法係擺喺版面講，唔係塞落冇人撳嘅註腳度。',
    ],
  },

  'standard.md3.title': { en: 'Material Design 3 conformance', yue: 'Material Design 3 合規' },
  'standard.md3.body': {
    en: 'The colour-role tokens, type scale, shape scale, elevation and motion easing, with no legacy or ad-hoc design elements left behind.',
    yue: '色彩角色 token、字級、形狀級距、高程同動態緩動，唔留低任何舊式或者臨時砌出嚟嘅設計元素。',
  },
  'standard.language.title': { en: 'Language modes and funny levels', yue: '語言模式同搞笑程度' },
  'standard.language.body': {
    en: 'English, playful Hong Kong Cantonese and a bilingual mode, with two independent 1–5 sliders. This page has them; the application does not yet.',
    yue: '英文、港式抵死廣東話同雙語模式，加兩條獨立 1–5 拉桿。呢版有齊，個 app 就仲未有。',
  },
  'standard.regex.title': { en: 'Regex builder beside every search field', yue: '每個搜尋欄旁邊都有 regex 產生器' },
  'standard.regex.body': {
    en: 'Guided construction, a raw pattern editor, flag toggles, sample text and live match display, anchored beside the field it belongs to.',
    yue: '引導式砌法、原始 pattern 編輯器、flag 開關、樣本文字同即時比對結果，固定喺屬於佢嗰個欄位旁邊。',
  },
  'standard.tabs.title': { en: 'Browser-style tabbed navigation', yue: '瀏覽器式分頁導覽' },
  'standard.tabs.body': {
    en: 'A persistent tab strip with an overflow surface, reordering, pinning and a searchable tab list, all persisted.',
    yue: '常駐分頁列，有滿溢收納、可以拖動排序、可以釘住，仲有得搜尋嘅分頁清單，全部會記住。',
  },
  'standard.a11y.title': { en: 'Accessibility as a completion blocker', yue: '無障礙係完工門檻' },
  'standard.a11y.body': {
    en: 'Keyboard reachable throughout, visible focus, correct roles and names, sufficient contrast in both themes, reduced motion respected.',
    yue: '全程可以用鍵盤到達、focus 睇得見、role 同名稱正確、深淺兩個主題都夠對比、尊重減少動態設定。',
  },
  'standard.notifications.title': { en: 'Non-blocking notifications', yue: '唔阻住你嘅通知' },
  'standard.notifications.body': {
    en: 'Corner toasts that auto-dismiss and stack without overlapping, with a notification centre that keeps dismissed ones reviewable. A modal is only for a decision.',
    yue: '角落 toast 會自動消失、疊起嚟又唔會遮住對方，仲有通知中心畀你翻睇撳走咗嘅。要你做決定嗰陣先至用 modal。',
  },

  /* ---- design system -------------------------------------------------- */

  'section.md3.heading': { en: 'The design system', yue: '設計系統' },

  'section.md3.intro': {
    en: [
      'This page is built on the same Material Design 3 token contract as the application redesign: colour roles, type scale, shape scale, elevation and motion easing.',
      'This page is built on the same Material Design 3 token contract as the application redesign — colour roles, type scale, shape scale, elevation and motion easing.',
      'This page runs on the same Material Design 3 token contract as the application redesign: colour roles, type scale, shape scale, elevation and motion easing. Change the seed colour and watch the whole page follow.',
      'This page runs on the same Material Design 3 token contract as the application redesign: colour roles, type scale, shape scale, elevation and motion easing. Change the seed colour and the whole page follows, because nothing here hard-codes a hex.',
      'This page runs on the same Material Design 3 token contract as the application redesign: colour roles, type scale, shape scale, elevation and motion easing. Change the seed colour and the whole page follows without an argument, because there is not a single hard-coded hex left in here to put up a fight.',
    ],
    yue: [
      '呢版用嘅 Material Design 3 token 合約同個 app 嘅重新設計一模一樣：色彩角色、字級、形狀級距、高程同動態緩動。',
      '呢版用嘅 Material Design 3 token 合約同個 app 嘅重新設計一模一樣 — 色彩角色、字級、形狀級距、高程同動態緩動。',
      '呢版行嘅 Material Design 3 token 合約同個 app 嘅重新設計一樣：色彩角色、字級、形狀級距、高程同動態緩動。你轉個種子色，成版會跟住轉。',
      '呢版行嘅 Material Design 3 token 合約同個 app 嘅重新設計一樣：色彩角色、字級、形狀級距、高程同動態緩動。你轉個種子色，成版即刻跟，因為呢度冇一個位寫死 hex。',
      '呢版行嘅 Material Design 3 token 合約同個 app 嘅重新設計一樣：色彩角色、字級、形狀級距、高程同動態緩動。你轉個種子色，成版即刻跟足，連拗都唔會拗一句，因為呢度連一個寫死嘅 hex 都揾唔到出嚟同你嘈。',
    ],
  },

  'md3.tokens.heading': { en: 'Colour roles', yue: '色彩角色' },
  'md3.type.heading': { en: 'Type scale', yue: '字級' },
  'md3.shape.heading': { en: 'Shape scale', yue: '形狀級距' },
  'md3.motion.heading': { en: 'Motion easing', yue: '動態緩動' },
  'md3.fonts.note': {
    en: 'No web fonts are loaded. The site uses a system font stack, because every asset must be bundled locally and a font file cannot be authored by hand.',
    yue: '呢度冇載任何 web font。個站用系統字體堆疊，因為所有資源都要本機打包，而字體檔案唔可能用手寫出嚟。',
  },

  /* ---- documentation -------------------------------------------------- */

  'section.docs.heading': { en: 'Documentation', yue: '文件' },
  'section.docs.intro': {
    en: 'Every feature has its own article: behaviour, configuration, failure modes, security considerations and how to verify it.',
    yue: '每個功能都有自己一篇文：行為、設定、失效情況、保安考慮，同埋點樣驗證佢。',
  },

  /* ---- settings ------------------------------------------------------- */

  'settings.heading': { en: 'Settings', yue: '設定' },

  'settings.intro': {
    en: [
      'Every preference on this page is stored in your browser and applied immediately. Nothing is sent anywhere.',
      'Every preference on this page is stored in your own browser and applied immediately. Nothing is sent anywhere.',
      'Every preference here is stored in your own browser and applied immediately. Nothing is sent anywhere, because there is nowhere for it to be sent.',
      'Every preference here lives in your own browser and applies immediately. Nothing is sent anywhere, because this site has nowhere to send it to.',
      'Every preference here lives in your own browser and applies the instant you change it. Nothing is sent anywhere — not because we are being noble about it, but because this site makes no network requests at all and therefore has nowhere to send anything.',
    ],
    yue: [
      '呢版每個設定都存喺你部瀏覽器度，改完即刻生效。唔會send去任何地方。',
      '呢版每個設定都存喺你自己部瀏覽器度，改完即刻生效。唔會 send 去任何地方。',
      '呢度每個設定都存喺你自己部瀏覽器，改完即刻生效。唔會 send 去任何地方，因為根本冇地方畀佢 send。',
      '呢度每個設定都住喺你自己部瀏覽器，一改即刻生效。唔會 send 去任何地方，因為呢個站根本冇地方可以 send。',
      '呢度每個設定都住喺你自己部瀏覽器，你一改即刻生效。唔會 send 去任何地方 — 唔係我哋幾咁清高，係呢個站完全唔會發任何網絡請求，想 send 都冇路可去。',
    ],
  },

  'settings.language.heading': { en: 'Language mode', yue: '語言模式' },
  'settings.language.help': {
    en: 'English, playful Hong Kong-style Cantonese, or both side by side. Applies to every string on this site.',
    yue: '英文、港式抵死廣東話，或者兩種一齊排。成個站每一句都會跟。',
  },
  'settings.language.mode.en': { en: 'English', yue: 'English 英文' },
  'settings.language.mode.yue': { en: '粵語 · playful Hong Kong Cantonese', yue: '粵語 · 港式抵死廣東話' },
  'settings.language.mode.bilingual': { en: 'Bilingual — English + 粵語', yue: '雙語 — English + 粵語' },

  'settings.funny.heading': { en: 'Funny level', yue: '搞笑程度' },
  'settings.funny.help': {
    en: 'Two independent sliders, one per language, from 1 to 5. Level 1 is fully professional; level 5 is maximum playfulness. The level changes the voice only — version numbers, commit ids, licence terms and warnings read identically at every level.',
    yue: '兩條獨立拉桿，一種語言一條，由 1 去到 5。1 係完全正經，5 係玩到盡。個 level 淨係改語氣 — 版本號、commit id、授權條款同警告，喺每一個 level 都係一模一樣。',
  },
  'settings.funny.en.label': { en: 'English', yue: 'English 英文' },
  'settings.funny.yue.label': { en: '粵語 Cantonese', yue: '粵語 Cantonese' },

  // Names for each notch on the slider, so the number is not the only cue.
  'settings.funny.level.1': { en: 'Deadpan', yue: '死板' },
  'settings.funny.level.2': { en: 'Dry', yue: '淡定' },
  'settings.funny.level.3': { en: 'Warm', yue: '有溫度' },
  'settings.funny.level.4': { en: 'Cheeky', yue: '鬼馬' },
  'settings.funny.level.5': { en: 'Full yum cha', yue: '飲茶級' },

  'settings.funny.preview': { en: 'Live sample', yue: '即時樣本' },
  'settings.appearance.heading': { en: 'Appearance', yue: '外觀' },
  'settings.appearance.theme': { en: 'Theme', yue: '主題' },
  'settings.appearance.theme.light': { en: 'Light', yue: '淺色' },
  'settings.appearance.theme.dark': { en: 'Dark', yue: '深色' },
  'settings.appearance.theme.system': { en: 'Match the system', yue: '跟系統' },
  'settings.appearance.density': { en: 'Density', yue: '密度' },
  'settings.appearance.density.compact': { en: 'Compact', yue: '緊密' },
  'settings.appearance.density.default': { en: 'Default', yue: '預設' },
  'settings.appearance.density.comfortable': { en: 'Comfortable', yue: '寬鬆' },
  'settings.appearance.seed': { en: 'Seed colour', yue: '種子色' },
  'settings.appearance.scale': { en: 'UI scale', yue: '介面縮放' },
  'settings.search.label': { en: 'Search settings', yue: '搵設定' },
  'settings.search.placeholder': { en: 'Search every setting on this page', yue: '搵呢版所有設定' },
  'settings.reset': { en: 'Reset to defaults', yue: '還原做預設' },

  /* ---- colour translator ---------------------------------------------- */

  'colour.translator.heading': { en: 'Colour translator', yue: '色彩轉換器' },
  'colour.translator.help': {
    en: 'The current seed colour in every notation. Copy any of them.',
    yue: '而家個種子色喺每種寫法下面嘅樣。想抄邊個就抄邊個。',
  },
  'colour.contrast.label': { en: 'Contrast against the surface', yue: '同底色嘅對比度' },
  'colour.contrast.pass': { en: 'Passes at normal text size', yue: '一般字級都過到關' },
  'colour.contrast.fail': { en: 'Too low for normal text size', yue: '一般字級嚟講對比唔夠' },

  /* ---- search and the regex builder ----------------------------------- */

  'search.label': { en: 'Search this site', yue: '搵呢個站' },
  'search.placeholder': { en: 'Search this site', yue: '搵呢個站' },
  'search.mode.plain': { en: 'Plain text', yue: '純文字' },
  'search.mode.regex': { en: 'Regular expression', yue: '正規表達式' },
  'search.mode.hint': {
    en: 'Plain text is the default. Turn on regular expressions deliberately.',
    yue: '預設係純文字。要用正規表達式就要自己㩒開佢。',
  },

  'search.empty': {
    en: [
      'No matches for {query}.',
      'No matches for {query} on this page.',
      'Nothing on this page matches {query}.',
      'Nothing on this page matches {query}. Either the site is missing something, or that was very specific.',
      'Nothing on this page matches {query}. Either this site is missing something it should have, or you have written the single most specific query of the day.',
    ],
    yue: [
      '搵唔到 {query}。',
      '呢版搵唔到 {query}。',
      '呢版冇嘢配到 {query}。',
      '呢版冇嘢配到 {query}。可能係個站真係漏咗嘢，又或者你寫得太精準。',
      '呢版冇嘢配到 {query}。要唔係個站真係漏咗應該有嘅嘢，要唔係你今日寫咗全日最精準嗰句 query。',
    ],
  },

  'search.results.one': { en: '{count} match', yue: '{count} 個結果' },
  'search.results.other': { en: '{count} matches', yue: '{count} 個結果' },
  'search.invalid': {
    en: 'That pattern will not compile: {error}',
    yue: '呢個 pattern 編譯唔到：{error}',
  },
  'search.clear': { en: 'Clear the search', yue: '清空搜尋' },

  'regex.builder.open': { en: 'Open the regex builder', yue: '打開 regex 產生器' },
  'regex.builder.heading': { en: 'Regex builder', yue: 'Regex 產生器' },
  'regex.builder.help': {
    en: 'Build a pattern piece by piece, or write one directly. Everything is evaluated in this page with the browser’s own engine and a bounded time limit, so a pathological pattern cannot hang the tab.',
    yue: '可以一嚿嚿砌個 pattern，又可以直接自己寫。全部喺呢版用瀏覽器自己個引擎行，仲有時間上限，所以就算寫個變態 pattern 都唔會吊死成個 tab。',
  },
  'regex.builder.engine': {
    en: 'Engine: ECMAScript regular expressions, as implemented by this browser.',
    yue: '引擎：ECMAScript 正規表達式，由你部瀏覽器自己實作。',
  },
  'regex.section.literal': { en: 'Literal text', yue: '字面文字' },
  'regex.section.class': { en: 'Character class', yue: '字元類別' },
  'regex.section.anchor': { en: 'Anchors', yue: '錨點' },
  'regex.section.group': { en: 'Groups', yue: '群組' },
  'regex.section.alternation': { en: 'Alternation', yue: '選擇' },
  'regex.section.quantifier': { en: 'Quantifiers', yue: '數量詞' },
  'regex.section.pattern': { en: 'Pattern', yue: 'Pattern' },
  'regex.section.flags': { en: 'Flags', yue: 'Flags' },
  'regex.section.sample': { en: 'Sample text', yue: '樣本文字' },
  'regex.section.matches': { en: 'Matches', yue: '比對結果' },
  'regex.section.groups': { en: 'Capture groups', yue: '擷取群組' },
  'regex.copy': { en: 'Copy the pattern', yue: '抄低個 pattern' },
  'regex.apply': { en: 'Use this pattern', yue: '用呢個 pattern' },
  'regex.nomatch': { en: 'The pattern is valid and matches nothing in the sample.', yue: '個 pattern 冇問題，但喺樣本入面配唔到嘢。' },
  'regex.timeout': {
    en: 'Evaluation was stopped at the time limit. That pattern backtracks too much on this sample.',
    yue: '行到時間上限就叫停咗。個 pattern 喺呢份樣本度回溯得太犀利。',
  },

  /* ---- tabs ----------------------------------------------------------- */

  'tabs.strip.label': { en: 'Site sections', yue: '站內分頁' },
  'tabs.search.label': { en: 'Search the open tabs', yue: '搵開咗嘅分頁' },
  'tabs.search.placeholder': { en: 'Search tabs', yue: '搵分頁' },
  'tabs.search.empty': {
    en: [
      'No open tab matches {query}.',
      'No open tab matches {query}.',
      'None of the open tabs match {query}.',
      'None of the open tabs match {query}. They are all quite sure about it.',
      'None of the open tabs match {query}, and they have all checked twice.',
    ],
    yue: [
      '冇開住嘅分頁配到 {query}。',
      '冇開住嘅分頁配到 {query}。',
      '開住嗰啲分頁冇一個配到 {query}。',
      '開住嗰啲分頁冇一個配到 {query}，個個都好肯定。',
      '開住嗰啲分頁冇一個配到 {query}，佢哋仲數咗兩次。',
    ],
  },
  'tabs.overflow': { en: 'More tabs', yue: '更多分頁' },
  'tabs.pin': { en: 'Pin this tab', yue: '釘住呢個分頁' },
  'tabs.unpin': { en: 'Unpin this tab', yue: '解開呢個分頁' },
  'tabs.pinned': { en: 'Pinned', yue: '已釘住' },
  'tabs.reorder.hint': {
    en: 'Drag a tab to reorder it, or move it with the arrow keys while it has focus.',
    yue: '拖住個分頁就可以換位，或者揀住佢之後用方向鍵郁佢。',
  },
  'tabs.list.heading': { en: 'All tabs', yue: '全部分頁' },

  /* ---- notifications -------------------------------------------------- */

  'notify.center.heading': { en: 'Notifications', yue: '通知' },
  'notify.center.open': { en: 'Open the notification centre', yue: '打開通知中心' },
  'notify.center.empty': {
    en: [
      'No notifications.',
      'No notifications yet.',
      'Nothing has happened worth telling you about.',
      'Nothing has happened worth telling you about. Enjoy it while it lasts.',
      'Nothing has happened that was worth interrupting you for, which is arguably the notification centre working perfectly.',
    ],
    yue: [
      '冇通知。',
      '暫時冇通知。',
      '未有咩值得話畀你聽。',
      '未有咩值得話畀你聽。趁而家清靜，歎住先。',
      '未有咩值得專登嘈醒你，講真咁樣先叫做通知中心做得好。',
    ],
  },
  'notify.dismiss': { en: 'Dismiss', yue: '撳走' },
  'notify.dismissAll': { en: 'Dismiss all', yue: '全部撳走' },
  'notify.restore': { en: 'Dismissed notifications stay here.', yue: '撳走咗嘅通知會留喺呢度。' },

  /* ---- toasts --------------------------------------------------------- */

  'toast.copied': {
    en: [
      'Copied to the clipboard.',
      'Copied to the clipboard.',
      'Copied. It is on the clipboard now.',
      'Copied. The clipboard has it, do what you like with it.',
      'Copied. The clipboard has it and is being unusually quiet about the whole thing.',
    ],
    yue: [
      '已經複製到剪貼簿。',
      '已經複製到剪貼簿。',
      '抄咗喇，而家喺剪貼簿度。',
      '抄咗喇，剪貼簿收到貨，你想點用就點用。',
      '抄咗喇，剪貼簿靜靜雞收咗，一句都冇出聲。',
    ],
  },

  'toast.settings.saved': {
    en: [
      'Setting saved in this browser.',
      'Setting saved in this browser.',
      'Saved. This browser will remember it.',
      'Saved. This browser will remember it, and nothing else will ever know.',
      'Saved. This browser will remember it, nothing else will ever hear about it, and no server was troubled in the process.',
    ],
    yue: [
      '設定已經存喺呢部瀏覽器。',
      '設定已經存喺呢部瀏覽器。',
      '存咗喇，呢部瀏覽器會記住。',
      '存咗喇，呢部瀏覽器會記住，第二個永遠都唔會知。',
      '存咗喇，呢部瀏覽器會記住，第二個永遠唔會知，過程中亦冇騷擾過任何一部伺服器。',
    ],
  },

  'toast.settings.reset': {
    en: [
      'Settings reset to their defaults.',
      'Settings reset to their defaults.',
      'Back to the defaults. All of them.',
      'Back to the defaults — all of them, including the ones you were rather proud of.',
      'Back to the defaults, every last one, including the seed colour you spent four minutes choosing.',
    ],
    yue: [
      '設定已經還原做預設值。',
      '設定已經還原做預設值。',
      '全部打返晒原形，一個都唔漏。',
      '全部打返晒原形 — 一個都唔漏，包括你啱啱調到好滿意嗰啲。',
      '全部打返晒原形，一個都唔漏，包括你揀咗成幾分鐘嗰隻種子色。',
    ],
  },

  // Facts carried at every level: the mode, and both slider positions.
  'toast.language.changed': {
    en: [
      'Language mode: {mode}. Funny level: English {en}, Cantonese {yue}.',
      'Language mode: {mode}. Funny level: English {en}, Cantonese {yue}.',
      'Now reading in {mode}, at funny level English {en} and Cantonese {yue}.',
      'Now reading in {mode}, at funny level English {en} and Cantonese {yue}. The facts did not move.',
      'Now reading in {mode}, at funny level English {en} and Cantonese {yue}. The voice changed; every number, commit id and warning on this page did not.',
    ],
    yue: [
      '語言模式：{mode}。搞笑程度：英文 {en}、粵語 {yue}。',
      '語言模式：{mode}。搞笑程度：英文 {en}、粵語 {yue}。',
      '而家用緊 {mode}，搞笑程度英文 {en}、粵語 {yue}。',
      '而家用緊 {mode}，搞笑程度英文 {en}、粵語 {yue}。啲事實一個字都冇郁過。',
      '而家用緊 {mode}，搞笑程度英文 {en}、粵語 {yue}。轉咗嘅淨係語氣，成版嘅數字、commit id 同警告一個字都冇郁。',
    ],
  },

  'toast.regex.invalid': {
    en: [
      'That pattern will not compile: {error}',
      'That pattern will not compile: {error}',
      'The browser refused that pattern: {error}',
      'The browser looked at that pattern and said no: {error}',
      'The browser took one look at that pattern and declined to compile it: {error}',
    ],
    yue: [
      '呢個 pattern 編譯唔到：{error}',
      '呢個 pattern 編譯唔到：{error}',
      '瀏覽器唔收呢個 pattern：{error}',
      '瀏覽器望咗一眼呢個 pattern 就耍手擰頭：{error}',
      '瀏覽器望咗一眼呢個 pattern，即刻話唔編譯得：{error}',
    ],
  },

  /* ---- command palette ------------------------------------------------ */

  'palette.open': { en: 'Open the command palette', yue: '打開指令面板' },
  'palette.heading': { en: 'Command palette', yue: '指令面板' },
  'palette.placeholder': { en: 'Search commands, settings and destinations', yue: '搵指令、設定同去邊度' },
  'palette.hint': {
    en: 'A row that is a setting shows the setting. Change it here, or press Enter to go to where it lives.',
    yue: '如果嗰行本身就係個設定，就會直接show個設定出嚟。你可以喺度改，或者㩒 Enter 去佢原本嗰個位。',
  },
  'palette.empty': {
    en: [
      'No command matches {query}.',
      'No command matches {query}.',
      'No command matches {query}.',
      'No command matches {query}. There may simply not be one yet.',
      'No command matches {query}. Either it has not been written yet, or it is hiding, and only one of those is fixable.',
    ],
    yue: [
      '冇指令配到 {query}。',
      '冇指令配到 {query}。',
      '冇指令配到 {query}。',
      '冇指令配到 {query}。可能根本仲未有呢個指令。',
      '冇指令配到 {query}。要唔係仲未寫，要唔係佢匿埋咗，而得一樣係補救到嘅。',
    ],
  },
  'palette.group.navigate': { en: 'Go to', yue: '去邊度' },
  'palette.group.settings': { en: 'Settings', yue: '設定' },
  'palette.group.actions': { en: 'Actions', yue: '動作' },

  /* ---- the dim sum surprise ------------------------------------------- */

  'dimsum.title': {
    en: [
      'Dim sum',
      'Dim sum',
      'A steamer basket arrived',
      'A steamer basket arrived, uninvited',
      'A steamer basket has arrived and is not leaving',
    ],
    yue: ['點心', '點心', '上咗籠點心', '有籠點心自己上咗枱', '有籠點心上咗枱，唔打算走'],
  },

  'dimsum.body': {
    en: [
      'Today’s dish: {dish} · {zh}.',
      'Today’s dish: {dish} · {zh}.',
      'On the table today: {dish} · {zh}. Nobody ordered it.',
      'On the table today: {dish} · {zh}. Nobody ordered it and nobody is complaining.',
      'On the table today: {dish} · {zh}. Nobody ordered it, nobody is complaining, and it will clear itself away in a moment.',
    ],
    yue: [
      '今日嘅菜式：{dish} · {zh}。',
      '今日嘅菜式：{dish} · {zh}。',
      '今日上枱：{dish} · {zh}。冇人落過單。',
      '今日上枱：{dish} · {zh}。冇人落過單，不過都冇人嘈。',
      '今日上枱：{dish} · {zh}。冇人落過單，冇人嘈，佢陣間自己會收埋。',
    ],
  },

  'dimsum.note': {
    en: 'A dish appears on roughly one page load in ten. It never blocks the page and there is no way to turn it off.',
    yue: '大約每十次載入呢版就會上一次點心。佢唔會阻住個版，亦冇得閂。',
  },

  /* ---- the first-visit disclosure ------------------------------------- *
   *
   * Required by the standard: state plainly, on first visit, that the tone
   * setting styles ALL messages including errors and warnings, and say where
   * to change it. Every level says all of that; only the wrapping moves.
   */

  'disclosure.title': {
    en: [
      'This site has an adjustable tone',
      'This site has an adjustable tone',
      'This site has a personality setting',
      'This site has a personality setting, and it is turned up',
      'Yes, the site is talking like this on purpose',
    ],
    yue: [
      '呢個站嘅語氣係可以調嘅',
      '呢個站嘅語氣係可以調嘅',
      '呢個站有個「性格」設定',
      '呢個站有個「性格」設定，而家仲扭得幾高',
      '係，佢咁講嘢係特登嘅',
    ],
  },

  'disclosure.body': {
    en: [
      'The copy on this site has an adjustable tone, from fully professional to maximum playfulness, with separate levels for English and Cantonese. It styles every message, including errors and warnings. The facts never change, only the voice. Change it in Settings, under Language mode.',
      'The copy on this site has an adjustable tone, from fully professional to maximum playfulness, with separate levels for English and Cantonese. It styles every message, including errors and warnings. The facts never change, only the voice. Change it in Settings, under Language mode.',
      'The copy here has an adjustable tone, from fully professional to maximum playfulness, with separate levels for English and Cantonese. It styles every message, including errors and warnings — but the facts never change, only the voice. Change it in Settings, under Language mode.',
      'The copy here has a tone dial that goes from fully professional to maximum playfulness, with separate levels for English and Cantonese. It styles every message, including errors and warnings — and the facts never change, only the voice. Change it in Settings, under Language mode.',
      'The copy here has a tone dial running from fully professional to maximum playfulness, with separate levels for English and Cantonese, and somebody has clearly been at it. It styles every message, including errors and warnings — but the facts never change, only the voice: a warning that names a file at the deadpan end still names exactly the same file at the playful end. Change it in Settings, under Language mode.',
    ],
    yue: [
      '呢個站嘅文字語氣係可以調嘅，由完全正經去到玩到盡，英文同粵語各有獨立級數。佢會影響每一句，包括錯誤同警告。事實永遠唔會變，變嘅淨係語氣。想改就入設定，喺語言模式嗰度。',
      '呢個站嘅文字語氣係可以調嘅，由完全正經去到玩到盡，英文同粵語各有獨立級數。佢會影響每一句，包括錯誤同警告。事實永遠唔會變，變嘅淨係語氣。想改就入設定，喺語言模式嗰度。',
      '呢度啲文字語氣可以調，由完全正經去到玩到盡，英文同粵語各有獨立級數。佢會影響每一句，包括錯誤同警告 — 但係事實永遠唔會變，變嘅淨係語氣。想改就入設定，喺語言模式嗰度。',
      '呢度啲文字有條語氣掣，由完全正經扭到玩到盡，英文同粵語各有獨立級數。佢會影響每一句，包括錯誤同警告 — 而事實永遠唔會變，變嘅淨係語氣。想改就入設定，喺語言模式嗰度。',
      '呢度啲文字有條語氣掣，由完全正經扭到玩到盡，英文同粵語各有獨立級數，而顯然有人扭咗佢。佢會影響每一句，包括錯誤同警告 — 但事實永遠唔會變，變嘅淨係語氣：死板嗰頭個警告講邊個檔案，玩到盡嗰頭都係講返同一個檔案。想改就入設定，喺語言模式嗰度。',
    ],
  },

  'disclosure.dismiss': { en: 'Got it', yue: '明白' },
  'disclosure.settings': { en: 'Open language settings', yue: '打開語言設定' },

  /* ---- about and provenance ------------------------------------------- *
   *
   * The fact-density test case for the whole system. Four facts appear in all
   * ten variants, byte for byte: the directory `design/`, the upstream release
   * `Open Design v0.16.1`, the pinned commit, and `Apache-2.0`.
   */

  'about.heading': { en: 'About', yue: '關於' },

  'about.upstream': {
    en: [
      'The application source in design/ is a byte-for-byte port of Open Design v0.16.1, pinned at commit 517f39acde402c1a7af2189167a8d6957a3dac71 and licensed under Apache-2.0.',
      'The application source in design/ is a byte-for-byte port of Open Design v0.16.1, pinned at commit 517f39acde402c1a7af2189167a8d6957a3dac71 and licensed under Apache-2.0.',
      'Everything under design/ is Open Design v0.16.1 copied verbatim — pinned at commit 517f39acde402c1a7af2189167a8d6957a3dac71, licensed under Apache-2.0, and left exactly as it arrived.',
      'Everything under design/ is Open Design v0.16.1 copied verbatim: same bytes, no clever edits, pinned at commit 517f39acde402c1a7af2189167a8d6957a3dac71 and licensed under Apache-2.0.',
      'Everything under design/ is Open Design v0.16.1 copied verbatim — same bytes, no clever edits, pinned at commit 517f39acde402c1a7af2189167a8d6957a3dac71 so the claim can be checked instead of believed. Apache-2.0, and the licence text travels with it.',
    ],
    yue: [
      'design/ 入面嘅程式碼係 Open Design v0.16.1 逐個 byte 移植過嚟，釘死喺 commit 517f39acde402c1a7af2189167a8d6957a3dac71，授權係 Apache-2.0。',
      'design/ 入面嘅程式碼係 Open Design v0.16.1 逐個 byte 移植過嚟，釘死喺 commit 517f39acde402c1a7af2189167a8d6957a3dac71，授權係 Apache-2.0。',
      'design/ 入面每個檔案都係 Open Design v0.16.1 原封不動抄過嚟 — 釘死喺 commit 517f39acde402c1a7af2189167a8d6957a3dac71，授權 Apache-2.0，收到嗰陣點樣就係點樣。',
      'design/ 入面每個檔案都係 Open Design v0.16.1 原汁原味搬過嚟：同一份 bytes，一個字都冇改，釘死喺 commit 517f39acde402c1a7af2189167a8d6957a3dac71，授權 Apache-2.0。',
      'design/ 入面每個檔案都係 Open Design v0.16.1 原汁原味搬過嚟 — 同一份 bytes，一個字都冇改，仲釘死喺 commit 517f39acde402c1a7af2189167a8d6957a3dac71，唔係叫你信，係畀你自己核對。授權 Apache-2.0，licence 文本跟埋一齊過嚟。',
    ],
  },

  'about.additions': {
    en: 'What this repository adds is the Material Design 3 redesign, a minimal rebrand, and the standards work. Every change to the ported tree is declared in MODIFICATIONS.md, which a script enforces.',
    yue: '呢個 repository 加返嘅係 Material Design 3 重新設計、最低限度嘅改名，同埋各項標準工作。改咗移植樹入面邊個檔案，全部要喺 MODIFICATIONS.md 度申報，有 script 幫手把關。',
  },

  'about.privacy': {
    en: [
      'This site makes no network requests. Every asset is bundled locally: no content delivery network, no web fonts, no analytics, no third-party trackers.',
      'This site makes no network requests. Every asset is bundled locally — no content delivery network, no web fonts, no analytics, no third-party trackers.',
      'This site makes no network requests at all. Every asset is bundled locally: no content delivery network, no web fonts, no analytics, no third-party trackers.',
      'This site makes no network requests at all. Every asset is bundled locally — no content delivery network, no web fonts, no analytics, no third-party trackers, nothing watching you read.',
      'This site makes no network requests at all, which makes the privacy policy refreshingly short. Every asset is bundled locally: no content delivery network, no web fonts, no analytics, no third-party trackers, and nothing at all watching you read this sentence.',
    ],
    yue: [
      '呢個站唔會發任何網絡請求。所有資源都係本機打包：冇 CDN、冇 web font、冇分析、冇第三方追蹤。',
      '呢個站唔會發任何網絡請求。所有資源都係本機打包 — 冇 CDN、冇 web font、冇分析、冇第三方追蹤。',
      '呢個站完全唔會發網絡請求。所有資源都係本機打包：冇 CDN、冇 web font、冇分析、冇第三方追蹤。',
      '呢個站完全唔會發網絡請求。所有資源都係本機打包 — 冇 CDN、冇 web font、冇分析、冇第三方追蹤，冇嘢喺度睇住你。',
      '呢個站完全唔會發網絡請求，所以私隱政策短到得意。所有資源都係本機打包：冇 CDN、冇 web font、冇分析、冇第三方追蹤，亦都完全冇嘢喺度睇住你讀緊呢句。',
    ],
  },

  'about.licence': {
    en: 'Licensed under Apache-2.0. The full licence text ships with the source.',
    yue: '授權係 Apache-2.0。完整授權條文跟原始碼一齊出。',
  },

  /* ---- common controls ------------------------------------------------ */

  'common.copy': {
    en: ['Copy', 'Copy', 'Copy', 'Copy it', 'Copy it'],
    yue: ['複製', '複製', '抄低佢', '抄低佢', '抄低佢'],
  },
  'common.close': { en: 'Close', yue: '閂咗佢' },
  'common.cancel': { en: 'Cancel', yue: '取消' },
  'common.back': { en: 'Back', yue: '返上一步' },
  'common.learnMore': { en: 'Learn more', yue: '睇多啲' },
  'common.openInNewTab': { en: 'Opens in a new tab', yue: '會喺新分頁打開' },

  /* ---- accessibility -------------------------------------------------- */

  'a11y.skipToContent': { en: 'Skip to the main content', yue: '跳去主要內容' },
  'a11y.mainNav': { en: 'Site sections', yue: '網站分頁' },
  'a11y.themeToggle': { en: 'Switch between the light and dark themes', yue: '喺淺色同深色主題之間切換' },
  'a11y.langNote': {
    en: 'Cantonese text on this page is marked up as zh-HK so a screen reader reads it in the right voice.',
    yue: '呢版嘅粵語文字標咗做 zh-HK，咁螢幕閱讀器就會用啱嘅聲讀出嚟。',
  },
};

/* ========================================================================== *
 * 5. Specification samples
 * ========================================================================== *
 *
 * Transcribed verbatim from the design mockup's Language & tone panel. They
 * are the standard's own worked example of voice-not-facts: every English
 * level names the same defect (a crash on empty input) and the same fix, and
 * every Cantonese level does the same. The settings surface renders these
 * beside the sliders as a live sample.
 */

export const TONE_SAMPLES = Object.freeze({
  en: Object.freeze([
    'Fixed the crash on empty input.',
    'Fixed the crash on empty input — it deserved it.',
    'Empty input used to take the whole window down. It does not any more.',
    'The parser saw an empty string and staged a walkout. Negotiations concluded.',
    'Empty input crashed the app, which is a bold interpretation of "handle gracefully". Fixed.',
  ]),
  yue: Object.freeze([
    '修好咗空白輸入嘅問題。',
    '空白輸入唔會再拉閘。',
    '之前入空白直頭閂咗成個窗，家陣乖曬。',
    '個 parser 見到空字串就話唔撈，傾掂數返咗工。',
    '空白輸入炸咗成個 app，講句「優雅處理」都面紅，而家真係修好。',
  ]),
});

/** The one-line sample shown against each language-mode radio, per the mockup. */
export const MODE_SAMPLES = Object.freeze({
  en: 'Release published. Installer attached.',
  yue: '出咗版喇，安裝檔跟埋落去。',
  bilingual: 'Release published. · 出咗版喇。',
});

/* ========================================================================== *
 * 6. Resolution
 * ========================================================================== */

/** Live catalogue. `register()` extends it; the frozen literal above seeds it. */
const catalogue = Object.assign(Object.create(null), CATALOGUE);

const warnedKeys = new Set();

function warnOnce(key, message) {
  if (warnedKeys.has(key)) return;
  warnedKeys.add(key);
  console.warn('[i18n] ' + message);
}

/**
 * Pick the authored variant for a language and funny level.
 *
 * Arrays carry forward: a 3-element array serves levels 3, 4 and 5 from its
 * last entry. A plain string ignores the level entirely, which is the right
 * answer for identifiers and licence names.
 */
function variantFor(entry, language, level) {
  const side = entry[language];
  if (typeof side === 'string') return side;
  if (!Array.isArray(side) || side.length === 0) return null;
  const index = Math.min(side.length - 1, Math.max(0, level - 1));
  return side[index];
}

/** Replace {placeholders}. Unknown ones are left visible rather than blanked. */
function format(text, params) {
  if (!params) return text;
  return text.replace(/\{([A-Za-z0-9_]+)\}/g, (whole, name) => {
    if (Object.prototype.hasOwnProperty.call(params, name)) return String(params[name]);
    return whole;
  });
}

/**
 * Resolve one language's text for a key.
 * Returns null when the key or that language's side is missing, so callers can
 * decide what to do rather than being handed a silent empty string.
 */
export function tRaw(key, language, level, params) {
  const entry = catalogue[key];
  if (!entry) {
    warnOnce(key, 'missing key: ' + key);
    return null;
  }
  const resolvedLevel = normaliseLevel(level, state.funny[language] ?? DEFAULTS.funnyEn);
  const text = variantFor(entry, language, resolvedLevel);
  if (text === null || text === undefined) {
    warnOnce(key + '/' + language, 'key "' + key + '" has no ' + language + ' variant.');
    return null;
  }
  return format(text, params);
}

/**
 * Resolve a key into its renderable parts for the current mode.
 *
 * Returns `{ primary, primaryLang, secondary, secondaryLang }`. `secondary` is
 * null outside bilingual mode. English is the primary half of bilingual mode,
 * matching the mockup's sample: "Release published. · 出咗版喇。"
 */
export function tParts(key, params) {
  const en = tRaw(key, 'en', state.funny.en, params);
  const yue = tRaw(key, 'yue', state.funny.yue, params);

  // A missing key renders as its own name in brackets. Loud, but never blank,
  // and never a stray English string sitting in a Cantonese-only page.
  if (en === null && yue === null) {
    return { primary: '[' + key + ']', primaryLang: BCP47.en, secondary: null, secondaryLang: null };
  }

  if (state.mode === 'en') {
    // If the English side is somehow absent, show the Cantonese but tag it
    // zh-HK so a screen reader does not read it with an English voice.
    if (en === null) return { primary: yue, primaryLang: BCP47.yue, secondary: null, secondaryLang: null };
    return { primary: en, primaryLang: BCP47.en, secondary: null, secondaryLang: null };
  }

  if (state.mode === 'yue') {
    if (yue === null) return { primary: en, primaryLang: BCP47.en, secondary: null, secondaryLang: null };
    return { primary: yue, primaryLang: BCP47.yue, secondary: null, secondaryLang: null };
  }

  // Bilingual. If one side is missing there is nothing to pair, so it degrades
  // to the single language it does have rather than showing a duplicate.
  if (en === null) return { primary: yue, primaryLang: BCP47.yue, secondary: null, secondaryLang: null };
  if (yue === null) return { primary: en, primaryLang: BCP47.en, secondary: null, secondaryLang: null };
  return { primary: en, primaryLang: BCP47.en, secondary: yue, secondaryLang: BCP47.yue };
}

/**
 * The everyday accessor: one display string for the current mode and levels.
 * In bilingual mode the two halves are joined with ' · ' on one line, which is
 * what an attribute value or a plain-text context needs. For element content,
 * prefer `applyI18n` or `tParts` so the two halves can be laid out properly.
 */
export function t(key, params) {
  const parts = tParts(key, params);
  return parts.secondary ? parts.primary + BILINGUAL_SEPARATOR + parts.secondary : parts.primary;
}

/**
 * Count-aware lookup. Expects `<base>.one` and `<base>.other` keys, and passes
 * `count` through as a parameter so the number itself is never lost.
 */
export function plural(baseKey, count, params) {
  const suffix = Math.abs(count) === 1 ? '.one' : '.other';
  return t(baseKey + suffix, Object.assign({ count: count }, params));
}

/** Is this key known? Used by the page search and the command palette. */
export function has(key) {
  return Object.prototype.hasOwnProperty.call(catalogue, key);
}

/** Every key, sorted. */
export function keys() {
  return Object.keys(catalogue).sort();
}

/**
 * Every key with its currently-resolved text, for indexing. The site search
 * indexes rendered DOM rather than this, but the command palette and any
 * offline check want the catalogue itself.
 */
export function entries() {
  return keys().map((key) => ({ key: key, text: t(key), parts: tParts(key) }));
}

/**
 * Add strings at runtime. This is the extension point that keeps the mechanism
 * general: another module can contribute its own namespace without editing
 * this file. Existing keys are not overwritten unless asked, so a late
 * registration cannot quietly redefine the release notice.
 */
export function register(moreEntries, options) {
  const overwrite = Boolean(options && options.overwrite);
  let added = 0;
  for (const key of Object.keys(moreEntries)) {
    if (!overwrite && has(key)) {
      console.warn('[i18n] refusing to redefine existing key: ' + key);
      continue;
    }
    catalogue[key] = moreEntries[key];
    added += 1;
  }
  return added;
}

/* ========================================================================== *
 * 7. Applying to the DOM
 * ========================================================================== */

/**
 * Where an element's text should go. An element that already contains markup
 * (an icon, say) declares a `.i18n-text` child; otherwise the element itself
 * is the target and its content is replaced wholesale.
 */
function textTargetFor(element) {
  const slot = element.querySelector(':scope > .i18n-text');
  return slot || element;
}

function renderParts(target, parts, inline) {
  // Clear without innerHTML, so nothing in the catalogue can ever be parsed
  // as markup even by accident.
  while (target.firstChild) target.removeChild(target.firstChild);

  if (!parts.secondary) {
    target.setAttribute('lang', parts.primaryLang);
    target.appendChild(document.createTextNode(parts.primary));
    return;
  }

  // Bilingual: two spans plus a separator that CSS shows only in inline mode.
  // The wrapper carries no `lang` of its own, because it now holds two.
  target.removeAttribute('lang');

  const primary = document.createElement('span');
  primary.className = 'i18n-primary';
  primary.setAttribute('lang', parts.primaryLang);
  primary.textContent = parts.primary;

  const separator = document.createElement('span');
  separator.className = 'i18n-sep';
  separator.setAttribute('aria-hidden', 'true');
  separator.textContent = BILINGUAL_SEPARATOR;

  const secondary = document.createElement('span');
  secondary.className = 'i18n-secondary';
  secondary.setAttribute('lang', parts.secondaryLang);
  secondary.textContent = parts.secondary;

  target.appendChild(primary);
  target.appendChild(separator);
  target.appendChild(secondary);

  if (inline) target.classList.add('i18n-inline-content');
  else target.classList.remove('i18n-inline-content');
}

function paramsFor(element) {
  const raw = element.getAttribute('data-i18n-params');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn('[i18n] data-i18n-params is not valid JSON on', element, error);
    return null;
  }
}

/**
 * Walk `root` and fill in everything marked up for translation.
 *
 * This is the single call the whole site re-renders through: change a mode or
 * a slider and `applyI18n(document)` brings every static string up to date.
 * JavaScript-built surfaces (toasts, the palette, the tab list) subscribe with
 * `onChange` instead, because their DOM does not exist until they draw it.
 */
export function applyI18n(root) {
  const scope = root || document;

  let unknown = 0;

  for (const element of scope.querySelectorAll('[data-i18n]')) {
    const key = element.getAttribute('data-i18n');
    if (!key) continue;
    // An unknown key leaves the element's own markup alone. Every translatable
    // element in this page ships real English text as its content, so falling
    // back to that reads correctly; replacing it with "[some.key.name]" would
    // not. The count is reported once below rather than per element, because a
    // page mid-translation would otherwise bury the console.
    if (!has(key)) {
      element.setAttribute('data-i18n-fallback', '');
      unknown += 1;
      continue;
    }
    element.removeAttribute('data-i18n-fallback');
    const inline = element.hasAttribute('data-i18n-inline');
    renderParts(textTargetFor(element), tParts(key, paramsFor(element)), inline);
  }

  if (unknown > 0 && (scope === document || scope === document.documentElement)) {
    console.info(
      '[i18n] ' + unknown + ' element(s) fell back to their inline English text ' +
      'because no catalogue entry exists yet. They are marked with ' +
      'data-i18n-fallback in the DOM.',
    );
  }

  // Attributes: `data-i18n-attr="aria-label:a11y.copy; title:common.copy"`.
  // Always one line, because an attribute cannot hold two language spans.
  for (const element of scope.querySelectorAll('[data-i18n-attr]')) {
    const spec = element.getAttribute('data-i18n-attr') || '';
    const params = paramsFor(element);
    for (const pair of spec.split(';')) {
      const trimmed = pair.trim();
      if (!trimmed) continue;
      const splitAt = trimmed.indexOf(':');
      if (splitAt < 1) {
        console.warn('[i18n] malformed data-i18n-attr segment: "' + trimmed + '"');
        continue;
      }
      const attribute = trimmed.slice(0, splitAt).trim();
      const key = trimmed.slice(splitAt + 1).trim();
      if (!attribute || !key) continue;
      // Same fallback rule as element content: an unknown key leaves whatever
      // the markup already set. An aria-label reading "[a11y.something]" is
      // worse for a screen-reader user than the plain English one in the HTML.
      if (!has(key)) continue;
      element.setAttribute(attribute, t(key, params));
    }
  }

  // Only the whole-document pass owns the root language attributes.
  if (scope === document || scope === document.documentElement) {
    const root_ = document.documentElement;
    // Bilingual pages are primarily English with zh-HK spans inside them, so
    // the document language is the primary half and the spans carry the rest.
    root_.setAttribute('lang', state.mode === 'yue' ? BCP47.yue : BCP47.en);
    root_.setAttribute('data-lang-mode', state.mode);
    root_.setAttribute('data-funny-en', String(state.funny.en));
    root_.setAttribute('data-funny-yue', String(state.funny.yue));
  }

  return scope;
}

/* ========================================================================== *
 * 8. Reading and changing the settings
 * ========================================================================== */

const listeners = new Set();

/**
 * Subscribe to mode or level changes. Returns an unsubscribe function.
 * Modules that build their own DOM use this to redraw; static markup does not
 * need it, because `applyI18n(document)` runs automatically on every change.
 */
export function onChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(reason) {
  const detail = {
    reason: reason,
    mode: state.mode,
    funny: { en: state.funny.en, yue: state.funny.yue },
  };

  // Static markup first, so subscribers see a consistent document.
  if (typeof document !== 'undefined' && document.documentElement) applyI18n(document);

  for (const listener of listeners) {
    try {
      listener(detail);
    } catch (error) {
      console.error('[i18n] a change listener threw', error);
    }
  }

  if (typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent('md-i18n:change', { detail: detail }));
  }
}

export function getMode() {
  return state.mode;
}

export function setMode(mode) {
  const next = normaliseMode(mode);
  if (next === state.mode) return state.mode;
  state.mode = next;
  writeStored(STORE_KEYS.mode, next);
  notify('mode');
  return next;
}

/** `language` is 'en' or 'yue' — never 'bilingual', which has no level of its own. */
export function getFunny(language) {
  return state.funny[language] ?? DEFAULTS.funnyEn;
}

export function setFunny(language, level) {
  if (!LANGUAGES.includes(language)) {
    console.warn('[i18n] setFunny expects "en" or "yue", got: ' + language);
    return null;
  }
  const next = normaliseLevel(level, state.funny[language]);
  if (next === state.funny[language]) return next;
  state.funny[language] = next;
  writeStored(language === 'en' ? STORE_KEYS.funnyEn : STORE_KEYS.funnyYue, String(next));
  notify('funny:' + language);
  return next;
}

/** The whole language state in one object, for the palette and for exports. */
export function getState() {
  return { mode: state.mode, funny: { en: state.funny.en, yue: state.funny.yue } };
}

/** Back to the documented defaults: bilingual, English 3, Cantonese 4. */
export function resetLanguageSettings() {
  state.mode = DEFAULTS.mode;
  state.funny.en = DEFAULTS.funnyEn;
  state.funny.yue = DEFAULTS.funnyYue;
  writeStored(STORE_KEYS.mode, DEFAULTS.mode);
  writeStored(STORE_KEYS.funnyEn, String(DEFAULTS.funnyEn));
  writeStored(STORE_KEYS.funnyYue, String(DEFAULTS.funnyYue));
  notify('reset');
  return getState();
}

/** Human-readable name of the active mode, for the change toast. */
export function modeLabel(mode) {
  const which = mode || state.mode;
  return t('settings.language.mode.' + which);
}

/** Human-readable name of a funny level, for the sliders and the palette. */
export function funnyLabel(level) {
  return t('settings.funny.level.' + normaliseLevel(level, DEFAULTS.funnyEn));
}

/* ========================================================================== *
 * 9. First-visit disclosure
 * ========================================================================== */

/**
 * The standard requires the tone behaviour to be disclosed on first visit and
 * in the setting itself: that it styles ALL copy including errors and
 * warnings, and where to change it. This is the first-visit half.
 */
export function shouldShowDisclosure() {
  return readStored(STORE_KEYS.disclosed) !== '1';
}

export function markDisclosureSeen() {
  writeStored(STORE_KEYS.disclosed, '1');
}

/** Exposed so "show me that notice again" is possible from Settings. */
export function resetDisclosure() {
  writeStored(STORE_KEYS.disclosed, '0');
}

/* ========================================================================== *
 * 10. The audits
 * ========================================================================== *
 *
 * These are what make "voice only, never facts" a checkable claim rather than
 * an intention. Nothing here runs in production unless asked for.
 */

/**
 * Tokens that count as facts. Deliberately over-eager: the same text is run
 * through the same patterns for every variant, so double counting is
 * harmless, while a missing version or a dropped placeholder is caught.
 */
const FACT_PATTERNS = [
  /\{[A-Za-z0-9_]+\}/g, // interpolation placeholders
  /\b[0-9a-f]{7,40}\b/g, // commit ids
  /\bv?\d+(?:\.\d+)+\b/g, // version numbers
  /\d+(?:[.,]\d+)?%?/g, // any bare number or percentage
  /\bApache-2\.0\b/gi, // licence terms
  /\bMIT\b/g,
  /\b[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]*/g, // paths such as design/ or a/b/c.json
];

function factsIn(text) {
  const found = [];
  for (const pattern of FACT_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = text.match(pattern);
    if (matches) found.push(...matches);
  }
  return found.sort().join('␟');
}

function allVariants(entry, language) {
  const side = entry[language];
  if (typeof side === 'string') return [side];
  if (Array.isArray(side)) return side.slice();
  return [];
}

/**
 * Check that every variant of every entry carries the same facts as its
 * baseline (English, level 1) — across funny levels AND across languages.
 *
 * Returns an array of problems; an empty array means the catalogue holds the
 * line. Import it from a test, or add `?i18nAudit=1` to the URL.
 */
export function auditFacts() {
  const problems = [];

  for (const key of Object.keys(catalogue)) {
    const entry = catalogue[key];
    const baselineText = allVariants(entry, 'en')[0];
    if (baselineText === undefined) continue;
    const baseline = factsIn(baselineText);

    for (const language of LANGUAGES) {
      const variants = allVariants(entry, language);
      variants.forEach((text, index) => {
        const facts = factsIn(text);
        if (facts !== baseline) {
          problems.push({
            key: key,
            language: language,
            level: index + 1,
            expected: baseline.split('␟').filter(Boolean),
            actual: facts.split('␟').filter(Boolean),
            text: text,
          });
        }
      });
    }
  }

  return problems;
}

/**
 * Check every key has both languages, and that neither side is an empty
 * string. A half-translated catalogue presented as translated is the failure
 * the standard calls out by name.
 */
export function auditCoverage() {
  const problems = [];

  for (const key of Object.keys(catalogue)) {
    const entry = catalogue[key];
    for (const language of LANGUAGES) {
      const variants = allVariants(entry, language);
      if (variants.length === 0) {
        problems.push({ key: key, language: language, problem: 'missing' });
        continue;
      }
      variants.forEach((text, index) => {
        if (typeof text !== 'string' || text.trim() === '') {
          problems.push({ key: key, language: language, level: index + 1, problem: 'empty' });
        }
        if (Array.isArray(entry[language]) && entry[language].length > FUNNY_MAX) {
          problems.push({ key: key, language: language, problem: 'more than ' + FUNNY_MAX + ' variants' });
        }
      });
    }
  }

  return problems;
}

/** Both audits, printed. Returns true when the catalogue is clean. */
export function audit() {
  const coverage = auditCoverage();
  const facts = auditFacts();

  if (coverage.length === 0 && facts.length === 0) {
    console.info(
      '[i18n] audit clean: ' + Object.keys(catalogue).length + ' keys, ' +
        'both languages present, facts identical across every level and language.',
    );
    return true;
  }

  if (coverage.length) console.error('[i18n] coverage problems', coverage);
  if (facts.length) console.error('[i18n] FACT DRIFT — a variant gained or lost a fact', facts);
  return false;
}

/* ========================================================================== *
 * 11. Start-up
 * ========================================================================== */

/**
 * Read the stored preferences, paint the document, and return the state.
 * Safe to call more than once. `main.js` calls this before anything else so
 * the page never flashes untranslated markup.
 */
export function init() {
  if (typeof document !== 'undefined' && document.documentElement) applyI18n(document);

  // The audit is a development tool, not a production one. It runs when the
  // page is opened from disk or a local server, or when explicitly requested.
  if (typeof window !== 'undefined') {
    const host = window.location ? window.location.hostname : '';
    const asked = window.location && /[?&]i18nAudit=1\b/.test(window.location.search);
    const local = host === '' || host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    if (asked || local) audit();
  }

  return getState();
}

export default {
  STORAGE_PREFIX,
  LANG_MODES,
  LANGUAGES,
  FUNNY_MIN,
  FUNNY_MAX,
  DEFAULTS,
  TONE_SAMPLES,
  MODE_SAMPLES,
  t,
  tParts,
  tRaw,
  plural,
  has,
  keys,
  entries,
  register,
  applyI18n,
  onChange,
  getMode,
  setMode,
  getFunny,
  setFunny,
  getState,
  resetLanguageSettings,
  modeLabel,
  funnyLabel,
  shouldShowDisclosure,
  markDisclosureSeen,
  resetDisclosure,
  auditFacts,
  auditCoverage,
  audit,
  init,
};
