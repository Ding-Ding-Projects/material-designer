import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  EXPECTED_REGEX_SEARCH_SURFACE_IDS,
  REGEX_SEARCH_SURFACE_INVENTORY,
  validateRegexSearchSurfaceInventory,
} from '../../../src/components/regex/searchSurfaceInventory';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../../');

function executableMarkerPresent(source: string, marker: string): boolean {
  let inBlockComment = false;
  return source.split(/\r?\n/).some((rawLine) => {
    let line = rawLine;
    if (inBlockComment) {
      const end = line.indexOf('*/');
      if (end < 0) return false;
      line = line.slice(end + 2);
      inBlockComment = false;
    }
    for (;;) {
      const start = line.indexOf('/*');
      if (start < 0) break;
      const end = line.indexOf('*/', start + 2);
      if (end < 0) {
        inBlockComment = true;
        line = line.slice(0, start);
        break;
      }
      line = `${line.slice(0, start)}${line.slice(end + 2)}`;
    }
    line = line.replace(/\/\/.*$/, '').trim();
    if (!line) return false;
    // Component markers need an identifier boundary, so a renamed
    // <RegexSearchFieldX> or <FileViewerMenuSearchX> cannot satisfy them.
    if (marker === '<RegexSearchField' || marker === '<FileViewerMenuSearch') {
      return new RegExp(`${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[\\s/>])`).test(line);
    }
    return line.includes(marker);
  });
}

describe('regex search-surface inventory', () => {
  it('keeps the hand-written list complete and unique', () => {
    const ids = REGEX_SEARCH_SURFACE_INVENTORY.map((row) => row.id);
    expect(ids).toEqual([...EXPECTED_REGEX_SEARCH_SURFACE_IDS]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(REGEX_SEARCH_SURFACE_INVENTORY.every((row) => row.instances > 0)).toBe(true);
  });

  it('binds every inventoried field to its own builder and controller marker', () => {
    for (const row of REGEX_SEARCH_SURFACE_INVENTORY) {
      if (row.status === 'not-wired') {
        expect(row.scopeNote, row.id).toMatch(/^RED:/);
        continue;
      }
      const source = readFileSync(resolve(repoRoot, row.sourcePath), 'utf8');
      expect(executableMarkerPresent(source, row.searchMarker), row.id).toBe(true);
      expect(executableMarkerPresent(source, row.builderMarker), row.id).toBe(true);
      expect(executableMarkerPresent(source, row.stateMarker), row.id).toBe(true);
    }
  });

    it('turns red if a surface, field id, builder, or isolated-state registration disappears', () => {
    // The previous assertions intentionally use exact hand-written ids and
    // markers. This tripwire keeps the regression itself visible to reviewers:
    // it must not be replaced by discovering only whatever source still has.
    expect(EXPECTED_REGEX_SEARCH_SURFACE_IDS).toHaveLength(33);
    expect(REGEX_SEARCH_SURFACE_INVENTORY.filter((row) => row.status === 'wired')).toHaveLength(30);
    expect(() => validateRegexSearchSurfaceInventory(REGEX_SEARCH_SURFACE_INVENTORY.slice(0, -1))).toThrow(
      'incomplete',
    );
    expect(() => validateRegexSearchSurfaceInventory([
      ...REGEX_SEARCH_SURFACE_INVENTORY.slice(0, -1),
      { ...REGEX_SEARCH_SURFACE_INVENTORY[REGEX_SEARCH_SURFACE_INVENTORY.length - 1]!, builderMarker: '' },
    ])).toThrow('incomplete');
    expect(() => validateRegexSearchSurfaceInventory(REGEX_SEARCH_SURFACE_INVENTORY)).not.toThrow();
    expect(() => validateRegexSearchSurfaceInventory([
      ...REGEX_SEARCH_SURFACE_INVENTORY.slice(0, -1),
      { ...REGEX_SEARCH_SURFACE_INVENTORY[REGEX_SEARCH_SURFACE_INVENTORY.length - 1]!, fieldIds: [] },
    ])).toThrow('incomplete');
    expect(() => validateRegexSearchSurfaceInventory([
      ...REGEX_SEARCH_SURFACE_INVENTORY.slice(0, -1),
      { ...REGEX_SEARCH_SURFACE_INVENTORY[REGEX_SEARCH_SURFACE_INVENTORY.length - 1]!, fieldIds: ['tab-strip-search'] },
    ])).toThrow('unique');
  });
});
