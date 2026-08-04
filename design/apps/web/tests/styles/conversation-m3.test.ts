import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Material Design 3 anatomy for the conversation (roadmap § 2.4 Wave 5) —
 * the two message bubbles, the tool-call card, the typing indicator, and the
 * composer with its morphing send button.
 *
 * Two cascade traps make this surface worth pinning rather than trusting.
 *
 * 1. The chat renders inside `<div className="app">` (`ProjectView`), and
 *    `styles/viewer/routines.css` carries `.app `-prefixed twins of nearly
 *    every chat rule. Those twins outrank `styles/chat.css`, so an edit to
 *    the file a reader finds by following the import changes nothing.
 * 2. The COMPOSER is the mirror image: `ChatPane` portals it to
 *    `document.body`, so the `.app .composer-*` twins render nowhere at all
 *    and the `.chat-composer-fixed-layer` ones are live.
 *
 * Every expectation below is the literal text in the source.
 */

const read = (relative: string) =>
  readFileSync(new URL(relative, import.meta.url), 'utf8');

const chatCss = read('../../src/styles/chat.css');
const routinesCss = read('../../src/styles/viewer/routines.css');

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

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

/** The corner an M3 chat bubble draws on the side the message came from. */
const TAIL_RIGHT =
  'var(--md-sys-shape-corner-l) var(--md-sys-shape-corner-l)'
  + ' var(--md-sys-shape-corner-xs) var(--md-sys-shape-corner-l)';
const TAIL_LEFT =
  'var(--md-sys-shape-corner-l) var(--md-sys-shape-corner-l)'
  + ' var(--md-sys-shape-corner-l) var(--md-sys-shape-corner-xs)';

/* ------------------------------------------------------------------ */

describe('message bubbles (M3)', () => {
  it('draws the user bubble as a primary-container tonal bubble', () => {
    const live = declarations(routinesCss, '.app .msg.user .user-text');
    expect(value(live, 'background')).toBe('var(--md-sys-color-primary-container)');
    expect(value(live, 'color')).toBe('var(--md-sys-color-on-primary-container)');
    expect(value(live, 'border-radius')).toBe(TAIL_RIGHT);
    expect(value(live, 'border')).toBe('none');
    expect(value(live, 'padding')).toBe('12px 16px');
    // A bubble sits on the conversation, it does not float above it.
    expect(value(live, 'box-shadow')).toBe('var(--md-sys-elevation-0)');
  });

  /**
   * The two declarations of the user bubble must agree. `.app .msg.user
   * .user-text` (0,4,0) beats `.msg.user .user-text` (0,3,0) everywhere the
   * chat is rendered, so if they drift, the file a reader edits is not the
   * file that decides what a bubble looks like — the same trap the shared
   * dialog fell into with its module and global classes.
   */
  it('keeps the base rule and the shell override saying one thing', () => {
    const base = declarations(chatCss, '.msg.user .user-text');
    const live = declarations(routinesCss, '.app .msg.user .user-text');
    for (const property of [
      'padding',
      'border',
      'border-radius',
      'background',
      'color',
      'line-height',
      'font-size',
      'box-shadow',
    ]) {
      expect(value(base, property), property).toBe(value(live, property));
    }
  });

  /**
   * The assistant turn had NO surface at all: `.msg` sets a transparent
   * background and nothing re-added one, so the conversation had a bubble on
   * one side and loose prose on the other.
   */
  it('gives the assistant a mirrored tonal bubble', () => {
    const prose = declarations(routinesCss, '.app .msg.assistant .prose-block');
    expect(value(prose, 'background')).toBe('var(--md-sys-color-surface-container-high)');
    expect(value(prose, 'color')).toBe('var(--md-sys-color-on-surface)');
    expect(value(prose, 'border-radius')).toBe(TAIL_LEFT);
    expect(value(prose, 'padding')).toBe('12px 16px');
    // The measure was tuned at 68ch of TEXT; padding is inside `max-width`,
    // so it has to be added back or the line shortens by two insets.
    expect(value(prose, 'max-width')).toBe('calc(68ch + 32px)');
  });

  it('gives the user status card the same corner as the bubble beside it', () => {
    const card = declarations(chatCss, '.user-status-card');
    expect(value(card, 'border-radius')).toBe(TAIL_RIGHT);
    // Not `primary-container`: this card reports something that happened, it
    // is not something the user said.
    expect(value(card, 'background')).toBe('var(--md-sys-color-surface-container-high)');
  });
});

/* ------------------------------------------------------------------ */

describe('tool-call cards (M3)', () => {
  /**
   * Before this wave both the base rule and the `.app` twin said
   * `border: none; border-radius: 0; background: none` — two files agreeing
   * that the card should not be drawn.
   */
  it('is a real card, one tone above the assistant bubble', () => {
    const card = declarations(routinesCss, '.app .op-card');
    expect(value(card, 'background')).toBe('var(--md-sys-color-surface-container)');
    expect(value(card, 'border-radius')).toBe('var(--md-sys-shape-corner-m)');
    expect(value(card, 'box-shadow')).toBe('var(--md-sys-elevation-0)');
    expect(value(card, 'overflow')).toBe('hidden');
    // `.action-card-body > .op-card` in viewer/code.css sets `padding: 4px 0`
    // at the same specificity; without this reset the fill would show above
    // and below the head instead of behind it.
    expect(value(card, 'padding')).toBe('0');

    const hover = declarations(routinesCss, '.app .op-card:hover');
    expect(value(hover, 'background')).toBe('var(--md-sys-color-surface-container-high)');
  });

  it('lets the head own the card padding and draw no corner of its own', () => {
    const head = declarations(routinesCss, '.app .op-card-head');
    expect(value(head, 'padding')).toBe('10px 14px');
    expect(value(head, 'border-radius')).toBe('0');
    expect(value(declarations(routinesCss, '.app .op-card-head:hover'), 'background'))
      .toBe('var(--ripple)');
  });
});

describe('the typing indicator (M3)', () => {
  it('is a tonal pill on the assistant side, not a bare line of text', () => {
    const pill = declarations(routinesCss, '.app .task-activity-current-thinking');
    expect(value(pill, 'background')).toBe('var(--md-sys-color-surface-container-high)');
    expect(value(pill, 'border-radius')).toBe('var(--md-sys-shape-corner-full)');
    expect(value(pill, 'color')).toBe('var(--md-sys-color-on-surface-variant)');
    expect(value(pill, 'padding')).toBe('0 16px');
    // It must not stretch across the pane: a status is as wide as its words.
    expect(value(pill, 'width')).toBe('fit-content');
  });
});

/* ------------------------------------------------------------------ */

describe('the composer and its morphing send button', () => {
  it('morphs the send corner on hover, on the spring curve', () => {
    const base = declarations(chatCss, '.composer-send');
    expect(value(base, 'background')).toBe('var(--md-sys-color-primary)');
    expect(value(base, 'color')).toBe('var(--md-sys-color-on-primary)');
    expect(value(base, 'border-radius')).toBe('var(--md-sys-shape-corner-s)');
    expect(value(base, 'transition')).toContain(
      'border-radius 260ms var(--md-sys-motion-spring)',
    );

    const hover = declarations(chatCss, '.composer-send:hover:not(:disabled)');
    expect(value(hover, 'border-radius')).toBe('var(--md-sys-shape-corner-l)');
  });

  /**
   * The composer is portaled to `document.body`, so `.chat-composer-fixed-layer`
   * is the live twin and `.app` is inert. Both are asserted: an inert rule
   * that says something different from the live one is how a fix gets written
   * into the wrong file and reported as done.
   */
  it('states the morph on both composer twins, live and inert', () => {
    for (const scope of ['.app', '.chat-composer-fixed-layer']) {
      const rest = declarations(routinesCss, `${scope} .composer-send`);
      expect(value(rest, 'border-radius'), scope).toBe('var(--md-sys-shape-corner-s)');
      const hover = declarations(routinesCss, `${scope} .composer-send:hover:not(:disabled)`);
      expect(value(hover, 'border-radius'), scope).toBe('var(--md-sys-shape-corner-l)');
    }
  });

  /**
   * `.composer-send` used to sit in a grouped rule that flattened its corner
   * to `--radius-sm`. That rule outranks the base one, so leaving send in the
   * group would have pinned both ends of the animation to one value and the
   * morph would have been written, shipped, and invisible.
   */
  it('has left the flat-radius toolbar group', () => {
    // The group still exists and still flattens the + button's corner…
    for (const group of [
      '.app .composer-row .icon-btn',
      '.chat-composer-fixed-layer .composer-row .icon-btn',
    ]) {
      expect(declarations(routinesCss, group), group).toContain('var(--radius-sm)');
    }
    // …and send is no longer in it. `declarations` joins EVERY block whose
    // selector list names the send button, so if it is re-added to that
    // group the flat radius reappears here and this fails, instead of the
    // morph dying silently on screen.
    for (const scope of ['.app', '.chat-composer-fixed-layer']) {
      expect(declarations(routinesCss, `${scope} .composer-send`), scope)
        .not.toContain('var(--radius-sm)');
    }
  });

  it('draws the composer card on an M3 surface at corner-l', () => {
    const base = declarations(chatCss, '.composer-shell');
    expect(value(base, 'background')).toBe('var(--md-sys-color-surface-container-high)');
    expect(value(base, 'border')).toBe('1px solid var(--md-sys-color-outline-variant)');
    expect(value(base, 'border-radius')).toBe('var(--md-sys-shape-corner-l)');

    // The live twin sets no background of its own, so the base fill above is
    // what renders; the radius and the border are restated here and have to
    // agree with it.
    const live = declarations(routinesCss, '.chat-composer-fixed-layer .composer-shell');
    expect(value(live, 'border-radius')).toBe('var(--md-sys-shape-corner-l)');
    expect(value(live, 'border-color')).toBe('var(--md-sys-color-outline-variant)');

    const focus = declarations(
      routinesCss,
      '.chat-composer-fixed-layer .composer-shell:focus-within',
    );
    expect(value(focus, 'border-color')).toBe('var(--md-sys-color-primary)');
  });

  it('stops the morph under prefers-reduced-motion', () => {
    expect(value(declarations(chatCss, '.composer-send', 1), 'transition')).toBe('none');
  });
});
