$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

function Normalize-Text([string]$text) {
  return $text -replace '\r\n|\r', "`n"
}

function Read-Normalized([string]$path) {
  return Normalize-Text (Get-Content -Raw -LiteralPath $path)
}

function Get-CodeLines([string]$text) {
  $lines = [System.Collections.Generic.List[string]]::new()
  $inBlock = $false
  foreach ($sourceLine in $text.Split("`n")) {
    $line = New-Object System.Text.StringBuilder
    $quote = [char]0
    $escaped = $false
    for ($index = 0; $index -lt $sourceLine.Length; $index += 1) {
      $char = $sourceLine[$index]
      $next = if ($index + 1 -lt $sourceLine.Length) { $sourceLine[$index + 1] } else { [char]0 }
      if ($inBlock) {
        if ($char -eq '*' -and $next -eq '/') { $inBlock = $false; $index += 1 }
        continue
      }
      if ($quote -ne [char]0) {
        [void]$line.Append($char)
        if ($escaped) { $escaped = $false; continue }
        if ($char -eq '\') { $escaped = $true; continue }
        if ($char -eq $quote) { $quote = [char]0 }
        continue
      }
      if ($char -eq "'" -or $char -eq '"' -or $char -eq '`') { $quote = $char; [void]$line.Append($char); continue }
      if ($char -eq '/' -and $next -eq '/') { break }
      if ($char -eq '/' -and $next -eq '*') { $inBlock = $true; $index += 1; continue }
      [void]$line.Append($char)
    }
    $lines.Add($line.ToString())
  }
  return $lines
}

function Assert-True([bool]$condition, [string]$message) { if (-not $condition) { throw $message } }
function Has-CodeLine([object[]]$lines, [string]$pattern) {
  return [bool]($lines | Where-Object { $_ -match $pattern } | Select-Object -First 1)
}
function Assert-CodeLine([object[]]$lines, [string]$pattern, [string]$message) {
  Assert-True (Has-CodeLine $lines $pattern) $message
}
function Assert-RedMutation([string]$text, [string]$old, [string]$replacement, [string]$pattern, [string]$message) {
  Assert-True $text.Contains($old) "The negative fixture anchor is missing: $message"
  $broken = $text.Replace($old, $replacement)
  Assert-True (-not (Has-CodeLine (Get-CodeLines $broken) $pattern)) "Expected deliberate regression to turn red: $message"
  Assert-CodeLine (Get-CodeLines $text) $pattern "Restored source did not turn green: $message"
}

Assert-True ((Normalize-Text "one`r`ntwo`rthree`nfour") -eq "one`ntwo`nthree`nfour") 'CRLF and CR normalization must preserve one logical line ending.'

$registry = Read-Normalized (Join-Path $root 'design/apps/desktop/src/main/converter/registry.ts')
$queue = Read-Normalized (Join-Path $root 'design/apps/desktop/src/main/converter/queue.ts')
$hostText = Read-Normalized (Join-Path $root 'design/apps/desktop/src/main/converter/host.ts')
$overwrite = Read-Normalized (Join-Path $root 'design/apps/desktop/src/main/converter/overwrite.ts')
$audit = Read-Normalized (Join-Path $root 'design/apps/desktop/src/main/converter/audit.ts')
$renderer = Read-Normalized (Join-Path $root 'design/apps/web/src/components/FileConverterView.tsx')
$choice = Read-Normalized (Join-Path $root 'design/apps/web/src/components/converter/ConverterSearchableChoice.tsx')
$siteHtmlPath = Join-Path $root 'site/index.html'
$siteScriptPath = Join-Path $root 'site/assets/js/converter.js'
$runtimePath = Join-Path $root 'design/apps/desktop/src/main/runtime.ts'
$preloadPath = Join-Path $root 'design/apps/desktop/src/main/preload.cts'
$siteIntegrationAvailable = (Test-Path -LiteralPath $siteHtmlPath) -and (Test-Path -LiteralPath $siteScriptPath)
$runtimeIntegrationAvailable = Test-Path -LiteralPath $runtimePath
$preloadIntegrationAvailable = Test-Path -LiteralPath $preloadPath
$siteHtml = if ($siteIntegrationAvailable) { Read-Normalized $siteHtmlPath } else { '' }
$siteScript = if ($siteIntegrationAvailable) { Read-Normalized $siteScriptPath } else { '' }
$runtime = if ($runtimeIntegrationAvailable) { Read-Normalized $runtimePath } else { '' }
$preload = if ($preloadIntegrationAvailable) { Read-Normalized $preloadPath } else { '' }

$registryLines = Get-CodeLines $registry
$queueLines = Get-CodeLines $queue
$hostLines = Get-CodeLines $hostText
$overwriteLines = Get-CodeLines $overwrite
$auditLines = Get-CodeLines $audit
$rendererLines = Get-CodeLines $renderer
$runtimeLines = Get-CodeLines $runtime
$preloadLines = Get-CodeLines $preload
$bridge = Read-Normalized (Join-Path $root 'design/apps/web/src/components/converter/converterBridge.ts')
$registration = Read-Normalized (Join-Path $root 'design/apps/web/src/components/converter/converterRegistration.ts')

# Positive checks use exact code boundaries, so comments and longer renamed
# identifiers cannot satisfy the converter completeness contract.
Assert-CodeLine $registryLines 'bundled:\s*false\s*,' 'Unavailable adapters must be explicit.'
Assert-CodeLine $registryLines 'unavailableReason:\s*reason' 'Unavailable adapters must explain the missing bundled codec.'
Assert-CodeLine $registryLines 'packageProof:\s*proof' 'Source-contract adapters must not be treated as packaged proof.'
Assert-CodeLine $registryLines 'withPackagedProof\(' 'Packaged proof must be explicitly injected before enabling an adapter.'
Assert-CodeLine $queueLines '^\s*async\s+loadPage\(' 'Queue must page through durable items.'
Assert-CodeLine $queueLines '^\s*const\s+pending:\s*QueueItem\[\]\s*=\s*\[\];\s*$' 'Queue must keep only bounded pending work.'
Assert-CodeLine $queueLines 'ORDER_CHUNK_ITEMS' 'Durable queue order must be chunk-indexed.'
Assert-CodeLine $queueLines '^\s*async\s+compact\(' 'Queue must expose streaming journal compaction.'
Assert-CodeLine $queueLines 'appendAndFlush\(' 'The authoritative queue journal must flush before derived state.'
Assert-CodeLine $queueLines 'journalSize' 'Queue metadata must detect a journal written before a crash.'
Assert-CodeLine $hostLines 'readBoundedFile\(' 'Host must perform bounded source reads.'
Assert-CodeLine $hostLines 'new Worker\(' 'Conversion work must run in a terminable worker.'
Assert-CodeLine $hostLines '#consumeDisclosure\(' 'Loss disclosure acknowledgement must be consumed by the host.'
Assert-CodeLine $hostLines 'onProgress\?\.' 'Enabled adapters must receive incremental byte progress.'
Assert-CodeLine $hostLines 'withPromotionLock\(' 'Destination promotion must use an exclusive lock.'
Assert-CodeLine $hostLines 'sameDestinationSnapshot\(' 'Destination replacement must revalidate the confirmed snapshot.'
Assert-CodeLine $overwriteLines '^\s*export\s+class\s+OverwriteAuthorizationStore' 'Overwrite authorization must be host-owned.'
Assert-CodeLine $overwriteLines 'this\.\#pending\.delete\(token\)' 'Overwrite authorization must be one-use.'
Assert-CodeLine $auditLines '^\s*export\s+class\s+ConverterAuditStore' 'Notifications and history must be host-backed.'
Assert-CodeLine $auditLines 'git.*commit' 'Converter mutations must record a local Git revision.'
Assert-CodeLine $rendererLines 'requestOverwrite' 'Renderer must expose the host overwrite handshake.'
Assert-CodeLine $rendererLines 'DestructiveGate' 'Renderer must mount the two-key full-slider gate.'
Assert-CodeLine $rendererLines 'host\.queue\.enqueue\(' 'Renderer must use the durable host queue.'
Assert-CodeLine $rendererLines 'host\.queue\.page\(' 'Renderer must page the complete queue.'
Assert-True $renderer.Contains('"scope":"complete-queue"') 'Complete export must name its scope.'
Assert-CodeLine $rendererLines 'acknowledgeDisclosure' 'Renderer must require an explicit loss disclosure acknowledgement.'
Assert-CodeLine $rendererLines 'data-converter-notification-history' 'Renderer must retain notification history.'
Assert-CodeLine $rendererLines 'data-converter-local-history' 'Renderer must retain local history.'
Assert-CodeLine (Get-CodeLines $choice) 'usePersistedConverterSearch' 'Dropdowns must own persistent regex search state.'
Assert-CodeLine (Get-CodeLines $choice) 'aria-activedescendant' 'Dropdowns must expose active option semantics.'
Assert-CodeLine (Get-CodeLines $bridge) 'export type ConverterBridge' 'Feature-owned bridge contract must be explicit.'
Assert-CodeLine (Get-CodeLines $registration) 'FILE_CONVERTER_C0_REGISTRATION' 'C0 registration descriptor must be explicit.'
if ($siteIntegrationAvailable) {
  Assert-True ($siteHtml.Contains('data-tab-panel="converter"') -and $siteHtml.Contains('data-converter-category="binary-encodings"')) 'Site equivalent must be present.'
  Assert-True ($siteScript.Contains('attachRegexBuilder') -and $siteScript.Contains('data-converter-queue')) 'Site equivalent must wire builders and its local queue.'
  Assert-True ($siteScript.Contains('async function detect') -and $siteScript.Contains('arrayBuffer')) 'Site equivalent must inspect source bytes.'
} else {
  Write-Output 'INTEGRATION REQUIRED: site/index.html and site/assets/js/converter.js are parent-owned and are not claimed by this lane.'
}

# Red, then green. Each mutation comments or renames an exact source boundary,
# then the restored source must satisfy that same boundary again.
Assert-RedMutation $registry 'bundled: false,' 'bundled: true,' 'bundled:\s*false\s*,' 'an unavailable adapter must never become enabled'
Assert-RedMutation $queue '  const pending: QueueItem[] = [];' '  const pending: QueueItem[] = await this.#store.listAll();' '^\s*const\s+pending:\s*QueueItem\[\]\s*=\s*\[\];\s*$' 'an unlimited queue must not materialize all pending records'
Assert-RedMutation $queue '      await appendAndFlush(this.#path, `${JSON.stringify(normalized)}\n`);' '      await appendFile(this.#path, `${JSON.stringify(normalized)}\n`);' '^\s*await\s+appendAndFlush\(this\.\#path' 'the authoritative queue journal must flush before derived publication'
Assert-RedMutation $hostText '    await withPromotionLock(destination, async () => {' '    // await withPromotionLock(destination, async () => {' 'withPromotionLock\(' 'destination promotion must remain exclusive'
Assert-RedMutation $hostText '      const output = this.#isolate' '      const output = adapter.convert' '^\s*const\s+output\s*=\s*this\.\#isolate' 'conversion must retain the terminable worker boundary'
Assert-RedMutation $overwrite '    this.#pending.delete(token);' '    // this.#pending.delete(token);' 'this\.\#pending\.delete\(token\)' 'overwrite tokens must be consumed once'
Assert-RedMutation $audit '        await this.#ensureGit();' '        // await this.#ensureGit();' '^\s*await this\.\#ensureGit\(\);\s*$' 'converter mutations must retain local Git history'
Assert-RedMutation $renderer 'host.requestOverwrite(' 'host.requestOverwrite_removed(' 'requestOverwrite\(' 'overwrite confirmation must remain mounted'
Assert-RedMutation $renderer '<DestructiveGate action=' '<DestructiveGate_removed action=' '<DestructiveGate\s+action=' 'the two-key gate must remain in the renderer'
Assert-RedMutation $bridge '  acknowledgeDisclosure(preview: ConverterPreview): Promise<DisclosureAcknowledgement | ConverterFailure>;' '  acknowledgeDisclosure_removed(preview: ConverterPreview): Promise<DisclosureAcknowledgement | ConverterFailure>;' 'acknowledgeDisclosure\(preview:' 'the disclosure acknowledgement bridge seam must remain registered'
if ($runtime.Contains('od:converter:queue:page')) {
  Assert-RedMutation $runtime 'ipcMain.handle("od:converter:queue:page"' '// ipcMain.handle("od:converter:queue:page"' '^\s*ipcMain\.handle\("od:converter:queue:page"' 'the parent-owned paged queue IPC handler must remain registered'
} else {
  Write-Output 'INTEGRATION REQUIRED: runtime IPC registration is parent-owned and remains unclaimed by this lane.'
}
if ($preload.Contains("od:converter:queue:page")) {
  Assert-RedMutation $preload "page: (cursor?: string, pageSize?: number) => ipcRenderer.invoke('od:converter:queue:page'" "page_removed: (cursor?: string, pageSize?: number) => ipcRenderer.invoke('od:converter:queue:page'" '^\s*page:\s*\(cursor[^)]*\).*ipcRenderer\.invoke\(''od:converter:queue:page''' 'the parent-owned paged queue preload bridge must remain registered'
} else {
  Write-Output 'INTEGRATION REQUIRED: preload bridge registration is parent-owned and remains unclaimed by this lane.'
}

Write-Output 'PASS: file converter negative red-then-green source proofs'
