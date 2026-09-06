// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const seam = vi.hoisted(() => ({ host: null as unknown }));
vi.mock('@open-design/host', () => ({ getOpenDesignHost: () => seam.host }));
vi.mock('../../src/i18n', () => ({ useI18n: () => ({ setLocale: vi.fn(), setLanguageMode: vi.fn(), setFunnyLevel: vi.fn() }) }));
vi.mock('../../src/components/narrator/narrator', () => ({ useNarrator: () => ({ preferences: {}, setPreferences: vi.fn(), narrate: vi.fn() }) }));
vi.mock('../../src/components/regex/RegexSearchField', () => ({ RegexSearchField: () => null }));
vi.mock('../../src/components/regex/useRegexSearch', () => ({ useRegexSearch: () => ({ query: '', setQuery: vi.fn(), matches: () => true, test: () => true }) }));
vi.mock('../../src/components/ToyLockAuthenticationPopover', () => ({ ToyLockAuthenticationPopover: () => null }));
vi.mock('../../src/components/destructive/DestructiveGate', () => ({ DestructiveGate: () => null }));
import { UniversalSettingsRuntime } from '../../src/components/universal-settings/UniversalSettingsRuntime';
import { UNIVERSAL_SETTINGS_RECOVERY_HISTORY_KEY } from '../../src/components/universal-settings/universalSettings';
import { UniversalSettingsPanel } from '../../src/components/universal-settings/UniversalSettingsPanel';
import { createDefaultUniversalSettings, createScheduleRule, hydrateUniversalSettingsFromHost, persistUniversalSettingsRecovery, readUniversalSettingsRecovery, readUniversalSettingsRecoveryHistory, resolveUniversalSettingsRecovery, UNIVERSAL_SETTINGS_STORAGE_KEY, writeUniversalSettingsPatch, type UniversalSettingsHostBridge } from '../../src/components/universal-settings/universalSettings';
function host(initial = createDefaultUniversalSettings()) {
  let state = { ...initial, revision: 5 };
  const bridge: UniversalSettingsHostBridge = {
    read: vi.fn(async () => ({ ok: true as const, state })),
    write: vi.fn(async (next, expected) => {
      expect(expected).toBe(state.revision);
      state = next;
      return { ok: true as const, state };
    }),
    subscribe: () => () => undefined,
    resolveSchedule: async () => ({ ok: false, code: 'unavailable' }),
    setHomeAssistantToken: async () => ({ ok: false, code: 'unavailable' }),
    clearHomeAssistantToken: async () => ({ ok: false, code: 'unavailable' }),
  };
  seam.host = { universalSettings: bridge };
  window.localStorage.setItem(UNIVERSAL_SETTINGS_STORAGE_KEY, JSON.stringify(state));
  return { bridge, state: () => state };
}
beforeEach(() => { window.localStorage.clear(); seam.host = null; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe('mounted preference recovery controls', () => {
  it('keeps enabled and name edits from two stale School panels', async () => {
    const fixture = host();
    const views = render(<><UniversalSettingsPanel initialSection="school" /><UniversalSettingsPanel initialSection="school" /></>);
    await act(async () => {});
    const panels = views.getAllByTestId('universal-settings-panel');
    act(() => {
      fireEvent.click(panels[0]!.querySelector('[data-od-setting="universal.schoolMode"] input')!);
      fireEvent.change(panels[1]!.querySelector('[data-od-setting="universal.schoolName"] input')!, { target: { value: 'Study time' } });
    });
    await waitFor(() => expect(fixture.bridge.write).toHaveBeenCalledTimes(2));
    expect(fixture.state().school).toMatchObject({ enabled: true, name: 'Study time' });
  });
  for (const decision of ['Apply local recovery', 'Keep host settings']) {
    it(`${decision} operates the mounted button once across two panels`, async () => {
      const fixture = host();
      persistUniversalSettingsRecovery({ ...fixture.state(), displayName: 'Recovered workspace' }, 1);
      render(<><UniversalSettingsPanel initialSection="school" /><UniversalSettingsPanel initialSection="school" /></>);
      await waitFor(() => expect(screen.getAllByRole('button', { name: decision })).toHaveLength(2));
      fireEvent.click(screen.getAllByRole('button', { name: decision })[0]!);
      await waitFor(() => expect(fixture.state().displayName).toBe(decision === 'Apply local recovery' ? 'Recovered workspace' : 'Material Designer'));
      await act(async () => {});
      expect(fixture.bridge.write).toHaveBeenCalledTimes(decision === 'Apply local recovery' ? 1 : 0);
      expect(readUniversalSettingsRecoveryHistory().at(-1)?.state).toBe(decision === 'Apply local recovery' ? 'accepted' : 'kept-host');
      await hydrateUniversalSettingsFromHost(fixture.bridge);
      expect(fixture.bridge.write).toHaveBeenCalledTimes(decision === 'Apply local recovery' ? 1 : 0);
    });
  }
});
describe('field and rule identity mutations', () => {
  it('uses the same coordinator through the compatibility import', async () => {
    const compatibility = await import('../../src/components/universal/universalSettings');
    expect(compatibility.writeUniversalSettingsPatch).toBe(writeUniversalSettingsPatch);
  });
  it('merges concurrent ADHD and narrator field edits', async () => {
    const fixture = host();
    await Promise.all([writeUniversalSettingsPatch({ adhd: { focus: true }, narrator: { rate: 1.5 } }), writeUniversalSettingsPatch({ adhd: { oneThing: true }, narrator: { pitch: 1.2 } })]);
    expect(fixture.state().adhd).toMatchObject({ focus: true, oneThing: true });
    expect(fixture.state().narrator).toMatchObject({ rate: 1.5, pitch: 1.2 });
  });
  it('merges edits and additions by stable schedule identity', async () => {
    const first = createScheduleRule(); const second = createScheduleRule();
    const fixture = host({ ...createDefaultUniversalSettings(), schedules: [first] });
    await Promise.all([
      writeUniversalSettingsPatch({ scheduleMutations: [{ kind: 'edit', id: first.id, patch: { values: { theme: 'dark' } } }] }),
      writeUniversalSettingsPatch({ scheduleMutations: [{ kind: 'add', rule: second }, { kind: 'edit', id: first.id, patch: { label: 'Evening', values: { density: 'compact' } } }] }),
    ]);
    expect(fixture.state().schedules).toHaveLength(2);
    expect(fixture.state().schedules[0]).toMatchObject({ label: 'Evening', values: { theme: 'dark', density: 'compact' } });
  });
  it('retains every edit through unavailable service and explicit reconnect resolution', async () => {
    const fixture = host();
    vi.mocked(fixture.bridge.read).mockRejectedValue(new Error('offline'));
    await writeUniversalSettingsPatch({ school: { name: 'Study time' } });
    await writeUniversalSettingsPatch({ adhd: { focus: true } });
    expect(readUniversalSettingsRecovery()?.localState).toMatchObject({ school: { name: 'Study time' }, adhd: { focus: true } });
    vi.mocked(fixture.bridge.read).mockResolvedValue({ ok: true, state: fixture.state() });
    await hydrateUniversalSettingsFromHost(fixture.bridge);
    expect(fixture.bridge.write).toHaveBeenCalledTimes(0);
    await resolveUniversalSettingsRecovery(fixture.bridge, 'apply-local');
    expect(fixture.state()).toMatchObject({ school: { name: 'Study time' }, adhd: { focus: true } });
  });
  it('retains reviewed host-choice history after a later successful edit', async () => {
    const fixture = host();
    persistUniversalSettingsRecovery({ ...fixture.state(), displayName: 'Saved local' }, 1);
    await resolveUniversalSettingsRecovery(fixture.bridge, 'keep-host');
    await writeUniversalSettingsPatch({ density: 'compact' });
    expect(fixture.state()).toMatchObject({ displayName: 'Material Designer', density: 'compact' });
    expect(readUniversalSettingsRecoveryHistory().at(-1)?.localState.displayName).toBe('Saved local');
  });
});


describe('reviewed recovery rejection boundaries', () => {
  it('composes edits into the existing journal while the bridge disappears', async () => {
    const fixture = host();
    persistUniversalSettingsRecovery({ ...fixture.state(), school: { ...fixture.state().school, name: 'Study time' } }, 1);
    await hydrateUniversalSettingsFromHost(fixture.bridge);
    expect(readUniversalSettingsRecovery()?.state).toBe('conflict');
    seam.host = null;
    await writeUniversalSettingsPatch({ adhd: { focus: true } });
    expect(readUniversalSettingsRecovery()).toMatchObject({ state: 'conflict', baseRevision: 1, localState: { school: { name: 'Study time' }, adhd: { focus: true } } });
    seam.host = { universalSettings: fixture.bridge };
    await resolveUniversalSettingsRecovery(fixture.bridge, 'apply-local');
    expect(fixture.state()).toMatchObject({ school: { name: 'Study time' }, adhd: { focus: true } });
  });
  it('removes an existing emoji marker on the mounted School mode transition', async () => {
    window.localStorage.setItem(UNIVERSAL_SETTINGS_STORAGE_KEY, JSON.stringify({ ...createDefaultUniversalSettings(), showDialogEmoji: true }));
    render(<><UniversalSettingsRuntime /><div role="dialog"><h2>Details</h2></div></>);
    await waitFor(() => expect(document.querySelector('[data-universal-dialog-emoji-marker]')).not.toBeNull());
    await act(async () => { await writeUniversalSettingsPatch({ school: { enabled: true } }); });
    await waitFor(() => expect(document.querySelector('[data-universal-dialog-emoji-marker]')).toBeNull());
    expect(JSON.parse(window.localStorage.getItem(UNIVERSAL_SETTINGS_STORAGE_KEY)!).showDialogEmoji).toBe(true);
    await act(async () => { await writeUniversalSettingsPatch({ school: { enabled: false } }); });
    await waitFor(() => expect(document.querySelector('[data-universal-dialog-emoji-marker]')).not.toBeNull());
  });
  for (const decision of ['Apply local recovery', 'Keep host settings']) {
    for (const failure of ['QuotaExceededError', 'SecurityError']) {
      it(`${decision} reports persistent ${failure} without discarding recovery`, async () => {
        const fixture = host();
        persistUniversalSettingsRecovery({ ...fixture.state(), displayName: 'Retained local' }, 1);
        render(<UniversalSettingsPanel initialSection="school" />);
        const button = await screen.findByRole('button', { name: decision });
        const journalBefore = readUniversalSettingsRecovery();
        const original = Storage.prototype.setItem;
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
          if (key === UNIVERSAL_SETTINGS_RECOVERY_HISTORY_KEY) throw new DOMException('Storage unavailable', failure);
          return original.call(this, key, value);
        });
        fireEvent.click(button);
        await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Recovery history could not be saved'));
        expect(fixture.bridge.write).toHaveBeenCalledTimes(0);
        expect(readUniversalSettingsRecovery()).toEqual(journalBefore);
        expect(button.hasAttribute('disabled')).toBe(false);
        await act(async () => {});
        expect(screen.getByRole('alert').textContent).toContain('Recovery history could not be saved');
      });
    }
  }
});
