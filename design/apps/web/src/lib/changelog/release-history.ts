import {
  PUBLISHED_RELEASE_HISTORY,
  RELEASE_HISTORY_REPOSITORY,
  type PublishedReleaseRecord,
} from './release-history.generated';
import type { ChangelogCategory, ChangelogCommitRef, ChangelogEntry, ChangelogRelease } from './parse';

function stripMarkdown(value: string): string {
  return value
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function commitFor(record: PublishedReleaseRecord): ChangelogCommitRef {
  return {
    state: 'verified',
    sha: record.targetSha,
    shortSha: record.targetSha.slice(0, 7),
    url: record.targetUrl,
    date: record.publishedAt,
    summarizes: 1,
  };
}

function categoryEntries(record: PublishedReleaseRecord, category: PublishedReleaseRecord['categories'][number], index: number): ChangelogEntry[] {
  const text = stripMarkdown(category.notes.join('\n'));
  if (!text) return [];
  return [{
    id: `${record.tag}#${index}`,
    category: category.name,
    subcategory: null,
    title: null,
    text,
    commit: commitFor(record),
    date: dateOnly(record.publishedAt),
  }];
}

export function publishedReleaseToChangelogRelease(record: PublishedReleaseRecord): ChangelogRelease {
  const categories: ChangelogCategory[] = record.categories
    .map((category, index) => ({ name: category.name, entries: categoryEntries(record, category, index) }))
    .filter((category) => category.entries.length > 0);
  const date = dateOnly(record.publishedAt);
  return {
    version: record.tag,
    isVersion: true,
    title: record.name,
    sourcePath: `releases/tag/${record.tag}`,
    date,
    dateSource: 'source',
    dateRange: { first: date, last: date },
    categories,
    entryCount: categories.reduce((sum, category) => sum + category.entries.length, 0),
  };
}

/** The complete non-draft published release set captured by the generator. */
export function publishedReleaseHistory(): readonly ChangelogRelease[] {
  return PUBLISHED_RELEASE_HISTORY.map(publishedReleaseToChangelogRelease);
}

export { PUBLISHED_RELEASE_HISTORY, RELEASE_HISTORY_REPOSITORY };
