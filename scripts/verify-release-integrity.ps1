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

function Require-ExecutableLine([string]$Text, [string]$Prefix, [string]$Label) {
  $found = ($Text -split "`r`n|`n|`r") | Where-Object {
    $_.TrimStart().StartsWith($Prefix, [StringComparison]::Ordinal)
  } | Select-Object -First 1
  if ($null -eq $found) {
    throw "$Label is missing executable line beginning with: $Prefix"
  }
}

function Extract-Block([string]$Text, [string]$Start, [string]$End, [string]$Label) {
  $lines = $Text -split "`r`n|`n|`r"
  $startIndex = -1
  $endIndex = $lines.Count
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($startIndex -lt 0 -and $lines[$i].TrimStart().StartsWith($Start, [StringComparison]::Ordinal)) {
      $startIndex = $i
      continue
    }
    if ($startIndex -ge 0 -and $lines[$i].TrimStart().StartsWith($End, [StringComparison]::Ordinal)) {
      $endIndex = $i
      break
    }
  }
  if ($startIndex -lt 0) { throw "$Label start boundary is missing: $Start" }
  return ($lines[$startIndex..($endIndex - 1)] -join "`n")
}

function Extract-YamlStep([string]$Text, [string]$StepId, [string]$Label) {
  $lines = $Text -split "`r`n|`n|`r"
  $idLine = (' ' * 8) + "id: $StepId"
  $idIndex = -1
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -ceq $idLine) { $idIndex = $i; break }
  }
  if ($idIndex -lt 0) { throw "$Label is missing the exact step id: $StepId" }
  $startIndex = -1
  for ($i = $idIndex; $i -ge 0; $i--) {
    if ($lines[$i].StartsWith((' ' * 6) + '- name: ', [StringComparison]::Ordinal)) { $startIndex = $i; break }
  }
  if ($startIndex -lt 0) { throw "$Label has no step boundary for id: $StepId" }
  $endIndex = $lines.Count
  for ($i = $startIndex + 1; $i -lt $lines.Count; $i++) {
    if ($lines[$i].StartsWith((' ' * 6) + '- name: ', [StringComparison]::Ordinal)) { $endIndex = $i; break }
  }
  return ($lines[$startIndex..($endIndex - 1)] -join "`n")
}

function Require-RunLine([string]$StepText, [string]$Prefix, [string]$Label) {
  $executable = Remove-CommentOnlyLines $StepText
  $runIndex = -1
  $lines = $executable -split "`n"
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i].Trim() -ceq 'run: |') { $runIndex = $i; break }
  }
  if ($runIndex -lt 0) { throw "$Label has no run block" }
  $found = $lines[($runIndex + 1)..($lines.Count - 1)] | Where-Object {
    $_.TrimStart().StartsWith($Prefix, [StringComparison]::Ordinal)
  } | Select-Object -First 1
  if ($null -eq $found) { throw "$Label run block is missing executable line beginning with: $Prefix" }
}

function Forbid-Literal([string]$Text, [string]$Needle, [string]$Label) {
  if ($Text.IndexOf($Needle, [StringComparison]::Ordinal) -ge 0) {
    throw "$Label contains forbidden contract text: $Needle"
  }
}

function Remove-CommentOnlyLines([string]$Text) {
  return (($Text -split "`r`n|`n|`r") | Where-Object {
    $trimmed = $_.TrimStart()
    -not ($trimmed.StartsWith('#') -or $trimmed.StartsWith('//') -or $trimmed.StartsWith('/*') -or $trimmed.StartsWith('*'))
  }) -join "`n"
}

$release = Read-Required $ReleaseWorkflow
$pages = Read-Required $PagesWorkflow
$codename = Read-Required $CodenameScript
$site = Read-Required $SiteIndex
$releaseExecutable = Remove-CommentOnlyLines $release
$pagesExecutable = Remove-CommentOnlyLines $pages
$codenameExecutable = Remove-CommentOnlyLines $codename
$dimSumBlock = Extract-Block $release 'id: dim_sum_contract' '- name:' 'release.yml dim_sum_contract'
$dimSumExecutable = Remove-CommentOnlyLines $dimSumBlock
$codenameStep = Extract-YamlStep $release 'codename' 'release.yml'
$dimSumStep = Extract-YamlStep $release 'dim_sum_contract' 'release.yml'
$releaseClaimStep = Extract-YamlStep $release 'release_claim' 'release.yml'
$pagesRunStep = Extract-YamlStep $pages 'current_release_run' 'pages.yml'
$pagesFactsStep = Extract-YamlStep $pages 'release_facts' 'pages.yml'

Require-Literal $pages "on:`n  push:`n    branches:`n      - main" 'pages.yml'

Require-ExecutableLine $codenameExecutable 'if grep -Fqx "$id" "$tmp/used.txt"' 'release-codename.sh'
$imageDishOutputLine = 'printf ''image_dish=%s\n'' "$id"'
Require-ExecutableLine $codenameExecutable $imageDishOutputLine 'release-codename.sh'
Require-ExecutableLine $releaseExecutable 'cat "$raw" >> "$GITHUB_OUTPUT"' 'release.yml'
$duplicateTagLine = 'if printf ''%s\n'' "$tags" | grep -Fqx "$TAG"; then'
Require-ExecutableLine $releaseExecutable $duplicateTagLine 'release.yml'
$exactOneReleaseLine = '[ "$match_count" = "1" ] || {'
Require-ExecutableLine $pagesExecutable $exactOneReleaseLine 'pages.yml'
Require-RunLine $codenameStep 'if ! gh api --paginate' 'release.yml codename step'
Require-RunLine $dimSumStep 'expected_catalog_image_url=' 'release.yml dim_sum_contract step'
Require-RunLine $releaseClaimStep 'if printf ''%s\n'' "$tags" | grep -Fqx "$TAG"; then' 'release.yml release_claim step'
Require-RunLine $pagesRunStep 'runs=$(gh run list --repo "$GITHUB_REPOSITORY"' 'pages.yml current_release_run step'
Require-RunLine $pagesFactsStep 'expected_installer_url=' 'pages.yml release_facts step'

@(
  'grep -Fqx "$id" "$tmp/used.txt"'
  'startswith("catalog-v1")'
  '.draft == false'
  '.prerelease == false'
  'gh api --paginate "repos/$public_repo/releases?per_page=100"'
  '.dishes | type == "array" and length > 0 and length <= 4000'
  '.total == (.dishes | length)'
  'catalog_bytes=$(wc -c < "$tmp/public.json"'
  'spent-id input exceeds the 1 MiB safety bound'
  'test("^hk-dish-[0-9]{4}$")'
  'test("^images/hk-dish-[0-9]{4}-[a-z0-9-]+\\.png$")'
  'published catalog asset metadata is outside its safety bounds'
  "printf 'image=%s"
  "printf 'image_dish=%s"
  "printf 'image_bytes=%s"
  "printf 'image_content_type=%s"
  'source=unavailable'
) | ForEach-Object { Require-Literal $codenameExecutable $_ 'release-codename.sh' }
Forbid-Literal $codename 'bundled_index' 'release-codename.sh'
Forbid-Literal $codename 'assets/dim-sum/images' 'release-codename.sh'

@(
  'cat "$raw" >> "$GITHUB_OUTPUT"'
  'id: dim_sum_contract'
  'Verify public catalog image metadata without copying bytes'
  'CATALOG_IMAGE: ${{ steps.codename.outputs.image }}'
  'CATALOG_IMAGE_DISH: ${{ steps.codename.outputs.image_dish }}'
  'case "$CATALOG_IMAGE" in "$CATALOG_IMAGE_DISH"-*.png)'
  'expected_catalog_image_url="https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/${CATALOG_IMAGE_TAG}/${CATALOG_IMAGE}"'
  'the selected image URL is not exactly bound to the selected catalog tag and filename'
  '^[1-9][0-9]{0,7}$'
  'the selected catalog image exceeds the 16 MiB safety bound'
  'status=blocked-no-copy-policy'
  'no copied image is attached'
  "steps.codename.outcome == 'success'"
  "steps.dim_sum_contract.outcome == 'success'"
  'grep -Fqx "$TAG"'
  'gh api --paginate "repos/$GITHUB_REPOSITORY/releases?per_page=100"'
  'expected_keys=$(printf'
  'the code-name selector emitted an invalid output record'
  'the code-name selector emitted a control character'
  'prior release body read failed for $tag'
  'prior release listing failed while selecting a code name'
  'if ! gh release view "$tag" --repo "$GITHUB_REPOSITORY" --json body --jq'
  's/^\*\*Code name: (.*)\*\*$/\1/p'
  'group: material-designer-release-publisher'
  'gh release create "$TAG" --repo "$GITHUB_REPOSITORY" --target "$GITHUB_SHA"'
  'gh release edit "$TAG" --repo "$GITHUB_REPOSITORY" --draft=false --latest'
  'release listing failed while claiming the unique release tag'
  'published release read failed for $TAG'
  '<!-- release-version: ${APP_VERSION} -->'
  '<!-- release-tag: ${TAG} -->'
  '<!-- release-package: open-design-packaged-app -->'
  '<!-- release-installer: ${ASSET_NAME} -->'
  '<!-- dim-sum-id: ${CODE_NAME_ID} -->'
  '<!-- dim-sum-catalog-tag: ${CATALOG_IMAGE_TAG} -->'
  '<!-- dim-sum-image-source: ${DISH_PHOTO_URL} -->'
  '<!-- dim-sum-image-dish: ${CATALOG_IMAGE_DISH} -->'
  '<!-- dim-sum-image-asset: ${CATALOG_IMAGE_ASSET} -->'
  '<!-- dim-sum-image-sha256: ${CATALOG_IMAGE_SHA256} -->'
  'Workflow duration:'
  'node scripts/line-count.mjs'
  'test -s "$out"'
  "Status -ne 'NotSigned'"
  'image_dish does not match'
) | ForEach-Object { Require-Literal $releaseExecutable $_ 'release.yml' }
@(
  'curl -fsSL'
  'Invoke-WebRequest'
  'gh release download'
  'sha256sum'
  'FromStream'
  'PHOTO_PATH'
) | ForEach-Object { Forbid-Literal $dimSumExecutable $_ 'release.yml dim_sum_contract' }
Forbid-Literal $release 'temporary dim-sum photo exception' 'release.yml'
Forbid-Literal $release 'status=temporarily-skipped' 'release.yml'
Forbid-Literal $release 'temporarily skipped by the repository owner' 'release.yml'

@(
  'Wait for the current successful release'
  'workflow_run:'
  "branches:`n      - main"
  'workflows:'
  '- Release'
  "github.event.workflow_run.head_branch == 'main'"
  "github.event.workflow_run.conclusion == 'success'"
  'EXPECTED_RELEASE_SHA:'
  'RELEASE_RUN_ID_INPUT:'
  'ref: ${{ github.event_name == ''workflow_run'' && github.event.workflow_run.head_sha || github.sha }}'
  "github.ref == 'refs/heads/main'"
  'workflow_run must be the successful Release run for main and $expected_sha'
  'gh run list --repo "$GITHUB_REPOSITORY" --workflow release.yml --commit "$expected_sha"'
  'gh run view "$RELEASE_RUN_ID"'
  'gh api --paginate "repos/$GITHUB_REPOSITORY/releases?per_page=100"'
  'expected exactly one published release'
  'isDraft'
  'isPrerelease'
  'Workflow duration:'
  'Lines of code'
  'metadata.json'
  'FromStream($stream, $true, $true)'
  'gh release download "$release_tag" --repo "$GITHUB_REPOSITORY" --pattern metadata.json'
  'published metadata does not bind selected release tag, installer asset, exact checksum URL, unsigned state, and checksum'
  'image_magic=$(od -An -tx1 -N8'
  'current release is missing its verified PNG catalog image asset'
  'marker_value()'
  'release_tag_marker=$(marker_value release-tag)'
  'package_id=$(marker_value release-package)'
  'installer_marker=$(marker_value release-installer)'
  'catalog_tag=$(marker_value dim-sum-catalog-tag)'
  'image_source=$(marker_value dim-sum-image-source)'
  'expected_image_source="https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/$catalog_tag/$image_asset"'
  'site field $key must occur exactly once'
  '[ "$count" = "1" ] ||'
  'site link field $key must occur exactly once'
  'site cell field $key must occur exactly once'
  'set_field()'
  'set_cell_field()'
  'set_link()'
  'published release listing failed while resolving the current checkout'
  'published release body read failed for $tag'
  'set_field image'
  'set_field image-sha'
  'set_front_attr()'
  'set_front_text()'
  'front-screen provenance is malformed or not bound to the selected release'
  'gh release download "$release_tag" --repo "$GITHUB_REPOSITORY" --pattern ''build-provenance.json'''
  'current release does not bind exactly one downloadable installer to its marker'
) | ForEach-Object { Require-Literal $pagesExecutable $_ 'pages.yml' }
Forbid-Literal $pages 'keeping the checked-in page facts' 'pages.yml'
Forbid-Literal $pages 'the newest published release has no Windows installer' 'pages.yml'

@(
  'data-release="image"'
  'data-release="image-sha"'
  'data-release-href="image"'
) | ForEach-Object { Require-Literal $site $_ 'site/index.html' }

Write-Output 'PASS: release integrity contract contains exact unused-id, published-image, output, duplicate-release, timing, line-count, unsigned-asset, and Pages freshness boundaries.'
