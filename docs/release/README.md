# Release

How a release is produced, what proves it works, and what each published file is.

## Files in this category

| File | What it covers |
| --- | --- |
| [release-pipeline.md](release-pipeline.md) | The whole run, step by step: checkout, dependency bootstrap, packaging, evidence, notes and publication. Local smoke testing is documented separately and is not an Actions gate. **Start here.** |
| [packaged-smoke-test.md](packaged-smoke-test.md) | The local/manual step that checks the product works: it installs the built installer, launches it, makes the running process answer its own health endpoint, captures it, uninstalls it and asserts zero residue. Assertion by assertion — and an explicit list of what it does *not* prove. |
| [automatic-updates.md](automatic-updates.md) | The Windows Squirrel feed, background download, checksum verification, explicit restart action, configuration, failure modes and verification boundary. |
| [line-count.md](line-count.md) | How the published figure is produced by a committed script at the released commit, what its two scopes and three totals mean, how authorship is attributed per surviving line, and why nobody ever counts by hand. |
| [code-names.md](code-names.md) | How the dim sum code name is chosen from the public catalogue, how historic code-name text maps back to ids, and why the unresolved photo policy blocks publication. |
| [release-assets.md](release-assets.md) | What each attached file is, which uploads go to the run rather than the release, and what is deliberately absent — no signature and no non-Windows artifacts. |
| [status-hub.md](../standards/status-hub.md) | The evidence-backed status surface used to report release, verification, and publication state without claiming delivery before acknowledgement. |

> [!IMPORTANT]
> **Release-integrity update, 2026-08-27.** The selector and verification path
> now uses exhaustive public release pagination, strict catalog and output bounds,
> exact prior-release markers, and link-only image verification. The required
> downloadable-photo row remains explicitly blocked because the public no-copy
> rule forbids attaching copied catalog bytes. No release is claimed from that
> blocked state.

## Status

> [!WARNING]
> The current release path is not yet re-proven by a replacement hosted run. The exact-SHA runs at the older
> `887d5a06` commit were queued before the workflow repair and do not prove a
> green result for local candidate `0d6e47c7`. The
> local candidate installer was built and verified unsigned, but publication is
> intentionally held because the earlier workflow did not yet retain enough
> the unresolved mandatory downloadable-photo requirement. The repaired path now
> sanitizes its packaging evidence and stops before publication rather than
> attaching a prohibited grandfathered image.

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
| Where does it build? | The pinned hosted `windows-2022` image, from clean checkout to publication. |
| What is the tag? | `v<version>-r<run number>.<run attempt>` — unique and monotonic without a counter to maintain. |
| What must pass first? | Dependency bootstrap, frozen-lockfile install, packaging, payload validation, the explicit installer-path check, unsigned-artifact evidence and publication verification. Tests, lint, typecheck, static analysis and screenshot checks run only locally/manual and never gate Actions. |
| What gets published? | Nothing from the repaired path until the mandatory downloadable-photo conflict is resolved. The candidate would carry Squirrel.Windows assets, the sanitized `installer-build.log`, and the public code-name photo link, but it must not attach a grandfathered local image. |
| How does the app update? | Packaged stable Windows builds read the project-owned `metadata.json` feed, download `Setup.exe` in the background, and wait for **Restart to install update**. |
| Is it signed? | No. The notes say so, because an unsigned installer triggers the operating system's reputation screen. |
| Who counts the lines? | The run does, using a committed script, at the released commit. Never a person. |
| What happens when the mandatory photo cannot be supplied? | Publication stops before release creation. The workflow keeps the public photo as a link and attaches no grandfathered local image while the policy conflict remains unresolved. |

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
