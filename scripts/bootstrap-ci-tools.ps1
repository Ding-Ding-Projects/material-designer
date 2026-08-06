$ErrorActionPreference = 'Stop'

# Self-hosted Windows runners are persistent and can run jobs concurrently. Keep
# the pinned tools in a user-scoped cache, lock the cache while updating it,
# validate the cached versions, and expose only this cache through GITHUB_PATH.

$toolRoot = Join-Path ($env:RUNNER_TOOL_CACHE ?? $env:RUNNER_TEMP) 'material-designer-ci-tools'
$binDir = Join-Path $toolRoot 'bin'
New-Item -ItemType Directory -Force -Path $binDir | Out-Null

$lockPath = Join-Path $toolRoot '.bootstrap.lock'
$lockStream = $null
for ($attempt = 0; $attempt -lt 120 -and $null -eq $lockStream; $attempt++) {
  try {
    $lockStream = [System.IO.File]::Open($lockPath, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
  } catch {
    Start-Sleep -Seconds 1
  }
}
if ($null -eq $lockStream) { throw 'timed out waiting for the CI tool cache lock' }

try {
  function Download-File([string] $Url, [string] $Destination) {
    Invoke-WebRequest -Uri $Url -OutFile $Destination -UseBasicParsing
  }

  $ghVersion = '2.76.2'
  $jqVersion = '1.8.0'
  $sevenZipVersion = '2501'
  $ghSha256 = '8a4becbad76e44bd59552d57654809aa1700d7c43c7499897a57cbbfbabe62fc'
  $jqSha256 = 'b45fcbb27dcb9e9848ac39889a8bf86457b8d9d31e7c56387c6eab80008fd1f4'
  $sevenZipSha256 = '78afa2a1c773caf3cf7edf62f857d2a8a5da55fb0fff5da416074c0d28b2b55f'
  $ghPath = Join-Path $binDir 'gh.exe'
  $jqPath = Join-Path $binDir 'jq.exe'
  $sevenZipPath = Join-Path $binDir '7z.exe'
  $ghZip = Join-Path $toolRoot "gh-$ghVersion.zip"
  $ghExtract = Join-Path $toolRoot "gh-$ghVersion"
  $jqDownload = Join-Path $binDir 'jq.download'
  $sevenZipInstaller = Join-Path $toolRoot "7z$sevenZipVersion-x64.exe"
  $sevenZipRoot = Join-Path $toolRoot "7zip-$sevenZipVersion"

  function Assert-FileHash([string] $Path, [string] $Expected) {
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
    if ($actual -ne $Expected) { throw "SHA-256 mismatch for $Path" }
  }

  $ghReady = $false
  if ((Test-Path -LiteralPath $ghPath -PathType Leaf) -and (Test-Path -LiteralPath $ghZip -PathType Leaf)) {
    try {
      $ghLine = (& $ghPath --version 2>$null | Select-Object -First 1) -join ''
      $ghReady = $ghLine -like "gh version $ghVersion *"
      if ($ghReady) { Assert-FileHash $ghZip $ghSha256 }
    } catch {
      $ghReady = $false
    }
  }
  if (-not $ghReady) {
    Remove-Item -LiteralPath $ghExtract -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path $ghExtract | Out-Null
    Download-File "https://github.com/cli/cli/releases/download/v$ghVersion/gh_${ghVersion}_windows_amd64.zip" $ghZip
    Assert-FileHash $ghZip $ghSha256
    Expand-Archive -LiteralPath $ghZip -DestinationPath $ghExtract -Force
    $ghExe = Get-ChildItem -LiteralPath $ghExtract -Filter gh.exe -Recurse | Select-Object -First 1
    if ($null -eq $ghExe) { throw 'GitHub CLI archive did not contain gh.exe' }
    Copy-Item -LiteralPath $ghExe.FullName -Destination $ghPath -Force
  }

  $jqReady = $false
  if (Test-Path -LiteralPath $jqPath -PathType Leaf) {
    try {
      $jqLine = (& $jqPath --version 2>$null | Select-Object -First 1) -join ''
      $jqReady = $jqLine -eq "jq-$jqVersion"
      if ($jqReady) { Assert-FileHash $jqPath $jqSha256 }
    } catch {
      $jqReady = $false
    }
  }
  if (-not $jqReady) {
    Download-File "https://github.com/jqlang/jq/releases/download/jq-$jqVersion/jq-windows-amd64.exe" $jqDownload
    Assert-FileHash $jqDownload $jqSha256
    Move-Item -LiteralPath $jqDownload -Destination $jqPath -Force
  }

  $expectedSevenZip = "$($sevenZipVersion.Substring(0, 2)).$($sevenZipVersion.Substring(2, 2))"
  $sevenZipReady = $false
  if ((Test-Path -LiteralPath $sevenZipPath -PathType Leaf) -and (Test-Path -LiteralPath $sevenZipInstaller -PathType Leaf)) {
    try {
      $sevenZipInfo = (& $sevenZipPath i 2>$null | Select-Object -First 3) -join "`n"
      $sevenZipReady = $sevenZipInfo -match [regex]::Escape($expectedSevenZip)
      if ($sevenZipReady) { Assert-FileHash $sevenZipInstaller $sevenZipSha256 }
    } catch {
      $sevenZipReady = $false
    }
  }
  if (-not $sevenZipReady) {
    Remove-Item -LiteralPath $sevenZipRoot -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path $sevenZipRoot | Out-Null
    Download-File "https://github.com/ip7z/7zip/releases/download/25.01/7z$sevenZipVersion-x64.exe" $sevenZipInstaller
    Assert-FileHash $sevenZipInstaller $sevenZipSha256
    $process = Start-Process -FilePath $sevenZipInstaller -ArgumentList @('/S', "/D=`"$sevenZipRoot`"") -Wait -PassThru -WindowStyle Hidden
    if ($process.ExitCode -ne 0) { throw "7-Zip bootstrap exited with code $($process.ExitCode)" }
    $sevenZipExe = Get-ChildItem -LiteralPath $sevenZipRoot -Filter 7z.exe -Recurse | Select-Object -First 1
    if ($null -eq $sevenZipExe) { throw '7-Zip bootstrap did not produce 7z.exe' }
    Copy-Item -LiteralPath $sevenZipExe.FullName -Destination $sevenZipPath -Force
  }

  $env:Path = "$binDir;$env:Path"
  Add-Content -LiteralPath $env:GITHUB_PATH -Value $binDir

  foreach ($tool in @('gh', 'jq', '7z')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
      throw "CI tool bootstrap did not provide $tool"
    }
  }
  if (-not ((gh --version | Select-Object -First 1) -like "gh version $ghVersion *")) { throw 'CI tool bootstrap resolved an unexpected gh version' }
  if ((jq --version) -ne "jq-$jqVersion") { throw 'CI tool bootstrap resolved an unexpected jq version' }
  if (-not (((7z i | Select-Object -First 3) -join "`n") -match [regex]::Escape($expectedSevenZip))) { throw 'CI tool bootstrap resolved an unexpected 7-Zip version' }

  Write-Host "Windows CI tools ready: $((gh --version | Select-Object -First 1)); $(jq --version); $((7z i | Select-Object -First 1))"
} finally {
  if ($null -ne $lockStream) { $lockStream.Dispose() }
}
