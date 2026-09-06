import { describe, expect, it } from "vitest";

import { createWinPackagedAppCacheKey } from "../src/win/app.js";
import { resolveToolPackConfig } from "../src/config.js";

describe("Windows packaged provenance cache", () => {
  it("changes the packaged cache identity for each provenance decision", async () => {
    const original = {
      OD_BUILD_SOURCE_COMMIT: process.env.OD_BUILD_SOURCE_COMMIT,
      OD_BUILD_UPDATED_AT: process.env.OD_BUILD_UPDATED_AT,
      OD_BUILD_VERSION: process.env.OD_BUILD_VERSION,
    };
    try {
      process.env.OD_BUILD_VERSION = "1.2.3";
      process.env.OD_BUILD_SOURCE_COMMIT = "a".repeat(40);
      process.env.OD_BUILD_UPDATED_AT = "2026-09-06T20:00:00Z";
      const verified = resolveToolPackConfig("win", { appVersion: "1.2.3", namespace: "provenance-test" });
      const verifiedKey = await createWinPackagedAppCacheKey(verified, "tarballs", []);
      process.env.OD_BUILD_UPDATED_AT = "2026-09-06T20:00:01Z";
      const changedTimestamp = resolveToolPackConfig("win", { appVersion: "1.2.3", namespace: "provenance-test" });
      expect(await createWinPackagedAppCacheKey(changedTimestamp, "tarballs", [])).not.toBe(verifiedKey);
      delete process.env.OD_BUILD_SOURCE_COMMIT;
      delete process.env.OD_BUILD_UPDATED_AT;
      delete process.env.OD_BUILD_VERSION;
      const unavailable = resolveToolPackConfig("win", { appVersion: "1.2.3", namespace: "provenance-test" });
      expect(await createWinPackagedAppCacheKey(unavailable, "tarballs", [])).not.toBe(verifiedKey);
    } finally {
      for (const [name, value] of Object.entries(original)) {
        if (value == null) delete process.env[name]; else process.env[name] = value;
      }
    }
  });
});
