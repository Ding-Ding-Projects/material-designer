import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const runtime = readFileSync(new URL("../../src/main/runtime.ts", import.meta.url), "utf8");

describe("desktop host contract registration", () => {
  it("registers the current converter, authenticator, and unlock-ladder bridge channels", () => {
    for (const channel of [
      "od:converter:acknowledge-disclosure",
      "od:converter:queue:export",
    ]) {
      expect(runtime).toContain(`registerConverterHandler(\"${channel}\"`);
    }
    for (const channel of [
      "od:authenticator:vault-status",
      "od:authenticator:history-export-sensitive",
      "od:unlock-ladder:record",
      "od:unlock-ladder:issue",
      "od:unlock-ladder:submit",
    ]) {
      expect(runtime).toContain(`ipcMain.handle(\"${channel}\"`);
    }
  });

  it("keeps every privileged host route behind the main-window sender check", () => {
    for (const channel of [
      "od:authenticator:vault-status",
      "od:authenticator:history-export-sensitive",
      "od:unlock-ladder:record",
      "od:unlock-ladder:issue",
      "od:unlock-ladder:submit",
    ]) {
      const start = runtime.indexOf(`ipcMain.handle(\"${channel}\"`);
      expect(start, channel).toBeGreaterThanOrEqual(0);
      const end = runtime.indexOf("\n  });", start);
      expect(runtime.slice(start, end)).toContain("requireMainWindowSender(event)");
    }
  });
});
