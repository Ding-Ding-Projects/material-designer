[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ui-drive-evidence-lib.ps1')
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('material-designer-ui-drive-reparse-' + [guid]::NewGuid().ToString('N'))
$evidenceRoot = Join-Path $tempRoot 'evidence'
$targetRoot = Join-Path $tempRoot 'target'
$directoryJunction = Join-Path $evidenceRoot 'junction'
$rootJunction = Join-Path $tempRoot 'evidence-root-junction'
$redCount = 0

function Expect-Red([string]$Name, [scriptblock]$Action) {
    try { & $Action; throw "Reparse negative '$Name' stayed green." } catch {
        if ($_.Exception.Message -eq "Reparse negative '$Name' stayed green.") { throw }
        $script:redCount++
        Write-Output "RED: $Name"
    }
}

try {
    New-Item -ItemType Directory -Path $evidenceRoot,$targetRoot -Force | Out-Null
    $targetFile = Join-Path $targetRoot 'value.json'
    [IO.File]::WriteAllText($targetFile, '{"value":1}', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path $directoryJunction -Target $targetRoot | Out-Null
    New-Item -ItemType Junction -Path $rootJunction -Target $evidenceRoot | Out-Null
    Expect-Red 'nested-directory-junction-read' { [void](Resolve-UIEvidencePath -EvidenceRoot $evidenceRoot -Path 'junction/value.json') }
    Expect-Red 'nested-directory-junction-write' { [void](Resolve-UIEvidencePath -EvidenceRoot $evidenceRoot -Path 'junction/new.json' -AllowMissingLeaf) }
    Expect-Red 'evidence-root-junction' { [void](Resolve-UIEvidencePath -EvidenceRoot $rootJunction -Path 'anything.json' -AllowMissingLeaf) }

    $safe = Join-Path $evidenceRoot 'safe.json'
    [IO.File]::WriteAllText($safe, '{"value":1}', [Text.UTF8Encoding]::new($false))
    $resolved = Resolve-UIEvidencePath -EvidenceRoot $evidenceRoot -Path 'safe.json'
    if ($resolved -cne [IO.Path]::GetFullPath($safe)) { throw 'Ordinary non-reparse evidence path did not resolve exactly.' }
    Write-Output "PASS: $redCount junction and generic reparse-component read/write negatives turned red, while one ordinary evidence path stayed green."
} finally {
    foreach ($link in @($directoryJunction,$rootJunction)) {
        if (Test-Path -LiteralPath $link) {
            $item=Get-Item -LiteralPath $link -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) { throw 'Refused to remove a cleanup target that is not a reparse point.' }
            if ($item.PSIsContainer) { [IO.Directory]::Delete($item.FullName,$false) } else { [IO.File]::Delete($item.FullName) }
        }
    }
    if (Test-Path -LiteralPath $tempRoot) {
        $resolved=[IO.Path]::GetFullPath($tempRoot);$prefix=[IO.Path]::GetFullPath([IO.Path]::GetTempPath())
        if(-not $resolved.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)-or [IO.Path]::GetFileName($resolved)-notlike 'material-designer-ui-drive-reparse-*'){throw 'Refused unexpected reparse fixture deletion target.'}
        [IO.Directory]::Delete($resolved,$true)
    }
}
