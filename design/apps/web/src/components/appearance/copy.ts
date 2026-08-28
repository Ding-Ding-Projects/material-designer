import type { FunnyLanguage, FunnyLevel, LanguageMode } from '../../i18n/types';

export interface AppearanceCopyContext {
  languageMode: LanguageMode;
  locale: string;
  funnyLevels: Record<FunnyLanguage, FunnyLevel>;
}

/**
 * Appearance copy keeps facts stable while selecting the active language and
 * a small voice variation from the same funny-level state used by the rest of
 * the application. Labels are data, not component logic, so this helper can
 * later be replaced by catalogue keys without changing editor behavior.
 */
export function appearanceCopy(
  context: AppearanceCopyContext,
  english: string,
  cantonese: string,
): string {
  const primary = context.locale === 'zh-HK' ? cantonese : english;
  if (context.languageMode === 'bilingual') return `${english} · ${cantonese}`;
  const level = context.locale === 'zh-HK' ? context.funnyLevels['zh-HK'] : context.funnyLevels.en;
  if (level <= 1) return primary;
  if (context.locale === 'zh-HK') {
    return [primary, `${primary}，慢慢調`, `${primary}，順手調`, `${primary}，靚靚調`, `${primary}，有嘢玩喇`][level - 1] ?? primary;
  }
  return [primary, `${primary}, gently tuned`, `${primary}, nicely tuned`, `${primary}, polished`, `${primary}, with the full toolbox ready`][level - 1] ?? primary;
}
