param(
  [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Read-Text([string]$RelativePath) {
  $path = Join-Path $root $RelativePath
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Required front-screen provenance file is missing: $RelativePath"
  }
  return Get-Content -Raw -LiteralPath $path
}

function Read-Lines([string]$Text) {
  return @($Text -split "`r`n|`n|`r")
}

function Get-ExecutableLines([string]$Text) {
  $result = @()
  foreach ($line in (Read-Lines $Text)) {
    $trimmed = $line.Trim()
    if ($trimmed.Length -eq 0 -or $trimmed.StartsWith('#') -or $trimmed.StartsWith('//')) {
      continue
    }
    $result += [pscustomobject]@{ Raw = $line; Code = $trimmed }
  }
  return @($result)
}

function Assert-ExecutableLine([string]$Text, [string]$Needle, [string]$Label) {
  $escapedNeedle = [regex]::Escape($Needle)
  $pattern = "(?<![A-Za-z0-9_])$escapedNeedle(?![A-Za-z0-9_])"
  $lines = @(Get-ExecutableLines $Text)
  $matches = @($lines | Where-Object { $_.Code -match $pattern })
  if ($matches.Count -ne 1) {
    throw "Expected exactly one executable source boundary for $Label, found $($matches.Count)"
  }
  $target = $matches[0]
  $allLines = @(Read-Lines $Text)
  $targetIndex = -1
  for ($index = 0; $index -lt $allLines.Count; $index++) {
    if ($allLines[$index] -ceq $target.Raw) {
      $targetIndex = $index
      break
    }
  }
  if ($targetIndex -lt 0) { throw "Self-test could not locate source boundary: $Label" }

  $removedLines = @($allLines)
  $removedLines[$targetIndex] = ''
  $removedText = $removedLines -join "`n"
  if (@(Get-ExecutableLines $removedText | Where-Object { $_.Code -match $pattern }).Count -ne 0) {
    throw "Negative regression stayed green after removing: $Label"
  }

  $renamedLines = @($allLines)
  $renamedNeedle = [regex]::Replace($Needle, '([A-Za-z0-9_]+)([^A-Za-z0-9_]*)$', '$1Renamed$2')
  if ($renamedNeedle -eq $Needle) { throw "Self-test could not rename source boundary: $Label" }
  $renamedLines[$targetIndex] = $target.Raw.Replace($Needle, $renamedNeedle)
  $renamedText = $renamedLines -join "`n"
  if (@(Get-ExecutableLines $renamedText | Where-Object { $_.Code -match $pattern }).Count -ne 0) {
    throw "Negative regression stayed green after renaming: $Label"
  }

  $commentedLines = @($allLines)
  $commentedLines[$targetIndex] = "// $($target.Raw)"
  $commentedText = $commentedLines -join "`n"
  if (@(Get-ExecutableLines $commentedText | Where-Object { $_.Code -match $pattern }).Count -ne 0) {
    throw "Negative regression stayed green after commenting: $Label"
  }
}

function Assert-NoSourceFact([string]$Text, [string]$Pattern, [string]$InjectionNeedle, [string]$InjectionValue, [string]$Label) {
  if ([regex]::IsMatch($Text, $Pattern)) {
    throw "Front-screen provenance source contains a hand-entered fact: $Label"
  }
  $mutated = $Text.Replace($InjectionNeedle, $InjectionValue)
  if ($mutated -eq $Text) { throw "Self-test could not inject a source fact: $Label" }
  if (-not [regex]::IsMatch($mutated, $Pattern)) {
    throw "Negative regression stayed green for source fact: $Label"
  }
}

function Assert-ExactSubstitutionFixture([string]$Label) {
  function Invoke-FixtureSubstitution([string]$Text) {
    $needle = 'data-front-version=""'
    $matches = @([regex]::Matches($Text, [regex]::Escape($needle))).Count
    if ($matches -ne 1) { throw "expected one substitution target, found $matches" }
    return $Text.Replace($needle, 'data-front-version="1.2.3"')
  }
  $fixture = '<section data-front-version=""></section>'
  [void](Invoke-FixtureSubstitution $fixture)
  $missing = $fixture.Replace('data-front-version=""', 'data-front-version="already-filled"')
  $threw = $false
  try { [void](Invoke-FixtureSubstitution $missing) } catch { $threw = $true }
  if (-not $threw) { throw "Negative regression stayed green for missing substitution: $Label" }
}

function Test-HostClockProvenance([string]$Text) {
  $lines = @(Get-ExecutableLines $Text)
  $hostClockVariables = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  $changed = $true
  while ($changed) {
    $changed = $false
    foreach ($line in $lines) {
      if ($line.Code -notmatch '^\$(\w+)\s*=\s*(.+)$') { continue }
      $name = $Matches[1]
      $rightHandSide = $Matches[2]
      $aliases = @([regex]::Matches($rightHandSide, '\$(\w+)') | ForEach-Object { $_.Groups[1].Value })
      $inheritsHostClock = $rightHandSide -match '(?:Get-Date|DateTime::Now)'
      foreach ($alias in $aliases) {
        if (@($hostClockVariables | Where-Object { $_ -ieq $alias }).Count -gt 0) {
          $inheritsHostClock = $true
          break
        }
      }
      if ($inheritsHostClock -and $hostClockVariables.Add($name)) { $changed = $true }
    }
  }
  foreach ($line in $lines) {
    if ($line.Code -match '(?:builtAt|updatedAt|generatedAt)\s*=\s*\$(\w+)\b') {
      $candidate = $Matches[1]
      if (@($hostClockVariables | Where-Object { $_ -ieq $candidate }).Count -gt 0) { return $true }
    }
    if ($line.Code -match '(?:builtAt|updatedAt|generatedAt)[^=]*=\s*[^#]*(?:Get-Date|DateTime::Now)') {
      return $true
    }
  }
  return $false
}

function Assert-NoHostClockProvenance([string]$Text, [string]$InjectionNeedle, [string]$InjectionValue, [string]$Label) {
  $hostClockPattern = '(?im)^\s*\$[^\r\n#]*(?:builtAt|updatedAt|generatedAt)[^\r\n#]*=\s*[^\r\n#]*(?:Get-Date|DateTime::Now)'
  if (Test-HostClockProvenance $Text) {
    throw "Front-screen provenance source uses a host clock: $Label"
  }
  $mutated = $Text.Replace($InjectionNeedle, $InjectionValue)
  if ($mutated -eq $Text) { throw "Self-test could not inject a host clock: $Label" }
  if (-not [regex]::IsMatch($mutated, $hostClockPattern)) {
    throw "Negative regression stayed green for host clock provenance: $Label"
  }
  $indirectLines = @(Read-Lines $Text)
  $indirectIndex = -1
  for ($index = 0; $index -lt $indirectLines.Count; $index++) {
    if ($indirectLines[$index].Trim().StartsWith($InjectionNeedle, [StringComparison]::Ordinal)) {
      $indirectIndex = $index
      break
    }
  }
  if ($indirectIndex -lt 0) { throw "Self-test could not inject an indirect host clock: $Label" }
  $indirectLines[$indirectIndex] = '$stamp = (Get-Date).ToUniversalTime().ToString(''o'')'
  $indirectLines += '$alias = $stamp'
  $indirectLines += '$provenance.builtAt = $alias'
  $indirectText = $indirectLines -join "`n"
  if (-not (Test-HostClockProvenance $indirectText)) {
    throw "Negative regression stayed green for indirect host clock provenance: $Label"
  }
}

$boundaries = @(
  [pscustomobject]@{ path = 'design/packages/contracts/src/api/version.ts'; needle = 'provenance?: AppVersionProvenance | null;'; label = 'contract provenance field' },
  [pscustomobject]@{ path = 'design/packages/contracts/src/api/version.ts'; needle = 'export function isValidAppVersion(value: unknown): value is string {'; label = 'shared semantic version validator' },
  [pscustomobject]@{ path = 'design/apps/daemon/src/app-version.ts'; needle = 'provenance: resolveBuildProvenance(version, env),'; label = 'daemon provenance resolution' },
  [pscustomobject]@{ path = 'design/apps/daemon/tests/version-route.test.ts'; needle = 'provenance: null,'; label = 'version route unavailable provenance test' },
  [pscustomobject]@{ path = 'design/apps/daemon/tests/version-route.test.ts'; needle = "it('returns verified provenance when the external record matches the package', async () => {"; label = 'version route verified provenance test' },
  [pscustomobject]@{ path = 'design/apps/daemon/src/app-version.ts'; needle = 'const ISO_TIMESTAMP_WITH_SECONDS_RE ='; label = 'daemon timestamp validation' },
  [pscustomobject]@{ path = 'design/apps/packaged/src/config.ts'; needle = 'buildUpdatedAt?: string;'; label = 'packaged provenance input' },
  [pscustomobject]@{ path = 'design/apps/packaged/src/sidecars.ts'; needle = 'OD_BUILD_UPDATED_AT'; label = 'sidecar provenance forwarding' },
  [pscustomobject]@{ path = 'design/apps/packaged/src/index.ts'; needle = 'buildUpdatedAt: activeConfig.buildUpdatedAt,'; label = 'desktop packaged provenance wiring' },
  [pscustomobject]@{ path = 'design/apps/packaged/src/headless-runtime.ts'; needle = 'buildUpdatedAt: activeConfig.buildUpdatedAt,'; label = 'headless packaged provenance wiring' },
  [pscustomobject]@{ path = 'scripts/build-installer.ps1'; needle = '$buildProvenanceUpdatedAt = $env:OD_BUILD_UPDATED_AT'; label = 'manual installer provenance input' },
  [pscustomobject]@{ path = '.github/workflows/release.yml'; needle = '$env:OD_BUILD_UPDATED_AT = "${{ steps.version.outputs.updated_at }}"'; label = 'hosted release provenance timestamp' },
  [pscustomobject]@{ path = '.github/workflows/release.yml'; needle = 'builtAt = $env:OD_BUILD_UPDATED_AT'; label = 'hosted provenance record binding' },
  [pscustomobject]@{ path = 'design/apps/web/src/App.tsx'; needle = '<FrontScreenProvenance'; label = 'desktop front-screen mount' },
  [pscustomobject]@{ path = 'design/apps/web/src/components/FrontScreenProvenance.tsx'; needle = 'data-front-screen-provenance="true"'; label = 'desktop visible provenance marker' },
  [pscustomobject]@{ path = 'design/apps/web/src/lib/front-screen-provenance.ts'; needle = 'formatFrontScreenUpdatedAt('; label = 'desktop local timestamp formatter' },
  [pscustomobject]@{ path = 'design/apps/web/src/providers/registry.ts'; needle = 'const timeout = setTimeout(() => controller.abort(), APP_VERSION_REQUEST_TIMEOUT_MS);'; label = 'version request deadline' },
  [pscustomobject]@{ path = 'design/apps/web/tests/providers/registry.test.ts'; needle = "it('aborts a hung version response and settles to unavailable', async () => {"; label = 'version request deadline test' },
  [pscustomobject]@{ path = 'design/apps/web/src/providers/registry.ts'; needle = 'const timeout = setTimeout(() => controller.abort(), DAEMON_HEALTH_REQUEST_TIMEOUT_MS);'; label = 'health request deadline' },
  [pscustomobject]@{ path = 'design/apps/web/tests/providers/registry.test.ts'; needle = "it('settles false when the health request hangs', async () => {"; label = 'health request deadline test' },
  [pscustomobject]@{ path = 'site/index.html'; needle = 'data-front-updated-at=""'; label = 'site generated provenance instant boundary' },
  [pscustomobject]@{ path = 'site/assets/js/main.js'; needle = 'wireFrontScreenProvenance();'; label = 'site front-screen wiring' },
  [pscustomobject]@{ path = '.github/workflows/pages.yml'; needle = 'release:'; label = 'Pages release-publication trigger' },
  [pscustomobject]@{ path = '.github/workflows/pages.yml'; needle = 'TARGET_COMMIT=$(git rev-parse HEAD)'; label = 'Pages exact target commit selection' },
  [pscustomobject]@{ path = '.github/workflows/pages.yml'; needle = 'map(select(.draft == false and .prerelease == false and .published_at != null))'; label = 'Pages published release filter' },
  [pscustomobject]@{ path = '.github/workflows/pages.yml'; needle = 'valid_iso_timestamp() {'; label = 'Pages canonical timestamp validation' },
  [pscustomobject]@{ path = '.github/workflows/pages.yml'; needle = 'valid_semver() {'; label = 'Pages semantic version validation' },
  [pscustomobject]@{ path = '.github/workflows/pages.yml'; needle = 'set_front_value ''data-front-provenance-value="updated-at">Unavailable'''; label = 'Pages visible timestamp injection' },
  [pscustomobject]@{ path = '.github/workflows/pages.yml'; needle = 'set_front_value ''data-front-provenance-value="status" role="status" aria-live="polite">Unavailable'''; label = 'Pages visible status injection' },
  [pscustomobject]@{ path = '.github/workflows/pages.yml'; needle = '&& [ "$front_version" = "$version" ] \'; label = 'Pages provenance version match' },
  [pscustomobject]@{ path = '.github/workflows/pages.yml'; needle = '&& [ "$front_provenance_status" = "verified" ] \'; label = 'Pages verified provenance status' },
  [pscustomobject]@{ path = '.github/workflows/pages.yml'; needle = 'set_release_href installer "$url" 2'; label = 'Pages immutable installer link replacement' },
  [pscustomobject]@{ path = '.github/workflows/pages.yml'; needle = 'local key=$1 value=$2 expected=${3:-1} marker count updated'; label = 'Pages exact release substitution count' },
  [pscustomobject]@{ path = '.codex/verification/ui-drive/inventory.json'; needle = '"id": "front-screen-provenance", "status": "partial", "statusReason": "The shell'; label = 'per-surface inventory feature' }
)

$texts = @{}
foreach ($boundary in $boundaries) {
  if ($null -eq $texts[$boundary.path]) { $texts[$boundary.path] = Read-Text $boundary.path }
  Assert-ExecutableLine $texts[$boundary.path] $boundary.needle $boundary.label
}

$site = $texts['site/index.html']
Assert-NoSourceFact $site 'data-front-version="[^"]*[0-9]' 'data-front-version=""' 'data-front-version="1.2.3"' 'site version field'
Assert-NoSourceFact $site 'data-front-updated-at="[^"]*[0-9]' 'data-front-updated-at=""' 'data-front-updated-at="2026-08-27T12:34:56Z"' 'site timestamp field'
Assert-NoSourceFact $site 'data-front-source-commit="[^"]*[0-9a-fA-F]' 'data-front-source-commit=""' 'data-front-source-commit="abcdef0123456789abcdef0123456789abcdef01"' 'site source commit field'
Assert-NoSourceFact $site 'data-release-href="installer"[^>]*href="https://[^" ]+"' 'href="#"' 'href="https://example.invalid/releases/download/v1.2.3/setup.exe"' 'site placeholder installer link'
Assert-ExactSubstitutionFixture 'Pages missing substitution'
$releaseFactMatches = @([regex]::Matches($site, 'data-release="[^"]+"[^>]*>([^<]*)'))
if ($releaseFactMatches.Count -eq 0) { throw 'No checked-in release facts were found for the unavailable-state check' }
foreach ($match in $releaseFactMatches) {
  if ($match.Groups[1].Value.Trim() -ne 'Unavailable') {
    throw "Checked-in release fact is not unavailable: $($match.Groups[1].Value.Trim())"
  }
}
$releaseFactMutationNeedle = 'data-release="tag">Unavailable'
$releaseFactMutation = $site.Replace($releaseFactMutationNeedle, 'data-release="tag">v1.2.3')
if ($releaseFactMutation -eq $site) { throw 'Self-test could not inject a checked-in release fact' }
$mutatedReleaseFacts = @([regex]::Matches($releaseFactMutation, 'data-release="[^"]+"[^>]*>([^<]*)'))
if (@($mutatedReleaseFacts | Where-Object { $_.Groups[1].Value.Trim() -eq 'Unavailable' }).Count -eq $mutatedReleaseFacts.Count) {
  throw 'Negative regression stayed green for checked-in release facts'
}
$installer = $texts['scripts/build-installer.ps1']
Assert-NoHostClockProvenance $installer '$buildProvenanceUpdatedAt = $env:OD_BUILD_UPDATED_AT' '$buildProvenanceUpdatedAt = (Get-Date).ToUniversalTime().ToString(''o'')' 'manual installer provenance'
$release = $texts['.github/workflows/release.yml']
Assert-NoHostClockProvenance $release '$updatedAt = ''' '$updatedAt = (Get-Date).ToUniversalTime().ToString(''o'')' 'hosted release provenance'

Write-Output 'PASS: front-screen provenance boundaries fail closed when each visible or provenance boundary is removed, then pass again when restored.'
