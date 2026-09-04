[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string]$EvidenceRoot,
    [Parameter(Mandatory = $true)] [string]$Manifest,
    [string]$VocabularySource,
    [int]$MaxRecordBytes = 4194304,
    [int]$MaxTotalTextBytes = 16777216
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ui-drive-evidence-lib.ps1')
$schemaRoot = Join-Path (Split-Path $PSScriptRoot -Parent) '.codex/verification/ui-drive'

$rootFull = Assert-UIPathHasNoReparsePoint -Path $EvidenceRoot
$manifestFull = Resolve-UIEvidencePath -EvidenceRoot $rootFull -Path $Manifest
$manifestData = Read-UIValidatedJson -Path $manifestFull -SchemaPath (Join-Path $schemaRoot 'approved-output-manifest.schema.json') -MaxBytes 1048576 -MaxDepth 16 -MaxStringLength 1024 -MaxArrayLength 32 -MaxObjectProperties 64

$patterns = @(
    '(?i)(?:password|secret|credential|api[_-]?key|private[_-]?key)\s*[:=]\s*["'']?[^\s,"'']+',
    '(?i)(?:[A-Z]:\\Users\\|/Users/|/home/|\\\\[^\\]+\\[^\\]+)',
    '(?<!\d)(?:10|127|172|192)\.(?:\d{1,3}\.){2}\d{1,3}(?!\d)'
)

$vocabularyTerms = [Collections.Generic.List[string]]::new()
$vocabularyDigests = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
if (-not [string]::IsNullOrWhiteSpace($VocabularySource)) {
    $vocabularyFull = Assert-UIPathHasNoReparsePoint -Path $VocabularySource
    $vocabulary = Read-UIStrictJson -Path $vocabularyFull -MaxBytes 4194304 -MaxDepth 32 -MaxStringLength 1024 -MaxArrayLength 20000 -MaxObjectProperties 512
    function Add-VocabularyStrings($value) {
        if ($value -is [string]) {
            $candidate = $value.Normalize([Text.NormalizationForm]::FormKC)
            if ($candidate.Length -ge 3 -and $candidate.Length -le 128) {
                $digestBytes = [Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($candidate))
                $digest = ([BitConverter]::ToString($digestBytes)).Replace('-', '').ToLowerInvariant()
                if ($script:vocabularyDigests.Add($digest)) { $script:vocabularyTerms.Add($candidate) }
            }
            return
        }
        if ($value -is [Array]) { foreach ($item in $value) { Add-VocabularyStrings $item }; return }
        if ($value -is [pscustomobject]) { foreach ($property in $value.PSObject.Properties) { Add-VocabularyStrings $property.Value } }
    }
    Add-VocabularyStrings $vocabulary
}

$checked = 0
$findings = 0
$totalTextBytes = 0L
$seenKinds = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
$seenPaths = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($entry in @($manifestData.entries)) {
    $full = Resolve-UIEvidencePath -EvidenceRoot $rootFull -Path ([string]$entry.relativePath)
    if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { throw 'Approved evidence output is missing.' }
    if (-not $seenPaths.Add($full)) { throw 'Approved output manifest repeats a path.' }
    if (-not $seenKinds.Add([string]$entry.kind)) { throw 'Approved output manifest repeats an evidence kind.' }
    $item = Get-Item -LiteralPath $full -Force
    if ([int64]$entry.bytes -ne [int64]$item.Length -or [string]$entry.sha256 -cne (Get-UIFileSha256 $full)) { throw 'Approved evidence output hash or byte count is stale.' }
    $checked++
    if ($entry.kind -eq 'image') {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'inspect-ui-drive-image.ps1') -ImagePath $full 1>$null 2>$null
        if ($LASTEXITCODE -ne 0) { throw 'Privacy scan rejected image structure or metadata.' }
        continue
    }
    if ($entry.kind -eq 'artifact') { continue }
    if ($item.Length -gt $MaxRecordBytes) { throw 'Privacy record exceeds the per-record byte bound.' }
    $totalTextBytes += $item.Length
    if ($totalTextBytes -gt $MaxTotalTextBytes) { throw 'Privacy records exceed the aggregate text byte bound.' }
    $text = [IO.File]::ReadAllText($full, [Text.UTF8Encoding]::new($false, $true))
    foreach ($pattern in $patterns) { if ([regex]::IsMatch($text, $pattern)) { $findings++ } }
    if ($vocabularyTerms.Count -gt 0) {
        $normalized = $text.Normalize([Text.NormalizationForm]::FormKC)
        foreach ($term in $vocabularyTerms) {
            if ($normalized.IndexOf($term, [StringComparison]::Ordinal) -ge 0) { $findings++ }
        }
    }
}

foreach ($requiredKind in @('receipt', 'image', 'artifact', 'artifact-provenance', 'capture-run', 'every-element-audit', 'live-origin', 'driver-transcript')) {
    if (-not $seenKinds.Contains($requiredKind)) { throw 'Approved output manifest is missing a required evidence kind.' }
}
if ($findings -gt 0) { throw "Privacy scan found $findings redacted finding(s)." }
Write-Output "PASS: privacy scan checked $checked fixed receipt-backed outputs and found 0 redacted findings."
