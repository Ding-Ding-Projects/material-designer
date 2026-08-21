export interface NativeFolderDialogCommand {
  command: string;
  args: string[];
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

const WINDOWS_FOLDER_DIALOG_SCRIPT = [
  'Add-Type -AssemblyName System.Windows.Forms;',
  '$owner = New-Object System.Windows.Forms.Form;',
  "$owner.Text = 'Open Design';",
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
  "$dialog.Title = 'Select a code folder to link';",
  "$sentinel = '__MATERIAL_DESIGNER_SELECT_FOLDER__';",
  '$script:selectedPath = $null;',
  "$dialog.Filter = 'Folders|*.folder';",
  '$dialog.FileName = $sentinel;',
  '$dialog.AddExtension = $false;',
  '$dialog.AutoUpgradeEnabled = $true;',
  '$dialog.CheckFileExists = $false;',
  '$dialog.CheckPathExists = $true;',
  '$dialog.ValidateNames = $false;',
  '$dialog.DereferenceLinks = $true;',
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
  '  if ([string]::IsNullOrWhiteSpace($candidate) -or -not [IO.Directory]::Exists($candidate)) {',
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

export function buildWindowsFolderDialogCommand(): NativeFolderDialogCommand {
  return {
    command: 'powershell.exe',
    args: ['-NoProfile', '-Sta', '-Command', WINDOWS_FOLDER_DIALOG_SCRIPT],
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
