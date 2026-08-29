[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ProbePath,
  [Parameter(Mandatory = $true)]
  [string]$ReadyPath,
  [Parameter(Mandatory = $true)]
  [string]$ChildExecutable,
  [switch]$Child
)

$ErrorActionPreference = 'Stop'

function Quote-ProcessArgument {
  param([string]$Value)
  return '"' + $Value.Replace('"', '\"') + '"'
}

if ($Child) {
  $probe = [IO.File]::Open(
    $ProbePath,
    [IO.FileMode]::Open,
    [IO.FileAccess]::Read,
    [IO.FileShare]::ReadWrite
  )
  try {
    [IO.File]::WriteAllText($ReadyPath, [string]$PID)
    while ($true) {
      $probe.Position = 0
      [void]$probe.ReadByte()
      Start-Sleep -Milliseconds 25
    }
  } finally {
    $probe.Dispose()
  }
}

$childReadyPath = "$ReadyPath.child"
$childScript = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'test-shared-primitives-timeout-fixture.ps1'
$startInfo = New-Object System.Diagnostics.ProcessStartInfo
$startInfo.FileName = $ChildExecutable
$startInfo.Arguments = @(
  '-NoProfile',
  '-ExecutionPolicy',
  'Bypass',
  '-File',
  (Quote-ProcessArgument $childScript),
  '-ProbePath',
  (Quote-ProcessArgument $ProbePath),
  '-ReadyPath',
  (Quote-ProcessArgument $childReadyPath),
  '-ChildExecutable',
  (Quote-ProcessArgument $ChildExecutable),
  '-Child'
) -join ' '
$startInfo.WorkingDirectory = Split-Path -Parent $childScript
$startInfo.UseShellExecute = $false
$startInfo.CreateNoWindow = $true
$childProcess = New-Object System.Diagnostics.Process
$childProcess.StartInfo = $startInfo
try {
  if (-not $childProcess.Start()) {
    throw 'Could not start timeout fixture child process'
  }
  $deadline = [DateTime]::UtcNow.AddSeconds(5)
  while (-not (Test-Path -LiteralPath $childReadyPath -PathType Leaf) -and [DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds 25
  }
  if (-not (Test-Path -LiteralPath $childReadyPath -PathType Leaf)) {
    throw 'Timeout fixture child did not open the probe before its deadline'
  }
  [IO.File]::WriteAllText($ReadyPath, ("{0}|{1}" -f $PID, $childProcess.Id))
  while ($true) {
    Start-Sleep -Milliseconds 100
  }
} finally {
  $childProcess.Dispose()
}
