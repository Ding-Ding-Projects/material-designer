[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string]$EvidenceRoot,
    [Parameter(Mandatory = $true)] [string]$OutputPath,
    [Parameter(Mandatory = $true)] [string]$RunId,
    [Parameter(Mandatory = $true)] [string]$SessionId,
    [Parameter(Mandatory = $true)] [string]$RepositoryRoot,
    [Parameter(Mandatory = $true)] [string]$SourceCommit,
    [Parameter(Mandatory = $true)] [string]$ArtifactPath,
    [Parameter(Mandatory = $true)] [string]$ArtifactSha256,
    [Parameter(Mandatory = $true)] [int]$ProcessId,
    [Parameter(Mandatory = $true)] [string]$ProcessImagePath,
    [Parameter(Mandatory = $true)] [string]$WindowClass,
    [Parameter(Mandatory = $true)] [string]$WindowTitle,
    [Parameter(Mandatory = $true)] [int]$WindowWidth,
    [Parameter(Mandatory = $true)] [int]$WindowHeight,
    [Parameter(Mandatory = $true)] [string]$SceneId,
    [Parameter(Mandatory = $true)] [string]$InteractionId,
    [Parameter(Mandatory = $true)] [int]$Sequence,
    [Parameter(Mandatory = $true)] [string]$ActionKind,
    [Parameter(Mandatory = $true)] [string]$ActionTarget,
    [Parameter(Mandatory = $true)] [string]$AccessibleName,
    [Parameter(Mandatory = $true)] [string]$InputMethod,
    [Parameter(Mandatory = $true)] [string]$SemanticPollsPath,
    [Parameter(Mandatory = $true)] [string]$OriginalImagePath,
    [Parameter(Mandatory = $true)] [string]$OriginalImageSha256,
    [Parameter(Mandatory = $true)] [string]$ReceiptId,
    [Parameter(Mandatory = $true)] [string]$ReceiptPath
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ui-drive-evidence-lib.ps1')
$schemaPath = Join-Path (Split-Path $PSScriptRoot -Parent) '.codex/verification/ui-drive/capture-run.schema.json'

Assert-UIGitCommit -RepositoryRoot $RepositoryRoot -Commit $SourceCommit -RequireAncestorOfHead
$outputFull = Resolve-UIEvidencePath -EvidenceRoot $EvidenceRoot -Path $OutputPath -AllowMissingLeaf
if (Test-Path -LiteralPath $outputFull) { throw 'Capture-run manifest already exists and cannot be replaced.' }
$artifactFull = Resolve-UIEvidencePath -EvidenceRoot $EvidenceRoot -Path $ArtifactPath
$processImageFull = Resolve-UIEvidencePath -EvidenceRoot $EvidenceRoot -Path $ProcessImagePath
$imageFull = Resolve-UIEvidencePath -EvidenceRoot $EvidenceRoot -Path $OriginalImagePath
$receiptFull = Resolve-UIEvidencePath -EvidenceRoot $EvidenceRoot -Path $ReceiptPath -AllowMissingLeaf
if ((Get-UIFileSha256 $artifactFull) -cne $ArtifactSha256) { throw 'Capture-run artifact hash does not match the supplied artifact.' }
if ((Get-UIFileSha256 $imageFull) -cne $OriginalImageSha256) { throw 'Capture-run original image hash does not match the supplied image.' }
if ($processImageFull -cne $artifactFull -or (Get-UIFileSha256 $processImageFull) -cne $ArtifactSha256) { throw 'Capture-run target process image must be the exact captured artifact.' }
$process = Get-Process -Id $ProcessId -ErrorAction Stop
if ([IO.Path]::GetFullPath($process.Path) -cne [IO.Path]::GetFullPath($processImageFull)) { throw 'Capture-run target process image does not match the live process.' }
if ($WindowWidth -lt 1 -or $WindowHeight -lt 1) { throw 'Capture-run target window dimensions must be nonzero.' }
$pollSource = Assert-UIPathHasNoReparsePoint -Path $SemanticPollsPath
$semanticPolls = @(Read-UIStrictJson -Path $pollSource -MaxBytes 1048576 -MaxDepth 8 -MaxStringLength 1000 -MaxArrayLength 120 -MaxObjectProperties 8)
if ($semanticPolls.Count -lt 1 -or $semanticPolls.Count -gt 120) { throw 'Capture-run semantic poll count is outside the approved bound.' }
$lastElapsed = -1
for ($pollIndex = 0; $pollIndex -lt $semanticPolls.Count; $pollIndex++) {
    $poll = $semanticPolls[$pollIndex]
    if ($poll -isnot [pscustomobject]) { throw 'Capture-run semantic poll entry is not an object.' }
    $names = @($poll.PSObject.Properties.Name)
    if (@(Compare-Object $names @('ordinal','method','elapsedMs','observedState') -CaseSensitive).Count -ne 0) { throw 'Capture-run semantic poll entry has missing or unknown fields.' }
    if ([int]$poll.ordinal -ne ($pollIndex + 1) -or [string]::IsNullOrWhiteSpace([string]$poll.method) -or [string]$poll.method -match '.{121}' -or [int]$poll.elapsedMs -lt $lastElapsed -or [int]$poll.elapsedMs -gt 120000 -or [string]::IsNullOrWhiteSpace([string]$poll.observedState) -or [string]$poll.observedState -match '.{1001}') { throw 'Capture-run semantic poll entry violates ordering or bounds.' }
    $lastElapsed = [int]$poll.elapsedMs
}

$relativeOutput = $outputFull.Substring(([IO.Path]::GetFullPath($EvidenceRoot).TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar).Length).Replace('\','/')
$relativeArtifact = $artifactFull.Substring(([IO.Path]::GetFullPath($EvidenceRoot).TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar).Length).Replace('\','/')
$relativeProcessImage = $processImageFull.Substring(([IO.Path]::GetFullPath($EvidenceRoot).TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar).Length).Replace('\','/')
$relativeImage = $imageFull.Substring(([IO.Path]::GetFullPath($EvidenceRoot).TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar).Length).Replace('\','/')
$relativeReceipt = $receiptFull.Substring(([IO.Path]::GetFullPath($EvidenceRoot).TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar).Length).Replace('\','/')
if ($relativeOutput -cne "runs/$RunId.json" -or $relativeReceipt -cne "receipts/$ReceiptId.json" -or $relativeImage -cne ('images/{0}/{1:D4}-{2}.png' -f $RunId,$Sequence,$SceneId) -or $relativeArtifact -notmatch ('^artifacts/' + [regex]::Escape($ArtifactSha256) + '/[^/]+$')) { throw 'Approved driver output does not use the fixed receipt-backed evidence namespace.' }

$record = [ordered]@{
    version = 1
    runId = $RunId
    sessionId = $SessionId
    generator = [ordered]@{
        driverId = 'approved-cheap-lowlevel-headless-driver'
        scriptPath = 'scripts/write-approved-ui-drive-capture-run.ps1'
        scriptSha256 = Get-UIFileSha256 $MyInvocation.MyCommand.Path
        invocationId = [guid]::NewGuid().ToString('N')
    }
    captureRoute = 'cheap-lowlevel-headless'
    sourceCommit = $SourceCommit
    artifactSha256 = $ArtifactSha256
    target = [ordered]@{
        processId = $ProcessId
        processImagePath = $relativeProcessImage
        processImageSha256 = Get-UIFileSha256 $processImageFull
        windowClass = $WindowClass
        windowTitle = $WindowTitle
        windowWidth = $WindowWidth
        windowHeight = $WindowHeight
    }
    interaction = [ordered]@{
        sceneId = $SceneId
        interactionId = $InteractionId
        sequence = $Sequence
        kind = $ActionKind
        target = $ActionTarget
        accessibleName = $AccessibleName
        inputMethod = $InputMethod
    }
    semanticPolls = @($semanticPolls)
    originalImage = [ordered]@{ path = $relativeImage; sha256 = $OriginalImageSha256 }
    receipt = [ordered]@{ id = $ReceiptId; path = $relativeReceipt }
}

$json = $record | ConvertTo-Json -Depth 20
$encoding = [Text.UTF8Encoding]::new($false)
$parent = [IO.Path]::GetDirectoryName($outputFull)
[void](Assert-UIPathHasNoReparsePoint -Path $parent)
$stream = [IO.FileStream]::new($outputFull, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
try {
    $payload = $encoding.GetBytes($json + [Environment]::NewLine)
    $stream.Write($payload, 0, $payload.Length)
    $stream.Flush($true)
} finally { $stream.Dispose() }
try {
    $validated = Read-UIValidatedJson -Path $outputFull -SchemaPath $schemaPath -MaxBytes 1048576 -MaxDepth 20 -MaxStringLength 1024 -MaxArrayLength 120 -MaxObjectProperties 64
} catch {
    Remove-Item -LiteralPath $outputFull -Force
    throw
}
Write-Output "PASS: approved driver wrote one schema-validated capture-run manifest for $RunId."
