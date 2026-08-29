[CmdletBinding()]
param([switch]$SelfTest)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$core = Join-Path $root 'design/apps/web/src/runtime/ollama-suite.ts'
$ui = Join-Path $root 'design/apps/web/src/components/ollama/OllamaSuiteManager.tsx'
$docs = Join-Path $root 'docs/standards/ollama-suite.md'

function Test-ContractMarker([string]$text, [string]$pattern) {
  return [regex]::IsMatch($text, $pattern)
}

function Invoke-Contract([string]$coreText, [string]$uiText, [string]$docsText) {
  $required = @(
    @{ Text = $coreText; Pattern = '(?m)^export async function collectCatalog\(' },
    @{ Text = $coreText; Pattern = '(?m)^export function computeHardwareFit\(' },
    @{ Text = $coreText; Pattern = '(?m)^export function reconcileInstalledModels\(' },
    @{ Text = $coreText; Pattern = '(?m)^export function parseHardwareFacts\(' },
    @{ Text = $coreText; Pattern = '(?m)^export function validateHarnessProfile\(' },
    @{ Text = $coreText; Pattern = '(?m)^export function resolveOllamaHostBridge\(' },
    @{ Text = $coreText; Pattern = '(?m)^export function createOllamaSuiteClient\(' },
    @{ Text = $coreText; Pattern = '(?m)^export function attachmentCapability\(' },
    @{ Text = $coreText; Pattern = '(?m)^export function validateChatParameters\(' },
    @{ Text = $coreText; Pattern = '(?m)^export function createChatSession\(' },
    @{ Text = $coreText; Pattern = '(?m)^export function redactChatExport\(' },
    @{ Text = $coreText; Pattern = '(?m)^export function parseChatSession\(' },
    @{ Text = $coreText; Pattern = '(?m)^export function searchChatSessions\(' },
    @{ Text = $coreText; Pattern = '(?m)^export function renameChatSession\(' },
    @{ Text = $coreText; Pattern = '(?m)^export function parsePullRecord\(' },
    @{ Text = $coreText; Pattern = '(?m)^export function parseCatalogSnapshot\(' },
    @{ Text = $coreText; Pattern = '(?m)^export interface OllamaSuiteClient\b' },
    @{ Text = $coreText; Pattern = '(?m)^\s*harnessRestore\(' },
    @{ Text = $uiText; Pattern = '(?m)^\s*<section\b[^\r\n]*data-testid="ollama-suite-manager"' },
    @{ Text = $uiText; Pattern = '(?m)^\s*<RegexSearchField\b[^\r\n]*search=\{activeSearch\}' },
    @{ Text = $uiText; Pattern = '(?m)data-testid="ollama-host-bridge-state"' },
    @{ Text = $uiText; Pattern = '(?m)data-testid="ollama-harness-preview"' },
    @{ Text = $docsText; Pattern = '(?m)^# Local Ollama suite manager$' },
    @{ Text = $docsText; Pattern = '(?m)^## Security considerations$' },
    @{ Text = $docsText; Pattern = '(?mi)last verified catalog' },
    @{ Text = $docsText; Pattern = '(?mi)shell syntax' }
  )
  $missing = @($required | Where-Object { -not (Test-ContractMarker $_.Text $_.Pattern) })
  return $missing.Count -eq 0
}

if (-not (Test-Path -LiteralPath $core) -or -not (Test-Path -LiteralPath $ui) -or -not (Test-Path -LiteralPath $docs)) {
  throw 'Ollama suite contract source or documentation is missing.'
}

$coreText = Get-Content -LiteralPath $core -Raw
$uiText = Get-Content -LiteralPath $ui -Raw
$docsText = Get-Content -LiteralPath $docs -Raw

if ($SelfTest) {
  $mutations = @(
    @{ Text = $coreText; From = 'export async function collectCatalog('; To = 'export async function collectCatalogRemoved(' },
    @{ Text = $coreText; From = 'export function computeHardwareFit('; To = 'export function computeHardwareFitRemoved(' },
    @{ Text = $coreText; From = 'export function resolveOllamaHostBridge('; To = 'export function resolveOllamaHostBridgeRemoved(' },
    @{ Text = $coreText; From = 'export function attachmentCapability('; To = 'export function attachmentCapabilityRemoved(' },
    @{ Text = $coreText; From = 'export function createChatSession('; To = 'export function createChatSessionRemoved(' },
    @{ Text = $uiText; From = 'data-testid="ollama-suite-manager"'; To = 'data-testid="ollama-suite-removed"' },
    @{ Text = $uiText; From = 'data-testid="ollama-host-bridge-state"'; To = 'data-testid="ollama-host-bridge-removed"' },
    @{ Text = $docsText; From = '# Local Ollama suite manager'; To = '# Local Ollama suite manager removed' },
    @{ Text = $docsText; From = 'Shell syntax'; To = 'Unrestricted launch' }
  )
  foreach ($mutation in $mutations) {
    if (-not $mutation.Text.Contains($mutation.From)) { throw "self-test mutation needle missing: $($mutation.From)" }
    $brokenCore = if ($mutation.Text -eq $coreText) { $coreText.Replace($mutation.From, $mutation.To) } else { $coreText }
    $brokenUi = if ($mutation.Text -eq $uiText) { $uiText.Replace($mutation.From, $mutation.To) } else { $uiText }
    $brokenDocs = if ($mutation.Text -eq $docsText -and $mutation.From -eq 'Shell syntax') { [regex]::Replace($docsText, '(?i)shell syntax', $mutation.To) } elseif ($mutation.Text -eq $docsText) { $docsText.Replace($mutation.From, $mutation.To) } else { $docsText }
    if (Invoke-Contract $brokenCore $brokenUi $brokenDocs) { throw "negative contract mutation remained green: $($mutation.From)" }
  }
  if (-not (Invoke-Contract $coreText $uiText $docsText)) { throw 'restored contract did not return green' }
  Write-Output 'PASS: Ollama suite contract self-test turns red then green.'
  exit 0
}

if (-not (Invoke-Contract $coreText $uiText $docsText)) { throw 'Ollama suite contract is incomplete.' }
Write-Output 'PASS: Ollama suite source contract is complete.'
