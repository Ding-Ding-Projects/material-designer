import { useEffect, useLayoutEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { SettingsSection } from '../SettingsDialog';

type TabStyle = { background: string; color: string; fontSize: number; radius: number };
const defaults: TabStyle = { background: '', color: '', fontSize: 14, radius: 12 };
const keyFor = (section: SettingsSection) => `open-design:settings-tab-appearance:${section}`;

function readStyle(section: SettingsSection): TabStyle {
  try {
    const value = JSON.parse(localStorage.getItem(keyFor(section)) ?? 'null') as Partial<TabStyle> | null;
    return value && typeof value === 'object' ? { ...defaults, ...value } : defaults;
  } catch { return defaults; }
}

export function SettingsTabAppearancePopover({ section, anchor, onClose }: { section: SettingsSection; anchor: HTMLButtonElement; onClose: () => void }) {
  const [style, setStyle] = useState(() => readStyle(section));
  const [position, setPosition] = useState<CSSProperties>({ position: 'fixed', left: 12, top: 12 });
  useLayoutEffect(() => {
    const place = () => { const rect = anchor.getBoundingClientRect(); setPosition({ position: 'fixed', zIndex: 10020, left: Math.max(12, Math.min(rect.right + 8, innerWidth - 340)), top: Math.max(12, Math.min(rect.top, innerHeight - 360)), width: 320 }); };
    place(); addEventListener('resize', place); addEventListener('scroll', place, true);
    return () => { removeEventListener('resize', place); removeEventListener('scroll', place, true); };
  }, [anchor]);
  useEffect(() => {
    anchor.style.background = style.background;
    anchor.style.color = style.color;
    anchor.style.fontSize = `${style.fontSize}px`;
    anchor.style.borderRadius = `${style.radius}px`;
    localStorage.setItem(keyFor(section), JSON.stringify(style));
  }, [anchor, section, style]);
  const close = () => { onClose(); anchor.focus({ preventScroll: true }); };
  return createPortal(<section role="dialog" aria-modal="false" aria-label={`Edit ${section} tab appearance`} style={position} className="settings-general-block" data-testid="settings-tab-appearance-editor">
    <h3>Edit tab appearance</h3><p>Changes apply only to the {section} tab.</p>
    <label className="field"><span>Text color</span><input type="color" value={style.color || '#1d1b20'} onChange={(event) => setStyle((current) => ({ ...current, color: event.currentTarget.value }))} /></label>
    <label className="field"><span>Background color</span><input type="color" value={style.background || '#f7f2fa'} onChange={(event) => setStyle((current) => ({ ...current, background: event.currentTarget.value }))} /></label>
    <label className="field"><span>Font size</span><input type="number" min={10} max={32} value={style.fontSize} onChange={(event) => setStyle((current) => ({ ...current, fontSize: Math.max(10, Math.min(32, Number(event.currentTarget.value))) }))} /></label>
    <label className="field"><span>Corner radius</span><input type="range" min={0} max={32} value={style.radius} onChange={(event) => setStyle((current) => ({ ...current, radius: Number(event.currentTarget.value) }))} /></label>
    <button type="button" onClick={() => setStyle(defaults)}>Reset this tab</button><button type="button" onClick={close}>Close</button>
  </section>, document.body);
}
