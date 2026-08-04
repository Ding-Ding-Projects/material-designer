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

function ruleValue(block: string, property: string): string {
  const matches = [...block.matchAll(new RegExp(`(?:^|[;\\n])\\s*${property}:\\s*([^;]+);`, 'g'))];
  const match = matches.at(-1);
  if (!match) throw new Error(`Missing CSS property ${property}`);
  return match[1]!.trim();
}

describe('HomeHero compact composer controls', () => {
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

  it('keeps the execution button compact in the hero', () => {
    const switcherChip = cssDeclarations(
      '.home-hero__execution-switcher .inline-switcher__chip',
    );

    // The execution switcher keeps a fixed icon+chevron footprint. Its height
    // is the shared chip token rather than a literal: the whole control row is
    // one Material Design 3 assist-chip rail now, so a chip that pinned its own
    // 32px would be the one control standing a step out of line.
    expect(ruleValue(switcherChip, 'height')).toBe('var(--home-hero-chip-height)');
    expect(ruleValue(switcherChip, 'max-width')).toBe('62px');
  });

  it('prevents the compact execution switcher from expanding on narrow screens', () => {
    const switcher = cssDeclarations('.home-hero__execution-switcher');
    const switcherChip = cssDeclarations(
      '.home-hero__execution-switcher .inline-switcher__chip',
    );

    expect(ruleValue(switcher, 'flex-basis')).toBe('auto');
    // 62px, not 58: the chip grew to the 36dp rail height, and its fixed
    // icon+chevron footprint grew with it. The property under test is that it
    // stays fixed, not the particular number.
    expect(ruleValue(switcherChip, 'width')).toBe('62px');
    expect(ruleValue(switcherChip, 'max-width')).toBe('62px');
  });

  it('keeps the template picker search field free of the global input focus halo', () => {
    const templateSearchFocus = cssDeclarations('.home-hero__template-search input:focus');

    expect(ruleValue(templateSearchFocus, 'outline')).toBe('none');
    expect(ruleValue(templateSearchFocus, 'box-shadow')).toBe('none');
  });
});
