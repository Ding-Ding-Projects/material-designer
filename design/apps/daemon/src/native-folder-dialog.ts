export interface NativeFolderDialogCommand {
  command: string;
  args: string[];
}

export const DEFAULT_FOLDER_DIALOG_TITLE = 'Select a code folder to link';

export const NATIVE_FOLDER_DIALOG_FAILURE_CODE = 'NATIVE_FOLDER_DIALOG_FAILED' as const;
export const NATIVE_FOLDER_DIALOG_BUSY_CODE = 'NATIVE_FOLDER_DIALOG_BUSY' as const;

export class NativeFolderDialogError extends Error {
  readonly code = NATIVE_FOLDER_DIALOG_FAILURE_CODE;
  readonly reason = 'native-command-failed' as const;

  constructor(
    message: string,
    readonly exitCode?: string | number,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'NativeFolderDialogError';
  }
}

export class NativeFolderDialogBusyError extends Error {
  readonly code = NATIVE_FOLDER_DIALOG_BUSY_CODE;
  readonly reason = 'folder picker is already in progress' as const;
  readonly retryable = true as const;

  constructor() {
    super('folder picker is already in progress');
    this.name = 'NativeFolderDialogBusyError';
  }
}

export function isNativeFolderDialogError(error: unknown): error is NativeFolderDialogError {
  return error instanceof NativeFolderDialogError
    || (error != null
      && typeof error === 'object'
      && (error as { code?: unknown }).code === NATIVE_FOLDER_DIALOG_FAILURE_CODE);
}

export function isNativeFolderDialogBusyError(error: unknown): error is NativeFolderDialogBusyError {
  return error instanceof NativeFolderDialogBusyError
    || (error != null
      && typeof error === 'object'
      && (error as { code?: unknown }).code === NATIVE_FOLDER_DIALOG_BUSY_CODE);
}

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
  if (error != null && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return error == null ? '' : String(error);
}

function nativeFolderDialogFailure(error: unknown): NativeFolderDialogError {
  const code = errorCode(error);
  const detail = errorMessage(error).trim() || (
    code == null ? 'native folder picker process failed' : `native folder picker exited with code ${String(code)}`
  );
  return new NativeFolderDialogError(`Could not open folder picker: ${detail}`,
    typeof code === 'string' || typeof code === 'number' ? code : undefined,
    error);
}

function isNativeCancellation(error: unknown): boolean {
  const code = errorCode(error);
  // osascript uses -128 for a user cancellation. Windows cancellation closes
  // the dialog normally and therefore arrives without an execFile error.
  return code === -128
    || code === '-128'
    || code === 'ECANCELED'
    || code === 'ERR_CANCELED';
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
  '$owner = $null;',
  '$dialog = $null;',
  'try {',
  '  $owner = New-Object System.Windows.Forms.Form;',
  "  $owner.Text = 'Material Designer';",
  '  $owner.TopMost = $true;',
  '  $owner.ShowInTaskbar = $true;',
  "  $owner.StartPosition = 'CenterScreen';",
  '  $owner.Width = 1;',
  '  $owner.Height = 1;',
  // FolderBrowserDialog is the legacy tree-only surface. OpenFileDialog uses
  // the full Explorer shell: address/breadcrumb navigation, back/forward/up,
  // sidebar locations, search, list/details views, and inline folder creation.
  // A non-existent sentinel filename lets the user select the directory they
  // are currently browsing without requiring a real file.
  '  $dialog = New-Object System.Windows.Forms.OpenFileDialog;',
  `$dialog.Title = '${safeTitle}';`,
  "$sentinel = '__MATERIAL_DESIGNER_SELECT_FOLDER__';",
  '  $script:selectedPath = $null;',
  "  $dialog.Filter = 'Folders|*.folder';",
  '  $dialog.FileName = $sentinel;',
  '  $dialog.AddExtension = $false;',
  '  $dialog.AutoUpgradeEnabled = $true;',
  '  $dialog.CheckFileExists = $false;',
  '  $dialog.CheckPathExists = $true;',
  '  $dialog.ValidateNames = $false;',
  // Preserve link spelling so the reparse-point check below can reject the
  // selected path instead of receiving an already-followed target path.
  '  $dialog.DereferenceLinks = $false;',
  '  $dialog.RestoreDirectory = $true;',
  "  $dialog.InitialDirectory = [Environment]::GetFolderPath('UserProfile');",
  // Directory.Exists follows junctions and symlinks. Inspect every existing
  // component with DirectoryInfo.Attributes instead of trusting that result.
  '  $isRealDirectory = {',
  '    param([string]$candidatePath)',
  '    try {',
  '      if (-not [IO.Directory]::Exists($candidatePath)) { return $false; }',
  '      $current = New-Object -TypeName IO.DirectoryInfo -ArgumentList $candidatePath;',
  '      while ($null -ne $current) {',
  '        if (($current.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { return $false; }',
  '        if ($null -eq $current.Parent) { break; }',
  '        $current = $current.Parent;',
  '      }',
  '      return $true;',
  '    } catch { return $false; }',
  '  };',
  '  $dialog.add_FileOk({',
  '    param($sender, $eventArgs)',
  '    $raw = [string]$dialog.FileName;',
  '    $candidate = $null;',
  '    try {',
  '      if ([IO.Directory]::Exists($raw)) {',
  '        $candidate = [IO.Path]::GetFullPath($raw);',
  // A real file named like the sentinel must never become its parent.
  '      } elseif (-not [IO.File]::Exists($raw) -and [string]::Equals([IO.Path]::GetFileName($raw), $sentinel, [StringComparison]::OrdinalIgnoreCase)) {',
  '        $parent = [IO.Path]::GetDirectoryName($raw);',
  '        if (-not [string]::IsNullOrWhiteSpace($parent)) { $candidate = [IO.Path]::GetFullPath($parent); }',
  '      }',
  '    } catch { $candidate = $null; }',
  '    if ([string]::IsNullOrWhiteSpace($candidate) -or -not (& $isRealDirectory $candidate)) {',
  '      $eventArgs.Cancel = $true;',
  '      return;',
  '    }',
  '    $script:selectedPath = $candidate;',
  '  });',
  '  if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {',
  '    $script:selectedPath',
  '  }',
  '} finally {',
  '  if ($null -ne $dialog) { try { $dialog.Dispose(); } catch {} }',
  '  if ($null -ne $owner) { try { $owner.Dispose(); } catch {} }',
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
    if (isNativeCancellation(error)) return null;
    throw nativeFolderDialogFailure(error);
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
      throw new NativeFolderDialogError(`Could not open folder picker: ${hardFailure}`,
        typeof code === 'string' || typeof code === 'number' ? code : undefined,
        error);
    }
    if (code === 1) return null;
    const detail = stderrText || errorMessage(error) || (
      code == null ? 'native folder picker process failed' : `native folder picker exited with code ${String(code)}`
    );
    throw new NativeFolderDialogError(`Could not open folder picker: ${detail}`,
      typeof code === 'string' || typeof code === 'number' ? code : undefined,
      error);
  }

  const selectedPath = stdout.trim();
  return selectedPath.length > 0 ? selectedPath : null;
}
