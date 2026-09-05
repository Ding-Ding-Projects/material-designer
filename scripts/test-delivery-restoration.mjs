import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();
const pages = await readFile(join(root, ".github/workflows/pages.yml"), "utf8");
const release = await readFile(join(root, ".github/workflows/release.yml"), "utf8");
const failures = [];

const deployLines = pages.replace(/\r\n?/g, "\n").split("\n");
const deployStart = deployLines.indexOf("  deploy:");
const deployBody = deployStart < 0 ? [] : deployLines.slice(deployStart);
const conditions = deployBody.filter((line) => /^    if:\s+/.test(line));
const expectedCondition = "    if: ${{ (github.event_name == 'push' && github.ref == 'refs/heads/main') || (github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main') || (github.event_name == 'workflow_run' && github.event.workflow_run.head_branch == 'main' && github.event.workflow_run.conclusion == 'success') }}";
if (conditions.length !== 1 || conditions[0] !== expectedCondition) failures.push("Pages deployment condition is not the single exact main/workflow_run condition");

const docsStep = release.slice(release.indexOf("      - name: Generate exact in-app documentation bundle"), release.indexOf("      - name: Set up pnpm"));
if (!docsStep.includes("scripts/verify-offline-docs.ps1") || /scripts\/generate-(?:docs|app-docs)-manifest\.ps1/.test(docsStep)) failures.push("Release documentation step does not use the transaction verifier exclusively");

const failureStart = release.indexOf("function Save-PackagingFailureEvidence");
const failureEnd = release.indexOf("          try {", failureStart);
const failureBlock = failureStart >= 0 && failureEnd > failureStart ? release.slice(failureStart, failureEnd) : "";
for (const needle of ["diagnostic=$diagnostic", "exitCode=$packExitCode", "transcriptRecords=$($buildOutput.Count)", "Get-FileHash -LiteralPath $stableBuildLogPath -Algorithm SHA256"]) {
  if (!failureBlock.includes(needle)) failures.push(`Packaging failure evidence is missing ${needle}`);
}
if (/\$ErrorMessage(?!\))/m.test(failureBlock) || /\$buildOutput\s+-join/.test(failureBlock)) failures.push("Packaging failure evidence can expose raw native output or an error message");

const sensitive = "token=private-value C:\\runner\\work";
const child = spawnSync(process.execPath, ["-e", "process.stderr.write(process.argv[1]); process.exit(23)", sensitive], { encoding: "utf8" });
if (child.status !== 23 || !child.stderr.includes(sensitive)) failures.push("Native failure fixture did not produce its expected non-zero diagnostic");
const safeSummary = ["schemaVersion=1", "status=failed", "phase=squirrel-packaging", "diagnostic=tools-pack-exit", `exitCode=${child.status}`, "transcriptRecords=1"].join("\n");
if (safeSummary.includes(sensitive) || /[A-Za-z]:\\|token=/i.test(safeSummary)) failures.push("Allowlisted failure summary leaked the native diagnostic fixture");

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("PASS: delivery restoration guards reject duplicate Pages conditions and retain only sanitized native packaging-failure facts.");
}
