// A named set of packaged-app UI states, captured from the real running app.
//
// Why this exists: the packaged smoke test proved the built application
// installs, launches, answers its own health check and uninstalls — and it
// captured exactly one frame, the home screen at the default window size, in
// English, at 100% UI scale. That single frame was the entire visual evidence
// base for a Material Design 3 redesign whose own standards name four display
// scales, a narrow width, and a bilingual mode where the labels are longest and
// clipping shows first of all.
//
// Three rules govern everything below.
//
//  1. A capture is of the REAL running application or it does not exist. Every
//     state is reached by driving the app's own persisted settings and its own
//     keyboard entry points, then waiting for the app to apply them. Nothing is
//     synthesised, no placeholder is ever written, and no frame is republished
//     under a second name.
//  2. A state that cannot be reached produces NO FILE and a named reason, in
//     the run log and in `ui-states.json`. A capture path that quietly skips is
//     worse than one that does not exist, because the report then looks
//     complete.
//  3. Every state is VERIFIED by an observable property of the running app
//     before its frame is taken — the scale the document actually carries, the
//     Han characters bilingual mode actually renders, the viewport width the
//     window actually has. An unverified capture is a capture that can lie.
//
// Rule 3 has one residual hole this module closes by measurement rather than by
// assertion: `capturePage()` returns the last COMPOSITED frame, so a compositor
// that has stopped producing frames would hand back the previous state's pixels
// under the new state's name. Every capture therefore records its own sha256,
// and a frame whose bytes match an earlier, differently-named frame is reported
// as `duplicateOf` rather than silently trusted.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export type PackagedUiStateEvalResult = {
  error?: string;
  ok: boolean;
  value?: unknown;
};

export type PackagedUiStateDriver = {
  /** Capture the running desktop window into `absolutePath`. Must reject when no file was written. */
  capture(absolutePath: string): Promise<void>;
  /** Evaluate an expression in the running app's renderer. Must not throw for an in-app error. */
  evaluate(expression: string): Promise<PackagedUiStateEvalResult>;
  /** Where the run log goes. */
  log(message: string): void;
  /** Copy a captured frame into the run report at `reportRelpath`. */
  publish(reportRelpath: string, bytes: Buffer): Promise<void>;
  /** Scratch directory for raw frames before they are published. */
  screenshotDir: string;
};

export type PackagedUiStateCapture = {
  bytes: number;
  /** One line saying exactly how this state was reached. */
  driver: string;
  /** Set when this frame's bytes are identical to an earlier, differently-named frame. */
  duplicateOf?: string;
  name: string;
  reportRelpath: string;
  sha256: string;
  /** The observable app properties that proved the state was applied. */
  verified: Record<string, unknown>;
};

export type PackagedUiStateSkip = {
  name: string;
  reason: string;
};

export type PackagedUiStatesResult = {
  attempted: number;
  captured: PackagedUiStateCapture[];
  duplicateFrames: number;
  skipped: PackagedUiStateSkip[];
};

type ProbeSnapshot = {
  cjk: boolean;
  /** `--od-css-zoom`: the factor CSS is carrying, `1` when the host scaled. */
  cssZoom: string;
  homeVisible: boolean;
  innerHeight: number;
  innerWidth: number;
  languageMode: string | null;
  locale: string | null;
  mounted: string | null;
  navMark: string | null;
  odScale: string;
  /**
   * How far the document overflows its own viewport, in CSS pixels. This is
   * the number the 200% capture was published for: a scaled layout that
   * MAGNIFIES rather than reflowing overflows to the right and off the
   * bottom, and the frame shows a horizontal scrollbar and no status bar.
   * Recorded rather than asserted on purpose — a state that fails this must
   * still produce its frame, because the picture is the evidence.
   */
  overflowX: number;
  overflowY: number;
  paletteOpen: boolean;
  readyState: string;
  settingsOpen: boolean;
  zoom: string;
};

type ReachedState = {
  /** Runs after the frame has been published; used to close a surface again. */
  cleanup?: () => Promise<void>;
  verified: Record<string, unknown>;
};

/**
 * The `BrowserWindow` size `apps/desktop/src/main/runtime.ts` creates, and the
 * `minWidth`/`minHeight` floor it declares. That floor is not an arbitrary
 * "narrow" number: it is the width below which the same file says the project
 * page's split overlaps and the top navigation clips, so it is exactly the
 * narrowest layout the product claims to support — the most useful narrow frame
 * there is, and the narrowest one the shell will even allow.
 */
const DEFAULT_WINDOW = { height: 900, width: 1280 } as const;
const NARROW_WINDOW = { height: 700, width: 900 } as const;

/** Storage keys owned by `apps/web/src/state/appearance.ts` and `apps/web/src/i18n/index.tsx`. */
const APPEARANCE_KEY = 'open-design:appearance';
const LOCALE_KEY = 'open-design:locale';
const LOCALE_SOURCE_KEY = 'open-design:locale-source';
const LANGUAGE_MODE_KEY = 'open-design:language-mode';

/** `App.tsx` writes this the moment the app tree has mounted. */
const APP_MOUNTED_VALUE = '1';

/** The display scales the project's own standards name. */
const UI_SCALES = [1, 1.25, 1.5, 2] as const;

const POLL_INTERVAL_MS = 400;
const RELOAD_TIMEOUT_MS = 60_000;
const SURFACE_TIMEOUT_MS = 15_000;
const RESIZE_TIMEOUT_MS = 10_000;
/** Long enough for the dialog/palette enter transition (~200ms) to finish compositing. */
const SURFACE_SETTLE_MS = 700;

/**
 * One expression, carrying every fact the states below are verified against.
 *
 * `navMark` is the reload detector. A state that persists a preference and
 * reloads has a race in it — poll too early and the OLD document answers, still
 * mounted, still showing the previous state, and the frame gets taken before the
 * app ever applied the new one. A property written onto `window` cannot survive
 * a navigation, so waiting for it to disappear is proof the reload actually
 * happened rather than a guess dressed up as a timeout.
 */
const PROBE_EXPRESSION = `
  (() => {
    const root = document.documentElement;
    const home = document.querySelector('[data-testid="entry-nav-home"]');
    const text = document.body == null ? '' : (document.body.textContent || '');
    const read = (key) => {
      try { return window.localStorage.getItem(key); } catch (error) { return null; }
    };
    return {
      cjk: /[\\u4e00-\\u9fff]/.test(text),
      cssZoom: root.style.getPropertyValue('--od-css-zoom'),
      homeVisible: home instanceof HTMLElement && home.getClientRects().length > 0,
      innerHeight: window.innerHeight,
      innerWidth: window.innerWidth,
      languageMode: read(${JSON.stringify(LANGUAGE_MODE_KEY)}),
      locale: read(${JSON.stringify(LOCALE_KEY)}),
      mounted: root.getAttribute('data-od-app-mounted'),
      navMark: typeof window.__odSmokeNavMark === 'string' ? window.__odSmokeNavMark : null,
      odScale: root.style.getPropertyValue('--od-scale'),
      overflowX: Math.max(0, root.scrollWidth - root.clientWidth),
      overflowY: Math.max(0, root.scrollHeight - root.clientHeight),
      paletteOpen: document.querySelector('[data-testid="command-palette"]') instanceof HTMLElement,
      readyState: document.readyState,
      settingsOpen: document.querySelector('.modal-settings[role="dialog"]') instanceof HTMLElement,
      zoom: root.style.zoom,
    };
  })()
`;

const CLOSE_SETTINGS_EXPRESSION = `
  (() => {
    const button = document.querySelector('.settings-close');
    if (!(button instanceof HTMLElement)) return { closed: false, reason: 'missing-settings-close' };
    button.click();
    return { closed: true };
  })()
`;

/**
 * Capture the named state set from an already-running, already-healthy packaged
 * app.
 *
 * Never throws for a state it could not reach: an unreachable state is recorded
 * in `skipped` with its reason and the run continues, because one awkward
 * surface must not take down the suite that gates every push. The caller is
 * expected to assert that the set is not *entirely* empty — that would mean the
 * mechanism itself is broken, which is a real regression rather than a flake.
 */
export async function capturePackagedUiStates(
  driver: PackagedUiStateDriver,
): Promise<PackagedUiStatesResult> {
  const captured: PackagedUiStateCapture[] = [];
  const skipped: PackagedUiStateSkip[] = [];
  const seen = new Map<string, string>();
  let attempted = 0;

  const skip = (name: string, reason: string): void => {
    attempted += 1;
    skipped.push({ name, reason });
    driver.log(`[packaged ui states] NOT CAPTURED — ${name}: ${reason}`);
  };

  const take = async (
    name: string,
    describeDriver: string,
    reach: () => Promise<ReachedState>,
  ): Promise<void> => {
    attempted += 1;
    const reached = await reach().then(
      (state) => state,
      (error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        skipped.push({ name, reason });
        driver.log(`[packaged ui states] NOT CAPTURED — ${name}: ${reason}`);
        return null;
      },
    );
    if (reached === null) return;

    const reportRelpath = `screenshots/${name}.png`;
    const absolutePath = join(driver.screenshotDir, `${name}.png`);
    try {
      await driver.capture(absolutePath);
      const bytes = await readFile(absolutePath);
      if (bytes.byteLength === 0) throw new Error('the captured frame was empty');

      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const previous = seen.get(sha256);
      await driver.publish(reportRelpath, bytes);
      if (previous == null) seen.set(sha256, name);

      const entry: PackagedUiStateCapture = {
        bytes: bytes.byteLength,
        driver: describeDriver,
        name,
        reportRelpath,
        sha256,
        verified: reached.verified,
      };
      if (previous != null) {
        entry.duplicateOf = previous;
        driver.log(
          `[packaged ui states] WARNING — ${name} is byte-identical to ${previous}. Both states ` +
            'verified as applied in the DOM, so this points at the window compositor returning a ' +
            'stale frame rather than at the app; treat both frames as suspect.',
        );
      }
      captured.push(entry);
      driver.log(`[packaged ui states] captured ${name} (${bytes.byteLength} bytes) — ${describeDriver}`);
    } catch (error) {
      const reason = `the state was reached but its frame could not be captured: ${
        error instanceof Error ? error.message : String(error)
      }`;
      skipped.push({ name, reason });
      driver.log(`[packaged ui states] NOT CAPTURED — ${name}: ${reason}`);
    } finally {
      if (reached.cleanup != null) {
        await reached.cleanup().catch((error: unknown) => {
          driver.log(
            `[packaged ui states] failed to restore the app after ${name}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
      }
    }
  };

  // ---- Surfaces other than home, taken first ----------------------------
  //
  // Before any preference is touched, so these frames show the app exactly as
  // an untouched install renders it. Both are opened through the real keyboard
  // shortcut App.tsx binds rather than by poking a state setter, so the capture
  // is evidence the entry point works and not only that the component renders.

  await take(
    'settings-dialog',
    "Ctrl+, dispatched at window, the shortcut App.tsx binds to openSettings(); closed again via the dialog's own close button",
    async () =>
      openKeyboardSurface(driver, {
        close: CLOSE_SETTINGS_EXPRESSION,
        isOpen: (probe) => probe.settingsOpen,
        label: 'settings dialog',
        open: keyboardEventExpression({ ctrlKey: true, key: ',' }),
      }),
  );

  await take(
    'command-palette',
    'Ctrl+Shift+P dispatched at window, the shortcut App.tsx binds to the palette toggle; the same combination closes it',
    async () =>
      openKeyboardSurface(driver, {
        close: keyboardEventExpression({ ctrlKey: true, key: 'P', shiftKey: true }),
        isOpen: (probe) => probe.paletteOpen,
        label: 'command palette',
        open: keyboardEventExpression({ ctrlKey: true, key: 'P', shiftKey: true }),
      }),
  );

  // ---- The four display scales the standards name -----------------------
  //
  // Driven through the app's own persisted appearance preference rather than
  // through the operating system's display scale. `applyAppearancePreferences-
  // ToDocument` reads that preference at boot, writes `--od-scale`, and asks
  // the desktop host to scale its own web contents — so each frame is evidence
  // the product honours a saved scale on a cold render, the behaviour a user
  // actually meets, and the runner's own display setting stays out of it.
  //
  // `overflowX`/`overflowY` in each frame's verified block are the number this
  // set exists for. Scaling that MAGNIFIES rather than reflowing overflows the
  // window, and the published 200% frame showed exactly that: a horizontal
  // scrollbar, a heading cut off mid-word, no status bar. Zero on both axes at
  // every scale is the claim; the frame beside it is how you check the claim
  // is about the right thing.

  for (const scale of UI_SCALES) {
    const percent = Math.round(scale * 100);
    await take(
      `home-scale-${percent}`,
      `appearance uiScale=${scale} persisted to localStorage['${APPEARANCE_KEY}'], then reloaded so the app applies it at boot`,
      async () =>
        reloadInto(driver, {
          expect: (probe) => probe.odScale === String(scale),
          label: `home at ${percent}% UI scale`,
          mutations: appearanceScaleMutation(scale),
        }),
    );
  }

  // ---- Bilingual mode ---------------------------------------------------
  //
  // English paired with 廣東話, which is where a label is longest and where
  // clipping shows before anywhere else. Verified by Han characters actually
  // being on screen, not by the stored preference alone — a preference the app
  // failed to honour would otherwise pass as a bilingual capture.

  await take(
    'home-bilingual',
    'locale=en with language-mode=bilingual persisted to localStorage, then reloaded; verified by Han characters actually rendering',
    async () =>
      reloadInto(driver, {
        expect: (probe) => probe.languageMode === 'bilingual' && probe.cjk && probe.odScale === '1',
        label: 'home in bilingual mode',
        mutations: {
          ...appearanceScaleMutation(1),
          [LANGUAGE_MODE_KEY]: 'bilingual',
          [LOCALE_KEY]: 'en',
          [LOCALE_SOURCE_KEY]: 'manual',
        },
      }),
  );

  // ---- The narrowest window the product supports ------------------------
  //
  // Taken in bilingual mode first: longest labels at the narrowest supported
  // width is the single frame most likely to show a clipping defect. Then again
  // in English, so a defect can be attributed to the width or to the labels.

  const narrowFailure = await resizeWindow(driver, NARROW_WINDOW, (probe) => probe.innerWidth <= 1000).then(
    () => null,
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );

  if (narrowFailure != null) {
    skip('home-bilingual-narrow-900', narrowFailure);
    skip('home-narrow-900', narrowFailure);
  } else {
    await take(
      'home-bilingual-narrow-900',
      `window.resizeTo(${NARROW_WINDOW.width}, ${NARROW_WINDOW.height}) — the desktop shell's own minWidth floor — still in bilingual mode`,
      async () =>
        observeState(
          driver,
          (probe) => probe.innerWidth <= 1000 && probe.homeVisible && probe.cjk,
          'the narrow bilingual home',
        ),
    );

    await take(
      'home-narrow-900',
      `the same ${NARROW_WINDOW.width}px window with language-mode returned to single English and reloaded`,
      async () =>
        reloadInto(driver, {
          expect: (probe) =>
            probe.languageMode === 'single' && probe.locale === 'en' && probe.innerWidth <= 1000,
          label: 'the narrow home in English',
          mutations: {
            [LANGUAGE_MODE_KEY]: 'single',
            [LOCALE_KEY]: 'en',
            [LOCALE_SOURCE_KEY]: 'manual',
          },
        }),
    );

    // Hygiene rather than evidence: nothing after this renders, but a window
    // left at the floor would quietly become the next reader's "default".
    // The exact complement of the narrow predicate rather than a second
    // hard-coded width, so a runner whose display clamps the window can never
    // make "restored" and "narrow" both true or both false.
    await resizeWindow(driver, DEFAULT_WINDOW, (probe) => probe.innerWidth > 1000).catch(
      (error: unknown) => {
        driver.log(
          `[packaged ui states] could not restore the window to ${DEFAULT_WINDOW.width}px: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      },
    );
  }

  const duplicateFrames = captured.filter((entry) => entry.duplicateOf != null).length;
  driver.log(
    [
      `[packaged ui states] ${captured.length} of ${attempted} states captured` +
        (duplicateFrames > 0 ? `, ${duplicateFrames} byte-identical to an earlier frame` : ''),
      ...skipped.map((entry) => `  not captured — ${entry.name}: ${entry.reason}`),
    ].join('\n'),
  );

  return { attempted, captured, duplicateFrames, skipped };
}

function appearanceScaleMutation(scale: number): Record<string, string> {
  // A partial appearance payload is deliberate: `normalizeAppearancePreferences`
  // fills every field the payload does not carry with that field's own default,
  // so writing only the scale cannot disturb seed, density or typography.
  return { [APPEARANCE_KEY]: JSON.stringify({ uiScale: scale }) };
}

function keyboardEventExpression(init: { ctrlKey?: boolean; key: string; shiftKey?: boolean }): string {
  // Dispatched at `window` because that is where App.tsx registers both
  // shortcuts, in the capture phase. Going through the real key handler rather
  // than a state setter is the point: it is the path a user takes.
  return `
    (() => {
      window.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        ctrlKey: ${init.ctrlKey === true},
        key: ${JSON.stringify(init.key)},
        shiftKey: ${init.shiftKey === true},
      }));
      return { dispatched: true };
    })()
  `;
}

async function openKeyboardSurface(
  driver: PackagedUiStateDriver,
  options: {
    close: string;
    isOpen: (probe: ProbeSnapshot) => boolean;
    label: string;
    open: string;
  },
): Promise<ReachedState> {
  const opened = await driver.evaluate(options.open);
  if (!opened.ok) {
    throw new Error(
      `could not dispatch the shortcut that opens the ${options.label}: ${opened.error ?? 'unknown error'}`,
    );
  }
  const probe = await waitForProbe(driver, options.isOpen, `the ${options.label} to open`, SURFACE_TIMEOUT_MS);
  // The surface animates in; capturing on the frame it first appears would
  // catch it mid-transition and produce a screenshot of a half-scaled dialog.
  await delay(SURFACE_SETTLE_MS);

  return {
    cleanup: async () => {
      const closed = await driver.evaluate(options.close);
      if (!closed.ok) {
        throw new Error(`could not close the ${options.label}: ${closed.error ?? 'unknown error'}`);
      }
      await waitForProbe(
        driver,
        (snapshot) => !options.isOpen(snapshot),
        `the ${options.label} to close`,
        SURFACE_TIMEOUT_MS,
      );
    },
    verified: { ...summarizeProbe(probe), surface: options.label },
  };
}

async function reloadInto(
  driver: PackagedUiStateDriver,
  options: {
    expect: (probe: ProbeSnapshot) => boolean;
    label: string;
    mutations: Record<string, string>;
  },
): Promise<ReachedState> {
  const mark = `nav-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const expression = `
    (() => {
      const entries = ${JSON.stringify(Object.entries(options.mutations))};
      try {
        for (const entry of entries) window.localStorage.setItem(entry[0], entry[1]);
      } catch (error) {
        return { ok: false, reason: String(error) };
      }
      window.__odSmokeNavMark = ${JSON.stringify(mark)};
      // Next task, so this expression's own result reaches the caller before
      // the renderer navigates away and takes the reply channel with it.
      setTimeout(() => { window.location.reload(); }, 0);
      return { ok: true, stored: entries.map((entry) => [entry[0], window.localStorage.getItem(entry[0])]) };
    })()
  `;

  const written = await driver.evaluate(expression);
  if (!written.ok) {
    throw new Error(
      `could not persist the preferences for ${options.label}: ${written.error ?? 'unknown error'}`,
    );
  }
  const value = written.value;
  if (isRecord(value) && value.ok !== true) {
    throw new Error(
      `the app refused to persist the preferences for ${options.label}: ${String(value.reason)}`,
    );
  }

  const probe = await waitForProbe(
    driver,
    (snapshot) =>
      snapshot.navMark === null &&
      snapshot.mounted === APP_MOUNTED_VALUE &&
      snapshot.homeVisible &&
      options.expect(snapshot),
    options.label,
    RELOAD_TIMEOUT_MS,
  );
  return { verified: summarizeProbe(probe) };
}

async function resizeWindow(
  driver: PackagedUiStateDriver,
  size: { height: number; width: number },
  expect: (probe: ProbeSnapshot) => boolean,
): Promise<ProbeSnapshot> {
  const expression = `
    (() => {
      const before = { innerHeight: window.innerHeight, innerWidth: window.innerWidth };
      if (typeof window.resizeTo !== 'function') {
        return { before, ok: false, reason: 'window.resizeTo is not a function in this renderer' };
      }
      try {
        window.resizeTo(${size.width}, ${size.height});
      } catch (error) {
        return { before, ok: false, reason: String(error) };
      }
      return { before, ok: true };
    })()
  `;
  const requested = await driver.evaluate(expression);
  if (!requested.ok) {
    throw new Error(
      `the window could not be resized to ${size.width}x${size.height}: ${requested.error ?? 'unknown error'}`,
    );
  }
  const value = requested.value;
  if (isRecord(value) && value.ok !== true) {
    throw new Error(
      `the window refused a resize to ${size.width}x${size.height}: ${String(value.reason)}`,
    );
  }
  return waitForProbe(
    driver,
    (probe) => expect(probe) && probe.homeVisible,
    `the window to settle at ${size.width}x${size.height}`,
    RESIZE_TIMEOUT_MS,
  );
}

async function observeState(
  driver: PackagedUiStateDriver,
  expect: (probe: ProbeSnapshot) => boolean,
  label: string,
): Promise<ReachedState> {
  const probe = await waitForProbe(driver, expect, label, SURFACE_TIMEOUT_MS);
  return { verified: summarizeProbe(probe) };
}

async function waitForProbe(
  driver: PackagedUiStateDriver,
  expect: (probe: ProbeSnapshot) => boolean,
  label: string,
  timeoutMs: number,
): Promise<ProbeSnapshot> {
  const startedAt = Date.now();
  let last: unknown = null;
  while (Date.now() - startedAt < timeoutMs) {
    const result: PackagedUiStateEvalResult = await driver
      .evaluate(PROBE_EXPRESSION)
      .catch((error: unknown) => ({
        error: error instanceof Error ? error.message : String(error),
        ok: false,
      }));
    if (result.ok) {
      const probe = asProbeSnapshot(result.value);
      last = probe ?? result.value;
      if (probe != null && expect(probe)) return probe;
    } else {
      last = result.error ?? 'the renderer eval failed';
    }
    await delay(POLL_INTERVAL_MS);
  }
  throw new Error(
    `timed out after ${timeoutMs}ms waiting for ${label}; last observed state: ${formatUnknown(last)}`,
  );
}

function summarizeProbe(probe: ProbeSnapshot): Record<string, unknown> {
  return {
    cjk: probe.cjk,
    cssZoom: probe.cssZoom,
    homeVisible: probe.homeVisible,
    innerHeight: probe.innerHeight,
    innerWidth: probe.innerWidth,
    languageMode: probe.languageMode,
    locale: probe.locale,
    odScale: probe.odScale,
    overflowX: probe.overflowX,
    overflowY: probe.overflowY,
    zoom: probe.zoom,
  };
}

function asProbeSnapshot(value: unknown): ProbeSnapshot | null {
  if (!isRecord(value)) return null;
  const innerWidth = value.innerWidth;
  const readyState = value.readyState;
  // These two are the shape check: an eval that returned something else — an
  // error page, a half-torn-down document mid-navigation — must be treated as
  // "not this state yet" rather than coerced into a snapshot of zeroes.
  if (typeof innerWidth !== 'number' || typeof readyState !== 'string') return null;
  return {
    cjk: value.cjk === true,
    cssZoom: typeof value.cssZoom === 'string' ? value.cssZoom.trim() : '',
    homeVisible: value.homeVisible === true,
    innerHeight: typeof value.innerHeight === 'number' ? value.innerHeight : 0,
    innerWidth,
    languageMode: typeof value.languageMode === 'string' ? value.languageMode : null,
    locale: typeof value.locale === 'string' ? value.locale : null,
    mounted: typeof value.mounted === 'string' ? value.mounted : null,
    navMark: typeof value.navMark === 'string' ? value.navMark : null,
    // `getPropertyValue` on a custom property returns the stored token stream,
    // which may keep the leading whitespace the declaration had. Trim before
    // comparing, so a state is never reported unreachable over a space.
    odScale: typeof value.odScale === 'string' ? value.odScale.trim() : '',
    overflowX: typeof value.overflowX === 'number' ? value.overflowX : 0,
    overflowY: typeof value.overflowY === 'number' ? value.overflowY : 0,
    paletteOpen: value.paletteOpen === true,
    readyState,
    settingsOpen: value.settingsOpen === true,
    zoom: typeof value.zoom === 'string' ? value.zoom : '',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

function formatUnknown(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}
