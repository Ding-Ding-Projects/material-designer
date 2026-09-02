/*
 * Page equivalent for the hand-written thirty-feature inventory.
 *
 * This module owns only visitor-side review state and a truthful matrix. It
 * does not infer desktop support from page support, and it does not turn a
 * missing runtime, account, or assistive-technology proof into a success.
 * The search field is attached to the existing regex builder module so its
 * pattern, flags, bounds, and local persistence follow the site's established
 * search contract.
 */

import * as i18n from './i18n.js';
import { attachRegexBuilder } from './regex.js';
import { initializeUniversalSettingsOwner, registerUniversalSettingsPage } from './universal-settings.js';
import { mountPersonalVocabulary } from './personal-vocabulary.js';
import { mount as mountLogoCustomization } from './logo.js';

const STORAGE_KEY = 'md-designer.site.canonical-feature-suite.v1';
const MAX_REVIEWED = 30;

const FEATURES = Object.freeze([
  { id: 'language-modes', status: 'available', title: { en: 'Language modes', yue: '語言模式' }, copy: { en: 'This page follows the three-mode preference already exposed in Settings.', yue: '呢頁跟住設定入面已有嘅三種語言模式。' }, boundary: { en: 'The desktop application is not verified by this page.', yue: '呢頁唔可以證明桌面應用程式已經實作。' }, hook: '#lang-mode-bilingual' },
  { id: 'dialog-emoji-toggle', status: 'available', title: { en: 'Dialog emoji toggle', yue: '對話框表情符號開關' }, copy: { en: 'Page settings persist the decoration preference and apply it without changing factual copy.', yue: '頁面設定會保存裝飾偏好，而且唔會改動事實內容。' }, boundary: { en: 'This page preference does not prove every installed-application dialog.', yue: '呢個頁面偏好唔可以證明每個已安裝應用程式對話框。' }, hook: '[data-universal-emoji]' },
  { id: 'school-mode', status: 'partial', title: { en: 'School mode', yue: '學校模式' }, copy: { en: 'The page has a visitor-local mode, a rename path, live suppression, and a local unlock credential.', yue: '呢頁有訪客本地模式、改名、即時隱藏同本地解鎖資料。' }, boundary: { en: 'Browser storage replaces an operating-system vault, so this is a page equivalent rather than a security boundary.', yue: '瀏覽器儲存取代作業系統保險庫，所以呢個係頁面等價功能，唔係安全界線。' }, hook: '#universal-settings-tab-school' },
  { id: 'narration', status: 'partial', title: { en: 'Narration', yue: '旁白' }, copy: { en: 'Page settings expose opt-in speech, language order, installed voice choices, rate, pitch, and quiet mode.', yue: '頁面設定提供選擇啟用語音、語言次序、已安裝聲音、速度、音調同靜音模式。' }, boundary: { en: 'Available voices depend on the visitor browser and remain separate from packaged-application evidence.', yue: '可用聲音視乎訪客瀏覽器，同打包應用程式證據分開。' }, hook: '#universal-settings-tab-narrator' },
  { id: 'scheduled-settings', status: 'partial', title: { en: 'Scheduled settings', yue: '排程設定' }, copy: { en: 'The page exposes local-time schedules and validated local, HTTPS API, and Home Assistant source fields.', yue: '呢頁提供本地時間排程，同驗證本地、HTTPS API 同 Home Assistant 來源欄位。' }, boundary: { en: 'The static page retains safe local fallback and does not claim privileged credential-vault requests.', yue: '靜態頁面保留安全本地後備，唔聲稱有特權保險庫請求。' }, hook: '#universal-settings-tab-schedule' },
  { id: 'dim-sum-surprise', status: 'partial', title: { en: 'Dim sum surprise', yue: '點心驚喜' }, copy: { en: 'The existing page draw may show a bundled dish without blocking the page.', yue: '現有頁面抽籤可以顯示本地點心而唔阻住頁面。' }, boundary: { en: 'The application startup path remains unverified here.', yue: '應用程式啟動路徑喺呢度仍然未驗證。' }, hook: '[data-md-dimsum]' },
  { id: 'regex-builders', status: 'available', title: { en: 'Regex builders', yue: '正則表達式工具' }, copy: { en: 'The page search fields use an anchored builder from the shared site module.', yue: '呢頁搜尋格用共用頁面模組提供嘅貼邊工具。' }, boundary: { en: 'This proves the page search only, not every application search field.', yue: '呢度只證明頁面搜尋，唔係每個應用程式搜尋格。' }, hook: '#site-search-builder' },
  { id: 'notification-centre', status: 'available', title: { en: 'Notification centre', yue: '通知中心' }, copy: { en: 'The page has a reviewable notification surface opened from its bell control.', yue: '呢頁有可以由鈴鐺按鈕開啟嘅通知檢視表面。' }, boundary: { en: 'Only page notifications are in scope for this equivalent.', yue: '呢個等價功能只涵蓋頁面通知。' }, hook: '[data-md-notifications-toggle]' },
  { id: 'appearance-editors', status: 'partial', title: { en: 'Appearance editors', yue: '外觀編輯器' }, copy: { en: 'Theme and colour controls exist on the page, with a documented boundary for deeper element editing.', yue: '呢頁有主題同顏色控制，亦寫明更深層元素編輯嘅界線。' }, boundary: { en: 'Full per-element Photoshop-depth editing is not claimed here.', yue: '呢頁唔聲稱有完整逐元素 Photoshop 深度編輯。' }, hook: '#theme-toggle' },
  { id: 'tabbed-navigation', status: 'available', title: { en: 'Tabbed navigation', yue: '分頁導覽' }, copy: { en: 'The page has a persistent tab strip with local visitor preferences.', yue: '呢頁有持久分頁列，同埋訪客本地偏好。' }, boundary: { en: 'The matrix does not add extra application tabs or claim their runtime parity.', yue: '呢個矩陣冇加應用程式分頁，亦唔聲稱執行時一致。' }, hook: '#tab-strip' },
  { id: 'offline-documentation', status: 'partial', title: { en: 'Offline documentation', yue: '離線文件' }, copy: { en: 'The page keeps its source links and honest no-network statement visible.', yue: '呢頁保留來源連結，同埋清楚嘅無網絡聲明。' }, boundary: { en: 'The full in-app bundled article browser is not available on this static page.', yue: '完整應用程式內置文章瀏覽器唔喺呢個靜態頁面提供。' } },
  { id: 'command-palette', status: 'available', title: { en: 'Command palette', yue: '指令面板' }, copy: { en: 'The page exposes its command palette control and keeps the action discoverable.', yue: '呢頁提供指令面板按鈕，個操作亦保持容易搵。' }, boundary: { en: 'The page palette is not evidence of the desktop command registry.', yue: '頁面面板唔係桌面指令註冊表嘅證據。' }, hook: '[data-md-palette-open]' },
  { id: 'destructive-confirmation', status: 'partial', title: { en: 'Destructive confirmation', yue: '破壞性操作確認' }, copy: { en: 'A session-only preview record and notification deletion use two keys followed by a full-range slider.', yue: '工作階段預覽記錄同通知刪除會先用兩把鎖匙，再完成全範圍滑桿。' }, boundary: { en: 'The page gate changes page-owned local state only and does not prove installed-application deletion paths.', yue: '頁面確認只會改頁面擁有嘅本地狀態，唔證明已安裝應用程式刪除路徑。' }, hook: '#universal-super-confirmation-demo' },
  { id: 'local-history', status: 'unavailable', title: { en: 'Local history', yue: '本地歷史' }, copy: { en: 'The page stores visitor preferences but does not present a document history repository.', yue: '呢頁會儲存訪客偏好，但冇提供文件歷史儲存庫。' }, boundary: { en: 'A browser preference store is not the app document history contract.', yue: '瀏覽器偏好儲存唔等於應用程式文件歷史合約。' } },
  { id: 'changelog-viewer', status: 'partial', title: { en: 'Changelog viewer', yue: '變更記錄檢視器' }, copy: { en: 'Release notes are linked from the page, while a fully filtered viewer remains outside this matrix.', yue: '頁面有連去發佈說明，但完整可篩選檢視器仍然唔喺矩陣入面。' }, boundary: { en: 'No invented release entries or commit evidence is added here.', yue: '呢度唔會虛構發佈項目或者提交證據。' }, hook: '#tab-panel-releases' },
  { id: 'external-editor', status: 'unavailable', title: { en: 'External editor', yue: '外部編輯器' }, copy: { en: 'This page does not pretend to open a local editor from a browser tab.', yue: '呢頁唔會扮可以由瀏覽器分頁開本地編輯器。' }, boundary: { en: 'The browser cannot verify a visitor\'s installed editor choice.', yue: '瀏覽器唔可以驗證訪客安裝咗邊個編輯器。' } },
  { id: 'exports', status: 'partial', title: { en: 'Exports', yue: '匯出' }, copy: { en: 'Page-owned review state can be exported as a bounded local report.', yue: '頁面擁有嘅檢閱狀態可以匯出成有界限嘅本地報告。' }, boundary: { en: 'This does not imply that every application record or format is exportable here.' , yue: '呢度唔代表每個應用程式記錄或者格式都可以匯出。' } },
  { id: 'bulk-actions', status: 'partial', title: { en: 'Bulk actions', yue: '批量操作' }, copy: { en: 'The matrix supports select-all and inverse review actions for its own rows.', yue: '矩陣支援全選同反轉選取自己嘅行。' }, boundary: { en: 'No page-owned destructive bulk action is offered without a real data contract.', yue: '冇真實資料合約，就唔會提供頁面破壞性批量操作。' } },
  { id: 'accessibility-responsive-sizing', status: 'available', title: { en: 'Accessibility and responsive sizing', yue: '無障礙同響應式尺寸' }, copy: { en: 'The matrix uses labels, focusable controls, status text, narrow layout rules, and reduced-motion handling.', yue: '矩陣使用標籤、可聚焦控制、狀態文字、窄版規則同減少動態處理。' }, boundary: { en: 'A source-level page claim is not a built-artifact accessibility audit.', yue: '源碼層面頁面聲明唔係打包應用程式無障礙審核。' }, hook: '#site-search-input' },
  { id: 'personal-vocabulary-upload', status: 'partial', title: { en: 'Personal vocabulary upload', yue: '個人詞彙上載' }, copy: { en: 'A visible local JSON picker validates the complete bounded file, persists a private browser cache, supports replace and clear, and restores original wording.', yue: '可見本地 JSON 選擇器會驗證完整有界限檔案、保存私人瀏覽器快取、支援取代同清除，亦可以還原原本文字。' }, boundary: { en: 'The page stores no source path and sends no payload over a network. Installed-application cache behavior remains separate evidence.', yue: '頁面唔會保存來源路徑，亦唔會經網絡傳送內容。已安裝應用程式快取行為仍然係另一份證據。' }, hook: '#settings-personal-vocabulary' },
  { id: 'toy-locks-authentication', status: 'partial', title: { en: 'Toy locks and authentication', yue: '玩具鎖同驗證' }, copy: { en: 'The page can describe its local-only boundary without presenting a security promise.', yue: '呢頁可以講清楚本地界線，但唔會作出安全保證。' }, boundary: { en: 'No page toy lock is enabled for this matrix, and no credential is collected.', yue: '呢個矩陣冇啟用頁面玩具鎖，亦唔會收集驗證資料。' } },
  { id: 'unlock-ladder', status: 'unavailable', title: { en: 'Unlock ladder', yue: '解鎖階梯' }, copy: { en: 'The page has no authentication lockout to recover from.', yue: '呢頁冇身份驗證鎖定狀態需要恢復。' }, boundary: { en: 'Without a real lockout flow, no ladder is claimed.', yue: '冇真實鎖定流程，就唔會聲稱有解鎖階梯。' } },
  { id: 'shared-link-embed', status: 'unavailable', title: { en: 'Shared-link embed', yue: '分享連結嵌入' }, copy: { en: 'A source page cannot verify how a chat crawler renders its final response.', yue: '頁面來源唔可以驗證聊天爬蟲最後點樣顯示。' }, boundary: { en: 'The production response and image fetch need external verification.', yue: '正式回應同圖片擷取要靠外部驗證。' } },
  { id: 'adhd-modes', status: 'partial', title: { en: 'Attention modes', yue: '專注模式' }, copy: { en: 'Five independent page settings provide focus, low stimulation, time awareness, one thing, and momentum modes, all off initially.', yue: '五個獨立頁面設定提供專注、低刺激、時間感、一次一件事同動力模式，預設全部關閉。' }, boundary: { en: 'These are interface accommodations, not medical features or packaged-application proof.', yue: '呢啲係介面配合，唔係醫療功能或者打包應用程式證據。' }, hook: '#universal-settings-tab-adhd' },
  { id: 'browser-download-surfaces', status: 'unavailable', title: { en: 'Browser download surfaces', yue: '瀏覽器下載表面' }, copy: { en: 'This page does not intercept a browser extension download.', yue: '呢頁唔會攔截瀏覽器擴充功能下載。' }, boundary: { en: 'Start, active progress, and completion require an installed extension flow.', yue: '開始、進度同完成狀態要有已安裝擴充功能流程。' } },
  { id: 'app-logo-customization', status: 'partial', title: { en: 'App logo customization', yue: '應用程式標誌自訂' }, copy: { en: 'The page mounts shipped presets, bounded local upload and conversion, fit, safe area, focal and background controls, previews, import, export, history, and reset.', yue: '頁面掛載已提供預設、有界限本地上載同轉換、配合、安全區域、焦點同背景控制、預覽、匯入、匯出、歷史同重設。' }, boundary: { en: 'This changes page presentation only. Package, installer, update, and storage identity stay fixed.', yue: '呢個只改頁面外觀。套件、安裝程式、更新同儲存身份保持不變。' }, hook: '#settings-logo' },
  { id: 'file-converter', status: 'unavailable', title: { en: 'File converter', yue: '檔案轉換器' }, copy: { en: 'No visitor file is opened or converted by this page.', yue: '呢頁唔會開啟或者轉換訪客檔案。' }, boundary: { en: 'Bundled adapters, byte inspection, and result validation need a local app.', yue: '內置轉接器、位元組檢查同結果驗證要靠本地應用程式。' } },
  { id: 'ollama-suite-manager', status: 'unavailable', title: { en: 'Local model suite manager', yue: '本地模型套件管理器' }, copy: { en: 'The page makes no local model API call and invents no model catalogue.', yue: '呢頁唔會呼叫本地模型 API，亦唔會虛構模型目錄。' }, boundary: { en: 'Runtime health, exhaustive tags, and local chat require a mediated local service.', yue: '執行健康、完整標籤同本地對話要有中介本地服務。' } },
  { id: 'status-hub', status: 'partial', title: { en: 'Status hub', yue: '狀態中心' }, copy: { en: 'Page settings expose factual local status cards and keep every unrun item labelled unrun.', yue: '頁面設定提供真實本地狀態卡，所有未執行項目都清楚標示未執行。' }, boundary: { en: 'No authenticated shared delivery channel is connected, so remote delivery is not claimed.', yue: '未連接經驗證共用傳送頻道，所以唔聲稱遠端傳送。' }, hook: '#universal-settings-tab-status' },
  { id: 'front-screen-provenance', status: 'partial', title: { en: 'Front-screen provenance', yue: '前畫面來源資料' }, copy: { en: 'The page exposes a provenance block before its tabs and settings.', yue: '呢頁喺分頁同設定之前顯示來源資料區塊。' }, boundary: { en: 'The values remain unavailable until release provenance binds them to a running build.', yue: '值要等發佈來源資料綁定到執行中版本先可以使用。' }, hook: '#front-provenance-title' },
]);

const STATUS_LABELS = Object.freeze({
  available: { en: 'Page equivalent available', yue: '頁面等價功能可用' },
  partial: { en: 'Partial page equivalent', yue: '頁面等價功能部分可用' },
  unavailable: { en: 'Unavailable on a static page', yue: '靜態頁面未能提供' },
});

function readState() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
    const reviewed = Array.isArray(parsed.reviewed) ? parsed.reviewed.filter((id) => FEATURES.some((feature) => feature.id === id)).slice(0, MAX_REVIEWED) : [];
    return { reviewed: new Set(reviewed), lastAction: typeof parsed.lastAction === 'string' ? parsed.lastAction : '' };
  } catch (_) {
    return { reviewed: new Set(), lastAction: '' };
  }
}

function writeState(state) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, reviewed: [...state.reviewed], lastAction: state.lastAction })); } catch (_) { /* private visitor storage can be disabled */ }
}

function label(entry) {
  const mode = i18n.getMode();
  if (mode === 'yue') return entry.yue;
  if (mode === 'bilingual') return `${entry.en} · ${entry.yue}`;
  return entry.en;
}

function statusLabel(status) { return label(STATUS_LABELS[status]); }

function makeText(entry, selector) {
  const node = document.createElement(selector);
  node.textContent = label(entry);
  if (i18n.getMode() === 'yue') node.lang = 'zh-HK';
  return node;
}

function hookFeature(feature) {
  if (!feature.hook) return null;
  const target = document.querySelector(feature.hook);
  if (target instanceof HTMLElement) return target;
  return null;
}

function requestDestructiveConfirmation({ action, targetCount = 1, onConfirm } = {}) {
  const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const dialog = document.createElement('dialog');
  dialog.className = 'canonical-super-confirmation';
  dialog.setAttribute('role', 'alertdialog');
  dialog.setAttribute('aria-modal', 'true');
  const title = document.createElement('h3');
  title.id = 'canonical-super-confirmation-title';
  if (document.documentElement.getAttribute('data-universal-dialog-emoji') === 'true') {
    const emoji = document.createElement('span');
    emoji.textContent = '⚠️';
    emoji.setAttribute('aria-hidden', 'true');
    title.append(emoji, document.createTextNode(' '));
  }
  title.append(document.createTextNode(typeof action === 'string' && action.trim() ? action.trim() : 'Change local page data'));
  dialog.setAttribute('aria-labelledby', title.id);
  const detail = document.createElement('p');
  detail.textContent = `${Math.max(1, Number(targetCount) || 1)} page-owned local item(s) will change. Complete both keys, then move the slider through its full range.`;
  const keyOne = document.createElement('label');
  const keyOneInput = document.createElement('input');
  keyOneInput.type = 'checkbox';
  keyOne.append(keyOneInput, document.createTextNode(' I read the affected-item count.'));
  const keyTwo = document.createElement('label');
  const keyTwoInput = document.createElement('input');
  keyTwoInput.type = 'checkbox';
  keyTwo.append(keyTwoInput, document.createTextNode(' I accept this page-local change.'));
  const sliderLabel = document.createElement('label');
  sliderLabel.textContent = 'Confirmation progress';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.step = '10';
  slider.value = '0';
  slider.disabled = true;
  slider.setAttribute('aria-describedby', 'canonical-super-confirmation-progress');
  const progress = document.createElement('output');
  progress.id = 'canonical-super-confirmation-progress';
  progress.textContent = '0% complete';
  sliderLabel.append(slider, progress);
  const actions = document.createElement('div');
  actions.className = 'canonical-super-confirmation__actions';
  const emergencyExit = document.createElement('button');
  emergencyExit.type = 'button';
  emergencyExit.className = 'md-btn md-btn--outlined';
  emergencyExit.textContent = 'Emergency exit';
  actions.append(emergencyExit);
  dialog.append(title, detail, keyOne, keyTwo, sliderLabel, actions);

  let acceptedProgress = 0;
  const close = () => {
    if (dialog.open && typeof dialog.close === 'function') dialog.close();
    dialog.remove();
    origin?.focus();
  };
  const refresh = () => {
    slider.disabled = !(keyOneInput.checked && keyTwoInput.checked);
    if (slider.disabled) acceptedProgress = 0;
    slider.value = String(acceptedProgress);
    progress.textContent = `${acceptedProgress}% complete`;
  };
  keyOneInput.addEventListener('change', refresh);
  keyTwoInput.addEventListener('change', refresh);
  slider.addEventListener('input', () => {
    if (slider.disabled) return;
    const requested = Number(slider.value);
    acceptedProgress = Math.min(100, Math.max(0, Math.min(requested, acceptedProgress + 10)));
    refresh();
    if (acceptedProgress !== 100) return;
    try { if (typeof onConfirm === 'function') onConfirm(); } finally { close(); }
  });
  emergencyExit.addEventListener('click', close);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
  document.body.append(dialog);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  keyOneInput.focus();
  refresh();
}

let previewRecordPresent = true;
let universalRegistration = null;
let universalOwnerDispose = null;
let personalVocabularyMount = null;
let logoCustomizationMount = null;

function mountUniversalSettings() {
  if (universalRegistration) return universalRegistration;
  universalOwnerDispose = initializeUniversalSettingsOwner();
  universalRegistration = registerUniversalSettingsPage({ requestDestructiveConfirmation });
  universalRegistration.acknowledgeMount();
  const personalRoot = document.querySelector('[data-personal-vocabulary]');
  if (personalRoot) personalVocabularyMount = mountPersonalVocabulary(personalRoot);
  const logoRoot = document.querySelector('[data-logo-customization]');
  if (logoRoot) logoCustomizationMount = mountLogoCustomization(logoRoot, { label: 'App logo' });
  const demo = document.querySelector('#universal-super-confirmation-demo');
  const status = document.querySelector('#universal-super-confirmation-status');
  demo?.addEventListener('click', () => {
    if (!previewRecordPresent) {
      previewRecordPresent = true;
      if (status) status.textContent = 'The session-only preview record was restored.';
      return;
    }
    requestDestructiveConfirmation({
      action: 'Delete the session-only preview record',
      targetCount: 1,
      onConfirm: () => {
        previewRecordPresent = false;
        if (status) status.textContent = 'The session-only preview record was deleted. Activate the button again to restore it.';
      },
    });
  });
  return universalRegistration;
}

function mount() {
  const root = document.querySelector('[data-canonical-feature-suite]');
  if (!root) return null;
  const state = readState();
  const mode = i18n.getMode();
  const summary = root.querySelector('[data-canonical-feature-summary]');

  const toolbar = document.createElement('div');
  toolbar.className = 'canonical-feature-suite__toolbar';
  toolbar.setAttribute('role', 'region');
  toolbar.setAttribute('aria-labelledby', 'canonical-feature-suite-controls');

  const controlsHeading = document.createElement('h3');
  controlsHeading.id = 'canonical-feature-suite-controls';
  controlsHeading.className = 'md-title-medium';
  controlsHeading.textContent = mode === 'yue' ? '檢閱功能覆蓋' : mode === 'bilingual' ? 'Review feature coverage · 檢閱功能覆蓋' : 'Review feature coverage';
  toolbar.append(controlsHeading);

  const filters = document.createElement('div');
  filters.className = 'canonical-feature-suite__filters';
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'md-search__input canonical-feature-suite__search';
  search.id = 'canonical-feature-suite-search';
  search.placeholder = mode === 'yue' ? '搜尋三十項功能' : 'Search thirty features';
  search.setAttribute('aria-label', mode === 'yue' ? '搜尋三十項功能' : 'Search thirty features');
  search.setAttribute('data-regex-builder', '');
  search.dataset.regexKey = 'canonical-feature-suite-search';
  const searchWrap = document.createElement('div');
  searchWrap.className = 'md-search canonical-feature-suite__search-wrap';
  searchWrap.append(search);
  filters.append(searchWrap);

  let wanted = 'all';
  const statusFilters = document.createElement('div');
  statusFilters.className = 'canonical-feature-suite__filters';
  statusFilters.setAttribute('role', 'group');
  statusFilters.setAttribute('aria-label', 'Filter feature status');
  [['all', 'All statuses'], ['available', STATUS_LABELS.available.en], ['partial', STATUS_LABELS.partial.en], ['unavailable', STATUS_LABELS.unavailable.en]].forEach(([value, text]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `md-btn ${value === 'all' ? 'md-btn--filled' : 'md-btn--outlined'}`;
    button.textContent = text;
    button.setAttribute('aria-pressed', String(value === wanted));
    button.addEventListener('click', () => { wanted = value; statusFilters.querySelectorAll('button').forEach((item) => item.setAttribute('aria-pressed', String(item === button))); statusFilters.querySelectorAll('button').forEach((item) => item.classList.toggle('md-btn--filled', item === button)); statusFilters.querySelectorAll('button').forEach((item) => item.classList.toggle('md-btn--outlined', item !== button)); paint(); });
    statusFilters.append(button);
  });
  filters.append(statusFilters);
  toolbar.append(filters);

  const actions = document.createElement('div');
  actions.className = 'canonical-feature-suite__actions';
  const selectAll = document.createElement('button');
  selectAll.type = 'button'; selectAll.className = 'md-btn md-btn--outlined';
  selectAll.textContent = mode === 'yue' ? '全選可見項目' : 'Review all visible';
  const invert = document.createElement('button');
  invert.type = 'button'; invert.className = 'md-btn md-btn--text';
  invert.textContent = mode === 'yue' ? '反轉檢閱' : 'Invert review';
  actions.append(selectAll, invert);
  toolbar.append(actions);

  const legend = document.createElement('div'); legend.className = 'canonical-feature-suite__legend'; legend.setAttribute('aria-label', 'Feature status legend');
  Object.entries(STATUS_LABELS).forEach(([key, value]) => { const item = document.createElement('span'); item.className = `is-${key}`; const dot = document.createElement('i'); dot.setAttribute('aria-hidden', 'true'); item.append(dot, document.createTextNode(label(value))); legend.append(item); });
  toolbar.append(legend);

  const count = document.createElement('p'); count.className = 'canonical-feature-suite__count'; count.setAttribute('role', 'status'); count.setAttribute('aria-live', 'polite'); toolbar.append(count);
  const grid = document.createElement('div'); grid.className = 'canonical-feature-suite__grid';
  root.append(toolbar, grid);
  root.classList.add('is-ready');

  const cards = FEATURES.map((feature) => {
    const card = document.createElement('article');
    card.className = 'md-card md-card--outlined canonical-feature-card';
    card.dataset.canonicalFeatureId = feature.id;
    card.dataset.canonicalFeatureStatus = feature.status;
    const head = document.createElement('div'); head.className = 'canonical-feature-card__head';
    const title = makeText(feature.title, 'h3'); title.className = 'md-title-medium canonical-feature-card__title'; title.id = `canonical-feature-${feature.id}-title`;
    const id = document.createElement('code'); id.className = 'canonical-feature-card__id'; id.textContent = feature.id;
    const titleWrap = document.createElement('div'); titleWrap.append(title, id);
    const status = document.createElement('span'); status.className = `md-status canonical-feature-card__status md-status--${feature.status === 'available' ? 'shipped' : feature.status === 'partial' ? 'progress' : 'none'}`; status.textContent = statusLabel(feature.status);
    head.append(titleWrap, status);
    const copy = makeText(feature.copy, 'p'); copy.className = 'canonical-feature-card__copy md-body-medium';
    const boundary = makeText(feature.boundary, 'p'); boundary.className = 'canonical-feature-card__boundary md-body-small';
    const feedback = document.createElement('p'); feedback.className = 'canonical-feature-card__feedback md-body-small'; feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
    const actionsWrap = document.createElement('div'); actionsWrap.className = 'canonical-feature-card__actions';
    const inspect = document.createElement('button'); inspect.type = 'button'; inspect.className = 'md-btn md-btn--tonal'; inspect.textContent = mode === 'yue' ? '檢查頁面等價功能' : 'Inspect page equivalent'; inspect.dataset.featureAction = feature.id;
    inspect.addEventListener('click', () => {
      const target = hookFeature(feature);
      if (target) { target.focus(); feedback.textContent = mode === 'yue' ? '已聚焦頁面控制，應用程式狀態仍未驗證。' : 'Focused the page control. Application state remains unverified.'; }
      else { feedback.textContent = mode === 'yue' ? '呢個功能喺此頁保持誠實未提供。' : 'This page equivalent remains honestly unavailable.'; }
      state.lastAction = feature.id; writeState(state);
    });
    const reviewLabel = document.createElement('label'); reviewLabel.className = 'canonical-feature-card__review';
    const review = document.createElement('input'); review.type = 'checkbox'; review.checked = state.reviewed.has(feature.id); review.setAttribute('aria-describedby', `${card.dataset.canonicalFeatureId}-review-note`);
    const reviewText = document.createElement('span'); reviewText.textContent = mode === 'yue' ? '我已檢閱界線' : 'I reviewed the boundary';
    const reviewNote = document.createElement('span'); reviewNote.id = `${feature.id}-review-note`; reviewNote.className = 'visually-hidden'; reviewNote.textContent = 'Review state is stored only in this browser.';
    reviewLabel.append(review, reviewText, reviewNote);
    review.addEventListener('change', () => { if (review.checked) state.reviewed.add(feature.id); else state.reviewed.delete(feature.id); writeState(state); paint(); });
    actionsWrap.append(inspect, reviewLabel);
    card.append(head, copy, boundary, feedback, actionsWrap);
    grid.append(card);
    return card;
  });

  let builder;
  try { builder = attachRegexBuilder(search, { key: 'canonical-feature-suite-search', flags: 'gi', onChange: paint }); } catch (_) { builder = null; }

  function paint() {
    const query = search.value.trim();
    const matcher = builder?.matcher ? builder.matcher() : null;
    let visible = 0;
    cards.forEach((card, index) => {
      const feature = FEATURES[index];
      const haystack = `${feature.id} ${feature.title.en} ${feature.title.yue} ${feature.copy.en} ${feature.copy.yue} ${feature.boundary.en} ${feature.boundary.yue}`;
      const matchesSearch = !query || (matcher ? matcher(haystack) : haystack.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
      const matchesStatus = wanted === 'all' || wanted === feature.status;
      card.hidden = !(matchesSearch && matchesStatus);
      if (!card.hidden) visible += 1;
    });
    count.textContent = `${visible} of ${FEATURES.length} features shown, ${state.reviewed.size} reviewed locally.`;
    if (summary) summary.textContent = mode === 'yue'
      ? `三十項功能矩陣已就緒，${state.reviewed.size} 項已喺本地檢閱`
      : mode === 'bilingual'
        ? `Thirty-feature matrix ready, ${state.reviewed.size} reviewed locally · 三十項功能矩陣已就緒，${state.reviewed.size} 項已喺本地檢閱`
        : `Thirty-feature matrix ready, ${state.reviewed.size} reviewed locally`;
  }

  function visibleFeatures() { return cards.map((card, index) => ({ card, feature: FEATURES[index] })).filter(({ card }) => !card.hidden); }
  selectAll.addEventListener('click', () => { visibleFeatures().forEach(({ feature }) => state.reviewed.add(feature.id)); writeState(state); cards.forEach((card, index) => { const check = card.querySelector('input[type="checkbox"]'); if (check) check.checked = state.reviewed.has(FEATURES[index].id); }); paint(); });
  invert.addEventListener('click', () => { visibleFeatures().forEach(({ feature }) => { if (state.reviewed.has(feature.id)) state.reviewed.delete(feature.id); else state.reviewed.add(feature.id); }); writeState(state); cards.forEach((card, index) => { const check = card.querySelector('input[type="checkbox"]'); if (check) check.checked = state.reviewed.has(FEATURES[index].id); }); paint(); });
  search.addEventListener('input', paint);
  paint();
  return { destroy: () => builder?.destroy?.(), features: FEATURES, state };
}

export { FEATURES, STORAGE_KEY, mount };

let currentMount = null;
function remount() {
  currentMount?.destroy?.();
  const root = document.querySelector('[data-canonical-feature-suite]');
  if (root) {
    root.querySelector('.canonical-feature-suite__toolbar')?.remove();
    root.querySelector('.canonical-feature-suite__grid')?.remove();
    root.classList.remove('is-ready');
    currentMount = mount();
  }
}

i18n.init();
i18n.onChange(remount);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { mountUniversalSettings(); currentMount = mount(); }, { once: true });
else { mountUniversalSettings(); currentMount = mount(); }
