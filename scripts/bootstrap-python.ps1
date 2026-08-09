$ErrorActionPreference = 'Stop'

# The labelled Windows runner enforces an AllSigned policy for downloaded
# PowerShell scripts and denies the standard Python installer to its service
# account. Use the official embeddable archive so the bootstrap changes no
# registry keys, loads no setup script and needs no installer elevation.

$pythonVersion = '3.12.10'
$archiveName = "python-$pythonVersion-embed-amd64.zip"
$downloadUrl = "https://www.python.org/ftp/python/$pythonVersion/$archiveName"
$expectedSha256 = '4ACBED6DD1C744B0376E3B1CF57CE906F9DC9E95E68824584C8099A63025A3C3'.ToLowerInvariant()

$cacheRoot = $env:RUNNER_TOOL_CACHE
if ([string]::IsNullOrWhiteSpace($cacheRoot)) { $cacheRoot = $env:RUNNER_TEMP }
if ([string]::IsNullOrWhiteSpace($cacheRoot)) { throw 'RUNNER_TOOL_CACHE and RUNNER_TEMP are both unavailable' }
$toolRoot = Join-Path $cacheRoot 'material-designer-python'
$archivePath = Join-Path $toolRoot $archiveName
$pythonRoot = Join-Path $toolRoot "python-$pythonVersion"
$lockPath = Join-Path $toolRoot '.bootstrap.lock'
New-Item -ItemType Directory -Force -Path $toolRoot | Out-Null

$lockStream = $null
for ($attempt = 0; $attempt -lt 120 -and $null -eq $lockStream; $attempt++) {
  try {
    $lockStream = [System.IO.File]::Open($lockPath, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
  } catch {
    Start-Sleep -Seconds 1
  }
}
if ($null -eq $lockStream) { throw 'timed out waiting for the Python tool cache lock' }

try {
  function Assert-FileHash([string] $Path) {
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
    if ($actual -ne $expectedSha256) { throw "SHA-256 mismatch for $Path" }
  }

  function Find-Python([string] $Root) {
    if (-not (Test-Path -LiteralPath $Root -PathType Container)) { return $null }
    return Get-ChildItem -LiteralPath $Root -Filter 'python.exe' -File -Recurse | Select-Object -First 1
  }

  $python = Find-Python $pythonRoot
  if ($null -eq $python) {
    $needsDownload = -not (Test-Path -LiteralPath $archivePath -PathType Leaf)
    if (-not $needsDownload) {
      try { Assert-FileHash $archivePath } catch { $needsDownload = $true }
    }
    if ($needsDownload) {
      $downloadPath = "$archivePath.download"
      Remove-Item -LiteralPath $downloadPath -Force -ErrorAction SilentlyContinue
      Write-Host "Downloading $archiveName from the official Python $pythonVersion release"
      Invoke-WebRequest -UseBasicParsing -Uri $downloadUrl -OutFile $downloadPath
      Assert-FileHash $downloadPath
      Move-Item -LiteralPath $downloadPath -Destination $archivePath -Force
    }

    Remove-Item -LiteralPath $pythonRoot -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path $pythonRoot | Out-Null
    Write-Host "Extracting the official Python $pythonVersion embeddable archive into the user-scoped runner cache"
    Expand-Archive -LiteralPath $archivePath -DestinationPath $pythonRoot -Force
    $python = Find-Python $pythonRoot
    if ($null -eq $python) { throw 'the pinned Python embeddable archive did not contain python.exe' }
  }

  $versionOutput = (& $python.FullName --version 2>&1 | Out-String).Trim()
  if ($versionOutput -ne "Python $pythonVersion") {
    throw "Python bootstrap resolved '$versionOutput', expected Python $pythonVersion"
  }
  $pythonBin = $python.DirectoryName
  $env:Path = "$pythonBin;$env:Path"
  Add-Content -LiteralPath $env:GITHUB_PATH -Value $pythonBin
  Write-Host "Python ready: $versionOutput from $pythonBin"
} finally {
  if ($null -ne $lockStream) { $lockStream.Dispose() }
}
