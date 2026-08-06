import { describe, expect, it } from "vitest";

import {
  resolveElectronBuilderWinTargets,
  resolveWinTargets,
  shouldBuildWinNsisInstaller,
  shouldBuildWinPortableZip,
  shouldBuildWinSquirrelInstaller,
} from "../src/win/report.js";
import { resolveWinSquirrelArtifactName, resolveWinSquirrelSetupName } from "../src/win/paths.js";

describe("resolveWinTargets", () => {
  it("returns the full target set including the portable zip for `all`", () => {
    expect(resolveWinTargets("all")).toEqual(["dir", "squirrel", "zip"]);
  });

  it("returns only the requested single target", () => {
    expect(resolveWinTargets("dir")).toEqual(["dir"]);
    expect(resolveWinTargets("nsis")).toEqual(["nsis"]);
    expect(resolveWinTargets("squirrel")).toEqual(["squirrel"]);
    expect(resolveWinTargets("zip")).toEqual(["zip"]);
  });
});

describe("resolveElectronBuilderWinTargets", () => {
  it("hides the portable zip from electron-builder because it is built from the cached unpacked dir", () => {
    expect(resolveElectronBuilderWinTargets("zip")).toEqual(["dir"]);
    expect(resolveElectronBuilderWinTargets("all")).toEqual(["dir", "squirrel"]);
    expect(resolveElectronBuilderWinTargets("nsis")).toEqual(["nsis"]);
    expect(resolveElectronBuilderWinTargets("squirrel")).toEqual(["squirrel"]);
    expect(resolveElectronBuilderWinTargets("dir")).toEqual(["dir"]);
  });
});

describe("Squirrel artifact naming", () => {
  it("keeps the setup artifact path safe for Squirrel.Windows", () => {
    expect(resolveWinSquirrelSetupName("release beta/win")).toBe("Material-Designer-release-beta-win-Setup.exe");
    expect(resolveWinSquirrelArtifactName("release beta/win")).toBe("Material-Designer-release-beta-win-Setup.${ext}");
  });
});

describe("Windows installer and portable target predicates", () => {
  it("flags NSIS, Squirrel, and the portable zip independently", () => {
    expect(shouldBuildWinNsisInstaller("nsis")).toBe(true);
    expect(shouldBuildWinNsisInstaller("all")).toBe(false);
    expect(shouldBuildWinNsisInstaller("squirrel")).toBe(false);
    expect(shouldBuildWinNsisInstaller("zip")).toBe(false);
    expect(shouldBuildWinNsisInstaller("dir")).toBe(false);

    expect(shouldBuildWinSquirrelInstaller("squirrel")).toBe(true);
    expect(shouldBuildWinSquirrelInstaller("all")).toBe(true);
    expect(shouldBuildWinSquirrelInstaller("nsis")).toBe(false);
    expect(shouldBuildWinSquirrelInstaller("zip")).toBe(false);
    expect(shouldBuildWinSquirrelInstaller("dir")).toBe(false);

    expect(shouldBuildWinPortableZip("zip")).toBe(true);
    expect(shouldBuildWinPortableZip("all")).toBe(true);
    expect(shouldBuildWinPortableZip("nsis")).toBe(false);
    expect(shouldBuildWinPortableZip("dir")).toBe(false);
  });
});
