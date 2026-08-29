// The density control has to change something.
//
// Before this, `data-density` swapped five custom properties of which one
// had a single reader and four had none, so all three levels rendered an
// identical interface. These specs pin the two halves of the repair: the
// token sheet declares a complete scale at every level, and the shared
// primitives read it instead of hard-coding the numbers.
//
// Every expectation quotes the literal text in the source, not a computed
// equivalent — a spec that asserts "40px" where the file says
// `var(--control-h, 40px)` passes for the wrong reason and then fails the
// moment someone changes the fallback.

import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const tokens = readFileSync(new URL('../../src/styles/md3-tokens.css', import.meta.url), 'utf8');
const primitives = readFileSync(
  new URL('../../src/styles/primitives.css', import.meta.url),
  'utf8',
);

function block(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g');
  return Array.from(source.matchAll(pattern)).at(0)?.[1] ?? '';
}

/**
 * The declaration inventory is intentionally hand-written. It is the 212-path
 * snapshot from MODIFICATIONS.md before the current source-only wave added
 * newer provenance entries. Six AMR paths are retained in the notice but are
 * not present in the imported source tree, so they are recorded separately
 * rather than silently disappearing from the audit.
 */
export const MODIFICATIONS_WEB_SOURCE_INVENTORY = [
  'App.tsx',
  'campaigns/go-plan-content.ts',
  'campaigns/go-plan.ts',
  'capture/fetch-wrapper-stack.ts',
  'capture/studio-fixture.ts',
  'components/AmrArtifactUpgradeDialog.module.css',
  'components/AmrArtifactUpgradeDialog.tsx',
  'components/AmrArtifactUpgradeGate.tsx',
  'components/AmrArtifactUpgradeHomeCard.module.css',
  'components/AmrArtifactUpgradeHomeCard.tsx',
  'components/AmrLowBalanceDialog.module.css',
  'components/appearance/AppearanceControls.module.css',
  'components/appearance/AppearanceControls.tsx',
  'components/appearance/AppearanceRuntime.tsx',
  'components/appearance/color.ts',
  'components/appearance/colorNames.ts',
  'components/appearance/contrast.ts',
  'components/appearance/InfiniteColorPicker.module.css',
  'components/appearance/InfiniteColorPicker.tsx',
  'components/appearance/labels.ts',
  'components/appearance/presets.ts',
  'components/appearance/RovingRadioGroup.tsx',
  'components/appearance/store.ts',
  'components/appearance/translate.ts',
  'components/appearance/typography.ts',
  'components/appearance/useAutoFit.ts',
  'components/AppStatusBar.module.css',
  'components/AppStatusBar.tsx',
  'components/bulk/BulkActionBar.module.css',
  'components/bulk/BulkActionBar.tsx',
  'components/bulk/BulkPreviewDialog.module.css',
  'components/bulk/BulkPreviewDialog.tsx',
  'components/bulk/messages.ts',
  'components/bulk/plan.ts',
  'components/bulk/run.ts',
  'components/bulk/selection.ts',
  'components/changelog/ChangelogDateRange.module.css',
  'components/changelog/ChangelogDateRange.tsx',
  'components/changelog/ChangelogDialog.module.css',
  'components/changelog/ChangelogDialog.tsx',
  'components/changelog/open-changelog.ts',
  'components/command-palette/CommandPalette.module.css',
  'components/command-palette/CommandPalette.tsx',
  'components/command-palette/commands.ts',
  'components/command-palette/open.ts',
  'components/command-palette/quickSwitcherScope.ts',
  'components/command-palette/reveal.ts',
  'components/command-palette/settingsIndex.ts',
  'components/ContextMenu.module.css',
  'components/ContextMenu.tsx',
  'components/destructive/DestructiveGate.module.css',
  'components/destructive/DestructiveGate.tsx',
  'components/destructive/gateMachine.ts',
  'components/DimSumSurprise.module.css',
  'components/DimSumSurprise.tsx',
  'components/EntryTopbarSearch.module.css',
  'components/EntryTopbarSearch.tsx',
  'components/FigmaImportModal.module.css',
  'components/FileViewerMenuSearch.tsx',
  'components/FileWorkspace.tsx',
  'components/handoff/export.ts',
  'components/handoff/HandoffView.module.css',
  'components/handoff/HandoffView.tsx',
  'components/handoff/registry.ts',
  'components/handoff/selection.ts',
  'components/HandoffButton.tsx',
  'components/history/open-history.ts',
  'components/history/VersionHistoryDialog.module.css',
  'components/history/VersionHistoryDialog.tsx',
  'components/HomeHero.tsx',
  'components/LibraryPicker.module.css',
  'components/LibraryPreviewModal.module.css',
  'components/LibrarySection.module.css',
  'components/LibraryUploadModal.module.css',
  'components/ManualEditTextToolbar.module.css',
  'components/MaterialSymbol.module.css',
  'components/MaterialSymbol.tsx',
  'components/MessageCenter.module.css',
  'components/narrator/lines.ts',
  'components/narrator/narrator.ts',
  'components/narrator/NarratorSettingsPanel.module.css',
  'components/narrator/NarratorSettingsPanel.tsx',
  'components/narrator/queue.ts',
  'components/narrator/settings.ts',
  'components/narrator/speech.ts',
  'components/notifications/NotificationCenter.module.css',
  'components/notifications/NotificationCenter.tsx',
  'components/notifications/NotificationHost.module.css',
  'components/notifications/NotificationHost.tsx',
  'components/notifications/notificationStore.ts',
  'components/ProjectArchiveAction.tsx',
  'components/ProjectView.tsx',
  'components/regex/evaluate.ts',
  'components/regex/index.ts',
  'components/regex/parse.ts',
  'components/regex/parts-ops.ts',
  'components/regex/pattern.ts',
  'components/regex/RegexBuilder.module.css',
  'components/regex/RegexBuilder.tsx',
  'components/regex/RegexPartRow.tsx',
  'components/regex/RegexSamplePanel.tsx',
  'components/regex/RegexSearchField.module.css',
  'components/regex/RegexSearchField.tsx',
  'components/regex/useRegexSearch.ts',
  'components/RoutinesSection.tsx',
  'components/settings/SettingsPage.module.css',
  'components/settings/settingsSearchMatch.ts',
  'components/settings/SettingsSearchResults.tsx',
  'components/settings/SettingsTabs.module.css',
  'components/settings/settingsTabs.ts',
  'components/settings/SettingsTabStrip.tsx',
  'components/SettingsDialog.tsx',
  'components/shortcuts/registry.ts',
  'components/shortcuts/useShortcuts.ts',
  'components/SketchEditor.tsx',
  'components/Switch.module.css',
  'components/Switch.tsx',
  'components/Toast.tsx',
  'components/ToyLockAuthenticationPopover.module.css',
  'components/ToyLockAuthenticationPopover.tsx',
  'components/UpdateDialog.module.css',
  'components/UpdateDialog.tsx',
  'components/UpdaterPopup.module.css',
  'components/WindowTitleBar.module.css',
  'components/WindowTitleBar.tsx',
  'components/workspace-tabs/bulkClose.ts',
  'components/workspace-tabs/groupAppearance.ts',
  'components/workspace-tabs/TabGroupAppearanceEditor.module.css',
  'components/workspace-tabs/TabGroupAppearanceEditor.tsx',
  'components/workspace-tabs/tabGroups.ts',
  'components/workspace-tabs/tabPinning.ts',
  'components/workspace-tabs/windowRegistry.ts',
  'components/workspace-tabs/WorkspaceTabDiscovery.module.css',
  'components/workspace-tabs/WorkspaceTabDiscovery.tsx',
  'components/WorkspaceTabsBar.module.css',
  'components/WorkspaceTabsBar.tsx',
  'design-system-auto-prompt.ts',
  'features/libraryUi.ts',
  'i18n/funny/en.ts',
  'i18n/funny/zh-HK.ts',
  'i18n/index.tsx',
  'i18n/interpolate.ts',
  'i18n/locales/ar.ts',
  'i18n/locales/de.ts',
  'i18n/locales/en.ts',
  'i18n/locales/es-ES.ts',
  'i18n/locales/fa.ts',
  'i18n/locales/fr.ts',
  'i18n/locales/hu.ts',
  'i18n/locales/id.ts',
  'i18n/locales/it.ts',
  'i18n/locales/ja.ts',
  'i18n/locales/ko.ts',
  'i18n/locales/pl.ts',
  'i18n/locales/pt-BR.ts',
  'i18n/locales/ru.ts',
  'i18n/locales/th.ts',
  'i18n/locales/tr.ts',
  'i18n/locales/uk.ts',
  'i18n/locales/zh-CN.ts',
  'i18n/locales/zh-HK.ts',
  'i18n/locales/zh-TW.ts',
  'i18n/runErrors.ts',
  'i18n/types.ts',
  'index.css',
  'lib/changelog/dates.ts',
  'lib/changelog/filter.ts',
  'lib/changelog/generated.ts',
  'lib/changelog/index.ts',
  'lib/changelog/parse.ts',
  'lib/confirm-delete.ts',
  'lib/dim-sum/catalog.ts',
  'lib/dim-sum/surprise.ts',
  'lib/history/actions.ts',
  'lib/history/client.ts',
  'lib/history/export.ts',
  'providers/registry.ts',
  'router.ts',
  'runtime/amr-artifact-upgrade.ts',
  'runtime/exports.ts',
  'security/toy-lock-core.ts',
  'state/appearance.ts',
  'styles/base.css',
  'styles/cairo.css',
  'styles/chat.css',
  'styles/design-system-flow.css',
  'styles/home/entry-layout.css',
  'styles/home/home-hero.css',
  'styles/home/integrations.css',
  'styles/home/marketplace.css',
  'styles/home/new-project-modal.css',
  'styles/home/plugins-home.css',
  'styles/home/plus-menu.css',
  'styles/home/recent-projects.css',
  'styles/home/tasks.css',
  'styles/home/use-everywhere.css',
  'styles/material-symbols.css',
  'styles/md3-tokens.css',
  'styles/roboto-flex.css',
  'styles/roboto-mono.css',
  'styles/shell.css',
  'styles/tokens.css',
  'styles/viewer/composio.css',
  'styles/viewer/core.css',
  'styles/viewer/library.css',
  'styles/viewer/routines.css',
  'styles/viewer/templates-plugins.css',
  'styles/viewer/theater.css',
  'styles/viewer/tools.css',
  'styles/workspace/connectors.css',
  'styles/workspace/drawer.css',
  'styles/workspace/mention-home.css',
] as const;

export const INTENTIONAL_ABSENT_WEB_SOURCE_PATHS = [
  'components/AmrArtifactUpgradeDialog.module.css',
  'components/AmrArtifactUpgradeDialog.tsx',
  'components/AmrArtifactUpgradeGate.tsx',
  'components/AmrArtifactUpgradeHomeCard.module.css',
  'components/AmrArtifactUpgradeHomeCard.tsx',
  'runtime/amr-artifact-upgrade.ts',
] as const;

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const REPO_ROOT = execFileSync('git', ['-C', WEB_ROOT, 'rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();

function trackedSourcePath(path: string): boolean {
  try {
    execFileSync('git', ['-C', REPO_ROOT, 'cat-file', '-e', `HEAD:design/apps/web/src/${path}`], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function assertSourceInventory(inventory: readonly string[]): void {
  expect(new Set(inventory).size).toBe(212);
  expect(inventory).toHaveLength(212);
  expect(INTENTIONAL_ABSENT_WEB_SOURCE_PATHS).toHaveLength(6);
  expect(INTENTIONAL_ABSENT_WEB_SOURCE_PATHS.every((path) => inventory.includes(path))).toBe(true);
  const existing = inventory.filter(trackedSourcePath);
  expect(existing).toHaveLength(206);
  expect(inventory.filter((path) => !trackedSourcePath(path))).toEqual(
    INTENTIONAL_ABSENT_WEB_SOURCE_PATHS,
  );
}

export type CssLiteralKind = 'radius' | 'duration' | 'curve';

export interface CssLiteralFinding {
  path: string;
  selector: string;
  kind: CssLiteralKind;
  literal: string;
}

/**
 * These hashes are the generated, reviewed baseline for the CSS literal
 * audit. A hash is deliberately used instead of a line number: unrelated
 * formatting or a later source edit must not make the ledger silently accept
 * a new literal. Any changed or new file is unledgered until its reviewed
 * exception is added here.
 */
export const REVIEWED_CSS_BASELINE_LEDGER: Readonly<Record<string, string>> = {
  'styles/app-wash.css': 'b1477941905f82a42eaba5f3102cd4f6258fb4a9f8d837fc34c34965ff8b65fe',
  'styles/base.css': '08e6f35abd51876936a2b607b873eec217afc1c9cd037c257e640bd402fbea02',
  'styles/cairo.css': '5a1e71abfd7f736b0cf33947450fd81738db292d209bd53d6987714db694542d',
  'styles/chat.css': 'be1e2a41b01a51b25bacda2cd680ea7f4d0519cbffbc6e932c00c313ae46e83b',
  'styles/design-system-flow.css': '215a5a9d8c123faf55722240db0f365956c58ca020f94a1540b877bdc560b06a',
  'styles/entrance.css': '876762c13d15ebbda219cdf6ff0b5aba7265b893a0d835504a6b02964eb9a000',
  'styles/home/entry-layout.css': '535b338a8be4eeb5eb18cb18c98d9e71887db5102e826d9212c834ef5945bad3',
  'styles/home/home-hero.css': '4e699348fdf060976daeb45ca5da18cb6c3563969dea8e8a09d8ec15c0e986ae',
  'styles/home/index.css': 'b90eacf2e978425474d48e524760ee8f36b7448aeb2bd98c4c80899dcab8d734',
  'styles/home/integrations.css': '4e253cdcd71a973b887c883655f0715a1fd0649da3ea26683468a3867bf65c7c',
  'styles/home/marketplace.css': 'a06dd64698022ce554679e3813f737bdb1aca2432ba0b019bbecab1dca33ec4b',
  'styles/home/new-project-modal.css': 'a1888b7eac09890c8b2bdc51d51d5cee96c4789bc4a714cd8e862d14dc284ea6',
  'styles/home/plugin-marketplace-demo.css': '93781b94f859995b746df471a6f73728fb4895ad6f11440c72cd134ba821cc01',
  'styles/home/plugins-home.css': '93ee53c82eaafb6055f8e5115005391508c5e7a478b4afd801c099a8717c9c4f',
  'styles/home/plugins-view.css': '19e9d1d44ba4ebdb3887d380b3e57aa0db99fad90a84f3b8c4a33b164e2a7d6f',
  'styles/home/plus-menu.css': '90d324b9053ce723754ce62582cd904626f45d0c935c8de15ccd2786bfd33b50',
  'styles/home/recent-projects.css': 'd587b4bdf6e32a08058059ff9558bd9c0f1f7617b4d4de244009e83e1df03213',
  'styles/home/tasks.css': 'd25f86ca0493edaef6f27139de42d96e1aa8bf7a7aca704611280ab26ff454b2',
  'styles/home/use-everywhere.css': '5f1e7be35132ebde9fef5f0a601ad66c9286181c1b792948df667e549de984a3',
  'styles/material-symbols.css': '895e875be424f4f3cdba5d14fd0f26a2bcdf4317ba9792de0cd090de5659e65a',
  'styles/material.css': '2aa73916a4b6e142fa553705a5c6d6cf1033a42603ee484cbd33831ad9c5d755',
  'styles/md3-tokens.css': 'abc051642a170b8e6d2e693bb467ca0f79d70dad19a43b57fe3e1b5b5178be2f',
  'styles/modal-window-drag.css': '3cc933cc5b03454d5aa21e023533c4cd3ee5edefbbaf4132a5a5e340365b71e6',
  'styles/plan-badge.css': 'fbd2f22ef7aaf97f0329cc4049af6538ad37a57066f0809199cd1fd556db6243',
  'styles/primitives.css': 'db54625c01ade461ac866b9f4743972c460e5bb172f85bf09465e4992d8cca7a',
  'styles/remixicon/remixicon.css': 'ed259c4dc880a5a79d4597d1953d69df2a00dff815db2883b96ef62cfef88375',
  'styles/roboto-flex.css': '31902937019c7c8836683c627c78d65796ec6a6d775c04560950f4d77e9664f8',
  'styles/roboto-mono.css': '0c6982c389a3e7179f0b8b2c6ac28329735108ad8a4fcf10195f0d77486917b9',
  'styles/shell.css': '967134182e6ffa0d8b703c3371ae27942a6380e7370fc5df15ef014ff34a4188',
  'styles/social-share.css': 'b0f5dec5a505f4ec1a84e243d5cd6406ffbd43f33d8825836ef39cee7284efe0',
  'styles/tokens.css': 'b0f9b09438ebba59486d93ab53e01066ec779a5373cdd0e303632cbdfe538d7a',
  'styles/viewer/code.css': '92b8f8f47f8ea26bfcd268031981c343009b024163a18ce6574bbef9804c8fd2',
  'styles/viewer/composio.css': 'fa6314798fda89c314a67507348f6317dd821536a2a376062ebf883b82a93e8a',
  'styles/viewer/core.css': '8e96414d391b74503f3eaa056fb6af229815a91fabcb5ade3f581938ec911a9b',
  'styles/viewer/library.css': '29c87555aa68b295142d509cd36208b04f98a236a0d136deb98b0838ff1c3624',
  'styles/viewer/memory.css': '16047e39ac0b0605fe388c8329e7df60205e7b96a7a9dbd04eede6ba3b95d583',
  'styles/viewer/pets.css': '016505b9f149d650ac2c31bc94a737d02e9b1e0c71ea0596a891f6521c537272',
  'styles/viewer/plugin-inputs.css': '0be51fdc74505c47d51b1e69be9aa5353a596e526c073142f8584f2d72d2e3f7',
  'styles/viewer/plugin-rail.css': '962f80c4a27eaf06bdebb442feac7ba45d5f515453b09057c2f98f8c842a1407',
  'styles/viewer/routines.css': '684672a853b79e8c4cafb26134fc67d0eb0a1c8116accfdc6d1044c395452179',
  'styles/viewer/templates-plugins.css': '9034bd30f2ee2ddefd43051d69446544c4d8b4384ce4d9b526fed7fd594fa077',
  'styles/viewer/theater.css': '4343898a6b48e83401685c791fc62d5a7153144790120176aac38eb22acc98e0',
  'styles/viewer/tools.css': 'b9982f9d3708d5b6022ef943e4fc5ad5a32dc883c8015932a46597562870c1e7',
  'styles/workspace/artifacts.css': '58cf5a829f82199ebcb983d15ce20b45f68d6b4ea09906fe2ef5acc388b29326',
  'styles/workspace/connectors.css': '5fdf62e32abb56dd0c8a6c8779b5cf8b6fb44a86d6142c84b9e186f57219ae9b',
  'styles/workspace/design-browser.css': '36a68ad13322b3a9fe1cf2dcb8a4a5472d42fdd591444f1c0bcb56201e5c5c3e',
  'styles/workspace/design-files.css': 'c9dcf906703482b93553b438be08e0aefddaaa35c718fa8e8af19d5732df65cf',
  'styles/workspace/drawer.css': 'ca951d503eeddaf0096279af9cd7b53476e23adceaa80d618254242920999a39',
  'styles/workspace/mention-home.css': '343fa343683188e251513ed80cddf7fc00dbd3d461edf4df4c7dbc91d67f683d',
  'styles/workspace/terminal.css': '9e49f1894624151587dee21e63bcaf3e5d84d3800c4e001c434cc10b066cb274',
};

/** These are reviewed ownership exceptions, not a wildcard for new literals. */
export const SELECTOR_EXCEPTION_LEDGER = [
  { selector: ':root', reason: 'canonical system and compatibility token declarations' },
  { selector: '[data-theme="dark"]', reason: 'theme-specific functional data and elevation declarations' },
  { selector: 'html:not([data-theme])', reason: 'system-theme functional data and elevation declarations' },
] as const;

export const KEYFRAME_EXCEPTION_LEDGER = [
  { selectorPattern: /^@(?:-\w+-)?keyframes\s+/, reason: 'animation timeline blocks are scanned separately from declarations' },
] as const;

function sourceHash(source: string): string {
  return createHash('sha256').update(Buffer.from(source, 'utf8')).digest('hex');
}

function collectCssBlocks(source: string): Array<{ selector: string; body: string }> {
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
  const stack: Array<{ selector: string; bodyStart: number }> = [];
  const blocks: Array<{ selector: string; body: string }> = [];
  let cursor = 0;
  for (let index = 0; index < clean.length; index += 1) {
    if (clean[index] === '{') {
      const prelude = clean.slice(cursor, index);
      const boundary = Math.max(prelude.lastIndexOf(';'), prelude.lastIndexOf('}'), prelude.lastIndexOf('{'));
      const selector = prelude.slice(boundary + 1).trim().replace(/\s+/g, ' ');
      stack.push({ selector, bodyStart: index + 1 });
      cursor = index + 1;
    } else if (clean[index] === '}') {
      const block = stack.pop();
      if (block) blocks.push({ selector: block.selector, body: clean.slice(block.bodyStart, index) });
      cursor = index + 1;
    }
  }
  return blocks;
}

function scanDirectDeclarations(body: string): Array<{ property: string; value: string }> {
  const declarations: Array<{ property: string; value: string }> = [];
  let segment = '';
  let nestedDepth = 0;
  const emit = (candidate: string) => {
    const match = candidate.match(/^\s*([-a-zA-Z0-9]+)\s*:\s*([\s\S]*?)\s*$/);
    if (match && nestedDepth === 0) declarations.push({ property: match[1], value: match[2] });
  };
  for (const character of body) {
    if (character === '{') {
      nestedDepth += 1;
    } else if (character === '}') {
      nestedDepth -= 1;
    } else if (character === ';' && nestedDepth === 0) {
      emit(segment);
      segment = '';
      continue;
    }
    if (nestedDepth === 0) segment += character;
  }
  emit(segment);
  return declarations;
}

export function scanCssLiterals(source: string, path: string): CssLiteralFinding[] {
  const findings: CssLiteralFinding[] = [];
  for (const block of collectCssBlocks(source)) {
    for (const declaration of scanDirectDeclarations(block.body)) {
      if (/radius$/i.test(declaration.property)) {
        for (const match of declaration.value.matchAll(/(?:\d+(?:\.\d+)?(?:px|rem|em|%))|\b0\b/g)) {
          findings.push({ path, selector: block.selector, kind: 'radius', literal: match[0] });
        }
      }
      if (/^(?:transition|animation)(?:-duration)?$/i.test(declaration.property)) {
        for (const match of declaration.value.matchAll(/\b\d+(?:\.\d+)?(?:ms|s)\b/g)) {
          findings.push({ path, selector: block.selector, kind: 'duration', literal: match[0] });
        }
      }
      if (/(?:transition|animation|timing-function)/i.test(declaration.property)) {
        for (const match of declaration.value.matchAll(/cubic-bezier\([^)]*\)/g)) {
          findings.push({ path, selector: block.selector, kind: 'curve', literal: match[0] });
        }
      }
    }
  }
  return findings;
}

export function findUnledgeredCssLiterals(path: string, source: string): CssLiteralFinding[] {
  if (REVIEWED_CSS_BASELINE_LEDGER[path] === sourceHash(source)) return [];
  return scanCssLiterals(source, path);
}

/** Every variable a density level is expected to move. */
const DENSITY_VARS = [
  '--sp',
  '--gap',
  '--pad',
  '--row',
  '--card',
  '--control-h',
  '--control-h-sm',
  '--control-pad-x',
] as const;

describe('the density scale', () => {
  it('declares every variable at the baseline, "default" level', () => {
    const root = block(tokens, ':root');
    for (const name of DENSITY_VARS) {
      expect(root).toContain(`${name}:`);
    }
  });

  it('redefines every one of them at compact and comfortable', () => {
    const compact = block(tokens, '[data-density="compact"]');
    const comfortable = block(tokens, '[data-density="comfortable"]');
    expect(compact).not.toBe('');
    expect(comfortable).not.toBe('');
    for (const name of DENSITY_VARS) {
      expect(compact, `compact is missing ${name}`).toContain(`${name}:`);
      expect(comfortable, `comfortable is missing ${name}`).toContain(`${name}:`);
    }
  });

  it('has no [data-density="default"] rule, because default is :root', () => {
    // Applying "default" means REMOVING the attribute, which only works
    // while there is nothing for it to select. Matched as a rule at the
    // start of a line rather than as a substring — the sheet's own comment
    // names the selector in prose to explain why it is absent.
    expect(tokens).not.toMatch(/^\[data-density="default"\]/m);
  });

  it('moves the base spacing unit with the rest of the scale', () => {
    // `--sp` used to sit at 8px through all three levels while `--gap`,
    // built on the same unit, halved — a scale that disagreed with itself.
    expect(block(tokens, ':root')).toContain('--sp: 8px;');
    expect(block(tokens, '[data-density="compact"]')).toContain('--sp: 6px;');
    expect(block(tokens, '[data-density="comfortable"]')).toContain('--sp: 10px;');
  });

  it('keeps every control above the minimum touch target at compact', () => {
    const compact = block(tokens, '[data-density="compact"]');
    expect(compact).toContain('--control-h: 34px;');
    expect(compact).toContain('--control-h-sm: 32px;');
  });

  it('sets the default control heights to the numbers primitives.css used to hard-code', () => {
    // This is what makes the change invisible at default density: an
    // install that never touches the control measures exactly as before.
    const root = block(tokens, ':root');
    expect(root).toContain('--control-h: 40px;');
    expect(root).toContain('--control-h-sm: 36px;');
    expect(root).toContain('--control-pad-x: 16px;');
  });
});

describe('the canonical Material Design 3 motion scale', () => {
  const root = block(tokens, ':root');
  const durationValues: Record<string, string> = {
    short1: '50ms',
    short2: '100ms',
    short3: '150ms',
    short4: '200ms',
    medium1: '250ms',
    medium2: '300ms',
    medium3: '350ms',
    medium4: '400ms',
    long1: '450ms',
    long2: '500ms',
    long3: '550ms',
    long4: '600ms',
    'extra-long1': '700ms',
    'extra-long2': '800ms',
    'extra-long3': '900ms',
    'extra-long4': '1000ms',
  };

  it('declares every named duration ladder step once in the system root', () => {
    for (const [name, value] of Object.entries(durationValues)) {
      expect(root).toContain(`--md-sys-motion-duration-${name}: ${value};`);
    }
  });

  it('declares standard, emphasized, and linear curve names', () => {
    expect(root).toContain('--md-sys-motion-linear: cubic-bezier(0, 0, 1, 1);');
    expect(root).toContain('--md-sys-motion-standard: cubic-bezier(.2, 0, 0, 1);');
    expect(root).toContain('--md-sys-motion-standard-accelerate: cubic-bezier(.3, 0, 1, 1);');
    expect(root).toContain('--md-sys-motion-standard-decelerate: cubic-bezier(0, 0, .2, 1);');
    expect(root).toContain('--md-sys-motion-emphasized-accelerate: cubic-bezier(.3, 0, .8, .15);');
    expect(root).toContain('--md-sys-motion-emphasized-decelerate: cubic-bezier(.05, .7, .1, 1);');
  });

  it('makes the later winning compatibility block canonical', () => {
    const roots = Array.from(tokens.matchAll(/:root\s*\{([\s\S]*?)\}/g), (match) => match[1]);
    const winning = roots.at(-1) ?? '';
    expect(roots.length).toBeGreaterThanOrEqual(2);
    expect(winning).toContain('--radius-none: var(--md-sys-shape-corner-none);');
    expect(winning).toContain('--radius-small: var(--md-sys-shape-corner-s);');
    expect(winning).toContain('--radius-medium: var(--md-sys-shape-corner-m);');
    expect(winning).toContain('--radius-large: var(--md-sys-shape-corner-l);');
    expect(winning).toContain('--radius-pill: var(--md-sys-shape-corner-full);');
    expect(winning).toContain('--duration-ultra-fast: var(--md-sys-motion-duration-short1);');
    expect(winning).toContain('--duration-ultra-slow: var(--md-sys-motion-duration-long2);');
    expect(winning).toContain('--curve-linear: var(--md-sys-motion-linear);');
    expect(winning).toContain('--curve-easy-ease: var(--md-sys-motion-standard);');
    expect(winning).toContain('--ease-out: var(--md-sys-motion-emphasized-decelerate);');
  });
});

describe('the shared primitives read the density scale', () => {
  it('sizes every button from it', () => {
    const button = block(primitives, 'button');
    expect(button).toContain('gap: var(--sp, 8px);');
    expect(button).toContain('min-height: var(--control-h, 40px);');
    expect(button).toContain('padding: 0 var(--control-pad-x, 16px);');
  });

  it('sizes text fields from the same variable as the buttons beside them', () => {
    const fields = block(primitives, 'input, textarea, select');
    expect(fields).toContain('min-height: var(--control-h, 40px);');
  });

  it('keeps the select trigger on the deliberately shorter scale', () => {
    const trigger = block(primitives, '.od-select-trigger');
    expect(trigger).toContain('min-height: var(--control-h-sm, 36px);');
  });
});

describe('the appearance controls demonstrate the setting they carry', () => {
  const controls = readFileSync(
    new URL('../../src/components/appearance/AppearanceControls.module.css', import.meta.url),
    'utf8',
  );

  it('spaces its own cards with the density tokens', () => {
    expect(block(controls, '.cards')).toContain('gap: var(--gap, 16px);');
    expect(block(controls, '.card')).toContain('padding: var(--pad, 24px);');
    expect(block(controls, '.card')).toContain('border-radius: calc(var(--card, 14px) + 10px);');
  });
});

describe('the declared web-source inventory', () => {
  it('contains exactly 212 unique declarations with six intentional absences', () => {
    assertSourceInventory(MODIFICATIONS_WEB_SOURCE_INVENTORY);
  });

  it('turns red when an inventory member is removed', () => {
    expect(() => assertSourceInventory(MODIFICATIONS_WEB_SOURCE_INVENTORY.slice(0, -1))).toThrow();
  });
});

describe('the brace-aware CSS literal audit', () => {
  const cssPaths = Object.keys(REVIEWED_CSS_BASELINE_LEDGER).sort();

  it('has one generated and reviewed baseline entry for every tracked style sheet', () => {
    expect(cssPaths).toHaveLength(50);
    for (const path of cssPaths) {
      const file = fileURLToPath(new URL(`../../src/${path.slice('styles/'.length)}`, import.meta.url));
      expect(existsSync(file), `${path} is missing from the sparse checkout`).toBe(true);
      const source = readFileSync(file, 'utf8');
      expect(sourceHash(source), `${path} changed without a reviewed ledger update`).toBe(
        REVIEWED_CSS_BASELINE_LEDGER[path],
      );
    }
  });

  it('scans nested at-rules and accepts only the reviewed baseline', () => {
    const nested = `@media (min-width: 1px) {\n  .nested-surface {\n    border-radius: 8px;\n    transition: opacity 120ms cubic-bezier(.2, 0, 0, 1);\n  }\n}`;
    const findings = scanCssLiterals(nested, 'test/nested.css');
    expect(findings).toEqual([
      { path: 'test/nested.css', selector: '.nested-surface', kind: 'radius', literal: '8px' },
      { path: 'test/nested.css', selector: '.nested-surface', kind: 'duration', literal: '120ms' },
      {
        path: 'test/nested.css',
        selector: '.nested-surface',
        kind: 'curve',
        literal: 'cubic-bezier(.2, 0, 0, 1)',
      },
    ]);
    expect(findUnledgeredCssLiterals('test/nested.css', nested)).toHaveLength(3);
  });

  it('keeps the selector and keyframe exception ledgers explicit', () => {
    expect(SELECTOR_EXCEPTION_LEDGER.length).toBeGreaterThan(0);
    expect(KEYFRAME_EXCEPTION_LEDGER.length).toBeGreaterThan(0);
    expect(KEYFRAME_EXCEPTION_LEDGER[0].selectorPattern.test('@keyframes pulse')).toBe(true);
  });

  it('turns red for an unledgered 8px product radius', () => {
    const source = '.unledgered-radius { border-radius: 8px; }';
    expect(() => {
      expect(findUnledgeredCssLiterals('test/unledgered-radius.css', source)).toEqual([]);
    }).toThrow();
  });

  it('turns red for an unledgered 120ms product duration', () => {
    const source = '.unledgered-duration { transition: opacity 120ms; }';
    expect(() => {
      expect(findUnledgeredCssLiterals('test/unledgered-duration.css', source)).toEqual([]);
    }).toThrow();
  });

  it('turns red for an unledgered cubic curve', () => {
    const source = '.unledgered-curve { transition-timing-function: cubic-bezier(.2, 0, 0, 1); }';
    expect(() => {
      expect(findUnledgeredCssLiterals('test/unledgered-curve.css', source)).toEqual([]);
    }).toThrow();
  });
});
