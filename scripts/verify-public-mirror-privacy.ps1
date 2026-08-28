[CmdletBinding()]
param(
    [string]$Root,
    [string]$VocabularySource = $env:PUBLIC_MIRROR_VOCABULARY_SOURCE,
    [switch]$SelfTest
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($Root)) {
    $Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}

function Read-PrivateValues {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return @()
    }

    $raw = Get-Content -LiteralPath $Path -Raw
    $extension = [IO.Path]::GetExtension($Path).ToLowerInvariant()
    if ($extension -eq '.json') {
        $document = $raw | ConvertFrom-Json
        $schemaProperty = $document.PSObject.Properties['schemaVersion']
        if ($null -ne $schemaProperty -and [int]$schemaProperty.Value -ne 1) {
            throw "Unsupported vocabulary source schema"
        }
        $entriesProperty = $document.PSObject.Properties['entries']
        $termsProperty = $document.PSObject.Properties['terms']
        if ($null -ne $entriesProperty -and $entriesProperty.Value -is [pscustomobject]) {
            $values = foreach ($property in $entriesProperty.Value.psobject.Properties) {
                if ($property.Value -isnot [string] -or [string]::IsNullOrWhiteSpace($property.Value)) {
                    throw "Vocabulary source contains a non-string replacement"
                }
                $property.Value.Trim()
            }
        }
        elseif ($null -ne $termsProperty) {
            $values = foreach ($term in @($termsProperty.Value)) {
                if ($term.alias -isnot [string] -or [string]::IsNullOrWhiteSpace($term.alias)) {
                    throw "Vocabulary source contains a term without an alias"
                }
                $term.alias -split ' / '
            }
        }
        else {
            throw "Vocabulary source has no supported entries"
        }
    }
    else {
        $matches = [regex]::Matches($raw, 'Say \*\*[“"]([^”"]+)[”"]\*\*')
        if ($matches.Count -eq 0) {
            throw "Vocabulary source has no supported definitions"
        }
        $values = foreach ($match in $matches) { $match.Groups[1].Value }
    }
    @($values | Where-Object { $_ -notmatch '^Slop Machine$' } | Sort-Object -Unique)
}

function Find-PrivateValueHits {
    param(
        [string]$ScopeRoot,
        [string[]]$PrivateValues
    )

    $hits = [System.Collections.Generic.List[object]]::new()
    foreach ($relativePath in @('AGENTS.md', 'README.md')) {
        $path = Join-Path $ScopeRoot $relativePath
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            [void]$hits.Add([pscustomobject]@{ Path = $relativePath; Line = 0; Kind = 'missing mirror' })
            continue
        }

        $lines = @(Get-Content -LiteralPath $path)
        for ($lineIndex = 0; $lineIndex -lt $lines.Count; $lineIndex++) {
            foreach ($value in $PrivateValues) {
                $escaped = [regex]::Escape($value)
                if ($lines[$lineIndex] -match "(?<![\p{L}\p{N}_])$escaped(?![\p{L}\p{N}_])") {
                    [void]$hits.Add([pscustomobject]@{
                            Path = $relativePath
                            Line = $lineIndex + 1
                            Kind = 'private replacement value'
                        })
                }
            }
        }
    }
    return @($hits.ToArray())
}

function Invoke-MirrorCheck {
    param(
        [string]$ScopeRoot,
        [string[]]$PrivateValues
    )

    $hits = @(Find-PrivateValueHits -ScopeRoot $ScopeRoot -PrivateValues $PrivateValues)
    if ($hits.Count -gt 0) {
        Write-Host ("Public mirror privacy check found {0} issue(s): {1}" -f $hits.Count, (($hits | ForEach-Object { "$($_.Path):$($_.Line) [$($_.Kind)]" }) -join ', '))
        return $false
    }
    $true
}

function Invoke-NegativeProof {
    $fixture = Join-Path ([IO.Path]::GetTempPath()) ("public-mirror-privacy-" + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $fixture | Out-Null
    try {
        Set-Content -LiteralPath (Join-Path $fixture 'AGENTS.md') -Value 'Safe public mirror'
        Set-Content -LiteralPath (Join-Path $fixture 'README.md') -Value 'Safe public mirror'
        $values = @('ForbiddenPrivateSentinel')

        Set-Content -LiteralPath (Join-Path $fixture 'AGENTS.md') -Value 'ForbiddenPrivateSentinel'
        if (Invoke-MirrorCheck -ScopeRoot $fixture -PrivateValues $values) {
            throw 'Negative proof failed: injected sentinel remained green'
        }
        Write-Output 'Negative proof red: injected private sentinel was detected.'

        Set-Content -LiteralPath (Join-Path $fixture 'AGENTS.md') -Value 'Safe public mirror'
        if (-not (Invoke-MirrorCheck -ScopeRoot $fixture -PrivateValues $values)) {
            throw 'Negative proof failed: restored mirror remained red'
        }
        Write-Output 'Negative proof green: restored public mirror passed.'
    }
    finally {
        if (Test-Path -LiteralPath $fixture) {
            Remove-Item -LiteralPath $fixture -Recurse -Force
        }
    }
}

if ($SelfTest) {
    Invoke-NegativeProof
    exit 0
}

$privateValues = @(Read-PrivateValues -Path $VocabularySource)
if ($privateValues.Count -eq 0) {
    Write-Output 'Public mirror privacy check skipped dictionary matching because no private source was supplied.'
    Write-Output 'Outsider mode is intentional: the private source stays outside this public repository.'
    if (-not (Invoke-MirrorCheck -ScopeRoot $Root -PrivateValues @())) {
        exit 1
    }
    exit 0
}

if (-not (Invoke-MirrorCheck -ScopeRoot $Root -PrivateValues $privateValues)) {
    exit 1
}
Write-Output 'Public mirror privacy check passed.'
exit 0
