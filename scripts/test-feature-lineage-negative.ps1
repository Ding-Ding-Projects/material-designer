param(
    [string]$UpstreamRepo = ''
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$validator = Join-Path $repo 'scripts/verify-feature-lineage.py'
$inventory = Join-Path $repo '.codex/verification/feature-lineage/inventory.json'
if ([string]::IsNullOrWhiteSpace($UpstreamRepo)) { $UpstreamRepo = Join-Path $repo 'vendor/open-design' }
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('feature-lineage-negative-' + [guid]::NewGuid().ToString('N'))
$mutated = Join-Path $tempRoot 'inventory.json'
New-Item -ItemType Directory -Path $tempRoot | Out-Null

function Invoke-Validator([string]$InventoryPath, [string]$SourcePath, [switch]$OmitSource) {
    if ($OmitSource) { & py -3 $validator --inventory $InventoryPath --repo-root $repo 2>&1 | Out-Host }
    else { & py -3 $validator --inventory $InventoryPath --repo-root $repo --upstream-repo $SourcePath 2>&1 | Out-Host }
    return [int]$LASTEXITCODE
}
function Expect-Red([string]$Label, [scriptblock]$Mutation) {
    Copy-Item -LiteralPath $inventory -Destination $mutated -Force
    $doc = Get-Content -LiteralPath $mutated -Raw | ConvertFrom-Json
    & $Mutation $doc
    $doc | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $mutated -Encoding utf8
    $code = Invoke-Validator $mutated $UpstreamRepo
    if ($code -eq 0) { throw "negative case stayed green: $Label" }
    Write-Output "PASS: $Label turns the validator red"
}
try {
    $sourceAvailable = Test-Path -LiteralPath (Join-Path $UpstreamRepo '.git')
    if (-not $sourceAvailable) { throw "exact upstream source is unavailable: $UpstreamRepo" }
    Expect-Red 'nonexistent referenced path' { param($doc) $doc.surfaces[0].paths = @('missing/feature-path.md') }
    Expect-Red 'path outside source boundary' { param($doc) $doc.surfaces[0].paths = @('../outside-feature-path.md') }
    Expect-Red 'descendant-only path' { param($doc) $doc.surfaces[57].paths = @('site') }
    Expect-Red 'empty implementation object' { param($doc) $doc.mainCustomFeatures[0].desktopImplementation = [pscustomobject]@{} }
    Expect-Red 'bogus valid linked commit SHA' { param($doc) $doc.linkedWorktreeCommits[0].sha = ('0' * 40) }
    Expect-Red 'missing preservation ref' { param($doc) $doc.preservationBranches[0].branch = 'preservation/moved-ref' }
    Expect-Red 'subject mismatch' { param($doc) $doc.lineageCommits[0].subject = 'wrong subject' }
    Copy-Item -LiteralPath $inventory -Destination $mutated -Force
    $code = Invoke-Validator $mutated $UpstreamRepo -OmitSource
    if ($code -eq 0) { throw 'optional upstream-source omission stayed green' }
    Write-Output 'PASS: omitting the mandatory upstream source turns the validator red'
    $unavailable = Join-Path $tempRoot 'unavailable-source'
    New-Item -ItemType Directory -Path $unavailable | Out-Null
    Copy-Item -LiteralPath $inventory -Destination $mutated -Force
    $code = Invoke-Validator $mutated $unavailable
    if ($code -eq 0) { throw 'unavailable upstream source stayed green' }
    Write-Output 'PASS: unavailable upstream target source turns the validator red'
    Copy-Item -LiteralPath $inventory -Destination $mutated -Force
    $code = Invoke-Validator $mutated $UpstreamRepo
    if ($code -ne 0) { throw 'restoring the intact inventory did not return the validator to green' }
    Write-Output 'PASS: restoring every mutation returns the validator to green'
} finally {
    if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
}
