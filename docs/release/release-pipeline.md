# The release pipeline

How a release is produced, end to end, from a push to a published installer.
Everything happens inside one workflow run on one dedicated self-hosted Windows
runner selected by `[self-hosted, windows, material-designer]`, because the
artifact a user downloads must be the artifact the passing run built, at the
commit it claims — and that is only enforceable when the build, the tests and the
publish are steps of the same run.

> [!IMPORTANT]
> **Status: run, and publishing.** Two legacy releases exist —
> `v0.16.1-r7.1` and `v0.16.1-r8.1` — each carrying a Windows installer built by
> the run that published it. The packaged smoke test has installed a built
> application, launched it, had the running process answer its own health
> endpoint, screenshotted it, uninstalled it and asserted zero residue. What has
> **not** been demonstrated is code signing (no certificate is evidenced here), any
> platform other than Windows, or a post-migration Squirrel feed run. Commit
> [`6daae310`](https://github.com/Ding-Ding-Projects/material-designer/commit/6daae310)
> makes the new workflow fail closed instead of publishing an unsigned artifact:
> the first CI evidence for the signed Squirrel path is still pending.

## Behaviour

### Trigger and shape

```yaml
on:
  push: { branches: [main] }
  workflow_dispatch:
    inputs: { smoke: boolean = true, publish: boolean = true }

runs-on: [self-hosted, windows, material-designer]
timeout-minutes: 120
permissions: { contents: write }
concurrency: { group: release-<ref>, cancel-in-progress: false }
```

Three of those lines are decisions rather than boilerplate:

- **`cancel-in-progress: false`.** A release run cancelled halfway can leave a tag
  without its assets — a release that looks complete and is not. Queueing is
  cheaper than that.
- **`timeout-minutes: 120`.** Generous rather than optimistic, because the install
  step compiles a native database binding from source on Windows.
- **`contents: write`.** The `Verify` workflow has `contents: read` and runs only
  on trusted pushes and manual dispatch because its runner is self-hosted. The
  gate cannot write anything, and untrusted pull requests never execute on the
  project runner.

### The build steps, in order

<details>
<summary><b>Step by step</b> — from the line-ending guard to the published release</summary>

**1 — Force a byte-exact checkout.** `core.autocrlf=false` and `core.eol=lf`, set
*before* the checkout step, because conversion happens as files are written. The
system configuration on a Windows runner enables line-ending translation by
default, and the repository's own attributes mark everything as text — so an
unguarded checkout writes a different tree from the one the provenance claim is
about. The checkout also sets `clean: true`, removing stale generated files and
`node_modules` from the persistent runner workspace. See
[../troubleshooting/line-endings.md](../troubleshooting/line-endings.md).

**2 — Checkout**, full history, **no submodule**. The build needs the imported
tree, not the provenance pin.

**3 — Verify the imported tree.** `Verify` and `Release` are separate workflows on
the same trigger, so a red `Verify` does not stop a release. The release notes
this job publishes make a claim about what the imported tree contains, so this job
checks that claim itself — before the long install, so drift fails fast. The
checkout has no submodule, so the verifier falls back to the committed manifest of
upstream object ids, which answers the same question.

**4 — Package manager, then the runtime.** `pnpm/action-setup` installs exactly
pnpm 10.33.2 with `run_install: false`, then `actions/setup-node` installs Node
24. The workflow checks both versions before continuing. The cache key is the
committed `design/pnpm-lock.yaml` and covers only the pnpm store; it is a speed
optimisation, not a `node_modules` input. The workflow explicitly does not use
the runtime's package-manager shim, which fails with a permission error on
Windows.

**5 — Read the application version and compute the tag.** Parsed from the imported
tree's manifest, failing loudly if absent. The build keeps the manifest's major and
minor version and adds the monotonic GitHub Actions run number to its patch
component, so Squirrel has a real version ordering. The tag is
`v<version>-r<run number>.<run attempt>`.

> [!NOTE]
> The **attempt** is part of the tag on purpose. A run number does not change when
> a run is re-run — only the attempt does. Without it, re-running a run that
> already published rebuilds for an hour and then dies at the publish step because
> the tag exists.

**6 — Install.** `pnpm install --frozen-lockfile`. The committed manifest and
lockfile are the dependency authority; no preinstalled package manager or cached
`node_modules` directory is trusted. The post-install step builds the workspace
packages and tools and compiles the native modules from source. It is the long
pole of the job. Concurrency is raised, which only overlaps targets that do not
depend on each other — the post-install already knows its own dependency order.

**7 — Typecheck.** The daemon and the desktop shell are built **first**, because
their declaration files must exist before the packaged application can typecheck
against them, and a fresh clone has not produced them. Then a recursive typecheck.

> [!WARNING]
> Every command in the step is gated on its own exit code. In this shell a native
> command's non-zero exit is not terminating by default, and the runner's wrapper
> propagates only the **last** exit code. Without the guards, a failed build still
> passes the step as long as the command after it succeeds. This is the single
> easiest way to write a green pipeline that tests nothing.

**8 — Test what only Windows can answer.** The identity the installer writes, the
paths it installs to, its build targets and its launcher payload — the specs whose
failure would mean a broken installer. Everything else runs on Linux in the
`Verify` workflow. That split is not a convenience: several specs assert things a
Windows filesystem cannot represent, and they fail here for reasons unrelated to
the code under test. See
[../troubleshooting/platform-specific-tests.md](../troubleshooting/platform-specific-tests.md).

**9 — Squirrel packaging.** The packer invokes electron-builder's
Squirrel.Windows target and fails closed unless the build returns `Setup.exe`,
`RELEASES`, full/delta `.nupkg` packages and the local icon asset. Signed builds
also require the configured certificate thumbprint and timestamp service.

**10 — Build and verify the installer.** Cleanup, then a packaging build with an explicit
output directory, cache directory, namespace, portable flag, application version
and machine-readable output. Then, in order:

- payload validation against the expected version;
- an **explicit existence check** on the reported installer path, failing if the
  build reported one that is not there;
- a SHA-256 computed over the installer;
- assets staged under names that mean something outside this repository:
  `Setup.exe`, its `.sha256`, `RELEASES`, full/delta `.nupkg` packages,
  `metadata.json`, the icon and the portable archive when one is produced.

The namespace and channel are literals in the workflow environment, because
upstream derives them from a metadata job wired to infrastructure this fork does
not have, and an empty namespace or version fails the packer outright.

**11 — Upload the installer as a workflow artifact**, with `always()` so a failed
smoke test still leaves something to inspect, and failing if no file was found.

**12 — Smoke test the packaged application.** Documented in full in
[packaged-smoke-test.md](packaged-smoke-test.md).

> [!NOTE]
> The step's condition tests the **event name** explicitly rather than relying on
> the input default. On a push there are no workflow inputs, and an empty input
> compares equal to false — so a naive condition would silently skip the step that
> proves the application runs, on exactly the trigger that publishes.

**13 — Reports and logs.** The smoke report always uploads; build logs upload on
failure.

**14 — Count lines.** See [line-count.md](line-count.md). The step keeps standard
error rather than discarding it, because when the counter exits non-zero it is
because one of its own self-checks tripped, and that reason belongs in the log.

**15 — Choose the code name.** See [code-names.md](code-names.md).

**16 — Publish.** A generated notes file, `--latest`, and every staged asset plus
the code name's image.

**17 — Summarise.** Version, tag, installer name, smoke-test outcome and code name
into the run summary.

</details>

### What the release notes carry

| Section | Contents |
| --- | --- |
| Title | `Material Designer <version> — <code name>` |
| Code name | The dish in English and Traditional Chinese |
| Install | The asset name, the SHA-256, Squirrel package assets, the stable metadata-feed URL and the signature-verification statement; a historical unsigned artifact is called out rather than silently treated as current |
| Verification | The smoke-test outcome as **passed**, **failed** or **not run**, read from the step's actual outcome; plus the commit and a link to the run |
| Lines of code | The counter's table, or an honest "not available for this build" |
| Provenance | The upstream project, version, pinned commit, licence, a pointer to the change notice, and a statement of non-affiliation |
| Marker | An HTML comment recording the code name's id, so the next run can tell it is spent |

**The verification line is the honest-evidence mechanism.** It is a case statement
over the smoke step's real outcome — success, failure, anything else — so a
skipped smoke test says "not run" rather than implying a pass, and a failed one
says so in the published notes. It never predicts.

## Configuration

### Inputs

| Input | Default | Effect |
| --- | --- | --- |
| `smoke` | `true` | Run the packaged smoke test. |
| `publish` | `true` | Publish a release. Turning it off is how you exercise the whole build without creating one. |

Both apply to manual dispatch only. A push runs everything.

### Environment literals

| Name | Value | Why a literal |
| --- | --- | --- |
| Packaging namespace | `release-stable-win` | Upstream derives it from infrastructure this fork does not have. An empty namespace fails the packer. |
| Release channel | `stable` | Same reason. |

### Tokens

Resolved as a repository-scoped token, then an organisation token, then the run's
own token as a last fallback. Used for reading prior releases (to find the spent
code names) and for publishing. Passed only through the environment convention the
tooling expects, and never printed.

**No new code-signing certificate is evidenced here.** An unsigned Windows installer
triggers the operating system's reputation screen, which reports an unknown
publisher and hides the proceed button behind a **More info** link. The current
workflow now requires `WIN_SIGN_CERT_SHA1` or `OD_WIN_SIGN_CERT_SHA1`, verifies the
resulting `Setup.exe` with Authenticode, and refuses publication when the certificate
is missing or does not match. Historical releases may still be unsigned, but the
new path does not publish one silently.

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| Verification fails with thousands of differing files | Line-ending conversion on checkout | The guard step exists for this. See [../troubleshooting/line-endings.md](../troubleshooting/line-endings.md). |
| Verification exits `2` | No upstream reference, or a manifest that disagrees with the submodule | Exit `2` means "did not run", not "passed". See [../porting/verification.md](../porting/verification.md). |
| Install fails compiling the database binding | Build tools missing | Present on the standard Windows image; check the image did not change. |
| A step passes despite a failed command inside it | Missing per-command exit-code guards | Every command needs its own check. This is how a pipeline goes green while testing nothing. |
| Typecheck fails in packages nobody touched | The daemon and desktop builds were skipped | They run first for exactly this reason. |
| The packer exits immediately | Empty namespace or application version | Both are set explicitly; check the version parse step. |
| The build reports an installer path that does not exist | A packaging failure that did not set a non-zero exit | The workflow checks the path explicitly and fails. Read the uploaded build logs. |
| Re-running a published run dies at the publish step | The tag already exists | The attempt number in the tag prevents this. If it recurs, the tag scheme was changed. |
| A release published with no installer | Packaging succeeded, asset upload did not | Treat as a failed release. A release without its artifact is worse than none, because it looks complete. |
| The same code name twice | The prior release's marker was missing or unreadable | See [code-names.md](code-names.md). |
| The notes say the smoke test passed when it did not | Somebody replaced the outcome read with a literal | Never do this. The line is the only published statement about whether the build runs. |

## Security considerations

- **Public runners run public code, and anything a workflow prints is public.**
  Never echo a token or a value derived from one.
- **The release artifact must be the tested artifact.** Never attach an installer
  from a different run, a local build, or a re-run that skipped the tests. The
  entire value of a one-run pipeline is that the thing tested and the thing
  published are the same bytes.
- **Verification runs before anything is installed**, in the sense that matters:
  the question "is this tree what it claims to be" is answered without executing
  any of the tree's install scripts.
- **The vendored workflow definitions must stay inert.** 48 workflow files live
  under the imported tree. Workflow definitions are read only from the repository
  root, so none of them runs. Promoting them wholesale would enable 48 unreviewed
  workflows in one commit.
- **No telemetry key is configured**, and the vendored analytics code is a no-op
  without one. Baking one in at packaging time changes what shipped builds do and
  must be disclosed, not done quietly.
- **Dedicated self-hosted runner contract.** The Windows runner must carry the
  `self-hosted`, `windows` and `material-designer` labels, be dedicated to this
  project, and contain no user data. `Release` accepts only default-branch pushes
  and manual dispatch; no untrusted pull-request trigger may execute on it.

## Verification

**Observed before the runner migration:** two releases exist, `v0.16.1-r7.1` and `v0.16.1-r8.1`, each
published by the run that built its installer. The workspace installed with native
modules compiled from source, the full typecheck passed, the Windows identity
specs passed, an installer was produced and its payload validated, and the smoke
test installed, launched, health-checked, screenshotted and uninstalled the built
application.

**Not observed:** a signed installer, any non-Windows artifact, the updater path,
the new labelled self-hosted runner contract executing a release, and —
importantly — a *failing* release run. The fail-closed signing, smoke and UI-state
guards are source-checked but have not yet produced a new labelled-runner verdict.
A gate that has only ever been seen passing is not known to be a gate.

The pipeline is fully proven when one run demonstrates all of:

- [x] port verification passing with zero gaps and its summary table rendered
- [ ] port verification **failing** on a deliberately undeclared change
- [x] install completing with the native binding compiled
- [x] typecheck and the identity suites passing
- [x] an installer produced, its reported path present, its payload validated
- [x] the smoke test installing, launching, health-checking and uninstalling
- [x] a non-draft release under a fresh tag with the installer, its checksum file
      and the code name image attached
- [x] the line-count table present in the notes
- [x] a second release picking a **different** code name
- [ ] a release whose smoke test failed, publishing notes that say so

The two unchecked boxes are the interesting ones. Both are about the pipeline
behaving correctly when something goes wrong, which is the only thing a pipeline
is actually for.

## Suggested reading

- [packaged-smoke-test.md](packaged-smoke-test.md) — what the test in step 12 actually proves, assertion by assertion
- [line-count.md](line-count.md) — how the published figure is produced, and what its scopes mean
- [code-names.md](code-names.md) — how a dish is chosen and why it is spent exactly once
- [release-assets.md](release-assets.md) — what each attached file is, and what is deliberately absent
- [../build/ci.md](../build/ci.md) — the workflows as a set, including the fast gate this one deliberately does not depend on
- [../troubleshooting/README.md](../troubleshooting/README.md) — the failures this pipeline actually hit on the way to working
