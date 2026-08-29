import { readFileSync } from 'node:fs';
import * as components from '../src';
import { describe, expect, it } from 'vitest';

interface CssRule {
  selector: string;
  body: string;
  context: string[];
  order: number;
}

interface CssDocument {
  rules: CssRule[];
  atRules: string[][];
}

interface CascadeMode {
  name: string;
  contextActive: (context: string[]) => boolean;
}

const sourceRoot = new URL('../src/', import.meta.url);
const source = (name: string) => readFileSync(new URL(name, sourceRoot), 'utf8');
const tokenSource = readFileSync(new URL('../../../apps/web/src/styles/md3-tokens.css', import.meta.url), 'utf8');
const webPrimitiveSource = readFileSync(new URL('../../../apps/web/src/styles/primitives.css', import.meta.url), 'utf8');

const unconditional: CascadeMode = {
  name: 'unconditional',
  contextActive: (context) => context.length === 0,
};

const reducedMotion: CascadeMode = {
  name: 'prefers-reduced-motion: reduce',
  contextActive: (context) => context.every((entry) => !entry.startsWith('@media') || /prefers-reduced-motion:\s*reduce/.test(entry)),
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

function parseCss(css: string, fileName: string): CssDocument {
  const text = withoutComments(css);
  const rules: CssRule[] = [];
  const atRules: string[][] = [];
  let order = 0;

  function parseRange(start: number, end: number, context: string[]) {
    let cursor = start;
    while (cursor < end) {
      while (cursor < end && /[\s;]/.test(text[cursor] ?? '')) cursor += 1;
      if (cursor >= end) return;
      const open = text.indexOf('{', cursor);
      if (open < 0 || open >= end) {
        if (text.slice(cursor, end).trim()) throw new Error(`[${fileName}] CSS parser: declarations have no opening brace`);
        return;
      }
      const selector = text.slice(cursor, open).trim();
      let depth = 1;
      let close = open + 1;
      while (close < end && depth > 0) {
        if (text[close] === '{') depth += 1;
        if (text[close] === '}') depth -= 1;
        close += 1;
      }
      if (depth !== 0) throw new Error(`[${fileName}] CSS parser: unbalanced braces after ${selector}`);
      const body = text.slice(open + 1, close - 1);
      if (selector.startsWith('@')) {
        const nextContext = [...context, selector];
        atRules.push(nextContext);
        parseRange(open + 1, close - 1, nextContext);
      } else {
        rules.push({ selector, body, context, order });
        order += 1;
      }
      cursor = close;
    }
  }

  parseRange(0, text.length, []);
  return { rules, atRules };
}

function normalizeSelector(selector: string): string {
  return selector.replace(/:where\(([^)]*)\)/g, '$1').replace(/\s+/g, '');
}

function selectorMatches(selector: string, wanted: string): boolean {
  const candidate = normalizeSelector(selector);
  const target = normalizeSelector(wanted);
  if (candidate === target) return true;
  if (/[ >+~]/.test(candidate) || /[ >+~]/.test(target)) return false;
  const classPattern = /\.[a-zA-Z0-9_-]+/g;
  const candidateClasses = candidate.match(classPattern) ?? [];
  const targetClasses = target.match(classPattern) ?? [];
  const candidateRest = candidate.replace(classPattern, '');
  const targetRest = target.replace(classPattern, '');
  return candidateRest === targetRest && targetClasses.every((name) => candidateClasses.includes(name));
}

function specificity(selector: string): [number, number, number] {
  const normalized = selector.replace(/:where\([^)]*\)/g, '');
  const ids = normalized.match(/#[a-zA-Z0-9_-]+/g)?.length ?? 0;
  const classes = normalized.match(/[.#[\]:][a-zA-Z0-9_-]+/g)?.length ?? 0;
  return [ids, classes, 0];
}

function declarationValues(rule: CssRule, property: string): string[] {
  const values: string[] = [];
  for (const part of rule.body.split(';')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    const name = part.slice(0, colon).trim();
    if (name === property) values.push(part.slice(colon + 1).trim());
  }
  return values;
}

function declaration(rule: CssRule, property: string, fileName: string): string {
  const values = declarationValues(rule, property);
  const value = values[values.length - 1];
  if (value) return value;
  throw new Error(`[${fileName}] selector ${rule.selector} must declare ${property}`);
}

function winningDeclaration(document: CssDocument, selector: string, property: string, mode: CascadeMode, fileName: string): string | undefined {
  const candidates = document.rules
    .filter((rule) => mode.contextActive(rule.context))
    .flatMap((rule) => rule.selector.split(',').map((candidate) => ({ rule, selector: candidate.trim() })))
    .filter(({ selector: candidate }) => selectorMatches(candidate, selector));
  candidates.sort((left, right) => {
    const leftSpecificity = specificity(left.selector);
    const rightSpecificity = specificity(right.selector);
    for (let index = 0; index < leftSpecificity.length; index += 1) {
      if (leftSpecificity[index] !== rightSpecificity[index]) return leftSpecificity[index]! - rightSpecificity[index]!;
    }
    return left.rule.order - right.rule.order;
  });
  const winning = candidates[candidates.length - 1];
  return winning ? declaration(winning.rule, property, fileName) : undefined;
}

function requireDeclaration(document: CssDocument, fileName: string, selector: string, property: string, value: RegExp, reason: string, mode: CascadeMode = unconditional) {
  const actual = winningDeclaration(document, selector, property, mode, fileName);
  if (!actual || !value.test(actual)) throw new Error(`[${fileName}] ${mode.name} ${selector} ${property} ${reason}`);
}

function requireAtRule(document: CssDocument, fileName: string, pattern: RegExp, reason: string) {
  if (!document.atRules.some((context) => context.some((entry) => pattern.test(entry)))) {
    throw new Error(`[${fileName}] missing ${reason}`);
  }
}

function requireToken(token: string) {
  const document = parseCss(tokenSource, 'md3-tokens.css');
  const found = document.rules.some((rule) => rule.selector.trim() === ':root' && rule.body.split(';').some((part) => part.trim().startsWith(`${token}:`)));
  if (!found) throw new Error(`[md3-tokens.css] :root must declare ${token}`);
}

function requireReducedMotionOverrides(document: CssDocument, fileName: string) {
  for (const rule of document.rules.filter((candidate) => candidate.context.length === 0)) {
    for (const property of ['animation', 'animation-name', 'transition', 'transition-property']) {
      let base: string | undefined;
      try {
        base = declaration(rule, property, fileName);
      } catch {
        continue;
      }
      if (!base || /^(none|0s)\s*$/.test(base)) continue;
      for (const selector of rule.selector.split(',').map((candidate) => candidate.trim())) {
        requireDeclaration(document, fileName, selector, property, /^(none|0s)\s*$/, 'must disable this motion under reduced motion', reducedMotion);
      }
    }
  }
}

describe('shared primitive contract', () => {
  it('exports every primitive family from the public entry point', () => {
    const exported = components as unknown as Record<string, unknown>;
    for (const name of ['Button', 'Dialog', 'Field', 'Checkbox', 'Radio', 'Switch', 'Menu', 'MenuItem', 'MenuSurface', 'Tabs', 'Tab', 'TabPanel', 'Typography', 'Surface', 'OverlaySurface', 'StateLayer']) {
      if (typeof exported[name] !== 'function') throw new Error(`[index.ts] missing runtime export ${name}`);
    }
  });

  it('parses every primitive stylesheet, tracks at-rule context, and enforces the effective M3 cascade', () => {
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
      .flatMap((rule) => declarationValues(rule, 'border-radius'));
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

  it('fails closed with exact reasons for unrelated media, stronger specificity, repeats, and comments', () => {
    const unrelated = parseCss('.button { transition: 1s; } @media (min-width: 10px) { .button { transition: none; } }', 'unrelated.css');
    expect(() => requireReducedMotionOverrides(unrelated, 'unrelated.css')).toThrowError('[unrelated.css] prefers-reduced-motion: reduce .button transition must disable this motion under reduced motion');

    const stronger = parseCss('.button { transition: 1s; } @media (prefers-reduced-motion: reduce) { .button { transition: none; } } .button.button { transition: 1s; }', 'specificity.css');
    expect(() => requireReducedMotionOverrides(stronger, 'specificity.css')).toThrowError('[specificity.css] prefers-reduced-motion: reduce .button transition must disable this motion under reduced motion');

    const repeated = parseCss('.button { transition: 1s; } @media (prefers-reduced-motion: reduce) { .button { transition: none; } } .button { transition: 1s; }', 'repeat.css');
    expect(() => requireReducedMotionOverrides(repeated, 'repeat.css')).toThrowError('[repeat.css] prefers-reduced-motion: reduce .button transition must disable this motion under reduced motion');

    const commentOnly = parseCss('.button { transition: 1s; } /* @media (prefers-reduced-motion: reduce) { .button { transition: none; } } */', 'comment.css');
    expect(() => requireReducedMotionOverrides(commentOnly, 'comment.css')).toThrowError('[comment.css] prefers-reduced-motion: reduce .button transition must disable this motion under reduced motion');
  });
});
