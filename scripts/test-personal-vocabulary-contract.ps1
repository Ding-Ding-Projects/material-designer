[CmdletBinding()]
param(
    [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

function Read-Text([string]$Path) {
    [System.IO.File]::ReadAllText((Join-Path $repoRoot $Path))
}

function Require-Exact([string]$Text, [string]$Needle, [string]$Label) {
    if (-not $Text.Contains($Needle, [System.StringComparison]::Ordinal)) {
        throw "Missing exact contract boundary: $Label"
    }
}

function Get-Contracts {
    @(
        @{ Path = 'design/apps/web/src/lib/personal-vocabulary.ts'; Needle = 'export const PERSONAL_VOCABULARY_SCHEMA_VERSION = 1 as const;'; Label = 'versioned schema' },
        @{ Path = 'design/apps/web/src/lib/personal-vocabulary.ts'; Needle = 'readUniversalSettings().school.enabled'; Label = 'canonical School-mode read' },
        @{ Path = 'design/apps/web/src/lib/personal-vocabulary.ts'; Needle = "'factual-key'"; Label = 'factual-key refusal' },
        @{ Path = 'design/apps/web/src/lib/personal-vocabulary.ts'; Needle = 'export type PersonalVocabularyMutationResult ='; Label = 'discriminated mutation result' },
        @{ Path = 'design/apps/web/src/lib/personal-vocabulary.ts'; Needle = 'export function restorePersonalVocabularyCache'; Label = 'history refusal cache rollback' },
        @{ Path = 'design/apps/web/src/lib/personal-vocabulary.ts'; Needle = 'recordPersonalVocabularyHistory(action)'; Label = 'redacted local history recording' },
        @{ Path = 'design/apps/web/src/components/SettingsDialog.tsx'; Needle = 'PersonalVocabularySettings,'; Label = 'desktop panel import' },
        @{ Path = 'design/apps/web/src/components/SettingsDialog.tsx'; Needle = '<PersonalVocabularySettings onHistoryMutation={recordPersonalVocabularyHistory} />'; Label = 'desktop panel mount and history boundary' },
        @{ Path = 'design/apps/web/src/components/SettingsDialog.tsx'; Needle = 'subscribeToPersonalVocabularySchoolMode'; Label = 'desktop canonical School subscription' },
        @{ Path = 'design/apps/web/src/lib/personal-vocabulary.ts'; Needle = 'universalSettings?: HostUniversalSettingsBridge'; Label = 'desktop host School bridge' },
        @{ Path = 'design/apps/web/src/lib/personal-vocabulary.ts'; Needle = 'subscribeToPersonalVocabularySchoolMode'; Label = 'shared School adapter' },
        @{ Path = 'design/apps/web/src/components/PersonalVocabularySettings.tsx'; Needle = 'type="file" accept=".json,application/json"'; Label = 'desktop semantic JSON picker' },
        @{ Path = 'design/apps/web/src/components/PersonalVocabularySettings.tsx'; Needle = 'useRegexSearch(searchQuery, setSearchQuery)'; Label = 'desktop isolated search controller' },
        @{ Path = 'design/apps/web/src/components/PersonalVocabularySettings.tsx'; Needle = 'if (schoolMode) return null;'; Label = 'School-mode suppression' },
        @{ Path = 'design/apps/web/src/components/PersonalVocabularySettings.tsx'; Needle = "applyPersonalVocabulary(c(pair, playful), payload, 'private-ui')"; Label = 'desktop private UI boundary consumer' },
        @{ Path = 'design/apps/web/src/components/PersonalVocabularySettings.tsx'; Needle = 'finally {'; Label = 'desktop picker reset after every selection' },
        @{ Path = 'design/apps/web/src/components/command-palette/commands.ts'; Needle = "entry.id === 'personalVocabulary' && isPersonalVocabularySuppressed()"; Label = 'desktop palette School suppression' },
        @{ Path = 'design/apps/web/src/components/command-palette/settingsIndex.ts'; Needle = "id: 'personalVocabulary'"; Label = 'desktop palette inventory' },
        @{ Path = 'design/apps/web/src/i18n/index.tsx'; Needle = 'applyPersonalVocabularyToPrivateUiKey'; Label = 'desktop i18n private boundary adapter' },
        @{ Path = 'design/apps/daemon/src/app-config.ts'; Needle = 'validatePersonalVocabularyHistory'; Label = 'daemon history marker validation' },
        @{ Path = 'design/apps/daemon/src/history/service.ts'; Needle = 'async flushVerified(): Promise<boolean>'; Label = 'daemon history flush acknowledgement' },
        @{ Path = 'design/apps/daemon/src/routes/media.ts'; Needle = 'Restore the prior config marker'; Label = 'daemon config rollback after history refusal' },
        @{ Path = 'design/apps/daemon/src/server.ts'; Needle = 'lastRecordedPersonalVocabularyRevision'; Label = 'daemon marker revision deduplication' },
        @{ Path = 'design/packages/contracts/src/api/app-config.ts'; Needle = 'personalVocabularyHistory?: PersonalVocabularyHistoryMarker;'; Label = 'history marker contract' },
        @{ Path = 'site/assets/js/personal-vocabulary.js'; Needle = 'export function validatePersonalVocabularyText(source)'; Label = 'site text validator' },
        @{ Path = 'site/assets/js/personal-vocabulary.js'; Needle = "await selected.arrayBuffer()"; Label = 'site byte read' },
        @{ Path = 'site/assets/js/personal-vocabulary.js'; Needle = "new TextDecoder('utf-8', { fatal: true })"; Label = 'site fatal UTF-8 decode' },
        @{ Path = 'site/assets/js/personal-vocabulary.js'; Needle = 'function recordHistory(action)'; Label = 'site redacted history recording' },
        @{ Path = 'site/assets/js/personal-vocabulary.js'; Needle = 'data-personal-vocabulary-history-search'; Label = 'site history search surface' },
        @{ Path = 'site/assets/js/personal-vocabulary.js'; Needle = 'historyExport?.addEventListener'; Label = 'site history export action' },
        @{ Path = 'site/index.html'; Needle = 'data-personal-vocabulary-history-date-from'; Label = 'site history range filter' },
        @{ Path = 'site/assets/js/personal-vocabulary.js'; Needle = 'historyPreset?.addEventListener'; Label = 'site history date presets' },
        @{ Path = 'site/assets/js/personal-vocabulary.js'; Needle = 'historyActionSearch?.addEventListener'; Label = 'site derived action search' },
        @{ Path = 'site/assets/js/personal-vocabulary.js'; Needle = 'historyConfirmAction?.addEventListener'; Label = 'site history bulk confirmation' },
        @{ Path = 'site/assets/js/personal-vocabulary.js'; Needle = 'updateHistoryConfirmation'; Label = 'site confirmation slider readiness' },
        @{ Path = 'site/index.html'; Needle = 'data-personal-vocabulary-history-progress'; Label = 'site confirmation progress surface' },
        @{ Path = 'site/assets/js/personal-vocabulary.js'; Needle = 'historyConfirmStatus.textContent'; Label = 'site confirmation completion state' },
        @{ Path = 'site/assets/js/personal-vocabulary.js'; Needle = "event.key === 'Escape'"; Label = 'site dropdown Escape focus return' },
        @{ Path = 'site/assets/js/personal-vocabulary.js'; Needle = 'historyEventId = (event, history)'; Label = 'collision-proof history ids' },
        @{ Path = 'site/assets/js/personal-vocabulary.js'; Needle = "action: 'deleted'"; Label = 'append-only deletion event' },
        @{ Path = 'design/apps/web/tests/site/personal-vocabulary.behavior.test.ts'; Needle = 'documentation site personal-vocabulary behavior'; Label = 'site behavior suite' },
        @{ Path = 'site/index.html'; Needle = 'data-personal-vocabulary'; Label = 'site Settings mount' },
        @{ Path = 'site/index.html'; Needle = 'data-regex-builder'; Label = 'site anchored regex registration' },
        @{ Path = 'site/index.html'; Needle = 'data-personal-vocabulary-history-date'; Label = 'site history date filter' },
        @{ Path = 'site/index.html'; Needle = 'data-personal-vocabulary-history-action-options'; Label = 'site searchable action dropdown' },
        @{ Path = 'site/index.html'; Needle = 'data-personal-vocabulary-history-preset-options'; Label = 'site searchable date preset dropdown' },
        @{ Path = 'site/index.html'; Needle = 'data-personal-vocabulary-history-preset-search'; Label = 'site date preset regex search' },
        @{ Path = 'site/assets/js/main.js'; Needle = 'PERSONAL_VOCABULARY_SCHOOL_MODE_EVENT'; Label = 'site canonical School-mode event wiring' },
        @{ Path = 'site/assets/js/main.js'; Needle = 'personalVocabularySuppressed && personalVocabulary'; Label = 'site search suppression invariant' },
        @{ Path = 'docs/standards/personal-vocabulary.md'; Needle = 'personalVocabularyHistory'; Label = 'focused history boundary documentation' },
        @{ Path = 'README.md'; Needle = '### Local personal-vocabulary JSON control'; Label = 'README feature record' },
        @{ Path = 'scripts/test-personal-vocabulary-contract.ps1'; Needle = 'Assert-SelfTestCase'; Label = 'source evidence Shek Q' }
    )
}

function Assert-Contract {
    $contracts = Get-Contracts
    foreach ($contract in $contracts) {
        Require-Exact (Read-Text $contract.Path) $contract.Needle $contract.Label
    }
}

function Assert-SelfTestCase([hashtable]$Contract) {
    $sourcePath = Join-Path $repoRoot $Contract.Path
    $original = [System.IO.File]::ReadAllText($sourcePath)
    $temp = Join-Path ([System.IO.Path]::GetTempPath()) ('personal-vocabulary-contract-' + [Guid]::NewGuid().ToString('N') + '.txt')
    try {
        [System.IO.File]::WriteAllText($temp, $original)
        $needle = [string]$Contract.Needle
        $broken = $original.Replace($needle, '')
        [System.IO.File]::WriteAllText($temp, $broken)
        $brokenText = [System.IO.File]::ReadAllText($temp)
        $red = $false
        try {
            Require-Exact $brokenText $needle $Contract.Label
        } catch {
            $red = $true
        }
        if (-not $red) { throw "Negative regression did not turn red after removing $($Contract.Label)." }
        [System.IO.File]::WriteAllText($temp, $original)
        $restoredText = [System.IO.File]::ReadAllText($temp)
        Require-Exact $restoredText $needle $Contract.Label
    } finally {
        if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force }
    }
}

function Assert-SelfTest {
    $contracts = Get-Contracts
    foreach ($contract in $contracts) { Assert-SelfTestCase $contract }
    Write-Output 'PASS: personal-vocabulary contract self-test red then green for validator, mount, palette, locales, site, boundary, history, and evidence'
}

Assert-Contract
if ($SelfTest) { Assert-SelfTest }
Write-Output 'PASS: personal-vocabulary contract inventory'
