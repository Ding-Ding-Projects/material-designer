import type { ReleaseChannel } from "@open-design/release";

/**
 * @module protocol
 *
 * The OpenDesign renderer host-bridge wire contract: the injected-global name
 * and version, client/updater constant registries, and every request/result
 * type that crosses the host bridge — including the {@link OpenDesignHostBridge}
 * shape itself. Pure declarations only; depends on nothing else in the package.
 */

export const OPEN_DESIGN_HOST_GLOBAL = "__od__";
export const OPEN_DESIGN_HOST_VERSION = 2;

export const OPEN_DESIGN_HOST_CLIENT_TYPES = Object.freeze({
  DESKTOP: "desktop",
} as const);

export type OpenDesignHostClientType =
  (typeof OPEN_DESIGN_HOST_CLIENT_TYPES)[keyof typeof OPEN_DESIGN_HOST_CLIENT_TYPES];

export type OpenDesignHostClient = {
  // BCP-47 locale string (e.g. "zh-CN", "pt-BR") the host process read from
  // the OS at startup. The renderer uses this so the packaged desktop app
  // can follow the OS language even when Chromium's built-in
  // `navigator.language` would have defaulted to en-US.
  osLocale?: string;
  platform?: string;
  type: OpenDesignHostClientType;
};

export type OpenDesignHostFailure = {
  details?: unknown;
  ok: false;
  reason: string;
};

export type OpenDesignHostActionResult =
  | { ok: true }
  | OpenDesignHostFailure;

/**
 * The workspace attribution the renderer gives the host so a folder import
 * lands in the caller's current workspace instead of the host's ambient one.
 *
 * This is a deliberate structural subset of the daemon/web
 * `WorkspaceCollabContext`, redeclared here rather than imported: this package
 * is the renderer host-bridge wire contract and must stay independent of the
 * daemon/web contracts package (enforced by the "stays independent from
 * daemon/web contracts" test). A full `WorkspaceCollabContext` is structurally
 * assignable to this type, so callers pass theirs unchanged.
 *
 * Only the fields the host actually forwards are modelled, and the enum-like
 * fields stay `string` because the host treats them as opaque pass-through
 * values — the daemon remains the authority that parses and validates them.
 * Deliberately no index signature: an interface never satisfies one, so adding
 * it would reject the very `WorkspaceCollabContext` callers pass. Callers hand
 * over a variable, not a fresh literal, so the extra fields ride along fine.
 */
export type OpenDesignHostWorkspaceContext = {
  lifecycleState: string;
  memberStatus: string;
  permissions: {
    canShareProjects: boolean;
    canWriteSyncedFiles: boolean;
  };
  role: string;
  workspaceId: string;
  workspaceMemberId: string;
  workspaceType: string;
};

export type OpenDesignHostProjectImportInit = {
  designSystemId?: string | null;
  folderDialogTitle?: string;
  name?: string;
  skillId?: string | null;
  workspaceContext?: OpenDesignHostWorkspaceContext | null;
};

export type OpenDesignHostProjectImportSuccess = {
  conversationId: string;
  entryFile: string | null;
  ok: true;
  projectId: string;
};

export type OpenDesignHostProjectImportResult =
  | OpenDesignHostProjectImportSuccess
  | {
      canceled: true;
      ok: false;
    }
  | OpenDesignHostFailure;

export type OpenDesignHostProjectReplaceWorkingDirSuccess = {
  baseDir: string;
  entryFile: string | null;
  ok: true;
};

export type OpenDesignHostProjectReplaceWorkingDirResult =
  | OpenDesignHostProjectReplaceWorkingDirSuccess
  | {
      canceled: true;
      ok: false;
    }
  | OpenDesignHostFailure;

export type OpenDesignHostPickWorkingDirSuccess = {
  baseDir: string;
  ok: true;
  // Single-use HMAC token (minted by the host main process for `baseDir`)
  // that the renderer threads into POST /api/projects/:id/working-dir once
  // the project exists. Lets the Home flow pick a folder before the project
  // is created without exposing the daemon's desktop-auth gate.
  token: string;
};

export type OpenDesignHostPickWorkingDirResult =
  | OpenDesignHostPickWorkingDirSuccess
  | {
      canceled: true;
      ok: false;
    }
  | OpenDesignHostFailure;

export type OpenDesignHostPdfPrintOptions = {
  deck?: boolean;
};

export type OpenDesignHostCaptureClip = { x: number; y: number; width: number; height: number };
export type OpenDesignHostCaptureOptions = { clip?: OpenDesignHostCaptureClip };
export type OpenDesignHostCaptureSuccess = { dataUrl: string; h: number; ok: true; w: number };
export type OpenDesignHostCaptureResult = OpenDesignHostCaptureSuccess | OpenDesignHostFailure;

export type OpenDesignHostPreviewNavigationFailure = {
  errorCode: number;
  eventId: number;
  frameName?: string;
  occurredAtMs: number;
  validatedUrl: string;
};

export type OpenDesignHostPreviewNavigationFailureListener = (
  failure: OpenDesignHostPreviewNavigationFailure,
) => void;

export type OpenDesignHostBrowserClearDataOptions = {
  cookies?: boolean;
  storage?: boolean;
};

/**
 * App theme values the renderer may pin the host window appearance to.
 * `light`/`dark` force the native window material (macOS under-window
 * vibrancy glass follows the OS appearance by default, which reads as a
 * muddy gray when the OS is dark but the app theme is explicitly light);
 * `system` restores following the OS.
 */
export const OPEN_DESIGN_HOST_APPEARANCE_THEMES = Object.freeze({
  DARK: "dark",
  LIGHT: "light",
  SYSTEM: "system",
} as const);

/**
 * Capability marker for the theme bridge. A host that predates the
 * acknowledgement contract may still expose `appearance.setTheme`, but a
 * fire-and-forget function cannot be used as the renderer's startup witness.
 * Keep this marker separate from the bridge protocol version so older hosts
 * remain discoverable for unrelated capabilities while the renderer can
 * truthfully reject an unacknowledged theme handoff.
 */
export const OPEN_DESIGN_HOST_APPEARANCE_ACKNOWLEDGEMENT_VERSION = 1 as const;

export type OpenDesignHostAppearanceTheme =
  (typeof OPEN_DESIGN_HOST_APPEARANCE_THEMES)[keyof typeof OPEN_DESIGN_HOST_APPEARANCE_THEMES];

export const OPEN_DESIGN_HOST_UPDATER_ACTIONS = Object.freeze({
  CHECK: "check",
  CLEAR_CACHE: "clear-cache",
  DOWNLOAD: "download",
  INSTALL: "install",
  QUIT: "quit",
  STATUS: "status",
} as const);

export type OpenDesignHostUpdaterAction =
  (typeof OPEN_DESIGN_HOST_UPDATER_ACTIONS)[keyof typeof OPEN_DESIGN_HOST_UPDATER_ACTIONS];

/** @internal Updater actions that return a status snapshot (every action except `quit`). */
export type OpenDesignHostUpdaterStatusAction = Exclude<
  OpenDesignHostUpdaterAction,
  typeof OPEN_DESIGN_HOST_UPDATER_ACTIONS.QUIT
>;

export const OPEN_DESIGN_HOST_UPDATER_STATES = Object.freeze({
  AVAILABLE: "available",
  CHECKING: "checking",
  DOWNLOADED: "downloaded",
  DOWNLOADING: "downloading",
  ERROR: "error",
  IDLE: "idle",
  INSTALLING: "installing",
  NOT_AVAILABLE: "not-available",
  UNSUPPORTED: "unsupported",
} as const);

export type OpenDesignHostUpdaterState =
  (typeof OPEN_DESIGN_HOST_UPDATER_STATES)[keyof typeof OPEN_DESIGN_HOST_UPDATER_STATES];

export type OpenDesignHostUpdaterMode = "js-incremental" | "package-launcher";
export type OpenDesignHostUpdaterChannel = ReleaseChannel;

export type OpenDesignHostUpdaterActionOptions = {
  payload?: Record<string, unknown>;
};

export type OpenDesignHostUpdaterCapabilitySet = {
  canApplyInPlace: boolean;
  canDownload: boolean;
  canOpenInstaller: boolean;
  requiresManualInstall: boolean;
};

export type OpenDesignHostUpdaterPathSnapshot = {
  downloadRoot?: string;
  manifestPath?: string;
};

export type OpenDesignHostUpdaterChecksumSnapshot = {
  algorithm: "sha256" | "sha512";
  url?: string;
  value?: string;
};

export type OpenDesignHostUpdaterArtifactSnapshot = {
  name?: string;
  platformKey?: string;
  size?: number;
  type?: string;
  url: string;
};

export type OpenDesignHostUpdaterProgressSnapshot = {
  receivedBytes: number;
  totalBytes?: number;
};

export type OpenDesignHostUpdaterErrorSnapshot = {
  code: string;
  details?: unknown;
  message: string;
};

export type OpenDesignHostUpdaterInstallResult = {
  activeVersion?: string;
  artifactPath?: string;
  dryRun?: boolean;
  helperLogPath?: string;
  launcherRuntimePath?: string;
  launchPath?: string;
  openedAt: string;
  path: string;
};

export type OpenDesignHostUpdaterReleaseSnapshot = {
  arch: string;
  artifact: OpenDesignHostUpdaterArtifactSnapshot;
  checksum: OpenDesignHostUpdaterChecksumSnapshot;
  channel: OpenDesignHostUpdaterChannel;
  downloadedAt: string;
  key: string;
  metadata?: Record<string, unknown>;
  path: string;
  platformKey: string;
  version: string;
};

export type OpenDesignHostUpdaterIncomingSnapshot = {
  arch: string;
  artifact: OpenDesignHostUpdaterArtifactSnapshot;
  channel: OpenDesignHostUpdaterChannel;
  key?: string;
  metadata?: Record<string, unknown>;
  progress?: OpenDesignHostUpdaterProgressSnapshot;
  startedAt: string;
  version: string;
};

export type OpenDesignHostUpdaterCacheLifecycleTrigger = "cold-start" | "manual" | "next-version-ready";

export type OpenDesignHostUpdaterReleaseLifecycleState =
  | "cleanup-deferred"
  | "cleanup-removed"
  | "deprecated"
  | "retained"
  | "unknown";

export type OpenDesignHostUpdaterCacheLifecycleSummary = {
  lastRunAt?: string;
  lastTrigger?: OpenDesignHostUpdaterCacheLifecycleTrigger;
  platform: string;
  releases: {
    cleanupDeferred: number;
    cleanupRemoved: number;
    deprecated: number;
    errors: number;
    retained: number;
    total: number;
    unknown: number;
  };
};

export type OpenDesignHostUpdaterCacheSnapshot = {
  lifecycle?: OpenDesignHostUpdaterCacheLifecycleSummary;
};

export type OpenDesignHostUpdaterReinstallReason =
  | "launcher-schema"
  | "outer-below-min"
  | "outer-version-unreadable";

/**
 * Present when the release feed requires a full installer reinstall instead of
 * an in-place payload update. `installedVersion` is the physically installed
 * outer package version; `url` is an optional operator-supplied explanation
 * link.
 */
export type OpenDesignHostUpdaterReinstallSnapshot = {
  installedVersion?: string;
  minVersion?: string;
  reason: OpenDesignHostUpdaterReinstallReason;
  url?: string;
};

export type OpenDesignHostUpdaterStatusSnapshot = {
  active?: OpenDesignHostUpdaterReleaseSnapshot;
  arch: string;
  artifact?: OpenDesignHostUpdaterArtifactSnapshot;
  artifactUrl?: string;
  availableVersion?: string;
  cache?: OpenDesignHostUpdaterCacheSnapshot;
  capabilities: OpenDesignHostUpdaterCapabilitySet;
  channel: OpenDesignHostUpdaterChannel;
  checksum?: OpenDesignHostUpdaterChecksumSnapshot;
  currentVersion: string;
  downloadPath?: string;
  enabled: boolean;
  error?: OpenDesignHostUpdaterErrorSnapshot;
  incoming?: OpenDesignHostUpdaterIncomingSnapshot;
  installResult?: OpenDesignHostUpdaterInstallResult;
  lastCheckedAt?: string;
  metadata?: Record<string, unknown>;
  mode: OpenDesignHostUpdaterMode;
  paths?: OpenDesignHostUpdaterPathSnapshot;
  platform: string;
  progress?: OpenDesignHostUpdaterProgressSnapshot;
  reinstall?: OpenDesignHostUpdaterReinstallSnapshot;
  state: OpenDesignHostUpdaterState;
  supported: boolean;
};

export type OpenDesignHostUpdaterResult =
  | { ok: true; status: OpenDesignHostUpdaterStatusSnapshot }
  | OpenDesignHostFailure;

export type OpenDesignHostUpdaterStatusListener = (status: OpenDesignHostUpdaterStatusSnapshot) => void;

export type OpenDesignHostUpdaterMenuLabels = {
  check: string;
  checking: string;
  downloading: string;
  install: string;
  installing: string;
  restart: string;
};

export type OpenDesignHostUpdaterOpenDialogRequest = {
  source: string;
};

export type OpenDesignHostUpdaterOpenDialogListener = (request: OpenDesignHostUpdaterOpenDialogRequest) => void;

/**
 * Renderer-owned save preparation reported before the host quits for an
 * updater install. `clean` means there was no pending work; `saved` means the
 * renderer drained one or more saves; `failed` is a hard stop and must never
 * be bypassed by a forced restart.
 */
export type OpenDesignHostUpdaterSavePreparation =
  | { state: "clean" }
  | { state: "saved" }
  | { reason: string; state: "failed" };

export type OpenDesignHostUpdaterPrepareQuitRequest = {
  requestId: string;
};

export type OpenDesignHostUpdaterPrepareQuitResponse = {
  preparation: OpenDesignHostUpdaterSavePreparation;
  requestId: string;
};

export type OpenDesignHostUpdaterPrepareQuitListener = (
  request: OpenDesignHostUpdaterPrepareQuitRequest,
) => void;

export type OpenDesignHostWindowMaximizedListener = (maximized: boolean) => void;

/**
 * Caption-button controls for a host that draws no operating-system title bar
 * and expects the renderer to paint its own. `subscribeMaximized` exists
 * because the window can be maximized or restored without the renderer's
 * button — a snap layout, a double-clicked drag region, or a keyboard shortcut
 * — so the glyph has to follow the window rather than the last click.
 */
export type OpenDesignHostWindowControls = {
  close(): Promise<void>;
  isMaximized(): Promise<boolean>;
  minimize(): Promise<void>;
  subscribeMaximized(listener: OpenDesignHostWindowMaximizedListener): () => void;
  /** Resolves with the window's maximized state after the toggle. */
  toggleMaximize(): Promise<boolean>;
};

/**
 * The renderer's route to the host's own page-scaling control.
 *
 * This exists because a page cannot scale itself correctly. CSS `zoom` (and
 * `transform: scale()`) magnify the painted result while leaving the layout
 * viewport at its original size, so the document still lays out for a
 * 1280px-wide window and is then drawn `factor`x larger: viewport units and
 * width media queries keep answering with the unscaled window, and everything
 * overflows to the right and off the bottom. The host, by contrast, can change
 * what a CSS pixel *is* — Chromium's zoom factor divides the layout viewport,
 * exactly as the browser's own zoom shortcut does — so the layout genuinely
 * reflows instead of being magnified.
 *
 * Fire-and-forget, like `pet.setVisible`: the host clamps and applies, and the
 * renderer's evidence that the route exists is the namespace being present.
 *
 * Optional, because a host predating this cannot supply it and a plain browser
 * has no host at all. Callers MUST feature-detect and keep a scaling path of
 * their own for when it is absent.
 */
export type OpenDesignHostUiScale = {
  /** Scale the host surface by `factor`, where 1 is 100%. */
  set(factor: number): void;
};

export const OPEN_DESIGN_SETTINGS_TOY_LOCK_TARGETS = Object.freeze([
  "execution", "general", "workspace", "instructions", "memory", "media",
  "mcpClient", "composio", "orbit", "routines", "integrations", "language",
  "appearance", "narrator", "critiqueTheater", "notifications", "pet",
  "designSystems", "projectLocations", "privacy", "handoff", "about",
] as const);

export type OpenDesignSettingsToyLockTarget =
  (typeof OPEN_DESIGN_SETTINGS_TOY_LOCK_TARGETS)[number];

export const OPEN_DESIGN_TOY_LOCK_POLICIES = Object.freeze([
  "pin", "password", "pin-password", "password-totp", "pin-totp",
  "password-pin-totp",
] as const);

export type OpenDesignToyLockPolicy =
  (typeof OPEN_DESIGN_TOY_LOCK_POLICIES)[number];

export type OpenDesignToyLockMetadata = {
  cooldownUntilMs: number | null;
  maximumAttempts: number;
  policy: OpenDesignToyLockPolicy;
  remainingAttempts: number;
  revision: number;
  targetId: OpenDesignSettingsToyLockTarget;
};

export type OpenDesignToyLockFailureCode =
  | "busy"
  | "clock-invalid"
  | "cooldown-active"
  | "enrollment-expired"
  | "enrollment-mismatch"
  | "enrollment-not-found"
  | "invalid-input"
  | "not-configured"
  | "os-protection-unavailable"
  | "operation-failed"
  | "persistence-failed"
  | "protection-failed"
  | "stale-revision"
  | "store-corrupt"
  | "target-refused";

export type OpenDesignToyLockResult<T extends Record<string, unknown> = Record<never, never>> =
  | ({ ok: true } & T)
  | { code: OpenDesignToyLockFailureCode; ok: false };

export type OpenDesignToyLockConfigureRequest = {
  expectedRevision: number | null;
  factors: { password?: string; pin?: string; totpSecretBase32?: string };
  maximumAttempts?: number;
  policy: OpenDesignToyLockPolicy;
  targetId: OpenDesignSettingsToyLockTarget;
};

export type OpenDesignToyLockVerifyRequest = {
  factors: { password?: string; pin?: string; totp?: string };
  revision: number;
  targetId: OpenDesignSettingsToyLockTarget;
};

export type OpenDesignToyLockBeginTotpEnrollmentRequest = {
  expectedRevision: number | null;
  factors: { password?: string; pin?: string; totpSecretBase32: string };
  maximumAttempts?: number;
  policy: Extract<OpenDesignToyLockPolicy, "password-totp" | "pin-totp" | "password-pin-totp">;
  targetId: OpenDesignSettingsToyLockTarget;
};

export type OpenDesignToyLockConfirmTotpEnrollmentRequest = {
  code: string;
  enrollmentId: string;
  targetId: OpenDesignSettingsToyLockTarget;
};

export type OpenDesignHostToyLocks = {
  beginTotpEnrollment(request: OpenDesignToyLockBeginTotpEnrollmentRequest): Promise<OpenDesignToyLockResult<{
    enrollmentId: string;
    expiresAtMs: number;
  }>>;
  confirmTotpEnrollment(request: OpenDesignToyLockConfirmTotpEnrollmentRequest): Promise<OpenDesignToyLockResult<{
    lock: OpenDesignToyLockMetadata;
  }>>;
  configure(request: OpenDesignToyLockConfigureRequest): Promise<OpenDesignToyLockResult<{ lock: OpenDesignToyLockMetadata }>>;
  list(): Promise<OpenDesignToyLockResult<{
    locks: OpenDesignToyLockMetadata[];
    protectionAvailable: boolean;
  }>>;
  remove(targetId: OpenDesignSettingsToyLockTarget, expectedRevision: number): Promise<OpenDesignToyLockResult>;
  verify(request: OpenDesignToyLockVerifyRequest): Promise<OpenDesignToyLockResult<{
    lock: OpenDesignToyLockMetadata;
    matched: boolean;
  }>>;
};

export type OpenDesignHostBridge = {
  // Optional so older host builds still satisfy the bridge shape; callers
  // must feature-detect before invoking.
  appearance?: {
    /**
     * Apply the renderer's validated theme to the native shell and acknowledge
     * the result. A promise is intentional: the renderer must not claim its
     * startup witness until the native side has accepted the value.
     */
    setTheme(theme: OpenDesignHostAppearanceTheme): Promise<OpenDesignHostActionResult>;
    /** Present only when `setTheme` returns an acknowledged action result. */
    acknowledgementVersion?: typeof OPEN_DESIGN_HOST_APPEARANCE_ACKNOWLEDGEMENT_VERSION;
  };
  browser: {
    clearData(options?: OpenDesignHostBrowserClearDataOptions): Promise<OpenDesignHostActionResult>;
  };
  capture: {
    page(options?: OpenDesignHostCaptureOptions): Promise<OpenDesignHostCaptureResult>;
  };
  client: OpenDesignHostClient;
  pdf: {
    print(html: string, nonce?: string, options?: OpenDesignHostPdfPrintOptions): Promise<OpenDesignHostActionResult>;
  };
  pet: {
    setVisible(visible: boolean): void;
  };
  // Optional so web builds and older desktop hosts keep the same contract.
  // Electron is the only layer that can observe a compositor-affecting
  // subframe navigation failure after the iframe DOM remains healthy.
  preview?: {
    getLatestNavigationFailure(): OpenDesignHostPreviewNavigationFailure | null;
    subscribeNavigationFailure(listener: OpenDesignHostPreviewNavigationFailureListener): () => void;
  };
  project: {
    pickAndImport(init?: OpenDesignHostProjectImportInit): Promise<OpenDesignHostProjectImportResult>;
    pickAndReplaceWorkingDir(projectId: string, folderDialogTitle?: string): Promise<OpenDesignHostProjectReplaceWorkingDirResult>;
    // Optional so older host builds still satisfy the bridge shape; callers
    // must feature-detect before invoking.
    pickWorkingDir?(folderDialogTitle?: string): Promise<OpenDesignHostPickWorkingDirResult>;
  };
  shell: {
    openExternal(url: string): Promise<OpenDesignHostActionResult>;
    openPath(projectId: string): Promise<OpenDesignHostActionResult>;
  };
  // Optional, and absent on a host predating it. The renderer feature-detects
  // and falls back to scaling the document itself; see `OpenDesignHostUiScale`
  // for why that fallback is a worse answer than this one.
  uiScale?: OpenDesignHostUiScale;
  /** Optional on desktop hosts predating persistent Settings-tab toy locks. */
  toyLocks?: OpenDesignHostToyLocks;
  updater: {
    check(options?: OpenDesignHostUpdaterActionOptions): Promise<OpenDesignHostUpdaterStatusSnapshot>;
    "clear-cache"(options?: OpenDesignHostUpdaterActionOptions): Promise<OpenDesignHostUpdaterStatusSnapshot>;
    download(options?: OpenDesignHostUpdaterActionOptions): Promise<OpenDesignHostUpdaterStatusSnapshot>;
    install(options?: OpenDesignHostUpdaterActionOptions): Promise<OpenDesignHostUpdaterStatusSnapshot>;
    quit(options?: OpenDesignHostUpdaterActionOptions): Promise<OpenDesignHostActionResult>;
    setMenuLabels(labels: OpenDesignHostUpdaterMenuLabels): Promise<OpenDesignHostActionResult>;
    status(options?: OpenDesignHostUpdaterActionOptions): Promise<OpenDesignHostUpdaterStatusSnapshot>;
    subscribe(listener: OpenDesignHostUpdaterStatusListener): () => void;
    subscribeOpenDialog(listener: OpenDesignHostUpdaterOpenDialogListener): () => void;
    /** Optional on hosts predating the renderer save-preparation handshake. */
    subscribePrepareQuit?(listener: OpenDesignHostUpdaterPrepareQuitListener): () => void;
    /** Optional on hosts predating the renderer save-preparation handshake. */
    respondPrepareQuit?(response: OpenDesignHostUpdaterPrepareQuitResponse): Promise<OpenDesignHostActionResult>;
  };
  version: typeof OPEN_DESIGN_HOST_VERSION;
  // Optional, and absent on every host that keeps its native title bar — only
  // the frameless Windows shell exposes it. Callers must feature-detect before
  // drawing caption buttons, or they will draw buttons that do nothing on
  // macOS and Linux.
  windowControls?: OpenDesignHostWindowControls;
};

export type OpenDesignHostGlobalScope = Record<string, unknown> & {
  window?: unknown;
};
