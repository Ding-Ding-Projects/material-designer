import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const source = (relativePath: string): string =>
  readFileSync(join(desktopRoot, relativePath), "utf8");

describe("deterministic capture boundary source contracts", () => {
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
    expect(sidecars).toContain("captureSafeChildSourceEnv");
    expect(sidecars).toContain("options.captureMode ? {} : resolveSystemProxyEnv()");
    expect(sidecars).toContain("options.captureMode ? {} : options.desktopHandoffEnv");
    expect(sidecars).toContain("options.captureMode || options.posthogKey");
    expect(sidecars).toContain("options.captureMode || options.telemetryRelayUrl");
    expect(runtime).toContain('reasons.push("capture.network_audit_unresolved")');
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
      join(desktopRoot, "../../daemon/src/sidecar/index.ts"),
      "utf8",
    );
    const web = readFileSync(
      join(desktopRoot, "../../web/sidecar/index.ts"),
      "utf8",
    );
    const vela = readFileSync(
      join(desktopRoot, "../../daemon/src/routes/vela.ts"),
      "utf8",
    );
    const daemonPolicy = readFileSync(
      join(desktopRoot, "../../daemon/src/sidecar/capture-network-policy.ts"),
      "utf8",
    );
    const webPolicy = readFileSync(
      join(desktopRoot, "../../web/sidecar/capture-network-policy.ts"),
      "utf8",
    );
    expect(daemon).toContain("installCaptureNetworkPolicy");
    expect(web).toContain("installCaptureNetworkPolicy");
    expect(vela).toContain("capture.network_blocked_external");
    expect(daemonPolicy).toContain("isLoopbackHttpUrl");
    expect(webPolicy).toContain("isLoopbackHttpUrl");
    expect(daemonPolicy).toContain("capture.network_blocked_external");
    expect(webPolicy).toContain("capture.network_blocked_external");
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
    expect(captureRun).not.toContain("rm(");
  });

  it("publishes a renderer-owned settled witness after startup decisions", () => {
    const app = readFileSync(
      join(desktopRoot, "../web/src/App.tsx"),
      "utf8",
    );
    expect(app).toContain("const captureSettled = daemonLive");
    expect(app).toContain("data-od-capture-settled");
    expect(app).toContain("data-od-capture-settled-revision");
  });
});
