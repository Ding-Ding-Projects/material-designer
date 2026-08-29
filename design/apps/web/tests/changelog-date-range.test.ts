import { describe, expect, it } from 'vitest';

import { resolveChangelogDatePreset, type ChangelogDatePreset } from '../src/components/changelog/ChangelogDateRange';
import { parseIsoDate, parseTypedDate } from '../src/lib/changelog/dates';

const bounds = { last: '2026-08-29' };

describe('changelog date presets', () => {
  it('resolves all time without inventing a bound', () => {
    const preset: ChangelogDatePreset = { id: 'all', label: 'All time' };
    expect(resolveChangelogDatePreset(preset, bounds)).toEqual({ from: null, to: null });
  });

  it('counts the newest dated entry inclusively', () => {
    expect(resolveChangelogDatePreset({ id: 'last-7-days', label: 'Last 7 days', days: 7 }, bounds)).toEqual({
      from: '2026-08-23',
      to: '2026-08-29',
    });
    expect(resolveChangelogDatePreset({ id: 'last-30-days', label: 'Last 30 days', days: 30 }, bounds)).toEqual({
      from: '2026-07-31',
      to: '2026-08-29',
    });
  });

  it('refuses a preset when the source has no valid dated entry', () => {
    expect(resolveChangelogDatePreset({ id: 'last-7-days', label: 'Last 7 days', days: 7 }, { last: null })).toBeNull();
    expect(resolveChangelogDatePreset({ id: 'last-7-days', label: 'Last 7 days', days: 0 }, bounds)).toBeNull();
  });
});

describe('strict calendar dates', () => {
  it('rejects overflow dates instead of allowing Date to roll them forward', () => {
    expect(parseIsoDate('2024-02-30')).toBeNull();
    expect(parseTypedDate('2024-02-30', 'ymd')).toEqual({ kind: 'invalid', reason: 'range' });
    expect(parseIsoDate('2024-02-29')).toEqual({ year: 2024, month: 2, day: 29 });
  });
});
