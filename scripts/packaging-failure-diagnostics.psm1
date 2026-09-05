Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-PackagingFailureDiagnostics {
  [CmdletBinding()]
  param([string[]]$Records, [Nullable[int]]$ExitCode, [string]$ErrorMessage)

  $result = [Collections.Generic.List[string]]::new()
  $result.Add('schemaVersion=1')
  $result.Add('status=failed')
  $result.Add('phase=squirrel-packaging')
  $unsafe = '(?i)(?:[A-Z]:[\\/]|https?://|\b(?:token|secret|password|credential|authorization|api[_-]?key)\b|\$env:|%[A-Za-z_][A-Za-z0-9_]*%)'
  $candidates = @($Records) + @($ErrorMessage)
  foreach ($candidate in $candidates) {
    if ([string]::IsNullOrWhiteSpace($candidate) -or $candidate.Length -gt 384 -or $candidate -match $unsafe) { continue }
    if ($candidate -match '(?i)\btools-pack win (?<phase>build|cleanup|validate-payload|install|start) exited with code (?<code>\d{1,3})\b') {
      $result.Add("diagnostic=tools-pack-$($Matches.phase.ToLowerInvariant())")
      $result.Add("nativeExitCode=$($Matches.code)")
      break
    }
    if ($candidate -match '\b(?<code>NU\d{4}|SQUIRREL_[A-Z0-9_]{2,64})\b') {
      $result.Add('diagnostic=package-schema')
      $result.Add("errorCode=$($Matches.code)")
      break
    }
  }
  if (@($result | Where-Object { $_ -like 'diagnostic=*' }).Count -eq 0) { $result.Add('diagnostic=packaging-step-failed') }
  if ($null -ne $ExitCode) { $result.Add("exitCode=$ExitCode") }
  $result.Add("transcriptRecords=$(@($Records).Count)")
  return @($result)
}

Export-ModuleMember -Function Get-PackagingFailureDiagnostics
