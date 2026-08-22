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

for (const path of process.argv.slice(2)) {
  console.log(path, depthOf(path));
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
