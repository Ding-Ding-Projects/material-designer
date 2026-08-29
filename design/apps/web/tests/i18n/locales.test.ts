import { readdirSync, readFileSync } from 'node:fs';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { resolveSystemLocale } from '../../src/i18n';
import { en } from '../../src/i18n/locales/en';
import { id } from '../../src/i18n/locales/id';
import { zhCN } from '../../src/i18n/locales/zh-CN';
import { zhTW } from '../../src/i18n/locales/zh-TW';
import { LOCALES, LOCALE_LABEL, type Dict, type Locale } from '../../src/i18n/types';

const EXPECTED_LOCALES = ['en', 'id', 'de', 'zh-CN', 'zh-TW', 'zh-HK', 'pt-BR', 'es-ES', 'ru', 'fa', 'ar', 'ja', 'ko', 'pl', 'hu', 'fr', 'uk', 'tr', 'th', 'it'];

// Hand-written on purpose: discovering only the files already known to the
// test would let a newly added locale disappear from duplicate-key coverage.
const LOCALE_SOURCE_FILES = [
  'ar.ts',
  'de.ts',
  'en.ts',
  'es-ES.ts',
  'fa.ts',
  'fr.ts',
  'hu.ts',
  'id.ts',
  'it.ts',
  'ja.ts',
  'ko.ts',
  'pl.ts',
  'pt-BR.ts',
  'ru.ts',
  'th.ts',
  'tr.ts',
  'uk.ts',
  'zh-CN.ts',
  'zh-HK.ts',
  'zh-TW.ts',
] as const;

const LOCALE_SOURCE_DIRECTORY = new URL('../../src/i18n/locales/', import.meta.url);

const RELEASE_BLOCKING_LOCALE_KEYS = [
  'libraryPicker.kindFilter',
  'statusBar.version',
] as const satisfies ReadonlyArray<keyof Dict>;

function localeDictionaryObject(sourceFile: ts.SourceFile): ts.ObjectLiteralExpression {
  const dictionaries: ts.ObjectLiteralExpression[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (declaration.initializer && ts.isObjectLiteralExpression(declaration.initializer)) {
        dictionaries.push(declaration.initializer);
      }
    }
  }

  if (dictionaries.length !== 1) {
    throw new Error(
      `${sourceFile.fileName} must contain exactly one top-level locale dictionary; found ${dictionaries.length}`,
    );
  }

  return dictionaries[0]!;
}

function staticPropertyName(property: ts.PropertyAssignment, fileName: string): string {
  if (ts.isStringLiteral(property.name) || ts.isNoSubstitutionTemplateLiteral(property.name)) {
    return property.name.text;
  }
  if (ts.isIdentifier(property.name) || ts.isNumericLiteral(property.name)) {
    return property.name.text;
  }
  throw new Error(`${fileName} contains a computed locale key; use a static key so duplicates stay auditable`);
}

function duplicateLocaleKeys(source: string, fileName: string): string[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const parseDiagnostics = (
    sourceFile as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }
  ).parseDiagnostics ?? [];
  if (parseDiagnostics.length > 0) {
    const summary = parseDiagnostics
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '))
      .join('; ');
    throw new Error(`${fileName} is not valid TypeScript source: ${summary}`);
  }
  const dictionary = localeDictionaryObject(sourceFile);
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const property of dictionary.properties) {
    if (ts.isSpreadAssignment(property)) continue;
    if (!ts.isPropertyAssignment(property)) {
      throw new Error(`${fileName} contains a non-property locale entry that cannot be audited`);
    }
    const key = staticPropertyName(property, fileName);
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }

  return [...duplicates].sort();
}

function placeholders(value: string): string[] {
  const names: string[] = [];
  for (const match of value.matchAll(/\{(\w+)\}/g)) {
    if (match[1]) {
      names.push(match[1]);
    }
  }
  return names.sort();
}

function releaseBlockingLocaleKeyViolations(dict: Partial<Dict>): string[] {
  const violations: string[] = [];

  for (const key of RELEASE_BLOCKING_LOCALE_KEYS) {
    const value = dict[key];
    if (typeof value !== 'string') {
      violations.push(`${key}: missing`);
      continue;
    }

    const actualPlaceholders = placeholders(value);
    const expectedPlaceholders = placeholders(en[key]);
    if (actualPlaceholders.join('\0') !== expectedPlaceholders.join('\0')) {
      violations.push(
        `${key}: placeholders ${JSON.stringify(actualPlaceholders)} must equal ${JSON.stringify(
          expectedPlaceholders,
        )}`,
      );
    }
  }

  return violations;
}

async function loadDict(locale: Locale): Promise<Dict> {
  const module = await import(`../../src/i18n/locales/${locale}.ts`);
  const dict = Object.values(module).find((value): value is Dict => {
    return Boolean(value) && typeof value === 'object';
  });
  if (!dict) {
    throw new Error(`No dictionary export found for locale ${locale}`);
  }
  return dict;
}

function explicitLocaleKeys(locale: Locale): string[] {
  const source = readFileSync(new URL(`../../src/i18n/locales/${locale}.ts`, import.meta.url), 'utf8');
  return Array.from(source.matchAll(/^\s*['"]([^'"]+)['"]:/gm), (match) => match[1] ?? '').filter(Boolean);
}

describe('i18n locales', () => {
  it('ships typed Appearance labels in every supported locale without raw keys', async () => {
    const keys: Array<keyof Dict> = [
      'settings.appearance',
      'settings.appearanceHint',
      'settings.themeSystem',
      'settings.themeLight',
      'settings.themeDark',
    ];

    for (const locale of LOCALES) {
      const dict = await loadDict(locale);
      for (const key of keys) {
        expect(typeof dict[key], `${locale}.${key}`).toBe('string');
        expect(dict[key], `${locale}.${key}`).not.toBe(key);
      }
    }
  });

  it('enumerates every locale source file in the duplicate-key guard', () => {
    const filesOnDisk = readdirSync(LOCALE_SOURCE_DIRECTORY)
      .filter((fileName) => fileName.endsWith('.ts'))
      .sort();

    expect(filesOnDisk).toEqual([...LOCALE_SOURCE_FILES].sort());
  });

  it('detects repeated source keys before object evaluation can overwrite them', () => {
    const duplicateFixture = `export const fixture = { 'same.key': 'first', 'same.key': 'second' };`;

    expect(duplicateLocaleKeys(duplicateFixture, 'duplicate-fixture.ts')).toEqual(['same.key']);
  });

  it('rejects orphan locale values that are not object properties', () => {
    const orphanFixture = `export const fixture = { 'valid.key': 'value', 'orphan value', 'next.key': 'value' };`;

    expect(() => duplicateLocaleKeys(orphanFixture, 'orphan-fixture.ts')).toThrow();
  });

  it('keeps every locale dictionary free of repeated source keys', () => {
    const duplicatesByFile: Record<string, string[]> = {};

    for (const fileName of LOCALE_SOURCE_FILES) {
      const source = readFileSync(new URL(fileName, LOCALE_SOURCE_DIRECTORY), 'utf8');
      const duplicates = duplicateLocaleKeys(source, fileName);
      if (duplicates.length > 0) duplicatesByFile[fileName] = duplicates;
    }

    expect(duplicatesByFile).toEqual({});
  });

  it('keeps the release-blocking library filter and version keys complete in every hand-written locale file', async () => {
    const violationsByFile: Record<string, string[]> = {};

    for (const fileName of LOCALE_SOURCE_FILES) {
      const locale = fileName.replace(/[.]ts$/, '') as Locale;
      const violations = releaseBlockingLocaleKeyViolations(await loadDict(locale));
      if (violations.length > 0) violationsByFile[fileName] = violations;
    }

    expect(violationsByFile).toEqual({});
  });

  it('fails closed when a release-blocking locale key disappears or loses its placeholder', () => {
    const missingKey: Partial<Dict> = { ...en };
    delete missingKey['libraryPicker.kindFilter'];

    expect(releaseBlockingLocaleKeyViolations(missingKey)).toEqual([
      'libraryPicker.kindFilter: missing',
    ]);
    expect(
      releaseBlockingLocaleKeyViolations({
        ...en,
        'statusBar.version': 'Version',
      }),
    ).toEqual(['statusBar.version: placeholders [] must equal ["version"]']);
  });

  it('resolves the initial locale from browser language preferences', () => {
    expect(resolveSystemLocale(['zh-Hans-CN', 'en-US'])).toBe('zh-CN');
    expect(resolveSystemLocale(['pt-PT', 'en-US'])).toBe('pt-BR');
    expect(resolveSystemLocale(['es-MX', 'en-US'])).toBe('es-ES');
    expect(resolveSystemLocale(['nl-NL', 'en-US'])).toBe('en');
    expect(resolveSystemLocale(['nl-NL'])).toBeNull();
  });

  // Region beats script for the Chinese tags. `zh-Hant-HK` (what macOS
  // reports for a Hong Kong user) used to land on zh-TW because only the
  // second subtag was inspected; now that a Cantonese dictionary exists, a
  // `hk` / `mo` subtag anywhere in the tag wins, and a tag that only says
  // Traditional — or says Taiwan — still means zh-TW.
  it('routes Hong Kong and Macau Chinese tags to zh-HK, and Taiwan/Hant to zh-TW', () => {
    expect(resolveSystemLocale(['zh-HK'])).toBe('zh-HK');
    expect(resolveSystemLocale(['zh-Hant-HK', 'en-US'])).toBe('zh-HK');
    expect(resolveSystemLocale(['zh-MO'])).toBe('zh-HK');
    expect(resolveSystemLocale(['zh-Hant-MO'])).toBe('zh-HK');
    expect(resolveSystemLocale(['zh-TW'])).toBe('zh-TW');
    expect(resolveSystemLocale(['zh-Hant'])).toBe('zh-TW');
    expect(resolveSystemLocale(['zh-Hant-TW'])).toBe('zh-TW');
    expect(resolveSystemLocale(['zh'])).toBe('zh-CN');
  });

  it('registers every supported locale in the language menu', () => {
    expect(LOCALES).toEqual(EXPECTED_LOCALES);
    expect((LOCALE_LABEL as Record<string, string>).id).toBe('Bahasa Indonesia');
    expect((LOCALE_LABEL as Record<string, string>).de).toBe('Deutsch');
    expect((LOCALE_LABEL as Record<string, string>).it).toBe('Italiano');
    expect((LOCALE_LABEL as Record<string, string>).ja).toBe('日本語');
    expect((LOCALE_LABEL as Record<string, string>)['zh-HK']).toBe('廣東話');
  });

  it('localizes the Home prototype creation type in every supported locale', async () => {
    const expected: Record<Locale, string> = {
      ar: 'نموذج أولي',
      de: 'Prototyp',
      en: 'Prototype',
      'es-ES': 'Prototipo',
      fa: 'نمونه اولیه',
      fr: 'Prototype',
      hu: 'Prototípus',
      id: 'Prototipe',
      it: 'Prototipo',
      ja: 'プロトタイプ',
      ko: '프로토타입',
      pl: 'Prototyp',
      'pt-BR': 'Protótipo',
      ru: 'Прототип',
      th: 'ต้นแบบ',
      tr: 'Prototip',
      uk: 'Прототип',
      'zh-CN': '原型',
      'zh-HK': '原型',
      'zh-TW': '原型',
    };

    for (const locale of LOCALES) {
      const dict = await loadDict(locale);
      expect(dict['homeHero.chip.prototype'], `${locale}.homeHero.chip.prototype`).toBe(
        expected[locale],
      );
    }
  });

  it('keeps locale dictionaries aligned with English keys and placeholders', async () => {
    const englishKeys = Object.keys(en).sort();

    for (const locale of LOCALES) {
      const dict = await loadDict(locale);
      expect(Object.keys(dict).sort()).toEqual(englishKeys);

      for (const key of englishKeys) {
        const dictKey = key as keyof Dict;
        expect(placeholders(dict[dictKey]), `${locale}.${key}`).toEqual(
          placeholders(en[dictKey]),
        );
      }
    }
  });

  it('labels workspace USD spending power as allowance instead of points or account balance', async () => {
    const expected: Record<Locale, string> = {
      ar: 'الحصة',
      de: 'Kontingent',
      en: 'Allowance',
      'es-ES': 'Cuota',
      fa: 'سهمیه',
      fr: 'Quota',
      hu: 'Keret',
      id: 'Kuota',
      it: 'Quota',
      ja: '利用枠',
      ko: '사용 한도',
      pl: 'Limit',
      'pt-BR': 'Cota',
      ru: 'Лимит',
      th: 'โควตา',
      tr: 'Kota',
      uk: 'Ліміт',
      'zh-CN': '额度',
      'zh-HK': '額度',
      'zh-TW': '額度',
    };

    for (const locale of LOCALES) {
      const dict = await loadDict(locale);
      expect(dict['entry.credits'], `${locale}.entry.credits`).toBe(expected[locale]);
      expect(dict['settings.amrBalance'], `${locale}.settings.amrBalance`).toBe(
        expected[locale],
      );
    }
  });

  it('keeps Chinese workspace wallet and pre-run gate copy on the 额度 terminology', () => {
    const keys: Array<keyof Dict> = [
      'chat.amrError.balanceMessage',
      'chat.amrBalanceGate.message',
      'chat.amrBalanceGate.watchingWallet',
      'chat.amrLowBalance.title',
      'chat.amrLowBalance.message',
      'chat.runError.title.balance',
      'entry.creditsAria',
      'entry.creditsAriaWithBalance',
      'entry.creditsGrantTip',
      'entry.creditsRemaining',
    ];

    for (const [locale, dict, quota] of [
      ['zh-CN', zhCN, '额度'],
      ['zh-TW', zhTW, '額度'],
    ] as const) {
      for (const key of keys) {
        expect(dict[key], `${locale}.${key}`).toContain(quota);
        expect(dict[key], `${locale}.${key}`).not.toMatch(/余额|餘額|积分|積分/);
      }
    }
  });

  it('keeps the recharge recovery action concise enough to sit beside retry', async () => {
    const expected: Record<Locale, string> = {
      ar: 'شحن',
      de: 'Aufladen',
      en: 'Top up',
      'es-ES': 'Recargar',
      fa: 'شارژ',
      fr: 'Recharger',
      hu: 'Feltöltés',
      id: 'Isi ulang',
      it: 'Ricarica',
      ja: 'チャージ',
      ko: '충전',
      pl: 'Doładuj',
      'pt-BR': 'Recarregar',
      ru: 'Пополнить',
      th: 'เติมเงิน',
      tr: 'Bakiye yükle',
      uk: 'Поповнити',
      'zh-CN': '充值',
      'zh-HK': '儲值',
      'zh-TW': '儲值',
    };

    for (const locale of LOCALES) {
      const dict = await loadDict(locale);
      expect(dict['chat.amrError.rechargeCta'], `${locale}.chat.amrError.rechargeCta`).toBe(
        expected[locale],
      );
    }
  });

  it('keeps Indonesian connector settings copy translated instead of falling back to English', () => {
    const translatedKeys: Array<keyof Dict> = [
      'settings.connectorsNavHint',
      'settings.connectorsHint',
      'settings.connectorsComposioApiKey',
      'settings.connectorsSavedTitle',
      'settings.connectorsSaved',
      'settings.connectorsGetApiKey',
      'settings.connectorsApiKeyPlaceholder',
      'settings.connectorsClear',
      'settings.connectorsSaveKey',
      'settings.connectorsKeyError',
      'settings.connectorsHelpEmpty',
      'settings.connectorsLoadingSavedKey',
      'settings.autosaveSaving',
      'settings.autosaveSaved',
      'settings.autosaveError',
      'settings.orbit.eyebrow',
      'settings.orbit.navHint',
      'settings.orbit.lede',
      'settings.orbit.statusOnTitle',
      'settings.orbit.statusOffTitle',
      'settings.orbit.runTitle',
      'settings.orbit.running',
      'settings.orbit.runOpen',
      'settings.orbit.dailySummaryTitle',
      'settings.orbit.dailySummarySub',
      'settings.orbit.runTimeTitle',
      'settings.orbit.runTimeSub',
      'settings.orbit.nextRun',
      'settings.orbit.nextRunScheduledAfterSave',
      'settings.orbit.schedule',
      'settings.orbit.pausedManualOnly',
      'settings.orbit.templateTitle',
      'settings.orbit.templateMissing',
      'settings.orbit.templateMissingOption',
      'settings.orbit.templateMissingInstall',
      'settings.orbit.templateMissingPickAnother',
      'settings.orbit.templateResetTitle',
      'settings.orbit.templateReset',
      'settings.orbit.templateHelp',
      'settings.orbit.templatesLoading',
      'settings.orbit.templatesOptgroup',
      'settings.orbit.lastRun',
      'settings.orbit.countChecked',
      'settings.orbit.countSucceeded',
      'settings.orbit.countSkipped',
      'settings.orbit.countFailed',
      'settings.orbit.runError',
      'settings.orbit.artifactKickerLive',
    ];

    for (const key of translatedKeys) {
      expect(id[key], key).not.toBe(en[key]);
    }
  });

  it('keeps Chinese integrations copy translated instead of falling back to English', () => {
    const translatedKeys: Array<keyof Dict> = [
      'entry.navIntegrations',
      'integrations.kicker',
      'integrations.lede',
      'integrations.agentReady',
      'integrations.tabLabel.mcp',
      'integrations.tabLabel.skills',
      'integrations.tabHint.mcp',
      'integrations.tabHint.connectors',
      'integrations.tabHint.useEverywhere',
      'integrations.skillsTitle',
      'integrations.skillsBody',
      'mcpClient.title',
      'mcpClient.subtitle',
      'mcpClient.addServer',
      'mcpClient.emptyTitle',
      'mcpClient.emptyBody',
      'mcpClient.saveChanges',
      'mcpClient.storedAt',
      'mcpClient.daemonError',
      'mcpClient.saveFailed',
      'tasks.comingSoon',
    ];

    for (const key of translatedKeys) {
      expect(zhCN[key], `zh-CN.${key}`).not.toBe(en[key]);
      expect(zhTW[key], `zh-TW.${key}`).not.toBe(en[key]);
    }
  });

  it('explains API provider draft activation in English and Chinese', () => {
    expect(en['settings.byokDraftNotice']).toBe(
      'Complete the required fields to save this provider. Your current setup will remain active.',
    );
    expect(zhCN['settings.byokDraftNotice']).toBe(
      '填写必填项后即可保存此提供商；当前配置将继续保持生效。',
    );
    expect(zhTW['settings.byokDraftNotice']).toBe(
      '填寫必填欄位後即可儲存此供應商；目前的設定將繼續維持生效。',
    );
  });

  it('keeps Routines settings page copy translated in Chinese (issue #1372)', () => {
    const translatedKeys: Array<keyof Dict> = [
      'routines.title',
      'routines.subtitle',
      'routines.newAutomation',
      'routines.runNow',
      'routines.pause',
      'routines.resume',
      'routines.history',
      'routines.delete',
      'routines.describe.daily',
      'routines.describe.weekly',
      'routines.status.succeeded',
      'routines.status.failed',
      'routines.modeCreate',
      'routines.confirmDelete',
      'routines.errorPickProject',
    ];

    for (const key of translatedKeys) {
      expect(zhCN[key], `zh-CN.${key}`).not.toBe(en[key]);
      expect(zhTW[key], `zh-TW.${key}`).not.toBe(en[key]);
    }
  });

  it('declares CI-sensitive Indonesian fallback keys explicitly', () => {
    const explicitKeys = new Set(explicitLocaleKeys('id'));
    const requiredExplicitKeys = Object.keys(en).filter((key) => {
      return key.startsWith('connectors.category.') || key.startsWith('liveArtifact.viewer.');
    });

    expect(requiredExplicitKeys.filter((key) => !explicitKeys.has(key))).toEqual([]);
  });

  it('avoids brittle per-key English lookups in the Indonesian locale source', () => {
    const source = readFileSync(new URL('../../src/i18n/locales/id.ts', import.meta.url), 'utf8');

    expect(source).not.toMatch(/en\['(?:connectors\.category\.|liveArtifact\.viewer\.)/);
  });

  // Tier-1 locale parity lock (issue #1894):
  //
  // Most locale modules use `...en` spread so missing translations silently
  // fall back to English at runtime — that satisfies the dictionary-shape
  // test above (`Object.keys(dict)` is complete) but hides drift between
  // English and the rendered locale. `zh-CN` is the one locale today that
  // declares every key explicitly with no `...en` spread, so a new English
  // key without a matching `zh-CN` entry is a *real* hole, not a benign
  // fallback. The two cases below lock that property in place: any future
  // PR that lets `zh-CN` drift, or reintroduces an implicit spread, fails
  // CI loudly instead of regressing translation coverage in silence.
  it('keeps zh-CN explicitly translated for every English key (tier-1 parity lock)', () => {
    const englishKeys = Object.keys(en).sort();
    const explicit = explicitLocaleKeys('zh-CN').sort();

    expect(
      explicit,
      'zh-CN must explicitly declare every English key (no implicit `...en` spread fallback). ' +
        'Add the missing translations to `apps/web/src/i18n/locales/zh-CN.ts` rather than re-introducing the spread.',
    ).toEqual(englishKeys);
  });

  it('keeps the zh-CN locale source free of the `...en` spread fallback', () => {
    const source = readFileSync(
      new URL('../../src/i18n/locales/zh-CN.ts', import.meta.url),
      'utf8',
    );

    expect(
      source,
      'zh-CN.ts must not use `...en` spread — every key must be explicitly translated. ' +
        'If you need to add new keys, declare them with their Chinese values directly.',
    ).not.toMatch(/\.\.\.en\b/);
  });

  // Tier-1 locale parity lock for Japanese (matches the zh-CN guarantee above):
  // `ja` is now fully localized — every English key has an explicit Japanese
  // value with no `...en` spread fallback. These two cases keep that property
  // from regressing: a new English key without a matching `ja` entry, or a
  // reintroduced spread, fails CI loudly instead of silently rendering English
  // to Japanese users.
  it('keeps ja explicitly translated for every English key (tier-1 parity lock)', () => {
    const englishKeys = Object.keys(en).sort();
    const explicit = explicitLocaleKeys('ja').sort();

    expect(
      explicit,
      'ja must explicitly declare every English key (no implicit `...en` spread fallback). ' +
        'Add the missing translations to `apps/web/src/i18n/locales/ja.ts` rather than re-introducing the spread.',
    ).toEqual(englishKeys);
  });

  it('keeps the ja locale source free of the `...en` spread fallback', () => {
    const source = readFileSync(
      new URL('../../src/i18n/locales/ja.ts', import.meta.url),
      'utf8',
    );

    expect(
      source,
      'ja.ts must not use `...en` spread — every key must be explicitly translated. ' +
        'If you need to add new keys, declare them with their Japanese values directly.',
    ).not.toMatch(/\.\.\.en\b/);
  });

  // Brand / proper-noun lock: these labels are product or technical proper
  // nouns and must stay verbatim English in EVERY locale, never translated.
  // (e.g. the plugin-details "Integrity" field was wrongly localized to
  // 完整性 / Integrität / etc.; lock it so a future translation pass can't
  // re-localize it.)
  it('keeps brand/proper-noun labels verbatim English across every locale', async () => {
    const verbatim: Array<{ key: keyof Dict; value: string }> = [
      { key: 'plugins.availableDetails.integrity', value: 'Integrity' },
    ];
    for (const locale of LOCALES) {
      const dict = await loadDict(locale);
      for (const { key, value } of verbatim) {
        expect(dict[key], `${locale}.${String(key)}`).toBe(value);
      }
    }
  });
});
