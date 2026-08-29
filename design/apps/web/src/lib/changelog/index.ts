// The changelog the app shows.
//
// One place joins the build-time module to the parser, memoized so the work
// happens on the first open of the viewer and never again for the life of the
// launch. Nothing here reads a file or the network: `generated.ts` already
// carries the sources and the verified commits.

import { CHANGELOG_COMMITS, CHANGELOG_SOURCES, CHANGELOG_UNRESOLVED_COMMITS } from './generated';
import { parseChangelog, type ChangelogRelease } from './parse';
import { PUBLISHED_RELEASE_HISTORY, publishedReleaseHistory } from './release-history';

export type {
  ChangelogCategory,
  ChangelogCommitRef,
  ChangelogCommitState,
  ChangelogEntry,
  ChangelogRelease,
} from './parse';
export { CHANGELOG_UNRESOLVED_COMMITS };
export { PUBLISHED_RELEASE_HISTORY, publishedReleaseHistory } from './release-history';

let cached: readonly ChangelogRelease[] | null = null;

/** Every version the repository records, newest first. */
export function changelogReleases(): readonly ChangelogRelease[] {
  if (cached == null) {
    cached = PUBLISHED_RELEASE_HISTORY.length > 0
      ? publishedReleaseHistory()
      : parseChangelog(CHANGELOG_SOURCES, CHANGELOG_COMMITS);
  }
  return cached;
}
