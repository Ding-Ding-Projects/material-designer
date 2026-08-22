import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const declared = execSync(
  'git -C vendor/open-design ls-tree -r --name-only 05f5b33ef59f078df10ac1125986e00e4a796cf3 -- apps/web/src',
  { encoding: "utf8" },
).split("\n").filter(Boolean);

const mods = readFileSync("MODIFICATIONS.md", "utf8");
const broken = [];

for (const rel of declared) {
  const local = `design/${rel}`;
  let content;
  try {
    content = readFileSync(local, "utf8");
  } catch {
    continue;
  }
  const stripped = content
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
  const target = "`" + rel + "`";
  const isDeclared = mods.includes(target);
  if (depth !== 0 && isDeclared) {
    broken.push(`${rel} depth=${depth}`);
  }
}

console.log(broken.length === 0 ? "all declared files balanced" : broken.join("\n"));
