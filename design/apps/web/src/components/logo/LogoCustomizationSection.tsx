import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
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
  logoRenderFingerprint,
  normalizeLogoCrop,
  parseLogoStateFile,
  getLogoStateStore,
  resolveScheduledLogoState,
  serializeLogoState,
  validateLogoSchedule,
} from '../../state/logoCustomization';
import type { LogoDisplayTarget, LogoPersistenceRequest, LogoPreset, LogoStateStore, LogoValidationCode } from '../../state/logoCustomization';
import type { Rgb, Rgba } from '../appearance/color';
import { formatHex, formatHex8, parseColor } from '../appearance/color';
import { CSS_COLOR_NAMES } from '../appearance/colorNames';
import styles from './LogoCustomizationSection.module.css';
import { openVersionHistory } from '../history/open-history';

const DEFAULT_BACKGROUND: Rgba = { r: 255, g: 248, b: 246, a: 1 };
const MAX_LOGO_FILE_BYTES = 16 * 1024 * 1024;
export interface LogoCopy {
  manualEditHint: string;
  brandLogo: string;
  title: string;
  hint: string;
  reset: string;
  resetDone: string;
  export: string;
  import: string;
  importError: string;
  historyOpenButton: string;
  schedule: string;
  scheduleHint: string;
  timezone: (timezone: string) => string;
  scheduleStart: string;
  scheduleEnd: string;
  scheduleLabel: string;
  scheduleWeekdays: string;
  schedulePreset: string;
  scheduleAdd: string;
  scheduleAdded: string;
  scheduleInvalid: string;
  scheduleAmbiguous: string;
  scheduleError: (code: string) => string;
  scheduleEnabled: string;
  scheduleEdit: string;
  scheduleDelete: string;
  presets: string;
  search: string;
  noMatch: string;
  upload: string;
  uploadHelp: string;
  lossBefore: string;
  validating: string;
  errorCode: (code: string, detail: string) => string;
  validationError: (code: LogoValidationCode) => string;
  conversionFailure: string;
  persistenceUnavailable: string;
  historyUnavailable: string;
  converted: (width: number, bytes: number) => string;
  selectedPreview: string;
  staticPreset: string;
  sourceAlpha: string;
  sourceOpaque: string;
  alphaPreserved: string;
  opaque: string;
  frame: string;
  lossDisclosure: (losses: string) => string;
  fit: string;
  contain: string;
  cover: string;
  fill: string;
  focalX: string;
  focalY: string;
  crop: string;
  cropField: (field: 'x' | 'y' | 'width' | 'height') => string;
  safeArea: string;
  transparent: string;
  rainbow: string;
  rainbowSpeed: string;
  background: string;
  targets: string;
  targetLabel: (target: LogoDisplayTarget) => string;
  installerPreviewOnly: string;
  loading: string;
  presetLabel: (preset: LogoPreset['id']) => string;
  weekdayLabel: (weekday: number) => string;
}

/**
 * Feature-owned copy keeps this lane typecheckable before C0 adds the global
 * locale dictionary. C0 can inject a complete localized adapter without
 * changing state ownership or making this component depend on app-wide keys.
 */
export const DEFAULT_LOGO_COPY: LogoCopy = {
  manualEditHint: 'Edit this setting',
  brandLogo: 'logo',
  title: 'App logo',
  hint: 'Choose a shipped mark or safely convert a local static image.',
  reset: 'Reset logo',
  resetDone: 'Logo reset is ready after history acknowledgement.',
  export: 'Export appearance',
  import: 'Import appearance',
  importError: 'That appearance file is invalid or exceeds the local bound.',
  historyOpenButton: 'Open history',
  schedule: 'Scheduled logo appearance',
  scheduleHint: 'Temporary logo values apply only during the selected local wall-clock window.',
  timezone: (timezone) => `Timezone: ${timezone}. Daylight-saving changes use the named wall clock.`,
  scheduleStart: 'Starts',
  scheduleEnd: 'Ends',
  scheduleLabel: 'Rule label',
  scheduleWeekdays: 'Weekdays',
  schedulePreset: 'Scheduled preset',
  scheduleAdd: 'Add schedule',
  scheduleAdded: 'Schedule saved after history acknowledgement.',
  scheduleInvalid: 'Choose valid start and end times, with end after start.',
  scheduleAmbiguous: 'This wall-clock time repeats during daylight-saving change, so both occurrences are included.',
  scheduleError: (code) => ({
    'invalid-timezone': 'The selected timezone is not a valid IANA zone.',
    'invalid-start': 'The start wall-clock value is invalid.',
    'invalid-end': 'The end wall-clock value is invalid.',
    'skipped-start': 'The start wall-clock value does not exist during a daylight-saving gap.',
    'skipped-end': 'The end wall-clock value does not exist during a daylight-saving gap.',
    'invalid-window': 'The end wall-clock value must be after the start.',
  })[code] ?? 'The schedule values are invalid.',
  scheduleEnabled: 'Enabled',
  scheduleEdit: 'Edit',
  scheduleDelete: 'Delete',
  presets: 'Logo presets',
  search: 'Search logo presets',
  noMatch: 'No logo choices match this search.',
  upload: 'Choose a local logo image',
  uploadHelp: 'Static PNG, JPEG, or WebP only. The file stays local.',
  lossBefore: 'Conversion may change format, metadata, profile, crop, or transparency.',
  validating: 'Validating the local image…',
  errorCode: (code, detail) => `Logo input ${code}: ${detail}`,
  validationError: (code) => ({
    empty: 'The selected file is empty.',
    'too-large': 'The selected file exceeds the local byte bound.',
    'unsupported-format': 'Only static PNG, JPEG, and WebP files are accepted.',
    malformed: 'The image signature or metadata is malformed.',
    'too-many-pixels': 'The decoded pixel area exceeds the local bound.',
    'too-large-dimension': 'The image dimensions exceed the local bound.',
    animated: 'Animated image input is not accepted.',
  })[code],
  conversionFailure: 'Logo conversion failed. The previous valid logo remains active.',
  persistenceUnavailable: 'The latest logo remains active in this session, but local persistence is unavailable.',
  historyUnavailable: 'Logo changed in this session, but its history acknowledgement was unavailable.',
  converted: (width, bytes) => `Converted ${width}px logo, ${bytes} bytes, after validation.`,
  selectedPreview: 'Selected logo preview',
  staticPreset: 'Bundled static preset.',
  sourceAlpha: 'source has transparency',
  sourceOpaque: 'source is opaque',
  alphaPreserved: 'output retains transparency',
  opaque: 'output is opaque',
  frame: 'one frame',
  lossDisclosure: (losses) => `Conversion disclosure: ${losses}.`,
  fit: 'Fit',
  contain: 'Contain',
  cover: 'Cover',
  fill: 'Fill',
  focalX: 'Focal point horizontal',
  focalY: 'Focal point vertical',
  crop: 'Crop',
  cropField: (field) => ({ x: 'Crop left', y: 'Crop top', width: 'Crop width', height: 'Crop height' })[field],
  safeArea: 'Keep safe area inset',
  transparent: 'Transparent background',
  rainbow: 'Animated rainbow background',
  rainbowSpeed: 'Rainbow speed level',
  background: 'Background colour',
  targets: 'Display target previews',
  targetLabel: (target) => ({ favicon: 'Favicon', toolbar: 'Toolbar', titlebar: 'Title bar', sidebar: 'Sidebar', installer: 'Installer' })[target],
  installerPreviewOnly: 'Preview only. Stable installer identity never changes.',
  loading: 'Working…',
  presetLabel: (preset) => ({ material: 'Material mark', warm: 'Warm mark', monochrome: 'Monochrome mark', outline: 'Outline mark' })[preset],
  weekdayLabel: (weekday) => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekday] ?? 'Weekday',
};

/**
 * Stable integration points for the three owners that can host this surface.
 * The point is metadata only: every owner still supplies the same state and
 * callback contract, so a palette or shell mount cannot create a second logo
 * store by accident.
 */
export const LOGO_MOUNT_POINTS = ['C0', 'C1', 'C4'] as const;
export type LogoCustomizationMountPoint = (typeof LOGO_MOUNT_POINTS)[number];
export interface LogoCustomizationMountProps {
  initial?: LogoState;
  onChange?: (request: LogoPersistenceRequest) => Promise<boolean> | boolean;
  mountPoint?: LogoCustomizationMountPoint;
  copy?: LogoCopy;
  store?: LogoStateStore;
}

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

function SearchableLogoChoice({
  id,
  label,
  value,
  options,
  onChange,
  copy,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  copy: LogoCopy;
}) {
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
        {visible.length === 0 ? <span className={styles.hint}>{copy.noMatch}</span> : null}
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
  mountPoint = 'C1',
  copy: injectedCopy,
  store: injectedStore,
}: LogoCustomizationMountProps = {}) {
  const copy = injectedCopy ?? DEFAULT_LOGO_COPY;
  const store = injectedStore ?? getLogoStateStore(initial);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const setState = useCallback((next: LogoState | ((current: LogoState) => LogoState), action: 'selected-preset' | 'uploaded-custom' | 'updated' | 'reset' = 'updated') => {
    return store.setState(typeof next === 'function' ? next(store.getSnapshot()) : next, action);
  }, [store]);
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
  const [scheduleSearchQuery, setScheduleSearchQuery] = useState('');
  const scheduleSearch = useRegexSearch(scheduleSearchQuery, setScheduleSearchQuery);
  const onChangeRef = useRef(onChange);
  const refreshGenerationRef = useRef(0);
  const refreshAbortRef = useRef<AbortController | null>(null);
  const uploadGenerationRef = useRef(0);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const intentGenerationRef = useRef(0);
  const pendingSuccessRef = useRef<string | null>(null);
  const pendingSuccessSequenceRef = useRef<number | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const persistenceBridge = useCallback((request: LogoPersistenceRequest) => onChangeRef.current?.(request) ?? false, []);
  const hasPersistenceBridge = typeof onChange === 'function';

  useEffect(() => store.configurePersistence(hasPersistenceBridge ? persistenceBridge : undefined, mountPoint), [hasPersistenceBridge, mountPoint, persistenceBridge, store]);

  useEffect(() => () => {
    uploadAbortRef.current?.abort();
    refreshAbortRef.current?.abort();
    uploadGenerationRef.current += 1;
    refreshGenerationRef.current += 1;
    intentGenerationRef.current += 1;
  }, []);

  const displayedState = useMemo(() => resolveScheduledLogoState(state), [scheduleTick, state]);
  const activeSource = displayedState.custom?.dataUrl
    ?? LOGO_PRESETS.find((preset) => preset.id === displayedState.presetId)?.src
    ?? LOGO_PRESETS[0].src;
  const visiblePresets = useMemo(
    () => LOGO_PRESETS.filter((preset) => search.matches(`${copy.presetLabel(preset.id)} ${preset.id}`)),
    [copy, search, searchQuery],
  );
  const visibleSchedules = useMemo(
    () => state.schedules.filter((rule) => scheduleSearch.matches(`${rule.label} ${rule.id} ${rule.startAt} ${rule.endAt} ${rule.timezone}`)),
    [scheduleSearch, scheduleSearchQuery, state.schedules],
  );

  const supersedeActiveConversions = useCallback(() => {
    const generation = ++intentGenerationRef.current;
    uploadAbortRef.current?.abort();
    refreshAbortRef.current?.abort();
    uploadAbortRef.current = null;
    refreshAbortRef.current = null;
    return generation;
  }, []);

  useEffect(() => store.subscribeMutations((receipt) => {
    if (receipt.daemonAcknowledged === null && receipt.bridgeConfigured) {
      if (pendingSuccessRef.current) pendingSuccessSequenceRef.current = receipt.sequence;
      if (!receipt.persisted) setStatus(copy.persistenceUnavailable);
      return;
    }
    if (pendingSuccessRef.current && pendingSuccessSequenceRef.current === receipt.sequence) {
      const message = pendingSuccessRef.current;
      pendingSuccessRef.current = null;
      pendingSuccessSequenceRef.current = null;
      setStatus(receipt.persisted && receipt.historyRecorded && receipt.bridgeConfigured && receipt.daemonAcknowledged ? message : copy.historyUnavailable);
    } else if (!receipt.persisted) {
      setStatus(copy.persistenceUnavailable);
    }
  }), [copy, store]);

  useEffect(() => {
    const applyScheduled = () => applyLogoStateToDocument(resolveScheduledLogoState(state));
    applyScheduled();
    const timer = window.setInterval(() => {
      supersedeActiveConversions();
      applyScheduled();
      setScheduleTick((value) => value + 1);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [copy, state, supersedeActiveConversions]);

  const update = useCallback((patch: Partial<LogoState>, action: 'updated' | 'selected-preset' | 'uploaded-custom' = 'updated', successMessage?: string) => {
    supersedeActiveConversions();
    pendingSuccessRef.current = successMessage ?? null;
    pendingSuccessSequenceRef.current = null;
    setState((current) => ({ ...current, ...patch }), action);
  }, [setState, supersedeActiveConversions]);

  useEffect(() => {
    const custom = displayedState.custom;
    if (!custom) return undefined;
    const options = {
      crop: displayedState.crop,
      fit: displayedState.fit,
      focalPoint: displayedState.focalPoint,
      safeArea: displayedState.safeArea,
      background: displayedState.background,
    };
    const fingerprint = logoRenderFingerprint(options);
    if (custom.renderFingerprint === fingerprint) return undefined;
    const generation = ++refreshGenerationRef.current;
    const intent = supersedeActiveConversions();
    const controller = new AbortController();
    refreshAbortRef.current = controller;
    const timer = window.setTimeout(() => {
      void convertLogoFile(validatedDataUrlFile(custom.sourceDataUrl ?? custom.dataUrl), { ...options, outputSize: custom.width }, { signal: controller.signal })
        .then((refreshed) => {
          if (generation !== refreshGenerationRef.current || intent !== intentGenerationRef.current) return;
          setState((current) => ({ ...current, custom: {
            ...refreshed,
            sourceMimeType: custom.sourceMimeType,
            sourceHasAlpha: custom.sourceHasAlpha,
            sourceDataUrl: custom.sourceDataUrl,
            losses: custom.losses,
          } }), 'updated');
        })
        .catch((error) => {
          if (generation === refreshGenerationRef.current && !controller.signal.aborted && !(error instanceof Error && error.message === 'conversion-aborted')) setStatus(copy.conversionFailure);
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [copy, displayedState, setState, supersedeActiveConversions]);

  const selectPreset = useCallback((presetId: LogoState['presetId']) => {
    update({ presetId, custom: null, crop: DEFAULT_LOGO_STATE.crop }, 'selected-preset');
    setStatus(null);
  }, [update]);

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    const generation = supersedeActiveConversions();
    uploadGenerationRef.current = generation;
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    setBusy(true);
    setStatus(copy.validating);
    try {
      const { validation } = await fileToValidatedBytes(file);
      if (generation !== uploadGenerationRef.current || generation !== intentGenerationRef.current || controller.signal.aborted) return;
      if (!validation.ok) {
        setStatus(copy.errorCode(validation.code, copy.validationError(validation.code)));
        return;
      }
      const crop = normalizeLogoCrop(state.crop);
      const custom = await convertLogoFile(file, {
        crop,
        fit: state.fit,
        focalPoint: state.focalPoint,
        safeArea: state.safeArea,
        background: state.background,
        outputSize: 512,
      }, { signal: controller.signal });
      if (generation !== uploadGenerationRef.current || generation !== intentGenerationRef.current || controller.signal.aborted) return;
      const activeCustom = {
        ...custom,
        renderFingerprint: logoRenderFingerprint({
          crop,
          fit: state.fit,
          focalPoint: state.focalPoint,
          safeArea: state.safeArea,
          background: state.background,
        }),
      };
      pendingSuccessSequenceRef.current = null;
      pendingSuccessRef.current = copy.converted(custom.width, custom.byteLength);
      setState((current) => ({ ...current, custom: activeCustom, crop }), 'uploaded-custom');
    } catch {
      if (generation !== uploadGenerationRef.current || generation !== intentGenerationRef.current || controller.signal.aborted) return;
      // The prior valid logo remains active. The message is intentionally
      // generic so decoder errors cannot leak source bytes or private paths.
      setStatus(copy.conversionFailure);
    } finally {
      if (generation === uploadGenerationRef.current && generation === intentGenerationRef.current) {
        setBusy(false);
        if (fileRef.current) fileRef.current.value = '';
      }
    }
  }, [copy, state.background, state.crop, state.fit, state.focalPoint, state.safeArea, setState, supersedeActiveConversions]);

  const updateCrop = useCallback((field: keyof typeof state.crop, value: number) => {
    supersedeActiveConversions();
    pendingSuccessRef.current = null;
    pendingSuccessSequenceRef.current = null;
    setState((current) => ({ ...current, crop: normalizeLogoCrop({ ...current.crop, [field]: value }) }));
  }, [setState, supersedeActiveConversions]);

  const background = colorToRgba(state.background);
  const onBackgroundChange = useCallback((next: Rgba) => {
    update({ background: rgbaToHex(next) });
  }, [update]);

  const reset = useCallback(() => {
    supersedeActiveConversions();
    pendingSuccessSequenceRef.current = null;
    pendingSuccessRef.current = copy.resetDone;
    setState({ ...DEFAULT_LOGO_STATE }, 'reset');
    setStatus(null);
  }, [copy, setState, supersedeActiveConversions]);

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
      setStatus(copy.importError);
      if (importRef.current) importRef.current.value = '';
      return;
    }
    const generation = supersedeActiveConversions();
    try {
      const text = await file.text();
      const result = parseLogoStateFile(text);
      if (!result.ok) {
        setStatus(copy.importError);
        return;
      }
      if (generation !== intentGenerationRef.current) return;
      pendingSuccessSequenceRef.current = null;
      pendingSuccessRef.current = copy.import;
      setState(result.state, 'updated');
      setStatus(null);
    } catch {
      setStatus(copy.importError);
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  }, [copy, setState, supersedeActiveConversions]);

  const addSchedule = useCallback(() => {
    const startAt = scheduleStart.slice(0, 16);
    const endAt = scheduleEnd.slice(0, 16);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';
    if (!scheduleStart || !scheduleEnd) {
      setStatus(copy.scheduleInvalid);
      return;
    }
    const scheduleValidation = validateLogoSchedule({ startAt, endAt, timezone });
    if (!scheduleValidation.ok) {
      setStatus(copy.scheduleError(scheduleValidation.code));
      return;
    }
    const id = editingScheduleId ?? `logo-schedule-${Date.now().toString(36)}`;
    const nextRule = { id, label: scheduleLabel.trim() || id, enabled: true, startAt, endAt, weekdays: scheduleWeekdays.length ? scheduleWeekdays : [0, 1, 2, 3, 4, 5, 6], timezone, patch: { presetId: schedulePreset, fit: state.fit, background: state.background, safeArea: state.safeArea, rainbowSpeedLevel: state.rainbowSpeedLevel, crop: state.crop, focalPoint: state.focalPoint } };
    const successMessage = scheduleValidation.start === 'ambiguous' || scheduleValidation.end === 'ambiguous'
      ? `${copy.scheduleAdded} ${copy.scheduleAmbiguous}`
      : copy.scheduleAdded;
    update({ schedules: editingScheduleId ? state.schedules.map((rule) => rule.id === editingScheduleId ? nextRule : rule) : [...state.schedules, nextRule] }, 'updated', successMessage);
    setEditingScheduleId(null);
    setStatus(null);
  }, [copy, editingScheduleId, scheduleEnd, scheduleLabel, schedulePreset, scheduleStart, scheduleWeekdays, state.schedules, update]);

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
      data-logo-mount-point={mountPoint}
      data-od-setting="appearance.logo"
      data-testid="logo-customization-section"
      aria-labelledby="logo-customization-title"
    >
      <div className={styles.header}>
        <div>
          <h3 id="logo-customization-title">{copy.title}</h3>
          <p className={styles.hint}>
            {copy.manualEditHint} ({copy.brandLogo})
            {' '}{copy.hint}
          </p>
        </div>
        <button
          type="button"
          className={styles.reset}
          onClick={reset}
          data-testid="logo-reset"
        >
          {copy.reset}
        </button>
      </div>

      <div className={styles.exportRow} data-od-setting="appearance.logo.export">
        <button type="button" className={styles.reset} onClick={exportAppearance}>{copy.export}</button>
        <label className={styles.importButton}>
          {copy.import}
          <input ref={importRef} type="file" accept="application/json,.json" onChange={(event) => void importAppearance(event.target.files?.[0])} />
        </label>
        <button type="button" className={styles.reset} onClick={() => openVersionHistory({ domainId: 'settings' })}>{copy.historyOpenButton}</button>
      </div>

      <fieldset className={styles.scheduleFieldset} data-od-setting="appearance.logo.schedule">
        <legend>{copy.schedule}</legend>
        <p className={styles.hint}>{copy.scheduleHint}</p>
        <p className={styles.hint}>{copy.timezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time')}</p>
        <label className={styles.field}><span>{copy.scheduleStart}</span><input type="datetime-local" value={scheduleStart} onChange={(event) => setScheduleStart(event.target.value)} /></label>
        <label className={styles.field}><span>{copy.scheduleEnd}</span><input type="datetime-local" value={scheduleEnd} onChange={(event) => setScheduleEnd(event.target.value)} /></label>
        <label className={styles.field}><span>{copy.scheduleLabel}</span><input type="text" value={scheduleLabel} onChange={(event) => setScheduleLabel(event.target.value)} /></label>
        <fieldset className={styles.weekdays}><legend>{copy.scheduleWeekdays}</legend>{Array.from({ length: 7 }, (_, index) => <label key={index}><input type="checkbox" checked={scheduleWeekdays.includes(index)} onChange={(event) => setScheduleWeekdays((current) => event.target.checked ? Array.from(new Set([...current, index])).sort() : current.filter((value) => value !== index))} />{copy.weekdayLabel(index)}</label>)}</fieldset>
        <div className={styles.field}><span>{copy.schedulePreset}</span><SearchableLogoChoice copy={copy} id="logo-schedule-preset" label={copy.schedulePreset} value={schedulePreset} options={LOGO_PRESETS.map((preset) => ({ value: preset.id, label: copy.presetLabel(preset.id) }))} onChange={(value) => setSchedulePreset(value as LogoState['presetId'])} /></div>
        <button type="button" className={styles.reset} onClick={addSchedule}>{copy.scheduleAdd}</button>
        <RegexSearchField search={scheduleSearch} fieldLabel={copy.schedule} ariaLabel={`${copy.schedule} search`} placeholder={copy.schedule} testId="logo-schedule-search" />
        <ul className={styles.scheduleList}>{visibleSchedules.map((rule) => <li key={rule.id}><strong>{rule.label}</strong> · {rule.startAt} → {rule.endAt}, {rule.patch.presetId ? copy.presetLabel(rule.patch.presetId) : copy.title}<label><input type="checkbox" checked={rule.enabled} onChange={(event) => toggleSchedule(rule.id, event.target.checked)} />{copy.scheduleEnabled}</label><button type="button" onClick={() => editSchedule(rule.id)}>{copy.scheduleEdit}</button><button type="button" onClick={() => deleteSchedule(rule.id)}>{copy.scheduleDelete}</button></li>)}</ul>
      </fieldset>

      <div className={styles.search}>
        <RegexSearchField
          search={search}
          fieldLabel={copy.presets}
          ariaLabel={copy.search}
          placeholder={copy.search}
          testId="logo-preset-search"
        />
      </div>

      <div className={styles.presets} role="list" aria-label={copy.presets}>
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
            <span>{copy.presetLabel(preset.id)}</span>
          </button>
        ))}
      </div>

      <div className={styles.uploadRow} data-od-setting="appearance.logo.upload">
        <label htmlFor="app-logo-upload" className={styles.hint}>{copy.upload}</label>
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
          {copy.uploadHelp} {' '}{copy.lossBefore}
        </span>
      </div>

      <div className={styles.editorGrid}>
        <div className={styles.previewColumn}>
          <h4>{copy.targets}</h4>
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
              alt={copy.selectedPreview}
              style={{
                objectFit: displayedState.fit,
                objectPosition: `${displayedState.focalPoint.x * 100}% ${displayedState.focalPoint.y * 100}%`,
                clipPath: `inset(${displayedState.crop.y * 100}% ${(1 - displayedState.crop.x - displayedState.crop.width) * 100}% ${(1 - displayedState.crop.y - displayedState.crop.height) * 100}% ${displayedState.crop.x * 100}%)`,
              }}
            />
            {displayedState.safeArea ? <span className={styles.safeArea} aria-hidden="true" /> : null}
          </div>
          <p className={styles.hint}>
            {displayedState.custom ? `${displayedState.custom.width}×${displayedState.custom.height}, ${displayedState.custom.sourceHasAlpha ? copy.sourceAlpha : copy.sourceOpaque}, ${displayedState.custom.hasAlpha ? copy.alphaPreserved : copy.opaque}, ${copy.frame}` : copy.staticPreset}
          </p>
          {displayedState.custom?.losses?.length ? (
            <p className={styles.hint} data-testid="logo-loss-disclosure">
              {copy.lossDisclosure(displayedState.custom.losses.join(', '))}
            </p>
          ) : null}
        </div>

        <div className={styles.controls}>
          <div className={styles.field} data-od-setting="appearance.logo.fit">
            <span>{copy.fit}</span>
            <SearchableLogoChoice
              id="logo-fit"
              label={copy.fit}
              value={state.fit}
              options={[{ value: 'contain', label: copy.contain }, { value: 'cover', label: copy.cover }, { value: 'fill', label: copy.fill }]}
              copy={copy}
              onChange={(fit) => update({ fit: fit as LogoState['fit'] })}
            />
          </div>
          <label className={styles.field}>
            <span data-od-setting="appearance.logo.focal">{copy.focalX}</span>
            <input type="range" min="0" max="1" step="0.01" value={state.focalPoint.x} onChange={(event) => update({ focalPoint: { ...state.focalPoint, x: clampFraction(Number(event.target.value), 0.5) } })} />
            <output>{Math.round(state.focalPoint.x * 100)}%</output>
          </label>
          <label className={styles.field}>
            <span data-od-setting="appearance.logo.focal">{copy.focalY}</span>
            <input type="range" min="0" max="1" step="0.01" value={state.focalPoint.y} onChange={(event) => update({ focalPoint: { ...state.focalPoint, y: clampFraction(Number(event.target.value), 0.5) } })} />
            <output>{Math.round(state.focalPoint.y * 100)}%</output>
          </label>
          <fieldset className={styles.cropFieldset} data-od-setting="appearance.logo.crop">
            <legend>{copy.crop}</legend>
            {(['x', 'y', 'width', 'height'] as const).map((field) => (
              <label className={styles.numeric} key={field}>
                <span>{copy.cropField(field)}</span>
                <input type="number" min="0.01" max="1" step="0.01" value={state.crop[field]} onChange={(event) => updateCrop(field, Number(event.target.value))} />
              </label>
            ))}
          </fieldset>
          <label className={styles.check} data-od-setting="appearance.logo.safeArea">
            <input type="checkbox" checked={state.safeArea} onChange={(event) => update({ safeArea: event.target.checked })} />
            <span>{copy.safeArea}</span>
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={state.background === 'transparent'} onChange={(event) => update({ background: event.target.checked ? 'transparent' : '#fff8f6' })} />
            <span data-od-setting="appearance.logo.background">{copy.transparent}</span>
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={state.background === 'rainbow'} onChange={(event) => update({ background: event.target.checked ? 'rainbow' : 'transparent' })} />
            <span>{copy.rainbow}</span>
          </label>
          {state.background === 'rainbow' ? <label className={styles.field}><span>{copy.rainbowSpeed}</span><input type="range" min="1" max="5" step="1" value={state.rainbowSpeedLevel} onChange={(event) => update({ rainbowSpeedLevel: Number(event.target.value) })} /><output>{state.rainbowSpeedLevel}</output></label> : null}
          {state.background !== 'transparent' && state.background !== 'rainbow' ? (
            <div className={styles.colorField}>
              <InfiniteColorPicker
                value={background}
                onChange={onBackgroundChange}
                background={{ r: 255, g: 255, b: 255 } satisfies Rgb}
                label={copy.background}
                alphaWillBeDropped={false}
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className={styles.targets}>
        <h4>{copy.targets}</h4>
        <RegexSearchField search={targetSearch} fieldLabel={copy.targets} ariaLabel={`${copy.targets} search`} placeholder={copy.targets} testId="logo-target-search" />
        <div className={styles.targetGrid}>
          {LOGO_DISPLAY_TARGETS.filter((target) => targetSearch.matches(`${copy.targetLabel(target.id)} ${target.id}`)).map((target) => (
            <figure key={target.id} className={styles.target} data-testid={`logo-target-${target.id}`}>
              <div className={styles.targetTile} style={{ width: Math.min(target.width, 128), height: Math.min(target.height, 128) }}>
                <img src={displayedState.custom?.variants?.[target.id]?.dataUrl ?? activeSource} alt={`${copy.targetLabel(target.id)} logo preview`} style={{ objectFit: displayedState.fit, objectPosition: `${displayedState.focalPoint.x * 100}% ${displayedState.focalPoint.y * 100}%` }} />
              </div>
              <figcaption>{copy.targetLabel(target.id)} · {target.width}×{target.height}</figcaption>
              {target.id === 'installer' ? <p className={styles.hint}>{copy.installerPreviewOnly}</p> : null}
            </figure>
          ))}
        </div>
      </div>

      {busy ? <p role="status" className={styles.status}>{copy.loading}</p> : null}
      {status ? <p role="status" className={styles.status} data-testid="logo-status">{status}</p> : null}
      {state.custom && state.custom.byteLength > MAX_LOGO_OUTPUT_BYTES ? (
        <p role="alert" className={styles.status}>Converted output exceeds the local bound and is not active.</p>
      ) : null}
    </section>
  );
}

type LogoCustomizationOwnerProps = Omit<LogoCustomizationMountProps, 'mountPoint'>;

/** Explicit wrappers keep the three integration seams discoverable to hosts. */
export function LogoCustomizationC0(props: LogoCustomizationOwnerProps = {}) {
  return <LogoCustomizationSection {...props} mountPoint="C0" />;
}

export function LogoCustomizationC1(props: LogoCustomizationOwnerProps = {}) {
  return <LogoCustomizationSection {...props} mountPoint="C1" />;
}

export function LogoCustomizationC4(props: LogoCustomizationOwnerProps = {}) {
  return <LogoCustomizationSection {...props} mountPoint="C4" />;
}
