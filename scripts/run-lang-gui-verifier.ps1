[CmdletBinding()]
param(
  [switch]$Negative,
  [switch]$RefreshClassifications,
  [switch]$SealSchemaBounds,
  [switch]$LiveProof,
  [int]$Candidate = 0
)

$ErrorActionPreference = 'Stop'
$selectedModes = @($Negative.IsPresent, $RefreshClassifications.IsPresent, $SealSchemaBounds.IsPresent, $LiveProof.IsPresent) | Where-Object { $_ }
if ($selectedModes.Count -gt 1) {
  throw 'Choose only one verifier mode.'
}
if ($LiveProof -and $Candidate -lt 1) { throw 'LiveProof requires a positive Candidate.' }
if (-not $LiveProof -and $Candidate -ne 0) { throw 'Candidate is valid only with LiveProof.' }
$repoRoot = Split-Path -Parent $PSScriptRoot
$designRoot = Join-Path $repoRoot 'design'
$daemonManifest = Join-Path $designRoot 'apps\daemon\package.json'
$verifier = Join-Path $PSScriptRoot 'verify-lang-gui-elements.mjs'

$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) {
  throw 'Node 24 is unavailable. Run build.bat /s through the approved local build route, then rerun this verifier.'
}
$nodeVersion = (& $node.Source --version 2>$null).Trim()
if ($nodeVersion -notmatch '^v24\.') {
  throw "The verifier requires Node 24 from the approved local build route; found $nodeVersion."
}

$probe = 'const {createRequire}=require("node:module");const r=createRequire(process.argv[1]);const p=r("@babel/parser/package.json");if(p.version!=="7.29.3")process.exit(2);'
& $node.Source -e $probe $daemonManifest 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  $pnpm = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
  if ($pnpm) {
    & $pnpm.Source --dir $designRoot install --filter '@open-design/daemon...' --frozen-lockfile --ignore-scripts
  } else {
    $corepack = Get-Command corepack.cmd -ErrorAction SilentlyContinue
    if (-not $corepack) { throw 'The declared parser is missing and neither pnpm.cmd nor corepack.cmd is available. Run build.bat /s through the approved local build route.' }
    & $corepack.Source pnpm --dir $designRoot install --filter '@open-design/daemon...' --frozen-lockfile --ignore-scripts
  }
  if ($LASTEXITCODE -ne 0) { throw "The locked workspace dependency bootstrap failed with exit code $LASTEXITCODE." }
  & $node.Source -e $probe $daemonManifest 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'The locked workspace install did not provide @babel/parser 7.29.3 from design/apps/daemon/package.json.' }
}

$arguments = @($verifier)
if ($Negative) { $arguments += '--negative' }
elseif ($RefreshClassifications) { $arguments += '--refresh-classifications' }
elseif ($SealSchemaBounds) { $arguments += '--seal-schema-bounds' }
elseif ($LiveProof) { $arguments += @('--live-proof', '--candidate', $Candidate.ToString([Globalization.CultureInfo]::InvariantCulture)) }

& $node.Source @arguments
if ($LASTEXITCODE -ne 0) { throw "The every-element verifier failed with exit code $LASTEXITCODE." }
