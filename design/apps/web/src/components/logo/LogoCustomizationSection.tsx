import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../../i18n';
import { InfiniteColorPicker } from '../appearance/InfiniteColorPicker';
import { useRegexSearch } from '../regex/useRegexSearch';
import { RegexSearchField } from '../regex/RegexSearchField';
import {
  DEFAULT_LOGO_STATE,
  LOGO_DISPLAY_TARGETS,
  LOGO_PRESETS,
  MAX_LOGO_OUTPUT_BYTES,
  type LogoState,
  applyLogoStateToDocument,
  convertLogoFile,
  fileToValidatedBytes,
  logoValidationMessage,
  normalizeLogoCrop,
  recordLogoMutation,
  readStoredLogoState,
  writeStoredLogoState,
} from '../../state/logoCustomization';
import type { Rgb, Rgba } from '../appearance/color';
import { parseColor } from '../appearance/color';
import { CSS_COLOR_NAMES } from '../appearance/colorNames';
import styles from './LogoCustomizationSection.module.css';

const DEFAULT_BACKGROUND: Rgba = { r: 255, g: 248, b: 246, a: 1 };
const PRESET_LABEL_KEY = {
  material: 'appLogo.material',
  warm: 'appLogo.warm',
  monochrome: 'appLogo.monochrome',
  outline: 'appLogo.outline',
} as const;

function colorToRgba(value: LogoState['background']): Rgba {
  if (value === 'transparent') return DEFAULT_BACKGROUND;
  const parsed = parseColor(value, CSS_COLOR_NAMES);
  return parsed?.rgba ?? DEFAULT_BACKGROUND;
}
function rgbaToHex(value: Rgba): string {
  const channel = (input: number) => Math.min(255, Math.max(0, Math.round(input))).toString(16).padStart(2, '0');
  return `#${channel(value.r)}${channel(value.g)}${channel(value.b)}`;
}

function clampFraction(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

/**
 * The app-owned logo surface. It deliberately stores no source path and does
 * not alter package or data identity. The custom image is converted to one
 * bounded PNG after signature-first validation, so every target preview uses
 * the same verified pixels rather than asking each target to decode input.
 */
export function LogoCustomizationSection() {
  const t = useT();
  const [state, setState] = useState<LogoState>(readStoredLogoState);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const search = useRegexSearch(searchQuery, setSearchQuery);
  const priorStateJsonRef = useRef(JSON.stringify(state));
  const pendingHistoryActionRef = useRef<'selected-preset' | 'uploaded-custom' | 'updated' | 'reset'>('updated');

  const activeSource = state.custom?.dataUrl
    ?? LOGO_PRESETS.find((preset) => preset.id === state.presetId)?.src
    ?? LOGO_PRESETS[0].src;
  const visiblePresets = useMemo(
    () => LOGO_PRESETS.filter((preset) => search.matches(`${t(PRESET_LABEL_KEY[preset.id])} ${preset.id}`)),
    [search, searchQuery, t],
  );

  useEffect(() => {
    applyLogoStateToDocument(state);
    writeStoredLogoState(state);
    const stateJson = JSON.stringify(state);
    if (stateJson !== priorStateJsonRef.current) {
      recordLogoMutation(pendingHistoryActionRef.current, state);
      priorStateJsonRef.current = stateJson;
      pendingHistoryActionRef.current = 'updated';
    }
  }, [state]);

  const update = useCallback((patch: Partial<LogoState>, action: 'updated' | 'selected-preset' | 'uploaded-custom' = 'updated') => {
    pendingHistoryActionRef.current = action;
    setState((current) => ({ ...current, ...patch }));
  }, []);

  const selectPreset = useCallback((presetId: LogoState['presetId']) => {
    update({ presetId, custom: null, crop: DEFAULT_LOGO_STATE.crop }, 'selected-preset');
    setStatus(null);
  }, [update]);

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setStatus(t('appLogo.validating'));
    try {
      const { validation } = await fileToValidatedBytes(file);
      if (!validation.ok) {
        setStatus(logoValidationMessage(validation));
        return;
      }
      const custom = await convertLogoFile(file, state.crop);
      update({ custom, crop: DEFAULT_LOGO_STATE.crop }, 'uploaded-custom');
      setStatus(t('appLogo.converted', { width: custom.width, bytes: custom.byteLength }));
    } catch (error) {
      // The prior valid logo remains active. The message is intentionally
      // generic so decoder errors cannot leak source bytes or private paths.
      setStatus(error instanceof Error ? error.message : t('appLogo.conversionFailure'));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [state.crop, t, update]);

  const updateCrop = useCallback((field: keyof typeof state.crop, value: number) => {
    setState((current) => ({ ...current, crop: normalizeLogoCrop({ ...current.crop, [field]: value }) }));
  }, []);

  const background = colorToRgba(state.background);
  const onBackgroundChange = useCallback((next: Rgba) => {
    update({ background: rgbaToHex(next) });
  }, [update]);

  const reset = useCallback(() => {
    pendingHistoryActionRef.current = 'reset';
    setState({ ...DEFAULT_LOGO_STATE });
    setStatus(t('appLogo.resetDone'));
  }, [t]);

  return (
    <section
      className={styles.section}
      data-od-setting="appearance.logo"
      data-testid="logo-customization-section"
      aria-labelledby="logo-customization-title"
    >
      <div className={styles.header}>
        <div>
          <h3 id="logo-customization-title">{t('appLogo.title')}</h3>
          <p className={styles.hint}>
            {t('ds.manualEditModuleHint', { module: t('brandDetail.logo') })}
            {' '}{t('appLogo.hint')}
          </p>
        </div>
        <button
          type="button"
          className={styles.reset}
          onClick={reset}
          data-testid="logo-reset"
        >
          {t('appLogo.reset')}
        </button>
      </div>

      <div className={styles.search}>
        <RegexSearchField
          search={search}
          fieldLabel={t('appLogo.presets')}
          ariaLabel={t('appLogo.search')}
          placeholder={t('appLogo.search')}
          testId="logo-preset-search"
        />
      </div>

      <div className={styles.presets} role="list" aria-label={t('appLogo.presets')}>
        {visiblePresets.map((preset) => (
          <button
            type="button"
            key={preset.id}
            className={`${styles.preset} ${!state.custom && state.presetId === preset.id ? styles.active : ''}`}
            aria-pressed={!state.custom && state.presetId === preset.id}
            onClick={() => selectPreset(preset.id)}
            data-testid={`logo-preset-${preset.id}`}
          >
            <span className={styles.presetPreview}>
              <img src={preset.src} alt="" />
            </span>
            <span>{t(PRESET_LABEL_KEY[preset.id])}</span>
          </button>
        ))}
      </div>

      <div className={styles.uploadRow}>
        <input
          ref={fileRef}
          className={styles.file}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => void handleFile(event.target.files?.[0])}
          aria-describedby="logo-upload-help"
          data-testid="logo-custom-upload"
        />
        <span id="logo-upload-help" className={styles.hint}>
          {t('appLogo.uploadHelp')}
        </span>
      </div>

      <div className={styles.editorGrid}>
        <div className={styles.previewColumn}>
          <h4>{t('brandDetail.brandAssets')}</h4>
          <div
            className={`${styles.logoStage} ${state.safeArea ? styles.withSafeArea : ''}`}
            style={{
              background: state.background === 'transparent' ? undefined : state.background,
              backgroundImage: state.background === 'transparent' ? 'linear-gradient(45deg, #eee 25%, transparent 25%), linear-gradient(-45deg, #eee 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #eee 75%), linear-gradient(-45deg, transparent 75%, #eee 75%)' : undefined,
            }}
            data-testid="logo-live-preview"
          >
            <img
              src={activeSource}
            alt={t('appLogo.selectedPreview')}
              style={{
                objectFit: state.fit,
                objectPosition: `${state.focalPoint.x * 100}% ${state.focalPoint.y * 100}%`,
                clipPath: `inset(${state.crop.y * 100}% ${(1 - state.crop.x - state.crop.width) * 100}% ${(1 - state.crop.y - state.crop.height) * 100}% ${state.crop.x * 100}%)`,
              }}
            />
            {state.safeArea ? <span className={styles.safeArea} aria-hidden="true" /> : null}
          </div>
          <p className={styles.hint}>
            {state.custom ? `${state.custom.width}×${state.custom.height}, ${state.custom.hasAlpha ? t('appLogo.alphaPreserved') : t('appLogo.opaque')}, ${t('appLogo.frame')}` : t('appLogo.staticPreset')}
          </p>
        </div>

        <div className={styles.controls}>
          <label className={styles.field}>
            <span>{t('appLogo.fit')}</span>
            <select value={state.fit} onChange={(event) => update({ fit: event.target.value as LogoState['fit'] })}>
              <option value="contain">{t('appLogo.contain')}</option>
              <option value="cover">{t('appLogo.cover')}</option>
              <option value="fill">{t('appLogo.fill')}</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>{t('appLogo.focalX')}</span>
            <input type="range" min="0" max="1" step="0.01" value={state.focalPoint.x} onChange={(event) => update({ focalPoint: { ...state.focalPoint, x: clampFraction(Number(event.target.value), 0.5) } })} />
            <output>{Math.round(state.focalPoint.x * 100)}%</output>
          </label>
          <label className={styles.field}>
            <span>{t('appLogo.focalY')}</span>
            <input type="range" min="0" max="1" step="0.01" value={state.focalPoint.y} onChange={(event) => update({ focalPoint: { ...state.focalPoint, y: clampFraction(Number(event.target.value), 0.5) } })} />
            <output>{Math.round(state.focalPoint.y * 100)}%</output>
          </label>
          <fieldset className={styles.cropFieldset}>
            <legend>{t('appLogo.crop')}</legend>
            {(['x', 'y', 'width', 'height'] as const).map((field) => (
              <label className={styles.numeric} key={field}>
                <span>{field}</span>
                <input type="number" min="0.01" max="1" step="0.01" value={state.crop[field]} onChange={(event) => updateCrop(field, Number(event.target.value))} />
              </label>
            ))}
          </fieldset>
          <label className={styles.check}>
            <input type="checkbox" checked={state.safeArea} onChange={(event) => update({ safeArea: event.target.checked })} />
            <span>{t('appLogo.safeArea')}</span>
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={state.background === 'transparent'} onChange={(event) => update({ background: event.target.checked ? 'transparent' : '#fff8f6' })} />
            <span>{t('appLogo.transparent')}</span>
          </label>
          {state.background !== 'transparent' ? (
            <div className={styles.colorField}>
              <InfiniteColorPicker
                value={background}
                onChange={onBackgroundChange}
                background={{ r: 255, g: 255, b: 255 } satisfies Rgb}
                label={t('appLogo.background')}
                alphaWillBeDropped
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className={styles.targets}>
        <h4>{t('appLogo.targets')}</h4>
        <div className={styles.targetGrid}>
          {LOGO_DISPLAY_TARGETS.map((target) => (
            <figure key={target.id} className={styles.target} data-testid={`logo-target-${target.id}`}>
              <div className={styles.targetTile} style={{ width: Math.min(target.width, 128), height: Math.min(target.height, 128) }}>
                <img src={state.custom?.variants?.[target.id]?.dataUrl ?? activeSource} alt={`${target.label} logo preview`} style={{ objectFit: state.fit, objectPosition: `${state.focalPoint.x * 100}% ${state.focalPoint.y * 100}%` }} />
              </div>
              <figcaption>{target.label} · {target.width}×{target.height}</figcaption>
            </figure>
          ))}
        </div>
      </div>

      {busy ? <p role="status" className={styles.status}>{t('common.loading')}</p> : null}
      {status ? <p role="status" className={styles.status} data-testid="logo-status">{status}</p> : null}
      {state.custom && state.custom.byteLength > MAX_LOGO_OUTPUT_BYTES ? (
        <p role="alert" className={styles.status}>Converted output exceeds the local bound and is not active.</p>
      ) : null}
    </section>
  );
}
