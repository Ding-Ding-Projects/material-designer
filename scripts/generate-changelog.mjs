#!/usr/bin/env node
// Build the app's changelog data from this repository's own changelog sources.
//
// Sources, newest first:
//   * `CHANGELOG.md`                      — this project's Keep a Changelog file
//   * `design/docs/CHANGELOG/v*/en.md`    — the imported work's release notes
//
// Output: `design/apps/web/src/lib/changelog/generated.ts`, a typed module the
// app imports. Nothing reads the filesystem or the network at runtime.
//
// What is genuinely build-time here is the part that *needs* a repository: the
// source files are gathered, and every commit the sources reference is
// resolved against git — full object id, author date, and the link the source
// itself wrote. An abbreviation that does not resolve is recorded as
// unresolved rather than emitted as a link, so the viewer never offers a dead
// one. The shape of a release — its categories and entries — is then derived
// from that markdown by `src/lib/changelog/parse.ts`, which is the single
// parser: the one the tests exercise and the one the app runs. Mirroring it
// here in a second language is how a generator and an app quietly disagree.
//
// Usage:  node scripts/generate-changelog.mjs [--check]
//   --check verifies the committed module matches what this script would
//           write and exits non-zero on drift, without touching the tree.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outFile = join(
  repoRoot,
  'design',
  'apps',
  'web',
  'src',
  'lib',
  'changelog',
  'generated.ts',
);
const releaseNotesDir = join(repoRoot, 'design', 'docs', 'CHANGELOG');
const check = process.argv.includes('--check');

// A markdown link whose target is a commit. Both the backticked form the
// project's own changelog uses and a bare one are accepted; the abbreviation
// is read from the link text, and the URL is taken verbatim from the source
// rather than assembled from a guessed origin.
const COMMIT_LINK = /\[`?([0-9a-f]{7,40})`?\]\((https?:\/\/[^\s)]*\/commit\/[0-9a-f]{7,40})\)/g;

/** @param {string} value */
function json(value) {
  return JSON.stringify(value);
}

function gitRevParse(shortSha) {
  try {
    return execFileSync('git', ['rev-parse', '--verify', '--quiet', `${shortSha}^{commit}`], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();
  } catch {
    return null;
  }
}

function gitCommitDate(sha) {
  return execFileSync('git', ['log', '-1', '--format=%cI', sha], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
}

function readSources() {
  const sources = [];
  const ownPath = join(repoRoot, 'CHANGELOG.md');
  if (existsSync(ownPath)) {
    sources.push({
      path: 'CHANGELOG.md',
      kind: 'keep-a-changelog',
      version: null,
      markdown: readFileSync(ownPath, 'utf8'),
    });
  }
  if (existsSync(releaseNotesDir)) {
    const versions = readdirSync(releaseNotesDir)
      .filter((name) => name.startsWith('v'))
      .sort()
      .reverse();
    for (const dir of versions) {
      const file = join(releaseNotesDir, dir, 'en.md');
      if (!existsSync(file)) continue;
      sources.push({
        path: `design/docs/CHANGELOG/${dir}/en.md`,
        kind: 'release-notes',
        version: dir.replace(/^v/, ''),
        markdown: readFileSync(file, 'utf8'),
      });
    }
  }
  if (sources.length === 0) throw new Error('no changelog sources found');
  return sources;
}

function resolveCommits(sources) {
  /** @type {Map<string, {sha: string, shortSha: string, url: string, date: string}>} */
  const verified = new Map();
  const unresolved = new Set();
  for (const source of sources) {
    for (const match of source.markdown.matchAll(COMMIT_LINK)) {
      const shortSha = match[1];
      const url = match[2];
      if (verified.has(shortSha) || unresolved.has(shortSha)) continue;
      const sha = gitRevParse(shortSha);
      if (sha == null) {
        // Referenced but not in this repository. Recorded, never linked: a
        // link that 404s is worse than an entry that admits it cannot say.
        unresolved.add(shortSha);
        continue;
      }
      verified.set(shortSha, { sha, shortSha, url, date: gitCommitDate(sha) });
    }
  }
  return {
    verified: [...verified.values()].sort((a, b) => (a.shortSha < b.shortSha ? -1 : 1)),
    unresolved: [...unresolved].sort(),
  };
}

function render(sources, commits) {
  const lines = [];
  lines.push('// GENERATED FILE — do not edit by hand.');
  lines.push('//');
  lines.push('// Written by `node scripts/generate-changelog.mjs` from this repository\'s own');
  lines.push('// changelog sources. Two things are recorded here that only a repository can');
  lines.push('// answer: the source markdown itself, and every commit those sources');
  lines.push('// reference — resolved to a full object id and an author date, with the link');
  lines.push('// taken verbatim from the source. An abbreviation this repository does not');
  lines.push('// have is listed as unresolved and never linked.');
  lines.push('//');
  lines.push('// `../changelog` turns this into releases through `parse.ts`, which is the one');
  lines.push('// parser the app and its tests both use.');
  lines.push('');
  lines.push('export interface ChangelogSourceFile {');
  lines.push('  /** Repository-relative path this markdown was read from. */');
  lines.push('  readonly path: string;');
  lines.push('  readonly kind: \'keep-a-changelog\' | \'release-notes\';');
  lines.push('  /** Version the file documents, when the path names one. */');
  lines.push('  readonly version: string | null;');
  lines.push('  readonly markdown: string;');
  lines.push('}');
  lines.push('');
  lines.push('export interface ChangelogCommitRecord {');
  lines.push('  /** Full object id, resolved against this repository at build time. */');
  lines.push('  readonly sha: string;');
  lines.push('  /** The abbreviation the source wrote. */');
  lines.push('  readonly shortSha: string;');
  lines.push('  /** The link the source wrote — never assembled from a guessed origin. */');
  lines.push('  readonly url: string;');
  lines.push('  /** Commit date, ISO-8601 with offset. */');
  lines.push('  readonly date: string;');
  lines.push('}');
  lines.push('');
  lines.push('export const CHANGELOG_SOURCES: readonly ChangelogSourceFile[] = [');
  for (const source of sources) {
    lines.push('  {');
    lines.push(`    path: ${json(source.path)},`);
    lines.push(`    kind: ${json(source.kind)},`);
    lines.push(`    version: ${source.version == null ? 'null' : json(source.version)},`);
    lines.push(`    markdown: ${json(source.markdown)},`);
    lines.push('  },');
  }
  lines.push('];');
  lines.push('');
  lines.push('/** Keyed by the abbreviation as written in the source markdown. */');
  lines.push('export const CHANGELOG_COMMITS: Readonly<Record<string, ChangelogCommitRecord>> = {');
  for (const commit of commits.verified) {
    lines.push(`  ${json(commit.shortSha)}: {`);
    lines.push(`    sha: ${json(commit.sha)},`);
    lines.push(`    shortSha: ${json(commit.shortSha)},`);
    lines.push(`    url: ${json(commit.url)},`);
    lines.push(`    date: ${json(commit.date)},`);
    lines.push('  },');
  }
  lines.push('};');
  lines.push('');
  lines.push('/**');
  lines.push(' * Abbreviations a source references that this repository does not contain.');
  lines.push(' * The viewer says so on the entry instead of linking somewhere that 404s.');
  lines.push(' */');
  lines.push('export const CHANGELOG_UNRESOLVED_COMMITS: readonly string[] = [');
  for (const shortSha of commits.unresolved) lines.push(`  ${json(shortSha)},`);
  lines.push('];');
  lines.push('');
  return lines.join('\n');
}

function main() {
  const sources = readSources();
  const commits = resolveCommits(sources);
  const rendered = render(sources, commits);
  if (check) {
    const onDisk = existsSync(outFile) ? readFileSync(outFile, 'utf8') : '';
    if (onDisk !== rendered) {
      console.error(`generate-changelog: ${outFile} is out of date`);
      process.exit(1);
    }
    console.log(`generate-changelog: ${sources.length} sources verified.`);
    return;
  }
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, rendered, 'utf8');
  console.log(
    `generate-changelog: ${sources.length} sources, ${commits.verified.length} commits resolved` +
      `${commits.unresolved.length > 0 ? `, ${commits.unresolved.length} unresolved` : ''}.`,
  );
}

main();
