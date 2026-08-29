'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import type { UnlockLadderBridge, UnlockLadderChallenge, UnlockLadderResponse } from './protocol';
import styles from './UnlockLadder.module.css';

type UnlockLadderLabels = Partial<{
  title: string;
  description: string;
  play: string;
  sumsPlay: string;
  budget: string;
  dishPrompt: string;
  sumsPrompt: string;
  molePrompt: string;
  submitSums: string;
  submitMoles: string;
  roundProgress: string;
  clearedWait: string;
  reducedMotionMoleNote: string;
  moleBoard: string;
  activeMoleStatus: (cells: readonly number[], secondsRemaining: number) => string;
  activeMoleCell: (cell: number) => string;
  scheduledMoleCell: (cell: number) => string;
  emptyCell: (cell: number) => string;
}>;

export interface UnlockLadderProps {
  lockoutId: string;
  bridge: UnlockLadderBridge;
  schoolMode?: boolean;
  onCleared?: () => void;
  labels?: UnlockLadderLabels;
  copy?: {
    languageMode: 'english' | 'cantonese' | 'bilingual';
    englishFunnyLevel: number;
    cantoneseFunnyLevel: number;
    labels: UnlockLadderLabels;
  };
}

type MoleHit = { id: string; cell: number };

function isChallenge(value: UnlockLadderChallenge | UnlockLadderResponse): value is UnlockLadderChallenge {
  return 'nonce' in value;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function UnlockLadder({ lockoutId, bridge, schoolMode = false, onCleared, labels, copy }: UnlockLadderProps) {
  const [challenge, setChallenge] = useState<UnlockLadderChallenge | null>(null);
  const [selectedDish, setSelectedDish] = useState<number | null>(null);
  const [sumAnswers, setSumAnswers] = useState<string[]>(() => Array.from({ length: 10 }, () => ''));
  const [moleHits, setMoleHits] = useState<MoleHit[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState<string | null>(null);
  const moleButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const [focusCell, setFocusCell] = useState(0);
  const reducedMotion = useMemo(prefersReducedMotion, []);
  const validCopy = copy !== undefined && Number.isInteger(copy.englishFunnyLevel) && copy.englishFunnyLevel >= 1 && copy.englishFunnyLevel <= 5 && Number.isInteger(copy.cantoneseFunnyLevel) && copy.cantoneseFunnyLevel >= 1 && copy.cantoneseFunnyLevel <= 5;
  const activeLabels = validCopy ? copy?.labels : labels;
  const staticMoleCells = useMemo(() => new Set((challenge?.moles ?? []).map((mole) => mole.cell)), [challenge]);
  const activeMoleCells = useMemo(() => (challenge?.moles ?? []).filter((mole) => now >= mole.visibleFromMs && now <= mole.visibleUntilMs).map((mole) => mole.cell), [challenge, now]);
  const activeMoleSet = useMemo(() => new Set(activeMoleCells), [activeMoleCells]);

  useEffect(() => {
    if (!challenge || challenge.stage !== 'mole') return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), reducedMotion ? 500 : 100);
    return () => window.clearInterval(timer);
  }, [challenge, reducedMotion]);

  const issue = async () => {
    setNotice(null);
    setSelectedDish(null);
    setSumAnswers(Array.from({ length: 10 }, () => ''));
    setMoleHits([]);
    try {
      const result = await bridge.issue(lockoutId);
      if (isChallenge(result)) setChallenge(result);
      else setNotice(result.ok ? 'The ladder accepted the request.' : result.code);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const submit = async (answer: unknown) => {
    if (!challenge) return;
    try {
      const result = await bridge.submit(lockoutId, challenge.nonce, answer);
      if (result.ok && 'clearedWait' in result && result.clearedWait) {
        setChallenge(null);
        setNotice(activeLabels?.clearedWait ?? 'The wait was cleared. Sign in still requires the normal credential.');
        onCleared?.();
        return;
      }
      if (!result.ok) {
        setNotice(result.code);
        setChallenge(null);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const moleComplete = challenge?.stage === 'mole' && challenge.startedAtMs != null && now >= challenge.startedAtMs + (challenge.durationMs ?? 5_000);
  const moleVisible = (cell: number) => activeMoleSet.has(cell);
  const moleAccessibleName = (cell: number, active: boolean, scheduled: boolean, hit: boolean) => {
    if (hit) return activeLabels?.activeMoleCell?.(cell + 1) ?? `Mole in cell ${cell + 1}, already recorded`;
    if (active) return activeLabels?.activeMoleCell?.(cell + 1) ?? `Active mole in cell ${cell + 1}`;
    if (scheduled) return activeLabels?.scheduledMoleCell?.(cell + 1) ?? `Scheduled mole cell ${cell + 1}, inactive until its host interval`;
    return activeLabels?.emptyCell?.(cell + 1) ?? `Empty cell ${cell + 1}`;
  };
  const activateMole = (cell: number, mole: { id: string; cell: number } | undefined, active: boolean, hit: boolean) => {
    if (!active || !mole || hit) return;
    void bridge.recordMoleHit(lockoutId, challenge!.nonce, cell).then((result) => {
      if (result.ok) setMoleHits((current) => [...current, { id: mole.id, cell }]);
      else setNotice(result.code);
    }).catch((error: unknown) => setNotice(error instanceof Error ? error.message : String(error)));
  };
  const focusMole = (cell: number) => {
    setFocusCell(cell);
    window.setTimeout(() => moleButtons.current[cell]?.focus(), 0);
  };
  const moveMoleFocus = (event: KeyboardEvent<HTMLButtonElement>, cell: number) => {
    const row = Math.floor(cell / 5);
    const column = cell % 5;
    let target = cell;
    if (event.key === 'ArrowRight') target = row * 5 + Math.min(4, column + 1);
    else if (event.key === 'ArrowLeft') target = row * 5 + Math.max(0, column - 1);
    else if (event.key === 'ArrowDown') target = Math.min(24, cell + 5);
    else if (event.key === 'ArrowUp') target = Math.max(0, cell - 5);
    else if (event.key === 'Home') target = row * 5;
    else if (event.key === 'End') target = row * 5 + 4;
    else return;
    event.preventDefault();
    focusMole(target);
  };

  const remainingSeconds = challenge?.stage === 'mole' && challenge.startedAtMs != null ? Math.max(0, Math.ceil(((challenge.startedAtMs + (challenge.durationMs ?? 5_000)) - now) / 1_000)) : 0;

  return (
    <section className={styles.surface} aria-labelledby="unlock-ladder-title" data-testid="unlock-ladder" data-reduced-motion={reducedMotion ? 'true' : 'false'} data-copy-language={copy?.languageMode ?? 'english'} data-copy-fallback={validCopy ? 'false' : 'true'}>
      <header className={styles.header}>
        <h2 id="unlock-ladder-title">{activeLabels?.title ?? 'Unlock ladder'}</h2>
        <p>{activeLabels?.description ?? 'Winning clears the waiting time only. It never signs you in, changes your credential, or adds an attempt.'}</p>
      </header>
      {!challenge ? <div className={styles.actions}><button className={styles.button} type="button" onClick={() => void issue()}>{schoolMode ? activeLabels?.sumsPlay ?? 'Try the sums' : activeLabels?.play ?? 'Play the unlock ladder'}</button><span className={styles.note}>{activeLabels?.budget ?? 'Three ladder uses are available per rolling hour. After that, the clock is the only route.'}</span></div> : null}
      {!validCopy ? <p className={styles.note} role="status">Localized and funny ladder copy was not injected, so factual English fallback is active.</p> : null}
      {challenge?.stage === 'dish' ? <div className={styles.panel}><p className={styles.status} role="status" aria-live="polite">{activeLabels?.dishPrompt ?? 'Choose the matching dish. One answer clears the wait; a wrong dish advances the ladder after five misses.'}</p><div className={styles.choices}>{(challenge.choices ?? []).map((choice, index) => <button key={choice} className={selectedDish === index ? styles.choiceSelected : styles.choice} type="button" aria-pressed={selectedDish === index} onClick={() => { setSelectedDish(index); void submit(index); }}>{choice}</button>)}</div></div> : null}
      {challenge?.stage === 'sums' ? <div className={styles.panel}><p className={styles.status} role="status" aria-live="polite">{activeLabels?.sumsPrompt ?? 'Answer all ten sums. The answers are checked together by the host.'}</p><div className={styles.sums}>{(challenge.sums ?? []).map((sum, index) => <label className={styles.sumField} key={`${sum.left}-${sum.right}-${index}`}><span>{sum.left} + {sum.right}</span><input inputMode="numeric" aria-label={`Answer for ${sum.left} plus ${sum.right}`} value={sumAnswers[index] ?? ''} onChange={(event) => setSumAnswers((current) => current.map((value, item) => item === index ? event.currentTarget.value.replace(/[^0-9]/gu, '') : value))} /></label>)}</div><button className={styles.button} type="button" onClick={() => void submit(sumAnswers.map((answer) => Number(answer)))}>{activeLabels?.submitSums ?? 'Submit ten answers'}</button></div> : null}
      {challenge?.stage === 'mole' ? <div className={styles.panel}><p className={styles.status} role="status" aria-live="polite">{activeLabels?.molePrompt ?? `Hit each visible mole once. The round ends after ${Math.ceil((challenge.durationMs ?? 5_000) / 1_000)} seconds. ${remainingSeconds} seconds remain.`}</p><p className={styles.status} role="status" aria-live="polite">{activeLabels?.activeMoleStatus?.(activeMoleCells.map((cell) => cell + 1), remainingSeconds) ?? (activeMoleCells.length > 0 ? `Active mole cells: ${activeMoleCells.map((cell) => cell + 1).join(', ')}. ${remainingSeconds} seconds remain.` : `No mole is active. ${remainingSeconds} seconds remain.`)}</p>{reducedMotion ? <p className={styles.note} role="status">{activeLabels?.reducedMotionMoleNote ?? 'Reduced motion keeps mole positions still. Only the currently host-valid cells are actionable; the numeric countdown and keyboard controls remain available.'}</p> : null}<div className={styles.moles} role="grid" aria-label={activeLabels?.moleBoard ?? 'Whack-a-mole board'} aria-rowcount={5} aria-colcount={5}>{Array.from({ length: 5 }, (_, row) => <div key={row} className={styles.moleRow} role="row" aria-rowindex={row + 1}>{Array.from({ length: 5 }, (_, column) => { const cell = row * 5 + column; const hit = moleHits.some((entry) => entry.cell === cell); const visible = moleVisible(cell); const scheduled = staticMoleCells.has(cell); const mole = challenge.moles?.find((candidate) => candidate.cell === cell); return <button key={cell} ref={(button) => { moleButtons.current[cell] = button; }} className={hit ? styles.moleHit : visible ? styles.moleVisible : styles.mole} type="button" role="gridcell" tabIndex={cell === focusCell ? 0 : -1} aria-colindex={column + 1} aria-disabled={!visible || hit} aria-pressed={hit} aria-label={moleAccessibleName(cell, visible, scheduled, hit)} onFocus={() => setFocusCell(cell)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activateMole(cell, mole, visible, hit); } else moveMoleFocus(event, cell); }} onClick={() => activateMole(cell, mole, visible, hit)}>{visible ? 'Mole' : ''}</button>; })}</div>)}</div><button className={styles.button} type="button" disabled={!moleComplete} onClick={() => void submit({ kind: 'mole-round' })}>{moleComplete ? activeLabels?.submitMoles ?? 'Submit mole round' : activeLabels?.roundProgress ?? 'Round in progress'}</button></div> : null}
      {notice ? <p className={styles.error} role="alert">{notice}</p> : null}
      {!challenge && notice?.includes('clock') ? <p className={styles.note}>The ladder is not available for this wait. The clock remains in charge.</p> : null}
    </section>
  );
}
