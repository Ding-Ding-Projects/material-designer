import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import {
  jsxInventoryRowMatches,
  jsxInventoryRowPresent,
  parseAttributeMarker,
} from '../../../../../../scripts/check-regex-search-inventory.mjs';

import {
  EXPECTED_REGEX_SEARCH_SURFACE_IDS,
  REGEX_SEARCH_SURFACE_INVENTORY,
  validateRegexSearchSurfaceInventory,
} from '../../../src/components/regex/searchSurfaceInventory';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../../');

function sourceFile(source: string, sourcePath: string): ts.SourceFile {
  const scriptKind = sourcePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.JS;
  return ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, scriptKind);
}

function attributeMarker(marker: string): { name: string; value: string; expression: boolean } | null {
  return parseAttributeMarker(marker);
}

function jsxMarkerPresent(file: ts.SourceFile, marker: string): boolean {
  const attr = attributeMarker(marker);
  let found = false;
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (marker.startsWith('<')) {
        found ||= node.tagName.getText(file) === marker.slice(1);
      } else if (attr) {
        for (const property of node.attributes.properties) {
          if (!ts.isJsxAttribute(property) || property.name.text !== attr.name) continue;
          const initializer = property.initializer;
          if (attr.expression && initializer && ts.isJsxExpression(initializer)) {
            found ||= initializer.expression?.getText(file) === attr.value;
          } else if (!attr.expression && initializer && ts.isStringLiteral(initializer)) {
            found ||= initializer.text === attr.value;
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

function javascriptMarkerPresent(file: ts.SourceFile, marker: string): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) && node.text === marker) found = true;
    if (ts.isPropertyAccessExpression(node) && node.getText(file) === marker) found = true;
    if (ts.isPropertyAssignment(node) && node.getText(file) === marker) found = true;
    if (ts.isCallExpression(node) && marker.endsWith('({')) {
      found ||= node.expression.getText(file) === marker.slice(0, -2)
        && node.arguments[0] !== undefined
        && ts.isObjectLiteralExpression(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

function htmlMarkerPresent(source: string, marker: string): boolean {
  const attr = attributeMarker(marker);
  if (!attr || attr.expression) return false;
  const document = new JSDOM(source).window.document;
  return Array.from(document.querySelectorAll<HTMLElement>(`[${attr.name}]`))
    .some((element) => element.getAttribute(attr.name) === attr.value);
}

function executableMarkerPresent(source: string, marker: string, sourcePath: string): boolean {
  if (sourcePath.endsWith('.tsx') || sourcePath.endsWith('.ts')) {
    return jsxMarkerPresent(sourceFile(source, sourcePath), marker);
  }
  if (sourcePath.endsWith('.html')) return htmlMarkerPresent(source, marker);
  return javascriptMarkerPresent(sourceFile(source, sourcePath), marker);
}

describe('regex search-surface inventory', () => {
  it('keeps the hand-written list complete and unique', () => {
    const ids = REGEX_SEARCH_SURFACE_INVENTORY.map((row) => row.id);
    expect(ids).toEqual([...EXPECTED_REGEX_SEARCH_SURFACE_IDS]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(REGEX_SEARCH_SURFACE_INVENTORY.every((row) => row.instances > 0)).toBe(true);
  });

  it('binds every inventoried field to its own builder and controller marker', () => {
    for (const row of REGEX_SEARCH_SURFACE_INVENTORY) {
      if (row.status === 'not-wired') {
        expect(row.scopeNote, row.id).toMatch(/^RED:/);
        continue;
      }
      const source = readFileSync(resolve(repoRoot, row.sourcePath), 'utf8');
      if (row.sourcePath.endsWith('.tsx') || row.sourcePath.endsWith('.ts')) {
        expect(jsxInventoryRowPresent(sourceFile(source, row.sourcePath), row), row.id).toBe(true);
        continue;
      }
      expect(executableMarkerPresent(source, row.searchMarker, row.sourcePath), row.id).toBe(true);
      expect(executableMarkerPresent(source, row.builderMarker, row.sourcePath), row.id).toBe(true);
      expect(executableMarkerPresent(source, row.stateMarker, row.sourcePath), row.id).toBe(true);
    }
  });

  it('uses one exact JSX invocation for the component, binding, and controller', () => {
    const row = {
      id: 'fixture',
      surface: 'desktop' as const,
      owner: 'Fixture',
      sourcePath: 'fixture.tsx',
      searchMarker: 'testId="fixture-search"',
      builderMarker: '<RegexSearchField',
      stateMarker: 'search={fixtureSearch}',
      fieldIds: ['fixture-search'],
      instances: 1,
      status: 'wired' as const,
      scopeNote: 'fixture',
    };
    const present = sourceFile('<RegexSearchField testId="fixture-search" search={fixtureSearch} />', 'fixture.tsx');
    expect(jsxInventoryRowPresent(present, row)).toBe(true);

    const distributed = sourceFile(
      '<RegexSearchField testId="fixture-search" />\n<RegexSearchField search={fixtureSearch} />',
      'fixture.tsx',
    );
    expect(jsxInventoryRowPresent(distributed, row)).toBe(false);
    expect(jsxInventoryRowPresent(sourceFile('<RegexSearchField><span data-testid="fixture-search" /></RegexSearchField>', 'fixture.tsx'), row)).toBe(false);
    expect(jsxInventoryRowPresent(sourceFile('const marker = "testId=\\\"fixture-search\\\"";', 'fixture.tsx'), row)).toBe(false);
    expect(jsxInventoryRowPresent(sourceFile('// <RegexSearchField testId="fixture-search" search={fixtureSearch} />', 'fixture.tsx'), row)).toBe(false);
    expect(jsxInventoryRowPresent(sourceFile('<RegexSearchFieldRenamed testId="fixture-search" search={fixtureSearch} />', 'fixture.tsx'), row)).toBe(false);
  });

  it('parses nested template expressions without allowing a truncated marker', () => {
    expect(parseAttributeMarker('testId={`workspace-tabs-group-tab-search-${group.id}`}')).toEqual({
      name: 'testId',
      value: '`workspace-tabs-group-tab-search-${group.id}`',
      expression: true,
    });
    expect(parseAttributeMarker('testId={`workspace-tabs-group-tab-search-${group.id}`}-stale')).toBeNull();
    const row = {
      id: 'template-fixture',
      surface: 'desktop' as const,
      owner: 'Fixture',
      sourcePath: 'fixture.tsx',
      searchMarker: 'testId={`workspace-tabs-group-tab-search-${group.id}`}',
      builderMarker: '<RegexSearchField',
      stateMarker: 'search={search}',
      fieldIds: ['workspace-tabs-group-tab-search-${group.id}'],
      instances: 1,
      status: 'wired' as const,
      scopeNote: 'fixture',
    };
    expect(jsxInventoryRowPresent(sourceFile('<RegexSearchField testId={`workspace-tabs-group-tab-search-${group.id}`} search={search} />', 'fixture.tsx'), row)).toBe(true);
    expect(jsxInventoryRowPresent(sourceFile('<RegexSearchField testId={`workspace-tabs-group-tab-search-${group.id}`} />\n<RegexSearchField search={search} />', 'fixture.tsx'), row)).toBe(false);
  });

  it('requires every field id and the declared invocation count for multi-instance rows', () => {
    const row = {
      id: 'file-viewer-present-fixture',
      surface: 'desktop' as const,
      owner: 'FileViewer',
      sourcePath: 'fixture.tsx',
      searchMarker: '<FileViewerMenuSearch',
      builderMarker: 'fieldId="file-viewer-present-menu-search"',
      stateMarker: 'open={presentMenuOpen}',
      fieldIds: ['file-viewer-live-present-menu-search', 'file-viewer-present-menu-search'],
      instances: 2,
      status: 'wired' as const,
      scopeNote: 'fixture',
    };
    const complete = sourceFile(
      '<FileViewerMenuSearch fieldId="file-viewer-live-present-menu-search" open={presentMenuOpen} />\n'
        + '<FileViewerMenuSearch fieldId="file-viewer-present-menu-search" open={presentMenuOpen} />',
      'fixture.tsx',
    );
    expect(jsxInventoryRowMatches(complete, row)).toEqual({ matchedInvocations: 2, missingFieldIds: [] });
    expect(jsxInventoryRowPresent(complete, row)).toBe(true);

    for (const fieldId of row.fieldIds) {
      const missing = row.fieldIds.filter((candidate) => candidate !== fieldId);
      const source = missing.map((candidate) => `<FileViewerMenuSearch fieldId="${candidate}" open={presentMenuOpen} />`).join('\n');
      expect(jsxInventoryRowMatches(sourceFile(source, 'fixture.tsx'), row)).toEqual({
        matchedInvocations: 1,
        missingFieldIds: [fieldId],
      });
      expect(jsxInventoryRowPresent(sourceFile(source, 'fixture.tsx'), row)).toBe(false);
    }

    const extra = sourceFile(
      '<FileViewerMenuSearch fieldId="file-viewer-live-present-menu-search" open={presentMenuOpen} />\n'
        + '<FileViewerMenuSearch fieldId="file-viewer-present-menu-search" open={presentMenuOpen} />\n'
        + '<FileViewerMenuSearch fieldId="file-viewer-live-present-menu-search" open={presentMenuOpen} />',
      'fixture.tsx',
    );
    expect(jsxInventoryRowMatches(extra, row).matchedInvocations).toBe(3);
    expect(jsxInventoryRowPresent(extra, row)).toBe(false);

    const handoffRow = {
      ...row,
      owner: 'HandoffView',
      searchMarker: 'searchId="handoff-token-search"',
      stateMarker: 'search={tokenSearch}',
      fieldIds: ['handoff-token-search', 'handoff-component-search'],
    };
    const handoffSource = (include: readonly string[]) => sourceFile(
      'function RegistrySection({ search, searchId }) { return <RegexSearchField search={search} testId={searchId} />; }\n'
        + '<RegistrySection search={tokenSearch} searchId="handoff-token-search" />\n'
        + (include.includes('handoff-component-search')
          ? '<RegistrySection search={componentSearch} searchId="handoff-component-search" />\n'
          : ''),
      'fixture.tsx',
    );
    expect(jsxInventoryRowPresent(handoffSource(handoffRow.fieldIds), handoffRow)).toBe(true);
    expect(jsxInventoryRowMatches(handoffSource(['handoff-token-search']), handoffRow)).toEqual({
      matchedInvocations: 1,
      missingFieldIds: ['handoff-component-search'],
    });
    expect(jsxInventoryRowPresent(handoffSource(['handoff-token-search']), handoffRow)).toBe(false);

    const tokenOnlySource = sourceFile(
      'function RegistrySection({ search, searchId }) { return <RegexSearchField search={search} testId={searchId} />; }\n'
        + '<RegistrySection search={componentSearch} searchId="handoff-component-search" />',
      'fixture.tsx',
    );
    expect(jsxInventoryRowMatches(tokenOnlySource, handoffRow)).toEqual({
      matchedInvocations: 1,
      missingFieldIds: ['handoff-token-search'],
    });
    expect(jsxInventoryRowPresent(tokenOnlySource, handoffRow)).toBe(false);
  });

  it('rejects block comments and renamed JSX registrations', () => {
    const sourcePath = 'design/apps/web/src/components/EntryTopbarSearch.tsx';
    const source = readFileSync(resolve(repoRoot, sourcePath), 'utf8');
    expect(executableMarkerPresent(source, '<RegexSearchField', sourcePath)).toBe(true);
    expect(executableMarkerPresent(source.replace('      <RegexSearchField\n', '      RegexSearchField\n'), '<RegexSearchField', sourcePath)).toBe(false);
    expect(executableMarkerPresent(source.replace('      <RegexSearchField\n', '      <RegexSearchFieldRenamed\n'), '<RegexSearchField', sourcePath)).toBe(false);
    expect(executableMarkerPresent(source, 'testId="entry-topbar-search-field"', sourcePath)).toBe(true);
    expect(executableMarkerPresent(source.replace('testId="entry-topbar-search-field"', '/* testId="entry-topbar-search-field" */'), 'testId="entry-topbar-search-field"', sourcePath)).toBe(false);
    expect(executableMarkerPresent(source.replace('testId="entry-topbar-search-field"', 'testId="entry-topbar-search-field-renamed"'), 'testId="entry-topbar-search-field"', sourcePath)).toBe(false);
  });

    it('turns red if a surface, field id, builder, or isolated-state registration disappears', () => {
    // The previous assertions intentionally use exact hand-written ids and
    // markers. This tripwire keeps the regression itself visible to reviewers:
    // it must not be replaced by discovering only whatever source still has.
    expect(EXPECTED_REGEX_SEARCH_SURFACE_IDS).toHaveLength(33);
    expect(REGEX_SEARCH_SURFACE_INVENTORY.filter((row) => row.status === 'wired')).toHaveLength(23);
    expect(() => validateRegexSearchSurfaceInventory(REGEX_SEARCH_SURFACE_INVENTORY.slice(0, -1))).toThrow(
      'incomplete',
    );
    expect(() => validateRegexSearchSurfaceInventory([
      ...REGEX_SEARCH_SURFACE_INVENTORY.slice(0, -1),
      { ...REGEX_SEARCH_SURFACE_INVENTORY[REGEX_SEARCH_SURFACE_INVENTORY.length - 1]!, builderMarker: '' },
    ])).toThrow('incomplete');
    expect(() => validateRegexSearchSurfaceInventory(REGEX_SEARCH_SURFACE_INVENTORY)).not.toThrow();
    expect(() => validateRegexSearchSurfaceInventory([
      ...REGEX_SEARCH_SURFACE_INVENTORY.slice(0, -1),
      { ...REGEX_SEARCH_SURFACE_INVENTORY[REGEX_SEARCH_SURFACE_INVENTORY.length - 1]!, fieldIds: [] },
    ])).toThrow('incomplete');
    expect(() => validateRegexSearchSurfaceInventory([
      ...REGEX_SEARCH_SURFACE_INVENTORY.slice(0, -1),
      { ...REGEX_SEARCH_SURFACE_INVENTORY[REGEX_SEARCH_SURFACE_INVENTORY.length - 1]!, fieldIds: ['md-tabs-search-tab-strip-overflow'] },
    ])).toThrow('unique');
  });
});
