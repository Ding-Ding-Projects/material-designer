[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateRange(1, 2147483647)]
  [int]$Candidate,
  [switch]$Silent,
  [switch]$ReusePackResult
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$design = Join-Path $repo 'design'
$stateRoot = Join-Path $repo '.yum-tong\installer'
$runRoot = Join-Path $stateRoot ("candidate-{0}" -f $Candidate)
New-Item -ItemType Directory -Force -Path $runRoot | Out-Null

function Invoke-Checked([string]$File, [string[]]$Arguments, [string]$Description) {
  Write-Host $Description
  & $File @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Description failed with exit code $LASTEXITCODE" }
}

function Get-Sha256([string]$Path) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $stream = [IO.File]::OpenRead($Path)
    try { return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose() }
  } finally { $sha.Dispose() }
}

function Get-SignatureStatus([string]$Path) {
  $command = Get-Command Get-AuthenticodeSignature -ErrorAction SilentlyContinue
  if ($command) {
    try {
      $result = & $command -LiteralPath $Path -ErrorAction Stop
      if ($result -and $result.Status) { return $result.Status.ToString() }
    } catch {
      # Windows PowerShell can discover this cmdlet while failing to load its
      # security module. Fall through to the installed PowerShell 7 host.
    }
  }
  $pwsh = Get-Command pwsh.exe -ErrorAction SilentlyContinue
  if ($pwsh) {
    $oldPath = $env:YUM_TONG_SIGNATURE_PATH
    $env:YUM_TONG_SIGNATURE_PATH = $Path
    try {
      $status = & $pwsh.Source -NoProfile -Command '$s = Get-AuthenticodeSignature -LiteralPath $env:YUM_TONG_SIGNATURE_PATH; [Console]::Out.Write($s.Status.ToString())' 2>$null
      if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($status)) { return $status.Trim() }
    } finally {
      if ($null -eq $oldPath) { Remove-Item Env:YUM_TONG_SIGNATURE_PATH -ErrorAction SilentlyContinue }
      else { $env:YUM_TONG_SIGNATURE_PATH = $oldPath }
    }
  }
  throw 'could not obtain a Windows Authenticode status from Windows PowerShell or PowerShell 7'
}

& (Join-Path $PSScriptRoot 'build.ps1') -Silent
if ($LASTEXITCODE -ne 0) { throw 'the prerequisite build did not complete' }

$pkg = Get-Content -Raw -LiteralPath (Join-Path $design 'package.json') | ConvertFrom-Json
$base = [version]$pkg.version
$appVersion = "{0}.{1}.{2}" -f $base.Major, $base.Minor, ($base.Build + $Candidate)
$packDir = Join-Path $runRoot 'pack'
$cacheDir = Join-Path $runRoot 'cache'
$jsonPath = Join-Path $runRoot 'tools-pack.json'
New-Item -ItemType Directory -Force -Path $packDir, $cacheDir | Out-Null

if (-not ($ReusePackResult -and (Test-Path -LiteralPath $jsonPath))) {
  $previousErrorAction = $ErrorActionPreference
  try {
    # pnpm writes phase diagnostics to stderr even when packaging succeeds. Windows
    # PowerShell promotes native stderr to ErrorRecords under Stop, so collect it
    # without turning a healthy pack into a false failure; the exit code remains
    # the deciding result.
    $ErrorActionPreference = 'Continue'
    $output = & pnpm.cmd --dir $design exec tools-pack win build --dir $packDir --cache-dir $cacheDir --namespace release-stable-win --portable --app-version $appVersion --to all --json 2>&1
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorAction
  }
  if ($exitCode -ne 0) { throw "tools-pack Windows packaging failed with exit code $exitCode`n$($output -join [Environment]::NewLine)" }
  $output | Set-Content -LiteralPath $jsonPath -Encoding utf8
} else {
  Write-Host "Reusing the existing tools-pack result at $jsonPath"
}
$jsonText = Get-Content -Raw -LiteralPath $jsonPath
# The packer emits human-readable phase lines before one pretty-printed JSON
# document. Parsing individual output records misses that document because its
# properties span many lines (and native stderr records are not always strings).
# Find the final top-level JSON object and parse it as one document instead.
$jsonStart = $jsonText.LastIndexOf("`n{")
if ($jsonStart -lt 0) { $jsonStart = $jsonText.IndexOf('{') - 1 }
$json = $null
if ($jsonStart -ge 0) {
  $jsonCandidateText = $jsonText.Substring($jsonStart + 1).Trim()
  try { $json = $jsonCandidateText | ConvertFrom-Json } catch { $json = $null }
}
if ($null -eq $json) { throw "tools-pack produced no JSON result; see $jsonPath" }

$setup = $json.squirrelSetupPath
if ([string]::IsNullOrWhiteSpace($setup)) { $setup = $json.installerPath }
if ([string]::IsNullOrWhiteSpace($setup) -or -not (Test-Path -LiteralPath $setup)) { throw "the packer did not produce Setup.exe" }
$signatureStatus = Get-SignatureStatus $setup
if ($signatureStatus -ne 'NotSigned') { throw "Setup.exe Authenticode status was $signatureStatus; unsigned packaging requires NotSigned" }

$setupItem = Get-Item -LiteralPath $setup
$squirrelRoot = $setupItem.DirectoryName
$releases = Get-ChildItem -LiteralPath $squirrelRoot -Recurse -File -Filter RELEASES | Select-Object -First 1
if (-not $releases) { throw 'the Squirrel RELEASES index was not produced' }
$full = @(Get-ChildItem -LiteralPath $squirrelRoot -Recurse -File -Filter '*-full.nupkg')
if ($full.Count -eq 0) { throw 'the Squirrel full .nupkg package was not produced' }
$delta = @(Get-ChildItem -LiteralPath $squirrelRoot -Recurse -File -Filter '*-delta.nupkg')
$portable = $null
if ($json.portableZipPath -and (Test-Path -LiteralPath $json.portableZipPath)) { $portable = Get-Item -LiteralPath $json.portableZipPath }

$assetDir = Join-Path $runRoot 'assets'
New-Item -ItemType Directory -Force -Path $assetDir | Out-Null
$setupName = "material-designer-$appVersion-win-x64-setup.exe"
Copy-Item -LiteralPath $setupItem.FullName -Destination (Join-Path $assetDir $setupName) -Force
Copy-Item -LiteralPath $releases.FullName -Destination (Join-Path $assetDir 'RELEASES') -Force
foreach ($item in @($full + $delta)) { Copy-Item -LiteralPath $item.FullName -Destination (Join-Path $assetDir $item.Name) -Force }
$icon = Join-Path $design 'tools/pack/resources/win/icon.ico'
if (Test-Path -LiteralPath $icon) { Copy-Item -LiteralPath $icon -Destination (Join-Path $assetDir 'material-designer.ico') -Force }
if ($portable) { Copy-Item -LiteralPath $portable.FullName -Destination (Join-Path $assetDir "material-designer-$appVersion-win-x64-portable.zip") -Force }
$hash = Get-Sha256 (Join-Path $assetDir $setupName)
"$hash  $setupName" | Set-Content -LiteralPath (Join-Path $assetDir "$setupName.sha256") -Encoding ascii

$sha = (& git -C $repo rev-parse HEAD).Trim()
$manifest = [ordered]@{
  schemaVersion = 1
  commit = $sha
  candidate = $Candidate
  version = $appVersion
  signed = $false
  signatureStatus = $signatureStatus
  setup = $setupName
  setupSha256 = $hash
  setupBytes = (Get-Item -LiteralPath (Join-Path $assetDir $setupName)).Length
  releases = 'RELEASES'
  fullPackages = @($full | ForEach-Object Name)
  deltaPackages = @($delta | ForEach-Object Name)
  portable = if ($portable) { "material-designer-$appVersion-win-x64-portable.zip" } else { $null }
  generatedAt = (Get-Date).ToUniversalTime().ToString('o')
}
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $runRoot 'installer-manifest.json') -Encoding utf8
Write-Host "Unsigned installer: $([IO.Path]::GetFullPath((Join-Path $assetDir $setupName)))"
Write-Host "SHA-256: $hash"
Write-Host "Manifest: $([IO.Path]::GetFullPath((Join-Path $runRoot 'installer-manifest.json')))"
