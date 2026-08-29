import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { CONVERTER_ADAPTERS, adapterFor } from "./registry.js";
import type { ConverterAdapter, PackagedAdapterManifest, PackagedAdapterProof } from "./types.js";

const MAX_PROOF_BYTES = 64 * 1024 * 1024;

function resolveAllowlistedResource(resourcesRoot: string, resourcePath: string): string {
  if (isAbsolute(resourcePath) || resourcePath.includes("\0")) throw new Error("Packaged converter resources must use relative paths.");
  const root = resolve(resourcesRoot);
  const candidate = resolve(root, resourcePath);
  const remainder = relative(root, candidate);
  if (remainder === "" || remainder === ".." || remainder.startsWith(`..${sep}`) || isAbsolute(remainder)) throw new Error("Packaged converter resource is outside the allowlisted resource root.");
  return candidate;
}

async function createPackagedProof(resourcesRoot: string, manifest: PackagedAdapterManifest): Promise<PackagedAdapterProof> {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(manifest.adapterId) || !/^[A-Za-z0-9._-]{1,64}$/.test(manifest.version) || !/^[0-9a-f]{64}$/i.test(manifest.digest)) {
    throw new Error("Packaged converter provenance metadata is invalid.");
  }
  const resourcePath = resolveAllowlistedResource(resourcesRoot, manifest.path);
  const info = await stat(resourcePath);
  if (!info.isFile() || !Number.isSafeInteger(info.size) || info.size <= 0 || info.size > MAX_PROOF_BYTES) throw new Error("Packaged converter resource is missing or exceeds the proof bound.");
  const bytes = await readFile(resourcePath);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest.toLowerCase() !== manifest.digest.toLowerCase()) throw new Error("Packaged converter resource digest does not match release provenance.");
  return Object.freeze({
    kind: "packaged" as const,
    path: manifest.path,
    version: manifest.version,
    digest: digest.toLowerCase(),
  }) as PackagedAdapterProof;
}

/**
 * Main-process provenance factory. Renderer code receives only public adapter
 * metadata from the bridge and cannot construct the branded proof.
 */
export async function createProvenanceBoundAdapters(
  resourcesRoot: string,
  manifests: readonly PackagedAdapterManifest[],
): Promise<readonly ConverterAdapter[]> {
  const byId = new Map<string, PackagedAdapterManifest>();
  for (const manifest of manifests) {
    if (byId.has(manifest.adapterId)) throw new Error(`Duplicate packaged converter provenance for ${manifest.adapterId}.`);
    byId.set(manifest.adapterId, manifest);
  }
  const verified = await Promise.all(CONVERTER_ADAPTERS.map(async (adapter) => {
    const manifest = byId.get(adapter.id);
    if (!manifest || !adapter.convert || adapter.category === "documents-pdf") return adapter;
    const proof = await createPackagedProof(resourcesRoot, manifest);
    return {
      ...adapter,
      bundled: true,
      unavailableReason: undefined,
      capabilities: { ...adapter.capabilities, convert: true, preview: true, batch: true },
      packageProof: proof,
    };
  }));
  return verified;
}

export function publicAdapterMetadata(adapter: ConverterAdapter): Omit<ConverterAdapter, "packageProof" | "convert" | "validateOutput"> {
  const { packageProof: _packageProof, convert: _convert, validateOutput: _validateOutput, ...metadata } = adapter;
  return metadata;
}

export function sourceAdapterFor(id: string): ConverterAdapter | undefined {
  return adapterFor(id, CONVERTER_ADAPTERS);
}
