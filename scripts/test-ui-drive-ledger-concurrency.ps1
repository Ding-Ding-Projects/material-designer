[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ui-drive-evidence-lib.ps1')
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('material-designer-ui-drive-concurrency-' + [guid]::NewGuid().ToString('N'))

try {
    New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
    $replaceRoot = Join-Path $tempRoot 'replace'
    New-Item -ItemType Directory -Path $replaceRoot | Out-Null
    $destination = Join-Path $replaceRoot 'ledger.json'
    $candidate = Join-Path $replaceRoot 'candidate.json'
    $backup = Join-Path $replaceRoot 'backup.json'
    $signal = Join-Path $replaceRoot 'locked.signal'
    [IO.File]::WriteAllText($destination, '{"state":"old"}', [Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText($candidate, '{"state":"new"}', [Text.UTF8Encoding]::new($false))
    $lockerScript = Join-Path $replaceRoot 'locker.ps1'
    [IO.File]::WriteAllText($lockerScript, @'
param([string]$Target,[string]$Signal)
$stream=[IO.FileStream]::new($Target,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
try { [IO.File]::WriteAllText($Signal,'locked'); Start-Sleep -Milliseconds 700 } finally { $stream.Dispose() }
'@, [Text.UTF8Encoding]::new($false))
    $locker = Start-Process -FilePath powershell.exe -WindowStyle Hidden -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$lockerScript,'-Target',$destination,'-Signal',$signal) -PassThru
    $deadline = [DateTime]::UtcNow.AddSeconds(10)
    while (-not (Test-Path -LiteralPath $signal)) { if ([DateTime]::UtcNow -gt $deadline) { throw 'Sharing-lock fixture did not become ready.' }; Start-Sleep -Milliseconds 20 }
    $retryCount = 0
    Invoke-UISharingRetry -Operation { [IO.File]::Replace($candidate,$destination,$backup,$true) } -Attempts 20 -DelayMs 40 -RetryCount ([ref]$retryCount)
    $locker.WaitForExit()
    if ($locker.ExitCode -ne 0 -or $retryCount -lt 1 -or [IO.File]::ReadAllText($destination) -cne '{"state":"new"}') { throw 'Bounded sharing-violation retry proof failed.' }

    $crossLock=Join-Path $tempRoot 'cross-process.lock';$crossOutput=Join-Path $tempRoot 'cross-process.txt'
    $jobScript={
        param($Lock,$Output,$Identity)
        $stream=$null
        for($attempt=1;$attempt-le200;$attempt++){
            try {
                $stream=[IO.FileStream]::new($Lock,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
                break
            } catch [IO.IOException] { Start-Sleep -Milliseconds 10 }
        }
        if($null-eq$stream){return 1}
        try {[IO.File]::AppendAllText($Output,$Identity+[Environment]::NewLine);Start-Sleep -Milliseconds 100} finally {$stream.Dispose()}
        return 0
    }
    $one = Start-Job -ScriptBlock $jobScript -ArgumentList $crossLock,$crossOutput,'one'
    $two = Start-Job -ScriptBlock $jobScript -ArgumentList $crossLock,$crossOutput,'two'
    Wait-Job -Job $one,$two | Out-Null
    $codes = @(@((Receive-Job -Job $one),(Receive-Job -Job $two)) | ForEach-Object { [int]$_ } | Sort-Object)
    Remove-Job -Job $one,$two -Force
    if (-not (Test-UIExactSequence $codes @(0,0))) { throw "Cross-process lock workers returned $($codes -join ','); expected 0,0." }
    $lines=@(Get-Content -LiteralPath $crossOutput);if($lines.Count-ne2-or@($lines|Sort-Object -Unique).Count-ne2){throw 'Cross-process lock lost or duplicated a serialized write.'}
    Write-Output "PASS: atomic replace survived $retryCount bounded sharing retry attempt(s); two cross-process lock workers serialized two generic writes, while public static evidence append remains unavailable."
} finally {
    if (Test-Path -LiteralPath $tempRoot) {
        $resolved=[IO.Path]::GetFullPath($tempRoot);$prefix=[IO.Path]::GetFullPath([IO.Path]::GetTempPath())
        if(-not $resolved.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)-or [IO.Path]::GetFileName($resolved)-notlike 'material-designer-ui-drive-concurrency-*'){throw 'Refused unexpected concurrency fixture deletion target.'}
        Get-ChildItem -LiteralPath $resolved -Recurse -Force | ForEach-Object {[IO.File]::SetAttributes($_.FullName,[IO.FileAttributes]::Normal)}
        [IO.Directory]::Delete($resolved,$true)
    }
}
