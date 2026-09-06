#requires -Version 5.1
[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('Reserve','Publish')][string]$Phase,
  [Parameter(Mandatory)][string]$ReservationFile,
  [Parameter(Mandatory)][ValidatePattern('^[0-9a-f]{40}$')][string]$SourceCommit,
  [Parameter(Mandatory)][ValidatePattern('^\d+\.\d+\.\d+$')][string]$Version,
  [Parameter(Mandatory)][ValidateRange(1,2147483647)][int]$Candidate,
  [string]$RunDirectory,
  [string]$DishId,
  [string]$PhotoUrl,
  [string]$PhotoSha256,
  [long]$PhotoBytes,
  [string]$DishName,
  [string]$ReleaseNotesFile,
  [switch]$RootReservation
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ((Get-Command ConvertFrom-Json).Parameters.ContainsKey('DateKind')) { $PSDefaultParameterValues['ConvertFrom-Json:DateKind'] = 'String' }
function Invoke-GhJson([string[]]$Arguments) {
  $output = & gh @Arguments
  if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI operation failed' }
  return ($output | ConvertFrom-Json)
}
function Read-Json([string]$Path) { Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json }
function Write-Json($Value, [string]$Path) { $Value | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $Path -Encoding utf8 }
function Hash([string]$Path) { $stream = [IO.File]::OpenRead($Path); $algorithm = [Security.Cryptography.SHA256]::Create(); try { return ([BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() } finally { $stream.Dispose(); $algorithm.Dispose() } }
function Require-File([string]$Root, [string]$Name) {
  if ([IO.Path]::GetFileName($Name) -cne $Name -or $Name.Contains('..')) { throw 'Unsafe asset name' }
  $path = Join-Path $Root $Name
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing asset: $Name" }
  return $path
}
function Require-CleanSource {
  $head = & git rev-parse HEAD
  if ($LASTEXITCODE -ne 0 -or $head.Trim() -cne $SourceCommit) { throw 'HEAD must equal SourceCommit' }
  $status = & git status --porcelain --untracked-files=normal
  if ($LASTEXITCODE -ne 0 -or $status) { throw 'Source checkout and index must be clean before release effects' }
}
function Assert-Ownership($Release, $Reservation) {
  if ($Release.id -isnot [long] -and $Release.id -isnot [int]) { throw 'Release id must be the numeric REST id' }
  if ($Release.tag_name -cne $tag -or $Release.target_commitish -cne $SourceCommit -or
      $Release.author.login -cne $Reservation.publisherLogin -or
      -not ([string]$Release.body).Contains($Reservation.marker) -or
      ($Reservation.releaseId -and $Release.id -ne $Reservation.releaseId)) { throw 'Release is not owned by this adapter reservation' }
}
function Read-Releases {
  $pages = Invoke-GhJson @('api', "repos/$repository/releases?per_page=100", '--paginate', '--slurp')
  return @($pages | ForEach-Object { $_ | ForEach-Object { $_ } })
}
function Verify-Download($Asset, [string]$ExpectedPath, [string]$Directory) {
  $download = Join-Path $Directory ([string]$Asset.name)
  & gh release download $tag --repo $repository --pattern ([string]$Asset.name) --dir $Directory
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $download -PathType Leaf)) { throw 'Release asset download failed' }
  if ((Hash $download) -cne (Hash $ExpectedPath) -or (Get-Item -LiteralPath $download).Length -ne (Get-Item -LiteralPath $ExpectedPath).Length) { throw 'Downloaded release bytes differ from the candidate' }
}

Require-CleanSource
$repo = (& git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve source checkout' }
$tag = "v$Version-r$Candidate.1"
$reservationPath = [IO.Path]::GetFullPath($ReservationFile)
if ($reservationPath.StartsWith($repo.TrimEnd('/','\') + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Reservation must live outside the source checkout' }
$repository = (& gh repo view --json nameWithOwner --jq .nameWithOwner).Trim()
if ($LASTEXITCODE -ne 0 -or $repository -cne 'Ding-Ding-Projects/material-designer') { throw 'Unexpected publication repository' }
$login = (& gh api user --jq .login).Trim()
if ($LASTEXITCODE -ne 0 -or -not $login) { throw 'Publisher identity unavailable' }
Import-Module (Join-Path $PSScriptRoot 'build-provenance.psm1') -Force

if ($Phase -eq 'Reserve') {
  if (Test-Path -LiteralPath $reservationPath) { throw 'Reservation already exists; use its Publish phase or inspect an interrupted reservation before any new attempt' }
  $existing = @(Read-Releases | Where-Object { $_.tag_name -ceq $tag -or $_.target_commitish -ceq $SourceCommit })
  if ($existing.Count) { throw 'An existing tag or same-source release has no ownership from this new reservation' }
  $nonce = [Guid]::NewGuid().ToString('N')
  $marker = "<!-- material-designer-manual-reservation:$nonce -->"
  $reservation = [ordered]@{ schemaVersion = 1; adapter = 'material-designer-manual-v2'; repository = $repository; sourceCommit = $SourceCommit; version = $Version; candidate = $Candidate; tag = $tag; publisherLogin = $login; marker = $marker; releaseId = $null; state = 'intent' }
  Write-Json $reservation $reservationPath
  $requestPath = "$reservationPath.request.json"
  Write-Json @{ tag_name = $tag; target_commitish = $SourceCommit; name = "Material Designer $Version"; body = "$marker`nManual unsigned Squirrel candidate reserved before build."; draft = $true; prerelease = $false } $requestPath
  $release = Invoke-GhJson @('api', '--method', 'POST', "repos/$repository/releases", '--input', $requestPath)
  Assert-Ownership $release $reservation
  if (-not $release.draft -or -not (Test-BuildProvenanceTimestamp $release.created_at)) { throw 'Draft reservation has invalid external creation facts' }
  $reservation.releaseId = $release.id
  $reservation.state = 'reserved'
  $reservation.releaseCreatedAt = $release.created_at
  $reservation.provenanceFile = "$reservationPath.provenance.json"
  Write-Json @{ schemaVersion = 1; sourceCommit = $SourceCommit; version = $Version; updatedAt = $release.created_at } $reservation.provenanceFile
  $null = Read-ValidatedBuildProvenance $reservation.provenanceFile $SourceCommit $Version
  Write-Json $reservation $reservationPath
  [pscustomobject]$reservation | ConvertTo-Json -Depth 10
  exit 0
}

if (-not $ReleaseNotesFile -or -not (Test-Path -LiteralPath $ReleaseNotesFile -PathType Leaf) -or (Get-Item -LiteralPath $ReleaseNotesFile).Length -gt 32768) { throw 'Publish requires reviewed release notes of at most 32 KiB' }
$reviewedNotes = [IO.File]::ReadAllText([IO.Path]::GetFullPath($ReleaseNotesFile))
$reservation = Read-Json $reservationPath
$originalReservationPath = $reservationPath
if ($RootReservation) {
  if ($reservation.schemaVersion -ne 1 -or $reservation.marker -notmatch '^[a-f0-9]{32}$' -or
      $reservation.originalBody -cne "Local unsigned Squirrel build in progress. Not published. Source: $SourceCommit. Manual reservation: $($reservation.marker).") { throw 'Root reservation has no exact original ownership body' }
  $rootRecord = $reservation
  $reservationPath = "$originalReservationPath.publisher-state.json"
  if (Test-Path -LiteralPath $reservationPath) { $reservation = Read-Json $reservationPath }
  else {
    $reservation = [pscustomobject]@{ schemaVersion = 1; adapter = 'material-designer-manual-v2'; repository = $repository; sourceCommit = $rootRecord.sourceCommit; version = $rootRecord.version; candidate = $rootRecord.candidate; tag = $rootRecord.tag; publisherLogin = $rootRecord.publisherLogin; marker = $rootRecord.marker; releaseId = $rootRecord.releaseId; state = 'reserved'; releaseCreatedAt = $rootRecord.createdAt; provenanceFile = $rootRecord.provenancePath; originalBody = $rootRecord.originalBody }
  }
}
if ($reservation.adapter -cne 'material-designer-manual-v2' -or $reservation.repository -cne $repository -or
    $reservation.sourceCommit -cne $SourceCommit -or $reservation.version -cne $Version -or
    $reservation.candidate -ne $Candidate -or $reservation.tag -cne $tag -or
    $reservation.publisherLogin -cne $login -or $reservation.state -notin @('reserved','publishing','published')) { throw 'Reservation identity mismatch' }
$release = Invoke-GhJson @('api', "repos/$repository/releases/$($reservation.releaseId)")
Assert-Ownership $release $reservation
$otherCandidates = @(Read-Releases | Where-Object { $_.target_commitish -ceq $SourceCommit -and $_.id -ne $release.id })
if ($otherCandidates.Count) { throw 'Another release targets this source; publication uniqueness is ambiguous' }
if ($RootReservation -and $reservation.state -eq 'reserved' -and $release.body -cne $rootRecord.originalBody) { throw 'Root-reserved draft body changed before publisher adoption' }
if ($release.created_at -cne $reservation.releaseCreatedAt -or $release.prerelease) { throw 'Reserved draft identity changed' }
$provenance = Read-ValidatedBuildProvenance $reservation.provenanceFile $SourceCommit $Version
if ($provenance.updatedAt -cne $release.created_at) { throw 'Build provenance does not use the reserved draft creation time' }
$run = [IO.Path]::GetFullPath($RunDirectory)
$assets = Join-Path $run 'assets'
$manifest = Read-Json (Require-File $run 'installer-manifest.json')
if ($manifest.commit -cne $SourceCommit -or $manifest.version -cne $Version -or $manifest.candidate -ne $Candidate -or
    $tag -cne "v$($manifest.version)-r$($manifest.candidate).1" -or $manifest.signed -ne $false -or
    $manifest.signatureStatus -cne 'NotSigned' -or $manifest.installerFormat -cne 'squirrel' -or $manifest.provenanceStatus -cne 'verified') { throw 'Installer manifest identity mismatch' }
$setup = Require-File $assets $manifest.setup
if ((Hash $setup) -cne $manifest.setupSha256 -or (Get-Item -LiteralPath $setup).Length -ne $manifest.setupBytes -or (Get-AuthenticodeSignature -LiteralPath $setup).Status -ne 'NotSigned') { throw 'Unsigned setup bytes do not match manifest' }
$metadata = Read-Json (Require-File $assets 'metadata.json')
if ($metadata.platforms.win.artifacts.installer.url -cne "https://github.com/$repository/releases/download/$tag/$($manifest.setup)" -or $metadata.releaseVersion -cne $Version) { throw 'Update metadata uses a different release path' }
$rawProvenancePath = Require-File $run 'build-provenance.json'
$rawProvenance = Read-Json $rawProvenancePath
if ($rawProvenance.sourceCommit -cne $SourceCommit -or $rawProvenance.updatedAt -cne $provenance.updatedAt -or $rawProvenance.provenanceStatus -cne 'verified') { throw 'Build provenance does not bind this reservation' }
if ($rawProvenance.cleanOutput -ne $true -or [string]::IsNullOrWhiteSpace($rawProvenance.packagingCommand) -or
    $rawProvenance.signing.inputsCleared -ne $true -or $rawProvenance.signing.certificateAutoDiscoveryDisabled -ne $true -or
    $rawProvenance.signing.signerInvocationCount -ne 0 -or @($rawProvenance.signing.observedSignerInvocations).Count -ne 0) { throw 'Raw build proof lacks required unsigned packaging facts' }
foreach ($control in @('forceCodeSigning','signExecutable','signAndEditExecutable')) { if ($rawProvenance.signing.controls.$control -ne $false) { throw 'Raw signing control was enabled' } }
$packageAssets = $assets
$assets = Join-Path $run 'manual-public-assets'
$null = New-Item -ItemType Directory -Path $assets -Force
$binaryNames = @($manifest.setup, "$($manifest.setup).sha256", 'RELEASES', 'metadata.json', 'material-designer.ico') + @($manifest.fullPackages) + @($manifest.deltaPackages)
foreach ($name in $binaryNames) { Copy-Item -LiteralPath (Require-File $packageAssets $name) -Destination (Join-Path $assets $name) -Force }
$setup = Require-File $assets $manifest.setup
$sanitizedLines = @('schemaVersion=1', 'status=success', 'phase=squirrel-packaging', "sourceCommit=$SourceCommit", "version=$Version", "installer=$($manifest.setup)", "installerSha256=$($manifest.setupSha256)", "squirrelFullPackages=$(@($manifest.fullPackages).Count)", "squirrelDeltaPackages=$(@($manifest.deltaPackages).Count)", 'signature=NotSigned')
$unsafe = '(?<![A-Za-z])[A-Za-z]:[\/]|/home/|/Users/|/runner/|(?i)(?:secret|password|credential|authorization|api[_-]?key)'
if (($sanitizedLines -join "`n") -match $unsafe) { throw 'Unsafe public log summary' }
[IO.File]::WriteAllLines((Join-Path $assets 'installer-build.log'), $sanitizedLines, [Text.UTF8Encoding]::new($false))
$publicProvenancePath = Join-Path $assets 'build-provenance.json'
Write-Json @{ version = 1; sourceCommit = $SourceCommit; provenanceStatus = 'verified'; updatedAt = $provenance.updatedAt; builtAt = $provenance.updatedAt; cleanOutput = $rawProvenance.cleanOutput; packagingCommand = $rawProvenance.packagingCommand; package = @{ id = 'open-design-packaged-app'; version = $Version; architecture = 'x64' }; external = $provenance; buildLog = @{ path = 'installer-build.log'; sha256 = Hash (Join-Path $assets 'installer-build.log') }; signing = @{ inputsCleared = $rawProvenance.signing.inputsCleared; certificateAutoDiscoveryDisabled = $rawProvenance.signing.certificateAutoDiscoveryDisabled; processAuditComplete = $rawProvenance.signing.processAuditComplete; signerInvocationCount = 0; observedSignerInvocations = @(); controls = @{ forceCodeSigning = $false; signExecutable = $false; signAndEditExecutable = $false } }; privateExecutionDetails = 'omitted from this public projection' } $publicProvenancePath
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repo 'scripts/verify-squirrel-artifacts.ps1') -ArtifactDirectory $assets -ProvenancePath $publicProvenancePath -ExpectedCommit $SourceCommit -SetupFile $manifest.setup -ExpectedPackageId 'open-design-packaged-app' -ExpectedVersion $Version -ExpectedArchitecture x64 -RequiredPackageEntry 'lib/net45/Material Designer.exe' -MetadataFile 'metadata.json' -IconFile 'material-designer.ico' -OutputPath (Join-Path $assets 'artifact-receipt.json')
if ($LASTEXITCODE -ne 0) { throw 'Public Squirrel artifact validation failed' }
if ($DishId -notmatch '^hk-dish-\d{4}$' -or $PhotoSha256 -notmatch '^[a-f0-9]{64}$' -or $PhotoBytes -le 0 -or [string]::IsNullOrWhiteSpace($DishName)) { throw 'Public catalog photo identity is incomplete' }
if ($PhotoUrl -notmatch '^https://github\.com/Ding-Ding-Projects/dim-sum-photos/releases/download/(?<tag>catalog-v1[^/]*)/(?<name>[a-z0-9-]+\.png)$') { throw 'Photo must link to the published canonical catalog' }
$catalogTag = $Matches.tag
$photoName = $Matches.name
if (-not $photoName.StartsWith("$DishId-", [StringComparison]::Ordinal)) { throw 'Photo basename does not match canonical dish id' }
$photoDirectory = Join-Path $run ('catalog-verification-' + [Guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $photoDirectory
& gh release download $catalogTag --repo Ding-Ding-Projects/dim-sum-photos --pattern $photoName --dir $photoDirectory
if ($LASTEXITCODE -ne 0) { throw 'Published catalog photo download failed' }
$photo = Require-File $photoDirectory $photoName
if ((Hash $photo) -cne $PhotoSha256 -or (Get-Item -LiteralPath $photo).Length -ne $PhotoBytes) { throw 'Published photo bytes do not match the canonical record' }
Add-Type -AssemblyName System.Drawing
$decoded = [Drawing.Image]::FromFile($photo)
try { if ($decoded.RawFormat.Guid -ne [Drawing.Imaging.ImageFormat]::Png.Guid -or $decoded.Width -lt 1 -or $decoded.Height -lt 1) { throw 'Canonical photo does not decode as PNG' } } finally { $decoded.Dispose() }
# The photo is linked in release notes. It is never copied into release assets.
$lineCount = Join-Path $assets 'line-count.json'
$countOutput = & node (Join-Path $repo 'scripts/line-count.mjs') --json
if ($LASTEXITCODE -ne 0) { throw 'Line count producer failed' }
$countOutput | Set-Content -LiteralPath $lineCount -Encoding utf8
$lineReport = Read-Json $lineCount
$lineSummary = "Project source: $($lineReport.totals.own.lines) lines. Counted total including imported source: $($lineReport.totals.grand.lines) lines. Full categories and exclusions: line-count.json."
$evidencePath = Join-Path $assets 'build-evidence.json'
$evidence = [ordered]@{ schemaVersion = 1; producer = 'scripts/publish-manual-release.ps1'; sourceCommit = $SourceCommit; appVersion = $Version; builtAt = $provenance.updatedAt; candidate = $Candidate; reservationId = $release.id; releaseCreatedAt = $release.created_at; installerName = $manifest.setup; installerSha256 = Hash $setup; installerBytes = $manifest.setupBytes; signingStatus = 'NotSigned'; provenanceStatus = 'verified'; checks = @('source identity','manifest identity','setup hash','unsigned executable','reserved provenance','catalog image decode'); uiVerification = 'not performed by manual publisher' }
Write-Json $evidence $evidencePath
# Only delivery-sanitized files under assets may be published. Raw run logs stay local.
$names = @($manifest.setup, "$($manifest.setup).sha256", 'RELEASES', 'metadata.json', 'material-designer.ico', 'build-evidence.json', 'build-provenance.json', 'artifact-receipt.json', 'installer-build.log', 'line-count.json') + @($manifest.fullPackages) + @($manifest.deltaPackages)
if (@($manifest.fullPackages).Count -lt 1 -or @($names | Select-Object -Unique).Count -ne $names.Count) { throw 'Package inventory is missing or contains duplicates' }
$records = @($names | ForEach-Object { $file = Require-File $assets $_; [ordered]@{ name = $_; size = (Get-Item -LiteralPath $file).Length; sha256 = Hash $file } })
$receiptPath = Join-Path $assets 'release-publication-receipt.json'
$desiredReceipt = [ordered]@{ schemaVersion = 1; publisherKind = 'manual'; sourceCommit = $SourceCommit; appVersion = $Version; releaseTag = $tag; releaseId = $release.id; releaseCreatedAt = $release.created_at; publicationStatus = 'draft'; publisherLogin = $login; reservationMarker = $reservation.marker; externalProvenance = $provenance; dishId = $DishId; codename = $DishName; photoUrl = $PhotoUrl; photoName = $photoName; photoSha256 = $PhotoSha256; photoBytes = $PhotoBytes; photoDelivery = 'canonical-link-only'; installerName = $manifest.setup; installerSha256 = Hash $setup; requiredAssets = @($records + @(@{ name = 'release-publication-receipt.json'; size = $null; sha256 = $null })) }
if (Test-Path -LiteralPath $receiptPath) {
  $priorReceipt = Read-Json $receiptPath
  if (($priorReceipt | ConvertTo-Json -Depth 20 -Compress) -cne ($desiredReceipt | ConvertTo-Json -Depth 20 -Compress)) { throw 'Existing local publication receipt differs from exact candidate' }
} else { Write-Json $desiredReceipt $receiptPath }
$names += 'release-publication-receipt.json'
foreach ($name in @('build-evidence.json','build-provenance.json','artifact-receipt.json','installer-build.log','release-publication-receipt.json')) { if ((Get-Content -Raw -LiteralPath (Require-File $assets $name)) -match $unsafe) { throw 'Public evidence contains private execution detail' } }
foreach ($asset in @($release.assets)) { if ($asset.name -notin $names) { throw 'Owned draft contains an unknown asset; refusing publication' } }
$verifyDirectory = Join-Path $run ('publication-download-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $verifyDirectory | Out-Null
foreach ($name in $names) {
  $localFile = Require-File $assets $name
  $matches = @($release.assets | Where-Object name -CEQ $name)
  if ($matches.Count -gt 1) { throw 'Duplicate draft asset name' }
  if ($matches.Count -eq 1) { Verify-Download $matches[0] $localFile $verifyDirectory }
  else {
    if (-not $release.draft) { throw 'Published release is missing a required asset' }
    & gh release upload $tag $localFile --repo $repository
    if ($LASTEXITCODE -ne 0) { throw 'Asset upload failed; draft is retained' }
  }
}
# Verify newly uploaded bytes while the release is still a draft.
$stagedRelease = Invoke-GhJson @('api', "repos/$repository/releases/$($reservation.releaseId)")
Assert-Ownership $stagedRelease $reservation
if (@($stagedRelease.assets).Count -ne $names.Count) { throw 'Draft asset inventory is incomplete before publication' }
$stagedDownload = Join-Path $run ('draft-download-' + [Guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $stagedDownload
foreach ($name in $names) {
  $matches = @($stagedRelease.assets | Where-Object name -CEQ $name)
  if ($matches.Count -ne 1) { throw 'Draft asset inventory differs before publication' }
  Verify-Download $matches[0] (Require-File $assets $name) $stagedDownload
}
Require-CleanSource
$reservation.state = 'publishing'; Write-Json $reservation $reservationPath
if ($release.draft) {
  $notesPath = "$reservationPath.notes.md"
  @("$($reservation.marker)", "# Material Designer $Version", "Built from ``$SourceCommit``", 'Manual publication from a local unsigned Squirrel build. No GitHub Actions workflow was used for this publication.', 'These unsigned installers may show an unknown-publisher or SmartScreen warning.', "dim-sum-id: $DishId", "Dish: $DishName", "[Canonical dish photo]($PhotoUrl)", "Public catalog photo SHA-256: $PhotoSha256", 'The build-evidence.json asset lists checks performed by this publisher. Installed UI verification is separate.', $lineSummary, '', $reviewedNotes) | Set-Content -LiteralPath $notesPath -Encoding utf8
  & gh release edit $tag --repo $repository --draft=false --notes-file $notesPath
  if ($LASTEXITCODE -ne 0) { throw 'Publication failed; reservation is retained' }
}
$published = Invoke-GhJson @('api', "repos/$repository/releases/$($reservation.releaseId)")
Assert-Ownership $published $reservation
if ($published.draft -or -not (Test-BuildProvenanceTimestamp $published.published_at) -or @($published.assets).Count -ne $names.Count) { throw 'Final release state does not match the owned publication' }
$finalDownload = Join-Path $run ('published-download-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $finalDownload | Out-Null
foreach ($name in $names) {
  $matches = @($published.assets | Where-Object name -CEQ $name)
  if ($matches.Count -ne 1) { throw 'Final release asset inventory differs' }
  Verify-Download $matches[0] (Require-File $assets $name) $finalDownload
}
Write-Json @{ schemaVersion = 1; sourceCommit = $SourceCommit; releaseId = $published.id; tag = $tag; publishedAt = $published.published_at; reservationMarker = $reservation.marker; assets = @($names | ForEach-Object { $f = Require-File $assets $_; @{ name = $_; size = (Get-Item -LiteralPath $f).Length; sha256 = Hash $f } }) } (Join-Path $run 'manual-download-verification.json')
$reservation.state = 'published'; $reservation | Add-Member -NotePropertyName releasePublishedAt -NotePropertyValue $published.published_at -Force
Write-Json $reservation $reservationPath
[pscustomobject]@{ state = 'verified'; releaseId = $published.id; tag = $tag; sourceCommit = $SourceCommit; publishedAt = $published.published_at; downloadedAssets = $names.Count } | ConvertTo-Json
