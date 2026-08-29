import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const JS_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.cts', '.mts'];
const COMPONENT_NAME = /^[A-Z]/;
const RENDER_CALL_NAMES = new Set(['createElement', 'createPortal', 'jsx', 'jsxs', 'jsxDEV']);
const DESKTOP_DYNAMIC_LIMITS = Object.freeze([
  Object.freeze({
    id: 'runtime-computed-component-targets',
    classification: 'reviewed-dynamic-limit',
    reason: 'Runtime computed component values without a finite literal binding remain classified at their call sites; the parser does not invent target components.',
  }),
  Object.freeze({
    id: 'bounded-hoc-wrapper-depth',
    classification: 'reviewed-dynamic-limit',
    reason: 'Higher-order component wrapper chains are followed through at most eight calls; a deeper chain remains explicit instead of being guessed.',
  }),
  Object.freeze({
    id: 'runtime-object-registry-membership',
    classification: 'reviewed-dynamic-limit',
    reason: 'Unresolved object spreads and computed component-registry keys remain dynamic-boundary element rows with their exact call sites.',
  }),
  Object.freeze({
    id: 'runtime-render-prop-targets',
    classification: 'reviewed-dynamic-limit',
    reason: 'Render-prop functions and invocations are explicit structural rows, while the runtime-selected callback implementation is not invented.',
  }),
]);
const SITE_DYNAMIC_LIMITS = Object.freeze([
  Object.freeze({
    id: 'runtime-html-and-tag-values',
    classification: 'reviewed-dynamic-limit',
    reason: 'Nonliteral runtime HTML and tag expressions remain explicit dynamic creator rows; the parser does not claim tags it cannot derive safely.',
  }),
]);

const AUTHORITATIVE_REASONS = Object.freeze({
  'render-reachable-owner': 'The component owner is reachable from a desktop entry root through parsed component references.',
  'module-reachable-only-owner': 'The module is imported from a desktop entry root, but this component owner is not resolved from a parsed render reference and remains explicit.',
  'module-reachable-only-element': 'The containing module is reachable, but its component owner is not resolved from a parsed render reference; the element remains explicit instead of being dropped.',
  'rendered-intrinsic': 'The parsed node contributes an element, component, or imperative DOM boundary to a reachable module.',
  'rendered-component': 'The parsed node contributes an element, component, or imperative DOM boundary to a reachable module.',
  'dynamic-component': 'The call site renders through a statically bounded dynamic tag or component reference.',
  fragment: 'The fragment groups rendered children without adding a DOM node.',
  portal: 'The call renders an owned subtree into a portal host.',
  'shadow-root': 'The parsed node contributes an element, component, or imperative DOM boundary to a reachable module.',
  'render-prop-function': 'A function-valued JSX child or property supplies a render-prop subtree while the enclosing component retains invocation ownership.',
  'render-prop-call': 'A render callback is invoked inside JSX and owns a runtime-supplied subtree.',
  'dynamic-html': 'The HTML payload is runtime-computed and remains an explicit dynamic boundary.',
  'static-html-payload': 'A statically parsed HTML payload creates this element in a desktop runtime boundary.',
  'registry-object-spread': 'The component registry includes an object spread whose complete runtime membership cannot be invented.',
  'registry-computed-access': 'The component registry uses a computed key and is retained as an explicit runtime boundary.',
  'source-exclusion': 'The JavaScript or TypeScript module is not reachable from any committed desktop entry root and is tracked explicitly so it cannot disappear silently.',
  'comment-exclusion': 'Parser comment trivia contains render-like text but cannot create a runtime element.',
  'site-static-html': 'The parsed HTML start tag is part of the documentation site entry document.',
  'site-html-comment': 'HTML comment text contains markup-like content but is not a rendered start tag.',
  'site-dynamic-creator': 'The creator receives runtime content or a runtime tag and is retained as an explicit reviewed dynamic boundary.',
  'site-html-creator': 'A statically inspectable HTML payload contributes the listed element at this call site.',
  'site-dom-creator': 'The parsed JavaScript call creates this DOM node at runtime.',
});

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function slash(value) {
  return value.split(path.sep).join('/');
}

function slug(value) {
  return value
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function stableId(prefix, identity) {
  return `${prefix}-${sha256(identity).slice(0, 20)}`;
}

function listFiles(directory, predicate) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (predicate(full)) files.push(full);
    }
  };
  walk(directory);
  return files;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function loadDeclaredParser(root) {
  const manifestPath = path.join(root, 'design', 'apps', 'daemon', 'package.json');
  const manifest = readJson(manifestPath);
  const declaredVersion = manifest.dependencies?.['@babel/parser'];
  if (declaredVersion !== '7.29.3') {
    throw new Error(`parser dependency drifted: design/apps/daemon/package.json declares ${String(declaredVersion)}, expected 7.29.3`);
  }
  const requireFromDaemon = createRequire(manifestPath);
  let parserPath;
  try {
    parserPath = requireFromDaemon.resolve('@babel/parser');
  } catch (error) {
    throw new Error(`declared parser is not installed: run corepack pnpm --dir design install --frozen-lockfile before this check (${error instanceof Error ? error.message : String(error)})`);
  }
  const parserManifestPath = requireFromDaemon.resolve('@babel/parser/package.json');
  const parserManifest = readJson(parserManifestPath);
  if (parserManifest.version !== declaredVersion) {
    throw new Error(`installed parser version ${String(parserManifest.version)} does not match declared version ${declaredVersion}`);
  }
  const parser = requireFromDaemon('@babel/parser');
  if (typeof parser.parse !== 'function') throw new Error('declared parser does not expose parse()');
  return { parse: parser.parse, packageName: '@babel/parser', version: parserManifest.version, manifestPath: 'design/apps/daemon/package.json' };
}

function parserPlugins(relativePath) {
  const extension = path.extname(relativePath).toLowerCase();
  const plugins = ['importAttributes', 'explicitResourceManagement', 'decorators-legacy'];
  if (extension === '.ts' || extension === '.tsx' || extension === '.cts' || extension === '.mts') plugins.push('typescript');
  if (extension === '.tsx' || extension === '.jsx') plugins.push('jsx');
  return plugins;
}

function parseModule(parser, relativePath, source) {
  try {
    return parser.parse(source, {
      sourceType: path.extname(relativePath).toLowerCase() === '.cts' ? 'module' : 'unambiguous',
      sourceFilename: relativePath,
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: false,
      errorRecovery: false,
      ranges: true,
      tokens: false,
      attachComment: true,
      plugins: parserPlugins(relativePath),
    });
  } catch (error) {
    throw new Error(`AST parse failed for ${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function isAstNode(value) {
  return value !== null && typeof value === 'object' && typeof value.type === 'string';
}

function childNodes(node) {
  const children = [];
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'start', 'end', 'extra', 'comments', 'leadingComments', 'trailingComments', 'innerComments', 'tokens'].includes(key)) continue;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (isAstNode(item)) children.push({ key, index, node: item });
      });
    } else if (isAstNode(value)) children.push({ key, index: null, node: value });
  }
  return children;
}

function walkAst(node, visitor, ancestors = [], relation = null) {
  visitor.enter?.(node, ancestors, relation);
  const nextAncestors = [...ancestors, node];
  for (const child of childNodes(node)) walkAst(child.node, visitor, nextAncestors, child);
  visitor.exit?.(node, ancestors, relation);
}

function staticString(node) {
  if (!node) return null;
  if (node.type === 'StringLiteral' || node.type === 'Literal') return typeof node.value === 'string' ? node.value : null;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis.map((part) => part.value.cooked ?? part.value.raw).join('');
  return null;
}

function unwrapExpression(node) {
  let current = node;
  while (current && ['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'TypeCastExpression', 'ParenthesizedExpression'].includes(current.type)) current = current.expression;
  return current;
}

function memberChain(node) {
  const current = unwrapExpression(node);
  if (!current) return null;
  if (current.type === 'Identifier') return [current.name];
  if (current.type === 'ThisExpression') return ['this'];
  if (current.type === 'MemberExpression' || current.type === 'OptionalMemberExpression') {
    const object = memberChain(current.object);
    const property = current.computed ? staticString(current.property) : current.property?.name;
    return object && property ? [...object, property] : null;
  }
  return null;
}

function bindingNameFromParent(node, ancestors) {
  const parent = ancestors.at(-1);
  if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') return node.id?.name ?? null;
  if ((node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression' || node.type === 'ClassExpression') && parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier') return parent.id.name;
  if ((node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') && (parent?.type === 'ObjectProperty' || parent?.type === 'ObjectMethod')) return parent.key?.name ?? staticString(parent.key);
  if ((node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') && parent?.type === 'ExportDefaultDeclaration' && !node.id) return 'default';
  return null;
}

function containsRenderSyntax(node) {
  let found = false;
  const visit = (current, isRoot = false) => {
    if (found) return;
    if (!isRoot && ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ClassDeclaration', 'ClassExpression'].includes(current.type)) return;
    if (current.type === 'JSXElement' || current.type === 'JSXFragment') {
      found = true;
      return;
    }
    if (current.type === 'CallExpression') {
      const chain = memberChain(current.callee);
      if (chain && RENDER_CALL_NAMES.has(chain.at(-1))) {
        found = true;
        return;
      }
    }
    for (const child of childNodes(current)) visit(child.node, false);
  };
  visit(node, true);
  return found;
}

function wrapperBindings(ast) {
  const nodeBindings = new Map();
  const targetBindings = new Map();
  const outerTargets = new Map();
  const wrapperNameForCallee = (callee, depth = 0) => {
    if (!callee || depth > 8) return 'unknown-wrapper';
    const chain = memberChain(callee);
    if (chain) return chain.join('.');
    if (callee.type === 'CallExpression') return wrapperNameForCallee(callee.callee, depth + 1);
    return callee.type;
  };
  const trace = (node, wrappers = [], depth = 0) => {
    if (!node || depth > 8) return null;
    const current = unwrapExpression(node);
    if (['FunctionExpression', 'ArrowFunctionExpression', 'FunctionDeclaration', 'ClassExpression', 'ClassDeclaration'].includes(current.type)) return { node: current, targetName: current.id?.name ?? null, wrappers };
    if (current.type === 'Identifier') return { node: null, targetName: current.name, wrappers };
    if (current.type !== 'CallExpression') return null;
    const wrapperName = wrapperNameForCallee(current.callee);
    const candidate = current.arguments.find((argument) => {
      const value = unwrapExpression(argument);
      return value && (['FunctionExpression', 'ArrowFunctionExpression', 'ClassExpression', 'CallExpression'].includes(value.type) || (value.type === 'Identifier' && COMPONENT_NAME.test(value.name)));
    });
    return candidate ? trace(candidate, [...wrappers, wrapperName], depth + 1) : null;
  };
  walkAst(ast.program, {
    enter(node) {
      if (node.type !== 'VariableDeclarator' || node.id.type !== 'Identifier' || !COMPONENT_NAME.test(node.id.name) || !node.init) return;
      const traced = trace(node.init);
      if (!traced || traced.wrappers.length === 0) return;
      const row = { outerName: node.id.name, targetName: traced.targetName, wrapperChain: traced.wrappers, wrapperNode: node.init };
      if (traced.node) nodeBindings.set(traced.node, row);
      if (traced.targetName) {
        const list = targetBindings.get(traced.targetName) ?? [];
        list.push(row);
        targetBindings.set(traced.targetName, list);
      }
      outerTargets.set(node.id.name, row);
    },
  });
  return { nodeBindings, targetBindings, outerTargets };
}

function ownerNameForNode(node, ancestors, wrappers) {
  const direct = wrappers.nodeBindings.get(node);
  if (direct) return { name: direct.outerName, wrapperChain: direct.wrapperChain, wrapperNode: direct.wrapperNode };
  const baseName = bindingNameFromParent(node, ancestors);
  const aliases = baseName ? wrappers.targetBindings.get(baseName) ?? [] : [];
  if (aliases.length > 0) return { name: aliases[0].outerName, wrapperChain: aliases[0].wrapperChain, wrapperNode: aliases[0].wrapperNode };
  return { name: baseName, wrapperChain: [], wrapperNode: null };
}

function ownerCandidates(relativePath, source, ast) {
  const rows = [];
  const lexicalStack = [];
  const occurrence = new Map();
  const wrappers = wrapperBindings(ast);
  walkAst(ast.program ?? ast, {
    enter(node, ancestors) {
      if (!['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ClassDeclaration', 'ClassExpression'].includes(node.type)) return;
      const ownerIdentity = ownerNameForNode(node, ancestors, wrappers);
      const name = ownerIdentity.name;
      if (!name) return;
      const classRender = (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') && node.body?.body?.some((member) => member.type === 'ClassMethod' && member.key?.name === 'render');
      const componentOwner = COMPONENT_NAME.test(name) || name === 'default' || classRender || ownerIdentity.wrapperChain.length > 0;
      if (!componentOwner) return;
      const hasRenderSyntax = containsRenderSyntax(node) || classRender;
      if (!hasRenderSyntax) return;
      const parentNames = ancestors
        .filter((ancestor) => ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ClassDeclaration', 'ClassExpression'].includes(ancestor.type))
        .map((ancestor) => ownerNameForNode(ancestor, ancestors.slice(0, ancestors.indexOf(ancestor)), wrappers).name ?? 'anonymous');
      const lexicalPath = [...parentNames, name].join('>');
      const key = `${relativePath}|${lexicalPath}|${node.type}`;
      const ordinal = (occurrence.get(key) ?? 0) + 1;
      occurrence.set(key, ordinal);
      const identity = `${relativePath}#${lexicalPath}:${node.type}:${ordinal}`;
      rows.push({
        id: stableId('desktop-owner', identity),
        sourcePath: relativePath,
        owner: name,
        callSiteIdentity: identity,
        nodeKind: node.type,
        wrapperChain: ownerIdentity.wrapperChain,
        classification: parentNames.length === 0 ? 'module-component-owner' : 'nested-component-owner',
        reason: parentNames.length === 0 ? 'Component declaration is in a module reachable from a desktop entry root.' : 'Nested component declaration is inside a reachable component module.',
        sourceHash: sha256(source.slice(ownerIdentity.wrapperNode?.start ?? node.start ?? 0, ownerIdentity.wrapperNode?.end ?? node.end ?? 0)),
        start: node.start,
        end: node.end,
        node,
      });
      lexicalStack.push(node);
    },
    exit(node) {
      if (lexicalStack.at(-1) === node) lexicalStack.pop();
    },
  });
  return { rows, wrappers };
}

function moduleSources(ast) {
  const sources = [];
  walkAst(ast.program ?? ast, {
    enter(node) {
      if ((node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') && node.source) {
        const value = staticString(node.source);
        if (value) sources.push({ value, kind: node.type });
      }
      if (node.type === 'CallExpression' && node.callee?.type === 'Import' && node.arguments.length === 1) {
        const value = staticString(node.arguments[0]);
        if (value) sources.push({ value, kind: 'ImportExpression' });
      }
      if (node.type === 'ImportExpression') {
        const value = staticString(node.source);
        if (value) sources.push({ value, kind: 'ImportExpression' });
      }
    },
  });
  return sources;
}

function resolveModule(root, fromRelative, specifier) {
  let base;
  if (specifier.startsWith('.')) base = path.resolve(root, path.dirname(fromRelative), specifier);
  else if (specifier.startsWith('@/')) base = path.resolve(root, 'design', 'apps', 'web', specifier.slice(2));
  else return null;
  const allowedRoots = [path.resolve(root, 'design', 'apps', 'web'), path.resolve(root, 'design', 'apps', 'desktop')];
  if (!allowedRoots.some((allowedRoot) => base === allowedRoot || base.startsWith(`${allowedRoot}${path.sep}`))) return null;
  const requestedExtension = path.extname(base).toLowerCase();
  if (requestedExtension && ![...JS_EXTENSIONS, '.mjs', '.cjs'].includes(requestedExtension)) return null;
  const sourceStem = requestedExtension ? base.slice(0, -requestedExtension.length) : base;
  const runtimeSourceCandidates = requestedExtension === '.js' ? [`${sourceStem}.ts`, `${sourceStem}.tsx`] : requestedExtension === '.mjs' ? [`${sourceStem}.mts`, `${sourceStem}.ts`] : requestedExtension === '.cjs' ? [`${sourceStem}.cts`, `${sourceStem}.ts`] : [];
  const candidates = requestedExtension
    ? [base, ...runtimeSourceCandidates]
    : [...JS_EXTENSIONS.map((extension) => `${base}${extension}`), ...JS_EXTENSIONS.map((extension) => path.join(base, `index${extension}`))];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return slash(path.relative(root, candidate));
  }
  return null;
}

function importAliases(ast) {
  const aliases = {
    createElement: new Set(),
    createPortal: new Set(),
    jsxFactory: new Set(),
    reactNamespaces: new Set(),
    reactDomNamespaces: new Set(),
  };
  for (const statement of ast.program.body) {
    if (statement.type !== 'ImportDeclaration') continue;
    const source = staticString(statement.source);
    for (const specifier of statement.specifiers) {
      if (specifier.type === 'ImportNamespaceSpecifier') {
        if (source === 'react') aliases.reactNamespaces.add(specifier.local.name);
        if (source === 'react-dom') aliases.reactDomNamespaces.add(specifier.local.name);
        continue;
      }
      if (specifier.type !== 'ImportSpecifier') continue;
      const imported = specifier.imported?.name ?? staticString(specifier.imported);
      if (source === 'react' && imported === 'createElement') aliases.createElement.add(specifier.local.name);
      if (source === 'react-dom' && imported === 'createPortal') aliases.createPortal.add(specifier.local.name);
      if ((source === 'react/jsx-runtime' || source === 'react/jsx-dev-runtime') && ['jsx', 'jsxs', 'jsxDEV'].includes(imported)) aliases.jsxFactory.add(specifier.local.name);
    }
  }
  return aliases;
}

function componentBindings(root, relativePath, ast, wrappers = wrapperBindings(ast)) {
  const bindings = new Map();
  const reExports = new Map();
  const localExports = new Map();
  const exportAll = [];
  const variableInitializers = new Map();
  for (const statement of ast.program.body) {
    if (statement.type === 'ImportDeclaration') {
      const moduleSource = staticString(statement.source);
      const targetPath = moduleSource ? resolveModule(root, relativePath, moduleSource) : null;
      for (const specifier of statement.specifiers) {
        if (specifier.type === 'ImportSpecifier') bindings.set(specifier.local.name, [{ targetPath, importedName: specifier.imported?.name ?? staticString(specifier.imported) ?? specifier.local.name }]);
        else if (specifier.type === 'ImportDefaultSpecifier') bindings.set(specifier.local.name, [{ targetPath, importedName: 'default' }]);
        else if (specifier.type === 'ImportNamespaceSpecifier') bindings.set(specifier.local.name, [{ targetPath, importedName: '*' }]);
      }
    }
    if (statement.type === 'ExportNamedDeclaration' && !statement.source) {
      const declaration = statement.declaration;
      if (declaration?.type === 'FunctionDeclaration' || declaration?.type === 'ClassDeclaration') {
        if (declaration.id?.name) localExports.set(declaration.id.name, declaration.id.name);
      } else if (declaration?.type === 'VariableDeclaration') {
        for (const item of declaration.declarations) if (item.id?.type === 'Identifier') localExports.set(item.id.name, item.id.name);
      }
      for (const specifier of statement.specifiers) {
        if (specifier.type !== 'ExportSpecifier') continue;
        const exportedName = specifier.exported?.name ?? staticString(specifier.exported);
        const localName = specifier.local?.name ?? staticString(specifier.local);
        if (exportedName && localName) localExports.set(exportedName, localName);
      }
    }
    if (statement.type === 'ExportDefaultDeclaration') {
      const declaration = unwrapExpression(statement.declaration);
      if (declaration?.type === 'Identifier') localExports.set('default', declaration.name);
      else if ((declaration?.type === 'FunctionDeclaration' || declaration?.type === 'ClassDeclaration') && declaration.id?.name) localExports.set('default', declaration.id.name);
    }
    if ((statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportAllDeclaration') && statement.source) {
      const moduleSource = staticString(statement.source);
      const targetPath = moduleSource ? resolveModule(root, relativePath, moduleSource) : null;
      if (statement.type === 'ExportAllDeclaration') {
        if (targetPath) exportAll.push(targetPath);
      } else for (const specifier of statement.specifiers) {
        if (specifier.type !== 'ExportSpecifier') continue;
        const exportedName = specifier.exported?.name ?? staticString(specifier.exported);
        const importedName = specifier.local?.name ?? staticString(specifier.local);
        if (exportedName && importedName) reExports.set(exportedName, [{ targetPath, importedName }]);
      }
    }
    const variableDeclaration = statement.type === 'VariableDeclaration' ? statement : statement.type === 'ExportNamedDeclaration' && statement.declaration?.type === 'VariableDeclaration' ? statement.declaration : null;
    if (variableDeclaration) for (const declaration of variableDeclaration.declarations) if (declaration.id.type === 'Identifier' && declaration.init) variableInitializers.set(declaration.id.name, declaration.init);
  }
  for (const [localName, initializer] of variableInitializers) {
    let targetPath = null;
    let importedName = 'default';
    walkAst(initializer, {
      enter(node, ancestors) {
        if (node.type === 'ImportExpression') {
          const moduleSource = staticString(node.source);
          if (moduleSource) targetPath = resolveModule(root, relativePath, moduleSource);
        }
        if (node.type === 'CallExpression' && node.callee?.type === 'Import') {
          const moduleSource = staticString(node.arguments?.[0]);
          if (moduleSource) targetPath = resolveModule(root, relativePath, moduleSource);
        }
        if (node.type === 'MemberExpression' && !node.computed && node.object?.type === 'Identifier' && node.property?.type === 'Identifier') {
          const insideThen = ancestors.some((ancestor) => ancestor.type === 'CallExpression' && memberChain(ancestor.callee)?.at(-1) === 'then');
          if (insideThen) importedName = node.property.name;
        }
      },
    });
    if (targetPath) bindings.set(localName, [{ targetPath, importedName }]);
  }
  const candidatesFor = (name, seen = new Set(), depth = 0) => {
    if (depth > 12 || seen.has(name)) return [];
    seen.add(name);
    const wrapper = wrappers.outerTargets.get(name);
    if (wrapper?.targetName) return [...new Set([name, wrapper.targetName])];
    const initializer = variableInitializers.get(name);
    if (!initializer) return [name];
    const collect = (node, level = 0) => {
      if (!node || level > 12) return [];
      const current = unwrapExpression(node);
      if (current.type === 'Identifier') return candidatesFor(current.name, new Set(seen), depth + 1);
      if (current.type === 'ConditionalExpression') return [...collect(current.consequent, level + 1), ...collect(current.alternate, level + 1)];
      if (current.type === 'LogicalExpression') return [...collect(current.left, level + 1), ...collect(current.right, level + 1)];
      if (current.type === 'ArrayExpression') return current.elements.flatMap((element) => collect(element, level + 1));
      if (current.type === 'ObjectExpression') return current.properties.flatMap((property) => property.type === 'ObjectProperty' ? collect(property.value, level + 1) : property.type === 'SpreadElement' ? collect(property.argument, level + 1) : []);
      if (current.type === 'MemberExpression' && current.object?.type === 'Identifier') {
        const object = variableInitializers.get(current.object.name);
        if (object?.type !== 'ObjectExpression') return [];
        const propertyName = current.computed ? staticString(current.property) : current.property?.name;
        const properties = propertyName === null || propertyName === undefined
          ? object.properties
          : object.properties.filter((property) => property.type === 'ObjectProperty' && (property.key?.name === propertyName || staticString(property.key) === propertyName));
        return properties.flatMap((property) => property.type === 'ObjectProperty' ? collect(property.value, level + 1) : property.type === 'SpreadElement' ? collect(property.argument, level + 1) : []);
      }
      return [];
    };
    const values = [...new Set(collect(initializer))].filter((value) => COMPONENT_NAME.test(value));
    return values.length > 0 ? values : [name];
  };
  return { bindings, reExports, localExports, exportAll, variableInitializers, candidatesFor };
}

function markRenderReachability(root, entryRoots, modules) {
  const ownerById = new Map(modules.flatMap((module) => module.owners).map((owner) => [owner.id, owner]));
  const ownersByPath = new Map();
  for (const owner of ownerById.values()) {
    const list = ownersByPath.get(owner.sourcePath) ?? [];
    list.push(owner);
    ownersByPath.set(owner.sourcePath, list);
  }
  const moduleByPath = new Map(modules.map((module) => [module.relativePath, module]));
  const reachableOwners = new Set();
  const queue = [];
  for (const entryRoot of entryRoots) for (const owner of ownersByPath.get(entryRoot) ?? []) queue.push(owner.id);
  const enqueueOwnerName = (sourcePath, ownerName) => {
    const matches = (ownersByPath.get(sourcePath) ?? []).filter((owner) => owner.owner === ownerName);
    for (const match of matches) if (!reachableOwners.has(match.id)) queue.push(match.id);
  };
  const enqueueExportTarget = (sourcePath, importedName, fallbackName, seen = new Set()) => {
    const visitKey = `${sourcePath}|${importedName}`;
    if (seen.has(visitKey)) return;
    seen.add(visitKey);
    const targetModule = moduleByPath.get(sourcePath);
    if (!targetModule) return;
    if (importedName && importedName !== 'default' && importedName !== '*') {
      const localExport = targetModule.componentBindings.localExports.get(importedName);
      if (localExport) {
        const localOwners = (ownersByPath.get(sourcePath) ?? []).filter((owner) => owner.owner === localExport);
        if (localOwners.length > 0) {
          for (const owner of localOwners) if (!reachableOwners.has(owner.id)) queue.push(owner.id);
          return;
        }
        const importedBindings = targetModule.componentBindings.bindings.get(localExport) ?? [];
        if (importedBindings.length > 0) {
          for (const binding of importedBindings) if (binding.targetPath) enqueueExportTarget(binding.targetPath, binding.importedName, localExport, new Set(seen));
          return;
        }
      }
      const direct = (ownersByPath.get(sourcePath) ?? []).filter((owner) => owner.owner === importedName);
      if (direct.length > 0) {
        for (const owner of direct) if (!reachableOwners.has(owner.id)) queue.push(owner.id);
        return;
      }
      for (const forwarded of targetModule.componentBindings.reExports.get(importedName) ?? []) if (forwarded.targetPath) enqueueExportTarget(forwarded.targetPath, forwarded.importedName, importedName, new Set(seen));
      for (const exportPath of targetModule.componentBindings.exportAll) enqueueExportTarget(exportPath, importedName, importedName, new Set(seen));
      return;
    }
    const targetOwners = ownersByPath.get(sourcePath) ?? [];
    const exact = targetOwners.filter((candidate) => candidate.owner === fallbackName);
    if (exact.length > 0) {
      for (const target of exact) if (!reachableOwners.has(target.id)) queue.push(target.id);
      return;
    }
    for (const forwarded of targetModule.componentBindings.reExports.get('default') ?? []) if (forwarded.targetPath) enqueueExportTarget(forwarded.targetPath, forwarded.importedName, fallbackName, new Set(seen));
    for (const target of targetOwners) if (!reachableOwners.has(target.id)) queue.push(target.id);
  };
  while (queue.length > 0) {
    const ownerId = queue.shift();
    if (reachableOwners.has(ownerId)) continue;
    reachableOwners.add(ownerId);
    const owner = ownerById.get(ownerId);
    if (!owner) continue;
    const module = moduleByPath.get(owner.sourcePath);
    if (!module) continue;
    for (const element of module.elements.filter((candidate) => candidate.ownerId === ownerId && ['component', 'member-component', 'component-factory', 'dynamic-factory', 'render-prop-call'].includes(candidate.kind))) {
      const [localName, memberName] = element.tag.split('.');
      enqueueOwnerName(owner.sourcePath, localName);
      const candidateNames = module.componentBindings.candidatesFor(localName);
      for (const candidateName of candidateNames) {
        enqueueOwnerName(owner.sourcePath, candidateName);
        for (const binding of module.componentBindings.bindings.get(candidateName) ?? module.componentBindings.bindings.get(localName) ?? []) {
          if (!binding.targetPath) continue;
          const importedName = binding.importedName === '*' ? memberName : binding.importedName;
          enqueueExportTarget(binding.targetPath, importedName, candidateName || localName);
        }
      }
    }
  }
  for (const module of modules) {
    for (const owner of module.owners) {
      const reached = reachableOwners.has(owner.id);
      owner.classification = reached ? 'render-reachable-owner' : 'module-reachable-only-owner';
      owner.reason = AUTHORITATIVE_REASONS[owner.classification];
    }
    for (const element of module.elements) {
      if (reachableOwners.has(element.ownerId)) continue;
      element.classification = 'module-reachable-only-element';
      element.reason = AUTHORITATIVE_REASONS['module-reachable-only-element'];
    }
  }
  return reachableOwners;
}

function stringBindings(ast) {
  const bindings = new Map();
  const resolveValues = (node, depth = 0) => {
    if (!node || depth > 8) return [];
    const current = unwrapExpression(node);
    const direct = staticString(current);
    if (direct !== null) return [direct];
    if (current.type === 'Identifier') return bindings.get(current.name) ?? [];
    if (current.type === 'ConditionalExpression') return [...resolveValues(current.consequent, depth + 1), ...resolveValues(current.alternate, depth + 1)];
    if (current.type === 'LogicalExpression') return [...resolveValues(current.left, depth + 1), ...resolveValues(current.right, depth + 1)];
    if (current.type === 'ArrayExpression') return current.elements.flatMap((element) => resolveValues(element, depth + 1));
    if (current.type === 'ObjectExpression') return current.properties.flatMap((property) => property.type === 'ObjectProperty' ? resolveValues(property.value, depth + 1) : []);
    return [];
  };
  for (const statement of ast.program.body) {
    const variableDeclaration = statement.type === 'VariableDeclaration' ? statement : statement.type === 'ExportNamedDeclaration' && statement.declaration?.type === 'VariableDeclaration' ? statement.declaration : null;
    if (!variableDeclaration) continue;
    for (const declaration of variableDeclaration.declarations) {
      if (declaration.id.type !== 'Identifier') continue;
      const values = [...new Set(resolveValues(declaration.init))].sort();
      if (values.length > 0) bindings.set(declaration.id.name, values);
    }
  }
  return bindings;
}

function jsxName(node) {
  if (!node) return { tag: 'unknown', kind: 'dynamic-component' };
  if (node.type === 'JSXIdentifier') return { tag: node.name, kind: /^[a-z]/.test(node.name) || node.name.includes('-') ? 'intrinsic' : 'component' };
  if (node.type === 'JSXMemberExpression') {
    const parts = [];
    let current = node;
    while (current?.type === 'JSXMemberExpression') {
      parts.unshift(current.property.name);
      current = current.object;
    }
    if (current?.type === 'JSXIdentifier') parts.unshift(current.name);
    return { tag: parts.join('.'), kind: 'member-component' };
  }
  if (node.type === 'JSXNamespacedName') return { tag: `${node.namespace.name}:${node.name.name}`, kind: 'namespaced-element' };
  return { tag: node.type, kind: 'dynamic-component' };
}

function controlFlowKinds(ancestors) {
  const kinds = new Set();
  for (const ancestor of ancestors) {
    if (ancestor.type === 'ConditionalExpression' || ancestor.type === 'IfStatement' || ancestor.type === 'SwitchCase') kinds.add('conditional');
    if (ancestor.type === 'LogicalExpression') kinds.add('logical');
    if (ancestor.type === 'CallExpression' && memberChain(ancestor.callee)?.at(-1) === 'map') kinds.add('map');
  }
  return [...kinds].sort();
}

function nearestOwner(owners, ancestors, relativePath, source) {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const node = ancestors[index];
    const row = owners.find((candidate) => candidate.node === node);
    if (row) return row;
  }
  const identity = `${relativePath}#module`;
  return {
    id: stableId('desktop-owner', identity),
    sourcePath: relativePath,
    owner: 'module',
    callSiteIdentity: identity,
    nodeKind: 'Program',
    wrapperChain: [],
    classification: 'module-render-owner',
    reason: 'Render syntax occurs at module scope in a module reachable from a desktop entry root.',
    sourceHash: sha256(source),
    start: 0,
    end: 0,
    node: null,
  };
}

function typeContainsDocument(node) {
  if (!node) return false;
  if ((node.type === 'TSTypeReference' || node.type === 'GenericTypeAnnotation') && (node.typeName?.name === 'Document' || node.id?.name === 'Document')) return true;
  if (node.type === 'TSUnionType' || node.type === 'UnionTypeAnnotation') return (node.types ?? []).some(typeContainsDocument);
  if (node.type === 'TSParenthesizedType' || node.type === 'NullableTypeAnnotation') return typeContainsDocument(node.typeAnnotation);
  return false;
}

function documentBindings(ast) {
  const receivers = new Set(['document', 'ownerDocument']);
  const creators = new Map();
  const creatorMethods = new Set(['createElement', 'createElementNS', 'createTextNode', 'createDocumentFragment', 'attachShadow']);
  const isDocumentReceiver = (chain) => Boolean(chain && (
    receivers.has(chain.at(-1))
    || chain.at(-1) === 'ownerDocument'
    || chain.slice(-3).join('.') === 'document.implementation.createHTMLDocument'
  ));
  const methodFromChain = (chain) => {
    if (!chain || !creatorMethods.has(chain.at(-1))) return null;
    if (chain.at(-1) === 'attachShadow') return 'attachShadow';
    return isDocumentReceiver(chain.slice(0, -1)) ? chain.at(-1) : null;
  };
  let changed = true;
  while (changed) {
    changed = false;
    const addReceiver = (name) => {
      if (!name || receivers.has(name)) return;
      receivers.add(name);
      changed = true;
    };
    const addCreator = (name, method) => {
      if (!name || !method || creators.get(name) === method) return;
      creators.set(name, method);
      changed = true;
    };
    walkAst(ast.program, {
      enter(node) {
        if (['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ObjectMethod', 'ClassMethod'].includes(node.type)) {
          for (const parameter of node.params ?? []) {
            if (parameter.type === 'Identifier' && typeContainsDocument(parameter.typeAnnotation?.typeAnnotation)) addReceiver(parameter.name);
          }
        }
        if (node.type === 'VariableDeclarator' && node.init) {
          if (node.id.type === 'Identifier') {
            if (typeContainsDocument(node.id.typeAnnotation?.typeAnnotation)) addReceiver(node.id.name);
            const chain = memberChain(node.init);
            if (isDocumentReceiver(chain)) addReceiver(node.id.name);
            const directMethod = methodFromChain(chain);
            if (directMethod) addCreator(node.id.name, directMethod);
            if (node.init.type === 'CallExpression') {
              const callee = memberChain(node.init.callee);
              if (callee?.at(-1) === 'parseFromString') addReceiver(node.id.name);
              if (callee?.at(-1) === 'bind') addCreator(node.id.name, methodFromChain(callee.slice(0, -1)));
            }
            if (node.init.type === 'Identifier' && creators.has(node.init.name)) addCreator(node.id.name, creators.get(node.init.name));
          } else if (node.id.type === 'ObjectPattern' && isDocumentReceiver(memberChain(node.init))) {
            for (const property of node.id.properties) {
              if (property.type !== 'ObjectProperty') continue;
              const method = property.computed ? staticString(property.key) : property.key?.name ?? staticString(property.key);
              const local = property.value?.type === 'Identifier' ? property.value.name : null;
              if (creatorMethods.has(method)) addCreator(local, method);
            }
          }
        }
        if (node.type === 'AssignmentExpression' && node.left?.type === 'Identifier') {
          const chain = memberChain(node.right);
          if (isDocumentReceiver(chain)) addReceiver(node.left.name);
          const method = methodFromChain(chain);
          if (method) addCreator(node.left.name, method);
          if (node.right?.type === 'Identifier' && creators.has(node.right.name)) addCreator(node.left.name, creators.get(node.right.name));
        }
      },
    });
  }
  return { receivers, creators };
}

function renderCallKind(node, aliases, dom) {
  const chain = memberChain(node.callee);
  if (!chain) return null;
  const last = chain.at(-1);
  if (chain.length === 1 && aliases.createElement.has(last)) return 'react-create-element';
  if (chain.length >= 2 && last === 'createElement' && (aliases.reactNamespaces.has(chain.at(-2)) || chain.at(-2) === 'React' || chain.slice(-3).join('.') === 'window.React.createElement')) return 'react-create-element';
  if (chain.length === 1 && aliases.createPortal.has(last)) return 'react-portal';
  if (chain.length >= 2 && last === 'createPortal' && (aliases.reactDomNamespaces.has(chain.at(-2)) || chain.at(-2) === 'ReactDOM')) return 'react-portal';
  if (chain.length === 1 && aliases.jsxFactory.has(last)) return 'jsx-factory';
  if (chain.length === 1 && dom.creators.has(last)) return dom.creators.get(last) === 'attachShadow' ? 'shadow-root' : `imperative-${dom.creators.get(last)}`;
  if (chain.length >= 2 && dom.receivers.has(chain.at(-2)) && ['createElement', 'createElementNS', 'createTextNode', 'createDocumentFragment'].includes(last)) return `imperative-${last}`;
  if (last === 'attachShadow') return 'shadow-root';
  return null;
}

function callTag(node, kind, bindings) {
  if (kind === 'react-portal') return { tag: 'portal', kind };
  if (kind === 'imperative-createDocumentFragment') return { tag: 'document-fragment', kind };
  if (kind === 'shadow-root') return { tag: 'shadow-root', kind };
  const argumentIndex = kind === 'imperative-createElementNS' ? 1 : 0;
  const first = unwrapExpression(node.arguments?.[argumentIndex]);
  const direct = staticString(first);
  if (direct !== null) return { tag: direct, kind: kind === 'react-create-element' || kind === 'jsx-factory' ? 'intrinsic-factory' : kind };
  if (first?.type === 'Identifier') {
    const values = bindings.get(first.name) ?? [];
    if (values.length > 0) return { tag: values.join('|'), kind: 'dynamic-intrinsic' };
    return { tag: first.name, kind: 'component-factory' };
  }
  return { tag: first ? first.type : 'missing', kind: 'dynamic-factory' };
}

function jsxOpeningIsComponent(opening) {
  if (!opening?.name) return false;
  const descriptor = jsxName(opening.name);
  return descriptor.kind === 'component' || descriptor.kind === 'member-component' || descriptor.kind === 'dynamic-component';
}

function renderPropFunctionDescriptor(node, ancestors) {
  const expression = unwrapExpression(node.expression);
  if (!['ArrowFunctionExpression', 'FunctionExpression'].includes(expression?.type)) return null;
  const parent = ancestors.at(-1);
  if (parent?.type === 'JSXAttribute') {
    const attributeName = parent.name?.name ?? staticString(parent.name);
    const opening = [...ancestors].reverse().find((ancestor) => ancestor.type === 'JSXOpeningElement');
    if (!jsxOpeningIsComponent(opening) || !/^(?:children|render[A-Z0-9_]|render$)/.test(attributeName ?? '')) return null;
    return { tag: attributeName, kind: 'render-prop-function', classification: 'render-structure', reason: AUTHORITATIVE_REASONS['render-prop-function'] };
  }
  if (parent?.type === 'JSXElement' && jsxOpeningIsComponent(parent.openingElement)) {
    return { tag: 'children', kind: 'render-prop-function', classification: 'render-structure', reason: AUTHORITATIVE_REASONS['render-prop-function'] };
  }
  return null;
}

function desktopModuleRows(root, relativePath, source, ast) {
  const ownerAnalysis = ownerCandidates(relativePath, source, ast);
  const candidateOwners = ownerAnalysis.rows;
  const owners = [...candidateOwners];
  const elements = [];
  const aliases = importAliases(ast);
  const dom = documentBindings(ast);
  const bindings = stringBindings(ast);
  const componentAnalysis = componentBindings(root, relativePath, ast, ownerAnalysis.wrappers);
  const ordinal = new Map();
  const componentRegistryBoundaries = (name) => {
    let hasSpread = false;
    let hasComputed = false;
    const seen = new Set();
    const inspect = (node, depth = 0) => {
      if (!node || depth > 12) return;
      const current = unwrapExpression(node);
      if (current.type === 'Identifier') {
        if (seen.has(current.name)) return;
        seen.add(current.name);
        inspect(componentAnalysis.variableInitializers.get(current.name), depth + 1);
        return;
      }
      if (current.type === 'SpreadElement') hasSpread = true;
      if (current.type === 'MemberExpression' && current.computed && staticString(current.property) === null) hasComputed = true;
      if ((current.type === 'ObjectProperty' || current.type === 'ObjectMethod') && current.computed && staticString(current.key) === null) hasComputed = true;
      for (const child of childNodes(current)) inspect(child.node, depth + 1);
    };
    inspect(componentAnalysis.variableInitializers.get(name));
    return { hasSpread, hasComputed };
  };
  const pushElement = (node, ancestors, descriptor, rawOverride = null) => {
    const owner = nearestOwner(candidateOwners, ancestors, relativePath, source);
    if (!owners.some((row) => row.id === owner.id)) owners.push(owner);
    const key = `${owner.id}|${node.type}|${descriptor.kind}|${descriptor.tag}`;
    const current = (ordinal.get(key) ?? 0) + 1;
    ordinal.set(key, current);
    const identity = `${owner.callSiteIdentity}:${node.type}:${descriptor.kind}:${descriptor.tag}:${current}`;
    const raw = rawOverride ?? source.slice(node.start ?? 0, node.end ?? 0);
    elements.push({
      id: stableId('desktop-element', `${relativePath}|${identity}`),
      sourcePath: relativePath,
      ownerId: owner.id,
      owner: owner.owner,
      callSiteIdentity: identity,
      nodeKind: node.type,
      tag: descriptor.tag,
      kind: descriptor.kind,
      classification: descriptor.classification ?? (descriptor.kind.includes('intrinsic') || descriptor.kind.startsWith('imperative-') || descriptor.kind.endsWith('-template-tag') ? 'rendered-intrinsic' : ['fragment', 'react-portal', 'shadow-root', 'render-prop-function', 'render-prop-call'].includes(descriptor.kind) ? 'render-structure' : 'rendered-component'),
      reason: descriptor.reason ?? (descriptor.kind === 'fragment' ? AUTHORITATIVE_REASONS.fragment : descriptor.kind === 'react-portal' ? AUTHORITATIVE_REASONS.portal : descriptor.kind === 'shadow-root' ? AUTHORITATIVE_REASONS['shadow-root'] : descriptor.kind.includes('dynamic') ? AUTHORITATIVE_REASONS['dynamic-component'] : descriptor.kind.includes('intrinsic') || descriptor.kind.startsWith('imperative-') || descriptor.kind.endsWith('-template-tag') ? AUTHORITATIVE_REASONS['rendered-intrinsic'] : AUTHORITATIVE_REASONS['rendered-component']),
      controlFlow: controlFlowKinds(ancestors),
      hasSpreadAttributes: node.type === 'JSXOpeningElement' && node.attributes.some((attribute) => attribute.type === 'JSXSpreadAttribute'),
      sourceHash: sha256(raw),
    });
  };
  const addHtmlPayload = (node, ancestors, expression, kind) => {
    const parts = templateParts(expression);
    let emitted = false;
    for (const [partIndex, part] of parts.entries()) {
      if (!part.text) continue;
      const parsed = parseHtmlDocument(part.text, `${relativePath}#template`);
      for (const [tagIndex, element] of parsed.elements.entries()) {
        emitted = true;
        pushElement(node, ancestors, { tag: element.tag, kind: `${kind}-template-tag`, classification: 'rendered-intrinsic', reason: AUTHORITATIVE_REASONS['static-html-payload'] }, `${source.slice(node.start ?? 0, node.end ?? 0)}#${partIndex}:${tagIndex}:${element.raw}`);
      }
    }
    if (!emitted || parts.some((part) => part.dynamic)) pushElement(node, ancestors, { tag: 'dynamic-html', kind, classification: 'dynamic-boundary', reason: AUTHORITATIVE_REASONS['dynamic-html'] });
  };
  walkAst(ast.program ?? ast, {
    enter(node, ancestors) {
      if (node.type === 'JSXElement') {
        const descriptor = jsxName(node.openingElement.name);
        if (descriptor.kind === 'component' && bindings.has(descriptor.tag)) descriptor.kind = 'dynamic-intrinsic';
        if (descriptor.kind === 'dynamic-intrinsic') descriptor.tag = (bindings.get(descriptor.tag) ?? [descriptor.tag]).join('|');
        pushElement(node.openingElement, ancestors, descriptor);
      } else if (node.type === 'JSXFragment') pushElement(node.openingFragment, ancestors, { tag: 'fragment', kind: 'fragment' });
      else if (node.type === 'CallExpression') {
        const kind = renderCallKind(node, aliases, dom);
        if (kind) pushElement(node, ancestors, callTag(node, kind, bindings));
        const chain = memberChain(node.callee);
        if (chain?.at(-1) === 'insertAdjacentHTML') addHtmlPayload(node, ancestors, node.arguments?.[1], 'desktop-insert-adjacent-html');
        if (ancestors.at(-1)?.type === 'JSXExpressionContainer' && (/^render(?:[A-Z0-9_]|$)/.test(chain?.at(-1) ?? '') || chain?.at(-1) === 'children')) pushElement(node, ancestors, { tag: chain.at(-1), kind: 'render-prop-call', classification: 'render-structure', reason: AUTHORITATIVE_REASONS['render-prop-call'] });
      } else if (node.type === 'AssignmentExpression') {
        const chain = memberChain(node.left);
        if (chain?.at(-1) === 'innerHTML' || chain?.at(-1) === 'outerHTML') addHtmlPayload(node, ancestors, node.right, chain.at(-1) === 'innerHTML' ? 'desktop-inner-html' : 'desktop-outer-html');
      } else if (node.type === 'JSXExpressionContainer') {
        const descriptor = renderPropFunctionDescriptor(node, ancestors);
        if (descriptor) pushElement(node, ancestors, descriptor);
      } else if (node.type === 'JSXOpeningElement' && node.name?.type === 'JSXIdentifier' && COMPONENT_NAME.test(node.name.name)) {
        if (componentAnalysis.variableInitializers.has(node.name.name)) {
          const { hasSpread, hasComputed } = componentRegistryBoundaries(node.name.name);
          if (hasSpread) pushElement(node, ancestors, { tag: node.name.name, kind: 'component-registry-object-spread', classification: 'dynamic-boundary', reason: AUTHORITATIVE_REASONS['registry-object-spread'] });
          if (hasComputed) pushElement(node, ancestors, { tag: node.name.name, kind: 'component-registry-computed-access', classification: 'dynamic-boundary', reason: AUTHORITATIVE_REASONS['registry-computed-access'] });
        }
      }
    },
  });
  return { owners, elements, componentBindings: componentAnalysis };
}

function commentExclusions(relativePath, source, ast, surface) {
  const rows = [];
  const comments = ast.comments ?? [];
  const interesting = /<\/?[A-Za-z][A-Za-z0-9:.-]*|\b(?:createElement|createDocumentFragment|createPortal|attachShadow|jsx|jsxs|jsxDEV|insertAdjacentHTML|innerHTML|outerHTML)\b/;
  const ordinal = new Map();
  for (const comment of comments) {
    const raw = source.slice(comment.start ?? 0, comment.end ?? 0);
    if (!interesting.test(raw)) continue;
    const key = `${comment.type}|${sha256(raw)}`;
    const current = (ordinal.get(key) ?? 0) + 1;
    ordinal.set(key, current);
    const identity = `${relativePath}#${comment.type}:${current}:${sha256(raw).slice(0, 12)}`;
    rows.push({
      id: stableId(`${surface}-comment`, identity),
      sourcePath: relativePath,
      callSiteIdentity: identity,
      nodeKind: comment.type,
      sourceHash: sha256(raw),
      classification: 'comment-only-exclusion',
      reason: AUTHORITATIVE_REASONS['comment-exclusion'],
    });
  }
  return rows;
}

export function parseHtmlDocument(source, relativePath = 'site/index.html') {
  const elements = [];
  const comments = [];
  const stack = [];
  let index = 0;
  let rawTag = null;
  const lower = source.toLowerCase();
  const childCounts = new Map();
  const parseAttributes = (text) => {
    const attrs = [];
    let cursor = 0;
    while (cursor < text.length) {
      while (/\s/.test(text[cursor] ?? '')) cursor += 1;
      if (cursor >= text.length || text[cursor] === '/' || text[cursor] === '>') break;
      const nameStart = cursor;
      while (cursor < text.length && !/[\s=/>]/.test(text[cursor])) cursor += 1;
      const name = text.slice(nameStart, cursor).toLowerCase();
      while (/\s/.test(text[cursor] ?? '')) cursor += 1;
      let value = null;
      if (text[cursor] === '=') {
        cursor += 1;
        while (/\s/.test(text[cursor] ?? '')) cursor += 1;
        const quote = text[cursor];
        if (quote === '"' || quote === "'") {
          cursor += 1;
          const valueStart = cursor;
          while (cursor < text.length && text[cursor] !== quote) cursor += 1;
          value = text.slice(valueStart, cursor);
          if (text[cursor] === quote) cursor += 1;
        } else {
          const valueStart = cursor;
          while (cursor < text.length && !/[\s>]/.test(text[cursor])) cursor += 1;
          value = text.slice(valueStart, cursor);
        }
      }
      if (name) attrs.push({ name, value });
    }
    return attrs;
  };
  while (index < source.length) {
    if (rawTag) {
      const closeAt = lower.indexOf(`</${rawTag}`, index);
      if (closeAt < 0) break;
      index = closeAt;
      rawTag = null;
    }
    const open = source.indexOf('<', index);
    if (open < 0) break;
    if (source.startsWith('<!--', open)) {
      const end = source.indexOf('-->', open + 4);
      const finish = end < 0 ? source.length : end + 3;
      comments.push({ start: open, end: finish, raw: source.slice(open, finish), nodeKind: 'HTMLComment' });
      index = finish;
      continue;
    }
    if (/^<!|^<\?/.test(source.slice(open, open + 2))) {
      const end = source.indexOf('>', open + 2);
      index = end < 0 ? source.length : end + 1;
      continue;
    }
    const closing = source[open + 1] === '/';
    let cursor = open + (closing ? 2 : 1);
    while (/\s/.test(source[cursor] ?? '')) cursor += 1;
    const nameStart = cursor;
    while (cursor < source.length && /[A-Za-z0-9:.-]/.test(source[cursor])) cursor += 1;
    const tag = source.slice(nameStart, cursor).toLowerCase();
    if (!tag) {
      index = open + 1;
      continue;
    }
    let quote = null;
    let end = cursor;
    for (; end < source.length; end += 1) {
      const char = source[end];
      if (quote) {
        if (char === quote) quote = null;
      } else if (char === '"' || char === "'") quote = char;
      else if (char === '>') break;
    }
    const finish = end < source.length ? end + 1 : source.length;
    const raw = source.slice(open, finish);
    if (closing) {
      const found = stack.map((entry) => entry.tag).lastIndexOf(tag);
      if (found >= 0) stack.splice(found);
      index = finish;
      continue;
    }
    const attrs = parseAttributes(source.slice(cursor, end));
    const parentPath = stack.at(-1)?.domPath ?? '';
    const countKey = `${parentPath}/${tag}`;
    const occurrence = (childCounts.get(countKey) ?? 0) + 1;
    childCounts.set(countKey, occurrence);
    const domPath = `${parentPath}/${tag}[${occurrence}]`;
    const ownerAttr = attrs.find((attr) => ['id', 'data-tab-panel', 'data-md-setting', 'data-md-command'].includes(attr.name));
    const owner = ownerAttr?.value ? `${ownerAttr.name}=${ownerAttr.value}` : stack.slice().reverse().find((entry) => entry.owner !== 'document')?.owner ?? 'document';
    elements.push({ tag, attrs, start: open, end: finish, raw, domPath, owner, nodeKind: 'HTMLStartTag' });
    const voidElement = /^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/.test(tag);
    const selfClosing = /\/\s*>$/.test(raw);
    if (!voidElement && !selfClosing) stack.push({ tag, domPath, owner });
    if (tag === 'script' || tag === 'style' || tag === 'textarea' || tag === 'title') rawTag = tag;
    index = finish;
  }
  return { elements, comments };
}

function siteHelperBindings(ast) {
  const aliases = new Set();
  const helpers = new Map();
  for (const statement of ast.program.body) {
    if (statement.type === 'VariableDeclaration') {
      for (const declaration of statement.declarations) {
        if (declaration.id.type !== 'Identifier') continue;
        const chain = memberChain(declaration.init);
        if (chain?.slice(-2).join('.') === 'document.createElement') aliases.add(declaration.id.name);
        if (declaration.init?.type === 'CallExpression' && memberChain(declaration.init.callee)?.slice(-3).join('.') === 'document.createElement.bind') aliases.add(declaration.id.name);
      }
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    walkAst(ast.program, {
      enter(node, ancestors) {
        if (!['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type)) return;
        const name = bindingNameFromParent(node, ancestors);
        if (!name || helpers.has(name)) return;
        const params = node.params ?? [];
        let parameterIndex = -1;
        walkAst(node.body, {
          enter(child) {
            if (child.type !== 'CallExpression') return;
            const chain = memberChain(child.callee);
            const direct = chain?.slice(-2).join('.') === 'document.createElement' || (chain?.length === 1 && aliases.has(chain[0])) || (chain?.length === 1 && helpers.has(chain[0]));
            if (!direct) return;
            const argument = unwrapExpression(child.arguments?.[0]);
            if (argument?.type !== 'Identifier') return;
            const found = params.findIndex((param) => param.type === 'Identifier' && param.name === argument.name);
            if (found >= 0) parameterIndex = found;
          },
        });
        if (parameterIndex >= 0) {
          helpers.set(name, parameterIndex);
          changed = true;
        }
      },
    });
  }
  return { aliases, helpers };
}

function nearestFunctionName(ancestors) {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const node = ancestors[index];
    if (!['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ObjectMethod', 'ClassMethod'].includes(node.type)) continue;
    if (node.type === 'ObjectMethod' || node.type === 'ClassMethod') return node.key?.name ?? staticString(node.key) ?? 'anonymous';
    return bindingNameFromParent(node, ancestors.slice(0, index)) ?? 'anonymous';
  }
  return 'module';
}

function templateParts(node) {
  const current = unwrapExpression(node);
  const direct = staticString(current);
  if (direct !== null) return [{ text: direct, dynamic: false }];
  if (current?.type === 'TemplateLiteral') return current.quasis.map((part, index) => ({ text: part.value.cooked ?? part.value.raw, dynamic: index < current.expressions.length }));
  return [{ text: '', dynamic: true }];
}

function siteRuntimeRows(relativePath, source, ast) {
  const rows = [];
  const { aliases, helpers } = siteHelperBindings(ast);
  const ordinal = new Map();
  const push = (node, ancestors, descriptor, rawOverride = null) => {
    const owner = nearestFunctionName(ancestors);
    const key = `${owner}|${descriptor.kind}|${descriptor.tag}`;
    const current = (ordinal.get(key) ?? 0) + 1;
    ordinal.set(key, current);
    const identity = `${relativePath}#${owner}:${descriptor.kind}:${descriptor.tag}:${current}`;
    const raw = rawOverride ?? source.slice(node.start ?? 0, node.end ?? 0);
    rows.push({
      id: stableId('site-creator', identity),
      sourcePath: relativePath,
      owner,
      callSiteIdentity: identity,
      nodeKind: node.type,
      tag: descriptor.tag,
      kind: descriptor.kind,
      classification: descriptor.dynamic ? 'reviewed-dynamic-creator' : descriptor.kind.includes('html') ? 'reviewed-html-creator' : 'runtime-dom-creator',
      reason: descriptor.dynamic ? AUTHORITATIVE_REASONS['site-dynamic-creator'] : descriptor.kind.includes('html') ? AUTHORITATIVE_REASONS['site-html-creator'] : AUTHORITATIVE_REASONS['site-dom-creator'],
      sourceHash: sha256(raw),
    });
  };
  const addHtmlPayload = (node, ancestors, expression, kind) => {
    const parts = templateParts(expression);
    let emitted = false;
    for (const [partIndex, part] of parts.entries()) {
      if (!part.text) continue;
      const parsed = parseHtmlDocument(part.text, `${relativePath}#template`);
      for (const [tagIndex, element] of parsed.elements.entries()) {
        emitted = true;
        push(node, ancestors, { tag: element.tag, kind: `${kind}-template-tag`, dynamic: part.dynamic }, `${source.slice(node.start ?? 0, node.end ?? 0)}#${partIndex}:${tagIndex}:${element.raw}`);
      }
    }
    if (!emitted || parts.some((part) => part.dynamic)) push(node, ancestors, { tag: 'dynamic-html', kind, dynamic: true });
  };
  walkAst(ast.program, {
    enter(node, ancestors) {
      if (node.type === 'CallExpression') {
        const chain = memberChain(node.callee);
        let kind = null;
        let argumentIndex = 0;
        if (chain?.slice(-2).join('.') === 'document.createElement') kind = 'document-create-element';
        else if (chain?.slice(-2).join('.') === 'document.createElementNS') {
          kind = 'document-create-element-ns';
          argumentIndex = 1;
        } else if (chain?.slice(-2).join('.') === 'document.createTextNode') kind = 'document-create-text-node';
        else if (chain?.slice(-2).join('.') === 'document.createDocumentFragment') kind = 'document-create-document-fragment';
        else if (chain?.length === 1 && aliases.has(chain[0])) kind = 'create-element-alias';
        else if (chain?.length === 1 && helpers.has(chain[0])) {
          kind = 'create-element-helper';
          argumentIndex = helpers.get(chain[0]);
        }
        if (kind) {
          const argument = unwrapExpression(node.arguments?.[argumentIndex]);
          const tag = kind === 'document-create-document-fragment' ? 'document-fragment' : staticString(argument);
          push(node, ancestors, { tag: tag ?? (argument?.type === 'Identifier' ? argument.name : argument?.type ?? 'missing'), kind, dynamic: tag === null });
          if (kind === 'create-element-helper' && node.arguments[1]?.type === 'ObjectExpression') {
            const htmlProperty = node.arguments[1].properties.find((property) => property.type === 'ObjectProperty' && (property.key?.name === 'html' || staticString(property.key) === 'html'));
            if (htmlProperty) addHtmlPayload(node, ancestors, htmlProperty.value, 'helper-html');
          }
        }
        if (chain?.at(-1) === 'insertAdjacentHTML') addHtmlPayload(node, ancestors, node.arguments?.[1], 'insert-adjacent-html');
      }
      if (node.type === 'AssignmentExpression') {
        const chain = memberChain(node.left);
        if (chain?.at(-1) === 'innerHTML') addHtmlPayload(node, ancestors, node.right, 'inner-html');
      }
    },
  });
  return rows;
}

function classifyStaticHtml(relativePath, source) {
  const parsed = parseHtmlDocument(source, relativePath);
  const tagOrdinals = new Map();
  const elements = parsed.elements.map((element) => {
    const ordinal = (tagOrdinals.get(element.tag) ?? 0) + 1;
    tagOrdinals.set(element.tag, ordinal);
    const identity = `${relativePath}#${element.domPath}`;
    return {
      id: stableId('site-html', identity),
      sourcePath: relativePath,
      owner: element.owner,
      callSiteIdentity: identity,
      nodeKind: element.nodeKind,
      tag: element.tag,
      kind: 'static-html',
      classification: 'static-site-element',
      reason: AUTHORITATIVE_REASONS['site-static-html'],
      sourceHash: sha256(element.raw),
      attributes: element.attrs.map((attribute) => ({ name: attribute.name, value: attribute.value })),
      ordinal,
    };
  });
  const comments = parsed.comments
    .filter((comment) => /<\/?[A-Za-z][A-Za-z0-9:.-]*|\b(?:createElement|insertAdjacentHTML|innerHTML)\b/.test(comment.raw))
    .map((comment, index) => {
      const identity = `${relativePath}#HTMLComment:${index + 1}:${sha256(comment.raw).slice(0, 12)}`;
      return {
        id: stableId('site-comment', identity),
        sourcePath: relativePath,
        callSiteIdentity: identity,
        nodeKind: comment.nodeKind,
        sourceHash: sha256(comment.raw),
        classification: 'comment-only-exclusion',
        reason: AUTHORITATIVE_REASONS['site-html-comment'],
      };
    });
  return { elements, comments };
}

function desktopEntryRoots(root) {
  const appRoot = path.join(root, 'design', 'apps', 'web', 'app');
  const webEntries = listFiles(appRoot, (file) => JS_EXTENSIONS.includes(path.extname(file).toLowerCase()));
  const desktopMain = path.join(root, 'design', 'apps', 'desktop', 'src', 'main', 'index.ts');
  return [...webEntries, desktopMain].filter((file) => fs.existsSync(file)).map((file) => slash(path.relative(root, file))).sort();
}

function desktopSourceFiles(root) {
  const appRoot = path.join(root, 'design', 'apps', 'web', 'app');
  const srcRoot = path.join(root, 'design', 'apps', 'web', 'src');
  const desktopRoot = path.join(root, 'design', 'apps', 'desktop', 'src');
  return [...listFiles(appRoot, (file) => JS_EXTENSIONS.includes(path.extname(file))), ...listFiles(srcRoot, (file) => JS_EXTENSIONS.includes(path.extname(file))), ...listFiles(desktopRoot, (file) => JS_EXTENSIONS.includes(path.extname(file)))].map((file) => slash(path.relative(root, file))).sort();
}

export function discoverSourceClassification(root) {
  const parser = loadDeclaredParser(root);
  const entryRoots = desktopEntryRoots(root);
  const sourceFiles = desktopSourceFiles(root);
  const parsed = new Map();
  const sourceByPath = new Map();
  const parseRelative = (relativePath) => {
    if (parsed.has(relativePath)) return parsed.get(relativePath);
    const source = fs.readFileSync(path.join(root, ...relativePath.split('/')), 'utf8');
    const ast = parseModule(parser, relativePath, source);
    parsed.set(relativePath, ast);
    sourceByPath.set(relativePath, source);
    return ast;
  };
  const reachable = new Set();
  const queue = [...entryRoots];
  while (queue.length > 0) {
    const relativePath = queue.shift();
    if (reachable.has(relativePath)) continue;
    reachable.add(relativePath);
    const ast = parseRelative(relativePath);
    for (const source of moduleSources(ast)) {
      const resolved = resolveModule(root, relativePath, source.value);
      if (resolved && !reachable.has(resolved)) queue.push(resolved);
    }
  }
  const owners = [];
  const elements = [];
  const modules = [];
  const commentRows = [];
  for (const relativePath of [...reachable].sort()) {
    const ast = parseRelative(relativePath);
    const source = sourceByPath.get(relativePath);
    const rows = desktopModuleRows(root, relativePath, source, ast);
    modules.push({ relativePath, owners: rows.owners, elements: rows.elements, componentBindings: rows.componentBindings });
    owners.push(...rows.owners);
    elements.push(...rows.elements);
    commentRows.push(...commentExclusions(relativePath, source, ast, 'desktop'));
  }
  const renderReachableOwners = markRenderReachability(root, entryRoots, modules);
  const ownerById = new Map();
  for (const row of owners.sort((a, b) => a.id.localeCompare(b.id))) if (!ownerById.has(row.id)) ownerById.set(row.id, row);
  const sourceExclusions = sourceFiles.filter((file) => !reachable.has(file)).map((relativePath) => {
    const source = fs.readFileSync(path.join(root, ...relativePath.split('/')), 'utf8');
    const ast = parseModule(parser, relativePath, source);
    return {
      id: stableId('desktop-source-exclusion', relativePath),
      sourcePath: relativePath,
      callSiteIdentity: `${relativePath}#File`,
      nodeKind: ast.type,
      sourceHash: sha256(source),
      classification: 'not-reachable-from-entry-roots',
      reason: AUTHORITATIVE_REASONS['source-exclusion'],
    };
  });
  const desktop = {
    $schema: './desktop-elements.schema.json',
    version: 2,
    extensionNamespace: { name: 'material-designer.lang-gui.desktop-source-classification', version: 1 },
    parser: { package: parser.packageName, version: parser.version, manifestPath: parser.manifestPath },
    entryRoots,
    sourceDirectories: [...new Set(sourceFiles.map((file) => slash(path.dirname(file))))].sort(),
    reachableModules: [...reachable].sort(),
    owners: [...ownerById.values()].map(({ node, start, end, ...row }) => row),
    elements: elements.sort((a, b) => a.id.localeCompare(b.id)),
    sourceExclusions,
    commentExclusions: commentRows.sort((a, b) => a.id.localeCompare(b.id)),
    dynamicLimits: DESKTOP_DYNAMIC_LIMITS.map((row) => ({ ...row })),
    renderReachableOwnerIds: [...renderReachableOwners].sort(),
  };

  const htmlRelative = 'site/index.html';
  const htmlSource = fs.readFileSync(path.join(root, 'site', 'index.html'), 'utf8');
  const staticRows = classifyStaticHtml(htmlRelative, htmlSource);
  const siteModuleRoot = path.join(root, 'site', 'assets', 'js');
  const siteModules = listFiles(siteModuleRoot, (file) => path.extname(file) === '.js').map((file) => slash(path.relative(root, file))).sort();
  const runtimeCreators = [];
  const siteComments = [...staticRows.comments];
  for (const relativePath of siteModules) {
    const source = fs.readFileSync(path.join(root, ...relativePath.split('/')), 'utf8');
    const ast = parseModule(parser, relativePath, source);
    runtimeCreators.push(...siteRuntimeRows(relativePath, source, ast));
    siteComments.push(...commentExclusions(relativePath, source, ast, 'site'));
  }
  const site = {
    $schema: './site-elements.schema.json',
    version: 2,
    extensionNamespace: { name: 'material-designer.lang-gui.site-source-classification', version: 1 },
    parser: { package: parser.packageName, version: parser.version, manifestPath: parser.manifestPath, htmlParser: 'scripts/lang-gui-source-classifier.mjs#parseHtmlDocument', htmlParserVersion: 1 },
    htmlEntry: htmlRelative,
    modules: siteModules,
    htmlElements: staticRows.elements.sort((a, b) => a.id.localeCompare(b.id)),
    runtimeCreators: runtimeCreators.sort((a, b) => a.id.localeCompare(b.id)),
    commentExclusions: siteComments.sort((a, b) => a.id.localeCompare(b.id)),
    dynamicLimits: SITE_DYNAMIC_LIMITS.map((row) => ({ ...row })),
  };
  return { desktop, site };
}

function rowStructure(row) {
  const { classification, reason, ...structure } = row;
  return structure;
}

export function handWrittenAuthority(row, label) {
  if (label === 'desktop owners') return { classification: row.classification, reason: AUTHORITATIVE_REASONS[row.classification] };
  if (label === 'desktop elements') {
    if (row.classification === 'module-reachable-only-element') return { classification: row.classification, reason: AUTHORITATIVE_REASONS['module-reachable-only-element'] };
    if (row.kind === 'fragment') return { classification: 'render-structure', reason: AUTHORITATIVE_REASONS.fragment };
    if (row.kind === 'react-portal') return { classification: 'render-structure', reason: AUTHORITATIVE_REASONS.portal };
    if (row.kind === 'shadow-root') return { classification: 'render-structure', reason: AUTHORITATIVE_REASONS['shadow-root'] };
    if (row.kind === 'render-prop-function') return { classification: 'render-structure', reason: AUTHORITATIVE_REASONS['render-prop-function'] };
    if (row.kind === 'render-prop-call') return { classification: 'render-structure', reason: AUTHORITATIVE_REASONS['render-prop-call'] };
    if (row.kind === 'component-registry-object-spread') return { classification: 'dynamic-boundary', reason: AUTHORITATIVE_REASONS['registry-object-spread'] };
    if (row.kind === 'component-registry-computed-access') return { classification: 'dynamic-boundary', reason: AUTHORITATIVE_REASONS['registry-computed-access'] };
    if (row.kind.endsWith('-template-tag')) return { classification: 'rendered-intrinsic', reason: AUTHORITATIVE_REASONS['static-html-payload'] };
    if (row.tag === 'dynamic-html' && ['desktop-inner-html', 'desktop-outer-html', 'desktop-insert-adjacent-html'].includes(row.kind)) return { classification: 'dynamic-boundary', reason: AUTHORITATIVE_REASONS['dynamic-html'] };
    if (row.kind === 'dynamic-intrinsic') return { classification: 'rendered-intrinsic', reason: AUTHORITATIVE_REASONS['dynamic-component'] };
    if (row.kind.includes('dynamic')) return { classification: 'rendered-component', reason: AUTHORITATIVE_REASONS['dynamic-component'] };
    if (row.kind === 'intrinsic' || row.kind.startsWith('imperative-')) return { classification: 'rendered-intrinsic', reason: AUTHORITATIVE_REASONS['rendered-intrinsic'] };
    return { classification: 'rendered-component', reason: AUTHORITATIVE_REASONS['rendered-component'] };
  }
  if (label === 'desktop source exclusions') return { classification: 'not-reachable-from-entry-roots', reason: AUTHORITATIVE_REASONS['source-exclusion'] };
  if (label === 'desktop comment exclusions') return { classification: 'comment-only-exclusion', reason: AUTHORITATIVE_REASONS['comment-exclusion'] };
  if (label === 'site HTML elements') return { classification: 'static-site-element', reason: AUTHORITATIVE_REASONS['site-static-html'] };
  if (label === 'site runtime creators') {
    if (row.classification === 'reviewed-dynamic-creator') return { classification: row.classification, reason: AUTHORITATIVE_REASONS['site-dynamic-creator'] };
    if (row.classification === 'reviewed-html-creator') return { classification: row.classification, reason: AUTHORITATIVE_REASONS['site-html-creator'] };
    return { classification: 'runtime-dom-creator', reason: AUTHORITATIVE_REASONS['site-dom-creator'] };
  }
  if (label === 'site comment exclusions') return { classification: 'comment-only-exclusion', reason: row.nodeKind === 'HTMLComment' ? AUTHORITATIVE_REASONS['site-html-comment'] : AUTHORITATIVE_REASONS['comment-exclusion'] };
  throw new Error(`${label} lacks a hand-written authority policy`);
}

function compareRows(actual, expected, label) {
  if (!Array.isArray(expected)) throw new Error(`${label} classification rows are missing`);
  if (new Set(expected.map((row) => row.id)).size !== expected.length) throw new Error(`${label} classification ids contain duplicates`);
  if (new Set(expected.map((row) => `${row.sourcePath ?? ''}|${row.callSiteIdentity ?? row.id}`)).size !== expected.length) throw new Error(`${label} call-site identities contain duplicates`);
  if (JSON.stringify(actual.map(rowStructure)) !== JSON.stringify(expected.map(rowStructure))) {
    const actualIds = new Set(actual.map((row) => row.id));
    const expectedIds = new Set(expected.map((row) => row.id));
    const missing = actual.filter((row) => !expectedIds.has(row.id)).map((row) => row.id).slice(0, 5);
    const stale = expected.filter((row) => !actualIds.has(row.id)).map((row) => row.id).slice(0, 5);
    throw new Error(`${label} discovery/classification drifted: discovered=${actual.length}, classified=${expected.length}, missing=${missing.join(',') || 'none'}, stale=${stale.join(',') || 'none'}`);
  }
  for (const [index, row] of expected.entries()) {
    const authority = handWrittenAuthority(actual[index], label);
    if (row.classification !== authority.classification) throw new Error(`${label}[${index}] classification is not the hand-written authority`);
    if (row.reason !== authority.reason) throw new Error(`${label}[${index}] reason is not the hand-written authority`);
  }
}

export function preserveReviewedAuthority(discoveredRows, reviewedRows, label) {
  const reviewedById = new Map(reviewedRows.map((row) => [row.id, row]));
  if (reviewedById.size !== reviewedRows.length) throw new Error(`${label} reviewed ids contain duplicates`);
  const discoveredIds = new Set(discoveredRows.map((row) => row.id));
  if (discoveredIds.size !== discoveredRows.length) throw new Error(`${label} discovered ids contain duplicates`);
  const disappeared = reviewedRows.filter((row) => !discoveredIds.has(row.id));
  if (disappeared.length > 0) throw new Error(`${label} reviewed rows disappeared: ${disappeared.slice(0, 5).map((row) => row.id).join(',')}`);
  return discoveredRows.map((row) => {
    const reviewed = reviewedById.get(row.id);
    if (!reviewed) return { ...row, classification: 'unclassified', reason: `REVIEW REQUIRED: ${label} ${row.callSiteIdentity ?? row.id}` };
    return { ...row, classification: reviewed.classification, reason: reviewed.reason };
  });
}

export function compareSourceClassification(discovered, desktopInventory, siteInventory) {
  if (JSON.stringify(discovered.desktop.entryRoots) !== JSON.stringify(desktopInventory.entryRoots)) throw new Error('desktop entry roots drifted');
  if (JSON.stringify(discovered.desktop.sourceDirectories) !== JSON.stringify(desktopInventory.sourceDirectories)) throw new Error('desktop TSX source directories drifted');
  if (JSON.stringify(discovered.desktop.reachableModules) !== JSON.stringify(desktopInventory.reachableModules)) throw new Error('desktop reachable module graph drifted');
  if (JSON.stringify(discovered.desktop.renderReachableOwnerIds) !== JSON.stringify(desktopInventory.renderReachableOwnerIds)) throw new Error('desktop render-reachable owner graph drifted');
  compareRows(discovered.desktop.owners, desktopInventory.owners, 'desktop owners');
  compareRows(discovered.desktop.elements, desktopInventory.elements, 'desktop elements');
  compareRows(discovered.desktop.sourceExclusions, desktopInventory.sourceExclusions, 'desktop source exclusions');
  compareRows(discovered.desktop.commentExclusions, desktopInventory.commentExclusions, 'desktop comment exclusions');
  if (JSON.stringify(discovered.site.modules) !== JSON.stringify(siteInventory.modules)) throw new Error('site JavaScript module inventory drifted');
  compareRows(discovered.site.htmlElements, siteInventory.htmlElements, 'site HTML elements');
  compareRows(discovered.site.runtimeCreators, siteInventory.runtimeCreators, 'site runtime creators');
  compareRows(discovered.site.commentExclusions, siteInventory.commentExclusions, 'site comment exclusions');
  if (JSON.stringify(discovered.desktop.dynamicLimits) !== JSON.stringify(desktopInventory.dynamicLimits)) throw new Error('desktop dynamic limits drifted');
  if (JSON.stringify(discovered.site.dynamicLimits) !== JSON.stringify(siteInventory.dynamicLimits)) throw new Error('site dynamic limits drifted');
  return {
    desktopEntryRoots: desktopInventory.entryRoots.length,
    desktopReachableModules: desktopInventory.reachableModules.length,
    desktopOwners: desktopInventory.owners.length,
    desktopRenderReachableOwners: desktopInventory.renderReachableOwnerIds.length,
    desktopElements: desktopInventory.elements.length,
    desktopSourceExclusions: desktopInventory.sourceExclusions.length,
    desktopCommentExclusions: desktopInventory.commentExclusions.length,
    siteHtmlElements: siteInventory.htmlElements.length,
    siteRuntimeCreators: siteInventory.runtimeCreators.length,
    siteCommentExclusions: siteInventory.commentExclusions.length,
    dynamicLimits: desktopInventory.dynamicLimits.length + siteInventory.dynamicLimits.length,
  };
}

export function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function classifyDesktopModuleFixture(parser, relativePath, source) {
  const ast = parseModule(parser, relativePath, source);
  const rows = desktopModuleRows(process.cwd(), relativePath, source, ast);
  return {
    owners: rows.owners.map(({ node, start, end, ...row }) => row).sort((a, b) => a.id.localeCompare(b.id)),
    elements: rows.elements.sort((a, b) => a.id.localeCompare(b.id)),
    comments: commentExclusions(relativePath, source, ast, 'desktop').sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export function classifySiteModuleFixture(parser, relativePath, source) {
  const ast = parseModule(parser, relativePath, source);
  return {
    creators: siteRuntimeRows(relativePath, source, ast).sort((a, b) => a.id.localeCompare(b.id)),
    comments: commentExclusions(relativePath, source, ast, 'site').sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export function classifyModuleEdgesFixture(parser, relativePath, source) {
  const ast = parseModule(parser, relativePath, source);
  return moduleSources(ast).map((edge, index) => ({ id: `${edge.kind}:${edge.value}:${index + 1}`, callSiteIdentity: `${relativePath}#${edge.kind}:${edge.value}:${index + 1}`, ...edge }));
}

export function classifyLocalExportsFixture(parser, relativePath, source) {
  const ast = parseModule(parser, relativePath, source);
  const analysis = componentBindings(process.cwd(), relativePath, ast);
  return [...analysis.localExports.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([exportedName, localName], index) => ({ id: `${exportedName}:${localName}:${index + 1}`, callSiteIdentity: `${relativePath}#ExportSpecifier:${localName}->${exportedName}`, exportedName, localName }));
}

export function resolveExportCycleFixture(graph, startPath, startName) {
  const seen = new Set();
  let currentPath = startPath;
  let currentName = startName;
  while (true) {
    const key = `${currentPath}|${currentName}`;
    if (seen.has(key)) return { status: 'cycle', at: key, steps: seen.size };
    seen.add(key);
    const next = graph[currentPath]?.[currentName];
    if (!next) return { status: 'resolved', at: key, steps: seen.size };
    currentPath = next.path;
    currentName = next.name;
  }
}

export function sourceSliceHash(root, row) {
  const file = path.join(root, ...row.sourcePath.split('/'));
  const source = fs.readFileSync(file, 'utf8');
  return sha256(source);
}

export function findAstRegistrations(root, parser, ownerRows, htmlElements) {
  const astCache = new Map();
  const htmlById = new Map(htmlElements.map((row) => [row.id, row]));
  return ownerRows.map((row) => {
    if (row.registrationKind === 'markup-registration') {
      const source = fs.readFileSync(path.join(root, ...row.sourcePath.split('/')), 'utf8');
      const parsed = classifyStaticHtml(row.sourcePath, source).elements;
      let matches = parsed;
      const anchor = row.registrationAnchor;
      const tagMatch = anchor.match(/^<([A-Za-z0-9:.-]+)/);
      const attrMatch = anchor.match(/([A-Za-z0-9:_-]+)(?:=["']([^"']*)["'])?/);
      if (tagMatch) matches = matches.filter((candidate) => candidate.tag === tagMatch[1].toLowerCase());
      const selectedAttr = tagMatch ? anchor.slice(tagMatch[0].length).match(/([A-Za-z0-9:_-]+)(?:=["']([^"']*)["'])?/) : attrMatch;
      if (selectedAttr) matches = matches.filter((candidate) => candidate.attributes.some((attribute) => attribute.name === selectedAttr[1].toLowerCase() && (selectedAttr[2] === undefined || attribute.value === selectedAttr[2])));
      if (matches.length !== 1) throw new Error(`${row.id} HTML registration resolves to ${matches.length} AST nodes`);
      const match = matches[0];
      return { ...row, registrationAnchor: match.callSiteIdentity, registrationKind: 'HTMLStartTag', registrationNodeKind: match.nodeKind, registrationSourceHash: match.sourceHash, classification: 'registry-surface-owner', reason: 'The strict HTML parser resolves this owner to one exact start-tag node.' };
    }
    let cached = astCache.get(row.sourcePath);
    if (!cached) {
      const source = fs.readFileSync(path.join(root, ...row.sourcePath.split('/')), 'utf8');
      cached = { ast: parseModule(parser, row.sourcePath, source), source };
      astCache.set(row.sourcePath, cached);
    }
    const { ast, source } = cached;
    const matches = [];
    if (row.registrationKind === 'import-registration') {
      for (const statement of ast.program.body) {
        if (statement.type !== 'ImportDeclaration') continue;
        for (const specifier of statement.specifiers) {
          if (specifier.local?.name !== row.owner) continue;
          matches.push({ node: specifier, statement, identity: `${row.sourcePath}#ImportDeclaration:${staticString(statement.source)}:${specifier.type}:${specifier.imported?.name ?? 'default'}->${specifier.local.name}`, nodeKind: specifier.type });
        }
      }
    } else {
      walkAst(ast.program, {
        enter(node) {
          if ((node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') && node.id?.name === row.owner) matches.push({ node, identity: `${row.sourcePath}#${node.type}:${row.owner}`, nodeKind: node.type });
        },
      });
    }
    if (matches.length !== 1) throw new Error(`${row.id} owner registration resolves to ${matches.length} AST nodes`);
    const match = matches[0];
    const raw = source.slice(match.node.start ?? match.statement?.start ?? 0, match.node.end ?? match.statement?.end ?? 0);
    return { ...row, registrationAnchor: match.identity, registrationKind: match.nodeKind, registrationNodeKind: match.nodeKind, registrationSourceHash: sha256(raw), classification: 'registry-surface-owner', reason: 'The declared parser resolves this owner to one exact declaration or import specifier.' };
  });
}

export function validateAstRegistrations(root, parser, ownerRows, htmlElements) {
  const htmlMap = new Map(htmlElements.map((row) => [row.callSiteIdentity, row]));
  const moduleCache = new Map();
  const actual = new Map();
  for (const row of ownerRows) {
    if (row.registrationKind === 'HTMLStartTag') {
      const html = htmlMap.get(row.registrationAnchor);
      if (!html) throw new Error(`${row.id} AST registration identity changed`);
      if (html.nodeKind !== row.registrationNodeKind || html.sourceHash !== row.registrationSourceHash) throw new Error(`${row.id} AST registration node kind or source hash changed`);
      actual.set(row.id, true);
      continue;
    }
    let cached = moduleCache.get(row.sourcePath);
    if (!cached) {
      const source = fs.readFileSync(path.join(root, ...row.sourcePath.split('/')), 'utf8');
      cached = { source, ast: parseModule(parser, row.sourcePath, source) };
      moduleCache.set(row.sourcePath, cached);
    }
    const matches = [];
    walkAst(cached.ast.program, {
      enter(node) {
        if (node.type === 'ImportDeclaration') {
          const importSource = staticString(node.source);
          for (const specifier of node.specifiers) {
            const identity = `${row.sourcePath}#ImportDeclaration:${importSource}:${specifier.type}:${specifier.imported?.name ?? 'default'}->${specifier.local.name}`;
            if (identity === row.registrationAnchor) matches.push(specifier);
          }
        }
        if ((node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') && node.id?.name) {
          const identity = `${row.sourcePath}#${node.type}:${node.id.name}`;
          if (identity === row.registrationAnchor) matches.push(node);
        }
      },
    });
    if (matches.length !== 1) throw new Error(`${row.id} AST registration identity changed`);
    const node = matches[0];
    if (node.type.startsWith('Import') && node.local?.name !== row.owner) throw new Error(`${row.id} AST registration is not owned by ${row.owner}`);
    if ((node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') && node.id?.name !== row.owner) throw new Error(`${row.id} AST registration is not owned by ${row.owner}`);
    const raw = cached.source.slice(node.start ?? 0, node.end ?? 0);
    if (node.type !== row.registrationNodeKind || sha256(raw) !== row.registrationSourceHash) throw new Error(`${row.id} AST registration node kind or source hash changed`);
    actual.set(row.id, true);
  }
  return actual.size;
}
