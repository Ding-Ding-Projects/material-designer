[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string]$Receipt,
    [string]$Inventory = ".codex/verification/ui-drive/inventory.json",
    [string]$SceneRegistry = ".codex/verification/ui-drive/scene-registry.json",
    [string]$EvidenceRoot = ".codex/verification/evidence"
)

$ErrorActionPreference = "Stop"
$failures = [Collections.Generic.List[string]]::new()
function Fail([string]$message) { $script:failures.Add($message) }
function Has($object, [string]$name) { return $null -ne $object -and $null -ne $object.PSObject.Properties[$name] }
function Required($object, [string[]]$names, [string]$context) { foreach ($name in $names) { if (-not (Has $object $name)) { Fail "$context is missing '$name'." } } }
function Within([string]$candidate, [string]$root) {
    $rootFull = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $root).Path).TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar
    $candidateFull = [IO.Path]::GetFullPath($candidate)
    return $candidateFull.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)
}

if (-not (Test-Path -LiteralPath $Receipt -PathType Leaf)) { Write-Error 'Receipt does not exist.'; exit 1 }
if (-not (Test-Path -LiteralPath $EvidenceRoot -PathType Container)) { Write-Error 'Evidence root does not exist.'; exit 1 }
$receiptFull = (Resolve-Path -LiteralPath $Receipt).Path
$inventoryData = Get-Content -Raw -LiteralPath (Resolve-Path -LiteralPath $Inventory).Path | ConvertFrom-Json
$sceneData = Get-Content -Raw -LiteralPath (Resolve-Path -LiteralPath $SceneRegistry).Path | ConvertFrom-Json
$receiptData = Get-Content -Raw -LiteralPath $receiptFull | ConvertFrom-Json

Required $receiptData @('version','inventoryVersion','receiptId','surfaceId','featureId','interactionId','sceneId','sequence','sourceCommit','artifact','captureTuple','action','semanticState','image','privacy','inspection') 'Receipt'
if ($receiptData.version -ne 2 -or $receiptData.inventoryVersion -ne 1) { Fail 'Receipt versions are not 2 and 1.' }
if ([string]$receiptData.receiptId -notmatch '^receipt-[a-z0-9]+(?:-[a-z0-9]+)*$') { Fail 'Receipt identity is invalid.' }
if ([string]$receiptData.sourceCommit -notmatch '^[0-9a-f]{40}$') { Fail 'Receipt sourceCommit is not a full lowercase SHA.' }
Required $receiptData.artifact @('path','sha256','builtFromCommit','kind','provenancePath') 'Receipt artifact'
if ($receiptData.artifact.kind -ne 'packaged-built-artifact') { Fail 'Receipt artifact is not a packaged built artifact.' }
if ([string]$receiptData.artifact.sha256 -notmatch '^[0-9a-f]{64}$') { Fail 'Receipt artifact hash is invalid.' }
if ($receiptData.artifact.builtFromCommit -ne $receiptData.sourceCommit) { Fail 'Artifact commit does not match sourceCommit.' }
if (-not (Test-Path -LiteralPath $receiptData.artifact.path -PathType Leaf)) { Fail 'Built artifact is not present.' }
if (-not (Test-Path -LiteralPath $receiptData.artifact.provenancePath -PathType Leaf)) { Fail 'Artifact provenance record is not present.' }
if ((Get-FileHash -LiteralPath $receiptData.artifact.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $receiptData.artifact.sha256) { Fail 'Built artifact hash does not match receipt.' }

Required $receiptData.captureTuple @('screenId','state','route','theme','locale','viewportWidth','viewportHeight','displayScale','headlessRoute','networkIsolation') 'Capture tuple'
if ($receiptData.captureTuple.headlessRoute -ne 'cheap-lowlevel-headless') { Fail 'Capture tuple uses an unapproved headless route.' }
if ($receiptData.captureTuple.networkIsolation.mode -ne 'capture-aware-disabled-network' -or $receiptData.captureTuple.networkIsolation.blockedExternalRequests -ne $true) { Fail 'Capture tuple does not prove disabled external network.' }
Required $receiptData.action @('kind','target','accessibleName','inputMethod','completed') 'Action'
Required $receiptData.semanticState @('expectedBefore','observedBefore','expectedAfter','observedAfter','poll','matched') 'Semantic state'
Required $receiptData.semanticState.poll @('completed','attempts','elapsedMs','method') 'Semantic poll'
if ($receiptData.action.completed -ne $true -or $receiptData.semanticState.matched -ne $true -or $receiptData.semanticState.poll.completed -ne $true) { Fail 'Receipt does not prove a completed semantic transition.' }
if ([int]$receiptData.semanticState.poll.attempts -lt 1 -or [int]$receiptData.semanticState.poll.attempts -gt 120) { Fail 'Semantic poll attempts are outside the bound.' }
if ([int]$receiptData.semanticState.poll.elapsedMs -lt 0 -or [int]$receiptData.semanticState.poll.elapsedMs -gt 120000) { Fail 'Semantic poll duration is outside the bound.' }

Required $receiptData.image @('path','sha256','width','height','pngSignatureValid','nonblank') 'Image'
if (-not (Within $receiptData.image.path $EvidenceRoot) -or -not (Within $receiptFull $EvidenceRoot)) { Fail 'Receipt or image path escapes the evidence root.' }
if (-not (Test-Path -LiteralPath $receiptData.image.path -PathType Leaf)) { Fail 'Captured image is not present.' }
if ([string]$receiptData.image.sha256 -notmatch '^[0-9a-f]{64}$') { Fail 'Captured image hash is invalid.' }
Required $receiptData.inspection @('originalOpened','semanticStateConfirmed','clippingChecked','visualDefectIds','originalImage','everyElementAuditPath') 'Inspection'
Required $receiptData.inspection.originalImage @('width','height','sha256','pngSignatureValid','nonblank') 'Original image inspection'
if (-not (Test-Path -LiteralPath $receiptData.inspection.everyElementAuditPath -PathType Leaf)) { Fail 'Every-element audit link is not present.' }
if ($receiptData.inspection.originalOpened -ne $true -or $receiptData.inspection.semanticStateConfirmed -ne $true -or $receiptData.inspection.clippingChecked -ne $true) { Fail 'Original-image inspection is incomplete.' }
if ($receiptData.image.pngSignatureValid -ne $true -or $receiptData.image.nonblank -ne $true) { Fail 'Receipt image flags do not prove a nonblank PNG.' }

Required $receiptData.privacy @('checked','privateDataFound','unrelatedWindowsFound') 'Privacy verdict'
if ($receiptData.privacy.checked -ne $true -or $receiptData.privacy.privateDataFound -ne $false -or $receiptData.privacy.unrelatedWindowsFound -ne $false) { Fail 'Privacy verdict is not safe.' }

$surface = @($inventoryData.surfaces | Where-Object id -eq $receiptData.surfaceId)
if ($surface.Count -ne 1) { Fail 'Receipt surfaceId is not an exact inventory identity.' }
else {
    $feature = @($surface[0].features | Where-Object id -eq $receiptData.featureId)
    if ($feature.Count -ne 1) { Fail 'Receipt featureId is not an exact inventory identity.' }
    else {
        if ($feature[0].status -ne 'verified') { Fail 'Receipt cannot be attached while its feature remains unverified.' }
        $interaction = @($feature[0].requiredInteractions | Where-Object id -eq $receiptData.interactionId)
        if ($interaction.Count -ne 1) { Fail 'Receipt interactionId is not an exact inventory identity.' }
        else {
            if ($interaction[0].sceneId -ne $receiptData.sceneId) { Fail 'Receipt sceneId does not match its interaction.' }
            if ($receiptData.action.kind -ne $interaction[0].action -or $receiptData.action.target -ne $interaction[0].target -or $receiptData.action.accessibleName -ne $interaction[0].accessibleName -or $receiptData.action.inputMethod -ne $interaction[0].inputMethod) { Fail 'Receipt action does not match its hand-written interaction.' }
            if ($receiptData.semanticState.expectedBefore -ne $interaction[0].expectedBefore -or $receiptData.semanticState.expectedAfter -ne $interaction[0].expectedAfter) { Fail 'Receipt semantic expectation does not match its interaction.' }
        }
    }
}
$scene = @($sceneData.scenes | Where-Object id -eq $receiptData.sceneId)
if ($scene.Count -ne 1) { Fail 'Receipt sceneId is stale or absent from the registry.' }
else {
    if ($scene[0].surfaceId -ne $receiptData.surfaceId -or $scene[0].featureId -ne $receiptData.featureId) { Fail 'Receipt scene binding does not match the inventory.' }
    foreach ($field in @('screenId','state','route','theme','locale','viewportWidth','viewportHeight','displayScale','headlessRoute')) { if ($receiptData.captureTuple.$field -ne $scene[0].tuple.$field) { Fail "Receipt tuple field '$field' differs from the scene." } }
}

if ($failures.Count) { $failures | ForEach-Object { Write-Error $_ }; exit 1 }
# Independent decoder/hash inspection is intentionally last, so invalid images never become evidence.
$inspectionJson = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'inspect-ui-drive-image.ps1') -ImagePath $receiptData.image.path 2>$null
if ($LASTEXITCODE -ne 0) { Write-Error 'Original image inspection failed.'; exit 1 }
$actual = $inspectionJson | ConvertFrom-Json
if ($actual.sha256 -ne $receiptData.image.sha256 -or $actual.width -ne $receiptData.image.width -or $actual.height -ne $receiptData.image.height -or $actual.pngSignatureValid -ne $true -or $actual.nonblank -ne $true) { Write-Error 'Receipt image metadata does not match independent original-image inspection.'; exit 1 }
if ($receiptData.inspection.originalImage.sha256 -ne $actual.sha256 -or $receiptData.inspection.originalImage.width -ne $actual.width -or $receiptData.inspection.originalImage.height -ne $actual.height -or $receiptData.inspection.originalImage.pngSignatureValid -ne $actual.pngSignatureValid -or $receiptData.inspection.originalImage.nonblank -ne $actual.nonblank) { Write-Error 'Original-image inspection record does not match the independent inspection.'; exit 1 }
$privacyScript = Join-Path $PSScriptRoot 'run-ui-drive-privacy.ps1'
$previousPreference = $ErrorActionPreference
try {
    $ErrorActionPreference = 'Continue'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $privacyScript -EvidenceRoot $EvidenceRoot -ApprovedFile @($receiptFull, $receiptData.image.path) 1>$null 2>$null
    $privacyExit = $LASTEXITCODE
} finally { $ErrorActionPreference = $previousPreference }
if ($privacyExit -ne 0) { Write-Error 'Independent privacy runner rejected the approved receipt or image output.'; exit 1 }
Write-Output 'PASS: receipt is bound to one exact scene, semantic poll, packaged build, inspected original PNG, privacy verdict, and every-element audit.'
