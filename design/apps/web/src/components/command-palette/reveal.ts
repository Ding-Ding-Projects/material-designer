// Landing the user on the right tab and leaving them to hunt is not arriving.
//
// When the palette opens a destination it has to finish the journey: open the
// surface, find the exact control, scroll it into view, move focus to it, and
// flash it briefly so the eye knows where the keyboard now is. That last part
// matters more than it looks — a scroll with no visual event reads as "the page
// moved" rather than "here is the thing you asked for".
//
// The reveal is deliberately split in two, because the target does not exist
// yet at the moment the request is made: opening Settings mounts the dialog on
// a later frame, and the section's own content mounts after that. So the caller
// *requests* an anchor, the surface *takes* it when it mounts, and `revealAnchor`
// polls for the node with a deadline rather than assuming a single frame is
// enough. A reveal that never finds its node gives up quietly — the user is
// still on the right surface, which is most of the value.

/** Stamped by `SettingsDialog` on the controls the settings index points at. */
export const SETTINGS_REVEAL_ATTRIBUTE = 'data-od-setting';

/** Applied for `REVEAL_FLASH_MS`. Declared in `styles/primitives.css`. */
export const REVEAL_FLASH_CLASS = 'od-reveal-flash';

export const REVEAL_FLASH_MS = 1600;

/** How long to keep looking for a node that has not mounted yet. */
export const REVEAL_WAIT_MS = 2000;

const REVEAL_POLL_MS = 24;

const FOCUSABLE_SELECTOR = [
  'button:not(:disabled)',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Fired when a reveal is requested, so a Settings dialog that is ALREADY open
 * can act on it. Without this the request would only ever be consumed on mount,
 * and picking a setting from the palette while Settings happened to be open
 * would do nothing visible — the worst kind of failure, because the feature
 * looks broken exactly when the user is already looking at the right screen.
 */
export const SETTINGS_REVEAL_EVENT = 'open-design:settings-reveal';

let pendingAnchor: string | null = null;

/**
 * Record the anchor the next settings mount should reveal. Passing `null`
 * clears it, which is what closing the dialog does — a stale anchor that fires
 * on the user's *next* unrelated visit to Settings is a poltergeist.
 */
export function requestSettingsReveal(anchor: string | null): void {
  pendingAnchor = anchor;
  if (anchor && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SETTINGS_REVEAL_EVENT));
  }
}

/** Read and clear. A reveal request is consumed exactly once. */
export function takePendingSettingsReveal(): string | null {
  const anchor = pendingAnchor;
  pendingAnchor = null;
  return anchor;
}

/** Read without clearing. For tests and for assertions at a call site. */
export function peekPendingSettingsReveal(): string | null {
  return pendingAnchor;
}

export function settingsRevealSelector(anchor: string): string {
  // CSS.escape is not in every environment this runs in (jsdom has it, older
  // WebViews may not), and the anchors are authored ids rather than user input,
  // so quoting the attribute value is enough. Reject anything that could break
  // out of the quotes instead of building a selector that silently matches the
  // wrong node.
  if (anchor.includes('"') || anchor.includes('\\')) return '';
  return `[${SETTINGS_REVEAL_ATTRIBUTE}="${anchor}"]`;
}

/**
 * Scroll to an element, focus the first thing in it that can hold focus, and
 * flash it. Safe to call in jsdom, where `scrollIntoView` does not exist.
 */
export function revealElement(element: HTMLElement): void {
  if (typeof element.scrollIntoView === 'function') {
    element.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  const focusTarget = element.matches(FOCUSABLE_SELECTOR)
    ? element
    : element.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
  // `preventScroll` keeps the browser from re-scrolling the element to the top
  // of the pane and undoing the centred position we just asked for.
  focusTarget?.focus?.({ preventScroll: true });

  element.classList.add(REVEAL_FLASH_CLASS);
  const clear = () => element.classList.remove(REVEAL_FLASH_CLASS);
  if (typeof window === 'undefined') {
    clear();
    return;
  }
  window.setTimeout(clear, REVEAL_FLASH_MS);
}

export interface RevealAnchorOptions {
  /** Where to look. Defaults to the document. */
  root?: ParentNode;
  /** Deadline for the node to appear. */
  waitMs?: number;
}

/**
 * Poll for `[data-od-setting="<anchor>"]` and reveal it. Resolves `true` when
 * the node was found and revealed, `false` when the deadline passed.
 *
 * Polling rather than a `MutationObserver` because the wait is bounded and
 * short, the observer would have to be torn down on every outcome anyway, and
 * a 24ms tick is invisible next to the dialog's own open animation.
 */
export function revealAnchor(
  anchor: string,
  options: RevealAnchorOptions = {},
): Promise<boolean> {
  const selector = settingsRevealSelector(anchor);
  if (!selector || typeof document === 'undefined') return Promise.resolve(false);
  const root = options.root ?? document;
  const waitMs = options.waitMs ?? REVEAL_WAIT_MS;

  const found = root.querySelector<HTMLElement>(selector);
  if (found) {
    revealElement(found);
    return Promise.resolve(true);
  }
  if (typeof window === 'undefined') return Promise.resolve(false);

  return new Promise<boolean>((resolve) => {
    const deadline = Date.now() + waitMs;
    const tick = () => {
      const element = root.querySelector<HTMLElement>(selector);
      if (element) {
        revealElement(element);
        resolve(true);
        return;
      }
      if (Date.now() >= deadline) {
        resolve(false);
        return;
      }
      window.setTimeout(tick, REVEAL_POLL_MS);
    };
    window.setTimeout(tick, REVEAL_POLL_MS);
  });
}
