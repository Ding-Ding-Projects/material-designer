import { describe, expect, it, vi } from "vitest";

import {
  CAPTURE_ENV_INVENTORY,
  CAPTURE_HANDLER_INVENTORY,
  CAPTURE_READ_ROUTE_INVENTORY,
  CAPTURE_PROCESS_INVENTORY,
  createCaptureBoundaryMiddleware,
} from "../src/capture-boundary.js";

function responseDouble() {
  const response = {
    body: null as unknown,
    statusCode: 200,
    ended: false,
    json(payload: unknown) {
      response.body = payload;
      return response;
    },
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    writeHead(code: number) {
      response.statusCode = code;
      return response;
    },
    write(_payload: string) {
      return true;
    },
    end() {
      response.ended = true;
      return response;
    },
  };
  return response;
}

function request(method: string, path: string, query: Record<string, string> = {}) {
  return { method, path, query };
}

describe("deterministic capture process boundary", () => {
  it("keeps an explicit handler/process/env inventory", () => {
    expect(CAPTURE_HANDLER_INVENTORY.length).toBeGreaterThan(0);
    expect(CAPTURE_READ_ROUTE_INVENTORY.length).toBeGreaterThan(0);
    expect(CAPTURE_PROCESS_INVENTORY.length).toBeGreaterThan(0);
    expect(CAPTURE_ENV_INVENTORY).toEqual(expect.arrayContaining([
      "HOME",
      "CODEX_HOME",
      "CLAUDE_CONFIG_DIR",
      "OPENCODE_TEST_HOME",
      "VP_HOME",
      "TMPDIR",
      "TMP",
      "TEMP",
      "USERPROFILE",
      "APPDATA",
      "LOCALAPPDATA",
      "OD_DESIGN_PARITY_CAPTURE",
    ]));
  });

  it("passes ordinary requests through when capture is disabled", () => {
    const next = vi.fn();
    const res = responseDouble();
    createCaptureBoundaryMiddleware({ OD_DESIGN_PARITY_CAPTURE: "0" })
      (request("POST", "/runs") as never, res as never, next as never);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
  });

  it("serves fixture agent status without invoking detection", () => {
    const next = vi.fn();
    const res = responseDouble();
    createCaptureBoundaryMiddleware({ OD_DESIGN_PARITY_CAPTURE: "1" })
      (request("GET", "/agents") as never, res as never, next as never);
    expect(next).not.toHaveBeenCalled();
    expect((res.body as { source: string }).source).toBe("capture-provider");
    expect((res.body as { agents: Array<{ status: string }> }).agents[0]?.status).toBe("fixture");
  });

  it("serves fixture provider status and rejects every external launch path", () => {
    const middleware = createCaptureBoundaryMiddleware({ OD_DESIGN_PARITY_CAPTURE: "1" });
    const vela = responseDouble();
    middleware(request("GET", "/integrations/vela/status") as never, vela as never, vi.fn() as never);
    expect((vela.body as { source: string }).source).toBe("capture-provider");

    for (const path of [
      "/runs",
      "/chat",
      "/integrations/vela/login",
      "/connectors/foo/connect",
      "/tools/connectors/execute",
      "/projects/p1/terminals",
      "/mcp/oauth/start",
    ]) {
      const res = responseDouble();
      middleware(request("POST", path) as never, res as never, vi.fn() as never);
      expect(res.statusCode).toBe(503);
      expect((res.body as { error: string }).error).toBe("capture.external_runtime_blocked");
    }
  });

  it("deliberately turns red when the capture marker is removed", () => {
    const middleware = createCaptureBoundaryMiddleware({});
    const next = vi.fn();
    const res = responseDouble();
    middleware(request("POST", "/runs") as never, res as never, next as never);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("refuses an unclassified API route instead of falling through", () => {
    const middleware = createCaptureBoundaryMiddleware({ OD_DESIGN_PARITY_CAPTURE: "1" });
    const next = vi.fn();
    const res = responseDouble();
    middleware(request("GET", "/unclassified-live-read") as never, res as never, next as never);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
    expect((res.body as { error: string }).error).toBe("capture.unclassified_route_blocked");
  });

  it("projects an inventoried read from fixtures without reaching the registrar", () => {
    const middleware = createCaptureBoundaryMiddleware({ OD_DESIGN_PARITY_CAPTURE: "1" });
    const next = vi.fn();
    const res = responseDouble();
    middleware(request("GET", "/projects") as never, res as never, next as never);
    expect(next).not.toHaveBeenCalled();
    expect((res.body as { source: string }).source).toBe("capture-provider");
  });
});
