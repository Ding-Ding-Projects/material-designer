// Material Design 3 anatomy for the Projects collection (roadmap § 2.4
// Wave 3): the "Filters & stats" disclosure and its filter chips, the
// outlined Select control, and the select-mode toolbar. Every expectation is
// the literal text in the source.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const drawerCss = read('../../src/styles/workspace/drawer.css');
const designsTab = read('../../src/components/DesignsTab.tsx');
const mentionHomeCss = read('../../src/styles/workspace/mention-home.css');

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

// Wave C, part 2: the project card's own anatomy — the kind chip on the cover,
// the overflow glyph at the end of the supporting-text row, and the selection
// checkbox — measured against `mockups/open-design-m3/Open Design M3.dc.html`
// lines 355-375.
describe('the project card (M3 media card)', () => {
  it('rounds its cover instead of clipping the card, so the menu can open out of the row', () => {
    const card = block(drawerCss, '.design-card');
    expect(card).not.toMatch(/overflow:\s*hidden/);
    const thumb = block(drawerCss, '.design-card-thumb');
    expect(value(thumb, 'border-radius')).toBe(
      'var(--md-sys-shape-corner-l) var(--md-sys-shape-corner-l) 0 0',
    );
    expect(value(thumb, 'overflow')).toBe('hidden');
    expect(value(thumb, 'min-height')).toBe('132px');
    // A shadowed second font-size used to win over the first.
    expect([...block(drawerCss, '.design-card-thumb').matchAll(/font-size:/g)]).toHaveLength(1);
  });

  it('rides the kind chip on the cover, top right, on its own scrim', () => {
    const row = block(mentionHomeCss, '.design-card-tag-row--cover');
    expect(value(row, 'position')).toBe('absolute');
    expect(value(row, 'top')).toBe('10px');
    expect(value(row, 'right')).toBe('10px');
    const chip = block(mentionHomeCss, '.design-card-tag-row--cover .design-card-tag');
    expect(value(chip, 'height')).toBe('24px');
    expect(value(chip, 'padding')).toBe('0 10px');
    expect(value(chip, 'border-radius')).toBe('var(--md-sys-shape-corner-full)');
    expect(value(chip, 'font-size')).toBe('11px');
    expect(value(chip, 'font-weight')).toBe('600');
    expect(value(chip, 'background')).toContain('var(--md-sys-color-scrim)');
    expect(designsTab).toContain('className="design-card-tag-row design-card-tag-row--cover"');
  });

  it('ends the supporting-text row with more_vert, padded to a 44px target', () => {
    const anchor = block(drawerCss, '.design-card-menu-anchor');
    expect(value(anchor, 'position')).toBe('relative');
    expect(value(anchor, 'margin-left')).toBe('auto');
    const more = block(drawerCss, '.design-card-more');
    expect(value(more, 'width')).toBe('24px');
    expect(value(more, 'height')).toBe('24px');
    expect(value(more, 'background')).toBe('transparent');
    expect(value(more, 'border')).toBe('0');
    expect(value(more, 'border-radius')).toBe('var(--md-sys-shape-corner-full)');
    expect(value(more, 'color')).toBe('var(--md-sys-color-on-surface-variant)');
    // 24px drawn, 44px pressable.
    expect(value(block(drawerCss, '.design-card-more::after'), 'inset')).toBe('-10px');
    // The menu opens upward now that it lives at the bottom of the card.
    expect(value(block(drawerCss, '.design-card-menu'), 'bottom')).toBe('calc(100% + 6px)');
    expect(designsTab).toContain('<Icon name="more-vertical" size={18} />');
  });

  it('draws the selection checkbox at the mockup\'s 28px', () => {
    const box = block(drawerCss, '.design-card-checkbox');
    expect(value(box, 'width')).toBe('28px');
    expect(value(box, 'height')).toBe('28px');
    expect(value(box, 'top')).toBe('10px');
    expect(value(box, 'left')).toBe('10px');
    expect(value(box, 'border-radius')).toBe('var(--md-sys-shape-corner-s)');
    expect(value(box, 'border')).toBe('2px solid var(--md-sys-color-outline)');
    const checked = block(drawerCss, '.design-card-checkbox.checked');
    expect(value(checked, 'background')).toBe('var(--md-sys-color-primary)');
    expect(value(checked, 'color')).toBe('var(--md-sys-color-on-primary)');
  });
});
