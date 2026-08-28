import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { UniversalSettingsStore } from "../../src/main/universal-settings-store.js";

const directories: string[] = [];

afterEach(async () => {
  while (directories.length > 0) {
    const directory = directories.pop();
    if (directory) await rm(directory, { recursive: true, force: true });
  }
});
async function createStore(): Promise<UniversalSettingsStore> {
  const directory = await mkdtemp(join(tmpdir(), "material-designer-universal-settings-"));
  directories.push(directory);
  return new UniversalSettingsStore(directory);
}

function state(revision: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { schemaVersion: 1, revision, updatedAt: revision, ...extra };
}

describe("UniversalSettingsStore", () => {
  test("starts with an empty revision-zero host-owned record", async () => {
    const store = await createStore();
    await expect(store.read()).resolves.toEqual({
      ok: true,
      state: { schemaVersion: 1, revision: 0, updatedAt: 0 },
    });
  });

  test("accepts one exact next revision and publishes it to listeners", async () => {
    const store = await createStore();
    const seen: Record<string, unknown>[] = [];
    store.subscribe((value) => seen.push(value));
    const result = await store.write(state(1, { languageMode: "english", funnyEnglish: 5 }), 0);
    expect(result.ok).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.revision).toBe(1);
    expect((await store.read()).ok).toBe(true);
  });

  test("refuses stale revisions and secret-bearing records", async () => {
    const store = await createStore();
    await expect(store.write(state(1), 0)).resolves.toMatchObject({ ok: true });
    await expect(store.write(state(2), 0)).resolves.toEqual({ ok: false, code: "stale-revision" });
    await expect(store.write(state(2, { password: "never" }), 1)).resolves.toEqual({ ok: false, code: "invalid-input" });
    await expect(store.write(state(2, { school: { credentialConfigured: true } }), 1)).resolves.toMatchObject({ ok: true });
    await expect(store.write(state(3, { unexpected: true }), 2)).resolves.toEqual({ ok: false, code: "invalid-input" });
    await expect(store.write(state(3, { narrator: { enabled: true, language: "english", englishVoiceId: 42 } }), 2)).resolves.toEqual({ ok: false, code: "invalid-input" });
    await expect(store.write(state(3, { schedules: [{ id: "bad", label: "bad", enabled: true, priority: 0, startTime: "99:99", endTime: "17:00", weekdays: "all", source: "local", values: {} }] }), 2)).resolves.toEqual({ ok: false, code: "invalid-input" });
  });

  test("stores and clears the Home Assistant token only through the protected adapter", async () => {
    const store = await createStore();
    const protectedBytes = Buffer.from("protected-value", "utf8");
    const configured = await store.setHomeAssistantToken("example-token");
    expect(configured.ok).toBe(false);
    const protectedStore = new UniversalSettingsStore(
      directories[directories.length - 1]!,
      { protect: () => protectedBytes, unprotect: (value) => value.equals(protectedBytes) ? "example-token" : "" },
    );
    await expect(protectedStore.setHomeAssistantToken("example-token")).resolves.toEqual({ ok: true });
    await expect(protectedStore.readHomeAssistantToken()).resolves.toBe("example-token");
    await expect(protectedStore.clearHomeAssistantToken()).resolves.toEqual({ ok: true });
    await expect(protectedStore.readHomeAssistantToken()).resolves.toBeNull();
  });

  test("registers a truthful local Status Hub projection and rejects non-HTTPS evidence", async () => {
    const store = await createStore();
    const report = {
      sessionId: "settings-session",
      project: "Material Designer",
      state: "running" as const,
      summary: "Host projection is active.",
      evidence: [{ label: "source", url: null, verified: false }],
      sourceRevision: null,
      updatedAt: 123,
    };
    await expect(store.registerStatus(report)).resolves.toMatchObject({
      ok: true,
      delivery: "local-fallback",
      noDeliveryReason: expect.stringContaining("No authenticated"),
    });
    await expect(store.heartbeatStatus("settings-session", 456)).resolves.toMatchObject({ ok: true, report: { updatedAt: 456 } });
    await expect(store.readStatus("settings-session")).resolves.toMatchObject({ ok: true, report: { sessionId: "settings-session" } });
    await expect(store.reportStatus({ ...report, evidence: [{ label: "bad", url: "http://example.test", verified: false }] })).resolves.toEqual({ ok: false, code: "invalid-input" });
  });
});
