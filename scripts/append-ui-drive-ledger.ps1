[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Receipt)
$ErrorActionPreference='Stop'
throw 'Static receipt append is refused. Verified evidence can be appended only by run-approved-ui-drive-live.ps1 while its private in-process capability is active.'
