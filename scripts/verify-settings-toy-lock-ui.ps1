[CmdletBinding()]
param([switch]$SelfTest)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dialogPath = Join-Path $root 'design/apps/web/src/components/SettingsDialog.tsx'
$stripPath = Join-Path $root 'design/apps/web/src/components/settings/SettingsTabStrip.tsx'
$panelPath = Join-Path $root 'design/apps/web/src/components/settings/SettingsToyLockPanel.tsx'
$popoverPath = Join-Path $root 'design/apps/web/src/components/ToyLockAuthenticationPopover.tsx'
$qrPath = Join-Path $root 'design/apps/web/src/components/settings/totp-qr.ts'
$railPath = Join-Path $root 'design/apps/web/src/components/EntryNavRail.tsx'
$appPath = Join-Path $root 'design/apps/web/src/App.tsx'
$callPath = Join-Path $root 'design/apps/web/src/components/settings/toy-lock-host-call.ts'
$appearanceConsumerPath = Join-Path $root 'design/apps/web/src/components/settings/settings-tab-appearance-consumer.ts'

function Require-Exact([string]$Source, [string]$Needle, [string]$Name) {
  $withoutBlocks = [regex]::Replace($Source, '/\*[\s\S]*?\*/', '')
  $codeLines = foreach ($line in ($withoutBlocks -split "`r?`n")) {
    if ($line.TrimStart().StartsWith('//')) { continue }
    $line -replace '\s//.*$', ''
  }
  $pattern = '(?<![A-Za-z0-9_])' + [regex]::Escape($Needle) + '(?![A-Za-z0-9_])'
  $matches = 0
  foreach ($line in $codeLines) { $matches += [regex]::Matches($line, $pattern).Count }
  if ($matches -lt 1) { throw "Executable boundary missing for ${Name}" }
}

function Test-SettingsToyLockUi([hashtable]$Sources) {
  $script:settingsRequirements = @(
    @{ file = 'dialog'; needle = 'result = await withToyLockUiDeadline(() => bridge.list());'; name = 'host lock metadata refresh' },
    @{ file = 'dialog'; needle = "useState<'loading' | 'ready' | 'unavailable'>('loading')"; name = 'fail-closed loading state' },
    @{ file = 'dialog'; needle = "if (settingsToyLockStatus !== 'ready') return;"; name = 'unknown-state activation refusal' },
    @{ file = 'dialog'; needle = 'requestSettingsSection(initialSection)'; name = 'external initial-section interception' },
    @{ file = 'dialog'; needle = 'host.verify({'; name = 'host revisioned verification' },
    @{ file = 'dialog'; needle = 'verifyToyLockPolicy={verifySettingsTabToyLockPolicy}'; name = 'tab policy bridge' },
    @{ file = 'dialog'; needle = 'unlockDurations={settingsToyLockDurations}'; name = 'duration cache bridge' },
    @{ file = 'dialog'; needle = 'onUnlockDurationChanged={(targetId, duration) =>'; name = 'duration choice propagation' },
    @{ file = 'dialog'; needle = 'onEditTabAppearance={dispatchTabAppearance}'; name = 'production appearance consumer adapter' },
    @{ file = 'dialog'; needle = 'supportOnly: true'; name = 'support-only direct panel route' },
    @{ file = 'dialog'; needle = 'emitSettingsTabAppearanceRequest({ section, anchor });'; name = 'production appearance consumer dispatch' },
    @{ file = 'dialog'; needle = 'initialSupportTicketsOpen = false'; name = 'Help support launch prop' },
    @{ file = 'strip'; needle = 'onContextMenu={(event) => {'; name = 'tab context-menu interception' },
    @{ file = 'strip'; needle = 'settings-tab-context-menu-search'; name = 'context menu regex search surface' },
    @{ file = 'strip'; needle = 'targetId: tab.section'; name = 'host target identifier' },
    @{ file = 'strip'; needle = 'aria-disabled={locked || undefined}'; name = 'visibly disabled activation wrapper' },
    @{ file = 'strip'; needle = 'const rememberAuthorization = useCallback'; name = 'bounded authorization cache' },
    @{ file = 'strip'; needle = 'const requestProtectedTabAction = useCallback'; name = 'authenticated tab action state machine' },
    @{ file = 'strip'; needle = 'const lockAgain = useCallback'; name = 'Lock again reset path' },
    @{ file = 'strip'; needle = 'SETTINGS_TAB_APPEARANCE_REQUEST_EVENT'; name = 'shared tab appearance adapter event' },
    @{ file = 'strip'; needle = 'const requestTabAppearance = useCallback'; name = 'anchored tab appearance route' },
    @{ file = 'strip'; needle = 'onEditTabAppearance?: (section: SettingsSection, anchor: HTMLButtonElement) => void'; name = 'real tab appearance callback contract' },
    @{ file = 'strip'; needle = 'contextMenuActions.some(contextMenuHasMatch)'; name = 'independent context-action filtering' },
    @{ file = 'popover'; needle = 'const result = await withToyLockUiDeadline(() => verifyPolicy({'; name = 'complete host policy verification' },
    @{ file = 'popover'; needle = 'remaining: result.remainingAttempts'; name = 'host attempt state rendering' },
    @{ file = 'panel'; needle = 'OPEN_DESIGN_TOY_LOCK_POLICIES.map'; name = 'six-policy selector registry' },
    @{ file = 'panel'; needle = 'testId="toy-lock-target"'; name = 'searchable target popup' },
    @{ file = 'panel'; needle = 'testId="toy-lock-policy"'; name = 'searchable policy popup' },
    @{ file = 'panel'; needle = 'testId="toy-lock-duration"'; name = 'searchable duration popup' },
    @{ file = 'panel'; needle = 'unlockDurations?.get(targetId)'; name = 'persisted duration reload' },
    @{ file = 'panel'; needle = 'normalizePin({ source: pinSource, value: pin })'; name = 'PIN validation path' },
    @{ file = 'panel'; needle = 'beginTotpEnrollment'; name = 'host-owned TOTP begin' },
    @{ file = 'panel'; needle = 'withToyLockUiDeadline(() => host.confirmTotpEnrollment({'; name = 'host-owned TOTP confirmation' },
    @{ file = 'panel'; needle = 'renderTotpQrSvg'; name = 'local QR renderer' },
    @{ file = 'panel'; needle = 'setTotpSecretRevealed'; name = 'explicit manual secret reveal' },
    @{ file = 'panel'; needle = 'const SUPPORT_TICKETS_KEY ='; name = 'persistent Support Tickets state' },
    @{ file = 'panel'; needle = 'selectedTicketIds'; name = 'Support Tickets bulk selection' },
    @{ file = 'panel'; needle = 'exportTickets'; name = 'filtered Support Tickets export' },
    @{ file = 'panel'; needle = 'testId="toy-lock-support-search"'; name = 'Support Tickets search' },
    @{ file = 'panel'; needle = 'openRecoveryFolder()'; name = 'Support Tickets recovery action' },
    @{ file = 'panel'; needle = 'MAX_SERIALIZED_TICKET_BYTES'; name = 'bounded Support Tickets JSON bytes' },
    @{ file = 'panel'; needle = "severity: 'dramatic'"; name = 'explicit Support Tickets severity' },
    @{ file = 'panel'; needle = 'SUPPORT_TICKET_MIGRATION_KEY'; name = 'legacy ticket severity migration record' },
    @{ file = 'panel'; needle = 'supportOnly = false'; name = 'direct panel mutator boundary' },
    @{ file = 'panel'; needle = 'supportCollisionExhausted'; name = 'collision exhaustion recovery copy' },
    @{ file = 'panel'; needle = 'withToyLockUiDeadline(() => host.configure'; name = 'bounded configure IPC request' },
    @{ file = 'panel'; needle = "setPendingExistingMutation('replace')"; name = 'existing-lock replacement authentication request' },
    @{ file = 'panel'; needle = "setPendingExistingMutation('remove')"; name = 'existing-lock removal authentication request' },
    @{ file = 'panel'; needle = 'const verifyExistingPolicy = async'; name = 'existing-lock policy verifier' },
    @{ file = 'qr'; needle = 'otpauth://totp/'; name = 'otpauth URI contract' },
    @{ file = 'qr'; needle = 'ERROR_CORRECTION_CODEWORDS = 20'; name = 'scannable QR error correction' },
    @{ file = 'qr'; needle = 'const QUIET_ZONE = 4'; name = 'QR quiet zone' },
    @{ file = 'qr'; needle = 'function versionInformation'; name = 'QR version information blocks' },
    @{ file = 'qr'; needle = 'export function decodeTotpQrMatrix'; name = 'bundled structural QR decoder' },
    @{ file = 'qr'; needle = 'independentScannerVerified: false'; name = 'honest independent-scanner evidence boundary' },
    @{ file = 'qr'; needle = 'function hasValidReedSolomon'; name = 'QR Reed-Solomon verification' },
    @{ file = 'call'; needle = 'TOY_LOCK_UI_DEADLINE_MS = 10_000'; name = 'bounded host request deadline' },
    @{ file = 'call'; needle = 'reject(new Error'; name = 'host timeout rejection' },
    @{ file = 'call'; needle = 'pending = operation();'; name = 'synchronous host throw cleanup' },
    @{ file = 'panel'; needle = 'ariaActiveDescendant={activeOption'; name = 'focused popup active descendant' },
    @{ file = 'panel'; needle = 'supportPathCopyUnavailable'; name = 'clipboard unavailable recovery notice' },
    @{ file = 'consumer'; needle = 'registerSettingsTabAppearanceConsumer'; name = 'appearance consumer registration contract' },
    @{ file = 'consumer'; needle = 'emitSettingsTabAppearanceRequest'; name = 'appearance consumer event bridge' },
    @{ file = 'rail'; needle = 'data-testid="entry-help-support-tickets"'; name = 'Help Support Tickets route' },
    @{ file = 'rail'; needle = 'onOpenSupportTickets?.()'; name = 'Help route callback' },
    ,@{ file = 'app'; needle = "openSettings('general', { supportTickets: true })"; name = 'Help route opens support panel' }
    ,@{ file = 'app'; needle = "openSettings('appearance');"; name = 'application-owned appearance destination consumer' }
  )
  foreach ($requirement in $script:settingsRequirements) { Require-Exact $Sources[$requirement.file] $requirement.needle $requirement.name }
}

$sources = @{
  dialog = [IO.File]::ReadAllText($dialogPath)
  strip = [IO.File]::ReadAllText($stripPath)
  panel = [IO.File]::ReadAllText($panelPath)
  popover = [IO.File]::ReadAllText($popoverPath)
  qr = [IO.File]::ReadAllText($qrPath)
  rail = [IO.File]::ReadAllText($railPath)
  app = [IO.File]::ReadAllText($appPath)
  call = [IO.File]::ReadAllText($callPath)
  consumer = [IO.File]::ReadAllText($appearanceConsumerPath)
}
Test-SettingsToyLockUi $sources

if ($SelfTest) {
  # The inventory itself is the source of truth. Deliberately remove each
  # exact executable token once, then require the checker to turn red. This
  # keeps a renamed symbol, commented call, or vanished row from passing by
  # substring accident.
  $inventoryIndex = 0
  $inventory = @($script:settingsRequirements)
  foreach ($requirement in $inventory) {
    $mutated = @{} + $sources
    $before = $mutated[$requirement.file]
    $replacement = "__removed_inventory_$inventoryIndex"
    $after = $before.Replace($requirement.needle, $replacement)
    if ($after -eq $before) { throw "Inventory mutation did not land: $($requirement.name)" }
    $mutated[$requirement.file] = $after
    $failed = $false
    try { Require-Exact $after $requirement.needle $requirement.name } catch { $failed = $true }
    if (-not $failed) { throw "Inventory mutation stayed green: $($requirement.name)" }
    $inventoryIndex += 1
  }
  $breaks = @(
    @{ file = 'dialog'; needle = 'host.verify({'; replacement = 'host.notVerify({' },
    @{ file = 'dialog'; needle = "useState<'loading' | 'ready' | 'unavailable'>('loading')"; replacement = "useState<'loading' | 'ready' | 'unavailable'>('ready')" },
    @{ file = 'strip'; needle = 'targetId: tab.section'; replacement = 'targetId: settingsTabId(tab.section)' },
    @{ file = 'popover'; needle = 'remaining: result.remainingAttempts'; replacement = 'remaining: 5' },
    @{ file = 'panel'; needle = 'withToyLockUiDeadline(() => host.confirmTotpEnrollment({'; replacement = 'withToyLockUiDeadline(() => host.confirmTotpEnrollmentRemoved({' },
    @{ file = 'panel'; needle = 'const SUPPORT_TICKETS_KEY ='; replacement = 'const NO_SUPPORT_TICKETS_KEY =' },
    @{ file = 'panel'; needle = 'renderTotpQrSvg'; replacement = 'renderMissingQrSvg' },
    @{ file = 'panel'; needle = 'setTotpSecretRevealed'; replacement = 'setSecretRevealRemoved' },
    @{ file = 'strip'; needle = 'aria-disabled={locked || undefined}'; replacement = 'aria-disabled={undefined}' },
    @{ file = 'qr'; needle = 'ERROR_CORRECTION_CODEWORDS = 20'; replacement = 'ERROR_CORRECTION_CODEWORDS = 19' },
    @{ file = 'qr'; needle = 'const QUIET_ZONE = 4'; replacement = 'const QUIET_ZONE = 3' },
    @{ file = 'qr'; needle = 'function versionInformation'; replacement = 'function removedVersionInformation' },
    @{ file = 'qr'; needle = 'export function decodeTotpQrMatrix'; replacement = 'export function removedQrDecoder' },
    @{ file = 'dialog'; needle = 'onUnlockDurationChanged={(targetId, duration) =>'; replacement = 'onUnlockDurationChanged={undefined} // removed' },
    @{ file = 'panel'; needle = 'testId="toy-lock-support-search"'; replacement = 'testId="removed-support-search"' },
    @{ file = 'panel'; needle = 'unlockDurations?.get(targetId)'; replacement = 'unlockDurations?.get(removedTargetId)' },
    @{ file = 'rail'; needle = 'data-testid="entry-help-support-tickets"'; replacement = 'data-testid="removed-help-route"' },
    @{ file = 'app'; needle = "openSettings('general', { supportTickets: true })"; replacement = "openSettings('general', { supportTickets: false })" },
    @{ file = 'dialog'; needle = 'host.verify({'; replacement = 'host.verifyRenamed({' },
    @{ file = 'dialog'; needle = 'host.verify({'; replacement = 'const result = await // host.verify({' },
    @{ file = 'popover'; needle = 'const result = await withToyLockUiDeadline(() => verifyPolicy({'; replacement = 'const result = await verifyPolicyRemoved({' },
    @{ file = 'call'; needle = 'reject(new Error'; replacement = 'resolve(new Error' }
  )
  foreach ($break in $breaks) {
    $mutated = @{} + $sources
    $before = $mutated[$break.file]
    $after = $before.Replace($break.needle, $break.replacement)
    if ($after -eq $before) { throw "Self-test mutation did not land: $($break.needle)" }
    $mutated[$break.file] = $after
    $failed = $false
    try { Test-SettingsToyLockUi $mutated } catch { $failed = $true }
    if (-not $failed) { throw "Self-test mutation stayed green: $($break.needle)" }
  }
}

Write-Output 'PASS: Settings toy-lock UI bridge, host policy verification, context-menu route, six-policy configuration, local QR pairing, duration cache, Support Tickets, and recovery disclosure are present.'
