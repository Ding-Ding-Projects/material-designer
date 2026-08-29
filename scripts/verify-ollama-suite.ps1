[CmdletBinding()]
param([switch]$SelfTest)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$core = Join-Path $root 'design/apps/web/src/runtime/ollama-suite.ts'
$ui = Join-Path $root 'design/apps/web/src/components/ollama/OllamaSuiteManager.tsx'
$daemon = Join-Path $root 'design/apps/daemon/src/routes/ollama-suite.ts'
$docs = Join-Path $root 'docs/standards/ollama-suite.md'

function Test-Literal([string]$text, [string]$literal) {
  return $text.Contains($literal)
}

function Test-LineStartsWith([string]$text, [string]$prefix) {
  $normalised = $text.Replace("`r`n", "`n").Replace("`r", "`n")
  foreach ($line in $normalised.Split("`n")) {
    if ($line.TrimStart().StartsWith($prefix, [System.StringComparison]::Ordinal)) { return $true }
  }
  return $false
}

function Test-LineEquals([string]$text, [string]$expected) {
  $normalised = $text.Replace("`r`n", "`n").Replace("`r", "`n")
  foreach ($line in $normalised.Split("`n")) {
    if ($line.Trim() -eq $expected) { return $true }
  }
  return $false
}

function Test-GeneratedRegex([string]$text, [string]$pattern) {
  try { return [regex]::IsMatch($text, $pattern) } catch { return $false }
}

function Invoke-Contract([string]$coreText, [string]$uiText, [string]$daemonText, [string]$docsText) {
  $requiredLiterals = @(
    @{ Text = $coreText; Literal = 'export async function collectCatalog(' },
    @{ Text = $coreText; Literal = 'export function computeHardwareFit(' },
    @{ Text = $coreText; Literal = 'export function reconcileInstalledModels(' },
    @{ Text = $coreText; Literal = 'export function parseHardwareFacts(' },
    @{ Text = $coreText; Literal = 'export function validateHarnessProfile(' },
    @{ Text = $coreText; Literal = 'export function resolveOllamaHostBridge(' },
    @{ Text = $coreText; Literal = 'export function createOllamaSuiteClient(' },
    @{ Text = $coreText; Literal = 'export function attachmentCapability(' },
    @{ Text = $coreText; Literal = 'export function validateChatParameters(' },
    @{ Text = $coreText; Literal = 'export function createChatSession(' },
    @{ Text = $coreText; Literal = 'export function redactChatExport(' },
    @{ Text = $coreText; Literal = 'export function parseChatSession(' },
    @{ Text = $coreText; Literal = 'export function searchChatSessions(' },
    @{ Text = $coreText; Literal = 'export function renameChatSession(' },
    @{ Text = $coreText; Literal = 'export function parsePullRecord(' },
    @{ Text = $coreText; Literal = 'export function parseCatalogSnapshot(' },
    @{ Text = $coreText; Literal = 'export interface OllamaSuiteClient' },
    @{ Text = $coreText; Literal = 'harnessRestore(' },
    @{ Text = $coreText; Literal = 'export const OLLAMA_MAX_RESPONSE_BYTES =' },
    @{ Text = $coreText; Literal = 'export const OLLAMA_MAX_MESSAGE_CHARS =' },
    @{ Text = $coreText; Literal = 'export const OLLAMA_MAX_MESSAGE_BYTES =' },
    @{ Text = $coreText; Literal = 'export const OLLAMA_MAX_TOTAL_CATALOG_VARIANTS =' },
    @{ Text = $coreText; Literal = 'export const OLLAMA_RESPONSE_READ_TIMEOUT_MS =' },
    @{ Text = $coreText; Literal = 'redactionManifest:' },
    @{ Text = $coreText; Literal = 'Attachment payload is unavailable' },
    @{ Text = $coreText; Literal = 'reader.cancel()' },
    @{ Text = $coreText; Literal = 'OLLAMA_MAX_NDJSON_LINES' },
    @{ Text = $coreText; Literal = 'OLLAMA_MAX_NDJSON_LINE_BYTES' },
    @{ Text = $coreText; Literal = 'function validateChatMessages(' },
    @{ Text = $coreText; Literal = 'export function decodedBase64Bytes(' },
    @{ Text = $coreText; Literal = 'btoa(decoded) === value' },
    @{ Text = $coreText; Literal = 'Text attachments exceed the bounded 100,000-byte chat message limit.' },
    @{ Text = $coreText; Literal = 'pageToken = null' },
    @{ Text = $coreText; Literal = 'revisionVerified' },
    @{ Text = $uiText; Literal = 'data-testid="ollama-suite-manager"' },
    @{ Text = $uiText; Literal = '<RegexSearchField search={activeSearch}' },
    @{ Text = $uiText; Literal = 'data-testid="ollama-host-bridge-state"' },
    @{ Text = $uiText; Literal = 'data-testid="ollama-harness-preview"' },
    @{ Text = $uiText; Literal = 'refreshGenerationRef' },
    @{ Text = $uiText; Literal = 'refreshAbortRef' },
    @{ Text = $uiText; Literal = 'catalogRefreshIdRef' },
    @{ Text = $uiText; Literal = 'chat-sessions' },
    @{ Text = $uiText; Literal = 'ArrowRight' },
    @{ Text = $uiText; Literal = 'data-testid="ollama-model-picker"' },
    @{ Text = $uiText; Literal = 'data-testid="ollama-chat-model-select"' },
    @{ Text = $uiText; Literal = 'data-testid="ollama-chat-model-select" value={selectedModel}' },
    @{ Text = $uiText; Literal = 'filteredInstalledModels.map((model) =>' },
    @{ Text = $uiText; Literal = 'data-testid="ollama-historic-attachments"' },
    @{ Text = $uiText; Literal = 'chatAbortRef' },
    @{ Text = $uiText; Literal = 'async function readNdjson(' },
    @{ Text = $uiText; Literal = 'historicAttachmentTarget' },
    @{ Text = $uiText; Literal = 'data-testid="ollama-recovery-status"' },
    @{ Text = $uiText; Literal = 'The local chat stream ended without response content' },
    @{ Text = $uiText; Literal = 'disabled={!canOperate}' },
    @{ Text = $uiText; Literal = 'cached models remain read-only' },
    @{ Text = $uiText; Literal = 'aria-controls=' },
    @{ Text = $daemonText; Literal = 'export function registerOllamaSuiteRoutes(' },
    @{ Text = $daemonText; Literal = 'export function validateOllamaHarnessProfile(' },
    @{ Text = $daemonText; Literal = 'export function normalizeOllamaCatalogPageToken(' },
    @{ Text = $daemonText; Literal = 'export function resolveOllamaCatalogRevision(' },
    @{ Text = $daemonText; Literal = 'return candidate || null;' },
    @{ Text = $daemonText; Literal = 'export async function consumeOllamaProviderStream(' },
    @{ Text = $daemonText; Literal = 'export interface OllamaSuiteRouteRegistration' },
    @{ Text = $daemonText; Literal = 'export interface OllamaPullAttempt' },
    @{ Text = $daemonText; Literal = 'export function matchesOllamaPullAttempt(' },
    @{ Text = $daemonText; Literal = 'export function isOllamaPullLeaseExpired(' },
    @{ Text = $daemonText; Literal = 'export const OLLAMA_ROUTE_PREFIX =' },
    @{ Text = $daemonText; Literal = 'harness/register' },
    @{ Text = $daemonText; Literal = 'harness/preflight' },
    @{ Text = $daemonText; Literal = 'harness/launch' },
    @{ Text = $daemonText; Literal = 'harness/restore' },
    @{ Text = $daemonText; Literal = 'async function readWithDeadline(' },
    @{ Text = $daemonText; Literal = 'OLLAMA_MAX_NDJSON_LINES' },
    @{ Text = $daemonText; Literal = 'OLLAMA_MAX_STREAM_BYTES' },
    @{ Text = $daemonText; Literal = 'OLLAMA_MAX_RESPONSE_INACTIVITY_MS' },
    @{ Text = $daemonText; Literal = 'reader.cancel()' },
    @{ Text = $daemonText; Literal = 'schedulerTail' },
    @{ Text = $daemonText; Literal = 'function safeEnvironmentKey(' },
    @{ Text = $daemonText; Literal = 'async function executableIdentity(' },
    @{ Text = $daemonText; Literal = 'async function writeSnapshot(' },
    @{ Text = $daemonText; Literal = 'async function safeDirectory(' },
    @{ Text = $daemonText; Literal = 'async function safePathAncestors(' },
    @{ Text = $daemonText; Literal = 'async function startVerifiedChild(' },
    @{ Text = $daemonText; Literal = 'async function localModelDetail(' },
    @{ Text = $daemonText; Literal = 'async function localInstalledTags(' },
    @{ Text = $daemonText; Literal = 'export function prioritizeOllamaDetailTags(' },
    @{ Text = $daemonText; Literal = 'interface PreflightLease' },
    @{ Text = $daemonText; Literal = 'preflightLeases' },
    @{ Text = $daemonText; Literal = 'preflightNonce' },
    @{ Text = $daemonText; Literal = 'profileHash' },
    @{ Text = $daemonText; Literal = 'previousProfileHash' },
    @{ Text = $daemonText; Literal = 'export interface OllamaExecutableIdentity' },
    @{ Text = $daemonText; Literal = 'normalizeOllamaCatalogPageToken' },
    @{ Text = $daemonText; Literal = 'OD_OLLAMA_BASE_URL' },
    @{ Text = $daemonText; Literal = 'OLLAMA_MAX_LOCAL_DETAIL_MODELS' },
    @{ Text = $daemonText; Literal = 'OLLAMA_LOCAL_DETAIL_CONCURRENCY' },
    @{ Text = $daemonText; Literal = 'OLLAMA_LOCAL_DETAIL_BUDGET_MS' },
    @{ Text = $daemonText; Literal = 'OLLAMA_LOCAL_DETAIL_CACHE_TTL_MS' },
    @{ Text = $daemonText; Literal = 'OLLAMA_LOCAL_DETAIL_GENERATION_TTL_MS' },
    @{ Text = $daemonText; Literal = 'OLLAMA_MAX_TOTAL_CATALOG_VARIANTS' },
    @{ Text = $daemonText; Literal = 'localDetailGeneration' },
    @{ Text = $daemonText; Literal = 'deadlineAt' },
    @{ Text = $daemonText; Literal = 'detailGeneration.details.get(tag)' },
    @{ Text = $daemonText; Literal = 'cached.expiresAt > Date.now()' },
    @{ Text = $daemonText; Literal = 'const detailWorker = async' },
    @{ Text = $daemonText; Literal = 'await Promise.all(Array.from({ length: Math.min(OLLAMA_LOCAL_DETAIL_CONCURRENCY' },
    @{ Text = $daemonText; Literal = 'selectedTag' },
    @{ Text = $daemonText; Literal = 'fs.lstat' },
    @{ Text = $daemonText; Literal = 'approved-executables' },
    @{ Text = $daemonText; Literal = 'copyFile' },
    @{ Text = $daemonText; Literal = 'sha256' },
    @{ Text = $daemonText; Literal = 'export function decodeOllamaBase64(' },
    @{ Text = $daemonText; Literal = 'export function isOllamaChildReady(' },
    @{ Text = $daemonText; Literal = "child.once('spawn'" },
    @{ Text = $daemonText; Literal = 'watchFailure' },
    @{ Text = $daemonText; Literal = 'async function waitForHealthyChild(' },
    @{ Text = $daemonText; Literal = 'OLLAMA_HARNESS_START_STABILITY_MS' },
    @{ Text = $daemonText; Literal = 'ATTACHMENT_TOO_LARGE' },
    @{ Text = $daemonText; Literal = 'Text attachment content exceeds the bounded 100,000-byte chat message limit' },
    @{ Text = $daemonText; Literal = 'Local-only model metadata was read' },
    @{ Text = $daemonText; Literal = 'pullStore.claim(' },
    @{ Text = $daemonText; Literal = 'leaseExpiresAt' },
    @{ Text = $daemonText; Literal = 'PROFILE_CHANGED' },
    @{ Text = $daemonText; Literal = 'sameExecutableIdentity' },
    @{ Text = $daemonText; Literal = 'AbortSignal.any' },
    @{ Text = $docsText; Literal = 'per-page SHA-256 response hash is never promoted' },
    @{ Text = $docsText; Literal = 'upstream snapshot revision' },
    @{ Text = $docsText; Literal = 'pre-existing healthy runtime as proof' },
    @{ Text = $docsText; Literal = 'last verified catalog' },
    @{ Text = $docsText; Literal = 'shell syntax' }
  )
  if (@($requiredLiterals | Where-Object { -not (Test-Literal $_.Text $_.Literal) }).Count -gt 0) { return $false }
  if (-not (Test-LineEquals $docsText '# Local Ollama suite manager') -or -not (Test-LineEquals $docsText '## Security considerations')) { return $false }
  if ($daemonText.Contains('req.body?.baseUrl') -or $daemonText.Contains('req.query.baseUrl')) { return $false }
  if ($daemonText.Contains('.slice(0, OLLAMA_MAX_MESSAGE_BYTES)')) { return $false }
  if ($daemonText.Contains("x-ollama-chat-status', 'failed'") -or $daemonText.Contains("x-ollama-chat-status', 'completed'")) { return $false }
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
  $probeLiteral = 'export async function collectCatalog('
  $goodRegex = '(?m)^' + [regex]::Escape($probeLiteral)
  $badRegex = '(?m)^' + [regex]::Escape($probeLiteral + '\')
  if (-not (Test-GeneratedRegex $probeLiteral $goodRegex)) { throw 'generated regex probe did not match' }
  if (Test-GeneratedRegex $probeLiteral $badRegex) { throw 'generated negative regex probe remained green' }
  $mutations = @(
    @{ Text = $coreText; From = 'export async function collectCatalog('; To = 'export async function collectCatalogRemoved(' },
    @{ Text = $coreText; From = 'export function computeHardwareFit('; To = 'export function computeHardwareFitRemoved(' },
    @{ Text = $coreText; From = 'export function resolveOllamaHostBridge('; To = 'export function resolveOllamaHostBridgeRemoved(' },
    @{ Text = $coreText; From = 'export function attachmentCapability('; To = 'export function attachmentCapabilityRemoved(' },
    @{ Text = $coreText; From = 'redactionManifest:'; To = 'redactionRemoved:' },
    @{ Text = $coreText; From = 'export function createChatSession('; To = 'export function createChatSessionRemoved(' },
    @{ Text = $coreText; From = 'export function decodedBase64Bytes('; To = 'export function decodedBase64BytesRemoved(' },
    @{ Text = $coreText; From = 'btoa(decoded) === value'; To = 'btoa(decoded) !== value' },
    @{ Text = $uiText; From = 'data-testid="ollama-suite-manager"'; To = 'data-testid="ollama-suite-removed"' },
    @{ Text = $uiText; From = 'data-testid="ollama-host-bridge-state"'; To = 'data-testid="ollama-host-bridge-removed"' },
    @{ Text = $uiText; From = 'refreshGenerationRef'; To = 'refreshGenerationRemoved' },
    @{ Text = $uiText; From = 'catalogRefreshIdRef'; To = 'catalogRefreshRemoved' },
    @{ Text = $uiText; From = 'data-testid="ollama-historic-attachments"'; To = 'data-testid="ollama-historic-removed"' },
    @{ Text = $uiText; From = 'data-testid="ollama-chat-model-select"'; To = 'data-testid="ollama-chat-model-removed"' },
    @{ Text = $uiText; From = 'async function readNdjson('; To = 'async function readNdjsonRemoved(' },
    @{ Text = $daemonText; From = 'export function registerOllamaSuiteRoutes('; To = 'export function registerOllamaSuiteRoutesRemoved(' },
    @{ Text = $daemonText; From = 'export function validateOllamaHarnessProfile('; To = 'export function validateOllamaHarnessProfileRemoved(' },
    @{ Text = $daemonText; From = 'export function resolveOllamaCatalogRevision('; To = 'export function resolveOllamaCatalogRevisionRemoved(' },
    @{ Text = $daemonText; From = 'return candidate || null;'; To = "return candidate || 'sha256:per-page';" },
    @{ Text = $daemonText; From = 'OLLAMA_MAX_NDJSON_LINES'; To = 'OLLAMA_MAX_NDJSON_REMOVED' },
    @{ Text = $daemonText; From = 'schedulerTail'; To = 'schedulerRemoved' },
    @{ Text = $daemonText; From = 'harness/register'; To = 'harness/registration-removed' },
    @{ Text = $daemonText; From = 'PROFILE_CHANGED'; To = 'PROFILE_REMOVED' },
    @{ Text = $daemonText; From = 'preflightLeases'; To = 'preflightRemoved' },
    @{ Text = $daemonText; From = 'pullStore.claim'; To = 'pullStore.claimRemoved' },
    @{ Text = $daemonText; From = 'matchesOllamaPullAttempt'; To = 'matchesOllamaPullAttemptRemoved' },
    @{ Text = $daemonText; From = 'isOllamaPullLeaseExpired'; To = 'isOllamaPullLeaseExpiredRemoved' },
    @{ Text = $daemonText; From = 'OLLAMA_MAX_RESPONSE_INACTIVITY_MS'; To = 'OLLAMA_MAX_RESPONSE_REMOVED' },
    @{ Text = $daemonText; From = 'localModelDetail'; To = 'localModelDetailRemoved' },
    @{ Text = $daemonText; From = 'localInstalledTags'; To = 'localInstalledTagsRemoved' },
    @{ Text = $daemonText; From = 'export function prioritizeOllamaDetailTags('; To = 'export function prioritizeOllamaDetailTagsRemoved(' },
    @{ Text = $daemonText; From = 'await Promise.all(Array.from({ length: Math.min(OLLAMA_LOCAL_DETAIL_CONCURRENCY'; To = 'await Promise.resolve()' },
    @{ Text = $daemonText; From = 'const detailWorker = async'; To = 'const detailWorkerRemoved = async' },
    @{ Text = $daemonText; From = "child.once('spawn'"; To = "child.once('launch'" },
    @{ Text = $daemonText; From = 'async function waitForHealthyChild('; To = 'async function waitForHealthyChildRemoved(' },
    @{ Text = $daemonText; From = 'ATTACHMENT_TOO_LARGE'; To = 'ATTACHMENT_BOUND_REMOVED' },
    @{ Text = $daemonText; From = 'OLLAMA_LOCAL_DETAIL_CONCURRENCY'; To = 'OLLAMA_DETAIL_PARALLELISM' },
    @{ Text = $daemonText; From = 'OLLAMA_LOCAL_DETAIL_BUDGET_MS'; To = 'OLLAMA_DETAIL_BUDGET' },
    @{ Text = $daemonText; From = 'export function decodeOllamaBase64('; To = 'export function decodeOllamaBase64Removed(' },
    @{ Text = $docsText; From = '# Local Ollama suite manager'; To = '# Local Ollama suite manager removed' },
    @{ Text = $docsText; From = 'Shell syntax'; To = 'Unrestricted launch' }
  )
  foreach ($mutation in $mutations) {
    if (-not $mutation.Text.Contains($mutation.From)) { throw "self-test mutation needle missing: $($mutation.From)" }
    $brokenCore = if ($mutation.Text -eq $coreText) { $coreText.Replace($mutation.From, $mutation.To) } else { $coreText }
    $brokenUi = if ($mutation.Text -eq $uiText) { $uiText.Replace($mutation.From, $mutation.To) } else { $uiText }
    $brokenDaemon = if ($mutation.Text -eq $daemonText) { $daemonText.Replace($mutation.From, $mutation.To) } else { $daemonText }
    $brokenDocs = if ($mutation.Text -eq $docsText -and $mutation.From -eq 'Shell syntax') { $docsText.Replace('Shell syntax', $mutation.To).Replace('shell syntax', $mutation.To) } elseif ($mutation.Text -eq $docsText) { $docsText.Replace($mutation.From, $mutation.To) } else { $docsText }
    if (Invoke-Contract $brokenCore $brokenUi $brokenDaemon $brokenDocs) { throw "negative contract mutation remained green: $($mutation.From)" }
  }
  $callerBaseBreak = $daemonText + "`nconst callerBase = req.body?.baseUrl;"
  if (Invoke-Contract $coreText $uiText $callerBaseBreak $docsText) { throw 'caller-selected base URL mutation remained green' }
  $lateHeaderBreak = $daemonText + "`nres.setHeader('x-ollama-chat-status', 'completed');"
  if (Invoke-Contract $coreText $uiText $lateHeaderBreak $docsText) { throw 'late response-header mutation remained green' }
  $textSliceBreak = $daemonText + "`nconst slicedAttachment = content.slice(0, OLLAMA_MAX_MESSAGE_BYTES);"
  if (Invoke-Contract $coreText $uiText $textSliceBreak $docsText) { throw 'oversized attachment slice mutation remained green' }
  if (-not (Invoke-Contract $coreText $uiText $daemonText $docsText)) { throw 'restored contract did not return green' }
  Write-Output 'PASS: Ollama suite contract self-test turns red then green.'
  exit 0
}

if (-not (Invoke-Contract $coreText $uiText $daemonText $docsText)) { throw 'Ollama suite contract is incomplete.' }
Write-Output 'PASS: Ollama suite source contract is complete.'
