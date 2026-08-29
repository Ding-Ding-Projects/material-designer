// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import {
  APPEARANCE_CAPABILITIES,
  APPEARANCE_STATES,
  applyAppearanceStateToElement,
  clearAppearanceStateFromElement,
  copyAppearanceStyle,
  defaultAppearanceStyle,
  defaultElementAppearance,
  getLastAppearanceError,
  importElementAppearance,
  parseElementAppearanceExport,
  parseElementAppearanceExportText,
  serializeElementAppearance,
  setElementAppearance,
} from '../../src/components/appearance/elementAppearance';
import { validateAppearanceExport } from '../../src/components/appearance/appearanceExportSchema';
import { acknowledgeAppearanceMutation } from '../../src/components/appearance/appearanceHistoryBridge';
import { ELEMENT_TOY_LOCK_REQUEST, requestElementToyLock } from '../../src/components/appearance/toyLockAdapter';

describe('every-element appearance contract', () => {
  it('keeps a hand-written state matrix and capability matrix', () => {
    expect(APPEARANCE_STATES).toEqual([
      'normal', 'hover', 'focus', 'pressed', 'selected', 'disabled', 'dragged',
      'validation', 'loading', 'success', 'warning', 'error',
    ]);
    expect(APPEARANCE_CAPABILITIES.length).toBeGreaterThan(15);
    expect(APPEARANCE_CAPABILITIES.some((item) => !item.supported && item.reason && item.reasonZh)).toBe(true);
  });

  it('creates independent style snapshots for every state', () => {
    const appearance = defaultElementAppearance('appearance:button');
    expect(Object.keys(appearance.states)).toEqual([...APPEARANCE_STATES]);
    expect(appearance.states.normal).not.toBe(appearance.states.hover);
    expect(appearance.states.normal.layers).not.toBe(appearance.states.hover.layers);
    expect(defaultAppearanceStyle().inheritedFrom).toBeNull();
  });

  it('keeps validated portable style operations at the production seam', () => {
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
    if (!parentResult.ok) expect(parentResult.issue).toEqual({ code: 'parent-cycle', path: '$.appearance.states.normal.layers[parentId=group.one].parentId', message: 'Layer parent identities form a cycle.' });
    expect(importElementAppearance(parentCycle, 'appearance:button')).toBe(false);

    const missingEffect = structuredClone(exported);
    missingEffect.appearance.states.normal.layers[0].effects = ['effect.missing'];
    const effectResult = validateAppearanceExport(missingEffect);
    expect(effectResult.ok).toBe(false);
    if (!effectResult.ok) expect(effectResult.issue).toEqual({ code: 'missing-reference', path: '$.appearance.states.normal.layers[base].effects', message: 'Effect identity "effect.missing" is missing.' });

    const invalidNumber = structuredClone(exported);
    invalidNumber.appearance.states.normal.fontSize = Number.NaN;
    const numberResult = validateAppearanceExport(invalidNumber);
    expect(numberResult.ok).toBe(false);
    if (!numberResult.ok) expect(numberResult.issue).toEqual({ code: 'non-finite-number', path: '$.appearance.states.normal.fontSize', message: 'Number must be finite.' });

    const target = document.createElement('button');
    target.style.color = 'rebeccapurple';
    const invalidStyle = defaultAppearanceStyle();
    invalidStyle.fontSize = Number.NaN;
    applyAppearanceStateToElement(target, invalidStyle);
    expect(target.style.color).toBe('rebeccapurple');
    expect(setElementAppearance('appearance:button', invalidNumber.appearance, 'Invalid numeric fixture')).toBe(false);
    expect(getLastAppearanceError()).toBe('Appearance mutation refused: the target or nested value was outside its bounded schema.');
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
    expect(target.style.backgroundImage).toContain('#2f6fed');
    expect(target.style.transition).toBe('none');
    expect(target.dataset.elementAppearanceRainbow).toBe('true');
    expect(target.dataset.elementAppearanceState).toBe('hover');
    clearAppearanceStateFromElement(target);
    expect(target.getAttribute('dir')).toBe('rtl');
    expect(target.style.color).toBe('rebeccapurple');
    expect(target.style.filter).toBe('');
  });

  it('projects gradient and pattern effects through background-image', () => {
    const style = defaultAppearanceStyle();
    const effect = {
      id: 'effect.gradient', name: 'Gradient', kind: 'gradient' as const, enabled: true,
      opacity: 1, color: 'linear-gradient(90deg, red, blue)', radius: 0, distance: 0, angle: 0, spread: 0, blendMode: 'normal' as const,
    };
    style.layers[0]!.effects = [effect.id];
    style.layers[0]!.effectStack = [effect];
    const target = document.createElement('button');
    applyAppearanceStateToElement(target, style);
    expect(target.style.backgroundImage).toBe('linear-gradient(90deg, red, blue)');
    clearAppearanceStateFromElement(target);

    const patternStyle = defaultAppearanceStyle();
    const patternEffect = { ...effect, id: 'effect.pattern', kind: 'pattern' as const, color: 'repeating-linear-gradient(45deg, red 0 4px, blue 4px 8px)' };
    patternStyle.layers[0]!.effects = [patternEffect.id];
    patternStyle.layers[0]!.effectStack = [patternEffect];
    applyAppearanceStateToElement(target, patternStyle);
    expect(target.style.backgroundImage).toBe('repeating-linear-gradient(45deg, red 0 4px, blue 4px 8px)');
    clearAppearanceStateFromElement(target);
  });

  it('restores every owned inline value, custom property, priority, and semantic dir exactly', () => {
    const style = defaultAppearanceStyle();
    style.textDirection = 'ltr';
    style.textColor = 'rgb(12 34 56)';
    style.layers[0]!.transform.x = 18;
    const target = document.createElement('button');
    target.setAttribute('dir', 'rtl');
    target.style.setProperty('color', 'rebeccapurple', 'important');
    target.style.setProperty('transform', 'scale(2)', 'important');
    target.style.setProperty('direction', 'rtl', 'important');
    target.style.setProperty('filter', 'grayscale(1)', 'important');
    target.style.setProperty('--element-appearance-overrides', 'existing', 'important');

    applyAppearanceStateToElement(target, style, 'focus');
    expect(target.style.color).not.toBe('rebeccapurple');
    expect(target.style.transform).toContain('translate(18px');
    expect(target.style.direction).toBe('ltr');
    expect(target.style.filter).toBe('');
    expect(target.style.getPropertyPriority('color')).toBe('');
    expect(target.style.getPropertyPriority('--element-appearance-overrides')).toBe('');

    clearAppearanceStateFromElement(target);
    expect(target.style.getPropertyValue('color')).toBe('rebeccapurple');
    expect(target.style.getPropertyPriority('color')).toBe('important');
    expect(target.style.getPropertyValue('transform')).toBe('scale(2)');
    expect(target.style.getPropertyPriority('transform')).toBe('important');
    expect(target.style.getPropertyValue('direction')).toBe('rtl');
    expect(target.style.getPropertyPriority('direction')).toBe('important');
    expect(target.style.getPropertyValue('filter')).toBe('grayscale(1)');
    expect(target.style.getPropertyPriority('filter')).toBe('important');
    expect(target.style.getPropertyValue('--element-appearance-overrides')).toBe('existing');
    expect(target.style.getPropertyPriority('--element-appearance-overrides')).toBe('important');
    expect(target.getAttribute('dir')).toBe('rtl');
  });

  it('dispatches the toy-lock request with the exact target and no credential material', () => {
    const anchor = document.createElement('button');
    const target = { id: 'appearance:button', label: 'Button', role: 'button', path: '#button', element: anchor };
    const received: CustomEvent[] = [];
    const listener = (event: Event) => received.push(event as CustomEvent);
    window.addEventListener(ELEMENT_TOY_LOCK_REQUEST, listener);
    requestElementToyLock(target);
    window.removeEventListener(ELEMENT_TOY_LOCK_REQUEST, listener);
    expect(received).toHaveLength(1);
    expect(received[0]?.detail).toEqual({ targetId: target.id, targetLabel: target.label, targetRole: target.role, anchor });
    expect(JSON.stringify(received[0]?.detail)).not.toMatch(/password|totpSecret/i);
  });

  it('sends only bounded redacted history metadata through the acknowledgement seam', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body).toEqual({ domainId: 'appearance', targetId: 'appearance:button', action: 'Updated appearance', revisionId: 'revision-1' });
      return { ok: true, status: 200, json: async () => ({ acknowledged: true, duplicate: false, historyRevisionId: 'host-1' }) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    const refused = await acknowledgeAppearanceMutation({ domainId: 'appearance', targetId: 'appearance/invalid', action: 'Updated appearance', revisionId: 'revision-1' });
    expect(refused).toEqual({ status: 'unavailable', reason: 'Appearance history metadata was outside its bounded contract.' });
    expect(fetchMock).not.toHaveBeenCalled();
    const result = await acknowledgeAppearanceMutation({ domainId: 'appearance', targetId: 'appearance:button', action: 'Updated appearance', revisionId: 'revision-1' });
    expect(result).toEqual({ status: 'acknowledged', duplicate: false, historyRevisionId: 'host-1' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
