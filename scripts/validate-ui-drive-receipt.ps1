[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string]$Receipt,
    [string]$Inventory = '.codex/verification/ui-drive/inventory.json',
    [string]$SceneRegistry = '.codex/verification/ui-drive/scene-registry.json',
    [string]$Authority = '.codex/verification/ui-drive/authority.json',
    [string]$EvidenceRoot = '.codex/verification/evidence',
    [string]$RepositoryRoot,
    [string]$VocabularySource
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($RepositoryRoot)) { $RepositoryRoot = Split-Path (Split-Path $MyInvocation.MyCommand.Path -Parent) -Parent }
. (Join-Path $PSScriptRoot 'ui-drive-evidence-lib.ps1')
$schemaRoot = Join-Path $RepositoryRoot '.codex/verification/ui-drive'
$canonicalEvidenceRoot = [IO.Path]::GetFullPath((Join-Path $RepositoryRoot '.codex/verification/evidence'))
if ([IO.Path]::GetFullPath($EvidenceRoot) -cne $canonicalEvidenceRoot) { throw 'Receipt verification requires the exact canonical evidence root.' }
[void](Assert-UIPathHasNoReparsePoint -Path $canonicalEvidenceRoot)

$inventoryData = Read-UIValidatedJson -Path $Inventory -SchemaPath (Join-Path $schemaRoot 'inventory.schema.json') -MaxBytes 1048576 -MaxDepth 24 -MaxStringLength 4096 -MaxArrayLength 10000 -MaxObjectProperties 128
$sceneData = Read-UIValidatedJson -Path $SceneRegistry -SchemaPath (Join-Path $schemaRoot 'scene-registry.schema.json') -MaxBytes 1048576 -MaxDepth 24 -MaxStringLength 4096 -MaxArrayLength 10000 -MaxObjectProperties 128
[void](Read-UIValidatedJson -Path $Authority -SchemaPath (Join-Path $schemaRoot 'authority.schema.json') -MaxBytes 1048576 -MaxDepth 12 -MaxStringLength 512 -MaxArrayLength 100 -MaxObjectProperties 16)

$receiptFull = Resolve-UIEvidencePath -EvidenceRoot $canonicalEvidenceRoot -Path $Receipt
$receiptData = Read-UIValidatedJson -Path $receiptFull -SchemaPath (Join-Path $schemaRoot 'click-receipt.schema.json') -MaxBytes 1048576 -MaxDepth 24 -MaxStringLength 4096 -MaxArrayLength 10000 -MaxObjectProperties 128
$manifestFull = Resolve-UIEvidencePath -EvidenceRoot $canonicalEvidenceRoot -Path ([string]$receiptData.approvedOutputManifestPath)
$manifestData = Read-UIValidatedJson -Path $manifestFull -SchemaPath (Join-Path $schemaRoot 'approved-output-manifest.schema.json') -MaxBytes 1048576 -MaxDepth 16 -MaxStringLength 1024 -MaxArrayLength 32 -MaxObjectProperties 64

if ($manifestData.receiptId -cne $receiptData.receiptId -or $manifestData.sourceCommit -cne $receiptData.sourceCommit -or $manifestData.artifactSha256 -cne $receiptData.artifact.sha256) { throw 'Approved output manifest identity differs from the receipt.' }
$entryByKind = @{}
foreach ($entry in @($manifestData.entries)) {
    if ($entryByKind.ContainsKey([string]$entry.kind)) { throw 'Approved output manifest repeats an evidence kind.' }
    $entryByKind[[string]$entry.kind] = $entry
    $entryFull = Resolve-UIEvidencePath -EvidenceRoot $canonicalEvidenceRoot -Path ([string]$entry.relativePath)
    if (-not (Test-Path -LiteralPath $entryFull -PathType Leaf)) { throw 'Approved output manifest names a missing output.' }
    $item = Get-Item -LiteralPath $entryFull -Force
    if ([int64]$entry.bytes -ne [int64]$item.Length -or [string]$entry.sha256 -cne (Get-UIFileSha256 $entryFull)) { throw 'Approved output manifest hash or byte count is stale.' }
}
foreach ($kind in @('receipt', 'image', 'artifact', 'artifact-provenance', 'capture-run', 'every-element-audit')) { if (-not $entryByKind.ContainsKey($kind)) { throw 'Approved output manifest is incomplete.' } }
if ($entryByKind.Count -ne 6) { throw 'Approved output manifest contains an unapproved output kind.' }

$rootPrefix = $canonicalEvidenceRoot.TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar
function Relative-UIEvidencePath([string]$FullPath) { return ([IO.Path]::GetFullPath($FullPath).Substring($rootPrefix.Length).Replace('\','/')) }
if ([string]$entryByKind.receipt.relativePath -cne (Relative-UIEvidencePath $receiptFull)) { throw 'Manifest receipt path differs from the verified receipt.' }
if ([string]$entryByKind.receipt.sha256 -cne (Get-UIFileSha256 $receiptFull)) { throw 'Manifest receipt hash differs from the verified receipt.' }

Assert-UIGitCommit -RepositoryRoot $RepositoryRoot -Commit ([string]$receiptData.sourceCommit) -RequireAncestorOfHead
Assert-UIGitCommit -RepositoryRoot $RepositoryRoot -Commit ([string]$receiptData.artifact.builtFromCommit) -RequireAncestorOfHead
if ($receiptData.artifact.builtFromCommit -cne $receiptData.sourceCommit) { throw 'Artifact builtFromCommit does not equal the intended source commit.' }

$artifactFull = Resolve-UIEvidencePath -EvidenceRoot $canonicalEvidenceRoot -Path ([string]$receiptData.artifact.path)
$provenanceFull = Resolve-UIEvidencePath -EvidenceRoot $canonicalEvidenceRoot -Path ([string]$receiptData.artifact.provenancePath)
$runFull = Resolve-UIEvidencePath -EvidenceRoot $canonicalEvidenceRoot -Path ([string]$receiptData.captureRun.path)
$imageFull = Resolve-UIEvidencePath -EvidenceRoot $canonicalEvidenceRoot -Path ([string]$receiptData.image.path)
$auditFull = Resolve-UIEvidencePath -EvidenceRoot $canonicalEvidenceRoot -Path ([string]$receiptData.everyElementAudit.path)

$expectedPaths = @{
    artifact = Relative-UIEvidencePath $artifactFull
    'artifact-provenance' = Relative-UIEvidencePath $provenanceFull
    'capture-run' = Relative-UIEvidencePath $runFull
    image = Relative-UIEvidencePath $imageFull
    'every-element-audit' = Relative-UIEvidencePath $auditFull
}
foreach ($kind in $expectedPaths.Keys) {
    if ([string]$entryByKind[$kind].relativePath -cne [string]$expectedPaths[$kind]) { throw 'Receipt path differs from the approved output manifest.' }
}
$expectedReceiptPath = "receipts/$($receiptData.receiptId).json"
$expectedRunPath = "runs/$($receiptData.captureRun.runId).json"
$expectedAuditPath = "audits/$($receiptData.everyElementAudit.auditId).json"
$expectedImagePath = 'images/{0}/{1:D4}-{2}.png' -f $receiptData.captureRun.runId,[int]$receiptData.sequence,$receiptData.sceneId
$expectedProvenancePath = "provenance/$($receiptData.artifact.sha256).artifact-provenance.json"
$expectedManifestPath = "manifests/$($receiptData.receiptId).approved-outputs.json"
if ((Relative-UIEvidencePath $receiptFull) -cne $expectedReceiptPath -or (Relative-UIEvidencePath $runFull) -cne $expectedRunPath -or (Relative-UIEvidencePath $auditFull) -cne $expectedAuditPath -or (Relative-UIEvidencePath $imageFull) -cne $expectedImagePath -or (Relative-UIEvidencePath $provenanceFull) -cne $expectedProvenancePath -or (Relative-UIEvidencePath $manifestFull) -cne $expectedManifestPath) { throw 'Evidence output path does not use its fixed receipt-backed namespace.' }
$artifactRelative = Relative-UIEvidencePath $artifactFull
if ($artifactRelative -notmatch ('^artifacts/' + [regex]::Escape([string]$receiptData.artifact.sha256) + '/[^/]+$')) { throw 'Artifact path is not namespaced by its exact hash.' }
if ((Get-UIFileSha256 $artifactFull) -cne $receiptData.artifact.sha256 -or [string]$entryByKind.artifact.sha256 -cne $receiptData.artifact.sha256) { throw 'Artifact hash does not match its receipt and manifest.' }
if ((Get-UIFileSha256 $provenanceFull) -cne $receiptData.artifact.provenanceSha256 -or [string]$entryByKind['artifact-provenance'].sha256 -cne $receiptData.artifact.provenanceSha256) { throw 'Artifact provenance hash does not match its receipt and manifest.' }
if ((Get-UIFileSha256 $runFull) -cne $receiptData.captureRun.sha256 -or [string]$entryByKind['capture-run'].sha256 -cne $receiptData.captureRun.sha256) { throw 'Capture-run hash does not match its receipt and manifest.' }
if ((Get-UIFileSha256 $imageFull) -cne $receiptData.image.sha256 -or [string]$entryByKind.image.sha256 -cne $receiptData.image.sha256) { throw 'Image hash does not match its receipt and manifest.' }
if ((Get-UIFileSha256 $auditFull) -cne $receiptData.everyElementAudit.sha256 -or [string]$entryByKind['every-element-audit'].sha256 -cne $receiptData.everyElementAudit.sha256) { throw 'Every-element audit hash does not match its receipt and manifest.' }

$provenance = Read-UIValidatedJson -Path $provenanceFull -SchemaPath (Join-Path $schemaRoot 'artifact-provenance.schema.json') -MaxBytes 1048576 -MaxDepth 12 -MaxStringLength 1024 -MaxArrayLength 32 -MaxObjectProperties 32
if ($provenance.artifactPath -cne (Relative-UIEvidencePath $artifactFull) -or $provenance.artifactSha256 -cne $receiptData.artifact.sha256 -or [int64]$provenance.artifactBytes -ne (Get-Item -LiteralPath $artifactFull).Length) { throw 'Artifact provenance is not bound to the captured artifact.' }
if ($provenance.builtFromCommit -cne $receiptData.sourceCommit -or $provenance.intendedSourceCommit -cne $receiptData.sourceCommit -or $provenance.commitPolicy -cne 'exact-equality-and-ancestor-of-verification-head') { throw 'Artifact provenance does not implement the exact intended-commit policy.' }

$run = Read-UIValidatedJson -Path $runFull -SchemaPath (Join-Path $schemaRoot 'capture-run.schema.json') -MaxBytes 1048576 -MaxDepth 20 -MaxStringLength 4096 -MaxArrayLength 120 -MaxObjectProperties 64
$driverFull = Assert-UIPathHasNoReparsePoint -Path (Join-Path $RepositoryRoot ([string]$run.generator.scriptPath))
if ([string]$run.generator.scriptPath -cne 'scripts/write-approved-ui-drive-capture-run.ps1' -or [string]$run.generator.scriptSha256 -cne (Get-UIFileSha256 $driverFull)) { throw 'Capture run was not generated by the current approved driver.' }
if ($run.captureRoute -cne 'cheap-lowlevel-headless' -or $run.sourceCommit -cne $receiptData.sourceCommit -or $run.artifactSha256 -cne $receiptData.artifact.sha256) { throw 'Capture run route or source identity differs from the receipt.' }
if ($run.runId -cne $receiptData.captureRun.runId -or $run.sessionId -cne $receiptData.captureRun.sessionId) { throw 'Capture run or session identity differs from the receipt.' }
if ($run.receipt.id -cne $receiptData.receiptId -or $run.receipt.path -cne (Relative-UIEvidencePath $receiptFull)) { throw 'Capture run is not bound to the exact receipt.' }
if ($run.originalImage.path -cne (Relative-UIEvidencePath $imageFull) -or $run.originalImage.sha256 -cne $receiptData.image.sha256) { throw 'Capture run is not bound to the original image.' }
if ($run.target.processImagePath -cne (Relative-UIEvidencePath $artifactFull) -or $run.target.processImageSha256 -cne $receiptData.artifact.sha256 -or $run.target.windowWidth -lt 1 -or $run.target.windowHeight -lt 1) { throw 'Capture run target process or window identity is invalid.' }
if ($run.interaction.sceneId -cne $receiptData.sceneId -or $run.interaction.interactionId -cne $receiptData.interactionId -or [int]$run.interaction.sequence -ne [int]$receiptData.sequence -or $run.interaction.kind -cne $receiptData.action.kind -or $run.interaction.target -cne $receiptData.action.target -or $run.interaction.accessibleName -cne $receiptData.action.accessibleName -or $run.interaction.inputMethod -cne $receiptData.action.inputMethod) { throw 'Capture run action identity differs from the receipt.' }
$lastPoll = @($run.semanticPolls)[-1]
if ([int]$lastPoll.ordinal -ne [int]$receiptData.semanticState.poll.attempts -or [int]$lastPoll.elapsedMs -ne [int]$receiptData.semanticState.poll.elapsedMs -or $lastPoll.method -cne $receiptData.semanticState.poll.method -or $lastPoll.observedState -cne $receiptData.semanticState.observedAfter) { throw 'Capture run semantic polls differ from the receipt.' }

$audit = Read-UIValidatedJson -Path $auditFull -SchemaPath (Join-Path $schemaRoot 'every-element-audit.schema.json') -MaxBytes 4194304 -MaxDepth 20 -MaxStringLength 4096 -MaxArrayLength 100000 -MaxObjectProperties 64
if ($audit.auditId -cne $receiptData.everyElementAudit.auditId -or $audit.surfaceId -cne $receiptData.surfaceId -or $audit.sceneId -cne $receiptData.sceneId -or $audit.sourceCommit -cne $receiptData.sourceCommit -or $audit.artifactSha256 -cne $receiptData.artifact.sha256 -or $audit.runId -cne $receiptData.captureRun.runId) { throw 'Every-element audit identity differs from the receipt.' }
if ([int]$audit.requiredElementCount -ne [int]$audit.auditedElementCount -or [int]$audit.auditedElementCount -ne @($audit.elements).Count -or @($audit.missingElementIds).Count -ne 0) { throw 'Every-element audit is incomplete.' }
$elementIds = @($audit.elements | ForEach-Object { [string]$_.elementId })
if (@($elementIds | Sort-Object -Unique).Count -ne $elementIds.Count) { throw 'Every-element audit repeats an element identity.' }

$surface = @($inventoryData.surfaces | Where-Object id -ceq $receiptData.surfaceId)
if ($surface.Count -ne 1) { throw 'Receipt surface is not an exact inventory identity.' }
$hasFeature = $null -ne $receiptData.featureId
$hasDestination = $null -ne $receiptData.destinationId
if ($hasFeature -eq $hasDestination) { throw 'Receipt must bind exactly one feature or destination.' }
$receiptRelative = Relative-UIEvidencePath $receiptFull
$scene = @($sceneData.scenes | Where-Object id -ceq $receiptData.sceneId)
if ($scene.Count -ne 1 -or $scene[0].status -notin @('partial', 'verified') -or $scene[0].surfaceId -cne $receiptData.surfaceId -or $scene[0].featureId -cne $receiptData.featureId -or $scene[0].destinationId -cne $receiptData.destinationId) { throw 'Receipt scene is not exactly one capture-ready registry scene.' }
if ($hasFeature) {
    $feature = @($surface[0].features | Where-Object id -ceq $receiptData.featureId)
    if ($feature.Count -ne 1 -or $feature[0].status -notin @('partial', 'verified')) { throw 'Receipt feature is not exactly one capture-ready inventory feature.' }
    if ($feature[0].status -ceq 'verified' -and @($feature[0].evidenceReceipts | Where-Object { $_ -ceq $receiptRelative }).Count -ne 1) { throw 'Verified feature does not bind the exact receipt path.' }
    $interaction = @($feature[0].requiredInteractions | Where-Object id -ceq $receiptData.interactionId)
    if ($interaction.Count -ne 1 -or $interaction[0].sceneId -cne $receiptData.sceneId) { throw 'Receipt is not bound to one exact feature interaction and scene.' }
    if ($interaction[0].action -cne $receiptData.action.kind -or $interaction[0].target -cne $receiptData.action.target -or $interaction[0].accessibleName -cne $receiptData.action.accessibleName -or $interaction[0].inputMethod -cne $receiptData.action.inputMethod -or $interaction[0].expectedBefore -cne $receiptData.semanticState.expectedBefore -or $interaction[0].expectedAfter -cne $receiptData.semanticState.expectedAfter) { throw 'Receipt action or semantic contract differs from the inventory.' }
    if (-not (Test-UIExactSequence @($interaction[0].networkIsolation.allowedOrigins) @($receiptData.captureTuple.networkIsolation.allowedOrigins))) { throw 'Receipt allowedOrigins differs from the inventory.' }
} else {
    $destination = @($surface[0].destinations | Where-Object id -ceq $receiptData.destinationId)
    if ($destination.Count -ne 1 -or $destination[0].status -notin @('partial', 'verified') -or @($destination[0].requiredInteractionIds | Where-Object { $_ -ceq $receiptData.interactionId }).Count -ne 1) { throw 'Receipt destination is not exactly one capture-ready destination interaction.' }
    if ($scene[0].actionTarget -cne $receiptData.action.target -or $scene[0].accessibleName -cne $receiptData.action.accessibleName -or $scene[0].inputMethod -cne $receiptData.action.inputMethod -or $scene[0].expectedBefore -cne $receiptData.semanticState.expectedBefore -or $scene[0].expectedAfter -cne $receiptData.semanticState.expectedAfter) { throw 'Destination receipt action or semantic contract differs from its scene.' }
}
foreach ($field in @('screenId', 'state', 'route', 'theme', 'locale', 'viewportWidth', 'viewportHeight', 'displayScale', 'headlessRoute')) { if ($scene[0].tuple.$field -cne $receiptData.captureTuple.$field) { throw 'Receipt capture tuple differs from the scene.' } }
if ($scene[0].tuple.networkIsolation.mode -cne $receiptData.captureTuple.networkIsolation.mode -or $scene[0].tuple.networkIsolation.blockedExternalRequests -ne $receiptData.captureTuple.networkIsolation.blockedExternalRequests -or -not (Test-UIExactSequence @($scene[0].tuple.networkIsolation.allowedOrigins) @($receiptData.captureTuple.networkIsolation.allowedOrigins))) { throw 'Receipt network isolation tuple differs from the scene.' }

$inspectionJson = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'inspect-ui-drive-image.ps1') -ImagePath $imageFull 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Independent original-image inspection failed.' }
$actualImage = $inspectionJson | ConvertFrom-Json
foreach ($field in @('sha256', 'bytes', 'width', 'height', 'pixels', 'format', 'contentVerdict')) { if ($actualImage.$field -cne $receiptData.image.$field) { throw 'Receipt image metadata differs from independent inspection.' } }

$privacyArguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'run-ui-drive-privacy.ps1'), '-EvidenceRoot', $canonicalEvidenceRoot, '-Manifest', $manifestFull)
if (-not [string]::IsNullOrWhiteSpace($VocabularySource)) { $privacyArguments += @('-VocabularySource', $VocabularySource) }
& powershell.exe @privacyArguments 1>$null 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Independent privacy scan rejected the complete approved output manifest.' }

Write-Output 'PASS: receipt is schema-valid and hash-bound to real Git commits, exact inventory and scene identities, approved-driver run facts, artifact provenance, original image, every-element audit, and fixed privacy-scanned outputs.'
