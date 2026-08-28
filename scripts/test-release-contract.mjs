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
requireText(release, 'id: dim_sum_contract', "release.yml does not expose the required catalog-image check");
requireText(release, 'CATALOG_IMAGE: ${{ steps.codename.outputs.image }}', "release.yml does not wire the image output");
requireText(release, 'CATALOG_IMAGE_DISH: ${{ steps.codename.outputs.image_dish }}', "release.yml does not wire the image_dish output");
requireText(release, 'case "$CATALOG_IMAGE" in "$CATALOG_IMAGE_DISH"-*.png)', "release.yml does not bind the image filename to the selected dish id");
requireText(release, 'expected_catalog_image_url="https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/${CATALOG_IMAGE_TAG}/${CATALOG_IMAGE}"', "release.yml does not derive the exact catalog image URL");
requireText(release, '[ "$CATALOG_IMAGE_URL" = "$expected_catalog_image_url" ]', "release.yml does not compare the exact catalog image URL");
requireText(release, "grep -Eq '^[1-9][0-9]{0,7}$'", "release.yml does not validate a numeric catalog image byte count");
requireText(release, 'CATALOG_IMAGE_BYTES" -le 16777216', "release.yml does not enforce the 16 MiB catalog image bound");
requireText(release, 'Verify public catalog image metadata without copying bytes', "release.yml does not verify catalog image metadata");
requireText(release, 'status=blocked-no-copy-policy', "release.yml does not expose the explicit no-copy policy block");
requireText(release, "printf 'asset_sha256=%s\\n' 'not-computed-no-copy'", "release.yml does not record that the no-copy image hash was not computed");
requireText(release, 'no copied image is attached', "release.yml does not state that no copied image is attached");
const dimSumStart = release.indexOf("id: dim_sum_contract");
const dimSumEnd = release.indexOf("- name:", dimSumStart + 1);
const dimSumBlock = dimSumStart >= 0 && dimSumEnd > dimSumStart ? release.slice(dimSumStart, dimSumEnd) : "";
forbid(dimSumBlock, /curl -fsSL|Invoke-WebRequest|gh release download|sha256sum|FromStream|PHOTO_PATH/, "release.yml no-copy image check transfers or decodes photo bytes before its policy block");
requireText(release, 'grep -Fqx "$TAG"', "release.yml does not reject duplicate release tags");
requireText(release, 'group: material-designer-release-publisher', "release.yml does not serialize publication project-wide");
requireText(release, 'gh api --paginate "repos/$GITHUB_REPOSITORY/releases?per_page=100"', "release.yml does not paginate prior releases to exhaustion");
requireText(release, 'if ! gh release view "$tag" --repo "$GITHUB_REPOSITORY" --json body --jq', "release.yml does not fail closed on a prior release-body read");
requireText(release, 'expected_keys=$(printf', "release.yml does not validate the selector output protocol");
requireText(release, 'the code-name selector emitted a control character', "release.yml does not reject control characters in selector output");
requireText(release, 'gh release create "$TAG" --repo "$GITHUB_REPOSITORY" --target "$GITHUB_SHA"', "release.yml does not use the provider create call as the atomic claim");
requireText(release, 'gh release edit "$TAG" --repo "$GITHUB_REPOSITORY" --draft=false --latest', "release.yml does not publish before measuring final timing");
requireText(release, '<!-- release-package: open-design-packaged-app -->', "release.yml does not record the package marker");
requireText(release, '<!-- release-installer: ${ASSET_NAME} -->', "release.yml does not record the installer marker");
requireText(release, '<!-- dim-sum-id: ${CODE_NAME_ID} -->', "release.yml does not record the stable spent dish id");
requireText(release, '<!-- dim-sum-catalog-tag: ${CATALOG_IMAGE_TAG} -->', "release.yml does not record the catalog tag marker");
requireText(release, '<!-- dim-sum-image-source: ${DISH_PHOTO_URL} -->', "release.yml does not record the source URL marker");
requireText(release, '<!-- dim-sum-image-dish: ${CATALOG_IMAGE_DISH} -->', "release.yml does not record the image dish marker");
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
requireText(codename, '.draft == false', "release-codename.sh can select a draft catalog asset");
requireText(codename, '.prerelease == false', "release-codename.sh can select a prerelease catalog asset");
requireText(codename, 'gh api --paginate "repos/$public_repo/releases?per_page=100"', "release-codename.sh does not paginate public catalog releases to exhaustion");
requireText(codename, 'catalog release listing failed', "release-codename.sh does not fail closed on catalog release listing");
requireText(codename, 'published catalog asset read failed for $tag', "release-codename.sh does not fail closed on catalog asset reads");
requireText(codename, 'catalog_bytes=$(wc -c < "$tmp/public.json"', "release-codename.sh does not bound catalog input size");
requireText(codename, 'published catalog asset metadata is outside its safety bounds', "release-codename.sh does not bound public asset metadata");
requireText(codename, 'test("^hk-dish-[0-9]{4}$")', "release-codename.sh does not validate bounded dish ids");
requireText(codename, 'test("^images/hk-dish-[0-9]{4}-[a-z0-9-]+\\.png$")', "release-codename.sh does not validate bounded image paths");
requireText(codename, "printf 'image=", "release-codename.sh does not emit image");
requireText(codename, "printf 'image_dish=", "release-codename.sh does not emit image_dish");
requireText(codename, "printf 'image_bytes=", "release-codename.sh does not emit image_bytes");
requireText(codename, "printf 'image_content_type=", "release-codename.sh does not emit image_content_type");
forbid(codename, /bundled_index|assets\/dim-sum\/images/, "release-codename.sh still falls back to consumer-repository images");

requireText(pages, "Wait for the current successful release", "pages.yml does not wait for the current release run");
requireText(pages, "workflow_run:", "pages.yml does not listen for completed Release runs");
requireText(pages, "branches:\n      - main", "pages.yml push trigger is not limited to main");
requireText(pages, "workflows:\n      - Release", "pages.yml does not bind workflow_run to Release");
requireText(pages, "github.event.workflow_run.head_branch == 'main'", "pages.yml does not restrict workflow_run deployment to main");
requireText(pages, "github.event.workflow_run.conclusion == 'success'", "pages.yml does not require a successful Release workflow_run");
requireText(pages, "EXPECTED_RELEASE_SHA:", "pages.yml does not use the workflow_run head SHA for release binding");
requireText(pages, "ref: ${{ github.event_name == 'workflow_run' && github.event.workflow_run.head_sha || github.sha }}", "pages.yml does not check out the exact workflow_run head SHA");
requireText(pages, "set_front_attr()", "pages.yml does not safely mutate front-screen provenance attributes");
requireText(pages, "set_front_text()", "pages.yml does not safely mutate front-screen provenance text");
requireText(pages, "github.ref == 'refs/heads/main'", "pages.yml allows a non-main environment ref to deploy");
requireText(pages, 'gh run list --repo "$GITHUB_REPOSITORY" --workflow release.yml --commit "$expected_sha"', "pages.yml does not resolve the release run for the checked-out SHA");
requireText(pages, 'gh run view "$RELEASE_RUN_ID"', "pages.yml does not independently verify the selected release run");
requireText(pages, "expected exactly one published release", "pages.yml does not reject duplicate current releases");
requireText(pages, "marker_value release-commit", "pages.yml does not read the release commit marker");
requireText(pages, "marker_value release-tag", "pages.yml does not read the release tag marker");
requireText(pages, "marker_value release-version", "pages.yml does not read the release version marker");
requireText(pages, "marker_value release-package", "pages.yml does not read the package marker");
requireText(pages, "marker_value release-installer", "pages.yml does not read the installer marker");
requireText(pages, "marker_value dim-sum-image-asset", "pages.yml does not read the image-asset marker");
requireText(pages, "marker_value dim-sum-image-sha256", "pages.yml does not read the image hash marker");
requireText(pages, "marker_value dim-sum-catalog-tag", "pages.yml does not read the catalog tag marker");
requireText(pages, "marker_value dim-sum-image-source", "pages.yml does not read the source URL marker");
requireText(pages, "marker_value dim-sum-image-dish", "pages.yml does not read the image dish marker");
requireText(pages, "set_field image", "pages.yml does not maintain the current image field");
requireText(pages, "marker_value()", "pages.yml does not parse release markers through an exact helper");
requireText(pages, "site field $key must occur exactly once", "pages.yml does not reject duplicate release fields");
requireText(pages, "site link field $key must occur exactly once", "pages.yml does not reject duplicate release links");
requireText(pages, "site cell field $key must occur exactly once", "pages.yml does not reject duplicate release cells");
requireText(pages, "set_link()", "pages.yml does not use the safe link mutation parser");
requireText(pages, "set_cell_field()", "pages.yml does not use the safe cell mutation parser");
requireText(pages, "set_front_attr()", "pages.yml does not safely mutate front-screen provenance attributes");
requireText(pages, "set_front_text()", "pages.yml does not safely mutate front-screen provenance text");
requireText(pages, "front-screen provenance is malformed or not bound to the selected release", "pages.yml does not fail closed on malformed front-screen provenance");
requireText(pages, "FromStream($stream, $true, $true)", "pages.yml does not decode the published catalog image");
requireText(pages, 'gh api --paginate "repos/$GITHUB_REPOSITORY/releases?per_page=100"', "pages.yml does not paginate releases to exhaustion");
requireText(pages, 'published release body read failed for $tag', "pages.yml does not fail closed on a release-body read");
requireText(pages, 'expected_installer_url=', "pages.yml does not derive the selected installer URL from the resolved release");
requireText(pages, 'expected_checksum_url=', "pages.yml does not derive the selected checksum URL from the resolved release");
requireText(pages, '.platforms.win.artifacts.installer.url == $expected_installer_url', "pages.yml does not bind metadata to the exact selected installer URL");
requireText(pages, '.platforms.win.artifacts.installer.sha256Url == $expected_checksum_url', "pages.yml does not bind metadata to the exact selected checksum URL");
requireText(pages, 'image_magic=$(od -An -tx1 -N8', "pages.yml does not verify the published image signature");
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
