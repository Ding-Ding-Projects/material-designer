// The source contract is syntax-aware so a comment, descendant selector, or
// renamed substring cannot make a missing primitive wiring look present.

import { readFileSync } from 'node:fs';
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

describe('shared menu and dropdown primitive source contract', () => {
  it('keeps ContextMenu wired to one field-owned RegexSearchField', () => {
    const menu = source('ContextMenu.tsx');
    expectRedThenGreen(
      menu,
      (value) => hasNamedImport(value, './regex', 'RegexSearchField')
        && hasJsxAttribute(value, 'ariaActiveDescendant'),
      (value) => value.replace("import { RegexSearchField, useRegexSearch } from './regex';", "import { useRegexSearch } from './regex';"),
    );
  });

  it('keeps CustomSelect wired to one field-owned RegexSearchField', () => {
    const select = source('CustomSelect.tsx');
    expectRedThenGreen(
      select,
      (value) => hasNamedImport(value, './regex', 'RegexSearchField')
        && hasJsxAttribute(value, 'ariaActiveDescendant'),
      (value) => value.replace("import { RegexSearchField, useRegexSearch } from './regex';", "import { useRegexSearch } from './regex';"),
    );
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
      (value) => value.includes('readonly onEditAppearance?: () => void;')
        && value.includes('readonly onLock?: () => void;'),
      (value) => value.replace('readonly onEditAppearance?: () => void;', 'readonly onEditAppearanceX?: () => void;'),
    );
  });
});
