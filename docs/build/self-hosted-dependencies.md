# Self-hosted CI dependency inventory

This is the hand-written dependency inventory for every job in the three root
workflows. A self-hosted label selects a machine; it does not prove that the
machine already has the tools a job needs. Each workflow bootstraps the tools it
owns and checks versions before doing project work.

## Job inventory

| Workflow/job | Runner labels | Dependencies bootstrapped or checked | First real work |
| --- | --- | --- | --- |
| `Verify` / `verify` | `self-hosted`, `linux`, `material-designer` | Bash, Git, curl, tar, coreutils, `flock`; user-scoped `gh 2.76.2` and `jq 1.8.0`; Node 24 | `scripts/verify-port.sh` and the committed release-contract test |
| `Verify` / `test` | `self-hosted`, `linux`, `material-designer` | Everything in `verify`; pnpm 10.33.2; Node 24; Python 3.12; the native compiler and headers required by the lockfile's native modules; workspace dependencies from `design/pnpm-lock.yaml` | `pnpm install --frozen-lockfile` |
| `Release` / `build` | `self-hosted`, `windows`, `material-designer` | User-scoped `gh 2.76.2`, `jq 1.8.0`, and 7-Zip 25.01; Node 24; pnpm 10.33.2; Python 3.12; MSVC x64 and the Windows SDK; workspace dependencies from `design/pnpm-lock.yaml`; Squirrel/electron-builder tools from the lockfile | `pnpm install --frozen-lockfile` |
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
- Language and compiler bootstrap: the workflows use the official
  `pnpm/action-setup`, `actions/setup-node`, `actions/setup-python`, and
  `ilammy/msvc-dev-cmd` actions. Project dependencies come only from the
  committed manifests and lockfile.

## Fresh-environment bootstrap proof

The cache-miss path is the supported path: deleting the job-local tool cache
causes the bootstrap scripts to download, hash-check, install, and expose the
tools before the first project command. The dependency inventory is checked by
`scripts/test-release-contract.mjs`, which fails if a listed root workflow loses
self-hosted labels, its bootstrap call, Python coverage, or the unsigned release
contract. CI is the fresh-runner proof for native compiler availability and the
full lockfile install; a cache hit only shortens the same path.

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
