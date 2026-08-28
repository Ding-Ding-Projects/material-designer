import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ChangeEvent } from 'react';

import { RegexSearchField } from '../regex/RegexSearchField';
import { useRegexSearch } from '../regex/useRegexSearch';
import {
  APPEARANCE_CAPABILITIES,
  APPEARANCE_STATES,
  defaultElementAppearance,
  getElementAppearance,
  resetElementAppearance,
  setElementAppearance,
  undoElementAppearance,
  redoElementAppearance,
  type AppearanceLayer,
  type AppearanceState,
  type AppearanceStateStyle,
  type AppearanceTarget,
  type ElementAppearance,
  type LayerKind,
} from './elementAppearance';
import styles from './ElementAppearanceEditor.module.css';

interface ElementAppearanceEditorProps {
  target: AppearanceTarget;
  onClose: () => void;
}

const PANEL_WIDTH = 760;
const VIEWPORT_MARGIN = 12;
const FONT_FAMILIES = [
  'system-ui',
  'Roboto Flex',
  'Segoe UI',
  'Inter',
  'Arial',
  'Georgia',
  'Roboto Mono',
  'Microsoft YaHei UI',
] as const;

const LAYER_KINDS: readonly LayerKind[] = [
  'shape',
  'text',
  'image',
  'adjustment',
  'mask',
  'smart-object',
  'effect',
];

function panelPosition(target: HTMLElement | null): CSSProperties {
  if (typeof window === 'undefined') return { left: VIEWPORT_MARGIN, top: VIEWPORT_MARGIN, width: PANEL_WIDTH };
  const rect = target?.getBoundingClientRect();
  const width = Math.min(PANEL_WIDTH, Math.max(280, window.innerWidth - VIEWPORT_MARGIN * 2));
  const left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(rect?.right ?? VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN),
  );
  const preferredTop = rect?.top ?? VIEWPORT_MARGIN;
  const top = Math.max(VIEWPORT_MARGIN, Math.min(preferredTop, window.innerHeight - 420));
  return { left, top, width };
}

function applyStateToTarget(target: AppearanceTarget, state: AppearanceStateStyle): void {
  const element = target.element;
  if (!element) return;
  element.style.setProperty('--element-appearance-text', state.textColor);
  element.style.setProperty('--element-appearance-highlight', state.highlightColor);
  element.style.setProperty('--element-appearance-radius', `${state.borderRadius}px`);
  element.style.setProperty('--element-appearance-elevation', String(state.elevation));
  element.style.color = state.textColor;
  element.style.fontFamily = state.fontFamily;
  element.style.fontSize = `${state.fontSize}px`;
  element.style.fontWeight = String(state.fontWeight);
  element.style.fontStyle = state.italic ? 'italic' : 'normal';
  element.style.textDecorationLine = [
    state.underline !== 'none' ? 'underline' : '',
    state.strike !== 'none' ? 'line-through' : '',
    state.overline ? 'overline' : '',
  ].filter(Boolean).join(' ') || 'none';
  element.style.textTransform = state.capitalization === 'none' ? 'none' : state.capitalization;
  element.style.letterSpacing = `${state.letterSpacing}em`;
  element.style.wordSpacing = `${state.wordSpacing}em`;
  element.style.lineHeight = String(state.lineHeight);
  element.style.borderRadius = `${state.borderRadius}px`;
  element.style.boxShadow = state.elevation > 0 ? `0 ${state.elevation}px ${state.elevation * 2}px rgb(0 0 0 / 18%)` : '';
  element.dir = state.textDirection === 'auto' ? '' : state.textDirection;
  element.style.textAlign = state.alignment === 'start' ? '' : state.alignment;
  element.dataset.elementAppearanceState = target.id;
}

function layerCopy(layer: AppearanceLayer): AppearanceLayer {
  return { ...layer, effects: [...layer.effects], transform: { ...layer.transform } };
}

function cloneState(state: AppearanceStateStyle): AppearanceStateStyle {
  return { ...state, layers: state.layers.map(layerCopy), selections: state.selections.map((selection) => ({ ...selection, bounds: { ...selection.bounds } })), channels: [...state.channels], masks: [...state.masks], overrides: { ...state.overrides } };
}

export function ElementAppearanceEditor({ target, onClose }: ElementAppearanceEditorProps) {
  const [appearance, setAppearance] = useState<ElementAppearance>(() => getElementAppearance(target.id));
  const [selectedLayerId, setSelectedLayerId] = useState('base');
  const [position, setPosition] = useState<CSSProperties>(() => panelPosition(target.element));
  const [status, setStatus] = useState('');
  const [propertyQuery, setPropertyQuery] = useState('');
  const propertySearch = useRegexSearch(propertyQuery, setPropertyQuery);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const currentState = appearance.states[appearance.activeState];

  useEffect(() => {
    applyStateToTarget(target, currentState);
  }, [currentState, target]);

  useEffect(() => {
    const updatePosition = () => setPosition(panelPosition(target.element));
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [target.element]);

  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>('input, select, button')?.focus();
  }, []);

  const update = useCallback((patch: Partial<ElementAppearance>, action: string) => {
    setAppearance((previous) => {
      const next = { ...previous, ...patch, updatedAt: new Date().toISOString() };
      setElementAppearance(target.id, next, action);
      return next;
    });
    setStatus(`${action} recorded`);
  }, [target.id]);

  const updateCurrentState = useCallback((patch: Partial<AppearanceStateStyle>, action: string) => {
    update({ states: { ...appearance.states, [appearance.activeState]: { ...currentState, ...patch } } }, action);
  }, [appearance.activeState, appearance.states, currentState, update]);

  const updateLayer = useCallback((layerId: string, patch: Partial<AppearanceLayer>, action: string) => {
    updateCurrentState({ layers: currentState.layers.map((layer) => layer.id === layerId ? { ...layer, ...patch } : layer) }, action);
  }, [currentState.layers, updateCurrentState]);

  const addLayer = (kind: LayerKind) => {
    const id = `layer-${Date.now()}`;
    updateCurrentState({ layers: [...currentState.layers, { ...layerCopy(currentState.layers[0] ?? { id: 'base', name: 'Base appearance', kind: 'shape', visible: true, locked: false, opacity: 1, blendMode: 'normal', parentId: null, fill: 'transparent', stroke: 'transparent', shadow: 'none', transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0 }, effects: [] }), id, name: `${kind} layer`, kind }] }, 'Added layer');
    setSelectedLayerId(id);
  };

  const duplicateLayer = () => {
    const source = currentState.layers.find((layer) => layer.id === selectedLayerId);
    if (!source) return;
    const copy = { ...layerCopy(source), id: `layer-${Date.now()}`, name: `${source.name} copy` };
    updateCurrentState({ layers: [...currentState.layers, copy] }, 'Duplicated layer');
    setSelectedLayerId(copy.id);
  };

  const moveLayer = (delta: number) => {
    const index = currentState.layers.findIndex((layer) => layer.id === selectedLayerId);
    const nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || nextIndex >= currentState.layers.length) return;
    const layers = [...currentState.layers];
    const [moved] = layers.splice(index, 1);
    layers.splice(nextIndex, 0, moved);
    updateCurrentState({ layers }, 'Reordered layer');
  };

  const filteredCapabilities = useMemo(
    () => APPEARANCE_CAPABILITIES.filter((capability) => propertySearch.matches(`${capability.label} ${capability.group} ${capability.reason ?? ''}`)),
    [propertySearch],
  );

  const setNumber = (key: keyof AppearanceStateStyle, event: ChangeEvent<HTMLInputElement>) => {
    updateCurrentState({ [key]: Number(event.target.value) } as Partial<AppearanceStateStyle>, `Changed ${String(key)}`);
  };

  const setString = (key: keyof AppearanceStateStyle, event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    updateCurrentState({ [key]: event.target.value } as Partial<AppearanceStateStyle>, `Changed ${String(key)}`);
  };

  const setBoolean = (key: keyof AppearanceStateStyle, event: ChangeEvent<HTMLInputElement>) => {
    updateCurrentState({ [key]: event.target.checked } as Partial<AppearanceStateStyle>, `Changed ${String(key)}`);
  };

  const close = () => {
    target.element?.focus();
    onClose();
  };

  const reset = () => {
    const next = defaultElementAppearance(target.id);
    setAppearance(next);
    resetElementAppearance(target.id);
    applyStateToTarget(target, next.states[next.activeState]);
    setStatus('Reset appearance recorded');
  };

  const undo = () => {
    if (undoElementAppearance(target.id)) {
      const next = getElementAppearance(target.id);
      setAppearance(next);
      setStatus('Undo recorded');
    }
  };

  const redo = () => {
    if (redoElementAppearance(target.id)) {
      const next = getElementAppearance(target.id);
      setAppearance(next);
      setStatus('Redo recorded');
    }
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div ref={panelRef} className={styles.shell} style={position} role="dialog" aria-modal="false" aria-label={`Edit appearance for ${target.label}`} data-testid="element-appearance-editor">
      <header className={styles.header}>
        <div>
          <h2>Edit appearance</h2>
          <p>{target.label} · {target.role} · {target.path}</p>
        </div>
        <button className={styles.close} type="button" onClick={close} aria-label="Close appearance editor">×</button>
      </header>
      <div className={styles.toolbar} role="toolbar" aria-label="Appearance history and workspace tools">
        <button type="button" onClick={undo} disabled={readOnlyDisabled(appearance)} title="Undo the latest appearance change">Undo</button>
        <button type="button" onClick={redo} title="Redo the latest appearance change">Redo</button>
        <button type="button" onClick={reset}>Reset this element</button>
        <button type="button" onClick={() => update({ rulers: !appearance.rulers }, 'Changed rulers')}>{appearance.rulers ? 'Hide rulers' : 'Show rulers'}</button>
        <button type="button" onClick={() => update({ guides: !appearance.guides }, 'Changed guides')}>{appearance.guides ? 'Hide guides' : 'Show guides'}</button>
        <label>Zoom <input type="range" min="0.25" max="4" step="0.25" value={appearance.zoom} onChange={(event) => update({ zoom: Number(event.target.value) }, 'Changed zoom')} aria-label="Preview zoom" /></label>
      </div>
      <div className={styles.body}>
        <aside className={styles.rail} aria-label="Layer workspace">
          <section className={styles.section}>
            <h3>States</h3>
            <div className={styles.stateTabs} role="tablist" aria-label="Element appearance states">
              {APPEARANCE_STATES.map((state) => (
                <button key={state} type="button" role="tab" aria-selected={appearance.activeState === state} onClick={() => update({ activeState: state }, `Selected ${state} state`)}>{state}</button>
              ))}
            </div>
          </section>
          <section className={styles.section}>
            <h3>Layers and groups</h3>
            {currentState.layers.map((layer) => (
              <div className={styles.layer} key={layer.id} data-selected={selectedLayerId === layer.id}>
                <button type="button" onClick={() => updateLayer(layer.id, { visible: !layer.visible }, 'Changed layer visibility')} aria-label={`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`}>{layer.visible ? '◉' : '○'}</button>
                <button type="button" className={styles.layerName} onClick={() => setSelectedLayerId(layer.id)} aria-pressed={selectedLayerId === layer.id}>{layer.name}<span className={styles.layerMeta}>{layer.kind} · {Math.round(layer.opacity * 100)}%</span></button>
                <button type="button" onClick={() => updateLayer(layer.id, { locked: !layer.locked }, 'Changed layer lock')} aria-label={`${layer.locked ? 'Unlock' : 'Lock'} ${layer.name}`}>{layer.locked ? '🔒' : '◇'}</button>
              </div>
            ))}
            <div className={styles.toolbar}>
              <select aria-label="New layer type" defaultValue="shape" onChange={(event) => addLayer(event.target.value as LayerKind)}>
                {LAYER_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
              </select>
              <button type="button" onClick={() => addLayer('shape')}>Add</button>
              <button type="button" onClick={duplicateLayer}>Duplicate</button>
              <button type="button" onClick={() => moveLayer(-1)}>Up</button>
              <button type="button" onClick={() => moveLayer(1)}>Down</button>
            </div>
          </section>
        </aside>
        <main className={styles.inspector} aria-label="Appearance property inspector">
          <RegexSearchField search={propertySearch} fieldLabel="appearance properties" ariaLabel="Search appearance properties" placeholder="Search properties" testId="element-appearance-property-search" />
          <p className={styles.status} role="status" aria-live="polite">{status || `${filteredCapabilities.length} capabilities shown`}</p>
          <section className={styles.section}>
            <h3>Word-depth typography</h3>
            <div className={styles.form}>
              <label className={styles.field}><span>Font family</span><select value={currentState.fontFamily} onChange={(event) => setString('fontFamily', event)}>{FONT_FAMILIES.map((font) => <option key={font} value={font} style={{ fontFamily: font }}>{font}</option>)}</select></label>
              <label className={styles.field}><span>Font size (px)</span><input type="number" min="6" max="160" value={currentState.fontSize} onChange={(event) => setNumber('fontSize', event)} /></label>
              <label className={styles.field}><span>Weight</span><input type="number" min="100" max="900" step="100" value={currentState.fontWeight} onChange={(event) => setNumber('fontWeight', event)} /></label>
              <label className={styles.field}><span>Line height</span><input type="number" min="0.5" max="4" step="0.05" value={currentState.lineHeight} onChange={(event) => setNumber('lineHeight', event)} /></label>
              <label className={styles.field}><span>Text color</span><input type="text" value={currentState.textColor} onChange={(event) => setString('textColor', event)} /><input className={styles.swatch} type="color" value={toColorInput(currentState.textColor)} onChange={(event) => setString('textColor', event)} aria-label="Text color picker" /></label>
              <label className={styles.field}><span>Highlight color</span><input type="text" value={currentState.highlightColor} onChange={(event) => setString('highlightColor', event)} /><input className={styles.swatch} type="color" value={toColorInput(currentState.highlightColor)} onChange={(event) => setString('highlightColor', event)} aria-label="Highlight color picker" /></label>
              <label className={styles.field}><span>Letter spacing (em)</span><input type="number" min="-1" max="2" step="0.01" value={currentState.letterSpacing} onChange={(event) => setNumber('letterSpacing', event)} /></label>
              <label className={styles.field}><span>Word spacing (em)</span><input type="number" min="-1" max="4" step="0.01" value={currentState.wordSpacing} onChange={(event) => setNumber('wordSpacing', event)} /></label>
              <label className={styles.field}><span>Underline</span><select value={currentState.underline} onChange={(event) => setString('underline', event)}><option value="none">None</option><option value="single">Single</option><option value="double">Double</option><option value="wavy">Wavy</option></select></label>
              <label className={styles.field}><span>Strikethrough</span><select value={currentState.strike} onChange={(event) => setString('strike', event)}><option value="none">None</option><option value="single">Single</option><option value="double">Double</option></select></label>
              <label className={styles.field}><span>Capitalization</span><select value={currentState.capitalization} onChange={(event) => setString('capitalization', event)}><option value="none">None</option><option value="uppercase">Uppercase</option><option value="lowercase">Lowercase</option><option value="capitalize">Capitalize</option><option value="small-caps">Small caps</option></select></label>
              <label className={styles.field}><span>Alignment</span><select value={currentState.alignment} onChange={(event) => setString('alignment', event)}><option value="start">Start</option><option value="center">Center</option><option value="end">End</option><option value="justify">Justify</option></select></label>
              <label className={styles.field}><span>Text direction</span><select value={currentState.textDirection} onChange={(event) => setString('textDirection', event)}><option value="auto">Auto</option><option value="ltr">Left to right</option><option value="rtl">Right to left</option></select></label>
              <label className={styles.field}><span>Italic and overline</span><input type="checkbox" checked={currentState.italic} onChange={(event) => setBoolean('italic', event)} aria-label="Italic" /><input type="checkbox" checked={currentState.overline} onChange={(event) => setBoolean('overline', event)} aria-label="Overline" /></label>
            </div>
          </section>
          <section className={styles.section}>
            <h3>Image, shape and layout workspace</h3>
            <div className={styles.form}>
              <label className={styles.field}><span>Border radius</span><input type="number" min="0" max="200" value={currentState.borderRadius} onChange={(event) => setNumber('borderRadius', event)} /></label>
              <label className={styles.field}><span>Elevation</span><input type="number" min="0" max="24" value={currentState.elevation} onChange={(event) => setNumber('elevation', event)} /></label>
              <label className={styles.field}><span>Motion</span><select value={currentState.motion} onChange={(event) => setString('motion', event)}><option value="default">Default</option><option value="reduced">Reduced</option><option value="none">None</option></select></label>
              <label className={styles.field}><span>Inheritance</span><select value={currentState.inheritedFrom ?? ''} onChange={(event) => updateCurrentState({ inheritedFrom: event.target.value ? event.target.value as AppearanceState : null }, 'Changed state inheritance')}><option value="">Explicit values</option>{APPEARANCE_STATES.filter((state) => state !== appearance.activeState).map((state) => <option key={state} value={state}>{state}</option>)}</select></label>
              <label className={styles.field}><span>Selection type</span><select defaultValue="rectangular" onChange={() => updateCurrentState({ selections: [...currentState.selections, { kind: 'rectangular', bounds: { x: 0, y: 0, width: 100, height: 100 } }] }, 'Added selection')}><option value="rectangular">Rectangular</option><option value="elliptical">Elliptical</option><option value="freehand">Freehand</option><option value="path">Path</option><option value="colour-range">Colour range</option></select></label>
              <label className={styles.field}><span>Effects</span><input type="text" value={currentState.layers.find((layer) => layer.id === selectedLayerId)?.effects.join(', ') ?? ''} onChange={(event) => updateLayer(selectedLayerId, { effects: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) }, 'Changed layer effects')} placeholder="Blur, glow, shadow" /></label>
            </div>
          </section>
          <section className={styles.section}>
            <h3>Selected layer and non-destructive geometry</h3>
            <div className={styles.form}>
              <label className={styles.field}><span>Layer opacity</span><input type="range" min="0" max="1" step="0.01" value={currentState.layers.find((layer) => layer.id === selectedLayerId)?.opacity ?? 1} onChange={(event) => updateLayer(selectedLayerId, { opacity: Number(event.target.value) }, 'Changed layer opacity')} /></label>
              <label className={styles.field}><span>Blend mode</span><select value={currentState.layers.find((layer) => layer.id === selectedLayerId)?.blendMode ?? 'normal'} onChange={(event) => updateLayer(selectedLayerId, { blendMode: event.target.value }, 'Changed blend mode')}><option>normal</option><option>multiply</option><option>screen</option><option>overlay</option><option>soft-light</option><option>difference</option></select></label>
              <label className={styles.field}><span>Fill</span><input type="text" value={currentState.layers.find((layer) => layer.id === selectedLayerId)?.fill ?? 'transparent'} onChange={(event) => updateLayer(selectedLayerId, { fill: event.target.value }, 'Changed layer fill')} /></label>
              <label className={styles.field}><span>Stroke and border</span><input type="text" value={currentState.layers.find((layer) => layer.id === selectedLayerId)?.stroke ?? 'transparent'} onChange={(event) => updateLayer(selectedLayerId, { stroke: event.target.value }, 'Changed layer stroke')} /></label>
              <label className={styles.field}><span>Transform X</span><input type="number" value={currentState.layers.find((layer) => layer.id === selectedLayerId)?.transform.x ?? 0} onChange={(event) => { const layer = currentState.layers.find((item) => item.id === selectedLayerId); if (layer) updateLayer(selectedLayerId, { transform: { ...layer.transform, x: Number(event.target.value) } }, 'Changed transform X'); }} /></label>
              <label className={styles.field}><span>Transform Y</span><input type="number" value={currentState.layers.find((layer) => layer.id === selectedLayerId)?.transform.y ?? 0} onChange={(event) => { const layer = currentState.layers.find((item) => item.id === selectedLayerId); if (layer) updateLayer(selectedLayerId, { transform: { ...layer.transform, y: Number(event.target.value) } }, 'Changed transform Y'); }} /></label>
              <label className={styles.field}><span>Width</span><input type="number" min="1" value={currentState.layers.find((layer) => layer.id === selectedLayerId)?.transform.width ?? 100} onChange={(event) => { const layer = currentState.layers.find((item) => item.id === selectedLayerId); if (layer) updateLayer(selectedLayerId, { transform: { ...layer.transform, width: Number(event.target.value) } }, 'Changed transform width'); }} /></label>
              <label className={styles.field}><span>Height</span><input type="number" min="1" value={currentState.layers.find((layer) => layer.id === selectedLayerId)?.transform.height ?? 100} onChange={(event) => { const layer = currentState.layers.find((item) => item.id === selectedLayerId); if (layer) updateLayer(selectedLayerId, { transform: { ...layer.transform, height: Number(event.target.value) } }, 'Changed transform height'); }} /></label>
              <label className={styles.field}><span>Rotation</span><input type="number" min="-360" max="360" value={currentState.layers.find((layer) => layer.id === selectedLayerId)?.transform.rotation ?? 0} onChange={(event) => { const layer = currentState.layers.find((item) => item.id === selectedLayerId); if (layer) updateLayer(selectedLayerId, { transform: { ...layer.transform, rotation: Number(event.target.value) } }, 'Changed transform rotation'); }} /></label>
              <label className={styles.field}><span>Crop and focal point</span><input type="text" value={currentState.overrides.crop ?? 'fit:contain; focal:50%,50%; safe:100%'} onChange={(event) => updateCurrentState({ overrides: { ...currentState.overrides, crop: event.target.value } }, 'Changed crop and focal point')} /></label>
              <label className={styles.field}><span>Channels and masks</span><input type="text" value={`${currentState.channels.join(', ')} | ${currentState.masks.join(', ') || 'none'}`} onChange={(event) => updateCurrentState({ overrides: { ...currentState.overrides, channelsAndMasks: event.target.value } }, 'Changed channels and masks')} /></label>
              <label className={styles.field}><span>Path corners and warp</span><input type="text" value={currentState.overrides.geometry ?? 'path:editable; corners:12; warp:0; perspective:0'} onChange={(event) => updateCurrentState({ overrides: { ...currentState.overrides, geometry: event.target.value } }, 'Changed path geometry')} /></label>
            </div>
          </section>
          <section className={styles.section}>
            <h3>Capability matrix</h3>
            {filteredCapabilities.map((capability) => <div className={styles.capability} key={capability.id}><span>{capability.label}</span><small>{capability.supported ? 'Available' : `Unavailable: ${capability.reason}`}</small></div>)}
          </section>
        </main>
      </div>
    </div>,
    document.body,
  );
}

function toColorInput(value: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000';
}

function readOnlyDisabled(appearance: ElementAppearance): boolean {
  return appearance.updatedAt.length === 0;
}
