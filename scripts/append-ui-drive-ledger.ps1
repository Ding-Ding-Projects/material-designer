[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string]$Receipt,
    [string]$Ledger = '.codex/verification/ui-drive/ledger.json',
    [string]$Inventory = '.codex/verification/ui-drive/inventory.json',
    [string]$SceneRegistry = '.codex/verification/ui-drive/scene-registry.json',
    [string]$Authority = '.codex/verification/ui-drive/authority.json',
    [string]$EvidenceRoot = '.codex/verification/evidence',
    [string]$RepositoryRoot,
    [string]$VocabularySource,
    [int]$LockAttempts = 600,
    [int]$LockDelayMs = 50,
    [int]$ReplaceAttempts = 10,
    [int]$ReplaceDelayMs = 40
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($RepositoryRoot)) { $RepositoryRoot = Split-Path (Split-Path $MyInvocation.MyCommand.Path -Parent) -Parent }
. (Join-Path $PSScriptRoot 'ui-drive-evidence-lib.ps1')
$schemaRoot = Join-Path $RepositoryRoot '.codex/verification/ui-drive'
$canonicalEvidenceRoot = [IO.Path]::GetFullPath((Join-Path $RepositoryRoot '.codex/verification/evidence'))
if ([IO.Path]::GetFullPath($EvidenceRoot) -cne $canonicalEvidenceRoot) { throw 'Ledger append requires the exact canonical evidence root.' }
$ledgerFull = Assert-UIPathHasNoReparsePoint -Path $Ledger
$receiptFull = Resolve-UIEvidencePath -EvidenceRoot $canonicalEvidenceRoot -Path $Receipt
$ledgerDirectory = [IO.Path]::GetDirectoryName($ledgerFull)
[void](Assert-UIPathHasNoReparsePoint -Path $ledgerDirectory)
$lockPath = (& git -C $RepositoryRoot rev-parse --git-path ui-drive-ledger.append.lock).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($lockPath)) { throw 'Could not resolve the Git-admin ledger lock path.' }
if (-not [IO.Path]::IsPathRooted($lockPath)) { $lockPath = Join-Path $RepositoryRoot $lockPath }
$lockParent = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($lockPath))
[void](Assert-UIPathHasNoReparsePoint -Path $lockParent)
[void](Assert-UIPathHasNoReparsePoint -Path $lockPath -AllowMissingLeaf)

function Invoke-ReceiptValidation([string]$Path) {
    $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'validate-ui-drive-receipt.ps1'), '-Receipt', $Path, '-Inventory', $Inventory, '-SceneRegistry', $SceneRegistry, '-Authority', $Authority, '-EvidenceRoot', $canonicalEvidenceRoot, '-RepositoryRoot', $RepositoryRoot)
    if (-not [string]::IsNullOrWhiteSpace($VocabularySource)) { $arguments += @('-VocabularySource', $VocabularySource) }
    & powershell.exe @arguments 1>$null 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Receipt evidence chain failed revalidation.' }
}

$lockStream = $null
for ($attempt = 1; $attempt -le $LockAttempts; $attempt++) {
    try {
        $lockStream = [IO.FileStream]::new($lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
        break
    } catch [IO.IOException] {
        if ($attempt -eq $LockAttempts) { throw 'Timed out acquiring the cross-process ledger append lock.' }
        Start-Sleep -Milliseconds $LockDelayMs
    }
}

$temp = Join-Path $ledgerDirectory ('.ledger.' + [guid]::NewGuid().ToString('N') + '.tmp')
$backup = Join-Path $ledgerDirectory ('.ledger.' + [guid]::NewGuid().ToString('N') + '.bak')
$sharingRetries = 0
try {
    $ledgerData = Read-UIValidatedJson -Path $ledgerFull -SchemaPath (Join-Path $schemaRoot 'ledger.schema.json') -MaxBytes 4194304 -MaxDepth 20 -MaxStringLength 4096 -MaxArrayLength 10000 -MaxObjectProperties 128
    foreach ($existing in @($ledgerData.rows)) {
        $existingReceipt = Resolve-UIEvidencePath -EvidenceRoot $canonicalEvidenceRoot -Path ([string]$existing.receiptPath)
        if ((Get-UIFileSha256 $existingReceipt) -cne [string]$existing.receiptSha256) { throw 'Existing ledger receipt hash is stale.' }
        Invoke-ReceiptValidation $existingReceipt
    }
    Invoke-ReceiptValidation $receiptFull
    $receiptData = Read-UIValidatedJson -Path $receiptFull -SchemaPath (Join-Path $schemaRoot 'click-receipt.schema.json') -MaxBytes 1048576 -MaxDepth 24 -MaxStringLength 4096 -MaxArrayLength 10000 -MaxObjectProperties 128
    $rows = @($ledgerData.rows)
    for ($index = 0; $index -lt $rows.Count; $index++) { if ([int]$rows[$index].sequence -ne ($index + 1)) { throw 'Existing ledger sequence is not contiguous.' } }
    if ([int]$receiptData.sequence -ne ($rows.Count + 1)) { throw 'Receipt sequence is not the next durable append position.' }
    if (@($rows | Where-Object receiptId -CEQ $receiptData.receiptId).Count -gt 0) { throw 'Duplicate receipt identity refused.' }
    if (@($rows | Where-Object sceneId -CEQ $receiptData.sceneId).Count -gt 0) { throw 'Duplicate scene identity refused.' }
    if (@($rows | Where-Object { $_.surfaceId -ceq $receiptData.surfaceId -and $_.featureId -ceq $receiptData.featureId -and $_.destinationId -ceq $receiptData.destinationId -and $_.interactionId -ceq $receiptData.interactionId }).Count -gt 0) { throw 'Duplicate interaction identity refused.' }
    if ($rows.Count -gt 0) {
        $first = $rows[0]
        if ($first.sourceCommit -cne $receiptData.sourceCommit -or $first.artifactSha256 -cne $receiptData.artifact.sha256 -or $first.artifactBuiltFromCommit -cne $receiptData.artifact.builtFromCommit -or $first.sessionId -cne $receiptData.captureRun.sessionId) { throw 'Moving source, artifact, or capture session identity refused.' }
    }
    $manifestFull = Resolve-UIEvidencePath -EvidenceRoot $canonicalEvidenceRoot -Path ([string]$receiptData.approvedOutputManifestPath)
    $rootPrefix = $canonicalEvidenceRoot.TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar
    $receiptRelative = $receiptFull.Substring($rootPrefix.Length).Replace('\','/')
    $newRow = [ordered]@{
        receiptId = [string]$receiptData.receiptId
        receiptPath = $receiptRelative
        receiptSha256 = Get-UIFileSha256 $receiptFull
        sceneId = [string]$receiptData.sceneId
        surfaceId = [string]$receiptData.surfaceId
        featureId = $receiptData.featureId
        destinationId = $receiptData.destinationId
        interactionId = [string]$receiptData.interactionId
        sequence = [int]$receiptData.sequence
        sourceCommit = [string]$receiptData.sourceCommit
        artifactPath = [string]$receiptData.artifact.path
        artifactSha256 = [string]$receiptData.artifact.sha256
        artifactBuiltFromCommit = [string]$receiptData.artifact.builtFromCommit
        artifactProvenancePath = [string]$receiptData.artifact.provenancePath
        artifactProvenanceSha256 = [string]$receiptData.artifact.provenanceSha256
        captureRunPath = [string]$receiptData.captureRun.path
        captureRunSha256 = [string]$receiptData.captureRun.sha256
        runId = [string]$receiptData.captureRun.runId
        sessionId = [string]$receiptData.captureRun.sessionId
        imagePath = [string]$receiptData.image.path
        imageSha256 = [string]$receiptData.image.sha256
        everyElementAuditPath = [string]$receiptData.everyElementAudit.path
        everyElementAuditSha256 = [string]$receiptData.everyElementAudit.sha256
        approvedOutputManifestPath = [string]$receiptData.approvedOutputManifestPath
        approvedOutputManifestSha256 = Get-UIFileSha256 $manifestFull
        screenId = [string]$receiptData.captureTuple.screenId
        state = [string]$receiptData.captureTuple.state
        route = [string]$receiptData.captureTuple.route
        theme = [string]$receiptData.captureTuple.theme
        locale = [string]$receiptData.captureTuple.locale
        viewportWidth = [int]$receiptData.captureTuple.viewportWidth
        viewportHeight = [int]$receiptData.captureTuple.viewportHeight
        displayScale = $receiptData.captureTuple.displayScale
        headlessRoute = [string]$receiptData.captureTuple.headlessRoute
        networkIsolationMode = [string]$receiptData.captureTuple.networkIsolation.mode
        blockedExternalRequests = [bool]$receiptData.captureTuple.networkIsolation.blockedExternalRequests
        allowedOrigins = @($receiptData.captureTuple.networkIsolation.allowedOrigins)
        actionKind = [string]$receiptData.action.kind
        actionTarget = [string]$receiptData.action.target
        accessibleName = [string]$receiptData.action.accessibleName
        inputMethod = [string]$receiptData.action.inputMethod
        expectedBefore = [string]$receiptData.semanticState.expectedBefore
        expectedAfter = [string]$receiptData.semanticState.expectedAfter
    }
    $updated = [ordered]@{
        version = 2
        inventoryVersion = 1
        ledgerMode = 'durable-append-only-one-receipt-per-interaction'
        evidencePolicy = 'fail-closed-real-built-artifact-only'
        approvedHeadlessRoute = 'cheap-lowlevel-headless'
        rows = @($rows) + $newRow
    }
    $json = $updated | ConvertTo-Json -Depth 30
    $payload = [Text.UTF8Encoding]::new($false).GetBytes($json + [Environment]::NewLine)
    $stream = [IO.FileStream]::new($temp, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $stream.Write($payload, 0, $payload.Length); $stream.Flush($true) } finally { $stream.Dispose() }
    $candidate = Read-UIValidatedJson -Path $temp -SchemaPath (Join-Path $schemaRoot 'ledger.schema.json') -MaxBytes 4194304 -MaxDepth 20 -MaxStringLength 4096 -MaxArrayLength 10000 -MaxObjectProperties 128
    foreach ($candidateRow in @($candidate.rows)) {
        $candidateReceipt = Resolve-UIEvidencePath -EvidenceRoot $canonicalEvidenceRoot -Path ([string]$candidateRow.receiptPath)
        if ((Get-UIFileSha256 $candidateReceipt) -cne [string]$candidateRow.receiptSha256) { throw 'Candidate ledger receipt hash is stale.' }
        Invoke-ReceiptValidation $candidateReceipt
    }
    $candidateHash = Get-UIFileSha256 $temp
    Invoke-UISharingRetry -Operation { [IO.File]::Replace($temp, $ledgerFull, $backup, $true) } -Attempts $ReplaceAttempts -DelayMs $ReplaceDelayMs -RetryCount ([ref]$sharingRetries)
    try {
        $final = Read-UIValidatedJson -Path $ledgerFull -SchemaPath (Join-Path $schemaRoot 'ledger.schema.json') -MaxBytes 4194304 -MaxDepth 20 -MaxStringLength 4096 -MaxArrayLength 10000 -MaxObjectProperties 128
        if ((Get-UIFileSha256 $ledgerFull) -cne $candidateHash -or @($final.rows).Count -ne ($rows.Count + 1) -or $final.rows[-1].receiptId -cne $receiptData.receiptId) { throw 'Final ledger reopen or hash verification failed.' }
        foreach ($finalRow in @($final.rows)) {
            $finalReceipt = Resolve-UIEvidencePath -EvidenceRoot $canonicalEvidenceRoot -Path ([string]$finalRow.receiptPath)
            if ((Get-UIFileSha256 $finalReceipt) -cne [string]$finalRow.receiptSha256) { throw 'Final ledger receipt hash is stale.' }
            Invoke-ReceiptValidation $finalReceipt
        }
    } catch {
        if (Test-Path -LiteralPath $backup -PathType Leaf) { Invoke-UISharingRetry -Operation { [IO.File]::Replace($backup, $ledgerFull, $null, $true) } -Attempts $ReplaceAttempts -DelayMs $ReplaceDelayMs }
        throw
    }
    if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Force }
    Write-Output "PASS: appended receipt $($receiptData.receiptId) at durable sequence $($receiptData.sequence); final ledger reopened, hashed, schema-validated, and fully revalidated after $sharingRetries sharing retry attempt(s)."
} finally {
    if ($null -ne $lockStream) { $lockStream.Dispose() }
    if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force }
    if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Force }
}
