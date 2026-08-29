import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile, copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const sourceHelper = join(repositoryRoot, "scripts", "declared-paths.sh");
const gitExecutable = process.platform === "win32" ? "git.exe" : "git";
const bashExecutable = process.platform === "win32"
  ? [join(process.env.ProgramFiles ?? "", "Git", "bin", "bash.exe"), "bash.exe"].find(existsSync) ?? "bash.exe"
  : "bash";

function runHelper(helperPath, fixtureRoot) {
  const result = spawnSync(bashExecutable, [helperPath, "--diff"], {
    cwd: fixtureRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function section(output, heading, nextHeading) {
  const start = output.indexOf(heading);
  assert.notEqual(start, -1, `missing output section: ${heading}`);
  const end = output.indexOf(nextHeading, start);
  assert.notEqual(end, -1, `missing output section: ${nextHeading}`);
  return output.slice(start, end);
}

async function removeFixture(root) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await rm(root, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!error || !["EBUSY", "EPERM"].includes(error.code) || attempt === 9) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

const fixtureRoot = await mkdtemp(join(tmpdir(), "declared-paths-contract-"));
try {
  const designRoot = join(fixtureRoot, "design");
  const scriptsRoot = join(fixtureRoot, "scripts");
  await mkdir(designRoot, { recursive: true });
  await mkdir(scriptsRoot, { recursive: true });
  await writeFile(join(designRoot, "present.txt"), "same\n");
  await writeFile(join(designRoot, "changed.txt"), "local\n");
  await copyFile(sourceHelper, join(scriptsRoot, "declared-paths.sh"));
  await chmod(join(scriptsRoot, "declared-paths.sh"), 0o755);

  execFileSync(gitExecutable, ["init", "-q"], { cwd: fixtureRoot });
  execFileSync(gitExecutable, ["config", "core.autocrlf", "false"], { cwd: fixtureRoot });
  execFileSync(gitExecutable, ["add", "design/present.txt", "design/changed.txt", "scripts/declared-paths.sh"], {
    cwd: fixtureRoot,
  });
  const presentOid = execFileSync(gitExecutable, ["hash-object", "design/present.txt"], {
    cwd: fixtureRoot,
    encoding: "utf8",
  }).trim();
  const changedUpstreamOid = "0000000000000000000000000000000000000000";
  await writeFile(
    join(scriptsRoot, "upstream-manifest.tsv"),
    [
      "# commit\tfixture",
      `100644\t${changedUpstreamOid}\tchanged.txt`,
      `100644\t${changedUpstreamOid}\tdeleted.txt`,
      `100644\t${presentOid}\tpresent.txt`,
      "",
    ].join("\n"),
  );
  await writeFile(
    join(fixtureRoot, "MODIFICATIONS.md"),
    [
      "# Fixture declarations",
      "",
      "- `deleted.txt`",
      "- `present.txt`",
      "",
    ].join("\n"),
  );

  const currentHelper = join(scriptsRoot, "declared-paths.sh");
  const currentSource = await readFile(currentHelper, "utf8");
  const addedLine = 'comm -23 <(cut -f3 "$tmp/upstream.tsv") <(cut -f3 "$tmp/tracked.tsv") >> "$tmp/differing.txt"\n';
  const oldSource = currentSource.replace(addedLine, "");
  assert.notEqual(oldSource, currentSource, "fixture could not remove the repaired missing-path rule");
  const oldHelper = join(scriptsRoot, "declared-paths-before-fix.sh");
  await writeFile(oldHelper, oldSource);
  await chmod(oldHelper, 0o755);

  const oldOutput = runHelper(oldHelper, fixtureRoot);
  const oldStale = section(oldOutput, "declared but does NOT differ (stale notice):", "in agreement:");
  assert.match(oldStale, /  - deleted\.txt/);

  const currentOutput = runHelper(currentHelper, fixtureRoot);
  const currentDiffering = section(currentOutput, "differs but NOT declared (would fail the gate):", "declared but does NOT differ");
  const currentStale = section(currentOutput, "declared but does NOT differ (stale notice):", "in agreement:");
  assert.match(currentDiffering, /  \+ changed\.txt/);
  assert.match(currentStale, /  - present\.txt/);
  assert.doesNotMatch(currentStale, /  - deleted\.txt/);
  assert.match(currentOutput, /in agreement: 1/);

  console.log("declared-paths contract: old helper red, repaired helper passed");
} finally {
  await removeFixture(fixtureRoot);
}
