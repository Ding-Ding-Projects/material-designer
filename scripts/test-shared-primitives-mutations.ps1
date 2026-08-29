[CmdletBinding()]
param(
  [int]$TimeoutMilliseconds = 120000,
  [int]$MaxOutputCharacters = 24000,
  [switch]$OnlyTimeoutFixture,
  [switch]$DisableTimeoutTreeCleanup
)

$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptRoot
$script:RefuseRestoration = $false

function Invoke-GitText {
  param([string[]]$Arguments)
  $result = & git -C $repoRoot @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "git $($Arguments -join ' ') failed with exit code $LASTEXITCODE`n$($result -join [Environment]::NewLine)"
  }
  return ($result -join [Environment]::NewLine)
}

function Get-Snapshot {
  param([string]$Path)
  $stream = New-Object IO.FileStream(
    $Path,
    [IO.FileMode]::Open,
    [IO.FileAccess]::Read,
    [IO.FileShare]::Read,
    8192,
    [IO.FileOptions]::SequentialScan
  )
  try {
    $length = [int]$stream.Length
    $bytes = New-Object byte[] $length
    $offset = 0
    while ($offset -lt $length) {
      $read = $stream.Read($bytes, $offset, $length - $offset)
      if ($read -le 0) {
        throw "Could not read the complete source snapshot for $Path"
      }
      $offset += $read
    }
  } finally {
    $stream.Dispose()
  }
  $hashAlgorithm = [Security.Cryptography.SHA256]::Create()
  try {
    $digest = $hashAlgorithm.ComputeHash($bytes)
  } finally {
    $hashAlgorithm.Dispose()
  }
  $sha = [BitConverter]::ToString($digest).Replace('-', '').ToLowerInvariant()
  return [pscustomobject]@{
    Path = $Path
    Bytes = $bytes
    Length = $bytes.Length
    Sha256 = $sha
  }
}

function Get-ProcessTable {
  try {
    return @(Get-CimInstance -ClassName Win32_Process -ErrorAction Stop | ForEach-Object {
        [pscustomobject]@{
          ProcessId = [int]$_.ProcessId
          ParentProcessId = [int]$_.ParentProcessId
          Name = [string]$_.Name
        }
      })
  } catch {
    return @(Get-WmiObject -Class Win32_Process -ErrorAction Stop | ForEach-Object {
        [pscustomobject]@{
          ProcessId = [int]$_.ProcessId
          ParentProcessId = [int]$_.ParentProcessId
          Name = [string]$_.Name
        }
      })
  }
}

function Get-ProcessTree {
  param([int]$RootPid)
  $table = @(Get-ProcessTable)
  $selected = @{}
  $selected[$RootPid] = $true
  $changed = $true
  while ($changed) {
    $changed = $false
    foreach ($entry in $table) {
      if ($selected.ContainsKey($entry.ParentProcessId) -and -not $selected.ContainsKey($entry.ProcessId)) {
        $selected[$entry.ProcessId] = $true
        $changed = $true
      }
    }
  }
  return @($table | Where-Object { $selected.ContainsKey($_.ProcessId) })
}

function Stop-ProcessTree {
  param(
    [int]$RootPid,
    [int]$TimeoutMs = 5000
  )
  $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
  $tracked = @{}
  $failures = New-Object System.Collections.Generic.List[string]
  do {
    foreach ($entry in @(Get-ProcessTree -RootPid $RootPid)) {
      if (-not $tracked.ContainsKey($entry.ProcessId)) {
        $tracked[$entry.ProcessId] = $entry
      }
    }
    if ($tracked.Count -eq 0) {
      return [pscustomobject]@{ Succeeded = $true; Pids = @(); Survivors = @(); Failures = @() }
    }

    $trackedIds = @($tracked.Keys | ForEach-Object { [int]$_ })
    $leaves = @($tracked.Values | Where-Object {
        $parentPid = $_.ProcessId
        -not ($tracked.Values | Where-Object { $_.ParentProcessId -eq $parentPid })
      })
    if ($leaves.Count -eq 0) {
      $leaves = @($tracked.Values | Select-Object -Last 1)
    }
    foreach ($leaf in $leaves) {
      try {
        Stop-Process -Id $leaf.ProcessId -Force -ErrorAction Stop
      } catch {
        try {
          Get-Process -Id $leaf.ProcessId -ErrorAction Stop | Out-Null
          [void]$failures.Add(("PID {0} ({1}) could not be stopped: {2}" -f $leaf.ProcessId, $leaf.Name, $_.Exception.Message))
        } catch {
          # The process exited between enumeration and the stop request.
        }
      }
      $tracked.Remove($leaf.ProcessId)
    }
    if ([DateTime]::UtcNow -lt $deadline) {
      Start-Sleep -Milliseconds 50
    }
  } while ([DateTime]::UtcNow -lt $deadline)

  $survivors = @(Get-ProcessTree -RootPid $RootPid | ForEach-Object { [int]$_.ProcessId })
  foreach ($pid in @($tracked.Keys)) {
    if ($survivors -notcontains ([int]$pid)) {
      $tracked.Remove($pid)
    }
  }
  return [pscustomobject]@{
    Succeeded = ($survivors.Count -eq 0 -and $failures.Count -eq 0)
    Pids = $trackedIds
    Survivors = $survivors
    Failures = @($failures)
  }
}

function Wait-ProcessTreeGone {
  param(
    [int]$RootPid,
    [int]$TimeoutMs = 5000
  )
  $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
  do {
    $survivors = @(Get-ProcessTree -RootPid $RootPid)
    if ($survivors.Count -eq 0) {
      return $true
    }
    Start-Sleep -Milliseconds 50
  } while ([DateTime]::UtcNow -lt $deadline)
  return (@(Get-ProcessTree -RootPid $RootPid).Count -eq 0)
}

function Quote-ProcessArgument {
  param([string]$Value)
  return '"' + $Value.Replace('"', '\"') + '"'
}

function Invoke-TimeoutFixture {
  param(
    [string]$HostExecutable,
    [bool]$DisableCleanup = $false
  )
  $fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ("shared-primitives-timeout-" + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $fixtureRoot -Force | Out-Null
  $probePath = Join-Path $fixtureRoot 'probe.txt'
  $readyPath = Join-Path $fixtureRoot 'ready.txt'
  $fixturePath = Join-Path $scriptRoot 'test-shared-primitives-timeout-fixture.ps1'
  $probeSnapshot = $null
  $process = $null
  $rootPid = 0
  try {
    [IO.File]::WriteAllText($probePath, 'mutation-probe-original')
    $probeSnapshot = Get-Snapshot $probePath
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $HostExecutable
    $startInfo.Arguments = @(
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      (Quote-ProcessArgument $fixturePath),
      '-ProbePath',
      (Quote-ProcessArgument $probePath),
      '-ReadyPath',
      (Quote-ProcessArgument $readyPath),
      '-ChildExecutable',
      (Quote-ProcessArgument $HostExecutable)
    ) -join ' '
    $startInfo.WorkingDirectory = $scriptRoot
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    if (-not $process.Start()) {
      throw 'Could not start the timeout fixture parent process'
    }
    $rootPid = $process.Id
    $readyDeadline = [DateTime]::UtcNow.AddSeconds(5)
    while (-not (Test-Path -LiteralPath $readyPath -PathType Leaf) -and [DateTime]::UtcNow -lt $readyDeadline) {
      Start-Sleep -Milliseconds 25
    }
    if (-not (Test-Path -LiteralPath $readyPath -PathType Leaf)) {
      throw 'Timeout fixture did not report its parent and child PIDs'
    }
    $pidParts = ([IO.File]::ReadAllText($readyPath)).Trim().Split('|')
    if ($pidParts.Count -ne 2) {
      throw 'Timeout fixture reported an invalid PID pair'
    }
    $childPid = 0
    $reportedParentPid = 0
    if ((-not [int]::TryParse($pidParts[0], [ref]$reportedParentPid)) -or (-not [int]::TryParse($pidParts[1], [ref]$childPid)) -or ($reportedParentPid -ne $rootPid)) {
      throw "Timeout fixture PID pair does not identify its exact parent: $($pidParts -join '|')"
    }
    $tree = @(Get-ProcessTree -RootPid $rootPid)
    if (-not ($tree | Where-Object { $_.ProcessId -eq $childPid })) {
      throw "Timeout fixture child PID $childPid is not a descendant of parent PID $rootPid"
    }
    if ($process.WaitForExit(750)) {
      throw 'Timeout fixture exited before the bounded timeout'
    }

    if (-not $DisableCleanup) {
      $cleanup = Stop-ProcessTree -RootPid $rootPid -TimeoutMs 8000
      if (-not $cleanup.Succeeded -or -not (Wait-ProcessTreeGone -RootPid $rootPid -TimeoutMs 2000)) {
        throw "Refusing probe restoration because the timeout process tree survived: root PID $rootPid; child PID $childPid; survivors $($cleanup.Survivors -join ', '); failures $($cleanup.Failures -join '; ')"
      }
      Write-Output ("TIMEOUT GREEN: parent PID {0} and child PID {1} stopped before probe restoration" -f $rootPid, $childPid)
    } else {
      $survivors = @(Get-ProcessTree -RootPid $rootPid)
      if ($survivors.Count -eq 0) {
        throw 'timeout tree cleanup disabled but no survivor was observed'
      }
      throw "timeout tree cleanup disabled; survivors $($survivors.ProcessId -join ', ')"
    }
  } finally {
    if ($rootPid -ne 0) {
      $survivors = @(Get-ProcessTree -RootPid $rootPid)
      if ($survivors.Count -gt 0) {
        $forced = Stop-ProcessTree -RootPid $rootPid -TimeoutMs 8000
        if (-not $forced.Succeeded -or -not (Wait-ProcessTreeGone -RootPid $rootPid -TimeoutMs 2000)) {
          throw "Refusing probe restoration because a task-owned timeout process could not be stopped: root PID $rootPid; survivors $($forced.Survivors -join ', '); failures $($forced.Failures -join '; ')"
        }
      }
    }
    if ($null -ne $probeSnapshot) {
      [IO.File]::WriteAllBytes($probePath, $probeSnapshot.Bytes)
      $restoredProbe = Get-Snapshot $probePath
      if ($restoredProbe.Length -ne $probeSnapshot.Length -or $restoredProbe.Sha256 -ne $probeSnapshot.Sha256) {
        throw 'Timeout fixture probe restoration changed exact bytes'
      }
    }
    if (Test-Path -LiteralPath $fixtureRoot) {
      Remove-Item -LiteralPath $fixtureRoot -Recurse -Force
    }
    if ($null -ne $process) {
      $process.Dispose()
    }
  }
}

$baselineStatus = Invoke-GitText @('status', '--porcelain=v1')
if (-not [string]::IsNullOrWhiteSpace($baselineStatus)) {
  throw "Mutation verifier requires a clean starting tree; refusing dirty input:`n$baselineStatus"
}

$hostExecutable = (Get-Process -Id $PID -ErrorAction Stop).Path
if ([string]::IsNullOrWhiteSpace($hostExecutable)) {
  throw 'Could not resolve the current PowerShell executable for timeout isolation'
}

if ($OnlyTimeoutFixture) {
  Invoke-TimeoutFixture -HostExecutable $hostExecutable -DisableCleanup ([bool]$DisableTimeoutTreeCleanup)
  exit 0
}

function Invoke-BoundedCommand {
  param(
    [string]$FileName,
    [string]$Arguments,
    [string]$WorkingDirectory,
    [int]$TimeoutMs,
    [int]$OutputLimit
  )
  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $FileName
  $startInfo.Arguments = $Arguments
  $startInfo.WorkingDirectory = $WorkingDirectory
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $startInfo
  try {
    if (-not $process.Start()) {
      throw "Could not start $FileName $Arguments"
    }
    $rootPid = $process.Id
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit($TimeoutMs)) {
      $cleanup = Stop-ProcessTree -RootPid $rootPid -TimeoutMs ([Math]::Min(10000, $TimeoutMs))
      if (-not $cleanup.Succeeded) {
        $script:RefuseRestoration = $true
        throw "Refusing source restoration because timed-out process tree survived: root PID $rootPid; survivors $($cleanup.Survivors -join ', '); failures $($cleanup.Failures -join '; ')"
      }
      throw "Command timed out after ${TimeoutMs}ms and its exact process tree was stopped: $FileName $Arguments"
    }
    $stdout = $stdoutTask.Result
    $stderr = $stderrTask.Result
    $output = $stdout + $stderr
    if ($output.Length -gt $OutputLimit) {
      $output = $output.Substring(0, $OutputLimit) + "`n[output truncated at $OutputLimit characters]"
    }
    $remaining = @(Get-ProcessTree -RootPid $rootPid)
    if ($remaining.Count -gt 0) {
      $cleanup = Stop-ProcessTree -RootPid $rootPid -TimeoutMs ([Math]::Min(10000, $TimeoutMs))
      if (-not $cleanup.Succeeded) {
        $script:RefuseRestoration = $true
        throw "Refusing source restoration because process descendants survived: root PID $rootPid; survivors $($cleanup.Survivors -join ', '); failures $($cleanup.Failures -join '; ')"
      }
    }
    return [pscustomobject]@{
      ExitCode = $process.ExitCode
      Output = $output
      RootPid = $rootPid
    }
  } finally {
    $process.Dispose()
  }
}

function Replace-ExactText {
  param(
    [string]$Path,
    [string]$Needle,
    [string]$Replacement
  )
  $encoding = New-Object System.Text.UTF8Encoding($false, $true)
  $text = $encoding.GetString([IO.File]::ReadAllBytes($Path))
  $count = ([regex]::Matches($text, [regex]::Escape($Needle))).Count
  if ($count -ne 1) {
    throw "Mutation expected exactly one source boundary in $Path, found $count"
  }
  $updated = $text.Replace($Needle, $Replacement)
  if ($updated -eq $text) {
    throw "Mutation did not change $Path"
  }
  [IO.File]::WriteAllBytes($Path, $encoding.GetBytes($updated))
}

$baselineDiff = Invoke-GitText @('diff', '--binary', '--no-ext-diff', '--')

$pnpm = (Get-Command pnpm.cmd -ErrorAction Stop).Path
if ([string]::IsNullOrWhiteSpace($pnpm)) {
  throw 'Could not resolve pnpm.cmd for the focused verification route'
}

$cases = @(
  [pscustomobject]@{
    Name = 'CustomSelect portal-root registration removal'
    RelativePath = 'design/apps/web/src/components/CustomSelect.tsx'
    WorkingRelativePath = 'design/apps/web'
    Needle = '          portalRootRef={registerBuilderPortal}'
    Replacement = ''
    Arguments = 'exec vitest --config vitest.shared-primitives.config.ts run tests/components/CustomSelect.test.tsx -t "every real portalled"'
    Diagnostic = 'keeps every real portalled regex-builder control inside its select owner'
  },
  [pscustomobject]@{
    Name = 'RegexSearchField concrete callback detachment'
    RelativePath = 'design/apps/web/src/components/regex/RegexSearchField.tsx'
    WorkingRelativePath = 'design/apps/web'
    Needle = '    portalRootRef?.(node);'
    Replacement = '    portalRootRef?.(null);'
    Arguments = 'exec vitest --config vitest.shared-primitives.config.ts run tests/components/CustomSelect.test.tsx -t "every real portalled"'
    Diagnostic = 'keeps every real portalled regex-builder control inside its select owner'
  },
  [pscustomobject]@{
    Name = 'PluginInputsForm production CustomSelect adoption removal'
    RelativePath = 'design/apps/web/src/components/PluginInputsForm.tsx'
    WorkingRelativePath = 'design/apps/web'
    Needle = '      <CustomSelect'
    Replacement = '      <div'
    Arguments = 'exec vitest --config vitest.shared-primitives.config.ts run tests/components/PluginInputsForm.test.tsx -t "renders a select"'
    Diagnostic = 'renders a select with each option'
  },
  [pscustomobject]@{
    Name = 'CustomSelect result-count removal'
    RelativePath = 'design/apps/web/src/components/CustomSelect.tsx'
    WorkingRelativePath = 'design/apps/web'
    Needle = '{resultCountLabel(visibleOptions.length)}'
    Replacement = '{resultCountLabel(flatOptions.length)}'
    Arguments = 'exec vitest --config vitest.shared-primitives.config.ts run tests/components/CustomSelect.test.tsx -t "isolated search"'
    Diagnostic = 'renders an isolated search, result count, no-results state, and lock wrapper'
  },
  [pscustomobject]@{
    Name = 'active shared stylesheet nested overflow removal'
    RelativePath = 'design/apps/web/src/styles/primitives.css'
    WorkingRelativePath = 'design/packages/components'
    Needle = "  flex: 1 1 auto;`n  min-height: 0;`n  overflow: auto;`n  overscroll-behavior: contain;"
    Replacement = "  flex: 1 1 auto;`n  min-height: 0;`n  overflow: hidden;`n  overscroll-behavior: contain;"
    Arguments = 'exec vitest --run -c vitest.config.ts tests/material-primitives.contract.test.ts -t "keeps searchable and locked select options reachable inside nested scroll"'
    Diagnostic = 'keeps searchable and locked select options reachable inside nested scroll'
  },
  [pscustomobject]@{
    Name = 'duplicate normalized shortcut refusal removal'
    RelativePath = 'design/packages/components/src/menu.tsx'
    WorkingRelativePath = 'design/packages/components'
    Needle = '    if (existingKeyOwner) {'
    Replacement = '    if (false && existingKeyOwner) {'
    Arguments = 'exec vitest --run -c vitest.config.ts tests/material-primitives.test.tsx -t "arbitrary shortcut metadata"'
    Diagnostic = 'rejects arbitrary shortcut metadata before it can become ARIA state'
  },
  [pscustomobject]@{
    Name = 'not specificity removal'
    RelativePath = 'design/packages/components/tests/material-primitives.contract.test.ts'
    WorkingRelativePath = 'design/packages/components'
    Needle = "      nestedSpecificities.push(argumentsList.map((argument) => specificity(argument)).reduce((best, current) => (`n        compareSpecificity(current, best) > 0 ? current : best`n      )));"
    Replacement = '      nestedSpecificities.push([0, 0, 0]);'
    Arguments = 'exec vitest --run -c vitest.config.ts tests/material-primitives.contract.test.ts -t "fails closed with exact reasons"'
    Diagnostic = 'specificity'
  },
  [pscustomobject]@{
    Name = 'commented portal-root registration removal'
    RelativePath = 'design/apps/web/src/components/CustomSelect.tsx'
    WorkingRelativePath = 'design/apps/web'
    Needle = '          portalRootRef={registerBuilderPortal}'
    Replacement = '          {...{} /* portalRootRef intentionally detached for mutation */}'
    Arguments = 'exec vitest --config vitest.shared-primitives.config.ts run tests/components/CustomSelect.test.tsx -t "every real portalled"'
    Diagnostic = 'keeps every real portalled regex-builder control inside its select owner'
  },
  [pscustomobject]@{
    Name = 'commented whole production import removal'
    RelativePath = 'design/apps/web/src/components/PluginInputsForm.tsx'
    WorkingRelativePath = 'design/apps/web'
    Needle = "import { CustomSelect } from './CustomSelect';"
    Replacement = '// CustomSelect import removed for mutation'
    Arguments = 'exec vitest --config vitest.shared-primitives.config.ts run tests/components/PluginInputsForm.test.tsx -t "renders a select"'
    Diagnostic = 'renders a select with each option'
  }
)

$snapshots = @{}
foreach ($case in $cases) {
  $path = Join-Path $repoRoot $case.RelativePath
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Mutation source does not exist: $case.RelativePath"
  }
  $snapshots[$case.RelativePath] = Get-Snapshot $path
}

$completed = 0
foreach ($case in $cases) {
  $path = Join-Path $repoRoot $case.RelativePath
  $snapshot = $snapshots[$case.RelativePath]
  $workingDirectory = Join-Path $repoRoot $case.WorkingRelativePath
  Write-Output ("CASE {0}: baseline sha256={1} bytes={2}" -f $case.Name, $snapshot.Sha256, $snapshot.Length)
  try {
    Replace-ExactText -Path $path -Needle $case.Needle -Replacement $case.Replacement
    $red = Invoke-BoundedCommand -FileName $pnpm -Arguments $case.Arguments -WorkingDirectory $workingDirectory -TimeoutMs $TimeoutMilliseconds -OutputLimit $MaxOutputCharacters
    if ($red.ExitCode -eq 0) {
      throw "Mutation did not turn the focused verification red: $($case.Name)"
    }
    if (-not $red.Output.Contains($case.Diagnostic)) {
      throw "Mutation turned red without the expected diagnostic '$($case.Diagnostic)': $($case.Name)`n$($red.Output)"
    }
    Write-Output ("RED {0}: exit={1} diagnostic={2}" -f $case.Name, $red.ExitCode, $case.Diagnostic)
  } finally {
    [IO.File]::WriteAllBytes($path, $snapshot.Bytes)
    $restored = Get-Snapshot $path
    if ($restored.Length -ne $snapshot.Length -or $restored.Sha256 -ne $snapshot.Sha256) {
      throw "Exact byte restoration failed for $case.RelativePath"
    }
    $green = Invoke-BoundedCommand -FileName $pnpm -Arguments $case.Arguments -WorkingDirectory $workingDirectory -TimeoutMs $TimeoutMilliseconds -OutputLimit $MaxOutputCharacters
    if ($green.ExitCode -ne 0) {
      throw "Restored focused verification did not return green for $($case.Name)`n$($green.Output)"
    }
    Write-Output ("GREEN {0}: exit={1} restored sha256={2} bytes={3}" -f $case.Name, $green.ExitCode, $restored.Sha256, $restored.Length)
  }
  $completed++
}

$scriptPath = $MyInvocation.MyCommand.Path
$scriptSnapshot = Get-Snapshot $scriptPath
$timeoutArguments = @(
  '-NoProfile',
  '-ExecutionPolicy',
  'Bypass',
  '-File',
  (Quote-ProcessArgument $scriptPath),
  '-OnlyTimeoutFixture'
) -join ' '
$timeoutWorkingDirectory = $repoRoot
$timeoutGreen = Invoke-BoundedCommand -FileName $hostExecutable -Arguments $timeoutArguments -WorkingDirectory $timeoutWorkingDirectory -TimeoutMs 30000 -OutputLimit $MaxOutputCharacters
if ($timeoutGreen.ExitCode -ne 0 -or -not $timeoutGreen.Output.Contains('TIMEOUT GREEN: parent PID')) {
  throw "Timeout fixture did not pass with tree cleanup enabled`n$($timeoutGreen.Output)"
}
Write-Output 'TIMEOUT GREEN: process tree cleanup stopped the parent and child before probe restoration'
try {
  $timeoutCleanupNeedle = 'if (-not $Disable' + 'Cleanup) {'
  Replace-ExactText -Path $scriptPath -Needle $timeoutCleanupNeedle -Replacement 'if ($false) {'
  $timeoutRed = Invoke-BoundedCommand -FileName $hostExecutable -Arguments $timeoutArguments -WorkingDirectory $timeoutWorkingDirectory -TimeoutMs 30000 -OutputLimit $MaxOutputCharacters
  if ($timeoutRed.ExitCode -eq 0) {
    throw 'Disabled process-tree cleanup did not turn the timeout fixture red'
  }
  if (-not $timeoutRed.Output.Contains('timeout tree cleanup disabled; survivors')) {
    throw "Disabled process-tree cleanup turned red without its exact diagnostic`n$($timeoutRed.Output)"
  }
  Write-Output 'TIMEOUT RED: disabled process-tree cleanup left recorded descendants and was refused'
} finally {
  [IO.File]::WriteAllBytes($scriptPath, $scriptSnapshot.Bytes)
  $restoredScript = Get-Snapshot $scriptPath
  if ($restoredScript.Length -ne $scriptSnapshot.Length -or $restoredScript.Sha256 -ne $scriptSnapshot.Sha256) {
    throw 'Exact byte restoration failed for the timeout cleanup mutation'
  }
  $timeoutGreenAgain = Invoke-BoundedCommand -FileName $hostExecutable -Arguments $timeoutArguments -WorkingDirectory $timeoutWorkingDirectory -TimeoutMs 30000 -OutputLimit $MaxOutputCharacters
  if ($timeoutGreenAgain.ExitCode -ne 0 -or -not $timeoutGreenAgain.Output.Contains('TIMEOUT GREEN: parent PID')) {
    throw "Restored timeout fixture did not return green`n$($timeoutGreenAgain.Output)"
  }
  Write-Output ("TIMEOUT GREEN: cleanup mutation restored sha256={0} bytes={1}" -f $restoredScript.Sha256, $restoredScript.Length)
}

$finalStatus = Invoke-GitText @('status', '--porcelain=v1')
$finalDiff = Invoke-GitText @('diff', '--binary', '--no-ext-diff', '--')
if ($finalStatus -ne $baselineStatus) {
  throw "Final git status changed during mutation verification:`n$finalStatus"
}
if ($finalDiff -ne $baselineDiff) {
  throw 'Final git diff changed during mutation verification'
}
foreach ($case in $cases) {
  $path = Join-Path $repoRoot $case.RelativePath
  $snapshot = $snapshots[$case.RelativePath]
  $final = Get-Snapshot $path
  if ($final.Length -ne $snapshot.Length -or $final.Sha256 -ne $snapshot.Sha256) {
    throw "Final source hash changed for $case.RelativePath"
  }
}

Write-Output ("PASS: {0} checked-source mutations turned red with exact diagnostics, restored in finally, returned green, and preserved hashes, bytes, git diff, and git status." -f $completed)
