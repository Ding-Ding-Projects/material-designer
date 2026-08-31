import { useCallback } from 'react';
import { useI18n, type FunnyLanguage, type FunnyLevel } from '../../i18n';

export type ConverterCopyKey =
  | 'localTools' | 'title' | 'description' | 'chooseSources' | 'browserFallback'
  | 'noSource' | 'sourcesSelected' | 'firstSourceNote' | 'chooseDestination'
  | 'destinationSelected' | 'noDestination' | 'chooseSourceNotice' | 'cancelled'
  | 'browserSourceSelected' | 'desktopRequired' | 'previewReady' | 'reviewDisclosure'
  | 'queued' | 'queueStarted' | 'existingRefused' | 'queuePaused' | 'queueResumed'
  | 'queueCancelled' | 'selectedCancelled' | 'selectedRetried' | 'queueExported'
  | 'queueTitle' | 'queueRecords' | 'start' | 'pause' | 'resume' | 'cancel'
  | 'cancelSelected' | 'retrySelected' | 'exportQueue' | 'selectAll' | 'emptyQueue'
  | 'notificationHistory' | 'localHistory' | 'historyDisclosure' | 'contextActions'
  | 'editAppearance' | 'lockElement' | 'closeMenu' | 'pdfTools' | 'operation'
  | 'inspect' | 'split' | 'merge' | 'extract' | 'reorder' | 'rotate' | 'metadata'
  | 'pdfUnavailable' | 'inspectPdf' | 'adapters' | 'targetFormats' | 'searchAdapters'
  | 'searchTargets' | 'noAdapters' | 'bundledOffline' | 'unavailable' | 'targetFormat'
  | 'preview' | 'addQueue' | 'conversionPreview' | 'conversionQueue' | 'convertNow'
  | 'overwriteAction' | 'overwriteTarget' | 'overwriteDetail' | 'overwriteItem'
  | 'overwriteFailed' | 'conversionComplete' | 'conversionFailed' | 'conversionCancelled'
  | 'browserEquivalent' | 'browserUnavailable' | 'browserReset' | 'copyFailed'
  | 'acknowledgeDisclosure' | 'disclosureAcknowledged' | 'disclosureRequired'
  | 'previewRequired'
  | 'integrationRequired' | 'queuePageRecords' | 'firstQueuePage' | 'nextQueuePage'
  | 'selectAllPage'
  | 'images' | 'audio' | 'video' | 'archives' | 'structuredData' | 'codeText' | 'binaryEncodings';

type Variables = Record<string, string | number>;

const EN: Record<ConverterCopyKey, string> = {
  localTools: 'Local tools', title: 'File converter', description: 'Convert local files offline with bounded adapters, reviewable loss disclosures, and resumable progress.', chooseSources: 'Choose source files', browserFallback: 'Browser-local equivalent', noSource: 'No source selected', sourcesSelected: '{n} source files selected', firstSourceNote: 'The first source is used for single-file operations.', chooseDestination: 'Choose destination', destinationSelected: 'Destination selected: {name}.', noDestination: 'No destination selected', chooseSourceNotice: 'Choose a source file to begin.', cancelled: '{what} selection cancelled.', browserSourceSelected: 'Browser-local source selected: {name}, {bytes} bytes. Desktop conversion requires the host bridge.', desktopRequired: 'The desktop host bridge is required for this operation.', previewReady: 'Preview ready for {target}.', previewRequired: 'Run Preview for this source and target before queuing or converting.', reviewDisclosure: 'Review the loss disclosure before converting.', acknowledgeDisclosure: 'I understand this conversion disclosure', disclosureAcknowledged: 'Loss disclosure acknowledged for this conversion.', disclosureRequired: 'A current disclosure acknowledgement is required before queuing or converting.', integrationRequired: 'This action is waiting for its parent integration seam.', queued: 'Queued {name} for {target} in the durable host queue.', queueStarted: 'Durable conversion queue started. Existing destinations require confirmation.', existingRefused: 'Existing destinations require the two-key slider before replacement.', queuePaused: 'Durable conversion queue paused.', queueResumed: 'Durable conversion queue resumed.', queueCancelled: 'Queued conversions cancelled by the host queue.', selectedCancelled: 'Selected durable queue records cancelled.', selectedRetried: 'Selected failed queue records returned to queued state.', queueExported: 'Complete queue exported without source bytes.', queueTitle: 'Conversion queue', queueRecords: '{n} queued records', queuePageRecords: 'Showing {n} queue records on page {page}; use Next page for more.', start: 'Start', pause: 'Pause', resume: 'Resume', cancel: 'Cancel', cancelSelected: 'Cancel selected', retrySelected: 'Retry selected', exportQueue: 'Export complete queue', firstQueuePage: 'First queue page', nextQueuePage: 'Next queue page', selectAll: 'Select all queue records', selectAllPage: 'Select all records on this page', emptyQueue: 'No files are queued yet.', notificationHistory: 'Notification history', localHistory: 'Local history events', historyDisclosure: 'Event summaries omit source bytes and credentials.', contextActions: 'Converter context actions', editAppearance: 'Edit appearance', lockElement: 'Lock this element', closeMenu: 'Close menu', pdfTools: 'PDF tools', operation: 'Operation', inspect: 'Inspect', split: 'Split', merge: 'Merge', extract: 'Extract text', reorder: 'Reorder', rotate: 'Rotate', metadata: 'Metadata', pdfUnavailable: 'Content-preserving PDF edits are unavailable until a bundled rewrite engine is verified.', inspectPdf: 'Inspect PDF', adapters: '{name} adapters', targetFormats: '{name} target formats', searchAdapters: 'Search adapters and formats', searchTargets: 'Search target formats', noAdapters: 'No adapters match this search.', bundledOffline: 'Bundled offline adapter · {encoding}', unavailable: 'Unavailable: {reason}', targetFormat: 'Target format', preview: 'Preview', addQueue: 'Add to queue', conversionPreview: 'Conversion preview', conversionQueue: 'Conversion queue', convertNow: 'Convert now', overwriteAction: 'Replace existing destination', overwriteTarget: '{name}', overwriteDetail: 'This exact destination already exists. Two independent keys and the full slider authorize one replacement only.', overwriteItem: 'Existing destination: {name}', overwriteFailed: 'The replacement was not completed.', conversionComplete: 'The converted output was validated and promoted.', conversionFailed: 'Conversion did not complete: {reason}', conversionCancelled: 'Conversion cancelled.', browserEquivalent: 'Browser-local converter', browserUnavailable: 'The browser equivalent cannot write desktop files. The selected file remains local to this page.', browserReset: 'Clear browser-local selection', copyFailed: 'The export could not be copied.', images: 'Images', audio: '聲音', video: '影片', archives: '壓縮檔', structuredData: '結構化資料 / 試算表', codeText: '程式碼 / 文字', binaryEncodings: '二進制編碼'
};

const YUE: Record<ConverterCopyKey, string> = {
  ...EN,
  localTools: '本機工具', title: '檔案轉換器', description: '離線轉換本機檔案，適配器有界限，轉換損失先講清楚，進度可以繼續。', chooseSources: '揀來源檔案', browserFallback: '瀏覽器本機版本', noSource: '未揀來源', sourcesSelected: '揀咗 {n} 個來源檔案', firstSourceNote: '單檔操作會用第一個來源。', chooseDestination: '揀目的地', destinationSelected: '已揀目的地：{name}。', noDestination: '未揀目的地', chooseSourceNotice: '先揀一個來源檔案。', cancelled: '{what}揀檔取消咗。', browserSourceSelected: '瀏覽器本機來源已揀：{name}，{bytes} bytes。桌面轉換要靠主機橋接。', desktopRequired: '呢個操作需要桌面主機橋接。', previewReady: '{target}預覽準備好喇。', previewRequired: '揀好來源同目標之後，先預覽再排隊或者轉換。', reviewDisclosure: '轉換之前先睇清楚損失提示。', acknowledgeDisclosure: '我明白呢次轉換嘅損失提示', disclosureAcknowledged: '今次轉換嘅損失提示已確認。', disclosureRequired: '排隊或者轉換之前，要有仍然有效嘅損失提示確認。', integrationRequired: '呢個操作等緊父層整合接口。', queued: '已將 {name} 排入 {target} 穩陣隊列。', queueStarted: '穩陣轉換隊列開始咗。已有目的地要先確認。', existingRefused: '已有目的地，要用兩把匙同完整滑桿先可以替換。', queuePaused: '穩陣轉換隊列暫停咗。', queueResumed: '穩陣轉換隊列繼續喇。', queueCancelled: '主機隊列取消咗排隊轉換。', selectedCancelled: '揀中嘅隊列紀錄取消咗。', selectedRetried: '揀中失敗紀錄返返去排隊狀態。', queueExported: '完整隊列已匯出，冇帶來源內容。', queueTitle: '轉換隊列', queueRecords: '{n} 個排隊紀錄', queuePageRecords: '而家顯示第 {page} 頁嘅 {n} 個隊列紀錄，用下一頁繼續睇。', start: '開始', pause: '暫停', resume: '繼續', cancel: '取消', cancelSelected: '取消揀中', retrySelected: '重試揀中', exportQueue: '匯出完整隊列', firstQueuePage: '隊列第一頁', nextQueuePage: '隊列下一頁', selectAll: '揀晒所有隊列紀錄', selectAllPage: '揀晒呢一頁嘅紀錄', emptyQueue: '而家未有檔案排隊。', notificationHistory: '通知紀錄', localHistory: '本機歷史事件', historyDisclosure: '事件摘要唔包括來源內容同認證資料。', contextActions: '轉換器內容操作', editAppearance: '編輯外觀', lockElement: '鎖定呢個元素', closeMenu: '關閉選單', pdfTools: 'PDF 工具', operation: '操作', inspect: '檢查', split: '分拆', merge: '合併', extract: '抽取文字', reorder: '重排', rotate: '旋轉', metadata: '中繼資料', pdfUnavailable: '未驗證有內置改寫引擎之前，保留內容嘅 PDF 編輯會清楚顯示為不可用。', inspectPdf: '檢查 PDF', adapters: '{name} 適配器', targetFormats: '{name} 目標格式', searchAdapters: '搜尋適配器同格式', searchTargets: '搜尋目標格式', noAdapters: '搵唔到符合嘅適配器。', bundledOffline: '內置離線適配器 · {encoding}', unavailable: '不可用：{reason}', targetFormat: '目標格式', preview: '預覽', addQueue: '加入隊列', conversionPreview: '轉換預覽', conversionQueue: '轉換隊列', convertNow: '即刻轉換', overwriteAction: '替換已有目的地', overwriteTarget: '{name}', overwriteDetail: '呢個目的地已存在。兩把獨立匙同完整滑桿只授權一次替換。', overwriteItem: '已有目的地：{name}', overwriteFailed: '今次替換未完成。', conversionComplete: '轉換輸出已驗證並正式放好。', conversionFailed: '轉換未完成：{reason}', conversionCancelled: '轉換取消咗。', browserEquivalent: '瀏覽器本機轉換器', browserUnavailable: '瀏覽器版本唔可以寫入桌面檔案。揀咗嘅檔案只留喺呢頁。', browserReset: '清除瀏覽器本機揀檔', copyFailed: '匯出內容複製唔到。', images: '圖片', audio: '聲音', video: '影片', archives: '壓縮檔', structuredData: '結構化資料 / 試算表', codeText: '程式碼 / 文字', binaryEncodings: '二進制編碼'
};

const EN_CANONICAL: Record<ConverterCopyKey, string> = {
  ...EN,
  audio: 'Audio',
  video: 'Video',
  structuredData: 'Structured Data / Spreadsheets',
  codeText: 'Code / Text',
  binaryEncodings: 'Binary Encodings',
};

function interpolate(template: string, vars?: Variables): string {
  return template.replace(/\{([A-Za-z]+)\}/g, (_match, key: string) => vars?.[key] == null ? `{${key}}` : String(vars[key]));
}

function tone(text: string, language: FunnyLanguage, level: FunnyLevel, key: ConverterCopyKey): string {
  if (level <= 1) return text;
  const enTag = ['.', ' (The converter is keeping the paperwork tidy.)', ' (The queue is wearing a tiny clipboard.)', ' (The bytes are marching in sensible little rows.)', ' (The converter has put on its very serious paperwork hat.)'][level - 1];
  const yueTag = ['。', '（轉換器幫你執齊啲文件喇。）', '（隊列拎住細細塊寫字板排緊隊。）', '（啲 bytes 而家乖乖排隊行。）', '（轉換器戴咗份超認真文件帽。）'][level - 1];
  if (!['description', 'previewReady', 'queued', 'queueStarted', 'queuePaused', 'queueResumed', 'queueCancelled', 'conversionComplete', 'conversionFailed', 'conversionCancelled'].includes(key)) return text;
  return `${text}${language === 'en' ? enTag : yueTag}`;
}

export function useConverterCopy(): (key: ConverterCopyKey, vars?: Variables) => string {
  const { locale, languageMode, funnyLevels } = useI18n();
  return useCallback((key: ConverterCopyKey, vars?: Variables) => {
    const en = tone(interpolate(EN_CANONICAL[key], vars), 'en', funnyLevels.en, key);
    const yue = tone(interpolate(YUE[key], vars), 'zh-HK', funnyLevels['zh-HK'], key);
    if (languageMode === 'bilingual') return `${en} · ${yue}`;
    return locale === 'zh-HK' ? yue : en;
  }, [funnyLevels, languageMode, locale]);
}

export const CATEGORY_COPY_KEYS: Record<string, ConverterCopyKey> = {
  'documents-pdf': 'pdfTools', images: 'images', audio: 'audio', video: 'video', archives: 'archives', 'structured-data': 'structuredData', 'code-text': 'codeText', 'binary-encodings': 'binaryEncodings',
};
