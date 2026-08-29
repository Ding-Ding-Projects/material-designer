[CmdletBinding()]
param(
  [int]$TimeoutMilliseconds = 120000,
  [int]$MaxOutputCharacters = 24000
)

$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptRoot

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
  $bytes = [IO.File]::ReadAllBytes($Path)
  $sha = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  return [pscustomobject]@{
    Path = $Path
    Bytes = $bytes
    Length = $bytes.Length
    Sha256 = $sha
  }
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
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit($TimeoutMs)) {
      try { $process.Kill() } catch { }
      throw "Command timed out after ${TimeoutMs}ms: $FileName $Arguments"
    }
    $stdout = $stdoutTask.Result
    $stderr = $stderrTask.Result
    $output = $stdout + $stderr
    if ($output.Length -gt $OutputLimit) {
      $output = $output.Substring(0, $OutputLimit) + "`n[output truncated at $OutputLimit characters]"
    }
    return [pscustomobject]@{
      ExitCode = $process.ExitCode
      Output = $output
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

$baselineStatus = Invoke-GitText @('status', '--porcelain=v1')
if (-not [string]::IsNullOrWhiteSpace($baselineStatus)) {
  throw "Mutation verifier requires a clean starting tree; refusing lat tat input:`n$baselineStatus"
}
$baselineDiff = Invoke-GitText @('diff', '--binary', '--no-ext-diff', '--')

$pnpm = (Get-Command pnpm.cmd -ErrorAction Stop).Path
if ([string]::IsNullOrWhiteSpace($pnpm)) {
  throw 'Could not resolve pnpm.cmd for the focused Chut route'
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
    Replacement = '          {/* portalRootRef intentionally detached for mutation */}'
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
      throw "Mutation did not turn the focused Chut red: $($case.Name)"
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
      throw "Restored focused Chut did not return green for $($case.Name)`n$($green.Output)"
    }
    Write-Output ("GREEN {0}: exit={1} restored sha256={2} bytes={3}" -f $case.Name, $green.ExitCode, $restored.Sha256, $restored.Length)
  }
  $completed++
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
