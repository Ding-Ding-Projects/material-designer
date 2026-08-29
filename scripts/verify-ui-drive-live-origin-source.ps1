[CmdletBinding()]
param(
    [string]$Orchestrator='scripts/run-approved-ui-drive-live.ps1',
    [string]$Module='scripts/ui-drive-live-origin.psm1',
    [string]$Bridge='scripts/ui-drive-lowlevel-stdin-bridge.ps1',
    [string]$StaticAppend='scripts/append-ui-drive-ledger.ps1'
)
$ErrorActionPreference='Stop'
function Parse-Source([string]$Path){$tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseFile((Resolve-Path $Path).Path,[ref]$tokens,[ref]$errors);if($errors.Count){throw 'Production live-origin source has a parser error.'};return $ast}
function Command-Names($Ast){return @($Ast.FindAll({param($node)$node-is[Management.Automation.Language.CommandAst]},$true)|ForEach-Object{$_.GetCommandName()}|Where-Object{$_})}
$orchestratorAst=Parse-Source $Orchestrator;$moduleAst=Parse-Source $Module;$bridgeAst=Parse-Source $Bridge;$appendAst=Parse-Source $StaticAppend
$orchestratorCommands=Command-Names $orchestratorAst
if(@($orchestratorCommands|Where-Object{$_-ceq'Import-Module'}).Count-ne 1-or@($orchestratorCommands|Where-Object{$_-ceq'Invoke-UIApprovedLiveCapture'}).Count-ne 1){throw 'Production orchestrator import or live call is detached.'}
$functions=@($moduleAst.FindAll({param($node)$node-is[Management.Automation.Language.FunctionDefinitionAst]},$true)|ForEach-Object{$_.Name})
foreach($name in @('Invoke-UIApprovedLiveCapture','Invoke-UILiveBridgeCall','Write-UILiveEvidenceRecord','Append-UILiveLedgerRow')){if(@($functions|Where-Object{$_-ceq$name}).Count-ne 1){throw 'Production live-origin helper definition is missing or renamed.'}}
$moduleCommands=Command-Names $moduleAst
foreach($name in @('Invoke-UILiveBridgeCall','Write-UILiveEvidenceRecord','Append-UILiveLedgerRow')){if(@($moduleCommands|Where-Object{$_-ceq$name}).Count-lt 1){throw 'Production live-origin helper call is detached.'}}
$moduleText=[IO.File]::ReadAllText((Resolve-Path $Module).Path)
foreach($needle in @('[object]::ReferenceEquals($Capability,$script:ActiveCapability)','$script:ActiveCapability=$null','$script:ActiveNonce=$null','$script:CapabilityConsumed=$true')){if(-not$moduleText.Contains($needle)){throw 'Private capability check or finally revocation is detached.'}}
$bridgeText=[IO.File]::ReadAllText((Resolve-Path $Bridge).Path)
if(-not$bridgeText.Contains("GitHub/lowlevel-computer-use-mcp/.venv/Scripts/lowlevel-computer-use-cheap.exe")-or-not$bridgeText.Contains('[Console]::In.ReadToEnd()')){throw 'Fixed driver executable or stdin protocol is detached.'}
$appendCommands=Command-Names $appendAst
if(@($appendAst.FindAll({param($node)$node-is[Management.Automation.Language.ThrowStatementAst]},$true)).Count-ne 1-or@($appendCommands|Where-Object{$_-ceq'Invoke-UISharingRetry'}).Count-gt 0){throw 'Public static append no longer fails closed.'}
Write-Output 'PASS: AST source proof binds the production import, live call, private writer, capability revocation, stdin bridge, fixed driver path, and static-append refusal.'
