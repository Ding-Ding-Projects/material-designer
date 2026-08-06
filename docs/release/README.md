# Release

How a release is produced, what proves it works, and what each published file is.

## Files in this category

| File | What it covers |
| --- | --- |
| [release-pipeline.md](release-pipeline.md) | The whole run, step by step: the line-ending guard, port verification inside the release job, install, typecheck, the Windows-only identity suites, the installer build with its explicit existence check, the smoke test, the notes, and publication. **Start here.** |
| [packaged-smoke-test.md](packaged-smoke-test.md) | The only step that checks the product works: it installs the built installer, launches it, makes the running process answer its own health endpoint, screenshots it, uninstalls it and asserts zero residue. Assertion by assertion — and an explicit list of what it does *not* prove. |
| [automatic-updates.md](automatic-updates.md) | The Windows Squirrel feed, background download, checksum verification, explicit restart action, configuration, failure modes and verification boundary. |
| [line-count.md](line-count.md) | How the published figure is produced by a committed script at the released commit, what its two scopes and three totals mean, how authorship is attributed per surviving line, and why nobody ever counts by hand. |
| [code-names.md](code-names.md) | How the dim sum code name is chosen from the bundled catalogue, why the spent dishes are read out of prior releases rather than a counter, why a dish is spent exactly once, and why a missing dish never blocks a release. |
| [release-assets.md](release-assets.md) | What each attached file is, which uploads go to the run rather than the release, and what is deliberately absent — no signature and no non-Windows artifacts. |

## Status

> [!IMPORTANT]
> **Releases exist.** The latest verified legacy release is `v0.16.1-r71.1`,
> published as **Bamboo Shoot Har Gow · 筍尖蝦餃** by [run 30957484333](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/30957484333).
> It carried the installer, portable archive, checksum and dim sum photo; the
> packaged smoke test installed the built application, launched it, had the
> running process answer its own health endpoint, and uninstalled it without
> residue.
>
> **What that does not mean.** A green smoke test proves the artifact is a working
> application. It does not prove the application is finished: the Cantonese
> locale, the tone sliders, the in-app regex builder, the startup surprise and the
> changelog viewer are **not in the application** — the documentation site
> demonstrates them, the app does not have them yet. See
> [../standards/](../standards/) for the honest per-standard position.

## The short version

| Question | Answer |
| --- | --- |
| What triggers a release? | Every push to the default branch, plus manual dispatch with two inputs. |
| Where does it build? | One dedicated self-hosted Windows runner labelled `self-hosted, windows, material-designer`, from clean checkout to publication. |
| What is the tag? | `v<version>-r<run number>.<run attempt>` — unique and monotonic without a counter to maintain. |
| What must pass first? | Port verification, the pinned Node 24/pnpm 10.33.2 setup check, the frozen-lockfile install, typecheck, the Windows identity suites, payload validation, an explicit installer-path existence check, and the packaged smoke test. |
| What gets published? | Squirrel.Windows `Setup.exe`, `RELEASES`, full/delta `.nupkg` packages, `metadata.json`, a SHA-256 file, a portable archive when one was built, and the code name's photograph. |
| How does the app update? | Packaged stable Windows builds read the project-owned `metadata.json` feed, download `Setup.exe` in the background, and wait for **Restart to install update**. |
| Is it signed? | No. The notes say so, because an unsigned installer triggers the operating system's reputation screen. |
| Who counts the lines? | The run does, using a committed script, at the released commit. Never a person. |
| Can a missing code name block a release? | No. The picker exits cleanly with none and the release ships with its version alone. |

## The one rule everything here serves

**The artifact a user downloads must be the artifact the passing run built, at the
commit it claims.** Every structural decision in this category follows from that:
one run rather than several, an explicit existence check on the reported installer
path, a smoke test that asserts the running application's version matches the run's
version, a line count measured at the released commit, and a hard prohibition on
attaching anything produced outside the publishing run.

## Suggested reading

- [../build/ci.md](../build/ci.md) — the three workflows as a set, including the fast gate a release deliberately does not depend on
- [../architecture/packaged-runtime.md](../architecture/packaged-runtime.md) — what is inside the thing being installed
- [../troubleshooting/README.md](../troubleshooting/README.md) — the failures hit on the way to a working pipeline
- [../standards/releases.md](../standards/releases.md) — the release requirements stated as standards, with their conformance status
