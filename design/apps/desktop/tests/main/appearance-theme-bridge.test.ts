import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import {
  parseDesktopAppearanceTheme,
} from "../../src/main/appearance-theme.js";

const runtimeSource = readFileSync(new URL("../../src/main/runtime.ts", import.meta.url), "utf8");
const preloadSource = readFileSync(new URL("../../src/main/preload.cts", import.meta.url), "utf8");

describe("desktop appearance theme bridge", () => {
  test("accepts System, Light, and Dark and rejects every other payload", () => {
    expect(parseDesktopAppearanceTheme("system")).toBe("system");
    expect(parseDesktopAppearanceTheme("light")).toBe("light");
    expect(parseDesktopAppearanceTheme("dark")).toBe("dark");
    expect(parseDesktopAppearanceTheme("sepia")).toBeNull();
    expect(parseDesktopAppearanceTheme({ theme: "dark" })).toBeNull();
    expect(parseDesktopAppearanceTheme(null)).toBeNull();
  });

  test("forwards the validated renderer value to nativeTheme without a startup override", () => {
    expect(preloadSource).toContain("ipcRenderer.invoke('od:appearance:set-theme', theme)");
    expect(preloadSource).toContain("Promise<OpenDesignHostActionResult>");
    expect(runtimeSource).toContain("parseDesktopAppearanceTheme(theme)");
    expect(runtimeSource).toContain("nativeTheme.themeSource = parsedTheme;");
    expect(runtimeSource).toContain('ipcMain.handle("od:appearance:set-theme"');
    expect(runtimeSource).toContain('return { ok: true };');
    expect(runtimeSource).toContain('return { ok: false, reason: "appearance theme is not System, Light, or Dark" };');
    expect(runtimeSource).toContain('nativeTheme.themeSource = "system";');
    expect(runtimeSource).not.toContain("pinNativeAppearanceToLight");
    expect(runtimeSource).toContain("main window stays hidden until that renderer mount/reveal");
    expect(runtimeSource).toContain("native appearance acknowledgement");
  });
});
