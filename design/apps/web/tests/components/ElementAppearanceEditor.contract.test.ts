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
  serializeElementAppearance,
} from '../../src/components/appearance/elementAppearance';

const ROOT = new URL('../../', import.meta.url);
const source = (path: string) => readFileSync(new URL(path, ROOT), 'utf8');

const EDITOR = source('src/components/appearance/ElementAppearanceEditor.tsx');
const BOUNDARY = source('src/components/appearance/ElementAppearanceBoundary.tsx');
const APP = source('src/App.tsx');

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
    expect(BOUNDARY).toContain('applyAppearanceStateToElement(element, saved.states[saved.activeState])');
    expect(APP.replace('<ElementAppearanceBoundary>', '')).not.toContain('<ElementAppearanceBoundary>');
    expect(BOUNDARY.replace('applyAppearanceStateToElement(element, saved.states[saved.activeState])', '')).not.toContain('applyAppearanceStateToElement(element, saved.states[saved.activeState])');
  });

  it('keeps validated portable style operations in the source contract', () => {
    const exported = JSON.parse(serializeElementAppearance('appearance:button')) as unknown;
    expect(parseElementAppearanceExport(exported)?.version).toBe(1);
    expect(parseElementAppearanceExport({ schema: 'open-design.element-appearance', version: 99 })).toBeNull();
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
});
