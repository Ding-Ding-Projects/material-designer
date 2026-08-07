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

function forbid(source, pattern, message) {
  if (pattern.test(source)) failures.push(message);
}

const workflows = await Promise.all(workflowPaths.map(async (path) => [path, await text(path)]));
for (const [path, source] of workflows) {
  const runOnLines = source.match(/^\s+runs-on:\s*.+$/gm) ?? [];
  if (runOnLines.length === 0) failures.push(`${path} has no explicit runner label`);
  for (const line of runOnLines) {
    if (!line.includes("self-hosted") || !line.includes("material-designer")) {
      failures.push(`${path} has a job without self-hosted material-designer labels: ${line.trim()}`);
    }
    if (/(ubuntu|windows|macos)-latest/.test(line)) {
      failures.push(`${path} uses a GitHub-hosted runner label: ${line.trim()}`);
    }
  }
  requireText(source, "bootstrap-ci-tools", `${path} does not bootstrap its self-hosted dependencies`);
}

const release = await text(".github/workflows/release.yml");
const verify = await text(".github/workflows/verify.yml");
const builder = await text("design/tools/pack/src/win/builder.ts");
const inventory = await text("docs/build/self-hosted-dependencies.md");

requireText(release, "actions/setup-python@v5", "release.yml does not install Python 3.12 automatically");
requireText(release, "ilammy/msvc-dev-cmd@v1", "release.yml does not activate the Windows C++ toolchain");
requireText(release, "Clear prohibited signing inputs", "release.yml does not clear signing inputs");
requireText(release, "CSC_IDENTITY_AUTO_DISCOVERY=false", "release.yml does not disable certificate discovery");
requireText(release, "$signature.Status -ne 'NotSigned'", "release.yml does not verify an unsigned Setup.exe");
requireText(release, "signed = $false", "release metadata does not declare unsigned artifacts");
requireText(release, "WORKFLOW_STARTED_AT", "release notes do not receive the workflow start timestamp");
requireText(release, "Workflow duration", "release notes do not publish workflow timing");
requireText(release, "gh release edit", "release notes are not finalized after publication");
requireText(verify, "actions/setup-python@v5", "verify.yml test job does not install Python 3.12 automatically");
requireText(inventory, "Fresh-environment bootstrap proof", "dependency inventory lacks a fresh-environment proof");

forbid(release, /^\s+--signed\b/m, "release.yml still requests a signed package");
forbid(release, /\$\{\{\s*secrets\.(?:WIN_SIGN|OD_WIN_SIGN)/, "release.yml still reads signing secrets");
forbid(release, /Authenticode-signed/, "release.yml still claims the installer is signed");
forbid(builder, /forceCodeSigning:\s*config\.signed/, "Windows builder still derives signing from config.signed");
forbid(builder, /signAndVerifyWinFile|certificateSha1|rfc3161TimeStampServer/, "Windows builder still contains an active signer input or call");
requireText(builder, "forceCodeSigning: false", "Windows builder does not hard-disable code signing");
requireText(builder, 'CSC_IDENTITY_AUTO_DISCOVERY: "false"', "Windows builder does not disable certificate discovery");

if (failures.length > 0) {
  console.error("Release contract failures:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Release contract passed: ${workflowPaths.length} workflows, unsigned Windows packaging, and self-hosted bootstrap coverage verified.`);
