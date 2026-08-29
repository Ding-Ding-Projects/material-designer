[CmdletBinding()]
param(
    [string]$Inventory = '.codex/verification/ui-drive/inventory.json',
    [string]$Receipt,
    [string]$SceneRegistry = '.codex/verification/ui-drive/scene-registry.json',
    [string]$Ledger = '.codex/verification/ui-drive/ledger.json',
    [string]$Authority = '.codex/verification/ui-drive/authority.json',
    [string]$EvidenceRoot = '.codex/verification/evidence',
    [string]$RepositoryRoot,
    [string]$VocabularySource
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($RepositoryRoot)) { $RepositoryRoot = Split-Path (Split-Path $MyInvocation.MyCommand.Path -Parent) -Parent }
. (Join-Path $PSScriptRoot 'ui-drive-evidence-lib.ps1')
$schemaRoot = Join-Path $RepositoryRoot '.codex/verification/ui-drive'

$inventoryData = Read-UIValidatedJson -Path $Inventory -SchemaPath (Join-Path $schemaRoot 'inventory.schema.json') -MaxBytes 1048576 -MaxDepth 24 -MaxStringLength 4096 -MaxArrayLength 10000 -MaxObjectProperties 128
$registryData = Read-UIValidatedJson -Path $SceneRegistry -SchemaPath (Join-Path $schemaRoot 'scene-registry.schema.json') -MaxBytes 1048576 -MaxDepth 24 -MaxStringLength 4096 -MaxArrayLength 10000 -MaxObjectProperties 128
$ledgerData = Read-UIValidatedJson -Path $Ledger -SchemaPath (Join-Path $schemaRoot 'ledger.schema.json') -MaxBytes 4194304 -MaxDepth 20 -MaxStringLength 4096 -MaxArrayLength 10000 -MaxObjectProperties 128
[void](Read-UIValidatedJson -Path $Authority -SchemaPath (Join-Path $schemaRoot 'authority.schema.json') -MaxBytes 1048576 -MaxDepth 12 -MaxStringLength 512 -MaxArrayLength 100 -MaxObjectProperties 16)

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'verify-ui-drive-scenes.ps1') -Inventory $Inventory -Registry $SceneRegistry -Authority $Authority -RepositoryRoot $RepositoryRoot 1>$null 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Canonical UI-drive scene verification failed.' }

$rows = @($ledgerData.rows)
for ($index = 0; $index -lt $rows.Count; $index++) { if ([int]$rows[$index].sequence -ne ($index + 1)) { throw 'Ledger sequence is not contiguous.' } }
foreach ($identity in @('receiptId', 'receiptPath', 'sceneId')) {
    if (@($rows | Group-Object -Property $identity | Where-Object Count -gt 1).Count -gt 0) { throw 'Ledger repeats an immutable identity.' }
}
if (@($rows | Group-Object -Property surfaceId, featureId, destinationId, interactionId | Where-Object Count -gt 1).Count -gt 0) { throw 'Ledger repeats a surface interaction identity.' }

$canonicalEvidenceRoot = [IO.Path]::GetFullPath((Join-Path $RepositoryRoot '.codex/verification/evidence'))
if ($rows.Count -gt 0 -or -not [string]::IsNullOrWhiteSpace($Receipt)) {
    if ([IO.Path]::GetFullPath($EvidenceRoot) -cne $canonicalEvidenceRoot) { throw 'Evidence verification requires the exact canonical evidence root.' }
    [void](Assert-UIPathHasNoReparsePoint -Path $canonicalEvidenceRoot)
}

function Assert-LedgerRowMatchesReceipt($Row, $ReceiptData, [string]$ReceiptFull) {
    $rootPrefix = $canonicalEvidenceRoot.TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar
    function Relative([string]$Path) { return ([IO.Path]::GetFullPath($Path).Substring($rootPrefix.Length).Replace('\','/')) }
    $manifestFull = Resolve-UIEvidencePath -EvidenceRoot $canonicalEvidenceRoot -Path ([string]$ReceiptData.approvedOutputManifestPath)
    $expected = [ordered]@{
        receiptId = [string]$ReceiptData.receiptId
        receiptPath = Relative $ReceiptFull
        receiptSha256 = Get-UIFileSha256 $ReceiptFull
        sceneId = [string]$ReceiptData.sceneId
        surfaceId = [string]$ReceiptData.surfaceId
        featureId = $ReceiptData.featureId
        destinationId = $ReceiptData.destinationId
        interactionId = [string]$ReceiptData.interactionId
        sequence = [int]$ReceiptData.sequence
        sourceCommit = [string]$ReceiptData.sourceCommit
        artifactPath = [string]$ReceiptData.artifact.path
        artifactSha256 = [string]$ReceiptData.artifact.sha256
        artifactBuiltFromCommit = [string]$ReceiptData.artifact.builtFromCommit
        artifactProvenancePath = [string]$ReceiptData.artifact.provenancePath
        artifactProvenanceSha256 = [string]$ReceiptData.artifact.provenanceSha256
        captureRunPath = [string]$ReceiptData.captureRun.path
        captureRunSha256 = [string]$ReceiptData.captureRun.sha256
        liveOriginPath = [string]$ReceiptData.liveOrigin.path
        liveOriginSha256 = [string]$ReceiptData.liveOrigin.sha256
        originId = [string]$ReceiptData.liveOrigin.originId
        verificationLevel = [string]$ReceiptData.liveOrigin.verificationLevel
        runId = [string]$ReceiptData.captureRun.runId
        sessionId = [string]$ReceiptData.captureRun.sessionId
        imagePath = [string]$ReceiptData.image.path
        imageSha256 = [string]$ReceiptData.image.sha256
        everyElementAuditPath = [string]$ReceiptData.everyElementAudit.path
        everyElementAuditSha256 = [string]$ReceiptData.everyElementAudit.sha256
        approvedOutputManifestPath = [string]$ReceiptData.approvedOutputManifestPath
        approvedOutputManifestSha256 = Get-UIFileSha256 $manifestFull
        screenId = [string]$ReceiptData.captureTuple.screenId
        state = [string]$ReceiptData.captureTuple.state
        route = [string]$ReceiptData.captureTuple.route
        theme = [string]$ReceiptData.captureTuple.theme
        locale = [string]$ReceiptData.captureTuple.locale
        viewportWidth = [int]$ReceiptData.captureTuple.viewportWidth
        viewportHeight = [int]$ReceiptData.captureTuple.viewportHeight
        displayScale = $ReceiptData.captureTuple.displayScale
        headlessRoute = [string]$ReceiptData.captureTuple.headlessRoute
        networkIsolationMode = [string]$ReceiptData.captureTuple.networkIsolation.mode
        blockedExternalRequests = [bool]$ReceiptData.captureTuple.networkIsolation.blockedExternalRequests
        allowedOrigins = @($ReceiptData.captureTuple.networkIsolation.allowedOrigins)
        actionKind = [string]$ReceiptData.action.kind
        actionTarget = [string]$ReceiptData.action.target
        accessibleName = [string]$ReceiptData.action.accessibleName
        inputMethod = [string]$ReceiptData.action.inputMethod
        expectedBefore = [string]$ReceiptData.semanticState.expectedBefore
        expectedAfter = [string]$ReceiptData.semanticState.expectedAfter
    }
    foreach ($property in $expected.Keys) {
        if ($property -eq 'allowedOrigins') {
            if (-not (Test-UIExactSequence @($Row.allowedOrigins) @($expected.allowedOrigins))) { throw 'Ledger allowedOrigins differs from its receipt.' }
        } elseif ((Get-UICanonicalJson $Row.$property) -cne (Get-UICanonicalJson $expected[$property])) {
            throw 'Ledger identity field differs from its receipt.'
        }
    }
}

foreach ($row in $rows) {
    $receiptFull = Resolve-UIEvidencePath -EvidenceRoot $canonicalEvidenceRoot -Path ([string]$row.receiptPath)
    if ((Get-UIFileSha256 $receiptFull) -cne [string]$row.receiptSha256) { throw 'Ledger receipt hash is stale.' }
    $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'validate-ui-drive-receipt.ps1'), '-Receipt', $receiptFull, '-Inventory', $Inventory, '-SceneRegistry', $SceneRegistry, '-Authority', $Authority, '-EvidenceRoot', $canonicalEvidenceRoot, '-RepositoryRoot', $RepositoryRoot, '-StructuralOnly')
    if (-not [string]::IsNullOrWhiteSpace($VocabularySource)) { $arguments += @('-VocabularySource', $VocabularySource) }
    & powershell.exe @arguments 1>$null 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Ledger contains a receipt whose evidence chain is no longer valid.' }
    $receiptData = Read-UIValidatedJson -Path $receiptFull -SchemaPath (Join-Path $schemaRoot 'click-receipt.schema.json') -MaxBytes 1048576 -MaxDepth 24 -MaxStringLength 4096 -MaxArrayLength 10000 -MaxObjectProperties 128
    Assert-LedgerRowMatchesReceipt $row $receiptData $receiptFull
}

$verifiedSceneIds = @($registryData.scenes | Where-Object status -CEQ 'verified' | ForEach-Object { [string]$_.id })
if($rows.Count -gt 0 -and $verifiedSceneIds.Count -gt 0){throw 'Static records cannot promote a registry scene to verified.'}

$requiredCaptured = [Collections.Generic.List[string]]::new()
foreach ($surface in @($inventoryData.surfaces)) {
    foreach ($feature in @($surface.features | Where-Object status -CEQ 'verified')) {
        foreach ($interaction in @($feature.requiredInteractions)) { $requiredCaptured.Add("$($surface.id)|$($feature.id)||$($interaction.id)") }
        if (@($feature.evidenceReceipts).Count -ne @($feature.requiredInteractions).Count) { throw 'Verified feature receipt count differs from its required interactions.' }
    }
    foreach ($destination in @($surface.destinations | Where-Object status -CEQ 'verified')) {
        foreach ($interactionId in @($destination.requiredInteractionIds)) { $requiredCaptured.Add("$($surface.id)||$($destination.id)|$interactionId") }
    }
}
$actualCaptured = @($rows | ForEach-Object { "$($_.surfaceId)|$($_.featureId)|$($_.destinationId)|$($_.interactionId)" })
if($rows.Count -gt 0 -and $requiredCaptured.Count -gt 0){throw 'Static records cannot promote an inventory interaction to verified.'}
if($rows.Count -eq 0 -and $requiredCaptured.Count -gt 0){throw 'Verified inventory interaction has no live ledger row.'}

if (-not [string]::IsNullOrWhiteSpace($Receipt)) {
    $receiptFull = Resolve-UIEvidencePath -EvidenceRoot $canonicalEvidenceRoot -Path $Receipt
    $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'validate-ui-drive-receipt.ps1'), '-Receipt', $receiptFull, '-Inventory', $Inventory, '-SceneRegistry', $SceneRegistry, '-Authority', $Authority, '-EvidenceRoot', $canonicalEvidenceRoot, '-RepositoryRoot', $RepositoryRoot, '-StructuralOnly')
    if (-not [string]::IsNullOrWhiteSpace($VocabularySource)) { $arguments += @('-VocabularySource', $VocabularySource) }
    & powershell.exe @arguments 1>$null 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Requested receipt did not pass complete evidence verification.' }
}

if($rows.Count -gt 0){Write-Output "STRUCTURAL_ONLY: $($rows.Count) durable row(s) are structurally consistent; static verification cannot promote live origin.";exit 2}
Write-Output 'PASS: draft-2020-12 schemas, separate fixed authority, 70-scene status, and the empty ledger are fail-closed without invoking the live driver.'
