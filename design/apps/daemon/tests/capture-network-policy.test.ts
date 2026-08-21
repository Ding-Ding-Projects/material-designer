import { afterEach, describe, expect, it, vi } from "vitest";

import { installCaptureNetworkPolicy } from "../src/sidecar/capture-network-policy.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});
function responseWithUrl(url: string, init?: ResponseInit): Response {
  const response = new Response("fixture", init);
  Object.defineProperty(response, "url", { configurable: true, value: url });
  return response;
}

describe("capture sidecar network policy", () => {
  it("forces manual redirects and rejects a redirect response", async () => {
    const upstream = vi.fn(async (request: Request) => {
      expect(request.redirect).toBe("manual");
      return responseWithUrl("http://127.0.0.1:7456/", {
        status: 302,
        headers: { location: "http://127.0.0.1:7456/next" },
      });
    });
    globalThis.fetch = upstream as unknown as typeof fetch;
    installCaptureNetworkPolicy({ OD_DESIGN_PARITY_CAPTURE: "1" });
    await expect(globalThis.fetch("http://127.0.0.1:7456/"))
      .rejects.toThrow("capture.network_redirect_blocked");
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("rejects a credentialed or non-loopback final origin", async () => {
    const upstream = vi.fn(async () => responseWithUrl("https://example.test/"));
    globalThis.fetch = upstream as unknown as typeof fetch;
    installCaptureNetworkPolicy({ OD_DESIGN_PARITY_CAPTURE: "1" });
    await expect(globalThis.fetch("http://user:secret@127.0.0.1:7456/"))
      .rejects.toThrow("capture.network_blocked_external");
    await expect(globalThis.fetch("http://127.0.0.1:7456/"))
      .rejects.toThrow("capture.network_final_origin_blocked");
  });

  it("leaves ordinary fetch untouched when capture is disabled", async () => {
    const upstream = vi.fn(async () => responseWithUrl("https://example.test/"));
    globalThis.fetch = upstream as unknown as typeof fetch;
    installCaptureNetworkPolicy({ OD_DESIGN_PARITY_CAPTURE: "0" });
    await expect(globalThis.fetch("https://example.test/")).resolves.toBeInstanceOf(Response);
    expect(upstream).toHaveBeenCalledTimes(1);
  });
});
