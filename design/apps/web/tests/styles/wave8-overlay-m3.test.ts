import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Wave 8 — the overlays the first seven waves did not reach.
 *
 * Every assertion here pins a value that is *not* supplied by the blanket
 * attribute floor in `styles/primitives.css`. That distinction is the whole
 * point of the file: the floor already gives any element whose class contains
 * `-modal`, `-dialog`, `-popover`, `-menu` or `-card` an M3 surface at 0-2-0 to
 * 0-4-0, so a surface it reaches needs no rule of its own. The surfaces below
 * all escape it — a scrim class the floor's `[class*='modal-backdrop']` does
 * not match, a BEM name carrying `__`, or a CSS Module hash that reads
 * `File_popover__hash` rather than `-popover` — which is why each one had kept
 * its pre-M3 colours while the modals around it quietly went M3.
 */

const read = (p: string) => readFileSync(new URL(`../../src/${p}`, import.meta.url), 'utf8');

function block(css: string, selector: string): string {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks: string[] = [];
  let depth = 0;
  let selectorStart = 0;
  let bodyStart = 0;
  let selectorText = '';
  for (let index = 0; index < withoutComments.length; index += 1) {
    const character = withoutComments[index];
    if (character === '{') {
      if (depth === 0) {
        selectorText = withoutComments.slice(selectorStart, index).trim();
        bodyStart = index + 1;
      }
      depth += 1;
      continue;
    }
    if (character !== '}') continue;
    depth -= 1;
    if (depth !== 0) continue;
    const selectors = selectorText.split(',').map((one) => one.trim());
    if (selectors.includes(selector)) blocks.push(withoutComments.slice(bodyStart, index));
    selectorStart = index + 1;
  }
  if (blocks.length === 0) throw new Error(`Missing CSS block for ${selector}`);
  return blocks.join('\n');
}

function value(css: string, selector: string, property: string): string {
  const declarations = [
    ...block(css, selector).matchAll(new RegExp(`(?:^|[;\\n])\\s*${property}:\\s*([^;]+);`, 'g')),
  ];
  const last = declarations.at(-1);
  if (!last) throw new Error(`Missing ${property} on ${selector}`);
  return last[1]!.trim();
}

function values(css: string, selector: string, property: string): string[] {
  return [
    ...block(css, selector).matchAll(new RegExp(`(?:^|[;\\n])\\s*${property}:\\s*([^;]+);`, 'g')),
  ].map((match) => match[1]!.trim());
}

describe('Wave 8 overlay surfaces', () => {
  it('paints every scrim with the one scrim role, not five hand-picked blacks', () => {
    // These were `rgba(28, 27, 26, 0.48)`, `rgba(28, 27, 26, 0.42)` twice,
    // `rgba(15, 15, 18, 0.45)`, `rgba(17, 24, 39, 0.55)` twice, a
    // `color-mix(… #111827 18% …)` and a `color-mix(… var(--scrim, …) …)` whose
    // token is declared nowhere in the repository and therefore always resolved
    // to its own literal fallback. Eight different blacks for one job.
    const scrims: Array<[string, string]> = [
      ['styles/home/new-project-modal.css', '.new-project-modal-backdrop'],
      ['styles/home/tasks.css', '.automation-modal-backdrop'],
      ['styles/viewer/templates-plugins.css', '.plugin-details-modal-backdrop'],
      ['styles/viewer/theater.css', '.prompt-template-modal-backdrop'],
      ['styles/home/use-everywhere.css', '.use-everywhere-modal-backdrop'],
      ['styles/workspace/drawer.css', '.connector-drawer-backdrop'],
      ['components/FigmaImportModal.module.css', '.backdrop'],
      ['components/LibraryUploadModal.module.css', '.backdrop'],
      ['components/MessageCenter.module.css', '.backdrop'],
    ];
    for (const [file, selector] of scrims) {
      expect(value(read(file), selector, 'background'), `${file} ${selector}`).toBe(
        'var(--md-sys-color-scrim)',
      );
    }
  });

  it('gives the declared popovers the surface role the floor never reached', () => {
    const popovers: Array<[string, string]> = [
      ['styles/chat.css', '.session-mode-toggle__menu'],
      ['styles/home/entry-layout.css', '.entry-settings-menu__popover'],
      ['styles/home/entry-layout.css', '.inline-switcher__popover'],
      ['styles/home/entry-layout.css', '.model-select-searchable__popover'],
      ['styles/home/plus-menu.css', '.plus-menu__flyout'],
      ['components/ManualEditTextToolbar.module.css', '.popover'],
    ];
    for (const [file, selector] of popovers) {
      const css = read(file);
      expect(value(css, selector, 'background'), `${file} ${selector}`).toBe(
        'var(--md-sys-color-surface-container)',
      );
      expect(value(css, selector, 'border'), `${file} ${selector}`).toBe(
        '1px solid var(--md-sys-color-outline-variant)',
      );
      expect(value(css, selector, 'border-radius'), `${file} ${selector}`).toBe(
        'var(--md-sys-shape-corner-m)',
      );
      expect(value(css, selector, 'box-shadow'), `${file} ${selector}`).toBe(
        'var(--md-sys-elevation-2)',
      );
    }
    // The regex builder's popover keeps its own `z-index` and scroll bound —
    // only its colours moved, so its shadow is not asserted here.
    expect(
      value(read('components/regex/RegexSearchField.module.css'), '.popover', 'background'),
    ).toBe('var(--md-sys-color-surface-container)');
    // The changelog date range was already on M3 colours and only ever had a
    // raw shadow left.
    expect(
      value(read('components/changelog/ChangelogDateRange.module.css'), '.popover', 'box-shadow'),
    ).toBe('var(--md-sys-elevation-2)');
  });

  it('docks the message centre as a side sheet instead of floating an inset card', () => {
    const css = read('components/MessageCenter.module.css');
    // Leading corners only: a sheet that meets the screen edge does not round
    // against it. The 12px inset and the four-corner radius were what made this
    // read as a card that happened to be tall.
    expect(value(css, '.panel', 'border-radius')).toBe(
      'var(--md-sys-shape-corner-xl) 0 0 var(--md-sys-shape-corner-xl)',
    );
    expect(value(css, '.panel', 'margin-block-start')).toBe('var(--od-title-bar-height, 0px)');
    expect(value(css, '.panel', 'margin-block-end')).toBe('var(--od-status-bar-height, 28px)');
    expect(values(css, '.panel', 'height')).toEqual([
      'calc(var(--od-vh, 100vh) - var(--od-title-bar-height, 0px) - var(--od-status-bar-height, 28px))',
      'calc(var(--od-dvh, 100dvh) - var(--od-title-bar-height, 0px) - var(--od-status-bar-height, 28px))',
    ]);
    expect(value(css, '.panel', 'background')).toBe('var(--md-sys-color-surface-container-low)');
    expect(value(css, '.panel', 'box-shadow')).toBe('var(--md-sys-elevation-1)');
    // `--accent-contrast` is declared nowhere, so this badge always painted the
    // literal `#fff` it carried as a fallback.
    expect(value(css, '.badge', 'color')).toBe('var(--md-sys-color-on-error)');
  });

  it('moves the two upload modals off their duplicated 16px card', () => {
    for (const file of [
      'components/FigmaImportModal.module.css',
      'components/LibraryUploadModal.module.css',
    ]) {
      const css = read(file);
      expect(value(css, '.modal', 'background'), file).toBe(
        'var(--md-sys-color-surface-container-high)',
      );
      expect(value(css, '.modal', 'border-radius'), file).toBe('var(--md-sys-shape-corner-xl)');
      expect(value(css, '.modal', 'box-shadow'), file).toBe('var(--md-sys-elevation-3)');
    }
  });
});
