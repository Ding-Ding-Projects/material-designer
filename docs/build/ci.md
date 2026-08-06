# Building in continuous integration

Three workflows live at the repository root: **`Verify`**, a cheap gate that runs
on trusted pushes and manual dispatch; **`Release`**, which builds the Windows
application and publishes it; and **`Pages`**, which deploys `site/` and enforces
the bundled-assets rule at publish time. All three select a labelled self-hosted
runner, with Linux and Windows kept as separate contracts. `Pages` is documented in full under
[../site/](../site/) — this page covers the two build workflows and summarises
where `Pages` fits.

> [!IMPORTANT]
> **All three workflows have run.** `Verify` has passed on a clean checkout with
> zero gaps; `Release` has installed the workspace with native modules compiled
> from source, typechecked it, run the Windows identity suites, built an
> installer, validated its payload, put it through the packaged smoke test and
> published it; `Pages` has deployed the site. Two releases exist,
> `v0.16.1-r7.1` and `v0.16.1-r8.1`.
>
> **What has not been observed is any of them failing.** No run has been seen
> rejecting a bad tree, and a gate that has only ever been watched passing is not
> known to be a gate. The unticked boxes under [Verification](#verification) are
> exactly those cases.
>
> Where this page describes what a workflow does, it is describing the committed
> definition; where it states a result, it says so.
>
> The 48 workflow files under `design/.github/workflows/` are the vendored
> upstream project's. Workflow definitions are only read from the repository
> root, so all 48 remain inert.

### Latest observed execution

Release run [`31127492852`](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31127492852)
for `main` at `2cae835a1a9b6b86352b0c3b083ff1a35c061ebc` completed with **failure** in
`Build Windows application → Install dependencies`. The frozen install resolved the
workspace and then the post-install packer typecheck reported
`src/win/lifecycle.ts(473,95): error TS2345`: `"uninstall-legacy"` was not assignable
to `invokeNsis`'s `"install" | "uninstall"` action type. Commit
[`5d66600`](https://github.com/Ding-Ding-Projects/material-designer/commit/5d66600)
passes the supported `"uninstall"` action while retaining the separate
`runTimed` legacy timing label. A new labelled-runner execution is still required;
this page does not call the fix green before that run exists.

## Behaviour

### Why builds happen here and not on a developer's machine

**The install is heavy and the environment is fragile.** A cold install resolves
a large workspace, runs a chain of workspace builds, and on Windows compiles a
native SQLite binding from source because no prebuilt binary exists for that
platform and runtime pair. The release workflow's own comment calls that step
"the long pole of this job". The dedicated runner contract absorbs that cost;
each job cleans its checkout and installs the pinned toolchain before resolving
the workspace from its committed lockfile.

**A build should be a fact about the code.** The runner labels select dedicated
machines with the required platform and project contract. Checkout cleanup plus
the setup actions for Node 24 and pnpm 10.33.2 prevent a prior job's workspace or
preinstalled package manager from becoming an invisible input.

**Release artifacts should be produced by the thing that tested them.** The
installer a user downloads must be the artifact the passing run built, at the
commit it claims. That is only enforceable when the build, the tests and the
publish are steps of one run.

### Self-hosted tool bootstrap

The labelled runners are deliberately not treated as snowflakes. Each job
checks out cleanly and runs the committed bootstrap for the small set of
non-language tools the workflows call:

- Linux runs `scripts/bootstrap-ci-tools.sh`. It reuses only a cache entry whose
  `gh` and `jq` versions match the pinned releases; otherwise it downloads the
  official binaries into the runner's user-scoped tool cache, verifies their
  pinned SHA-256 package hashes, serializes cache updates, and adds that
  directory through `GITHUB_PATH`. It then verifies Bash, Git, `gh`, `jq` and
  every standard utility used by the workflows.
- Windows runs `scripts/bootstrap-ci-tools.ps1`. It validates cached `gh`, `jq`
  and `7z` versions under a Windows file lock, verifies pinned SHA-256 package
  hashes, installs the official binaries when a cache entry is absent or wrong,
  adds the directory to `PATH`, and fails before packaging if any tool or
  version is still wrong.

The workspace dependency step remains separate and authoritative: `pnpm`
10.33.2 resolves `design/pnpm-lock.yaml` with `pnpm install --frozen-lockfile`.
The bootstrap does not commit binaries, alter machine-wide settings, or treat a
cached `node_modules` directory as an installation.

The SHA-256 checks authenticate packages at download time. The persistent
runner cache is user-scoped runner state, not a cryptographic trust boundary:
cached executables are selected by their pinned version output and are safe only
when the runner account and cache are trusted. A runner whose cache is not
trusted must be reprovisioned or have this tool cache removed before use.

## `Verify` — the fast gate

```yaml
on: [push, workflow_dispatch]
runs-on: [self-hosted, linux, material-designer]
permissions: contents: read
```

It runs on trusted pushes and manual dispatch, so it stays cheap: **no dependency
install, no build.** It
answers one question — is `design/` still an exact copy of the upstream tree,
with every intentional difference declared?

The public repository deliberately has no `pull_request` trigger here: untrusted
pull-request code must not execute on a self-hosted runner.

### What it does

| Step | Purpose |
| --- | --- |
| Checkout | `fetch-depth: 0`, **no submodule**, and `clean: true` — see below. |
| Bootstrap | Validate or install the pinned user-scoped Linux utility set under a cache lock. |
| Verify | `bash scripts/verify-port.sh`. A non-zero exit fails the job. |
| Report | Re-runs with `--json` and writes a summary table of every counter. Runs with `always()`, so a failing verification still gets its table. |
| Set up Node | The setup action installs Node 24; the workflow checks the resolved major version. |
| Count lines | `node scripts/line-count.mjs` appended to the run summary. Skips gracefully if the script is absent. |

### Why it checks out without the submodule

The submodule's object store is roughly 1.7 GB, and cloning it on every push to
answer a question about file hashes is a poor trade. Instead the verifier falls
back to `scripts/upstream-manifest.tsv`, a committed table of upstream blob ids.

The shortcut cannot drift, because **when the submodule *is* present the script
cross-checks the manifest against it** and refuses to run if they disagree. A
local run with the submodule proves the manifest; continuous integration then
trusts the proven manifest. Both self-tests for that guard are recorded in
[../porting/verification.md](../porting/verification.md).

Running on Linux also avoids the line-ending trap described there — no
conversion happens, so no spurious byte differences appear.

### Reading its result

The summary table names every counter. The number that matters is **gaps**;
`declared` moves as rebranding work lands and is not itself a problem.

## `Release` — build and publish

```yaml
on:
  push: branches: [main]
  workflow_dispatch:
    inputs: { smoke: boolean = true, publish: boolean = true }
runs-on: [self-hosted, windows, material-designer]
timeout-minutes: 120
permissions: contents: write
concurrency: release-<ref>, cancel-in-progress: false
```

The build steps deliberately mirror the recipe upstream uses for its own Windows
releases — same package-manager setup and same electron-builder invocation — while
the target is Squirrel.Windows. What is stripped out is everything specific to
upstream's infrastructure: its release storage, its signing identity and a build
flag requiring a package this fork cannot resolve. This repository supplies its
own stable `metadata.json` feed beside the Squirrel assets.

`cancel-in-progress: false` matters: a release run that is cancelled halfway can
leave a tag without its assets.

<details>
<summary><b>Step by step</b> — checkout through publish</summary>

**1 — Checkout and bootstrap.** `fetch-depth: 0`, no submodule and `clean: true`.
The Windows bootstrap validates or installs pinned `gh`, `jq` and `7z` into the
locked user-scoped runner cache before any packaging or release command uses them. The build
needs `design/`, not the provenance pin, and a clean checkout prevents stale
`node_modules` or generated files on the persistent runner from becoming inputs.

**2 — Package manager, then Node.** `pnpm/action-setup` installs pnpm 10.33.2
with `run_install: false`, then `actions/setup-node` installs Node 24. The cache
key is `design/pnpm-lock.yaml` and contains only the pnpm store; it is a
performance optimisation, not a `node_modules` dependency. A version-check step
fails if either tool is not the requested version. The workflow notes explicitly
that the Node package-manager shim is not used, because it fails with a
permission error on Windows.

**3 — Read the application version.** Parsed from `design/package.json`, failing
loudly if absent. The release build keeps the manifest's major and minor version,
adds the monotonic GitHub Actions run number to its patch component, and tags the
result as `v<version>-r<run number>.<run attempt>`. The app version therefore
advances for each new run, which gives the updater a real ordering to compare.

**4 — Install.** `pnpm install --frozen-lockfile`. The post-install step builds
the workspace packages and tools and compiles the native modules from source.
The manifest and lockfile are the dependency authority; no preinstalled pnpm or
cached `node_modules` directory is trusted.

**5 — Typecheck.** The daemon and desktop are built first, because their
declaration files must exist before the packaged application can typecheck
against them — a fresh clone has not produced them. Then a recursive typecheck at
concurrency 4.

**6 — Test the packages that carry product identity.** The packaging tools, the
packaged launcher, and the desktop shell. The workflow's comment states the
reason precisely: the rebrand changed what these suites assert, and if the
identity logic and its four independent copies ever disagree again, this is where
it surfaces — before an installer is built, not after a user runs one.

**7 — Squirrel packaging.** The packaging tool invokes electron-builder's
Squirrel.Windows target. The build is expected to produce `Setup.exe`,
`RELEASES`, full/delta `.nupkg` packages and the local icon asset; the release
step fails closed if any required Squirrel output is missing.

**8 — Build the installer.** Cleanup, then `tools-pack win build` with an
explicit output directory, cache directory, namespace, `--portable`, the app
version, `--to all` and `--json`. Then:

- `tools-pack win validate-payload` against the expected version;
- an explicit existence check on the reported Squirrel `Setup.exe`, failing if
  the build reported one that is not there;
- a SHA-256 computed over the installer;
- assets staged under names that mean something outside this repository —
  `material-designer-<version>-win-x64-setup.exe`, a matching `.sha256` file,
  `RELEASES`, full/delta `.nupkg` packages, `metadata.json`, the icon and the
  portable archive when one was produced.

The namespace and channel are literals in the workflow environment, because
upstream derives them from a metadata job wired to infrastructure this fork does
not have, and an empty namespace or version fails the packer outright.

**9 — Upload the installer as a workflow artifact.** With `always()`, so a failed
smoke test still leaves something to inspect, and `if-no-files-found: error`.

**10 — Smoke test the packaged application.** Installs the built Squirrel
application, launches it, proves the running process answers its own health
endpoint, then uninstalls and checks nothing was left behind. That is the `core`
profile. The `full` profile additionally exercises the auto-updater, but requires
a separately-built update fixture and is not silently claimed by the release
workflow.

The condition is worth noting as a correctness detail: on a push there are no
workflow inputs, and an empty input compares equal to false, so the step tests
the event name explicitly rather than letting a default silently skip the step
that proves the application runs.

**11 — Reports and logs.** The smoke report always uploads; build logs upload on
failure.

**12 — Count lines.** `node scripts/line-count.mjs` into a file, with an honest
fallback line if it fails, so the release notes never carry a fabricated number.

**13 — Choose the code name.** `scripts/release-codename.sh`, given the dishes
already spent. Those are read out of the **existing releases** — each release
body carries a `dim-sum-id` marker — rather than from a counter that a re-run
would repeat.

**14 — Publish.** `gh release create` with a generated notes file, `--latest`,
and every staged asset plus the code name's image.

</details>

### What the release notes carry

| Section | Contents |
| --- | --- |
| Title | `Material Designer <version> — <code name>` |
| Code name | The dish in English and Traditional Chinese |
| Install | The asset name and the SHA-256, plus an explicit SmartScreen warning |
| Verification | The smoke-test outcome as **passed**, **failed** or **not run** — read from the step's actual outcome, never predicted — and a link to the run |
| Lines of code | The counter's table, or an honest "not available for this build" |
| Provenance | The upstream project, version, pinned commit, licence, a pointer to `MODIFICATIONS.md`, and a statement of non-affiliation |
| Marker | An HTML comment recording the code name's id, so the next run can tell it is spent |

The smoke-test line is the honest-evidence mechanism: it reports what the step
actually did rather than assuming success, and a skipped smoke test says "not
run" instead of implying a pass.

## `Pages` — static deploy

`Pages` uses `[self-hosted, linux, material-designer]` and keeps its existing
trusted push/manual triggers. It has no `package.json`, lockfile or build step:
the workflow checks out with `clean: true`, bootstraps the required static-site
publishing tools (`gh`, `jq`, Bash and the standard text utilities), stages the
local catalogue, fills release facts, and uploads `site/`. It therefore does not
invent a Node/pnpm install for a project that declares no such dependency.

## Configuration

### Triggers

| Workflow | Triggers |
| --- | --- |
| `Verify` | every push and manual dispatch; no pull-request trigger on the self-hosted runner |
| `Release` | pushes to the default branch, manual dispatch |
| `Pages` | pushes to the default branch that touch `site/**` or the workflow itself, manual dispatch — see [../site/](../site/) |

Manual dispatch of `Release` takes two inputs, both defaulting to true: whether
to run the smoke test, and whether to publish. Turning publish off is how you
exercise the build without creating a release.

### Secrets and tokens

| Name | Purpose | Status |
| --- | --- | --- |
| Release token | Publishing releases and reading prior ones for the code name | Resolved as a repository-scoped token, then an organisation token, then the run's own token as the last fallback |
| Code-signing certificate | Signing the installer | **Not configured.** See below. |
| Telemetry key | Analytics destination | **Not configured, and must not be added silently.** |

Tokens are passed only through the environment convention the tooling expects,
and never printed.

### Unsigned installers

No code-signing certificate is configured. An unsigned Windows installer triggers
the operating system's reputation screen, which reports an unknown publisher and
hides the proceed button behind a **More info** link.

The release notes state this explicitly, which is the right place for it: a user
who expects it will click through, and a user who does not will reasonably assume
the download is malicious.

### Runner selection

The root workflows use an explicit self-hosted contract:

| Workflow/job | Runner labels | Trusted events |
| --- | --- | --- |
| `Verify` / `verify` | `[self-hosted, linux, material-designer]` | Push and manual dispatch; no `pull_request` trigger because the repository is public. |
| `Verify` / `test` | `[self-hosted, linux, material-designer]` | The same trusted workflow events. |
| `Release` / `build` | `[self-hosted, windows, material-designer]` | Default-branch push and manual dispatch. |
| `Pages` / `deploy` | `[self-hosted, linux, material-designer]` | Site/default-branch push and manual dispatch. |

The runner administrator must provide the Actions runner service, Git, Bash and
the platform tools used by the matching workflow. The workflow itself installs
Node 24 and pnpm 10.33.2 for dependency jobs, checks their versions, cleans the
checkout, and runs `pnpm install --frozen-lockfile` from
`design/pnpm-lock.yaml`. `Pages` has no package manifest or build step, so it
performs an explicit check for its static publishing tools instead of inventing
a dependency install.

Self-hosted machines must be dedicated to this project, contain no user data,
and be treated as trusted infrastructure. Do not add a `pull_request` trigger or
run untrusted checkout content on them.

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| Verification fails with thousands of `bytes-differ` | Line-ending conversion on checkout | Only possible on a Windows runner. Set `core.autocrlf=false` **before** checkout, or keep verification on Linux as it is now. |
| Verification exits `2` — "no upstream reference available" | Neither submodule nor manifest present | Restore `scripts/upstream-manifest.tsv`, or check out the submodule. Exit `2` is "did not run", not "passed". |
| Verification exits `2` — manifest disagrees with the submodule | The pin moved without regenerating the manifest | `scripts/verify-port.sh --write-manifest` |
| Install fails compiling the database binding | C++ build tools or Python missing | Restore those prerequisites on the labelled Windows runner; the workflow's pinned Node/pnpm setup does not replace native build tools. |
| Toolchain check fails | The runner resolved a Node or pnpm version outside the contract | Inspect the setup-action output; the job must use Node 24 and pnpm 10.33.2 before the frozen-lockfile install. |
| Typecheck fails in packages that were not touched | The daemon and desktop builds were skipped | They run first for exactly this reason. |
| The packer exits immediately | An empty `--namespace` or `--app-version` | Both are set explicitly for this reason; check the version parse step. |
| The build reports an installer path that does not exist | A packaging failure that did not set a non-zero exit | The workflow checks the path explicitly and fails. Read the uploaded build logs. |
| Smoke test fails | The built application does not install, launch, answer its health check, or uninstall cleanly | A real defect in the artifact. The installer still uploads as an artifact for inspection. |
| A release published with no installer | Packaging succeeded, asset upload did not | Treat as a failed release. A release without its artifact is worse than none, because it looks complete. |
| The same code name twice | The prior release's `dim-sum-id` marker was missing or unreadable | The marker is what makes the pick idempotent across re-runs. |
| No code name chosen | Every dish spent, or no catalogue | The script exits `0` with an empty id and the release ships with its version alone. A code name never blocks a release. |

## Security considerations

- **The vendored workflows must stay inert.** Promoting
  `design/.github/workflows/` to the root would enable 48 unreviewed workflow
  definitions in one commit.
- **`Release` has `contents: write`; `Verify` has `contents: read`.** That split
  is deliberate — the gate that runs on pull requests cannot write anything.
- **Public runners run public code.** Anything a workflow prints is public. Never
  echo a token or a value derived from one.
- **Verification runs before anything is installed** in the sense that matters:
  it is a separate, cheaper workflow with no install step at all, so the question
  "is this tree what it claims to be" is answered without executing any of the
  tree's install scripts.
- **No telemetry key is configured.** The vendored analytics code is a no-op
  without destination credentials. Baking one in at packaging time would change
  what shipped builds do and must be disclosed, not done quietly.
- **The release artifact must be the tested artifact.** Never attach an installer
  from a different run, a local build, or a re-run that skipped the tests.

## Verification

**Observed from runs.** `Verify` has passed on a clean checkout at zero gaps and
rendered its summary table. `Release` has installed the workspace — with the
native database binding compiled from source — typechecked it, passed the three
Windows identity suites, produced an installer whose reported path existed and
whose payload validated, put that installer through the packaged smoke test
(install, launch, health check, screenshot, uninstall, zero residue) and
published two non-draft releases under fresh tags, each carrying its installer,
its checksum file and its code name's photograph, and each picking a *different*
dish. `Pages` has deployed the site. The per-step detail is in
[../release/release-pipeline.md](../release/release-pipeline.md#verification),
which is the authority on release runs; this page does not restate its numbers.

**Verified from the tree:** that all three workflow files exist at
`.github/workflows/`; that `scripts/verify-port.sh`, `scripts/line-count.mjs`,
`scripts/release-codename.sh` and `scripts/import-dim-sum.sh` exist; that
`scripts/upstream-manifest.tsv` records 11,799 entries at the pinned commit; and
that the dim sum catalogue indexes 24 dishes with 24 images present.

The verifier's own result is deliberately **not** quoted here — it moves with
every rebrand commit, and six copies of a moving number guarantee five wrong ones.
The invariant is `gaps == 0`; see
[../porting/verification.md](../porting/verification.md#reading-a-run) for the one
annotated transcript, and the `Verify` job summary for the value at any push.

What the published runs have demonstrated:

- [x] `Verify` passing with `gaps: 0` and its summary table rendered
- [x] install completing with the native binding compiled
- [x] typecheck and the three identity suites passing
- [x] an installer produced, its reported path present, its payload validated
- [x] the smoke test installing, launching, health-checking and uninstalling
- [x] a non-draft release under a fresh `v<version>-r<run>` tag with the
      installer, its checksum file and the code name image attached
- [x] the line-count table present in the notes
- [x] a second release picking a **different** code name

What no run has demonstrated:

- [ ] `Verify` failing on a deliberately undeclared change to `design/`
- [ ] a release whose smoke test failed, publishing notes that say so

The failing case matters as much as the passing one. A gate that has never been
observed rejecting anything is not known to be a gate — and both remaining boxes
are about the pipeline behaving correctly when something goes wrong, which is the
only thing a pipeline is actually for.

## Suggested reading

- [from-source.md](from-source.md) — the same commands, run locally
- [../porting/verification.md](../porting/verification.md) — what the fast gate checks, and its manifest shortcut
- [../standards/releases.md](../standards/releases.md) — what a release must carry
- [../site/pages-deployment.md](../site/pages-deployment.md) — the third workflow, and the self-contained-assets gate it enforces
