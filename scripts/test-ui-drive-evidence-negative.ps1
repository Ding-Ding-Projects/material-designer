[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ui-drive-test-fixture.ps1')
$sourceRoot = Split-Path $PSScriptRoot -Parent
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('material-designer-ui-drive-evidence-' + [guid]::NewGuid().ToString('N'))
$redCount = 0

function Invoke-Validator($Fixture, [string]$Validator = 'verify-ui-drive-evidence.ps1', [string]$LedgerPath) {
    if ([string]::IsNullOrWhiteSpace($LedgerPath)) { $LedgerPath = $Fixture.Ledger }
    $previous = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Fixture.RepositoryRoot "scripts/$Validator") -Inventory $Fixture.Inventory -SceneRegistry $Fixture.Registry -LiveDriverRegistry $Fixture.LiveDriverRegistry -Ledger $LedgerPath -Authority $Fixture.Authority -EvidenceRoot $Fixture.EvidenceRoot -RepositoryRoot $Fixture.RepositoryRoot 1>$null 2>$null
        return $LASTEXITCODE
    } finally { $ErrorActionPreference = $previous }
}
function Expect-Red([string]$Name, [scriptblock]$Action) {
    $exitCode = & $Action
    if ($exitCode -eq 0) { throw "Negative '$Name' stayed green." }
    $script:redCount++
    Write-Output "RED: $Name"
}
function Invoke-ReceiptValidator($Fixture,[switch]$StructuralOnly,[string]$ReceiptPath){
    if([string]::IsNullOrWhiteSpace($ReceiptPath)){$ReceiptPath=$Fixture.Receipt}
    $args=@('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $Fixture.RepositoryRoot 'scripts/validate-ui-drive-receipt.ps1'),'-Receipt',$ReceiptPath,'-Inventory',$Fixture.Inventory,'-SceneRegistry',$Fixture.Registry,'-LiveDriverRegistry',$Fixture.LiveDriverRegistry,'-Authority',$Fixture.Authority,'-EvidenceRoot',$Fixture.EvidenceRoot,'-RepositoryRoot',$Fixture.RepositoryRoot)
    if($StructuralOnly){$args+='-StructuralOnly'}
    $previous=$ErrorActionPreference;try{$ErrorActionPreference='Continue';&powershell.exe @args 1>$null 2>$null;return $LASTEXITCODE}finally{$ErrorActionPreference=$previous}
}
function Invoke-RecordMutationRed($Fixture,[string]$Path,[scriptblock]$Mutation,[string]$Name){
    $original=[IO.File]::ReadAllBytes($Path);try{$data=Get-Content -Raw -LiteralPath $Path|ConvertFrom-Json;&$Mutation $data;Write-UITestJson $data $Path;Expect-Red $Name {Invoke-ReceiptValidator $Fixture -StructuralOnly}}finally{[IO.File]::WriteAllBytes($Path,$original)}
}
function Invoke-JsonMutationRed($Fixture, [string]$Path, [scriptblock]$Mutation, [string]$Name) {
    $original = [IO.File]::ReadAllBytes($Path)
    try {
        $data = Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json
        & $Mutation $data
        Write-UITestJson $data $Path
        Expect-Red $Name { Invoke-Validator $Fixture }
    } finally { [IO.File]::WriteAllBytes($Path, $original) }
}

try {
    $fixture = New-UIEvidenceTestRepository -SourceRoot $sourceRoot -DestinationRoot $tempRoot
    if ((Invoke-Validator $fixture) -ne 0) { throw 'Capture-ready empty-ledger baseline is not green.' }

    Invoke-JsonMutationRed $fixture $fixture.Inventory { param($data) $data.surfaces = @($data.surfaces | Where-Object id -ne 'documentation-site') } 'remove-whole-surface'
    Invoke-JsonMutationRed $fixture $fixture.Inventory { param($data) $surface=$data.surfaces|Where-Object id -eq 'documentation-site';$surface.features=@($surface.features|Where-Object id -ne 'status-hub') } 'remove-whole-feature'
    Invoke-JsonMutationRed $fixture $fixture.Inventory { param($data) $surface=$data.surfaces|Where-Object id -eq 'windows-desktop-application';$surface.destinations=@($surface.destinations|Where-Object id -ne 'home-default-light') } 'remove-whole-destination'
    Invoke-JsonMutationRed $fixture $fixture.Inventory { param($data) $data.requiredFeatureIds=@() } 'empty-canonical-feature-list'
    Invoke-JsonMutationRed $fixture $fixture.Registry { param($data) $data.scenes=@($data.scenes|Where-Object id -ne 'scene-documentation-site-status-hub-site-open-status-hub') } 'remove-whole-scene'
    Invoke-JsonMutationRed $fixture $fixture.Registry { param($data) $scene=$data.scenes|Where-Object id -eq $fixture.SceneId;$scene.tuple.networkIsolation.allowedOrigins=@('app-resource','loopback') } 'allowed-origins-tuple-mismatch'
    Invoke-JsonMutationRed $fixture $fixture.Inventory { param($data) $feature=($data.surfaces|Where-Object id -eq 'documentation-site').features|Where-Object id -eq 'language-modes';$feature.status='verified';$feature.evidenceReceipts=@('receipts/receipt-one.json') } 'verified-feature-empty-ledger'

    $authorityOriginal = [IO.File]::ReadAllBytes($fixture.Authority)
    $inventoryOriginal = [IO.File]::ReadAllBytes($fixture.Inventory)
    $registryOriginal = [IO.File]::ReadAllBytes($fixture.Registry)
    try {
        $authority = Get-Content -Raw $fixture.Authority | ConvertFrom-Json
        $inventory = Get-Content -Raw $fixture.Inventory | ConvertFrom-Json
        $registry = Get-Content -Raw $fixture.Registry | ConvertFrom-Json
        $old = [string]$authority.featureIds[0]
        $new = $old + '-renamed'
        $authority.featureIds[0] = $new
        $inventory.requiredFeatureIds[0] = $new
        foreach ($surface in $inventory.surfaces) { ($surface.features | Where-Object id -eq $old).id = $new }
        foreach ($scene in $registry.scenes | Where-Object featureId -eq $old) { $scene.featureId = $new; $scene.id = $scene.id.Replace($old, $new) }
        foreach ($surface in $inventory.surfaces) { foreach ($feature in $surface.features | Where-Object id -eq $new) { foreach ($interaction in $feature.requiredInteractions) { $interaction.sceneId = $interaction.sceneId.Replace($old, $new) } } }
        Write-UITestJson $authority $fixture.Authority
        Write-UITestJson $inventory $fixture.Inventory
        Write-UITestJson $registry $fixture.Registry
        Expect-Red 'matching-row-and-authority-rename' { Invoke-Validator $fixture }
        $crlf = ((Get-Content -Raw $fixture.Authority) -replace "`r?`n", "`r`n")
        [IO.File]::WriteAllText($fixture.Authority, $crlf, [Text.UTF8Encoding]::new($false))
        Expect-Red 'crlf-matching-row-and-authority-rename' { Invoke-Validator $fixture }
    } finally {
        [IO.File]::WriteAllBytes($fixture.Authority, $authorityOriginal)
        [IO.File]::WriteAllBytes($fixture.Inventory, $inventoryOriginal)
        [IO.File]::WriteAllBytes($fixture.Registry, $registryOriginal)
    }

    $detachedVerifier = Join-Path $fixture.RepositoryRoot 'scripts/verify-ui-drive-evidence-detached.ps1'
    $source = Get-Content -Raw -LiteralPath (Join-Path $fixture.RepositoryRoot 'scripts/verify-ui-drive-evidence.ps1')
    $mutated = [regex]::Replace($source, '(?m)^\. \(Join-Path \$PSScriptRoot ''ui-drive-evidence-lib[.]ps1''\)$', '# detached strict admission source')
    if ($mutated -ceq $source) { throw 'Detached-source mutation did not land.' }
    [IO.File]::WriteAllText($detachedVerifier, $mutated, [Text.UTF8Encoding]::new($false))
    try { Expect-Red 'commented-active-strict-admission-source' { Invoke-Validator $fixture 'verify-ui-drive-evidence-detached.ps1' } } finally { Remove-Item -LiteralPath $detachedVerifier -Force }

    Expect-Red 'manual-static-receipt-cannot-promote' {Invoke-ReceiptValidator $fixture}
    if((Invoke-ReceiptValidator $fixture -StructuralOnly)-ne 0){throw 'Manual receipt did not pass structural-only validation.'}
    $ledgerHash=(Get-FileHash $fixture.Ledger -Algorithm SHA256).Hash
    Expect-Red 'public-static-append-refused' {$previous=$ErrorActionPreference;try{$ErrorActionPreference='Continue';&powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $fixture.RepositoryRoot 'scripts/append-ui-drive-ledger.ps1') -Receipt $fixture.Receipt 1>$null 2>$null;return $LASTEXITCODE}finally{$ErrorActionPreference=$previous}}
    if((Get-FileHash $fixture.Ledger -Algorithm SHA256).Hash -cne $ledgerHash){throw 'Refused static append changed the ledger.'}
    $copied=Join-Path $fixture.EvidenceRoot 'receipts/copied-receipt.json';Copy-Item $fixture.Receipt $copied
    try{Expect-Red 'copied-receipt-path' {Invoke-ReceiptValidator $fixture -StructuralOnly -ReceiptPath $copied}}finally{Remove-Item $copied -Force}
    Invoke-RecordMutationRed $fixture $fixture.Run {param($data)$data.generator.PSObject.Properties.Add([psnoteproperty]::new('approved',$true))} 'self-authored-approval-boolean'
    Invoke-RecordMutationRed $fixture $fixture.Provenance {param($data)$data.intendedSourceCommit='1111111111111111111111111111111111111111'} 'artifact-provenance-commit-mismatch'
    Invoke-RecordMutationRed $fixture $fixture.Audit {param($data)$data.auditedElementCount=2} 'every-element-audit-count-mismatch'
    Invoke-RecordMutationRed $fixture $fixture.Receipt {param($data)$data.image.path='../../repository-screenshot.png'} 'repository-screenshot-path-escape'
    Invoke-RecordMutationRed $fixture $fixture.Origin {param($data)$data.replayKey='5555555555555555555555555555555555555555555555555555555555555555'} 'replayed-live-origin'
    if((Invoke-Validator $fixture)-ne 0){throw 'Untouched empty-ledger evidence baseline did not return green.'}
    Write-Output "PASS: $redCount whole-row, authority, CRLF, active-source, static-promotion, copy, forgery, provenance, audit, path, and replay negatives turned red; the real ledger stayed empty and green."
} finally {
    if (Test-Path -LiteralPath $tempRoot) {
        $resolved = [IO.Path]::GetFullPath($tempRoot)
        $tempPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
        if (-not $resolved.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolved) -notlike 'material-designer-ui-drive-evidence-*') { throw 'Refused unexpected disposable fixture deletion target.' }
        Get-ChildItem -LiteralPath $resolved -Recurse -Force | ForEach-Object { [IO.File]::SetAttributes($_.FullName, [IO.FileAttributes]::Normal) }
        [IO.Directory]::Delete($resolved, $true)
    }
}
