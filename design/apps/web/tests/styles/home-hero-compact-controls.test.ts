import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const homeHeroCss = readFileSync(
  new URL('../../src/styles/home/home-hero.css', import.meta.url),
  'utf8',
);

function cssDeclarations(selector: string): string {
  const blocks: string[] = [];
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  const cssWithoutComments = homeHeroCss.replace(/\/\*[\s\S]*?\*\//g, '');
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(cssWithoutComments)) !== null) {
    const selectors = (match[1] ?? '').split(',').map((item) => item.trim());
    if (selectors.includes(selector)) blocks.push(match[2] ?? '');
  }
  if (blocks.length === 0) throw new Error(`Missing CSS block for ${selector}`);
  return blocks.join('\n');
}

function ruleValues(block: string, property: string): string[] {
  const matches = [...block.matchAll(new RegExp(`(?:^|[;\\n])\\s*${property}:\\s*([^;]+);`, 'g'))];
  if (matches.length === 0) throw new Error(`Missing CSS property ${property}`);
  return matches.map((match) => {
    const value = match[1];
    if (value === undefined) throw new Error(`Missing CSS value for ${property}`);
    return value.trim();
  });
}

function ruleValue(block: string, property: string): string {
  const value = ruleValues(block, property).at(-1);
  if (value === undefined) throw new Error(`Missing final CSS value for ${property}`);
  return value;
}

describe('HomeHero compact composer controls', () => {
  it('closes the hero title rule before the logo wrapper rule', () => {
    const titleStart = homeHeroCss.indexOf('.home-hero__title {');
    const logoStart = homeHeroCss.indexOf('.home-hero__logo-wrap {');

    expect(titleStart).toBeGreaterThanOrEqual(0);
    expect(logoStart).toBeGreaterThan(titleStart);
    const titleRule = homeHeroCss.slice(titleStart, logoStart);
    expect(titleRule).toContain('color: var(--md-sys-color-on-surface);');
    expect(titleRule.trimEnd().endsWith('}')).toBe(true);
  });

  it('keeps active-context removal controls large enough to reach', () => {
    const clear = cssDeclarations('.home-hero__active-clear');
    expect(ruleValue(clear, 'width')).toBe('40px');
    expect(ruleValue(clear, 'height')).toBe('40px');
    expect(ruleValue(clear, 'flex')).toBe('0 0 40px');
  });

  it('keeps the floating @ picker shell stable while result tabs change', () => {
    const floatingPicker = cssDeclarations(
      '.caret-floating-layer .home-hero__plugin-picker--floating',
    );
    const picker = cssDeclarations('.home-hero__plugin-picker');
    const results = cssDeclarations('.home-hero__plugin-picker-results');

    expect(ruleValue(floatingPicker, 'height')).toBe('var(--cfl-max-h, 60vh)');
    expect(ruleValue(floatingPicker, 'max-height')).toBe('var(--cfl-max-h, 60vh)');
    expect(ruleValue(picker, 'overflow')).toBe('hidden');
    expect(ruleValue(results, 'flex')).toBe('1 1 auto');
    expect(ruleValue(results, 'overflow-y')).toBe('auto');
  });

  it('sizes the execution chip to the status dot + model name (#5517 round 4)', () => {
    const switcherChip = cssDeclarations(
      '.home-hero__execution-switcher .inline-switcher__chip',
    );

    // The execution switcher keeps a fixed icon+chevron footprint. Its height
    // is the shared chip token rather than a literal: the whole control row is
    // one Material Design 3 assist-chip rail now, so a chip that pinned its own
    // 32px would be the one control standing a step out of line.
    const heights = ruleValues(switcherChip, 'height');
    const maxWidths = ruleValues(switcherChip, 'max-width');
    expect(heights[0]).toBe('var(--home-hero-chip-height)');
    expect(heights.at(-1)).toBe('36px');
    // Round 4 widened the old 36px icon square into a pill that carries a
    // connection dot + the selected model name, capped so a long model id
    // ellipsizes instead of stretching the composer foot.
    // Base rule: the 220px name-pill cap. The ≤900px media block later
    // re-collapses the chip to a 36px icon square — both ends are asserted.
    expect(maxWidths[1]).toBe('220px');
    expect(maxWidths.at(-1)).toBe('36px');
  });

  it('keeps the switcher from expanding beyond its content on narrow screens', () => {
    const switcher = cssDeclarations('.home-hero__execution-switcher');
    const switcherChip = cssDeclarations(
      '.home-hero__execution-switcher .inline-switcher__chip',
    );

    expect(ruleValue(switcher, 'flex-basis')).toBe('auto');
    // The base chip is a content-sized name pill. The ≤900px media block
    // re-collapses it to a 36px icon square, so assert the final media values
    // without losing the base/media distinction above.
    expect(ruleValue(switcherChip, 'width')).toBe('36px');
    expect(ruleValue(switcherChip, 'max-width')).toBe('36px');
  });

});
