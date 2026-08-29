'use client';

import { useEffect, useMemo, useState } from 'react';

import type { UnlockLadderBridge, UnlockLadderChallenge, UnlockLadderResponse } from './protocol';
import styles from './UnlockLadder.module.css';

export interface UnlockLadderProps {
  lockoutId: string;
  bridge: UnlockLadderBridge;
  schoolMode?: boolean;
  onCleared?: () => void;
  labels?: Partial<{
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
  }>;
}

type MoleHit = { id: string; cell: number };

function isChallenge(value: UnlockLadderChallenge | UnlockLadderResponse): value is UnlockLadderChallenge {
  return 'nonce' in value;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function UnlockLadder({ lockoutId, bridge, schoolMode = false, onCleared, labels }: UnlockLadderProps) {
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
        setNotice(labels?.clearedWait ?? 'The wait was cleared. Sign in still requires the normal credential.');
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
  const moleVisible = (cell: number) => challenge?.moles?.some((mole) => mole.cell === cell && now >= mole.visibleFromMs && now <= mole.visibleUntilMs) ?? false;

  const remainingSeconds = challenge?.stage === 'mole' && challenge.startedAtMs != null ? Math.max(0, Math.ceil(((challenge.startedAtMs + (challenge.durationMs ?? 5_000)) - now) / 1_000)) : 0;

  return (
    <section className={styles.surface} aria-labelledby="unlock-ladder-title" data-testid="unlock-ladder" data-reduced-motion={reducedMotion ? 'true' : 'false'}>
      <header className={styles.header}>
        <h2 id="unlock-ladder-title">{labels?.title ?? 'Unlock ladder'}</h2>
        <p>{labels?.description ?? 'Winning clears the waiting time only. It never signs you in, changes your credential, or adds an attempt.'}</p>
      </header>
      {!challenge ? <div className={styles.actions}><button className={styles.button} type="button" onClick={() => void issue()}>{schoolMode ? labels?.sumsPlay ?? 'Try the sums' : labels?.play ?? 'Play the unlock ladder'}</button><span className={styles.note}>{labels?.budget ?? 'Three ladder uses are available per rolling hour. After that, the clock is the only route.'}</span></div> : null}
      {challenge?.stage === 'dish' ? <div className={styles.panel}><p className={styles.status} role="status" aria-live="polite">{labels?.dishPrompt ?? 'Choose the matching dish. One answer clears the wait; a wrong dish advances the ladder after five misses.'}</p><div className={styles.choices}>{(challenge.choices ?? []).map((choice, index) => <button key={choice} className={selectedDish === index ? styles.choiceSelected : styles.choice} type="button" aria-pressed={selectedDish === index} onClick={() => { setSelectedDish(index); void submit(index); }}>{choice}</button>)}</div></div> : null}
      {challenge?.stage === 'sums' ? <div className={styles.panel}><p className={styles.status} role="status" aria-live="polite">{labels?.sumsPrompt ?? 'Answer all ten sums. The answers are checked together by the host.'}</p><div className={styles.sums}>{(challenge.sums ?? []).map((sum, index) => <label className={styles.sumField} key={`${sum.left}-${sum.right}-${index}`}><span>{sum.left} + {sum.right}</span><input inputMode="numeric" aria-label={`Answer for ${sum.left} plus ${sum.right}`} value={sumAnswers[index] ?? ''} onChange={(event) => setSumAnswers((current) => current.map((value, item) => item === index ? event.currentTarget.value.replace(/[^0-9]/gu, '') : value))} /></label>)}</div><button className={styles.button} type="button" onClick={() => void submit(sumAnswers.map((answer) => Number(answer)))}>{labels?.submitSums ?? 'Submit ten answers'}</button></div> : null}
      {challenge?.stage === 'mole' ? <div className={styles.panel}><p className={styles.status} role="status" aria-live="polite">{labels?.molePrompt ?? `Hit each visible mole once. The round ends after ${Math.ceil((challenge.durationMs ?? 5_000) / 1_000)} seconds. ${remainingSeconds} seconds remain.`}</p><div className={styles.moles} role="grid" aria-label="Whack-a-mole board" aria-rowcount={5} aria-colcount={5}>{Array.from({ length: 25 }, (_, cell) => { const hit = moleHits.some((entry) => entry.cell === cell); const visible = moleVisible(cell); const mole = challenge.moles?.find((candidate) => candidate.cell === cell); return <button key={cell} className={hit ? styles.moleHit : visible ? styles.moleVisible : styles.mole} type="button" role="gridcell" aria-rowindex={Math.floor(cell / 5) + 1} aria-colindex={(cell % 5) + 1} disabled={!visible || hit} aria-label={visible ? `Mole in cell ${cell + 1}` : `Empty cell ${cell + 1}`} onClick={() => { if (!visible || !mole || hit) return; void bridge.recordMoleHit(lockoutId, challenge.nonce, cell).then((result) => { if (result.ok) setMoleHits((current) => [...current, { id: mole.id, cell }]); else setNotice(result.code); }).catch((error: unknown) => setNotice(error instanceof Error ? error.message : String(error))); }}>{visible ? 'Mole' : ''}</button>; })}</div><button className={styles.button} type="button" disabled={!moleComplete} onClick={() => void submit({ kind: 'mole-round' })}>{moleComplete ? labels?.submitMoles ?? 'Submit mole round' : labels?.roundProgress ?? 'Round in progress'}</button></div> : null}
      {notice ? <p className={styles.error} role="alert">{notice}</p> : null}
      {!challenge && notice?.includes('clock') ? <p className={styles.note}>The ladder is not available for this wait. The clock remains in charge.</p> : null}
    </section>
  );
}
