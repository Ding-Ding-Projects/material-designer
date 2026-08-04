// The narrator's settings surface.
//
// It says three things the user cannot find out any other way, and each
// one is a control's own explanatory line rather than a paragraph nobody
// reads: the narrator is off until you turn it on, this platform may have
// no voice for Cantonese, and the app cannot tell whether a screen reader
// is running so you have to say.

import { useEffect, useState } from 'react';
import { Button } from '@open-design/components';

import { Icon } from '../Icon';
import { useI18n } from '../../i18n';
import { useNarrator } from './narrator';
import { NARRATOR_LANGUAGES, NARRATOR_LANGUAGE_LABEL_KEYS } from './settings';
import { isSpeechAvailable, pickVoice } from './speech';
import type { NarratorLanguage } from './queue';
import styles from './NarratorSettingsPanel.module.css';

// The label map lives in `settings.ts` so the command palette's inline
// language control and this panel name the three languages identically. Two
// copies drift, and the palette is precisely where a user would notice.
const LANGUAGE_LABEL = NARRATOR_LANGUAGE_LABEL_KEYS;

export function NarratorSettingsPanel() {
  const { t } = useI18n();
  const { preferences, setPreferences, narrate, stop } = useNarrator();
  const [cantoneseVoice, setCantoneseVoice] = useState<string | null>(null);
  const [speechSupported, setSpeechSupported] = useState(true);

  // Voices load asynchronously on several engines, so the panel asks once
  // on mount and again when the engine says the list changed. Reporting
  // "no Cantonese voice" from an empty first read would be wrong on every
  // platform that populates the list late.
  useEffect(() => {
    const available = isSpeechAvailable();
    setSpeechSupported(available);
    if (!available) return undefined;
    const read = (): void => {
      const voice = pickVoice(window.speechSynthesis.getVoices(), 'zh-HK');
      setCantoneseVoice(voice ? `${voice.name} (${voice.lang})` : null);
    };
    read();
    window.speechSynthesis.addEventListener('voiceschanged', read);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', read);
  }, []);

  return (
    // The reveal anchors below must match the ids in `settingsIndex.ts`
    // exactly — the palette polls for `[data-od-setting="<id>"]`, so an
    // anchor that names a section nobody indexes teleports the user nowhere.
    <section className={styles.panel} data-od-setting="section:narrator">
      <div className={styles.head}>
        <h4>{t('narrator.title')}</h4>
        <p className="hint">{t('narrator.hint')}</p>
      </div>

      <label className={styles.row} data-od-setting="narrator.enable">
        <input
          type="checkbox"
          checked={preferences.enabled}
          onChange={(event) =>
            setPreferences({ ...preferences, enabled: event.target.checked })}
          data-testid="narrator-enabled"
        />
        <span className={styles.rowCopy}>
          <span>{t('narrator.enable')}</span>
          <span className="hint">{t('narrator.enableHint')}</span>
        </span>
      </label>

      <label className={styles.field} data-od-setting="narrator.language">
        <span className={styles.fieldLabel}>{t('narrator.language')}</span>
        <select
          className={styles.select}
          value={preferences.language}
          disabled={!preferences.enabled}
          onChange={(event) =>
            setPreferences({
              ...preferences,
              language: event.target.value as NarratorLanguage,
            })}
          data-testid="narrator-language"
        >
          {NARRATOR_LANGUAGES.map((language) => (
            <option key={language} value={language}>
              {t(LANGUAGE_LABEL[language])}
            </option>
          ))}
        </select>
        <span className="hint">{t('narrator.languageBothHint')}</span>
      </label>

      <label className={styles.row}>
        <input
          type="checkbox"
          checked={preferences.quiet}
          onChange={(event) => setPreferences({ ...preferences, quiet: event.target.checked })}
        />
        <span className={styles.rowCopy}>
          <span>{t('narrator.quiet')}</span>
          <span className="hint">{t('narrator.quietHint')}</span>
        </span>
      </label>

      <label className={styles.row}>
        <input
          type="checkbox"
          checked={preferences.screenReaderRunning}
          onChange={(event) =>
            setPreferences({ ...preferences, screenReaderRunning: event.target.checked })}
          data-testid="narrator-screen-reader"
        />
        <span className={styles.rowCopy}>
          <span>{t('narrator.screenReader')}</span>
          <span className="hint">{t('narrator.screenReaderHint')}</span>
        </span>
      </label>

      {!speechSupported ? (
        <p className={styles.notice} role="status">
          <Icon name="alert-triangle" size={13} aria-hidden="true" />
          {t('narrator.noSpeechEngine')}
        </p>
      ) : cantoneseVoice === null ? (
        <p className={styles.notice} role="status" data-testid="narrator-no-cantonese-voice">
          <Icon name="info" size={13} aria-hidden="true" />
          {t('narrator.noCantoneseVoice')}
        </p>
      ) : (
        <p className={styles.voiceLine}>
          {t('narrator.cantoneseVoice', { voice: cantoneseVoice })}
        </p>
      )}

      <div className={styles.actions}>
        <Button
          disabled={!preferences.enabled || preferences.quiet}
          onClick={() => {
            // `force` because the user asked for this line specifically;
            // the cooldown is there to stop the app volunteering, and this
            // was not volunteered. See `NarrationRequest.force`.
            narrate('narrator.sample', { category: 'info', force: true, key: 'narrator:sample' });
          }}
          data-testid="narrator-sample"
        >
          <Icon name="volume" size={13} />
          {t('narrator.speakSample')}
        </Button>
        <Button onClick={stop} data-testid="narrator-stop">
          {t('narrator.stop')}
        </Button>
      </div>
    </section>
  );
}
