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
