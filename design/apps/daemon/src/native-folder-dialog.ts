export interface NativeFolderDialogCommand {
  command: string;
  args: string[];
}

export const DEFAULT_FOLDER_DIALOG_TITLE = 'Select a code folder to link';

function escapePowerShellSingleQuotedString(value: string): string {
  // Bound the source characters before doubling apostrophes. Slicing the
  // escaped value can leave an unmatched quote when character 200 is an
  // apostrophe, turning a harmless title into a malformed command.
  return value.slice(0, 200).replace(/'/g, "''");
}

function errorCode(error: unknown): unknown {
  return error && typeof error === 'object' && 'code' in error
    ? (error as { code?: unknown }).code
    : undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

function hardLinuxFolderDialogFailure(error: unknown, stderrText: string): string | null {
  const code = errorCode(error);
  if (code === 'ENOENT') return 'zenity is not installed';
  if (/cannot open display/i.test(stderrText)) return stderrText;
  if (/no such file or directory/i.test(stderrText) && /zenity/i.test(stderrText)) return stderrText;
  return null;
}

function windowsFolderDialogScript(title: string): string {
  const safeTitle = escapePowerShellSingleQuotedString(title.trim() || DEFAULT_FOLDER_DIALOG_TITLE);
  return [
  'Add-Type -AssemblyName System.Windows.Forms;',
  '$owner = New-Object System.Windows.Forms.Form;',
  "$owner.Text = 'Material Designer';",
  '$owner.TopMost = $true;',
  '$owner.ShowInTaskbar = $true;',
  "$owner.StartPosition = 'CenterScreen';",
  '$owner.Width = 1;',
  '$owner.Height = 1;',
  // FolderBrowserDialog is the legacy tree-only surface. OpenFileDialog uses
  // the full Explorer shell: address/breadcrumb navigation, back/forward/up,
  // sidebar locations, search, list/details views, and inline folder creation.
  // A non-existent sentinel filename lets the user select the directory they
  // are currently browsing without requiring a real file.
  '$dialog = New-Object System.Windows.Forms.OpenFileDialog;',
  `$dialog.Title = '${safeTitle}';`,
  "$sentinel = '__MATERIAL_DESIGNER_SELECT_FOLDER__';",
  // The picker must not hand a reparse point or a directory reached through
  // one to the daemon. Directory.Exists follows junctions and symlinks, so
  // inspect every existing component with DirectoryInfo.Attributes instead
  // of treating that positive result as a trustworthy folder boundary.
  '$isRealDirectory = {',
  '  param([string]$candidatePath)',
  '  try {',
  '    if (-not [IO.Directory]::Exists($candidatePath)) { return $false; }',
  '    $current = New-Object -TypeName IO.DirectoryInfo -ArgumentList $candidatePath;',
  '    while ($null -ne $current) {',
  '      if (($current.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { return $false; }',
  '      if ($null -eq $current.Parent) { break; }',
  '      $current = $current.Parent;',
  '    }',
  '    return $true;',
  '  } catch { return $false; }',
  '};',
  '$script:selectedPath = $null;',
  "$dialog.Filter = 'Folders|*.folder';",
  '$dialog.FileName = $sentinel;',
  '$dialog.AddExtension = $false;',
  '$dialog.AutoUpgradeEnabled = $true;',
  '$dialog.CheckFileExists = $false;',
  '$dialog.CheckPathExists = $true;',
  '$dialog.ValidateNames = $false;',
  // Preserve link spelling so the reparse-point check below can reject the
  // selected path instead of receiving an already-followed target path.
  '$dialog.DereferenceLinks = $false;',
  '$dialog.RestoreDirectory = $true;',
  "$dialog.InitialDirectory = [Environment]::GetFolderPath('UserProfile');",
  '$dialog.add_FileOk({',
  '  param($sender, $eventArgs)',
  '  $raw = [string]$dialog.FileName;',
  '  $candidate = $null;',
  '  try {',
  '    if ([IO.Directory]::Exists($raw)) {',
  '      $candidate = [IO.Path]::GetFullPath($raw);',
  '    } elseif ([string]::Equals([IO.Path]::GetFileName($raw), $sentinel, [StringComparison]::OrdinalIgnoreCase)) {',
  '      $parent = [IO.Path]::GetDirectoryName($raw);',
  '      if (-not [string]::IsNullOrWhiteSpace($parent)) { $candidate = [IO.Path]::GetFullPath($parent); }',
  '    }',
  '  } catch { $candidate = $null; }',
  '  if ([string]::IsNullOrWhiteSpace($candidate) -or -not (& $isRealDirectory $candidate)) {',
  '    $eventArgs.Cancel = $true;',
  '    return;',
  '  }',
  '  $script:selectedPath = $candidate;',
  '});',
  'try {',
  '  if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {',
  '    $script:selectedPath',
  '  }',
  '} finally {',
  '  $dialog.Dispose();',
  '  $owner.Dispose();',
  '}',
  ].join(' ');
}

export function buildWindowsFolderDialogCommand(title = DEFAULT_FOLDER_DIALOG_TITLE): NativeFolderDialogCommand {
  return {
    command: 'powershell.exe',
    args: ['-NoProfile', '-Sta', '-Command', windowsFolderDialogScript(title)],
  };
}

export function parseFolderDialogStdout(error: unknown, stdout: string): string | null {
  if (error) {
    return null;
  }

  const selectedPath = stdout.trim();
  return selectedPath.length > 0 ? selectedPath : null;
}

export function parseLinuxFolderDialogResult(error: unknown, stdout: string, stderr: string): string | null {
  if (error) {
    const stderrText = stderr.trim();
    const code = errorCode(error);
    const hardFailure = hardLinuxFolderDialogFailure(error, stderrText);
    if (hardFailure) {
      throw new Error(`Could not open folder picker: ${hardFailure}`);
    }
    if (code === 1) return null;
    throw new Error(`Could not open folder picker: ${stderrText || errorMessage(error)}`);
  }

  const selectedPath = stdout.trim();
  return selectedPath.length > 0 ? selectedPath : null;
}
