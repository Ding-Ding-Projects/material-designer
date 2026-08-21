import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_MODES,
  SIDECAR_SOURCES,
  type SidecarStamp,
} from "@open-design/sidecar-proto";
import {
  parseLauncherAfterQuitArgs,
  parseLauncherDelegatedArgs,
  parseLauncherHandoffResumeArgs,
} from "@open-design/launcher-proto";
import {
  bootstrapSidecarRuntime,
  createSidecarLaunchEnv,
  resolveAppIpcPath,
} from "@open-design/sidecar";
import {
  applyLoopbackConnectionLimitSwitch,
  applyOsLocaleSwitch,
  createDeterministicParityCaptureRunId,
  createSplashWindow,
  deterministicParityChromiumLocale,
  deterministicParityCaptureSidecarNamespace,
  DETERMINISTIC_PARITY_CAPTURE_ROOT_SEGMENT,
  deterministicParitySessionPartition,
  parseDeterministicParityRouteArgv,
  setSplashStage,
  type DeterministicParityRoute,
} from "@open-design/desktop/main";
import { readProcessStamp } from "@open-design/platform";
import { spawn, spawnSync } from "node:child_process";
import { basename, dirname, join } from "node:path";
import { app, BrowserWindow, dialog } from "electron";

import { readPackagedConfig } from "./config.js";
import {
  acquireDeterministicParityCaptureRun,
  type DeterministicParityCaptureRunLease,
} from "./capture-run.js";
import {
  claimPackagedDownloadAttribution,
  discoverPackagedDownloadAttribution,
} from "./download-attribution.js";
import { writePackagedDesktopIdentity } from "./identity.js";
import {
  parsePackagedHeadlessRequest,
  resolvePackagedMcpBootstrapLaunch,
} from "./headless-runtime.js";
import { PackagedPathAccessError } from "./errors.js";
import {
  exitPackagedLauncherForExistingDesktop,
  inspectExistingDesktopForLauncher,
  waitForLauncherAfterQuit,
} from "./launcher-after-quit.js";
import { confirmPackagedLauncherRuntime, resolvePackagedLauncherRuntime } from "./launcher-runtime.js";
import {
  applyPackagedElectronPathOverrides,
  claimPackagedSingleInstanceLock,
  createPackagedSecondInstanceHandoff,
  ensurePackagedNamespacePaths,
  stabilizePackagedWorkingDirectory,
} from "./launch.js";
import {
  attachPackagedDesktopProcessLogging,
  createPackagedDesktopLogger,
  type PackagedDesktopLogger,
} from "./logging.js";
import { resolvePackagedNamespacePaths } from "./paths.js";
import { createObsoleteInstalledOuterRetirement } from "./obsolete-installed-outer.js";
import { findPackagedDeeplinkArg, launchPackagedPayloadDesktop } from "./payload-desktop-launch.js";
import { packagedEntryUrl, registerOdProtocol } from "./protocol.js";
import { startPackagedSidecars, type PackagedSidecarHandle } from "./sidecars.js";
import type { PackagedDesktopIdentityHandle } from "./identity.js";
import { reportStartupFailure, resolveStartupDistinctId } from "./startup-telemetry.js";
import { resolvePackagedWindowTitle } from "./window-title.js";
import { syncWindowsUninstallDisplayVersion } from "./windows-lifecycle.js";

let packagedLogger: PackagedDesktopLogger | null = null;
const secondInstanceHandoff = createPackagedSecondInstanceHandoff();
let activeCaptureRunLease: DeterministicParityCaptureRunLease | null = null;
let activeCaptureMode = false;
let activeCaptureSidecars: PackagedSidecarHandle | null = null;
let activeCaptureIdentity: PackagedDesktopIdentityHandle | null = null;
let activeCaptureProtocolDisposer: (() => void) | null = null;
let activeCaptureSplash: BrowserWindow | null = null;
let captureCleanupTask: Promise<void> | null = null;

/** Idempotent outer cleanup for both normal shutdown and startup failures. */
async function cleanupCaptureResources(): Promise<void> {
  if (captureCleanupTask != null) return await captureCleanupTask;
  captureCleanupTask = (async () => {
    activeCaptureProtocolDisposer?.();
    activeCaptureProtocolDisposer = null;
    if (activeCaptureSidecars != null) {
      await activeCaptureSidecars.close().catch(() => undefined);
    }
    activeCaptureSidecars = null;
    if (activeCaptureIdentity != null) {
      await activeCaptureIdentity.close().catch(() => undefined);
    }
    activeCaptureIdentity = null;
    if (activeCaptureSplash != null && !activeCaptureSplash.isDestroyed()) {
      activeCaptureSplash.close();
    }
    activeCaptureSplash = null;
    await activeCaptureRunLease?.retire().catch(() => undefined);
    activeCaptureRunLease = null;
  })();
  return await captureCleanupTask;
}

// Telemetry context for the fatal-exit path. Populated once config + launcher
// runtime are resolved so the `main().catch` below can report a startup failure
// even though the daemon (the PostHog host) never came up. Null until then —
// failures earlier than config resolution simply skip telemetry. See
// `startup-telemetry.ts` for the zero-startup-side-effect contract.
let startupTelemetryContext:
  | {
      posthogKey: string | null;
      posthogHost: string | null;
      appVersion: string | null;
      namespace: string;
      source: string;
      installationRoot: string;
      nativeModulePath: string | null;
    }
  | null = null;

function createPackagedDesktopStamp(namespace: string): SidecarStamp {
  return {
    app: APP_KEYS.DESKTOP,
    ipc: resolveAppIpcPath({
      app: APP_KEYS.DESKTOP,
      contract: OPEN_DESIGN_SIDECAR_CONTRACT,
      namespace,
    }),
    mode: SIDECAR_MODES.RUNTIME,
    namespace,
    source: SIDECAR_SOURCES.PACKAGED,
  };
}

function applyLaunchEnv(base: string, stamp: SidecarStamp): void {
  const env = createSidecarLaunchEnv({
    base,
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
    stamp,
  });

  for (const [key, value] of Object.entries(env)) {
    if (value != null) process.env[key] = value;
  }
}

function applyPackagedUpdaterEnv(updateMetadataUrl: string | null): void {
  if (updateMetadataUrl == null) return;
  if (process.env.OD_UPDATE_METADATA_URL != null && process.env.OD_UPDATE_METADATA_URL.length > 0) return;
  process.env.OD_UPDATE_METADATA_URL = updateMetadataUrl;
}

type SquirrelStartupEvent =
  | "--squirrel-install"
  | "--squirrel-updated"
  | "--squirrel-uninstall"
  | "--squirrel-obsolete";

const SQUIRREL_STARTUP_EVENTS = new Set<SquirrelStartupEvent>([
  "--squirrel-install",
  "--squirrel-updated",
  "--squirrel-uninstall",
  "--squirrel-obsolete",
]);

const SQUIRREL_SHORTCUT_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "$shell = New-Object -ComObject WScript.Shell",
  "$programs = [Environment]::GetFolderPath('Programs')",
  "$desktop = [Environment]::GetFolderPath('Desktop')",
  "$startMenuShortcut = Join-Path $programs 'Material Designer.lnk'",
  "$desktopShortcut = Join-Path $desktop 'Material Designer.lnk'",
  "$wrongStartMenuShortcut = Join-Path $programs 'GitHub, Inc.\\Electron.lnk'",
  "$wrongDesktopShortcut = Join-Path $desktop 'Electron.lnk'",
  "if ($env:OD_SQUIRREL_EVENT -eq '--squirrel-uninstall') {",
  "  Remove-Item -LiteralPath $startMenuShortcut, $desktopShortcut, $wrongStartMenuShortcut, $wrongDesktopShortcut -Force -ErrorAction SilentlyContinue",
  "} else {",
  "  foreach ($path in @($startMenuShortcut, $desktopShortcut)) {",
  "    $shortcut = $shell.CreateShortcut($path)",
  "    $shortcut.TargetPath = $env:OD_SQUIRREL_ROOT_LAUNCHER",
  "    $shortcut.WorkingDirectory = $env:OD_SQUIRREL_WORKING_DIRECTORY",
  "    $shortcut.IconLocation = $env:OD_SQUIRREL_ICON_LOCATION",
  "    $shortcut.Description = 'Material Designer'",
  "    $shortcut.Save()",
  "  }",
  "  Remove-Item -LiteralPath $wrongStartMenuShortcut, $wrongDesktopShortcut -Force -ErrorAction SilentlyContinue",
  "}",
].join("; ");

export function reconcileSquirrelShortcuts(event: SquirrelStartupEvent): boolean {
  if (event === "--squirrel-obsolete") return true;
  const executableName = basename(process.execPath);
  const versionDirectory = dirname(process.execPath);
  const rootLauncher = join(versionDirectory, "..", executableName);
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-Sta", "-Command", SQUIRREL_SHORTCUT_SCRIPT],
    {
      env: {
        ...process.env,
        OD_SQUIRREL_EVENT: event,
        OD_SQUIRREL_ICON_LOCATION: `${process.execPath},0`,
        OD_SQUIRREL_ROOT_LAUNCHER: rootLauncher,
        OD_SQUIRREL_WORKING_DIRECTORY: versionDirectory,
      },
      stdio: "ignore",
      timeout: 30_000,
      windowsHide: true,
    },
  );
  return result.status === 0 && result.error == null;
}

/**
 * Squirrel.Windows starts the packaged executable with a lifecycle switch
 * before it starts the normal application. Handle those switches before
 * config, sidecars, single-instance state, or the renderer can start.
 */
export function handleSquirrelStartupEvent(): boolean {
  if (process.platform !== "win32") return false;
  const event = process.argv.slice(1).find((argument): argument is SquirrelStartupEvent =>
    SQUIRREL_STARTUP_EVENTS.has(argument as SquirrelStartupEvent),
  );
  if (event == null) return false;

  // The executable deliberately keeps electron-builder's combined
  // signAndEditExecutable switch disabled under the permanent no-signing
  // policy, so its version resource remains Electron/GitHub, Inc. Delegating
  // shortcut creation to Update.exe therefore creates Electron.lnk in a
  // GitHub, Inc. folder. Create the product-owned shortcuts explicitly and
  // fail the lifecycle event if that cannot be completed.
  const shortcutsReady = reconcileSquirrelShortcuts(event);
  app.exit(shortcutsReady ? 0 : 1);
  return true;
}

async function main(): Promise<void> {
  // Windows keys taskbar grouping, jump lists, and notification identity off
  // the AppUserModelID. Without an explicit id it falls back to the
  // electron-builder appId, which is how a fork ends up sharing taskbar and
  // notification identity with the app it was forked from. Must run before
  // `app.whenReady()`; no-op on other platforms.
  app.setAppUserModelId("io.ding-ding.material-designer");

  const headlessRequest = parsePackagedHeadlessRequest(process.argv.slice(1));
  // A normalized parity route is accepted only in the explicit developer /
  // capture mode. Unknown, malformed, or semantically unresolved rows fail
  // before sidecars or a renderer can start; normal launches have no route.
  const deterministicParityRoute: DeterministicParityRoute | null =
    headlessRequest.headless
      ? null
      : parseDeterministicParityRouteArgv(process.argv, process.env);
  activeCaptureMode = deterministicParityRoute != null;
  const captureRunId = deterministicParityRoute == null
    ? null
    : createDeterministicParityCaptureRunId();
  if (deterministicParityRoute != null) {
    // Capture has a unique per-launch lease beneath a forced root, so an
    // ordinary instance or a stale run cannot reuse its profile, sidecars,
    // logs, protocol state, identity, or single-instance handoff. The route id
    // remains the tuple identity; captureRunId is storage identity only.
    activeCaptureRunLease = await acquireDeterministicParityCaptureRun({
      captureRoot: join(app.getPath("userData"), DETERMINISTIC_PARITY_CAPTURE_ROOT_SEGMENT),
      routeId: deterministicParityRoute.id,
      runId: captureRunId!,
    });
    app.setPath(
      "userData",
      activeCaptureRunLease.root,
    );
  }
  const loadedConfig = await readPackagedConfig({ captureMode: deterministicParityRoute != null });
  const config = deterministicParityRoute == null
    ? loadedConfig
    : {
        ...loadedConfig,
        namespaceBaseRoot: join(app.getPath("userData"), "namespaces"),
      };
  if (headlessRequest.headless) {
    const { runPackagedHeadless } = await import("./headless-runtime.js");
    await runPackagedHeadless(config, headlessRequest);
    return;
  }

  // Must run BEFORE `app.whenReady()` below, because Chromium consumes
  // `--lang` at session bootstrap. Doing it here lets the packaged
  // renderer's `navigator.language` follow the OS instead of Chromium's
  // en-US default. runDesktopMain (called later) calls the same helper
  // again to recover the resolved locale string for the BrowserWindow.
  if (deterministicParityRoute) {
    app.commandLine.appendSwitch(
      "force-device-scale-factor",
      String(deterministicParityRoute.tuple.scale),
    );
    app.commandLine.appendSwitch(
      "lang",
      deterministicParityChromiumLocale(deterministicParityRoute.tuple),
    );
  } else {
    applyOsLocaleSwitch(app);
  }
  // Must also land before whenReady — see the helper's docblock for the
  // connection-pool deadlock it prevents (electron/electron#47097).
  applyLoopbackConnectionLimitSwitch(app);
  // Belt-and-braces duplicate of the helper above: the packaged outer
  // shell can outlive auto-updates that only refresh inner resources, so
  // the deadlock fix must not depend on which desktop build the shell
  // happens to bundle. appendSwitch is idempotent for the same key.
  app.commandLine.appendSwitch("ignore-connections-limit", "127.0.0.1,localhost");

  const afterQuit = parseLauncherAfterQuitArgs(process.argv.slice(1));
  const handoffResume = parseLauncherHandoffResumeArgs(process.argv.slice(1));
  const delegated = parseLauncherDelegatedArgs(process.argv.slice(1));
  const argvStamp = readProcessStamp(process.argv.slice(1), OPEN_DESIGN_SIDECAR_CONTRACT);
  const namespace = deterministicParityRoute != null
    ? deterministicParityCaptureSidecarNamespace(deterministicParityRoute, captureRunId!)
    : argvStamp?.namespace ?? config.namespace;
  const namespaceConfig = namespace === config.namespace ? config : { ...config, namespace };
  const namespaceEnvironment = deterministicParityRoute == null
    ? process.env
    : { ...process.env, OD_DATA_DIR: undefined };
  const initialPaths = resolvePackagedNamespacePaths(namespaceConfig, namespace, namespaceEnvironment);
  if (!await waitForLauncherAfterQuit(afterQuit, initialPaths)) {
    app.exit(1);
    return;
  }
  const existingDesktop = deterministicParityRoute == null
    ? await inspectExistingDesktopForLauncher(namespace, {
        deeplinkUrl: findPackagedDeeplinkArg(process.argv),
        incomingVersion: namespaceConfig.appVersion,
        logger: console,
        paths: initialPaths,
      })
    : null;
  if (
    deterministicParityRoute == null
    && exitPackagedLauncherForExistingDesktop(existingDesktop, (code) => app.exit(code))
  ) {
    return;
  }
  const stamp = argvStamp ?? createPackagedDesktopStamp(namespace);
  const launcherRuntime = await resolvePackagedLauncherRuntime(namespaceConfig, initialPaths, {
    delegated,
    resume: handoffResume,
  });
  if (deterministicParityRoute != null && launcherRuntime.source === "payload" && !launcherRuntime.payloadDesktopProcess) {
    throw new Error("capture.payload_delegation_blocked: capture must not delegate to a second payload desktop");
  }
  if (await launchPackagedPayloadDesktop(launcherRuntime, stamp)) {
    app.exit(0);
    return;
  }
  const activeConfig = launcherRuntime.config;
  const paths = launcherRuntime.paths;
  const mcpBootstrap = resolvePackagedMcpBootstrapLaunch({
    installedLaunchPath: launcherRuntime.installedLaunchPath,
  });

  // Arm fatal-exit telemetry for ordinary launches only. Capture launches
  // must not make a main-process network call on startup failure.
  if (deterministicParityRoute == null) {
    startupTelemetryContext = {
      posthogKey: activeConfig.posthogKey,
      posthogHost: activeConfig.posthogHost,
      appVersion: activeConfig.appVersion,
      namespace,
      source: SIDECAR_SOURCES.PACKAGED,
      // Pass installationRoot explicitly: OD_INSTALLATION_DIR is only set in the
      // daemon child env, not this parent process (see startup-telemetry.ts).
      installationRoot: paths.installationRoot,
      // Absolute path where the daemon's better-sqlite3 binding ships in the
      // packaged bundle (`Contents/Resources/app/node_modules/...` — layout
      // verified against the shipped 0.13.0 DMG). The fatal-exit report probes
      // this to record whether the .node actually exists on the crashing machine.
      nativeModulePath: join(
        app.getAppPath(),
        "node_modules",
        "better-sqlite3",
        "build",
        "Release",
        "better_sqlite3.node",
      ),
    };
  } else {
    startupTelemetryContext = null;
  }

  await ensurePackagedNamespacePaths(paths);
  stabilizePackagedWorkingDirectory(paths);
  const downloadAttribution = await discoverPackagedDownloadAttribution(paths, console).catch((error: unknown) => {
    console.warn("[attribution] failed to discover packaged download attribution", error);
    return null;
  });
  packagedLogger = createPackagedDesktopLogger(paths);
  attachPackagedDesktopProcessLogging({ logger: packagedLogger, paths, stamp });
  const retireObsoleteInstalledOuter = deterministicParityRoute != null
    ? async () => undefined
    : createObsoleteInstalledOuterRetirement({
        currentExecutablePath: process.execPath,
        currentPid: process.pid,
        installedLaunchPath: launcherRuntime.installedLaunchPath,
        logger: packagedLogger,
        payloadDesktopProcess: launcherRuntime.payloadDesktopProcess,
        payloadExecutablePath: launcherRuntime.desktopExecutablePath,
        platform: process.platform,
      });
  applyPackagedElectronPathOverrides(paths);
  if (deterministicParityRoute == null) applyPackagedUpdaterEnv(activeConfig.updateMetadataUrl);
  if (deterministicParityRoute == null) {
    if (!claimPackagedSingleInstanceLock(app, (argv) => {
      secondInstanceHandoff.handle(findPackagedDeeplinkArg(argv));
    })) {
      return;
    }
  }
  const identity = await writePackagedDesktopIdentity({ paths, stamp });
  if (deterministicParityRoute != null) activeCaptureIdentity = identity;
  await app.whenReady();

  // Show the brand splash IMMEDIATELY, before we await the daemon/web sidecars
  // below. Cold boot otherwise leaves the user staring at no window at all for
  // the few seconds the sidecars take to come up; putting the animation on
  // screen in parallel masks that gap, and the runtime keeps it up until the
  // real app has mounted (see createDesktopRuntime). The handle carries the
  // creation timestamp so the runtime's minimum-hold timer counts from here —
  // BEFORE the sidecar boot below — rather than re-adding the delay afterwards.
  const splash = createSplashWindow();
  if (deterministicParityRoute != null) activeCaptureSplash = splash.window;

  applyLaunchEnv(paths.runtimeRoot, stamp);

  const runtime = bootstrapSidecarRuntime(stamp, process.env, {
    app: APP_KEYS.DESKTOP,
    base: paths.runtimeRoot,
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
  });

  const sidecars = await startPackagedSidecars(runtime, paths, {
    appVersion: activeConfig.appVersion,
    amrProfile: deterministicParityRoute == null ? activeConfig.amrProfile : null,
    daemonCliEntry: activeConfig.daemonCliEntry,
    daemonSidecarEntry: activeConfig.daemonSidecarEntry,
    electronNodeCommand: launcherRuntime.electronNodeCommand,
    mcpBootstrapArgs: deterministicParityRoute == null ? mcpBootstrap.args : [],
    mcpBootstrapCommand: deterministicParityRoute == null ? mcpBootstrap.command : null,
    nodeCommand: activeConfig.nodeCommand,
    telemetryRelayUrl: deterministicParityRoute == null ? activeConfig.telemetryRelayUrl : null,
    posthogKey: deterministicParityRoute == null ? activeConfig.posthogKey : null,
    posthogHost: deterministicParityRoute == null ? activeConfig.posthogHost : null,
    velaWebUrl: deterministicParityRoute == null ? activeConfig.velaWebUrl : null,
    velaWebUrls: deterministicParityRoute == null ? activeConfig.velaWebUrls : {},
    // PR #974 round-5 (lefarcen P2): the Electron entry runs desktop
    // main alongside the daemon, so the import-folder gate must be
    // pinned ON from request 0. See `apps/packaged/src/headless-runtime.ts`
    // for the windowless counterpart that passes `false`.
    requireDesktopAuth: true,
    webSidecarEntry: activeConfig.webSidecarEntry,
    webStandaloneRoot: activeConfig.webStandaloneRoot,
    webOutputMode: activeConfig.webOutputMode,
    captureMode: deterministicParityRoute != null,
    captureRunRoot: deterministicParityRoute == null ? null : activeCaptureRunLease?.root ?? null,
    // Surface each sidecar boot phase on the splash status line so a slow
    // cold start (Defender scans, native module loads) never reads as a hang.
    // Both the "spawning" and "ready" edges are mapped so the step counter
    // advances the instant each long native wait clears.
    onPhase(phase) {
      const stage =
        phase === "daemon-spawning"
          ? "engine"
          : phase === "daemon-ready"
            ? "engineReady"
            : phase === "web-spawning"
              ? "interface"
              : "interfaceReady";
      setSplashStage(splash.window, stage);
    },
  });
  if (deterministicParityRoute != null) activeCaptureSidecars = sidecars;
  if (sidecars.daemon.url && deterministicParityRoute == null) {
    void claimPackagedDownloadAttribution({
      attribution: downloadAttribution,
      daemonUrl: sidecars.daemon.url,
      installerObservationRoot: paths.installerObservationRoot,
      logger: packagedLogger,
    });
  }
  // Sidecars are up; the remaining wait is the hidden main window loading and
  // mounting the web bundle (the runtime re-asserts this stage at its reveal
  // gate, which is a no-op when the label is already current).
  setSplashStage(splash.window, "workspace");
  // Resolve the web sidecar address per request instead of freezing it here.
  // The restart supervisor may bind a fresh ephemeral port, while a temporary
  // lack of a target should surface as the protocol layer's structured 503.
  const disposeOdProtocol = registerOdProtocol(
    () => sidecars.currentWebUrl(),
    deterministicParityRoute == null
      ? undefined
      : deterministicParitySessionPartition(deterministicParityRoute, captureRunId!),
    {
      blockRedirects: deterministicParityRoute != null,
      requireLoopbackOrigin: deterministicParityRoute != null,
    },
  );
  if (deterministicParityRoute != null) activeCaptureProtocolDisposer = disposeOdProtocol;

  const { runDesktopMain } = await import("@open-design/desktop/main");
  await runDesktopMain(runtime, {
    captureRoute: deterministicParityRoute,
    captureNetworkOrigin: () => sidecars.currentWebUrl(),
    captureNetworkIsolationReady: sidecars.captureNetworkIsolationReady,
    captureRunId,
    splashWindow: splash.window,
    splashStartedAt: splash.startedAt,
    async beforeShutdown() {
      if (deterministicParityRoute != null) {
        await cleanupCaptureResources();
        return;
      }
      try {
        await retireObsoleteInstalledOuter();
      } finally {
        try {
          disposeOdProtocol();
        } finally {
          try {
            await sidecars.close();
          } finally {
            try {
              await identity.close();
            } finally {
              if (activeCaptureRunLease != null) {
                try {
                  await activeCaptureRunLease.retire();
                } finally {
                  activeCaptureRunLease = null;
                }
              }
            }
          }
        }
      }
    },
    async discoverWebUrl() {
      return deterministicParityRoute?.browserUrl ?? packagedEntryUrl();
    },
    // Round-7 (lefarcen P2 @ runtime.ts:336): packaged main-process
    // fetch targets the daemon sidecar's real http URL — never the
    // od://app/ renderer URL, which Node/undici cannot resolve through
    // Electron's protocol handler.
    async discoverDaemonUrl() {
      return sidecars.daemon.url;
    },
    windowTitle: resolvePackagedWindowTitle(activeConfig),
    inviteProtocolClientPath:
      process.platform === "win32" ? launcherRuntime.installedLaunchPath : null,
    async onExternalShow() {
      await retireObsoleteInstalledOuter();
    },
    onDesktopReady(controls) {
      void confirmPackagedLauncherRuntime(launcherRuntime).catch((error: unknown) => {
        packagedLogger?.warn("failed to confirm packaged launcher runtime", { error });
      });
      if (deterministicParityRoute == null) {
        void syncWindowsUninstallDisplayVersion({
          namespace,
          version: launcherRuntime.config.appVersion,
        }).catch((error: unknown) => {
          packagedLogger?.warn("failed to sync Windows uninstall registry version", { error });
        });
      }
      if (deterministicParityRoute == null) {
        secondInstanceHandoff.attach({
          dispatchDeeplink: controls.dispatchInviteDeeplink,
          show: controls.show,
        });
      }
    },
    preloadPath: join(app.getAppPath(), "preload.cjs"),
    update: {
      currentVersion: activeConfig.appVersion,
      downloadRoot: paths.updateRoot,
      installerObservationRoot: paths.installerObservationRoot,
      launcherLaunchPath: launcherRuntime.installedLaunchPath,
      launcherRoot: launcherRuntime.launcherPaths.root,
      launcherPayloadExtractorPath: activeConfig.resourceRoot == null ? null : join(activeConfig.resourceRoot, "bin", "7z.exe"),
      launcherRuntimePath: launcherRuntime.launcherPaths.runtimePath,
    },
  });
}

async function handleMainError(error: unknown): Promise<void> {
  const isPathAccess = error instanceof PackagedPathAccessError;
  if (isPathAccess && !activeCaptureMode) {
    try {
      dialog.showErrorBox(error.title, error.message);
    } catch {
      // Fall through to console logging + process exit.
    }
  }
  packagedLogger?.error("packaged runtime failed", { error });
  console.error("packaged runtime failed", error);
  if (activeCaptureMode) {
    await cleanupCaptureResources();
  } else if (activeCaptureRunLease != null) {
    try {
      await activeCaptureRunLease.retire();
    } catch (retireError) {
      console.error("capture run retirement failed", retireError);
    } finally {
      activeCaptureRunLease = null;
    }
  }
  // Best-effort crash telemetry on the way out. This is the ONLY new behavior
  // on the failure path; the happy path never reaches here. reportStartupFailure
  // self-caps its runtime (Promise.race timeout) and swallows all errors, so it
  // can neither block nor crash the exit. No-op when telemetry isn't armed yet
  // or the build has no PostHog key.
  if (startupTelemetryContext) {
    await reportStartupFailure({
      error,
      isPathAccess,
      posthogKey: startupTelemetryContext.posthogKey,
      posthogHost: startupTelemetryContext.posthogHost,
      distinctId: resolveStartupDistinctId(
        startupTelemetryContext.namespace,
        startupTelemetryContext.installationRoot,
      ),
      appVersion: startupTelemetryContext.appVersion,
      namespace: startupTelemetryContext.namespace,
      source: startupTelemetryContext.source,
      nativeModulePath: startupTelemetryContext.nativeModulePath,
    });
  }
  process.exit(1);
}

if (!handleSquirrelStartupEvent()) {
  void main().catch(handleMainError);
}
