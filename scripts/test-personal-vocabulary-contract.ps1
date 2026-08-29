[CmdletBinding()]
param(
    [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

function Read-Text([string]$Root, [string]$Path) {
    $fullPath = Join-Path $Root $Path
    if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
        throw "Missing personal-vocabulary inventory file '$Path'."
    }
    [System.IO.File]::ReadAllText($fullPath)
}

function Strip-Comments([string]$Text) {
    $builder = New-Object System.Text.StringBuilder
    $index = 0
    $block = $false
    $line = $false
    $quote = [char]0
    $escaped = $false
    while ($index -lt $Text.Length) {
        $char = $Text[$index]
        $next = if (($index + 1) -lt $Text.Length) { $Text[$index + 1] } else { [char]0 }
        if ($line) {
            if ($char -eq "`r" -or $char -eq "`n") {
                $line = $false
                [void]$builder.Append($char)
            } else {
                [void]$builder.Append(' ')
            }
            $index += 1
            continue
        }
        if ($block) {
            if ($char -eq '*' -and $next -eq '/') {
                [void]$builder.Append('  ')
                $index += 2
                $block = $false
            } else {
                if ($char -eq "`r" -or $char -eq "`n") { [void]$builder.Append($char) }
                else { [void]$builder.Append(' ') }
                $index += 1
            }
            continue
        }
        if ($quote -ne [char]0) {
            [void]$builder.Append($char)
            if ($escaped) { $escaped = $false }
            elseif ($char -eq '\') { $escaped = $true }
            elseif ($char -eq $quote) { $quote = [char]0 }
            $index += 1
            continue
        }
        if ($char -eq '/' -and $next -eq '/') {
            [void]$builder.Append('  ')
            $index += 2
            $line = $true
            continue
        }
        if ($char -eq '/' -and $next -eq '*') {
            [void]$builder.Append('  ')
            $index += 2
            $block = $true
            continue
        }
        if ($char -eq "'" -or $char -eq '"' -or $char -eq '`') { $quote = $char }
        [void]$builder.Append($char)
        $index += 1
    }
    $builder.ToString()
}

function Require-Symbol([string]$Text, [string]$Pattern, [string]$Label) {
    $code = Strip-Comments $Text
    if ($code -notmatch $Pattern) {
        throw "Missing syntax-aware contract boundary '$Label'."
    }
}

function Require-ExactLiteral([string]$Text, [string]$Needle, [string]$Label) {
    if ($Text.IndexOf($Needle, [System.StringComparison]::Ordinal) -lt 0) {
        throw "Missing exact contract literal '$Label'."
    }
}

function Get-FeatureInventory {
    @(
        @{ Id = 'loader-schema'; Path = 'design/apps/web/src/lib/personal-vocabulary.ts'; Kind = 'ts'; Pattern = '(?m)^\s*export\s+const\s+PERSONAL_VOCABULARY_SCHEMA_VERSION\s*=\s*1\s+as\s+const\s*;'; Label = 'versioned schema' },
        @{ Id = 'loader-c1-interface'; Path = 'design/apps/web/src/lib/personal-vocabulary.ts'; Kind = 'ts'; Pattern = '(?m)^\s*export\s+interface\s+PersonalVocabularyC1\s*\{'; Label = 'injected C1 interface' },
        @{ Id = 'loader-c1-configure'; Path = 'design/apps/web/src/lib/personal-vocabulary.ts'; Kind = 'ts'; Pattern = '(?m)^\s*export\s+function\s+configurePersonalVocabularyC1\s*\('; Label = 'C1 configuration seam' },
        @{ Id = 'loader-c1-read'; Path = 'design/apps/web/src/lib/personal-vocabulary.ts'; Kind = 'ts'; Pattern = '(?m)^\s*export\s+function\s+readPersonalVocabularySchoolMode\s*\('; Label = 'C1 read seam' },
        @{ Id = 'loader-c1-subscribe'; Path = 'design/apps/web/src/lib/personal-vocabulary.ts'; Kind = 'ts'; Pattern = '(?m)^\s*export\s+function\s+subscribeToPersonalVocabularySchoolMode\s*\('; Label = 'C1 subscription seam' },
        @{ Id = 'loader-byte-validation'; Path = 'design/apps/web/src/lib/personal-vocabulary.ts'; Kind = 'ts'; Pattern = '(?m)^\s*export\s+function\s+validatePersonalVocabularyBytes\s*\('; Label = 'byte validation' },
        @{ Id = 'loader-unicode-number'; Path = 'design/apps/web/src/lib/personal-vocabulary.ts'; Kind = 'ts'; Pattern = '(?m)^\s*const\s+FACTUAL_KEY_PATTERN\s*=\s*/\\p\{Number\}/u\s*;'; Label = 'Unicode Number category rejection' },
        @{ Id = 'loader-unicode-safe'; Path = 'design/apps/web/src/lib/personal-vocabulary.ts'; Kind = 'ts'; Pattern = '(?m)^\s*function\s+hasForbiddenUnicode\s*\('; Label = 'decoded Unicode safety validation' },
        @{ Id = 'loader-state-snapshot'; Path = 'design/apps/web/src/lib/personal-vocabulary.ts'; Kind = 'ts'; Pattern = '(?m)^\s*export\s+function\s+readPersonalVocabularyStateSnapshot\s*\('; Label = 'cache and local history snapshot' },
        @{ Id = 'loader-state-restore'; Path = 'design/apps/web/src/lib/personal-vocabulary.ts'; Kind = 'ts'; Pattern = '(?m)^\s*export\s+function\s+restorePersonalVocabularyState\s*\('; Label = 'transactional state restore' },
        @{ Id = 'loader-history'; Path = 'design/apps/web/src/lib/personal-vocabulary.ts'; Kind = 'ts'; Pattern = '(?m)^\s*function\s+recordPersonalVocabularyHistory\s*\('; Label = 'redacted local history' },
        @{ Id = 'loader-boundary'; Path = 'design/apps/web/src/lib/personal-vocabulary.ts'; Kind = 'ts'; Pattern = '(?m)^\s*export\s+function\s+applyPersonalVocabulary\s*\('; Label = 'private UI boundary' },
        @{ Id = 'loader-boundary-policy'; Path = 'design/apps/web/src/lib/personal-vocabulary.ts'; Kind = 'ts'; Pattern = '(?m)^\s*function\s+matchesAtBoundary\s*\('; Label = 'Unicode match boundary policy' },
        @{ Id = 'loader-school-suppression'; Path = 'design/apps/web/src/lib/personal-vocabulary.ts'; Kind = 'ts'; Pattern = '(?m)^\s*export\s+function\s+isPersonalVocabularySuppressed\s*\('; Label = 'School suppression read' },
        @{ Id = 'component-c0-settings'; Path = 'design/apps/web/src/components/PersonalVocabularySettings.tsx'; Kind = 'ts'; Pattern = '(?m)^\s*export\s+const\s+PERSONAL_VOCABULARY_SETTINGS_ID\s*=\s*''personalVocabulary''\s+as\s+const\s*;'; Label = 'C0 Settings id' },
        @{ Id = 'component-c0-palette'; Path = 'design/apps/web/src/components/PersonalVocabularySettings.tsx'; Kind = 'ts'; Pattern = '(?m)^\s*export\s+const\s+PERSONAL_VOCABULARY_PALETTE_ID\s*=\s*`setting:\$\{PERSONAL_VOCABULARY_SETTINGS_ID\}`\s+as\s+const\s*;'; Label = 'C0 palette id' },
        @{ Id = 'component-c1-prop'; Path = 'design/apps/web/src/components/PersonalVocabularySettings.tsx'; Kind = 'literal'; Literal = 'schoolModeSource?: PersonalVocabularyC1;'; Label = 'component C1 prop' },
        @{ Id = 'component-settings'; Path = 'design/apps/web/src/components/PersonalVocabularySettings.tsx'; Kind = 'ts'; Pattern = '(?m)^\s*export\s+function\s+PersonalVocabularySettings\s*\('; Label = 'Settings component' },
        @{ Id = 'component-c0-render'; Path = 'design/apps/web/src/components/PersonalVocabularySettings.tsx'; Kind = 'ts'; Pattern = '(?m)^\s*export\s+function\s+mountPersonalVocabularySettings\s*\('; Label = 'C0 render API' },
        @{ Id = 'component-school-suppression'; Path = 'design/apps/web/src/components/PersonalVocabularySettings.tsx'; Kind = 'literal'; Literal = 'if (schoolMode !== false) return null;'; Label = 'component School suppression' },
        @{ Id = 'component-picker'; Path = 'design/apps/web/src/components/PersonalVocabularySettings.tsx'; Kind = 'literal'; Literal = 'type="file" accept=".json,application/json"'; Label = 'semantic JSON picker' },
        @{ Id = 'component-search'; Path = 'design/apps/web/src/components/PersonalVocabularySettings.tsx'; Kind = 'ts'; Pattern = '(?m)^\s*const\s+search\s*=\s*useRegexSearch\(searchQuery,\s*setSearchQuery\);'; Label = 'isolated search builder' },
        @{ Id = 'component-marker'; Path = 'design/apps/web/src/components/PersonalVocabularySettings.tsx'; Kind = 'literal'; Literal = 'data-personal-vocabulary="true"'; Label = 'Settings surface marker' },
        @{ Id = 'component-css'; Path = 'design/apps/web/src/components/PersonalVocabularySettings.module.css'; Kind = 'literal'; Literal = '.section {'; Label = 'Material Settings surface' },
        @{ Id = 'component-narrow'; Path = 'design/apps/web/src/components/PersonalVocabularySettings.module.css'; Kind = 'literal'; Literal = '@media (max-width: 760px) {'; Label = 'narrow layout' },
        @{ Id = 'site-module-mount'; Path = 'site/assets/js/personal-vocabulary.js'; Kind = 'js'; Pattern = '(?m)^\s*export\s+function\s+mountPersonalVocabulary\s*\('; Label = 'site feature mount' },
        @{ Id = 'site-module-open'; Path = 'site/assets/js/personal-vocabulary.js'; Kind = 'js'; Pattern = '(?m)^\s*export\s+function\s+openPersonalVocabulary\s*\('; Label = 'site feature open API' },
        @{ Id = 'site-module-c1'; Path = 'site/assets/js/personal-vocabulary.js'; Kind = 'js'; Pattern = '(?m)^\s*export\s+function\s+configurePersonalVocabularyC1\s*\('; Label = 'site C1 configuration seam' },
        @{ Id = 'site-module-events'; Path = 'site/assets/js/personal-vocabulary.js'; Kind = 'js'; Pattern = '(?m)^\s*export\s+const\s+PERSONAL_VOCABULARY_MOUNT_EVENT\s*='; Label = 'site mount event contract' },
        @{ Id = 'site-module-unicode'; Path = 'site/assets/js/personal-vocabulary.js'; Kind = 'js'; Pattern = '(?m)^\s*const\s+FACTUAL_KEY_PATTERN\s*=\s*/\\p\{Number\}/u\s*;'; Label = 'site Unicode Number rejection' },
        @{ Id = 'site-module-boundary'; Path = 'site/assets/js/personal-vocabulary.js'; Kind = 'literal'; Literal = 'function matchesAtBoundary(text, ordinary, index)'; Label = 'site match boundary policy' },
        @{ Id = 'site-test'; Path = 'design/apps/web/tests/site/personal-vocabulary.behavior.test.ts'; Kind = 'ts'; Pattern = '(?m)^\s*const\s+SITE_URL\s*='; Label = 'site behavior check' },
        @{ Id = 'site-test-probe'; Path = 'design/apps/web/tests/site/personal-vocabulary.behavior.test.ts'; Kind = 'ts'; Pattern = '(?m)^\s*function\s+runSiteProbe\(body:\s*string\):\s*string\s*\{'; Label = 'real site module probe' },
        @{ Id = 'docs'; Path = 'docs/standards/personal-vocabulary.md'; Kind = 'literal'; Literal = '# Local personal-vocabulary JSON'; Label = 'feature article' },
        @{ Id = 'c0-settings-handoff'; Path = 'design/apps/web/src/components/SettingsDialog.tsx'; Kind = 'inventory'; Owner = 'C0'; Status = 'parent-owned'; Label = 'central Settings mount handoff' },
        @{ Id = 'c0-palette-handoff'; Path = 'design/apps/web/src/components/command-palette/commands.ts'; Kind = 'inventory'; Owner = 'C0'; Status = 'parent-owned'; Label = 'central palette handoff' },
        @{ Id = 'c0-i18n-handoff'; Path = 'design/apps/web/src/i18n/index.tsx'; Kind = 'inventory'; Owner = 'C0'; Status = 'parent-owned'; Label = 'central i18n handoff' },
        @{ Id = 'c1-universal-handoff'; Path = 'design/apps/web/src/components/universal/universalSettings.ts'; Kind = 'inventory'; Owner = 'C1'; Status = 'parent-owned'; Label = 'canonical universal settings handoff' }
    )
}

function Test-InventoryItem([string]$Root, [object]$Item) {
    if ($Item.Kind -eq 'inventory') { return }
    $text = Read-Text $Root $Item.Path
    if ($Item.Kind -eq 'literal') {
        $candidate = if ($Item.Path -match '\.(ts|tsx|js|css)$') { Strip-Comments $text } else { $text }
        Require-ExactLiteral $candidate $Item.Literal $Item.Label
    } else {
        Require-Symbol $text $Item.Pattern $Item.Label
    }
}

function Test-FeatureInventory([string]$Root, [object[]]$Inventory) {
    foreach ($item in $Inventory) { Test-InventoryItem $Root $item }
}

function Copy-FeatureFiles([string]$Destination, [object[]]$Inventory) {
    foreach ($path in ($Inventory.Path | Sort-Object -Unique)) {
        $source = Join-Path $repoRoot $path
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { continue }
        $target = Join-Path $Destination $path
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
        Copy-Item -LiteralPath $source -Destination $target
    }
}

$inventory = @(Get-FeatureInventory)
Test-FeatureInventory $repoRoot $inventory
Write-Output "PASS: personal-vocabulary feature inventory ($($inventory.Count) rows, $((@($inventory | Where-Object Kind -ne 'inventory')).Count) source boundaries)"

if ($SelfTest) {
    $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("personal-vocabulary-contract-" + [System.Guid]::NewGuid().ToString('N'))
    try {
        Copy-FeatureFiles $tempRoot $inventory
        $owned = @($inventory | Where-Object Kind -ne 'inventory')
        foreach ($item in $owned) {
            $target = Join-Path $tempRoot $item.Path
            $before = [System.IO.File]::ReadAllText($target)
            $needle = if ($item.Kind -eq 'literal') { $item.Literal } else {
                switch ($item.Id) {
                    'loader-schema' { 'export const PERSONAL_VOCABULARY_SCHEMA_VERSION = 1 as const;' }
                    'loader-c1-interface' { 'export interface PersonalVocabularyC1 {' }
                    'loader-c1-configure' { 'export function configurePersonalVocabularyC1(adapter: PersonalVocabularyC1 | null): void {' }
                    'loader-c1-read' { 'export function readPersonalVocabularySchoolMode(adapter?: PersonalVocabularyC1): boolean | null {' }
                    'loader-c1-subscribe' { 'export function subscribeToPersonalVocabularySchoolMode(' }
                    'loader-byte-validation' { 'export function validatePersonalVocabularyBytes(bytes: Uint8Array): PersonalVocabularyLoadResult {' }
                    'loader-unicode-number' { 'const FACTUAL_KEY_PATTERN = /\p{Number}/u;' }
                    'loader-unicode-safe' { 'function hasForbiddenUnicode(value: string): boolean {' }
                    'loader-state-snapshot' { 'export function readPersonalVocabularyStateSnapshot(): PersonalVocabularyStateSnapshot {' }
                    'loader-state-restore' { 'export function restorePersonalVocabularyState(snapshot: PersonalVocabularyStateSnapshot): boolean {' }
                    'loader-history' { "function recordPersonalVocabularyHistory(action: PersonalVocabularyHistoryEvent['action']): boolean {" }
                    'loader-boundary' { 'export function applyPersonalVocabulary(' }
                    'loader-boundary-policy' { 'function matchesAtBoundary(' }
                    'loader-school-suppression' { 'export function isPersonalVocabularySuppressed(adapter?: PersonalVocabularyC1): boolean {' }
                    'component-c0-settings' { "export const PERSONAL_VOCABULARY_SETTINGS_ID = 'personalVocabulary' as const;" }
                    'component-c0-palette' { 'export const PERSONAL_VOCABULARY_PALETTE_ID =' }
                    'component-settings' { 'export function PersonalVocabularySettings(' }
                    'component-c0-render' { 'export function mountPersonalVocabularySettings(' }
                    'component-search' { 'const search = useRegexSearch(searchQuery, setSearchQuery);' }
                    'site-module-mount' { 'export function mountPersonalVocabulary(' }
                    'site-module-open' { 'export function openPersonalVocabulary()' }
                    'site-module-c1' { 'export function configurePersonalVocabularyC1(adapter)' }
                    'site-module-events' { 'export const PERSONAL_VOCABULARY_MOUNT_EVENT =' }
                    'site-module-unicode' { 'const FACTUAL_KEY_PATTERN = /\p{Number}/u;' }
                    'site-test' { 'const SITE_URL =' }
                    'site-test-probe' { 'function runSiteProbe(body: string): string {' }
                    default { $null }
                }
            }
            if ([string]::IsNullOrEmpty($needle)) { throw "Self-test has no removable literal for '$($item.Id)'." }
            $after = $before.Replace($needle, '')
            if ($after -eq $before) { throw "Self-test could not remove '$($item.Label)'." }
            [System.IO.File]::WriteAllText($target, $after)
            $failed = $false
            try { Test-InventoryItem $tempRoot $item } catch { $failed = $true }
            if (-not $failed) { throw "Negative self-test stayed green for '$($item.Label)'." }
            [System.IO.File]::WriteAllText($target, $before)
            Test-InventoryItem $tempRoot $item
        }
        foreach ($item in @($owned | Where-Object { $_.Path -match '\.(ts|tsx|js)$' })) {
            $target = Join-Path $tempRoot $item.Path
            $before = [System.IO.File]::ReadAllText($target)
            $line = $null
            if ($item.Kind -eq 'literal') {
                $line = $before -split '\r\n|\n|\r' | Where-Object {
                    $_.IndexOf($item.Literal, [System.StringComparison]::Ordinal) -ge 0
                } | Select-Object -First 1
            } else {
                $plainPattern = $item.Pattern -replace '\(\?m\)', ''
                $line = $before -split '\r\n|\n|\r' | Where-Object { $_ -match $plainPattern } | Select-Object -First 1
            }
            if ([string]::IsNullOrEmpty($line)) { continue }
            $commented = $before.Replace($line, "// $line")
            [System.IO.File]::WriteAllText($target, $commented)
            $failedComment = $false
            try { Test-InventoryItem $tempRoot $item } catch { $failedComment = $true }
            if (-not $failedComment) { throw "Commented-code self-test stayed green for '$($item.Label)'." }
            [System.IO.File]::WriteAllText($target, $before)
            Test-InventoryItem $tempRoot $item
        }
        foreach ($item in @($owned | Where-Object { $_.Path -match '\.(ts|tsx|js)$' })) {
            $target = Join-Path $tempRoot $item.Path
            $before = [System.IO.File]::ReadAllText($target)
            $line = $null
            if ($item.Kind -eq 'literal') {
                $line = $before -split '\r\n|\n|\r' | Where-Object {
                    $_.IndexOf($item.Literal, [System.StringComparison]::Ordinal) -ge 0
                } | Select-Object -First 1
            } else {
                $plainPattern = $item.Pattern -replace '\(\?m\)', ''
                $line = $before -split '\r\n|\n|\r' | Where-Object { $_ -match $plainPattern } | Select-Object -First 1
            }
            if ([string]::IsNullOrEmpty($line)) { continue }
            $detached = $line
            if ($line -match '(function|const|interface)\s+([A-Za-z0-9_]+)') {
                $detached = $line.Replace($matches[2], $matches[2] + '_detached')
            } else {
                continue
            }
            [System.IO.File]::WriteAllText($target, $before.Replace($line, $detached))
            $failedDetached = $false
            try { Test-InventoryItem $tempRoot $item } catch { $failedDetached = $true }
            if (-not $failedDetached) { throw "Detached-code self-test stayed green for '$($item.Label)'." }
            [System.IO.File]::WriteAllText($target, $before)
            Test-InventoryItem $tempRoot $item
        }
        Write-Output "PASS: personal-vocabulary deliberate red/green self-test ($($owned.Count) removals plus commented-code and detached-code negatives)"
    } finally {
        if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
    }
}
