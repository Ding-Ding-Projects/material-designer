// The browser half of the narrator: `speechSynthesis`, a Hong Kong voice
// where one exists, and a watchdog.
//
// The watchdog is the part worth explaining. `SpeechSynthesisUtterance`
// promises `onend`, and several real engines do not always deliver it —
// a cancelled queue, a tab that lost audio focus, a voice that failed to
// load. The narrator serializes on that callback, so one dropped event
// would wedge the queue permanently: every later line would sit behind a
// sentence that finished minutes ago. The timeout below is therefore not
// belt-and-braces, it is the difference between a narrator that stops
// working after an hour and one that does not.

import type { NarratorEnvironment, NarratorUtterance, SpokenLanguage } from './queue';
import type { NarratorPreferences } from './settings';

/** BCP-47 tags handed to the engine. */
const LANGUAGE_TAG: Record<SpokenLanguage, string> = {
  'en': 'en-US',
  'zh-HK': 'zh-HK',
};

/**
 * Preference order for a voice, most specific first.
 *
 * Cantonese is the reason this is a list rather than an exact match:
 * platforms label the same voice `zh-HK`, `yue-Hant-HK` or `yue-HK`, and a
 * strict `zh-HK` test would fall through to a Mandarin voice reading
 * Cantonese text — which is intelligible to nobody and sounds like a bug.
 * Falling back to a generic `zh` voice last is deliberate: wrong accent
 * beats silence, and the panel says which voice was chosen.
 */
const VOICE_PATTERNS: Record<SpokenLanguage, RegExp[]> = {
  'en': [/^en[-_]us/i, /^en[-_]gb/i, /^en/i],
  'zh-HK': [/^zh[-_]hk/i, /^yue/i, /^zh[-_]hant/i, /^zh/i],
};

export function isVoiceCompatible(
  voice: Pick<SpeechSynthesisVoice, 'lang'>,
  language: SpokenLanguage,
): boolean {
  return VOICE_PATTERNS[language].some((pattern) => pattern.test(voice.lang));
}

export function pickVoice(
  voices: readonly SpeechSynthesisVoice[],
  language: SpokenLanguage,
): SpeechSynthesisVoice | null {
  for (const pattern of VOICE_PATTERNS[language]) {
    const match = voices.find((voice) => pattern.test(voice.lang));
    if (match) return match;
  }
  return null;
}

/** Rough spoken duration, used only to bound the watchdog. */
export function watchdogMsFor(text: string): number {
  // ~12 characters a second is slow for English and about right for
  // Cantonese; erring slow is correct, because a watchdog that fires early
  // cuts a sentence off, and one that fires late costs a pause nobody
  // notices. Floor and ceiling keep both ends sane.
  return Math.min(45_000, Math.max(2_500, 1_500 + text.length * 120));
}

export function isSpeechAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined';
}

/**
 * Build the environment the queue runs in.
 *
 * `getPreferences` is a live read rather than a snapshot so that flipping
 * "a screen reader is running" takes effect on the very next line instead
 * of the next reload.
 */
export function createBrowserNarratorEnvironment(
  getPreferences: () => NarratorPreferences,
): NarratorEnvironment {
  let watchdog: number | null = null;

  const clearWatchdog = (): void => {
    if (watchdog !== null) {
      window.clearTimeout(watchdog);
      watchdog = null;
    }
  };

  return {
    now: () => Date.now(),
    schedule: (callback, ms) => window.setTimeout(callback, ms),
    cancel: (handle) => window.clearTimeout(handle),
    screenReaderActive: () => getPreferences().screenReaderRunning,
    quietRequested: () => getPreferences().quiet,
    cancelSpeech: () => {
      clearWatchdog();
      if (isSpeechAvailable()) window.speechSynthesis.cancel();
    },
    speak: (utterance: NarratorUtterance, done: () => void) => {
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        clearWatchdog();
        done();
      };

      const text = utterance.text.trim();
      // Nothing to say, or nothing to say it with. Completing immediately
      // keeps the queue moving; refusing to call back would stall it.
      if (!text || !isSpeechAvailable()) {
        finish();
        return;
      }

      const synth = window.speechSynthesis;
      const spoken = new SpeechSynthesisUtterance(text);
      spoken.lang = LANGUAGE_TAG[utterance.language];
      spoken.volume = utterance.volume;
      // Voices arrive asynchronously on some engines, so this is read at
      // speak time rather than cached at construction; an empty list here
      // simply means the platform default voice is used.
      const voices = synth.getVoices();
      const preferred = utterance.voiceId
        ? voices.find((voice) => voice.voiceURI === utterance.voiceId && isVoiceCompatible(voice, utterance.language))
        : null;
      const voice = preferred ?? pickVoice(voices, utterance.language);
      if (voice) spoken.voice = voice;
      spoken.rate = Math.max(0.1, Math.min(3, utterance.rate));
      spoken.pitch = Math.max(0, Math.min(2, utterance.pitch));
      spoken.onend = finish;
      spoken.onerror = finish;

      watchdog = window.setTimeout(finish, watchdogMsFor(text));
      synth.speak(spoken);
    },
  };
}
