$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$validator = Join-Path $repo 'scripts/verify-feature-lineage.py'
$inventory = Join-Path $repo '.codex/verification/feature-lineage/inventory.json'
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('feature-lineage-negative-' + [guid]::NewGuid().ToString('N'))
$mutated = Join-Path $tempRoot 'inventory.json'
New-Item -ItemType Directory -Path $tempRoot | Out-Null
try {
    Copy-Item -LiteralPath $inventory -Destination $mutated
    $doc = Get-Content -LiteralPath $mutated -Raw | ConvertFrom-Json
    $doc.lineageCommits = @($doc.lineageCommits | Select-Object -Skip 1)
    $doc | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $mutated -Encoding utf8
    & py -3 $validator --inventory $mutated
    if ($LASTEXITCODE -eq 0) { throw 'negative regression stayed green after removing a complete lineage boundary' }
    Write-Output 'PASS: removing the lineage boundary turns the validator red'
    Copy-Item -LiteralPath $inventory -Destination $mutated -Force
    & py -3 $validator --inventory $mutated
    if ($LASTEXITCODE -ne 0) { throw 'restoring the lineage inventory did not return the validator to green' }
    Write-Output 'PASS: restoring the lineage boundary returns the validator to green'
} finally { if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force } }
