import type { SettingsSection } from '../SettingsDialog';

export const SETTINGS_TAB_APPEARANCE_REQUEST_EVENT = 'od:settings-tab-appearance-request';

export type SettingsTabAppearanceRequest = {
  readonly section: SettingsSection;
  readonly anchor: HTMLButtonElement;
};

export type SettingsTabAppearanceConsumer = (request: SettingsTabAppearanceRequest) => void;

let consumer: SettingsTabAppearanceConsumer | null = null;

/**
 * Register the real appearance editor without importing or duplicating its
 * rendering engine in Settings. The returned disposer makes hot remounts and
 * tests safe, while a missing consumer remains observable through the event
 * fallback instead of pretending that an editor opened.
 */
export function registerSettingsTabAppearanceConsumer(next: SettingsTabAppearanceConsumer): () => void {
  consumer = next;
  return () => {
    if (consumer === next) consumer = null;
  };
}

export function emitSettingsTabAppearanceRequest(request: SettingsTabAppearanceRequest): boolean {
  consumer?.(request);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<SettingsTabAppearanceRequest>(SETTINGS_TAB_APPEARANCE_REQUEST_EVENT, {
      detail: request,
    }));
  }
  return consumer !== null;
}
