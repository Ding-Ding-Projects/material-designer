import { describe, expect, it } from 'vitest';
import { readExpandedIndexCss } from '../helpers/read-expanded-css';

const indexCss = readExpandedIndexCss();
const tokenCss = indexCss.replace(/\/\*[\s\S]*?\*\//g, '');

function cssBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(indexCss);
  if (!match) throw new Error(`Missing CSS block for ${selector}`);
  return match[1] ?? '';
}

// Since the Material Design 3 port the token layer spans two sheets:
// `md3-tokens.css` declares the `--md-sys-*` roles and `tokens.css` maps the
// product names onto them. Both open a `:root` and a `[data-theme="dark"]`
// block, so a themed lookup has to read every block for the selector, not the
// first one the cascade happens to reach.
function tokenVars(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const blocks = [...tokenCss.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g'))];
  if (blocks.length === 0) throw new Error(`Missing CSS block for ${selector}`);
  const vars: Record<string, string> = {};
  for (const block of blocks) {
    for (const declaration of (block[1] ?? '').matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
      vars[declaration[1]!] = declaration[2]!.trim();
    }
  }
  return vars;
}

function ruleValue(block: string, property: string): string {
  const match = new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+);`).exec(block);
  if (!match) throw new Error(`Missing CSS property ${property}`);
  return match[1]!.trim();
}

/** Follow `var(--token)` indirection until a literal value is reached. */
function resolveVar(value: string, variables: Record<string, string>): string {
  let current = value.trim();
  const seen = new Set<string>();
  for (;;) {
    const match = /^var\((--[^)]+)\)$/.exec(current);
    if (!match) return current;
    const key = match[1];
    if (!key) throw new Error(`Invalid CSS variable reference ${current}`);
    if (seen.has(key)) throw new Error(`Cyclic CSS variable reference ${key}`);
    seen.add(key);
    const resolved = variables[key];
    if (!resolved) throw new Error(`Missing resolved value for ${key}`);
    current = resolved.trim();
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(normalized)) throw new Error(`Expected #rrggbb, got ${hex}`);
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

/**
 * Resolve a colour to opaque RGB, evaluating the two composite forms the chip
 * contract actually writes:
 *
 *   - `rgba(r, g, b, a)` — the contract's state layer (`--ripple`), which is
 *     laid OVER whatever the chip sits on, so it needs the surface behind it.
 *   - `color-mix(in srgb, <ink> N%, <container>)` — the selected chip's state
 *     layer, which is mixed INTO its own fill.
 *
 * Without this a contrast assertion could only see the resting pair, and the
 * hover states — the ones #1795 was actually filed about — would go unchecked.
 */
function toRgb(
  value: string,
  variables: Record<string, string>,
  behind?: [number, number, number],
): [number, number, number] {
  const resolved = resolveVar(value, variables);

  const mix = /^color-mix\(\s*in srgb\s*,\s*(.+?)\s+([\d.]+)%\s*,\s*(.+?)\s*\)$/s.exec(resolved);
  if (mix) {
    const share = Number.parseFloat(mix[2]!) / 100;
    const top = toRgb(mix[1]!, variables, behind);
    const base = toRgb(mix[3]!, variables, behind);
    return [0, 1, 2].map((i) =>
      Math.round(top[i]! * share + base[i]! * (1 - share)),
    ) as [number, number, number];
  }

  const rgba = /^rgba?\(([^)]+)\)$/.exec(resolved);
  if (rgba) {
    const parts = rgba[1]!.split(',').map((part) => Number.parseFloat(part.trim()));
    const alpha = parts.length === 4 ? parts[3]! : 1;
    if (!behind) throw new Error(`Translucent ${resolved} needs a surface behind it`);
    return [0, 1, 2].map((i) =>
      Math.round(parts[i]! * alpha + behind[i]! * (1 - alpha)),
    ) as [number, number, number];
  }

  if (resolved === 'transparent') {
    if (!behind) throw new Error('`transparent` needs a surface behind it');
    return behind;
  }

  return hexToRgb(resolved);
}

function luminance([r, g, b]: [number, number, number]): number {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(
  foreground: [number, number, number],
  background: [number, number, number],
): number {
  const first = luminance(foreground);
  const second = luminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('filter chip (M3)', () => {
  const rootVars = tokenVars(':root');
  const darkVars = { ...rootVars, ...tokenVars('[data-theme="dark"]') };
  const themes: Array<[string, Record<string, string>]> = [
    ['light', rootVars],
    ['dark', darkVars],
  ];

  it('draws the Material Design 3 filter-chip anatomy', () => {
    const resting = cssBlock('.filter-pill');

    expect(ruleValue(resting, 'height')).toBe('36px');
    expect(ruleValue(resting, 'padding')).toBe('0 16px');
    expect(ruleValue(resting, 'border-radius')).toBe('var(--md-sys-shape-corner-full)');
    expect(ruleValue(resting, 'background')).toBe('transparent');
    expect(ruleValue(resting, 'border')).toBe('1px solid var(--md-sys-color-outline)');
    expect(ruleValue(resting, 'color')).toBe('var(--md-sys-color-on-surface-variant)');
    expect(ruleValue(resting, 'font-size')).toBe('var(--md-sys-typescale-label-large-size)');
  });

  it('selects with a tonal container rather than the accent, and does not reflow the row', () => {
    const active = cssBlock('.filter-pill.active');

    expect(ruleValue(active, 'background')).toBe('var(--md-sys-color-secondary-container)');
    expect(ruleValue(active, 'color')).toBe('var(--md-sys-color-on-secondary-container)');
    // Not `border: 0` — dropping the hairline would move every chip in the row
    // by two pixels the moment one of them is picked.
    expect(ruleValue(active, 'border-color')).toBe('transparent');
  });

  it('keeps focus visible on the chip itself', () => {
    const focus = cssBlock('.filter-pill:focus-visible');
    expect(ruleValue(focus, 'outline')).toBe('2px solid var(--md-sys-color-primary)');
    expect(ruleValue(focus, 'outline-offset')).toBe('2px');
  });

  // Regression guard for #1795: hover backgrounds should not blow out text
  // contrast in either theme. The original bug used a near-white wash that
  // dropped contrast to ~1.87 in dark mode, well below WCAG AA.
  it('keeps hover labels readable in light and dark themes', () => {
    const hover = cssBlock('button.filter-pill:hover:not(:disabled)');
    const activeHover = cssBlock('button.filter-pill.active:hover:not(:disabled)');

    expect(ruleValue(hover, 'background')).toBe('var(--ripple)');
    expect(ruleValue(hover, 'color')).toBe('var(--md-sys-color-on-surface-variant)');
    expect(ruleValue(activeHover, 'color')).toBe('var(--md-sys-color-on-secondary-container)');

    for (const [name, vars] of themes) {
      // An unselected chip has no fill of its own, so its hover state layer
      // composites over whatever it sits on. `surface` is the page and
      // `surface-container-low` is a card; chip rows appear on both.
      for (const behindToken of [
        '--md-sys-color-surface',
        '--md-sys-color-surface-container-low',
      ]) {
        const behind = hexToRgb(vars[behindToken]!);
        expect(
          contrastRatio(
            toRgb(ruleValue(hover, 'color'), vars, behind),
            toRgb(ruleValue(hover, 'background'), vars, behind),
          ),
          `unselected chip hover over ${behindToken} in ${name}`,
        ).toBeGreaterThanOrEqual(4.5);
      }

      expect(
        contrastRatio(
          toRgb(ruleValue(activeHover, 'color'), vars),
          toRgb(ruleValue(activeHover, 'background'), vars),
        ),
        `selected chip hover in ${name}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the count legible against its chip in both states', () => {
    const countHover = cssBlock(
      'button.filter-pill:hover:not(:disabled) .filter-pill-count,\n.filter-pill.active .filter-pill-count',
    );
    expect(ruleValue(countHover, 'color')).toBe('currentColor');
    expect(ruleValue(countHover, 'opacity')).toBe('0.9');
  });
});
