[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$SceneId,
    [string]$ReceiptId,
    [string]$ArtifactPath,
    [string]$RepositoryRoot
)
$ErrorActionPreference='Stop'
if([string]::IsNullOrWhiteSpace($RepositoryRoot)){$RepositoryRoot=Split-Path (Split-Path $MyInvocation.MyCommand.Path -Parent) -Parent}
$modulePath=Join-Path $RepositoryRoot 'scripts/ui-drive-live-origin.psm1'
Import-Module $modulePath -Force -ErrorAction Stop
try{
    $result=Invoke-UIApprovedLiveCapture -RepositoryRoot $RepositoryRoot -SceneId $SceneId -ReceiptId $ReceiptId -ArtifactPath $ArtifactPath
    $result|ConvertTo-Json -Depth 10 -Compress
}finally{
    Remove-Module ui-drive-live-origin -Force -ErrorAction SilentlyContinue
}
