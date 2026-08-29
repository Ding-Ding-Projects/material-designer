import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ChangeEvent } from 'react';

import { RegexSearchField } from '../regex/RegexSearchField';
import { useRegexSearch } from '../regex/useRegexSearch';
import { useI18n } from '../../i18n';
import {
  APPEARANCE_CAPABILITIES,
  APPEARANCE_STATES,
  defaultAppearanceStyle,
  defaultElementAppearance,
  getElementAppearance,
  hasElementAppearanceOverride,
  clearAppearanceStateFromElement,
  applyAppearanceStateToElement,
  copyAppearanceStyle,
  resetElementAppearance,
  resetAppearanceProperty,
  resetAppearanceState,
  pasteAppearanceStyle,
  serializeElementAppearance,
  parseElementAppearanceExportText,
  importElementAppearance,
  resolveAppearanceState,
  applyNamedAppearancePreset,
  readNamedAppearancePresets,
  saveNamedAppearancePreset,
  RAINBOW_COLOR_SENTINEL,
  getRainbowSpeedLevel,
  setRainbowSpeedLevel,
  setElementAppearance,
  undoElementAppearance,
  redoElementAppearance,
  didAppearancePersistenceFail,
  getAppearanceHistoryStatus,
  type AppearanceLayer,
  type AppearanceEffect,
  type AppearanceState,
  type AppearanceStateStyle,
  type AppearanceTarget,
  type ElementAppearance,
  type LayerKind,
  type RenderedElement,
} from './elementAppearance';
import styles from './ElementAppearanceEditor.module.css';
import { appearanceCopy } from './copy';
import { InfiniteColorPicker } from './InfiniteColorPicker';
import { CSS_COLOR_NAMES } from './colorNames';
import { formatHex8, parseColor, type Rgba } from './color';

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
  'group',
  'shape',
  'text',
  'image',
  'adjustment',
  'mask',
  'smart-object',
  'effect',
];

const CAPABILITY_LABELS_ZH: Record<string, string> = {
  layers: '圖層及群組', 'layer-visibility': '圖層顯示及次序', 'layer-lock': '圖層鎖定',
  'layer-duplicate': '複製圖層', 'layer-rename': '圖層名稱', 'clipping-masks': '剪裁及向量遮罩',
  selections: '選取及點陣編輯', channels: '色版', adjustments: '調整圖層', 'smart-object': '智慧嵌入內容',
  effects: '效果、填色、描邊及光暈', transform: '變換及仿射幾何', 'warp-perspective': '變形及透視',
  crop: '裁剪、適合、焦點及安全區域', filters: '濾鏡及色彩調整', typography: '文字排版',
  'variable-font-axes': '可變字體軸', 'typography-effects': '文字外框、陰影及光暈', 'typography-script': '上標及下標',
  'typography-baseline': '基線偏移', layout: '間距、版面及高度', motion: '動態及減少動態政策',
  'state-overrides': '狀態繼承及覆寫', 'multi-state-preview': '多狀態預覽', contrast: '對比度診斷',
  'regex-property-search': '帶正則表達式建構器的屬性搜尋', 'portable-presets': '可攜命名預設', 'git-backed-history': 'Git 歷程',
};

const STATE_LABELS: Record<AppearanceState, readonly [string, string]> = {
  normal: ['Normal', '正常'], hover: ['Hover', '懸停'], focus: ['Focus', '焦點'], pressed: ['Pressed', '按下'],
  selected: ['Selected', '已選取'], disabled: ['Disabled', '停用'], dragged: ['Dragged', '拖曳'], validation: ['Validation', '驗證'],
  loading: ['Loading', '載入'], success: ['Success', '成功'], warning: ['Warning', '警告'], error: ['Error', '錯誤'],
};

function panelPosition(target: RenderedElement | null): CSSProperties {
  if (typeof window === 'undefined') return { left: VIEWPORT_MARGIN, top: VIEWPORT_MARGIN, width: PANEL_WIDTH };
  const rect = target?.getBoundingClientRect();
  const width = Math.min(PANEL_WIDTH, Math.max(280, window.innerWidth - VIEWPORT_MARGIN * 2));
  const preferredRight = (rect?.right ?? VIEWPORT_MARGIN) + 6;
  const left = preferredRight + width <= window.innerWidth - VIEWPORT_MARGIN
    ? preferredRight
    : Math.max(VIEWPORT_MARGIN, (rect?.left ?? VIEWPORT_MARGIN) - width - 6);
  const preferredTop = rect?.bottom ? rect.bottom + 6 : VIEWPORT_MARGIN;
  const availableBelow = window.innerHeight - preferredTop - VIEWPORT_MARGIN;
  const top = availableBelow < 420 && (rect?.top ?? VIEWPORT_MARGIN) - 420 >= VIEWPORT_MARGIN
    ? (rect?.top ?? VIEWPORT_MARGIN) - 420
    : Math.max(VIEWPORT_MARGIN, Math.min(preferredTop, window.innerHeight - 420));
  return { left, top, width };
}

function layerCopy(layer: AppearanceLayer): AppearanceLayer {
  return { ...layer, effects: [...layer.effects], effectStack: layer.effectStack.map((effect) => ({ ...effect })), selectionRefs: [...layer.selectionRefs], transform: { ...layer.transform } };
}

export function ElementAppearanceEditor({ target, onClose }: ElementAppearanceEditorProps) {
  const i18n = useI18n();
  const c = useCallback((english: string, cantonese: string) => appearanceCopy(i18n, english, cantonese), [i18n]);
  const [appearance, setAppearance] = useState<ElementAppearance>(() => getElementAppearance(target.id));
  const [selectedLayerId, setSelectedLayerId] = useState('base');
  const [position, setPosition] = useState<CSSProperties>(() => panelPosition(target.element));
  const [status, setStatus] = useState('');
  const [presetName, setPresetName] = useState('');
  const [presets, setPresets] = useState(() => [...readNamedAppearancePresets()]);
  const [installedFonts, setInstalledFonts] = useState<string[]>(() => [...FONT_FAMILIES]);
  const beforeAppearanceRef = useRef<ElementAppearance>(getElementAppearance(target.id));
  const importRef = useRef<HTMLInputElement | null>(null);
  const [propertyQuery, setPropertyQuery] = useState('');
  const propertySearch = useRegexSearch(propertyQuery, setPropertyQuery);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const currentState = appearance.states[appearance.activeState];
  const fontFamilies = useMemo(() => [...new Set([...installedFonts, ...FONT_FAMILIES])], [installedFonts]);
  const selectedLayer = currentState.layers.find((layer) => layer.id === selectedLayerId) ?? currentState.layers[0];
  const rgbaFor = (value: string): Rgba => {
    const direct = parseColor(value, CSS_COLOR_NAMES)?.rgba;
    if (direct) return direct;
    const computed = target.element && typeof window !== 'undefined' ? window.getComputedStyle(target.element).color : '';
    return parseColor(computed, CSS_COLOR_NAMES)?.rgba ?? { r: 143, g: 76, b: 52, a: 1 };
  };

  useEffect(() => {
    if (hasElementAppearanceOverride(target.id)) applyAppearanceStateToElement(target.element, resolveAppearanceState(appearance), appearance.activeState);
  }, [appearance, currentState, target]);

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
    if (typeof document === 'undefined') return;
    const discovered = Array.from(document.fonts ?? [])
      .map((font) => font.family.replace(/^['"]|['"]$/g, '').trim())
      .filter(Boolean);
    if (discovered.length > 0) setInstalledFonts((current) => [...new Set([...current, ...discovered])]);
  }, []);

  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>('input, select, button')?.focus();
  }, []);

  const update = useCallback((patch: Partial<ElementAppearance>, action: string): boolean => {
    const next = { ...appearance, ...patch, updatedAt: new Date().toISOString() };
    if (!setElementAppearance(target.id, next, action)) {
      setStatus(c('Change refused because the appearance value is invalid.', '修改被拒絕，因為外觀值無效。'));
      return false;
    }
    setAppearance(next);
    applyAppearanceStateToElement(target.element, resolveAppearanceState(next), next.activeState);
    const historyStatus = getAppearanceHistoryStatus();
    setStatus(didAppearancePersistenceFail() ? c('Change is live but could not be saved locally.', '修改已即時套用，但未能保存到本機。') : historyStatus.status === 'acknowledged' ? `${action} recorded` : c('Change is pending host history acknowledgement.', '修改等待主機歷程確認。'));
    return true;
  }, [appearance, c, target.element, target.id]);

  const updateCurrentState = useCallback((patch: Partial<AppearanceStateStyle>, action: string) => {
    update({ states: { ...appearance.states, [appearance.activeState]: { ...currentState, ...patch } } }, action);
  }, [appearance.activeState, appearance.states, currentState, update]);

  const updateLayer = useCallback((layerId: string, patch: Partial<AppearanceLayer>, action: string) => {
    const existing = currentState.layers.find((layer) => layer.id === layerId);
    if (existing?.locked && !Object.prototype.hasOwnProperty.call(patch, 'locked')) {
      setStatus('Layer is locked. Unlock it before editing.');
      return;
    }
    updateCurrentState({ layers: currentState.layers.map((layer) => layer.id === layerId ? { ...layer, ...patch } : layer) }, action);
  }, [currentState.layers, setStatus, updateCurrentState]);

  const addLayer = (kind: LayerKind) => {
    const id = `layer-${Date.now()}`;
    const template = currentState.layers[0] ?? defaultAppearanceStyle().layers[0]!;
    updateCurrentState({ layers: [...currentState.layers, { ...layerCopy(template), id, name: `${kind} layer`, kind }] }, 'Added layer');
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

  const deleteLayer = () => {
    if (!selectedLayer || selectedLayer.id === 'base') return;
    updateCurrentState({ layers: currentState.layers.filter((layer) => layer.id !== selectedLayer.id) }, 'Deleted layer');
    setSelectedLayerId(currentState.layers.find((layer) => layer.id !== selectedLayer.id)?.id ?? 'base');
  };

  const renameLayer = (name: string) => {
    if (!selectedLayer) return;
    updateLayer(selectedLayer.id, { name: name.slice(0, 120) }, 'Renamed layer');
  };

  const reparentLayer = (parentId: string) => {
    if (!selectedLayer || parentId === selectedLayer.id) return;
    updateLayer(selectedLayer.id, { parentId: parentId || null }, 'Reparented layer');
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
    clearAppearanceStateFromElement(target.element);
    setStatus('Reset appearance recorded');
  };

  const resetProperty = (property: keyof AppearanceStateStyle) => {
    resetAppearanceProperty(target.id, appearance.activeState, property);
    const next = getElementAppearance(target.id);
    setAppearance(next);
    applyAppearanceStateToElement(target.element, resolveAppearanceState(next), next.activeState);
    setStatus(`Reset ${String(property)} recorded`);
  };

  const resetState = () => {
    resetAppearanceState(target.id, appearance.activeState);
    const next = getElementAppearance(target.id);
    setAppearance(next);
    applyAppearanceStateToElement(target.element, resolveAppearanceState(next), next.activeState);
    setStatus(`Reset ${appearance.activeState} state recorded`);
  };

  const exportAppearance = () => {
    const blob = new Blob([serializeElementAppearance(target.id)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${target.id.replace(/[^a-zA-Z0-9_-]/g, '_')}-appearance.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus('Appearance export prepared');
  };

  const importAppearance = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || file.size > 500_000) {
      setStatus('Appearance import refused: file exceeds the 500000 byte limit');
      return;
    }
    try {
      const parsed = parseElementAppearanceExportText(await file.text());
      if (!parsed || !importElementAppearance(parsed, target.id)) {
        setStatus('Appearance import refused: unsupported or malformed schema');
        return;
      }
      const next = getElementAppearance(target.id);
      setAppearance(next);
      applyAppearanceStateToElement(target.element, resolveAppearanceState(next), next.activeState);
      setStatus('Appearance imported and applied');
    } catch {
      setStatus('Appearance import refused: malformed JSON');
    }
  };

  const savePreset = () => {
    const saved = saveNamedAppearancePreset(presetName, target.id, appearance.activeState);
    if (!saved) {
      setStatus('Preset name is required');
      return;
    }
    setPresets([...readNamedAppearancePresets()]);
    setPresetName('');
    setStatus(`Saved preset ${saved.name}`);
  };

  const applyPreset = (presetId: string) => {
    if (!applyNamedAppearancePreset(target.id, appearance.activeState, presetId)) {
      setStatus('Preset could not be applied');
      return;
    }
    const next = getElementAppearance(target.id);
    setAppearance(next);
    applyAppearanceStateToElement(target.element, resolveAppearanceState(next), next.activeState);
    setStatus('Preset applied and recorded');
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
    <div ref={panelRef} className={styles.shell} style={position} role="dialog" aria-modal="false" aria-label={`${c('Edit appearance for', '編輯外觀：')} ${target.label}`} data-testid="element-appearance-editor" onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); close(); } }}>
      <header className={styles.header}>
        <div>
          <h2>{c('Edit appearance', '編輯外觀')}</h2>
          <p>{target.label} · {target.role} · {target.path}</p>
        </div>
        <button className={styles.close} type="button" onClick={close} aria-label={c('Close appearance editor', '關閉外觀編輯器')}>×</button>
      </header>
      <div className={styles.toolbar} role="toolbar" aria-label={c('Appearance history and workspace tools', '外觀歷程及工作區工具')}>
        <button type="button" onClick={undo} disabled={readOnlyDisabled(appearance)} title={c('Undo the latest appearance change', '撤銷最近一次外觀修改')}>{c('Undo', '撤銷')}</button>
        <button type="button" onClick={redo} title={c('Redo the latest appearance change', '重做最近一次外觀修改')}>{c('Redo', '重做')}</button>
        <button type="button" onClick={reset}>{c('Reset this element', '重設此元素')}</button>
        <button type="button" onClick={resetState}>{c('Reset this state', '重設此狀態')}</button>
        <button type="button" onClick={() => { copyAppearanceStyle(target.id, appearance.activeState); setStatus(c('Style copied', '樣式已複製')); }}>{c('Copy style', '複製樣式')}</button>
        <button type="button" onClick={() => { if (pasteAppearanceStyle(target.id, appearance.activeState)) { const next = getElementAppearance(target.id); setAppearance(next); applyAppearanceStateToElement(target.element, resolveAppearanceState(next), next.activeState); setStatus(c('Style pasted and applied', '樣式已貼上並套用')); } else setStatus(c('Nothing to paste', '沒有可貼上的樣式')); }}>{c('Paste style', '貼上樣式')}</button>
        <button type="button" onClick={exportAppearance}>{c('Export appearance', '匯出外觀')}</button>
        <button type="button" onClick={() => importRef.current?.click()}>{c('Import appearance', '匯入外觀')}</button>
        <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(event) => { void importAppearance(event); }} aria-label={c('Import appearance JSON', '匯入外觀 JSON')} />
        <input type="text" value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder={c('Preset name', '預設名稱')} aria-label={c('Preset name', '預設名稱')} maxLength={120} />
        <button type="button" onClick={savePreset}>{c('Save named preset', '儲存命名預設')}</button>
        <AppearanceSelect id="appearance-preset" label={c('Apply named preset', '套用命名預設')} value="" options={[{ value: '', label: c('Apply preset…', '套用預設…') }, ...presets.map((preset) => ({ value: preset.id, label: preset.name }))]} onChange={(value) => { if (value) applyPreset(value); }} />
        <AppearanceSelect id="appearance-reset-property" label={c('Reset property', '重設屬性')} value="fontFamily" options={['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'wordSpacing', 'textColor', 'highlightColor', 'underline', 'strike', 'overline', 'capitalization', 'textDirection', 'alignment', 'borderRadius', 'elevation', 'motion', 'rainbowSpeedLevel'].map((value) => ({ value, label: value }))} onChange={(value) => resetProperty(value as keyof AppearanceStateStyle)} />
        <button type="button" onClick={() => update({ rulers: !appearance.rulers }, 'Changed rulers')}>{appearance.rulers ? c('Hide rulers', '隱藏尺規') : c('Show rulers', '顯示尺規')}</button>
        <button type="button" onClick={() => update({ guides: !appearance.guides }, 'Changed guides')}>{appearance.guides ? c('Hide guides', '隱藏導線') : c('Show guides', '顯示導線')}</button>
        <label>{c('Zoom', '縮放')} <input type="range" min="0.25" max="4" step="0.25" value={appearance.zoom} onChange={(event) => update({ zoom: Number(event.target.value) }, 'Changed zoom')} aria-label={c('Preview zoom', '預覽縮放')} /></label>
      </div>
      <div className={styles.body}>
        <aside className={styles.rail} aria-label={c('Layer workspace', '圖層工作區')}>
          <section className={styles.section}>
            <h3>{c('States', '狀態')}</h3>
            <div className={styles.stateTabs} role="tablist" aria-label={c('Element appearance states', '元素外觀狀態')}>
              {APPEARANCE_STATES.map((state) => (
                <button key={state} type="button" role="tab" aria-selected={appearance.activeState === state} onClick={() => update({ activeState: state }, `Selected ${state} state`)}>{c(...STATE_LABELS[state])}</button>
              ))}
            </div>
          </section>
          <section className={styles.section}>
            <h3>{c('Layers and groups', '圖層及群組')}</h3>
            {currentState.layers.map((layer) => (
              <div className={styles.layer} key={layer.id} data-selected={selectedLayerId === layer.id}>
                <button type="button" onClick={() => updateLayer(layer.id, { visible: !layer.visible }, 'Changed layer visibility')} aria-label={`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`}>{layer.visible ? '◉' : '○'}</button>
                <button type="button" className={styles.layerName} onClick={() => setSelectedLayerId(layer.id)} aria-pressed={selectedLayerId === layer.id}>{layer.name}<span className={styles.layerMeta}>{layer.kind} · {Math.round(layer.opacity * 100)}%</span></button>
                <button type="button" onClick={() => updateLayer(layer.id, { locked: !layer.locked }, 'Changed layer lock')} aria-label={`${layer.locked ? 'Unlock' : 'Lock'} ${layer.name}`}>{layer.locked ? '🔒' : '◇'}</button>
              </div>
            ))}
            <div className={styles.toolbar}>
              <AppearanceSelect id="appearance-layer-kind" label={c('New layer type', '新圖層類型')} value="shape" options={LAYER_KINDS.map((kind) => ({ value: kind, label: kind }))} onChange={(value) => addLayer(value as LayerKind)} />
              <button type="button" onClick={() => addLayer('shape')}>{c('Add', '新增')}</button>
              <button type="button" onClick={duplicateLayer}>{c('Duplicate', '複製')}</button>
              <button type="button" onClick={() => moveLayer(-1)}>{c('Up', '上移')}</button>
              <button type="button" onClick={() => moveLayer(1)}>{c('Down', '下移')}</button>
              <button type="button" onClick={deleteLayer} disabled={!selectedLayer || selectedLayer.id === 'base'}>{c('Delete', '刪除')}</button>
            </div>
            {selectedLayer ? <div className={styles.form}>
              <label className={`${styles.field} ${styles.wide}`}><span>{c('Layer name', '圖層名稱')}</span><input value={selectedLayer.name} onChange={(event) => renameLayer(event.target.value)} maxLength={120} aria-label={c('Layer name', '圖層名稱')} /></label>
              <AppearanceSelect id="appearance-parent" label={c('Parent group', '上層群組')} value={selectedLayer.parentId ?? ''} options={[{ value: '', label: 'Root' }, ...currentState.layers.filter((layer) => layer.id !== selectedLayer.id && layer.kind === 'group').map((layer) => ({ value: layer.id, label: layer.name }))]} onChange={reparentLayer} />
            </div> : null}
          </section>
        </aside>
        <main className={styles.inspector} aria-label={c('Appearance property inspector', '外觀屬性檢查器')}>
          <RegexSearchField search={propertySearch} fieldLabel={c('appearance properties', '外觀屬性')} ariaLabel={c('Search appearance properties', '搜尋外觀屬性')} placeholder={c('Search properties', '搜尋屬性')} testId="element-appearance-property-search" />
          <p className={styles.status} role="status" aria-live="polite">{status || `${filteredCapabilities.length} capabilities shown`}</p>
          <section className={styles.section} aria-label={c('Before and after preview', '修改前後預覽')}>
            <h3>{c('Before and after preview', '修改前後預覽')}</h3>
            <div className={styles.form}>
              <div className={styles.field}><span>{c('Before', '修改前')}</span><div style={previewStyleFor(resolveAppearanceState(beforeAppearanceRef.current))}>{target.label}</div></div>
              <div className={styles.field}><span>{c('After', '修改後')}</span><div style={previewStyleFor(resolveAppearanceState(appearance))}>{target.label}</div></div>
            </div>
            <h3>{c('All-state preview', '全部狀態預覽')}</h3>
            <div className={styles.stateTabs} data-testid="element-appearance-state-preview">
              {APPEARANCE_STATES.map((state) => <button key={state} type="button" aria-pressed={appearance.activeState === state} onClick={() => { update({ activeState: state }, `Selected ${state} state`); }}>{c(...STATE_LABELS[state])}<span style={previewStyleFor(resolveAppearanceState(appearance, state))}>Aa</span></button>)}
            </div>
          </section>
          <section className={styles.section}>
            <h3>{c('Word-depth typography', '文字排版工具')}</h3>
            <div className={styles.form}>
              <label className={styles.field}><span>{c('Font family (installed and bundled)', '字體（已安裝及內置）')}</span><AppearanceSelect id="appearance-font-family" label={c('Font family', '字體')} value={currentState.fontFamily} options={fontFamilies.map((font) => ({ value: font, label: font }))} onChange={(value) => updateCurrentState({ fontFamily: value }, 'Changed font family')} /><button type="button" onClick={() => resetProperty('fontFamily')}>{c('Reset property', '重設屬性')}</button></label>
              <label className={styles.field}><span>{c('Font size (px)', '字體大小（px）')}</span><input type="number" min="6" max="160" value={currentState.fontSize} onChange={(event) => setNumber('fontSize', event)} aria-label={c('Font size (px)', '字體大小（px）')} /><button type="button" onClick={() => resetProperty('fontSize')}>{c('Reset property', '重設屬性')}</button></label>
              <label className={styles.field}><span>{c('Weight', '字重')}</span><input type="number" min="100" max="900" step="100" value={currentState.fontWeight} onChange={(event) => setNumber('fontWeight', event)} aria-label={c('Weight', '字重')} /><button type="button" onClick={() => resetProperty('fontWeight')}>{c('Reset property', '重設屬性')}</button></label>
              <label className={styles.field}><span>{c('Line height', '行高')}</span><input type="number" min="0.5" max="4" step="0.05" value={currentState.lineHeight} onChange={(event) => setNumber('lineHeight', event)} aria-label={c('Line height', '行高')} /><button type="button" onClick={() => resetProperty('lineHeight')}>{c('Reset property', '重設屬性')}</button></label>
              <div className={`${styles.field} ${styles.wide}`}><span>{c('Text color and translator', '文字顏色及轉換器')}</span><InfiniteColorPicker value={rgbaFor(currentState.textColor)} onChange={(value) => updateCurrentState({ textColor: formatHex8(value) }, 'Changed text color')} label={c('Text color', '文字顏色')} background={{ r: 255, g: 255, b: 255 }} /><button type="button" onClick={() => updateCurrentState({ textColor: RAINBOW_COLOR_SENTINEL }, 'Enabled rainbow color')}>{c('Use animated rainbow', '使用動畫彩虹')}</button></div>
              <div className={`${styles.field} ${styles.wide}`}><span>{c('Highlight color and translator', '標記顏色及轉換器')}</span><InfiniteColorPicker value={rgbaFor(currentState.highlightColor)} onChange={(value) => updateCurrentState({ highlightColor: formatHex8(value) }, 'Changed highlight color')} label={c('Highlight color', '標記顏色')} background={{ r: 255, g: 255, b: 255 }} /></div>
              <label className={styles.field}><span>{c('Letter spacing (em)', '字距（em）')}</span><input type="number" min="-1" max="2" step="0.01" value={currentState.letterSpacing} onChange={(event) => setNumber('letterSpacing', event)} aria-label={c('Letter spacing (em)', '字距（em）')} /></label>
              <label className={styles.field}><span>{c('Word spacing (em)', '字詞距（em）')}</span><input type="number" min="-1" max="4" step="0.01" value={currentState.wordSpacing} onChange={(event) => setNumber('wordSpacing', event)} aria-label={c('Word spacing (em)', '字詞距（em）')} /></label>
              <AppearanceSelect id="appearance-underline" label={c('Underline', '底線')} value={currentState.underline} options={['none', 'single', 'double', 'wavy'].map((value) => ({ value, label: value }))} onChange={(value) => updateCurrentState({ underline: value as AppearanceStateStyle['underline'] }, 'Changed underline')} />
              <AppearanceSelect id="appearance-strike" label={c('Strikethrough', '刪除線')} value={currentState.strike} options={['none', 'single', 'double'].map((value) => ({ value, label: value }))} onChange={(value) => updateCurrentState({ strike: value as AppearanceStateStyle['strike'] }, 'Changed strikethrough')} />
              <AppearanceSelect id="appearance-capitalization" label={c('Capitalization', '大小寫')} value={currentState.capitalization} options={['none', 'uppercase', 'lowercase', 'capitalize', 'small-caps'].map((value) => ({ value, label: value }))} onChange={(value) => updateCurrentState({ capitalization: value as AppearanceStateStyle['capitalization'] }, 'Changed capitalization')} />
              <AppearanceSelect id="appearance-alignment" label={c('Alignment', '對齊')} value={currentState.alignment} options={['start', 'center', 'end', 'justify'].map((value) => ({ value, label: value }))} onChange={(value) => updateCurrentState({ alignment: value as AppearanceStateStyle['alignment'] }, 'Changed alignment')} />
              <AppearanceSelect id="appearance-direction" label={c('Text direction', '文字方向')} value={currentState.textDirection} options={['auto', 'ltr', 'rtl'].map((value) => ({ value, label: value }))} onChange={(value) => updateCurrentState({ textDirection: value as AppearanceStateStyle['textDirection'] }, 'Changed text direction')} />
              <label className={styles.field}><span>{c('Italic and overline', '斜體及頂線')}</span><input type="checkbox" checked={currentState.italic} onChange={(event) => setBoolean('italic', event)} aria-label={c('Italic', '斜體')} /><input type="checkbox" checked={currentState.overline} onChange={(event) => setBoolean('overline', event)} aria-label={c('Overline', '頂線')} /></label>
              <label className={styles.field}><span>{c('Bold and oblique', '粗體及傾斜')}</span><input type="checkbox" checked={currentState.bold} onChange={(event) => setBoolean('bold', event)} aria-label={c('Bold', '粗體')} /><input type="checkbox" checked={currentState.oblique} onChange={(event) => setBoolean('oblique', event)} aria-label={c('Oblique', '傾斜')} /></label>
              <label className={styles.field}><span>{c('Small caps, superscript and subscript', '小型大寫、上標及下標')}</span><input type="checkbox" checked={currentState.smallCaps} onChange={(event) => setBoolean('smallCaps', event)} aria-label={c('Small caps', '小型大寫')} /><input type="checkbox" checked={currentState.superscript} onChange={(event) => setBoolean('superscript', event)} aria-label={c('Superscript', '上標')} /><input type="checkbox" checked={currentState.subscript} onChange={(event) => setBoolean('subscript', event)} aria-label={c('Subscript', '下標')} /></label>
              <div className={`${styles.field} ${styles.wide}`}><span>{c('Underline color', '底線顏色')}</span><InfiniteColorPicker value={rgbaFor(currentState.underlineColor)} onChange={(value) => updateCurrentState({ underlineColor: formatHex8(value) }, 'Changed underline color')} label={c('Underline color', '底線顏色')} background={{ r: 255, g: 255, b: 255 }} /></div>
              <label className={styles.field}><span>{c('Outline color', '外框顏色')}</span><input type="text" value={currentState.outlineColor} onChange={(event) => setString('outlineColor', event)} aria-label={c('Outline color', '外框顏色')} /></label>
              <label className={styles.field}><span>{c('Outline width', '外框寬度')}</span><input type="number" min="0" max="100" value={currentState.outlineWidth} onChange={(event) => setNumber('outlineWidth', event)} aria-label={c('Outline width', '外框寬度')} /></label>
              <label className={styles.field}><span>{c('Text shadow', '文字陰影')}</span><input type="text" value={currentState.textShadow} onChange={(event) => setString('textShadow', event)} aria-label={c('Text shadow', '文字陰影')} /></label>
              <label className={styles.field}><span>{c('Text glow', '文字光暈')}</span><input type="text" value={currentState.textGlow} onChange={(event) => setString('textGlow', event)} aria-label={c('Text glow', '文字光暈')} /></label>
              <label className={styles.field}><span>{c('Baseline offset', '基線偏移')}</span><input type="number" min="-10000" max="10000" value={currentState.baselineOffset} onChange={(event) => setNumber('baselineOffset', event)} aria-label={c('Baseline offset', '基線偏移')} /></label>
            </div>
          </section>
          <section className={styles.section}>
            <h3>{c('Image, shape and layout workspace', '圖片、形狀及版面工作區')}</h3>
            <div className={styles.form}>
              <label className={styles.field}><span>{c('Border radius', '圓角半徑')}</span><input type="number" min="0" max="500" value={currentState.borderRadius} onChange={(event) => setNumber('borderRadius', event)} aria-label={c('Border radius', '圓角半徑')} /></label>
              <label className={styles.field}><span>{c('Elevation', '高度')}</span><input type="number" min="0" max="48" value={currentState.elevation} onChange={(event) => setNumber('elevation', event)} aria-label={c('Elevation', '高度')} /></label>
              <AppearanceSelect id="appearance-motion" label={c('Motion', '動態')} value={currentState.motion} options={['default', 'reduced', 'none'].map((value) => ({ value, label: value }))} onChange={(value) => updateCurrentState({ motion: value as AppearanceStateStyle['motion'] }, 'Changed motion')} />
              <label className={styles.field}><span>{c('Rainbow speed level', '彩虹速度級別')}</span><input type="range" min="1" max="5" step="1" value={getRainbowSpeedLevel()} onChange={(event) => { setRainbowSpeedLevel(Number(event.target.value)); updateCurrentState({ rainbowSpeedLevel: getRainbowSpeedLevel() }, 'Changed global rainbow speed'); }} aria-label={c('Rainbow speed level', '彩虹速度級別')} /><small>{c('1 is slowest, 5 is fastest. One duration is shared across all rainbow targets.', '1 最慢，5 最快。所有彩虹元素共用一個時長。')}</small></label>
              <AppearanceSelect id="appearance-inheritance" label={c('Inheritance', '繼承')} value={currentState.inheritedFrom ?? ''} options={[{ value: '', label: 'Explicit values' }, ...APPEARANCE_STATES.filter((state) => state !== appearance.activeState).map((state) => ({ value: state, label: state }))]} onChange={(value) => updateCurrentState({ inheritedFrom: value ? value as AppearanceState : null }, 'Changed state inheritance')} />
              <AppearanceSelect id="appearance-selection" label={c('Selection type', '選取類型')} value="rectangular" options={['rectangular', 'elliptical', 'freehand', 'path', 'colour-range'].map((value) => ({ value, label: value }))} onChange={(value) => updateCurrentState({ selections: [...currentState.selections, { id: `selection-${Date.now()}`, kind: value as AppearanceStateStyle['selections'][number]['kind'], bounds: { x: 0, y: 0, width: 100, height: 100 }, points: [], feather: 0, inverted: false }] }, 'Added selection')} />
              <label className={styles.field}><span>{c('Effects', '效果')}</span><input type="text" value={currentState.layers.find((layer) => layer.id === selectedLayerId)?.effectStack.map((effect) => effect.name).join(', ') ?? ''} onChange={(event) => {
                const effectKinds = event.target.value.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
                const supportedKinds = ['blur', 'shadow', 'glow', 'stroke', 'gradient', 'pattern', 'backdrop', 'filter'] as const;
                const effects: AppearanceEffect[] = effectKinds.map((name, index) => ({
                  id: `effect-${Date.now()}-${index}`,
                  name,
                  kind: supportedKinds.includes(name as (typeof supportedKinds)[number]) ? name as AppearanceEffect['kind'] : 'filter',
                  enabled: true,
                  opacity: 1,
                  color: 'rgb(0 0 0 / 24%)',
                  radius: 2,
                  distance: 2,
                  angle: 90,
                  spread: 0,
                  blendMode: 'normal',
                }));
                updateLayer(selectedLayerId, { effects: effects.map((effect) => effect.id), effectStack: effects }, 'Changed layer effects');
              }} placeholder={c('Blur, glow, shadow', '模糊、光暈、陰影')} aria-label={c('Effects', '效果')} /></label>
            </div>
          </section>
          <section className={styles.section}>
            <h3>{c('Selected layer and non-destructive geometry', '選取圖層及非破壞性幾何')}</h3>
            <div className={styles.form}>
              <label className={styles.field}><span>{c('Layer opacity', '圖層不透明度')}</span><input type="range" min="0" max="1" step="0.01" value={currentState.layers.find((layer) => layer.id === selectedLayerId)?.opacity ?? 1} onChange={(event) => updateLayer(selectedLayerId, { opacity: Number(event.target.value) }, 'Changed layer opacity')} aria-label={c('Layer opacity', '圖層不透明度')} /></label>
              <AppearanceSelect id="appearance-blend" label={c('Blend mode', '混合模式')} value={selectedLayer?.blendMode ?? 'normal'} options={['normal', 'multiply', 'screen', 'overlay', 'soft-light', 'difference'].map((value) => ({ value, label: value }))} onChange={(value) => updateLayer(selectedLayerId, { blendMode: value }, 'Changed blend mode')} />
              <label className={styles.field}><span>{c('Fill', '填色')}</span><input type="text" value={currentState.layers.find((layer) => layer.id === selectedLayerId)?.fill ?? 'transparent'} onChange={(event) => updateLayer(selectedLayerId, { fill: event.target.value }, 'Changed layer fill')} aria-label={c('Fill', '填色')} /></label>
              <label className={styles.field}><span>{c('Stroke and border', '描邊及邊框')}</span><input type="text" value={currentState.layers.find((layer) => layer.id === selectedLayerId)?.stroke ?? 'transparent'} onChange={(event) => updateLayer(selectedLayerId, { stroke: event.target.value }, 'Changed layer stroke')} aria-label={c('Stroke and border', '描邊及邊框')} /></label>
              <label className={styles.field}><span>{c('Transform X', '變換 X')}</span><input type="number" value={currentState.layers.find((layer) => layer.id === selectedLayerId)?.transform.x ?? 0} onChange={(event) => { const layer = currentState.layers.find((item) => item.id === selectedLayerId); if (layer) updateLayer(selectedLayerId, { transform: { ...layer.transform, x: Number(event.target.value) } }, 'Changed transform X'); }} aria-label={c('Transform X', '變換 X')} /></label>
              <label className={styles.field}><span>{c('Transform Y', '變換 Y')}</span><input type="number" value={currentState.layers.find((layer) => layer.id === selectedLayerId)?.transform.y ?? 0} onChange={(event) => { const layer = currentState.layers.find((item) => item.id === selectedLayerId); if (layer) updateLayer(selectedLayerId, { transform: { ...layer.transform, y: Number(event.target.value) } }, 'Changed transform Y'); }} aria-label={c('Transform Y', '變換 Y')} /></label>
              <label className={styles.field}><span>{c('Width', '闊度')}</span><input type="number" min="1" value={currentState.layers.find((layer) => layer.id === selectedLayerId)?.transform.width ?? 100} onChange={(event) => { const layer = currentState.layers.find((item) => item.id === selectedLayerId); if (layer) updateLayer(selectedLayerId, { transform: { ...layer.transform, width: Number(event.target.value) } }, 'Changed transform width'); }} aria-label={c('Width', '闊度')} /></label>
              <label className={styles.field}><span>{c('Height', '高度')}</span><input type="number" min="1" value={currentState.layers.find((layer) => layer.id === selectedLayerId)?.transform.height ?? 100} onChange={(event) => { const layer = currentState.layers.find((item) => item.id === selectedLayerId); if (layer) updateLayer(selectedLayerId, { transform: { ...layer.transform, height: Number(event.target.value) } }, 'Changed transform height'); }} aria-label={c('Height', '高度')} /></label>
              <label className={styles.field}><span>{c('Rotation', '旋轉')}</span><input type="number" min="-360" max="360" value={currentState.layers.find((layer) => layer.id === selectedLayerId)?.transform.rotation ?? 0} onChange={(event) => { const layer = currentState.layers.find((item) => item.id === selectedLayerId); if (layer) updateLayer(selectedLayerId, { transform: { ...layer.transform, rotation: Number(event.target.value) } }, 'Changed transform rotation'); }} aria-label={c('Rotation', '旋轉')} /></label>
              <label className={styles.field}><span>{c('Crop and focal point', '裁剪及焦點')}</span><input type="text" value={String(currentState.overrides.crop ?? 'fit:contain; focal:50%,50%; safe:100%')} onChange={(event) => updateCurrentState({ overrides: { ...currentState.overrides, crop: event.target.value } }, 'Changed crop and focal point')} aria-label={c('Crop and focal point', '裁剪及焦點')} /></label>
              <label className={styles.field}><span>{c('Channels and masks', '色版及遮罩')}</span><input type="text" value={`${currentState.channels.join(', ')} | ${currentState.masks.join(', ') || 'none'}`} onChange={(event) => updateCurrentState({ overrides: { ...currentState.overrides, channelsAndMasks: event.target.value } }, 'Changed channels and masks')} aria-label={c('Channels and masks', '色版及遮罩')} /></label>
              <label className={styles.field}><span>{c('Path corners and warp', '路徑角點及變形')}</span><input type="text" value={String(currentState.overrides.geometry ?? 'path:editable; corners:12; warp:0; perspective:0')} onChange={(event) => updateCurrentState({ overrides: { ...currentState.overrides, geometry: event.target.value } }, 'Changed path geometry')} aria-label={c('Path corners and warp', '路徑角點及變形')} /></label>
            </div>
          </section>
          <section className={styles.section}>
            <h3>{c('Capability matrix', '能力矩陣')}</h3>
            {filteredCapabilities.map((capability) => <div className={styles.capability} key={capability.id}><span>{c(capability.label, CAPABILITY_LABELS_ZH[capability.id] ?? '外觀能力')}</span><small>{capability.supported ? c('Available', '可用') : c(`Unavailable: ${capability.reason}`, `不可用：${capability.reason}`)}</small></div>)}
          </section>
        </main>
      </div>
    </div>,
    document.body,
  );
}

function readOnlyDisabled(appearance: ElementAppearance): boolean {
  return appearance.updatedAt.length === 0;
}

interface AppearanceSelectProps {
  id: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}

function AppearanceSelect({ id, label, value, options, onChange }: AppearanceSelectProps) {
  const [query, setQuery] = useState('');
  const search = useRegexSearch(query, setQuery);
  const visible = options.filter((option) => search.matches(`${option.label} ${option.value}`));
  return <div className={styles.field} data-appearance-dropdown={id}>
    <RegexSearchField search={search} fieldLabel={label} ariaLabel={`Search ${label}`} placeholder={`Search ${label}`} testId={`${id}-search`} />
    <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      {visible.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
    <small role="status" aria-live="polite">{visible.length} options shown</small>
  </div>;
}

function previewStyleFor(state: AppearanceStateStyle): CSSProperties {
  const visibleLayers = state.layers.filter((layer) => layer.visible);
  const top = visibleLayers.at(-1);
  return {
    color: state.textColor === RAINBOW_COLOR_SENTINEL ? '#ffffff' : state.textColor,
    background: state.textColor === RAINBOW_COLOR_SENTINEL ? 'linear-gradient(90deg, #ff004c, #20d860, #00b7ff, #8b5cf6)' : top?.fill,
    fontFamily: state.fontFamily,
    fontSize: `${state.fontSize}px`,
    fontWeight: state.fontWeight,
    fontStyle: state.italic ? 'italic' : 'normal',
    borderRadius: `${state.borderRadius}px`,
    opacity: visibleLayers.reduce((value, layer) => value * layer.opacity, 1),
    padding: '8px',
    minHeight: '40px',
  };
}
