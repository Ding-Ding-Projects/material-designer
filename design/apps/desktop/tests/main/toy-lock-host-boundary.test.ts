import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const runtime = readFileSync(new URL("../../src/main/runtime.ts", import.meta.url), "utf8");
const preload = readFileSync(new URL("../../src/main/preload.cts", import.meta.url), "utf8");
const channels = ["begin-totp-enrollment", "confirm-totp-enrollment", "configure", "list", "remove", "verify"] as const;
function stripComments(source: string): string { return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""); }
function handlerBody(source: string, channel: string): string | null {
  const clean = stripComments(source); const marker = `ipcMain.handle(\"od:toy-locks:${channel}\", async (`; const start = clean.indexOf(marker);
  if (start < 0 || clean.indexOf(marker, start + 1) >= 0) return null;
  const end = clean.indexOf("\n  });", start); return end < 0 ? null : clean.slice(start, end);
}
describe("Settings toy-lock host boundary", () => {
  test("exposes exactly the six narrow operations", () => {
    const found = [...stripComments(preload).matchAll(/ipcRenderer\.invoke\('od:toy-locks:([^']+)'/g)].map((match) => match[1]);
    expect(found).toEqual(channels);
  });
  test("every exact handler rejects non-main frames", () => {
    for (const channel of channels) {
      const body = handlerBody(runtime, channel); expect(body, channel).not.toBeNull();
      expect(body!.match(/^\s*requireMainWindowSender\(event\);\s*$/gm)).toHaveLength(1);
    }
    expect(stripComments(runtime).match(/^\s*if \(event\.sender !== window\.webContents \|\| event\.senderFrame !== window\.webContents\.mainFrame\) \{$/gm)).toHaveLength(1);
  });
  test("uses safeStorage and never the connector credential implementation", () => {
    const clean = stripComments(runtime);
    expect(clean.match(/^\s*isAvailable: \(\) => safeStorage\.isEncryptionAvailable\(\),$/gm)).toHaveLength(1);
    expect(clean.match(/^\s*return safeStorage\.encryptString\(value\);$/gm)).toHaveLength(1);
    expect(clean.match(/^\s*return safeStorage\.decryptString\(value\);$/gm)).toHaveLength(1);
    expect(clean).not.toContain("FileConnectorCredentialStore");
  });
});
