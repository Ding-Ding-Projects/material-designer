$ErrorActionPreference = 'Stop'
$scratch = Join-Path ([System.IO.Path]::GetTempPath()) ("material-designer-converter-writer-{0}" -f [Guid]::NewGuid().ToString('N'))
$resourceRoot = Join-Path $scratch 'open-design'
$writerRoot = Join-Path $resourceRoot 'bin/converter-writer'
$executable = Join-Path $writerRoot 'material-designer-converter-writer.exe'

function Assert-True([bool]$condition, [string]$message) {
  if (-not $condition) { throw $message }
}

function Read-Exact([System.IO.Stream]$stream, [int]$length) {
  $buffer = [byte[]]::new($length)
  $offset = 0
  while ($offset -lt $length) {
    $read = $stream.Read($buffer, $offset, $length - $offset)
    if ($read -le 0) { throw 'The writer response ended early.' }
    $offset += $read
  }
  return $buffer
}

function Read-Response([System.IO.Stream]$stream) {
  $bytes = Read-Exact $stream 64
  $memory = [System.IO.MemoryStream]::new($bytes, $false)
  $reader = [System.IO.BinaryReader]::new($memory, [Text.Encoding]::UTF8, $true)
  $magic = [Text.Encoding]::ASCII.GetString($reader.ReadBytes(8))
  Assert-True ($magic -eq 'MDCWRES1') 'The writer response magic is invalid.'
  Assert-True ($reader.ReadUInt32() -eq 1) 'The writer response version is invalid.'
  $type = $reader.ReadUInt32()
  $code = $reader.ReadUInt32()
  $messageBytes = $reader.ReadUInt32()
  Assert-True ($messageBytes -le 4096) 'The writer response message exceeds its bound.'
  $volume = $reader.ReadUInt64()
  $fileId = $reader.ReadBytes(16)
  $size = $reader.ReadUInt64()
  $lastWrite = $reader.ReadInt64()
  $message = if ($messageBytes -eq 0) { '' } else { [Text.Encoding]::UTF8.GetString((Read-Exact $stream ([int]$messageBytes))) }
  $reader.Dispose()
  $memory.Dispose()
  return [pscustomobject]@{ Type = $type; Code = $code; Volume = $volume; FileId = $fileId; Size = $size; LastWrite = $lastWrite; Message = $message }
}

function New-RequestBytes(
  [uint32]$operation,
  [uint32]$flags,
  [string]$parent,
  [string]$name,
  [uint32]$deadlineMs,
  [uint64]$maxBytes,
  $expectedParent,
  $expectedChild
) {
  $parentBytes = [Text.Encoding]::UTF8.GetBytes($parent)
  $nameBytes = [Text.Encoding]::UTF8.GetBytes($name)
  $memory = [System.IO.MemoryStream]::new()
  $writer = [System.IO.BinaryWriter]::new($memory, [Text.Encoding]::UTF8, $true)
  $writer.Write([Text.Encoding]::ASCII.GetBytes('MDCWREQ1'))
  $writer.Write([uint32]1)
  $writer.Write($operation)
  $writer.Write($flags)
  $writer.Write([uint32]$parentBytes.Length)
  $writer.Write([uint32]$nameBytes.Length)
  $writer.Write($deadlineMs)
  $writer.Write($maxBytes)
  $writer.Write([uint64]$(if ($null -eq $expectedParent) { 0 } else { $expectedParent.Volume }))
  $writer.Write([byte[]]$(if ($null -eq $expectedParent) { [byte[]]::new(16) } else { $expectedParent.FileId }))
  $writer.Write([uint64]$(if ($null -eq $expectedChild) { 0 } else { $expectedChild.Volume }))
  $writer.Write([byte[]]$(if ($null -eq $expectedChild) { [byte[]]::new(16) } else { $expectedChild.FileId }))
  $writer.Write([uint64]$(if ($null -eq $expectedChild) { 0 } else { $expectedChild.Size }))
  $writer.Write([int64]$(if ($null -eq $expectedChild) { 0 } else { $expectedChild.LastWrite }))
  $writer.Write($parentBytes)
  $writer.Write($nameBytes)
  $writer.Flush()
  $result = $memory.ToArray()
  $writer.Dispose()
  $memory.Dispose()
  Assert-True ($result.Length -eq (104 + $parentBytes.Length + $nameBytes.Length)) 'The writer request frame length is invalid.'
  return $result
}

function Start-Writer([byte[]]$request) {
  $start = [Diagnostics.ProcessStartInfo]::new()
  $start.FileName = $executable
  $start.WorkingDirectory = $writerRoot
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $start.RedirectStandardInput = $true
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  $start.Environment.Clear()
  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $start
  Assert-True $process.Start() 'The writer process did not start.'
  $process.StandardInput.BaseStream.Write($request, 0, $request.Length)
  $process.StandardInput.BaseStream.Flush()
  return [pscustomobject]@{ Process = $process; Input = $process.StandardInput.BaseStream; Output = $process.StandardOutput.BaseStream }
}

function Inspect-Parent([string]$path) {
  $request = New-RequestBytes 1 0 $path '' 5000 0 $null $null
  $running = Start-Writer $request
  $running.Process.StandardInput.Close()
  $response = Read-Response $running.Output
  $running.Process.WaitForExit(5000) | Out-Null
  Assert-True ($response.Type -eq 2 -and $response.Code -eq 1 -and $running.Process.ExitCode -eq 0) ("Parent inspection failed: {0}" -f $response.Message)
  $running.Process.Dispose()
  return $response
}

function Inspect-Child([string]$parent, [string]$name) {
  $request = New-RequestBytes 2 0 $parent $name 5000 0 $null $null
  $running = Start-Writer $request
  $running.Process.StandardInput.Close()
  $response = Read-Response $running.Output
  $running.Process.WaitForExit(5000) | Out-Null
  Assert-True ($response.Type -eq 2 -and ($response.Code -eq 0 -or $response.Code -eq 1) -and $running.Process.ExitCode -eq 0) ("Child inspection failed: {0}" -f $response.Message)
  $running.Process.Dispose()
  return $response
}

function Start-Write([string]$parent, [string]$name, [uint32]$flags, $expectedParent, $expectedChild, [uint32]$deadlineMs = 5000) {
  $request = New-RequestBytes 3 $flags $parent $name $deadlineMs 1048576 $expectedParent $expectedChild
  $running = Start-Writer $request
  $running | Add-Member -NotePropertyName FirstResponse -NotePropertyValue (Read-Response $running.Output)
  return $running
}

function Finish-Write($running, [byte[]]$bytes) {
  Assert-True ($running.FirstResponse.Type -eq 1) ("Writer did not open the parent: {0}" -f $running.FirstResponse.Message)
  $running.Input.WriteByte(1)
  $writer = [System.IO.BinaryWriter]::new($running.Input, [Text.Encoding]::UTF8, $true)
  $writer.Write([uint32]$bytes.Length)
  $writer.Write($bytes)
  $writer.Write([uint32]0)
  $writer.Flush()
  $response = Read-Response $running.Output
  $writer.Dispose()
  $running.Process.StandardInput.Close()
  Assert-True $running.Process.WaitForExit(5000) 'The writer process did not terminate.'
  $running.Process.Dispose()
  return $response
}

function Assert-NoWriterTemps([string]$path) {
  $leftovers = @(Get-ChildItem -LiteralPath $path -Force | Where-Object { $_.Name -like '.material-designer-converter-*' })
  Assert-True ($leftovers.Count -eq 0) ("Writer temporary entries remain in {0}." -f $path)
}

try {
  & (Join-Path $PSScriptRoot 'build-file-converter-windows-writer.ps1') -OutputResourceRoot $resourceRoot -TestFaults | Out-Host
  Assert-True ($LASTEXITCODE -eq 0) 'The focused native writer build failed.'
  $exeBytes = [IO.File]::ReadAllBytes($executable)
  Assert-True ($exeBytes.Length -ge 1024 -and $exeBytes.Length -le 4194304 -and $exeBytes[0] -eq 0x4d -and $exeBytes[1] -eq 0x5a) 'The writer output is not a bounded PE executable.'
  $peOffset = [BitConverter]::ToUInt32($exeBytes, 0x3c)
  Assert-True ($peOffset -ge 0x40 -and $exeBytes[$peOffset] -eq 0x50 -and $exeBytes[$peOffset + 1] -eq 0x45 -and [BitConverter]::ToUInt16($exeBytes, $peOffset + 4) -eq 0x8664) 'The writer output is not an x64 PE executable.'
  $manifest = Get-Content -Raw -LiteralPath (Join-Path $writerRoot 'manifest.json') | ConvertFrom-Json
  Assert-True ($manifest.sha256 -match '^[0-9a-f]{64}$' -and $manifest.sourceSha256 -match '^[0-9a-f]{64}$') 'The writer provenance manifest is incomplete.'

  $caseRoot = Join-Path $scratch 'cases'
  New-Item -ItemType Directory -Force -Path $caseRoot | Out-Null

  $normal = Join-Path $caseRoot 'normal'
  New-Item -ItemType Directory -Path $normal | Out-Null
  $parentWitness = Inspect-Parent $normal
  $write = Start-Write $normal 'output.txt' 1 $parentWitness $null
  $result = Finish-Write $write ([Text.Encoding]::UTF8.GetBytes('normal output'))
  Assert-True ($result.Type -eq 2 -and $result.Code -eq 1) ("Normal write failed: {0}" -f $result.Message)
  Assert-True ((Get-Content -Raw -LiteralPath (Join-Path $normal 'output.txt')) -eq 'normal output') 'Normal output bytes are wrong.'
  Assert-NoWriterTemps $normal

  $identityRoot = Join-Path $caseRoot 'identity-swap'
  $identityApproved = Join-Path $identityRoot 'approved'
  $identityReplacement = Join-Path $identityRoot 'replacement'
  $identityMoved = Join-Path $identityRoot 'approved-moved'
  New-Item -ItemType Directory -Force -Path $identityApproved, $identityReplacement | Out-Null
  $staleParentWitness = Inspect-Parent $identityApproved
  Move-Item -LiteralPath $identityApproved -Destination $identityMoved
  Move-Item -LiteralPath $identityReplacement -Destination $identityApproved
  $identityWrite = Start-Write $identityApproved 'output.txt' 1 $staleParentWitness $null
  Assert-True ($identityWrite.FirstResponse.Type -eq 3) 'A changed approved-parent identity was not refused before temporary creation.'
  $identityWrite.Process.StandardInput.Close()
  $identityWrite.Process.WaitForExit(5000) | Out-Null
  $identityWrite.Process.Dispose()
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $identityApproved 'output.txt'))) 'A changed approved parent received output bytes.'
  Assert-NoWriterTemps $identityApproved
  Assert-NoWriterTemps $identityMoved

  $noReplace = Start-Write $normal 'output.txt' 1 $parentWitness $null
  Assert-True ($noReplace.FirstResponse.Type -eq 3) 'New-output mode did not refuse an existing destination.'
  $noReplace.Process.StandardInput.Close()
  $noReplace.Process.WaitForExit(5000) | Out-Null
  $noReplace.Process.Dispose()
  Assert-True ((Get-Content -Raw -LiteralPath (Join-Path $normal 'output.txt')) -eq 'normal output') 'No-replace refusal changed the destination.'

  $childWitness = Inspect-Child $normal 'output.txt'
  $replace = Start-Write $normal 'output.txt' 7 $parentWitness $childWitness
  $replaceResult = Finish-Write $replace ([Text.Encoding]::UTF8.GetBytes('authorized replacement'))
  Assert-True ($replaceResult.Type -eq 2 -and (Get-Content -Raw -LiteralPath (Join-Path $normal 'output.txt')) -eq 'authorized replacement') 'Authorized replacement did not land.'
  Assert-NoWriterTemps $normal

  $rollbackWitness = Inspect-Child $normal 'output.txt'
  $rollback = Start-Write $normal 'output.txt' 15 $parentWitness $rollbackWitness
  $rollbackResult = Finish-Write $rollback ([Text.Encoding]::UTF8.GetBytes('must roll back'))
  Assert-True ($rollbackResult.Type -eq 3) 'The focused rollback fault did not turn red.'
  Assert-True ((Get-Content -Raw -LiteralPath (Join-Path $normal 'output.txt')) -eq 'authorized replacement') 'Rollback did not restore the authorized original.'
  Assert-NoWriterTemps $normal

  $swapRoot = Join-Path $caseRoot 'rename-swap'
  $approved = Join-Path $swapRoot 'approved'
  $replacement = Join-Path $swapRoot 'replacement'
  $moved = Join-Path $swapRoot 'approved-moved'
  New-Item -ItemType Directory -Force -Path $approved, $replacement | Out-Null
  $approvedWitness = Inspect-Parent $approved
  $swapWrite = Start-Write $approved 'output.txt' 1 $approvedWitness $null
  Assert-True ($swapWrite.FirstResponse.Type -eq 1) 'The rename-swap writer did not retain an opened parent.'
  Move-Item -LiteralPath $approved -Destination $moved
  Move-Item -LiteralPath $replacement -Destination $approved
  $swapResult = Finish-Write $swapWrite ([Text.Encoding]::UTF8.GetBytes('retained handle bytes'))
  Assert-True ($swapResult.Type -eq 2) ("Parent rename-swap write failed: {0}" -f $swapResult.Message)
  Assert-True ((Get-Content -Raw -LiteralPath (Join-Path $moved 'output.txt')) -eq 'retained handle bytes') 'The renamed original parent did not receive output.'
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $approved 'output.txt'))) 'The replacement parent received bytes after a path swap.'
  Assert-NoWriterTemps $moved
  Assert-NoWriterTemps $approved

  $junctionRoot = Join-Path $caseRoot 'junction-swap'
  $junctionApproved = Join-Path $junctionRoot 'approved'
  $junctionReplacement = Join-Path $junctionRoot 'replacement'
  $junctionMoved = Join-Path $junctionRoot 'approved-moved'
  New-Item -ItemType Directory -Force -Path $junctionApproved, $junctionReplacement | Out-Null
  $junctionWitness = Inspect-Parent $junctionApproved
  $junctionWrite = Start-Write $junctionApproved 'output.txt' 1 $junctionWitness $null
  Assert-True ($junctionWrite.FirstResponse.Type -eq 1) 'The junction-swap writer did not retain an opened parent.'
  Move-Item -LiteralPath $junctionApproved -Destination $junctionMoved
  New-Item -ItemType Junction -Path $junctionApproved -Target $junctionReplacement | Out-Null
  $junctionResult = Finish-Write $junctionWrite ([Text.Encoding]::UTF8.GetBytes('junction-safe bytes'))
  Assert-True ($junctionResult.Type -eq 2) ("Parent junction-swap write failed: {0}" -f $junctionResult.Message)
  Assert-True ((Get-Content -Raw -LiteralPath (Join-Path $junctionMoved 'output.txt')) -eq 'junction-safe bytes') 'The original junction-swapped parent did not receive output.'
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $junctionReplacement 'output.txt'))) 'The junction target received bytes after the parent opened.'
  Assert-NoWriterTemps $junctionMoved
  Assert-NoWriterTemps $junctionReplacement

  $cancelRoot = Join-Path $caseRoot 'cancel'
  New-Item -ItemType Directory -Path $cancelRoot | Out-Null
  $cancelWitness = Inspect-Parent $cancelRoot
  $cancel = Start-Write $cancelRoot 'output.txt' 1 $cancelWitness $null
  Assert-True ($cancel.FirstResponse.Type -eq 1) 'The cancellation writer did not open its parent.'
  $cancel.Input.WriteByte(2)
  $cancel.Input.Flush()
  $cancelResponse = Read-Response $cancel.Output
  Assert-True ($cancelResponse.Type -eq 4) 'Cancellation did not return the bounded cancelled state.'
  $cancel.Process.StandardInput.Close()
  $cancel.Process.WaitForExit(5000) | Out-Null
  $cancel.Process.Dispose()
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $cancelRoot 'output.txt'))) 'Cancellation created output bytes.'
  Assert-NoWriterTemps $cancelRoot

  $streamTimeoutRoot = Join-Path $caseRoot 'stream-timeout'
  New-Item -ItemType Directory -Path $streamTimeoutRoot | Out-Null
  $streamTimeoutWitness = Inspect-Parent $streamTimeoutRoot
  $streamTimeout = Start-Write $streamTimeoutRoot 'output.txt' 1 $streamTimeoutWitness $null 300
  Assert-True ($streamTimeout.FirstResponse.Type -eq 1) 'The stream-timeout writer did not open its parent.'
  $streamTimeout.Input.WriteByte(1)
  $partialWriter = [System.IO.BinaryWriter]::new($streamTimeout.Input, [Text.Encoding]::UTF8, $true)
  $partialBytes = [Text.Encoding]::UTF8.GetBytes('partial bytes')
  $partialWriter.Write([uint32]$partialBytes.Length)
  $partialWriter.Write($partialBytes)
  $partialWriter.Flush()
  Start-Sleep -Milliseconds 400
  $streamTimeoutResponse = Read-Response $streamTimeout.Output
  Assert-True ($streamTimeoutResponse.Type -eq 3 -and $streamTimeoutResponse.Code -eq 258) 'A stalled output stream did not fail with WAIT_TIMEOUT.'
  $partialWriter.Dispose()
  $streamTimeout.Process.StandardInput.Close()
  $streamTimeout.Process.WaitForExit(5000) | Out-Null
  $streamTimeout.Process.Dispose()
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $streamTimeoutRoot 'output.txt'))) 'A stalled output stream promoted partial bytes.'
  Assert-NoWriterTemps $streamTimeoutRoot

  $timeoutRoot = Join-Path $caseRoot 'timeout'
  New-Item -ItemType Directory -Path $timeoutRoot | Out-Null
  $timeoutWitness = Inspect-Parent $timeoutRoot
  $timeout = Start-Write $timeoutRoot 'output.txt' 1 $timeoutWitness $null 250
  Assert-True ($timeout.FirstResponse.Type -eq 1) 'The timeout writer did not open its parent.'
  Start-Sleep -Milliseconds 350
  $timeoutResponse = Read-Response $timeout.Output
  Assert-True ($timeoutResponse.Type -eq 3 -and $timeoutResponse.Code -eq 258) 'The helper deadline did not fail with WAIT_TIMEOUT.'
  $timeout.Process.StandardInput.Close()
  $timeout.Process.WaitForExit(5000) | Out-Null
  $timeout.Process.Dispose()
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $timeoutRoot 'output.txt'))) 'Timeout created output bytes.'
  Assert-NoWriterTemps $timeoutRoot

  $reparseRoot = Join-Path $caseRoot 'initial-reparse'
  $realParent = Join-Path $reparseRoot 'real'
  $reparseParent = Join-Path $reparseRoot 'approved'
  New-Item -ItemType Directory -Force -Path $realParent | Out-Null
  New-Item -ItemType Junction -Path $reparseParent -Target $realParent | Out-Null
  $request = New-RequestBytes 3 0 $reparseParent 'output.txt' 1000 1024 $null $null
  $blocked = Start-Writer $request
  $blockedResponse = Read-Response $blocked.Output
  Assert-True ($blockedResponse.Type -eq 3) 'An initial reparse parent was not refused.'
  $blocked.Process.StandardInput.Close()
  $blocked.Process.WaitForExit(5000) | Out-Null
  $blocked.Process.Dispose()
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $realParent 'output.txt'))) 'The refused reparse parent received bytes.'

  $escapeRequest = New-RequestBytes 3 0 $normal '../escape.txt' 1000 1024 $null $null
  $escape = Start-Writer $escapeRequest
  $escapeResponse = Read-Response $escape.Output
  Assert-True ($escapeResponse.Type -eq 3) 'A child path was accepted where one basename was required.'
  $escape.Process.StandardInput.Close()
  $escape.Process.WaitForExit(5000) | Out-Null
  $escape.Process.Dispose()
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $caseRoot 'escape.txt'))) 'An invalid child path escaped the approved parent.'

  Write-Output 'PASS: Windows converter writer native handle-relative regressions'
  Write-Output 'PASS: Windows converter writer executable structure and provenance manifest'
} finally {
  if (Test-Path -LiteralPath $scratch) { Remove-Item -LiteralPath $scratch -Recurse -Force }
}
