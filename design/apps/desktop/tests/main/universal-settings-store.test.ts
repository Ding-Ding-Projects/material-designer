import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import {
  UNIVERSAL_SCHEDULE_RESPONSE_MAX_BYTES,
  UNIVERSAL_SCHEDULE_TIMEOUT_MS,
  createUniversalSettingsStore,
  UniversalSettingsStore,
  universalAddressIsPrivate,
  validateUniversalScheduleSourceRequest,
} from "../../src/main/universal-settings-store.js";

const directories: string[] = [];
const stores: UniversalSettingsStore[] = [];

afterEach(async () => {
  for (const store of stores.splice(0)) store.close();
  while (directories.length > 0) {
    const directory = directories.pop();
    if (directory) await rm(directory, { recursive: true, force: true });
  }
});
async function createStore(): Promise<UniversalSettingsStore> {
  const directory = await mkdtemp(join(tmpdir(), "material-designer-universal-settings-"));
  directories.push(directory);
  const store = createUniversalSettingsStore(directory);
  stores.push(store);
  return store;
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
    stores.push(protectedStore);
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

  test("validates source requests before any network call", () => {
    expect(validateUniversalScheduleSourceRequest({ source: "api", url: "https://example.test/settings" })).toEqual({
      source: "api",
      url: "https://example.test/settings",
    });
    expect(validateUniversalScheduleSourceRequest({ source: "api", url: "http://127.0.0.1/settings" })).toBeNull();
    expect(validateUniversalScheduleSourceRequest({ source: "api", url: "https://user:password@example.test/settings" })).toBeNull();
    expect(validateUniversalScheduleSourceRequest({ source: "api", url: "https://example.test/settings#secret" })).toBeNull();
    expect(validateUniversalScheduleSourceRequest({ source: "homeAssistant", baseUrl: "https://example.test", entity: "binary_sensor.office" })).toEqual({
      source: "homeAssistant",
      baseUrl: "https://example.test",
      entity: "binary_sensor.office",
    });
    expect(validateUniversalScheduleSourceRequest({ source: "homeAssistant", baseUrl: "https://example.test", entity: "sensor.office" })).toBeNull();
    expect(UNIVERSAL_SCHEDULE_RESPONSE_MAX_BYTES).toBe(64 * 1024);
    expect(UNIVERSAL_SCHEDULE_TIMEOUT_MS).toBe(4_000);
  });

  test("rejects private or loopback literal hosts without fetching", async () => {
    const store = await createStore();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(store.resolveScheduleSource({ source: "api", url: "https://127.0.0.1/settings" })).resolves.toEqual({ ok: false, code: "invalid-input" });
    await expect(store.resolveScheduleSource({ source: "api", url: "https://192.168.1.20/settings" })).resolves.toEqual({ ok: false, code: "invalid-input" });
    await expect(store.resolveScheduleSource({ source: "api", url: "https://localhost/settings" })).resolves.toEqual({ ok: false, code: "invalid-input" });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  test("classifies private, loopback, and link-local addresses conservatively", () => {
    expect(universalAddressIsPrivate("127.0.0.1")).toBe(true);
    expect(universalAddressIsPrivate("192.168.50.10")).toBe(true);
    expect(universalAddressIsPrivate("169.254.1.2")).toBe(true);
    expect(universalAddressIsPrivate("fd00::1")).toBe(true);
    expect(universalAddressIsPrivate("fe80::1")).toBe(true);
    expect(universalAddressIsPrivate("8.8.8.8")).toBe(false);
  });

  test("normalizes only supported remote values and passes redirect and credential boundaries to fetch", async () => {
    const store = await createStore();
    const body = JSON.stringify({ schemaVersion: 1, values: { theme: "dark", density: "compact" } });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(body, {
      status: 200,
      headers: { "content-length": String(new TextEncoder().encode(body).byteLength) },
    }));
    await expect(store.resolveScheduleSource({ source: "api", url: "https://8.8.8.8/settings" })).resolves.toMatchObject({
      ok: true,
      values: { theme: "dark", density: "compact" },
    });
    expect(fetchSpy).toHaveBeenCalledWith("https://8.8.8.8/settings", expect.objectContaining({ redirect: "error", credentials: "omit" }));
    fetchSpy.mockRestore();
  });

  test("refuses an oversized response before decoding it", async () => {
    const store = await createStore();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", {
      status: 200,
      headers: { "content-length": String(UNIVERSAL_SCHEDULE_RESPONSE_MAX_BYTES + 1) },
    }));
    await expect(store.resolveScheduleSource({ source: "api", url: "https://8.8.8.8/settings" })).resolves.toEqual({ ok: false, code: "invalid-response" });
    fetchSpy.mockRestore();
  });

  test("aborts an unresolved source at the bounded timeout", async () => {
    vi.useFakeTimers();
    const store = await createStore();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((_url, options) => new Promise<Response>((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }));
    const pending = store.resolveScheduleSource({ source: "api", url: "https://8.8.8.8/settings" });
    await vi.advanceTimersByTimeAsync(UNIVERSAL_SCHEDULE_TIMEOUT_MS);
    await expect(pending).resolves.toEqual({ ok: false, code: "timeout" });
    fetchSpy.mockRestore();
    vi.useRealTimers();
  });
});
