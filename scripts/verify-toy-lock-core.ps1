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
    if (-not $code.Contains($Needle, [StringComparison]::Ordinal)) { throw "Required boundary missing: $Name" }
}

function Assert-Contract([hashtable]$Sources) {
    $core = Strip-Comments $Sources.core
    $popover = Strip-Comments $Sources.popover
    $boundary = Strip-Comments $Sources.boundary
    $support = Strip-Comments $Sources.support

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
        "inputRoutes: Object.freeze(['keypad', 'manual'] as const)",
        "inputRoutes: Object.freeze(['manual'] as const)"
    )) { Require-Exact $core $needle $needle }
    foreach ($needle in @(
        'verifyPolicy?:',
        'withToyLockUiDeadline(() => verifyPolicy({',
        'attemptRemaining?',
        'onSupportTickets?',
        'valuesRef.current = {}'
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
}

$sources = @{
    core = Read-Required 'design/apps/web/src/security/toy-lock-core.ts'
    popover = Read-Required 'design/apps/web/src/components/ToyLockAuthenticationPopover.tsx'
    boundary = Read-Required 'design/apps/web/src/components/toy-locks/ToyLockActivationBoundary.tsx'
    support = Read-Required 'design/apps/web/src/components/toy-locks/SupportTicketsPanel.tsx'
}

Assert-Contract $sources

if ($SelfTest) {
    $mutations = @(
        @{ part='core'; needle='''pin'''; replacement='''pin-removed''' },
        @{ part='core'; needle="'shortcut'"; replacement="'shortcut-removed'" },
        @{ part='core'; needle='TOY_LOCK_POLICY_INPUT_INVENTORY = Object.freeze('; replacement='TOY_LOCK_POLICY_INPUT_INVENTORY_REMOVED = Object.freeze(' },
        @{ part='core'; needle='interceptLockedActivationForRoute('; replacement='interceptLockedActivationForRouteRemoved(' },
        @{ part='popover'; needle='verifyPolicy?:'; replacement='verifyPolicyRemoved?:' },
        @{ part='popover'; needle='withToyLockUiDeadline(() => verifyPolicy({'; replacement='withToyLockUiDeadlineRemoved(() => verifyPolicy({' },
        @{ part='boundary'; needle="intercept('pointer'"; replacement="interceptRemoved('pointer'" },
        @{ part='boundary'; needle='activate(source?: ToyLockActivationSource)'; replacement='activateRemoved(source?: ToyLockActivationSource)' },
        @{ part='support'; needle='Nothing is sent anywhere'; replacement='Nothing is sent somewhere' },
        @{ part='support'; needle='exportSupportTickets('; replacement='exportSupportTicketsRemoved(' },
        @{ part='support'; needle='onOpenRecoveryFolder?'; replacement='onOpenRecoveryFolderRemoved?' }
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
