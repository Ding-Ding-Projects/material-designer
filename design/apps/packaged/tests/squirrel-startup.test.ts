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
    expect(source).toContain("app.exit(0)");
    expect(source).not.toContain("app.quit()");
    expect(source).toContain("detached: true");
    expect(source).toContain("updater.unref()");
    expect(source).toContain("updater.once(\"error\", () => undefined)");
    expect(source).not.toContain("updater.once(\"close\", quit)");
  });
});
