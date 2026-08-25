import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { en } from '../../src/i18n/locales/en';
import { zhCN } from '../../src/i18n/locales/zh-CN';
import { zhHK } from '../../src/i18n/locales/zh-HK';
import { zhTW } from '../../src/i18n/locales/zh-TW';

const railSource = fs.readFileSync(
  new URL('../../src/components/EntryNavRail.tsx', import.meta.url),
  'utf8',
);

describe('EntryNavRail community accessible label', () => {
  it('uses the dedicated Feishu key for Chinese community links', () => {
    expect(railSource).toContain(
      "const communityLabel = isChinese ? t('entry.feishuAria') : t('entry.discordAria');",
    );
    expect(zhCN['entry.feishuAria']).toContain('飞书');
    expect(zhTW['entry.feishuAria']).toContain('飛書');
    expect(zhHK['entry.feishuAria']).toBe(zhTW['entry.feishuAria']);
    expect(zhCN['entry.feishuAria']).not.toContain('Discord');
    expect(zhTW['entry.feishuAria']).not.toContain('Discord');
  });

  it('keeps a complete English fallback for the typed dictionary', () => {
    expect(en['entry.feishuAria']).toContain('Feishu');
  });
});
