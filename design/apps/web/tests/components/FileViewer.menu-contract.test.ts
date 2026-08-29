import { readFileSync } from 'node:fs';
import * as ts from 'typescript';

const fileViewerSource = readFileSync(
  new URL('../../src/components/FileViewer.tsx', import.meta.url),
  'utf8',
);
const menuPrimitiveSource = readFileSync(
  new URL('../../src/components/FileViewerMenuSearch.tsx', import.meta.url),
  'utf8',
);
const regexFieldSource = readFileSync(
  new URL('../../src/components/regex/RegexSearchField.tsx', import.meta.url),
  'utf8',
);
const customSelectSource = readFileSync(
  new URL('../../src/components/CustomSelect.tsx', import.meta.url),
  'utf8',
);
const regexBuilderSource = readFileSync(
  new URL('../../src/components/regex/RegexBuilder.tsx', import.meta.url),
  'utf8',
);
const viewerToolsSource = readFileSync(
  new URL('../../src/styles/viewer/tools.css', import.meta.url),
  'utf8',
);
const viewerCoreSource = readFileSync(
  new URL('../../src/styles/viewer/core.css', import.meta.url),
  'utf8',
);
const shellSource = readFileSync(
  new URL('../../src/styles/shell.css', import.meta.url),
  'utf8',
);

type AstMenuRegistration = {
  menuId: string;
  fieldId: string;
  triggerRef: string;
  kind: string | null;
  className: string | null;
  onClose: string | null;
  hasOpen: boolean;
};

type AstCustomSelectRegistration = {
  ownerId: string;
  testId: string | null;
  hasSearchLabel: boolean;
  hasLockReceipt: boolean;
  hasContextRoute: boolean;
};

function fileViewerAst(source: string): ts.SourceFile {
  return ts.createSourceFile(
    'FileViewer.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function jsxAttributeText(attribute: ts.JsxAttribute): string | null {
  const value = attribute.initializer;
  if (!value) return '';
  if (ts.isStringLiteral(value)) return value.text;
  if (ts.isJsxExpression(value) && value.expression) return value.expression.getText();
  return null;
}

function jsxOpenings(source: string, tagName: string): ts.JsxOpeningLikeElement[] {
  const openings: ts.JsxOpeningLikeElement[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      if (ts.isIdentifier(opening.tagName) && opening.tagName.text === tagName) openings.push(opening);
    }
    ts.forEachChild(node, visit);
  };
  visit(fileViewerAst(source));
  return openings;
}

function jsxOpeningAttributes(opening: ts.JsxOpeningLikeElement): Map<string, string | null> {
  const attributes = new Map<string, string | null>();
  for (const property of opening.attributes.properties) {
    if (ts.isJsxAttribute(property) && ts.isIdentifier(property.name)) {
      attributes.set(property.name.text, jsxAttributeText(property));
    }
  }
  return attributes;
}

function astHasJsxAttribute(
  source: string,
  tagName: string,
  attributeName: string,
  expectedValue?: string,
): boolean {
  return jsxOpenings(source, tagName).some((opening) => {
    const value = jsxOpeningAttributes(opening).get(attributeName);
    return value !== undefined && (expectedValue === undefined || value === expectedValue);
  });
}

function astJsxAttributeCount(
  source: string,
  tagName: string,
  attributeName: string,
  expectedValue?: string,
): number {
  return jsxOpenings(source, tagName).filter((opening) => {
    const value = jsxOpeningAttributes(opening).get(attributeName);
    return value !== undefined && (expectedValue === undefined || value === expectedValue);
  }).length;
}

function astConditionalJsxAttributeCount(source: string, tagName: string, attributeName: string, condition: string): number {
  return jsxOpenings(source, tagName).filter((opening) => {
    for (const property of opening.attributes.properties) {
      if (!ts.isJsxAttribute(property) || !ts.isIdentifier(property.name) || property.name.text !== attributeName) continue;
      const initializer = property.initializer;
      if (!initializer || !ts.isJsxExpression(initializer) || !initializer.expression) continue;
      return ts.isConditionalExpression(initializer.expression)
        && initializer.expression.condition.getText() === condition;
    }
    return false;
  }).length;
}

function astHasCallExpression(source: string, callee: string, argumentsText: string[] = []): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)
      && node.expression.getText() === callee
      && (argumentsText.length === 0
        || argumentsText.every((argument, index) => node.arguments[index]?.getText() === argument))) {
      found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(fileViewerAst(source));
  return found;
}

function astHasInterfaceProperty(source: string, interfaceName: string, propertyName: string, optional: boolean): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === interfaceName) {
      found = node.members.some((member) => (
        ts.isPropertySignature(member)
        && ts.isIdentifier(member.name)
        && member.name.text === propertyName
        && Boolean(member.questionToken) === optional
      ));
    }
    ts.forEachChild(node, visit);
  };
  visit(fileViewerAst(source));
  return found;
}

function astHasInterfaceProperties(
  source: string,
  interfaceName: string,
  requiredNames: string[],
): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === interfaceName) {
      const names = new Set(node.members
        .filter(ts.isPropertySignature)
        .filter((member) => member.questionToken === undefined)
        .filter((member) => ts.isIdentifier(member.name))
        .map((member) => member.name.text));
      found = requiredNames.every((name) => names.has(name));
    }
    ts.forEachChild(node, visit);
  };
  visit(fileViewerAst(source));
  return found;
}

function astHasPropertyStringUnion(source: string, propertyName: string, values: string[]): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (ts.isPropertySignature(node)
      && ts.isIdentifier(node.name)
      && node.name.text === propertyName
      && node.type
      && ts.isUnionTypeNode(node.type)) {
      const members = node.type.types
        .filter(ts.isLiteralTypeNode)
        .map((member) => ts.isStringLiteral(member.literal) ? member.literal.text : '');
      if (members.length === values.length && members.every((value, index) => value === values[index])) found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(fileViewerAst(source));
  return found;
}

function astHasRawMenuElement(source: string): boolean {
  return jsxOpenings(source, 'div').some((opening) => {
    const attributes = jsxOpeningAttributes(opening);
    return attributes.get('role') === 'menu';
  });
}

function fileViewerMenuRegistrations(source: string): AstMenuRegistration[] {
  const registrations: AstMenuRegistration[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const tagName = opening.tagName;
      if (ts.isIdentifier(tagName) && tagName.text === 'FileViewerMenuSearch') {
        const attributes = new Map<string, string | null>();
        for (const property of opening.attributes.properties) {
          if (ts.isJsxAttribute(property) && ts.isIdentifier(property.name)) {
            attributes.set(property.name.text, jsxAttributeText(property));
          }
        }
        const menuId = attributes.get('menuId');
        const fieldId = attributes.get('fieldId');
        const triggerRef = attributes.get('triggerRef');
        if (typeof menuId === 'string' && typeof fieldId === 'string' && typeof triggerRef === 'string') {
          registrations.push({
            menuId,
            fieldId,
            triggerRef,
            kind: attributes.get('kind') ?? null,
            className: attributes.get('className') ?? null,
            onClose: attributes.get('onClose') ?? null,
            hasOpen: attributes.has('open'),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(fileViewerAst(source));
  return registrations;
}

function fileViewerCustomSelectAttributes(source: string): Set<string>[] {
  const registrations: Set<string>[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      if (ts.isIdentifier(opening.tagName) && opening.tagName.text === 'CustomSelect') {
        registrations.push(new Set(
          opening.attributes.properties
            .filter(ts.isJsxAttribute)
            .map((property) => property.name.text),
        ));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(fileViewerAst(source));
  return registrations;
}

function fileViewerCustomSelectRegistrations(source: string): AstCustomSelectRegistration[] {
  return jsxOpenings(source, 'CustomSelect').map((opening) => {
    const attributes = jsxOpeningAttributes(opening);
    return {
      ownerId: attributes.get('ownerId') ?? '',
      testId: attributes.get('testId') ?? null,
      hasSearchLabel: attributes.has('searchLabel'),
      hasLockReceipt: attributes.has('onLockedActivate'),
      hasContextRoute: attributes.has('onContextMenu'),
    };
  });
}

function astHasJsxExpression(source: string, expected: string): boolean {
  return (() => {
    let found = false;
    const visit = (node: ts.Node) => {
      if (ts.isJsxExpression(node) && node.expression?.getText() === expected) found = true;
      ts.forEachChild(node, visit);
    };
    visit(fileViewerAst(source));
    return found;
  })();
}

function astHasCustomEvent(source: string, eventName: string): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (ts.isNewExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'CustomEvent'
      && node.arguments?.length
      && ts.isStringLiteral(node.arguments[0])
      && node.arguments[0].text === eventName) {
      found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(fileViewerAst(source));
  return found;
}

function astHasPropertyValue(source: string, propertyName: string, expected: string): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node)
      && ts.isIdentifier(node.name)
      && node.name.text === propertyName
      && node.initializer.getText() === expected) {
      found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(fileViewerAst(source));
  return found;
}

function astHasPropertyName(source: string, propertyName: string): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node)
      && ts.isIdentifier(node.name)
      && node.name.text === propertyName) found = true;
    ts.forEachChild(node, visit);
  };
  visit(fileViewerAst(source));
  return found;
}

function astPropertyNameCount(source: string, propertyName: string): number {
  let count = 0;
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node)
      && ts.isIdentifier(node.name)
      && node.name.text === propertyName) count += 1;
    ts.forEachChild(node, visit);
  };
  visit(fileViewerAst(source));
  return count;
}

function astHasPropertyAccess(source: string, receiver: string, propertyName: string): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAccessExpression(node)
      && node.expression.getText() === receiver
      && node.name.text === propertyName) found = true;
    ts.forEachChild(node, visit);
  };
  visit(fileViewerAst(source));
  return found;
}

function astHasBinaryExpression(source: string, expected: string): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (ts.isBinaryExpression(node) && node.getText() === expected) found = true;
    ts.forEachChild(node, visit);
  };
  visit(fileViewerAst(source));
  return found;
}

function astHasIfExpression(source: string, expected: string): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (ts.isIfStatement(node) && node.expression.getText() === expected) found = true;
    ts.forEachChild(node, visit);
  };
  visit(fileViewerAst(source));
  return found;
}

function astHasArrayBinding(source: string, names: string[]): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name)) {
      const bindings = new Set(node.name.elements
        .filter(ts.isBindingElement)
        .map((element) => ts.isIdentifier(element.name) ? element.name.text : ''));
      if (names.every((name) => bindings.has(name))) found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(fileViewerAst(source));
  return found;
}

function astHasFunctionDeclaration(source: string, name: string): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = true;
    ts.forEachChild(node, visit);
  };
  visit(fileViewerAst(source));
  return found;
}

function astHasUseEffectWorkspaceCleanup(source: string, requiredCalls: string[]): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'useEffect'
      && node.arguments.length > 0
      && ts.isArrowFunction(node.arguments[0])) {
      const callback = node.arguments[0];
      let hasWorkspaceGuard = false;
      const calls = new Set<string>();
      const scan = (child: ts.Node) => {
        if (ts.isIfStatement(child)
          && (child.expression.getText() === 'workspaceActive' || child.expression.getText() === '!workspaceActive')) {
          hasWorkspaceGuard = true;
        }
        if (ts.isCallExpression(child)
          && ts.isIdentifier(child.expression)
          && child.arguments.length === 1) {
          calls.add(child.expression.text);
        }
        ts.forEachChild(child, scan);
      };
      scan(callback.body);
      if (hasWorkspaceGuard && requiredCalls.every((name) => calls.has(name))) found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(fileViewerAst(source));
  return found;
}

function astHasClosestOwnershipGuard(source: string): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'isOwnedRegexBuilder'
      && node.arguments.length === 2
      && node.arguments[1]?.getText() === 'resolvedSurfaceId') {
      found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(fileViewerAst(source));
  return found;
}

function astOwnedRegexBuilderGuardCount(source: string): number {
  let count = 0;
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'isOwnedRegexBuilder'
      && node.arguments.length === 2
      && node.arguments[0]?.getText() === 'event.target'
      && node.arguments[1]?.getText() === 'resolvedSurfaceId') {
      count += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(fileViewerAst(source));
  return count;
}

function astHasNestedWidgetExclusion(source: string): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'closest'
      && node.arguments.length === 1
      && ts.isStringLiteral(node.arguments[0])
      && node.arguments[0].text === '[role="listbox"], [role="tree"], [role="tablist"]') {
      found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(fileViewerAst(source));
  return found;
}

function astHasSimpleMenuTabBuilderGuard(source: string): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (!ts.isIfStatement(node)) {
      ts.forEachChild(node, visit);
      return;
    }
    if (ts.isCallExpression(node.expression)
      && ts.isIdentifier(node.expression.expression)
      && node.expression.expression.text === 'isOwnedRegexBuilder'
      && node.expression.arguments.length === 2
      && node.expression.arguments[1]?.getText() === 'resolvedSurfaceId'
      && ts.isReturnStatement(node.thenStatement)) {
      found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(fileViewerAst(source));
  return found;
}

function astHasTabClosePredicate(source: string): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'shouldCloseMenuOnTab'
      && node.arguments.length === 3
      && node.arguments[0]?.getText() === 'kind'
      && node.arguments[1]?.getText() === 'event.target'
      && node.arguments[2]?.getText() === 'resolvedSurfaceId') {
      found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(fileViewerAst(source));
  return found;
}

function astHasRequiredFieldId(source: string): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === 'FileViewerMenuSearchProps') {
      found = node.members.some((member) => (
        ts.isPropertySignature(member)
        && ts.isIdentifier(member.name)
        && member.name.text === 'fieldId'
        && member.questionToken === undefined
        && member.type?.getText() === 'string'
      ));
    }
    ts.forEachChild(node, visit);
  };
  visit(fileViewerAst(source));
  return found;
}

// This is deliberately hand-written. A discovery-only scan would disappear
// with the menu it was meant to protect.
const FILE_VIEWER_MENU_INVENTORY = [
  { id: 'live-artifact-present-menu', fieldId: 'file-viewer-live-present-menu-search', kind: 'menu', opener: 'presentTriggerRef', onClose: '() => setPresentMenuOpen(false)', className: 'present-menu' },
  { id: 'live-artifact-zoom-menu', fieldId: 'file-viewer-live-zoom-menu-search', kind: 'menu', opener: 'zoomTriggerRef', onClose: '() => setZoomMenuOpen(false)', className: 'zoom-menu-popover' },
  { id: 'file-version-head-download-menu', fieldId: 'file-viewer-version-download-menu-search', kind: 'menu', opener: 'versionHeadDownloadTriggerRef', onClose: '() => setDownloadMenuVersionId(null)', className: 'artifact-version-panel__popover share-menu-popover file-version-download-menu' },
  { id: 'file-version-footer-download-menu', fieldId: 'file-viewer-version-footer-download-menu-search', kind: 'menu', opener: 'versionFooterDownloadTriggerRef', onClose: '() => setDownloadMenuVersionId(null)', className: 'artifact-version-panel__popover share-menu-popover file-version-download-menu' },
  { id: 'react-component-share-menu', fieldId: 'file-viewer-component-unified-menu-search', kind: 'mixed', opener: 'shareTriggerRef', onClose: '() => setShareMenuOpen(false)', className: 'share-menu-popover chrome-unified-popover' },
  { id: 'html-viewer-zoom-menu', fieldId: 'file-viewer-zoom-menu-search', kind: 'menu', opener: 'zoomTriggerRef', onClose: '() => setZoomMenuOpen(false)', className: 'zoom-menu-popover' },
  { id: 'html-viewer-toolbar-more-menu', fieldId: 'file-viewer-toolbar-more-menu-search', kind: 'menu', opener: 'toolbarMoreTriggerRef', onClose: '() => setToolbarMoreOpen(false)', className: 'viewer-toolbar-more-menu' },
  { id: 'html-viewer-present-menu', fieldId: 'file-viewer-present-menu-search', kind: 'menu', opener: 'presentTriggerRef', onClose: '() => setPresentMenuOpen(false)', className: 'present-menu' },
  { id: 'html-viewer-share-menu', fieldId: 'file-viewer-unified-action-menu-search', kind: 'mixed', opener: 'shareTriggerRef', onClose: '() => setDeployMenuOpen(false)', className: 'share-menu-popover chrome-unified-popover' },
  { id: 'markdown-download-menu', fieldId: 'file-viewer-markdown-download-menu-search', kind: 'menu', opener: 'downloadTriggerRef', onClose: '() => setDownloadMenuOpen(false)', className: 'share-menu-popover' },
] as const;

// This inventory is deliberately separate from the menu list. A dropdown or
// history search can disappear while every action menu still passes.
const FILE_VIEWER_SELECT_AND_SEARCH_INVENTORY = [
  { id: 'live-viewport', ownerId: '`file-viewer-live-viewport-picker-${liveArtifact.artifactId}`', searchLabel: "t('fileViewer.viewportAria')" },
  { id: 'version-history', ownerId: 'file-viewer-version-history-search', searchLabel: 'versionSearch' },
  { id: 'inspect-font-weight', ownerId: '`file-viewer-inspect-font-weight-${target.elementId}`', searchLabel: "t('inspect.weight')" },
  { id: 'inspect-text-align', ownerId: '`file-viewer-inspect-text-align-${target.elementId}`', searchLabel: "t('inspect.align')" },
  { id: 'react-workspace-access', ownerId: 'file-viewer-react-workspace-access', searchLabel: "t('fileViewer.workspaceShareTitle')" },
  { id: 'html-viewport', ownerId: '`${fileViewportKey}:viewport-picker`', searchLabel: "t('fileViewer.viewportAria')" },
  { id: 'html-workspace-access', ownerId: 'file-viewer-html-workspace-access', searchLabel: "t('fileViewer.workspaceShareTitle')" },
  { id: 'deploy-provider', ownerId: 'file-viewer-deploy-provider', searchLabel: "t('fileViewer.deployProviderLabel')" },
  { id: 'deploy-target', ownerId: 'file-viewer-deploy-target', searchLabel: "t('fileViewer.deployTargetLabel')" },
  { id: 'cloudflare-zone', ownerId: 'file-viewer-cloudflare-zone', searchLabel: "t('fileViewer.cloudflareZoneLabel')" },
] as const;

function expectRedThenGreenAst(
  source: string,
  predicate: (value: string) => boolean,
  mutate: (value: string) => string,
) {
  expect(predicate(source)).toBe(true);
  expect(predicate(mutate(source))).toBe(false);
  expect(predicate(source)).toBe(true);
}

function expectRedThenGreenText(source: string, requiredText: string, mutate: (value: string) => string) {
  expect(source).toContain(requiredText);
  expect(mutate(source)).not.toContain(requiredText);
  expect(source).toContain(requiredText);
}

function assertMenuBoundary(source: string) {
  expect(astHasJsxAttribute(source, 'div', 'data-file-viewer-menu-surface', 'resolvedSurfaceId')).toBe(true);
  expect(astHasJsxAttribute(source, 'div', 'role', "kind === 'mixed' ? 'dialog' : 'group'")).toBe(true);
  expect(astHasJsxAttribute(source, 'div', 'role', "kind === 'menu' ? 'menu' : 'group'")).toBe(true);
  expect(astHasJsxAttribute(source, 'div', 'data-file-viewer-menu-actions', 'resolvedSurfaceId')).toBe(true);
  expect(astHasArrayBinding(source, ['registry', 'setRegistry'])).toBe(true);
  expect(astHasFunctionDeclaration(source, 'readableActionLabel')).toBe(true);
  expect(astHasNestedWidgetExclusion(source)).toBe(true);
  expect(astHasPropertyAccess(source, 'surface', 'scrollWidth')).toBe(true);
  expect(astHasPropertyName(source, 'maxHeight')).toBe(true);
  expect(astHasBinaryExpression(source, "event.key === 'Tab'")).toBe(true);
  expect(astHasSimpleMenuTabBuilderGuard(source)).toBe(true);
}

describe('FileViewer menu search contract', () => {
  it('uses AST ownership boundaries for every live menu registration', () => {
    const registrations = fileViewerMenuRegistrations(fileViewerSource);
    expect(registrations).toHaveLength(FILE_VIEWER_MENU_INVENTORY.length);
    expect(registrations.map((registration) => registration.menuId)).toEqual(
      FILE_VIEWER_MENU_INVENTORY.map((menu) => menu.id),
    );
    expect(registrations.map((registration) => registration.fieldId)).toEqual(
      FILE_VIEWER_MENU_INVENTORY.map((menu) => menu.fieldId),
    );
    expect(registrations.every((registration) => registration.hasOpen)).toBe(true);

    const renamed = fileViewerSource.replace(
      '<FileViewerMenuSearch',
      '<FileViewerMenuSearchRenamed',
    );
    expect(fileViewerMenuRegistrations(renamed)).toHaveLength(FILE_VIEWER_MENU_INVENTORY.length - 1);

    const omitted = fileViewerSource.replace(
      'menuId="html-viewer-present-menu"',
      'data-omitted-menu="html-viewer-present-menu"',
    );
    expect(fileViewerMenuRegistrations(omitted)).toHaveLength(FILE_VIEWER_MENU_INVENTORY.length - 1);
  });

  it('keeps every FileViewer dropdown and history search on a field-owned builder', () => {
    expect(FILE_VIEWER_SELECT_AND_SEARCH_INVENTORY).toHaveLength(10);
    const selectRegistrations = fileViewerCustomSelectRegistrations(fileViewerSource);
    expect(selectRegistrations).toHaveLength(8);
    expect(selectRegistrations.map((registration) => registration.ownerId)).toEqual(
      FILE_VIEWER_SELECT_AND_SEARCH_INVENTORY
        .filter((surface) => surface.id !== 'version-history')
        .map((surface) => surface.id === 'live-viewport' ? 'ownerId' : surface.ownerId),
    );
    expect(astHasJsxAttribute(
      fileViewerSource,
      'PreviewViewportControls',
      'ownerId',
      '`file-viewer-live-viewport-picker-${liveArtifact.artifactId}`',
    )).toBe(true);
    expect(astHasJsxAttribute(
      fileViewerSource,
      'PreviewViewportControls',
      'ownerId',
      '`${fileViewportKey}:viewport-picker`',
    )).toBe(true);
    expect(selectRegistrations.every((registration) => (
      registration.hasSearchLabel && registration.hasLockReceipt && registration.hasContextRoute
    ))).toBe(true);
    expect(jsxOpenings(fileViewerSource, 'CustomSelect').every((opening) => (
      jsxOpeningAttributes(opening).get('ownerId') !== undefined
      && jsxOpeningAttributes(opening).has('searchLabel')
    ))).toBe(true);
    expect(astHasJsxAttribute(
      fileViewerSource,
      'RegexSearchField',
      'fieldId',
      'file-viewer-version-history-search',
    )).toBe(true);
    expect(astHasJsxAttribute(fileViewerSource, 'RegexSearchField', 'search', 'versionSearch')).toBe(true);
    expect(astHasJsxAttribute(fileViewerSource, 'div', 'id', 'file-viewer-version-history-list')).toBe(true);
    expect(jsxOpenings(fileViewerSource, 'select')).toHaveLength(0);
    const listboxContainers = jsxOpenings(fileViewerSource, 'div').filter((opening) => (
      jsxOpeningAttributes(opening).get('role') === 'listbox'
    ));
    expect(listboxContainers).toHaveLength(1);
  });

  it('keeps every FileViewer CustomSelect on search, lock, and context-menu seams', () => {
    const registrations = fileViewerCustomSelectAttributes(fileViewerSource);
    expect(registrations).toHaveLength(8);
    for (const attributes of registrations) {
      for (const required of [
        'value',
        'options',
        'onChange',
        'ariaLabel',
        'ownerId',
        'searchLabel',
        'searchPlaceholder',
        'noResultsLabel',
        'resultCountLabel',
        'locked',
        'onLockedActivate',
        'onContextMenu',
      ]) {
        expect(attributes.has(required), required).toBe(true);
      }
    }
    const omittedSearch = fileViewerSource.replace(
      'searchLabel={t(\'fileViewer.viewportAria\')}',
      'data-omitted-search={t(\'fileViewer.viewportAria\')}',
    );
    expect(fileViewerCustomSelectAttributes(omittedSearch).some((attributes) => !attributes.has('searchLabel'))).toBe(true);
    expect(fileViewerCustomSelectAttributes(fileViewerSource).every((attributes) => attributes.has('searchLabel'))).toBe(true);
  });

  it('keeps target actions and destructive operations fail-closed at the owner boundary', () => {
    expect(astHasInterfaceProperties(customSelectSource, 'CustomSelectProps', [
      'value',
      'options',
      'onChange',
      'ariaLabel',
      'onLockedActivate',
      'lockedReason',
      'searchLabel',
      'searchPlaceholder',
      'noResultsLabel',
      'resultCountLabel',
      'duplicateOptionLabel',
      'disabledOptionLabel',
    ])).toBe(true);
    expect(astHasInterfaceProperty(regexFieldSource, 'RegexSearchFieldProps', 'fieldId', false)).toBe(true);
    expect(astHasCustomEvent(fileViewerSource, 'od:file-viewer-element-action')).toBe(false);
    expect(astHasCustomEvent(fileViewerSource, 'od:file-viewer-context-menu')).toBe(false);
    expect(astHasCustomEvent(fileViewerSource, 'od:authorized-destructive-action')).toBe(false);
    expect(astHasInterfaceProperty(fileViewerSource, 'FileViewerCapabilities', 'requestElementAction', false)).toBe(true);
    expect(astHasInterfaceProperty(fileViewerSource, 'FileViewerCapabilities', 'requestContextMenu', false)).toBe(true);
    expect(astHasInterfaceProperty(fileViewerSource, 'FileViewerCapabilities', 'requestAuthorizedDestructiveAction', false)).toBe(true);
    expect(astConditionalJsxAttributeCount(fileViewerSource, 'CustomSelect', 'onContextMenu', 'capabilities')).toBe(8);
    expect(astConditionalJsxAttributeCount(fileViewerSource, 'CustomSelect', 'onLockedActivate', 'capabilities')).toBe(8);
    expect(astHasInterfaceProperty(fileViewerSource, 'Props', 'fileViewerCapabilities', true)).toBe(true);
    expect(astHasJsxAttribute(fileViewerSource, 'FileViewerCapabilitiesProvider', 'value', 'fileViewerCapabilities')).toBe(true);
    expect(astHasPropertyValue(fileViewerSource, 'action', "'restore-version'")).toBe(true);
    expect(astHasPropertyValue(fileViewerSource, 'action', "'unpublish-public-file'")).toBe(true);
    expect(astHasPropertyValue(fileViewerSource, 'execute', 'restoreVersion')).toBe(true);
    expect(astHasPropertyValue(fileViewerSource, 'execute', 'unpublishCurrentFilePublic')).toBe(true);
    expect(astHasIfExpression(fileViewerSource, '!capabilities?.requestAuthorizedDestructiveAction')).toBe(true);
    expectRedThenGreenAst(
      fileViewerSource,
      (source) => astConditionalJsxAttributeCount(source, 'CustomSelect', 'onContextMenu', 'capabilities') === 8,
      (source) => source.replace('onContextMenu={capabilities', 'onContextMenu={undefined'),
    );
    expectRedThenGreenAst(
      fileViewerSource,
      (source) => astJsxAttributeCount(source, 'FileViewerCapabilitiesProvider', 'value', 'fileViewerCapabilities') === 2,
      (source) => source.replace(/value=\{fileViewerCapabilities\}/g, 'value={null}'),
    );
  });

  it('keeps every inventoried FileViewer menu on the field-owned primitive', () => {
    expect(FILE_VIEWER_MENU_INVENTORY).toHaveLength(10);
    const registrations = fileViewerMenuRegistrations(fileViewerSource);
    expect(registrations).toHaveLength(FILE_VIEWER_MENU_INVENTORY.length);
    for (const menu of FILE_VIEWER_MENU_INVENTORY) {
      const registration = registrations.find((candidate) => candidate.menuId === menu.id);
      expect(registration).toBeDefined();
      expect(registration?.fieldId).toBe(menu.fieldId);
      expect(registration?.triggerRef).toBe(menu.opener);
      expect(registration?.hasOpen).toBe(true);
      expect(registration?.onClose).toBe(menu.onClose);
      expect(registration?.className).toBe(menu.className);
      if (menu.kind === 'mixed') {
        expect(registration?.kind).toBe('mixed');
      }
    }
    // A raw menu is the exact boundary this inventory protects. Mutating the
    // structural opening tag must turn this check red, not leave a substring
    // in a comment or descendant selector to satisfy it.
    expect(astHasRawMenuElement(fileViewerSource)).toBe(false);
    expect(astHasRawMenuElement(
      fileViewerSource.replace('<FileViewerMenuSearch', '<div role="menu"/><FileViewerMenuSearch'),
    )).toBe(true);
    expect(astHasRawMenuElement(fileViewerSource)).toBe(false);
    expect(astHasPropertyStringUnion(fileViewerSource, 'origin', ['head', 'footer'])).toBe(true);
    expect(astHasBinaryExpression(fileViewerSource, "downloadMenuVersionId?.origin === 'head'")).toBe(true);
    expect(astHasBinaryExpression(fileViewerSource, "downloadMenuVersionId?.origin === 'footer'")).toBe(true);
  });

  it('keeps search state and focus behaviour per menu', () => {
    assertMenuBoundary(menuPrimitiveSource);
    expect(astHasRequiredFieldId(menuPrimitiveSource)).toBe(true);
    expect(astHasJsxAttribute(menuPrimitiveSource, 'RegexSearchField', 'fieldId', 'fieldId')).toBe(true);
    expect(astHasCallExpression(menuPrimitiveSource, 'useRegexSearch', ['query', 'setQuery'])).toBe(true);
    expect(astHasJsxAttribute(menuPrimitiveSource, 'RegexSearchField', 'ariaControls', 'resolvedActionsId')).toBe(true);
    expect(astHasJsxAttribute(menuPrimitiveSource, 'RegexSearchField', 'autoFocus', 'Boolean(triggerRef?.current)')).toBe(true);
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', 'Escape']) {
      expect(astHasBinaryExpression(menuPrimitiveSource, `event.key === '${key}'`)).toBe(true);
    }
    expect(astHasCallExpression(menuPrimitiveSource, 'setQuery', ["''"])).toBe(true);
    expect(astHasCallExpression(menuPrimitiveSource, 'focusMenuTrigger', ['triggerRef'])).toBe(true);
    expect(astHasCallExpression(menuPrimitiveSource, 'isOwnedTrigger', ['event.target', 'triggerRef'])).toBe(true);
    expect(astHasBinaryExpression(menuPrimitiveSource, "kind === 'mixed'")).toBe(true);
    expect(astHasCallExpression(menuPrimitiveSource, 'focusableElements', ['surfaceRef.current', 'resolvedSurfaceId'])).toBe(true);
    expect(astHasCallExpression(menuPrimitiveSource, 't', ["'homeHero.noResults'"])).toBe(true);
    expect(astHasCallExpression(menuPrimitiveSource, 't', ["'promptTemplates.countLabel'"])).toBe(true);
    expect(astHasTabClosePredicate(menuPrimitiveSource)).toBe(true);
    expectRedThenGreenAst(
      menuPrimitiveSource,
      (source) => astHasTabClosePredicate(source),
      (source) => source.replace(
        'shouldCloseMenuOnTab(kind, event.target, resolvedSurfaceId)',
        "shouldCloseMenuOnTab('menu', event.target, resolvedSurfaceId)",
      ),
    );
    expectRedThenGreenAst(
      menuPrimitiveSource,
      (source) => astHasSimpleMenuTabBuilderGuard(source),
      (source) => source.replace(
        'if (isOwnedRegexBuilder(event.target, resolvedSurfaceId)) return;',
        'if (false) return;',
      ),
    );
  });

  it('keeps the regex field bound to the owning menu collection', () => {
    expect(astHasJsxAttribute(regexFieldSource, 'input', 'aria-controls', 'ariaControls')).toBe(true);
    expect(astHasInterfaceProperty(regexFieldSource, 'RegexSearchFieldProps', 'ariaControls', true)).toBe(true);
    expect(astHasJsxAttribute(regexFieldSource, 'div', 'data-file-viewer-menu-builder', 'focusScopeId')).toBe(true);
    expect(astHasJsxAttribute(menuPrimitiveSource, 'RegexSearchField', 'id', 'fieldId')).toBe(true);
    expect(astHasPropertyAccess(menuPrimitiveSource, 'CSS', 'escape')).toBe(true);
    expect(astHasClosestOwnershipGuard(menuPrimitiveSource)).toBe(true);
    expectRedThenGreenAst(
      menuPrimitiveSource,
      (source) => astOwnedRegexBuilderGuardCount(source) === 3,
      (source) => source.replace(
        'isOwnedRegexBuilder(event.target, resolvedSurfaceId)',
        'isOwnedRegexBuilder(event.target, menuId)',
      ),
    );
  });

  it('fails closed when a surface, owner token, nested-widget exclusion, or geometry rule disappears', () => {
    expectRedThenGreenAst(
      menuPrimitiveSource,
      (source) => astHasJsxAttribute(source, 'div', 'data-file-viewer-menu-surface', 'resolvedSurfaceId'),
      (source) => source.replace(
        'data-file-viewer-menu-surface={resolvedSurfaceId}',
        'data-file-viewer-menu-surface={menuId}',
      ),
    );
    expectRedThenGreenAst(
      menuPrimitiveSource,
      (source) => astHasJsxAttribute(source, 'div', 'data-file-viewer-menu-actions', 'resolvedSurfaceId'),
      (source) => source.replace(
        'data-file-viewer-menu-actions={resolvedSurfaceId}',
        'data-file-viewer-menu-actions={menuId}',
      ),
    );
    expectRedThenGreenAst(
      menuPrimitiveSource,
      (source) => astOwnedRegexBuilderGuardCount(source) === 3,
      (source) => source.replace(
        'isOwnedRegexBuilder(event.target, resolvedSurfaceId)',
        'isOwnedRegexBuilder(event.target, menuId)',
      ),
    );
    expect(astHasNestedWidgetExclusion(menuPrimitiveSource)).toBe(true);
    const omittedListboxExclusion = menuPrimitiveSource.replace(
      "element.closest('[role=\"listbox\"], [role=\"tree\"], [role=\"tablist\"]')",
      'element',
    );
    expect(astHasNestedWidgetExclusion(omittedListboxExclusion)).toBe(false);
    expect(astHasNestedWidgetExclusion(menuPrimitiveSource)).toBe(true);
    expectRedThenGreenAst(
      menuPrimitiveSource,
      (source) => astHasPropertyAccess(source, 'surface', 'scrollWidth'),
      (source) => source.replace('surface.scrollWidth', 'surface.clientWidth'),
    );
    expectRedThenGreenAst(
      menuPrimitiveSource,
      (source) => astPropertyNameCount(source, 'maxHeight') === 3,
      (source) => source.replace('maxHeight', 'height'),
    );
  });

  it('keeps no-opener, disabled, mixed-focus, portal and inactive-viewer boundaries explicit', () => {
    expect(astHasIfExpression(menuPrimitiveSource, '!trigger')).toBe(true);
    expect(astHasIfExpression(menuPrimitiveSource, 'triggerRef?.current')).toBe(true);
    expect(astHasCallExpression(menuPrimitiveSource, 'action.element.matches', ["':disabled'"])).toBe(true);
    expect(astHasCallExpression(menuPrimitiveSource, 'isOwnedSurface', ['event.target', 'resolvedSurfaceId'])).toBe(true);
    expect(astHasCallExpression(menuPrimitiveSource, 'isOwnedTrigger', ['event.target', 'triggerRef'])).toBe(true);
    expect(astHasJsxAttribute(menuPrimitiveSource, 'div', 'data-file-viewer-menu-builder', 'resolvedSurfaceId')).toBe(true);
    expect(astHasJsxAttribute(fileViewerSource, 'HtmlViewer', 'workspaceActive', 'workspaceActive')).toBe(true);
    expect(astHasJsxAttribute(fileViewerSource, 'HtmlViewer', 'downloadRequest', 'downloadRequest')).toBe(true);
    expect(astHasJsxExpression(fileViewerSource, 'workspaceActive && downloadMenuOpen')).toBe(true);
    expect(astHasJsxExpression(fileViewerSource, 'workspaceActive && shareMenuOpen')).toBe(true);
    expect(astHasJsxExpression(fileViewerSource, 'workspaceActive && shareAccessConfirm')).toBe(true);
    expect(astHasUseEffectWorkspaceCleanup(fileViewerSource, ['setShareMenuOpen', 'setShareAccessConfirm'])).toBe(true);
    expect(astHasUseEffectWorkspaceCleanup(fileViewerSource, ['setDownloadMenuOpen'])).toBe(true);
    expect(astHasJsxAttribute(regexBuilderSource, 'div', 'role', 'alert')).toBe(true);
    expect(astHasCallExpression(menuPrimitiveSource, 'search.matches', ['action.label'])).toBe(true);
  });

  it('keeps direct labels wrappable at narrow bilingual widths', () => {
    expect(viewerToolsSource).toContain('.share-menu-item > span:not(.share-menu-icon)');
    expect(viewerToolsSource).toContain('overflow-wrap: anywhere;');
    expect(viewerToolsSource).toContain('white-space: normal;');
    expect(viewerToolsSource).toContain('min-width: 0;');
    expect(viewerCoreSource).toContain('.viewer-toolbar-more-item span');
    expect(viewerCoreSource).toContain('overflow-wrap: anywhere;');
    expect(viewerToolsSource).toContain('min-height: 48px;');
    expect(viewerToolsSource).toContain('.file-viewer-menu-search__field > button');
    expect(viewerCoreSource).toContain('.viewer-toolbar-more-item {');
    expect(viewerCoreSource).toContain('.od-select-menu.portal.viewer-viewport-menu');
    const viewportOverflowRule = '.od-select-menu.portal.viewer-viewport-menu {\n  right: auto;\n  bottom: auto;\n  overflow-y: auto;\n  overflow-x: hidden;\n}';
    expectRedThenGreenText(viewerCoreSource, viewportOverflowRule, (source) => source.replace(
      viewportOverflowRule,
      viewportOverflowRule.replace('overflow-y: auto;', 'overflow-y: hidden;'),
    ));
    expect(viewerCoreSource).not.toContain('.file-version-restore-confirm');
    expect(viewerCoreSource).not.toContain('.file-version-search-clear');
    expect(shellSource).toContain('.artifact-version-panel__download-head');
    expect(shellSource).toContain('.od-select-menu.portal.chrome-access-options');
    const accessOverflowRule = '.od-select-menu.portal.chrome-access-options {\n  right: auto;\n  bottom: auto;\n  overflow-y: auto;\n  overflow-x: hidden;\n}';
    expectRedThenGreenText(shellSource, accessOverflowRule, (source) => source.replace(
      accessOverflowRule,
      accessOverflowRule.replace('overflow-y: auto;', 'overflow-y: hidden;'),
    ));
    expectRedThenGreenAst(
      customSelectSource,
      (source) => astPropertyNameCount(source, 'maxHeight') === 1,
      (source) => source.replace('maxHeight', 'height'),
    );
    expect(shellSource).toContain('min-width: 48px;');
    expect(shellSource).toContain('min-height: 48px;');
  });
});
