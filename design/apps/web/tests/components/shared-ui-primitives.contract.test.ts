// The source contract is syntax-aware so a comment, descendant selector, or
// renamed substring cannot make a missing primitive wiring look present.

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

function source(relativePath: string): string {
  return readFileSync(new URL(`../../src/components/${relativePath}`, import.meta.url), 'utf8');
}

function syntax(sourceText: string): ts.SourceFile {
  return ts.createSourceFile(
    'contract.tsx',
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function hasNamedImport(sourceText: string, moduleName: string, importedName: string): boolean {
  let found = false;
  const file = syntax(sourceText);
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier) || statement.moduleSpecifier.text !== moduleName) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    if (bindings.elements.some((element) => element.name.text === importedName)) found = true;
  }
  return found;
}

function hasJsxAttribute(sourceText: string, attributeName: string): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && node.name.text === attributeName) found = true;
    ts.forEachChild(node, visit);
  };
  visit(syntax(sourceText));
  return found;
}

function expectRedThenGreen(
  original: string,
  predicate: (sourceText: string) => boolean,
  mutate: (sourceText: string) => string,
) {
  expect(predicate(original)).toBe(true);
  const broken = mutate(original);
  expect(predicate(broken)).toBe(false);
  expect(predicate(original)).toBe(true);
}

function allTsxFiles(root: string): string[] {
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile() && fullPath.endsWith('.tsx')) files.push(fullPath);
    }
  };
  visit(root);
  return files;
}

function literalJsxAttribute(node: ts.JsxOpeningLikeElement, name: string): string | null {
  for (const property of node.attributes.properties) {
    if (!ts.isJsxAttribute(property) || property.name.text !== name) continue;
    return property.initializer && ts.isStringLiteral(property.initializer)
      ? property.initializer.text
      : null;
  }
  return null;
}

function scanSurfaceRows(srcRoot: string): string[] {
  const rows: string[] = [];
  for (const file of allTsxFiles(srcRoot)) {
    const text = readFileSync(file, 'utf8');
    const fileAst = syntax(text);
    const relativePath = relative(srcRoot, file).replaceAll('\\', '/');
    const visit = (node: ts.Node) => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(fileAst);
        const role = literalJsxAttribute(node, 'role');
        const type = literalJsxAttribute(node, 'type');
        const line = fileAst.getLineAndCharacterOfPosition(node.getStart(fileAst)).line + 1;
        if (role === 'menu' || type === 'search' || tag === 'select') {
          rows.push(`${relativePath}:${line}:${role === 'menu' ? 'menu' : type === 'search' ? 'search' : 'select'}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(fileAst);
  }
  return rows.sort();
}

function inventorySurfaceRows(): string[] {
  const inventory = readFileSync(
    new URL('../../../../../docs/standards/shared-ui-primitives-migration.md', import.meta.url),
    'utf8',
  );
  const rows: string[] = [];
  for (const line of inventory.split(/\r?\n/)) {
    const match = line.match(/^\| (menu-[^|]+|select-[^|]+|search-[^|]+) \| `([^`]+)`/);
    if (!match) continue;
    const rowId = match[1]!;
    if (rowId === 'select-collab-role' || rowId.includes('comment')) continue;
    const sourceLocation = match[2]!;
    const sourceMatch = sourceLocation.match(/^design\/apps\/web\/src\/(.+):(\d+)$/);
    if (!sourceMatch) continue;
    const kind = rowId.startsWith('menu-') ? 'menu' : rowId.startsWith('search-') ? 'search' : 'select';
    rows.push(`${sourceMatch[1]}:${sourceMatch[2]}:${kind}`);
  }
  return rows.sort();
}

describe('shared menu and dropdown primitive source contract', () => {
  it('keeps ContextMenu wired to one field-owned RegexSearchField', () => {
    const menu = source('ContextMenu.tsx');
    expectRedThenGreen(
      menu,
      (value) => hasNamedImport(value, './regex', 'RegexSearchField')
        && hasJsxAttribute(value, 'ariaActiveDescendant')
        && hasJsxAttribute(value, 'fieldId'),
      (value) => value.replace("import { RegexSearchField, useRegexSearch } from './regex';", "import { useRegexSearch } from './regex';"),
    );
  });

  it('keeps CustomSelect wired to one field-owned RegexSearchField', () => {
    const select = source('CustomSelect.tsx');
    expectRedThenGreen(
      select,
      (value) => hasNamedImport(value, './regex', 'RegexSearchField')
        && hasJsxAttribute(value, 'ariaActiveDescendant')
        && hasJsxAttribute(value, 'fieldId'),
      (value) => value.replace("import { RegexSearchField, useRegexSearch } from './regex';", "import { useRegexSearch } from './regex';"),
    );
  });

  it('keeps locked select activation typed and fail-closed', () => {
    const select = source('CustomSelect.tsx');
    expect(select).toContain('onLockedActivate: (request: LockedActivationRequest) => LockedActivationReceipt;');
    expect(select).toContain("console.error('Locked select activation did not return an accepted receipt.');");
    expect(select).toContain('data-locked={locked || undefined}');
  });

  it('keeps the active result prop in the shared search field', () => {
    const field = source('regex/RegexSearchField.tsx');
    expectRedThenGreen(
      field,
      (value) => hasJsxAttribute(value, 'aria-activedescendant'),
      (value) => value.replace('aria-activedescendant={ariaActiveDescendant}', 'aria-describedby={ariaActiveDescendant}'),
    );
  });

  it('uses exact callback boundaries for target appearance and lock actions', () => {
    const menu = source('ContextMenu.tsx');
    expectRedThenGreen(
      menu,
      (value) => value.includes('readonly onEditAppearance: (request: TargetActionRequest) => TargetActionReceipt;')
        && value.includes('readonly onLock: (request: TargetActionRequest) => TargetActionReceipt;')
        && value.includes('readonly onRequestDestructiveConfirmation:')
        && value.includes(') => DestructiveConfirmationReceipt;')
        && hasJsxAttribute(value, 'data-callback-collision'),
      (value) => value.replace('readonly onEditAppearance: (request: TargetActionRequest) => TargetActionReceipt;', 'readonly onEditAppearanceX: (request: TargetActionRequest) => TargetActionReceipt;'),
    );
  });

  it('keeps the hand-written inventory complete for every menu, search, and native select', () => {
    const srcRoot = fileURLToPath(new URL('../../src', import.meta.url));
    expect(scanSurfaceRows(srcRoot)).toEqual(inventorySurfaceRows());
    expect(scanSurfaceRows(srcRoot).filter((row) => row.endsWith(':menu'))).toHaveLength(50);
  });
});
