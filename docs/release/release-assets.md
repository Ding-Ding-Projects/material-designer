# Release assets

> [!IMPORTANT]
> **Current release boundary: 2026-08-29.** A new release must contain the real
> unsigned Squirrel `Setup.exe`, `RELEASES`, full package (and delta packages
> when produced), `metadata.json`, icon, checksum, provenance evidence and one
> run-scoped PNG downloaded from a published public catalog release. The photo is
> checked against its GitHub digest and decoded before upload, and is not stored
> in the consumer repository.

What is attached to a published release, what each file is for, what is uploaded
to the run but *not* to the release, and what is deliberately absent.

> [!IMPORTANT]
> **Status: route implemented, hosted proof pending.** Historical releases carry
> installers and older code-name images. The current workflow stages a
> project-owned Squirrel.Windows feed and a validated public catalog photo for
> each new release; a replacement hosted run is still required as the external
> proof. The new workflow publishes intentionally unsigned artifacts and verifies
> `NotSigned` before publication; the historical releases are also unsigned. There is **no
> macOS or Linux artifact** — that absence is deliberate
> and is explained below rather than left for a reader to notice.

## The attached assets

| Asset | What it is |
| --- | --- |
| `material-designer-<version>-win-x64-setup.exe` | The Windows installer. The thing a user downloads and runs. Does not require administrator rights. |
| `material-designer-<version>-win-x64-setup.exe.sha256` | The installer's SHA-256, computed by the run that built it, in the usual `<hash>  <filename>` form. |
| `RELEASES` | Squirrel.Windows' package index for the published full and delta packages. |
| `*-full.nupkg` / `*-delta.nupkg` | Squirrel.Windows' complete and delta update packages, copied from the build that produced `Setup.exe`. |
| `metadata.json` | Material Designer's updater feed. It names the stable Windows `Setup.exe`, its immutable release URL and its SHA-256. |
| `material-designer.ico` | The Squirrel.Windows icon asset used by the installer and shortcut lifecycle. |
| `codename-<dish id>.png` | The release's dim sum code-name photograph, downloaded from a published public catalog asset into run-scoped staging and validated before upload. See [code-names.md](code-names.md). |

Squirrel shortcuts are created by the packaged lifecycle rather than inferred
from the unsigned executable's unchanged Electron version resource. The visible
shortcut is `Material Designer.lnk`, targets the stable Squirrel root launcher,
and is removed on uninstall. The known incorrect `GitHub, Inc.\Electron.lnk`
and desktop `Electron.lnk` names from older Squirrel builds are removed during
install/update reconciliation.

### Why the names are rewritten

The packaging tool produces an installer under a path and name that make sense
inside the build tree and make no sense outside it. The workflow **stages** the
artifacts under names that say what they are to somebody who has never seen this
repository: the product, the version, the platform and architecture, and the kind
of artifact.

A downloaded file lives in somebody's downloads folder for months. Its name is the
only documentation it carries.

### Why the checksum is a separate file

The hash is also printed in the release notes, which is where most people will
read it. The file exists so the check can be scripted without scraping a web page,
and so a mirror of the assets carries its own integrity statement.

```powershell
# Windows
Get-FileHash .\material-designer-<version>-win-x64-setup.exe -Algorithm SHA256
```

```bash
# anywhere with a POSIX shell, from the directory holding both files
sha256sum -c material-designer-<version>-win-x64-setup.exe.sha256
```

> [!WARNING]
> A checksum published alongside a download proves the file was not **corrupted**.
> It does not prove it was not **replaced**, because whoever could replace the file
> could replace the hash. This project permanently prohibits code signing, so the
> workflow verifies the artifact is intentionally unsigned (`NotSigned`) and
> makes no publisher-authenticity claim — see below.

## Workflow artifacts, which are not release assets

These are attached to the **run**, not the release. They expire; release assets do
not. Confusing the two is how somebody ends up linking a download that vanishes.

| Artifact | When | Contents |
| --- | --- | --- |
| `material-designer-release-evidence-<run id>` | Always | Any safely staged Squirrel assets plus generated release notes, line-count output and post-publication download verification. The upload is evidence preservation only and never substitutes for a release asset. |

The `always()` upload is deliberate: a failed packaging or publication run keeps
the safe evidence it reached without turning the original failure green.

## What is deliberately absent

**Code signing is permanently prohibited.** An unsigned Windows installer
triggers the operating system's reputation screen, which reports an unknown
publisher and hides the proceed button behind a **More info** link. The current
workflow clears certificate, timestamp and signer-discovery inputs, keeps the
packaging controls false, verifies the resulting `Setup.exe` with Authenticode,
and refuses publication unless the exact status is `NotSigned`.

There is a related trap worth recording, because it looks like plain metadata and
is not: setting a publisher name in the packaging configuration is rejected
outright by the current packaging toolchain, which classes it as a signing input.
See
[../troubleshooting/packaging-schema-drift.md](../troubleshooting/packaging-schema-drift.md).

**The updater feed is project-owned and Windows-stable only.** Packaged stable
Windows builds default to
`https://github.com/Ding-Ding-Projects/material-designer/releases/latest/download/metadata.json`.
The release workflow writes that `metadata.json` beside `Setup.exe`, points it
at the same release's immutable installer asset, and includes its SHA-256. The
integrity verifier requires absolute HTTPS GitHub URLs using the matching
`releases/tag/<tag>` and `releases/download/<tag>/<asset>` paths, so a mutable
`latest` feed or a URL from another release cannot pass as the published bytes.
desktop updater downloads the installer in the background, verifies the checksum,
and leaves the final action to the user through **Restart to install update**;
it never launches a downloaded installer as a hidden side effect. `RELEASES`
and the full/delta `.nupkg` files remain attached so Squirrel.Windows has its
native package feed as well.

The two already-published releases predate this migration. Their absence of
`metadata.json`, `RELEASES` and NuGet packages is historical, not a claim that
the new workflow was verified before it ran.

**No macOS or Linux artifacts.** The pipeline builds Windows. The packaging tool
supports the other platforms, and the current scope is Windows desktop.

**No source archive beyond the automatically generated ones.** The forge attaches
its own snapshot of the tag; nothing is added.

## The rule that governs all of this

**The release artifact must be the tested artifact.** Never attach an installer
from a different run, a local build, or a re-run that skipped the tests. The whole
value of building, testing and publishing inside one run is that the bytes tested
and the bytes published are the same bytes; attaching anything from outside that
run silently destroys it while leaving every green tick in place.

Two mechanisms enforce it in practice:

1. The staged assets are copied from the path the packaging build **reported**, and
   the workflow fails if that path does not exist — so a packaging failure that
   forgot to set a non-zero exit cannot pass an empty directory forward.
2. The complete-artifact validator binds the setup, package identity/version,
   `RELEASES`, icon, metadata and immutable build log to the workflow commit.
   Installed-version proof remains a separate cheap-headless runtime receipt.

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| A release exists with no installer attached | Packaging succeeded, asset upload did not | Treat it as a failed release and delete it. A release without its artifact is worse than none, because it looks complete. |
| The published hash does not match the download | Corruption in transit, a mirror, or a replaced file | Do not install it. Re-download from the release page and compare again. |
| A download link stops working after a few weeks | It pointed at a workflow artifact, not a release asset | Link release assets. Workflow artifacts expire. |
| The reputation screen blocks an installer | It is intentionally unsigned | Documented in the notes. **More info**, then run; the workflow verified `NotSigned` before publication. |
| The app reports no update | The installed build is older than the feed's monotonic release version, or the published release predates the Squirrel feed | Check the stable `metadata.json` URL and the app's updater status; do not substitute an upstream feed. |
| The update banner offers no restart action | The downloaded artifact was not identified as a Windows Squirrel installer | Confirm the feed artifact is named `Setup.exe` and the metadata `type` is `installer`. |
| The code-name image is missing | No unused published dish, download, digest, signature or decode proof was available | The release stops before publication. See [code-names.md](code-names.md). |

## Security considerations

- **The unsigned-artifact gate is a real packaging boundary.** The workflow
  clears signing inputs and refuses publication if `Setup.exe` is not exactly
  `NotSigned`. It does not claim publisher authenticity; Windows may show its
  unknown-publisher warning and the release notes say so plainly.
- **The checksum's guarantee is narrower than it looks** — integrity against
  corruption, not authenticity against substitution. Publishing it alongside the
  file it describes is standard and still worth doing; describing it as protection
  against tampering would be false.
- **Runtime captures are not produced by the release workflow.** Installed UI
  proof is collected separately through the approved cheap-headless route and
  must be privacy-reviewed before publication.
- **The build logs upload only on failure**, which is when they are needed and also
  when they are most likely to contain paths and environment detail. They are
  reviewed as public output.
- **Never attach an artifact produced anywhere but the publishing run.** The
  catalog photo is the one controlled exception to repository storage: its bytes
  are downloaded from the public release asset during this run, validated, and
  attached only from the run's staging directory.

## Verification

The repository also carries two source-level helpers for release evidence. Run
`scripts/verify-release-integrity.ps1` against a staged release directory to
bind `Setup.exe`, `RELEASES`, the full Squirrel package, `metadata.json`, and
`build-provenance.json` to the expected version and source commit. The helper
checks the unsigned status, `RELEASES` rows, full and delta package hashes, feed
hash, identity, and verified or unavailable provenance, but it does not publish
anything. Its signature provider is a controlled seam in
`scripts/release-integrity-core.psm1`, so the negative regression can invoke the
same verifier logic without pretending a text fixture is a real signed binary.
`scripts/test-release-integrity-negative.ps1 -SelfTest` proves the valid fixture
is accepted, a changed installer hash and signed status are rejected, a strict
verified `builtAt` is required, and unavailable provenance remains honest.

The all-releases viewer data has a similar source boundary. It is not inferred
from a version string or a hand-written list: `scripts/generate-release-history.mjs`
reads an explicit paginated GitHub CLI release response, resolves every tag to
its full commit SHA, and writes `release-history.generated.ts`. `--check`
requires the committed output to match the 51-record inventory exactly.

**Observed:** the two legacy published releases carry the installer, its checksum
file and a code-name image, with the notes stating the hash, the smoke-test
outcome, the commit, the run link and the provenance.

**Pending evidence:** a new successful release run must prove that the Squirrel
build produces intentionally unsigned `Setup.exe` (`NotSigned`), `RELEASES`,
full/delta `.nupkg` packages, the icon and `metadata.json`, and that the
published stable feed is downloadable. Installed launch and updater interaction
remain separate cheap-headless evidence rather than release-workflow Chuts.

```bash
# list what a release actually carries
gh release view <tag> --json assets --jq '.assets[].name'

# download and check the installer against its published checksum
gh release download <tag> --pattern '*setup.exe*'
sha256sum -c material-designer-<version>-win-x64-setup.exe.sha256
```

**Not verified:** publisher authenticity or that a mirror or proxy has not
altered a download. This release process deliberately has no code signature;
the checksum detects corruption but cannot establish who published the file.

## Suggested reading

- [release-pipeline.md](release-pipeline.md) — the run that produces every one of these files
- [packaged-smoke-test.md](packaged-smoke-test.md) — the test the installer must pass before it is published
- [code-names.md](code-names.md) — where the attached photograph comes from
- [../troubleshooting/packaging-schema-drift.md](../troubleshooting/packaging-schema-drift.md) — the signing-adjacent property that fails the build on sight
