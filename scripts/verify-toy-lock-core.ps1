[CmdletBinding()]
param([switch]$SelfTest)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

function Read-Required([string]$RelativePath) {
    $path = Join-Path $root $RelativePath
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required source is missing: $RelativePath" }
    [IO.File]::ReadAllText($path)
}

function Strip-Comments([string]$Text) {
    [regex]::Replace([regex]::Replace($Text, '/\*[\s\S]*?\*/', ''), '^\s*//.*$', '', 'Multiline')
}

function Require-Exact([string]$Text, [string]$Needle, [string]$Name) {
    $code = Strip-Comments $Text
    $pattern = [regex]::Escape($Needle)
    if ($Needle -match '^[A-Za-z0-9_]+$') { $pattern = '(?<![A-Za-z0-9_])' + $pattern + '(?![A-Za-z0-9_])' }
    if (-not [regex]::IsMatch($code, $pattern)) { throw "Required boundary missing: $Name" }
}

function Assert-Contract([hashtable]$Sources) {
    $core = Strip-Comments $Sources.core
    $popover = Strip-Comments $Sources.popover
    $boundary = Strip-Comments $Sources.boundary
    $support = Strip-Comments $Sources.support
    $supportCore = Strip-Comments $Sources.supportCore
    $integration = Strip-Comments $Sources.integration
    $wizard = Strip-Comments $Sources.wizard
    $hostCall = Strip-Comments $Sources.hostCall
    $compat = Strip-Comments $Sources.compat
    $protocol = Strip-Comments $Sources.protocol
    $detection = Strip-Comments $Sources.detection
    $store = Strip-Comments $Sources.store
    $handoff = $Sources.handoff | ConvertFrom-Json
    $store = Strip-Comments $Sources.store

    Require-Exact $core "export const TOY_LOCK_POLICIES = Object.freeze([" 'six-policy registry'
    $policies = @('pin','password','pin-password','password-totp','pin-totp','password-pin-totp')
    foreach ($policy in $policies) { Require-Exact $core "'$policy'" "policy $policy" }
    Require-Exact $core "export const TOY_LOCK_ACTIVATION_SOURCES = Object.freeze([" 'activation route inventory'
    foreach ($route in @('pointer','keyboard','touch','assistive','programmatic','shortcut')) { Require-Exact $core "'$route'" "activation route $route" }
    foreach ($needle in @(
        'TOY_LOCK_POLICY_INPUT_INVENTORY = Object.freeze(',
        'interceptLockedActivationForRoute(',
        'createToyLockState(',
        'unlockExpiryMs(',
        'hydrateAttemptBudget(',
        "reason: 'empty'", "reason: 'non-digit'", "reason: 'too-short'", "reason: 'too-long'",
        "inputRoutes: Object.freeze(['keypad', 'manual'] as const)",
        "inputRoutes: Object.freeze(['manual'] as const)"
    )) { Require-Exact $core $needle $needle }
    foreach ($needle in @(
        'verifyPolicy?:',
        'withToyLockUiDeadline(() => verifyPolicy({',
        'attemptRemaining?',
        'onSupportTickets?',
        'valuesRef.current = {}',
        'revisionForPrompt?',
        'funnyLevels.en,',
        "funnyLevels['zh-HK'],"
    )) { Require-Exact $popover $needle $needle }
    foreach ($needle in @(
        'interceptLockedActivationForRoute(target, budget, source,',
        "intercept('pointer'",
        "intercept('keyboard'",
        "intercept('touch'",
        "intercept('assistive'",
        'activate(source?: ToyLockActivationSource)'
    )) { Require-Exact $boundary $needle $needle }
    foreach ($needle in @(
        'Nothing is sent anywhere',
        'no network request is made',
        'SUPPORT_TICKETS_STORAGE_KEY',
        'persistSupportTickets(',
        'advanceSupportTicket(',
        'dismissSupportTickets(',
        'exportSupportTickets(',
        'onOpenRecoveryFolder?',
        'testId={`${testId}-search`}'
    )) { Require-Exact $support $needle $needle }
    foreach ($needle in @(
        'TICKET_KEYS',
        'hasOnlyTicketKeys(',
        'const ticket: SupportTicket'
    )) { Require-Exact $supportCore $needle $needle }
    foreach ($needle in @(
        'Descriptions are included',
        'exportReady',
        'requestExport',
        'funnyLevels.en,',
        "funnyLevels['zh-HK'],"
    )) { Require-Exact $support $needle $needle }
    foreach ($needle in @(
        'createToyLockIntegrationApi(',
        'withToyLockUiDeadline(() => host.configure(',
        'withToyLockUiDeadline(() => host.remove(',
        "code: 'operation-failed'",
        'readonly relock:',
        'host.openRecoveryFolder',
        'recovery-folder-unavailable'
    )) { Require-Exact $integration $needle $needle }
    foreach ($needle in @(
        'TOY_LOCK_POLICY_INPUT_INVENTORY.filter(',
        'normalizePin({ source: pinSource, value: pin })',
        'unlockDuration',
        'data-testid={testId}',
        'funnyLevels.en,',
        "funnyLevels['zh-HK'],"
    )) { Require-Exact $wizard $needle $needle }
    foreach ($needle in @(
        'TOY_LOCK_UI_DEADLINE_MS = 10_000',
        'window.setTimeout',
        'window.clearTimeout(timer)',
        'Promise.resolve(operation())',
        "reject(new Error('toy-lock host request timed out'))"
    )) { Require-Exact $hostCall $needle $needle }
    foreach ($needle in @('TOY_LOCK_UI_DEADLINE_MS', 'withToyLockUiDeadline')) { Require-Exact $compat $needle $needle }
    foreach ($needle in @('openRecoveryFolder?:', 'relock?:', 'unlockDuration?:', 'unlocked: boolean', 'unlockUntilMs: number | null')) { Require-Exact $protocol $needle $needle }
    foreach ($needle in @('openRecoveryFolder', 'relock')) { Require-Exact $detection $needle $needle }
    foreach ($needle in @('failure("stale-revision")', 'remainingAttempts', 'cooldownUntilMs', 'lock.unlocked = true', 'lock.unlocked = false', 'relock(targetId: OpenDesignSettingsToyLockTarget')) { Require-Exact $store $needle $needle }
    $expectedHandoffRoutes = @('per-element-context-menu-lock', 'toy-lock-configuration', 'totp-pairing', 'command-palette-teleport', 'settings-and-menu-search', 'support-tickets-recovery', 'host-relock-and-launch-state')
    if ($handoff.version -ne 1 -or $handoff.owner -ne 'C0' -or $handoff.operationClaimed -ne $false) { throw 'C0 handoff inventory must remain an explicit unclaimed partial record' }
    if ((@($handoff.routes).id -join "`u{1f}") -cne ($expectedHandoffRoutes -join "`u{1f}")) { throw 'C0 handoff route inventory differs' }
    foreach ($route in @($handoff.routes)) {
        if ($route.operationClaimed -ne $false -or [string]::IsNullOrWhiteSpace($route.requiredCentralWork) -or [string]::IsNullOrWhiteSpace($route.requiredProof)) { throw "C0 handoff route is incomplete: $($route.id)" }
    }
}

$sources = @{
    core = Read-Required 'design/apps/web/src/security/toy-lock-core.ts'
    popover = Read-Required 'design/apps/web/src/components/ToyLockAuthenticationPopover.tsx'
    boundary = Read-Required 'design/apps/web/src/components/toy-locks/ToyLockActivationBoundary.tsx'
    support = Read-Required 'design/apps/web/src/components/toy-locks/SupportTicketsPanel.tsx'
    supportCore = Read-Required 'design/apps/web/src/security/toy-lock-support-tickets.ts'
    integration = Read-Required 'design/apps/web/src/security/toy-lock-integration.ts'
    wizard = Read-Required 'design/apps/web/src/components/toy-locks/ToyLockPolicyWizard.tsx'
    hostCall = Read-Required 'design/apps/web/src/components/toy-locks/host-call.ts'
    compat = Read-Required 'design/apps/web/src/components/settings/toy-lock-host-call.ts'
    protocol = Read-Required 'design/packages/host/src/protocol.ts'
    detection = Read-Required 'design/packages/host/src/detection.ts'
    store = Read-Required 'design/apps/desktop/src/main/toy-lock-store.ts'
    handoff = Read-Required '.codex/verification/ui-drive/toy-lock-c0-handoff.json'
}

Assert-Contract $sources

if ($SelfTest) {
    $mutations = @(
        @{ part='core'; needle='''pin'''; replacement='''pin-removed''' },
        @{ part='core'; needle="'shortcut'"; replacement="'shortcut-removed'" },
        @{ part='core'; needle='TOY_LOCK_POLICY_INPUT_INVENTORY = Object.freeze('; replacement='TOY_LOCK_POLICY_INPUT_INVENTORY_REMOVED = Object.freeze(' },
        @{ part='core'; needle='interceptLockedActivationForRoute('; replacement='interceptLockedActivationForRouteRemoved(' },
        @{ part='core'; needle='hydrateAttemptBudget('; replacement='hydrateAttemptBudgetRemoved(' },
        @{ part='popover'; needle='verifyPolicy?:'; replacement='verifyPolicyRemoved?:' },
        @{ part='popover'; needle='withToyLockUiDeadline(() => verifyPolicy({'; replacement='withToyLockUiDeadlineRemoved(() => verifyPolicy({' },
        @{ part='boundary'; needle="intercept('pointer'"; replacement="interceptRemoved('pointer'" },
        @{ part='boundary'; needle='activate(source?: ToyLockActivationSource)'; replacement='activateRemoved(source?: ToyLockActivationSource)' },
        @{ part='support'; needle='Nothing is sent anywhere'; replacement='Nothing is sent somewhere' },
        @{ part='support'; needle='exportSupportTickets('; replacement='exportSupportTicketsRemoved(' },
        @{ part='support'; needle='onOpenRecoveryFolder?'; replacement='onOpenRecoveryFolderRemoved?' }
        ,@{ part='supportCore'; needle='hasOnlyTicketKeys('; replacement='hasOnlyTicketKeysRemoved(' }
        ,@{ part='support'; needle='Descriptions are included'; replacement='Descriptions are omitted' }
        ,@{ part='integration'; needle='withToyLockUiDeadline(() => host.configure('; replacement='withToyLockUiDeadlineRemoved(() => host.configure(' }
        ,@{ part='integration'; needle='withToyLockUiDeadline(() => host.remove('; replacement='withToyLockUiDeadlineRemoved(() => host.remove(' }
        ,@{ part='wizard'; needle='normalizePin({ source: pinSource, value: pin })'; replacement='normalizePinRemoved({ source: pinSource, value: pin })' }
        ,@{ part='hostCall'; needle="reject(new Error('toy-lock host request timed out'))"; replacement="resolve(new Error('toy-lock host request timed out'))" }
        ,@{ part='compat'; needle='withToyLockUiDeadline'; replacement='withToyLockUiDeadlineRemoved' }
        ,@{ part='protocol'; needle='openRecoveryFolder?:'; replacement='openRecoveryFolderRemoved?:' }
        ,@{ part='detection'; needle='openRecoveryFolder'; replacement='openRecoveryFolderRemoved' }
        ,@{ part='store'; needle='failure("stale-revision")'; replacement='failure("stale-revision-removed")' }
        ,@{ part='store'; needle='lock.unlocked = true'; replacement='lock.unlocked = false' }
        ,@{ part='integration'; needle='createToyLockIntegrationApi('; replacement='createToyLockIntegrationApiRemoved(' }
        ,@{ part='wizard'; needle='TOY_LOCK_POLICY_INPUT_INVENTORY.filter('; replacement='TOY_LOCK_POLICY_INPUT_INVENTORY_REMOVED.filter(' }
        ,@{ part='popover'; needle='funnyLevels.en,'; replacement='funnyLevels.enRemoved,' }
        ,@{ part='support'; needle='funnyLevels.en,'; replacement='funnyLevels.enRemoved,' }
        ,@{ part='wizard'; needle='funnyLevels.en,'; replacement='funnyLevels.enRemoved,' }
        ,@{ part='popover'; needle="funnyLevels['zh-HK'],"; replacement="funnyLevels['zh-HK-removed']," }
        ,@{ part='support'; needle="funnyLevels['zh-HK'],"; replacement="funnyLevels['zh-HK-removed']," }
        ,@{ part='wizard'; needle="funnyLevels['zh-HK'],"; replacement="funnyLevels['zh-HK-removed']," }
        ,@{ part='handoff'; needle='"operationClaimed": false'; replacement='"operationClaimed": true' }
        ,@{ part='handoff'; needle='per-element-context-menu-lock'; replacement='per-element-context-menu-lock-renamed' }
    )
    $index = 0
    foreach ($mutation in $mutations) {
        $broken = @{} + $sources
        $old = $broken[$mutation.part]
        $new = $old.Replace($mutation.needle, $mutation.replacement)
        if ($new -eq $old) { throw "Self-test mutation did not land: $($mutation.part) $($mutation.needle)" }
        $broken[$mutation.part] = $new
        $red = $false
        try { Assert-Contract $broken } catch { $red = $true }
        if (-not $red) { throw "Self-test stayed green: $($mutation.part) $($mutation.needle)" }
        Assert-Contract $sources
        $index++
    }
}

Write-Output 'PASS: toy-lock policy, activation-route, Support Tickets, and recovery contracts'
