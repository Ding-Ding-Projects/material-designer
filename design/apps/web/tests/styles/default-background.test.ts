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
    expect(root).toContain('--bg: #fff;');
    expect(root).toContain('--bg-app: #fff;');
  });

  it('flips the background through the role, not a second definition', () => {
    const dark = cssBlock('[data-theme="dark"]');

    expect(dark).toContain('--md-sys-color-surface: #1A120F;');
    // The mapping layer must not restate `--bg` for dark; if it does, the role
    // has stopped being the single source of the app background.
    expect(dark).not.toContain('--bg:');
    expect(dark).not.toContain('--bg-app:');
    expect(dark).toContain('--bg: #202020;');
    expect(dark).toContain('--bg-app: #202020;');
  });

  // This spec was upstream's, named "prefers platform UI fonts over optional
  // local app fonts". Its premise moved, so it is restated rather than deleted.
  //
  // Upstream's rule was that the stack must not open with a family the product
  // does not ship, and the family it named was `Inter`. The reason was
  // AVAILABILITY, not native appearance: `Inter` is vendored nowhere in this
  // repository, so leading with it makes the interface look one way on a
  // machine that happens to have it and another on a machine that does not,
  // with nothing reporting the difference.
  //
  // `Roboto Flex` now leads, and that does not violate the rule — it satisfies
  // it more strictly. The face is bundled under `public/fonts/` and served from
  // the product's own origin, so it is present by construction, which is more
  // deterministic than `-apple-system` resolving to a different face on every
  // OS version. Material Design 3 also names it as the plain face, and this
  // product deliberately does not chase a native look; it draws its own window
  // chrome.
  //
  // So the invariant is now stated directly, and checked against the font files
  // actually on disk rather than a hardcoded family name: only a face this
  // repository really ships may lead the stack.
  it('leads the stack only with a face the repository actually bundles', () => {
    const root = cssBlock(':root');
    const sans = /--sans:\s*([^;]+);/.exec(root)?.[1];
    const plain = /--md-ref-typeface-plain:\s*([^;]+);/.exec(root)?.[1];

    expect(sans).toBe('var(--md-ref-typeface-plain)');
    expect(plain).toBeDefined();

    // Every family named by a local `@font-face`, read from the expanded
    // cascade. This is the set of faces the product guarantees.
    const bundled = new Set(
      [...indexCss.matchAll(/@font-face\s*\{([^}]*)\}/g)]
        .filter((face) => /src:\s*url\(['"]?\/fonts\//.test(face[1] ?? ''))
        .map((face) => /font-family:\s*'([^']+)'/.exec(face[1] ?? '')?.[1])
        .filter((name): name is string => Boolean(name)),
    );
    expect(bundled.size).toBeGreaterThan(0);

    const leader = /^\s*'([^']+)'/.exec(plain ?? '')?.[1];
    expect(
      leader && bundled.has(leader),
      `--md-ref-typeface-plain leads with '${leader}', which no @font-face in the cascade serves ` +
        `from /fonts/. Only a bundled face may lead; an optional local one makes the interface ` +
        `depend on what happens to be installed. Bundled: ${[...bundled].join(', ')}`,
    ).toBe(true);

    // Unchanged from upstream, and still the point: `Inter` is not vendored
    // here, so it must never appear in the product's own UI stack.
    expect(plain).not.toContain("'Inter'");

    // The platform chain survives the prepend, in upstream's order. On Windows
    // this contiguous run is what supplies CJK behind the UI face.
    expect(plain).toContain("'Segoe UI'");
    expect(plain).toMatch(/'Segoe UI', 'Microsoft YaHei UI', 'Noto Sans'/);

    // And it still ends on a generic family, so an exotic script has somewhere
    // to land even when none of the named faces is installed.
    expect(plain?.trim().endsWith('sans-serif')).toBe(true);
    expect(sans).toBeDefined();
    expect(sans).toContain('"Albert Sans"');
    expect(sans).not.toContain("'Inter'");
    expect(sans).toMatch(/"Albert Sans", "PingFang SC", "Microsoft YaHei"/);
  });
});
