# Build

How Material Designer is built, where that happens, and why.

## Files in this category

| File | What it covers |
| --- | --- |
| [ci.md](ci.md) | Why building is confined to ephemeral continuous-integration runners, what the release workflow must do, the checks it must run, the line-ending trap that will break port verification on a Windows runner, and how a build is triggered. |
| [from-source.md](from-source.md) | Every prerequisite and every exact command for building, running and testing locally, for someone who does want to do it on their own machine. |

## Status

> [!IMPORTANT]
> **All three workflows at the repository root have run.** `Verify` passes at
> zero gaps, `Release` has built Windows installers and published two releases,
> and `Pages` has deployed the documentation site. [ci.md](ci.md) records what
> each run demonstrated and — just as plainly — the failure cases none of them
> has: no workflow has been observed rejecting a bad tree. `Pages` is documented
> under [../site/](../site/).
>
> The 48 workflow files under `design/.github/workflows/` belong to the vendored
> upstream project and are **inert**, because workflows are only read from the
> repository root.

## The short version

| Question | Answer |
| --- | --- |
| Where do builds run? | Ephemeral hosted runners — Linux for the `Verify` gate, Windows for `Release`. |
| Can I build locally? | Yes — see [from-source.md](from-source.md). It is not the supported path for producing releases, but every command is documented. |
| What gets produced? | A Windows installer plus a portable archive and a checksum file, built via electron-builder. |
| Is the installer signed? | No code-signing certificate is configured. An unsigned installer triggers the operating system's reputation warning, and the release notes say so; see [ci.md](ci.md). |
| What must pass before a release? | Typecheck, the three product-identity test suites, payload validation, and a packaged smoke test that installs, launches, health-checks and uninstalls the built application. |
| What gates every push? | Port verification — that `design/` still matches upstream with every difference declared. |

## Why the split exists

Installing this project's dependencies is expensive in a specific way: it
resolves a large workspace, runs a chain of 18 workspace builds, and compiles a
native database binding from source on Windows. That work belongs on a disposable
machine that is created for the build and destroyed after it — which is what a
continuous-integration runner is. The runner also gives every build the same
environment, so a failure is a fact about the code rather than about somebody's
machine.

[from-source.md](from-source.md) exists anyway, because a developer changing the
interface needs a loop faster than a remote build, and because a build nobody can
reproduce locally is a build nobody can debug.

## Suggested reading

- [../release/release-pipeline.md](../release/release-pipeline.md) — what happens after a build succeeds: the smoke test, the notes, the assets and publication
- [../troubleshooting/](../troubleshooting/) — the build failures this project actually hit, each with the symptom as it appeared in a log
- [../porting/verification.md](../porting/verification.md) — the integrity check every workflow runs first, and the line-ending trap that makes it report thousands of false differences
- [../architecture/overview.md](../architecture/overview.md) — what the 18 workspace builds are building, and how the pieces connect
