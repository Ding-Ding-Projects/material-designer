[CmdletBinding()]
param(
  [string]$Root
)

$ErrorActionPreference = 'Stop'
$rootWasSupplied = -not [string]::IsNullOrWhiteSpace($Root)
if (-not $rootWasSupplied) { $Root = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent }
$validator = Join-Path $Root 'scripts/validate-dim-sum-image.ps1'
$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ("material-designer-photo-validator-" + [Guid]::NewGuid().ToString('N'))
$fixture = Join-Path $fixtureRoot 'codename-hk-dish-0001.png'
$validBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

function Invoke-Validator([string]$ImagePath, [string]$Hash, [long]$Bytes) {
  $previous = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $result = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $validator -Path $ImagePath -ExpectedSha256 $Hash -ExpectedBytes $Bytes 2>&1
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) { Write-Host ($result -join "`n") }
    return $exitCode
  } finally {
    $ErrorActionPreference = $previous
  }
}

try {
  New-Item -ItemType Directory -Force -Path $fixtureRoot | Out-Null
  [IO.File]::WriteAllBytes($fixture, [Convert]::FromBase64String($validBase64))
  $bytes = (Get-Item -LiteralPath $fixture).Length
  $hash = (Get-FileHash -LiteralPath $fixture -Algorithm SHA256).Hash.ToLowerInvariant()

  $initialResult = Invoke-Validator $fixture $hash $bytes
  if ($initialResult -ne 0) { throw 'the restored valid image did not pass the validator' }

  $mutated = [IO.File]::ReadAllBytes($fixture)
  $mutated[$mutated.Length - 1] = $mutated[$mutated.Length - 1] -bxor 1
  [IO.File]::WriteAllBytes($fixture, $mutated)
  if ((Invoke-Validator $fixture $hash $bytes) -eq 0) { throw 'the validator stayed green for a corrupted image' }

  if ((Invoke-Validator (Join-Path $fixtureRoot 'missing.png') $hash $bytes) -eq 0) { throw 'the validator stayed green for a missing image' }

  [IO.File]::WriteAllBytes($fixture, [Convert]::FromBase64String($validBase64))
  if ((Invoke-Validator $fixture $hash $bytes) -ne 0) { throw 'the validator did not return green after restoring the valid image' }
  Write-Output 'PASS: dim-sum image validation turned red for corruption and absence, then green after restoration.'
} finally {
  if (Test-Path -LiteralPath $fixtureRoot) { Remove-Item -LiteralPath $fixtureRoot -Recurse -Force }
}
