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
  if ($ExpectedCommit -cne $ExpectedCommit.ToLowerInvariant()) { throw 'expected source commit must be lowercase hexadecimal' }
  if ($ExpectedVersion -notmatch '^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$') { throw 'expected package version is not semantic version text' }
  $path = [IO.Path]::GetFullPath($ProvenanceFile)
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "external provenance file was not found: $path" }
  $item = Get-Item -LiteralPath $path
  if ($item.Length -gt 16384) { throw 'external provenance exceeds the 16 KiB input limit' }
  $json = [IO.File]::ReadAllText($path, [Text.UTF8Encoding]::new($false)).Trim()
  if (-not $json.StartsWith('{') -or -not $json.EndsWith('}')) { throw 'external provenance root must be an object' }
  $keys = @([regex]::Matches($json, '"(?<key>(?:\\.|[^"\\])*)"\s*:') | ForEach-Object { $_.Groups['key'].Value })
  $expectedKeys = @('schemaVersion', 'sourceCommit', 'version', 'updatedAt')
  foreach ($key in $expectedKeys) { if (@($keys | Where-Object { $_ -ceq $key }).Count -ne 1) { throw "external provenance must contain exactly one $key property" } }
  if ($keys.Count -ne $expectedKeys.Count -or @($keys | Where-Object { $_ -notin $expectedKeys }).Count -ne 0) { throw 'external provenance contains unknown or duplicate properties' }
  try { $record = $json | ConvertFrom-Json } catch { throw 'external provenance is not valid JSON' }
  if ($json -notmatch '"schemaVersion"\s*:\s*1(?:\s|,|\})' -or $record.schemaVersion -ne 1) { throw 'external provenance schemaVersion must be numeric 1' }
  if ($record.sourceCommit -isnot [string] -or $record.version -isnot [string] -or $record.updatedAt -isnot [string]) { throw 'external provenance identity properties must be strings' }
  if ($record.sourceCommit -notmatch '^[0-9a-f]{40}$' -or $record.sourceCommit -cne $ExpectedCommit) { throw 'external provenance sourceCommit does not match the exact lowercase source commit' }
  if ([string]$record.version -cne $ExpectedVersion) { throw 'external provenance version does not match the exact package version' }
  if (-not (Test-BuildProvenanceTimestamp ([string]$record.updatedAt))) { throw 'external provenance updatedAt is not a valid timestamp' }
  return $record
}

Export-ModuleMember -Function Test-BuildProvenanceTimestamp, Read-ValidatedBuildProvenance
