import { describe, expect, it, vi } from 'vitest';

import {
  bulkRunVerdict,
  runBulkAction,
  type BulkRunProgress,
} from '../../../src/components/bulk/run';

// These are the invariants the Design Files bulk delete now depends on.
//
// It used to run its own loop, drop the caller's progress and abort options on
// the floor, and return nothing — so the panel fell back to assuming every
// item succeeded and reported "N done." after a run the user had cancelled.
// The fix routes that call site through runBulkAction, which makes these
// behaviours the shared, tested ones rather than re-derived per call site.

const items = [
  { id: 'a.png', label: 'a.png' },
  { id: 'b.png', label: 'b.png' },
  { id: 'c.png', label: 'c.png' },
];

describe('runBulkAction — reporting what actually happened', () => {
  it('counts a helper that resolves false as a failure, not a success', async () => {
    // deleteProjectFile reports refusal by returning false rather than
    // throwing. A runner that only understood exceptions would count every
    // refused delete as a win, which is the exact shape of the bug this
    // guards: the user is told the file is gone while it is still there.
    const result = await runBulkAction(items, (item) => item.id !== 'b.png');

    expect(result.succeeded.map((i) => i.id)).toEqual(['a.png', 'c.png']);
    expect(result.failed.map((f) => f.item.id)).toEqual(['b.png']);
    expect(result.failed[0]?.error).toBe('refused');
    expect(bulkRunVerdict(result)).toBe('partial');
  });

  it('names the items it never reached when the run is stopped', async () => {
    const signal = { aborted: false };
    const result = await runBulkAction(
      items,
      (item) => {
        if (item.id === 'a.png') signal.aborted = true;
        return true;
      },
      { signal },
    );

    expect(result.succeeded.map((i) => i.id)).toEqual(['a.png']);
    expect(result.notAttempted.map((i) => i.id)).toEqual(['b.png', 'c.png']);
    expect(result.cancelled).toBe(true);
    // 'cancelled' outranks any partial reading: the remainder is still there
    // to retry, and that is the fact the user needs.
    expect(bulkRunVerdict(result)).toBe('cancelled');
  });

  it('reports progress against the item in flight, then null when it ends', async () => {
    const seen: BulkRunProgress[] = [];
    await runBulkAction(items, () => true, { onProgress: (p) => seen.push(p) });

    expect(seen.at(0)?.current).toBe('a.png');
    expect(seen.at(-1)).toMatchObject({ done: 3, succeeded: 3, failed: 0, current: null });
    // Every report carries the same total, so a progress bar built from these
    // never rescales midway through a run.
    expect(new Set(seen.map((p) => p.total))).toEqual(new Set([3]));
  });

  it('treats a thrown error as a failure and keeps going', async () => {
    const result = await runBulkAction(items, (item) => {
      if (item.id === 'a.png') throw new Error('locked by another process');
      return true;
    });

    expect(result.failed[0]?.error).toBe('locked by another process');
    expect(result.succeeded.map((i) => i.id)).toEqual(['b.png', 'c.png']);
    expect(result.cancelled).toBe(false);
  });

  it('does not perform anything once the signal is already aborted', async () => {
    const perform = vi.fn(() => true);
    const result = await runBulkAction(items, perform, { signal: { aborted: true } });

    expect(perform).not.toHaveBeenCalled();
    expect(result.notAttempted).toHaveLength(3);
    expect(result.succeeded).toHaveLength(0);
    expect(bulkRunVerdict(result)).toBe('cancelled');
  });
});
