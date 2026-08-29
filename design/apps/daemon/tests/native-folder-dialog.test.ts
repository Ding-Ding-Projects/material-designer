import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildWindowsFolderDialogCommand,
  NativeFolderDialogBusyError,
  NativeFolderDialogError,
  parseLinuxFolderDialogResult,
  parseFolderDialogStdout,
} from '../src/native-folder-dialog.js';

const serverSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/server.ts'),
  'utf8',
);
const mediaRouteSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/routes/media.ts'),
  'utf8',
);

function dialogError(message: string, code: string | number): Error & { code: string | number } {
  const err = new Error(message) as Error & { code: string | number };
  err.code = code;
  return err;
}

describe('native folder dialog helpers', () => {
  it('builds the Windows folder picker command with STA mode', () => {
    const command = buildWindowsFolderDialogCommand();

    expect(command.command).toBe('powershell.exe');
    expect(command.args).toContain('-NoProfile');
    expect(command.args).toContain('-Sta');
    expect(command.args).toContain('-Command');
  });

  it('creates a topmost owner form for the Windows dialog', () => {
    const script = buildWindowsFolderDialogCommand().args[3] ?? '';

    expect(script).toContain('$owner = New-Object System.Windows.Forms.Form;');
    expect(script).toContain('$owner.TopMost = $true;');
    expect(script).toContain('$owner.ShowInTaskbar = $true;');
    expect(script).toContain("$owner.StartPosition = 'CenterScreen';");
  });

  it('uses the full Explorer-style Windows folder browser', () => {
    const script = buildWindowsFolderDialogCommand().args[3] ?? '';

    expect(script).toMatch(/\$dialog = New-Object System\.Windows\.Forms\.OpenFileDialog;/);
    expect(script).not.toMatch(/\bFolderBrowserDialog\b/);
    expect(script).toMatch(/\$owner\.Text = 'Material Designer';/);
    expect(script).toMatch(/\$dialog\.AutoUpgradeEnabled = \$true;/);
    expect(script).toMatch(/\$dialog\.CheckFileExists = \$false;/);
    expect(script).toMatch(/\$dialog\.CheckPathExists = \$true;/);
    expect(script).toMatch(/\$dialog\.ValidateNames = \$false;/);
    expect(script).toMatch(/\$dialog\.InitialDirectory = \[Environment\]::GetFolderPath\('UserProfile'\);/);
    expect(script).toMatch(/\$dialog\.add_FileOk\(\{/);
    expect(script).toMatch(/\[IO\.Directory\]::Exists\(\$raw\)/);
    expect(script).toMatch(/\[IO\.Path\]::GetFileName\(\$raw\)/);
    expect(script).toMatch(/\[StringComparison\]::OrdinalIgnoreCase/);
    expect(script).toMatch(/\$eventArgs\.Cancel = \$true;/);
    expect(script).toMatch(/\$dialog\.ShowDialog\(\$owner\)/);
    expect(script).toMatch(/\[IO\.Path\]::GetDirectoryName\(\$raw\)/);
    expect(script).toMatch(/\[IO\.Path\]::GetFullPath\(\$parent\)/);
    expect(script).toMatch(/\$dialog\.Dispose\(\);/);
    expect(script).toMatch(/\$owner\.Dispose\(\);/);
  });

  it('keeps the localized title in the native command without allowing script injection', () => {
    const script = buildWindowsFolderDialogCommand("Choisissez l\'dossier").args[3] ?? '';

    expect(script).toMatch(/\$dialog\.Title = 'Choisissez l''dossier';/);
    expect(script).not.toMatch(/\$dialog\.Title = .*\$\(/);
  });

  it('bounds the title before escaping an apostrophe at the boundary', () => {
    const title = `${'x'.repeat(199)}'injected`;
    const script = buildWindowsFolderDialogCommand(title).args[3] ?? '';

    expect(script).toContain(`$dialog.Title = '${'x'.repeat(199)}''';`);
    expect(script).not.toContain('injected');
  });

  it.each([
    'C:\\Users\\Ada\\Code Space',
    "C:\\Users\\Ada\\O'Brien\\素材",
    'C:\\Users\\Ada\\Empty',
    'C:\\Users\\Ada\\Existing',
  ])('preserves Unicode, spaces, apostrophes, empty-folder and nonempty-folder paths', (path) => {
    expect(parseFolderDialogStdout(null, `${path}\r\n`)).toBe(path);
  });

  it('keeps file, missing-folder and invalid-candidate rejection at the FileOk boundary', () => {
    const script = buildWindowsFolderDialogCommand().args[3] ?? '';

    expect(script).toMatch(/\$candidate = \$null;/);
    expect(script).toMatch(/if \(\[IO\.Directory\]::Exists\(\$raw\)\)/);
    expect(script).toMatch(/elseif \(-not \[IO\.File\]::Exists\(\$raw\) -and \[string\]::Equals\(\[IO\.Path\]::GetFileName\(\$raw\)/);
    expect(script).toMatch(/\[IO\.FileAttributes\]::ReparsePoint/);
    expect(script).toMatch(/if \(\[string\]::IsNullOrWhiteSpace\(\$candidate\) -or -not \(& \$isRealDirectory \$candidate\)\)/);
    expect(script).toMatch(/\$eventArgs\.Cancel = \$true;/);
  });

  it('keeps cancellation and native failure distinct from a selected path', () => {
    expect(parseFolderDialogStdout(null, '\r\n')).toBeNull();
    expect(() => parseFolderDialogStdout(dialogError('native failure', 7), 'C:\\Users\\Ada\\Code\r\n'))
      .toThrow('Could not open folder picker: native failure');
    try {
      parseFolderDialogStdout(dialogError('native failure', 7), '');
    } catch (error) {
      expect(error).toBeInstanceOf(NativeFolderDialogError);
    }
    expect(parseFolderDialogStdout(null, 'C:\\Users\\Ada\\Code\r\n')).toBe('C:\\Users\\Ada\\Code');
  });

  it('parses a selected folder path from stdout', () => {
    expect(parseFolderDialogStdout(null, 'C:\\Users\\Ada\\Project\r\n')).toBe('C:\\Users\\Ada\\Project');
  });

  it('returns null when the dialog is cancelled', () => {
    expect(parseFolderDialogStdout(null, '\r\n')).toBeNull();
    expect(parseFolderDialogStdout(dialogError('user cancelled', -128), 'C:\\Users\\Ada\\Project\r\n'))
      .toBeNull();
  });

  it('rejects nonzero native commands even when stderr is empty', () => {
    expect(() => parseFolderDialogStdout(dialogError('', 23), ''))
      .toThrow('Could not open folder picker: native folder picker exited with code 23');
    expect(() => parseFolderDialogStdout(dialogError('spawn powershell failed', 'EPIPE'), ''))
      .toThrow('Could not open folder picker: spawn powershell failed');
  });

  it('keeps busy and native process results typed through the HTTP route', () => {
    const busy = new NativeFolderDialogBusyError();
    const failure = new NativeFolderDialogError('Could not open folder picker: process failed', 23);
    expect(busy.code).toBe('NATIVE_FOLDER_DIALOG_BUSY');
    expect(busy.reason).toBe('folder picker is already in progress');
    expect(busy.retryable).toBe(true);
    expect(failure.code).toBe('NATIVE_FOLDER_DIALOG_FAILED');
    expect(serverSource).toContain('new NativeFolderDialogBusyError()');
    expect(serverSource).toContain('const selected = parseFolderDialogStdout(err, stdout);');
    expect(serverSource).toContain('reject(dialogError);');
    expect(serverSource).not.toContain('if (err) return resolve(null);');
    expect(mediaRouteSource).toContain('isNativeFolderDialogBusyError(err)');
    expect(mediaRouteSource).toContain("'CONFLICT'");
    expect(mediaRouteSource).toContain('isNativeFolderDialogError(err)');
    expect(mediaRouteSource).toContain("'UPSTREAM_UNAVAILABLE'");
    expect(mediaRouteSource).toContain('res.json({ path: selected });');
  });

  it('parses a selected Linux folder path from stdout', () => {
    expect(parseLinuxFolderDialogResult(null, '/home/ada/project\n', '')).toBe('/home/ada/project');
  });

  it('keeps Linux cancel quiet even when zenity emits GTK warnings on stderr', () => {
    const err = dialogError('Command failed: zenity', 1);

    expect(parseLinuxFolderDialogResult(err, '', '(zenity:123): Gtk-WARNING **: Theme parsing error\n')).toBeNull();
  });

  it('throws for Linux folder picker display failures', () => {
    const err = dialogError('Command failed: zenity', 1);

    expect(() => parseLinuxFolderDialogResult(err, '', 'Gtk-WARNING **: cannot open display: :99')).toThrow(
      'Could not open folder picker: Gtk-WARNING **: cannot open display: :99',
    );
  });

  it('throws a stable message when zenity is missing', () => {
    const err = dialogError('spawn zenity ENOENT', 'ENOENT');

    expect(() => parseLinuxFolderDialogResult(err, '', '')).toThrow(
      'Could not open folder picker: zenity is not installed',
    );
  });
});
