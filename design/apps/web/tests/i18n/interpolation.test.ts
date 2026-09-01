// Regression tests for the bilingual doubling bug.
//
// `t()` used to compose the two languages and THEN interpolate the composed
// template. That is harmless for a number or a filename — the same value
// belongs in both halves — but wrong for a value that is itself translated
// copy, because it arrived already bilingual and was substituted into both
// halves. The status bar's density readout was the one that showed:
//
//   densityLabel = t('statusBar.densityDefault')      -> "Default · 預設"
//   t('statusBar.density', { level: densityLabel })
//     en  "{level} density"  ->  "Default · 預設 density"
//     zh  "{level}密度"       ->  "Default · 預設密度"
//     joined -> "Default · 預設 density · Default · 預設密度"
//
// Thirty-eight characters saying "Default density" twice in English, inside a
// 28px strip. The fix renders each language separately — filling the English
// template from the English dictionary and the 廣東話 template from the
// 廣東話 one — and joins afterwards.
//
// These exercise the same functions `I18nProvider`'s `t` calls
// (`renderInLanguage` for single-language mode, `renderBilingual` for
// bilingual mode), so a regression in the ordering fails here rather than
// only in a screenshot.

import { describe, expect, it } from 'vitest';
import {
  bilingualJoiner,
  composeBilingual,
  isTranslatedVar,
  renderBilingual,
  renderInLanguage,
  tv,
} from '../../src/i18n/interpolate';
import { en } from '../../src/i18n/locales/en';
import { zhHK } from '../../src/i18n/locales/zh-HK';
import type { Dict } from '../../src/i18n/types';

type DictKey = keyof Dict;

// The two reads a bilingual render is given, standing in for `stringFor`
// bound to each language at funny level 1.
const readEn = (key: DictKey): string => en[key] ?? key;
const readZhHK = (key: DictKey): string => zhHK[key] ?? en[key] ?? key;

describe('a translated variable is read in the language of the half it fills', () => {
  it('renders the status bar density readout once per language, not twice', () => {
    const rendered = renderBilingual(readEn, readZhHK, 'statusBar.density', {
      level: tv('statusBar.densityDefault'),
    });

    expect(rendered).toBe('Default density · 預設密度');
  });

  it('never repeats either language of the nested value', () => {
    const rendered = renderBilingual(readEn, readZhHK, 'statusBar.density', {
      level: tv('statusBar.densityDefault'),
    });

    // The exact shape the bug produced, asserted as absent rather than only
    // asserting the right answer: a future ordering change that composes
    // first would reintroduce precisely this string.
    expect(rendered).not.toBe('Default · 預設 density · Default · 預設密度');
    expect(rendered.match(/Default/g)).toHaveLength(1);
    expect(rendered.match(/預設/g)).toHaveLength(1);
  });

  it('keeps the density readout short enough to be a status-bar segment', () => {
    const rendered = renderBilingual(readEn, readZhHK, 'statusBar.density', {
      level: tv('statusBar.densityDefault'),
    });

    // The doubled form was 37 characters; the correct one is 21. Not a
    // layout assertion — the stylesheet owns the pixels — just a floor under
    // how far this can regress before the strip is unreadable again.
    expect(rendered.length).toBeLessThan(30);
  });

  it('reads a translated fallback in each language of a destructive-gate line', () => {
    const rendered = renderBilingual(readEn, readZhHK, 'conv.deleteGateItem', {
      title: tv('settings.about'),
    });

    expect(rendered).toBe(
      'The conversation “Untitled conversation” and every message in it · 對話「未改名嘅對話」同入面每一句訊息',
    );
  });

  it('leaves a plain value alone, so both halves still receive it', () => {
    expect(
      renderBilingual(readEn, readZhHK, 'statusBar.uiScale', { percent: 125 }),
    ).toBe('125% UI scale · 介面縮放 125%');
  });

  it('mixes literal and translated variables in one call', () => {
    const rendered = renderBilingual(readEn, readZhHK, 'statusBar.designSystem', {
      name: 'Neutral Modern',
    });

    expect(rendered).toBe('Design system: Neutral Modern · 設計系統：Neutral Modern');
  });
});

describe('the funny-level sliders still reach a translated variable', () => {
  // `tForLanguageTag` bypasses the sliders, so composing two of those calls
  // would have fixed the doubling and silently un-shipped the funny levels.
  // The marker is resolved through the SAME `read` that renders the outer
  // template instead, so whatever that read applies — a funny override
  // included — applies to the nested value too. These reads stand in for a
  // level-5 dictionary in each language.
  const playfulEn = (key: DictKey): string =>
    key === 'statusBar.density'
      ? '{level}-ish density, if we are honest'
      : key === 'statusBar.densityDefault'
        ? 'Bog-standard'
        : readEn(key);
  const playfulZhHK = (key: DictKey): string =>
    key === 'statusBar.density'
      ? '{level}嘅密度啦'
      : key === 'statusBar.densityDefault'
        ? '原廠設定'
        : readZhHK(key);

  it('applies each language override to the template and to the nested value', () => {
    expect(
      renderBilingual(playfulEn, playfulZhHK, 'statusBar.density', {
        level: tv('statusBar.densityDefault'),
      }),
    ).toBe('Bog-standard-ish density, if we are honest · 原廠設定嘅密度啦');
  });

  it('applies an override in single-language mode too', () => {
    expect(
      renderInLanguage(playfulEn, 'statusBar.density', {
        level: tv('statusBar.densityDefault'),
      }),
    ).toBe('Bog-standard-ish density, if we are honest');
  });

  it('lets one language be playful while the other is not', () => {
    expect(
      renderBilingual(playfulEn, readZhHK, 'statusBar.density', {
        level: tv('statusBar.densityDefault'),
      }),
    ).toBe('Bog-standard-ish density, if we are honest · 預設密度');
  });
});

describe('translated variables compose', () => {
  it('resolves a marker that carries its own variables', () => {
    const read = (key: DictKey): string =>
      key === 'statusBar.designSystem'
        ? 'Outer says {name}'
        : key === 'common.minutesAgo'
          ? 'inner {n}'
          : readEn(key);

    expect(
      renderInLanguage(read, 'statusBar.designSystem', {
        name: tv('common.minutesAgo', { n: 3 }),
      }),
    ).toBe('Outer says inner 3');
  });

  it('applies a transform to the value rather than to a composed string', () => {
    // The shape `t('common.preview').toLowerCase()` used to have: the
    // lower-casing now lands on the language's own word rather than on an
    // already-composed bilingual string.
    const read = (key: DictKey): string =>
      key === 'preview.loading'
        ? 'Loading {label}…'
        : key === 'common.preview'
          ? 'PREVIEW'
          : readEn(key);

    expect(
      renderInLanguage(read, 'preview.loading', {
        label: tv('common.preview', undefined, (value) => value.toLowerCase()),
      }),
    ).toBe('Loading preview…');
  });

  it('recognises a marker and nothing else', () => {
    expect(isTranslatedVar(tv('settings.about'))).toBe(true);
    expect(isTranslatedVar('settings.about')).toBe(false);
    expect(isTranslatedVar(null)).toBe(false);
    expect(isTranslatedVar(42)).toBe(false);
    expect(isTranslatedVar({ key: 'settings.about' })).toBe(false);
  });

  it('still shows a placeholder whose variable was never supplied', () => {
    expect(renderInLanguage(readEn, 'statusBar.density', {})).toBe('{level} density');
    expect(renderInLanguage(readEn, 'statusBar.density')).toBe('{level} density');
  });
});

describe('the join decision is made on the templates, not on the filled text', () => {
  it('declines to double a unit however large its number happens to be', () => {
    // `{n}m ago` is a compact timestamp. Deciding from the rendered text
    // would make the same chip compose at `1234m ago` and decline at `5m
    // ago`, so the guard reads the template — where the unit is visible as
    // a unit — and the answer is the same either way.
    expect(bilingualJoiner('{n}m', '{n}分', '5m', '5分')).toBeNull();
    expect(bilingualJoiner('{n}m', '{n}分', '1234m', '1234分')).toBeNull();
    expect(renderBilingual(readEn, readZhHK, 'common.minutesAgo', { n: 1234 })).toBe(
      '1234m ago · 1234 分鐘前',
    );
  });

  it('composes identical templates when the variable differs per language', () => {
    // Two dictionaries can carry the same untranslated template and still
    // fill it with different copy; that pair earns both halves, which is why
    // the sameness guard reads the rendered text and not the templates.
    const readPrimary = (key: DictKey): string =>
      key === 'settings.modeDaemon' ? 'Design' : 'Mode: {name}';
    const readSecondary = (key: DictKey): string =>
      key === 'settings.modeDaemon' ? '設計' : 'Mode: {name}';

    expect(
      renderBilingual(readPrimary, readSecondary, 'statusBar.designSystem', {
        name: tv('settings.modeDaemon'),
      }),
    ).toBe('Mode: Design · Mode: 設計');
  });

  it('still declines when the two filled halves say exactly the same thing', () => {
    const brand = (): string => 'Integrity {n}';
    expect(renderBilingual(brand, brand, 'common.minutesAgo', { n: 2 })).toBe('Integrity 2');
  });

  it('keeps composeBilingual behaving as it always did', () => {
    expect(composeBilingual('Cancel', '算數')).toBe('Cancel · 算數');
    expect(composeBilingual('Integrity', 'Integrity')).toBe('Integrity');
    expect(composeBilingual('Save', '')).toBe('Save');
    expect(composeBilingual('', 'Save')).toBe('');
    expect(composeBilingual('{n}m', '{n}分')).toBe('{n}m');
    expect(composeBilingual('A.\nB.', '甲。\n乙。')).toBe('A.\nB.\n甲。\n乙。');
  });
});

describe('single-language mode is untouched', () => {
  it('renders one language with plain and translated variables alike', () => {
    expect(
      renderInLanguage(readEn, 'statusBar.density', { level: tv('statusBar.densityCompact') }),
    ).toBe('Compact density');
    expect(renderInLanguage(readEn, 'statusBar.uiScale', { percent: 100 })).toBe(
      '100% UI scale',
    );
  });
});
