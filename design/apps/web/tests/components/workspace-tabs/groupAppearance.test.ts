import { describe, expect, it } from 'vitest';

import {
  isTabGroupDecorated,
  reconcileTabGroupDecorations,
  resetTabGroupDecoration,
  sanitizeTabGroupDecoration,
  sanitizeTabGroupDecorations,
  setTabGroupDecorationProperty,
  tabGroupDecorationFor,
  tabGroupDecorationStyle,
} from '../../../src/components/workspace-tabs/groupAppearance';

// The decoration is a sparse override record, and the whole design rests on
// that: reset is deletion, so a reset group follows the theme afterwards rather
// than being pinned to a snapshot of whatever the theme was at reset time.

describe('sanitizeTabGroupDecoration', () => {
  it('keeps a readable hex colour, lowercased', () => {
    expect(sanitizeTabGroupDecoration({ accent: '#4C8DFF' })).toEqual({ accent: '#4c8dff' });
  });

  it('drops a colour it cannot read back', () => {
    expect(sanitizeTabGroupDecoration({ accent: 'rebeccapurple' })).toBeNull();
    expect(sanitizeTabGroupDecoration({ accent: 'var(--accent)' })).toBeNull();
  });

  it('drops a size or radius outside the range the editor can express', () => {
    expect(sanitizeTabGroupDecoration({ fontSize: 400 })).toBeNull();
    expect(sanitizeTabGroupDecoration({ radius: -4 })).toBeNull();
    expect(sanitizeTabGroupDecoration({ fontSize: 14 })).toEqual({ fontSize: 14 });
  });

  it('drops a weight that is not one of the offered weights', () => {
    expect(sanitizeTabGroupDecoration({ fontWeight: 431 })).toBeNull();
    expect(sanitizeTabGroupDecoration({ fontWeight: 700 })).toEqual({ fontWeight: 700 });
  });

  it('counts a badge by code point, so an emoji is not cut in half', () => {
    // Sliced by UTF-16 unit, a four-emoji badge would end on a lone surrogate
    // and render as a box.
    expect(sanitizeTabGroupDecoration({ badge: '🍡🍤🥟🥠🍥' })).toEqual({ badge: '🍡🍤🥟🥠' });
  });

  it('returns null for a decoration with nothing left in it', () => {
    expect(sanitizeTabGroupDecoration({})).toBeNull();
    expect(sanitizeTabGroupDecoration({ badge: '   ' })).toBeNull();
    expect(sanitizeTabGroupDecoration('nope')).toBeNull();
  });
});

describe('sanitizeTabGroupDecorations', () => {
  it('drops a group whose whole decoration was unreadable', () => {
    expect(
      sanitizeTabGroupDecorations({ g1: { accent: '#fff' }, g2: { accent: 'nonsense' } }),
    ).toEqual({ g1: { accent: '#fff' } });
  });

  it('reads a v2 payload — no decorations at all — as none', () => {
    expect(sanitizeTabGroupDecorations(undefined)).toEqual({});
  });
});

describe('reconcileTabGroupDecorations', () => {
  it('forgets a decoration for a group that no longer exists', () => {
    expect(reconcileTabGroupDecorations({ g1: { accent: '#fff' } }, ['g2'])).toEqual({});
  });

  it('returns the same object when nothing changed', () => {
    const decorations = { g1: { accent: '#fff' } };
    expect(reconcileTabGroupDecorations(decorations, ['g1'])).toBe(decorations);
  });
});

describe('setTabGroupDecorationProperty', () => {
  it('sets one property without disturbing the others', () => {
    const next = setTabGroupDecorationProperty(
      { g1: { accent: '#111111', fontWeight: 600 } },
      'g1',
      'radius',
      8,
    );
    expect(next.g1).toEqual({ accent: '#111111', fontWeight: 600, radius: 8 });
  });

  it('clears one property by setting it to undefined', () => {
    const next = setTabGroupDecorationProperty(
      { g1: { accent: '#111111', radius: 8 } },
      'g1',
      'radius',
      undefined,
    );
    expect(next.g1).toEqual({ accent: '#111111' });
  });

  it('removes the group entirely once its last property is cleared', () => {
    // So "has this group been customised" stays one presence check, rather than
    // a walk looking for a surviving non-undefined field.
    const next = setTabGroupDecorationProperty({ g1: { radius: 8 } }, 'g1', 'radius', undefined);
    expect(next).toEqual({});
    expect(isTabGroupDecorated(next, 'g1')).toBe(false);
  });
});

describe('resetTabGroupDecoration', () => {
  it('drops the whole group and leaves its neighbours alone', () => {
    expect(resetTabGroupDecoration({ g1: { radius: 8 }, g2: { radius: 2 } }, 'g1')).toEqual({
      g2: { radius: 2 },
    });
  });

  it('makes the group emit no custom properties at all afterwards', () => {
    const reset = resetTabGroupDecoration({ g1: { accent: '#fff', radius: 8 } }, 'g1');
    // No property means no `var()` override, which means the stylesheet's own
    // fallback applies — the theme, live, not a copy of it.
    expect(tabGroupDecorationStyle(tabGroupDecorationFor(reset, 'g1'))).toEqual({});
  });
});

describe('tabGroupDecorationStyle', () => {
  it('emits only the properties that were actually set', () => {
    expect(tabGroupDecorationStyle({ accent: '#4c8dff', fontSize: 13 })).toEqual({
      '--wt-group-accent': '#4c8dff',
      '--wt-group-size': '13px',
    });
  });

  it('emits every property the stylesheet reads', () => {
    // Each key below has a matching `var()` in `WorkspaceTabsBar.module.css`.
    // A property emitted here with no reader there would be a control that
    // persists a value nothing renders — the exact defect this pins against.
    expect(
      tabGroupDecorationStyle({
        accent: '#111111',
        labelColor: '#222222',
        background: '#333333',
        fontWeight: 700,
        fontSize: 12,
        radius: 6,
      }),
    ).toEqual({
      '--wt-group-accent': '#111111',
      '--wt-group-label': '#222222',
      '--wt-group-bg': '#333333',
      '--wt-group-weight': '700',
      '--wt-group-size': '12px',
      '--wt-group-radius': '6px',
    });
  });

  it('does not put the badge in the style — it is rendered as text', () => {
    expect(tabGroupDecorationStyle({ badge: '🥟' })).toEqual({});
  });
});
