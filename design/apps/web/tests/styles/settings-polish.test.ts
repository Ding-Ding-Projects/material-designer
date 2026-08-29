import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { readExpandedIndexCss } from '../helpers/read-expanded-css';

const indexCss = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');
const expandedIndexCss = readExpandedIndexCss();
const mentionHomeCss = readFileSync(new URL('../../src/styles/workspace/mention-home.css', import.meta.url), 'utf8');
const settingsPageCss = readFileSync(
  new URL('../../src/components/settings/SettingsPage.module.css', import.meta.url),
  'utf8',
);
const shellCss = readFileSync(new URL('../../src/styles/shell.css', import.meta.url), 'utf8');
const artifactsCss = readFileSync(new URL('../../src/styles/workspace/artifacts.css', import.meta.url), 'utf8');

function cssBlock(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!match) throw new Error(`Missing CSS block for ${selector}`);
  return match[1] ?? '';
}

function ruleValue(block: string, property: string): string {
  // Comments stripped first: `(?:^|;)\s*` only skips whitespace before the
  // property, and several rules in this file document *why* a value is what
  // it is in a comment sitting directly above it — the exact position that
  // whitespace-only lookbehind cannot cross. Without this, a property is
  // "missing" precisely when it is the most explained one in the block.
  const uncommented = block.replace(/\/\*[\s\S]*?\*\//g, '');
  const match = new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+);`).exec(uncommented);
  if (!match) throw new Error(`Missing CSS property ${property}`);
  return match[1]!.trim();
}

describe('settings polish CSS', () => {
  it('keeps the global stylesheet as an import manifest after the CSS split', () => {
    const nonImportLines = indexCss
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('@import'));

    expect(nonImportLines).toEqual([]);
  });

  it('paints selected select options as a full-row state, not text-only emphasis', () => {
    const option = cssBlock(expandedIndexCss, '.od-select-option');
    const selected = cssBlock(expandedIndexCss, '.od-select-option.selected');
    const selectedHover = cssBlock(expandedIndexCss, '.od-select-option.selected:hover:not(:disabled),\n.od-select-option.selected.active:not(:disabled)');

    expect(ruleValue(option, 'width')).toBe('100%');
    expect(ruleValue(option, 'display')).toBe('grid');
    expect(ruleValue(selected, 'background')).toBe('color-mix(in srgb, var(--selected) 9%, var(--bg-subtle))');
    expect(ruleValue(selectedHover, 'background')).toBe('color-mix(in srgb, var(--selected) 13%, var(--bg-subtle))');
  });

  it('keeps the settings header above scrolling content rows', () => {
    const head = cssBlock(settingsPageCss, '.page :global(.modal-head)');
    const body = cssBlock(settingsPageCss, '.page :global(.modal-body)');
    const content = cssBlock(mentionHomeCss, '.settings-content');

    expect(ruleValue(body, 'overflow')).toBe('hidden');
    expect(ruleValue(head, 'position')).toBe('relative');
    expect(ruleValue(head, 'z-index')).toBe('2');
    expect(ruleValue(head, 'background')).toBe('var(--bg-elevated)');
    expect(ruleValue(content, 'position')).toBe('relative');
    expect(ruleValue(content, 'z-index')).toBe('1');
  });

  it('renders settings as an opaque page in the shell body, not a floating card', () => {
    // Roadmap § 2.4 Wave 6. The three properties below are the whole
    // difference between a page and the modal it replaced: it takes the
    // shell body's single grid cell rather than being centred on a scrim, it
    // stacks above the workspace it shares that cell with, and it is opaque,
    // because a settings surface the chat reads through is the
    // transparent-overlay defect at full size.
    const page = cssBlock(settingsPageCss, '.page');

    expect(ruleValue(page, 'grid-area')).toBe('1 / 1');
    // The layer the card had, so every overlay that used to sit above or
    // below Settings still does.
    expect(ruleValue(page, 'z-index')).toBe('100');
    expect(ruleValue(page, 'background')).toBe('var(--md-sys-color-surface)');

    // The page-owned module stays independent of the legacy selectors that
    // other surfaces still use. A whole-file ban would reject unrelated
    // overlays instead of protecting this page.
    expect(settingsPageCss).not.toContain('.modal-settings');
    expect(settingsPageCss).not.toContain('.settings-fullscreen');
  });

  it('keeps the shared dialog content rhythm reaching the settings page', () => {
    // The page dropped the `modal` class, and these four rules are the ones
    // the settings sections were written against — every hint, every field
    // label, every section heading. Losing them would not have thrown
    // anything; it would just have unstyled nineteen sections at once.
    expect(mentionHomeCss).toContain('.settings-page h2 {');
    expect(mentionHomeCss).toContain('.settings-page label {');
    expect(mentionHomeCss).toContain('.settings-page .hint {');
    expect(mentionHomeCss).toContain('.settings-page .row {');
  });

  it('gives the shell body one grid cell so the page can cover the workspace', () => {
    // Without this the page would need `position: absolute`, which would make
    // the shell body a positioned ancestor and silently re-home every
    // absolutely-positioned descendant in the product.
    const body = cssBlock(shellCss, '.workspace-shell__body');
    const children = cssBlock(shellCss, '.workspace-shell__body > *');

    expect(ruleValue(body, 'display')).toBe('grid');
    expect(ruleValue(body, 'grid-template-rows')).toBe('minmax(0, 1fr)');
    expect(ruleValue(children, 'grid-area')).toBe('1 / 1');
  });

  it('keeps the silent-update checkbox native-sized and aligned horizontally', () => {
    const row = cssBlock(artifactsCss, '.settings-about-diagnostics > .settings-about-toggle');
    const checkbox = cssBlock(artifactsCss, '.settings-about-toggle input');

    expect(ruleValue(row, 'flex-direction')).toBe('row');
    expect(ruleValue(row, 'gap')).toBe('10px');
    expect(ruleValue(checkbox, 'appearance')).toBe('auto');
    expect(ruleValue(checkbox, 'width')).toBe('14px');
    expect(ruleValue(checkbox, 'height')).toBe('14px');
    expect(ruleValue(checkbox, 'padding')).toBe('0');
    expect(ruleValue(checkbox, 'margin')).toBe('2px 0 0');
  });

  it('stacks the updater popup checkbox above an evenly split action row', () => {
    const footer = cssBlock(mentionHomeCss, '.updater-popup__footer');
    const preference = cssBlock(mentionHomeCss, '.updater-popup__preference');
    const label = cssBlock(mentionHomeCss, '.updater-popup__checkbox span');
    const actions = cssBlock(mentionHomeCss, '.updater-popup__actions');

    // The popup adopted the update-reminder dialog layout: the silent-update
    // checkbox gets the full panel width on its own row, and the two action
    // pills split the row below 50/50. The single-row predecessor squeezed the
    // checkbox label into a skinny always-wrapping column once the pill
    // buttons widened.
    expect(ruleValue(footer, 'display')).toBe('flex');
    expect(ruleValue(footer, 'flex-direction')).toBe('column');
    expect(ruleValue(footer, 'align-items')).toBe('stretch');
    // Long en labels still have to wrap inside the checkbox column rather than
    // overflow the panel.
    expect(ruleValue(preference, 'min-width')).toBe('0');
    expect(ruleValue(label, 'white-space')).toBe('normal');
    expect(ruleValue(actions, 'display')).toBe('grid');
    expect(ruleValue(actions, 'grid-template-columns')).toBe('1fr 1fr');
  });

  it('wraps the automation next-run readout instead of cutting a sentence', () => {
    // Two of the three states this renders are whole sentences, not a
    // timestamp — "scheduled after you save" and "paused, manual only" — and
    // bilingual mode carries their Cantonese half as well. The readout used
    // to declare `text-overflow: ellipsis` on a flex container, where the
    // property does nothing, so `overflow: hidden` against the 260px budget
    // simply cut the copy mid-glyph. A second line costs nothing here, so
    // there is nothing left to truncate and nothing left to ellipsise.
    const readout = cssBlock(mentionHomeCss, '.orbit-next-run');
    const label = cssBlock(mentionHomeCss, '.orbit-next-run-label');

    expect(ruleValue(readout, 'flex-wrap')).toBe('wrap');
    expect(ruleValue(readout, 'max-width')).toBe('260px');
    expect(readout).not.toContain('text-overflow');
    expect(readout).not.toContain('overflow: hidden');
    expect(readout).not.toContain('white-space: nowrap');
    // The label names what the value is, so it is never the half that wraps
    // away from it.
    expect(ruleValue(label, 'flex')).toBe('0 0 auto');
  });
});
