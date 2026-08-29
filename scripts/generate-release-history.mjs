#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const RELEASE_HISTORY_SCHEMA_VERSION = 1;
export const RELEASE_HISTORY_OUTPUT = 'design/apps/web/src/lib/changelog/release-history.generated.ts';

const SHA_RE = /^[0-9a-f]{40}$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

function fail(message) {
  throw new Error(`Release history: ${message}`);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readInput(path) {
  const text = path === '-' ? readFileSync(0, 'utf8') : readFileSync(resolve(path), 'utf8');
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`input is not JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function flattenReleasePages(value) {
  if (!Array.isArray(value)) fail('input must be an array of releases or pages');
  const records = value.every(Array.isArray) ? value.flat() : value;
  if (!records.every(isRecord)) fail('input contains a non-object release');
  return records;
}

function validPublishedAt(value) {
  return typeof value === 'string' && ISO_RE.test(value) && Number.isFinite(Date.parse(value));
}

function extractCategories(body) {
  const lines = String(body ?? '').replace(/\r\n?/g, '\n').split('\n');
  const headings = lines
    .map((line, index) => {
      const match = /^(#{2,6})\s+(.+?)\s*$/.exec(line);
      return match ? { index, level: match[1].length, name: match[2] } : null;
    })
    .filter(Boolean);
  const first = headings[0];
  // Release notes commonly start with a level-two title, followed by level-
  // three categories. Keep the title out of the category list. Other release
  // bodies start directly with level-two categories.
  const categoryLevel = first && /^Material Designer\b/i.test(first.name) ? 3 : 2;
  const categories = [];
  let current = null;
  const flush = () => {
    if (!current) return;
    const notes = current.lines.join('\n').trim();
    categories.push({ name: current.name, notes: notes ? [notes] : [] });
    current = null;
  };
  for (const line of lines) {
    const heading = /^(#{2,6})\s+(.+?)\s*$/.exec(line);
    if (heading && heading[1].length === categoryLevel) {
      flush();
      current = { name: heading[2], lines: [] };
      continue;
    }
    if (current && (!heading || heading[1].length > categoryLevel)) current.lines.push(line);
  }
  flush();
  if (categories.length > 0) return categories;
  const whole = lines.join('\n').trim();
  return whole ? [{ name: 'Release notes', notes: [whole] }] : [{ name: 'Release notes', notes: [] }];
}

export function validateReleaseInput(records) {
  const published = records.filter((record) => record.draft === false);
  if (published.length === 0) fail('no non-draft published releases were supplied');
  const tags = new Set();
  for (const record of published) {
    if (typeof record.tag_name !== 'string' || !record.tag_name.trim()) fail('a published release has no tag');
    if (!validPublishedAt(record.published_at)) fail(`release ${record.tag_name} has an invalid published date`);
    if (tags.has(record.tag_name)) fail(`duplicate published tag: ${record.tag_name}`);
    tags.add(record.tag_name);
    if (typeof record.html_url !== 'string' || !/^https:\/\//.test(record.html_url)) fail(`release ${record.tag_name} has no HTTPS release URL`);
  }
  return published;
}

export function createReleaseRecord(record, repository, targetSha) {
  const tag = record.tag_name.trim();
  if (!SHA_RE.test(targetSha)) fail(`release ${tag} resolved to a non-40-character commit SHA`);
  if (!validPublishedAt(record.published_at)) fail(`release ${tag} has an invalid published date`);
  const sha = targetSha.toLowerCase();
  const targetUrl = `https://github.com/${repository}/commit/${sha}`;
  const body = typeof record.body === 'string' ? record.body : '';
  return {
    tag,
    name: typeof record.name === 'string' && record.name.trim() ? record.name.trim() : tag,
    publishedAt: record.published_at,
    prerelease: record.prerelease === true,
    releaseUrl: record.html_url,
    targetSha: sha,
    targetUrl,
    categories: extractCategories(body),
    body,
  };
}

export function validateReleaseHistory(history, { repository, expectedCount } = {}) {
  if (!Array.isArray(history)) fail('generated history is not an array');
  if (expectedCount != null && history.length !== expectedCount) {
    fail(`expected ${expectedCount} published releases, found ${history.length}`);
  }
  const tags = new Set();
  let previousDate = null;
  for (const release of history) {
    if (!isRecord(release)) fail('history contains a non-object record');
    if (typeof release.tag !== 'string' || !release.tag.trim()) fail('history contains a release without a tag');
    if (tags.has(release.tag)) fail(`duplicate history tag: ${release.tag}`);
    tags.add(release.tag);
    if (!validPublishedAt(release.publishedAt)) fail(`release ${release.tag} has an invalid published date`);
    if (previousDate != null && release.publishedAt > previousDate) fail(`release ${release.tag} is out of published-date order`);
    previousDate = release.publishedAt;
    if (!SHA_RE.test(release.targetSha)) fail(`release ${release.tag} does not carry a full target SHA`);
    if (repository != null) {
      const expectedUrl = `https://github.com/${repository}/commit/${release.targetSha.toLowerCase()}`;
      if (release.targetUrl !== expectedUrl) fail(`release ${release.tag} target URL is not backed by its full SHA`);
    }
    if (typeof release.releaseUrl !== 'string' || !/^https:\/\//.test(release.releaseUrl)) fail(`release ${release.tag} has an invalid release URL`);
    if (!Array.isArray(release.categories)) fail(`release ${release.tag} has no categories`);
    for (const category of release.categories) {
      if (!isRecord(category) || typeof category.name !== 'string' || !Array.isArray(category.notes)) fail(`release ${release.tag} has malformed category data`);
      if (!category.notes.every((note) => typeof note === 'string')) fail(`release ${release.tag} has a non-text category note`);
    }
    if (typeof release.body !== 'string') fail(`release ${release.tag} has a non-text body`);
  }
  return history;
}

function ghJson(repository, endpoint) {
  try {
    const text = execFileSync('gh', ['api', `repos/${repository}/${endpoint}`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    return JSON.parse(text);
  } catch (error) {
    fail(`gh could not read ${endpoint}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function ghPaginatedJson(repository, endpoint) {
  try {
    const text = execFileSync('gh', ['api', '--paginate', '--slurp', `repos/${repository}/${endpoint}`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    return flattenReleasePages(JSON.parse(text));
  } catch (error) {
    fail(`gh could not read paginated ${endpoint}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function resolveTagSha(repository, tag) {
  const response = ghJson(repository, `commits/${encodeURIComponent(tag)}`);
  const sha = response?.sha;
  if (!SHA_RE.test(sha ?? '')) fail(`tag ${tag} did not resolve to a full commit SHA`);
  return sha;
}

function sourceText(history, repository) {
  const payload = JSON.stringify(history, null, 2);
  return `// GENERATED FILE. Do not edit by hand.\n// Source: explicit gh release data for ${repository}.\n// Regenerate with scripts/generate-release-history.mjs --repo ${repository}.\n\nexport const RELEASE_HISTORY_SCHEMA_VERSION = ${RELEASE_HISTORY_SCHEMA_VERSION} as const;\nexport const RELEASE_HISTORY_REPOSITORY = ${JSON.stringify(repository)} as const;\n\nexport interface ReleaseHistoryCategory {\n  readonly name: string;\n  readonly notes: readonly string[];\n}\n\nexport interface PublishedReleaseRecord {\n  readonly tag: string;\n  readonly name: string;\n  readonly publishedAt: string;\n  readonly prerelease: boolean;\n  readonly releaseUrl: string;\n  readonly targetSha: string;\n  readonly targetUrl: string;\n  readonly categories: readonly ReleaseHistoryCategory[];\n  readonly body: string;\n}\n\nexport const PUBLISHED_RELEASE_HISTORY: readonly PublishedReleaseRecord[] = ${payload} as const;\nexport const PUBLISHED_RELEASE_HISTORY_COUNT = ${history.length} as const;\n`;
}

export function generate({ records, repository, resolveSha, expectedCount } = {}) {
  if (typeof repository !== 'string' || !/^[^/\s]+\/[^/\s]+$/.test(repository)) fail('repository must be owner/name');
  const published = validateReleaseInput(records);
  const history = published
    .map((record) => createReleaseRecord(record, repository, resolveSha(record.tag_name, repository)))
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
  validateReleaseHistory(history, { repository, expectedCount: expectedCount ?? published.length });
  return history;
}

function parseArgs(argv) {
  const args = { repository: null, input: null, output: RELEASE_HISTORY_OUTPUT, check: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--repo') args.repository = argv[++index];
    else if (flag === '--input') args.input = argv[++index];
    else if (flag === '--output') args.output = argv[++index];
    else if (flag === '--check') args.check = true;
    else if (flag === '--help') {
      console.log('Usage: node scripts/generate-release-history.mjs --repo owner/name [--input release-json] [--output generated.ts] [--check]');
      process.exit(0);
    } else fail(`unknown argument: ${flag}`);
  }
  if (!args.repository) fail('--repo owner/name is required');
  return args;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const source = args.input ? flattenReleasePages(readInput(args.input)) : ghPaginatedJson(args.repository, 'releases?per_page=100');
    const history = generate({
      records: source,
      repository: args.repository,
      expectedCount: 51,
      resolveSha: (tag) => resolveTagSha(args.repository, tag),
    });
    const output = resolve(args.output);
    const generated = sourceText(history, args.repository);
    if (args.check) {
      let existing;
      try { existing = readFileSync(output, 'utf8'); } catch { fail(`generated output is missing: ${args.output}`); }
      if (existing !== generated) fail(`generated output is stale: ${args.output}`);
      console.log(`Release history is complete: ${history.length} published releases.`);
    } else {
      writeFileSync(output, generated, 'utf8');
      console.log(`Generated complete release history: ${history.length} published releases.`);
      console.log(`Output: ${args.output}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
