[CmdletBinding()]
param(
  [string]$ReleaseWorkflow = '.github/workflows/release.yml',
  [string]$PagesWorkflow = '.github/workflows/pages.yml',
  [string]$CodenameScript = 'scripts/release-codename.sh',
  [string]$SiteIndex = 'site/index.html'
)

$ErrorActionPreference = 'Stop'

function Read-Required([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "release-integrity input is missing: $Path"
  }
  return [IO.File]::ReadAllText((Resolve-Path -LiteralPath $Path).Path)
}

function Require-Literal([string]$Text, [string]$Needle, [string]$Label) {
  if ($Text.IndexOf($Needle, [StringComparison]::Ordinal) -lt 0) {
    throw "$Label is missing exact contract text: $Needle"
  }
}

function Forbid-Literal([string]$Text, [string]$Needle, [string]$Label) {
  if ($Text.IndexOf($Needle, [StringComparison]::Ordinal) -ge 0) {
    throw "$Label contains forbidden contract text: $Needle"
  }
}

$release = Read-Required $ReleaseWorkflow
$pages = Read-Required $PagesWorkflow
$codename = Read-Required $CodenameScript
$site = Read-Required $SiteIndex

@(
  'grep -Fqx "$id" "$tmp/used.txt"'
  'startswith("catalog-v1")'
  '.isDraft == false'
  '.isPrerelease == false'
  "printf 'image=%s"
  "printf 'image_dish=%s"
  "printf 'image_bytes=%s"
  "printf 'image_content_type=%s"
  'source=unavailable'
) | ForEach-Object { Require-Literal $codename $_ 'release-codename.sh' }
Forbid-Literal $codename 'bundled_index' 'release-codename.sh'
Forbid-Literal $codename 'assets/dim-sum/images' 'release-codename.sh'

@(
  'cat "$raw" >> "$GITHUB_OUTPUT"'
  'id: dim_sum_contract'
  'Verify and stage required public catalog image'
  'CATALOG_IMAGE: ${{ steps.codename.outputs.image }}'
  'CATALOG_IMAGE_DISH: ${{ steps.codename.outputs.image_dish }}'
  'curl -fsSL --max-time 60 "$CATALOG_IMAGE_URL" -o "$photo_path"'
  'png_magic=$(od -An -tx1 -N8'
  'sha256sum "$photo_path"'
  'FromStream($stream, $true, $true)'
  "steps.codename.outcome == 'success'"
  "steps.dim_sum_contract.outcome == 'success'"
  'grep -Fqx "$TAG"'
  's/^\*\*Code name: (.*)\*\*$/\1/p'
  '<!-- dim-sum-id: ${CODE_NAME_ID} -->'
  '<!-- dim-sum-image-asset: ${CATALOG_IMAGE_ASSET} -->'
  '<!-- dim-sum-image-sha256: ${CATALOG_IMAGE_SHA256} -->'
  'Workflow duration:'
  'node scripts/line-count.mjs'
  'test -s "$out"'
  "Status -ne 'NotSigned'"
  'image_dish does not match'
) | ForEach-Object { Require-Literal $release $_ 'release.yml' }
Forbid-Literal $release 'temporary dim-sum photo exception' 'release.yml'
Forbid-Literal $release 'status=temporarily-skipped' 'release.yml'
Forbid-Literal $release 'temporarily skipped by the repository owner' 'release.yml'

@(
  'Wait for the current successful release'
  'gh run list --repo "$GITHUB_REPOSITORY" --workflow release.yml --commit "$expected_sha"'
  'gh run view "$RELEASE_RUN_ID"'
  'expected exactly one published release'
  'isDraft'
  'isPrerelease'
  'release-commit:'
  'dim-sum-image-asset:'
  'dim-sum-image-sha256:'
  'Workflow duration:'
  'Lines of code'
  'set_field image'
  'set_field image-sha'
  'current release does not have exactly one downloadable installer'
) | ForEach-Object { Require-Literal $pages $_ 'pages.yml' }
Forbid-Literal $pages 'keeping the checked-in page facts' 'pages.yml'
Forbid-Literal $pages 'the newest published release has no Windows installer' 'pages.yml'

@(
  'data-release="image"'
  'data-release="image-sha"'
  'data-release-href="image"'
) | ForEach-Object { Require-Literal $site $_ 'site/index.html' }

Write-Output 'PASS: release integrity contract contains exact unused-id, published-image, output, duplicate-release, timing, line-count, unsigned-asset, and Pages freshness boundaries.'
