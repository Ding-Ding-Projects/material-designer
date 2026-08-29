[CmdletBinding()]
param(
  [string]$RepoRoot = '',
  [string]$ManifestPath = '',
  [string]$BundlePath = '',
  [switch]$SelfTest,
  [switch]$RequireCentralMount
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  $RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
}

function Remove-JavaScriptComments([string]$Source) {
  $result = [System.Text.StringBuilder]::new()
  $state = 'code'
  $quote = ''
  $escaped = $false
  for ($index = 0; $index -lt $Source.Length; $index++) {
    $char = $Source[$index]
    $next = if ($index + 1 -lt $Source.Length) { $Source[$index + 1] } else { [char]0 }
    if ($state -eq 'line-comment') {
      if ($char -eq [char]13 -or $char -eq [char]10) { [void]$result.Append($char); $state = 'code' }
      continue
    }
    if ($state -eq 'block-comment') {
      if ($char -eq '*' -and $next -eq '/') { $index++; $state = 'code' }
      continue
    }
    if ($state -eq 'string') {
      [void]$result.Append($char)
      if ($escaped) { $escaped = $false; continue }
      if ($char -eq '\') { $escaped = $true; continue }
      if ($char -eq $quote) { $state = 'code' }
      continue
    }
    if ($char -eq "'" -or $char -eq '"' -or $char -eq [char]96) {
      $quote = $char
      $state = 'string'
      [void]$result.Append($char)
      continue
    }
    if ($char -eq '/' -and $next -eq '/') { $index++; $state = 'line-comment'; continue }
    if ($char -eq '/' -and $next -eq '*') { $index++; $state = 'block-comment'; continue }
    [void]$result.Append($char)
  }
  return $result.ToString()
}

function Read-Utf8Text([string]$Path) {
  return [IO.File]::ReadAllText($Path, [Text.UTF8Encoding]::new($false))
}

$documentationLocaleNames = @('ar', 'de', 'en', 'es-ES', 'fa', 'fr', 'hu', 'id', 'it', 'ja', 'ko', 'pl', 'pt-BR', 'ru', 'th', 'tr', 'uk', 'zh-CN', 'zh-HK', 'zh-TW')
$documentationCopyProperties = [ordered]@{
  navDocumentation = 'documentation.nav'
  loading = 'documentation.loading'
  offlineDescription = 'documentation.offlineDescription'
  articleCount = 'documentation.articleCount'
  articlesTab = 'documentation.articlesTab'
  historyTab = 'documentation.historyTab'
  articleSearch = 'documentation.articleSearch'
  historySearch = 'documentation.historySearch'
  invalidRegex = 'documentation.invalidRegex'
  empty = 'documentation.empty'
  source = 'documentation.source'
  suggested = 'documentation.suggested'
}
$expectedEnglishDocumentation = [ordered]@{
  'documentation.nav' = 'Documentation'
  'documentation.loading' = ('Loading documentation' + [char]0x2026)
  'documentation.offlineDescription' = 'Read the complete bundled documentation without a network connection.'
  'documentation.articleCount' = '{count} articles'
  'documentation.articlesTab' = 'Articles'
  'documentation.historyTab' = 'Recently read'
  'documentation.articleSearch' = 'Search articles'
  'documentation.historySearch' = 'Search reading history'
  'documentation.invalidRegex' = 'Invalid or risky pattern.'
  'documentation.empty' = 'No bundled article matches this search.'
  'documentation.source' = 'Open source article'
  'documentation.suggested' = 'Suggested articles'
}
$documentationEnglishEqualityExceptions = @{
  'fr|documentation.nav' = $true
  'fr|documentation.articleCount' = $true
  'fr|documentation.articlesTab' = $true
}

function Read-BundleManifest([string]$Text) {
  $live = Remove-JavaScriptComments $Text
  $start = $live.IndexOf('export const DOCS_MANIFEST: BundledDocumentationManifest =', [System.StringComparison]::Ordinal)
  if ($start -lt 0) { throw 'App documentation bundle has no live manifest export.' }
  $jsonStart = $live.IndexOf('{', $start)
  $jsonEnd = $live.LastIndexOf(' as const;', [System.StringComparison]::Ordinal)
  if ($jsonStart -lt 0 -or $jsonEnd -le $jsonStart) { throw 'App documentation bundle has no parseable manifest object.' }
  try { return $live.Substring($jsonStart, $jsonEnd - $jsonStart) | ConvertFrom-Json } catch { throw 'App documentation bundle manifest is not valid JSON.' }
}

function Get-TextHash([string]$Value) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    return [BitConverter]::ToString($sha.ComputeHash([Text.UTF8Encoding]::new($false).GetBytes($Value))).Replace('-', '').ToLowerInvariant()
  } finally {
    $sha.Dispose()
  }
}

function Assert-BundleObject([object]$Bundle, [object]$Source) {
  if ($Bundle.schemaVersion -ne $Source.schemaVersion -or $Bundle.generation -cne $Source.generation -or $Bundle.source -cne $Source.source -or $Bundle.articleCount -ne $Source.articleCount) {
    throw 'App documentation bundle top-level object differs from the source manifest.'
  }
  if (@($Bundle.articles).Count -ne $Source.articleCount) { throw 'App documentation bundle article count differs from the source manifest.' }
  $sourcePaths = @($Source.articles | ForEach-Object path)
  $bundlePaths = @($Bundle.articles | ForEach-Object path)
  $pathDiff = Compare-Object ($sourcePaths | Sort-Object) ($bundlePaths | Sort-Object)
  if ($pathDiff) { throw 'App documentation bundle article paths differ from the source manifest.' }
  $ids = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
  foreach ($article in $Bundle.articles) {
    if (-not $ids.Add([string]$article.id)) { throw "App documentation bundle repeats article id: $($article.id)." }
  }
  $sourcePathSet = [System.Collections.Generic.HashSet[string]]::new([string[]]$sourcePaths, [System.StringComparer]::Ordinal)
  for ($index = 0; $index -lt $Source.articleCount; $index++) {
    $expected = $Source.articles[$index]
    $actual = $Bundle.articles[$index]
    foreach ($field in @('id', 'path', 'category', 'title', 'kind', 'sourceUrl', 'sha256')) {
      if ([string]$actual.$field -cne [string]$expected.$field) { throw "App documentation bundle changed $field at article index $index." }
    }
    foreach ($suggested in @($actual.suggestedArticles)) {
      if (-not $sourcePathSet.Contains([string]$suggested)) { throw ('App documentation bundle contains an unknown suggestion at article index ' + $index + ': ' + $suggested) }
    }
    if ((@($actual.suggestedArticles) -join [char]0) -cne (@($expected.suggestedArticles) -join [char]0)) { throw "App documentation bundle changed suggestions at article index $index." }
    if ((@($actual.fragments) -join [char]0) -cne (@($expected.fragments) -join [char]0)) { throw "App documentation bundle changed fragments at article index $index." }
    if ((@($actual.images | ForEach-Object { [string]$_.source + '|' + [string]$_.path + '|' + [string]$_.sha256 }) -join [char]0) -cne (@($expected.images | ForEach-Object { [string]$_.source + '|' + [string]$_.path + '|' + [string]$_.sha256 }) -join [char]0)) { throw "App documentation bundle changed images at article index $index." }
    $actualMarkdown = ([string]$actual.markdown).Replace(([char]13).ToString(), '')
    $expectedMarkdown = ([string]$expected.markdown).Replace(([char]13).ToString(), '')
    if ((Get-TextHash $actualMarkdown) -cne (Get-TextHash $expectedMarkdown)) {
      throw "App documentation bundle changed Markdown at article index $index."
    }
  }
}

function Assert-AppSource([string]$Component, [string]$Opener, [string]$Test) {
  $componentLive = Remove-JavaScriptComments $Component
  $openerLive = Remove-JavaScriptComments $Opener
  $testLive = Remove-JavaScriptComments $Test
  $requiredComponent = @(
    'data-testid="documentation-browser"',
    'assertBundledDocumentationManifest()',
    'DocumentationCopy',
    'relativeImageMap',
    'indexedImagesOnly',
    'resolveInternalLink',
    'article.fragments',
    'DOCUMENTATION_OPEN_EVENT',
    'takePendingDocumentation',
    'focusRequest',
    'documentation-article-search',
    'documentation-reader-title'
  )
  foreach ($needle in $requiredComponent) {
    $pattern = '(?<![A-Za-z0-9_-])' + [regex]::Escape($needle) + '(?![A-Za-z0-9_-])'
    if (-not [regex]::IsMatch($componentLive, $pattern)) { throw "Documentation component is missing live contract: $needle" }
  }
  foreach ($needle in @('DOCUMENTATION_OPEN_EVENT', 'OpenDocumentationDetail', 'activation', 'focus', 'takePendingDocumentation')) {
    $boundary = '(?<![A-Za-z0-9_-])' + [regex]::Escape($needle) + '(?![A-Za-z0-9_-])'
    if (-not [regex]::IsMatch($openerLive, $boundary)) { throw "Documentation opener is missing live contract: $needle" }
  }
  foreach ($needle in @('documentation-browser', 'openDocumentation', 'focus')) {
    if ($testLive.IndexOf($needle, [System.StringComparison]::Ordinal) -lt 0) { throw "Focused documentation test is missing exact interaction: $needle" }
  }
}

function Assert-LivePattern([string]$Source, [string]$Pattern, [string]$Message) {
  if (-not [regex]::IsMatch($Source, $Pattern, [Text.RegularExpressions.RegexOptions]::Multiline)) {
    throw $Message
  }
}

function Copy-CentralText([hashtable]$Text) {
  $copy = @{}
  foreach ($key in $Text.Keys) {
    if ($key -eq 'locales') {
      $localeCopy = @{}
      foreach ($locale in $Text.locales.Keys) { $localeCopy[$locale] = $Text.locales[$locale] }
      $copy.locales = $localeCopy
    } else {
      $copy[$key] = $Text[$key]
    }
  }
  return $copy
}

function Get-DocumentationLocaleValues([string]$Source, [string]$Locale) {
  $live = Remove-JavaScriptComments $Source
  $values = [ordered]@{}
  foreach ($key in $expectedEnglishDocumentation.Keys) {
    $pattern = "^\s*'" + [regex]::Escape($key) + "'\s*:\s*'(?<value>[^']*)',\s*$"
    $matches = [regex]::Matches($live, $pattern, [Text.RegularExpressions.RegexOptions]::Multiline)
    if ($matches.Count -ne 1) { throw "Locale $Locale must define $key exactly once as a direct string value." }
    $values[$key] = $matches[0].Groups['value'].Value
  }
  return $values
}

function Get-DocumentationPlaceholders([string]$Value) {
  return @([regex]::Matches($Value, '\{[A-Za-z][A-Za-z0-9]*\}') | ForEach-Object Value | Sort-Object -Unique)
}

function Assert-DocumentationLocaleValues([hashtable]$LocaleValues) {
  if ($LocaleValues.Count -ne $documentationLocaleNames.Count) {
    throw "Documentation locale map has $($LocaleValues.Count) entries; expected exactly $($documentationLocaleNames.Count)."
  }
  foreach ($locale in $documentationLocaleNames) {
    if (-not $LocaleValues.ContainsKey($locale)) { throw "Documentation locale map is missing $locale." }
  }
  foreach ($key in $expectedEnglishDocumentation.Keys) {
    if ([string]$LocaleValues.en[$key] -cne [string]$expectedEnglishDocumentation[$key]) {
      throw "English documentation value changed unexpectedly: $key."
    }
  }
  foreach ($locale in $documentationLocaleNames) {
    if ($locale -eq 'en') { continue }
    foreach ($key in $expectedEnglishDocumentation.Keys) {
      $value = [string]$LocaleValues[$locale][$key]
      if ([string]::IsNullOrWhiteSpace($value)) { throw "Locale $locale has an empty documentation value: $key." }
      $expectedPlaceholders = @(Get-DocumentationPlaceholders ([string]$expectedEnglishDocumentation[$key]))
      $actualPlaceholders = @(Get-DocumentationPlaceholders $value)
      if (($expectedPlaceholders -join [char]0) -cne ($actualPlaceholders -join [char]0)) {
        throw "Locale $locale changed the technical placeholders for $key."
      }
      $exceptionId = "$locale|$key"
      if ($value -ceq [string]$expectedEnglishDocumentation[$key]) {
        if (-not $documentationEnglishEqualityExceptions.ContainsKey($exceptionId)) {
          throw "Locale $locale restored $key to the English value without an intended-equality exception."
        }
      } elseif ($documentationEnglishEqualityExceptions.ContainsKey($exceptionId)) {
        throw "Documentation equality exception is stale: $exceptionId."
      }
    }
  }
}

function Invoke-DocumentationLocaleEnglishRestorationSelfTest([hashtable]$Text) {
  $localeValues = @{}
  foreach ($locale in $documentationLocaleNames) { $localeValues[$locale] = Get-DocumentationLocaleValues $Text.locales[$locale] $locale }
  Assert-DocumentationLocaleValues $localeValues
  $redCount = 0
  foreach ($locale in $documentationLocaleNames) {
    if ($locale -eq 'en') { continue }
    foreach ($key in $expectedEnglishDocumentation.Keys) {
      $exceptionId = "$locale|$key"
      if ($documentationEnglishEqualityExceptions.ContainsKey($exceptionId)) { continue }
      $prior = $localeValues[$locale][$key]
      $localeValues[$locale][$key] = $expectedEnglishDocumentation[$key]
      $red = $false
      try {
        Assert-DocumentationLocaleValues $localeValues
      } catch {
        $red = $_.Exception.Message -ceq "Locale $locale restored $key to the English value without an intended-equality exception."
        if (-not $red) { throw }
      } finally {
        $localeValues[$locale][$key] = $prior
      }
      if (-not $red) { throw "English-restoration negative regression stayed green for $exceptionId." }
      $redCount++
    }
  }
  if ($redCount -ne 225) { throw "English-restoration mutation count was $redCount; expected exactly 225." }
  Assert-DocumentationLocaleValues $localeValues
  Write-Output 'PASS: all 225 non-English documentation labels without exact equality exceptions turned red when restored to English, then returned green.'
}

function Assert-CentralMounts([hashtable]$Text) {
  $app = Remove-JavaScriptComments $Text.app
  $shell = Remove-JavaScriptComments $Text.shell
  $nav = Remove-JavaScriptComments $Text.nav
  $tabs = Remove-JavaScriptComments $Text.tabs
  $palette = Remove-JavaScriptComments $Text.palette
  $router = Remove-JavaScriptComments $Text.router
  $types = Remove-JavaScriptComments $Text.types
  $localeValues = @{}
  foreach ($locale in $documentationLocaleNames) { $localeValues[$locale] = Get-DocumentationLocaleValues $Text.locales[$locale] $locale }

  Assert-LivePattern $shell "^\s*import\s+\{\s*DocumentationBrowserView\s*\}\s+from\s+'\./documentation/DocumentationBrowserView';" 'Entry shell does not import the documentation reader.'
  Assert-LivePattern $shell 'data-testid="entry-view-documentation"' 'Entry shell does not own the documentation view mount.'
  Assert-LivePattern $shell "view\s*===\s*'documentation'" 'Entry shell does not activate the documentation view.'
  Assert-LivePattern $shell '<DocumentationBrowserView(?:\s|>)' 'Entry shell does not render the documentation reader.'

  Assert-LivePattern $nav "const\s+documentationLabel\s*=\s*t\(\s*'documentation\.nav'\s*\)" 'Navigation does not resolve the localized documentation label.'
  Assert-LivePattern $nav 'testId="entry-nav-documentation"' 'Navigation does not expose the documentation destination.'
  Assert-LivePattern $nav "onClick=\{\(\)\s*=>\s*selectView\(\s*'documentation'\s*\)\}" 'Navigation does not activate the documentation destination.'

  Assert-LivePattern $tabs "view\s*===\s*'documentation'" 'Workspace tab restoration does not accept the documentation destination.'
  Assert-LivePattern $tabs "documentation:\s*t\(\s*'documentation\.nav'\s*\)" 'Workspace tabs do not render the localized documentation title.'
  Assert-LivePattern $tabs "documentation:\s*'file-text'" 'Workspace tabs do not render the documentation icon.'

  Assert-LivePattern $palette "id:\s*'go\.documentation'" 'Command palette does not register the documentation destination.'
  Assert-LivePattern $palette "route:\s*\{\s*kind:\s*'home',\s*view:\s*'documentation'\s*\}" 'Command palette does not route to the documentation destination.'

  Assert-LivePattern $router "^\s*\|\s*'documentation'" 'Router type does not include the documentation destination.'
  Assert-LivePattern $router "parts\[0\]\s*===\s*'documentation'" 'Router does not parse the documentation path.'
  Assert-LivePattern $router "return\s+\{\s*kind:\s*'home',\s*view:\s*'documentation'\s*\}" 'Router does not build the documentation route object.'
  Assert-LivePattern $router "route\.view\s*===\s*'documentation'\)\s*return\s*'/documentation'" 'Router does not build the documentation path.'

  Assert-LivePattern $app "^\s*import\s+\{\s*DOCUMENTATION_OPEN_EVENT\s*\}\s+from\s+'\./components/documentation/open-documentation';" 'Application shell does not import the documentation activation event.'
  Assert-LivePattern $app "const\s+activateDocumentation\s*=\s*\(\)\s*=>\s*navigate\(\{\s*kind:\s*'home',\s*view:\s*'documentation'\s*\}\)" 'Application shell does not route documentation activation requests.'
  Assert-LivePattern $app 'window\.addEventListener\(\s*DOCUMENTATION_OPEN_EVENT\s*,\s*activateDocumentation\s*\)' 'Application shell does not subscribe to documentation activation requests.'
  Assert-LivePattern $app 'window\.removeEventListener\(\s*DOCUMENTATION_OPEN_EVENT\s*,\s*activateDocumentation\s*\)' 'Application shell does not remove the documentation activation listener.'

  foreach ($property in $documentationCopyProperties.Keys) {
    $key = $documentationCopyProperties[$property]
    $escapedKey = [regex]::Escape($key)
    Assert-LivePattern $types ("^\s*'" + $escapedKey + "'\s*:\s*string;") "Typed locale catalog is missing $key."
    if ($property -eq 'articleCount') {
      Assert-LivePattern $shell ("articleCount:\s*\(count\)\s*=>\s*t\(\s*'" + $escapedKey + "'\s*,\s*\{\s*count\s*\}\s*\)") "Entry shell does not mount localized copy for $key."
    } else {
      Assert-LivePattern $shell ([regex]::Escape($property) + ":\s*t\(\s*'" + $escapedKey + "'\s*\)") "Entry shell does not mount localized copy for $key."
    }
  }
  Assert-DocumentationLocaleValues $localeValues
}

$manifestPath = if ([string]::IsNullOrWhiteSpace($ManifestPath)) { Join-Path $RepoRoot 'site/assets/data/docs-manifest.json' } else { $ManifestPath }
$bundlePath = if ([string]::IsNullOrWhiteSpace($BundlePath)) { Join-Path $RepoRoot 'design/apps/web/src/lib/docs/generated.ts' } else { $BundlePath }
$componentPath = Join-Path $RepoRoot 'design/apps/web/src/components/documentation/DocumentationBrowserView.tsx'
$openerPath = Join-Path $RepoRoot 'design/apps/web/src/components/documentation/open-documentation.ts'
$testPath = Join-Path $RepoRoot 'design/apps/web/tests/components/DocumentationBrowserView.test.tsx'
foreach ($path in @($manifestPath, $bundlePath, $componentPath, $openerPath, $testPath)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required documentation source is missing: $path" }
}
$manifest = Read-Utf8Text $manifestPath | ConvertFrom-Json
$bundleText = Read-Utf8Text $bundlePath
Assert-BundleObject (Read-BundleManifest $bundleText) $manifest
Assert-AppSource (Read-Utf8Text $componentPath) (Read-Utf8Text $openerPath) (Read-Utf8Text $testPath)
Write-Output "PASS: app bundle exactly contains all $($manifest.articleCount) source articles, hashes, suggestions, fragments, and images."

$centralPaths = [ordered]@{
  app = Join-Path $RepoRoot 'design/apps/web/src/App.tsx'
  shell = Join-Path $RepoRoot 'design/apps/web/src/components/EntryShell.tsx'
  nav = Join-Path $RepoRoot 'design/apps/web/src/components/EntryNavRail.tsx'
  tabs = Join-Path $RepoRoot 'design/apps/web/src/components/WorkspaceTabsBar.tsx'
  palette = Join-Path $RepoRoot 'design/apps/web/src/components/command-palette/commands.ts'
  router = Join-Path $RepoRoot 'design/apps/web/src/router.ts'
  types = Join-Path $RepoRoot 'design/apps/web/src/i18n/types.ts'
}
$localePaths = @{}
foreach ($locale in $documentationLocaleNames) { $localePaths[$locale] = Join-Path $RepoRoot ("design/apps/web/src/i18n/locales/$locale.ts") }
$discoveredLocaleNames = @(Get-ChildItem -LiteralPath (Join-Path $RepoRoot 'design/apps/web/src/i18n/locales') -File -Filter '*.ts' | Sort-Object BaseName | ForEach-Object BaseName)
if (Compare-Object @($documentationLocaleNames | Sort-Object) $discoveredLocaleNames) {
  throw 'The hand-written 20-locale documentation inventory differs from the locale directory.'
}
$allCentralPaths = @($centralPaths.Values) + @($localePaths.Values)
$centralAvailable = @($allCentralPaths | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf })
$central = $null
$centralMountLive = $false
if ($centralAvailable.Count -eq $allCentralPaths.Count) {
  $central = @{
    app = Read-Utf8Text $centralPaths.app
    shell = Read-Utf8Text $centralPaths.shell
    nav = Read-Utf8Text $centralPaths.nav
    tabs = Read-Utf8Text $centralPaths.tabs
    palette = Read-Utf8Text $centralPaths.palette
    router = Read-Utf8Text $centralPaths.router
    types = Read-Utf8Text $centralPaths.types
    locales = @{}
  }
  foreach ($locale in $documentationLocaleNames) { $central.locales[$locale] = Read-Utf8Text $localePaths[$locale] }
  try {
    Assert-CentralMounts $central
    $centralMountLive = $true
    Write-Output 'PASS: C0/C12 application mount, navigation, tabs, palette, router, activation, and localized copy are live.'
  } catch {
    if ($RequireCentralMount) { throw ('Central C0/C12 application documentation registration is not live: ' + $_.Exception.Message) }
    Write-Output ('PENDING: source is ready; central C0/C12 application registration remains incomplete: ' + $_.Exception.Message)
  }
} elseif ($RequireCentralMount) {
  throw 'Central C0/C12 application registration sources are unavailable.'
} else {
  Write-Output 'PENDING: source is ready; central C0/C12 application registration sources remain outside this lane.'
}

if ($SelfTest) {
  $mutations = [ordered]@{
    staleHash = { $copy = Read-BundleManifest $bundleText; $copy.articles[0].sha256 = ('0' * 64); Assert-BundleObject $copy $manifest }
    missingArticle = { $copy = Read-BundleManifest $bundleText; $copy.articles[0].path = $copy.articles[1].path; Assert-BundleObject $copy $manifest }
    duplicateArticle = { $copy = Read-BundleManifest $bundleText; $copy.articles[1].id = $copy.articles[0].id; Assert-BundleObject $copy $manifest }
    missingSuggestion = { $copy = Read-BundleManifest $bundleText; $copy.articles[0].suggestedArticles = @('missing.md'); Assert-BundleObject $copy $manifest }
    missingFocus = { $component = (Read-Utf8Text $componentPath).Replace('documentation-reader-title', 'documentation-reader-title-missing'); Assert-AppSource $component (Read-Utf8Text $openerPath) (Read-Utf8Text $testPath) }
    missingOpenerActivation = { $opener = (Read-Utf8Text $openerPath).Replace('activation', 'activation-missing'); Assert-AppSource (Read-Utf8Text $componentPath) $opener (Read-Utf8Text $testPath) }
  }
  if ($centralMountLive) {
    Invoke-DocumentationLocaleEnglishRestorationSelfTest $central
    $mutations.missingCentralShell = { $copy = Copy-CentralText $central; $copy.shell = $copy.shell.Replace('entry-view-documentation', 'entry-view-documentation-missing'); Assert-CentralMounts $copy }
    $mutations.missingCentralNavigation = { $copy = Copy-CentralText $central; $copy.nav = $copy.nav.Replace('entry-nav-documentation', 'entry-nav-documentation-missing'); Assert-CentralMounts $copy }
    $mutations.missingCentralTab = { $copy = Copy-CentralText $central; $copy.tabs = $copy.tabs.Replace("documentation: t('documentation.nav')", "documentationMissing: t('documentation.nav')"); Assert-CentralMounts $copy }
    $mutations.missingCentralPalette = { $copy = Copy-CentralText $central; $copy.palette = $copy.palette.Replace("id: 'go.documentation'", "id: 'go.documentation-missing'"); Assert-CentralMounts $copy }
    $mutations.missingCentralRouter = { $copy = Copy-CentralText $central; $copy.router = $copy.router.Replace("route.view === 'documentation'", "route.view === 'documentation-missing'"); Assert-CentralMounts $copy }
    $mutations.missingCentralActivation = { $copy = Copy-CentralText $central; $copy.app = $copy.app.Replace('window.addEventListener(DOCUMENTATION_OPEN_EVENT, activateDocumentation)', 'window.addEventListener(DOCUMENTATION_OPEN_EVENT_MISSING, activateDocumentation)'); Assert-CentralMounts $copy }
    $mutations.missingCentralLocalizedMount = { $copy = Copy-CentralText $central; $copy.shell = $copy.shell.Replace("navDocumentation: t('documentation.nav')", "navDocumentationMissing: t('documentation.nav')"); Assert-CentralMounts $copy }
    $mutations.missingCentralTypedCopy = { $copy = Copy-CentralText $central; $copy.types = $copy.types.Replace("'documentation.nav': string;", "'documentation.nav-missing': string;"); Assert-CentralMounts $copy }
    $mutations.missingCentralLocaleCopy = { $copy = Copy-CentralText $central; $copy.locales.en = $copy.locales.en.Replace("'documentation.nav':", "'documentation.nav-missing':"); Assert-CentralMounts $copy }
  }
  foreach ($entry in $mutations.GetEnumerator()) {
    $red = $false
    try { & $entry.Value } catch { $red = $true; Write-Output "PASS: $($entry.Key) red proof: $($_.Exception.Message)" }
    if (-not $red) { throw "Negative regression stayed green for $($entry.Key)." }
  }
  Assert-BundleObject (Read-BundleManifest $bundleText) $manifest
  Assert-AppSource (Read-Utf8Text $componentPath) (Read-Utf8Text $openerPath) (Read-Utf8Text $testPath)
  if ($centralMountLive) { Assert-CentralMounts $central }
  Write-Output 'PASS: app documentation bundle, source seam, and available central-mount negative regressions restored green.'
}
