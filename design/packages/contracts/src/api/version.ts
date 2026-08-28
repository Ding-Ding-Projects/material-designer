export interface AppVersionInfo {
  version: string;
  channel: string;
  packaged: boolean;
  platform: string;
  arch: string;
  /**
   * Immutable build provenance for the version shown to a user. Development
   * and older packages may omit it, in which case the UI must say that the
   * timestamp is unavailable rather than inventing one from launch time.
   */
  provenance?: AppVersionProvenance | null;
}

export interface AppVersionProvenance {
  schemaVersion: 1;
  /** The package version this provenance record describes. */
  version: string;
  /** The exact source commit used to produce the package. */
  sourceCommit: string;
  /** UTC ISO-8601 build/release timestamp, including seconds and an offset. */
  updatedAt: string;
}

export interface AppVersionResponse {
  version: AppVersionInfo;
}
