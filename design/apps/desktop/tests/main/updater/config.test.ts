import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DESKTOP_UPDATE_CHANNELS, SIDECAR_SOURCES } from "@open-design/sidecar-proto";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_STABLE_METADATA_URL,
  DESKTOP_UPDATE_ENV,
  resolveDesktopUpdaterConfig,
} from "../../../src/main/updater/config.js";

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), "od-updater-config-test-"));
}

describe("desktop updater config", () => {
  it("defaults counted beta internal builds to the beta update channel", () => {
    const root = makeRoot();
    try {
      const config = resolveDesktopUpdaterConfig({
        currentVersion: "1.2.3-beta-internal.4",
        downloadRoot: root,
        env: {
          [DESKTOP_UPDATE_ENV.ENABLED]: "1",
        },
        source: SIDECAR_SOURCES.PACKAGED,
      });

      expect(config.channel).toBe(DESKTOP_UPDATE_CHANNELS.BETA);
      expect(config.metadataUrl).toContain("/beta/latest/metadata.json");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("rejects a zero recurring update interval", () => {
    const root = makeRoot();
    try {
      expect(() =>
        resolveDesktopUpdaterConfig({
          currentVersion: "1.2.3-beta.4",
          downloadRoot: root,
          env: {
            [DESKTOP_UPDATE_ENV.CHECK_INTERVAL_MS]: "0",
            [DESKTOP_UPDATE_ENV.ENABLED]: "1",
          },
          source: SIDECAR_SOURCES.PACKAGED,
        }),
      ).toThrow(`${DESKTOP_UPDATE_ENV.CHECK_INTERVAL_MS} must be greater than 0 milliseconds`);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("defaults prerelease builds to the prerelease update channel", () => {
    const root = makeRoot();
    try {
      const config = resolveDesktopUpdaterConfig({
        currentVersion: "1.2.3-prerelease.4",
        downloadRoot: root,
        env: {
          [DESKTOP_UPDATE_ENV.ENABLED]: "1",
        },
        source: SIDECAR_SOURCES.PACKAGED,
      });

      expect(config.channel).toBe(DESKTOP_UPDATE_CHANNELS.PRERELEASE);
      expect(config.metadataUrl).toContain("/prerelease/latest/metadata.json");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("defaults preview builds to the preview update channel", () => {
    const root = makeRoot();
    try {
      const config = resolveDesktopUpdaterConfig({
        currentVersion: "1.2.3-preview.4",
        downloadRoot: root,
        env: {
          [DESKTOP_UPDATE_ENV.ENABLED]: "1",
        },
        source: SIDECAR_SOURCES.PACKAGED,
      });

      expect(config.channel).toBe("preview");
      expect(config.metadataUrl).toContain("/preview/latest/metadata.json");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("defaults packaged stable Windows builds to this project's own feed", () => {
    const root = makeRoot();
    try {
      const config = resolveDesktopUpdaterConfig({
        currentVersion: "1.2.3",
        downloadRoot: root,
        env: {
          [DESKTOP_UPDATE_ENV.PLATFORM]: "win32",
        },
        source: SIDECAR_SOURCES.PACKAGED,
      });

      expect(config.enabled).toBe(true);
      expect(config.autoCheck).toBe(true);
      expect(config.autoDownload).toBe(true);
      expect(config.autoOpen).toBe(false);
      expect(DEFAULT_STABLE_METADATA_URL).toBe(
        "https://github.com/Ding-Ding-Projects/material-designer/releases/latest/download/metadata.json",
      );
      expect(config.metadataUrl).toBe(DEFAULT_STABLE_METADATA_URL);
      expect(config.metadataUrl).not.toContain("open-design.ai");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("keeps non-stable packaged defaults inert and product-owned", () => {
    const root = makeRoot();
    try {
      for (const [currentVersion, platform] of [
        ["1.2.3-beta.4", "win32"],
        ["1.2.3-prerelease.4", "win32"],
        ["1.2.3-preview.4", "win32"],
        ["1.2.3", "darwin"],
      ]) {
        const config = resolveDesktopUpdaterConfig({
          currentVersion,
          downloadRoot: root,
          env: {
            [DESKTOP_UPDATE_ENV.PLATFORM]: platform,
          },
          source: SIDECAR_SOURCES.PACKAGED,
        });

        expect(config.enabled).toBe(false);
        expect(config.autoCheck).toBe(false);
        expect(new URL(config.metadataUrl).hostname.endsWith(".invalid")).toBe(true);
        expect(config.metadataUrl).not.toContain("open-design.ai");
      }
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("enables a packaged build that was packed against an explicit feed", () => {
    const root = makeRoot();
    try {
      const config = resolveDesktopUpdaterConfig({
        currentVersion: "1.2.3",
        downloadRoot: root,
        env: {
          [DESKTOP_UPDATE_ENV.METADATA_URL]: "https://updates.example.com/stable/latest/metadata.json",
        },
        source: SIDECAR_SOURCES.PACKAGED,
      });

      expect(config.enabled).toBe(true);
      expect(config.autoCheck).toBe(true);
      expect(config.metadataUrl).toBe("https://updates.example.com/stable/latest/metadata.json");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("leaves an unpackaged build disabled even when a feed is configured", () => {
    const root = makeRoot();
    try {
      const config = resolveDesktopUpdaterConfig({
        currentVersion: "1.2.3",
        downloadRoot: root,
        env: {
          [DESKTOP_UPDATE_ENV.METADATA_URL]: "https://updates.example.com/stable/latest/metadata.json",
        },
        source: SIDECAR_SOURCES.TOOLS_DEV,
      });

      expect(config.enabled).toBe(false);
      expect(config.autoCheck).toBe(false);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
