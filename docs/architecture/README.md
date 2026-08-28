# Architecture

What the product is, how its five runnable pieces fit together, and where the
seams are.

## Files in this category

| File | What it covers |
| --- | --- |
| [overview.md](overview.md) | The daemon / web / desktop / packaged / landing-page split, the process and data-flow between them, ports and bind addresses, the command-line entry point's role, the shared packages, and the exact toolchain versions. **Start here.** |
| [daemon.md](daemon.md) | The only stateful process: what it owns, its startup order, the three probe endpoints, the command-line entry point, every network and path variable, and why reaching its API is equivalent to shell access. |
| [web-runtime.md](web-runtime.md) | The single-page interface and the three genuinely different ways it reaches the daemon — development rewrites, static export, and packaged server-side rendering — plus the 19 locales, the boundary it may not cross, and the Material Design 3 token layer as it currently stands. |
| [library-route.md](library-route.md) | The production Library destination, its provider/API boundary, route and navigation wiring, field-owned regex search, and the evidence still needed from a built application. |
| [desktop-shell.md](desktop-shell.md) | The Electron main process: why it never guesses the web port, the sidecar control channel that doubles as the test harness, the frameless Windows window and its renderer-drawn title bar, the window-control channels, and the preload trust boundary. |
| [packaged-startup-identity.md](packaged-startup-identity.md) | The first installed-app surface: its single identity producer, canonical vector source, progress and reduced-motion behavior, fail-closed source guard, verified before capture, and required hosted after capture. |
| [shell-chrome.md](shell-chrome.md) | The renderer shell geometry, persistent rail, field-owned topbar search, tab context-menu picker, status version segment, source guard and hosted visual-proof boundary. |
| [../standards/front-screen-provenance.md](../standards/front-screen-provenance.md) | The front-screen version and provenance-bound local timestamp, including the packaged metadata path and unavailable state. |
| [packaged-runtime.md](packaged-runtime.md) | What launches when somebody runs the installed application: the launcher, the `od://` scheme and its retry, sidecar stamps and namespaces, the child-environment allowlist, the namespace-scoped path layout, the four release channels, and a packaged-versus-development table. |
| [data-directory.md](data-directory.md) | **The single most important invariant in the codebase.** One process, one data root, resolved once. What derives from it, how it propagates to child processes and packaged builds, the five sanctioned exceptions, the four known escape patterns, and — at length — what actually breaks when it is violated. |

## The one-paragraph version

A **local-first design workspace**. A local daemon detects whichever coding-agent
command-line tool is already installed on the machine and drives it to generate
single-page design artifacts — prototypes, dashboards, decks, images, motion
graphics — shaped by a reusable design-system file, rendered in a sandboxed
preview frame and exportable to several formats. Projects, files and the database
stay on local disk. The same daemon is usable headlessly through a command-line
interface and a stdio tool-protocol server, so an agent working in a different
repository can read and write the live design files without exporting an archive.

## The five pieces

| Piece | Workspace | What it is |
| --- | --- | --- |
| Daemon | `design/apps/daemon` | The whole product's brain and its only stateful process. HTTP + server-sent events, an embedded SQLite database, the agent-runtime registry, and the `od` command-line entry point. Binds loopback on port **7456** by default. |
| Web | `design/apps/web` | The single-page interface. Served by the daemon in a packaged build; run from its own dev server during development. |
| Desktop | `design/apps/desktop` | The desktop shell's main process. Owns the window, and provides the bundled browser engine that the daemon's export pipeline rasterises through. |
| Packaged | `design/apps/packaged` | The launcher that starts the daemon and the desktop shell together as sidecar processes in a shipped build. |
| Landing page | `design/apps/landing-page` | The public marketing/documentation site. Independent of the other four; ships nothing into the application. |

Plus **14 shared packages** under `design/packages/` — `agui-adapter`,
`components`, `contracts`, `diagnostics`, `download`, `host`, `launcher-proto`,
`metatool`, `platform`, `plugin-runtime`, `registry-protocol`, `release`,
`sidecar` and `sidecar-proto` — and **four tool workspaces** under
`design/tools/` (`dev`, `pack`, `release`, `serve`) that orchestrate development,
packaging, releasing and serving.

(`design/packages/` also holds an `AGENTS.md`; it is a file, not a package, which
is where a count of 15 comes from if it is taken off a directory listing. Thirteen
of the fourteen packages are built by the root `postinstall`, which is why the
build documentation counts **18** postinstall targets — 13 packages, `apps/daemon`
and the four tools.)

## Where to start

| If you want to… | Read |
| --- | --- |
| Understand the product in one sitting | [overview.md](overview.md) |
| Call, extend or debug the local API | [daemon.md](daemon.md), then [../api/README.md](../api/README.md) |
| Work out why the interface cannot reach the daemon | [web-runtime.md](web-runtime.md) — there are three transports and only one applies |
| Change the window, its chrome, or anything privileged the renderer can reach | [desktop-shell.md](desktop-shell.md) |
| Understand a shipped build, an install path, or an uninstall | [packaged-runtime.md](packaged-runtime.md) |
| Add a path that writes anything to disk | [data-directory.md](data-directory.md) — **before** writing the code, not after |

## Status

> [!IMPORTANT]
> **Most of these pages describe source that has been read, not behaviour that
> has been watched.** The exception is real and worth knowing: continuous
> integration has installed a built Windows application, launched it, had the
> running process answer its own health endpoint, screenshotted it and
> uninstalled it. Where a page states something as observed, it names that run.
> Everything else is a transcription of the vendored source, and is labelled as
> such.
>
> Nothing here claims a standard is met. The application does **not** yet have the
> Cantonese locale, the tone sliders, an in-app regex builder, the startup
> surprise or the changelog viewer; the documentation site demonstrates those, the
> application does not have them.

The Material Design 3 redesign is **in progress**, not finished. The token layer
has landed — a Material Design 3 contract sheet plus a mapping layer that rewires
the app's existing token names onto M3 roles — and Windows has a frameless window
with a renderer-drawn title bar. No component has been rewritten. The intended end
state is specified by the mockup at `mockups/open-design-m3/` and tracked in
[../standards/material-design-3.md](../standards/material-design-3.md).

## Suggested reading

- [data-directory.md](data-directory.md) — the invariant every one of these processes has to respect, and the one whose violation produces the least legible failure in the product
- [../porting/verification.md](../porting/verification.md) — why the tree these processes are built from can be trusted to be what it claims
- [../build/from-source.md](../build/from-source.md) — getting these processes running locally, and the prerequisites that catch people out
- [../release/release-pipeline.md](../release/release-pipeline.md) — how the packaged form of all of this is produced and what proves it works
