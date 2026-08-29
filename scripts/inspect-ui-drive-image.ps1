[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string]$ImagePath,
    [int]$MaxBytes = 16777216,
    [int]$MaxWidth = 10000,
    [int]$MaxHeight = 10000,
    [int64]$MaxPixels = 40000000
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ui-drive-evidence-lib.ps1')

$full = Assert-UIPathHasNoReparsePoint -Path $ImagePath
if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { throw 'Image does not exist.' }
$item = Get-Item -LiteralPath $full -Force
if ($item.Length -lt 33 -or $item.Length -gt $MaxBytes) { throw 'PNG byte size is outside the approved bound.' }
$bytes = [IO.File]::ReadAllBytes($full)
$signature = [byte[]](137, 80, 78, 71, 13, 10, 26, 10)
for ($index = 0; $index -lt $signature.Length; $index++) { if ($bytes[$index] -ne $signature[$index]) { throw 'Image is not a PNG.' } }

function Read-BigEndianUInt32([byte[]]$Data, [int]$Offset) {
    return [uint32](([uint32]$Data[$Offset] -shl 24) -bor ([uint32]$Data[$Offset + 1] -shl 16) -bor ([uint32]$Data[$Offset + 2] -shl 8) -bor [uint32]$Data[$Offset + 3])
}

$offset = 8
$width = 0
$height = 0
$sawIhdr = $false
$sawIend = $false
while ($offset -lt $bytes.Length) {
    if (($offset + 12) -gt $bytes.Length) { throw 'PNG contains a truncated chunk header.' }
    $length = [int64](Read-BigEndianUInt32 $bytes $offset)
    if ($length -gt $MaxBytes) { throw 'PNG chunk exceeds the approved byte bound.' }
    $type = [Text.Encoding]::ASCII.GetString($bytes, $offset + 4, 4)
    $next = [int64]$offset + 12 + $length
    if ($next -gt $bytes.Length) { throw 'PNG contains a truncated chunk.' }
    if ($type -in @('tEXt', 'zTXt', 'iTXt')) { throw 'PNG text metadata is not permitted in UI evidence.' }
    if ($type -eq 'IHDR') {
        if ($sawIhdr -or $offset -ne 8 -or $length -ne 13) { throw 'PNG IHDR structure is invalid.' }
        $sawIhdr = $true
        $width = [int64](Read-BigEndianUInt32 $bytes ($offset + 8))
        $height = [int64](Read-BigEndianUInt32 $bytes ($offset + 12))
    }
    if ($type -eq 'IEND') {
        if ($length -ne 0 -or $next -ne $bytes.Length) { throw 'PNG IEND structure is invalid.' }
        $sawIend = $true
        break
    }
    $offset = [int]$next
}
if (-not $sawIhdr -or -not $sawIend) { throw 'PNG is missing a required structural chunk.' }
if ($width -lt 1 -or $height -lt 1 -or $width -gt $MaxWidth -or $height -gt $MaxHeight) { throw 'PNG dimensions are outside the approved bound.' }
$pixels = $width * $height
if ($pixels -gt $MaxPixels) { throw 'PNG decoded pixel count exceeds the approved bound.' }

try { Add-Type -AssemblyName System.Drawing } catch { throw 'The platform PNG decoder is unavailable.' }
$bitmap = $null
try {
    $bitmap = [Drawing.Bitmap]::new($full)
    if ($bitmap.Width -ne $width -or $bitmap.Height -ne $height) { throw 'Decoded PNG dimensions disagree with IHDR.' }
    $first = $bitmap.GetPixel(0, 0).ToArgb()
    $varied = $false
    for ($y = 0; $y -lt $bitmap.Height -and -not $varied; $y++) {
        for ($x = 0; $x -lt $bitmap.Width; $x++) {
            if ($bitmap.GetPixel($x, $y).ToArgb() -ne $first) { $varied = $true; break }
        }
    }
    if (-not $varied) { throw 'Decoded PNG is visually uniform and cannot prove a rendered surface.' }
} finally {
    if ($null -ne $bitmap) { $bitmap.Dispose() }
}

[ordered]@{
    bytes = [int64]$item.Length
    width = [int]$width
    height = [int]$height
    pixels = [int64]$pixels
    sha256 = Get-UIFileSha256 $full
    format = 'png'
    contentVerdict = 'decoded-nonblank-no-text-metadata'
} | ConvertTo-Json -Compress
