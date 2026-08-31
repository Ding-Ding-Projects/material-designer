import { existsSync, readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

const runtimeSource = readFileSync(new URL("../../src/main/runtime.ts", import.meta.url), "utf8");
const appIcon = new URL("../../../web/public/app-icon.png", import.meta.url);
const retiredSplashVideo = new URL("../../src/main/splash-video.ts", import.meta.url);

function pendingSplashSource(): string {
  const start = runtimeSource.indexOf("function createPendingHtml(): string {");
  const end = runtimeSource.indexOf("/**\n * Last-resort error screen", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return runtimeSource.slice(start, end);
}

describe("packaged startup identity", () => {
  test("uses the shipped Material Designer identity without the retired upstream video", () => {
    const splash = pendingSplashSource();

    expect(splash).toContain('<title>Material Designer</title>');
    expect(splash).toContain('alt="Material Designer mark"');
    expect(splash).toContain(
      '<div class="splash-name" id="splash-name">Material Designer</div>',
    );
    expect(splash).toContain("A local-first design workspace");
    expect(splash).not.toMatch(/Open ?Design|The open-source Claude design alternative/i);
    expect(splash).not.toContain("<video");
    expect(splash).not.toContain("SPLASH_VIDEO_DATA_URL");
    expect(existsSync(retiredSplashVideo)).toBe(false);
  });

  test("loads the project-owned mark from the packaged app icon", () => {
    const splash = pendingSplashSource();
    expect(existsSync(appIcon)).toBe(true);
    expect(splash).toContain("pathToFileURL(resolveDesktopIconPath()).href");
    expect(splash).toContain('<img class="splash-mark" src="${markUrl}" alt="Material Designer mark" />');
  });

  test("preserves accessible identity, live progress, and reduced-motion behavior", () => {
    const splash = pendingSplashSource();

    expect(splash).toContain(
      'aria-labelledby="splash-name" aria-describedby="splash-description"',
    );
    expect(splash).toContain('aria-live="polite"');
    expect(splash).toContain('id="boot-progress-fill"');
    expect(splash).toContain("window.__odSplashSetStage = function (info)");
    expect(splash).toContain("@media (prefers-reduced-motion: reduce)");
    expect(splash).toContain(".boot-dots .dot { animation: none; opacity: 1; }");
    expect(splash).toContain(".boot-progress-fill, .boot-stage { transition: none; }");
    expect(splash).toContain(".boot-stage-swapping { opacity: 1; }");
    expect(splash).toMatch(/body\s*\{[\s\S]*?-webkit-app-region:\s*drag;/u);
  });
});
