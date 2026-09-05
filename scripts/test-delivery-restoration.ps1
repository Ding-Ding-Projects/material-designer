[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$pages = Get-Content -Raw (Join-Path $repo '.github/workflows/pages.yml')
$release = Get-Content -Raw (Join-Path $repo '.github/workflows/release.yml')
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
$hostile = Get-PackagingFailureDiagnostics -Records @('token=private C:\\runner\\work https://example.invalid/path', ('x' * 400)) -ExitCode 23 -ErrorMessage 'password=private'
if ($hostile -notcontains 'diagnostic=packaging-step-failed' -or (($hostile -join "`n") -match '(?i)token|password|[A-Z]:\\|https?://')) { throw 'Hostile diagnostic record crossed the production serializer boundary' }
Write-Output 'PASS: delivery restoration uses the production serializer, retains known safe failure facts, and excludes hostile diagnostics.'
