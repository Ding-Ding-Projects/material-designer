[CmdletBinding()]
param(
  [string]$RepoRoot = '',
  [string]$ManifestPath = '',
  [string]$OutputPath = ''
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($RepoRoot)) { $RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')) }
if ([string]::IsNullOrWhiteSpace($ManifestPath)) { $ManifestPath = Join-Path $RepoRoot 'site/assets/data/docs-manifest.json' }
if ([string]::IsNullOrWhiteSpace($OutputPath)) { $OutputPath = Join-Path $RepoRoot 'design/apps/web/src/lib/docs/generated.ts' }
if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) { throw "Source documentation manifest is missing: $ManifestPath" }
$canonicalOutput = [System.IO.Path]::GetFullPath((Join-Path $RepoRoot 'design/apps/web/src/lib/docs/generated.ts'))
if ([System.IO.Path]::GetFullPath($OutputPath) -eq $canonicalOutput) {
  throw 'Direct tracked-output mutation is refused; use scripts/verify-offline-docs.ps1 -Update.'
}

$manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json
if ($manifest.schemaVersion -ne 1 -or [string]$manifest.generation -notmatch '^[0-9a-f]{64}$' -or $manifest.articleCount -ne @($manifest.articles).Count) {
  throw 'The source documentation manifest has an unsupported or incomplete schema.'
}

$jsonLines = @($manifest | ConvertTo-Json -Depth 12)
$json = [string]::Join([Environment]::NewLine, $jsonLines)
$header = @'
/* GENERATED FILE. Do not edit by hand.
 * Source: site/assets/data/docs-manifest.json, produced from documentation Markdown files.
 * The application consumes this exact bundle offline at build time.
 */
export interface BundledDocumentationArticle {
  readonly id: string;
  readonly path: string;
  readonly category: string;
  readonly title: string;
  readonly kind: 'index' | 'article';
  readonly sourceUrl: string;
  readonly sha256: string;
  readonly suggestedArticles: readonly string[];
  readonly fragments: readonly string[];
  readonly images: readonly BundledDocumentationImage[];
  readonly markdown: string;
}

export interface BundledDocumentationImage {
  readonly source: string;
  readonly path: string;
  readonly sha256: string;
}

export interface BundledDocumentationManifest {
  readonly schemaVersion: 1;
  readonly generation: string;
  readonly source: 'docs/**/*.md';
  readonly articleCount: number;
  readonly articles: readonly BundledDocumentationArticle[];
}

export const DOCS_MANIFEST: BundledDocumentationManifest =
'@
$output = $header + $json + " as const;`n"
$parent = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $parent -PathType Container)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
$temporary = Join-Path $parent ('.' + [System.IO.Path]::GetFileName($OutputPath) + '.tmp-' + [Guid]::NewGuid().ToString('N'))
try {
  [System.IO.File]::WriteAllText($temporary, $output, [System.Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $temporary -Destination $OutputPath -Force
} finally {
  if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
}

$check = [System.IO.File]::ReadAllText($OutputPath, [System.Text.UTF8Encoding]::new($false))
$jsonStart = $check.IndexOf('{', $check.IndexOf('export const DOCS_MANIFEST', [System.StringComparison]::Ordinal))
$jsonEnd = $check.LastIndexOf(' as const;', [System.StringComparison]::Ordinal)
if ($jsonStart -lt 0 -or $jsonEnd -le $jsonStart) { throw 'Generated app documentation bundle is incomplete.' }
$parsed = $check.Substring($jsonStart, $jsonEnd - $jsonStart) | ConvertFrom-Json
if ($parsed.schemaVersion -ne $manifest.schemaVersion -or $parsed.generation -cne $manifest.generation -or $parsed.source -cne $manifest.source -or $parsed.articleCount -ne $manifest.articleCount -or @($parsed.articles).Count -ne $manifest.articleCount) {
  throw 'Generated app documentation bundle changed its exact top-level object.'
}
for ($index = 0; $index -lt $manifest.articleCount; $index++) {
  $expected = $manifest.articles[$index]
  $actual = $parsed.articles[$index]
  foreach ($field in @('id', 'path', 'category', 'title', 'kind', 'sourceUrl', 'sha256')) {
    if ([string]$actual.$field -cne [string]$expected.$field) { throw "Generated app documentation bundle changed $field at article index $index." }
  }
  if ((@($actual.suggestedArticles) -join [char]0) -cne (@($expected.suggestedArticles) -join [char]0)) { throw "Generated app documentation bundle changed suggestions at article index $index." }
  if ((@($actual.fragments) -join [char]0) -cne (@($expected.fragments) -join [char]0)) { throw "Generated app documentation bundle changed fragments at article index $index." }
  if ((@($actual.images | ForEach-Object { [string]$_.source + '|' + [string]$_.path + '|' + [string]$_.sha256 }) -join [char]0) -cne (@($expected.images | ForEach-Object { [string]$_.source + '|' + [string]$_.path + '|' + [string]$_.sha256 }) -join [char]0)) { throw "Generated app documentation bundle changed images at article index $index." }
}
Write-Output "PASS: generated exact app documentation bundle with $($manifest.articleCount) articles"
