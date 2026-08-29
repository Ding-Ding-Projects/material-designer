$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$InventoryPath = Join-Path $Root '.codex/verification/design-parity/inventory.json'
$RoutesPath = Join-Path $Root '.codex/verification/design-parity/routes.json'
$ArtifactManifestSchemaPath = Join-Path $Root '.codex/verification/design-parity/application-artifact-manifest.schema.json'
$ReferencePath = Join-Path $Root 'mockups/open-design-m3/Open Design M3.dc.html'
$ReferenceSourcePath = Join-Path $Root 'tools/design-reference-app/main.mjs'
$Inventory = Get-Content -LiteralPath $InventoryPath -Raw | ConvertFrom-Json
$Routes = Get-Content -LiteralPath $RoutesPath -Raw | ConvertFrom-Json
$ArtifactManifestSchema = Get-Content -LiteralPath $ArtifactManifestSchemaPath -Raw | ConvertFrom-Json
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
$ExpectedPresentations = @('light-normal-100','light-normal-125','light-normal-150','light-normal-200','dark-normal-100','light-narrow-bilingual-100')
$ExpectedQueryKeys = @('state','theme','width','height','scale','locale','fixture','time','motion','random','fonts','network')
$ExpectedIdentityFields = @('surfaceId','featureId','routeId','presentationId','bindingId','screen','state','theme','locale','viewportWidth','viewportHeight','displayScale','fixtureRevision','frozenTime','motion','randomSeed','bundledFontRevision','network','headlessRoute','rendererWitness','captureSettledWitness')
$ExpectedEvidenceTargets = @('referenceRaw','referenceReceipt','applicationRaw','applicationReceipt','applicationArtifactManifest','comparison','diff')
$ExpectedInspectionFields = @('originalOpened','semanticStateConfirmed','clippingChecked','visualDefectIds')
$P1Negatives = @('evidence.referenceReceipt.target','evidence.applicationReceipt.target','matrix.variant_missing','matrix.pair_duplicate','matrix.tuple_drift','matrix.route_drift','matrix.base_only_coverage','receipt.cross_binding')
$ExpectedRouteNegatives = @('inventory.row_ids','route.registry_ids','route.duplicate_path','route.commented_registration','route.detached_registration','reference.file_missing','reference.hash_stale','route.reference_tuple','route.application_tuple','tuple.nondeterministic_source','capture.network_policy','audit.control_audit','evidence.referenceRaw.target','evidence.applicationRaw.target','evidence.applicationArtifactManifest.target','evidence.comparison.target','evidence.diff.target','evidence.hash','evidence.inspection','deviation.reason','deviation.approval','schema.recursive_validation','reference.dependencies','reference.reparse','route.reference_observation','witness.deep_freeze','witness.post_settle','png.critical_chunk','png.palette_transparency','png.inflate_bounds','source.production_helpers','artifact.manifest_target','artifact.intended_source','artifact.git_object','artifact.reviewed_commit','artifact.source_commit','artifact.row_source_commit','artifact.manifest','artifact.path','artifact.hash','artifact.bytes','artifact.provenance','artifact.expected_binding','artifact.package_identity','artifact.build_log_missing','artifact.build_log_hash','artifact.build_log_bytes','artifact.build_log_path','artifact.build_log_reparse','receipt.build_log_binding') + $P1Negatives
$ExpectedInventoryNegatives = @('inventory.row_ids','route.registry_ids','route.duplicate_path','route.commented_registration','route.detached_registration','reference.file_missing','reference.hash_stale','route.reference_tuple','route.application_tuple','tuple.screen.missing','tuple.state.missing','tuple.theme.missing','tuple.viewport.missing','tuple.scale.missing','tuple.locale.missing','tuple.fixtureRevision.missing','tuple.time.missing','tuple.motion.missing','tuple.randomSeed.missing','tuple.fonts.missing','tuple.network.missing','tuple.nondeterministic_source','audit.target','audit.control_audit','evidence.referenceRaw.target','evidence.applicationRaw.target','evidence.applicationArtifactManifest.target','evidence.comparison.target','evidence.diff.target','evidence.hash','evidence.inspection','deviation.reason','deviation.approval','capture.network_policy','schema.recursive_validation','reference.dependencies','reference.reparse','route.reference_observation','witness.deep_freeze','witness.post_settle','png.critical_chunk','png.palette_transparency','png.inflate_bounds','source.production_helpers','artifact.manifest_target','artifact.intended_source','artifact.git_object','artifact.reviewed_commit','artifact.source_commit','artifact.row_source_commit','artifact.manifest','artifact.path','artifact.hash','artifact.bytes','artifact.provenance','artifact.expected_binding','artifact.package_identity','artifact.build_log_missing','artifact.build_log_hash','artifact.build_log_bytes','artifact.build_log_path','artifact.build_log_reparse','receipt.build_log_binding') + $P1Negatives
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

function Assert-Production-Wiring([string]$Launcher, [string]$Contract, [string]$Verifier, [string]$Evidence) {
  Require-Contract ($Launcher -match '(?m)^import \{ loadAndPinParityRegistries \} from ''\.\./\.\./scripts/design-parity-production\.mjs'';$') 'source.launcher_import' 'launcher strict production import is missing, commented, or detached'
  Require-Contract ($Launcher -match '(?m)^const \{ routes, inventory, pinnedReference \} = loadAndPinParityRegistries\(repositoryRoot\);$') 'source.launcher_call' 'launcher strict production call is missing, commented, or detached'
  Require-Contract ($Launcher -match '(?m)^const firstRendererSnapshot = await readRendererOwnedSnapshot\(window\);$') 'source.renderer_read' 'launcher does not read renderer-owned state'
  Require-Contract ($Launcher -match '(?m)^const acceptedSnapshot = validateReferenceLauncherReadiness\(requested, pinnedReference\.reference, firstSnapshot\);$') 'source.readiness_call' 'launcher production readiness helper is detached'
  Require-Contract ($Launcher -match '(?m)^requireReferencePostSettleMatch\(requested, pinnedReference\.reference, acceptedSnapshot, postSettleSnapshot\);$') 'source.post_settle_call' 'launcher production post-settle helper is detached'
  Require-Contract ($Launcher -notmatch 'JSON\.parse\s*\(') 'source.launcher_json' 'launcher bypasses strict JSON'
  Require-Contract ($Contract -notmatch 'JSON\.parse\s*\(') 'source.contract_json' 'route contract bypasses strict JSON'
  Require-Contract ($Verifier -match '(?m)^\s{2}validateApplicationArtifactEvidence,$') 'source.artifact_import' 'verifier production artifact helper import is missing, commented, or detached'
  Require-Contract ($Verifier -match '(?m)^\s{2}validateDesignParityReceipt,$') 'source.receipt_import' 'verifier production receipt import is missing, commented, or detached'
  Require-Contract ($Verifier -match '(?m)^\s{2}const artifactBinding = validateApplicationArtifactEvidence\(root, \{$') 'source.artifact_call' 'verifier production artifact helper call is missing, commented, or detached'
  Require-Contract ($Verifier -match '(?m)^\s{4}validateDesignParityReceipt\(receipt, \{$') 'source.receipt_call' 'verifier production receipt helper call is missing, commented, or detached'
  Require-Contract (($Verifier -match '(?m)^function resolveIntendedSourceCommit\(\) \{$') -and ($Verifier -match '(?m)^const intendedSourceArguments = process\.argv\.reduce') -and ($Verifier -match '(?m)^const intendedSourceCommit = !structureOnly && !negative \? resolveIntendedSourceCommit\(\) : null;$') -and ($Verifier -match '\^\{commit\}')) 'source.intended_source' 'verifier does not bind full evidence to an explicit reviewed Git commit'
  Require-Contract (($Verifier -match '(?m)^\s{8}buildLogPath: artifactBinding\.buildLog\.path,$') -and ($Verifier -match '(?m)^\s{8}buildLogSha256: artifactBinding\.buildLog\.sha256,$') -and ($Verifier -match '(?m)^\s{8}buildLogBytes: artifactBinding\.buildLog\.bytes,$')) 'source.build_log_binding' 'verifier does not pass the verified build-log binding into application receipt validation'
  Require-Contract ($Evidence -match '(?m)^\s{2}const pinnedBuildLog = resolvePinnedParityFileUnderRoot\(repositoryRoot, APPLICATION_EVIDENCE_LOG_ROOT, provenance\.buildLog\.path, provenance\.buildLog\.sha256, \{ code: ''artifact\.build_log'', minBytes: 1, maxBytes: MAX_APPLICATION_EVIDENCE_LOG_BYTES \}\);$') 'source.build_log_resolver' 'production build-log exact-root pinned resolver call is missing, commented, or detached'
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

function Assert-PresentationTuple($Tuple, $Row, $Variant) {
  Require-Contract (($Tuple.screen -eq $Row.tuple.screen) -and ($Tuple.state -eq $Row.tuple.state)) 'matrix.tuple_drift' 'presentation changed the base row screen or state'
  Require-Contract (($Tuple.theme -eq $Variant.theme) -and ([int]$Tuple.viewport.width -eq [int]$Variant.viewport.width) -and ([int]$Tuple.viewport.height -eq [int]$Variant.viewport.height) -and ([double]$Tuple.scale -eq [double]$Variant.scale) -and ($Tuple.locale -eq $Variant.locale)) 'matrix.tuple_drift' 'presentation tuple differs from the required variant'
  foreach ($field in @('fixtureRevision','time','motion','randomSeed','fonts','network')) {
    Require-Contract (([string]$Tuple.$field) -eq ([string]$Row.tuple.$field)) 'matrix.tuple_drift' "presentation changed deterministic field $field"
  }
}

function Assert-Contract($Inv, $Reg, [string]$Source) {
  Require-Contract ((Join-Exact @($Reg.routes.id)) -eq (Join-Exact $ExpectedIds)) 'route.registry_ids' 'route registry ids drifted'
  Require-Contract ((Join-Exact @($Inv.rows.id)) -eq (Join-Exact $ExpectedIds)) 'inventory.row_ids' 'inventory row ids drifted'
  Require-Contract ((Join-Exact @($Inv.requiredCaptureVariants.id)) -eq (Join-Exact $ExpectedPresentations)) 'matrix.variant_ids' 'required presentation ids drifted'
  if ((@($Inv.rows | Where-Object { @($_.presentations).Count -eq 1 }).Count -eq $Inv.rows.Count) -and (@($Reg.routes | Where-Object { @($_.presentations).Count -eq 1 }).Count -eq $Reg.routes.Count)) { Stop-Contract 'matrix.base_only_coverage' 'registry covers only the ten base tuples' }
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
  Require-Contract (($ArtifactManifestSchema.additionalProperties -eq $false) -and ((Join-Exact @($ArtifactManifestSchema.required)) -eq (Join-Exact @('version','schema','rowId','presentationId','bindingId','intendedSourceCommit','builtFromCommit','artifact','provenance')))) 'artifact.schema' 'application artifact manifest schema is missing or open-ended'
  Require-Contract (($ArtifactManifestSchema.properties.artifact.additionalProperties -eq $false) -and ($ArtifactManifestSchema.properties.artifact.properties.package.additionalProperties -eq $false) -and ($ArtifactManifestSchema.properties.artifact.properties.package.properties.identity.const -eq 'open-design-packaged-app') -and ($ArtifactManifestSchema.properties.artifact.properties.package.properties.architecture.const -eq 'x64') -and ($ArtifactManifestSchema.properties.provenance.additionalProperties -eq $false)) 'artifact.schema_nested' 'application artifact manifest nested package or provenance schema is open or mismatched'
  Require-Contract ((Join-Exact @($Inv.evidenceContract.requiredInspectionFields)) -eq (Join-Exact $ExpectedInspectionFields)) 'evidence.inspection' 'inspection requirements are missing'
  Require-Contract ((Join-Exact @($Reg.negativeRegressions)) -eq (Join-Exact $ExpectedRouteNegatives)) 'negative.registry' 'route negative registry drifted'
  Require-Contract ((Join-Exact @($Inv.negativeRegressions)) -eq (Join-Exact $ExpectedInventoryNegatives)) 'negative.inventory_registry' 'inventory negative registry drifted'
  $seen = @{}
  $seenBindings = @{}
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
      if (($targetKey -eq 'applicationArtifactManifest') -and ($targetValue -ne ".codex/verification/evidence/$($row.id)/application.artifact-manifest.json")) { Stop-Contract 'artifact.manifest_target' "$($row.id) application artifact manifest target is not canonical" }
    }
    foreach ($deviation in @($row.deviations)) {
      if ([string]::IsNullOrWhiteSpace([string]$deviation.reason)) { Stop-Contract 'deviation.reason' "$($row.id) deviation reason is missing" }
      Require-Contract ($deviation.approved -eq $true) 'deviation.approval' "$($row.id) deviation is not reviewed"
    }
    Require-Contract ((Join-Exact @($row.presentations.presentationId)) -eq (Join-Exact $ExpectedPresentations)) 'matrix.variant_missing' "$($row.id) presentation bindings drifted"
    Require-Contract ((Join-Exact @($route.presentations.presentationId)) -eq (Join-Exact $ExpectedPresentations)) 'matrix.variant_missing' "$($row.id) presentation routes drifted"
    for ($presentationIndex = 0; $presentationIndex -lt $ExpectedPresentations.Count; $presentationIndex++) {
      $variant = $Inv.requiredCaptureVariants[$presentationIndex]
      $presentation = $row.presentations[$presentationIndex]
      $routePresentation = $route.presentations[$presentationIndex]
      $presentationId = $ExpectedPresentations[$presentationIndex]
      $bindingId = "$($row.id)--$presentationId"
      Require-Contract (($presentation.bindingId -eq $bindingId) -and ($routePresentation.bindingId -eq $bindingId) -and ($presentation.rowId -eq $row.id) -and ($routePresentation.rowId -eq $row.id)) 'matrix.pair_duplicate' "$bindingId pair identity drifted"
      Require-Contract (-not $seenBindings.ContainsKey($bindingId)) 'matrix.pair_duplicate' "$bindingId is duplicated"
      $seenBindings[$bindingId] = $true
      Assert-PresentationTuple $presentation.tuple $row $variant
      Assert-PresentationTuple $routePresentation.tuple $row $variant
      Assert-TupleRoute $presentation $presentation.referenceRoute 'design-reference:' 'matrix.route_drift'
      Assert-TupleRoute $presentation $presentation.applicationRoute 'material-designer:' 'matrix.route_drift'
      Require-Contract (($routePresentation.referenceRoute -eq $presentation.referenceRoute) -and ($routePresentation.applicationRoute -eq $presentation.applicationRoute) -and ($routePresentation.browserPath -eq $route.browserPath)) 'matrix.route_drift' "$bindingId route registries disagree"
      Require-Contract (($routePresentation.identity.surfaceId -eq 'desktop-application') -and ($routePresentation.identity.featureId -eq $row.id) -and ($routePresentation.identity.routeId -eq $row.id) -and ($routePresentation.identity.presentationId -eq $presentationId) -and ($routePresentation.identity.bindingId -eq $bindingId)) 'matrix.route_drift' "$bindingId route identity is cross-bound"
      if ($presentationIndex -eq 0) {
        Require-Contract ((Join-Exact @($presentation.tuple.PSObject.Properties | ForEach-Object { $_.Name + '=' + ($_.Value | ConvertTo-Json -Compress -Depth 8) })) -eq (Join-Exact @($row.tuple.PSObject.Properties | ForEach-Object { $_.Name + '=' + ($_.Value | ConvertTo-Json -Compress -Depth 8) }))) 'matrix.base_only_coverage' "$($row.id) base tuple drifted from light-normal-100"
        Require-Contract (($presentation.referenceRoute -eq $row.referenceRoute) -and ($presentation.applicationRoute -eq $row.applicationRoute)) 'matrix.base_only_coverage' "$($row.id) base routes drifted from light-normal-100"
      }
      Require-Contract (($presentation.auditStatus -eq 'pending') -and ($presentation.captureStatus -eq 'pending') -and ($presentation.matrixStatus -eq 'pending')) 'evidence.status' "$bindingId must remain pending"
      $targetRoot = ".codex/verification/evidence/$($row.id)/$presentationId"
      $expectedTargets = [ordered]@{ referenceRaw = "$targetRoot/reference.png"; referenceReceipt = "$targetRoot/reference.receipt.json"; applicationRaw = "$targetRoot/application.png"; applicationReceipt = "$targetRoot/application.receipt.json"; applicationArtifactManifest = "$targetRoot/application.artifact-manifest.json"; comparison = "$targetRoot/comparison.svg"; diff = "$targetRoot/diff.json" }
      foreach ($targetKey in $ExpectedEvidenceTargets) {
        $targetValue = $presentation.evidenceTargets.$targetKey
        if ([string]::IsNullOrWhiteSpace([string]$targetValue) -or $targetValue -ne $expectedTargets[$targetKey]) { Stop-Contract "evidence.$targetKey.target" "$bindingId target is missing or noncanonical" }
      }
    }
  }
  Require-Contract ($seenBindings.Count -eq 60) 'matrix.base_only_coverage' 'registry does not contain 60 unique row-presentation bindings'
  return $true
}

Assert-Contract $Inventory $Routes $ReferenceSource | Out-Null
Assert-Production-Wiring $ReferenceSource $RouteContractSource $VerifierSource $EvidenceContractSource | Out-Null
Require-Contract (($StrictJsonSource -match 'export function validateJsonSchema') -and ($StrictJsonSource -match 'schema\.additional_property') -and ($StrictJsonSource -match 'json\.duplicate_key') -and ($StrictJsonSource -match 'json\.number_bounds')) 'source.strict_json' 'shared strict JSON/schema implementation is incomplete'
Require-Contract (($ProductionSource -match 'export function assertNoPathIndirection') -and ($ProductionSource -match 'junction, mount point, reparse point, or realpath indirection') -and ($ProductionSource -match 'pinCanonicalParityReferenceGraph')) 'source.reparse' 'production path pinning or reparse refusal is incomplete'
Require-Contract (($EvidenceContractSource -match 'export function validateDesignParityReceipt') -and ($EvidenceContractSource -match 'export function validateApplicationArtifactEvidence') -and ($EvidenceContractSource -match 'resolvePinnedParityFileUnderRoot') -and ($EvidenceContractSource -match 'DESIGN_PARITY_RECEIPT_SCHEMA') -and ($EvidenceContractSource -match 'APPLICATION_EVIDENCE_LOG_ROOT') -and ($EvidenceContractSource -match 'MAX_APPLICATION_EVIDENCE_LOG_BYTES') -and ($EvidenceContractSource -match 'pinnedBuildLog') -and ($EvidenceContractSource -match 'artifactBytes') -and ($EvidenceContractSource -match 'intendedSourceCommit')) 'source.receipt_helper' 'production receipt, artifact provenance, or build-log validator is missing'
Require-Contract (($PngSource -match 'unknown critical PNG chunk') -and ($PngSource -match 'maxOutputLength: expected') -and ($PngSource -match 'PNG tRNS') -and ($PngSource -match 'idatClosed')) 'source.png_strict' 'strict PNG critical-chunk, inflate, transparency, or IDAT sequencing boundary is missing'
Require-Contract (($DesktopPreludeSource -match 'const deepFreeze = \(value, seen = new WeakSet\(\)\)') -and ($DesktopPreludeSource -match '__MATERIAL_DESIGNER_CAPTURE_IDENTITY__') -and ($DesktopPreludeSource -match '__MATERIAL_DESIGNER_DEEP_FREEZE__')) 'source.desktop_prelude_freeze' 'desktop renderer prelude is not recursively freezing tuple and identity state'
$DesktopRuntimeFreezeReady = (($DesktopRuntimeSource -match 'const deepFreeze = globalThis\.__MATERIAL_DESIGNER_DEEP_FREEZE__') -and ($DesktopRuntimeSource -match 'return deepFreeze\(\{'))
if ($Routes.applicationImplementation.status -eq 'implemented') {
  Require-Contract $DesktopRuntimeFreezeReady 'source.desktop_witness_freeze' 'implemented desktop renderer readiness does not freeze its observed witness graph'
} else {
  Require-Contract ($Routes.applicationImplementation.status -eq 'unimplemented') 'source.desktop_witness_status' 'desktop witness freeze may be pending only while application routing is unimplemented'
}

$BrokenLauncherImport = $ReferenceSource -replace '(?m)^import \{ loadAndPinParityRegistries \}', '// import { loadAndPinParityRegistries }'
$BrokenLauncherCall = $ReferenceSource -replace 'loadAndPinParityRegistries\(repositoryRoot\)', 'loadAndPinParityRegistriesDetached(repositoryRoot)'
$BrokenArtifactImport = $VerifierSource -replace '(?m)^\s{2}validateApplicationArtifactEvidence,$', '  // validateApplicationArtifactEvidence,'
$BrokenVerifierImport = $VerifierSource -replace '(?m)^\s{2}validateDesignParityReceipt,$', '  // validateDesignParityReceipt,'
$BrokenArtifactCall = $VerifierSource -replace '(?m)^\s{2}const artifactBinding = validateApplicationArtifactEvidence\(root, \{$', '  const artifactBinding = validateApplicationArtifactEvidenceDetached(root, {'
$BrokenVerifierCall = $VerifierSource -replace '(?m)^\s{4}validateDesignParityReceipt\(receipt, \{$', '    validateDesignParityReceiptDetached(receipt, {'
$BrokenIntendedSource = $VerifierSource -replace '(?m)^function resolveIntendedSourceCommit\(\) \{$', 'function resolveIntendedSourceCommitDetached() {'
$BrokenBuildLogBinding = $VerifierSource -replace '(?m)^\s{8}buildLogPath: artifactBinding\.buildLog\.path,$', '        buildLogPath: artifactBinding.buildLogPathDetached,'
$BrokenBuildLogResolver = $EvidenceContractSource -replace '(?m)^\s{2}const pinnedBuildLog = resolvePinnedParityFileUnderRoot\(', '  const pinnedBuildLog = resolvePinnedParityFileUnderRootDetached('
foreach ($sourceCase in @(
  @{ Code = 'source.launcher_import'; Launcher = $BrokenLauncherImport; Verifier = $VerifierSource; Evidence = $EvidenceContractSource },
  @{ Code = 'source.launcher_call'; Launcher = $BrokenLauncherCall; Verifier = $VerifierSource; Evidence = $EvidenceContractSource },
  @{ Code = 'source.artifact_import'; Launcher = $ReferenceSource; Verifier = $BrokenArtifactImport; Evidence = $EvidenceContractSource },
  @{ Code = 'source.receipt_import'; Launcher = $ReferenceSource; Verifier = $BrokenVerifierImport; Evidence = $EvidenceContractSource },
  @{ Code = 'source.artifact_call'; Launcher = $ReferenceSource; Verifier = $BrokenArtifactCall; Evidence = $EvidenceContractSource },
  @{ Code = 'source.receipt_call'; Launcher = $ReferenceSource; Verifier = $BrokenVerifierCall; Evidence = $EvidenceContractSource },
  @{ Code = 'source.intended_source'; Launcher = $ReferenceSource; Verifier = $BrokenIntendedSource; Evidence = $EvidenceContractSource },
  @{ Code = 'source.build_log_binding'; Launcher = $ReferenceSource; Verifier = $BrokenBuildLogBinding; Evidence = $EvidenceContractSource },
  @{ Code = 'source.build_log_resolver'; Launcher = $ReferenceSource; Verifier = $VerifierSource; Evidence = $BrokenBuildLogResolver }
)) {
  $actual = $null
  try { Assert-Production-Wiring $sourceCase.Launcher $RouteContractSource $sourceCase.Verifier $sourceCase.Evidence | Out-Null } catch { $actual = $_.Exception.Message.Split(':')[0] }
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
  @{ Code = 'evidence.referenceReceipt.target'; Mutate = { param($i,$r,$s) $i.rows[0].presentations[0].evidenceTargets.referenceReceipt = '' } },
  @{ Code = 'evidence.applicationReceipt.target'; Mutate = { param($i,$r,$s) $i.rows[0].presentations[0].evidenceTargets.applicationReceipt = '' } },
  @{ Code = 'evidence.applicationArtifactManifest.target'; Mutate = { param($i,$r,$s) $i.rows[0].evidenceTargets.applicationArtifactManifest = '' } },
  @{ Code = 'evidence.hash'; Mutate = { param($i,$r,$s) $i.evidenceContract.requiredTargets[0] = 'wrongHashTarget' } },
  @{ Code = 'evidence.inspection'; Mutate = { param($i,$r,$s) $i.evidenceContract.requiredInspectionFields[0] = 'wrongInspectionField' } },
  @{ Code = 'deviation.reason'; Mutate = { param($i,$r,$s) $i.rows[9].deviations[0].reason = '' } },
  @{ Code = 'deviation.approval'; Mutate = { param($i,$r,$s) $i.rows[9].deviations[0].approved = $false } },
  @{ Code = 'matrix.variant_missing'; Mutate = { param($i,$r,$s) $i.rows[0].presentations = @($i.rows[0].presentations | Select-Object -First 5) } },
  @{ Code = 'matrix.pair_duplicate'; Mutate = { param($i,$r,$s) $i.rows[0].presentations[1].bindingId = $i.rows[0].presentations[0].bindingId } },
  @{ Code = 'matrix.tuple_drift'; Mutate = { param($i,$r,$s) $i.rows[0].presentations[1].tuple.scale = 9 } },
  @{ Code = 'matrix.route_drift'; Mutate = { param($i,$r,$s) $r.routes[0].presentations[1].referenceRoute = $r.routes[0].presentations[0].referenceRoute } },
  @{ Code = 'matrix.base_only_coverage'; Mutate = { param($i,$r,$s) foreach ($row in $i.rows) { $row.presentations = @($row.presentations[0]) }; foreach ($route in $r.routes) { $route.presentations = @($route.presentations[0]) } } }
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
@{ ok = $true; version = 5; rows = $ExpectedIds.Count; presentations = $Inventory.requiredCaptureVariants.Count; bindings = 60; pinnedInputs = 1 + $ExpectedDependencies.Count; evidenceTargetsPerBinding = $ExpectedEvidenceTargets.Count; negativeCases = $Results.Count; sourceNegatives = 9; reparseFixtures = 1; desktopRuntimeWitness = $(if ($DesktopRuntimeFreezeReady) { 'source-ready' } else { 'pending-shared-seam' }); results = $Results } | ConvertTo-Json -Depth 8
