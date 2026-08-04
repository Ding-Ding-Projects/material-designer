import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Material Design 3 anatomy for the four collection surfaces — projects,
 * design systems, library assets and plugins (roadmap § 2.4 Wave 3).
 *
 * The point of pinning these is that the four grids are owned by five
 * different stylesheets, two of which are CSS Modules. Nothing but a test
 * stops one of them drifting back to its own card shape, and a collection
 * that looks like a different product from the collection beside it is the
 * exact defect the wave exists to fix. Every expectation below is the literal
 * text in the source, not a computed value.
 */

const read = (relative: string) =>
  readFileSync(new URL(relative, import.meta.url), 'utf8');

const drawerCss = read('../../src/styles/workspace/drawer.css');
const libraryCss = read('../../src/styles/viewer/library.css');
const composioCss = read('../../src/styles/viewer/composio.css');
const pluginsHomeCss = read('../../src/styles/home/plugins-home.css');
const marketplaceCss = read('../../src/styles/home/marketplace.css');
const librarySectionCss = read('../../src/components/LibrarySection.module.css');

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * Collect every declaration block whose selector list contains `selector`,
 * counting braces rather than pattern-matching them so a rule nested inside an
 * `@media` block is found at the depth it actually lives at. `depth` selects
 * that: 0 is a top-level rule, 1 is one inside a single at-rule.
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

/**
 * Every single-select collection control: the projects filter and grid/list
 * switch, the library's grid/timeline switch, the plugin sort toggle and the
 * marketplace catalog filter. Material Design 3 draws all five as the same
 * segmented button, and the reason to assert them together is that they are
 * five separate declarations of one shape.
 */
const SEGMENTED: Array<{
  name: string;
  css: string;
  container: string;
  segment: string;
  divider: string;
  active: string;
  hover: string;
  focus: string;
}> = [
  {
    name: 'projects filter / grid-list switch',
    css: drawerCss,
    container: '.subtab-pill',
    segment: '.subtab-pill button',
    divider: '.subtab-pill button + button',
    active: '.subtab-pill button.active',
    hover: '.subtab-pill button:hover:not(.active)',
    focus: '.subtab-pill button:focus-visible',
  },
  {
    name: 'library grid/timeline switch',
    css: librarySectionCss,
    container: '.viewToggle',
    segment: '.viewToggleBtn',
    divider: '.viewToggleBtn + .viewToggleBtn',
    active: ".viewToggleBtn[data-active='true']",
    hover: ".viewToggleBtn:hover:not([data-active='true'])",
    focus: '.viewToggleBtn:focus-visible',
  },
  {
    name: 'plugin sort toggle',
    css: pluginsHomeCss,
    container: '.plugins-home__sort',
    segment: '.plugins-home__sort-segment',
    divider: '.plugins-home__sort-segment + .plugins-home__sort-segment',
    active: '.plugins-home__sort-segment.is-active',
    hover: '.plugins-home__sort-segment:hover:not(.is-active)',
    focus: '.plugins-home__sort-segment:focus-visible',
  },
  {
    name: 'marketplace catalog filter',
    css: marketplaceCss,
    container: '.marketplace-view__filters',
    segment: '.marketplace-view__filters button',
    divider: '.marketplace-view__filters button + button',
    active: ".marketplace-view__filters button[data-active='true']",
    hover: ".marketplace-view__filters button:hover:not([data-active='true'])",
    focus: '.marketplace-view__filters button:focus-visible',
  },
];

describe('collection segmented buttons (M3)', () => {
  for (const control of SEGMENTED) {
    it(`${control.name} is one outlined container, not a tray of inner pills`, () => {
      const container = declarations(control.css, control.container);
      expect(value(container, 'height')).toBe('40px');
      expect(value(container, 'border')).toBe('1px solid var(--md-sys-color-outline)');
      expect(value(container, 'border-radius')).toBe('var(--md-sys-shape-corner-full)');
      expect(value(container, 'background')).toBe('transparent');
      // A tray would pad its inner pills away from the container edge; a
      // segmented button's segments run to it.
      expect(value(container, 'padding')).toBe('0');
      expect(value(container, 'gap')).toBe('0');
      expect(value(container, 'overflow')).toContain('hidden');
    });

    it(`${control.name} divides its segments with the container hairline`, () => {
      const segment = declarations(control.css, control.segment);
      expect(value(segment, 'padding')).toBe('0 16px');
      expect(value(segment, 'border-radius')).toBe('0');
      expect(value(segment, 'color')).toBe('var(--md-sys-color-on-surface-variant)');
      expect(value(segment, 'font-size')).toBe('var(--md-sys-typescale-label-large-size)');

      const divider = declarations(control.css, control.divider);
      expect(value(divider, 'border-left')).toBe('1px solid var(--md-sys-color-outline)');
    });

    it(`${control.name} selects with a tonal container and lays a state layer on hover`, () => {
      const active = declarations(control.css, control.active);
      expect(value(active, 'background')).toBe('var(--md-sys-color-secondary-container)');
      expect(value(active, 'color')).toBe('var(--md-sys-color-on-secondary-container)');

      const hover = declarations(control.css, control.hover);
      expect(value(hover, 'background')).toBe('var(--ripple)');
    });

    it(`${control.name} keeps focus visible on its end segments`, () => {
      const focus = declarations(control.css, control.focus);
      expect(value(focus, 'outline')).toBe('2px solid var(--md-sys-color-primary)');
      // The container clips its outer radius, so an offset ring would be cut
      // away on exactly the first and last segment — the two a keyboard user
      // reaches first. The ring has to be inset.
      expect(value(focus, 'outline-offset')).toBe('-2px');
    });
  }
});

/* ------------------------------------------------------------------ */

const OUTLINED_CARDS: Array<{
  name: string;
  css: string;
  card: string;
  hover: string;
}> = [
  {
    name: 'project card',
    css: drawerCss,
    card: '.design-card',
    hover: '.design-card:hover',
  },
  {
    name: 'design-system card',
    css: libraryCss,
    card: '.library-ds-card',
    hover: '.library-ds-card:hover',
  },
  {
    name: 'library asset card',
    css: librarySectionCss,
    card: '.card',
    hover: '.card:hover',
  },
  {
    name: 'plugin card',
    css: pluginsHomeCss,
    card: '.plugins-home__card',
    hover: '.plugins-home__card:hover',
  },
  {
    name: 'marketplace card',
    css: marketplaceCss,
    card: '.marketplace-view__card',
    hover: '.marketplace-view__card:hover',
  },
];

describe('collection cards (M3 outlined card)', () => {
  for (const card of OUTLINED_CARDS) {
    it(`${card.name} rests as an outlined card on a container tone`, () => {
      const block = declarations(card.css, card.card);
      expect(value(block, 'border')).toBe('1px solid var(--md-sys-color-outline-variant)');
      expect(value(block, 'border-radius')).toBe('var(--md-sys-shape-corner-l)');
      expect(value(block, 'background')).toBe('var(--md-sys-color-surface-container-low)');
      // An outlined card carries no resting elevation; the shadow is the hover
      // affordance and nothing else.
      expect(value(block, 'box-shadow')).toBe('none');
      // The lift needs the spring curve's full period because it overshoots.
      expect(value(block, 'transition')).toContain(
        'transform 300ms var(--md-sys-motion-spring)',
      );
    });

    it(`${card.name} lifts to elevation 2 on hover`, () => {
      const block = declarations(card.css, card.hover);
      expect(value(block, 'border-color')).toBe('var(--md-sys-color-outline)');
      expect(value(block, 'box-shadow')).toBe('var(--md-sys-elevation-2)');
      expect(value(block, 'transform')).toBe('translateY(-3px)');
    });

    it(`${card.name} stops moving when the reader asks for less motion`, () => {
      const reduced = declarations(card.css, card.card, 1);
      expect(value(reduced, 'transition')).toBe('none');
      const reducedHover = declarations(card.css, card.hover, 1);
      expect(value(reducedHover, 'transform')).toBe('none');
    });
  }

  it('spaces every collection grid on the same 16px gutter', () => {
    expect(value(declarations(drawerCss, '.design-grid'), 'gap')).toBe('16px');
    expect(value(declarations(drawerCss, '.ds-grid'), 'gap')).toBe('16px');
    expect(value(declarations(librarySectionCss, '.grid'), 'gap')).toBe('16px');
    expect(value(declarations(librarySectionCss, '.timelineGrid'), 'gap')).toBe('16px');
    expect(value(declarations(pluginsHomeCss, '.plugins-home__grid'), 'gap')).toBe('16px');
    expect(value(declarations(marketplaceCss, '.marketplace-view__grid'), 'gap')).toBe('16px');
  });
});

/* ------------------------------------------------------------------ */

/**
 * The plugin collection's facet pills and the application-wide `.filter-pill`
 * are the same M3 filter chip. `filter-pill.test.ts` owns the contrast side of
 * that contract; this asserts the two declarations have not drifted apart in
 * shape, which is what makes a row of mixed chip heights.
 */
const FILTER_CHIPS: Array<{ name: string; css: string; chip: string; active: string }> = [
  {
    name: 'application filter chip',
    css: composioCss,
    chip: '.filter-pill',
    active: '.filter-pill.active',
  },
  {
    name: 'plugin facet chip',
    css: pluginsHomeCss,
    chip: '.plugins-home__pill',
    active: '.plugins-home__pill.is-active',
  },
  {
    name: 'plugin saved chip',
    css: pluginsHomeCss,
    chip: '.plugins-home__chip',
    active: '.plugins-home__chip--saved.is-active',
  },
];

describe('collection filter chips (M3)', () => {
  for (const chip of FILTER_CHIPS) {
    it(`${chip.name} is a 36dp outlined chip`, () => {
      const block = declarations(chip.css, chip.chip);
      expect(value(block, 'height')).toBe('36px');
      expect(value(block, 'padding')).toBe('0 16px');
      expect(value(block, 'border')).toBe('1px solid var(--md-sys-color-outline)');
      expect(value(block, 'border-radius')).toBe('var(--md-sys-shape-corner-full)');
      expect(value(block, 'background')).toBe('transparent');
      expect(value(block, 'color')).toBe('var(--md-sys-color-on-surface-variant)');
      expect(value(block, 'font-size')).toBe('var(--md-sys-typescale-label-large-size)');
    });

    it(`${chip.name} selects with a tonal container, keeping its box metrics`, () => {
      const block = declarations(chip.css, chip.active);
      expect(value(block, 'background')).toBe('var(--md-sys-color-secondary-container)');
      expect(value(block, 'color')).toBe('var(--md-sys-color-on-secondary-container)');
      // Not `border: 0`. Dropping the hairline moves every chip in the row by
      // two pixels the moment one of them is picked.
      expect(value(block, 'border-color')).toBe('transparent');
    });
  }

  it('no longer fills a selected facet chip with the accent colour', () => {
    // The pre-M3 rule was `background: var(--accent); color: white`, which made
    // a row of filters read as a row of primary buttons and left the real call
    // to action with nothing to distinguish it.
    const active = declarations(pluginsHomeCss, '.plugins-home__pill.is-active');
    expect(active).not.toContain('var(--accent)');
    expect(active).not.toContain('white');
  });
});
