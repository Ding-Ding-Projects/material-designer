param(
  [Parameter(Mandatory = $true)][string]$OutputResourceRoot,
  [switch]$TestFaults
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root 'design/tools/pack/resources/win/converter-writer/converter-writer.cpp'
$writerRoot = Join-Path $OutputResourceRoot 'bin/converter-writer'
$executable = Join-Path $writerRoot 'material-designer-converter-writer.exe'
$objectPath = Join-Path $writerRoot 'converter-writer.obj'

function Assert-True([bool]$condition, [string]$message) {
  if (-not $condition) { throw $message }
}

$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
Assert-True (Test-Path -LiteralPath $vswhere) 'vswhere.exe is required to build the Windows converter writer.'
$install = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath | Select-Object -First 1
Assert-True ([string]::IsNullOrWhiteSpace($install) -eq $false) 'An MSVC x64 toolchain is required to build the Windows converter writer.'
$vcvars = Join-Path $install 'VC\Auxiliary\Build\vcvars64.bat'
$environment = & cmd.exe /d /s /c "`"$vcvars`" >nul && set"
foreach ($line in $environment) {
  $separator = $line.IndexOf('=')
  if ($separator -gt 0) { [Environment]::SetEnvironmentVariable($line.Substring(0, $separator), $line.Substring($separator + 1), 'Process') }
}

New-Item -ItemType Directory -Force -Path $writerRoot | Out-Null
$defines = @('/DUNICODE', '/D_UNICODE', '/D_CRT_SECURE_NO_WARNINGS')
if ($TestFaults) { $defines += '/DMDCW_TEST_FAULTS' }
try {
  & cl.exe /nologo /std:c++20 /O2 /W4 /WX /GS /guard:cf @defines /MT /EHsc- /GR- "/Fo:$objectPath" "/Fe:$executable" $source /link /incremental:no /opt:ref /opt:icf /subsystem:console bcrypt.lib
  Assert-True ($LASTEXITCODE -eq 0) 'The Windows converter writer build failed.'
} finally {
  if (Test-Path -LiteralPath $objectPath) { Remove-Item -LiteralPath $objectPath -Force }
}

$exeBytes = [IO.File]::ReadAllBytes($executable)
Assert-True ($exeBytes.Length -ge 1024 -and $exeBytes.Length -le 4194304 -and $exeBytes[0] -eq 0x4d -and $exeBytes[1] -eq 0x5a) 'The writer output is not a bounded PE executable.'
$peOffset = [BitConverter]::ToUInt32($exeBytes, 0x3c)
Assert-True ($peOffset -ge 0x40 -and $exeBytes[$peOffset] -eq 0x50 -and $exeBytes[$peOffset + 1] -eq 0x45 -and [BitConverter]::ToUInt16($exeBytes, $peOffset + 4) -eq 0x8664) 'The writer output is not an x64 PE executable.'
$manifest = [ordered]@{
  bytes = $exeBytes.Length
  file = 'material-designer-converter-writer.exe'
  protocolVersion = 1
  schemaVersion = 1
  sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $executable).Hash.ToLowerInvariant()
  sourceSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $source).Hash.ToLowerInvariant()
  version = '1.0.0'
}
$manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $writerRoot 'manifest.json') -Encoding utf8NoBOM
Write-Output (ConvertTo-Json ([ordered]@{ executable = $executable; manifest = (Join-Path $writerRoot 'manifest.json'); sha256 = $manifest.sha256; bytes = $manifest.bytes }) -Compress)
