// The pinned "scroll up to explore more templates" hint must not be drawn on
// top of anything.
//
// Both the hint and its collapse counterpart are `position: fixed`, so they
// are placed against the viewport — which still includes the 28px status bar
// and knows nothing about where the entry view's scroll column ends. Nothing
// reserved that band, so whatever was scrolled to the bottom of the column
// was painted underneath the pill: in bilingual mode at the shell's 900px
// minimum, the hint's own text landed on the template card row.
//
// The fix reserves the band by stopping the scroll column above it, and
// derives the reservation from the status bar's own height token rather than
// from a second copy of `28px`. These assertions pin all three halves of that
// arrangement together, because the bug is exactly what happens when one of
// them drifts from the others.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function sheet(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );
}

const tokensCss = sheet('../../src/styles/md3-tokens.css');
const statusBarCss = sheet('../../src/components/AppStatusBar.module.css');
const pluginsHomeCss = sheet('../../src/styles/home/plugins-home.css');

function block(css: string, selector: string): string {
  const blocks: string[] = [];
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(css)) !== null) {
    const selectors = (match[1] ?? '').split(',').map((item) => item.trim());
    if (selectors.includes(selector)) blocks.push(match[2] ?? '');
  }
  if (blocks.length === 0) throw new Error(`Missing CSS block for ${selector}`);
  return blocks.join('\n');
}

function declaration(source: string, property: string): string {
  const matches = [
    ...source.matchAll(new RegExp(`(?:^|[;{\\n])\\s*${property}:\\s*([^;]+);`, 'g')),
  ];
  const match = matches.at(-1);
  if (!match) throw new Error(`Missing CSS property ${property}`);
  return match[1]!.trim().replace(/\s+/g, ' ');
}

function pixels(value: string): number {
  const match = /^(-?[\d.]+)px$/.exec(value.trim());
  if (!match) throw new Error(`Expected a px length, got "${value}"`);
  return Number(match[1]);
}

describe('the status bar height is a token, stated once', () => {
  it('is published for anything pinned to the bottom of the window', () => {
    expect(pixels(declaration(block(tokensCss, ':root'), '--od-status-bar-height'))).toBe(28);
  });

  it('is what the status bar itself is sized by', () => {
    // If the strip kept its own literal, the token could drift from the
    // height it is supposed to describe and every clearance derived from it
    // would be quietly wrong.
    expect(declaration(block(statusBarCss, '.bar'), 'height')).toBe(
      'var(--od-status-bar-height, 28px)',
    );
  });
});

describe('the pinned templates hint has a reserved band to sit in', () => {
  const reserved = block(pluginsHomeCss, '.entry-main--scroll:has(.home-templates-reveal)');

  it('stops the entry scroll column above the pill', () => {
    // Anything other than a real reduction in the column's height leaves the
    // pill floating over scrolled content again — an end-of-document padding
    // would not, because content passes under a fixed element mid-scroll.
    expect(declaration(reserved, 'margin-bottom')).toBe(
      'max( 0px, calc(var(--home-templates-pill-band) - var(--od-status-bar-height, 28px)) )',
    );
  });

  it('reserves more than the pill actually occupies', () => {
    const band = pixels(declaration(reserved, '--home-templates-pill-band'));
    const hintOffset = pixels(
      declaration(block(pluginsHomeCss, 'button.home-templates-reveal__hint'), 'bottom'),
    );
    const collapseOffset = pixels(
      declaration(block(pluginsHomeCss, 'button.home-templates-reveal__collapse'), 'bottom'),
    );

    // Both pills sit at the same offset, and the band has to clear that
    // offset plus the pill's own height (~30px) and the arrow's 4px bob.
    expect(collapseOffset).toBe(hintOffset);
    expect(band).toBeGreaterThanOrEqual(hintOffset + 34);
  });

  it('reserves the band for the expanded gallery as well as the collapsed hint', () => {
    // The selector matches the wrapper in both states on purpose: the
    // collapse pill is pinned in the same slot and would otherwise be drawn
    // over the last row of the gallery it belongs to.
    expect(pluginsHomeCss).toContain('.entry-main--scroll:has(.home-templates-reveal)');
    expect(pluginsHomeCss).not.toContain(
      '.entry-main--scroll:has(.home-templates-reveal:not(.is-revealed))',
    );
  });
});
