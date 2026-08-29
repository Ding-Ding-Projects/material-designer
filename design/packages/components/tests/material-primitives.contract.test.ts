import { readFileSync } from 'node:fs';
import * as components from '../src';
import { describe, expect, it } from 'vitest';

interface CssRule {
  selector: string;
  body: string;
}

interface CssDocument {
  rules: CssRule[];
  atRules: string[];
}

const sourceRoot = new URL('../src/', import.meta.url);
const source = (name: string) => readFileSync(new URL(name, sourceRoot), 'utf8');
const tokenSource = readFileSync(new URL('../../../apps/web/src/styles/md3-tokens.css', import.meta.url), 'utf8');
const webPrimitiveSource = readFileSync(new URL('../../../apps/web/src/styles/primitives.css', import.meta.url), 'utf8');

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
  const atRules: string[] = [];

  function parseRange(start: number, end: number) {
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
        atRules.push(selector);
        parseRange(open + 1, close - 1);
      } else {
        rules.push({ selector, body });
      }
      cursor = close;
    }
  }

  parseRange(0, text.length);
  return { rules, atRules };
}

function matchingRules(document: CssDocument, selector: string, fileName: string): CssRule[] {
  const matches = document.rules.filter((rule) => rule.selector.split(',').some((item) => item.trim() === selector));
  if (matches.length === 0) throw new Error(`[${fileName}] missing exact CSS selector ${selector}`);
  return matches;
}

function declaration(rule: CssRule, property: string, fileName: string): string {
  for (const part of rule.body.split(';')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    const name = part.slice(0, colon).trim();
    if (name === property) return part.slice(colon + 1).trim();
  }
  throw new Error(`[${fileName}] selector ${rule.selector} must declare ${property}`);
}

function requireDeclaration(document: CssDocument, fileName: string, selector: string, property: string, value: RegExp, reason: string) {
  const rules = matchingRules(document, selector, fileName);
  const winningRule = rules[rules.length - 1];
  if (!winningRule || !value.test(declaration(winningRule, property, fileName))) {
    throw new Error(`[${fileName}] ${selector} ${property} ${reason}`);
  }
}

function requireAtRule(document: CssDocument, fileName: string, pattern: RegExp, reason: string) {
  if (!document.atRules.some((rule) => pattern.test(rule))) {
    throw new Error(`[${fileName}] missing ${reason}`);
  }
}

function requireToken(token: string) {
  const tokenDocument = parseCss(tokenSource, 'md3-tokens.css');
  const rootRules = matchingRules(tokenDocument, ':root', 'md3-tokens.css');
  if (!rootRules.some((rule) => rule.body.split(';').some((part) => part.trim().startsWith(`${token}:`)))) {
    throw new Error(`[md3-tokens.css] :root must declare ${token}`);
  }
}

describe('shared primitive contract', () => {
  it('exports every primitive family from the public entry point', () => {
    const exported = components as unknown as Record<string, unknown>;
    for (const name of ['Button', 'Dialog', 'Field', 'Checkbox', 'Radio', 'Switch', 'Menu', 'MenuItem', 'MenuSurface', 'Tabs', 'Tab', 'TabPanel', 'Typography', 'Surface', 'OverlaySurface', 'StateLayer']) {
      if (typeof exported[name] !== 'function') throw new Error(`[index.ts] missing runtime export ${name}`);
    }
  });

  it('parses every primitive stylesheet and enforces exact Material 3 declarations', () => {
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
    }
  });

  it('publishes the shared spacing, state-layer, and motion tokens', () => {
    for (const token of [
      '--md-sys-spacing-1',
      '--md-sys-spacing-6',
      '--md-sys-state-hover-opacity',
      '--md-sys-state-focus-opacity',
      '--md-sys-state-pressed-opacity',
      '--md-sys-state-dragged-opacity',
      '--md-sys-motion-duration-short-4',
    ]) requireToken(token);
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

  it('fails closed with an exact reason when a required touch declaration is removed, then passes when restored', () => {
    const css = source('button.module.css');
    const marker = 'min-block-size: var(--md-ref-touch-target, 48px);';
    const broken = css.replace(marker, 'min-block-size: 40px;');
    const brokenDocument = parseCss(broken, 'button.module.css');
    expect(() => requireDeclaration(brokenDocument, 'button.module.css', '.button', 'min-block-size', /--md-ref-touch-target/, 'must keep a 48dp touch target')).toThrowError('[button.module.css] .button min-block-size must keep a 48dp touch target');
    const restoredDocument = parseCss(css, 'button.module.css');
    expect(() => requireDeclaration(restoredDocument, 'button.module.css', '.button', 'min-block-size', /--md-ref-touch-target/, 'must keep a 48dp touch target')).not.toThrow();
  });
});
