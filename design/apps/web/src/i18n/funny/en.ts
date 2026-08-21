import type { FunnyOverrides } from '../types';

/**
 * English funny-level overrides.
 *
 * Level 1 is `locales/en.ts` itself and is deliberately absent here — the
 * neutral base is a real level, not a fallback. Levels 2–5 are sparse: this
 * map covers the copy a user actually collides with (errors, empty states,
 * destructive confirmations, toasts, onboarding), not the whole 4,291-key
 * dictionary. A key with no entry renders its base string at every level,
 * which is honest and costs nothing.
 *
 * THE RULE, and it is not negotiable: a level changes VOICE, never FACTS.
 * Every number, version, path, count, licence term, and every statement of
 * what an action is about to do survives verbatim from level 1 to level 5.
 * `keepsTheFacts` in `../index.tsx` enforces the mechanical half of that —
 * an override that loses a `{placeholder}` or a digit is discarded at
 * render time — but it cannot catch a joke that quietly drops the word
 * "permanently". That part is on whoever writes the line.
 */
export const EN_FUNNY: FunnyOverrides = {
  // ---------------------------------------------------------------------
  // Common actions and states
  // ---------------------------------------------------------------------
  'common.cancel': { 3: 'Never mind', 5: 'Forget I asked' },
  'common.loading': { 3: 'Working on it…', 5: 'Steaming the baskets…' },
  'common.none': { 3: 'Nothing here', 5: 'Gloriously empty' },
  'common.notInstalled': { 3: 'not installed', 5: 'nowhere to be found' },
  'common.offline': { 3: 'not running', 5: 'having a nap' },
  'common.untitled': { 3: 'Untitled', 5: 'The Nameless One' },
  'common.justNow': { 3: 'a moment ago', 5: 'basically now' },
  'common.exportImageFailed': {
    2: "Image capture didn't work. Try again, or use your browser's screenshot tool.",
    3: "The screenshot refused to sit still. Try again, or use your browser's own screenshot tool.",
    5: "The image capture blinked. Try again, or go over its head and use your browser's screenshot tool.",
  },

  // ---------------------------------------------------------------------
  // Run errors. Titles stay short and scannable at every level, because a
  // title is what a user reads while already annoyed. Bodies keep every
  // instruction verbatim.
  // ---------------------------------------------------------------------
  'chat.runError.title.generic': { 3: 'That run fell over', 5: 'The run has left the chat' },
  'chat.runError.title.balance': { 3: 'Out of balance', 5: 'The wallet says no' },
  'chat.runError.title.connectionDropped': { 3: 'Connection dropped', 5: 'The line went dead' },
  'chat.runError.title.rateLimited': { 3: 'Usage limit reached', 5: 'Slow down, tiger' },
  'chat.runError.title.artifactMissing': { 3: 'Nothing came out', 5: 'The oven was empty' },
  'chat.runError.title.cliMissing': { 3: 'Agent not installed', 5: 'Agent: not on the premises' },
  'chat.runError.title.promptTooLarge': { 3: 'Input too long', 5: 'That was a novel' },
  'chat.runError.title.modelUnavailable': { 3: 'Model unavailable', 5: 'That model is out' },
  'chat.runError.title.upstreamUnavailable': {
    3: 'Service temporarily unavailable',
    5: 'Upstream is having a day',
  },
  'chat.runError.title.toolLoop': { 3: 'Stuck in a loop', 5: 'Groundhog Day' },
  'chat.runError.title.outputInvalid': { 3: 'Invalid model output', 5: 'The model spoke in tongues' },
  'chat.runError.title.timedOut': { 3: 'Timed out', 5: 'Ran out of patience' },
  'chat.runError.title.emptyOutput': { 3: 'No output produced', 5: 'Deafening silence' },
  'chat.runError.title.sessionExpired': { 3: 'Session expired', 5: 'That session went stale' },
  'chat.runError.title.quotaExhausted': { 3: 'Quota exhausted', 5: 'Quota: gone' },
  'chat.runError.cliMissingMessage': {
    2: "Couldn't find the {agent} command-line tool. Install it, make sure it's on your PATH, and retry.",
    3: "The {agent} command-line tool isn't there. Install it, make sure it's on your PATH, then retry.",
    5: "{agent} is not on this machine, or at least not anywhere PATH looks. Install it, get it onto your PATH, then retry.",
  },
  'chat.runError.promptTooLargeMessage': {
    2: "This turn went past the model's context limit. Shorten your prompt, drop some attachments, or start a new conversation, then retry.",
    3: "That turn ran past the model's context limit. Trim the prompt, drop an attachment or two, or start a fresh conversation, then retry.",
    5: "The model tapped out — that turn exceeded its context limit. Trim the prompt, shed some attachments, or start a new conversation, then retry.",
  },
  'chat.runError.modelUnavailableMessage': {
    3: "That model is unavailable, or it doesn't exist at all. Pick another one in Settings, then retry.",
    5: "The model you asked for is unavailable — or was never real. Pick another in Settings, then retry.",
  },
  'chat.runError.rateLimitedMessage': {
    2: "You've hit the model service's usage limit. Wait a moment and retry, or switch to another model or service.",
    3: "The model service has seen enough of us for now — that's its usage limit. Wait a moment and retry, or switch to another model or service.",
    5: "The model service has cut us off: usage limit reached. Wait a moment and retry, or switch to another model or service.",
  },
  'chat.runError.upstreamUnavailableMessage': {
    3: 'The model service is temporarily unavailable — usually upstream wobble or a network/proxy issue. Retry in a moment.',
    5: 'The model service is temporarily unavailable, which is usually upstream having a moment, or your network/proxy having one. Retry shortly.',
  },
  'chat.runError.toolLoopMessage': {
    3: '{agent} kept doing the same thing over and over with nothing to show for it, so it was stopped. Check the target file or command, then retry.',
    5: '{agent} did the same thing, then did it again, then did it again, and got nowhere — so it was stopped. Check the target file or command, then retry.',
  },
  'chat.runError.outputInvalidMessage': {
    3: 'The model produced invalid output and this turn was interrupted. A retry usually sorts it out.',
    5: 'The model produced something that was not, strictly speaking, valid output, so this turn was interrupted. Retrying usually recovers.',
  },
  'chat.runError.timedOutMessage': {
    3: 'That run took too long and was stopped. Try again, or narrow the task and retry.',
    5: 'That run went long enough to be stopped on principle. Try again, or narrow the task and retry.',
  },
  'chat.runError.inactivityTimeoutMessage': {
    3: 'The agent went quiet for too long and was stopped as a timeout. Retrying usually gets it moving.',
    5: 'The agent went silent long enough to be declared a timeout, and was stopped. A retry usually wakes it up.',
  },
  'chat.runError.emptyOutputMessage': {
    3: 'The agent finished and produced nothing at all. Usually temporary — retry to run it again.',
    5: 'The agent finished, produced nothing, and looked very pleased about it. This is usually temporary, so retry to run it again.',
  },
  'chat.runError.sessionExpiredMessage': {
    3: 'The resumed session had expired. It has been reset, so retry to start a fresh run.',
    5: 'The session you resumed had already expired. It has been reset — retry to start a fresh run.',
  },
  'chat.runError.quotaExhaustedMessage': {
    3: "Your model service's quota or billing limit is used up, so retrying won't help. Top up with your provider, or switch to another model or service.",
    5: "Your model service's quota or billing limit is spent, so retrying is just knocking harder on a locked door. Top up with your provider, or switch to another model or service.",
  },
  'chat.runError.workspaceCreditsMessage': {
    3: 'This workspace is out of credits. Add credits (or ask the workspace owner to refill), or switch to another model or service.',
    5: 'This workspace has run dry — no credits left. Add credits (or nudge the workspace owner to refill), or switch to another model or service.',
  },
  'chat.runError.gitBashMissingMessage': {
    3: "Running this agent on Windows needs Git Bash, and it isn't here. Install Git for Windows, then retry.",
    5: "This agent needs Git Bash on Windows, and Git Bash is not here. Install Git for Windows, then retry.",
  },
  'chat.connectionDropped': {
    2: 'The connection to the model service dropped before the response finished — usually an unstable network or proxy. Please retry.',
    3: 'The connection to the model service dropped mid-sentence — usually an unstable network or proxy. Please retry.',
    5: 'The model service hung up on us mid-sentence. That is usually an unstable network or proxy rather than a personal slight. Please retry.',
  },

  // ---------------------------------------------------------------------
  // Empty states
  // ---------------------------------------------------------------------
  'chat.emptyConversations': { 3: 'No conversations yet.', 5: 'Not a single conversation. Pristine.' },
  'conv.empty': { 3: 'No conversations yet.', 5: 'Nothing here but tumbleweed.' },
  'chat.startTitle': { 3: 'Start a conversation', 5: 'Say something' },
  'chat.startHint': {
    3: 'Describe what you want to generate, or steal one of these examples:',
    5: 'Tell it what you want. Or take one of these examples — nobody is counting:',
  },
  'chat.referenceProject.emptyAll': { 3: 'No other projects yet', 5: 'This project is an only child' },
  'chat.referenceProject.empty': { 3: 'Nothing matches “{query}”', 5: 'Not one project answers to “{query}”' },
  'chat.importDesignSystemEmpty': {
    3: 'No design systems match "{query}"',
    5: 'No design system answers to "{query}"',
  },
  'quickSwitcher.empty': { 3: 'No files in this project', 5: 'This project has no files at all' },
  'quickSwitcher.noMatches': { 3: 'Nothing matches', 5: 'Nothing. Not a sausage.' },
  'workspace.noFilesMatch': { 3: 'Nothing matches', 5: 'No file wants to be found' },
  'workspace.noPagesYet': { 3: 'No pages yet', 5: 'Zero pages. A blank canvas, if you are feeling generous.' },
  'workspace.pageCreatorEmpty': {
    3: 'No page types match your search.',
    5: 'No page type matches that search. Try fewer words at it.',
  },
  'messageCenter.emptyAllTitle': { 3: 'No messages yet', 5: 'Inbox: gloriously empty' },
  'messageCenter.emptyUnreadTitle': { 3: 'All caught up', 5: 'All caught up. Go outside.' },
  'messageCenter.emptyReadTitle': { 3: 'No read messages', 5: 'Nothing read. No judgement.' },
  'messageCenter.emptyBody': {
    3: 'New platform messages will show up here.',
    5: 'New platform messages land here. Until then, enjoy the quiet.',
  },
  'chat.plus.noSkills': { 3: 'No skills available', 5: 'No skills. Raw talent only.' },
  'agentPicker.noAgents': { 3: 'no agents on PATH', 5: 'PATH is empty of agents' },
  'newproj.targetPlatformsLabel': { 3: 'Target platforms', 5: 'Where should this thing run?' },
  'newproj.targetPlatformsHint': { 3: 'Choose one or more delivery surfaces.', 5: 'Pick the places this project is meant to live.' },
  'newproj.platform.desktopApp.label': { 3: 'Desktop application', 5: 'A proper desktop application' },
  'newproj.platform.desktopApp.hint': { 3: 'Generates a Windows Electron source scaffold.', 5: 'Makes a real Windows desktop starter, not a browser pretending.' },
  'newproj.dsSearch': { 3: 'Search options', 5: 'Search the options before they hide' },
  'newproj.dsEmpty': { 3: 'No options match “{query}”.', 5: 'Nothing matches “{query}”. The list has spoken.' },
  'newproj.dsResults': { 3: '{count} platform options available', 5: '{count} platform options survived the search' },
  'newproj.desktopAgentLabel': { 3: 'Local agent for wire-up', 5: 'Which local agent gets the screwdriver?' },
  'newproj.desktopAgentSearch': { 3: 'Search local agents', 5: 'Search the local agent cupboard' },
  'newproj.desktopAgentResults': { 3: '{count} local agents found', 5: '{count} local agents answered the roll call' },
  'newproj.desktopAgentEmpty': { 3: 'No local agents match “{query}”.', 5: 'No local agent matches “{query}”. The cupboard is quiet.' },
  'newproj.desktopAgentMissing': { 3: 'No selected local agent', 5: 'No local agent picked yet' },
  'newproj.desktopAgentUnavailable': { 3: 'The selected local agent is unavailable', 5: 'The selected local agent is taking an unscheduled tea break' },
  'newproj.desktopWireupToggle': { 3: 'Wire up after creation', 5: 'Wire it up after creation' },
  'newproj.desktopWireupNotStarted': { 3: 'Not started. Creation will leave the scaffold ready.', 5: 'Not started. The scaffold will wait patiently, wearing its tiny hard hat.' },
  'newproj.desktopWireupPromptLabel': { 3: 'Wire-up brief (optional)', 5: 'Wire-up brief (optional, no essay required)' },
  'inlineSwitcher.noAgentsDetected': { 3: 'No CLI found on PATH', 5: 'PATH searched. No CLI found.' },
  'inlineSwitcher.noAgent': { 3: 'no agent', 5: 'agentless' },

  // ---------------------------------------------------------------------
  // Destructive confirmations. Every fact — what is deleted, from where,
  // and that it takes messages with it — is identical at every level.
  // ---------------------------------------------------------------------
  'workspace.deleteFileConfirm': {
    2: 'Delete "{name}" from the project folder?',
    3: 'Delete "{name}" from the project folder — really?',
    5: 'Delete "{name}" from the project folder. This is the part where you are sure.',
  },
  'workspace.deleteSelectedFilesConfirm': {
    2: 'Delete {n} selected file(s) from the project folder?',
    3: 'Delete {n} selected file(s) from the project folder — all of them?',
    5: 'Delete {n} selected file(s) from the project folder. All of them. Yes, that many.',
  },
  'workspace.deleteSelectedFilesPartial': {
    3: '{n} file(s) refused to be deleted.',
    5: '{n} file(s) survived. They are still there.',
  },
  'chat.deleteConversationConfirm': {
    2: 'Delete "{title}"? This removes its messages.',
    3: 'Delete "{title}"? Its messages go with it.',
    5: 'Delete "{title}"? Its messages go with it, and they are not coming back.',
  },
  'conv.deleteConfirm': {
    2: 'Delete "{title}"? This removes its messages.',
    3: 'Delete "{title}"? Its messages go with it.',
    5: 'Delete "{title}"? Its messages go with it, and they are not coming back.',
  },
  'settings.connectorsClearConfirmTitle': {
    3: 'Clear the saved Composio API key?',
    5: 'Clear the saved Composio API key — the real one?',
  },
  'settings.connectorsClearFinalTitle': {
    3: 'This disconnects every connector',
    5: 'This disconnects every connector. Every single one.',
  },
  'settings.connectorsClearFinalBody': {
    3: 'There is no undo. After pasting a new key you will reconnect every integration from scratch.',
    5: 'There is no undo, no draft, no safety net. Paste a new key later and you reconnect every integration from scratch.',
  },

  // ---------------------------------------------------------------------
  // Toasts and inline results
  // ---------------------------------------------------------------------
  'chat.copyDone': { 3: 'Copied!', 5: 'Copied. It is on your clipboard now.' },
  'preview.shareCopied': { 3: 'Copied', 5: 'On the clipboard' },
  'preview.shareCopyFailed': { 3: 'Copy failed', 5: 'The clipboard said no' },
  'chat.comments.savedToast': { 3: 'Comment saved', 5: 'Comment filed away' },
  'chat.comments.pinSavedToast': { 3: 'Pin saved', 5: 'Pinned and remembered' },
  'artifact.odCardRuleSaved': { 3: 'Saved “{name}” as a rule', 5: '“{name}” is a rule now. It is law.' },
  'artifact.odCardRuleError': {
    3: "Couldn't save the rule. Try again.",
    5: 'The rule refused to be saved. Try again.',
  },
  'settings.autosaveSaved': { 3: 'All changes saved', 5: 'Saved. Every last change.' },
  'settings.autosaveError': {
    3: "Couldn't save changes. The local daemon may be offline.",
    5: 'Changes did not save. The local daemon may be offline — that is usually the culprit.',
  },
  'settings.connectorsKeyError': {
    3: "Couldn't save the key. Check the local daemon is running, then try again.",
    5: 'The key did not save. Check the local daemon is actually running, then try again.',
  },
  'chat.annotationPreviewMissing': {
    3: "Couldn't capture the preview. Please try again.",
    5: 'The preview would not hold still long enough to capture. Please try again.',
  },
  'chat.annotationFailed': {
    3: "The annotation didn't send. Please try again.",
    5: 'The annotation did not make it out the door. Please try again.',
  },
  'chat.annotationTimeout': {
    3: 'Annotation send timed out. Please try again.',
    5: 'The annotation send waited, and waited, and timed out. Please try again.',
  },
  'chat.annotationUploadFailed': {
    3: "The attachment didn't upload. Please try again.",
    5: 'The attachment refused to upload. Please try again.',
  },
  'questions.uploadPartialFailed': {
    3: 'Uploaded {uploaded} file(s); {failed} did not make it.',
    5: 'Uploaded {uploaded} file(s). {failed} stayed behind.',
  },
  'questions.uploadFailed': {
    3: 'File upload failed for {failed} file(s).',
    5: '{failed} file(s) refused to upload.',
  },
  'questions.uploadNeedsProject': {
    3: 'File upload needs an active project.',
    5: 'No active project, no file upload. Open one first.',
  },
  'workspace.pageCreateFailed': { 3: "Couldn't create the page.", 5: 'The page declined to exist.' },
  'chat.forkConversationFailed': {
    3: "Couldn't fork this conversation.",
    5: 'This conversation refused to split in two.',
  },
  'chat.referenceProject.loadFailed': {
    3: "Couldn't load projects. Check the daemon is running and try again.",
    5: 'Projects would not load. Check the daemon is actually running, then try again.',
  },
  'chat.importDesignSystemFailed': {
    3: "Couldn't switch design system. Please try again.",
    5: 'The design system would not budge. Please try again.',
  },
  'chat.importDesignSystemLoadFailed': {
    3: "Couldn't load design systems.",
    5: 'Design systems: unreachable.',
  },
  'home.recommendation.startFailed': {
    3: "Couldn't start creating. Please try again.",
    5: 'That refused to get started. Please try again.',
  },
  'workspace.terminalStartFailed': {
    3: "Couldn't start the terminal session",
    5: 'The terminal declined to open',
  },
  'workspace.terminalSessionEnded': { 3: 'Session ended', 5: 'Session over. It had a good run.' },
  'preview.errorTitle': { 3: "Couldn't load this example.", 5: 'This example did not show up.' },
  'preview.errorBody': {
    3: 'The example HTML failed to fetch. Check Material Designer is running and try again.',
    5: 'The example HTML never arrived. Check Material Designer is actually running, then try again.',
  },
  'preview.unavailableTitle': { 3: 'No shipped preview for {noun}.', 5: '{noun} ships without a preview.' },
  'preview.unavailableBody': {
    3: 'Run the prompt in chat to generate {kind} output.',
    5: 'Run the prompt in chat and {kind} output will exist.',
  },
  'project.missing': {
    3: 'This project has been deleted, or never existed.',
    5: 'This project is gone — deleted, or never real to begin with.',
  },
  'tool.running': { 3: 'working…', 5: 'in the kitchen…' },
  'tool.done': { 3: 'done', 5: 'served' },
  'tool.error': { 3: 'error', 5: 'not great' },
  'artifact.odCardScorecardStatusFail': { 3: 'Needs work', 5: 'Needs a lot of work' },
  'artifact.odCardScorecardStatusPartial': { 3: 'Partial', 5: 'Half marks' },
  'artifact.odCardScorecardStatusPass': { 3: 'Passed', 5: 'Nailed it' },

  // ---------------------------------------------------------------------
  // Updater. Version numbers and consequences are untouched; only the
  // wrapping changes.
  // ---------------------------------------------------------------------
  'updater.upToDate': { 3: "You're already on the latest version.", 5: 'Already on the latest. Nothing to do.' },
  'updater.failed': { 3: 'Update failed', 5: 'The update did not take' },
  'updater.available': { 3: 'Update available', 5: 'A newer version exists' },
  'updater.ready': { 3: 'Update ready', 5: 'Update ready and waiting' },
  'updater.openFailedFallback': { 3: "The installer wouldn't open.", 5: 'The installer refused to open.' },
  'updater.quitFailedTitle': { 3: 'Could not quit', 5: 'It will not quit' },
  'updater.activeRunsTitle': { 3: 'Material Designer is still working', 5: 'Material Designer is mid-task' },

  // ---------------------------------------------------------------------
  // Onboarding
  // ---------------------------------------------------------------------
  'onboarding.brandTitle': { 3: 'Extract your design system', 5: 'Let us go get your design system' },
  'onboarding.brandSkip': { 3: 'Skip for now', 5: 'Later, maybe' },
  'onboarding.brandDone': { 3: 'Design system extracted', 5: 'Design system: acquired' },
  'onboarding.buildTitle': { 3: 'Create once, build everywhere', 5: 'Do it once. Reuse it forever.' },
  'onboarding.buildBenefitMemoryTitle': { 3: 'One brand memory', 5: 'One memory to rule them all' },
  'onboarding.buildBenefitAlignedTitle': { 3: 'Every output stays aligned', 5: 'Nothing wanders off-brand' },
  'onboarding.buildBenefitSourcesTitle': { 3: 'Start from what you have', 5: 'Bring whatever you already own' },
  'onboarding.buildStart': { 3: 'Build a design system', 5: 'Build the thing' },
  'onboarding.buildHome': { 3: 'Go to home', 5: 'Straight to home, thanks' },
  'project.brandReadyTitleGeneric': { 3: 'Your design system is ready', 5: 'Your design system is out of the oven' },
  'project.brandReadyRefineHint': {
    3: 'Automatic extraction misses things. Refine it before you lean on this system everywhere.',
    5: 'Automatic extraction misses things — it always does. Refine it before you lean on this system everywhere.',
  },
  'home.recommendation.eyebrow': { 3: 'Picked for you', 5: 'We had a hunch' },
  'home.recommendation.primaryCta': { 3: 'Start creating', 5: 'Let us go' },
  'home.recommendation.change': { 3: 'Try another', 5: 'Show me a different one' },

  // ---------------------------------------------------------------------
  // Questions and forms
  // ---------------------------------------------------------------------
  'questions.banner': { 3: 'Mind a couple of quick questions?', 5: 'Two quick questions, then I am out of your hair' },
  'questions.generating': { 3: 'Thinking of questions…', 5: 'Coming up with questions…' },
  'qf.hint': {
    3: "Pick what fits. Skip the optional ones you don't care about — the agent will use sensible defaults.",
    5: "Pick what fits, skip what you don't care about. The agent has sensible defaults and is not shy about using them.",
  },
  'qf.lockedSubmitted': {
    3: 'Answers sent — the agent is using these for the rest of the session.',
    5: 'Answers sent. The agent is running with these for the rest of the session.',
  },
  'qf.submitDisabledTitle': { 3: 'Fill in the required fields first', 5: 'The required fields are still required' },

  // ---------------------------------------------------------------------
  // The setting that controls all of the above
  // ---------------------------------------------------------------------
  'settings.funnyTitle': { 3: 'Personality', 5: 'How much of a character it is' },
  'settings.funnyHint': {
    3: 'How playful the wording gets. Set separately for each language.',
    5: 'How much personality the wording has. Each language gets its own dial.',
  },
  'settings.funnyDisclosureDismiss': { 3: 'Got it', 5: 'Understood, carry on' },
  'settings.funnyDisclosureTitle': {
    3: 'This app has a sense of humour, and you hold the dial',
    5: 'Yes, it makes jokes. No, you are not stuck with them.',
  },
  'settings.funnyDisclosureBody': {
    3: 'Buttons, empty states, and error messages can read straight or playful, per language. The dial lives in Settings → Language, and it only ever changes the wording — never a number, a path, or what a button is about to do.',
    5: 'Buttons, empty states, and error messages can be as straight or as chatty as you like, per language. The dial lives in Settings → Language. It only ever changes the wording — never a number, a path, or what a button is about to do. A joke that costs you a fact is a bug, not a feature.',
  },
  'settings.languageModeHint': {
    3: 'Show one language, or two at once.',
    5: 'One language, or two at once. Both is a real option.',
  },

  // ---------------------------------------------------------------------
  // Second batch: everyday chrome. Lower stakes than the errors above, so
  // these mostly define 3 and 5 and let 2 and 4 ride the level below.
  // ---------------------------------------------------------------------
  'common.save': { 3: 'Save it', 5: 'Save it, quick' },
  'common.close': { 3: 'Close', 5: 'Shut it' },
  'common.clear': { 3: 'Clear it', 5: 'Wipe it' },
  'common.delete': { 3: 'Delete', 5: 'Bin it' },
  'common.rename': { 3: 'Rename', 5: 'Give it a better name' },
  'common.create': { 3: 'Create', 5: 'Make one' },
  'common.search': { 3: 'Search', 5: 'Go find' },
  'common.searchEllipsis': { 3: 'Search…', 5: 'Go find…' },
  'common.default': { 3: 'Default', 5: 'The usual' },
  'common.installed': { 3: 'installed', 5: 'present and correct' },
  'common.active': { 3: 'active', 5: 'on duty' },
  'common.all': { 3: 'All', 5: 'The lot' },
  'common.openPreview': { 3: 'Open preview', 5: 'Have a look' },
  'entry.navNewProject': { 3: 'New project', 5: 'Start something' },
  'entry.navHome': { 3: 'Home', 5: 'Back to base' },
  'entry.loadingWorkspace': { 3: 'Loading workspace…', 5: 'Setting the table…' },
  'entry.githubStarTitle': {
    3: 'Star us on GitHub, if you like',
    5: 'A GitHub star costs nothing and we would notice',
  },
  'entry.helpGetHelp': { 3: 'Get help on GitHub', 5: 'Go shout on GitHub' },
  'entry.helpWhatsNew': { 3: "What's new", 5: 'What we changed' },
  'workspace.newTab': { 3: 'New tab', 5: 'One more tab' },
  'workspace.focusMode': { 3: 'Focus workspace', 5: 'Everything else, away' },
  'workspace.closeTab': { 3: 'Close tab', 5: 'Away with this tab' },
  'workspace.createNew': { 3: 'Create new', 5: 'Make a new one' },
  'workspace.loadingSketch': { 3: 'Loading sketch…', 5: 'Unrolling the sketch…' },
  'workspace.terminalStarting': { 3: 'Starting terminal…', 5: 'Waking the terminal…' },
  'workspace.terminalStartingDescription': {
    3: 'Preparing the project shell. Usually a few seconds.',
    5: 'Preparing the project shell. A few seconds, honestly.',
  },
  'workspace.terminalReconnecting': { 3: 'Reconnecting…', 5: 'Trying again…' },
  'chat.composerPlaceholder': {
    3: 'Describe what you want to generate…',
    5: 'Tell it what you want. Be specific, it likes that…',
  },
  'chat.newConversation': { 3: 'New conversation', 5: 'Start fresh' },
  'chat.jumpToLatest': { 3: 'Jump to latest', 5: 'Take me to the bottom' },
  'chat.copyPrompt': { 3: 'Copy prompt', 5: 'Steal this prompt' },
  'chat.attachTitle': {
    3: 'Attach files (paste or drop works too)',
    5: 'Attach files. Pasting and dropping also work.',
  },
  'chat.importComingSoon': { 3: 'Coming soon', 5: 'Not yet. Soon.' },
  'chat.importSoon': { 3: 'Soon', 5: 'Soon-ish' },
  'chat.tabComments': { 3: 'Comments', 5: 'Opinions' },
  'chat.commentsSoon': { 3: 'Comments — coming soon', 5: 'Comments — not yet, but soon' },
  'conv.new': { 3: '+ New', 5: '+ One more' },
  'conv.untitled': { 3: 'Untitled conversation', 5: 'A conversation with no name' },
  'conv.renameTooltip': { 3: 'Double-click to rename', 5: 'Double-click and give it a name' },
  'messageCenter.markAllRead': { 3: 'Mark all read', 5: 'Declare it all read' },
  'messageCenter.subtitle': {
    3: 'Open Design updates, platform announcements, and account notices.',
    5: 'Open Design updates, platform announcements, and account notices. All of it lands here.',
  },
  'qf.choose': { 3: 'Choose…', 5: 'Pick one…' },
  'qf.otherOption': { 3: 'Other', 5: 'Something else' },
  'qf.required': { 3: 'required', 5: 'not optional' },
  'qf.submitDefault': { 3: 'Send answers', 5: 'Send it' },
  'qf.answered': { 3: 'answered', 5: 'sorted' },
  'questions.continue': { 3: 'Continue', 5: 'Onwards' },
  'questions.skipAll': { 3: 'Skip all', 5: 'Skip the lot' },
  'questions.bannerAnswered': { 3: 'Questions answered', 5: 'Questions: answered' },
  'questions.autoSkipHint': {
    3: 'Continues on its own when the timer ends',
    5: 'When the timer ends it continues without you',
  },
  'tool.todos': { 3: 'Todos', 5: 'The list' },
  'tool.todosDone': { 3: 'Done', 5: 'All done' },
  'tool.todosDismiss': { 3: 'Dismiss the task list', 5: 'Put the task list away' },
  'tool.hide': { 3: 'hide', 5: 'tuck away' },
  'tool.output': { 3: 'output', 5: 'what it said' },
  'preview.retry': { 3: 'Retry', 5: 'Go again' },
  'preview.duplicateTemplateDesc': {
    3: 'Remix this example into a new editable project',
    5: 'Take this example somewhere new — you get an editable project of your own',
  },
  'preview.loading': { 3: 'Loading {label}…', 5: 'Fetching {label}…' },
  'project.brandReadyDismiss': { 3: 'Dismiss', 5: 'Noted' },
  'project.brandReadyCta': { 3: 'Preview in Design systems', 5: 'Go look at it in Design systems' },
  'project.instructionsActive': {
    3: 'Active — included in every message',
    5: 'Active. Every message carries it, no exceptions.',
  },
  'settings.languageHint': {
    3: 'Switch the interface language. Saved to this browser.',
    5: 'Switch the interface language. It is remembered in this browser only.',
  },
  'settings.appearanceHint': {
    3: 'Light, dark, or whatever your system is doing.',
    5: 'Light, dark, or just follow whatever your system is already doing.',
  },
  'settings.resetOnboardingDesc': {
    3: 'Replay the first-run setup, brand extraction included.',
    5: 'Do the first-run setup all over again, brand extraction included.',
  },
  'updater.checking': { 3: 'Checking for updates', 5: 'Having a look for updates' },
  'updater.downloading': { 3: 'Downloading update', 5: 'Fetching the update' },
  'updater.later': { 3: 'Later', 5: 'Not now' },
  'updater.opening': { 3: 'Opening installer...', 5: 'Getting the installer up...' },
  'updater.quitting': { 3: 'Quitting...', 5: 'Packing up...' },
  'updater.restartAnyway': { 3: 'Restart anyway', 5: 'Restart regardless' },
  'updater.viewVersionFeatures': { 3: 'Explore new features', 5: 'See what is new' },
  'updater.manualDownload': { 3: 'Download manually', 5: 'Fine, I will do it myself' },
  'inlineSwitcher.daemonOffline': { 3: 'Daemon offline — open settings', 5: 'Daemon is asleep — open settings' },
  'inlineSwitcher.missingApiKey': {
    3: 'No API key set — add one in Settings.',
    5: 'There is no API key. Add one in Settings and we can carry on.',
  },
  'agentPicker.notInstalled': { 3: 'not installed', 5: 'not here' },
  'agentPicker.rescan': { 3: 'Re-scan local PATH for agents', 5: 'Sweep PATH again for agents' },
  'artifact.odCardRuleKeep': { 3: 'Keep', 5: 'Keep it' },
  'artifact.odCardRuleDiscard': { 3: 'Discard', 5: 'Bin it' },
  'artifact.odCardRuleSaving': { 3: 'Saving…', 5: 'Writing it down…' },
  'artifact.odCardBrandAssistWorking': { 3: 'Starting...', 5: 'Getting going...' },
  'artifact.odCardBrandAssistError': {
    3: "Couldn't start browser assist. Try again.",
    5: 'Browser assist would not start. Try again.',
  },
  'integrations.agentReady': { 3: 'Agent-ready', 5: 'Your agent can use this' },
};
