import { describe, expect, it } from 'vitest';

import {
  HANDOFF_COMPONENT_OWNERS,
  HANDOFF_TOKEN_MAPPINGS,
  handoffRegistryIsExact,
} from '../../../src/components/handoff/registry';
import {
  EMPTY_HANDOFF_SELECTION,
  invertHandoffSelection,
  selectHandoffIds,
  toggleHandoffSelection,
} from '../../../src/components/handoff/selection';

describe('handoff registry', () => {
  it('keeps exactly the documented source row counts', () => {
    expect(handoffRegistryIsExact()).toBe(true);
    expect(HANDOFF_TOKEN_MAPPINGS).toHaveLength(18);
    expect(HANDOFF_COMPONENT_OWNERS).toHaveLength(12);
    expect(new Set(HANDOFF_TOKEN_MAPPINGS.map((row) => row.id)).size).toBe(18);
    expect(new Set(HANDOFF_COMPONENT_OWNERS.map((row) => row.id)).size).toBe(12);
  });

  it('keeps token mappings tied to the two checked-in source files', () => {
    for (const row of HANDOFF_TOKEN_MAPPINGS) {
      expect(row.designSourcePath).toBe('apps/web/src/styles/md3-tokens.css');
      expect(row.appSourcePath).toBe('apps/web/src/styles/tokens.css');
      expect(['implemented', 'partial', 'unverified']).toContain(row.status);
    }
  });
});

describe('handoff selection', () => {
  it('supports click, shift-range, select-all and inverse selection', () => {
    const ids = ['one', 'two', 'three', 'four'];
    const first = toggleHandoffSelection(EMPTY_HANDOFF_SELECTION, 'two', ids, false);
    const range = toggleHandoffSelection(first, 'four', ids, true);
    expect([...range.selected]).toEqual(['two', 'three', 'four']);
    const all = selectHandoffIds(range, ids);
    expect(all.selected.size).toBe(4);
    expect(invertHandoffSelection(all, ids).selected.size).toBe(0);
  });
});
