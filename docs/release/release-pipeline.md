# The release pipeline

> [!IMPORTANT]
> **Release-shutdown boundary — 2026-08-11.** The release definition is being reduced
> to hosted `windows-2022` packaging, unsigned Squirrel artifact collection and
> publication evidence. Actions must not run tests, lint, typecheck, static
> analysis or screenshot gates, and none of those results may hold back a
> release. Any successful publication still has to be exactly one unique,
> non-draft release targeted at the workflow SHA, with timing, hashes, required
> Squirrel files and post-publication verification. The dim-sum rule is currently
> contradictory (attach a downloadable photo versus never copying catalogue
> photos); the workflow must stop and record that blocker until a policy decision
> resolves it.

How a release is produced, end to end, from a push to a published installer.
Everything happens inside one workflow run on the pinned hosted `windows-2022`
image, because the artifact a user downloads must be the artifact that run built,
at the commit it claims. Tests, lint, typecheck, static analysis and screenshot
checks are local/manual evidence and are not workflow steps or publication gates.

> [!IMPORTANT]
> **Status: run, and publishing.** Two legacy releases exist —
> `v0.16.1-r7.1` and `v0.16.1-r8.1` — each carrying a Windows installer built by
> the run that published it. The packaged smoke test has installed a built
> application, launched it, had the running process answer its own health
> endpoint, screenshotted it, uninstalled it and asserted zero residue. Code
> signing is permanently prohibited: the new workflow clears signer inputs and
> requires `NotSigned` before publication. What has **not** been demonstrated is
> any platform other than Windows or a post-migration Squirrel feed run. Commit
> [`6daae310`](https://github.com/Ding-Ding-Projects/material-designer/commit/6daae310)
> makes the new workflow fail closed unless the artifact remains intentionally
> unsigned; the first CI evidence for that path is still pending.

## Behaviour

### Trigger and shape

```yaml
on:
  push:
  workflow_dispatch:

runs-on: windows-2022
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
- **`contents: write`.** The release job alone can publish; `Verify` is
  provenance-only and has read access. There is no pull-request trigger on the
  hosted delivery path.

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

**7 — Build packaging prerequisites.** The daemon, desktop shell and web sidecar
are built before packaging. Typecheck is deliberately not an Actions step under
the current workflow contract; run it locally when a code change needs it.

> [!WARNING]
> Every command in the step is gated on its own exit code. In this shell a native
> command's non-zero exit is not terminating by default, and the runner's wrapper
> propagates only the **last** exit code. Without the guards, a failed build still
> passes the step as long as the command after it succeeds. This is the single
> easiest way to write a green pipeline that tests nothing.

**8 — Package only.** Installer identity and runtime tests remain committed local
checks, but Actions does not run them and they never gate publication.

**9 — Squirrel packaging.** The packer invokes electron-builder's
Squirrel.Windows target and fails closed unless the build returns `Setup.exe`,
`RELEASES`, full/delta `.nupkg` packages and the local icon asset. Code signing
is prohibited; the workflow clears signer inputs and keeps electron-builder's
signing controls false.

**10 — Build and verify the installer.** Cleanup, then a Squirrel-only packaging build
with an explicit output directory, cache directory, namespace, application version
and machine-readable output. Then, in order:

- payload validation against the expected version;
- an **explicit existence check** on the reported installer path, failing if the
  build reported one that is not there;
- a SHA-256 computed over the installer;
- `Get-AuthenticodeSignature` verification requiring the exact status `NotSigned`;
- a signer-process audit plus version-1 build provenance tied to the source commit;
- validation of every `RELEASES` SHA-1, byte length and package basename, the
  NuGet identity/version, and the required installed executable entry;
- assets staged under names that mean something outside this repository:
  `Setup.exe`, its `.sha256`, `RELEASES`, full/delta `.nupkg` packages,
  `metadata.json`, the icon, provenance and the artifact receipt. A portable
  archive is neither requested nor published as an alternate installer.

The namespace and channel are literals in the workflow environment, because
upstream derives them from a metadata job wired to infrastructure this fork does
not have, and an empty namespace or version fails the packer outright.

**11 — Upload the installer as a workflow artifact**, with `always()`,
`if-no-files-found: warn`, `continue-on-error: true` and bounded retention so a
packaging failure still leaves safe evidence without masking the root failure.

**12 — Do not smoke-test in Actions.** The packaged application is captured and
smoke-tested locally when the task requires it; a missing local result is reported
as unverified rather than silently turning into a workflow gate.

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

**16 — Publish.** A generated notes file, `--latest`, every staged Squirrel asset,
the explicit `--target "$GITHUB_SHA"`, and post-publication target/hash/asset
verification. By explicit owner direction, the current release temporarily
skips the contradictory dim-sum photo attachment. The run warns and the release
notes state the omission; no catalog image is copied or attached. This temporary
exception changes no other publication requirement.

**17 — Summarise.** Version, tag, installer name, smoke-test outcome and code name
into the run summary.

</details>

### What the release notes carry

| Section | Contents |
| --- | --- |
| Title | `Material Designer <version> — <code name>` |
| Code name | The dish in English and Traditional Chinese |
| Install | The asset name, the SHA-256, Squirrel package assets, the stable metadata-feed URL, the explicit `NotSigned` result and the unknown-publisher warning |
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

**Code signing is permanently prohibited.** An unsigned Windows installer
triggers the operating system's reputation screen, which reports an unknown
publisher and hides the proceed button behind a **More info** link. The current
workflow clears certificate, timestamp and signer-discovery inputs, verifies the
resulting `Setup.exe` with Authenticode, and refuses publication unless the
exact status is `NotSigned`.

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

**Historical passing evidence:** multiple legacy releases were published by the
runs that built their installers; the latest verified one is `v0.16.1-r71.1` from
run `30957484333`. Its workspace installed with native modules compiled from
source, the typecheck and Windows identity specs passed, and the smoke test
installed, launched, health-checked, screenshotted and uninstalled the built
application.

**Current failing evidence:** labelled self-hosted Windows Release
[`31186802259`](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31186802259)
at `f6549861` passed dependency installation, Typecheck, Squirrel packaging,
`NotSigned`, self-contained scanning and installer artifact upload. Its packaged
smoke timed out after `720000ms` before UI capture. `ui-states.json` was absent,
and code-name selection and publication were skipped. This proves the
no-publication-on-failure gate; it does not prove the Squirrel application can
install, start or uninstall successfully.

The pipeline is fully proven when one run demonstrates all of:

- [x] port verification passing with zero gaps and its summary table rendered
- [x] port verification detecting deliberate gap classes in the local verifier proof
- [x] labelled Windows install completing with the native binding compiled
- [x] typecheck and the identity suites passing
- [x] a Squirrel installer produced, its reported path present, and `NotSigned`
- [ ] the Squirrel smoke installing, launching, health-checking, capturing UI states and uninstalling
- [x] historical non-draft releases under fresh tags with their installer/checksum assets
- [x] the line-count table present in historical release notes
- [x] later historical releases selecting different code names
- [x] a failed Squirrel smoke skipping code-name selection and publication

The remaining unchecked box is the current product boundary: a labelled-runner
Squirrel artifact must complete the real installed-app smoke and publish its
UI-state evidence before the new release path is verified.

## Suggested reading

- [packaged-smoke-test.md](packaged-smoke-test.md) — what the test in step 12 actually proves, assertion by assertion
- [line-count.md](line-count.md) — how the published figure is produced, and what its scopes mean
- [code-names.md](code-names.md) — how a dish is chosen and why it is spent exactly once
- [release-assets.md](release-assets.md) — what each attached file is, and what is deliberately absent
- [../build/ci.md](../build/ci.md) — the workflows as a set, including the fast gate this one deliberately does not depend on
- [../troubleshooting/README.md](../troubleshooting/README.md) — the failures this pipeline actually hit on the way to working
