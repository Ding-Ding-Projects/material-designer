/* =============================================================================
   regex.js — the regular-expression builder for the Material Designer site.

   WHAT THIS FILE IS
   -----------------
   A guided pattern builder that mounts as a popover ANCHORED beside one
   specific search field. Every search field on the page gets its own instance
   with its own query, pattern, flag set, validation state and mode. There is
   deliberately no shared singleton: the project's standard names "one shared
   builder that silently applies to whichever field was touched last" as a
   failure, so this module cannot express that arrangement even by accident.

   ENGINE AND DIALECT
   ------------------
   The builder targets the browser's own ECMAScript `RegExp` — the same engine
   the site's search runs — and says so in its own interface. It is NOT PCRE:
   no possessive quantifiers, no atomic groups, no recursion, no inline
   modifier groups. The escaping rules below are ECMAScript's.

   DEPENDENCIES
   ------------
   None. No imports, no build step, no network. It reads the Material Design 3
   colour/shape/motion tokens from tokens.css through `var()`, and injects one
   namespaced `<style id="mdrx-styles">` block so the builder renders correctly
   whatever app.css happens to contain. Every `.mdrx-*` rule is overridable by
   app.css, which loads after this style block is inserted in document order
   only if app.css is linked in <head> — in practice app.css wins on ties
   because it is a document stylesheet with equal specificity declared later.

   PUBLIC API (see the bottom of the file for the export list)
   ----------------------------------------------------------
     attachRegexBuilder(inputEl, options) -> controller
     attachAll(root)                      -> controller[]
     getBuilder(inputEl)                  -> controller | undefined
     escapeLiteral(text)                  -> ECMAScript-escaped literal source
     parsePattern(src)                    -> { ok, tokens } | { ok:false, ... }
     serializeTokens(tokens)              -> pattern source
     analyzePattern(src)                  -> { level, reasons }
     createEvaluator(opts)                -> worker-backed match runner
     runMatch(...)                        -> the raw, pure matching routine
     setRegexI18n({ mode, funnyEn, funnyYue })
     setRegexTranslator(fn)
     FLAGS, LIMITS, STORAGE_PREFIX

   WIRING NOTES FOR main.js
   ------------------------
   * Mark a field with `data-regex-builder` and this module attaches to it on
     DOMContentLoaded. Attachment is idempotent, so calling attachAll() again
     is harmless.
   * Give the field a stable `id` (or pass `options.key`) if its pattern should
     survive a reload. Without one, persistence is skipped rather than written
     under an unstable key.
   * `controller.onChange(cb)` fires whenever the query, pattern, flags, mode
     or validity change; `controller.matcher()` returns the predicate the
     search should actually run.
   * On a language change call `setRegexI18n(...)`, or dispatch
     `document.dispatchEvent(new CustomEvent('md:language-change', { detail:
     { mode, funnyEn, funnyYue } }))` — this module listens for that event.
   * Copy actions dispatch a bubbling `md:toast` CustomEvent so ui.js can show
     a non-blocking notification. The builder also shows the result inline, so
     nothing is lost if no toast system is listening.
   ============================================================================= */

/* -----------------------------------------------------------------------------
   0. CONSTANTS AND LIMITS

   The caps are deliberate and are part of the safety story, not tuning knobs
   to raise when something feels tight. See section 6 for what they defend.
   ----------------------------------------------------------------------------- */

/** localStorage namespace. Everything this module writes starts with this. */
const STORAGE_PREFIX = 'material-designer:regex:';

const LIMITS = Object.freeze({
  /** Longest pattern the builder will compile at all. */
  PATTERN: 1000,
  /** Longest sample text the tester will evaluate. Longer text is truncated
      for evaluation and the truncation is stated in the interface. */
  SAMPLE: 20000,
  /** Most matches collected before the result is reported as truncated. */
  MATCHES: 500,
  /** Longest single match/group string kept for display. */
  MATCH_CHARS: 400,
  /** Worker deadline. Past this the worker is terminated outright. */
  DEADLINE_MS: 250,
  /** Main-thread fallback budget. See section 6 for why this is weaker. */
  FALLBACK_MS: 60,
  /** Budget for one synchronous search sweep over site content. */
  SEARCH_BUDGET_MS: 50,
  /** Debounce before re-evaluating after a keystroke. */
  DEBOUNCE_MS: 140,
});

/**
 * The six flags the builder offers. `d` (match indices) and `v` (the newer
 * class syntax) are deliberately omitted: neither changes what a search
 * matches, and `v` is not universally supported yet, so offering it would
 * produce patterns that fail on some of the user's own browsers.
 */
const FLAGS = Object.freeze([
  { flag: 'g', key: 'flagG' },
  { flag: 'i', key: 'flagI' },
  { flag: 'm', key: 'flagM' },
  { flag: 's', key: 'flagS' },
  { flag: 'u', key: 'flagU' },
  { flag: 'y', key: 'flagY' },
]);

const DEFAULT_FLAGS = 'gi';

const DEFAULT_SAMPLE = [
  'orders-dashboard.html',
  'DESIGN.md',
  'data.json',
  'pitch-deck.html',
  'assets/dim-sum/index.json',
  'v0.16.1 · 517f39acde402c1a7af2189167a8d6957a3dac71',
].join('\n');

/** Instances, so attachment is idempotent and getBuilder() can find one. */
const REGISTRY = new WeakMap();

let uid = 0;
const nextId = (prefix) => `${prefix}-${++uid}`;

/* -----------------------------------------------------------------------------
   1. LANGUAGE MODES AND FUNNY LEVELS

   The builder's own copy obeys the site's language modes. Entries are either a
   plain string (identical at every funny level) or a five-element array indexed
   by the level, 1 = fully professional through 5 = maximum playfulness.

   The rule the arrays exist to respect: the LEVEL CHANGES THE VOICE, NEVER THE
   FACTS. Match counts, flag letters, pattern text, engine error messages,
   character offsets and size caps are interpolated verbatim into every variant
   and are never softened, rounded or omitted. A level-5 string that left the
   user unsure how many matches there are would be a broken string, not a funny
   one.
   ----------------------------------------------------------------------------- */

const I18N_STATE = { mode: 'en', funny: { en: 3, yue: 3 } };

/** An optional external translator, set by main.js if i18n.js owns the copy. */
let externalTranslator = null;

const STRINGS = {
  /* ---- Chrome -------------------------------------------------------- */
  title: { en: 'Regex builder', yue: '正則表達式工具' },
  nonModal: { en: 'non-modal', yue: '唔阻你做嘢' },
  close: { en: 'Close regex builder', yue: '閂咗個正則工具' },
  openBuilder: { en: 'Open the regex builder for this field', yue: '開呢個搜尋格嘅正則工具' },
  regexModeLabel: { en: 'Regex mode for this field', yue: '呢個格用正則模式' },

  subtitle: {
    en: [
      'Engine: this browser\'s ECMAScript RegExp — the same engine the search uses. Syntax is ECMAScript, not PCRE.',
      'Engine: this browser\'s ECMAScript RegExp, exactly what the search runs. ECMAScript syntax, not PCRE.',
      'Same engine as the search: this browser\'s ECMAScript RegExp. ECMAScript syntax, not PCRE.',
      'Same engine as the search: this browser\'s ECMAScript RegExp. ECMAScript, not PCRE — no atomic groups to hide behind.',
      'One engine, no surprises: this browser\'s ECMAScript RegExp, same as the search. ECMAScript, not PCRE — nowhere to hide.',
    ],
    yue: [
      '引擎：呢個瀏覽器嘅 ECMAScript RegExp，同搜尋用嘅係同一個。語法係 ECMAScript，唔係 PCRE。',
      '引擎：瀏覽器自己嘅 ECMAScript RegExp，同搜尋一模一樣。語法係 ECMAScript，唔係 PCRE。',
      '同搜尋共用一個引擎：瀏覽器嘅 ECMAScript RegExp。係 ECMAScript，唔係 PCRE。',
      '同搜尋同一個引擎：瀏覽器嘅 ECMAScript RegExp。係 ECMAScript 唔係 PCRE，冇 atomic group 畀你匿。',
      '一個引擎行到底，唔會有伏：同搜尋共用瀏覽器嘅 ECMAScript RegExp。係 ECMAScript 唔係 PCRE，冇得匿。',
    ],
  },

  /* ---- Mode ---------------------------------------------------------- */
  modePlain: { en: 'Plain text', yue: '普通文字' },
  modeRegex: { en: 'Regex', yue: '正則' },
  plainDefault: {
    en: [
      'Plain text is the default. Regex is an explicit opt-in for this field.',
      'Plain text is the default here; regex is something you turn on.',
      'Plain text is the default — regex only runs when you switch it on for this field.',
      'Plain text is the default, because a stray full stop should not quietly become "any character".',
      'Plain text is the default — otherwise one stray full stop matches your whole page.',
    ],
    yue: [
      '預設係普通文字。呢個格要自己撳先會用正則。',
      '預設普通文字，正則要你自己開先有。',
      '預設係普通文字 — 你唔開，正則就唔會行。',
      '預設普通文字，唔係要你打個句號就變成「乜都中」。',
      '預設普通文字，如果唔係打錯個句號就成版嘢都中晒。',
    ],
  },
  escapeAsLiteral: { en: 'Escape it as literal text', yue: '幫我轉做純文字' },
  escapeHint: {
    en: 'Switched to regex with what you typed, unchanged. Metacharacters in it now mean what regex says they mean.',
    yue: '轉咗做正則，你打嗰啲字冇改過。入面啲特殊符號而家會照正則嘅意思解。',
  },

  /* ---- Pattern editor ------------------------------------------------ */
  patternLabel: { en: 'Pattern', yue: '表達式' },
  patternPlaceholder: { en: 'pattern', yue: 'pattern' },
  flagsLabel: { en: 'Flags', yue: '旗標' },
  flagsLegend: { en: 'What each flag does', yue: '每個旗標做乜' },
  flagG: { en: 'g — global: keep going after the first match instead of stopping.', yue: 'g — global：搵到第一個之後繼續搵落去，唔會停。' },
  flagI: { en: 'i — ignore case: A matches a.', yue: 'i — 唔理大細階：A 同 a 一樣中。' },
  flagM: { en: 'm — multiline: ^ and $ match at every line break, not just the ends of the text.', yue: 'm — 多行：^ 同 $ 每一行都認，唔淨係認成段文字嘅頭尾。' },
  flagS: { en: 's — dotAll: . also matches a newline.', yue: 's — dotAll：. 連換行都中埋。' },
  flagU: { en: 'u — unicode: treat the pattern as Unicode code points; \\u{...} and \\p{...} become available and some escapes become stricter.', yue: 'u — Unicode：成個表達式當 Unicode 碼位處理，\\u{...} 同 \\p{...} 用得，但有啲 escape 會嚴格咗。' },
  flagY: { en: 'y — sticky: only match starting exactly at lastIndex, never further along.', yue: 'y — sticky：一定要喺 lastIndex 嗰個位開始中，唔會向前搵。' },

  /* ---- Guided construction ------------------------------------------- */
  guided: { en: 'Guided construction', yue: '一步步砌' },
  literal: { en: 'Literal text', yue: '純文字' },
  literalPlaceholder: { en: 'text to match exactly', yue: '要一模一樣中嘅字' },
  addLiteral: { en: 'Add literal', yue: '加落去' },
  classes: { en: 'Character classes', yue: '字元類別' },
  customSet: { en: 'Custom set', yue: '自訂集合' },
  customSetPlaceholder: { en: 'a-z0-9_', yue: 'a-z0-9_' },
  negate: { en: 'Negate (^)', yue: '反轉 (^)' },
  addSet: { en: 'Add set', yue: '加集合' },
  anchors: { en: 'Anchors', yue: '錨點' },
  groups: { en: 'Groups', yue: '分組' },
  groupNamePlaceholder: { en: 'group name', yue: '分組名' },
  alternation: { en: 'Alternation', yue: '或者' },
  quantifiers: { en: 'Quantifiers', yue: '數量' },
  lazy: { en: 'Lazy (?)', yue: '懶惰 (?)' },
  lazyHint: { en: 'Lazy quantifiers stop at the first thing that works instead of grabbing as much as they can.', yue: '懶惰版一搵到啱嘅就收手，唔會盡量吞晒。' },

  /* ---- Parts list ---------------------------------------------------- */
  parts: { en: 'Parts', yue: '組件' },
  partsEmpty: { en: 'No parts yet. Add one above, or type straight into the pattern.', yue: '仲未有組件。上面加一個，或者直接喺 pattern 度打。' },
  partsHint: { en: 'Select a part to quantify, move or remove it.', yue: '揀一個組件，就可以加數量、搬位或者刪走。' },
  removePart: { en: 'Remove this part', yue: '刪走呢個組件' },
  moveLeft: { en: 'Move left', yue: '向左搬' },
  moveRight: { en: 'Move right', yue: '向右搬' },
  wrappedForQuantifier: { en: 'Wrapped in (?:…) so the quantifier applies to the whole run, not just its last character.', yue: '用 (?:…) 包住咗，等個數量計成串，唔係淨計最後一個字。' },

  partsUnavailable: {
    en: [
      'The parts list cannot represent this pattern: {reason} at position {index}. The raw pattern is unchanged and still works.',
      'Parts cannot show this pattern — {reason} at position {index}. Your raw pattern is untouched and still runs.',
      'The parts list has met its match: {reason} at position {index}. Your raw pattern is untouched and still runs — parts just stay read-only.',
      'Parts tapped out: {reason} at position {index}. Your raw pattern is untouched and still runs.',
      'Parts has given up: {reason} at position {index}. Nothing lost, nothing rewritten — the raw pattern still runs.',
    ],
    yue: [
      '組件清單表達唔到呢個表達式：喺第 {index} 位有 {reason}。原本個 pattern 冇改過，照行。',
      '組件顯示唔到呢個 pattern — 第 {index} 位有 {reason}。你個 raw pattern 原封不動，照樣行。',
      '組件清單投降喇：第 {index} 位有 {reason}。放心，冇嘢畀人掉，raw pattern 一個字都冇改過，照行。',
      '組件舉手投降：第 {index} 位有 {reason}。冇丟嘢冇偷改，raw pattern 照行。',
      '組件跪低咗：第 {index} 位有 {reason}。放心，冇掉嘢、冇偷改，raw pattern 一個字都冇少。',
    ],
  },

  /* ---- Sample and matches -------------------------------------------- */
  sample: { en: 'Sample text and matches', yue: '樣本同結果' },
  samplePlaceholder: { en: 'Paste text to test the pattern against', yue: '貼啲文字入嚟試下' },
  sampleNote: {
    en: [
      'Sample text is evaluated locally and is never saved or sent anywhere.',
      'The sample stays in this tab. It is never saved and never sent anywhere.',
      'The sample never leaves this tab — not saved, not uploaded, not logged.',
      'The sample stays here. Not saved, not uploaded, not logged.',
      'Whatever you paste stays in this tab: not saved, not uploaded, not logged, forgotten on reload.',
    ],
    yue: [
      '樣本喺本機計，唔會儲低，亦都唔會傳去任何地方。',
      '樣本淨係留喺呢個分頁，唔儲低亦唔上傳。',
      '樣本唔會離開呢個分頁 — 唔儲、唔上傳、唔寫 log。',
      '樣本淨係留喺呢度：唔儲、唔上傳、唔寫 log。',
      '你貼咩落嚟都淨係留喺呢個分頁：唔儲、唔上傳、唔寫 log，一 reload 就唔記得晒。',
    ],
  },
  sampleTruncated: { en: 'Only the first {n} characters are evaluated. The cap keeps a bad pattern from freezing the page.', yue: '淨係計頭 {n} 個字。設上限係為咗唔想個衰 pattern 搞到成版死機。' },
  captures: { en: 'Capture groups', yue: '擷取分組' },
  capturesNone: { en: 'This pattern has no capture groups.', yue: '呢個表達式冇擷取分組。' },
  colMatch: { en: 'Match', yue: '相符' },
  colAt: { en: 'At', yue: '位置' },
  colText: { en: 'Text', yue: '內容' },
  zeroWidth: { en: 'zero-width', yue: '零寬度' },
  showingFirst: { en: 'Showing the first {n} of the matches found.', yue: '顯示搵到嘅頭 {n} 個。' },

  /* ---- Status -------------------------------------------------------- */
  statusEmpty: {
    en: [
      'The pattern is empty. Nothing is being matched.',
      'Empty pattern — nothing to match yet.',
      'Empty pattern. Nothing to match yet — add a part or type one in.',
      'Empty pattern, so nothing matches. Add a part above, or just start typing one.',
      'Nothing in the pattern, so nothing matches — the fastest way to find nothing at all.',
    ],
    yue: [
      '表達式係空嘅，冇嘢會中。',
      '表達式空空如也 — 暫時冇嘢中。',
      '表達式仲係空嘅，未有嘢中，上面加個組件或者直接打都得。',
      '表達式空咗，所以乜都唔中。上面加個組件，或者直接開始打啦。',
      '表達式空空如也，乜都唔中 — 搵唔到嘢嘅最快方法。',
    ],
  },
  statusNoMatch: {
    en: [
      'No matches in the sample.',
      'Nothing matched in the sample.',
      'No matches in the sample — the pattern is valid, it just does not find anything here.',
      'No matches. The pattern is perfectly valid; it simply disagrees with your sample.',
      'Zero matches. The pattern is valid and completely wrong about this sample.',
    ],
    yue: [
      '樣本入面冇相符。',
      '樣本入面搵唔到相符。',
      '樣本入面冇相符 — 個表達式冇錯，只係喺呢度搵唔到嘢。',
      '一個都冇中。表達式本身冇問題，係同你個樣本唔啱牙啫。',
      '零相符。個表達式冇錯，係同你個樣本完全唔啱嘴形啫。',
    ],
  },
  statusMatchOne: {
    en: [
      '1 match in the sample.',
      '1 match in the sample — just the one.',
      '1 match found.',
      '1 match — a modest but honest result.',
      'Exactly 1 match. Small, but it turned up.',
    ],
    yue: [
      '樣本入面有 1 個相符。',
      '樣本入面得 1 個相符。',
      '搵到 1 個相符。',
      '中咗 1 個 — 唔多，但係實實在在。',
      '啱啱好 1 個。唔算多，但至少肯出嚟見人。',
    ],
  },
  statusMatchMany: {
    en: [
      '{n} matches in the sample.',
      '{n} matches across the sample.',
      '{n} matches found.',
      '{n} matches — the pattern is earning its keep.',
      '{n} matches! The pattern is doing laps around your sample.',
    ],
    yue: [
      '樣本入面有 {n} 個相符。',
      '樣本入面搵到 {n} 個相符。',
      '喺樣本入面搵到 {n} 個相符啦。',
      '中咗 {n} 個 — 呢個 pattern 幾醒喎。',
      '嘩，中咗 {n} 個！個 pattern 喺你個樣本度兜緊圈，比搶蝦餃仲快。',
    ],
  },
  statusInvalid: { en: 'Invalid pattern — {message}', yue: '表達式有錯 — {message}' },
  statusTooLong: { en: 'The pattern is {n} characters. The cap is {max}, so it is not being compiled.', yue: '個表達式有 {n} 個字，上限係 {max}，所以冇編譯佢。' },
  lastValid: { en: 'The last valid pattern is still what the search uses: /{pattern}/{flags}', yue: '搜尋而家仲係用返上一個冇錯嘅表達式：/{pattern}/{flags}' },

  truncated: {
    en: [
      'Stopped after {n} matches. The cap keeps the page responsive.',
      'Stopped at {n} matches — that is the cap.',
      'Stopped at {n} matches, which is the cap. There may well be more.',
      'Stopped at {n} matches — the cap, not the total.',
      'Called it at {n} matches. That is the cap, not the truth: your pattern was still going.',
    ],
    yue: [
      '夠 {n} 個就停咗，設上限係為咗版面唔會卡。',
      '夠 {n} 個就停 — 咁多係上限嚟。',
      '夠 {n} 個就停咗，咁多係上限，實際可能仲有更多。',
      '喺 {n} 個度收手 — 呢個係上限，唔係總數。',
      '夠 {n} 個就嗌停。係上限唔係真相，你個 pattern 仲跑緊。',
    ],
  },
  timedOut: {
    en: [
      'Evaluation stopped at the {ms} ms deadline. The result is incomplete.',
      'Stopped at the {ms} ms deadline. The result below is incomplete.',
      'Hit the {ms} ms deadline and stopped. What is shown below is incomplete.',
      'Hit the {ms} ms deadline and pulled the plug. The result below is incomplete.',
      'Ran out of patience at {ms} ms. What is below is partial, not the whole story.',
    ],
    yue: [
      '夠 {ms} 毫秒就停咗，結果唔完整。',
      '到咗 {ms} 毫秒上限就停，下面嘅結果唔完整。',
      '夠 {ms} 毫秒就叫停咗，下面顯示嘅唔完整。',
      '到 {ms} 毫秒就拔咗個掣。下面嘅係部分結果，唔係全部。',
      '等到 {ms} 毫秒就忍唔住拔掣。下面淨係部分結果，唔係全部。',
    ],
  },
  riskHigh: {
    en: [
      'This pattern has a shape associated with catastrophic backtracking ({reasons}). Evaluation is time-limited.',
      'This pattern looks like a backtracking risk ({reasons}). Evaluation is time-limited.',
      'This shape is a known backtracking trap ({reasons}). Evaluation is time-limited, so the page stays usable.',
      'Careful — this is the classic backtracking shape ({reasons}). Time-limited here, but not everywhere.',
      'That is the classic runaway-backtracking shape ({reasons}). Time-limited here; paste it somewhere without a limit at your peril.',
    ],
    yue: [
      '呢個 pattern 嘅結構容易引發災難性回溯（{reasons}），所以計算有時間限制。',
      '呢個 pattern 睇落有回溯風險（{reasons}），計算會有時間上限。',
      '呢個結構係出名嘅回溯陷阱（{reasons}），所以加咗時間限制，等版面唔會卡死。',
      '小心啲 — 呢個係經典回溯陷阱（{reasons}）。喺呢度有時間限制，出面就未必有。',
      '呢個正正係失控回溯嘅經典款（{reasons}）。喺呢度有時間上限，貼去第度就自求多福啦。',
    ],
  },
  riskNested: { en: 'a quantifier inside a quantified group', yue: '有數量嘅分組入面仲有數量' },
  riskAltQuant: { en: 'a quantified group of alternatives', yue: '有數量嘅「或者」分組' },
  riskUnbounded: { en: 'an open-ended repeat of a repeat', yue: '無上限嘅重複套重複' },
  riskManyQuant: { en: '{n} quantifiers in one pattern', yue: '一個 pattern 入面有 {n} 個數量符' },
  partialMatches: { en: '{n} matches were found before it stopped.', yue: '停之前搵到 {n} 個相符。' },

  /* ---- Actions ------------------------------------------------------- */
  copyPattern: { en: 'Copy pattern', yue: '複製表達式' },
  copyLiteral: { en: 'Copy /pattern/flags', yue: '複製 /表達式/旗標' },
  reset: { en: 'Reset', yue: '重設' },
  copied: {
    en: [
      'Copied to the clipboard.',
      'Copied.',
      'Copied — it is on your clipboard.',
      'Copied. Go on then, paste it somewhere useful.',
      'Copied! On your clipboard, warm like a basket off the trolley.',
    ],
    yue: [
      '已經複製到剪貼簿。',
      '複製咗喇。',
      '複製咗 — 喺你個剪貼簿度。',
      '複製咗喇，快啲搵個好地方貼啦。',
      '複製咗喇！熱辣辣喺剪貼簿等你，好似啱啱推到嚟嗰籠咁。',
    ],
  },
  copyFailed: { en: 'The browser refused the copy. Select the pattern and copy it manually.', yue: '瀏覽器唔畀複製。自己揀住個表達式再複製啦。' },

  /* ---- Unsupported-construct names (facts, not voice) ---------------- */
  cLookahead: { en: 'a lookahead', yue: '前瞻 (lookahead)' },
  cNegLookahead: { en: 'a negative lookahead', yue: '否定前瞻' },
  cLookbehind: { en: 'a lookbehind', yue: '後顧 (lookbehind)' },
  cNegLookbehind: { en: 'a negative lookbehind', yue: '否定後顧' },
  cBackreference: { en: 'a backreference', yue: '反向引用 (backreference)' },
  cUnicodeProperty: { en: 'a Unicode property escape', yue: 'Unicode 屬性 escape' },
  cUnicodeEscape: { en: 'a braced Unicode escape', yue: '大括號 Unicode escape' },
  cControlEscape: { en: 'a control escape', yue: '控制字元 escape' },
  cUnknownEscape: { en: 'an escape the builder does not recognise', yue: '工具唔識嘅 escape' },
  cGroupModifier: { en: 'a modifier group', yue: '修飾符分組' },
  cTooLong: { en: 'a pattern over the length cap', yue: '超過長度上限嘅表達式' },
  cInvalid: { en: 'a syntax error', yue: '語法錯誤' },
};

/** Interpolate {name} placeholders. Values are inserted verbatim — facts. */
function fill(text, vars) {
  if (!vars) return text;
  return String(text).replace(/\{(\w+)\}/g, (whole, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole);
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Resolve one language's variant of an entry at the active funny level. */
function pickVariant(entry, lang) {
  if (!entry) return '';
  const value = entry[lang];
  if (value == null) return lang === 'en' ? '' : pickVariant(entry, 'en');
  if (Array.isArray(value)) {
    const level = clamp(Math.round(I18N_STATE.funny[lang] || 3), 1, 5);
    return value[level - 1] != null ? value[level - 1] : value[value.length - 1];
  }
  return value;
}

/**
 * Resolve a key to { primary, secondary }. In bilingual mode `secondary` holds
 * the Cantonese so the caller can render it as a compact second line rather
 * than crowding the primary label.
 */
function tx(key, vars) {
  if (externalTranslator) {
    const out = externalTranslator(key, vars, I18N_STATE);
    if (typeof out === 'string') return { primary: out, secondary: '' };
    if (out && typeof out === 'object') return { primary: out.primary || '', secondary: out.secondary || '' };
  }
  const entry = STRINGS[key];
  if (!entry) return { primary: key, secondary: '' };
  const en = fill(pickVariant(entry, 'en'), vars);
  const yue = fill(pickVariant(entry, 'yue'), vars);
  if (I18N_STATE.mode === 'yue') return { primary: yue || en, secondary: '' };
  if (I18N_STATE.mode === 'bilingual') return { primary: en, secondary: yue };
  return { primary: en, secondary: '' };
}

/** Flattened form, for attributes (title, aria-label) that cannot hold markup. */
function t(key, vars) {
  const r = tx(key, vars);
  return r.secondary ? `${r.primary} · ${r.secondary}` : r.primary;
}

/** Write a key into an element as a primary line plus optional secondary line. */
function setText(el, key, vars) {
  const r = tx(key, vars);
  el.textContent = '';
  el.appendChild(document.createTextNode(r.primary));
  if (r.secondary) {
    const sec = document.createElement('span');
    sec.className = 'mdrx-sec';
    sec.textContent = r.secondary;
    el.appendChild(sec);
  }
}

/**
 * Set the language mode and funny levels. Accepts partial updates and a few
 * aliases so it does not matter whether i18n.js says 'yue', 'zh-HK' or 'both'.
 */
function setRegexI18n(next) {
  if (!next) return;
  if (next.mode) {
    const m = String(next.mode).toLowerCase();
    if (m === 'en' || m === 'english') I18N_STATE.mode = 'en';
    else if (m === 'yue' || m === 'zh-hk' || m === 'zh' || m === 'cantonese') I18N_STATE.mode = 'yue';
    else if (m === 'bilingual' || m === 'both' || m === 'bi') I18N_STATE.mode = 'bilingual';
  }
  if (typeof next.funnyEn === 'number') I18N_STATE.funny.en = clamp(next.funnyEn, 1, 5);
  if (typeof next.funnyYue === 'number') I18N_STATE.funny.yue = clamp(next.funnyYue, 1, 5);
  if (next.funny && typeof next.funny === 'object') {
    if (typeof next.funny.en === 'number') I18N_STATE.funny.en = clamp(next.funny.en, 1, 5);
    if (typeof next.funny.yue === 'number') I18N_STATE.funny.yue = clamp(next.funny.yue, 1, 5);
  }
  relabelAll();
}

/** Hand the copy over to i18n.js entirely. Pass null to hand it back. */
function setRegexTranslator(fn) {
  externalTranslator = typeof fn === 'function' ? fn : null;
  relabelAll();
}

/** Open builders re-render their copy when the language changes. */
const LIVE_INSTANCES = new Set();
function relabelAll() {
  LIVE_INSTANCES.forEach((instance) => {
    try { instance.relabel(); } catch (err) { /* one bad instance must not stop the rest */ }
  });
}

if (typeof document !== 'undefined') {
  document.addEventListener('md:language-change', (event) => setRegexI18n(event.detail || {}));
}

/* -----------------------------------------------------------------------------
   2. ESCAPING

   ECMAScript rules. `/` is escaped as well: it is legal unescaped inside a
   RegExp constructor, but the builder offers a copyable `/pattern/flags`
   literal, and an unescaped `/` would terminate that literal early.
   ----------------------------------------------------------------------------- */

const CONTROL_ESCAPES = { '\n': '\\n', '\r': '\\r', '\t': '\\t', '\f': '\\f', '\v': '\\v' };

/** Turn arbitrary text into pattern source that matches exactly that text. */
function escapeLiteral(text) {
  return String(text == null ? '' : text).replace(/[\s\S]/g, (ch) => {
    if (CONTROL_ESCAPES[ch]) return CONTROL_ESCAPES[ch];
    if ('\\^$.|?*+()[]{}/'.indexOf(ch) !== -1) return '\\' + ch;
    const code = ch.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) return '\\x' + code.toString(16).padStart(2, '0');
    return ch;
  });
}

/** Escape a run of characters for use *inside* a […] character class. */
function escapeClassSet(text) {
  return String(text == null ? '' : text).replace(/[\\\]^-]/g, '\\$&');
}

/* -----------------------------------------------------------------------------
   3. THE TOKEN MODEL

   A token is one of:
     { kind:'literal',     text }                          — unescaped text
     { kind:'class',       cls:'\\d'|'.'|…  }              — predefined
     { kind:'class',       cls:'set', negate, inner }      — […] with raw inner
     { kind:'anchor',      anchor:'^'|'$'|'\\b'|'\\B' }
     { kind:'alternation' }
     { kind:'group',       groupType, name, children[] }
   Any token except `alternation` may carry:
     quant: { min, max, lazy, source }

   `serializeTokens` is the single source of the pattern text whenever the
   parts list is editable. `parsePattern` is its inverse over the subset the
   parts list can represent.
   ----------------------------------------------------------------------------- */

function serializeToken(token) {
  let body = '';
  switch (token.kind) {
    case 'literal':
      body = escapeLiteral(token.text);
      break;
    case 'class':
      body = token.cls === 'set'
        ? '[' + (token.negate ? '^' : '') + token.inner + ']'
        : token.cls;
      break;
    case 'anchor':
      body = token.anchor;
      break;
    case 'alternation':
      return '|';
    case 'group': {
      const prefix = token.groupType === 'nonCapturing' ? '?:'
        : token.groupType === 'named' ? '?<' + token.name + '>'
          : '';
      body = '(' + prefix + serializeTokens(token.children) + ')';
      break;
    }
    default:
      body = '';
  }
  return body + (token.quant ? token.quant.source : '');
}

function serializeTokens(tokens) {
  return (tokens || []).map(serializeToken).join('');
}

/** A short human description of a token, in the active language. */
function describeToken(token) {
  const q = token.quant ? ' ' + token.quant.source : '';
  switch (token.kind) {
    case 'literal': return JSON.stringify(token.text) + q;
    case 'anchor': return token.anchor + q;
    case 'alternation': return '|';
    case 'class':
      return (token.cls === 'set'
        ? '[' + (token.negate ? '^' : '') + token.inner + ']'
        : token.cls) + q;
    case 'group': {
      const label = token.groupType === 'named' ? '(?<' + token.name + '>…)'
        : token.groupType === 'nonCapturing' ? '(?:…)'
          : '(…)';
      return label + q;
    }
    default: return '?';
  }
}

/* -----------------------------------------------------------------------------
   4. THE PARSER

   Parses the subset of ECMAScript the guided parts list can represent, and
   REPORTS HONESTLY when it meets anything else. A pattern containing a
   lookahead, a backreference or a Unicode property escape is perfectly valid
   and keeps working — the parts list simply says it cannot show it, and the
   raw pattern stays untouched. Nothing is ever silently dropped or rewritten.
   ----------------------------------------------------------------------------- */

const UNSUPPORTED_KEYS = {
  lookahead: 'cLookahead',
  'negative-lookahead': 'cNegLookahead',
  lookbehind: 'cLookbehind',
  'negative-lookbehind': 'cNegLookbehind',
  backreference: 'cBackreference',
  'unicode-property': 'cUnicodeProperty',
  'unicode-escape': 'cUnicodeEscape',
  'control-escape': 'cControlEscape',
  'unknown-escape': 'cUnknownEscape',
  'group-modifier': 'cGroupModifier',
  'too-long': 'cTooLong',
};

function parsePattern(source) {
  const src = String(source == null ? '' : source);
  if (src.length > LIMITS.PATTERN) {
    return { ok: false, kind: 'unsupported', construct: 'too-long', index: LIMITS.PATTERN };
  }

  let i = 0;
  let captureCount = 0;
  let failure = null;

  function fail(kind, construct, index, message) {
    if (!failure) failure = { ok: false, kind, construct: construct || null, index, message: message || '' };
  }

  /** Read a quantifier at `i`, or return null without moving. */
  function readQuantifier() {
    const ch = src[i];
    let quant = null;
    if (ch === '*') { quant = { min: 0, max: Infinity, source: '*' }; i += 1; }
    else if (ch === '+') { quant = { min: 1, max: Infinity, source: '+' }; i += 1; }
    else if (ch === '?') { quant = { min: 0, max: 1, source: '?' }; i += 1; }
    else if (ch === '{') {
      const m = /^\{(\d+)(,(\d*))?\}/.exec(src.slice(i));
      if (m) {
        const min = parseInt(m[1], 10);
        const max = m[2] === undefined ? min : (m[3] === '' ? Infinity : parseInt(m[3], 10));
        quant = { min, max, source: m[0] };
        i += m[0].length;
      }
    }
    if (!quant) return null;
    if (src[i] === '?') { quant.lazy = true; quant.source += '?'; i += 1; }
    return quant;
  }

  /**
   * Attach a quantifier at `i` to the previous token, splitting a multi-char
   * literal run so that `abc+` becomes literal "ab" then literal "c"+ — which
   * is what the engine actually does.
   * Returns true if a quantifier was consumed.
   */
  function attachQuantifier(tokens) {
    const before = i;
    const quant = readQuantifier();
    if (!quant) return false;
    const last = tokens[tokens.length - 1];
    if (!last || last.kind === 'alternation' || last.quant) {
      fail('invalid', null, before, 'Nothing to repeat');
      return true;
    }
    if (last.kind === 'literal' && last.text.length > 1) {
      const tail = last.text.slice(-1);
      last.text = last.text.slice(0, -1);
      tokens.push({ kind: 'literal', text: tail, quant });
      return true;
    }
    last.quant = quant;
    return true;
  }

  function pushLiteral(tokens, ch) {
    const last = tokens[tokens.length - 1];
    if (last && last.kind === 'literal' && !last.quant) last.text += ch;
    else tokens.push({ kind: 'literal', text: ch });
  }

  function parseSequence(depth) {
    const tokens = [];
    while (i < src.length && !failure) {
      const ch = src[i];

      if (ch === ')') {
        if (depth === 0) { fail('invalid', null, i, 'Unmatched )'); return tokens; }
        return tokens;
      }

      if (ch === '(') {
        let groupType = 'capturing';
        let name = null;
        if (src.startsWith('(?:', i)) { groupType = 'nonCapturing'; i += 3; }
        else if (src.startsWith('(?=', i)) { fail('unsupported', 'lookahead', i); return tokens; }
        else if (src.startsWith('(?!', i)) { fail('unsupported', 'negative-lookahead', i); return tokens; }
        else if (src.startsWith('(?<=', i)) { fail('unsupported', 'lookbehind', i); return tokens; }
        else if (src.startsWith('(?<!', i)) { fail('unsupported', 'negative-lookbehind', i); return tokens; }
        else if (src.startsWith('(?<', i)) {
          const m = /^\(\?<([A-Za-z_$][A-Za-z0-9_$]*)>/.exec(src.slice(i));
          if (!m) { fail('invalid', null, i, 'Invalid named group'); return tokens; }
          groupType = 'named';
          name = m[1];
          captureCount += 1;
          i += m[0].length;
        } else if (src[i + 1] === '?') { fail('unsupported', 'group-modifier', i); return tokens; }
        else { captureCount += 1; i += 1; }

        const openedAt = i;
        const number = (groupType === 'capturing' || groupType === 'named') ? captureCount : null;
        const children = parseSequence(depth + 1);
        if (failure) return tokens;
        if (src[i] !== ')') { fail('invalid', null, openedAt, 'Unterminated group'); return tokens; }
        i += 1;
        tokens.push({ kind: 'group', groupType, name, number, children });
        attachQuantifier(tokens);
        continue;
      }

      if (ch === '[') {
        // ECMAScript (without the v flag): `[]` is a legal empty class, and a
        // `]` immediately after `[` closes it rather than being a member.
        let j = i + 1;
        let negate = false;
        if (src[j] === '^') { negate = true; j += 1; }
        let inner = '';
        let closed = false;
        while (j < src.length) {
          const c = src[j];
          if (c === '\\') { inner += c + (src[j + 1] || ''); j += 2; continue; }
          if (c === ']') { closed = true; j += 1; break; }
          inner += c;
          j += 1;
        }
        if (!closed) { fail('invalid', null, i, 'Unterminated character class'); return tokens; }
        tokens.push({ kind: 'class', cls: 'set', negate, inner });
        i = j;
        attachQuantifier(tokens);
        continue;
      }

      if (ch === '|') { tokens.push({ kind: 'alternation' }); i += 1; continue; }

      if (ch === '^' || ch === '$') {
        tokens.push({ kind: 'anchor', anchor: ch });
        i += 1;
        attachQuantifier(tokens);
        continue;
      }

      if (ch === '.') {
        tokens.push({ kind: 'class', cls: '.' });
        i += 1;
        attachQuantifier(tokens);
        continue;
      }

      if (ch === '\\') {
        const nx = src[i + 1];
        if (nx === undefined) { fail('invalid', null, i, 'Trailing backslash'); return tokens; }
        if ('dDwWsS'.indexOf(nx) !== -1) {
          tokens.push({ kind: 'class', cls: '\\' + nx });
          i += 2;
          attachQuantifier(tokens);
          continue;
        }
        if (nx === 'b' || nx === 'B') {
          tokens.push({ kind: 'anchor', anchor: '\\' + nx });
          i += 2;
          attachQuantifier(tokens);
          continue;
        }
        if (nx === 'n' || nx === 'r' || nx === 't' || nx === 'f' || nx === 'v' || nx === '0') {
          const map = { n: '\n', r: '\r', t: '\t', f: '\f', v: '\v', 0: '\0' };
          pushLiteral(tokens, map[nx]);
          i += 2;
          attachQuantifier(tokens);
          continue;
        }
        if (nx === 'x') {
          const m = /^\\x([0-9a-fA-F]{2})/.exec(src.slice(i));
          if (!m) { fail('unsupported', 'unknown-escape', i); return tokens; }
          pushLiteral(tokens, String.fromCharCode(parseInt(m[1], 16)));
          i += m[0].length;
          attachQuantifier(tokens);
          continue;
        }
        if (nx === 'u') {
          // \uHHHH becomes a literal. \u{...} is deliberately NOT accepted: its
          // meaning depends on the u flag, and the parts list has no flags, so
          // guessing would be the one thing this parser must never do.
          const m = /^\\u([0-9a-fA-F]{4})/.exec(src.slice(i));
          if (!m) { fail('unsupported', 'unicode-escape', i); return tokens; }
          pushLiteral(tokens, String.fromCharCode(parseInt(m[1], 16)));
          i += m[0].length;
          attachQuantifier(tokens);
          continue;
        }
        if (nx === 'p' || nx === 'P') { fail('unsupported', 'unicode-property', i); return tokens; }
        if (nx === 'c') { fail('unsupported', 'control-escape', i); return tokens; }
        if (nx === 'k' || (nx >= '1' && nx <= '9')) { fail('unsupported', 'backreference', i); return tokens; }
        if (/[A-Za-z]/.test(nx)) { fail('unsupported', 'unknown-escape', i); return tokens; }
        pushLiteral(tokens, nx);
        i += 2;
        attachQuantifier(tokens);
        continue;
      }

      if (ch === '*' || ch === '+' || ch === '?') {
        attachQuantifier(tokens);
        continue;
      }

      if (ch === '{') {
        // A `{` that is not a valid quantifier is an ordinary literal brace in
        // ECMAScript's Annex B grammar, which is what the web actually runs.
        if (!attachQuantifier(tokens)) { pushLiteral(tokens, '{'); i += 1; }
        continue;
      }

      pushLiteral(tokens, ch);
      i += 1;
      attachQuantifier(tokens);
    }

    if (depth > 0 && !failure) fail('invalid', null, i, 'Unterminated group');
    return tokens;
  }

  const tokens = parseSequence(0);
  if (failure) return failure;
  return { ok: true, tokens };
}

/** Human name for whatever made a parse fail, in the active language. */
function describeParseFailure(failure) {
  if (!failure) return '';
  if (failure.kind === 'unsupported') {
    const key = UNSUPPORTED_KEYS[failure.construct];
    return key ? t(key) : String(failure.construct);
  }
  return failure.message ? `${t('cInvalid')}: ${failure.message}` : t('cInvalid');
}

/* -----------------------------------------------------------------------------
   5. STATIC RISK ANALYSIS

   A cheap, source-level screen for the shapes that cause catastrophic
   backtracking: a quantifier inside a quantified group, a quantified group of
   overlapping alternatives, and open-ended repeats of repeats.

   This is a HEURISTIC, not a proof. It has false positives (a quantified group
   whose alternatives cannot overlap is perfectly safe) and false negatives (a
   pathological pattern can be written in shapes this does not recognise).
   Its only job is to warn the user and to let the evaluator decide how much
   rope to give a pattern. The real protection is the terminable worker in
   section 6.
   ----------------------------------------------------------------------------- */

function analyzePattern(src) {
  const pattern = String(src == null ? '' : src);
  const reasons = [];
  let level = 'low';
  if (!pattern) return { level, reasons };

  // (…quantifier…) followed by a quantifier — the classic (a+)+ shape.
  if (/\([^()]*[*+}][^()]*\)\s*[*+{]/.test(pattern)) {
    reasons.push(t('riskNested'));
    level = 'high';
  }
  // A quantified group of alternatives — (a|a)*, (a|ab)+ and friends.
  if (/\((\?:|\?<[^>]*>)?[^()]*\|[^()]*\)\s*[*+{]/.test(pattern)) {
    reasons.push(t('riskAltQuant'));
    level = 'high';
  }
  // Open-ended repeat wrapping an open-ended repeat.
  if (/\([^()]*\{\d+,\}[^()]*\)\s*\{\d+,\}/.test(pattern)) {
    reasons.push(t('riskUnbounded'));
    level = 'high';
  }
  // Sheer quantity of quantifiers is a weaker signal, so it only reaches medium.
  const quantCount = (pattern.match(/[*+?]|\{\d+(,\d*)?\}/g) || []).length;
  if (level !== 'high' && quantCount >= 10) {
    reasons.push(t('riskManyQuant', { n: quantCount }));
    level = 'medium';
  }
  return { level, reasons };
}

/* -----------------------------------------------------------------------------
   6. EVALUATION AND THE BACKTRACKING GUARD

   HOW THE GUARD WORKS, AND WHAT IT CANNOT DO
   ------------------------------------------
   Preferred path — a Web Worker built from an inline Blob (no network, no
   separate file, so the no-external-request rule holds). The worker compiles
   and runs the pattern; the main thread starts a timer, and if the worker has
   not answered within LIMITS.DEADLINE_MS it is TERMINATED. Termination is the
   only mechanism in a browser that genuinely stops a regular expression that
   has entered catastrophic backtracking: `RegExp.prototype.exec` is not
   interruptible, so nothing running on the same thread as the timer can help.
   A fresh worker is created for the next evaluation.

   Fallback path — where Workers or blob: URLs are unavailable (some
   file:// contexts, some strict CSPs) the same routine runs on the main
   thread with a deadline checked BETWEEN exec() calls. Be clear about what
   that buys: it stops a pattern that finds a million matches, and it does
   NOT stop a single exec() call that backtracks for a minute. On that path
   the static risk screen from section 5 is the only thing standing between
   the user and a frozen tab, and the interface says so rather than implying
   protection it does not have.

   The other bounds are unconditional on both paths: pattern length, sample
   length, match count, per-match string length, and an explicit zero-width
   advance so a pattern that matches the empty string cannot loop forever —
   the single most common way a pattern tester hangs.

   None of this is bulletproof. It is a set of bounds that make the common
   failures survivable, not a proof that the page cannot be made slow.
   ----------------------------------------------------------------------------- */

/** Trim one match/group value for display, recording whether it was clipped. */
function packMatch(m, maxChars) {
  const text = m[0];
  const groups = [];
  for (let i = 1; i < m.length; i += 1) {
    const g = m[i];
    groups.push(g === undefined ? null : (g.length > maxChars ? g.slice(0, maxChars) : g));
  }
  let named = null;
  if (m.groups) {
    named = {};
    for (const k in m.groups) {
      if (Object.prototype.hasOwnProperty.call(m.groups, k)) {
        const v = m.groups[k];
        named[k] = v === undefined ? null : (v.length > maxChars ? v.slice(0, maxChars) : v);
      }
    }
  }
  return {
    index: m.index,
    length: text.length,
    text: text.length > maxChars ? text.slice(0, maxChars) : text,
    clipped: text.length > maxChars,
    groups,
    named,
  };
}

/**
 * The pure matching routine. Deliberately closure-free and written in plain ES5
 * so that its `.toString()` can be dropped straight into the worker source —
 * the worker and the main-thread fallback therefore run byte-identical logic
 * rather than two implementations that can drift apart.
 *
 * `deadlineMs` of 0 means "no deadline": that is what the worker passes,
 * because the worker is protected by termination instead.
 */
function runMatch(pattern, flags, sample, maxMatches, maxMatchChars, deadlineMs) {
  var started = Date.now();
  var re;
  try {
    re = new RegExp(pattern, flags);
  } catch (err) {
    return { ok: false, error: (err && err.message) ? err.message : String(err) };
  }
  var iterating = flags.indexOf('g') !== -1 || flags.indexOf('y') !== -1;
  var out = [];
  var truncated = false;
  var timedOut = false;
  var m;
  var steps = 0;

  if (!iterating) {
    // Faithful to the engine: without g or y a single exec() returns one match,
    // and the tester reports exactly what the search would get.
    m = re.exec(sample);
    if (m) out.push(packMatch(m, maxMatchChars));
  } else {
    re.lastIndex = 0;
    while ((m = re.exec(sample)) !== null) {
      out.push(packMatch(m, maxMatchChars));
      // Zero-width match: exec leaves lastIndex where it was, so advancing by
      // hand is the difference between a result and an infinite loop.
      if (m[0].length === 0) re.lastIndex += 1;
      if (out.length >= maxMatches) { truncated = true; break; }
      if (re.lastIndex > sample.length) break;
      steps += 1;
      if (deadlineMs > 0 && (steps & 31) === 0 && (Date.now() - started) > deadlineMs) {
        timedOut = true;
        break;
      }
    }
  }
  return {
    ok: true,
    matches: out,
    truncated: truncated,
    timedOut: timedOut,
    elapsed: Date.now() - started,
  };
}

const WORKER_SOURCE = [
  packMatch.toString(),
  runMatch.toString(),
  'self.onmessage = function (e) {',
  '  var d = e.data;',
  '  var r = runMatch(d.pattern, d.flags, d.sample, d.maxMatches, d.maxMatchChars, 0);',
  '  r.id = d.id;',
  '  self.postMessage(r);',
  '};',
].join('\n');

let workerUrl = null;
let workerSupported = null;

function getWorkerUrl() {
  if (workerUrl) return workerUrl;
  try {
    const blob = new Blob([WORKER_SOURCE], { type: 'text/javascript' });
    workerUrl = URL.createObjectURL(blob);
  } catch (err) {
    workerUrl = null;
  }
  return workerUrl;
}

/**
 * A match runner with a hard deadline. One evaluator per builder instance so
 * two fields cannot cancel each other's work.
 */
function createEvaluator(options) {
  const deadlineMs = (options && options.deadlineMs) || LIMITS.DEADLINE_MS;
  let worker = null;
  let seq = 0;
  const pending = new Map();

  function spawn() {
    if (workerSupported === false) return null;
    if (typeof Worker === 'undefined') { workerSupported = false; return null; }
    const url = getWorkerUrl();
    if (!url) { workerSupported = false; return null; }
    try {
      const w = new Worker(url);
      w.onmessage = (event) => {
        const data = event.data || {};
        const entry = pending.get(data.id);
        if (!entry) return;              // a stale answer from before a restart
        pending.delete(data.id);
        clearTimeout(entry.timer);
        entry.resolve({ ...data, via: 'worker' });
      };
      w.onerror = () => {
        // Resolve everything still waiting, or the builder would sit on a
        // promise that can never settle and stop updating entirely.
        pending.forEach((entry) => {
          clearTimeout(entry.timer);
          entry.resolve({ ok: false, error: 'WORKER_FAILED', via: 'guard' });
        });
        pending.clear();
        kill();
      };
      workerSupported = true;
      return w;
    } catch (err) {
      workerSupported = false;
      return null;
    }
  }

  function kill() {
    if (worker) { try { worker.terminate(); } catch (err) { /* already gone */ } }
    worker = null;
  }

  function evaluate(request) {
    const pattern = String(request.pattern || '');
    const flags = String(request.flags || '');
    const sample = String(request.sample || '');

    if (pattern.length > LIMITS.PATTERN) {
      return Promise.resolve({ ok: false, error: 'PATTERN_TOO_LONG', via: 'guard' });
    }

    if (!worker) worker = spawn();

    if (!worker) {
      // Fallback: same routine, main thread, between-call deadline only.
      // See the section comment for exactly what this does and does not stop.
      const result = runMatch(pattern, flags, sample, LIMITS.MATCHES, LIMITS.MATCH_CHARS, LIMITS.FALLBACK_MS);
      result.via = 'main';
      return Promise.resolve(result);
    }

    seq += 1;
    const id = seq;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        // The worker is wedged inside exec(); terminating is the only exit.
        kill();
        resolve({ ok: true, matches: [], truncated: false, timedOut: true, elapsed: deadlineMs, via: 'worker-terminated' });
      }, deadlineMs);
      pending.set(id, { resolve, timer });
      try {
        worker.postMessage({
          id,
          pattern,
          flags,
          sample,
          maxMatches: LIMITS.MATCHES,
          maxMatchChars: LIMITS.MATCH_CHARS,
        });
      } catch (err) {
        clearTimeout(timer);
        pending.delete(id);
        kill();
        resolve({ ok: false, error: String(err && err.message ? err.message : err), via: 'guard' });
      }
    });
  }

  return {
    evaluate,
    dispose() {
      pending.forEach((entry) => clearTimeout(entry.timer));
      pending.clear();
      kill();
    },
  };
}

/* -----------------------------------------------------------------------------
   7. STYLES

   One namespaced block, built only on the Material Design 3 tokens from
   tokens.css. It is injected rather than living in app.css so that the builder
   is a genuine drop-in: it renders correctly whatever else is or is not on the
   page. Any `.mdrx-*` rule may be overridden by app.css.
   ----------------------------------------------------------------------------- */

const STYLE_ID = 'mdrx-styles';

const STYLE_TEXT = `
/* The builder establishes its own box model rather than relying on a global
   reset in app.css. Without this a width:100% textarea with padding overflows
   its column, and the whole panel grows a horizontal scrollbar at narrow
   widths — a drop-in module must not depend on another stylesheet to lay out
   correctly. */
.mdrx-pop, .mdrx-pop *, .mdrx-pop *::before, .mdrx-pop *::after,
.mdrx-trigger, .mdrx-mode { box-sizing: border-box; }

/* The [hidden] attribute is only display:none in the user-agent stylesheet, so
   any author rule that sets display — and several rules below set flex — wins
   against it. Without this, setting .hidden = true on a flex row does nothing
   at all and the element stays on screen. */
.mdrx-pop [hidden] { display: none !important; }

.mdrx-trigger,
.mdrx-mode {
  flex: none;
  display: inline-grid;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  border: 0;
  border-radius: var(--md-sys-shape-corner-full, 9999px);
  background: transparent;
  color: var(--md-sys-color-on-surface-variant, #53433E);
  font: inherit;
  cursor: pointer;
  transition: background var(--md-sys-motion-duration-short4, 200ms) var(--md-sys-motion-standard, ease);
}
.mdrx-mode {
  font-family: var(--md-ref-typeface-mono, monospace);
  font-size: 0.8125rem;
  font-weight: 600;
}
.mdrx-trigger:hover,
.mdrx-mode:hover { background: var(--ripple, rgba(0,0,0,.08)); }
.mdrx-mode[aria-pressed="true"] {
  background: var(--md-sys-color-secondary-container, #FFDBCF);
  color: var(--md-sys-color-on-secondary-container, #2C160D);
}
.mdrx-trigger[aria-expanded="true"] {
  background: var(--md-sys-color-secondary-container, #FFDBCF);
  color: var(--md-sys-color-on-secondary-container, #2C160D);
}
.mdrx-trigger svg { width: 1.25rem; height: 1.25rem; fill: currentColor; }

.mdrx-pop {
  position: fixed;
  z-index: 60;
  width: min(29rem, calc(100vw - 1.5rem));
  display: flex;
  flex-direction: column;
  border-radius: var(--md-sys-shape-corner-xl, 1.75rem);
  background: var(--md-sys-color-surface-container-high, #F6E4DE);
  color: var(--md-sys-color-on-surface, #221A17);
  border: 1px solid var(--md-sys-color-outline-variant, #D8C2BB);
  box-shadow: var(--md-sys-elevation-level4, 0 12px 28px rgba(0,0,0,.16));
  font-family: var(--md-ref-typeface-plain, system-ui, sans-serif);
  font-size: var(--md-sys-typescale-body-medium-size, 0.875rem);
  overflow: hidden;
  animation: mdrx-rise var(--md-sys-motion-duration-medium2, 300ms) var(--md-sys-motion-emphasized-decel, ease-out) both;
}
@keyframes mdrx-rise {
  from { opacity: 0; transform: translateY(0.5rem) scale(.985); }
  to   { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .mdrx-pop { animation: none; }
  .mdrx-trigger, .mdrx-mode, .mdrx-chip, .mdrx-btn { transition: none; }
}

.mdrx-head {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.875rem 0.625rem 0.75rem 1.25rem;
  background: var(--md-sys-color-surface-container-highest, #F1DED8);
  border-bottom: 1px solid var(--md-sys-color-outline-variant, #D8C2BB);
}
.mdrx-head-text { flex: 1; min-width: 0; }
.mdrx-title-row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.mdrx-title {
  font-size: var(--md-sys-typescale-title-medium-size, 1rem);
  font-weight: 600;
  line-height: 1.3;
}
/* The badge belongs on the title line. Left as a sibling of the whole text
   block it centred itself against a multi-line subtitle and floated in the
   middle of the prose. */
.mdrx-badge {
  flex: none;
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 0.25rem 0.625rem;
  border-radius: var(--md-sys-shape-corner-full, 9999px);
  background: var(--md-sys-color-tertiary-container, #F5E0A7);
  color: var(--md-sys-color-on-tertiary-container, #231B00);
}
.mdrx-sub {
  margin-top: 0.25rem;
  font-size: var(--md-sys-typescale-body-small-size, 0.75rem);
  line-height: 1.45;
  color: var(--md-sys-color-on-surface-variant, #53433E);
}
.mdrx-sec { display: block; opacity: .82; }

.mdrx-body {
  padding: 0.875rem 1.25rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.mdrx-seg {
  display: inline-flex;
  border: 1px solid var(--md-sys-color-outline, #85736D);
  border-radius: var(--md-sys-shape-corner-full, 9999px);
  overflow: hidden;
  align-self: flex-start;
}
.mdrx-seg button {
  border: 0;
  background: transparent;
  color: var(--md-sys-color-on-surface, #221A17);
  font: inherit;
  font-size: 0.8125rem;
  padding: 0.4375rem 0.9375rem;
  cursor: pointer;
  transition: background var(--md-sys-motion-duration-short4, 200ms) var(--md-sys-motion-standard, ease);
}
.mdrx-seg button:hover { background: var(--ripple, rgba(0,0,0,.08)); }
.mdrx-seg button[aria-pressed="true"] {
  background: var(--md-sys-color-secondary-container, #FFDBCF);
  color: var(--md-sys-color-on-secondary-container, #2C160D);
  font-weight: 600;
}
.mdrx-seg button + button { border-left: 1px solid var(--md-sys-color-outline-variant, #D8C2BB); }

.mdrx-note {
  font-size: var(--md-sys-typescale-body-small-size, 0.75rem);
  line-height: 1.45;
  color: var(--md-sys-color-on-surface-variant, #53433E);
}

.mdrx-field {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  min-height: 3rem;
  padding: 0 0.75rem;
  border-radius: var(--md-sys-shape-corner-m, 0.75rem);
  border: 2px solid var(--md-sys-color-primary, #8F4C34);
  background: var(--md-sys-color-surface-container-lowest, #FFFFFF);
  font-family: var(--md-ref-typeface-mono, monospace);
}
.mdrx-field.is-invalid { border-color: var(--md-sys-color-error, #BA1A1A); }
.mdrx-field .mdrx-affix {
  color: var(--md-sys-color-on-surface-variant, #53433E);
  font-size: 0.875rem;
  white-space: nowrap;
}
.mdrx-field input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--md-sys-color-on-surface, #221A17);
  font-family: inherit;
  font-size: 0.875rem;
  padding: 0.625rem 0;
}
/* The focus ring belongs on the whole field, not on the bare input inside it:
   a ring drawn around the input alone reads as a second box nested in the
   first. The delimiter and flag affixes are part of the control. */
.mdrx-field input:focus-visible { outline: none; }
.mdrx-field:focus-within {
  outline: var(--md-sys-focus-ring-width, 3px) solid var(--md-sys-focus-ring-color, currentColor);
  outline-offset: var(--md-sys-focus-ring-offset, 2px);
}

.mdrx-row { display: flex; flex-wrap: wrap; gap: 0.375rem; align-items: center; }

.mdrx-flag {
  width: 2.25rem;
  height: 2.25rem;
  border: 1px solid var(--md-sys-color-outline-variant, #D8C2BB);
  border-radius: var(--md-sys-shape-corner-full, 9999px);
  background: transparent;
  color: var(--md-sys-color-on-surface-variant, #53433E);
  font-family: var(--md-ref-typeface-mono, monospace);
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--md-sys-motion-duration-short4, 200ms) var(--md-sys-motion-standard, ease);
}
.mdrx-flag:hover { background: var(--ripple, rgba(0,0,0,.08)); }
.mdrx-flag[aria-pressed="true"] {
  background: var(--md-sys-color-primary, #8F4C34);
  color: var(--md-sys-color-on-primary, #FFFFFF);
  border-color: transparent;
}

.mdrx-chip {
  min-height: 2rem;
  padding: 0 0.75rem;
  border: 1px solid var(--md-sys-color-outline-variant, #D8C2BB);
  border-radius: var(--md-sys-shape-corner-full, 9999px);
  background: transparent;
  color: var(--md-sys-color-on-surface-variant, #53433E);
  font-family: var(--md-ref-typeface-mono, monospace);
  font-size: 0.75rem;
  cursor: pointer;
  transition: background var(--md-sys-motion-duration-short3, 150ms) var(--md-sys-motion-standard, ease);
}
.mdrx-chip:hover { background: var(--ripple, rgba(0,0,0,.08)); }
.mdrx-chip[aria-pressed="true"] {
  background: var(--md-sys-color-secondary-container, #FFDBCF);
  color: var(--md-sys-color-on-secondary-container, #2C160D);
  border-color: transparent;
}

.mdrx-part {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding-right: 0.125rem;
}
.mdrx-part[data-selected="true"] {
  background: var(--md-sys-color-secondary-container, #FFDBCF);
  color: var(--md-sys-color-on-secondary-container, #2C160D);
  border-color: transparent;
}
/* The label must fill the chip, or the only clickable target is the glyph
   itself — which for an end-anchor part is about seven pixels wide. */
.mdrx-part-label {
  align-self: stretch;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2rem;
  min-width: 1.5rem;
  padding: 0 0.125rem;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.mdrx-part-x {
  width: 1.5rem;
  height: 1.5rem;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--md-sys-shape-corner-full, 9999px);
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.875rem;
  line-height: 1;
  cursor: pointer;
}
.mdrx-part-x:hover { background: var(--ripple, rgba(0,0,0,.08)); }
.mdrx-part-x:disabled { opacity: var(--md-sys-state-disabled-content-opacity, .38); cursor: default; }

.mdrx-sub-label {
  font-size: var(--md-sys-typescale-label-medium-size, 0.75rem);
  font-weight: 600;
  color: var(--md-sys-color-on-surface-variant, #53433E);
  margin-bottom: 0.25rem;
}

.mdrx-details > summary {
  cursor: pointer;
  list-style: none;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0;
  font-size: var(--md-sys-typescale-label-large-size, 0.875rem);
  font-weight: 600;
  color: var(--md-sys-color-on-surface, #221A17);
  border-radius: var(--md-sys-shape-corner-xs, 0.25rem);
}
.mdrx-details > summary::-webkit-details-marker { display: none; }
.mdrx-details > summary::before {
  content: "";
  width: 0; height: 0;
  border-left: 0.3125rem solid currentColor;
  border-top: 0.3125rem solid transparent;
  border-bottom: 0.3125rem solid transparent;
  transition: transform var(--md-sys-motion-duration-short3, 150ms) var(--md-sys-motion-standard, ease);
}
.mdrx-details[open] > summary::before { transform: rotate(90deg); }
.mdrx-details > div { padding: 0.25rem 0 0.5rem; display: flex; flex-direction: column; gap: 0.5rem; }
.mdrx-details ul { margin: 0; padding-left: 1.125rem; display: flex; flex-direction: column; gap: 0.25rem; }
.mdrx-details li { font-size: 0.75rem; line-height: 1.45; color: var(--md-sys-color-on-surface-variant, #53433E); }

.mdrx-input {
  flex: 1;
  min-width: 6rem;
  height: 2.25rem;
  padding: 0 0.625rem;
  border-radius: var(--md-sys-shape-corner-s, 0.5rem);
  border: 1px solid var(--md-sys-color-outline, #85736D);
  background: var(--md-sys-color-surface-container-lowest, #FFFFFF);
  color: var(--md-sys-color-on-surface, #221A17);
  font: inherit;
  font-size: 0.8125rem;
}
.mdrx-check { display: inline-flex; align-items: center; gap: 0.375rem; font-size: 0.75rem; color: var(--md-sys-color-on-surface-variant, #53433E); }
.mdrx-check input { accent-color: var(--md-sys-color-primary, #8F4C34); width: 1rem; height: 1rem; }

.mdrx-sample {
  width: 100%;
  min-height: 4.5rem;
  max-height: 10rem;
  resize: vertical;
  padding: 0.625rem 0.75rem;
  border-radius: var(--md-sys-shape-corner-m, 0.75rem);
  border: 1px solid var(--md-sys-color-outline-variant, #D8C2BB);
  background: var(--md-sys-color-surface-container-lowest, #FFFFFF);
  color: var(--md-sys-color-on-surface, #221A17);
  font-family: var(--md-ref-typeface-mono, monospace);
  font-size: 0.75rem;
  line-height: 1.6;
}
.mdrx-preview {
  margin-top: 0.5rem;
  padding: 0.625rem 0.75rem;
  border-radius: var(--md-sys-shape-corner-m, 0.75rem);
  border: 1px solid var(--md-sys-color-outline-variant, #D8C2BB);
  background: var(--md-sys-color-surface-container-lowest, #FFFFFF);
  font-family: var(--md-ref-typeface-mono, monospace);
  font-size: 0.75rem;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 9rem;
  overflow: auto;
}
.mdrx-preview mark {
  background: var(--md-sys-color-primary-container, #FFDBCF);
  color: var(--md-sys-color-on-primary-container, #3A0B00);
  border-radius: var(--md-sys-shape-corner-xs, 0.25rem);
  padding: 0.0625rem 0;
}
.mdrx-preview mark.alt {
  background: var(--md-sys-color-tertiary-container, #F5E0A7);
  color: var(--md-sys-color-on-tertiary-container, #231B00);
}
.mdrx-zw {
  display: inline-block;
  width: 0.125rem;
  height: 0.875rem;
  vertical-align: -0.125rem;
  background: var(--md-sys-color-error, #BA1A1A);
}

.mdrx-table { width: 100%; border-collapse: collapse; font-size: 0.6875rem; }
.mdrx-table th, .mdrx-table td {
  text-align: left;
  padding: 0.25rem 0.375rem;
  border-bottom: 1px solid var(--md-sys-color-outline-variant, #D8C2BB);
  vertical-align: top;
  font-family: var(--md-ref-typeface-mono, monospace);
  word-break: break-word;
}
.mdrx-table th { color: var(--md-sys-color-on-surface-variant, #53433E); font-weight: 600; }
.mdrx-table-wrap { max-height: 9rem; overflow: auto; }

.mdrx-status {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: var(--md-sys-typescale-body-small-size, 0.75rem);
  line-height: 1.45;
  color: var(--md-sys-color-on-surface-variant, #53433E);
}
.mdrx-status svg { flex: none; width: 1rem; height: 1rem; margin-top: 0.125rem; fill: currentColor; }
.mdrx-status.is-ok { color: var(--md-sys-color-success, #1F6B3C); }
.mdrx-status.is-error { color: var(--md-sys-color-error, #BA1A1A); }

.mdrx-foot {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  border-top: 1px solid var(--md-sys-color-outline-variant, #D8C2BB);
  background: var(--md-sys-color-surface-container, #FCEAE4);
}
.mdrx-btn {
  min-height: 2.5rem;
  padding: 0 1rem;
  border-radius: var(--md-sys-shape-corner-full, 9999px);
  border: 1px solid var(--md-sys-color-outline, #85736D);
  background: transparent;
  color: var(--md-sys-color-on-surface, #221A17);
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--md-sys-motion-duration-short4, 200ms) var(--md-sys-motion-standard, ease);
}
.mdrx-btn:hover { background: var(--ripple, rgba(0,0,0,.08)); }
.mdrx-btn.is-filled {
  border-color: transparent;
  background: var(--md-sys-color-primary, #8F4C34);
  color: var(--md-sys-color-on-primary, #FFFFFF);
}
.mdrx-btn.is-filled:hover { filter: brightness(1.06); }
.mdrx-btn.is-quiet { border-color: transparent; }

.mdrx-pop :focus-visible,
.mdrx-trigger:focus-visible,
.mdrx-mode:focus-visible {
  outline: var(--md-sys-focus-ring-width, 3px) solid var(--md-sys-focus-ring-color, currentColor);
  outline-offset: var(--md-sys-focus-ring-offset, 2px);
}

.mdrx-sr {
  position: absolute;
  width: 1px; height: 1px;
  margin: -1px; padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
`;

function ensureStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE_TEXT;
  // Insert as early as possible so that app.css, declared later in <head>,
  // wins any tie on specificity.
  const head = document.head || document.documentElement;
  head.insertBefore(style, head.firstChild);
}

/* -----------------------------------------------------------------------------
   8. SMALL DOM HELPERS AND ICONS

   Icons are inline SVG. The mockup uses the Material Symbols Rounded font,
   which cannot ship here — the site makes no font-service request and binary
   font files cannot be authored by hand — so every glyph is drawn as a path.
   ----------------------------------------------------------------------------- */

const SVG_NS = 'http://www.w3.org/2000/svg';

const ICON_PATHS = {
  // "construction" — the mockup's affordance for the builder.
  build: 'M13.8 12.2 20 18.4 18.4 20l-6.2-6.2-4 4 1.4 1.4-1.4 1.4-1.4-1.4L5 20.8 3.2 19l1.4-1.4-1.4-1.4L4.6 14.8 6 16.2l4-4L3.8 6H2V4h4l7.8 7.8ZM16 4h4v2h-1.6l-2.6 2.6-1.4-1.4L17 4.6V4Z',
  close: 'M6.4 19 5 17.6 10.6 12 5 6.4 6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19Z',
  ok: 'M10 16.4 5.6 12l1.4-1.4 3 3 6.6-6.6L18 8.4 10 16.4Z',
  info: 'M11 17h2v-6h-2v6Zm1-8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm0 13a10 10 0 1 1 0-20 10 10 0 0 1 0 20Z',
  error: 'M12 17a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm-1-4h2V7h-2v6Zm1 9a10 10 0 1 1 0-20 10 10 0 0 1 0 20Z',
  warn: 'M1 21 12 2l11 19H1Zm11-3a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm-1-3h2v-5h-2v5Z',
};

function icon(name, size) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (size) { svg.style.width = size; svg.style.height = size; }
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', ICON_PATHS[name] || ICON_PATHS.info);
  svg.appendChild(path);
  return svg;
}

function el(tag, className, props) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (props) Object.assign(node, props);
  return node;
}

/** Copy text, with a fallback for contexts where the async API is refused. */
function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
    return navigator.clipboard.writeText(text).then(() => true, () => legacyCopy(text));
  }
  return Promise.resolve(legacyCopy(text));
}

function legacyCopy(text) {
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    document.body.appendChild(area);
    area.select();
    const done = document.execCommand('copy');
    document.body.removeChild(area);
    return done;
  } catch (err) {
    return false;
  }
}

/** Ask ui.js for a toast, without depending on it existing. */
function toast(message, kind) {
  document.dispatchEvent(new CustomEvent('md:toast', {
    bubbles: true,
    detail: { title: t('title'), body: message, kind: kind || 'info' },
  }));
}

/* -----------------------------------------------------------------------------
   9. PERSISTENCE

   Mode, pattern and flags are remembered per field. THE SAMPLE TEXT IS NOT.
   People paste genuinely private things into pattern testers — that is what a
   pattern tester is for — so the sample lives in memory for the life of the
   tab and nowhere else. The interface says this out loud rather than leaving
   the user to guess.
   ----------------------------------------------------------------------------- */

function loadState(key) {
  if (!key) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

function saveState(key, state) {
  if (!key) return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify({
      mode: state.mode,
      pattern: state.pattern,
      flags: state.flags,
    }));
  } catch (err) {
    /* Private browsing or a full quota. Losing a remembered pattern is not
       worth breaking the builder over. */
  }
}

/* -----------------------------------------------------------------------------
   10. THE BUILDER INSTANCE
   ----------------------------------------------------------------------------- */

/**
 * Mount a regex builder anchored beside one input.
 *
 * @param {HTMLInputElement} inputEl  the search field this builder belongs to
 * @param {Object} [options]
 * @param {HTMLElement} [options.trigger]     an existing button to open it
 * @param {HTMLElement} [options.modeToggle]  an existing plain/regex toggle
 * @param {boolean} [options.createTrigger=true]
 * @param {string}  [options.key]      stable persistence key (defaults to the
 *                                     element id; persistence is skipped if
 *                                     neither exists, rather than written to
 *                                     an unstable key)
 * @param {string}  [options.sample]   starting sample text
 * @param {string}  [options.flags]    starting flags, default "gi"
 * @param {string}  [options.dialect]  overrides the engine/dialect line for a
 *                                     call site whose search runs elsewhere
 * @param {Function}[options.onChange] called with the field state on change
 * @returns {Object} controller
 */
function attachRegexBuilder(inputEl, options) {
  if (!inputEl || inputEl.nodeType !== 1) throw new TypeError('attachRegexBuilder needs an element');
  if (REGISTRY.has(inputEl)) return REGISTRY.get(inputEl);

  ensureStyles();

  const opts = options || {};
  const storageKey = opts.key || inputEl.id || (inputEl.name || '');
  const evaluator = createEvaluator({ deadlineMs: opts.deadlineMs });
  const listeners = new Set();
  if (typeof opts.onChange === 'function') listeners.add(opts.onChange);

  const saved = loadState(storageKey);

  const state = {
    mode: (saved && saved.mode === 'regex') ? 'regex' : 'plain',   // plain is the default, always
    pattern: (saved && typeof saved.pattern === 'string') ? saved.pattern : '',
    flags: (saved && typeof saved.flags === 'string') ? saved.flags : (opts.flags || DEFAULT_FLAGS),
    sample: typeof opts.sample === 'string' ? opts.sample : DEFAULT_SAMPLE,
    lastValidPattern: '',
    error: '',
    parts: { ok: true, tokens: [] },
    selectedPart: -1,
    lazy: false,
    open: false,
    escapeHintShown: false,
  };

  /* ---- trigger and mode toggle ------------------------------------------ */

  let trigger = opts.trigger || null;
  let modeToggle = opts.modeToggle || null;

  // The affordances are created beside the field itself, not in a menu
  // elsewhere. If the field is detached from the document there is nowhere to
  // put them, so they are simply not created rather than throwing.
  const canInsert = Boolean(inputEl.parentElement);
  if (!modeToggle && opts.createModeToggle !== false && canInsert) {
    modeToggle = el('button', 'mdrx-mode');
    modeToggle.type = 'button';
    modeToggle.textContent = '.*';
    inputEl.insertAdjacentElement('afterend', modeToggle);
  }
  if (!trigger && opts.createTrigger !== false && canInsert) {
    trigger = el('button', 'mdrx-trigger');
    trigger.type = 'button';
    trigger.appendChild(icon('build'));
    (modeToggle || inputEl).insertAdjacentElement('afterend', trigger);
  }
  if (trigger) {
    if (!trigger.classList.contains('mdrx-trigger')) trigger.classList.add('mdrx-trigger');
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-expanded', 'false');
  }
  if (modeToggle) {
    if (!modeToggle.classList.contains('mdrx-mode')) modeToggle.classList.add('mdrx-mode');
    modeToggle.setAttribute('aria-pressed', String(state.mode === 'regex'));
  }

  /* ---- popover skeleton -------------------------------------------------- */

  const popId = nextId('mdrx-pop');
  const pop = el('div', 'mdrx-pop');
  pop.id = popId;
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-modal', 'false');
  pop.hidden = true;

  const head = el('div', 'mdrx-head');
  const headText = el('div', 'mdrx-head-text');
  const titleRow = el('div', 'mdrx-title-row');
  const titleEl = el('h2', 'mdrx-title');
  titleEl.id = popId + '-title';
  const badge = el('span', 'mdrx-badge');
  titleRow.append(titleEl, badge);
  const subEl = el('p', 'mdrx-sub');
  headText.append(titleRow, subEl);
  const closeBtn = el('button', 'mdrx-trigger');
  closeBtn.type = 'button';
  closeBtn.appendChild(icon('close'));
  head.append(headText, closeBtn);
  pop.setAttribute('aria-labelledby', titleEl.id);

  const body = el('div', 'mdrx-body');

  /* Mode row --------------------------------------------------------------- */
  const modeRow = el('div');
  const seg = el('div', 'mdrx-seg');
  seg.setAttribute('role', 'group');
  const segPlain = el('button', null, { type: 'button' });
  const segRegex = el('button', null, { type: 'button' });
  seg.append(segPlain, segRegex);
  const modeNote = el('p', 'mdrx-note');
  const escapeRow = el('div', 'mdrx-row');
  const escapeNote = el('span', 'mdrx-note');
  // Outlined, not quiet: a borderless button beside a paragraph of prose reads
  // as a bold heading rather than as something you can press.
  const escapeBtn = el('button', 'mdrx-btn', { type: 'button' });
  escapeRow.append(escapeNote, escapeBtn);
  escapeRow.hidden = true;
  modeRow.append(seg, modeNote, escapeRow);
  modeNote.style.marginTop = '0.5rem';

  /* Pattern field ---------------------------------------------------------- */
  const patternWrap = el('div');
  const patternLabel = el('div', 'mdrx-sub-label');
  const field = el('div', 'mdrx-field');
  const slash1 = el('span', 'mdrx-affix', { textContent: '/' });
  const patternInput = el('input');
  patternInput.type = 'text';
  patternInput.spellcheck = false;
  patternInput.autocomplete = 'off';
  patternInput.id = popId + '-pattern';
  patternInput.setAttribute('maxlength', String(LIMITS.PATTERN));
  const slash2 = el('span', 'mdrx-affix');
  const validIcon = el('span', 'mdrx-affix');
  field.append(slash1, patternInput, slash2, validIcon);
  patternLabel.setAttribute('id', popId + '-pattern-label');
  patternInput.setAttribute('aria-labelledby', patternLabel.id);
  patternWrap.append(patternLabel, field);

  /* Flags ------------------------------------------------------------------ */
  const flagsWrap = el('div');
  const flagsLabel = el('div', 'mdrx-sub-label');
  const flagsRow = el('div', 'mdrx-row');
  const flagButtons = FLAGS.map(({ flag, key }) => {
    const btn = el('button', 'mdrx-flag', { type: 'button' });
    btn.textContent = flag;
    btn.dataset.flag = flag;
    btn.dataset.key = key;
    btn.addEventListener('click', () => toggleFlag(flag));
    flagsRow.appendChild(btn);
    return btn;
  });
  const flagsDetails = el('details', 'mdrx-details');
  const flagsSummary = el('summary');
  const flagsList = el('ul');
  const flagItems = FLAGS.map(() => {
    const li = el('li');
    flagsList.appendChild(li);
    return li;
  });
  const flagsDetailsBody = el('div');
  flagsDetailsBody.appendChild(flagsList);
  flagsDetails.append(flagsSummary, flagsDetailsBody);
  flagsWrap.append(flagsLabel, flagsRow, flagsDetails);

  /* Guided construction ---------------------------------------------------- */
  const guided = el('details', 'mdrx-details');
  guided.open = true;
  const guidedSummary = el('summary');
  const guidedBody = el('div');
  guided.append(guidedSummary, guidedBody);

  // literal
  const litLabel = el('div', 'mdrx-sub-label');
  const litRow = el('div', 'mdrx-row');
  const litInput = el('input', 'mdrx-input', { type: 'text' });
  litInput.spellcheck = false;
  const litBtn = el('button', 'mdrx-btn', { type: 'button' });
  litRow.append(litInput, litBtn);

  // classes
  const clsLabel = el('div', 'mdrx-sub-label');
  const clsRow = el('div', 'mdrx-row');
  const CLASS_CHIPS = [
    { source: '\\d', hint: 'a digit 0-9' },
    { source: '\\D', hint: 'anything that is not a digit' },
    { source: '\\w', hint: 'a letter, digit or underscore' },
    { source: '\\W', hint: 'anything that is not a letter, digit or underscore' },
    { source: '\\s', hint: 'any whitespace' },
    { source: '\\S', hint: 'anything that is not whitespace' },
    { source: '.', hint: 'any character except a line break (unless the s flag is on)' },
  ];
  CLASS_CHIPS.forEach((chip) => {
    const btn = el('button', 'mdrx-chip', { type: 'button' });
    btn.textContent = chip.source;
    btn.title = chip.hint;
    btn.addEventListener('click', () => insertSource(chip.source));
    clsRow.appendChild(btn);
  });
  const setRow = el('div', 'mdrx-row');
  const setInput = el('input', 'mdrx-input', { type: 'text' });
  setInput.spellcheck = false;
  const setNeg = el('label', 'mdrx-check');
  const setNegBox = el('input', null, { type: 'checkbox' });
  const setNegText = el('span');
  setNeg.append(setNegBox, setNegText);
  const setBtn = el('button', 'mdrx-btn', { type: 'button' });
  setRow.append(setInput, setNeg, setBtn);

  // anchors
  const ancLabel = el('div', 'mdrx-sub-label');
  const ancRow = el('div', 'mdrx-row');
  [
    { source: '^', hint: 'start of the text (or of a line with the m flag)' },
    { source: '$', hint: 'end of the text (or of a line with the m flag)' },
    { source: '\\b', hint: 'a word boundary' },
    { source: '\\B', hint: 'not a word boundary' },
  ].forEach((chip) => {
    const btn = el('button', 'mdrx-chip', { type: 'button' });
    btn.textContent = chip.source;
    btn.title = chip.hint;
    btn.addEventListener('click', () => insertSource(chip.source));
    ancRow.appendChild(btn);
  });

  // groups + alternation
  const grpLabel = el('div', 'mdrx-sub-label');
  const grpRow = el('div', 'mdrx-row');
  const grpCap = el('button', 'mdrx-chip', { type: 'button' });
  grpCap.textContent = '( … )';
  grpCap.addEventListener('click', () => wrapOrInsert('(', ')'));
  const grpNon = el('button', 'mdrx-chip', { type: 'button' });
  grpNon.textContent = '(?: … )';
  grpNon.addEventListener('click', () => wrapOrInsert('(?:', ')'));
  const grpNameInput = el('input', 'mdrx-input', { type: 'text' });
  grpNameInput.spellcheck = false;
  grpNameInput.style.maxWidth = '9rem';
  const grpNamed = el('button', 'mdrx-chip', { type: 'button' });
  grpNamed.textContent = '(?<name> … )';
  grpNamed.addEventListener('click', () => {
    const name = grpNameInput.value.trim();
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) { grpNameInput.focus(); return; }
    wrapOrInsert('(?<' + name + '>', ')');
  });
  const altChip = el('button', 'mdrx-chip', { type: 'button' });
  altChip.textContent = '|';
  altChip.addEventListener('click', () => insertSource('|'));
  grpRow.append(grpCap, grpNon, grpNameInput, grpNamed, altChip);

  // quantifiers
  const qLabel = el('div', 'mdrx-sub-label');
  const qRow = el('div', 'mdrx-row');
  const QUANTS = [
    { source: '*', hint: 'zero or more' },
    { source: '+', hint: 'one or more' },
    { source: '?', hint: 'zero or one' },
    { source: '{2}', hint: 'exactly n — edit the number in the pattern' },
    { source: '{2,5}', hint: 'between n and m' },
    { source: '{2,}', hint: 'n or more' },
  ];
  QUANTS.forEach((q) => {
    const btn = el('button', 'mdrx-chip', { type: 'button' });
    btn.textContent = q.source;
    btn.title = q.hint;
    btn.addEventListener('click', () => applyQuantifier(q.source));
    qRow.appendChild(btn);
  });
  const lazyLabel = el('label', 'mdrx-check');
  const lazyBox = el('input', null, { type: 'checkbox' });
  const lazyText = el('span');
  lazyLabel.append(lazyBox, lazyText);
  qRow.appendChild(lazyLabel);
  const lazyNote = el('p', 'mdrx-note');

  guidedBody.append(
    litLabel, litRow,
    clsLabel, clsRow, setRow,
    ancLabel, ancRow,
    grpLabel, grpRow,
    qLabel, qRow, lazyNote,
  );

  /* Parts ------------------------------------------------------------------ */
  const partsWrap = el('div');
  const partsLabel = el('div', 'mdrx-sub-label');
  const partsRow = el('div', 'mdrx-row');
  const partsMsg = el('p', 'mdrx-note');
  partsWrap.append(partsLabel, partsRow, partsMsg);

  /* Sample ----------------------------------------------------------------- */
  const sampleDetails = el('details', 'mdrx-details');
  sampleDetails.open = true;
  const sampleSummary = el('summary');
  const sampleBody = el('div');
  const sampleArea = el('textarea', 'mdrx-sample');
  sampleArea.spellcheck = false;
  sampleArea.value = state.sample;
  const sampleNote = el('p', 'mdrx-note');
  const preview = el('div', 'mdrx-preview');
  preview.setAttribute('aria-live', 'off');
  preview.setAttribute('role', 'group');
  preview.tabIndex = 0;   // long output must be reachable by keyboard to scroll
  const capsLabel = el('div', 'mdrx-sub-label');
  const capsWrap = el('div', 'mdrx-table-wrap');
  sampleBody.append(sampleArea, sampleNote, preview, capsLabel, capsWrap);
  sampleDetails.append(sampleSummary, sampleBody);

  /* Status ----------------------------------------------------------------- */
  const status = el('p', 'mdrx-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const statusIcon = el('span');
  const statusText = el('span');
  status.append(statusIcon, statusText);

  const riskLine = el('p', 'mdrx-status');
  const riskIcon = el('span');
  const riskText = el('span');
  riskLine.append(riskIcon, riskText);
  riskLine.hidden = true;

  // Transient notices ("copied", "wrapped in a group") get their own line.
  // Putting them in the status line would have meant a passing remark hiding
  // the match count or an error for as long as it lingered.
  const notice = el('p', 'mdrx-status');
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  const noticeIcon = el('span');
  const noticeText = el('span');
  notice.append(noticeIcon, noticeText);
  notice.hidden = true;

  body.append(modeRow, patternWrap, flagsWrap, guided, partsWrap, sampleDetails, status, riskLine, notice);

  /* Footer ----------------------------------------------------------------- */
  const foot = el('div', 'mdrx-foot');
  const copyPatternBtn = el('button', 'mdrx-btn', { type: 'button' });
  const copyLiteralBtn = el('button', 'mdrx-btn is-filled', { type: 'button' });
  const resetBtn = el('button', 'mdrx-btn is-quiet', { type: 'button' });
  foot.append(copyPatternBtn, copyLiteralBtn, resetBtn);

  pop.append(head, body, foot);

  /* ---- pattern / query synchronisation ---------------------------------- */

  /**
   * In regex mode the field's value IS the pattern: two views of one string,
   * which is what makes the synchronisation genuinely bidirectional rather
   * than a copy that drifts. In plain mode the field holds the query and the
   * effective pattern is that query escaped, so the tester shows the user
   * exactly what "plain text" means for their input.
   */
  function effectivePattern() {
    return state.mode === 'regex' ? state.pattern : escapeLiteral(inputEl.value);
  }

  function effectiveFlags() {
    // Plain text is case-insensitive and global: what a person means by
    // "find this text". The flag chips stay visible so the behaviour is not
    // a secret, they just do not apply until regex mode is on.
    return state.mode === 'regex' ? state.flags : 'gi';
  }

  function notify() {
    const payload = getState();
    listeners.forEach((fn) => {
      try { fn(payload); } catch (err) { /* a listener must not break the builder */ }
    });
  }

  function persist() { saveState(storageKey, state); }

  /* ---- pattern editing helpers ------------------------------------------ */

  /**
   * `source` names the view the change came from — 'raw' for the popover's
   * pattern editor, 'field' for the search field itself, undefined for a
   * programmatic change. The view a change came FROM is never written back
   * to, because doing so would move the caret to the end on every keystroke.
   * Every other view is always written, whoever has focus: an earlier version
   * of this keyed the decision off document.activeElement instead, which meant
   * a chip inserted while the editor had focus updated the state and left the
   * editor showing the old pattern.
   */
  function setPattern(next, source) {
    state.pattern = String(next == null ? '' : next).slice(0, LIMITS.PATTERN);
    state.selectedPart = -1;
    refresh(source);
    persist();
    notify();
  }

  /** Insert raw pattern source at the caret of the raw editor. */
  function insertSource(source) {
    ensureRegexMode();
    const start = patternInput.selectionStart == null ? patternInput.value.length : patternInput.selectionStart;
    const end = patternInput.selectionEnd == null ? start : patternInput.selectionEnd;
    const before = patternInput.value.slice(0, start);
    const after = patternInput.value.slice(end);
    const next = (before + source + after).slice(0, LIMITS.PATTERN);
    patternInput.value = next;
    const caret = Math.min(before.length + source.length, next.length);
    setPattern(next);
    patternInput.focus();
    try { patternInput.setSelectionRange(caret, caret); } catch (err) { /* not selectable */ }
  }

  /** Wrap the selection in a group, or insert an empty one with the caret inside. */
  function wrapOrInsert(open, close) {
    ensureRegexMode();
    const start = patternInput.selectionStart == null ? patternInput.value.length : patternInput.selectionStart;
    const end = patternInput.selectionEnd == null ? start : patternInput.selectionEnd;
    const value = patternInput.value;
    const inner = value.slice(start, end);
    const next = (value.slice(0, start) + open + inner + close + value.slice(end)).slice(0, LIMITS.PATTERN);
    patternInput.value = next;
    const caret = Math.min(start + open.length + inner.length, next.length);
    setPattern(next);
    patternInput.focus();
    try { patternInput.setSelectionRange(caret, caret); } catch (err) { /* not selectable */ }
  }

  /**
   * Apply a quantifier to the selected part when there is one, otherwise
   * insert it at the caret. A multi-character literal is wrapped in (?:…)
   * first, because `abc+` repeats only the c — and the interface says so
   * rather than quietly producing a pattern that means something else.
   */
  function applyQuantifier(base) {
    const source = base + (state.lazy ? '?' : '');
    if (state.parts.ok && state.selectedPart >= 0 && state.parts.tokens[state.selectedPart]) {
      const tokens = state.parts.tokens.slice();
      let token = tokens[state.selectedPart];
      if (token.kind === 'alternation') { insertSource(source); return; }
      // `abc+` repeats only the c, and `a*+` is a syntax error. Both cases are
      // fixed by wrapping first — and the interface says that it happened
      // rather than quietly producing a pattern that means something else.
      if ((token.kind === 'literal' && token.text.length > 1) || token.quant) {
        const inner = Object.assign({}, token);
        token = { kind: 'group', groupType: 'nonCapturing', name: null, number: null, children: [inner] };
        tokens[state.selectedPart] = token;
        setNotice(t('wrappedForQuantifier'), 'info');
      }
      token.quant = { source };
      const selected = state.selectedPart;
      setPattern(serializeTokens(tokens));
      state.selectedPart = selected;
      renderParts();
      return;
    }
    insertSource(source);
  }

  function ensureRegexMode() {
    if (state.mode !== 'regex') setMode('regex');
  }

  function setMode(mode, silent) {
    const next = mode === 'regex' ? 'regex' : 'plain';
    if (next === state.mode) return;
    const carried = inputEl.value;
    state.mode = next;
    if (next === 'regex') {
      // Preserve what the user typed rather than clearing or silently
      // escaping it. Offer the escape as one click instead of guessing.
      state.pattern = carried;
      patternInput.value = carried;
      state.escapeHintShown = /[\\^$.|?*+()[\]{}]/.test(carried) && carried.length > 0;
    } else {
      state.escapeHintShown = false;
    }
    inputEl.dataset.regexMode = next;
    if (modeToggle) modeToggle.setAttribute('aria-pressed', String(next === 'regex'));
    refresh();
    persist();
    if (!silent) notify();
  }

  function toggleFlag(flag) {
    ensureRegexMode();
    state.flags = state.flags.indexOf(flag) === -1
      ? (state.flags + flag).split('').sort().join('')
      : state.flags.split('').filter((f) => f !== flag).join('');
    refresh();
    persist();
    notify();
  }

  /* ---- rendering --------------------------------------------------------- */

  let noticeTimer = 0;

  /** Show a transient notice on its own line, never over the match status. */
  function setNotice(text, kind) {
    notice.hidden = false;
    notice.className = 'mdrx-status' + (kind === 'error' ? ' is-error' : '');
    noticeIcon.textContent = '';
    noticeIcon.appendChild(icon(kind === 'error' ? 'error' : 'info'));
    noticeText.textContent = text;
    window.clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(() => { notice.hidden = true; }, 5000);
  }

  function renderChrome() {
    setText(titleEl, 'title');
    if (opts.dialect) {
      subEl.textContent = opts.dialect;
    } else {
      setText(subEl, 'subtitle');
    }
    badge.textContent = t('nonModal');
    closeBtn.setAttribute('aria-label', t('close'));
    if (trigger) {
      trigger.setAttribute('aria-label', t('openBuilder'));
      trigger.title = t('openBuilder');
    }
    if (modeToggle) {
      modeToggle.setAttribute('aria-label', t('regexModeLabel'));
      modeToggle.title = t('regexModeLabel');
    }

    segPlain.textContent = t('modePlain');
    segRegex.textContent = t('modeRegex');
    setText(modeNote, 'plainDefault');
    escapeBtn.textContent = t('escapeAsLiteral');
    escapeNote.textContent = t('escapeHint');

    setText(patternLabel, 'patternLabel');
    patternInput.placeholder = t('patternPlaceholder');

    setText(flagsLabel, 'flagsLabel');
    setText(flagsSummary, 'flagsLegend');
    flagButtons.forEach((btn) => {
      btn.title = t(btn.dataset.key);
      btn.setAttribute('aria-label', t(btn.dataset.key));
    });
    flagItems.forEach((li, index) => { li.textContent = t(FLAGS[index].key); });

    setText(guidedSummary, 'guided');
    setText(litLabel, 'literal');
    litInput.placeholder = t('literalPlaceholder');
    litBtn.textContent = t('addLiteral');
    setText(clsLabel, 'classes');
    setInput.placeholder = t('customSetPlaceholder');
    setNegText.textContent = t('negate');
    setBtn.textContent = t('addSet');
    setText(ancLabel, 'anchors');
    setText(grpLabel, 'groups');
    grpNameInput.placeholder = t('groupNamePlaceholder');
    grpNameInput.setAttribute('aria-label', t('groupNamePlaceholder'));
    setText(qLabel, 'quantifiers');
    lazyText.textContent = t('lazy');
    lazyNote.textContent = t('lazyHint');

    setText(partsLabel, 'parts');
    setText(sampleSummary, 'sample');
    sampleArea.placeholder = t('samplePlaceholder');
    sampleArea.setAttribute('aria-label', t('samplePlaceholder'));
    setText(sampleNote, 'sampleNote');
    setText(capsLabel, 'captures');

    copyPatternBtn.textContent = t('copyPattern');
    copyLiteralBtn.textContent = t('copyLiteral');
    resetBtn.textContent = t('reset');
  }

  function renderMode(source) {
    const isRegex = state.mode === 'regex';
    segPlain.setAttribute('aria-pressed', String(!isRegex));
    segRegex.setAttribute('aria-pressed', String(isRegex));
    if (modeToggle) modeToggle.setAttribute('aria-pressed', String(isRegex));
    escapeRow.hidden = !(isRegex && state.escapeHintShown);
    patternInput.disabled = false;
    slash2.textContent = '/' + effectiveFlags();
    // The chips stay live in plain mode: they show the flags plain text
    // actually uses (gi), and pressing one is a legitimate way to say "I meant
    // regex" — toggleFlag switches the mode rather than refusing the click.
    // Disabling them would have been a contrast problem and a dead end.
    flagButtons.forEach((btn) => {
      btn.setAttribute('aria-pressed', String(effectiveFlags().indexOf(btn.dataset.flag) !== -1));
    });

    // The one place the two views are kept in step. In regex mode the field
    // and the raw editor hold the same string, which is what makes the
    // synchronisation genuinely bidirectional rather than a copy that drifts.
    const target = effectivePattern();
    if (source !== 'raw' && patternInput.value !== target) patternInput.value = target;
    if (isRegex && source !== 'field' && inputEl.value !== target) inputEl.value = target;
  }

  function renderParts() {
    partsRow.textContent = '';
    const parsed = state.parts;
    if (!parsed.ok) {
      partsMsg.hidden = false;
      setText(partsMsg, 'partsUnavailable', {
        reason: describeParseFailure(parsed),
        index: parsed.index,
      });
      return;
    }
    if (!parsed.tokens.length) {
      partsMsg.hidden = false;
      setText(partsMsg, 'partsEmpty');
      return;
    }
    partsMsg.hidden = false;
    setText(partsMsg, 'partsHint');

    parsed.tokens.forEach((token, index) => {
      const chipWrap = el('span', 'mdrx-chip mdrx-part');
      if (state.selectedPart === index) chipWrap.dataset.selected = 'true';
      const chip = el('button', 'mdrx-part-label', { type: 'button' });
      chip.textContent = describeToken(token);
      chip.setAttribute('aria-pressed', String(state.selectedPart === index));
      chip.addEventListener('click', () => {
        state.selectedPart = state.selectedPart === index ? -1 : index;
        renderParts();
      });

      const remove = el('button', 'mdrx-part-x', { type: 'button' });
      remove.textContent = '\u00D7';
      remove.setAttribute('aria-label', t('removePart') + ': ' + describeToken(token));
      remove.addEventListener('click', (event) => {
        event.stopPropagation();
        const tokens = parsed.tokens.slice();
        tokens.splice(index, 1);
        state.selectedPart = -1;
        setPattern(serializeTokens(tokens));
      });

      chipWrap.append(chip, remove);

      if (state.selectedPart === index) {
        const left = el('button', 'mdrx-part-x', { type: 'button' });
        left.textContent = '\u2039';
        left.setAttribute('aria-label', t('moveLeft'));
        left.disabled = index === 0;
        left.addEventListener('click', (event) => {
          event.stopPropagation();
          const tokens = parsed.tokens.slice();
          const [moved] = tokens.splice(index, 1);
          tokens.splice(index - 1, 0, moved);
          setPattern(serializeTokens(tokens));
          state.selectedPart = index - 1;
          renderParts();
        });
        const right = el('button', 'mdrx-part-x', { type: 'button' });
        right.textContent = '\u203A';
        right.setAttribute('aria-label', t('moveRight'));
        right.disabled = index === parsed.tokens.length - 1;
        right.addEventListener('click', (event) => {
          event.stopPropagation();
          const tokens = parsed.tokens.slice();
          const [moved] = tokens.splice(index, 1);
          tokens.splice(index + 1, 0, moved);
          setPattern(serializeTokens(tokens));
          state.selectedPart = index + 1;
          renderParts();
        });
        // Visual and tab order: ‹ label › ✕, so the two move controls sit
        // either side of the thing they move.
        chipWrap.insertBefore(left, chip);
        chipWrap.insertBefore(right, remove);
      }

      partsRow.appendChild(chipWrap);
    });
  }

  function renderStatus() {
    status.className = 'mdrx-status';
    statusIcon.textContent = '';
    const s = lastResult;
    if (!s) {
      statusIcon.appendChild(icon('info'));
      setText(statusText, 'statusEmpty');
      return;
    }
    statusIcon.appendChild(icon(s.iconName));
    if (s.kind === 'ok') status.classList.add('is-ok');
    if (s.kind === 'error') status.classList.add('is-error');
    statusText.textContent = '';
    const line = el('span');
    if (s.key) setText(line, s.key, s.vars);
    else line.textContent = s.text || '';
    statusText.appendChild(line);
    if (s.extra) {
      const extra = el('span', 'mdrx-sec');
      extra.textContent = s.extra;
      statusText.appendChild(extra);
    }
  }

  function renderRisk() {
    const risk = analyzePattern(effectivePattern());
    if (risk.level === 'high') {
      riskLine.hidden = false;
      riskLine.className = 'mdrx-status is-error';
      riskIcon.textContent = '';
      riskIcon.appendChild(icon('warn'));
      setText(riskText, 'riskHigh', { reasons: risk.reasons.join('; ') });
    } else if (risk.level === 'medium') {
      riskLine.hidden = false;
      riskLine.className = 'mdrx-status';
      riskIcon.textContent = '';
      riskIcon.appendChild(icon('info'));
      riskText.textContent = risk.reasons.join('; ');
    } else {
      riskLine.hidden = true;
    }
    state.risk = risk;
  }

  /** Paint the sample with <mark> spans. Built from DOM nodes, never HTML. */
  function renderPreview(matches) {
    preview.textContent = '';
    const text = sampleArea.value.slice(0, LIMITS.SAMPLE);
    if (!matches || !matches.length) {
      preview.appendChild(document.createTextNode(text));
      return;
    }
    let cursor = 0;
    matches.forEach((m, index) => {
      if (m.index > cursor) preview.appendChild(document.createTextNode(text.slice(cursor, m.index)));
      if (m.length === 0) {
        const zw = el('span', 'mdrx-zw');
        zw.title = t('zeroWidth');
        preview.appendChild(zw);
      } else {
        const mark = document.createElement('mark');
        if (index % 2) mark.className = 'alt';
        mark.textContent = text.slice(m.index, m.index + m.length);
        preview.appendChild(mark);
      }
      cursor = Math.max(cursor, m.index + m.length);
    });
    if (cursor < text.length) preview.appendChild(document.createTextNode(text.slice(cursor)));
  }

  function renderCaptures(matches) {
    capsWrap.textContent = '';
    const withGroups = (matches || []).filter((m) => (m.groups && m.groups.length) || (m.named && Object.keys(m.named).length));
    if (!withGroups.length) {
      const note = el('p', 'mdrx-note');
      setText(note, 'capturesNone');
      capsWrap.appendChild(note);
      return;
    }
    const groupCount = withGroups.reduce((n, m) => Math.max(n, m.groups ? m.groups.length : 0), 0);
    const table = el('table', 'mdrx-table');
    const thead = el('thead');
    const hrow = el('tr');
    [t('colMatch'), t('colAt'), t('colText')].forEach((label) => {
      const th = el('th');
      th.scope = 'col';
      th.textContent = label;
      hrow.appendChild(th);
    });
    for (let g = 1; g <= groupCount; g += 1) {
      const th = el('th');
      th.scope = 'col';
      th.textContent = '$' + g;
      hrow.appendChild(th);
    }
    thead.appendChild(hrow);
    const tbody = el('tbody');
    withGroups.slice(0, 50).forEach((m, index) => {
      const tr = el('tr');
      const cells = [String(index + 1), String(m.index), m.text + (m.clipped ? '…' : '')];
      cells.forEach((value) => { const td = el('td'); td.textContent = value; tr.appendChild(td); });
      if (m.length === 0) tr.title = t('zeroWidth');
      for (let g = 0; g < groupCount; g += 1) {
        const td = el('td');
        const value = m.groups ? m.groups[g] : null;
        td.textContent = value == null ? '—' : value;
        tr.appendChild(td);
      }
      if (m.named) {
        const names = Object.keys(m.named);
        if (names.length) {
          const td = el('td');
          td.colSpan = 3 + groupCount;
          td.textContent = names.map((n) => n + ': ' + (m.named[n] == null ? '—' : m.named[n])).join('  ');
          const namedRow = el('tr');
          namedRow.appendChild(td);
          tbody.appendChild(tr);
          tbody.appendChild(namedRow);
          return;
        }
      }
      tbody.appendChild(tr);
    });
    table.append(thead, tbody);
    capsWrap.appendChild(table);
  }

  /* ---- evaluation -------------------------------------------------------- */

  let lastResult = null;
  let evalToken = 0;
  let debounceTimer = 0;

  function scheduleEvaluate() {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(evaluate, LIMITS.DEBOUNCE_MS);
  }

  function evaluate() {
    const pattern = effectivePattern();
    const flags = effectiveFlags();
    const fullSample = sampleArea.value;
    const sample = fullSample.slice(0, LIMITS.SAMPLE);
    const sampleClipped = fullSample.length > LIMITS.SAMPLE;

    if (!pattern) {
      lastResult = null;
      field.classList.remove('is-invalid');
      validIcon.textContent = '';
      renderPreview([]);
      renderCaptures([]);
      renderStatus();
      return;
    }

    if (pattern.length > LIMITS.PATTERN) {
      lastResult = { kind: 'error', iconName: 'error', key: 'statusTooLong', vars: { n: pattern.length, max: LIMITS.PATTERN } };
      field.classList.add('is-invalid');
      renderStatus();
      return;
    }

    const token = ++evalToken;
    evaluator.evaluate({ pattern, flags, sample }).then((result) => {
      if (token !== evalToken) return;             // a newer keystroke won
      if (!result.ok) {
        field.classList.add('is-invalid');
        validIcon.textContent = '';
        validIcon.appendChild(icon('error'));
        state.error = result.error === 'PATTERN_TOO_LONG' ? '' : result.error;
        lastResult = {
          kind: 'error',
          iconName: 'error',
          key: 'statusInvalid',
          vars: { message: result.error },     // the engine's own words, verbatim
          extra: state.lastValidPattern
            ? t('lastValid', { pattern: state.lastValidPattern, flags })
            : '',
        };
        renderStatus();
        return;
      }

      field.classList.remove('is-invalid');
      state.error = '';
      state.lastValidPattern = pattern;
      validIcon.textContent = '';
      validIcon.appendChild(icon('ok'));

      const matches = result.matches || [];
      renderPreview(matches);
      renderCaptures(matches);

      const extras = [];
      if (sampleClipped) extras.push(t('sampleTruncated', { n: LIMITS.SAMPLE }));
      if (result.truncated) extras.push(t('truncated', { n: matches.length }));

      if (result.timedOut) {
        // An abandoned evaluation is NOT a no-match result. Leading with
        // "no matches" would be the single most misleading thing the builder
        // could say, because the user would conclude their pattern is wrong
        // when in fact it was never allowed to finish.
        if (matches.length) extras.unshift(t('partialMatches', { n: matches.length }));
        lastResult = {
          kind: 'plain',
          iconName: 'warn',
          key: 'timedOut',
          vars: { ms: LIMITS.DEADLINE_MS },
          extra: extras.join(' '),
        };
      } else {
        lastResult = matches.length === 0
          ? { kind: 'plain', iconName: 'info', key: 'statusNoMatch', extra: extras.join(' ') }
          : matches.length === 1
            ? { kind: 'ok', iconName: 'ok', key: 'statusMatchOne', extra: extras.join(' ') }
            : { kind: 'ok', iconName: 'ok', key: 'statusMatchMany', vars: { n: matches.length }, extra: extras.join(' ') };
      }
      renderStatus();
    });
  }

  function refresh(source) {
    state.parts = parsePattern(effectivePattern());
    renderMode(source);
    renderParts();
    renderRisk();
    scheduleEvaluate();
  }

  /* ---- events ------------------------------------------------------------ */

  segPlain.addEventListener('click', () => setMode('plain'));
  segRegex.addEventListener('click', () => setMode('regex'));
  if (modeToggle) modeToggle.addEventListener('click', () => setMode(state.mode === 'regex' ? 'plain' : 'regex'));

  escapeBtn.addEventListener('click', () => {
    const escaped = escapeLiteral(state.pattern);
    state.escapeHintShown = false;
    inputEl.value = escaped;
    setPattern(escaped);
  });

  patternInput.addEventListener('input', () => {
    ensureRegexMode();
    setPattern(patternInput.value, 'raw');
  });

  inputEl.addEventListener('input', () => {
    if (state.mode === 'regex') {
      setPattern(inputEl.value, 'field');
    } else {
      // In plain mode the field holds the query, not the pattern; the raw
      // editor shows what "plain text" actually compiles to.
      refresh('field');
      notify();
    }
  });

  litBtn.addEventListener('click', () => {
    if (!litInput.value) { litInput.focus(); return; }
    insertSource(escapeLiteral(litInput.value));
    litInput.value = '';
  });
  litInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); litBtn.click(); }
  });

  setBtn.addEventListener('click', () => {
    if (!setInput.value) { setInput.focus(); return; }
    insertSource('[' + (setNegBox.checked ? '^' : '') + escapeClassSet(setInput.value) + ']');
    setInput.value = '';
  });
  setInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); setBtn.click(); }
  });

  lazyBox.addEventListener('change', () => { state.lazy = lazyBox.checked; });

  sampleArea.addEventListener('input', () => {
    state.sample = sampleArea.value;   // memory only — never persisted
    scheduleEvaluate();
  });

  copyPatternBtn.addEventListener('click', () => {
    copyText(effectivePattern()).then((done) => {
      const message = done ? t('copied') : t('copyFailed');
      setNotice(message, done ? 'info' : 'error');
      toast(message, done ? 'success' : 'error');
    });
  });

  copyLiteralBtn.addEventListener('click', () => {
    copyText('/' + effectivePattern() + '/' + effectiveFlags()).then((done) => {
      const message = done ? t('copied') : t('copyFailed');
      setNotice(message, done ? 'info' : 'error');
      toast(message, done ? 'success' : 'error');
    });
  });

  resetBtn.addEventListener('click', () => {
    state.flags = opts.flags || DEFAULT_FLAGS;
    state.selectedPart = -1;
    state.escapeHintShown = false;
    if (state.mode === 'regex') inputEl.value = '';
    setPattern('');
    patternInput.focus();
  });

  closeBtn.addEventListener('click', () => close());

  /* ---- open / close / anchoring ----------------------------------------- */

  function reposition() {
    if (!state.open) return;
    const rect = inputEl.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const width = pop.offsetWidth || Math.min(464, vw - 24);
    const gap = 8;

    let left = rect.left;
    if (left + width > vw - 8) left = vw - width - 8;
    if (left < 8) left = 8;

    const below = vh - rect.bottom - gap - 8;
    const above = rect.top - gap - 8;
    const preferBelow = below >= Math.min(above, 420) || below >= above;

    // Bound the height to the space actually available and let the body
    // scroll inside it. Capping and hiding the overflow would silently delete
    // the last section of the builder.
    const space = Math.max(180, preferBelow ? below : above);
    pop.style.maxHeight = space + 'px';
    body.style.maxHeight = Math.max(120, space - 150) + 'px';

    pop.style.left = Math.round(left) + 'px';
    if (preferBelow) {
      pop.style.top = Math.round(rect.bottom + gap) + 'px';
      pop.style.bottom = 'auto';
    } else {
      pop.style.top = 'auto';
      pop.style.bottom = Math.round(vh - rect.top + gap) + 'px';
    }
  }

  const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, [tabindex]:not([tabindex="-1"])';

  function onDocumentKeydown(event) {
    if (event.key === 'Escape' && state.open) {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab' || !state.open || !pop.contains(event.target)) return;
    // The popover is appended to <body>, so its natural tab order sits after
    // the whole page. Wrapping keeps a keyboard user inside a coherent group;
    // Escape is the documented way out, and it returns focus to the field.
    const items = Array.prototype.filter.call(
      pop.querySelectorAll(FOCUSABLE),
      (node) => node.offsetParent !== null || node === document.activeElement,
    );
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function onDocumentPointer(event) {
    if (!state.open) return;
    const target = event.target;
    if (pop.contains(target)) return;
    if (trigger && trigger.contains(target)) return;
    if (modeToggle && modeToggle.contains(target)) return;
    if (target === inputEl) return;
    close(true);
  }

  let resizeObserver = null;

  function open() {
    if (state.open) return;
    if (!pop.isConnected) document.body.appendChild(pop);
    pop.hidden = false;
    state.open = true;
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
    renderChrome();
    refresh();
    reposition();
    // Requested after layout so the measured height is the real one.
    window.requestAnimationFrame(reposition);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    document.addEventListener('keydown', onDocumentKeydown, true);
    document.addEventListener('pointerdown', onDocumentPointer, true);
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(reposition);
      resizeObserver.observe(inputEl);
      resizeObserver.observe(pop);
    }
    patternInput.focus();
    try { patternInput.setSelectionRange(patternInput.value.length, patternInput.value.length); } catch (err) { /* ignore */ }
  }

  function close(keepFocus) {
    if (!state.open) return;
    state.open = false;
    pop.hidden = true;
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    window.removeEventListener('scroll', reposition, true);
    window.removeEventListener('resize', reposition);
    document.removeEventListener('keydown', onDocumentKeydown, true);
    document.removeEventListener('pointerdown', onDocumentPointer, true);
    if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
    // Focus returns to the field it belongs to, so the user does not have to
    // find their place again after every pattern edit.
    if (!keepFocus) inputEl.focus();
  }

  if (trigger) {
    trigger.setAttribute('aria-controls', popId);
    trigger.addEventListener('click', () => (state.open ? close() : open()));
  }

  /* ---- synchronous matcher for the search itself ------------------------- */

  let compiled = null;
  let compiledKey = '';

  /**
   * A predicate the site's own search can run over many strings synchronously.
   *
   * Guards, in order:
   *  1. a high-risk pattern (section 5) is refused rather than run in a loop
   *     on the main thread where nothing could stop it;
   *  2. a per-sweep time budget stops the sweep early and says so, rather
   *     than pretending the remaining items simply did not match.
   */
  function matcher() {
    const pattern = effectivePattern();
    const flags = effectiveFlags();
    const key = pattern + '\u0000' + flags;
    if (key !== compiledKey) {
      compiledKey = key;
      compiled = null;
      if (pattern && pattern.length <= LIMITS.PATTERN) {
        const risk = analyzePattern(pattern);
        if (risk.level !== 'high') {
          try { compiled = new RegExp(pattern, flags.replace('g', '').replace('y', '')); } catch (err) { compiled = null; }
        }
      }
    }
    let budgetStart = 0;
    let exceeded = false;
    const fn = (text) => {
      if (!pattern) return true;                 // an empty query matches everything
      if (!compiled) return false;
      if (!budgetStart) budgetStart = Date.now();
      if (exceeded) return false;
      if (Date.now() - budgetStart > LIMITS.SEARCH_BUDGET_MS) { exceeded = true; return false; }
      compiled.lastIndex = 0;
      return compiled.test(String(text == null ? '' : text));
    };
    fn.reset = () => { budgetStart = 0; exceeded = false; };
    fn.isBudgetExceeded = () => exceeded;
    fn.isUsable = () => Boolean(!pattern || compiled);
    return fn;
  }

  /* ---- controller -------------------------------------------------------- */

  function getState() {
    return {
      mode: state.mode,
      query: inputEl.value,
      pattern: effectivePattern(),
      rawPattern: state.pattern,
      flags: effectiveFlags(),
      valid: !state.error,
      error: state.error,
      risk: state.risk ? state.risk.level : 'low',
      open: state.open,
    };
  }

  const instanceHooks = {
    relabel() {
      renderChrome();
      renderParts();
      renderRisk();
      renderStatus();
    },
  };

  const controller = {
    input: inputEl,
    popover: pop,
    trigger,
    modeToggle,
    open,
    close,
    isOpen: () => state.open,
    getState,
    setMode,
    setPattern(pattern) {
      ensureRegexMode();
      // A pattern supplied programmatically REPLACES whatever was typed, so
      // the "what you typed now means something different" hint does not
      // apply — offering to escape a pattern the caller just authored would
      // be nonsense.
      state.escapeHintShown = false;
      setPattern(pattern);
    },
    setFlags(flags) {
      state.flags = String(flags || '').split('').filter((f) => FLAGS.some((x) => x.flag === f)).sort().join('');
      refresh();
      persist();
      notify();
    },
    setSample(text) {
      sampleArea.value = String(text == null ? '' : text);
      state.sample = sampleArea.value;
      scheduleEvaluate();
    },
    matcher,
    getRisk: () => analyzePattern(effectivePattern()),
    onChange(fn) {
      if (typeof fn === 'function') listeners.add(fn);
      return () => listeners.delete(fn);
    },
    destroy() {
      close(true);
      LIVE_INSTANCES.delete(instanceHooks);
      evaluator.dispose();
      if (pop.isConnected) pop.remove();
      if (trigger && !opts.trigger && trigger.isConnected) trigger.remove();
      if (modeToggle && !opts.modeToggle && modeToggle.isConnected) modeToggle.remove();
      REGISTRY.delete(inputEl);
    },
  };

  inputEl.dataset.regexMode = state.mode;
  if (state.mode === 'regex' && state.pattern && !inputEl.value) inputEl.value = state.pattern;
  // Registered whether or not the popover is open, so a language change
  // relabels a closed builder's trigger and mode toggle too.
  LIVE_INSTANCES.add(instanceHooks);
  renderChrome();
  refresh();

  REGISTRY.set(inputEl, controller);
  return controller;
}

/* -----------------------------------------------------------------------------
   11. BULK ATTACHMENT AND AUTO-INITIALISATION
   ----------------------------------------------------------------------------- */

/**
 * Attach to every `[data-regex-builder]` field under `root`. Idempotent, so a
 * later call after new markup is inserted picks up only the new fields.
 *
 * Per-field options are read from data attributes:
 *   data-regex-key      persistence key (defaults to the element id)
 *   data-regex-flags    starting flags
 *   data-regex-dialect  overrides the engine line for that call site
 */
function attachAll(root) {
  const scope = root || document;
  const fields = scope.querySelectorAll('[data-regex-builder]');
  const out = [];
  fields.forEach((field) => {
    if (REGISTRY.has(field)) { out.push(REGISTRY.get(field)); return; }
    out.push(attachRegexBuilder(field, {
      key: field.dataset.regexKey || field.id || '',
      flags: field.dataset.regexFlags || undefined,
      dialect: field.dataset.regexDialect || undefined,
    }));
  });
  return out;
}

/** The controller for a field, if one is attached. */
function getBuilder(inputEl) {
  return REGISTRY.get(inputEl);
}

if (typeof document !== 'undefined') {
  const boot = () => { try { attachAll(document); } catch (err) { /* keep the page alive */ } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}

/* -----------------------------------------------------------------------------
   12. EXPORTS
   ----------------------------------------------------------------------------- */

export {
  attachRegexBuilder,
  attachAll,
  getBuilder,
  escapeLiteral,
  escapeClassSet,
  parsePattern,
  serializeTokens,
  describeToken,
  analyzePattern,
  createEvaluator,
  runMatch,
  setRegexI18n,
  setRegexTranslator,
  FLAGS,
  LIMITS,
  STORAGE_PREFIX,
};
