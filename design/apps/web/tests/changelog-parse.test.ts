import { describe, expect, it } from 'vitest';

import { CHANGELOG_COMMITS, CHANGELOG_SOURCES } from '../src/lib/changelog/generated';
import type { ChangelogCommitRecord, ChangelogSourceFile } from '../src/lib/changelog/generated';
import {
  commitRefsIn,
  compareReleases,
  looksLikeVersion,
  parseChangelog,
  parseChangelogSource,
  resolveCommit,
  stripInlineMarkdown,
  type ChangelogRelease,
} from '../src/lib/changelog/parse';

const FIXTURE_COMMITS: Record<string, ChangelogCommitRecord> = {
  aaa1111: {
    sha: 'aaa1111111111111111111111111111111111111',
    shortSha: 'aaa1111',
    url: 'https://example.test/commit/aaa1111',
    date: '2026-08-03T00:19:29-04:00',
  },
  bbb2222: {
    sha: 'bbb2222222222222222222222222222222222222',
    shortSha: 'bbb2222',
    url: 'https://example.test/commit/bbb2222',
    date: '2026-07-29T11:02:00-04:00',
  },
  ccc3333: {
    sha: 'ccc3333333333333333333333333333333333333',
    shortSha: 'ccc3333',
    url: 'https://example.test/commit/ccc3333',
    date: '2026-08-01T08:00:00-04:00',
  },
};

const KEEP_A_CHANGELOG: ChangelogSourceFile = {
  path: 'CHANGELOG.md',
  kind: 'keep-a-changelog',
  version: null,
  markdown: [
    '# Changelog',
    '',
    'Some preamble prose that is not a change.',
    '',
    '- A preamble bullet that is not a change either.',
    '',
    '## [Unreleased]',
    '',
    '### Added',
    '',
    '- **A toast that shows a dish.** It draws once per launch and never',
    '  blocks anything, which is the whole point',
    '  ([`aaa1111`](https://example.test/commit/aaa1111)).',
    '- A second thing with no commit at all.',
    '',
    '### Fixed',
    '',
    '- Something that took several goes',
    '  ([`bbb2222`](https://example.test/commit/bbb2222),',
    '  [`ccc3333`](https://example.test/commit/ccc3333)).',
    '- A fix pointing at a commit this repository does not have',
    '  ([`fff9999`](https://example.test/commit/fff9999)).',
    '',
    '## [1.2.0] - 2026-06-01',
    '',
    '### Changed',
    '',
    '- An older change.',
    '',
    '## Not done yet',
    '',
    '- Something this project has not built.',
    '',
  ].join('\n'),
};

const RELEASE_NOTES: ChangelogSourceFile = {
  path: 'docs/CHANGELOG/v0.16.0/en.md',
  kind: 'release-notes',
  version: '0.16.0',
  markdown: [
    '---',
    'title: Example 0.16.0',
    'description: Not read.',
    '---',
    '',
    '# Example 0.16.0 — The Headline',
    '',
    'An intro paragraph above every category, which is a summary and not a change.',
    '',
    '## ✨ Added',
    '',
    '### 🚀 Deployment',
    '',
    '- 🎨 **Preview before you publish.** Deployment exposes two targets. (#4576)',
    '',
    '## 🙏 Thanks',
    '',
    '@someone · @someone-else',
    '',
  ].join('\n'),
};

const PROSE_ONLY: ChangelogSourceFile = {
  path: 'docs/CHANGELOG/v0.14.1/en.md',
  kind: 'release-notes',
  version: '0.14.1',
  markdown: [
    '---',
    'title: Example 0.14.1',
    'description: Not read.',
    '---',
    '',
    '## Silent updates',
    '',
    'You can now allow the app to apply a downloaded update silently the next',
    'time it starts.',
    '',
    'The preference remains off until you explicitly confirm an installation.',
    '',
  ].join('\n'),
};

function entriesOf(release: ChangelogRelease) {
  return release.categories.flatMap((category) => category.entries);
}

describe('stripInlineMarkdown', () => {
  it('keeps the words and drops the syntax', () => {
    expect(stripInlineMarkdown('**Bold lead.** Some `code` and a [link](https://x.test).')).toBe(
      'Bold lead. Some code and a link.',
    );
    expect(stripInlineMarkdown('An autolink <https://x.test/y> stays readable.')).toBe(
      'An autolink https://x.test/y stays readable.',
    );
  });

  it('removes the trailing commit parenthesis it empties', () => {
    // Deleting the links must not leave "( , , )" behind at the end of every
    // sentence — that is the visible half of the same operation.
    const raw =
      'It took several goes ([`bbb2222`](https://example.test/commit/bbb2222), ' +
      '[`ccc3333`](https://example.test/commit/ccc3333)).';
    expect(stripInlineMarkdown(raw)).toBe('It took several goes.');
  });
});

describe('commit references', () => {
  it('finds every commit an entry names, in source order', () => {
    const raw =
      'x ([`bbb2222`](https://example.test/commit/bbb2222), ' +
      '[`ccc3333`](https://example.test/commit/ccc3333)).';
    expect(commitRefsIn(raw)).toEqual(['bbb2222', 'ccc3333']);
  });

  it('ignores a link that is not a commit link', () => {
    expect(commitRefsIn('see [ROADMAP.md](https://example.test/blob/main/ROADMAP.md)')).toEqual([]);
  });

  it('links the commit that completed the change when several are named', () => {
    const commit = resolveCommit(['bbb2222', 'ccc3333'], FIXTURE_COMMITS);
    expect(commit.state).toBe('verified');
    if (commit.state !== 'verified') return;
    expect(commit.shortSha).toBe('ccc3333');
    expect(commit.summarizes).toBe(2);
  });

  it('never invents a link for a commit the build could not resolve', () => {
    const commit = resolveCommit(['fff9999'], FIXTURE_COMMITS);
    expect(commit).toEqual({ state: 'unresolved', referenced: ['fff9999'] });
    expect(resolveCommit([], FIXTURE_COMMITS)).toEqual({ state: 'unrecorded', referenced: [] });
  });
});

describe('parsing a Keep a Changelog file', () => {
  const releases = parseChangelogSource(KEEP_A_CHANGELOG, FIXTURE_COMMITS);

  it('finds every release the file declares, and no preamble', () => {
    expect(releases.map((release) => release.version)).toEqual([
      'Unreleased',
      '1.2.0',
      'Not done yet',
    ]);
    // The bullet above the first `##` is document prose, not a change.
    expect(entriesOf(releases[0]!).map((entry) => entry.text)).not.toContain(
      'A preamble bullet that is not a change either.',
    );
  });

  it('keeps a top-level section that is not a version, and flags it as one', () => {
    // Dropping it would be a lie by omission; listing it as a version would be
    // a different one. It is kept and marked.
    const section = releases[2]!;
    expect(section.version).toBe('Not done yet');
    expect(section.isVersion).toBe(false);
    expect(section.entryCount).toBe(1);
    expect(releases[0]!.isVersion).toBe(true);
    expect(releases[1]!.isVersion).toBe(true);
  });

  it('keeps the categories the file wrote, in order', () => {
    expect(releases[0]!.categories.map((category) => category.name)).toEqual(['Added', 'Fixed']);
  });

  it('folds a wrapped bullet back into one entry and splits its bold lead', () => {
    const entry = entriesOf(releases[0]!)[0]!;
    expect(entry.title).toBe('A toast that shows a dish.');
    expect(entry.text).toBe(
      'It draws once per launch and never blocks anything, which is the whole point',
    );
  });

  it('dates an entry from the commit that made it', () => {
    const entry = entriesOf(releases[0]!)[0]!;
    expect(entry.commit.state).toBe('verified');
    expect(entry.date).toBe('2026-08-03');
  });

  it('says plainly when an entry has no commit, or an unknown one', () => {
    const entries = entriesOf(releases[0]!);
    const noCommit = entries.find((entry) => entry.text.startsWith('A second thing'))!;
    expect(noCommit.commit.state).toBe('unrecorded');
    expect(noCommit.date).toBeNull();
    const unknown = entries.find((entry) => entry.text.startsWith('A fix pointing'))!;
    expect(unknown.commit.state).toBe('unresolved');
    if (unknown.commit.state !== 'unresolved') return;
    expect(unknown.commit.referenced).toEqual(['fff9999']);
  });

  it('reads a date the heading records as the release date', () => {
    const older = releases[1]!;
    expect(older.date).toBe('2026-06-01');
    expect(older.dateSource).toBe('source');
  });

  it('falls back to the newest change, and labels it as that', () => {
    const unreleased = releases[0]!;
    expect(unreleased.dateSource).toBe('commits');
    // Two entries carry a date: aaa1111 on 2026-08-03, and the summarizing
    // entry, which is dated by the commit that completed it (ccc3333,
    // 2026-08-01) rather than by the first one it happens to name.
    expect(unreleased.date).toBe('2026-08-03');
    expect(unreleased.dateRange).toEqual({ first: '2026-08-01', last: '2026-08-03' });
  });
});

describe('parsing a release-notes file', () => {
  it('takes the version from the path and the title from the heading', () => {
    const [release] = parseChangelogSource(RELEASE_NOTES, FIXTURE_COMMITS);
    expect(release?.version).toBe('0.16.0');
    expect(release?.title).toBe('Example 0.16.0 — The Headline');
  });

  it('treats `##` as the category and `###` as a subcategory', () => {
    const [release] = parseChangelogSource(RELEASE_NOTES, FIXTURE_COMMITS);
    expect(release?.categories.map((category) => category.name)).toEqual(['✨ Added', '🙏 Thanks']);
    const entry = release!.categories[0]!.entries[0]!;
    expect(entry.subcategory).toBe('🚀 Deployment');
    expect(entry.title).toBe('Preview before you publish.');
    expect(entry.text).toBe('Deployment exposes two targets. (#4576)');
    expect(entry.commit.state).toBe('unrecorded');
  });

  it('skips the intro paragraph above the first category', () => {
    const [release] = parseChangelogSource(RELEASE_NOTES, FIXTURE_COMMITS);
    const texts = entriesOf(release!).map((entry) => entry.text);
    expect(texts.some((text) => text.startsWith('An intro paragraph'))).toBe(false);
  });

  it('keeps a release that is written entirely in prose', () => {
    // A version whose notes carry no bullets is still a version. Dropping it
    // would leave a viewer that claims to list every one quietly missing one.
    const [release] = parseChangelogSource(PROSE_ONLY, FIXTURE_COMMITS);
    expect(release?.version).toBe('0.14.1');
    expect(release?.title).toBe('Example 0.14.1');
    expect(release?.entryCount).toBe(2);
    expect(entriesOf(release!)[0]!.text).toBe(
      'You can now allow the app to apply a downloaded update silently the next time it starts.',
    );
  });
});

describe('release ordering', () => {
  it('puts unreleased first and then counts down numerically', () => {
    const make = (version: string): ChangelogRelease => ({
      version,
      isVersion: looksLikeVersion(version),
      title: null,
      sourcePath: 'x',
      date: null,
      dateSource: null,
      dateRange: null,
      categories: [],
      entryCount: 0,
    });
    const sorted = [
      make('0.9.0'),
      make('Not done yet'),
      make('v0.16.1-r7.1'),
      make('0.10.0'),
      make('Unreleased'),
      make('v0.16.1-r8.1'),
      make('1.0.0'),
    ]
      .sort(compareReleases)
      .map((release) => release.version);
    // Unreleased, then versions newest first (a leading `v` is decoration on a
    // tag, not a segment), then whatever is not a version at all.
    expect(sorted).toEqual([
      'Unreleased',
      '1.0.0',
      'v0.16.1-r8.1',
      'v0.16.1-r7.1',
      '0.10.0',
      '0.9.0',
      'Not done yet',
    ]);
  });

  it('knows a version from a section that only looks like one', () => {
    expect(looksLikeVersion('Unreleased')).toBe(true);
    expect(looksLikeVersion('0.16.0')).toBe(true);
    expect(looksLikeVersion('v0.16.1-r8.1')).toBe(true);
    expect(looksLikeVersion('Not done yet')).toBe(false);
  });
});

describe('the repository\'s own changelog', () => {
  const releases = parseChangelog(CHANGELOG_SOURCES, CHANGELOG_COMMITS);

  it('reads every source into at least one release', () => {
    expect(CHANGELOG_SOURCES.length).toBeGreaterThan(0);
    const paths = new Set(releases.map((release) => release.sourcePath));
    for (const source of CHANGELOG_SOURCES) {
      expect(paths.has(source.path), `${source.path} produced no release`).toBe(true);
    }
  });

  it('gives every release at least one entry', () => {
    expect(releases.length).toBeGreaterThan(0);
    for (const release of releases) {
      expect(release.entryCount, `${release.version} is empty`).toBeGreaterThan(0);
    }
  });

  it('never emits a link for a commit the build did not resolve', () => {
    for (const release of releases) {
      for (const entry of entriesOf(release)) {
        if (entry.commit.state !== 'verified') continue;
        const record = CHANGELOG_COMMITS[entry.commit.shortSha];
        expect(record, `${entry.id} links an unverified commit`).toBeDefined();
        expect(entry.commit.sha).toBe(record?.sha);
        expect(entry.commit.url).toBe(record?.url);
        expect(entry.commit.sha).toMatch(/^[0-9a-f]{40}$/);
      }
    }
  });

  it('leaves no changelog syntax in the text it renders', () => {
    for (const release of releases) {
      for (const entry of entriesOf(release)) {
        expect(entry.text, entry.id).not.toContain('](');
        expect(entry.text, entry.id).not.toMatch(/\*\*/);
        expect(entry.text, entry.id).not.toMatch(/\(\s*,/);
      }
    }
  });
});
