[CmdletBinding()]
param([string]$Root = '.codex/verification/ui-drive')

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ui-drive-evidence-lib.ps1')
$temp = Join-Path ([IO.Path]::GetTempPath()) ('material-designer-ui-drive-schema-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
$redCount = 0
$schemaCount = 0
$hash40 = '1111111111111111111111111111111111111111'
$hash64 = '2222222222222222222222222222222222222222222222222222222222222222'

function Clone-Json($Value) { return (($Value | ConvertTo-Json -Depth 100) | ConvertFrom-Json) }
function Write-Json($Value, [string]$Name) {
    $path = Join-Path $temp $Name
    $Value | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $path -Encoding utf8
    return $path
}
function Expect-Red([string]$Name, [scriptblock]$Action) {
    try { & $Action; throw "Negative '$Name' stayed green." } catch {
        if ($_.Exception.Message -eq "Negative '$Name' stayed green.") { throw }
        $script:redCount++
        Write-Output "RED: $Name"
    }
}
function Assert-SchemaGreen($Value, [string]$SchemaName, [string]$FixtureName) {
    $path = Write-Json $Value $FixtureName
    try{[void](Read-UIValidatedJson -Path $path -SchemaPath (Join-Path $Root $SchemaName) -MaxBytes 4194304 -MaxDepth 32 -MaxStringLength 4096 -MaxArrayLength 100000 -MaxObjectProperties 256)}catch{throw "Green schema fixture '$FixtureName' failed: $($_.Exception.Message)"}
    $script:schemaCount++
}
function Assert-SchemaRed($Value, [string]$SchemaName, [string]$Name) {
    $path = Write-Json $Value ("red-$Name.json")
    Expect-Red $Name { [void](Read-UIValidatedJson -Path $path -SchemaPath (Join-Path $Root $SchemaName) -MaxBytes 4194304 -MaxDepth 32 -MaxStringLength 4096 -MaxArrayLength 100000 -MaxObjectProperties 256) }
}
function Expect-AuthorityRed([string]$Path, [string]$Name) {
    Expect-Red $Name {
        $previous = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'verify-ui-drive-scenes.ps1') -Inventory (Join-Path $Root 'inventory.json') -Registry (Join-Path $Root 'scene-registry.json') -Authority $Path 1>$null 2>$null
            if ($LASTEXITCODE -eq 0) { return }
            throw 'Expected authority verifier refusal.'
        } finally { $ErrorActionPreference = $previous }
    }
}

try {
    foreach ($name in @('authority', 'inventory', 'scene-registry', 'live-driver-registry', 'ledger')) {
        [void](Read-UIValidatedJson -Path (Join-Path $Root "$name.json") -SchemaPath (Join-Path $Root "$name.schema.json") -MaxBytes 1048576 -MaxDepth 32 -MaxStringLength 4096 -MaxArrayLength 10000 -MaxObjectProperties 256)
        $schemaCount++
    }
    $ledger = Get-Content -Raw -LiteralPath (Join-Path $Root 'ledger.json') | ConvertFrom-Json
    if ($ledger.version -ne 2 -or $ledger.rows.Count -ne 0) { throw 'Baseline ledger must remain an honest empty evidence ledger.' }

    $artifact = [ordered]@{ version=1; provenanceKind='schema-validated-captured-artifact-provenance'; artifactPath='artifacts/app.exe'; artifactSha256=$hash64; artifactBytes=1024; builtFromCommit=$hash40; intendedSourceCommit=$hash40; commitPolicy='exact-equality-and-ancestor-of-verification-head'; builderId='hosted-windows-release'; buildRunId='run:1' }
    $run = [ordered]@{
        version=1; runId='run-one'; sessionId='session-one';liveOriginId='origin-one'; generator=[ordered]@{driverId='approved-cheap-lowlevel-headless-driver';orchestratorPath='scripts/run-approved-ui-drive-live.ps1';orchestratorSha256=$hash64;modulePath='scripts/ui-drive-live-origin.psm1';moduleSha256=$hash64;bridgePath='scripts/ui-drive-lowlevel-stdin-bridge.ps1';bridgeSha256=$hash64;driverExecutablePathDigest=$hash64;driverExecutableSha256=$hash64;invocationId='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'}; captureRoute='cheap-lowlevel-headless'; sourceCommit=$hash40; artifactSha256=$hash64
        target=[ordered]@{processId=10;processImagePath='artifacts/app.exe';processImageSha256=$hash64;windowClass='Class';windowTitle='Title';windowWidth=800;windowHeight=600;pageUrl='http://127.0.0.1:9222/app';pageUrlDigest=$hash64}
        interaction=[ordered]@{sceneId='scene-documentation-site-language-modes-site-change-language-mode';interactionId='site-change-language-mode';sequence=1;kind='click';target='target';accessibleName='name';inputMethod='pointer'}
        semanticPolls=@([ordered]@{ordinal=1;method='poll';elapsedMs=5;observedState='after'})
        originalImage=[ordered]@{path='images/run-one/1.png';sha256=$hash64}; receipt=[ordered]@{id='receipt-one';path='receipts/receipt-one.json'}
    }
    $transcript=[ordered]@{version=1;transcriptId='transcript-one';runId='run-one';sessionId='session-one';pageUrl='http://127.0.0.1:9222/app';pageUrlDigest=$hash64;bridgePath='scripts/ui-drive-lowlevel-stdin-bridge.ps1';bridgeSha256=$hash64;driverExecutablePathDigest=$hash64;driverExecutableSha256=$hash64;calls=@(
        [ordered]@{sequence=1;tool='launch_on_headless_desktop';requestSha256=$hash64;responseSha256=$hash64;driverExitCode=0;nonceDigest=$hash64},
        [ordered]@{sequence=2;tool='list_headless_windows';requestSha256=$hash64;responseSha256=$hash64;driverExitCode=0;nonceDigest=$hash64},
        [ordered]@{sequence=3;tool='mouse_click';requestSha256=$hash64;responseSha256=$hash64;driverExitCode=0;nonceDigest=$hash64},
        [ordered]@{sequence=4;tool='screenshot';requestSha256=$hash64;responseSha256=$hash64;driverExitCode=0;nonceDigest=$hash64})}
    $origin=[ordered]@{version=1;originId='origin-one';originMode='live-private-in-process-capability';runId='run-one';sessionId='session-one';sourceCommit=$hash40;artifactSha256=$hash64;orchestratorPath='scripts/run-approved-ui-drive-live.ps1';orchestratorSha256=$hash64;modulePath='scripts/ui-drive-live-origin.psm1';moduleSha256=$hash64;bridgePath='scripts/ui-drive-lowlevel-stdin-bridge.ps1';bridgeSha256=$hash64;driverExecutablePathDigest=$hash64;driverExecutableSha256=$hash64;transcriptPath='transcripts/transcript-one.json';transcriptSha256=$hash64;transcriptId='transcript-one';nonceDigest=$hash64;capabilityIdentityDigest=$hash64;processId=10;processImageSha256=$hash64;windowClass='Class';windowTitle='Title';windowWidth=800;windowHeight=600;pageUrl='http://127.0.0.1:9222/app';pageUrlDigest=$hash64;sceneId='scene-documentation-site-language-modes-site-change-language-mode';interactionId='site-change-language-mode';actionKind='click';actionTarget='target';inputMethod='pointer';semanticPolls=@([ordered]@{ordinal=1;elapsedMs=5;observedState='after';responseSha256=$hash64});imagePath='images/run-one/0001-scene-documentation-site-language-modes-site-change-language-mode.png';imageSha256=$hash64;imageLastWriteUtc='2026-08-29T12:00:01.0000000Z';startedAtUtc='2026-08-29T12:00:00.0000000Z';completedAtUtc='2026-08-29T12:00:02.0000000Z';replayKey=$hash64}
    $audit = [ordered]@{
        version=1;auditId='audit-one';surfaceId='documentation-site';sceneId='scene-documentation-site-language-modes-site-change-language-mode';sourceCommit=$hash40;artifactSha256=$hash64;runId='run-one';coverageMode='hand-written-every-rendered-element';requiredElementCount=1;auditedElementCount=1;missingElementIds=@();elements=@([ordered]@{elementId='element';status='exercised';contextMenuRoute='menu';appearanceRoute='appearance';lockRoute='lock'});visualInspection=[ordered]@{method='original-image-inspection';clippingVerdict='checked-no-defect';visualDefectIds=@()}
    }
    $receipt = [ordered]@{
        version=3;inventoryVersion=1;receiptId='receipt-one';surfaceId='documentation-site';featureId='language-modes';destinationId=$null;interactionId='site-change-language-mode';sceneId='scene-documentation-site-language-modes-site-change-language-mode';sequence=1;sourceCommit=$hash40
        artifact=[ordered]@{path='artifacts/app.exe';sha256=$hash64;builtFromCommit=$hash40;kind='packaged-built-artifact';provenancePath='provenance/artifact.json';provenanceSha256=$hash64}
        captureTuple=[ordered]@{screenId='home';state='language';route='/';theme='light';locale='en-US';viewportWidth=1280;viewportHeight=720;displayScale=1;headlessRoute='cheap-lowlevel-headless';networkIsolation=[ordered]@{mode='capture-aware-disabled-network';blockedExternalRequests=$true;allowedOrigins=@('loopback')}}
        action=[ordered]@{kind='click';target='target';accessibleName='name';inputMethod='pointer';outcome='completed'}
        semanticState=[ordered]@{expectedBefore='before';observedBefore='before';expectedAfter='after';observedAfter='after';poll=[ordered]@{attempts=1;elapsedMs=5;method='poll'};verdict='matched'}
        image=[ordered]@{path='images/run-one/1.png';sha256=$hash64;bytes=128;width=2;height=2;pixels=4;format='png';contentVerdict='decoded-nonblank-no-text-metadata'}
        captureRun=[ordered]@{path='runs/run-one.json';sha256=$hash64;runId='run-one';sessionId='session-one'}
        liveOrigin=[ordered]@{path='origins/origin-one.json';sha256=$hash64;originId='origin-one';verificationLevel='live-session-only';pageUrl='http://127.0.0.1:9222/app';pageUrlDigest=$hash64}
        everyElementAudit=[ordered]@{path='audits/audit-one.json';sha256=$hash64;auditId='audit-one'}
        approvedOutputManifestPath='manifests/receipt-one.approved-outputs.json'
    }
    $manifest = [ordered]@{version=1;manifestMode='fixed-receipt-backed-approved-outputs';receiptId='receipt-one';sourceCommit=$hash40;artifactSha256=$hash64;entries=@(
        [ordered]@{kind='receipt';relativePath='receipts/receipt-one.json';sha256=$hash64;bytes=128},
        [ordered]@{kind='image';relativePath='images/run-one/1.png';sha256=$hash64;bytes=128},
        [ordered]@{kind='artifact';relativePath='artifacts/app.exe';sha256=$hash64;bytes=128},
        [ordered]@{kind='artifact-provenance';relativePath='provenance/artifact.json';sha256=$hash64;bytes=128},
        [ordered]@{kind='capture-run';relativePath='runs/run-one.json';sha256=$hash64;bytes=128},
        [ordered]@{kind='every-element-audit';relativePath='audits/audit-one.json';sha256=$hash64;bytes=128},
        [ordered]@{kind='live-origin';relativePath='origins/origin-one.json';sha256=$hash64;bytes=128},
        [ordered]@{kind='driver-transcript';relativePath='transcripts/transcript-one.json';sha256=$hash64;bytes=128}
    )}
    Assert-SchemaGreen $artifact 'artifact-provenance.schema.json' 'artifact.json'
    Assert-SchemaGreen $run 'capture-run.schema.json' 'run.json'
    Assert-SchemaGreen $transcript 'driver-transcript.schema.json' 'transcript.json'
    Assert-SchemaGreen $origin 'live-origin.schema.json' 'origin.json'
    Assert-SchemaGreen $audit 'every-element-audit.schema.json' 'audit.json'
    Assert-SchemaGreen $receipt 'click-receipt.schema.json' 'receipt.json'
    Assert-SchemaGreen $manifest 'approved-output-manifest.schema.json' 'manifest.json'

    $bad = Clone-Json $artifact; $bad.PSObject.Properties.Remove('builtFromCommit'); Assert-SchemaRed $bad 'artifact-provenance.schema.json' 'artifact-provenance-required-field'
    $bad = Clone-Json $run; $bad.target.windowWidth = 0; Assert-SchemaRed $bad 'capture-run.schema.json' 'capture-run-nonzero-window'
    $bad = Clone-Json $origin; $bad.PSObject.Properties.Add([psnoteproperty]::new('capability','serializable')); Assert-SchemaRed $bad 'live-origin.schema.json' 'json-capability-field'
    $bad = Clone-Json $transcript; $bad.calls[0].nonceDigest='4444444444444444444444444444444444444444444444444444444444444444'; Assert-SchemaGreen $bad 'driver-transcript.schema.json' 'wrong-nonce-structural-only.json'
    $bad = Clone-Json $audit; $bad.missingElementIds = @('missing'); Assert-SchemaRed $bad 'every-element-audit.schema.json' 'every-element-missing-list'
    $bad = Clone-Json $receipt; $bad.PSObject.Properties.Add([psnoteproperty]::new('unknownField', 1)); Assert-SchemaRed $bad 'click-receipt.schema.json' 'receipt-unknown-field'
    $bad = Clone-Json $manifest; $bad.entries = @(); Assert-SchemaRed $bad 'approved-output-manifest.schema.json' 'approved-manifest-empty-list'
    $bad = Clone-Json $receipt; $bad.image.bytes = 16777217; Assert-SchemaRed $bad 'click-receipt.schema.json' 'oversized-image-bytes'
    $bad = Clone-Json $receipt; $bad.image.width = 10001; Assert-SchemaRed $bad 'click-receipt.schema.json' 'oversized-image-width'
    $bad = Clone-Json $receipt; $bad.image.height = 10001; Assert-SchemaRed $bad 'click-receipt.schema.json' 'oversized-image-height'
    $bad = Clone-Json $receipt; $bad.image.pixels = 40000001; Assert-SchemaRed $bad 'click-receipt.schema.json' 'oversized-image-pixels'

    $duplicate = Join-Path $temp 'duplicate.json'; [IO.File]::WriteAllText($duplicate, '{"a":1,"a":2}', [Text.UTF8Encoding]::new($false)); Expect-Red 'duplicate-key-before-conversion' { [void](Read-UIStrictJson $duplicate) }
    $escapedDuplicate = Join-Path $temp 'escaped-duplicate.json'; [IO.File]::WriteAllText($escapedDuplicate, '{"a":1,"\u0061":2}', [Text.UTF8Encoding]::new($false)); Expect-Red 'escaped-duplicate-key-before-conversion' { [void](Read-UIStrictJson $escapedDuplicate) }
    $unsafe = Join-Path $temp 'unsafe.json'; [IO.File]::WriteAllText($unsafe, '{"__proto__":{}}', [Text.UTF8Encoding]::new($false)); Expect-Red 'unsafe-key-before-conversion' { [void](Read-UIStrictJson $unsafe) }
    $escapedUnsafe = Join-Path $temp 'escaped-unsafe.json'; [IO.File]::WriteAllText($escapedUnsafe, '{"\u005f\u005fproto__":{}}', [Text.UTF8Encoding]::new($false)); Expect-Red 'escaped-unsafe-key-before-conversion' { [void](Read-UIStrictJson $escapedUnsafe) }
    $deep = Join-Path $temp 'deep.json'; [IO.File]::WriteAllText($deep, '[[[[1]]]]', [Text.UTF8Encoding]::new($false)); Expect-Red 'depth-bound' { [void](Read-UIStrictJson -Path $deep -MaxDepth 3) }
    $longString = Join-Path $temp 'long-string.json'; [IO.File]::WriteAllText($longString, '"12345"', [Text.UTF8Encoding]::new($false)); Expect-Red 'string-bound' { [void](Read-UIStrictJson -Path $longString -MaxStringLength 4) }
    $longList = Join-Path $temp 'long-list.json'; [IO.File]::WriteAllText($longList, '[1,2,3]', [Text.UTF8Encoding]::new($false)); Expect-Red 'list-bound' { [void](Read-UIStrictJson -Path $longList -MaxArrayLength 2) }
    $large = Join-Path $temp 'large.json'; [IO.File]::WriteAllText($large, '"' + ('x' * 100) + '"', [Text.UTF8Encoding]::new($false)); Expect-Red 'byte-bound' { [void](Read-UIStrictJson -Path $large -MaxBytes 32) }

    $authority = Get-Content -Raw -LiteralPath (Join-Path $Root 'authority.json') | ConvertFrom-Json
    $bad = Clone-Json $authority; $bad.featureIds = @(); Assert-SchemaRed $bad 'authority.schema.json' 'authority-empty-feature-list'
    $bad = Clone-Json $authority; $bad.authorityMode = 'replacement'; Assert-SchemaRed $bad 'authority.schema.json' 'whole-authority-mode'
    $bad = Clone-Json $authority; $bad.featureIds[0] = $bad.featureIds[0] + '-renamed'; $renamePath = Write-Json $bad 'rename-authority.json'; Expect-AuthorityRed $renamePath 'rename-containing-original'
    $crlf = (($bad | ConvertTo-Json -Depth 100) -replace "`r?`n", "`r`n"); $crlfPath = Join-Path $temp 'crlf-authority.json'; [IO.File]::WriteAllText($crlfPath, $crlf, [Text.UTF8Encoding]::new($false)); Expect-AuthorityRed $crlfPath 'crlf-mutated-authority'

    Write-Output "PASS: $schemaCount draft-2020-12 schema fixtures passed and $redCount strict-admission, schema, bound, image, CRLF, rename, empty-list, and whole-authority negatives turned red."
} finally {
    if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
}
