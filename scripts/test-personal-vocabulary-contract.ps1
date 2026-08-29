[CmdletBinding()]
param(
    [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

function Read-Text([string]$Root, [string]$Path) {
    $fullPath = Join-Path $Root $Path
    if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
        throw "Missing personal-vocabulary contract file: $Path"
    }
    [System.IO.File]::ReadAllText($fullPath)
}

function Has-ExactLine([string]$Text, [string]$Needle) {
    $lines = $Text -split '\r\n|\n|\r'
    foreach ($line in $lines) {
        if ($line.Trim() -eq $Needle) { return $true }
    }
    return $false
}

function Require-ExactLine([string]$Text, [string]$Needle, [string]$Label) {
    if (-not (Has-ExactLine $Text $Needle)) {
        throw "Missing exact contract boundary: $Label"
    }
}

function Require-Contains([string]$Text, [string]$Needle, [string]$Label) {
    if ($Text.IndexOf($Needle, [System.StringComparison]::Ordinal) -lt 0) {
        throw "Missing contract boundary: $Label"
    }
}

function Get-Contracts {
    @(
        @{ Path = 'design/apps/web/src/lib/personal-vocabulary.ts'; Kind = 'line'; Needle = 'export const PERSONAL_VOCABULARY_SCHEMA_VERSION = 1 as const;'; Label = 'versioned schema' },
        @{ Path = 'design/apps/web/src/lib/personal-vocabulary.ts'; Kind = 'line'; Needle = 'export interface PersonalVocabularyC1 {'; Label = 'injected C1 interface' },
        @{ Path = 'design/apps/web/src/lib/personal-vocabulary.ts'; Kind = 'line'; Needle = 'export function configurePersonalVocabularyC1(adapter: PersonalVocabularyC1 | null): void {'; Label = 'C1 configuration seam' },
        @{ Path = 'design/apps/web/src/lib/personal-vocabulary.ts'; Kind = 'line'; Needle = 'export function readPersonalVocabularySchoolMode(adapter?: PersonalVocabularyC1): boolean {'; Label = 'C1 read seam' },
        @{ Path = 'design/apps/web/src/lib/personal-vocabulary.ts'; Kind = 'line'; Needle = 'export function subscribeToPersonalVocabularySchoolMode('; Label = 'C1 subscription seam' },
        @{ Path = 'design/apps/web/src/lib/personal-vocabulary.ts'; Kind = 'line'; Needle = 'export function validatePersonalVocabularyBytes(bytes: Uint8Array): PersonalVocabularyLoadResult {'; Label = 'byte validation' },
        @{ Path = 'design/apps/web/src/lib/personal-vocabulary.ts'; Kind = 'line'; Needle = 'export function restorePersonalVocabularyCache(payload: PersonalVocabularyPayload | null): boolean {'; Label = 'transaction rollback' },
        @{ Path = 'design/apps/web/src/lib/personal-vocabulary.ts'; Kind = 'line'; Needle = 'export function applyPersonalVocabularyToPrivateUiKey('; Label = 'accessible private UI boundary' },
        @{ Path = 'design/apps/web/src/lib/personal-vocabulary.ts'; Kind = 'line'; Needle = "function recordPersonalVocabularyHistory(action: PersonalVocabularyHistoryEvent['action']): boolean {"; Label = 'redacted local history' },
        @{ Path = 'design/apps/web/src/lib/personal-vocabulary.ts'; Kind = 'line'; Needle = 'export function isPersonalVocabularySuppressed(adapter?: PersonalVocabularyC1): boolean {'; Label = 'School suppression read' },
        @{ Path = 'design/apps/web/src/components/PersonalVocabularySettings.tsx'; Kind = 'line'; Needle = 'export const PERSONAL_VOCABULARY_SETTINGS_ID = ''personalVocabulary'' as const;'; Label = 'C0 settings id' },
        @{ Path = 'design/apps/web/src/components/PersonalVocabularySettings.tsx'; Kind = 'line'; Needle = 'export const PERSONAL_VOCABULARY_PALETTE_ID = `setting:${PERSONAL_VOCABULARY_SETTINGS_ID}` as const;'; Label = 'C0 palette id' },
        @{ Path = 'design/apps/web/src/components/PersonalVocabularySettings.tsx'; Kind = 'line'; Needle = 'export function PersonalVocabularySettings({ onHistoryMutation, schoolModeSource }: PersonalVocabularySettingsProps) {'; Label = 'settings component mount' },
        @{ Path = 'design/apps/web/src/components/PersonalVocabularySettings.tsx'; Kind = 'line'; Needle = '/** C1 is injected by the app shell so this component never owns School state. */'; Label = 'component C1 prop' },
        @{ Path = 'design/apps/web/src/components/PersonalVocabularySettings.tsx'; Kind = 'line'; Needle = 'export function mountPersonalVocabularySettings('; Label = 'C0 render API' },
        @{ Path = 'design/apps/web/src/components/PersonalVocabularySettings.tsx'; Kind = 'line'; Needle = 'if (schoolMode) return null;'; Label = 'School-mode suppression' },
        @{ Path = 'design/apps/web/src/components/PersonalVocabularySettings.tsx'; Kind = 'contains'; Needle = '<input key={fileInputKey} type="file" accept=".json,application/json"'; Label = 'semantic JSON picker' },
        @{ Path = 'design/apps/web/src/components/PersonalVocabularySettings.tsx'; Kind = 'contains'; Needle = '<RegexSearchField search={search}'; Label = 'isolated search builder' },
        @{ Path = 'design/apps/web/src/components/PersonalVocabularySettings.tsx'; Kind = 'contains'; Needle = 'data-personal-vocabulary="true"'; Label = 'settings surface marker' },
        @{ Path = 'design/apps/web/src/components/PersonalVocabularySettings.module.css'; Kind = 'line'; Needle = '.section {'; Label = 'Material settings surface' },
        @{ Path = 'design/apps/web/src/components/PersonalVocabularySettings.module.css'; Kind = 'line'; Needle = '@media (max-width: 760px) {'; Label = 'narrow layout' },
        @{ Path = 'docs/standards/personal-vocabulary.md'; Kind = 'line'; Needle = '# Local personal-vocabulary JSON'; Label = 'feature article' }
    )
}

function Test-Contracts([string]$Root, [object[]]$Contracts) {
    foreach ($contract in $Contracts) {
        $text = Read-Text $Root $contract.Path
        if ($contract.Kind -eq 'line') {
            Require-ExactLine $text $contract.Needle $contract.Label
        } else {
            Require-Contains $text $contract.Needle $contract.Label
        }
    }
}

function Copy-ContractFiles([string]$Destination, [object[]]$Contracts) {
    foreach ($path in ($Contracts.Path | Sort-Object -Unique)) {
        $source = Join-Path $repoRoot $path
        $target = Join-Path $Destination $path
        $parent = Split-Path -Parent $target
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
        Copy-Item -LiteralPath $source -Destination $target
    }
}

$contracts = @(Get-Contracts)
Test-Contracts $repoRoot $contracts
Write-Output "PASS: personal-vocabulary contract inventory ($($contracts.Count) boundaries)"

if ($SelfTest) {
    $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("personal-vocabulary-contract-" + [System.Guid]::NewGuid().ToString('N'))
    try {
        Copy-ContractFiles $tempRoot $contracts
        foreach ($contract in $contracts) {
            $target = Join-Path $tempRoot $contract.Path
            $before = [System.IO.File]::ReadAllText($target)
            $after = $before.Replace($contract.Needle, '')
            if ($after -eq $before) { throw "Self-test could not remove $($contract.Label)" }
            [System.IO.File]::WriteAllText($target, $after)
            $failed = $false
            try { Test-Contracts $tempRoot $contracts } catch { $failed = $true }
            if (-not $failed) { throw "Negative self-test stayed green: $($contract.Label)" }
            [System.IO.File]::WriteAllText($target, $before)
            Test-Contracts $tempRoot $contracts
        }
        Write-Output "PASS: personal-vocabulary deliberate red/green self-test ($($contracts.Count) removals)"
    } finally {
        if (Test-Path -LiteralPath $tempRoot) {
            Remove-Item -LiteralPath $tempRoot -Recurse -Force
        }
    }
}
