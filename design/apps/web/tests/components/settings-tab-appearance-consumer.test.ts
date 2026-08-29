// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SETTINGS_TAB_APPEARANCE_EDITOR_EVENT,
  SETTINGS_TAB_APPEARANCE_REQUEST_EVENT,
  emitSettingsTabAppearanceRequest,
  registerSettingsTabAppearanceConsumer,
} from '../../../src/components/settings/settings-tab-appearance-consumer';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('settings appearance consumer', () => {
  it('delivers one validated appearance-tab request to the registered owner and event bridge', () => {
    const anchor = document.createElement('button');
    const consumer = vi.fn();
    const eventListener = vi.fn();
    window.addEventListener(SETTINGS_TAB_APPEARANCE_REQUEST_EVENT, eventListener);
    const unregister = registerSettingsTabAppearanceConsumer(consumer);

    expect(emitSettingsTabAppearanceRequest({ section: 'appearance', anchor })).toBe(true);
    expect(consumer).toHaveBeenCalledWith({ section: 'appearance', anchor });
    expect(eventListener).toHaveBeenCalledTimes(1);
    expect((eventListener.mock.calls[0]?.[0] as CustomEvent).type).toBe(SETTINGS_TAB_APPEARANCE_REQUEST_EVENT);
    expect(SETTINGS_TAB_APPEARANCE_EDITOR_EVENT).toBe('od:settings-tab-appearance-editor');

    unregister();
    window.removeEventListener(SETTINGS_TAB_APPEARANCE_REQUEST_EVENT, eventListener);
  });

  it('refuses an invalid anchor before invoking the owner or dispatching an event', () => {
    const consumer = vi.fn();
    const unregister = registerSettingsTabAppearanceConsumer(consumer);
    expect(emitSettingsTabAppearanceRequest({ section: 'appearance', anchor: null as never })).toBe(false);
    expect(consumer).not.toHaveBeenCalled();
    unregister();
  });
});
