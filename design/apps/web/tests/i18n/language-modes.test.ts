import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { composeBilingual, keepsTheFacts, secondaryLocaleFor, useI18n } from '../../src/i18n';
import { EN_FUNNY } from '../../src/i18n/funny/en';
import { ZH_HK_FUNNY } from '../../src/i18n/funny/zh-HK';
import { en } from '../../src/i18n/locales/en';
import { zhHK } from '../../src/i18n/locales/zh-HK';
import type { Dict, FunnyOverrides } from '../../src/i18n/types';

const OVERRIDE_LEVELS: Array<2 | 3 | 4 | 5> = [2, 3, 4, 5];
const EXPECTED_CONTEXT_FIELDS = [
  'dismissFunnyDisclosure',
  'funnyDisclosureSeen',
  'funnyLevels',
  'languageMode',
  'locale',
  'setFunnyLevel',
  'setLanguageMode',
  'setLocale',
  't',
] as const;

function assertOverridesKeepTheFacts(label: string, overrides: FunnyOverrides, base: Dict): void {
  for (const key of Object.keys(overrides) as Array<keyof Dict>) {
    const levels = overrides[key];
    if (!levels) continue;
    const baseValue = base[key];
    for (const level of OVERRIDE_LEVELS) {
      const value = levels[level];
      if (typeof value !== 'string') continue;
      expect(
        keepsTheFacts(baseValue, value),
        `${label}.${String(key)} level ${level} drops a placeholder or a number that the base string states`,
      ).toBe(true);
    }
  }
}

describe('bilingual mode', () => {
  it('pairs English with 廣東話 and everything else with English', () => {
    expect(secondaryLocaleFor('en')).toBe('zh-HK');
    expect(secondaryLocaleFor('zh-HK')).toBe('en');
    expect(secondaryLocaleFor('zh-TW')).toBe('en');
    expect(secondaryLocaleFor('fr')).toBe('en');
  });

  it('joins two readings of the same key', () => {
    expect(composeBilingual('Cancel', '算數')).toBe('Cancel · 算數');
  });

  it('uses a line break when either side already spans lines', () => {
    expect(composeBilingual('A new version is ready.\nDownload it.', '有新版本。\n下載佢。')).toBe(
      'A new version is ready.\nDownload it.\n有新版本。\n下載佢。',
    );
  });

  it('declines to compose when the two sides already say the same thing', () => {
    // Brand and proper-noun labels are verbatim English in every locale, so
    // composing them would print the same word twice.
    expect(composeBilingual('Integrity', 'Integrity')).toBe('Integrity');
  });

  it('declines to compose a blank side', () => {
    expect(composeBilingual('Save', '')).toBe('Save');
    expect(composeBilingual('', 'Save')).toBe('');
  });

  it('declines to compose units, glyphs, and bare placeholders', () => {
    // `{n}m` is a compact timestamp, not a sentence: doubling it makes the
    // chip unreadable and translates nothing.
    expect(composeBilingual('{n}m', '{n}分')).toBe('{n}m');
    expect(composeBilingual('{count}', '{count} 個')).toBe('{count}');
    expect(composeBilingual('⤢', '⤢ 全螢幕')).toBe('⤢');
  });
});

describe('provider-less i18n fallback', () => {
  it('covers the complete context contract with neutral shipped semantics', () => {
    const { result } = renderHook(() => useI18n());

    expect(Object.keys(result.current).sort()).toEqual(EXPECTED_CONTEXT_FIELDS);
    expect(result.current.locale).toBe('en');
    expect(result.current.languageMode).toBe('single');
    expect(result.current.funnyLevels).toEqual({ en: 1, 'zh-HK': 1 });
    expect(result.current.funnyDisclosureSeen).toBe(true);
    expect(result.current.t('common.cancel')).toBe('Cancel');
  });

  it('keeps the singleton and inert setters stable across renders', () => {
    const first = renderHook(() => useI18n());
    const second = renderHook(() => useI18n());

    expect(second.result.current).toBe(first.result.current);
    expect(() => first.result.current.setLocale('zh-HK')).not.toThrow();
    expect(() => first.result.current.setLanguageMode('bilingual')).not.toThrow();
    expect(() => first.result.current.setFunnyLevel('en', 5)).not.toThrow();
    expect(() => first.result.current.dismissFunnyDisclosure()).not.toThrow();
    expect(first.result.current.languageMode).toBe('single');
    expect(first.result.current.funnyLevels).toEqual({ en: 1, 'zh-HK': 1 });
  });
});

describe('funny levels change voice, never facts', () => {
  it('keeps every English override faithful to the base string', () => {
    assertOverridesKeepTheFacts('en', EN_FUNNY, en);
  });

  it('keeps every 廣東話 override faithful to the base string', () => {
    assertOverridesKeepTheFacts('zh-HK', ZH_HK_FUNNY, zhHK);
  });

  it('covers the same keys in both languages, so a bilingual render matches in energy', () => {
    expect(Object.keys(EN_FUNNY).sort()).toEqual(Object.keys(ZH_HK_FUNNY).sort());
  });

  it('rejects an override that drops a placeholder or a number', () => {
    expect(keepsTheFacts('Delete {n} file(s)?', 'Bin {n} file(s)?')).toBe(true);
    expect(keepsTheFacts('Delete {n} file(s)?', 'Bin the lot?')).toBe(false);
    expect(keepsTheFacts('Save up to 67% on plans', 'Grab the 67% while it lasts')).toBe(true);
    expect(keepsTheFacts('Save up to 67% on plans', 'Grab a big discount')).toBe(false);
  });
});
