import { readFileSync } from "node:fs";

function depthOf(path) {
  const source = readFileSync(path, "utf8");
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, "``");
  let depth = 0;
  for (const ch of stripped) {
    if (ch === "{") depth += 1;
    if (ch === "}") depth -= 1;
  }
  return depth;
}

for (const path of process.argv.slice(2).filter((a) => a !== "--scan")) {
  console.log(path, depthOf(path));
}

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

if (process.argv.includes("--scan")) {
  const broken = [];
  const reachedTwo = [];
  const lastZero = new Map();
  for (const path of walk("design/apps/web/src")) {
    const lines = readFileSync(path, "utf8").split("\n");
    let depth = 0;
    let inComment = false;
    for (let i = 0; i < lines.length; i += 1) {
      let line = lines[i];
      if (inComment) {
        if (line.includes("*/")) inComment = false;
        else continue;
      }
      const open = line.indexOf("/*");
      if (open >= 0) {
        const close = line.indexOf("*/", open);
        if (close >= 0) line = line.slice(0, open) + line.slice(close + 2);
        else {
          line = line.slice(0, open);
          inComment = true;
        }
      }
      if (line.trimStart().startsWith("//")) continue;
      depth += (line.match(/\{/g) ?? []).length;
      depth -= (line.match(/\}/g) ?? []).length;
      if (depth >= 2) reachedTwo.push(`${path}:${i + 1}`);
      if (depth === 0) lastZero.set(path, i + 1);
      if (depth < 0) {
        broken.push(`${path}: line ${i + 1}`);
        break;
      }
    }
  }
  console.log(broken.length === 0 ? "all balanced" : broken.join("\n"));
  console.log("reached-two:", reachedTwo.slice(0, 12).join(" "));
  for (const [p, l] of lastZero) console.log(`last-zero ${p}:${l}`);
}

const app = readFileSync("design/apps/web/src/App.tsx", "utf8");
const start = app.indexOf("function AppInner");
const end = app.indexOf("function generateInstallationIdSafe");
const segment = app.slice(start, end)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "")
  .replace(/'(?:\\.|[^'\\])*'/g, "''")
  .replace(/"(?:\\.|[^"\\])*"/g, "" + "")
  .replace(/`(?:\\.|[^`\\])*`/g, "``");
let depth = 0;
for (const ch of segment) {
  if (ch === "{") depth += 1;
  if (ch === "}") depth -= 1;
}
console.log("AppInner segment depth:", depth);

const returnStart = app.indexOf("  return (\n    <>\n      <div", start);
const returnEnd = app.indexOf("  );\n}", returnStart);
let jsxDepth = 0;
for (const ch of app.slice(returnStart, returnEnd)) {
  if (ch === "{") jsxDepth += 1;
  if (ch === "}") jsxDepth -= 1;
}
console.log("return-region brace depth (raw, includes strings/comments):", jsxDepth);
