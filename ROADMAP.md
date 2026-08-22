# Roadmap

> [!IMPORTANT]
> **Release-shutdown status — 2026-08-11.** The local `main` and `origin/main` now match
> [`e99f40de`](https://github.com/Ding-Ding-Projects/material-designer/commit/e99f40debb20de1ee7029e5c3106bf50e23489db).
> The pure port verifier has a recorded zero-gap result. Exact-SHA Verify
> (`31480515255`) and Pages (`31480515281`) are green. Release (`31480515300`)
> built the unsigned Squirrel payload, then failed closed at the explicit dim-sum
> photo-policy conflict before publication; no new release exists.

The contradictory dim-sum image rules remain unresolved as a durable standard,
but the repository owner explicitly directed the current release to skip the
photo for now. The workflow records the temporary omission and attaches no
copied catalog image; the exception does not relax any package, unsigned,
provenance, target-SHA, asset-hash or publication-verification requirement.

The honest burn-down between where this repository is today and full conformance
with the project's standards.

- [x] **Advance and reconcile the upstream Open Design baseline.** The pinned
      submodule and manifest now identify `393af2f99` / v0.20.2, with 12,835
      upstream files. Exact-byte verification is green after preserving and
      three-way merging every declared product path touched upstream.
- [x] **Add explicit website and desktop-application handoff ZIPs.** Website
      project archives already carry `DESIGN-HANDOFF.md` and
      `DESIGN-MANIFEST.json`; the new desktop target adds a sandboxed source
      scaffold for coding agents without presenting it as an installer. The
      website action now requests the complete project root, while reserved
      generated paths, non-HTML scaffold inputs, network/out-of-root requests,
      secondary windows and case-only extraction collisions fail closed.
- [x] **Repair Download routing and narrow action geometry at source level.** A
      queued Markdown Download opens its real export menu, and narrow action
      rows compact labelled controls while retaining accessible names. Hosted
      interaction and high-scale capture evidence remains pending.

- [x] **Repair installed Squirrel startup identity and runtime roots.** Commit
      [`cb03705b`](https://github.com/Ding-Ding-Projects/material-designer/commit/cb03705b)
      removes the CI host's absolute namespace root from installed config and
      creates product-named shortcuts targeting the Squirrel root launcher.
      Signing remains prohibited and disabled. Hosted package/build verification
      is still required for the new commit before this becomes release evidence.
- [x] **Replace the tree-only Windows folder picker with the full Explorer
      browser.** The daemon fallback now carries address/breadcrumb navigation,
      search, sidebar locations, folder contents/details and new-folder support,
      with exact folder-only `FileOk` validation. Built-artifact interaction proof
      remains pending the hosted package containing `cb03705b`.

- [x] **Keep chat context project-wide across tab and file switches.** Commit
      [`8129ac77`](https://github.com/Ding-Ding-Projects/material-designer/commit/8129ac77)
      removes implicit primary-file/Design Files preview selection and binds the
      automatic context to the project. Follow-up
      [`d88178c5`](https://github.com/Ding-Ding-Projects/material-designer/commit/d88178c5)
      removes the remaining active-file attachment path; narrower evidence now
      reaches a send only through an explicit user action.

- [ ] **Expose the production Library destination and field-owned search.**
      Source commit [`e4fcbfab1`](https://github.com/Ding-Ding-Projects/material-designer/commit/e4fcbfab1680cde38235d663bb21f499d2d998d0)
      enables `/library` through the real `LibrarySection`, adds the persistent
      rail destination and analytics route, and gives the Library search its own
      anchored bounded regex builder with an accessible result count. The same
      route's repair in [`06e45980d`](https://github.com/Ding-Ding-Projects/material-designer/commit/06e45980d892f493d0915dd75e0949a7022661de)
      now adds complete bounded continuation, typed retryable
      provider failures, reconciliation SSE, independent filter/menu/picker
      builders, visible-only bulk selection, collapsed-rail reachability, shared
      modal focus scopes, pending-upload protection, and localized copy. Source
      contracts and the pure port verifier are in the lane; hosted tests,
      built-app interaction, runtime captures, and a deterministic provider/API-
      backed public-safe fixture remain unverified. Photo/release work is
      intentionally outside this lane.

      Follow-up source commit [`30bc9566c`](https://github.com/Ding-Ding-Projects/material-designer/commit/30bc9566c36351020c8225bf8cc8830d10727ba1)
      tightens terminal cursor parsing, aborts stale page walks, keeps image and
      HTML element captures together, corrects nested menu/listbox ownership,
      changes picker kind chips to an `aria-pressed` group, and reports real,
      byte-weighted cancellable upload progress with partial outcomes. This
      remains unchecked until hosted source checks and built-runtime evidence
      exist; no photo or release asset was added.

      The final boundary repair adds exact cursor advancement, immutable delete
      previews, abortable SSE merges, post-unmount upload suppression, stable
      localized upload error codes, portal-aware dialog focus, measured filter
      geometry, and 48×48 interaction targets. These remain source-only until
      the hosted and installed evidence exists, so this item stays unticked.

      Follow-up source commit [`a881a525f`](https://github.com/Ding-Ding-Projects/material-designer/commit/a881a525f)
      closes the remaining accepted Library gaps: point-in-time keyset snapshots,
      bounded refresh/hydration/delete workers, primary-unlink preservation and
      sidecar residue reporting, structured picker outcomes with retry-preserved
      selection, visible-projection preview navigation, current-batch upload
      counts, measured handoff-menu placement, focus-leave behavior, and the
      remaining 48px/busy/live-status boundaries. The source verifier is green;
      hosted tests, built-app interaction, runtime captures, and CI evidence are
      still pending, so the roadmap item remains unticked.
- [ ] **Converge the shared shell chrome at source level.** The isolated
      `codex/app-shell-chrome` lane makes the title bar, 42px tab strip, body
      and 28px status bar explicit rows; removes the rail's inline 236px
      override; repairs malformed rail and tab CSS; keeps one icon plus one
      label per rail destination; removes the competing Ctrl/Cmd+K route; adds
      the localized status version segment; and gives tab movement one bounded
      field-owned searchable picker. The source guard and port verifier remain
      the only lane evidence until hosted builds, keyboard checks and the
      light/dark narrow/high-scale capture matrix run.

Most of what is here is not done. This document exists so that the size of the
remaining work is visible rather than implied, and so no reader mistakes an
imported upstream tree for a shipping product.

> [!IMPORTANT]
> **Read this before the checkboxes below — several of them are behind the
> tree.** Sections written before 2026-08-04 describe Phases 3 and 4 as
> unstarted. They are not: the Cantonese locale, both funny sliders, the regex
> builder, the command palette, the changelog viewer, the dim sum surprise, tab
> pinning, the notification centre, the confirmation gate, bulk actions and the
> narrator are all on `main`, and as of `v0.16.1-r18.1` they are in a build a
> person can download. The **conformance matrix at the foot of this file was
> rewritten on 2026-08-04 and is the current reading**; where it disagrees with
> a phase section above it, believe the matrix.
>
> **Three cautions carry into every section below.**
>
> 1. **A module that nothing mounts is not a shipped feature.** An audit on
>    2026-08-04 found three written, typechecking, entirely unreachable: the
>    appearance editor, its infinite colour picker, and the whole spoken
>    narrator. The narrator is now wired; the other two are not. Judge a
>    surface by whether a user can open it, never by whether its files exist.
> 2. **Passing a gate is not the same as the gate working, but one gate has now
>    been watched biting.** A deliberately poisoned branch made the port
>    verifier go red exactly as designed
>    ([run 30864702696](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/30864702696)),
>    so its green ticks now mean something. The Pages bundle gate has still
>    only ever been watched passing.
> 3. **Nobody has audited the running interface.** One capture has finally been
>    *looked at* — it caught the window chrome carrying the upstream brand —
>    but nothing has been checked at a second display scale, at a narrow width,
>    or in a second language. No claim below about how anything renders is
>    evidence of anything.
>
> **2026-08-06 UI repair checkpoint.** Commit
> [`34426621`](https://github.com/Ding-Ding-Projects/material-designer/commit/34426621)
> adds viewport-bounded settings overflow placement, onboarding dropdown focus
> restoration and field-plus-value names, and a 48px command-palette size target.
> [`ec2c76d7`](https://github.com/Ding-Ding-Projects/material-designer/commit/ec2c76d7)
> adds the stacking, regex-builder focus-scope, stale-anchor and test-isolation
> follow-up. These are focused source contracts only; the installed-build,
> display-scale and bilingual runtime matrix remains open.

> **2026-08-06 updater/release checkpoint.** Commit
> [`6f4015b8`](https://github.com/Ding-Ding-Projects/material-designer/commit/6f4015b8)
> keeps release-note links exact in update surfaces. Commit
> [`6daae310`](https://github.com/Ding-Ding-Projects/material-designer/commit/6daae310)
> requires intentionally unsigned Squirrel output (`NotSigned`), successful
> packaged smoke and unique UI-state evidence before publication, and declares the custom self-hosted runner label
> for `actionlint`. Release runs 31152036272 and 31152251945 both failed before
> checkout because the Windows shell command was resolved through WSL first and
> then through a malformed quoted Git-for-Windows path. Commit
> [64ef401](https://github.com/Ding-Ding-Projects/material-designer/commit/64ef401818d453ea87161c62fcb4997632ccc158)
> uses the runner's space-free Git-for-Windows path; a new labelled-runner
> verdict is still required.
> Release run 31152929139 reached checkout and then failed at the automatic
> utility bootstrap because the runner has no pwsh command. Commit
> [993f86a](https://github.com/Ding-Ding-Projects/material-designer/commit/993f86ad3540333d55f3a4b2e4f92dbb0346aabd)
> switches the job to powershell.exe and keeps the bootstrap script compatible
> with that engine; another labelled-runner verdict is still required.
> Release run 31153286001 reached checkout and then failed while Windows
> PowerShell loaded the generated step: its execution policy rejected the
> unsigned temporary script before the bootstrap body ran. Commit
> [129cb90](https://github.com/Ding-Ding-Projects/material-designer/commit/129cb90120c5b57b1e644f0ba0a142b1fea86c2b)
> moves the per-process Bypass switch onto the shell template; another
> labelled-runner verdict is still required.
> Release run 31153486526 passed tool bootstrap, the byte-exact verifier, pnpm
> and Node setup, then failed in actions/setup-python because its unsigned
> temporary setup.ps1 was rejected by the runner's AllSigned policy. Commit
> [511c452](https://github.com/Ding-Ding-Projects/material-designer/commit/511c4526535031791fe9ead0e4127ed6c7431dcd)
> replaces that action with a pinned, hash-checked Python bootstrap; another
> labelled-runner verdict is still required.
> Release run 31154123479 reached the first Python bootstrap after setup,
> checkout, the byte-exact verifier, pnpm and Node. The verified archive
> contained `python-3.12.10-amd64.exe` and `setup.ps1`, so the initial archive
> scan could not find `python.exe` and no package was attempted. Commit
> [c45e243](https://github.com/Ding-Ding-Projects/material-designer/commit/c45e243da8001435b4fafd8eeb03659ecb195fb7)
> now invokes the archive's installer directly with `InstallAllUsers=0` and
> verifies the resulting interpreter; another labelled-runner verdict is
> still required.
> Release run 31154520542 reached the direct installer, but Windows PowerShell
> left `$LASTEXITCODE` empty and the null comparison stopped the job before
> interpreter discovery. Commit
> [9dcdb2f](https://github.com/Ding-Ding-Projects/material-designer/commit/9dcdb2f31de96dd54e7425066ef6cecb4761f65d)
> now waits for the installer process, validates its explicit exit code, and
> then checks `python.exe`; another labelled-runner verdict is still required.
> Release run 31154756724 reached the direct installer and returned
> `-2147024891` (`0x80070005`, access denied) for the self-hosted runner service
> account. The next repair switches to the official Python 3.12.10 embeddable
> archive, verifies its SHA-256 and extracts it without registry or installer
> operations. Commit
> [37534e5](https://github.com/Ding-Ding-Projects/material-designer/commit/37534e58ccbe28fdef6a3010a845d9bd46db9ced)
> carries that path; another labelled-runner verdict is still required.
> Release run 31155063471 passed the portable Python bootstrap and frozen
> dependency installation, then failed at Typecheck with 10 existing `apps/web`
> errors: a missing `isMacPlatform` import, strict indexed focus access in three
> dialogs, and an unsupported HTML artifact fixture. Commit
> [a769c35](https://github.com/Ding-Ding-Projects/material-designer/commit/a769c35609254e6e4dc71daddf4be076cad396b2)
> repairs those files and declares the design-copy paths; another
> labelled-runner verdict is still required.
> Release run 31155747324 then passed the repaired web Typecheck and failed one
> Windows pack source-contract assertion after 125 tests passed and 1 was skipped.
> Commit [0357266](https://github.com/Ding-Ding-Projects/material-designer/commit/0357266f1e529c87da5988b4c2d1ecd3128192f9)
> updates the assertion to the escaped Squirrel artifact template; another
> labelled-runner verdict is required before packaging or publication is claimed.
> Release run 31156822158 then passed the repaired Typecheck and Windows identity
> tests but failed during Squirrel packaging: the log recorded repeated
> `signing with signtool.exe` lines and Squirrel reported `Authors is required.`
> Commit [6911c62](https://github.com/Ding-Ding-Projects/material-designer/commit/6911c6235917cb59d2fcf2a31e6041aad9c81488)
> supplies the top-level package author and explicit `win.sign: false` and
> `verifyUpdateCodeSignature: false` controls; a replacement run must prove that
> no signer runs and that the unsigned Squirrel artifacts, smoke test and release
> publication complete.
> Release run 31158740651 then passed the repaired Typecheck and Windows identity
> tests but stopped at electron-builder schema validation because version 26.8.1
> rejects the unknown `win.sign` property. Commit
> [e768b5b](https://github.com/Ding-Ding-Projects/material-designer/commit/e768b5bef5a308a93747ef0c60e01881baef5ce0)
> switches to the supported `signAndEditExecutable: false` control and adds a
> release-contract assertion; a replacement run must prove the packer accepts the
> configuration before publication is claimed.

---

## How to read this

| Marker | Meaning |
| --- | --- |
| `[x]` | Done, and verified by evidence named on the line |
| `[~]` | **Genuinely partial**, in one of two ways: the machinery is committed but has produced no result, or part of the item has landed and the line says exactly which part has not |
| `[ ]` | Not started |

The middle marker is load-bearing and is not a softer `[x]`. A workflow that would
build an installer is not an installer; a committed counter is not a published
line count; a token defined is not a token consumed. Everything marked `[~]`
becomes `[x]` when — and only when — the line can name the run, the artifact, the
output or the commit that closed the remaining part. A `[~]` line that does not
say what is missing is a defect in this document.

Items are ordered by dependency, not by importance: an item near the top is
usually one that other items cannot begin without.

Two constraints shape every phase and are repeated here because they change what
"do the work" means:

1. **All installation, building, testing, and running happens in continuous
   integration on the labelled self-hosted runners.** Windows packaging uses
   `[self-hosted, windows, material-designer]`; Linux verification uses
   `[self-hosted, linux, material-designer]`. The development machine does not
   run the toolchain. This means nearly every item below is finished by a CI run
   producing evidence, not by a local check.
2. **`design/` is a byte-verbatim copy of the upstream project and must stay
   that way unless a change is declared.** Any edit to a file under `design/`
   requires a matching allowlist entry in `MODIFICATIONS.md`, or verification
   fails. Most of the work below touches `design/`, so most of the work below
   also adds entries to that file. Budget for it.

---

## Where the project stands today

A verbatim import of an upstream local-first design tool, a Material Design 3
mockup describing the intended redesign of its interface, a verifier that proves
the import has not drifted, a rebrand being written on top of it, and the
scaffolding around all of that — three workflows, the governance documents, a
categorized documentation set, a bundled dish catalogue and a static site source.
Historical runs have built two Windows installers and published them under
their own tags, and the documentation site is deployed. The current main
Release run 31158740651 passed the portable toolchain, frozen dependency
installation, web Typecheck and Windows identity tests but failed during
electron-builder schema validation; the next run must prove the supported
unsigned builder repair before a new release is claimed. The port
verifier still reports zero gaps on a clean checkout, and the earlier packaged
smoke evidence remains historical.

That is the machinery working, and it is worth separating from the product. What
those runs prove is that this project can build and ship the imported application
under its own identity. They prove almost nothing about the redesign, which has a
token layer and a Windows title bar and no rewritten components — Phase 2 onward
is still the great majority of the work in this document.

<details>
<summary><strong>What actually exists right now</strong> — tracked files, verifier output, and what is still provably absent</summary>

**Outside `design/`**, the repository holds: `.gitattributes`, `.gitmodules`,
`MODIFICATIONS.md`, the governance set (`README.md`, `AGENTS.md`, `ROADMAP.md`,
`HANDOFF.md`), three workflows under `.github/workflows/` (`verify.yml`,
`release.yml`, `pages.yml`), five scripts under `scripts/` (`verify-port.sh`,
`upstream-manifest.tsv`, `line-count.mjs`, `import-dim-sum.sh`,
`release-codename.sh`), the bundled dish catalogue under `assets/dim-sum/`, the
categorized documentation under `docs/`, the static site source under `site/`,
the five files of `mockups/open-design-m3/`, and the pinned `vendor/open-design`
submodule. There is still no root `package.json` — the workspace root is
`design/`.

Do not treat that paragraph as a manifest. Run
`git ls-files | grep -v '^design/'` for the authoritative list; some of those
paths are still untracked working files at the time of writing.

**Verifier output.** `scripts/verify-port.sh --json` prints one line with every
counter it used, and at the time of writing it exits **0**: the import has not
drifted and every rebrand change under `design/` carries an allowlist entry. What
moves is `declared`, which grows each time the rebrand reaches another file; what
must not move is `gaps`, which is the pass/fail counter. An edit landing without
its allowlist path turns the run red immediately — that is the mechanism working,
not a defect in the port. **Run the script for the current numbers**; the only
pasted transcript in the repository lives in
[`docs/porting/verification.md`](docs/porting/verification.md), so figures do not
go stale in five places at once.

**Still provably absent:** `CONTRIBUTING.md`, `LICENSE` at the repository root,
`SECURITY.md` and `CODE_OF_CONDUCT.md` — four files, none of which exists. Also
absent from the *application*: the Cantonese locale, the two funny-level sliders,
the in-app regex builder, the startup dish surprise and the changelog viewer. The
documentation site demonstrates all five; the installed build carries none of
them, and the difference between those two sentences is the one this document
exists to keep visible.

**No longer absent, and worth naming because earlier revisions of this file said
otherwise:** installers, releases, observed workflow runs, a published line count
and a published documentation site all exist, and `CHANGELOG.md` sits at the
repository root. The machinery that produced them — the counter, the code-name
picker, the catalogue, the site source, the workflows — was committed well before
any of it ran, and the gap between "the machinery is committed" and "the machinery
has produced a result" is exactly the distinction the rest of this document
depends on. It is now closed for Phase 1 and wide open for everything after it.

**A trap worth naming early:** `design/.github/workflows/` contains 48 workflow
files inherited from upstream. Continuous integration only reads
`.github/workflows/` at the *repository root*, so all 48 are inert here. A reader
glancing at the tree will assume those are this project's CI. They are not; the
three at the root are.

</details>

---

## Phase 0 — Import and provenance

**Done means:** the upstream tree is present, its provenance is recorded, and
any future drift from it is mechanically detectable rather than a matter of
trust.

- [x] **Toolchain pinned.** Runtime and package-manager versions are fixed by
      the imported tree's own `engines`, `packageManager`, `.node-version`, and
      tool-version files.
      *Verified by:* reading the pinned files; not yet exercised by an install.
- [x] **Mockup relocated to `mockups/`.** The Material Design 3 design-canvas
      document, its runtime script, thumbnail, and two brand assets are tracked
      under `mockups/open-design-m3/`, separate from the imported code and wired
      into no build.
      *Verified by:* `git ls-files` — five tracked files.
- [x] **Verbatim port of 11,799 files.** `design/` matches the pinned upstream
      commit exactly, file modes included.
      *Verified by:* `scripts/verify-port.sh --json`, output quoted above.
- [x] **`scripts/verify-port.sh` written, with `MODIFICATIONS.md` as an enforced
      allowlist.** The notice file and the code cannot drift apart, because the
      verifier reads the notice as its list of permitted differences: an
      undeclared change fails, and a declaration for a file that no longer
      differs also fails. Pure Git and shell — it needs no package manager, so
      it is the one check that can run anywhere.
      *Verified by:* self-test against six classes of gap — missing file,
      differing bytes, mode mismatch, blob-id mismatch, extra untracked file,
      and stale allowlist entry.

**Still true and worth stating:** Phase 0 proves the import is faithful. It
proves nothing about whether the imported code builds, runs, or works.

---

## Phase 1 — Make it buildable, releasable, and governed

Nothing after this phase can be verified until this phase exists, because
verification means "a CI run produced this evidence" and there is currently no
CI. This is the critical path.

**Done means:** a push produces a Windows installer that a person can download
and install, published as a release with honest notes; the repository explains
itself to a first-time reader; and the documentation site is live.

**Verified by:** a recorded CI run link with a green result, an installer asset
attached to a published release, and the site reachable at its published URL.
Not by a local build — local builds do not happen here.

### 1.1 Continuous integration

- [x] **Create the root `.github/workflows/` directory.** It holds three
      workflows written for this project — `verify.yml` (*Verify*),
      `release.yml` (*Release*) and `pages.yml` (*Pages*). The 48 upstream
      workflow files under `design/` stay where they are and stay inert; they
      were not a starting point, because they assume upstream's secrets,
      environments, and release targets.
      *Verified by:* all three having run — *Verify* on a clean checkout,
      *Release* through to publication, *Pages* through to deployment.
- [~] **Install job on the labelled self-hosted Windows runner.** `release.yml`
      now selects `[self-hosted, windows, material-designer]`, installs pnpm
      10.33.2, Node 24 and Python 3.12 through setup actions, exposes the x64
      MSVC/Windows SDK toolchain for native compilation, verifies the versions, cleans
      the checkout, and resolves the workspace with `pnpm install
      --frozen-lockfile`. The install compiles a native SQLite binding from
      source because no prebuilt binary exists for this platform/runtime pair.
      Before that dependency install, the job runs the committed Windows
      bootstrap for `gh`, `jq` and `7z`, placing missing tools in a
      user-scoped runner cache rather than assuming machine state. The Linux
      Verify and Pages jobs use the matching `gh`/`jq` bootstrap.
      *Verified before this migration:* the same install completed on the old
      hosted Windows runner. The first labelled run reached dependency resolution
      but then failed in the packer's post-install typecheck at
      `src/win/lifecycle.ts:473` because a legacy timing label was passed as an
      unsupported NSIS action ([Release 31127492852](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31127492852)).
      Commit [5d66600](https://github.com/Ding-Ding-Projects/material-designer/commit/5d66600)
      corrects that call site; another labelled run is still required.
- [~] **Bootstrap the non-language CI tools automatically.** The committed
      `scripts/bootstrap-ci-tools.sh` and `scripts/bootstrap-ci-tools.ps1`
      validate cached `gh`, `jq` and `7z` versions, download pinned official
      releases when a cache entry is absent or wrong, serialize cache updates,
      verify the pinned SHA-256 package hashes, add the user-scoped cache
      through `GITHUB_PATH`, and fail closed if a required command or version
      is still unavailable. The scripts passed local syntax checks; their
      labelled-runner execution remains pending because no new CI run has been
      observed for this branch.
- [x] **Set the working directory to `design/`.** Every install, typecheck, test
      and build step in `release.yml` carries `working-directory: design`,
      because the repository root has no `package.json`. This is the single most
      likely cause of a first CI attempt failing for a reason that has nothing to
      do with the code, which is why it is written down rather than assumed.
      *Verified by:* every one of those steps running from that directory without
      a path failure. The prediction was never tested the hard way, because it was
      written down before the first attempt rather than after it.
- [~] **Run the port verifier in CI, with line endings forced to LF.**
      `verify.yml` runs `scripts/verify-port.sh` on
      `[self-hosted, linux, material-designer]`, on every push and manual
      dispatch. It deliberately has no pull-request trigger because this public
      repository does not execute untrusted code on a self-hosted runner. The Linux runner is the
      line-ending answer: the verifier hashes on-disk bytes, and a Windows
      checkout that converts line endings would report thousands of spurious
      differences on a tree that is perfectly fine. The committed
      `scripts/upstream-manifest.tsv` is the fallback when the pinned submodule
      is not checked out, so a missing submodule no longer exits early.
      *Verified before this migration:* the gate passed on a clean Linux checkout
      at 11,799 files and zero gaps — **and was watched failing**, which was the outstanding
      half of this item. It did not need a contrived test in the end: several
      agents editing `design/` in parallel produced exactly the situation the
      gate exists for, and it named all nine before any of them were documented:

      ```
      verify-port: 9 gap(s); first 50:
      bytes-differ	apps/web/src/components/LibrarySection.module.css
      bytes-differ	packages/components/src/dialog.module.css
      untracked	apps/web/tests/styles/overlay-surfaces.test.ts
      …
      ```

      It distinguishes `bytes-differ` (an upstream file edited) from `untracked`
      (a file added that upstream does not have), which is the distinction that
      makes the output actionable rather than merely alarming. Each cleared as
      its `MODIFICATIONS.md` entry landed, returning the tree to zero gaps.

      The **line-ending** reasoning specifically remains an argument rather than
      a demonstrated result: no Windows checkout has been run through the
      verifier to watch it report thousands of spurious differences. That is now
      the only untested half, and it is deliberately untested — proving it means
      running the gate somewhere it is designed not to run.
- [x] **Typecheck and lint.** All four now run, in `verify.yml` on Linux rather
      than only inside the Windows packaging job — a type error is the cheapest
      failure to find and the most expensive to find late. `pnpm guard`,
      `pnpm lint:craft` and `pnpm i18n:check` are separate commands sharing one
      install, so a failure names which of the three it was. None of them is
      wired with `|| true`: a check that is ignored is worse than one that is
      absent, because the green tick then means less across the whole job.
- [x] **Prebuild the three packages the tests depend on** — the daemon, the
      desktop main process, and the web sidecar bundle. The third was the one
      missing: `apps/packaged` imports `@open-design/web/sidecar`, which resolves
      to `dist/`, so without it the packaged suite died at import time and the
      error named a module rather than a cause.
- [x] **Run the test suites per package.** `verify.yml` runs the product-identity
      three (packaging tool, packaged launcher, desktop shell), the shared
      component primitives, and the web application's own suite. There is
      deliberately no aggregate test command in the imported tree and one must
      not be added; the workspace convention is package-scoped invocation.
      *Still open:* the daemon suite, which is the largest remaining gap. It
      disables file parallelism because its tests bind real local servers, so it
      is slow by design and needs its own job rather than a step appended to
      this one.
- [x] **Report test counts per package in the job summary**, so a regression in
      coverage is visible without opening logs. `verify.yml` tees each suite to
      its own log and reports files, tests and result per package, plus a total.
      A package that never started reports `did not run` rather than `0` —
      those mean very different things and a zero would read as catastrophic
      rather than absent. The counts are read from what each suite actually
      printed, never from a figure recorded anywhere else.
      *Verified by:* parsing real colourised vitest output, passing and failing,
      before the step was trusted — the escape codes sit between the line start
      and the word, so an anchored pattern matches `Test Files` and silently
      misses `Tests`, producing a summary that looks complete and is missing a
      column.
- [x] **Build the legacy Windows installer.** `release.yml` built the previous
      packaging target and uploaded the result as a workflow artifact even when a
      later step failed, so a bad run still left something to inspect.
      *Verified by:* two installers built and attached to their own releases, each
      with an explicit existence check on the reported path and its payload
      validated before the run continued.
- [~] **Switch Windows packaging and updates to Squirrel.Windows.** The product-owned
      manual and hosted entry points now request only `--to squirrel`; they no
      longer request the aggregate/portable target or stage a portable ZIP as an
      alternate installer. Commit [`8129ac77`](https://github.com/Ding-Ding-Projects/material-designer/commit/8129ac77)
      adds exact `RELEASES` row validation, package identity/entry checks,
      signer-process provenance and installed-runtime receipt validation. The packer,
      feed, lifecycle switches and explicit restart action are committed. The
      restart path now waits for renderer save preparation before requesting
      quit, and a failed or timed-out preparation blocks even a forced restart.
      The barrier covers sketch, Markdown and HTML writes; switching files keeps
      the previous renderer's final save registered until it settles. Squirrel's
      deferred helper requires a one-shot authorization marker, revokes pending
      markers during clear-cache, re-arms safely after a cold start, and leaves
      a failed installer handoff retryable. A new labelled self-hosted Release
      run still must prove the Squirrel install/start/uninstall path and publish
      the first post-migration feed ([`b5f0db6`](https://github.com/Ding-Ding-Projects/material-designer/commit/b5f0db63b8d2ed1d1d8a52b0ca1b463e65e30830)). The first labelled
      Release run was red before packaging at the legacy NSIS action typecheck;
      [5d66600](https://github.com/Ding-Ding-Projects/material-designer/commit/5d66600)
      fixes that compile blocker, but the Squirrel install/start/uninstall path
      and post-migration feed remain unverified.
- [ ] **Capture the ten-screen design-parity inventory.** The direct reference
      application, route registry, explicit rows and red/green completeness guard
      landed in [`8129ac77`](https://github.com/Ding-Ding-Projects/material-designer/commit/8129ac77).
      The v0.20.2 migration found the reference hash stale, the Studio selector
      unreachable, renderer zoom incorrectly standing in for device scale, and
      time/random/motion/font/network inputs outside tuple equality. The version-2
      registry and inventory correct those static boundaries and now fail closed on
      the missing installed-application route. Every row remains pending until that
      route exists and both sides are captured at identical tuples, including the
      light/dark, normal/narrow, 100/125/150/200% and bilingual matrix, with immutable
      receipts, labelled comparisons, visual diffs and per-control reviews.
- [x] **Allow the current Squirrel release to omit its dim-sum photo.** This is
      a temporary owner-authorized exception, not a resolution of the two
      conflicting standards. The workflow emits a warning, states the omission
      in release notes, and does not copy or attach a catalog image.
- [x] **Publish exactly one release per successful run**, with a unique
      monotonic tag, the genuinely built installer attached, and no draft state.
      The publish step is gated on `success()`, so a run whose tests fail
      publishes nothing — that is correct. A run that publishes a release with no
      installer, or an installer it did not build, would not be.
      *Verified by:* `v0.16.1-r7.1` and `v0.16.1-r8.1`, each non-draft, each under
      a tag no earlier release used, each carrying the installer its own run
      built. **The gating half is unproved**: no run has failed, so nothing has
      demonstrated that a failing run publishes nothing.
- [x] **Keep every installer unsigned, and say so in the release notes.** Code
      signing is permanently prohibited. The generated notes say it outright:
      the installer is not code-signed, so the
      operating system's reputation prompt appears on first run, and its "run
      anyway" affordance is hidden behind a "more info" link. Users will hit
      this. Documenting it is not optional politeness; it is the difference
      between a confused user and an abandoned install.
      *Verified by:* both published releases carrying that warning in their notes,
      directly beneath the download instruction rather than buried at the bottom;
      the new workflow additionally requires `Get-AuthenticodeSignature` to report
      `NotSigned` before publication.
- [x] **Commit a line-count script and have CI run it at the released commit.**
      `scripts/line-count.mjs` is written, tracked, and invoked by both workflows
      (`release.yml` into the release notes, `verify.yml` into the job summary).
      It must break the count down by category — application source, tests, styles
      and markup — with both total and non-blank lines, and report authorship per
      *surviving* line rather than by summing additions, because churn is not
      authorship.
      *Verified by:* the published notes of both releases, each carrying a line
      table split by category and by subproject, measured at the released commit
      and stating the exact command to reproduce it.
- [x] **Enable authorship attribution in the release workflow.** Add `--blame`
      to the counter invocation, scoped with `--blame-paths` so it does not
      blame the 11,799-file vendored tree file by file.
      *Verified by:* the published notes carrying an authorship table attributed
      per surviving line, stating the rule used to classify a commit as
      agent-authored so the figure can be checked rather than taken on trust, and
      confirming the attributed total equals the counted line total for the same
      scope.
- [x] **Report the vendored tree as a separate, visible row.** The counter
      reports the imported `design/` tree separately from this repository's own
      code, prints excluded paths as visible rows with their own numbers rather
      than dropping them silently, and buckets every tracked file into exactly
      one row behind a mandatory catch-all. The 11,799 imported files are not
      this project's code, and folding them into a total would misrepresent the
      project by roughly two orders of magnitude.
      *Verified by:* the published notes, which give this repository's own code
      its own table and keep the imported tree visible beside it rather than
      silently dropping it or silently absorbing it.
- [x] **Make the counter's arithmetic agree with itself** before any figure is
      published. The script fails loudly when the authorship rows do not sum to
      the line rows, rather than printing two numbers that contradict each other.
      *Verified by:* the published authorship table stating that the attributed
      total equals the counted line total for the same scope — which is the check
      passing rather than merely being present.
- [x] **Assign each release a dim sum code name** drawn from a bundled catalog,
      in English and Traditional Chinese, used once per project and recorded so
      the mapping is auditable. The catalogue exists —
      `assets/dim-sum/index.json` declares 24 dishes and 24 PNGs are tracked
      under `assets/dim-sum/images/` — and `scripts/release-codename.sh` picks
      from it. A release must never be delayed for this: if no name can be
      resolved, ship with the version alone and say so.
      *Verified by:* the two published releases carrying **different** dishes,
      each named in English and Traditional Chinese with its photograph attached
      as a release asset. Spending a dish exactly once is the whole job of a code
      name, and two releases is the smallest sample that can show it working.

### 1.2 Governance documents

- [x] **`README.md`** — tabbed rather than scrolled: a compact index at the top
      (what this is, how to install, where the docs are), with long reference
      sections folded into collapsible blocks. It must state plainly that this
      is a rebranded fork, what a build has and has not verified, and what the
      upstream project's trademarks are.
      *Verified by:* `README.md` — a Contents table followed by `<details>`
      blocks for the layout, build, verification, privacy, standards and
      provenance sections; a Status section carrying a table of what each workflow
      actually did, with the download link for the current release beside it; and
      a Trademarks paragraph under Provenance. Every run outcome it claims is one
      that happened, and the five standards the application does not have yet are
      named there rather than left to be inferred.
- [x] **Carry the honest warnings into the README**, specifically: the unsigned
      installer's reputation prompt; the native compile requirement and its
      build-tools prerequisite; that native Windows support is best-effort
      upstream; the pinned runtime version, which cannot be substituted; and the
      telemetry position.
      *Verified by:* `README.md` — the SmartScreen warning callout under the
      Windows installer commands, the toolchain table naming the C++ build tools
      and Python for the native SQLite compile, the platform-support paragraph
      quoting upstream's best-effort position on native Windows, and the Node
      pin with upstream's own "No" to an earlier major.
- [x] **State the telemetry position precisely.** The upstream analytics code is
      present verbatim and every entry point is a no-op without a destination
      credential in the environment. Builds from this repository configure no
      such credential and therefore send nothing. Say exactly that — *"no key is
      configured here"* — and never *"telemetry was removed"*, which would be
      false, since the code paths are untouched.
      *Verified by:* `README.md` § Privacy and network defaults — "**No such key
      is configured anywhere in this repository**", followed by the explicit
      statement that the code paths are present and unmodified.
- [x] **Do not present upstream's links as this project's.** The imported
      README still carries upstream's website, chat invite, deploy button, and
      promotional banners. None of them belong to this project.
      *Verified by:* `README.md` § Privacy and network defaults — the "Upstream
      links" paragraph naming them as upstream's own channels, not this
      project's.
- [x] **`AGENTS.md`** — a sanitized mirror of the shared standards, stating the
      hard invariants, the sixteen standards, and the definition of done for work
      in this repository.
      *Verified by:* `AGENTS.md` — the repository-path table, the byte-verbatim
      and CI-only invariants, the sixteen standards, and a definition-of-done
      checklist that requires an actual CI verdict rather than a predicted one.
- [x] **`CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`.** *Added at
      `230b115`.* All three exist at the repository root and render as tabs.
      Superseded text follows:
- [ ] ~~`CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`.~~ These render
      as tabs above the README, so keeping them real and current is free
      navigation. Do not paste their contents into the README as well.
      *Genuinely absent* — none of the three exists at the repository root.
- [x] **`LICENSE`** at the root, matching the imported Apache-2.0 licence.
      *Added at `230b115`* — the same text the imported tree ships.
      *Genuinely absent* at the root; the licence text ships at `design/LICENSE`.
- [x] **`CHANGELOG.md`**, started now rather than at the first release, with
      every entry carrying its commit reference.
      *Verified by:* `CHANGELOG.md` at the repository root — a section per
      published tag plus `[Unreleased]`, every entry carrying a link to the commit
      that made it, and a "Not done yet" section so the file records the shape of
      the work rather than only its progress. Each referenced object id was
      checked against the object store; a link to a commit that does not exist is
      worse than no link, because it sends a doubting reader somewhere
      confidently irrelevant.
- [x] **`HANDOFF.md`**, recording what changed, what evidence exists, what
      remains, and every external dependency — with no claim of unverified
      success.
      *Verified by:* `HANDOFF.md` — a status-at-a-glance table, a "what is not
      verified" section that leads with what *is*, so the gaps are read against
      something, and ordered next steps. Every run outcome it claims is one that
      happened, and the sections describing the first working session are marked
      as a historical record rather than a current state.
- [x] **`docs/` with a categorized index**, one Markdown file per feature
      covering behaviour, configuration, failure modes, security
      considerations, and verification.
      *Verified by:* `docs/README.md` plus six category indexes — `porting/`,
      `architecture/`, `build/`, `standards/`, `site/` and `api/` — each listing
      its files with an honest implementation status. Each standard in
      `docs/standards/` resolves to a file; none is left as a dash.
- [x] **Set the repository's homepage field to the documentation site** once it
      publishes, so the link renders in the sidebar where every visitor looks
      first.
      *Verified by:* the repository's website field, which now resolves to the
      published site rather than to a branch or a raw file. It was blocked on 1.3
      and stopped being blocked the moment the site deployed.

### 1.3 Documentation site

- [x] **Publish a landing page and documentation site**, using the imported
      static-site application or a replacement. It is a user-facing surface and
      therefore carries every standard the application carries — Material
      Design 3, the three language modes, both funny-level sliders, tabbed
      navigation, a search bar wired to the regex builder, a settings page where
      every rendered detail is adjustable, non-blocking notifications, the
      accessibility rules, and the dim sum surprise. "It is only docs" is not an
      exemption, and the settings page is not exempt from having its own search
      either.
      *Verified by:* the `Pages` workflow deploying, then the published URL
      checked by request — the page, both stylesheets, `main.js`, the staged dish
      catalogue and a dish photograph each returned 200, and the served markup
      carried no unresolved translation keys. **What that check did not do is
      drive anything.** The controls listed above are known to be in the served
      markup; none has been operated in a browser. See
      [`docs/site/pages-deployment.md`](docs/site/pages-deployment.md), which
      keeps that distinction and lists the behaviour still unproved.
- [x] **Enable the publishing surface in the repository settings** before the
      first docs run. A missing site setting fails the deployment in a way that
      looks like a broken build and is actually one checkbox.
      *Verified by:* the first deployment failing exactly that way — a 404 from
      the publishing API before anything was uploaded — and succeeding once the
      setting was turned on. The prediction in this line was correct, which is
      the only reason it is worth leaving written down.
- [~] **Make the site's base path configurable and verify the built output
      carries it.** A fork publishing under a repository-scoped path with a
      hardcoded root will emit absolute asset URLs: the build goes green, the
      deployment succeeds, and every page returns a 404. Never conclude the site
      works because its workflow passed — open a page.
      *Partly done:* the site references its assets relatively, so no base path
      has to be configured, and the by-request check confirmed every asset
      resolves under the repository-scoped path. The trap is avoided rather than
      solved, which is fine while the site stays a single page — it becomes a
      real problem the moment a second directory level exists.
- [x] **Add an installer download button to the site's home page**, using the
      immutable release asset URL from a verified release, showing version and
      platform, and absent entirely until a real release exists rather than
      pointing at a guessed URL.
      *Verified by:* the install section linking the immutable asset URL of the
      published tag `v0.16.1-r8.1` rather than a `latest` redirect, which is what
      lets the checksum printed beside it mean anything.
- [x] **Bundle every site asset locally.** No CDN scripts, stylesheets, fonts,
      or remote images, and no third-party analytics.
      *Verified by:* the `Pages` workflow's six-check gate over `site/**`, which
      passes on every deployment. **The gate has never been observed rejecting
      anything**, so it is known to permit this site and not yet known to catch a
      violation — recorded as outstanding in
      [`docs/site/pages-deployment.md`](docs/site/pages-deployment.md).

---

## Phase 2 — Material Design 3 foundation

The mockup at `mockups/open-design-m3/` is the specification. It is a single
self-contained document describing ten screens, and it is detailed enough to
port from directly — but it is a mockup, so it also contains decisions that must
be *improved* rather than copied. Those are called out below.

**Done means:** the application's own chrome and components are Material
Design 3 throughout, with no legacy design elements remaining, driven by a real
token layer rather than hard-coded values, and with the appearance controls the
mockup advertises actually wired to the rendered interface.

**Verified by:** screenshots captured from the real installed build through the
project's own capture path, at 100/125/150/200% display scale and at narrow
widths, posted alongside the CI run that produced the build. Visual resemblance
in a browser is not evidence; a capture from the installed artifact is.

### 2.1 Windows frameless window and custom title bar

**This section landed at `dea6b0a`**, the commit `v0.16.1-r8.1` was built from.
Before it, the imported desktop main process applied its frameless chrome only
when the platform was macOS and an empty object otherwise, so the Windows main
window rendered the operating system's default title bar. It no longer does.

A caveat, because the boxes below are ticked from reading the tree and from the
unit suites rather than from looking at a window. **Nobody has looked at this
bar.** The packaged smoke test does launch the built application and does capture a
screenshot of it — but it asserts only that the file is non-zero, saves it into the
run's report, and inspects nothing about what is in the image. No capture has been
reviewed, posted, or taken at more than one display scale. The verification bar
stated at the top of this phase — captures from the installed artifact, at
100/125/150/200% and at narrow widths — is therefore **not met** by anything in
this section, and reviewing that existing screenshot is the cheapest step toward
meeting it.

- [x] **Make the main window frameless on Windows** and mount a custom title bar
      in the application's own chrome. Both files are under `design/` and need
      allowlist entries.
      *Verified by:* the desktop main process setting a hidden title-bar style on
      Windows, the renderer mounting the bar in the application shell, and both
      paths declared in [`MODIFICATIONS.md`](MODIFICATIONS.md). The hidden style
      was chosen over a fully frameless window deliberately: the latter also
      discards the platform's rounded corners, drop shadow, window menu shortcut
      and snap behaviour, none of which is worth reimplementing.
- [x] **Build the title bar to the mockup's measurements:** 40px tall, 12px of
      left padding with the right edge flush so the caption buttons run into the
      corner, a surface-container background, and a one-pixel outline-variant
      bottom border.
      *Verified by:* the component's stylesheet, which carries each of those four
      values as a token reference rather than a literal, except the height and
      padding which are the measurements themselves.
- [~] **Left cluster:** a 20×20 brand mark tinted with the primary role, the
      product name at 12px/600 with 0.02em tracking in the on-surface-variant
      role, and a lighter subtitle at 11px.
      *Mark and name done to the measurement; the subtitle is deliberately not
      rendered.* The mockup's subtitle describes the mockup rather than the
      product, so shipping it would have put a false description in the window
      chrome. Recorded as a departure rather than silently dropped — if a subtitle
      is wanted later it needs copy that is true of this application.
- [x] **Caption controls:** three 46×40 buttons stretched to full bar height
      with no margin or gap between them, hover filled with the ripple token,
      and a default cursor rather than a pointer to match native behaviour. Icon
      sizes are deliberately unequal — 16px, 15px, 17px — so the three glyphs
      read optically the same size. The close button's hover is the literal
      Windows red `#C42B1C` with white glyph; it is the one hard-coded,
      theme-independent colour in the whole bar, and it should stay that way.
      *Verified by:* the component and its stylesheet — the three sizes, the
      default cursor, the ripple hover and the literal red are all present. Two
      departures: the icons come from the application's existing set rather than
      the mockup's webfont, which is not bundled and was not worth adding for
      three glyphs; and the focus ring is inset rather than offset outward,
      because these buttons sit flush against two window edges and an outward ring
      would be clipped on both.
- [x] **Wire minimize, maximize/restore, and close to the real window
      operations**, including the maximize/restore icon swap. A caption control
      that looks right and does nothing is worse than the native bar it
      replaced.
      *Verified by:* the desktop-side window-control suite, which runs in CI. The
      maximized state is seeded from the window's real state and then follows a
      subscription rather than the last button press, because the platform changes
      it behind the application's back — a snap layout, a keyboard shortcut, a drag
      off the top edge. The control channel checks the sender is the main window:
      the webview tag is enabled and child frames share the preload, so without
      that check an embedded frame could close the application.
- [x] **Set the drag region correctly**, so the bar moves the window but the
      buttons do not.
      *Verified by:* the stylesheet — the strip is a drag region and the buttons
      opt back out of it, so a click on a caption button fires instead of starting
      a window drag. Double-clicking the drag region toggles maximize the way a
      native caption bar does, and the buttons sit outside it so a double-click on
      Close cannot also maximize the window.
- [x] **Apply the minimal rebrand at the same time:** the product name string,
      the window title, the installer's product name, and the application
      identity. Package names, the command-line tool's name, environment
      variable prefixes, and storage keys stay as they are — the rebrand is
      deliberately minimal. This one has moved ahead of the rest of 2.1: the
      identity edits are on disk and declared under the *Separate application
      identity* entry in [`MODIFICATIONS.md`](MODIFICATIONS.md), which covers the
      packaging tool's Windows, Linux and macOS builders, the release package's
      channel definitions, the packaged launcher, the daemon and the web shell.
      It has now been compiled, packaged, installed and launched. The packaged
      smoke test asserts the installed product's identity directly: the uninstaller
      is named after the product's display name, the registry entries carry both
      that name and the expected application id, and the running process reports
      the release version the run was building. That is the rebrand proved as
      *installed identity* rather than as text in files, which is what this item
      was waiting for. The one part still unproved is the window title itself — no
      title has been read off a window, because nothing inspects the window.
- [x] **The navigation rail was mounted and invisible.** *Closed at `90e52d3`,
      and confirmed by a capture.* `entry-layout.css` collapsed its grid track
      to `0` with `inert` and `aria-hidden` applied, and the stored preference
      defaulted to closed — so "collapsed" meant *gone* and a fresh install
      showed no rail at all. It is 88px as an icon rail and 260px with labels
      now, the widths Wave 1 specified. **A second species of the "mounted by
      nothing" defect: mounted, and still invisible.** A diff catches neither;
      a capture catches both.
- [x] **The UI scale setting was broken at every value except 100%.** *Closed
      at `cd0996d`, and confirmed by captures.* It scaled with CSS `zoom`,
      which multiplies painted lengths without moving the layout viewport, so
      `100vw` on a 1280px window still resolved to 1280 and was drawn twice as
      wide — the overflow was arithmetic. § 2.5 had warned about exactly this
      mechanism and it was ported anyway, because nothing had ever rendered it.
      The desktop host now scales its own web contents, dividing the real
      layout viewport. The capture run reports `innerWidth` 640 at 200% (was
      1280), `overflowX` 0 at all four scales, and the images show the heading
      wrapping instead of clipping with the status bar on screen.
- [x] **Bilingual mode clipped at 900px.** *Closed at `cd0996d`, confirmed by a
      capture.* The cause was not width: the status bar's segments were
      `display: flex` with `text-overflow: ellipsis`, and `text-overflow` does
      nothing to an anonymous flex item — so text hard-clipped mid-glyph with
      no ellipsis and no way to read the rest. Segments now ellipsise properly
      and carry their full text in a tooltip, the daemon segment never yields
      room, and the appearance readouts step aside at narrow widths through
      the repository's own screen-reader-only pattern so they stay announced.
      `Design · 設計` renders in full.
- [x] **Onboarding carried the upstream brand.** *Closed at `649f81d`.*
      Originally recorded as:, on the first screen a
      new user ever sees: "Sign in to Open Design", "Welcome to Open Design",
      "© 2026 Open Design". The window title beside it says Material Designer,
      which is what makes the mismatch obvious. **The release smoke test
      cannot catch this** — its captures begin past onboarding, so the surface
      is outside the fixed state list entirely. Found by launching the
      published portable build on an off-screen desktop and driving it through
      its own DevTools protocol.
      *The lesson for the capture set: a fixed list of states photographs the
      states someone thought of. Driving the app reaches the ones nobody did.*
- [x] **Settings is tabbed and searchable, and it has been seen.** *Confirmed
      by a live capture* — a horizontal tab strip with an overflow control
      reading 13, a Search settings field with its regex affordance beside it,
      and an active-tab underline. That surface had never been photographed
      after the work landed, because it is not one of the smoke test's nine
      states.
- [x] **Bottom overlap at a narrow window.** *Closed in two halves.* The first
      landed at `81cdbfd`: the entry view's scroll column now reserves the
      pill's band, so content clips above the hint instead of sliding beneath
      it, and the status bar's height became a token the strip itself is sized
      by. The second half is this change — the pills were still drawn on top of
      the status bar, because `bottom: 18px` is measured from the bottom of the
      **viewport**, whose last 28px is that strip. Both offsets now start at
      the strip's height and the reserved band is measured up from the top of
      it, so the arrangement is one token and one gap rather than three numbers
      that agree by luck. Originally recorded as: the scroll hint
      (`Scroll up to explore more templates · 向上捲動以探索更多範本`) is drawn
      on top of the template cards behind it, and the card row is cut by the
      28px status bar — the content area does not appear to account for the
      bar's height, which is new.
      *The second half is the lesson: a fix verified against the complaint that
      was written down can leave the other half of the same overlap standing,
      because nobody photographed the 28px the report never mentioned.*
- [x] **`t()` doubled a bilingual value used as an interpolation variable.**
      *Closed at `81cdbfd`* — rendering is per language before the join now,
      with `tv(key)` for a translated variable. Originally recorded as:
      Found while fixing the clipping above, and it is the biggest single
      contributor to that overflow. `t()` composes the two languages **and
      then** interpolates, so a `t()` result passed in as a variable is
      already bilingual when the bilingual template consumes it:
      `densityLabel` is `Default · 預設`, the template is
      `{level} density · {level}密度`, and the output is
      **`Default · 預設 density · Default · 預設密度`** — roughly 38
      characters that say "Default density" twice in English.
      The fix needs a per-language interpolation path that `t()` does not
      expose today. `tForLanguageTag` exists but bypasses the funny-level
      sliders, so reaching for it would regress a shipped feature. Worth a red
      spec of its own: **every** bilingual string built from a translated
      variable is wrong this way, not just this one, and the layout work only
      made it ellipsise politely rather than run off the edge.

> [!NOTE]
> **All three defects above were found by looking at pictures, on the capture
> set's first run.** Every one had passed 465 test files, a full typecheck, a
> guard, a craft lint and a translation check. Not one is the kind of fault an
> assertion was ever going to catch: a rail rendered into a zero-width track, a
> layout that magnifies instead of reflowing, a label pair too long for its
> bar. This is the argument for the capture path, made by the capture path.
- [ ] **Add the tab strip and status bar beneath the title bar** as the mockup
      specifies — a 42px strip of 36px bottom-rounded tabs with a 250px cap and
      leading/close icons, and a 28px status bar carrying live daemon state,
      model, design system, and the current scale and density.

### 2.2 Local fonts and Material Symbols

The mockup loads all three of its typefaces from a font CDN. That is a mockup
convenience and must not be ported. Separately, the *shipping* web application
already has one genuine CDN dependency: an Arabic-supporting font imported at the
first line of its main stylesheet. It must be bundled too.

- [x] **Bundle Roboto Flex** as a variable font, exposing the optical-size and
      weight axes the mockup uses.
      *Done* — six subsets (latin, latin-ext, cyrillic, cyrillic-ext, greek,
      vietnamese; 261,888 bytes) under `public/fonts/roboto-flex/`, OFL-1.1, the
      exact bytes served for `opsz,wght@8..144,100..1000`. `wght` is the
      declared `font-weight` range; `opsz` has no CSS descriptor and is driven
      by the browser under the default `font-optical-sizing: auto`. The token
      sheet had named this face since `dea6b0a` — until now nothing served it,
      so every surface rendered in the fallback with nothing reporting it.
- [x] **Bundle Roboto Mono** for all technical text — commit references, paths,
      identifiers, flags, and counters.
      *Done* — the same six subsets (134,568 bytes) under
      `public/fonts/roboto-mono/`, OFL-1.1, from `wght@100..700`. Note for the
      record: Roboto Mono is widely described as Apache-2.0, which it was before
      the Roboto family was relicensed; upstream says OFL-1.1 today.
- [x] **Bundle Material Symbols Rounded** as a variable icon font, exposing the
      fill axis, which the mockup uses to fill the active navigation icon.
      *Done* — one 1,376,348-byte file, Apache-2.0, from
      `opsz,wght,FILL,GRAD@20..48,400,0..1,0`. Two axes are live: `FILL`, which
      the mockup drives, and `opsz`, which the browser applies itself. `wght`
      and `GRAD` are pinned because nothing in the port reads them and leaving
      them open costs another 3,973,304 bytes; the measured menu of all five
      options is in the stylesheet's own comment, so revisiting it is a one-line
      URL change rather than a rediscovery.
      *The trap this face sets:* it addresses glyphs by the **ligature of their
      name**, so a name the font does not carry renders as English text in the
      toolbar rather than as a box. That is why it ships with no
      `font-display: swap`, no fallback family, and a mapping validated against
      the published name list.
- [x] **Remove the CDN font import from the web application's stylesheet** and
      *Done at `45ff210`* — three Cairo subsets ship under `public/fonts/cairo/`.
      Original wording:
      self-host that face. This is an edit under `design/` and needs an
      allowlist entry.
- [~] **Inventory and migrate icon call sites.** *The font swap is done; the SVG
      sweep is not, and the inventory is why.* The real numbers: Remixicon had
      **61 distinct names across 95 call sites in 7 files**, all funnelled
      through one 27-line component with no raw `ri-` class strings anywhere —
      and it was using 61 of the 3,229 classes its stylesheet defines, 1.9%, for
      a 189 KB font plus a 157 KB sheet. The inline SVG system is one module,
      `Icon.tsx`, with **93 glyphs behind a stable union, used at 859 sites
      across 127 files**.
      **94 of the 95 font sites migrated** to a `MaterialSymbol` component; the
      four that pick a glyph indirectly now return `MaterialSymbolName` so the
      compiler covers them. Every one of the 52 non-brand mappings was checked
      against the 4,268-name codepoints list published with the font, because a
      wrong name renders as English text rather than failing.
      **The one that did not migrate is `SocialShareGrid.tsx`**, whose single
      site draws nine brand marks — X, LinkedIn, Facebook, Reddit, Telegram,
      WhatsApp, Weibo, LINE, Instagram. **Material Symbols has no brand logos**,
      and drawing substitutes is a trademark question, not an icon one. So the
      incumbent font cannot be deleted yet; freeing those 346 KB needs licensed
      brand SVGs, which is its own scoped task.
      **The 859 SVG sites were deliberately left.** The path is unusually good —
      `Icon.tsx` is one `switch`, so converting it changes one file and zero call
      sites — but it means choosing 93 symbol equivalents for hand-drawn glyphs,
      where a wrong choice renders a *plausible wrong icon* no assertion can
      see. Doing that without once looking at the result is guessing at scale.
      It is now a one-file task, and it wants a capture run beside it.
- [x] **Remove any declared-but-unused icon dependency** discovered during the
      sweep, so the dependency list describes what the application actually
      uses.
      *Done* — `lucide-react@1.16.0` was declared and imported by nothing: no
      `.ts`, `.tsx`, `.css` or config file in the workspace. Removed with its
      three `pnpm-lock.yaml` entries, because a manifest and a lockfile that
      disagree fail `pnpm install --frozen-lockfile` and take the whole job with
      them. Two lookalikes are *not* usages and were checked: RTL rules
      targeting `svg[data-lucide=…]` inside generated artifact HTML, and a
      reference-site link label in the locales.
- [x] **Verify no network font request is made at runtime**, by inspecting the
      built artifact rather than the source.
      *Done, by extending the check that already existed rather than adding a
      second one.* The Pages workflow's inline self-contained rule became
      `scripts/check-self-contained.sh`, and the release workflow now runs the
      same script over the packed payload the packer reports. One
      implementation, so the published site and the installed application cannot
      drift into being held to two different standards.
      *One property is deliberate and worth keeping:* the script **fails** when
      handed a directory that does not exist or holds no stylesheet, markup or
      script. A check that reports a pass for something it never opened is worse
      than no check, because the green tick then means less across the whole
      job.

### 2.3 Token sheet and mapping layer

The mockup's handoff sheet is a genuine drop-in contract: all 18 of its target
variables already existed in the web application's token stylesheet, and all 12
source files in its component inventory existed at the paths it named. That is
what made a mapping layer viable — existing components inherit the new scheme
without being rewritten first.

**This section landed at `dea6b0a`.** The token layer is now two files:
`md3-tokens.css` is the contract, and the application's existing token file
became the mapping layer that redefines the product's own vocabulary in terms of
it. That split is the reason a reskin edits one file and a token rename edits the
other. What it does *not* do is rewrite a single component — that is 2.4, and it
is untouched.

- [x] **Transcribe the Material Design 3 token sheet from the mockup:** 33
      colour roles in light, the dark overrides, the seven-step shape scale, the
      three motion tokens, and the density variables.
      *Verified by:* `md3-tokens.css` — 119 distinct `--md-sys-*` tokens across
      287 declarations, the repeats being the explicit dark block, the three
      alternate seeds and the system-preference block. The seven-step corner
      scale, the three motion curves and the density steps are all present.
      Colour values are copied verbatim from the mockup, uppercase included, so a
      diff against the contract stays readable.
- [x] **Add the mapping layer**, redefining the application's existing custom
      properties in terms of the new roles, so every current component inherits
      the scheme with no changes of its own. The 18 documented mappings are the
      starting set, not the complete one.
      *Verified by:* the token file, which now resolves the product's colour,
      surface, text, border and radius vocabulary to `--md-sys-*` roles while
      keeping every product token's own name — so nothing that consumes them had
      to change. Three groups stay deliberately unmapped and each says why at its
      own declaration: the **functional data colours**, which standard 2 exempts
      because remapping chart series onto theme roles makes different series
      indistinguishable; **elevation shadows**, which no colour role can express;
      and the **selection indicator**, which is theme-invariant on purpose. The
      dark restatements collapsed at the same time — an M3 role flips itself, so a
      token defined as a role needs no dark override.
- [~] **Actually consume the tokens.** In the mockup the shape and easing
      variables are declared and referenced zero times — every radius and easing
      is written as a literal, and three further variables are declared and never
      read. The port must wire the token layer rather than copying the literals,
      or the appearance controls in 2.5 will have nothing to drive.
      *Shape is wired; motion is only partly.* The radius vocabulary now resolves
      through the corner scale, so every component already asking for a radius
      receives one from the contract. The motion side is mixed: some easing maps
      to a motion curve, but the interface's duration values are still literals in
      the mapping layer. Finish that before 2.5, or an animation-speed control has
      nothing to drive.
- [~] **Normalise the radius sprawl to the documented scale** — 8 / 12 / 16 / 28
      / full. The mockup uses more than a dozen distinct literal radii, over 160
      of them the pill value; the handoff sheet itself states the intended
      normalisation.
      *Half done, and the remaining half is a sweep rather than a decision.* The
      product's radius tokens are now defined from the corner scale, two of them
      as the midpoint between adjacent steps — so the scale is the source even
      where the product wanted an intermediate value. What has not happened is the
      sweep for literal radii still written directly into component styles; until
      that runs, the scale is authoritative for everything that asks for a token
      and irrelevant to everything that does not.
- [x] **Do not conflate the seed with its output.** The default seed's *swatch*
      is `#C96442` and its *primary role* is `#8F4C34`. The first is the input
      colour, the second is the generated tone. Treating them as the same value
      produces a scheme that is subtly wrong everywhere and very hard to debug.
      *Verified by:* the contract sheet's baseline primary role, which is the
      generated tone and not the swatch. The trap was avoided rather than hit,
      which is worth recording — a scheme built on the swatch is wrong everywhere
      by a small amount and reads as a rendering bug rather than a token bug.
- [x] **Implement the three additional seeds** as documented — each overrides
      ten roles in light and twelve in dark, covering the primary, secondary and
      tertiary families plus the inverse primary, while every surface, outline,
      error and success role stays on the default ramp.
      *Verified by:* the three alternate seed blocks in the contract sheet, each
      with a light form and a dark form, and each ordered so the dark seed
      outranks the light one and the system-preference block outranks both. That
      ordering is load-bearing: get it wrong and choosing a seed silently
      un-darkens the interface for anyone on system theme.
- [x] **Keep the two non-standard success roles** the mockup adds, and document
      them as an intentional extension rather than letting a future reader take
      them for canonical roles.
      *Verified by:* both roles present under the names the contract wrote, with
      the sheet's own header stating plainly that they are inventions of this
      contract rather than canonical Material Design 3 roles.
- [~] **Add the roles the mockup omits** — surface tint, shadow, and the fixed
      role family — or record in the feature documentation which are
      deliberately unused and why. A silent gap reads as an oversight.
      *Recorded, but in the wrong place.* The contract sheet's header names each
      omitted role and states it is deliberately not invented here, which is the
      substance of this item. The requirement says *feature documentation*, and
      [`docs/standards/material-design-3.md`](docs/standards/material-design-3.md)
      does not carry it yet — a reader of the docs still sees a silent gap.

### 2.4 Component anatomy waves

Roughly 197 component files and 42 stylesheets under the web application. This
is the largest single body of work in the roadmap and the least interesting to
describe, so it is tracked as ordered waves with a definition of done per wave
rather than as one item that stays unchecked for months.

- [ ] **Wave 1 — chrome.** Navigation rail (88px collapsed to 260px expanded, a
      56×32 pill indicator on the active destination, a 56px tall extended
      action button), top app bar with the Windows caption controls from 2.1,
      and the tab strip.

      *Mostly built; the box stays open because a wave's stated definition of
      done is capture-based and nothing here has been captured.* Present in the
      source: the two rail widths as grid tracks with a 200ms transition, and
      the 56×32 `corner-full` destination pill with its state layer at 0.08
      hover / 0.12 press. Still open: the 56px extended action button, and the
      tab strip beneath the title bar, which is its own item above.

      **The rail's toggle was also inert until it was driven.** It called
      `onClose` unconditionally in a rail whose default state is collapsed, so
      the first click on a fresh profile set `false` to `false` — and both it
      and the topbar toggle carried the same static label in either state,
      telling a screen-reader user that pressing it would expand a rail that was
      already expanded. Fixed, with a test that covers the *collapsed* case
      specifically: "collapse collapses it" would have stayed green throughout.
- [x] **Wave 2 — home.** *Done at `f99fb2b`* — 28dp prompt surface, assist-chip
      rail, scenario card grid, morphing send, tonal recent-project covers.
      Original wording: The prompt surface at 28dp with its chip rail, the
      scenario card grid, the recent-project cards with tonal covers and a
      spring lift, and the primary action button that morphs on hover.
- [ ] **Wave 3 — collections.** Project, design-system, library and plugin
      grids as filled and outlined cards; filter chips; the segmented grid/list
      control.
- [ ] **Wave 4 — lists and switches.** Automation rows with a proper 52×32
      switch and 24px thumb, state chips, tonal action buttons; integration rows
      with a segmented button and status chips.
- [ ] **Wave 5 — conversation.** Tonal message bubbles with the asymmetric
      corner treatment, tool-call cards, the typing indicator, and the composer
      with its morphing send button.
- [ ] **Wave 6 — settings.** Convert the settings modal into a full-page surface
      with a searchable section list, which the standards require to be
      non-blocking anyway.

      *Converted; the box stays open on the same rule as Wave 1, because a
      wave's definition of done is capture-based and nothing here has been
      captured.* The surface is a page: it mounts inside
      `.workspace-shell__body` as a second child of that one grid cell, paints
      an opaque `--md-sys-color-surface`, and centres a 1180px column — the
      settings screen's own width in the mockup. Gone with the card: the
      scrim, `aria-modal="true"`, click-outside-to-close, and the fullscreen
      toggle, which on a surface that is already the whole content area was a
      button that could only change nothing. The title bar, the workspace tab
      strip and the status bar stay live above and below it, which is the
      whole point of the surface being non-blocking; the workspace it covers
      is marked `inert` while it is open, so a page that is visually covered
      is not still reachable by Tab. The searchable section list is the tab
      strip that landed at `a1c0027`, unchanged.
- [ ] **Wave 7 — overlays.** Menus, popovers, sheets and dialogs. Every one must
      paint its own background, border, elevation and shape; an overlay that
      renders transparent lets the content behind read through it. Every one
      must also bound its height to the space available and scroll inside that
      bound — capping height and hiding the overflow silently deletes content,
      which is how a calendar loses its last week with no scrollbar to say so.
- [ ] **Wave 8 — the remainder.** Everything the first seven waves did not
      reach, enumerated from a real audit rather than assumed to be empty.

Each wave is done when its surfaces are captured from an installed build in both
themes, at all four display scales, at narrow width, and in bilingual mode where
labels are longest — and when no legacy design element remains in them.

### 2.5 Runtime appearance controls

- [x] **Theme** — light and dark, persisted, applied live. The segmented
      control in Settings · Appearance writes `data-theme` through
      `applyAppearanceToDocument` on every change and persists in `AppConfig`;
      cancelling the dialog reverts to the last saved appearance.
- [x] **Density** — compact / default / comfortable, changing the gap, padding
      and row-height variables. Driven rather than dropped: `--sp` now moves
      with the level instead of sitting still while the gap built on it halves,
      and three control-size variables joined the scale because none of the
      original five described a control's own height. `primitives.css` reads
      them, so every button, text field and select in the application resizes
      with the setting — before this the level changed five numbers of which
      four had no reader at all and the three levels were pixel-identical.
      Original wording: Note that the mockup declares a base spacing unit and a
      card variable that no density level redefines and nothing reads; the port
      should either drive them or drop them.

      *Still dead, and named here so it is not rediscovered as a surprise:*
      `--row` has **zero readers** and `--pad` and `--card` have one each. They
      move with the level and change nothing, which is precisely the defect the
      rest of this item fixed — smaller, but the same shape. Either give them a
      reader or delete them; leaving a token that moves and is never read is how
      the pixel-identical density levels happened in the first place.
      *Verified by:* counting `var(--token)` occurrences across `styles/` and
      `components/` — `--sp` 8, `--gap` 8, `--control-h` 5, `--control-pad-x` 2,
      `--card` 1, `--pad` 1, `--row` 0.
- [x] **Seed colour** — the four documented seeds, as swatches that each paint
      their own seed rather than the active one. The continuous picker the
      standards require already ships beside them on the accent field
      (`InfiniteColorPicker`), so the fixed four are the shortcut and not the
      whole space. Original wording: the four documented seeds as a starting
      point. The mockup ships four fixed swatches, which is *not* sufficient for
      the standards; the continuous picker that replaces them is Phase 4.
- [x] **UI scale** — 50–200% in steps of 5, default 100. The slider is in
      Settings · Appearance and stores a factor, not a percentage, quantized
      onto the same grid auto-fit uses so the two cannot disagree.
- [x] **Replace the mockup's scaling mechanism.** *Done at `cd0996d`* — the
      host scales its own web contents, so the layout viewport divides and the
      page reflows. Original wording: It sets a custom property that
      nothing reads and does the actual scaling with a non-standard CSS zoom
      property. Implement scaling in a way that is standard, testable, and does
      not break layout measurement.
- [x] **Auto-fit to window**, as the mockup's appearance card offers. It writes
      into `uiScale` rather than living beside it, so the status bar, the preset
      comparison and the exported theme keep describing the scale that is
      actually on screen. The fit is computed from the window width recovered
      by multiplying the applied factor back out — measuring the layout
      viewport, which scaling divides, would be a loop.
- [x] **Font family, size scale, and weight**, chosen from bundled and installed
      faces, with a live preview and a fallback that keeps CJK text legible.
      The list previews each stack in its own face and says whether this machine
      actually has it — including "cannot tell", where `document.fonts` cannot
      answer. No typeface ships with the application, and the editor says so
      rather than implying otherwise. Line height and letter spacing are here
      too, and the four properties this platform cannot honour keep their
      control, their saved value and an explanation of which kind of "no" they
      are.
- [x] **Persist every control across restarts** and apply changes to the live
      interface, not only after a restart. Every control writes through the
      appearance store, which persists to `localStorage` and applies to the
      document in the same call; there is no Save step and no draft. Not yet
      verified against a running build — see the caveat below.

**Not yet verified from an installed build.** Everything in 2.5 is proven by
specs that assert the document attributes and custom properties each control
writes, and by static assertions that the shared primitives read the density
scale. None of it has been driven in a real window, so the visual result at
each density level, at every display scale, and in bilingual mode where labels
are longest is still unconfirmed. That confirmation belongs with 2.4's
capture requirement.

---

## Phase 3 — Language and core surfaces

**Done means:** a user can run the application in Cantonese, bilingually or in
English at any humour level; can reach a regex builder from any search field;
and has the command palette, changelog viewer and tab management the standards
require.

**Verified by:** the translation-coverage check passing for the new locale;
per-package test counts for each new surface; and screenshots from an installed
build in all three language modes, since bilingual mode produces the longest
labels and is where clipping appears first.

### 3.1 Cantonese locale and bilingual mode

The imported application ships 19 locales. A repository-wide search for a Hong
Kong Chinese locale code returns zero results — no dictionary, no union member,
no label, no translated documentation. It is genuinely absent, not partially
present.

- [ ] **Register the locale** in the type module's locale union, list and label
      map, and import the dictionary in the provider module. **Three files
      total: two edited, one added** — `apps/web/src/i18n/types.ts` carries all
      three registration points (the `Locale` union, the `LOCALES` array and the
      label map), `apps/web/src/i18n/index.tsx` carries the import and the
      `DICTS` map, and `apps/web/src/i18n/locales/zh-HK.ts` is new. A fourth is
      not needed: `apps/web/src/i18n/content.ts` types its per-locale marketing
      bundle as `Partial<Record<Locale, …>>`, so a locale without one compiles.
      All under `design/`, all needing allowlist entries.
- [ ] **Translate the dictionary.** This is the single largest mechanical task
      in the project: the dictionary interface declares roughly 4,200 keys, and
      the English dictionary is around 4,300 lines. It cannot be done in one
      sitting and should not be tracked as one checkbox.
- [ ] **Track the translation wave by wave**, in the order the component waves
      land, so each translated area can be screenshotted and checked in context
      rather than reviewed as a wall of strings. The dictionary is a flat,
      dot-namespaced interface, so a missing key is a compile error naming the
      exact string — the type checker is the progress meter.
- [ ] **Add a bilingual mode** that renders both languages without crowding:
      primary label prominent, secondary label compact or progressively
      disclosed. Validate at narrow widths, where this fails first.
- [ ] **Keep the coverage check green** for the new locale on every push.
- [ ] **Translate the user-facing documentation** into the new locale
      afterwards, following the existing translated-docs convention.

### 3.2 Funny-level sliders

- [x] **Two independent persisted sliders, 1–5** — one for English, one for
      Cantonese, rendered per language from `['en', 'zh-HK']` in the settings
      surface and persisted under separate keys. Deliberately two and not three:
      only those two locales carry an override dictionary, and a third slider
      that moved nothing would be a lie in the shape of a control.
      *Verified by:* reading the render and the persistence path.
- [ ] **Author five distinct samples per language per level.** Structurally
      done, thinly populated. **216 of 4,635 declared keys carry an override —
      4.7%**, identically in both languages. The maps are sparse in *both*
      dimensions by design and `applyFunny` walks down to the nearest defined
      step, so a key that defines only 3 and 5 still reads playfully at 4 rather
      than snapping back to neutral. Level 1 is the neutral base by definition.
      The remaining work is authoring, not engineering: the mechanism is
      finished and 95% of the product's copy has nothing to say at any level.
- [x] **Apply the level to every category with no exemptions.** There is no
      category filter anywhere in the path — `stringFor` routes every key
      through `applyFunny`, so destructive, security and error copy are styled
      exactly like everything else. The exemption this item guards against
      cannot exist without adding one.
- [x] **Style voice, never facts.** `keepsTheFacts(base, candidate)` gates every
      override: a variant that would drop a `{placeholder}` or a number the
      neutral base states is discarded and the base is rendered instead. The
      guard runs at read time, so an override authored badly later still cannot
      remove a fact.
- [x] **Disclose the behaviour at first run and in the setting itself.** The
      disclosure renders in the settings surface until `funnyDisclosureSeen` is
      set, and states that the level styles errors and warnings too.

### 3.3 Regex builder on every search bar

These six were built and never ticked. Each is ticked here after checking it
against the source, not against the memory of having done it.

- [x] **Build the regex builder** — `apps/web/src/components/regex/` carries
      guided construction (`RegexPartRow`, `parts-ops.ts`), a raw pattern editor,
      all six flags (`REGEX_FLAGS = ['g','i','m','s','u','y']`, defaulting to
      `i`), a sample panel with live matches and capture groups, syntax feedback,
      and copy via `copyToClipboard`.
- [x] **Anchor it to its field.** Deliberately *not* the mockup's one shared
      floating panel: `RegexSearchField` opens a popover portalled to the body
      and positioned from its own host's rect, bound to that field's query,
      pattern, flags and mode. Each field gets its own; none share hidden state.
- [x] **Wire it to every collection search bar.** **Thirteen surfaces** consume
      `RegexSearchField` — brands, design systems (both views), the entry
      topbar, examples, the MCP client section, the notification centre,
      plugins, the project reference modal, settings, skills and the rest.
      Plain text stays the default and regex is an explicit opt-in.
- [x] **Give every settings surface its own search bar wired to the same
      builder.** `SettingsSearchResults` searches option labels, descriptions and
      current values, and renders `settings.searchOtherTabBadge` naming the
      section a match sits on, so a hit on another tab says so rather than
      appearing to be missing.
      *The capture that confirmed it absent was of `90e52d3`; it has since been
      built, and the capture in the README shows the field.*
- [x] **Evaluate locally and defensively** — the pattern is capped at
      `MAX_PATTERN_LENGTH` and the sample at `MAX_SAMPLE_LENGTH` before either
      reaches the engine, the match loop is bounded by `MAX_SAMPLE_MATCHES`, and
      zero-width matches are advanced explicitly rather than looping forever.
      `evaluate.ts` is honest in its own header that this is *bounding*, not
      immunity: real catastrophic-backtracking protection needs a worker with a
      timeout or a non-backtracking engine, and neither exists here. That
      caveat is worth keeping visible rather than tidying away.
- [x] **Test against the real engine** — `tests/components/regex/` holds
      `evaluate.test.ts`, `parse.test.ts`, `pattern.test.ts` and
      `RegexSearchField.test.tsx`, plus `CommandPalette.regex-filter.test.ts`
      for the palette's own surface.

### 3.4 Dim sum surprise

These six were all built and the boxes were simply never ticked. They are
ticked here after checking each against the source rather than against the
recollection that they were done.

- [x] **Add a bundled local image catalog** with dish names in English and
      Traditional Chinese. `assets/dim-sum/index.json` plus `assets/dim-sum/images`.
      Bundled assets, no network fetch, no third-party host, no tracking.
      *Original wording: none exists in this repository today.*
- [x] **Draw fresh at each launch, 10% chance, at most once per launch.**
      `DIM_SUM_CHANCE = 0.1` in `apps/web/src/lib/dim-sum/surprise.ts`, and a
      module-scoped `launchDrawSpent` that is set **before** the draw is taken —
      so an exception inside the draw still spends it rather than leaving a
      launch that can be re-rolled. Module state is per JavaScript context, which
      is exactly one launch.
- [x] **Present it non-blocking and auto-dismissing.** A `Toast` with a 7s TTL,
      never a dialog. The `eligible` prop is computed in `App.tsx` and is false
      while the daemon config is hydrating, during onboarding, during the privacy
      disclosure, and while any app-level error is on screen; the component adds
      the one condition App cannot see — an updater state outside
      `idle`/`not-available`/`unsupported` — and waits 1600ms after the app is
      already interactive so a dish never lands in the same beat as first paint.
- [x] **Name the dish in both languages**, honouring the active language mode.
      `dimSumDishName` and `dimSumAltText` both take the locale and the language
      mode; the surrounding blurb goes through `t('dimSum.blurb')`, so the funny
      sliders style the copy while the dish's own name stays exact.
- [x] **Give it meaningful alternative text** naming the dish. `dimSumAltText`
      per locale and language mode, on an image marked `decoding="async"` and
      `loading="lazy"` so decoration never holds up a paint.
- [x] **Ship no off switch.** There is none: a search across every `.ts` and
      `.tsx` for a dim-sum enable/disable preference returns nothing, and the
      component takes no such prop. The mockup's ON switch was not ported.
      *Verified by:* `tests/dim-sum.test.ts`, and by reading every call site.

### 3.5 Changelog viewer

- [ ] **Cover every released version** in-app, each entry carrying its version,
      release date, and categorized changes. A link to release notes on a
      website does not satisfy this.
- [ ] **Link every entry to the commit that made the change**, rendered as a
      short clickable reference resolving against this repository.
- [ ] **Validate that every referenced commit exists** before the changelog
      ships, failing the build rather than emitting a dead link. A wrong
      reference is worse than none, because it sends the reader somewhere
      confidently irrelevant.
- [ ] **Advanced date filter** — an anchored calendar with month and year jump,
      range selection, and named presets, that also accepts typed dates in both
      the locale format and plain ISO, reporting incomplete or invalid input
      inline without discarding what the user typed. The mockup specifies this
      in full, including the bounded scrolling the overlay rules require.
- [x] **Regex-capable search that composes with the date filter.** The viewer's
      search bar was a bare text input until this was checked — the one surface
      whose own requirement names regex, and the only one of the product's
      fourteen search bars without the builder beside it. `filterChangelog` now
      takes an optional compiled predicate and the dialog passes it only in
      regex mode; the date range is applied independently, so the two compose
      rather than override. Plain text deliberately keeps its term-splitting
      path, because routing it through one compiled pattern would have narrowed
      "density readout" from *both words, any order* to a contiguous substring.
      *Verified by:* three added cases in `tests/changelog-filter.test.ts`,
      including one asserting the plain-text behaviour did not change.
- [ ] **Copy the current view and export to Markdown**, honouring the active
      filter and search so the export matches what the user sees, and stating
      the exported range in the file.
- [ ] **Bring the changelog current in every project-changing task**, worked out
      from the real commit history. A viewer that documents the past and
      misleads about the present is worse than no viewer.

### 3.6 Command palette

- [x] **One discoverable shortcut**, listing every command, setting and
      destination the application has. `Ctrl+Shift+F` opens it on Windows/Linux
      and `⇧⌘F` opens it on macOS, all derived from
      `components/shortcuts/registry.ts`. `Ctrl+P` remains the quick switcher;
      `Ctrl+K` and `Ctrl+Shift+P` are not competing palette bindings.
- [x] **Cover every setting in every settings surface.** 44 indexed entries in
      `command-palette/settingsIndex.ts`, each carrying the section it lives in
      so a user who knows a setting's name never has to know its tab.
- [x] **Render live inline controls in the rows** — a switch for a toggle, a
      text box for a value, a stepper for a number, a select for a choice. All
      four kinds now exist, and **22 of the index's 43 rows carry one**.
      Twenty of the remaining twenty-one are the section anchors — a row that
      names a whole tab is a destination, not a setting, and there is no
      control for "Privacy" as such. The twenty-first is `appearance.typography`,
      which names the typography *card*: its nine properties are indexed
      individually and four of them are live steppers, so a control here would
      have to pick one of them and call it the whole card.
      The appearance rows write through `useAppearancePreferences`, the same
      store `AppearanceControls` writes through, so a seed chosen in the
      palette is applied and persisted by the same call that does it in
      Settings; the desktop-notification switch asks for the platform
      permission first, exactly as the settings panel does, rather than
      storing an "on" the browser has refused. Verified by
      `CommandPalette.test.tsx` — which has not been run in this checkout,
      because it has no Node toolchain. CI is the first thing to execute it.
- [x] **Teleport on selection:** `reveal.ts` opens the surface, reveals the
      exact control and flashes it, and the reveal is requested *before* the
      section opens so the dialog does not consume it. Focus is deliberately
      left on the revealed control rather than yanked back.
- [x] **Two persisted sizes**, defaulting to the bounded card. The full-window
      mode exists for small displays. In private-mode storage the palette still
      opens and simply forgets the size, and a failed write never blocks the
      resize itself.
- [x] **Its own search wired to the regex builder**, running under its own
      `useRegexSearch` controller so query, pattern, flags and mode cannot leak
      in from the header field. The adjacent affordance keeps a 48px target and
      the input yields first at narrow widths; `CommandPalette.test.tsx` covers
      the rendered builder plus a source-level contract guard for the wiring.
      Hosted execution remains pending.
- [x] **Escape from every focused palette control.** The dialog-level fallback
      closes the palette from its size, scope and live setting controls while
      the search field and portalled regex builder retain their own first-close
      behavior. A focused size-control regression case is committed; hosted
      execution remains pending.

### 3.7 Tab pinning and bulk close

- [ ] **Pinning as a first-class operation** from the tab context menu, a
      keyboard path, and the searchable tab list. Pinned tabs occupy a stable
      dedicated region, reorder within it, stay visible when ordinary tabs
      overflow, keep an accessible full name in compact form, and are excluded
      by default from close-others, close-to-edge and text-based bulk closes.
- [ ] **An overflow surface** when tabs exceed the available width. Silently
      clipping them is not an option.
- [ ] **Reordering**, by pointer and by keyboard.
- [ ] **Close tabs containing text / not containing text**, matching the visible
      label, plain text by default with the anchored regex builder available for
      both. The inverse action must negate the exact same predicate, so flags,
      casing, Unicode and scope cannot drift between the two.
- [ ] **Never run on an empty query or invalid pattern.** Show the match mode
      and affected count with a reviewable preview first, exclude pinned tabs
      unless explicitly included, preserve each tab's unsaved-work protection,
      and report excluded or failed tabs rather than pretending they closed.
- [ ] **Persist tab order and pinned order across restarts.**
- [ ] **Correct tab semantics throughout** — roving focus, live panel
      associations, visible focus, reduced-motion respected.

---

## Phase 4 — The long tail

Everything the standards require that Phases 1–3 do not reach. These are listed
last because they depend on the token layer, the language layer and the tab
layer existing — not because they are optional. None of them is optional.

**Done means:** every numbered standard has a surface that implements it, tested
and documented, with no remaining "not implemented" row in the conformance
matrix.

**Verified by:** the conformance matrix at the bottom of this file showing no
unimplemented row, each row's claim backed by a test and a capture from an
installed build.

- [ ] **4.1 Tab groups and per-tab appearance.** Create, name, colour, reorder,
      collapse and remove groups; move tabs between them by pointer and
      keyboard; persist the whole structure. Per-tab and per-group appearance
      editors opened from the context menu and by modifier-click, anchored
      beside the element being edited, tracking that anchor and returning focus
      on close. Plus the four tab-discovery searches — current strip, inside
      each group, groups by name, and a master search across every open tab —
      each with its own anchored builder and no shared hidden state. The mockup
      has none of this; it is new work.
- [ ] **4.2 Notification centre.** Non-blocking toasts anchored in a corner for
      everything informational, auto-dismissing on a sensible timeout with
      errors and warnings persisting until dismissed, stacking without
      overlapping, carrying optional actions. Modals reserved strictly for
      decisions that must be made before continuing. A centre keeping dismissed
      notifications reviewable. The mockup specifies a 48px minimum snackbar
      with a six-second dismissal and an undo action, and a side sheet with
      filter chips and unread indicators — a good starting point.
- [ ] **4.3 Super-confirmation gate for destructive actions.** Two independently
      operated keys, then a full-range slider, a dramatic but non-blocking
      progress animation while it moves and a distinct completion animation
      after, and an always-available emergency exit with the platform's cancel
      path. Built in the application's own UI layer — never a helper window or a
      hosted page. Focus returns to the originating control on cancel or
      completion. Entirely absent from the mockup, which offers plain delete
      actions in two places.
- [ ] **4.4 Local Git-backed version history.** Snapshots in an isolated
      repository beside the application's own data — never inside the user's
      folders — covering documents *and* every user-managed record and the
      settings that configure them. Restoring records a new revision rather than
      rewriting history, so an undo can itself be undone. Snapshots preserve
      whatever encryption the live data uses, and any authenticated-encryption
      associated data must bind to an identifier that survives delete and
      restore — binding it to a row identifier makes restored data permanently
      undecryptable in a way that looks exactly like corruption. The panel
      filters by date and by real recorded actions with counts, composing with
      its regex-capable search. Discarding unsaved work is itself recorded
      before the close completes.
- [ ] **4.5 Export everything.** Every record, view, list, log, document,
      setting and generated artifact exportable, in every format that can
      faithfully represent it, stating what will be lost before an export runs
      rather than truncating quietly. Archives with the full range of
      compression options and encrypted headers where offered, never presenting
      an encrypted archive as protected while leaving filenames in the clear.
- [ ] **4.6 Bulk actions on every list.** Multi-select by pointer, range and
      keyboard; a select-all that says plainly whether it means this page or
      every match; inverse selection; the full action set rather than a token
      subset; composition with search and filter; an exact count and reviewable
      preview before anything runs; undo through the same version history;
      progress, cancellation, and honest partial results.
- [ ] **4.7 External editor integration.** Detect installed editors, let the
      user choose or add one, persist the choice, and degrade with a clear
      message when none is found. Everything exportable is openable in a code
      editor in one action from the export or from the record it came from,
      opening a folder as a workspace root rather than a single file with no
      context.
- [ ] **4.8 Spoken narrator.** Optional, off by default, English / Cantonese /
      both with both strictly serialised. Debounced with a per-category
      cooldown, one utterance at a time through a serialised queue, superseded
      lines replaced rather than stacked. Tone follows the per-language funny
      level in every category; spoken error narration still names the actual
      failure and is never suppressed by rate limits. Yields to an active screen
      reader and respects quiet settings.
- [~] **4.9 Context-menu search and shortcut labels.** The audit fixed the
      concrete menu defects found in the file-menu path: long labels wrap and
      Escape, outside click, scroll, Tab and item selection restore focus to the
      originating control. The full requirement remains: every context menu — tab,
      group, appearance, application and overflow — carries its own
      keyboard-accessible search field filtering visible items locally without
      changing action semantics. Every item with a keyboard shortcut displays
      it, right-aligned in the platform's notation, derived from the same source
      that registers the binding so the two cannot drift. A shortcut shown that
      does not work in that context trains the user to press a key that does
      nothing.
- [ ] **4.10 Infinite colour picker and colour translator.** A continuous
      spectrum or two-dimensional field plus numeric entry, replacing the
      mockup's four fixed swatches, with bidirectional conversion across the
      named, hexadecimal, RGB, HSL, HSV, HWB, LAB/LCH, OKLab/OKLCH and CMYK
      representations; alpha preserved; active space and gamut identified;
      clipping warned before it happens; contrast reported; every representation
      copyable. Swatches and eyedroppers layer on top of it, never replace it.
- [ ] **4.11 Word-depth typography editor and per-element appearance.** Every
      installed and bundled family searchable and selectable with each name
      rendered in its own face; free-entry and stepped size; variable-font axes;
      weight, italic, underline styles, strikethrough variants, overline,
      capitalization and small caps, super- and subscript, colour, highlight,
      outline, shadow, glow, character and word spacing, line height, baseline
      offset, direction and alignment. Unsupported properties stay visible with
      a capability explanation rather than silently dropping a saved value.
      Every element exposes an appearance editor from its context menu and a
      keyboard equivalent. The mockup offers bold/italic/underline, one family
      button, one size button, two alignments and one swatch — a small fraction
      of this.
- [ ] **4.12 Named presets, export/import, and reset.** Saved themes
      exportable and importable as a file so a customised appearance survives a
      reinstall and can be shared, with per-element and global reset. Absent
      from the mockup entirely.
### 4.0 The verification that never ran, and what it found

The Phase 4 surfaces were written by agents that hit a session limit before
their adversarial review lenses executed. Those lenses ran on **2026-08-04**.
They produced 44 findings, of which **15 were confirmed by an independent
refutation pass**; the remaining 29 are unverified because the verification
half hit a session limit of its own, which is the same failure repeating and
is recorded rather than hidden.

The confirmed findings are listed here as work, because a finding that lives
only in a report is a finding that gets rediscovered.

- [x] **Three modules were unreachable.** `AppearanceRuntime`,
      `InfiniteColorPicker` and `NarratorSettingsPanel` had zero importers.
      The narrator was additionally *unmountable*: it imported a stylesheet
      that did not exist, so wiring it would have failed the build — which is
      very likely why it was left unwired, since an unmounted component
      compiles perfectly.
      *All three closed:* the narrator at `92ed8c6` (stylesheet written, its
      own settings section, command palette indexed with two live inline
      controls), and the appearance editor and colour picker at `ab2a89c` —
      the picker is now the accent control with the fixed swatches kept as a
      convenience layered on top, and the runtime mounts in `App.tsx` rather
      than the dialog, because mounted in the dialog a chosen preset silently
      reverted on the next reload.
      **The standing lesson, worth more than the fix:** judge a feature by
      whether a surface mounts it, never by whether its files exist. Nothing
      in a normal pipeline catches this — an unmounted component typechecks,
      passes its unit tests, and ships in the bundle.
- [x] **The Design Files bulk delete reported success it never had.**
      `handleDeleteMany` returned nothing, so the panel counted every selected
      item as succeeded — "3 done." after a cancelled confirmation, and after
      a run where every delete was refused. It also dropped the caller's
      options, freezing the progress bar at zero and making Stop decorative.
      *Closed at `6e90fbd`*, routed through the shared `runBulkAction` runner
      with five tests pinning the invariants.
- [x] **Destructive actions bypass the confirmation gate.** *Closed at
      `9d5c5d3` and `c68068e`.* Memory entries (which unlinked a file from
      disk with no confirmation at all) and library assets, single and bulk,
      now route through the gate naming the exact data affected. The `od`
      CLI's five delete subcommands — which reached the daemon route around
      the UI's gate entirely — refuse without `--confirm`, before the request
      is made. **Deliberately not gated:** the extraction records, a
      self-evicting twenty-entry in-memory buffer whose contents do not
      survive a daemon restart; a regression test pins that decision.
- [x] **The gate's own state machine has five confirmed defects.** *Closed at
      `081ccdd`.* Armed keys no longer survive a target swap; the slider
      rations forward travel so the range costs at least five deliberate
      advances while retreat stays free; a mid-flight dismissal raises the
      action's failure instead of swallowing it; the outcome union gained
      `dismissed` so Escape can stop claiming an action was cancelled when it
      had already run; and focus returns before `onClose` on every path.
- [x] **The shared dialog has no focus trap.** *Closed at `3f30a12`.* Focus
      moves in on open, is held by Tab and Shift+Tab, is pulled back if
      something moves it out, and returns to the opening control on close.
      Fixed in the shared primitive, so every dialog in the product gained it
      at once.
- [x] **Enforce the gate at the operation, not in each interface.** *Closed at
      `ecaad97`.* The audit assumed two interface gates; there were **three** —
      the web app's, the CLI's `--confirm`, and an MCP tool's own
      `confirm: true`. Three gates and zero boundaries, so anything that was
      none of the three deleted freely. The three irreversible deletes
      (project, brand, library asset) now require a single-use token minted
      per resource at `POST <resource>/confirm-delete` and returned in a
      header: bound to kind and id, 120-second expiry, consumed on success,
      held in memory so a restart invalidates outstanding grants.
      **What it does not prove is written down rather than glossed:** the
      token does not establish that a human moved a slider — the web app mints
      it at authorization and spends it immediately. What it buys is that no
      caller reaches the operation in one replayable request, and that every
      route now converges on one enforcement point where policy can be
      strengthened.
      **The line was drawn on restorability, not on the verb:** deletes whose
      records sit in a registered version-history domain — memory entries,
      project files, templates, automations, BYOK profiles, connectors, MCP
      servers — are deliberately *not* gated, because gating a restorable
      delete adds ceremony without safety and dilutes the signal that the gate
      means irreversible.
- [ ] **Finish the interface-side routing.** The boundary holds, but the web
      gate is still mounted on some affordances and not others — whole-project
      delete from the recent-projects strip goes through a plain one-button
      dialog. Every such route now completes the daemon handshake, so none can
      delete in a single request; a user reaching a delete through an ungated
      affordance still does not meet two keys and a slider.
- [ ] **Three adjacent routes were found and deliberately left.**
      `DELETE /api/projects/:id/folders` removes a project subtree with no
      version record; `DELETE /api/design-systems/:id` deletes a user-authored
      design system no history domain covers; and `od library rm` has no
      `--confirm` at all, where adding one would break existing scripts. Each
      is a real gap held out of scope rather than missed.
- [x] **Fix the five failing web suites, then wire the web suite into CI.**
      *Closed at `ca03246`.* It ran for the first time in this repository's
      history at 454 of 459, and is now **464 files, all passing, gating every
      push**. Four failures were tests describing behaviour the product had
      deliberately moved on from; one was a fixture that mis-counted its own
      dice (it interleaved a selecting roll after each deciding roll, but a
      losing draw short-circuits and takes only one — so the second draw's
      deciding roll became the `0` meant as a selector, and `0` wins); and one
      was a genuine defect, zero-width regex matches splitting a plain run in
      two. It was never wired in with `|| true`. The five, kept for the record:
      - `tests/components/DesignFilesPanel.test.tsx` (two cases) — clicks
        batch-delete and expects `onDeleteFiles` immediately, but the code
        grew a bulk preview dialog in front of that call, and the callback's
        signature gained an options argument. **The test asserts a flow the
        product no longer has**; this is the Phase 4 bulk-actions work
        regressing a suite nothing was running.
      - `tests/changelog-parse.test.ts` — folding a wrapped bullet into one
        entry and splitting its bold lead.
      - `tests/dim-sum.test.ts` — the draw must return nothing when the first
        roll loses. Worth treating as a real defect until proved otherwise:
        this is the 10%-per-launch contract.
      - `tests/components/WorkspaceTabsBar.test.tsx` — Home stays pinned
        leftmost when a tab is dropped on its left edge.
      - `tests/components/regex/evaluate.test.ts` — zero-width matches must
        paint nothing.
- [x] **Re-run the unverified findings.** Done on 2026-08-04 by a read-only
      refutation pass. Of the 15 substantive claims settled: **7 confirmed, 4
      refuted, 3 already fixed, 1 informational.** Refuting four of them was
      worth as much as confirming the rest — each looked entirely plausible:
      - *Refuted:* the contrast readout does **not** round across the WCAG
        boundary. It rounds to nearest for display but computes the pass/fail
        verdict from the **unrounded** ratio, and its relative-luminance
        formula is correct sRGB. The finder confused the displayed string with
        the verdict.
      - *Refuted:* the colour sliders' off-grid `step` values cause a thumb
        offset of ≤0.07% of the track, not drift or a stuck control — a
        programmatic value set fires no `change` event, so no feedback loop
        exists.
      - *Refuted:* typing `100` into a 0–255 channel field is never clamped
        mid-keystroke; every intermediate (`1`, `10`, `100`) is already in
        range.
      - *Refuted:* the notification centre **does** retain dismissed records —
        dismissing clears `live` and never removes. (Two real caveats it
        raised in passing: the history is in-memory only, so a reload loses
        it, and it is capped at 200.)
      The confirmed ones are tracked as their own items above and below.
      **The standing lesson: an unrefuted finding is a lead, not a fact.**
- [ ] **A second flake, in the desktop suite — now proved rather than
      suspected.** A range-request assertion
      (`expected [] to deeply equal [ StringMatching /^bytes=\d+-$/ ]`) failed
      on a **documentation-and-image-only commit**, which cannot have caused
      it, and a second run of the byte-identical tree **passed**. One tree,
      two verdicts: that is the definition, not an inference. Two intermittent tests is the point at which people
      start re-running rather than reading, so this needs the same treatment —
      find the non-determinism, do not raise a timeout.
- [ ] **`App.connectors.test.tsx` is flaky, and that matters more now.**
      "keeps telemetry and content sharing enabled when the first-run banner
      share choice is clicked" failed on a **documentation-only commit** and
      passed on a re-run of the identical tree with no change — which is the
      definition of a flake rather than a regression. It was harmless while
      nothing ran this suite; now that the suite gates every push, an
      intermittent failure trains readers to re-run a red gate instead of
      reading it, which is how a gate stops working. Find the non-determinism
      (a timer, an unawaited effect, or shared state across the file's cases)
      rather than raising a timeout.
- [ ] **Give the colour module a test file.** Five of the seven confirmed
      findings live in `components/appearance/` — `color.ts`, `translate.ts`,
      `contrast.ts`, `colorNames.ts`, `InfiniteColorPicker.tsx` — and the whole
      module has **no test anywhere** under `apps/web/tests/`. Those two facts
      are the same fact.

- [ ] **4.13 Remaining Cantonese waves.** The dictionary keys not reached in
      Phase 3, tracked wave by wave alongside the component waves.
- [ ] **4.14 Remaining Material Design 3 waves.** Whatever the audit in 2.4
      wave 8 turns up, plus the surfaces added by Phase 4 itself, which must be
      built to the token layer rather than retrofitted to it.

---

<details>
<summary><strong>Standards conformance matrix</strong> — all sixteen standards, the phase that lands each, and today's honest status</summary>

The matrix exists so "not implemented" stops being true one row at a time,
visibly. Most rows have now moved, and the honest reading of that movement is
**built, and in one downloadable build as of `v0.16.1-r18.1`** — not
*audited*. Where a surface has been operated by a human, the row says so; no
row below claims that yet, because nobody has driven this interface.

One distinction runs through several rows and is worth stating once: a module
that exists and typechecks is not a shipped feature if nothing mounts it. An
audit on 2026-08-04 found three that nothing did — the appearance editor, its
infinite colour picker, and the whole spoken narrator. The narrator is now
wired to a real settings section; the other two are still orphaned, and their
rows say so rather than counting their file size as progress.

| # | Standard | Phase | Status |
| --- | --- | --- | --- |
| 1 | Language modes and two funny-level sliders | 3.1, 3.2 | **Built.** `zh-HK` ships as the twentieth locale, satisfying `Dict` by spreading `zh-TW` and overriding the namespaces rewritten into Cantonese; the persisted language mode (`single`/`bilingual`) and both per-language funny sliders intercept at `t()`, so no component participates. What is unfinished is *coverage*: how much of the dictionary is genuinely Cantonese rather than inherited, tracked at 4.13 |
| 2 | Full Material Design 3 conformance | 2.1–2.4 | **Colour landed; anatomy did not, and a capture proved it.** The token sheet, its mapping layer and the Windows frameless title bar are real, so every component inherits M3 roles. But the mockup's defining furniture is absent from the running screen: no persistent navigation rail (the component exists and collapses to a **zero-width** track, so a fresh install shows none), no header search bar, no 28px status bar. A reader comparing the shipped capture to `mockups/` would say it is still the upstream screen in new colours, and for the anatomy they would be right |
| 3 | Runtime appearance customization | 2.5, 4.10–4.12 | **Built and reachable.** Theme, accent and density persist and are reachable from the settings dialog and the command palette. The editor behind them — the infinite colour picker, the colour translator, the contrast readout, presets and typography — had **zero importers** and is now mounted: the picker is the accent control, with the fixed swatches kept as a convenience layered on it rather than replacing it, and the runtime mounts in `App.tsx` so a chosen preset survives a reload. Unaudited: nobody has operated any of it |
| 4 | Regex builder on every search bar | 3.3 | **Partial.** The command palette and the settings tab overflow menu now have independent anchored builders with bounded local matching; the remaining search inventory, including the four tab-discovery fields, is still open. [`6f03a832`](https://github.com/Ding-Ding-Projects/material-designer/commit/6f03a832a0a7f57d0f2bf1b7f4d3aef5e6c4f5a6) is source-level evidence only |
| 5 | Browser-style tabs everywhere | 3.7, 4.1 | **Partial, with the settings surface now tabbed.** The settings dialog has a 17-section tab strip, a viewport-bounded above/below overflow surface, local search and its own regex builder; the workspace tab strip, pinning, grouping, four discovery searches and bulk-close actions remain open. **New requirement, added to the shared instructions on 2026-08-04 at the user's direction: settings surfaces are tabbed too, in every app** — the capture at `90e52d3` records the old scrolling section list, while [`34426621`](https://github.com/Ding-Ding-Projects/material-designer/commit/34426621) records the follow-up geometry repair |
| 6 | Non-blocking notifications | 4.2 | **Built and mounted.** `NotificationHost` mounts in `App.tsx`, the centre opens from the tab bar. Two audit findings stand against it and are unverified: an empty-state that promises history the centre may not keep, and destructive paths still using blocking `confirm()`/`alert()` where a toast belongs — one such `alert()` was removed today |
| 7 | Super-confirmation gate | 4.3 | **The boundary exists; the interface routing is unfinished.** The gate is built and mounted, its eight confirmed defects are closed, and the three irreversible deletes are now enforced in the daemon's own handler behind a single-use per-resource token — so a `curl`, a script or a third-party client cannot delete in one replayable request. That is the authorization boundary the standard asks for. What remains is affordance coverage: some delete buttons still reach the operation through a plain dialog rather than two keys and a slider. Nobody has operated any of it |
| 8 | Command palette | 3.6 | **Built and mounted**, with an indexed settings surface, live inline controls whose union is exhaustive, and its own anchored regex builder. Unverified: whether the index covers every setting the dialog actually has, and whether the new builder passes hosted verification |
| 9 | In-app changelog viewer | 3.5 | **Built and mounted.** `ChangelogDialog` mounts in `App.tsx` with a date-range filter and generated entries. Unverified: commit-link validity at build time |
| 10 | Local version history | 4.4 | **The panel now exists and is mounted.** The store was never the gap: `apps/daemon/src/history/` and five `/api/history` routes have been there since 2026-08-03, and a search of `apps/web/src` for `VersionHistory`/`versionHistory`/`version-history` returned nothing at all — the undo existed with no door. `VersionHistoryDialog` mounts in `App.tsx` and opens from Settings → About and the entry help menu, carrying the reused `ChangelogDateRange`, an action filter whose facets and counts are **derived from the loaded revisions rather than declared** (so no filter is offered that the store cannot produce — "imported" is the worked case, and it correctly never appears), a domain filter, and its own `RegexSearchField` controller. All four compose; 24 cases in `apps/web/tests/lib/history-actions.test.ts` pin that. Not done: it is absent from the command palette, discarding unsaved work is not yet recorded before a close completes, and **nobody has run or operated any of it** — this checkout has no Node toolchain, so types, tests and rendering are unverified until CI |
| 11 | Export everything, bulk actions | 4.5, 4.6 | **Partial.** Export paths and the bulk machinery (selection, plan, preview, runner, outcome messages) exist and are well-factored — the runner is now genuinely used rather than dead. Missing: the full archive option set, and bulk actions on every list rather than the few that have them |
| 12 | Dim sum surprise | 3.4 | **Built and mounted.** `DimSumSurprise` mounts in `App.tsx` against the bundled 24-dish catalogue under `assets/dim-sum/`. Unverified: the 10%-per-launch draw and the once-per-launch cap in a running build |
| 13 | Release code name and line count | 1.1 | **Met, and demonstrated twice.** Both published releases carry a different dish code name with its photograph attached, and a line count measured by the committed counter at the released commit, broken down by category and by surviving-line authorship |
| 14 | Accessibility and sizing as blockers | Every phase | **Partial, source-level audit only.** The final six-finding Figma repair is [`a5a9365`](https://github.com/Ding-Ding-Projects/material-designer/commit/a5a9365b141bb7d31a08c0a8f08c2e61bbc2aefe), the residual drop/input repair is [`8b76513`](https://github.com/Ding-Ding-Projects/material-designer/commit/8b7651350daa8b3fdcda3dc9c74e44d7a8d880dd), the corrected focus-trap contract is [`cbdc4f5`](https://github.com/Ding-Ding-Projects/material-designer/commit/cbdc4f5ae673b7387445ad8e2fc0ba49dcdacb4e) with wrap-edge proof tightened in [`ac3ba56`](https://github.com/Ding-Ding-Projects/material-designer/commit/ac3ba56), and the settings overflow menu's local search/keyboard route is [`6f03a832`](https://github.com/Ding-Ding-Projects/material-designer/commit/6f03a832a0a7f57d0f2bf1b7f4d3aef5e6c4f5a6). Focused source tests and the `MODIFICATIONS.md` allowlist are committed; no local build, CI run, installed-build capture or runtime matrix is claimed. The 100/125/150/200% narrow-width bilingual runtime matrix and installed-build captures remain open |
| 15 | All assets bundled locally | 2.2, 1.3 | **Met for the application and the site.** The site is bundled and its deployment enforces that at publish time; the application's one CDN font import is gone, with the three Cairo subsets bundled under `apps/web/public/fonts/cairo/`. The mockup still carries three, and it ships to nobody. Roboto Flex, Roboto Mono and Material Symbols are not bundled because nothing consumes them yet — 2.2 tracks that as its own work, not as a violation of this row |
| 16 | Docs, changelog, roadmap accurate; honest CI evidence | 1.1, 1.2 | **Partially in place.** `CHANGELOG.md` exists with a section per published tag and a commit link on every entry; this file, the notice file and `docs/` are kept honest. The recurring failure is staleness rather than invention — several documents claimed nothing had been built for some time after two releases existed |

</details>

<details>
<summary><strong>What the mockup does not solve</strong> — eleven gaps between the design document and the standards, recorded so nobody ports a gap by accident</summary>

The mockup is a strong specification for ten screens and the visual system
behind them. It is not a complete specification of the product, and copying it
faithfully would leave these holes:

1. **No super-confirmation gate.** Delete actions exist in two places with no
   two-key, slider, or emergency-exit treatment.
2. **No infinite colour picker or colour translator.** The seed control is four
   fixed swatches.
3. **No per-element appearance editor.** No context-menu appearance command, no
   modifier-click path, no anchored per-element editor — only global theme,
   seed, density and scale plus tab-title typography.
4. **No word-depth typography editor.** The tab-title card offers a small
   fraction of the required controls.
5. **No named presets, theme export/import, or reset.**
6. **No tab overflow surface, pinning, grouping, or tab-discovery searches**,
   and no bulk close by text.
7. **The regex builder is one shared floating panel** at a fixed viewport
   position that four fields open, rather than an anchored builder per field.
8. **The dim sum surprise is shown with an off switch**, which the standard
   forbids.
9. **Fonts and icons come from a CDN.** The port must bundle them.
10. **The token layer is declared but not consumed.** Shape and easing variables
    are referenced zero times; three further variables are declared and never
    read; every radius and easing is a literal. Scaling is done with a
    non-standard CSS property while the variable meant to drive it is ignored.
11. **The branding and version in the mockup are neither the shipping brand nor
    the shipping version.**

</details>

<details>
<summary><strong>Known risks and open questions</strong> — the things most likely to cost a day each, and the one thing that could invalidate a phase</summary>

**Native compilation on the CI runner.** The SQLite binding has no prebuilt
binary for this platform and runtime combination and compiles from source. If
the runner image lacks the C++ workload or a Python interpreter, install fails
in a way that looks like a dependency problem and is actually a toolchain
problem. Measure the runner's actual capabilities rather than assuming from
published specifications.

**Line-ending conversion breaking the verifier.** Covered in 1.1, repeated here
because it will look like a catastrophic failure the first time it happens and
is a one-line configuration fix.

**Allowlist churn.** Nearly every item in Phases 2–4 edits files under
`design/`, and each edit needs an entry in the notice file. As that list grows,
the value of the verbatim import decreases and the cost of tracking upstream
increases. At some point the honest answer may be to stop describing the tree as
verbatim and describe it as a fork with a recorded delta. That decision is not
made here, but it should be revisited when the allowlist passes a few dozen
paths.

**A drop-in contract whose production shell is now wired, but still unseen at runtime.** The mockup's handoff
sheet maps 18 tokens onto variables that all existed, and names 12 component
files that all existed. The mapping layer landed at `dea6b0a`, and the bounded
shell/home completion landed at [`a03c16d9`](https://github.com/Ding-Ding-Projects/material-designer/commit/a03c16d939262ddc0482c104ef1b1b6d14fc2651), so those variables and geometry contracts now resolve in source. Whether that produces a *correct-looking* installed interface has still not been checked. The contract has gone from promising to statically checked; it has not gone to runtime-proven.

**Upstream Windows support is best-effort.** The imported project treats macOS,
Linux and a Linux compatibility layer as its primary platforms and Windows as
best-effort. This project targets Windows first. Expect to find and fix issues
upstream has not, and expect some of them to be in areas — file paths, process
handling, native modules — where a fix is not a small patch.

**Documentation discrepancies in the imported tree.** At least one dependency
version stated in the imported contributor documentation disagrees with the
version the manifest and lockfile actually pin. When citing a version, cite the
manifest, not the prose.

**Scale of the mechanical work.** Two items dominate the remaining effort: the
Cantonese dictionary at roughly 4,200 keys, and the component migration across
roughly 197 component files and 42 stylesheets. Both are tracked as waves for a
reason. Neither can be honestly represented as a single checkbox, and any plan
that treats them as one is a plan that will be wrong for a long time before
anyone notices.

</details>

---

## The rule that governs every item above

An item is complete when the behaviour is implemented, tested, documented, the
changelog and this roadmap reflect it, the work is merged into the default
branch and pushed, and the CI evidence is recorded as it actually stands —
running, failed, or verified.

Never predicted. Nothing here has been verified yet except Phase 0.
