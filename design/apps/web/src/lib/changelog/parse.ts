// Turn changelog markdown into releases, categories and entries.
//
// Pure: it takes the source markdown and the build-time commit table and
// returns data. It reads no file, touches no DOM and knows nothing about
// React, which is what lets `tests/changelog-parse.test.ts` pin its behaviour
// on fixtures rather than on whatever the repository happens to say today.
//
// Two source shapes are understood, because the repository has two:
//
//   `keep-a-changelog`  one file, many releases. `## [Unreleased]` or
//                       `## [1.2.3] - 2026-08-04` opens a release and `###`
//                       opens a category inside it.
//   `release-notes`     one file per release, version taken from the path.
//                       `##` is a category and `###` a subcategory.
//
// The commit rule is the strict one: an entry links a commit only when the
// build resolved that abbreviation against this repository. An entry whose
// source names no commit, or names one this repository does not have, carries
// a state saying exactly that — never a link, never a guess.

import type { ChangelogCommitRecord, ChangelogSourceFile } from './generated';

export type ChangelogCommitState = 'verified' | 'unresolved' | 'unrecorded';

export interface ChangelogVerifiedCommit {
  readonly state: 'verified';
  readonly sha: string;
  readonly shortSha: string;
  readonly url: string;
  /** ISO-8601 with offset, as the repository records it. */
  readonly date: string;
  /**
   * How many commits the entry references in total. Above 1 the entry
   * summarizes several and this is the one that completed it — the viewer
   * says so rather than pretending one commit did all of it.
   */
  readonly summarizes: number;
}

export interface ChangelogMissingCommit {
  readonly state: 'unresolved' | 'unrecorded';
  /** The abbreviations the source named, when it named any. */
  readonly referenced: readonly string[];
}

export type ChangelogCommitRef = ChangelogVerifiedCommit | ChangelogMissingCommit;

export interface ChangelogEntry {
  /** Stable within a build: `<version>#<n>`. */
  readonly id: string;
  readonly category: string;
  readonly subcategory: string | null;
  /** The entry's bold lead sentence, when it has one. */
  readonly title: string | null;
  readonly text: string;
  readonly commit: ChangelogCommitRef;
  /** `yyyy-mm-dd` of the commit that made it, when one is verified. */
  readonly date: string | null;
}

export interface ChangelogCategory {
  readonly name: string;
  readonly entries: readonly ChangelogEntry[];
}

export interface ChangelogRelease {
  /** `Unreleased`, a version exactly as the source writes it, or a section name. */
  readonly version: string;
  /**
   * False for a `##` section that is not a version — a Keep a Changelog file
   * may carry one (this repository's "Not done yet" is exactly that). It is
   * kept, because dropping part of the changelog would be a lie by omission,
   * and flagged, because listing it as a version would be a different one.
   */
  readonly isVersion: boolean;
  readonly title: string | null;
  readonly sourcePath: string;
  /** `yyyy-mm-dd`, or null when nothing in the source or the history dates it. */
  readonly date: string | null;
  /**
   * Where `date` came from. `source` is a date the changelog itself records —
   * a release date. `commits` is the newest change in the release, which is a
   * different fact and is labelled differently in the viewer.
   */
  readonly dateSource: 'source' | 'commits' | null;
  readonly dateRange: { readonly first: string; readonly last: string } | null;
  readonly categories: readonly ChangelogCategory[];
  readonly entryCount: number;
}

export const UNRELEASED = 'Unreleased';

/**
 * Whether a `##` heading names a version.
 *
 * A Keep a Changelog file is allowed other top-level sections, and this one has
 * a "Not done yet" section that is a standing statement rather than a release.
 * It belongs in the viewer — it is part of the changelog — but it is not a
 * version, and a list that claims to show every version must not count it.
 */
export function looksLikeVersion(value: string): boolean {
  return value.toLowerCase() === UNRELEASED.toLowerCase() || /^v?\d/.test(value);
}

const COMMIT_LINK = /\[`?([0-9a-f]{7,40})`?\]\((https?:\/\/[^\s)]*\/commit\/[0-9a-f]{7,40})\)/g;
// `## [Unreleased]`, `## [1.2.3] - 2026-08-04`, `## 1.2.3 — 2026-08-04`.
const RELEASE_HEADING = /^\[?([^\]\s]+)\]?(?:\s*[-–—]\s*(\d{4}-\d{2}-\d{2}))?$/;
// A bullet's bold lead sentence, optionally behind a single leading glyph.
const BOLD_LEAD = /^\s*(?:\S+\s+)?\*\*([\s\S]+?)\*\*[\s]*/;

/** Collapse a markdown fragment to the words it actually says. */
export function stripInlineMarkdown(value: string): string {
  return value
    .replace(COMMIT_LINK, '')
    .replace(/<(https?:\/\/[^>\s]+)>/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1$2')
    // Whatever is left of a trailing "(commit, commit)" once the links are gone.
    .replace(/\s*\(\s*(?:,\s*)*\)/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();
}

/** Every commit abbreviation an entry references, in source order. */
export function commitRefsIn(raw: string): string[] {
  const found: string[] = [];
  for (const match of raw.matchAll(COMMIT_LINK)) {
    const shortSha = match[1];
    if (shortSha != null && !found.includes(shortSha)) found.push(shortSha);
  }
  return found;
}

/**
 * Resolve an entry's commit against the build-time table.
 *
 * The *last* reference wins when several are named: an entry that lists four
 * commits is summarizing, and the one that completed the change is the one a
 * reader should land on. Anything the table does not have is `unresolved` —
 * this never falls back to building a URL out of an abbreviation.
 */
export function resolveCommit(
  referenced: readonly string[],
  commits: Readonly<Record<string, ChangelogCommitRecord>>,
): ChangelogCommitRef {
  if (referenced.length === 0) return { state: 'unrecorded', referenced: [] };
  for (let i = referenced.length - 1; i >= 0; i -= 1) {
    const shortSha = referenced[i];
    const record = shortSha == null ? undefined : commits[shortSha];
    if (record != null) {
      return {
        state: 'verified',
        sha: record.sha,
        shortSha: record.shortSha,
        url: record.url,
        date: record.date,
        summarizes: referenced.length,
      };
    }
  }
  return { state: 'unresolved', referenced: [...referenced] };
}

const UNCATEGORIZED = 'Changes';

interface RawEntry {
  readonly raw: string;
  readonly category: string;
  readonly subcategory: string | null;
}

interface RawRelease {
  version: string;
  title: string | null;
  date: string | null;
  entries: RawEntry[];
}

function headingLevel(line: string): number {
  const match = /^(#{1,6})\s+/.exec(line);
  return match?.[1]?.length ?? 0;
}

function headingText(line: string): string {
  return line.replace(/^#{1,6}\s+/, '').trim();
}

/**
 * Split a markdown document into raw entries, tagged with the headings they
 * sit under. Front matter is skipped, and a wrapped line is folded back into
 * the entry it belongs to — the sources wrap at eighty columns and a wrapped
 * sentence is still one entry.
 *
 * A bullet is an entry. So is a paragraph that sits under a category heading,
 * because a release can be written entirely in prose (0.14.1 is) and dropping
 * it would leave a version silently missing from a viewer that claims to list
 * every one. Prose *above* the first category heading is a document preamble,
 * not a change, and is skipped.
 */
function collectEntries(
  markdown: string,
  levels: { release: number | null; category: number; subcategory: number },
  seedVersion: string | null,
  seedTitle: string | null,
): RawRelease[] {
  const lines = markdown.split(/\r?\n/);
  let index = 0;
  // YAML front matter, when the file opens with it. Only `title` is read: a
  // release written entirely in prose (0.14.1 is) names itself nowhere else.
  let frontMatterTitle: string | null = null;
  if (lines[0]?.trim() === '---') {
    index = 1;
    while (index < lines.length && lines[index]?.trim() !== '---') {
      const field = /^title:\s*(.+?)\s*$/.exec(lines[index] ?? '');
      if (field?.[1] != null && frontMatterTitle == null) {
        frontMatterTitle = field[1].replace(/^['"]|['"]$/g, '');
      }
      index += 1;
    }
    index += 1;
  }

  const releases: RawRelease[] = [];
  let current: RawRelease | null =
    levels.release == null
      ? { version: seedVersion ?? UNRELEASED, title: seedTitle, date: null, entries: [] }
      : null;
  if (current != null) releases.push(current);

  let category = '';
  let subcategory: string | null = null;
  let buffer: string[] | null = null;
  let bufferKind: 'bullet' | 'paragraph' = 'bullet';

  const flush = () => {
    if (buffer == null) return;
    const raw = buffer.join(' ').replace(/\s+/g, ' ').trim();
    buffer = null;
    if (raw.length === 0 || current == null) return;
    current.entries.push({ raw, category: category || UNCATEGORIZED, subcategory });
  };

  for (; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const level = headingLevel(line);
    if (level > 0) {
      flush();
      const text = headingText(line);
      if (levels.release != null && level === levels.release) {
        const match = RELEASE_HEADING.exec(text);
        current = {
          version: match?.[1] ?? text,
          title: null,
          date: match?.[2] ?? null,
          entries: [],
        };
        releases.push(current);
        category = '';
        subcategory = null;
        continue;
      }
      if (level === levels.category) {
        category = text;
        subcategory = null;
        continue;
      }
      if (level === levels.subcategory) {
        subcategory = text;
        continue;
      }
      // A title heading above everything (`# Open Design 0.16.0 — …`).
      if (level < levels.category && current != null && current.title == null) {
        current.title = stripInlineMarkdown(text);
      }
      continue;
    }

    // Callout syntax carries no changelog content of its own; keep the words
    // and drop the `>` and the `[!NOTE]` marker.
    const content = line.replace(/^\s*>\s?/, '').replace(/^\[![A-Z]+\]\s*/, '');
    const bullet = /^[-*]\s+(.*)$/.exec(content);
    if (bullet != null) {
      flush();
      buffer = [bullet[1] ?? ''];
      bufferKind = 'bullet';
      continue;
    }
    if (content.trim().length === 0) {
      flush();
      continue;
    }
    if (buffer != null) {
      // A bullet continues only through indented lines; a paragraph continues
      // through anything that is not another bullet or a heading.
      if (bufferKind === 'paragraph' || /^\s+\S/.test(line)) {
        buffer.push(content.trim());
        continue;
      }
      flush();
    }
    // A paragraph is an entry when it sits inside a release. In a Keep a
    // Changelog file the release heading is enough — prose directly under
    // `## [Unreleased]` ("Nothing yet.") or under a version heading (its code
    // name, what it was built from) is real content, and the document preamble
    // is already excluded because no release is open yet. A release-notes file
    // has no release heading, so there a paragraph must sit under a category:
    // the summary above the first one is a blurb, not a change.
    if (current != null && (category !== '' || levels.release != null)) {
      buffer = [content.trim()];
      bufferKind = 'paragraph';
    }
  }
  flush();
  for (const release of releases) {
    if (release.title == null) release.title = frontMatterTitle;
  }
  return releases;
}

function buildRelease(
  raw: RawRelease,
  sourcePath: string,
  commits: Readonly<Record<string, ChangelogCommitRecord>>,
): ChangelogRelease {
  const byCategory = new Map<string, ChangelogEntry[]>();
  const dates: string[] = [];
  raw.entries.forEach((entry, position) => {
    const referenced = commitRefsIn(entry.raw);
    const commit = resolveCommit(referenced, commits);
    const lead = BOLD_LEAD.exec(entry.raw);
    const leadText = lead?.[1];
    const title = leadText == null ? null : stripInlineMarkdown(leadText);
    const body = leadText == null ? entry.raw : entry.raw.slice((lead?.[0] ?? '').length);
    const date = commit.state === 'verified' ? commit.date.slice(0, 10) : null;
    if (date != null) dates.push(date);
    const list = byCategory.get(entry.category) ?? [];
    list.push({
      id: `${raw.version}#${position}`,
      category: entry.category,
      subcategory: entry.subcategory,
      title,
      text: stripInlineMarkdown(body),
      commit,
      date,
    });
    byCategory.set(entry.category, list);
  });

  dates.sort();
  const first = dates[0] ?? null;
  const last = dates[dates.length - 1] ?? null;
  const date = raw.date ?? last;
  const dateSource: ChangelogRelease['dateSource'] =
    raw.date != null ? 'source' : last != null ? 'commits' : null;

  return {
    version: raw.version,
    isVersion: looksLikeVersion(raw.version),
    title: raw.title,
    sourcePath,
    date,
    dateSource,
    dateRange: first != null && last != null ? { first, last } : null,
    categories: [...byCategory.entries()].map(([name, entries]) => ({ name, entries })),
    entryCount: raw.entries.length,
  };
}

/** Parse one source file into the releases it documents. */
export function parseChangelogSource(
  source: ChangelogSourceFile,
  commits: Readonly<Record<string, ChangelogCommitRecord>>,
): ChangelogRelease[] {
  const levels =
    source.kind === 'keep-a-changelog'
      ? { release: 2, category: 3, subcategory: 4 }
      : { release: null, category: 2, subcategory: 3 };
  return collectEntries(source.markdown, levels, source.version, null)
    .filter((release) => release.entries.length > 0)
    .map((release) => buildRelease(release, source.path, commits));
}

/**
 * Order releases the way a reader expects: whatever is unreleased first, then
 * versions newest to oldest, then any section that is not a version at all.
 * Numeric segment by segment, so 0.10.0 sorts above 0.9.0 instead of below it
 * the way a string compare would put it.
 */
export function compareReleases(a: ChangelogRelease, b: ChangelogRelease): number {
  if (a.isVersion !== b.isVersion) return a.isVersion ? -1 : 1;
  const aUnreleased = a.version.toLowerCase() === UNRELEASED.toLowerCase();
  const bUnreleased = b.version.toLowerCase() === UNRELEASED.toLowerCase();
  if (aUnreleased !== bUnreleased) return aUnreleased ? -1 : 1;
  // A leading `v` is decoration on a tag, not a segment; dropping it keeps the
  // first comparison numeric for `v0.16.1` as well as `0.16.1`.
  const left = a.version.replace(/^v/, '').split(/[.\-+]/);
  const right = b.version.replace(/^v/, '').split(/[.\-+]/);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const l = Number(left[i] ?? '');
    const r = Number(right[i] ?? '');
    if (Number.isNaN(l) || Number.isNaN(r)) {
      const cmp = (right[i] ?? '').localeCompare(left[i] ?? '');
      if (cmp !== 0) return cmp;
      continue;
    }
    if (l !== r) return r - l;
  }
  return 0;
}

/** Parse every source into one ordered list of releases. */
export function parseChangelog(
  sources: readonly ChangelogSourceFile[],
  commits: Readonly<Record<string, ChangelogCommitRecord>>,
): ChangelogRelease[] {
  const releases: ChangelogRelease[] = [];
  for (const source of sources) releases.push(...parseChangelogSource(source, commits));
  return releases.sort(compareReleases);
}
