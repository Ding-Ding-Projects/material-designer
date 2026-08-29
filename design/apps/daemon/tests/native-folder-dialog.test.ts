import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  buildWindowsFolderDialogCommand,
  parseLinuxFolderDialogResult,
  parseFolderDialogStdout,
} from '../src/native-folder-dialog.js';

function dialogError(message: string, code: string | number): Error & { code: string | number } {
  const err = new Error(message) as Error & { code: string | number };
  err.code = code;
  return err;
}

const importRoutesSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/import-export-routes.ts'),
  'utf8',
);
const importRoutesAst = ts.createSourceFile(
  'import-export-routes.ts',
  importRoutesSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);
const serverSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/server.ts'),
  'utf8',
);
const serverAst = ts.createSourceFile(
  'server.ts',
  serverSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);

function callName(node: ts.CallExpression): string | null {
  return ts.isIdentifier(node.expression) ? node.expression.text : null;
}

function allNodes(root: ts.Node): ts.Node[] {
  const nodes: ts.Node[] = [];
  const visit = (node: ts.Node): void => {
    nodes.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return nodes;
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
    expect(script).toMatch(/\$dialog\.DereferenceLinks = \$false;/);
    expect(script).toMatch(/\[IO\.FileAttributes\]::ReparsePoint/);
    expect(script).toMatch(/\$isRealDirectory/);
    expect(script).toMatch(/\$owner = \$null;\s+\$dialog = \$null;\s+try \{/);
    expect(script).toMatch(/if \(\$null -ne \$dialog\) \{ try \{ \$dialog\.Dispose\(\); \} catch \{\} \}/);
    expect(script).toMatch(/if \(\$null -ne \$owner\) \{ try \{ \$owner\.Dispose\(\); \} catch \{\} \}/);
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

  it('escapes hostile title syntax as data inside one PowerShell literal', () => {
    const script = buildWindowsFolderDialogCommand("x'; Write-Output 'pwned").args[3] ?? '';

    expect(script).toContain("$dialog.Title = 'x''; Write-Output ''pwned';");
    expect(script).not.toContain("$dialog.Title = 'x'; Write-Output");
  });

  it('bounds title input before escaping apostrophes so the PowerShell literal stays closed', () => {
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
    expect(script).toMatch(/if \(\[string\]::IsNullOrWhiteSpace\(\$candidate\) -or -not \(& \$isRealDirectory \$candidate\)\)/);
    expect(script).toMatch(/\$eventArgs\.Cancel = \$true;/);
  });

  it('checks every lexical parent for a reparse point before accepting the current folder sentinel', () => {
    const script = buildWindowsFolderDialogCommand().args[3] ?? '';

    expect(script).toMatch(/\$current = New-Object -TypeName IO\.DirectoryInfo -ArgumentList \$candidatePath;/);
    expect(script).toMatch(/while \(\$null -ne \$current\)/);
    expect(script).toMatch(/\$current = \$current\.Parent;/);
    expect(script).toMatch(/-not \[IO\.File\]::Exists\(\$raw\)/);
  });

  it('refuses a real file collision at the sentinel path', () => {
    const script = buildWindowsFolderDialogCommand().args[3] ?? '';

    expect(script).toMatch(/-not \[IO\.File\]::Exists\(\$raw\) -and \[string\]::Equals/);
    expect(script).not.toMatch(/elseif \(\[string\]::Equals\(\[IO\.Path\]::GetFileName\(\$raw\)/);
  });

  it('turns red when the sentinel collision guard is removed', () => {
    const script = buildWindowsFolderDialogCommand().args[3] ?? '';
    const brokenScript = script.replace('-not [IO.File]::Exists($raw) -and ', '');

    expect(brokenScript).not.toContain('-not [IO.File]::Exists($raw) -and ');
    expect(script).toContain('-not [IO.File]::Exists($raw) -and ');
  });

  it('keeps direct daemon picker calls single-flight with an AST-visible mutex', () => {
    expect(serverAst.parseDiagnostics).toHaveLength(0);
    const nodes = allNodes(serverAst);
    const mutex = nodes.find(
      (node): node is ts.VariableDeclaration =>
        ts.isVariableDeclaration(node)
        && ts.isIdentifier(node.name)
        && node.name.text === 'nativeFolderDialogInFlight',
    );
    expect(mutex).toBeDefined();
    const dialogFunction = nodes.find(
      (node): node is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(node)
        && node.name?.text === 'openNativeFolderDialog',
    );
    expect(dialogFunction).toBeDefined();
    const functionNodes = allNodes(dialogFunction!);
    const rejectCall = functionNodes.find(
      (node): node is ts.CallExpression =>
        ts.isCallExpression(node)
        && ts.isPropertyAccessExpression(node.expression)
        && node.expression.expression.getText(serverAst) === 'Promise'
        && node.expression.name.text === 'reject',
    );
    expect(rejectCall).toBeDefined();
    expect(dialogFunction!.getText(serverAst)).toContain('nativeFolderDialogInFlight = operation;');
    expect(dialogFunction!.getText(serverAst)).toContain('operation.finally');
  });

  it('turns red when the daemon busy result is removed from the AST-visible mutex', () => {
    const brokenSource = serverSource.replace(
      "return Promise.reject(new Error('folder picker is already in progress'));",
      "return Promise.resolve(null);",
    );
    const brokenAst = ts.createSourceFile(
      'server-broken.ts',
      brokenSource,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const dialogFunction = allNodes(brokenAst).find(
      (node): node is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(node)
        && node.name?.text === 'openNativeFolderDialog',
    );
    expect(dialogFunction).toBeDefined();
    const rejectCalls = allNodes(dialogFunction!).filter(
      (node): node is ts.CallExpression =>
        ts.isCallExpression(node)
        && ts.isPropertyAccessExpression(node.expression)
        && node.expression.expression.getText(brokenAst) === 'Promise'
        && node.expression.name.text === 'reject',
    );
    expect(rejectCalls).toHaveLength(0);
    expect(rejectCalls).not.toHaveLength(1);
  });

  it('keeps daemon-side revalidation syntax-aware and immediately ahead of folder consumption', () => {
    expect(importRoutesAst.parseDiagnostics).toHaveLength(0);
    const nodes = allNodes(importRoutesAst);
    const helper = nodes.find(
      (node): node is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(node)
        && node.name?.text === 'revalidateSelectedFolder',
    );
    expect(helper).toBeDefined();
    const helperText = helper!.getText(importRoutesAst);
    expect(helperText).toContain('fs.promises.realpath(selectedPath)');
    expect(helperText).toContain('fs.promises.lstat(current)');
    expect(helperText).toContain('entry.isSymbolicLink()');
    expect(helperText).toContain('path.parse(current).root');
    expect(helperText).toContain('path.dirname(current)');

    const revalidationStatements = nodes.filter(
      (node): node is ts.VariableStatement =>
        ts.isVariableStatement(node)
        && node.declarationList.declarations.some(
          (declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === 'revalidationFailure',
        ),
    );
    expect(revalidationStatements).toHaveLength(2);
    for (const statement of revalidationStatements) {
      expect(ts.isBlock(statement.parent)).toBe(true);
      const block = statement.parent as ts.Block;
      const index = block.statements.indexOf(statement);
      const followUp = block.statements[index + 1];
      const consumption = block.statements[index + 2];
      expect(ts.isIfStatement(followUp)).toBe(true);
      expect(ts.isVariableStatement(consumption)).toBe(true);
      expect(consumption.getText(importRoutesAst)).toContain('entryFile');
    }

    const revalidationCalls = nodes.filter(
      (node): node is ts.CallExpression => ts.isCallExpression(node) && callName(node) === 'revalidateSelectedFolder',
    );
    expect(revalidationCalls).toHaveLength(2);
  });

  it('turns red when one daemon-side revalidation call is removed', () => {
    const brokenSource = importRoutesSource.replace(
      'const revalidationFailure = await revalidateSelectedFolder(normalizedPath);',
      '',
    );
    const brokenAst = ts.createSourceFile(
      'import-export-routes-broken.ts',
      brokenSource,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const remainingCalls = allNodes(brokenAst).filter(
      (node): node is ts.CallExpression => ts.isCallExpression(node) && callName(node) === 'revalidateSelectedFolder',
    );
    expect(remainingCalls).toHaveLength(1);
    expect(remainingCalls).not.toHaveLength(2);
  });

  it('keeps cancellation and native failure distinct from a selected path', () => {
    expect(parseFolderDialogStdout(null, '\r\n')).toBeNull();
    expect(parseFolderDialogStdout(new Error('native failure'), 'C:\\Users\\Ada\\Code\r\n')).toBeNull();
    expect(parseFolderDialogStdout(null, 'C:\\Users\\Ada\\Code\r\n')).toBe('C:\\Users\\Ada\\Code');
  });

  it('parses a selected folder path from stdout', () => {
    expect(parseFolderDialogStdout(null, 'C:\\Users\\Ada\\Project\r\n')).toBe('C:\\Users\\Ada\\Project');
  });

  it('returns null when the dialog is cancelled', () => {
    expect(parseFolderDialogStdout(null, '\r\n')).toBeNull();
  });

  it('returns null when the native dialog command fails', () => {
    expect(parseFolderDialogStdout(new Error('cancelled'), 'C:\\Users\\Ada\\Project\r\n')).toBeNull();
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
