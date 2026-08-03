import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

const runtimeSource = readFileSync(new URL("../../src/main/runtime.ts", import.meta.url), "utf8");

/**
 * runtime.ts constructs three BrowserWindows — the brand splash
 * (`createSplashWindow`), the desktop pet, and the main app window — and the
 * splash, declared FIRST, shares the `title: "Open Design"` / `width: 1280`
 * markers with the main window while intentionally omitting
 * `backgroundThrottling: false`. A loose `new BrowserWindow({` anchor therefore
 * locks onto the splash block. Anchor instead on the `const window =`
 * declaration that is unique to the main app window, and assert exactly one
 * match so a rename or a second such declaration fails loudly here rather than
 * silently inspecting the wrong window.
 */
function mainAppWindowOptions(): string {
  const blocks = runtimeSource
    .split("const window = new BrowserWindow({")
    .slice(1)
    .map((block) => block.slice(0, block.indexOf("});")));
  expect(blocks).toHaveLength(1);
  return blocks[0] ?? "";
}

/**
 * The platform-keyed chrome constant spread into the main app window's
 * options. Anchored on the declaration and terminated at the first `;`, which
 * is the constant's own terminator — none of the nested object literals inside
 * it contain one.
 */
function platformWindowChrome(): string {
  const blocks = runtimeSource
    .split("const PLATFORM_WINDOW_CHROME =")
    .slice(1)
    .map((block) => block.slice(0, block.indexOf(";")));
  expect(blocks).toHaveLength(1);
  return blocks[0] ?? "";
}

describe("desktop BrowserWindow chrome options", () => {
  test("hides Electron's native menu bar in the Windows/Linux app window", () => {
    expect(mainAppWindowOptions()).toContain("autoHideMenuBar: true");
  });

  test("spreads the platform chrome into the main app window", () => {
    expect(mainAppWindowOptions()).toContain("...PLATFORM_WINDOW_CHROME,");
  });

  test("gives Windows a frameless window that keeps its native frame behaviour", () => {
    const chrome = platformWindowChrome();

    expect(chrome).toContain('process.platform === "win32"');
    expect(chrome).toContain('titleBarStyle: "hidden" as const');
    // `frame: false` would take Windows 11's rounded corners, drop shadow and
    // Alt+Space system menu down with the caption bar. `titleBarStyle: "hidden"`
    // removes only the caption bar.
    expect(chrome).not.toContain("frame: false");
    expect(mainAppWindowOptions()).not.toContain("frame: false");
    // titleBarOverlay would hand the caption buttons back to the OS, drawn on
    // top of the Material Design 3 title bar the renderer paints. It is also
    // the only option that would keep Windows 11's snap-layouts flyout, which
    // the OS shows only while hit-testing an actual maximize button — a
    // renderer-drawn one can never be that, so this branch gives the flyout up
    // deliberately (Win+Z and drag-to-edge snapping are unaffected). (Neither
    // extract includes the comment above the constant, which names both of the
    // options that were deliberately not used.)
    expect(chrome).not.toContain("titleBarOverlay");
    expect(mainAppWindowOptions()).not.toContain("titleBarOverlay");
  });

  test("leaves the macOS chrome branch untouched", () => {
    const chrome = platformWindowChrome();

    expect(chrome).toContain('process.platform === "darwin"');
    expect(chrome).toContain('titleBarStyle: "hiddenInset" as const');
    expect(chrome).toContain("trafficLightPosition: { x: 12, y: 10 }");
  });

  test("pushes maximized-state changes so the custom title bar's glyph follows the window", () => {
    expect(runtimeSource).toContain("attachWindowMaximizedBroadcast(window);");
    expect(runtimeSource).toContain("registerWindowControlHandlers(ipcMain, window)");
    expect(runtimeSource).toContain("disposeWindowControls();");
  });

  test("keeps macOS traffic-light controls clear of the web tab strip", () => {
    expect(runtimeSource).toContain("--app-chrome-traffic-space: 96px !important;");
    expect(runtimeSource).toContain("--app-chrome-traffic-margin: 12px !important;");
    expect(runtimeSource).toContain("flex: 0 0 96px !important;");
    expect(runtimeSource).toContain("width: 96px !important;");
  });

  test("keeps the visible renderer responsive when Chromium misclassifies visibility", () => {
    expect(mainAppWindowOptions()).toContain("backgroundThrottling: false");
  });

  test("keeps channel-specific window titles from being overwritten by the renderer page title", () => {
    expect(runtimeSource).toContain('window.on("page-title-updated", (event) => {');
    expect(runtimeSource).toContain("event.preventDefault();");
    expect(runtimeSource).toContain("window.setTitle(windowTitle);");
  });

  test("keeps packaged update status wired into the runtime instead of falling back to 0.0.0", () => {
    expect(runtimeSource).toContain("currentVersion: \"0.0.0\"");
    expect(runtimeSource).toContain("options.updater?.snapshot() ?? unavailableUpdaterStatus()");
    expect(runtimeSource).toContain("options.updater?.status() ?? unavailableUpdaterStatus()");
    expect(runtimeSource).toContain("sendUpdaterStatus()");
  });
});
