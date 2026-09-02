#!/usr/bin/env node
/**
 * Count colours painted outside the Material token system, and refuse to let
 * the number grow.
 *
 * The application's stylesheets carry a large tail of bare hex literals — a
 * colour written as `#2f781d` rather than as a `--md-sys-color-*` role or a
 * product token that maps onto one. They are not a build error and no test
 * sees them, so the count only ever went up. This is a ratchet: it fails if
 * the count exceeds the ceiling below, and it also fails if the count drops
 * well under it, so the ceiling gets lowered as the sweep proceeds instead of
 * silently banking the progress.
 *
 * A hex inside a `var(--token, #fallback)` fallback is deliberately NOT
 * counted. That is the correct way to write a fallback: the token is the
 * value and the literal is the safety net.
 *
 * Usage:
 *   node scripts/check-css-material-colours.mjs            # enforce
 *   node scripts/check-css-material-colours.mjs --report   # per-file counts
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const webSrc = resolve(root, 'design/apps/web/src');

/**
 * The two token sheets are where colours are allowed to be literal: that is
 * what a token sheet is for. Everything else should be reaching for a role.
 */
const TOKEN_SHEETS = new Set(['md3-tokens.css', 'tokens.css']);

/** Lower this as the sweep proceeds; never raise it. */
const CEILING = 553;
/**
 * How far under the ceiling the count may sit before this fails and asks for
 * the ceiling to be lowered. Without it, a sweep's progress is invisible and
 * the next regression hides inside the slack.
 */
const SLACK = 25;

function cssFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...cssFiles(path));
      continue;
    }
    if (!entry.endsWith('.css')) continue;
    if (TOKEN_SHEETS.has(entry)) continue;
    out.push(path);
  }
  return out;
}

/**
 * Hex literals that are actually painting a colour.
 *
 * Three kinds are excluded because in each the literal is correct:
 *
 * - the fallback half of `var(--token, #hex)` — the token is the value and
 *   the literal is the safety net;
 * - anything inside a mask (`mask-image`, `-webkit-mask-image`, `mask`, and
 *   the `linear-gradient(#000 0 0)` mask-composite idiom) — there the hex is
 *   an alpha stencil, and its colour channel is never seen;
 * - a declaration whose preceding comment says `brand` — a third-party
 *   identity such as Discord's colour, or a functional scale like the model
 *   tier badges, which Material names no role for and which must not drift
 *   with the theme.
 */
export function bareHexLiterals(css) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, (comment) => (
    // Keep a `brand` marker visible to the scan below; drop everything else.
    /\bbrand\b/.test(comment) ? '/*brand*/' : ''
  ));
  const found = [];
  for (const match of source.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    const head = source.slice(Math.max(0, match.index - 200), match.index);
    if (/var\(\s*--[A-Za-z0-9_-]+\s*,[^()]*$/.test(head)) continue;
    const declaration = head.slice(head.lastIndexOf(';') + 1);
    if (/mask(-image)?\s*:/.test(declaration)) continue;
    // The marker is normally a comment written above the declaration, so look
    // back to the end of the previous declaration rather than at this line.
    // A marker anywhere in the enclosing rule covers the whole block, which is
    // how a palette is written: one note above a run of related entries.
    const blockStart = head.lastIndexOf('{');
    const blockEnd = source.indexOf('}', match.index);
    const block = blockStart === -1
      ? ''
      : source.slice(blockStart, blockEnd === -1 ? source.length : blockEnd);
    if (/\/\*brand\*\//.test(declaration) || /\/\*brand\*\//.test(block)) continue;
    found.push(match[0]);
  }
  return found;
}

const files = cssFiles(webSrc).sort();
const perFile = new Map();
let total = 0;
for (const file of files) {
  const count = bareHexLiterals(readFileSync(file, 'utf8')).length;
  if (count === 0) continue;
  perFile.set(relative(root, file), count);
  total += count;
}

if (process.argv.includes('--report')) {
  for (const [file, count] of [...perFile].sort((a, b) => b[1] - a[1])) {
    console.log(`${String(count).padStart(4)}  ${file}`);
  }
  console.log(`\n${total} bare hex literals across ${perFile.size} stylesheets (ceiling ${CEILING}).`);
  process.exit(0);
}

if (total > CEILING) {
  console.error(
    `check-css-material-colours: ${total} bare hex literals, ceiling is ${CEILING}.\n`
    + 'A colour outside the token system is a colour the theme cannot reach. Use a\n'
    + '`--md-sys-color-*` role, or a product token that maps onto one. Run with\n'
    + '--report to see where the new ones landed.',
  );
  process.exit(1);
}

if (total < CEILING - SLACK) {
  console.error(
    `check-css-material-colours: ${total} bare hex literals, well under the ceiling of ${CEILING}.\n`
    + `Lower CEILING to ${total} in this script so the progress is banked and the next\n`
    + 'regression cannot hide in the slack.',
  );
  process.exit(1);
}

console.log(
  `check-css-material-colours: ${total} bare hex literals across ${perFile.size} `
  + `stylesheets, within the ceiling of ${CEILING}.`,
);
