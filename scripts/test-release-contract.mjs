import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();
const workflowPaths = [
  ".github/workflows/pages.yml",
  ".github/workflows/release.yml",
  ".github/workflows/verify.yml",
];

const text = async (relativePath) => readFile(join(root, relativePath), "utf8");
const failures = [];

function requireText(source, needle, message) {
  if (!source.includes(needle)) failures.push(message);
}

function requireExact(source, needle, message) {
  const occurrences = source.split(needle).length - 1;
  if (occurrences !== 1) failures.push(`${message} (expected exactly once, found ${occurrences})`);
}

function forbid(source, pattern, message) {
  if (pattern.test(source)) failures.push(message);
}

const workflows = await Promise.all(workflowPaths.map(async (path) => [path, await text(path)]));
for (const [path, source] of workflows) {
  const runOnLines = source.match(/^\s+runs-on:\s*.+$/gm) ?? [];
  if (runOnLines.length === 0) failures.push(`${path} has no explicit runner label`);
  for (const line of runOnLines) {
    if (!line.includes("windows-2022")) failures.push(`${path} is not pinned to the supported hosted Windows image: ${line.trim()}`);
  }
  requireText(source, "bootstrap-ci-tools", `${path} does not bootstrap its hosted dependencies`);
}

const release = await text(".github/workflows/release.yml");
const artifactVerifier = await text("scripts/verify-squirrel-artifacts.ps1");
const artifactPathRegression = await text("scripts/test-verify-squirrel-artifacts-path.ps1");
const pages = await text(".github/workflows/pages.yml");
const builder = await text("design/tools/pack/src/win/builder.ts");
const pythonBootstrap = await text("scripts/bootstrap-python.ps1");
const rootBuild = await text("scripts/build.ps1");
const rootInstaller = await text("scripts/build-installer.ps1");

function sectionBetween(source, start, end, message) {
  const startAt = source.indexOf(start);
  const endAt = source.indexOf(end, startAt + start.length);
  if (startAt < 0 || endAt < 0 || endAt <= startAt) {
    failures.push(message);
    return "";
  }
  return source.slice(startAt, endAt);
}

function requireSection(source, start, end, needle, message) {
  const section = sectionBetween(source, start, end, message);
  if (section && !section.includes(needle)) failures.push(message);
}

const pagesLines = pages.replace(/\r\n?/g, "\n").split("\n");
const deployStart = pagesLines.indexOf("  deploy:");
const nextJob = pagesLines.findIndex((line, index) => index > deployStart && /^  [A-Za-z0-9_-]+:$/.test(line));
const deployLines = deployStart >= 0
  ? pagesLines.slice(deployStart, nextJob >= 0 ? nextJob : pagesLines.length)
  : [];
const expectedPagesDeployCondition = "    if: ${{ (github.event_name == 'push' && github.ref == 'refs/heads/main') || (github.event_name == 'release' && github.event.action == 'published') || github.event_name == 'workflow_dispatch' }}";
const pagesConditionLines = deployLines.filter((line) => /^    if:\s+/.test(line));
if (deployStart < 0) failures.push("pages.yml has no deploy job to protect from the Pages environment");
if (pagesConditionLines.length !== 1 || pagesConditionLines[0] !== expectedPagesDeployCondition) {
  failures.push("pages.yml deploy job must allow only main pushes, published releases, or explicit workflow_dispatch");
}
if (deployLines.indexOf(expectedPagesDeployCondition) < 0 || deployLines.indexOf("    environment:") < 0 || deployLines.indexOf(expectedPagesDeployCondition) > deployLines.indexOf("    environment:")) {
  failures.push("pages.yml must evaluate the deploy condition before attaching the github-pages environment");
}
const pagesEventMatrix = [
  { event: "push", ref: "refs/heads/main", action: "", expected: true },
  { event: "push", ref: "refs/heads/feature/example", action: "", expected: false },
  { event: "release", ref: "refs/tags/v1.2.3", action: "published", expected: true },
  { event: "workflow_dispatch", ref: "refs/heads/feature/example", action: "", expected: true },
];
const pagesDeploysFor = ({ event, ref, action }) =>
  (event === "push" && ref === "refs/heads/main")
  || (event === "release" && action === "published")
  || event === "workflow_dispatch";
for (const scenario of pagesEventMatrix) {
  if (pagesDeploysFor(scenario) !== scenario.expected) {
    failures.push(`pages.yml deploy event matrix is wrong for ${scenario.event} ${scenario.ref}`);
  }
}

requireText(release, "scripts/bootstrap-python.ps1", "release.yml does not bootstrap Python 3.12 automatically");
forbid(release, /actions\/setup-python@v5/, "release.yml still invokes the policy-blocked setup-python action");
requireText(pythonBootstrap, '$archiveName = "python-$pythonVersion-embed-amd64.zip"', "Python bootstrap does not use the pinned official embeddable archive");
requireText(pythonBootstrap, '$downloadUrl = "https://www.python.org/ftp/python/$pythonVersion/$archiveName"', "Python bootstrap does not use the canonical Python source");
requireText(pythonBootstrap, "Expand-Archive", "Python bootstrap does not extract the portable Python archive");
requireText(pythonBootstrap, "loads no setup script", "Python bootstrap does not document its policy-safe archive path");
requireText(release, "ilammy/msvc-dev-cmd@v1", "release.yml does not activate the Windows C++ toolchain");
requireText(release, ".\\build.bat /s", "release.yml does not exercise the complete root build entrypoint");
requireText(rootBuild, "download-dependencies.ps1", "the root build entrypoint does not invoke the dependency helper");
requireText(rootInstaller, "verify-squirrel-artifacts.ps1", "the root installer entrypoint does not use the shared Squirrel validator");
requireSection(release, "- name: Run the root build entrypoint", "- name: Build the Windows Squirrel installer", ".\\build.bat /s", "release.yml does not exercise the complete root build entrypoint in its own step");
requireSection(release, "- name: Build the Windows Squirrel installer", "- name: Confirm unsigned Squirrel output", "$pnpmPath = [string]$resolution.tools.pnpm.executable", "release.yml does not resolve pnpm inside the packaging step");
requireSection(release, "- name: Build the Windows Squirrel installer", "- name: Confirm unsigned Squirrel output", "& $pnpmPath exec tools-pack win build", "release.yml does not invoke packaging through the resolved pnpm path");
requireSection(release, "- name: Validate the complete Squirrel artifact set", "- name: Count lines for release notes", "scripts/verify-squirrel-artifacts.ps1", "release.yml does not invoke the shared Squirrel validator");
requireText(release, "Clear prohibited signing inputs", "release.yml does not clear signing inputs");
requireText(release, '--to squirrel', "release.yml does not select Squirrel as its only Windows package target");
requireText(release, "$ErrorActionPreference = 'Continue'", "release.yml does not scope Windows PowerShell native stderr handling around tools-pack");
requireText(release, '$packExitCode = $LASTEXITCODE', "release.yml does not judge tools-pack by its native exit code");
forbid(release, /temporary dim-sum photo exception|temporarily skipped|temporarily-skipped/, "release.yml still carries a temporary dim-sum photo skip");
requireText(release, "grep -E '^(id|slug|name_en|name_zh|jyutping|codename|photo_url|alt_en|alt_yue|source|image|image_dish)='", "release.yml does not capture id, image, and attached dish output from the committed picker");
requireText(release, 'dim-sum-id: ${DIM_SUM_ID}', "release.yml does not persist the machine-readable dim-sum id in release notes");
requireText(release, "release publication blocked: the mandatory downloadable dim-sum photo cannot be satisfied", "release.yml does not fail closed on the unresolved public-photo requirement");
forbid(release, /release-photo-\$\{DIM_SUM_IMAGE_DISH\}|cp -- \"\$IMAGE_PATH\"/, "release.yml still stages the prohibited grandfathered image");
forbid(release, /DIM_SUM_IMAGE_DISH|DIM_SUM_IMAGE|DIM_SUM_ASSET/, "release.yml still exposes legacy bundled-photo staging variables");
forbid(release, /codename-\$\{DIM_SUM_ID\}\.png/, "release.yml names an independent bundled photo as though it were the code-name dish");
requireText(release, 'installer-build.log', "release.yml does not preserve or verify the successful installer build log");
requireText(release, 'buildLog = [ordered]@{ path = "installer-build.log"; sha256 = $stagedBuildLogHash }', "build provenance does not use the staged relative installer log path");
requireText(release, '$sanitizedLines = @(', "release.yml does not build an allowlisted public packaging log");
forbid(release, /raw_build_log_path=|Write-Host \("\[tools-pack\]"/, "release.yml exposes a raw tools-pack transcript in logs or run artifacts");
requireText(release, '$forbiddenLogPattern =', "release.yml does not define a public-log path and secret rejection pattern");
requireText(release, 'if (($sanitizedLines -join', "release.yml does not reject unsafe content before publishing the sanitized log");
const bashPath = process.platform === "win32"
  ? join(process.env.ProgramFiles ?? "C:\\Program Files", "Git", "bin", "bash.exe")
  : "bash";
const stageProbe = [
  "set -euo pipefail",
  ': "${DIM_SUM_IMAGE_DISH:?}"',
  'asset_name="release-photo-${DIM_SUM_IMAGE_DISH}.png"',
  'printf "asset_name=%s\\n" "$asset_name"',
].join("\n");
const stageGood = spawnSync(bashPath, ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", stageProbe], {
  cwd: root,
  encoding: "utf8",
  env: { ...process.env, DIM_SUM_IMAGE_DISH: "hk-dish-0271-sweet-and-sour-pork-with-pineapple" },
});
if (stageGood.status !== 0 || stageGood.stdout.trim() !== "asset_name=release-photo-hk-dish-0271-sweet-and-sour-pork-with-pineapple.png") {
  failures.push("release-photo stage boundary did not execute DIM_SUM_IMAGE_DISH correctly");
}
const stageBad = spawnSync(bashPath, ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", stageProbe], {
  cwd: root,
  encoding: "utf8",
  env: { ...process.env, IMAGE_DISH: "hk-dish-0271-sweet-and-sour-pork-with-pineapple" },
});
if (stageBad.status === 0) {
  failures.push("release-photo stage boundary accepted IMAGE_DISH instead of DIM_SUM_IMAGE_DISH");
}

// Prove the three new release-photo assertions are real guards. Each exact
// mutation must turn the contract red, so a renamed or removed line cannot
// leave a decorative check behind.
const dimSumContractNeedles = [
  { needle: 'dim-sum-id: ${DIM_SUM_ID}', label: "dim-sum id persistence" },
  { needle: "grep -E '^(id|slug|name_en|name_zh|jyutping|codename|photo_url|alt_en|alt_yue|source|image|image_dish)='", label: "image output capture" },
  { needle: "release publication blocked: the mandatory downloadable dim-sum photo cannot be satisfied", label: "public-photo blocker" },
];
const missingDimSumAssertions = (source) => dimSumContractNeedles
  .filter(({ needle }) => !source.includes(needle))
  .map(({ label }) => label);
if (missingDimSumAssertions(release).length > 0) {
  failures.push("release.yml dim-sum contract assertions are incomplete");
}
for (const { needle, label } of dimSumContractNeedles) {
  const mutated = release.replace(needle, "");
  if (mutated === release || missingDimSumAssertions(mutated).length === 0) {
    failures.push(`release.yml red/green mutation did not catch missing ${label}`);
  }
}
const publicLogSafetyNeedles = [
  { needle: '$forbiddenLogPattern =', label: "public-log safety pattern" },
  { needle: 'A-Za-z]:', label: "absolute path rejection" },
  { needle: 'token|secret|password|credential|authorization|api[_-]?key', label: "secret marker rejection" },
  { needle: 'if (($sanitizedLines -join', label: "sanitized log validation" },
];
const missingPublicLogSafetyAssertions = (source) => publicLogSafetyNeedles
  .filter(({ needle }) => !source.includes(needle))
  .map(({ label }) => label);
if (missingPublicLogSafetyAssertions(release).length > 0) {
  failures.push("release.yml public installer-log safety assertions are incomplete");
}
for (const { needle, label } of publicLogSafetyNeedles) {
  const mutated = release.replace(needle, "");
  if (mutated === release || missingPublicLogSafetyAssertions(mutated).length === 0) {
    failures.push(`release.yml red/green mutation did not catch missing ${label}`);
  }
}
const artifactPathNeedles = [
  { needle: 'function Resolve-ArtifactRelativeFile', label: "relative provenance resolver" },
  { needle: '[IO.Path]::IsPathRooted($RelativePath)', label: "absolute provenance path rejection" },
  { needle: "$RelativePath -match '(^|[\\\\/])\\.\\.([\\\\/]|$)'", label: "traversal provenance path rejection" },
  { needle: '$candidate.StartsWith($rootWithSeparator', label: "provenance root containment" },
  { needle: "Resolve-ArtifactRelativeFile ([string]$provenance.buildLog.path)", label: "artifact-relative provenance resolution" },
];
const missingArtifactPathAssertions = (source) => artifactPathNeedles
  .filter(({ needle }) => !source.includes(needle))
  .map(({ label }) => label);
if (missingArtifactPathAssertions(artifactVerifier).length > 0) {
  failures.push("verify-squirrel-artifacts.ps1 provenance path assertions are incomplete");
}
for (const { needle, label } of artifactPathNeedles) {
  const mutated = artifactVerifier.replace(needle, "");
  if (mutated === artifactVerifier || missingArtifactPathAssertions(mutated).length === 0) {
    failures.push(`verify-squirrel-artifacts.ps1 red/green mutation did not catch missing ${label}`);
  }
}
requireText(artifactPathRegression, "New-Item -ItemType SymbolicLink", "the path regression does not attempt a real temporary symbolic link");
requireText(artifactPathRegression, "reparse proof unavailable", "the path regression does not report when reparse proof is unavailable");
requireText(artifactPathRegression, "verify-squirrel-artifacts.ps1", "the path regression does not execute the artifact verifier");
const pathRegression = process.platform === "win32"
  ? spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(root, "scripts", "test-verify-squirrel-artifacts-path.ps1")], { cwd: root, encoding: "utf8" })
  : { status: 0, stdout: "Path safety regression skipped: non-Windows host." };
const reparseProofVerified = /Path safety regression passed: reparse traversal rejected\./.test(pathRegression.stdout);
const reparseProofUnavailable = /Path safety regression passed: lexical traversal rejected; reparse proof unavailable\./.test(pathRegression.stdout);
const reparseProofSkipped = process.platform !== "win32" && /Path safety regression skipped: non-Windows host\./.test(pathRegression.stdout);
if (pathRegression.status !== 0 || (!reparseProofVerified && !reparseProofUnavailable && !reparseProofSkipped)) {
  failures.push("the temporary reparse-point path regression did not complete honestly");
}
requireText(release, '[IO.File]::WriteAllText(', "release.yml does not use an exact cross-shell checksum writer");
requireText(release, '"$hash  $assetName`n"', "release.yml does not terminate the checksum with an explicit LF");
requireText(release, '[Text.UTF8Encoding]::new($false)', "release.yml does not keep the checksum BOM-free");
requireText(release, "branches:\n      - '**'", "release.yml still dispatches recursively on release-tag pushes");
forbid(release, /release publication is blocked: the standing contract requires a downloadable dim-sum photo/, "release.yml still blocks publication on the temporarily skipped photo contract");
forbid(release, /Set-Content[^\n]*assetName\.sha256/, "release.yml writes the checksum through platform-native line endings");
forbid(release, /portableZipPath|win-x64-portable\.zip|--to all/, "release.yml still publishes or requests a portable/aggregate Windows package");
requireText(release, "shell: powershell", "release.yml does not use the Windows PowerShell shell available on the hosted runner");
requireText(release, "$env:SQUIRREL_TEMP", "release.yml does not keep Squirrel's extraction temp root short");
forbid(release, /\bpwsh\b/, "release.yml invokes pwsh instead of its declared Windows PowerShell host");
requireText(release, "CSC_IDENTITY_AUTO_DISCOVERY=false", "release.yml does not disable certificate discovery");
requireText(release, "$signature.Status -ne 'NotSigned'", "release.yml does not verify an unsigned Setup.exe");
requireText(release, "signed = $false", "release metadata does not declare unsigned artifacts");
forbid(release, /builtAt\s*=|\.builtAt\s*=/, "release workflow still writes host-clock builtAt provenance");
requireText(release, "$provenance.updatedAt = $env:OD_BUILD_UPDATED_AT", "release provenance does not use the externally supplied updatedAt value");
requireText(release, "WORKFLOW_STARTED_AT", "release notes do not receive the workflow start timestamp");
requireText(release, "Workflow duration", "release notes do not publish workflow timing");
requireText(release, "gh release edit", "release notes are not finalized after publication");
requireText(release, "id: unsigned", "release.yml does not expose the unsigned-output verdict to publication");
requireText(release, "id: artifact_contract", "release.yml does not expose the complete-artifact verdict to publication");
requireText(release, "steps.unsigned.outcome == 'success'", "release.yml can publish without a successful unsigned-output check");
requireText(release, "steps.artifact_contract.outcome == 'success'", "release.yml can publish without a successful complete-artifact check");
requireText(release, '-MetadataFile "metadata.json"', "release.yml does not validate the updater metadata with the package set");
requireText(release, '-IconFile "material-designer.ico"', "release.yml does not validate the packaged icon with the package set");
requireText(release, "-RequireSignerAudit", "release.yml does not require signer observation in the shared validator");
requireText(release, "signer-audit.ready", "release.yml does not wait for the independent signer observer before packaging");
requireExact(release, '$packagingEvidence = Join-Path $runnerTemp ("squirrel-packaging-evidence-$env:GITHUB_RUN_ID-$env:GITHUB_RUN_ATTEMPT")', "release.yml does not create one run-scoped packaging evidence directory");
forbid(release, /Write-Host \("\[tools-pack\]"|buildLogWriter|Copy-Item -LiteralPath \$buildLogPath/, "release.yml still exposes or stores a raw tools-pack transcript");
requireText(release, 'ForEach-Object { [string]$_ }', "release.yml does not capture tools-pack JSON without publishing its transcript");
requireText(release, '$buildOutput -join', "release.yml does not parse captured tools-pack output in memory");
requireText(release, '[Text.UTF8Encoding]::new($false)', "release.yml does not define BOM-free encoding for sanitized diagnostics");
requireExact(release, 'phase = "squirrel-packaging"', "release.yml failure evidence does not identify the packaging phase");
requireText(release, "schemaVersion = 1", "release.yml failure evidence has no versioned schema");
requireText(release, 'error = "squirrel-packaging-failed"', "release.yml failure evidence does not preserve a safe failure classification");
requireText(release, "buildLog = [ordered]@{", "release.yml failure evidence does not bind the log hash and byte length");
requireText(release, "Save-PackagingFailureEvidence -ErrorMessage", "release.yml does not preserve evidence before rethrowing the packaging failure");
requireText(release, "squirrel-packaging-evidence-${{ github.run_id }}-${{ github.run_attempt }}", "release.yml evidence upload does not include the deterministic runner-temp evidence path");
requireText(release, "(Join-Path $env:RUNNER_TEMP \"squirrel-packaging-evidence-${{ github.run_id }}-${{ github.run_attempt }}\")", "release.yml cleanup does not include the exact run-scoped packaging evidence directory");
forbid(release, /steps\.pack\.outputs\.packaging_evidence/, "release.yml duplicates the deterministic packaging evidence path through an uncertain step output");
forbid(release, /^\s+(?:pnpm(?:\.cmd)?\s+.*\b(?:test|lint|typecheck)|npm\s+.*\btest)\b/gm, "release.yml runs a prohibited test, lint, or type-check command");

forbid(release, /^\s+--signed\b/m, "release.yml still requests a signed package");
forbid(release, /\$\{\{\s*secrets\.(?:WIN_SIGN|OD_WIN_SIGN)/, "release.yml still reads signing secrets");
forbid(release, /Authenticode-signed/, "release.yml still claims the installer is signed");
forbid(builder, /forceCodeSigning:\s*config\.signed/, "Windows builder still derives signing from config.signed");
forbid(builder, /signAndVerifyWinFile|certificateSha1|rfc3161TimeStampServer/, "Windows builder still contains an active signer input or call");
requireText(builder, "forceCodeSigning: false", "Windows builder does not hard-disable code signing");
requireText(builder, "signAndEditExecutable: false", "Windows builder does not disable electron-builder signing and resource editing");
requireText(builder, 'signExts: ["!exe"]', "Windows Squirrel builder does not exclude executable signing calls");
requireText(builder, 'CSC_IDENTITY_AUTO_DISCOVERY: "false"', "Windows builder does not disable certificate discovery");

if (failures.length > 0) {
  console.error("Release contract failures:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Release contract passed: ${workflowPaths.length} workflows, unsigned Windows packaging, hosted bootstrap coverage, dim-sum and public-log red/green mutation checks, and provenance path safety verified.`);
