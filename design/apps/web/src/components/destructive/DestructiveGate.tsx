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
//      `gateMachine.ts` makes progress non-bankable — turn a key back off and
//      the slider is thrown away with it — and it rations forward movement per
//      input event, so the travel cannot be collapsed into one click or one
//      `End` press.
//
// Everything the copy can style, it styles. Everything it must state — what is
// destroyed, whether it can be undone, what failed — is passed in as facts and
// rendered verbatim, so no funny level and no language mode can leave the user
// unsure what the slider is about to do.
//
// The component is split in two on purpose. `DestructiveGate` owns only the
// things that must outlive a change of target — where focus came from — and
// keys the surface below it on the identity of what is being destroyed, so
// re-pointing an open gate at a different action mounts a fresh, untouched one
// rather than handing the new target the keys the user turned for the old one.

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Dialog, DialogTitle } from '@open-design/components';

import { useT } from '../../i18n';
import { Icon } from '../Icon';
import { notify } from '../notifications/notificationStore';
import {
  SLIDER_MAX,
  SLIDER_MIN,
  beginAuthorizing,
  canAuthorize,
  completeGate,
  dismissOutcome,
  failGate,
  gateAcceptsInput,
  initialGateState,
  keysEngaged,
  moveSlider,
  sliderUnlocked,
  toggleKey,
  type GateOutcome,
  type GateState,
} from './gateMachine';
import styles from './DestructiveGate.module.css';

/** How the gate ended. The host uses it to decide what to say afterwards. */
export type DestructiveGateOutcome = GateOutcome;

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
   * stays open, resets both keys and the slider, and shows what went wrong. A
   * failure that lands after the gate has closed is raised as a notification
   * instead, never dropped.
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

/**
 * What the gate is currently pointed at, as one comparable string.
 *
 * Compared by content rather than by identity because `items` is routinely a
 * fresh array on every render of the host; keying on the array itself would
 * throw the user's keys away mid-interaction for no reason at all.
 */
function gateIdentity(props: DestructiveGateProps): string {
  const parts = [
    props.action,
    props.target,
    props.detail ?? '',
    String(props.irreversible),
    ...props.items,
  ];
  // Joined on a separator no label can contain, so two different targets cannot
  // be spelled into one identity by where their words happen to break.
  return parts.join(String.fromCharCode(31));
}

/**
 * Put focus back where it came from — but only when it is still the gate's to
 * give. If something else has deliberately claimed focus (the host moving it to
 * whatever replaced the deleted thing, say), yanking it backwards is worse than
 * doing nothing. An origin that no longer exists — the card that was just
 * deleted — is skipped rather than focused.
 */
function returnFocus(origin: HTMLElement | null, surface: HTMLElement | null): void {
  if (typeof document === 'undefined') return;
  if (!origin || !origin.isConnected) return;
  const active = document.activeElement;
  const ours =
    !(active instanceof HTMLElement) ||
    active === document.body ||
    !active.isConnected ||
    (surface?.contains(active) ?? false);
  if (!ours) return;
  origin.focus?.();
}

export function DestructiveGate(props: DestructiveGateProps) {
  // Where focus came from, captured in the ref INITIALIZER during the first
  // render rather than in an effect: the first key switch takes focus through a
  // ref callback, and ref callbacks run before passive effects, so an effect
  // would record this gate's own control as "where focus came from".
  //
  // It lives in this component rather than in the surface because the surface
  // is remounted whenever the target changes, and a remount would recapture the
  // origin as the outgoing gate's own key.
  const originRef = useRef<HTMLElement | null>(
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );

  // The backstop. Every deliberate way out already returns focus before it
  // closes; this catches the host that simply stops rendering the gate.
  useEffect(() => () => returnFocus(originRef.current, null), []);

  return <GateSurface key={gateIdentity(props)} {...props} originRef={originRef} />;
}

interface GateSurfaceProps extends DestructiveGateProps {
  originRef: { current: HTMLElement | null };
}

function GateSurface({
  action,
  target,
  items,
  detail,
  irreversible,
  onConfirm,
  onClose,
  originRef,
}: GateSurfaceProps) {
  const t = useT();
  const [state, setState] = useState<GateState>(initialGateState);
  const [failure, setFailure] = useState<string | null>(null);
  const titleId = useId();
  const listId = useId();
  const statusId = useId();

  const aliveRef = useRef(true);
  const runningRef = useRef(false);
  const completionTimerRef = useRef<number | null>(null);
  // A handle on the dialog surface, reached through a child rather than through
  // `Dialog` (which owns no forwarded ref), so the gate can tell "focus is
  // still inside me" from "something else has taken it".
  const headRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (completionTimerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(completionTimerRef.current);
      }
    };
  }, []);

  /**
   * Close, reporting one specific outcome, having first given focus back.
   *
   * Focus is restored here rather than only on unmount so that closing is
   * enough: a host that keeps the gate mounted, or that swaps it for something
   * else entirely, still leaves the user's focus on the control they pressed.
   */
  const finish = useCallback(
    (outcome: DestructiveGateOutcome) => {
      const surface = headRef.current?.closest<HTMLElement>('[role="alertdialog"]') ?? null;
      returnFocus(originRef.current, surface);
      onClose(outcome);
    },
    [onClose, originRef],
  );

  // Escape, the emergency exit and the backdrop all land here. What they report
  // depends on how far the gate got: none of them can stop an action that has
  // already been started, so none of them may claim it was cancelled.
  const dismiss = useCallback(() => {
    finish(dismissOutcome(state));
  }, [finish, state]);

  // Escape closes in every phase where closing is still meaningful. It is bound
  // in the capture phase so a surface underneath the gate cannot consume the
  // key first.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      dismiss();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [dismiss]);

  /**
   * A failure that arrived after the gate stopped existing.
   *
   * Closing the dialog while the action was in flight used to swallow the
   * rejection outright, which is the worst possible reading of a destructive
   * action: the user authorized it, closed the gate, and was told nothing at
   * all when it did not work. The notification store is a module singleton for
   * exactly this case — a caller that is no longer mounted can still speak.
   */
  const reportDetachedFailure = useCallback(
    (message: string | null) => {
      // Titled with the action's own words, which is the one string the gate is
      // guaranteed to hold in the user's own language.
      notify({ severity: 'error', title: action, body: message });
    },
    [action],
  );

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
        if (result === false) {
          if (!aliveRef.current) {
            reportDetachedFailure(null);
            return;
          }
          runningRef.current = false;
          setState(failGate);
          setFailure(null);
          return;
        }
        // It worked. A gate that is already gone has nothing left to say about
        // a success — the host owns whatever confirmation the user sees.
        if (!aliveRef.current) return;
        setState(completeGate);
        const hold = prefersReducedMotion() ? 0 : COMPLETION_MS;
        if (typeof window === 'undefined') {
          finish('completed');
          return;
        }
        completionTimerRef.current = window.setTimeout(() => {
          completionTimerRef.current = null;
          if (!aliveRef.current) return;
          finish('completed');
        }, hold);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!aliveRef.current) {
          reportDetachedFailure(message);
          return;
        }
        runningRef.current = false;
        setState(failGate);
        setFailure(message);
      }
    },
    [finish, onConfirm, reportDetachedFailure],
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
      onClose={dismiss}
      // Backdrop dismissal is cancellation, which is the safe direction — but
      // not while the action is in flight, where a stray click on the page
      // behind would look like it had stopped something it cannot stop.
      closeOnBackdrop={accepting}
      ariaLabelledBy={titleId}
      ariaDescribedBy={listId}
      data-testid="destructive-gate"
      data-phase={state.phase}
    >
      <div className={styles.head} ref={headRef}>
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
          // The machine rations how far one event may carry the slider, so a
          // click on the far end of the track — or `End` — lands part-way and
          // the control re-renders back to where the gate actually is. Arrow
          // keys keep working a step at a time; the jump keys keep working too,
          // they simply have to be pressed more than once.
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
          onClick={dismiss}
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
