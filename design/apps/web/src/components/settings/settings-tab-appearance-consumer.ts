import type { SettingsSection } from '../SettingsDialog';

export const SETTINGS_TAB_APPEARANCE_REQUEST_EVENT = 'od:settings-tab-appearance-request';
export const SETTINGS_TAB_APPEARANCE_EDITOR_EVENT = 'od:settings-tab-appearance-editor';

export type SettingsTabAppearanceRequest = {
  readonly section: SettingsSection;
  readonly anchor: HTMLButtonElement;
};

export type SettingsTabAppearanceConsumer = (request: SettingsTabAppearanceRequest) => void;

let consumer: SettingsTabAppearanceConsumer | null = null;

function validRequest(request: SettingsTabAppearanceRequest): boolean {
  return Boolean(request)
    && typeof request.section === 'string'
    && request.section === 'appearance'
    && typeof request.anchor?.focus === 'function'
    && request.anchor.isConnected
    && (typeof HTMLButtonElement === 'undefined' || request.anchor instanceof HTMLButtonElement);
}

export function registerSettingsTabAppearanceConsumer(next: SettingsTabAppearanceConsumer): () => void {
  consumer = next;
  return () => {
    if (consumer === next) consumer = null;
  };
}

export function emitSettingsTabAppearanceRequest(request: SettingsTabAppearanceRequest): boolean {
  if (!validRequest(request)) return false;
  consumer?.(request);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<SettingsTabAppearanceRequest>(SETTINGS_TAB_APPEARANCE_REQUEST_EVENT, { detail: request }));
  }
  return consumer !== null;
}

function dispatchEditorRequest(event: Event): void {
  const detail = (event as CustomEvent<SettingsTabAppearanceRequest>).detail;
  if (!validRequest(detail)) return;
  detail.anchor.focus({ preventScroll: true });
  const focusRoot = detail.anchor.getRootNode();
  const focused = typeof ShadowRoot !== 'undefined' && focusRoot instanceof ShadowRoot
    ? focusRoot.activeElement === detail.anchor
    : document.activeElement === detail.anchor;
  if (!focused) return;
  window.dispatchEvent(new CustomEvent<SettingsTabAppearanceRequest>(SETTINGS_TAB_APPEARANCE_EDITOR_EVENT, { detail }));
}

// The feature-owned consumer is safe to import from the settings surface and
// from isolated tests. Central application registration remains the caller's
// responsibility, while this bridge guarantees that a valid request reaches
// the anchored editor event used by the appearance boundary.
if (typeof window !== 'undefined') {
  window.addEventListener(SETTINGS_TAB_APPEARANCE_REQUEST_EVENT, dispatchEditorRequest);
}
