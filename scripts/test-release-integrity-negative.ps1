[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = (Get-Location).Path
$validator = (Resolve-Path -LiteralPath 'scripts/verify-release-integrity.ps1').Path
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('material-designer-release-integrity-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempRoot | Out-Null

function New-Fixture {
  $fixture = Join-Path $tempRoot ([guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path (Join-Path $fixture '.github/workflows') -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $fixture 'scripts') -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $fixture 'site') -Force | Out-Null
  Copy-Item -LiteralPath '.github/workflows/release.yml' -Destination (Join-Path $fixture '.github/workflows/release.yml')
  Copy-Item -LiteralPath '.github/workflows/pages.yml' -Destination (Join-Path $fixture '.github/workflows/pages.yml')
  Copy-Item -LiteralPath 'scripts/release-codename.sh' -Destination (Join-Path $fixture 'scripts/release-codename.sh')
  Copy-Item -LiteralPath 'site/index.html' -Destination (Join-Path $fixture 'site/index.html')
  return $fixture
}

function Invoke-Contract([string]$Fixture) {
  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $validator `
      -ReleaseWorkflow (Join-Path $Fixture '.github/workflows/release.yml') `
      -PagesWorkflow (Join-Path $Fixture '.github/workflows/pages.yml') `
      -CodenameScript (Join-Path $Fixture 'scripts/release-codename.sh') `
      -SiteIndex (Join-Path $Fixture 'site/index.html') *> $null
    return $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousPreference
  }
}

function Expect-Red([string]$Name, [scriptblock]$Mutation) {
  $fixture = New-Fixture
  try {
    & $Mutation $fixture
    $code = Invoke-Contract $fixture
    if ($code -eq 0) { throw "Negative mutation '$Name' stayed green." }
    Write-Output "RED: $Name"
  } finally {
    if (Test-Path -LiteralPath $fixture) { Remove-Item -LiteralPath $fixture -Recurse -Force }
  }
}

try {
  $baseline = New-Fixture
  try {
    $baselineCode = Invoke-Contract $baseline
    if ($baselineCode -ne 0) { throw 'Release integrity baseline is not green.' }
  } finally {
    if (Test-Path -LiteralPath $baseline) { Remove-Item -LiteralPath $baseline -Recurse -Force }
  }

  Expect-Red 'remove-used-id-exclusion' {
    param($fixture)
    $path = Join-Path $fixture 'scripts/release-codename.sh'
    $text = [IO.File]::ReadAllText($path)
    $needle = '  if grep -Fqx "$id"'
    $replacement = '  # if grep -Fqx "$id"'
    if (-not $text.Contains($needle)) { throw 'used-id executable line was not found in fixture' }
    [IO.File]::WriteAllText($path, $text.Replace($needle, $replacement))
  }
  Expect-Red 'remove-image-output' {
    param($fixture)
    $path = Join-Path $fixture 'scripts/release-codename.sh'
    $text = [IO.File]::ReadAllText($path)
    $needle = '  printf ''image_dish=%s\n'' "$id"'
    if (-not $text.Contains($needle)) { throw 'image_dish output line was not found in fixture' }
    [IO.File]::WriteAllText($path, $text.Replace($needle, '  # ' + $needle.TrimStart()))
  }
  Expect-Red 'remove-output-forwarding' {
    param($fixture)
    $path = Join-Path $fixture '.github/workflows/release.yml'
    $text = [IO.File]::ReadAllText($path)
    $needle = '          cat "$raw" >> "$GITHUB_OUTPUT"'
    if (-not $text.Contains($needle)) { throw 'output forwarding line was not found in fixture' }
    [IO.File]::WriteAllText($path, $text.Replace($needle, '          # cat "$raw" >> "$GITHUB_OUTPUT"'))
  }
  Expect-Red 'remove-pages-current-release-resolution' {
    param($fixture)
    $path = Join-Path $fixture '.github/workflows/pages.yml'
    $text = [IO.File]::ReadAllText($path)
    $needle = '          [ "$match_count" = "1" ] || { echo "::error::expected exactly one published release for $expected_sha, found $match_count" >&2; exit 1; }'
    if (-not $text.Contains($needle)) { throw 'exact-one release operation was not found in fixture' }
    [IO.File]::WriteAllText($path, $text.Replace($needle, '          # exact-one release resolution removed'))
  }
  Expect-Red 'allow-tag-ref-pages-deployment' {
    param($fixture)
    $path = Join-Path $fixture '.github/workflows/pages.yml'
    $text = [IO.File]::ReadAllText($path)
    $needle = "github.event.workflow_run.head_branch == 'main'"
    if (-not $text.Contains($needle)) { throw 'main-only workflow_run policy was not found in fixture' }
    [IO.File]::WriteAllText($path, $text.Replace($needle, "github.event.workflow_run.head_branch == 'refs/tags/v'"))
  }
  Expect-Red 'allow-non-main-pages-trigger' {
    param($fixture)
    $path = Join-Path $fixture '.github/workflows/pages.yml'
    $text = [IO.File]::ReadAllText($path)
    $needle = "on:`n  push:`n    branches:`n      - main"
    if (-not $text.Contains($needle)) { throw 'main-only push trigger was not found in fixture' }
    [IO.File]::WriteAllText($path, $text.Replace($needle, "on:`n  push:`n    branches:`n      - '**'"))
  }
  Expect-Red 'remove-duplicate-release-check' {
    param($fixture)
    $path = Join-Path $fixture '.github/workflows/release.yml'
    $text = [IO.File]::ReadAllText($path)
    $needle = '          if printf ''%s\n'' "$tags" | grep -Fqx "$TAG"; then'
    if (-not $text.Contains($needle)) { throw 'duplicate-release operation was not found in fixture' }
    [IO.File]::WriteAllText($path, $text.Replace($needle, '          if false; then'))
  }
  Expect-Red 'remove-timing-evidence' {
    param($fixture)
    $path = Join-Path $fixture '.github/workflows/release.yml'
    $text = [IO.File]::ReadAllText($path)
    [IO.File]::WriteAllText($path, $text.Replace('Workflow duration:', 'Workflow elapsed:'))
  }
  Expect-Red 'remove-line-count-evidence' {
    param($fixture)
    $path = Join-Path $fixture '.github/workflows/pages.yml'
    $text = [IO.File]::ReadAllText($path)
    [IO.File]::WriteAllText($path, $text.Replace('Lines of code', 'Code lines'))
  }
  Expect-Red 'remove-unsigned-asset-proof' {
    param($fixture)
    $path = Join-Path $fixture '.github/workflows/release.yml'
    $text = [IO.File]::ReadAllText($path)
    [IO.File]::WriteAllText($path, $text.Replace("Status -ne 'NotSigned'", "Status -ne 'Signed'"))
  }
  Expect-Red 'comment-out-public-image-validation' {
    param($fixture)
    $path = Join-Path $fixture '.github/workflows/release.yml'
    $text = [IO.File]::ReadAllText($path)
    $needle = '          printf ''status=blocked-no-copy-policy\n'' >> "$GITHUB_OUTPUT"'
    if (-not $text.Contains($needle)) { throw 'no-copy status output line was not found in fixture' }
    [IO.File]::WriteAllText($path, $text.Replace($needle, '          # ' + $needle.TrimStart()))
  }
  Expect-Red 'allow-duplicate-pages-fields' {
    param($fixture)
    $path = Join-Path $fixture '.github/workflows/pages.yml'
    $text = [IO.File]::ReadAllText($path)
    [IO.File]::WriteAllText($path, $text.Replace('= "1" ] ||', '-gt "0" ] ||'))
  }
  Expect-Red 'comment-out-prior-release-body-read' {
    param($fixture)
    $path = Join-Path $fixture '.github/workflows/release.yml'
    $text = [IO.File]::ReadAllText($path)
    [IO.File]::WriteAllText($path, $text.Replace('            if ! gh release view "$tag"', '            # if ! gh release view "$tag"'))
  }
  Expect-Red 'remove-safe-pages-parser' {
    param($fixture)
    $path = Join-Path $fixture '.github/workflows/pages.yml'
    $text = [IO.File]::ReadAllText($path)
    [IO.File]::WriteAllText($path, $text.Replace('          set_link() {', '          # set_link() {'))
  }

  $restored = New-Fixture
  try {
    $restoredCode = Invoke-Contract $restored
    if ($restoredCode -ne 0) { throw 'Restored release integrity fixture did not return green.' }
  } finally {
    if (Test-Path -LiteralPath $restored) { Remove-Item -LiteralPath $restored -Recurse -Force }
  }
  Write-Output 'PASS: fourteen exact release-integrity mutations, including behavior-removal, comment-out, duplicate-field, and page-parser mutations, turned red, then the restored contract returned green.'
} finally {
  if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
  Set-Location $root
}
