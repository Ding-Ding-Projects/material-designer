// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  APPEARANCE_CAPABILITIES,
  APPEARANCE_STATES,
  applyAppearanceStateToElement,
  clearAppearanceStateFromElement,
  copyAppearanceStyle,
  defaultAppearanceStyle,
  defaultElementAppearance,
  importElementAppearance,
  parseElementAppearanceExport,
  parseElementAppearanceExportText,
  serializeElementAppearance,
} from '../../src/components/appearance/elementAppearance';
import { validateAppearanceExport } from '../../src/components/appearance/appearanceExportSchema';

const ROOT = new URL('../../', import.meta.url);
const source = (path: string) => readFileSync(new URL(path, ROOT), 'utf8');

const EDITOR = source('src/components/appearance/ElementAppearanceEditor.tsx');
const BOUNDARY = source('src/components/appearance/ElementAppearanceBoundary.tsx');
const LOCK_ADAPTER = source('src/components/appearance/toyLockAdapter.ts');
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

  it('keeps the root wrapper and real renderer consumer', () => {
    expect(BOUNDARY).toContain('applyAppearanceStateToElement(element, resolveAppearanceState(saved), saved.activeState)');
    expect(BOUNDARY).toContain('data-appearance-surface="true"');
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

  it('refuses malformed graphs at the production validator and renderer seams', () => {
    const exported = JSON.parse(serializeElementAppearance('appearance:button')) as Record<string, any>;
    const parentCycle = structuredClone(exported);
    const normal = parentCycle.appearance.states.normal;
    normal.layers.push({ ...structuredClone(normal.layers[0]), id: 'group.two', kind: 'group', parentId: 'group.one' });
    normal.layers[0].id = 'group.one';
    normal.layers[0].parentId = 'group.two';
    const parentResult = validateAppearanceExport(parentCycle);
    expect(parentResult.ok).toBe(false);
    if (!parentResult.ok) expect(parentResult.issue.code).toBe('parent-cycle');
    expect(importElementAppearance(parentCycle, 'appearance:button')).toBe(false);

    const missingEffect = structuredClone(exported);
    missingEffect.appearance.states.normal.layers[0].effects = ['effect.missing'];
    const effectResult = validateAppearanceExport(missingEffect);
    expect(effectResult.ok).toBe(false);
    if (!effectResult.ok) expect(effectResult.issue.code).toBe('missing-reference');

    const invalidNumber = structuredClone(exported);
    invalidNumber.appearance.states.normal.fontSize = Number.NaN;
    const numberResult = validateAppearanceExport(invalidNumber);
    expect(numberResult.ok).toBe(false);
    if (!numberResult.ok) expect(numberResult.issue.code).toBe('non-finite-number');

    const target = document.createElement('button');
    target.style.color = 'rebeccapurple';
    const invalidStyle = defaultAppearanceStyle();
    invalidStyle.fontSize = Number.NaN;
    applyAppearanceStateToElement(target, invalidStyle);
    expect(target.style.color).toBe('rebeccapurple');
  });

  it('projects effect parameters, motion, rainbow state, and direction without erasing semantic attributes', () => {
    const style = defaultAppearanceStyle();
    style.textDirection = 'ltr';
    style.motion = 'reduced';
    style.textColor = 'appearance-rainbow-sentinel';
    const effect = {
      id: 'effect.blur',
      name: 'Blur',
      kind: 'blur' as const,
      enabled: true,
      opacity: 1,
      color: 'rgb(0 0 0 / 24%)',
      radius: 6,
      distance: 0,
      angle: 0,
      spread: 0,
      blendMode: 'normal' as const,
    };
    style.layers[0]!.effects = [effect.id];
    style.layers[0]!.effectStack = [effect];
    const target = document.createElement('button');
    target.setAttribute('dir', 'rtl');
    target.style.color = 'rebeccapurple';
    applyAppearanceStateToElement(target, style, 'hover');
    expect(target.getAttribute('dir')).toBe('rtl');
    expect(target.style.direction).toBe('ltr');
    expect(target.style.filter).toBe('blur(6px)');
    expect(target.style.transition).toBe('none');
    expect(target.dataset.elementAppearanceRainbow).toBe('true');
    expect(target.dataset.elementAppearanceState).toBe('hover');
    clearAppearanceStateFromElement(target);
    expect(target.getAttribute('dir')).toBe('rtl');
    expect(target.style.color).toBe('rebeccapurple');
    expect(target.style.filter).toBe('');
  });

  it('keeps pointer, keyboard, touch and mutation-observer routes', () => {
    expect(BOUNDARY).toContain('onContextMenu={handleContextMenu}');
    expect(BOUNDARY).toContain('onKeyDown={handleKeyDown}');
    expect(BOUNDARY).toContain('onPointerDown={handlePointerDown}');
    expect(BOUNDARY).toContain('new MutationObserver(scan)');
  });

  it('keeps the root toy-lock adapter seam wired without owning credentials', () => {
    expect(BOUNDARY).toContain('onLockElement?: (target: AppearanceTarget) => void');
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

  it('keeps the settings handoff isolated behind the appearance event protocol', () => {
    expect(BOUNDARY).toContain("SETTINGS_TAB_APPEARANCE_EDITOR_EVENT = 'od:settings-tab-appearance-editor'");
    expect(BOUNDARY).toContain('section: string');
    expect(BOUNDARY).toContain('anchor: HTMLButtonElement');
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
