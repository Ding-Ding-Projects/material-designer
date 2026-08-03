import { describe, expect, it } from 'vitest';
import { readExpandedIndexCss } from '../helpers/read-expanded-css';

const indexCss = readExpandedIndexCss();

// The token layer is two sheets since the Material Design 3 port:
// `md3-tokens.css` declares the `--md-sys-*` roles and `tokens.css` maps the
// product's own names onto them. Both open a `:root` and a `[data-theme="dark"]`
// block, so a first-match lookup would see one sheet and miss the other.
// Concatenate every block for the selector instead.
function cssBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...indexCss.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g'))];
  if (matches.length === 0) throw new Error(`Missing CSS block for ${selector}`);
  return matches.map((match) => match[1] ?? '').join('\n');
}

describe('default app background colors', () => {
  it('takes the light app background from the M3 surface role', () => {
    const root = cssBlock(':root');

    expect(root).toContain('--bg: var(--md-sys-color-surface);');
    expect(root).toContain('--bg-app: var(--md-sys-color-surface);');
    expect(root).toContain('--md-sys-color-surface: #FFF8F6;');
  });

  it('flips the background through the role, not a second definition', () => {
    const dark = cssBlock('[data-theme="dark"]');

    expect(dark).toContain('--md-sys-color-surface: #1A120F;');
    // The mapping layer must not restate `--bg` for dark; if it does, the role
    // has stopped being the single source of the app background.
    expect(dark).not.toContain('--bg:');
    expect(dark).not.toContain('--bg-app:');
  });

  it('prefers platform UI fonts over optional local app fonts', () => {
    const root = cssBlock(':root');
    const sans = /--sans:\s*([^;]+);/.exec(root)?.[1];
    const plain = /--md-ref-typeface-plain:\s*([^;]+);/.exec(root)?.[1];

    expect(sans).toBe('var(--md-ref-typeface-plain)');
    expect(plain).toBeDefined();
    expect(plain).toContain("'Segoe UI'");
    expect(plain).not.toContain("'Inter'");
    expect(plain).toMatch(/'Segoe UI', 'Microsoft YaHei UI', 'Noto Sans'/);
  });
});
