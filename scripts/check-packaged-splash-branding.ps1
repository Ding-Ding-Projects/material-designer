[CmdletBinding()]
param(
    [string]$Root = "."
)

$ErrorActionPreference = "Stop"
$failures = [System.Collections.Generic.List[string]]::new()

function Add-Failure([string]$Message) {
    $script:failures.Add($Message)
}

function Count-Literal([string]$Text, [string]$Needle) {
    $count = 0
    $offset = 0
    while (($index = $Text.IndexOf($Needle, $offset, [StringComparison]::Ordinal)) -ge 0) {
        $count += 1
        $offset = $index + $Needle.Length
    }
    return $count
}

$startupIdentitySources = @(
    "design/apps/desktop/src/main/runtime.ts",
    "mockups/open-design-m3/assets/logo.svg"
)
$retiredSources = @("design/apps/desktop/src/main/splash-video.ts")

foreach ($relativePath in $startupIdentitySources) {
    $path = Join-Path $Root $relativePath
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        Add-Failure "Startup identity source is missing: $relativePath"
    }
}
foreach ($relativePath in $retiredSources) {
    if (Test-Path -LiteralPath (Join-Path $Root $relativePath)) {
        Add-Failure "Retired upstream splash source returned: $relativePath"
    }
}

$runtimePath = Join-Path $Root $startupIdentitySources[0]
$logoPath = Join-Path $Root $startupIdentitySources[1]
if ((Test-Path -LiteralPath $runtimePath -PathType Leaf) -and (Test-Path -LiteralPath $logoPath -PathType Leaf)) {
    $runtime = Get-Content -Raw -LiteralPath $runtimePath
    $logo = Get-Content -Raw -LiteralPath $logoPath
    $start = $runtime.IndexOf("function createPendingHtml(): string {", [StringComparison]::Ordinal)
    $end = $runtime.IndexOf("/**`r`n * Last-resort error screen", [StringComparison]::Ordinal)
    if ($end -lt 0) {
        $end = $runtime.IndexOf("/**`n * Last-resort error screen", [StringComparison]::Ordinal)
    }
    if ($start -lt 0 -or $end -le $start) {
        Add-Failure "Could not isolate the complete packaged startup splash producer."
    } else {
        $splash = $runtime.Substring($start, $end - $start)
        $requiredLiterals = @(
            '<title>Material Designer</title>',
            'aria-label="Material Designer mark"',
            '<div class="splash-name" id="splash-name">Material Designer</div>',
            '<div class="splash-description" id="splash-description">A local-first design workspace</div>',
            'aria-labelledby="splash-name" aria-describedby="splash-description"',
            '@media (prefers-reduced-motion: reduce)',
            '.boot-dots .dot { animation: none; opacity: 1; }',
            '.boot-progress-fill, .boot-stage { transition: none; }',
            '.boot-stage-swapping { opacity: 1; }',
            'window.__odSplashSetStage = function (info)',
            'id="boot-progress-fill"',
            'aria-live="polite"'
        )
        foreach ($literal in $requiredLiterals) {
            $count = Count-Literal $splash $literal
            if ($count -ne 1) {
                Add-Failure "Startup splash must contain exactly one '$literal'; found $count."
            }
        }

        $forbiddenLiterals = @(
            "Open Design",
            "OpenDesign",
            "The open-source Claude design alternative",
            "SPLASH_VIDEO_DATA_URL",
            "<video",
            "data:video/"
        )
        foreach ($literal in $forbiddenLiterals) {
            if ($splash.IndexOf($literal, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
                Add-Failure "Startup splash contains forbidden upstream or video identity: $literal"
            }
        }

        $logoMatch = [regex]::Match($logo, '<path d="([^"]+)" fill="#26251E"\s*(?:/>|></path>)')
        $splashMatch = [regex]::Match($splash, '<path d="([^"]+)" fill="currentColor"></path>')
        if (-not $logoMatch.Success) {
            Add-Failure "Could not read the canonical project mark path from the Material Designer mockup asset."
        } elseif (-not $splashMatch.Success) {
            Add-Failure "Could not read the inlined startup project mark path."
        } elseif ($logoMatch.Groups[1].Value -cne $splashMatch.Groups[1].Value) {
            Add-Failure "The packaged startup mark drifted from the shipped project mark."
        }
    }
}

if ($failures.Count -gt 0) {
    foreach ($failure in $failures) { Write-Error $failure }
    exit 1
}

Write-Output "PASS: packaged startup uses the Material Designer identity, canonical mark, accessible text, reduced-motion behavior, and live boot progress."
exit 0
