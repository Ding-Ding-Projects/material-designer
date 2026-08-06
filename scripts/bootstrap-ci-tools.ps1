$ErrorActionPreference = 'Stop'

# Self-hosted Windows runners are persistent, but the workflow must not assume
# that a previous job left GitHub CLI, jq, or 7-Zip installed. Keep the tools
# in the runner's user-scoped cache and expose them only to this job.

$toolRoot = Join-Path ($env:RUNNER_TOOL_CACHE ?? $env:RUNNER_TEMP) 'material-designer-ci-tools'
$binDir = Join-Path $toolRoot 'bin'
New-Item -ItemType Directory -Force -Path $binDir | Out-Null

function Download-File([string] $Url, [string] $Destination) {
  Invoke-WebRequest -Uri $Url -OutFile $Destination -UseBasicParsing
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  $ghVersion = '2.76.2'
  $ghZip = Join-Path $toolRoot "gh-$ghVersion.zip"
  $ghExtract = Join-Path $toolRoot 'gh'
  Remove-Item -LiteralPath $ghExtract -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path $ghExtract | Out-Null
  Download-File "https://github.com/cli/cli/releases/download/v$ghVersion/gh_${ghVersion}_windows_amd64.zip" $ghZip
  Expand-Archive -LiteralPath $ghZip -DestinationPath $ghExtract -Force
  $ghExe = Get-ChildItem -LiteralPath $ghExtract -Filter gh.exe -Recurse | Select-Object -First 1
  if ($null -eq $ghExe) { throw 'GitHub CLI archive did not contain gh.exe' }
  Copy-Item -LiteralPath $ghExe.FullName -Destination (Join-Path $binDir 'gh.exe') -Force
}

if (-not (Get-Command jq -ErrorAction SilentlyContinue)) {
  $jqVersion = '1.8.0'
  $jqPath = Join-Path $binDir 'jq.exe'
  Download-File "https://github.com/jqlang/jq/releases/download/jq-$jqVersion/jq-windows-amd64.exe" $jqPath
}

if (-not (Get-Command 7z -ErrorAction SilentlyContinue)) {
  $sevenZipVersion = '2501'
  $sevenZipInstaller = Join-Path $toolRoot "7z$sevenZipVersion-x64.exe"
  $sevenZipRoot = Join-Path $toolRoot '7zip'
  Remove-Item -LiteralPath $sevenZipRoot -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path $sevenZipRoot | Out-Null
  Download-File "https://www.7-zip.org/a/7z$sevenZipVersion-x64.exe" $sevenZipInstaller
  $process = Start-Process -FilePath $sevenZipInstaller -ArgumentList @('/S', "/D=`"$sevenZipRoot`"") -Wait -PassThru -WindowStyle Hidden
  if ($process.ExitCode -ne 0) { throw "7-Zip bootstrap exited with code $($process.ExitCode)" }
  $sevenZipExe = Get-ChildItem -LiteralPath $sevenZipRoot -Filter 7z.exe -Recurse | Select-Object -First 1
  if ($null -eq $sevenZipExe) { throw '7-Zip bootstrap did not produce 7z.exe' }
  Copy-Item -LiteralPath $sevenZipExe.FullName -Destination (Join-Path $binDir '7z.exe') -Force
}

$env:Path = "$binDir;$env:Path"
Add-Content -LiteralPath $env:GITHUB_PATH -Value $binDir

foreach ($tool in @('gh', 'jq', '7z')) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    throw "CI tool bootstrap did not provide $tool"
  }
}

Write-Host "Windows CI tools ready: $((gh --version | Select-Object -First 1)); $(jq --version); $((7z i | Select-Object -First 1))"
