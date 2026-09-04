[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ui-drive-test-fixture.ps1')
$sourceRoot = Split-Path $PSScriptRoot -Parent
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('material-designer-ui-drive-privacy-' + [guid]::NewGuid().ToString('N'))
$redCount = 0

function Invoke-Privacy($Fixture, [string]$VocabularySource) {
    $arguments = @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $Fixture.RepositoryRoot 'scripts/run-ui-drive-privacy.ps1'),'-EvidenceRoot',$Fixture.EvidenceRoot,'-Manifest',$Fixture.Manifest)
    if (-not [string]::IsNullOrWhiteSpace($VocabularySource)) { $arguments += @('-VocabularySource',$VocabularySource) }
    $previous = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = & powershell.exe @arguments 2>&1
        return [pscustomobject]@{ ExitCode=$LASTEXITCODE; Output=($output -join [Environment]::NewLine) }
    } finally { $ErrorActionPreference = $previous }
}
function Expect-PrivacyRed([string]$Name, $Fixture, [string]$VocabularySource, [string]$ForbiddenOutput) {
    $result = Invoke-Privacy $Fixture $VocabularySource
    if ($result.ExitCode -eq 0) { throw "Privacy negative '$Name' stayed green." }
    if (-not [string]::IsNullOrWhiteSpace($ForbiddenOutput) -and $result.Output.Contains($ForbiddenOutput)) { throw 'Privacy refusal emitted sensitive fixture content.' }
    $script:redCount++
    Write-Output "RED: $Name"
}
function Update-ManifestEntry($Fixture, [string]$Kind, [string]$File) {
    $manifest = Get-Content -Raw -LiteralPath $Fixture.Manifest | ConvertFrom-Json
    $entry = $manifest.entries | Where-Object kind -eq $Kind
    $entry.sha256 = (Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant()
    $entry.bytes = [int64](Get-Item -LiteralPath $File).Length
    Write-UITestJson $manifest $Fixture.Manifest
}

try {
    $fixture = New-UIEvidenceTestRepository -SourceRoot $sourceRoot -DestinationRoot $tempRoot
    $baseline = Invoke-Privacy $fixture ''
    if ($baseline.ExitCode -ne 0 -or $baseline.Output -notmatch '^PASS: privacy scan checked 8 fixed receipt-backed outputs and found 0 redacted findings[.]$') { throw 'Safe fixed-manifest privacy baseline did not pass with aggregate-only output.' }

    $auditBytes = [IO.File]::ReadAllBytes($fixture.Audit)
    $manifestBytes = [IO.File]::ReadAllBytes($fixture.Manifest)
    try {
        $audit = Get-Content -Raw $fixture.Audit | ConvertFrom-Json
        $audit.visualInspection.visualDefectIds = @('password=not-for-evidence')
        Write-UITestJson $audit $fixture.Audit
        Update-ManifestEntry $fixture 'every-element-audit' $fixture.Audit
        Expect-PrivacyRed 'sensitive-associated-record' $fixture '' 'not-for-evidence'
    } finally { [IO.File]::WriteAllBytes($fixture.Audit,$auditBytes);[IO.File]::WriteAllBytes($fixture.Manifest,$manifestBytes) }

    try {
        $sentinel = 'private-vocabulary-fixture-sentinel'
        $vocabularyPath = Join-Path $tempRoot 'private-vocabulary.json'
        Write-UITestJson ([ordered]@{version=1;terms=@($sentinel)}) $vocabularyPath
        $audit = Get-Content -Raw $fixture.Audit | ConvertFrom-Json
        $audit.visualInspection.visualDefectIds = @($sentinel)
        Write-UITestJson $audit $fixture.Audit
        Update-ManifestEntry $fixture 'every-element-audit' $fixture.Audit
        Expect-PrivacyRed 'digest-derived-private-vocabulary' $fixture $vocabularyPath $sentinel
    } finally { [IO.File]::WriteAllBytes($fixture.Audit,$auditBytes);[IO.File]::WriteAllBytes($fixture.Manifest,$manifestBytes) }

    try {
        $large = [ordered]@{value=('x' * 4194305)}
        Write-UITestJson $large $fixture.Audit
        Update-ManifestEntry $fixture 'every-element-audit' $fixture.Audit
        Expect-PrivacyRed 'oversized-associated-record' $fixture '' ''
    } finally { [IO.File]::WriteAllBytes($fixture.Audit,$auditBytes);[IO.File]::WriteAllBytes($fixture.Manifest,$manifestBytes) }

    $imageBytes = [IO.File]::ReadAllBytes($fixture.Image)
    try {
        $iendOffset = $imageBytes.Length - 12
        $textData = [Text.Encoding]::ASCII.GetBytes('note' + [char]0 + 'metadata')
        $chunk = [byte[]]::new(12 + $textData.Length)
        $length = $textData.Length
        $chunk[0]=[byte](($length -shr 24)-band 255);$chunk[1]=[byte](($length -shr 16)-band 255);$chunk[2]=[byte](($length -shr 8)-band 255);$chunk[3]=[byte]($length-band 255)
        [Text.Encoding]::ASCII.GetBytes('tEXt').CopyTo($chunk,4)
        $textData.CopyTo($chunk,8)
        $combined = [byte[]]::new($imageBytes.Length + $chunk.Length)
        [Array]::Copy($imageBytes,0,$combined,0,$iendOffset)
        [Array]::Copy($chunk,0,$combined,$iendOffset,$chunk.Length)
        [Array]::Copy($imageBytes,$iendOffset,$combined,$iendOffset+$chunk.Length,12)
        [IO.File]::WriteAllBytes($fixture.Image,$combined)
        Update-ManifestEntry $fixture 'image' $fixture.Image
        Expect-PrivacyRed 'png-text-metadata' $fixture '' ''
    } finally { [IO.File]::WriteAllBytes($fixture.Image,$imageBytes);[IO.File]::WriteAllBytes($fixture.Manifest,$manifestBytes) }

    $manifest = Get-Content -Raw $fixture.Manifest | ConvertFrom-Json
    $manifest.entries[0].relativePath = '../../outside.json'
    Write-UITestJson $manifest $fixture.Manifest
    try { Expect-PrivacyRed 'manifest-path-escape' $fixture '' '' } finally { [IO.File]::WriteAllBytes($fixture.Manifest,$manifestBytes) }

    $restored = Invoke-Privacy $fixture ''
    if ($restored.ExitCode -ne 0 -or $restored.Output -notmatch '^PASS:') { throw 'Restored privacy fixture did not return green.' }
    Write-Output "PASS: privacy emitted aggregate-only output, accepted one fixed eight-output manifest, and $redCount sensitive-record, vocabulary, bound, PNG-metadata, and path negatives turned red."
} finally {
    if (Test-Path -LiteralPath $tempRoot) {
        $resolved=[IO.Path]::GetFullPath($tempRoot);$prefix=[IO.Path]::GetFullPath([IO.Path]::GetTempPath())
        if(-not $resolved.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)-or [IO.Path]::GetFileName($resolved)-notlike 'material-designer-ui-drive-privacy-*'){throw 'Refused unexpected privacy fixture deletion target.'}
        Get-ChildItem -LiteralPath $resolved -Recurse -Force | ForEach-Object {[IO.File]::SetAttributes($_.FullName,[IO.FileAttributes]::Normal)}
        [IO.Directory]::Delete($resolved,$true)
    }
}
