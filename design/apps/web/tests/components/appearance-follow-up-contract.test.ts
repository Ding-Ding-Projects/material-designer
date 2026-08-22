import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

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
 * Hand-written boundary inventory. Each entry has a deliberately exact needle
 * and a mutation probe: removing the boundary must make the assertion red,
 * rather than letting a neighbouring symbol or comment satisfy a loose scan.
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

  it.each(BOUNDARIES)('turns red when the %s boundary is removed', (_id, text, needle) => {
    const broken = text.replace(needle, '');
    expect(broken).not.toContain(needle);
  });

  it('keeps the settings panel on a horizontal flex flow', () => {
    const css = source('src/styles/workspace/mention-home.css');
    expect(css).toContain('.modal-settings .modal-body');
    expect(css).toContain('flex-direction: column;');
    expect(css).not.toContain('grid-template-columns: 240px minmax(0, 1fr);');
    expect(css).not.toContain('grid-template-columns: 272px minmax(0, 1fr);');
  });
});
