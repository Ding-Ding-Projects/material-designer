$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$InventoryPath = Join-Path $Root '.codex/verification/design-parity/inventory.json'
$RoutesPath = Join-Path $Root '.codex/verification/design-parity/routes.json'
$ReferencePath = Join-Path $Root 'mockups/open-design-m3/Open Design M3.dc.html'
$ReferenceSourcePath = Join-Path $Root 'tools/design-reference-app/main.mjs'
$Inventory = Get-Content -LiteralPath $InventoryPath -Raw | ConvertFrom-Json
$Routes = Get-Content -LiteralPath $RoutesPath -Raw | ConvertFrom-Json
$ReferenceSource = Get-Content -LiteralPath $ReferenceSourcePath -Raw
$RouteContractSource = Get-Content -LiteralPath (Join-Path $Root 'tools/design-reference-app/parity-route-contract.mjs') -Raw
$StrictJsonSource = Get-Content -LiteralPath (Join-Path $Root 'scripts/strict-json.mjs') -Raw
$ProductionSource = Get-Content -LiteralPath (Join-Path $Root 'scripts/design-parity-production.mjs') -Raw
$EvidenceContractSource = Get-Content -LiteralPath (Join-Path $Root 'scripts/design-parity-evidence-contract.mjs') -Raw
$VerifierSource = Get-Content -LiteralPath (Join-Path $Root 'scripts/verify-design-parity.mjs') -Raw
$PngSource = Get-Content -LiteralPath (Join-Path $Root 'scripts/design-parity-png.mjs') -Raw
$DesktopPreludeSource = Get-Content -LiteralPath (Join-Path $Root 'design/apps/desktop/src/main/deterministic-capture-prelude.ts') -Raw
$DesktopRuntimeSource = Get-Content -LiteralPath (Join-Path $Root 'design/apps/desktop/src/main/runtime.ts') -Raw

$ExpectedIds = @('home-default-light','projects-default-light','design-systems-default-light','automations-default-light','plugins-default-light','integrations-default-light','studio-default-light','library-default-light','settings-appearance-light','handoff-default-light')
$ExpectedPaths = @('/','/projects','/design-systems','/automations','/plugins','/integrations','/studio','/library','/settings/appearance','/handoff')
$ExpectedQueryKeys = @('state','theme','width','height','scale','locale','fixture','time','motion','random','fonts','network')
$ExpectedIdentityFields = @('surfaceId','featureId','routeId','screen','state','theme','locale','viewportWidth','viewportHeight','displayScale','fixtureRevision','frozenTime','motion','randomSeed','bundledFontRevision','network','headlessRoute','rendererWitness','captureSettledWitness')
$ExpectedEvidenceTargets = @('referenceRaw','referenceReceipt','applicationRaw','applicationReceipt','comparison','diff')
$ExpectedInspectionFields = @('originalOpened','semanticStateConfirmed','clippingChecked','visualDefectIds')
$ExpectedRouteNegatives = @('inventory.row_ids','route.registry_ids','route.duplicate_path','route.commented_registration','route.detached_registration','reference.file_missing','reference.hash_stale','route.reference_tuple','route.application_tuple','tuple.nondeterministic_source','capture.network_policy','audit.control_audit','evidence.referenceRaw.target','evidence.applicationRaw.target','evidence.comparison.target','evidence.diff.target','evidence.hash','evidence.inspection','deviation.reason','deviation.approval','schema.recursive_validation','reference.dependencies','reference.reparse','route.reference_observation','witness.deep_freeze','witness.post_settle','png.critical_chunk','png.palette_transparency','png.inflate_bounds','source.production_helpers')
$ExpectedDependencies = @(
  'mockups/open-design-m3/support.js',
  'mockups/open-design-m3/assets/logo.svg',
  'mockups/open-design-m3/assets/brand-icon.svg',
  'tools/design-reference-app/font-runtime.css',
  'design/apps/web/public/fonts/roboto-flex/roboto-flex-latin.woff2',
  'design/apps/web/public/fonts/roboto-mono/roboto-mono-latin.woff2',
  'design/apps/web/public/fonts/material-symbols/material-symbols-rounded.woff2'
)

function Stop-Contract([string]$Code, [string]$Detail) { throw [System.InvalidOperationException]::new("$Code`: $Detail") }
function Require-Contract([bool]$Condition, [string]$Code, [string]$Detail) { if (-not $Condition) { Stop-Contract $Code $Detail } }
function Join-Exact([object[]]$Values) { return (($Values | ForEach-Object { [string]$_ }) -join ([char]0x1f)) }

function Assert-Production-Wiring([string]$Launcher, [string]$Contract, [string]$Verifier) {
  Require-Contract ($Launcher -match '(?m)^import \{ loadAndPinParityRegistries \} from ''\.\./\.\./scripts/design-parity-production\.mjs'';$') 'source.launcher_import' 'launcher strict production import is missing, commented, or detached'
  Require-Contract ($Launcher -match '(?m)^const \{ routes, inventory, pinnedReference \} = loadAndPinParityRegistries\(repositoryRoot\);$') 'source.launcher_call' 'launcher strict production call is missing, commented, or detached'
  Require-Contract ($Launcher -match '(?m)^const firstRendererSnapshot = await readRendererOwnedSnapshot\(window\);$') 'source.renderer_read' 'launcher does not read renderer-owned state'
  Require-Contract ($Launcher -match '(?m)^const acceptedSnapshot = validateReferenceLauncherReadiness\(requested, pinnedReference\.reference, firstSnapshot\);$') 'source.readiness_call' 'launcher production readiness helper is detached'
  Require-Contract ($Launcher -match '(?m)^requireReferencePostSettleMatch\(requested, pinnedReference\.reference, acceptedSnapshot, postSettleSnapshot\);$') 'source.post_settle_call' 'launcher production post-settle helper is detached'
  Require-Contract ($Launcher -notmatch 'JSON\.parse\s*\(') 'source.launcher_json' 'launcher bypasses strict JSON'
  Require-Contract ($Contract -notmatch 'JSON\.parse\s*\(') 'source.contract_json' 'route contract bypasses strict JSON'
  Require-Contract ($Verifier -match '(?m)^import \{ validateDesignParityReceipt \} from ''\./design-parity-evidence-contract\.mjs'';$') 'source.receipt_import' 'verifier production receipt import is missing, commented, or detached'
  Require-Contract ($Verifier -match '(?m)^\s{4}validateDesignParityReceipt\(receipt, \{$') 'source.receipt_call' 'verifier production receipt helper call is missing, commented, or detached'
  return $true
}

function Get-RouteParts([string]$Raw, [string]$Protocol, [string]$TupleCode) {
  $prefix = "$Protocol//"
  Require-Contract ($Raw.StartsWith($prefix, [System.StringComparison]::Ordinal)) $TupleCode 'route protocol is not exact'
  $tail = $Raw.Substring($prefix.Length)
  Require-Contract ($tail -notmatch '[#@]') $TupleCode 'route has an unexpected fragment or authority'
  $parts = $tail.Split('?', 2)
  Require-Contract (($parts.Count -eq 2) -and ($parts[0].Length -gt 0)) $TupleCode 'route screen or query is missing'
  $pairs = $parts[1].Split('&')
  $keys = @($pairs | ForEach-Object { ($_ -split '=', 2)[0] })
  Require-Contract ((Join-Exact $keys) -eq (Join-Exact $ExpectedQueryKeys)) 'route.query_keys' 'route query keys are missing, duplicated, extra, or out of order'
  $values = @{}
  foreach ($pair in $pairs) {
    $kv = $pair.Split('=', 2)
    Require-Contract ($kv.Count -eq 2) $TupleCode 'route query value is missing'
    $values[$kv[0]] = [Uri]::UnescapeDataString($kv[1])
  }
  return [pscustomobject]@{ screen = $parts[0]; values = $values }
}

function Assert-TupleRoute($Row, [string]$Raw, [string]$Protocol, [string]$Code) {
  $parsed = Get-RouteParts $Raw $Protocol $Code
  Require-Contract ($parsed.screen -eq $Row.tuple.screen) $Code 'route screen disagrees with tuple'
  $v = $parsed.values
  foreach ($key in @('state','theme','locale','fixture','time','motion','fonts','network')) {
    $tupleKey = @{ fixture = 'fixtureRevision' }[$key]; if (-not $tupleKey) { $tupleKey = $key }
    if ($key -eq 'time') {
      Require-Contract (([DateTime]::Parse($v[$key]).ToUniversalTime()) -eq ([DateTime]$Row.tuple.$tupleKey).ToUniversalTime()) $Code 'route time disagrees with tuple'
    } else {
      Require-Contract (($v[$key]) -eq ([string]$Row.tuple.$tupleKey)) $Code "route $key disagrees with tuple"
    }
  }
  Require-Contract (([int]$v.width -eq [int]$Row.tuple.viewport.width) -and ([int]$v.height -eq [int]$Row.tuple.viewport.height)) $Code 'route viewport disagrees with tuple'
  Require-Contract (([double]$v.scale -eq [double]$Row.tuple.scale) -and ([int]$v.random -eq [int]$Row.tuple.randomSeed)) $Code 'route numeric tuple disagrees'
}

function Assert-Contract($Inv, $Reg, [string]$Source) {
  Require-Contract ((Join-Exact @($Reg.routes.id)) -eq (Join-Exact $ExpectedIds)) 'route.registry_ids' 'route registry ids drifted'
  Require-Contract ((Join-Exact @($Inv.rows.id)) -eq (Join-Exact $ExpectedIds)) 'inventory.row_ids' 'inventory row ids drifted'
  if (-not (Test-Path -LiteralPath (Join-Path $Root $Inv.reference.path))) { Stop-Contract 'reference.file_missing' 'reference file is missing' }
  Require-Contract ($Inv.reference.path -eq 'mockups/open-design-m3/Open Design M3.dc.html') 'reference.path' 'reference path is not canonical'
  $actualHash = (Get-FileHash -LiteralPath $ReferencePath -Algorithm SHA256).Hash.ToLowerInvariant()
  Require-Contract (($actualHash) -eq $Inv.reference.sha256) 'reference.hash_stale' 'reference hash does not match on-disk bytes'
  Require-Contract ((Join-Exact @($Inv.reference.dependencies.path)) -eq (Join-Exact $ExpectedDependencies)) 'reference.dependencies' 'reference dependencies are missing, duplicated, extra, or reordered'
  foreach ($dependency in @($Inv.reference.dependencies)) {
    $dependencyPath = Join-Path $Root $dependency.path
    Require-Contract (Test-Path -LiteralPath $dependencyPath -PathType Leaf) 'reference.dependency_missing' "reference dependency is missing: $($dependency.path)"
    $dependencyItem = Get-Item -LiteralPath $dependencyPath -Force
    Require-Contract (($dependencyItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) 'reference.dependency_reparse' "reference dependency uses a reparse point: $($dependency.path)"
    $dependencyHash = (Get-FileHash -LiteralPath $dependencyPath -Algorithm SHA256).Hash.ToLowerInvariant()
    Require-Contract ($dependencyHash -eq $dependency.sha256) 'reference.dependency_hash' "reference dependency hash is stale: $($dependency.path)"
  }
  Require-Contract ($Source -notmatch '(?m)\bMath\.random\s*\(\)|\bDate\.now\s*\(\)|new\s+Date\s*\(\s*\)') 'tuple.nondeterministic_source' 'reference route source contains an unbound clock or random draw'
  Require-Contract (($RouteContractSource -match 'export function evaluateCaptureNetwork') -and ($RouteContractSource -match 'capture\.network_unexpected_blocked') -and ($RouteContractSource -match 'export function createObservedParityWitness') -and ($RouteContractSource -match 'export function requireParityWitnessMatch')) 'witness.contract' 'network isolation and immutable witness functions are missing'
  Require-Contract (($Inv.routeIdentity.version -eq 1) -and ($Inv.routeIdentity.surfaceId -eq 'desktop-application') -and ($Inv.routeIdentity.headlessRoute -eq 'cheap-lowlevel-headless') -and ($Inv.routeIdentity.networkPolicy -eq 'disabled') -and ($Inv.routeIdentity.blockedRequestPolicy -eq 'fail')) 'route.identity_policy' 'route identity policy is incomplete'
  Require-Contract ((Join-Exact @($Inv.routeIdentity.fields)) -eq (Join-Exact $ExpectedIdentityFields)) 'route.identity_fields' 'route identity fields drifted'
  Require-Contract (($Inv.auditContract.controlAuditRequired -eq $true) -and ((Join-Exact @($Inv.auditContract.requiredFields)) -eq (Join-Exact @('id','primitive','region','locator','status','note')))) 'audit.control_audit' 'per-control audit requirements are missing'
  Require-Contract (($Inv.evidenceContract.captureEvidenceRequired -eq $true) -and ((Join-Exact @($Inv.evidenceContract.requiredTargets)) -eq (Join-Exact $ExpectedEvidenceTargets))) 'evidence.hash' 'evidence target requirements are missing'
  Require-Contract ((Join-Exact @($Inv.evidenceContract.requiredInspectionFields)) -eq (Join-Exact $ExpectedInspectionFields)) 'evidence.inspection' 'inspection requirements are missing'
  Require-Contract ((Join-Exact @($Reg.negativeRegressions)) -eq (Join-Exact $ExpectedRouteNegatives)) 'negative.registry' 'route negative registry drifted'
  $seen = @{}
  for ($n = 0; $n -lt $ExpectedIds.Count; $n++) {
    $row = $Inv.rows[$n]; $route = $Reg.routes[$n]
    Assert-TupleRoute $row $row.referenceRoute 'design-reference:' 'route.reference_tuple'
    Assert-TupleRoute $row $row.applicationRoute 'material-designer:' 'route.application_tuple'
    Require-Contract (-not $seen.ContainsKey($route.browserPath)) 'route.duplicate_path' "duplicate browser path $($route.browserPath)"
    if ($route.browserPath.StartsWith('#')) { Stop-Contract 'route.commented_registration' "$($row.id) route registration is commented or detached" }
    Require-Contract ($route.browserPath -eq $ExpectedPaths[$n]) 'route.browser_path' "$($row.id) browser path is not canonical"
    $seen[$route.browserPath] = $true
    if ($route.identity.routeId -ne $row.id) { Stop-Contract 'route.detached_registration' "$($row.id) route identity is detached" }
    Require-Contract (($route.identity.surfaceId -eq 'desktop-application') -and ($route.identity.featureId -eq $row.id)) 'route.identity' "$($row.id) route identity is incomplete"
    Require-Contract (($route.referenceObservation.selector -eq 'main > header h1') -and (-not [string]::IsNullOrWhiteSpace([string]$route.referenceObservation.text))) 'route.reference_observation' "$($row.id) renderer observation is missing"
    Require-Contract (($route.capture.headlessRoute -eq 'cheap-lowlevel-headless') -and ($route.capture.network -eq 'disabled') -and ($route.capture.blockedRequestPolicy -eq 'fail') -and ($route.capture.rendererWitnessRequired -eq $true) -and ($route.capture.captureSettledWitnessRequired -eq $true)) 'capture.network_policy' "$($row.id) capture isolation is incomplete"
    Require-Contract (($row.auditStatus -eq 'pending') -and ($row.captureStatus -eq 'pending') -and ($row.matrixStatus -eq 'pending')) 'evidence.status' "$($row.id) evidence must remain pending"
    foreach ($targetKey in $ExpectedEvidenceTargets) {
      $targetValue = $row.evidenceTargets.$targetKey
      if ([string]::IsNullOrWhiteSpace([string]$targetValue)) { Stop-Contract "evidence.$targetKey.target" "$($row.id) evidence target is missing" }
    }
    foreach ($deviation in @($row.deviations)) {
      if ([string]::IsNullOrWhiteSpace([string]$deviation.reason)) { Stop-Contract 'deviation.reason' "$($row.id) deviation reason is missing" }
      Require-Contract ($deviation.approved -eq $true) 'deviation.approval' "$($row.id) deviation is not reviewed"
    }
  }
  return $true
}

Assert-Contract $Inventory $Routes $ReferenceSource | Out-Null
Assert-Production-Wiring $ReferenceSource $RouteContractSource $VerifierSource | Out-Null
Require-Contract (($StrictJsonSource -match 'export function validateJsonSchema') -and ($StrictJsonSource -match 'schema\.additional_property') -and ($StrictJsonSource -match 'json\.duplicate_key') -and ($StrictJsonSource -match 'json\.number_bounds')) 'source.strict_json' 'shared strict JSON/schema implementation is incomplete'
Require-Contract (($ProductionSource -match 'export function assertNoPathIndirection') -and ($ProductionSource -match 'junction, mount point, reparse point, or realpath indirection') -and ($ProductionSource -match 'pinCanonicalParityReferenceGraph')) 'source.reparse' 'production path pinning or reparse refusal is incomplete'
Require-Contract (($EvidenceContractSource -match 'export function validateDesignParityReceipt') -and ($EvidenceContractSource -match 'DESIGN_PARITY_RECEIPT_SCHEMA')) 'source.receipt_helper' 'production receipt validator is missing'
Require-Contract (($PngSource -match 'unknown critical PNG chunk') -and ($PngSource -match 'maxOutputLength: expected') -and ($PngSource -match 'PNG tRNS') -and ($PngSource -match 'idatClosed')) 'source.png_strict' 'strict PNG critical-chunk, inflate, transparency, or IDAT sequencing boundary is missing'
Require-Contract (($DesktopPreludeSource -match 'const deepFreeze = \(value, seen = new WeakSet\(\)\)') -and ($DesktopPreludeSource -match '__MATERIAL_DESIGNER_CAPTURE_IDENTITY__') -and ($DesktopPreludeSource -match '__MATERIAL_DESIGNER_DEEP_FREEZE__')) 'source.desktop_prelude_freeze' 'desktop renderer prelude is not recursively freezing tuple and identity state'
Require-Contract (($DesktopRuntimeSource -match 'const deepFreeze = globalThis\.__MATERIAL_DESIGNER_DEEP_FREEZE__') -and ($DesktopRuntimeSource -match 'return deepFreeze\(\{')) 'source.desktop_witness_freeze' 'desktop renderer readiness does not freeze its observed witness graph'

$BrokenLauncherImport = $ReferenceSource -replace '(?m)^import \{ loadAndPinParityRegistries \}', '// import { loadAndPinParityRegistries }'
$BrokenLauncherCall = $ReferenceSource -replace 'loadAndPinParityRegistries\(repositoryRoot\)', 'loadAndPinParityRegistriesDetached(repositoryRoot)'
$BrokenVerifierImport = $VerifierSource -replace '(?m)^import \{ validateDesignParityReceipt \}', '// import { validateDesignParityReceipt }'
$BrokenVerifierCall = $VerifierSource -replace '(?m)^\s{4}validateDesignParityReceipt\(receipt, \{$', '    validateDesignParityReceiptDetached(receipt, {'
foreach ($sourceCase in @(
  @{ Code = 'source.launcher_import'; Launcher = $BrokenLauncherImport; Verifier = $VerifierSource },
  @{ Code = 'source.launcher_call'; Launcher = $BrokenLauncherCall; Verifier = $VerifierSource },
  @{ Code = 'source.receipt_import'; Launcher = $ReferenceSource; Verifier = $BrokenVerifierImport },
  @{ Code = 'source.receipt_call'; Launcher = $ReferenceSource; Verifier = $BrokenVerifierCall }
)) {
  $actual = $null
  try { Assert-Production-Wiring $sourceCase.Launcher $RouteContractSource $sourceCase.Verifier | Out-Null } catch { $actual = $_.Exception.Message.Split(':')[0] }
  Require-Contract ($actual -eq $sourceCase.Code) 'source.negative' "$($sourceCase.Code) mutation returned $actual"
}

$FixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ("design-parity-reparse-" + [Guid]::NewGuid().ToString('N'))
try {
  $target = New-Item -ItemType Directory -Path (Join-Path $FixtureRoot 'target') -Force
  Set-Content -LiteralPath (Join-Path $target.FullName 'reference.html') -Value 'fixture' -NoNewline
  $junctionPath = Join-Path $FixtureRoot 'junction'
  $junction = New-Item -ItemType Junction -Path $junctionPath -Target $target.FullName
  Require-Contract (($junction.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) 'path.reparse_fixture' 'junction fixture did not expose the reparse-point attribute'
  Require-Contract ((Resolve-Path -LiteralPath $junctionPath).Path -ne (Resolve-Path -LiteralPath $target.FullName).Path) 'path.reparse_fixture' 'junction fixture unexpectedly resolved as a regular directory'
} finally {
  if (Test-Path -LiteralPath $FixtureRoot) { Remove-Item -LiteralPath $FixtureRoot -Recurse -Force }
}
$Cases = @(
  @{ Code = 'inventory.row_ids'; Mutate = { param($i,$r,$s) $i.rows = @($i.rows | Select-Object -First ($i.rows.Count - 1)) } },
  @{ Code = 'route.registry_ids'; Mutate = { param($i,$r,$s) $r.routes = @($r.routes | Select-Object -First ($r.routes.Count - 1)) } },
  @{ Code = 'route.duplicate_path'; Mutate = { param($i,$r,$s) $r.routes[1].browserPath = $r.routes[0].browserPath } },
  @{ Code = 'route.commented_registration'; Mutate = { param($i,$r,$s) $r.routes[0].browserPath = '# commented registration' } },
  @{ Code = 'route.detached_registration'; Mutate = { param($i,$r,$s) $r.routes[0].identity.routeId = 'detached-route' } },
  @{ Code = 'route.reference_observation'; Mutate = { param($i,$r,$s) $r.routes[0].referenceObservation.text = '' } },
  @{ Code = 'reference.file_missing'; Mutate = { param($i,$r,$s) $i.reference.path = 'missing/reference.html' } },
  @{ Code = 'reference.hash_stale'; Mutate = { param($i,$r,$s) $i.reference.sha256 = ('0' * 64) } },
  @{ Code = 'reference.dependencies'; Mutate = { param($i,$r,$s) $i.reference.dependencies = @($i.reference.dependencies | Select-Object -First ($i.reference.dependencies.Count - 1)) } },
  @{ Code = 'route.reference_tuple'; Mutate = { param($i,$r,$s) $i.rows[0].referenceRoute = $i.rows[0].referenceRoute.Replace('//home?', '//other-screen?') } },
  @{ Code = 'route.application_tuple'; Mutate = { param($i,$r,$s) $i.rows[0].applicationRoute = $i.rows[0].applicationRoute.Replace('//home?', '//other-screen?') } },
  @{ Code = 'tuple.nondeterministic_source'; Mutate = { param($i,$r,$s) $s = $s + "`nMath.random();" } },
  @{ Code = 'capture.network_policy'; Mutate = { param($i,$r,$s) $r.routes[0].capture.network = 'enabled' } },
  @{ Code = 'audit.control_audit'; Mutate = { param($i,$r,$s) $i.auditContract.requiredFields = @($i.auditContract.requiredFields | Select-Object -First 5) } },
  @{ Code = 'evidence.referenceRaw.target'; Mutate = { param($i,$r,$s) $i.rows[0].evidenceTargets.referenceRaw = '' } },
  @{ Code = 'evidence.hash'; Mutate = { param($i,$r,$s) $i.evidenceContract.requiredTargets[0] = 'wrongHashTarget' } },
  @{ Code = 'evidence.inspection'; Mutate = { param($i,$r,$s) $i.evidenceContract.requiredInspectionFields[0] = 'wrongInspectionField' } },
  @{ Code = 'deviation.reason'; Mutate = { param($i,$r,$s) $i.rows[9].deviations[0].reason = '' } },
  @{ Code = 'deviation.approval'; Mutate = { param($i,$r,$s) $i.rows[9].deviations[0].approved = $false } }
)
$Results = @()
foreach ($case in $Cases) {
  $i = Get-Content -LiteralPath $InventoryPath -Raw | ConvertFrom-Json
  $r = Get-Content -LiteralPath $RoutesPath -Raw | ConvertFrom-Json
  $s = $ReferenceSource
  if ($case.Code -eq 'tuple.nondeterministic_source') { $s = $s + "`nMath.random();" } else { & $case.Mutate $i $r $s }
  $actual = $null
  try { Assert-Contract $i $r $s | Out-Null } catch { $actual = $_.Exception.Message.Split(':')[0] }
  Require-Contract ($actual -eq $case.Code) 'negative.wrong_boundary' "$($case.Code) mutation returned $actual"
  $Results += [pscustomobject]@{ code = $case.Code; red = $true; restoredGreen = (Assert-Contract $Inventory $Routes $ReferenceSource) }
}
@{ ok = $true; version = 2; rows = $ExpectedIds.Count; presentations = $Inventory.requiredCaptureVariants.Count; pinnedInputs = 1 + $ExpectedDependencies.Count; negativeCases = $Results.Count; sourceNegatives = 4; reparseFixtures = 1; results = $Results } | ConvertTo-Json -Depth 8
