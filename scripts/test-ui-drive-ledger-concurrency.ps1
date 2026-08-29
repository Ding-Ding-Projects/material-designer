[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ui-drive-evidence-lib.ps1')
. (Join-Path $PSScriptRoot 'ui-drive-test-fixture.ps1')
$sourceRoot = Split-Path $PSScriptRoot -Parent
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

    $fixtureRoot = Join-Path $tempRoot 'fixture'
    $fixture = New-UIEvidenceTestRepository -SourceRoot $sourceRoot -DestinationRoot $fixtureRoot
    $appendScript = Join-Path $fixture.RepositoryRoot 'scripts/append-ui-drive-ledger.ps1'
    $common = @('-NoProfile','-ExecutionPolicy','Bypass','-File',$appendScript,'-Receipt',$fixture.Receipt,'-Ledger',$fixture.Ledger,'-Inventory',$fixture.Inventory,'-SceneRegistry',$fixture.Registry,'-Authority',$fixture.Authority,'-EvidenceRoot',$fixture.EvidenceRoot,'-RepositoryRoot',$fixture.RepositoryRoot)
    $jobScript = { param([object[]]$Arguments) $previous=$ErrorActionPreference;try{$ErrorActionPreference='Continue';& powershell.exe @Arguments 1>$null 2>$null;return $LASTEXITCODE}finally{$ErrorActionPreference=$previous} }
    $one = Start-Job -ScriptBlock $jobScript -ArgumentList (,$common)
    $two = Start-Job -ScriptBlock $jobScript -ArgumentList (,$common)
    Wait-Job -Job $one,$two | Out-Null
    $codes = @(@((Receive-Job -Job $one),(Receive-Job -Job $two)) | ForEach-Object { [int]$_ } | Sort-Object)
    Remove-Job -Job $one,$two -Force
    if (-not (Test-UIExactSequence $codes @(0,1))) {
        throw "Concurrent duplicate append exit codes were $($codes -join ','); expected 0,1."
    }
    $ledger = Read-UIValidatedJson -Path $fixture.Ledger -SchemaPath (Join-Path $fixture.SchemaRoot 'ledger.schema.json') -MaxBytes 4194304 -MaxDepth 20 -MaxStringLength 4096 -MaxArrayLength 10000 -MaxObjectProperties 128
    if (@($ledger.rows).Count -ne 1 -or $ledger.rows[0].receiptId -cne 'receipt-one' -or $ledger.rows[0].receiptSha256 -cne (Get-UIFileSha256 $fixture.Receipt)) { throw 'Concurrent append left a torn, duplicate, or stale ledger row.' }
    Promote-UIEvidenceTestFixture $fixture
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $fixture.RepositoryRoot 'scripts/verify-ui-drive-evidence.ps1') -Inventory $fixture.Inventory -SceneRegistry $fixture.Registry -Ledger $fixture.Ledger -Authority $fixture.Authority -EvidenceRoot $fixture.EvidenceRoot -RepositoryRoot $fixture.RepositoryRoot 1>$null
    if ($LASTEXITCODE -ne 0) { throw 'Concurrent append result did not pass full promoted verification.' }
    Write-Output "PASS: atomic replace survived $retryCount bounded sharing retry attempt(s); two concurrent appenders produced one durable row, one duplicate refusal, and a fully verified final ledger."
} finally {
    if (Test-Path -LiteralPath $tempRoot) {
        $resolved=[IO.Path]::GetFullPath($tempRoot);$prefix=[IO.Path]::GetFullPath([IO.Path]::GetTempPath())
        if(-not $resolved.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)-or [IO.Path]::GetFileName($resolved)-notlike 'material-designer-ui-drive-concurrency-*'){throw 'Refused unexpected concurrency fixture deletion target.'}
        Get-ChildItem -LiteralPath $resolved -Recurse -Force | ForEach-Object {[IO.File]::SetAttributes($_.FullName,[IO.FileAttributes]::Normal)}
        [IO.Directory]::Delete($resolved,$true)
    }
}
