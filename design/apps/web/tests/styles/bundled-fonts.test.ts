// The four faces the application ships, and the promise that it ships them.
//
// The web stylesheet used to open with an `@import` of a font CDN. That one
// line was fixed when Cairo was bundled; these specs are what stops it coming
// back in three new places, because Roboto Flex, Roboto Mono and Material
// Symbols Rounded were each named in the token sheet long before any of them
// existed on disk — a stack whose first family nobody serves fails silently
// and beautifully, in the fallback face, on every machine.
//
// Every expectation quotes the literal text in the source rather than a
// computed equivalent, for the reason the density specs beside this file give:
// a spec asserting a resolved value where the file says `var(--x, y)` passes
// for the wrong reason and fails the moment someone changes the fallback.

import { readFileSync, statSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { MATERIAL_SYMBOL_FOR_REMIX_ICON } from '../../src/components/MaterialSymbol';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const indexCss = read('../../src/index.css');
const robotoFlex = read('../../src/styles/roboto-flex.css');
const robotoMono = read('../../src/styles/roboto-mono.css');
const materialSymbols = read('../../src/styles/material-symbols.css');
const cairo = read('../../src/styles/cairo.css');
const tokens = read('../../src/styles/md3-tokens.css');
const symbolModule = read('../../src/components/MaterialSymbol.module.css');

const FONT_SHEETS = {
  'roboto-flex.css': robotoFlex,
  'roboto-mono.css': robotoMono,
  'material-symbols.css': materialSymbols,
  'cairo.css': cairo,
} as const;

/** Every `src: url('…')` a sheet declares. */
function fontUrls(sheet: string): string[] {
  return Array.from(sheet.matchAll(/src:\s*url\((['"])([^'"]+)\1\)/g)).map((m) => m[2]!);
}

describe('the bundled faces are local assets', () => {
  it('declares no remote origin anywhere in a font sheet', () => {
    for (const [name, sheet] of Object.entries(FONT_SHEETS)) {
      // Prose in these files names github.com and the licences; what must not
      // appear is a remote origin in a place the browser would fetch from.
      const withoutComments = sheet.replace(/\/\*[\s\S]*?\*\//g, '');
      expect(withoutComments, `${name} declares a remote URL`).not.toMatch(/https?:\/\//);
      expect(withoutComments, `${name} imports from a remote origin`).not.toMatch(
        /@import\s*(url\()?['"]?https?:\/\//,
      );
    }
  });

  it('points every @font-face at a file that is really on disk', () => {
    for (const [name, sheet] of Object.entries(FONT_SHEETS)) {
      const urls = fontUrls(sheet);
      expect(urls.length, `${name} declares no font file`).toBeGreaterThan(0);
      for (const url of urls) {
        expect(url, `${name} serves ${url} from somewhere other than /fonts/`).toMatch(
          /^\/fonts\/[a-z-]+\/[a-z0-9-]+\.woff2$/,
        );
        const onDisk = new URL(`../../public${url}`, import.meta.url);
        // A woff2 begins with the ASCII signature `wOF2`. Checking it is the
        // difference between "a file exists at that path" and "a font does" —
        // a renamed placeholder passes the first and fails this.
        const head = readFileSync(onDisk).subarray(0, 4).toString('latin1');
        expect(head, `${url} is not a woff2`).toBe('wOF2');
        expect(statSync(onDisk).size, `${url} is too small to be a real face`).toBeGreaterThan(
          4096,
        );
      }
    }
  });

  it('imports all four sheets from the cascade entrypoint, and adds no selector', () => {
    for (const sheet of Object.keys(FONT_SHEETS)) {
      expect(indexCss).toContain(`@import './styles/${sheet}';`);
    }
    // index.css is an import-only entrypoint. Anything that is not an @import,
    // a comment or blank would be a selector arriving where none may.
    const stray = indexCss
      .split('\n')
      .filter((line) => line.trim() && !line.trim().startsWith('@import') && !line.trim().startsWith('/*'));
    expect(stray).toEqual([]);
  });
});

describe('the variable axes each face exposes', () => {
  it('gives Roboto Flex the full weight range on every subset', () => {
    const faces = robotoFlex.match(/@font-face\s*\{[^}]*\}/g) ?? [];
    expect(faces.length).toBe(6);
    for (const face of faces) {
      expect(face).toContain("font-family: 'Roboto Flex';");
      expect(face).toContain('font-weight: 100 1000;');
      expect(face).toContain('font-display: swap;');
      // The optical-size axis has no CSS descriptor — the browser drives it
      // from the rendered size under the default `font-optical-sizing: auto`,
      // which is why nothing here names it and why the served file must keep it.
      expect(face).toMatch(/unicode-range: U\+/);
    }
  });

  it('gives Roboto Mono the full weight range on every subset', () => {
    const faces = robotoMono.match(/@font-face\s*\{[^}]*\}/g) ?? [];
    expect(faces.length).toBe(6);
    for (const face of faces) {
      expect(face).toContain("font-family: 'Roboto Mono';");
      expect(face).toContain('font-weight: 100 700;');
      expect(face).toMatch(/unicode-range: U\+/);
    }
  });

  it('declares the icon face once, and never with font-display: swap', () => {
    const faces = materialSymbols.match(/@font-face\s*\{[^}]*\}/g) ?? [];
    expect(faces.length).toBe(1);
    expect(faces[0]).toContain("font-family: 'Material Symbols Rounded';");
    // An icon font must not swap. The fallback has no glyph at these
    // codepoints, so a swap period paints the ligature's own name as literal
    // text — "keyboard_arrow_down" where a chevron belongs.
    expect(faces[0]).not.toContain('font-display');
    // No unicode-range either: every glyph is in the Private Use Area, so the
    // one file carries the whole set.
    expect(faces[0]).not.toContain('unicode-range');
  });
});

describe('the fallback stacks stay safe for the twenty locales', () => {
  const stack = (name: string) =>
    tokens.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1] ?? '';

  const plain = stack('--md-ref-typeface-plain');
  const mono = stack('--md-ref-typeface-mono');

  it('leads with the bundled face in both stacks', () => {
    // Why a bundled face is allowed to lead where an unbundled one is not is
    // argued at the declaration itself and in `default-background.test.ts`,
    // which is the spec that owns that rule.
    expect(plain.startsWith("'Roboto Flex', -apple-system,")).toBe(true);
    expect(mono.startsWith("'Roboto Mono', ui-monospace,")).toBe(true);
  });

  it("keeps upstream's platform chain contiguous behind the prepended face", () => {
    // The only edits to upstream's chain are a prepend and an append. Nothing
    // in the middle was reordered, which is what keeps the diff reviewable.
    expect(plain).toContain(
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei UI', 'Noto Sans', Roboto, 'Helvetica Neue', Arial,",
    );
  });

  it('carries a face for every script Roboto has no glyph for', () => {
    // Nine of the twenty shipped locales are written in a script neither
    // Roboto face covers. Each needs at least one named family, or bilingual
    // mode renders 廣東話 as tofu beside perfectly set English.
    const required: Array<[string, string[]]> = [
      ['Arabic (ar, fa)', ['Cairo', 'Segoe UI Arabic', 'Noto Sans Arabic']],
      ['Thai (th)', ['Leelawadee UI', 'Noto Sans Thai']],
      ['Simplified Chinese (zh-CN)', ['Microsoft YaHei UI', 'PingFang SC', 'Noto Sans CJK SC']],
      ['Traditional Chinese (zh-TW, zh-HK)', ['Microsoft JhengHei UI', 'PingFang TC', 'Noto Sans CJK TC']],
      ['Japanese (ja)', ['Yu Gothic UI', 'Hiragino Sans', 'Noto Sans CJK JP']],
      ['Korean (ko)', ['Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans CJK KR']],
    ];
    for (const [script, families] of required) {
      for (const family of families) {
        expect(plain, `${script} lost ${family} from the plain stack`).toContain(`'${family}'`);
      }
    }
    // Technical text needs the same protection: a path or a commit subject can
    // hold CJK, and the generic `monospace` keyword draws a box for it.
    for (const family of ['Microsoft YaHei UI', 'PingFang SC', 'Yu Gothic UI', 'Malgun Gothic']) {
      expect(mono, `the mono stack lost ${family}`).toContain(`'${family}'`);
    }
  });

  it('ends both stacks on a generic family', () => {
    expect(plain.trim().endsWith('sans-serif')).toBe(true);
    expect(mono.trim().endsWith('monospace')).toBe(true);
  });

  it('gives the icon face no fallback at all', () => {
    // A second family here could only supply the ligature's own name as
    // literal text. A missing glyph is better than a wrong word.
    expect(stack('--md-ref-typeface-icon')).toBe("'Material Symbols Rounded'");
  });
});

describe('the symbol component draws through the token, not a literal', () => {
  it('reads the icon typeface token and turns ligatures on', () => {
    expect(symbolModule).toContain('font-family: var(--md-ref-typeface-icon);');
    // Without `liga` the element renders its own ligature name as text.
    expect(symbolModule).toContain("font-feature-settings: 'liga';");
  });

  it('drives the FILL axis from both states, and leaves opsz alone', () => {
    expect(symbolModule).toContain("font-variation-settings: 'FILL' 0;");
    expect(symbolModule).toContain("font-variation-settings: 'FILL' 1;");

    // Naming `opsz` in `font-variation-settings` would pin the optical-size
    // axis and take it out of the browser's own optical sizing, which is the
    // whole reason that axis was left live in the bundled file.
    //
    // The assertion is scoped to the DECLARATIONS, not the file. Searching the
    // raw text for the word failed against this very stylesheet, whose comment
    // explains the axis by name — the comment is doing useful work, so the
    // imprecise assertion is what had to change.
    const settings = [...symbolModule.matchAll(/font-variation-settings:\s*([^;]+);/g)].map(
      (match) => match[1]!,
    );
    expect(settings.length).toBeGreaterThan(0);
    for (const value of settings) {
      expect(value, `a font-variation-settings declaration pins opsz: ${value}`).not.toContain(
        'opsz',
      );
    }
    // Nor may it be pinned through the shorthand property.
    const withoutComments = symbolModule.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(withoutComments).not.toContain('font-optical-sizing');
  });

  it('uses the contract easing and stops for reduced motion', () => {
    expect(symbolModule).toContain(
      'transition: font-variation-settings 140ms var(--md-sys-motion-emphasized);',
    );
    expect(symbolModule).toContain('@media (prefers-reduced-motion: reduce)');
  });
});

describe('the icon migration', () => {
  const MIGRATED = [
    'FileViewer',
    'PreviewDrawOverlay',
    'AvatarMenu',
    'DesignBrowserPanel',
    'WindowTitleBar',
    'AppChromeHeader',
  ] as const;

  const sources = Object.fromEntries(
    MIGRATED.map((name) => [name, read(`../../src/components/${name}.tsx`)]),
  ) as Record<(typeof MIGRATED)[number], string>;

  it('left no migrated component on the incumbent icon font', () => {
    for (const name of MIGRATED) {
      expect(sources[name], `${name} still imports RemixIcon`).not.toContain(
        "from './RemixIcon'",
      );
      expect(sources[name], `${name} still renders a RemixIcon`).not.toContain('<RemixIcon');
    }
  });

  it('keeps the brand grid on the incumbent font, because Material Symbols has no brand marks', () => {
    // This is the one component that did NOT migrate, and it is not an
    // oversight: Material Symbols carries no logo for X, LinkedIn, Facebook,
    // Reddit, Telegram, WhatsApp, Weibo, LINE or Instagram, and inventing one
    // is a trademark problem rather than an icon problem.
    const social = read('../../src/components/SocialShareGrid.tsx');
    expect(social).toContain("from './RemixIcon'");
  });

  it('renders only names the mapping vouches for', () => {
    const vouched = new Set<string>(Object.values(MATERIAL_SYMBOL_FOR_REMIX_ICON));
    const used = new Set<string>();
    for (const name of MIGRATED) {
      const lines = sources[name].split('\n');
      lines.forEach((line, i) => {
        const opensHere = line.includes('MaterialSymbol');
        const continues =
          !opensHere && line.includes('name=') && lines[i - 1]?.trimEnd().endsWith('<MaterialSymbol');
        if (!opensHere && !continues) return;
        for (const m of line.matchAll(/name=\{?(['"])([a-z0-9_]+)\1/g)) used.add(m[2]!);
        const braced = line.match(/name=\{([^}]*)\}/);
        if (braced) for (const m of braced[1]!.matchAll(/(['"])([a-z0-9_]+)\1/g)) used.add(m[2]!);
      });
    }
    // The helpers that pick an icon by viewport or provider return literals of
    // their own; they are typed `MaterialSymbolName`, so the compiler covers
    // them, but list them here so the count below means what it says.
    //
    // 'mobile', not 'smartphone': the two viewport switchers were moved onto
    // the table's own value (`ac37ac7`) after `MaterialSymbolName` refused
    // the literal 'smartphone' — the table publishes 'mobile' for that glyph,
    // and typing against the font rather than the table is exactly the drift
    // that commit closed. This list has to keep naming what the source now
    // says, not what it used to.
    for (const name of [
      'tablet',
      'mobile',
      'computer',
      'article',
      'cloud_upload',
      'check_box_outline_blank',
      'edit',
      'title',
    ]) {
      used.add(name);
    }
    expect(used.size).toBeGreaterThan(40);
    for (const name of used) {
      expect(vouched.has(name), `${name} is rendered but is not in the mapping`).toBe(true);
    }
  });

  it('maps only to names shaped like a Material Symbol', () => {
    // The published names are lower snake case without exception. This will not
    // catch a plausible-but-absent name — only the font can, and the mapping
    // was checked against the codepoints list google/material-design-icons
    // publishes with it — but it does catch a remix name left behind, which is
    // the mistake a bulk rewrite actually makes.
    for (const [remix, symbol] of Object.entries(MATERIAL_SYMBOL_FOR_REMIX_ICON)) {
      expect(symbol, `${remix} maps to something that is not a symbol name`).toMatch(
        /^[a-z][a-z0-9_]*$/,
      );
      expect(symbol, `${remix} maps to a name that still looks like a remix icon`).not.toContain(
        '-',
      );
    }
  });
});
