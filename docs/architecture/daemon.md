# The daemon

The only stateful process in the product, the only one that touches disk, and the
only one that executes anything on the user's behalf. Everything else — the web
interface, the desktop shell, the command-line entry point, an agent working in
another repository — is a client of this one process.

> [!IMPORTANT]
> **Status: imported, running, largely undocumented by observation.** The daemon
> is upstream's, carried into `design/` byte-for-byte; this repository has not
> rewritten it. It *has* been observed running: the packaged smoke test in the
> `Release` workflow started the installed application and had the running
> process answer `GET /api/health` with `200` and `{"ok": true}` carrying the
> release version. That is one endpoint, once, through the desktop shell. Every
> other statement on this page is read from the vendored source and says so.

## Behaviour

### What it owns

| Responsibility | Notes |
| --- | --- |
| The HTTP surface | 38 route files, 351 handlers, 304 distinct path patterns. Enumerated in [../api/README.md](../api/README.md), not repeated here. |
| Server-sent event streams | Run progress, project file events, plugin events, memory events, library events. |
| The database | An embedded SQLite file, with vacuum and verify exposed over HTTP. |
| The agent-runtime registry | 26 runtime definitions backed by 25 distinct local executables. The daemon looks for each on the machine, reports which are present, and drives whichever the user selects. |
| Agent process supervision | Spawning the selected command-line tool, streaming its output, and deciding when its stdin may close. |
| The bring-your-own-key proxy | `/api/proxy/<provider>/stream`, with private-address-space blocking in front of it. |
| Terminal sessions | Real pseudo-terminals under `/api/projects/:id/terminals`, streamed over HTTP. |
| Export | Including the paths that rasterise through the desktop shell's browser engine. |
| Static serving | In a packaged static-export build, the daemon serves the built interface and its catch-all route is the single-page-app fallback. |
| The `od` command-line entry point | The same binary, entered differently. |

### Startup, in order

The order matters more than it looks, because two of these steps can fail in a
way that is only diagnosable if you know they happened before anything else.

1. **Resolve the data root.** `OD_DATA_DIR` is read once and becomes
   `RUNTIME_DATA_DIR`. Every daemon-owned path in the process derives from that
   one value. This is the single most important invariant in the codebase and it
   has [its own page](data-directory.md).
2. **Prove the data root is writable.** The resolver creates the directory and
   then calls `access(…, W_OK)`. A failure here throws with a diagnostic naming
   the current user and suggesting the three usual causes — a parent owned by
   another user, a symlink into a protected location, a directory previously
   created with elevated privileges.
3. **Migrate legacy data, once.** When `OD_LEGACY_DATA_DIR` is set and the new
   root is empty, a one-shot import runs. It is a migration source, never a
   second data root.
4. **Derive the constants.** `ARTIFACTS_DIR`, `PROJECTS_DIR`, `LIBRARY_DIR`,
   `BRANDS_DIR`, the plugin registry roots, the plugin lockfile, the SQLite file
   and the rest, all joined onto `RUNTIME_DATA_DIR`.
5. **Create the directories** that must exist before a request can be served.
6. **Register the routes**, in semantic sections, and the origin-validation
   middleware over the whole `/api` tree.
7. **Listen.** `127.0.0.1:7456` unless told otherwise.

### The three probe endpoints

These are the only routes documented here by shape, because they are the only
ones this repository has observed answering.

| Route | Response | Purpose |
| --- | --- | --- |
| `GET /api/health` | `{ "ok": true, "version": "<app version>" }` | Liveness. Always `200` while the process is up. |
| `GET /api/ready` | `{ "ok", "ready", "version" }`, status `200` or `503` | Readiness. Returns `503` once the daemon has begun shutting down, so a supervisor can stop sending it work. |
| `GET /api/version` | `{ "version": { … } }` | The full version record. |

All three are **exempt from token authentication** when `OD_API_TOKEN` is set, so
a monitoring probe does not need the secret to ask whether the process is alive.
Rich daemon status (`/api/daemon/status`) is *not* exempt, because it includes
local runtime paths.

### The command-line entry point

`od` is not a wrapper around the interface. It is the same daemon, entered
differently: running it with no subcommand starts the daemon and opens the web
interface; running it with a subcommand performs that operation against a daemon —
starting one if none is running — and exits.

That is what makes the product usable headlessly. A script, a scheduled job, or an
agent working in a different repository drives the same operations the interface
drives, against the same database, with no interface running at all. The
repository's own boundary rule makes this a hard requirement rather than a
convenience: every user-facing capability must be reachable through **both** the
web interface and `od`, both calling the same `/api/*` endpoints, because the
command-line form is the embeddability contract.

The binary is `design/apps/daemon/bin/od.mjs`. It loads the daemon's **compiled
output**, not its source, so on a tree that has not been built it exits telling
you to bootstrap.

<details>
<summary><b>Root options and the subcommand surface</b> — flags, their defaults, and the dispatch map</summary>

| Option | Default | Environment variable |
| --- | --- | --- |
| `--port <n>` | `7456` | `OD_PORT` |
| `--host <addr>` | `127.0.0.1` | `OD_BIND_HOST` |
| `--no-open` | — | — |

37 subcommand keys resolve to 35 distinct handlers (`brands` aliases `brand`,
`automations` aliases `automation`):

```
artifacts   media       mcp             byok        amr
project     automation  automations     memory      message-center
research    plugin      ui              marketplace share
brand       brands      run             files       templates
conversation chat       deploy          daemon      atoms
skills      design-systems              craft       diagnostics
export      status      version         whats-new   doctor
config      library     figma
```

Two conventions the repository requires of every subcommand: `--json` for
machine-readable output, and `--prompt-file <path|->` so long prompts can arrive
from a file or standard input rather than being wedged into an argument.

</details>

## Configuration

### Network

| Variable | Default | Effect |
| --- | --- | --- |
| `OD_PORT` | `7456` | Listen port. |
| `OD_BIND_HOST` | `127.0.0.1` | Bind address. Anything else exposes the daemon beyond the local machine. |
| `OD_ALLOWED_ORIGINS` | unset | Origins the request-origin guard permits. **Required** alongside a non-loopback bind. |
| `OD_API_TOKEN` | unset | Shared-secret authentication. Loopback requests skip the check; every other request must present a matching bearer token. Required for the container deployment. |
| `OD_ALLOWED_INTERNAL_HOSTS` | unset | Per-host opt-out from the proxy's private-network blocking. |

### Paths

| Variable | Default | Effect |
| --- | --- | --- |
| `OD_DATA_DIR` | `<project root>/.od` | The daemon data root. See [data-directory.md](data-directory.md). |
| `OD_SANDBOX_MODE` | off | Isolated-session mode. Makes `OD_DATA_DIR` **mandatory** — the resolver throws rather than falling back to the default. |
| `OD_LEGACY_DATA_DIR` | unset | One-shot migration source. Not an active data root. |
| `OD_MEDIA_CONFIG_DIR` | unset | Narrow override for the media configuration file only. Not a second data root. |
| `OD_RESOURCE_ROOT` | unset | Root for the daemon's bundled read-only resources in a packaged build. Rejected with an error unless it resolves inside the workspace root or the application's resources path. |
| `OD_PLUGIN_PREVIEWS_DIR` | derived | Overrides the plugin-preview directory; a relative value resolves against the project root. |
| `OD_DAEMON_CLI_PATH` / `OD_BIN` | derived | Explicit path to the daemon's compiled entry point. Otherwise resolved from the installed package's `dist/cli.js`. |

The `OD_RESOURCE_ROOT` containment check is worth understanding rather than
working around: an unconstrained resource root would let a caller point the daemon
at an arbitrary directory and have it served as trusted bundled content.

### Runtime requirements

| Requirement | Value |
| --- | --- |
| Node | `~24`. Node 22 is explicitly not a supported substitute. |
| Package manager | pnpm `>=10.33.2 <11`, pinned at `10.33.2`. |
| Native toolchain | Required on Windows: the embedded database has no prebuilt binary for this platform and runtime pair and is compiled from source. |

## Failure modes

| Symptom | Cause | Response |
| --- | --- | --- |
| `od` exits telling you to bootstrap | The daemon's compiled output does not exist | Run the install/build step. The binary loads `dist/`, not source. |
| Startup throws naming the data directory and the current user | The resolved data root is not writable | Read the message: it names the parent to inspect. Do not work around it by changing the code's fallback. |
| Startup throws that the data directory is required | `OD_SANDBOX_MODE` is on and `OD_DATA_DIR` is unset | Set it. Sandbox mode refuses to fall back to the default, deliberately. |
| Startup throws that the resource root must be under the workspace or app resources path | `OD_RESOURCE_ROOT` points outside both | Point it inside. This is a containment guard, not a path bug. |
| Port already in use on `7456` | Another daemon, or an unrelated service | `--port` / `OD_PORT`. |
| Requests rejected by the origin guard | Non-loopback bind without `OD_ALLOWED_ORIGINS` | Set the allowed origins. Failing closed is correct behaviour. |
| A proxy request refused for a private address | Server-side-request-forgery protection | Intentional. `OD_ALLOWED_INTERNAL_HOSTS` opts one host out; understand what that re-enables. |
| No agent runtimes detected | None of the supported executables is on the path | Install one, or configure a local runtime profile. |
| Export to PDF, image or slides fails | Those paths rasterise through the desktop shell's browser engine | Not available from a bare daemon. See [desktop-shell.md](desktop-shell.md). |
| A route with a bare `*` never matches | Express 5 requires **named** wildcards (`*splat`) | Rename the wildcard. |
| Data written by a feature is invisible to the rest of the app | A path that did not derive from `RUNTIME_DATA_DIR` | See [data-directory.md](data-directory.md) — this is the failure that page exists to prevent. |

## Security considerations

- **Reaching this API is equivalent to shell access.** The daemon's purpose is to
  detect and execute locally installed command-line tools with the user's own
  privileges, and it exposes real pseudo-terminals over HTTP. Loopback binding is
  the primary control, not a default to override casually.
- **Two deliberate acts are needed to expose it** — `OD_BIND_HOST` *and*
  `OD_ALLOWED_ORIGINS` — and the container deployment additionally requires
  `OD_API_TOKEN`. That is not redundancy; it is the difference between an accident
  and a decision.
- **The probe endpoints are deliberately unauthenticated** even when a token is
  configured. They return liveness, readiness and a version string, and nothing
  else. Rich status is authenticated because it leaks local paths.
- **The proxy blocks private address space by default**, including link-local,
  carrier-grade-NAT and cloud-metadata ranges.
- **The data root holds credentials.** Connector credentials and tool-protocol
  tokens live under it. Anything that creates a second data root creates a second
  copy of those secrets in a location nothing is protecting or cleaning up.
- **Telemetry is a no-op without destination credentials, and this repository
  configures none.** The analytics code paths are present because `design/` is a
  verbatim copy. Adding a key at packaging time changes what shipped builds do and
  must be disclosed rather than done quietly.

## Verification

**Observed:** the packaged application's daemon answered `GET /api/health` with
status `200`, `ok: true`, and a version string equal to the version the release
was built for. That happened inside the running installed application during the
`Release` workflow's smoke test, evaluated in the desktop renderer rather than
from outside the process — see [../release/packaged-smoke-test.md](../release/packaged-smoke-test.md).

**Not observed:** every other route, every stream, the agent registry's detection
results, the proxy, the terminal routes, and the database operations. The route
inventory in [../api/README.md](../api/README.md) is a transcription of source,
not a record of requests.

Against a running daemon, these confirm the claims above:

```bash
# liveness, readiness and version — the three probes, unauthenticated by design
curl -sf http://127.0.0.1:7456/api/health
curl -sf http://127.0.0.1:7456/api/ready
curl -sf http://127.0.0.1:7456/api/version

# the command-line entry point resolves to the same daemon
od version
od status
od doctor

# rich status, which requires the token when one is configured
curl -sf http://127.0.0.1:7456/api/daemon/status
```

## Suggested reading

- [data-directory.md](data-directory.md) — the invariant every daemon path obeys, and what breaks when it does not
- [../api/README.md](../api/README.md) — the full route inventory, grouped by the file that owns it
- [web-runtime.md](web-runtime.md) — the client that consumes this API, and the three ways it reaches it
- [packaged-runtime.md](packaged-runtime.md) — how the daemon is started in a shipped build
- [../build/from-source.md](../build/from-source.md) — getting a daemon running locally to test against
