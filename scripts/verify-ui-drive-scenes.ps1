[CmdletBinding()]
param(
    [string]$Inventory = '.codex/verification/ui-drive/inventory.json',
    [string]$Registry = '.codex/verification/ui-drive/scene-registry.json',
    [string]$Authority = '.codex/verification/ui-drive/authority.json',
    [string]$RepositoryRoot
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($RepositoryRoot)) { $RepositoryRoot = Split-Path (Split-Path $MyInvocation.MyCommand.Path -Parent) -Parent }
. (Join-Path $PSScriptRoot 'ui-drive-evidence-lib.ps1')
$schemaRoot = Join-Path $RepositoryRoot '.codex/verification/ui-drive'
$expectedAuthorityDigest = 'b13e803d5c8b3d42fc43ca6d290639eab5fe97d69890eaf6631e34720e0344ed'

$inventoryData = Read-UIValidatedJson -Path $Inventory -SchemaPath (Join-Path $schemaRoot 'inventory.schema.json') -MaxBytes 1048576 -MaxDepth 24 -MaxStringLength 4096 -MaxArrayLength 10000 -MaxObjectProperties 128
$registryData = Read-UIValidatedJson -Path $Registry -SchemaPath (Join-Path $schemaRoot 'scene-registry.schema.json') -MaxBytes 1048576 -MaxDepth 24 -MaxStringLength 4096 -MaxArrayLength 10000 -MaxObjectProperties 128
$authorityData = Read-UIValidatedJson -Path $Authority -SchemaPath (Join-Path $schemaRoot 'authority.schema.json') -MaxBytes 1048576 -MaxDepth 12 -MaxStringLength 512 -MaxArrayLength 100 -MaxObjectProperties 16
$authorityJson = Get-UICanonicalJson $authorityData
$authorityHashBytes = [Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($authorityJson))
$authorityDigest = ([BitConverter]::ToString($authorityHashBytes)).Replace('-', '').ToLowerInvariant()
if ($authorityDigest -cne $expectedAuthorityDigest) { throw 'Canonical UI-drive authority content differs from its independent digest.' }

function Assert-ExactIdentityList([object[]]$Actual, [object[]]$Expected, [string]$Context) {
    $actualStrings = @($Actual | ForEach-Object { [string]$_ })
    $expectedStrings = @($Expected | ForEach-Object { [string]$_ })
    if (@($actualStrings | Sort-Object -Unique).Count -ne $actualStrings.Count) { throw "$Context repeats an identity." }
    if (@(Compare-Object $actualStrings $expectedStrings -CaseSensitive).Count -ne 0) { throw "$Context differs from the separate hand-written authority." }
}

Assert-ExactIdentityList @($inventoryData.requiredFeatureIds) @($authorityData.featureIds) 'Inventory feature ids'
Assert-ExactIdentityList @($inventoryData.requiredDestinationIds) @($authorityData.destinationIds) 'Inventory destination ids'
Assert-ExactIdentityList @($inventoryData.surfaces | ForEach-Object { $_.id }) @($authorityData.surfaceIds) 'Inventory surface ids'
Assert-ExactIdentityList @($registryData.surfaces) @($authorityData.surfaceIds) 'Scene-registry surface ids'
Assert-ExactIdentityList @($registryData.destinations) @($authorityData.destinationIds) 'Scene-registry destination ids'
Assert-ExactIdentityList @($registryData.scenes | ForEach-Object { $_.id }) @($authorityData.sceneIds) 'Scene-registry scene ids'

foreach ($surface in @($inventoryData.surfaces)) {
    Assert-ExactIdentityList @($surface.features | ForEach-Object { $_.id }) @($authorityData.featureIds) "Surface feature ids"
    if ($surface.id -ceq 'windows-desktop-application') {
        Assert-ExactIdentityList @($surface.destinations | ForEach-Object { $_.id }) @($authorityData.destinationIds) 'Desktop destination ids'
    } elseif (@($surface.destinations).Count -ne 0) { throw 'Documentation surface must not borrow desktop destinations.' }
}

foreach ($scene in @($registryData.scenes)) {
    if (($null -ne $scene.featureId) -eq ($null -ne $scene.destinationId)) { throw 'Scene must bind exactly one feature or destination.' }
    if ($scene.status -ceq 'verified' -and [string]::IsNullOrWhiteSpace([string]$scene.statusReason)) { throw 'Captured scene lacks a verification reason.' }
    if ($scene.status -ne 'verified' -and $scene.statusReason -match '(?i)captured|verified receipt|completed capture') { throw 'Uncaptured scene status reason claims capture evidence.' }
}

foreach ($surface in @($inventoryData.surfaces)) {
    foreach ($feature in @($surface.features)) {
        foreach ($interaction in @($feature.requiredInteractions)) {
            $scene = @($registryData.scenes | Where-Object id -CEQ $interaction.sceneId)
            if ($scene.Count -ne 1) { throw 'Inventory interaction is detached from exactly one canonical scene.' }
            $scene = $scene[0]
            if ($scene.surfaceId -cne $surface.id -or $scene.featureId -cne $feature.id -or $null -ne $scene.destinationId) { throw 'Feature scene identity differs from its inventory binding.' }
            if ($scene.actionTarget -cne $interaction.target -or $scene.accessibleName -cne $interaction.accessibleName -or $scene.inputMethod -cne $interaction.inputMethod -or $scene.expectedBefore -cne $interaction.expectedBefore -or $scene.expectedAfter -cne $interaction.expectedAfter) { throw 'Feature scene interaction tuple differs from the inventory.' }
            if ($scene.tuple.networkIsolation.mode -cne $interaction.networkIsolation.mode -or $scene.tuple.networkIsolation.blockedExternalRequests -ne $interaction.networkIsolation.blockedExternalRequests -or -not (Test-UIExactSequence @($scene.tuple.networkIsolation.allowedOrigins) @($interaction.networkIsolation.allowedOrigins))) { throw 'Feature scene allowedOrigins or network-isolation tuple differs from the inventory.' }
            if ($scene.status -ceq 'verified' -and $feature.status -cne 'verified') { throw 'Captured scene belongs to an unverified feature.' }
        }
    }
    if ($surface.id -ceq 'windows-desktop-application') {
        foreach ($destination in @($surface.destinations)) {
            $sceneId = "scene-$($surface.id)-destination-$($destination.id)"
            $scene = @($registryData.scenes | Where-Object id -CEQ $sceneId)
            if ($scene.Count -ne 1 -or $scene[0].surfaceId -cne $surface.id -or $scene[0].destinationId -cne $destination.id -or $null -ne $scene[0].featureId) { throw 'Destination scene differs from its canonical inventory binding.' }
            if ($scene[0].status -ceq 'verified' -and $destination.status -cne 'verified') { throw 'Captured destination scene belongs to an unverified destination.' }
        }
    }
}

$capturedCount = @($registryData.scenes | Where-Object status -CEQ 'verified').Count
Write-Output "PASS: separate authority fixes 2 surfaces, 30 features, 10 destinations, and 70 scenes; $capturedCount scene(s) currently have coherent captured status."
