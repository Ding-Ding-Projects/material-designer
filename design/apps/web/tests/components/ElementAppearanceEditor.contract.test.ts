// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  APPEARANCE_CAPABILITIES,
  APPEARANCE_STATES,
  applyAppearanceStateToElement,
  copyAppearanceStyle,
  defaultAppearanceStyle,
  defaultElementAppearance,
  importElementAppearance,
  parseElementAppearanceExport,
  parseElementAppearanceExportText,
  serializeElementAppearance,
} from '../../src/components/appearance/elementAppearance';

const ROOT = new URL('../../', import.meta.url);
const source = (path: string) => readFileSync(new URL(path, ROOT), 'utf8');

const EDITOR = source('src/components/appearance/ElementAppearanceEditor.tsx');
const BOUNDARY = source('src/components/appearance/ElementAppearanceBoundary.tsx');
const APP = source('src/App.tsx');
const LOCK_ADAPTER = source('src/components/appearance/toyLockAdapter.ts');
const SETTINGS_CONSUMER = source('src/components/settings/settings-tab-appearance-consumer.ts');
const HISTORY_BRIDGE = source('src/components/appearance/appearanceHistoryBridge.ts');

describe('every-element appearance contract', () => {
  it('keeps a hand-written state matrix and capability matrix', () => {
    expect(APPEARANCE_STATES).toEqual([
      'normal', 'hover', 'focus', 'pressed', 'selected', 'disabled', 'dragged',
      'validation', 'loading', 'success', 'warning', 'error',
    ]);
    expect(APPEARANCE_CAPABILITIES.length).toBeGreaterThan(15);
    expect(APPEARANCE_CAPABILITIES.some((item) => !item.supported && item.reason)).toBe(true);
  });

  it('creates independent style snapshots for every state', () => {
    const appearance = defaultElementAppearance('appearance:button');
    expect(Object.keys(appearance.states)).toEqual([...APPEARANCE_STATES]);
    expect(appearance.states.normal).not.toBe(appearance.states.hover);
    expect(appearance.states.normal.layers).not.toBe(appearance.states.hover.layers);
    expect(defaultAppearanceStyle().inheritedFrom).toBeNull();
  });

  it.each([
    ['layer visibility', 'Changed layer visibility'],
    ['layer duplication', 'Duplicated layer'],
    ['layer ordering', 'Reordered layer'],
    ['state inheritance', 'Changed state inheritance'],
    ['property inspector', 'element-appearance-property-search'],
  ])('keeps the %s wiring', (_label, needle) => {
    expect(`${EDITOR}\n${BOUNDARY}`).toContain(needle);
  });

  it('turns red when the target-specific appearance action is removed', () => {
    const needle = 'Edit appearance…';
    const broken = BOUNDARY.replace(needle, 'Removed appearance action');
    expect(BOUNDARY).toContain(needle);
    expect(broken).not.toContain(needle);
  });

  it('keeps the root wrapper and real renderer consumer', () => {
    expect(APP).toContain('<ElementAppearanceBoundary>');
    expect(BOUNDARY).toContain('applyAppearanceStateToElement(element, resolveAppearanceState(saved), saved.activeState)');
    expect(APP.replace('<ElementAppearanceBoundary>', '')).not.toContain('<ElementAppearanceBoundary>');
    expect(BOUNDARY.replace('applyAppearanceStateToElement(element, resolveAppearanceState(saved), saved.activeState)', '')).not.toContain('applyAppearanceStateToElement(element, resolveAppearanceState(saved), saved.activeState)');
  });

  it('keeps validated portable style operations in the source contract', () => {
    const exported = JSON.parse(serializeElementAppearance('appearance:button')) as unknown;
    expect(parseElementAppearanceExport(exported)?.version).toBe(1);
    expect(parseElementAppearanceExport({ schema: 'open-design.element-appearance', version: 99 })).toBeNull();
    expect(parseElementAppearanceExportText('{"schema":"open-design.element-appearance","schema":"duplicate","version":1}')).toBeNull();
    expect(parseElementAppearanceExport({ schema: 'open-design.element-appearance', version: 1, extra: true })).toBeNull();
    copyAppearanceStyle('appearance:button', 'normal');
    const target = document?.createElement?.('button') ?? null;
    if (target) applyAppearanceStateToElement(target, defaultAppearanceStyle());
    expect(importElementAppearance(exported, 'appearance:other')).toBe(true);
  });

  it('turns red when portable operations disappear', () => {
    for (const needle of [
      'serializeElementAppearance',
      'parseElementAppearanceExport',
      'saveNamedAppearancePreset',
      'copyAppearanceStyle',
      'resetAppearanceProperty',
      'resetAppearanceState',
      'resetAllElementAppearances',
      'applyAppearanceStateToElement',
    ]) {
      const combined = `${EDITOR}\n${BOUNDARY}\n${source('src/components/appearance/elementAppearance.ts')}`;
      expect(combined).toContain(needle);
      expect(combined.split(needle).join('')).not.toContain(needle);
    }
  });

  it('keeps pointer, keyboard, touch and mutation-observer routes', () => {
    expect(BOUNDARY).toContain('onContextMenu={handleContextMenu}');
    expect(BOUNDARY).toContain('onKeyDown={handleKeyDown}');
    expect(BOUNDARY).toContain('onPointerDown={handlePointerDown}');
    expect(BOUNDARY).toContain('new MutationObserver(scan)');
  });

  it('keeps the root toy-lock adapter seam wired without owning credentials', () => {
    expect(APP).toContain('onLockElement={requestElementToyLock}');
    expect(LOCK_ADAPTER).toContain("window.dispatchEvent(new CustomEvent<ElementToyLockRequestDetail>");
    expect(LOCK_ADAPTER).toContain('targetId: target.id');
    expect(LOCK_ADAPTER).not.toContain('password');
  });

  it('keeps the cross-lane lock event contract exact', () => {
    expect(LOCK_ADAPTER).toContain("ELEMENT_TOY_LOCK_REQUEST = 'open-design:element-toy-lock-request'");
    expect(LOCK_ADAPTER).toContain("ELEMENT_TOY_LOCK_CONFIGURATION = 'open-design:element-toy-lock-configuration'");
    expect(LOCK_ADAPTER).toContain("ELEMENT_TOY_LOCK_STATE = 'open-design:element-toy-lock-state'");
    expect(LOCK_ADAPTER).toContain("ELEMENT_TOY_LOCK_ACTIVATION = 'open-design:element-toy-lock-activation'");
    expect(LOCK_ADAPTER).not.toContain('password:');
    expect(LOCK_ADAPTER).not.toContain('totpSecret:');
  });

  it('keeps the history lane acknowledgement payload and timeout contract exact', () => {
    expect(HISTORY_BRIDGE).toContain('domainId: string');
    expect(HISTORY_BRIDGE).toContain('revisionId: string');
    expect(HISTORY_BRIDGE).toContain('historyRevisionId');
    expect(HISTORY_BRIDGE).toContain('APPEARANCE_HISTORY_TIMEOUT_MS = 10_000');
    expect(HISTORY_BRIDGE).toContain('signal: controller.signal');
    expect(HISTORY_BRIDGE).toContain('globalThis.clearTimeout(timer)');
    expect(HISTORY_BRIDGE).not.toContain('styleSnapshot');
  });

  it('keeps the Settings tab appearance consumer contract source-complete', () => {
    expect(SETTINGS_CONSUMER).toContain("SETTINGS_TAB_APPEARANCE_REQUEST_EVENT = 'od:settings-tab-appearance-request'");
    expect(SETTINGS_CONSUMER).toContain('section: SettingsSection');
    expect(SETTINGS_CONSUMER).toContain('anchor: HTMLButtonElement');
    expect(SETTINGS_CONSUMER).toContain('registerSettingsTabAppearanceConsumer');
    expect(SETTINGS_CONSUMER).toContain('emitSettingsTabAppearanceRequest');
    expect(SETTINGS_CONSUMER.split('registerSettingsTabAppearanceConsumer').join('')).not.toContain('registerSettingsTabAppearanceConsumer');
  });

  it('keeps every real state activation route and strict identity policy', () => {
    for (const state of ['hover', 'focus', 'pressed', 'selected', 'disabled', 'dragged', 'validation', 'loading', 'success', 'warning', 'error']) {
      expect(BOUNDARY).toContain(`'${state}'`);
    }
    expect(BOUNDARY).toContain('deterministic semantic digest fallback');
    expect(BOUNDARY).not.toContain('first-seen ordinal');
    expect(source('src/components/appearance/elementAppearance.ts')).toContain('MAX_APPEARANCE_INHERIT_DEPTH');
    expect(source('src/components/appearance/elementAppearance.ts')).toContain('hasDuplicateJsonKeys');
  });
});
