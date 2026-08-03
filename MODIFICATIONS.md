# Modifications to the imported work

`design/` contains a copy of **Open Design** v0.16.1, licensed under the Apache
License 2.0. The full licence text is at [`design/LICENSE`](design/LICENSE).

- Upstream: <https://github.com/nexu-io/open-design>
- Imported at commit: `517f39acde402c1a7af2189167a8d6957a3dac71`
- Import date: 2026-08-03

Apache-2.0 section 4(b) requires prominent notices on files that were changed.
This file is that notice, kept in one place so a reader sees the whole delta
without diffing two repositories.

## This file is enforced, not decorative

`scripts/verify-port.sh` compares every file under `design/` against the pinned
upstream tree and **reads the path list below as its allowlist**. A file that
differs from upstream without an entry here fails verification; an entry here
for a file that no longer differs also fails. The notice and the code cannot
drift apart, because CI checks that they agree.

Paths are relative to `design/` and are written as `` - `path/to/file` `` under
the **Changed files** heading of an entry.

## Import

Copied byte-for-byte from the pinned submodule: all 11,799 files match the
upstream blob ids exactly, file modes included.

## Changes

### 2026-08-03 — Separate application identity, so the two products can coexist

**Reason:** these are correctness fixes, not cosmetics. Installed side by side,
an unmodified build of this fork and upstream Open Design are the *same
application* as far as the operating system is concerned, and they collide in
eight concrete ways:

1. **Shared Electron `userData` directory.** Electron derives `userData` from
   `productName`, so both products resolve to
   `%APPDATA%\Open Design\namespaces\<ns>\data` — the same SQLite database, the
   same artifacts, the same stored credentials. Two apps writing one store is
   guaranteed mutual corruption, not a race that usually works out.
2. **Shared Chromium single-instance lock.** That lock is keyed on the
   `userData` directory. With both products pointing at one directory, launching
   this app while Open Design is running makes it silently `app.quit()` — a
   failure with no error, no window, and nothing in the UI to diagnose.
3. **Shared Windows named pipe.** The daemon IPC endpoint
   `\\.\pipe\open-design-<ns>-daemon` is a single global name; whichever product
   binds it first owns it, and the second one talks to the wrong engine or
   fails to start.
4. **Shared uninstall registry key.** Both installers write the same
   Add/Remove Programs entry, so uninstalling either product deletes the other's
   entry, and `cleanupWinRegistryResidues` would happily remove a key belonging
   to a different application.
5. **Auto-update into a different product.** This is the most serious one. The
   packaged build shipped with the updater *enabled by default* and pointed at
   upstream's release feed (`https://releases.open-design.ai`). Left alone, a
   build of this fork would poll that feed, download upstream's installer, and
   replace itself with the other product. An application must never update
   itself into something else, so the default origin is now an inert
   `.invalid` host that can never resolve, and a packaged build enables the
   updater only when it was actually given a feed of its own. That is the
   bake-time route an installed app really has: `tools/pack` reads
   `OD_UPDATE_METADATA_URL` and writes it into `open-design-config.json`, and
   `apps/packaged` re-exports it into the process before the desktop main
   resolves its updater config. A build packed against this fork's feed
   therefore updates from that feed; a build packed without one never checks
   and never resolves an origin that could answer. `OD_UPDATE_ENABLED` still
   overrides the default in either direction. `apps/desktop`'s updater config
   tests pin both halves, because each is a one-line reversion in a file that
   keeps merging from upstream.
6. **One-click manual routes into the other product.** Three buttons opened
   upstream's downloads page: Settings → About's "View release notes" (shown
   precisely when in-app updating is unavailable, which is now every build
   without a baked feed), the macOS update dialog's manual-download button, and
   the post-update highlights card's fallback link. All three now open this
   repository's own releases page.
7. **Remotely controlled content from an upstream-owned feed.** The daemon
   fetched `https://whatsnew.open-design.ai/whats-new.json` on every launch
   that reached Home on any release channel, and rendered that document's
   title, body, image and link inside the app. A packaged build of this fork
   would have given another project's operators editorial control of a surface
   in this product — including a clickable link — and a launch signal from
   every user, with nothing configured anywhere. The highlights document is now
   opt-in through `OD_WHATS_NEW_URL` alone, with no default: absent that
   variable there is no card and no network call.
8. **The other product's name in a hardcoded menu label.** The macOS
   application menu's "Restart to Update…" item falls back to a hardcoded
   English default until the renderer pushes localized labels over IPC, and
   that default named Open Design. It lives outside `apps/web/src/i18n`, so no
   locale edit reaches it.
9. **A shared user-state directory holding provider credentials.** The daemon
   kept its Vercel and Cloudflare Pages deploy tokens, and its local agent CLI
   profiles, in `~/.open-design` whenever `OD_USER_STATE_DIR` and
   `OD_AGENT_PROFILES_CONFIG` were unset — which is every packaged launch, since
   nothing sets them. Re-authenticating a provider in one product silently
   rewrote the other's token. That root is now `~/.material-designer`; both
   overrides still work exactly as before.
10. **A shared headless data root.** The standalone headless entry defaulted its
    namespace base to `<data home>/open-design/namespaces` — the same SQLite
    database, artifacts and credentials as upstream's headless install. It now
    defaults to `<data home>/material-designer/namespaces`. `OD_DATA_DIR`, which
    the generated launchers bake in, is untouched.
11. **A shared MCP server key in third-party agent configs.** Installing the MCP
    server wrote an entry named `open-design` into files neither product owns —
    `~/.codex/config.toml`, `~/.claude.json`, VS Code's `mcp.json` and the rest —
    so installing from one product repointed the other's entry at the wrong
    executable, and uninstalling from either deleted the other's registration.
    The default key is now `material-designer`; `--name` still overrides it.
12. **`tools-pack win stop` killing the other product.** Windows picked its
    victims by sidecar stamp alone, and a stamp carries no product identity, so
    a developer's running upstream desktop matched and had its whole process
    tree force-killed. Selection is now intersected with this build's own
    install, unpacked, cache and launcher-payload trees. mac and Linux already
    gated on a product-distinct marker root and needed no change.
13. **Release automation still looking for the other product's filenames.** The
    packagers derive every artifact name from the product name, so the rename
    also renamed `Open Design-<ns>.dmg`, `.zip`, `.AppImage`, `-setup.exe` and
    the launcher payload's `payload/Open Design.exe` entry. The asset-staging
    scripts, the Windows payload validator, and the agent documentation that
    records the channel identities, uninstall keys and POSIX IPC socket base
    were still spelling the old names, so a real release would have failed on a
    missing file — and the docs would have told the next reader to put the old
    name back.

The change therefore sets a distinct product display name ("Material Designer",
with the per-channel names following upstream's own pattern), distinct
`appId`s under `io.ding-ding.material-designer*`, a distinct Windows named-pipe
prefix (`material-designer`), distinct Linux desktop-entry, icon and AppImage
names, a distinct macOS bundle identity, and a publisher name of its own. It
also sets an explicit `app.setAppUserModelId()` before `app.whenReady()`, since
Windows otherwise keys taskbar grouping, jump lists and notification identity
off the electron-builder `appId` and would merge the two apps' taskbar
identities.

Internal identifiers are **deliberately left alone**: the `od://` URL scheme,
the `open-design:` `localStorage` key prefix, the `@open-design/*` workspace
package names, the `OD_*` environment variables, `open-design-config.json`, the
`resources/open-design` resource folder, and the `od` CLI bin name. None of
them collides between installs, and renaming them would be a large refactor
that buys no coexistence. `packages/sidecar-proto`'s exported constant keeps its
historical name `OPEN_DESIGN_PRODUCT_NAME` for the same reason — only its value
tracks the product.

**Changed files:**

- `.github/scripts/release/assets/linux.sh`
- `.github/scripts/release/assets/mac-intel.sh`
- `.github/scripts/release/assets/mac.sh`
- `.github/scripts/release/assets/win.ps1`
- `AGENTS.md`
- `apps/daemon/src/cli.ts`
- `apps/daemon/src/deploy.ts`
- `apps/daemon/src/mcp-routes.ts`
- `apps/daemon/src/runtimes/local-profiles.ts`
- `apps/daemon/src/services/whats-new.ts`
- `apps/daemon/tests/whats-new.test.ts`
- `apps/desktop/src/main/diagnostics.ts`
- `apps/desktop/src/main/runtime.ts`
- `apps/desktop/src/main/update-menu.ts`
- `apps/desktop/src/main/update-preflight.ts`
- `apps/desktop/src/main/updater/config.ts`
- `apps/desktop/tests/main/update-menu.test.ts`
- `apps/desktop/tests/main/updater/config.test.ts`
- `apps/packaged/src/errors.ts`
- `apps/packaged/src/headless-runtime.ts`
- `apps/packaged/src/headless.ts`
- `apps/packaged/src/index.ts`
- `apps/packaged/src/launch.ts`
- `apps/packaged/src/paths.ts`
- `apps/packaged/src/window-title.ts`
- `apps/packaged/tests/launch.test.ts`
- `apps/packaged/tests/window-title.test.ts`
- `apps/packaged/tests/windows-lifecycle.test.ts`
- `apps/web/app/layout.tsx`
- `apps/web/src/components/SettingsDialog.tsx`
- `apps/web/src/components/UpdateDialog.tsx`
- `apps/web/src/components/WhatsNewPopup.tsx`
- `apps/web/tests/components/SettingsDialog.execution.test.tsx`
- `apps/web/tests/components/UpdateDialog.test.tsx`
- `docs/code-review-guidelines.md`
- `e2e/lib/vitest/packaged-win-identity.ts`
- `e2e/specs/linux.spec.ts`
- `e2e/specs/win.spec.ts`
- `e2e/tests/packaged-win-identity.test.ts`
- `packages/release/src/index.ts`
- `packages/release/tests/index.test.ts`
- `packages/sidecar-proto/src/index.ts`
- `tools/pack/AGENTS.md`
- `tools/pack/README.md`
- `tools/pack/resources/linux/open-design.desktop.template`
- `tools/pack/src/launcher-layout.ts`
- `tools/pack/src/linux.ts`
- `tools/pack/src/mac/constants.ts`
- `tools/pack/src/mac/identity.ts`
- `tools/pack/src/win/builder.ts`
- `tools/pack/src/win/constants.ts`
- `tools/pack/src/win/lifecycle.ts`
- `tools/pack/src/win/nsis.ts`
- `tools/pack/src/win/payload.ts`
- `tools/pack/tests/launcher-layout.test.ts`
- `tools/pack/tests/launcher-payload.test.ts`
- `tools/pack/tests/linux.test.ts`
- `tools/pack/tests/mac-identity.test.ts`
- `tools/pack/tests/mac-lifecycle.test.ts`
- `tools/pack/tests/release-workflows.test.ts`
- `tools/pack/tests/win-builder.test.ts`
- `tools/pack/tests/win-identity.test.ts`
- `tools/pack/tests/win-lifecycle.test.ts`
- `tools/pack/tests/win-nsis.test.ts`
- `tools/release/scripts/build-platform.ps1`
- `tools/release/scripts/prepare-platform-assets.ps1`
- `tools/release/scripts/prepare-platform-assets.sh`

<!--
Format for entries, newest first:

### 2026-08-04 — Windows frameless window chrome

**Reason:** Windows builds must ship a custom Material Design 3 title bar
instead of the operating system's.

**Changed files:**

- `apps/desktop/src/main/runtime.ts`
- `apps/desktop/src/main/preload.cts`
-->

## Trademarks

Apache-2.0 grants no trademark rights (section 6). The "Open Design" name, its
logo, and the `io.open-design.desktop` application identity belong to the
upstream project. Builds published from this repository are branded
**Material Designer** with their own application identity, and are not produced
by, endorsed by, or affiliated with the upstream project.
