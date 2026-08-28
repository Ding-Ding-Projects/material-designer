import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';

import styles from './UnlockLadderPanel.module.css';

type Challenge =
  | { rung: 'dish'; nonce: string; choices: string[]; expiresAt: number }
  | { rung: 'sums'; nonce: string; sums: Array<{ left: number; right: number }>; expiresAt: number }
  | { rung: 'moles'; nonce: string; visibleCells: number[]; durationMs: number; expiresAt: number };

interface Props {
  lockoutId: string;
  schoolMode: boolean;
  onWaitingCleared: () => void;
}
export function UnlockLadderPanel({ lockoutId, schoolMode, onWaitingCleared }: Props) {
  const { languageMode } = useI18n();
  const bilingual = languageMode === 'bilingual';
  const label = (english: string, cantonese: string): string => languageMode === 'cantonese' ? cantonese : bilingual ? `${english} · ${cantonese}` : english;
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sumAnswers, setSumAnswers] = useState<string[]>([]);
  const [hits, setHits] = useState<number[]>([]);
  const [moleReady, setMoleReady] = useState(false);
  const [cleared, setCleared] = useState(false);

  const load = async () => {
    setBusy(true);
    setMessage('');
    setHits([]);
    setMoleReady(false);
    try {
      const response = await fetch('/api/unlock-ladder/challenge', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lockoutId, schoolMode }),
      });
      const body = await response.json() as Challenge | { rung: 'clock'; credentialStillRequired: true; retryAfterMs?: number };
      if (!response.ok || body.rung === 'clock') {
        setMessage(label('The ladder is unavailable for this lockout. The clock remains active, and credentials are unchanged.', '呢次鎖定未能使用階梯，時鐘繼續，憑證唔會改。'));
        setChallenge(null);
        return;
      }
      setChallenge(body);
      if (body.rung === 'sums') setSumAnswers(Array.from({ length: body.sums.length }, () => ''));
      if (body.rung === 'moles') window.setTimeout(() => setMoleReady(true), body.durationMs);
    } catch {
      setMessage(label('The ladder could not be reached. The clock remains active, and credentials are unchanged.', '階梯連唔到，時鐘繼續，憑證唔會改。'));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const answer = async (payload: Record<string, unknown>) => {
    if (!challenge || busy) return;
    setBusy(true);
    try {
      const response = await fetch('/api/unlock-ladder/answer', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lockoutId, nonce: challenge.nonce, ...payload }),
      });
      const body = await response.json() as { clearsWaiting?: boolean; correct?: boolean; rung?: string };
      if (!response.ok) {
        setMessage(label('This challenge expired or was already used. Load a fresh challenge.', '挑戰已過期或者用過喇，載入新挑戰。'));
        setChallenge(null);
        return;
      }
      if (body.clearsWaiting) {
        setMessage(label('The wait is cleared. Credentials are still required.', '等候已清除，但仍然要憑證。'));
        setCleared(true);
        onWaitingCleared();
        return;
      }
      setMessage(label('That answer did not clear the wait. The ladder keeps its original attempt budget.', '答案未能清除等候，階梯保留原本嘅嘗試額。'));
      setChallenge(null);
    } catch {
      setMessage(label('The answer could not be checked. The clock remains active.', '答案未能核對，時鐘繼續。'));
    } finally {
      setBusy(false);
    }
  };

  return <section className={styles.panel} aria-labelledby="unlock-ladder-title" data-testid="unlock-ladder">
    <h3 id="unlock-ladder-title">{label('Unlock ladder', '解鎖階梯')}</h3>
    <p className={styles.hint}>{label('Winning clears only the waiting period. It never signs in, changes a credential, or creates a session.', '贏咗只會清除等候時間，唔會登入、改憑證或者建立工作階段。')}</p>
    <ol className={styles.stages} aria-label={label('Ladder stages', '階梯步驟')}>
      {(['dish', 'sums', 'moles', 'clock'] as const).map((stage) => <li key={stage} aria-current={challenge?.rung === stage ? 'step' : undefined}>{stage === 'dish' ? label('Dim sum', '點心') : stage === 'sums' ? label('Ten easy sums', '十條簡單算式') : stage === 'moles' ? label('Whack-a-mole', '打地鼠') : label('Wait for the clock', '等時鐘')}</li>)}
    </ol>
    {challenge?.rung === 'dish' ? <div className={styles.grid}>{challenge.choices.map((choice, index) => <button key={choice} type="button" disabled={busy} onClick={() => void answer({ choice: index })}>{choice}</button>)}</div> : null}
    {challenge?.rung === 'sums' ? <div className={styles.sums} aria-label={label('Ten easy sums', '十條簡單算式')}>{challenge.sums.map((sum, index) => <label key={`${sum.left}-${sum.right}-${index}`}>{sum.left} + {sum.right}<input aria-label={label(`Answer for ${sum.left} plus ${sum.right}`, `${sum.left} 加 ${sum.right} 嘅答案`)} inputMode="numeric" value={sumAnswers[index] ?? ''} onChange={(event) => setSumAnswers((current) => current.map((value, position) => position === index ? event.target.value : value))} /></label>)}<button type="button" disabled={busy || sumAnswers.some((value) => !/^\d+$/.test(value))} onClick={() => void answer({ answers: sumAnswers.map(Number) })}>{label('Submit sums', '提交算式')}</button></div> : null}
    {challenge?.rung === 'moles' ? <div><div className={styles.grid} aria-label={label('Whack-a-mole round', '打地鼠回合')}>{Array.from({ length: 9 }, (_, index) => <button key={index} type="button" disabled={busy || !challenge.visibleCells.includes(index) || hits.includes(index)} aria-pressed={hits.includes(index)} aria-label={challenge.visibleCells.includes(index) ? label(`Mole ${index + 1}`, `第 ${index + 1} 隻地鼠`) : label(`Empty cell ${index + 1}`, `第 ${index + 1} 格空白`)} onClick={() => setHits((current) => [...current, index])}>{challenge.visibleCells.includes(index) ? label('Mole', '地鼠') : label('Empty', '空白')}</button>)}</div><button type="button" disabled={busy || !moleReady || hits.length === 0} onClick={() => void answer({ hits })}>{label('Submit round', '提交回合')}</button></div> : null}
    {message ? <p className={styles.message} role="status">{message}</p> : null}
    {!challenge && !cleared ? <button type="button" disabled={busy} onClick={() => void load()}>{label('Load fresh challenge', '載入新挑戰')}</button> : null}
  </section>;
}
