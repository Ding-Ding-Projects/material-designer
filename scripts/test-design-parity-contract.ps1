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

$ExpectedIds = @('home-default-light','projects-default-light','design-systems-default-light','automations-default-light','plugins-default-light','integrations-default-light','studio-default-light','library-default-light','settings-appearance-light','handoff-default-light')
$ExpectedPaths = @('/','/projects','/design-systems','/automations','/plugins','/integrations','/studio','/library','/settings/appearance','/handoff')
$ExpectedQueryKeys = @('state','theme','width','height','scale','locale','fixture','time','motion','random','fonts','network')
$ExpectedIdentityFields = @('surfaceId','featureId','routeId','screen','state','theme','locale','viewportWidth','viewportHeight','displayScale','fixtureRevision','frozenTime','motion','randomSeed','bundledFontRevision','network','headlessRoute','rendererWitness','captureSettledWitness')
$ExpectedEvidenceTargets = @('referenceRaw','referenceReceipt','applicationRaw','applicationReceipt','comparison','diff')
$ExpectedInspectionFields = @('originalOpened','semanticStateConfirmed','clippingChecked','visualDefectIds')

function Stop-Contract([string]$Code, [string]$Detail) { throw [System.InvalidOperationException]::new("$Code`: $Detail") }
function Require-Contract([bool]$Condition, [string]$Code, [string]$Detail) { if (-not $Condition) { Stop-Contract $Code $Detail } }
function Join-Exact([object[]]$Values) { return (($Values | ForEach-Object { [string]$_ }) -join "`u{001f}") }

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
  Require-Contract ($Source -notmatch '(?m)\bMath\.random\s*\(\)|\bDate\.now\s*\(\)|new\s+Date\s*\(\s*\)') 'tuple.nondeterministic_source' 'reference route source contains an unbound clock or random draw'
  Require-Contract (($RouteContractSource -match 'export function evaluateCaptureNetwork') -and ($RouteContractSource -match 'capture\.network_unexpected_blocked') -and ($RouteContractSource -match 'export function createObservedParityWitness') -and ($RouteContractSource -match 'export function requireParityWitnessMatch')) 'witness.contract' 'network isolation and immutable witness functions are missing'
  Require-Contract (($Inv.routeIdentity.version -eq 1) -and ($Inv.routeIdentity.surfaceId -eq 'desktop-application') -and ($Inv.routeIdentity.headlessRoute -eq 'cheap-lowlevel-headless') -and ($Inv.routeIdentity.networkPolicy -eq 'disabled') -and ($Inv.routeIdentity.blockedRequestPolicy -eq 'fail')) 'route.identity_policy' 'route identity policy is incomplete'
  Require-Contract ((Join-Exact @($Inv.routeIdentity.fields)) -eq (Join-Exact $ExpectedIdentityFields)) 'route.identity_fields' 'route identity fields drifted'
  Require-Contract (($Inv.auditContract.controlAuditRequired -eq $true) -and ((Join-Exact @($Inv.auditContract.requiredFields)) -eq (Join-Exact @('id','primitive','region','locator','status','note')))) 'audit.control_audit' 'per-control audit requirements are missing'
  Require-Contract (($Inv.evidenceContract.captureEvidenceRequired -eq $true) -and ((Join-Exact @($Inv.evidenceContract.requiredTargets)) -eq (Join-Exact $ExpectedEvidenceTargets))) 'evidence.hash' 'evidence target requirements are missing'
  Require-Contract ((Join-Exact @($Inv.evidenceContract.requiredInspectionFields)) -eq (Join-Exact $ExpectedInspectionFields)) 'evidence.inspection' 'inspection requirements are missing'
  Require-Contract ((Join-Exact @($Reg.negativeRegressions)) -eq (Join-Exact @('inventory.row_ids','route.registry_ids','route.duplicate_path','route.commented_registration','route.detached_registration','reference.file_missing','reference.hash_stale','route.reference_tuple','route.application_tuple','tuple.nondeterministic_source','capture.network_policy','audit.control_audit','evidence.referenceRaw.target','evidence.applicationRaw.target','evidence.comparison.target','evidence.diff.target','evidence.hash','evidence.inspection','deviation.reason','deviation.approval'))) 'negative.registry' 'route negative registry drifted'
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
$Cases = @(
  @{ Code = 'inventory.row_ids'; Mutate = { param($i,$r,$s) $i.rows = @($i.rows | Select-Object -First ($i.rows.Count - 1)) } },
  @{ Code = 'route.registry_ids'; Mutate = { param($i,$r,$s) $r.routes = @($r.routes | Select-Object -First ($r.routes.Count - 1)) } },
  @{ Code = 'route.duplicate_path'; Mutate = { param($i,$r,$s) $r.routes[1].browserPath = $r.routes[0].browserPath } },
  @{ Code = 'route.commented_registration'; Mutate = { param($i,$r,$s) $r.routes[0].browserPath = '# commented registration' } },
  @{ Code = 'route.detached_registration'; Mutate = { param($i,$r,$s) $r.routes[0].identity.routeId = 'detached-route' } },
  @{ Code = 'reference.file_missing'; Mutate = { param($i,$r,$s) $i.reference.path = 'missing/reference.html' } },
  @{ Code = 'reference.hash_stale'; Mutate = { param($i,$r,$s) $i.reference.sha256 = ('0' * 64) } },
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
@{ ok = $true; version = 1; rows = $ExpectedIds.Count; negativeCases = $Results.Count; results = $Results } | ConvertTo-Json -Depth 8
