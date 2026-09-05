Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Test-BuildProvenanceTimestamp {
  [CmdletBinding()]
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) { return $false }
  if ($Value -notmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$') { return $false }
  $calendar = [DateTime]::MinValue
  if (-not [DateTime]::TryParseExact($Value.Substring(0, 19), 'yyyy-MM-ddTHH:mm:ss', [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::None, [ref]$calendar)) { return $false }
  $parsed = [DateTimeOffset]::MinValue
  return [DateTimeOffset]::TryParse($Value, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind, [ref]$parsed)
}

function Read-ValidatedBuildProvenance {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$ProvenanceFile,
    [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-fA-F]{40}$')][string]$ExpectedCommit,
    [Parameter(Mandatory = $true)][string]$ExpectedVersion
  )
  $path = [IO.Path]::GetFullPath($ProvenanceFile)
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "external provenance file was not found: $path" }
  try { $record = Get-Content -Raw -LiteralPath $path | ConvertFrom-Json } catch { throw 'external provenance is not valid JSON' }
  if ($record.schemaVersion -ne 1) { throw 'external provenance schemaVersion must be 1' }
  if ([string]$record.sourceCommit -cne $ExpectedCommit.ToLowerInvariant()) { throw 'external provenance sourceCommit does not match the exact source commit' }
  if ([string]$record.version -cne $ExpectedVersion) { throw 'external provenance version does not match the exact package version' }
  if (-not (Test-BuildProvenanceTimestamp ([string]$record.updatedAt))) { throw 'external provenance updatedAt is not a valid timestamp' }
  return $record
}

Export-ModuleMember -Function Test-BuildProvenanceTimestamp, Read-ValidatedBuildProvenance
