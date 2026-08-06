# The desktop shell

The Electron main process. It owns the application window, the privileged
channels the renderer is allowed to reach, and the browser engine the daemon's
export pipeline rasterises through. It owns no product logic at all — it is
chrome, capability and a control surface.

> [!IMPORTANT]
> **Status: imported, with the window chrome changed by this repository.** The
> shell is upstream's; the frameless Windows window and its renderer-drawn title
> bar are this repository's work, declared in `MODIFICATIONS.md`. It has been
> observed running: the `Release` smoke test started the installed application,
> evaluated JavaScript inside it and captured a screenshot through the channels
> described below. What has **not** been observed is any statement about how the
> title bar looks or behaves under a user's hand.

## Behaviour

### It does not guess where the interface is

The most load-bearing rule in the shell is a negative one: **desktop never
guesses the web port.** It asks the running stack for its status over sidecar
inter-process communication and opens the URL it is told. There is no port
probing, no reading of another app's internals, no default that happens to be
right most of the time.

That matters because the port is not stable. Development allocates it
dynamically so two stacks can run side by side, and a packaged build serves the
renderer from a custom scheme rather than a port at all. A shell that guessed
would work on one machine and fail on the next for reasons nobody could see.

### The sidecar control channel

The shell exposes a control channel over the sidecar protocol. The message set is
shared with the launcher and the development tools, and is defined once in the
protocol package rather than being restated by each caller:

| Message | What it does |
| --- | --- |
| `status` | Report the runtime's state, the URL it is showing, and its process identity. |
| `eval` | Evaluate an expression in the renderer and return the result. |
| `screenshot` | Capture the window to a file. |
| `console` | Read the renderer's console output. |
| `click` | Synthesise a click. |
| `show` | Bring the window forward. |
| `shutdown` | Stop the runtime. |
| `export-pdf`, `render-slides`, `export-artifact` | The daemon's export paths, reaching a real browser engine through the shell. |
| `register-web-url`, `register-desktop-auth`, `mint-import-token` | Handshakes that tell the daemon where the renderer is and let the main process mint scoped tokens. |
| `update` | Updater actions — check, download, install, status, clear cache. |

Two of these deserve emphasis because they are how the rest of the system works
at all:

- **`eval` and `screenshot` are the whole headless story.** The development tool
  inspects a running desktop build with them, and the release smoke test proves
  the packaged application is alive by evaluating a `fetch('/api/health')` inside
  the renderer and by capturing the window. There is no separate test harness;
  the shell's own control channel is the harness.
- **The export messages are why PDF, image and slide export need the desktop
  runtime.** The daemon composes the document; the shell's bundled browser engine
  renders it. A bare daemon has no engine, so those export formats are simply not
  available without the shell — that is a capability boundary, not a bug.

### Window chrome

A single per-platform constant decides the window's chrome:

| Platform | Chrome | Why |
| --- | --- | --- |
| macOS | `titleBarStyle: "hiddenInset"` with an explicit traffic-light position | The system buttons stay, inset into the app's own header. |
| Windows | `titleBarStyle: "hidden"` | The OS draws no caption bar; the renderer paints a Material Design 3 one. |
| Other | no override | The platform's default. |

Before this repository's change, only the macOS branch existed and every other
platform fell through to the default — so a Windows build showed the operating
system's grey caption bar above a Material Design 3 application. The project's
standards require a frameless window with a custom title bar on Windows desktop
apps, so this is a conformance fix, not a cosmetic preference.

Two neighbouring options were deliberately **not** used, and both look like the
obvious fix, which is exactly why the reasons are recorded here as well as in the
source:

- **`frame: false`** removes the whole window frame rather than just the caption
  bar, and takes Windows 11's rounded corners, drop shadow and system menu with
  it. `titleBarStyle: "hidden"` leaves an ordinary framed window that simply draws
  no caption bar.
- **`titleBarOverlay`** keeps the operating system drawing the caption buttons in
  a reserved region the app has to dodge. That is precisely the chrome the change
  exists to replace: the buttons would be the OS's and the title bar around them
  would be the product's.

**One Windows 11 behaviour genuinely does not survive: the snap-layouts flyout.**
The OS raises it only while hit-testing the pointer onto a maximize button, and a
draggable region reports itself as the caption for the whole strip — there is no
way to mark an HTML element as *the maximize button* without letting the OS draw
its own buttons there. Hovering the renderer's maximize button therefore pops no
flyout. Keyboard snapping and drag-to-edge snapping are unaffected. That is the
price of owning the caption bar, and it is stated rather than hidden because the
next person to notice it will otherwise file it as a defect.

### Window controls

With no OS caption bar there is no OS route to minimize, maximize or close, so the
renderer needs one. A dedicated main-process module registers four
request/response channels and one push:

| Channel | Direction | Purpose |
| --- | --- | --- |
| `od:window:minimize` | renderer → main | Minimize. |
| `od:window:toggle-maximize` | renderer → main | Maximize or restore. |
| `od:window:close` | renderer → main | Close. |
| `od:window:is-maximized` | renderer → main | Read the current state, for the initial glyph. |
| `od:window:maximized-changed` | main → renderer | Push the state whenever it changes. |

Three properties of that module are load-bearing:

1. **Every handler verifies the sender is the main window.** The application
   enables embedded web-view guests and every frame in the process shares one
   preload script, so without the check any page a user loaded in an embedded
   browser panel could close the application out from under them. The same guard
   already protects the updater and capture channels.
2. **The maximized state is pushed, not polled.** Windows changes it behind the
   application's back — a snap layout, a double-clicked drag region, a keyboard
   shortcut, a drag off the top edge — all of which bypass the renderer's own
   button. A title bar that only tracked its own clicks would show the wrong
   glyph. The window's own maximize and unmaximize events fan out to the renderer,
   guarded against a destroyed window.
3. **Registration replaces any previous registration first.** Creating the runtime
   twice during a development reload would otherwise throw on a duplicate channel.

The renderer-side bridge namespace is **optional and exposed on Windows only**, so
the interface feature-detects it rather than drawing caption buttons that would do
nothing on macOS and Linux.

### The preload boundary

A sandboxed preload script may only require the framework module itself, so it
cannot import the main-process module that owns the channel names. The channel
name literals are therefore duplicated in the preload — the same trade the updater
channels already make. That duplication is deliberate and is covered by a test
that pins the preload's exposed surface, so the two copies cannot drift silently.

### Startup and the splash window

The shell creates a splash window and starts its brand animation **before**
awaiting the daemon and web sidecars, so the animation overlaps the boot rather
than being added to it. Boot phases are surfaced as a muted status line under the
logo. A stage update fired before the load finishes is armed for in advance, so it
cannot be missed.

The shell also carries crash handling that most of the product never sees: renderer
crash-loop detection, uncaught-exception reporting, and crash diagnostics.

## Configuration

The shell is configured almost entirely by what the launcher or the development
tool hands it, not by variables a user sets. The relevant ones:

| Variable | Set by | Effect |
| --- | --- | --- |
| `OD_SIDECAR_NAMESPACE` | launcher / development tool | The namespace this runtime belongs to. |
| `OD_SIDECAR_IPC_PATH` / `OD_SIDECAR_IPC_BASE` | launcher / development tool | Where the control socket lives. |
| `OD_SIDECAR_SOURCE` | launcher / development tool | Which orchestrator started it — packaged, development, or the packaging tool. |
| `OD_UPDATE_*` | launcher | The updater's feed, channel, intervals and dry-run controls. Packaged stable Windows builds use the project-owned `metadata.json` feed by default; explicit overrides remain available for test channels. |

Sidecar process stamps carry exactly five fields — app, mode, namespace, socket
path and source — and orchestration layers must build them through the protocol
package's primitives rather than assembling the flags by hand. The reason is
process identification: stopping "the desktop process for namespace X" is a search
over stamps, and a hand-built stamp that differs by one field is a process nothing
can find and nothing can stop.

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| The window opens on a blank page | The shell was told a URL that is not serving yet | Check the sidecar status the shell read; it does not guess, so a wrong URL came from the launcher or development tool. |
| Window control buttons do nothing | The bridge namespace was not exposed — a non-Windows platform, or a renderer that did not feature-detect | Feature-detect. The namespace is optional and Windows-only by design. |
| The maximize glyph disagrees with the window | Something changed the state outside the renderer and the push was missed | The push is the mechanism; polling is not a fix. Check the maximize/unmaximize listeners are attached. |
| Registering the runtime throws on a duplicate channel | The runtime was created twice without the prior handlers being removed | Registration removes previous handlers first; check the disposer is being used. |
| An embedded browser panel can affect the window | A privileged handler is missing its sender check | Every privileged handler must verify the sender is the main window. This is a security defect, not a nuisance. |
| Export to PDF, image or slides fails from a headless daemon | No browser engine | Expected. Those formats require the desktop runtime. |
| A desktop test fails looking for the framework | A test asserted against framework classes instead of structural types | The suite runs in a plain node environment with no framework available; declare types structurally and use object mocks. |
| Hovering maximize shows no snap-layouts flyout on Windows 11 | The caption bar is the product's, not the OS's | Working as designed; see above. |

## Security considerations

- **The preload is a trust boundary, and it is shared.** Every frame in the
  process gets the same preload, including embedded web-view guests loading pages
  a user chose. Any channel exposed there is exposed to those pages, so **every
  privileged handler verifies its sender.** A handler that skips the check is a
  route from an arbitrary web page to the application's window, updater, or
  capture surface.
- **`eval` executes arbitrary code in the renderer.** It exists so tooling can
  inspect a running build, and it is reachable only over the sidecar control
  socket, which is namespace-scoped and local. Exposing that socket beyond the
  machine would be equivalent to exposing a debugger.
- **The shell mints scoped tokens rather than sharing a secret.** The working
  directory handshake registers the desktop authentication secret with the daemon
  *before* handing the renderer a token bound to it, so a failed handshake is
  reported while the user is still in the picker rather than as a silent failure
  later.
- **The updater is the most dangerous thing the shell can do**, because it
  replaces the application. In this fork it is opt-in and the default origin
  cannot resolve — an unmodified build would otherwise have downloaded the
  upstream project's installer and replaced itself with a different product.

## Verification

**Observed:** during the `Release` workflow's packaged smoke test, the installed
application started, reported `running` over the status channel, evaluated an
expression in the renderer that reached the daemon's health endpoint, was
confirmed to have mounted its main application shell, and was captured to a
screenshot file of non-zero size. The launcher pointers were asserted at the
expected version.

**Not observed:** the title bar's appearance or behaviour, the window control
buttons under a real click, the snap-layouts trade-off, the crash paths, and
every non-Windows platform.

```bash
# drive a running desktop build headlessly
pnpm tools-dev inspect desktop status --json
pnpm tools-dev inspect desktop screenshot --path <file>

# the shell's own suites — plain node, no framework required
pnpm --filter @open-design/desktop test
pnpm --filter @open-design/desktop build
```

## Suggested reading

- [packaged-runtime.md](packaged-runtime.md) — the launcher that starts this shell, and what a shipped build does differently
- [web-runtime.md](web-runtime.md) — what is rendered inside this window
- [daemon.md](daemon.md) — the process the export messages serve
- [../release/packaged-smoke-test.md](../release/packaged-smoke-test.md) — the test that drove these channels, and exactly what it asserted
- [../standards/material-design-3.md](../standards/material-design-3.md) — the window-chrome requirement this satisfies
