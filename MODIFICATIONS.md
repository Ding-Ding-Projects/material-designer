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

### 2026-08-04 — The accent actually becomes Material Design 3, and motion stops being half-ported

**Reason:** a fidelity review of the token mapping found three places where the
port claimed more than it delivered. The first is the important one.

**The accent family was mapped in name only.** `styles/tokens.css` defines
`--accent` and its four derived tones as the M3 `primary` role, but nothing
downstream ever saw them: `state/appearance.ts` wrote all five as **inline
style on `<html>`**, and inline style outranks every stylesheet rule there is.
`DEFAULT_ACCENT_COLOR` was the literal `#c96442`, `DEFAULT_CONFIG.accentColor`
took that literal, and `App.tsx` fed it to `applyAppearanceToDocument` on every
mount — so every install whose owner never opened the accent picker painted its
primary CTAs the pre-port terracotta, in light *and* in dark, under every seed.
The pre-hydration script in `app/layout.tsx` did the same thing with its own
hardcoded copy of that hex before React even mounted. The most visible colour in
the product was the one the mapping could not reach.

The fix does not remove the inline write; it changes what gets written.
`DEFAULT_ACCENT_COLOR` is now `var(--md-sys-color-primary)` — the role itself
rather than a colour. Because a custom property's computed value is its
specified value *after* `var()` substitution, an inline `--accent` holding a
role reference resolves on `<html>` exactly as the stylesheet would have
resolved it, and re-resolves when the theme or the seed changes. The four
`color-mix()` tones already resolved their `--text-strong` and `--bg-panel`
operands at use time and now resolve their accent operand the same way, so
`accentVars()` itself needed no change at all.

Three consequences had to be handled rather than left to fall out:

1. **The sentinel must not look like a colour.** `var(--md-sys-color-primary)`
   fails `normalizeAccentColor`'s `^#[0-9a-fA-F]{6}$` test, which is what makes
   it safe: it can never be mistaken for a colour the user picked, it round
   trips through `localStorage` (an unrecognised stored accent already falls
   back to `DEFAULT_CONFIG.accentColor`, which is now this), and every existing
   validation path treats it as "no explicit choice" without a new code branch.
2. **Selecting the default swatch had to keep working.** `setAccentColor` fell
   through `normalizeAccentColor(color) ?? c.accentColor`, so a value that does
   not normalize would have silently kept the *previous* accent — clicking
   "Default" would have done nothing. It now matches the role first.
3. **`<input type="color">` cannot hold a role.** It only accepts a hex and
   coerces anything else to black, so the custom-colour control opens on
   `CUSTOM_ACCENT_FALLBACK`, the terracotta that used to be the default. That
   hex also stays in `ACCENT_SWATCHES` as an ordinary pickable swatch, one click
   from where it always was, so nobody who liked it loses it.

The rest follows: `state/config.ts` needed no edit, because `DEFAULT_CONFIG`
already spelled its default as `DEFAULT_ACCENT_COLOR`, and
`tests/state/appearance.test.ts` needed none either, because it asserts against
that constant rather than against the hex. The two suites that pinned the
literal — `DEFAULT_CONFIG.accentColor` in `tests/state/config.test.ts`, and the
two default-accent cases in `SettingsDialog.execution.test.tsx` — now pin the
role, still as literals, so a future change to the default is still deliberate.

**`--ease-out` is back on the app's own curve.** The previous entry repointed it
to `var(--md-sys-motion-emphasized-decel)` and the comment claimed the animation
philosophy survived the move. It did not: `AGENTS.md` still names
`cubic-bezier(0.23, 1, 0.32, 1)` as the canonical curve, and — more concretely —
roughly as many animations in `apps/web` write that curve as a **literal** as
read the token (582 against 584), 23 stylesheets use both sources, and eight
sites write the literal as the token's *own* `var()` fallback — so the repoint
also made those fallbacks disagree with the token they back. The sharpest case
is `styles/workspace/design-files.css`, which has a single `transition`
shorthand where `opacity` takes the literal while `background`, `box-shadow` and
`color` take the token: one element, four properties, two curves. Repointing the
token therefore did not move the app onto the M3 curve, it split the app in
half; the two curves differ by 0.22 of progress a tenth of the way in, which is
enough for those four properties to visibly lead one another at the start of a
200ms enter. Sweeping ~580 literals
was not the trade this change wanted to make, so the token keeps the product's
curve, the comment says why instead of claiming otherwise, `AGENTS.md` stays
true, and the M3 curves remain declared next door for new M3 surfaces to use
directly — which is what `components/WindowTitleBar.module.css` already does.

**`--ui-scale` was a name the contract does not use.** The mockup emits the
factor as `--od-scale` (`rootVars` at `Open Design M3.dc.html` line 2032) and
`md3-tokens.css` transcribes every other contract invention verbatim, its own
header comment included. Nothing in the repository reads either name yet, so the
divergence was free to correct now and would have been a silent no-op later,
when a control wired to the mockup's spelling wrote a property nothing declared.

**Changed files:**

- `apps/web/app/layout.tsx`
- `apps/web/src/components/SettingsDialog.tsx`
- `apps/web/src/state/appearance.ts`
- `apps/web/src/styles/md3-tokens.css`
- `apps/web/src/styles/tokens.css`
- `apps/web/tests/components/SettingsDialog.execution.test.tsx`
- `apps/web/tests/state/config.test.ts`

### 2026-08-04 — The renderer's own title bar, drawn where Windows draws none

**Reason:** the previous entry took the operating system's caption bar away on
win32 and gave the renderer an IPC bridge to replace it. Until something drew
that replacement the Windows build had no minimize, no maximize and no close —
this is the surface that draws it.

`apps/web/src/components/WindowTitleBar.tsx` and its colocated
`WindowTitleBar.module.css` are the whole bar, styled as a CSS Module beside
the component the way `AGENTS.md`'s "Web CSS ownership" section asks new
component-owned UI to be. Every value in it is the Material Design 3 contract
transcribed from this repository's own mockup
(`mockups/open-design-m3/Open Design M3.dc.html`, lines 146–157): a 40px
`surface-container` strip, one hairline `outline-variant` border along the
bottom only, 12px of padding on the left and none on the right so the buttons
run to the window edge, the 20px brand mark in `primary`, the app name at
12px/600 with `.02em` tracking in `on-surface-variant`, a flexible drag region,
and three 46px caption buttons whose hover is the `--ripple` state layer —
except Close, which takes the literal `#C42B1C` on `#fff` that the contract
deliberately keeps outside the token system because it is the Windows system
red rather than a role.

Four things about it are load-bearing rather than cosmetic:

1. **It renders nothing unless the host is the frameless Windows shell.** The
   bridge must report a desktop client on `win32` *and* actually carry the
   optional `windowControls` namespace. Either half alone would be enough
   today, since the preload exposes that namespace on win32 only — asking both
   is what stops a future change to one of them from painting caption buttons
   that do nothing on macOS or Linux.
2. **The maximized glyph follows the window, not the button.** It is seeded
   from `isMaximized()` (a session reopened maximized reaches first paint that
   way) and then tracks the bridge's push, because Windows changes the state
   behind the app's back through snap layouts, Win+Up and a drag off the top
   edge. The subscription is torn down on unmount.
3. **The bar drags, the buttons do not.** The strip is
   `-webkit-app-region: drag`; each button opts back out with `no-drag`, or a
   click on one would begin a window drag instead of firing. Double-click to
   toggle maximize is bound to the drag region rather than the whole bar, so a
   double-click on Close cannot also maximize the window on its way up the
   tree.
4. **The button selectors are two-class (`.bar .button`) on purpose.**
   `styles/primitives.css` styles bare `button`, and its
   `button:hover:not(:disabled)` rule has specificity (0,2,1); a single-class
   module rule would lose the hover the caption bar depends on and repaint it
   in the product's generic button colours.

Two deliberate departures from the mockup, both because the mockup is a
demonstration page and this is the application:

- The mockup's second title-bar span, `— Material 3 Expressive · Windows`,
  describes the mockup itself and is not product copy, so the brand mark is the
  logo and `app.brand` alone.
- The contract's focus ring is `3px solid primary` at `outline-offset: 2px`.
  The offset is inset here, because these buttons sit flush against the top and
  right edges of the window and an outward ring would be drawn outside the
  window and clipped away on two sides of every button.
- The mockup's glyphs are Material Symbols Rounded (`minimize`, `crop_square`,
  `close`), a font this application does not bundle and will not fetch. The bar
  uses the app's own bundled Remix icon set at the contract's sizes —
  `subtract-line` at 16px, `checkbox-blank-line`/`checkbox-multiple-blank-line`
  at 15px, `close-line` at 17px — rather than adding a webfont for three
  glyphs.

`App.tsx` mounts it as the first child of the shell, above the existing
`WorkspaceTabsBar` chrome; nothing else in the tree moved. `styles/shell.css`
gains the one rule that change requires: `.workspace-shell` is a two-row grid,
so a third child needs a third row. The rule selects on
`:has(> [data-window-title-bar])` rather than on a second copy of the platform
test, so the row count cannot drift away from whether the bar is actually on
screen — and on every other platform the component renders nothing, the
selector does not match, and the shell keeps the template it always had. The
tab row in that template is `auto`, not a literal: `:has()` adds the
specificity of its argument, so the rule outranks every bare `.workspace-shell`
selector regardless of import order, and `styles/viewer/routines.css` already
re-declares that template at a different height. Sizing the row to the chrome
header's real height keeps the Windows path from being pinned to a number the
header no longer uses.

The four caption labels are new i18n keys (`titleBar.minimize`,
`titleBar.maximize`, `titleBar.restore`, `titleBar.close`) added to the typed
`Dict` and to all nineteen locale files, since a key missing from any one of
them fails typecheck. They are standard window-control labels, so each locale
uses the term that platform's users already read on those buttons rather than a
literal translation.

**Changed files:**

- `apps/web/src/App.tsx`
- `apps/web/src/components/WindowTitleBar.module.css`
- `apps/web/src/components/WindowTitleBar.tsx`
- `apps/web/src/i18n/locales/ar.ts`
- `apps/web/src/i18n/locales/de.ts`
- `apps/web/src/i18n/locales/en.ts`
- `apps/web/src/i18n/locales/es-ES.ts`
- `apps/web/src/i18n/locales/fa.ts`
- `apps/web/src/i18n/locales/fr.ts`
- `apps/web/src/i18n/locales/hu.ts`
- `apps/web/src/i18n/locales/id.ts`
- `apps/web/src/i18n/locales/it.ts`
- `apps/web/src/i18n/locales/ja.ts`
- `apps/web/src/i18n/locales/ko.ts`
- `apps/web/src/i18n/locales/pl.ts`
- `apps/web/src/i18n/locales/pt-BR.ts`
- `apps/web/src/i18n/locales/ru.ts`
- `apps/web/src/i18n/locales/th.ts`
- `apps/web/src/i18n/locales/tr.ts`
- `apps/web/src/i18n/locales/uk.ts`
- `apps/web/src/i18n/locales/zh-CN.ts`
- `apps/web/src/i18n/locales/zh-TW.ts`
- `apps/web/src/i18n/types.ts`
- `apps/web/src/styles/shell.css`
- `apps/web/tests/components/WindowTitleBar.test.tsx`

### 2026-08-04 — Frameless Windows window with a custom Material Design 3 title bar

**Reason:** Windows builds showed the operating system's own title bar. The
frameless chrome existed only for macOS, where `MAC_WINDOW_CHROME` spread
`titleBarStyle: "hiddenInset"` plus a traffic-light position and spread an
empty object everywhere else, so win32 fell through to the default caption bar
— a grey strip of another design system sitting above a Material Design 3
application.

That constant is now `PLATFORM_WINDOW_CHROME` with a win32 branch of
`{ titleBarStyle: "hidden" }`. The macOS branch is unchanged. Two neighbouring
options were deliberately **not** used, and the reasons are worth recording
because both look like the obvious fix:

- **`frame: false`** removes the whole window frame, not just the caption bar,
  and takes Windows 11's rounded corners, drop shadow and Alt+Space system menu
  down with it. `titleBarStyle: "hidden"` leaves the window an ordinary framed
  window that simply draws no caption bar.
- **`titleBarOverlay`** keeps the OS drawing the caption buttons, in a
  reserved region the app must dodge. That is precisely the chrome this change
  exists to replace, so the buttons would be the operating system's and the
  title bar around them would be the product's.

One Windows 11 behaviour genuinely does not survive, and the code comment says
so rather than claiming otherwise: the **snap-layouts flyout**. The OS raises it
only while it hit-tests the pointer onto a maximize button — `WM_NCHITTEST`
returning `HTMAXBUTTON` — and `-webkit-app-region: drag` reports `HTCAPTION` for
the whole strip, with no Electron API to mark an HTML element as the maximize
button short of letting `titleBarOverlay` draw the OS's own buttons there. So
hovering the renderer's maximize button pops no flyout; Win+Z and drag-to-edge
snapping still work. That is the cost of the caption bar being the product's.

With no OS caption bar there is no OS route to minimize, maximize or close, so
the renderer needs one. `apps/desktop/src/main/window-controls.ts` is a new
module registering four IPC channels (`od:window:minimize`,
`od:window:toggle-maximize`, `od:window:close`, `od:window:is-maximized`) and a
`od:window:maximized-changed` push. Two properties of it are load-bearing:

1. **Every handler verifies the sender is the main window.** The app enables
   `webviewTag` and every frame in the process shares one preload, so an
   embedded design-browser guest reaches the same channels; without the check
   any page a user loaded in that panel could close the application. The check
   and its message mirror `requireMainWindowSender`, which already guards the
   updater and capture channels in `runtime.ts`.
2. **The window's maximized state is pushed, not polled.** Windows changes it
   behind the app's back — a snap layout, a double-clicked drag region, Win+Up,
   or a drag off the top edge all bypass the renderer's own button — so a title
   bar that only tracked its own clicks would show the wrong glyph. The main
   window's `maximize`/`unmaximize` events fan out to the renderer, guarded
   against a destroyed window.

Both surfaces are declared structurally rather than against Electron's classes
so `apps/desktop`'s vitest suite, which runs in a plain node environment with
no Electron, can exercise the whole module with object mocks.

The bridge namespace is **optional** (`windowControls?`) and exposed on win32
only, so a renderer feature-detects it instead of drawing caption buttons that
would do nothing on macOS and Linux. `packages/host` carries the type because
it owns the host-bridge wire contract; the preload duplicates the channel-name
literals for the same reason it already duplicates the updater ones — a
sandboxed preload may only `require('electron')`, so it cannot import the
main-process module that owns them. `apps/desktop/tests/main/window-chrome.test.ts`
asserts the chrome as source text and would otherwise have gone red on this
change; it now pins the win32 branch, the macOS branch, and the absence of both
rejected options.

**Changed files:**

- `apps/desktop/src/main/preload.cts`
- `apps/desktop/src/main/runtime.ts`
- `apps/desktop/src/main/window-controls.ts`
- `apps/desktop/tests/main/preload-host-boundary.test.ts`
- `apps/desktop/tests/main/window-chrome.test.ts`
- `apps/desktop/tests/main/window-controls.test.ts`
- `packages/host/src/index.ts`
- `packages/host/src/protocol.ts`

### 2026-08-03 — Material Design 3 token sheet, and the layer that maps the app onto it

**Reason:** the product had a hand-tuned neutral palette and no design system
behind it. This adds the Material Design 3 contract as a sheet of its own and
rewrites the existing token file into a mapping layer, so every component that
already asks for `--bg`, `--text`, `--border`, `--radius` or `--ease-out`
receives an M3 role without a single component being touched.

The split is the point. `apps/web/src/styles/md3-tokens.css` is the contract,
transcribed from this repository's own mockup
(`mockups/open-design-m3/Open Design M3.dc.html`): the 34 light colour roles,
the dark overrides, the four seed variants, the seven-step shape corner scale,
the three motion curves, the density scale, the `--ripple` state layer, a
`--ui-scale` factor, and a fifteen-role type scale assembled from the mockup's
measured size, weight, line-height and letter-spacing vocabulary (the contract
declares no typescale tokens of its own). It defines tokens and paints nothing.
`apps/web/src/styles/tokens.css` keeps all 61 of its historical property names —
none added, none removed — and redefines each in terms of a role. `index.css`
gains one line so the contract is imported immediately before the mapping layer;
nothing else moves, and it stays import-only as its own guard test requires,
which is also why the explanatory comment lives in the two token sheets and not
in `index.css`.

Dark is declared under **both** selectors the app already uses — explicit
`[data-theme="dark"]` and `html:not([data-theme])` under
`@media (prefers-color-scheme: dark)` — because overriding only the first would
leave every system-mode user on the old palette. Because the roles flip
themselves, the mapping layer's duplicated dark block mostly disappeared.

Three groups deliberately did **not** move:

1. **The status/category palette** (`--green*`, `--blue*`, `--purple*`, `--red*`,
   `--amber*`) is functional data colour, not chrome. The hue *is* the datum —
   mention kind, cost tier, pass/fail — so folding it onto M3 roles would make
   different categories indistinguishable. It keeps its own values and its own
   dark block. `--amber-border` is still deliberately undefined, because
   `workspace/mention-home.css` falls back through it to `--green-border`.
2. **`--selected` / `--selected-soft`** are ambiguous and were left alone. M3
   would call them `secondary`, but in this contract `secondary` is a warm brown
   a few degrees off `primary` — which would collapse the exact CTA-versus-
   selection distinction the token exists to hold — and they are theme-invariant
   on purpose while every M3 role is not.
3. **`--shadow-*`** keep their own light and dark values. The contract expresses
   elevation as literal box-shadows and declares neither a `shadow` colour role
   nor an elevation token set, so there is nothing to derive from.

Also deliberate: `--text-strong` converges onto `on-surface`, M3's
maximum-contrast text colour, rather than inventing a role above it; the two
reading measures (`--prose-line-height`, `--code-line-height`) stay literal
because they are long-form measures wider than any chrome role; and the accent
group is written in terms of `primary` even though `state/appearance.ts` and the
pre-hydration script in `app/layout.tsx` both set it inline on `<html>` and win.
Neither writer needed changing: their stored `color-mix()` strings resolve
against `--text-strong` and `--bg-panel` at use time, so a user's own accent is
now mixed against M3 surfaces for free.

Three style tests asserted the palette this change replaces, and were updated to
the new architecture rather than to new expectations. `default-background` no
longer reads a literal background hex out of `:root` but checks that `--bg` is
the surface role and that the role carries the M3 value; `filter-pill` and
`home-hero-picker-contrast` follow `var()` indirection to a hex before measuring
contrast. All three also had to stop taking the *first* `:root` /
`[data-theme="dark"]` block they found, since there are now two sheets that open
one. The contrast thresholds they guard are still cleared — comfortably, because
M3's `on-surface-variant` is a higher-contrast role than the `--text-muted` it
replaces.

**Changed files:**

- `apps/web/src/index.css`
- `apps/web/src/styles/md3-tokens.css`
- `apps/web/src/styles/tokens.css`
- `apps/web/tests/styles/default-background.test.ts`
- `apps/web/tests/styles/filter-pill.test.ts`
- `apps/web/tests/styles/home-hero-picker-contrast.test.ts`

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
