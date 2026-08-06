# Automatic updates

How packaged Windows builds discover, stage and install a Squirrel.Windows
update, and how to tell a download problem from an installation problem.

## Behaviour

Stable packaged Windows builds check the project-owned feed at startup and on
the bounded background schedule already defined by the desktop updater. When a
newer release is available, the app downloads that release's Squirrel
`Setup.exe` without blocking the current work, verifies its SHA-256, and keeps
the verified file in the updater's owned cache.

The background check never launches an installer. The non-blocking update
surface exposes **Restart to install update** and **Later**. The first action
hands the verified `Setup.exe` to the existing quit-and-launch helper; the
second leaves the current version running. Active-run safety is checked first;
then the host sends a bounded renderer save-preparation request. The workspace
drains queued and in-flight sketch autosaves plus the active markdown editor's
debounced or in-flight write, and reports `clean`, `saved` or `failed` before the
host schedules quit. A failed, unavailable or timed-out preparation blocks the
restart, including a forced restart, so the update button cannot turn an
unfinished save into a disappearing act.

On macOS and Windows, the quit helper is armed with a random one-shot
authorization-marker path. The host creates that marker only after the renderer
preparation succeeds; the helper checks for it after the application process
exits and otherwise removes itself without opening the installer. This keeps a
denied **Restart to install update**, a failed save and an interrupted quit from
turning into an installer launch later. If the app starts again with a persisted
verified installer, the next explicit install action arms a fresh helper before
the host asks the renderer to prepare another restart.

The release also carries Squirrel's `RELEASES` index, a required full NuGet
package and any delta packages produced by the build. `Setup.exe` is the
bootstrapper used by the user-facing install and restart path; the native
Squirrel package files remain available for its distribution/update contract.

The HTML editor uses the same renderer preparation callback as sketch and
Markdown. Its debounced style write and inline-text acknowledgement are
settled before the host reports success. Switching files keys the viewer and
keeps the old renderer's callback registered until that final write settles, so
a restart cannot leave the previous document's draft behind.

## Configuration

| Setting | Default | Effect |
| --- | --- | --- |
| `OD_UPDATE_METADATA_URL` | `https://github.com/Ding-Ding-Projects/material-designer/releases/latest/download/metadata.json` for stable Windows packages | Overrides the feed URL. |
| `OD_UPDATE_ENABLED` | Enabled for packaged stable Windows builds | Explicitly enables or disables the updater. |
| `OD_UPDATE_AUTO_CHECK` | The enabled value | Controls automatic checks; manual Check for updates remains available. |
| `OD_UPDATE_AUTO_DOWNLOAD` | `true` | Downloads a verified candidate after discovery. |
| `OD_UPDATE_AUTO_OPEN` | `false` | Does not auto-launch a Windows installer; explicit restart remains required. |
| `OD_UPDATE_CHECK_INTERVAL_MS` | Six hours for stable | Bounds the repeating background check interval. |
| `OD_UPDATE_DOWNLOAD_ROOT` | The packaged runtime's `updates` directory | Selects the owned local cache root; it must be absolute. |

Non-stable channels remain pointed at the inert origin unless a pack or test
explicitly supplies a feed. The release workflow computes a monotonic patch
version from the package baseline plus the workflow run number, so an installed
Squirrel build can distinguish a later release.

## Failure modes

- A missing or unreachable feed leaves the updater in an error state with the
  actual reason; it does not substitute another product's feed.
- Malformed metadata or a missing `Setup.exe` checksum is rejected before any
  installer action is offered.
- A checksum mismatch deletes the staging directory and reports the expected
  and actual digest in updater diagnostics; the file is never installed.
- If the installer helper cannot launch, the update remains recoverable from
  the updater surface and the failed attempt is recorded in the local
  installer-observation record.
- If renderer save preparation fails, is unavailable or times out, the host
  returns a structured failure and does not request process quit. The force
  option cannot bypass this renderer-owned safety barrier.
- If the user chooses **Later** or the renderer barrier refuses the restart, the
  deferred helper sees no authorization marker and exits without launching
  `Setup.exe`. A persisted ready update re-arms a new helper only when the user
  explicitly requests installation again.
- If the installer was opened but the quit/save handoff fails, the dialog keeps
  **Restart to install update** available for a retry. The updater re-arms a
  fresh helper rather than treating the failed handoff as a completed install.
- **Clear cache** revokes pending and already-authorized installer markers in
  the owned helper directory. Helpers that have not yet passed their marker
  check therefore exit without opening `Setup.exe`; the reset cannot leave a
  one-shot authorization behind.
- An older published release may not contain `metadata.json`, `RELEASES` or
  NuGet packages because it predates the migration. The first post-migration
  release is the feed's compatibility boundary.

## Security considerations

The stable feed is project-owned and points to immutable release-tag assets.
The updater constrains all downloaded and staged paths to its owned cache and
re-hashes the installer immediately before launch. SHA-256 protects against
corruption and an incomplete download; it is not publisher authentication.

Code signing is not configured yet, so Windows may show its unknown-publisher
reputation warning. Do not describe checksum verification as a signature.

## Verification

The focused tests cover the stable feed default, Squirrel `Setup.exe` artifact
selection, checksum handling, deferred Windows install semantics, UI labels,
lifecycle switches, and the renderer save-preparation handshake:

```text
pnpm --filter @open-design/desktop exec vitest run tests/main/updater
pnpm --filter @open-design/web exec vitest run tests/lib/updater.test.ts tests/components/UpdateDialog.test.tsx tests/components/UpdaterPopup.test.tsx
pnpm --filter @open-design/tools-pack exec vitest run win- config
pnpm --filter @open-design/desktop exec vitest run tests/main/update-preflight.test.ts tests/main/updater-host-boundary.test.ts tests/main/preload-host-boundary.test.ts
pnpm --filter @open-design/web exec vitest run tests/components/FileWorkspace.test.tsx
```

The updater suite also covers the one-shot authorization marker, the harmless
post-quit path when authorization is absent, re-arming a persisted installer
after a cold start, and revocation during clear-cache. Web coverage includes
HTML renderer registration, file-switch-safe Markdown flushing, Figma tab
semantics, context-menu scrolling and a retryable failed handoff. These commands
are CI commands; this checkout did not run the Node/pnpm toolchain locally.

The repository's supported build and runtime verification path is the labelled
self-hosted Windows `Release` workflow
(`[self-hosted, windows, material-designer]`). It must prove the Squirrel build
outputs, install, launch, health check and uninstall before publishing a new
feed. Until that run lands, the implementation is committed but the public feed
is not claimed as verified.

## Suggested reading

- [release-pipeline.md](release-pipeline.md) — the labelled build and publication sequence
- [release-assets.md](release-assets.md) — the exact files attached to a release
- [packaged-smoke-test.md](packaged-smoke-test.md) — what the Windows lifecycle smoke test proves
- [../architecture/packaged-runtime.md](../architecture/packaged-runtime.md) — the runtime boundaries behind the update cache
