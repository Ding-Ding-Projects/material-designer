// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const i18nState = vi.hoisted(() => ({
  locale: 'en' as 'en' | 'zh-HK',
  languageMode: 'single' as 'single' | 'bilingual',
  funnyLevels: { en: 1, 'zh-HK': 1 },
}));

const universalState = vi.hoisted(() => ({
  schoolEnabled: false,
  listener: null as ((enabled: boolean | null) => void) | null,
}));

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({
    ...i18nState,
    setLocale: vi.fn(),
    setLanguageMode: vi.fn(),
    setFunnyLevel: vi.fn(),
  }),
  useT: () => (key: string) => key,
}));

const schoolModeSource = {
  readSchoolMode: () => universalState.schoolEnabled,
  subscribeSchoolMode: (listener: (enabled: boolean | null) => void) => {
    universalState.listener = listener;
    return () => { if (universalState.listener === listener) universalState.listener = null; };
  },
};

import {
  PERSONAL_VOCABULARY_SETTINGS_MOUNT,
  PersonalVocabularySettings,
  mountPersonalVocabularySettings,
} from '../../src/components/PersonalVocabularySettings';
import {
  PERSONAL_VOCABULARY_HISTORY_KEY,
  PERSONAL_VOCABULARY_STORAGE_KEY,
} from '../../src/lib/personal-vocabulary';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  i18nState.locale = 'en';
  i18nState.languageMode = 'single';
  i18nState.funnyLevels = { en: 1, 'zh-HK': 1 };
  universalState.schoolEnabled = false;
  universalState.listener = null;
});

describe('PersonalVocabularySettings', () => {
  it('shows the empty state, loads valid bytes, applies the private preview, and clears', async () => {
    const view = render(<PersonalVocabularySettings />);
    expect(screen.getByText('No file loaded. Original wording is active.')).toBeTruthy();
    expect(screen.getByText(/Supply a versioned local JSON file/)).toBeTruthy();
    expect(screen.getByRole('searchbox', { name: 'Search personal wording settings' })).toBeTruthy();
    expect(screen.queryByText(/cloud pigeons/)).toBeNull();
    const sample = screen.getByDisplayValue('A private UI label can be adapted here.') as HTMLInputElement;
    fireEvent.change(sample, { target: { value: 'label' } });
    expect(screen.getByText('label')).toBeTruthy();

    i18nState.funnyLevels = { en: 5, 'zh-HK': 1 };
    view.rerender(<PersonalVocabularySettings />);
    const picker = screen.getByLabelText(/Choose a local vocabulary JSON file/);
    await act(async () => {
      fireEvent.change(picker, {
        target: {
          files: [new File(['{"schemaVersion":1,"entries":{"label":"display"}}'], 'vocabulary.json', { type: 'application/json' })],
        },
      });
    });
    expect(await screen.findByText(/1 entries loaded locally/)).toBeTruthy();
    expect(await screen.findByText(/cloud pigeons/)).toBeTruthy();
    expect(await screen.findByText('display')).toBeTruthy();
    expect(window.localStorage.getItem(PERSONAL_VOCABULARY_STORAGE_KEY)).toContain('display');

    fireEvent.click(screen.getByRole('button', { name: /Clear and restore original wording/ }));
    expect(window.localStorage.getItem(PERSONAL_VOCABULARY_STORAGE_KEY)).toBeNull();
    expect(screen.getByText(/Cleared\. Original wording is active again\./)).toBeTruthy();
    expect(screen.getByText('label')).toBeTruthy();
  });

  it('keeps the last valid cache when a replacement file is invalid', async () => {
    window.localStorage.setItem(PERSONAL_VOCABULARY_STORAGE_KEY, '{"schemaVersion":1,"entries":{"label":"display"}}');
    render(<PersonalVocabularySettings />);
    const picker = screen.getByLabelText('Replace local JSON file');
    await act(async () => {
      fireEvent.change(picker, {
        target: {
          files: [new File(['{"schemaVersion":1,"entries":{"label":42}}'], 'bad.json', { type: 'application/json' })],
        },
      });
    });
    expect(screen.getByText(/Every replacement must be a string\./)).toBeTruthy();
    expect(window.localStorage.getItem(PERSONAL_VOCABULARY_STORAGE_KEY)).toContain('display');
  });

  it('reports a thrown clear refusal and keeps the valid cache active', async () => {
    window.localStorage.setItem(PERSONAL_VOCABULARY_STORAGE_KEY, '{"schemaVersion":1,"entries":{"label":"display"}}');
    render(<PersonalVocabularySettings />);
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('storage unavailable'); });
    fireEvent.click(screen.getByRole('button', { name: /Clear and restore original wording/ }));
    expect(await screen.findByText(/storage is unavailable/i)).toBeTruthy();
    expect(window.localStorage.getItem(PERSONAL_VOCABULARY_STORAGE_KEY)).toContain('display');
    remove.mockRestore();
  });

  it('restores the cache and local history when the external history boundary refuses', async () => {
    window.localStorage.setItem(PERSONAL_VOCABULARY_STORAGE_KEY, '{"schemaVersion":1,"entries":{"label":"display"}}');
    render(<PersonalVocabularySettings onHistoryMutation={() => ({ ok: false, message: 'History was not recorded.' })} />);
    const picker = screen.getByLabelText('Replace local JSON file');
    await act(async () => {
      fireEvent.change(picker, {
        target: {
          files: [new File(['{"schemaVersion":1,"entries":{"label":"changed"}}'], 'replacement.json', { type: 'application/json' })],
        },
      });
    });
    expect(await screen.findByText(/History was not recorded\./)).toBeTruthy();
    expect(window.localStorage.getItem(PERSONAL_VOCABULARY_STORAGE_KEY)).toContain('display');
    expect(window.localStorage.getItem(PERSONAL_VOCABULARY_HISTORY_KEY)).toBeNull();
  });

  it('suppresses the whole surface while School mode is active', () => {
    universalState.schoolEnabled = true;
    render(<PersonalVocabularySettings schoolModeSource={schoolModeSource} />);
    expect(screen.queryByText('Personal wording')).toBeNull();
  });

  it('fails closed before an unresolved C1 host reports School mode off', () => {
    let listener: ((enabled: boolean | null) => void) | null = null;
    const unresolvedSource = {
      readSchoolMode: () => null,
      subscribeSchoolMode: (next: (enabled: boolean | null) => void) => {
        listener = next;
        return () => { listener = null; };
      },
    };
    render(<PersonalVocabularySettings schoolModeSource={unresolvedSource} />);
    expect(screen.queryByText('Personal wording')).toBeNull();
    act(() => listener?.(false));
    expect(screen.getByText('Personal wording')).toBeTruthy();
  });

  it('keeps an unavailable School-mode update unresolved instead of treating it as off', () => {
    let listener: ((enabled: boolean | null) => void) | null = null;
    const source = {
      readSchoolMode: () => false,
      subscribeSchoolMode: (next: (enabled: boolean | null) => void) => {
        listener = next;
        return () => { listener = null; };
      },
    };
    const view = render(<PersonalVocabularySettings schoolModeSource={source} />);
    expect(screen.getByText('Personal wording')).toBeTruthy();
    act(() => listener?.(null));
    expect(view.container.querySelector('[data-personal-vocabulary]')).toBeNull();
    act(() => listener?.(false));
    expect(screen.getByText('Personal wording')).toBeTruthy();
  });

  it('suppresses and restores live when the canonical School setting changes', () => {
    const view = render(<PersonalVocabularySettings schoolModeSource={schoolModeSource} />);
    expect(screen.getByText('Personal wording')).toBeTruthy();
    act(() => universalState.listener?.(true));
    expect(screen.queryByText('Personal wording')).toBeNull();
    act(() => universalState.listener?.(false));
    expect(view.container.querySelector('[data-personal-vocabulary]')).not.toBeNull();
    expect(screen.getByText('Personal wording')).toBeTruthy();
  });

  it('exposes stable C0 settings and palette mount metadata', () => {
    expect(PERSONAL_VOCABULARY_SETTINGS_MOUNT).toEqual({
      id: 'personalVocabulary',
      section: 'general',
      paletteId: 'setting:personalVocabulary',
    });
    expect(mountPersonalVocabularySettings({ schoolModeSource: schoolModeSource })).toBeTruthy();
  });

  it('uses Cantonese and bilingual labels without shipping a private payload', () => {
    i18nState.locale = 'zh-HK';
    i18nState.languageMode = 'bilingual';
    i18nState.funnyLevels = { en: 5, 'zh-HK': 5 };
    render(<PersonalVocabularySettings />);
    expect(screen.getByText(/Personal wording .*Personal wording/)).toBeTruthy();
    expect(screen.queryByText(/cloud pigeons/)).toBeNull();
  });

  it('changes every explanatory copy level independently in English and Cantonese', () => {
    i18nState.locale = 'en';
    i18nState.languageMode = 'single';
    const view = render(<PersonalVocabularySettings />);
    const english = [];
    for (const level of [1, 2, 3, 4, 5] as const) {
      i18nState.funnyLevels = { en: level, 'zh-HK': 1 };
      view.rerender(<PersonalVocabularySettings />);
      english.push(view.container.querySelector('section p')?.textContent ?? '');
    }
    expect(new Set(english).size).toBe(5);

    i18nState.locale = 'zh-HK';
    const cantonese = [];
    for (const level of [1, 2, 3, 4, 5] as const) {
      i18nState.funnyLevels = { en: 1, 'zh-HK': level };
      view.rerender(<PersonalVocabularySettings />);
      cantonese.push(view.container.querySelector('section p')?.textContent ?? '');
    }
    expect(new Set(cantonese).size).toBe(5);
  });
});
