// The super-confirmation gate's rules, with no DOM in them.
//
// Two keys and a slider is a *sequence*, and a sequence is exactly the kind of
// thing that rots when it is spread across event handlers: one handler forgets
// that a key came back off, another lets a second `change` through while the
// action is already running, and the gate quietly becomes a button. Keeping the
// rules here means each of them can be stated once and asserted directly —
// untouched, one key, both keys, part-way, all the way, and every path out.
//
// The invariant that matters most is the third function down: **progress is not
// bankable**. Turning a key off throws the slider away, so there is no state in
// which one key plus an already-full slider can fire the action. Without that,
// arming both keys, sliding to the end and then turning a key back off would
// leave a gate that looks disarmed and is not.
//
// Its twin is **the travel cannot be skipped**. The range control is happy to
// hand over its whole span for one click or one `End` press, which would turn
// the deliberate drag back into the single reflex the gate exists to refuse, so
// forward movement is rationed per input event here rather than trusted from
// the DOM.

export const SLIDER_MIN = 0;
export const SLIDER_MAX = 100;

/**
 * The furthest one input event may carry the slider forward.
 *
 * A `<input type="range">` hands out the whole range for free: clicking the far
 * end of the track, pressing `End`, or flicking the thumb across all arrive as a
 * *single* change event carrying 100. That turned the deliberate full-range
 * drag this gate is built around back into a one-gesture button — the exact
 * thing two keys and a slider exist to prevent.
 *
 * Rationing forward movement per event is what makes the travel real: no single
 * click, key or flick can cross more than a fifth of the range, so authorizing
 * costs at least five separate deliberate advances however it is driven. It
 * deliberately does not close the keyboard route — `End` and `PageUp` still
 * work, they simply have to be pressed again, and the arrow keys still walk the
 * range a step at a time as they always did.
 */
export const SLIDER_ADVANCE_MAX = 20;

export type GateKeyId = 'first' | 'second';

/**
 * `idle` — accepting input. `authorizing` — the action is running and the gate
 * refuses further input. `completed` — it ran; the completion animation is
 * playing. `failed` — it ran and did not work; the gate is back to accepting
 * input, from scratch.
 */
export type GatePhase = 'idle' | 'authorizing' | 'completed' | 'failed';

export interface GateState {
  first: boolean;
  second: boolean;
  slider: number;
  phase: GatePhase;
}

export function initialGateState(): GateState {
  return { first: false, second: false, slider: SLIDER_MIN, phase: 'idle' };
}

/** Both keys turned. Necessary for the slider to move, never sufficient to fire. */
export function keysEngaged(state: GateState): boolean {
  return state.first && state.second;
}

/** The gate is accepting input at all: not mid-flight, not finished. */
export function gateAcceptsInput(state: GateState): boolean {
  return state.phase === 'idle' || state.phase === 'failed';
}

export function sliderUnlocked(state: GateState): boolean {
  return keysEngaged(state) && gateAcceptsInput(state);
}

export function sliderComplete(state: GateState): boolean {
  return state.slider >= SLIDER_MAX;
}

/**
 * Turn a key. Turning either one OFF resets the slider, because progress made
 * under two keys is not progress that one key may keep.
 */
export function toggleKey(state: GateState, key: GateKeyId): GateState {
  if (!gateAcceptsInput(state)) return state;
  const next: GateState = { ...state, [key]: !state[key] };
  if (!keysEngaged(next)) next.slider = SLIDER_MIN;
  return next;
}

/**
 * Move the slider. A locked slider ignores the move entirely rather than
 * clamping it to zero — the difference matters for the `<input type="range">`,
 * whose DOM value would otherwise drift away from the state behind it.
 *
 * Forward movement is rationed by `SLIDER_ADVANCE_MAX`; backward movement is
 * not. Letting go and falling back to zero is the safe direction, and a user
 * who wants to abandon the travel should not have to walk it back one step at a
 * time to do it.
 */
export function moveSlider(state: GateState, value: number): GateState {
  if (!sliderUnlocked(state)) return state;
  const clamped = Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, Math.round(value)));
  const next =
    clamped > state.slider ? Math.min(clamped, state.slider + SLIDER_ADVANCE_MAX) : clamped;
  if (next === state.slider) return state;
  return { ...state, slider: next };
}

/** Both keys turned AND the slider run to the end AND nothing already running. */
export function canAuthorize(state: GateState): boolean {
  return keysEngaged(state) && sliderComplete(state) && gateAcceptsInput(state);
}

export function beginAuthorizing(state: GateState): GateState {
  if (!canAuthorize(state)) return state;
  return { ...state, phase: 'authorizing' };
}

export function completeGate(state: GateState): GateState {
  return { ...state, phase: 'completed', slider: SLIDER_MAX };
}

/**
 * The action ran and failed. Everything resets: a retry is a fresh
 * authorization, not a second press of an already-armed trigger.
 */
export function failGate(state: GateState): GateState {
  return { first: false, second: false, slider: SLIDER_MIN, phase: 'failed' };
}

/** 0…1, for the charge bar. */
export function gateProgress(state: GateState): number {
  return state.slider / SLIDER_MAX;
}

/**
 * How the gate ended, as the host will be told.
 *
 * `cancelled` is a promise that nothing ran. `dismissed` is the honest middle
 * case the gate previously had no word for: the user closed it after the action
 * had already been started, so whether anything was destroyed is not the gate's
 * to claim. `completed` is the action having run to a result.
 */
export type GateOutcome = 'cancelled' | 'dismissed' | 'completed';

/**
 * The outcome to report when the user closes the gate — Escape, the emergency
 * exit, or the backdrop.
 *
 * Escape is always available and always closes, but what it *means* depends on
 * how far the gate got. Reporting `cancelled` for a phase in which `onConfirm`
 * has already been called tells the host — and through it the user — that
 * nothing happened, at the one moment when something already has. The emergency
 * exit closes the gate; it has never been able to stop the action.
 */
export function dismissOutcome(state: GateState): GateOutcome {
  switch (state.phase) {
    case 'completed':
      return 'completed';
    // `failed` counts as run, not cancelled: the action was called and reported
    // a failure, which is not the same as it never having been attempted.
    case 'authorizing':
    case 'failed':
      return 'dismissed';
    default:
      return 'cancelled';
  }
}
