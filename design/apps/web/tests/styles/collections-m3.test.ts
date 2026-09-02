// Material Design 3 anatomy for the Projects collection (roadmap § 2.4
// Wave 3): the "Filters & stats" disclosure and its filter chips, the
// outlined Select control, and the select-mode toolbar. Every expectation is
// the literal text in the source.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const drawerCss = read('../../src/styles/workspace/drawer.css');
const designsTab = read('../../src/components/DesignsTab.tsx');

function block(css: string, selector: string): string {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|[}\\n])\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(source);
  if (!match) throw new Error(`Missing CSS block for ${selector}`);
  return match[1]!;
}

function value(declarations: string, property: string): string {
  const matches = [...declarations.matchAll(new RegExp(`(?:^|[;\\n])\\s*${property}:\\s*([^;]+);`, 'g'))];
  const last = matches.at(-1);
  if (!last) throw new Error(`Missing ${property}`);
  return last[1]!.replace(/\s+/g, ' ').trim();
}

describe('the Projects filter chips (M3 filter chip)', () => {
  it('are 36px, outlined at rest, secondary-container with a check when on', () => {
    const chip = block(drawerCss, '.designs-filter-chip');
    expect(value(chip, 'height')).toBe('36px');
    expect(value(chip, 'border')).toBe('1px solid var(--md-sys-color-outline)');
    expect(value(chip, 'border-radius')).toBe('var(--md-sys-shape-corner-full)');
    expect(value(chip, 'background')).toBe('transparent');
    const on = block(drawerCss, '.designs-filter-chip.is-on');
    expect(value(on, 'background')).toBe('var(--md-sys-color-secondary-container)');
    expect(value(on, 'color')).toBe('var(--md-sys-color-on-secondary-container)');
    expect(designsTab).toContain('{on ? <Icon name="check" size={18} /> : null}');
  });

  it('offer exactly the five filters the mockup draws, in its order', () => {
    expect(designsTab).toContain('const KIND_FILTERS: readonly KindFilter[] = ["all", "prototype", "deck", "media", "document"];');
  });

  it('sit behind a disclosure with a summary line', () => {
    const toggle = block(drawerCss, '.designs-filters__toggle');
    expect(value(toggle, 'height')).toBe('36px');
    expect(value(toggle, 'border')).toBe('1px solid var(--md-sys-color-outline-variant)');
    expect(designsTab).toContain('aria-expanded={filtersOpen}');
    expect(designsTab).toContain('t("designs.filtersSummaryNone", { n: filteredProjects.length })');
  });
});

describe('the select controls', () => {
  it('draws Select as a 40px outlined button', () => {
    const toggle = block(drawerCss, '.designs-select-toggle');
    expect(value(toggle, 'height')).toBe('40px');
    expect(value(toggle, 'border')).toBe('1px solid var(--md-sys-color-outline)');
    expect(value(toggle, 'border-radius')).toBe('var(--md-sys-shape-corner-full)');
  });

  it('draws the select-mode toolbar as a sticky 64px secondary-container pill', () => {
    const bar = block(drawerCss, '.designs-select-bar');
    expect(value(bar, 'position')).toBe('sticky');
    expect(value(bar, 'height')).toBe('64px');
    expect(value(bar, 'background')).toBe('var(--md-sys-color-secondary-container)');
    expect(value(bar, 'border-radius')).toBe('var(--md-sys-shape-corner-full)');
    expect(value(block(drawerCss, '.designs-select-delete'), 'color')).toBe('var(--md-sys-color-error)');
  });
});
