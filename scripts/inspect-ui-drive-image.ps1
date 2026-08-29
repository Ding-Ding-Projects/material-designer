[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string]$ImagePath
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath $ImagePath -PathType Leaf)) { throw "Image does not exist." }
$item = Get-Item -LiteralPath $ImagePath -Force
if ($item.LinkType) { throw "Image path must not be a link." }
$bytes = [IO.File]::ReadAllBytes($item.FullName)
$signature = [byte[]](137,80,78,71,13,10,26,10)
$signatureValid = $bytes.Length -ge 24
for ($n = 0; $signatureValid -and $n -lt $signature.Length; $n++) { if ($bytes[$n] -ne $signature[$n]) { $signatureValid = $false } }
if (-not $signatureValid) { throw "Image is not a PNG." }
$width = ([BitConverter]::ToUInt32(@($bytes[19],$bytes[18],$bytes[17],$bytes[16]), 0))
$height = ([BitConverter]::ToUInt32(@($bytes[23],$bytes[22],$bytes[21],$bytes[20]), 0))
if ($width -lt 1 -or $height -lt 1) { throw "PNG dimensions are invalid." }

try { Add-Type -AssemblyName System.Drawing } catch { throw "The platform PNG decoder is unavailable." }
$bitmap = $null
try {
    $bitmap = [Drawing.Bitmap]::new($item.FullName)
    $nonblank = $false
    for ($y = 0; $y -lt $bitmap.Height -and -not $nonblank; $y++) {
        for ($x = 0; $x -lt $bitmap.Width; $x++) {
            if ($bitmap.GetPixel($x, $y).A -gt 0) { $nonblank = $true; break }
        }
    }
} finally { if ($bitmap) { $bitmap.Dispose() } }
$hash = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
[ordered]@{
    width = [int]$width
    height = [int]$height
    sha256 = $hash
    pngSignatureValid = [bool]$signatureValid
    nonblank = [bool]$nonblank
} | ConvertTo-Json -Compress
