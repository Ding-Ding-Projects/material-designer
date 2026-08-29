param(
    [string]$UpstreamRepo = '',
    [switch]$PowerShell51
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$validator = Join-Path $repo 'scripts/verify-feature-lineage.py'
$inventory = Join-Path $repo '.codex/verification/feature-lineage/inventory.json'
$schema = Join-Path $repo '.codex/verification/feature-lineage/inventory.schema.json'
if ([string]::IsNullOrWhiteSpace($UpstreamRepo)) { $UpstreamRepo = Join-Path $repo 'vendor/open-design' }
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('feature-lineage-negative-' + [guid]::NewGuid().ToString('N'))
$mutated = Join-Path $tempRoot 'inventory.json'
$mutatedSchema = Join-Path $tempRoot 'inventory.schema.json'
New-Item -ItemType Directory -Path $tempRoot | Out-Null

function Write-Utf8NoBom([string]$Path, [string]$Text) {
    [IO.File]::WriteAllText($Path, $Text, (New-Object Text.UTF8Encoding($false)))
}
function Invoke-Validator([string]$InventoryPath, [string]$SchemaPath, [string]$SourcePath, [switch]$OmitSource) {
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        if ($OmitSource) { $script:ValidatorOutput = @(& py -3 $validator --inventory $InventoryPath --schema $SchemaPath --repo-root $repo 2>&1 | ForEach-Object { $_.ToString() }) }
        else { $script:ValidatorOutput = @(& py -3 $validator --inventory $InventoryPath --schema $SchemaPath --repo-root $repo --upstream-repo $SourcePath 2>&1 | ForEach-Object { $_.ToString() }) }
    } finally { $ErrorActionPreference = $previousPreference }
    $script:ValidatorOutput | Out-Host
    return [int]$LASTEXITCODE
}
function Prepare-Inventory([scriptblock]$Mutation) {
    Copy-Item -LiteralPath $inventory -Destination $mutated -Force
    Copy-Item -LiteralPath $schema -Destination $mutatedSchema -Force
    if ($null -ne $Mutation) {
        $doc = Get-Content -LiteralPath $mutated -Raw | ConvertFrom-Json
        & $Mutation $doc
        Write-Utf8NoBom $mutated ($doc | ConvertTo-Json -Depth 100)
    }
}
function Expect-Red([string]$Label, [string]$Expected, [scriptblock]$Mutation) {
    Prepare-Inventory $Mutation
    $code = Invoke-Validator $mutated $mutatedSchema $UpstreamRepo
    $output = $script:ValidatorOutput -join "`n"
    if ($code -eq 0 -or -not $output.Contains($Expected)) { throw "negative case did not produce expected reason: $Label, expected <$Expected>" }
    Write-Output "PASS: $Label turns red with the expected reason"
}
function Expect-Schema-Red([string]$Label, [string]$Expected, [scriptblock]$SchemaMutation, [scriptblock]$DataMutation) {
    Prepare-Inventory $DataMutation
    $schemaDoc = Get-Content -LiteralPath $mutatedSchema -Raw | ConvertFrom-Json
    & $SchemaMutation $schemaDoc
    Write-Utf8NoBom $mutatedSchema ($schemaDoc | ConvertTo-Json -Depth 100)
    $code = Invoke-Validator $mutated $mutatedSchema $UpstreamRepo
    $output = $script:ValidatorOutput -join "`n"
    if ($code -eq 0 -or -not $output.Contains($Expected)) { throw "schema case did not produce expected reason: $Label, expected <$Expected>" }
    Write-Output "PASS: $Label turns red with the expected reason"
}
try {
    if (-not (Test-Path -LiteralPath (Join-Path $UpstreamRepo '.git'))) { throw "exact upstream source is unavailable: $UpstreamRepo" }
    Expect-Red 'nonexistent referenced path' 'FAIL: surfaces[0].paths references a missing or non-file path: missing/feature-path.md' { param($doc) $doc.surfaces[0].paths = @('missing/feature-path.md') }
    Expect-Red 'path outside source boundary' 'FAIL: surfaces[0].paths escapes the source boundary: ../outside-feature-path.md' { param($doc) $doc.surfaces[0].paths = @('../outside-feature-path.md') }
    Expect-Red 'descendant-only path' 'FAIL: surfaces[57].paths references a missing or non-file path: site' { param($doc) $doc.surfaces[57].paths = @('site') }
    Expect-Red 'empty implementation object' 'FAIL: inventory.mainCustomFeatures[0].desktopImplementation is missing required field status' { param($doc) $doc.mainCustomFeatures[0].desktopImplementation = [pscustomobject]@{} }
    Expect-Red 'zero lineage SHA' 'FAIL: mainCustomFeatures[0].lineageCommits[0].sha is not a commit object' { param($doc) $doc.mainCustomFeatures[0].lineageCommits[0].sha = ('0' * 40) }
    Expect-Red 'unrelated existing lineage SHA' 'FAIL: mainCustomFeatures[0].lineageCommits[0].sha is not an ancestor of preservation-feature-history' { param($doc) $doc.mainCustomFeatures[0].lineageCommits[0].sha = 'c2f4c38fc95c0c55737d087e30a161ab042a1388' }
    Expect-Red 'wrong lineage source' 'FAIL: inventory.mainCustomFeatures[0].lineageCommits[0].source is outside schema enum' { param($doc) $doc.mainCustomFeatures[0].lineageCommits[0].source = 'upstream-target' }
    Expect-Red 'missing preservation ref' 'FAIL: preservation branch membership or order drifted' { param($doc) $doc.preservationBranches[0].branch = 'preservation/moved-ref' }
    Expect-Red 'subject mismatch' 'FAIL: upstream subject mismatch for a554d017c8fa12d8913354ba6cf792d26d0c3b54' { param($doc) $doc.lineageCommits[0].subject = 'wrong subject' }
    Prepare-Inventory $null; Write-Utf8NoBom $mutatedSchema '{'
    $code = Invoke-Validator $mutated $mutatedSchema $UpstreamRepo; $output = $script:ValidatorOutput -join "`n"
    if ($code -eq 0 -or -not $output.Contains('FAIL: schema syntax invalid')) { throw 'invalid schema syntax did not produce the expected reason' }
    Write-Output 'PASS: invalid schema syntax turns red with the expected reason'
    Expect-Schema-Red 'schema and data disagreement' 'FAIL: inventory.inventoryId disagrees with schema const' { param($schemaDoc) $schemaDoc.properties.inventoryId.const = 'other-inventory' } { param($doc) }
    Expect-Schema-Red 'unexpected nested property' 'FAIL: inventory.mainCustomFeatures[0].desktopImplementation has an unexpected nested property' { param($schemaDoc) } { param($doc) Add-Member -InputObject $doc.mainCustomFeatures[0].desktopImplementation -NotePropertyName extra -NotePropertyValue 'unexpected' }
    Expect-Schema-Red 'missing required nested field' 'FAIL: inventory.mainCustomFeatures[0].desktopImplementation is missing required field status' { param($schemaDoc) } { param($doc) $doc.mainCustomFeatures[0].desktopImplementation.PSObject.Properties.Remove('status') }
    Expect-Schema-Red 'handwritten check and schema divergence' 'FAIL: schema canonical feature IDs diverge from handwritten checks' { param($schemaDoc) $schemaDoc.properties.canonicalFeatureIds.const = @('wrong') } { param($doc) }
    Prepare-Inventory $null
    $code = Invoke-Validator $mutated $mutatedSchema $UpstreamRepo -OmitSource; $output = $script:ValidatorOutput -join "`n"
    if ($code -eq 0 -or -not $output.Contains('error: the following arguments are required: --upstream-repo')) { throw 'omitting the mandatory upstream source did not produce the expected argument error' }
    Write-Output 'PASS: omitting the mandatory upstream source turns red with the expected reason'
    $unavailable = Join-Path $tempRoot 'unavailable-source'; New-Item -ItemType Directory -Path $unavailable | Out-Null
    $code = Invoke-Validator $mutated $mutatedSchema $unavailable; $output = $script:ValidatorOutput -join "`n"
    if ($code -eq 0 -or -not $output.Contains('FAIL: upstream target source unavailable')) { throw 'unavailable upstream source did not produce the expected reason' }
    Write-Output 'PASS: unavailable upstream target source turns red with the expected reason'
    Prepare-Inventory $null; $code = Invoke-Validator $mutated $mutatedSchema $UpstreamRepo
    if ($code -ne 0) { throw 'restoring the intact inventory did not return the validator to green' }
    Write-Output 'PASS: restoring every mutation returns the validator to green'
} finally { if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force } }
