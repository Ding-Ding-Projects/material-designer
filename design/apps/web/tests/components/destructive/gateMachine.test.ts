import { describe, expect, it } from 'vitest';

import {
  SLIDER_MAX,
  beginAuthorizing,
  canAuthorize,
  completeGate,
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
    expect(moveSlider(state, 480).slider).toBe(SLIDER_MAX);
    expect(moveSlider(state, 42.6).slider).toBe(43);
  });
});

describe('destructive gate — the slider', () => {
  it('refuses to authorize part-way', () => {
    const partial = moveSlider(withBothKeys(), SLIDER_MAX - 1);
    expect(partial.slider).toBe(SLIDER_MAX - 1);
    expect(sliderComplete(partial)).toBe(false);
    expect(canAuthorize(partial)).toBe(false);
    expect(gateProgress(partial)).toBeCloseTo((SLIDER_MAX - 1) / SLIDER_MAX);
  });

  it('authorizes only at the very end of its travel', () => {
    const full = moveSlider(withBothKeys(), SLIDER_MAX);
    expect(sliderComplete(full)).toBe(true);
    expect(canAuthorize(full)).toBe(true);
    expect(gateProgress(full)).toBe(1);
  });
});

describe('destructive gate — progress is not bankable', () => {
  it('throws the finished slider away when a key is turned back off', () => {
    const full = moveSlider(withBothKeys(), SLIDER_MAX);
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
    const running = beginAuthorizing(moveSlider(withBothKeys(), SLIDER_MAX));
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
    const done = completeGate(beginAuthorizing(moveSlider(withBothKeys(), SLIDER_MAX)));
    expect(done.phase).toBe('completed');
    expect(done.slider).toBe(SLIDER_MAX);
    expect(gateAcceptsInput(done)).toBe(false);
  });

  it('resets both keys and the slider after a failure, so a retry starts over', () => {
    const failed = failGate(beginAuthorizing(moveSlider(withBothKeys(), SLIDER_MAX)));
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
