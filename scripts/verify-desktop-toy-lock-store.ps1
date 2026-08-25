[CmdletBinding()]
param([switch]$SelfTest)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
function Read-Required([string]$RelativePath) {
    $path = Join-Path $root $RelativePath
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required source is missing: $RelativePath" }
    [System.IO.File]::ReadAllText($path)
}
function Strip-Comments([string]$Text) { [regex]::Replace([regex]::Replace($Text, '/\*[\s\S]*?\*/', ''), '^\s*//.*$', '', 'Multiline') }
function Assert-Exact([object[]]$Actual, [object[]]$Expected, [string]$Label) {
    if (($Actual -join "`u{1f}") -cne ($Expected -join "`u{1f}")) { throw "$Label differs: [$($Actual -join ', ')]" }
}
function Extract-Array([string]$Text, [string]$Name) {
    $match = [regex]::Match($Text, ('export const ' + [regex]::Escape($Name) + ' = Object\.freeze\(\[(?<body>[\s\S]*?)\] as const\);'))
    if (-not $match.Success) { throw "Exact array declaration missing: $Name" }
    @([regex]::Matches($match.Groups['body'].Value, '"([^"\r\n]+)"') | ForEach-Object { $_.Groups[1].Value })
}
function Extract-Policies([string]$Text) {
    $match = [regex]::Match($Text, 'const POLICY_FACTORS:[^=]+ = Object\.freeze\(\{(?<body>[\s\S]*?)\}\);')
    if (-not $match.Success) { throw 'Exact POLICY_FACTORS declaration missing' }
    $rows = [regex]::Matches($match.Groups['body'].Value, '"(?<policy>[^"]+)"\s*:\s*Object\.freeze\(\[(?<factors>[^\]]*)\]\s*(?:as const)?\)')
    $result = [ordered]@{}
    foreach ($row in $rows) {
        if ($result.Contains($row.Groups['policy'].Value)) { throw "Duplicate policy: $($row.Groups['policy'].Value)" }
        $result[$row.Groups['policy'].Value] = @([regex]::Matches($row.Groups['factors'].Value, '"([^"]+)"') | ForEach-Object { $_.Groups[1].Value })
    }
    $result
}
function Test-Contract([hashtable]$Sources) {
    $protocol = Strip-Comments $Sources.protocol
    $store = Strip-Comments $Sources.store
    $runtime = Strip-Comments $Sources.runtime
    $preload = Strip-Comments $Sources.preload
    $targets = @('execution','general','workspace','instructions','memory','media','mcpClient','composio','orbit','routines','integrations','language','appearance','narrator','critiqueTheater','notifications','pet','designSystems','projectLocations','privacy','handoff','about')
    Assert-Exact (Extract-Array $protocol 'OPEN_DESIGN_SETTINGS_TOY_LOCK_TARGETS') $targets 'Target inventory'
    $expectedPolicies = [ordered]@{
        pin=@('pin'); password=@('password'); 'pin-password'=@('pin','password');
        'password-totp'=@('password','totp'); 'pin-totp'=@('pin','totp');
        'password-pin-totp'=@('password','pin','totp')
    }
    $policies = Extract-Policies $store
    Assert-Exact @($policies.Keys) @($expectedPolicies.Keys) 'Policy inventory'
    foreach ($policy in $expectedPolicies.Keys) { Assert-Exact @($policies[$policy]) @($expectedPolicies[$policy]) "Factors for $policy" }
    if (-not [regex]::IsMatch($protocol, 'export type OpenDesignToyLockResult<T extends Record<string, unknown> = Record<never, never>> =')) { throw 'Empty toy-lock success result must remain type-correct' }
    $channels = @('begin-totp-enrollment','confirm-totp-enrollment','configure','list','remove','verify')
    $toyLockBlock = [regex]::Match($preload, 'const toyLocks: OpenDesignHostToyLocks = \{(?<body>[\s\S]*?)\n\};')
    if (-not $toyLockBlock.Success) { throw 'Exact preload toyLocks block missing' }
    $preloadChannels = @([regex]::Matches($toyLockBlock.Groups['body'].Value, "'od:toy-locks:([^']+)'") | ForEach-Object { $_.Groups[1].Value })
    Assert-Exact $preloadChannels $channels 'Preload channel inventory'
    foreach ($channel in $channels) {
        $marker = 'ipcMain.handle("od:toy-locks:' + $channel + '", async ('
        $start = $runtime.IndexOf($marker, [StringComparison]::Ordinal)
        if ($start -lt 0 -or $runtime.IndexOf($marker, $start + 1, [StringComparison]::Ordinal) -ge 0) { throw "Handler count differs: $channel" }
        $end = $runtime.IndexOf("`n  });", $start, [StringComparison]::Ordinal)
        if ($end -lt 0) { throw "Handler boundary missing: $channel" }
        $body = $runtime.Substring($start, $end - $start)
        $senderChecks = [regex]::Matches($body, '^\s*requireMainWindowSender\(event\);\s*$', 'Multiline')
        if ($senderChecks.Count -ne 1) { throw "Exact sender validation differs: $channel" }
    }
    $requiredPatterns = @(
        'scrypt\(value, salt, HASH_BYTES, SCRYPT_OPTIONS, \(error, derivedKey\) => \{',
        'const MAX_PENDING_OPERATIONS = 32;',
        'const MAX_PENDING_ENROLLMENTS = 16;',
        'const MAX_HOTP_COUNTER = \(1n << 64n\) - 1n;',
        'Number\.isSafeInteger\(value\) && value >= 0',
        'BigInt\(Math\.floor\(value / TOTP_PERIOD_MS\)\) <= MAX_HOTP_COUNTER',
        'if \(candidate < 0\) continue;',
        'if \(!validClock\(now\)\) return failure\("clock-invalid"\);',
        'if \(lock == null\) return failure\("not-configured"\); if \(lock\.revision !== request\.revision\) return failure\("stale-revision"\);',
        'if \(lock\.cooldownUntilMs != null && lock\.cooldownUntilMs > now\) return failure\("cooldown-active"\);',
        'matched = await matchesHash\(value, credential\.pin!, this\.#derive\) && matched;',
        'protectedEnvelope = this\.#protection\.protect\(JSON\.stringify\(snapshot\.envelope\)\);',
        'credentials\.\$\{generation\}\.bin', 'metadata\.\$\{generation\}\.json',
        'join\(this\.#directory, "previous\.json"\)', 'join\(this\.#directory, "current\.json"\)',
        'return failure\("enrollment-mismatch"\);', 'return failure\("enrollment-expired"\);'
        '"pin": Object\.freeze\(\["pin"\] as const\)',
        '"password": Object\.freeze\(\["password"\] as const\)',
        '"pin-password": Object\.freeze\(\["pin", "password"\] as const\)',
        '"password-totp": Object\.freeze\(\["password", "totp"\] as const\)',
        '"pin-totp": Object\.freeze\(\["pin", "totp"\] as const\)',
        '"password-pin-totp": Object\.freeze\(\["password", "pin", "totp"\] as const\)'
    )
    foreach ($pattern in $requiredPatterns) { if (-not [regex]::IsMatch($store, $pattern)) { throw "Structural invariant missing: $pattern" } }
    if ([regex]::IsMatch($store, 'scryptSync|FileConnectorCredentialStore')) { throw 'Forbidden synchronous or plaintext credential path present' }
}
$sources = @{
    protocol = Read-Required 'design/packages/host/src/protocol.ts'
    store = Read-Required 'design/apps/desktop/src/main/toy-lock-store.ts'
    runtime = Read-Required 'design/apps/desktop/src/main/runtime.ts'
    preload = Read-Required 'design/apps/desktop/src/main/preload.cts'
}
Test-Contract $sources
if ($SelfTest) {
    $mutations = @(
        @{ part='protocol'; old='"general", '; new='' },
        @{ part='protocol'; old='"general", '; new='"general", "never-target", ' },
        @{ part='protocol'; old='"general", '; new='"general", "general", ' },
        @{ part='protocol'; old='"execution", "general"'; new='"general", "execution"' },
        @{ part='protocol'; old='Record<never, never>'; new='Record<string, never>' },
        @{ part='store'; old='"pin-password": Object.freeze(["pin", "password"] as const)'; new='"pin-password": Object.freeze(["password", "pin"] as const)' },
        @{ part='store'; old='"pin-password": Object.freeze(["pin", "password"] as const)'; new='"pin-password": Object.freeze(["pin", "password"] as const), "pin-password": Object.freeze(["pin", "password"] as const)' },
        @{ part='store'; old='scrypt(value, salt, HASH_BYTES, SCRYPT_OPTIONS, (error, derivedKey) => {'; new='scryptRemoved(value, salt, HASH_BYTES, SCRYPT_OPTIONS, (error, derivedKey) => {' },
        @{ part='store'; old='Number.isSafeInteger(value) && value >= 0'; new='Number.isFinite(value) && value >= 0' },
        @{ part='store'; old='if (lock == null) return failure("not-configured"); if (lock.revision !== request.revision) return failure("stale-revision");'; new='if (lock == null) return failure("not-configured");' },
        @{ part='store'; old='if (lock.cooldownUntilMs != null && lock.cooldownUntilMs > now) return failure("cooldown-active");'; new='if (false) return failure("cooldown-active");' },
        @{ part='store'; old='protectedEnvelope = this.#protection.protect(JSON.stringify(snapshot.envelope));'; new='protectedEnvelope = Buffer.from(JSON.stringify(snapshot.envelope));' },
        @{ part='store'; old='join(this.#directory, "previous.json")'; new='join(this.#directory, "prior.json")' },
        @{ part='runtime'; old="    requireMainWindowSender(event);`n    return toyLockStore.verify(request);"; new='    return toyLockStore.verify(request);' }
    )
    foreach ($mutation in $mutations) {
        $broken = @{} + $sources
        $old = $mutation.old
        if (-not $broken[$mutation.part].Contains($old)) { throw "Self-test mutation anchor missing: $($mutation.part)" }
        $broken[$mutation.part] = $broken[$mutation.part].Replace($old, $mutation.new)
        $red = $false
        try { Test-Contract $broken } catch { $red = $true }
        if (-not $red) { throw "Self-test stayed green: $($mutation.part) $($mutation.old)" }
        Test-Contract $sources
    }
}
Write-Output 'PASS: desktop Settings toy-lock host-store structural contract'
