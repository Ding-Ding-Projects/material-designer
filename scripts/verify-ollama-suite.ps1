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
    @{ Text = $coreText; Pattern = '(?m)^export const OLLAMA_MAX_RESPONSE_BYTES\s*=' },
    @{ Text = $coreText; Pattern = '(?m)^export const OLLAMA_MAX_MESSAGE_CHARS\s*=' },
    @{ Text = $coreText; Pattern = '(?m)^export const OLLAMA_RESPONSE_READ_TIMEOUT_MS\s*=' },
    @{ Text = $coreText; Pattern = '(?m)^export function redactChatExport\(' },
    @{ Text = $coreText; Pattern = '(?m)redactionManifest:' },
    @{ Text = $coreText; Pattern = '(?mi)Attachment payload is unavailable' },
    @{ Text = $coreText; Pattern = '(?m)reader\.cancel\(\)' },
    @{ Text = $coreText; Pattern = '(?m)OLLAMA_MAX_NDJSON_LINES' },
    @{ Text = $coreText; Pattern = '(?m)OLLAMA_MAX_NDJSON_LINE_BYTES' },
    @{ Text = $coreText; Pattern = '(?m)^function validateChatMessages\(' },
    @{ Text = $coreText; Pattern = '(?m)pageToken = null;' },
    @{ Text = $uiText; Pattern = '(?m)^\s*<section\b[^\r\n]*data-testid="ollama-suite-manager"' },
    @{ Text = $uiText; Pattern = '(?m)^\s*<RegexSearchField\b[^\r\n]*search=\{activeSearch\}' },
    @{ Text = $uiText; Pattern = '(?m)data-testid="ollama-host-bridge-state"' },
    @{ Text = $uiText; Pattern = '(?m)data-testid="ollama-harness-preview"' },
    @{ Text = $uiText; Pattern = '(?m)refreshGenerationRef' },
    @{ Text = $uiText; Pattern = '(?m)refreshAbortRef' },
    @{ Text = $uiText; Pattern = '(?m)chat-sessions' },
    @{ Text = $uiText; Pattern = '(?m)ArrowRight' },
    @{ Text = $uiText; Pattern = '(?m)data-testid="ollama-model-picker"' },
    @{ Text = $uiText; Pattern = '(?m)data-testid="ollama-historic-attachments"' },
    @{ Text = $uiText; Pattern = '(?m)chatAbortRef' },
    @{ Text = $uiText; Pattern = '(?m)^async function readNdjson\(' },
    @{ Text = $uiText; Pattern = '(?m)^\s*const \[historicAttachmentTarget' },
    @{ Text = $uiText; Pattern = '(?m)data-testid="ollama-recovery-status"' },
    @{ Text = $uiText; Pattern = '(?m)The local chat stream ended without response content' },
    @{ Text = $uiText; Pattern = '(?m)disabled=\{!canOperate\}' },
    @{ Text = $uiText; Pattern = '(?mi)cached models remain read-only' },
    @{ Text = $uiText; Pattern = '(?m)aria-controls=' },
    @{ Text = $daemonText; Pattern = '(?m)^export function registerOllamaSuiteRoutes\(' },
    @{ Text = $daemonText; Pattern = '(?m)^export function validateOllamaHarnessProfile\(' },
    @{ Text = $daemonText; Pattern = '(?m)^export function normalizeOllamaCatalogPageToken\(' },
    @{ Text = $daemonText; Pattern = '(?m)^export async function consumeOllamaProviderStream\(' },
    @{ Text = $daemonText; Pattern = '(?m)^export interface OllamaSuiteRouteRegistration\b' },
    @{ Text = $daemonText; Pattern = '(?m)^export interface OllamaPullAttempt\b' },
    @{ Text = $daemonText; Pattern = '(?m)^export function matchesOllamaPullAttempt\(' },
    @{ Text = $daemonText; Pattern = '(?m)^export const OLLAMA_ROUTE_PREFIX\s*=' },
    @{ Text = $daemonText; Pattern = '(?m)harness/register' },
    @{ Text = $daemonText; Pattern = '(?m)harness/preflight' },
    @{ Text = $daemonText; Pattern = '(?m)harness/launch' },
    @{ Text = $daemonText; Pattern = '(?m)harness/restore' },
    @{ Text = $daemonText; Pattern = '(?m)^async function readWithDeadline\(' },
    @{ Text = $daemonText; Pattern = '(?m)OLLAMA_MAX_NDJSON_LINES' },
    @{ Text = $daemonText; Pattern = '(?m)OLLAMA_MAX_STREAM_BYTES' },
    @{ Text = $daemonText; Pattern = '(?m)OLLAMA_MAX_RESPONSE_INACTIVITY_MS' },
    @{ Text = $daemonText; Pattern = '(?m)reader\.cancel\(\)' },
    @{ Text = $daemonText; Pattern = '(?m)schedulerTail' },
    @{ Text = $daemonText; Pattern = '(?m)^function safeEnvironmentKey\(' },
    @{ Text = $daemonText; Pattern = '(?m)^async function executableIdentity\(' },
    @{ Text = $daemonText; Pattern = '(?m)^async function writeSnapshot\(' },
    @{ Text = $daemonText; Pattern = '(?m)^async function safeDirectory\(' },
    @{ Text = $daemonText; Pattern = '(?m)^async function localModelDetail\(' },
    @{ Text = $daemonText; Pattern = '(?m)^interface PreflightLease\b' },
    @{ Text = $daemonText; Pattern = '(?m)preflightLeases' },
    @{ Text = $daemonText; Pattern = '(?m)preflightNonce' },
    @{ Text = $daemonText; Pattern = '(?m)profileHash' },
    @{ Text = $daemonText; Pattern = '(?m)previousProfileHash' },
    @{ Text = $daemonText; Pattern = '(?m)^export interface OllamaExecutableIdentity\b' },
    @{ Text = $daemonText; Pattern = '(?m)normalizeOllamaCatalogPageToken' },
    @{ Text = $daemonText; Pattern = '(?m)OD_OLLAMA_BASE_URL' },
    @{ Text = $daemonText; Pattern = '(?m)OLLAMA_MAX_LOCAL_DETAIL_MODELS' },
    @{ Text = $daemonText; Pattern = '(?m)fs\.lstat' },
    @{ Text = $daemonText; Pattern = '(?m)sha256' },
    @{ Text = $daemonText; Pattern = '(?m)pullStore\.claim\(' },
    @{ Text = $daemonText; Pattern = '(?m)leaseExpiresAt' },
    @{ Text = $daemonText; Pattern = '(?mi)PROFILE_CHANGED' },
    @{ Text = $daemonText; Pattern = '(?mi)sameExecutableIdentity' },
    @{ Text = $daemonText; Pattern = '(?mi)AbortSignal\.any' },
    @{ Text = $docsText; Pattern = '(?m)^# Local Ollama suite manager$' },
    @{ Text = $docsText; Pattern = '(?m)^## Security considerations$' },
    @{ Text = $docsText; Pattern = '(?mi)last verified catalog' },
    @{ Text = $docsText; Pattern = '(?mi)shell syntax' }
  )
  $missing = @($required | Where-Object { -not (Test-ContractMarker $_.Text $_.Pattern) })
  if ($missing.Count -gt 0) { return $false }
  if ([regex]::IsMatch($daemonText, '(?m)req\.(?:body|query).*baseUrl')) { return $false }
  if ([regex]::IsMatch($daemonText, '(?m)x-ollama-chat-status.*(?:failed|completed)')) { return $false }
  return $true
}

if (-not (Test-Path -LiteralPath $core) -or -not (Test-Path -LiteralPath $ui) -or -not (Test-Path -LiteralPath $daemon) -or -not (Test-Path -LiteralPath $docs)) {
  throw 'Ollama suite contract source or documentation is missing.'
}

$coreText = Get-Content -LiteralPath $core -Raw
$uiText = Get-Content -LiteralPath $ui -Raw
$daemonText = Get-Content -LiteralPath $daemon -Raw
$docsText = Get-Content -LiteralPath $docs -Raw

if ($SelfTest) {
  $singleBackslash = '\'
  $probeText = 'export function marker('
  $goodRegex = '(?m)^export function marker' + $singleBackslash + '('
  $badRegex = '(?m)^export function marker' + $singleBackslash + $singleBackslash + $singleBackslash + '('
  if (-not (Test-ContractMarker $probeText $goodRegex)) { throw 'single-escape regex probe did not match' }
  if (Test-ContractMarker $probeText $badRegex) { throw 'double-escape regex probe remained green' }
  $mutations = @(
    @{ Text = $coreText; From = 'export async function collectCatalog('; To = 'export async function collectCatalogRemoved(' },
    @{ Text = $coreText; From = 'export function computeHardwareFit('; To = 'export function computeHardwareFitRemoved(' },
    @{ Text = $coreText; From = 'export function resolveOllamaHostBridge('; To = 'export function resolveOllamaHostBridgeRemoved(' },
    @{ Text = $coreText; From = 'export function attachmentCapability('; To = 'export function attachmentCapabilityRemoved(' },
    @{ Text = $coreText; From = 'redactionManifest:'; To = 'redactionRemoved:' },
    @{ Text = $coreText; From = 'validateChatMessages'; To = 'validateChatMessagesRemoved' },
    @{ Text = $coreText; From = 'export function createChatSession('; To = 'export function createChatSessionRemoved(' },
    @{ Text = $uiText; From = 'data-testid="ollama-suite-manager"'; To = 'data-testid="ollama-suite-removed"' },
    @{ Text = $uiText; From = 'data-testid="ollama-host-bridge-state"'; To = 'data-testid="ollama-host-bridge-removed"' },
    @{ Text = $uiText; From = 'refreshGenerationRef'; To = 'refreshGenerationRemoved' },
    @{ Text = $uiText; From = 'data-testid="ollama-historic-attachments"'; To = 'data-testid="ollama-historic-removed"' },
    @{ Text = $uiText; From = 'async function readNdjson('; To = 'async function readNdjsonRemoved(' },
    @{ Text = $daemonText; From = 'export function registerOllamaSuiteRoutes('; To = 'export function registerOllamaSuiteRoutesRemoved(' },
    @{ Text = $daemonText; From = 'export function validateOllamaHarnessProfile('; To = 'export function validateOllamaHarnessProfileRemoved(' },
    @{ Text = $daemonText; From = 'OLLAMA_MAX_NDJSON_LINES'; To = 'OLLAMA_MAX_NDJSON_REMOVED' },
    @{ Text = $daemonText; From = 'schedulerTail'; To = 'schedulerRemoved' },
    @{ Text = $daemonText; From = 'harness/register'; To = 'harness/registration-removed' },
    @{ Text = $daemonText; From = 'PROFILE_CHANGED'; To = 'PROFILE_REMOVED' },
    @{ Text = $daemonText; From = 'preflightLeases'; To = 'preflightRemoved' },
    @{ Text = $daemonText; From = 'pullStore.claim'; To = 'pullStore.claimRemoved' },
    @{ Text = $daemonText; From = 'matchesOllamaPullAttempt'; To = 'matchesOllamaPullAttemptRemoved' },
    @{ Text = $daemonText; From = 'OLLAMA_MAX_RESPONSE_INACTIVITY_MS'; To = 'OLLAMA_MAX_RESPONSE_REMOVED' },
    @{ Text = $daemonText; From = 'localModelDetail'; To = 'localModelDetailRemoved' },
    @{ Text = $docsText; From = '# Local Ollama suite manager'; To = '# Local Ollama suite manager removed' },
    @{ Text = $docsText; From = 'Shell syntax'; To = 'Unrestricted launch' }
  )
  foreach ($mutation in $mutations) {
    if (-not $mutation.Text.Contains($mutation.From)) { throw "self-test mutation needle missing: $($mutation.From)" }
    $brokenCore = if ($mutation.Text -eq $coreText) { $coreText.Replace($mutation.From, $mutation.To) } else { $coreText }
    $brokenUi = if ($mutation.Text -eq $uiText) { $uiText.Replace($mutation.From, $mutation.To) } else { $uiText }
    $brokenDaemon = if ($mutation.Text -eq $daemonText) { $daemonText.Replace($mutation.From, $mutation.To) } else { $daemonText }
    $brokenDocs = if ($mutation.Text -eq $docsText -and $mutation.From -eq 'Shell syntax') { [regex]::Replace($docsText, '(?i)shell syntax', $mutation.To) } elseif ($mutation.Text -eq $docsText) { $docsText.Replace($mutation.From, $mutation.To) } else { $docsText }
    if (Invoke-Contract $brokenCore $brokenUi $brokenDaemon $brokenDocs) { throw "negative contract mutation remained green: $($mutation.From)" }
  }
  $callerBaseBreak = $daemonText + "`nconst callerBase = req.body?.baseUrl;"
  if (Invoke-Contract $coreText $uiText $callerBaseBreak $docsText) { throw 'caller-selected base URL mutation remained green' }
  $lateHeaderBreak = $daemonText + "`nres.setHeader('x-ollama-chat-status', 'completed');"
  if (Invoke-Contract $coreText $uiText $lateHeaderBreak $docsText) { throw 'late response-header mutation remained green' }
  if (-not (Invoke-Contract $coreText $uiText $daemonText $docsText)) { throw 'restored contract did not return green' }
  Write-Output 'PASS: Ollama suite contract self-test turns red then green.'
  exit 0
}

if (-not (Invoke-Contract $coreText $uiText $daemonText $docsText)) { throw 'Ollama suite contract is incomplete.' }
Write-Output 'PASS: Ollama suite source contract is complete.'
