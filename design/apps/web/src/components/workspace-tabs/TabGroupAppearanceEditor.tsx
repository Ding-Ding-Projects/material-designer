// "Edit group appearance…", as an anchored non-modal popover.
//
// Anchored, because the thing being edited is on screen and the edit is live:
// a modal would cover the header whose colour the user is choosing. It tracks
// its anchor while open, flips above when there is more room there, bounds
// itself to the viewport and scrolls inside that bound rather than hiding what
// did not fit, and returns focus to the control that opened it on close — the
// same contract `RegexSearchField`'s builder popover already keeps.
//
// Every control writes one property and every property has its own reset, plus
// a reset for the whole group. Reset is deletion, not a stored default, so a
// group that has been reset follows the theme afterwards rather than being
// pinned to whatever the theme happened to be at the moment of the reset.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useT } from '../../i18n';
import { Icon } from '../Icon';
import { InfiniteColorPicker } from '../appearance/InfiniteColorPicker';
import { formatHex, parseHex, type Rgb, type Rgba } from '../appearance/color';
import styles from './TabGroupAppearanceEditor.module.css';
import {
  MAX_TAB_GROUP_BADGE_LENGTH,
  TAB_GROUP_FONT_SIZE_RANGE,
  TAB_GROUP_FONT_WEIGHTS,
  TAB_GROUP_RADIUS_RANGE,
  type TabGroupDecoration,
  type TabGroupDecorationProperty,
} from './groupAppearance';
import { tabGroupDisplayName, type WorkspaceTabGroup } from './tabGroups';

const POPOVER_WIDTH = 320;
const VIEWPORT_MARGIN = 12;
const MIN_ROOM_BELOW = 320;
/** The contrast readout needs something to measure against. The header sits on
 *  the chrome, which is near-black in the dark theme and near-white in light;
 *  this is the dark value, and it is a readout input only — nothing is stored
 *  from it, so a light-theme reading is conservative rather than wrong. */
const CONTRAST_BACKGROUND: Rgb = { r: 24, g: 24, b: 27 };

type ColorProperty = Extract<
  TabGroupDecorationProperty,
  'accent' | 'labelColor' | 'background'
>;

export interface TabGroupAppearanceEditorProps {
  group: WorkspaceTabGroup;
  decoration: TabGroupDecoration;
  anchor: DOMRect;
  onChange: <K extends TabGroupDecorationProperty>(
    property: K,
    value: TabGroupDecoration[K] | undefined,
  ) => void;
  onResetAll: () => void;
  onClose: () => void;
}

interface Placement {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  above: boolean;
}

function placeFor(anchor: DOMRect): Placement {
  if (typeof window === 'undefined') {
    return { top: 0, left: 0, width: POPOVER_WIDTH, maxHeight: 480, above: false };
  }
  const width = Math.max(240, Math.min(POPOVER_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2));
  const left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(anchor.left, window.innerWidth - width - VIEWPORT_MARGIN),
  );
  const below = window.innerHeight - anchor.bottom - VIEWPORT_MARGIN;
  const above = anchor.top - VIEWPORT_MARGIN;
  const placeAbove = below < MIN_ROOM_BELOW && above > below;
  return {
    left,
    width,
    top: placeAbove ? anchor.top - 6 : anchor.bottom + 6,
    maxHeight: Math.max(200, (placeAbove ? above : below) - 6),
    above: placeAbove,
  };
}

export function TabGroupAppearanceEditor({
  group,
  decoration,
  anchor,
  onChange,
  onResetAll,
  onClose,
}: TabGroupAppearanceEditorProps) {
  const t = useT();
  const titleId = useId();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [placement, setPlacement] = useState<Placement>(() => placeFor(anchor));
  const [openPicker, setOpenPicker] = useState<ColorProperty | null>(null);

  const name = tabGroupDisplayName(group, t('workspaceTabs.groupUntitled'));

  useEffect(() => {
    const reposition = () => setPlacement(placeFor(anchor));
    reposition();
    if (typeof window === 'undefined') return;
    window.addEventListener('resize', reposition);
    // Capture phase: the strip and the popover that opened this can both scroll.
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [anchor]);

  // Non-modal, so an outside press dismisses rather than being swallowed.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && cardRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('mousedown', onPointerDown, true);
    return () => document.removeEventListener('mousedown', onPointerDown, true);
  }, [onClose]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const frame = window.requestAnimationFrame(() => {
      cardRef.current?.querySelector<HTMLElement>('button, input, select')?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const colorRows = useMemo(
    () =>
      [
        { property: 'accent' as const, labelKey: 'workspaceTabs.groupAppearanceAccent' as const },
        { property: 'labelColor' as const, labelKey: 'workspaceTabs.groupAppearanceLabelColor' as const },
        { property: 'background' as const, labelKey: 'workspaceTabs.groupAppearanceBackground' as const },
      ],
    [],
  );

  const emitColor = useCallback(
    (property: ColorProperty, next: Rgba) => {
      onChange(property, formatHex(next));
    },
    [onChange],
  );

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={cardRef}
      className={styles.card}
      role="dialog"
      aria-labelledby={titleId}
      data-testid="tab-group-appearance-editor"
      style={{
        position: 'fixed',
        top: placement.top,
        left: placement.left,
        width: placement.width,
        maxHeight: placement.maxHeight,
        transform: placement.above ? 'translateY(-100%)' : undefined,
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <div className={styles.head}>
        <h2 className={styles.title} id={titleId}>
          {t('workspaceTabs.groupAppearanceTitle', { name })}
        </h2>
        <button
          type="button"
          className={styles.close}
          aria-label={t('workspaceTabs.groupAppearanceClose')}
          onClick={onClose}
        >
          <Icon name="close" size={12} aria-hidden />
        </button>
      </div>

      {colorRows.map(({ property, labelKey }) => {
        const stored = decoration[property];
        const rgba: Rgba = parseHex(stored ?? '') ?? { r: 122, g: 162, b: 247, a: 1 };
        const open = openPicker === property;
        return (
          <div className={styles.row} key={property}>
            <div className={styles.rowHead}>
              <button
                type="button"
                className={styles.rowToggle}
                aria-expanded={open}
                onClick={() => setOpenPicker(open ? null : property)}
              >
                <span
                  className={styles.rowSwatch}
                  style={{ background: stored ?? 'transparent' }}
                  aria-hidden
                />
                <span>{t(labelKey)}</span>
                <span className={styles.rowValue}>
                  {stored ?? t('workspaceTabs.groupAppearanceDefault')}
                </span>
              </button>
              <button
                type="button"
                className={styles.reset}
                disabled={stored === undefined}
                aria-label={`${t('workspaceTabs.groupAppearanceReset')} — ${t(labelKey)}`}
                onClick={() => onChange(property, undefined)}
              >
                {t('workspaceTabs.groupAppearanceReset')}
              </button>
            </div>
            {open ? (
              <InfiniteColorPicker
                value={rgba}
                onChange={(next) => emitColor(property, next)}
                label={t(labelKey)}
                background={CONTRAST_BACKGROUND}
              />
            ) : null}
          </div>
        );
      })}

      <div className={styles.row}>
        <div className={styles.rowHead}>
          <label className={styles.fieldLabel} htmlFor={`${titleId}-weight`}>
            {t('workspaceTabs.groupAppearanceWeight')}
          </label>
          <button
            type="button"
            className={styles.reset}
            disabled={decoration.fontWeight === undefined}
            aria-label={`${t('workspaceTabs.groupAppearanceReset')} — ${t('workspaceTabs.groupAppearanceWeight')}`}
            onClick={() => onChange('fontWeight', undefined)}
          >
            {t('workspaceTabs.groupAppearanceReset')}
          </button>
        </div>
        <select
          id={`${titleId}-weight`}
          className={styles.select}
          value={decoration.fontWeight ?? ''}
          onChange={(event) =>
            onChange('fontWeight', event.target.value ? Number(event.target.value) : undefined)
          }
        >
          <option value="">{t('workspaceTabs.groupAppearanceDefault')}</option>
          {TAB_GROUP_FONT_WEIGHTS.map((weight) => (
            <option key={weight} value={weight}>
              {weight}
            </option>
          ))}
        </select>
      </div>

      <NumberRow
        id={`${titleId}-size`}
        label={t('workspaceTabs.groupAppearanceSize')}
        resetLabel={t('workspaceTabs.groupAppearanceReset')}
        value={decoration.fontSize}
        min={TAB_GROUP_FONT_SIZE_RANGE.min}
        max={TAB_GROUP_FONT_SIZE_RANGE.max}
        fallbackLabel={t('workspaceTabs.groupAppearanceDefault')}
        onChange={(next) => onChange('fontSize', next)}
      />

      <NumberRow
        id={`${titleId}-radius`}
        label={t('workspaceTabs.groupAppearanceRadius')}
        resetLabel={t('workspaceTabs.groupAppearanceReset')}
        value={decoration.radius}
        min={TAB_GROUP_RADIUS_RANGE.min}
        max={TAB_GROUP_RADIUS_RANGE.max}
        fallbackLabel={t('workspaceTabs.groupAppearanceDefault')}
        onChange={(next) => onChange('radius', next)}
      />

      <div className={styles.row}>
        <div className={styles.rowHead}>
          <label className={styles.fieldLabel} htmlFor={`${titleId}-badge`}>
            {t('workspaceTabs.groupAppearanceBadge')}
          </label>
          <button
            type="button"
            className={styles.reset}
            disabled={decoration.badge === undefined}
            aria-label={`${t('workspaceTabs.groupAppearanceReset')} — ${t('workspaceTabs.groupAppearanceBadge')}`}
            onClick={() => onChange('badge', undefined)}
          >
            {t('workspaceTabs.groupAppearanceReset')}
          </button>
        </div>
        <input
          id={`${titleId}-badge`}
          className={styles.textInput}
          value={decoration.badge ?? ''}
          maxLength={MAX_TAB_GROUP_BADGE_LENGTH * 2}
          placeholder={t('workspaceTabs.groupAppearanceBadgeHint')}
          onChange={(event) => onChange('badge', event.target.value || undefined)}
        />
      </div>

      <p className={styles.note}>{t('workspaceTabs.groupAppearanceNote')}</p>

      <button type="button" className={styles.resetAll} onClick={onResetAll}>
        {t('workspaceTabs.groupAppearanceResetAll')}
      </button>
    </div>,
    document.body,
  );
}

function NumberRow({
  id,
  label,
  resetLabel,
  value,
  min,
  max,
  fallbackLabel,
  onChange,
}: {
  id: string;
  label: string;
  resetLabel: string;
  value: number | undefined;
  min: number;
  max: number;
  fallbackLabel: string;
  onChange: (next: number | undefined) => void;
}) {
  return (
    <div className={styles.row}>
      <div className={styles.rowHead}>
        <label className={styles.fieldLabel} htmlFor={id}>
          {label}
        </label>
        <span className={styles.rowValue}>{value === undefined ? fallbackLabel : `${value}px`}</span>
        <button
          type="button"
          className={styles.reset}
          disabled={value === undefined}
          aria-label={`${resetLabel} — ${label}`}
          onClick={() => onChange(undefined)}
        >
          {resetLabel}
        </button>
      </div>
      <input
        id={id}
        className={styles.range}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value ?? min}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}
