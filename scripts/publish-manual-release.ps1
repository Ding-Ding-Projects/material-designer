[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [Parameter(Mandatory = $true)][string]$RunDirectory,
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-f]{40}$')][string]$SourceCommit,
  [Parameter(Mandatory = $true)][string]$Version,
  [Parameter(Mandatory = $true)][ValidatePattern('^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?-r\d+\.\d+$')][string]$Tag,
  [Parameter(Mandatory = $true)][string]$ProvenanceFile,
  [Parameter(Mandatory = $true)][string]$PhotoFile,
  [Parameter(Mandatory = $true)][string]$PhotoUrl,
  [Parameter(Mandatory = $true)][string]$DishId,
  [switch]$Publish
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Hash([string]$Path) { (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }
function Require-File([string]$Root, [string]$Name) {
  if ([IO.Path]::GetFileName($Name) -cne $Name -or $Name.Contains('..')) { throw "Unsafe asset name: $Name" }
  $path = Join-Path $Root $Name
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required release asset is missing: $Name" }
  $path
}
function Read-Json([string]$Path) { Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json }

$repo = (git rev-parse --show-toplevel).Trim()
if ((git rev-parse $SourceCommit).Trim() -ne $SourceCommit) { throw 'SourceCommit does not resolve to the requested commit' }
if ((git rev-parse HEAD).Trim() -ne $SourceCommit) { throw 'Manual publication requires the checked-out source commit' }
$run = [IO.Path]::GetFullPath($RunDirectory)
$assets = Join-Path $run 'assets'
if (-not (Test-Path -LiteralPath $assets -PathType Container)) { throw 'Candidate assets directory is missing' }
$manifest = Read-Json (Join-Path $run 'installer-manifest.json')
$provenance = Read-Json $ProvenanceFile
if ($manifest.commit -ne $SourceCommit -or $manifest.version -ne $Version -or $manifest.signed -ne $false -or $manifest.signatureStatus -ne 'NotSigned' -or $manifest.installerFormat -ne 'squirrel') { throw 'Installer manifest does not bind this unsigned Squirrel candidate' }
if ($provenance.schemaVersion -ne 1 -or $provenance.sourceCommit -ne $SourceCommit -or $provenance.version -ne $Version -or [string]::IsNullOrWhiteSpace($provenance.updatedAt)) { throw 'External provenance does not bind this candidate' }

$setup = Require-File $assets ([string]$manifest.setup)
$required = @($setup, (Require-File $assets "$($manifest.setup).sha256"), (Require-File $assets 'RELEASES'), (Require-File $assets 'metadata.json'), (Require-File $assets 'material-designer.ico'), (Require-File $run 'build-evidence.json'), (Require-File $run 'build-provenance.json'), (Require-File $run 'artifact-receipt.json'), (Require-File $run 'installer-build.log'))
foreach ($package in @($manifest.fullPackages) + @($manifest.deltaPackages)) { $required += Require-File $assets ([string]$package) }
if (@($manifest.fullPackages).Count -lt 1) { throw 'Candidate has no full Squirrel package' }
if (-not (Test-Path -LiteralPath $PhotoFile -PathType Leaf)) { throw 'Catalog photo is missing' }
$photoName = "codename-$DishId.png"
Copy-Item -LiteralPath $PhotoFile -Destination (Join-Path $assets $photoName) -Force
$required += Require-File $assets $photoName
$lineCountPath = Join-Path $assets 'line-count.json'
& node (Join-Path $repo 'scripts/line-count.mjs') --json | Set-Content -LiteralPath $lineCountPath -Encoding utf8
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $lineCountPath -PathType Leaf)) { throw 'Committed line-count script did not produce release evidence' }
$required += Require-File $assets 'line-count.json'

$assetRecords = @($required | ForEach-Object { $item = Get-Item -LiteralPath $_; [ordered]@{ name = $item.Name; size = [int64]$item.Length; sha256 = Hash $_ } })
$existing = gh release view $Tag --json id,tagName,isDraft,isPrerelease,targetCommitish,createdAt,publishedAt,author,assets 2>$null
if ($LASTEXITCODE -eq 0) {
  $release = $existing | ConvertFrom-Json
  if ($release.targetCommitish -ne $SourceCommit -or -not $release.isDraft) { throw 'Existing release tag is not an owned draft for this source commit' }
} elseif ($Publish) {
  gh release create $Tag --draft --target $SourceCommit --title "Material Designer $Version" --notes "Manual unsigned Squirrel publication in progress." | Out-Null
  $release = (gh release view $Tag --json id,tagName,isDraft,isPrerelease,targetCommitish,createdAt,publishedAt,author,assets | ConvertFrom-Json)
} else {
  [pscustomobject]@{ kind = 'ready-to-publish'; tag = $Tag; sourceCommit = $SourceCommit; assets = $assetRecords } | ConvertTo-Json -Depth 8
  exit 0
}
if (-not $Publish) { [pscustomobject]@{ kind = 'draft-reserved'; tag = $Tag; releaseId = $release.id; createdAt = $release.createdAt } | ConvertTo-Json; exit 0 }

gh release upload $Tag @($required) --clobber | Out-Null
$receiptPath = Join-Path $assets 'release-publication-receipt.json'
$receipt = [ordered]@{ schemaVersion = 1; publisherKind = 'manual'; sourceCommit = $SourceCommit; appVersion = $Version; releaseTag = $Tag; releaseId = [int64]$release.id; releaseCreatedAt = $release.createdAt; publicationStatus = 'draft'; publisherLogin = $release.author.login; externalProvenance = [ordered]@{ sourceCommit = $provenance.sourceCommit; version = $provenance.version; updatedAt = $provenance.updatedAt }; dishId = $DishId; photoUrl = $PhotoUrl; photoName = $photoName; photoSha256 = Hash (Join-Path $assets $photoName); photoBytes = (Get-Item (Join-Path $assets $photoName)).Length; installerName = $manifest.setup; installerSha256 = Hash $setup; requiredAssets = @($assetRecords + @([ordered]@{ name = 'release-publication-receipt.json'; size = $null; sha256 = $null })) }
$receipt | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $receiptPath -Encoding utf8
gh release upload $Tag $receiptPath --clobber | Out-Null
gh release edit $Tag --draft=false --notes-file (Join-Path $repo 'CHANGELOG.md') | Out-Null
$published = gh release view $Tag --json id,tagName,isDraft,isPrerelease,targetCommitish,createdAt,publishedAt,author,assets | ConvertFrom-Json
if ($published.isDraft -or $published.targetCommitish -ne $SourceCommit -or $published.publishedAt -eq $null) { throw 'Release did not publish with the expected source identity' }
$expected = @($receipt.requiredAssets | ForEach-Object name)
if (@($published.assets).Count -ne $expected.Count -or @($published.assets | Where-Object { $_.name -notin $expected }).Count -ne 0) { throw 'Published release assets do not match the receipt inventory' }
foreach ($record in $assetRecords) { $asset = @($published.assets | Where-Object name -eq $record.name); if ($asset.Count -ne 1 -or $asset[0].size -ne $record.size -or ([string]$asset[0].digest -replace '^sha256:', '').ToLowerInvariant() -ne $record.sha256) { throw "Published asset verification failed: $($record.name)" } }
$receipt.publicationStatus = 'published'; $receipt.publisherLogin = $published.author.login; $receipt.releasePublishedAt = $published.publishedAt
$receipt | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $receiptPath -Encoding utf8
gh release upload $Tag $receiptPath --clobber | Out-Null
[pscustomobject]$receipt | ConvertTo-Json -Depth 12
