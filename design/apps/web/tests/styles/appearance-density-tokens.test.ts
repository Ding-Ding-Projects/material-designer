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
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const tokens = readFileSync(new URL('../../src/styles/md3-tokens.css', import.meta.url), 'utf8');
const compatibilityTokens = readFileSync(
  new URL('../../src/styles/tokens.css', import.meta.url),
  'utf8',
);
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
 * The declaration inventory is intentionally hand-written. It matches the
 * current 215 unique apps/web/src paths in MODIFICATIONS.md exactly. Six AMR
 * paths are retained in the notice but are not present in the imported source
 * tree, so they are recorded separately rather than silently disappearing.
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
  'components/EntryShell.tsx',
  'components/EntryTopbarSearch.module.css',
  'components/EntryTopbarSearch.tsx',
  'components/FigmaImportModal.module.css',
  'components/FileViewerMenuSearch.tsx',
  'components/FileWorkspace.tsx',
  'components/FrontScreenProvenance.module.css',
  'components/FrontScreenProvenance.tsx',
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
  'lib/front-screen-provenance.ts',
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
const REPO_ROOT = resolve(WEB_ROOT, '../../..');

function parseModificationsWebSourcePaths(source: string): string[] {
  return Array.from(
    source.matchAll(/^[-*] `apps\/web\/src\/([^`]+)`(?:\s+\([^\r\n]*\))?\s*$/gm),
    (match) => match[1],
  );
}

const MODIFICATIONS_PATH = resolve(REPO_ROOT, 'MODIFICATIONS.md');

function relevantModificationsInventory(): string[] {
  const declared = parseModificationsWebSourcePaths(readFileSync(MODIFICATIONS_PATH, 'utf8'));
  return Array.from(new Set(declared)).sort();
}

function assertSourceInventory(
  inventory: readonly string[],
  exists: (path: string) => boolean = (path) => existsSync(resolve(WEB_ROOT, 'src', path)),
): void {
  expect(new Set(inventory).size).toBe(215);
  expect(inventory).toHaveLength(215);
  expect(Array.from(inventory).sort()).toEqual(relevantModificationsInventory());
  expect(INTENTIONAL_ABSENT_WEB_SOURCE_PATHS).toHaveLength(6);
  expect(INTENTIONAL_ABSENT_WEB_SOURCE_PATHS.every((path) => inventory.includes(path))).toBe(true);
  const existing = inventory.filter(exists);
  expect(existing).toHaveLength(209);
  expect(inventory.filter((path) => !exists(path))).toEqual(
    INTENTIONAL_ABSENT_WEB_SOURCE_PATHS,
  );
}

export type CssLiteralKind = 'radius' | 'duration' | 'curve';

export interface CssLiteralFinding {
  path: string;
  selector: string;
  property: string;
  kind: CssLiteralKind;
  literal: string;
}


/** Every reviewed literal is keyed to one exact declaration and occurrence count. */
export interface CssLiteralException extends CssLiteralFinding {
  count: number;
  reason: string;
}

export const CSS_LITERAL_EXCEPTION_LEDGER: readonly CssLiteralException[] = [
  { path: "components/appearance/AppearanceControls.module.css", selector: ".card", property: "border-radius", kind: "radius", literal: "10px", count: 1, reason: ".card retains its intentional component geometry at 10px" },
  { path: "components/appearance/AppearanceControls.module.css", selector: ".card", property: "border-radius", kind: "radius", literal: "14px", count: 1, reason: ".card retains its intentional component geometry at 14px" },
  { path: "components/AppStatusBar.module.css", selector: ".dotLive", property: "animation", kind: "duration", literal: "2.4s", count: 1, reason: ".dotLive drives a functional progress or feedback animation at 2.4s" },
  { path: "components/command-palette/CommandPalette.module.css", selector: ".full", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".full preserves a square join at the adjoining edge" },
  { path: "components/destructive/DestructiveGate.module.css", selector: ".sliderWrap[data-unlocked='true'] .charge", property: "animation", kind: "duration", literal: "900ms", count: 1, reason: ".sliderWrap[data-unlocked='true'] .charge drives a functional progress or feedback animation at 900ms" },
  { path: "components/EntryTopbarSearch.module.css", selector: ".field, .shortcut", property: "transition-duration", kind: "duration", literal: "0.01ms", count: 1, reason: ".field, .shortcut disables motion for reduced-motion users with 0.01ms" },
  { path: "components/FigmaImportModal.module.css", selector: ".spin", property: "animation", kind: "duration", literal: "700ms", count: 1, reason: ".spin drives a functional progress or feedback animation at 700ms" },
  { path: "components/LibraryPicker.module.css", selector: ".thumbSkeleton", property: "animation", kind: "duration", literal: "1.1s", count: 1, reason: ".thumbSkeleton drives a functional progress or feedback animation at 1.1s" },
  { path: "components/LibrarySection.module.css", selector: ".spin", property: "animation", kind: "duration", literal: "700ms", count: 1, reason: ".spin drives a functional progress or feedback animation at 700ms" },
  { path: "components/LibrarySection.module.css", selector: ".thumbSkeleton", property: "animation", kind: "duration", literal: "1.1s", count: 1, reason: ".thumbSkeleton drives a functional progress or feedback animation at 1.1s" },
  { path: "components/LibrarySection.module.css", selector: ".viewToggleBtn", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".viewToggleBtn preserves a square join at the adjoining edge" },
  { path: "components/LibraryUploadModal.module.css", selector: ".spin", property: "animation", kind: "duration", literal: "700ms", count: 1, reason: ".spin drives a functional progress or feedback animation at 700ms" },
  { path: "components/MessageCenter.module.css", selector: ".panel", property: "border-radius", kind: "radius", literal: "0", count: 4, reason: ".panel preserves a square join at the adjoining edge" },
  { path: "components/settings/SettingsTabs.module.css", selector: ".tab", property: "border-radius", kind: "radius", literal: "0", count: 2, reason: ".tab preserves a square join at the adjoining edge" },
  { path: "components/WindowTitleBar.module.css", selector: ".bar .button", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".bar .button preserves a square join at the adjoining edge" },
  { path: "styles/base.css", selector: "*, *::before, *::after", property: "animation-duration", kind: "duration", literal: "0.01ms", count: 1, reason: "*, *::before, *::after disables motion for reduced-motion users with 0.01ms" },
  { path: "styles/base.css", selector: "*, *::before, *::after", property: "transition-duration", kind: "duration", literal: "0.01ms", count: 1, reason: "*, *::before, *::after disables motion for reduced-motion users with 0.01ms" },
  { path: "styles/chat.css", selector: ".chat-header-tab", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".chat-header-tab preserves a square join at the adjoining edge" },
  { path: "styles/chat.css", selector: ".chat-loading-lines span", property: "animation", kind: "duration", literal: "1100ms", count: 1, reason: ".chat-loading-lines span drives a functional progress or feedback animation at 1100ms" },
  { path: "styles/chat.css", selector: ".chat-loading-mark span:nth-child(2)", property: "animation-delay", kind: "duration", literal: "120ms", count: 1, reason: ".chat-loading-mark span:nth-child(2) keeps the intentional stagger timing at 120ms" },
  { path: "styles/chat.css", selector: ".chat-loading-mark span:nth-child(3)", property: "animation-delay", kind: "duration", literal: "240ms", count: 1, reason: ".chat-loading-mark span:nth-child(3) keeps the intentional stagger timing at 240ms" },
  { path: "styles/chat.css", selector: ".chat-loading-mark span", property: "animation", kind: "duration", literal: "900ms", count: 1, reason: ".chat-loading-mark span drives a functional progress or feedback animation at 900ms" },
  { path: "styles/chat.css", selector: ".composer-input-wrap .home-hero__carousel-caret", property: "animation", kind: "duration", literal: "900ms", count: 1, reason: ".composer-input-wrap .home-hero__carousel-caret drives a functional progress or feedback animation at 900ms" },
  { path: "styles/chat.css", selector: ".msg-applied-context", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".msg-applied-context preserves a square join at the adjoining edge" },
  { path: "styles/design-system-flow.css", selector: ".ds-create-row", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".ds-create-row preserves a square join at the adjoining edge" },
  { path: "styles/design-system-flow.css", selector: ".ds-project-file-row", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".ds-project-file-row preserves a square join at the adjoining edge" },
  { path: "styles/design-system-flow.css", selector: ".ds-project-loading-emblem", property: "animation", kind: "duration", literal: "2.8s", count: 1, reason: ".ds-project-loading-emblem drives a functional progress or feedback animation at 2.8s" },
  { path: "styles/design-system-flow.css", selector: ".ds-project-loading-mark svg rect", property: "animation", kind: "duration", literal: "1.55s", count: 1, reason: ".ds-project-loading-mark svg rect drives a functional progress or feedback animation at 1.55s" },
  { path: "styles/design-system-flow.css", selector: ".ds-project-loading-progress.is-indeterminate span", property: "animation", kind: "duration", literal: "1.75s", count: 1, reason: ".ds-project-loading-progress.is-indeterminate span drives a functional progress or feedback animation at 1.75s" },
  { path: "styles/design-system-flow.css", selector: ".ds-project-loading-skeleton span:nth-child(2)", property: "animation-delay", kind: "duration", literal: "120ms", count: 1, reason: ".ds-project-loading-skeleton span:nth-child(2) keeps the intentional stagger timing at 120ms" },
  { path: "styles/design-system-flow.css", selector: ".ds-project-loading-skeleton span:nth-child(3)", property: "animation-delay", kind: "duration", literal: "240ms", count: 1, reason: ".ds-project-loading-skeleton span:nth-child(3) keeps the intentional stagger timing at 240ms" },
  { path: "styles/design-system-flow.css", selector: ".ds-project-loading-skeleton span", property: "animation", kind: "duration", literal: "2.4s", count: 1, reason: ".ds-project-loading-skeleton span drives a functional progress or feedback animation at 2.4s" },
  { path: "styles/design-system-flow.css", selector: ".ds-project-loading-stage::before", property: "animation", kind: "duration", literal: "3.2s", count: 1, reason: ".ds-project-loading-stage::before drives a functional progress or feedback animation at 3.2s" },
  { path: "styles/design-system-flow.css", selector: ".ds-project-preview-placeholder", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".ds-project-preview-placeholder preserves a square join at the adjoining edge" },
  { path: "styles/design-system-flow.css", selector: ".ds-project-publish-trigger > button[aria-busy='true'] svg", property: "animation", kind: "duration", literal: "0.8s", count: 1, reason: ".ds-project-publish-trigger > button[aria-busy='true'] svg drives a functional progress or feedback animation at 0.8s" },
  { path: "styles/design-system-flow.css", selector: ".ds-project-review-item .ds-project-inline-preview", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".ds-project-review-item .ds-project-inline-preview preserves a square join at the adjoining edge" },
  { path: "styles/design-system-flow.css", selector: ".segmented button", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".segmented button preserves a square join at the adjoining edge" },
  { path: "styles/home/entry-layout.css", selector: ".confetti__piece", property: "animation-timing-function", kind: "curve", literal: "cubic-bezier(0.4, 0.1, 0.5, 1)", count: 1, reason: ".confetti__piece keeps its functional motion easing curve" },
  { path: "styles/home/entry-layout.css", selector: ".confetti__piece", property: "border-radius", kind: "radius", literal: "1px", count: 1, reason: ".confetti__piece retains its intentional component geometry at 1px" },
  { path: "styles/home/entry-layout.css", selector: ".entry-blank__mark:hover .entry-blank__mark-line:nth-child(2)", property: "animation-delay", kind: "duration", literal: "120ms", count: 1, reason: ".entry-blank__mark:hover .entry-blank__mark-line:nth-child(2) keeps the intentional stagger timing at 120ms" },
  { path: "styles/home/entry-layout.css", selector: ".entry-blank__mark:hover .entry-blank__mark-line:nth-child(3)", property: "animation-delay", kind: "duration", literal: "260ms", count: 1, reason: ".entry-blank__mark:hover .entry-blank__mark-line:nth-child(3) keeps the intentional stagger timing at 260ms" },
  { path: "styles/home/entry-layout.css", selector: ".entry-nav-rail__account-menu > *:nth-child(1)", property: "animation-delay", kind: "duration", literal: "0ms", count: 1, reason: ".entry-nav-rail__account-menu > *:nth-child(1) keeps the intentional stagger timing at 0ms" },
  { path: "styles/home/entry-layout.css", selector: ".entry-nav-rail__account-menu > *:nth-child(2)", property: "animation-delay", kind: "duration", literal: "15ms", count: 1, reason: ".entry-nav-rail__account-menu > *:nth-child(2) keeps the intentional stagger timing at 15ms" },
  { path: "styles/home/entry-layout.css", selector: ".entry-nav-rail__account-menu > *:nth-child(3)", property: "animation-delay", kind: "duration", literal: "30ms", count: 1, reason: ".entry-nav-rail__account-menu > *:nth-child(3) keeps the intentional stagger timing at 30ms" },
  { path: "styles/home/entry-layout.css", selector: ".entry-nav-rail__account-menu > *:nth-child(4)", property: "animation-delay", kind: "duration", literal: "45ms", count: 1, reason: ".entry-nav-rail__account-menu > *:nth-child(4) keeps the intentional stagger timing at 45ms" },
  { path: "styles/home/entry-layout.css", selector: ".entry-nav-rail__account-menu > *:nth-child(5)", property: "animation-delay", kind: "duration", literal: "60ms", count: 1, reason: ".entry-nav-rail__account-menu > *:nth-child(5) keeps the intentional stagger timing at 60ms" },
  { path: "styles/home/entry-layout.css", selector: ".entry-nav-rail__account-menu > *:nth-child(6)", property: "animation-delay", kind: "duration", literal: "75ms", count: 1, reason: ".entry-nav-rail__account-menu > *:nth-child(6) keeps the intentional stagger timing at 75ms" },
  { path: "styles/home/entry-layout.css", selector: ".entry-nav-rail__account-menu > *:nth-child(7)", property: "animation-delay", kind: "duration", literal: "90ms", count: 1, reason: ".entry-nav-rail__account-menu > *:nth-child(7) keeps the intentional stagger timing at 90ms" },
  { path: "styles/home/entry-layout.css", selector: ".entry-nav-rail__account-menu > *:nth-child(8)", property: "animation-delay", kind: "duration", literal: "105ms", count: 1, reason: ".entry-nav-rail__account-menu > *:nth-child(8) keeps the intentional stagger timing at 105ms" },
  { path: "styles/home/entry-layout.css", selector: ".entry-nav-rail__account-menu > *:nth-child(n+9)", property: "animation-delay", kind: "duration", literal: "120ms", count: 1, reason: ".entry-nav-rail__account-menu > *:nth-child(n+9) keeps the intentional stagger timing at 120ms" },
  { path: "styles/home/entry-layout.css", selector: ".entry-nav-rail__btn", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".entry-nav-rail__btn preserves a square join at the adjoining edge" },
  { path: "styles/home/entry-layout.css", selector: ".entry-onboarding-modal", property: "border-radius", kind: "radius", literal: "0", count: 3, reason: ".entry-onboarding-modal preserves a square join at the adjoining edge" },
  { path: "styles/home/entry-layout.css", selector: ".entry-rail-account-recovery__spinner", property: "animation", kind: "duration", literal: "900ms", count: 1, reason: ".entry-rail-account-recovery__spinner drives a functional progress or feedback animation at 900ms" },
  { path: "styles/home/entry-layout.css", selector: ".entry-rail-account-skeleton__avatar, .entry-rail-account-skeleton__name", property: "animation", kind: "duration", literal: "1.55s", count: 1, reason: ".entry-rail-account-skeleton__avatar, .entry-rail-account-skeleton__name drives a functional progress or feedback animation at 1.55s" },
  { path: "styles/home/entry-layout.css", selector: ".entry-shell--no-header .entry, .entry-nav-rail__btn, .entry-nav-rail__btn::before, .entry-nav-rail__btn::after", property: "transition-duration", kind: "duration", literal: "0.01ms", count: 1, reason: ".entry-shell--no-header .entry, .entry-nav-rail__btn, .entry-nav-rail__btn::before, .entry-nav-rail__btn::after disables motion for reduced-motion users with 0.01ms" },
  { path: "styles/home/entry-layout.css", selector: ".entry-shell--no-header .entry:not(.entry--rail-open) .entry-nav-rail__group > *, .entry-shell--no-header .entry:not(.entry--rail-open) .entry-nav-rail__team-section > *, .entry-shell--no-header .entry:not(.entry--rail-open) .entry-nav-rail__footer", property: "transition-delay", kind: "duration", literal: "0ms", count: 1, reason: ".entry-shell--no-header .entry:not(.entry--rail-open) .entry-nav-rail__group > *, .entry-shell--no-header .entry:not(.entry--rail-open) .entry-nav-rail__team-section > *, .entry-shell--no-header .entry:not(.entry--rail-open) .entry-nav-rail__footer keeps functional motion timing at 0ms" },
  { path: "styles/home/entry-layout.css", selector: ".entry-shell--no-header .entry:not(.entry--rail-open)", property: "transition-delay", kind: "duration", literal: "0ms", count: 1, reason: ".entry-shell--no-header .entry:not(.entry--rail-open) keeps functional motion timing at 0ms" },
  { path: "styles/home/entry-layout.css", selector: ".entry-shell--no-header .entry.entry--rail-open", property: "transition", kind: "duration", literal: "170ms", count: 1, reason: ".entry-shell--no-header .entry.entry--rail-open keeps a functional interaction transition at 170ms" },
  { path: "styles/home/entry-layout.css", selector: ".entry-shell--no-header .entry", property: "transition-delay", kind: "duration", literal: "0ms", count: 1, reason: ".entry-shell--no-header .entry keeps functional motion timing at 0ms" },
  { path: "styles/home/entry-layout.css", selector: ".entry:not(.entry--rail-open) .entry-nav-rail__footer", property: "transition-delay", kind: "duration", literal: "0ms", count: 1, reason: ".entry:not(.entry--rail-open) .entry-nav-rail__footer keeps functional motion timing at 0ms" },
  { path: "styles/home/entry-layout.css", selector: ".entry:not(.entry--rail-open) .entry-nav-rail__footer", property: "transition-delay", kind: "duration", literal: "165ms", count: 1, reason: ".entry:not(.entry--rail-open) .entry-nav-rail__footer keeps functional motion timing at 165ms" },
  { path: "styles/home/entry-layout.css", selector: ".entry:not(.entry--rail-open) .entry-nav-rail__group > *, .entry:not(.entry--rail-open) .entry-nav-rail__team-section > *", property: "transition-delay", kind: "duration", literal: "0ms", count: 1, reason: ".entry:not(.entry--rail-open) .entry-nav-rail__group > *, .entry:not(.entry--rail-open) .entry-nav-rail__team-section > * keeps functional motion timing at 0ms" },
  { path: "styles/home/entry-layout.css", selector: ".entry:not(.entry--rail-open) .entry-nav-rail__group > *:nth-child(1)", property: "transition-delay", kind: "duration", literal: "0ms", count: 1, reason: ".entry:not(.entry--rail-open) .entry-nav-rail__group > *:nth-child(1) keeps the intentional stagger timing at 0ms" },
  { path: "styles/home/entry-layout.css", selector: ".entry:not(.entry--rail-open) .entry-nav-rail__group > *:nth-child(2)", property: "transition-delay", kind: "duration", literal: "15ms", count: 1, reason: ".entry:not(.entry--rail-open) .entry-nav-rail__group > *:nth-child(2) keeps the intentional stagger timing at 15ms" },
  { path: "styles/home/entry-layout.css", selector: ".entry:not(.entry--rail-open) .entry-nav-rail__group > *:nth-child(3)", property: "transition-delay", kind: "duration", literal: "30ms", count: 1, reason: ".entry:not(.entry--rail-open) .entry-nav-rail__group > *:nth-child(3) keeps the intentional stagger timing at 30ms" },
  { path: "styles/home/entry-layout.css", selector: ".entry:not(.entry--rail-open) .entry-nav-rail__group > *:nth-child(4)", property: "transition-delay", kind: "duration", literal: "45ms", count: 1, reason: ".entry:not(.entry--rail-open) .entry-nav-rail__group > *:nth-child(4) keeps the intentional stagger timing at 45ms" },
  { path: "styles/home/entry-layout.css", selector: ".entry:not(.entry--rail-open) .entry-nav-rail__group > *:nth-child(5)", property: "transition-delay", kind: "duration", literal: "60ms", count: 1, reason: ".entry:not(.entry--rail-open) .entry-nav-rail__group > *:nth-child(5) keeps the intentional stagger timing at 60ms" },
  { path: "styles/home/entry-layout.css", selector: ".entry:not(.entry--rail-open) .entry-nav-rail__group > *:nth-child(6)", property: "transition-delay", kind: "duration", literal: "75ms", count: 1, reason: ".entry:not(.entry--rail-open) .entry-nav-rail__group > *:nth-child(6) keeps the intentional stagger timing at 75ms" },
  { path: "styles/home/entry-layout.css", selector: ".entry:not(.entry--rail-open) .entry-nav-rail__group > *:nth-child(7)", property: "transition-delay", kind: "duration", literal: "90ms", count: 1, reason: ".entry:not(.entry--rail-open) .entry-nav-rail__group > *:nth-child(7) keeps the intentional stagger timing at 90ms" },
  { path: "styles/home/entry-layout.css", selector: ".entry:not(.entry--rail-open) .entry-nav-rail__group > *:nth-child(n + 8)", property: "transition-delay", kind: "duration", literal: "105ms", count: 1, reason: ".entry:not(.entry--rail-open) .entry-nav-rail__group > *:nth-child(n + 8) keeps the intentional stagger timing at 105ms" },
  { path: "styles/home/entry-layout.css", selector: ".entry:not(.entry--rail-open) .entry-nav-rail__team-section > *:nth-child(1)", property: "transition-delay", kind: "duration", literal: "75ms", count: 1, reason: ".entry:not(.entry--rail-open) .entry-nav-rail__team-section > *:nth-child(1) keeps the intentional stagger timing at 75ms" },
  { path: "styles/home/entry-layout.css", selector: ".entry:not(.entry--rail-open) .entry-nav-rail__team-section > *:nth-child(2)", property: "transition-delay", kind: "duration", literal: "90ms", count: 1, reason: ".entry:not(.entry--rail-open) .entry-nav-rail__team-section > *:nth-child(2) keeps the intentional stagger timing at 90ms" },
  { path: "styles/home/entry-layout.css", selector: ".entry:not(.entry--rail-open) .entry-nav-rail__team-section > *:nth-child(3)", property: "transition-delay", kind: "duration", literal: "105ms", count: 1, reason: ".entry:not(.entry--rail-open) .entry-nav-rail__team-section > *:nth-child(3) keeps the intentional stagger timing at 105ms" },
  { path: "styles/home/entry-layout.css", selector: ".entry:not(.entry--rail-open) .entry-nav-rail__team-section > *:nth-child(4)", property: "transition-delay", kind: "duration", literal: "120ms", count: 1, reason: ".entry:not(.entry--rail-open) .entry-nav-rail__team-section > *:nth-child(4) keeps the intentional stagger timing at 120ms" },
  { path: "styles/home/entry-layout.css", selector: ".entry:not(.entry--rail-open) .entry-nav-rail__team-section > *:nth-child(n + 5)", property: "transition-delay", kind: "duration", literal: "135ms", count: 1, reason: ".entry:not(.entry--rail-open) .entry-nav-rail__team-section > *:nth-child(n + 5) keeps the intentional stagger timing at 135ms" },
  { path: "styles/home/entry-layout.css", selector: ".inline-switcher__account-action svg", property: "animation", kind: "duration", literal: "0.8s", count: 2, reason: ".inline-switcher__account-action svg drives a functional progress or feedback animation at 0.8s" },
  { path: "styles/home/entry-layout.css", selector: ".inline-switcher__agent-status-icon.is-pending svg", property: "animation", kind: "duration", literal: "0.8s", count: 1, reason: ".inline-switcher__agent-status-icon.is-pending svg drives a functional progress or feedback animation at 0.8s" },
  { path: "styles/home/entry-layout.css", selector: ".onboarding-view__panel", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".onboarding-view__panel preserves a square join at the adjoining edge" },
  { path: "styles/home/entry-layout.css", selector: ".onboarding-view__skeleton-line, .onboarding-view__skeleton-model-label, .onboarding-view__skeleton-model-bar", property: "animation", kind: "duration", literal: "1.55s", count: 1, reason: ".onboarding-view__skeleton-line, .onboarding-view__skeleton-model-label, .onboarding-view__skeleton-model-bar drives a functional progress or feedback animation at 1.55s" },
  { path: "styles/home/entry-layout.css", selector: ".onboarding-view__skeleton-model-bar", property: "animation-delay", kind: "duration", literal: "160ms", count: 1, reason: ".onboarding-view__skeleton-model-bar keeps the intentional stagger timing at 160ms" },
  { path: "styles/home/entry-layout.css", selector: ".onboarding-view__steps", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".onboarding-view__steps preserves a square join at the adjoining edge" },
  { path: "styles/home/entry-layout.css", selector: ".onboarding-view__upcoming-benefits", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".onboarding-view__upcoming-benefits preserves a square join at the adjoining edge" },
  { path: "styles/home/entry-layout.css", selector: "[data-testid=\"design-systems-preview\"]", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: "[data-testid=\"design-systems-preview\"] preserves a square join at the adjoining edge" },
  { path: "styles/home/entry-layout.css", selector: "[data-testid=\"design-systems-tab\"] > aside", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: "[data-testid=\"design-systems-tab\"] > aside preserves a square join at the adjoining edge" },
  { path: "styles/home/home-hero.css", selector: ".home-hero__attention-sheen::after", property: "animation", kind: "duration", literal: "0.25s", count: 1, reason: ".home-hero__attention-sheen::after drives a functional progress or feedback animation at 0.25s" },
  { path: "styles/home/home-hero.css", selector: ".home-hero__attention-sheen::after", property: "animation", kind: "duration", literal: "0.9s", count: 1, reason: ".home-hero__attention-sheen::after drives a functional progress or feedback animation at 0.9s" },
  { path: "styles/home/home-hero.css", selector: ".home-hero__carousel-caret", property: "animation", kind: "duration", literal: "1.05s", count: 1, reason: ".home-hero__carousel-caret drives a functional progress or feedback animation at 1.05s" },
  { path: "styles/home/home-hero.css", selector: ".home-hero__carousel-caret", property: "border-radius", kind: "radius", literal: "1px", count: 1, reason: ".home-hero__carousel-caret retains its intentional component geometry at 1px" },
  { path: "styles/home/home-hero.css", selector: ".home-hero__composer-card", property: "border-radius", kind: "radius", literal: "4px", count: 1, reason: ".home-hero__composer-card retains its intentional component geometry at 4px" },
  { path: "styles/home/home-hero.css", selector: ".home-hero__footer-option-icon--compact", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".home-hero__footer-option-icon--compact preserves a square join at the adjoining edge" },
  { path: "styles/home/home-hero.css", selector: ".home-hero__input-card, .home-hero__type-tab, .home-hero__scenario-card.home-hero__type-tab, .home-hero__template-card", property: "transition-duration", kind: "duration", literal: "0.01ms", count: 1, reason: ".home-hero__input-card, .home-hero__type-tab, .home-hero__scenario-card.home-hero__type-tab, .home-hero__template-card disables motion for reduced-motion users with 0.01ms" },
  { path: "styles/home/home-hero.css", selector: ".home-hero__model-option-icon--compact", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".home-hero__model-option-icon--compact preserves a square join at the adjoining edge" },
  { path: "styles/home/home-hero.css", selector: ".home-hero__rail-divider", property: "border-radius", kind: "radius", literal: "1px", count: 1, reason: ".home-hero__rail-divider retains its intentional component geometry at 1px" },
  { path: "styles/home/home-hero.css", selector: ".home-hero__ratio-option-icon i", property: "border-radius", kind: "radius", literal: "2.5px", count: 1, reason: ".home-hero__ratio-option-icon i retains its intentional component geometry at 2.5px" },
  { path: "styles/home/home-hero.css", selector: ".home-hero__ratio-option-icon--compact", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".home-hero__ratio-option-icon--compact preserves a square join at the adjoining edge" },
  { path: "styles/home/home-hero.css", selector: ".inline-switcher__chip-conn::after", property: "animation", kind: "duration", literal: "2s", count: 1, reason: ".inline-switcher__chip-conn::after drives a functional progress or feedback animation at 2s" },
  { path: "styles/home/integrations.css", selector: ".integrations-view__tab", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".integrations-view__tab preserves a square join at the adjoining edge" },
  { path: "styles/home/marketplace.css", selector: ".marketplace-view__filters button", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".marketplace-view__filters button preserves a square join at the adjoining edge" },
  { path: "styles/home/plugins-home.css", selector: ".home-templates-reveal__hint-arrow", property: "animation", kind: "duration", literal: "1.8s", count: 1, reason: ".home-templates-reveal__hint-arrow drives a functional progress or feedback animation at 1.8s" },
  { path: "styles/home/plugins-home.css", selector: ".plugins-home__html-skeleton.is-active span", property: "animation", kind: "duration", literal: "1.6s", count: 1, reason: ".plugins-home__html-skeleton.is-active span drives a functional progress or feedback animation at 1.6s" },
  { path: "styles/home/plugins-home.css", selector: ".plugins-home__media-skeleton.is-active", property: "animation", kind: "duration", literal: "1.6s", count: 1, reason: ".plugins-home__media-skeleton.is-active drives a functional progress or feedback animation at 1.6s" },
  { path: "styles/home/plugins-home.css", selector: ".plugins-home__sort-segment", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".plugins-home__sort-segment preserves a square join at the adjoining edge" },
  { path: "styles/home/plugins-home.css", selector: ".plugins-home__use-menu.has-options .plugins-home__use-main", property: "border-bottom-right-radius", kind: "radius", literal: "0", count: 1, reason: ".plugins-home__use-menu.has-options .plugins-home__use-main preserves a square join at the adjoining edge" },
  { path: "styles/home/plugins-home.css", selector: ".plugins-home__use-menu.has-options .plugins-home__use-main", property: "border-top-right-radius", kind: "radius", literal: "0", count: 1, reason: ".plugins-home__use-menu.has-options .plugins-home__use-main preserves a square join at the adjoining edge" },
  { path: "styles/home/plugins-home.css", selector: ".plugins-home__use-toggle", property: "border-bottom-left-radius", kind: "radius", literal: "0", count: 1, reason: ".plugins-home__use-toggle preserves a square join at the adjoining edge" },
  { path: "styles/home/plugins-home.css", selector: ".plugins-home__use-toggle", property: "border-top-left-radius", kind: "radius", literal: "0", count: 1, reason: ".plugins-home__use-toggle preserves a square join at the adjoining edge" },
  { path: "styles/home/plus-menu.css", selector: ".plus-menu__flyout .composer-design-toolbox-menu", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".plus-menu__flyout .composer-design-toolbox-menu preserves a square join at the adjoining edge" },
  { path: "styles/home/plus-menu.css", selector: ".plus-menu__preview-hero .plugins-home__preview", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".plus-menu__preview-hero .plugins-home__preview preserves a square join at the adjoining edge" },
  { path: "styles/home/recent-projects.css", selector: ".recent-projects__card-status-running .recent-projects__card-status-dot", property: "animation", kind: "duration", literal: "1.4s", count: 1, reason: ".recent-projects__card-status-running .recent-projects__card-status-dot drives a functional progress or feedback animation at 1.4s" },
  { path: "styles/home/recent-projects.css", selector: ".recent-projects__card, .recent-projects__card-more", property: "transition-duration", kind: "duration", literal: "0.01ms", count: 1, reason: ".recent-projects__card, .recent-projects__card-more disables motion for reduced-motion users with 0.01ms" },
  { path: "styles/home/recent-projects.css", selector: ".recent-projects__deck-cover-loading", property: "animation", kind: "duration", literal: "1.4s", count: 1, reason: ".recent-projects__deck-cover-loading drives a functional progress or feedback animation at 1.4s" },
  { path: "styles/home/tasks.css", selector: ".automations-template-tab", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".automations-template-tab preserves a square join at the adjoining edge" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-motion-compatibility-accelerate-mid", kind: "curve", literal: "cubic-bezier(1, 0, 1, 1)", count: 1, reason: ":root keeps its functional motion easing curve" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-motion-compatibility-decelerate-mid", kind: "curve", literal: "cubic-bezier(0, 0, 0, 1)", count: 1, reason: ":root keeps its functional motion easing curve" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-motion-compatibility-ease-in-out", kind: "curve", literal: "cubic-bezier(.42, 0, .58, 1)", count: 1, reason: ":root keeps its functional motion easing curve" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-motion-compatibility-ease-out", kind: "curve", literal: "cubic-bezier(.23, 1, .32, 1)", count: 1, reason: ":root keeps its functional motion easing curve" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-motion-compatibility-easy-ease", kind: "curve", literal: "cubic-bezier(.33, 0, .67, 1)", count: 1, reason: ":root keeps its functional motion easing curve" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-motion-duration-compatibility-exit", kind: "duration", literal: "140ms", count: 1, reason: ":root keeps functional motion timing at 140ms" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-motion-duration-compatibility-export-ready-feedback", kind: "duration", literal: "1600ms", count: 1, reason: ":root keeps functional motion timing at 1600ms" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-motion-duration-compatibility-quick", kind: "duration", literal: "120ms", count: 1, reason: ":root keeps functional motion timing at 120ms" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-motion-duration-compatibility-reduced-motion", kind: "duration", literal: "80ms", count: 1, reason: ":root keeps functional motion timing at 80ms" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-motion-duration-extra-long1", kind: "duration", literal: "700ms", count: 1, reason: ":root keeps functional motion timing at 700ms" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-motion-duration-extra-long2", kind: "duration", literal: "800ms", count: 1, reason: ":root keeps functional motion timing at 800ms" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-motion-duration-extra-long3", kind: "duration", literal: "900ms", count: 1, reason: ":root keeps functional motion timing at 900ms" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-motion-duration-extra-long4", kind: "duration", literal: "1000ms", count: 1, reason: ":root keeps functional motion timing at 1000ms" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-motion-duration-long1", kind: "duration", literal: "450ms", count: 1, reason: ":root keeps functional motion timing at 450ms" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-motion-duration-long2", kind: "duration", literal: "500ms", count: 1, reason: ":root keeps functional motion timing at 500ms" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-motion-duration-long3", kind: "duration", literal: "550ms", count: 1, reason: ":root keeps functional motion timing at 550ms" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-motion-duration-long4", kind: "duration", literal: "600ms", count: 1, reason: ":root keeps functional motion timing at 600ms" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-motion-duration-medium1", kind: "duration", literal: "250ms", count: 1, reason: ":root keeps functional motion timing at 250ms" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-motion-duration-medium2", kind: "duration", literal: "300ms", count: 1, reason: ":root keeps functional motion timing at 300ms" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-motion-duration-medium3", kind: "duration", literal: "350ms", count: 1, reason: ":root keeps functional motion timing at 350ms" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-motion-duration-medium4", kind: "duration", literal: "400ms", count: 1, reason: ":root keeps functional motion timing at 400ms" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-motion-duration-short1", kind: "duration", literal: "50ms", count: 1, reason: ":root keeps functional motion timing at 50ms" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-motion-duration-short2", kind: "duration", literal: "100ms", count: 1, reason: ":root keeps functional motion timing at 100ms" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-motion-duration-short3", kind: "duration", literal: "150ms", count: 1, reason: ":root keeps functional motion timing at 150ms" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-motion-duration-short4", kind: "duration", literal: "200ms", count: 1, reason: ":root keeps functional motion timing at 200ms" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-motion-emphasized-accelerate", kind: "curve", literal: "cubic-bezier(.3, 0, .8, .15)", count: 1, reason: ":root keeps its functional motion easing curve" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-motion-emphasized-decelerate", kind: "curve", literal: "cubic-bezier(.05, .7, .1, 1)", count: 1, reason: ":root keeps its functional motion easing curve" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-motion-emphasized", kind: "curve", literal: "cubic-bezier(.2, 0, 0, 1)", count: 1, reason: ":root keeps its functional motion easing curve" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-motion-linear", kind: "curve", literal: "cubic-bezier(0, 0, 1, 1)", count: 1, reason: ":root keeps its functional motion easing curve" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-motion-standard-accelerate", kind: "curve", literal: "cubic-bezier(.3, 0, 1, 1)", count: 1, reason: ":root keeps its functional motion easing curve" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-motion-standard-decelerate", kind: "curve", literal: "cubic-bezier(0, 0, .2, 1)", count: 1, reason: ":root keeps its functional motion easing curve" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-motion-standard", kind: "curve", literal: "cubic-bezier(.2, 0, 0, 1)", count: 1, reason: ":root keeps its functional motion easing curve" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-shape-corner-full", kind: "radius", literal: "9999px", count: 1, reason: ":root defines the shared shape token --md-sys-shape-corner-full" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-shape-corner-l", kind: "radius", literal: "16px", count: 1, reason: ":root defines the shared shape token --md-sys-shape-corner-l" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-shape-corner-m", kind: "radius", literal: "12px", count: 1, reason: ":root defines the shared shape token --md-sys-shape-corner-m" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-shape-corner-none", kind: "radius", literal: "0px", count: 1, reason: ":root defines the shared shape token --md-sys-shape-corner-none" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-shape-corner-s", kind: "radius", literal: "8px", count: 1, reason: ":root defines the shared shape token --md-sys-shape-corner-s" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-shape-corner-xl", kind: "radius", literal: "28px", count: 1, reason: ":root defines the shared shape token --md-sys-shape-corner-xl" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-shape-corner-xs", kind: "radius", literal: "4px", count: 1, reason: ":root defines the shared shape token --md-sys-shape-corner-xs" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--md-sys-shape-corner-xxl", kind: "radius", literal: "32px", count: 1, reason: ":root defines the shared shape token --md-sys-shape-corner-xxl" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--od-compat-radius-circular", kind: "radius", literal: "50%", count: 1, reason: ":root defines the shared shape token --od-compat-radius-circular" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--od-compat-radius-pill", kind: "radius", literal: "999px", count: 1, reason: ":root defines the shared shape token --od-compat-radius-pill" },
  { path: "styles/md3-tokens.css", selector: ":root", property: "--od-compat-radius-xxs", kind: "radius", literal: "2px", count: 1, reason: ":root defines the shared shape token --od-compat-radius-xxs" },
  { path: "styles/shell.css", selector: ".chrome-access-options button", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".chrome-access-options button preserves a square join at the adjoining edge" },
  { path: "styles/shell.css", selector: ".comment-float-host > .comment-side-panel, .comment-float-host > .comment-side-dock > .comment-side-panel", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".comment-float-host > .comment-side-panel, .comment-float-host > .comment-side-dock > .comment-side-panel preserves a square join at the adjoining edge" },
  { path: "styles/shell.css", selector: ".comment-float-host:has(.comment-side-rail)", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".comment-float-host:has(.comment-side-rail) preserves a square join at the adjoining edge" },
  { path: "styles/shell.css", selector: ".workspace-tab__main", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".workspace-tab__main preserves a square join at the adjoining edge" },
  { path: "styles/shell.css", selector: ".workspace-tab, .workspace-tabs-new-btn, .workspace-tabs-icon-btn, .app-chrome-back, .settings-icon-btn, .chrome-action", property: "transition-duration", kind: "duration", literal: "0.01ms", count: 1, reason: ".workspace-tab, .workspace-tabs-new-btn, .workspace-tabs-icon-btn, .app-chrome-back, .settings-icon-btn, .chrome-action disables motion for reduced-motion users with 0.01ms" },
  { path: "styles/shell.css", selector: ".workspace-tab", property: "border-radius", kind: "radius", literal: "0", count: 6, reason: ".workspace-tab preserves a square join at the adjoining edge" },
  { path: "styles/viewer/composio.css", selector: ".assistant-footer .dot[data-active=\"true\"]", property: "animation", kind: "duration", literal: "1.2s", count: 1, reason: ".assistant-footer .dot[data-active=\"true\"] drives a functional progress or feedback animation at 1.2s" },
  { path: "styles/viewer/composio.css", selector: ".assistant-footer .dot", property: "border-radius", kind: "radius", literal: "50%", count: 1, reason: ".assistant-footer .dot preserves circular geometry with a percentage radius" },
  { path: "styles/viewer/composio.css", selector: ".assistant-footer", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".assistant-footer preserves a square join at the adjoining edge" },
  { path: "styles/viewer/composio.css", selector: ".chat-jump-btn-active", property: "transition", kind: "duration", literal: "0s", count: 2, reason: ".chat-jump-btn-active keeps a functional interaction transition at 0s" },
  { path: "styles/viewer/composio.css", selector: ".chat-jump-btn", property: "transition", kind: "duration", literal: "0s", count: 1, reason: ".chat-jump-btn keeps a functional interaction transition at 0s" },
  { path: "styles/viewer/composio.css", selector: ".chat-pinned-todo .op-card.op-todo", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".chat-pinned-todo .op-card.op-todo preserves a square join at the adjoining edge" },
  { path: "styles/viewer/composio.css", selector: ".design-card-skeleton .design-card-thumb", property: "animation", kind: "duration", literal: "1.4s", count: 1, reason: ".design-card-skeleton .design-card-thumb drives a functional progress or feedback animation at 1.4s" },
  { path: "styles/viewer/composio.css", selector: ".ds-modal-fullscreen", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".ds-modal-fullscreen preserves a square join at the adjoining edge" },
  { path: "styles/viewer/composio.css", selector: ".ds-modal-primary-action--split", property: "border-bottom-right-radius", kind: "radius", literal: "0", count: 1, reason: ".ds-modal-primary-action--split preserves a square join at the adjoining edge" },
  { path: "styles/viewer/composio.css", selector: ".ds-modal-primary-action--split", property: "border-top-right-radius", kind: "radius", literal: "0", count: 1, reason: ".ds-modal-primary-action--split preserves a square join at the adjoining edge" },
  { path: "styles/viewer/composio.css", selector: ".ds-modal-primary-action-caret", property: "border-bottom-left-radius", kind: "radius", literal: "0", count: 1, reason: ".ds-modal-primary-action-caret preserves a square join at the adjoining edge" },
  { path: "styles/viewer/composio.css", selector: ".ds-modal-primary-action-caret", property: "border-top-left-radius", kind: "radius", literal: "0", count: 1, reason: ".ds-modal-primary-action-caret preserves a square join at the adjoining edge" },
  { path: "styles/viewer/composio.css", selector: ".ds-modal-sidebar .plugin-info-pane", property: "animation", kind: "duration", literal: "60ms", count: 1, reason: ".ds-modal-sidebar .plugin-info-pane drives a functional progress or feedback animation at 60ms" },
  { path: "styles/viewer/composio.css", selector: ".ds-modal-stage-handle.is-collapse", property: "border-radius", kind: "radius", literal: "0", count: 4, reason: ".ds-modal-stage-handle.is-collapse preserves a square join at the adjoining edge" },
  { path: "styles/viewer/composio.css", selector: ".ds-modal-stage-handle.is-expand", property: "border-radius", kind: "radius", literal: "0", count: 4, reason: ".ds-modal-stage-handle.is-expand preserves a square join at the adjoining edge" },
  { path: "styles/viewer/composio.css", selector: ".ds-modal", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".ds-modal preserves a square join at the adjoining edge" },
  { path: "styles/viewer/composio.css", selector: ".field-input-skeleton-shimmer", property: "animation", kind: "duration", literal: "1.6s", count: 1, reason: ".field-input-skeleton-shimmer drives a functional progress or feedback animation at 1.6s" },
  { path: "styles/viewer/composio.css", selector: ".field-status-badge-skeleton", property: "animation", kind: "duration", literal: "1.4s", count: 1, reason: ".field-status-badge-skeleton drives a functional progress or feedback animation at 1.4s" },
  { path: "styles/viewer/composio.css", selector: ".icon-spin", property: "animation", kind: "duration", literal: "0.9s", count: 1, reason: ".icon-spin drives a functional progress or feedback animation at 0.9s" },
  { path: "styles/viewer/composio.css", selector: ".md-tk-color-swatch", property: "border-radius", kind: "radius", literal: "2px", count: 1, reason: ".md-tk-color-swatch retains its intentional component geometry at 2px" },
  { path: "styles/viewer/composio.css", selector: ".op-todo", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".op-todo preserves a square join at the adjoining edge" },
  { path: "styles/viewer/composio.css", selector: ".op-waiting-dot", property: "animation", kind: "duration", literal: "1.4s", count: 1, reason: ".op-waiting-dot drives a functional progress or feedback animation at 1.4s" },
  { path: "styles/viewer/composio.css", selector: ".plugin-media-stage__audio-glyph", property: "border-radius", kind: "radius", literal: "50%", count: 1, reason: ".plugin-media-stage__audio-glyph preserves circular geometry with a percentage radius" },
  { path: "styles/viewer/composio.css", selector: ".present-esc-hint", property: "animation", kind: "duration", literal: "3600ms", count: 1, reason: ".present-esc-hint drives a functional progress or feedback animation at 3600ms" },
  { path: "styles/viewer/composio.css", selector: ".qf-card-swatch", property: "border-radius", kind: "radius", literal: "3px", count: 1, reason: ".qf-card-swatch retains its intentional component geometry at 3px" },
  { path: "styles/viewer/composio.css", selector: ".qf-custom .qf-input", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".qf-custom .qf-input preserves a square join at the adjoining edge" },
  { path: "styles/viewer/composio.css", selector: ".qf-preview-accent", property: "border-radius", kind: "radius", literal: "50%", count: 1, reason: ".qf-preview-accent preserves circular geometry with a percentage radius" },
  { path: "styles/viewer/composio.css", selector: ".qf-preview-app", property: "border-radius", kind: "radius", literal: "0", count: 2, reason: ".qf-preview-app preserves a square join at the adjoining edge" },
  { path: "styles/viewer/composio.css", selector: ".qf-preview-app", property: "border-radius", kind: "radius", literal: "6px", count: 2, reason: ".qf-preview-app preserves functional layout geometry at 6px" },
  { path: "styles/viewer/composio.css", selector: ".qf-preview-appbar i", property: "border-radius", kind: "radius", literal: "50%", count: 1, reason: ".qf-preview-appbar i preserves circular geometry with a percentage radius" },
  { path: "styles/viewer/composio.css", selector: ".qf-preview-content-grid i", property: "border-radius", kind: "radius", literal: "3px", count: 1, reason: ".qf-preview-content-grid i preserves functional layout geometry at 3px" },
  { path: "styles/viewer/composio.css", selector: ".qf-preview-figure", property: "border-radius", kind: "radius", literal: "3px", count: 1, reason: ".qf-preview-figure preserves functional layout geometry at 3px" },
  { path: "styles/viewer/composio.css", selector: ".qf-preview-sidebar i", property: "border-radius", kind: "radius", literal: "2px", count: 1, reason: ".qf-preview-sidebar i preserves functional layout geometry at 2px" },
  { path: "styles/viewer/composio.css", selector: ".qf-preview-slide", property: "border-radius", kind: "radius", literal: "0", count: 2, reason: ".qf-preview-slide preserves a square join at the adjoining edge" },
  { path: "styles/viewer/composio.css", selector: ".qf-preview-slide", property: "border-radius", kind: "radius", literal: "4px", count: 2, reason: ".qf-preview-slide preserves functional layout geometry at 4px" },
  { path: "styles/viewer/composio.css", selector: ".qf-visual-dialog-tab::after", property: "border-radius", kind: "radius", literal: "0", count: 2, reason: ".qf-visual-dialog-tab::after preserves a square join at the adjoining edge" },
  { path: "styles/viewer/composio.css", selector: ".qf-visual-dialog-tab", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".qf-visual-dialog-tab preserves a square join at the adjoining edge" },
  { path: "styles/viewer/composio.css", selector: ".question-form-loading-lines span, .question-form-loading-body span", property: "animation", kind: "duration", literal: "1.2s", count: 1, reason: ".question-form-loading-lines span, .question-form-loading-body span drives a functional progress or feedback animation at 1.2s" },
  { path: "styles/viewer/composio.css", selector: ".questions-continue-spinner", property: "animation", kind: "duration", literal: "0.7s", count: 1, reason: ".questions-continue-spinner drives a functional progress or feedback animation at 0.7s" },
  { path: "styles/viewer/composio.css", selector: ".questions-continue-spinner", property: "border-radius", kind: "radius", literal: "50%", count: 1, reason: ".questions-continue-spinner preserves circular geometry with a percentage radius" },
  { path: "styles/viewer/composio.css", selector: ".questions-panel-dot:nth-child(2)", property: "animation-delay", kind: "duration", literal: "0.16s", count: 1, reason: ".questions-panel-dot:nth-child(2) keeps the intentional stagger timing at 0.16s" },
  { path: "styles/viewer/composio.css", selector: ".questions-panel-dot:nth-child(3)", property: "animation-delay", kind: "duration", literal: "0.32s", count: 1, reason: ".questions-panel-dot:nth-child(3) keeps the intentional stagger timing at 0.32s" },
  { path: "styles/viewer/composio.css", selector: ".questions-panel-dot", property: "animation", kind: "duration", literal: "1.1s", count: 1, reason: ".questions-panel-dot drives a functional progress or feedback animation at 1.1s" },
  { path: "styles/viewer/composio.css", selector: ".skeleton-block, .skeleton-shimmer", property: "animation", kind: "duration", literal: "1.4s", count: 1, reason: ".skeleton-block, .skeleton-shimmer drives a functional progress or feedback animation at 1.4s" },
  { path: "styles/viewer/core.css", selector: ".board-pod-chip-remove", property: "border-radius", kind: "radius", literal: "50%", count: 1, reason: ".board-pod-chip-remove preserves circular geometry with a percentage radius" },
  { path: "styles/viewer/core.css", selector: ".comment-saved-pin, .comment-active-pin", property: "border-radius", kind: "radius", literal: "10px", count: 1, reason: ".comment-saved-pin, .comment-active-pin retains its intentional component geometry at 10px" },
  { path: "styles/viewer/core.css", selector: ".comment-saved-pin, .comment-active-pin", property: "border-radius", kind: "radius", literal: "50%", count: 3, reason: ".comment-saved-pin, .comment-active-pin preserves circular geometry with a percentage radius" },
  { path: "styles/viewer/core.css", selector: ".comment-side-avatar", property: "border-radius", kind: "radius", literal: "50%", count: 1, reason: ".comment-side-avatar preserves circular geometry with a percentage radius" },
  { path: "styles/viewer/core.css", selector: ".file-version-preview-spinner", property: "animation-duration", kind: "duration", literal: "1.4s", count: 1, reason: ".file-version-preview-spinner drives a functional progress or feedback animation at 1.4s" },
  { path: "styles/viewer/core.css", selector: ".file-version-preview-spinner", property: "animation", kind: "duration", literal: "720ms", count: 1, reason: ".file-version-preview-spinner drives a functional progress or feedback animation at 720ms" },
  { path: "styles/viewer/core.css", selector: ".file-version-preview-spinner", property: "border-radius", kind: "radius", literal: "50%", count: 1, reason: ".file-version-preview-spinner preserves circular geometry with a percentage radius" },
  { path: "styles/viewer/core.css", selector: ".file-version-skeleton-line", property: "animation", kind: "duration", literal: "1.4s", count: 1, reason: ".file-version-skeleton-line drives a functional progress or feedback animation at 1.4s" },
  { path: "styles/viewer/core.css", selector: ".live-artifact-refresh-event.tone-running .live-artifact-refresh-event-dot", property: "animation", kind: "duration", literal: "1.5s", count: 1, reason: ".live-artifact-refresh-event.tone-running .live-artifact-refresh-event-dot drives a functional progress or feedback animation at 1.5s" },
  { path: "styles/viewer/core.css", selector: ".preview-viewport-mobile .preview-frame-clip, .preview-viewport-mobile:not(.comment-preview-layer-with-side-dock) .comment-preview-canvas, .preview-viewport-mobile.manual-edit-workspace .manual-edit-canvas", property: "border-radius", kind: "radius", literal: "28px", count: 1, reason: ".preview-viewport-mobile .preview-frame-clip, .preview-viewport-mobile:not(.comment-preview-layer-with-side-dock) .comment-preview-canvas, .preview-viewport-mobile.manual-edit-workspace .manual-edit-canvas preserves functional layout geometry at 28px" },
  { path: "styles/viewer/core.css", selector: ".preview-viewport:not(.preview-viewport-desktop) .preview-frame-clip, .preview-viewport:not(.preview-viewport-desktop):not(.comment-preview-layer-with-side-dock) .comment-preview-canvas, .preview-viewport:not(.preview-viewport-desktop).manual-edit-workspace .manual-edit-canvas", property: "border-radius", kind: "radius", literal: "18px", count: 1, reason: ".preview-viewport:not(.preview-viewport-desktop) .preview-frame-clip, .preview-viewport:not(.preview-viewport-desktop):not(.comment-preview-layer-with-side-dock) .comment-preview-canvas, .preview-viewport:not(.preview-viewport-desktop).manual-edit-workspace .manual-edit-canvas preserves functional layout geometry at 18px" },
  { path: "styles/viewer/core.css", selector: ".viewer-loading-bar-three", property: "animation-delay", kind: "duration", literal: "240ms", count: 1, reason: ".viewer-loading-bar-three keeps the intentional stagger timing at 240ms" },
  { path: "styles/viewer/core.css", selector: ".viewer-loading-bar-two", property: "animation-delay", kind: "duration", literal: "120ms", count: 1, reason: ".viewer-loading-bar-two keeps the intentional stagger timing at 120ms" },
  { path: "styles/viewer/core.css", selector: ".viewer-loading-card-main::before", property: "animation", kind: "duration", literal: "1.8s", count: 1, reason: ".viewer-loading-card-main::before drives a functional progress or feedback animation at 1.8s" },
  { path: "styles/viewer/core.css", selector: ".viewer-loading-kicker, .viewer-loading-title, .viewer-loading-rule, .viewer-loading-line, .viewer-loading-bar", property: "animation", kind: "duration", literal: "1.55s", count: 1, reason: ".viewer-loading-kicker, .viewer-loading-title, .viewer-loading-rule, .viewer-loading-line, .viewer-loading-bar drives a functional progress or feedback animation at 1.55s" },
  { path: "styles/viewer/core.css", selector: ".viewer-loading-stage", property: "animation", kind: "duration", literal: "2.4s", count: 1, reason: ".viewer-loading-stage drives a functional progress or feedback animation at 2.4s" },
  { path: "styles/viewer/core.css", selector: ".viewer-loading", property: "animation", kind: "duration", literal: "180ms", count: 1, reason: ".viewer-loading drives a functional progress or feedback animation at 180ms" },
  { path: "styles/viewer/library.css", selector: ".pet-codex-card:hover .pet-codex-thumb-preview, .pet-codex-card:focus-within .pet-codex-thumb-preview", property: "animation", kind: "duration", literal: "0.6s", count: 1, reason: ".pet-codex-card:hover .pet-codex-thumb-preview, .pet-codex-card:focus-within .pet-codex-thumb-preview drives a functional progress or feedback animation at 0.6s" },
  { path: "styles/viewer/library.css", selector: ".pet-codex-card:hover .pet-codex-thumb-preview, .pet-codex-card:focus-within .pet-codex-thumb-preview", property: "animation", kind: "duration", literal: "5.4s", count: 1, reason: ".pet-codex-card:hover .pet-codex-thumb-preview, .pet-codex-card:focus-within .pet-codex-thumb-preview drives a functional progress or feedback animation at 5.4s" },
  { path: "styles/viewer/routines.css", selector: ".app .action-card", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".app .action-card preserves a square join at the adjoining edge" },
  { path: "styles/viewer/routines.css", selector: ".app .chat-header, .app .ws-tabs-shell", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".app .chat-header, .app .ws-tabs-shell preserves a square join at the adjoining edge" },
  { path: "styles/viewer/routines.css", selector: ".app .live-code-box .live-code-head", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".app .live-code-box .live-code-head preserves a square join at the adjoining edge" },
  { path: "styles/viewer/routines.css", selector: ".app .op-card", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".app .op-card preserves a square join at the adjoining edge" },
  { path: "styles/viewer/routines.css", selector: ".app .produced-file-icon", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".app .produced-file-icon preserves a square join at the adjoining edge" },
  { path: "styles/viewer/routines.css", selector: ".app .produced-files", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".app .produced-files preserves a square join at the adjoining edge" },
  { path: "styles/viewer/routines.css", selector: ".app .status-detail", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".app .status-detail preserves a square join at the adjoining edge" },
  { path: "styles/viewer/routines.css", selector: ".app .status-pill, .app .op-waiting, .app .assistant-footer", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".app .status-pill, .app .op-waiting, .app .assistant-footer preserves a square join at the adjoining edge" },
  { path: "styles/viewer/routines.css", selector: ".app .thinking-block", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".app .thinking-block preserves a square join at the adjoining edge" },
  { path: "styles/viewer/routines.css", selector: ".app .ws-body", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".app .ws-body preserves a square join at the adjoining edge" },
  { path: "styles/viewer/routines.css", selector: ".project-actions-spinner", property: "animation", kind: "duration", literal: "0.8s", count: 1, reason: ".project-actions-spinner drives a functional progress or feedback animation at 0.8s" },
  { path: "styles/viewer/routines.css", selector: ".project-actions-spinner", property: "border-radius", kind: "radius", literal: "50%", count: 1, reason: ".project-actions-spinner preserves circular geometry with a percentage radius" },
  { path: "styles/viewer/routines.css", selector: ".project-ds-picker-option-swatch", property: "border-radius", kind: "radius", literal: "3px", count: 1, reason: ".project-ds-picker-option-swatch retains its intentional component geometry at 3px" },
  { path: "styles/viewer/templates-plugins.css", selector: ".mcp-oauth-dot-pending", property: "animation", kind: "duration", literal: "1.2s", count: 1, reason: ".mcp-oauth-dot-pending drives a functional progress or feedback animation at 1.2s" },
  { path: "styles/viewer/templates-plugins.css", selector: ".mcp-oauth-dot", property: "border-radius", kind: "radius", literal: "50%", count: 1, reason: ".mcp-oauth-dot preserves circular geometry with a percentage radius" },
  { path: "styles/viewer/templates-plugins.css", selector: ".mcp-row-info", property: "border-radius", kind: "radius", literal: "0", count: 2, reason: ".mcp-row-info preserves a square join at the adjoining edge" },
  { path: "styles/viewer/templates-plugins.css", selector: ".plugin-details-modal__avatar", property: "border-radius", kind: "radius", literal: "50%", count: 1, reason: ".plugin-details-modal__avatar preserves circular geometry with a percentage radius" },
  { path: "styles/viewer/templates-plugins.css", selector: ".plugin-details-modal__hero-dot", property: "border-radius", kind: "radius", literal: "50%", count: 1, reason: ".plugin-details-modal__hero-dot preserves circular geometry with a percentage radius" },
  { path: "styles/viewer/templates-plugins.css", selector: ".plugin-details-modal__hero-light", property: "border-radius", kind: "radius", literal: "50%", count: 1, reason: ".plugin-details-modal__hero-light preserves circular geometry with a percentage radius" },
  { path: "styles/viewer/templates-plugins.css", selector: ".plugin-details-modal__use-caret", property: "border-bottom-left-radius", kind: "radius", literal: "0", count: 1, reason: ".plugin-details-modal__use-caret preserves a square join at the adjoining edge" },
  { path: "styles/viewer/templates-plugins.css", selector: ".plugin-details-modal__use-caret", property: "border-top-left-radius", kind: "radius", literal: "0", count: 1, reason: ".plugin-details-modal__use-caret preserves a square join at the adjoining edge" },
  { path: "styles/viewer/templates-plugins.css", selector: ".plugin-details-modal__use-main", property: "border-bottom-right-radius", kind: "radius", literal: "0", count: 1, reason: ".plugin-details-modal__use-main preserves a square join at the adjoining edge" },
  { path: "styles/viewer/templates-plugins.css", selector: ".plugin-details-modal__use-main", property: "border-top-right-radius", kind: "radius", literal: "0", count: 1, reason: ".plugin-details-modal__use-main preserves a square join at the adjoining edge" },
  { path: "styles/viewer/templates-plugins.css", selector: ".plugin-details-modal", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".plugin-details-modal preserves a square join at the adjoining edge" },
  { path: "styles/viewer/templates-plugins.css", selector: ".plugin-info-pane .plugin-details-modal__byline", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".plugin-info-pane .plugin-details-modal__byline preserves a square join at the adjoining edge" },
  { path: "styles/viewer/templates-plugins.css", selector: ".plugin-loop-home__active-dot", property: "border-radius", kind: "radius", literal: "50%", count: 1, reason: ".plugin-loop-home__active-dot preserves circular geometry with a percentage radius" },
  { path: "styles/viewer/templates-plugins.css", selector: ".plugin-loop-home__card-avatar", property: "border-radius", kind: "radius", literal: "50%", count: 1, reason: ".plugin-loop-home__card-avatar preserves circular geometry with a percentage radius" },
  { path: "styles/viewer/templates-plugins.css", selector: ".settings-skills .skills-row::before", property: "border-radius", kind: "radius", literal: "0", count: 2, reason: ".settings-skills .skills-row::before preserves a square join at the adjoining edge" },
  { path: "styles/viewer/theater.css", selector: ".assistant-feedback-burst span:nth-child(2)", property: "animation-delay", kind: "duration", literal: "25ms", count: 1, reason: ".assistant-feedback-burst span:nth-child(2) keeps the intentional stagger timing at 25ms" },
  { path: "styles/viewer/theater.css", selector: ".assistant-feedback-burst span:nth-child(3)", property: "animation-delay", kind: "duration", literal: "45ms", count: 1, reason: ".assistant-feedback-burst span:nth-child(3) keeps the intentional stagger timing at 45ms" },
  { path: "styles/viewer/theater.css", selector: ".assistant-feedback-burst span:nth-child(4)", property: "animation-delay", kind: "duration", literal: "65ms", count: 1, reason: ".assistant-feedback-burst span:nth-child(4) keeps the intentional stagger timing at 65ms" },
  { path: "styles/viewer/theater.css", selector: ".assistant-feedback-burst span:nth-child(5)", property: "animation-delay", kind: "duration", literal: "85ms", count: 1, reason: ".assistant-feedback-burst span:nth-child(5) keeps the intentional stagger timing at 85ms" },
  { path: "styles/viewer/theater.css", selector: ".assistant-feedback-burst span:nth-child(6)", property: "animation-delay", kind: "duration", literal: "105ms", count: 1, reason: ".assistant-feedback-burst span:nth-child(6) keeps the intentional stagger timing at 105ms" },
  { path: "styles/viewer/theater.css", selector: ".assistant-feedback-burst span", property: "animation", kind: "duration", literal: "620ms", count: 1, reason: ".assistant-feedback-burst span drives a functional progress or feedback animation at 620ms" },
  { path: "styles/viewer/theater.css", selector: ".assistant-feedback-burst span", property: "border-radius", kind: "radius", literal: "50%", count: 1, reason: ".assistant-feedback-burst span preserves circular geometry with a percentage radius" },
  { path: "styles/viewer/theater.css", selector: ".deck-thumbnail-loading::after", property: "animation", kind: "duration", literal: "1.05s", count: 1, reason: ".deck-thumbnail-loading::after drives a functional progress or feedback animation at 1.05s" },
  { path: "styles/viewer/theater.css", selector: ".pet-sprite-glyph", property: "animation", kind: "duration", literal: "3.4s", count: 1, reason: ".pet-sprite-glyph drives a functional progress or feedback animation at 3.4s" },
  { path: "styles/viewer/theater.css", selector: ".pet-sprite-shadow", property: "animation", kind: "duration", literal: "3.4s", count: 1, reason: ".pet-sprite-shadow drives a functional progress or feedback animation at 3.4s" },
  { path: "styles/viewer/theater.css", selector: ".pet-sprite-shadow", property: "border-radius", kind: "radius", literal: "50%", count: 1, reason: ".pet-sprite-shadow preserves circular geometry with a percentage radius" },
  { path: "styles/viewer/theater.css", selector: ".preview-viewport-mobile.comment-preview-layer-with-deck-rail", property: "--deck-device-frame-radius", kind: "radius", literal: "28px", count: 1, reason: ".preview-viewport-mobile.comment-preview-layer-with-deck-rail preserves functional layout geometry at 28px" },
  { path: "styles/viewer/theater.css", selector: ".preview-viewport:not(.preview-viewport-desktop).comment-preview-layer-with-deck-rail .comment-preview-canvas", property: "border-radius", kind: "radius", literal: "0", count: 2, reason: ".preview-viewport:not(.preview-viewport-desktop).comment-preview-layer-with-deck-rail .comment-preview-canvas preserves a square join at the adjoining edge" },
  { path: "styles/viewer/theater.css", selector: ".preview-viewport:not(.preview-viewport-desktop).comment-preview-layer-with-deck-rail .deck-thumbnail-rail", property: "border-radius", kind: "radius", literal: "0", count: 2, reason: ".preview-viewport:not(.preview-viewport-desktop).comment-preview-layer-with-deck-rail .deck-thumbnail-rail preserves a square join at the adjoining edge" },
  { path: "styles/viewer/theater.css", selector: ".preview-viewport:not(.preview-viewport-desktop).comment-preview-layer-with-deck-rail", property: "--deck-device-frame-radius", kind: "radius", literal: "18px", count: 1, reason: ".preview-viewport:not(.preview-viewport-desktop).comment-preview-layer-with-deck-rail preserves functional layout geometry at 18px" },
  { path: "styles/viewer/theater.css", selector: ".speaker-notes-editor textarea", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".speaker-notes-editor textarea preserves a square join at the adjoining edge" },
  { path: "styles/viewer/theater.css", selector: ".speaker-notes-header-status.saved", property: "animation", kind: "duration", literal: "4.2s", count: 1, reason: ".speaker-notes-header-status.saved drives a functional progress or feedback animation at 4.2s" },
  { path: "styles/viewer/theater.css", selector: ".theater-lane-round-dim", property: "border-radius", kind: "radius", literal: "50%", count: 1, reason: ".theater-lane-round-dim preserves circular geometry with a percentage radius" },
  { path: "styles/viewer/theater.css", selector: ".theater-score-tick", property: "border-radius", kind: "radius", literal: "2px", count: 1, reason: ".theater-score-tick retains its intentional component geometry at 2px" },
  { path: "styles/viewer/tools.css", selector: ".chrome-action-export.export-ready-nudge", property: "animation", kind: "duration", literal: "1200ms", count: 1, reason: ".chrome-action-export.export-ready-nudge drives a functional progress or feedback animation at 1200ms" },
  { path: "styles/viewer/tools.css", selector: ".produced-files", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".produced-files preserves a square join at the adjoining edge" },
  { path: "styles/workspace/connectors.css", selector: ".connector-logo.state-pending .connector-logo-fallback", property: "animation", kind: "duration", literal: "1400ms", count: 1, reason: ".connector-logo.state-pending .connector-logo-fallback drives a functional progress or feedback animation at 1400ms" },
  { path: "styles/workspace/connectors.css", selector: ".entry-tab", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".entry-tab preserves a square join at the adjoining edge" },
  { path: "styles/workspace/drawer.css", selector: ".connector-drawer", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".connector-drawer preserves a square join at the adjoining edge" },
  { path: "styles/workspace/drawer.css", selector: ".design-card-thumb::after", property: "border-radius", kind: "radius", literal: "0", count: 2, reason: ".design-card-thumb::after preserves a square join at the adjoining edge" },
  { path: "styles/workspace/drawer.css", selector: ".design-kanban-card::before", property: "border-radius", kind: "radius", literal: "0", count: 2, reason: ".design-kanban-card::before preserves a square join at the adjoining edge" },
  { path: "styles/workspace/drawer.css", selector: ".subtab-pill button", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".subtab-pill button preserves a square join at the adjoining edge" },
  { path: "styles/workspace/mention-home.css", selector: ".orbit-config-gate-ring-inner", property: "animation", kind: "duration", literal: "16s", count: 1, reason: ".orbit-config-gate-ring-inner drives a functional progress or feedback animation at 16s" },
  { path: "styles/workspace/mention-home.css", selector: ".orbit-config-gate-ring-outer", property: "animation", kind: "duration", literal: "22s", count: 1, reason: ".orbit-config-gate-ring-outer drives a functional progress or feedback animation at 22s" },
  { path: "styles/workspace/mention-home.css", selector: ".orbit-state-pill.orbit-state-active .orbit-state-dot", property: "animation", kind: "duration", literal: "2.4s", count: 1, reason: ".orbit-state-pill.orbit-state-active .orbit-state-dot drives a functional progress or feedback animation at 2.4s" },
  { path: "styles/workspace/mention-home.css", selector: ".protocol-chip.active .media-provider-chip-status", property: "animation", kind: "duration", literal: "2.4s", count: 1, reason: ".protocol-chip.active .media-provider-chip-status drives a functional progress or feedback animation at 2.4s" },
  { path: "styles/workspace/mention-home.css", selector: ".settings-page-shell .modal-settings.settings-page-surface", property: "border-radius", kind: "radius", literal: "0", count: 1, reason: ".settings-page-shell .modal-settings.settings-page-surface preserves a square join at the adjoining edge" },
];

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
      if (/(?:radius|shape-corner)/i.test(declaration.property)) {
        for (const match of declaration.value.matchAll(/(?:\d+(?:\.\d+)?(?:px|rem|em|%))|\b0\b/g)) {
          findings.push({ path, selector: block.selector, property: declaration.property, kind: 'radius', literal: match[0] });
        }
      }
      if (/(?:duration|transition|animation)/i.test(declaration.property)) {
        for (const match of declaration.value.matchAll(/\b\d+(?:\.\d+)?(?:ms|s)\b/g)) {
          findings.push({ path, selector: block.selector, property: declaration.property, kind: 'duration', literal: match[0] });
        }
      }
      if (/(?:transition|animation|timing-function|curve|easing|motion)/i.test(declaration.property)) {
        for (const match of declaration.value.matchAll(/cubic-bezier\([^)]*\)/g)) {
          findings.push({ path, selector: block.selector, property: declaration.property, kind: 'curve', literal: match[0] });
        }
      }
    }
  }
  return findings;
}

export function findUnledgeredCssLiterals(path: string, source: string): CssLiteralFinding[] {
  const ledger = new Set(CSS_LITERAL_EXCEPTION_LEDGER.map(cssFindingKey));
  return scanCssLiterals(source, path).filter((finding) => !ledger.has(cssFindingKey(finding)));
}

function cssFindingKey(finding: CssLiteralFinding): string {
  return [finding.path, finding.selector, finding.property, finding.kind, finding.literal].join('|');
}

function assertCssDiscovery(actual: readonly string[], expected: readonly string[]): void {
  expect(new Set(actual).size).toBe(actual.length);
  expect([...actual].sort()).toEqual([...expected].sort());
}

const DECLARED_CSS_SOURCE_INVENTORY = MODIFICATIONS_WEB_SOURCE_INVENTORY.filter((path) =>
  path.endsWith('.css'),
);

function currentDeclaredCssFindings(): CssLiteralFinding[] {
  return DECLARED_CSS_SOURCE_INVENTORY.flatMap((path) => {
    const absolute = resolve(WEB_ROOT, 'src', path);
    return existsSync(absolute) ? scanCssLiterals(readFileSync(absolute, 'utf8'), path) : [];
  });
}

function countedFindingKeys(findings: readonly CssLiteralFinding[]): string[] {
  const counts = new Map<string, number>();
  for (const finding of findings) {
    const key = cssFindingKey(finding);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts, ([key, count]) => `${key}|${count}`).sort();
}

function assertCssLiteralLedger(
  findings: readonly CssLiteralFinding[],
  ledger: readonly CssLiteralException[],
): void {
  expect(ledger.every((entry) => entry.reason.trim().length > 0)).toBe(true);
  expect(countedFindingKeys(findings)).toEqual(
    ledger.map((entry) => `${cssFindingKey(entry)}|${entry.count}`).sort(),
  );
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
    expect(root).toContain('--md-sys-motion-duration-compatibility-reduced-motion: 80ms;');
    expect(root).toContain('--md-sys-motion-duration-compatibility-export-ready-feedback: 1600ms;');
  });

  it('declares standard, emphasized, and linear curve names', () => {
    expect(root).toContain('--md-sys-motion-linear: cubic-bezier(0, 0, 1, 1);');
    expect(root).toContain('--md-sys-motion-standard: cubic-bezier(.2, 0, 0, 1);');
    expect(root).toContain('--md-sys-motion-standard-accelerate: cubic-bezier(.3, 0, 1, 1);');
    expect(root).toContain('--md-sys-motion-standard-decelerate: cubic-bezier(0, 0, .2, 1);');
    expect(root).toContain('--md-sys-motion-emphasized-accelerate: cubic-bezier(.3, 0, .8, .15);');
    expect(root).toContain('--md-sys-motion-emphasized-decelerate: cubic-bezier(.05, .7, .1, 1);');
    expect(root).toContain('--md-sys-motion-compatibility-ease-in-out: cubic-bezier(.42, 0, .58, 1);');
    expect(root).toContain('--md-sys-motion-compatibility-ease-out: cubic-bezier(.23, 1, .32, 1);');
    expect(root).toContain('--md-sys-motion-compatibility-decelerate-mid: cubic-bezier(0, 0, 0, 1);');
  });

  it('makes the later winning compatibility block canonical', () => {
    const roots = Array.from(
      compatibilityTokens.matchAll(/:root\s*\{([\s\S]*?)\}/g),
      (match) => match[1],
    );
    const winning = roots.at(-1) ?? '';
    expect(roots.length).toBeGreaterThanOrEqual(2);
    expect(winning).toContain('--radius-none: var(--md-sys-shape-corner-none);');
    expect(winning).toContain('--radius-small: var(--od-compat-radius-xxs);');
    expect(winning).toContain('--radius-medium: var(--md-sys-shape-corner-xs);');
    expect(winning).toContain('--radius-large: var(--md-sys-shape-corner-s);');
    expect(winning).toContain('--radius-xlarge: var(--md-sys-shape-corner-m);');
    expect(winning).toContain('--radius-circular: var(--od-compat-radius-circular);');
    expect(winning).toContain('--radius-xs: var(--od-compat-radius-xxs);');
    expect(winning).toContain('--radius-sm: var(--md-sys-shape-corner-xs);');
    expect(winning).toContain('--radius: var(--md-sys-shape-corner-s);');
    expect(winning).toContain('--radius-md: var(--md-sys-shape-corner-s);');
    expect(winning).toContain('--radius-lg: var(--md-sys-shape-corner-m);');
    expect(winning).toContain('--radius-pill: var(--od-compat-radius-pill);');
    expect(winning).toContain('--duration-ultra-fast: var(--md-sys-motion-duration-short1);');
    expect(winning).toContain('--duration-ultra-slow: var(--md-sys-motion-duration-long2);');
    expect(winning).toContain('--curve-linear: var(--md-sys-motion-linear);');
    expect(winning).toContain('--curve-easy-ease: var(--md-sys-motion-compatibility-easy-ease);');
    expect(winning).toContain('--ease-out: var(--md-sys-motion-compatibility-decelerate-mid);');
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
  it('contains exactly 215 unique declarations with six intentional absences', () => {
    assertSourceInventory(MODIFICATIONS_WEB_SOURCE_INVENTORY);
  });

  it('turns red when an inventory member is removed', () => {
    expect(() => assertSourceInventory(MODIFICATIONS_WEB_SOURCE_INVENTORY.slice(0, -1))).toThrow();
  });

  it('turns red when a present source path disappears from disk', () => {
    const missingPath = MODIFICATIONS_WEB_SOURCE_INVENTORY.find(
      (path) => !INTENTIONAL_ABSENT_WEB_SOURCE_PATHS.includes(path as never),
    );
    expect(missingPath).toBeDefined();
    expect(() => assertSourceInventory(
      MODIFICATIONS_WEB_SOURCE_INVENTORY,
      (path) => path !== missingPath && existsSync(resolve(WEB_ROOT, 'src', path)),
    )).toThrow();
  });
});

describe('the brace-aware CSS literal audit', () => {
  it('discovers exactly 72 declared CSS files, including 70 present component and style sheets', () => {
    const modificationsCss = relevantModificationsInventory().filter((path) => path.endsWith('.css'));
    expect(DECLARED_CSS_SOURCE_INVENTORY).toHaveLength(72);
    assertCssDiscovery(DECLARED_CSS_SOURCE_INVENTORY, modificationsCss);
    const present = DECLARED_CSS_SOURCE_INVENTORY.filter((path) =>
      existsSync(resolve(WEB_ROOT, 'src', path)),
    );
    expect(present).toHaveLength(70);
    expect(DECLARED_CSS_SOURCE_INVENTORY.filter((path) => !present.includes(path))).toEqual([
      'components/AmrArtifactUpgradeDialog.module.css',
      'components/AmrArtifactUpgradeHomeCard.module.css',
    ]);
  });

  it('scans nested at-rules and accepts only the reviewed baseline', () => {
    const nested = `@media (min-width: 1px) {\n  .nested-surface {\n    border-radius: 8px;\n    transition: opacity 120ms cubic-bezier(.2, 0, 0, 1);\n  }\n}`;
    const findings = scanCssLiterals(nested, 'test/nested.css');
    expect(findings).toEqual([
      { path: 'test/nested.css', selector: '.nested-surface', property: 'border-radius', kind: 'radius', literal: '8px' },
      { path: 'test/nested.css', selector: '.nested-surface', property: 'transition', kind: 'duration', literal: '120ms' },
      {
        path: 'test/nested.css',
        selector: '.nested-surface',
        property: 'transition',
        kind: 'curve',
        literal: 'cubic-bezier(.2, 0, 0, 1)',
      },
    ]);
    expect(findUnledgeredCssLiterals('test/nested.css', nested)).toHaveLength(3);
  }, 30_000);

  it('keeps the static exception ledger exact and rejects stale entries', () => {
    const findings = currentDeclaredCssFindings();
    expect(CSS_LITERAL_EXCEPTION_LEDGER).toHaveLength(284);
    expect(CSS_LITERAL_EXCEPTION_LEDGER.reduce((total, entry) => total + entry.count, 0)).toBe(316);
    assertCssLiteralLedger(findings, CSS_LITERAL_EXCEPTION_LEDGER);
    expect(() => assertCssLiteralLedger(findings, CSS_LITERAL_EXCEPTION_LEDGER.slice(1))).toThrow();
    expect(() => assertCssLiteralLedger(findings, CSS_LITERAL_EXCEPTION_LEDGER)).not.toThrow();
    expect(() => assertCssLiteralLedger(findings, [
      ...CSS_LITERAL_EXCEPTION_LEDGER,
      { ...CSS_LITERAL_EXCEPTION_LEDGER[0], selector: '.stale-ledger-entry' },
    ])).toThrow();
  });

  it('rejects comments, descendants, and renamed selectors as exact mismatches', () => {
    const entry = CSS_LITERAL_EXCEPTION_LEDGER[0];
    const declaration = `${entry.property}: ${entry.literal};`;
    expect(findUnledgeredCssLiterals(
      entry.path,
      `${entry.selector} { ${declaration} }`,
    )).toEqual([]);
    expect(findUnledgeredCssLiterals(
      entry.path,
      `/* ${entry.selector} { ${declaration} } */`,
    )).toEqual([]);
    expect(findUnledgeredCssLiterals(
      entry.path,
      `${entry.selector} .child { ${declaration} }`,
    )).toHaveLength(1);
    expect(findUnledgeredCssLiterals(
      entry.path,
      `${entry.selector}-renamed { ${declaration} }`,
    )).toHaveLength(1);
  });

  it('turns red when a discovered CSS registry member is added or removed', () => {
    expect(() => assertCssDiscovery(
      [...DECLARED_CSS_SOURCE_INVENTORY, 'styles/__unregistered__.css'],
      DECLARED_CSS_SOURCE_INVENTORY,
    )).toThrow();
    expect(() => assertCssDiscovery(
      DECLARED_CSS_SOURCE_INVENTORY.slice(1),
      DECLARED_CSS_SOURCE_INVENTORY,
    )).toThrow();
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
