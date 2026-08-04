import { describe, expect, it } from 'vitest';

import {
  SLIDER_ADVANCE_MAX,
  SLIDER_MAX,
  beginAuthorizing,
  canAuthorize,
  completeGate,
  dismissOutcome,
  failGate,
  gateAcceptsInput,
  gateProgress,
  initialGateState,
  keysEngaged,
  moveSlider,
  sliderComplete,
  sliderUnlocked,
  toggleKey,
  type GateState,
} from '../../../src/components/destructive/gateMachine';

function withBothKeys(): GateState {
  return toggleKey(toggleKey(initialGateState(), 'first'), 'second');
}

/**
 * Run the slider up to `target` the way a hand does — repeatedly asking for the
 * destination until the machine stops giving ground. Forward movement is
 * rationed per event, so a test that wants an armed gate has to travel for it
 * exactly like the user does.
 */
function slideTo(state: GateState, target: number): GateState {
  let next = state;
  // Bounded rather than `while`: a machine that refuses to advance must fail a
  // test, not hang the suite.
  for (let guard = 0; guard < SLIDER_MAX + 1 && next.slider !== target; guard += 1) {
    const moved = moveSlider(next, target);
    if (moved === next) break;
    next = moved;
  }
  return next;
}

function slideToEnd(state: GateState): GateState {
  return slideTo(state, SLIDER_MAX);
}

describe('destructive gate — untouched', () => {
  it('starts with both keys off, the slider at zero and the slider locked', () => {
    const state = initialGateState();
    expect(state.first).toBe(false);
    expect(state.second).toBe(false);
    expect(state.slider).toBe(0);
    expect(state.phase).toBe('idle');
    expect(keysEngaged(state)).toBe(false);
    expect(sliderUnlocked(state)).toBe(false);
    expect(canAuthorize(state)).toBe(false);
  });
});

describe('destructive gate — one key', () => {
  it('leaves the slider locked with only the first key turned', () => {
    const state = toggleKey(initialGateState(), 'first');
    expect(keysEngaged(state)).toBe(false);
    expect(sliderUnlocked(state)).toBe(false);
    expect(canAuthorize(state)).toBe(false);
  });

  it('leaves the slider locked with only the second key turned', () => {
    const state = toggleKey(initialGateState(), 'second');
    expect(sliderUnlocked(state)).toBe(false);
    expect(canAuthorize(state)).toBe(false);
  });

  it('ignores the slider entirely while one key is missing', () => {
    const state = toggleKey(initialGateState(), 'first');
    const moved = moveSlider(state, SLIDER_MAX);
    // Not clamped to zero — refused, so the state object is the same one. The
    // range input's DOM value is driven from this, and a clamp would have let
    // the two drift apart.
    expect(moved).toBe(state);
    expect(moved.slider).toBe(0);
    expect(canAuthorize(moved)).toBe(false);
  });
});

describe('destructive gate — both keys', () => {
  it('unlocks the slider', () => {
    const state = withBothKeys();
    expect(keysEngaged(state)).toBe(true);
    expect(sliderUnlocked(state)).toBe(true);
    // Unlocked is still not authorized: the slider has not moved.
    expect(canAuthorize(state)).toBe(false);
  });

  it('clamps the slider to its range and rounds fractional input', () => {
    const state = withBothKeys();
    expect(moveSlider(state, -40).slider).toBe(0);
    // Out-of-range input is clamped to the range, then rationed like any other
    // forward move; it does not buy the whole travel in one event.
    expect(moveSlider(state, 480).slider).toBe(SLIDER_ADVANCE_MAX);
    // Rounding, measured over a move small enough that the ration is not what
    // decides the answer.
    const partway = moveSlider(state, SLIDER_ADVANCE_MAX);
    expect(moveSlider(partway, SLIDER_ADVANCE_MAX + 2.6).slider).toBe(SLIDER_ADVANCE_MAX + 3);
  });
});

describe('destructive gate — the travel cannot be skipped', () => {
  it('refuses to hand over the whole range for one event', () => {
    // The far end of the track under the pointer, or `End` on the keyboard:
    // both arrive as a single change carrying the maximum, and both used to
    // authorize a destructive action in one gesture.
    const jumped = moveSlider(withBothKeys(), SLIDER_MAX);
    expect(jumped.slider).toBe(SLIDER_ADVANCE_MAX);
    expect(sliderComplete(jumped)).toBe(false);
    expect(canAuthorize(jumped)).toBe(false);
  });

  it('still lets a keyboard user finish by repeating the jump', () => {
    // The accessibility half of the same rule: `End` is not disabled, it is
    // rationed, so the keyboard route stays open at a known, bounded cost.
    let state = withBothKeys();
    let presses = 0;
    while (!sliderComplete(state) && presses < SLIDER_MAX) {
      state = moveSlider(state, SLIDER_MAX);
      presses += 1;
    }
    expect(presses).toBe(Math.ceil(SLIDER_MAX / SLIDER_ADVANCE_MAX));
    expect(canAuthorize(state)).toBe(true);
  });

  it('accumulates single-step arrow presses across the whole range', () => {
    let state = withBothKeys();
    for (let step = 1; step <= SLIDER_MAX; step += 1) state = moveSlider(state, state.slider + 1);
    expect(state.slider).toBe(SLIDER_MAX);
    expect(canAuthorize(state)).toBe(true);
  });

  it('lets the slider fall all the way back in one move', () => {
    // Retreat is the safe direction and is not rationed: abandoning the travel
    // must never be more work than making it.
    const partway = slideTo(withBothKeys(), 60);
    expect(partway.slider).toBe(60);
    expect(moveSlider(partway, 0).slider).toBe(0);
  });
});

describe('destructive gate — the slider', () => {
  it('refuses to authorize part-way', () => {
    const partial = slideTo(withBothKeys(), SLIDER_MAX - 1);
    expect(partial.slider).toBe(SLIDER_MAX - 1);
    expect(sliderComplete(partial)).toBe(false);
    expect(canAuthorize(partial)).toBe(false);
    expect(gateProgress(partial)).toBeCloseTo((SLIDER_MAX - 1) / SLIDER_MAX);
  });

  it('authorizes only at the very end of its travel', () => {
    const full = slideToEnd(withBothKeys());
    expect(sliderComplete(full)).toBe(true);
    expect(canAuthorize(full)).toBe(true);
    expect(gateProgress(full)).toBe(1);
  });
});

describe('destructive gate — progress is not bankable', () => {
  it('throws the finished slider away when a key is turned back off', () => {
    const full = slideToEnd(withBothKeys());
    expect(canAuthorize(full)).toBe(true);

    const oneKeyBack = toggleKey(full, 'second');
    expect(oneKeyBack.slider).toBe(0);
    expect(canAuthorize(oneKeyBack)).toBe(false);

    // Re-arming the key does NOT restore the slider — the whole travel has to
    // be run again, which is the point.
    const rearmed = toggleKey(oneKeyBack, 'second');
    expect(rearmed.slider).toBe(0);
    expect(canAuthorize(rearmed)).toBe(false);
  });
});

describe('destructive gate — phases', () => {
  it('refuses every input while the action is running', () => {
    const running = beginAuthorizing(slideToEnd(withBothKeys()));
    expect(running.phase).toBe('authorizing');
    expect(gateAcceptsInput(running)).toBe(false);
    expect(sliderUnlocked(running)).toBe(false);
    expect(toggleKey(running, 'first')).toBe(running);
    expect(moveSlider(running, 10)).toBe(running);
    // And it cannot be authorized a second time from the running state.
    expect(canAuthorize(running)).toBe(false);
    expect(beginAuthorizing(running)).toBe(running);
  });

  it('will not begin authorizing from a state that never earned it', () => {
    const oneKey = toggleKey(initialGateState(), 'first');
    expect(beginAuthorizing(oneKey)).toBe(oneKey);
    expect(beginAuthorizing(oneKey).phase).toBe('idle');
  });

  it('pins the slider full on completion so the bar does not snap back', () => {
    const done = completeGate(beginAuthorizing(slideToEnd(withBothKeys())));
    expect(done.phase).toBe('completed');
    expect(done.slider).toBe(SLIDER_MAX);
    expect(gateAcceptsInput(done)).toBe(false);
  });

  it('resets both keys and the slider after a failure, so a retry starts over', () => {
    const failed = failGate(beginAuthorizing(slideToEnd(withBothKeys())));
    expect(failed.phase).toBe('failed');
    expect(failed.first).toBe(false);
    expect(failed.second).toBe(false);
    expect(failed.slider).toBe(0);
    // Accepting input again, but from scratch.
    expect(gateAcceptsInput(failed)).toBe(true);
    expect(sliderUnlocked(failed)).toBe(false);
    expect(canAuthorize(failed)).toBe(false);
  });
});

describe('destructive gate — what closing it means', () => {
  it('reports a cancellation only while nothing has run', () => {
    expect(dismissOutcome(initialGateState())).toBe('cancelled');
    expect(dismissOutcome(withBothKeys())).toBe('cancelled');
    expect(dismissOutcome(slideToEnd(withBothKeys()))).toBe('cancelled');
  });

  it('refuses to call an action in flight a cancellation', () => {
    // Escape and the emergency exit both close the gate here, and neither of
    // them can stop the work. Saying "cancelled" would be the gate telling the
    // user nothing happened at the one moment something already has.
    const running = beginAuthorizing(slideToEnd(withBothKeys()));
    expect(dismissOutcome(running)).toBe('dismissed');
  });

  it('refuses to call a failed attempt a cancellation either', () => {
    const failed = failGate(beginAuthorizing(slideToEnd(withBothKeys())));
    expect(dismissOutcome(failed)).toBe('dismissed');
  });

  it('reports completion when the action has already finished', () => {
    const done = completeGate(beginAuthorizing(slideToEnd(withBothKeys())));
    expect(dismissOutcome(done)).toBe('completed');
  });
});
