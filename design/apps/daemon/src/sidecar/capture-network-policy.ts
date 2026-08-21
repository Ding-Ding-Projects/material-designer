/**
 * Capture-only egress policy for the daemon sidecar.
 *
 * The packaged launcher already strips provider credentials and proxy
 * variables. This second boundary protects direct `fetch` calls made by
 * daemon startup and provider routes: only local loopback sidecar origins
 * are reachable while `OD_DESIGN_PARITY_CAPTURE=1` is present.
 */

function isLoopbackHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
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
): void {
  if (env.OD_DESIGN_PARITY_CAPTURE !== "1") return;
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
    return await originalFetch(input, init);
  }) as typeof fetch;
}
