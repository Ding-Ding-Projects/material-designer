#!/usr/bin/env node
// Bundle a curated subset of the verified dish catalogue into the web app.
//
// Two outputs, both committed:
//   1. `design/apps/web/public/dim-sum/*.png` — the photographs, copied
//      byte-for-byte from `assets/dim-sum/images/` and re-verified against the
//      SHA-256 the catalogue records. Nothing here generates, fetches, resizes
//      or re-encodes an image; a mismatch is a hard failure, not a warning.
//   2. `design/apps/web/src/lib/dim-sum/catalog.ts` — a typed module the app
//      imports. The app never reads `assets/` at runtime, so the packaged
//      build ships the images locally with no network fetch and no CDN.
//
// Selection rule: one dish per category, the lowest id in each. It is
// deterministic (re-running picks the same twelve), it spreads the draw across
// every kind of dish the catalogue holds instead of stacking two of a kind,
// and it keeps the bundled weight to roughly a dozen photographs.
//
// Usage:  node scripts/generate-dim-sum-catalog.mjs [--check]
//   --check verifies the committed outputs match what this script would write
//           and exits non-zero on drift, without touching the tree.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceIndex = join(repoRoot, 'assets', 'dim-sum', 'index.json');
const sourceImages = join(repoRoot, 'assets', 'dim-sum', 'images');
const publicDir = join(repoRoot, 'design', 'apps', 'web', 'public', 'dim-sum');
const moduleFile = join(
  repoRoot,
  'design',
  'apps',
  'web',
  'src',
  'lib',
  'dim-sum',
  'catalog.ts',
);

const IMAGE_BASE = '/dim-sum/';
const check = process.argv.includes('--check');

/** @param {string} value */
function quote(value) {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function readCatalogue() {
  const raw = JSON.parse(readFileSync(sourceIndex, 'utf8'));
  if (!Array.isArray(raw.dishes) || raw.dishes.length === 0) {
    throw new Error(`${sourceIndex} carries no dishes`);
  }
  return raw;
}

/** One dish per category — the lowest id in each, ordered by id. */
function curate(dishes) {
  const byCategory = new Map();
  for (const dish of dishes) {
    const current = byCategory.get(dish.category);
    if (current == null || dish.id < current.id) byCategory.set(dish.category, dish);
  }
  return [...byCategory.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Copy one photograph and prove it arrived unchanged. The catalogue's own
 * sha256 is the authority: the bytes read from `assets/` must hash to it
 * before they are written, and the bytes written must hash to it after.
 */
function copyImage(dish) {
  const from = join(sourceImages, dish.image.replace(/^images\//, ''));
  const fileName = dish.image.replace(/^images\//, '');
  const to = join(publicDir, fileName);
  const bytes = readFileSync(from);
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== dish.sha256) {
    throw new Error(`${from} hashes to ${digest}, catalogue records ${dish.sha256}`);
  }
  if (bytes.byteLength !== dish.bytes) {
    throw new Error(`${from} is ${bytes.byteLength} bytes, catalogue records ${dish.bytes}`);
  }
  if (check) {
    if (!existsSync(to)) throw new Error(`missing bundled image ${to}`);
    const bundled = createHash('sha256').update(readFileSync(to)).digest('hex');
    if (bundled !== dish.sha256) throw new Error(`bundled ${to} hashes to ${bundled}`);
  } else {
    writeFileSync(to, bytes);
  }
  return fileName;
}

function renderModule(catalogue, dishes) {
  const lines = [];
  lines.push('// GENERATED FILE — do not edit by hand.');
  lines.push('//');
  lines.push('// Written by `node scripts/generate-dim-sum-catalog.mjs` from the verified');
  lines.push('// catalogue at `assets/dim-sum/index.json`. Every photograph named here is');
  lines.push('// bundled under `public/dim-sum/`, copied byte-for-byte from that catalogue');
  lines.push('// and re-verified by SHA-256 at generation time. The app never fetches a dish');
  lines.push('// image over the network, and nothing here was generated or re-encoded.');
  lines.push('//');
  lines.push('// One dish per category, lowest id in each — a deterministic spread across');
  lines.push('// every kind of dish the catalogue holds.');
  lines.push('');
  lines.push('export interface DimSumName {');
  lines.push('  /** English name, exactly as the catalogue records it. */');
  lines.push('  readonly en: string;');
  lines.push('  /** Traditional Chinese name, exactly as the catalogue records it. */');
  lines.push('  readonly zhHant: string;');
  lines.push('}');
  lines.push('');
  lines.push('export interface DimSumAlt {');
  lines.push('  readonly en: string;');
  lines.push('  readonly yue: string;');
  lines.push('}');
  lines.push('');
  lines.push('export interface DimSumDish {');
  lines.push('  readonly id: string;');
  lines.push('  readonly slug: string;');
  lines.push('  readonly category: string;');
  lines.push('  readonly name: DimSumName;');
  lines.push('  readonly jyutping: string;');
  lines.push('  /** App-absolute URL of the bundled photograph. */');
  lines.push('  readonly image: string;');
  lines.push('  readonly bytes: number;');
  lines.push('  readonly sha256: string;');
  lines.push('  readonly alt: DimSumAlt;');
  lines.push('}');
  lines.push('');
  lines.push(`export const DIM_SUM_SOURCE = ${quote('assets/dim-sum/index.json')};`);
  lines.push(`export const DIM_SUM_SCHEMA_VERSION = ${quote(catalogue.schemaVersion)};`);
  lines.push(`export const DIM_SUM_IMAGE_BASE = ${quote(IMAGE_BASE)};`);
  lines.push('');
  lines.push('export const DIM_SUM_CATALOGUE: readonly DimSumDish[] = [');
  for (const dish of dishes) {
    const fileName = dish.image.replace(/^images\//, '');
    lines.push('  {');
    lines.push(`    id: ${quote(dish.id)},`);
    lines.push(`    slug: ${quote(dish.slug)},`);
    lines.push(`    category: ${quote(dish.category)},`);
    lines.push('    name: {');
    lines.push(`      en: ${quote(dish.name.en)},`);
    lines.push(`      zhHant: ${quote(dish.name.zhHant)},`);
    lines.push('    },');
    lines.push(`    jyutping: ${quote(dish.jyutping)},`);
    lines.push(`    image: ${quote(`${IMAGE_BASE}${fileName}`)},`);
    lines.push(`    bytes: ${dish.bytes},`);
    lines.push(`    sha256: ${quote(dish.sha256)},`);
    lines.push('    alt: {');
    lines.push(`      en: ${quote(dish.alt.en)},`);
    lines.push(`      yue: ${quote(dish.alt.yue)},`);
    lines.push('    },');
    lines.push('  },');
  }
  lines.push('];');
  lines.push('');
  return lines.join('\n');
}

function main() {
  const catalogue = readCatalogue();
  const dishes = curate(catalogue.dishes);
  if (!check) mkdirSync(publicDir, { recursive: true });

  const kept = new Set();
  for (const dish of dishes) kept.add(copyImage(dish));

  // A dish dropped from the curated set must not leave its photograph behind:
  // an orphan in `public/` ships weight nothing references.
  if (!check && existsSync(publicDir)) {
    for (const name of readdirSync(publicDir)) {
      if (name.endsWith('.png') && !kept.has(name)) unlinkSync(join(publicDir, name));
    }
  }

  const rendered = renderModule(catalogue, dishes);
  if (check) {
    const onDisk = existsSync(moduleFile) ? readFileSync(moduleFile, 'utf8') : '';
    if (onDisk !== rendered) {
      console.error(`generate-dim-sum-catalog: ${moduleFile} is out of date`);
      process.exit(1);
    }
    console.log(`generate-dim-sum-catalog: ${dishes.length} dishes verified.`);
    return;
  }
  mkdirSync(dirname(moduleFile), { recursive: true });
  writeFileSync(moduleFile, rendered, 'utf8');
  console.log(
    `generate-dim-sum-catalog: ${dishes.length} dishes across ${
      new Set(dishes.map((d) => d.category)).size
    } categories.`,
  );
}

main();
