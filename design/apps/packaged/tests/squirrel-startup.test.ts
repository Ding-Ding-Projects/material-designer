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
  });
});
