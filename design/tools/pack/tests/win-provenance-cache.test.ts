import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWinPackagedAppCacheKey } from "../src/win/app.js";
// This is the CLI's actual resolver import, not the parallel config/index.ts.
import { resolveToolPackConfig } from "../src/config.js";
import { writePackagedConfigFile } from "../src/win/manifest.js";
import { assertMaterializedUnpackedVersionConsistency } from "../src/win/builder.js";
vi.mock("../src/win/version-resource.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/win/version-resource.js")>();
  return { ...actual, readWinExecutableVersionSnapshot: vi.fn(async () => {
    const target = actual.resolveWinExecutableVersionTargets("1.2.3");
    return { fixedFileVersion: target.numericVersion, fixedProductVersion: target.productVersion, stringTables: [{ values: { FileVersion: target.fileVersion, ProductVersion: target.productVersion } }] };
  }) };
});
const fields = ["buildVersion", "buildSourceCommit", "buildUpdatedAt"] as const;
const expected = { buildVersion: "1.2.3", buildSourceCommit: "a".repeat(40), buildUpdatedAt: "2026-09-06T20:00:00Z" };
const roots: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
function resolve(available = true) {
  vi.stubEnv("OD_BUILD_VERSION", available ? expected.buildVersion : undefined);
  vi.stubEnv("OD_BUILD_SOURCE_COMMIT", available ? expected.buildSourceCommit : undefined);
  vi.stubEnv("OD_BUILD_UPDATED_AT", available ? expected.buildUpdatedAt : undefined);
  return resolveToolPackConfig("win", { appVersion: "1.2.3", namespace: "provenance-test" });
}
async function fixture(config = resolve()) {
  const root = await mkdtemp(join(tmpdir(), "win-provenance-")); roots.push(root);
  await mkdir(join(root, "resources", "app"), { recursive: true });
  await writeFile(join(root, "resources", "app", "package.json"), JSON.stringify({ version: "1.2.3" }));
  const path = join(root, "resources", "open-design-config.json");
  await writePackagedConfigFile(path, config, "1.2.3");
  return { root, path, config, manifest: JSON.parse(await readFile(path, "utf8")) as Record<string, unknown> };
}
describe("Windows provenance production chain", () => {
  it("writes all exact provenance values through the actual CLI resolver and manifest writer", async () => {
    const { manifest } = await fixture();
    expect(Object.fromEntries(fields.map((field) => [field, manifest[field]]))).toEqual(expected);
  });
  it.each(fields)("changes the packaged cache identity when %s changes", async (field) => {
    const config = resolve();
    const first = await createWinPackagedAppCacheKey(config, "tarballs", []);
    const changed = { ...config, [field]: field === "buildVersion" ? "1.2.4" : field === "buildSourceCommit" ? "b".repeat(40) : "2026-09-06T20:00:01Z" };
    expect(await createWinPackagedAppCacheKey(changed, "tarballs", [])).not.toBe(first);
  });
  it("changes cache identity for unavailable provenance without fabricating fields", async () => {
    const available = await createWinPackagedAppCacheKey(resolve(), "tarballs", []);
    const config = resolve(false);
    expect(await createWinPackagedAppCacheKey(config, "tarballs", [])).not.toBe(available);
    const { manifest } = await fixture(config);
    for (const field of fields) expect(Object.hasOwn(manifest, field)).toBe(false);
  });
  it("accepts the materialized production configuration with exact provenance", async () => {
    const { root, config } = await fixture();
    await expect(assertMaterializedUnpackedVersionConsistency(root, "1.2.3", config)).resolves.toBeUndefined();
  });
  for (const field of fields) {
    it(`rejects a materialized omission of ${field}`, async () => {
      const { root, path, config, manifest } = await fixture(); delete manifest[field];
      await writeFile(path, JSON.stringify(manifest));
      await expect(assertMaterializedUnpackedVersionConsistency(root, "1.2.3", config)).rejects.toThrow(`expected packaged config ${field}`);
    });
    it(`rejects a materialized stale ${field}`, async () => {
      const { root, path, config, manifest } = await fixture(); manifest[field] = "stale";
      await writeFile(path, JSON.stringify(manifest));
      await expect(assertMaterializedUnpackedVersionConsistency(root, "1.2.3", config)).rejects.toThrow(`expected packaged config ${field}`);
    });
  }
  it("accepts unavailable provenance but refuses cached values from another build", async () => {
    const { root, path, config, manifest } = await fixture(resolve(false));
    await expect(assertMaterializedUnpackedVersionConsistency(root, "1.2.3", config)).resolves.toBeUndefined();
    Object.assign(manifest, expected); await writeFile(path, JSON.stringify(manifest));
    await expect(assertMaterializedUnpackedVersionConsistency(root, "1.2.3", config)).rejects.toThrow("expected packaged config buildVersion");
  });
});
