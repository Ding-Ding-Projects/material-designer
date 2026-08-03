// The narrator's queue: one voice, one line at a time, and a set of rules
// about when it is allowed to say anything at all.
//
// Everything that decides *whether* and *in what order* the app speaks
// lives here, deliberately free of the Web Speech API, of React and of the
// DOM. The whole environment arrives through `NarratorEnvironment`, so the
// serialization guarantee below can be tested against a fake clock and a
// fake voice rather than against a browser that speaks at real speed.
//
// The four rules, and why each one is where it is:
//
//   OFF BY DEFAULT. `DEFAULT_NARRATOR_SETTINGS.enabled` is false and there
//   is no code path that turns it on other than a user asking. An app that
//   starts talking on first launch is a support ticket, not a feature.
//
//   ONE AT A TIME. `speaking` is a single flag and `pump` is the only
//   thing that starts an utterance. Two overlapping voices are not "more
//   information faster", they are zero information: nothing spoken over
//   another voice is understood, so a second line always waits.
//
//   REPLACE, DO NOT STACK. A queued line with a key already in the queue
//   overwrites it in place. The failure this prevents is the progress
//   narration that says "12 percent… 34 percent… 51 percent" thirty
//   seconds after the job finished, because every tick was faithfully
//   queued behind the last one.
//
//   RATE LIMITS NEVER APPLY TO ERRORS. Debounce and the per-category
//   cooldown exist so the narrator stays occasional. An error is the one
//   thing the user needs said out loud, so it bypasses both and jumps the
//   queue. It is also, together with a line the user explicitly asked to
//   hear, the only thing a running screen reader ducks rather than
//   silences — everything else yields to the reader entirely.

export type NarratorLanguage = 'en' | 'zh-HK' | 'both';

export type SpokenLanguage = 'en' | 'zh-HK';

export type NarratorCategory = 'error' | 'warning' | 'success' | 'progress' | 'info';

export interface NarratorSettings {
  /** Off until the user says otherwise. Never defaulted to true. */
  enabled: boolean;
  language: NarratorLanguage;
  /** The user's own "not now" — quiet hours, reduced sound, a meeting. */
  quiet: boolean;
}

export const DEFAULT_NARRATOR_SETTINGS: NarratorSettings = {
  enabled: false,
  language: 'en',
  quiet: false,
};

export interface NarrationRequest {
  /**
   * Identity for supersession. Two requests with the same key are the same
   * announcement said twice, so the newer one replaces the older wherever
   * it sits in the queue.
   */
  key: string;
  category: NarratorCategory;
  /** Already styled by the English funny level. */
  en: string;
  /** Already styled by the Cantonese funny level. */
  zhHK: string;
  /**
   * A line the user asked for directly — the "speak a sample" button, and
   * nothing else. It skips the debounce and the cooldown, because rate
   * limits exist to stop the app volunteering too often and this was not
   * volunteered. It does NOT skip the quiet setting, does not jump the
   * queue, and ducks rather than yields under a screen reader: the user
   * pressed a button to hear something, so hearing nothing at all would be
   * a broken button.
   */
  force?: boolean;
}

export interface NarratorUtterance {
  id: number;
  key: string;
  category: NarratorCategory;
  language: SpokenLanguage;
  text: string;
  /** 1 normally; reduced when ducking under an active screen reader. */
  volume: number;
}

export interface NarratorEnvironment {
  now: () => number;
  schedule: (callback: () => void, ms: number) => number;
  cancel: (handle: number) => void;
  /** Speak one utterance and call `done` exactly once when it finishes. */
  speak: (utterance: NarratorUtterance, done: () => void) => void;
  /** Abandon anything currently being spoken. */
  cancelSpeech: () => void;
  /** True while a screen reader is announcing the interface. */
  screenReaderActive: () => boolean;
  /** True when the platform or the app is asking for silence. */
  quietRequested: () => boolean;
}

/**
 * What happened to a request, so a caller (and a test) can tell. Every
 * value except `queued` and `replaced` means nothing will be spoken —
 * `overflow` means this one was queued but an older waiting line was
 * dropped to make room.
 */
export type EnqueueOutcome =
  | 'queued'
  | 'replaced'
  | 'disabled'
  | 'quiet'
  | 'yielded'
  | 'cooldown'
  | 'overflow';

/** Held before speaking so a burst of related events collapses into one. */
export const NARRATOR_DEBOUNCE_MS = 400;

/**
 * Minimum gap between two lines of the same category. Zero means "no
 * limit", which only `error` gets.
 */
export const NARRATOR_COOLDOWN_MS: Record<NarratorCategory, number> = {
  error: 0,
  warning: 8_000,
  success: 20_000,
  progress: 30_000,
  info: 45_000,
};

/**
 * A backlog longer than this is a backlog nobody wants read out. Overflow
 * drops the OLDEST non-error, because by the time a queue is this deep the
 * oldest line is the most likely to already be stale on screen.
 */
export const MAX_NARRATOR_QUEUE = 3;

/** Volume for an error spoken while a screen reader is talking. */
export const DUCKED_VOLUME = 0.35;

function languagesFor(language: NarratorLanguage): SpokenLanguage[] {
  // 'both' is English THEN Cantonese, strictly in that order and strictly
  // one after the other. The order is fixed rather than following the UI
  // locale so a bilingual listener always knows which half is coming.
  if (language === 'both') return ['en', 'zh-HK'];
  return [language];
}

export class NarratorQueue {
  private settings: NarratorSettings = { ...DEFAULT_NARRATOR_SETTINGS };

  private readonly env: NarratorEnvironment;

  private queue: NarrationRequest[] = [];

  private speaking = false;

  private debounceHandle: number | null = null;

  private lastSpokenAt: Partial<Record<NarratorCategory, number>> = {};

  private nextId = 1;

  /**
   * Every utterance actually handed to the voice, in order, capped so a
   * long-running session does not accumulate a transcript nobody reads.
   * This is the observability surface the settings panel and the tests
   * both read; it is not a history feature.
   */
  readonly spoken: NarratorUtterance[] = [];

  private static readonly SPOKEN_LOG_LIMIT = 50;

  constructor(env: NarratorEnvironment) {
    this.env = env;
  }

  getSettings(): NarratorSettings {
    return { ...this.settings };
  }

  setSettings(next: NarratorSettings): void {
    const wasEnabled = this.settings.enabled;
    this.settings = { ...next };
    // Turning the narrator off has to stop it mid-sentence. Letting the
    // current line finish would mean the switch does not do what it says,
    // and the moment someone reaches for it is the moment they want quiet.
    if (wasEnabled && (!next.enabled || next.quiet)) {
      this.reset();
    }
  }

  /** Abandon everything queued and anything being spoken right now. */
  reset(): void {
    this.queue = [];
    this.speaking = false;
    if (this.debounceHandle !== null) {
      this.env.cancel(this.debounceHandle);
      this.debounceHandle = null;
    }
    this.env.cancelSpeech();
  }

  /** Queue length, for the settings surface and for tests. */
  pendingCount(): number {
    return this.queue.length;
  }

  enqueue(request: NarrationRequest): EnqueueOutcome {
    if (!this.settings.enabled) return 'disabled';
    // The quiet setting outranks everything, errors included. The failure
    // is still on screen as a toast; a user who asked for silence during a
    // meeting has not asked to be surprised by the important ones.
    if (this.settings.quiet || this.env.quietRequested()) return 'quiet';

    const isError = request.category === 'error';
    const unlimited = isError || request.force === true;

    // Coexisting with assistive technology. A screen reader is already
    // narrating this interface, and a second voice on top of it is noise
    // for exactly the users who most need the first one. Ordinary lines
    // therefore yield entirely; an error ducks instead of yielding, so the
    // failure is still spoken without drowning the reader out.
    if (this.env.screenReaderActive() && !unlimited) return 'yielded';

    if (!unlimited) {
      const cooldown = NARRATOR_COOLDOWN_MS[request.category];
      const last = this.lastSpokenAt[request.category];
      if (cooldown > 0 && last !== undefined && this.env.now() - last < cooldown) {
        return 'cooldown';
      }
    }

    const existing = this.queue.findIndex((entry) => entry.key === request.key);
    if (existing >= 0) {
      // In place: a replaced line keeps its position, so superseding the
      // second of three does not promote it past the third.
      this.queue[existing] = request;
      this.armOrSpeak(unlimited);
      return 'replaced';
    }

    if (isError) {
      // Errors jump the queue. They do not clear it — the lines already
      // waiting were true when they were queued and are still true now.
      this.queue.unshift(request);
    } else {
      this.queue.push(request);
    }

    let outcome: EnqueueOutcome = 'queued';
    if (this.queue.length > MAX_NARRATOR_QUEUE) {
      const victim = this.findOldestNonError();
      if (victim >= 0) {
        this.queue.splice(victim, 1);
        outcome = 'overflow';
      }
    }

    this.armOrSpeak(unlimited);
    return outcome;
  }

  /** The first non-error in the queue — the one waiting longest. */
  private findOldestNonError(): number {
    for (let index = 0; index < this.queue.length; index += 1) {
      // Bound and checked rather than asserted: the loop condition guarantees
      // the index, but under checked index access the compiler does not infer
      // that from `index < length`.
      const entry = this.queue[index];
      if (entry !== undefined && entry.category !== 'error') return index;
    }
    // Every entry is an error. Dropping one would lose a failure report,
    // so the queue is allowed over its bound instead.
    return -1;
  }

  private armOrSpeak(immediate: boolean): void {
    if (this.speaking) return;
    if (immediate) {
      if (this.debounceHandle !== null) {
        this.env.cancel(this.debounceHandle);
        this.debounceHandle = null;
      }
      this.pump();
      return;
    }
    if (this.debounceHandle !== null) return;
    this.debounceHandle = this.env.schedule(() => {
      this.debounceHandle = null;
      this.pump();
    }, NARRATOR_DEBOUNCE_MS);
  }

  private pump(): void {
    if (this.speaking) return;
    const request = this.queue.shift();
    if (!request) return;

    this.speaking = true;
    this.lastSpokenAt[request.category] = this.env.now();

    const languages = languagesFor(this.settings.language);
    const ducked = this.env.screenReaderActive();
    const volume = ducked ? DUCKED_VOLUME : 1;

    // Serialization within a request as well as between them: the second
    // language starts only when the first has finished. `index` walks the
    // list through the done callback rather than a loop, because a loop
    // would hand the voice two utterances at once and both would play.
    const speakFrom = (index: number): void => {
      const language = languages[index];
      if (!language) {
        this.speaking = false;
        // Straight to the next request with no second debounce: the gap
        // this line just took is already the pause the debounce is for.
        if (this.queue.length > 0) this.pump();
        return;
      }
      const utterance: NarratorUtterance = {
        id: this.nextId++,
        key: request.key,
        category: request.category,
        language,
        text: language === 'en' ? request.en : request.zhHK,
        volume,
      };
      this.spoken.push(utterance);
      if (this.spoken.length > NarratorQueue.SPOKEN_LOG_LIMIT) this.spoken.shift();
      let finished = false;
      this.env.speak(utterance, () => {
        // A voice that calls back twice would run the queue twice and
        // produce the overlap this whole class exists to prevent.
        if (finished) return;
        finished = true;
        speakFrom(index + 1);
      });
    };

    speakFrom(0);
  }
}
