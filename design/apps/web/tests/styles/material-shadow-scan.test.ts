// No Material declaration may be shadowed by a legacy one.
//
// The initial import appended the pre-Material declarations after the
// Material ones they were meant to replace — inside the same block, or in a
// later block of the same selector at the same nesting depth. Later wins in
// the cascade, so the source read as migrated while the product painted its
// old values: `#fff` behind the surface role, `#ededed` behind the user
// bubble, the deleted Albert Sans ahead of the bundled face. 89 such pairs
// were removed on 2026-09-02; this keeps the count at zero.
//
// A "shadow" is precisely: property P declared with a `var(--md-sys-*)` or
// `var(--md-ref-*)` value, then P declared again later in the same cascade
// slot with a value that carries no such token. Nothing else counts — the
// sheets pair `--od-vh` with `--od-dvh` and a fallback with its `color-mix`
// on purpose, and a blanket "first declaration wins" rule would break those.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../../src/', import.meta.url));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return name.endsWith('.css') ? [full] : [];
  });
}

interface Block {
  selector: string;
  depth: number;
  body: string;
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
}

function blocks(css: string): Block[] {
  const out: Block[] = [];
  const stack: Array<{ selector: string; start: number }> = [];
  let start = 0;
  for (let i = 0; i < css.length; i += 1) {
    const c = css[i];
    if (c === '{') {
      stack.push({ selector: css.slice(start, i).trim(), start: i + 1 });
      start = i + 1;
    } else if (c === '}') {
      const open = stack.pop();
      if (open && !open.selector.startsWith('@')) {
        out.push({ selector: open.selector, depth: stack.length, body: css.slice(open.start, i) });
      }
      start = i + 1;
    } else if (c === ';' && stack.length === 0) {
      start = i + 1;
    }
  }
  return out;
}

const MATERIAL = /var\(--md-(?:sys|ref)-/;

export interface Shadow {
  file: string;
  selector: string;
  property: string;
  material: string;
  legacy: string;
}

export function findShadows(file: string, css: string): Shadow[] {
  const found: Shadow[] = [];
  const slots = new Map<string, Block[]>();
  for (const block of blocks(stripComments(css))) {
    const key = `${block.depth}|${block.selector}`;
    slots.set(key, [...(slots.get(key) ?? []), block]);
  }
  for (const group of slots.values()) {
    const seen = new Map<string, string>();
    for (const block of group) {
      for (const m of block.body.matchAll(/(?:^|;)\s*([-\w]+)\s*:\s*([^;{}]+)/g)) {
        const property = m[1]!.trim();
        const value = m[2]!.trim();
        const materialValue = seen.get(property);
        if (materialValue !== undefined && !MATERIAL.test(value)) {
          found.push({ file, selector: group[0]!.selector, property, material: materialValue, legacy: value });
        }
        if (MATERIAL.test(value)) seen.set(property, value);
      }
    }
  }
  return found;
}

/**
 * The two restatements that are not shadows: `tokens.css` deliberately lets a
 * later compatibility block win for these aliases, and
 * `appearance-density-tokens.test.ts` pins that block as canonical.
 */
const REVIEWED: ReadonlySet<string> = new Set([
  'styles/tokens.css|:root|--radius-xs',
  'styles/tokens.css|:root|--radius-pill',
]);

describe('shadowed Material declarations', () => {
  it('finds a Material-then-legacy pair and nothing else', () => {
    const css = [
      '.a { color: var(--md-sys-color-primary); color: red; }',
      '.b { max-height: calc(var(--od-vh, 100vh) - 1px); max-height: calc(var(--od-dvh, 100dvh) - 1px); }',
      '.c { background: #fff; background: var(--md-sys-color-surface); }',
      '.d { color: var(--md-sys-color-primary); } .d { color: blue; }',
      '@media (x) { .d { color: green; } }',
    ].join('\n');
    expect(findShadows('fixture.css', css).map((s) => `${s.selector} ${s.property}`)).toEqual([
      '.a color',
      '.d color',
    ]);
  });

  it('are absent from every stylesheet under src', () => {
    const shadows = walk(SRC)
      .flatMap((file) => findShadows(relative(SRC, file).split('\\').join('/'), readFileSync(file, 'utf8')))
      .filter((s) => !REVIEWED.has(`${s.file}|${s.selector}|${s.property}`));
    expect(
      shadows.map((s) => `${s.file} ${s.selector} { ${s.property}: ${s.material} … ${s.legacy} }`),
    ).toEqual([]);
  });
});
