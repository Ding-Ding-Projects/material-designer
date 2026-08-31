import { useMemo, useState } from 'react';

import { useI18n } from '../../i18n';
import {
  factorsForPolicy,
  normalizePin,
  TOY_LOCK_POLICY_INPUT_INVENTORY,
  TOY_LOCK_UNLOCK_DURATIONS,
  type PinEntrySource,
  type ToyLockPolicy,
  type ToyLockUnlockDuration,
} from '../../security/toy-lock-core';
import { RegexSearchField } from '../regex/RegexSearchField';
import { useRegexSearch } from '../regex/useRegexSearch';

import styles from './ToyLockPolicyWizard.module.css';

export interface ToyLockPolicyWizardSubmit {
  readonly targetId: string;
  readonly policy: ToyLockPolicy;
  readonly unlockDuration: ToyLockUnlockDuration;
  readonly factors: Readonly<Partial<Record<'pin' | 'password' | 'totp', string>>>;
}
export interface ToyLockPolicyWizardProps {
  readonly targetId: string;
  readonly initialPolicy?: ToyLockPolicy;
  readonly initialUnlockDuration?: ToyLockUnlockDuration;
  readonly onSubmit: (request: ToyLockPolicyWizardSubmit) => void;
  readonly onCancel?: () => void;
  readonly testId?: string;
}

type Copy = {
  title: string; policy: string; duration: string; surface: string; minutes: string; close: string;
  pin: string; password: string; totp: string; pinMethod: string; keypad: string; manual: string;
  clear: string; backspace: string; save: string; required: string; invalidPin: string;
  searchPolicies: string; disclosure: string; recovery: string; noPolicyMatches: string; untilClose: string;
};

const EN: Copy = {
  title: 'Lock this element', policy: 'Authentication policy', duration: 'Unlock duration', surface: 'This surface',
  minutes: 'Five minutes', close: 'Cancel', pin: 'PIN', password: 'Password', totp: 'Authenticator secret',
  pinMethod: 'PIN entry method', keypad: 'Access keypad', manual: 'Manual entry', clear: 'Clear', backspace: 'Backspace',
  save: 'Save toy lock', required: 'Enter every required factor before saving.', invalidPin: 'Enter a PIN containing 4 to 12 digits.',
  searchPolicies: 'Search authentication policies', disclosure: 'This is a for-fun lock, not encryption or a security boundary.',
  recovery: 'If you lock yourself out, use Support Tickets to open the application-data folder and delete it yourself.',
  noPolicyMatches: 'No authentication policies match this search.', untilClose: 'Until app closes',
};
const ZH_HK: Copy = {
  title: '鎖定呢個元素', policy: '驗證政策', duration: '解鎖時限', surface: '呢個介面', minutes: '五分鐘', close: '取消',
  pin: 'PIN', password: '密碼', totp: '驗證器密鑰', pinMethod: 'PIN 輸入方法', keypad: '門禁式鍵盤', manual: '手動輸入',
  clear: '清除', backspace: '退格', save: '儲存玩具鎖', required: '儲存之前要輸入全部需要嘅因素。', invalidPin: '請輸入 4 至 12 個數字嘅 PIN。',
  searchPolicies: '搜尋驗證政策', disclosure: '呢個係玩具鎖，唔係加密，亦唔係安全邊界。', recovery: '如果鎖住自己，請用 Support Tickets 開啟應用程式資料夾，再由你自己刪除。',
  noPolicyMatches: '呢個搜尋搵唔到驗證政策。', untilClose: '直到程式關閉',
};

function copyFor(locale: string, bilingual: boolean): Copy {
  const primary = locale === 'zh-HK' ? ZH_HK : EN;
  if (!bilingual) return primary;
  return Object.fromEntries((Object.keys(EN) as Array<keyof Copy>).map((key) => [key, `${EN[key]}\n${ZH_HK[key]}`])) as Copy;
}
function applyFunnyLevel(copy: Copy, englishLevel: number, cantoneseLevel: number, bilingual: boolean, locale: string): Copy {
  const decorate = (value: string, level: number, english: boolean): string => {
    if (level <= 1) return value;
    if (english) return `${value} ${level >= 5 ? 'The lock has brought snacks.' : 'The lock is checking its notes.'}`;
    return `${value} ${level >= 5 ? '把鎖帶埋點心。' : '個鎖而家睇緊筆記。'}`;
  };
  const result = { ...copy };
  const decorateKey = (key: keyof Copy) => bilingual
    ? `${decorate(EN[key], englishLevel, true)}\n${decorate(ZH_HK[key], cantoneseLevel, false)}`
    : decorate(copy[key], locale === 'zh-HK' ? cantoneseLevel : englishLevel, locale !== 'zh-HK');
  for (const key of ['disclosure', 'recovery', 'required', 'invalidPin', 'noPolicyMatches'] as const) result[key] = decorateKey(key);
  return result;
}
function labelFor(copy: Copy, policy: ToyLockPolicy): string {
  switch (policy) {
    case 'pin': return copy.pin;
    case 'password': return copy.password;
    case 'pin-password': return `${copy.pin} + ${copy.password}`;
    case 'password-totp': return `${copy.password} + ${copy.totp}`;
    case 'pin-totp': return `${copy.pin} + ${copy.totp}`;
    case 'password-pin-totp': return `${copy.password} + ${copy.pin} + ${copy.totp}`;
  }
}

export function ToyLockPolicyWizard({ targetId, initialPolicy = 'pin', initialUnlockDuration = 'surface', onSubmit, onCancel, testId = 'toy-lock-policy-wizard' }: ToyLockPolicyWizardProps) {
  const { locale, languageMode, funnyLevels } = useI18n();
  const copy = useMemo(() => applyFunnyLevel(
    copyFor(locale, languageMode === 'bilingual'),
    funnyLevels.en,
    funnyLevels['zh-HK'],
    languageMode === 'bilingual',
    locale,
  ), [funnyLevels, languageMode, locale]);
  const [policy, setPolicy] = useState<ToyLockPolicy>(initialPolicy);
  const [unlockDuration, setUnlockDuration] = useState<ToyLockUnlockDuration>(initialUnlockDuration);
  const [pinSource, setPinSource] = useState<PinEntrySource>('keypad');
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const search = useRegexSearch(query, setQuery);
  const needsPin = factorsForPolicy(policy).includes('pin');
  const needsPassword = factorsForPolicy(policy).includes('password');
  const needsTotp = factorsForPolicy(policy).includes('totp');
  const policies = TOY_LOCK_POLICY_INPUT_INVENTORY.filter((entry) => search.matches(`${labelFor(copy, entry.policy)} ${entry.policy}`));

  const submit = () => {
    const factors: Partial<Record<'pin' | 'password' | 'totp', string>> = {};
    if (needsPin) {
      const result = normalizePin({ source: pinSource, value: pin });
      if (!result.ok) { setMessage(copy.invalidPin); return; }
      factors.pin = result.value;
    }
    if (needsPassword) factors.password = password;
    if (needsTotp) factors.totp = totp.trim();
    if (factorsForPolicy(policy).some((factor) => !factors[factor])) { setMessage(copy.required); return; }
    onSubmit({ targetId, policy, unlockDuration, factors });
    setPin(''); setPassword(''); setTotp(''); setMessage('');
  };
  const setDigit = (digit: string) => setPin((current) => `${current}${digit}`.slice(0, 12));

  return (
    <section className={styles.panel} role="dialog" aria-modal="false" aria-labelledby={`${testId}-title`} data-testid={testId}>
      <h2 id={`${testId}-title`}>{copy.title}</h2>
      <p>{copy.disclosure}</p>
      <p>{copy.recovery}</p>
      <RegexSearchField search={search} fieldLabel={copy.searchPolicies} ariaLabel={copy.searchPolicies} placeholder={copy.searchPolicies} testId={`${testId}-search`} />
      <label className={styles.field}><span>{copy.policy}</span><select value={policy} onChange={(event) => setPolicy(event.currentTarget.value as ToyLockPolicy)}>{policies.map((entry) => <option key={entry.policy} value={entry.policy}>{labelFor(copy, entry.policy)}</option>)}</select></label>
      {policies.length === 0 ? <p role="status">{copy.noPolicyMatches}</p> : null}
      <label className={styles.field}><span>{copy.duration}</span><select value={unlockDuration} onChange={(event) => setUnlockDuration(event.currentTarget.value as ToyLockUnlockDuration)}>{TOY_LOCK_UNLOCK_DURATIONS.map((duration) => <option key={duration} value={duration}>{duration === 'surface' ? copy.surface : duration === '5-minutes' ? copy.minutes : copy.untilClose}</option>)}</select></label>
      {needsPin ? <fieldset className={styles.field}><legend>{copy.pin}</legend><div className={styles.modes} role="group" aria-label={copy.pinMethod}><button type="button" aria-pressed={pinSource === 'keypad'} onClick={() => { setPinSource('keypad'); setPin(''); }}>{copy.keypad}</button><button type="button" aria-pressed={pinSource === 'manual'} onClick={() => { setPinSource('manual'); setPin(''); }}>{copy.manual}</button></div><input aria-label={copy.pin} type="password" inputMode="numeric" value={pin} disabled={pinSource === 'keypad'} onChange={(event) => setPin(event.currentTarget.value)} />{pinSource === 'keypad' ? <div className={styles.keypad} role="group" aria-label={copy.keypad}>{[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => <button type="button" key={digit} aria-label={String(digit)} onClick={() => setDigit(String(digit))}>{digit}</button>)}<button type="button" onClick={() => setPin('')} aria-label={copy.clear}>{copy.clear}</button><button type="button" onClick={() => setDigit('0')} aria-label="0">0</button><button type="button" onClick={() => setPin((current) => current.slice(0, -1))} aria-label={copy.backspace}>⌫</button></div> : null}</fieldset> : null}
      {needsPassword ? <label className={styles.field}><span>{copy.password}</span><input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.currentTarget.value)} /></label> : null}
      {needsTotp ? <label className={styles.field}><span>{copy.totp}</span><input type="password" autoComplete="off" value={totp} onChange={(event) => setTotp(event.currentTarget.value.toUpperCase())} /></label> : null}
      {message ? <p role="alert">{message}</p> : null}
      <footer className={styles.actions}><button type="button" onClick={onCancel}>{copy.close}</button><button type="button" onClick={submit}>{copy.save}</button></footer>
    </section>
  );
}
