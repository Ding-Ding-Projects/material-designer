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
   * The most important strings on the site, and the ones most likely to be
   * wrong: they describe a state of the world that changes underneath them.
   * They said "nothing has been built" until continuous integration built
   * something, and correcting them was part of that same change rather than a
   * later tidy-up.
   *
   * No variant here names a version, a tag or a checksum. Those live in the
   * markup on the Releases panel, in exactly one place, because a fact spread
   * across ten authored variants is a fact that will be right in nine of them.
   * What every variant must carry is the shape of the claim: built, tested,
   * installed, started, uninstalled, and only then published — and that a run
   * which fails any of it publishes nothing.
   */

  'release.heading': { en: 'Download', yue: '下載' },

  'release.now.title': {
    en: [
      'There is an installer, and it was tested before it was published',
      'There is an installer, and it was tested before it was published',
      'There is an installer, and it was tested before anybody was offered it',
      'There is an installer, and it had to earn its way out',
      'There is an installer, and it did not get out of the building without being installed, started and thrown away again first',
    ],
    yue: [
      '有安裝檔，而且出之前測試過',
      '有安裝檔，而且出之前測試過',
      '有安裝檔，而且係測試過先至畀人載',
      '有安裝檔，佢要考過試先走得出嚟',
      '有安裝檔，不過佢要畀人裝一次、開一次、再拆一次，先至走得出嚟',
    ],
  },

  'release.now.body': {
    en: [
      'Continuous integration builds the Windows application, runs its tests, then installs the result, launches it, checks that the running process answers its own health endpoint, and uninstalls it again. Only then does it publish. A run that fails any of that publishes nothing, so a release existing means those steps passed.',
      'Continuous integration builds the Windows application, runs its tests, then installs what it built, launches it, checks the running process answers its own health endpoint, and uninstalls it again. Only then does it publish. A run that fails any of that publishes nothing, so a release existing means those steps passed.',
      'Continuous integration builds the Windows application and runs its tests. Then it installs what it built, launches it, waits for the running process to answer its own health endpoint, and uninstalls it again — and only then publishes. A run that fails any of that publishes nothing at all, so a release existing is itself the evidence that those steps passed.',
      'The build does not get to mark its own homework. Continuous integration builds the Windows application, runs its tests, installs what it built, launches it, waits for the running process to answer its own health endpoint, and uninstalls it again. Publishing happens after all of that or not at all — a run that fails any step publishes nothing, so a release existing is the evidence that those steps passed.',
      'Nobody here takes the build at its word. Continuous integration compiles the Windows application, runs its tests, then puts the installer through what a user would: it installs it, launches it, waits for the running process to answer its own health endpoint, and uninstalls it again. Publishing comes after all of that or not at all — a run that fails any step publishes precisely nothing, which is why a release existing is itself the evidence that those steps passed.',
    ],
    yue: [
      'Continuous integration 會 build 個 Windows app、行晒啲測試，跟住裝返出嚟嘅結果、開佢、確認個行緊嘅 process 應到自己個 health endpoint，之後再解除安裝。做齊晒先至出版。中間有一步唔過就乜都唔會出，所以有 release 出到，即係嗰幾步真係過咗。',
      'Continuous integration 會 build 個 Windows app、行晒啲測試，跟住裝返佢 build 出嚟嗰個、開佢、確認個行緊嘅 process 應到自己個 health endpoint，之後再解除安裝。做齊晒先至出版。中間有一步唔過就乜都唔會出，所以有 release 出到，即係嗰幾步真係過咗。',
      'Continuous integration 會 build 個 Windows app，行晒啲測試。然後將 build 出嚟嗰個裝落去、開佢、等個行緊嘅 process 應自己個 health endpoint，再解除安裝 — 全部做完先至出版。中間有一步唔過就一樣嘢都唔會出，所以有 release 出到，本身就係嗰幾步過咗嘅證據。',
      '份功課唔輪到佢自己改。Continuous integration 會 build 個 Windows app、行晒啲測試、裝返 build 出嚟嗰個、開佢、等個行緊嘅 process 應自己個 health endpoint，再解除安裝。做齊先出版，唔係就唔出 — 中間有一步唔過就乜都唔會出，所以有 release 出到，即係嗰幾步真係過咗。',
      '呢度冇人淨係聽個 build 自己講。Continuous integration 會砌好個 Windows app、行晒啲測試，然後照住用家會做嘅嘢玩多次：裝落去、開佢、等個行緊嘅 process 應自己個 health endpoint，再解除安裝。全部做完先出版，唔係就一個字都唔出 — 中間有一步唔過就真係乜都冇，所以有 release 出到，本身已經係嗰幾步過咗嘅證據。',
    ],
  },

  // The caveat matters more than the good news, so it never gets funnier than
  // the thing it is warning about.
  'release.now.note': {
    en: [
      'What that does not prove is that any particular feature works. The smoke test starts the application and stops it; it never touches the interface. The Standards section says, one requirement at a time, what is built and what is not.',
      'What that does not prove is that any particular feature works. The smoke test starts the application and stops it; it never touches the interface. The Standards section says, one requirement at a time, what is built and what is not.',
      'What it does not prove is that any particular feature works. The smoke test starts the application and stops it — it never touches the interface. The Standards section goes through the requirements one at a time and says which are built.',
      'What it does not prove is that any particular feature works. The smoke test opens the application and closes it again, and never once touches the interface. The Standards section goes through the requirements one at a time and says which are built.',
      'What it does not prove is that a single feature works. The smoke test opens the application, confirms it is breathing, and closes it — it never touches the interface at all. For anything more specific, the Standards section goes through the requirements one at a time and says which are built.',
    ],
    yue: [
      '不過咁樣證明唔到邊個功能行得。個 smoke test 只係開個 app 再閂返，完全冇掂過個介面。想知邊樣起好咗、邊樣未，「標準」嗰版逐項列晒。',
      '不過咁樣證明唔到邊個功能行得。個 smoke test 只係開個 app 再閂返，完全冇掂過個介面。想知邊樣起好咗、邊樣未，「標準」嗰版逐項列晒。',
      '不過咁樣證明唔到邊個功能行得。個 smoke test 淨係開個 app 再閂返 — 個介面佢一下都冇掂過。「標準」嗰版會逐項講清楚邊樣起好咗。',
      '不過咁樣證明唔到有邊個功能行得。個 smoke test 開個 app、閂返個 app，個介面由頭到尾一下都冇掂過。「標準」嗰版會逐項講清楚邊樣起好咗。',
      '不過咁樣連一個功能行唔行得都證明唔到。個 smoke test 開個 app、確認佢仲有氣、然後閂返 — 個介面佢真係一下都冇掂過。想知得再仔細啲，「標準」嗰版會逐項講清楚邊樣起好咗。',
    ],
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
      'The Material Design 3 redesign and the standards work are in progress. The token layer and the window chrome have landed in the application; everything else below is specified and not built.',
      'The Material Design 3 redesign and the standards work are in progress. The token layer and the window chrome have landed in the application; everything else below is specified and not built, and this page will not imply otherwise.',
      'Everything in this section is in progress. The Material Design 3 redesign has its token layer and window chrome in the application already; the rest below is specified and not built — there is a mockup, and there is not yet an application that looks like it.',
      'Everything in this section is somewhere between a plan and a product. The Material Design 3 redesign has landed its token layer and window chrome; the rest below is specified and not built — there is a mockup, and there is not yet an application that looks like it.',
      'Everything in this section is somewhere between a plan and a product, and the honest thing is to say which. The Material Design 3 redesign has landed its token layer and its window chrome in the application. Everything else below is specified and not built: the design exists, the application that looks like it does not, and that belongs on the page rather than in a footnote nobody opens.',
    ],
    yue: [
      'Material Design 3 重新設計同各項標準工作仲進行緊。Token 層同視窗外框已經落咗喺個 app 度；下面其餘嘅都係得個規格，未起。',
      'Material Design 3 重新設計同各項標準工作仲進行緊。Token 層同視窗外框已經落咗喺個 app 度；下面其餘嘅都係得個規格，未起，呢版都唔會扮做咗。',
      '呢一節入面每樣都仲進行緊。Material Design 3 重新設計嘅 token 層同視窗外框已經喺個 app 入面；下面其餘嘅得個規格，未起 — 有 mockup，但未有一個似 mockup 嘅 app。',
      '呢一節入面每樣都喺「計劃」同「成品」之間。Material Design 3 重新設計嘅 token 層同視窗外框已經落咗地；下面其餘嘅得個規格，未起 — 有 mockup，但未有一個似 mockup 嘅 app。',
      '呢一節入面每樣都喺「計劃」同「成品」之間，而老實做法就係講清楚邊樣係邊樣。Material Design 3 重新設計嘅 token 層同視窗外框已經落咗喺個 app 度。下面其餘嘅得個規格，未起：設計有，似設計嗰個 app 就未有 — 呢句應該擺喺版面講，唔係塞落冇人撳嘅註腳度。',
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

  /* ===================================================================== *
   * Chrome that is on screen no matter which panel is open.
   *
   * These four are the highest-traffic strings on the site by a wide margin,
   * which is the reason they are authored first rather than last. A status
   * bar that silently falls back to English in Cantonese mode is the most
   * visible possible advertisement that the language modes are decorative.
   * ===================================================================== */

  'chrome.subtitle': {
    en: [
      'Documentation and honest status',
      'Documentation and honest status',
      'Documentation, and a status that admits things',
      'Documentation, and a status page that tells on itself',
      'Documentation, and a status page with no incentive to flatter anybody',
    ],
    yue: [
      '文件同埋老實嘅進度',
      '文件同埋老實嘅進度',
      '文件，加一版肯認低嘅進度',
      '文件，加一版會篤自己背脊嘅進度',
      '文件，加一版冇理由幫邊個講靚話嘅進度',
    ],
  },

  // Level-invariant on purpose: this is a claim about network behaviour that
  // a reader may be checking with the browser's own tools open.
  'chrome.status.offline': { en: 'No network requests', yue: '零網絡請求' },

  'chrome.status.release': {
    en: ['Installer published', 'Installer published', 'Installer published', 'Installer is out', 'Installer is out'],
    yue: ['安裝檔已出', '安裝檔已出', '安裝檔已出', '安裝檔出咗喇', '安裝檔出咗喇'],
  },

  'find.results.heading': {
    en: ['Search results', 'Search results', 'What matched', 'What matched', 'What matched'],
    yue: ['搜尋結果', '搜尋結果', '夾到嘅嘢', '夾到嘅嘢', '夾到嘅嘢'],
  },

  /* ===================================================================== *
   * The status vocabulary.
   *
   * Every one of these is a plain string, and that is a deliberate refusal
   * rather than an omission. A status badge is read as a value, not as prose:
   * it is scanned down a column, compared between rows, and quoted back in an
   * issue. If "Not started" became "Not started (sadly)" at level four, two
   * rows carrying the same status would stop looking the same, and the column
   * would stop being scannable — which is the only job it has.
   *
   * The funny level restyles the sentence NEXT to the badge instead. That is
   * where the voice belongs, and it is why the site keeps the badge and its
   * explanation in two separate keys.
   * ===================================================================== */

  'status.works': { en: 'Works today', yue: '而家行得' },
  'status.runnable': { en: 'Runnable today', yue: '而家行得到' },
  'status.verified': { en: 'Verified', yue: '驗證咗' },
  'status.published': { en: 'Published', yue: '出咗' },
  'status.passed': { en: 'Passed', yue: '過咗' },
  'status.neverrun': { en: 'Never run', yue: '未行過' },
  'status.norun': { en: 'No run observed', yue: '未見過有運行紀錄' },
  'status.none': { en: 'None', yue: '冇' },
  'status.designed': { en: 'Designed, not built', yue: '設計咗，未起' },
  'status.partial': { en: 'Partly', yue: '部分' },
  'status.here': { en: 'Implemented here', yue: '呢度做咗' },
  'status.notstarted': { en: 'Not started', yue: '未開始' },
  'status.undesigned': { en: 'Not started, not yet designed', yue: '未開始，連設計都未有' },
  'status.na': { en: 'Not applicable', yue: '唔適用' },
  'status.notyet': { en: 'Not here yet', yue: '呢度未有' },
  'status.notmet': { en: 'Not met', yue: '未達到' },
  'status.inforce': { en: 'In force', yue: '生效中' },
  'status.machinery': { en: 'Machinery built, releases published', yue: '機制起好咗，release 都出咗' },
  'status.inprogress': { en: 'In progress', yue: '進行緊' },
  'status.notshipped': { en: 'Not shipped', yue: '未出街' },
  'status.upstreampartial': { en: 'Partial upstream', yue: '上游本身有部分' },
  'status.app.notstarted': { en: 'Not started in the application', yue: '個 app 未開始' },
  'status.app.partial': { en: 'Partial in design only', yue: '淨係設計上部分做咗' },
  'status.app.designed': { en: 'Designed, not built', yue: '設計咗，未起' },

  /* ===================================================================== *
   * Overview panel — the landing surface, and the one most readers see.
   * ===================================================================== */

  'ov.eyebrow': {
    en: [
      'Installer published — the redesign is in progress',
      'Installer published — the redesign is in progress',
      'Installer published — the redesign is still going',
      'Installer is out; the redesign is still going',
      'Installer is out; the redesign is very much still going',
    ],
    yue: [
      '安裝檔已出 — 重新設計進行緊',
      '安裝檔已出 — 重新設計進行緊',
      '安裝檔已出 — 重新設計仲做緊',
      '安裝檔出咗；重新設計仲喺度做緊',
      '安裝檔出咗；至於重新設計，仲有排做',
    ],
  },

  'ov.cta.install': {
    en: ['How to get it', 'How to get it', 'How to get it', 'How to get your hands on it', 'How to get your hands on it'],
    yue: ['點樣攞', '點樣攞', '點樣攞到手', '點樣攞到手', '點樣攞到手'],
  },
  'ov.cta.releases': {
    en: ['Get the installer', 'Get the installer', 'Get the installer', 'Go get the installer', 'Go get the installer'],
    yue: ['攞安裝檔', '攞安裝檔', '攞安裝檔', '入去攞安裝檔', '入去攞安裝檔啦'],
  },
  'ov.cta.releaseDetail': {
    en: ['What a release contains', 'What a release contains', 'What is inside a release', 'What is actually inside a release', 'What is actually inside a release'],
    yue: ['一個 release 有咩', '一個 release 有咩', '一個 release 入面有咩', '一個 release 入面究竟有咩', '一個 release 入面究竟有咩'],
  },

  'ov.what.heading': {
    en: ['What Material Designer is', 'What Material Designer is', 'What this thing actually is', 'What this thing actually is', 'What this thing actually is'],
    yue: ['Material Designer 係乜', 'Material Designer 係乜', '呢嚿嘢究竟係乜', '呢嚿嘢究竟係乜', '呢嚿嘢究竟係乜'],
  },

  'ov.what.body': {
    en: [
      'A workspace that runs entirely on your own machine. A local daemon detects whichever coding-agent command-line tool you already have installed and drives it to generate single-page design artifacts — prototypes, live dashboards, decks, images and motion pieces — rendered in a sandboxed preview and exportable to HTML, PDF, PPTX, ZIP, Markdown and MP4. Projects, files and database stay on local disk.',
      'A workspace that runs entirely on your own machine. A local daemon detects whichever coding-agent command-line tool you already have installed and drives it to generate single-page design artifacts — prototypes, live dashboards, decks, images and motion pieces — rendered in a sandboxed preview and exportable to HTML, PDF, PPTX, ZIP, Markdown and MP4. Projects, files and database stay on local disk.',
      'A workspace that runs entirely on your own machine. A local daemon finds whichever coding-agent command-line tool you already installed and puts it to work generating single-page design artifacts — prototypes, live dashboards, decks, images and motion pieces. They render in a sandboxed preview and export to HTML, PDF, PPTX, ZIP, Markdown and MP4, and the projects, files and database never leave local disk.',
      'A workspace that runs entirely on your own machine, and means it. A local daemon works out which coding-agent command-line tool you already installed and sets it to generating single-page design artifacts — prototypes, live dashboards, decks, images and motion pieces. They render in a sandboxed preview and export to HTML, PDF, PPTX, ZIP, Markdown and MP4, and the projects, files and database never leave local disk.',
      'A workspace that runs entirely on your own machine, and is quite stubborn about it. A local daemon works out which coding-agent command-line tool you already installed and sets it to generating single-page design artifacts — prototypes, live dashboards, decks, images and motion pieces. Each renders in a sandboxed preview, because a page a language model just wrote is not something to hand the keys to, and each exports to HTML, PDF, PPTX, ZIP, Markdown and MP4. The projects, files and database never leave local disk.',
    ],
    yue: [
      '一個完全喺你自己部機行嘅工作區。本機 daemon 會偵測到你本身裝咗邊個 coding-agent 命令列工具，驅動佢生成單頁設計檔案 — 原型、即時儀表板、簡報、圖像同動態作品 — 喺沙盒預覽入面 render，可以匯出做 HTML、PDF、PPTX、ZIP、Markdown 同 MP4。項目、檔案同資料庫全部留喺本機硬碟。',
      '一個完全喺你自己部機行嘅工作區。本機 daemon 會偵測到你本身裝咗邊個 coding-agent 命令列工具，驅動佢生成單頁設計檔案 — 原型、即時儀表板、簡報、圖像同動態作品 — 喺沙盒預覽入面 render，可以匯出做 HTML、PDF、PPTX、ZIP、Markdown 同 MP4。項目、檔案同資料庫全部留喺本機硬碟。',
      '一個完全喺你自己部機行嘅工作區。本機 daemon 會搵到你本身裝咗邊個 coding-agent 命令列工具，拉佢出嚟生成單頁設計檔案 — 原型、即時儀表板、簡報、圖像同動態作品。全部喺沙盒預覽入面 render、可以匯出做 HTML、PDF、PPTX、ZIP、Markdown 同 MP4，而項目、檔案同資料庫一直冇離開過本機硬碟。',
      '一個完全喺你自己部機行嘅工作區，而且係認真嘅。本機 daemon 會查清楚你裝咗邊隻 coding-agent 命令列工具，安排佢生成單頁設計檔案 — 原型、即時儀表板、簡報、圖像同動態作品。全部喺沙盒預覽入面 render、可以匯出做 HTML、PDF、PPTX、ZIP、Markdown 同 MP4，而項目、檔案同資料庫一直冇離開過本機硬碟。',
      '一個完全喺你自己部機行嘅工作區，而且幾硬頸。本機 daemon 會查清楚你裝咗邊隻 coding-agent 命令列工具，安排佢生成單頁設計檔案 — 原型、即時儀表板、簡報、圖像同動態作品。每份都喺沙盒預覽入面 render，因為一版 language model 啱啱先寫完嘅嘢，唔係就咁交條鎖匙畀佢嗰種；每份都可以匯出做 HTML、PDF、PPTX、ZIP、Markdown 同 MP4。項目、檔案同資料庫一直冇離開過本機硬碟。',
    ],
  },

  'ov.what.split': {
    en: [
      'Two different things are described on this site, and they are never mixed. The product’s existing behaviour is the imported upstream release, which works today. The Material Design 3 redesign and the standards conformance are this project’s own work, and that work is in progress.',
      'Two different things are described on this site, and they are never mixed. The product’s existing behaviour is the imported upstream release, which works today. The Material Design 3 redesign and the standards conformance are this project’s own work, and that work is in progress.',
      'Two different things are described here, and they are never mixed together. What the product already does is the imported upstream release, and it works today. The Material Design 3 redesign and the standards conformance are this project’s own work, and that work is still in progress.',
      'Two different things are described here, and they are kept apart on purpose. What the product already does is the imported upstream release, and it works today. The Material Design 3 redesign and the standards conformance are this project’s own work, and that work is still in progress.',
      'Two different things are described here, and blurring them would be the easiest way to take credit for somebody else’s work. What the product already does is the imported upstream release, and it works today. The Material Design 3 redesign and the standards conformance are this project’s own, and that work is still very much in progress.',
    ],
    yue: [
      '呢個網站講緊兩樣唔同嘅嘢，而且永遠唔會撈埋一齊。個產品本身嘅行為係移植返嚟嘅上游版本，而家已經行得。Material Design 3 重新設計同標準達標係呢個項目自己嘅工作，仲進行緊。',
      '呢個網站講緊兩樣唔同嘅嘢，而且永遠唔會撈埋一齊。個產品本身嘅行為係移植返嚟嘅上游版本，而家已經行得。Material Design 3 重新設計同標準達標係呢個項目自己嘅工作，仲進行緊。',
      '呢度講緊兩樣唔同嘅嘢，唔會撈埋一齊。個產品本身做到嘅嘢係移植返嚟嘅上游版本，而家已經行得。Material Design 3 重新設計同標準達標係呢個項目自己嘅工作，仲做緊。',
      '呢度講緊兩樣唔同嘅嘢，而且係特登分開。個產品本身做到嘅嘢係移植返嚟嘅上游版本，而家已經行得。Material Design 3 重新設計同標準達標係呢個項目自己嘅工作，仲做緊。',
      '呢度講緊兩樣唔同嘅嘢，撈埋一齊嘅話，就係認人哋功勞最快嘅方法。個產品本身做到嘅嘢係移植返嚟嘅上游版本，而家已經行得。Material Design 3 重新設計同標準達標先係呢個項目自己嘅嘢，而嗰啲仲有排做。',
    ],
  },

  'ov.adds.heading': {
    en: ['What this repository adds', 'What this repository adds', 'What this repository adds on top', 'What this repository actually adds', 'What this repository actually adds'],
    yue: ['呢個 repository 加咗啲乜', '呢個 repository 加咗啲乜', '呢個 repository 喺上面加咗啲乜', '呢個 repository 究竟加咗啲乜', '呢個 repository 究竟加咗啲乜'],
  },

  'ov.add.md3.title': { en: 'A Material Design 3 redesign', yue: 'Material Design 3 重新設計' },
  'ov.add.md3.body': {
    en: 'The product’s own interface, rebuilt on the M3 colour-role tokens, type scale, shape scale, elevation and motion easing. The token layer and the custom window chrome are in the released build; the components have not been rebuilt on them yet.',
    yue: '個產品自己嘅介面，用 M3 嘅色彩角色 token、字級、形狀級、陰影同動態曲線重新起過。Token 層同自訂視窗外框已經喺出咗嘅 build 入面；啲元件就未用返佢哋重新起過。',
  },

  'ov.add.rebrand.title': { en: 'A minimal rebrand', yue: '最細嘅改名工程' },
  'ov.add.rebrand.body': {
    en: 'Product name, window title, installer and application identity. Internal package names, the command-line name, its environment variables and its storage keys are left exactly as upstream wrote them, so the port stays diffable against its source.',
    yue: '產品名、視窗標題、安裝檔同 application identity。內部 package 名、命令列名、佢啲環境變數同 storage key 就一個字都冇改，維持上游原本咁樣，令個移植版可以照樣同來源 diff。',
  },

  'ov.add.proof.title': {
    en: ['A port you can check rather than believe', 'A port you can check rather than believe', 'A port you can check instead of believe', 'A port you can check, so you need not believe anybody', 'A port you can check, so you need not take anybody’s word for it'],
    yue: ['一個可以驗、唔使信嘅移植', '一個可以驗、唔使信嘅移植', '一個可以自己驗、唔使靠信嘅移植', '一個可以自己驗嘅移植，唔使信邊個', '一個可以自己驗嘅移植，唔使聽邊個講'],
  },
  'ov.add.proof.body': {
    en: [
      'A committed shell script re-derives the whole "this is upstream, unmodified" claim from git alone, and the licence notice is the same list the script enforces.',
      'A committed shell script re-derives the whole "this is upstream, unmodified" claim from git alone, and the licence notice is the same list the script enforces.',
      'A committed shell script rebuilds the whole "this is upstream, unmodified" claim from git alone. The licence notice is not a separate document that hopes to agree with it — it is the same list the script enforces.',
      'A committed shell script rebuilds the whole "this is upstream, unmodified" claim from git alone. The licence notice is not a separate document quietly hoping to agree with the code — it is the same list the script enforces.',
      'A committed shell script rebuilds the whole "this is upstream, unmodified" claim from git alone, no toolchain required. And the licence notice is not a separate document quietly hoping it still agrees with the code: it is the same list the script enforces, so the two cannot drift apart without something failing loudly.',
    ],
    yue: [
      '有個 commit 咗嘅 shell script，淨係靠 git 就重新推導返成句「呢個係上游、原封不動」嘅講法，而張授權通知就係嗰個 script 執行緊嘅同一份清單。',
      '有個 commit 咗嘅 shell script，淨係靠 git 就重新推導返成句「呢個係上游、原封不動」嘅講法，而張授權通知就係嗰個 script 執行緊嘅同一份清單。',
      '有個 commit 咗嘅 shell script，淨係靠 git 就重新推導返成句「呢個係上游、原封不動」嘅講法。張授權通知唔係另一份「希望佢哋啱得返」嘅文件 — 佢就係嗰個 script 執行緊嘅同一份清單。',
      '有個 commit 咗嘅 shell script，淨係靠 git 就重新推導返成句「呢個係上游、原封不動」嘅講法。張授權通知唔係另一份靜靜雞祈求同 code 夾得返嘅文件 — 佢就係嗰個 script 執行緊嘅同一份清單。',
      '有個 commit 咗嘅 shell script，唔使裝任何 toolchain，淨係靠 git 就重新推導返成句「呢個係上游、原封不動」嘅講法。而張授權通知都唔係另一份靜靜雞祈求同 code 夾得返嘅嘢：佢就係嗰個 script 執行緊嗰份清單，所以兩邊一分家就會即刻嘈到全世界知。',
    ],
  },

  'ov.add.standards.title': { en: 'The standards this project holds itself to', yue: '呢個項目自己要守嘅標準' },
  'ov.add.standards.body': {
    en: 'Language modes and funny levels, appearance customization, a regex builder beside every search field, tabbed navigation, non-blocking notifications, a command palette, accessibility as a completion blocker. This page implements them; the application does not yet.',
    yue: '語言模式同搞笑程度、外觀自訂、每個搜尋格旁邊都有嘅 regex 產生器、分頁導覽、唔阻你做嘢嘅通知、command palette，同埋將無障礙當成完成條件。呢版做咗；個 app 就未。',
  },

  'ov.verified.heading': {
    en: ['What is verified, and what has never been run', 'What is verified, and what has never been run', 'What is verified, and what has never actually been run', 'What is verified, and what nobody has ever actually run', 'What is verified, and what nobody has ever actually run'],
    yue: ['邊啲驗證咗，邊啲從來未行過', '邊啲驗證咗，邊啲從來未行過', '邊啲真係驗證咗，邊啲根本未行過', '邊啲真係驗證咗，邊啲根本冇人行過', '邊啲真係驗證咗，邊啲根本冇人行過'],
  },
  'ov.verified.sub': {
    en: [
      'Every row says how it was checked. A row that says "never run" means exactly that.',
      'Every row says how it was checked. A row that says "never run" means exactly that.',
      'Every row says how it was checked, and a row that says "never run" means exactly that.',
      'Every row says how it was checked. Where a row says "never run", it means it — there is no softer reading available.',
      'Every row says how it was checked. Where a row says "never run", it means it, and no amount of squinting will turn that into a yes.',
    ],
    yue: [
      '每一行都寫明點樣驗過。寫住「未行過」嗰行，就係字面咁解。',
      '每一行都寫明點樣驗過。寫住「未行過」嗰行，就係字面咁解。',
      '每一行都寫明點樣驗過，而寫住「未行過」嗰行，就係字面咁解。',
      '每一行都寫明點樣驗過。寫住「未行過」就真係未行過 — 冇第二個讀法。',
      '每一行都寫明點樣驗過。寫住「未行過」就真係未行過，眯埋眼睇都變唔到「有」。',
    ],
  },
  'ov.verified.caption': { en: 'Verification state of each claim this repository makes', yue: '呢個 repository 每個講法嘅驗證狀態' },
  'ov.verified.col.claim': { en: 'Claim', yue: '講法' },
  'ov.verified.col.state': { en: 'State', yue: '狀態' },
  'ov.verified.col.how': { en: 'How it was checked', yue: '點樣驗' },

  'ov.row.port': { en: 'The imported tree matches upstream exactly', yue: '移植入嚟嘅檔案樹同上游一模一樣' },
  'ov.row.port.how': {
    en: 'By running the committed verifier locally, on a checkout with LF line endings. It reports zero gaps and exits 0.',
    yue: '喺一個用 LF 換行嘅 checkout 度，本機行咗嗰個 commit 咗嘅驗證 script。佢報 zero gaps，exit 0。',
  },
  'ov.row.notice': { en: 'Every difference from upstream is declared', yue: '同上游有出入嘅地方全部申報咗' },
  'ov.row.notice.how': {
    en: 'Same run. The licence notice is the allowlist the script reads, so an undeclared change fails and a declaration for an unchanged file fails too.',
    yue: '同一次運行。張授權通知就係嗰個 script 讀嘅 allowlist，所以冇申報嘅改動會 fail，而幫一個根本冇改過嘅檔案申報都一樣會 fail。',
  },
  'ov.row.build': { en: 'The application builds, installs and starts', yue: '個 app build 到、裝到、開到' },
  'ov.row.build.how': {
    en: 'A release run installed the Windows package it had just built, launched it, saw the running process answer its own health endpoint, and uninstalled it without residue.',
    yue: '一次 release 運行將佢啱啱 build 好嗰個 Windows 套件裝咗落去、開咗佢、見到個行緊嘅 process 應返自己個 health endpoint，之後解除安裝，冇留低手尾。',
  },
  'ov.row.ci': { en: 'Continuous integration passes', yue: 'Continuous integration 過到' },
  'ov.row.ci.how': {
    en: 'The gate, the release run and the site deployment have all completed. The release run publishes only after its tests pass, so every published release is itself the receipt for the run behind it.',
    yue: '個檢查關卡、release 運行同網站部署全部行完咗。Release 運行係測試過咗先至出版，所以每個出咗嘅 release 本身就係背後嗰次運行嘅收據。',
  },
  'ov.row.release': { en: 'A release exists', yue: '有 release 存在' },
  'ov.row.release.how': {
    en: 'With an installer, its checksum, a portable archive and a dim sum code name. Still unsigned: there is no code-signing certificate, so a SmartScreen warning stands in front of every first run.',
    yue: '連安裝檔、佢個 checksum、一個免安裝壓縮包同一個點心代號都齊。不過仲未簽名：冇 code-signing 證書，所以每次第一次開都會有個 SmartScreen 警告攔喺前面。',
  },
  'ov.row.md3': { en: 'The application follows Material Design 3', yue: '個 app 跟 Material Design 3' },
  'ov.row.md3.how': {
    en: 'The token sheet transcribed from the mockup is in the released build, and Windows now draws the application’s own title bar instead of the operating system’s. The component inventory has not been rebuilt on those tokens, and no screenshot of the running application appears on this site.',
    yue: '由 mockup 抄落嚟嗰份 token 表已經喺出咗嘅 build 入面，而 Windows 而家畫嘅係個 app 自己嘅標題列，唔再係作業系統嗰條。啲元件就未用返嗰啲 token 重新起過，而呢個網站亦都冇任何一張行緊嘅 app 嘅截圖。',
  },
  'ov.row.site': { en: 'This site meets the project’s own standards', yue: '呢個網站達到項目自己嘅標準' },
  'ov.row.site.how': {
    en: 'The standards this page can carry are implemented here and can be exercised in the browser. The Standards section says which, and which are still missing.',
    yue: '呢版載得起嘅標準都喺呢度做咗，你可以喺瀏覽器度即刻試。「標準」嗰版會講邊啲做咗、邊啲仲未有。',
  },

  /* ===================================================================== *
   * Install panel.
   * ===================================================================== */

  // "64-bit" is an architecture, not an adjective. Plain string.
  'in.download.title': { en: 'Windows, 64-bit', yue: 'Windows，64 位元' },

  'in.download.pinned': {
    en: [
      'This link points at one specific published build rather than at whatever is newest, so the checksum on the Releases section describes exactly the file it hands you. Newer builds are on the releases page.',
      'This link points at one specific published build rather than at whatever is newest, so the checksum on the Releases section describes exactly the file it hands you. Newer builds are on the releases page.',
      'This link points at one specific published build rather than at whatever happens to be newest, so the checksum on the Releases section describes exactly the file it hands you. Newer builds are on the releases page.',
      'This link is nailed to one specific published build rather than to whatever happens to be newest, so the checksum on the Releases section describes exactly the file you get. Newer builds live on the releases page.',
      'This link is nailed to one specific published build rather than to whatever happens to be newest. That is the point: a link that quietly changes what it hands you makes the checksum printed beside it worthless. Newer builds live on the releases page.',
    ],
    yue: [
      '呢條 link 指住一個特定嘅已出 build，唔係指住「最新嗰個」，所以「發佈版本」嗰版嘅 checksum 講嘅就係佢畀你嗰個檔案。有新啲嘅 build 就喺 releases 頁度。',
      '呢條 link 指住一個特定嘅已出 build，唔係指住「最新嗰個」，所以「發佈版本」嗰版嘅 checksum 講嘅就係佢畀你嗰個檔案。有新啲嘅 build 就喺 releases 頁度。',
      '呢條 link 指住一個特定嘅已出 build，唔係指住「啱啱最新嗰個」，所以「發佈版本」嗰版嘅 checksum 講嘅就係佢畀你嗰個檔案。有新啲嘅 build 就喺 releases 頁度。',
      '呢條 link 釘死咗喺一個特定嘅已出 build，唔係釘住「啱啱最新嗰個」，所以「發佈版本」嗰版嘅 checksum 講嘅就係你攞到嗰個檔案。新啲嘅 build 喺 releases 頁度。',
      '呢條 link 釘死咗喺一個特定嘅已出 build，唔係釘住「啱啱最新嗰個」。呢點先係重點：一條會靜靜雞換咗畀你嘅嘢嘅 link，會令旁邊印住嗰個 checksum 一文不值。新啲嘅 build 喺 releases 頁度。',
    ],
  },

  'in.cta.releases': {
    en: ['Checksum, code name and full notes', 'Checksum, code name and full notes', 'Checksum, code name and the full notes', 'Checksum, code name and the full notes', 'Checksum, code name and the full notes'],
    yue: ['Checksum、代號同完整說明', 'Checksum、代號同完整說明', 'Checksum、代號同埋完整說明', 'Checksum、代號同埋完整說明', 'Checksum、代號同埋完整說明'],
  },

  'in.will.heading': {
    en: ['What a release contains', 'What a release contains', 'What a release contains', 'What is in the box', 'What is in the box'],
    yue: ['一個 release 有咩', '一個 release 有咩', '一個 release 有咩', '個盒入面有咩', '個盒入面有咩'],
  },
  'in.will.sub': {
    en: 'Summarised here; the Releases section covers each item, and is the one that gets corrected.',
    yue: '呢度係摘要；「發佈版本」嗰版會逐樣講，亦都係有錯會改嗰版。',
  },
  'in.will.installer': {
    en: 'A Windows installer produced by the same run that published it, together with its checksum and a portable archive for running the application without installing it.',
    yue: '一個由「出佢嗰次運行」親手 build 出嚟嘅 Windows 安裝檔，連埋佢個 checksum，同一個唔使裝就開到嘅免安裝壓縮包。',
  },
  'in.will.tag': {
    en: 'Its own unique tag. No prior release is recycled or overwritten, so a downloaded file can always be traced back to one commit.',
    yue: '佢自己獨有嘅 tag。之前嘅 release 唔會被回收或者覆寫，所以載落嚟嘅檔案永遠追返到去一個 commit。',
  },
  'in.will.linecount': {
    en: 'A line-count table for the exact released commit, produced by a committed counter that continuous integration runs, broken down by category and by whether a person or an agent wrote the surviving line.',
    yue: '一個對應嗰個發佈 commit 嘅行數表，由 continuous integration 行一個 commit 咗嘅計數器整出嚟，按類別分開，亦分開邊啲仲留低嘅行係人寫、邊啲係 agent 寫。',
  },
  'in.will.codename': {
    en: 'A dim sum code name drawn from the public catalogue of 2,866 dishes, with the dish’s photograph — chosen only from dishes whose image is actually published, and never reused between builds.',
    yue: '一個點心代號，喺公開嘅 2,866 味點心圖鑑度抽，連埋嗰味嘢嘅相 — 淨係揀真係出咗相嗰啲，而且每個 build 唔會撞名。',
  },
  'in.will.evidence': {
    en: ['Evidence recorded as it really is: passed, failed, or not run. Never predicted.', 'Evidence recorded as it really is: passed, failed, or not run. Never predicted.', 'Evidence recorded as it really is: passed, failed, or not run — never predicted.', 'Evidence recorded as it really is: passed, failed, or not run. Never what somebody expected it to be.', 'Evidence recorded as it really is: passed, failed, or not run. Never what somebody was rather hoping it would be.'],
    yue: ['證據照實記：過咗、fail 咗，定係未行過。唔會靠估。', '證據照實記：過咗、fail 咗，定係未行過。唔會靠估。', '證據照實記：過咗、fail 咗，定係未行過 — 唔會靠估。', '證據照實記：過咗、fail 咗，定係未行過。唔會寫返啲人以為會係嘅嘢。', '證據照實記：過咗、fail 咗，定係未行過。唔會寫返啲人心底裏好想佢係嘅嘢。'],
  },

  'in.signing.title': {
    en: ['An unsigned installer trips SmartScreen', 'An unsigned installer trips SmartScreen', 'An unsigned installer trips SmartScreen', 'An unsigned installer sets SmartScreen off', 'An unsigned installer sets SmartScreen off, every single time'],
    yue: ['未簽名嘅安裝檔會觸發 SmartScreen', '未簽名嘅安裝檔會觸發 SmartScreen', '未簽名嘅安裝檔會觸發 SmartScreen', '未簽名嘅安裝檔一定會嘈醒 SmartScreen', '未簽名嘅安裝檔次次都會嘈醒 SmartScreen'],
  },
  'in.signing.body': {
    en: 'This repository has no code-signing certificate. Windows shows "Windows protected your PC" with an unknown publisher on first run, and the button that continues is hidden behind More info. That stays true until a certificate is obtained, so verify the published checksum against the file you downloaded before you go past it.',
    yue: '呢個 repository 冇 code-signing 證書。第一次開嘅時候，Windows 會彈「Windows protected your PC」，發行者係不明，而繼續嗰個掣收埋咗喺 More info 後面。攞到證書之前都會係咁，所以撳落去之前，記得攞公佈咗嘅 checksum 對一對你載落嚟嗰個檔案。',
  },

  'in.until.heading': {
    en: ['Or build it from source', 'Or build it from source', 'Or build it yourself from source', 'Or build it yourself from source', 'Or build it yourself from source'],
    yue: ['又或者自己由原始碼 build', '又或者自己由原始碼 build', '又或者自己攞原始碼 build 過', '又或者自己攞原始碼 build 過', '又或者自己攞原始碼 build 過'],
  },
  'in.until.body': {
    en: 'The exact commands, the toolchain versions and the Windows prerequisites are in the Building section. Expect the first run to be a real build rather than a formality — one native dependency compiles from source.',
    yue: '詳細指令、toolchain 版本同 Windows 前置需求全部喺「自己砌」嗰版。第一次要有心理準備係真係 build，唔係行個過場 — 有個原生相依要由原始碼砌出嚟。',
  },

  /* ===================================================================== *
   * Releases panel.
   *
   * Everything factual on this panel — the tag, the checksum, the asset
   * names, the dish — is in the markup, not here. What is here is only the
   * prose that explains what those facts mean, which is exactly the split the
   * voice-not-facts rule asks for.
   * ===================================================================== */

  'rl.heading': { en: 'Releases', yue: '發佈版本' },

  'rl.intro': {
    en: [
      'Continuous integration builds the Windows application on every push to the default branch, tests it, and publishes what it built. A run whose tests fail publishes nothing at all, so a release existing is itself evidence that the tests before it passed.',
      'Continuous integration builds the Windows application on every push to the default branch, tests it, and publishes what it built. A run whose tests fail publishes nothing at all, so a release existing is itself evidence that the tests before it passed.',
      'Continuous integration builds the Windows application on every push to the default branch, tests it, and publishes exactly what it built. A run whose tests fail publishes nothing at all — which is why a release existing is itself evidence that the tests before it passed.',
      'Continuous integration builds the Windows application on every push to the default branch, tests it, and publishes exactly what it built — not a rebuild of it later. A run whose tests fail publishes nothing at all, which is why a release existing is itself evidence that the tests before it passed.',
      'Continuous integration builds the Windows application on every push to the default branch, tests it, and publishes exactly the file it built — not a rebuild done later on a different machine in a better mood. A run whose tests fail publishes nothing at all, which is the entire reason a release existing counts as evidence rather than as an announcement.',
    ],
    yue: [
      'Continuous integration 每次 push 上主分支都會 build 個 Windows app、測試佢，然後將 build 出嚟嘅嘢出版。測試唔過嗰次運行乜都唔會出，所以有 release 存在，本身就係之前啲測試過咗嘅證據。',
      'Continuous integration 每次 push 上主分支都會 build 個 Windows app、測試佢，然後將 build 出嚟嘅嘢出版。測試唔過嗰次運行乜都唔會出，所以有 release 存在，本身就係之前啲測試過咗嘅證據。',
      'Continuous integration 每次 push 上主分支都會 build 個 Windows app、測試佢，然後出版嘅就係佢 build 出嚟嗰個。測試唔過嗰次運行一樣嘢都唔會出 — 所以有 release 存在，本身就係之前啲測試過咗嘅證據。',
      'Continuous integration 每次 push 上主分支都會 build 個 Windows app、測試佢，然後出版嘅就係佢 build 出嚟嗰個，唔係事後再 build 過一次。測試唔過嗰次運行一樣嘢都唔會出，所以有 release 存在，本身就係之前啲測試過咗嘅證據。',
      'Continuous integration 每次 push 上主分支都會 build 個 Windows app、測試佢，然後出版嗰個就係佢親手 build 出嚟嗰個檔案 — 唔係事後喺第二部機、心情好啲嘅時候再 build 多次。測試唔過嗰次運行真係一樣嘢都唔會出，而呢點就係點解有 release 算係證據，唔係公告。',
    ],
  },

  'rl.latest.heading': {
    en: ['The most recent release', 'The most recent release', 'The most recent release', 'The newest one', 'The newest one'],
    yue: ['最新嗰個 release', '最新嗰個 release', '最新嗰個 release', '最新嗰個', '最新嗰個'],
  },
  'rl.latest.body': {
    en: [
      'Downloading this runs the installer that this run actually built and then smoke-tested. It does not need administrator rights.',
      'Downloading this runs the installer that this run actually built and then smoke-tested. It does not need administrator rights.',
      'This is the installer that run actually built and then smoke-tested — the same file, not a copy of it. It does not need administrator rights.',
      'This is the installer that run actually built and then smoke-tested: the same file, not a later copy of it. It does not need administrator rights.',
      'This is the installer that run actually built and then smoke-tested — the same file, not a later copy that somebody assures you is equivalent. It does not need administrator rights either.',
    ],
    yue: [
      '載呢個，行嘅就係嗰次運行真係 build 出嚟、之後又 smoke test 過嗰個安裝檔。唔使管理員權限。',
      '載呢個，行嘅就係嗰次運行真係 build 出嚟、之後又 smoke test 過嗰個安裝檔。唔使管理員權限。',
      '呢個就係嗰次運行真係 build 出嚟、之後又 smoke test 過嗰個安裝檔 — 同一個檔案，唔係抄本。唔使管理員權限。',
      '呢個就係嗰次運行真係 build 出嚟、之後又 smoke test 過嗰個安裝檔：同一個檔案，唔係事後抄嘅。唔使管理員權限。',
      '呢個就係嗰次運行真係 build 出嚟、之後又 smoke test 過嗰個安裝檔 — 同一個檔案，唔係事後有人拍心口話「一樣㗎啦」嗰種抄本。仲要唔使管理員權限。',
    ],
  },
  'rl.latest.caption': { en: 'The most recent published release and its assets', yue: '最新出咗嘅 release 同佢啲檔案' },

  'rl.f.tag': { en: 'Tag', yue: 'Tag' },
  'rl.f.version': { en: 'Application version', yue: 'App 版本' },
  'rl.f.codename': { en: 'Code name', yue: '代號' },
  'rl.f.commit': { en: 'Built from', yue: 'Build 自' },
  'rl.f.installer': { en: 'Installer', yue: '安裝檔' },
  'rl.f.sha': { en: 'SHA-256', yue: 'SHA-256' },
  'rl.f.smoke': { en: 'Packaged smoke test', yue: '打包後 smoke test' },
  'rl.f.smoke.detail': {
    en: '— the built application installed, launched, answered its own health check, and uninstalled without leaving anything behind.',
    yue: '— build 出嚟嗰個 app 裝到、開到、應到自己個 health check，解除安裝之後亦冇留低嘢。',
  },

  'rl.download.installer': {
    en: ['Download the Windows installer', 'Download the Windows installer', 'Download the Windows installer', 'Grab the Windows installer', 'Grab the Windows installer'],
    yue: ['下載 Windows 安裝檔', '下載 Windows 安裝檔', '下載 Windows 安裝檔', '攞個 Windows 安裝檔', '攞個 Windows 安裝檔'],
  },
  'rl.download.portable': {
    en: ['Download the portable archive', 'Download the portable archive', 'Download the portable archive', 'Grab the portable archive', 'Grab the portable archive instead'],
    yue: ['下載免安裝壓縮包', '下載免安裝壓縮包', '下載免安裝壓縮包', '攞個免安裝壓縮包', '攞個免安裝壓縮包啦'],
  },
  'rl.link.all': {
    en: ['Every release, with its full notes', 'Every release, with its full notes', 'Every release, with its full notes', 'All of them, with the full notes', 'All of them, with the full notes'],
    yue: ['全部 release，連完整說明', '全部 release，連完整說明', '全部 release，連完整說明', '全部一齊睇，連完整說明', '全部一齊睇，連完整說明'],
  },

  'rl.signing.title': {
    en: ['The installer is not code-signed, and Windows will say so', 'The installer is not code-signed, and Windows will say so', 'The installer is not code-signed, and Windows will say so loudly', 'The installer is not code-signed, and Windows will make a scene', 'The installer is not code-signed, and Windows will make a scene about it'],
    yue: ['個安裝檔未簽名，Windows 會講畀你聽', '個安裝檔未簽名，Windows 會講畀你聽', '個安裝檔未簽名，Windows 會大聲講畀你聽', '個安裝檔未簽名，Windows 會做大龍鳳', '個安裝檔未簽名，Windows 一定會同你做場大龍鳳'],
  },
  // Contains a checksum name and a verbatim Windows string. Plain: this is the
  // paragraph a reader acts on, and it must read identically wherever it is
  // quoted from.
  'rl.signing.body': {
    en: 'This repository has no code-signing certificate, so SmartScreen shows "Windows protected your PC" with an unknown publisher on first run. The button that continues is hidden behind More info. Check the published SHA-256 against the file you downloaded before you do that — an unsigned installer is exactly the case where the checksum is worth the minute it costs.',
    yue: '呢個 repository 冇 code-signing 證書，所以第一次開嗰陣 SmartScreen 會彈「Windows protected your PC」，發行者不明。繼續嗰個掣收埋咗喺 More info 後面。撳落去之前，攞公佈咗嗰個 SHA-256 對一對你載落嚟嗰個檔案 — 未簽名嘅安裝檔，正正就係最抵花嗰一分鐘去對 checksum 嘅情況。',
  },

  'rl.update.title': {
    en: ['There is no automatic update feed', 'There is no automatic update feed', 'There is no automatic update feed', 'There is no automatic update feed, on purpose', 'There is no automatic update feed, and that is deliberate'],
    yue: ['冇自動更新來源', '冇自動更新來源', '冇自動更新來源', '冇自動更新來源，係特登嘅', '冇自動更新來源，而且係特登唔要'],
  },
  'rl.update.body': {
    en: [
      'Builds from this repository deliberately ship without one. The upstream project’s feed was removed rather than inherited, because an application that polls somebody else’s feed will eventually replace itself with somebody else’s application. New versions are installed by downloading them from the releases page.',
      'Builds from this repository deliberately ship without one. The upstream project’s feed was removed rather than inherited, because an application that polls somebody else’s feed will eventually replace itself with somebody else’s application. New versions are installed by downloading them from the releases page.',
      'Builds from this repository ship without one on purpose. The upstream project’s feed was removed rather than inherited, because an application that keeps asking somebody else’s feed what it should be will eventually be told to become something else. New versions are installed by downloading them from the releases page.',
      'Builds from this repository ship without one on purpose. The upstream project’s feed was taken out rather than inherited, because an application that keeps asking somebody else’s feed what it ought to be will eventually be told to become something else — and it will comply. New versions are installed by downloading them from the releases page.',
      'Builds from this repository ship without one on purpose. The upstream project’s feed was taken out rather than inherited, because an application that keeps asking somebody else’s server what it ought to be will eventually be told to become a different product, and it will say yes without asking you. New versions are installed the old-fashioned way, from the releases page.',
    ],
    yue: [
      '由呢個 repository build 出嚟嘅版本，特登冇帶更新來源。上游嗰條 feed 係攞走咗，唔係照單全收，因為一個成日去問人哋條 feed 嘅 app，遲早會將自己換成人哋嗰隻 app。想要新版本，就去 releases 頁載。',
      '由呢個 repository build 出嚟嘅版本，特登冇帶更新來源。上游嗰條 feed 係攞走咗，唔係照單全收，因為一個成日去問人哋條 feed 嘅 app，遲早會將自己換成人哋嗰隻 app。想要新版本，就去 releases 頁載。',
      '由呢個 repository build 出嚟嘅版本，特登唔帶更新來源。上游嗰條 feed 係攞走咗，唔係照單全收，因為一個成日問人哋條 feed「我應該係乜」嘅 app，遲早會畀人叫佢變成第二樣嘢。想要新版本，就去 releases 頁載。',
      '由呢個 repository build 出嚟嘅版本，特登唔帶更新來源。上游嗰條 feed 係拆咗出嚟，唔係照單全收，因為一個成日問人哋條 feed「我應該係乜」嘅 app，遲早會畀人叫佢變成第二樣嘢 — 而佢真係會照做。想要新版本，就去 releases 頁載。',
      '由呢個 repository build 出嚟嘅版本，特登唔帶更新來源。上游嗰條 feed 係拆咗出嚟，唔係照單全收，因為一個成日問人哋部 server「我應該係乜」嘅 app，遲早會畀人叫佢變成另一件產品，而佢會應承，都唔會問你一聲。想要新版本，就用老實方法去 releases 頁載。',
    ],
  },

  'rl.contains.heading': {
    en: ['What every release contains', 'What every release contains', 'What every release contains', 'What is in every one of them', 'What is in every one of them'],
    yue: ['每個 release 有咩', '每個 release 有咩', '每個 release 有咩', '每一個入面有咩', '每一個入面有咩'],
  },
  'rl.contains.sub': {
    en: 'The same set every time, produced by the run that published it.',
    yue: '次次都係同一套，由出佢嗰次運行整出嚟。',
  },
  'rl.contains.caption': { en: 'Each asset a release carries, and what it is for', yue: '一個 release 帶住嘅每個檔案，同佢做咩用' },
  'rl.contains.col.asset': { en: 'Asset', yue: '檔案' },
  'rl.contains.col.what': { en: 'What it is', yue: '係乜' },

  // Names an engine version. Plain string.
  'rl.asset.installer': {
    en: 'The Windows installer, built by the packer on Electron 41 during the same run that published it. It is the artifact the smoke test then installed and launched.',
    yue: '個 Windows 安裝檔，由 packer 喺 Electron 41 上面 build，就喺出佢嗰次運行入面整。跟住 smoke test 裝同開嘅，就係呢件嘢。',
  },
  'rl.asset.sha': {
    en: [
      'The checksum of that exact file, computed by the run after the build. It is also printed in the release notes, so the two have to agree.',
      'The checksum of that exact file, computed by the run after the build. It is also printed in the release notes, so the two have to agree.',
      'The checksum of that exact file, computed by the run after the build. The same value is printed in the release notes, so the two have to agree or somebody notices.',
      'The checksum of that exact file, computed by the run right after the build. The same value is printed in the release notes, so the two have to agree or somebody notices.',
      'The checksum of that exact file, computed by the run right after the build. The same value is printed in the release notes as well, so the two have to agree — a checksum with nothing to disagree with is decoration.',
    ],
    yue: [
      '就係嗰個檔案嘅 checksum，由嗰次運行 build 完之後計。發佈說明入面都會印同一個值，所以兩邊一定要夾得返。',
      '就係嗰個檔案嘅 checksum，由嗰次運行 build 完之後計。發佈說明入面都會印同一個值，所以兩邊一定要夾得返。',
      '就係嗰個檔案嘅 checksum，由嗰次運行 build 完之後計。發佈說明入面印住同一個值，所以兩邊要夾得返，唔係就有人會發現。',
      '就係嗰個檔案嘅 checksum，由嗰次運行 build 完即刻計。發佈說明入面印住同一個值，所以兩邊要夾得返，唔係就有人會發現。',
      '就係嗰個檔案嘅 checksum，由嗰次運行 build 完即刻計。發佈說明入面亦都印住同一個值，所以兩邊一定要夾得返 — 一個冇嘢好對嘅 checksum，就淨係得個裝飾。',
    ],
  },
  'rl.asset.portable': {
    en: 'A portable archive of the unpacked application, for running it without an installer. Published when the packer produced one.',
    yue: '一個未打包版本嘅免安裝壓縮包，唔使裝就開到。Packer 整到嗰陣就會出。',
  },
  'rl.asset.dish': {
    en: 'The photograph of the dim sum dish this release is named after, taken from the catalogue bundled in this repository. No image is fetched, generated or re-encoded at publish time.',
    yue: '呢個 release 用嚟改名嗰味點心嘅相，喺呢個 repository 自己帶嘅目錄度攞。出版嗰陣唔會去網上攞相、唔會生成相、亦唔會重新編碼。',
  },

  'rl.contains.notes': {
    en: [
      'The notes carry the rest: how to install, the checksum, the smoke-test outcome, the line count, and the provenance statement naming the upstream project, its licence and the pinned commit this fork was taken from.',
      'The notes carry the rest: how to install, the checksum, the smoke-test outcome, the line count, and the provenance statement naming the upstream project, its licence and the pinned commit this fork was taken from.',
      'The notes carry the rest: how to install it, the checksum, the smoke-test outcome, the line count, and the provenance statement naming the upstream project, its licence and the pinned commit this fork was taken from.',
      'The notes carry everything else: how to install it, the checksum, the smoke-test outcome, the line count, and the provenance statement naming the upstream project, its licence and the pinned commit this fork was taken from.',
      'The notes carry everything else: how to install it, the checksum, the smoke-test outcome, the line count, and the provenance statement naming the upstream project, its licence and the exact pinned commit this fork was taken from — because "based on" is not a citation.',
    ],
    yue: [
      '其餘嘢喺發佈說明度：點樣裝、checksum、smoke test 結果、行數，同埋出處聲明，寫明上游項目、佢嘅授權，同呢個分支係由邊個釘死咗嘅 commit 攞落嚟。',
      '其餘嘢喺發佈說明度：點樣裝、checksum、smoke test 結果、行數，同埋出處聲明，寫明上游項目、佢嘅授權，同呢個分支係由邊個釘死咗嘅 commit 攞落嚟。',
      '其餘嘢全部喺發佈說明度：點樣裝、checksum、smoke test 結果、行數，同埋出處聲明，寫明上游項目、佢嘅授權，同呢個分支係由邊個釘死咗嘅 commit 攞落嚟。',
      '其餘嘢全部喺發佈說明度：點樣裝、checksum、smoke test 結果、行數，同埋出處聲明，寫明上游項目、佢嘅授權，同呢個分支係由邊個釘死咗嘅 commit 攞落嚟。',
      '其餘嘢全部喺發佈說明度：點樣裝、checksum、smoke test 結果、行數，同埋出處聲明，寫明上游項目、佢嘅授權，同呢個分支究竟由邊個釘死咗嘅 commit 攞落嚟 — 因為「參考自」唔算係出處。',
    ],
  },

  'rl.tag.heading': { en: 'How a release is tagged', yue: 'Release 點樣改 tag' },
  'rl.tag.body': {
    en: [
      'The run number climbs on its own and never repeats, so every tag is unique and in order without anybody maintaining a counter. The attempt number is part of it because a re-run of a failed job keeps the same run number — without it, the second attempt would try to create a tag that already exists and the publish would fail at the very last step, after the whole build had succeeded.',
      'The run number climbs on its own and never repeats, so every tag is unique and in order without anybody maintaining a counter. The attempt number is part of it because a re-run of a failed job keeps the same run number — without it, the second attempt would try to create a tag that already exists and the publish would fail at the very last step, after the whole build had succeeded.',
      'The run number climbs on its own and never repeats, so every tag comes out unique and in order without anybody having to maintain a counter. The attempt number is in there because a re-run of a failed job keeps the same run number — without it, the second attempt would try to create a tag that already exists, and the publish would fail at the very last step, after the whole build had succeeded.',
      'The run number climbs on its own and never repeats, so every tag comes out unique and in order without anybody minding a counter. The attempt number is in there for a less obvious reason: a re-run of a failed job keeps the same run number, so without it the second attempt would try to create a tag that already exists — and the publish would fall over at the very last step, after the entire build had succeeded.',
      'The run number climbs on its own and never repeats, so every tag comes out unique and in order without anybody minding a counter. The attempt number is in there for a less obvious reason, and it is the kind of detail you only add once: a re-run of a failed job keeps the same run number, so without it the second attempt would try to create a tag that already exists — and the publish would fall over at the very last step, after the entire build had spent an hour succeeding.',
    ],
    yue: [
      'Run number 自己會升，亦唔會重複，所以每個 tag 都獨一無二又有序，唔使有人手動維持個計數。至於 attempt number 都要放埋落去，係因為一個 fail 咗嘅工作再行一次，run number 係一樣嘅 — 冇咗佢，第二次就會撞返個已經存在嘅 tag，成個 build 明明成功晒，出版就喺最後嗰步冚檔。',
      'Run number 自己會升，亦唔會重複，所以每個 tag 都獨一無二又有序，唔使有人手動維持個計數。至於 attempt number 都要放埋落去，係因為一個 fail 咗嘅工作再行一次，run number 係一樣嘅 — 冇咗佢，第二次就會撞返個已經存在嘅 tag，成個 build 明明成功晒，出版就喺最後嗰步冚檔。',
      'Run number 自己會升，亦唔會重複，所以每個 tag 出嚟都獨一無二又有序，唔使有人手動維持個計數。Attempt number 放埋落去，係因為一個 fail 咗嘅工作再行一次，run number 唔會變 — 冇咗佢，第二次就會撞返個已經存在嘅 tag，成個 build 明明成功晒，出版就喺最尾嗰步冚檔。',
      'Run number 自己會升，亦唔會重複，所以每個 tag 出嚟都獨一無二又有序，唔使有人睇住個計數。Attempt number 放埋落去嘅理由冇咁明顯：一個 fail 咗嘅工作再行一次，run number 唔會變，所以冇咗佢，第二次就會撞返個已經存在嘅 tag — 成個 build 明明成功晒，出版就喺最尾嗰步冚咗檔。',
      'Run number 自己會升，亦唔會重複，所以每個 tag 出嚟都獨一無二又有序，唔使有人睇住個計數。Attempt number 放埋落去嘅理由冇咁明顯，而且係嗰種食一次虧就會加返落去嘅細節：一個 fail 咗嘅工作再行一次，run number 唔會變，所以冇咗佢，第二次就會撞返個已經存在嘅 tag — 成個 build 辛辛苦苦成功咗個鐘，出版就喺最尾嗰步冚咗檔。',
    ],
  },
  'rl.tag.norecycle': {
    en: 'No tag is ever reused and no release is overwritten. A published release is a permanent record of one commit, and editing one in place would quietly change what a reader already downloaded.',
    yue: 'Tag 唔會重用，release 亦唔會覆寫。一個出咗嘅 release 係某個 commit 嘅永久紀錄，就咁改咗佢，即係靜靜雞換咗人哋已經載咗嘅嘢。',
  },

  'rl.codename.heading': { en: 'The code name', yue: '個代號' },
  'rl.codename.body': {
    en: [
      'Every release is also named after a dim sum dish, in English and Traditional Chinese, and carries that dish’s photograph. It sits beside the version rather than replacing it: a version number is what a machine identifies a build by, and a code name is what a person remembers it as.',
      'Every release is also named after a dim sum dish, in English and Traditional Chinese, and carries that dish’s photograph. It sits beside the version rather than replacing it: a version number is what a machine identifies a build by, and a code name is what a person remembers it as.',
      'Every release is also named after a dim sum dish, in English and Traditional Chinese, and carries that dish’s photograph. It sits beside the version rather than replacing it — a version number is what a machine identifies a build by, and a code name is what a person actually remembers it as.',
      'Every release is also named after a dim sum dish, in English and Traditional Chinese, and carries that dish’s photograph. It sits beside the version rather than replacing it, because a version number is what a machine identifies a build by, and a code name is what a person actually remembers it as three weeks later.',
      'Every release is also named after a dim sum dish, in English and Traditional Chinese, and carries that dish’s photograph. It sits beside the version rather than replacing it, because a version number is what a machine identifies a build by, and a code name is what a person actually remembers it as three weeks later, in the sentence that begins "you know, the one with the…".',
    ],
    yue: [
      '每個 release 都會用一味點心改名，中英文都有，仲會帶埋嗰味嘢嘅相。個代號係擺喺版本號旁邊，唔係取代佢：版本號係機器認一個 build 嘅嘢，代號係人記得住嘅嘢。',
      '每個 release 都會用一味點心改名，中英文都有，仲會帶埋嗰味嘢嘅相。個代號係擺喺版本號旁邊，唔係取代佢：版本號係機器認一個 build 嘅嘢，代號係人記得住嘅嘢。',
      '每個 release 都會用一味點心改名，中英文都有，仲會帶埋嗰味嘢嘅相。個代號係擺喺版本號旁邊，唔係取代佢 — 版本號係機器認一個 build 嘅嘢，代號先係人真係記得住嘅嘢。',
      '每個 release 都會用一味點心改名，中英文都有，仲會帶埋嗰味嘢嘅相。個代號擺喺版本號旁邊，唔係取代佢，因為版本號係機器認一個 build 嘅嘢，而代號先係三個禮拜之後個人真係記得返嘅嘢。',
      '每個 release 都會用一味點心改名，中英文都有，仲會帶埋嗰味嘢嘅相。個代號擺喺版本號旁邊，唔係取代佢，因為版本號係機器認一個 build 嘅嘢，而代號先係三個禮拜之後個人真係記得返嘅嘢 — 就係嗰句「你知啦，就係嗰個…」入面嗰個。',
    ],
  },
  'rl.codename.once': {
    en: 'A dish is used once. The picker reads the dishes already spent out of the existing release notes rather than from a counter, so a re-run cannot hand out the same dish twice — two builds sharing a name would defeat the one job a code name has. It also skips any dish whose image is not actually present, because a code name that renders as a broken image is worse than none.',
    yue: '一味點心用一次。個揀名程式係去讀返舊嘅發佈說明，睇邊啲已經用咗，唔係靠一個計數器，所以再行一次都唔會派返同一味 — 兩個 build 同名，就正正毀咗代號唯一嗰個用途。佢仲會跳過啲根本冇相嘅點心，因為一個 render 出嚟係爛圖嘅代號，衰過冇。',
  },
  'rl.published.caption': { en: 'The releases published so far and the dish each one is named after', yue: '到目前為止出咗嘅 release，同每個用邊味點心改名' },
  'rl.published.col.tag': { en: 'Tag', yue: 'Tag' },
  'rl.published.col.dish': { en: 'Code name', yue: '代號' },
  'rl.published.col.when': { en: 'Published', yue: '出版日期' },
  'rl.published.note': {
    en: [
      'This table was written by hand and does not update itself. Where it disagrees with the releases page, the releases page is right.',
      'This table was written by hand and does not update itself. Where it disagrees with the releases page, the releases page is right.',
      'This table was written by hand and does not update itself. Where it disagrees with the releases page, believe the releases page.',
      'This table was typed by hand and does not update itself. Where it disagrees with the releases page, believe the releases page and not this one.',
      'This table was typed by hand and does not update itself, which means it is wrong the moment it is out of date. Where it disagrees with the releases page, believe the releases page and not this one.',
    ],
    yue: [
      '呢個表係人手寫嘅，唔會自己更新。同 releases 頁唔夾嘅話，係 releases 頁啱。',
      '呢個表係人手寫嘅，唔會自己更新。同 releases 頁唔夾嘅話，係 releases 頁啱。',
      '呢個表係人手打嘅，唔會自己更新。同 releases 頁唔夾嘅話，信 releases 頁。',
      '呢個表係人手打嘅，唔會自己更新。同 releases 頁唔夾嘅話，信 releases 頁，唔好信呢個。',
      '呢個表係人手打嘅，唔會自己更新，即係一過期就即刻變錯。同 releases 頁唔夾嘅話，信 releases 頁，唔好信呢個。',
    ],
  },

  'rl.lines.heading': { en: 'The line count', yue: '行數統計' },
  'rl.lines.body': {
    en: 'Each release states how many lines of code the project had at the exact commit it was built from. Continuous integration runs the committed counter during the release run, so the number belongs to the released commit rather than to whenever somebody last thought to measure.',
    yue: '每個 release 都會寫明，喺佢 build 嗰個 commit 上面，個項目有幾多行 code。Continuous integration 喺 release 運行入面行嗰個 commit 咗嘅計數器，所以個數係屬於嗰個發佈 commit，唔係屬於「上次有人記得去度」嗰陣。',
  },
  'rl.lines.split': {
    en: [
      'It is never one total. The table separates this repository’s own source, its tests, its styles and markup, its documentation and its generated files, and it names what was excluded — the vendored upstream tree is not this project’s code, and folding it in would flatter the number by a factor nobody could see. It also splits the surviving lines by whether a person or an agent wrote them, which is stated without spin in either direction.',
      'It is never one total. The table separates this repository’s own source, its tests, its styles and markup, its documentation and its generated files, and it names what was excluded — the vendored upstream tree is not this project’s code, and folding it in would flatter the number by a factor nobody could see. It also splits the surviving lines by whether a person or an agent wrote them, which is stated without spin in either direction.',
      'It is never one grand total, because a grand total is the least informative version of this and the easiest to inflate. The table separates this repository’s own source, its tests, its styles and markup, its documentation and its generated files, and names what was excluded — the vendored upstream tree is not this project’s code, and quietly folding it in would flatter the number by a factor nobody could see. It also splits the surviving lines by whether a person or an agent wrote them, stated without spin in either direction.',
      'It is never one grand total, because a grand total is the least informative version of this and by far the easiest to inflate. The table separates this repository’s own source, its tests, its styles and markup, its documentation and its generated files, and names what was left out — the vendored upstream tree is not this project’s code, and quietly folding it in would flatter the number by a factor nobody could see. It also splits the surviving lines by whether a person or an agent wrote them, stated flatly and without spin in either direction.',
      'It is never one grand total, because a grand total is the least informative version of this and by far the easiest to inflate. The table separates this repository’s own source, its tests, its styles and markup, its documentation and its generated files, and names what was left out — the vendored upstream tree is somebody else’s code, and quietly folding it in would flatter the number by a factor nobody could see without checking. It also splits the surviving lines by whether a person or an agent wrote them, stated flatly: a high agent share is not a boast, and it is not an apology either.',
    ],
    yue: [
      '從來唔會淨係報一個總數。個表會將呢個 repository 自己嘅原始碼、測試、樣式同標記、文件同生成檔案分開，仲會講明剔走咗啲乜 — 收埋喺入面嘅上游檔案樹唔係呢個項目嘅 code，撈埋落去就會令個數字靚咗好多，而且冇人睇得出。佢亦都會將仲留低嘅行分開係人寫定 agent 寫，兩邊都唔加修飾。',
      '從來唔會淨係報一個總數。個表會將呢個 repository 自己嘅原始碼、測試、樣式同標記、文件同生成檔案分開，仲會講明剔走咗啲乜 — 收埋喺入面嘅上游檔案樹唔係呢個項目嘅 code，撈埋落去就會令個數字靚咗好多，而且冇人睇得出。佢亦都會將仲留低嘅行分開係人寫定 agent 寫，兩邊都唔加修飾。',
      '從來唔會淨係報一個大總數，因為大總數係最冇資訊量、亦最易𠺘水嗰種。個表會將呢個 repository 自己嘅原始碼、測試、樣式同標記、文件同生成檔案分開，仲會講明剔走咗啲乜 — 收埋喺入面嘅上游檔案樹唔係呢個項目嘅 code，靜靜雞撈埋落去，個數字就會靚咗好多倍，而且冇人睇得出。佢亦都會將仲留低嘅行分開係人寫定 agent 寫，兩邊都唔加修飾。',
      '從來唔會淨係報一個大總數，因為大總數係最冇資訊量、亦最易𠺘水嗰種。個表會將呢個 repository 自己嘅原始碼、測試、樣式同標記、文件同生成檔案分開，仲會講明漏低咗啲乜 — 收埋喺入面嘅上游檔案樹唔係呢個項目嘅 code，靜靜雞撈埋落去，個數字就會靚咗好多倍，而且冇人睇得出。佢亦都會將仲留低嘅行分開係人寫定 agent 寫，照直講，兩邊都唔加修飾。',
      '從來唔會淨係報一個大總數，因為大總數係最冇資訊量、亦係最易𠺘水嗰種。個表會將呢個 repository 自己嘅原始碼、測試、樣式同標記、文件同生成檔案分開，仲會講明漏低咗啲乜 — 收埋喺入面嘅上游檔案樹係人哋嘅 code，靜靜雞撈埋落去，個數字就會靚咗好多倍，而且唔查根本睇唔出。佢亦都會將仲留低嘅行分開係人寫定 agent 寫，照直講：agent 寫得多唔係威水嘢，亦唔係要道歉嘅嘢。',
    ],
  },

  'rl.evidence.heading': { en: 'How the evidence is recorded', yue: '啲證據點樣記低' },
  'rl.evidence.smoke': {
    en: 'The smoke-test line reports what the step actually did — passed, failed, or not run — read from the step’s own outcome. A skipped smoke test says so rather than implying a pass.',
    yue: 'Smoke test 嗰行報嘅係嗰步真係做咗啲乜 — 過咗、fail 咗，定係未行過 — 直接讀返嗰步自己嘅結果。跳咗嘅 smoke test 會照講係跳咗，唔會扮到似過咗。',
  },
  'rl.evidence.exists': {
    en: 'The installer path the build reported is checked to exist before anything is published. A packer that reports a file it did not write fails the run instead of producing a release with nothing behind its download link.',
    yue: '出版之前，會先驗返個 build 報出嚟嘅安裝檔路徑真係存在。如果個 packer 報咗一個佢根本冇寫出嚟嘅檔案，就會令成次運行 fail，好過出咗個 release 但下載 link 後面乜都冇。',
  },
  'rl.evidence.count': {
    en: 'If the line counter fails, the notes say the count is not available for that build. They never carry a number that was guessed.',
    yue: '如果個行數計數器 fail 咗，發佈說明就會寫明嗰個 build 冇行數。佢永遠唔會擺一個估返嚟嘅數字上去。',
  },
  'rl.evidence.run': {
    en: 'Every release links the run that produced it, so the build log behind any of these claims can be read rather than taken on trust.',
    yue: '每個 release 都會連返出佢嗰次運行，所以上面任何一句講法背後嗰份 build log，你都可以自己打開嚟睇，唔使靠信。',
  },

  'rl.caveat.heading': {
    en: ['What a release does not yet prove', 'What a release does not yet prove', 'What a release does not yet prove', 'What a release still does not prove', 'What a release still does not prove'],
    yue: ['一個 release 仲未證明到啲乜', '一個 release 仲未證明到啲乜', '一個 release 仲未證明到啲乜', '一個 release 到而家都仲未證明到啲乜', '一個 release 到而家都仲未證明到啲乜'],
  },
  'rl.caveat.ui': {
    en: 'The released build carries the Material Design 3 token sheet and the custom Windows title bar. The component inventory has not been rebuilt on them, and no screenshot of the running application appears anywhere on this site.',
    yue: '出咗嗰個 build 帶住 Material Design 3 嘅 token 表同自訂 Windows 標題列。啲元件就未用返佢哋重新起過，而呢個網站任何一頁都冇一張行緊嘅 app 嘅截圖。',
  },
  'rl.caveat.standards': {
    en: 'The language modes, the two funny-level sliders, the regex builder, the dim sum surprise and the changelog viewer are implemented on this site and are still in progress in the application. The Standards section states each one separately for exactly that reason.',
    yue: '語言模式、兩條搞笑程度拉桿、regex 產生器、點心驚喜同更新紀錄檢視器，喺呢個網站度做咗，喺個 app 度仲進行緊。「標準」嗰版就係為咗呢個原因，先至逐項分開講。',
  },
  'rl.caveat.smoke': {
    en: 'The smoke test proves the application installs, starts, answers its own health check and uninstalls cleanly. It does not exercise the interface, and nobody should read it as a statement that any particular feature works.',
    yue: '個 smoke test 證明到個 app 裝到、開到、應到自己個 health check，又拆得乾淨。佢冇試過個介面，所以唔好將佢當成「邊個功能行得」嘅講法。',
  },
  'rl.caveat.signing': {
    en: 'The installer is unsigned. Until a certificate is obtained, every first run has a SmartScreen warning in front of it.',
    yue: '個安裝檔未簽名。攞到證書之前，每次第一次開都會有個 SmartScreen 警告攔喺前面。',
  },

  /* ===================================================================== *
   * Documentation panel.
   *
   * The per-article and per-path descriptions below are plain strings, for
   * the same reason the status badges are: this is an INDEX. A reader scans
   * it looking for the one line that matches what they came for, and an index
   * entry that rewords itself between visits is an index entry they have to
   * read twice. The headings and the framing prose around the index take the
   * funny levels; the entries themselves stay put.
   * ===================================================================== */

  'dc.heading': { en: 'Documentation', yue: '文件' },

  'dc.intro': {
    en: [
      'The reference documentation is a tree of Markdown files in the repository, organised into eight categories holding 41 articles. This panel indexes it and links every article at its source. It is not a copy: two copies of the same document drift apart, and the one nobody remembers to edit is the one a reader believes.',
      'The reference documentation is a tree of Markdown files in the repository, organised into eight categories holding 41 articles. This panel indexes it and links every article at its source. It is not a copy: two copies of the same document drift apart, and the one nobody remembers to edit is the one a reader believes.',
      'The reference documentation is a tree of Markdown files in the repository, organised into eight categories holding 41 articles. This panel indexes it and links every article at its source rather than restating it. Two copies of one document drift apart, and the copy nobody remembers to edit is invariably the one the reader happens to find.',
      'The reference documentation is a tree of Markdown files in the repository, organised into eight categories holding 41 articles. This panel indexes it and links every article at its source rather than restating it — because two copies of one document always drift apart, and the copy nobody remembers to edit is invariably the one the reader happens to find first.',
      'The reference documentation is a tree of Markdown files in the repository, organised into eight categories holding 41 articles. This panel indexes it and links every article at its source rather than restating a word of it. Two copies of one document always drift apart; the copy nobody remembers to edit is invariably the one the reader finds first; and stale documentation is worse than none, because it is confidently wrong and gives the reader no way to tell.',
    ],
    yue: [
      '參考文件係 repository 入面一棵 Markdown 檔案樹，分成八個類別、總共 41 篇文。呢版做佢個索引，每篇文都連返去佢原本嗰個位。呢度唔係抄本：同一份文件有兩個抄本就一定會分家，而冇人記得改嗰份，偏偏就係讀者信嗰份。',
      '參考文件係 repository 入面一棵 Markdown 檔案樹，分成八個類別、總共 41 篇文。呢版做佢個索引，每篇文都連返去佢原本嗰個位。呢度唔係抄本：同一份文件有兩個抄本就一定會分家，而冇人記得改嗰份，偏偏就係讀者信嗰份。',
      '參考文件係 repository 入面一棵 Markdown 檔案樹，分成八個類別、總共 41 篇文。呢版做佢個索引，每篇文都連返去原本嗰個位，唔會喺呢度重講一次。同一份文件有兩個抄本一定會分家，而冇人記得改嗰份，就係讀者啱啱撞到嗰份。',
      '參考文件係 repository 入面一棵 Markdown 檔案樹，分成八個類別、總共 41 篇文。呢版做佢個索引，每篇文都連返去原本嗰個位，唔會喺呢度重講一次 — 因為同一份文件有兩個抄本一定會分家，而冇人記得改嗰份，偏偏就係讀者最先撞到嗰份。',
      '參考文件係 repository 入面一棵 Markdown 檔案樹，分成八個類別、總共 41 篇文。呢版做佢個索引，每篇文都連返去原本嗰個位，一隻字都唔會喺呢度重講。同一份文件有兩個抄本一定會分家；冇人記得改嗰份，偏偏就係讀者最先撞到嗰份；而過咗期嘅文件仲衰過冇文件，因為佢會好有信心咁講錯嘢，而讀者根本分唔出。',
    ],
  },

  'dc.open': {
    en: ['Open the documentation', 'Open the documentation', 'Open the documentation', 'Go and read it', 'Go and read the whole thing'],
    yue: ['打開文件', '打開文件', '打開文件', '入去睇', '入去由頭睇一次'],
  },

  'dc.start.heading': { en: 'Start here', yue: '由呢度開始' },
  'dc.start.sub': {
    en: [
      'The question you arrived with, and the page that answers it.',
      'The question you arrived with, and the page that answers it.',
      'The question you arrived with, and the page that actually answers it.',
      'Whatever question brought you here, and the page that actually answers it.',
      'Whatever question brought you here, and the one page that actually answers it — rather than the five that mention it.',
    ],
    yue: [
      '你嚟到諗住問嘅嘢，同埋答到你嗰版。',
      '你嚟到諗住問嘅嘢，同埋答到你嗰版。',
      '你嚟到諗住問嘅嘢，同埋真係答到你嗰版。',
      '無論你係為咗咩問題嚟，呢度有真係答到你嗰版。',
      '無論你係為咗咩問題嚟，呢度有真係答到你嗰一版 — 唔係嗰五版有提過但唔答你嘅。',
    ],
  },
  'dc.start.caption': { en: 'Common questions and the documentation page that answers each one', yue: '常見問題，同埋每個問題對應嗰版文件' },
  'dc.start.col.want': { en: 'If you want to…', yue: '如果你想…' },
  'dc.start.col.read': { en: 'Read', yue: '睇' },
  'dc.start.what': { en: 'Understand what the product actually is', yue: '搞清楚呢件產品究竟係乜' },
  'dc.start.trust': { en: 'Know how the upstream copy got here, and why it can be trusted', yue: '知道上游嗰份點樣搬咗入嚟，同點解信得過' },
  'dc.start.build': { en: 'Build an installer, or read what the release run does', yue: 'Build 個安裝檔，或者睇下 release 運行做緊乜' },
  'dc.start.local': { en: 'Build it locally instead', yue: '寧願自己喺本機 build' },
  'dc.start.release': { en: 'Understand how a release is produced, and what proves it works', yue: '搞清楚一個 release 點樣整出嚟，同埋邊樣嘢證明佢真係行得' },
  'dc.start.trouble': { en: 'Diagnose a failure somebody here has already hit', yue: '查一個呢度有人踩過嘅坑' },
  'dc.start.standards': { en: 'Know what this project holds itself to', yue: '知道呢個項目自己要守啲乜' },
  'dc.start.site': { en: 'Publish or change this site', yue: '出版或者改呢個網站' },
  'dc.start.api': { en: 'Call the local daemon over HTTP', yue: '用 HTTP 叫本機 daemon' },

  'dc.cat.heading': { en: 'The eight categories', yue: '八個類別' },
  'dc.cat.sub': {
    en: [
      'Each category has an index that lists its own articles. The index is the authority — a new article is added to it, and to nothing else.',
      'Each category has an index that lists its own articles. The index is the authority — a new article is added to it, and to nothing else.',
      'Each category has an index listing its own articles. The index is the authority: a new article gets added there, and nowhere else.',
      'Each category has an index listing its own articles, and that index is the authority: a new article gets added there and nowhere else. This page is a convenience, not a source of truth.',
      'Each category has an index listing its own articles, and that index is the authority: a new article gets added there and nowhere else. This page is a convenience that somebody has to remember to update, which tells you exactly how much to trust it.',
    ],
    yue: [
      '每個類別都有個索引，列住佢自己啲文。索引先係話事嗰個 — 新文係加落去嗰度，唔會加去第度。',
      '每個類別都有個索引，列住佢自己啲文。索引先係話事嗰個 — 新文係加落去嗰度，唔會加去第度。',
      '每個類別都有個索引，列住佢自己啲文。索引先係話事嗰個：新文加落去嗰度，其他地方都唔會加。',
      '每個類別都有個索引，列住佢自己啲文，而嗰個索引先係話事嗰個：新文加落去嗰度，其他地方都唔會加。呢版係方便你，唔係真理來源。',
      '每個類別都有個索引，列住佢自己啲文，而嗰個索引先係話事嗰個：新文加落去嗰度，其他地方都唔會加。呢版係方便你，但要有人記得更新 — 咁你就知應該信佢幾多。',
    ],
  },

  'dc.cat.porting': {
    en: 'How the upstream tree was imported byte-for-byte, and the verifier plus licence-notice contract that proves it stayed that way. The verification article is the longest and most careful page in the tree, and the one to read if you only read one.',
    yue: '上游嗰棵檔案樹點樣一個 byte 都唔差咁搬入嚟，同埋嗰個驗證 script 加授權通知嘅合約，點樣證明佢一直冇變過。驗證嗰篇係成棵樹入面最長、寫得最仔細嘅一篇，如果淨係睇一篇，睇佢。',
  },
  'dc.cat.architecture': {
    en: 'The daemon, the web interface, the desktop shell, the packaged application and this site: how the pieces connect, which ports they bind, what configures them, and how they fail.',
    yue: 'Daemon、網頁介面、桌面外殼、打包好嘅 app 同呢個網站：啲部件點樣駁埋一齊、綁邊啲 port、用咩設定，同埋佢哋壞嘅時候係點樣壞。',
  },
  'dc.cat.build': {
    en: 'Why builds run in continuous integration rather than on somebody’s laptop, what each workflow does step by step, and the exact commands for building locally including the Windows prerequisites that catch people out.',
    yue: '點解啲 build 要行喺 continuous integration 度、唔係行喺某人部手提電腦度；每個 workflow 逐步做啲乜；同埋喺本機 build 嘅完整指令，包埋啲成日整死人嘅 Windows 前置需求。',
  },
  'dc.cat.release': {
    en: 'How a release is produced end to end, what the packaged smoke test actually proves and what it does not, how the line count is produced and what its scopes mean, how a dim sum code name is chosen and spent exactly once, and what each published file is.',
    yue: '一個 release 由頭到尾點樣整出嚟、打包完個 smoke test 究竟證明到啲乜（同證明唔到啲乜）、行數點樣計同啲範圍代表咩、點揀個點心代號同點解一款點心只可以用一次，同埋每個出街嘅檔案係乜嚟。',
  },
  'dc.cat.troubleshooting': {
    en: 'Failures this project actually hit, never hypothetical ones: the symptom as it appeared in a log, the cause, the fix, and how to avoid reintroducing it. Plus a table of signals — what thousands of even differences usually mean, what zero tests executed usually means.',
    yue: '呢個項目真係踩過嘅坑，一個都唔係作出嚟：症狀原原本本喺 log 入面點樣現身、成因、點修，同埋點樣先唔會再整返一次。仲有一張訊號表 — 幾千個平均分佈嘅差異通常代表咩、一個 test 都冇行過通常代表咩。',
  },
  'dc.cat.standards': {
    en: 'The requirements this product is being brought up to, one article per standard, each stating the requirement, its honest implementation status, and how conformance will be checked once it exists. This is where the gap between the site and the application is written down.',
    yue: '呢件產品要達到嘅要求，一個標準一篇文，每篇寫明個要求、老實嘅實作狀態，同埋做好之後會點樣驗。網站同個 app 之間差幾遠，就係寫喺呢度。',
  },
  'dc.cat.site': {
    en: 'This page: what it is built from, the workflow that deploys it, the publish-time check that refuses to ship it if any asset would be fetched from somewhere else, and the base-path trap that makes a green deployment serve nothing but 404s.',
    yue: '呢版嘢：佢由咩砌出嚟、邊個 workflow 部署佢、出版嗰陣嗰個檢查點樣一見到有資源要出街攞就唔畀出，同埋嗰個 base path 陷阱 — 部署明明綠色，但成個站淨係派 404。',
  },
  'dc.cat.api': {
    en: 'The local daemon’s HTTP surface, grouped by route file, with its authentication and origin posture and the security notes that go with binding a local service to anything wider than loopback.',
    yue: '本機 daemon 嘅 HTTP 介面，按 route 檔案分組，連埋佢嘅認證同來源設定，同埋將一個本機服務綁到 loopback 以外嗰陣要留意嘅保安事項。',
  },

  'dc.articles.heading': { en: 'Every article', yue: '每一篇文' },
  'dc.articles.sub': {
    en: [
      'Written by hand, so it lags the tree. Where this list and a category index disagree, the index is right.',
      'Written by hand, so it lags the tree. Where this list and a category index disagree, the index is right.',
      'Written by hand, so it lags the tree. Where this list and a category index disagree, believe the index.',
      'Written by hand, so it lags the tree by however long it has been since somebody remembered. Where this list and a category index disagree, believe the index.',
      'Written by hand, so it lags the tree by exactly however long it has been since somebody remembered this panel exists. Where this list and a category index disagree, believe the index.',
    ],
    yue: [
      '呢個列表係人手寫嘅，所以會落後過真正嘅檔案樹。同類別索引唔夾嘅話，係索引啱。',
      '呢個列表係人手寫嘅，所以會落後過真正嘅檔案樹。同類別索引唔夾嘅話，係索引啱。',
      '呢個列表係人手寫嘅，所以會落後過真正嘅檔案樹。同類別索引唔夾嘅話，信索引。',
      '呢個列表係人手寫嘅，所以會落後 — 落後幾多要睇上次有人記得更新係幾時。同類別索引唔夾嘅話，信索引。',
      '呢個列表係人手寫嘅，所以會落後 — 落後幾多，就等於上次有人記得「原來仲有呢版嘢」到而家隔咗幾耐。同類別索引唔夾嘅話，信索引。',
    ],
  },
  'dc.articles.caption': { en: 'Every documentation article, its category, and what it covers', yue: '每篇文件、佢屬邊個類別，同埋佢講咩' },
  'dc.articles.col.file': { en: 'Article', yue: '文章' },
  'dc.articles.col.covers': { en: 'What it covers', yue: '講咩' },
  'dc.articles.indexes': {
    en: 'Each category also has its own index, listing every article in that category with a one-line description and stating what is implemented and what is not. Those are linked from the cards above.',
    yue: '每個類別都有自己嘅索引，逐篇文寫一行簡介，仲會講明邊啲做咗、邊啲未做。上面啲卡都連咗去。',
  },

  'dc.a.verbatim': {
    en: 'How the copy was made: raw blob extraction with every filter disabled, the four separate ways an ordinary working-tree copy fails, restoring the executable bit, and the files that had to be force-added.',
    yue: '份抄本點樣整出嚟：原始 blob 抽取、關晒所有 filter，普通複製工作目錄會用邊四種方式搞砸，點樣救返 executable bit，同埋邊幾個檔案要夾硬 add 入去。',
  },
  'dc.a.verification': {
    en: 'The verifier in full: its two independent checks, every counter, the exit codes and why "the check failed" and "the check did not happen" are different numbers, the licence notice as a machine-read allowlist, its self-tests, and the line-ending trap.',
    yue: '成個驗證 script：兩個獨立檢查、每個計數器、啲 exit code，同埋點解「檢查唔過」同「根本冇檢查過」要用唔同數字，張授權通知點樣做機器讀嘅 allowlist、佢自己嘅自我測試，同埋嗰個換行符陷阱。',
  },
  'dc.a.overview': {
    en: 'The processes and what each one is responsible for, the shared packages, the ports and bind addresses, the environment variables, the runtime requirements, the failure modes and the security posture.',
    yue: '有邊幾個 process、每個負責啲乜、共用嘅 package、port 同綁定位址、環境變數、運行需求、失敗模式，同埋保安立場。',
  },
  'dc.a.ci': {
    en: 'The verification gate and the release run, step by step: why the gate checks out without the submodule, what the release notes carry, the triggers, the tokens, and the unsigned-installer position.',
    yue: '驗證關卡同 release 運行，逐步講：點解個關卡 checkout 嗰陣唔要 submodule、發佈說明入面有啲乜、觸發條件、token，同埋未簽名安裝檔嘅立場。',
  },
  'dc.a.fromsource': {
    en: 'Building locally: the prerequisites, the package manager on Windows, the line endings to fix before cloning rather than after, installing, running, typechecking, testing, packaging, and what goes wrong at each step.',
    yue: '喺本機 build：前置需求、Windows 上面個 package manager、要喺 clone 之前而唔係之後搞掂嘅換行符、安裝、運行、型別檢查、測試、打包，同埋每一步會出咩問題。',
  },
  'dc.a.language': {
    en: 'The three language modes and the two tone sliders, the rule that voice changes and facts never do, and what registering a Cantonese locale in the application actually requires.',
    yue: '三個語言模式同兩條語氣拉桿、「語氣可以變、事實唔可以變」呢條規矩，同埋喺個 app 度登記一個粵語 locale 究竟要做啲乜。',
  },
  'dc.a.md3': {
    en: 'Material Design 3 conformance and appearance customization: the token handoff map, the component inventory, the colour roles, the shape and motion scales, and the window chrome.',
    yue: 'Material Design 3 達標同外觀自訂：token 交接對照表、元件清單、色彩角色、形狀同動態級距，同埋視窗外框。',
  },
  'dc.a.regex': {
    en: 'What the pattern builder must offer, why it has to be anchored beside the field it belongs to rather than shared, which engine and dialect it names, and the guards that keep a pasted pattern from freezing the interface.',
    yue: '個 pattern 產生器要提供啲乜、點解佢要貼實佢所屬嗰個輸入格而唔係大家共用一個、佢用邊個引擎同方言，同埋有咩防護令一個貼落去嘅 pattern 唔會凍死個介面。',
  },
  'dc.a.tabs': {
    en: 'Tabbed navigation: overflow, reordering, pinning, grouping, the four tab-discovery searches, the two bulk-close actions, and why persistence needs a stable identity rather than an index.',
    yue: '分頁導覽：溢出、重新排序、釘住、分組、四個分頁搜尋、兩個批次關閉動作，同埋點解要記住狀態就一定要用穩定嘅識別碼，唔可以用位置。',
  },
  'dc.a.notifications': {
    en: 'Non-blocking notifications and the notification centre, then the super-confirmation gate for destructive actions — which this tree flags as the largest undesigned gap in the whole set, because it guards the actions where getting it wrong destroys someone’s work.',
    yue: '唔阻你做嘢嘅通知同通知中心，然後係破壞性動作嘅超級確認關卡 — 呢棵文件樹自己標明咗，佢係成套標準入面最大嗰個「連設計都未有」嘅缺口，因為佢守住嘅係做錯就會毀咗人哋啲嘢嗰啲動作。',
  },
  'dc.a.a11y': {
    en: 'Keyboard reach, visible focus, roles and names, contrast, reduced motion, the no-clipping matrix, element sizing, and the rule that anything drawn to look operable must actually be operable.',
    yue: '鍵盤去唔去到、focus 睇唔睇得見、role 同名、對比度、減少動態、唔准切崩嘅檢查矩陣、元件尺寸，同埋「畫到似撳得嘅嘢就一定要真係撳得」呢條規矩。',
  },
  'dc.a.export': {
    en: 'Export as a property of every surface rather than a feature of a few, the format matrix, the archive options, multi-select and bulk actions, and saying what will be lost before an export runs instead of truncating quietly.',
    yue: '匯出係每個介面都應該有嘅特性，唔係得幾個地方先有嘅功能；格式矩陣、壓縮選項、多選同批次動作，同埋喺匯出之前講清楚會蝕咗啲乜，唔係靜靜雞剪短咗佢。',
  },
  'dc.a.releases': {
    en: 'The installer requirement, the line-count rules, the code names, the in-app changelog viewer, local version history, the startup surprise, and how the dim sum catalogue is assembled.',
    yue: '安裝檔嘅要求、行數統計嘅規矩、代號、app 入面嘅更新紀錄檢視器、本機版本歷史、開機驚喜，同埋個點心目錄係點樣砌出嚟。',
  },
  'dc.a.pages': {
    en: 'How this page is deployed, the publish-time gate that reads the built output for any reference to a third-party origin, the base-path trap, and the rule about what a download button may point at.',
    yue: '呢版點樣部署、出版嗰陣個關卡點樣掃 build 出嚟嘅檔案搵有冇引用第三方來源、嗰個 base path 陷阱，同埋一個下載掣可以指去邊度嘅規矩。',
  },
  'dc.a.api': {
    en: 'The daemon’s HTTP surface grouped by route file, its base URL, its authentication and origin posture, and the security notes that apply before exposing it beyond the local machine.',
    yue: 'Daemon 嘅 HTTP 介面，按 route 檔案分組，佢個 base URL、認證同來源設定，同埋將佢開放到本機以外之前要睇嘅保安事項。',
  },

  'dc.a.daemon': {
    en: 'The only stateful process: what it owns, its startup order, the three probe endpoints, the command-line entry point, every network and path variable, and why reaching its API is equivalent to shell access.',
    yue: '成個產品入面唯一有狀態嘅 process：佢管咩、啟動次序、三個探測 endpoint、命令列入口、所有網絡同路徑變數，同埋點解掂到佢個 API 就等於攞到 shell。',
  },
  'dc.a.webruntime': {
    en: 'The single-page interface and the three genuinely different ways it reaches the daemon — development rewrites, static export, packaged server-side rendering — plus the locales, the boundary it may not cross, and the Material Design 3 token layer as it currently stands.',
    yue: '單頁介面，同埋佢掂 daemon 嗰三種真係唔同嘅方式 —— 開發時嘅 rewrite、靜態匯出、打包後嘅伺服器端渲染 —— 仲有啲語言、佢唔可以越過嘅界線，同埋 Material Design 3 token 層而家去到邊。',
  },
  'dc.a.desktopshell': {
    en: 'The desktop main process: why it never guesses the web port, the sidecar control channel that doubles as the test harness, the frameless Windows window and its renderer-drawn title bar, the window-control channels, and the preload trust boundary.',
    yue: '桌面主 process：點解佢由頭到尾都唔會估個 web port、嗰條 sidecar 控制通道點樣順便做埋測試工具、Windows 嗰個冇框視窗同佢自己畫嘅標題列、視窗控制鍵嘅通道，同埋 preload 嗰條信任界線。',
  },
  'dc.a.packagedruntime': {
    en: 'What actually launches when somebody runs the installed application: the launcher, the custom URL scheme and its retry, sidecar stamps and namespaces, the child-environment allowlist, the namespace-scoped path layout, and a packaged-versus-development comparison.',
    yue: '有人撳個裝咗嘅 app 嗰陣，真正行起身嘅係咩：launcher、自訂 URL scheme 同佢嘅重試、sidecar 印記同命名空間、子 process 環境變數嘅白名單、按命名空間分嘅路徑佈局，同埋打包版對開發版嘅對照。',
  },
  'dc.a.datadirectory': {
    en: 'The single most important invariant in the codebase: one process, one data root, resolved once. What derives from it, how it propagates to child processes and packaged builds, the sanctioned exceptions, the known escape patterns, and what actually breaks when it is violated.',
    yue: '成個 codebase 入面最重要嘅一條不變式：一個 process、一個資料根目錄、只解析一次。有咩由佢衍生出嚟、佢點樣傳落子 process 同打包版、有邊幾個獲准嘅例外、有邊幾種已知嘅走漏方式，同埋一旦犯規真係會爛啲乜。',
  },

  'dc.a.pipeline': {
    en: 'The whole release run, step by step: the line-ending guard, port verification inside the release job, install, typecheck, the Windows-only identity suites, the installer build with its explicit existence check, the smoke test, the notes, and publication.',
    yue: '成個 release 運行逐步拆開：換行符守衛、release job 入面自己再驗一次個 port、安裝、型別檢查、淨係 Windows 行嘅身份測試、build 安裝檔同埋特登再查一次佢真係喺度、smoke test、寫發佈說明，然後出版。',
  },
  'dc.a.smoketest': {
    en: 'The only step that checks the product works: it installs the built installer, launches it, makes the running process answer its own health endpoint, screenshots it, uninstalls it and asserts zero residue. Assertion by assertion — with an explicit list of what it does not prove.',
    yue: '成條 pipeline 入面唯一真係查產品行唔行得嘅一步：裝返個 build 出嚟嘅安裝檔、開佢、要行緊嗰個 process 答返自己個健康檢查、影相、再解除安裝，然後查實冇留低任何殘渣。逐條斷言講 —— 仲有一張清單，寫明佢證明唔到啲乜。',
  },
  'dc.a.linecount': {
    en: 'How the published figure is produced by a committed script at the released commit, what its two scopes and three totals mean, how authorship is attributed per surviving line rather than by summing added lines, and why nobody ever counts by hand.',
    yue: '出街嗰個數字點樣由一個 commit 咗入去嘅 script 喺發佈嗰個 commit 度計出嚟、佢兩個範圍同三個總數各自代表咩、作者身份點樣按「仲生存嘅行數」歸屬而唔係加加埋埋啲新增行，同埋點解冇人可以用手數。',
  },
  'dc.a.codenames': {
    en: 'How the dim sum code name is chosen from the bundled catalogue, why the spent dishes are read out of prior releases rather than a counter, why a dish is spent exactly once, and why a missing dish never blocks a release.',
    yue: '個點心代號點樣喺隨 app 一齊帶嘅目錄度揀、點解用過邊幾款係去舊 release 度讀返而唔係擺個計數器、點解一款點心只可以用一次，同埋點解揾唔到點心都唔會拖住個 release。',
  },
  'dc.a.assets': {
    en: 'What each published file is, which uploads go to the run rather than the release, and what is deliberately absent — no signature, no updater feed, no non-Windows artifacts.',
    yue: '每個出街嘅檔案係乜、邊啲上載係去咗 run 度而唔係去 release 度，同埋特登冇嘅嘢 —— 冇簽名、冇更新來源、Windows 以外咩都冇。',
  },

  'dc.a.lineendings': {
    en: 'A byte comparison reporting thousands of differing files against a tree nobody had touched, because the checkout translated line endings on the way to disk — and why the guard has to come before the checkout step rather than after it.',
    yue: '逐 byte 比對居然話有幾千個檔案唔同，但棵樹根本冇人掂過 —— 因為 checkout 落硬碟嗰陣幫你轉咗換行符。仲有點解嗰個守衛一定要行喺 checkout 之前，唔係之後。',
  },
  'dc.a.platformtests': {
    en: 'Tests asserting a Unix executable bit on a filesystem that has none, and tests building a symlinked layout a runner may not be permitted to create. Both fixed by splitting the suites by what each platform can answer — a split, not a skip.',
    yue: '有啲 test 喺一個根本冇 Unix executable bit 嘅檔案系統度查 executable bit，又有啲 test 要砌一個 runner 未必有權整嘅 symlink 佈局。兩樣都係按「邊個平台答得到」拆開套件解決 —— 係拆開，唔係跳過。',
  },
  'dc.a.unbuilt': {
    en: 'Three suites dying at import time with a missing module, because they import built output that the install step does not build. Zero tests executed and no failures reported means nothing loaded — look for an import error, not an assertion.',
    yue: '三套 test 一 import 就死，話揾唔到個 module，因為佢哋 import 緊安裝步驟根本唔會 build 嘅輸出。行咗零個 test 又報零個失敗，即係咩都冇載入到 —— 去揾 import error，唔好揾斷言。',
  },
  'dc.a.timeouts': {
    en: 'Two platform-gated specs doing real filesystem work, inheriting a five-second default budget written for a fast local disk — and how to tell a budget failure from a hang before assuming either.',
    yue: '兩個按平台開關嘅 spec 真係喺度做檔案系統嘅嘢，但繼承咗一個為快硬碟寫嘅五秒預設時限 —— 同埋喺你亂估之前，點分「超時」同「卡死」。',
  },
  'dc.a.schemadrift': {
    en: 'An installer build rejected before packing anything, because a configuration property moved between major versions of the build tool and now fails schema validation on sight. Nothing was attempted, so nothing was tested.',
    yue: '安裝檔個 build 連 pack 都未開始就俾人拒收，因為有個設定屬性喺 build 工具跨大版本嗰陣搬咗屋，而家一睇到就 schema validation 失敗。咩都未試過，所以咩都未測試過。',
  },

  'dc.a.appearance': {
    en: 'An appearance editor on every rendered element rather than a global theme alone, an infinite colour picker with a colour-space translator, word-processor-depth typography, named presets that export and import, and per-element and global resets.',
    yue: '每一個畫出嚟嘅元素都有自己嘅外觀編輯器，唔係淨係得一個全域主題；一個無限色彩選擇器連色彩空間轉換器；深度去到文書處理器級數嘅字體控制；有名嘅預設可以匯出匯入；仲有逐個元素同全域嘅重設。',
  },
  'dc.a.palette': {
    en: 'One shortcut over every command, setting and destination, with live inline controls in the rows rather than labels alone, and a teleport that opens the surface and reveals the exact control instead of dropping the user on the right tab.',
    yue: '一個快捷鍵通去所有指令、設定同去處，每一行唔淨係得個名，仲有可以即場撳嘅控制項；揀咗之後會直接傳送你去嗰個介面，仲會指住嗰粒掣，唔係擺低你喺啱嘅 tab 度自己揾。',
  },
  'dc.a.changelogviewer': {
    en: 'Every released version readable in the application itself, with a commit link on every entry, an advanced date filter that also accepts typed dates, a search that composes with it rather than overriding it, and export that honours both.',
    yue: '每個發佈過嘅版本都喺 app 入面睇到，每條紀錄都連住個 commit；有個進階日期篩選，仲可以自己打日期入去；搵嘢功能同佢夾埋一齊做而唔係蓋過對方；匯出嗰陣兩樣都照跟。',
  },
  'dc.a.versionhistory': {
    en: 'A local version history covering documents, records and settings — not documents alone — where restoring is recorded as a new revision so an undo can itself be undone, and history is append-only rather than rewritten.',
    yue: '一份本機版本紀錄，唔淨係管文件，仲要管紀錄同設定；還原本身會記做一個新版本，所以「反悔」都可以再反悔，而歷史係淨加唔改，唔會覆寫。',
  },
  'dc.a.superconfirm': {
    en: 'The gate every destructive action passes: two independently operated keys, then a full-range slider, an always-available emergency exit, and focus returned to the control that started it. The largest undesigned gap in the whole set.',
    yue: '每個具破壞性嘅動作都要過嘅關卡：兩條要分開操作嘅鑰匙，然後一條要拉到盡嘅滑桿，一個永遠撳得到嘅緊急出口，做完仲要將焦點還返俾一開始嗰粒掣。呢個係成套要求入面最大嗰個「連設計都未有」嘅缺口。',
  },
  'dc.a.surprise': {
    en: 'One launch in ten shows a dish, named in both languages, from a catalogue bundled in the repository — non-blocking, auto-dismissing, never gating startup, and with no off switch at all.',
    yue: '每十次開 app 就有一次彈返碟點心出嚟，兩種語言都寫齊個名，圖片係 repository 自己帶埋嘅 —— 唔擋你、會自己收、絕對唔會拖慢開機，而且根本冇得閂。',
  },
  'dc.a.localassets': {
    en: 'No script, stylesheet, font or image fetched from a third-party origin and no tracking, on every surface individually — with the publish-time gate that reads the built output and refuses to ship anything that would reach off-origin.',
    yue: '冇任何 script、樣式表、字體或者圖片會去第三方攞，亦冇追蹤，而且係每一個介面各自要守 —— 仲有個出版前嘅關卡，會讀返 build 出嚟嘅嘢，一見到有任何要出街攞嘅資源就唔畀出。',
  },
  'dc.a.externaleditor': {
    en: 'Detecting installed editors, persisting the choice, degrading with a clear message when none is found — and opening every export in one action, as a workspace root rather than a single file with no context around it.',
    yue: '偵測裝咗邊啲編輯器、記住你揀邊個、揾唔到嗰陣要講得清清楚楚 —— 同埋每一個匯出都可以一撳就開，而且要開成個工作區根目錄，唔係開一個孤零零、乜上文下理都冇嘅檔案。',
  },
  'dc.a.overlays': {
    en: 'Every popover, menu and anchored panel paints its own background, border and elevation, stays bounded by the viewport, and scrolls inside that bound rather than silently hiding the content past a height cap.',
    yue: '每一個彈出層、選單同錨定面板都要自己畫底色、邊框同陰影，要限喺可視範圍入面，而且要喺嗰個範圍入面捲動 —— 唔係封咗個高度上限，然後靜靜雞食咗上限以外嘅內容。',
  },
  'dc.a.menushortcuts': {
    en: 'Every context-menu item showing the shortcut that actually works in that context, derived from the same registry that binds it so the two cannot drift — and every context menu carrying its own search field.',
    yue: '每一個右鍵選單項目都要顯示喺嗰個情境下真係撳得郁嘅快捷鍵，而且要由綁定佢嗰個登記處攞，咁兩邊先分唔開家 —— 仲有每個右鍵選單都要有自己嘅搵嘢欄。',
  },
  'dc.a.longops': {
    en: 'A long operation reporting real progress in the surface that started it rather than a bare spinner, guarding against re-entry in the handler and not only by disabling a button, and offering its recovery route where the failure was discovered.',
    yue: '慢嘅操作要喺開佢嗰個介面度報真實進度，唔係擺個轉圈圈喺度 —— 個轉圈同死咗機分唔出；防止重複觸發要做喺處理函式度，唔係淨係將粒掣㩒灰；出咗事嗰陣，補救嘅路要擺喺你發現問題嗰個位。',
  },
  'dc.a.doccurrency': {
    en: 'Documentation, changelog and roadmap brought current in the same task that changes the project — because stale documentation is worse than none, being confidently wrong with no way for the reader to tell.',
    yue: '改咗個項目嘅同一單嘢入面，就要順手將文件、changelog 同 roadmap 一齊更新 —— 因為過咗期嘅文件仲衰過冇文件：佢會好有信心咁講錯嘢，而讀者根本分唔出。',
  },

  'dc.convention.heading': { en: 'The convention every article follows', yue: '每篇文都跟嘅慣例' },
  'dc.convention.sub': {
    en: [
      'Stated here because a convention whose reason is unwritten gets tidied away by the next person.',
      'Stated here because a convention whose reason is unwritten gets tidied away by the next person.',
      'Written down here because a convention whose reason is unwritten gets tidied away by the next person who reads it.',
      'Written down here because a convention whose reason nobody wrote down gets tidied away by the next person, entirely in good faith.',
      'Written down here because a convention whose reason nobody wrote down gets tidied away by the next person — entirely in good faith, and usually in a commit titled "simplify".',
    ],
    yue: [
      '寫喺呢度，係因為一條冇寫低理由嘅慣例，下一個人就會順手執走佢。',
      '寫喺呢度，係因為一條冇寫低理由嘅慣例，下一個人就會順手執走佢。',
      '寫喺呢度，係因為一條冇寫低理由嘅慣例，下一個睇到嘅人就會順手執走佢。',
      '寫喺呢度，係因為一條冇人寫低理由嘅慣例，下一個人就會執走佢，而且完全係好心。',
      '寫喺呢度，係因為一條冇人寫低理由嘅慣例，下一個人就會執走佢 — 完全係好心，而且通常個 commit 標題叫做「簡化」。',
    ],
  },
  'dc.convention.one': {
    en: 'One file per feature, where a feature is something a person can do or something an operator has to configure — never one file per source file and never one per package.',
    yue: '一個功能一個檔案，而「功能」係指一個人做到嘅嘢，或者一個營運者要設定嘅嘢 — 唔係一個原始碼檔案一篇，亦唔係一個 package 一篇。',
  },
  'dc.convention.five': {
    en: 'Every article answers the same questions in the same order: what it does, how it is configured, how it breaks, what it exposes, and how somebody else can check that all of that is true. An article with no failure-modes section is an incomplete article rather than a simple feature.',
    yue: '每篇文都用同一個次序答同一批問題：佢做啲乜、點設定、點會壞、佢暴露咗啲乜，同埋第個人可以點樣驗返上面全部係咪真。一篇冇「失敗模式」嗰節嘅文，係寫得未完，唔係嗰個功能特別簡單。',
  },
  'dc.convention.details': {
    en: 'Long reference material is folded into collapsible blocks, so a page is navigated rather than scrolled. What a first-time reader needs is never collapsed.',
    yue: '長篇參考資料會摺埋入可展開嘅區塊，令一版嘢係「行過去」而唔係「碌落去」。第一次讀嘅人需要嗰啲，永遠唔會摺埋。',
  },
  'dc.convention.honest': {
    en: 'Work that is not implemented is described as not implemented. An article states the requirement, says plainly how far along it is, and describes how conformance will be verified once it exists. It never uses the present tense for something that does not run.',
    yue: '未做嘅嘢就寫明未做。一篇文會寫低個要求、老實講做到邊，再講做好咗之後會點樣驗。佢唔會用現在式去講一啲根本行唔到嘅嘢。',
  },
  'dc.convention.suggested': {
    en: 'Every article ends by pointing at related ones — prerequisites, neighbours, and the natural next step — so a reader is never left at a dead end.',
    yue: '每篇文最後都會指去相關嘅文 — 前置知識、隔籬嗰啲，同埋自然嘅下一步 — 唔會將讀者掉喺掘頭路度。',
  },

  'dc.outside.heading': { en: 'Documented things that live outside the documentation', yue: '喺文件以外、但一樣有記錄嘅嘢' },
  'dc.outside.caption': { en: 'Files elsewhere in the repository and what each one is', yue: 'Repository 其他地方嘅檔案，同每個係乜' },
  'dc.outside.col.path': { en: 'Path', yue: '路徑' },
  'dc.outside.col.what': { en: 'What it is', yue: '係乜' },

  'dc.o.modifications': {
    en: 'The change notice the licence requires, and at the same time the machine-read allowlist of files permitted to differ from upstream. One file, two jobs, which is what keeps the notice and the code from drifting apart.',
    yue: '授權要求嘅改動通知，同時亦係機器讀嘅 allowlist，寫住邊啲檔案准許同上游唔同。一個檔案兩份工，就係咁樣令張通知同 code 分唔到家。',
  },
  'dc.o.changelog': {
    en: 'What has changed, each entry linked to the commit that made it, so a claim can be followed to the code rather than taken on trust.',
    yue: '改咗啲乜，每條紀錄都連返去做嗰嘢嘅 commit，令你可以由一句講法追到落 code 度，唔使靠信。',
  },
  'dc.o.roadmap': {
    en: 'What is done, what is committed but unproven, and what has not been started, kept as three distinct states rather than two.',
    yue: '做完咗啲乜、commit 咗但未驗過啲乜、未開始啲乜 — 分成三個狀態，唔係兩個。',
  },
  'dc.o.scripts': {
    en: 'The verifier, the upstream manifest it falls back to, the line counter continuous integration runs at a released commit, the code-name picker, and the importer that brings dim sum images in byte-for-byte.',
    yue: '驗證 script、佢冇 submodule 時會退返去用嘅上游清單、continuous integration 喺發佈 commit 上面行嘅行數計數器、代號揀選器，同埋一個 byte 都唔差咁搬點心相入嚟嗰個匯入器。',
  },
  'dc.o.postman': {
    en: 'A request collection for the daemon’s HTTP surface, for exercising it without writing a client first.',
    yue: '一套針對 daemon HTTP 介面嘅請求集合，唔使自己寫個 client 都試到佢。',
  },
  'dc.o.site': {
    en: 'The source of this page. Static files with no build step — what is committed is what is served.',
    yue: '呢版嘢嘅原始碼。純靜態檔案，冇 build 步驟 — commit 咗乜就派乜。',
  },

  /* ===================================================================== *
   * Features panel.
   * ===================================================================== */

  'ft.today.caveat.title': {
    en: ['Read from source, not from a running application', 'Read from source, not from a running application', 'Read from the source, not from a running application', 'Read off the source, not off a running application', 'Read off the source, because nobody here has watched it do any of this'],
    yue: ['係由原始碼讀返嚟，唔係由行緊嘅 app 度睇返嚟', '係由原始碼讀返嚟，唔係由行緊嘅 app 度睇返嚟', '係由原始碼讀返嚟，唔係由一個行緊嘅 app 度睇返嚟', '係喺原始碼度讀返嚟，唔係喺行緊嘅 app 度睇返嚟', '係喺原始碼度讀返嚟，因為呢度冇人親眼見過佢做上面任何一樣嘢'],
  },
  'ft.today.caveat.body': {
    en: 'Everything above is inherited from the imported upstream release and described from its own documentation and source. The packaged build has been installed, started and uninstalled by a smoke test, which proves the application runs — it does not exercise any of these features, so none of them has been observed working here.',
    yue: '上面每樣嘢都係由移植入嚟嘅上游版本繼承，而且係照佢自己嘅文件同原始碼寫返出嚟。打包好嘅 build 畀 smoke test 裝過、開過、又拆過，證明到個 app 行得 — 但佢冇試過上面任何一個功能，所以呢度冇一個係親眼見過行得。',
  },

  'ft.network.heading': {
    en: ['Network defaults it ships with', 'Network defaults it ships with', 'The network defaults it ships with', 'What it does on the network before you touch anything', 'What it does on the network before you have touched a single setting'],
    yue: ['佢出廠時嘅網絡預設', '佢出廠時嘅網絡預設', '佢出廠時嘅網絡預設值', '你未郁過任何嘢之前，佢喺網絡上面做緊乜', '你連一個設定都未郁過之前，佢喺網絡上面做緊乜'],
  },
  'ft.network.bind': {
    en: 'The daemon binds loopback by default. Exposing it beyond the local machine requires explicitly setting both a bind host and an allowed-origins list; the container deployment additionally requires an API token.',
    yue: 'Daemon 預設綁 loopback。想開放到本機以外，就要明確咁設定綁定主機同允許來源清單；容器部署仲要多一個 API token。',
  },
  'ft.network.ssrf': {
    en: 'Outbound provider proxying is guarded against server-side request forgery: private, link-local, carrier-grade-NAT and cloud-metadata ranges are refused unless a host is explicitly allowed.',
    yue: '對外嘅供應商代理有防 server-side request forgery：私有、link-local、carrier-grade NAT 同雲端 metadata 嗰啲網段全部拒絕，除非你明明白白允許咗嗰個主機。',
  },
  'ft.network.keys': {
    en: 'Provider keys are the user’s own. They are proxied, not collected, and are never included in any telemetry channel.',
    yue: '供應商嘅 key 係用家自己嘅。佢哋淨係經過代理，唔會被收集，亦永遠唔會出現喺任何遙測通道入面。',
  },
  'ft.network.telemetry': {
    en: 'The ported code contains upstream’s analytics integration verbatim, because the port is verbatim. Upstream’s own source states that without a telemetry destination key in the environment every entry point is a no-op. No such key is configured anywhere in this repository and none is baked in at packaging time, so builds produced from this repository send nothing. That is a statement about configuration, not about surgery — the code paths are still present and unmodified, and they must be, or the port would no longer be a port.',
    yue: '移植入嚟嘅 code 原封不動保留咗上游嘅分析整合，因為個移植本身就係原封不動。上游自己份原始碼寫明，環境入面冇遙測目的地 key 嘅話，每個入口都係乜都唔做。呢個 repository 任何地方都冇設定過呢類 key，打包嗰陣亦冇焗死落去，所以由呢個 repository build 出嚟嘅版本乜都唔會傳。呢句係講設定，唔係講做過手術 — 啲 code 路徑仲喺度、一個字都冇改，而且必須係咁，否則個移植就唔再係移植。',
  },

  'ft.tokens.note': {
    en: [
      'These swatches are painted from the live tokens. Change the seed colour or the theme in Settings and every one of them moves, because nothing on this page hard-codes a colour.',
      'These swatches are painted from the live tokens. Change the seed colour or the theme in Settings and every one of them moves, because nothing on this page hard-codes a colour.',
      'These swatches are painted from the live tokens. Change the seed colour or the theme in Settings and every one of them moves — nothing on this page hard-codes a colour.',
      'These swatches are painted from the live tokens, so they are not a picture of the palette, they are the palette. Change the seed colour or the theme in Settings and every one of them moves.',
      'These swatches are painted from the live tokens, so they are not a picture of the palette — they are the palette, caught in the act. Change the seed colour or the theme in Settings and watch every one of them move, because nothing on this page hard-codes a colour anywhere.',
    ],
    yue: [
      '呢啲色塊係由行緊嗰套 token 畫出嚟。喺「設定」度換個種子色或者換主題，每一格都會跟住郁，因為呢版嘢冇一個地方寫死過顏色。',
      '呢啲色塊係由行緊嗰套 token 畫出嚟。喺「設定」度換個種子色或者換主題，每一格都會跟住郁，因為呢版嘢冇一個地方寫死過顏色。',
      '呢啲色塊係由行緊嗰套 token 畫出嚟。喺「設定」度換個種子色或者換主題，每一格都會跟住郁 — 呢版嘢冇一個地方寫死過顏色。',
      '呢啲色塊係由行緊嗰套 token 畫出嚟，所以佢哋唔係色板嘅相，佢哋就係色板。喺「設定」度換個種子色或者換主題，每一格都會跟住郁。',
      '呢啲色塊係由行緊嗰套 token 畫出嚟，所以佢哋唔係色板嘅相 — 佢哋就係色板，畀你當場捉住。喺「設定」度換個種子色或者換主題，睇住每一格點樣跟住郁，因為呢版嘢由頭到尾冇一個地方寫死過顏色。',
    ],
  },

  'ft.motion.col.token': { en: 'Token', yue: 'Token' },
  'ft.motion.col.curve': { en: 'Curve', yue: '曲線' },
  'ft.motion.col.use': { en: 'Where it is used', yue: '用喺邊' },
  'ft.motion.emphasized': {
    en: 'The default for a change the reader should notice: a tab becoming active, a panel opening.',
    yue: '想讀者留意到嘅變化就用佢：一個分頁變成使用中、一塊面板打開。',
  },
  'ft.motion.decel': {
    en: 'Anything entering the screen, so it arrives quickly and settles gently.',
    yue: '任何入場嘅嘢都用佢，令佢嚟得快、停得順。',
  },
  'ft.motion.spring': {
    en: 'Transforms only — the press of a button, the travel of a switch handle.',
    yue: '淨係用喺變形上面 — 撳一個掣、一個開關掣個柄行過去。',
  },
  'ft.motion.reduced': {
    en: 'All of it collapses to a single millisecond when the reader has asked for reduced motion.',
    yue: '讀者一開咗「減少動態」，上面全部即刻縮做一毫秒。',
  },

  /* ===================================================================== *
   * Building panel.
   *
   * Version pins, tool names and command semantics are plain strings. Somebody
   * reading this is about to type it.
   * ===================================================================== */

  'bd.heading': { en: 'Building from source', yue: '由原始碼 build' },
  'bd.caveat.title': {
    en: ['Some of these run in continuous integration; the rest are transcribed', 'Some of these run in continuous integration; the rest are transcribed', 'Some of these run in continuous integration; the rest are only transcribed', 'Some of these run in continuous integration; the rest were only copied out', 'Some of these run in continuous integration; the rest were only copied out and never typed in anger'],
    yue: ['有啲喺 continuous integration 度真係行緊，其餘係抄返落嚟', '有啲喺 continuous integration 度真係行緊，其餘係抄返落嚟', '有啲喺 continuous integration 度真係行緊，其餘淨係抄返落嚟', '有啲喺 continuous integration 度真係行緊，其餘淨係抄咗過嚟', '有啲喺 continuous integration 度真係行緊，其餘淨係抄咗過嚟，冇人真係打過落去試'],
  },
  'bd.caveat.body': {
    en: 'Installing, typechecking, testing and packaging are what the release run does on a Windows runner, so those are known to work there. The development-orchestrator commands have not been exercised from this repository and are transcribed from the ported project’s own package scripts. Treat the first local run as a real build, and expect to spend time on native compilation.',
    yue: '安裝、型別檢查、測試同打包，就係 release 運行喺 Windows runner 上面做嘅嘢，所以嗰邊係知道行得。至於開發協調器嗰啲指令，呢個 repository 未行過，係由移植入嚟嗰個項目自己啲 package script 抄返落嚟。第一次喺本機行要當佢係真係 build，預咗要花時間喺原生編譯度。',
  },
  'bd.toolchain.heading': { en: 'Toolchain', yue: 'Toolchain' },
  'bd.tc.col.req': { en: 'Requirement', yue: '需求' },
  'bd.tc.col.ver': { en: 'Version', yue: '版本' },
  'bd.tc.col.why': { en: 'Why it is exact', yue: '點解要咁準' },
  'bd.tc.node': {
    en: 'Declared in the engines field by the workspace root and by every package, and pinned by the version file. Upstream’s own answer to "can I use Node 22 instead" is no.',
    yue: 'Workspace 根同每個 package 都喺 engines 欄寫咗，仲有個版本檔案釘死佢。「可唔可以用 Node 22 頂住先」— 上游自己嘅答案係唔得。',
  },
  'bd.tc.pnpm': {
    en: 'The package manager field is pinned to that exact version.',
    yue: 'Package manager 嗰欄釘死咗係嗰個版本。',
  },
  'bd.tc.vs.name': { en: 'Visual Studio Build Tools', yue: 'Visual Studio Build Tools' },
  'bd.tc.vs': {
    en: 'With the Desktop C++ workload. The SQLite binding has no prebuilt binary for this platform on Node 24, so installing compiles it from source through node-gyp.',
    yue: '要連 Desktop C++ workload。個 SQLite binding 喺 Node 24 呢個平台組合冇預先 build 好嘅二進位檔，所以安裝嗰陣會經 node-gyp 由原始碼砌出嚟。',
  },
  'bd.tc.python': {
    en: 'Required by node-gyp for that same native build, and it must be on the path.',
    yue: 'node-gyp 做嗰個原生 build 嗰陣要用，而且一定要喺 path 度搵到。',
  },
  'bd.install.heading': { en: 'Install the package manager', yue: '裝個 package manager' },
  'bd.install.corepack': {
    en: 'On Windows, enabling corepack fails with a permission error because it cannot write shims into the system program directory. Install pnpm with npm instead.',
    yue: '喺 Windows 度開 corepack 會因為權限錯誤而 fail，因為佢寫唔到 shim 入系統程式目錄。改用 npm 裝 pnpm。',
  },
  'bd.workspace.heading': { en: 'Install and build the workspace', yue: '安裝同 build 個 workspace' },
  'bd.workspace.note': {
    en: 'There is no package file at the repository root — the workspace root is the imported tree, so every command runs from inside it. Installing triggers the root postinstall, which builds 18 workspace targets in dependency order and unpacks a bundled export helper.',
    yue: 'Repository 根度冇 package 檔案 — workspace 根係移植入嚟嗰棵樹，所以每個指令都要入到去入面行。安裝會觸發根嗰個 postinstall，佢會按相依次序 build 晒 18 個 workspace 目標，仲會解開一個內附嘅匯出輔助工具。',
  },
  'bd.dev.heading': { en: 'Run it in development', yue: '喺開發模式行佢' },
  'bd.dev.note': {
    en: 'There is deliberately no root dev or start script. The development orchestrator is its own tool, and the daemon defaults to loopback on port 7456.',
    yue: '根度特登冇 dev 或者 start script。個開發協調器係一件獨立工具，而 daemon 預設綁 loopback 嘅 7456 port。',
  },
  'bd.pack.heading': { en: 'Build the Windows installer', yue: 'Build 個 Windows 安裝檔' },
  'bd.pack.note': {
    en: 'The target accepts all, dir, nsis or zip; zip produces a portable archive from the unpacked build. Packaging runs on electron-builder with Electron 41.',
    yue: '個目標接受 all、dir、nsis 或者 zip；zip 會用未打包嘅 build 整個免安裝壓縮包。打包係行 electron-builder，配 Electron 41。',
  },
  'bd.test.heading': { en: 'Typecheck and tests', yue: '型別檢查同測試' },
  'bd.test.note': {
    en: 'Tests are package-scoped by design — there is no root aggregate test script. Build the three prerequisites first, exactly as upstream’s own continuous integration does, then run a package’s suite.',
    yue: '啲測試係特登按 package 分開嘅 — 根度冇一個總測試 script。跟返上游自己 continuous integration 嘅做法，先 build 好嗰三個前置，再行某個 package 嘅測試。',
  },
  'bd.platform.title': {
    en: ['Windows native is upstream’s best-effort tier', 'Windows native is upstream’s best-effort tier', 'Windows native is upstream’s best-effort tier', 'Windows native is the tier upstream promises the least about', 'Windows native is the tier upstream promises the least about, and this project lives on it'],
    yue: ['Windows 原生係上游嗰個「盡量」等級', 'Windows 原生係上游嗰個「盡量」等級', 'Windows 原生係上游嗰個「盡力而為」等級', 'Windows 原生係上游承諾得最少嗰個等級', 'Windows 原生係上游承諾得最少嗰個等級，而呢個項目就住喺嗰度'],
  },
  'bd.platform.body': {
    en: 'Upstream states that macOS, Linux and WSL2 are its primary supported paths. This project targets Windows, which makes those rough edges this project’s problem to fix rather than a caveat to pass along. The release run builds and packages on Windows, so the ones that break a build have been dealt with; the ones that only show up in daily use have not been looked for.',
    yue: '上游講明 macOS、Linux 同 WSL2 先係佢主要支援嘅路徑。呢個項目係做 Windows 嘅，所以嗰啲崎嶇位係呢個項目要執嘅嘢，唔係一句「小心啲」推畀你。Release 運行喺 Windows 上面 build 同打包，所以會搞崩個 build 嗰啲已經搞掂咗；至於淨係日常用先出現嗰啲，就未有人去搵過。',
  },

  /* ===================================================================== *
   * Verifying panel.
   *
   * The counter glossary and the exit codes are plain strings without
   * exception. They are a reference table: somebody is reading them beside a
   * terminal, comparing them to output, and a reworded gloss is a gloss they
   * have to re-read to confirm it still means the same thing.
   * ===================================================================== */

  'vf.heading': { en: 'Verifying the port', yue: '驗證個移植' },
  'vf.intro': {
    en: [
      'The claim "the imported tree is upstream, unmodified" is worth nothing unless a reader can check it in one command. That is what the committed verifier is for. It is pure git and POSIX shell — no Node, no dependencies, nothing to install — which makes it the only claim in this repository that anybody can reproduce with no toolchain at all.',
      'The claim "the imported tree is upstream, unmodified" is worth nothing unless a reader can check it in one command. That is what the committed verifier is for. It is pure git and POSIX shell — no Node, no dependencies, nothing to install — which makes it the only claim in this repository that anybody can reproduce with no toolchain at all.',
      'The claim "the imported tree is upstream, unmodified" is worth nothing unless a reader can check it in one command, so there is a committed script that does exactly that. It is pure git and POSIX shell — no Node, no dependencies, nothing to install — which makes it the only claim here that anybody can reproduce with no toolchain at all.',
      'The claim "the imported tree is upstream, unmodified" is worth precisely nothing unless a reader can check it in one command, so there is a committed script that does exactly that. It is pure git and POSIX shell — no Node, no dependencies, nothing to install — which makes it the only claim on this site that anybody can reproduce with no toolchain whatsoever.',
      'The claim "the imported tree is upstream, unmodified" is worth precisely nothing unless a reader can check it in one command, so there is a committed script that does exactly that and nothing else. It is pure git and POSIX shell — no Node, no dependencies, nothing to install — which makes it the only claim on this site you can reproduce with no toolchain whatsoever, and the only one that does not need you to like us.',
    ],
    yue: [
      '「移植入嚟嗰棵樹係上游、原封不動」呢句嘢，如果讀者唔可以一句指令驗返，就一文不值。嗰個 commit 咗嘅驗證 script 就係做呢件事。佢淨係用 git 同 POSIX shell — 唔使 Node、唔使相依、乜都唔使裝 — 所以佢係呢個 repository 入面唯一一個完全唔使 toolchain 都重現到嘅講法。',
      '「移植入嚟嗰棵樹係上游、原封不動」呢句嘢，如果讀者唔可以一句指令驗返，就一文不值。嗰個 commit 咗嘅驗證 script 就係做呢件事。佢淨係用 git 同 POSIX shell — 唔使 Node、唔使相依、乜都唔使裝 — 所以佢係呢個 repository 入面唯一一個完全唔使 toolchain 都重現到嘅講法。',
      '「移植入嚟嗰棵樹係上游、原封不動」呢句嘢，如果讀者唔可以一句指令驗返，就一文不值，所以有個 commit 咗嘅 script 專門做呢件事。佢淨係用 git 同 POSIX shell — 唔使 Node、唔使相依、乜都唔使裝 — 所以佢係呢度唯一一個完全唔使 toolchain 都重現到嘅講法。',
      '「移植入嚟嗰棵樹係上游、原封不動」呢句嘢，如果讀者唔可以一句指令驗返，就真係一蚊都唔值，所以有個 commit 咗嘅 script 專門做呢件事。佢淨係用 git 同 POSIX shell — 唔使 Node、唔使相依、乜都唔使裝 — 所以佢係成個網站唯一一個完全唔使 toolchain 都重現到嘅講法。',
      '「移植入嚟嗰棵樹係上游、原封不動」呢句嘢，如果讀者唔可以一句指令驗返，就真係一蚊都唔值，所以有個 commit 咗嘅 script 淨係做呢件事、乜都唔做多。佢淨係用 git 同 POSIX shell — 唔使 Node、唔使相依、乜都唔使裝 — 所以佢係成個網站唯一一個完全唔使 toolchain 都重現到嘅講法，亦係唯一一個唔使你鍾意我哋都成立嘅講法。',
    ],
  },
  'vf.submodule': {
    en: 'The submodule is not required. When it is absent the verifier falls back to a committed manifest of upstream paths, modes and blob ids, and says which source it used. When the submodule is present, the manifest must agree with it, and a disagreement is a hard error rather than a quiet preference for one of them.',
    yue: '個 submodule 唔係必要。冇佢嘅時候，驗證 script 會退返去用一份 commit 咗嘅清單，入面有上游嘅路徑、模式同 blob id，而且會講明佢用咗邊個來源。如果 submodule 喺度，份清單就一定要同佢夾得返，唔夾就係硬錯，唔會靜靜雞偏心其中一邊。',
  },
  'vf.checks.heading': { en: 'Two independent checks', yue: '兩個獨立檢查' },
  'vf.checks.why': {
    en: 'They are separate because they fail for different reasons, and one cannot see what the other catches.',
    yue: '佢哋要分開，因為佢哋 fail 嘅理由唔同，而且一個睇唔到另一個捉到嘅嘢。',
  },
  'vf.checkA.title': { en: 'Check A — the working tree', yue: '檢查 A — 工作目錄' },
  'vf.checkA.body': {
    en: 'Every file on disk is hashed with filters disabled and compared to the upstream blob id. This catches a stray edit, a truncated copy or a missing file.',
    yue: '硬碟上每個檔案都關晒 filter 計 hash，再同上游嘅 blob id 對。咁就捉到亂改咗嘅嘢、抄剩一半嘅檔案，或者唔見咗嘅檔案。',
  },
  'vf.checkB.title': { en: 'Check B — the committed index', yue: '檢查 B — commit 咗嘅索引' },
  'vf.checkB.body': {
    en: 'Every tracked path must carry the upstream file mode as well as the upstream blob id. This catches line-ending normalisation and lost executable bits, which Check A cannot see.',
    yue: '每個追蹤緊嘅路徑，除咗 blob id 之外，連檔案模式都要同上游一樣。咁就捉到換行符被正規化同埋唔見咗 executable bit — 呢兩樣檢查 A 係睇唔到嘅。',
  },
  'vf.counters.heading': { en: 'What each counter means', yue: '每個計數器解乜' },
  'vf.counters.col.name': { en: 'Counter', yue: '計數器' },
  'vf.counters.col.meaning': { en: 'Meaning', yue: '意思' },
  'vf.c.expected': { en: 'Files in the pinned upstream tree.', yue: '釘死咗嗰棵上游樹入面嘅檔案。' },
  'vf.c.tracked': { en: 'Paths tracked under the imported directory in this repository.', yue: '呢個 repository 入面，移植目錄之下追蹤緊嘅路徑。' },
  'vf.c.present': { en: 'Expected files actually found on disk.', yue: '預期會有、而硬碟上真係搵到嘅檔案。' },
  'vf.c.declared': {
    en: 'Paths listed in the licence notice — the size of the allowlist. It moves as more of the rebrand lands, so read it from the script rather than from any page.',
    yue: '喺授權通知度列咗嘅路徑 — 即係個 allowlist 有幾大。改名工程做多啲佢就會變，所以要睇 script 報嘅數，唔好信任何一版嘢。',
  },
  'vf.c.missing': { en: 'Expected upstream files not present on disk.', yue: '預期上游會有、但硬碟上冇嘅檔案。' },
  'vf.c.bytes': { en: 'On-disk bytes do not hash to the upstream blob id.', yue: '硬碟上啲 byte 計出嚟唔等於上游個 blob id。' },
  'vf.c.mode': { en: 'A file mode recorded here differs from upstream’s.', yue: '呢邊記低嘅檔案模式同上游唔同。' },
  'vf.c.oid': { en: 'A committed blob id differs from upstream’s.', yue: 'Commit 咗嘅 blob id 同上游唔同。' },
  'vf.c.extra': { en: 'Paths tracked here that upstream does not have.', yue: '呢邊追蹤緊、但上游根本冇嘅路徑。' },
  'vf.c.untracked': { en: 'Non-ignored files loose in the imported tree — what an interrupted copy leaves behind.', yue: '喺移植樹入面散修修、又唔喺忽略清單嘅檔案 — 抄到一半停咗會留低嘅嘢。' },
  'vf.c.stale': { en: 'A path declared in the licence notice that no longer differs from upstream.', yue: '喺授權通知度申報咗、但其實已經同上游冇分別嘅路徑。' },
  'vf.c.gaps': { en: 'Total undeclared differences. This is the number that must stay at zero.', yue: '冇申報嘅差異總數。呢個數要一直維持喺零。' },
  'vf.exit.heading': { en: 'Exit codes', yue: 'Exit code' },
  'vf.exit.0': { en: '0 — both checks report zero gaps.', yue: '0 — 兩個檢查都報零 gap。' },
  'vf.exit.1': { en: '1 — gaps remain. The first fifty are printed to standard error.', yue: '1 — 仲有 gap。頭五十個會印去 standard error。' },
  'vf.exit.2': {
    en: '2 — the check could not meaningfully run at all: neither the submodule nor the manifest is available, the manifest disagrees with a submodule that is present, or Check B found no tracked paths. This is deliberately distinct from 1, because "the check failed" and "the check did not happen" are different facts.',
    yue: '2 — 個檢查根本冇辦法有意義咁行：submodule 同清單兩樣都冇、清單同一個確實存在嘅 submodule 唔夾，或者檢查 B 一個追蹤路徑都搵唔到。呢個數字特登同 1 分開，因為「檢查唔過」同「根本冇檢查過」係兩件唔同嘅事。',
  },
  'vf.allowlist.heading': {
    en: ['The licence notice is an enforced allowlist, not a courtesy', 'The licence notice is an enforced allowlist, not a courtesy', 'The licence notice is an enforced allowlist, not a courtesy', 'The licence notice is an enforced allowlist, not a polite gesture', 'The licence notice is an enforced allowlist, not a polite gesture nobody reads'],
    yue: ['張授權通知係會被執行嘅 allowlist，唔係客套嘢', '張授權通知係會被執行嘅 allowlist，唔係客套嘢', '張授權通知係會被執行嘅 allowlist，唔係客套嘢', '張授權通知係會被執行嘅 allowlist，唔係做禮貌', '張授權通知係會被執行嘅 allowlist，唔係一份冇人睇嘅禮貌文件'],
  },
  'vf.allowlist.body': {
    en: 'The verifier reads the modifications notice as its allowlist. Paths are declared as list items, and HTML-comment blocks are skipped so the file can document its own entry format without that template being mistaken for a declaration. Two consequences follow, and both are the point.',
    yue: '個驗證 script 會將改動通知當成佢個 allowlist 嚟讀。路徑寫成列表項目，而 HTML 註解區塊會跳過，咁份檔案就可以自己講解點樣寫一條記錄，而唔會令個範本被當成真嘅申報。跟住有兩個後果，兩個都正正係重點。',
  },
  'vf.allowlist.undeclared': { en: 'A file that differs from upstream without an entry fails verification.', yue: '一個同上游唔同、但冇記錄嘅檔案，驗證會 fail。' },
  'vf.allowlist.stale': { en: 'An entry for a file that no longer differs fails verification too, as a stale notice.', yue: '一個檔案已經同上游冇分別、但仲有記錄，一樣會 fail，當作過期通知。' },
  'vf.allowlist.consequence': {
    en: 'So the Apache-2.0 section 4(b) notice and the code cannot drift apart: the licence notice is the same list the machine checks.',
    yue: '所以 Apache-2.0 第 4(b) 條嗰張通知同 code 分唔到家：張授權通知就係機器檢查緊嗰份清單。',
  },
  'vf.crlf.title': {
    en: ['Check out with LF line endings', 'Check out with LF line endings', 'Check out with LF line endings', 'Check out with LF line endings, or waste an afternoon', 'Check out with LF line endings, or lose an afternoon to a problem you do not have'],
    yue: ['Checkout 嗰陣用 LF 換行', 'Checkout 嗰陣用 LF 換行', 'Checkout 嗰陣用 LF 換行', 'Checkout 嗰陣用 LF 換行，唔係就嘥咗個下晝', 'Checkout 嗰陣用 LF 換行，唔係就會為咗一個根本唔存在嘅問題嘥咗個下晝'],
  },
  'vf.crlf.body': {
    en: 'A CRLF checkout rewrites bytes in the imported tree, and Check A will correctly report thousands of byte differences for a tree that is otherwise fine. Turn automatic line-ending conversion off before the checkout, or run the verifier on Linux. On Windows, run it from a POSIX shell — the one bundled with git works.',
    yue: 'CRLF checkout 會改寫移植樹入面啲 byte，而檢查 A 就會好正確咁報幾千個 byte 差異 — 但棵樹其實冇事。Checkout 之前熄咗自動換行轉換，或者去 Linux 度行個驗證 script。喺 Windows 就用 POSIX shell 行，git 自己帶嗰個就得。',
  },
  'vf.counts.title': {
    en: ['No transcript is pasted on this page', 'No transcript is pasted on this page', 'No transcript is pasted on this page', 'No transcript is pasted here, on purpose', 'No transcript is pasted here, and that is on purpose'],
    yue: ['呢版嘢冇貼任何執行記錄', '呢版嘢冇貼任何執行記錄', '呢版嘢冇貼任何執行記錄', '呢度特登唔貼執行記錄', '呢度特登唔貼執行記錄，係諗過先咁做'],
  },
  'vf.counts.body': {
    en: 'Every counter except gaps moves as rebranding work lands, so a frozen copy is wrong shortly after it is written. Run the script; prefer its answer to any paragraph, this one included.',
    yue: '除咗 gaps 之外，每個計數器都會隨住改名工程落地而變，所以貼一份定咗格嘅記錄，寫完冇幾耐就會錯。自己行個 script，佢嘅答案大過任何一段字，包括呢一段。',
  },

  /* ===================================================================== *
   * Standards panel.
   *
   * The requirement labels and the per-surface notes are plain strings: this
   * is a conformance table, and a conformance table is read by comparing rows.
   * The framing prose above it takes the funny levels.
   * ===================================================================== */

  'st.heading': { en: 'The standards this project holds itself to', yue: '呢個項目自己要守嘅標準' },
  'st.intro': {
    en: [
      'These are the project’s own requirements for every user-facing surface it ships — the application, and equally this site, its settings, and every panel and dialog inside either. "It is small", "it is only docs" and "nobody customizes that one" are not exemptions. Almost none of them is satisfied in the application today; that gap is the work.',
      'These are the project’s own requirements for every user-facing surface it ships — the application, and equally this site, its settings, and every panel and dialog inside either. "It is small", "it is only docs" and "nobody customizes that one" are not exemptions. Almost none of them is satisfied in the application today; that gap is the work.',
      'These are the project’s own requirements for every user-facing surface it ships — the application, and equally this site, its settings, and every panel and dialog inside either. "It is small", "it is only docs" and "nobody customizes that one" are not exemptions, they are the three sentences that let a rule quietly stop applying. Almost none of them is satisfied in the application today; that gap is the work.',
      'These are the project’s own requirements for every user-facing surface it ships — the application, and equally this site, its settings, and every panel and dialog inside either. "It is small", "it is only docs" and "nobody customizes that one" are not exemptions; they are the three sentences that let a rule quietly stop applying to whichever corner said them. Almost none of them is satisfied in the application today, and that gap is the work.',
      'These are the project’s own requirements for every user-facing surface it ships — the application, and just as much this site, its settings, and every panel and dialog inside either. "It is small", "it is only docs" and "nobody customizes that one" are not exemptions; they are the three sentences by which a rule quietly stops applying to whichever corner was clever enough to say them. Almost none of them is satisfied in the application today, and that gap is not an embarrassment to hide — it is the work.',
    ],
    yue: [
      '呢啲係呢個項目對自己每一個面向用家嘅介面嘅要求 — 個 app 係咁，呢個網站、佢啲設定，同兩邊入面每一塊面板同對話框都一樣。「佢好細啫」、「呢個淨係文件」、「冇人會改嗰個」全部唔算豁免。今日個 app 幾乎一樣都未做到；嗰個差距就係啲工。',
      '呢啲係呢個項目對自己每一個面向用家嘅介面嘅要求 — 個 app 係咁，呢個網站、佢啲設定，同兩邊入面每一塊面板同對話框都一樣。「佢好細啫」、「呢個淨係文件」、「冇人會改嗰個」全部唔算豁免。今日個 app 幾乎一樣都未做到；嗰個差距就係啲工。',
      '呢啲係呢個項目對自己每一個面向用家嘅介面嘅要求 — 個 app 係咁，呢個網站、佢啲設定，同兩邊入面每一塊面板同對話框都一樣。「佢好細啫」、「呢個淨係文件」、「冇人會改嗰個」唔算豁免，佢哋係令一條規矩靜靜雞唔再適用嗰三句嘢。今日個 app 幾乎一樣都未做到；嗰個差距就係啲工。',
      '呢啲係呢個項目對自己每一個面向用家嘅介面嘅要求 — 個 app 係咁，呢個網站、佢啲設定，同兩邊入面每一塊面板同對話框都一樣。「佢好細啫」、「呢個淨係文件」、「冇人會改嗰個」唔算豁免；佢哋係令一條規矩靜靜雞唔再管到某個角落嗰三句嘢。今日個 app 幾乎一樣都未做到，而嗰個差距就係啲工。',
      '呢啲係呢個項目對自己每一個面向用家嘅介面嘅要求 — 個 app 係咁，呢個網站、佢啲設定，同兩邊入面每一塊面板同對話框都一樣咁計。「佢好細啫」、「呢個淨係文件」、「冇人會改嗰個」唔算豁免；佢哋係邊個角落夠醒目講得出，一條規矩就靜靜雞唔再管嗰個角落嘅三句嘢。今日個 app 幾乎一樣都未做到，而嗰個差距唔係要收埋嘅醜事 — 佢就係啲工。',
    ],
  },
  'st.twocolumns': {
    en: [
      'The two status columns are deliberately separate. This page is one surface and the application is another, and a standard met here says nothing whatsoever about the application.',
      'The two status columns are deliberately separate. This page is one surface and the application is another, and a standard met here says nothing whatsoever about the application.',
      'The two status columns are deliberately separate. This page is one surface and the application is another — a standard met here says nothing whatsoever about the application.',
      'The two status columns are deliberately separate. This page is one surface and the application is another, and a standard met here says nothing whatsoever about the application. Collapsing them into one column would be the single easiest way to overstate how far along this is.',
      'The two status columns are deliberately separate, and collapsing them into one would be the single easiest way to overstate how far along any of this is. This page is one surface and the application is another; a standard met here says nothing whatsoever about the application, however much it might look like progress.',
    ],
    yue: [
      '兩條狀態欄係特登分開嘅。呢版係一個介面，個 app 係另一個介面；喺呢度做到嘅標準，對個 app 嚟講一啲都唔代表到咩。',
      '兩條狀態欄係特登分開嘅。呢版係一個介面，個 app 係另一個介面；喺呢度做到嘅標準，對個 app 嚟講一啲都唔代表到咩。',
      '兩條狀態欄係特登分開嘅。呢版係一個介面，個 app 係另一個介面 — 喺呢度做到嘅標準，對個 app 嚟講一啲都唔代表到咩。',
      '兩條狀態欄係特登分開嘅。呢版係一個介面，個 app 係另一個介面；喺呢度做到嘅標準，對個 app 嚟講一啲都唔代表到咩。將兩欄併埋一齊，就係誇大進度最容易嗰種做法。',
      '兩條狀態欄係特登分開嘅，而將佢哋併埋一齊，就係誇大呢件事做到幾遠最容易嗰種做法。呢版係一個介面，個 app 係另一個介面；喺呢度做到嘅標準，對個 app 嚟講一啲都唔代表到咩，就算佢幾似進度都好。',
    ],
  },
  'st.caption': { en: 'Each standard, its status in the application, and its status on this site', yue: '每個標準、佢喺個 app 嘅狀態，同佢喺呢個網站嘅狀態' },
  'st.col.standard': { en: 'Standard', yue: '標準' },
  'st.col.app': { en: 'In the application', yue: '喺個 app' },
  'st.col.site': { en: 'On this site', yue: '喺呢個網站' },

  'st.r1': { en: 'Language modes and two funny-level sliders', yue: '語言模式同兩條搞笑程度拉桿' },
  'st.r1.app': { en: '— nineteen locales ship upstream; Cantonese is not one of them, and no tone slider exists.', yue: '— 上游出咗十九個語系，粵語唔喺入面，亦冇語氣拉桿。' },
  'st.r1.site': { en: '— three modes and two independent sliders, in Settings.', yue: '— 三個模式同兩條獨立拉桿，喺「設定」度。' },
  'st.r2': { en: 'Material Design 3 conformance', yue: 'Material Design 3 達標' },
  'st.r2.app': { en: '— the token sheet and the custom window chrome are in the released build; the component inventory has not been rebuilt on them.', yue: '— Token 表同自訂視窗外框已經喺出咗嘅 build 入面；啲元件就未用返佢哋重新起過。' },
  'st.r2.site': { en: '— the token sheet is transcribed from that same mockup.', yue: '— 呢度嗰份 token 表就係由同一個 mockup 抄落嚟。' },
  'st.r3': { en: 'Runtime appearance customization', yue: '執行時外觀自訂' },
  'st.r3.site': { en: '— theme, density, seed colour, scale and the colour translator. Per-element editors, font control and named presets are not here.', yue: '— 主題、密度、種子色、比例同顏色轉換器。逐個元件嘅編輯器、字體控制同具名預設就未有。' },
  'st.r4': { en: 'A regex builder beside every search field', yue: '每個搜尋格旁邊都有 regex 產生器' },
  'st.r4.app': { en: '— the mockup draws one shared panel, which does not meet the anchored-per-field requirement.', yue: '— 個 mockup 畫咗一塊大家共用嘅面板，唔符合「每格各自貼住一個」嘅要求。' },
  'st.r4.site': { en: '— every search field on the site has its own, anchored beside it, with its own pattern and flags.', yue: '— 網站上每個搜尋格都有自己嗰個，貼實喺旁邊，有自己嘅 pattern 同 flag。' },
  'st.r5': { en: 'Browser-style tabs everywhere', yue: '周圍都用瀏覽器式分頁' },
  'st.r5.site': { en: '— strip, overflow, reordering, pinning, a searchable list and persistence. Grouping and bulk close are deliberately absent: the site has ten permanent sections with nothing to group and nothing safe to close.', yue: '— 分頁條、溢出、重新排序、釘住、可搜尋清單同狀態保存。分組同批次關閉係特登冇：呢個網站有十個永久區段，冇嘢好分組，亦冇一個關咗係安全嘅。' },
  'st.r6': { en: 'Non-blocking notifications and a centre', yue: '唔阻你做嘢嘅通知同一個通知中心' },
  'st.r7': { en: 'Super confirmation for destructive actions', yue: '破壞性動作嘅超級確認' },
  'st.r7.site': { en: '— this site owns no user data, so it has no destructive action to gate.', yue: '— 呢個網站冇擁有任何用家資料，所以根本冇破壞性動作要守。' },
  'st.r8': { en: 'A command palette', yue: 'Command palette' },
  'st.r8.site': { en: '— every command, setting and destination, with the live control rendered in the row.', yue: '— 每個指令、設定同目的地都有，而且個真實控制項就 render 咗喺嗰行入面。' },
  'st.r9': { en: 'An in-app changelog viewer', yue: 'App 入面嘅更新紀錄檢視器' },
  'st.r9.site': { en: '— the releases published so far are listed with their code names, but a filterable, searchable viewer is not built here.', yue: '— 出咗嘅 release 連代號都列咗出嚟，不過一個可以篩選、可以搜尋嘅檢視器就未喺呢度起。' },
  'st.r10': { en: 'Local version history for documents, records and settings', yue: '文件、紀錄同設定嘅本機版本歷史' },
  'st.r10.site': { en: '— the site stores preferences in the browser and owns no documents.', yue: '— 呢個網站只係將偏好存喺瀏覽器度，冇擁有任何文件。' },
  'st.r11': { en: 'Export everything, bulk-act on everything', yue: '乜都匯出得，乜都批次做得' },
  'st.r11.app': { en: '— several export formats already exist; the full matrix, the archive options and universal bulk actions do not.', yue: '— 幾個匯出格式本身已經有；完整格式矩陣、壓縮選項同全面嘅批次動作就未有。' },
  'st.r12': { en: 'The startup dim sum surprise', yue: '開機點心驚喜' },
  'st.r12.app': { en: '— the mockup draws it with an off switch, which the standard forbids.', yue: '— 個 mockup 畫咗個關閉掣畀佢，而個標準係唔准有嘅。' },
  'st.r12.site': { en: '— a one-in-ten draw on load from the bundled catalogue, non-blocking, no opt-out.', yue: '— 每次載入喺內附目錄度十抽一，唔阻你做嘢，亦冇得閂。' },
  'st.r13': { en: 'A release code name and a line count', yue: '一個發佈代號同一個行數統計' },
  'st.r13.app': { en: '— every release so far carries a dish name and a line-count table produced at the released commit.', yue: '— 到目前為止每個 release 都有個點心名，同埋一份喺發佈 commit 上面整出嚟嘅行數表。' },
  'st.r13.site': { en: '— the Releases section names each published build’s dish and links its notes.', yue: '— 「發佈版本」嗰版寫咗每個出咗嘅 build 用邊味點心，仲連埋佢嘅說明。' },
  'st.r14': { en: 'Accessibility and sizing as completion blockers', yue: '將無障礙同尺寸當成完成條件' },
  'st.r14.site': { en: '— keyboard reachable throughout, visible focus, roles and names, reduced motion respected, and readable from a narrow window up to a doubled scale.', yue: '— 由頭到尾鍵盤去到、focus 睇得見、role 同名齊、尊重「減少動態」，而且由窄視窗一路到雙倍縮放都讀得到。' },
  'st.r15': { en: 'Every asset bundled locally', yue: '所有資源都本機內附' },
  'st.r15.app': { en: '— the mockup loads its fonts from a third-party network origin.', yue: '— 個 mockup 去第三方網絡來源攞字體。' },
  'st.r15.site': { en: '— this page makes no network request at all, which is checked at publish time rather than trusted.', yue: '— 呢版嘢一個網絡請求都唔會發，而且係出版嗰陣驗返，唔係靠信。' },
  'st.r16': { en: 'Documentation, changelog and roadmap current in the same task', yue: '文件、更新紀錄同路線圖喺同一個任務入面更新好' },
  'st.r16.body': { en: '— applies to both surfaces from now on.', yue: '— 由而家開始，兩個介面都要跟。' },

  'st.reading.heading': { en: 'How to read a status', yue: '點樣睇一個狀態' },
  'st.def.notstarted': { en: 'No code, and possibly no design.', yue: '冇 code，可能連設計都冇。' },
  'st.def.undesigned': { en: 'Not even specified by the mockup. These carry the most risk, because the shape of the work is unknown.', yue: '連個 mockup 都未講過。呢啲風險最大，因為連要做啲乜個樣都未知。' },
  'st.def.designed': { en: 'The mockup specifies it completely enough to implement. Nothing runs.', yue: '個 mockup 講得夠清楚，做得出。但一樣嘢都未行得。' },
  'st.def.partial': { en: 'Some of it exists. The gap is named beside it rather than left for the reader to discover.', yue: '有一部分喺度。差咗嘅嘢會寫喺旁邊，唔會等讀者自己發現。' },
  'st.def.here': { en: 'Built on this site and exercisable in this browser right now. It says nothing about the application.', yue: '喺呢個網站起咗，而家就可以喺呢個瀏覽器試。佢對個 app 一啲都唔代表到咩。' },
  'st.met.title': {
    en: ['Nothing is at "met" yet', 'Nothing is at "met" yet', 'Nothing is at "met" yet', 'Nothing has reached "met" yet', 'Nothing has reached "met" yet, and nothing gets there early'],
    yue: ['暫時冇一樣去到「達標」', '暫時冇一樣去到「達標」', '暫時冇一樣去到「達標」', '暫時冇一樣去到「達標」', '暫時冇一樣去到「達標」，亦冇一樣可以偷步'],
  },
  'st.met.body': {
    en: 'A standard is promoted only when the verification described in its own documentation has actually been run and its result recorded. Code existing is not promotion.',
    yue: '一個標準要升級，就一定要佢自己份文件寫嗰個驗證真係行過、而且結果記低咗。有 code 唔等於升級。',
  },

  /* ===================================================================== *
   * Provenance panel.
   *
   * Licence sections, trademark law and the identity argument. Every one of
   * these is a plain string: they are legal and factual statements, and the
   * one place humour has nothing whatsoever to contribute.
   * ===================================================================== */

  'pv.upstream.heading': { en: 'Upstream', yue: '上游' },
  'pv.upstream.link': { en: 'The upstream project on GitHub', yue: '上游項目喺 GitHub 度' },
  'pv.licence.heading': { en: 'Licence', yue: '授權' },
  'pv.licence.body': {
    en: 'Apache License 2.0. The full text ships with the imported tree and applies to everything in it. Work added by this repository is offered under the same licence.',
    yue: 'Apache License 2.0。完整條文跟住移植入嚟嗰棵樹一齊出，適用於入面所有嘢。呢個 repository 加嘅嘢，一樣用呢個授權。',
  },
  'pv.notice.body': {
    en: 'The modifications notice is the prominent notice Apache-2.0 section 4(b) requires for changed files, kept in one place so a reader sees the whole delta without diffing two repositories — and it is the machine-checked allowlist described under Verifying the port.',
    yue: '嗰張改動通知，就係 Apache-2.0 第 4(b) 條要求對改過嘅檔案要有嘅顯著通知，集中喺一個位，令讀者唔使 diff 兩個 repository 都睇到成個差異 — 而佢同時就係「驗證個移植」嗰度講嗰份機器檢查嘅 allowlist。',
  },
  'pv.trademark.heading': { en: 'Trademarks', yue: '商標' },
  'pv.trademark.body': {
    en: 'Apache-2.0 grants no trademark rights (section 6). The "Open Design" name, its logo and the upstream application identity belong to the upstream project. Builds published from this repository are branded Material Designer with their own application identity, and are not produced by, endorsed by, or affiliated with the upstream project.',
    yue: 'Apache-2.0 冇授出任何商標權（第 6 條）。「Open Design」呢個名、佢個 logo 同上游嘅 application identity 全部屬於上游項目。由呢個 repository 出嘅版本掛 Material Designer 呢個名，有自己嘅 application identity，唔係上游項目製作、認可或者有關聯。',
  },
  'pv.scope.heading': { en: 'Scope of the rebrand', yue: '改名工程嘅範圍' },
  'pv.scope.body': {
    en: 'Deliberately minimal and confined to the user-visible identity: product name, window title, installer and application id. Internal package names, the command-line name, its environment variables and its storage keys are left exactly as upstream wrote them, so the port stays diffable against its source and future upstream changes stay mergeable.',
    yue: '特登做到最細，淨係郁用家見到嗰個身分：產品名、視窗標題、安裝檔同 application id。內部 package 名、命令列名、佢啲環境變數同 storage key 全部維持返上游原本咁樣，令個移植版可以照樣同來源 diff，而將來上游有改動都仲 merge 得返。',
  },
  'pv.identity.body': {
    en: 'The identity changes are correctness fixes rather than cosmetics. Installed side by side, an unmodified build of this fork and the upstream product are the same application as far as the operating system is concerned: they would share a data directory, a single-instance lock, a named pipe and an uninstall registry key, and the packaged build would poll upstream’s release feed and replace itself with the other product. An application must never update itself into something else.',
    yue: '嗰啲身分改動係修正錯誤，唔係化妝。如果唔改，將呢個分支同上游產品裝埋一齊，喺作業系統眼中佢哋係同一隻 app：會共用同一個資料目錄、同一個單一實例鎖、同一條 named pipe 同同一個解除安裝登錄機碼，而打包好嗰個仲會去問上游條 release feed，然後將自己換成人哋隻產品。一隻 app 永遠唔應該更新更新下變咗第二樣嘢。',
  },
  'pv.submodule.heading': { en: 'The pinned submodule', yue: '釘死咗嘅 submodule' },
  'pv.submodule.body': {
    en: 'The upstream repository stays checked in as a pinned submodule. It is not built and nothing imports from it; it exists so the provenance claim has a source of truth on disk and so the verifier has something to compare against.',
    yue: '上游個 repository 以釘死版本嘅 submodule 形式留喺度。佢唔會被 build，亦冇嘢會 import 佢；佢存在，係為咗令出處呢個講法喺硬碟上有個真理來源，同埋畀個驗證 script 有嘢可以對。',
  },
  'pv.additions.heading': { en: 'What this repository adds', yue: '呢個 repository 加咗啲乜' },
  'pv.privacy.heading': { en: 'This site’s privacy position', yue: '呢個網站嘅私隱立場' },
  'pv.storage.body': {
    en: 'Your language mode, funny levels, theme, density, seed colour, UI scale, tab order and pinned tabs are stored in this browser’s local storage and nowhere else. Clearing this site’s data resets every one of them.',
    yue: '你嘅語言模式、搞笑程度、主題、密度、種子色、介面比例、分頁次序同釘住咗嘅分頁，全部存喺呢個瀏覽器嘅 local storage，冇存去第度。清除呢個網站嘅資料，就全部回復預設。',
  },

  /* ===================================================================== *
   * Settings panel.
   * ===================================================================== */

  'se.jump.heading': { en: 'Jump to', yue: '跳去' },
  'se.appearance.help': {
    en: [
      'Changes apply to the live page as you make them, and survive a reload. The seed colour accepts any colour at all, not just the four presets.',
      'Changes apply to the live page as you make them, and survive a reload. The seed colour accepts any colour at all, not just the four presets.',
      'Changes apply to the live page as you make them, and survive a reload. The seed colour accepts any colour at all — the four presets are a shortcut, not the menu.',
      'Changes apply to the live page as you make them, and survive a reload. The seed colour accepts any colour at all; the four presets are a shortcut, not the whole menu.',
      'Changes apply to the live page as you make them, and survive a reload. The seed colour accepts any colour at all — the four presets are a shortcut, not the menu, and picking something unwise is entirely within your rights.',
    ],
    yue: [
      '你一改，成版嘢即刻跟住變，重新載入之後都仲喺度。種子色乜嘢顏色都收，唔係淨係嗰四個預設。',
      '你一改，成版嘢即刻跟住變，重新載入之後都仲喺度。種子色乜嘢顏色都收，唔係淨係嗰四個預設。',
      '你一改，成版嘢即刻跟住變，重新載入之後都仲喺度。種子色乜嘢顏色都收 — 嗰四個預設係捷徑，唔係全份餐牌。',
      '你一改，成版嘢即刻跟住變，重新載入之後都仲喺度。種子色乜嘢顏色都收；嗰四個預設係捷徑，唔係成份餐牌。',
      '你一改，成版嘢即刻跟住變，重新載入之後都仲喺度。種子色乜嘢顏色都收 — 嗰四個預設係捷徑，唔係成份餐牌，而你揀個核突到爆嘅色都完全係你嘅自由。',
    ],
  },
  'se.appearance.derived': {
    en: 'A custom seed derives its dependent colour roles rather than tinting one button, so the whole page moves with it and stays readable in both themes. The translator shows the contrast the derived primary will actually have.',
    yue: '自訂種子色會推導出佢下游嗰啲色彩角色，唔係淨係將一粒掣染色，所以成版嘢會跟住郁，兩個主題之下都仲讀得到。個轉換器會顯示推導出嚟嘅主色實際會有幾多對比度。',
  },
  'se.reset.heading': { en: 'Reset', yue: '重設' },
  'se.reset.help': {
    en: 'Each reset affects only what it names. Nothing here touches anything outside this browser.',
    yue: '每個重設淨係影響佢寫住嗰樣嘢。呢度冇一樣嘢會掂到呢個瀏覽器以外嘅嘢。',
  },
  'se.reset.language.label': { en: 'Language mode and funny levels', yue: '語言模式同搞笑程度' },
  'se.reset.language.desc': { en: 'Back to bilingual, English at 3 and Cantonese at 4.', yue: '回復雙語，英文 3、粵語 4。' },
  'se.reset.tabs.label': { en: 'Tab order and pinned tabs', yue: '分頁次序同釘住咗嘅分頁' },
  'se.reset.tabs.desc': { en: 'Restores the original section order and unpins everything.', yue: '回復原本嘅區段次序，同埋解晒所有釘住。' },
  'se.reset.tabs.button': { en: 'Reset the tabs', yue: '重設啲分頁' },
  'se.reset.all.label': { en: 'Everything this site has stored', yue: '呢個網站存過嘅所有嘢' },
  'se.reset.all.desc': {
    en: 'Language, funny levels, appearance, tabs, saved search patterns and the notification history. The page reloads afterwards.',
    yue: '語言、搞笑程度、外觀、分頁、儲低咗嘅搜尋 pattern 同通知紀錄。做完之後成版會重新載入。',
  },
  'se.reset.all.button': { en: 'Clear stored preferences', yue: '清除儲低嘅偏好' },
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
