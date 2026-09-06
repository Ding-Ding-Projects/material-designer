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
const tagPattern = /^v\d+\.\d+\.\d+-r\d+\.\d+$/;
const photoUrlPattern = /^https:\/\/github\.com\/Ding-Ding-Projects\/dim-sum-photos\/releases\/download\/catalog-v1[^/]+\/[^/]+\.png$/;

function receiptIsExact(receipt, tag) {
  return receipt && receipt.schemaVersion === 1
    && receipt.sourceCommit === sourceCommit
    && receipt.releaseTag === tag
    && receipt.appVersion === appVersion
    && sha.test(receipt.sourceCommit)
    && iso.test(receipt.workflowStartedAt)
    && Number.isInteger(receipt.runId) && receipt.runId > 0
    && Number.isInteger(receipt.runAttempt) && receipt.runAttempt > 0
    && Number.isInteger(receipt.workflowId) && receipt.workflowId > 0
    && receipt.workflowFile === ".github/workflows/release.yml"
    && ["push", "workflow_dispatch"].includes(receipt.event)
    && typeof receipt.actor === "string" && receipt.actor.length > 0
    && typeof receipt.publisherLogin === "string"
    && (receipt.publisherLogin === "pending" || /^[A-Za-z0-9_.\[\]-]+$/.test(receipt.publisherLogin))
    && Array.isArray(receipt.requiredAssets)
    && receipt.requiredAssets.length >= 8
    && new Set(receipt.requiredAssets.map((asset) => asset && asset.name)).size === receipt.requiredAssets.length
    && receipt.requiredAssets.every((asset) => asset && typeof asset.name === "string" && asset.name.length > 0
      && (asset.name === "release-publication-receipt.json"
        ? asset.size === null && asset.sha256 === null
        : Number.isInteger(asset.size) && asset.size > 0 && typeof asset.sha256 === "string" && /^[0-9a-f]{64}$/i.test(asset.sha256)))
    && typeof receipt.installerName === "string" && receipt.installerName.length > 0
    && typeof receipt.installerSha256 === "string" && /^[0-9a-f]{64}$/i.test(receipt.installerSha256)
    && typeof receipt.dishId === "string" && /^[a-z0-9-]+$/.test(receipt.dishId)
    && typeof receipt.codename === "string" && receipt.codename.length > 0
    && typeof receipt.photoUrl === "string" && photoUrlPattern.test(receipt.photoUrl)
    && typeof receipt.photoName === "string" && receipt.photoName.length > 0
    && receipt.photoName === `codename-${receipt.dishId}.png`
    && typeof receipt.photoSha256 === "string" && /^[0-9a-f]{64}$/i.test(receipt.photoSha256)
    && Number.isInteger(receipt.photoBytes) && receipt.photoBytes > 0
    && receipt.requiredAssets.some((asset) => asset?.name === receipt.installerName)
    && receipt.requiredAssets.some((asset) => asset?.name === receipt.photoName)
    && receipt.requiredAssets.some((asset) => asset?.name === "release-publication-receipt.json");
}

function manualReceiptIsExact(receipt, tag) {
  const provenance = receipt?.externalProvenance;
  return receipt && receipt.schemaVersion === 1 && receipt.publisherKind === 'manual'
    && !['runId', 'runAttempt', 'workflowId', 'workflowFile', 'workflowStartedAt', 'workflowCompletedAt', 'workflowDuration', 'event', 'actor'].some((field) => Object.hasOwn(receipt, field))
    && tag === expectedTag && receipt.releaseTag === tag
    && receipt.sourceCommit === sourceCommit && receipt.appVersion === appVersion && sha.test(sourceCommit)
    && Number.isSafeInteger(receipt.releaseId) && receipt.releaseId > 0
    && iso.test(receipt.releaseCreatedAt) && Number.isFinite(Date.parse(receipt.releaseCreatedAt))
    && ['draft', 'published'].includes(receipt.publicationStatus)
    && /^[A-Za-z0-9_.\[\]-]+$/.test(receipt.publisherLogin)
    && /^(?:[a-f0-9]{32}|<!-- material-designer-manual-reservation:[a-f0-9]{32} -->)$/.test(receipt.reservationMarker)
    && provenance && Object.keys(provenance).sort().join(',') === 'schemaVersion,sourceCommit,updatedAt,version'
    && provenance.schemaVersion === 1 && provenance.sourceCommit === sourceCommit && provenance.version === appVersion && provenance.updatedAt === receipt.releaseCreatedAt
    && Array.isArray(receipt.requiredAssets) && receipt.requiredAssets.length >= 10
    && new Set(receipt.requiredAssets.map((asset) => asset?.name)).size === receipt.requiredAssets.length
    && receipt.requiredAssets.every((asset) => asset && /^[A-Za-z0-9._-]+$/.test(asset.name)
      && (asset.name === 'release-publication-receipt.json' ? asset.size === null && asset.sha256 === null
        : Number.isSafeInteger(asset.size) && asset.size > 0 && /^[a-f0-9]{64}$/.test(asset.sha256)))
    && receipt.requiredAssets.some((asset) => asset.name === receipt.installerName && asset.sha256 === receipt.installerSha256)
    && ['RELEASES', 'metadata.json', 'build-evidence.json', 'build-provenance.json', 'artifact-receipt.json', 'installer-build.log', 'release-publication-receipt.json'].every((name) => receipt.requiredAssets.some((asset) => asset.name === name))
    && receipt.requiredAssets.some((asset) => /-full\.nupkg$/.test(asset.name))
    && receipt.photoDelivery === 'canonical-link-only'
    && /^hk-dish-\d{4}$/.test(receipt.dishId) && receipt.photoName.startsWith(`${receipt.dishId}-`)
    && /^https:\/\/github\.com\/Ding-Ding-Projects\/dim-sum-photos\/releases\/download\/catalog-v1[^/]*\/[a-z0-9-]+\.png$/.test(receipt.photoUrl)
    && receipt.photoUrl.endsWith(`/${receipt.photoName}`) && /^[a-f0-9]{64}$/.test(receipt.photoSha256)
    && Number.isSafeInteger(receipt.photoBytes) && receipt.photoBytes > 0
    && !receipt.requiredAssets.some((asset) => asset.name === receipt.photoName || asset.name.startsWith('codename-'));
}

function manualOwnershipIsExact(candidate, receipt) {
  return candidate.releaseOwnership === true && candidate.releaseId === receipt.releaseId
    && candidate.releaseCreatedAt === receipt.releaseCreatedAt && candidate.releaseAuthor === receipt.publisherLogin
    && typeof candidate.body === 'string' && candidate.body.includes(receipt.reservationMarker);
}

function manualDownloadsAreExact(candidate, receipt) {
  const proof = candidate.downloadVerification;
  if (!proof || proof.schemaVersion !== 1 || proof.sourceCommit !== sourceCommit || proof.releaseId !== receipt.releaseId
      || proof.tag !== receipt.releaseTag || proof.reservationMarker !== receipt.reservationMarker
      || proof.publishedAt !== candidate.published_at || !iso.test(proof.publishedAt)
      || !Array.isArray(proof.assets) || proof.assets.length !== receipt.requiredAssets.length
      || new Set(proof.assets.map((asset) => asset?.name)).size !== proof.assets.length
      || candidate.assets?.length !== proof.assets.length || hasUnexpectedAssets(candidate, receipt)) return false;
  return receipt.requiredAssets.every((expected) => {
    const downloaded = proof.assets.find((asset) => asset.name === expected.name);
    const actual = candidate.assets.find((asset) => asset.name === expected.name);
    return downloaded && actual && Number.isSafeInteger(downloaded.size) && downloaded.size > 0
      && /^[a-f0-9]{64}$/.test(downloaded.sha256) && downloaded.size === actual.size
      && (expected.size === null || (expected.size === downloaded.size && expected.sha256 === downloaded.sha256))
      && (!actual.digest || actual.digest.replace(/^sha256:/, '') === downloaded.sha256);
  }) && candidate.body.includes(`Built from \`${sourceCommit}\``)
    && candidate.body.includes(receipt.photoUrl) && candidate.body.includes(receipt.photoSha256)
    && candidate.body.includes(`dim-sum-id: ${receipt.dishId}`);
}

function hasAssets(candidate, receipt) {
  const actual = candidate.assets ?? [];
  const expected = receipt.requiredAssets;
  const names = actual.map((asset) => asset.name);
  if (actual.length !== expected.length || new Set(names).size !== actual.length) return false;
  if (new Set(expected.map((asset) => asset.name)).size !== expected.length) return false;
  for (const record of expected) {
    const matches = actual.filter((asset) => asset.name === record.name);
    if (matches.length !== 1 || !Number.isInteger(matches[0].size) || matches[0].size <= 0) return false;
    if (Number.isInteger(record.size) && matches[0].size !== record.size) return false;
    if (typeof record.sha256 === "string") {
      const digest = String(matches[0].digest ?? "").replace(/^sha256:/i, "");
      if (!/^[0-9a-f]{64}$/i.test(digest) || digest.toLowerCase() !== record.sha256.toLowerCase()) return false;
    } else if (record.name !== "release-publication-receipt.json") {
      return false;
    }
  }
  const installer = actual.find((asset) => asset.name === receipt.installerName);
  const photo = actual.find((asset) => asset.name === receipt.photoName);
  return expected.some((record) => /-full\.nupkg$/i.test(record.name))
    && installer?.digest?.replace(/^sha256:/i, "").toLowerCase() === receipt.installerSha256.toLowerCase()
    && photo?.digest?.replace(/^sha256:/i, "").toLowerCase() === receipt.photoSha256.toLowerCase()
    && photo?.size === receipt.photoBytes;
}

function hasUnexpectedAssets(candidate, receipt) {
  const actual = candidate.assets ?? [];
  const expectedNames = new Set(receipt.requiredAssets.map((record) => record.name));
  const names = actual.map((asset) => asset.name);
  return new Set(names).size !== names.length || names.some((name) => !expectedNames.has(name));
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

function workflowEvidenceIsExact(candidate, receipt) {
  const evidence = candidate.workflowEvidence;
  if (!receipt || !evidence || evidence.runId !== receipt.runId || evidence.workflowId !== receipt.workflowId
    || evidence.workflowFile !== receipt.workflowFile || evidence.headSha !== receipt.sourceCommit
    || evidence.runAttempt !== receipt.runAttempt || evidence.event !== receipt.event
    || evidence.actor !== receipt.actor || evidence.startedAt !== receipt.workflowStartedAt
    || !iso.test(evidence.startedAt) || !iso.test(evidence.createdAt)
    || !iso.test(evidence.updatedAt) || evidence.createdAt < evidence.startedAt
    || (evidence.publishedAt && (!iso.test(evidence.publishedAt) || evidence.publishedAt > evidence.updatedAt))) return false;
  return true;
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
const manualReceipt = candidate.manualReceipt;
if (manualReceiptIsExact(manualReceipt, candidate.tag_name) && manualOwnershipIsExact(candidate, manualReceipt)) {
  if (candidate.draft === true && manualReceipt.publicationStatus === "draft" && !hasUnexpectedAssets(candidate, manualReceipt)) {
    console.log(JSON.stringify({ kind: "recover-draft", tag: candidate.tag_name, ...manualReceipt }));
    process.exit(0);
  }
  if (candidate.draft === false && manualDownloadsAreExact(candidate, manualReceipt)) {
    console.log(JSON.stringify({ kind: "complete", tag: candidate.tag_name, ...manualReceipt }));
    process.exit(0);
  }
  console.log(JSON.stringify({ kind: "ambiguous", tag: candidate.tag_name, reason: "manual receipt state is inconsistent" }));
  process.exit(0);
}
const receipt = candidate.receipt;
if (typeof candidate.tag_name !== "string" || candidate.tag_name.length === 0
  || typeof candidate.targetCommit !== "string" || !sha.test(candidate.targetCommit)
  || !tagPattern.test(candidate.tag_name)
  || typeof candidate.draft !== "boolean" || candidate.prerelease !== false
  || candidate.workflowOwnership !== true
  || candidate.releaseOwnership !== true
  || !receipt || (receipt.publisherLogin !== "pending" && candidate.releaseAuthor !== receipt.publisherLogin)
  || !workflowEvidenceIsExact(candidate, receipt)
  || !receiptIsExact(receipt, candidate.tag_name)) {
  console.log(JSON.stringify({ kind: "ambiguous", tag: candidate.tag_name, reason: "same-source release has no exact workflow receipt" }));
  process.exit(0);
}

if (candidate.draft === false && receipt.publicationStatus === "published"
  && receipt.publisherLogin !== "pending"
  && iso.test(receipt.workflowCompletedAt ?? "")
  && duration.test(receipt.workflowDuration ?? "")
  && hasAssets(candidate, receipt)
  && hasCompleteNotes(candidate, receipt)) {
  console.log(JSON.stringify({ kind: "complete", tag: candidate.tag_name, ...receipt }));
  process.exit(0);
}

if (candidate.draft === true && receipt.publicationStatus === "draft"
  && !receipt.workflowCompletedAt && !receipt.workflowDuration
  && !hasUnexpectedAssets(candidate, receipt)) {
  console.log(JSON.stringify({ kind: "recover-draft", tag: candidate.tag_name, ...receipt, publisherLogin: candidate.releaseAuthor }));
  process.exit(0);
}

if (candidate.draft === false && (receipt.publicationStatus === "published" || receipt.publicationStatus === "draft")) {
  const completedAt = iso.test(receipt.workflowCompletedAt ?? "")
    ? receipt.workflowCompletedAt
    : (iso.test(candidate.published_at ?? "") ? candidate.published_at : null);
  const completedDuration = duration.test(receipt.workflowDuration ?? "")
    ? receipt.workflowDuration
    : (completedAt ? durationBetween(receipt.workflowStartedAt, completedAt) : null);
  if (completedAt && completedDuration && !hasUnexpectedAssets(candidate, receipt)) {
    console.log(JSON.stringify({ kind: "recover-published", tag: candidate.tag_name, ...receipt, publisherLogin: candidate.releaseAuthor,
      workflowCompletedAt: completedAt, workflowDuration: completedDuration, publicationStatus: "published" }));
    process.exit(0);
  }
}

console.log(JSON.stringify({ kind: "ambiguous", tag: candidate.tag_name, reason: "workflow receipt state is inconsistent" }));
