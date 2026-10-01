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
  $recordCount = if ($null -eq $Records) { 0 } else { $Records.Length }
  $start = [Math]::Max(0, $recordCount - 128)
  $candidates = [Collections.Generic.List[string]]::new()
  for ($index = $start; $index -lt $recordCount; $index++) { $candidates.Add($Records[$index]) }
  $candidates.Add($ErrorMessage)
  $wrapperDiagnostic = $null
  foreach ($candidate in $candidates) {
    if ([string]::IsNullOrWhiteSpace($candidate) -or $candidate.Length -gt 4096) { continue }
    if ($candidate -match '(?i)\b(?:token|secret|password|credential|authorization|api[_-]?key)\b') { continue }
    # Publish only enumerated diagnostic identities, never a captured message.
    # Paths surrounding a known code are irrelevant and are never copied.
    if ($candidate -cmatch '\b(?<code>NU5017|NU5000|NU5004|NU5005|NU5026|NU5030)\b') {
      $result.Add('diagnostic=package-schema')
      $result.Add("errorCode=$($Matches.code)")
      break
    }
    if ($candidate -match 'The packaged Windows payload is missing') {
      $result.Add('diagnostic=missing-packaged-payload')
      break
    }
    if ($candidate -match 'Invalid configuration object|unknown property.*squirrel|configuration.*validation') {
      $result.Add('diagnostic=invalid-packaging-configuration')
      break
    }
    # The packer carries workspace-build stderr through this serializer.  Keep
    # this one reviewed compiler identity even when the surrounding Turbopack
    # record contains an absolute build path, so release evidence says which
    # safe failure class stopped packaging without publishing the transcript.
    if ($candidate -match '(?i)createEmptyStatusFallback.*(?:doesn''t exist|does not exist|not exported)') {
      $result.Add('diagnostic=missing-web-status-fallback-export')
      break
    }
    if ($candidate -match $unsafe) { continue }
    if ($candidate -match '(?i)\btools-pack win (?<phase>build|cleanup|validate-payload|install|start) exited with code (?<code>\d{1,3})\b') {
      $wrapperDiagnostic = @("diagnostic=tools-pack-$($Matches.phase.ToLowerInvariant())", "nativeExitCode=$($Matches.code)")
    }
  }
  if (@($result | Where-Object { $_ -like 'diagnostic=*' }).Count -eq 0 -and $null -ne $wrapperDiagnostic) {
    foreach ($field in $wrapperDiagnostic) { $result.Add($field) }
  }
  if (@($result | Where-Object { $_ -like 'diagnostic=*' }).Count -eq 0) { $result.Add('diagnostic=packaging-step-failed') }
  if ($null -ne $ExitCode) { $result.Add("exitCode=$ExitCode") }
  $result.Add("transcriptRecords=$recordCount")
  $result.Add("recordsInspected=$($recordCount - $start)")
  $result.Add("transcriptTruncated=$($start -gt 0)")
  return @($result)
}

Export-ModuleMember -Function Get-PackagingFailureDiagnostics
