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
  figmaImportModal: '../../src/components/FigmaImportModal.module.css',
  handoff: '../../src/components/handoff/HandoffView.module.css',
  notificationCenter: '../../src/components/notifications/NotificationCenter.module.css',
  commandPalette: '../../src/components/command-palette/CommandPalette.module.css',
  viewerCore: '../../src/styles/viewer/core.css',
  messageCenter: '../../src/components/MessageCenter.module.css',
  viewerTools: '../../src/styles/viewer/tools.css',
  viewerTheater: '../../src/styles/viewer/theater.css',
  workspaceDrawer: '../../src/styles/workspace/drawer.css',
  entryLayout: '../../src/styles/home/entry-layout.css',
  dialogModule: '../../../../packages/components/src/dialog.module.css',
  mentionHome: '../../src/styles/workspace/mention-home.css',
  notifications: '../../src/components/notifications/NotificationCenter.module.css',
  plusMenu: '../../src/styles/home/plus-menu.css',
  primitives: '../../src/styles/primitives.css',
  shell: '../../src/styles/shell.css',
} as const;

type FileKey = keyof typeof files;

const cache = new Map<FileKey, string>();
const workspaceTabsBarSource = readFileSync(
  new URL('../../src/components/WorkspaceTabsBar.tsx', import.meta.url),
  'utf8',
);

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
  const blocks = cssBlocks(css(file))
    .filter((entry) => entry.atRuleHeaders.length === 0 && entry.selectors.includes(selector))
    .map((entry) => entry.body);
  if (blocks.length === 0) throw new Error(`Missing CSS block for ${selector} in ${files[file]}`);
  return blocks.join('\n');
}

interface ParsedCssBlock {
  readonly selectors: string[];
  readonly body: string;
  readonly atRuleHeaders: readonly string[];
}

/**
 * Parse balanced CSS blocks instead of using a lazy any-character bridge.
 * Nested media rules are retained with their containing at-rule headers, while
 * at-rule containers themselves are not treated as selectors. Ordinary block()
 * assertions intentionally select only root blocks; blockFromSource() remains
 * the explicit escape hatch for assertions scoped to a responsive at-rule body.
 * This keeps exact selector assertions from matching a child rule or crossing a
 * nested brace boundary.
 */
function cssBlocks(source: string): ParsedCssBlock[] {
  const entries: ParsedCssBlock[] = [];
  const stack: Array<{ header: string; bodyStart: number }> = [];
  let segmentStart = 0;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '{') {
      stack.push({
        header: source.slice(segmentStart, index).trim(),
        bodyStart: index + 1,
      });
      segmentStart = index + 1;
      continue;
    }
    if (character === '}') {
      const open = stack.pop();
      if (!open) continue;
      if (!open.header.startsWith('@')) {
        entries.push({
          selectors: open.header.split(',').map((item) => item.trim()),
          body: source.slice(open.bodyStart, index),
          atRuleHeaders: stack
            .filter(({ header }) => header.startsWith('@'))
            .map(({ header }) => header),
        });
      }
      segmentStart = index + 1;
    }
  }
  return entries;
}

describe('CSS block parser', () => {
  it('keeps top-level viewport fallbacks separate from auto and none media blocks', () => {
    const source = `
      .surface {
        max-height: calc(100vh - 16px);
        max-height: calc(100dvh - 16px);
      }
      @media (display-mode: auto) {
        .surface {
          max-height: calc(100vh - 32px);
          max-height: calc(100dvh - 32px);
        }
      }
      @media (display-mode: none) {
        .surface {
          max-height: calc(100vh - 48px);
          max-height: calc(100dvh - 48px);
        }
      }
    `;
    const entries = cssBlocks(source).filter((entry) => entry.selectors.includes('.surface'));

    expect(entries).toHaveLength(3);
    expect(entries.map((entry) => entry.atRuleHeaders)).toEqual([
      [],
      ['@media (display-mode: auto)'],
      ['@media (display-mode: none)'],
    ]);

    const root = entries
      .filter((entry) => entry.atRuleHeaders.length === 0)
      .map((entry) => entry.body)
      .join('\n');
    expect(values(root, 'max-height')).toEqual([
      'calc(100vh - 16px)',
      'calc(100dvh - 16px)',
    ]);
  });
});

function blockFromSource(source: string, selector: string): string {
  const blocks = cssBlocks(source)
    .filter((entry) => entry.selectors.includes(selector))
    .map((entry) => entry.body);
  if (blocks.length === 0) throw new Error(`Missing CSS block for ${selector}`);
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

function atRuleBody(source: string, header: string): string {
  const headerStart = source.indexOf(header);
  if (headerStart < 0) throw new Error(`Missing at-rule ${header}`);
  const openingBrace = source.indexOf('{', headerStart + header.length);
  if (openingBrace < 0) throw new Error(`Missing body for ${header}`);
  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    const character = source[index];
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openingBrace + 1, index);
    }
  }
  throw new Error(`Unclosed at-rule ${header}`);
}

describe('overlay surfaces', () => {
  it('publishes one root-readable chrome geometry contract for body portals', () => {
    const tokens = readFileSync(new URL('../../src/styles/md3-tokens.css', import.meta.url), 'utf8');
    const shell = readFileSync(new URL('../../src/styles/shell.css', import.meta.url), 'utf8');
    expect(tokens).toContain('--od-title-bar-height: 0px;');
    expect(tokens).toContain('--workspace-tabs-chrome-height: 42px;');
    expect(tokens).not.toContain('--workspace-tabs-chrome-height: 38px;');
    expect(tokens).not.toContain('--workspace-tabs-chrome-height: 44px;');
    expect(shell).toContain(
      ':root:has(.workspace-shell > [data-window-title-bar]) {\n'
      + '  --od-title-bar-height: 40px;\n'
      + '}',
    );
  });

  it('keeps every inventoried fixed chrome surface below the title and tab rows', () => {
    const expectedTop = 'calc(var(--od-title-bar-height, 0px) + var(--workspace-tabs-chrome-height, 42px) + 7px)';
    expect(value(block('shell', '.workspace-tabs-popover'), 'top')).toBe(expectedTop);
    expect(value(block('notifications', '.panel'), 'top')).toBe(expectedTop);
    expect(value(block('shell', '.artifact-version-panel'), 'top')).toContain('var(--od-title-bar-height');
    expect(value(block('shell', '.comment-float-host'), 'top')).toContain('var(--od-title-bar-height');
    expect(value(block('entryLayout', '.entry-top-right-cluster'), 'top')).toContain('var(--od-title-bar-height');
    expect(value(block('entryLayout', '.entry-top-right-cluster'), 'top')).not.toBe('9px');
    expect(value(block('entryLayout', '.entry-top-right-cluster'), 'top')).toContain('var(--workspace-tabs-chrome-height');
    expect(value(block('shell', '.artifact-version-panel'), 'top')).toContain('var(--workspace-tabs-chrome-height');
    expect(value(block('shell', '.comment-float-host'), 'top')).toContain('var(--workspace-tabs-chrome-height');
    expect(value(block('shell', '.workspace-tabs-popover'), 'max-height')).toContain('var(--od-title-bar-height');
    expect(value(block('notifications', '.panel'), 'max-height')).toContain('var(--od-title-bar-height');
  });

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
    expect(value(card, 'box-shadow')).toBe('var(--md-sys-elevation-3)');
  });

  it('bounds the dialog to the viewport and scrolls it there, in both height units', () => {
    const card = block('dialogModule', ':where(.dialog)');

    // Ordered so `dvh` wins where it is understood: on a host whose viewport
    // shrinks under an on-screen keyboard, `vh` keeps the old taller number.
    expect(values(card, 'max-height')).toEqual([
      'calc(var(--od-vh, 100vh) - var(--od-title-bar-height, 0px) - var(--workspace-tabs-chrome-height, 42px) - var(--od-status-bar-height, 28px) - 48px)',
      'calc(var(--od-dvh, 100dvh) - var(--od-title-bar-height, 0px) - var(--workspace-tabs-chrome-height, 42px) - var(--od-status-bar-height, 28px) - 48px)',
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
    expect(value(menu, 'border-radius')).toBe('var(--md-sys-shape-corner-m)');
    expect(value(menu, 'box-shadow')).toBe('var(--md-sys-elevation-3)');
    expect(values(menu, 'max-height')).toEqual([
      'calc(var(--od-vh, 100vh) - 16px)',
      'calc(var(--od-dvh, 100dvh) - 16px)',
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

  it('keeps radial scrim and full palette hit surfaces below title and tab chrome', () => {
    const radialLayer = block('shell', '.workspace-radial-layer');
    expect(value(radialLayer, 'inset')).toBe('var(--od-title-bar-height, 0px) 0 0');
    const fullOverlay = block('commandPalette', '.overlay:has(.full)');
    expect(value(fullOverlay, 'inset')).toBe('var(--od-title-bar-height, 0px) 0 0');
    expect(value(fullOverlay, 'padding-top')).toBe('var(--workspace-tabs-chrome-height, 42px)');
  });

  it('stops radial scrim and menu motion when reduced motion is requested', () => {
    const backdrop = block('shell', '.workspace-radial-layer::before');
    expect(value(backdrop, 'pointer-events')).toBe('none');
    const reducedMotion = atRuleBody(css('shell'), '@media (prefers-reduced-motion: reduce)');
    expect(reducedMotion).toContain('.workspace-radial-layer,');
    expect(reducedMotion).toContain('.workspace-radial-menu { animation: none; }');
  });

  it('does not retain an inert root class lifecycle for radial blur', () => {
    expect(workspaceTabsBarSource).not.toContain('od-radial-open');
    expect(workspaceTabsBarSource).toContain("window.addEventListener('keydown', onKey);");
  });

  it('offsets the screenshot toast from the real title-bar height', () => {
    const toast = block('viewerCore', '.screenshot-toast-anchor');
    expect(value(toast, 'top')).toBe('calc(var(--od-title-bar-height, 0px) + 64px)');
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

describe('final viewport geometry inventory', () => {
  const title = 'var(--od-title-bar-height, 0px)';
  const tabs = 'var(--workspace-tabs-chrome-height, 42px)';
  const status = 'var(--od-status-bar-height, 28px)';

  function viewportBudget(unit: 'vh' | 'dvh', inset: string): string {
    const value = unit === 'vh' ? 'var(--od-vh, 100vh)' : 'var(--od-dvh, 100dvh)';
    return `calc(${value} - ${title} - ${tabs} - ${status} - ${inset})`;
  }

  function bodyBudget(unit: 'vh' | 'dvh', inset: string): string {
    const value = unit === 'vh' ? 'var(--od-vh, 100vh)' : 'var(--od-dvh, 100dvh)';
    return `calc(${value} - ${inset})`;
  }

  it('uses scale-aware viewport bounds and keeps both overlay cards internally scrollable', () => {
    const menu = block('contextMenu', '.menu');
    expect(values(menu, 'max-height')).toEqual([
      'calc(var(--od-vh, 100vh) - 16px)',
      'calc(var(--od-dvh, 100dvh) - 16px)',
    ]);
    expect(scrolls(menu)).toBe(true);

    const figma = block('figmaImportModal', '.modal');
    expect(values(figma, 'max-height')).toEqual([
      'min(720px, calc(var(--od-vh, 100vh) - 64px))',
      'min(720px, calc(var(--od-dvh, 100dvh) - 64px))',
    ]);
    expect(value(figma, 'overflow')).toBe('hidden');
    expect(scrolls(block('figmaImportModal', '.body'))).toBe(true);

    const figmaNarrow = blockFromSource(
      atRuleBody(css('figmaImportModal'), '@media (max-width: 520px)'),
      '.modal',
    );
    expect(values(figmaNarrow, 'max-height')).toEqual([
      'calc(var(--od-vh, 100vh) - 24px)',
      'calc(var(--od-dvh, 100dvh) - 24px)',
    ]);
  });

  it('brackets the body-portaled message sheet between title and status chrome at every width', () => {
    const panel = block('messageCenter', '.panel');
    const panelHeightVh = `calc(var(--od-vh, 100vh) - ${title} - ${status})`;
    const panelHeightDvh = `calc(var(--od-dvh, 100dvh) - ${title} - ${status})`;
    expect(values(panel, 'height')).toEqual([panelHeightVh, panelHeightDvh]);
    expect(values(panel, 'margin-block-start')).toEqual([title, title]);
    expect(values(panel, 'margin-block-end')).toEqual([status, status]);
    expect(value(panel, 'overflow')).toBe('hidden');
    expect(scrolls(block('messageCenter', '.list'))).toBe(true);
  });

  it('subtracts all actual chrome from body-portaled viewer and modal budgets', () => {
    const deploy = block('viewerTools', '.deploy-modal');
    expect(values(deploy, 'max-height')).toEqual([
      bodyBudget('vh', '32px'),
      bodyBudget('dvh', '32px'),
    ]);
    expect(scrolls(deploy)).toBe(true);

    const deployFlow = block('viewerTools', '.deploy-flow-modal.modal');
    expect(values(deployFlow, 'max-height')).toEqual([
      `min(760px, ${viewportBudget('vh', '2px')})`,
      `min(760px, ${viewportBudget('dvh', '2px')})`,
    ]);
    expect(scrolls(block('viewerTools', '.deploy-flow-modal__scroll'))).toBe(true);

    const prompt = block('viewerTheater', '.prompt-template-modal');
    expect(values(prompt, 'max-height')).toEqual([
      `min(90%, ${viewportBudget('vh', '48px')})`,
      `min(90%, ${viewportBudget('dvh', '48px')})`,
    ]);
    expect(scrolls(block('viewerTheater', '.prompt-template-modal-body'))).toBe(true);

    const generic = block('mentionHome', '.modal');
    expect(values(generic, 'max-height')).toEqual([
      viewportBudget('vh', '48px'),
      viewportBudget('dvh', '48px'),
    ]);
    expect(scrolls(generic)).toBe(true);
  });

  it('keeps entry overlays scale-aware without subtracting shell chrome twice', () => {
    const onboardingShell = block('entryLayout', '.entry-shell--onboarding');
    expect(value(onboardingShell, 'min-height')).toBe('100%');
    expect(values(onboardingShell, 'min-height').join(' ')).not.toMatch(/100(?:d)?vh/);

    const onboardingModal = block('entryLayout', '.entry-onboarding-modal');
    expect(values(onboardingModal, 'height')).toEqual(['100%']);

    const settings = block('entryLayout', '.entry-settings-menu__popover');
    expect(values(settings, 'max-height')).toEqual([
      'min(760px, calc(var(--od-vh, 100vh) - 92px))',
      'min(760px, calc(var(--od-dvh, 100dvh) - 92px))',
    ]);
    expect(value(settings, 'overflow-y')).toBe('auto');

    const designSystemsAside = block('entryLayout', '[data-testid="design-systems-tab"] > aside');
    expect(values(designSystemsAside, 'height')).toEqual([
      'calc(var(--od-vh, 100vh) - 184px - var(--spacing-16))',
      'calc(var(--od-dvh, 100dvh) - 184px - var(--spacing-16))',
    ]);
    expect(values(designSystemsAside, 'max-height')).toEqual([
      'calc(var(--od-vh, 100vh) - 184px - var(--spacing-16))',
      'calc(var(--od-dvh, 100dvh) - 184px - var(--spacing-16))',
    ]);

    const switcher = block('entryLayout', '.inline-switcher__popover');
    expect(values(switcher, 'max-height')).toEqual([
      'min(560px, calc(var(--od-vh, 100vh) - 96px))',
      'min(560px, calc(var(--od-dvh, 100dvh) - 96px))',
    ]);
    expect(value(switcher, 'max-width')).toBe('calc(var(--od-vw, 100vw) - 24px)');
    expect(value(switcher, 'border')).toBe('1px solid var(--md-sys-color-outline-variant)');
    expect(value(switcher, 'border-radius')).toBe('var(--md-sys-shape-corner-m)');
    expect(value(switcher, 'background')).toBe('var(--md-sys-color-surface-container)');
    expect(value(switcher, 'box-shadow')).toBe('var(--md-sys-elevation-2)');
    expect(scrolls(switcher)).toBe(true);

    const language = block('entryLayout', '.entry-nav-rail__language-menu');
    expect(values(language, 'max-height')).toEqual([
      'min(360px, calc(var(--od-vh, 100vh) - 180px))',
      'min(360px, calc(var(--od-dvh, 100dvh) - 180px))',
    ]);
    expect(scrolls(language)).toBe(true);

    for (const selector of ['.entry-invite__panel', '.credit-upgrade', '.upgrade-team'] as const) {
      const declarations = block('entryLayout', selector);
      expect(values(declarations, 'max-height')).toEqual([
        bodyBudget('vh', '48px'),
        bodyBudget('dvh', '48px'),
      ]);
      expect(scrolls(declarations)).toBe(true);
    }
  });

  it('gives onboarding and account menus explicit scroll owners', () => {
    const onboarding = block('entryLayout', '.onboarding-view__select-menu');
    expect(value(onboarding, 'display')).toBe('flex');
    expect(value(onboarding, 'flex-direction')).toBe('column');
    expect(value(onboarding, 'min-height')).toBe('0');
    expect(value(onboarding, 'overflow')).toBe('hidden');
    const onboardingOptions = block('entryLayout', '.onboarding-view__select-options');
    expect(value(onboardingOptions, 'flex')).toBe('1 1 auto');
    expect(value(onboardingOptions, 'min-height')).toBe('0');
    expect(value(onboardingOptions, 'overflow-y')).toBe('auto');

    const account = block('entryLayout', '.entry-nav-rail__account-menu');
    expect(value(account, 'display')).toBe('flex');
    expect(value(account, 'flex-direction')).toBe('column');
    expect(values(account, 'max-height')).toEqual([
      'min(520px, calc(var(--od-vh, 100vh) - 160px))',
      'min(520px, calc(var(--od-dvh, 100dvh) - 160px))',
    ]);
    expect(value(account, 'overflow-y')).toBe('auto');
    expect(value(account, 'overscroll-behavior')).toBe('contain');

    const team = block('entryLayout', '.entry-nav-rail__team-menu');
    expect(value(team, 'overflow')).toBe('hidden');
    const workspaces = block('entryLayout', '.entry-nav-rail__workspace-list');
    expect(value(workspaces, 'overflow-y')).toBe('auto');
  });

  it('keeps text badges and project-search rows readable while preserving media crops', () => {
    const badge = block('entryLayout', '.onboarding-view__select-badge');
    expect(value(badge, 'white-space')).toBe('normal');
    expect(value(badge, 'overflow-wrap')).toBe('anywhere');
    expect(values(badge, 'overflow')).toHaveLength(0);
    expect(values(badge, 'text-overflow')).toHaveLength(0);

    const searchModal = block('entryLayout', '.project-search-modal');
    expect(values(searchModal, 'max-height')).toEqual([
      `min(520px, ${viewportBudget('vh', '32px')})`,
      `min(520px, ${viewportBudget('dvh', '32px')})`,
    ]);
    expect(value(searchModal, 'overflow')).toBe('hidden');
    expect(scrolls(block('entryLayout', '.project-search-results'))).toBe(true);

    const resultName = block('entryLayout', '.project-search-item-name');
    expect(value(resultName, 'white-space')).toBe('normal');
    expect(value(resultName, 'overflow-wrap')).toBe('anywhere');
    expect(values(resultName, 'overflow')).toHaveLength(0);
    expect(values(resultName, 'text-overflow')).toHaveLength(0);

    const mediaCropSelectors = [
      '[data-testid^="design-system-card-"] > span:first-child',
      '.project-search-item-thumb',
    ] as const;
    for (const selector of mediaCropSelectors) {
      const crop = block('entryLayout', selector);
      expect(value(crop, 'overflow')).toBe('hidden');
      expect(scrolls(crop)).toBe(false);
    }
    expect(value(block('entryLayout', '.project-search-item-thumb img'), 'object-fit')).toBe('cover');
  });
});
