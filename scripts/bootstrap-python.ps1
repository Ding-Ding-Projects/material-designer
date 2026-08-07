$ErrorActionPreference = 'Stop'

# The labelled Windows runner enforces an AllSigned policy for downloaded
# PowerShell scripts. This bootstrap is loaded by the workflow's per-process
# ExecutionPolicy Bypass shell and installs Python without invoking an action
# that must load its own unsigned setup.ps1.

$pythonVersion = '3.12.10'
$pythonRelease = '3.12.10-14343898437'
$archiveName = "python-$pythonVersion-win32-x64.zip"
$pythonInstallerName = "python-$pythonVersion-amd64.exe"
$downloadUrl = "https://github.com/actions/python-versions/releases/download/$pythonRelease/$archiveName"
$expectedSha256 = '17E4EE587E0ECEE4674040DA8B248E151475FF65BECAE18FE0EC81F8312B5035'.ToLowerInvariant()

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

  function Find-PythonInstaller([string] $Root) {
    if (-not (Test-Path -LiteralPath $Root -PathType Container)) { return $null }
    return Get-ChildItem -LiteralPath $Root -Filter $pythonInstallerName -File -Recurse | Select-Object -First 1
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
      Write-Host "Downloading $archiveName from the pinned actions/python-versions release"
      Invoke-WebRequest -UseBasicParsing -Uri $downloadUrl -OutFile $downloadPath
      Assert-FileHash $downloadPath
      Move-Item -LiteralPath $downloadPath -Destination $archivePath -Force
    }

    $extractRoot = Join-Path $toolRoot 'archive'
    Remove-Item -LiteralPath $extractRoot -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path $extractRoot | Out-Null
    Expand-Archive -LiteralPath $archivePath -DestinationPath $extractRoot -Force
    $installer = Find-PythonInstaller $extractRoot
    if ($null -eq $installer) { throw "the pinned Python archive did not contain $pythonInstallerName" }

    Remove-Item -LiteralPath $pythonRoot -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path $pythonRoot | Out-Null
    $installerPath = $installer.FullName
    $targetDirArgument = 'TargetDir="' + $pythonRoot + '"'
    $installerArgs = @(
      '/quiet'
      'InstallAllUsers=0'
      $targetDirArgument
      'PrependPath=0'
      'Include_pip=1'
      'Include_test=0'
      'Include_launcher=0'
      'Include_doc=0'
      'Include_tcltk=0'
      'Include_tools=0'
      'Shortcuts=0'
      'AssociateFiles=0'
    )
    Write-Host "Installing Python $pythonVersion into the user-scoped runner cache without loading setup.ps1"
    $installProcess = Start-Process -FilePath $installerPath -ArgumentList ($installerArgs -join ' ') -Wait -PassThru
    if ($null -eq $installProcess) { throw 'Python installer did not return a process result' }
    Write-Host "Python installer exit code: $($installProcess.ExitCode)"
    if (($installProcess.ExitCode -ne 0) -and ($installProcess.ExitCode -ne 3010)) {
      throw "Python installer exited with code $($installProcess.ExitCode)"
    }

    $python = Find-Python $pythonRoot
    if ($null -eq $python) { throw 'the Python installer did not produce python.exe' }
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
