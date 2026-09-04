import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
  The dialog card's own contract, checked from inside the package that owns it.

  Two things are being protected. The first is that the card paints itself: a
  dialog with no surface of its own lets the page read through its text, and a
  dialog told apart from the dimmed page by a shadow alone fails the same way
  in dark mode, where there is nothing for the shadow to fall on.

  The second is the one that was actually missing. The card had no height bound
  at all: it grew to its content, the centring backdrop pushed the overflow off
  both the top and the bottom of the screen, and there was no scrollbar and no
  keyboard route to what had gone. A confirmation dialog can lose its own
  buttons that way — the user sees a question and neither answer.

  The app's own suite carries the other half of this, that the global `.modal`
  rule which shares this element still agrees with these values. It has to live
  there: this package must not read the app's source.
*/

const css = readFileSync(new URL('../src/dialog.module.css', import.meta.url), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

function block(selector: string): string {
  const blocks: string[] = [];
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(css)) !== null) {
    const selectors = (match[1] ?? '').split(',').map((item) => item.trim());
    if (selectors.includes(selector)) blocks.push(match[2] ?? '');
  }
  if (blocks.length === 0) throw new Error(`Missing CSS block for ${selector}`);
  return blocks.join('\n');
}

function values(declarations: string, property: string): string[] {
  return Array.from(
    declarations.matchAll(new RegExp(`(?:^|[;\\n])\\s*${property}:\\s*([^;]+);`, 'g')),
  ).map((match) => match[1]!.trim());
}

function only(declarations: string, property: string): string {
  const found = values(declarations, property);
  if (found.length === 0) throw new Error(`Missing CSS property ${property}`);
  return found[0]!;
}

function atRules(cssText: string): string[] {
  const rules: string[] = [];
  let cursor = 0;
  while (cursor < cssText.length) {
    const open = cssText.indexOf('{', cursor);
    if (open < 0) break;
    const prelude = cssText.slice(cursor, open).trim();
    let depth = 1;
    let close = open + 1;
    while (close < cssText.length && depth > 0) {
      if (cssText[close] === '{') depth += 1;
      if (cssText[close] === '}') depth -= 1;
      close += 1;
    }
    if (depth !== 0) throw new Error(`dialog.module.css has unbalanced braces after ${prelude}`);
    if (prelude.startsWith('@')) rules.push(prelude);
    cursor = close;
  }
  return rules;
}

describe('dialog surface', () => {
  it('paints its own Material Design 3 card', () => {
    const card = block(':where(.dialog)');

    expect(only(card, 'background')).toBe('var(--md-sys-color-surface-container-high)');
    expect(only(card, 'border')).toBe('1px solid var(--md-sys-color-outline-variant)');
    expect(values(card, 'border-radius')).toEqual(['var(--md-sys-shape-corner-xl)']);
    expect(only(card, 'border-radius')).toBe('var(--md-sys-shape-corner-xl)');
    expect(only(card, 'box-shadow')).toBe('var(--shadow-lg)');
  });

  it('is bounded by the viewport and scrolls inside that bound', () => {
    const card = block(':where(.dialog)');

    // Two declarations, `dvh` last so it wins where it is understood. On a host
    // whose viewport shrinks under an on-screen keyboard, the `vh` value keeps
    // the old, taller number and leaves the card partly off-screen.
    expect(values(card, 'max-height')).toEqual(['calc(100vh - 48px)', 'calc(100dvh - 48px)']);
    expect(only(card, 'overflow-y')).toBe('auto');
    expect(only(card, 'overscroll-behavior')).toBe('contain');
  });

  it('scrolls the body rather than the whole card when the dialog is sectioned', () => {
    // Compound on purpose. Both classes are always on this element together, so
    // it selects the same thing — but at two classes it outranks the global
    // `.modal` rule that shares this element, instead of tying with it and
    // letting stylesheet emission order decide the layout.
    const sectioned = block('.dialog.dialogSectioned');
    const body = block('.dialog.dialogSectioned .body');

    // A sectioned dialog has a padded header and a footer with a rule above it,
    // and both are meant to stay put while the middle moves.
    expect(only(sectioned, 'overflow')).toBe('hidden');
    expect(only(body, 'overflow-y')).toBe('auto');
    // The load-bearing half: a column flex item defaults to `min-height: auto`
    // and refuses to shrink below its content, so without this the body pushes
    // the footer off the bottom of the card instead of scrolling.
    expect(only(body, 'min-height')).toBe('0');
  });

  it('keeps the backdrop above the page and the card above the backdrop', () => {
    const backdrop = block(':where(.backdrop)');

    expect(only(backdrop, 'position')).toBe('fixed');
    expect(only(backdrop, 'inset')).toBe('0');
    expect(Number.parseInt(only(backdrop, 'z-index'), 10)).toBeGreaterThan(0);
  });

  it('drops the entrance animations when the user has asked for less motion', () => {
    // `block` joins every rule with this exact selector, so the reduced-motion
    // override lands in the same string as the card itself.
    const card = block(':where(.dialog)');
    const backdrop = block(':where(.backdrop)');

    expect(values(card, 'animation').some((value) => value === 'none')).toBe(true);
    expect(values(backdrop, 'animation').some((value) => value === 'none')).toBe(true);
    expect(atRules(css).some((rule) => /prefers-reduced-motion:\s*reduce/.test(rule))).toBe(true);
  });
});
