import type { FunnyOverrides } from '../types';

/**
 * 廣東話 funny-level overrides.
 *
 * Level 1 is `locales/zh-HK.ts` — already spoken Cantonese, already warm,
 * and deliberately not in this file. Levels 2–5 add register: 2 softens,
 * 3 gets 抵死, 4 gets 串, 5 is full yum-cha table talk.
 *
 * Same non-negotiable rule as the English map: the level changes 語氣, never
 * 事實. Numbers, versions, paths, counts, and any statement of what an
 * action is about to do are identical from level 1 to level 5, and
 * `keepsTheFacts` in `../index.tsx` throws away any override that lost one.
 *
 * Keys here are chosen to line up with `./en.ts` so a bilingual reader at a
 * given level gets the same energy on both sides of the separator.
 */
export const ZH_HK_FUNNY: FunnyOverrides = {
  'handoff.downloadSucceeded': { 3: '交接匯出下載咗', 5: '份登記冊自己行咗出去喇' },
  'handoff.downloadFailed': { 3: '交接匯出下載唔到', 5: '份下載唔肯出門口' },
  'handoff.statusImplemented': { 3: '已實作', 5: '實作咗，仲有文件做證' },
  'handoff.statusPartial': { 3: '部分完成', 5: '煮熟咗一半' },
  'handoff.statusUnverified': { 3: '未驗證', 5: '等緊個真 app 出嚟作證' },
  // 常用
  'workingDirPicker.title': {
    3: '揀一個要連結嘅程式碼資料夾',
    5: '揀一個要連結嘅程式碼資料夾，Explorer 已經擺好茶等你喇',
  },
  'workingDirPicker.unavailable': {
    3: '資料夾選擇器而家用唔到，請開桌面版再試。',
    5: '資料夾選擇器扭晒計，請開桌面版再試，等 Explorer 出手救場。',
  },
  'chat.linkedFolderPickError': {
    3: '開唔到資料夾選擇器，請再試一次。',
    5: '資料夾選擇器唔肯開，請再試一次，佢今日有啲戲。',
  },
  'common.cancel': { 3: '唔好啦', 5: '當我冇講過' },
  'common.loading': { 3: '整緊喇…', 5: '蒸緊…等陣' },
  'common.none': { 3: '一個都冇', 5: '乾乾淨淨，一個都冇' },
  'common.notInstalled': { 3: '未裝', 5: '搵唔到，未裝' },
  'common.offline': { 3: '冇開', 5: '瞓緊覺' },
  'common.untitled': { 3: '未改名', 5: '至今仍然未改名' },
  'common.justNow': { 3: '啱啱', 5: '啱啱先，好新鮮' },
  'common.exportImageFailed': {
    2: '截圖唔成功。試多次，或者用瀏覽器自己嘅截圖工具。',
    3: '截圖唔肯定格。試多次，或者索性用瀏覽器自己嘅截圖工具。',
    5: '個截圖眨咗吓眼。試多次，或者唔理佢，用瀏覽器自己嘅截圖工具。',
  },

  // 任務錯誤 — 標題短，內文一個指示都冇少
  'chat.runError.title.generic': { 3: '呢個任務仆咗街', 5: '個任務走咗佬' },
  'chat.runError.title.balance': { 3: '餘額唔夠', 5: '個銀包話唔得' },
  'chat.runError.title.connectionDropped': { 3: '連線斷咗', 5: '條線收咗線' },
  'chat.runError.title.rateLimited': { 3: '去到用量上限', 5: '慢啲手，去到上限喇' },
  'chat.runError.title.artifactMissing': { 3: '冇嘢出到', 5: '個籠係空嘅' },
  'chat.runError.title.cliMissing': { 3: 'Agent 未裝', 5: 'Agent 唔喺度' },
  'chat.runError.title.promptTooLarge': { 3: '輸入太長', 5: '你寫咗本小說' },
  'chat.runError.title.modelUnavailable': { 3: '個模型用唔到', 5: '嗰個模型唔喺度' },
  'chat.runError.title.upstreamUnavailable': { 3: '服務暫時用唔到', 5: '上游今日唔係好得閒' },
  'chat.runError.title.toolLoop': { 3: '兜緊圈出唔到嚟', 5: '喺度鬼打牆' },
  'chat.runError.title.outputInvalid': { 3: '模型輸出唔啱格式', 5: '個模型講咗啲火星話' },
  'chat.runError.title.timedOut': { 3: '等到逾時', 5: '等到冇符，收工' },
  'chat.runError.title.emptyOutput': { 3: '冇任何輸出', 5: '靜到得個吉' },
  'chat.runError.title.sessionExpired': { 3: '工作階段過咗期', 5: '嗰個階段過咗期喇' },
  'chat.runError.title.quotaExhausted': { 3: '額度用晒', 5: '額度：清零' },
  'chat.runError.cliMissingMessage': {
    2: '搵唔到 {agent} 呢個命令列工具。裝返佢，確保佢喺你嘅 PATH 入面，然後再試。',
    3: '{agent} 呢個命令列工具唔喺度。裝返佢，記得放埋落 PATH，然後再試。',
    5: '{agent} 唔喺呢部機，起碼 PATH 望到嘅地方都冇。裝返佢，放埋落 PATH，然後再試。',
  },
  'chat.runError.promptTooLargeMessage': {
    3: '呢一回合爆咗模型嘅脈絡上限。剪短個 prompt、拎走啲附件，或者開段新對話，然後再試。',
    5: '個模型舉手投降喇——呢一回合超咗佢嘅脈絡上限。剪短個 prompt、拎走啲附件，或者開段新對話，然後再試。',
  },
  'chat.runError.modelUnavailableMessage': {
    3: '揀咗嘅模型用唔到，又或者根本冇呢個模型。喺設定度轉個，然後再試。',
    5: '你揀嗰個模型用唔到，甚至可能由頭到尾都唔存在。喺設定度轉個，然後再試。',
  },
  'chat.runError.rateLimitedMessage': {
    2: '撞到模型服務嘅用量上限。等陣再試，或者轉第二個模型或服務。',
    3: '模型服務今日睇夠我哋喇——去咗佢嘅用量上限。等陣再試，或者轉第二個模型或服務。',
    5: '模型服務出咗牌：用量上限。等陣再試，或者轉第二個模型或服務。',
  },
  'chat.runError.upstreamUnavailableMessage': {
    3: '模型服務暫時用唔到——通常係上游唔穩，或者網絡／代理有事。等陣再試。',
    5: '模型服務暫時用唔到。通常唔係你嘅錯，係上游唔穩，或者網絡／代理鬧情緒。等陣再試。',
  },
  'chat.runError.toolLoopMessage': {
    3: '{agent} 重重複複做同一件事，一步都冇行前，所以停咗佢。睇返目標檔案或者指令，然後再試。',
    5: '{agent} 做完又做，做完又做，然後原地踏步，所以停咗佢。睇返目標檔案或者指令，然後再試。',
  },
  'chat.runError.outputInvalidMessage': {
    3: '模型出咗啲唔啱格式嘅嘢，呢一回合被打斷咗。試多次通常就返到嚟。',
    5: '模型出嘅嘢，嚴格嚟講唔算係輸出，所以呢一回合被打斷咗。試多次通常就返到嚟。',
  },
  'chat.runError.timedOutMessage': {
    3: '呢次跑得太耐，被停咗。再試一次，或者收窄個任務再試。',
    5: '呢次跑到連個時鐘都眼瞓，所以被停咗。再試一次，或者收窄個任務再試。',
  },
  'chat.runError.inactivityTimeoutMessage': {
    3: '個 agent 靜咗太耐，當逾時停咗佢。試多次通常就會郁返。',
    5: '個 agent 唔出聲耐到當佢逾時，所以停咗佢。試多次通常就嘈返。',
  },
  'chat.runError.emptyOutputMessage': {
    3: '個 agent 做完但係咩都冇出到。通常係一時，再跑一次就得。',
    5: '個 agent 做完，咩都冇出，而且好似仲好滿意。通常係一時，再跑一次就得。',
  },
  'chat.runError.sessionExpiredMessage': {
    3: '恢復嗰個工作階段已經過咗期，已經重設咗。再試一次就會開段全新嘅。',
    5: '你想恢復嗰個工作階段，早就過咗期，已經幫你重設。再試一次就會開段全新嘅。',
  },
  'chat.runError.quotaExhaustedMessage': {
    3: '你嗰邊模型服務嘅額度或者帳單上限用晒，再試都冇用。去供應商嗰邊增值，或者轉第二個模型或服務。',
    5: '你嗰邊模型服務嘅額度同帳單上限都用晒，再試等於落力拍一度鎖咗嘅門。去供應商嗰邊增值，或者轉第二個模型或服務。',
  },
  'chat.runError.workspaceCreditsMessage': {
    3: '呢個工作區冇晒額度。加返額度（或者叫工作區擁有人加），又或者轉第二個模型或服務。',
    5: '呢個工作區乾塘喇，一點額度都冇。加返額度（或者搞掂工作區擁有人），又或者轉第二個模型或服務。',
  },
  'chat.runError.gitBashMissingMessage': {
    3: '喺 Windows 上面跑呢個 agent 要用 Git Bash，但係佢唔喺度。裝咗 Git for Windows，然後再試。',
    5: '呢個 agent 喺 Windows 上面要 Git Bash，而 Git Bash 唔喺度。裝咗 Git for Windows，然後再試。',
  },
  'chat.connectionDropped': {
    2: '回應仲未出完，同模型服務嘅連線就斷咗——通常係網絡或者代理唔穩。試多次啦。',
    3: '講到一半，同模型服務嘅連線就斷咗——通常係網絡或者代理唔穩。試多次啦。',
    5: '模型服務講到一半就 cut 線。通常係網絡或者代理唔穩，唔係佢針對你。試多次啦。',
  },

  // 空白狀態
  'chat.emptyConversations': { 3: '仲未有對話。', 5: '一段對話都冇，白紙一張。' },
  'chat.startTitle': { 3: '開始傾啦', 5: '講句嘢先' },
  'chat.startHint': {
    3: '講吓你想整乜，或者由下面呢啲例子入手：',
    5: '講吓你想整乜。唔想諗就攞下面啲例子用，冇人會數你：',
  },
  'chat.referenceProject.emptyAll': { 3: '仲未有第二個專案', 5: '呢個專案係獨生仔' },
  'chat.referenceProject.empty': { 3: '冇專案啱「{query}」', 5: '一個專案都唔應「{query}」' },
  'chat.importDesignSystemEmpty': { 3: '冇設計系統啱「{query}」', 5: '一個設計系統都唔應「{query}」' },
  'quickSwitcher.empty': { 3: '呢個專案入面冇檔案', 5: '呢個專案一個檔案都冇' },
  'quickSwitcher.noMatches': { 3: '冇嘢啱', 5: '搵唔到，一件都冇' },
  'workspace.noFilesMatch': { 3: '冇檔案啱', 5: '冇檔案肯畀你搵到' },
  'workspace.noPagesYet': { 3: '仲未有頁面', 5: '零頁。講得好聽啲叫留白。' },
  'workspace.pageCreatorEmpty': { 3: '冇頁面類型啱你搵嘅嘢。', 5: '冇頁面類型啱，打少幾隻字試吓。' },
  'messageCenter.emptyAllTitle': { 3: '仲未有訊息', 5: '收件匣：乾乾淨淨' },
  'messageCenter.emptyUnreadTitle': { 3: '全部睇晒喇', 5: '全部睇晒，出去行個街啦' },
  'messageCenter.emptyReadTitle': { 3: '冇睇過嘅訊息', 5: '一條都未睇過，唔嘈你' },
  'messageCenter.emptyBody': {
    3: '有新嘅平台訊息就會喺呢度出現。',
    5: '有新嘅平台訊息就會落嚟呢度。未有之前，享受吓清靜。',
  },
  'chat.plus.noSkills': { 3: '冇 skill 用得', 5: '零 skill，齋靠天份' },
  'newproj.targetPlatformsLabel': { 3: '目標平台', 5: '想喺邊度落腳？' },
  'newproj.targetPlatformsHint': { 3: '揀一個或多個交付平台。', 5: '揀定個專案要去邊幾度生活。' },
  'newproj.platform.desktopApp.label': { 3: '桌面應用程式', 5: '真正嘅桌面應用程式' },
  'newproj.platform.desktopApp.hint': { 3: '產生 Windows Electron 原始 scaffold。', 5: '整個真正嘅 Windows 桌面 starter，唔係瀏覽器扮桌面。' },
  'newproj.dsSearch': { 3: '搜尋選項', 5: '趁啲選項匿埋之前搵吓' },
  'newproj.dsEmpty': { 3: '冇選項啱「{query}」。', 5: '「{query}」一個都唔啱，清單已經發表意見。' },
  'newproj.dsResults': { 3: '有 {count} 個平台選項', 5: '搜尋之後仲生還咗 {count} 個平台選項' },
  'newproj.desktopAgentLabel': { 3: '用於接線的本機代理', 5: '邊個本機 agent 拎螺絲批？' },
  'newproj.desktopAgentSearch': { 3: '搜尋本機代理', 5: '喺本機 agent 個櫃桶搵吓' },
  'newproj.desktopAgentResults': { 3: '搵到 {count} 個本機代理', 5: '{count} 個本機 agent 應咗名' },
  'newproj.desktopAgentEmpty': { 3: '冇本機代理啱「{query}」。', 5: '冇本機 agent 啱「{query}」，個櫃桶今日好安靜。' },
  'newproj.desktopAgentMissing': { 3: '未選取本機代理', 5: '仲未揀本機 agent' },
  'newproj.desktopAgentUnavailable': { 3: '選取的本機代理目前無法使用', 5: '揀嗰個本機 agent 放緊非正式茶歇' },
  'newproj.desktopWireupToggle': { 3: '建立後接線', 5: '建立之後先幫佢接線' },
  'newproj.desktopWireupNotStarted': { 3: '尚未開始。建立後會保留就緒的 scaffold。', 5: '未開始。個 scaffold 會戴住迷你安全帽耐心等候。' },
  'newproj.desktopWireupPromptLabel': { 3: '接線簡述（選填）', 5: '接線簡述（選填，唔使寫論文）' },
  'inlineSwitcher.noAgentsDetected': { 3: 'PATH 上面搵唔到 CLI', 5: 'PATH 搵晒，冇 CLI' },
  'inlineSwitcher.noAgent': { 3: '冇 agent', 5: '一個 agent 都冇' },

  // 危險操作嘅確認 — 刪乜、喺邊度刪、連埋乜一齊冇，每一格都一樣
  'workspace.deleteFileConfirm': {
    2: '喺專案資料夾度刪咗「{name}」？',
    3: '真係要喺專案資料夾度刪咗「{name}」？',
    5: '喺專案資料夾度刪咗「{name}」。呢一下就係「你諗清楚」嗰一下喇。',
  },
  'workspace.deleteSelectedFilesConfirm': {
    2: '喺專案資料夾度刪咗揀咗嘅 {n} 個檔案？',
    3: '真係要喺專案資料夾度刪晒揀咗嘅 {n} 個檔案？',
    5: '喺專案資料夾度刪咗揀咗嘅 {n} 個檔案。全部。係，咁多個。',
  },
  'workspace.deleteSelectedFilesPartial': {
    3: '有 {n} 個檔案唔肯畀你刪。',
    5: '有 {n} 個檔案生還咗，仲喺度。',
  },
  'chat.deleteConversationConfirm': {
    2: '刪咗「{title}」？入面啲訊息會一齊冇埋。',
    3: '刪咗「{title}」？入面啲訊息會跟住一齊走。',
    5: '刪咗「{title}」？入面啲訊息會跟住一齊走，而且返唔到轉頭。',
  },

  'settings.connectorsClearConfirmTitle': {
    3: '真係要清走存咗嘅 Composio API key？',
    5: '清走存咗嘅 Composio API key——真嗰個？',
  },
  'settings.connectorsClearFinalTitle': {
    3: '咁樣會斷晒所有連接器',
    5: '咁樣會斷晒所有連接器。一個都唔會剩。',
  },
  'settings.connectorsClearFinalBody': {
    3: '冇得反悔。之後貼咗個新 key，每個整合都要由頭再駁過。',
    5: '冇得反悔，冇草稿，冇安全網。之後貼個新 key，每個整合都要由頭再駁過。',
  },

  // 提示訊息
  'chat.copyDone': { 3: '複製咗喇！', 5: '複製咗，已經喺你剪貼簿度。' },
  'preview.shareCopied': { 3: '複製咗', 5: '已經喺剪貼簿' },
  'preview.shareCopyFailed': { 3: '複製唔到', 5: '個剪貼簿話唔得' },
  'chat.comments.savedToast': { 3: '評語存咗喇', 5: '評語收埋咗' },
  'chat.comments.pinSavedToast': { 3: '釘咗喇', 5: '釘咗，記住晒' },
  'artifact.odCardRuleSaved': { 3: '「{name}」存咗做一條規則', 5: '「{name}」而家係規則喇，即係家法。' },
  'artifact.odCardRuleError': { 3: '存唔到條規則，試多次啦。', 5: '條規則唔肯畀你存，試多次啦。' },
  'settings.autosaveSaved': { 3: '改動全部存咗', 5: '存咗，一個改動都冇甩' },
  'settings.autosaveError': {
    3: '存唔到改動。本機 daemon 可能冇開。',
    5: '啲改動冇存到。九成係本機 daemon 冇開。',
  },
  'settings.connectorsKeyError': {
    3: '存唔到個 key。睇吓本機 daemon 開咗未，然後再試。',
    5: '個 key 冇存到。睇吓本機 daemon 真係開咗未，然後再試。',
  },
  'chat.annotationPreviewMissing': { 3: '影唔到個預覽，試多次啦。', 5: '個預覽唔肯定格畀你影，試多次啦。' },
  'chat.annotationFailed': { 3: '標註送唔出，試多次啦。', 5: '個標註出唔到門口，試多次啦。' },
  'chat.annotationTimeout': { 3: '標註送咗好耐都未有結果，試多次啦。', 5: '個標註等到逾時都未送到，試多次啦。' },
  'chat.annotationUploadFailed': { 3: '附件上載唔到，試多次啦。', 5: '個附件唔肯上載，試多次啦。' },
  'questions.uploadPartialFailed': {
    3: '上載咗 {uploaded} 個檔案，{failed} 個上唔到。',
    5: '上載咗 {uploaded} 個檔案，{failed} 個留低咗。',
  },
  'questions.uploadFailed': { 3: '有 {failed} 個檔案上載唔到。', 5: '有 {failed} 個檔案唔肯上載。' },
  'questions.uploadNeedsProject': {
    3: '要有個用緊嘅專案先上載到檔案。',
    5: '冇專案就冇得上載檔案，開返個先啦。',
  },
  'workspace.pageCreateFailed': { 3: '整唔到呢一頁。', 5: '呢一頁唔肯出世。' },
  'chat.forkConversationFailed': { 3: '分唔到呢段對話出嚟。', 5: '呢段對話唔肯一分為二。' },
  'chat.referenceProject.loadFailed': {
    3: '載唔到專案清單。睇吓 daemon 開咗未，然後再試。',
    5: '專案清單載唔到。睇吓 daemon 真係開咗未，然後再試。',
  },
  'chat.importDesignSystemFailed': { 3: '轉唔到設計系統，試多次啦。', 5: '個設計系統唔肯郁，試多次啦。' },
  'chat.importDesignSystemLoadFailed': { 3: '載唔到設計系統。', 5: '設計系統：搵唔到。' },
  'home.recommendation.startFailed': { 3: '開唔到頭，試多次啦。', 5: '起唔到步，試多次啦。' },
  'workspace.terminalStartFailed': { 3: '開唔到終端機工作階段', 5: '個終端機唔肯開' },
  'workspace.terminalSessionEnded': { 3: '工作階段完咗', 5: '工作階段完咗，都算做得耐' },
  'preview.errorTitle': { 3: '載唔到呢個例子。', 5: '呢個例子冇現身。' },
  'preview.errorBody': {
    3: '個範例 HTML 攞唔到。睇吓 Material Designer 開咗未，然後再試。',
    5: '個範例 HTML 一直冇到。睇吓 Material Designer 真係開咗未，然後再試。',
  },
  'preview.unavailableTitle': { 3: '{noun} 冇隨附預覽。', 5: '{noun} 出廠嗰陣就冇預覽。' },
  'preview.unavailableBody': {
    3: '喺對話度跑個 prompt，就會生成 {kind} 輸出。',
    5: '喺對話度跑個 prompt，{kind} 輸出就會出現。',
  },
  'project.missing': { 3: '呢個專案已經刪咗，或者根本冇存在過。', 5: '呢個專案冇咗——刪咗，又或者由頭到尾都唔存在。' },
  'tool.running': { 3: '做緊…', 5: '喺廚房度…' },
  'tool.done': { 3: '搞掂', 5: '上枱' },
  'tool.error': { 3: '出錯', 5: '唔多掂' },
  'artifact.odCardScorecardStatusFail': { 3: '仲要執', 5: '仲要執好多' },
  'artifact.odCardScorecardStatusPartial': { 3: '部分過', 5: '一半分' },
  'artifact.odCardScorecardStatusPass': { 3: '過關', 5: '一 take 過' },

  // 更新
  'updater.upToDate': { 3: '你已經係最新版本喇。', 5: '已經最新，冇嘢好做。' },
  'updater.failed': { 3: '更新失敗', 5: '個更新上唔到' },
  'updater.available': { 3: '有更新', 5: '有個新版本喺度' },
  'updater.ready': { 3: '更新準備好', 5: '更新準備好，等緊你' },
  'updater.openFailedFallback': { 3: '開唔到個安裝程式。', 5: '個安裝程式唔肯開。' },
  'updater.quitFailedTitle': { 3: '結束唔到', 5: '佢唔肯走' },
  'updater.activeRunsTitle': { 3: 'Material Designer 仲做緊嘢', 5: 'Material Designer 做到一半' },

  // 新手引導
  'onboarding.brandTitle': { 3: '抽返你嘅設計系統出嚟', 5: '走，去抽返你個設計系統' },
  'onboarding.brandSkip': { 3: '跳過先', 5: '遲啲先算' },
  'onboarding.brandDone': { 3: '設計系統抽好喇', 5: '設計系統：到手' },
  'onboarding.buildTitle': { 3: '整一次，處處都用得', 5: '做一次，之後永遠有得用' },
  'onboarding.buildBenefitMemoryTitle': { 3: '一份品牌記憶', 5: '一份記憶，統領全部' },
  'onboarding.buildBenefitAlignedTitle': { 3: '每個成品都一致', 5: '冇一件走樣' },
  'onboarding.buildBenefitSourcesTitle': { 3: '由你手上有嘅嘢入手', 5: '你有咩就攞咩嚟' },
  'onboarding.buildStart': { 3: '整個設計系統', 5: '開工' },
  'onboarding.buildHome': { 3: '直接入主頁', 5: '唔該，直接入主頁' },
  'project.brandReadyTitleGeneric': { 3: '你個設計系統整好喇', 5: '你個設計系統出爐喇' },
  'project.brandReadyRefineHint': {
    3: '自動抽取一定會漏嘢。大規模用之前，執一執佢先。',
    5: '自動抽取梗係會漏嘢，次次都係。大規模用之前，執一執佢先。',
  },
  'home.recommendation.eyebrow': { 3: '幫你揀咗', 5: '我哋估你鍾意呢個' },
  'home.recommendation.primaryCta': { 3: '開始整嘢', 5: '出發' },
  'home.recommendation.change': { 3: '試第二個', 5: '換過個嚟睇' },

  // 問題表
  'questions.banner': { 3: '可唔可以問你幾條快問題？', 5: '問兩條就走，唔阻你耐' },
  'questions.generating': { 3: '諗緊問你啲乜…', 5: '諗緊問題…' },
  'qf.hint': {
    3: '揀啱你嗰啲就得。唔緊要嘅選填題跳過佢 — agent 會用合理嘅預設值。',
    5: '揀啱嗰啲，唔關事嗰啲跳過。agent 有預設值，而且用得好順手。',
  },
  'qf.lockedSubmitted': {
    3: '答案送咗 — 呢節之後 agent 都會照住呢啲嚟做。',
    5: '答案送咗。呢節之後 agent 就照住呢啲行。',
  },
  'qf.submitDisabledTitle': { 3: '要填晒必填嗰啲先得', 5: '必填嗰啲，始終都係必填' },

  // 呢個掣自己
  'settings.funnyTitle': { 3: '語氣', 5: '佢有幾似個人' },
  'settings.funnyHint': {
    3: '文案有幾玩得。每種語言分開較。',
    5: '文案有幾多性格。每種語言各有一個掣。',
  },
  'settings.funnyDisclosureDismiss': { 3: '知道喇', 5: '明白，繼續啦' },
  'settings.funnyDisclosureTitle': {
    3: '呢個 app 識講笑，個掣喺你手',
    5: '係，佢會講笑。唔係，你唔使被迫聽。',
  },
  'settings.funnyDisclosureBody': {
    3: '掣、空白狀態同錯誤訊息可以好認真，都可以好玩，兩種語言分開較。個掣喺「設定 → 語言」度，佢淨係改語氣——唔會改數字、唔會改路徑，更加唔會改一個掣即刻要做嘅嘢。',
    5: '掣、空白狀態同錯誤訊息，想幾認真就幾認真，想幾玩得就幾玩得，兩種語言分開較。個掣喺「設定 → 語言」度。佢淨係改語氣——唔會改數字、唔會改路徑，更加唔會改一個掣即刻要做嘅嘢。一個令你少知一件事嘅笑話，係 bug，唔係功能。',
  },
  'settings.languageModeHint': {
    3: '淨係顯示一種語言，定係兩種一齊顯示。',
    5: '一種語言，定係兩種一齊。兩種真係得㗎。',
  },

  // 第二批：日常介面。冇上面啲錯誤咁緊要，所以多數只寫 3 同 5。
  'common.save': { 3: '儲存', 5: '快手儲存' },
  'common.close': { 3: '閂咗佢', 5: '閂埋佢' },
  'common.clear': { 3: '清走', 5: '抹走佢' },
  'common.delete': { 3: '刪咗佢', 5: '掉咗佢' },
  'common.rename': { 3: '改名', 5: '改個好聽啲嘅名' },
  'common.create': { 3: '整個新嘅', 5: '整一個' },
  'common.search': { 3: '搵', 5: '去搵' },
  'common.searchEllipsis': { 3: '搵嘢…', 5: '去搵…' },
  'common.default': { 3: '預設', 5: '照舊嗰個' },
  'common.installed': { 3: '裝咗', 5: '喺度，裝咗' },
  'common.active': { 3: '用緊', 5: '當更中' },
  'common.all': { 3: '全部', 5: '全個餐' },
  'common.openPreview': { 3: '開預覽', 5: '睇吓先' },
  'entry.navNewProject': { 3: '開個新專案', 5: '搞啲嘢' },
  'entry.navHome': { 3: '主頁', 5: '返基地' },
  'entry.loadingWorkspace': { 3: '工作區載緊…', 5: '擺緊枱…' },
  'entry.githubStarTitle': {
    3: '有心嘅話，去 GitHub 幫我哋 star',
    5: 'GitHub star 一粒都唔使錢，我哋會見到㗎',
  },
  'workspace.newTab': { 3: '新分頁', 5: '再開多個分頁' },
  'workspace.focusMode': { 3: '專心做嘢', 5: '其他嘢，行開啲' },
  'workspace.closeTab': { 3: '閂咗呢個分頁', 5: '呢個分頁，收皮' },
  'workspace.createNew': { 3: '整個新嘅', 5: '整個新嘅出嚟' },
  'workspace.loadingSketch': { 3: '草圖載緊…', 5: '攤開張草圖…' },
  'workspace.terminalStarting': { 3: '終端機開緊…', 5: '嗌醒個終端機…' },
  'workspace.terminalStartingDescription': {
    3: '準備緊專案 shell，通常幾秒就得。',
    5: '準備緊專案 shell。真係幾秒咋。',
  },
  'workspace.terminalReconnecting': { 3: '重新連緊…', 5: '再試緊…' },
  'chat.composerPlaceholder': {
    3: '講吓你想整乜…',
    5: '話佢知你想要乜。講得越清楚佢越鍾意…',
  },
  'chat.newConversation': { 3: '開過段新對話', 5: '由頭嚟過' },
  'chat.jumpToLatest': { 3: '跳去最新', 5: '帶我去最底' },
  'chat.copyPrompt': { 3: '複製 prompt', 5: '偷咗呢個 prompt' },
  'chat.attachTitle': {
    3: '夾檔案（貼上、拖入嚟都得）',
    5: '夾檔案。貼上同拖入嚟一樣得。',
  },
  'chat.importComingSoon': { 3: '就快有', 5: '未得，快喇' },
  'chat.importSoon': { 3: '就快', 5: '就快啦' },
  'chat.tabComments': { 3: '評語', 5: '意見' },
  'chat.commentsSoon': { 3: '評語 — 就快有', 5: '評語 — 未得，但係快喇' },
  'messageCenter.markAllRead': { 3: '全部當睇咗', 5: '一句講晒：全部睇咗' },
  'messageCenter.subtitle': {
    3: 'Open Design 更新、平台公告同埋帳戶通知，全部喺呢度。',
    5: 'Open Design 更新、平台公告同帳戶通知，冇一樣走得甩，全部落晒嚟呢度。',
  },
  'qf.choose': { 3: '揀一個…', 5: '揀個啦…' },
  'qf.otherOption': { 3: '其他', 5: '第啲嘢' },
  'qf.required': { 3: '一定要填', 5: '走唔甩，要填' },
  'qf.submitDefault': { 3: '送出答案', 5: '送出' },
  'qf.answered': { 3: '答咗', 5: '搞掂咗' },
  'questions.continue': { 3: '繼續', 5: '行落去' },
  'questions.skipAll': { 3: '全部跳過', 5: '全部唔答' },
  'questions.bannerAnswered': { 3: '問題答咗喇', 5: '問題：答晒' },
  'questions.autoSkipHint': {
    3: '計時完咗就會自己繼續',
    5: '計時一完，唔等你都繼續',
  },
  'tool.todos': { 3: '待辦', 5: '張單' },
  'tool.todosDone': { 3: '搞掂', 5: '全部搞掂' },
  'tool.todosDismiss': { 3: '收埋張任務清單', 5: '將張任務清單擺埋一邊' },
  'tool.hide': { 3: '收埋', 5: '擺埋一邊' },
  'tool.output': { 3: '輸出', 5: '佢講咗啲乜' },
  'preview.retry': { 3: '再試', 5: '再嚟過' },
  'preview.duplicateTemplateDesc': {
    3: '將呢個例子 remix 做一個改得嘅新專案',
    5: '將呢個例子帶去第二度 — 你會有個自己改得嘅專案',
  },
  'preview.loading': { 3: '載緊 {label}…', 5: '攞緊 {label}…' },
  'project.brandReadyDismiss': { 3: '知道喇', 5: '收到' },
  'project.brandReadyCta': { 3: '喺「設計系統」度預覽', 5: '去「設計系統」度睇吓佢' },
  'project.instructionsActive': {
    3: '生效中 — 每次訊息都會夾埋',
    5: '生效中。每次訊息都夾埋，一次都唔會漏。',
  },
  'settings.languageHint': {
    3: '轉介面語言。設定淨係存喺呢個瀏覽器度。',
    5: '轉介面語言。呢個設定淨係記喺呢個瀏覽器度。',
  },
  'settings.appearanceHint': {
    3: '淺色、深色，或者你系統做緊乜就跟乜。',
    5: '淺色、深色，又或者索性跟返你系統做緊嗰套。',
  },
  'settings.resetOnboardingDesc': {
    3: '由頭再行一次新手設定，連品牌抽取都做多次。',
    5: '成個新手設定由頭嚟過，品牌抽取都一併再做。',
  },
  'updater.checking': { 3: '查緊有冇更新', 5: '望吓有冇更新' },
  'updater.downloading': { 3: '下載緊更新', 5: '攞緊個更新' },
  'updater.later': { 3: '遲啲先', 5: '而家唔使' },
  'updater.opening': { 3: '開緊安裝程式...', 5: '搞緊個安裝程式出嚟...' },
  'updater.quitting': { 3: '結束緊...', 5: '執緊嘢走...' },
  'updater.restartAnyway': { 3: '照重開', 5: '唔理咁多，重開' },
  'updater.viewVersionFeatures': { 3: '睇吓新功能', 5: '睇吓有咩新嘢' },
  'updater.manualDownload': { 3: '自己手動下載', 5: '好啦，我自己嚟' },
  'inlineSwitcher.daemonOffline': { 3: 'Daemon 冇開 — 開設定睇吓', 5: 'Daemon 瞓咗 — 開設定睇吓' },
  'inlineSwitcher.missingApiKey': {
    3: '未設 API key — 去設定加返佢。',
    5: '而家一個 API key 都冇。去設定加返佢，就繼續得。',
  },
  'artifact.odCardRuleKeep': { 3: '留返', 5: '留低佢' },
  'artifact.odCardRuleDiscard': { 3: '唔要', 5: '掉咗佢' },
  'artifact.odCardRuleSaving': { 3: '存緊…', 5: '寫緊落簿…' },
  'artifact.odCardBrandAssistWorking': { 3: '開始緊...', 5: '搞緊喇...' },
  'artifact.odCardBrandAssistError': {
    3: '開唔到瀏覽器協助，試多次啦。',
    5: '瀏覽器協助唔肯開。試多次啦。',
  },
  'integrations.agentReady': { 3: 'Agent 用得', 5: '你個 agent 用得呢個' },
};
