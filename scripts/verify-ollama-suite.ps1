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
    @{ Text = $uiText; Pattern = '(?m)^\s*<section\b[^\r\n]*data-testid="ollama-suite-manager"' },
    @{ Text = $uiText; Pattern = '(?m)^\s*<RegexSearchField\b[^\r\n]*search=\{activeSearch\}' },
    @{ Text = $daemonText; Pattern = "(?m)^\s*app\.get\('/api/ollama/runtime'" },
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
  $broken = $coreText -replace '(?m)^export async function collectCatalog\(', 'export async function collectCatalogRemoved('
  if (Invoke-Contract $broken $uiText $daemonText $docsText) { throw 'negative contract mutation remained green' }
  if (-not (Invoke-Contract $coreText $uiText $daemonText $docsText)) { throw 'restored contract did not return green' }
  Write-Output 'PASS: Ollama suite contract self-test turns red then green.'
  exit 0
}

if (-not (Invoke-Contract $coreText $uiText $daemonText $docsText)) { throw 'Ollama suite contract is incomplete.' }
Write-Output 'PASS: Ollama suite source contract is complete.'
