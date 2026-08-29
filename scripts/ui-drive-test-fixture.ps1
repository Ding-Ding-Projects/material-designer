[CmdletBinding()]
param()

function Write-UITestJson($Value, [string]$Path) {
    $parent = [IO.Path]::GetDirectoryName($Path)
    if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    [IO.File]::WriteAllText($Path, (($Value | ConvertTo-Json -Depth 100) + [Environment]::NewLine), [Text.UTF8Encoding]::new($false))
}

function New-UIEvidenceTestRepository {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)] [string]$SourceRoot,
        [Parameter(Mandatory = $true)] [string]$DestinationRoot
    )

    $ErrorActionPreference = 'Stop'
    New-Item -ItemType Directory -Path $DestinationRoot -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $DestinationRoot 'scripts') -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $DestinationRoot '.codex/verification') -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $SourceRoot '.codex/verification/ui-drive') -Destination (Join-Path $DestinationRoot '.codex/verification') -Recurse
    foreach ($script in @('ui-drive-evidence-lib.ps1','ui-drive-test-fixture.ps1','write-approved-ui-drive-capture-run.ps1','inspect-ui-drive-image.ps1','run-ui-drive-privacy.ps1','validate-ui-drive-receipt.ps1','verify-ui-drive-scenes.ps1','verify-ui-drive-evidence.ps1','append-ui-drive-ledger.ps1')) {
        Copy-Item -LiteralPath (Join-Path $SourceRoot "scripts/$script") -Destination (Join-Path $DestinationRoot "scripts/$script")
    }
    & git -C $DestinationRoot init --quiet
    & git -C $DestinationRoot config core.autocrlf false
    & git -C $DestinationRoot config user.name 'Evidence Fixture'
    & git -C $DestinationRoot config user.email 'fixture@example.invalid'
    & git -C $DestinationRoot add --all
    & git -C $DestinationRoot commit --quiet -m 'Create temporary evidence fixture'
    if ($LASTEXITCODE -ne 0) { throw 'Temporary evidence fixture commit failed.' }
    $sourceCommit = (& git -C $DestinationRoot rev-parse HEAD).Trim()

    $schemaRoot = Join-Path $DestinationRoot '.codex/verification/ui-drive'
    $inventoryPath = Join-Path $schemaRoot 'inventory.json'
    $registryPath = Join-Path $schemaRoot 'scene-registry.json'
    $ledgerPath = Join-Path $schemaRoot 'ledger.json'
    $inventory = Get-Content -Raw -LiteralPath $inventoryPath | ConvertFrom-Json
    $registry = Get-Content -Raw -LiteralPath $registryPath | ConvertFrom-Json
    $surface = $inventory.surfaces | Where-Object id -eq 'documentation-site'
    $feature = $surface.features | Where-Object id -eq 'language-modes'
    $interaction = $feature.requiredInteractions[0]
    $feature.status = 'partial'
    $feature.statusReason = 'Temporary test fixture is capture-ready but not promoted.'
    $feature.evidenceReceipts = @()
    $scene = $registry.scenes | Where-Object id -eq $interaction.sceneId
    $scene.status = 'partial'
    $scene.statusReason = 'Temporary test fixture is capture-ready but not promoted.'
    Write-UITestJson $inventory $inventoryPath
    Write-UITestJson $registry $registryPath

    $evidenceRoot = Join-Path $DestinationRoot '.codex/verification/evidence'
    foreach ($directory in @('receipts','images/run-one','artifacts','provenance','runs','audits','manifests')) { New-Item -ItemType Directory -Path (Join-Path $evidenceRoot $directory) -Force | Out-Null }
    $powershellPath = (Get-Command powershell.exe -ErrorAction Stop).Source
    $artifactHash = (Get-FileHash -LiteralPath $powershellPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $artifactRelative = "artifacts/$artifactHash/app.exe"
    $artifactPath = Join-Path $evidenceRoot $artifactRelative
    New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($artifactPath)) -Force | Out-Null
    Copy-Item -LiteralPath $powershellPath -Destination $artifactPath
    $artifactBytes = (Get-Item -LiteralPath $artifactPath).Length

    try { Add-Type -AssemblyName System.Drawing } catch { throw 'System.Drawing is unavailable for the disposable PNG fixture.' }
    $imagePath = Join-Path $evidenceRoot ("images/run-one/0001-$($interaction.sceneId).png")
    $bitmap = [Drawing.Bitmap]::new(2, 2)
    try {
        $bitmap.SetPixel(0, 0, [Drawing.Color]::Red)
        $bitmap.SetPixel(1, 0, [Drawing.Color]::Blue)
        $bitmap.SetPixel(0, 1, [Drawing.Color]::Green)
        $bitmap.SetPixel(1, 1, [Drawing.Color]::White)
        $bitmap.Save($imagePath, [Drawing.Imaging.ImageFormat]::Png)
    } finally { $bitmap.Dispose() }
    $inspection = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $DestinationRoot 'scripts/inspect-ui-drive-image.ps1') -ImagePath $imagePath | ConvertFrom-Json)

    $provenanceRelative = "provenance/$artifactHash.artifact-provenance.json"
    $provenancePath = Join-Path $evidenceRoot $provenanceRelative
    $provenance = [ordered]@{version=1;provenanceKind='schema-validated-captured-artifact-provenance';artifactPath=$artifactRelative;artifactSha256=$artifactHash;artifactBytes=[int64]$artifactBytes;builtFromCommit=$sourceCommit;intendedSourceCommit=$sourceCommit;commitPolicy='exact-equality-and-ancestor-of-verification-head';builderId='hosted-windows-release';buildRunId='fixture-run-1'}
    Write-UITestJson $provenance $provenancePath
    $provenanceHash = (Get-FileHash -LiteralPath $provenancePath -Algorithm SHA256).Hash.ToLowerInvariant()

    $receiptPath = Join-Path $evidenceRoot 'receipts/receipt-one.json'
    $runPath = Join-Path $evidenceRoot 'runs/run-one.json'
    $run = [ordered]@{
        version=1;runId='run-one';sessionId='session-one';generator=[ordered]@{driverId='approved-cheap-lowlevel-headless-driver';scriptPath='scripts/write-approved-ui-drive-capture-run.ps1';scriptSha256=(Get-FileHash -LiteralPath (Join-Path $DestinationRoot 'scripts/write-approved-ui-drive-capture-run.ps1') -Algorithm SHA256).Hash.ToLowerInvariant();invocationId='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'};captureRoute='cheap-lowlevel-headless';sourceCommit=$sourceCommit;artifactSha256=$artifactHash
        target=[ordered]@{processId=100;processImagePath=$artifactRelative;processImageSha256=$artifactHash;windowClass='FixtureWindow';windowTitle='Fixture';windowWidth=[int]$scene.tuple.viewportWidth;windowHeight=[int]$scene.tuple.viewportHeight}
        interaction=[ordered]@{sceneId=[string]$interaction.sceneId;interactionId=[string]$interaction.id;sequence=1;kind=[string]$interaction.action;target=[string]$interaction.target;accessibleName=[string]$interaction.accessibleName;inputMethod=[string]$interaction.inputMethod}
        semanticPolls=@([ordered]@{ordinal=1;method='bounded-semantic-query';elapsedMs=1;observedState=[string]$interaction.expectedAfter})
        originalImage=[ordered]@{path=("images/run-one/0001-$($interaction.sceneId).png");sha256=[string]$inspection.sha256}
        receipt=[ordered]@{id='receipt-one';path='receipts/receipt-one.json'}
    }
    Write-UITestJson $run $runPath
    $runHash = (Get-FileHash -LiteralPath $runPath -Algorithm SHA256).Hash.ToLowerInvariant()

    $auditPath = Join-Path $evidenceRoot 'audits/audit-one.json'
    $audit = [ordered]@{version=1;auditId='audit-one';surfaceId='documentation-site';sceneId=[string]$interaction.sceneId;sourceCommit=$sourceCommit;artifactSha256=$artifactHash;runId='run-one';coverageMode='hand-written-every-rendered-element';requiredElementCount=1;auditedElementCount=1;missingElementIds=@();elements=@([ordered]@{elementId='fixture-element';status='exercised';contextMenuRoute='fixture-context-menu';appearanceRoute='fixture-appearance';lockRoute='fixture-lock'});visualInspection=[ordered]@{method='original-image-inspection';clippingVerdict='checked-no-defect';visualDefectIds=@()}}
    Write-UITestJson $audit $auditPath
    $auditHash = (Get-FileHash -LiteralPath $auditPath -Algorithm SHA256).Hash.ToLowerInvariant()

    $receipt = [ordered]@{
        version=3;inventoryVersion=1;receiptId='receipt-one';surfaceId='documentation-site';featureId='language-modes';destinationId=$null;interactionId=[string]$interaction.id;sceneId=[string]$interaction.sceneId;sequence=1;sourceCommit=$sourceCommit
        artifact=[ordered]@{path=$artifactRelative;sha256=$artifactHash;builtFromCommit=$sourceCommit;kind='packaged-built-artifact';provenancePath=$provenanceRelative;provenanceSha256=$provenanceHash}
        captureTuple=[ordered]@{screenId=[string]$scene.tuple.screenId;state=[string]$scene.tuple.state;route=[string]$scene.tuple.route;theme=[string]$scene.tuple.theme;locale=[string]$scene.tuple.locale;viewportWidth=[int]$scene.tuple.viewportWidth;viewportHeight=[int]$scene.tuple.viewportHeight;displayScale=$scene.tuple.displayScale;headlessRoute=[string]$scene.tuple.headlessRoute;networkIsolation=[ordered]@{mode=[string]$scene.tuple.networkIsolation.mode;blockedExternalRequests=[bool]$scene.tuple.networkIsolation.blockedExternalRequests;allowedOrigins=@($scene.tuple.networkIsolation.allowedOrigins)}}
        action=[ordered]@{kind=[string]$interaction.action;target=[string]$interaction.target;accessibleName=[string]$interaction.accessibleName;inputMethod=[string]$interaction.inputMethod;outcome='completed'}
        semanticState=[ordered]@{expectedBefore=[string]$interaction.expectedBefore;observedBefore=[string]$interaction.expectedBefore;expectedAfter=[string]$interaction.expectedAfter;observedAfter=[string]$interaction.expectedAfter;poll=[ordered]@{attempts=1;elapsedMs=1;method='bounded-semantic-query'};verdict='matched'}
        image=[ordered]@{path=("images/run-one/0001-$($interaction.sceneId).png");sha256=[string]$inspection.sha256;bytes=[int64]$inspection.bytes;width=[int]$inspection.width;height=[int]$inspection.height;pixels=[int64]$inspection.pixels;format=[string]$inspection.format;contentVerdict=[string]$inspection.contentVerdict}
        captureRun=[ordered]@{path='runs/run-one.json';sha256=$runHash;runId='run-one';sessionId='session-one'}
        everyElementAudit=[ordered]@{path='audits/audit-one.json';sha256=$auditHash;auditId='audit-one'}
        approvedOutputManifestPath='manifests/receipt-one.approved-outputs.json'
    }
    Write-UITestJson $receipt $receiptPath
    $receiptHash = (Get-FileHash -LiteralPath $receiptPath -Algorithm SHA256).Hash.ToLowerInvariant()

    $manifestPath = Join-Path $evidenceRoot 'manifests/receipt-one.approved-outputs.json'
    $manifest = [ordered]@{version=1;manifestMode='fixed-receipt-backed-approved-outputs';receiptId='receipt-one';sourceCommit=$sourceCommit;artifactSha256=$artifactHash;entries=@(
        [ordered]@{kind='receipt';relativePath='receipts/receipt-one.json';sha256=$receiptHash;bytes=[int64](Get-Item $receiptPath).Length},
        [ordered]@{kind='image';relativePath=("images/run-one/0001-$($interaction.sceneId).png");sha256=[string]$inspection.sha256;bytes=[int64](Get-Item $imagePath).Length},
        [ordered]@{kind='artifact';relativePath=$artifactRelative;sha256=$artifactHash;bytes=[int64]$artifactBytes},
        [ordered]@{kind='artifact-provenance';relativePath=$provenanceRelative;sha256=$provenanceHash;bytes=[int64](Get-Item $provenancePath).Length},
        [ordered]@{kind='capture-run';relativePath='runs/run-one.json';sha256=$runHash;bytes=[int64](Get-Item $runPath).Length},
        [ordered]@{kind='every-element-audit';relativePath='audits/audit-one.json';sha256=$auditHash;bytes=[int64](Get-Item $auditPath).Length}
    )}
    Write-UITestJson $manifest $manifestPath

    return [pscustomobject]@{
        RepositoryRoot=$DestinationRoot; SchemaRoot=$schemaRoot; EvidenceRoot=$evidenceRoot; Inventory=$inventoryPath; Registry=$registryPath; Authority=(Join-Path $schemaRoot 'authority.json'); Ledger=$ledgerPath; Receipt=$receiptPath; Manifest=$manifestPath; Image=$imagePath; Artifact=$artifactPath; Provenance=$provenancePath; Run=$runPath; Audit=$auditPath; SourceCommit=$sourceCommit; SceneId=[string]$interaction.sceneId; InteractionId=[string]$interaction.id
    }
}

function Promote-UIEvidenceTestFixture {
    param([Parameter(Mandatory = $true)]$Fixture)
    $inventory = Get-Content -Raw -LiteralPath $Fixture.Inventory | ConvertFrom-Json
    $feature = ($inventory.surfaces | Where-Object id -eq 'documentation-site').features | Where-Object id -eq 'language-modes'
    $feature.status = 'verified'
    $feature.statusReason = 'Temporary fixture evidence is fully linked for negative testing.'
    $feature.evidenceReceipts = @('receipts/receipt-one.json')
    Write-UITestJson $inventory $Fixture.Inventory
    $registry = Get-Content -Raw -LiteralPath $Fixture.Registry | ConvertFrom-Json
    $scene = $registry.scenes | Where-Object id -eq $Fixture.SceneId
    $scene.status = 'verified'
    $scene.statusReason = 'Temporary fixture evidence is fully linked for negative testing.'
    Write-UITestJson $registry $Fixture.Registry
}
