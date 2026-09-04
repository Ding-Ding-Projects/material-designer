import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

import { deterministicCapturePrelude } from "../../src/main/deterministic-capture-prelude.js";
import { resolveDeterministicParityRoute } from "../../src/main/deterministic-parity-route.js";

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const source = (relativePath: string): string =>
  readFileSync(join(desktopRoot, relativePath), "utf8");

describe("deterministic capture boundary source contracts", () => {
  it("forwards the deterministic tuple theme into the renderer appearance owner", () => {
    const prelude = source("src/main/deterministic-capture-prelude.ts");
    const app = readFileSync(join(desktopRoot, "../web/src/App.tsx"), "utf8");
    expect(prelude).toContain('currentRoot.setAttribute("data-theme", tuple.theme);');
    expect(app).toContain("deterministicCaptureTupleTheme");
    expect(app).toContain("theme: deterministicCaptureTupleTheme");
    expect(app).toContain("accentColor: config.accentColor");
    expect(app).toContain("data-od-renderer-route-path");
    expect(app).toContain("data-od-renderer-route-state");
    expect(app).toContain("data-od-fixture-source");
    expect(app).toContain("capture-provider");
    expect(app).toContain("capture-settled-v1");
  });

  it("applies a dark tuple theme before the renderer mounts", () => {
    const route = resolveDeterministicParityRoute(
      "material-designer://home?state=default&theme=dark&width=1440&height=900&scale=1&locale=en-US&fixture=material-designer-m3-v2&time=2026-08-02T21%3A22%3A17.000Z&motion=frozen&random=3003&fonts=bundled-roboto-v1&network=disabled",
      { captureEnabled: true },
    );
    const calls: Array<[string, string]> = [];
    const root = {
      dataset: {} as Record<string, string>,
      setAttribute: (name: string, value: string) => calls.push([name, value]),
      appendChild: () => undefined,
    };
    const document = {
      documentElement: root,
      createElement: () => ({ id: "", textContent: "" }),
      addEventListener: () => undefined,
    };
    runInNewContext(
      deterministicCapturePrelude(route, "run-0123456789abcdef0123456789abcdef"),
      { document },
    );
    expect(calls).toContainEqual(["data-theme", "dark"]);
  });

  it("declares daemonLive before the capture-settled hook reads it", () => {
    const app = readFileSync(join(desktopRoot, "../web/src/App.tsx"), "utf8");
    const daemonLiveDeclaration = app.indexOf("const [daemonLive, setDaemonLive] = useState(false);");
    const routeDeclaration = app.indexOf("const route = useRoute();");
    const captureSettledRead = app.indexOf("const captureSettled = deterministicCaptureTuple != null && daemonLive");
    expect(daemonLiveDeclaration).toBeGreaterThanOrEqual(0);
    expect(routeDeclaration).toBeGreaterThanOrEqual(0);
    expect(captureSettledRead).toBeGreaterThan(daemonLiveDeclaration);
    expect(captureSettledRead).toBeGreaterThan(routeDeclaration);
  });

  it("re-reads the document root when DOMContentLoaded supplies it", () => {
    const route = resolveDeterministicParityRoute(
      "material-designer://home?state=default&theme=dark&width=1440&height=900&scale=1&locale=en-US&fixture=material-designer-m3-v2&time=2026-08-02T21%3A22%3A17.000Z&motion=frozen&random=3003&fonts=bundled-roboto-v1&network=disabled",
      { captureEnabled: true },
    );
    let currentRoot: {
      dataset: Record<string, string>;
      setAttribute: (name: string, value: string) => void;
      appendChild: () => void;
    } | null = null;
    let onDomContentLoaded: (() => void) | undefined;
    const calls: Array<[string, string]> = [];
    const document = {
      get documentElement() {
        return currentRoot;
      },
      createElement: () => ({ id: "", textContent: "" }),
      addEventListener: (_event: string, callback: () => void) => {
        onDomContentLoaded = callback;
      },
    };
    runInNewContext(
      deterministicCapturePrelude(route, "run-0123456789abcdef0123456789abcdef"),
      { document },
    );
    expect(onDomContentLoaded).toBeTypeOf("function");
    currentRoot = {
      dataset: {},
      setAttribute: (name, value) => calls.push([name, value]),
      appendChild: () => undefined,
    };
    onDomContentLoaded?.();
    expect(calls).toContainEqual(["data-theme", "dark"]);
  });

  it("keeps Library, Appearance settings, and Handoff readiness owners explicit", () => {
    const runtime = source("src/main/runtime.ts");
    expect(runtime).toContain('library: \'[data-testid="entry-view-library"][data-active="true"]\'');
    expect(runtime).toContain('settings: \'.settings-page-shell .modal-settings.settings-page-surface [data-od-setting="section:appearance"]\'');
    expect(runtime).toContain('handoff: \'main[data-testid="handoff-page"][aria-labelledby="handoff-title"]\'');
    expect(runtime).toContain('library: "library"');
    expect(runtime).toContain('settings: "settings"');
    expect(runtime).toContain('handoff: "handoff"');
    expect(runtime).toContain('"/library": { screen: "library", state: "default" }');
    expect(runtime).toContain('"/settings/appearance": { screen: "settings", state: "appearance" }');
    expect(runtime).toContain('"/handoff": { screen: "handoff", state: "default" }');
  });

  it("forwards the capture network proof from desktop startup to the runtime", () => {
    const index = source("src/main/index.ts");
    expect(index).toContain("captureNetworkOrigin?: () => string | null;");
    expect(index).toContain("captureNetworkIsolationReady?: boolean;");
    expect(index).toContain("captureNetworkOrigin: options.captureNetworkOrigin");
    expect(index).toContain("captureNetworkIsolationReady: options.captureNetworkIsolationReady");
  });

  it("keeps unready capture terminal and content-free", () => {
    const runtime = source("src/main/runtime.ts");
    expect(runtime).toContain("capture.renderer_process_gone");
    expect(runtime).toContain("capture.readiness_evaluation_timeout");
    expect(runtime).toContain('setSplashStage(splash, "captureFailed")');
    expect(runtime).toContain("deterministicCaptureReadinessError()");
    expect(runtime).toContain('window.webContents.on("will-redirect"');
    expect(runtime).toContain("CAPTURE_SETTLED_STABILITY_INTERVAL_MS");
    expect(runtime.indexOf("capture.renderer_process_gone")).toBeLessThan(
      runtime.indexOf("if (gone) return;"),
    );
    expect(runtime).toContain("captureReceiptInstalled");
    expect(runtime).toContain("CAPTURE_RENDERER_OPERATION_TIMEOUT_MS");
    expect(runtime).toContain("runRendererOperation(\"capture_page\"");
    expect(runtime).toContain("runRendererOperation(\"screenshot\"");
    expect(runtime).toContain("runRendererOperation(\"eval\"");
    expect(runtime).toContain("runRendererOperation(\"click\"");
    expect(runtime).toContain("runRendererOperation(\"export_artifact\"");
    expect(runtime).toContain("runRendererOperation(\"export_pdf\"");
    expect(runtime).toContain("runRendererOperation(\"render_slides\"");
  });

  it("gives capture its own launcher namespace and skips ordinary handoff", () => {
    const packaged = readFileSync(
      join(desktopRoot, "../packaged/src/index.ts"),
      "utf8",
    );
    expect(packaged).toContain('app.setPath(\n      "userData"');
    expect(packaged).toContain('namespaceBaseRoot: join(app.getPath("userData"), "namespaces")');
    expect(packaged).toContain("OD_DATA_DIR: undefined");
    expect(packaged).toContain("deterministicParityRoute == null");
    expect(packaged).toContain("claimPackagedSingleInstanceLock");
    expect(packaged).toContain("inspectExistingDesktopForLauncher");
  });

  it("audits capture child networking and startup telemetry before readiness", () => {
    const packaged = readFileSync(
      join(desktopRoot, "../packaged/src/index.ts"),
      "utf8",
    );
    const sidecars = readFileSync(
      join(desktopRoot, "../packaged/src/sidecars.ts"),
      "utf8",
    );
    const runtime = source("src/main/runtime.ts");
    expect(packaged).toContain("startupTelemetryContext = null");
    expect(packaged).toContain("if (deterministicParityRoute == null) applyPackagedUpdaterEnv");
    expect(packaged).toContain("captureMode: deterministicParityRoute != null");
    expect(packaged).toContain("captureNetworkIsolationReady: sidecars.captureNetworkIsolationReady");
    expect(sidecars).toContain("captureSafeChildSourceEnv");
    expect(sidecars).toContain("options.captureMode ? {} : resolveSystemProxyEnv()");
    expect(sidecars).toContain("options.captureMode ? {} : options.desktopHandoffEnv");
    expect(sidecars).toContain("options.captureMode || options.posthogKey");
    expect(sidecars).toContain("options.captureMode || options.telemetryRelayUrl");
    expect(runtime).toContain('reasons.push("capture.network_audit_unresolved")');
    expect(runtime).toContain("capture.network_origin_changed");
    expect(runtime).toContain("capture.network_blocked_after_ready");
    expect(runtime).toContain("capture.network_origin_unverified");
    expect(sidecars).toContain("capture-network-policy-v2");
    expect(sidecars).toContain("allowedOriginClass");
    expect(sidecars).toContain("captureNetworkIsolationReady = false");
  });

  it("does not forward migration state, update feeds, or uninstall writes into capture", () => {
    const packaged = readFileSync(
      join(desktopRoot, "../packaged/src/index.ts"),
      "utf8",
    );
    const sidecars = readFileSync(
      join(desktopRoot, "../packaged/src/sidecars.ts"),
      "utf8",
    );
    const desktop = source("src/main/index.ts");
    expect(sidecars).toContain("legacyDataDir: options.captureMode");
    expect(sidecars).toContain("options.captureMode || options.legacyDataDir");
    expect(packaged).toContain("if (deterministicParityRoute == null) {");
    expect(packaged).toContain("syncWindowsUninstallDisplayVersion");
    expect(desktop).toContain("OD_UPDATE_ENABLED: \"0\"");
    expect(desktop).toContain("if (captureRoute == null) {");
    expect(sidecars).toContain("resolveDaemonStatusTimeoutMs(process.env, process.platform, options.captureMode === true)");
    expect(sidecars).toContain("OD_DESIGN_PARITY_CAPTURE");
  });

  it("invalidates a ready capture on renderer and HTTP load failure", () => {
    const runtime = source("src/main/runtime.ts");
    expect(runtime).toContain("capture.renderer_process_gone");
    expect(runtime).toContain("capture.did_fail_load");
    expect(runtime).toContain("capture.http_error_document");
    expect(runtime).toContain("invalidateCaptureReadiness");
    expect(runtime).toContain("await installCaptureReadinessReceipt()");
    expect(runtime).toContain("configurable: true");
  });

  it("arms both packaged sidecars with the capture-only egress policy", () => {
    const daemon = readFileSync(
      join(desktopRoot, "../daemon/src/sidecar/index.ts"),
      "utf8",
    );
    const web = readFileSync(
      join(desktopRoot, "../web/sidecar/index.ts"),
      "utf8",
    );
    const vela = readFileSync(
      join(desktopRoot, "../daemon/src/routes/vela.ts"),
      "utf8",
    );
    const daemonPolicy = readFileSync(
      join(desktopRoot, "../daemon/src/sidecar/capture-network-policy.ts"),
      "utf8",
    );
    const webPolicy = readFileSync(
      join(desktopRoot, "../web/sidecar/capture-network-policy.ts"),
      "utf8",
    );
    expect(daemon).toContain("installCaptureNetworkPolicy");
    expect(web).toContain("installCaptureNetworkPolicy");
    expect(vela).toContain("capture.network_blocked_external");
    expect(daemonPolicy).toContain("isLoopbackHttpUrl");
    expect(webPolicy).toContain("isLoopbackHttpUrl");
    expect(daemonPolicy).toContain("capture.network_blocked_external");
    expect(webPolicy).toContain("capture.network_blocked_external");
    expect(daemonPolicy).toContain("CAPTURE_NETWORK_POLICY_ACKNOWLEDGEMENT");
    expect(webPolicy).toContain("CAPTURE_NETWORK_POLICY_ACKNOWLEDGEMENT");
  });

  it("keeps per-run locking and evidence-retention policy exact", () => {
    const captureRun = readFileSync(
      join(desktopRoot, "../packaged/src/capture-run.ts"),
      "utf8",
    );
    expect(captureRun).toContain("capture.run_namespace_collision");
    expect(captureRun).toContain('await mkdir(root)');
    expect(captureRun).toContain('await open(lockPath, "wx")');
    expect(captureRun).toContain("CAPTURE_RUN_RETENTION_POLICY");
    expect(captureRun).toContain('join(root, "retired.json")');
    expect(captureRun).toContain('CAPTURE_RUN_FAILURE_RETENTION_MARKER');
    expect(captureRun).toContain('lock?.close()');
    expect(captureRun).not.toContain("rm(");
    expect(captureRun).toContain("lstat");
    expect(captureRun).toContain("retireTask");
  });

  it("does not mutate ordinary user storage from the capture prelude", () => {
    const runtime = source("src/main/runtime.ts");
    const preludeSource = source("src/main/deterministic-capture-prelude.ts");
    expect(runtime).toContain("deterministicCapturePrelude(route, runId)");
    expect(preludeSource).toContain("Object.defineProperty(globalThis, \"__MATERIAL_DESIGNER_CAPTURE_RUN_ID__\"");
    for (const key of [
      "open-design:config",
      "open-design:language-mode",
      "open-design:locale",
      "open-design:locale-source",
      "od.settings.lastSection",
    ]) {
      expect(preludeSource).not.toContain(`localStorage.setItem(\"${key}\"`);
    }
  });

  it("preserves ordinary storage bytes and installs an exact non-writable run id", () => {
    const route = resolveDeterministicParityRoute(
      "material-designer://home?state=default&theme=light&width=1440&height=900&scale=1&locale=en-US&fixture=material-designer-m3-v2&time=2026-08-02T21%3A22%3A17.000Z&motion=frozen&random=3003&fonts=bundled-roboto-v1&network=disabled",
      { captureEnabled: true },
    );
    const runId = "run-0123456789abcdef0123456789abcdef";
    const ordinaryBytes = Buffer.from('{"onboardingCompleted":false,"theme":"dark"}', "utf8");
    const storage = {
      bytes: Buffer.from(ordinaryBytes),
      setItem: () => { throw new Error("ordinary storage mutation"); },
      getItem: () => ordinaryBytes.toString("utf8"),
    };
    const root = {
      dataset: {} as Record<string, string>,
      setAttribute: () => undefined,
      removeAttribute: () => undefined,
      appendChild: () => undefined,
    };
    const document = {
      documentElement: root,
      createElement: () => ({ dataset: {} as Record<string, string>, textContent: "" }),
      addEventListener: () => undefined,
    };
    const context = { document, localStorage: storage } as Record<string, unknown>;
    runInNewContext(deterministicCapturePrelude(route, runId), context);
    expect(storage.bytes.equals(ordinaryBytes)).toBe(true);
    expect(context.__MATERIAL_DESIGNER_CAPTURE_RUN_ID__).toBe(runId);
    expect(Object.getOwnPropertyDescriptor(context, "__MATERIAL_DESIGNER_CAPTURE_RUN_ID__"))
      .toMatchObject({ configurable: false, writable: false, value: runId });
    const tuple = context.__MATERIAL_DESIGNER_CAPTURE_TUPLE__ as {
      viewport: { width: number; height: number };
    };
    const identity = context.__MATERIAL_DESIGNER_CAPTURE_IDENTITY__ as {
      routeId: string;
      semanticState: { screen: string; state: string; browserPath: string };
    };
    expect(Object.isFrozen(tuple)).toBe(true);
    expect(Object.isFrozen(tuple.viewport)).toBe(true);
    expect(Object.isFrozen(identity)).toBe(true);
    expect(Object.isFrozen(identity.semanticState)).toBe(true);
    expect(Reflect.set(tuple.viewport, "width", 1)).toBe(false);
    expect(Reflect.set(identity.semanticState, "browserPath", "/wrong")).toBe(false);
    expect(tuple.viewport.width).toBe(1440);
    expect(identity.semanticState.browserPath).toBe(route.browserPath);
  });

  it("keeps capture handlers, processes, and env roots hand-written and explicit", () => {
    const boundary = readFileSync(
      join(desktopRoot, "../daemon/src/capture-boundary.ts"),
      "utf8",
    );
    for (const required of [
      "CAPTURE_HANDLER_INVENTORY",
      "CAPTURE_PROCESS_INVENTORY",
      "CAPTURE_ENV_INVENTORY",
      "capture.external_runtime_blocked",
      "capture-fixture-agent",
    ]) expect(boundary).toContain(required);
    expect(boundary).toContain("createCaptureBoundaryMiddleware");
    expect(boundary).toContain("CAPTURE_READ_ROUTE_INVENTORY");
    expect(boundary).toContain("capture.unclassified_route_blocked");
    expect(boundary).toContain("USERPROFILE");
    expect(boundary).toContain("TMPDIR");
  });

  it("refuses capture payload delegation and native side effects", () => {
    const packaged = readFileSync(
      join(desktopRoot, "../packaged/src/index.ts"),
      "utf8",
    );
    const payload = readFileSync(
      join(desktopRoot, "../packaged/src/payload-desktop-launch.ts"),
      "utf8",
    );
    const index = source("src/main/index.ts");
    const runtime = source("src/main/runtime.ts");
    expect(packaged).toContain("capture.payload_delegation_blocked");
    expect(payload).toContain("isParityCaptureArg");
    expect(index).toContain("captureRoute == null");
    expect(runtime).toContain("capture.side_effect_blocked");
    expect(runtime).toContain("webviewTag: captureRoute == null");
  });

  it("publishes a renderer-owned settled witness after startup decisions", () => {
    const app = readFileSync(
      join(desktopRoot, "../web/src/App.tsx"),
      "utf8",
    );
    expect(app).toContain("const captureSettled = deterministicCaptureTuple != null && daemonLive");
    expect(app).toContain("data-od-capture-settled");
    expect(app).toContain("data-od-capture-settled-revision");
  });

  it("deep-freezes tuple and nested readiness receipt graphs", () => {
    const route = readFileSync(
      join(desktopRoot, "src/main/deterministic-parity-route.ts"),
      "utf8",
    );
    const runtime = source("src/main/runtime.ts");
    expect(route).toContain("deepFreezeDeterministicParityValue");
    expect(runtime).toContain("deepFreeze(${readinessJson})");
    expect(runtime).toContain("deepFreezeDeterministicParityValue");
  });

  it("keeps appearance and downloads capture-fail-closed", () => {
    const runtime = source("src/main/runtime.ts");
    expect(runtime).toContain("capture.appearance_mutation_blocked");
    expect(runtime).toContain("event.preventDefault()");
    expect(runtime).toContain("item.cancel()");
    expect(runtime).toContain("capture.download_blocked");
  });

  it("requires the packaged outer launcher before direct capture bootstrap", () => {
    const desktop = source("src/main/index.ts");
    const packaged = readFileSync(join(desktopRoot, "../packaged/src/index.ts"), "utf8");
    expect(desktop).toContain("capture.packaged_launcher_required");
    expect(desktop).toContain("capturePackagedLauncher !== true");
    expect(packaged).toContain("capturePackagedLauncher: deterministicParityRoute != null");
  });
});
