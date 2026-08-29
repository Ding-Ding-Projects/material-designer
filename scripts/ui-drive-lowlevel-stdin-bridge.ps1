[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ui-drive-evidence-lib.ps1')

$inputText = [Console]::In.ReadToEnd()
if ([Text.Encoding]::UTF8.GetByteCount($inputText) -gt 65536) { throw 'Live driver request exceeds the stdin protocol bound.' }
$request = ConvertFrom-UIStrictJsonText -Text $inputText -MaxDepth 12 -MaxStringLength 4096 -MaxArrayLength 128 -MaxObjectProperties 64
$names = @($request.PSObject.Properties.Name)
if (@(Compare-Object $names @('protocolVersion','nonce','tool','arguments') -CaseSensitive).Count -ne 0) { throw 'Live driver stdin request has missing or unknown fields.' }
if ($request.protocolVersion -ne 1 -or [string]$request.nonce -notmatch '^[A-Za-z0-9+/]{43}=$') { throw 'Live driver stdin protocol or nonce is invalid.' }
$approvedTools = @('launch_on_headless_desktop','list_headless_windows','mouse_click','win_send_keys','win_set_control_text','screenshot','close_headless_desktop')
if ([string]$request.tool -notin $approvedTools -or $request.arguments -isnot [pscustomobject]) { throw 'Live driver stdin request names an unapproved tool or argument shape.' }

$documents = [Environment]::GetFolderPath([Environment+SpecialFolder]::MyDocuments)
if ([string]::IsNullOrWhiteSpace($documents)) { throw 'Known Documents location is unavailable.' }
$driver = Join-Path $documents 'GitHub/lowlevel-computer-use-mcp/.venv/Scripts/lowlevel-computer-use-cheap.exe'
$driver = Assert-UIPathHasNoReparsePoint -Path $driver
if (-not (Test-Path -LiteralPath $driver -PathType Leaf)) { throw 'The fixed approved cheap Lowlevel executable is unavailable.' }
$driverHash = Get-UIFileSha256 $driver
$driverPathDigestBytes = [Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes(([IO.Path]::GetFullPath($driver).ToLowerInvariant())))
$driverPathDigest = ([BitConverter]::ToString($driverPathDigestBytes)).Replace('-','').ToLowerInvariant()
$argumentsJson = $request.arguments | ConvertTo-Json -Depth 20 -Compress
$requestHashBytes = [Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes(([string]$request.tool + "`n" + $argumentsJson)))
$requestHash = ([BitConverter]::ToString($requestHashBytes)).Replace('-','').ToLowerInvariant()

$previous = $ErrorActionPreference
try {
    $ErrorActionPreference = 'Continue'
    $driverOutput = & $driver ([string]$request.tool) '--json' $argumentsJson 2>&1
    $driverExit = $LASTEXITCODE
} finally { $ErrorActionPreference = $previous }
$driverText = ($driverOutput -join [Environment]::NewLine)
if ([Text.Encoding]::UTF8.GetByteCount($driverText) -gt 1048576) { throw 'Approved driver response exceeds the protocol bound.' }
$driverResult = ConvertFrom-UIStrictJsonText -Text $driverText -MaxDepth 20 -MaxStringLength 8192 -MaxArrayLength 10000 -MaxObjectProperties 256
if ($driverExit -ne 0 -or $driverResult.ok -ne $true) { throw 'Approved cheap Lowlevel driver returned a refused result.' }
$responseHashBytes = [Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($driverText))
$responseHash = ([BitConverter]::ToString($responseHashBytes)).Replace('-','').ToLowerInvariant()

[ordered]@{
    protocolVersion = 1
    nonce = [string]$request.nonce
    tool = [string]$request.tool
    requestSha256 = $requestHash
    responseSha256 = $responseHash
    driverExecutablePathDigest = $driverPathDigest
    driverExecutableSha256 = $driverHash
    driverExitCode = [int]$driverExit
    result = $driverResult
} | ConvertTo-Json -Depth 30 -Compress
