import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const workflowPaths = [
  ".github/workflows/pages.yml",
  ".github/workflows/release.yml",
  ".github/workflows/verify.yml",
];

const text = async (relativePath) => readFile(join(root, relativePath), "utf8");
const failures = [];

function activeSource(source) {
  return source
    .split(/\r\n|\n|\r/)
    .filter((line) => !/^\s*(?:#|\/\/)/.test(line))
    .join("\n");
}

function requireText(source, needle, message) {
  if (!activeSource(source).includes(needle)) failures.push(message);
}

function requireExact(source, needle, message) {
  const active = activeSource(source);
  const occurrences = active.split(needle).length - 1;
  if (occurrences !== 1) failures.push(`${message} (expected exactly once, found ${occurrences})`);
}

function forbid(source, pattern, message) {
  if (pattern.test(activeSource(source))) failures.push(message);
}

function requireActiveLine(source, pattern, message) {
  const count = activeSource(source).split("\n").filter((line) => pattern.test(line)).length;
  if (count !== 1) failures.push(`${message} (expected exactly one active line, found ${count})`);
}

function requireOrder(source, needles, message) {
  const active = activeSource(source);
  const positions = needles.map((needle) => active.indexOf(needle));
  if (positions.some((position) => position < 0) || positions.some((position, index) => index > 0 && position <= positions[index - 1])) {
    failures.push(message);
  }
}

const workflows = await Promise.all(workflowPaths.map(async (path) => [path, await text(path)]));
const workflowFiles = (await readdir(join(root, ".github/workflows")))
  .filter((path) => /\.(?:yml|yaml)$/i.test(path))
  .map((path) => `.github/workflows/${path}`)
  .sort();
const expectedWorkflowFiles = [...workflowPaths].sort();
if (workflowFiles.join("|") !== expectedWorkflowFiles.join("|")) {
  failures.push(`root workflow inventory drifted (expected ${expectedWorkflowFiles.join(", ")}, found ${workflowFiles.join(", ")})`);
}
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
const pages = await text(".github/workflows/pages.yml");
const buildBat = await text("build.bat");
const installerBat = await text("build-installer.bat");
const dependencyFetcher = await text("download-dependencies.bat");
const dependencyScript = await text("scripts/download-dependencies.ps1");
const dependencyManifest = await text("scripts/download-dependencies.manifest.json");
const dependencyManifestTest = await text("scripts/test-download-dependencies-manifest.ps1");
const buildScript = await text("scripts/build.ps1");
const codename = await text("scripts/release-codename.sh");
const imageValidator = await text("scripts/validate-dim-sum-image.ps1");

requireText(release, "scripts/bootstrap-python.ps1", "release.yml does not bootstrap Python 3.12 automatically");
forbid(release, /actions\/setup-python@v5/, "release.yml still invokes the policy-blocked setup-python action");
requireText(pythonBootstrap, "download-dependencies.manifest.json", "Python bootstrap does not consume the pinned dependency manifest");
requireText(pythonBootstrap, "id -eq 'python'", "Python bootstrap does not select the exact manifest record");
requireText(pythonBootstrap, "Expand-Archive", "Python bootstrap does not extract the portable Python archive");
const pagesTrigger = pages.slice(pages.indexOf("on:"), pages.indexOf("permissions:"));
forbid(pagesTrigger, /^\s+release:/m, "pages.yml still triggers from published release events");
requireText(buildBat, 'call "%SCRIPT_DIR%download-dependencies.bat" /s', "build.bat does not invoke the silent dependency fetcher");
requireText(installerBat, 'call "%SCRIPT_DIR%download-dependencies.bat" /s', "build-installer.bat does not invoke the silent dependency fetcher");
requireText(dependencyFetcher, "scripts\\download-dependencies.ps1", "download-dependencies.bat does not invoke the pinned implementation");
requireText(dependencyScript, "download-dependencies.manifest.json", "dependency fetcher does not load its pinned manifest");
requireText(dependencyManifest, '"id": "nodejs"', "dependency manifest does not pin the Node.js record id");
requireText(dependencyManifest, '"version": "24.20.0"', "dependency manifest does not pin Node.js v24.20.0");
requireText(dependencyManifest, "6cac9ffbca8f6a47091e4b5c772e0606049c3871cb67d900c0cedde630e545ba", "dependency manifest does not record the Node.js archive digest");
requireText(dependencyManifest, '"id": "pnpm"', "dependency manifest does not pin the pnpm record id");
requireText(dependencyManifest, '"version": "10.33.2"', "dependency manifest does not pin pnpm 10.33.2");
requireText(dependencyManifest, '"integrity": "sha512-qQ+vb+6rca1sblf5Tg/hoS9dzCLNdU20CulZPraj4LaxLjVAIYuzeuCDQEsfLObbKkEh6XmCm0r/lLmfSdoc+A=="', "dependency manifest does not record pnpm integrity");
requireText(dependencyManifest, '"id": "python"', "dependency manifest does not pin the Python record id");
requireText(dependencyManifest, "4acbed6dd1c744b0376e3b1cf57ce906f9dc9e95e68824584c8099a63025a3c3", "dependency manifest does not record the Python archive digest");
requireText(dependencyManifest, '"id": "Microsoft.VisualStudio.2022.BuildTools"', "dependency manifest does not pin the C++ bootstrapper id");
requireText(dependencyManifest, '"version": "17.14.39"', "dependency manifest does not pin the C++ bootstrapper version");
requireText(dependencyManifest, "236367b68ba9a51708263ab10a1c85546cc4a8eca78b365168811d19c4fb2f29", "dependency manifest does not record the C++ bootstrapper digest");
requireText(dependencyScript, "the dependency manifest does not contain the exact required record names", "dependency fetcher does not validate exact record identities");
requireText(dependencyScript, "$ValidateOnly", "dependency fetcher has no validation-only route for its exact manifest check");
requireText(dependencyManifestTest, "Node version", "dependency manifest red-green coverage is missing the Node version case");
requireText(dependencyManifestTest, "C++ bootstrapper id", "dependency manifest red-green coverage is missing the C++ id case");
requireText(dependencyManifestTest, "Node digest", "dependency manifest red-green coverage is missing the Node digest case");
forbid(dependencyScript, /winget/i, "dependency fetcher still permits unmanifested Winget acquisition");
forbid(buildScript, /indexResponse|index\.json|winget/i, "build script still permits dynamic or unmanifested dependency acquisition");
requireText(buildScript, "Get-DependencyRecord 'Node.js'", "build script does not consume the exact Node.js manifest record");
requireText(buildScript, "Node.js $expectedVersion", "build script does not enforce the exact Node.js version");
requireText(buildScript, "Get-DependencyRecord 'Microsoft C++ build tools'", "build script does not consume the exact C++ manifest record");
forbid(buildScript, /indexResponse|index\.json|winget/i, "build script still permits dynamic or unmanifested dependency acquisition");
requireActiveLine(release, /^\s+node-version:\s*24\.20\.0\s*$/, "release.yml does not pin Node.js to the manifest version");
forbid(release, /^\s+node-version:\s*24\s*$/m, "release.yml still uses a broad Node.js version");
requireText(codename, "--require-published", "code-name picker lacks its required published-photo mode");
requireText(codename, "gh api --paginate", "code-name picker does not read published catalog release assets");
requireText(codename, "sha256sum", "code-name picker does not hash downloaded catalog photos");
requireText(codename, "89504e470d0a1a0a", "code-name picker does not validate PNG signatures");
requireText(codename, 'grep -Fxq "$id" "$tmp/used.txt"', "code-name picker does not reject reused dish ids");
requireText(imageValidator, "FromStream", "catalog photo validator does not decode the image payload");
requireText(imageValidator, "ExpectedSha256", "catalog photo validator does not verify the published digest");
requireText(release, "ilammy/msvc-dev-cmd@v1", "release.yml does not activate the Windows C++ toolchain");
requireText(release, "Clear prohibited signing inputs", "release.yml does not clear signing inputs");
requireText(release, '--to squirrel', "release.yml does not select Squirrel as its only Windows package target");
requireText(release, "$ErrorActionPreference = 'Continue'", "release.yml does not scope Windows PowerShell native stderr handling around tools-pack");
requireText(release, '$packExitCode = $LASTEXITCODE', "release.yml does not judge tools-pack by its native exit code");
requireText(release, '--require-published', "release.yml does not require a published public catalog photo");
requireText(release, 'validate-dim-sum-image.ps1', "release.yml does not decode and hash the public catalog photo");
requireText(release, 'DISH_PHOTO_NAME', "release.yml does not stage a dish-bound catalog photo");
requireText(release, 'DISH_PHOTO_SHA', "release.yml does not preserve the public catalog digest");
requireText(release, 'gh release download "$TAG" --repo "$GITHUB_REPOSITORY" --pattern "$DISH_PHOTO_NAME"', "release.yml does not download the attached photo after publication");
requireText(release, 'EXPECTED_WORKFLOW_COMPLETED', "release.yml does not bind timing verification to post-publication output");
requireText(release, 'gh release edit "$TAG" --repo "$GITHUB_REPOSITORY" --draft=false --latest', "release.yml does not publish the draft before capturing completion timing");
requireOrder(release, [
  'gh release create "$TAG"',
  'gh release edit "$TAG" --repo "$GITHUB_REPOSITORY" --draft=false --latest',
  'workflow_completed_at=$(date -u',
  'gh release edit "$TAG" --repo "$GITHUB_REPOSITORY" --notes-file "$notes" --draft=false --latest',
], "release.yml does not capture completion timing after draft publication and before final notes update");
requireText(release, 'published_releases=$(gh api --paginate', "release.yml does not inspect every release before publication");
requireText(release, 'existing_count=0', "release.yml does not count matching published release targets");
requireText(release, 'resolve_tag_commit()', "release.yml does not resolve annotated and lightweight release tags");
requireText(release, 'refusing duplicate publication', "release.yml does not refuse duplicate publication for a source commit");
requireText(release, 'codename-photo-${{ github.run_id }}-${{ github.run_attempt }}', "release.yml does not clean the run-scoped catalog-photo directory");
requireText(release, '[IO.File]::WriteAllText(', "release.yml does not use an exact cross-shell checksum writer");
requireText(release, '"$hash  $assetName`n"', "release.yml does not terminate the checksum with an explicit LF");
requireText(release, '[Text.UTF8Encoding]::new($false)', "release.yml does not keep the checksum BOM-free");
requireText(release, "branches:\n      - '**'", "release.yml still dispatches recursively on release-tag pushes");
forbid(release, /temporarily skipped|temporarily-skipped|temporary dim-sum photo exception/, "release.yml still carries the temporary photo exception");
forbid(release, /Set-Content[^\n]*assetName\.sha256/, "release.yml writes the checksum through platform-native line endings");
forbid(release, /portableZipPath|win-x64-portable\.zip|--to all/, "release.yml still publishes or requests a portable/aggregate Windows package");
requireText(release, "shell: powershell", "release.yml does not use the Windows PowerShell shell available on the hosted runner");
requireText(release, "$env:SQUIRREL_TEMP", "release.yml does not keep Squirrel's extraction temp root short");
forbid(release, /\bpwsh\b/, "release.yml invokes pwsh instead of its declared Windows PowerShell host");
requireText(release, "CSC_IDENTITY_AUTO_DISCOVERY=false", "release.yml does not disable certificate discovery");
requireText(release, "$signature.Status -ne 'NotSigned'", "release.yml does not verify an unsigned Setup.exe");
requireText(release, "signed = $false", "release metadata does not declare unsigned artifacts");
requireText(release, "WORKFLOW_STARTED_AT", "release notes do not receive the workflow start timestamp");
requireText(release, "Workflow duration", "release notes do not publish workflow timing");
requireText(release, "gh release edit", "release notes are not finalized after publication");
requireText(release, "id: unsigned", "release.yml does not expose the unsigned-output verdict to publication");
requireText(release, "id: artifact_contract", "release.yml does not expose the complete-artifact verdict to publication");
requireText(release, "steps.unsigned.outcome == 'success'", "release.yml can publish without a successful unsigned-output check");
requireText(release, "steps.artifact_contract.outcome == 'success'", "release.yml can publish without a successful complete-artifact check");
requireText(release, '-MetadataFile "metadata.json"', "release.yml does not validate the updater metadata with the package set");
requireText(release, '-IconFile "material-designer.ico"', "release.yml does not validate the packaged icon with the package set");
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
requireActiveLine(builder, /^\s*forceCodeSigning:\s*false,\s*$/, "Windows builder does not hard-disable code signing");
requireActiveLine(builder, /^\s*signAndEditExecutable:\s*false,\s*$/, "Windows builder does not disable electron-builder signing and resource editing");
requireActiveLine(builder, /^\s*signExts:\s*\["!exe"\],\s*$/, "Windows Squirrel builder does not exclude executable signing calls");
requireActiveLine(builder, /^\s*CSC_IDENTITY_AUTO_DISCOVERY:\s*"false",\s*$/, "Windows builder does not disable certificate discovery");

if (failures.length > 0) {
  console.error("Release contract failures:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Release contract passed: ${workflowPaths.length} workflows, unsigned Windows packaging, and hosted bootstrap coverage verified.`);
