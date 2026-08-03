// What the narrator actually says, in both languages, at the funny level
// each language is set to.
//
// `t()` cannot answer this. It renders ONE string for the active locale,
// and bilingual mode joins two with a separator — correct for a label, and
// wrong for speech, where "Theme changed · 主題轉咗" read aloud is one
// sentence containing a middle dot. Narration needs the two renderings
// kept apart so the queue can speak them one after the other, each in its
// own voice, so this module resolves each language independently.
//
// It reads the same three sources `t()` does — the base dictionary, the
// sparse funny overrides, and `keepsTheFacts` — rather than a narration
// dictionary of its own. That is what makes the promise "tone follows the
// funny level, content does not" true for spoken lines and not merely
// claimed: a spoken error is the same sentence the toast shows, at the
// same level, guarded by the same rule that throws away an override which
// dropped a number or a placeholder.

import { keepsTheFacts } from '../../i18n';
import { en } from '../../i18n/locales/en';
import { zhHK } from '../../i18n/locales/zh-HK';
import { EN_FUNNY } from '../../i18n/funny/en';
import { ZH_HK_FUNNY } from '../../i18n/funny/zh-HK';
import type {
  Dict,
  FunnyLanguage,
  FunnyLevel,
  FunnyOverrides,
} from '../../i18n/types';

const BASE: Record<FunnyLanguage, Dict> = { 'en': en, 'zh-HK': zhHK };
const OVERRIDES: Record<FunnyLanguage, FunnyOverrides> = { 'en': EN_FUNNY, 'zh-HK': ZH_HK_FUNNY };

/**
 * The same walk `applyFunny` does inside the i18n provider: down from the
 * requested level to the nearest one this key actually defines, discarding
 * any candidate that lost a fact.
 *
 * It is duplicated rather than imported because the provider does not
 * export it — and duplicating four lines is a smaller risk than exporting
 * an internal from the module every rendered string in the app passes
 * through. `keepsTheFacts` IS imported, so the half of the rule that
 * actually protects the user is shared code and cannot drift.
 */
function funnyFor(language: FunnyLanguage, key: keyof Dict, level: FunnyLevel): string {
  const base = BASE[language][key] ?? en[key] ?? String(key);
  if (level <= 1) return base;
  const entry = OVERRIDES[language][key];
  if (!entry) return base;
  for (let step: number = level; step >= 2; step -= 1) {
    const candidate = entry[step as Exclude<FunnyLevel, 1>];
    if (candidate && keepsTheFacts(base, candidate)) return candidate;
  }
  return base;
}

function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = vars[name];
    return value == null ? `{${name}}` : String(value);
  });
}

export interface NarrationLine {
  en: string;
  zhHK: string;
}

/**
 * Render one dictionary key for both spoken languages.
 *
 * Interpolation happens after the level is applied, on each side
 * separately, exactly as `t()` does it — the placeholders survive the
 * funny pass because `keepsTheFacts` refuses any override that drops one.
 */
export function narrationLine(
  key: keyof Dict,
  funnyLevels: Record<FunnyLanguage, FunnyLevel>,
  vars?: Record<string, string | number>,
): NarrationLine {
  return {
    en: interpolate(funnyFor('en', key, funnyLevels.en), vars),
    zhHK: interpolate(funnyFor('zh-HK', key, funnyLevels['zh-HK']), vars),
  };
}
