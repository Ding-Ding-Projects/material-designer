# The web runtime

The single-page interface, and the three genuinely different ways it reaches the
daemon depending on how it was built. Getting those three confused is the usual
cause of "the interface loads but every request 404s", so this page leads with
them rather than with the framework.

> [!IMPORTANT]
> **Status: imported, redesign in progress.** The interface is upstream's,
> carried into `design/` byte-for-byte. What this repository has changed so far is
> the style layer: a Material Design 3 token sheet plus a mapping layer that
> rewires the app's existing token names onto M3 roles. No component has been
> rewritten. The Cantonese locale, the tone sliders, the in-app regex builder, the
> startup surprise and the changelog viewer **are not in the application** — the
> documentation site demonstrates them; the app does not have them yet.

## Behaviour

### Framework and shape

React 18.3.1 on Next 16.2.6 (App Router), Tailwind 4.3.0, with a rich-text editor,
syntax highlighting, an animation library and a whiteboard component. Entry points
live under `design/apps/web/app/`; the main client shell is
`design/apps/web/src/App.tsx`.

It holds **no durable state of its own**. Everything the user creates lives behind
the daemon's HTTP API, which is what makes the command-line entry point and the
interface interchangeable views of the same workspace.

### The three output modes

`design/apps/web/next.config.ts` branches on `OD_WEB_OUTPUT_MODE` and
`NODE_ENV`. The branch decides who serves the assets and who proxies `/api`.

| Mode | Selected when | Who serves the interface | How `/api` is reached |
| --- | --- | --- | --- |
| **Development** | `NODE_ENV=development` | The Next development server, on a port the development tool allocates | Next **rewrites** `/api/:path*`, `/artifacts/:path*` and `/frames/:path*` to `http://127.0.0.1:${OD_PORT}` |
| **Static export** | production, `OD_WEB_OUTPUT_MODE` unset | The **daemon** serves the built assets; its catch-all route is the single-page-app fallback | Same origin — the daemon is the origin |
| **Server / standalone** | `OD_WEB_OUTPUT_MODE=server` or `=standalone` | The **web sidecar** owns a Next server-side-rendering server | The sidecar proxies daemon routes at runtime |

`standalone` differs from `server` only in asking Next for a traced standalone
server; the sidecar-owned daemon proxy still sits in front of it at runtime.

Two consequences worth stating plainly, because they are the ones that surprise
people:

- **In development the rewrite target is read from the environment at config
  evaluation time.** `DAEMON_PORT` falls back to `7456` only when `OD_PORT` is
  unset. The development tool allocates a free port and exports `OD_PORT` to the
  child, so the web app follows it; start the web app without that export and it
  will rewrite to `7456` and reach nothing.
- **A packaged build does not use the rewrites at all.** Packaged web is
  server-mode SSR behind the web sidecar. Diagnosing a packaged routing problem by
  reading the rewrite block is reading the wrong branch.

### How the packaged renderer actually loads

In a packaged build the desktop renderer does not load an `http://` URL. It loads
`od://app/`, a privileged custom scheme registered by the packaged launcher, whose
handler rewrites the request onto the web sidecar's real URL. See
[packaged-runtime.md](packaged-runtime.md) for the scheme's privileges and its
retry behaviour.

This is why the smoke test distinguishes two URL shapes: when desktop inter-process
control is available the running app's location is the `od://` entry, and when it
is not, the fallback is the daemon's own loopback URL.

### Daemon traffic stays HTTP, on purpose

Daemon-to-web traffic in a packaged build still uses an HTTP origin and a port,
even though every other packaged path is namespace-scoped and port-independent.
The reason is recorded in the workspace's own boundaries: the Next development
server and the SSR proxy paths assume HTTP origins, and moving to a local socket
would mean patching framework internals. The invariant that survives is narrower
and more important — **data, log, runtime and cache paths never embed a port.** A
port is a transient transport detail; a path that contains one changes every run
and therefore persists nothing.

### The boundary the interface may not cross

`apps/web/**` must not import `apps/daemon/src/**`. Integration between them goes
through the daemon's HTTP API and the shared contracts package, which carries the
data-transfer types, the server-sent-event unions, the error shapes and the example
payloads. That package is required to stay pure TypeScript: no framework, no
Node filesystem or process APIs, no browser APIs, no database, no daemon internals,
no sidecar control-plane types.

The rule exists because the two processes are separately deployable and separately
versioned. An import across that line compiles fine and then fails at runtime in a
packaged build, where the daemon is a different process on the other side of a
socket.

### Localisation

**19 locales ship**: `en`, `id`, `de`, `zh-CN`, `zh-TW`, `pt-BR`, `es-ES`, `ru`,
`fa`, `ar`, `ja`, `ko`, `pl`, `hu`, `fr`, `uk`, `tr`, `th`, `it`.

Hong Kong Cantonese (`zh-HK`) is **not** among them, and `zh-TW` is not a
substitute — it is Traditional Chinese as written in Taiwan, a different written
register from Hong Kong Cantonese. Adding a locale is a three-file change: the
locale file itself, the provider index, and the typed dictionary. The dictionary is
typed such that **a missing key is a typecheck error**, which is a genuinely good
property to inherit: a new key cannot land in one language and quietly render as
its own name in the other eighteen.

See [../standards/language-modes.md](../standards/language-modes.md) for what the
standard requires beyond this.

### The style layer as it stands

`design/apps/web/src/styles/md3-tokens.css` is a Material Design 3 contract
transcribed from this repository's own mockup: 34 light colour roles, dark
overrides, four seed variants, a seven-step shape scale, three motion curves, a
density scale, a state-layer token, a UI scale factor and a fifteen-role type
scale. It defines tokens and paints nothing.

`design/apps/web/src/styles/tokens.css` keeps all 61 of its historical property
names — none added, none removed — and redefines each in terms of an M3 role. That
split is the whole design: every component that already asks for `--bg`, `--text`,
`--border`, `--radius` or `--ease-out` receives an M3 value **without a single
component being touched**.

Three groups deliberately did not move, and the reasons are the interesting part:

1. **The status and category palette is functional data colour, not chrome.** The
   hue *is* the datum — mention kind, cost tier, pass or fail — so folding it onto
   M3 roles would make different categories indistinguishable.
2. **The selection tokens were left alone.** M3 would call them `secondary`, but in
   this contract `secondary` is a warm brown a few degrees from `primary`, which
   would collapse the exact call-to-action-versus-selection distinction the token
   exists to hold.
3. **The shadow tokens keep their own values**, because the contract expresses
   elevation as literal box-shadows and declares neither a shadow colour role nor
   an elevation token set. There is nothing to derive from.

Dark mode is declared under **both** selectors the app already uses — an explicit
theme attribute, and the system-preference media query for documents carrying no
attribute — because overriding only the first would leave every system-mode user on
the old palette.

## Configuration

| Variable | Default | Effect |
| --- | --- | --- |
| `OD_WEB_OUTPUT_MODE` | unset (static export in production) | `server` or `standalone` selects a Next server runtime owned by the web sidecar. |
| `OD_PORT` | `7456` | The daemon origin the development rewrites target. Exported by the development tool. |
| `OD_WEB_PORT` | allocated | The port the web listener binds in development. A general-purpose framework port variable is deliberately **not** used. |
| `OD_WEB_DIST_DIR` | derived | Overrides the build output directory. |
| `OD_WORKSPACE_ROOT` | computed | Overrides the workspace root used for file tracing and bundler resolution. Validated — see below. |

`OD_WORKSPACE_ROOT` is validated in three separate ways, and each check exists
because of a distinct failure that would otherwise surface much later and much
less legibly:

1. **It must exist.** Otherwise file tracing fails deep inside the bundler.
2. **It must be an ancestor of the web app**, compared through canonicalised real
   paths so a symlinked temporary directory does not compare unequal to itself, and
   with an absolute-path check that catches the Windows cross-drive case where a
   relative path computation returns an absolute path instead of a `..` path.
3. **It must contain the workspace manifest.** Without this, a directory one level
   too high passes the ancestor check but misses the sibling packages the interface
   imports, and the failure appears as an unresolvable module rather than a bad
   override.

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| Interface loads, every `/api` request 404s or is refused | Development rewrites are pointing at the wrong daemon port | Ensure `OD_PORT` is exported to the web process. The development tool does this; starting the web app by hand does not. |
| The packaged app renders but no data appears, and the rewrite block looks correct | Reading the wrong branch — packaged is server-mode SSR behind the web sidecar, not rewrites | Check the sidecar's proxy and the `od://` handler, not `next.config.ts`. |
| An override for the workspace root throws about a missing workspace manifest | The path points one level above the real workspace root | Point it at the directory holding the workspace manifest. |
| A new interface string appears untranslated everywhere | The key was added to a locale file but not to the typed dictionary | Add it to the dictionary first; the typecheck then names every locale still missing it. |
| A colour looks wrong only in system dark mode | An override was written against the explicit theme attribute alone | Declare it under both selectors, as the token sheets do. |
| A category colour became indistinguishable from another | A functional data colour was folded onto a chrome role | Revert it. Data colour is exempt from the design-system mapping. |
| A build succeeds locally and fails packaged with an unresolved module | An import crossed from the web app into daemon source | Route it through the HTTP API and the shared contracts package. |

## Security considerations

- **The renderer is where untrusted content lands.** Generated artifacts are
  rendered in a sandboxed preview frame, and the shell enables embedded web-view
  guests. Any inter-process channel the renderer can reach is reachable by those
  guests too, which is why the desktop shell verifies the sender of every
  privileged message — see [desktop-shell.md](desktop-shell.md).
- **The interface holds no credentials of its own.** Provider keys and connector
  credentials live with the daemon, under the data root. The interface asks the
  daemon to use them; it does not receive them.
- **Same-origin in a static-export build is a real security property, not an
  accident of packaging.** The daemon serves the assets and answers the API from
  one origin, so the origin guard is meaningful. A deployment that splits them
  without configuring allowed origins is choosing to fail closed.
- **Bundled assets only.** This applies to the application for the same reason it
  applies to the documentation site: a remote font or script is a third party who
  can see every user and change the page after review.

## Verification

**Observed:** the packaged interface loaded far enough for the smoke test to
evaluate JavaScript in it, reach `/api/health` from inside the renderer, confirm
the main application shell was present, and capture a screenshot of non-zero size.
That proves the runtime boots and can talk to the daemon. It proves nothing about
what the interface looks like or whether any standard is met.

**Not observed:** every locale, the three output modes other than the packaged
one, the rewrite behaviour, and the rendered result of the token mapping.

```bash
# development: the interface and the daemon, wired by the development tool
pnpm tools-dev run web --daemon-port 17456 --web-port 17573

# what the running stack thinks its own topology is
pnpm tools-dev status --json

# the web app's own checks
pnpm --filter @open-design/web typecheck
pnpm --filter @open-design/web test
```

## Suggested reading

- [daemon.md](daemon.md) — the API this runtime is a client of
- [packaged-runtime.md](packaged-runtime.md) — the `od://` scheme and the web sidecar that serves a shipped build
- [desktop-shell.md](desktop-shell.md) — the window this runtime is rendered inside, and its privileged channels
- [../standards/material-design-3.md](../standards/material-design-3.md) — what the redesign is being measured against
- [../standards/language-modes.md](../standards/language-modes.md) — the locale work the 19 shipped locales do not yet satisfy
