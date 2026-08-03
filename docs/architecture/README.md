# Architecture

What the product is, how its five runnable pieces fit together, and where the
seams are.

## Files in this category

| File | What it covers |
| --- | --- |
| [overview.md](overview.md) | The daemon / web / desktop / packaged / landing-page split, the process and data-flow between them, ports and bind addresses, the command-line entry point's role, the shared packages, and the exact toolchain versions. |

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

## Status

> [!IMPORTANT]
> Everything on these pages is read from the vendored source and its
> documentation. **The application has not been installed, built, or run here**,
> so no statement has been confirmed against a running process. Port numbers,
> defaults and version pins are quoted from the source; behaviour is described
> from the source's own documentation.

The Material Design 3 redesign has not started. The interface described in
[overview.md](overview.md) is the upstream interface. The intended replacement is
specified by the mockup at `mockups/open-design-m3/` and tracked in
[../standards/material-design-3.md](../standards/material-design-3.md).
