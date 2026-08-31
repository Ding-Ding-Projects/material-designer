/**
 * What the daemon this client is talking to can actually do, as opposed to what
 * the client-side runtime looks like. Served per request and never persisted:
 * the same data dir can be opened by a desktop daemon on Monday and a headless
 * one on Tuesday, so a stored answer would be a stale claim.
 *
 * Optional so a newer client keeps working against an older daemon — treat an
 * absent field as "unknown", not as "false".
 */
export interface AppRuntimeCapabilities {
  /**
   * Whether the daemon can render deck slides off-screen — the capability
   * behind PPTX / screenshot-PDF / image export. Only the desktop sidecar
   * injects that renderer, so a headless or container deployment reports
   * `false` and those export routes answer 501.
   *
   * Deliberately NOT derivable from `packaged`: a packaged binary run as a
   * plain daemon still has no renderer.
   */
  slideRenderer: boolean;
}

export interface AppVersionInfo {
  version: string;
  channel: string;
  packaged: boolean;
  platform: string;
  arch: string;
  capabilities?: AppRuntimeCapabilities;
  /**
   * Immutable build provenance for the version shown to a user. Development
   * and older packages may omit it, in which case the UI must say that the
   * timestamp is unavailable rather than inventing one from launch time.
   */
  provenance?: AppVersionProvenance | null;
}

const APP_VERSION_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function isValidAppVersion(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && APP_VERSION_RE.test(value);
}

export interface AppVersionProvenance {
  schemaVersion: 1;
  /** The package version this provenance record describes. */
  version: string;
  /** The exact source commit used to produce the package. */
  sourceCommit: string;
  /** UTC ISO-8601 build or release timestamp, including seconds and an offset. */
  updatedAt: string;
}

export interface AppVersionResponse {
  version: AppVersionInfo;
}
