import { readFileSync } from 'node:fs';
import {
  Button,
  Checkbox,
  createMenuShortcutRegistry,
  DetailsSurface,
  Dialog,
  Field,
  Menu,
  MenuItem,
  MenuSurface,
  OverlaySurface,
  Radio,
  StateLayer,
  SummarySurface,
  Surface,
  Switch,
  Tab,
  TabPanel,
  Tabs,
  Typography,
} from '../src';
import { describe, expect, it } from 'vitest';

interface CssContext {
  kind: 'media' | 'layer' | 'supports' | 'other';
  prelude: string;
}

interface CssRule {
  selector: string;
  body: string;
  context: CssContext[];
  order: number;
}

interface CssDeclaration {
  property: string;
  value: string;
  important: boolean;
  order: number;
}

interface CssDocument {
  rules: CssRule[];
  atRules: CssContext[][];
  layerOrder: string[];
}

interface CascadeMode {
  name: string;
  contextActive: (context: CssContext[]) => boolean;
}

const sourceRoot = new URL('../src/', import.meta.url);
const source = (name: string) => readFileSync(new URL(name, sourceRoot), 'utf8');
const tokenSource = readFileSync(new URL('../../../apps/web/src/styles/md3-tokens.css', import.meta.url), 'utf8');
const webPrimitiveSource = readFileSync(new URL('../../../apps/web/src/styles/primitives.css', import.meta.url), 'utf8');

const unconditional: CascadeMode = {
  name: 'unconditional',
  contextActive: (context) => !context.some((entry) => entry.kind === 'media'),
};

const reducedMotion: CascadeMode = {
  name: 'prefers-reduced-motion: reduce',
  contextActive: (context) => context.every((entry) => entry.kind !== 'media' || /prefers-reduced-motion:\s*reduce/.test(entry.prelude)),
};

function withoutComments(css: string): string {
  let result = '';
  let index = 0;
  while (index < css.length) {
    const start = css.indexOf('/*', index);
    if (start < 0) return result + css.slice(index);
    result += css.slice(index, start);
    const end = css.indexOf('*/', start + 2);
    if (end < 0) throw new Error('CSS parser: unterminated comment');
    index = end + 2;
  }
  return result;
}

function contextFor(prelude: string): CssContext {
  if (/^@media\b/i.test(prelude)) {
    const condition = prelude.slice('@media'.length).trim();
    if (condition !== '(prefers-reduced-motion: reduce)' && condition !== '(prefers-color-scheme: dark)') {
      throw new Error(`CSS parser: unsupported media condition ${prelude}`);
    }
    return { kind: 'media', prelude };
  }
  if (/^@layer\b/i.test(prelude)) return { kind: 'layer', prelude };
  if (/^@(supports|container|scope|when|else)\b/i.test(prelude)) {
    throw new Error(`CSS parser: unsupported conditional at-rule ${prelude}`);
  }
  if (/^@(?:-\w+-)?keyframes\b/i.test(prelude)) return { kind: 'other', prelude };
  if (/^@(font-face|page|property)\b/i.test(prelude)) return { kind: 'other', prelude };
  throw new Error(`CSS parser: unsupported at-rule ${prelude}`);
}

function parseDeclarations(body: string): CssDeclaration[] {
  const declarations: CssDeclaration[] = [];
  let start = 0;
  let depth = 0;
  let quote = '';
  let order = 0;
  const flush = (end: number) => {
    const part = body.slice(start, end).trim();
    const colon = part.indexOf(':');
    if (colon < 0) return;
    const property = part.slice(0, colon).trim();
    if (!property || property.startsWith('@')) return;
    let value = part.slice(colon + 1).trim();
    const important = /!important\s*$/i.test(value);
    if (important) value = value.replace(/!important\s*$/i, '').trim();
    declarations.push({ property, value, important, order });
    order += 1;
  };
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (quote) {
      if (character === quote && body[index - 1] !== '\\') quote = '';
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '(' || character === '[') depth += 1;
    if (character === ')' || character === ']') depth = Math.max(0, depth - 1);
    if (character === ';' && depth === 0) {
      flush(index);
      start = index + 1;
    }
  }
  flush(body.length);
  return declarations;
}

function findClosingBrace(text: string, open: number, end: number, fileName: string): number {
  let depth = 1;
  let quote = '';
  for (let index = open + 1; index < end; index += 1) {
    const character = text[index];
    if (quote) {
      if (character === quote && text[index - 1] !== '\\') quote = '';
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error(`[${fileName}] CSS parser: unbalanced braces after ${text.slice(open, Math.min(open + 40, end))}`);
}

function parseCss(css: string, fileName: string): CssDocument {
  const text = withoutComments(css);
  const rules: CssRule[] = [];
  const atRules: CssContext[][] = [];
  const layerOrder: string[] = [];
  let order = 0;

  function parseRange(start: number, end: number, context: CssContext[]) {
    let cursor = start;
    while (cursor < end) {
      while (cursor < end && /[\s;]/.test(text[cursor] ?? '')) cursor += 1;
      if (cursor >= end) return;
      const open = text.indexOf('{', cursor);
      const statementEnd = text.indexOf(';', cursor);
      if (statementEnd >= 0 && (open < 0 || statementEnd < open)) {
        const statement = text.slice(cursor, statementEnd).trim();
        if (/^@layer\b/i.test(statement)) {
          for (const name of statement.slice('@layer'.length).split(',').map((item) => item.trim()).filter(Boolean)) {
            const layerPrelude = `@layer ${name}`;
            if (!layerOrder.includes(layerPrelude)) layerOrder.push(layerPrelude);
          }
          atRules.push([contextFor(statement)]);
        }
        cursor = statementEnd + 1;
        continue;
      }
      if (open < 0 || open >= end) {
        if (text.slice(cursor, end).trim()) throw new Error(`[${fileName}] CSS parser: declarations have no opening brace`);
        return;
      }
      const prelude = text.slice(cursor, open).trim();
      const close = findClosingBrace(text, open, end, fileName);
      const body = text.slice(open + 1, close);
      if (prelude.startsWith('@')) {
        const nextContext = [...context, contextFor(prelude)];
        const layer = nextContext.find((entry) => entry.kind === 'layer');
        if (layer && !layerOrder.includes(layer.prelude)) layerOrder.push(layer.prelude);
        atRules.push(nextContext);
        parseRange(open + 1, close, nextContext);
      } else {
        for (const candidate of prelude.split(',').map((item) => item.trim()).filter(Boolean)) validateSelector(candidate, fileName);
        rules.push({ selector: prelude, body, context, order });
        order += 1;
      }
      cursor = close + 1;
    }
  }

  parseRange(0, text.length, []);
  return { rules, atRules, layerOrder };
}

const SUPPORTED_PSEUDO_CLASSES = new Set(['active', 'checked', 'disabled', 'focus', 'focus-visible', 'hover', 'placeholder', 'root']);
const SUPPORTED_PSEUDO_ELEMENTS = new Set(['after', 'before', 'placeholder', '-ms-expand']);

function isRuntimeComponent(value: unknown): boolean {
  return typeof value === 'function'
    || (typeof value === 'object' && value !== null && '$$typeof' in value);
}

function balancedFunctionEnd(text: string, open: number, fileName: string): number {
  let depth = 1;
  let quote = '';
  for (let index = open + 1; index < text.length; index += 1) {
    const character = text[index];
    if (quote) {
      if (character === quote && text[index - 1] !== '\\') quote = '';
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '(') depth += 1;
    if (character === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error(`[${fileName}] selector has an unclosed pseudo-class function`);
}

function validateCompound(compound: string, fileName: string) {
  let index = 0;
  let hasType = false;
  while (index < compound.length) {
    const character = compound[index]!;
    if (character === '*') {
      if (hasType) throw new Error(`[${fileName}] selector has more than one type selector: ${compound}`);
      hasType = true;
      index += 1;
      continue;
    }
    if (character === '.' || character === '#') {
      const match = compound.slice(index + 1).match(/^[a-zA-Z0-9_-]+/);
      if (!match) throw new Error(`[${fileName}] selector has an empty class or id token: ${compound}`);
      index += 1 + match[0].length;
      continue;
    }
    if (character === '[') {
      const close = compound.indexOf(']', index + 1);
      if (close < 0) throw new Error(`[${fileName}] selector has an unclosed attribute selector: ${compound}`);
      const attribute = compound.slice(index + 1, close).trim();
      if (!/^[a-zA-Z_][a-zA-Z0-9_-]*(?:\s*(?:[~|^$*]?=)\s*(?:[a-zA-Z0-9_-]+|"[^"]*"|'[^']*'))?$/.test(attribute)) {
        throw new Error(`[${fileName}] selector has an unsupported attribute selector: [${attribute}]`);
      }
      index = close + 1;
      continue;
    }
    if (character === ':') {
      const pseudoElement = compound[index + 1] === ':';
      const nameStart = index + (pseudoElement ? 2 : 1);
      const nameMatch = compound.slice(nameStart).match(/^[a-zA-Z-]+/);
      if (!nameMatch) throw new Error(`[${fileName}] selector has an invalid pseudo selector: ${compound}`);
      const name = nameMatch[0];
      index = nameStart + name.length;
      if (pseudoElement) {
        if (!SUPPORTED_PSEUDO_ELEMENTS.has(name)) throw new Error(`[${fileName}] selector has an unsupported pseudo-element ::${name}`);
      } else if (name === 'where' || name === 'not') {
        if (compound[index] !== '(') throw new Error(`[${fileName}] selector pseudo-class :${name} must have an argument`);
        const close = balancedFunctionEnd(compound, index, fileName);
        const argumentsList = compound.slice(index + 1, close).split(',').map((item) => item.trim()).filter(Boolean);
        if (name === 'not' && (argumentsList.length !== 1 || ![':disabled', '[data-theme]'].includes(argumentsList[0]!))) {
          throw new Error(`[${fileName}] selector has unsupported nested pseudo-class :not()`);
        }
        for (const argument of argumentsList) validateSelector(argument, fileName);
        index = close + 1;
      } else if (!SUPPORTED_PSEUDO_CLASSES.has(name)) {
        throw new Error(`[${fileName}] selector has an unsupported pseudo-class :${name}`);
      }
      continue;
    }
    const typeMatch = compound.slice(index).match(/^[a-zA-Z][a-zA-Z0-9_-]*/);
    if (typeMatch && !hasType) {
      hasType = true;
      index += typeMatch[0].length;
      continue;
    }
    throw new Error(`[${fileName}] selector has an unsupported token near ${compound.slice(index)}`);
  }
}

function validateSelector(selector: string, fileName: string) {
  const normalized = normalizeSelector(selector);
  if (!normalized) throw new Error(`[${fileName}] selector is empty`);
  const parts = selectorParts(normalized);
  if (parts.compounds.length === 0 || parts.combinators.length !== parts.compounds.length - 1) {
    throw new Error(`[${fileName}] selector has incomplete combinator structure: ${selector}`);
  }
  for (const compound of parts.compounds) validateCompound(compound, fileName);
}

function normalizeSelector(selector: string): string {
  return selector.replace(/:where\(([^)]*)\)/g, '$1').replace(/\s*([>+~])\s*/g, '$1').replace(/\s+/g, ' ').trim();
}

function selectorParts(selector: string): { compounds: string[]; combinators: string[] } {
  const normalized = normalizeSelector(selector).replace(/([>+~])/g, ' $1 ').replace(/\s+/g, ' ').trim();
  const tokens = normalized ? normalized.split(' ') : [];
  const compounds: string[] = [];
  const combinators: string[] = [];
  for (const token of tokens) {
    if (token === '>' || token === '+' || token === '~') combinators.push(token);
    else {
      if (compounds.length > 0 && combinators.length < compounds.length) combinators.push(' ');
      compounds.push(token);
    }
  }
  return { compounds, combinators };
}

function selectorMatches(selector: string, wanted: string): boolean {
  const candidate = normalizeSelector(selector);
  const target = normalizeSelector(wanted);
  if (candidate === target) return true;
  const candidateParts = selectorParts(candidate);
  const targetParts = selectorParts(target);
  if (candidateParts.compounds.length !== targetParts.compounds.length || candidateParts.combinators.join('|') !== targetParts.combinators.join('|')) return false;
  const classPattern = /\.[a-zA-Z0-9_-]+/g;
  return candidateParts.compounds.every((candidateCompound, index) => {
    const targetCompound = targetParts.compounds[index]!;
    const candidateClasses = candidateCompound.match(classPattern) ?? [];
    const targetClasses = targetCompound.match(classPattern) ?? [];
    const candidateRest = candidateCompound.replace(classPattern, '');
    const targetRest = targetCompound.replace(classPattern, '');
    const candidateClassSet = new Set(candidateClasses);
    const targetClassSet = new Set(targetClasses);
    return candidateRest === targetRest
      && candidateClassSet.size === targetClassSet.size
      && [...candidateClassSet].every((name) => targetClassSet.has(name));
  });
}

function specificity(selector: string): [number, number, number] {
  let residual = '';
  const nestedSpecificities: Array<[number, number, number]> = [];
  let index = 0;
  while (index < selector.length) {
    if (selector.startsWith(':where(', index)) {
      index = balancedFunctionEnd(selector, index + ':where'.length, 'specificity') + 1;
      continue;
    }
    if (selector.startsWith(':not(', index)) {
      const open = index + ':not'.length;
      const close = balancedFunctionEnd(selector, open, 'specificity');
      const argumentsList = selector.slice(open + 1, close).split(',').map((item) => item.trim()).filter(Boolean);
      if (argumentsList.length === 0) throw new Error('[specificity] :not() requires an argument');
      nestedSpecificities.push(argumentsList.map((argument) => specificity(argument)).reduce((best, current) => (
        compareSpecificity(current, best) > 0 ? current : best
      )));
      index = close + 1;
      continue;
    }
    residual += selector[index]!;
    index += 1;
  }

  const result: [number, number, number] = [0, 0, 0];
  let cursor = 0;
  while (cursor < residual.length) {
    const character = residual[cursor]!;
    if (character === '#') {
      result[0] += 1;
      cursor += 1;
      while (/[a-zA-Z0-9_-]/.test(residual[cursor] ?? '')) cursor += 1;
      continue;
    }
    if (character === '.' || character === '[') {
      result[1] += 1;
      if (character === '.') {
        cursor += 1;
        while (/[a-zA-Z0-9_-]/.test(residual[cursor] ?? '')) cursor += 1;
      } else {
        const close = residual.indexOf(']', cursor + 1);
        cursor = close < 0 ? residual.length : close + 1;
      }
      continue;
    }
    if (character === ':') {
      if (residual[cursor + 1] === ':') result[2] += 1;
      else result[1] += 1;
      cursor += residual[cursor + 1] === ':' ? 2 : 1;
      while (/[a-zA-Z0-9_-]/.test(residual[cursor] ?? '')) cursor += 1;
      if (residual[cursor] === '(') cursor = balancedFunctionEnd(residual, cursor, 'specificity') + 1;
      continue;
    }
    if (/^[a-zA-Z]/.test(character)) {
      result[2] += 1;
      cursor += 1;
      while (/[a-zA-Z0-9_-]/.test(residual[cursor] ?? '')) cursor += 1;
      continue;
    }
    cursor += 1;
  }
  for (const nested of nestedSpecificities) {
    result[0] += nested[0];
    result[1] += nested[1];
    result[2] += nested[2];
  }
  return result;
}

function compareSpecificity(left: [number, number, number], right: [number, number, number]): number {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index]! - right[index]!;
  }
  return 0;
}

function cascadeLayerRank(document: CssDocument, context: CssContext[], important: boolean): [number, number] {
  const layer = [...context].reverse().find((entry) => entry.kind === 'layer');
  if (!layer) return [important ? 0 : 1, important ? 0 : Number.MAX_SAFE_INTEGER];
  const index = document.layerOrder.indexOf(layer.prelude);
  return important ? [1, -index] : [0, index];
}

function winningDeclaration(document: CssDocument, selector: string, property: string, mode: CascadeMode, fileName: string): string | undefined {
  const candidates: Array<{ rule: CssRule; selector: string; declaration: CssDeclaration; layer: [number, number] }> = [];
  for (const rule of document.rules) {
    if (!mode.contextActive(rule.context)) continue;
    for (const candidate of rule.selector.split(',').map((item) => item.trim())) {
      if (!selectorMatches(candidate, selector)) continue;
      for (const declarationItem of parseDeclarations(rule.body).filter((item) => item.property === property)) {
        candidates.push({ rule, selector: candidate, declaration: declarationItem, layer: cascadeLayerRank(document, rule.context, declarationItem.important) });
      }
    }
  }
  if (candidates.length > 64) throw new Error(`[${fileName}] ${mode.name} ${selector} ${property} cascade has too many candidates to evaluate`);
  candidates.sort((left, right) => {
    if (left.declaration.important !== right.declaration.important) return left.declaration.important ? 1 : -1;
    if (left.layer[0] !== right.layer[0]) return left.layer[0] - right.layer[0];
    if (left.layer[1] !== right.layer[1]) return left.layer[1] - right.layer[1];
    const leftSpecificity = specificity(left.selector);
    const rightSpecificity = specificity(right.selector);
    for (let index = 0; index < leftSpecificity.length; index += 1) {
      if (leftSpecificity[index] !== rightSpecificity[index]) return leftSpecificity[index]! - rightSpecificity[index]!;
    }
    return left.rule.order * 1000 + left.declaration.order - (right.rule.order * 1000 + right.declaration.order);
  });
  const winning = candidates[candidates.length - 1];
  if (!winning) return undefined;
  return winning.declaration.value;
}

function requireDeclaration(document: CssDocument, fileName: string, selector: string, property: string, value: RegExp, reason: string, mode: CascadeMode = unconditional) {
  const actual = winningDeclaration(document, selector, property, mode, fileName);
  if (!actual || !value.test(actual)) throw new Error(`[${fileName}] ${mode.name} ${selector} ${property} ${reason}`);
}

function requireAtRule(document: CssDocument, fileName: string, pattern: RegExp, reason: string) {
  if (!document.atRules.some((context) => context.some((entry) => pattern.test(entry.prelude)))) {
    throw new Error(`[${fileName}] missing ${reason}`);
  }
}

function requireToken(token: string) {
  const document = parseCss(tokenSource, 'md3-tokens.css');
  const found = document.rules.some((rule) => rule.selector.trim() === ':root' && parseDeclarations(rule.body).some((item) => item.property === token));
  if (!found) throw new Error(`[md3-tokens.css] :root must declare ${token}`);
}

function requireReducedMotionOverrides(document: CssDocument, fileName: string) {
  for (const rule of document.rules.filter((candidate) => !candidate.context.some((entry) => entry.kind === 'media'))) {
    for (const declarationItem of parseDeclarations(rule.body)) {
      if (!['animation', 'animation-name', 'transition', 'transition-property'].includes(declarationItem.property)) continue;
      if (/^(none|0s)\s*$/.test(declarationItem.value)) continue;
      for (const selector of rule.selector.split(',').map((candidate) => candidate.trim())) {
        requireDeclaration(document, fileName, selector, declarationItem.property, /^(none|0s)\s*$/, 'must disable this motion under reduced motion', reducedMotion);
      }
    }
  }
}

describe('shared primitive contract', () => {
  it('exports every primitive family from the public entry point', () => {
    const exported = {
      Button,
      Dialog,
      Field,
      Checkbox,
      Radio,
      Switch,
      Menu,
      MenuItem,
      MenuSurface,
      createMenuShortcutRegistry,
      Tabs,
      Tab,
      TabPanel,
      Typography,
      Surface,
      DetailsSurface,
      SummarySurface,
      OverlaySurface,
      StateLayer,
    } as unknown as Record<string, unknown>;
    for (const name of ['Button', 'Dialog', 'Field', 'Checkbox', 'Radio', 'Switch', 'Menu', 'MenuItem', 'MenuSurface', 'createMenuShortcutRegistry', 'Tabs', 'Tab', 'TabPanel', 'Typography', 'Surface', 'DetailsSurface', 'SummarySurface', 'OverlaySurface', 'StateLayer']) {
      if (!isRuntimeComponent(exported[name])) throw new Error(`[index.ts] missing runtime export ${name}`);
    }
  });

  it('parses primitive stylesheets with full context and enforces effective cascade', () => {
    const contracts: Array<[string, Array<[string, string, RegExp, string]>]> = [
      ['button.module.css', [
        ['.button', 'min-block-size', /--md-ref-touch-target/, 'must keep a 48dp touch target'],
        ['.button', 'border-radius', /--md-sys-shape-corner-full/, 'must use the M3 shape token'],
        ['.button:focus-visible', 'outline', /3px/, 'must expose a visible focus ring'],
        ['.small', 'min-block-size', /--md-ref-touch-target/, 'must retain the 48dp touch target'],
      ]],
      ['form-controls.module.css', [
        ['.control', 'min-block-size', /--md-ref-touch-target/, 'must keep controls touch-sized'],
        ['.control:focus-visible', 'outline', /3px/, 'must expose a visible focus ring'],
      ]],
      ['selection-controls.module.css', [
        ['.indicator', 'border', /--md-sys-color/, 'must use M3 colour roles'],
      ]],
      ['menu.module.css', [
        ['.surface', 'max-block-size', /100dvh/, 'must be bounded by the viewport'],
        ['.surface', 'overflow', /auto/, 'must scroll internally'],
        ['.item:focus-visible', 'outline', /3px/, 'must expose a visible focus ring'],
      ]],
      ['tabs.module.css', [
        ['.list', 'overflow', /auto/, 'must keep tab overflow reachable'],
        ['.tab:focus-visible', 'outline', /3px/, 'must expose a visible focus ring'],
      ]],
      ['typography.module.css', [
        ['.bodyMedium', 'font-size', /--md-sys-typescale-body-medium-size/, 'must consume the M3 type scale'],
      ]],
      ['surface.module.css', [
        ['.overlay', 'max-inline-size', /100dvw/, 'must be bounded on the inline axis'],
        ['.overlay', 'max-block-size', /100dvh/, 'must be bounded on the block axis'],
        ['.overlay', 'overflow', /auto/, 'must scroll internally'],
      ]],
      ['dialog.module.css', [
        [':where(.dialog)', 'background', /--md-sys-color-surface-container-high/, 'must paint its own surface'],
        [':where(.dialog)', 'box-shadow', /--shadow-lg/, 'must expose elevation'],
      ]],
    ];

    for (const [fileName, rules] of contracts) {
      const document = parseCss(source(fileName), fileName);
      requireAtRule(document, fileName, /prefers-reduced-motion:\s*reduce/, 'a reduced-motion rule');
      for (const [selector, property, value, reason] of rules) requireDeclaration(document, fileName, selector, property, value, reason);
      requireReducedMotionOverrides(document, fileName);
    }

    const buttonDocument = parseCss(source('button.module.css'), 'button.module.css');
    const baseTransition = winningDeclaration(buttonDocument, '.button', 'transition', unconditional, 'button.module.css');
    const reducedTransition = winningDeclaration(buttonDocument, '.button', 'transition', reducedMotion, 'button.module.css');
    if (!baseTransition || !/150ms/.test(baseTransition)) throw new Error('[button.module.css] unconditional transition was not parsed');
    if (reducedTransition !== 'none') throw new Error('[button.module.css] reduced-motion transition does not win the effective cascade');

    const dialogDocument = parseCss(source('dialog.module.css'), 'dialog.module.css');
    const dialogRadiusValues = dialogDocument.rules
      .filter((rule) => rule.context.length === 0 && selectorMatches(rule.selector, ':where(.dialog)'))
      .flatMap((rule) => parseDeclarations(rule.body).filter((item) => item.property === 'border-radius'));
    if (dialogRadiusValues.length !== 1 || winningDeclaration(dialogDocument, ':where(.dialog)', 'border-radius', unconditional, 'dialog.module.css') !== 'var(--md-sys-shape-corner-xl)') {
      throw new Error('[dialog.module.css] :where(.dialog) must have one effective M3 border-radius declaration');
    }
  });

  it('publishes the shared spacing, state-layer, and motion tokens', () => {
    for (const token of ['--md-sys-spacing-1', '--md-sys-spacing-6', '--md-sys-state-hover-opacity', '--md-sys-state-focus-opacity', '--md-sys-state-pressed-opacity', '--md-sys-state-dragged-opacity', '--md-sys-motion-duration-short-4']) requireToken(token);
  });

  it('keeps searchable and locked select options reachable inside nested scroll', () => {
    const document = parseCss(webPrimitiveSource, 'styles/primitives.css');
    requireDeclaration(document, 'styles/primitives.css', '.od-select-options', 'overflow', /auto/, 'must scroll the option collection internally');
    requireDeclaration(document, 'styles/primitives.css', '.od-select-options', 'min-height', /0/, 'must be allowed to shrink below its content');
    requireDeclaration(document, 'styles/primitives.css', '.od-select-search input', 'min-height', /48px/, 'must keep the search target touch-sized');
    requireDeclaration(document, 'styles/primitives.css', '.od-select-option', 'min-height', /--md-ref-touch-target/, 'must keep every option touch-sized');
    requireDeclaration(document, 'styles/primitives.css', '.od-select-locked-wrapper > .od-select-trigger', 'pointer-events', /none/, 'must not activate a locked trigger through its wrapper');
    requireDeclaration(document, 'styles/primitives.css', '.od-select-no-results', 'min-height', /48px/, 'must expose an honest reachable empty state');
  });

  it('fails closed with exact reasons for unrelated media, combinators, stronger specificity, layers, important, repeats, and comments', () => {
    expect(() => parseCss('.button { transition: 1s; } @media (min-width: 10px) { .button { transition: none; } }', 'unrelated.css')).toThrowError('CSS parser: unsupported media condition @media (min-width: 10px)');
    expect(() => parseCss('.button { transition: 1s; } @media (prefers-reduced-motion: reduce) and (min-width: 10px) { .button { transition: none; } }', 'constrained-media.css')).toThrowError('CSS parser: unsupported media condition @media (prefers-reduced-motion: reduce) and (min-width: 10px)');
    expect(() => parseCss('@supports (display: grid) { .button { transition: none; } }', 'supports.css')).toThrowError('CSS parser: unsupported conditional at-rule @supports (display: grid)');
    expect(() => parseCss('@container card (min-width: 10px) { .button { transition: none; } }', 'container.css')).toThrowError('CSS parser: unsupported conditional at-rule @container card (min-width: 10px)');
    expect(() => parseCss('@scope (.toolbar) { .button { transition: none; } }', 'scope.css')).toThrowError('CSS parser: unsupported conditional at-rule @scope (.toolbar)');

    const combinator = parseCss('.toolbar .button { transition: 1s; } @media (prefers-reduced-motion: reduce) { .toolbar .button { transition: none; } }', 'combinator.css');
    expect(winningDeclaration(combinator, '.toolbar .button', 'transition', reducedMotion, 'combinator.css')).toBe('none');
    if (winningDeclaration(combinator, '.button', 'transition', reducedMotion, 'combinator.css') !== undefined) throw new Error('[combinator.css] descendant combinator leaked into a plain button target');
    const attributed = parseCss("input[type='radio'] + .indicator { transition: 1s; } @media (prefers-reduced-motion: reduce) { input[type='radio'] + .indicator { transition: none; } }", 'attribute.css');
    expect(winningDeclaration(attributed, "input[type='radio'] + .indicator", 'transition', reducedMotion, 'attribute.css')).toBe('none');
    const identified = parseCss('#toolbar .button { transition: 1s; } @media (prefers-reduced-motion: reduce) { #toolbar .button { transition: none; } }', 'id.css');
    expect(winningDeclaration(identified, '#toolbar .button', 'transition', reducedMotion, 'id.css')).toBe('none');
    const extraClass = parseCss('.button.foo { transition: 1s; } @media (prefers-reduced-motion: reduce) { .button.foo { transition: none; } }', 'extra-class.css');
    expect(winningDeclaration(extraClass, '.button.foo', 'transition', reducedMotion, 'extra-class.css')).toBe('none');
    expect(winningDeclaration(extraClass, '.button', 'transition', reducedMotion, 'extra-class.css')).toBeUndefined();
    expect(() => parseCss('.button:not(.foo) { transition: 1s; }', 'nested-pseudo.css')).toThrowError(
      'nested-pseudo.css] selector has unsupported nested pseudo-class :not()',
    );
    expect(specificity('.button:not(:disabled)')).toEqual([0, 2, 0]);
    expect(specificity('html:not([data-theme])')).toEqual([0, 1, 1]);
    expect(specificity(':where(.dialog)')).toEqual([0, 0, 0]);
    expect(() => parseCss('.button:has(.child) { transition: 1s; }', 'pseudo-class.css')).toThrowError('pseudo-class :has');
    expect(() => parseCss('.button::marker { transition: 1s; }', 'pseudo-element.css')).toThrowError('pseudo-element ::marker');

    const stronger = parseCss('.button { transition: 1s; } @media (prefers-reduced-motion: reduce) { .button { transition: none; } } .button.button { transition: 1s; }', 'specificity.css');
    expect(() => requireReducedMotionOverrides(stronger, 'specificity.css')).toThrowError('[specificity.css] prefers-reduced-motion: reduce .button transition must disable this motion under reduced motion');

    const strongerCombinator = parseCss('.toolbar .button { transition: 1s; } @media (prefers-reduced-motion: reduce) { .toolbar .button { transition: none; } } .toolbar.toolbar .button { transition: 1s; }', 'combinator-specificity.css');
    expect(() => requireReducedMotionOverrides(strongerCombinator, 'combinator-specificity.css')).toThrowError('[combinator-specificity.css] prefers-reduced-motion: reduce .toolbar .button transition must disable this motion under reduced motion');

    const layered = parseCss('@layer base, overrides; @layer base { .button { transition: none !important; } } @layer overrides { .button { transition: 1s !important; } }', 'layers.css');
    if (winningDeclaration(layered, '.button', 'transition', reducedMotion, 'layers.css') !== 'none') throw new Error('[layers.css] earlier important layer must win over later important layer');

    const repeated = parseCss('.button { transition: 1s; } @media (prefers-reduced-motion: reduce) { .button { transition: none; } } .button { transition: 1s; }', 'repeat.css');
    expect(() => requireReducedMotionOverrides(repeated, 'repeat.css')).toThrowError('[repeat.css] prefers-reduced-motion: reduce .button transition must disable this motion under reduced motion');

    const commentOnly = parseCss('.button { transition: 1s; } /* @media (prefers-reduced-motion: reduce) { .button { transition: none; } } */', 'comment.css');
    expect(() => requireReducedMotionOverrides(commentOnly, 'comment.css')).toThrowError('[comment.css] prefers-reduced-motion: reduce .button transition must disable this motion under reduced motion');

    const tooComplex = Array.from({ length: 65 }, () => '.button { transition: 1s; }').join(' ');
    expect(() => winningDeclaration(parseCss(tooComplex, 'complex.css'), '.button', 'transition', unconditional, 'complex.css')).toThrowError('[complex.css] unconditional .button transition cascade has too many candidates to evaluate');
  });
});
