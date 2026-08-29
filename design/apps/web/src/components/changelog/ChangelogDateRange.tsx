// The changelog's date filter: two fields you can type into, and a calendar
// anchored to them that you can click through.
//
// The rule that shapes the whole component is that typing is never punished.
// A half-typed date is reported as unfinished, an impossible one as impossible,
// and in both cases the characters stay exactly where the user put them — the
// field is never rewritten, reformatted or cleared underneath them. Only a
// complete, real date is committed upward, so the list behind the popover
// cannot flicker through nonsense while somebody is still typing.
//
// The parsing, the calendar arithmetic and the locale's field order live in
// `lib/changelog/dates.ts`, which is where they are tested.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { Button, Input, Select } from '@open-design/components';
import { Icon } from '../Icon';
import { useI18n } from '../../i18n';
import { RegexSearchField } from '../regex/RegexSearchField';
import { useRegexSearch } from '../regex/useRegexSearch';
import {
  addMonths,
  formatIsoDate,
  localeDateOrder,
  monthGrid,
  monthLabels,
  parseIsoDate,
  parseTypedDate,
  weekdayLabels,
  type TypedDateResult,
} from '../../lib/changelog/dates';
import styles from './ChangelogDateRange.module.css';

export interface ChangelogDateRangeValue {
  readonly from: string | null;
  readonly to: string | null;
}

export type ChangelogDatePresetId = 'all' | 'last-7-days' | 'last-30-days' | 'last-90-days';

export interface ChangelogDatePreset {
  readonly id: ChangelogDatePresetId;
  readonly label: string;
  /** Number of inclusive days ending at the newest dated entry. Omit for all time. */
  readonly days?: number;
}

interface Props {
  readonly value: ChangelogDateRangeValue;
  /** The dated span the data actually covers, used to seed the calendar. */
  readonly bounds: { readonly first: string | null; readonly last: string | null };
  readonly onChange: (next: ChangelogDateRangeValue) => void;
  /** Host-provided labels keep this control usable in every language mode. */
  readonly presets?: readonly ChangelogDatePreset[];
  readonly presetsLabel?: string;
  readonly noMatchesLabel?: string;
}

type Field = 'from' | 'to';

// Years offered by the jump. Anchored on what the changelog actually covers
// plus a little room either side, so the list is short enough to be a jump
// rather than a scroll through a century.
const YEAR_PADDING = 2;

/** Resolve a named range against the newest dated record, not the host clock. */
export function resolveChangelogDatePreset(
  preset: ChangelogDatePreset,
  bounds: { readonly last: string | null },
): ChangelogDateRangeValue | null {
  if (preset.days == null) return { from: null, to: null };
  if (preset.days < 1 || bounds.last == null) return null;
  const end = parseIsoDate(bounds.last);
  if (end == null) return null;
  const endDate = new Date(Date.UTC(end.year, end.month - 1, end.day));
  endDate.setUTCDate(endDate.getUTCDate() - (preset.days - 1));
  return {
    from: isoDate(endDate.getUTCFullYear(), endDate.getUTCMonth() + 1, endDate.getUTCDate()),
    to: isoDate(end.year, end.month, end.day),
  };
}

/** The four things a half-typed or impossible date can be told about itself. */
type DateMessageKey =
  | 'changelog.datePartialYear'
  | 'changelog.datePartialFields'
  | 'changelog.dateInvalidRange'
  | 'changelog.dateInvalidShape';

function messageKeyFor(result: TypedDateResult): DateMessageKey | null {
  if (result.kind === 'partial') {
    return result.reason === 'year' ? 'changelog.datePartialYear' : 'changelog.datePartialFields';
  }
  if (result.kind === 'invalid') {
    return result.reason === 'range' ? 'changelog.dateInvalidRange' : 'changelog.dateInvalidShape';
  }
  return null;
}

export function ChangelogDateRange({
  value,
  bounds,
  onChange,
  presets = [],
  presetsLabel,
  noMatchesLabel,
}: Props) {
  const { locale, t } = useI18n();
  const order = useMemo(() => localeDateOrder(locale), [locale]);
  const [monthQuery, setMonthQuery] = useState('');
  const [yearQuery, setYearQuery] = useState('');
  const monthSearch = useRegexSearch(monthQuery, setMonthQuery);
  const yearSearch = useRegexSearch(yearQuery, setYearQuery);
  const [fromText, setFromText] = useState(value.from ?? '');
  const [toText, setToText] = useState(value.to ?? '');
  const [open, setOpen] = useState(false);
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverId = useId();

  const anchorDate = useMemo(
    () => parseIsoDate(value.from ?? value.to ?? bounds.last ?? bounds.first ?? '') ?? null,
    [bounds.first, bounds.last, value.from, value.to],
  );
  const [view, setView] = useState(() => {
    const now = new Date();
    return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
  });
  // Re-seed the visible month whenever the popover opens, so it lands on the
  // range in force (or on the data) rather than wherever it was last left.
  useEffect(() => {
    if (!open || anchorDate == null) return;
    setView({ year: anchorDate.year, month: anchorDate.month });
  }, [anchorDate, open]);

  useEffect(() => {
    if (!open) return;
    function onDocPointer(event: MouseEvent) {
      if (wrapRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      setOpen(false);
      // Escape returns the user to the control they opened, never to the top
      // of the dialog.
      triggerRef.current?.focus();
    }
    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const [fromResult, setFromResult] = useState<TypedDateResult>({ kind: 'empty' });
  const [toResult, setToResult] = useState<TypedDateResult>({ kind: 'empty' });

  const commitTyped = useCallback(
    (field: Field, raw: string) => {
      const result = parseTypedDate(raw, order);
      if (field === 'from') setFromResult(result);
      else setToResult(result);
      // Only a whole, real date moves the filter. Everything else leaves the
      // committed value alone — the user is still typing.
      if (result.kind !== 'ok' && result.kind !== 'empty') return;
      const bound = result.kind === 'ok' ? result.iso : null;
      onChange(
        field === 'from' ? { from: bound, to: value.to } : { from: value.from, to: bound },
      );
    },
    [onChange, order, value],
  );

  const applyPick = useCallback(
    (iso: string) => {
      if (pendingStart == null) {
        setPendingStart(iso);
        setFromText(iso);
        setToText('');
        setFromResult({ kind: 'ok', iso });
        setToResult({ kind: 'empty' });
        onChange({ from: iso, to: null });
        return;
      }
      // Second click closes the range. Clicking backwards is a legitimate way
      // to select, so the two ends are ordered rather than rejected.
      const from = iso < pendingStart ? iso : pendingStart;
      const to = iso < pendingStart ? pendingStart : iso;
      setPendingStart(null);
      setFromText(from);
      setToText(to);
      setFromResult({ kind: 'ok', iso: from });
      setToResult({ kind: 'ok', iso: to });
      onChange({ from, to });
    },
    [onChange, pendingStart],
  );

  const clear = useCallback(() => {
    setPendingStart(null);
    setFromText('');
    setToText('');
    setFromResult({ kind: 'empty' });
    setToResult({ kind: 'empty' });
    onChange({ from: null, to: null });
  }, [onChange]);

  const applyPreset = useCallback((preset: ChangelogDatePreset) => {
    setPendingStart(null);
    const range = resolveChangelogDatePreset(preset, bounds);
    if (range == null) {
      return;
    }
    if (range.from == null || range.to == null) {
      setFromText('');
      setToText('');
      setFromResult({ kind: 'empty' });
      setToResult({ kind: 'empty' });
      onChange({ from: null, to: null });
      return;
    }
    // The helper uses UTC day arithmetic so this stays stable around
    // daylight-saving transitions. Its upper bound is the newest dated entry,
    // not the host clock, so a historical changelog never invents a future range.
    setFromText(range.from);
    setToText(range.to);
    setFromResult({ kind: 'ok', iso: range.from });
    setToResult({ kind: 'ok', iso: range.to });
    const end = parseIsoDate(range.to);
    if (end != null) setView({ year: end.year, month: end.month });
    onChange(range);
  }, [bounds, onChange]);

  const weeks = useMemo(() => monthGrid(view.year, view.month), [view.month, view.year]);
  const months = useMemo(() => monthLabels(locale), [locale]);
  const weekdays = useMemo(() => weekdayLabels(locale), [locale]);
  const years = useMemo(() => {
    const first = parseIsoDate(bounds.first ?? '')?.year ?? view.year;
    const last = parseIsoDate(bounds.last ?? '')?.year ?? view.year;
    const low = Math.min(first, last, view.year) - YEAR_PADDING;
    const high = Math.max(first, last, view.year) + YEAR_PADDING;
    const list: number[] = [];
    for (let year = low; year <= high; year += 1) list.push(year);
    return list;
  }, [bounds.first, bounds.last, view.year]);
  const visibleMonths = useMemo(
    () => months
      .map((label, index) => ({ label, value: index + 1 }))
      .filter((item) => item.value === view.month || monthSearch.matches(item.label)),
    [monthSearch, months, view.month],
  );
  const visibleYears = useMemo(
    () => years.filter((year) => year === view.year || yearSearch.matches(String(year))),
    [view.year, years, yearSearch],
  );
  const noMatches = noMatchesLabel ?? t('changelog.empty');

  const fromMessageKey = messageKeyFor(fromResult);
  const toMessageKey = messageKeyFor(toResult);
  // A backwards range is reported, not silently reordered: the user typed two
  // specific dates and deserves to be told they disagree.
  const backwards =
    value.from != null && value.to != null && value.to < value.from;

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <div className={styles.fields}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{t('changelog.dateFrom')}</span>
          <Input
            aria-describedby={fromMessageKey == null ? undefined : `${popoverId}-from-msg`}
            aria-invalid={fromResult.kind === 'invalid' || undefined}
            className={styles.input}
            inputMode="numeric"
            placeholder={t('changelog.datePlaceholder')}
            value={fromText}
            onChange={(event) => {
              const next = event.currentTarget.value;
              setFromText(next);
              commitTyped('from', next);
            }}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{t('changelog.dateTo')}</span>
          <Input
            aria-describedby={toMessageKey == null ? undefined : `${popoverId}-to-msg`}
            aria-invalid={toResult.kind === 'invalid' || undefined}
            className={styles.input}
            inputMode="numeric"
            placeholder={t('changelog.datePlaceholder')}
            value={toText}
            onChange={(event) => {
              const next = event.currentTarget.value;
              setToText(next);
              commitTyped('to', next);
            }}
          />
        </label>
        <Button
          aria-controls={open ? popoverId : undefined}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={t('changelog.dateOpenAria')}
          className={styles.trigger}
          ref={triggerRef}
          size="icon"
          variant="ghost"
          onClick={() => setOpen((current) => !current)}
        >
          <Icon name="history" size={15} />
        </Button>
        {value.from != null || value.to != null || fromText !== '' || toText !== '' ? (
          <Button className={styles.clear} variant="ghost" onClick={clear}>
            {t('common.clear')}
          </Button>
        ) : null}
      </div>
      <p className={styles.hint}>{t('changelog.dateHint')}</p>
      <div className={styles.presets} role="group" aria-label={presetsLabel ?? t('changelog.dateHint')}>
        {presets.map((preset) => {
          let active = preset.id === 'all' && value.from == null && value.to == null;
          const range = resolveChangelogDatePreset(preset, bounds);
          if (range?.from != null && range.to != null) active = value.from === range.from && value.to === range.to;
          return (
            <button
              aria-pressed={active}
              className={styles.preset}
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset)}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      {fromMessageKey != null ? (
        <p className={styles.message} id={`${popoverId}-from-msg`} role="status">
          {t('changelog.dateFrom')}: {t(fromMessageKey)}
        </p>
      ) : null}
      {toMessageKey != null ? (
        <p className={styles.message} id={`${popoverId}-to-msg`} role="status">
          {t('changelog.dateTo')}: {t(toMessageKey)}
        </p>
      ) : null}
      {backwards ? (
        <p className={styles.message} role="status">
          {t('changelog.dateRangeBackwards')}
        </p>
      ) : null}

      {open ? (
        <div
          aria-label={t('changelog.calendarAria')}
          className={styles.popover}
          id={popoverId}
          role="dialog"
        >
          <div className={styles.calendarHeader}>
            <Button
              aria-label={t('changelog.prevMonth')}
              size="icon"
              variant="ghost"
              onClick={() => setView((current) => addMonths(current.year, current.month, -1))}
            >
              <Icon name="chevron-left" size={15} />
            </Button>
            <div className={styles.jump}>
              <RegexSearchField
                search={monthSearch}
                fieldLabel={t('changelog.monthLabel')}
                placeholder={t('changelog.monthLabel')}
                ariaLabel={t('changelog.monthLabel')}
                testId="changelog-month-search"
              />
              <Select
                aria-label={t('changelog.monthLabel')}
                value={String(view.month)}
                onChange={(event) =>
                  setView((current) => ({ ...current, month: Number(event.currentTarget.value) }))
                }
              >
                {visibleMonths.length === 0 ? (
                  <option disabled>{noMatches}</option>
                ) : visibleMonths.map(({ label, value }) => (
                  <option key={label} value={String(value)}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <div className={styles.jump}>
              <RegexSearchField
                search={yearSearch}
                fieldLabel={t('changelog.yearLabel')}
                placeholder={t('changelog.yearLabel')}
                ariaLabel={t('changelog.yearLabel')}
                testId="changelog-year-search"
              />
              <Select
                aria-label={t('changelog.yearLabel')}
                value={String(view.year)}
                onChange={(event) =>
                  setView((current) => ({ ...current, year: Number(event.currentTarget.value) }))
                }
              >
                {visibleYears.length === 0 ? (
                  <option disabled>{noMatches}</option>
                ) : visibleYears.map((year) => (
                  <option key={year} value={String(year)}>
                    {year}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              aria-label={t('changelog.nextMonth')}
              size="icon"
              variant="ghost"
              onClick={() => setView((current) => addMonths(current.year, current.month, 1))}
            >
              <Icon name="chevron-right" size={15} />
            </Button>
          </div>
          <div className={styles.grid} role="grid">
            <div className={styles.weekdays} role="row">
              {weekdays.map((label, index) => (
                <span className={styles.weekday} key={`${label}-${index}`} role="columnheader">
                  {label}
                </span>
              ))}
            </div>
            {weeks.map((week, weekIndex) => (
              <div className={styles.week} key={`week-${weekIndex}`} role="row">
                {week.map((day, index) => {
                  if (day == null) {
                    return <span className={styles.blank} key={`blank-${index}`} role="gridcell" />;
                  }
                  const start = pendingStart ?? value.from;
                  const inRange =
                    value.from != null && value.to != null && day >= value.from && day <= value.to;
                  const isEdge = day === start || day === value.to;
                  return (
                    <span
                      aria-selected={isEdge || inRange}
                      className={styles.cell}
                      key={day}
                      role="gridcell"
                    >
                      <button
                        aria-label={formatIsoDate(day, locale)}
                        className={`${styles.day}${inRange ? ` ${styles.dayInRange}` : ''}${
                          isEdge ? ` ${styles.dayEdge}` : ''
                        }`}
                        type="button"
                        onClick={() => applyPick(day)}
                      >
                        {Number(day.slice(8, 10))}
                      </button>
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
          <p className={styles.popoverHint}>
            {pendingStart == null ? t('changelog.pickStart') : t('changelog.pickEnd')}
          </p>
        </div>
      ) : null}
    </div>
  );
}
