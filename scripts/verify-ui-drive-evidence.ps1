[CmdletBinding()]
param(
    [string]$Inventory = ".codex/verification/ui-drive/inventory.json",
    [string]$Receipt,
    [string]$SceneRegistry = ".codex/verification/ui-drive/scene-registry.json",
    [string]$Ledger = ".codex/verification/ui-drive/ledger.json",
    [string]$EvidenceRoot = ".codex/verification/evidence"
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
            foreach ($field in @("id", "action", "target", "accessibleName", "inputMethod", "sceneId", "expectedBefore", "expectedAfter")) { Require-Text $interaction $field $interactionContext }
            if (-not (Has-Property $interaction "postClickCaptureRequired") -or $interaction.postClickCaptureRequired -ne $true) {
                Add-Failure "$interactionContext must require one inspected screenshot after the interaction."
            }
            if (-not (Has-Property $interaction "networkIsolation") -or $interaction.networkIsolation.mode -ne "capture-aware-disabled-network" -or $interaction.networkIsolation.blockedExternalRequests -ne $true) {
                Add-Failure "$interactionContext must declare capture-aware disabled-network isolation."
            }
            if ($interaction.action -notin @("click", "right-click", "keyboard", "type", "select", "upload", "drag")) {
                Add-Failure "$interactionContext has invalid action '$($interaction.action)'."
            }
            if ($interaction.inputMethod -notin @("pointer", "keyboard", "touch", "assistive-technology")) { Add-Failure "$interactionContext has invalid inputMethod." }
            $interactionIds += [string]$interaction.id
        }
        if (@($interactionIds | Sort-Object -Unique).Count -ne $interactionIds.Count) { Add-Failure "$featureContext has duplicate interaction ids." }
    }
}

if (-not (Test-Path -LiteralPath $SceneRegistry -PathType Leaf)) { Add-Failure "Scene registry does not exist." }
if (-not (Test-Path -LiteralPath $Ledger -PathType Leaf)) { Add-Failure "Append-only ledger does not exist." }

if ($failures.Count -eq 0) {
    $sceneVerifier = Join-Path $PSScriptRoot "verify-ui-drive-scenes.ps1"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $sceneVerifier -Inventory $Inventory -Registry $SceneRegistry 2>$null
    if ($LASTEXITCODE -ne 0) { Add-Failure "Scene registry verification failed." }
}

if (-not [string]::IsNullOrWhiteSpace($Receipt) -and $failures.Count -eq 0) {
    $receiptVerifier = Join-Path $PSScriptRoot "validate-ui-drive-receipt.ps1"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $receiptVerifier -Receipt $Receipt -Inventory $Inventory -SceneRegistry $SceneRegistry -EvidenceRoot $EvidenceRoot 2>$null
    if ($LASTEXITCODE -ne 0) { Add-Failure "Receipt verification failed." }
}

if ((Test-Path -LiteralPath $Ledger -PathType Leaf) -and $failures.Count -eq 0) {
    $ledgerData = Get-Content -Raw -LiteralPath $Ledger | ConvertFrom-Json
    if ($ledgerData.version -ne 1 -or $ledgerData.inventoryVersion -ne 1 -or $ledgerData.ledgerMode -ne "append-only-one-receipt-per-interaction") { Add-Failure "Ledger header is invalid." }
    $rows = @($ledgerData.rows)
    for ($n = 0; $n -lt $rows.Count; $n++) { if ([int]$rows[$n].sequence -ne ($n + 1)) { Add-Failure "Ledger sequence is not contiguous." } }
    if (@($rows | Group-Object receiptId | Where-Object Count -gt 1).Count -gt 0) { Add-Failure "Ledger contains duplicate receipt identities." }
    if (@($rows | Group-Object interactionId | Where-Object Count -gt 1).Count -gt 0) { Add-Failure "Ledger contains duplicate interaction identities." }
    $receiptIds = @($rows | ForEach-Object { [string]$_.receiptId })
    foreach ($row in $rows) {
        $match = @($inventoryData.surfaces | Where-Object id -eq $row.surfaceId | ForEach-Object { $_.features } | Where-Object id -eq $row.featureId | ForEach-Object { $_.requiredInteractions } | Where-Object id -eq $row.interactionId)
        if ($match.Count -ne 1 -or $match[0].sceneId -ne $row.sceneId) { Add-Failure "Ledger row is not bound to one exact inventory interaction and scene." }
    }
    $inventoryInteractionCount = @($inventoryData.surfaces | ForEach-Object { $_.features } | ForEach-Object { $_.requiredInteractions }).Count
    $verifiedInteractionCount = @($inventoryData.surfaces | ForEach-Object { $_.features } | Where-Object status -eq "verified" | ForEach-Object { $_.requiredInteractions }).Count
    if ($rows.Count -gt $verifiedInteractionCount) { Add-Failure "Ledger has more receipts than verified inventory interactions." }
    if ($verifiedInteractionCount -gt 0 -and $rows.Count -ne $verifiedInteractionCount) { Add-Failure "Ledger has one-to-one gaps for verified interactions." }
}

if ($failures.Count -gt 0) {
    foreach ($failure in $failures) { Write-Error $failure }
    exit 1
}

Write-Output "PASS: UI drive inventory, 70-scene registry, and append-only ledger contract are fail-closed across 2 surfaces, $($requiredFeatures.Count) required features per surface, and 10 explicit desktop destinations."
if (-not [string]::IsNullOrWhiteSpace($Receipt)) { Write-Output "PASS: Per-click receipt is bound to an exact scene and inventory interaction." }
exit 0
