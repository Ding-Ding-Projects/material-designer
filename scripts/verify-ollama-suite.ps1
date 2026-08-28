[CmdletBinding()]
param([switch]$SelfTest)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$core = Join-Path $root 'design/apps/web/src/runtime/ollama-suite.ts'
$ui = Join-Path $root 'design/apps/web/src/components/ollama/OllamaSuiteManager.tsx'
$daemon = Join-Path $root 'design/apps/daemon/src/routes/ollama-suite.ts'
$docs = Join-Path $root 'docs/standards/ollama-suite.md'

function Test-ContractMarker([string]$text, [string]$pattern) {
  return [regex]::IsMatch($text, $pattern)
}

function Invoke-Contract([string]$coreText, [string]$uiText, [string]$daemonText, [string]$docsText) {
  $required = @(
    @{ Text = $coreText; Pattern = '(?m)^export async function collectCatalog\(' },
    @{ Text = $coreText; Pattern = '(?m)^export function computeHardwareFit\(' },
    @{ Text = $coreText; Pattern = '(?m)^export function reconcileInstalledModels\(' },
    @{ Text = $coreText; Pattern = '(?m)^export function validateHarnessProfile\(' },
    @{ Text = $coreText; Pattern = '(?m)^export function createOllamaSuiteClient\(' },
    @{ Text = $coreText; Pattern = '(?m)^export function attachmentCapability\(' },
    @{ Text = $coreText; Pattern = '(?m)^export function validateChatParameters\(' },
    @{ Text = $coreText; Pattern = '(?m)^export function createChatSession\(' },
    @{ Text = $coreText; Pattern = '(?m)^export function redactChatExport\(' },
    @{ Text = $coreText; Pattern = '(?m)^export function createPullQueue\(' },
    @{ Text = $coreText; Pattern = '(?m)^function parsePullRecord\(' },
    @{ Text = $coreText; Pattern = '(?m)^export function parseCatalogSnapshot\(' },
    @{ Text = $uiText; Pattern = '(?m)^\s*<section\b[^\r\n]*data-testid="ollama-suite-manager"' },
    @{ Text = $uiText; Pattern = '(?m)^\s*<RegexSearchField\b[^\r\n]*search=\{activeSearch\}' },
    @{ Text = $daemonText; Pattern = "(?m)^\s*app\.get\('/api/ollama/runtime'" },
    @{ Text = $daemonText; Pattern = "(?m)^\s*app\.get\('/api/ollama/hardware'" },
    @{ Text = $daemonText; Pattern = "(?m)^\s*app\.get\('/api/ollama/pulls'" },
    @{ Text = $daemonText; Pattern = "(?m)^\s*app\.post\('/api/ollama/harness/preflight'" },
    @{ Text = $daemonText; Pattern = "(?m)^\s*app\.post\('/api/ollama/harness/launch'" },
    @{ Text = $daemonText; Pattern = "(?m)^\s*app\.post\('/api/ollama/harness/restore'" },
    @{ Text = $daemonText; Pattern = '(?m)^async function hardwareFacts\(' },
    @{ Text = $daemonText; Pattern = '(?m)^function createPullStore\(' },
    @{ Text = $daemonText; Pattern = '(?m)^const OFFICIAL_CATALOG_URL = ''https://ollama\.com/api/tags'';' },
    @{ Text = $daemonText; Pattern = "(?m)^\s*app\.post\('/api/ollama/pulls/:id/cancel'" },
    @{ Text = $daemonText; Pattern = "(?m)^\s*app\.post\('/api/ollama/pulls/:id/pause'" },
    @{ Text = $daemonText; Pattern = "(?m)^\s*app\.post\('/api/ollama/pulls/:id/resume'" },
    @{ Text = $daemonText; Pattern = "(?m)^\s*app\.post\('/api/ollama/pulls/:id/retry'" },
    @{ Text = $daemonText; Pattern = "(?m)^\s*app\.post\('/api/ollama/pull'" },
    @{ Text = $daemonText; Pattern = "(?m)^\s*app\.post\('/api/ollama/chat'" },
    @{ Text = $docsText; Pattern = '(?m)^# Local Ollama suite manager$' }
  )
  $missing = @($required | Where-Object { -not (Test-ContractMarker $_.Text $_.Pattern) })
  if ($missing.Count -gt 0) { return $false }
  return $true
}

$coreText = Get-Content $core -Raw
$uiText = Get-Content $ui -Raw
$daemonText = Get-Content $daemon -Raw
$docsText = Get-Content $docs -Raw

if ($SelfTest) {
  $mutations = @(
    @{ Text = $coreText; From = 'export async function collectCatalog('; To = 'export async function collectCatalogRemoved(' },
    @{ Text = $coreText; From = 'export function computeHardwareFit('; To = 'export function computeHardwareFitRemoved(' },
    @{ Text = $coreText; From = 'export function attachmentCapability('; To = 'export function attachmentCapabilityRemoved(' },
    @{ Text = $coreText; From = 'export function createChatSession('; To = 'export function createChatSessionRemoved(' },
    @{ Text = $uiText; From = 'data-testid="ollama-suite-manager"'; To = 'data-testid="ollama-suite-removed"' },
    @{ Text = $daemonText; From = "app.get('/api/ollama/hardware'"; To = "app.get('/api/ollama/hardware-removed'" },
    @{ Text = $daemonText; From = 'function createPullStore('; To = 'function createPullStoreRemoved(' },
    @{ Text = $daemonText; From = "app.post('/api/ollama/harness/launch'"; To = "app.post('/api/ollama/harness/launch-removed'" },
    @{ Text = $daemonText; From = "app.post('/api/ollama/pulls/:id/cancel'"; To = "app.post('/api/ollama/pulls/:id/cancel-removed'" }
  )
  foreach ($mutation in $mutations) {
    if (-not $mutation.Text.Contains($mutation.From)) { throw "self-test mutation needle missing: $($mutation.From)" }
    $brokenCore = if ($mutation.Text -eq $coreText) { $coreText.Replace($mutation.From, $mutation.To) } else { $coreText }
    $brokenUi = if ($mutation.Text -eq $uiText) { $uiText.Replace($mutation.From, $mutation.To) } else { $uiText }
    $brokenDaemon = if ($mutation.Text -eq $daemonText) { $daemonText.Replace($mutation.From, $mutation.To) } else { $daemonText }
    if (Invoke-Contract $brokenCore $brokenUi $brokenDaemon $docsText) { throw "negative contract mutation remained green: $($mutation.From)" }
  }
  if (-not (Invoke-Contract $coreText $uiText $daemonText $docsText)) { throw 'restored contract did not return green' }
  Write-Output 'PASS: Ollama suite contract self-test turns red then green.'
  exit 0
}

if (-not (Invoke-Contract $coreText $uiText $daemonText $docsText)) { throw 'Ollama suite contract is incomplete.' }
Write-Output 'PASS: Ollama suite source contract is complete.'
