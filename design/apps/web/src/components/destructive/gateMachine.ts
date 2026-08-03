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

export const SLIDER_MIN = 0;
export const SLIDER_MAX = 100;

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
 */
export function moveSlider(state: GateState, value: number): GateState {
  if (!sliderUnlocked(state)) return state;
  const clamped = Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, Math.round(value)));
  if (clamped === state.slider) return state;
  return { ...state, slider: clamped };
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
