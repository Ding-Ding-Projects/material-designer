# Handoff

State of play for whoever picks this up next. Written at the end of the first
working session, 2026-08-03.

Read this before touching anything. The short version: the source tree was
imported and *proved* byte-for-byte identical to upstream, the rebrand is now
being written on top of it, and **nothing has been built**. No dependency has
been installed, no line has been compiled, no test has run, and no installer
exists. Three workflows now sit at the repository root, but this repository has
observed no run of any of them, so there is still no CI evidence of any kind.

---

## Status at a glance

| Area | State | Evidence |
|---|---|---|
| Upstream source imported into `design/` | **Done and proved** | `scripts/verify-port.sh` → 0 gaps across 11,799 files, exit 0 |
| Apache-2.0 §4(b) notice | **Done, and consistent** | `MODIFICATIONS.md` declares 67 paths; verifier reports 0 stale notices and 0 undeclared differences |
| Verifier for the import | **Done and self-tested** | six deliberate gap classes, all detected |
| Material Design 3 mockup preserved | **Done** | `mockups/open-design-m3/`, 5 tracked files |
| Rebrand to Material Designer | **Edited and declared; never built** | 67 changed paths under `design/`, all declared and verifying clean. Not compiled, packaged or launched |
| Continuous integration | **Defined, never observed running** | `.github/workflows/{verify,release,pages}.yml` committed; no run outcome recorded |
| Install / build / typecheck / test | **Never run** | see [What is not verified](#4-what-is-not-verified) |
| Windows installer | **Does not exist** | nothing has been packaged |
| Project standards (language modes, regex builder, tabs, …) | **Not started** | upstream code as imported does not implement them |

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
   (*Verify*), `release.yml` (*Release*) and `pages.yml` (*Pages*). They exist as
   committed definitions. **No run of any of them has been observed from this
   repository**, so they are a plan expressed in YAML, not evidence.
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
reasonably assume otherwise.

- **Nothing has been installed.** No package manager has run. No dependency tree
  exists in this checkout.
- **Nothing has been built.** No compiler, bundler or transpiler has been invoked.
- **Nothing has been typechecked.** Whether the imported tree typechecks in this
  environment is unknown — it is upstream's code and presumably did upstream, but
  that is an assumption, not evidence.
- **No test has run.** The imported tree carries a large test suite across many
  packages; not one file of it has been executed here.
- **Nothing has been packaged.** There is no installer, no archive, no artifact of
  any kind, and no release.
- **Nothing has been run.** The daemon has never started, the web application has
  never rendered, the desktop shell has never opened a window.
- **No CI run has been observed.** Three workflows of this project's own are
  committed at `.github/workflows/` — `verify.yml`, `release.yml` and
  `pages.yml` — but this repository holds no run link, no job log and no green
  tick for any of them. A committed workflow is a definition, not a result;
  until a run is recorded, treat every job in them as unexercised.
  Separately, the 48 workflow files that came in with the upstream tree under
  `design/.github/workflows/` are **inert here**. Actions only reads workflows
  from the repository root, they are upstream's, and they are not wired to this
  repository.
- **The Material Design 3 handoff contract is unproved at runtime.** The mockup's
  token map names 18 application-side variables and 12 component source files;
  all 30 were confirmed to *exist* in the imported tree by reading it. Whether the
  mapping is correct once rendered is untested, because nothing has rendered.
- **The rebrand is written and declared, but never proved by a build.** 67 paths
  under `design/` carry rebrand edits and all 67 are declared in
  `MODIFICATIONS.md`, so the verifier passes. None of it has been compiled,
  packaged or launched. The rebrand is therefore verified only as *text in
  files* — nobody has seen a window title, an installer name or an application
  identifier produced by it.

Treat any claim beyond this list as unverified until a run proves it.

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

1. **Commit the working tree, then get a first *Verify* run recorded.** The
   workflow already exists (`.github/workflows/verify.yml`, running
   `scripts/verify-port.sh` on push and manual dispatch) and the verifier already
   exits 0 locally, so the remaining work is neither authoring nor fixing — it is
   getting the rebrand edits, the allowlist entries and the untracked governance
   files committed and pushed, then recording the run's real outcome. **Do this
   before anything else** — every later step risks `design/`, and this is the
   guard rail. Note the outstanding work is not small: at `65e288f` the rebrand
   lived entirely in uncommitted changes.
   *Watch the line endings.* The repository normalises text, so a runner that
   checks out with automatic CRLF conversion will smudge `design/` and Check A
   will report thousands of byte differences on a tree that is perfectly fine.
   Either run this job on a Linux runner, or disable the conversion before
   checkout. Submodules are optional — the committed manifest is the fallback.

2. **Let the Windows build workflow run, and let it fail.** `release.yml` is
   already written — it installs the toolchain and dependencies, builds the
   workspace, typechecks and packages — so the work here is running it and
   reading the log, not authoring it. Expect several rounds: this is the first
   time this tree has been assembled in this environment, and the first run's job
   is to *find out what breaks*, not to pass. Record what it says honestly; an
   accurately written-down red run is worth more than a predicted green one.

3. **Get the package-scoped test suites running in CI**, package by package rather
   than as one aggregate. Upstream deliberately ships no root aggregate test
   command; do not invent one. Expect some failures to be *stale expectations*
   rather than defects — the rebrand changed strings that several suites assert
   on, and `release.yml` says so in its own comments.

4. **Produce the first Windows installer.** Only attempt this once step 2 is green.
   It will be unsigned, and it will trigger the operating system's unknown
   publisher warning — say so in the release notes rather than letting a user
   discover it.

5. **Prove the rebrand at runtime.** Its source edits have landed — product name,
   window title, installer name and application identifier, with package names,
   the command-line tool name, environment variable prefixes and storage keys
   deliberately left as upstream wrote them. What has *not* happened is any of it
   being observed: no window title has been read off a window, no installer entry
   seen in Add/Remove Programs, no side-by-side install attempted. The first
   packaged build is what turns the identity claims in `MODIFICATIONS.md` into
   evidence, and it should be checked against them item by item.

6. **Wire the Material Design 3 token layer**, using the mockup's handoff sheet as
   the contract. Do the token mapping first and the component work after: the
   mockup declares shape and easing tokens that it then never consumes, using
   literal values instead. Copying the literals would reproduce the mockup's own
   shortcut. Wire the tokens properly.

7. **Implement the project standards** against the redesigned surface — language
   modes and the two per-language tone sliders, the anchored regex builder on every
   search field, browser-style tabs with overflow/pinning/grouping, the
   super-confirmation gate on destructive actions, the command palette, the
   changelog viewer, local version history, bulk actions and export, and the dim
   sum startup surprise. The mockup already specifies a large share of these; it
   also **omits** several, and the roadmap records which.

8. **Run the line counter in a release.** `scripts/line-count.mjs` is committed:
   it discovers files with `git ls-files`, buckets every tracked file into exactly
   one row with a mandatory catch-all, reports the imported `design/` tree
   separately from this repository's own code, and attributes authorship per
   surviving line with `git blame` behind `--blame`. What has not happened is a
   release consuming it, so **no line count for this project has been published**.
   Do not publish a number that did not come out of that script at the released
   commit.

9. **Bundle the fonts and icons locally.** The mockup loads its typefaces and icon
   font from a public font service. The port must ship them as local assets: no
   remote stylesheets, no remote fonts, no third-party requests at runtime.

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
