// Dates for the changelog viewer: typing them, reading them, and laying a
// month out as a grid.
//
// Pure and locale-parameterised — `Intl` is consulted once, at the edge, to
// learn which order a reader writes a date in, and everything below takes that
// order as an argument. That keeps the parsing testable without pinning a
// machine's locale, and keeps the calendar's arithmetic free of `Date`
// timezone surprises: every value in and out is a plain `yyyy-mm-dd` string.

/** The order a locale writes the three fields in. */
export type DateFieldOrder = 'ymd' | 'dmy' | 'mdy';

export type TypedDateResult =
  | { readonly kind: 'empty' }
  | { readonly kind: 'ok'; readonly iso: string }
  /** Something is there, but not yet a whole date. Never an error to shout about. */
  | { readonly kind: 'partial'; readonly reason: 'fields' | 'year' }
  /** A whole date that cannot exist, or characters that are not one. */
  | { readonly kind: 'invalid'; readonly reason: 'shape' | 'range' };

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Which order this locale writes a date in. Falls back to ISO order. */
export function localeDateOrder(locale: string): DateFieldOrder {
  try {
    const parts = new Intl.DateTimeFormat(locale).formatToParts(new Date(Date.UTC(2000, 0, 2)));
    const order = parts
      .map((part) => part.type)
      .filter((type): type is 'year' | 'month' | 'day' =>
        type === 'year' || type === 'month' || type === 'day')
      .map((type) => type[0])
      .join('');
    if (order === 'dmy') return 'dmy';
    if (order === 'mdy') return 'mdy';
    return 'ymd';
  } catch {
    return 'ymd';
  }
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** `yyyy-mm-dd` from a 1-based month. */
export function isoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`;
}

export function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
  const match = ISO.exec(value.trim());
  if (match == null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isRealDate(year, month, day)) return null;
  return { year, month, day };
}

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  // Round-trip through UTC so 2026-02-31 is rejected rather than silently
  // rolling into March, which is what a Date constructor would do.
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

/**
 * Read a date the user typed.
 *
 * ISO is always accepted — a four-digit leading year is unambiguous in every
 * locale — and anything else is read in the locale's own field order. The
 * result distinguishes "not finished yet" from "cannot be a date", because the
 * field reports the two differently and never throws away what was typed.
 */
export function parseTypedDate(input: string, order: DateFieldOrder = 'ymd'): TypedDateResult {
  const trimmed = input.trim();
  if (trimmed.length === 0) return { kind: 'empty' };
  const tokens = trimmed.split(/[-/.\s]+/).filter((token) => token.length > 0);
  if (tokens.some((token) => !/^\d+$/.test(token))) return { kind: 'invalid', reason: 'shape' };
  if (tokens.length < 3) return { kind: 'partial', reason: 'fields' };
  if (tokens.length > 3) return { kind: 'invalid', reason: 'shape' };

  const [a, b, c] = tokens as [string, string, string];
  let year: string;
  let month: string;
  let day: string;
  if (a.length === 4) {
    // A leading four-digit year is ISO order whatever the locale prefers.
    [year, month, day] = [a, b, c];
  } else if (order === 'dmy') {
    [day, month, year] = [a, b, c];
  } else if (order === 'mdy') {
    [month, day, year] = [a, b, c];
  } else {
    [year, month, day] = [a, b, c];
  }
  if (year.length !== 4) return { kind: 'partial', reason: 'year' };
  const numbers = { year: Number(year), month: Number(month), day: Number(day) };
  if (!isRealDate(numbers.year, numbers.month, numbers.day)) {
    return { kind: 'invalid', reason: 'range' };
  }
  return { kind: 'ok', iso: isoDate(numbers.year, numbers.month, numbers.day) };
}

/** Inclusive on both ends; a null bound is open. */
export function withinRange(date: string, from: string | null, to: string | null): boolean {
  if (from != null && date < from) return false;
  if (to != null && date > to) return false;
  return true;
}

/** Shift a year/month pair by whole months, wrapping the year. */
export function addMonths(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const zeroBased = year * 12 + (month - 1) + delta;
  return { year: Math.floor(zeroBased / 12), month: (zeroBased % 12 + 12) % 12 + 1 };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * A month laid out as weeks of `yyyy-mm-dd`, padded with nulls so every row
 * has seven cells. Padding is null rather than a neighbouring month's date, so
 * a click can never land on a day the grid is not actually showing.
 */
export function monthGrid(
  year: number,
  month: number,
  weekStartsOn = 0,
): (string | null)[][] {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const lead = (firstWeekday - weekStartsOn + 7) % 7;
  const total = daysInMonth(year, month);
  const cells: (string | null)[] = [];
  for (let i = 0; i < lead; i += 1) cells.push(null);
  for (let day = 1; day <= total; day += 1) cells.push(isoDate(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/**
 * Render an ISO date in the reader's language. Falls back to the ISO string
 * itself, which is still a date a reader can act on — never an empty cell.
 */
export function formatIsoDate(iso: string, locale: string): string {
  const parts = parseIsoDate(iso);
  if (parts == null) return iso;
  try {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)));
  } catch {
    return iso;
  }
}

/** Localized weekday initials, Sunday-first by default. */
export function weekdayLabels(locale: string, weekStartsOn = 0): string[] {
  const labels: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    // 2024-01-07 was a Sunday, so `+ i` walks a real week in order.
    const date = new Date(Date.UTC(2024, 0, 7 + ((weekStartsOn + i) % 7)));
    try {
      labels.push(new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(date));
    } catch {
      labels.push(['S', 'M', 'T', 'W', 'T', 'F', 'S'][(weekStartsOn + i) % 7] ?? '');
    }
  }
  return labels;
}

/** Localized month names, January first. */
export function monthLabels(locale: string): string[] {
  const labels: string[] = [];
  for (let month = 0; month < 12; month += 1) {
    const date = new Date(Date.UTC(2024, month, 15));
    try {
      labels.push(new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(date));
    } catch {
      labels.push(String(month + 1));
    }
  }
  return labels;
}
