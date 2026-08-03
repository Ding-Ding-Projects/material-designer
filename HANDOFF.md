# Handoff

State of play for whoever picks this up next.

Read this before touching anything.

**Where it is.** The upstream tree was imported and *proved* byte-for-byte
identical to its source, rebranded into a genuinely standalone application, and
brought onto Material Design 3. All three workflows have run and passed. Two
Windows installers have been built and published under their own tags, and the
packaged smoke test installed one of them, launched it, made the running process
answer its own health endpoint from inside its renderer, and uninstalled it with
no residue.

**What that does not mean.** Two things, and they are the ones most likely to be
overclaimed by someone skimming:

1. **Nobody has looked at the running interface.** The smoke test captures one
   screenshot and asserts it is more than zero bytes. Nothing has inspected what
   is actually on it. Every statement in this repository about how the product
   *looks* is read from source or from the design mockup, never observed.
2. **The most recent installer predates most of the redesign.** The published
   releases were built before the Material Design 3 anatomy pass, the Cantonese
   locale, the regex builder, the command palette, the changelog viewer, the
   notification centre, the destructive-action gate, the bulk actions, the
   appearance editor, the narrator, and the daemon's version history, export and
   editor capabilities. All of that is on `main` and verified by continuous
   integration; none of it is in a downloadable build yet.

**The one habit worth inheriting.** Every claim in this repository is written so
a reader can check it — a command to run, a run to open, a counter to compare.
Where something has not been checked, it says so in the same sentence. The value
of that is entirely in the discipline: the moment one confident-but-unverified
line survives, a reader cannot trust the ones beside it either.

> [!NOTE]
> **Sections 1 and 2 describe the first working session and have not been
> rewritten since.** They are kept as a record of how the repository got its
> shape, not as a description of where it is now. Where they disagree with the
> table below or with section 4, the table and section 4 are current and they are
> not.

---

## Status at a glance

| Area | State | Evidence |
|---|---|---|
| Upstream source imported into `design/` | **Done and proved** | `scripts/verify-port.sh` → 0 gaps across 11,799 files, exit 0 |
| Apache-2.0 §4(b) notice | **Done, and consistent** | `MODIFICATIONS.md` declares its paths; verifier reports 0 stale notices and 0 undeclared differences. Run the script for the current count |
| Verifier for the import | **Done and self-tested** | six deliberate gap classes, all detected |
| Material Design 3 mockup preserved | **Done** | `mockups/open-design-m3/`, 5 tracked files |
| Rebrand to Material Designer | **Built, installed and asserted** | the smoke test checks the installed uninstaller's name, the registry entries' product name and application id, and the running process's version |
| Continuous integration | **All three workflows have run, and have failed and been fixed** | *Verify*, *Release* and *Pages* have each completed. Failures are recorded in `docs/troubleshooting/` rather than forgotten |
| Install / build / typecheck / test | **Run, and passing** | workspace install with the native binding compiled from source, full typecheck on both Linux and Windows, unit suites on Linux, Windows identity suites on Windows |
| Windows installer | **Two built and published** | `v0.16.1-r7.1` and `v0.16.1-r8.1`. **Both predate most of the redesign** — see the note above |
| Material Design 3 anatomy | **Landed, unseen** | buttons, text fields, radii, elevation, navigation rail, dialogs, menus, cards and scrim. Verified by typecheck and unit tests; **not looked at** |
| Language modes | **Landed, unseen** | `zh-HK` Cantonese, bilingual mode, two per-language funny sliders. 20 locales, 4,504 keys, no duplicates |
| Regex builder · command palette · changelog viewer · dim sum · tab pinning and bulk close | **Landed, unseen** | on `main`, typechecked, unit-tested |
| Notification centre · destructive-action gate · bulk actions · appearance editor · narrator · context-menu shortcuts | **Landed, unseen** | merged from `phase4-wip`; its adversarial verification lenses **never ran** — see section 4 |
| Version history · export · external editor | **Landed, unseen** | daemon endpoints, shared DTOs and `od` subcommands |

---

## 1. What this repository is right now

The load-bearing pieces:

1. **`design/`** — a byte-verbatim copy of the upstream Open Design monorepo at
   version 0.16.1, 11,799 files, Apache-2.0. This is the product: a local-first
   design workspace built from a Node daemon, a web front end, an Electron
   desktop shell, a packaged launcher and a landing page.
2. **`vendor/open-design`** — the upstream repository kept as a pinned Git
   submodule at commit `517f39acde402c1a7af2189167a8d6957a3dac71`. It exists so
   the copy can be checked against its source; it is not built and not shipped.
3. **`mockups/open-design-m3/`** — a design-canvas mockup that specifies the
   intended Material Design 3 redesign of this product's own interface. Five
   tracked files. It is a specification, not code, and is wired into no build.
4. **`MODIFICATIONS.md` + `scripts/verify-port.sh`** — the licence notice and
   the machine that enforces it. Described in [section 5](#5-constraints-a-successor-must-respect).
5. **`.github/workflows/`** — this project's own three workflows: `verify.yml`
   (*Verify*), `release.yml` (*Release*) and `pages.yml` (*Pages*). All three have
   since run — see the table above. At the time this section was written they were
   a plan expressed in YAML; they are no longer.
6. **Governance and support files** — `README.md`, `AGENTS.md`, `ROADMAP.md`,
   this file, the `docs/` tree, the bundled dish catalogue under
   `assets/dim-sum/`, the static site source under `site/`, and the rest of
   `scripts/` (`line-count.mjs`, `upstream-manifest.tsv`, `import-dim-sum.sh`,
   `release-codename.sh`).

There is deliberately **no root `package.json`** — the workspace root is
`design/`. That, and not a missing workflow directory, is why every build command
runs one level down.

---

## 2. What was done in this session

Three commits, in order.

### `chore(design): move the M3 mockup out to mockups/ so design/ can hold the real thing`

The Material Design 3 mockup and its two companions (`support.js`, `assets/`)
had been sitting at the top of `design/`. That was harmless while `design/` held
nothing else, and became a collision the moment an entire monorepo — which ships
its own top-level `assets/` — was about to move in. All three moved together,
because the mockup HTML loads its script and SVGs by relative path and fails
silently without them. New home: `mockups/open-design-m3/`.

### `feat(design): import open-design v0.16.1 verbatim, all 11,799 files`

The whole upstream tree copied into `design/`. Two decisions matter for anyone
auditing this later:

- **Copied as raw blob bytes out of the pinned submodule, not out of a checked-out
  working tree.** A working tree on Windows is line-ending–smudged, and copying a
  copy is how a port ends up "basically the same" — a phrase that cannot be
  verified. Filtering was disabled on both ends, so every blob identifier in
  `design/` is identical to upstream's, and all 73 executable bits survived.
- **Nothing was modified in this commit.** Not a rename, not a lint fix, not a
  stray newline. Adaptations land in their own commits so that the diff of *what
  we changed* never has to be excavated out of the diff of *what we copied*.

Two files are force-added past the ignore rules, exactly as upstream force-adds
them past its own.

### `feat(scripts): prove design/ matches upstream, and make the licence notice do the proving`

`scripts/verify-port.sh` — pure Git and shell, no Node anywhere in it, because it
must run **before anything is installed**, on a fresh checkout with no toolchain
present. A verifier that needs the dependency tree it is meant to vouch for is a
verifier that cannot be run first. It performs two independent checks, because
they fail for different reasons:

- **Check A — bytes on disk.** Every file is hashed with filtering disabled and
  compared to the upstream blob identifier. Catches a stray edit, a truncated
  copy, a missing file.
- **Check B — what Git actually recorded.** Every tracked path under `design/` is
  compared on **mode and blob identifier**. Catches line endings quietly
  normalising and executable bits falling off, neither of which Check A can see.

The load-bearing idea is that **`MODIFICATIONS.md` is simultaneously the
Apache-2.0 §4(b) notice and the allowlist the verifier reads**. A file may differ
from upstream only if it is listed there. Change a file and forget to write it
down, and verification fails. Write one down and later revert it, and
verification also fails — as a *stale notice*. The legal paperwork and the code
cannot drift apart, because the same command checks both.

---

## 3. Verification evidence

This is the only thing in this repository that has actually been executed.

`scripts/verify-port.sh` re-run while this document was being updated, against
the working tree at commit `65e288f` (which carries the rebrand edits, declared).
**Exit code 0:**

```
verify-port: design/ vs upstream @ 517f39acde402c1a7af2189167a8d6957a3dac71 (via submodule)
  expected       11799
  tracked        11799
  present        11799
  declared       67   (MODIFICATIONS.md)
  missing        0
  bytes differ   0
  mode mismatch  0
  oid mismatch   0
  extra          0
  untracked      0
  stale notice   0
verify-port: 0 gaps.
```

Machine-readable form, `scripts/verify-port.sh --json` (one line, wrapped here):

```json
{"pinned":"517f39acde402c1a7af2189167a8d6957a3dac71","source":"submodule",
 "expected":11799,"tracked":11799,"declared":67,"missing":0,"bytesDiffer":0,
 "modeMismatch":0,"oidMismatch":0,"extra":0,"untracked":0,"staleNotice":0,"gaps":0}
```

Note the `source` field and the `(via submodule)` suffix on the header line: the
verifier names which upstream reference it compared against, because it accepts
two (see [section 5.1](#51-design-stays-byte-verbatim-and-every-exception-is-written-down)).
A run that fell back to the committed manifest would say `(via manifest)` and
`"source":"manifest"` instead, and must otherwise reach the same verdict.

**How to read this.** `gaps 0` is the contract holding on both ends at once: the
import has not drifted *and* all 67 rebrand changes carry an Apache-2.0 notice.
`declared 67` with `stale notice 0` means every notice describes a real
difference and every real difference has a notice — neither list has run ahead of
the other.

**`declared` moves; `gaps` must not.** Every further rebrand edit raises
`declared`, and any edit made without its allowlist entry turns this into a
non-zero `bytesDiffer` and exit 1. Re-run the script rather than quoting this
transcript — it was true when written, which is a different thing from being true
now.

### The verifier was tested by breaking things first

A checker that has only ever seen a passing tree has not been tested; it has been
*hoped at*. Before it was trusted, each of these six gap classes was created
deliberately and confirmed to be reported:

| # | Gap class | Injected by | Reported as |
|---|---|---|---|
| 1 | Missing file | deleting a file from `design/` | `missing` |
| 2 | Corrupted bytes | editing a file's contents | `bytes-differ` |
| 3 | Stripped executable bit | clearing a mode bit on a tracked script | `mode` |
| 4 | Undeclared edit | changing a file with no `MODIFICATIONS.md` entry | the underlying gap, unsuppressed |
| 5 | Declared edit | changing a file **with** an entry | suppressed — verification passes |
| 6 | Stale declaration | an entry whose file no longer differs | `stale-notice` |

Classes 4, 5 and 6 are the ones that make the notice enforceable rather than
decorative: an undeclared change fails, a declared change passes, and a
declaration left behind after the change was reverted fails too.

<details>
<summary>Verifier counter reference — what each number means and how it fails</summary>

| Counter | Meaning |
|---|---|
| `expected` | files in the pinned upstream tree |
| `tracked` | paths tracked under `design/` in this repository |
| `present` | expected files actually found on disk |
| `declared` | paths listed as changed in `MODIFICATIONS.md` |
| `missing` | expected files not on disk |
| `bytesDiffer` | on-disk bytes do not hash to the upstream blob identifier |
| `modeMismatch` | file mode differs from upstream (executable bit lost or gained) |
| `oidMismatch` | recorded blob identifier differs from upstream |
| `extra` | tracked under `design/` but absent from upstream |
| `untracked` | loose, non-ignored files in `design/` — what an interrupted copy leaves |
| `staleNotice` | declared in `MODIFICATIONS.md` but no longer actually different |
| `gaps` | total after allowlist suppression; **exit 0 only when this is 0** |

Exit codes: `0` clean, `1` gaps found (first 50 printed to standard error),
`2` cannot run — **neither** the submodule nor `scripts/upstream-manifest.tsv` is
available, the manifest disagrees with a submodule that is present, or Check B
found zero tracked paths and would have been a silent no-op.

The script refuses to pass when Check B has nothing to compare. A checker that
silently does nothing reads exactly like a checker that passed, which is the
worst possible failure mode for this kind of tool.
</details>

---

## 4. What is **not** verified

Stated plainly, because every one of these is a place where a reader could
reasonably assume otherwise. An earlier revision of this section said nothing had
been installed, built, tested, packaged or run; all five had happened by then, and
that is the specific failure this section now exists to avoid repeating.

**What is verified, so the list below is read against something.** The workspace
installs on a hosted Windows runner with the native database binding compiled from
source; the full workspace typechecks with the rebrand in place; unit suites run on
Linux and the Windows identity suites run on Windows; two installers were built,
payload-validated, published, and one of them was installed, launched,
health-checked and uninstalled by the packaged smoke test with seven residue checks
clean.

Now the gaps.

- **No workflow has been observed failing.** Every gate has been watched passing
  and none has been watched rejecting a bad tree, so none of them is yet *known*
  to be a gate. Deliberately introducing an undeclared change under `design/` and
  watching the port verifier go red is the cheapest way to close this, and it has
  not been done.
- **Nobody has looked at the running interface.** The smoke test captures one
  screenshot, asserts the file is non-zero and saves it into the run's report; it
  inspects nothing in the image. No capture has been reviewed, none has been taken
  at any other display scale, and none exists at a narrow width or in a second
  language. Every visual claim anywhere in this repository is therefore read from
  source, not seen.
- **The test run is a gate on identity, not coverage.** The suites that run were
  chosen because the rebrand changed what they assert. The imported tree carries
  roughly 1,150 test files; most of them have never run here, and a green release
  says nothing about them.
- **The Material Design 3 contract is built but unproved.** The token sheet and its
  mapping layer landed, so components inherit M3 roles. Whether that produces a
  correct-looking interface is untested, for the reason two bullets up.
- **The window title has never been read off a window.** The rebrand *is* proved as
  installed identity — the smoke test asserts the uninstaller's name, the registry
  entries' product name and application id, and the running process's version. What
  no assertion covers is the window's own chrome, including the custom title bar
  added at `dea6b0a`.
- **No request in the daemon's request collection has been sent.** The 368 requests
  were derived by reading route definitions; no daemon has been started here, and
  at least one route pair was missed by that reading. See
  [`docs/api/README.md`](docs/api/README.md).
- **Nothing but Windows is published.** There is no macOS or Linux artifact, no
  updater feed, and no code-signing certificate — so every installer trips the
  operating system's reputation warning on first run.

Separately, and unchanged: the 48 workflow files that came in with the upstream
tree under `design/.github/workflows/` are **inert here**. Workflows are only read
from the repository root, those are upstream's, and they are not wired to this
repository. A reader glancing at the tree will assume they are this project's CI.

Treat any claim beyond what is listed as verified above as unverified until a run
proves it.

---

## 5. Constraints a successor must respect

Two of these are hard. Breaking either one costs a working day.

### 5.1 `design/` stays byte-verbatim, and every exception is written down

`scripts/verify-port.sh` must keep reporting **0 gaps**. That does not mean
`design/` can never be edited — it means an edit is a two-part operation:

1. Make the change under `design/`.
2. Add an entry to `MODIFICATIONS.md` naming the reason and listing each changed
   path as `` - `path/relative/to/design` `` under a **Changed files** heading.

Skip step 2 and verification fails. Do step 2, then revert the change, and
verification fails as a stale notice. This is intentional. It is also the only
mechanism keeping the Apache-2.0 notice honest as the fork diverges, so do not
route around it by loosening the verifier.

Practical notes:

- The verifier needs *an* upstream reference, not specifically the submodule.
  With the submodule absent it falls back to the committed
  `scripts/upstream-manifest.tsv` and reports `(via manifest)`; exit code 2 comes
  only when neither source is available, or when a present submodule and the
  manifest disagree. This is why the *Verify* workflow checks out without
  submodules.
- Entries inside HTML comment blocks are skipped, so the format template that
  `MODIFICATIONS.md` documents inside a comment is never mistaken for a real
  declaration. Keep new entries outside comments.
- Keep the reason line meaningful. Somebody auditing the licence position later
  reads that column, not the diff.

### 5.2 Building happens in continuous integration, not on a contributor machine

Installing and building this monorepo is heavy: a native database module compiled
from source, an Electron toolchain, a large web application, and a packaging step.
This project's working assumption is that **all install, build, typecheck, test,
package and run steps execute on a hosted Windows runner in continuous
integration** — not on whatever machine a contributor happens to be sitting at.

What that means in practice:

- Do not add a step that assumes a local build has already happened.
- Do not "just check it quickly" locally as a shortcut, then write down the result
  as evidence. Evidence is a run link, and a run link comes from CI.
- Local work is limited to editing files and running the pure-shell verifier,
  which is why the verifier has no Node dependency.

### 5.3 This is a public repository

Nothing that identifies a machine, an account, a network address, a filesystem
path outside the repository, or any internal tooling goes into a tracked file.
Generalise rather than delete: describe the *kind* of host or path, never the
specific one.

### 5.4 Never write down a success that has not happened

A run is `running`, `failed`, or `verified` — never predicted. Do not describe an
installer that has not been produced, a test that has not passed, or a workflow
that has not gone green. This document exists partly as an example of that
discipline; keep it that way when you update it.

---

## 6. Immediate next steps, in order

The ordering matters. Each step is cheap to do after the one before it, and
expensive before.

<details>
<summary><b>Steps 1–5 of the original list are done</b> — kept for the record, and because two of them left traps worth knowing about</summary>

The first five steps were: get a *Verify* run recorded; let the Windows build
workflow run and expect it to fail; get package-scoped suites running; produce
the first installer; and prove the rebrand at runtime. All five happened.

Two things they left behind that a successor will still meet:

- **Line endings are the port verifier's one real hazard.** The repository
  normalises text, so a runner checking out with automatic CRLF conversion smudges
  `design/` and the working-tree check reports thousands of byte differences on a
  tree that is perfectly fine. That is why the gate runs on Linux. Submodules stay
  optional — the committed manifest is the fallback.
- **The build did fail first, repeatedly, and the failures were environmental
  rather than code defects** — suites asserting a Unix executable bit a Windows
  filesystem does not store, a test budget written for a developer's disk, a
  package importing output that had not been compiled, and a packaging property
  that moved between major versions. Each is written up under
  [`docs/troubleshooting/`](docs/troubleshooting/); read that directory before
  concluding a red run means the tree is broken.

The rebrand is now proved as *installed identity*: the smoke test asserts the
uninstaller's name, the registry entries' product name and application id, and the
running process's version. What it does not check is the window's own chrome, so
the window title still has not been read off a window.

</details>

1. **Watch something fail on purpose.** Every gate in this repository has been
   observed passing and none has been observed rejecting anything, which means
   none of them is yet known to work. Introduce an undeclared change under
   `design/` and confirm the port verifier goes red; introduce a remote asset into
   the site and confirm the deployment refuses it. Both are cheap, both are
   reversible, and until they are done the green ticks mean less than they look
   like they mean.

2. **Look at the running interface.** The packaged smoke test already captures a
   screenshot into its report and asserts only that the file is non-zero. Review
   that capture, then extend the capture path to the display scales and narrow
   widths the standards require. This is the single largest gap in the project's
   evidence: a Material Design 3 redesign is exactly the kind of work that can be
   entirely correct in source and visibly wrong on screen, and nothing here would
   currently catch that.

3. **Cut a release that actually contains the work.** Both published installers
   predate the Material Design 3 anatomy pass, the language modes, and every
   Phase 3 and Phase 4 surface. `main` is green; the next *Release* run produces
   the first build a person could install and see any of it in. Until then, the
   download link on the site is honest but stale.

4. **Run the verification that never ran.** The Phase 4 surfaces — notification
   centre, destructive-action gate, bulk actions, appearance editor, narrator —
   were written by agents that hit a session limit before their adversarial
   review lenses executed. Typecheck and unit tests pass, which proves the code
   compiles and its units behave; it does not prove that the confirmation gate
   cannot be bypassed, that every destructive action routes through it, that no
   control merely *looks* operable, or that the colour translator's arithmetic
   is right. Those four questions are written up in the workflow script under
   the session's workflow directory and are worth re-running verbatim.

5. **Bundle the fonts and icons locally.** The application's stylesheet still
   carries one font import from a public font service, and the mockup carries
   three. The site is already fully bundled and its deployment enforces that at
   publish time; the application has no equivalent gate, so add one rather than
   relying on review.

6. **Broaden what the release actually tests.** The suites that run were chosen
   because the rebrand changed what they assert, so the current gate is on product
   identity rather than coverage. The imported tree carries roughly 1,150 test
   files. Add them package by package — upstream deliberately ships no root
   aggregate test command, and one must not be invented.

7. **Send the request collection against a real daemon.** All 368 requests were
   derived by reading route definitions, and at least one route pair was missed by
   that reading. Running them would settle both the collection's accuracy and the
   route counts in [`docs/api/README.md`](docs/api/README.md) at once.

---

## 7. Known risks, with mitigations

### GitHub Projects: available

The credential now carries the `project` scope (read and write), granted through
GitHub's OAuth device flow, so Projects can be listed, created and updated. It was
briefly unavailable and briefly out of scope by decision; both are now superseded.

Narrative progress still lives in the rolling build-log Discussion and the burn-down
in [`ROADMAP.md`](ROADMAP.md) — a board tracks state, not reasoning, so it
complements those rather than replacing them.

### External-state limitation: the wiki has no first page

The wiki is **enabled** on the repository, but GitHub does not create the wiki's
underlying git repository until a first page is saved through the web interface,
and there is no API that will do it. Cloning
`…/material-designer.wiki.git` therefore returns *Repository not found*, and no
amount of retrying changes that.

*Mitigation:* create any page once through the web interface; the wiki repository
then exists and can be cloned and pushed to like any other. Until then this is not
a documentation gap — the categorized documentation lives in [`docs/`](docs/) and
is the canonical copy either way, with the site as its published form. A wiki would
be a third surface, not the only one.

### Native module compilation on Windows

The daemon depends on a native SQLite binding that has **no prebuilt binary** for
the pinned Node major version on Windows. Installation will compile it from source,
which needs a C++ build toolchain — Visual Studio Build Tools 2022 or newer with
the desktop C++ workload, plus Python 3 on the path.

*Mitigation:* the hosted Windows runner image already carries the build tools;
verify that assumption in the first build job's log rather than assuming it, and
if the toolchain is missing, install it as an explicit step. Budget a couple of
minutes of build time for this module on every cold run, and cache aggressively
once the build is green. Note also that upstream classifies native Windows as
**best-effort** — the primary supported paths are macOS, Linux and the Windows
Subsystem for Linux. Windows problems here are plausible and are this project's to
solve, not bugs to report upstream.

### The pinned Node major version is not negotiable

Every package in the workspace pins the same Node major, and the version files and
package manager pin is repeated throughout the tree. Upstream's own guidance is
explicit that an earlier major will not do.

*Mitigation:* pin the exact major in the workflow's Node setup step rather than
taking a runner default, and pin the package manager to the version the repository
declares. A silent major-version drift on the runner produces failures that look
like source problems and are not.

### The first CI run is the first time anything is built at all

There is no baseline. Nobody has ever seen this tree install, compile, typecheck,
test or package in this environment. The realistic expectation is **several rounds
of iteration** before the first green run: missing toolchain pieces, path length
limits, native build failures, script assumptions that hold on one platform and not
another.

*Mitigation:* treat the first workflow as a diagnostic instrument, not a gate.
Split it into small, separately-reported steps so a failure names which step failed
rather than "the build". Run it on manual dispatch while iterating so a broken
workflow is not pushed repeatedly. Above all, do not record a predicted outcome —
report the run as running, then report what it actually did.

### The imported tree still carries upstream's identity and integrations

Analytics endpoints, external links, community invites and promotional content came
in verbatim with the copy, because a verbatim copy is the whole point. None of it
is this project's.

*Mitigation:* the product analytics client is a no-op without a credential
configured in the build environment, and no such credential is configured in this
repository — so builds from here transmit nothing on that channel. Describe that
accurately: **no key is configured here**, not "telemetry was removed", because the
code paths are present verbatim and a reader can see them. Everything else
upstream-branded gets addressed by the rebrand step and by documentation that does
not present upstream's links as this project's.

### The mockup is a specification with known gaps

It is a faithful Material Design 3 design for this product, and it does **not**
cover everything the project requires: no super-confirmation gate for destructive
actions, no continuous colour picker or colour-space translator, no per-element
appearance editors, no theme presets or export/import, no tab overflow, pinning,
grouping or tab-discovery searches, one shared regex panel instead of one anchored
per field, and it renders the dim sum surprise with an off switch that the standard
forbids.

*Mitigation:* the roadmap records these as gaps rather than treating the mockup as
complete. Do not read the mockup as the requirement set; read it as the visual
contract for the parts it does cover.

### Two upstream numbers disagree with each other

The imported tree's own documentation states a native database module version that
does not match the version its manifest and lockfile actually pin, and its prose
feature counts do not match the directory counts that actually ship.

*Mitigation:* cite the manifest and count the directories with a script. Never
propagate a documented figure without checking it against the tree — this
repository has already inherited one such discrepancy and should not add more.

---

## 8. Reference

<details>
<summary>Repository layout — every tracked path outside the imported tree</summary>

**Tracked** (`git ls-files | grep -v '^design/'` at `65e288f`):

```
.gitattributes
.gitmodules
MODIFICATIONS.md                            licence notice + verifier allowlist
.github/workflows/verify.yml                this project's Verify workflow
.github/workflows/release.yml               this project's Release workflow
scripts/verify-port.sh                      import verifier, pure git + shell
scripts/upstream-manifest.tsv               upstream file list; verifier fallback
scripts/import-dim-sum.sh                   catalogue import
scripts/release-codename.sh                 release code-name picker
assets/dim-sum/index.json                   bundled dish catalogue index
assets/dim-sum/images/*.png                 24 bundled dish images
mockups/open-design-m3/
    Open Design M3.dc.html                  Material Design 3 specification
    support.js                              generated canvas runtime, no tokens
    .thumbnail
    assets/brand-icon.svg
    assets/logo.svg
design/                                     11,799 imported files, verbatim
vendor/open-design                          pinned submodule, provenance only
```

**Present but untracked** at that commit — real working files, not scratch, and
each one needs committing:

```
README.md  AGENTS.md  ROADMAP.md  HANDOFF.md   (this file)
.github/workflows/pages.yml                 the Pages workflow
docs/                                       18 files, categorized documentation
site/                                        9 files, static documentation site
scripts/line-count.mjs                      the committed line counter CI runs
```

Regenerate both lists rather than trusting this block — it was accurate at one
commit and the untracked half in particular is short-lived by design.
</details>

<details>
<summary>Rebrand touch points — all inside <code>design/</code>, so all need allowlist entries</summary>

Identified by reading the tree. All four have since been edited, and they appear
in the `MODIFICATIONS.md` changed-file list along with the rest of the rebrand;
none of the edits has been compiled or run.

| What | Where |
|---|---|
| Windows application identifier | the packaging tool's Windows builder source |
| Linux application identifier | the packaging tool's Linux builder source |
| Product name and per-channel identities | the release package's channel definitions |
| Window title / brand string | the desktop chrome components |

Scope of the rebrand is deliberately minimal: product name, window title,
installer name and application identifier change. Workspace package names, the
command-line tool name, environment variable prefixes and persisted storage keys
**do not** — changing them would fork the tree far more deeply than the goal
requires, and would break every upstream-shaped path at once.

Trademark position is already recorded in `MODIFICATIONS.md`: the upstream name,
logo and application identity are upstream's, Apache-2.0 grants no trademark
rights, and builds published from here carry their own identity and are not
produced by or affiliated with the upstream project.
</details>

<details>
<summary>Version pins observed in the imported tree — read from its manifests, not assumed</summary>

Recorded so a successor does not have to re-derive them. These are upstream's
pins as imported; none has been exercised here.

- Node major and package manager version are pinned identically across every
  workspace package, the version file and the tool-version file.
- Desktop shell: Electron 41.3.0; packaging via electron-builder 26.8.1, default
  Windows target is the NSIS installer.
- Daemon: Express 5.2.1, native SQLite binding 12.10.0 — note Express 5 wildcard
  route syntax, which differs from Express 4 and matters when reading route files.
- Web: Next 16.2.6, React 18.3.1, Tailwind 4.3.0.
- Landing page: Astro 6.3.5.
- Test runners: Vitest 4.1.6 across most packages, Playwright 1.60.0 for the
  browser end-to-end suite, and the Node built-in test runner in two packages.
- Workspace install runs a post-install step that builds **18** workspace targets
  in a fixed order. There is deliberately no root aggregate build or test command,
  and none should be added.
- Default daemon bind is loopback on port 7456. Exposure beyond loopback requires
  explicit host and allowed-origin configuration.

Nineteen interface locales ship. A Hong Kong Cantonese locale is **absent** —
adding it touches **three** files, all under `design/`, and therefore needs
allowlist entries: a new `apps/web/src/i18n/locales/zh-HK.ts` dictionary, plus
`apps/web/src/i18n/types.ts` (the `Locale` union, the `LOCALES` array and the
label map all live there) and `apps/web/src/i18n/index.tsx` (the import and the
`DICTS` map). A fourth file is *not* needed: `apps/web/src/i18n/content.ts` types
its per-locale marketing bundle as `Partial<Record<Locale, …>>`, so a locale with
no bundle is already legal.
</details>

<details>
<summary>Related documents in this repository</summary>

- **`MODIFICATIONS.md`** — the Apache-2.0 §4(b) notice and the verifier's
  allowlist. Present, declaring 67 rebrand paths, and consistent with the tree;
  see [section 3](#3-verification-evidence).
- **`scripts/verify-port.sh`** — the import verifier. Present, self-tested
  against six gap classes, and reporting 0 gaps at exit 0.
- **`README.md`** — what the product is, how it is meant to be built, and the
  honest warnings a first-time reader needs.
- **`AGENTS.md`** — the invariants and standards an agent working here must hold.
- **`ROADMAP.md`** — the sequenced plan, including which project standards the
  mockup covers and which it omits.
- **`docs/`** — categorized feature documentation, one file per feature.

`CHANGELOG.md`, `CONTRIBUTING.md`, `LICENSE`, `SECURITY.md` and
`CODE_OF_CONDUCT.md` do **not** exist yet; `ROADMAP.md` §1.2 tracks them.
</details>

---

## Keeping this file honest

Update this document in the same change that alters the state it describes — not
afterwards, and not at release time. When the first CI run happens, its result
belongs in [section 3](#3-verification-evidence) and its subject leaves
[section 4](#4-what-is-not-verified). A handoff document that describes a state
the repository left behind is worse than none, because it is confidently wrong and
the reader has no way to know.
