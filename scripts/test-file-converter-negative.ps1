$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$script:boundaryChecks = 0
$script:redGreenMutations = 0

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
  $script:boundaryChecks += 1
  Assert-True (Has-CodeLine $lines $pattern) $message
}
function Assert-RedMutation([string]$text, [string]$old, [string]$replacement, [string]$pattern, [string]$message) {
  $script:redGreenMutations += 1
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
$provenance = Read-Normalized (Join-Path $root 'design/apps/desktop/src/main/converter/provenance.ts')
$provenanceLines = Get-CodeLines $provenance
$pathSafety = Read-Normalized (Join-Path $root 'design/apps/desktop/src/main/converter/path-safety.ts')
$pathSafetyLines = Get-CodeLines $pathSafety
$windowsWriter = Read-Normalized (Join-Path $root 'design/apps/desktop/src/main/converter/windows-writer.ts')
$windowsWriterLines = Get-CodeLines $windowsWriter
$nativeWriter = Read-Normalized (Join-Path $root 'design/tools/pack/resources/win/converter-writer/converter-writer.cpp')
$nativeWriterLines = Get-CodeLines $nativeWriter
$packWriter = Read-Normalized (Join-Path $root 'design/tools/pack/src/win/converter-writer.ts')
$packWriterLines = Get-CodeLines $packWriter
$packResources = Read-Normalized (Join-Path $root 'design/tools/pack/src/win/resources.ts')
$packResourcesLines = Get-CodeLines $packResources
$windowsWriterTestPath = Join-Path $root 'scripts/test-file-converter-windows-writer.ps1'
$windowsWriterTest = Read-Normalized $windowsWriterTestPath
$windowsWriterTestLines = Get-CodeLines $windowsWriterTest
$desktopTests = Read-Normalized (Join-Path $root 'design/apps/desktop/tests/main/file-converter.test.ts')
$desktopTestLines = Get-CodeLines $desktopTests

# Positive checks use exact code boundaries, so comments and longer renamed
# identifiers cannot satisfy the converter completeness contract.
Assert-CodeLine $registryLines 'bundled:\s*false\s*,' 'Unavailable adapters must be explicit.'
Assert-CodeLine $registryLines 'unavailableReason:\s*reason' 'Unavailable adapters must explain the missing bundled codec.'
Assert-CodeLine $registryLines 'packageProof:' 'Source-contract adapters must carry provenance metadata without becoming bundled capability.'
Assert-CodeLine $provenanceLines '^\s*export\s+async\s+function\s+createProvenanceBoundAdapters\(' 'Packaged proof must be created by the main-process provenance factory.'
Assert-CodeLine $provenanceLines 'createHash\("sha256"\)' 'Packaged proof must hash the actual resource bytes.'
Assert-CodeLine $provenanceLines 'resolveAllowlistedResource\(' 'Packaged proof must resolve only allowlisted resource paths.'
Assert-CodeLine $provenanceLines 'new WeakSet' 'Packaged capability must remain in a private opaque registry.'
Assert-CodeLine $provenanceLines 'publicAdapterMetadata\(' 'Renderer catalog data must be stripped of host capability.'
Assert-CodeLine $provenanceLines 'openStableFile\(resourcePath\)' 'Packaged provenance must read through a stable opened file handle.'
Assert-CodeLine $provenanceLines 'opened\.handle\.stat\(\)' 'Packaged provenance must re-stat the opened file handle.'
Assert-CodeLine $pathSafetyLines 'export async function openStableFile\(' 'Stable packaged resources must use the feature path-safety helper.'
Assert-CodeLine $pathSafetyLines 'export async function openStableDirectory\(' 'Queue export must have an opened parent-directory helper.'
Assert-CodeLine $pathSafetyLines 'sameSnapshot\(current, opened\)' 'Stable handles must verify the path identity after open.'
Assert-CodeLine $pathSafetyLines 'handle-relative no-reparse creation' 'Destination writes must fail closed when handle-relative no-reparse creation is unavailable.'
Assert-CodeLine $pathSafetyLines 'export function stableChildPath\(' 'Destination writes must use a stable directory child path.'
Assert-CodeLine $pathSafetyLines 'export async function snapshotStableChild\(' 'Destination checks must remain relative to the stable directory.'
Assert-CodeLine $windowsWriterLines '^export\s+class\s+WindowsNativeConverterWriter' 'Windows output must use the host-only native writer adapter.'
Assert-CodeLine $windowsWriterLines 'spawn\(runtime\.executablePath, \[\]' 'The native writer must start only the provenance-verified executable with no command-line input.'
Assert-CodeLine $windowsWriterLines '^\s*env:\s*\{\},\s*$' 'The native writer must receive no inherited environment surface.'
Assert-CodeLine $windowsWriterLines '^\s*shell:\s*false,\s*$' 'The native writer must never use a shell.'
Assert-CodeLine $windowsWriterLines 'createHash\("sha256"\).*manifest\.sha256' 'The runtime must verify the bundled helper digest before spawning it.'
Assert-CodeLine $windowsWriterLines 'assertPortableExecutable\(bytes\)' 'The runtime must verify the helper PE structure.'
Assert-CodeLine $nativeWriterLines 'OBJ_DONT_REPARSE' 'The native parent and child opens must refuse reparse traversal.'
Assert-CodeLine $nativeWriterLines 'attributes\.RootDirectory\s*=\s*root;' 'Native child names must resolve from the retained parent handle.'
Assert-CodeLine $nativeWriterLines 'static_cast<FILE_INFORMATION_CLASS>\(65\)' 'Native promotion must use handle-relative FileRenameInformationEx.'
Assert-CodeLine $nativeWriterLines 'RenameRelative\(child\.get\(\),\s*parent\.get\(\),\s*backup_name,\s*false' 'Authorized replacement must move the exact retained child handle into its rollback slot.'
Assert-CodeLine $nativeWriterLines 'SameWitness\(child_witness,\s*backup_witness\)' 'The exact authorized child must be revalidated after acknowledgement and before promotion.'
Assert-CodeLine $nativeWriterLines 'SameWitness\(child_witness,\s*retained_original\)' 'The retained authorized child must be revalidated after promotion before rollback retirement.'
Assert-CodeLine $nativeWriterLines '^\s*if\s*\(!SetDeleteOnClose\(temporary\.get\(\),\s*true' 'Temporary output must become delete-pending before streamed bytes arrive.'
Assert-CodeLine $nativeWriterLines '^\s*bool\s+cleaned\s*=\s*DeleteHandle\(temporary\.get\(\),\s*&cleanup_error\);' 'An initial delete-pending refusal must clean the exact temporary handle before returning.'
Assert-CodeLine $nativeWriterLines 'kOperationGuardian' 'A separate guardian operation must own the exact temporary handle before worker mutation.'
Assert-CodeLine $nativeWriterLines 'OpenChild\(parent\.get\(\),\s*guardian_name,\s*ChildDisposition::Create' 'The guardian must create the independently random temporary relative to the retained parent.'
Assert-CodeLine $nativeWriterLines 'ChildAccess::GuardianCreate\s*\?\s*FILE_DELETE_ON_CLOSE' 'Guardian creation must be crash-clean before any receipt.'
Assert-CodeLine $nativeWriterLines '^\s*crash_clean\.reset\(\);' 'The disposable create handle must close only after host acknowledgement.'
Assert-CodeLine $nativeWriterLines '"guardian-ready"' 'The guardian must prove its separate hold handle became durable.'
Assert-CodeLine $nativeWriterLines 'DuplicateHandle\(' 'The guardian must duplicate its exact hold handle directly into the worker.'
Assert-CodeLine $nativeWriterLines 'UniqueHandle\s+temporary\(reinterpret_cast<HANDLE>\(prepared_names\.worker_handle\)\)' 'The worker must retain the duplicated exact handle through mutation.'
Assert-CodeLine $nativeWriterLines 'ParseNativeIdentity\(encoded\.substr\(second\s*\+\s*1,\s*third\s*-\s*second\s*-\s*1\)' 'Prepared writer input must bind the guardian file ID.'
Assert-CodeLine $nativeWriterLines 'OpenChildById\(parent_path,\s*id_recovery_names\.witness' 'Post-ready failure recovery must locate the exact object by file ID.'
Assert-CodeLine $nativeWriterLines '"worker-guarded"' 'The worker must acknowledge exact-ID handoff before parent-race mutation.'
Assert-CodeLine $nativeWriterLines '^\s*if\s*\(!DeleteHandle\(guardian\.get\(\),\s*&error\)\s*&&\s*!IsDeletePending' 'Guardian cleanup must target its exact retained kernel handle.'
Assert-True (-not $nativeWriter.Contains('MDCW.RECOVERY') -and -not $windowsWriter.Contains('MDCW.RECOVERY')) 'No copyable recovery EA marker may remain in production source.'
Assert-CodeLine $nativeWriterLines 'backup-intent:' 'The helper must emit an authenticated rollback intent before moving the original child.'
Assert-CodeLine $nativeWriterLines 'promotion-intent:' 'The helper must emit an authenticated promotion intent before moving the temporary child.'
Assert-True ($nativeWriter.IndexOf('"backup-intent:"') -lt $nativeWriter.IndexOf('RenameRelative(child.get(), parent.get(), backup_name, false')) 'Rollback intent must precede the original-child namespace mutation.'
Assert-True ($nativeWriter.IndexOf('"promotion-intent:"') -lt $nativeWriter.IndexOf('RenameRelative(temporary.get(), parent.get(), child_name, false')) 'Promotion intent must precede the temp-to-final namespace mutation.'
Assert-CodeLine $nativeWriterLines 'kOperationRecover' 'Forced helper termination must have a bounded authenticated recovery operation.'
Assert-CodeLine $nativeWriterLines 'TransientSharingError\(' 'Native cleanup must retry only bounded transient sharing errors.'
Assert-CodeLine $nativeWriterLines '^\s*if\s*\(remnant_missing\)\s*\{' 'Recovery must inspect the post-transition target when an intent-named remnant is absent.'
Assert-CodeLine $nativeWriterLines 'FlushFileBuffers\(temporary\.get\(\)\)' 'Native output must flush bytes and metadata after promotion.'
Assert-CodeLine $nativeWriterLines 'ValidChildName\(' 'The native protocol must accept basenames rather than paths.'
Assert-CodeLine $windowsWriterLines 'inputDeadlineMs' 'The host contract must name the helper bound as an input-wait deadline.'
Assert-True (-not $windowsWriter.Contains('forceKillTimer') -and -not $windowsWriter.Contains('hardTimer') -and -not $windowsWriter.Contains('child.kill()')) 'The host must not hard-kill synchronous filesystem phases under an input-wait deadline.'
Assert-CodeLine $windowsWriterLines '^\s*async\s+\#recoverEntry\(' 'The host must consume exact native recovery receipts after helper termination.'
Assert-CodeLine $windowsWriterLines '^\s*terminalResponse\s*=\s*readTerminalResponse\(reader,\s*receipt\);' 'The host must consume recovery receipts concurrently with streamed input.'
Assert-CodeLine $windowsWriterLines '^\s*const\s+intendedPromotion\s*=\s*receipt\.promotedIdentity\s*\?\?' 'Recovery must use write-ahead promotion identity when no completion receipt exists.'
Assert-CodeLine $windowsWriterLines '^\s*async\s+\#startGuardian\(' 'The host must start a dedicated exact-handle guardian before the writer.'
Assert-CodeLine $windowsWriterLines '^\s*async\s+\#finishGuardian\(' 'The host must explicitly release or cancel the exact guardian.'
Assert-CodeLine $windowsWriterLines '^\s*async\s+\#handoffGuardian\(' 'The host must request an exact kernel handle duplication into the worker.'
Assert-CodeLine $windowsWriterLines '^\s*async\s+\#recoverById\(' 'The host must recover provisional guardian objects by exact file ID.'
Assert-CodeLine $windowsWriterLines '^\s*let\s+provisional:\s*GuardianState\s*\|\s*undefined;' 'The host must persist provisional guardian authority before readiness.'
Assert-CodeLine $windowsWriterLines '^\s*await\s+this\.\#finishGuardian\(guardian,\s*true\);' 'The host must release the guardian only after worker acceptance.'
$writeAtomicStart = $windowsWriter.IndexOf('async writeAtomic(')
Assert-True ($windowsWriter.IndexOf('this.#startGuardian(', $writeAtomicStart) -lt $windowsWriter.IndexOf('started = await this.#start()', $writeAtomicStart)) 'Guardian authority must exist before writer launch.'
Assert-True ($windowsWriter.IndexOf('guarded.message !== "worker-guarded"', $writeAtomicStart) -lt $windowsWriter.IndexOf('this.#finishGuardian(guardian, true)', $writeAtomicStart)) 'The host must observe worker-guarded before guardian release.'
Assert-CodeLine $packWriterLines '^export\s+async\s+function\s+buildWindowsConverterWriter\(' 'Packaging must build the native writer through one owned producer.'
Assert-CodeLine $packWriterLines 'assertPortableExecutable\(executable\)' 'Packaging must validate the produced PE structure.'
Assert-CodeLine $packWriterLines 'sourceSha256:' 'The packaged writer manifest must bind its source digest.'
Assert-CodeLine $packResourcesLines '^\s*await\s+buildWindowsConverterWriter\(\{' 'The Windows resource tree must bundle the native writer automatically.'
Assert-CodeLine $packResourcesLines 'windowsConverterWriterSource:\s*await\s+hashPath\(winResources\.converterWriterSource\)' 'The Windows resource cache key must include the native writer source.'
Assert-True (Test-Path -LiteralPath $windowsWriterTestPath) 'The focused Windows-native writer regression test is missing.'
Assert-CodeLine $windowsWriterTestLines 'forced-kill-backup-intent-interval' 'The real native test must kill between rollback mutation and completion receipt.'
Assert-CodeLine $windowsWriterTestLines 'forced-kill-promotion-intent-interval' 'The real native test must kill between promotion mutation and completion receipt.'
Assert-CodeLine $windowsWriterTestLines 'initial-disposition-recovery' 'The real native test must recover an initial delete-pending and cleanup refusal.'
Assert-CodeLine $windowsWriterTestLines 'forced-kill-after-create-before-intent' 'The real native test must kill immediately after FILE_CREATE and before a temp identity receipt.'
Assert-CodeLine $windowsWriterTestLines 'metadata-clone\.tmp' 'The native test must install a cloned same-name substitute.'
Assert-CodeLine $windowsWriterTestLines 'Set-Acl' 'The native test must copy the original ACL onto the substitute.'
Assert-CodeLine $windowsWriterTestLines 'fsutil file queryEA' 'The native test must inspect copyable extended attributes.'
Assert-CodeLine $windowsWriterTestLines 'Final promoted output retained a recovery EA marker' 'The native test must prove final output carries no recovery EA.'
Assert-CodeLine $windowsWriterTestLines 'Move-Item\s+-LiteralPath\s+\$preIntentClone\s+-Destination\s+\$preIntentOriginal' 'The native test must install the metadata clone at the exact original basename.'
Assert-CodeLine $windowsWriterTestLines '\$preIntentGuardian\.Process\.Kill\(\)' 'The native test must kill the guardian itself before any identity receipt.'
Assert-CodeLine $windowsWriterTestLines 'handoff-clone-before-worker-guarded' 'The native test must attack the attempted early-release interval.'
Assert-CodeLine $windowsWriterTestLines '-not\s+\$handoffGuardian\.Process\.HasExited' 'The native test must prove guardian release cannot occur before worker-guarded.'
Assert-CodeLine $windowsWriterTestLines 'guardian-clear-before-ready-kill' 'The native test must kill after disposition clear and before guardian-ready.'
Assert-CodeLine $windowsWriterTestLines 'Recovery-ById' 'The native test must repeat exact file-ID provisional cleanup.'
Assert-CodeLine $desktopTestLines 'refuses a Windows queue export when its approved parent changes before helper launch' 'Queue export must dynamically exercise its pre-launch parent witness.'
Assert-CodeLine $desktopTestLines 'refuses a Windows atomic write when its approved parent changes before helper launch' 'Generic atomic output must dynamically exercise its pre-launch parent witness.'
Assert-CodeLine $desktopTestLines 'refuses a Windows queue parent rename while the worker retains the exact child' 'Queue export must exercise retained-child parent-rename refusal.'
Assert-CodeLine $desktopTestLines 'refuses a parent rename while retaining the exact Windows child handle' 'Generic atomic output must exercise retained-child parent-rename refusal.'
Assert-CodeLine $queueLines '^\s*async\s+loadPage\(' 'Queue must page through durable items.'
Assert-CodeLine $queueLines '^\s*const\s+pending:\s*QueueItem\[\]\s*=\s*\[\];\s*$' 'Queue must keep only bounded pending work.'
Assert-CodeLine $queueLines 'ORDER_CHUNK_ITEMS' 'Durable queue order must be chunk-indexed.'
Assert-CodeLine $queueLines '^\s*async\s+compact\(' 'Queue must expose streaming journal compaction.'
Assert-CodeLine $queueLines 'appendAndFlush\(' 'The authoritative queue journal must flush before derived state.'
Assert-CodeLine $queueLines 'journalSize' 'Queue metadata must detect a journal written before a crash.'
Assert-CodeLine $queueLines 'frameJournalItem\(' 'Queue journal records must carry checksums.'
Assert-CodeLine $queueLines 'readLinesWithTail\(' 'Queue journal recovery must distinguish an incomplete final tail from earlier corruption.'
Assert-CodeLine $queueLines 'exportQueueToFile\(' 'Complete export must stream from the host into an approved destination.'
Assert-CodeLine $queueLines 'withPromotionLock\(' 'Queue export must use the shared destination lock.'
Assert-CodeLine $queueLines 'openStableDirectory\(dirname\(destination\)\)' 'Queue export must open and retain its destination parent handle.'
Assert-CodeLine $queueLines 'sameIdentity\(parent\.snapshot' 'Queue export must verify the destination parent identity before promotion.'
Assert-CodeLine $queueLines 'assertHandleRelativeWriteSupport\(' 'Queue export must fail closed before creating a temporary file when handle-relative creation is unavailable.'
Assert-CodeLine $queueLines 'stableChildPath\(parent' 'Queue export temporary and final files must use stable child paths.'
Assert-CodeLine $queueLines '^\s*if\s*\(process\.platform\s*===\s*"win32"\)\s*\{' 'Queue export must route Windows writes through the native seam.'
Assert-CodeLine $queueLines '^\s*await\s+writer\.writeAtomic\(destination' 'Windows queue export must stream into the retained native parent handle.'
Assert-CodeLine $queueLines '^\s*const\s+expectedParentIdentity\s*=\s*await\s+writer\.inspectParent\(dirname\(destination\)\);' 'Windows queue export must capture its native parent witness before writer launch.'
Assert-CodeLine $queueLines '^\s*expectedParentIdentity,\s*$' 'Windows queue export must pass the captured parent witness into the write request.'
Assert-CodeLine $hostLines 'readBoundedFile\(' 'Host must perform bounded source reads.'
Assert-CodeLine $hostLines '#consumeDisclosure\(' 'Loss disclosure acknowledgement must be consumed by the host.'
Assert-CodeLine $hostLines 'previewId: randomUUID\(' 'Every preview must carry a random identity.'
Assert-CodeLine $hostLines 'sourceDigest' 'Disclosure must bind the source digest.'
Assert-CodeLine $hostLines 'optionsDigest' 'Disclosure must bind normalized options.'
Assert-CodeLine $hostLines 'previewRecords' 'Preview records must remain host-owned.'
Assert-CodeLine $hostLines 'previewForId\(' 'Conversion must resolve a preview by host-owned id.'
Assert-CodeLine $hostLines 'onProgress\?\.' 'Enabled adapters must receive incremental byte progress.'
Assert-CodeLine $hostLines 'withPromotionLock\(' 'Destination promotion must use an exclusive lock.'
Assert-CodeLine $hostLines 'sameSnapshot\(' 'Destination replacement must revalidate the confirmed snapshot.'
Assert-CodeLine $hostLines 'stableChildPath\(parent' 'Host output temporary and final files must use stable child paths.'
Assert-CodeLine $hostLines '^\s*if\s*\(process\.platform\s*===\s*"win32"\)\s*\{' 'Host output must select the bundled native writer on Windows.'
Assert-CodeLine $hostLines '^\s*await\s+writer\.writeAtomic\(destination' 'Windows conversion output must use the native atomic writer.'
Assert-CodeLine $hostLines '^\s*const\s+expectedParentIdentity\s*=\s*options\.expectedParentIdentity' 'Every direct Windows atomic write must capture or reuse a native parent witness before launch.'
Assert-CodeLine $hostLines 'disclosureTokensByPreview' 'Disclosure state must index one live token per preview.'
Assert-CodeLine $hostLines 'MAX_DISCLOSURE_TOKENS' 'Disclosure state must have a hard capacity.'
Assert-CodeLine $hostLines 'pruneDisclosureState\(' 'Disclosure state must prune expired previews and tokens.'
Assert-CodeLine $hostLines 'removeDisclosureToken\(' 'Disclosure eviction must remove the reverse preview index.'
Assert-CodeLine $overwriteLines '^\s*export\s+class\s+OverwriteAuthorizationStore' 'Overwrite authorization must be host-owned.'
Assert-CodeLine $overwriteLines 'this\.\#pending\.delete\(token\)' 'Overwrite authorization must be one-use.'
Assert-CodeLine $auditLines '^\s*export\s+class\s+ConverterAuditStore' 'Notifications and history must be host-backed.'
Assert-CodeLine $auditLines 'git.*commit' 'Converter mutations must record a local Git revision.'
Assert-CodeLine $auditLines 'const followUp: ConverterHistoryEvent' 'History must persist a follow-up revision event.'
Assert-CodeLine $auditLines 'writeJsonSnapshot\([^,]+,\s*[^,]+,\s*this\.\#windowsWriterResourceRoot\)' 'Audit and history snapshots must route Windows writes through the bundled writer.'
Assert-CodeLine $auditLines 'inspectDestination\(path\)' 'Audit snapshots must bind the approved parent and child identities in one native inspection.'
Assert-CodeLine $rendererLines 'requestOverwrite' 'Renderer must expose the host overwrite handshake.'
Assert-CodeLine $rendererLines 'DestructiveGate' 'Renderer must mount the two-key full-slider gate.'
Assert-CodeLine $rendererLines 'host\.queue\.enqueue\(' 'Renderer must use the durable host queue.'
Assert-CodeLine $rendererLines 'host\.queue\.page\(' 'Renderer must page the complete queue.'
Assert-CodeLine $rendererLines 'queue\.export\(' 'Complete export must stream through the host into an approved destination.'
Assert-CodeLine $rendererLines 'acknowledgeDisclosure' 'Renderer must require an explicit loss disclosure acknowledgement.'
Assert-CodeLine $rendererLines 'data-converter-notification-history' 'Renderer must retain notification history.'
Assert-CodeLine $rendererLines 'data-converter-local-history' 'Renderer must retain local history.'
Assert-CodeLine (Get-CodeLines $choice) 'usePersistedConverterSearch' 'Dropdowns must own persistent regex search state.'
Assert-CodeLine (Get-CodeLines $choice) 'aria-activedescendant' 'Dropdowns must expose active option semantics.'
Assert-CodeLine (Get-CodeLines $bridge) 'export type ConverterBridge' 'Feature-owned bridge contract must be explicit.'
Assert-CodeLine (Get-CodeLines $registration) 'FILE_CONVERTER_C0_REGISTRATION' 'C0 registration descriptor must be explicit.'
Assert-True (-not $bridge.Contains('sourceSnapshot') -and -not $bridge.Contains('destinationSnapshot') -and -not $bridge.Contains('packageProof')) 'Renderer bridge metadata must omit host proofs and file snapshots.'
Assert-True ($bridge.Contains('acknowledgeDisclosure(previewId: string)') -and $bridge.Contains('convert(previewId: string')) 'Renderer must acknowledge and convert by opaque preview id.'
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
Assert-RedMutation $provenance '    const digest = createHash("sha256").update(bytes).digest("hex");' '    const digest = createHash_removed("sha256").update(bytes).digest("hex");' '^\s*const\s+digest\s*=\s*createHash\("sha256"\)' 'packaged proof must hash actual resource bytes'
Assert-RedMutation $provenance '  const opened = await openStableFile(resourcePath);' '  const opened = await openStableFile_removed(resourcePath);' '^\s*const\s+opened\s*=\s*await\s+openStableFile\(resourcePath\)' 'packaged provenance must use a stable opened file'
Assert-RedMutation $pathSafety '    const current = snapshotForStats(await stat(checked));' '    const currentRemoved = snapshotForStats(await stat(checked));' '^\s*const\s+current\s*=\s*snapshotForStats\(await\s+stat\(checked\)\);' 'stable handles must revalidate the path after open'
Assert-RedMutation $pathSafety 'export function stableChildPath(directory: StableDirectoryHandle, childName: string): string {' 'export function stableChildPath_removed(directory: StableDirectoryHandle, childName: string): string {' '^export\s+function\s+stableChildPath\(' 'destination writes must retain stable handle-relative child paths'
Assert-RedMutation $windowsWriter '      env: {},' '      env: process.env,' '^\s*env:\s*\{\},\s*$' 'the writer child must not inherit an environment surface'
Assert-RedMutation $windowsWriter '      shell: false,' '      shell: true,' '^\s*shell:\s*false,\s*$' 'the writer child must never use a shell'
Assert-RedMutation $nativeWriter '  attributes.RootDirectory = root;' '  attributes.RootDirectory = nullptr;' '^\s*attributes\.RootDirectory\s*=\s*root;' 'native child operations must remain relative to the retained parent handle'
Assert-RedMutation $nativeWriter '  attributes.Attributes = OBJ_CASE_INSENSITIVE | OBJ_DONT_REPARSE;' '  attributes.Attributes = OBJ_CASE_INSENSITIVE;' '^\s*attributes\.Attributes\s*=.*OBJ_DONT_REPARSE;' 'native name parsing must refuse reparse traversal'
Assert-RedMutation $nativeWriter '    if (!SameWitness(child_witness, backup_witness)) {' '    if (true) {' '^\s*if\s*\(!SameWitness\(child_witness,\s*backup_witness\)\)\s*\{' 'post-acknowledgement child identity must be revalidated'
Assert-RedMutation $nativeWriter '    promotion_ok = QueryWitness(child.get(), &retained_original, &error) && SameWitness(child_witness, retained_original);' '    promotion_ok = QueryWitness(child.get(), &retained_original, &error);' 'SameWitness\(child_witness,\s*retained_original\)' 'the exact authorized child must still match after promotion'
Assert-RedMutation $nativeWriter '    if (!RenameRelative(child.get(), parent.get(), backup_name, false, &error)) {' '    if (true) {' '^\s*if\s*\(!RenameRelative\(child\.get\(\),\s*parent\.get\(\),\s*backup_name,\s*false' 'rollback must preserve the exact retained child handle'
Assert-RedMutation $nativeWriter '  if (!SetDeleteOnClose(temporary.get(), true, &error)) {' '  if (true) {' '^\s*if\s*\(!SetDeleteOnClose\(temporary\.get\(\),\s*true' 'temporary output must become crash-clean before streamed bytes arrive'
Assert-RedMutation $nativeWriter '        || !SendResponse(output, kResponseProgress, 3, child_witness, "backup-intent:" + WideToUtf8(backup_name))) {' '        || true) {' 'backup-intent:' 'rollback write-ahead intent must remain before namespace mutation'
Assert-RedMutation $nativeWriter '  if (!SendResponse(output, kResponseProgress, 4, temporary_witness, "promotion-intent:" + WideToUtf8(temporary_name))) {' '  if (true) {' 'promotion-intent:' 'promotion write-ahead intent must remain before namespace mutation'
Assert-RedMutation $nativeWriter '    bool cleaned = DeleteHandle(temporary.get(), &cleanup_error);' '    bool cleaned = false;' '^\s*bool\s+cleaned\s*=\s*DeleteHandle\(temporary\.get\(\),\s*&cleanup_error\);' 'initial delete-pending refusal must attempt exact cleanup'
Assert-RedMutation $nativeWriter '      : OpenChild(parent.get(), guardian_name, ChildDisposition::Create, ChildAccess::GuardianCreate, &error);' '      : UniqueHandle{};' 'OpenChild\(parent\.get\(\),\s*guardian_name,\s*ChildDisposition::Create' 'guardian creation must retain the exact kernel handle'
Assert-RedMutation $nativeWriter '      | (child_access == ChildAccess::GuardianCreate ? FILE_DELETE_ON_CLOSE : 0),' '      | 0,' 'ChildAccess::GuardianCreate\s*\?\s*FILE_DELETE_ON_CLOSE' 'guardian creation must remain crash-clean before receipt'
Assert-RedMutation $nativeWriter '    crash_clean.reset();' '    // crash_clean.reset();' '^\s*crash_clean\.reset\(\);' 'create handle must remain until host acknowledgement'
Assert-RedMutation $nativeWriter '    if (!SendResponse(output, kResponseProgress, 13, guardian_witness, "guardian-ready")) return 42;' '    if (false) return 42;' '"guardian-ready"' 'guardian must acknowledge durable hold state'
Assert-RedMutation $nativeWriter '      if (!worker_process || !DuplicateHandle(' '      if (true || !DuplicateHandle_removed(' 'DuplicateHandle\(' 'guardian must duplicate its exact kernel handle into the worker'
Assert-RedMutation $nativeWriter '  UniqueHandle temporary(reinterpret_cast<HANDLE>(prepared_names.worker_handle));' '  UniqueHandle temporary{};' 'UniqueHandle\s+temporary\(reinterpret_cast<HANDLE>\(prepared_names\.worker_handle\)\)' 'worker must retain the duplicated exact handle'
Assert-RedMutation $nativeWriter '    && ParseNativeIdentity(encoded.substr(second + 1, third - second - 1), &names->temporary_witness);' '    && true;' 'ParseNativeIdentity\(encoded\.substr\(second\s*\+\s*1,\s*third\s*-\s*second\s*-\s*1\)' 'prepared worker input must retain the guardian file ID'
Assert-RedMutation $nativeWriter '    UniqueHandle recovery = OpenChildById(parent_path, id_recovery_names.witness, ChildAccess::Replace, &error);' '    UniqueHandle recovery{};' 'OpenChildById\(parent_path,\s*id_recovery_names\.witness' 'post-ready failure recovery must use exact file ID'
Assert-RedMutation $nativeWriter '  if (!SendResponse(output, kResponseProgress, 1, temporary_witness, "worker-guarded")) return 17;' '  if (false) return 17;' '"worker-guarded"' 'worker must acknowledge exact-ID handoff'
Assert-RedMutation $nativeWriter '      if (!DeleteHandle(guardian.get(), &error) && !IsDeletePending(guardian.get())) {' '      if (true) {' '^\s*if\s*\(!DeleteHandle\(guardian\.get\(\),\s*&error\)\s*&&\s*!IsDeletePending' 'guardian cancel must delete the exact retained handle'
Assert-RedMutation $windowsWriter '  async #recoverEntry(input: {' '  async recoverEntry_removed(input: {' '^\s*async\s+\#recoverEntry\(' 'the host must retain authenticated helper recovery'
Assert-RedMutation $windowsWriter '  async #startGuardian(destination: string, parentIdentity: string, inputDeadlineMs: number): Promise<GuardianState> {' '  async startGuardian_removed(destination: string, parentIdentity: string, inputDeadlineMs: number): Promise<GuardianState> {' '^\s*async\s+\#startGuardian\(' 'the host must retain the exact-handle guardian'
Assert-RedMutation $windowsWriter '    let provisional: GuardianState | undefined;' '    let provisionalRemoved: GuardianState | undefined;' '^\s*let\s+provisional:\s*GuardianState\s*\|\s*undefined;' 'host must persist provisional guardian authority before ready'
Assert-RedMutation $windowsWriter '  async #recoverById(' '  async recoverById_removed(' '^\s*async\s+\#recoverById\(' 'host must retain exact file-ID provisional cleanup'
Assert-RedMutation $windowsWriter '    const guardian = await this.#startGuardian(destination, expectedParentIdentity, inputDeadlineMs);' '    const guardian = await this.#start();' 'this\.\#startGuardian\(' 'guardian authority must be established before writer launch'
Assert-RedMutation $windowsWriter '      await this.#finishGuardian(guardian, true);' '      await this.#finishGuardian(guardian, false);' '^\s*await\s+this\.\#finishGuardian\(guardian,\s*true\);' 'guardian must release only after worker acceptance'
Assert-RedMutation $windowsWriter '      terminalResponse = readTerminalResponse(reader, receipt);' '      terminalResponse = readResponse(reader);' '^\s*terminalResponse\s*=\s*readTerminalResponse\(reader,\s*receipt\);' 'recovery receipts must be consumed while bytes stream'
Assert-RedMutation $windowsWriter '    const intendedPromotion = receipt.promotedIdentity ?? receipt.promotionIntent?.nativeIdentity;' '    const intendedPromotion = receipt.promotedIdentity;' '^\s*const\s+intendedPromotion\s*=\s*receipt\.promotedIdentity\s*\?\?' 'recovery must retain pre-completion promotion identity'
Assert-RedMutation $desktopTests '        windowsBeforeLaunch: async () => {' '        windowsBeforeLaunch_removed: async () => {' '^\s*windowsBeforeLaunch:\s*async\s*\(\)\s*=>\s*\{' 'desktop pre-launch parent witness races must stay dynamically exercised'
Assert-RedMutation $desktopTests '  it("refuses a Windows queue parent rename while the worker retains the exact child", async () => {' '  it("removed queue parent race", async () => {' 'refuses a Windows queue parent rename while the worker retains the exact child' 'queue retained-child parent race must remain dynamically exercised'
Assert-RedMutation $windowsWriterTest "  `$preIntentKillRoot = Join-Path `$caseRoot 'forced-kill-after-create-before-intent'" "  `$preIntentKillRootRemoved = Join-Path `$caseRoot 'removed'" 'forced-kill-after-create-before-intent' 'the native test must retain the pre-identity FILE_CREATE kill'
Assert-RedMutation $windowsWriterTest '  Move-Item -LiteralPath $preIntentClone -Destination $preIntentOriginal' '  Move-Item -LiteralPath $preIntentClone -Destination $preIntentClone' '^\s*Move-Item\s+-LiteralPath\s+\$preIntentClone\s+-Destination\s+\$preIntentOriginal' 'the cloned same-name substitution attack must remain active'
Assert-RedMutation $windowsWriterTest '  $preIntentGuardian.Process.Kill()' '  $preIntentGuardian.Process.Refresh()' '\$preIntentGuardian\.Process\.Kill\(\)' 'guardian self-crash proof must remain active'
Assert-RedMutation $windowsWriterTest "  `$handoffRoot = Join-Path `$caseRoot 'handoff-clone-before-worker-guarded'" "  `$handoffRootRemoved = Join-Path `$caseRoot 'removed'" 'handoff-clone-before-worker-guarded' 'early-release clone attack must remain active'
Assert-RedMutation $windowsWriterTest "  `$readyFailureRoot = Join-Path `$caseRoot 'guardian-clear-before-ready-kill'" "  `$readyFailureRootRemoved = Join-Path `$caseRoot 'removed'" 'guardian-clear-before-ready-kill' 'post-clear pre-ready guardian kill must remain active'
Assert-RedMutation $windowsWriterTest "  Assert-True (-not `$normalEaOutput.Contains('MDCW.RECOVERY')) 'Final promoted output retained a recovery EA marker.'" "  Assert-True `$true 'removed'" 'Final promoted output retained a recovery EA marker' 'the final promoted output must remain free of recovery EA markers'
Assert-RedMutation $packResources '      await buildWindowsConverterWriter({' '      // await buildWindowsConverterWriter({' '^\s*await\s+buildWindowsConverterWriter\(\{' 'the writer executable must remain in the packaged resource tree'
Assert-RedMutation $packResources '    windowsConverterWriterSource: await hashPath(winResources.converterWriterSource),' '    windowsConverterWriterSource: "missing",' 'windowsConverterWriterSource:\s*await\s+hashPath\(winResources\.converterWriterSource\)' 'the writer source must remain a resource-tree cache determinant'
Assert-RedMutation $queue '  const pending: QueueItem[] = [];' '  const pending: QueueItem[] = await this.#store.listAll();' '^\s*const\s+pending:\s*QueueItem\[\]\s*=\s*\[\];\s*$' 'an unlimited queue must not materialize all pending records'
Assert-RedMutation $queue '      await appendAndFlush(this.#path, `${frameJournalItem(normalized)}\n`);' '      await appendFile(this.#path, `${frameJournalItem(normalized)}\n`);' '^\s*await\s+appendAndFlush\(this\.\#path' 'the authoritative queue journal must flush before derived publication'
Assert-RedMutation $hostText '      await withPromotionLock(destination, async () => {' '      // await withPromotionLock(destination, async () => {' '^\s*await\s+withPromotionLock\(' 'destination promotion must remain exclusive'
Assert-RedMutation $hostText '    const temporary = stableChildPath(parent, `.converter-${randomUUID()}.tmp`);' '    const temporaryRemoved = `${destination}.tmp`;' '^\s*const\s+temporary\s*=\s*stableChildPath\(parent' 'host output must be created relative to the verified parent handle'
Assert-RedMutation $hostText '    await writer.writeAtomic(destination, singleWindowsWriterChunk(bytes), {' '    await writer.writeAtomic_removed(destination, singleWindowsWriterChunk(bytes), {' '^\s*await\s+writer\.writeAtomic\(destination' 'Windows host output must retain its native atomic writer call'
Assert-RedMutation $queue '    await writer.writeAtomic(destination, queueExportChunks(store, maxItems, maxBytes, progress), {' '    await writer.writeAtomic_removed(destination, queueExportChunks(store, maxItems, maxBytes, progress), {' '^\s*await\s+writer\.writeAtomic\(destination' 'Windows queue export must retain its native streaming writer call'
Assert-RedMutation $queue '    const expectedParentIdentity = await writer.inspectParent(dirname(destination));' '    const expectedParentIdentity = "path-only";' '^\s*const\s+expectedParentIdentity\s*=\s*await\s+writer\.inspectParent\(dirname\(destination\)\);' 'queue export must capture a native parent witness before launch'
Assert-RedMutation $hostText '    const expectedParentIdentity = options.expectedParentIdentity' '    const expectedParentIdentityRemoved = options.expectedParentIdentity' '^\s*const\s+expectedParentIdentity\s*=\s*options\.expectedParentIdentity' 'direct Windows writes must capture or reuse a native parent witness'
Assert-RedMutation $hostText 'const MAX_DISCLOSURE_TOKENS = 4_096;' 'const MAX_DISCLOSURE_TOKENS_REMOVED = 4_096;' '^const\s+MAX_DISCLOSURE_TOKENS\s*=\s*4_096;' 'disclosure state must retain a hard token capacity'
Assert-RedMutation $hostText 'const disclosureTokensByPreview = new Map<string, string>();' 'const disclosureTokensByPreview_removed = new Map<string, string>();' '^const\s+disclosureTokensByPreview\s*=\s*new\s+Map' 'each preview must have one reverse-indexed disclosure token'
Assert-RedMutation $overwrite '    this.#pending.delete(token);' '    // this.#pending.delete(token);' 'this\.\#pending\.delete\(token\)' 'overwrite tokens must be consumed once'
Assert-RedMutation $audit '        await this.#ensureGit();' '        // await this.#ensureGit();' '^\s*await this\.\#ensureGit\(\);\s*$' 'converter mutations must retain local Git history'
Assert-RedMutation $audit '        const followUp: ConverterHistoryEvent = {' '        const followUpRemoved: ConverterHistoryEvent = {' '^\s*const\s+followUp:\s*ConverterHistoryEvent\s*=\s*\{' 'history must append the real revision event'
Assert-RedMutation $audit '        await writeJsonSnapshot(this.#historyPath(value.id), value, this.#windowsWriterResourceRoot);' '        await writeJsonSnapshot(this.#historyPath(value.id), value);' '^\s*await\s+writeJsonSnapshot\(this\.\#historyPath\(value\.id\),\s*value,\s*this\.\#windowsWriterResourceRoot\);' 'history snapshots must retain the Windows writer resource boundary'
Assert-RedMutation $renderer 'host.requestOverwrite(' 'host.requestOverwrite_removed(' 'requestOverwrite\(' 'overwrite confirmation must remain mounted'
Assert-RedMutation $renderer '<DestructiveGate action=' '<DestructiveGate_removed action=' '<DestructiveGate\s+action=' 'the two-key gate must remain in the renderer'
Assert-RedMutation $bridge '  acknowledgeDisclosure(previewId: string): Promise<DisclosureAcknowledgement | ConverterFailure>;' '  acknowledgeDisclosure_removed(previewId: string): Promise<DisclosureAcknowledgement | ConverterFailure>;' 'acknowledgeDisclosure\(previewId:' 'the disclosure acknowledgement bridge seam must remain registered'
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

Write-Output ("PASS: file converter negative red-then-green source proofs ({0} exact boundary checks, {1} red-green mutations)" -f $script:boundaryChecks, $script:redGreenMutations)
