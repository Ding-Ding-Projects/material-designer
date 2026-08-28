# Building in continuous integration

> [!IMPORTANT]
> **2026-08-11 release-shutdown status.** The committed workflows are being repaired to
> use hosted `windows-2022` execution for the active desktop scope. Actions no
> longer runs tests, lint, typecheck, static analysis or screenshot checks; those
> remain local/manual evidence and are never release conditions. The exact-SHA
> runs [`31379243564`](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31379243564)
> and [`31379243614`](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31379243614)
> for the older `887d5a06` workflow definition are queued, so no green result is
> claimed for the local candidate `0d6e47c7`. The historical
> self-hosted/Linux descriptions below are retained as history and must not be
> read as the current runner contract.

Three workflows live at the repository root: **`Verify`**, a provenance report;
**`Release`**, which builds and publishes the Windows application; and **`Pages`**,
which deploys `site/`. The active jobs use the pinned hosted `windows-2022`
image. No workflow runs tests, lint, typecheck, static analysis or screenshot
checks, and none of those local/manual results can hold back publication.
`Pages` is documented in full under [../site/](../site/) — this page covers the
two build workflows and summarises where `Pages` fits.

> [!IMPORTANT]
> **The current Release run is not green.** Run
> [`31186802259`](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31186802259)
> at `f6549861` passed the labelled self-hosted Windows toolchain, portable Python
> bootstrap, frozen dependency installation, Typecheck, Windows identity tests,
> Squirrel.Windows packaging, Authenticode `NotSigned`, self-contained scanning
> and installer artifact upload. The packaged smoke then timed out after
> `720000ms` before UI capture; `ui-states.json` was absent and release publication
> was skipped. The latest verified published release remains `v0.16.1-r71.1`.
>
> **The failure proves the publication gate, not the packaged application.** A
> later run must complete install/start/inspect/uninstall and UI-state capture.
> Main Verify `31186802470` remains queued and has no verdict.
>
> Where this page describes what a workflow does, it is describing the committed
> definition; where it states a result, it says so.
>
> The 48 workflow files under `design/.github/workflows/` are the vendored
> upstream project's. Workflow definitions are only read from the repository
> root, so all 48 remain inert.

### Latest observed execution

Release run [`31186802259`](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31186802259)
for `main` at `f6549861f4cbf8783e4dd73765145d60b74db73d` completed with **failure**
in `Build Windows application → Smoke test the packaged application`. Typecheck,
Windows identity/installer tests, Squirrel packaging, the explicit `NotSigned`
assertion, self-contained scanning and installer artifact upload passed. The
smoke timed out after `720000ms` at `design/e2e/specs/win.spec.ts:542:3`, before
it persisted lifecycle timing or UI-state evidence. `ui-states.json` was absent,
code-name selection and publication were skipped, and no release points at that
commit. The retained workflow installer is diagnostic evidence, not a published
release.

## Behaviour

### Why builds happen here and not on a developer's machine

**The install is heavy and the environment is fragile.** A cold install resolves
a large workspace, runs a chain of workspace builds, and on Windows compiles a
native SQLite binding from source because no prebuilt binary exists for that
platform and runtime pair. The release workflow's own comment calls that step
"the long pole of this job". The dedicated runner contract absorbs that cost;
each job cleans its checkout and installs the pinned toolchain before resolving
the workspace from its committed lockfile.

**A build should be a fact about the code.** The pinned hosted image supplies the
required platform while the workflow bootstraps Node 24, pnpm 10.33.2, Python
3.12 and the native compiler. Checkout cleanup plus the setup actions prevent a
prior job's workspace or preinstalled package manager from becoming an invisible
input.

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
- Windows runs `scripts/bootstrap-ci-tools.ps1`. It validates the pinned package
  hashes under a Windows file lock and re-materializes cached `gh` and `7z` from
  their verified archive/installer on every bootstrap, so a modified executable
  cannot survive merely by reporting the expected version. It adds the directory
  to `PATH` and fails before packaging if any tool or version is still wrong.

The Windows release workflow selects the runner's Git-for-Windows Bash executable
explicitly for the few steps that invoke the repository's Bash scripts. Bare
`shell: bash` is not equivalent on every self-hosted machine: on this runner it
resolved to the WSL launcher, which failed before checkout because no Linux
distribution was installed. Installing or relying on WSL is not part of the
release contract; the workflow uses the already-installed Git-for-Windows route.

The explicit Windows shell uses the installation's space-free short path. A
quoted path containing spaces was a second dead end: the runner joined it to a
PATH shim before starting Bash and failed before checkout. Keeping the
Git-for-Windows executable explicit while removing the spaces avoids that
command-line ambiguity without introducing WSL as a dependency.

The labelled Windows image exposes powershell.exe but not pwsh. The workflow
therefore invokes Windows PowerShell directly, and the utility bootstrap avoids
PowerShell 7-only syntax so a clean runner can execute the cache-miss path with
the shell it actually provides.

The shell template also carries the per-process execution-policy bypass. Setting
Bypass only inside a step is too late when Windows PowerShell blocks the
generated step while loading it; the bypass must wrap the loader itself and must
not change the user's persistent execution policy.

The Python runtime follows the same boundary. The release does not call the
policy-blocked setup-python action; scripts/bootstrap-python.ps1 downloads the
official Python 3.12.10 `python-3.12.10-embed-amd64.zip`, verifies SHA-256,
extracts it into the user-scoped runner cache, and adds the verified interpreter
directory to GITHUB_PATH. The embeddable archive needs no registry operation,
installer process or downloaded setup script. Release run 31154756724 proved
that the prior installer bundle returned `-2147024891` (`0x80070005`, access
denied) for the self-hosted service account; the next run must prove this
portable path on the labelled runner.

The workspace dependency step remains separate and authoritative: `pnpm`
10.33.2 resolves `design/pnpm-lock.yaml` with `pnpm install --frozen-lockfile`.
The bootstrap does not commit binaries, alter machine-wide settings, or treat a
cached `node_modules` directory as an installation.

The complete per-job inventory and cache-miss recipe is maintained in
[self-hosted-dependencies.md](self-hosted-dependencies.md). The Windows release
job also bootstraps Python 3.12 and the x64 MSVC/Windows SDK toolchain because
the locked native dependency compiles from source; neither is assumed to exist
on the labelled runner.

The SHA-256 checks authenticate packages at download time. The persistent
runner cache is user-scoped runner state, not a cryptographic trust boundary;
the bootstrap therefore rebuilds the executable from the verified package rather
than trusting a cached binary. A runner whose cache or account is not trusted
must still be reprovisioned before use.

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
| Set up runtimes | The setup actions install Node 24 and Python 3.12; the workflow checks both versions. |
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

**2 — Package manager, runtimes and native compiler.** `pnpm/action-setup`
installs pnpm 10.33.2 with `run_install: false`, then `actions/setup-node`
installs Node 24 and `actions/setup-python` installs Python 3.12. The
`ilammy/msvc-dev-cmd` action exposes the x64 MSVC/Windows SDK toolchain for the
native database build. The cache
key is `design/pnpm-lock.yaml` and contains only the pnpm store; it is a
performance optimisation, not a `node_modules` dependency. A version-check step
fails if the requested Node, pnpm or Python version is not present. The workflow notes explicitly
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
step fails closed if any required Squirrel output is missing. Code signing is
permanently prohibited; the workflow clears signing inputs and discovery before
packaging, and the next step must verify that Authenticode reports `NotSigned`.

**8 — Build the installer.** Cleanup, then `tools-pack win build` with an
explicit output directory, cache directory, namespace, the app version,
`--to squirrel` and `--json`. Then:

- `tools-pack win validate-payload` against the expected version;
- an explicit existence check on the reported Squirrel `Setup.exe`, failing if
  the build reported one that is not there;
- a SHA-256 computed over the installer;
- an independent signer-process observation and version-1 provenance record;
- exact validation of the `RELEASES` rows and every staged NuGet package;
- assets staged under names that mean something outside this repository —
  `material-designer-<version>-win-x64-setup.exe`, a matching `.sha256` file,
  `RELEASES`, full/delta `.nupkg` packages, `metadata.json`, the icon,
  provenance and an artifact receipt. No portable archive is published.

The workflow then verifies `Setup.exe` with `Get-AuthenticodeSignature` and
requires the exact status `NotSigned`. Any unexpected signature fails the
release rather than silently changing the policy.
Publication also requires the packaged smoke step to succeed and the packaged
UI-state report to exist without duplicate frames.

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

**13: Choose the code name and image.** `scripts/release-codename.sh` reads
every existing release body, skips each exact `dim-sum-id` marker, and selects
only a dish whose image is present on a published `catalog-v1*` release. The
next Chut downloads, decodes, sizes, hashes, and stages that exact public PNG.
Missing `image` or `image_dish` output blocks publication.

**14 — Publish.** `gh release create` with a generated notes file, `--latest`,
and every staged asset plus the code name's image.

</details>

### What the release notes carry

| Section | Contents |
| --- | --- |
| Title | `Material Designer <version> — <code name>` |
| Code name | The dish in English and Traditional Chinese |
| Install | The asset name and the SHA-256, plus the explicit `NotSigned` status and unknown-publisher warning |
| Verification | The smoke-test outcome as **passed**, **failed** or **not run** — read from the step's actual outcome, never predicted — and a link to the run |
| Lines of code | The counter's table, or an honest "not available for this build" |
| Provenance | The upstream project, version, pinned commit, licence, a pointer to `MODIFICATIONS.md`, and a statement of non-affiliation |
| Marker | HTML comments recording the release version, tag, commit, dish id, image asset, and image SHA-256 |

The smoke-test line is the honest-evidence mechanism: it reports what the step
actually did rather than assuming success, and a skipped smoke test says "not
run" instead of implying a pass.

## `Pages` — static deploy

`Pages` uses the pinned hosted `windows-2022` image and trusted push/manual
triggers. It has no `package.json`, lockfile or build step: the workflow checks
out with `clean: true`, bootstraps the required static-site publishing tools
(`gh`, `jq`, Bash and the standard text utilities), waits for a successful
`Release` run for the exact checkout SHA, resolves exactly one matching published
release, verifies its installer, catalog image, timing, line count and asset set,
then updates and uploads `site/`. It therefore does not invent a Node/pnpm
install for a project that declares no such dependency, and it never falls back
to stale checked-in release facts.

## Configuration

### Triggers

| Workflow | Triggers |
| --- | --- |
| `Verify` | every push and manual dispatch; no pull-request trigger on the self-hosted runner |
| `Release` | every push and manual dispatch |
| `Pages` | every push and manual dispatch, with release freshness resolved for the exact checkout SHA, see [../site/](../site/) |

Manual dispatch of `Release` takes two inputs, both defaulting to true: whether
to run the smoke test, and whether to publish. Turning publish off is how you
exercise the build without creating a release.

### Secrets and tokens

| Name | Purpose | Status |
| --- | --- | --- |
| Release token | Publishing releases and reading prior ones for the code name | Resolved as a repository-scoped token, then an organisation token, then the run's own token as the last fallback |
| Code-signing certificate | Signing the installer | **Prohibited and unused.** No certificate, private key, timestamp credential or signer service may enter the build. |
| Telemetry key | Analytics destination | **Not configured, and must not be added silently.** |

Tokens are passed only through the environment convention the tooling expects,
and never printed.

### Unsigned installers

Code signing is permanently prohibited. Every Windows release is intentionally
unsigned, so the operating system may show an unknown-publisher reputation
screen and place the proceed button behind **More info**. The workflow clears
certificate, timestamp and signer-discovery inputs, sets the packaging controls
to false, and verifies `Setup.exe` with `Get-AuthenticodeSignature`; publication
continues only when the exact status is `NotSigned`.

Automatic updates still use HTTPS feed metadata, package hashes and rollback
checks. Those controls protect transport and corruption boundaries; they do not
claim publisher authenticity or replace a code signature.

### Runner selection

The root workflows use the pinned hosted `windows-2022` image. Local structural
inspection remains separate from hosted workflow evidence. On this host, the
local actionlint/shellcheck pipe has a recorded hang, so any structural pass must
use the documented `actionlint -shellcheck=` form and must not be described as a
shell-content verdict.

The root workflows use an explicit self-hosted contract:

| Workflow/job | Runner labels | Trusted events |
| --- | --- | --- |
| `Verify` / `provenance` | `windows-2022` | Every push and manual dispatch. |
| `Release` / `build` | `windows-2022` | Every push and manual dispatch. |
| `Pages` / `deploy` | `windows-2022` | Every push and manual dispatch, after current-release resolution. |

The hosted image supplies the runner service, Git, Bash and the platform tools
used by the matching workflow. The workflow itself installs Node 24 and pnpm
10.33.2 for dependency jobs, checks their versions, cleans the checkout, and runs
`pnpm install --frozen-lockfile` from `design/pnpm-lock.yaml`. `Pages` has no
package manifest or build step, so it performs an explicit check for its static
publishing tools instead of inventing
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
| The same code name twice | The prior release's `dim-sum-id` marker was missing, malformed, or unreadable | The release workflow reads every prior body and refuses duplicate publication when the exact tag already exists. |
| No code name chosen | Every dish with a published image is spent, or the public catalog is unavailable | The selector exits `0` with `source=unavailable`; the version remains authoritative, but the required image Chut blocks publication. |
| Required image missing | The selected public asset is absent, empty, not PNG, undecodable, or has a different size/hash | Publication stops before `gh release create`, with the run preserving its diagnostics. |
| Pages shows stale release facts | Pages ran before a matching successful Release or accepted a different commit | Pages waits for the exact SHA, resolves exactly one published release, and rejects stale markers before upload. |

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
