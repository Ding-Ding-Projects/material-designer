# Building from source

> [!TIP]
> The supported fresh-machine entry points are the root scripts:
> `build.bat /s` builds the runnable packages and
> `build-installer.bat /s` produces the unsigned Squirrel
> installer and its commit-bound manifest. They bootstrap the declared toolchain
> where the Windows package catalog permits it, fail with the exact missing
> dependency otherwise, and never publish. The commands below remain the
> package-level reference for maintainers.

The installer entry point computes a candidate ordinal automatically. The
optional `--candidate` value is available for a repeatable local fixture, but
fresh-machine callers do not need to supply one.

Every command needed to install, run, check, test and package this project on a
local machine.

> [!IMPORTANT]
> **Nobody has run this page's commands on a local developer machine.** They are
> written for one, and the first person to work through them should expect to
> correct this page.
>
> That is narrower than it sounds. The install, the typecheck, the three
> identity-carrying test suites and the packaging invocation are what the
> release run does on the labelled self-hosted Windows runner, so those are known to work there
> — see [ci.md](ci.md). What is transcribed from the vendored project's own
> documentation and manifests, and has been observed nowhere, is the development
> tooling: the run and inspect commands, the command-line entry point, and the
> per-package test invocations the release run does not use.
>
> The supported path for producing releases is continuous integration. This page
> exists because a developer changing the interface needs a faster loop, and
> because a build nobody can reproduce locally is a build nobody can debug.

## Prerequisites

| Requirement | Version | Why |
| --- | --- | --- |
| Node | `24.20.0` through the root helper | Declared by the workspace root and materialized from the exact pinned archive. **Node 22 is not a supported substitute** — the vendored project's documentation answers that question with a flat no. |
| pnpm | `10.33.2` | Pinned exactly and verified from the canonical npm tarball. Other versions in the `>=10.33.2 <11` range are permitted by the manifest but not what the lockfile was produced with. |
| Git | any recent | Needed for the submodule and for port verification. |
| C++ build tools | 2022 or newer, desktop-development workload | **Windows only.** The embedded SQLite binding has no prebuilt binary for Windows on this Node version and is compiled from source. |
| Python | 3.x, on the path | **Windows only.** Required by the native build system. |

### Platform support

The vendored project states plainly that macOS, Linux and a Linux subsystem are
its primary supported paths, and that **native Windows is best-effort**. This
project targets Windows, so expect to meet problems upstream has not smoothed
over, and expect the native database compile — roughly two minutes on a cold
build — every time the dependency tree is rebuilt from scratch.

### Installing pnpm on Windows

Use the direct install:

```bash
npm install -g pnpm@10.33.2
```

Do **not** use the Node package-manager shim's enable step on Windows: it fails
with a permission error because it cannot write shims into the system program
directory.

On macOS and Linux the shim works and is the vendored documentation's suggestion:

```bash
corepack enable && pnpm install
```

## Getting the tree

```bash
git clone <this repository>
cd material-designer
git submodule update --init          # optional — see below
```

The submodule is the provenance pin, but port verification does **not** require
it. With the submodule absent the verifier falls back to
`scripts/upstream-manifest.tsv` — the committed list of upstream paths, modes and
blob ids — and reports which source it used, `(via submodule)` or
`(via manifest)`. That fallback is why the *Verify* workflow checks out without
submodules at all and still skips a large clone.

Exit `2` means the check could not meaningfully run, which is a different fact
from a failed check. It happens when **neither** source is available, when a
present submodule and the manifest disagree about the pinned commit or its
contents, or when Check B found no tracked paths. Initialising the submodule is
still worth doing when you intend to regenerate the manifest, which needs it.

### Set line endings before you clone

```bash
git config --global core.autocrlf false
```

If the tree is checked out with line-ending conversion enabled, every text file
under `design/` lands with CRLF endings that are not in the upstream blobs, and
port verification's working-tree check reports thousands of differences against a
tree that is fine. Fix the checkout, never the files. Detail:
[../porting/verification.md](../porting/verification.md).

## Verify before you install

```bash
scripts/verify-port.sh
```

Seconds, pure `git` and shell, no toolchain. It confirms the vendored tree is
what it claims to be before you spend ten minutes installing on top of it — and
installing runs install scripts from that tree, so the order is not merely
convenient.

## Install

All application commands run from the `design/` directory, which is the workspace
root.

```bash
cd design
pnpm install
```

<details>
<summary><b>What <code>pnpm install</code> actually does</b> — the 18 workspace builds it triggers, and the notice it prints</summary>

The workspace root declares a post-install step which builds 18 targets in
dependency order:

`packages/release` → `packages/contracts` → `packages/components` →
`packages/platform` → `packages/download` → `packages/host` →
`packages/registry-protocol` → `packages/agui-adapter` →
`packages/plugin-runtime` → `packages/sidecar-proto` →
`packages/launcher-proto` → `packages/sidecar` → `packages/diagnostics` →
`apps/daemon` → `tools/dev` → `tools/pack` → `tools/release` → `tools/serve`

Targets without a TypeScript configuration in the current context are skipped. A
bundled slide-export vendor bundle is decompressed as part of the same step.

The same step is available on its own:

```bash
pnpm bootstrap
```

which is what the command-line entry point tells you to run if you invoke it
before the daemon has been built.

**The ignored-scripts notice.** Install prints a line listing packages whose
install scripts were not run. The workspace maintains an explicit allowlist of
packages permitted to run them — the SQLite binding, a polyfill package,
Electron, the Windows installer builder, the bundler, a protocol-buffer library
and an image library. Everything else is ignored deliberately. The notice is
informational; it is not a warning and it does not indicate a broken install.

</details>

## Run

There is deliberately **no root `dev`, `start` or `daemon` command**. The
vendored project's own documentation states this outright. Use the development
tool:

```bash
pnpm tools-dev run web
```

That starts the daemon and the web interface together with dynamically allocated
ports, so two stacks can run side by side without colliding.

To pin the ports:

```bash
pnpm tools-dev run web --daemon-port 17456 --web-port 17573
```

The tool exports `OD_PORT` to the daemon and `OD_WEB_PORT` to the web listener. A
general-purpose framework port variable is explicitly not used, so setting one
will not have the effect you expect.

<details>
<summary><b>The rest of the development tool</b> — start, status, logs, headless inspection, stop, check</summary>

```bash
pnpm tools-dev                       # start
pnpm tools-dev start web
pnpm tools-dev status --json
pnpm tools-dev logs --json
pnpm tools-dev inspect desktop status --json
pnpm tools-dev inspect desktop screenshot --path <path>
pnpm tools-dev stop
pnpm tools-dev check
```

`inspect desktop` drives a running desktop build through the sidecar control
channel — status and screenshot without a human at the window. This is the
mechanism to reach for when capturing evidence that an interface change actually
renders, rather than asserting that it does.

</details>

### The command-line entry point

```bash
od                 # start the daemon and open the interface
od --port 7456     # default; also OD_PORT
od --host 127.0.0.1  # default; also OD_BIND_HOST
od --no-open       # start the daemon without opening a browser
od status
od doctor
od version
```

`od` loads the daemon's **compiled** output. On a tree that has not been built it
fails with a message telling you to run the bootstrap step — that is the expected
behaviour, not a defect. The full subcommand list is in
[../architecture/overview.md](../architecture/overview.md).

## Check

```bash
pnpm typecheck      # recursive per-package typecheck, then the scripts project
pnpm guard
pnpm i18n:check     # translation-key coverage across every locale
pnpm i18n:coverage
pnpm lint:craft
```

**Build three things before typechecking**, or you will get errors that look like
real defects and are not — downstream packages consume emitted output, not source:

```bash
pnpm --filter @open-design/daemon build
pnpm --filter @open-design/desktop build
pnpm --filter @open-design/web build:sidecar
```

## Test

There is **no root `pnpm test`**, and one must not be added — the vendored
project's contributor documentation forbids root aggregate `build` and `test`
aliases. Suites are invoked per package.

```bash
pnpm --filter @open-design/daemon build && pnpm --filter @open-design/daemon test
pnpm --filter @open-design/web build:sidecar && pnpm --filter @open-design/web test
pnpm --filter @open-design/desktop build && pnpm --filter @open-design/desktop test
pnpm --filter @open-design/packaged test
pnpm --filter @open-design/contracts test
pnpm --filter @open-design/host test
pnpm --filter @open-design/platform test
pnpm --filter @open-design/sidecar test
pnpm --filter @open-design/sidecar-proto test
pnpm --filter @open-design/tools-dev test
pnpm --filter @open-design/tools-pack test
pnpm --filter @open-design/e2e test
```

Browser-driven tests need their browser first:

```bash
pnpm -C e2e exec playwright install --with-deps chromium
pnpm -C e2e exec playwright test -c playwright.config.ts --grep '@critical'
```

<details>
<summary><b>Test layout and conventions</b> — runner, directory convention, priority tags, and the daemon suite's parallelism constraint</summary>

**Runners.** Most workspaces use Vitest 4.1.6. Two — the development tool and the
landing page — use the Node runtime's own test runner with a TypeScript loader.
Browser-driven end-to-end tests use Playwright 1.60.0.

**Directory convention.** Tests live in a `tests/` directory **beside** `src/`,
never co-located with the source they cover. Nine workspaces carry their own
Vitest configuration; the rest run the bare runner.

**The daemon suite runs without file parallelism.** Its tests bind real local
servers and mutate the executable search path, so they cannot share a process
pool safely. It is the longest single suite; expect it to take a while and do not
"fix" it by re-enabling parallelism. Its per-test timeout is 20 seconds and it
loads a setup file.

**The web suite** runs with a worker cap of two.

**Priority tags.** End-to-end suites can be filtered by priority — there are
scripts for the highest priority band, the top two bands, and each band
individually, matching bracketed markers in test names. The browser-driven
critical set is selected with `--grep '@critical'`.

**Browser-test import rule.** Browser tests import their test helpers from the
project's own suite module rather than from the framework directly. That module
gives each worker an isolated daemon, web listener and data directory — importing
the framework directly bypasses the isolation and produces tests that pass alone
and fail together.

</details>

## Package a Windows installer

```bash
pnpm --filter @open-design/tools-pack build
pnpm tools-pack win build --to squirrel
pnpm tools-pack win install
pnpm tools-pack win cleanup
```

| Flag | Meaning |
| --- | --- |
| `--to all\|dir\|nsis\|squirrel\|zip` | Build target. Default on Windows is `squirrel`. `nsis` remains an explicit legacy target; `zip` produces a portable archive from the unpacked build; `all` produces the Squirrel installer plus the portable archive. |
| `--app-version <version>` | Override the version stamped into the build. |
| `--portable` | Portable layout. |
| `--namespace <name>` | Installation namespace. |
| `--dir <path>` | Output directory. |
| `--cache-dir <path>` | Build cache location. |
| `--json` | Machine-readable output. |

Other actions of `tools-pack win`: `install`, `start`, `stop`, `logs`,
`uninstall`, `cleanup`, `list`, `reset`, `inspect`, `diagnose-ipc`,
`validate-payload`. The diagnostic ones are the right first move when a packaged
build starts but shows nothing.

Toolchain: Electron 41.3.0 for the desktop and packaged applications,
electron-builder 26.8.1 for packaging.

**The installer is intentionally unsigned.** Code signing is permanently
prohibited for this project. The release workflow clears signing inputs and
verifies that `Setup.exe` reports `NotSigned`; Windows may therefore show an
unknown-publisher reputation screen with the proceed button behind **More info**.
Expect it, and tell users to expect it.

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| `corepack enable` fails with a permission error | Windows; it cannot write shims into the system program directory | `npm install -g pnpm@10.33.2` |
| Install fails compiling the SQLite binding | No C++ build tools, or no Python on the path | Install the 2022-or-newer build tools with the desktop-development workload, and Python 3.x. |
| Install prints "ignored build scripts" | The workspace's install-script allowlist did its job | Informational. No action. |
| `od` exits telling you to bootstrap | The daemon's compiled output is missing | `pnpm bootstrap` (or `pnpm install`). |
| Typecheck errors in packages you did not touch | The three prebuild targets were skipped | Build daemon, desktop and the web sidecar first. |
| `pnpm test` at the root does nothing | There is no root test command, deliberately | Use the per-package commands. Do not add a root alias. |
| Port verification reports thousands of differences | The tree was checked out with line-ending conversion on | `git config --global core.autocrlf false`, then re-check out `design/`. Never edit the files. |
| Port verification exits `2` | Neither the submodule nor `scripts/upstream-manifest.tsv` is present — or a present submodule disagrees with the manifest | Restore the manifest, or `git submodule update --init`. On a disagreement, regenerate with `scripts/verify-port.sh --write-manifest` (which needs the submodule) |
| Ports already in use | Another stack is running | Use `--daemon-port` / `--web-port`, or `pnpm tools-dev stop`. |
| Browser tests fail immediately | Browser binaries not installed | `pnpm -C e2e exec playwright install --with-deps chromium` |
| Browser tests pass alone, fail as a suite | Test helpers imported from the framework rather than the project's suite module | Import from the project's suite module so each worker gets its own isolated stack. |
| PDF, image or slide export fails | Those formats rasterise through the desktop shell's bundled browser engine | They require the desktop runtime; a bare daemon cannot produce them. |

## Security considerations

- **Installing executes third-party code.** `pnpm install` resolves a large
  dependency tree and runs install scripts for the allowlisted packages. Run port
  verification first so you at least know the tree is the one that was reviewed.
- **The daemon binds loopback by default and should stay there.** Changing
  `OD_BIND_HOST` without also setting `OD_ALLOWED_ORIGINS` — and, for a container
  deployment, `OD_API_TOKEN` — exposes an interface whose entire purpose is
  executing local tools with your privileges.
- **Development ports are still real ports.** A pinned development port is as
  reachable as any other; pin to loopback.
- **No telemetry key is configured in this repository**, so a build produced from
  it sends nothing. Adding a key changes what shipped builds do and is a change
  that must be disclosed, not made quietly.
- **Do not edit anything under `design/` casually.** It is a verbatim copy and
  the verifier enforces that. Legitimate edits need a `MODIFICATIONS.md` entry
  naming the reason and listing the paths — see
  [../porting/verification.md](../porting/verification.md).

## Verification

**Observed on the labelled self-hosted Windows runner, not locally.** The release run performs
these, so they are known to work — on that image, at that Node and pnpm version,
from a clean checkout:

- the install, with the native database binding compiled from source (as
  `pnpm install --frozen-lockfile`, which differs from the plain `pnpm install`
  above only in refusing to update the lockfile);
- the recursive typecheck, after the daemon and desktop builds this page tells
  you to run first — for the same reason;
- the three identity-carrying suites: the packaging tools, the packaged
  launcher and the desktop shell;
- the packaging invocation, `tools-pack win build`, and `validate-payload`
  against the expected version.

**Verified from the tree:** the workspace layout; the declared Node and pnpm
constraints; the workspace-root script list including the absence of `dev`,
`start` and `test`; the install-script allowlist; and that port verification runs
and exits 0 with every rebrand change declared. See
[../porting/verification.md](../porting/verification.md) for the transcript and
what each counter means — that page holds the repository's only pasted verifier
output, so this one does not duplicate a number that would go stale.

**Transcribed from the vendored documentation, and observed nowhere:** the 18
post-install targets, the development tool's commands (`pnpm tools-dev run web`,
`inspect desktop` and the rest), the `od` entry point, the browser-driven suites,
the per-package test invocations beyond the three above, and the packaging flags
this project does not pass.

When someone runs this successfully, these are the checks worth recording:

```bash
scripts/verify-port.sh --json          # must reach 0 gaps before a release
cd design && pnpm install              # completes; native binding compiles
pnpm typecheck                         # after the three prebuilds
pnpm tools-dev status --json           # the stack reports itself
curl -sf http://127.0.0.1:7456/api/health
pnpm tools-pack win build --to squirrel # produces a Squirrel Setup.exe installer
```

Please correct this page with what actually happened, including the parts that
did not work.

## Suggested reading

- [ci.md](ci.md) — the same pipeline, on the labelled runners, with a release at the end
- [../architecture/overview.md](../architecture/overview.md) — what you are building
- [../porting/verification.md](../porting/verification.md) — the gate that runs first, and why
