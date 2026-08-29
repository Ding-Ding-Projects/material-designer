[CmdletBinding()]
param([switch]$SelfTest)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

$checks = @(
  @{ Id='app-history-mount'; Path='design/apps/web/src/App.tsx'; Needle='<VersionHistoryDialog />' },
  @{ Id='app-notification-host'; Path='design/apps/web/src/App.tsx'; Needle='<NotificationHost />' },
  @{ Id='chrome-notification-center'; Path='design/apps/web/src/components/WorkspaceTabsBar.tsx'; Needle='<NotificationCenter />' },
  @{ Id='history-menu-entry'; Path='design/apps/web/src/components/EntrySettingsMenu.tsx'; Needle='data-testid="entry-open-version-history"' },
  @{ Id='history-palette-command'; Path='design/apps/web/src/components/command-palette/commands.ts'; Needle="id: 'command.openVersionHistory'" },
  @{ Id='notification-persistence'; Path='design/apps/web/src/components/notifications/notificationStore.ts'; Needle="NOTIFICATION_STORAGE_KEY = 'open-design:notifications:v1'" },
  @{ Id='notification-delete-receipts'; Path='design/apps/web/src/components/notifications/notificationStore.ts'; Needle="outcomes: requestedIds.map" },
  @{ Id='notification-registry-mounted'; Path='design/apps/web/src/components/universal-settings/universalSettings.ts'; Needle="{ id: 'notification-center', path: 'design/apps/web/src/components/notifications/NotificationCenter.tsx', status: 'source-mounted' }" },
  @{ Id='editor-live-post'; Path='design/apps/web/src/runtime/export-adapters.ts'; Needle="method: 'POST'" },
  @{ Id='editor-live-endpoint'; Path='design/apps/web/src/runtime/export-adapters.ts'; Needle="endpoint: '/api/editor/open'" },
  @{ Id='export-mount-consumer'; Path='design/apps/web/src/components/HandoffButton.tsx'; Needle='EXPORT_SURFACE.openInVsCode' },
  @{ Id='host-lock-list'; Path='design/apps/web/src/components/SettingsDialog.tsx'; Needle='host.toyLocks.list()' },
  @{ Id='host-lock-verify'; Path='design/apps/web/src/components/SettingsDialog.tsx'; Needle='host.toyLocks.verify({' },
  @{ Id='settings-tab-state'; Path='design/apps/web/src/components/settings/SettingsTabStrip.tsx'; Needle="SETTINGS_TAB_STATE_KEY = 'open-design:settings-tabs:v2'" },
  @{ Id='settings-pointer-reorder'; Path='design/apps/web/src/components/settings/SettingsTabStrip.tsx'; Needle='onDragStart={(event) =>' },
  @{ Id='settings-group-state'; Path='design/apps/web/src/components/settings/SettingsTabStrip.tsx'; Needle='data-testid="settings-tabs-group-manager"' },
  @{ Id='settings-four-searches'; Path='design/apps/web/src/components/settings/SettingsTabStrip.tsx'; Needle='data-testid="settings-tabs-four-searches"' },
  @{ Id='settings-bulk-close'; Path='design/apps/web/src/components/settings/SettingsTabStrip.tsx'; Needle='data-testid="settings-tabs-bulk-close"' },
  @{ Id='history-action-contract'; Path='design/packages/contracts/src/api/history.ts'; Needle='actionIds?: HistoryActionId[]' },
  @{ Id='history-action-trailer'; Path='design/apps/daemon/src/history/store.ts'; Needle="TRAILER_ACTIONS = 'od-history-actions'" },
  @{ Id='site-state-v2'; Path='site/assets/js/tabs.js'; Needle='const STORAGE_VERSION = 2;' },
  @{ Id='site-groups'; Path='site/assets/js/tabs.js'; Needle='createGroup(name =' },
  @{ Id='site-four-searches'; Path='site/assets/js/tabs.js'; Needle="owner: 'tab-master-search'" },
  @{ Id='site-bulk-close'; Path='site/assets/js/tabs.js'; Needle='bulkClose(query,' },
  @{ Id='site-four-docks'; Path='site/assets/js/tabs.js'; Needle="['left', 'right', 'top', 'bottom']" }
)

function Test-Checks([hashtable]$Overrides = @{}) {
  $failures = [System.Collections.Generic.List[string]]::new()
  foreach ($check in $checks) {
    $full = Join-Path $root $check.Path
    $text = if ($Overrides.ContainsKey($check.Id)) { [string]$Overrides[$check.Id] } else { [IO.File]::ReadAllText($full) }
    $count = ([regex]::Matches($text, [regex]::Escape([string]$check.Needle))).Count
    if ($count -lt 1) { $failures.Add("$($check.Id): exact boundary missing") }
  }
  return $failures
}

$green = Test-Checks
if ($green.Count -gt 0) { throw ($green -join [Environment]::NewLine) }

if ($SelfTest) {
  foreach ($check in $checks) {
    $full = Join-Path $root $check.Path
    $source = [IO.File]::ReadAllText($full)
    $broken = $source.Replace([string]$check.Needle, "removed-$($check.Id)")
    if ($broken -eq $source) { throw "self-test could not remove $($check.Id)" }
    $red = Test-Checks @{ $check.Id = $broken }
    if (-not ($red -match "^$([regex]::Escape($check.Id)):")) {
      throw "self-test stayed green for $($check.Id)"
    }
  }
  Write-Output "PASS: $($checks.Count) completion boundaries turned red individually and restored green"
} else {
  Write-Output "PASS: $($checks.Count) tabs, history, notification, export, editor and lock boundaries present"
}
