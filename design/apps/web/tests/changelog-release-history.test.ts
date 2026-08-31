import { describe, expect, it } from 'vitest';

import {
  PUBLISHED_RELEASE_HISTORY,
  PUBLISHED_RELEASE_HISTORY_COUNT,
} from '../src/lib/changelog/release-history.generated';
import { publishedReleaseHistory } from '../src/lib/changelog/release-history';

describe('generated published release history', () => {
  it('covers the complete current non-draft release inventory', () => {
    expect(PUBLISHED_RELEASE_HISTORY_COUNT).toBe(51);
    expect(PUBLISHED_RELEASE_HISTORY).toHaveLength(PUBLISHED_RELEASE_HISTORY_COUNT);
    expect(new Set(PUBLISHED_RELEASE_HISTORY.map((release) => release.tag)).size).toBe(51);
    for (const release of PUBLISHED_RELEASE_HISTORY) {
      expect(release.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      expect(release.targetSha).toMatch(/^[0-9a-f]{40}$/);
      expect(release.targetUrl).toBe(
        `https://github.com/Ding-Ding-Projects/material-designer/commit/${release.targetSha}`,
      );
      expect(release.releaseUrl).toMatch(/^https:\/\//);
      expect(release.categories.length).toBeGreaterThan(0);
    }
  });

  it('maps every generated release to an exact dated, categorized viewer record', () => {
    const releases = publishedReleaseHistory();
    expect(releases).toHaveLength(51);
    for (const release of releases) {
      expect(release.isVersion).toBe(true);
      expect(release.date).toBe(release.date?.slice(0, 10));
      expect(release.entryCount).toBeGreaterThan(0);
      expect(release.categories.every((category) => category.entries.length > 0)).toBe(true);
      for (const category of release.categories) {
        for (const entry of category.entries) {
          expect(entry.commit.state).toBe('verified');
          if (entry.commit.state === 'verified') {
            expect(entry.commit.sha).toMatch(/^[0-9a-f]{40}$/);
            expect(entry.commit.url).toBe(
              `https://github.com/Ding-Ding-Projects/material-designer/commit/${entry.commit.sha}`,
            );
          }
        }
      }
    }
  });
});
