import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
  Two rules every overlay in the product has to keep, checked as rules rather
  than as one-off assertions about one dialog.

  1. It paints its own card. An overlay with no background lets whatever is
     behind it read straight through the text on top, and an overlay that has
     to be told apart from the page by its shadow alone fails the same way in
     dark mode where the shadow has nothing to fall on.

  2. It is bounded by the viewport and scrolls inside that bound. Capping a
     height and hiding the overflow does not shorten an overlay, it deletes the
     end of it — with no scrollbar to admit anything is missing. That is how a
     menu loses its destructive last item and a calendar loses its last week.

  The scroll half is checked against a named scroller per card, because "the
  card itself scrolls" and "the card clips and its body scrolls" are both
  correct and a test that only knows the first would push every structured
  dialog into scrolling its own header.
*/

const files = {
  contextMenu: '../../src/components/ContextMenu.module.css',
  handoff: '../../src/components/handoff/HandoffView.module.css',
  notificationCenter: '../../src/components/notifications/NotificationCenter.module.css',
  commandPalette: '../../src/components/command-palette/CommandPalette.module.css',
  messageCenter: '../../src/components/MessageCenter.module.css',
  viewerTools: '../../src/styles/viewer/tools.css',
  viewerTheater: '../../src/styles/viewer/theater.css',
  workspaceDrawer: '../../src/styles/workspace/drawer.css',
  entryLayout: '../../src/styles/home/entry-layout.css',
  dialogModule: '../../../../packages/components/src/dialog.module.css',
  mentionHome: '../../src/styles/workspace/mention-home.css',
  plusMenu: '../../src/styles/home/plus-menu.css',
  primitives: '../../src/styles/primitives.css',
  shell: '../../src/styles/shell.css',
} as const;

type FileKey = keyof typeof files;

const cache = new Map<FileKey, string>();

function css(file: FileKey): string {
  const cached = cache.get(file);
  if (cached !== undefined) return cached;
  const text = readFileSync(new URL(files[file], import.meta.url), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );
  cache.set(file, text);
  return text;
}

/**
 * Every declaration block whose selector list names this exact selector,
 * joined. Joined rather than "the first one" because a card's rule and its
 * reduced-motion override are both genuinely that selector, and picking one
 * arbitrarily makes the test depend on source order.
 */
function block(file: FileKey, selector: string): string {
  const blocks: string[] = [];
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  const text = css(file);
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(text)) !== null) {
    const selectors = (match[1] ?? '').split(',').map((item) => item.trim());
    if (selectors.includes(selector)) blocks.push(match[2] ?? '');
  }
  if (blocks.length === 0) throw new Error(`Missing CSS block for ${selector} in ${files[file]}`);
  return blocks.join('\n');
}

function value(declarations: string, property: string): string {
  const match = new RegExp(`(?:^|[;\\n])\\s*${property}:\\s*([^;]+);`).exec(declarations);
  if (!match) throw new Error(`Missing CSS property ${property}`);
  return match[1]!.trim();
}

function values(declarations: string, property: string): string[] {
  return Array.from(
    declarations.matchAll(new RegExp(`(?:^|[;\\n])\\s*${property}:\\s*([^;]+);`, 'g')),
  ).map((match) => match[1]!.trim());
}

function scrolls(declarations: string): boolean {
  const axes = [
    ...values(declarations, 'overflow'),
    ...values(declarations, 'overflow-y'),
    ...values(declarations, 'overflow-block'),
  ];
  return axes.some((axis) => /auto|scroll/.test(axis));
}

describe('overlay surfaces', () => {
  /*
    The one that mattered most: `Dialog` puts its CSS-module class and the
    global `modal` class on the same element, and the module writes its card
    inside `:where()` — zero specificity — so the global rule wins every
    declaration they share. Editing one and not the other changes nothing on
    screen, which is the worst possible outcome for a stylesheet. They are kept
    identical instead, and this proves it.
  */
  const dialogPaint = [
    'background',
    'border',
    'border-radius',
    'box-shadow',
    'padding',
    'width',
    'max-width',
    'overflow-y',
    'overscroll-behavior',
  ] as const;

  it('gives the dialog card a Material Design 3 surface it paints itself', () => {
    const card = block('dialogModule', ':where(.dialog)');

    expect(value(card, 'background')).toBe('var(--md-sys-color-surface-container-high)');
    expect(value(card, 'border')).toBe('1px solid var(--md-sys-color-outline-variant)');
    expect(value(card, 'border-radius')).toBe('var(--md-sys-shape-corner-xl)');
    expect(value(card, 'box-shadow')).toBe('var(--shadow-lg)');
  });

  it('bounds the dialog to the viewport and scrolls it there, in both height units', () => {
    const card = block('dialogModule', ':where(.dialog)');

    // Ordered so `dvh` wins where it is understood: on a host whose viewport
    // shrinks under an on-screen keyboard, `vh` keeps the old taller number.
    expect(values(card, 'max-height')).toEqual([
      'calc(100vh - 48px)',
      'calc(100dvh - 48px)',
    ]);
    expect(scrolls(card)).toBe(true);
    expect(value(card, 'overscroll-behavior')).toBe('contain');
  });

  it('keeps the module card and the global .modal card saying the same thing', () => {
    const moduleCard = block('dialogModule', ':where(.dialog)');
    const globalCard = block('mentionHome', '.modal');

    for (const property of dialogPaint) {
      expect(values(globalCard, property)).toEqual(values(moduleCard, property));
    }
    expect(values(globalCard, 'max-height')).toEqual(values(moduleCard, 'max-height'));
  });

  it('moves the scroll off a sectioned dialog card and onto its body', () => {
    // A sectioned dialog has a padded header and a footer with a rule above it;
    // both are meant to stay put while the middle moves.
    // The compound `.dialog.dialogSectioned` is deliberate: both classes are
    // always on this element together, so it selects the same thing, but at two
    // classes it outranks the global `.modal` rule instead of tying with it —
    // and a tie would be settled by whichever sheet the bundler emitted last.
    const sectioned = block('dialogModule', '.dialog.dialogSectioned');
    const body = block('dialogModule', '.dialog.dialogSectioned .body');

    expect(value(sectioned, 'overflow')).toBe('hidden');
    // `min-height: 0` is the load-bearing half: a column flex item defaults to
    // `min-height: auto` and refuses to shrink below its content, so without it
    // the body pushes the footer off the bottom instead of scrolling.
    expect(value(body, 'min-height')).toBe('0');
    expect(scrolls(body)).toBe(true);
  });

  it('paints the context menu a tone above the panels it opens over', () => {
    const menu = block('contextMenu', '.menu');

    expect(value(menu, 'background')).toBe('var(--md-sys-color-surface-container-high)');
    expect(value(menu, 'border')).toBe('1px solid var(--md-sys-color-outline-variant)');
    expect(value(menu, 'border-radius')).toBe('var(--radius-lg)');
    expect(value(menu, 'box-shadow')).toBe('var(--shadow-lg)');
    expect(values(menu, 'max-height')).toEqual([
      'calc(100vh - 16px)',
      'calc(100dvh - 16px)',
    ]);
    expect(scrolls(menu)).toBe(true);
  });

  it('keeps the keycaps visible against the surface the menu moved to', () => {
    const menu = block('contextMenu', '.menu');
    const key = block('contextMenu', '.key');

    // A keycap painted the same colour as the menu behind it is a keycap with
    // no cap; it has to be one tone up from whatever the card settled on.
    expect(value(key, 'background')).toBe('var(--md-sys-color-surface-container-highest)');
    expect(value(key, 'background')).not.toBe(value(menu, 'background'));
  });

  it('gives a menu row the mockup height, which is also a usable target', () => {
    const item = block('contextMenu', '.item');

    // `min-height` rather than `height`: a label that has wrapped in bilingual
    // mode grows its row instead of spilling out of it.
    expect(value(item, 'min-height')).toBe('44px');
    expect(value(item, 'padding')).toBe('0 12px');
    expect(value(item, 'gap')).toBe('12px');
  });

  it('wraps long bilingual menu labels instead of ellipsizing them', () => {
    const label = block('contextMenu', '.label');

    expect(value(label, 'white-space')).toBe('normal');
    expect(value(label, 'overflow-wrap')).toBe('anywhere');
    expect(values(label, 'overflow')).toHaveLength(0);
    expect(values(label, 'text-overflow')).toHaveLength(0);
  });

  it('scrolls the plus-menu preview column instead of cutting it off', () => {
    // The flyout hosting this column has a hard height and clips, so a skill
    // with several trigger chips used to push its example block somewhere it
    // was simply not drawn.
    const preview = block('plusMenu', '.plus-menu__preview');

    expect(value(preview, 'overflow')).toBe('hidden auto');
    expect(value(preview, 'min-height')).toBe('0');
    expect(scrolls(preview)).toBe(true);
  });

  /*
    A sweep rather than another hand-written case per card. Each entry names the
    card and the element that actually scrolls — which is the card itself for a
    plain list, and an inner body for anything with a pinned header.
  */
  const overlays: ReadonlyArray<{
    readonly name: string;
    readonly file: FileKey;
    /** The element that paints the card. */
    readonly card: string;
    /** Where the height bound is written — sometimes a variant of the card. */
    readonly cap: string;
    /** What actually scrolls: the card for a plain list, an inner body if the
        card has a pinned header. */
    readonly scroller: string;
  }> = [
    {
      name: 'composer plus menu',
      file: 'plusMenu',
      card: '.plus-menu__popup',
      cap: '.plus-menu__popup',
      scroller: '.plus-menu__popup',
    },
    {
      name: 'mention popover',
      file: 'mentionHome',
      card: '.mention-popover',
      cap: '.mention-popover',
      scroller: '.mention-results',
    },
    {
      name: 'workspace tab overflow popover',
      file: 'shell',
      card: '.workspace-tabs-popover',
      cap: '.workspace-tabs-popover',
      scroller: '.workspace-tabs-list',
    },
    {
      // The portal variant takes its bound from measured space at open time
      // rather than from CSS; the inline variant is the one written here.
      name: 'select menu',
      file: 'primitives',
      card: '.od-select-menu',
      cap: '.od-select-menu.inline',
      scroller: '.od-select-menu',
    },
    {
      name: 'context menu',
      file: 'contextMenu',
      card: '.menu',
      cap: '.menu',
      scroller: '.menu',
    },
  ];

  it.each(overlays)('$name paints its own background, border, shape and elevation', (overlay) => {
    const card = block(overlay.file, overlay.card);

    for (const property of ['background', 'border', 'border-radius', 'box-shadow'] as const) {
      expect(() => value(card, property)).not.toThrow();
    }
  });

  it.each(overlays)('$name bounds its height and scrolls inside that bound', (overlay) => {
    const cap = block(overlay.file, overlay.cap);
    const scroller = block(overlay.file, overlay.scroller);

    const capped = values(cap, 'max-height').length > 0 || values(cap, 'height').length > 0;
    expect(capped).toBe(true);
    expect(scrolls(scroller)).toBe(true);
  });
});

describe('viewport-budget and stacking contracts', () => {
  it('budgets Handoff below both title and status chrome', () => {
    const page = block('handoff', '.page');
    expect(value(page, 'min-height')).toBe(
      'calc(var(--od-dvh, 100dvh) - var(--od-title-bar-height, 0px) - var(--od-status-bar-height, 28px))',
    );
  });

  it('budgets the notification portal from scale-aware chrome tokens', () => {
    const panel = block('notificationCenter', '.panel');
    expect(value(panel, 'top')).toBe(
      'calc(var(--od-title-bar-height, 0px) + var(--workspace-tabs-chrome-height, 42px) + 7px)',
    );
    expect(value(panel, 'max-height')).toBe(
      'min(640px, calc(var(--od-vh, 100vh) - var(--od-title-bar-height, 0px) - var(--workspace-tabs-chrome-height, 42px) - var(--od-status-bar-height, 28px) - 24px))',
    );
  });

  it('keeps full-window command palette inside the available content budget', () => {
    const palette = block('commandPalette', '.full');
    expect(value(palette, 'height')).toBe(
      'calc(var(--od-vh, 100vh) - var(--od-title-bar-height, 0px) - var(--workspace-tabs-chrome-height, 42px) - var(--od-status-bar-height, 28px))',
    );
    expect(value(palette, 'max-height')).toBe(
      'calc(var(--od-vh, 100vh) - var(--od-title-bar-height, 0px) - var(--workspace-tabs-chrome-height, 42px) - var(--od-status-bar-height, 28px))',
    );
  });

  it('does not create a stacking context by filtering the shell', () => {
    expect(css('shell')).not.toMatch(/html\.od-radial-open\s+\.workspace-shell\s*\{[^{}]*filter:/);
    expect(css('shell')).toContain('.workspace-radial-layer::before');
  });

  it('keeps the fixed tab chrome expandable and internally scrollable', () => {
    const chrome = block('shell', '.workspace-tabs-chrome.app-chrome-header');
    expect(values(chrome, 'min-height')).toContain('42px');
    expect(values(chrome, 'height')).toHaveLength(0);
    expect(values(chrome, 'overflow')).toHaveLength(0);
    expect(values(chrome, 'overflow-x')).toHaveLength(0);
    expect(values(chrome, 'overflow-y')).toHaveLength(0);
    const strip = block('shell', '.workspace-tabs-strip');
    expect(value(strip, 'overflow-x')).toBe('auto');
  });

  it('uses scale-aware viewport units for the inventoried full-window surfaces', () => {
    const sources: Array<[FileKey, RegExp[]]> = [
      ['messageCenter', [/height:\s*100dvh/]],
      ['viewerTools', [/max-height:\s*min\(760px,\s*calc\(100vh/]],
      ['viewerTheater', [/max-height:\s*calc\(100vh/, /max-height:\s*min\(90vh/]],
      ['workspaceDrawer', [/height:\s*min\((?:780px|760px),\s*calc\(100vh/]],
      ['entryLayout', [
        /height:\s*calc\(100dvh/,
        /max-height:\s*calc\(100dvh/,
        /max-height:\s*calc\(100vh/,
        /max-height:\s*min\((?:560px|360px),\s*calc\(100vh/,
      ]],
    ];
    for (const [file, patterns] of sources) {
      const source = css(file);
      for (const pattern of patterns) expect(source).not.toMatch(pattern);
    }
  });

  it('keeps capped overlay bodies scrollable instead of hiding their content', () => {
    const cappedSurfaces: Array<[FileKey, string]> = [
      ['messageCenter', '.list'],
      ['viewerTools', '.deploy-flow-modal__scroll'],
      ['viewerTheater', '.prompt-template-modal-body'],
      ['workspaceDrawer', '.page-creator-grid'],
      ['entryLayout', '.entry-nav-rail__language-menu'],
    ];
    for (const [file, selector] of cappedSurfaces) {
      const declarations = block(file, selector);
      expect(scrolls(declarations), `${file} ${selector}`).toBe(true);
    }
  });
});
