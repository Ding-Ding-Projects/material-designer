'use client';

import { useEffect, useMemo, useState } from 'react';

import type { UnlockLadderBridge, UnlockLadderChallenge, UnlockLadderResponse } from './protocol';
import styles from './UnlockLadder.module.css';

export interface UnlockLadderProps {
  lockoutId: string;
  bridge: UnlockLadderBridge;
  schoolMode?: boolean;
  onCleared?: () => void;
}

type MoleHit = { id: string; cell: number; atMs: number };

function isChallenge(value: UnlockLadderChallenge | UnlockLadderResponse): value is UnlockLadderChallenge {
  return 'nonce' in value;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function UnlockLadder({ lockoutId, bridge, schoolMode = false, onCleared }: UnlockLadderProps) {
  const [challenge, setChallenge] = useState<UnlockLadderChallenge | null>(null);
  const [selectedDish, setSelectedDish] = useState<number | null>(null);
  const [sumAnswers, setSumAnswers] = useState<string[]>(() => Array.from({ length: 10 }, () => ''));
  const [moleHits, setMoleHits] = useState<MoleHit[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState<string | null>(null);
  const reducedMotion = useMemo(prefersReducedMotion, []);

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
        setNotice('The wait was cleared. Sign in still requires the normal credential.');
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

  const moleComplete = challenge?.stage === 'mole' && challenge.moles != null && now >= challenge.moles[challenge.moles.length - 1]!.visibleUntilMs;
  const moleVisible = (cell: number) => challenge?.moles?.some((mole) => mole.cell === cell && now >= mole.visibleFromMs && now <= mole.visibleUntilMs) ?? false;

  return (
    <section className={styles.surface} aria-labelledby="unlock-ladder-title" data-testid="unlock-ladder">
      <header className={styles.header}>
        <h2 id="unlock-ladder-title">Unlock ladder</h2>
        <p>Winning clears the waiting time only. It never signs you in, changes your credential, or adds an attempt.</p>
      </header>
      {!challenge ? <div className={styles.actions}><button className={styles.button} type="button" onClick={() => void issue()}>{schoolMode ? 'Try the sums' : 'Play the unlock ladder'}</button><span className={styles.note}>Three ladder uses are available per rolling hour. After that, the clock is the only route.</span></div> : null}
      {challenge?.stage === 'dish' ? <div className={styles.panel}><p className={styles.status}>Choose the matching dish. One answer clears the wait; a wrong dish advances the ladder after five misses.</p><div className={styles.choices}>{(challenge.choices ?? []).map((choice, index) => <button key={choice} className={selectedDish === index ? styles.choiceSelected : styles.choice} type="button" aria-pressed={selectedDish === index} onClick={() => { setSelectedDish(index); void submit(index); }}>{choice}</button>)}</div></div> : null}
      {challenge?.stage === 'sums' ? <div className={styles.panel}><p className={styles.status}>Answer all ten sums. The answers are checked together by the host.</p><div className={styles.sums}>{(challenge.sums ?? []).map((sum, index) => <label className={styles.sumField} key={`${sum.left}-${sum.right}-${index}`}><span>{sum.left} + {sum.right}</span><input inputMode="numeric" aria-label={`Answer for ${sum.left} plus ${sum.right}`} value={sumAnswers[index] ?? ''} onChange={(event) => setSumAnswers((current) => current.map((value, item) => item === index ? event.currentTarget.value.replace(/[^0-9]/gu, '') : value))} /></label>)}</div><button className={styles.button} type="button" onClick={() => void submit(sumAnswers.map((answer) => Number(answer)))}>Submit ten answers</button></div> : null}
      {challenge?.stage === 'mole' ? <div className={styles.panel}><p className={styles.status}>Hit each visible mole once. The round ends after {Math.ceil((challenge.durationMs ?? 5000) / 1000)} seconds. {Math.max(0, Math.ceil(((challenge.startedAtMs ?? now) + (challenge.durationMs ?? 5000) - now) / 1000))} seconds remain.</p><div className={styles.moles} role="grid" aria-label="Whack-a-mole board">{Array.from({ length: 25 }, (_, cell) => { const hit = moleHits.some((entry) => entry.cell === cell); const visible = moleVisible(cell); const id = challenge.moles?.find((mole) => mole.cell === cell)?.id; return <button key={cell} className={hit ? styles.moleHit : visible ? styles.moleVisible : styles.mole} type="button" role="gridcell" disabled={!visible || hit} aria-label={visible ? `Mole in cell ${cell + 1}` : `Empty cell ${cell + 1}`} onClick={() => { if (!visible || !id || hit) return; setMoleHits((current) => [...current, { id, cell, atMs: Date.now() }]); }}>{visible ? 'Mole' : ''}</button>; })}</div><button className={styles.button} type="button" disabled={!moleComplete} onClick={() => void submit(moleHits)}>{moleComplete ? 'Submit mole round' : 'Round in progress'}</button></div> : null}
      {notice ? <p className={styles.error} role="alert">{notice}</p> : null}
      {!challenge && notice?.includes('clock') ? <p className={styles.note}>The ladder is not available for this wait. The clock remains in charge.</p> : null}
    </section>
  );
}
