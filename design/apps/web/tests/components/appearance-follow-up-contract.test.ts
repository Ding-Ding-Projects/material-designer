// @vitest-environment jsdom

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { applyAppearanceStateToElement, defaultAppearanceStyle, serializeElementAppearance } from '../../src/components/appearance/elementAppearance';
import { validateAppearanceExport } from '../../src/components/appearance/appearanceExportSchema';

const ROOT = new URL('../../', import.meta.url);

function source(path: string): string {
  return readFileSync(new URL(path, ROOT), 'utf8');
}

const SETTINGS = source('src/components/SettingsDialog.tsx');
const TABS = source('src/components/settings/SettingsTabStrip.tsx');
const PALETTE = source('src/components/command-palette/CommandPalette.tsx');
const COMMANDS = source('src/components/command-palette/commands.ts');
const PICKER = source('src/components/appearance/InfiniteColorPicker.tsx');

/**
 * Hand-written source inventory for the cross-surface follow-up. Executable
 * data and renderer regressions live below; source strings are not used as a
 * substitute for invoking production behavior.
 */
const BOUNDARIES = [
  ['settings-visible-tabs', SETTINGS, "tab.section !== 'workspace' || showWorkspaceSettings"],
  ['settings-hidden-workspace-fallback', SETTINGS, "selectSettingsSection('execution')"],
  ['palette-workspace-filter', COMMANDS, "entry.section === 'workspace' && ctx.workspaceSettingsVisible === false"],
  ['palette-workspace-capability', PALETTE, 'workspaceSettingsVisible = canShowWorkspaceSettings(workspaceContext)'],
  ['tab-no-match-description', TABS, "aria-describedby={count === 0 ? `${hintId} ${noMatchId}` : hintId}"],
  ['color-2d-value', PICKER, 'aria-valuetext={fieldValueText}'],
] as const;

describe('appearance follow-up source boundaries', () => {
  it.each(BOUNDARIES)('keeps the %s boundary', (_id, text, needle) => {
    expect(text).toContain(needle);
  });

  it('refuses malformed appearance data at the production validator and renderer seams', () => {
    const exported = JSON.parse(serializeElementAppearance('appearance:follow-up')) as Record<string, any>;
    exported.appearance.states.normal.fontSize = Number.NaN;
    const result = validateAppearanceExport(exported);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issue.code).toBe('non-finite-number');

    const target = document.createElement('button');
    target.style.color = 'rebeccapurple';
    const invalidStyle = defaultAppearanceStyle();
    invalidStyle.fontSize = Number.NaN;
    applyAppearanceStateToElement(target, invalidStyle);
    expect(target.style.color).toBe('rebeccapurple');
  });

  it('keeps the settings panel on a horizontal flex flow', () => {
    const css = source('src/styles/workspace/mention-home.css');
    expect(css).toContain('.modal-settings .modal-body');
    expect(css).toContain('flex-direction: column;');
    expect(css).not.toContain('grid-template-columns: 240px minmax(0, 1fr);');
    expect(css).not.toContain('grid-template-columns: 272px minmax(0, 1fr);');
  });
});
