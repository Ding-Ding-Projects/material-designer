import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../src/main/runtime.ts'),
  'utf8',
);
const sourceAst = ts.createSourceFile(
  'runtime.ts',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);

function allNodes(root: ts.Node): ts.Node[] {
  const nodes: ts.Node[] = [];
  const visit = (node: ts.Node): void => {
    nodes.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return nodes;
}

function callIdentifier(node: ts.Expression): string | null {
  return ts.isIdentifier(node) ? node.text : null;
}

describe('desktop folder picker source contract', () => {
  function handlerSource(channel: string): string {
    const marker = `ipcMain.handle(\n    "${channel}",`;
    const start = source.indexOf(marker);
    expect(start, channel).toBeGreaterThanOrEqual(0);
    const nextHandler = source.indexOf('\n  ipcMain.handle(', start + marker.length);
    return source.slice(start, nextHandler >= 0 ? nextHandler : source.length);
  }

  function pickerFunctionSource(): string {
    const start = source.indexOf('async function showDirectoryPickerForSender(');
    const end = source.indexOf('export async function createDesktopRuntime(', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
  }

  function expectAwaitGuards(body: string, label: string): void {
    const awaitPositions = [...body.matchAll(/\bawait\b/g)].map((match) => match.index ?? -1);
    const guardPositions = [...body.matchAll(/requireFolderPickerSender\(event\);/g)]
      .map((match) => match.index ?? -1);
    expect(awaitPositions.length, `${label} await count`).toBeGreaterThan(0);
    expect(guardPositions.length, `${label} guard count`).toBeGreaterThanOrEqual(awaitPositions.length);
    for (const awaitPosition of awaitPositions) {
      const guardPosition = guardPositions.find((candidate) => candidate > awaitPosition);
      expect(guardPosition, `${label} await at ${awaitPosition}`).toBeDefined();
      const nextAwait = awaitPositions.find((candidate) => candidate > awaitPosition);
      expect(nextAwait == null || (guardPosition as number) < nextAwait, `${label} guard ordering`).toBe(true);
    }
  }

  it('keeps the native Explorer dialog on the originating parent and restores parent focus', () => {
    const picker = pickerFunctionSource();
    expect(picker).toMatch(/const parent = BrowserWindow\.fromWebContents\(sender\);/);
    expect(picker).not.toContain('BrowserWindow.getFocusedWindow()');
    expect(source).toMatch(/properties: \["openDirectory", "createDirectory", "dontAddToRecent"\]/);
    expect(source).toMatch(/dialog\.showOpenDialog\(parent, pickerOptions\)/);
    expect(picker).toMatch(/result = await dialog\.showOpenDialog\(parent, pickerOptions\);/);
    expect(picker).toMatch(/assertOwnerStillLive\(\);/);
    expect(picker).toMatch(/parent\.focus\(\);/);
    expect(picker).toMatch(/destroyed \|\| current !== parent/);
  });

  it('rejects folder IPC calls from every renderer except the main window frame', () => {
    for (const channel of [
      'dialog:pick-and-import',
      'dialog:pick-and-replace-working-dir',
    ]) {
      const body = handlerSource(channel);
      expect(body).toMatch(/async \(event[^\n]*\) => \{\s*requireFolderPickerSender\(event\);/);
    }
    const homeBodyStart = source.indexOf('ipcMain.handle("dialog:pick-working-dir"');
    expect(homeBodyStart).toBeGreaterThanOrEqual(0);
    const homeBody = source.slice(homeBodyStart, source.indexOf('\n  // shell.openPath', homeBodyStart));
    expect(homeBody).toMatch(/async \(event[^\n]*\) => \{\s*requireFolderPickerSender\(event\);/);
    expect(source).toMatch(
      /event\.sender !== owner\.webContents\s*\|\|\s*event\.senderFrame !== owner\.webContents\.mainFrame/,
    );
    const windowStart = source.indexOf('const window = new BrowserWindow({');
    const captureFilterStart = source.indexOf('const captureNetworkFilter', windowStart);
    expect(windowStart).toBeGreaterThanOrEqual(0);
    expect(captureFilterStart).toBeGreaterThan(windowStart);
    expect(source.slice(windowStart, captureFilterStart)).toContain('folderPickerMainWindow = window;');
    expect(source.slice(source.indexOf('ipcMain.removeHandler("dialog:pick-folder"'), windowStart))
      .toContain('let folderPickerMainWindow: BrowserWindow | null = null;');
  });

  it('uses exact AST ownership for folder IPC registration and owner assignment', () => {
    expect(sourceAst.parseDiagnostics).toHaveLength(0);
    const channels = new Set([
      'dialog:pick-and-import',
      'dialog:pick-and-replace-working-dir',
      'dialog:pick-working-dir',
    ]);
    const handlers = allNodes(sourceAst).filter(
      (node): node is ts.CallExpression => {
        if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false;
        if (node.expression.expression.getText(sourceAst) !== 'ipcMain') return false;
        if (node.expression.name.text !== 'handle') return false;
        const first = node.arguments[0];
        return ts.isStringLiteral(first) && channels.has(first.text);
      },
    );
    expect(handlers).toHaveLength(3);
    for (const handler of handlers) {
      const callback = handler.arguments[1];
      expect(callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))).toBe(true);
      const body = callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))
        ? callback.body
        : undefined;
      expect(body && ts.isBlock(body)).toBe(true);
      const firstStatement = body && ts.isBlock(body) ? body.statements[0] : undefined;
      expect(firstStatement && ts.isExpressionStatement(firstStatement)).toBe(true);
      const firstExpression = firstStatement && ts.isExpressionStatement(firstStatement)
        ? firstStatement.expression
        : undefined;
      expect(firstExpression && ts.isCallExpression(firstExpression)).toBe(true);
      if (firstExpression && ts.isCallExpression(firstExpression)) {
        expect(callIdentifier(firstExpression.expression)).toBe('requireFolderPickerSender');
        expect(callIdentifier(firstExpression.arguments[0]!)).toBe('event');
      }
    }

    const picker = allNodes(sourceAst).find(
      (node): node is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(node)
        && node.name?.text === 'showDirectoryPickerForSender',
    );
    expect(picker).toBeDefined();
    const pickerCalls = allNodes(picker!).filter(
      (node): node is ts.CallExpression => ts.isCallExpression(node),
    );
    expect(pickerCalls.some((node) =>
      ts.isPropertyAccessExpression(node.expression)
      && node.expression.expression.getText(sourceAst) === 'BrowserWindow'
      && node.expression.name.text === 'getFocusedWindow',
    )).toBe(false);
    const dialogCall = pickerCalls.find((node) =>
      ts.isPropertyAccessExpression(node.expression)
      && node.expression.expression.getText(sourceAst) === 'dialog'
      && node.expression.name.text === 'showOpenDialog',
    );
    expect(dialogCall).toBeDefined();
    expect(callIdentifier(dialogCall!.arguments[0]!)).toBe('parent');

    const assignment = allNodes(sourceAst).find(
      (node): node is ts.BinaryExpression =>
        ts.isBinaryExpression(node)
        && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
        && node.left.getText(sourceAst) === 'folderPickerMainWindow'
        && node.right.getText(sourceAst) === 'window',
    );
    expect(assignment).toBeDefined();
    expect(ts.isExpressionStatement(assignment!.parent)).toBe(true);

    const mutexCalls = allNodes(sourceAst).filter(
      (node): node is ts.CallExpression =>
        ts.isCallExpression(node)
        && callIdentifier(node.expression) === 'acquireFolderOperation',
    );
    expect(mutexCalls).toHaveLength(3);
    expect(source).toContain('let folderOperationInFlight = false;');
    expect(source).toContain('return { ok: false, reason: "folder picker is already in progress" };');
  });

  it('turns red when the AST-visible single-flight call is removed', () => {
    const brokenSource = source.replace('const releaseFolderOperation = acquireFolderOperation();', '');
    const brokenAst = ts.createSourceFile(
      'runtime-broken.ts',
      brokenSource,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const mutexCalls = allNodes(brokenAst).filter(
      (node): node is ts.CallExpression =>
        ts.isCallExpression(node)
        && callIdentifier(node.expression) === 'acquireFolderOperation',
    );
    expect(mutexCalls).toHaveLength(2);
    expect(mutexCalls).not.toHaveLength(3);
  });

  it('never substitutes a focused window when the initiating owner disappears', () => {
    const picker = pickerFunctionSource();
    expect(picker).not.toContain('BrowserWindow.getFocusedWindow()');
    expect(picker).toMatch(/if \(parent == null \|\| parent\.isDestroyed\(\)\)/);
    expect(picker).toMatch(/throw new Error\("folder picker owner window is unavailable"\)/);
    expect(picker).toMatch(/throw new Error\("folder picker owner window was destroyed"\)/);
  });

  it('keeps paths and credentials out of folder-picker logging', () => {
    const folderHandlers = [
      handlerSource('dialog:pick-and-import'),
      handlerSource('dialog:pick-and-replace-working-dir'),
      source.slice(
        source.indexOf('ipcMain.handle("dialog:pick-working-dir"'),
        source.indexOf('\n  // shell.openPath', source.indexOf('ipcMain.handle("dialog:pick-working-dir"')),
      ),
    ].join('\n');
    expect(folderHandlers).not.toMatch(/console\.(?:log|info|warn|error)\s*\(/);
    expect(folderHandlers).not.toMatch(
      /console\.(?:log|info|warn|error)[^\n]*(?:desktopAuthSecret|token|baseDir|filePaths)/,
    );
  });

  it('keeps cancellation separate from empty-path and daemon failure results', () => {
    expect(source).toMatch(/if \(result\.canceled \|\| result\.filePaths\.length === 0\) \{\s*return \{ ok: false, canceled: true \};/s);
    expect(source).toMatch(/if \(baseDir\.length === 0\) \{\s*return \{ ok: false, reason: "picker returned an empty path" \};/s);
    expect(source).toMatch(/const response = await pickAndImportFolder\(\{/);
    expect(source).toMatch(/const response = await pickAndReplaceWorkingDir\(\{/);
  });

  it('revalidates the captured owner after each folder-operation await', () => {
    for (const [channel, minimumGuards] of [
      ['dialog:pick-and-import', 5],
      ['dialog:pick-and-replace-working-dir', 5],
    ] as const) {
      const body = handlerSource(channel);
      expect((body.match(/requireFolderPickerSender\(event\);/g) ?? []).length, channel)
        .toBeGreaterThanOrEqual(minimumGuards);
      expectAwaitGuards(body, channel);
    }
    const homeStart = source.indexOf('ipcMain.handle("dialog:pick-working-dir"');
    const homeEnd = source.indexOf('\n  // shell.openPath', homeStart);
    expect(homeStart).toBeGreaterThanOrEqual(0);
    expect(homeEnd).toBeGreaterThan(homeStart);
    const homeBody = source.slice(homeStart, homeEnd);
    expect((homeBody.match(/requireFolderPickerSender\(event\);/g) ?? []).length)
      .toBeGreaterThanOrEqual(3);
    const picker = pickerFunctionSource();
    expect(picker).toMatch(/result = await dialog\.showOpenDialog\(parent, pickerOptions\);\s*assertOwnerStillLive\(\);/);
    expect(picker).toMatch(/if \(destroyed \|\| current !== parent\)/);
  });

  it('does not retain the removed tree-only dialog identifier in the desktop route', () => {
    expect(source).not.toMatch(/FolderBrowserDialog/);
  });
});
