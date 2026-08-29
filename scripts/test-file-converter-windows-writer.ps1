$ErrorActionPreference = 'Stop'
$scratch = Join-Path ([System.IO.Path]::GetTempPath()) ("material-designer-converter-writer-{0}" -f [Guid]::NewGuid().ToString('N'))
$resourceRoot = Join-Path $scratch 'open-design'
$writerRoot = Join-Path $resourceRoot 'bin/converter-writer'
$executable = Join-Path $writerRoot 'material-designer-converter-writer.exe'
$script:assertionCount = 0

function Assert-True([bool]$condition, [string]$message) {
  $script:assertionCount += 1
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
  [uint32]$inputDeadlineMs,
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
  $writer.Write($inputDeadlineMs)
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

function Start-Write([string]$parent, [string]$name, [uint32]$flags, $expectedParent, $expectedChild, [uint32]$inputDeadlineMs = 5000) {
  $guardianRequest = New-RequestBytes 5 1 $parent '' $inputDeadlineMs 0 $expectedParent $null
  $guardian = Start-Writer $guardianRequest
  $guardianResponse = Read-Response $guardian.Output
  if ($guardianResponse.Type -ne 1) {
    $guardian | Add-Member -NotePropertyName FirstResponse -NotePropertyValue $guardianResponse
    $guardian | Add-Member -NotePropertyName Progress -NotePropertyValue ([Collections.Generic.List[object]]::new())
    $guardian | Add-Member -NotePropertyName Guardian -NotePropertyValue $null
    return $guardian
  }
  $guardian.Input.WriteByte(1)
  $guardian.Input.Flush()
  $guardianReady = Read-Response $guardian.Output
  Assert-True ($guardianReady.Type -eq 5 -and $guardianReady.Message -eq 'guardian-ready') 'The guardian did not acknowledge durable exact-handle authority.'
  $guardianName = $guardianResponse.Message.Substring('guardian:'.Length)
  $running = Start-Writer ([byte[]]::new(0))
  $guardian.Input.WriteByte(3)
  $guardianHandoffWriter = [System.IO.BinaryWriter]::new($guardian.Input, [Text.Encoding]::UTF8, $true)
  $guardianHandoffWriter.Write([uint32]$running.Process.Id)
  $guardianHandoffWriter.Flush()
  $guardianHandoffWriter.Dispose()
  $guardianHandoff = Read-Response $guardian.Output
  Assert-True ($guardianHandoff.Type -eq 5 -and $guardianHandoff.Message -match '^guardian-handoff:[0-9a-f]{16}$') 'The guardian did not duplicate its exact handle into the worker.'
  $workerHandle = $guardianHandoff.Message.Substring('guardian-handoff:'.Length)
  $preparedName = "${name}`n${guardianName}`n$(Native-Identity $guardianResponse)`n${workerHandle}"
  $request = New-RequestBytes 3 $flags $parent $preparedName $inputDeadlineMs 1048576 $expectedParent $expectedChild
  $running.Input.Write($request, 0, $request.Length)
  $running.Input.Flush()
  $progress = [Collections.Generic.List[object]]::new()
  $firstResponse = Read-Response $running.Output
  while ($firstResponse.Type -eq 5) {
    $progress.Add($firstResponse)
    $firstResponse = Read-Response $running.Output
  }
  $running | Add-Member -NotePropertyName FirstResponse -NotePropertyValue $firstResponse
  $running | Add-Member -NotePropertyName Progress -NotePropertyValue $progress
  $running | Add-Member -NotePropertyName Guardian -NotePropertyValue $guardian
  $running | Add-Member -NotePropertyName GuardianResponse -NotePropertyValue $guardianResponse
  if ($running.FirstResponse.Type -eq 1) {
    $running.Input.WriteByte(1)
    $running.Input.Flush()
    $handoff = Read-Response $running.Output
    while ($handoff.Type -eq 5 -and $handoff.Message -ne 'worker-guarded') {
      $running.Progress.Add($handoff)
      $handoff = Read-Response $running.Output
    }
    if ($handoff.Type -eq 5 -and $handoff.Message -eq 'worker-guarded') {
      $running.Progress.Add($handoff)
      Finish-Guardian $running $true
    } else {
      $running.FirstResponse = $handoff
      Finish-Guardian $running $false
    }
  } else {
    Finish-Guardian $running $false
  }
  return $running
}

function Finish-Guardian($running, [bool]$keep) {
  if ($null -eq $running.Guardian) { return }
  $running.Guardian.Input.WriteByte($(if ($keep) { 1 } else { 2 }))
  $running.Guardian.Input.Flush()
  $response = Read-Response $running.Guardian.Output
  $running.Guardian.Process.StandardInput.Close()
  Assert-True $running.Guardian.Process.WaitForExit(5000) 'The exact-handle guardian did not terminate.'
  $running.Guardian.Process.Dispose()
  Assert-True ($response.Type -eq 2) ("The exact-handle guardian failed ({0}): {1}" -f $response.Code, $response.Message)
  $running.Guardian = $null
}

function Read-TerminalResponse($running) {
  for (;;) {
    $response = Read-Response $running.Output
    if ($response.Type -eq 5) {
      $running.Progress.Add($response)
      continue
    }
    return $response
  }
}

function Wait-ForProgress($running, [string]$message) {
  for (;;) {
    $response = Read-Response $running.Output
    Assert-True ($response.Type -eq 5) ("Expected progress '{0}', received terminal response: {1}" -f $message, $response.Message)
    $running.Progress.Add($response)
    if ($response.Message -eq $message -or $response.Message.StartsWith("${message}:")) { return $response }
  }
}

function Finish-Write($running, [byte[]]$bytes) {
  Assert-True ($running.FirstResponse.Type -eq 1) ("Writer did not open the parent ({0}): {1}" -f $running.FirstResponse.Code, $running.FirstResponse.Message)
  $running.Input.WriteByte(1)
  $writer = [System.IO.BinaryWriter]::new($running.Input, [Text.Encoding]::UTF8, $true)
  $writer.Write([uint32]$bytes.Length)
  $writer.Write($bytes)
  $writer.Write([uint32]0)
  $writer.Flush()
  $response = Read-TerminalResponse $running
  $writer.Dispose()
  $running.Process.StandardInput.Close()
  Assert-True $running.Process.WaitForExit(5000) 'The writer process did not terminate.'
  $running.Process.Dispose()
  Finish-Guardian $running ($response.Type -eq 2)
  return $response
}

function Continue-WithoutPayload($running) {
  Assert-True ($running.FirstResponse.Type -eq 1) ("Writer did not open the parent: {0}" -f $running.FirstResponse.Message)
  $running.Input.WriteByte(1)
  $running.Input.Flush()
  $response = Read-TerminalResponse $running
  $running.Process.StandardInput.Close()
  Assert-True $running.Process.WaitForExit(5000) 'The writer process did not terminate after its initial disposition result.'
  $running.Process.Dispose()
  Finish-Guardian $running $false
  return $response
}

function Native-Identity($response) {
  $volume = $response.Volume.ToString('x16')
  $fileId = -join @($response.FileId | ForEach-Object { $_.ToString('x2') })
  return "${volume}:${fileId}"
}

function Recovery-Entry($parent, $destinationName, $parentWitness, $entry, $promoted, [bool]$rollback, [bool]$temporaryTransition = $false) {
  $flags = [uint32]3
  $name = $entry.Message.Substring($entry.Message.IndexOf(':') + 1)
  if ($entry.Message.StartsWith('backup-intent:') -or $entry.Message.StartsWith('backup:') -or $temporaryTransition) {
    $flags = $flags -bor [uint32]4
    if ($rollback) { $flags = $flags -bor [uint32]8 }
    if ($temporaryTransition) { $flags = $flags -bor [uint32]16 }
    $promotedIdentity = if ($null -eq $promoted) { '' } else { Native-Identity $promoted }
    $name = "${name}`n${destinationName}`n${promotedIdentity}"
  }
  $request = New-RequestBytes 4 $flags $parent $name 5000 0 $parentWitness $entry
  $running = Start-Writer $request
  $running.Process.StandardInput.Close()
  $response = Read-Response $running.Output
  Assert-True $running.Process.WaitForExit(5000) 'The recovery helper did not terminate.'
  $running.Process.Dispose()
  return $response
}

function Recovery-ById($parent, $parentWitness, [string]$name, $witness) {
  $request = New-RequestBytes 6 1 $parent "${name}`n$(Native-Identity $witness)" 5000 0 $parentWitness $null
  $running = Start-Writer $request
  $running.Process.StandardInput.Close()
  $response = Read-Response $running.Output
  Assert-True $running.Process.WaitForExit(5000) 'The exact file-ID recovery helper did not terminate.'
  $running.Process.Dispose()
  return $response
}

function Recover-KilledWrite($parent, $destinationName, $parentWitness, $progress) {
  $backup = @($progress | Where-Object { $_.Message.StartsWith('backup-intent:') -or $_.Message.StartsWith('backup:') } | Select-Object -Last 1)
  $temporary = @($progress | Where-Object { $_.Message.StartsWith('temp-intent:') -or $_.Message.StartsWith('temp-recovery:') -or $_.Message.StartsWith('temp:') -or $_.Message.StartsWith('flushed:') } | Select-Object -Last 1)
  $promotionIntent = @($progress | Where-Object { $_.Message.StartsWith('promotion-intent:') } | Select-Object -Last 1)
  $promoted = @($progress | Where-Object { $_.Message -eq 'promoted' } | Select-Object -Last 1)
  $rollback = @($progress | Where-Object { $_.Message -eq 'rollback' }).Count -gt 0
  if ($backup.Count -eq 1) {
    $knownPromotion = if ($promoted.Count -eq 1) { $promoted[0] } elseif ($promotionIntent.Count -eq 1) { $promotionIntent[0] } else { $null }
    $response = Recovery-Entry $parent $destinationName $parentWitness $backup[0] $knownPromotion $rollback
    Assert-True ($response.Type -eq 2) ("Authenticated backup recovery failed ({0}): {1}" -f $response.Code, $response.Message)
  } elseif ($promotionIntent.Count -eq 1) {
    $response = Recovery-Entry $parent $destinationName $parentWitness $promotionIntent[0] $promotionIntent[0] $false $true
    Assert-True ($response.Type -eq 2) ("Authenticated promotion recovery failed ({0}): {1}" -f $response.Code, $response.Message)
  }
  if ($temporary.Count -eq 1) {
    $response = Recovery-Entry $parent $destinationName $parentWitness $temporary[0] $null $false
    Assert-True ($response.Type -eq 2) ("Authenticated temporary recovery failed ({0}): {1}" -f $response.Code, $response.Message)
  }
}

function Write-PayloadFrames($running, [byte[]]$bytes, [bool]$complete = $true) {
  $running.Input.WriteByte(1)
  $writer = [System.IO.BinaryWriter]::new($running.Input, [Text.Encoding]::UTF8, $true)
  $writer.Write([uint32]$bytes.Length)
  $writer.Write($bytes)
  if ($complete) { $writer.Write([uint32]0) }
  $writer.Flush()
  return $writer
}

function Kill-Writer($running) {
  $running.Process.Kill()
  Assert-True $running.Process.WaitForExit(5000) 'The forced-kill helper did not terminate.'
  $running.Input.Dispose()
  $running.Output.Dispose()
  $running.Process.Dispose()
  Finish-Guardian $running $false
}

function Dispose-KilledFrame($writer) {
  try { $writer.Dispose() } catch [ObjectDisposedException] { } catch [IO.IOException] { }
}

function Assert-NoWriterTemps([string]$path) {
  $leftovers = @(Get-ChildItem -LiteralPath $path -Force | Where-Object { $_.Name -like '.material-designer-converter-*' })
  Assert-True ($leftovers.Count -eq 0) ("Writer temporary entries remain in {0}." -f $path)
}

function Remove-ScratchWithRetry([string]$path) {
  if (-not (Test-Path -LiteralPath $path)) { return }
  for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
    try {
      Remove-Item -LiteralPath $path -Recurse -Force
      return
    } catch {
      if ($attempt -eq 39) { throw }
      Start-Sleep -Milliseconds 250
    }
  }
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
  Assert-True ($result.Type -eq 2 -and $result.Code -eq 1) ("Normal write failed ({0}): {1}" -f $result.Code, $result.Message)
  Assert-True ((Get-Content -Raw -LiteralPath (Join-Path $normal 'output.txt')) -eq 'normal output') 'Normal output bytes are wrong.'
  $normalEaOutput = (& fsutil file queryEA (Join-Path $normal 'output.txt') 2>&1 | Out-String)
  Assert-True (-not $normalEaOutput.Contains('MDCW.RECOVERY')) 'Final promoted output retained a recovery EA marker.'
  Assert-NoWriterTemps $normal

  $dispositionTransientRoot = Join-Path $caseRoot 'initial-disposition-transient'
  New-Item -ItemType Directory -Path $dispositionTransientRoot | Out-Null
  $dispositionTransientParent = Inspect-Parent $dispositionTransientRoot
  $dispositionTransient = Start-Write $dispositionTransientRoot 'output.txt' 16777217 $dispositionTransientParent $null
  $dispositionTransientResult = Finish-Write $dispositionTransient ([Text.Encoding]::UTF8.GetBytes('transient disposition output'))
  Assert-True ($dispositionTransientResult.Type -eq 2) 'Initial delete-pending transient retries did not converge.'
  Assert-True (@($dispositionTransient.Progress | Where-Object { $_.Message.StartsWith('temp-intent:') }).Count -eq 1) 'Initial delete-pending retry did not emit its write-ahead receipt.'
  Assert-True (@($dispositionTransient.Progress | Where-Object { $_.Message -eq 'test-initial-disposition-retry' }).Count -eq 1) 'The injected initial sharing retries did not execute.'
  Assert-True ((Get-Content -Raw -LiteralPath (Join-Path $dispositionTransientRoot 'output.txt')) -eq 'transient disposition output') 'Transient delete-pending retries changed the output bytes.'
  Assert-NoWriterTemps $dispositionTransientRoot

  $dispositionPermanentRoot = Join-Path $caseRoot 'initial-disposition-permanent'
  New-Item -ItemType Directory -Path $dispositionPermanentRoot | Out-Null
  $dispositionPermanentParent = Inspect-Parent $dispositionPermanentRoot
  $dispositionPermanent = Start-Write $dispositionPermanentRoot 'output.txt' 33554433 $dispositionPermanentParent $null
  $dispositionPermanentResult = $dispositionPermanent.FirstResponse
  $dispositionPermanent.Process.StandardInput.Close()
  $dispositionPermanent.Process.WaitForExit(5000) | Out-Null
  $dispositionPermanent.Process.Dispose()
  Assert-True ($dispositionPermanentResult.Type -eq 3) 'A permanent initial delete-pending refusal did not fail closed.'
  Assert-True (@($dispositionPermanent.Progress | Where-Object { $_.Message.StartsWith('temp-intent:') }).Count -eq 0) 'Permanent initial delete-pending refusal emitted a worker intent after guardian cleanup.'
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $dispositionPermanentRoot 'output.txt'))) 'Permanent initial delete-pending refusal created output.'
  Assert-NoWriterTemps $dispositionPermanentRoot

  $dispositionRecoveryRoot = Join-Path $caseRoot 'initial-disposition-recovery'
  New-Item -ItemType Directory -Path $dispositionRecoveryRoot | Out-Null
  $dispositionRecoveryParent = Inspect-Parent $dispositionRecoveryRoot
  $dispositionRecovery = Start-Write $dispositionRecoveryRoot 'output.txt' 67108865 $dispositionRecoveryParent $null
  $dispositionRecoveryResult = $dispositionRecovery.FirstResponse
  $dispositionRecovery.Process.StandardInput.Close()
  $dispositionRecovery.Process.WaitForExit(5000) | Out-Null
  $dispositionRecovery.Process.Dispose()
  Assert-True ($dispositionRecoveryResult.Type -eq 3) 'Permanent initial disposition and cleanup interference did not fail closed.'
  Assert-True (@($dispositionRecovery.Progress | Where-Object { $_.Message.StartsWith('temp-recovery:') }).Count -eq 1) 'Permanent initial cleanup interference omitted its active recovery receipt.'
  Recover-KilledWrite $dispositionRecoveryRoot 'output.txt' $dispositionRecoveryParent $dispositionRecovery.Progress
  Recover-KilledWrite $dispositionRecoveryRoot 'output.txt' $dispositionRecoveryParent $dispositionRecovery.Progress
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $dispositionRecoveryRoot 'output.txt'))) 'Initial disposition recovery created output.'
  Assert-NoWriterTemps $dispositionRecoveryRoot

  $preIntentKillRoot = Join-Path $caseRoot 'forced-kill-after-create-before-intent'
  New-Item -ItemType Directory -Path $preIntentKillRoot | Out-Null
  $preIntentUnrelated = Join-Path $preIntentKillRoot 'unrelated.txt'
  [IO.File]::WriteAllText($preIntentUnrelated, 'unrelated bytes stay put')
  $preIntentKillParent = Inspect-Parent $preIntentKillRoot
  $guardianRequest = New-RequestBytes 5 536870913 $preIntentKillRoot '' 5000 0 $preIntentKillParent $null
  $preIntentGuardian = Start-Writer $guardianRequest
  $preIntentBarrier = Read-Response $preIntentGuardian.Output
  Assert-True ($preIntentBarrier.Type -eq 5 -and $preIntentBarrier.Message.StartsWith('test-created-before-intent:')) 'The guardian did not pause immediately after FILE_CREATE.'
  $preIntentTemporaryName = $preIntentBarrier.Message.Substring('test-created-before-intent:'.Length)
  $preIntentOriginal = Join-Path $preIntentKillRoot $preIntentTemporaryName
  $preIntentGuardian.Process.Kill()
  Assert-True $preIntentGuardian.Process.WaitForExit(5000) 'The guardian self-crash process did not terminate.'
  $preIntentGuardian.Process.Dispose()
  Assert-True (-not (Test-Path -LiteralPath $preIntentOriginal)) 'Create-time delete-on-close left residue after guardian self-crash.'
  Assert-True ((Get-Content -Raw -LiteralPath $preIntentUnrelated) -eq 'unrelated bytes stay put') 'Guardian self-crash cleanup touched an unrelated sibling.'

  $cloneGuardian = Start-Writer $guardianRequest
  $cloneBarrier = Read-Response $cloneGuardian.Output
  Assert-True ($cloneBarrier.Type -eq 5 -and $cloneBarrier.Message.StartsWith('test-created-before-intent:')) 'The clone guardian did not pause after FILE_CREATE.'
  $preIntentTemporaryName = $cloneBarrier.Message.Substring('test-created-before-intent:'.Length)
  $preIntentOriginal = Join-Path $preIntentKillRoot $preIntentTemporaryName
  Assert-True (Test-Path -LiteralPath $preIntentOriginal) 'The guardian-created temporary could not be enumerated for the clone attack.'
  $preIntentAcl = Get-Acl -LiteralPath $preIntentOriginal
  $preIntentClone = Join-Path $preIntentKillRoot 'metadata-clone.tmp'
  Copy-Item -LiteralPath $preIntentOriginal -Destination $preIntentClone
  Set-Acl -LiteralPath $preIntentClone -AclObject $preIntentAcl
  $eaOutput = (& fsutil file queryEA $preIntentOriginal 2>&1 | Out-String)
  Assert-True (-not $eaOutput.Contains('MDCW.RECOVERY')) 'The guardian temporary exposed a copyable recovery EA.'
  $dummyWorker = Start-Writer ([byte[]]::new(0))
  $dummyWorker.Process.Kill()
  Assert-True $dummyWorker.Process.WaitForExit(5000) 'The separate worker did not terminate during the pre-intent kill.'
  $dummyWorker.Process.Dispose()
  $cloneGuardian.Input.WriteByte(1)
  $cloneGuardian.Input.Flush()
  $guardianOpened = Read-Response $cloneGuardian.Output
  Assert-True ($guardianOpened.Type -eq 1 -and $guardianOpened.Message -eq "guardian:${preIntentTemporaryName}") 'The retained guardian did not survive the worker kill.'
  $cloneGuardian.Input.WriteByte(1)
  $cloneGuardian.Input.Flush()
  $guardianReady = Read-Response $cloneGuardian.Output
  Assert-True ($guardianReady.Type -eq 5 -and $guardianReady.Message -eq 'guardian-ready') 'The retained guardian did not enter durable hold state after host acknowledgement.'
  $preIntentMovedOriginal = Join-Path $preIntentKillRoot 'guardian-original-moved.tmp'
  Move-Item -LiteralPath $preIntentOriginal -Destination $preIntentMovedOriginal
  Move-Item -LiteralPath $preIntentClone -Destination $preIntentOriginal
  $cloneGuardian.Input.WriteByte(2)
  $cloneGuardian.Input.Flush()
  $guardianCleaned = Read-Response $cloneGuardian.Output
  $cloneGuardian.Process.StandardInput.Close()
  Assert-True $cloneGuardian.Process.WaitForExit(5000) 'The retained guardian did not terminate after exact cleanup.'
  $cloneGuardian.Process.Dispose()
  Assert-True ($guardianCleaned.Type -eq 2) ("The retained guardian cleanup failed: {0}" -f $guardianCleaned.Message)
  Assert-True (-not (Test-Path -LiteralPath $preIntentMovedOriginal)) 'The guardian did not delete the exact original handle after its name changed.'
  Assert-True ((Get-Item -LiteralPath $preIntentOriginal).Length -eq 0) 'The guardian changed the cloned same-name substitute.'
  Assert-True ((Get-Content -Raw -LiteralPath $preIntentUnrelated) -eq 'unrelated bytes stay put') 'Guardian cleanup touched an unrelated sibling.'
  $emptyProgress = [Collections.Generic.List[object]]::new()
  Recover-KilledWrite $preIntentKillRoot 'output.txt' $preIntentKillParent $emptyProgress
  Recover-KilledWrite $preIntentKillRoot 'output.txt' $preIntentKillParent $emptyProgress
  Assert-True ((Get-Item -LiteralPath $preIntentOriginal).Length -eq 0) 'Repeated receipt recovery changed the metadata-cloned substitute.'
  Remove-Item -LiteralPath $preIntentOriginal -Force
  Assert-NoWriterTemps $preIntentKillRoot

  $readyFailureRoot = Join-Path $caseRoot 'guardian-clear-before-ready-kill'
  New-Item -ItemType Directory -Path $readyFailureRoot | Out-Null
  $readyFailureUnrelated = Join-Path $readyFailureRoot 'unrelated.txt'
  [IO.File]::WriteAllText($readyFailureUnrelated, 'ready failure unrelated bytes')
  $readyFailureParent = Inspect-Parent $readyFailureRoot
  $readyFailureRequest = New-RequestBytes 5 1073741825 $readyFailureRoot '' 5000 0 $readyFailureParent $null
  $readyFailureGuardian = Start-Writer $readyFailureRequest
  $readyFailureOpened = Read-Response $readyFailureGuardian.Output
  Assert-True ($readyFailureOpened.Type -eq 1 -and $readyFailureOpened.Message.StartsWith('guardian:')) 'The readiness-failure guardian did not publish provisional identity.'
  $readyFailureName = $readyFailureOpened.Message.Substring('guardian:'.Length)
  $readyFailureGuardian.Input.WriteByte(1)
  $readyFailureGuardian.Input.Flush()
  $readyFailureBarrier = Read-Response $readyFailureGuardian.Output
  Assert-True ($readyFailureBarrier.Type -eq 5 -and $readyFailureBarrier.Message -eq 'test-guardian-cleared-before-ready') 'The guardian did not pause after hold-handle disposition clear.'
  $readyFailureGuardian.Process.Kill()
  Assert-True $readyFailureGuardian.Process.WaitForExit(5000) 'The post-clear guardian did not terminate.'
  $readyFailureGuardian.Process.Dispose()
  $readyFailureOriginal = Join-Path $readyFailureRoot $readyFailureName
  Assert-True (Test-Path -LiteralPath $readyFailureOriginal) 'The provisional durable object was unavailable for exact-ID recovery.'
  $readyFailureClone = Join-Path $readyFailureRoot 'ready-metadata-clone.tmp'
  Copy-Item -LiteralPath $readyFailureOriginal -Destination $readyFailureClone
  Set-Acl -LiteralPath $readyFailureClone -AclObject (Get-Acl -LiteralPath $readyFailureOriginal)
  $readyFailureMoved = Join-Path $readyFailureRoot 'ready-original-moved.tmp'
  Move-Item -LiteralPath $readyFailureOriginal -Destination $readyFailureMoved
  Move-Item -LiteralPath $readyFailureClone -Destination $readyFailureOriginal
  $readyFailureRecovery = Recovery-ById $readyFailureRoot $readyFailureParent $readyFailureName $readyFailureOpened
  $readyFailureRecoveryAgain = Recovery-ById $readyFailureRoot $readyFailureParent $readyFailureName $readyFailureOpened
  Assert-True ($readyFailureRecovery.Type -eq 2 -and $readyFailureRecoveryAgain.Type -eq 2) ("Exact file-ID readiness recovery was not idempotent: first {0}/{1}; second {2}/{3}" -f $readyFailureRecovery.Code, $readyFailureRecovery.Message, $readyFailureRecoveryAgain.Code, $readyFailureRecoveryAgain.Message)
  Assert-True (-not (Test-Path -LiteralPath $readyFailureMoved)) 'Exact file-ID recovery left the moved guardian original.'
  Assert-True ((Get-Item -LiteralPath $readyFailureOriginal).Length -eq 0) 'Exact file-ID recovery changed the same-name clone.'
  Assert-True ((Get-Content -Raw -LiteralPath $readyFailureUnrelated) -eq 'ready failure unrelated bytes') 'Exact file-ID recovery touched an unrelated sibling.'
  Remove-Item -LiteralPath $readyFailureOriginal -Force
  Assert-NoWriterTemps $readyFailureRoot

  $handoffRoot = Join-Path $caseRoot 'handoff-clone-before-worker-guarded'
  New-Item -ItemType Directory -Path $handoffRoot | Out-Null
  $handoffUnrelated = Join-Path $handoffRoot 'unrelated.txt'
  [IO.File]::WriteAllText($handoffUnrelated, 'handoff unrelated bytes')
  $handoffParent = Inspect-Parent $handoffRoot
  $handoffGuardianRequest = New-RequestBytes 5 1 $handoffRoot '' 5000 0 $handoffParent $null
  $handoffGuardian = Start-Writer $handoffGuardianRequest
  $handoffGuardianOpened = Read-Response $handoffGuardian.Output
  Assert-True ($handoffGuardianOpened.Type -eq 1 -and $handoffGuardianOpened.Message.StartsWith('guardian:')) 'The handoff guardian did not publish exact authority.'
  $handoffName = $handoffGuardianOpened.Message.Substring('guardian:'.Length)
  $handoffGuardian.Input.WriteByte(1)
  $handoffGuardian.Input.Flush()
  $handoffGuardianReady = Read-Response $handoffGuardian.Output
  Assert-True ($handoffGuardianReady.Type -eq 5 -and $handoffGuardianReady.Message -eq 'guardian-ready') 'The handoff guardian did not reach durable hold state.'
  $handoffWorker = Start-Writer ([byte[]]::new(0))
  $handoffGuardian.Input.WriteByte(3)
  $handoffPidWriter = [System.IO.BinaryWriter]::new($handoffGuardian.Input, [Text.Encoding]::UTF8, $true)
  $handoffPidWriter.Write([uint32]$handoffWorker.Process.Id)
  $handoffPidWriter.Flush()
  $handoffPidWriter.Dispose()
  $handoffHandleResponse = Read-Response $handoffGuardian.Output
  Assert-True ($handoffHandleResponse.Type -eq 5 -and $handoffHandleResponse.Message -match '^guardian-handoff:[0-9a-f]{16}$') 'The guardian did not duplicate its exact handle before the clone race.'
  $handoffWorkerHandle = $handoffHandleResponse.Message.Substring('guardian-handoff:'.Length)
  Assert-True (-not $handoffGuardian.Process.HasExited) 'The guardian released before worker-guarded acknowledgement.'
  $handoffOriginal = Join-Path $handoffRoot $handoffName
  $handoffClone = Join-Path $handoffRoot 'handoff-metadata-clone.tmp'
  Copy-Item -LiteralPath $handoffOriginal -Destination $handoffClone
  Set-Acl -LiteralPath $handoffClone -AclObject (Get-Acl -LiteralPath $handoffOriginal)
  $handoffMovedOriginal = Join-Path $handoffRoot 'handoff-original-moved.tmp'
  Move-Item -LiteralPath $handoffOriginal -Destination $handoffMovedOriginal
  Move-Item -LiteralPath $handoffClone -Destination $handoffOriginal
  $handoffPrepared = "output.txt`n${handoffName}`n$(Native-Identity $handoffGuardianOpened)`n${handoffWorkerHandle}"
  $handoffWorkerRequest = New-RequestBytes 3 1 $handoffRoot $handoffPrepared 5000 1048576 $handoffParent $null
  $handoffWorker.Input.Write($handoffWorkerRequest, 0, $handoffWorkerRequest.Length)
  $handoffWorker.Input.Flush()
  $handoffWorkerOpened = Read-Response $handoffWorker.Output
  Assert-True ($handoffWorkerOpened.Type -eq 1) 'The handoff worker did not open its retained parent.'
  $handoffWorker.Input.WriteByte(1)
  $handoffWorker.Input.Flush()
  $handoffGuarded = Read-Response $handoffWorker.Output
  Assert-True ($handoffGuarded.Type -eq 5 -and $handoffGuarded.Message -eq 'worker-guarded') 'The worker did not acquire the moved original by exact file ID.'
  $handoffGuardian.Input.WriteByte(1)
  $handoffGuardian.Input.Flush()
  $handoffGuardianCleaned = Read-Response $handoffGuardian.Output
  $handoffGuardian.Process.StandardInput.Close()
  $handoffGuardian.Process.WaitForExit(5000) | Out-Null
  $handoffGuardian.Process.Dispose()
  Assert-True ($handoffGuardianCleaned.Type -eq 2) 'The guardian could not release after worker-guarded.'
  $handoffWorker.Input.WriteByte(1)
  $handoffWorker.Input.Flush()
  $handoffPayload = [System.IO.BinaryWriter]::new($handoffWorker.Input, [Text.Encoding]::UTF8, $true)
  $handoffBytes = [Text.Encoding]::UTF8.GetBytes('exact moved original output')
  $handoffPayload.Write([uint32]$handoffBytes.Length)
  $handoffPayload.Write($handoffBytes)
  $handoffPayload.Write([uint32]0)
  $handoffPayload.Flush()
  $handoffWorkerResult = Read-TerminalResponse ([pscustomobject]@{ Output = $handoffWorker.Output; Progress = [Collections.Generic.List[object]]::new() })
  $handoffPayload.Dispose()
  $handoffWorker.Process.StandardInput.Close()
  $handoffWorker.Process.WaitForExit(5000) | Out-Null
  $handoffWorker.Process.Dispose()
  Assert-True ($handoffWorkerResult.Type -eq 2) ("The worker did not continue through its retained exact handle: {0}" -f $handoffWorkerResult.Message)
  Assert-True (-not (Test-Path -LiteralPath $handoffMovedOriginal)) 'The moved original remained after exact-handle promotion.'
  Assert-True ((Get-Content -Raw -LiteralPath (Join-Path $handoffRoot 'output.txt')) -eq 'exact moved original output') 'The retained exact handle did not produce the final output.'
  Assert-True ((Get-Item -LiteralPath $handoffOriginal).Length -eq 0) 'The cloned substitute changed during exact-handle recovery.'
  Assert-True ((Get-Content -Raw -LiteralPath $handoffUnrelated) -eq 'handoff unrelated bytes') 'Handoff recovery touched an unrelated sibling.'
  Remove-Item -LiteralPath $handoffOriginal -Force
  Assert-NoWriterTemps $handoffRoot

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
  $rollback = Start-Write $normal 'output.txt' 65543 $parentWitness $rollbackWitness
  $rollbackResult = Finish-Write $rollback ([Text.Encoding]::UTF8.GetBytes('must roll back'))
  Assert-True ($rollbackResult.Type -eq 3) 'The focused rollback fault did not turn red.'
  Assert-True ((Get-Content -Raw -LiteralPath (Join-Path $normal 'output.txt')) -eq 'authorized replacement') 'Rollback did not restore the authorized original.'
  Assert-NoWriterTemps $normal

  $childSwapRoot = Join-Path $caseRoot 'child-swap-after-opened'
  New-Item -ItemType Directory -Path $childSwapRoot | Out-Null
  $childSwapPath = Join-Path $childSwapRoot 'output.txt'
  [IO.File]::WriteAllText($childSwapPath, 'approved original')
  $childSwapParent = Inspect-Parent $childSwapRoot
  $childSwapWitness = Inspect-Child $childSwapRoot 'output.txt'
  $childSwapWrite = Start-Write $childSwapRoot 'output.txt' 7 $childSwapParent $childSwapWitness
  Assert-True ($childSwapWrite.FirstResponse.Type -eq 1) 'The child-swap writer did not reach RESPONSE_OPENED.'
  Move-Item -LiteralPath $childSwapPath -Destination (Join-Path $childSwapRoot 'externally-moved.txt')
  [IO.File]::WriteAllText($childSwapPath, 'independent substitute')
  $childSwapResult = Finish-Write $childSwapWrite ([Text.Encoding]::UTF8.GetBytes('must not replace substitute'))
  Assert-True ($childSwapResult.Type -eq 3) 'An after-RESPONSE_OPENED child substitution was not refused.'
  Assert-True ((Get-Content -Raw -LiteralPath $childSwapPath) -eq 'independent substitute') 'The independently substituted child was touched.'
  $childSwapBackup = @($childSwapWrite.Progress | Where-Object { $_.Message.StartsWith('backup:') } | Select-Object -Last 1)
  Assert-True ($childSwapBackup.Count -eq 1) 'The child-swap refusal did not emit an authenticated rollback receipt.'
  $blockedRecovery = Recovery-Entry $childSwapRoot 'output.txt' $childSwapParent $childSwapBackup[0] $null $false
  Assert-True ($blockedRecovery.Type -eq 3) 'Recovery did not leave the independently substituted child untouched.'
  Assert-True ((Get-Content -Raw -LiteralPath $childSwapPath) -eq 'independent substitute') 'Blocked recovery changed the independently substituted child.'
  Remove-Item -LiteralPath $childSwapPath -Force
  Recover-KilledWrite $childSwapRoot 'output.txt' $childSwapParent $childSwapWrite.Progress
  Assert-True ((Get-Content -Raw -LiteralPath $childSwapPath) -eq 'approved original') 'The authenticated original was not restored after the substitute was removed.'
  Assert-NoWriterTemps $childSwapRoot

  $childMutateWitness = Inspect-Child $childSwapRoot 'output.txt'
  $childMutate = Start-Write $childSwapRoot 'output.txt' 7 $childSwapParent $childMutateWitness
  Assert-True ($childMutate.FirstResponse.Type -eq 1) 'The child-mutation writer did not reach RESPONSE_OPENED.'
  $childMutateBytes = [Text.Encoding]::UTF8.GetBytes('mutated after acknowledgement')
  $childMutateStream = [IO.File]::Open($childSwapPath, [IO.FileMode]::Open, [IO.FileAccess]::Write, [IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete)
  $childMutateStream.SetLength(0)
  $childMutateStream.Write($childMutateBytes, 0, $childMutateBytes.Length)
  $childMutateStream.Flush($true)
  $childMutateStream.Dispose()
  $childMutateResult = Finish-Write $childMutate ([Text.Encoding]::UTF8.GetBytes('must not replace mutation'))
  Assert-True ($childMutateResult.Type -eq 3) 'An after-RESPONSE_OPENED child mutation was not refused.'
  Assert-True ((Get-Content -Raw -LiteralPath $childSwapPath) -eq 'mutated after acknowledgement') 'The after-RESPONSE_OPENED mutation was overwritten.'
  Assert-NoWriterTemps $childSwapRoot

  $swapRoot = Join-Path $caseRoot 'rename-swap'
  $approved = Join-Path $swapRoot 'approved'
  $replacement = Join-Path $swapRoot 'replacement'
  $moved = Join-Path $swapRoot 'approved-moved'
  New-Item -ItemType Directory -Force -Path $approved, $replacement | Out-Null
  $approvedWitness = Inspect-Parent $approved
  $swapWrite = Start-Write $approved 'output.txt' 1 $approvedWitness $null
  Assert-True ($swapWrite.FirstResponse.Type -eq 1) 'The rename-swap writer did not retain an opened parent.'
  $parentRenameRefused = $false
  try { Move-Item -LiteralPath $approved -Destination $moved -ErrorAction Stop } catch { $parentRenameRefused = $true }
  Assert-True $parentRenameRefused 'The retained exact child handle allowed its parent directory to be renamed.'
  $swapResult = Finish-Write $swapWrite ([Text.Encoding]::UTF8.GetBytes('retained handle bytes'))
  Assert-True ($swapResult.Type -eq 2) ("Parent rename-swap write failed ({0}): {1}" -f $swapResult.Code, $swapResult.Message)
  Assert-True ((Get-Content -Raw -LiteralPath (Join-Path $approved 'output.txt')) -eq 'retained handle bytes') 'The protected original parent did not receive output.'
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $replacement 'output.txt'))) 'The replacement parent received bytes after a refused path swap.'
  Assert-NoWriterTemps $approved
  Assert-NoWriterTemps $replacement

  $junctionRoot = Join-Path $caseRoot 'junction-swap'
  $junctionApproved = Join-Path $junctionRoot 'approved'
  $junctionReplacement = Join-Path $junctionRoot 'replacement'
  $junctionMoved = Join-Path $junctionRoot 'approved-moved'
  New-Item -ItemType Directory -Force -Path $junctionApproved, $junctionReplacement | Out-Null
  $junctionWitness = Inspect-Parent $junctionApproved
  $junctionWrite = Start-Write $junctionApproved 'output.txt' 1 $junctionWitness $null
  Assert-True ($junctionWrite.FirstResponse.Type -eq 1) 'The junction-swap writer did not retain an opened parent.'
  $junctionRenameRefused = $false
  try { Move-Item -LiteralPath $junctionApproved -Destination $junctionMoved -ErrorAction Stop } catch { $junctionRenameRefused = $true }
  Assert-True $junctionRenameRefused 'The retained exact child handle allowed a junction swap precondition.'
  $junctionResult = Finish-Write $junctionWrite ([Text.Encoding]::UTF8.GetBytes('junction-safe bytes'))
  Assert-True ($junctionResult.Type -eq 2) ("Parent junction-swap write failed: {0}" -f $junctionResult.Message)
  Assert-True ((Get-Content -Raw -LiteralPath (Join-Path $junctionApproved 'output.txt')) -eq 'junction-safe bytes') 'The protected junction parent did not receive output.'
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $junctionReplacement 'output.txt'))) 'The junction target received bytes after the parent opened.'
  Assert-NoWriterTemps $junctionApproved
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
  $streamTimeoutResponse = Read-TerminalResponse $streamTimeout
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
  Assert-True ($timeoutResponse.Type -eq 3 -and $timeoutResponse.Code -eq 258) 'The helper input-wait deadline did not fail with WAIT_TIMEOUT.'
  $timeout.Process.StandardInput.Close()
  $timeout.Process.WaitForExit(5000) | Out-Null
  $timeout.Process.Dispose()
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $timeoutRoot 'output.txt'))) 'Timeout created output bytes.'
  Assert-NoWriterTemps $timeoutRoot

  $killWriteRoot = Join-Path $caseRoot 'forced-kill-write'
  New-Item -ItemType Directory -Path $killWriteRoot | Out-Null
  $killWriteParent = Inspect-Parent $killWriteRoot
  $killWrite = Start-Write $killWriteRoot 'output.txt' 1 $killWriteParent $null
  $killWrite.Input.WriteByte(1)
  $killWriteFrame = [System.IO.BinaryWriter]::new($killWrite.Input, [Text.Encoding]::UTF8, $true)
  $killWriteFrame.Write([uint32]4096)
  $killWriteFrame.Write([Text.Encoding]::UTF8.GetBytes('partial'))
  $killWriteFrame.Flush()
  Wait-ForProgress $killWrite 'temp' | Out-Null
  Kill-Writer $killWrite
  Dispose-KilledFrame $killWriteFrame
  Recover-KilledWrite $killWriteRoot 'output.txt' $killWriteParent $killWrite.Progress
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $killWriteRoot 'output.txt'))) 'A forced kill during write promoted partial bytes.'
  Assert-NoWriterTemps $killWriteRoot

  $killFlushRoot = Join-Path $caseRoot 'forced-kill-flush'
  New-Item -ItemType Directory -Path $killFlushRoot | Out-Null
  $killFlushParent = Inspect-Parent $killFlushRoot
  $killFlush = Start-Write $killFlushRoot 'output.txt' 262145 $killFlushParent $null
  $killFlushFrame = Write-PayloadFrames $killFlush ([Text.Encoding]::UTF8.GetBytes('flush candidate'))
  Wait-ForProgress $killFlush 'preflush' | Out-Null
  Kill-Writer $killFlush
  Dispose-KilledFrame $killFlushFrame
  Recover-KilledWrite $killFlushRoot 'output.txt' $killFlushParent $killFlush.Progress
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $killFlushRoot 'output.txt'))) 'A forced kill during flush promoted uncommitted bytes.'
  Assert-NoWriterTemps $killFlushRoot

  $backupIntentRoot = Join-Path $caseRoot 'forced-kill-backup-intent-interval'
  New-Item -ItemType Directory -Path $backupIntentRoot | Out-Null
  $backupIntentPath = Join-Path $backupIntentRoot 'output.txt'
  [IO.File]::WriteAllText($backupIntentPath, 'backup intent original')
  $backupIntentParent = Inspect-Parent $backupIntentRoot
  $backupIntentChild = Inspect-Child $backupIntentRoot 'output.txt'
  $backupIntent = Start-Write $backupIntentRoot 'output.txt' 134217735 $backupIntentParent $backupIntentChild
  $backupIntentFrame = Write-PayloadFrames $backupIntent ([Text.Encoding]::UTF8.GetBytes('backup intent candidate'))
  Wait-ForProgress $backupIntent 'test-backup-mutated' | Out-Null
  Kill-Writer $backupIntent
  Dispose-KilledFrame $backupIntentFrame
  Assert-True (@($backupIntent.Progress | Where-Object { $_.Message.StartsWith('backup-intent:') }).Count -eq 1) 'The original-to-backup mutation lacked its write-ahead receipt.'
  Assert-True (@($backupIntent.Progress | Where-Object { $_.Message.StartsWith('backup:') }).Count -eq 0) 'The backup completion receipt arrived before the forced interval kill.'
  Recover-KilledWrite $backupIntentRoot 'output.txt' $backupIntentParent $backupIntent.Progress
  Recover-KilledWrite $backupIntentRoot 'output.txt' $backupIntentParent $backupIntent.Progress
  Assert-True ((Get-Content -Raw -LiteralPath $backupIntentPath) -eq 'backup intent original') 'Write-ahead recovery did not restore the exact original after the backup mutation.'
  Assert-NoWriterTemps $backupIntentRoot

  $promotionIntentRoot = Join-Path $caseRoot 'forced-kill-promotion-intent-interval'
  New-Item -ItemType Directory -Path $promotionIntentRoot | Out-Null
  $promotionIntentPath = Join-Path $promotionIntentRoot 'output.txt'
  [IO.File]::WriteAllText($promotionIntentPath, 'promotion intent original')
  $promotionIntentParent = Inspect-Parent $promotionIntentRoot
  $promotionIntentChild = Inspect-Child $promotionIntentRoot 'output.txt'
  $promotionIntent = Start-Write $promotionIntentRoot 'output.txt' 268435463 $promotionIntentParent $promotionIntentChild
  $promotionIntentFrame = Write-PayloadFrames $promotionIntent ([Text.Encoding]::UTF8.GetBytes('promotion intent candidate'))
  Wait-ForProgress $promotionIntent 'test-promotion-mutated' | Out-Null
  Kill-Writer $promotionIntent
  Dispose-KilledFrame $promotionIntentFrame
  Assert-True (@($promotionIntent.Progress | Where-Object { $_.Message.StartsWith('promotion-intent:') }).Count -eq 1) 'The temp-to-final mutation lacked its write-ahead receipt.'
  Assert-True (@($promotionIntent.Progress | Where-Object { $_.Message -eq 'promoted' }).Count -eq 0) 'The promotion completion receipt arrived before the forced interval kill.'
  Recover-KilledWrite $promotionIntentRoot 'output.txt' $promotionIntentParent $promotionIntent.Progress
  Recover-KilledWrite $promotionIntentRoot 'output.txt' $promotionIntentParent $promotionIntent.Progress
  Assert-True ((Get-Content -Raw -LiteralPath $promotionIntentPath) -eq 'promotion intent candidate') 'Write-ahead recovery discarded the exact promoted output.'
  Assert-NoWriterTemps $promotionIntentRoot

  $newPromotionIntentRoot = Join-Path $caseRoot 'forced-kill-new-promotion-intent-interval'
  New-Item -ItemType Directory -Path $newPromotionIntentRoot | Out-Null
  $newPromotionIntentPath = Join-Path $newPromotionIntentRoot 'output.txt'
  $newPromotionIntentParent = Inspect-Parent $newPromotionIntentRoot
  $newPromotionIntent = Start-Write $newPromotionIntentRoot 'output.txt' 268435457 $newPromotionIntentParent $null
  $newPromotionIntentFrame = Write-PayloadFrames $newPromotionIntent ([Text.Encoding]::UTF8.GetBytes('new promotion intent candidate'))
  Wait-ForProgress $newPromotionIntent 'test-promotion-mutated' | Out-Null
  Kill-Writer $newPromotionIntent
  Dispose-KilledFrame $newPromotionIntentFrame
  Recover-KilledWrite $newPromotionIntentRoot 'output.txt' $newPromotionIntentParent $newPromotionIntent.Progress
  Recover-KilledWrite $newPromotionIntentRoot 'output.txt' $newPromotionIntentParent $newPromotionIntent.Progress
  Assert-True ((Get-Content -Raw -LiteralPath $newPromotionIntentPath) -eq 'new promotion intent candidate') 'Write-ahead recovery lost a new promoted output without a rollback slot.'
  Assert-NoWriterTemps $newPromotionIntentRoot

  $killPromotionRoot = Join-Path $caseRoot 'forced-kill-promotion'
  New-Item -ItemType Directory -Path $killPromotionRoot | Out-Null
  $killPromotionPath = Join-Path $killPromotionRoot 'output.txt'
  [IO.File]::WriteAllText($killPromotionPath, 'promotion original')
  $killPromotionParent = Inspect-Parent $killPromotionRoot
  $killPromotionChild = Inspect-Child $killPromotionRoot 'output.txt'
  $killPromotion = Start-Write $killPromotionRoot 'output.txt' 1048583 $killPromotionParent $killPromotionChild
  $killPromotionFrame = Write-PayloadFrames $killPromotion ([Text.Encoding]::UTF8.GetBytes('promotion candidate'))
  Wait-ForProgress $killPromotion 'transition' | Out-Null
  Kill-Writer $killPromotion
  Dispose-KilledFrame $killPromotionFrame
  Recover-KilledWrite $killPromotionRoot 'output.txt' $killPromotionParent $killPromotion.Progress
  Assert-True ((Get-Content -Raw -LiteralPath $killPromotionPath) -eq 'promotion original') 'Forced-kill recovery did not restore the exact original during promotion.'
  Assert-NoWriterTemps $killPromotionRoot

  $killPromotedRoot = Join-Path $caseRoot 'forced-kill-promoted'
  New-Item -ItemType Directory -Path $killPromotedRoot | Out-Null
  $killPromotedPath = Join-Path $killPromotedRoot 'output.txt'
  [IO.File]::WriteAllText($killPromotedPath, 'promoted original')
  $killPromotedParent = Inspect-Parent $killPromotedRoot
  $killPromotedChild = Inspect-Child $killPromotedRoot 'output.txt'
  $killPromoted = Start-Write $killPromotedRoot 'output.txt' 2097159 $killPromotedParent $killPromotedChild
  $killPromotedFrame = Write-PayloadFrames $killPromoted ([Text.Encoding]::UTF8.GetBytes('promoted candidate'))
  Wait-ForProgress $killPromoted 'promoted' | Out-Null
  Kill-Writer $killPromoted
  Dispose-KilledFrame $killPromotedFrame
  Recover-KilledWrite $killPromotedRoot 'output.txt' $killPromotedParent $killPromoted.Progress
  Assert-True ((Get-Content -Raw -LiteralPath $killPromotedPath) -eq 'promoted candidate') 'Forced-kill finalization discarded the exact promoted output.'
  Assert-NoWriterTemps $killPromotedRoot

  $killRollbackRoot = Join-Path $caseRoot 'forced-kill-rollback'
  New-Item -ItemType Directory -Path $killRollbackRoot | Out-Null
  $killRollbackPath = Join-Path $killRollbackRoot 'output.txt'
  [IO.File]::WriteAllText($killRollbackPath, 'rollback original')
  $killRollbackParent = Inspect-Parent $killRollbackRoot
  $killRollbackChild = Inspect-Child $killRollbackRoot 'output.txt'
  $killRollback = Start-Write $killRollbackRoot 'output.txt' 4259847 $killRollbackParent $killRollbackChild
  $killRollbackFrame = Write-PayloadFrames $killRollback ([Text.Encoding]::UTF8.GetBytes('rollback candidate'))
  Wait-ForProgress $killRollback 'rollback' | Out-Null
  Kill-Writer $killRollback
  Dispose-KilledFrame $killRollbackFrame
  Recover-KilledWrite $killRollbackRoot 'output.txt' $killRollbackParent $killRollback.Progress
  Assert-True ((Get-Content -Raw -LiteralPath $killRollbackPath) -eq 'rollback original') 'Forced-kill rollback recovery did not restore the exact original.'
  Assert-NoWriterTemps $killRollbackRoot

  $sharingRoot = Join-Path $caseRoot 'sharing-retry'
  New-Item -ItemType Directory -Path $sharingRoot | Out-Null
  $sharingPath = Join-Path $sharingRoot 'output.txt'
  [IO.File]::WriteAllText($sharingPath, 'sharing original')
  $sharingParent = Inspect-Parent $sharingRoot
  $sharingChild = Inspect-Child $sharingRoot 'output.txt'
  $sharing = Start-Write $sharingRoot 'output.txt' 8388615 $sharingParent $sharingChild
  $sharingResult = Finish-Write $sharing ([Text.Encoding]::UTF8.GetBytes('sharing candidate'))
  Assert-True (@($sharing.Progress | Where-Object { $_.Message -eq 'sharing-retry' }).Count -eq 1) 'The focused sharing-violation retry path did not run.'
  Assert-True ($sharingResult.Type -eq 2) ("Bounded sharing retries did not converge: {0}" -f $sharingResult.Message)
  Assert-True ((Get-Content -Raw -LiteralPath $sharingPath) -eq 'sharing candidate') 'Sharing retries did not preserve the promoted output.'
  Assert-NoWriterTemps $sharingRoot

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

  Write-Output ("PASS: Windows converter writer native handle-relative regressions ({0} assertions)" -f $script:assertionCount)
  Write-Output 'PASS: Windows converter writer executable structure and provenance manifest'
} finally {
  Remove-ScratchWithRetry $scratch
}
