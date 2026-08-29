[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$temp = Join-Path ([IO.Path]::GetTempPath()) ('material-designer-ui-drive-privacy-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
$safe = Join-Path $temp 'safe.log'
$sensitive = Join-Path $temp 'sensitive.log'
try {
    Set-Content -LiteralPath $safe -Value 'capture completed; no payload was recorded.' -Encoding utf8
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'run-ui-drive-privacy.ps1') -EvidenceRoot $temp -ApprovedFile $safe 1>$null
    if ($LASTEXITCODE -ne 0) { throw 'Safe privacy fixture did not pass.' }
    Set-Content -LiteralPath $sensitive -Value 'password=not-for-evidence' -Encoding utf8
    $previous = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'run-ui-drive-privacy.ps1') -EvidenceRoot $temp -ApprovedFile $sensitive 1>$null 2>$null
        $sensitiveExit = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previous }
    if ($sensitiveExit -eq 0) { throw 'Sensitive privacy fixture stayed green.' }
    $outside = Join-Path ([IO.Path]::GetTempPath()) 'ui-drive-privacy-outside.log'
    Set-Content -LiteralPath $outside -Value 'outside' -Encoding utf8
    try {
        $previous = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'run-ui-drive-privacy.ps1') -EvidenceRoot $temp -ApprovedFile $outside 1>$null 2>$null
            $outsideExit = $LASTEXITCODE
        } finally { $ErrorActionPreference = $previous }
        if ($outsideExit -eq 0) { throw 'Path-escape privacy fixture stayed green.' }
    } finally { if (Test-Path -LiteralPath $outside) { Remove-Item -LiteralPath $outside -Force } }
    Write-Output 'PASS: privacy runner accepted a safe approved output and rejected sensitive content and path escape without emitting fixture payloads.'
} finally { if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force } }
