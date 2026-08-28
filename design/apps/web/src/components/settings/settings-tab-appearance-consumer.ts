import type { SettingsSection } from '../SettingsDialog';

export const SETTINGS_TAB_APPEARANCE_REQUEST_EVENT = 'od:settings-tab-appearance-request';
export const SETTINGS_TAB_APPEARANCE_EDITOR_EVENT = 'od:settings-tab-appearance-editor';

export type SettingsTabAppearanceRequest = {
  readonly section: SettingsSection;
  readonly anchor: HTMLButtonElement;
};

export type SettingsTabAppearanceConsumer = (request: SettingsTabAppearanceRequest) => void;

let consumer: SettingsTabAppearanceConsumer | null = null;

export function registerSettingsTabAppearanceConsumer(next: SettingsTabAppearanceConsumer): () => void {
  consumer = next;
  return () => {
    if (consumer === next) consumer = null;
  };
}

export function emitSettingsTabAppearanceRequest(request: SettingsTabAppearanceRequest): boolean {
  consumer?.(request);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<SettingsTabAppearanceRequest>(SETTINGS_TAB_APPEARANCE_REQUEST_EVENT, { detail: request }));
  }
  return consumer !== null;
}
