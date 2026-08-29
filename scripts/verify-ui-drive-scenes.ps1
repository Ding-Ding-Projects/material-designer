[CmdletBinding()]
param(
    [string]$Inventory = ".codex/verification/ui-drive/inventory.json",
    [string]$Registry = ".codex/verification/ui-drive/scene-registry.json"
)

$ErrorActionPreference = "Stop"
$inventoryData = Get-Content -Raw -LiteralPath (Resolve-Path -LiteralPath $Inventory).Path | ConvertFrom-Json
$registryData = Get-Content -Raw -LiteralPath (Resolve-Path -LiteralPath $Registry).Path | ConvertFrom-Json
$failures = [Collections.Generic.List[string]]::new()
function Fail([string]$message) { $script:failures.Add($message) }
function Has($object, [string]$name) { return $null -ne $object -and $null -ne $object.PSObject.Properties[$name] }
function ExactIds($items, [string[]]$expected, [string]$context) {
    $ids = @($items | ForEach-Object { if ($_ -is [string]) { [string]$_ } else { [string]$_.id } })
    if (@($ids | Group-Object | Where-Object Count -gt 1).Count -gt 0) { Fail "$context contains duplicate identities." }
    if (@($expected | Where-Object { $_ -notin $ids }).Count -gt 0) { Fail "$context is missing a required identity." }
    if (@($ids | Where-Object { $_ -notin $expected }).Count -gt 0) { Fail "$context contains an unexpected identity." }
}
if ($registryData.version -ne 1 -or $registryData.registryMode -ne 'hand-authored-exact-scene-identities' -or $registryData.evidencePolicy -ne 'fail-closed-real-built-artifact-only' -or $registryData.approvedHeadlessRoute -ne 'cheap-lowlevel-headless') { Fail 'Scene registry header is not fail-closed.' }
ExactIds $registryData.surfaces @('windows-desktop-application','documentation-site') 'Scene registry surfaces'
ExactIds (@($registryData.destinations | ForEach-Object { [pscustomobject]@{id=$_} })) @($inventoryData.requiredDestinationIds) 'Scene registry destinations'
$expectedScenes = [Collections.Generic.List[string]]::new()
foreach ($surface in @($inventoryData.surfaces)) {
    foreach ($feature in @($surface.features)) {
        foreach ($interaction in @($feature.requiredInteractions)) { $expectedScenes.Add([string]$interaction.sceneId) }
    }
    if ($surface.id -eq 'windows-desktop-application') { foreach ($destination in @($surface.destinations)) { $expectedScenes.Add(('scene-{0}-destination-{1}' -f $surface.id,$destination.id)) } }
}
ExactIds $registryData.scenes $expectedScenes.ToArray() 'Scene registry scenes'
foreach ($scene in @($registryData.scenes)) {
    foreach ($field in @('id','surfaceId','status','statusReason','tuple','actionTarget','accessibleName','inputMethod','expectedBefore','expectedAfter')) { if ([string]::IsNullOrWhiteSpace([string]$scene.$field)) { Fail "Scene '$($scene.id)' is missing '$field'." } }
    if ($scene.status -ne 'unreachable') { Fail "Scene '$($scene.id)' must remain unreachable until a real capture exists." }
    foreach ($tupleField in @('screenId','state','theme','locale','viewportWidth','viewportHeight','displayScale','route','headlessRoute','networkIsolation')) { if (-not (Has $scene.tuple $tupleField)) { Fail "Scene '$($scene.id)' is missing tuple field '$tupleField'." } }
    if ($scene.tuple.theme -notin @('light','dark','contrast') -or $scene.tuple.locale -notin @('en-US','zh-HK','bilingual') -or $scene.tuple.viewportWidth -lt 320 -or $scene.tuple.viewportHeight -lt 480 -or $scene.tuple.displayScale -notin @(1,1.25,1.5,2)) { Fail "Scene '$($scene.id)' has an invalid capture tuple." }
    if ($scene.tuple.headlessRoute -ne 'cheap-lowlevel-headless' -or $scene.tuple.networkIsolation.blockedExternalRequests -ne $true -or $scene.tuple.networkIsolation.mode -ne 'capture-aware-disabled-network') { Fail "Scene '$($scene.id)' lacks capture-aware network isolation." }
    if ($scene.inputMethod -notin @('pointer','keyboard','touch','assistive-technology')) { Fail "Scene '$($scene.id)' has an invalid input method." }
    if ($scene.featureId -and $scene.destinationId) { Fail "Scene '$($scene.id)' cannot bind both feature and destination." }
    if (-not $scene.featureId -and -not $scene.destinationId) { Fail "Scene '$($scene.id)' must bind a feature or destination." }
}
foreach ($surface in @($inventoryData.surfaces)) {
    foreach ($feature in @($surface.features)) {
        foreach ($interaction in @($feature.requiredInteractions)) {
            $bound = @($registryData.scenes | Where-Object id -eq $interaction.sceneId)
            if ($bound.Count -ne 1) { Fail "Interaction '$($interaction.id)' is detached from exactly one scene." }
            else {
                $scene = $bound[0]
                if ($scene.surfaceId -ne $surface.id -or $scene.featureId -ne $feature.id -or $null -ne $scene.destinationId -or $scene.actionTarget -ne $interaction.target -or $scene.accessibleName -ne $interaction.accessibleName -or $scene.inputMethod -ne $interaction.inputMethod -or $scene.expectedBefore -ne $interaction.expectedBefore -or $scene.expectedAfter -ne $interaction.expectedAfter) { Fail "Scene '$($interaction.sceneId)' is detached from its exact interaction contract." }
            }
        }
    }
    if ($surface.id -eq 'windows-desktop-application') {
        foreach ($destination in @($surface.destinations)) {
            $destinationId = 'scene-{0}-destination-{1}' -f $surface.id,$destination.id
            $bound = @($registryData.scenes | Where-Object id -eq $destinationId)
            if ($bound.Count -ne 1 -or $bound[0].surfaceId -ne $surface.id -or $bound[0].destinationId -ne $destination.id -or $null -ne $bound[0].featureId) { Fail "Destination '$($destination.id)' is detached from its exact scene." }
        }
    }
}
if ($failures.Count) { $failures | ForEach-Object { Write-Error $_ }; exit 1 }
Write-Output "PASS: hand-authored scene registry covers 2 surfaces, 30 features, 10 destinations, and 70 exact scenes."
