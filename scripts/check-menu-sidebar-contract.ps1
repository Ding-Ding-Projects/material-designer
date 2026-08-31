[CmdletBinding()]
param(
  [string]$Root = ''
)

$ErrorActionPreference = 'Stop'
if (-not $Root) { $Root = Split-Path -Parent $PSScriptRoot }

function Read-Source([string]$RelativePath) {
  $path = Join-Path $Root $RelativePath
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Missing source file: $RelativePath"
  }
  return Get-Content -LiteralPath $path -Raw
}

function Require-Text([string]$Source, [string]$Needle, [string]$Description) {
  if (-not $Source.Contains($Needle)) { throw "Missing contract: $Description" }
}

function Require-Regex([string]$Source, [string]$Pattern, [string]$Description) {
  if (-not [regex]::IsMatch($Source, $Pattern, [Text.RegularExpressions.RegexOptions]::Multiline)) {
    throw "Missing contract: $Description"
  }
}

$context = Read-Source 'design/apps/web/src/components/ContextMenu.tsx'
$contextCss = Read-Source 'design/apps/web/src/components/ContextMenu.module.css'
$plus = Read-Source 'design/apps/web/src/components/ComposerPlusMenu.tsx'
$plusCss = Read-Source 'design/apps/web/src/styles/home/plus-menu.css'
$composer = Read-Source 'design/apps/web/src/components/ChatComposer.tsx'
$workspace = Read-Source 'design/apps/web/src/components/FileWorkspace.tsx'
$entryCss = Read-Source 'design/apps/web/src/styles/home/entry-layout.css'

Require-Text $context "import { RegexSearchField } from './regex/RegexSearchField';" 'context menu regex field import'
Require-Text $context "import { useRegexSearch } from './regex/useRegexSearch';" 'context menu controller import'
Require-Text $context 'const visibleItems = items.filter((item) => search.matches(item.label));' 'context menu local filtering'
Require-Text $context '<RegexSearchField' 'context menu search field'
Require-Text $contextCss '.searchInput {' 'context menu search field styling'

foreach ($name in @('rootSearch', 'pluginsSearch', 'connectorsSearch', 'mcpSearch', 'workingDirSearch')) {
  Require-Text $plus "const $name = useRegexSearch" "independent ComposerPlusMenu controller: $name"
}
Require-Text $plus '<RegexSearchField' 'ComposerPlusMenu anchored builder wiring'
Require-Text $plus 'className="plus-menu__root-scroll"' 'ComposerPlusMenu inner root scroller'
Require-Text $plus 'plus-menu__flyout-portal' 'ComposerPlusMenu side-flyout promotion'
Require-Text $plusCss 'overflow: visible;' 'outer plus-menu owner does not clip flyouts'
Require-Text $plusCss '.plus-menu__root-scroll {' 'inner plus-menu vertical scroller'

Require-Text $composer 'const search = useRegexSearch(query, setQuery);' 'DesignToolboxPanel field-owned controller'
Require-Text $composer 'testId="design-toolbox-search"' 'DesignToolboxPanel searchable field'

Require-Text $workspace "import { ContextMenu, type ContextMenuItem } from './ContextMenu';" 'workspace context menu import'
Require-Text $workspace "event.key === 'F10' && event.shiftKey" 'Shift+F10 tab menu route'
Require-Text $workspace "event.key === 'ContextMenu'" 'ContextMenu key tab route'
Require-Text $workspace 'onContextMenu={(event) => showTabContextMenu(' 'Design Files pointer menu route'
Require-Text $workspace 'onContextMenuFromKeyboard={(event) => showTabContextMenuFromKeyboard(' 'ordinary tab keyboard menu route'
Require-Text $workspace 'testId="workspace-tab-context-menu"' 'workspace target-specific menu surface'

Require-Text $entryCss 'pointer-events: auto;' 'narrow visible rail remains interactive'
$mediaStart = [array]::IndexOf((Get-Content (Join-Path $Root 'design/apps/web/src/styles/home/entry-layout.css')), '  .entry--rail-open .entry-nav-rail {')
if ($mediaStart -lt 0) { throw 'Missing narrow rail selector' }
$mediaLines = Get-Content (Join-Path $Root 'design/apps/web/src/styles/home/entry-layout.css') | Select-Object -Skip $mediaStart -First 12
if (($mediaLines -join "`n") -match 'pointer-events:s*none') {
  throw 'Narrow visible rail is still made inert'
}

Write-Output 'PASS: menu, submenu, tab context, and narrow rail source contracts'
