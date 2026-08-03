// Super confirmation for destructive actions, built in the app's own UI.
//
// No second window, no hosted page, no third-party challenge widget: this is an
// `alertdialog` in the same React tree, styled from the same Material Design 3
// tokens, so it inherits the theme, the density, the accent, the language mode
// and the funny level along with everything else. A gate the product does not
// own is a gate the product cannot keep truthful.
//
// What it asks for, in order:
//
//   1. **That you read what goes.** The heading names the action and the target
//      by their real names, and `items` lists the affected data one line each.
//      "Are you sure?" is the thing this component exists not to say.
//   2. **Two keys, operated independently.** Two switches with two different
//      meanings — I have read the list; I accept it will not come back — so
//      arming the gate cannot be one reflex twice.
//   3. **A slider run end to end.** The keys unlock it and nothing else does,
//      and `gateMachine.ts` makes progress non-bankable: turn a key back off
//      and the slider is thrown away with it.
//
// Everything the copy can style, it styles. Everything it must state — what is
// destroyed, whether it can be undone, what failed — is passed in as facts and
// rendered verbatim, so no funny level and no language mode can leave the user
// unsure what the slider is about to do.

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Dialog, DialogTitle } from '@open-design/components';

import { useT } from '../../i18n';
import { Icon } from '../Icon';
import {
  SLIDER_MAX,
  SLIDER_MIN,
  beginAuthorizing,
  canAuthorize,
  completeGate,
  failGate,
  gateAcceptsInput,
  initialGateState,
  keysEngaged,
  moveSlider,
  sliderUnlocked,
  toggleKey,
  type GateState,
} from './gateMachine';
import styles from './DestructiveGate.module.css';

/** How the gate ended. The host uses it to decide what to say afterwards. */
export type DestructiveGateOutcome = 'cancelled' | 'completed';

/** How long the completion animation holds the gate open once the work is done. */
const COMPLETION_MS = 900;

export interface DestructiveGateProps {
  /**
   * The verb, exactly as it will happen: "Delete project", "Delete my data".
   * Never "Continue" and never "Confirm" — this is the sentence the user has to
   * be able to check the slider against.
   */
  action: string;
  /** What it acts on, by its real name: the project's title, the file's path. */
  target: string;
  /**
   * Every distinct thing that goes, one line each. A gate that names the action
   * but not the data has told the user half of what they need.
   */
  items: readonly string[];
  /** Anything true about the blast radius that the item list does not carry. */
  detail?: string | null;
  /**
   * Whether the action can be taken back. Stated either way — "this cannot be
   * undone" is only meaningful in a product where the other sentence also gets
   * said when it is true.
   */
  irreversible: boolean;
  /**
   * Runs the action. Resolving `false` — or throwing — is a failure: the gate
   * stays open, resets both keys and the slider, and shows what went wrong.
   */
  onConfirm: () => Promise<boolean | void> | boolean | void;
  onClose: (outcome: DestructiveGateOutcome) => void;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function DestructiveGate({
  action,
  target,
  items,
  detail,
  irreversible,
  onConfirm,
  onClose,
}: DestructiveGateProps) {
  const t = useT();
  const [state, setState] = useState<GateState>(initialGateState);
  const [failure, setFailure] = useState<string | null>(null);
  const titleId = useId();
  const listId = useId();
  const statusId = useId();

  // Where focus came from, captured in the ref INITIALIZER during the first
  // render rather than in an effect: the first key switch takes focus through a
  // ref callback, and ref callbacks run before passive effects, so an effect
  // would record this gate's own control as "where focus came from".
  const returnFocusRef = useRef<HTMLElement | null>(
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const aliveRef = useRef(true);
  const runningRef = useRef(false);
  const completionTimerRef = useRef<number | null>(null);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (completionTimerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(completionTimerRef.current);
      }
      // Cancel and completion both land here, which is what the requirement
      // asks for: whichever way the gate ends, the control the user pressed to
      // open it is where they are afterwards. An origin that is gone — the card
      // that was just deleted — is skipped rather than focused.
      const origin = returnFocusRef.current;
      if (origin && origin.isConnected) origin.focus?.();
    };
  }, []);

  const cancel = useCallback(() => {
    onClose('cancelled');
  }, [onClose]);

  // Escape cancels, in every phase where cancelling is still meaningful. It is
  // bound in the capture phase so a surface underneath the gate cannot consume
  // the key first.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      cancel();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [cancel]);

  const fire = useCallback(
    async (armed: GateState) => {
      // Two guards, because they fail differently. `runningRef` stops a second
      // `change` event that arrives in the same tick from starting the action
      // twice; `canAuthorize` stops anything from starting it at all unless
      // both keys and the whole slider are behind it.
      if (runningRef.current) return;
      if (!canAuthorize(armed)) return;
      runningRef.current = true;
      setFailure(null);
      setState(beginAuthorizing(armed));
      try {
        const result = await onConfirm();
        if (!aliveRef.current) return;
        if (result === false) {
          runningRef.current = false;
          setState(failGate);
          setFailure(null);
          return;
        }
        setState(completeGate);
        const hold = prefersReducedMotion() ? 0 : COMPLETION_MS;
        if (typeof window === 'undefined') {
          onClose('completed');
          return;
        }
        completionTimerRef.current = window.setTimeout(() => {
          completionTimerRef.current = null;
          if (!aliveRef.current) return;
          onClose('completed');
        }, hold);
      } catch (err) {
        if (!aliveRef.current) return;
        runningRef.current = false;
        setState(failGate);
        setFailure(err instanceof Error ? err.message : String(err));
      }
    },
    [onClose, onConfirm],
  );

  const accepting = gateAcceptsInput(state);
  const unlocked = sliderUnlocked(state);
  const running = state.phase === 'authorizing';
  const done = state.phase === 'completed';

  let status: string;
  if (done) status = t('destructive.statusDone', { action });
  else if (running) status = t('destructive.statusRunning', { action });
  else if (state.phase === 'failed') status = t('destructive.statusFailed', { action });
  else if (!keysEngaged(state)) status = t('destructive.statusLocked');
  else if (state.slider < SLIDER_MAX) status = t('destructive.statusArmed', { percent: state.slider });
  else status = t('destructive.statusReady');

  return (
    <Dialog
      className={styles.gate}
      role="alertdialog"
      onClose={cancel}
      // Backdrop dismissal is cancellation, which is the safe direction — but
      // not while the action is in flight, where a stray click on the page
      // behind would look like it had stopped something it cannot stop.
      closeOnBackdrop={accepting}
      ariaLabelledBy={titleId}
      ariaDescribedBy={listId}
      data-testid="destructive-gate"
      data-phase={state.phase}
    >
      <div className={styles.head}>
        <span className={styles.headIcon} aria-hidden>
          <Icon name="alert-triangle" size={18} />
        </span>
        <div className={styles.headText}>
          <DialogTitle id={titleId} className={styles.title}>
            {action}
          </DialogTitle>
          <p className={styles.target}>{target}</p>
        </div>
      </div>

      <div className={styles.facts} id={listId}>
        <p className={styles.factsHead}>{t('destructive.affects')}</p>
        <ul className={styles.items} data-testid="destructive-gate-items">
          {/* Keyed by position as well as text: two projects may legitimately
              share a name, and a list that silently collapsed them would
              under-report what is about to go. */}
          {items.map((item, index) => (
            <li key={`${index}-${item}`}>{item}</li>
          ))}
        </ul>
        {detail ? <p className={styles.detail}>{detail}</p> : null}
        <p
          className={irreversible ? styles.irreversible : styles.reversible}
          data-testid="destructive-gate-reversibility"
        >
          {irreversible ? t('destructive.irreversible') : t('destructive.reversible')}
        </p>
      </div>

      <div
        className={styles.keys}
        role="group"
        aria-label={t('destructive.keysLabel')}
        data-testid="destructive-gate-keys"
      >
        <GateKey
          engaged={state.first}
          disabled={!accepting}
          name={t('destructive.keyFirst')}
          hint={t('destructive.keyFirstHint')}
          testId="destructive-gate-key-first"
          autoFocus
          onToggle={() => setState((current) => toggleKey(current, 'first'))}
        />
        <GateKey
          engaged={state.second}
          disabled={!accepting}
          name={t('destructive.keySecond')}
          hint={t('destructive.keySecondHint')}
          testId="destructive-gate-key-second"
          onToggle={() => setState((current) => toggleKey(current, 'second'))}
        />
      </div>

      <div className={styles.sliderWrap} data-unlocked={unlocked ? 'true' : 'false'}>
        {/* The charge. It follows the slider rather than running on a timer of
            its own, so the drama is a readout of the user's own hand and can
            never imply progress that has not been made. Non-blocking: it is
            painted behind the control the user is still holding. */}
        <div className={styles.track} aria-hidden>
          <div className={styles.charge} style={{ width: `${state.slider}%` }} />
        </div>
        <input
          type="range"
          className={styles.slider}
          min={SLIDER_MIN}
          max={SLIDER_MAX}
          step={1}
          value={state.slider}
          disabled={!unlocked}
          aria-label={t('destructive.sliderLabel', { action })}
          aria-describedby={statusId}
          aria-valuetext={t('destructive.sliderValue', { percent: state.slider })}
          data-testid="destructive-gate-slider"
          onChange={(event) => {
            const next = moveSlider(state, Number(event.target.value));
            setState(next);
            if (canAuthorize(next)) void fire(next);
          }}
        />
      </div>

      {/* A bare `aria-live` region rather than `role="status"`. It is announced
          exactly the same way — the role is shorthand for this attribute — and
          it keeps the gate from adding a second `status` element to a screen
          that may already have a surface of its own reporting the outcome the
          gate just produced. `aria-atomic` makes the whole sentence re-read
          rather than only the words that changed, so "45% authorized" is never
          announced as a bare number. */}
      <p className={styles.status} id={statusId} aria-live="polite" aria-atomic="true">
        {status}
      </p>
      {failure ? (
        <p className={styles.failure} role="alert" data-testid="destructive-gate-failure">
          {failure}
        </p>
      ) : null}

      {done ? (
        <div className={styles.burst} data-testid="destructive-gate-done">
          <Icon name="check" size={22} />
        </div>
      ) : null}

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.exit}
          onClick={cancel}
          data-testid="destructive-gate-exit"
        >
          <Icon name="close" size={13} />
          <span>{t('destructive.emergencyExit')}</span>
        </button>
        <span className={styles.exitHint}>
          {running || done
            ? t('destructive.emergencyExitRunning', { action })
            : t('destructive.emergencyExitHint')}
        </span>
      </div>
    </Dialog>
  );
}

interface GateKeyProps {
  engaged: boolean;
  disabled: boolean;
  name: string;
  hint: string;
  testId: string;
  autoFocus?: boolean;
  onToggle: () => void;
}

function GateKey({ engaged, disabled, name, hint, testId, autoFocus, onToggle }: GateKeyProps) {
  const nodeRef = useRef<HTMLButtonElement | null>(null);
  // Focused once, from an effect keyed on a prop that never changes for a given
  // key. An inline `ref={(node) => node?.focus()}` would be a new function every
  // render, so React would re-run it on every state change and yank focus back
  // to the first key each time the user turned the second one.
  useEffect(() => {
    if (autoFocus) nodeRef.current?.focus();
  }, [autoFocus]);

  // `role="switch"` rather than a checkbox: a screen reader then announces the
  // key as on or off, which is the state that decides whether the slider can
  // move, instead of as "checked" — a word that says nothing about a key.
  return (
    <button
      ref={nodeRef}
      type="button"
      role="switch"
      aria-checked={engaged}
      className={styles.key}
      disabled={disabled}
      data-testid={testId}
      onClick={onToggle}
    >
      <span className={styles.keyGlyph} aria-hidden>
        <Icon name={engaged ? 'check' : 'lock'} size={14} />
      </span>
      <span className={styles.keyText}>
        <span className={styles.keyName}>{name}</span>
        <span className={styles.keyHint}>{hint}</span>
      </span>
    </button>
  );
}
