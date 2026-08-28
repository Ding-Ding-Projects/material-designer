# Root dependency bootstrap

How the root scripts obtain the toolchain used by the build and installer entry
points without relying on a warm checkout.

## Behaviour

`download-dependencies.bat` is the Windows entry point. It calls the committed
PowerShell helper with the requested mode. `download-dependencies.sh` is the
Linux companion for projects that use the same source tree outside the active
Windows delivery path.

Both helpers use a user-scoped cache, serialize cache updates with an exclusive
lock, download only from canonical upstream URLs, verify the recorded digest,
materialize a complete tool directory, and verify the executable version after
materialization. A second invocation rechecks cached archives and skips
extraction when the pinned executable is already present. A partial download
stays in a `.download` path until verification succeeds.

The Windows helper writes an ignored `dependency-resolution.json` record under
`.yum-tong/build/`. It contains the manifest digest, exact executable paths, and
the safe compiler environment values. `scripts/build.ps1` reads that record and
uses those exact paths, so a machine-installed Node, pnpm, Python, or compiler
cannot silently replace the pinned toolchain. The helper imports `vcvars64.bat`
after a Visual Studio workload installation and records the resulting compiler
path for the build process.

The root `build.bat` calls the Windows helper before `scripts/build.ps1`. The
installer entry point calls the same build path, so a person does not need to
know an internal bootstrap command or invent a candidate number.

## Configuration

The public manifest is [`dependencies.manifest.json`](../../dependencies.manifest.json).
The current Windows x64 pins are:

| Input | Version | Canonical source | Digest |
| --- | --- | --- | --- |
| MinGit | `2.55.0.windows.5` | Git for Windows release archive | SHA-256 in the manifest |
| Node.js | `24.20.0` | nodejs.org binary archive | SHA-256 in the manifest |
| pnpm | `10.33.2` | npm registry tarball | SHA-512 integrity in the manifest |
| Python | `3.12.10` | python.org embeddable archive | SHA-256 in the manifest |
| MSVC | Visual Studio 2022 C++ workload | Windows package catalog | Workload id in the manifest |

The Windows cache is under the user's local application-data directory and is
not part of the checkout. The Linux cache uses `XDG_CACHE_HOME` or the user's
cache directory. `SILENT=1`, `/s`, and `--silent` suppress prompts and pauses.
Interactive mode requests elevation before work begins. Silent mode stays
user-scoped and never waits for an elevation prompt.

The local installer can accept an external provenance file through
`MATERIAL_DESIGNER_PROVENANCE_FILE` or the `-ProvenanceFile` parameter. The
record must carry `schemaVersion: 1`, the exact source commit, the exact
computed package version, and a valid `updatedAt` timestamp. If no record is
provided, local output reports provenance as unavailable. It never substitutes
launch time, file timestamps, or a hand-entered time.

## Failure modes

- A digest mismatch leaves the previous verified cache untouched and reports
  the input, expected digest, and received digest.
- A missing canonical source reports the exact URL and dependency instead of
  continuing with an unverified download.
- A missing MSVC compiler attempts the canonical Visual Studio 2022 workload
  through the package catalog. If the workload remains unavailable, the helper
  reports that the native workspace cannot continue.
- A missing or malformed external provenance record stops the installer path.
  No host-clock value is written as a substitute.
- `/s`, `--silent`, and `SILENT=1` never open a prompt. A real bootstrap error
  returns nonzero so CI or another caller can stop safely.

## Security considerations

The helpers use HTTPS canonical sources, temporary download names, exact digest
checks, and user-scoped destinations. They do not request credentials, install
signing material, change persistent execution policy, or publish releases. The
Visual Studio workload is the only system-level toolchain route, and it is
attempted only when the compiler is absent.

The digest proves byte integrity, not publisher identity. Code signing remains
disabled for the produced installer, and the release path must independently
verify its unsigned state.

## Verification

Parse the PowerShell helpers without executing the build toolchain:

```text
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "...Parser..."
```

Run the build entrypoint contract check:

```text
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-build-entrypoints.ps1
```

The check first passes the intact entry points, removes the dependency call
from a temporary fixture, observes a failure, restores the exact bytes, and
observes a pass. The build and installer commands themselves are intentionally
not run by this local lane because the repository's local rules reserve the
heavy toolchain build for continuous integration.

## Suggested reading

- [from-source.md](from-source.md) for package-level build commands
- [../release/automatic-updates.md](../release/automatic-updates.md) for the
  feed, staged download, checksum, and restart behavior
- [../release/release-pipeline.md](../release/release-pipeline.md) for hosted
  packaging and publication
