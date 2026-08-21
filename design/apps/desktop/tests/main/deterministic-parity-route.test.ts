import { describe, expect, it } from "vitest";

import {
  DETERMINISTIC_PARITY_CAPTURE_FLAG,
  DETERMINISTIC_PARITY_FIXTURE_REVISION,
  DETERMINISTIC_PARITY_FONTS,
  DETERMINISTIC_PARITY_NETWORK,
  DETERMINISTIC_PARITY_RANDOM_SEED,
  DETERMINISTIC_PARITY_TIME,
  DETERMINISTIC_PARITY_NOT_READY_REASON,
  isDeterministicParityCaptureReady,
  isDeterministicParityNavigationAllowed,
  isDeterministicParityReadinessInspectionExpression,
  parseDeterministicParityRouteArgv,
  resolveDeterministicParityRoute,
} from "../../src/main/deterministic-parity-route.js";

const QUERY_KEYS = [
  "state",
  "theme",
  "width",
  "height",
  "scale",
  "locale",
  "fixture",
  "time",
  "motion",
  "random",
  "fonts",
  "network",
] as const;

function route(
  screen: string,
  state = "default",
  overrides: Partial<Record<(typeof QUERY_KEYS)[number], string>> = {},
): string {
  const values: Record<string, string> = {
    state,
    theme: "light",
    width: "1440",
    height: "900",
    scale: "1",
    locale: "en-US",
    fixture: DETERMINISTIC_PARITY_FIXTURE_REVISION,
    time: DETERMINISTIC_PARITY_TIME,
    motion: "frozen",
    random: String(DETERMINISTIC_PARITY_RANDOM_SEED),
    fonts: DETERMINISTIC_PARITY_FONTS,
    network: DETERMINISTIC_PARITY_NETWORK,
    ...overrides,
  };
  const query = QUERY_KEYS.map((key) => `${key}=${encodeURIComponent(values[key])}`).join("&");
  return `material-designer://${screen}?${query}`;
}

describe("deterministic material-designer capture routes", () => {
  it("maps only the six semantically owned screens to real web-router paths", () => {
    const expected = new Map([
      ["home", "/"],
      ["projects", "/projects"],
      ["design-systems", "/design-systems"],
      ["automations", "/automations"],
      ["plugins", "/plugins"],
      ["integrations", "/integrations"],
    ]);
    for (const [screen, browserPath] of expected) {
      const resolved = resolveDeterministicParityRoute(route(screen));
      expect(resolved.browserPath).toBe(browserPath);
      expect(new URL(resolved.browserUrl).pathname).toBe(browserPath);
      expect(resolved.tuple.screen).toBe(screen);
    }
  });

  it.each([
    ["studio", "route.studio_unresolved"],
    ["library", "route.library_hidden"],
    ["settings", "route.settings_appearance_unresolved"],
    ["handoff", "route.handoff_unresolved"],
    ["home", "route.theme_dark_unresolved"],
  ])("fails closed for the unresolved %s destination", (screen, code) => {
    const state = screen === "settings" ? "appearance" : "default";
    const raw = code === "route.theme_dark_unresolved"
      ? route(screen, state, { theme: "dark" })
      : route(screen, state);
    expect(() => resolveDeterministicParityRoute(raw)).toThrow(new RegExp(`^${code}:`));
  });

  it("requires explicit developer capture mode when an argv route is supplied", () => {
    const raw = route("home");
    expect(() => parseDeterministicParityRouteArgv(["desktop.exe", raw], {})).toThrow(
      /^capture\.mode_required:/,
    );
    expect(parseDeterministicParityRouteArgv(
      ["desktop.exe", DETERMINISTIC_PARITY_CAPTURE_FLAG, raw],
      {},
    )?.id).toBe("home-default-light");
  });

  it("requires a route when capture mode is enabled", () => {
    expect(() => parseDeterministicParityRouteArgv(
      ["desktop.exe", DETERMINISTIC_PARITY_CAPTURE_FLAG],
      {},
    )).toThrow(/^capture\.route_required:/);
    expect(() => parseDeterministicParityRouteArgv(
      ["desktop.exe"],
      { OD_DESIGN_PARITY_CAPTURE: "1" },
    )).toThrow(/^capture\.route_required:/);
  });

  it("rejects duplicate parity route arguments", () => {
    const raw = route("home");
    expect(() => parseDeterministicParityRouteArgv(
      ["desktop.exe", DETERMINISTIC_PARITY_CAPTURE_FLAG, raw, raw],
      {},
    )).toThrow(/^route\.argv_duplicate:/);
  });

  it("rejects unknown routes and malformed URL authority", () => {
    expect(() => resolveDeterministicParityRoute(route("not-a-screen"))).toThrow(/^route\.unknown:/);
    expect(() => resolveDeterministicParityRoute(route("home").replace("material-designer://", "https://"))).toThrow(
      /^route\.protocol:/,
    );
    expect(() => resolveDeterministicParityRoute(route("home").replace("material-designer://home", "material-designer://user:pass@home"))).toThrow(
      /^route\.shape:/,
    );
  });

  it("rejects a missing, duplicate, or reordered query key", () => {
    const valid = route("home");
    expect(() => resolveDeterministicParityRoute(valid.replace("&network=disabled", ""))).toThrow(
      /^route\.query_keys:/,
    );
    expect(() => resolveDeterministicParityRoute(`${valid}&network=disabled`)).toThrow(/^route\.query_keys:/);
    expect(() => resolveDeterministicParityRoute(valid.replace("state=default&theme=light", "theme=light&state=default"))).toThrow(
      /^route\.query_keys:/,
    );
  });

  it.each([
    ["state", "state", "not-a-state"],
    ["theme", "tuple.theme", "sepia"],
    ["width", "tuple.viewport", "1440.5"],
    ["height", "tuple.viewport", "0"],
    ["scale", "tuple.scale", "0"],
    ["locale", "tuple.locale", "fr-FR"],
    ["fixture", "tuple.fixture", "other-fixture"],
    ["time", "tuple.time", "2026-08-02T21:22:18.000Z"],
    ["motion", "tuple.motion", "running"],
    ["random", "tuple.random", "3004"],
    ["fonts", "tuple.fonts", "system"],
    ["network", "capture.network_policy", "enabled"],
  ])("rejects a %s tuple mutation with a stable boundary code", (key, code, value) => {
    expect(() => resolveDeterministicParityRoute(route("home", "default", { [key]: value }))).toThrow(
      new RegExp(`^${code}:`),
    );
  });

  it("accepts the declared scale and bilingual presentation variants", () => {
    expect(resolveDeterministicParityRoute(route("home", "default", { scale: "2" })).tuple.scale).toBe(2);
    expect(resolveDeterministicParityRoute(route("home", "default", { width: "720", locale: "bilingual" })).tuple.locale).toBe("bilingual");
  });

  it("allows only the exact accepted od:// route during capture navigation", () => {
    const resolved = resolveDeterministicParityRoute(route("home"));
    expect(isDeterministicParityNavigationAllowed(resolved, resolved.browserUrl)).toBe(true);
    for (const candidate of [
      "od://app/",
      `${resolved.browserUrl}&extra=1`,
      "file:///tmp/route.html",
      "data:text/html,route",
      "ftp://example.test/route",
      "custom://example.test/route",
    ]) {
      expect(isDeterministicParityNavigationAllowed(resolved, candidate)).toBe(false);
    }
  });

  it("keeps capture and eval inspection closed until readiness is true", () => {
    expect(isDeterministicParityCaptureReady(null)).toBe(false);
    expect(isDeterministicParityCaptureReady({ ready: false })).toBe(false);
    expect(isDeterministicParityCaptureReady({ ready: true })).toBe(true);
    expect(DETERMINISTIC_PARITY_NOT_READY_REASON).toBe(
      "deterministic parity capture readiness is not verified",
    );
    expect(isDeterministicParityReadinessInspectionExpression(
      "globalThis.__MATERIAL_DESIGNER_CAPTURE_READINESS__",
    )).toBe(true);
    expect(isDeterministicParityReadinessInspectionExpression(
      "document.querySelector('button').click()",
    )).toBe(false);
  });
});
