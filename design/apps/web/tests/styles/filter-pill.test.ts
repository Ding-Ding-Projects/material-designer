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

function luminance([r, g, b]: [number, number, number]): number {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(foreground: string, background: string): number {
  const first = luminance(hexToRgb(foreground));
  const second = luminance(hexToRgb(background));
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('filter pill hover contrast', () => {
  it('keeps hover labels readable in light and dark themes', () => {
    const rootVars = tokenVars(':root');
    const darkVars = { ...rootVars, ...tokenVars('[data-theme="dark"]') };
    const hover = cssBlock('button.filter-pill:hover:not(:disabled)');
    const activeHover = cssBlock('button.filter-pill.active:hover:not(:disabled)');
    const countHover = cssBlock('button.filter-pill:hover:not(:disabled) .filter-pill-count,\n.filter-pill.active .filter-pill-count');

    for (const block of [hover, activeHover]) {
      expect(ruleValue(block, 'background')).toBe('var(--bg-muted)');
      expect(ruleValue(block, 'color')).toBe('var(--text)');
      expect(contrastRatio(
        resolveVar(ruleValue(block, 'color'), rootVars),
        resolveVar(ruleValue(block, 'background'), rootVars),
      )).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(
        resolveVar(ruleValue(block, 'color'), darkVars),
        resolveVar(ruleValue(block, 'background'), darkVars),
      )).toBeGreaterThanOrEqual(4.5);
    }

    expect(ruleValue(countHover, 'color')).toBe('currentColor');
    expect(ruleValue(countHover, 'opacity')).toBe('0.9');
  });
});
