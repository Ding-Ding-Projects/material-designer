import { describe, expect, it } from 'vitest';
import { readExpandedIndexCss } from '../helpers/read-expanded-css';

const indexCss = readExpandedIndexCss();

function cssDeclarations(css: string, selector: string): string {
  const blocks: string[] = [];
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
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

function zIndex(css: string, selector: string): number {
  const value = Number.parseInt(ruleValue(cssDeclarations(css, selector), 'z-index'), 10);
  if (!Number.isFinite(value)) throw new Error(`Expected numeric z-index for ${selector}`);
  return value;
}

describe('ProjectDesignSystemPicker fullscreen styles', () => {
  it('keeps fullscreen design-system previews above app modal chrome', () => {
    const fullscreenLayer = zIndex(indexCss, '.project-ds-picker-fullscreen');

    expect(fullscreenLayer).toBeGreaterThan(zIndex(indexCss, '.ds-modal-backdrop'));
  });
});

// The `.ds-picker-*` family is the New project panel's picker — the trigger
// and the option rows for platforms, prompt templates, design systems, models
// and MCP clients. Every one of those titles is a name the user chose or a
// vendor supplied, so every one of them can be longer than the row.
describe('ds-picker titles truncate where they are read', () => {
  it('hands the ellipsis to a real element instead of an anonymous flex item', () => {
    // Both title boxes are flex containers so a `+N` pill or a status badge
    // can sit beside the name. `text-overflow` applies only to a block
    // container, so declared on the box it was inert and the name was clipped
    // mid-glyph with nothing to say it had been cut. The text now lives in a
    // span of its own, which is what the property can actually reach.
    const titleText = cssDeclarations(indexCss, '.ds-picker-title-text');
    const itemTitleText = cssDeclarations(indexCss, '.ds-picker-item-title-text');

    for (const declarations of [titleText, itemTitleText]) {
      expect(ruleValue(declarations, 'min-width')).toBe('0');
      expect(ruleValue(declarations, 'overflow')).toBe('hidden');
      expect(ruleValue(declarations, 'text-overflow')).toBe('ellipsis');
      expect(ruleValue(declarations, 'white-space')).toBe('nowrap');
    }
  });

  it('never lets the count pill or the status badge be the part that truncates', () => {
    // The pill counts what the name had to leave out and the badge is a
    // status word; both stop meaning anything the moment they are half
    // clipped, so the name is what yields room.
    expect(ruleValue(cssDeclarations(indexCss, '.ds-picker-extra-pill'), 'flex')).toBe('0 0 auto');
    expect(ruleValue(cssDeclarations(indexCss, '.ds-picker-item-badge'), 'flex')).toBe('0 0 auto');
  });
});
