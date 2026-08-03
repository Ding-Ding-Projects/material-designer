// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CommandPalette, readPaletteDisplayMode } from '../../src/components/command-palette/CommandPalette';
import { peekPendingSettingsReveal, requestSettingsReveal } from '../../src/components/command-palette/reveal';
import { en } from '../../src/i18n/locales/en';
import type { AppConfig } from '../../src/types';

// Rendered without an `I18nProvider` on purpose: `useI18n` falls back to the
// standalone English translator, so the locale/mode/funny controls are inert
// here and every assertion is about the config-backed half — which is the half
// that has to prove "changing it here changes the setting for real".

const baseConfig: AppConfig = {
  mode: 'daemon',
  apiKey: '',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  agentId: null,
  skillId: null,
  designSystemId: null,
  theme: 'system',
  notifications: {
    soundEnabled: false,
    successSoundId: 'chime',
    failureSoundId: 'buzz',
    desktopEnabled: false,
  },
  pet: {
    adopted: true,
    enabled: false,
    petId: 'mochi',
    custom: { name: 'Buddy', glyph: '🦄', accent: '#c96442', greeting: 'hi' },
  },
  telemetry: { metrics: false },
};

function renderPalette(overrides: Partial<Parameters<typeof CommandPalette>[0]> = {}) {
  const props = {
    config: baseConfig,
    onConfigChange: vi.fn(),
    onOpenSettings: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  const view = render(<CommandPalette {...props} />);
  return { ...view, props };
}

beforeEach(() => {
  window.localStorage.clear();
  requestSettingsReveal(null);
});

afterEach(() => {
  cleanup();
  requestSettingsReveal(null);
  vi.clearAllMocks();
});

describe('CommandPalette shell', () => {
  it('opens as a bounded card, not a full window', () => {
    renderPalette();
    expect(screen.getByTestId('command-palette').dataset.displayMode).toBe('card');
  });

  it('remembers the full-window choice across a remount', () => {
    const first = renderPalette();
    fireEvent.click(screen.getByTestId('command-palette-size'));
    expect(screen.getByTestId('command-palette').dataset.displayMode).toBe('full');
    expect(readPaletteDisplayMode()).toBe('full');

    first.unmount();
    renderPalette();
    expect(screen.getByTestId('command-palette').dataset.displayMode).toBe('full');
  });

  it('closes on Escape and returns focus where it came from', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const { props, unmount } = renderPalette();
    const input = screen.getByRole('textbox');
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(1);

    // The host unmounts the palette in response to onClose; that is when focus
    // goes back.
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('does not steer the list while an IME composition is open', () => {
    const { props } = renderPalette();
    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Escape', isComposing: true });
    expect(props.onClose).not.toHaveBeenCalled();
  });
});

describe('CommandPalette live settings', () => {
  it('renders the theme select bound to the current config', () => {
    renderPalette();
    const select = screen.getByLabelText(en['settings.appearance']) as HTMLSelectElement;
    expect(select.value).toBe('system');
  });

  it('changing the theme select writes the setting for real', () => {
    const onConfigChange = vi.fn();
    renderPalette({ onConfigChange });
    fireEvent.change(screen.getByLabelText(en['settings.appearance']), {
      target: { value: 'dark' },
    });
    expect(onConfigChange).toHaveBeenCalledTimes(1);
    expect(onConfigChange.mock.calls[0]?.[0]).toMatchObject({ theme: 'dark' });
  });

  it('renders switches for the boolean settings and flips them', () => {
    const onConfigChange = vi.fn();
    renderPalette({ onConfigChange });
    const soundSwitch = screen.getByRole('switch', {
      name: en['settings.notifyCompletionSound'],
    });
    expect(soundSwitch.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(soundSwitch);
    expect(onConfigChange.mock.calls[0]?.[0]).toMatchObject({
      notifications: { soundEnabled: true },
    });
  });

  it('flips the telemetry switch without disturbing the rest of telemetry', () => {
    const onConfigChange = vi.fn();
    renderPalette({
      onConfigChange,
      config: { ...baseConfig, telemetry: { metrics: false, content: true } },
    });
    fireEvent.click(screen.getByRole('switch', { name: en['settings.privacyMetrics'] }));
    expect(onConfigChange.mock.calls[0]?.[0]).toMatchObject({
      telemetry: { metrics: true, content: true },
    });
  });

  it('renders a slider for a funny level', () => {
    renderPalette();
    const slider = screen.getByLabelText(en['settings.funnyEnglishLabel']);
    expect(slider.getAttribute('type')).toBe('range');
    expect(slider.getAttribute('min')).toBe('1');
    expect(slider.getAttribute('max')).toBe('5');
  });
});

describe('CommandPalette destinations', () => {
  it('opens the section AND arms the reveal for the exact control', () => {
    const onOpenSettings = vi.fn();
    renderPalette({ onOpenSettings });

    // The notification-sound row is a settings row with a live control; picking
    // it has to land the user on that control, not merely on the section.
    const soundRow = Array.from(
      document.querySelectorAll<HTMLElement>('#command-palette-list [role="option"]'),
    ).find((candidate) => candidate.textContent?.includes(en['settings.notifyCompletionSound']));
    expect(soundRow).toBeDefined();
    fireEvent.click(soundRow!);

    expect(onOpenSettings).toHaveBeenCalledWith('notifications');
    expect(peekPendingSettingsReveal()).toBe('notifications.sound');
  });

  it('filters the list as the user types', () => {
    renderPalette();
    const before = document.querySelectorAll('#command-palette-list [role="option"]').length;
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'zzzz-no-such-row' } });
    const after = document.querySelectorAll('#command-palette-list [role="option"]').length;
    expect(before).toBeGreaterThan(0);
    expect(after).toBe(0);
  });

  it('reports honestly when no project has published a file scope', () => {
    renderPalette();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '#index' } });
    expect(document.querySelectorAll('#command-palette-list [role="option"]')).toHaveLength(0);
  });
});
