import { describe, expect, it } from 'vitest';

import {
  SETTINGS_INDEX,
  SETTINGS_SECTION_TOKENS,
  sectionAnchorFor,
} from '../../src/components/command-palette/settingsIndex';
import {
  SETTINGS_TAB_DEFS,
  SETTINGS_TAB_ORDER,
  isRestorableSettingsSection,
} from '../../src/components/settings/settingsTabs';

describe('settings handoff destination', () => {
  it('is a virtual tab and search/palette destination, never a restorable tab', () => {
    expect(SETTINGS_SECTION_TOKENS.handoff).toBe(true);
    expect(SETTINGS_TAB_DEFS.handoff?.section).toBe('handoff');
    expect(SETTINGS_TAB_ORDER).toContain('handoff');
    expect(isRestorableSettingsSection('handoff')).toBe(false);
    expect(SETTINGS_INDEX).toContainEqual(expect.objectContaining({
      id: sectionAnchorFor('handoff'),
      section: 'handoff',
    }));
  });
});
