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
    $internalLink = Join-Path $repo 'scripts/.feature-lineage-internal-link'
    $junction = Join-Path $repo 'scripts/.feature-lineage-directory-junction'
    $externalTarget = Join-Path $tempRoot 'external-target.txt'
    $externalLink = Join-Path $repo 'scripts/.feature-lineage-external-link'
    Write-Utf8NoBom $externalTarget 'external probe target'
    $symbolicLinksAvailable = $true
    try {
        New-Item -ItemType SymbolicLink -Path $internalLink -Target (Join-Path $repo 'scripts/verify-feature-lineage.py') | Out-Null
        New-Item -ItemType SymbolicLink -Path $externalLink -Target $externalTarget | Out-Null
    } catch {
        $symbolicLinksAvailable = $false
        Write-Output 'SKIP: symbolic-link cases unavailable under this PowerShell privilege profile'
    }
    $junctionOutput = cmd.exe /d /c mklink /J "$junction" "$(Join-Path $repo 'docs')"
    if ($LASTEXITCODE -ne 0) { throw "directory junction creation failed: $junctionOutput" }
    Expect-Red 'nonexistent referenced path' 'FAIL: surfaces[0].paths references a missing or non-file path: missing/feature-path.md' { param($doc) $doc.surfaces[0].paths = @('missing/feature-path.md') }
    Expect-Red 'path outside source boundary' 'FAIL: surfaces[0].paths escapes the source boundary: ../outside-feature-path.md' { param($doc) $doc.surfaces[0].paths = @('../outside-feature-path.md') }
    Expect-Red 'descendant-only path' 'FAIL: surfaces[57].paths references a missing or non-file path: site' { param($doc) $doc.surfaces[57].paths = @('site') }
    Expect-Red 'directory junction reparse point' 'FAIL: surfaces[0].paths references a symlink or reparse point: scripts/.feature-lineage-directory-junction/porting/README.md' { param($doc) $doc.surfaces[0].paths = @('scripts/.feature-lineage-directory-junction/porting/README.md') }
    if ($symbolicLinksAvailable) {
        Expect-Red 'internal file symlink' 'FAIL: surfaces[0].paths references a symlink or reparse point: scripts/.feature-lineage-internal-link' { param($doc) $doc.surfaces[0].paths = @('scripts/.feature-lineage-internal-link') }
        Expect-Red 'external file symlink' 'FAIL: surfaces[0].paths references a symlink or reparse point: scripts/.feature-lineage-external-link' { param($doc) $doc.surfaces[0].paths = @('scripts/.feature-lineage-external-link') }
    }
    Expect-Red 'empty implementation object' 'FAIL: inventory.mainCustomFeatures[0].desktopImplementation is missing required field status' { param($doc) $doc.mainCustomFeatures[0].desktopImplementation = [pscustomobject]@{} }
    Expect-Red 'zero lineage SHA' 'FAIL: mainCustomFeatures[0].lineageCommits[0].sha is not a commit object' { param($doc) $doc.mainCustomFeatures[0].lineageCommits[0].sha = ('0' * 40) }
    Expect-Red 'unrelated existing lineage SHA' 'FAIL: mainCustomFeatures[0].lineageCommits pair mapping drifted' { param($doc) $doc.mainCustomFeatures[0].lineageCommits[0].sha = 'c2f4c38fc95c0c55737d087e30a161ab042a1388' }
    Expect-Red 'wrong lineage source' 'FAIL: mainCustomFeatures[0].lineageCommits pair mapping drifted' { param($doc) $doc.mainCustomFeatures[0].lineageCommits[0].source = 'tabs-history' }
    Expect-Red 'overlapping source declaration' 'FAIL: mainCustomFeatures[0].lineageCommits pair mapping drifted' { param($doc) $doc.mainCustomFeatures[0].lineageCommits[0].source = 'root-main' }
    Expect-Red 'lineage pair order drift' 'FAIL: mainCustomFeatures[13].lineageCommits pair mapping drifted' { param($doc) $doc.mainCustomFeatures[13].lineageCommits = @($doc.mainCustomFeatures[13].lineageCommits[1], $doc.mainCustomFeatures[13].lineageCommits[0]) }
    Expect-Red 'pattern-only preservation branch violation' 'FAIL: inventory.preservationBranches[0].branch does not match schema pattern' { param($doc) $doc.preservationBranches[0].branch = 'not-a-preservation' }
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
    Expect-Red 'annotated tag source substitution' 'FAIL: inventory.lineageSources.preservation-feature-history.ref must be a direct source ref' { param($doc) $doc.lineageSources.'preservation-feature-history'.ref = 'refs/tags/v0.20.298-r296.1' }
    Expect-Schema-Red 'malformed minimum keyword' 'FAIL: schema $defs.lineageCommit.properties.order.minimum must be a non-negative integer' { param($schemaDoc) $schemaDoc.'$defs'.lineageCommit.properties.order.minimum = 'bad' } { param($doc) }
    Expect-Schema-Red 'malformed required keyword' 'FAIL: schema $defs.feature.required must be an array of strings' { param($schemaDoc) $schemaDoc.'$defs'.feature.required = 'bad' } { param($doc) }
    Expect-Schema-Red 'malformed enum keyword' 'FAIL: schema $defs.implementation.properties.status.enum must be a non-empty array' { param($schemaDoc) $schemaDoc.'$defs'.implementation.properties.status.enum = 'bad' } { param($doc) }
    Expect-Schema-Red 'invalid pattern keyword' 'FAIL: schema $defs.preservation.properties.branch.pattern is invalid regex' { param($schemaDoc) $schemaDoc.'$defs'.preservation.properties.branch.pattern = '[' } { param($doc) }
    Expect-Schema-Red 'wrong const type' 'FAIL: schema root.properties.canonicalFeatureIds.const has wrong type' { param($schemaDoc) $schemaDoc.properties.canonicalFeatureIds.const = 'wrong' } { param($doc) }
    Expect-Schema-Red 'unsupported keyword value' 'FAIL: schema root.additionalProperties must be boolean' { param($schemaDoc) $schemaDoc.additionalProperties = 'false' } { param($doc) }
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
} finally {
    if (Test-Path -LiteralPath $internalLink) { cmd.exe /d /c del /f /q "$internalLink" | Out-Null }
    if (Test-Path -LiteralPath $externalLink) { cmd.exe /d /c del /f /q "$externalLink" | Out-Null }
    if (Test-Path -LiteralPath $junction) { cmd.exe /d /c rd /s /q "$junction" | Out-Null }
    if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
}
