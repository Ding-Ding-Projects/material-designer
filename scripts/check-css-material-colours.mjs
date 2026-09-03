#!/usr/bin/env node
/**
 * Count colours painted outside the Material token system, and refuse to let
 * the number grow.
 *
 * The application's stylesheets carry a large tail of pinned colours: a
 * colour written as `#2f781d`, or as an opaque `rgb(47, 120, 29)`, rather
 * than as a `--md-sys-color-*` role or a product token that maps onto one.
 * They are not a build error and no test sees them, so the count only ever
 * went up. This is a ratchet: it fails if the count exceeds the ceiling below,
 * and it also fails if the count drops
 * well under it, so the ceiling gets lowered as the sweep proceeds instead of
 * silently banking the progress.
 *
 * A hex inside a `var(--token, #fallback)` fallback is not counted WHEN
 * something declares that token, because then the token is the value and the
 * literal is only the safety net. When nothing declares it, the fallback is
 * the value forever and is counted like any other bare literal.
 *
 * This also fails, separately and with no tolerance, on a reference to a
 * custom property that nothing declares and that carries no fallback. There
 * the declaration is invalid at computed-value time and is dropped entirely,
 * so the property never applies at all. Nothing warns about that today.
 *
 * Usage:
 *   node scripts/check-css-material-colours.mjs            # enforce
 *   node scripts/check-css-material-colours.mjs --report   # per-file counts
 */
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { argv } from 'node:process';

const root = resolve(import.meta.dirname, '..');
const webSrc = resolve(root, 'design/apps/web/src');

/**
 * The two token sheets are where colours are allowed to be literal: that is
 * what a token sheet is for. Everything else should be reaching for a role.
 */
const TOKEN_SHEETS = new Set(['md3-tokens.css', 'tokens.css']);

/**
 * Every custom property the application actually declares, in CSS or from
 * TypeScript as an inline style.
 *
 * This exists because `var(--token, #hex)` is only the correct way to write a
 * fallback WHEN THE TOKEN EXISTS. If nothing ever declares it, the fallback is
 * not a safety net, it is the value: permanent, and unreachable by the theme.
 * That is a bare literal wearing a disguise, and this guard used to skip every
 * one of them. `--success` alone was read at 33 sites and declared at none.
 *
 * The TypeScript side matters because a property can legitimately be declared
 * at runtime (`style={{ ['--kind-tint']: … }}`), and flagging those would be
 * wrong. Consumer references are stripped first so that reading `var(--x)` in
 * a component never counts as declaring it. Anything left is treated as a
 * declaration, which errs toward silence: a missed literal is a smaller harm
 * than a false accusation against correct code.
 */
function declaredCustomProperties(dir) {
  const declared = new Set();
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      const path = join(current, entry);
      if (statSync(path).isDirectory()) { walk(path); continue; }
      if (!/\.(css|ts|tsx)$/.test(entry)) continue;
      const source = readFileSync(path, 'utf8');
      if (entry.endsWith('.css')) {
        for (const m of source.matchAll(/(?:^|[;{])\s*(--[A-Za-z0-9_-]+)\s*:/gm)) declared.add(m[1]);
        continue;
      }
      // Drop consumer reads, then take what remains as declarations.
      const authored = source.replace(/var\(\s*--[A-Za-z0-9_-]+/g, 'var(');
      for (const m of authored.matchAll(/(--[A-Za-z0-9_-]+)/g)) declared.add(m[1]);
    }
  };
  walk(dir);
  return declared;
}

/**
 * Lower this as the sweep proceeds; never raise it to make room for new debt.
 *
 * It has moved up three times, every one because the scan got more honest
 * rather than because the code got worse, and each is recorded so the number
 * stays comparable to itself. None excused a single new hardcoded colour.
 *
 * 1. Reading the real brace structure, after the old scan used an index from a
 *    200 character window as an absolute file offset and so excluded whole
 *    unrelated regions.
 * 2. Counting the fallbacks of tokens nothing declares, which found 97
 *    literals that had been hiding behind a `var()` all along.
 * 3. Requiring the colon in `brand:` and `specimen:`. Matching the bare word
 *    meant any comment that merely used it exempted its whole rule, which is
 *    how 36 literals sat behind sentences like "shown in a brand-extraction
 *    project". An exemption now has to be claimed, not stumbled into.
 */
const CEILING = 258;
/**
 * How far under the ceiling the count may sit before this fails and asks for
 * the ceiling to be lowered. Without it, a sweep's progress is invisible and
 * the next regression hides inside the slack.
 */
const SLACK = 25;

function cssFiles(dir, includeTokenSheets = false) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...cssFiles(path, includeTokenSheets));
      continue;
    }
    if (!entry.endsWith('.css')) continue;
    // The token sheets are exempt from the hex count, since literal colours are
    // what a token sheet is for, but not from the dropped-declaration check: a
    // reference to a name nothing declares is a defect wherever it is written.
    if (!includeTokenSheets && TOKEN_SHEETS.has(entry)) continue;
    out.push(path);
  }
  return out;
}

/**
 * Literal colours that are actually painting something: hex, and any colour
 * function that is fully opaque. The name is kept for its callers.
 *
 * Four kinds are excluded because in each the literal is correct:
 *
 * - the fallback half of `var(--token, #hex)`, but ONLY when something really
 *   declares that token. Then the token is the value and the literal is the
 *   safety net, which is correct. When nothing declares it, the fallback is
 *   not a net, it is the value: permanent and unreachable by the theme. Those
 *   are counted, because a bare literal in a disguise is still a bare literal.
 *   Pass the declared set to get that check; omit it and every fallback is
 *   trusted, which is what callers written before this existed expect;
 * - anything inside a mask (`mask-image`, `-webkit-mask-image`, `mask`, and
 *   the `linear-gradient(#000 0 0)` mask-composite idiom), where the hex is
 *   an alpha stencil and its colour channel is never seen;
 * - a declaration marked `brand:`, a third-party identity such as Discord's
 *   colour, or a functional scale like the model tier badges, which Material
 *   names no role for and which must not drift with the theme;
 * - a declaration marked `specimen:`, a palette the app is *depicting* rather
 *   than painting itself with: a terminal's ANSI colours (a program's output
 *   becomes unreadable if red stops being red), or a design-style thumbnail
 *   showing what "brutalist" looks like. Theming those would destroy the very
 *   thing they exist to show.
 *
 * A marker covers the rule it is written above, all of it, and a marker on an
 * enclosing rule covers everything nested inside that rule. It does NOT carry
 * on to the next sibling rule: a palette written as a run of sibling selectors
 * needs the marker restated on each one. That is deliberate. A marker that ran
 * forward until something stopped it would silently exempt whatever happened to
 * be written after the palette, which is exactly the kind of quiet, widening
 * exemption this guard exists to prevent. Repeating the note is the cost of
 * every exemption staying visible at the declaration it applies to.
 */
export function bareHexLiterals(css, declared = null) {
  // Normalise the markers to a token the scan below can find, and drop every
  // other comment so a hex mentioned in prose (`Issue #860`) is not counted.
  // The marker is `brand:` or `specimen:`, with the colon. Matching the bare
  // word was a real hole: `BrandReadyPrompt.module.css` opened with the prose
  // "shown in a brand-extraction project", which exempted that whole rule and
  // would have exempted anything later added to it. An exemption has to be
  // claimed deliberately, never collected by accident from a sentence that
  // happens to use the word.
  const source = css.replace(/\/\*[\s\S]*?\*\//g, (comment) => (
    /\b(brand|specimen):/.test(comment) ? '/*keep*/' : ''
  ));

  // Every block, with the prelude that introduces it, so a marker written
  // above a selector counts as part of the block it describes.
  const blocks = [];
  const open = [];
  let preludeStart = 0;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') {
      open.push({ start: preludeStart, brace: i });
      preludeStart = i + 1;
    } else if (ch === '}') {
      const found = open.pop();
      if (found) blocks.push({ start: found.start, end: i });
      preludeStart = i + 1;
    } else if (ch === ';') {
      preludeStart = i + 1;
    }
  }

  // Hex, plus a colour function that is fully opaque. `rgb(22, 119, 255)` is a
  // pinned colour exactly as `#1677ff` is, and writing it the long way should
  // not buy an exemption. Translucent `rgba()` is deliberately not matched: an
  // overlay at 8 percent is a sheen or a state layer, and no Material role
  // means "white at eight percent", which is why those are left alone
  // throughout this sweep rather than forced onto a role.
  const found = [];
  const LITERAL = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d+[\s,]+\d+[\s,]+\d+\s*(?:[,/]\s*(?:1|1\.0|100%)\s*)?\)/g;
  for (const match of source.matchAll(LITERAL)) {
    // The declaration this hex sits in: back to the end of the previous one.
    const head = source.slice(0, match.index);
    const declaration = head.slice(
      Math.max(head.lastIndexOf(';'), head.lastIndexOf('{'), head.lastIndexOf('}')) + 1,
    );
    // A fallback is correct only when its token is real. Pass `declared` and
    // the fallback of a token nothing declares is counted, because there the
    // literal is the value rather than the safety net. Omit it and every
    // fallback is trusted, which is what earlier callers expect.
    const fallback = /var\(\s*(--[A-Za-z0-9_-]+)\s*,[^()]*$/.exec(declaration);
    if (fallback && (declared === null || declared.has(fallback[1]))) continue;
    if (/mask(-image)?\s*:/.test(declaration)) continue;
    if (/\/\*keep\*\//.test(declaration)) continue;
    // A marker on any enclosing rule covers this declaration.
    const covered = blocks.some(({ start, end }) => (
      start < match.index && end > match.index
      && /\/\*keep\*\//.test(source.slice(start, end))
    ));
    if (covered) continue;
    found.push(match[0]);
  }
  return found;
}

/**
 * References to a custom property that nothing declares, written with no
 * fallback.
 *
 * These are worse than an unreachable colour, because the declaration does not
 * merely freeze, it disappears. `var(--x)` with `--x` undeclared is invalid at
 * computed-value time, so the whole declaration is dropped and the property
 * simply never applies. Nothing errors and nothing warns. The sweep that added
 * this found 49 of them: nine in `NextStepActions.module.css` where the text
 * colour never painted, sixteen in `viewer/memory.css` where the text and
 * hairlines never painted, a `font-family: var(--font-mono)` in four sheets
 * that left code in the body face, and the agent status icon's error state,
 * which took ordinary text colour on a transparent ground and so looked
 * exactly like its own non-error state.
 *
 * Unlike the hex count above this is not a ratchet, because the number is
 * zero and there is no honest reason to write one. A reference nested as
 * another token's fallback (`var(--real, var(--x))`) is fine and skipped: the
 * outer token answers, so the inner name never has to.
 */
function deadCustomPropertyReferences(files, declared) {
  const dead = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)\s*\)/g)) {
      if (declared.has(match[1])) continue;
      if (/,\s*$/.test(source.slice(Math.max(0, match.index - 40), match.index))) continue;
      const line = source.slice(0, match.index).split('\n').length;
      dead.push(`${relative(root, file)}:${line}  ${match[1]}`);
    }
  }
  return dead;
}

/**
 * The walk, the report and the enforcement all live here rather than at module
 * scope, because this file also exports `bareHexLiterals` for other modules to
 * use. Anything at module scope runs on `import`, so an importer would pay for
 * a full directory walk and, worse, be killed by one of the `process.exit`
 * calls below before it ever saw the export.
 */
function main() {
  const files = cssFiles(webSrc).sort();
  const declared = declaredCustomProperties(webSrc);
  const perFile = new Map();
  let total = 0;
  for (const file of files) {
    const count = bareHexLiterals(readFileSync(file, 'utf8'), declared).length;
    if (count === 0) continue;
    perFile.set(relative(root, file), count);
    total += count;
  }

  // Every stylesheet, not just the ones outside the token sheets: a dropped
  // declaration is a defect wherever it is written.
  const dead = deadCustomPropertyReferences(cssFiles(webSrc, true), declared);
  if (dead.length > 0) {
    console.error(
      `check-css-material-colours: ${dead.length} reference(s) to a custom property that\n`
      + 'nothing declares, written with no fallback. Each one is invalid at\n'
      + 'computed-value time, so the declaration is dropped and the property never\n'
      + 'applies. Use a token this application declares, or add a fallback.\n\n'
      + dead.map((entry) => `  ${entry}`).join('\n'),
    );
    process.exit(1);
  }

  if (process.argv.includes('--report')) {
    for (const [file, count] of [...perFile].sort((a, b) => b[1] - a[1])) {
      console.log(`${String(count).padStart(4)}  ${file}`);
    }
    console.log(`\n${total} pinned colours across ${perFile.size} stylesheets (ceiling ${CEILING}).`);
    process.exit(0);
  }

  if (total > CEILING) {
    console.error(
      `check-css-material-colours: ${total} pinned colours, ceiling is ${CEILING}.\n`
      + 'A colour outside the token system is a colour the theme cannot reach. Use a\n'
      + '`--md-sys-color-*` role, or a product token that maps onto one. Run with\n'
      + '--report to see where the new ones landed.',
    );
    process.exit(1);
  }

  if (total < CEILING - SLACK) {
    console.error(
      `check-css-material-colours: ${total} pinned colours, well under the ceiling of ${CEILING}.\n`
      + `Lower CEILING to ${total} in this script so the progress is banked and the next\n`
      + 'regression cannot hide in the slack.',
    );
    process.exit(1);
  }

  console.log(
    `check-css-material-colours: ${total} pinned colours across ${perFile.size} `
    + `stylesheets, within the ceiling of ${CEILING}.`,
  );
}

// Only act as a command when run as one. An importer wanting `bareHexLiterals`
// gets the export and nothing else.
if (argv[1] && import.meta.filename === realpathSync(argv[1])) {
  main();
}
