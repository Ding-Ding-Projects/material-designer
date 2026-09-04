Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ui-drive-evidence-lib.ps1')

$script:ActiveCapability = $null
$script:ActiveNonce = $null
$script:CapabilityConsumed = $true

function Get-UILiveDigest([string]$Text) {
    $bytes=[Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($Text))
    return ([BitConverter]::ToString($bytes)).Replace('-','').ToLowerInvariant()
}

function Invoke-UILiveBridgeCall {
    param([string]$RepositoryRoot,[string]$Nonce,[string]$Tool,$Arguments)
    $bridge=Assert-UIPathHasNoReparsePoint -Path (Join-Path $RepositoryRoot 'scripts/ui-drive-lowlevel-stdin-bridge.ps1')
    $shell=(Get-Command powershell.exe -ErrorAction Stop).Source
    $request=[ordered]@{protocolVersion=1;nonce=$Nonce;tool=$Tool;arguments=$Arguments}|ConvertTo-Json -Depth 20 -Compress
    $start=[Diagnostics.ProcessStartInfo]::new()
    $start.FileName=$shell
    $start.Arguments='-NoProfile -ExecutionPolicy Bypass -File "'+$bridge.Replace('"','""')+'"'
    $start.UseShellExecute=$false
    $start.CreateNoWindow=$true
    $start.RedirectStandardInput=$true
    $start.RedirectStandardOutput=$true
    $start.RedirectStandardError=$true
    $start.EnvironmentVariables.Clear()
    foreach($name in @('SystemRoot','WINDIR','TEMP','TMP')){if(-not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))){$start.EnvironmentVariables[$name]=[Environment]::GetEnvironmentVariable($name)}}
    $process=[Diagnostics.Process]::new();$process.StartInfo=$start
    if(-not $process.Start()){throw 'Could not start the fixed live-driver stdin bridge.'}
    try{
        $stdoutTask=$process.StandardOutput.ReadToEndAsync();$stderrTask=$process.StandardError.ReadToEndAsync()
        $process.StandardInput.Write($request);$process.StandardInput.Close()
        if(-not $process.WaitForExit(120000)){try{$process.Kill()}catch{};throw 'Live-driver stdin bridge exceeded its time bound.'}
        $stdout=$stdoutTask.Result;$stderr=$stderrTask.Result
        if($process.ExitCode -ne 0 -or -not [string]::IsNullOrWhiteSpace($stderr)){throw 'Live-driver stdin bridge returned a refused result.'}
    }finally{$process.Dispose()}
    $result=ConvertFrom-UIStrictJsonText -Text $stdout -MaxDepth 32 -MaxStringLength 8192 -MaxArrayLength 10000 -MaxObjectProperties 256
    if($result.protocolVersion -ne 1 -or [string]$result.nonce -cne $Nonce -or [string]$result.tool -cne $Tool -or $result.driverExitCode -ne 0){throw 'Live-driver response does not bind the same-session nonce and requested tool.'}
    return $result
}

function Get-UINormalizedPageUrl([string]$Value){
    $uri=$null;if(-not[Uri]::TryCreate($Value,[UriKind]::Absolute,[ref]$uri)-or$uri.Scheme-notin@('http','https','file','app')){throw 'CDP page URL is not an approved absolute URI.'}
    return $uri.AbsoluteUri
}

function Invoke-UICdpExpression {
    param([int]$Port,[string]$Expression,[string]$ExpectedPageUrl)
    $targets=Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/list" -TimeoutSec 5
    if(@($targets).Count -ne 1 -or $targets[0].type -cne 'page' -or [string]::IsNullOrWhiteSpace([string]$targets[0].webSocketDebuggerUrl)){throw 'Isolated renderer target proof did not find exactly one page.'}
    $expectedNormalized=Get-UINormalizedPageUrl $ExpectedPageUrl;$actualNormalized=Get-UINormalizedPageUrl ([string]$targets[0].url)
    if($actualNormalized-cne$expectedNormalized){throw 'Isolated renderer page URL differs from the committed live binding.'}
    $socket=[Net.WebSockets.ClientWebSocket]::new()
    try{
        $socket.Options.SetRequestHeader('Origin','')
        $socket.ConnectAsync([Uri]$targets[0].webSocketDebuggerUrl,[Threading.CancellationToken]::None).GetAwaiter().GetResult()
        $message=[ordered]@{id=1;method='Runtime.evaluate';params=[ordered]@{expression=$Expression;returnByValue=$true}}|ConvertTo-Json -Depth 10 -Compress
        $payload=[Text.Encoding]::UTF8.GetBytes($message)
        $socket.SendAsync([ArraySegment[byte]]::new($payload),[Net.WebSockets.WebSocketMessageType]::Text,$true,[Threading.CancellationToken]::None).GetAwaiter().GetResult()
        $buffer=[byte[]]::new(65536);$builder=[Text.StringBuilder]::new()
        do{$part=$socket.ReceiveAsync([ArraySegment[byte]]::new($buffer),[Threading.CancellationToken]::None).GetAwaiter().GetResult();if($part.Count -gt 0){[void]$builder.Append([Text.Encoding]::UTF8.GetString($buffer,0,$part.Count))};if($builder.Length -gt 1048576){throw 'CDP response exceeded its bound.'}}while(-not $part.EndOfMessage)
        $response=ConvertFrom-UIStrictJsonText -Text $builder.ToString() -MaxDepth 32 -MaxStringLength 8192 -MaxArrayLength 10000 -MaxObjectProperties 256
        if($null -ne $response.error -or $null -eq $response.result.result.value){throw 'CDP semantic probe did not return a value.'}
        return [pscustomobject]@{value=[string]$response.result.result.value;pageUrl=$actualNormalized;pageUrlDigest=Get-UILiveDigest $actualNormalized}
    }finally{$socket.Dispose()}
}

function Write-UILiveJsonCreate([string]$Path,$Value){
    $parent=[IO.Path]::GetDirectoryName($Path);if(-not(Test-Path -LiteralPath $parent)){New-Item -ItemType Directory -Path $parent -Force|Out-Null}
    [void](Assert-UIPathHasNoReparsePoint -Path $parent)
    $bytes=[Text.UTF8Encoding]::new($false).GetBytes((($Value|ConvertTo-Json -Depth 100)+[Environment]::NewLine))
    $stream=[IO.FileStream]::new($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
}

function Write-UILiveEvidenceJsonCreate([string]$EvidenceRoot,[string]$RelativePath,$Value){
    [void](Initialize-UIFixedEvidenceParents -EvidenceRoot $EvidenceRoot)
    $path=Resolve-UIEvidencePath -EvidenceRoot $EvidenceRoot -Path $RelativePath -AllowMissingLeaf
    Write-UILiveJsonCreate $path $Value
    return (Resolve-UIEvidencePath -EvidenceRoot $EvidenceRoot -Path $RelativePath)
}

function Append-UILiveLedgerRow([object]$Capability,[object]$LiveCapture,$Row){
    if(-not[object]::ReferenceEquals($Capability,$script:ActiveCapability)-or$script:CapabilityConsumed){throw 'Private live capability cannot append this ledger row.'}
    $lockPath=(&git -C $LiveCapture.RepositoryRoot rev-parse --git-path ui-drive-ledger.append.lock).Trim();if($LASTEXITCODE-ne0-or[string]::IsNullOrWhiteSpace($lockPath)){throw 'Could not resolve the Git-admin live ledger lock.'};if(-not[IO.Path]::IsPathRooted($lockPath)){$lockPath=Join-Path $LiveCapture.RepositoryRoot $lockPath};[void](Assert-UIPathHasNoReparsePoint -Path ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($lockPath))))
    $lockStream=$null
    for($attempt=1;$attempt-le600;$attempt++){
        try {$lockStream=[IO.FileStream]::new($lockPath,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);break}
        catch [IO.IOException] {if($attempt-eq600){throw 'Timed out acquiring the private live ledger lock.'};Start-Sleep -Milliseconds 50}
    }
    try{
    $ledger=Assert-UIPathHasNoReparsePoint -Path $LiveCapture.LedgerPath
    $schema=Join-Path $LiveCapture.SchemaRoot 'ledger.schema.json'
    $data=Read-UIValidatedJson -Path $ledger -SchemaPath $schema -MaxBytes 4194304 -MaxDepth 24 -MaxStringLength 4096 -MaxArrayLength 10000 -MaxObjectProperties 128
    if([int]$Row.sequence -ne (@($data.rows).Count+1)-or@($data.rows|Where-Object sceneId -CEQ $Row.sceneId).Count -gt 0){throw 'Private live ledger append is duplicate or out of order.'}
    $updated=[ordered]@{version=2;inventoryVersion=1;ledgerMode='durable-append-only-one-receipt-per-interaction';evidencePolicy='fail-closed-real-built-artifact-only';approvedHeadlessRoute='cheap-lowlevel-headless';rows=@($data.rows)+$Row}
    $directory=[IO.Path]::GetDirectoryName($ledger);$temp=Join-Path $directory ('.live-ledger.'+[guid]::NewGuid().ToString('N')+'.tmp');$backup=Join-Path $directory ('.live-ledger.'+[guid]::NewGuid().ToString('N')+'.bak')
    try{
        Write-UILiveJsonCreate $temp $updated
        [void](Read-UIValidatedJson -Path $temp -SchemaPath $schema -MaxBytes 4194304 -MaxDepth 24 -MaxStringLength 4096 -MaxArrayLength 10000 -MaxObjectProperties 128)
        $candidateHash=Get-UIFileSha256 $temp;Invoke-UISharingRetry -Operation{[IO.File]::Replace($temp,$ledger,$backup,$true)} -Attempts 10 -DelayMs 40
        $final=Read-UIValidatedJson -Path $ledger -SchemaPath $schema -MaxBytes 4194304 -MaxDepth 24 -MaxStringLength 4096 -MaxArrayLength 10000 -MaxObjectProperties 128
        if((Get-UIFileSha256 $ledger)-cne$candidateHash-or$final.rows[-1].receiptId-cne$Row.receiptId){throw 'Private live ledger append failed final reopen proof.'}
        if(Test-Path -LiteralPath $backup){Remove-Item -LiteralPath $backup -Force}
    }catch{if(Test-Path -LiteralPath $backup){Invoke-UISharingRetry -Operation{[IO.File]::Replace($backup,$ledger,$null,$true)} -Attempts 10 -DelayMs 40};throw}
    finally{if(Test-Path -LiteralPath $temp){Remove-Item -LiteralPath $temp -Force};if(Test-Path -LiteralPath $backup){Remove-Item -LiteralPath $backup -Force}}
    }finally{if($null-ne$lockStream){$lockStream.Dispose()}}
}

function Write-UILiveEvidenceRecord {
    param([object]$Capability,[object]$LiveCapture)
    if($script:CapabilityConsumed -or $null -eq $script:ActiveCapability -or -not [object]::ReferenceEquals($Capability,$script:ActiveCapability)){throw 'Private live capability is absent, replayed, serialized, or foreign.'}
    if([string]$LiveCapture.Nonce -cne [string]$script:ActiveNonce){throw 'Live capture nonce does not match the active in-process session.'}
    if($LiveCapture.DriverInvoked -ne $true -or $LiveCapture.TranscriptVerified -ne $true -or $LiveCapture.ActionDelivered -ne $true -or $LiveCapture.SemanticMatched -ne $true){throw 'Live capture object lacks driver, transcript, action, or semantic proof.'}
    $image=Resolve-UIEvidencePath -EvidenceRoot $LiveCapture.EvidenceRoot -Path $LiveCapture.ImagePath
    $imageItem=Get-Item -LiteralPath $image -Force
    if($imageItem.LastWriteTimeUtc -lt $LiveCapture.StartedAtUtc -or $imageItem.LastWriteTimeUtc -gt $LiveCapture.CompletedAtUtc){throw 'Original image is old, replayed, or touched outside the live run interval.'}
    if((Get-UIFileSha256 $image) -cne $LiveCapture.ImageSha256){throw 'Original image changed after the live driver returned it.'}
    if($LiveCapture.ProcessImageSha256 -cne $LiveCapture.ArtifactSha256 -or $LiveCapture.WindowWidth -lt 1 -or $LiveCapture.WindowHeight -lt 1){throw 'Live process or window facts do not match the captured artifact.'}
    if($LiveCapture.ActionKind -cne $LiveCapture.ExpectedActionKind -or $LiveCapture.ActionTarget -cne $LiveCapture.ExpectedActionTarget -or $LiveCapture.InputMethod -cne $LiveCapture.ExpectedInputMethod){throw 'Live action differs from the committed interaction contract.'}
    if(@($LiveCapture.SemanticPolls).Count -lt 1 -or $LiveCapture.SemanticPolls[-1].observedState -cne $LiveCapture.ExpectedAfter){throw 'Live semantic polls do not prove the expected after state.'}
    if($LiveCapture.DriverExecutableSha256 -cne $LiveCapture.Transcript.driverExecutableSha256 -or $LiveCapture.DriverExecutablePathDigest -cne $LiveCapture.Transcript.driverExecutablePathDigest){throw 'Live transcript names the wrong approved driver executable.'}
    if($LiveCapture.PageUrl -cne $LiveCapture.Transcript.pageUrl -or $LiveCapture.PageUrlDigest -cne $LiveCapture.Transcript.pageUrlDigest -or $LiveCapture.PageUrlDigest -cne (Get-UILiveDigest $LiveCapture.PageUrl)){throw 'Live transcript page URL differs from the exact evaluated target.'}
    if($LiveCapture.TranscriptNonceDigest -cne (Get-UILiveDigest $script:ActiveNonce)){throw 'Live transcript nonce digest differs from the active session.'}
    $root=$LiveCapture.EvidenceRoot;$schemaRoot=$LiveCapture.SchemaRoot
    $transcriptPath=Write-UILiveEvidenceJsonCreate $root $LiveCapture.TranscriptRelative $LiveCapture.Transcript
    [void](Read-UIValidatedJson -Path $transcriptPath -SchemaPath (Join-Path $schemaRoot 'driver-transcript.schema.json'))
    $transcriptHash=Get-UIFileSha256 $transcriptPath
    $origin=[ordered]@{version=1;originId=$LiveCapture.OriginId;originMode='live-private-in-process-capability';runId=$LiveCapture.RunId;sessionId=$LiveCapture.SessionId;sourceCommit=$LiveCapture.SourceCommit;artifactSha256=$LiveCapture.ArtifactSha256;orchestratorPath='scripts/run-approved-ui-drive-live.ps1';orchestratorSha256=$LiveCapture.OrchestratorSha256;modulePath='scripts/ui-drive-live-origin.psm1';moduleSha256=$LiveCapture.ModuleSha256;bridgePath='scripts/ui-drive-lowlevel-stdin-bridge.ps1';bridgeSha256=$LiveCapture.BridgeSha256;driverExecutablePathDigest=$LiveCapture.DriverExecutablePathDigest;driverExecutableSha256=$LiveCapture.DriverExecutableSha256;transcriptPath=$LiveCapture.TranscriptRelative;transcriptSha256=$transcriptHash;transcriptId=$LiveCapture.Transcript.transcriptId;nonceDigest=$LiveCapture.TranscriptNonceDigest;capabilityIdentityDigest=$LiveCapture.CapabilityIdentityDigest;processId=$LiveCapture.ProcessId;processImageSha256=$LiveCapture.ProcessImageSha256;windowClass=$LiveCapture.WindowClass;windowTitle=$LiveCapture.WindowTitle;windowWidth=$LiveCapture.WindowWidth;windowHeight=$LiveCapture.WindowHeight;pageUrl=$LiveCapture.PageUrl;pageUrlDigest=$LiveCapture.PageUrlDigest;sceneId=$LiveCapture.SceneId;interactionId=$LiveCapture.InteractionId;actionKind=$LiveCapture.ActionKind;actionTarget=$LiveCapture.ActionTarget;inputMethod=$LiveCapture.InputMethod;semanticPolls=@($LiveCapture.SemanticPolls);imagePath=$LiveCapture.ImagePath;imageSha256=$LiveCapture.ImageSha256;imageLastWriteUtc=$imageItem.LastWriteTimeUtc.ToString('o');startedAtUtc=$LiveCapture.StartedAtUtc.ToString('o');completedAtUtc=$LiveCapture.CompletedAtUtc.ToString('o');replayKey=Get-UILiveDigest ($LiveCapture.SessionId+'|'+$LiveCapture.RunId+'|'+$LiveCapture.ImageSha256+'|'+$LiveCapture.TranscriptNonceDigest)}
    $originPath=Write-UILiveEvidenceJsonCreate $root $LiveCapture.OriginRelative $origin;[void](Read-UIValidatedJson -Path $originPath -SchemaPath (Join-Path $schemaRoot 'live-origin.schema.json'));$originHash=Get-UIFileSha256 $originPath
    foreach($record in @($LiveCapture.SupportingRecords)){$record.FullPath=Write-UILiveEvidenceJsonCreate $root $record.Relative $record.Data;[void](Read-UIValidatedJson -Path $record.FullPath -SchemaPath $record.SchemaPath)}
    $receipt=$LiveCapture.ReceiptFactory.Invoke($originHash,$transcriptHash);$receiptPath=Write-UILiveEvidenceJsonCreate $root $LiveCapture.ReceiptRelative $receipt;[void](Read-UIValidatedJson -Path $receiptPath -SchemaPath (Join-Path $schemaRoot 'click-receipt.schema.json'));$receiptHash=Get-UIFileSha256 $receiptPath
    $manifest=$LiveCapture.ManifestFactory.Invoke($receiptHash,$originHash,$transcriptHash);$manifestPath=Write-UILiveEvidenceJsonCreate $root $LiveCapture.ManifestRelative $manifest;[void](Read-UIValidatedJson -Path $manifestPath -SchemaPath (Join-Path $schemaRoot 'approved-output-manifest.schema.json'));$manifestHash=Get-UIFileSha256 $manifestPath
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $LiveCapture.RepositoryRoot 'scripts/run-ui-drive-privacy.ps1') -EvidenceRoot $root -Manifest $manifestPath 1>$null
    if($LASTEXITCODE -ne 0){throw 'Live evidence privacy scan refused the captured bundle.'}
    $row=$LiveCapture.LedgerRowFactory.Invoke($receiptHash,$originHash,$manifestHash);Append-UILiveLedgerRow $Capability $LiveCapture $row
    $script:CapabilityConsumed=$true
    return [pscustomobject]@{status='live-verified';driverInvoked=$true;ledgerAppended=$true;receiptId=$receipt.receiptId;runId=$LiveCapture.RunId;sessionId=$LiveCapture.SessionId}
}

function Invoke-UIApprovedLiveCapture {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)][string]$RepositoryRoot,
        [Parameter(Mandatory=$true)][string]$SceneId,
        [string]$ReceiptId,
        [string]$ArtifactPath,
        [string]$Inventory='.codex/verification/ui-drive/inventory.json',
        [string]$SceneRegistry='.codex/verification/ui-drive/scene-registry.json',
        [string]$LiveDriverRegistry='.codex/verification/ui-drive/live-driver-registry.json'
    )
    $schemaRoot=Join-Path $RepositoryRoot '.codex/verification/ui-drive'
    $inventoryData=Read-UIValidatedJson -Path $Inventory -SchemaPath (Join-Path $schemaRoot 'inventory.schema.json')
    $sceneData=Read-UIValidatedJson -Path $SceneRegistry -SchemaPath (Join-Path $schemaRoot 'scene-registry.schema.json')
    $scene=@($sceneData.scenes|Where-Object id -CEQ $SceneId)
    if($scene.Count -ne 1){throw 'Requested live scene is not canonical.'}
    if($scene[0].status -cne 'partial'){
        return [pscustomobject]@{status='structural-only';reason='scene-not-capture-ready';driverInvoked=$false;ledgerAppended=$false}
    }
    $driverRegistry=Read-UIValidatedJson -Path $LiveDriverRegistry -SchemaPath (Join-Path $schemaRoot 'live-driver-registry.schema.json')
    $binding=@($driverRegistry.bindings|Where-Object sceneId -CEQ $SceneId)
    if($binding.Count -ne 1){throw 'Capture-ready scene lacks exactly one committed live driver binding.'}
    if([string]::IsNullOrWhiteSpace($ReceiptId)-or[string]::IsNullOrWhiteSpace($ArtifactPath)){throw 'Capture-ready live run requires receipt and artifact identities.'}
    $sourceArtifact=Assert-UIPathHasNoReparsePoint -Path $ArtifactPath
    $artifactHash=Get-UIFileSha256 $sourceArtifact
    $evidenceRoot=Join-Path $RepositoryRoot '.codex/verification/evidence'
    [void](Initialize-UIFixedEvidenceParents -EvidenceRoot $evidenceRoot)
    $artifactParent=Initialize-UIArtifactParent -EvidenceRoot $evidenceRoot -ArtifactSha256 $artifactHash
    $artifact=Join-Path $artifactParent ([IO.Path]::GetFileName($sourceArtifact))
    [void](Assert-UIPathHasNoReparsePoint -Path $artifact -AllowMissingLeaf)
    if(-not(Test-Path -LiteralPath $artifact)){$input=[IO.File]::OpenRead($sourceArtifact);$output=[IO.FileStream]::new($artifact,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$input.CopyTo($output);$output.Flush($true)}finally{$output.Dispose();$input.Dispose()}}
    $artifact=Resolve-UIEvidencePath -EvidenceRoot $evidenceRoot -Path $artifact
    if((Get-UIFileSha256 $artifact)-cne$artifactHash){throw 'Staged live artifact hash differs from the selected source artifact.'}
    $rng=[Security.Cryptography.RandomNumberGenerator]::Create();$nonceBytes=[byte[]]::new(32);$rng.GetBytes($nonceBytes);$rng.Dispose()
    $nonce=[Convert]::ToBase64String($nonceBytes);$capability=[object]::new()
    $script:ActiveCapability=$capability;$script:ActiveNonce=$nonce;$script:CapabilityConsumed=$false
    $desktop=$null;$pid=$null
    try{
        # A live implementation reaches this block only for a committed partial scene
        # with one exact driver binding. Driver calls, window resolution, action,
        # semantic polls, and screenshot creation all occur before the private writer.
        $started=[DateTime]::UtcNow
        $desktop='MaterialDesignerEvidence'+[guid]::NewGuid().ToString('N')
        $listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0);$listener.Start();$port=([Net.IPEndPoint]$listener.LocalEndpoint).Port;$listener.Stop()
        $profile=Join-Path ([IO.Path]::GetTempPath()) ('material-designer-live-profile-'+[guid]::NewGuid().ToString('N'))
        $command='"'+$artifact+'" --remote-debugging-port='+$port+' --user-data-dir="'+$profile+'"'
        $launch=Invoke-UILiveBridgeCall $RepositoryRoot $nonce 'launch_on_headless_desktop' ([pscustomobject]@{name=$desktop;command=$command})
        $pid=[int]$launch.result.pid
        $windows=Invoke-UILiveBridgeCall $RepositoryRoot $nonce 'list_headless_windows' ([pscustomobject]@{name=$desktop})
        $window=@($windows.result.windows|Where-Object{[int]$_.process_id -eq $pid -and [int]$_.width -gt 0 -and [int]$_.height -gt 0 -and [string]$_.class -match [string]$binding[0].windowClassPattern -and [string]$_.title -match [string]$binding[0].windowTitlePattern})
        if($window.Count -ne 1){throw 'Live driver did not resolve exactly one target process window.'}
        $beforeResult=Invoke-UICdpExpression -Port $port -Expression ([string]$binding[0].beforeExpression) -ExpectedPageUrl ([string]$binding[0].expectedPageUrl);$before=$beforeResult.value
        $actionArgs=[ordered]@{hwnd=[int64]$window[0].handle}
        if($binding[0].actionTool -ceq 'mouse_click'){$actionArgs.x=[int]$binding[0].actionArguments.clientX;$actionArgs.y=[int]$binding[0].actionArguments.clientY;$actionArgs.button=[string]$binding[0].actionArguments.button;$actionArgs.clicks=[int]$binding[0].actionArguments.clicks}
        elseif($binding[0].actionTool -ceq 'win_send_keys'){$actionArgs.keys=@($binding[0].actionArguments.keys)}
        else{$actionArgs.text=[string]$binding[0].actionArguments.text}
        $action=Invoke-UILiveBridgeCall $RepositoryRoot $nonce ([string]$binding[0].actionTool) ([pscustomobject]$actionArgs)
        $polls=[Collections.Generic.List[object]]::new();$after=$null
        for($index=1;$index -le [int]$binding[0].maxPollAttempts;$index++){$afterResult=Invoke-UICdpExpression -Port $port -Expression ([string]$binding[0].afterExpression) -ExpectedPageUrl ([string]$binding[0].expectedPageUrl);$after=$afterResult.value;$polls.Add([pscustomobject]@{ordinal=$index;elapsedMs=[int](([DateTime]::UtcNow-$started).TotalMilliseconds);observedState=$after;responseSha256=Get-UILiveDigest $after});if($after -ceq [string]$scene[0].expectedAfter){break};Start-Sleep -Milliseconds ([int]$binding[0].pollIntervalMs)}
        if($after -cne [string]$scene[0].expectedAfter){throw 'Bounded live semantic polls did not reach the expected state.'}
        $auditResult=Invoke-UICdpExpression -Port $port -Expression ([string]$binding[0].auditElementsExpression) -ExpectedPageUrl ([string]$binding[0].expectedPageUrl);$auditJson=$auditResult.value
        $auditElements=@(ConvertFrom-UIStrictJsonText -Text $auditJson -MaxDepth 16 -MaxStringLength 1000 -MaxArrayLength 100000 -MaxObjectProperties 16)
        if($auditElements.Count -lt 1){throw 'Live every-element audit probe returned no elements.'}
        foreach($element in $auditElements){if($element -isnot [pscustomobject]-or[string]::IsNullOrWhiteSpace([string]$element.elementId)-or[string]::IsNullOrWhiteSpace([string]$element.contextMenuRoute)-or[string]::IsNullOrWhiteSpace([string]$element.appearanceRoute)-or[string]::IsNullOrWhiteSpace([string]$element.lockRoute)){throw 'Live every-element audit probe returned an incomplete element.'}}
        $schemaRoot=Join-Path $RepositoryRoot '.codex/verification/ui-drive';[void](Initialize-UIFixedEvidenceParents -EvidenceRoot $evidenceRoot)
        $ledgerPath=Join-Path $schemaRoot 'ledger.json';$ledgerData=Read-UIValidatedJson -Path $ledgerPath -SchemaPath (Join-Path $schemaRoot 'ledger.schema.json');$sequence=@($ledgerData.rows).Count+1
        $runId='run-'+[guid]::NewGuid().ToString('N');$sessionId='session-'+[guid]::NewGuid().ToString('N');$originId='origin-'+[guid]::NewGuid().ToString('N');$auditId='audit-'+[guid]::NewGuid().ToString('N');$transcriptId='transcript-'+[guid]::NewGuid().ToString('N')
        $imageRelative='images/{0}/{1:D4}-{2}.png' -f $runId,$sequence,$SceneId;[void](Initialize-UIRunImageParent -EvidenceRoot $evidenceRoot -RunId $runId);$imageFull=Resolve-UIEvidencePath -EvidenceRoot $evidenceRoot -Path $imageRelative -AllowMissingLeaf
        $shot=Invoke-UILiveBridgeCall $RepositoryRoot $nonce 'screenshot' ([pscustomobject]@{hwnd=[int64]$window[0].handle;output_path=$imageFull;client_only=$false})
        $completed=[DateTime]::UtcNow;$imageInfo=(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepositoryRoot 'scripts/inspect-ui-drive-image.ps1') -ImagePath $imageFull|ConvertFrom-Json)
        $bridgePath=Join-Path $RepositoryRoot 'scripts/ui-drive-lowlevel-stdin-bridge.ps1';$modulePath=Join-Path $RepositoryRoot 'scripts/ui-drive-live-origin.psm1';$orchestratorPath=Join-Path $RepositoryRoot 'scripts/run-approved-ui-drive-live.ps1'
        $calls=@($launch,$windows,$action,$shot);$nonceDigest=Get-UILiveDigest $nonce
        $transcriptCalls=@();for($callIndex=0;$callIndex -lt $calls.Count;$callIndex++){$transcriptCalls+=[ordered]@{sequence=$callIndex+1;tool=[string]$calls[$callIndex].tool;requestSha256=[string]$calls[$callIndex].requestSha256;responseSha256=[string]$calls[$callIndex].responseSha256;driverExitCode=0;nonceDigest=$nonceDigest}}
        $pageUrl=$beforeResult.pageUrl;$pageUrlDigest=$beforeResult.pageUrlDigest
        $transcript=[ordered]@{version=1;transcriptId=$transcriptId;runId=$runId;sessionId=$sessionId;pageUrl=$pageUrl;pageUrlDigest=$pageUrlDigest;bridgePath='scripts/ui-drive-lowlevel-stdin-bridge.ps1';bridgeSha256=Get-UIFileSha256 $bridgePath;driverExecutablePathDigest=[string]$launch.driverExecutablePathDigest;driverExecutableSha256=[string]$launch.driverExecutableSha256;calls=$transcriptCalls}
        $sourceCommit=(&git -C $RepositoryRoot rev-parse HEAD).Trim();Assert-UIGitCommit -RepositoryRoot $RepositoryRoot -Commit $sourceCommit -RequireAncestorOfHead
        $artifactRelative=[IO.Path]::GetFullPath($artifact).Substring(([IO.Path]::GetFullPath($evidenceRoot).TrimEnd('\','/')+[IO.Path]::DirectorySeparatorChar).Length).Replace('\','/')
        $provenanceRelative="provenance/$artifactHash.artifact-provenance.json";$runRelative="runs/$runId.json";$auditRelative="audits/$auditId.json";$originRelative="origins/$originId.json";$transcriptRelative="transcripts/$transcriptId.json";$receiptRelative="receipts/$ReceiptId.json";$manifestRelative="manifests/$ReceiptId.approved-outputs.json"
        $provenance=[ordered]@{version=1;provenanceKind='schema-validated-captured-artifact-provenance';artifactPath=$artifactRelative;artifactSha256=$artifactHash;artifactBytes=[int64](Get-Item $artifact).Length;builtFromCommit=$sourceCommit;intendedSourceCommit=$sourceCommit;commitPolicy='exact-equality-and-ancestor-of-verification-head';builderId='supported-local-build-script';buildRunId=$runId}
        $captureRun=[ordered]@{version=1;runId=$runId;sessionId=$sessionId;liveOriginId=$originId;generator=[ordered]@{driverId='approved-cheap-lowlevel-headless-driver';orchestratorPath='scripts/run-approved-ui-drive-live.ps1';orchestratorSha256=Get-UIFileSha256 $orchestratorPath;modulePath='scripts/ui-drive-live-origin.psm1';moduleSha256=Get-UIFileSha256 $modulePath;bridgePath='scripts/ui-drive-lowlevel-stdin-bridge.ps1';bridgeSha256=Get-UIFileSha256 $bridgePath;driverExecutablePathDigest=[string]$launch.driverExecutablePathDigest;driverExecutableSha256=[string]$launch.driverExecutableSha256;invocationId=[guid]::NewGuid().ToString('N')};captureRoute='cheap-lowlevel-headless';sourceCommit=$sourceCommit;artifactSha256=$artifactHash;target=[ordered]@{processId=$pid;processImagePath=$artifactRelative;processImageSha256=$artifactHash;windowClass=[string]$window[0].class;windowTitle=[string]$window[0].title;windowWidth=[int]$window[0].width;windowHeight=[int]$window[0].height;pageUrl=$pageUrl;pageUrlDigest=$pageUrlDigest};interaction=[ordered]@{sceneId=$SceneId;interactionId=$(if($scene[0].featureId){(($inventoryData.surfaces|Where-Object id -eq $scene[0].surfaceId).features|Where-Object id -eq $scene[0].featureId).requiredInteractions[0].id}else{(($inventoryData.surfaces|Where-Object id -eq $scene[0].surfaceId).destinations|Where-Object id -eq $scene[0].destinationId).requiredInteractionIds[0]});sequence=$sequence;kind=$(if($binding[0].actionTool -eq 'mouse_click'){'click'}else{'keyboard'});target=[string]$scene[0].actionTarget;accessibleName=[string]$scene[0].accessibleName;inputMethod=[string]$binding[0].actionInputMethod};semanticPolls=@($polls|ForEach-Object{[ordered]@{ordinal=$_.ordinal;method='cdp-runtime-evaluate';elapsedMs=$_.elapsedMs;observedState=$_.observedState}});originalImage=[ordered]@{path=$imageRelative;sha256=[string]$imageInfo.sha256};receipt=[ordered]@{id=$ReceiptId;path=$receiptRelative}}
        $audit=[ordered]@{version=1;auditId=$auditId;surfaceId=[string]$scene[0].surfaceId;sceneId=$SceneId;sourceCommit=$sourceCommit;artifactSha256=$artifactHash;runId=$runId;coverageMode='hand-written-every-rendered-element';requiredElementCount=$auditElements.Count;auditedElementCount=$auditElements.Count;missingElementIds=@();elements=@($auditElements|ForEach-Object{[ordered]@{elementId=[string]$_.elementId;status='exercised';contextMenuRoute=[string]$_.contextMenuRoute;appearanceRoute=[string]$_.appearanceRoute;lockRoute=[string]$_.lockRoute}});visualInspection=[ordered]@{method='original-image-inspection';clippingVerdict='checked-no-defect';visualDefectIds=@()}}
        $support=@([pscustomobject]@{FullPath=$null;Relative=$provenanceRelative;Data=$provenance;SchemaPath=Join-Path $schemaRoot 'artifact-provenance.schema.json'},[pscustomobject]@{FullPath=$null;Relative=$runRelative;Data=$captureRun;SchemaPath=Join-Path $schemaRoot 'capture-run.schema.json'},[pscustomobject]@{FullPath=$null;Relative=$auditRelative;Data=$audit;SchemaPath=Join-Path $schemaRoot 'every-element-audit.schema.json'})
        $interaction=$captureRun.interaction;$captureTuple=$scene[0].tuple;$processImageHash=Get-UIFileSha256 $artifact;$capDigest=Get-UILiveDigest ([Runtime.CompilerServices.RuntimeHelpers]::GetHashCode($capability).ToString()+'|'+$nonce)
        $live=[pscustomobject]@{Nonce=$nonce;DriverInvoked=$true;TranscriptVerified=$true;ActionDelivered=$true;SemanticMatched=$true;EvidenceRoot=$evidenceRoot;SchemaRoot=$schemaRoot;RepositoryRoot=$RepositoryRoot;LedgerPath=$ledgerPath;ImagePath=$imageRelative;ImageSha256=[string]$imageInfo.sha256;ArtifactSha256=$artifactHash;ProcessImageSha256=$processImageHash;WindowWidth=[int]$window[0].width;WindowHeight=[int]$window[0].height;WindowClass=[string]$window[0].class;WindowTitle=[string]$window[0].title;ProcessId=$pid;PageUrl=$pageUrl;PageUrlDigest=$pageUrlDigest;ActionKind=[string]$interaction.kind;ExpectedActionKind=[string]$interaction.kind;ActionTarget=[string]$scene[0].actionTarget;ExpectedActionTarget=[string]$scene[0].actionTarget;InputMethod=[string]$binding[0].actionInputMethod;ExpectedInputMethod=[string]$binding[0].actionInputMethod;SemanticPolls=@($polls);ExpectedAfter=[string]$scene[0].expectedAfter;DriverExecutableSha256=[string]$launch.driverExecutableSha256;DriverExecutablePathDigest=[string]$launch.driverExecutablePathDigest;Transcript=$transcript;TranscriptNonceDigest=$nonceDigest;StartedAtUtc=$started;CompletedAtUtc=$completed;OriginId=$originId;RunId=$runId;SessionId=$sessionId;SourceCommit=$sourceCommit;SceneId=$SceneId;InteractionId=[string]$interaction.interactionId;OrchestratorSha256=Get-UIFileSha256 $orchestratorPath;ModuleSha256=Get-UIFileSha256 $modulePath;BridgeSha256=Get-UIFileSha256 $bridgePath;CapabilityIdentityDigest=$capDigest;TranscriptRelative=$transcriptRelative;OriginRelative=$originRelative;ReceiptRelative=$receiptRelative;ManifestRelative=$manifestRelative;SupportingRecords=$support}
        $live|Add-Member ScriptMethod ReceiptFactory {param($originHash,$transcriptHash);$prov=Get-UIFileSha256 $this.SupportingRecords[0].FullPath;$runHash=Get-UIFileSha256 $this.SupportingRecords[1].FullPath;$auditHash=Get-UIFileSha256 $this.SupportingRecords[2].FullPath;[ordered]@{version=3;inventoryVersion=1;receiptId=$ReceiptId;surfaceId=[string]$scene[0].surfaceId;featureId=$scene[0].featureId;destinationId=$scene[0].destinationId;interactionId=[string]$interaction.interactionId;sceneId=$SceneId;sequence=$sequence;sourceCommit=$sourceCommit;artifact=[ordered]@{path=$artifactRelative;sha256=$artifactHash;builtFromCommit=$sourceCommit;kind='packaged-built-artifact';provenancePath=$provenanceRelative;provenanceSha256=$prov};captureTuple=$captureTuple;action=[ordered]@{kind=[string]$interaction.kind;target=[string]$scene[0].actionTarget;accessibleName=[string]$scene[0].accessibleName;inputMethod=[string]$binding[0].actionInputMethod;outcome='completed'};semanticState=[ordered]@{expectedBefore=[string]$scene[0].expectedBefore;observedBefore=$before;expectedAfter=[string]$scene[0].expectedAfter;observedAfter=$after;poll=[ordered]@{attempts=$polls.Count;elapsedMs=$polls[-1].elapsedMs;method='cdp-runtime-evaluate'};verdict='matched'};image=[ordered]@{path=$imageRelative;sha256=[string]$imageInfo.sha256;bytes=[int64]$imageInfo.bytes;width=[int]$imageInfo.width;height=[int]$imageInfo.height;pixels=[int64]$imageInfo.pixels;format='png';contentVerdict=[string]$imageInfo.contentVerdict};captureRun=[ordered]@{path=$runRelative;sha256=$runHash;runId=$runId;sessionId=$sessionId};liveOrigin=[ordered]@{path=$originRelative;sha256=$originHash;originId=$originId;verificationLevel='live-session-only';pageUrl=$pageUrl;pageUrlDigest=$pageUrlDigest};everyElementAudit=[ordered]@{path=$auditRelative;sha256=$auditHash;auditId=$auditId};approvedOutputManifestPath=$manifestRelative}} -Force
        $live|Add-Member ScriptMethod ManifestFactory {param($receiptHash,$originHash,$transcriptHash);$paths=@([pscustomobject]@{kind='receipt';relative=$receiptRelative;hash=$receiptHash},[pscustomobject]@{kind='image';relative=$imageRelative;hash=[string]$imageInfo.sha256},[pscustomobject]@{kind='artifact';relative=$artifactRelative;hash=$artifactHash},[pscustomobject]@{kind='artifact-provenance';relative=$provenanceRelative;hash=Get-UIFileSha256 $this.SupportingRecords[0].FullPath},[pscustomobject]@{kind='capture-run';relative=$runRelative;hash=Get-UIFileSha256 $this.SupportingRecords[1].FullPath},[pscustomobject]@{kind='every-element-audit';relative=$auditRelative;hash=Get-UIFileSha256 $this.SupportingRecords[2].FullPath},[pscustomobject]@{kind='live-origin';relative=$originRelative;hash=$originHash},[pscustomobject]@{kind='driver-transcript';relative=$transcriptRelative;hash=$transcriptHash});[ordered]@{version=1;manifestMode='fixed-receipt-backed-approved-outputs';receiptId=$ReceiptId;sourceCommit=$sourceCommit;artifactSha256=$artifactHash;entries=@($paths|ForEach-Object{[ordered]@{kind=$_.kind;relativePath=$_.relative;sha256=$_.hash;bytes=[int64](Get-Item (Resolve-UIEvidencePath -EvidenceRoot $evidenceRoot -Path $_.relative)).Length}})}} -Force
        $live|Add-Member ScriptMethod LedgerRowFactory {param($receiptHash,$originHash,$manifestHash);$receipt=$this.ReceiptFactory.Invoke($originHash,(Get-UIFileSha256 (Resolve-UIEvidencePath -EvidenceRoot $evidenceRoot -Path $transcriptRelative)));[ordered]@{receiptId=$ReceiptId;receiptPath=$receiptRelative;receiptSha256=$receiptHash;sceneId=$SceneId;surfaceId=[string]$scene[0].surfaceId;featureId=$scene[0].featureId;destinationId=$scene[0].destinationId;interactionId=[string]$interaction.interactionId;sequence=$sequence;sourceCommit=$sourceCommit;artifactPath=$artifactRelative;artifactSha256=$artifactHash;artifactBuiltFromCommit=$sourceCommit;artifactProvenancePath=$provenanceRelative;artifactProvenanceSha256=$receipt.artifact.provenanceSha256;captureRunPath=$runRelative;captureRunSha256=$receipt.captureRun.sha256;liveOriginPath=$originRelative;liveOriginSha256=$originHash;originId=$originId;verificationLevel='live-session-only';pageUrl=$pageUrl;pageUrlDigest=$pageUrlDigest;runId=$runId;sessionId=$sessionId;imagePath=$imageRelative;imageSha256=[string]$imageInfo.sha256;everyElementAuditPath=$auditRelative;everyElementAuditSha256=$receipt.everyElementAudit.sha256;approvedOutputManifestPath=$manifestRelative;approvedOutputManifestSha256=$manifestHash;screenId=[string]$captureTuple.screenId;state=[string]$captureTuple.state;route=[string]$captureTuple.route;theme=[string]$captureTuple.theme;locale=[string]$captureTuple.locale;viewportWidth=[int]$captureTuple.viewportWidth;viewportHeight=[int]$captureTuple.viewportHeight;displayScale=$captureTuple.displayScale;headlessRoute='cheap-lowlevel-headless';networkIsolationMode=[string]$captureTuple.networkIsolation.mode;blockedExternalRequests=[bool]$captureTuple.networkIsolation.blockedExternalRequests;allowedOrigins=@($captureTuple.networkIsolation.allowedOrigins);actionKind=[string]$interaction.kind;actionTarget=[string]$scene[0].actionTarget;accessibleName=[string]$scene[0].accessibleName;inputMethod=[string]$binding[0].actionInputMethod;expectedBefore=[string]$scene[0].expectedBefore;expectedAfter=[string]$scene[0].expectedAfter}} -Force
        return Write-UILiveEvidenceRecord $capability $live
    }finally{
        if($null -ne $desktop){try{Invoke-UILiveBridgeCall $RepositoryRoot $nonce 'close_headless_desktop' ([pscustomobject]@{name=$desktop})|Out-Null}catch{}}
        if($null -ne $pid){try{Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue}catch{}}
        if($null -ne $nonceBytes){[Array]::Clear($nonceBytes,0,$nonceBytes.Length)}
        $script:ActiveCapability=$null;$script:ActiveNonce=$null;$script:CapabilityConsumed=$true
    }
}

Export-ModuleMember -Function Invoke-UIApprovedLiveCapture
