# Release assets

What is attached to a published release, what each file is for, what is uploaded
to the run but *not* to the release, and what is deliberately absent.

> [!IMPORTANT]
> **Status: published.** Two releases exist, each carrying a Windows installer,
> its checksum file and a code-name image. There is **no code signature**, **no
> updater feed**, and **no macOS or Linux artifact** — all three absences are
> deliberate and are explained below rather than left for a reader to notice.

## The attached assets

| Asset | What it is |
| --- | --- |
| `material-designer-<version>-win-x64-setup.exe` | The Windows installer. The thing a user downloads and runs. Does not require administrator rights. |
| `material-designer-<version>-win-x64-setup.exe.sha256` | The installer's SHA-256, computed by the run that built it, in the usual `<hash>  <filename>` form. |
| `material-designer-<version>-win-x64-portable.zip` | The portable archive, attached when the packaging build produced one. |
| `codename-<dish id>.png` | The release's dim sum code-name photograph, from the bundled catalogue. See [code-names.md](code-names.md). |

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
> could replace the hash. That is what a code signature would prove, and there is
> not one — see below.

## Workflow artifacts, which are not release assets

These are attached to the **run**, not the release. They expire; release assets do
not. Confusing the two is how somebody ends up linking a download that vanishes.

| Artifact | When | Contents |
| --- | --- | --- |
| `material-designer-win-x64` | Always, if the build staged anything | The same staged assets, so a *failed* smoke test still leaves an installer to inspect. |
| `material-designer-win-smoke-report` | Always | The smoke test's report: its manifest, the packaging build's machine-readable output, the full test log, the result record, the summary and the screenshots. |
| `material-designer-build-logs` | On failure | Packaging and runtime logs. |

The first one uploading on *failure* is the deliberate part. When the smoke test
fails, the installer that failed is the single most useful thing to have.

## What is deliberately absent

**No code signature.** No certificate is configured. An unsigned Windows installer
triggers the operating system's reputation screen, which reports an unknown
publisher and hides the proceed button behind a **More info** link. The release
notes state this explicitly, which is the right place for it: a user who expects
it will click through, and a user who does not will reasonably assume the download
is malicious.

There is a related trap worth recording, because it looks like plain metadata and
is not: setting a publisher name in the packaging configuration is rejected
outright by the current packaging toolchain, which classes it as a signing input.
See
[../troubleshooting/packaging-schema-drift.md](../troubleshooting/packaging-schema-drift.md).

**No updater feed, and no update metadata files.** The inherited configuration
pointed at the upstream project's release feed, so an unmodified build would have
downloaded that project's installer and replaced itself with it. Updates are
opt-in here and the default origin does not resolve, so there is nothing to
publish an update manifest *for*. A release carrying an update manifest that
points nowhere would be worse than one carrying none.

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
2. The smoke test asserts the running application reports **the version this run
   was building**, which catches a cached or leftover artifact installing instead
   of the fresh one.

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| A release exists with no installer attached | Packaging succeeded, asset upload did not | Treat it as a failed release and delete it. A release without its artifact is worse than none, because it looks complete. |
| The published hash does not match the download | Corruption in transit, a mirror, or a replaced file | Do not install it. Re-download from the release page and compare again. |
| The portable archive is missing | The packaging build did not produce one | Expected: the archive is attached only when it exists. The installer is the primary artifact. |
| A download link stops working after a few weeks | It pointed at a workflow artifact, not a release asset | Link release assets. Workflow artifacts expire. |
| The reputation screen blocks the installer | It is unsigned | Documented in the notes. **More info**, then run. |
| The code-name image is missing | No dish was available, or its file was absent | Never blocks a release. See [code-names.md](code-names.md). |

## Security considerations

- **An unsigned installer is a real, disclosed limitation, not a formality.** It is
  stated in the notes because hiding it trains users to click through warnings, and
  a user who clicks through every warning is a user who will click through the one
  that mattered.
- **The checksum's guarantee is narrower than it looks** — integrity against
  corruption, not authenticity against substitution. Publishing it alongside the
  file it describes is standard and still worth doing; describing it as protection
  against tampering would be false.
- **The smoke report contains a screenshot of the running application.** It is
  uploaded publicly. Nothing secret should ever be on the application's first
  screen; if that changes, this artifact publishes it.
- **The build logs upload only on failure**, which is when they are needed and also
  when they are most likely to contain paths and environment detail. They are
  reviewed as public output.
- **Never attach an artifact produced anywhere but the publishing run.**

## Verification

**Observed:** the published releases carry the installer, its checksum file and a
code-name image, with the notes stating the hash, the smoke-test outcome, the
commit, the run link and the provenance.

```bash
# list what a release actually carries
gh release view <tag> --json assets --jq '.assets[].name'

# download and check the installer against its published checksum
gh release download <tag> --pattern '*setup.exe*'
sha256sum -c material-designer-<version>-win-x64-setup.exe.sha256
```

**Not verified:** that a mirror or a proxy has not altered a download — nothing in
this release process can establish that without a signature.

## Suggested reading

- [release-pipeline.md](release-pipeline.md) — the run that produces every one of these files
- [packaged-smoke-test.md](packaged-smoke-test.md) — the test the installer must pass before it is published
- [code-names.md](code-names.md) — where the attached photograph comes from
- [../troubleshooting/packaging-schema-drift.md](../troubleshooting/packaging-schema-drift.md) — the signing-adjacent property that fails the build on sight
