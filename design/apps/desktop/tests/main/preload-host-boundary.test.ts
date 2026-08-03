import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

describe("desktop preload host boundary", () => {
  it("exposes the canonical Open Design host global and diagnostics bridge", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, "../../src/main/preload.cts"), "utf8");
    const exposedGlobals = Array.from(source.matchAll(/contextBridge\.exposeInMainWorld\(([^,\n]+)/g))
      .map((match) => match[1]?.trim());
    const runtimeRequires = Array.from(source.matchAll(/require\((['"][^'"]+['"])\)/g))
      .map((match) => match[1]);

    expect(exposedGlobals).toEqual(["OPEN_DESIGN_HOST_GLOBAL", "'openDesignDesktop'"]);
    expect(runtimeRequires).toEqual(["'electron'"]);
    expect(source).toContain("OPEN_DESIGN_HOST_GLOBAL");
    expect(source).toContain("exportDiagnostics");
    expect(source).toContain("satisfies OpenDesignHostBridge");
    expect(source).toContain("browser");
    expect(source).toContain("browser:clear-data");
    expect(source).toContain("updater");
    // OS locale forwarded from main via webPreferences.additionalArguments
    // is mirrored onto __od__.client.osLocale. Pin the literal prefix
    // here so it can't drift away from `applyOsLocaleSwitch`/runtime's
    // additionalArguments without the test going red.
    expect(source).toContain("'--od-os-locale='");
    expect(source).toContain("osLocale");
    expect(source).toContain("invokeUpdater('install'");
    expect(source).toContain("invokeUpdater('clear-cache'");
    expect(source).toContain("od:update:quit");
    expect(source).toContain("od:update:status-changed");
    expect(source).toContain("od:update:open-dialog");
    expect(source).toContain("od:update:set-menu-labels");
    expect(source).toContain("subscribeOpenDialog");
    expect(source).toContain("od:app-config-changed");
    expect(source).toContain("open-design:app-config-changed");
    expect(source).toContain("window.dispatchEvent(new CustomEvent(APP_CONFIG_CHANGED_EVENT))");
    // Windows hides the OS caption bar, so the renderer paints the title bar
    // and needs a route to the window. Pin the literal channel names: the
    // preload cannot import `main/window-controls.ts` (a sandboxed preload may
    // only require `electron`), so the two copies can only be kept honest here.
    expect(source).toContain("windowControls");
    expect(source).toContain("'od:window:minimize'");
    expect(source).toContain("'od:window:toggle-maximize'");
    expect(source).toContain("'od:window:close'");
    expect(source).toContain("'od:window:is-maximized'");
    expect(source).toContain("'od:window:maximized-changed'");
    expect(source).toContain("subscribeMaximized");
    // Optional namespace, exposed on win32 only, so every other platform's
    // renderer feature-detects it away instead of drawing dead buttons.
    expect(source).toContain("process.platform === 'win32' ? { windowControls } : {}");
    expect(source).not.toContain("@open-design/contracts");
    expect(source).not.toContain("exposeInMainWorld('electronAPI'");
    expect(source).not.toContain('exposeInMainWorld("__odDesktop"');
    expect(source).not.toContain("exposeInMainWorld('__odDesktop'");
  });

  it("mirrors the host import contract by accepting a null entryFile", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, "../../src/main/preload.cts"), "utf8");

    expect(source).toContain("response.entryFile === null");
    expect(source).toContain("entryFile === undefined");
  });
});
