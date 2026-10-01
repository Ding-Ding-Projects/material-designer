[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$pages = Get-Content -Raw (Join-Path $repo '.github/workflows/pages.yml')
$release = Get-Content -Raw (Join-Path $repo '.github/workflows/release.yml')
if ($release -match 'steps[.]smoke[.]|launch-smoke[.]json|tools-pack win (?:install|start) --namespace') {
  throw 'Release still runs or requires installed-runtime smoke evidence instead of local verification'
}
$expected = '    if: ${{ (github.event_name == ''push'' && github.ref == ''refs/heads/main'') || (github.event_name == ''workflow_dispatch'' && github.ref == ''refs/heads/main'') || (github.event_name == ''workflow_run'' && github.event.workflow_run.head_branch == ''main'' && github.event.workflow_run.conclusion == ''success'') }}'
$allLines = ($pages -replace "`r`n", "`n") -split "`n"
$deployStart = [array]::IndexOf($allLines, '  deploy:')
if ($deployStart -lt 0) { throw 'Pages deploy job is missing' }
$deploy = $allLines[$deployStart..($allLines.Count - 1)]
if (@($deploy | Where-Object { $_ -match '^    if:' }).Count -ne 1 -or $deploy -notcontains $expected) { throw 'Pages deploy condition is not one exact workflow_run-aware condition' }
$docsStep = $release.Substring($release.IndexOf('      - name: Generate exact in-app documentation bundle'), $release.IndexOf('      - name: Set up pnpm') - $release.IndexOf('      - name: Generate exact in-app documentation bundle'))
if ($docsStep -notmatch 'verify-offline-docs\.ps1' -or $docsStep -match 'generate-(docs|app-docs)-manifest\.ps1') { throw 'Release docs generation does not use the transaction verifier exclusively' }
if ($release -notmatch 'Import-Module \(Join-Path \$env:GITHUB_WORKSPACE ''scripts\\packaging-failure-diagnostics\.psm1''\)' -or $release -notmatch 'Get-PackagingFailureDiagnostics -Records \$buildOutput -ExitCode \$packExitCode -ErrorMessage \$ErrorMessage') { throw 'Release workflow does not invoke the shared production failure serializer' }
Import-Module (Join-Path $PSScriptRoot 'packaging-failure-diagnostics.psm1') -Force
$known = Get-PackagingFailureDiagnostics -Records @('tools-pack win build exited with code 23') -ExitCode 23 -ErrorMessage ''
if ($known -notcontains 'diagnostic=tools-pack-build' -or $known -notcontains 'nativeExitCode=23') { throw 'Known tools-pack failure did not retain actionable safe facts' }
$schema = Get-PackagingFailureDiagnostics -Records @('NU5017 package failure') -ExitCode 1 -ErrorMessage ''
if ($schema -notcontains 'diagnostic=package-schema' -or $schema -notcontains 'errorCode=NU5017') { throw 'Known package schema failure did not retain its safe error code' }
$workspace = Get-PackagingFailureDiagnostics -Records @('C:\runner\work\EntryShell.tsx: Export createEmptyStatusFallback doesn''t exist in module status-hub.ts') -ExitCode 1 -ErrorMessage ''
if ($workspace -notcontains 'diagnostic=missing-web-status-fallback-export' -or (($workspace -join "`n") -match '[A-Z]:\\|EntryShell\.tsx|status-hub\.ts')) { throw 'Known workspace-build failure did not retain only its reviewed safe diagnostic identity' }
$hostile = Get-PackagingFailureDiagnostics -Records @('token=private C:\\runner\\work https://example.invalid/path', ('x' * 400)) -ExitCode 23 -ErrorMessage 'password=private'
if ($hostile -notcontains 'diagnostic=packaging-step-failed' -or (($hostile -join "`n") -match '(?i)token|password|[A-Z]:\\|https?://')) { throw 'Hostile diagnostic record crossed the production serializer boundary' }
Write-Output 'PASS: delivery restoration uses the production serializer, retains known safe failure facts, and excludes hostile diagnostics.'

$many = @(1..200 | ForEach-Object { 'ordinary output' })
$many[199] = 'C:\build\package.nuspec: NU5017 package has no files'
$bounded = Get-PackagingFailureDiagnostics -Records $many -ExitCode 1 -ErrorMessage 'tools-pack win build exited with code 1'
if ($bounded -notcontains 'errorCode=NU5017' -or $bounded -notcontains 'recordsInspected=128' -or $bounded -notcontains 'transcriptTruncated=True') { throw 'Bounded scan lost its exact known cause or record cap' }
if (($bounded -join "`n").Contains('C:\build')) { throw 'A diagnostic path was published' }
$unknown = Get-PackagingFailureDiagnostics -Records @('SQUIRREL_PRIVATE_VALUE') -ExitCode 1 -ErrorMessage ''
if (($unknown -join "`n").Contains('SQUIRREL_PRIVATE_VALUE')) { throw 'Unregistered code crossed the closed diagnostic boundary' }
$priorPreference = $ErrorActionPreference
try {
  $ErrorActionPreference = 'Continue'
  $native = @(& powershell.exe -NoProfile -Command "[Console]::WriteLine('NU5017 package has no files'); exit 23" 2>&1 | ForEach-Object { [string]$_ })
  $nativeCode = $LASTEXITCODE
} finally { $ErrorActionPreference = $priorPreference }
$actual = Get-PackagingFailureDiagnostics -Records $native -ExitCode $nativeCode -ErrorMessage ''
if ($actual -notcontains 'errorCode=NU5017' -or $actual -notcontains 'exitCode=23') { throw 'Real child-process failure did not retain its diagnostic and exit' }
Write-Output 'PASS: bounded production diagnostics retain a real native failure, reject unregistered codes, and omit surrounding paths.'
