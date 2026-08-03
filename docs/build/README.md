# Build

How Material Designer is built, where that happens, and why.

## Files in this category

| File | What it covers |
| --- | --- |
| [ci.md](ci.md) | Why building is confined to ephemeral continuous-integration runners, what the release workflow must do, the checks it must run, the line-ending trap that will break port verification on a Windows runner, and how a build is triggered. |
| [from-source.md](from-source.md) | Every prerequisite and every exact command for building, running and testing locally, for someone who does want to do it on their own machine. |

## Status

> [!IMPORTANT]
> **Three workflows exist at the repository root — `Verify`, `Release` and
> `Pages` — but no run outcome is recorded in this documentation.** Nothing has
> been observed building, and no installer or release is claimed here.
> [ci.md](ci.md) describes the two build workflows and says plainly which of its
> statements are descriptions and which would be results; `Pages`, which deploys
> the documentation site, is documented under [../site/](../site/).
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
