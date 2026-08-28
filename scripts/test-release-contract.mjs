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
const pages = await text(".github/workflows/pages.yml");
const codename = await text("scripts/release-codename.sh");
const site = await text("site/index.html");
const builder = await text("design/tools/pack/src/win/builder.ts");
const pythonBootstrap = await text("scripts/bootstrap-python.ps1");

requireText(release, "scripts/bootstrap-python.ps1", "release.yml does not bootstrap Python 3.12 automatically");
forbid(release, /actions\/setup-python@v5/, "release.yml still invokes the policy-blocked setup-python action");
requireText(pythonBootstrap, "python-3.12.10-embed-amd64.zip", "Python bootstrap does not use the pinned official embeddable archive");
requireText(pythonBootstrap, "www.python.org/ftp/python/3.12.10", "Python bootstrap does not use the canonical Python source");
requireText(pythonBootstrap, "Expand-Archive", "Python bootstrap does not extract the portable Python archive");
requireText(pythonBootstrap, "loads no setup script", "Python bootstrap does not document its policy-safe archive path");
requireText(release, "ilammy/msvc-dev-cmd@v1", "release.yml does not activate the Windows C++ toolchain");
requireText(release, "Clear prohibited signing inputs", "release.yml does not clear signing inputs");
requireText(release, '--to squirrel', "release.yml does not select Squirrel as its only Windows package target");
requireText(release, "$ErrorActionPreference = 'Continue'", "release.yml does not scope Windows PowerShell native stderr handling around tools-pack");
requireText(release, '$packExitCode = $LASTEXITCODE', "release.yml does not judge tools-pack by its native exit code");
requireText(release, 'cat "$raw" >> "$GITHUB_OUTPUT"', "release.yml does not forward every code-name output");
requireText(release, 'id: dim_sum_contract', "release.yml does not expose the required catalog-image Chut");
requireText(release, 'CATALOG_IMAGE: ${{ steps.codename.outputs.image }}', "release.yml does not wire the image output");
requireText(release, 'CATALOG_IMAGE_DISH: ${{ steps.codename.outputs.image_dish }}', "release.yml does not wire the image_dish output");
requireText(release, 'curl -fsSL --max-time 60 "$CATALOG_IMAGE_URL" -o "$photo_path"', "release.yml does not download the selected published image");
requireText(release, 'png_magic=$(od -An -tx1 -N8 "$photo_path"', "release.yml does not verify the PNG signature");
requireText(release, 'sha256sum "$photo_path"', "release.yml does not hash the selected image");
requireText(release, 'FromStream($stream, $true, $true)', "release.yml does not decode the selected image");
requireText(release, 'grep -Fqx "$TAG"', "release.yml does not reject duplicate release tags");
requireText(release, '<!-- dim-sum-id: ${CODE_NAME_ID} -->', "release.yml does not record the stable spent dish id");
requireText(release, '<!-- dim-sum-image-asset: ${CATALOG_IMAGE_ASSET} -->', "release.yml does not record the attached image asset");
requireText(release, '<!-- dim-sum-image-sha256: ${CATALOG_IMAGE_SHA256} -->', "release.yml does not record the attached image hash");
requireText(release, "steps.codename.outcome == 'success'", "release.yml can publish without successful code-name selection");
requireText(release, "steps.dim_sum_contract.outcome == 'success'", "release.yml can publish without a verified catalog image");
forbid(release, /temporary dim-sum photo exception|status=temporarily-skipped|temporarily skipped by the repository owner/, "release.yml still contains a temporary photo-exception success path");
requireText(release, '[IO.File]::WriteAllText(', "release.yml does not use an exact cross-shell checksum writer");
requireText(release, '"$hash  $assetName`n"', "release.yml does not terminate the checksum with an explicit LF");
requireText(release, '[Text.UTF8Encoding]::new($false)', "release.yml does not keep the checksum BOM-free");
requireText(release, "branches:\n      - '**'", "release.yml still dispatches recursively on release-tag pushes");
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
requireText(release, "node scripts/line-count.mjs", "release.yml does not invoke the committed line counter");
requireText(release, 'test -s "$out"', "release.yml does not reject an empty line-count output");
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

requireText(codename, "source=unavailable", "release-codename.sh has no honest unavailable result");
requireText(codename, 'grep -Fqx "$id" "$tmp/used.txt"', "release-codename.sh does not exclude spent dish ids");
requireText(codename, 'startswith("catalog-v1")', "release-codename.sh does not restrict photo assets to catalog-v1 releases");
requireText(codename, '.isDraft == false', "release-codename.sh can select a draft catalog asset");
requireText(codename, '.isPrerelease == false', "release-codename.sh can select a prerelease catalog asset");
requireText(codename, "printf 'image=", "release-codename.sh does not emit image");
requireText(codename, "printf 'image_dish=", "release-codename.sh does not emit image_dish");
requireText(codename, "printf 'image_bytes=", "release-codename.sh does not emit image_bytes");
requireText(codename, "printf 'image_content_type=", "release-codename.sh does not emit image_content_type");
forbid(codename, /bundled_index|assets\/dim-sum\/images/, "release-codename.sh still falls back to consumer-repository images");

requireText(pages, "Wait for the current successful release", "pages.yml does not wait for the current release run");
requireText(pages, 'gh run list --repo "$GITHUB_REPOSITORY" --workflow release.yml --commit "$expected_sha"', "pages.yml does not resolve the release run for the checked-out SHA");
requireText(pages, 'gh run view "$RELEASE_RUN_ID"', "pages.yml does not independently verify the selected release run");
requireText(pages, "expected exactly one published release", "pages.yml does not reject duplicate current releases");
requireText(pages, "release-commit:", "pages.yml does not read the release commit marker");
requireText(pages, "dim-sum-image-asset:", "pages.yml does not read the image-asset marker");
requireText(pages, "dim-sum-image-sha256:", "pages.yml does not read the image hash marker");
requireText(pages, "set_field image", "pages.yml does not maintain the current image field");
forbid(pages, /keeping the checked-in page facts|newest published release has no Windows installer/, "pages.yml can silently deploy stale checked-in release facts");
requireText(site, "data-release=\"image\"", "site/index.html does not expose the current image asset");
requireText(site, "data-release=\"image-sha\"", "site/index.html does not expose the image hash");
requireText(site, "data-release-href=\"image\"", "site/index.html does not expose the current image link");

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
