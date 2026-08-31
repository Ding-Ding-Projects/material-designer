[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent
$guard = Join-Path $PSScriptRoot "check-packaged-splash-branding.ps1"
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("material-designer-splash-guard-" + [guid]::NewGuid().ToString("N"))

function Invoke-Guard([string]$FixtureRoot) {
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $guard -Root $FixtureRoot *> $null
        return $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
}

function Reset-Fixture {
    $runtimeTarget = Join-Path $tempRoot "design/apps/desktop/src/main/runtime.ts"
    $logoTarget = Join-Path $tempRoot "assets/branding/material-designer-logo-v2.png"
    $appIconTarget = Join-Path $tempRoot "design/apps/web/public/app-icon.png"
    $retiredTarget = Join-Path $tempRoot "design/apps/desktop/src/main/splash-video.ts"
    New-Item -ItemType Directory -Force -Path (Split-Path $runtimeTarget -Parent) | Out-Null
    New-Item -ItemType Directory -Force -Path (Split-Path $logoTarget -Parent) | Out-Null
    New-Item -ItemType Directory -Force -Path (Split-Path $appIconTarget -Parent) | Out-Null
    Remove-Item -LiteralPath $retiredTarget -Force -ErrorAction SilentlyContinue
    Copy-Item -LiteralPath (Join-Path $repoRoot "design/apps/desktop/src/main/runtime.ts") -Destination $runtimeTarget -Force
    Copy-Item -LiteralPath (Join-Path $repoRoot "assets/branding/material-designer-logo-v2.png") -Destination $logoTarget -Force
    Copy-Item -LiteralPath (Join-Path $repoRoot "design/apps/web/public/app-icon.png") -Destination $appIconTarget -Force
}

try {
    Reset-Fixture
    if ((Invoke-Guard $tempRoot) -ne 0) { throw "The unmodified fixture did not pass the splash-branding guard." }

    $runtimeTarget = Join-Path $tempRoot "design/apps/desktop/src/main/runtime.ts"
    $cases = @(
        @{ Name = "upstream name"; Old = '<div class="splash-name" id="splash-name">Material Designer</div>'; New = '<div class="splash-name" id="splash-name">Open Design</div>' },
        @{ Name = "drifted mark"; Old = 'pathToFileURL(resolveDesktopIconPath()).href'; New = 'pathToFileURL(resolve(dirname(fileURLToPath(import.meta.url)), "missing-icon.png")).href' },
        @{ Name = "missing reduced motion"; Old = '@media (prefers-reduced-motion: reduce)'; New = '@media (prefers-reduced-motion: no-preference)' },
        @{ Name = "missing live progress"; Old = 'window.__odSplashSetStage = function (info)'; New = 'window.__odSplashSetStageDisabled = function (info)' }
    )
    foreach ($case in $cases) {
        Reset-Fixture
        $text = Get-Content -Raw -LiteralPath $runtimeTarget
        $changed = $text.Replace($case.Old, $case.New)
        if ($changed -ceq $text) { throw "Negative fixture replacement did not land: $($case.Name)" }
        Set-Content -LiteralPath $runtimeTarget -Value $changed -NoNewline
        if ((Invoke-Guard $tempRoot) -eq 0) { throw "Guard stayed green after deliberate break: $($case.Name)" }
    }

    Reset-Fixture
    $retired = Join-Path $tempRoot "design/apps/desktop/src/main/splash-video.ts"
    Set-Content -LiteralPath $retired -Value 'export const SPLASH_VIDEO_DATA_URL = "data:video/webm;base64,broken";' -NoNewline
    if ((Invoke-Guard $tempRoot) -eq 0) { throw "Guard stayed green after the retired upstream splash source returned." }

    Reset-Fixture
    if ((Invoke-Guard $tempRoot) -ne 0) { throw "The restored fixture did not return to green." }
    Write-Output "PASS: splash-branding guard turned red for five deliberate identity/progress breaks and green after restoration."
} finally {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
