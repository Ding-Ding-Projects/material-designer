import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { ToolPackConfig } from "../src/config.js";
import { resolveMacInstallIdentity } from "../src/mac/identity.js";
import { resolveMacPaths } from "../src/mac/paths.js";

function makeConfig(root: string, namespace: string): ToolPackConfig {
  return {
    containerized: false,
    electronBuilderCliPath: "/x/electron-builder/cli.js",
    electronDistPath: "/x/electron/dist",
    electronVersion: "41.3.0",
    macCompression: "normal",
    namespace,
    platform: "mac",
    portable: true,
    removeData: false,
    removeLogs: false,
    removeProductUserData: false,
    removeSidecars: false,
    requireVelaCli: false,
    roots: {
      output: {
        appBuilderRoot: join(root, ".tmp", "tools-pack", "out", "mac", "namespaces", namespace, "builder"),
        namespaceRoot: join(root, ".tmp", "tools-pack", "out", "mac", "namespaces", namespace),
        platformRoot: join(root, ".tmp", "tools-pack", "out", "mac"),
        root: join(root, ".tmp", "tools-pack", "out"),
      },
      runtime: {
        namespaceBaseRoot: join(root, ".tmp", "tools-pack", "runtime", "mac", "namespaces"),
        namespaceRoot: join(root, ".tmp", "tools-pack", "runtime", "mac", "namespaces", namespace),
      },
      cacheRoot: join(root, ".tmp", "tools-pack", "cache"),
      toolPackRoot: join(root, ".tmp", "tools-pack"),
    },
    signed: false,
    silent: true,
    to: "dmg",
    webOutputMode: "standalone",
    workspaceRoot: root,
  };
}

describe("resolveMacInstallIdentity", () => {
  it("keeps stable builds on the canonical mac identity", () => {
    expect(resolveMacInstallIdentity(makeConfig("/work", "release-stable"))).toMatchObject({
      appId: "io.ding-ding.material-designer",
      installerTitle: "Material Designer",
      productName: "Material Designer",
      publicAppBundleName: "Material Designer.app",
      systemAppBundleName: "Material Designer.app",
    });
  });

  it("uses first-class beta app identity for beta release namespaces", () => {
    const config = makeConfig("/work", "release-beta");

    expect(resolveMacInstallIdentity(config)).toEqual({
      appId: "io.ding-ding.material-designer.beta",
      executableName: "Material Designer Beta",
      installerTitle: "Material Designer Beta",
      productName: "Material Designer Beta",
      publicAppBundleName: "Material Designer Beta.app",
      systemAppBundleName: "Material Designer Beta.app",
    });
    expect(resolveMacPaths(config).appPath).toMatch(/Material Designer Beta\.app$/);
  });

  it("uses first-class preview app identity for preview release namespaces", () => {
    const config = makeConfig("/work", "release-preview");

    expect(resolveMacInstallIdentity(config)).toEqual({
      appId: "io.ding-ding.material-designer.preview",
      executableName: "Material Designer Preview",
      installerTitle: "Material Designer Preview",
      productName: "Material Designer Preview",
      publicAppBundleName: "Material Designer Preview.app",
      systemAppBundleName: "Material Designer Preview.app",
    });
    expect(resolveMacPaths(config).appPath).toMatch(/Material Designer Preview\.app$/);
  });

  it("uses first-class prerelease app identity for prerelease release versions and namespaces", () => {
    const prereleaseVersionConfig = {
      ...makeConfig("/work", "release-stable"),
      appVersion: "0.8.0-prerelease.2",
    };
    const prereleaseNamespaceConfig = makeConfig("/work", "release-prerelease");

    expect(resolveMacInstallIdentity(prereleaseVersionConfig)).toEqual({
      appId: "io.ding-ding.material-designer.prerelease",
      executableName: "Material Designer Prerelease",
      installerTitle: "Material Designer Prerelease",
      productName: "Material Designer Prerelease",
      publicAppBundleName: "Material Designer Prerelease.app",
      systemAppBundleName: "Material Designer Prerelease.app",
    });
    expect(resolveMacPaths(prereleaseVersionConfig).appPath).toMatch(/Material Designer Prerelease\.app$/);
    expect(resolveMacInstallIdentity(prereleaseNamespaceConfig)).toMatchObject({
      productName: "Material Designer Prerelease",
      publicAppBundleName: "Material Designer Prerelease.app",
    });
  });
});
