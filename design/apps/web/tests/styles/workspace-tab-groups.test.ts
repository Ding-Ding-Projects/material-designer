import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The group header's whole appearance contract is "every custom property has a
// reader here, with a fallback". Two defects are pinned against:
//
//   * a decoration control that persists a value nothing renders, because the
//     `var()` for it was never added; and
//   * an overlay or a bounded list that caps its height without scrolling,
//     which deletes whatever did not fit with no scrollbar to say so.
//
// Every value below is the literal text written in the stylesheet.

const barCss = readFileSync(
  new URL('../../src/components/WorkspaceTabsBar.module.css', import.meta.url),
  'utf8',
);
const discoveryCss = readFileSync(
  new URL('../../src/components/workspace-tabs/WorkspaceTabDiscovery.module.css', import.meta.url),
  'utf8',
);
const editorCss = readFileSync(
  new URL(
    '../../src/components/workspace-tabs/TabGroupAppearanceEditor.module.css',
    import.meta.url,
  ),
  'utf8',
);

function block(css: string, selector: string): string {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks: string[] = [];
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(withoutComments)) !== null) {
    const selectors = (match[1] ?? '').split(',').map((item) => item.trim());
    if (selectors.includes(selector)) blocks.push(match[2] ?? '');
  }
  if (blocks.length === 0) throw new Error(`Missing CSS block for ${selector}`);
  return blocks.join('\n');
}

function value(css: string, selector: string, property: string): string {
  const declarations = block(css, selector);
  const matches = [
    ...declarations.matchAll(new RegExp(`(?:^|[;\\n])\\s*${property}:\\s*([^;]+);`, 'g')),
  ];
  const match = matches.at(-1);
  if (!match) throw new Error(`Missing ${property} on ${selector}`);
  return match[1]!.trim();
}

describe('every decoration property has a reader', () => {
  it('reads each custom property `tabGroupDecorationStyle` emits, with a fallback', () => {
    expect(value(barCss, '.groupSection', 'border-radius')).toBe(
      'var(--wt-group-radius, var(--md-sys-shape-corner-s))',
    );
    expect(value(barCss, '.groupSection', 'background')).toBe(
      'var(--wt-group-bg, color-mix(in srgb, var(--wt-group-swatch) 12%, transparent))',
    );
    expect(value(barCss, '.groupHeader', 'color')).toBe('var(--wt-group-label, var(--text))');
    expect(value(barCss, '.groupHeader', 'font-size')).toBe('var(--wt-group-size, 11.5px)');
    expect(value(barCss, '.groupHeader', 'font-weight')).toBe('var(--wt-group-weight, 700)');
    expect(value(barCss, '.groupDot', 'background')).toBe(
      'var(--wt-group-accent, var(--wt-group-swatch, var(--text-faint)))',
    );
  });

  it('names all six group colours in the strip and in the panel', () => {
    for (const color of ['sky', 'grape', 'citrus', 'moss', 'clay', 'slate']) {
      expect(barCss).toContain(`.groupSection[data-tab-group-color='${color}']`);
      expect(discoveryCss).toContain(`.groupCard[data-tab-group-color='${color}']`);
    }
    expect(value(barCss, ".groupSection[data-tab-group-color='moss']", '--wt-group-swatch'))
      .toBe('#3fb07a');
  });

  it('scopes every colour rule to a local class so the module can hash it', () => {
    // A bare `[data-tab-group-color='sky']` rule would leak into the global
    // cascade and colour anything else in the app that happened to use the
    // attribute.
    expect(discoveryCss).not.toMatch(/(^|\n)\s*\[data-tab-group-color/u);
    expect(barCss).not.toMatch(/(^|\n)\s*\[data-tab-group-color/u);
  });
});

describe('nothing is capped without a scrollbar', () => {
  it('scrolls the discovery panel and every bounded list inside it', () => {
    expect(value(discoveryCss, '.discovery', 'max-height')).toBe(
      'min(520px, calc(100vh - 120px))',
    );
    expect(value(discoveryCss, '.discovery', 'overflow-y')).toBe('auto');
    expect(value(discoveryCss, '.list', 'max-height')).toBe('220px');
    expect(value(discoveryCss, '.list', 'overflow-y')).toBe('auto');
  });

  it('scrolls the appearance editor inside the bound its anchor gives it', () => {
    expect(value(editorCss, '.card', 'overflow-y')).toBe('auto');
    // It paints its own surface: an overlay that renders transparent lets the
    // strip read straight through the colour values on top of it.
    expect(value(editorCss, '.card', 'background')).toBe('var(--bg-panel)');
    expect(value(editorCss, '.card', 'border')).toBe('1px solid var(--border)');
    expect(value(editorCss, '.card', 'box-shadow')).toBe('var(--shadow-lg)');
  });
});

describe('the header holds at narrow widths', () => {
  it('gives up label width in two steps rather than disappearing', () => {
    expect(value(barCss, '.groupHeader', 'max-width')).toBe('168px');
    expect(barCss).toContain('@media (max-width: 720px)');
    expect(barCss).toContain('@media (max-width: 480px)');
    expect(value(barCss, '.groupLabel', 'text-overflow')).toBe('ellipsis');
  });

  it('keeps a visible focus ring on every new control', () => {
    expect(value(barCss, '.groupHeader:focus-visible', 'outline')).toBe('2px solid var(--accent)');
    expect(discoveryCss).toContain('.rowMain:focus-visible');
    expect(editorCss).toContain('.resetAll:focus-visible');
  });

  it('respects reduced motion', () => {
    expect(discoveryCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(editorCss).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
