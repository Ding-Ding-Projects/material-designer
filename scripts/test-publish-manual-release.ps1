[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$global:publisher = Join-Path $PSScriptRoot 'publish-manual-release.ps1'
$global:fixture = Join-Path ([IO.Path]::GetTempPath()) ('manual-publisher-test-' + [Guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $fixture
$global:source = 'a' * 40
$global:dirty = $false
$global:wrongHead = $false
$global:existing = $false
$global:mutations = 0
$global:publishFixture = $false
$global:repoFixture = Split-Path $PSScriptRoot
function git {
  $global:LASTEXITCODE = 0
  if ($args[0] -eq 'status') { if ($global:dirty) { ' M tracked.txt' }; return }
  if ($args[1] -eq 'HEAD') { if ($global:wrongHead) { 'b' * 40 } else { $global:source }; return }
  if ($args[1] -eq '--show-toplevel') { $global:repoFixture; return }
  throw 'Unexpected git fixture call'
}
function gh {
  $global:LASTEXITCODE = 0
  if ($args[0] -eq 'repo') { 'Ding-Ding-Projects/material-designer'; return }
  if ($args[1] -eq 'user') { 'fixture-publisher'; return }
  if ($global:publishFixture) {
    if ($args[0] -eq 'api') {
      $global:releaseFixture.assets = @($global:uploads.GetEnumerator() | ForEach-Object { @{ name = $_.Key; size = (Get-Item $_.Value).Length } })
      $global:releaseFixture | ConvertTo-Json -Depth 12
      return
    }
    if ($args[1] -eq 'upload') {
      $global:mutations++
      $file = $args[3]
      $global:uploads[[IO.Path]::GetFileName($file)] = $file
      return
    }
    if ($args[1] -eq 'download') {
      $name = $args[[Array]::IndexOf($args, '--pattern') + 1]
      $destination = $args[[Array]::IndexOf($args, '--dir') + 1]
      if ($args -contains 'Ding-Ding-Projects/dim-sum-photos') { Copy-Item -LiteralPath $global:photoFixture -Destination (Join-Path $destination $name); return }
      Copy-Item -LiteralPath $global:uploads[$name] -Destination (Join-Path $destination $name)
      if ($global:corruptDownload -and $name -eq 'setup.exe') { Add-Content (Join-Path $destination $name) 'corrupt' }
      return
    }
    if ($args[1] -eq 'edit') {
      $global:mutations++
      $global:publishMutations++
      $global:releaseFixture.draft = $false
      $global:releaseFixture.published_at = '2026-09-06T13:00:00Z'
      $global:releaseFixture.body = [IO.File]::ReadAllText($args[[Array]::IndexOf($args, '--notes-file') + 1])
      return
    }
    throw 'Unexpected publication fixture call'
  }
  if ($args -contains '--method') {
    $global:mutations++
    $index = [Array]::IndexOf($args, '--input')
    $request = Get-Content -Raw -LiteralPath $args[$index + 1] | ConvertFrom-Json
    @{ id = 12345; tag_name = $request.tag_name; target_commitish = $request.target_commitish; author = @{ login = 'fixture-publisher' }; body = $request.body; draft = $true; created_at = '2026-09-06T12:34:56Z'; assets = @() } | ConvertTo-Json -Depth 8
    return
  }
  if ($global:existing) { '[[{"id":99,"tag_name":"v0.21.532-r531.1","target_commitish":"' + $global:source + '"}]]' }
  else { '[]' }
}
$tests = 0
foreach ($case in @('dirty','wrong-head','existing','success')) {
  $global:dirty = $case -eq 'dirty'; $global:wrongHead = $case -eq 'wrong-head'; $global:existing = $case -eq 'existing'; $global:mutations = 0
  $reservation = Join-Path $fixture "$case.json"
  $failed = $false
  try { & $global:publisher -Phase Reserve -ReservationFile $reservation -SourceCommit $global:source -Version '0.21.532' -Candidate 531 | Out-Null }
  catch { $failed = $true; if ($case -eq 'success') { throw } }
  if ($case -eq 'success') {
    if ($failed -or $global:mutations -ne 1) { throw 'Reservation did not create exactly one draft' }
    $saved = Get-Content -Raw -LiteralPath $reservation | ConvertFrom-Json
    $provenance = Get-Content -Raw -LiteralPath $saved.provenanceFile | ConvertFrom-Json
    if ($saved.releaseId -ne 12345 -or $saved.tag -cne 'v0.21.532-r531.1' -or $provenance.updatedAt -cne '2026-09-06T12:34:56Z' -or $saved.state -cne 'reserved') { throw 'Reservation facts do not match the fake API' }
  } elseif (-not $failed -or $global:mutations -ne 0 -or (Test-Path $reservation)) { throw "Unsafe reservation passed: $case" }
  $tests++
}

function Get-AuthenticodeSignature { [pscustomobject]@{ Status = 'NotSigned' } }
function node { $global:LASTEXITCODE = 0; '{"totals":{"own":{"lines":1},"grand":{"lines":1}},"sourceCommit":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}' }
function powershell.exe {
  $global:LASTEXITCODE = 0
  $output = $args[[Array]::IndexOf($args, '-OutputPath') + 1]
  $proofPath = $args[[Array]::IndexOf($args, '-ProvenancePath') + 1]
  $proof = Get-Content -Raw -LiteralPath $proofPath | ConvertFrom-Json
  if ($proof.cleanOutput -ne $true -or $proof.packagingCommand -ne 'build-installer.bat /s' -or $proof.signing.inputsCleared -ne $true -or $proof.buildLog.path -cne 'installer-build.log') { throw 'Public proof lost required validated fields' }
  @{ version = 1; sourceCommit = $global:source; provenanceSha256 = (Get-FileHash $proofPath -Algorithm SHA256).Hash.ToLowerInvariant(); setup = @{ name = 'setup.exe'; signatureStatus = 'NotSigned' } } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $output -Encoding utf8
}
$global:repoFixture = Join-Path $global:fixture 'source'
$null = New-Item -ItemType Directory -Force -Path (Join-Path $global:repoFixture 'assets/dim-sum/images'), (Join-Path $global:repoFixture 'scripts')
$photo = Join-Path $global:repoFixture 'assets/dim-sum/images/fixture.png'
Add-Type -AssemblyName System.Drawing
$bitmap = New-Object Drawing.Bitmap 2,2
try { $bitmap.Save($photo, [Drawing.Imaging.ImageFormat]::Png) } finally { $bitmap.Dispose() }
$global:photoFixture = $photo
$photoHash = (Get-FileHash $photo -Algorithm SHA256).Hash.ToLowerInvariant()
@{ dishes = @(@{ id = 'fixture-dish'; image = 'images/fixture.png'; sha256 = $photoHash; bytes = (Get-Item $photo).Length; name = @{ en = 'Fixture dish'; zhHant = 'Fixture dish' } }) } | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $global:repoFixture 'assets/dim-sum/index.json') -Encoding utf8
$global:publishFixture = $true
$global:dirty = $false; $global:wrongHead = $false
foreach ($case in @('unknown-asset','wrong-manifest-tag','changed-body','corrupt-download','publish')) {
  $run = Join-Path $global:fixture $case
  $assets = Join-Path $run 'assets'
  $null = New-Item -ItemType Directory -Path $assets -Force
  foreach ($name in @('setup.exe','setup.exe.sha256','RELEASES','material-designer.ico','sample-full.nupkg')) { [IO.File]::WriteAllText((Join-Path $assets $name), 'fixture bytes') }
  $setupHash = (Get-FileHash (Join-Path $assets 'setup.exe') -Algorithm SHA256).Hash.ToLowerInvariant()
  @{ commit = $global:source; version = '0.21.532'; candidate = $(if ($case -eq 'wrong-manifest-tag') { 530 } else { 531 }); signed = $false; signatureStatus = 'NotSigned'; installerFormat = 'squirrel'; provenanceStatus = 'verified'; setup = 'setup.exe'; setupSha256 = $setupHash; setupBytes = 13; fullPackages = @('sample-full.nupkg'); deltaPackages = @() } | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $run 'installer-manifest.json') -Encoding utf8
  @{ releaseVersion = '0.21.532'; platforms = @{ win = @{ artifacts = @{ installer = @{ url = 'https://github.com/Ding-Ding-Projects/material-designer/releases/download/v0.21.532-r531.1/setup.exe' } } } } } | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $assets 'metadata.json') -Encoding utf8
  @{ sourceCommit = $global:source; updatedAt = '2026-09-06T12:34:56Z'; provenanceStatus = 'verified'; cleanOutput = $true; packagingCommand = 'build-installer.bat /s'; signing = @{ inputsCleared = $true; certificateAutoDiscoveryDisabled = $true; processAuditComplete = $false; signerInvocationCount = 0; observedSignerInvocations = @(); controls = @{ forceCodeSigning = $false; signExecutable = $false; signAndEditExecutable = $false } }; liveProof = @{ sessionRoot = 'C:/private-fixture/never-publish' }; buildLog = @{ path = 'C:/private-fixture/raw.log' } } | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $run 'build-provenance.json') -Encoding utf8
  'private-fixture never-publish' | Set-Content (Join-Path $run 'installer-build.log')
  $marker = 'c' * 32
  $body = "Local unsigned Squirrel build in progress. Not published. Source: $global:source. Manual reservation: $marker."
  $provenancePath = Join-Path $global:fixture "$case-provenance.json"
  @{ schemaVersion = 1; sourceCommit = $global:source; version = '0.21.532'; updatedAt = '2026-09-06T12:34:56Z' } | ConvertTo-Json | Set-Content $provenancePath -Encoding utf8
  $reservation = Join-Path $global:fixture "$case-reservation.json"
  @{ schemaVersion = 1; candidate = 531; version = '0.21.532'; sourceCommit = $global:source; marker = $marker; originalBody = $body; releaseId = 12345; publisherLogin = 'fixture-publisher'; tag = 'v0.21.532-r531.1'; createdAt = '2026-09-06T12:34:56Z'; provenancePath = $provenancePath; status = 'draft' } | ConvertTo-Json | Set-Content $reservation -Encoding utf8
  $global:releaseFixture = @{ id = 12345; tag_name = 'v0.21.532-r531.1'; target_commitish = $global:source; author = @{ login = 'fixture-publisher' }; body = $(if ($case -eq 'changed-body') { "$body changed" } else { $body }); draft = $true; prerelease = $false; created_at = '2026-09-06T12:34:56Z'; published_at = $null; assets = @() }
  $global:publishMutations = 0
  $global:corruptDownload = $case -eq 'corrupt-download'
  $global:uploads = @{}
  if ($case -eq 'unknown-asset') { $global:uploads['unknown.txt'] = Join-Path $assets 'setup.exe' }
  $global:mutations = 0
  $notes = Join-Path $run 'notes.md'
  'Changes: fixture build. Known limits: fixture only.' | Set-Content $notes
  $failed = $false
  try { & $global:publisher -Phase Publish -RootReservation -ReleaseNotesFile $notes -ReservationFile $reservation -SourceCommit $global:source -Version '0.21.532' -Candidate 531 -RunDirectory $run -DishId 'hk-dish-0001' -DishName 'Fixture dish' -PhotoUrl 'https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/hk-dish-0001-fixture.png' -PhotoSha256 $photoHash -PhotoBytes (Get-Item $photo).Length | Out-Null }
  catch { $failed = $true; if ($case -eq 'publish') { throw } }
  if ($case -eq 'corrupt-download') { if (-not $failed -or $global:publishMutations -ne 0 -or -not $global:releaseFixture.draft -or (Test-Path (Join-Path $run 'manual-download-verification.json'))) { throw 'Corrupt uploaded bytes reached publication' } }
  elseif ($case -ne 'publish') { if (-not $failed -or $global:mutations) { throw "Unsafe publication passed: $case" } }
  else {
    if ($failed -or $global:releaseFixture.draft -or -not (Test-Path (Join-Path $run 'manual-download-verification.json'))) { throw 'Publication did not verify actual fake-download bytes' }
    foreach ($file in Get-ChildItem (Join-Path $run 'manual-public-assets') -File) { if ($file.Extension -in @('.json','.log') -and ([IO.File]::ReadAllText($file.FullName)).Contains('private-fixture')) { throw 'Raw private fixture content entered public evidence' } }
    if (@($global:uploads.Keys | Where-Object { $_ -match '^(hk-dish|codename)-' }).Count) { throw 'Canonical photo was attached' }
    $publicProof = Join-Path $run 'manual-public-assets/build-provenance.json'
    $publicReceipt = Get-Content -Raw (Join-Path $run 'manual-public-assets/artifact-receipt.json') | ConvertFrom-Json
    if ($publicReceipt.provenanceSha256 -cne (Get-FileHash $publicProof -Algorithm SHA256).Hash.ToLowerInvariant()) { throw 'Receipt refers to different provenance bytes' }
    if ((Get-Content -Raw (Join-Path $run 'installer-build.log')).Trim() -cne 'private-fixture never-publish') { throw 'Raw log was changed' }
  }
  $tests++
}
Write-Output "PASS: $tests executable reservation/publication fixtures; all CLI, signature and validator calls are local fakes."

