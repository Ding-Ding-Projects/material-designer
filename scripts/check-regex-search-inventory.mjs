#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// This is the executable source of truth for the shell Chut and the focused
// TypeScript regression. It deliberately checks one JSX invocation at a time:
// three markers scattered through one file are not proof that one field owns
// its component, field binding, and controller.
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const require = createRequire(import.meta.url);
const typescriptPath = resolve(root, 'design/node_modules/typescript/lib/typescript.js');
const ts = require(typescriptPath);

function sourceFile(source, sourcePath) {
  const scriptKind = sourcePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.JS;
  return ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, scriptKind);
}

/** Parse name="literal" or name={expression} with the TypeScript JSX AST. */
export function parseAttributeMarker(marker) {
  const file = ts.createSourceFile('marker.tsx', `<Marker ${marker} />`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (file.parseDiagnostics.length > 0) return null;
  let parsed = null;
  const visit = (node) => {
    if (parsed || !ts.isJsxSelfClosingElement(node)) {
      ts.forEachChild(node, visit);
      return;
    }
    const property = node.attributes.properties[0];
    if (!property || !ts.isJsxAttribute(property)) return;
    const initializer = property.initializer;
    if (!initializer) return;
    if (ts.isStringLiteral(initializer)) {
      parsed = { name: property.name.text, value: initializer.text, expression: false };
    } else if (ts.isJsxExpression(initializer) && initializer.expression) {
      parsed = { name: property.name.text, value: initializer.expression.getText(file).trim(), expression: true };
    }
  };
  visit(file);
  return parsed;
}

function attributeMatches(file, property, marker) {
  const expected = parseAttributeMarker(marker);
  if (!expected || !ts.isJsxAttribute(property) || property.name.text !== expected.name) return false;
  const initializer = property.initializer;
  if (!initializer) return false;
  if (!expected.expression && ts.isStringLiteral(initializer)) return initializer.text === expected.value;
  if (expected.expression && ts.isJsxExpression(initializer)) {
    return initializer.expression?.getText(file).trim() === expected.value;
  }
  return false;
}

function jsxElements(file) {
  const elements = [];
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) elements.push(node);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return elements;
}

function componentName(marker) {
  return marker.startsWith('<') ? marker.slice(1).trim() : 'RegexSearchField';
}

function fieldMarker(row) {
  return row.searchMarker.startsWith('<') ? row.builderMarker : row.searchMarker;
}

function handoffRowMatches(file, row) {
  const parentMarker = parseAttributeMarker(row.searchMarker);
  if (!parentMarker) return { matchedInvocations: 0, missingFieldIds: [...row.fieldIds] };
  const sections = [];
  const visit = (node) => {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(file) === 'RegistrySection') sections.push(node.openingElement);
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(file) === 'RegistrySection') sections.push(node);
    ts.forEachChild(node, visit);
  };
  visit(file);
  let ownerImplementation = false;
  const inspectOwner = (node) => {
    if (ownerImplementation || !ts.isFunctionDeclaration(node) || node.name?.text !== 'RegistrySection') {
      ts.forEachChild(node, inspectOwner);
      return;
    }
    const parameters = node.parameters.flatMap((parameter) => {
      if (ts.isIdentifier(parameter.name)) return [parameter.name.text];
      if (ts.isObjectBindingPattern(parameter.name)) return parameter.name.elements.map((element) => element.name.getText(file));
      return [];
    });
    if (!parameters.includes('searchId') || !parameters.includes('search')) return;
    const inspectField = (child) => {
      if (ownerImplementation) return;
      if (ts.isJsxOpeningElement(child) || ts.isJsxSelfClosingElement(child)) {
        if (child.tagName.getText(file) === 'RegexSearchField') {
          const properties = Array.from(child.attributes.properties);
          ownerImplementation = properties.some((property) => attributeMatches(file, property, 'testId={searchId}'))
            && properties.some((property) => attributeMatches(file, property, 'search={search}'));
        }
      }
      ts.forEachChild(child, inspectField);
    };
    inspectField(node.body);
  };
  inspectOwner(file);
  if (!ownerImplementation) return { matchedInvocations: 0, missingFieldIds: [...row.fieldIds] };
  const matched = new Set();
  let matchedCount = 0;
  for (const section of sections) {
    const properties = Array.from(section.attributes.properties);
    const searchId = properties.find((property) => ts.isJsxAttribute(property) && property.name.text === parentMarker.name);
    if (!searchId || !ts.isJsxAttribute(searchId) || !searchId.initializer || !ts.isStringLiteral(searchId.initializer)) continue;
    const id = searchId.initializer.text;
    if (!row.fieldIds.includes(id)) continue;
    const controller = id.includes('token') ? 'search={tokenSearch}' : 'search={componentSearch}';
    if (!properties.some((property) => attributeMatches(file, property, controller))) continue;
    matched.add(id);
    matchedCount += 1;
  }
  const missingFieldIds = row.fieldIds.filter((id) => !matched.has(id));
  return { matchedInvocations: matchedCount, missingFieldIds };
}

function libraryFilterRowMatches(file, row) {
  const expectedField = parseAttributeMarker(row.searchMarker);
  if (!expectedField) return { matchedInvocations: 0, missingFieldIds: [...row.fieldIds] };
  const elements = jsxElements(file);
  const owner = elements.find((field) => {
    if (field.tagName.getText(file) !== 'RegexSearchField') return false;
    const properties = Array.from(field.attributes.properties);
    return properties.some((property) => attributeMatches(file, property, row.searchMarker))
      && properties.some((property) => attributeMatches(file, property, row.stateMarker));
  }) ?? null;
  if (!owner) return { matchedInvocations: 0, missingFieldIds: [...row.fieldIds] };
  const callIds = [];
  for (const element of elements) {
    if (element.tagName.getText(file) !== 'LibraryFilterCombobox') continue;
    const attr = Array.from(element.attributes.properties).find((property) => ts.isJsxAttribute(property) && property.name.text === 'testId');
    if (attr && ts.isJsxAttribute(attr) && attr.initializer && ts.isStringLiteral(attr.initializer)) callIds.push(`${attr.initializer.text}-search`);
  }
  const callIdSet = new Set(callIds);
  const missingFieldIds = row.fieldIds.filter((id) => !callIdSet.has(id));
  return { matchedInvocations: callIds.filter((id) => row.fieldIds.includes(id)).length, missingFieldIds };
}

/** Return exact invocation count and every field id not owned by one. */
export function jsxInventoryRowMatches(file, row) {
  if (row.owner === 'HandoffView') return handoffRowMatches(file, row);
  if (row.owner === 'LibraryFilterCombobox') return libraryFilterRowMatches(file, row);
  const component = componentName(row.searchMarker);
  const field = fieldMarker(row);
  const controller = row.stateMarker;
  const fieldAttribute = parseAttributeMarker(field);
  const matched = new Set();
  let matchedCount = 0;
  for (const element of jsxElements(file)) {
    if (element.tagName.getText(file) !== component) continue;
    const properties = Array.from(element.attributes.properties);
    const fieldIsComponent = field.startsWith('<')
      ? componentName(field) === component
      : row.fieldIds.length > 1 && fieldAttribute
        ? properties.some((property) => ts.isJsxAttribute(property) && property.name.text === fieldAttribute.name)
        : properties.some((property) => attributeMatches(file, property, field));
    const controllerIsPresent = controller.startsWith('<')
      ? componentName(controller) === component
      : properties.some((property) => attributeMatches(file, property, controller));
    if (!fieldIsComponent || !controllerIsPresent) continue;
    if (!fieldAttribute) continue;
    const property = properties.find((candidate) => ts.isJsxAttribute(candidate) && candidate.name.text === fieldAttribute.name);
    if (!property || !ts.isJsxAttribute(property) || !property.initializer) continue;
    if (ts.isStringLiteral(property.initializer)) {
      if (row.fieldIds.includes(property.initializer.text)) {
        matched.add(property.initializer.text);
        matchedCount += 1;
      }
    } else if (fieldAttribute.expression && ts.isJsxExpression(property.initializer) && property.initializer.expression) {
      const expression = property.initializer.expression.getText(file).trim();
      for (const fieldId of row.fieldIds) {
        if (expression === `\`${fieldId}\`` || expression === fieldId) {
          matched.add(fieldId);
          matchedCount += 1;
        }
      }
    }
  }
  return { matchedInvocations: matchedCount, missingFieldIds: row.fieldIds.filter((id) => !matched.has(id)) };
}

/** Require every row field id and the declared number of invocations. */
export function jsxInventoryRowPresent(file, row) {
  const result = jsxInventoryRowMatches(file, row);
  return result.matchedInvocations === row.instances && result.missingFieldIds.length === 0;
}

function htmlMarkerPresent(source, marker) {
  const parsed = parseAttributeMarker(marker);
  if (!parsed || parsed.expression) return false;
  // The inventory only uses simple HTML attributes. Remove comments before
  // looking at a tag so a commented example can never satisfy the Chut.
  const withoutComments = source.replace(/<!--[\s\S]*?-->/g, '');
  const attribute = new RegExp(`[\\s<]${parsed.name}=["']${parsed.value.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}["'](?=[\\s>/])`);
  return Array.from(withoutComments.matchAll(/<[^>]*>/g)).some((tag) => attribute.test(tag[0]));
}

function javascriptMarkerPresent(file, marker) {
  if (marker.endsWith('({')) {
    const name = marker.slice(0, -2);
    let found = false;
    const visit = (node) => {
      if (ts.isCallExpression(node) && node.expression.getText(file) === name && node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])) found = true;
      ts.forEachChild(node, visit);
    };
    visit(file);
    return found;
  }
  let found = false;
  const visit = (node) => {
    if (ts.isIdentifier(node) && node.text === marker) found = true;
    if (ts.isPropertyAccessExpression(node) && node.getText(file) === marker) found = true;
    if (ts.isPropertyAssignment(node) && node.getText(file) === marker) found = true;
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

export function executableRowPresent(source, sourcePath, row) {
  if (row.status === 'not-wired') return row.scopeNote.startsWith('RED:');
  if (sourcePath.endsWith('.tsx') || sourcePath.endsWith('.ts')) return jsxInventoryRowPresent(sourceFile(source, sourcePath), row);
  if (sourcePath.endsWith('.html')) return htmlMarkerPresent(source, row.searchMarker) && htmlMarkerPresent(source, row.builderMarker);
  const file = sourceFile(source, sourcePath);
  return javascriptMarkerPresent(file, row.searchMarker)
    && javascriptMarkerPresent(file, row.builderMarker)
    && javascriptMarkerPresent(file, row.stateMarker);
}

async function loadInventory(inventoryPath) {
  const source = readFileSync(inventoryPath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: inventoryPath,
  }).outputText;
  const url = `data:text/javascript;base64,${Buffer.from(transpiled, 'utf8').toString('base64')}`;
  return import(url);
}

async function runCli() {
  const sourceRoot = process.env.SOURCE_ROOT ? resolve(process.env.SOURCE_ROOT) : root;
  const suppliedInventory = process.env.INVENTORY_FILE ? resolve(process.env.INVENTORY_FILE) : null;
  const inventoryPath = suppliedInventory?.endsWith('.ts')
    ? suppliedInventory
    : resolve(sourceRoot, 'design/apps/web/src/components/regex/searchSurfaceInventory.ts');
  const inventory = await loadInventory(inventoryPath);
  const rows = inventory.REGEX_SEARCH_SURFACE_INVENTORY;
  for (const row of rows) {
    if (row.status === 'not-wired') continue;
    const sourcePath = resolve(sourceRoot, row.sourcePath);
    let source;
    try {
      source = readFileSync(sourcePath, 'utf8');
    } catch {
      console.error(`MISSING_SOURCE=${row.sourcePath}`);
      process.exitCode = 1;
      break;
    }
    if (!executableRowPresent(source, row.sourcePath, row)) {
      const marker = row.sourcePath.endsWith('FileViewer.tsx') && row.fieldIds?.length > 1
        ? `fieldId="${row.fieldIds[0]}"`
        : row.searchMarker.startsWith('<') ? row.builderMarker : row.searchMarker;
      console.error(`MISSING_REGISTRATION=${row.sourcePath}:${marker}`);
      process.exitCode = 1;
      break;
    }
  }
  if (!process.exitCode) console.log('regex AST inventory: green');
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
