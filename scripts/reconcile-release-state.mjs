import { readFile } from "node:fs/promises";

const [statePath, sourceCommit, appVersion, expectedTag] = process.argv.slice(2);
if (!statePath || !sourceCommit || !appVersion || !expectedTag) {
  console.error("usage: reconcile-release-state.mjs STATE SOURCE_COMMIT APP_VERSION EXPECTED_TAG");
  process.exit(2);
}

const state = JSON.parse(await readFile(statePath, "utf8"));
if (!Array.isArray(state)) throw new Error("release state is not an array");

const sha = /^[0-9a-f]{40}$/i;
const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const duration = /^\d{2}:\d{2}:\d{2}$/;

function receiptIsExact(receipt, tag) {
  return receipt && receipt.schemaVersion === 1
    && receipt.sourceCommit === sourceCommit
    && receipt.releaseTag === tag
    && receipt.appVersion === appVersion
    && sha.test(receipt.sourceCommit)
    && iso.test(receipt.workflowStartedAt)
    && typeof receipt.runId === "string" && receipt.runId.length > 0
    && typeof receipt.runAttempt === "string" && receipt.runAttempt.length > 0
    && Array.isArray(receipt.requiredAssets)
    && receipt.requiredAssets.length >= 8
    && typeof receipt.installerName === "string" && receipt.installerName.length > 0
    && typeof receipt.installerSha256 === "string" && /^[0-9a-f]{64}$/i.test(receipt.installerSha256)
    && typeof receipt.photoName === "string" && receipt.photoName.length > 0
    && typeof receipt.photoSha256 === "string" && /^[0-9a-f]{64}$/i.test(receipt.photoSha256)
    && Number.isInteger(receipt.photoBytes) && receipt.photoBytes > 0;
}

function hasAssets(candidate, receipt) {
  const names = new Set((candidate.assets ?? []).map((asset) => asset.name));
  return receipt.requiredAssets.every((name) => names.has(name))
    && [...names].some((name) => /-full\.nupkg$/i.test(name));
}

function hasCompleteNotes(candidate, receipt) {
  const body = typeof candidate.body === "string" ? candidate.body : "";
  return body.includes(`Built from \`${sourceCommit}\``)
    && body.includes(`dim-sum-id: ${receipt.dishId}`)
    && body.includes(`Public catalog photo SHA-256: ${receipt.photoSha256}`)
    && body.includes(`Workflow started: ${receipt.workflowStartedAt}`)
    && iso.test(receipt.workflowCompletedAt ?? "")
    && duration.test(receipt.workflowDuration ?? "")
    && body.includes(`Workflow completed: ${receipt.workflowCompletedAt}`)
    && body.includes(`Workflow duration: ${receipt.workflowDuration}`);
}

function durationBetween(startText, endText) {
  const start = Date.parse(startText);
  const end = Date.parse(endText);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const seconds = Math.floor((end - start) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [hours, minutes, remainder].map((value) => String(value).padStart(2, "0")).join(":");
}

const candidates = state.filter((candidate) => candidate.targetCommit === sourceCommit && candidate.prerelease === false);
if (candidates.length === 0) {
  console.log(JSON.stringify({ kind: "new", tag: expectedTag }));
  process.exit(0);
}
if (candidates.length !== 1) {
  console.log(JSON.stringify({ kind: "ambiguous", reason: "multiple releases target the same source commit" }));
  process.exit(0);
}

const candidate = candidates[0];
const receipt = candidate.receipt;
if (typeof candidate.tag_name !== "string" || candidate.tag_name.length === 0
  || typeof candidate.targetCommit !== "string" || !sha.test(candidate.targetCommit)
  || typeof candidate.draft !== "boolean" || candidate.prerelease !== false
  || !receiptIsExact(receipt, candidate.tag_name)) {
  console.log(JSON.stringify({ kind: "ambiguous", tag: candidate.tag_name, reason: "same-source release has no exact workflow receipt" }));
  process.exit(0);
}

if (candidate.draft === false && receipt.publicationStatus === "published"
  && iso.test(receipt.workflowCompletedAt ?? "")
  && duration.test(receipt.workflowDuration ?? "")
  && hasAssets(candidate, receipt)
  && hasCompleteNotes(candidate, receipt)) {
  console.log(JSON.stringify({ kind: "complete", tag: candidate.tag_name, ...receipt }));
  process.exit(0);
}

if (candidate.draft === true && receipt.publicationStatus === "draft"
  && !receipt.workflowCompletedAt && !receipt.workflowDuration) {
  console.log(JSON.stringify({ kind: "recover-draft", tag: candidate.tag_name, ...receipt }));
  process.exit(0);
}

if (candidate.draft === false && (receipt.publicationStatus === "published" || receipt.publicationStatus === "draft")) {
  const completedAt = iso.test(receipt.workflowCompletedAt ?? "")
    ? receipt.workflowCompletedAt
    : (iso.test(candidate.published_at ?? "") ? candidate.published_at : null);
  const completedDuration = duration.test(receipt.workflowDuration ?? "")
    ? receipt.workflowDuration
    : (completedAt ? durationBetween(receipt.workflowStartedAt, completedAt) : null);
  if (completedAt && completedDuration) {
    console.log(JSON.stringify({ kind: "recover-published", tag: candidate.tag_name, ...receipt,
      workflowCompletedAt: completedAt, workflowDuration: completedDuration, publicationStatus: "published" }));
    process.exit(0);
  }
}

if (candidate.draft === false && receipt.publicationStatus === "published"
  && iso.test(receipt.workflowCompletedAt ?? "")
  && duration.test(receipt.workflowDuration ?? "")) {
  console.log(JSON.stringify({ kind: "recover-published", tag: candidate.tag_name, ...receipt }));
  process.exit(0);
}

console.log(JSON.stringify({ kind: "ambiguous", tag: candidate.tag_name, reason: "workflow receipt state is inconsistent" }));
