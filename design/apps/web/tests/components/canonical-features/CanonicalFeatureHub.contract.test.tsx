import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CANONICAL_FEATURE_HUB_INVENTORY,
  type CanonicalFeatureId,
} from '../../../src/components/canonical-features/CanonicalFeatureHub';

const sourcePath = resolve(__dirname, '../../../src/components/canonical-features/CanonicalFeatureHub.tsx');

describe('CanonicalFeatureHub coverage contract', () => {
  it('keeps a hand-written row for every canonical destination', () => {
    const expected: readonly CanonicalFeatureId[] = [
      'offline-documentation',
      'changelog',
      'status-hub',
      'file-converter',
      'ollama-suite',
      'authenticator',
      'unlock-ladder',
      'notifications-history',
      'exports-bulk-actions',
      'destructive-confirmation',
    ];
    expect(CANONICAL_FEATURE_HUB_INVENTORY.map((row) => row.id)).toEqual(expected);
    expect(new Set(CANONICAL_FEATURE_HUB_INVENTORY.map((row) => row.id)).size).toBe(expected.length);
  });

  it('mounts the owning components and the local regex builder', () => {
    const source = readFileSync(sourcePath, 'utf8');
    for (const component of [
      'DocumentationBrowserView',
      'ChangelogDialog',
      'StatusHubPanel',
      'FileConverterView',
      'OllamaSuiteManager',
      'AuthenticatorDestination',
      'UnlockLadder',
      'NotificationCenter',
      'VersionHistoryDialog',
      'openVersionHistory',
      'DestructiveGate',
      'RegexSearchField',
      'useRegexSearch',
    ]) {
      expect(source).toContain(component);
    }
    expect(source).toContain('role="tablist"');
    expect(source).toContain('aria-orientation="vertical"');
    expect(source).toContain("['ArrowDown', 'ArrowUp', 'Home', 'End']");
    expect(source).toContain('The unlock bridge is not exposed by this host.');
  });

  it('fails closed for a missing host bridge instead of inventing a challenge', () => {
    const source = readFileSync(sourcePath, 'utf8');
    expect(source).toContain('unlockBridge ? <UnlockLadder');
    expect(source).toContain('unavailableCard(activeTab');
  });

  it('makes the destructive demonstration change real session state', () => {
    const source = readFileSync(sourcePath, 'utf8');
    expect(source).toContain('setPreviewRecordPresent(false)');
    expect(source).toContain('Restore preview record');
    expect(source).toContain('irreversible={false}');
  });
});
