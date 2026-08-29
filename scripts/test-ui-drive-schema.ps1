[CmdletBinding()]
param(
    [string]$Root = ".codex/verification/ui-drive"
)

$ErrorActionPreference = 'Stop'
$schemaFiles = @('inventory.schema.json','click-receipt.schema.json','scene-registry.schema.json','ledger.schema.json')
foreach ($name in $schemaFiles) {
    $path = Join-Path $Root $name
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Schema is missing: $name" }
    $schema = Get-Content -Raw -LiteralPath $path | ConvertFrom-Json
    if ($schema.'$schema' -ne 'https://json-schema.org/draft/2020-12/schema' -or $schema.additionalProperties -ne $false) { throw "Schema is not strict draft 2020-12: $name" }
}
$inventory = Get-Content -Raw -LiteralPath (Join-Path $Root 'inventory.json') | ConvertFrom-Json
$registry = Get-Content -Raw -LiteralPath (Join-Path $Root 'scene-registry.json') | ConvertFrom-Json
$ledger = Get-Content -Raw -LiteralPath (Join-Path $Root 'ledger.json') | ConvertFrom-Json
if ($inventory.version -ne 1 -or $inventory.surfaces.Count -ne 2 -or $inventory.requiredFeatureIds.Count -ne 30 -or $inventory.requiredDestinationIds.Count -ne 10) { throw 'Inventory schema fixture counts are not exact.' }
if ($registry.version -ne 1 -or $registry.scenes.Count -ne 70 -or $registry.surfaces.Count -ne 2 -or $registry.destinations.Count -ne 10) { throw 'Scene registry schema fixture counts are not exact.' }
if ($ledger.version -ne 1 -or $ledger.rows.Count -ne 0) { throw 'Baseline ledger must remain an honest empty evidence ledger.' }
foreach ($surface in @($inventory.surfaces)) { foreach ($feature in @($surface.features)) { foreach ($interaction in @($feature.requiredInteractions)) { foreach ($field in @('accessibleName','inputMethod','sceneId','networkIsolation')) { if ([string]::IsNullOrWhiteSpace([string]$interaction.$field)) { throw "Interaction schema field missing: $field" } } } } }
Write-Output 'PASS: strict UI-drive schemas parse and the hand-written inventory, scene, and empty-ledger counts are exact.'
