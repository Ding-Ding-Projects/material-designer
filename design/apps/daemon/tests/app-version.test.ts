import { describe, expect, it } from 'vitest';
import {
  APP_VERSION_FALLBACK,
  isPackagedRuntime,
  resolveAppVersionInfo,
} from '../src/app-version.js';

describe('app version helpers', () => {
  it('resolves version info from package metadata', () => {
    expect(resolveAppVersionInfo({
      packageMetadata: { version: '1.2.3' },
      env: {},
      resourcesPath: undefined,
      execPath: '/usr/local/bin/node',
      platform: 'linux',
      arch: 'x64',
    })).toEqual({
      version: '1.2.3',
      channel: 'development',
      packaged: false,
      platform: 'linux',
      arch: 'x64',
      provenance: null,
    });
  });

  it('uses a safe fallback when package metadata is missing', () => {
    expect(resolveAppVersionInfo({ packageMetadata: null, env: {} }).version).toBe(APP_VERSION_FALLBACK);
  });

  it('prefers packaged app version metadata from the environment', () => {
    expect(resolveAppVersionInfo({
      packageMetadata: { version: '0.3.0' },
      env: { OD_APP_VERSION: '0.3.1-beta.1' },
      resourcesPath: '/Applications/Open Design.app/Contents/Resources',
      execPath: '/Applications/Open Design.app/Contents/Resources/open-design/bin/node',
      platform: 'darwin',
      arch: 'arm64',
    })).toEqual({
      version: '0.3.1-beta.1',
      channel: 'beta',
      packaged: true,
      platform: 'darwin',
      arch: 'arm64',
      provenance: null,
    });
  });

  it('detects packaged runtimes without sidecar protocol knowledge', () => {
    expect(isPackagedRuntime({ resourcesPath: '/Applications/Open Design.app/Contents/Resources' })).toBe(true);
    expect(isPackagedRuntime({
      execPath: '/Applications/Open Design.app/Contents/Resources/open-design/bin/node',
      platform: 'darwin',
    })).toBe(true);
    expect(isPackagedRuntime({
      execPath: 'C:\\Users\\Ada\\AppData\\Local\\Programs\\Open Design\\resources\\open-design\\bin\\node.exe',
      platform: 'win32',
    })).toBe(true);
    expect(isPackagedRuntime({
      execPath: '/opt/Open Design/resources/open-design/bin/node',
      platform: 'linux',
    })).toBe(true);
    expect(isPackagedRuntime({ execPath: '/usr/local/bin/node', platform: 'linux' })).toBe(false);
  });

  it('honors an explicit release channel', () => {
    expect(resolveAppVersionInfo({
      packageMetadata: { version: '1.2.3' },
      env: { OD_RELEASE_CHANNEL: 'beta' },
    }).channel).toBe('beta');
  });

  it('exposes only provenance bound to the resolved package version', () => {
    expect(resolveAppVersionInfo({
      packageMetadata: { version: '1.2.3' },
      env: {
        OD_BUILD_VERSION: '1.2.3',
        OD_BUILD_SOURCE_COMMIT: 'ABCDEF0123456789ABCDEF0123456789ABCDEF01',
        OD_BUILD_UPDATED_AT: '2026-08-27T12:34:56.789Z',
      },
    }).provenance).toEqual({
      schemaVersion: 1,
      version: '1.2.3',
      sourceCommit: 'abcdef0123456789abcdef0123456789abcdef01',
      updatedAt: '2026-08-27T12:34:56.789Z',
    });
  });

  it('returns unavailable provenance for missing, malformed, or version-mismatched records', () => {
    const base = {
      packageMetadata: { version: '1.2.3' },
      env: {
        OD_BUILD_VERSION: '1.2.3',
        OD_BUILD_SOURCE_COMMIT: 'ABCDEF0123456789ABCDEF0123456789ABCDEF01',
        OD_BUILD_UPDATED_AT: '2026-08-27T12:34:56Z',
      },
    };
    expect(resolveAppVersionInfo(base).provenance).not.toBeNull();
    expect(resolveAppVersionInfo({
      ...base,
      env: { ...base.env, OD_BUILD_UPDATED_AT: '2026-08-27' },
    }).provenance).toBeNull();
    expect(resolveAppVersionInfo({
      ...base,
      env: { ...base.env, OD_BUILD_UPDATED_AT: '2026-02-31T12:34:56Z' },
    }).provenance).toBeNull();
    expect(resolveAppVersionInfo({
      ...base,
      env: { ...base.env, OD_BUILD_SOURCE_COMMIT: 'not-a-commit' },
    }).provenance).toBeNull();
    expect(resolveAppVersionInfo({
      ...base,
      env: { ...base.env, OD_BUILD_VERSION: '9.9.9' },
    }).provenance).toBeNull();
  });

  it('infers prerelease channel from semver metadata', () => {
    expect(resolveAppVersionInfo({
      packageMetadata: { version: '0.1.0-beta.6' },
      env: {},
    }).channel).toBe('beta');
  });

  it('infers prerelease and preview release channels from app versions', () => {
    expect(resolveAppVersionInfo({
      packageMetadata: { version: '0.8.0-prerelease.2' },
      env: {},
    }).channel).toBe('prerelease');
    expect(resolveAppVersionInfo({
      packageMetadata: { version: '0.8.0-preview.1' },
      env: {},
    }).channel).toBe('preview');
  });
});
