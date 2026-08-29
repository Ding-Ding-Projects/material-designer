# The packaged runtime

## Installed Squirrel path and shortcut boundary

An installed package never carries the build machine's absolute
`namespaceBaseRoot`. Normal launches resolve data, logs, runtime, update and
session roots from Electron's per-user application-data directory. tools-pack
lifecycle runs that deliberately own an isolated runtime create a separate
launch configuration containing their explicit namespace-root override; that
override is never baked into the shipped `open-design-config.json`.

The unsigned packer separately embeds the shipped multi-resolution ICO through
the existing JavaScript resource editor, then reopens the executable and requires
one icon group containing all four source images. This resource-only step keeps
electron-builder's combined signing/resource-editing path disabled and does not
sign the executable.

The unsigned executable intentionally keeps electron-builder's combined
sign/edit control disabled. Its Windows version resource can therefore retain
Electron/GitHub metadata, which Squirrel would otherwise use to create
`GitHub, Inc.\Electron.lnk`. The packaged lifecycle handles
`--squirrel-install`, `--squirrel-updated` and `--squirrel-uninstall` by creating
or removing explicit `Material Designer.lnk` shortcuts in the Start menu and
desktop. Both target Squirrel's stable root launcher and use the installed
version directory as their working directory. Failure to reconcile shortcuts
returns a nonzero lifecycle result rather than completing setup silently.

What actually launches when somebody double-clicks the installed application, and
every way it differs from the stack a developer runs. A packaged build is not the
development stack with the debugging turned off — it has a different entry point,
a different scheme for loading the interface, a different environment, and a
different path layout.

> [!IMPORTANT]
> **Status: imported, with product identity changed by this repository, and
> observed running.** The launcher is upstream's; the standalone application
> identity — display name, application ids, named-pipe prefix, uninstall registry
> key, install location, user-data directory and taskbar identity — is this
> repository's work, because an unmodified build installed beside the upstream one
> was the same application as far as Windows is concerned and collided in eight
> ways. The `Release` workflow's smoke test installed a built application,
> launched it, health-checked it and uninstalled it, asserting the identity at
> every step.

## Behaviour

### What the launcher is

A thin entry point, bundled with a bundler into a single file, whose whole job is
assembly:

1. Resolve the packaged configuration — channel, namespace, web output mode.
2. Resolve the namespace-scoped path layout.
3. Start the **daemon** and **web** sidecars and wait for them to report healthy.
4. Register the `od://` scheme and its handler.
5. Hand off to the desktop shell's main process.
6. Supervise: keep identity files current, stop the sidecars on quit, handle the
   Windows lifecycle.

It owns no product logic. The daemon, web and desktop implementations are somebody
else's; the launcher only starts them in the right order with the right
environment.

### The `od://` scheme

The packaged renderer does not load an `http://` URL. It loads `od://app/`, a
custom scheme registered as **privileged** — standard, secure, stream-capable,
CORS-enabled and reachable from the fetch API. The handler rewrites the incoming
path, query and fragment onto the web sidecar's real URL and proxies the response.

The scheme exists so the renderer's origin is stable and product-owned rather than
a loopback address with a port that changes every launch. It also means the
packaged interface's origin is not something the origin guard has to be told
about.

**Idempotent requests are retried, and the reason is worth reading before anybody
"simplifies" it away.** The proxy retries `GET` and `HEAD` up to three times with
a short backoff. Network stacks can throw mid-fetch from socket internals even
while the web sidecar is perfectly healthy, and when that happens on the *top
navigation* the synthetic error response **becomes the document the window
renders**. The user does not see a failed request; they see an error page instead
of the application. A retry on the idempotent methods costs a few hundred
milliseconds in the worst case and removes that failure entirely.

### Sidecars, stamps and namespaces

The daemon and the web runtime are started as sidecar child processes. Each is
stamped with exactly five fields — app, mode, namespace, socket path and source —
and those stamps are how anything later finds the process again. Orchestration
layers must build them through the protocol package's primitives; hand-assembling
the flags or writing a process-scan regular expression is explicitly forbidden,
because a stamp that differs by one field is a process nothing can find and
nothing can stop.

A **namespace** is the isolation unit. Two namespaces can be installed and running
at once, which is what makes it possible to validate an update against a real
prior install. Every runtime path is scoped by it.

### The child environment is an allowlist, not an inheritance

Packaged children do **not** inherit the parent environment. A fixed allowlist is
forwarded — proxy variables, locale, home, temporary directory, user identity, and
a small number of external tool homes — plus, separately, the updater control
variables the daemon needs to launch a replacement payload with the same policy as
the outer process. Provider secrets are forwarded only when explicitly requested.

The reason is blast radius. A packaged application inherits whatever shell the
user's launcher happened to have, and an arbitrary variable reaching an agent
subprocess is an arbitrary variable reaching a program that executes code.

### Paths are namespace-scoped and never contain a port

The launcher resolves a full path layout before spawning anything: data root,
runtime root, cache root, logs root, Electron user-data and session roots, update
root, installer-observation root, resource root, and the identity files for the
desktop, web and headless runtimes.

Two rules govern all of them:

- **Namespace-scoped.** Every path is under the namespace's own subtree, so two
  channels or two namespaces cannot write over each other.
- **Port-independent.** A port is a transient transport detail. A path containing
  one changes every run and therefore persists nothing — which looks exactly like
  data loss to a user.

One path deliberately sits **above** the namespace subtree: the installation
record lives at the channel root, so the installation identifier survives a reset
of the namespace-scoped data (namespace churn between versions, a future
per-namespace wipe). Anything that must outlive a namespace has to be stored
outside it, and this is the only such thing.

The bundled read-only resources root is for the daemon's non-framework resources —
skills, design templates, design systems, craft rules, plugin data, frames, prompt
templates and baked preview metadata. The framework's own output must **not** go
under it: packaged web is server-rendered by the web sidecar, not served as static
resources by the daemon.

### Channels

The product ships four release channels, each with a **distinct public identity**:
stable, beta, prerelease and preview. Distinct means genuinely distinct — separate
display names, separate application ids, separate uninstall registry keys — so two
channels can be installed at once without one uninstalling the other. Shipping a
beta whose installed identity is the stable one is called out in the workspace's
own rules as a defect, because the collision is invisible until it destroys
somebody's install.

This repository's `Release` workflow builds the **stable** channel, with the
namespace and channel set as literals in the workflow, because upstream derives
them from a metadata job wired to infrastructure this fork does not have — and an
empty namespace fails the packer outright.

## Packaged versus development

| | Development | Packaged |
| --- | --- | --- |
| Entry point | The development tool starts each process | The launcher, bundled to one file |
| Interface transport | Development server, with framework rewrites to the daemon | Web sidecar server-side rendering, behind the `od://` scheme |
| Renderer origin | `http://127.0.0.1:<web port>` | `od://app/` |
| Ports | Allocated dynamically, exported to children | Still HTTP internally, but never embedded in a path |
| Namespace | From the development tool's `--namespace` | From the packaged configuration |
| Data root | `<project root>/.od` unless overridden | Namespace-scoped, resolved before the daemon starts |
| Child environment | Inherited | Allowlisted |
| Resources | Read from the workspace | Read from the bundled resource root |
| Updater | Not involved | Present for packaged stable Windows builds; reads the project-owned `metadata.json` feed, downloads Squirrel `Setup.exe` in the background and waits for an explicit restart |

> [!WARNING]
> A development namespace does **not**, by itself, isolate daemon data. The
> development tool's namespace governs runtime, log and socket paths. A run that
> needs an isolated data root must pass the data-directory variable explicitly.
> Assuming otherwise is how two development runs end up sharing one database. See
> [data-directory.md](data-directory.md).

## Configuration

| Variable | Effect |
| --- | --- |
| `OD_DATA_DIR` | The daemon data root. In a packaged build it **must be absolute** — a relative value throws with a message naming the configured value. If it points at a namespace-scoped data directory, the namespace in the path must match the running namespace. |
| `OD_RESOURCE_ROOT` | The bundled read-only resource root. Rejected unless it resolves inside the workspace root or the application's resources path. |
| `OD_WEB_OUTPUT_MODE` | `server` or `standalone`. Packaged uses a server runtime; the sidecar proxies daemon routes in front of it. |
| `OD_SIDECAR_NAMESPACE` | The namespace this runtime belongs to. |
| `OD_SIDECAR_IPC_BASE` / `OD_SIDECAR_IPC_PATH` | Where the control sockets live. |
| `OD_SIDECAR_SOURCE` | Which orchestrator started the process. |
| `OD_UPDATE_*` | Updater feed, channel, intervals, and dry-run controls. Packaged stable Windows builds default to the project-owned `metadata.json` feed; explicit overrides remain available for test channels. |

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| The app refuses to start, naming the data directory and saying it must be absolute | A relative data-directory value in a packaged build | Set an absolute path. Relative resolution in a packaged app depends on the working directory the OS launcher happened to give it, which is not a thing to build on. |
| The app refuses to start over a namespace mismatch | The data-directory path is namespace-scoped for a *different* namespace | Point it at the running namespace's root, or at a path that is not namespace-scoped. |
| The window shows an error page instead of the app | A transient socket failure on the top navigation became the document | This is what the idempotent retry exists to prevent; check it is still in place before looking elsewhere. |
| Two installs uninstall each other | Two builds sharing one identity | Channel and product identity must be distinct. This is the eight-way collision the rebrand fixed. |
| Data appears empty after an upgrade | A path derived from the app name, the user-data directory, a port, or the channel instead of the resolved data root | See [data-directory.md](data-directory.md). |
| The installation identifier resets | Something stored it inside the namespace subtree | It belongs at the channel root, above the namespace. |
| The packer exits immediately | An empty namespace or application version | Both are set explicitly in the workflow for exactly this reason. |
| An agent subprocess cannot find a tool it needs | The variable naming it is not on the child allowlist | Add it deliberately, or pass the value another way. Widening the allowlist casually widens what reaches a program that executes code. |
| A Windows update is ready but does not install immediately | Squirrel downloads `Setup.exe` without launching it from the background check | Choose **Restart to install update** in the non-blocking updater surface; **Later** keeps the current app running. |
| A packaged build serves stale interface assets | Framework output placed under the bundled resource root | Packaged web is server-rendered by the sidecar; the resource root is for the daemon's non-framework resources only. |

## Security considerations

- **The launcher decides what the children can see.** The environment allowlist is
  a security control, not tidiness: everything forwarded reaches a process that
  spawns local command-line tools with the user's privileges.
- **The `od://` scheme is registered as privileged.** That gives it powers an
  ordinary custom scheme does not have, and the handler proxies to a local server.
  It must never be pointed at anything but the web sidecar's own URL.
- **Namespace isolation is a containment boundary.** Two channels sharing a
  namespace share credentials, tokens and project data. The distinct-identity rule
  is what keeps a beta build from reading and then deleting a stable install's
  data.
- **The updater replaces the application.** Packaged stable Windows builds use the
  project-owned `metadata.json` feed and verify the installer checksum before
  exposing it. The background download never launches a replacement process;
  the user explicitly chooses **Restart to install update**, so an update cannot
  interrupt active work by surprise. The Squirrel lifecycle handles install,
  update, uninstall and obsolete events before normal startup.
- **Uninstall must actually remove things.** The smoke test asserts zero residue —
  no managed processes, no namespace root, no registry entries, no installed
  executable, no uninstaller, no shortcuts — because an uninstall that leaves
  credentials on disk is a privacy failure, not an untidy one.

## Verification

**Observed** in the `Release` workflow's packaged smoke test, on a Windows runner,
against a real built installer:

- The application installed into the expected namespace-scoped location, with the
  uninstaller inside the install directory, both shortcuts present under the
  product display name, and registry entries carrying the display name and the
  namespaced key.
- The installed payload was non-empty by file count, byte count and top-level
  entries, and the install completed inside its time budget.
- The application started from the installed executable, reported the expected
  namespace, and identified its own source as an installed build.
- The running process answered its own health endpoint with the release version.
- Uninstall left **zero** residue on every one of seven checks.

**Not observed yet:** every non-Windows platform, a new published Squirrel feed
run, reinstall over a running instance, and upgrade data persistence. The
updater's focused tests cover the feed classification and restart action; the
smoke test's `full` profile still requires a separately-built update fixture.

```bash
# build, install, drive and remove a packaged Windows build locally
pnpm tools-pack win build --to squirrel
pnpm tools-pack win install
pnpm tools-pack win cleanup

# the launcher's own suite
pnpm --filter @open-design/packaged test
```

## Suggested reading

- [data-directory.md](data-directory.md) — the invariant the launcher resolves before anything else starts
- [desktop-shell.md](desktop-shell.md) — the process the launcher hands off to
- [web-runtime.md](web-runtime.md) — the sidecar the `od://` scheme proxies to
- [../release/packaged-smoke-test.md](../release/packaged-smoke-test.md) — every assertion the observed run made
- [../release/release-pipeline.md](../release/release-pipeline.md) — how the installer that gets tested is produced
