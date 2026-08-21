import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("Squirrel startup handoff", () => {
  it("handles lifecycle switches before normal packaged startup", async () => {
    const source = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");

    expect(source).toContain('"--squirrel-install"');
    expect(source).toContain('"--squirrel-updated"');
    expect(source).toContain('"--squirrel-uninstall"');
    expect(source).toContain('"--squirrel-obsolete"');
    expect(source).toContain("export function handleSquirrelStartupEvent");
    expect(source.indexOf("if (!handleSquirrelStartupEvent())")).toBeGreaterThan(source.indexOf("async function main"));
    expect(source.indexOf("if (!handleSquirrelStartupEvent())")).toBeGreaterThan(source.indexOf("function handleMainError"));
    expect(source).not.toContain("app.quit()");
    expect(source).toContain("export function reconcileSquirrelShortcuts");
    expect(source).toContain("Material Designer.lnk");
    expect(source).toContain("GitHub, Inc.\\\\Electron.lnk");
    expect(source).toContain("OD_SQUIRREL_ROOT_LAUNCHER");
    expect(source).toContain("spawnSync(");
    expect(source).toContain("app.exit(shortcutsReady ? 0 : 1)");
    expect(source).not.toContain('"--createShortcut"');
    expect(source).not.toContain('"--removeShortcut"');
  });
});
