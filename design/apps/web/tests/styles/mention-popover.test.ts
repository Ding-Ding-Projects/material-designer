import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mentionHomeCss = readFileSync(
  new URL('../../src/styles/workspace/mention-home.css', import.meta.url),
  'utf8',
);

function cssBlock(selector: string): string {
  const blocks: string[] = [];
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  const cssWithoutComments = mentionHomeCss.replace(/\/\*[\s\S]*?\*\//g, '');
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(cssWithoutComments)) !== null) {
    const selectors = (match[1] ?? '').split(',').map((item) => item.trim());
    if (selectors.includes(selector)) blocks.push(match[2] ?? '');
  }
  if (blocks.length === 0) throw new Error(`Missing CSS block for ${selector}`);
  return blocks.join('\n');
}

function ruleValue(block: string, property: string): string {
  const match = new RegExp(`(?:^|[;\\n])\\s*${property}:\\s*([^;]+);`).exec(block);
  if (!match) throw new Error(`Missing CSS property ${property}`);
  return match[1]!.trim();
}

describe('mention popover styles', () => {
  it('keeps the panel height stable while tabs swap between long and short results', () => {
    const popover = cssBlock('.mention-popover');
    const results = cssBlock('.mention-results');

    expect(ruleValue(popover, 'height')).toBe('var(--cfl-max-h, 460px)');
    expect(ruleValue(popover, 'max-height')).toBe('var(--cfl-max-h, 460px)');
    expect(ruleValue(results, 'flex')).toBe('1 1 auto');
    expect(ruleValue(results, 'overflow-y')).toBe('auto');
  });

  it('scrolls category tabs on one line inside the panel without clipping labels', () => {
    const tabs = cssBlock('.mention-tabs');
    const tab = cssBlock('.mention-tab');
    const tabInStrip = cssBlock('.mention-tabs > .mention-tab');

    // The strip keeps every filter tab on a single line and scrolls the
    // overflow horizontally (scrollbar hidden) rather than wrapping to a
    // second row.
    expect(ruleValue(tabs, 'flex-wrap')).toBe('nowrap');
    expect(ruleValue(tabs, 'overflow-x')).toBe('auto');
    expect(ruleValue(tabs, 'scrollbar-width')).toBe('none');
    // The no-clipping half of the contract: pills hold their natural width so
    // the strip scrolls instead of ellipsizing the labels.
    expect(ruleValue(tabInStrip, 'flex')).toBe('0 0 auto');
    expect(ruleValue(tab, 'flex')).toBe('0 0 auto');
    expect(ruleValue(tab, 'white-space')).toBe('nowrap');
  });

  it('keeps result rows aligned with truncated text and stable meta badges', () => {
    const item = cssBlock('.mention-item');
    const icon = cssBlock('.mention-item > svg');
    const body = cssBlock('.mention-item-body');
    const description = cssBlock('.mention-meta--desc');
    const kind = cssBlock('.mention-item-kind');

    expect(ruleValue(item, 'display')).toBe('grid');
    expect(ruleValue(item, 'grid-template-columns')).toBe('24px minmax(0, 1fr) max-content');
    expect(ruleValue(icon, 'width')).toBe('24px');
    expect(ruleValue(body, 'align-items')).toBe('stretch');
    expect(ruleValue(body, 'overflow')).toBe('hidden');
    expect(ruleValue(body, 'text-align')).toBe('left');
    expect(ruleValue(description, 'align-self')).toBe('stretch');
    expect(ruleValue(description, 'text-align')).toBe('left');
    expect(ruleValue(description, 'white-space')).toBe('nowrap');
    expect(ruleValue(description, 'text-overflow')).toBe('ellipsis');
    expect(ruleValue(kind, 'border-radius')).toBe('var(--radius-pill)');
    expect(ruleValue(kind, 'white-space')).toBe('nowrap');
  });
});

// The slash-command popover is the mention popover's sibling: same composer,
// same CaretFloatingLayer, same `--cfl-max-h` budget. The mention popover
// survives that budget because `.mention-results` scrolls inside it. The slash
// popover had nothing to scroll — the popover IS the `listbox` and each
// command IS an `option`, so the rows are its direct children — and with
// `overflow: hidden` the cap became a silent delete: past `--cfl-max-h` the
// remaining commands were painted nowhere, with no scrollbar to say so and no
// keyboard route to them either.
describe('slash-command popover styles', () => {
  const libraryCss = readFileSync(
    new URL('../../src/styles/viewer/library.css', import.meta.url),
    'utf8',
  );

  function libraryBlock(selector: string): string {
    const blocks: string[] = [];
    const rulePattern = /([^{}]+)\{([^}]*)\}/g;
    const withoutComments = libraryCss.replace(/\/\*[\s\S]*?\*\//g, '');
    let match: RegExpExecArray | null;
    while ((match = rulePattern.exec(withoutComments)) !== null) {
      const selectors = (match[1] ?? '').split(',').map((item) => item.trim());
      if (selectors.includes(selector)) blocks.push(match[2] ?? '');
    }
    if (blocks.length === 0) throw new Error(`Missing CSS block for ${selector}`);
    return blocks.join('\n');
  }

  it('scrolls the command list inside the caret budget instead of clipping it', () => {
    const popover = libraryBlock('.slash-popover');

    expect(ruleValue(popover, 'max-height')).toBe('var(--cfl-max-h, 320px)');
    // `hidden auto`, not `hidden`: the horizontal clip still stops a long
    // description widening the popover, and both axes being non-`visible` is
    // what keeps the border radius clipping its corners.
    expect(ruleValue(popover, 'overflow')).toBe('hidden auto');
  });

  it('stops the rows squashing themselves instead of overflowing', () => {
    // A flex item shrinks by default, so a scrolling flex column with
    // shrinkable rows produces shorter rows rather than a scrollbar.
    expect(ruleValue(libraryBlock('.slash-item'), 'flex')).toBe('0 0 auto');
  });

  it('keeps the head readable once the list is scrolled under it', () => {
    const popover = libraryBlock('.slash-popover');
    const head = libraryBlock('.slash-popover-head');

    expect(ruleValue(head, 'position')).toBe('sticky');
    expect(ruleValue(head, 'top')).toBe('0');
    // Opaque, or the rows would pass through the head rather than behind it.
    expect(ruleValue(head, 'background')).toBe('var(--bg-panel)');
    // The scrollport is the padding box, so a top padding on the popover
    // would leave a band above the sticky head for rows to scroll through.
    // The head carries that space itself instead.
    expect(ruleValue(popover, 'padding')).toBe('0 5px 5px');
  });
});
