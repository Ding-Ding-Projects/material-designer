import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { useI18n } from '../i18n';
import {
  createAttemptBudget,
  factorsForPolicy,
  hydrateAttemptBudget,
  normalizePin,
  recordAttempt,
  type PinEntrySource,
  type ToyLockFactor,
  type ToyLockPolicy,
} from '../security/toy-lock-core';

import styles from './ToyLockAuthenticationPopover.module.css';
import { withToyLockUiDeadline } from './toy-locks/host-call';

export interface ToyLockVerificationRequest {
  readonly targetId: string;
  readonly policy: ToyLockPolicy;
  readonly factor: ToyLockFactor;
  readonly value: string;
  readonly pinSource?: PinEntrySource;
}

/**
 * Host-backed verification collects the ordered factors in the renderer and
 * submits them as one operation. The host owns the revision and attempt
 * budget, and the renderer never stores credential material after submission.
 */
export interface ToyLockPolicyVerificationRequest {
  readonly targetId: string;
  readonly policy: ToyLockPolicy;
  readonly revision?: number;
  readonly factors: Readonly<Partial<Record<ToyLockFactor, string>>>;
}

export interface ToyLockPolicyVerificationResult {
  readonly matched: boolean;
  readonly maximumAttempts: number;
  readonly remainingAttempts: number;
}

export interface ToyLockAuthenticatedEvent {
  readonly targetId: string;
  readonly policy: ToyLockPolicy;
  readonly acceptedFactors: readonly ToyLockFactor[];
}

export interface ToyLockAuthenticationPopoverProps {
  readonly targetId: string;
  readonly targetLabel: string;
  readonly policy: ToyLockPolicy;
  readonly anchor: HTMLElement | null;
  readonly attemptMaximum?: number;
  /**
   * The host verifies one factor at a time. This component never stores a
   * password or TOTP secret and never assumes that calling this function is
   * authentication. Only an explicit `true` advances the factor sequence.
   */
  readonly verifyFactor?: (request: ToyLockVerificationRequest) => boolean | Promise<boolean>;
  /** Preferred host-backed whole-policy verification seam. */
  readonly verifyPolicy?: (
    request: ToyLockPolicyVerificationRequest,
  ) => ToyLockPolicyVerificationResult | null | Promise<ToyLockPolicyVerificationResult | null>;
  /** Host metadata at the time this prompt opened. */
  readonly attemptRemaining?: number;
  /** Optional host revision carried through the whole-policy seam. */
  readonly revisionForPrompt?: number;
  /** Fired once, and only after every factor in the configured policy passed. */
  readonly onAuthenticated: (event: ToyLockAuthenticatedEvent) => void;
  readonly onCancel: () => void;
  readonly onSupportTickets?: () => void;
}

type Copy = {
  title: string;
  subtitle: string;
  progress: string;
  attempts: string;
  exhausted: string;
  pin: string;
  password: string;
  totp: string;
  keypad: string;
  manual: string;
  clear: string;
  backspace: string;
  continue: string;
  cancel: string;
  invalidPin: string;
  required: string;
  rejected: string;
  verificationFailed: string;
  verifying: string;
  support: string;
};

const EN = {
  title: 'Authentication required', subtitle: 'Unlock {target} before its action can run.',
  progress: 'Factor {current} of {total}: {factor}', attempts: '{remaining} of {maximum} attempts remaining',
  exhausted: 'No attempts remain. Cancel and reopen this prompt to try again.', pin: 'PIN', password: 'Password',
  totp: 'Authenticator code', keypad: 'Access keypad', manual: 'Manual PIN entry', clear: 'Clear',
  backspace: 'Backspace', continue: 'Continue', cancel: 'Cancel',
  invalidPin: 'Enter a PIN containing 4 to 12 digits.', required: 'Enter this factor before continuing.',
  rejected: 'That factor did not match.', verificationFailed: 'The factor could not be checked. Try again.',
  verifying: 'Checking factor…',
  support: 'Forgotten your password? Open Support Tickets',
} satisfies Copy;

const ZH_HK = {
  title: '需要驗證', subtitle: '要先解鎖「{target}」，先可以執行佢個動作。',
  progress: '第 {current} 個因素，共 {total} 個：{factor}', attempts: '仲有 {remaining} 次，共 {maximum} 次',
  exhausted: '次數用晒。取消再開呢個提示先可以再試。', pin: 'PIN', password: '密碼',
  totp: '驗證器代碼', keypad: '門禁式鍵盤', manual: '手動輸入 PIN', clear: '清除',
  backspace: '退格', continue: '繼續', cancel: '取消',
  invalidPin: '請輸入 4 至 12 個數字嘅 PIN。', required: '繼續之前要輸入呢個因素。',
  rejected: '呢個因素唔吻合。', verificationFailed: '暫時檢查唔到呢個因素。請再試。', verifying: '檢查緊因素…',
  support: '唔記得密碼？開啟 Support Tickets',
} satisfies Copy;

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? `{${key}}`));
}

function localizedCopy(locale: string, bilingual: boolean): Copy {
  const primary = locale === 'zh-HK' ? ZH_HK : EN;
  if (!bilingual) return primary;
  return Object.fromEntries(
    (Object.keys(EN) as Array<keyof Copy>).map((key) => [key, `${EN[key]}\n${ZH_HK[key]}`]),
  ) as Copy;
}

function factorName(copy: Copy, factor: ToyLockFactor): string {
  return factor === 'pin' ? copy.pin : factor === 'password' ? copy.password : copy.totp;
}

function anchorPosition(anchor: HTMLElement | null): { left: number; top: number } {
  const edge = 12;
  const viewportWidth = typeof window === 'undefined' ? 1024 : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 768 : window.innerHeight;
  const width = Math.min(380, Math.max(280, viewportWidth - edge * 2));
  const estimatedHeight = 540;
  const rect = anchor?.getBoundingClientRect();
  const preferredLeft = rect ? rect.right + edge : edge;
  const preferredTop = rect ? rect.top : edge;
  return {
    left: Math.max(edge, Math.min(preferredLeft, viewportWidth - width - edge)),
    top: Math.max(edge, Math.min(preferredTop, viewportHeight - estimatedHeight - edge)),
  };
}

function visibleBudget(maximum: number, remaining: number): ReturnType<typeof createAttemptBudget> {
  try {
    return hydrateAttemptBudget(maximum, remaining);
  } catch {
    return createAttemptBudget();
  }
}

export function ToyLockAuthenticationPopover({
  targetId,
  targetLabel,
  policy,
  anchor,
  attemptMaximum = 5,
  verifyFactor,
  verifyPolicy,
  attemptRemaining,
  revisionForPrompt,
  onAuthenticated,
  onCancel,
  onSupportTickets,
}: ToyLockAuthenticationPopoverProps) {
  const { locale, languageMode } = useI18n();
  const copy = useMemo(() => localizedCopy(locale, languageMode === 'bilingual'), [languageMode, locale]);
  const factors = useMemo(() => factorsForPolicy(policy), [policy]);
  const [factorIndex, setFactorIndex] = useState(0);
  const [budget, setBudget] = useState(() => visibleBudget(attemptMaximum, attemptRemaining ?? attemptMaximum));
  const [pinSource, setPinSource] = useState<PinEntrySource>('keypad');
  const [value, setValue] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const valuesRef = useRef<Partial<Record<ToyLockFactor, string>>>({});
  const [position, setPosition] = useState(() => anchorPosition(anchor));
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const completedRef = useRef(false);
  const cancelledRef = useRef(false);
  const generationRef = useRef(0);
  const currentFactor = factors[factorIndex] ?? factors[factors.length - 1]!;

  const cancel = useCallback(() => {
    if (completedRef.current || cancelledRef.current) return;
    cancelledRef.current = true;
    generationRef.current += 1;
    onCancel();
    anchor?.focus({ preventScroll: true });
  }, [anchor, onCancel]);

  useEffect(() => {
    generationRef.current += 1;
    completedRef.current = false;
    cancelledRef.current = false;
    setFactorIndex(0);
    setBudget(visibleBudget(attemptMaximum, attemptRemaining ?? attemptMaximum));
    valuesRef.current = {};
    setPinSource('keypad');
    setValue('');
    setMessage('');
    setSubmitting(false);
  }, [attemptMaximum, attemptRemaining, policy, targetId]);

  useLayoutEffect(() => {
    const reposition = () => setPosition(anchorPosition(anchor));
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [anchor]);

  useEffect(() => {
    if (currentFactor === 'pin' && pinSource === 'keypad') {
      panelRef.current?.querySelector<HTMLButtonElement>(`.${styles.keypad} button:not([disabled])`)?.focus();
    } else {
      inputRef.current?.focus();
    }
  }, [currentFactor, factorIndex, pinSource]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      cancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [cancel]);

  const submit = useCallback(async () => {
    if (submitting || completedRef.current || cancelledRef.current || budget.remaining === 0) return;
    let normalized = value;
    if (currentFactor === 'pin') {
      const pin = normalizePin({ source: pinSource, value });
      if (!pin.ok) {
        setMessage(copy.invalidPin);
        return;
      }
      normalized = pin.value;
    } else if (!value.trim()) {
      setMessage(copy.required);
      return;
    }

    setSubmitting(true);
    setMessage(copy.verifying);
    const generation = generationRef.current;
    try {
      if (verifyPolicy) {
        valuesRef.current = { ...valuesRef.current, [currentFactor]: normalized };
        const nextIndex = factorIndex + 1;
        if (nextIndex < factors.length) {
          setFactorIndex(nextIndex);
          setValue('');
          setMessage('');
          return;
        }
        const submittedFactors = valuesRef.current;
        valuesRef.current = {};
        const result = await withToyLockUiDeadline(() => verifyPolicy({
          targetId,
          policy,
          ...(revisionForPrompt !== undefined ? { revision: revisionForPrompt } : {}),
          factors: submittedFactors,
        }));
        if (generation !== generationRef.current) return;
        if (result == null) {
          setMessage(copy.verificationFailed);
          return;
        }
        const nextBudget = visibleBudget(result.maximumAttempts, result.remainingAttempts);
        if (!Number.isSafeInteger(result.maximumAttempts) || !Number.isSafeInteger(result.remainingAttempts)
          || result.maximumAttempts < 1 || result.remainingAttempts < 0 || result.remainingAttempts > result.maximumAttempts) {
          setMessage(copy.verificationFailed);
          return;
        }
        setBudget(nextBudget);
        if (!result.matched) {
          setFactorIndex(0);
          setValue('');
          setMessage(result.remainingAttempts === 0 ? copy.exhausted : copy.rejected);
          return;
        }
        completedRef.current = true;
        onAuthenticated({ targetId, policy, acceptedFactors: factors });
        anchor?.focus({ preventScroll: true });
        return;
      }
      if (!verifyFactor) {
        setMessage(copy.verificationFailed);
        return;
      }
      const matched = await withToyLockUiDeadline(() => verifyFactor({
        targetId,
        policy,
        factor: currentFactor,
        value: normalized,
        ...(currentFactor === 'pin' ? { pinSource } : {}),
      }));
      if (generation !== generationRef.current) return;
      const attempt = recordAttempt(budget, matched);
      setBudget(attempt.budget);
      if (!attempt.accepted) {
        setMessage(attempt.exhausted ? copy.exhausted : copy.rejected);
        setValue('');
        return;
      }
      const nextIndex = factorIndex + 1;
      if (nextIndex < factors.length) {
        setFactorIndex(nextIndex);
        setValue('');
        setMessage('');
        return;
      }
      completedRef.current = true;
      onAuthenticated({ targetId, policy, acceptedFactors: factors });
      anchor?.focus({ preventScroll: true });
    } catch {
      if (generation === generationRef.current) setMessage(copy.verificationFailed);
    } finally {
      if (generation === generationRef.current) setSubmitting(false);
    }
  }, [anchor, budget, copy, currentFactor, factorIndex, factors, onAuthenticated, pinSource, policy, revisionForPrompt, submitting, targetId, value, verifyFactor, verifyPolicy]);

  const setPinDigit = (digit: string) => setValue((current) => `${current}${digit}`.slice(0, 12));
  const titleId = `toy-lock-title-${targetId}`;
  const messageId = `toy-lock-message-${targetId}`;
  const disabled = submitting || budget.remaining === 0;

  return (
    <div
      ref={panelRef}
      className={styles.panel}
      style={position}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={message ? messageId : undefined}
      data-testid="toy-lock-authentication"
    >
      <header className={styles.header}>
        <div>
          <h2 id={titleId}>{copy.title}</h2>
          <p>{fill(copy.subtitle, { target: targetLabel })}</p>
        </div>
        <button type="button" className={styles.iconButton} onClick={cancel} aria-label={copy.cancel}>×</button>
      </header>

      <div className={styles.status} aria-live="polite">
        <strong>{fill(copy.progress, { current: factorIndex + 1, total: factors.length, factor: factorName(copy, currentFactor) })}</strong>
        <span>{fill(copy.attempts, { remaining: budget.remaining, maximum: budget.maximum })}</span>
      </div>

      {currentFactor === 'pin' && (
        <div className={styles.pinModes} role="group" aria-label={copy.pin}>
          <button type="button" aria-pressed={pinSource === 'keypad'} onClick={() => { setPinSource('keypad'); setValue(''); }}>{copy.keypad}</button>
          <button type="button" aria-pressed={pinSource === 'manual'} onClick={() => { setPinSource('manual'); setValue(''); }}>{copy.manual}</button>
        </div>
      )}

      <label className={styles.field}>
        <span>{factorName(copy, currentFactor)}</span>
        <input
          ref={inputRef}
          type={currentFactor === 'totp' ? 'text' : 'password'}
          inputMode={currentFactor === 'pin' || currentFactor === 'totp' ? 'numeric' : 'text'}
          autoComplete={currentFactor === 'password' ? 'current-password' : 'one-time-code'}
          data-testid="toy-lock-factor-input"
          value={value}
          disabled={disabled || (currentFactor === 'pin' && pinSource === 'keypad')}
          onChange={(event) => setValue(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void submit();
            }
          }}
        />
      </label>

      {currentFactor === 'pin' && pinSource === 'keypad' && (
        <div className={styles.keypad} aria-label={copy.keypad}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
            <button key={digit} type="button" disabled={disabled} onClick={() => setPinDigit(String(digit))} aria-label={String(digit)}>{digit}</button>
          ))}
          <button type="button" disabled={disabled} onClick={() => setValue('')} aria-label={copy.clear}>{copy.clear}</button>
          <button type="button" disabled={disabled} onClick={() => setPinDigit('0')} aria-label="0">0</button>
          <button type="button" disabled={disabled} onClick={() => setValue((current) => current.slice(0, -1))} aria-label={copy.backspace}>⌫</button>
        </div>
      )}

      {message && <p id={messageId} className={styles.message} role="status">{message}</p>}

      <footer className={styles.actions}>
        {onSupportTickets ? <button type="button" onClick={onSupportTickets}>{copy.support}</button> : null}
        <button type="button" onClick={cancel}>{copy.cancel}</button>
        <button type="button" className={styles.primary} onClick={() => void submit()} disabled={disabled}>{copy.continue}</button>
      </footer>
    </div>
  );
}
