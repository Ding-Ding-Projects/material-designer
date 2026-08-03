// Filtering and exporting the changelog.
//
// The date range and the search compose: they narrow the same list rather than
// overriding one another, and what comes back describes itself — how many
// entries matched out of how many exist, which versions survived, and how many
// entries the range had to leave out because nothing dates them. That last
// number is why this returns a scope rather than a plain array: silently
// dropping the undated entries would make a filtered view look like the whole
// truth.
//
// The export renders exactly what the filter produced and states the range in
// the file, so a copied changelog is still honest about being a slice.

import { withinRange } from './dates';
import type { ChangelogCategory, ChangelogEntry, ChangelogRelease } from './parse';

export interface ChangelogFilter {
  /** Plain text. Every whitespace-separated term must appear. */
  readonly query: string;
  /** `yyyy-mm-dd`, inclusive. Null is an open end. */
  readonly from: string | null;
  readonly to: string | null;
}

export const EMPTY_CHANGELOG_FILTER: ChangelogFilter = { query: '', from: null, to: null };

export interface ChangelogScope {
  readonly matched: number;
  readonly total: number;
  readonly query: string | null;
  readonly from: string | null;
  readonly to: string | null;
  /** Oldest and newest dated entry actually shown. */
  readonly firstDate: string | null;
  readonly lastDate: string | null;
  /** Entries a set range excluded because no commit dates them. */
  readonly undatedExcluded: number;
  /** Only the sections that actually name a version — see `looksLikeVersion`. */
  readonly versions: readonly string[];
}

export interface ChangelogFilterResult {
  readonly releases: readonly ChangelogRelease[];
  readonly scope: ChangelogScope;
}

/** Split a query into the terms that must all appear. */
export function searchTerms(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 0);
}

/**
 * The haystack one entry offers a search: everything a reader can see on it,
 * plus the version and the commit abbreviation, so `29c1476` finds its entries
 * and `0.16.0` finds its release.
 */
export function entryHaystack(entry: ChangelogEntry, release: ChangelogRelease): string {
  return [
    entry.title ?? '',
    entry.text,
    entry.category,
    entry.subcategory ?? '',
    release.version,
    release.title ?? '',
    entry.commit.state === 'verified' ? entry.commit.shortSha : '',
    entry.date ?? '',
  ]
    .join(' ')
    .toLowerCase();
}

export function entryMatchesTerms(
  entry: ChangelogEntry,
  release: ChangelogRelease,
  terms: readonly string[],
): boolean {
  if (terms.length === 0) return true;
  const haystack = entryHaystack(entry, release);
  return terms.every((term) => haystack.includes(term));
}

/**
 * True when an entry falls inside the range.
 *
 * An undated entry is *out* whenever a bound is set. It cannot be shown to be
 * inside a range, and quietly keeping it would make the range a suggestion
 * rather than a filter — so it is excluded and counted, and the viewer says how
 * many were left out.
 */
export function entryWithinRange(
  entry: ChangelogEntry,
  from: string | null,
  to: string | null,
): boolean {
  if (from == null && to == null) return true;
  if (entry.date == null) return false;
  return withinRange(entry.date, from, to);
}

export function filterChangelog(
  releases: readonly ChangelogRelease[],
  filter: ChangelogFilter,
): ChangelogFilterResult {
  const terms = searchTerms(filter.query);
  const ranged = filter.from != null || filter.to != null;
  const kept: ChangelogRelease[] = [];
  const dates: string[] = [];
  let matched = 0;
  let total = 0;
  let undatedExcluded = 0;

  for (const release of releases) {
    const categories: ChangelogCategory[] = [];
    for (const category of release.categories) {
      const entries = category.entries.filter((entry) => {
        total += 1;
        if (!entryMatchesTerms(entry, release, terms)) return false;
        if (!entryWithinRange(entry, filter.from, filter.to)) {
          if (ranged && entry.date == null) undatedExcluded += 1;
          return false;
        }
        return true;
      });
      if (entries.length > 0) categories.push({ name: category.name, entries });
    }
    if (categories.length === 0) continue;
    let count = 0;
    for (const category of categories) {
      count += category.entries.length;
      for (const entry of category.entries) if (entry.date != null) dates.push(entry.date);
    }
    matched += count;
    kept.push({ ...release, categories, entryCount: count });
  }

  dates.sort();
  return {
    releases: kept,
    scope: {
      matched,
      total,
      query: filter.query.trim().length > 0 ? filter.query.trim() : null,
      from: filter.from,
      to: filter.to,
      firstDate: dates[0] ?? null,
      lastDate: dates[dates.length - 1] ?? null,
      undatedExcluded,
      versions: kept.filter((release) => release.isVersion).map((release) => release.version),
    },
  };
}

export interface ChangelogExportLabels {
  /** Document heading, e.g. "Changelog". */
  readonly heading: string;
  /** One sentence stating what this export covers. Composed by the caller. */
  readonly scope: string;
  /** Shown where a source names no commit at all. */
  readonly commitUnrecorded: string;
  /** Shown where a source names a commit this repository does not have. */
  readonly commitUnresolved: string;
  /** Carries `{count}`: the entry summarizes several commits. */
  readonly commitSummarizes: string;
  /** Shown where nothing dates a release. */
  readonly dateUnrecorded: string;
}

function commitSuffix(entry: ChangelogEntry, labels: ChangelogExportLabels): string {
  // Narrowed by testing for `verified` rather than by excluding the two
  // failure states one at a time.
  //
  // The reason is worth the comment: the missing-commit member's `state` is
  // itself a union of two literals. Excluding one of them cannot remove that
  // member, because the member is still reachable through its other literal,
  // and TypeScript has no way to represent "this member, minus one of its
  // states". So excluding both in sequence never eliminates it, and the
  // properties that only the verified member has stay invisible — which is
  // exactly what happened here. Testing positively for the state we want
  // narrows in one step.
  const commit = entry.commit;
  if (commit.state !== 'verified') {
    if (commit.state === 'unrecorded') return ` — ${labels.commitUnrecorded}`;
    const named = commit.referenced.join(', ');
    return ` — ${labels.commitUnresolved}${named.length > 0 ? ` (${named})` : ''}`;
  }
  const summary =
    commit.summarizes > 1
      ? ` ${labels.commitSummarizes.replace('{count}', String(commit.summarizes))}`
      : '';
  return ` — ${commit.shortSha}${summary}`;
}

/**
 * A version carries a date, or says it has none. A section that is not a
 * version carries neither: "no date recorded" beside "Not done yet" would
 * imply a release with a date missing, when it is not a release at all.
 */
function releaseDateSuffix(release: ChangelogRelease, labels: ChangelogExportLabels): string {
  if (!release.isVersion) return '';
  return ` — ${release.date ?? labels.dateUnrecorded}`;
}

function entryBody(entry: ChangelogEntry): string {
  if (entry.title == null) return entry.text;
  return entry.text.length > 0 ? `${entry.title} ${entry.text}` : entry.title;
}

/** Markdown, keeping every commit link the export is allowed to make. */
export function renderChangelogMarkdown(
  releases: readonly ChangelogRelease[],
  labels: ChangelogExportLabels,
): string {
  const out: string[] = [`# ${labels.heading}`, '', labels.scope, ''];
  for (const release of releases) {
    out.push(`## ${release.version}${releaseDateSuffix(release, labels)}`);
    if (release.title != null) out.push('', release.title);
    for (const category of release.categories) {
      out.push('', `### ${category.name}`, '');
      for (const entry of category.entries) {
        const link =
          entry.commit.state === 'verified'
            ? ` ([\`${entry.commit.shortSha}\`](${entry.commit.url})${
                entry.commit.summarizes > 1
                  ? `, ${labels.commitSummarizes.replace(
                      '{count}',
                      String(entry.commit.summarizes),
                    )}`
                  : ''
              })`
            : entry.commit.state === 'unresolved'
              ? ` (${labels.commitUnresolved}: ${entry.commit.referenced.join(', ')})`
              : ` (${labels.commitUnrecorded})`;
        const bold = entry.title == null ? '' : `**${entry.title}** `;
        out.push(`- ${bold}${entry.text}${link}`);
      }
    }
    out.push('');
  }
  return `${out.join('\n').trimEnd()}\n`;
}

/** Plain text, for a clipboard that is going somewhere without markdown. */
export function renderChangelogText(
  releases: readonly ChangelogRelease[],
  labels: ChangelogExportLabels,
): string {
  const out: string[] = [labels.heading, labels.scope, ''];
  for (const release of releases) {
    out.push(`${release.version}${releaseDateSuffix(release, labels)}`);
    for (const category of release.categories) {
      out.push(`  ${category.name}`);
      for (const entry of category.entries) {
        out.push(`    - ${entryBody(entry)}${commitSuffix(entry, labels)}`);
      }
    }
    out.push('');
  }
  return `${out.join('\n').trimEnd()}\n`;
}
