import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Material Design 3 anatomy for lists and switches (roadmap § 2.4 Wave 4) —
 * the automation rows on the Automations page and in Settings, the switch
 * component both of them and the two integration panels now share, and the
 * Integrations area selector.
 *
 * The reason to pin these is that the same widget was declared in several
 * places before this wave and the copies had drifted: five hand-rolled
 * toggles at three different sizes, two automation rows with different
 * cards, and a `.btn-primary` class written on buttons in two files and
 * declared in none, so the "primary" action rendered as the same grey
 * container as the ones beside it. Every expectation below is the literal
 * text in the source, not a computed value.
 */

const read = (relative: string) =>
  readFileSync(new URL(relative, import.meta.url), 'utf8');

const switchCss = read('../../src/components/Switch.module.css');
const tasksCss = read('../../src/styles/home/tasks.css');
const primitivesCss = read('../../src/styles/primitives.css');
const integrationsCss = read('../../src/styles/home/integrations.css');
const pluginsHomeCss = read('../../src/styles/home/plugins-home.css');
const recentProjectsCss = read('../../src/styles/home/recent-projects.css');
const connectorsCss = read('../../src/styles/workspace/connectors.css');
const routinesCss = read('../../src/styles/viewer/routines.css');

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * Collect every declaration block whose selector list contains `selector`,
 * counting braces rather than pattern-matching them so a rule nested inside
 * an `@media` block is found at the depth it actually lives at. `depth`
 * selects that: 0 is a top-level rule, 1 is one inside a single at-rule.
 */
function declarations(css: string, selector: string, depth = 0): string {
  const source = stripComments(css);
  const found: string[] = [];
  let cursor = 0;
  let level = 0;
  let start = 0;

  for (let i = 0; i < source.length; i += 1) {
    const character = source[i];
    if (character === '{') {
      if (level === depth) {
        const prelude = source.slice(Math.max(cursor, start), i);
        const selectors = prelude.split(',').map((item) => item.trim());
        if (selectors.includes(selector)) {
          let inner = 1;
          let end = i + 1;
          while (end < source.length && inner > 0) {
            if (source[end] === '{') inner += 1;
            if (source[end] === '}') inner -= 1;
            end += 1;
          }
          found.push(source.slice(i + 1, end - 1));
        }
      }
      level += 1;
      start = i + 1;
    } else if (character === '}') {
      level -= 1;
      start = i + 1;
      cursor = i + 1;
    } else if (character === ';' && level === depth) {
      start = i + 1;
    }
  }

  if (found.length === 0) {
    throw new Error(`Missing CSS block for ${selector} at depth ${depth}`);
  }
  return found.join('\n');
}

function value(block: string, property: string): string {
  const matches = [
    ...block.matchAll(new RegExp(`(?:^|[;{\\n])\\s*${property}:\\s*([^;]+);`, 'g')),
  ];
  const match = matches.at(-1);
  if (!match) throw new Error(`Missing CSS property ${property}`);
  return match[1]!.replace(/\s+/g, ' ').trim();
}

/* ------------------------------------------------------------------ */

describe('the M3 switch', () => {
  it('is a 52×32 track, not the 36×20 slider it replaced', () => {
    const track = declarations(switchCss, '.switch');
    expect(value(track, 'width')).toBe('52px');
    expect(value(track, 'height')).toBe('32px');
    expect(value(track, 'border')).toBe('2px solid var(--md-sys-color-outline)');
    expect(value(track, 'border-radius')).toBe('var(--md-sys-shape-corner-full)');
    expect(value(track, 'background')).toBe('var(--md-sys-color-surface-container-highest)');
    // The 2px outline is drawn INSIDE the box, which is what makes the
    // handle geometry below line up with M3's outer-edge measurements.
    expect(value(track, 'box-sizing')).toBe('border-box');
  });

  it('selects with the primary role on both track and border', () => {
    const on = declarations(switchCss, ".switch[aria-checked='true']");
    expect(value(on, 'background')).toBe('var(--md-sys-color-primary)');
    expect(value(on, 'border-color')).toBe('var(--md-sys-color-primary)');
  });

  /**
   * The size change is the whole affordance and the part every hand-rolled
   * toggle in this codebase dropped: off is a small dot in a hollow track,
   * on is a full handle in a filled one. A switch whose handle is one size
   * is a switch you have to read the colour of.
   */
  it('changes the handle size between states', () => {
    const off = declarations(switchCss, '.handle');
    expect(value(off, 'width')).toBe('16px');
    expect(value(off, 'height')).toBe('16px');
    expect(value(off, 'left')).toBe('6px');
    expect(value(off, 'background')).toBe('var(--md-sys-color-outline)');

    const on = declarations(switchCss, ".switch[aria-checked='true'] .handle");
    expect(value(on, 'width')).toBe('24px');
    expect(value(on, 'height')).toBe('24px');
    expect(value(on, 'left')).toBe('22px');
    expect(value(on, 'background')).toBe('var(--md-sys-color-on-primary)');
  });

  it('uses the larger unselected handle when it carries an icon', () => {
    const withIcons = declarations(switchCss, ".switch[data-with-icons='true'] .handle");
    expect(value(withIcons, 'width')).toBe('24px');
    expect(value(withIcons, 'left')).toBe('2px');
  });

  it('lays a 40px state layer on the handle, not on the whole track', () => {
    const layer = declarations(switchCss, '.handle::before');
    expect(value(layer, 'width')).toBe('40px');
    expect(value(layer, 'height')).toBe('40px');
    expect(value(layer, 'border-radius')).toBe('var(--md-sys-shape-corner-full)');

    const hover = declarations(switchCss, '.switch:hover:not(:disabled) .handle::before');
    expect(value(hover, 'background')).toBe('var(--ripple)');
  });

  it('shows focus as a ring rather than as the state layer', () => {
    const focus = declarations(switchCss, '.switch:focus-visible');
    expect(value(focus, 'outline')).toBe('2px solid var(--md-sys-color-primary)');
    expect(value(focus, 'outline-offset')).toBe('2px');
  });

  it('stops animating under prefers-reduced-motion', () => {
    const reduced = declarations(switchCss, '.switch', 1);
    expect(value(reduced, 'transition')).toBe('none');
  });
});

/* ------------------------------------------------------------------ */

describe('automation rows (M3 list anatomy)', () => {
  it('is an outlined row on surface-container-low at corner-l', () => {
    const row = declarations(tasksCss, '.automation-row');
    expect(value(row, 'border')).toBe('1px solid var(--md-sys-color-outline-variant)');
    expect(value(row, 'border-radius')).toBe('var(--md-sys-shape-corner-l)');
    expect(value(row, 'background')).toBe('var(--md-sys-color-surface-container-low)');
    // A row rises by a surface tone, not by a shadow.
    expect(value(row, 'box-shadow')).toBe('var(--md-sys-elevation-0)');

    const hover = declarations(tasksCss, '.automation-row:hover');
    expect(value(hover, 'background')).toBe('var(--md-sys-color-surface-container)');
  });

  it('leads with a 44px tonal tile', () => {
    const tile = declarations(tasksCss, '.automation-row__icon');
    expect(value(tile, 'width')).toBe('44px');
    expect(value(tile, 'height')).toBe('44px');
    expect(value(tile, 'border-radius')).toBe('var(--md-sys-shape-corner-l)');
    expect(value(tile, 'background')).toBe('var(--md-sys-color-tertiary-container)');
    expect(value(tile, 'color')).toBe('var(--md-sys-color-on-tertiary-container)');
    // The grid column has to hold the tile it was widened for.
    expect(value(declarations(tasksCss, '.automation-row__main'), 'grid-template-columns'))
      .toBe('44px minmax(0, 1fr)');
  });

  /**
   * The enabled/paused chip is chrome and takes theme roles. The run-status
   * chip below it is a status palette, which the Material Design standard
   * exempts as data — so that one keeps its hues and only its shape moves.
   */
  it('states enabled/paused as a chip in theme roles', () => {
    const chip = declarations(tasksCss, '.automation-state-chip');
    expect(value(chip, 'height')).toBe('24px');
    expect(value(chip, 'border-radius')).toBe('var(--md-sys-shape-corner-full)');
    expect(value(chip, 'background')).toBe('var(--md-sys-color-surface-container-highest)');
    expect(value(chip, 'color')).toBe('var(--md-sys-color-on-surface-variant)');

    const active = declarations(tasksCss, '.automation-state-chip.is-active');
    expect(value(active, 'background')).toBe('var(--md-sys-color-success-container)');
    expect(value(active, 'color')).toBe('var(--md-sys-color-success)');
  });

  it('keeps the run-status palette and only restates its shape', () => {
    const status = declarations(tasksCss, '.automation-status');
    expect(value(status, 'height')).toBe('24px');
    expect(value(status, 'border-radius')).toBe('var(--md-sys-shape-corner-full)');
    expect(value(status, 'font-size')).toBe('var(--md-sys-typescale-label-medium-size)');
    // The five encoded hues are untouched: they are data, not chrome.
    expect(declarations(tasksCss, '.automation-status.is-succeeded')).toContain('#43a66d');
    expect(declarations(tasksCss, '.automation-status.is-failed')).toContain('var(--red, #d94c4c)');
  });

  it('sizes its actions from the density tokens and rounds them fully', () => {
    const button = declarations(tasksCss, '.automation-row__btn');
    expect(value(button, 'height')).toBe('var(--control-h)');
    expect(value(button, 'padding')).toBe('0 var(--control-pad-x)');
    expect(value(button, 'border')).toBe('1px solid var(--md-sys-color-outline)');
    expect(value(button, 'border-radius')).toBe('var(--md-sys-shape-corner-full)');
    expect(value(button, 'background')).toBe('transparent');

    const focus = declarations(tasksCss, '.automation-row__btn:focus-visible');
    expect(value(focus, 'outline')).toBe('2px solid var(--md-sys-color-primary)');
  });

  /**
   * The row's hover rule is 0,2,0 and `button.tonal` is 0,1,1, so without
   * the `:not(.tonal)` the high-emphasis action would lose its container the
   * moment it is pointed at.
   */
  it('does not strip the tonal action on hover', () => {
    const hover = declarations(tasksCss, '.automation-row__btn:hover:not(.tonal)');
    expect(value(hover, 'background')).toBe('var(--ripple)');
    expect(() => declarations(tasksCss, '.automation-row__btn:hover')).toThrow();
  });
});

describe('the filled-tonal button primitive', () => {
  /**
   * `.btn-primary`, `.btn-ghost` and `.btn-danger` are written on buttons
   * across this codebase and declared nowhere, so both automation surfaces
   * rendered every action as the same container. The variant lives once, in
   * the shared primitive sheet, rather than being restated per surface.
   */
  it('exists exactly once and uses the container roles', () => {
    const tonal = declarations(primitivesCss, 'button.tonal');
    expect(value(tonal, 'background')).toBe('var(--md-sys-color-primary-container)');
    expect(value(tonal, 'color')).toBe('var(--md-sys-color-on-primary-container)');
    expect(() => declarations(tasksCss, '.automation-row__btn--tonal')).toThrow();
  });

  it('paints the destructive automation action with the error role', () => {
    // The selector has to name the element too: this button also carries
    // `ghost`, and `button.ghost` (0,1,1) would beat a bare class (0,1,0) —
    // the fix would have been written and rendered nothing.
    const remove = declarations(routinesCss, 'button.routines-item-delete');
    expect(value(remove, 'color')).toBe('var(--md-sys-color-error)');
    expect(() => declarations(routinesCss, '.routines-item-delete')).toThrow();
  });

  it('draws the settings automation row as the same card as the page one', () => {
    const card = declarations(routinesCss, '.routines-card');
    expect(value(card, 'background')).toBe('var(--md-sys-color-surface-container-low)');
    expect(value(card, 'border')).toBe('1px solid var(--md-sys-color-outline-variant)');
    expect(value(card, 'border-radius')).toBe('var(--md-sys-shape-corner-l)');
  });
});

/* ------------------------------------------------------------------ */

describe('the Integrations area selector (M3 segmented button)', () => {
  it('is one outlined container, not a tray of inner cards', () => {
    const container = declarations(integrationsCss, '.integrations-view__tabs');
    expect(value(container, 'height')).toBe('40px');
    expect(value(container, 'border')).toBe('1px solid var(--md-sys-color-outline)');
    expect(value(container, 'border-radius')).toBe('var(--md-sys-shape-corner-full)');
    expect(value(container, 'background')).toBe('transparent');
    expect(value(container, 'padding')).toBe('0');
    expect(value(container, 'gap')).toBe('0');
    expect(value(container, 'overflow')).toContain('hidden');
  });

  it('divides its segments with the container hairline', () => {
    const segment = declarations(integrationsCss, '.integrations-view__tab');
    expect(value(segment, 'padding')).toBe('0 16px');
    expect(value(segment, 'border-radius')).toBe('0');
    expect(value(segment, 'color')).toBe('var(--md-sys-color-on-surface-variant)');
    expect(value(segment, 'font-size')).toBe('var(--md-sys-typescale-label-large-size)');

    const divider = declarations(
      integrationsCss,
      '.integrations-view__tab + .integrations-view__tab',
    );
    expect(value(divider, 'border-left')).toBe('1px solid var(--md-sys-color-outline)');
  });

  it('selects with a tonal container and lays a state layer on hover', () => {
    const active = declarations(integrationsCss, '.integrations-view__tab.is-active');
    expect(value(active, 'background')).toBe('var(--md-sys-color-secondary-container)');
    expect(value(active, 'color')).toBe('var(--md-sys-color-on-secondary-container)');

    const hover = declarations(integrationsCss, '.integrations-view__tab:hover:not(.is-active)');
    expect(value(hover, 'background')).toBe('var(--ripple)');
  });

  it('insets its focus ring so the end segments keep it', () => {
    const focus = declarations(integrationsCss, '.integrations-view__tab:focus-visible');
    expect(value(focus, 'outline')).toBe('2px solid var(--md-sys-color-primary)');
    expect(value(focus, 'outline-offset')).toBe('-2px');
  });

  it('keeps localized tab labels wrap-safe instead of clipping them', () => {
    const label = declarations(integrationsCss, '.integrations-view__tab-label');
    expect(value(label, 'overflow-wrap')).toBe('anywhere');
    expect(label).not.toContain('text-overflow');
  });

  /**
   * The strip is `inline-flex` and clips its own radius, so at a narrow
   * width the fourth segment would be cut off rather than shrunk. The
   * breakpoint has to make the segments share the width instead.
   */
  it('shares the full width between segments at narrow widths', () => {
    const narrowStrip = declarations(integrationsCss, '.integrations-view__tabs', 1);
    expect(value(narrowStrip, 'width')).toBe('100%');
    const narrowSegment = declarations(integrationsCss, '.integrations-view__tab', 1);
    expect(value(narrowSegment, 'flex')).toBe('1 1 0');
  });
});

describe('home collection action targets', () => {
  it('gives the plugin search clear action a touch-sized hit area', () => {
    const clear = declarations(pluginsHomeCss, '.plugins-home__search .plugins-home__search-clear');
    expect(value(clear, 'width')).toBe('32px');
    expect(value(clear, 'height')).toBe('32px');
  });

  it('keeps recent-project menu actions reachable without hover precision', () => {
    const menu = declarations(recentProjectsCss, '.recent-projects__card-menu button');
    expect(value(menu, 'min-height')).toBe('40px');
    const filter = declarations(recentProjectsCss, '.recent-projects__filter-menu button');
    expect(value(filter, 'min-height')).toBe('40px');
  });
});

describe('integration status chips', () => {
  it('restates the connector chip shape without touching its palette', () => {
    const chip = declarations(connectorsCss, '.connector-status-pill');
    expect(value(chip, 'height')).toBe('24px');
    expect(value(chip, 'border-radius')).toBe('var(--md-sys-shape-corner-full)');
    expect(value(chip, 'font-size')).toBe('var(--md-sys-typescale-label-medium-size)');
    // Untouched: connected/error/pending is a status encoding.
    expect(
      declarations(connectorsCss, '.connector-status-pill.status-connected'),
    ).toContain('var(--green)');
  });
});
