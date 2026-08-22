// A continuous colour picker: a two-dimensional saturation/brightness
// field, a hue axis, an alpha axis, numeric entry, and the translator.
//
// "Infinite" is a claim about what can be *reached*, and it decides the
// architecture. A swatch grid can only produce the colours someone
// enumerated; this produces any sRGB colour, and the swatches and recents
// below the field are shortcuts INTO that space rather than the space
// itself. Remove every swatch and the control still reaches all of it.
//
// Two implementation notes that are not obvious and are load-bearing:
//
//   1. HSVA is the state, RGBA is the output. Deriving HSV from the RGB
//      prop on every render would throw the hue away every time the colour
//      passes through a grey — saturation 0 has no hue to recover — so
//      dragging brightness to zero and back would silently land on red.
//      The component therefore owns the HSVA and only re-derives it when
//      the incoming colour is one it did not itself emit.
//   2. Pointer maths is done in ratios of the element's own rect, never in
//      pixels, which is what keeps the field correct under the UI-scale
//      control this same editor offers. A pixel-based hit test would be
//      off by the zoom factor the moment someone set the scale to 125%.

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import { Icon } from '../Icon';
import { isStudioFixtureCaptureStorageLocked } from '../../capture/studio-fixture';
import { tv, useT } from '../../i18n';
import { copyToClipboard } from '../../lib/copy-to-clipboard';
import {
  clamp,
  formatHex,
  formatHex8,
  hsvToRgb,
  parseColor,
  rgbToHsv,
  type Rgb,
  type Rgba,
} from './color';
import { CSS_COLOR_NAMES, colorNameFor } from './colorNames';
import { describeContrast, formatRatio } from './contrast';
import { translateColor, type ColorLoss, type ColorRepresentation } from './translate';
import styles from './InfiniteColorPicker.module.css';

interface Hsva {
  h: number;
  s: number;
  v: number;
  a: number;
}

const RECENTS_KEY = 'open-design:appearance:recent-colors';
const MAX_RECENTS = 12;

export function readRecentColors(): string[] {
  if (typeof window === 'undefined') return [];
  if (isStudioFixtureCaptureStorageLocked()) return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is string => typeof entry === 'string')
      .filter((entry) => /^#[0-9a-f]{6}$/i.test(entry))
      .slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

export function rememberRecentColor(hex: string): string[] {
  if (isStudioFixtureCaptureStorageLocked()) return [];
  const normalized = hex.toLowerCase();
  const next = [normalized, ...readRecentColors().filter((entry) => entry !== normalized)].slice(
    0,
    MAX_RECENTS,
  );
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  return next;
}

export interface InfiniteColorPickerProps {
  /** The colour being edited. Alpha is carried even where it is not used. */
  value: Rgba;
  onChange: (next: Rgba) => void;
  /** Names the control for assistive technology. */
  label: string;
  /** What the contrast readout measures against. */
  background: Rgb;
  /** Convenience swatches. Never the only way to reach a colour. */
  swatches?: readonly string[];
  /**
   * Shown under the alpha axis when the consumer will store the colour
   * without its alpha. The axis stays live: the warning is what makes the
   * loss visible before it happens, rather than a disabled control that
   * explains nothing.
   */
  alphaWillBeDropped?: boolean;
}

export function InfiniteColorPicker({
  value,
  onChange,
  label,
  background,
  swatches,
  alphaWillBeDropped = false,
}: InfiniteColorPickerProps) {
  const t = useT();
  const fieldId = useId();
  const [hsva, setHsva] = useState<Hsva>(() => ({ ...rgbToHsv(value), a: clamp(value.a, 0, 1) }));
  const [entry, setEntry] = useState<string>(() => formatHex(value));
  const [entryError, setEntryError] = useState(false);
  const [clippedComponents, setClippedComponents] = useState<string[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const lastEmittedRef = useRef<string>(formatHex8(value));

  useEffect(() => {
    setRecents(readRecentColors());
  }, []);

  // Adopt an externally-set colour, and only an externally-set one. The
  // comparison is on the 8-bit rendering because that is the resolution
  // the consumer stores at: a fractional HSV that maps to the same pixel
  // is the same colour, and re-deriving from it would fight the drag.
  useEffect(() => {
    const incoming = formatHex8(value);
    if (incoming === lastEmittedRef.current) return;
    lastEmittedRef.current = incoming;
    setHsva({ ...rgbToHsv(value), a: clamp(value.a, 0, 1) });
    setEntry(formatHex(value));
    setEntryError(false);
  }, [value]);

  const rgba = useMemo<Rgba>(() => ({ ...hsvToRgb(hsva), a: hsva.a }), [hsva]);
  const hex = formatHex(rgba);

  const emit = useCallback(
    (next: Hsva) => {
      setHsva(next);
      const nextRgba: Rgba = { ...hsvToRgb(next), a: next.a };
      lastEmittedRef.current = formatHex8(nextRgba);
      setEntry(formatHex(nextRgba));
      setEntryError(false);
      setClippedComponents([]);
      onChange(nextRgba);
    },
    [onChange],
  );

  const commitFromField = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const node = fieldRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
      // Down the field is *less* brightness, which is the convention every
      // other picker uses; inverting it here would be correct arithmetic
      // and a surprising control.
      emit({ ...hsva, s: x * 100, v: (1 - y) * 100 });
    },
    [emit, hsva],
  );

  const onFieldPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      fieldRef.current?.focus();
      commitFromField(event);
    },
    [commitFromField],
  );

  const onFieldPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      commitFromField(event);
    },
    [commitFromField],
  );

  // The field is a faster route to saturation and brightness, not the only
  // one — both have their own slider below. Arrow keys are still wired
  // here so a keyboard user who lands on the field is not stuck on a
  // control that does nothing; Shift takes bigger steps.
  const onFieldKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? 10 : 1;
      let handled = true;
      switch (event.key) {
        case 'ArrowLeft':
          emit({ ...hsva, s: clamp(hsva.s - step, 0, 100) });
          break;
        case 'ArrowRight':
          emit({ ...hsva, s: clamp(hsva.s + step, 0, 100) });
          break;
        case 'ArrowUp':
          emit({ ...hsva, v: clamp(hsva.v + step, 0, 100) });
          break;
        case 'ArrowDown':
          emit({ ...hsva, v: clamp(hsva.v - step, 0, 100) });
          break;
        default:
          handled = false;
      }
      if (handled) event.preventDefault();
    },
    [emit, hsva],
  );

  const commitEntry = useCallback(
    (text: string) => {
      const parsed = parseColor(text, CSS_COLOR_NAMES);
      if (!parsed) {
        // The typed text is kept exactly as typed. Snapping the field back
        // to the last good colour mid-word would fight anyone typing
        // `rgb(12, …` one character at a time.
        setEntryError(true);
        return;
      }
      setEntryError(false);
      setClippedComponents(parsed.clipped);
      const next: Hsva = { ...rgbToHsv(parsed.rgba), a: clamp(parsed.rgba.a, 0, 1) };
      setHsva(next);
      const nextRgba: Rgba = { ...hsvToRgb(next), a: next.a };
      lastEmittedRef.current = formatHex8(nextRgba);
      onChange(nextRgba);
    },
    [onChange],
  );

  const setChannel = useCallback(
    (channel: 'r' | 'g' | 'b', raw: number) => {
      const nextRgb: Rgb = { r: rgba.r, g: rgba.g, b: rgba.b };
      nextRgb[channel] = clamp(raw, 0, 255);
      emit({ ...rgbToHsv(nextRgb), a: hsva.a });
    },
    [emit, hsva.a, rgba.b, rgba.g, rgba.r],
  );

  const representations = useMemo(() => translateColor(rgba), [rgba]);
  const contrast = useMemo(() => describeContrast(rgba, background), [rgba, background]);
  const name = colorNameFor(hex);

  const copy = useCallback(async (representation: ColorRepresentation) => {
    const ok = await copyToClipboard(representation.value);
    if (ok) {
      setCopiedId(representation.id);
      window.setTimeout(() => {
        setCopiedId((current) => (current === representation.id ? null : current));
      }, 1400);
    }
  }, []);

  const pickSwatch = useCallback(
    (swatch: string) => {
      const parsed = parseColor(swatch, CSS_COLOR_NAMES);
      if (!parsed) return;
      emit({ ...rgbToHsv(parsed.rgba), a: clamp(parsed.rgba.a, 0, 1) });
      setRecents(rememberRecentColor(formatHex(parsed.rgba)));
    },
    [emit],
  );

  const pureHue = hsvToRgb({ h: hsva.h, s: 100, v: 100 });
  const fieldStyle: CSSProperties = {
    // Saturation left-to-right over the pure hue, brightness top-to-bottom
    // over black. Two layers rather than a canvas: no raster to redraw on
    // resize, and it stays crisp at every UI scale.
    background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${formatHex(pureHue)})`,
  };

  const lossLabel = (loss: ColorLoss): string => {
    switch (loss) {
      case 'alpha':
        return t('appearance.color.lossAlpha');
      case 'rounding':
        return t('appearance.color.lossRounding');
      case 'not-css':
        return t('appearance.color.lossNotCss');
      case 'unmanaged':
        return t('appearance.color.lossUnmanaged');
      default: {
        const exhaustive: never = loss;
        return exhaustive;
      }
    }
  };

  return (
    <div className={styles.picker} role="group" aria-label={label}>
      <div
        ref={fieldRef}
        className={styles.field}
        style={fieldStyle}
        role="group"
        aria-label={t('appearance.color.fieldLabel')}
        aria-describedby={`${fieldId}-field-hint`}
        tabIndex={0}
        onPointerDown={onFieldPointerDown}
        onPointerMove={onFieldPointerMove}
        onKeyDown={onFieldKeyDown}
        data-testid="appearance-color-field"
      >
        <span
          className={styles.thumb}
          style={{ left: `${hsva.s}%`, top: `${100 - hsva.v}%`, background: hex }}
          aria-hidden="true"
        />
      </div>
      <p className={styles.hint} id={`${fieldId}-field-hint`}>
        {t('appearance.color.fieldHint')}
      </p>

      <div className={styles.axes}>
        <label className={styles.axis}>
          <span className={styles.axisLabel}>{t('appearance.color.hue')}</span>
          <input
            type="range"
            className={`${styles.slider} ${styles.hueSlider}`}
            min={0}
            max={360}
            step={0.5}
            value={Math.round(hsva.h * 10) / 10}
            aria-valuetext={`${Math.round(hsva.h)}°`}
            onChange={(event) => emit({ ...hsva, h: Number(event.target.value) })}
            data-testid="appearance-color-hue"
          />
        </label>
        <label className={styles.axis}>
          <span className={styles.axisLabel}>{t('appearance.color.saturation')}</span>
          <input
            type="range"
            className={styles.slider}
            min={0}
            max={100}
            step={0.5}
            value={Math.round(hsva.s * 10) / 10}
            aria-valuetext={`${Math.round(hsva.s)}%`}
            onChange={(event) => emit({ ...hsva, s: Number(event.target.value) })}
          />
        </label>
        <label className={styles.axis}>
          <span className={styles.axisLabel}>{t('appearance.color.brightness')}</span>
          <input
            type="range"
            className={styles.slider}
            min={0}
            max={100}
            step={0.5}
            value={Math.round(hsva.v * 10) / 10}
            aria-valuetext={`${Math.round(hsva.v)}%`}
            onChange={(event) => emit({ ...hsva, v: Number(event.target.value) })}
          />
        </label>
        <label className={styles.axis}>
          <span className={styles.axisLabel}>{t('appearance.color.alpha')}</span>
          <input
            type="range"
            className={`${styles.slider} ${styles.alphaSlider}`}
            min={0}
            max={1}
            step={0.01}
            value={Math.round(hsva.a * 100) / 100}
            aria-valuetext={`${Math.round(hsva.a * 100)}%`}
            onChange={(event) => emit({ ...hsva, a: Number(event.target.value) })}
            data-testid="appearance-color-alpha"
          />
        </label>
      </div>

      {alphaWillBeDropped && hsva.a < 1 ? (
        <p className={styles.warning} role="status">
          <Icon name="alert-triangle" size={13} aria-hidden="true" />
          {t('appearance.color.alphaDropped')}
        </p>
      ) : null}

      <div className={styles.entryRow}>
        <label className={styles.entry}>
          <span className={styles.axisLabel}>{t('appearance.color.entryLabel')}</span>
          <input
            type="text"
            className={styles.entryInput}
            spellCheck={false}
            autoComplete="off"
            value={entry}
            aria-invalid={entryError || undefined}
            placeholder="#c96442"
            onChange={(event) => {
              setEntry(event.target.value);
              commitEntry(event.target.value);
            }}
            data-testid="appearance-color-entry"
          />
        </label>
        {(['r', 'g', 'b'] as const).map((channel) => (
          <label className={styles.channel} key={channel}>
            <span className={styles.axisLabel}>{channel.toUpperCase()}</span>
            <input
              type="number"
              className={styles.channelInput}
              min={0}
              max={255}
              step={1}
              value={Math.round(rgba[channel])}
              onChange={(event) => setChannel(channel, Number(event.target.value))}
            />
          </label>
        ))}
      </div>

      {entryError ? (
        <p className={styles.warning} role="status">
          <Icon name="alert-triangle" size={13} aria-hidden="true" />
          {t('appearance.color.entryInvalid')}
        </p>
      ) : null}

      {clippedComponents.length > 0 ? (
        <p className={styles.warning} role="status" data-testid="appearance-color-clipped">
          <Icon name="alert-triangle" size={13} aria-hidden="true" />
          {t('appearance.color.clipped', { components: clippedComponents.join(', ') })}
        </p>
      ) : null}

      {swatches && swatches.length > 0 ? (
        <div className={styles.swatchRow}>
          <span className={styles.axisLabel}>{t('appearance.color.swatches')}</span>
          <div className={styles.swatches} role="group" aria-label={t('appearance.color.swatches')}>
            {swatches.map((swatch) => (
              <button
                key={swatch}
                type="button"
                className={styles.swatch}
                style={{ background: swatch }}
                aria-label={swatch}
                onClick={() => pickSwatch(swatch)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {recents.length > 0 ? (
        <div className={styles.swatchRow}>
          <span className={styles.axisLabel}>{t('appearance.color.recents')}</span>
          <div className={styles.swatches} role="group" aria-label={t('appearance.color.recents')}>
            {recents.map((swatch) => (
              <button
                key={swatch}
                type="button"
                className={styles.swatch}
                style={{ background: swatch }}
                aria-label={swatch}
                onClick={() => pickSwatch(swatch)}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className={styles.readout}>
        <div className={styles.readoutHead}>
          <span className={styles.space}>{t('appearance.color.spaceSrgb')}</span>
          <span className={styles.nameOut}>
            {name ? name : t('appearance.color.noName')}
          </span>
        </div>
        <p className={styles.contrast} data-testid="appearance-color-contrast">
          {t('appearance.color.contrast', {
            ratio: formatRatio(contrast.ratio),
            rating:
              contrast.normalText === 'fail'
                ? tv('appearance.color.ratingFail')
                : contrast.normalText,
          })}
          {contrast.composited ? ` · ${t('appearance.color.compositedNote')}` : ''}
        </p>
      </div>

      <ul className={styles.translations}>
        {representations.map((representation) => (
          <li className={styles.translation} key={representation.id}>
            <span className={styles.translationLabel}>{representation.label}</span>
            <code className={styles.translationValue}>{representation.value}</code>
            {representation.loss.length > 0 ? (
              <span className={styles.lossBadges}>
                {representation.loss.map((loss) => (
                  <span className={styles.lossBadge} key={loss}>
                    {lossLabel(loss)}
                  </span>
                ))}
              </span>
            ) : null}
            <button
              type="button"
              className={styles.copyButton}
              onClick={() => { void copy(representation); }}
              aria-label={t('appearance.color.copyValue', { format: representation.label })}
            >
              <Icon name={copiedId === representation.id ? 'check' : 'copy'} size={13} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
