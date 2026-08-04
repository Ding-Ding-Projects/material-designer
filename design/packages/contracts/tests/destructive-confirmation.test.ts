// The destructive-delete confirmation contract.
//
// Both sides of the boundary read these values: the daemon builds the refusal
// from them, the web app and the `od` CLI build the request from them. A
// silent change to the header name or the mint path would not fail either side
// on its own — it would just start producing 428s nobody could satisfy — so
// they are pinned here, where the two sides meet.

import { describe, expect, it } from 'vitest';

import { API_ERROR_CODES } from '../src/errors';
import {
  CONFIRM_DELETE_HEADER,
  CONFIRM_DELETE_PATH_SEGMENT,
  CONFIRM_DELETE_TTL_MS,
  DESTRUCTIVE_RESOURCE_KINDS,
  confirmDeleteUrlFor,
  projectFolderResourceId,
} from '../src/api/destructive-confirmation';

describe('destructive-delete confirmation contract', () => {
  it('pins the header and mint path both sides build from', () => {
    expect(CONFIRM_DELETE_HEADER).toBe('x-od-confirm-token');
    expect(CONFIRM_DELETE_PATH_SEGMENT).toBe('confirm-delete');
  });

  it('carries the refusal code in the shared error union', () => {
    expect(API_ERROR_CODES).toContain('CONFIRMATION_REQUIRED');
  });

  it('gates exactly the kinds local version history cannot restore', () => {
    // Adding a kind here is a claim that its delete is irreversible. If a
    // history domain covers it (apps/daemon/src/history/domains.ts), the
    // standard says to prefer an undo notification instead.
    expect([...DESTRUCTIVE_RESOURCE_KINDS]).toEqual([
      'project',
      'brand',
      'library-asset',
      'project-folder',
      'design-system',
    ]);
  });

  // The one gated subject that is not fully in the URL. A token bound to the
  // project alone would authorize deleting any folder in it, which is the
  // single-captured-set property the whole scheme rests on.
  it('binds a project-folder token to the folder, not just the project', () => {
    expect(projectFolderResourceId('p1', 'drafts')).not.toBe(
      projectFolderResourceId('p1', 'final'),
    );
    expect(projectFolderResourceId('p1', 'drafts')).not.toBe(
      projectFolderResourceId('p2', 'drafts'),
    );
  });

  // Mint and consume read the raw body value on their own legs; if a trailing
  // slash produced a different id, the correct caller would be refused.
  it('reads one folder the same way however it was spelled', () => {
    const canonical = projectFolderResourceId('p1', 'assets/drafts');
    for (const spelling of ['assets/drafts/', '/assets/drafts', ' assets/drafts ', 'assets\\drafts']) {
      expect(projectFolderResourceId('p1', spelling)).toBe(canonical);
    }
  });

  // A separator a path segment could contain would let two different pairs
  // spell one id — ('p1/a', 'b') and ('p1', 'a/b') are different grants.
  it('cannot be spelled into a collision by where the words break', () => {
    expect(projectFolderResourceId('p1/a', 'b')).not.toBe(projectFolderResourceId('p1', 'a/b'));
  });

  it('builds the mint URL from a resource path, with or without a trailing slash', () => {
    expect(confirmDeleteUrlFor('/api/projects/p1')).toBe('/api/projects/p1/confirm-delete');
    expect(confirmDeleteUrlFor('/api/projects/p1/')).toBe('/api/projects/p1/confirm-delete');
    expect(confirmDeleteUrlFor('http://127.0.0.1:7456/api/brands/acme')).toBe(
      'http://127.0.0.1:7456/api/brands/acme/confirm-delete',
    );
  });

  it('keeps the TTL short enough that a leaked token is near-worthless', () => {
    // Long enough for one round trip and a slow client; far short of the time a
    // user can leave a gate open, which is why the web app mints at the moment
    // of authorization rather than when the dialog opens.
    expect(CONFIRM_DELETE_TTL_MS).toBeGreaterThan(0);
    expect(CONFIRM_DELETE_TTL_MS).toBeLessThanOrEqual(5 * 60_000);
  });

  it('keeps every kind a plain lowercase slug, safe in a URL and a log line', () => {
    for (const kind of DESTRUCTIVE_RESOURCE_KINDS) {
      expect(kind).toMatch(/^[a-z][a-z-]*[a-z]$/u);
    }
  });
});
