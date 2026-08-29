# Build

How Material Designer is built, where that happens, and why.

## Files in this category

| File | What it covers |
| --- | --- |
| [ci.md](ci.md) | The labelled self-hosted runner contract, explicit tool installation from the pinned manifests, metadata and status evidence helpers, what the release workflow must do, the line-ending trap that will break port verification on a Windows runner, and how a build is triggered. |
| [self-hosted-dependencies.md](self-hosted-dependencies.md) | The complete dependency inventory, isolated bootstrap path, fresh-environment proof, and no-signing boundary for every self-hosted job. |
| [from-source.md](from-source.md) | Every prerequisite and every exact command for building, running and testing locally, for someone who does want to do it on their own machine. |

## Status

> [!IMPORTANT]
> **The latest Release run is not green.** Release
> [31186802259](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31186802259)
> at `f6549861` passed the labelled self-hosted Windows bootstrap, frozen
> dependency installation, Typecheck, Windows identity tests, Squirrel packaging,
> Authenticode `NotSigned`, self-contained scanning and installer artifact upload.
> The packaged smoke timed out after `720000ms` before UI capture, so
> `ui-states.json` was absent and publication was skipped. Verify `31186802470`
> remains queued; no new Squirrel release is claimed.
>
> The 48 workflow files under `design/.github/workflows/` belong to the vendored
> upstream project and are **inert**, because workflows are only read from the
> repository root.

## The short version

| Question | Answer |
| --- | --- |
| Where do builds run? | Dedicated self-hosted runners labelled `linux, material-designer` for `Verify`/`Pages` and `windows, material-designer` for `Release`. |
| Can I build locally? | Yes — see [from-source.md](from-source.md). It is not the supported path for producing releases, but every command is documented. |
| What gets produced? | A Windows installer plus a portable archive and a checksum file, built via electron-builder. |
| Is the installer signed? | No. Code signing is permanently prohibited; the workflow clears signing inputs and verifies that `Setup.exe` reports `NotSigned`. Historical releases are also unsigned; see [ci.md](ci.md). |
| What must pass before a release? | Typecheck, the three product-identity test suites, payload validation, and a packaged smoke test that installs, launches, health-checks and uninstalls the built application. |
| What gates every push? | Port verification — that `design/` still matches upstream with every difference declared. |

## Why the split exists

Installing this project's dependencies is expensive in a specific way: it
resolves a large workspace, runs a chain of 18 workspace builds, and compiles a
native database binding from source on Windows. That work belongs on a dedicated
runner with the repository's explicit labels. Each job cleans its checkout, the
setup actions install Node 24 and pnpm 10.33.2, and the frozen lockfile install
recreates the workspace rather than trusting a pre-existing `node_modules` tree.
The runner contract also keeps the Linux verification and Windows packaging
responsibilities separate.

The self-hosted dependency inventory is committed in
[self-hosted-dependencies.md](self-hosted-dependencies.md). It names the exact
Node, pnpm, Python, MSVC/Windows SDK, GitHub CLI, jq, 7-Zip and project-lockfile
inputs each job needs, plus the cache-miss bootstrap and fresh-environment proof.

[from-source.md](from-source.md) exists anyway, because a developer changing the
interface needs a loop faster than a remote build, and because a build nobody can
reproduce locally is a build nobody can debug.

## Suggested reading

- [../release/release-pipeline.md](../release/release-pipeline.md) — what happens after a build succeeds: the smoke test, the notes, the assets and publication
- [../troubleshooting/](../troubleshooting/) — the build failures this project actually hit, each with the symptom as it appeared in a log
- [../porting/verification.md](../porting/verification.md) — the integrity check every workflow runs first, and the line-ending trap that makes it report thousands of false differences
- [../architecture/overview.md](../architecture/overview.md) — what the 18 workspace builds are building, and how the pieces connect
