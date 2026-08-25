[CmdletBinding()]
param(
    [string]$Inventory = ".codex/verification/ui-drive/inventory.json",
    [string]$Receipt
)

$ErrorActionPreference = "Stop"
$failures = [System.Collections.Generic.List[string]]::new()

function Add-Failure([string]$Message) {
    $script:failures.Add($Message)
}

function Has-Property($Object, [string]$Name) {
    return $null -ne $Object -and $null -ne $Object.PSObject.Properties[$Name]
}

function Require-Text($Object, [string]$Name, [string]$Context) {
    if (-not (Has-Property $Object $Name) -or [string]::IsNullOrWhiteSpace([string]$Object.$Name)) {
        Add-Failure "$Context is missing non-empty field '$Name'."
    }
}

function Assert-Exact-Ids($Actual, [string[]]$Expected, [string]$Context) {
    $actualIds = @($Actual | ForEach-Object { [string]$_.id })
    $duplicates = @($actualIds | Group-Object | Where-Object Count -ne 1 | ForEach-Object Name)
    if ($duplicates.Count -gt 0) {
        Add-Failure "$Context has duplicate ids: $($duplicates -join ', ')."
    }
    $missing = @($Expected | Where-Object { $_ -notin $actualIds })
    $extra = @($actualIds | Where-Object { $_ -notin $Expected })
    if ($missing.Count -gt 0) { Add-Failure "$Context is missing ids: $($missing -join ', ')." }
    if ($extra.Count -gt 0) { Add-Failure "$Context has unexpected ids: $($extra -join ', ')." }
}

if (-not (Test-Path -LiteralPath $Inventory -PathType Leaf)) {
    Write-Error "Inventory does not exist: $Inventory"
    exit 1
}

$inventoryRoot = (Resolve-Path -LiteralPath $Inventory).Path
$inventoryData = Get-Content -Raw -LiteralPath $inventoryRoot | ConvertFrom-Json

if ($inventoryData.version -ne 1) { Add-Failure "Inventory version must be exactly 1." }
if ($inventoryData.evidencePolicy -ne "fail-closed-real-built-artifact-only") {
    Add-Failure "Inventory evidencePolicy must fail closed on real built-artifact evidence."
}

$expectedSurfaceIds = @("windows-desktop-application", "documentation-site")
Assert-Exact-Ids @($inventoryData.surfaces) $expectedSurfaceIds "Surface inventory"

$requiredFeatures = @($inventoryData.requiredFeatureIds | ForEach-Object { [string]$_ })
if ($requiredFeatures.Count -lt 29) { Add-Failure "requiredFeatureIds must contain the complete hand-written baseline of at least 29 ids." }
if (@($requiredFeatures | Sort-Object -Unique).Count -ne $requiredFeatures.Count) { Add-Failure "requiredFeatureIds contains duplicates." }

$designParityPath = Join-Path (Split-Path (Split-Path $inventoryRoot -Parent) -Parent) "design-parity/inventory.json"
if (-not (Test-Path -LiteralPath $designParityPath -PathType Leaf)) {
    Add-Failure "The ten-row design-parity inventory is missing."
} else {
    $designParity = Get-Content -Raw -LiteralPath $designParityPath | ConvertFrom-Json
    $designIds = @($designParity.rows | ForEach-Object { [string]$_.id })
    $declaredDestinations = @($inventoryData.requiredDestinationIds | ForEach-Object { [string]$_ })
    if ($designIds.Count -ne 10) { Add-Failure "The design-parity input must contain exactly ten rows, found $($designIds.Count)." }
    if (@(Compare-Object ($designIds | Sort-Object) ($declaredDestinations | Sort-Object)).Count -ne 0) {
        Add-Failure "requiredDestinationIds must exactly match the ten explicit design-parity row ids."
    }
}

foreach ($surface in @($inventoryData.surfaces)) {
    $surfaceContext = "Surface '$($surface.id)'"
    foreach ($field in @("id", "kind", "status", "statusReason")) { Require-Text $surface $field $surfaceContext }
    if ($surface.status -notin @("unreachable", "partial", "verified")) { Add-Failure "$surfaceContext has invalid status '$($surface.status)'." }
    Assert-Exact-Ids @($surface.features) $requiredFeatures "$surfaceContext feature inventory"

    if ($surface.id -eq "windows-desktop-application") {
        $requiredDestinations = @($inventoryData.requiredDestinationIds | ForEach-Object { [string]$_ })
        Assert-Exact-Ids @($surface.destinations) $requiredDestinations "$surfaceContext destination inventory"
    } elseif (@($surface.destinations).Count -ne 0) {
        Add-Failure "$surfaceContext must not borrow desktop design-parity destinations."
    }

    foreach ($destination in @($surface.destinations)) {
        $context = "$surfaceContext destination '$($destination.id)'"
        Require-Text $destination "statusReason" $context
        if ($destination.status -notin @("unreachable", "partial", "verified")) { Add-Failure "$context has invalid status." }
        if (@($destination.requiredInteractionIds).Count -lt 1) { Add-Failure "$context has no required interaction ids." }
    }

    foreach ($feature in @($surface.features)) {
        $featureContext = "$surfaceContext feature '$($feature.id)'"
        foreach ($field in @("id", "status", "statusReason")) { Require-Text $feature $field $featureContext }
        foreach ($field in @("implementationPath", "documentationPath", "requiredInteractions", "evidenceReceipts")) {
            if (-not (Has-Property $feature $field)) { Add-Failure "$featureContext is missing field '$field'." }
        }
        if ($feature.status -notin @("absent", "unreachable", "partial", "verified")) { Add-Failure "$featureContext has invalid status '$($feature.status)'." }
        if (@($feature.requiredInteractions).Count -lt 1) { Add-Failure "$featureContext has no required interactions." }
        if ($feature.status -ne "verified" -and @($feature.evidenceReceipts).Count -ne 0) {
            Add-Failure "$featureContext cannot carry evidence receipts while status is '$($feature.status)'."
        }
        if ($feature.status -eq "verified" -and @($feature.evidenceReceipts).Count -lt 1) {
            Add-Failure "$featureContext is verified without a receipt."
        }
        $interactionIds = @()
        foreach ($interaction in @($feature.requiredInteractions)) {
            $interactionContext = "$featureContext interaction '$($interaction.id)'"
            foreach ($field in @("id", "action", "target", "expectedBefore", "expectedAfter")) { Require-Text $interaction $field $interactionContext }
            if (-not (Has-Property $interaction "postClickCaptureRequired") -or $interaction.postClickCaptureRequired -ne $true) {
                Add-Failure "$interactionContext must require one inspected screenshot after the interaction."
            }
            if ($interaction.action -notin @("click", "right-click", "keyboard", "type", "select", "upload", "drag")) {
                Add-Failure "$interactionContext has invalid action '$($interaction.action)'."
            }
            $interactionIds += [string]$interaction.id
        }
        if (@($interactionIds | Sort-Object -Unique).Count -ne $interactionIds.Count) { Add-Failure "$featureContext has duplicate interaction ids." }
    }
}

if (-not [string]::IsNullOrWhiteSpace($Receipt)) {
    if (-not (Test-Path -LiteralPath $Receipt -PathType Leaf)) {
        Add-Failure "Receipt does not exist: $Receipt"
    } else {
        $receiptData = Get-Content -Raw -LiteralPath $Receipt | ConvertFrom-Json
        foreach ($field in @("version", "inventoryVersion", "surfaceId", "featureId", "interactionId", "sequence", "sourceCommit", "artifact", "captureTuple", "action", "semanticState", "image", "privacy", "inspection")) {
            if (-not (Has-Property $receiptData $field)) { Add-Failure "Receipt is missing field '$field'." }
        }
        if ($receiptData.version -ne 1 -or $receiptData.inventoryVersion -ne 1) { Add-Failure "Receipt versions must be exactly 1." }
        if ([string]$receiptData.sourceCommit -notmatch '^[0-9a-f]{40}$') { Add-Failure "Receipt sourceCommit is not a full lowercase SHA." }
        if ($receiptData.artifact.sha256 -notmatch '^[0-9a-f]{64}$') { Add-Failure "Receipt artifact hash is invalid." }
        if ($receiptData.artifact.builtFromCommit -ne $receiptData.sourceCommit) { Add-Failure "Receipt artifact commit does not match sourceCommit." }
        if ($receiptData.captureTuple.headlessRoute -ne "cheap-lowlevel-headless") { Add-Failure "Receipt uses an unapproved interaction route." }
        if ($receiptData.action.completed -ne $true -or $receiptData.semanticState.matched -ne $true) { Add-Failure "Receipt does not prove a completed interaction and matched semantic state." }
        if ($receiptData.image.pngSignatureValid -ne $true -or $receiptData.image.nonblank -ne $true) { Add-Failure "Receipt does not prove a valid nonblank PNG." }
        if ($receiptData.privacy.checked -ne $true -or $receiptData.privacy.privateDataFound -ne $false -or $receiptData.privacy.unrelatedWindowsFound -ne $false) { Add-Failure "Receipt privacy verdict is not safe." }
        if ($receiptData.inspection.originalOpened -ne $true -or $receiptData.inspection.semanticStateConfirmed -ne $true -or $receiptData.inspection.clippingChecked -ne $true) { Add-Failure "Receipt lacks mandatory original-image inspection." }

        $surface = @($inventoryData.surfaces | Where-Object id -eq $receiptData.surfaceId)
        if ($surface.Count -ne 1) { Add-Failure "Receipt surfaceId is not an exact inventory row." }
        else {
            $feature = @($surface[0].features | Where-Object id -eq $receiptData.featureId)
            if ($feature.Count -ne 1) { Add-Failure "Receipt featureId is not an exact inventory row." }
            elseif (@($feature[0].requiredInteractions | Where-Object id -eq $receiptData.interactionId).Count -ne 1) { Add-Failure "Receipt interactionId is not an exact inventory interaction." }
        }
    }
}

if ($failures.Count -gt 0) {
    foreach ($failure in $failures) { Write-Error $failure }
    exit 1
}

Write-Output "PASS: UI drive inventory is fail-closed across 2 surfaces, $($requiredFeatures.Count) required features per surface, and 10 explicit desktop destinations."
if (-not [string]::IsNullOrWhiteSpace($Receipt)) { Write-Output "PASS: Per-click receipt is bound to an exact inventory interaction." }
exit 0
