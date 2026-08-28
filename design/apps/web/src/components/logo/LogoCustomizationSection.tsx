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
  logoRenderFingerprint,
  normalizeLogoCrop,
  normalizeLogoState,
  parseLogoStateFile,
  recordLogoMutation,
  redactLogoStateForDaemon,
  readStoredLogoState,
  resolveScheduledLogoState,
  serializeLogoState,
  writeStoredLogoState,
} from '../../state/logoCustomization';
import type { Rgb, Rgba } from '../appearance/color';
import { formatHex, formatHex8, parseColor } from '../appearance/color';
import { CSS_COLOR_NAMES } from '../appearance/colorNames';
import styles from './LogoCustomizationSection.module.css';
import { openVersionHistory } from '../history/open-history';

const DEFAULT_BACKGROUND: Rgba = { r: 255, g: 248, b: 246, a: 1 };
const MAX_LOGO_FILE_BYTES = 16 * 1024 * 1024;
const PRESET_LABEL_KEY = {
  material: 'appLogo.material',
  warm: 'appLogo.warm',
  monochrome: 'appLogo.monochrome',
  outline: 'appLogo.outline',
} as const;
const TARGET_LABEL_KEY = {
  favicon: 'appLogo.targetFavicon',
  toolbar: 'appLogo.targetToolbar',
  titlebar: 'appLogo.targetTitlebar',
  sidebar: 'appLogo.targetSidebar',
  installer: 'appLogo.targetInstaller',
} as const;
const WEEKDAY_LABEL_KEY = {
  sun: 'appLogo.sun', mon: 'appLogo.mon', tue: 'appLogo.tue', wed: 'appLogo.wed', thu: 'appLogo.thu', fri: 'appLogo.fri', sat: 'appLogo.sat',
} as const;

function colorToRgba(value: LogoState['background']): Rgba {
  if (value === 'transparent') return DEFAULT_BACKGROUND;
  const parsed = parseColor(value, CSS_COLOR_NAMES);
  return parsed?.rgba ?? DEFAULT_BACKGROUND;
}
function rgbaToHex(value: Rgba): string {
  return value.a >= 0.999 ? formatHex(value) : formatHex8(value);
}

function clampFraction(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

function validatedDataUrlFile(dataUrl: string): File {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error('The cached logo derivative is malformed.');
  const bytes = Uint8Array.from(atob(dataUrl.slice(comma + 1)), (char) => char.charCodeAt(0));
  return new File([bytes], 'local-logo-derivative.png', { type: 'image/png' });
}

function hydrateLogoState(initial: LogoState | undefined): LogoState {
  const stored = readStoredLogoState();
  const candidate = normalizeLogoState(initial ?? stored);
  if (candidate.custom && stored.custom?.dataUrl === candidate.custom.dataUrl && stored.custom.sourceDataUrl) {
    return { ...candidate, custom: { ...candidate.custom, sourceDataUrl: stored.custom.sourceDataUrl } };
  }
  return candidate;
}

function SearchableLogoChoice({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState('');
  const search = useRegexSearch(query, setQuery);
  const visible = options.filter((option) => search.matches(`${option.label} ${option.value}`));
  return (
    <div className={styles.choice} role="group" aria-label={label} data-testid={`${id}-choice`}>
      <RegexSearchField
        search={search}
        fieldLabel={label}
        ariaLabel={`${label} search`}
        placeholder={`${label}…`}
        testId={`${id}-search`}
      />
      <div className={styles.choiceOptions} role="listbox" aria-label={label}>
        {visible.map((option) => (
          <button type="button" role="option" aria-selected={option.value === value} key={option.value} onClick={() => onChange(option.value)}>
            {option.label}
          </button>
        ))}
        {visible.length === 0 ? <span className={styles.hint}>{t('appLogo.noMatch')}</span> : null}
      </div>
    </div>
  );
}

/**
 * The app-owned logo surface. It deliberately stores no source path and does
 * not alter package or data identity. The custom image is converted to one
 * bounded PNG after signature-first validation, so every target preview uses
 * the same verified pixels rather than asking each target to decode input.
 */
export function LogoCustomizationSection({
  initial,
  onChange,
}: {
  initial?: LogoState;
  onChange?: (state: LogoState) => Promise<boolean> | boolean;
} = {}) {
  const t = useT();
  const [state, setState] = useState<LogoState>(() => hydrateLogoState(initial));
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scheduleStart, setScheduleStart] = useState('');
  const [scheduleEnd, setScheduleEnd] = useState('');
  const [scheduleLabel, setScheduleLabel] = useState('');
  const [schedulePreset, setSchedulePreset] = useState<LogoState['presetId']>('material');
  const [scheduleWeekdays, setScheduleWeekdays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [scheduleTick, setScheduleTick] = useState(0);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const search = useRegexSearch(searchQuery, setSearchQuery);
  const [targetSearchQuery, setTargetSearchQuery] = useState('');
  const targetSearch = useRegexSearch(targetSearchQuery, setTargetSearchQuery);
  const priorStateJsonRef = useRef(JSON.stringify(state));
  const onChangeRef = useRef(onChange);
  const refreshGenerationRef = useRef(0);
  const pendingHistoryActionRef = useRef<'selected-preset' | 'uploaded-custom' | 'updated' | 'reset'>('updated');
  const pendingSuccessRef = useRef<string | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const displayedState = useMemo(() => resolveScheduledLogoState(state), [scheduleTick, state]);
  const activeSource = displayedState.custom?.dataUrl
    ?? LOGO_PRESETS.find((preset) => preset.id === displayedState.presetId)?.src
    ?? LOGO_PRESETS[0].src;
  const visiblePresets = useMemo(
    () => LOGO_PRESETS.filter((preset) => search.matches(`${t(PRESET_LABEL_KEY[preset.id])} ${preset.id}`)),
    [search, searchQuery, t],
  );

  useEffect(() => {
    const applyScheduled = () => applyLogoStateToDocument(resolveScheduledLogoState(state));
    applyScheduled();
    writeStoredLogoState(state);
    const stateJson = JSON.stringify(state);
    if (stateJson !== priorStateJsonRef.current) {
      const acknowledged = recordLogoMutation(pendingHistoryActionRef.current, state);
      priorStateJsonRef.current = stateJson;
      pendingHistoryActionRef.current = 'updated';
      const pendingSuccess = pendingSuccessRef.current;
      pendingSuccessRef.current = null;
      void Promise.resolve(onChangeRef.current?.(redactLogoStateForDaemon(state)) ?? true).then((daemonAcknowledged) => {
        if (pendingSuccess) setStatus(acknowledged && daemonAcknowledged ? pendingSuccess : t('appLogo.historyUnavailable'));
      });
    } else {
      void onChangeRef.current?.(redactLogoStateForDaemon(state));
    }
    const timer = window.setInterval(() => {
      applyScheduled();
      setScheduleTick((value) => value + 1);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [state]);

  const update = useCallback((patch: Partial<LogoState>, action: 'updated' | 'selected-preset' | 'uploaded-custom' = 'updated') => {
    pendingHistoryActionRef.current = action;
    setState((current) => ({ ...current, ...patch }));
  }, []);

  useEffect(() => {
    const custom = state.custom;
    if (!custom) return undefined;
    const options = {
      crop: state.crop,
      fit: state.fit,
      focalPoint: state.focalPoint,
      safeArea: state.safeArea,
      background: state.background,
    };
    const fingerprint = logoRenderFingerprint(options);
    if (custom.renderFingerprint === fingerprint) return undefined;
    const generation = ++refreshGenerationRef.current;
    const timer = window.setTimeout(() => {
      void convertLogoFile(validatedDataUrlFile(custom.sourceDataUrl ?? custom.dataUrl), { ...options, outputSize: custom.width })
        .then((refreshed) => {
          if (generation !== refreshGenerationRef.current) return;
          update({ custom: {
            ...refreshed,
            sourceMimeType: custom.sourceMimeType,
            sourceHasAlpha: custom.sourceHasAlpha,
            sourceDataUrl: custom.sourceDataUrl,
            losses: custom.losses,
          } });
        })
        .catch(() => {
          if (generation === refreshGenerationRef.current) setStatus(t('appLogo.conversionFailure'));
        });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [state.background, state.crop, state.custom, state.fit, state.focalPoint, state.safeArea, t, update]);

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
        setStatus(t('appLogo.errorCode', { code: validation.code, detail: logoValidationMessage(validation) }));
        return;
      }
      const custom = await convertLogoFile(file, {
        crop: state.crop,
        fit: state.fit,
        focalPoint: state.focalPoint,
        safeArea: state.safeArea,
        background: state.background,
        outputSize: 512,
      });
      const activeCustom = {
        ...custom,
        renderFingerprint: logoRenderFingerprint({
          crop: DEFAULT_LOGO_STATE.crop,
          fit: state.fit,
          focalPoint: state.focalPoint,
          safeArea: state.safeArea,
          background: state.background,
        }),
      };
      update({ custom: activeCustom, crop: state.crop }, 'uploaded-custom');
      pendingSuccessRef.current = t('appLogo.converted', { width: custom.width, bytes: custom.byteLength });
    } catch (error) {
      // The prior valid logo remains active. The message is intentionally
      // generic so decoder errors cannot leak source bytes or private paths.
      setStatus(error instanceof Error ? error.message : t('appLogo.conversionFailure'));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [state.background, state.crop, state.fit, state.focalPoint, state.safeArea, t, update]);

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

  const exportAppearance = useCallback(() => {
    const blob = new Blob([serializeLogoState(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'material-designer-logo-appearance.json';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [state]);

  const importAppearance = useCallback(async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_LOGO_FILE_BYTES) {
      setStatus(t('appLogo.importError'));
      if (importRef.current) importRef.current.value = '';
      return;
    }
    try {
      const text = await file.text();
      const result = parseLogoStateFile(text);
      if (!result.ok) {
        setStatus(t('appLogo.importError'));
        return;
      }
      pendingHistoryActionRef.current = 'updated';
      setState(result.state);
      setStatus(t('appLogo.import'));
    } catch {
      setStatus(t('appLogo.importError'));
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  }, [t]);

  const addSchedule = useCallback(() => {
    const start = Date.parse(scheduleStart);
    const end = Date.parse(scheduleEnd);
    if (!scheduleStart || !scheduleEnd || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      setStatus(t('appLogo.scheduleInvalid'));
      return;
    }
    const id = editingScheduleId ?? `logo-schedule-${Date.now().toString(36)}`;
    const nextRule = { id, label: scheduleLabel.trim() || id, enabled: true, startAt: start.slice(0, 16), endAt: end.slice(0, 16), weekdays: scheduleWeekdays.length ? scheduleWeekdays : [0, 1, 2, 3, 4, 5, 6], timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'local', patch: { presetId: schedulePreset, fit: state.fit, background: state.background, safeArea: state.safeArea, rainbowSpeedLevel: state.rainbowSpeedLevel, crop: state.crop, focalPoint: state.focalPoint } };
    update({ schedules: editingScheduleId ? state.schedules.map((rule) => rule.id === editingScheduleId ? nextRule : rule) : [...state.schedules, nextRule] });
    setEditingScheduleId(null);
    setStatus(t('appLogo.scheduleAdded'));
  }, [editingScheduleId, scheduleEnd, scheduleLabel, schedulePreset, scheduleStart, scheduleWeekdays, state.schedules, t, update]);

  const deleteSchedule = useCallback((id: string) => {
    update({ schedules: state.schedules.filter((rule) => rule.id !== id) });
  }, [state.schedules, update]);

  const toggleSchedule = useCallback((id: string, enabled: boolean) => {
    update({ schedules: state.schedules.map((rule) => rule.id === id ? { ...rule, enabled } : rule) });
  }, [state.schedules, update]);

  const editSchedule = useCallback((id: string) => {
    const rule = state.schedules.find((candidate) => candidate.id === id);
    if (!rule) return;
    setEditingScheduleId(id);
    setScheduleLabel(rule.label);
    setScheduleStart(rule.startAt.slice(0, 16));
    setScheduleEnd(rule.endAt.slice(0, 16));
    setSchedulePreset(rule.patch.presetId ?? 'material');
    setScheduleWeekdays([...rule.weekdays]);
  }, [state.schedules]);

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

      <div className={styles.exportRow} data-od-setting="appearance.logo.export">
        <button type="button" className={styles.reset} onClick={exportAppearance}>{t('appLogo.export')}</button>
        <label className={styles.importButton}>
          {t('appLogo.import')}
          <input ref={importRef} type="file" accept="application/json,.json" onChange={(event) => void importAppearance(event.target.files?.[0])} />
        </label>
        <button type="button" className={styles.reset} onClick={() => openVersionHistory({ domainId: 'settings' })}>{t('history.openButton')}</button>
      </div>

      <fieldset className={styles.scheduleFieldset} data-od-setting="appearance.logo.schedule">
        <legend>{t('appLogo.schedule')}</legend>
        <p className={styles.hint}>{t('appLogo.scheduleHint')}</p>
        <p className={styles.hint}>{t('appLogo.timezone', { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time' })}</p>
        <label className={styles.field}><span>{t('appLogo.scheduleStart')}</span><input type="datetime-local" value={scheduleStart} onChange={(event) => setScheduleStart(event.target.value)} /></label>
        <label className={styles.field}><span>{t('appLogo.scheduleEnd')}</span><input type="datetime-local" value={scheduleEnd} onChange={(event) => setScheduleEnd(event.target.value)} /></label>
        <label className={styles.field}><span>{t('appLogo.scheduleLabel')}</span><input type="text" value={scheduleLabel} onChange={(event) => setScheduleLabel(event.target.value)} /></label>
        <fieldset className={styles.weekdays}><legend>{t('appLogo.scheduleWeekdays')}</legend>{(Object.keys(WEEKDAY_LABEL_KEY) as Array<keyof typeof WEEKDAY_LABEL_KEY>).map((day, index) => <label key={day}><input type="checkbox" checked={scheduleWeekdays.includes(index)} onChange={(event) => setScheduleWeekdays((current) => event.target.checked ? Array.from(new Set([...current, index])).sort() : current.filter((value) => value !== index))} />{t(WEEKDAY_LABEL_KEY[day])}</label>)}</fieldset>
        <div className={styles.field}><span>{t('appLogo.schedulePreset')}</span><SearchableLogoChoice id="logo-schedule-preset" label={t('appLogo.schedulePreset')} value={schedulePreset} options={LOGO_PRESETS.map((preset) => ({ value: preset.id, label: t(PRESET_LABEL_KEY[preset.id]) }))} onChange={(value) => setSchedulePreset(value as LogoState['presetId'])} /></div>
        <button type="button" className={styles.reset} onClick={addSchedule}>{t('appLogo.scheduleAdd')}</button>
        <ul className={styles.scheduleList}>{state.schedules.map((rule) => <li key={rule.id}><strong>{rule.label}</strong> · {rule.startAt} → {rule.endAt}, {rule.patch.presetId ? t(PRESET_LABEL_KEY[rule.patch.presetId]) : t('appLogo.title')}<label><input type="checkbox" checked={rule.enabled} onChange={(event) => toggleSchedule(rule.id, event.target.checked)} />{t('appLogo.scheduleEnabled')}</label><button type="button" onClick={() => editSchedule(rule.id)}>{t('appLogo.scheduleEdit')}</button><button type="button" onClick={() => deleteSchedule(rule.id)}>{t('appLogo.scheduleDelete')}</button></li>)}</ul>
      </fieldset>

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

      <div className={styles.uploadRow} data-od-setting="appearance.logo.upload">
        <label htmlFor="app-logo-upload" className={styles.hint}>{t('appLogo.upload')}</label>
        <input
          ref={fileRef}
          id="app-logo-upload"
          className={styles.file}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => void handleFile(event.target.files?.[0])}
          aria-describedby="logo-upload-help"
          data-testid="logo-custom-upload"
        />
        <span id="logo-upload-help" className={styles.hint}>
          {t('appLogo.uploadHelp')} {' '}{t('appLogo.lossBefore')}
        </span>
      </div>

      <div className={styles.editorGrid}>
        <div className={styles.previewColumn}>
          <h4>{t('brandDetail.brandAssets')}</h4>
          <div
            className={`${styles.logoStage} ${displayedState.safeArea ? styles.withSafeArea : ''}`}
            style={{
              background: displayedState.background === 'transparent' ? undefined : displayedState.background,
              backgroundImage: displayedState.background === 'transparent' ? 'linear-gradient(45deg, #eee 25%, transparent 25%), linear-gradient(-45deg, #eee 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #eee 75%), linear-gradient(-45deg, transparent 75%, #eee 75%)' : undefined,
            }}
            data-testid="logo-live-preview"
          >
            <img
              src={activeSource}
            alt={t('appLogo.selectedPreview')}
              style={{
                objectFit: displayedState.fit,
                objectPosition: `${displayedState.focalPoint.x * 100}% ${displayedState.focalPoint.y * 100}%`,
                clipPath: `inset(${displayedState.crop.y * 100}% ${(1 - displayedState.crop.x - displayedState.crop.width) * 100}% ${(1 - displayedState.crop.y - displayedState.crop.height) * 100}% ${displayedState.crop.x * 100}%)`,
              }}
            />
            {displayedState.safeArea ? <span className={styles.safeArea} aria-hidden="true" /> : null}
          </div>
          <p className={styles.hint}>
            {displayedState.custom ? `${displayedState.custom.width}×${displayedState.custom.height}, ${displayedState.custom.sourceHasAlpha ? t('appLogo.sourceAlpha') : t('appLogo.sourceOpaque')}, ${displayedState.custom.hasAlpha ? t('appLogo.alphaPreserved') : t('appLogo.opaque')}, ${t('appLogo.frame')}` : t('appLogo.staticPreset')}
          </p>
          {displayedState.custom?.losses?.length ? (
            <p className={styles.hint} data-testid="logo-loss-disclosure">
              {t('appLogo.lossDisclosure', { losses: displayedState.custom.losses.join(', ') })}
            </p>
          ) : null}
        </div>

        <div className={styles.controls}>
          <div className={styles.field} data-od-setting="appearance.logo.fit">
            <span>{t('appLogo.fit')}</span>
            <SearchableLogoChoice
              id="logo-fit"
              label={t('appLogo.fit')}
              value={state.fit}
              options={[{ value: 'contain', label: t('appLogo.contain') }, { value: 'cover', label: t('appLogo.cover') }, { value: 'fill', label: t('appLogo.fill') }]}
              onChange={(fit) => update({ fit: fit as LogoState['fit'] })}
            />
          </div>
          <label className={styles.field}>
            <span data-od-setting="appearance.logo.focal">{t('appLogo.focalX')}</span>
            <input type="range" min="0" max="1" step="0.01" value={state.focalPoint.x} onChange={(event) => update({ focalPoint: { ...state.focalPoint, x: clampFraction(Number(event.target.value), 0.5) } })} />
            <output>{Math.round(state.focalPoint.x * 100)}%</output>
          </label>
          <label className={styles.field}>
            <span data-od-setting="appearance.logo.focal">{t('appLogo.focalY')}</span>
            <input type="range" min="0" max="1" step="0.01" value={state.focalPoint.y} onChange={(event) => update({ focalPoint: { ...state.focalPoint, y: clampFraction(Number(event.target.value), 0.5) } })} />
            <output>{Math.round(state.focalPoint.y * 100)}%</output>
          </label>
          <fieldset className={styles.cropFieldset} data-od-setting="appearance.logo.crop">
            <legend>{t('appLogo.crop')}</legend>
            {(['x', 'y', 'width', 'height'] as const).map((field) => (
              <label className={styles.numeric} key={field}>
                <span>{field}</span>
                <input type="number" min="0.01" max="1" step="0.01" value={state.crop[field]} onChange={(event) => updateCrop(field, Number(event.target.value))} />
              </label>
            ))}
          </fieldset>
          <label className={styles.check} data-od-setting="appearance.logo.safeArea">
            <input type="checkbox" checked={state.safeArea} onChange={(event) => update({ safeArea: event.target.checked })} />
            <span>{t('appLogo.safeArea')}</span>
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={state.background === 'transparent'} onChange={(event) => update({ background: event.target.checked ? 'transparent' : '#fff8f6' })} />
            <span data-od-setting="appearance.logo.background">{t('appLogo.transparent')}</span>
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={state.background === 'rainbow'} onChange={(event) => update({ background: event.target.checked ? 'rainbow' : 'transparent' })} />
            <span>{t('appLogo.rainbow')}</span>
          </label>
          {state.background === 'rainbow' ? <label className={styles.field}><span>{t('appLogo.rainbowSpeed')}</span><input type="range" min="1" max="5" step="1" value={state.rainbowSpeedLevel} onChange={(event) => update({ rainbowSpeedLevel: Number(event.target.value) })} /><output>{state.rainbowSpeedLevel}</output></label> : null}
          {state.background !== 'transparent' && state.background !== 'rainbow' ? (
            <div className={styles.colorField}>
              <InfiniteColorPicker
                value={background}
                onChange={onBackgroundChange}
                background={{ r: 255, g: 255, b: 255 } satisfies Rgb}
                label={t('appLogo.background')}
                alphaWillBeDropped={false}
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className={styles.targets}>
        <h4>{t('appLogo.targets')}</h4>
        <RegexSearchField search={targetSearch} fieldLabel={t('appLogo.targets')} ariaLabel={`${t('appLogo.targets')} search`} placeholder={t('appLogo.targets')} testId="logo-target-search" />
        <div className={styles.targetGrid}>
          {LOGO_DISPLAY_TARGETS.filter((target) => targetSearch.matches(`${t(TARGET_LABEL_KEY[target.id])} ${target.id}`)).map((target) => (
            <figure key={target.id} className={styles.target} data-testid={`logo-target-${target.id}`}>
              <div className={styles.targetTile} style={{ width: Math.min(target.width, 128), height: Math.min(target.height, 128) }}>
                <img src={displayedState.custom?.variants?.[target.id]?.dataUrl ?? activeSource} alt={`${t(TARGET_LABEL_KEY[target.id])} logo preview`} style={{ objectFit: displayedState.fit, objectPosition: `${displayedState.focalPoint.x * 100}% ${displayedState.focalPoint.y * 100}%` }} />
              </div>
              <figcaption>{t(TARGET_LABEL_KEY[target.id])} · {target.width}×{target.height}</figcaption>
              {target.id === 'installer' ? <p className={styles.hint}>{t('appLogo.installerPreviewOnly')}</p> : null}
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
