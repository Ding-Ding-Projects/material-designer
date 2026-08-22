/** Capture-only fetch boundary; ordinary sidecar launches are unchanged. */

import type { CaptureNetworkPolicyAcknowledgement } from "@open-design/sidecar-proto";

export const CAPTURE_NETWORK_POLICY_ACKNOWLEDGEMENT = {
  armed: true,
  policyVersion: "capture-network-policy-v2",
  redirectMode: "manual",
  allowedOriginClass: "loopback-http-no-credentials",
} as const satisfies CaptureNetworkPolicyAcknowledgement;

function isLoopbackHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      || parsed.username.length > 0
      || parsed.password.length > 0
    ) return false;
    return parsed.hostname === "localhost"
      || parsed.hostname === "127.0.0.1"
      || parsed.hostname === "::1"
      || parsed.hostname === "[::1]";
  } catch {
    return false;
  }
}

export function installCaptureNetworkPolicy(
  env: NodeJS.ProcessEnv = process.env,
): CaptureNetworkPolicyAcknowledgement | null {
  if (env.OD_DESIGN_PARITY_CAPTURE !== "1") return null;
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const rawUrl = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
    if (!isLoopbackHttpUrl(rawUrl)) {
      throw new Error("capture.network_blocked_external");
    }
    const request = new Request(input, { ...init, redirect: "manual" });
    const response = await originalFetch(request);
    if ((response.status >= 300 && response.status < 400) || response.headers.has("location")) {
      throw new Error("capture.network_redirect_blocked");
    }
    if (!response.url || !isLoopbackHttpUrl(response.url)) {
      throw new Error("capture.network_final_origin_blocked");
    }
    return response;
  }) as typeof fetch;
  return CAPTURE_NETWORK_POLICY_ACKNOWLEDGEMENT;
}
