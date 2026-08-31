param(
  [Parameter(Mandatory = $false)]
  [string]$Root = ''
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($Root)) {
  $Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}

function Read-Source([string]$RelativePath) {
  $path = Join-Path $Root $RelativePath
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Required source file is missing: $RelativePath"
  }
  return Get-Content -Raw -LiteralPath $path
}

$entryShell = Read-Source 'design/apps/web/src/components/EntryShell.tsx'
$entryNavRail = Read-Source 'design/apps/web/src/components/EntryNavRail.tsx'
$homeView = Read-Source 'design/apps/web/src/components/HomeView.tsx'

$forbidden = @(
  @{ Name = 'automatic campaign badge'; Source = $entryShell; Pattern = '<WorkbenchCampaignBadge(?:\s|/|>)' },
  @{ Name = 'automatic signed-out account callout'; Source = $entryShell; Pattern = '<CloudSignInTip(?:\s|/|>)' },
  @{ Name = 'automatic campaign dialog'; Source = $homeView; Pattern = '<DeepSeekV4FlashCampaign(?:\s|/|>)' },
  @{ Name = 'top-right star-count pill'; Source = $entryNavRail; Pattern = 'data-testid\s*=\s*["'']entry-top-right-github["'']' }
)

$failures = @()
foreach ($boundary in $forbidden) {
  if ($boundary.Source -match $boundary.Pattern) {
    $failures += $boundary.Name
  }
}

$required = @(
  @{ Name = 'user-initiated onboarding route'; Source = $entryShell; Pattern = "navigate\(\{\s*kind:\s*'home',\s*view:\s*'onboarding'\s*\}" },
  @{ Name = 'user-initiated settings route'; Source = $entryShell; Pattern = 'onOpenSettings=\{onOpenSettings\}' }
)

foreach ($boundary in $required) {
  if ($boundary.Source -notmatch $boundary.Pattern) {
    $failures += "missing $($boundary.Name)"
  }
}

if ($failures.Count -gt 0) {
  foreach ($failure in $failures) {
    Write-Error "Unsolicited-entry surface contract failed: $failure"
  }
  exit 1
}

Write-Output 'Unsolicited-entry surface contract passed: 4 automatic mounts absent, 2 user-initiated routes present.'
exit 0
