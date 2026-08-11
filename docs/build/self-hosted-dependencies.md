# Self-hosted CI dependency inventory

> [!IMPORTANT]
> **Current contract — 2026-08-11.** The active delivery route is hosted
> `windows-2022`; the older self-hosted Linux/Windows rows below are historical
> inventory, not an availability claim. The configured self-hosted runners were
> offline when the exact-SHA runs were queued, which is why a hosted fallback is
> now required. Actions no longer runs tests, lint, typecheck or static-analysis
> checks. Manual build scripts and local verification own those checks; release
> publication only depends on packaging and publication evidence.

This is the hand-written dependency inventory for every job in the three root
workflows. A self-hosted label selects a machine; it does not prove that the
machine already has the tools a job needs. Each workflow bootstraps the tools it
owns and checks versions before doing project work.

## Job inventory

| Workflow/job | Runner labels | Dependencies bootstrapped or checked | First real work |
| --- | --- | --- | --- |
| `Verify` / `verify` | `self-hosted`, `linux`, `material-designer` | Bash, Git, curl, tar, coreutils, `flock`; user-scoped `gh 2.76.2` and `jq 1.8.0`; Node 24 | `scripts/verify-port.sh` and the committed release-contract test |
| `Verify` / `test` | `self-hosted`, `linux`, `material-designer` | Everything in `verify`; pnpm 10.33.2; Node 24; Python 3.12; the native compiler and headers required by the lockfile's native modules; workspace dependencies from `design/pnpm-lock.yaml` | `pnpm install --frozen-lockfile` |
| `Release` / `build` | `self-hosted`, `windows`, `material-designer` | Windows PowerShell (powershell.exe); user-scoped `gh 2.76.2`, `jq 1.8.0`, and 7-Zip 25.01; Node 24; pnpm 10.33.2; Python 3.12 extracted from the pinned official `python-3.12.10-embed-amd64.zip`; MSVC x64 and the Windows SDK; workspace dependencies from `design/pnpm-lock.yaml`; Squirrel/electron-builder tools from the lockfile | `pnpm install --frozen-lockfile` |
| `Pages` / `deploy` | `self-hosted`, `linux`, `material-designer` | Bash, Git, curl, tar, coreutils, `flock`; user-scoped `gh 2.76.2` and `jq 1.8.0`; static-site inputs tracked in `site/` | Static-site validation and publication |

The release job deliberately clears certificate, signer, timestamp, and
electron-builder identity-discovery inputs. No signing dependency is installed
or invoked. Its final Windows checks require `Get-AuthenticodeSignature` to
report `NotSigned` for `Setup.exe`.

## Bootstrap paths

- Linux utility bootstrap: `scripts/bootstrap-ci-tools.sh`. It downloads only
  pinned official `gh` and `jq` archives, verifies SHA-256 hashes, serializes
  cache updates with `flock`, and exposes the user-scoped cache through
  `GITHUB_PATH`.
- Windows utility bootstrap: `scripts/bootstrap-ci-tools.ps1`. It downloads
  only pinned official `gh`, `jq`, and 7-Zip packages, verifies SHA-256 hashes,
  re-materializes cached tools, and uses a user-scoped cache lock.
  The job invokes it through Windows PowerShell; the script is kept compatible
  with the shell available on the labelled runner.
- Language and compiler bootstrap: the workflows use the official
  `pnpm/action-setup`, `actions/setup-node`, and `ilammy/msvc-dev-cmd` actions;
  the Windows Release job uses `scripts/bootstrap-python.ps1` because the
  runner's AllSigned policy blocks the action's unsigned setup script. The
  bootstrap verifies the official Python 3.12.10
  `python-3.12.10-embed-amd64.zip`, extracts it without registry or installer
  operations, and verifies the resulting `python.exe` in the user-scoped cache.
  Project dependencies come only from the committed manifests and lockfile.

## Fresh-environment bootstrap proof

The cache-miss path is the supported path: deleting the job-local tool cache
causes the bootstrap scripts to download, hash-check, install, and expose the
tools before the first project command. The dependency inventory is checked by
`scripts/test-release-contract.mjs`, which fails if a listed root workflow loses
self-hosted labels, its bootstrap call, Python coverage, or the unsigned release
contract. CI is the fresh-runner proof for native compiler availability and the
full lockfile install; a cache hit only shortens the same path.

Release run
[31186802259](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31186802259)
proved the labelled Windows tool and dependency bootstrap through `pnpm install
--frozen-lockfile`, completed Typecheck and Windows identity/installer tests,
and produced an unsigned Squirrel package verified as `NotSigned`. The
self-contained scan and installer artifact upload also passed. The packaged
smoke then timed out after `720000ms`, emitted no `ui-states.json`, and correctly
skipped publication. This proves labelled runner execution, not a fresh cache-miss
download; that distinct bootstrap path remains governed by the committed test.

## Security boundary

Self-hosted jobs run only on trusted push and manual-dispatch events. There is no
`pull_request` trigger for code executing on these machines. Caches are
user-scoped and hash-validated, but are not treated as a trust boundary. Secrets
are passed through GitHub Actions environment conventions only when required by
the publication API, never printed, and no signing secret exists or is needed.

## Suggested articles

- [ci.md](ci.md) — workflow behavior and evidence
- [../release/release-pipeline.md](../release/release-pipeline.md) — artifact and release publication
- [../troubleshooting/](../troubleshooting/) — failure symptoms and recovery
