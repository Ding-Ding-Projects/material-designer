// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  emitSettingsTabAppearanceRequest,
  registerSettingsTabAppearanceConsumer,
  SETTINGS_TAB_APPEARANCE_REQUEST_EVENT,
} from '../../src/components/settings/settings-tab-appearance-consumer';

describe('Settings appearance consumer contract', () => {
  afterEach(() => undefined);

  it('delivers the exact section and anchor to the registered production consumer and event', () => {
    const anchor = document.createElement('button');
    const consumer = vi.fn();
    const listener = vi.fn();
    const dispose = registerSettingsTabAppearanceConsumer(consumer);
    window.addEventListener(SETTINGS_TAB_APPEARANCE_REQUEST_EVENT, listener);
    expect(emitSettingsTabAppearanceRequest({ section: 'appearance', anchor })).toBe(true);
    window.removeEventListener(SETTINGS_TAB_APPEARANCE_REQUEST_EVENT, listener);
    dispose();
    expect(consumer).toHaveBeenCalledWith({ section: 'appearance', anchor });
    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ section: 'appearance', anchor });
  });

  it('reports no registered consumer while preserving the observable event fallback', () => {
    const listener = vi.fn();
    window.addEventListener(SETTINGS_TAB_APPEARANCE_REQUEST_EVENT, listener);
    expect(emitSettingsTabAppearanceRequest({ section: 'appearance', anchor: document.createElement('button') })).toBe(false);
    window.removeEventListener(SETTINGS_TAB_APPEARANCE_REQUEST_EVENT, listener);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
