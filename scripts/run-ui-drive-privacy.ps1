[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string]$EvidenceRoot,
    [Parameter(Mandatory = $true)] [string[]]$ApprovedFile
)

$ErrorActionPreference = "Stop"
$root = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $EvidenceRoot).Path).TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar
$checked = 0
$findings = 0
foreach ($file in $ApprovedFile) {
    $full = [IO.Path]::GetFullPath($file)
    if (-not $full.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { throw "Approved output escapes the evidence root." }
    if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { throw "Approved output is missing." }
    $entry = Get-Item -LiteralPath $full -Force
    if ($entry.LinkType) { throw "Approved output must not be a link." }
    $checked++
    $ext = [IO.Path]::GetExtension($full).ToLowerInvariant()
    if ($ext -in @('.json','.jsonl','.log','.txt','.md')) {
        $text = [IO.File]::ReadAllText($full)
        # Generic markers catch accidental sensitive output without printing the payload.
        $patterns = @(
            '(?i)(?:password|secret|credential|api[_-]?key|private[_-]?key)\s*[:=]\s*["'']?[^\s,"'']+',
            '(?i)(?:[A-Z]:\\Users\\|/Users/|/home/|\\\\[^\\]+\\[^\\]+)',
            '(?<!\d)(?:10|127|172|192)\.(?:\d{1,3}\.){2}\d{1,3}(?!\d)'
        )
        foreach ($pattern in $patterns) { if ([Text.RegularExpressions.Regex]::IsMatch($text, $pattern)) { $findings++ } }
    }
}
if ($findings -gt 0) { throw "Privacy scan found $findings sensitive-output finding(s)." }
Write-Output "PASS: privacy scan checked $checked approved UI-drive outputs without emitting payloads."
