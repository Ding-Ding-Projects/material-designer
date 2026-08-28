import { readFile } from "node:fs/promises";
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

requireText(release, "scripts/bootstrap-python.ps1", "release.yml does not bootstrap Python 3.12 automatically");
forbid(release, /actions\/setup-python@v5/, "release.yml still invokes the policy-blocked setup-python action");
requireText(pythonBootstrap, "python-3.12.10-embed-amd64.zip", "Python bootstrap does not use the pinned official embeddable archive");
requireText(pythonBootstrap, "www.python.org/ftp/python/3.12.10", "Python bootstrap does not use the canonical Python source");
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
requireText(release, 'dim-sum photo attachment temporarily skipped by current owner direction', "release.yml does not record the temporary owner-authorized photo exception");
requireText(release, 'status=temporarily-skipped', "release.yml does not expose the temporary photo-exception status");
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
requireExact(release, 'Write-Host ("[tools-pack] " + $line)', "release.yml does not stream safe tools-pack diagnostics into the job log");
requireExact(release, '$utf8NoBom = [Text.UTF8Encoding]::new($false)', "release.yml does not define a BOM-free encoding for failure diagnostics");
requireExact(release, '$buildLogWriter = [IO.StreamWriter]::new($buildLogPath, $false, $utf8NoBom)', "release.yml does not use a PowerShell 5.1-compatible UTF-8 log writer");
requireExact(release, '$buildLogWriter.WriteLine($line)', "release.yml does not append each streamed tools-pack line to the build log");
requireExact(release, '$buildLogWriter.Flush()', "release.yml does not flush each streamed tools-pack line before a failure can throw");
requireExact(release, '$buildLogWriter.Dispose()', "release.yml does not close the build log before copying failure evidence");
requireExact(release, 'Copy-Item -LiteralPath $buildLogPath -Destination $stableBuildLogPath -Force', "release.yml does not copy the immutable build log before reporting a packaging failure");
requireExact(release, 'phase = "squirrel-packaging"', "release.yml failure evidence does not identify the packaging phase");
requireText(release, "schemaVersion = 1", "release.yml failure evidence has no versioned schema");
requireText(release, "error = $ErrorMessage", "release.yml failure evidence does not preserve the safe failure message");
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

console.log(`Release contract passed: ${workflowPaths.length} workflows, unsigned Windows packaging, and hosted bootstrap coverage verified.`);
