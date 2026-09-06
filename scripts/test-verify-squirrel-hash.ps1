[CmdletBinding()]
param([string]$Root = '')

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Root)) { $Root = Split-Path -Parent $PSScriptRoot }
$path = Join-Path $Root 'scripts\verify-squirrel-artifacts.ps1'
$source = Get-Content -Raw -LiteralPath $path
foreach ($needle in @('[Security.Cryptography.SHA1]::Create()', '[Security.Cryptography.SHA256]::Create()', '[IO.File]::OpenRead($Path)')) {
  if ($source -notmatch [regex]::Escape($needle)) { throw "validator is missing $needle" }
}
if ($source -match 'Get-FileHash') { throw 'validator still depends on Get-FileHash' }
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('squirrel-hash-' + [guid]::NewGuid().ToString('N'))
try {
  [IO.File]::WriteAllText($fixture, 'hash fixture', [Text.UTF8Encoding]::new($false))
  $expectedHash = [Security.Cryptography.SHA256]::Create()
  try { $expected = ([BitConverter]::ToString($expectedHash.ComputeHash([Text.Encoding]::UTF8.GetBytes('hash fixture')))).Replace('-', '').ToLowerInvariant() }
  finally { $expectedHash.Dispose() }
  $actual = & powershell.exe -NoProfile -Command "`$h=[Security.Cryptography.SHA256]::Create(); try { `$s=[IO.File]::OpenRead('$fixture'); try { ([BitConverter]::ToString(`$h.ComputeHash(`$s))).Replace('-','').ToLowerInvariant() } finally { `$s.Dispose() } } finally { `$h.Dispose() }"
  if ($LASTEXITCODE -ne 0 -or $actual.Trim() -ne $expected) { throw 'Windows PowerShell native SHA-256 fixture did not match' }
} finally { if (Test-Path -LiteralPath $fixture) { Remove-Item -LiteralPath $fixture -Force } }
Write-Output 'PASS: Squirrel validator uses native SHA-1/SHA-256 streaming without Get-FileHash.'
