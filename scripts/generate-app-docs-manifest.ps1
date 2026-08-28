[CmdletBinding()]
param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$ManifestPath = '',
  [string]$OutputPath = ''
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($ManifestPath)) { $ManifestPath = Join-Path $RepoRoot 'site/assets/data/docs-manifest.json' }
if ([string]::IsNullOrWhiteSpace($OutputPath)) { $OutputPath = Join-Path $RepoRoot 'design/apps/web/src/lib/docs/generated.ts' }
if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) { throw "Source documentation manifest is missing: $ManifestPath" }

$manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json
if ($manifest.schemaVersion -ne 1 -or $manifest.articleCount -ne @($manifest.articles).Count) {
  throw 'The source documentation manifest has an unsupported or incomplete schema.'
}

$json = $manifest | ConvertTo-Json -Depth 12
$header = @'
/* GENERATED FILE. Do not edit by hand.
 * Source: site/assets/data/docs-manifest.json, produced from docs/**/*.md.
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
  readonly markdown: string;
}

export interface BundledDocumentationManifest {
  readonly schemaVersion: 1;
  readonly source: 'docs/**/*.md';
  readonly articleCount: number;
  readonly articles: readonly BundledDocumentationArticle[];
}

export const DOCS_MANIFEST: BundledDocumentationManifest =
'@
$output = $header + $json + " as const;`n"
$parent = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $parent -PathType Container)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
[System.IO.File]::WriteAllText($OutputPath, $output, [System.Text.UTF8Encoding]::new($false))

$check = Get-Content -Raw -LiteralPath $OutputPath
if ($check -notmatch 'export const DOCS_MANIFEST' -or $check -notmatch 'articleCount') { throw 'Generated app documentation bundle is incomplete.' }
Write-Output "PASS: generated exact app documentation bundle with $($manifest.articleCount) articles"
