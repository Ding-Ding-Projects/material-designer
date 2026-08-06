import { describe, expect, it, vi } from "vitest";
import type { OpenDesignHostUpdaterSavePreparation } from "@open-design/host";

import {
  checkUpdateRestartSafety,
  finishUpdateQuitAfterRendererSave,
  parseUpdateActionRequest,
  parseUpdateRendererSavePreparationResponse,
  UPDATE_RENDERER_SAVE_FAILED_ERROR_CODE,
  UPDATE_RENDERER_SAVE_UNAVAILABLE_ERROR_CODE,
} from "../../src/main/update-preflight.js";

describe("desktop update restart preflight", () => {
  it("blocks an update when the daemon reports active runs", async () => {
    const result = await checkUpdateRestartSafety({
      discoverDaemonBaseUrl: async () => "http://127.0.0.1:3000",
      fetchImpl: async (input, init) => {
        expect(String(input)).toBe("http://127.0.0.1:3000/api/runs?status=active");
        expect(init?.cache).toBe("no-store");
        return new Response(JSON.stringify({ runs: [{ id: "run-1" }, { id: "run-2" }] }), {
          headers: { "content-type": "application/json" },
          status: 200,
        });
      },
    });
    expect(result).toEqual({ activeRunCount: 2, state: "blocked" });
  });

  it("returns clear only for a valid empty runs response", async () => {
    const result = await checkUpdateRestartSafety({
      discoverDaemonBaseUrl: async () => "http://127.0.0.1:3000/",
      fetchImpl: async () => new Response(JSON.stringify({ runs: [] }), { status: 200 }),
    });
    expect(result).toEqual({ activeRunCount: 0, state: "clear" });
  });

  it("treats unreachable or malformed daemon responses as unknown risk", async () => {
    const unreachable = await checkUpdateRestartSafety({
      discoverDaemonBaseUrl: async () => {
        throw new Error("daemon unavailable");
      },
      fetchImpl: fetch,
    });
    expect(unreachable).toMatchObject({ activeRunCount: null, state: "unknown" });

    const malformed = await checkUpdateRestartSafety({
      discoverDaemonBaseUrl: async () => "http://127.0.0.1:3000",
      fetchImpl: async () => new Response(JSON.stringify({ runs: "not-an-array" }), { status: 200 }),
    });
    expect(malformed).toMatchObject({ activeRunCount: null, state: "unknown" });
  });

  it("accepts only the force and source fields used by updater UI actions", () => {
    expect(parseUpdateActionRequest({ payload: { force: true, source: "mac-app-menu" } })).toEqual({
      force: true,
      source: "mac-app-menu",
    });
    expect(parseUpdateActionRequest({ payload: { force: "yes", source: 42 } })).toEqual({
      force: false,
      source: null,
    });
    expect(parseUpdateActionRequest(null)).toEqual({ force: false, source: null });
  });

  it("waits for renderer save preparation before allowing the restart", async () => {
    const requestQuit = vi.fn();
    let resolvePreparation: ((preparation: OpenDesignHostUpdaterSavePreparation) => void) | undefined;
    const resultPromise = finishUpdateQuitAfterRendererSave({
      force: false,
      prepare: () => new Promise((resolve) => {
        resolvePreparation = resolve;
      }),
      requestQuit,
    });

    expect(requestQuit).not.toHaveBeenCalled();
    resolvePreparation?.({ state: "saved" });
    await expect(resultPromise).resolves.toEqual({ ok: true });
    expect(requestQuit).toHaveBeenCalledTimes(1);
  });

  it("never lets force bypass a failed renderer save", async () => {
    const requestQuit = vi.fn();
    await expect(finishUpdateQuitAfterRendererSave({
      force: true,
      prepare: async () => ({ reason: "save-failed", state: "failed" as const }),
      requestQuit,
    })).resolves.toEqual({
      details: { preparation: "failed", reason: "save-failed" },
      ok: false,
      reason: UPDATE_RENDERER_SAVE_FAILED_ERROR_CODE,
    });
    expect(requestQuit).not.toHaveBeenCalled();
  });

  it("distinguishes an unavailable renderer barrier from a save failure", async () => {
    const requestQuit = vi.fn();
    await expect(finishUpdateQuitAfterRendererSave({
      force: false,
      prepare: async () => ({ reason: "renderer-save-preparation-timeout", state: "failed" as const }),
      requestQuit,
    })).resolves.toMatchObject({
      ok: false,
      reason: UPDATE_RENDERER_SAVE_UNAVAILABLE_ERROR_CODE,
    });
    expect(requestQuit).not.toHaveBeenCalled();
  });

  it("rejects malformed renderer preparation responses at the IPC boundary", () => {
    expect(parseUpdateRendererSavePreparationResponse({
      requestId: "restart-1",
      preparation: { state: "saved" },
    })).toEqual({ requestId: "restart-1", preparation: { state: "saved" } });
    expect(parseUpdateRendererSavePreparationResponse({
      requestId: "restart-1",
      preparation: { state: "failed", reason: "save failed" },
    })).toBeNull();
    expect(parseUpdateRendererSavePreparationResponse({
      requestId: "restart-1",
      preparation: { state: "failed", reason: "x".repeat(121) },
    })).toBeNull();
    expect(parseUpdateRendererSavePreparationResponse({
      requestId: "restart/1",
      preparation: { state: "clean" },
    })).toBeNull();
  });
});
