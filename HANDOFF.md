# Handoff

> [!IMPORTANT]
> **Session closeout — 2026-08-21.** The default branch and remote now point to
> [`aa0673659`](https://github.com/Ding-Ding-Projects/material-designer/commit/aa067365901a1a24eeb420fe9d34143ce562bbcf).
> This session advanced the Open Design baseline from `517f39acd` to
> `393af2f99` (v0.20.2, 309 upstream commits), preserved 574 declared product
> paths, added the desktop scaffold ZIP and Markdown Download routing, compacted
> narrow workspace actions, retained the temporary dim-sum-photo omission, and
> carried forward the Squirrel launch, shortcut, checksum and full-folder-browser
> repairs. The exact local port commands `scripts/verify-port.sh` and
> `scripts/verify-port.sh --json` are green at zero gaps: 12,835 expected upstream
> files, 13,079 tracked files, 574 declarations, and zero missing, byte, mode,
> object-ID, extra, untracked or stale-notice findings.
>
> Hosted Verify
> [`32450372891`](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/32450372891)
> and Pages
> [`32450372890`](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/32450372890)
> are green for `aa0673659`. Release
> [`32450372884`](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/32450372884)
> is still running in **Install dependencies**; it has not built a Squirrel
> package, checked `NotSigned`, recorded the photo exception, published, or
> verified a release. Earlier Release `32449571270` failed in package postinstall
> on a duplicate release-channel registry, and `32449844884` failed on daemon
> syntax created by overlapping three-way union hunks; commits `69b562d10` and
> `aa0673659` repair those exact boundaries. The active run's terminal result is
> the next owner's first check.
>
> **Still open:** installed Squirrel launch proof for the repaired build; updater
> `available` → `downloading` → `ready-to-restart` evidence; real interaction and
> captures for the Explorer-style folder browser, Markdown Download, desktop
> scaffold export and narrow action row; the complete ten-screen light/dark,
> normal/narrow and 100/125/150/200% design-parity matrix; labelled comparisons,
> diffs and per-control Material Design audits; and resolution of any further
> v0.20.2 merge diagnostics exposed by the active Release. Issue
> [#7](https://github.com/Ding-Ding-Projects/material-designer/issues/7) is the
> public continuation record.

> [!IMPORTANT]
> **FileViewer menu accessibility lane — 2026-08-21.** The source-level lane adds
> independent search and focus handling to the ten FileViewer menus named in
> `docs/standards/context-menu-shortcuts.md`: Download, Share, Present, Zoom,
> toolbar More and version actions. Each menu owns its plain-text-first query and
> anchored regex builder, localized result status, keyboard navigation and trigger
> focus return. Direct share and toolbar labels now wrap at narrow bilingual
> widths. The hand-written source contract is
> `design/apps/web/tests/components/FileViewer.menu-contract.test.ts`.
> No local Node/pnpm/Electron execution, installed build, runtime geometry or
> screen capture is claimed for this lane. Commit
> [`bca23732d`](https://github.com/Ding-Ding-Projects/material-designer/commit/bca23732de1fdf7568da0227b220fdbce19969e0)
> carries the source changes; follow-up commit
> [`6473425c5`](https://github.com/Ding-Ding-Projects/material-designer/commit/6473425c5d4ae72ecb8a7b3a7dbdc71f9c6529d4)
> keeps clicks inside the portalled builder from dismissing its owning menu.
> The branch remains local and unmerged.
>
> [!IMPORTANT]
> **Design-parity infrastructure checkpoint — 2026-08-21.** The version-2
> reference registry now owns the exact ten screen/state routes and the reference
> application consumes it directly. The reference hash and support/asset hashes
> match the migrated files; the renderer freezes clock, random input and motion,
> binds committed local fonts, blocks unrelated network requests, uses Chromium
> device scaling, and verifies the measured viewport, device-pixel ratio and font
> readiness before reporting ready. The inventory no longer presents repeated
> page-level audit summaries or path-only records as evidence: it names pending
> per-control audit and raw/receipt/comparison/diff targets. The default verifier
> deliberately remains red because the installed application has no normalized
> `material-designer://` tuple resolver, all ten audits are pending, zero raw
> captures or receipts exist, and the required display/theme/layout/language
> matrix is unverified. Do not convert those missing artifacts into placeholders.
>
> [!IMPORTANT]
> **Upstream and export checkpoint — 2026-08-21.** The Open Design submodule,
> mirror, and manifest now target `393af2f991525a6c85cb04ee4aea0cd8967693c8`
> (v0.20.2), 309 commits beyond the former baseline. `scripts/verify-port.sh
> --json` reports 12,835 expected files and zero gaps after exact-blob import and
> declared-path three-way reconciliation. The Download surface adds a complete
> desktop source scaffold beside the existing website handoff, forwards queued
> Markdown downloads into the Markdown export menu, and compacts narrow action
> labels instead of clipping the control cluster. These changes are source-level
> until the hosted build and cheap-headless installed interaction complete.
>
> [!IMPORTANT]
> **Current implementation checkpoint — 2026-08-20.** Commit
> [`8129ac77`](https://github.com/Ding-Ding-Projects/material-designer/commit/8129ac77)
> makes project context stable across file/tab switches, removes implicit initial
> file and Design Files preview selection, narrows manual and hosted packaging to
> Squirrel.Windows only, and adds deterministic artifact/runtime validators plus
> a ten-screen design-parity inventory. Source/static checks are recorded in the
> task; installed-runtime, updater and parity capture rows are not yet verified.
> Follow-up commit [`d88178c5`](https://github.com/Ding-Ding-Projects/material-designer/commit/d88178c5)
> also removes the separate folder-project path that attached the currently
> visible file to every send. Explicit file selection remains available through
> the file controls and `@` picker.
> Release [`32438682495`](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/32438682495)
> then exposed a workflow-only PowerShell boundary: ordinary tools-pack stderr
> progress was promoted to a terminating `NativeCommandError` before the native
> exit code could be checked. The next commit scopes `Continue` to that command;
> no package, unsigned or installed-runtime verdict came from the failed run.
> The repository owner subsequently directed the current release to skip the
> contradictory dim-sum photo attachment for now. The next workflow records
> the exception in its warning and release notes, attaches no copied catalog
> image, and keeps all Squirrel/provenance/publication verification active.
> Release `v0.16.128-r127.1` was subsequently published from `f1a13479` with the
> complete Squirrel asset set and photo-skip disclosure. Its workflow turned red
> only because the UTF-8 checksum file carried a BOM that GNU `sha256sum` treats
> as a malformed first token; the next commit writes that ASCII-only file as ASCII.
> The published tag also exposed an automation loop: unrestricted `push:`
> triggers started Release, Verify and Pages again for the tag. The tag-triggered
> Release and the superseded branch Release were cancelled; all three workflows
> now accept branch pushes and manual dispatch while ignoring tag pushes.
> Live inspection of the installed `0.16.128` Squirrel artifact then found two
> launch defects: its shipped config embedded the hosted `D:\a\...` runtime root,
> and its lifecycle created `GitHub, Inc.\Electron.lnk` because unsigned Electron
> version resources remain unedited. Commit
> [`cb03705b`](https://github.com/Ding-Ding-Projects/material-designer/commit/cb03705b)
> removes the hosted path from shipped config and synchronously creates explicit
> Material Designer shortcuts without enabling signing or executable editing.
> The same commit replaces the daemon's tree-only Windows folder picker with a
> validated full Explorer-style browser.
> Release `v0.16.131-r130.1` then published from `c5f08224`, but GNU
> `sha256sum` rejected the BOM-free checksum because PowerShell wrote CRLF and
> the filename was read with a trailing `\r`. The current checksum producer uses
> `File.WriteAllText`, BOM-free UTF-8 and an explicit LF.

> [!IMPORTANT]
> **Current release-shutdown handoff — 2026-08-11.** The local `main` and `origin/main` now match
> [`e99f40de`](https://github.com/Ding-Ding-Projects/material-designer/commit/e99f40debb20de1ee7029e5c3106bf50e23489db). There is one primary checkout and no
> stashes or linked worktrees. Exact-SHA Verify
> [`31480515255`](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31480515255)
> and Pages [`31480515281`](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31480515281)
> are green. Release [`31480515300`](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31480515300)
> reached Squirrel packaging, passed the unsigned and line-count checks, and then
> failed closed at the previously active dim-sum photo-policy conflict before publication.
> The historical latest release `v0.16.1-r71.1` is stale and lacks the Squirrel feed
> assets required for a current release.
>
> The active repair lanes add the root build scripts, move workflow execution
> to hosted `windows-2022`, remove test/lint/typecheck/static/screenshot gates
> from Actions, and add artifact/target/timing verification. No new release is
> published until a real unsigned Squirrel installer, the line-count evidence,
> and the contradictory dim-sum asset rule are all handled honestly. Eight
> installed-build screenshots are now committed from the local portable
> artifact: splash, English and Traditional Chinese onboarding in light/dark
> themes, the local coding-agent editor in both languages, its narrow layout,
> and its authentication error state. They are evidence for commit `0d6e47c7`,
> not a published release; the remaining destinations, settings and editor
> matrix still needs a later run with a verified release artifact.

State of play for whoever picks this up next.

Read this before touching anything.

> [!IMPORTANT]
> **Current handoff — 2026-08-08.** Three consecutive Release runs
> (`31178661227`, `31182596964`, `31186802259`) all timed out at exactly
> `720000ms` inside the packaged smoke test while `invokeSquirrel` blocked in
> `execFileAsync` with no timeout of its own. Root cause: Windows Defender
> real-time protection scans every file that Squirrel's Setup.exe and Update.exe
> extract to `%LOCALAPPDATA%\open-design-packaged-app` and
> `%LOCALAPPDATA%\SquirrelTemp`; on a machine where the Electron binary is new
> to Defender's cloud cache this scan takes well over twelve minutes, longer than
> the twelve-minute vitest gate.
>
> Fix committed and merged into `main`: `release.yml` now adds `Add-MpPreference
> -ExclusionPath` exclusions for those two Squirrel directories before the smoke
> step; `design/e2e/specs/win.spec.ts` raises the vitest per-test timeout from
> `720_000` to `1_800_000` ms as defence in depth. Verifier passes (`0 gaps`).
> Run the next Release and record its result here. Do not describe any release
> as shipped until the tag, assets, smoke result and release notes are all
> verified on the run page.

> [!IMPORTANT]
> **Previous handoff — 2026-08-07.** `main` and the Git remote are at commit
> [`f6549861`](https://github.com/Ding-Ding-Projects/material-designer/commit/f6549861f4cbf8783e4dd73765145d60b74db73d).

> [!IMPORTANT]
> **Updated 2026-08-07.** Release run
> [`31158740651`](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31158740651)
> passed the design verifier, self-hosted bootstrap, dependency installation, web
> Typecheck and the Windows identity/installer tests, then failed before packaging
> because locked `electron-builder` 26.8.1 rejected the unknown `win.sign`
> property. No installer, smoke result or release was published. Commit
> [`e768b5b`](https://github.com/Ding-Ding-Projects/material-designer/commit/e768b5bef5a308a93747ef0c60e01881baef5ce0)
> replaces that invalid property with the supported
> `signAndEditExecutable: false` control and adds a release-contract assertion.
> The replacement run must still prove packaging, `NotSigned`, smoke behavior and
> publication.

**Where it is.** The upstream tree was imported and *proved* byte-for-byte
identical to its source, rebranded into a genuinely standalone application, and
brought onto Material Design 3. Historical runs built and published two Windows
installers under their own tags, and the packaged smoke test installed one of
them, launched it, made the running process answer its own health endpoint from
inside its renderer, and uninstalled it with no residue. The current main
Release run 31158740651 passed dependency installation, web Typecheck and the
Windows identity tests but failed at electron-builder schema validation; the
next run must prove the supported unsigned builder repair before a new release is
claimed.

> [!IMPORTANT]
> **Updated 2026-08-04.** The two warnings that used to head this file ΓÇö that
> nobody had looked at the interface, and that no installer contained the
> redesign ΓÇö are both now out of date, and what replaced them is more
> interesting.
>
> 1. **A capture has been reviewed, and it caught a real defect.** The window
>    title bar and the home hero were both branding the application with the
>    upstream name. The rebrand had been proved as *installed identity* ΓÇö
>    uninstaller, registry entries, process version, all asserted green ΓÇö while
>    the two strings a user actually reads were never checked by anything.
>    Fixed, and confirmed fixed by looking at the artifact of `v0.16.1-r19.1`.
>    That is one capture, at one display scale, in one language: the audit
>    described in section 4 is still almost entirely undone.
> 2. **The redesign ships.** `v0.16.1-r18.1` was the first build to contain it;
>    `v0.16.1-r19.1` carries the rebrand fix on top.
> 3. **A new warning replaces them, and it is the one to carry forward: some
>    surfaces exist without being reachable.** An adversarial audit found three
>    modules with zero importers ΓÇö the appearance editor, its infinite colour
>    picker, and the whole spoken narrator. They compiled, they shipped in the
>    bundle, and no user could open them. All three are now wired. **Judge a
>    feature by whether a surface mounts it, never by whether its files exist.**
>
> 4. **The sharper version of that warning, found later the same day: a feature
>    can be mounted, reachable, persisted ΓÇö and still do nothing.** The density
>    setting had a control, wrote a `data-density` attribute, survived restarts,
>    and rendered a *pixel-identical* interface at all three levels, because the
>    five custom properties it swapped had one reader between them and four had
>    none. Every check anyone would think to run said it worked.
>
>    Two others of the same shape, both found by reading rather than by any
>    test: the shared `Dialog` had **no viewport height bound at all**, so a tall
>    dialog pushed its own confirm button off the bottom of the screen with no
>    scrollbar to say so; and editing `dialog.module.css` changed nothing on
>    screen for anyone, because `Dialog` puts that module class and the global
>    `modal` class on the same element and the module writes its card inside
>    `:where()` ΓÇö zero specificity, so the global rule wins every time.
>
>    **The lesson to carry: "the value is stored" and "the class is applied" are
>    not evidence that anything renders.** Follow the property to a reader, and
>    follow the selector to the rule that actually wins.

> [!NOTE]
> **Updated 2026-08-06.** The desktop command-palette shortcut correction landed in
> [`18850c1`](https://github.com/Ding-Ding-Projects/material-designer/commit/18850c1ee6596e847a0588a20509780460dbbd20).
> The application now has one shared `commandPalette.open` binding: `Ctrl+Shift+F`
> on Windows/Linux and `ΓçºΓîÿF` on macOS. The header chip, `aria-keyshortcuts`, global
> handler, setup copy and focused tests derive it from one registry; `Ctrl+K` and
> `Ctrl+Shift+P` no longer open the palette.
>
> The import verifier also pins its comparison locale on `join` and `comm`. On
> Windows, the proven route is `core.autocrlf=false` plus an LF-native shell;
> verification for this change reported `0 gaps`. The application build and unit
> suites were not run locally; CI remains the evidence for those heavy checks.

> [!NOTE]
> **Updated 2026-08-06.** The settings tab overflow menu repair is committed at
> [`6f03a832`](https://github.com/Ding-Ding-Projects/material-designer/commit/6f03a8321e8f6bf1fd1ddae56e95faf39a3e4d58). The menu now has an independent
> plain-text-first regex field, bounded local filtering, an honest empty state,
> Arrow/Home/End navigation and Escape/Tab focus restoration. Its focused source
> spec is committed; no Node, pnpm, Electron, build, CI or installed-build
> capture was run locally.

> [!NOTE]
> **Updated 2026-08-06.** The follow-up overlay and onboarding repair is committed at
> [`34426621`](https://github.com/Ding-Ding-Projects/material-designer/commit/34426621). The
> settings menu now stays within narrow and short viewports, onboarding dropdowns
> return focus to their triggers and expose field-plus-value names, and the
> command-palette size control meets the 48px target. The follow-up
> [`ec2c76d7`](https://github.com/Ding-Ding-Projects/material-designer/commit/ec2c76d7)
> raises the portalled menu above the opaque page, keeps Tab in the regex-builder
> focus scope, clamps stale anchors and restores viewport globals in the geometry
> tests. Focused source contracts are committed; no local build, CI run or
> installed-build capture is claimed.

> [!NOTE]
> **Updated 2026-08-06.** [`6f4015b8`](https://github.com/Ding-Ding-Projects/material-designer/commit/6f4015b8)
> now carries the exact HTTPS release-notes URL from update metadata into the
> ready dialog and persistent updater banner. [`6daae310`](https://github.com/Ding-Ding-Projects/material-designer/commit/6daae310)
> makes the Squirrel release path fail closed unless the artifact is intentionally
> unsigned (`NotSigned`), packaged smoke and unique packaged UI-state evidence pass,
> rebuilds cached CI tools from verified
> sources, and records the custom runner label for `actionlint`. The new labelled
> self-hosted run has not yet produced a verdict.

> [!NOTE]
> **Updated 2026-08-06.** The final six-finding Figma import repair is committed at
> [`81ca738`](https://github.com/Ding-Ding-Projects/material-designer/commit/81ca73826312e1c599e52ff8be943620ee1ec04f).
> `FigmaImportModal` closes before the host focus callback, rejected Home URL
> handoffs keep the modal open with a real retry path, and `aria-invalid` /
> `aria-describedby` are scoped to the invalid URL input or native file input;
> the visible dropzone is the file input's labelled keyboard surface rather
> than a second fake control. Invalid drops clear stale files, the URL
> expression is anchored while retaining query/hash support, and the complete
> visible surface uses the i18n catalog. English fallback, the `zh-TW`
> Traditional Chinese seed and deliberate `zh-HK` overrides are included;
> `MODIFICATIONS.md` lists every changed `design/` path. The focused source spec
> is committed, but no Node, pnpm, Electron, build, CI or capture result was run
> or claimed locally; hosted verification remains pending.

> **Residual Figma input repair:** commit
> [`8b76513`](https://github.com/Ding-Ding-Projects/material-designer/commit/8b7651350daa8b3fdcda3dc9c74e44d7a8d880dd)
> makes a file dropped on the URL tab switch to the file tab, focuses the native
> file input, and keeps the localized alert associated with that visible file
> path. The native input is visually hidden without `display: none`, named through
> a real localized label, associated with its helper and error text, and included
> in the modal focus trap; the visible dropzone keeps the keyboard focus ring via
> `:focus-within`. `zh-HK` intentionally inherits `figmaUrl` and
> `figmaPlaceholder` from `zh-TW`. The URL-tab drop and native-input contracts are
> covered by focused source tests; no Node, pnpm, Electron, build, CI or capture
> command was run locally.

> **Focus-trap contract correction:** commit
> [`cbdc4f5`](https://github.com/Ding-Ding-Projects/material-designer/commit/cbdc4f5ae673b7387445ad8e2fc0ba49dcdacb4e)
> replaces the button-only regression list with the complete modal keyboard order,
> asserts that `figma-import-file` is present, and drives forward and reverse Tab
> traversal through every control. The test models jsdom's ordinary middle-control
> move while the real modal handler remains responsible for both wrap edges. This
> corrects the documentation claim without claiming a runtime or CI verdict.

> **Wrap-edge assertion hardening:** commit
> [`ac3ba56`](https://github.com/Ding-Ding-Projects/material-designer/commit/ac3ba56)
> makes that boundary explicit in the test: both the first reverse move and the
> last forward move must have `event.defaultPrevented === true`. The helper only
> advances focus for ordinary middle-control moves, so a missing real wrap
> handler can no longer pass through a jsdom fallback. This remains source-level
> evidence; no runtime, build or CI verdict is claimed.

**What that does not mean.** The claims most likely to be overclaimed by
someone skimming:

1. **"Landed" still does not mean "audited".** The interface has been looked at
   once. Nothing has been checked at a second display scale, at a narrow width,
   or in a second language, and bilingual mode is where clipping appears first.
2. **The confirmation gate does not cover the ground it appears to.** It is
   built and mounted, and irreversible deletes elsewhere ΓÇö whole projects,
   memory entries, library assets, bulk file deletion ΓÇö do not route through it
   at all. See `ROADMAP.md` ┬º 4.0.

**The one habit worth inheriting.** Every claim in this repository is written so
a reader can check it ΓÇö a command to run, a run to open, a counter to compare.
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
| Upstream source imported into `design/` | **Done and proved** | `scripts/verify-port.sh` ΓåÆ 0 gaps across 11,799 files, exit 0 |
| Apache-2.0 ┬º4(b) notice | **Done, and consistent** | `MODIFICATIONS.md` declares its paths; verifier reports 0 stale notices and 0 undeclared differences. Run the script for the current count |
| Verifier for the import | **Done and self-tested** | six deliberate gap classes, all detected |
| Material Design 3 mockup preserved | **Done** | `mockups/open-design-m3/`, 5 tracked files |
| Rebrand to Material Designer | **Built, installed and asserted** | the smoke test checks the installed uninstaller's name, the registry entries' product name and application id, and the running process's version |
| Continuous integration | **All three workflows have run; the current Release gate is red** | *Verify*, *Release* and *Pages* have each completed. Release `31186802259` at `f6549861` passed labelled Windows bootstrap and packaging, then failed at packaged smoke after `720000ms`; Main Verify `31186802470` remains queued |
| Install / build / typecheck / test | **Typecheck and Windows contract tests passing; packaged smoke failed** | Release `31186802259` completed workspace install, Typecheck, Windows tests, Squirrel packaging, `NotSigned`, self-contained scanning and artifact upload; the smoke produced no lifecycle timing, screenshot or `ui-states.json` |
| Windows installer | **Legacy release verified; new path gated** | Latest verified legacy release: `v0.16.1-r71.1`, Bamboo Shoot Har Gow ┬╖ τ¡ìσ░ûΦ¥ªΘñâ. The new Squirrel path is explicitly unsigned and passed packaging/`NotSigned`, but no new release was published because its install/start/uninstall smoke did not complete |
| Material Design 3 anatomy | **Waves 1ΓÇô5 and 7 landed; 6 and 8 in progress** | chrome, home, collections, lists and switches, conversation, overlays. Verified by typecheck and unit tests. **No wave box is ticked**, because a wave's own definition of done is capture from an installed build in both themes, at four display scales, at narrow width and in bilingual mode ΓÇö and that has not been done |
| Language modes | **Landed, unseen** | `zh-HK` Cantonese, bilingual mode, two per-language funny sliders. 20 locales, 4,504 keys, no duplicates |
| Regex builder ┬╖ command palette ┬╖ changelog viewer ┬╖ dim sum ┬╖ tab pinning and bulk close | **Landed, unseen** | on `main`, typechecked, unit-tested |
| Notification centre ┬╖ destructive-action gate ┬╖ bulk actions ┬╖ appearance editor ┬╖ narrator ┬╖ context-menu shortcuts | **Landed, unseen** | merged from `phase4-wip`; its adversarial verification lenses **never ran** ΓÇö see section 4 |
| Version history | **Daemon complete, UI now wired** | 2,369 daemon lines and `od history` existed with nothing in the app able to open them; a panel now mounts at `App.tsx`. **Unproven end to end** ΓÇö see the loopback-guard question in ┬º5b |
| Export everything | **Not started** | No implementation exists. Handed to the backend ΓÇö see ┬º5b |

---

## 1. What this repository is right now

The load-bearing pieces:

1. **`design/`** ΓÇö a byte-verbatim copy of the upstream Open Design monorepo at
   version 0.16.1, 11,799 files, Apache-2.0. This is the product: a local-first
   design workspace built from a Node daemon, a web front end, an Electron
   desktop shell, a packaged launcher and a landing page.
2. **`vendor/open-design`** ΓÇö the upstream repository kept as a pinned Git
   submodule at commit `517f39acde402c1a7af2189167a8d6957a3dac71`. It exists so
   the copy can be checked against its source; it is not built and not shipped.
3. **`mockups/open-design-m3/`** ΓÇö a design-canvas mockup that specifies the
   intended Material Design 3 redesign of this product's own interface. Five
   tracked files. It is a specification, not code, and is wired into no build.
4. **`MODIFICATIONS.md` + `scripts/verify-port.sh`** ΓÇö the licence notice and
   the machine that enforces it. Described in [section 5](#5-constraints-a-successor-must-respect).
5. **`.github/workflows/`** ΓÇö this project's own three workflows: `verify.yml`
   (*Verify*), `release.yml` (*Release*) and `pages.yml` (*Pages*). All three have
   since run ΓÇö see the table above. At the time this section was written they were
   a plan expressed in YAML; they are no longer.
6. **Governance and support files** ΓÇö `README.md`, `AGENTS.md`, `ROADMAP.md`,
   this file, the `docs/` tree, the bundled dish catalogue under
   `assets/dim-sum/`, the static site source under `site/`, and the rest of
   `scripts/` (`line-count.mjs`, `upstream-manifest.tsv`, `import-dim-sum.sh`,
   `release-codename.sh`).

There is deliberately **no root `package.json`** ΓÇö the workspace root is
`design/`. That, and not a missing workflow directory, is why every build command
runs one level down.

---

## 2. What was done in this session

Three commits, in order.

### `chore(design): move the M3 mockup out to mockups/ so design/ can hold the real thing`

The Material Design 3 mockup and its two companions (`support.js`, `assets/`)
had been sitting at the top of `design/`. That was harmless while `design/` held
nothing else, and became a collision the moment an entire monorepo ΓÇö which ships
its own top-level `assets/` ΓÇö was about to move in. All three moved together,
because the mockup HTML loads its script and SVGs by relative path and fails
silently without them. New home: `mockups/open-design-m3/`.

### `feat(design): import open-design v0.16.1 verbatim, all 11,799 files`

The whole upstream tree copied into `design/`. Two decisions matter for anyone
auditing this later:

- **Copied as raw blob bytes out of the pinned submodule, not out of a checked-out
  working tree.** A working tree on Windows is line-endingΓÇôsmudged, and copying a
  copy is how a port ends up "basically the same" ΓÇö a phrase that cannot be
  verified. Filtering was disabled on both ends, so every blob identifier in
  `design/` is identical to upstream's, and all 73 executable bits survived.
- **Nothing was modified in this commit.** Not a rename, not a lint fix, not a
  stray newline. Adaptations land in their own commits so that the diff of *what
  we changed* never has to be excavated out of the diff of *what we copied*.

Two files are force-added past the ignore rules, exactly as upstream force-adds
them past its own.

### `feat(scripts): prove design/ matches upstream, and make the licence notice do the proving`

`scripts/verify-port.sh` ΓÇö pure Git and shell, no Node anywhere in it, because it
must run **before anything is installed**, on a fresh checkout with no toolchain
present. A verifier that needs the dependency tree it is meant to vouch for is a
verifier that cannot be run first. It performs two independent checks, because
they fail for different reasons:

- **Check A ΓÇö bytes on disk.** Every file is hashed with filtering disabled and
  compared to the upstream blob identifier. Catches a stray edit, a truncated
  copy, a missing file.
- **Check B ΓÇö what Git actually recorded.** Every tracked path under `design/` is
  compared on **mode and blob identifier**. Catches line endings quietly
  normalising and executable bits falling off, neither of which Check A can see.

The load-bearing idea is that **`MODIFICATIONS.md` is simultaneously the
Apache-2.0 ┬º4(b) notice and the allowlist the verifier reads**. A file may differ
from upstream only if it is listed there. Change a file and forget to write it
down, and verification fails. Write one down and later revert it, and
verification also fails ΓÇö as a *stale notice*. The legal paperwork and the code
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
difference and every real difference has a notice ΓÇö neither list has run ahead of
the other.

**`declared` moves; `gaps` must not.** Every further rebrand edit raises
`declared`, and any edit made without its allowlist entry turns this into a
non-zero `bytesDiffer` and exit 1. Re-run the script rather than quoting this
transcript ΓÇö it was true when written, which is a different thing from being true
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
| 5 | Declared edit | changing a file **with** an entry | suppressed ΓÇö verification passes |
| 6 | Stale declaration | an entry whose file no longer differs | `stale-notice` |

Classes 4, 5 and 6 are the ones that make the notice enforceable rather than
decorative: an undeclared change fails, a declared change passes, and a
declaration left behind after the change was reverted fails too.

<details>
<summary>Verifier counter reference ΓÇö what each number means and how it fails</summary>

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
| `untracked` | loose, non-ignored files in `design/` ΓÇö what an interrupted copy leaves |
| `staleNotice` | declared in `MODIFICATIONS.md` but no longer actually different |
| `gaps` | total after allowlist suppression; **exit 0 only when this is 0** |

Exit codes: `0` clean, `1` gaps found (first 50 printed to standard error),
`2` cannot run ΓÇö **neither** the submodule nor `scripts/upstream-manifest.tsv` is
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

**What is verified, so the list below is read against something.** Labelled
self-hosted Windows runs install the workspace and typecheck the rebrand; Windows
identity and installer suites pass; multiple historical legacy installer releases
were published, and the latest verified one remains `v0.16.1-r71.1`. Its packaged
smoke installed, launched, health-checked and uninstalled the application with
seven residue checks clean. More recent Squirrel runs reached unsigned packaging
and artifact upload, then failed before install/start/uninstall proof.

Now the gaps.

- **The production M3 shell geometry is integrated at `a03c16d9`.** The eight
  bounded CSS blocks and matching `MODIFICATIONS.md` entry are committed;
  `run_static_checks.py` and `scripts/verify-port.sh --json` both report zero
  errors/gaps. This is source/static evidence only. The Windows packaged runtime,
  installed-build screenshots and complete visual matrix still require CI.

- **The current Squirrel smoke has not completed.** Release `31186802259` timed
  out after `720000ms` before it produced lifecycle timing, a screenshot or
  `ui-states.json`. Publication was correctly skipped. The next run must either
  pass install/start/inspect/uninstall and capture states, or persist the exact
  timed-out `tools-pack` action and descendant cleanup evidence.
- **The visual matrix is incomplete.** Real packaged captures have been reviewed,
  including a window-title branding defect and later bilingual narrow/200% states.
  The current Squirrel artifact has no fresh capture, and the complete light/dark,
  100/125/150/200%, narrow-width and language matrix has not been reviewed as one
  verified release set.
- **The test run is a gate on selected capabilities, not exhaustive coverage.**
  The imported tree carries roughly 1,150 test files; a green release does not
  imply every imported suite ran.
- **Material Design 3 conformance remains partly visual.** Tokens and component
  mappings have tests, while a human review of the complete installed-build state
  set is still required. Existing captures prove the custom window title is
  visible; they do not prove every surface, scale, theme and language combination.
- **No request in the daemon's request collection has been sent.** The 368 requests
  were derived by reading route definitions; no daemon has been started here, and
  at least one route pair was missed by that reading. See
  [`docs/api/README.md`](docs/api/README.md).
- **Windows is the only target, by decision rather than by omission.** There is
  no macOS or Linux artifact, and code signing is permanently prohibited. New Windows releases
  use Squirrel.Windows and publish `Setup.exe`, `RELEASES`, full/delta NuGet packages
  and the project-owned updater metadata feed; the feed is not yet proven by a new
  release run in this handoff. The current workflow clears signing inputs and fails
  closed unless Authenticode reports `NotSigned`. Read the absence of the other two platforms as scope, not as a backlog:
  nothing here is waiting on a macOS build, and work that would only pay off on
  another platform is out of scope until that changes.

  Two things this does **not** mean, because both look like contradictions.
  The *Verify* workflow runs on Linux ΓÇö that is the runner, not the target, and
  it is deliberate: several imported suites assert a Unix executable bit that a
  Windows filesystem cannot store, so they run there and the Windows-specific
  ones run on `[self-hosted, windows, material-designer]`. And the imported tree still contains macOS and
  Linux packaging builders, which the rebrand had to touch for identity;
  leaving them consistent costs nothing and deleting them would be a fork of
  upstream's packaging tool for no gain.

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
`design/` can never be edited ΓÇö it means an edit is a two-part operation:

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
package and run steps execute on the labelled self-hosted runners in continuous
integration** ΓÇö not on whatever machine a contributor happens to be sitting at.

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

A run is `running`, `failed`, or `verified` ΓÇö never predicted. Do not describe an
installer that has not been produced, a test that has not passed, or a workflow
that has not gone green. This document exists partly as an example of that
discipline; keep it that way when you update it.

---

## 5b. Backend handoff ΓÇö the frontend is where this session stopped

The user's instruction was to finish the frontend for now and hand the backend
to whoever picks this up next. This section is that handoff. It is deliberately
specific: every item names the file, what is already there, and what would prove
it works ΓÇö because the recurring failure in this repository has been assuming a
thing works from the fact that it exists.

**Read section 4 first.** Nothing below has been rendered, run, or exercised
against a live daemon, and the single most useful thing a successor can do is
start the daemon once and look.

### The one question that gates the rest

**Can the web origin actually reach `/api/history`?** The daemon registers seven
history routes in `apps/daemon/src/routes/history.ts`, all behind
`requireLocalDaemonRequest` (`apps/daemon/src/http/local-daemon-request.ts:100`).
That guard validates the request is loopback and echoes the origin back as
`Access-Control-Allow-Origin`, with `Access-Control-Allow-Methods: GET, POST,
OPTIONS` ΓÇö which covers exactly the verbs those routes use. The web sidecar
serves from loopback, so *by reading* it should pass.

It has never been observed passing. If it does not, the new version-history
panel renders its honest "history is unavailable" line rather than data, and the
whole feature looks broken while being correctly wired. **Start the daemon, open
the panel, and watch the network tab.** That is a five-minute answer to a
question no amount of further reading will settle.

### What is already built on the daemon side

Worth knowing before building anything, because the last three features found
here were *already implemented* and merely unreachable:

| Surface | State |
|---|---|
| `apps/daemon/src/history/` | **2,369 lines** ΓÇö `domains.ts`, `git.ts`, `service.ts`, `sqlite-domain.ts`, `store.ts`. Append-only guarantee, redaction of credential-adjacent domains, and paths derived from `RUNTIME_DATA_DIR` were all already correct. |
| `/api/history` ├ù 7 routes | Registered and guarded. |
| `packages/contracts/src/api/history.ts` | Full DTO. |
| `od history ΓÇª` | Already in `apps/daemon/src/cli.ts` (`SUBCOMMAND_MAP` ΓåÆ `runHistory`), hitting the same routes the UI does. The dual-track rule is satisfied here. |

So the version-history work left this session is **not** "build a backend". It is
"prove the one that exists is reachable, then finish the two gaps below".

### Backend work that genuinely remains

1. **Discarding unsaved work must be recorded before the close completes.** The
   standard requires the discard itself to be an append-only history action, so
   it is auditable and restorable. Nothing implements this today. It belongs on
   the daemon side because the history store owns the append.

2. **Export everything (roadmap 4.5) has no implementation at all.** A search for
   `toCsv`, `toYaml`, `toToml`, `'ndjson'` and friends across `apps/web/src`
   returns nothing but syntax-highlighting labels. The standard asks for every
   record, view, list, log, document, setting and generated artifact to be
   exportable in every format that can faithfully represent it ΓÇö JSON, JSONL,
   YAML, TOML, XML, CSV, TSV, Markdown, HTML, SQL ΓÇö plus ZIP and 7z archives with
   the full 7z option surface (LZMA2/PPMd/BZip2, levels, dictionary and solid
   block sizes, multithreading, split volumes, AES-256 **with encrypted headers**
   so filenames are hidden too). Two rules that are easy to get wrong: state what
   a format will drop *before* the export runs rather than truncating silently,
   and never present an encrypted archive as protected while leaving its
   filenames in the clear.

3. **Destructive enforcement is at two interfaces, not at the operation.** The web
   UI gates behind the two-key slider, the CLI refuses without `--confirm`, and
   `ecaad97` moved a check into the daemon ΓÇö but the recorded gap is that this is
   still enforcement per-interface rather than a single guarantee at the
   operation. The next caller that is neither the UI nor the CLI is ungated. That
   gap is written down rather than implied closed; closing it properly is daemon
   work.

4. **Every new capability needs its `od` subcommand.** `design/AGENTS.md` is
   explicit that a UI-only capability is a regression, because external agents
   drive this product through `od` and never render the web UI. Tab groups and
   the appearance controls landed this session **UI-first**; they need CLI
   surfaces against the same `/api/*` endpoints, with `--json` and
   `--prompt-file` where the shape calls for it. Land the endpoint, the UI and
   the subcommand together ΓÇö the repository's own rule is not to stage them
   across pull requests.

### What the frontend hands over in a working state

So the successor knows what not to re-litigate: the port is byte-verbatim with
**0 gaps**, all 20 locales are complete, the loading-shell gate agrees with all
42 Playwright startup waits, every stylesheet balances, and the site publishes
release facts read from the release that actually exists. Five pure-shell gates
run in seconds and catch most of what CI reports 35 minutes later ΓÇö they are
listed in section 5.

## 6. Immediate next steps, in order

The ordering matters. Each step is cheap to do after the one before it, and
expensive before.

<details>
<summary><b>Steps 1ΓÇô5 of the original list are done</b> ΓÇö kept for the record, and because two of them left traps worth knowing about</summary>

The first five steps were: get a *Verify* run recorded; let the Windows build
workflow run and expect it to fail; get package-scoped suites running; produce
the first installer; and prove the rebrand at runtime. All five happened.

Two things they left behind that a successor will still meet:

- **Line endings are the port verifier's one real hazard.** The repository
  normalises text, so a runner checking out with automatic CRLF conversion smudges
  `design/` and the working-tree check reports thousands of byte differences on a
  tree that is perfectly fine. That is why the gate runs on Linux. Submodules stay
  optional ΓÇö the committed manifest is the fallback.
- **The build did fail first, repeatedly, and the failures were environmental
  rather than code defects** ΓÇö suites asserting a Unix executable bit a Windows
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

<details>
<summary><b>Steps 1ΓÇô5 are done or superseded</b> ΓÇö kept because two of them turned out differently than expected</summary>

1. **Watch something fail on purpose.** *Done for the port verifier.* A
   deliberately poisoned branch made it report `bytes differ 1`, name the file,
   and exit 1 ΓÇö [run 30864702696](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/30864702696).
   **Not done for the Pages gate, and it turned out not to be cheap:** the
   `github-pages` environment refuses deployments from a non-default ref before
   any step runs, so a branch cannot reach the gate at all. Its six checks were
   run verbatim against the poisoned tree locally and caught the planted remote
   script, so the logic is demonstrated and the wiring is not.

2. **Look at the running interface.** *Done once, and it paid immediately* ΓÇö
   see the note at the top. Extending the capture path to more display scales,
   narrow widths and a second language is still entirely undone, and remains
   the largest gap in this project's evidence.

3. **Cut a release that actually contains the work.** *Done.* `v0.16.1-r18.1`
   was the first; `v0.16.1-r19.1` carries the rebrand fix.

4. **Run the verification that never ran.** *Ran, and found plenty.* 44
   findings, 15 confirmed by an independent refutation pass, written up as
   `ROADMAP.md` ┬º 4.0. The verification half then hit a session limit of its
   own, leaving **29 findings unverified** ΓÇö they are leads, not facts, and
   re-running them is now step 1 below.

5. **Bundle the fonts locally.** *Done for the application* ΓÇö Cairo ships as
   three local subsets and the one network font request is gone. A CI gate
   preventing a new one is not in place; the site's equivalent gate is.

</details>

1. **Route every destructive action through the confirmation gate.** This is
   the most serious open finding. Whole-project delete via the design-system
   workspace tab, memory entries, extraction records, library assets (single
   delete there has *no* confirmation at all) and bulk file deletion all bypass
   it, and roughly ten more actions fire behind a plain `confirm()`. The gate
   is built, mounted and good; the routing is the gap, and a gate that guards
   two of a dozen doors is closer to a false assurance than to a safety
   feature.

2. **Fix the gate's own five confirmed defects.** Armed keys survive a target
   swap, so keys engaged for one action stay engaged for the next; the
   "full-range" slider is satisfiable in one pointer jump or a single `End`
   press; dismissing mid-flight swallows the action's failure; and Escape
   reports `cancelled` for an action that already ran.

3. **Verify the 29 unverified findings before acting on any of them.** They
   include claims that the colour translator implements none of
   CIELAB/LCH/OKLab/OKLCH, that `parseColor` walks the prototype chain on input
   like `constructor`, and that the contrast readout rounds across the WCAG
   boundary. Each is plausible and none has survived a refutation pass.

4. **Mount the appearance editor and its infinite colour picker**, the two
   modules still reachable by nobody. Wiring the narrator took a missing
   stylesheet and one settings section; these are a larger job, and standard 3
   stays unimplemented until they are openable.

5. **Extend the capture path**, per the note above: 100/125/150/200% display
   scale, a narrow width, and bilingual mode where labels are longest.

6. **Broaden what the release actually tests.** The suites that run were chosen
   because the rebrand changed what they assert, so the current gate is on product
   identity rather than coverage. The imported tree carries roughly 1,150 test
   files. Add them package by package ΓÇö upstream deliberately ships no root
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
in [`ROADMAP.md`](ROADMAP.md) ΓÇö a board tracks state, not reasoning, so it
complements those rather than replacing them.

### External-state limitation: the wiki has no first page

The wiki is **enabled** on the repository, but GitHub does not create the wiki's
underlying git repository until a first page is saved through the web interface,
and there is no API that will do it. Cloning
`ΓÇª/material-designer.wiki.git` therefore returns *Repository not found*, and no
amount of retrying changes that.

*Mitigation:* create any page once through the web interface; the wiki repository
then exists and can be cloned and pushed to like any other. Until then this is not
a documentation gap ΓÇö the categorized documentation lives in [`docs/`](docs/) and
is the canonical copy either way, with the site as its published form. A wiki would
be a third surface, not the only one.

### Native module compilation on Windows

The daemon depends on a native SQLite binding that has **no prebuilt binary** for
the pinned Node major version on Windows. Installation will compile it from source,
which needs a C++ build toolchain ΓÇö Visual Studio Build Tools 2022 or newer with
the desktop C++ workload, plus Python 3 on the path.

*Mitigation:* the labelled Windows runner must carry the required C++ build tools
and Python; verify that contract in the first build job's log rather than
assuming it, and if the toolchain is missing, install it as an explicit step. Budget a couple of
minutes of build time for this module on every cold run, and cache aggressively
once the build is green. Note also that upstream classifies native Windows as
**best-effort** ΓÇö the primary supported paths are macOS, Linux and the Windows
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
workflow is not pushed repeatedly. Above all, do not record a predicted outcome ΓÇö
report the run as running, then report what it actually did.

### The imported tree still carries upstream's identity and integrations

Analytics endpoints, external links, community invites and promotional content came
in verbatim with the copy, because a verbatim copy is the whole point. None of it
is this project's.

*Mitigation:* the product analytics client is a no-op without a credential
configured in the build environment, and no such credential is configured in this
repository ΓÇö so builds from here transmit nothing on that channel. Describe that
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
propagate a documented figure without checking it against the tree ΓÇö this
repository has already inherited one such discrepancy and should not add more.

---

## 8. Reference

<details>
<summary>Repository layout ΓÇö every tracked path outside the imported tree</summary>

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

**Present but untracked** at that commit ΓÇö real working files, not scratch, and
each one needs committing:

```
README.md  AGENTS.md  ROADMAP.md  HANDOFF.md   (this file)
.github/workflows/pages.yml                 the Pages workflow
docs/                                       18 files, categorized documentation
site/                                        9 files, static documentation site
scripts/line-count.mjs                      the committed line counter CI runs
```

Regenerate both lists rather than trusting this block ΓÇö it was accurate at one
commit and the untracked half in particular is short-lived by design.
</details>

<details>
<summary>Rebrand touch points ΓÇö all inside <code>design/</code>, so all need allowlist entries</summary>

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
**do not** ΓÇö changing them would fork the tree far more deeply than the goal
requires, and would break every upstream-shaped path at once.

Trademark position is already recorded in `MODIFICATIONS.md`: the upstream name,
logo and application identity are upstream's, Apache-2.0 grants no trademark
rights, and builds published from here carry their own identity and are not
produced by or affiliated with the upstream project.
</details>

<details>
<summary>Version pins observed in the imported tree ΓÇö read from its manifests, not assumed</summary>

Recorded so a successor does not have to re-derive them. These are upstream's
pins as imported; none has been exercised here.

- Node major and package manager version are pinned identically across every
  workspace package, the version file and the tool-version file.
- Desktop shell: Electron 41.3.0; packaging via electron-builder 26.8.1. The
  supported Material Designer entry points request only Squirrel.Windows. Historical
  upstream-compatible NSIS/ZIP target code remains inert and unpublished.
- Daemon: Express 5.2.1, native SQLite binding 12.10.0 ΓÇö note Express 5 wildcard
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

Nineteen interface locales ship. A Hong Kong Cantonese locale is **absent** ΓÇö
adding it touches **three** files, all under `design/`, and therefore needs
allowlist entries: a new `apps/web/src/i18n/locales/zh-HK.ts` dictionary, plus
`apps/web/src/i18n/types.ts` (the `Locale` union, the `LOCALES` array and the
label map all live there) and `apps/web/src/i18n/index.tsx` (the import and the
`DICTS` map). A fourth file is *not* needed: `apps/web/src/i18n/content.ts` types
its per-locale marketing bundle as `Partial<Record<Locale, ΓÇª>>`, so a locale with
no bundle is already legal.
</details>

<details>
<summary>Related documents in this repository</summary>

- **`MODIFICATIONS.md`** ΓÇö the Apache-2.0 ┬º4(b) notice and the verifier's
  allowlist. Present, declaring 67 rebrand paths, and consistent with the tree;
  see [section 3](#3-verification-evidence).
- **`scripts/verify-port.sh`** ΓÇö the import verifier. Present, self-tested
  against six gap classes, and reporting 0 gaps at exit 0.
- **`README.md`** ΓÇö what the product is, how it is meant to be built, and the
  honest warnings a first-time reader needs.
- **`AGENTS.md`** ΓÇö the invariants and standards an agent working here must hold.
- **`ROADMAP.md`** ΓÇö the sequenced plan, including which project standards the
  mockup covers and which it omits.
- **`docs/`** ΓÇö categorized feature documentation, one file per feature.

`CHANGELOG.md`, `CONTRIBUTING.md`, `LICENSE`, `SECURITY.md` and
`CODE_OF_CONDUCT.md` do **not** exist yet; `ROADMAP.md` ┬º1.2 tracks them.
</details>

---

## Release CI repair lane (2026-08-07)

- The unsigned Squirrel release lane is on commit
  [64ef401818d453ea87161c62fcb4997632ccc158](https://github.com/Ding-Ding-Projects/material-designer/commit/64ef401818d453ea87161c62fcb4997632ccc158).
  It keeps the self-hosted Windows label, automatic dependency bootstrap,
  signing prohibition, Authenticode NotSigned check, packaged smoke test,
  UI-state evidence, Squirrel assets and measured release timing.
- Release run
  [31152036272](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31152036272)
  failed before checkout because bare bash resolved to a WSL launcher without a
  Linux distribution. Release run
  [31152251945](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31152251945)
  also failed before checkout because the quoted spaced Git-for-Windows path
  was malformed by the Windows command resolver. Neither run produced an
  installer, artifact or GitHub Release.
+- Commit 84f70d6 replaces both ambiguous shell forms with the runner's
  space-free Git-for-Windows path. Local structural validation passed with
  actionlint -shellcheck=; Node, pnpm and Electron remain deliberately unrun
  outside CI. The next release run is the authoritative check for checkout,
  dependency installation, tests, Squirrel packaging, unsigned status, smoke,
  artifact upload and publication.
- Release run
  [31152929139](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31152929139)
  passed setup, the Git-for-Windows shell steps and checkout, then failed at
  Bootstrap Windows CI tools with `pwsh: command not found`. No dependency
  install, test, package, installer, artifact or GitHub Release was produced.
- Commit
  [993f86a](https://github.com/Ding-Ding-Projects/material-designer/commit/993f86ad3540333d55f3a4b2e4f92dbb0346aabd)
  switches the workflow to powershell.exe, rewrites the bootstrap's PowerShell
  7-only null-coalescing expression for Windows PowerShell compatibility, and
  adds a release-contract check that rejects pwsh. The next run is still the
  authoritative packaging and publication verdict.
- Release run
  [31153486526](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31153486526)
  passed tool bootstrap, the byte-exact verifier, pnpm setup and Node setup,
  then failed in actions/setup-python because its unsigned setup.ps1 was
  rejected by the runner's AllSigned policy. No MSVC activation, dependency
  install, test, package, installer, artifact or GitHub Release was produced.
- Commit
  [511c452](https://github.com/Ding-Ding-Projects/material-designer/commit/511c4526535031791fe9ead0e4127ed6c7431dcd)
  replaces that action with a pinned, SHA-256-checked, user-scoped Python
  bootstrap and adds the contract check that keeps the blocked action out of
  the Windows Release job. The next run remains the authoritative verdict.
- Release run
  [31154123479](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31154123479)
  passed setup, checkout, the byte-exact verifier, pnpm and Node, then failed
  in the first Python bootstrap because the verified archive contains
  `python-3.12.10-amd64.exe` plus `setup.ps1`, rather than a portable
  `python.exe`. No MSVC activation, dependency install, test, package,
  installer, artifact or GitHub Release was produced.
- Commit
  [c45e243](https://github.com/Ding-Ding-Projects/material-designer/commit/c45e243da8001435b4fafd8eeb03659ecb195fb7)
  locates the archive's installer and runs it directly with
  `InstallAllUsers=0` into the user-scoped cache, then verifies the installed
  interpreter. Local actionlint, PowerShell parsing and diff checks pass; the
  next labelled-runner run remains the authoritative packaging verdict.
- Release run
  [31154520542](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31154520542)
  reached the direct installer, but Windows PowerShell left `$LASTEXITCODE`
  empty; the script treated the null comparison as failure before checking for
  `python.exe`. No dependency install, test, package, installer, artifact or
  GitHub Release was produced.
- Commit
  [9dcdb2f](https://github.com/Ding-Ding-Projects/material-designer/commit/9dcdb2f31de96dd54e7425066ef6cecb4761f65d)
  waits for the installer with `Start-Process -Wait -PassThru`, records its
  explicit exit code, accepts success or reboot-required, and then verifies the
  installed interpreter. Local actionlint, PowerShell parsing and diff checks
  pass; the next labelled-runner run remains the authoritative verdict.
- Release run
  [31154756724](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31154756724)
  reached the direct installer and recorded exit code `-2147024891`
  (`0x80070005`, access denied) for the self-hosted runner service account. No
  Python interpreter, dependency install, test, package, installer, artifact or
  GitHub Release was produced.
- The next repair switches from the installer bundle to the official Python
  3.12.10 embeddable archive. Its SHA-256 was measured as
  `4ACBED6DD1C744B0376E3B1CF57CE906F9DC9E95E68824584C8099A63025A3C3`; the
-  following commit
  [37534e5](https://github.com/Ding-Ding-Projects/material-designer/commit/37534e58ccbe28fdef6a3010a845d9bd46db9ced)
  implements that extraction and interpreter check. The next run must prove
  that path on the labelled runner.
- Release run
  [31155063471](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31155063471)
  passed the portable Python bootstrap and frozen dependency installation,
  then failed at Typecheck with 10 `apps/web` errors: one missing
  `isMacPlatform` import, nine strict indexed-focus/test-fixture type errors.
  Tests, packaging, installer verification and publication were skipped.
- Commit
  [a769c35](https://github.com/Ding-Ding-Projects/material-designer/commit/a769c35609254e6e4dc71daddf4be076cad396b2)
  repairs those five design files and declares them in `MODIFICATIONS.md`;
  `scripts/verify-port.sh --json` reports 0 gaps, 0 byte differences and 0
  stale notices. The next labelled-runner run remains the authoritative
  Typecheck, test, packaging and publication verdict.
- Release run
  [31153286001](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31153286001)
  reached setup, Git-for-Windows shell steps and checkout, but Windows
  PowerShell blocked the generated unsigned temporary script with a
  PSSecurityException before the bootstrap body ran. No dependency install,
  test, package, installer, artifact or GitHub Release was produced.
- Commit
  [129cb90](https://github.com/Ding-Ding-Projects/material-designer/commit/129cb90120c5b57b1e644f0ba0a142b1fea86c2b)
  moves ExecutionPolicy Bypass onto the shell template itself. The user's
  persistent execution policy is not changed; the next run remains the
  authoritative packaging and publication verdict.
- At this checkpoint the target issue is
  [#7](https://github.com/Ding-Ding-Projects/material-designer/issues/7), and
  the open issue scan found only that active release task in this repository;
  the canonical memory repository still has open issues #10 and #12; #14 is
  no longer open.

---

## Keeping this file honest

Update this document in the same change that alters the state it describes ΓÇö not
afterwards, and not at release time. When the first CI run happens, its result
belongs in [section 3](#3-verification-evidence) and its subject leaves
[section 4](#4-what-is-not-verified). A handoff document that describes a state
the repository left behind is worse than none, because it is confidently wrong and
the reader has no way to know.

---

## 2026-08-05 ΓÇö Branch closed out, restarted from main

- All prior work on `claude/handoff-sonnet-orchestration-1zshjv`, through commit
  `ac37ac7` ("fix(icons): name the glyph the type actually publishes"), is merged
  into `origin/main`, and the remote copy of that branch was deleted after the
  merge.
- This branch has been restarted from the current `origin/main` tip,
  `ac37ac77b476451428fc1fed6618e1691e80d440`, and carries only this closing
  entry on top of that commit.
- Nothing under `design/` changed in this closing entry, so
  `scripts/verify-port.sh` is unaffected ΓÇö that claim is checkable by running
  the script against this commit.
- This closing session ran orchestrator-only: every edit, commit and push was
  carried out by delegated Sonnet subagents, and the orchestrating session made
  no direct edits.
- No CI run, release or capture is claimed for this commit. The open work
  recorded in [section 6](#6-immediate-next-steps-in-order) ΓÇö destructive-action
  routing, the gate's own confirmed defects, the 29 unverified findings, the
  capture matrix, broadening what the release tests, and sending the request
  collection against a live daemon ΓÇö remains exactly as recorded there.

## Post-handoff CI verification (2026-08-05)

- Commit `0521779` ("fix(web-tests): six fixtures/helpers were lying about
  five red suites") fixed nine confirmed test bugs across six files under
  `design/apps/web/tests/` ΓÇö `changelog-filter`, `CommandPalette` (four
  bugs), `FileViewer` (two bugs), `Toast`, `bundled-fonts`, and
  `settings-polish` ΓÇö and added two troubleshooting docs. It merged
  fast-forward onto `main`.
- All three CI runs for `0521779` have completed and been log-verified, and
  the honest answer is that all three still say **failure**:
  [Verify (main) run 31027136238](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31027136238),
  [Verify (branch) run 31027121968](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31027121968),
  and [Release (main) run 31027136212](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31027136212).
  What changed is the shape of the red: unit-test failures dropped from nine
  files / fifteen assertions down to exactly the five deliberately deferred
  assertions documented in
  [`docs/troubleshooting/web-suite-regex-css-helpers-and-inert.md`](docs/troubleshooting/web-suite-regex-css-helpers-and-inert.md)
  (`SettingsDialog` inert, the `wave8-overlay-m3` side sheet, and
  `workspace-tabs-chrome` ├ù3). Zero regressions; 488 files / 5,682 tests
  pass; "Verify port integrity" is green.
- Release fails at a single step, "Check the packaged application is
  self-contained," and only on bundled upstream example templates ΓÇö see
  [`docs/troubleshooting/self-contained-check-bundled-template-examples.md`](docs/troubleshooting/self-contained-check-bundled-template-examples.md).
  The raw match count drifted from 435 to 491 for environmental reasons
  (floating transitive dependencies), including six dev-dependency
  telemetry `fetch()` lines. None of that drift was caused by any commit
  made this session.
- Three maintainer decisions still stand between this and a green board:
  (1) scope the self-contained gate ΓÇö narrow it to `resources/app`, or make
  all 174 bundled example files offline; (2) the two CSS assertions that
  disagree with the un-nested rules need a rendered-UI check to settle which
  side is actually right; (3) the media-query-blind CSS test helpers need
  either a smarter parser or a fixture change.
- This session's outbound proxy blocked GraphQL and org-scoped REST outright,
  so a GitHub Discussions post and a Projects update were unreachable on
  every route tried; the resulting 403 responses were captured as evidence.
  Repo-scoped REST through `gh` worked normally. The issue scan turned up
  nothing to triage ΓÇö zero open issues.

## UI audit and renderer-safe restart (2026-08-06)

- The current branch carries the focused restart-barrier commit
  [`92a4f94`](https://github.com/Ding-Ding-Projects/material-designer/commit/92a4f9447dee35243f929ef15a54976671fbbd64).
  Before `od:update:quit` schedules process shutdown, the desktop host asks the
  renderer to flush queued and in-flight sketch autosaves. Malformed responses,
  failed saves, missing renderer responses and the 10-second timeout all fail
  closed; the `force` flag cannot bypass renderer save preparation.
- The same audit landed focused UI fixes in
  [`3fdd836`](https://github.com/Ding-Ding-Projects/material-designer/commit/3fdd83690e1ac5dcfdd3366064fa041c55b79f7b),
  [`5197177`](https://github.com/Ding-Ding-Projects/material-designer/commit/5197177ae6197c1043f3b42cb013cf26fda5a43d),
  [`5c6301c`](https://github.com/Ding-Ding-Projects/material-designer/commit/5c6301c0e4efe88b0765f2e22b7d1e5aff59d52d),
  [`8aa1f90`](https://github.com/Ding-Ding-Projects/material-designer/commit/8aa1f905c0515694a2b3e7f0506a7c90c124da81),
  [`df66c24`](https://github.com/Ding-Ding-Projects/material-designer/commit/df66c2400e12d29b0d092e89a74dfc87fa10266e) and
  [`353c0af`](https://github.com/Ding-Ding-Projects/material-designer/commit/353c0af3414bcec51d5f13a67494390c2e9dee80): Figma field names and modal scrolling, context-menu wrapping and focus return, updater-dialog focus and reduced motion, the command palette's own anchored regex builder, and the design-system Back name.
- Local Node, pnpm and Electron execution remains deliberately unrun. The
  Windows Git Bash verifier was attempted, but the checkout's CRLF translation
  produced `10033` baseline byte differences and `1` OID mismatch; it also
  reported `0` stale notices and `0` undeclared paths. CI is required for
  the actual typecheck, test, packaging and runtime verdict.
- Open issue scans for `material-designer` and `agent-global-memory` returned
  zero issues at this checkpoint. Verify `31127492562` is now cancelled. Release
  `31127492852` remains queued for the same `main` SHA, and GitHub's cancellation
  endpoint returned HTTP 502 when cancellation was retried; it is not claimed
  green here.

## CI runner contract lane (2026-08-06)

- Commit [`5556f84f1a4580f0d795f92b912e09833e6eb47f`](https://github.com/Ding-Ding-Projects/material-designer/commit/5556f84f1a4580f0d795f92b912e09833e6eb47f) updates the root `Verify`, `Release`, and `Pages` workflows to the explicit `[self-hosted, linux, material-designer]` and `[self-hosted, windows, material-designer]` contracts.
- Each checkout sets `clean: true`. Dependency jobs install and verify Node 24 and pnpm 10.33.2 through the setup actions, then run `pnpm install --frozen-lockfile` from the committed manifest and lockfile. The pnpm-store cache is an optimisation only; no cached `node_modules` tree is trusted. `Pages` has no package manifest and checks its static publishing tools instead.
- `Verify` no longer has a `pull_request` trigger because this public repository must not execute untrusted pull-request code on a self-hosted runner. The new labelled-runner execution is not yet verified by a CI run.
- The two previously queued runs, Verify `31127492562` and Release `31127492852`, were requested for cancellation through `gh` but the GitHub API returned HTTP 502 for both attempts; both remained queued at the last check. No push was performed by this bounded lane.
- Open issue scans for `material-designer` and `agent-global-memory` returned zero issues.

## UI audit and restart safety continuation (2026-08-06)

- Commit [`f2e71c8`](https://github.com/Ding-Ding-Projects/material-designer/commit/f2e71c8b2362bf5e711ce8af7ae6083e04965264) extends the renderer restart barrier from sketch autosaves to the active markdown editor's debounced and in-flight writes. Failed writes return a structured failure instead of leaving a quit request waiting forever.
- The Squirrel/macOS deferred installer now receives a random one-shot authorization-marker path. The helper opens `Setup.exe` only after the host creates the marker following a successful renderer preparation; a denied or failed restart leaves no marker. A persisted ready installer re-arms a fresh helper after the next cold start and explicit install action.
- The UI audit also adds narrow-viewport bounds for context menus and regex builders, a portalled-builder focus scope for the command palette, and Figma modal focus restoration, keyboard trapping, hidden-file-input exclusion and reduced-motion styling. Focused regression tests are committed; no local Node/pnpm/Electron execution was performed.
- `git diff --check` passed for the task branch. The Windows Git Bash port verifier still reports the known checkout line-ending baseline (`10033` byte differences and `1` OID mismatch, with `0` stale notices and `0` undeclared paths); the labelled Linux Verify workflow is the authoritative check.
- This task branch has been pushed with `f2e71c8`; the default branch integration and the new self-hosted CI verdict remain separate evidence steps.

## UI audit continuation after the second refutation pass (2026-08-06)

- Commit [`b5f0db6`](https://github.com/Ding-Ding-Projects/material-designer/commit/b5f0db63b8d2ed1d1d8a52b0ca1b463e65e30830) closes the next set of source-level UI and updater findings. `ContextMenu` no longer dismisses itself when its own items scroll, `FileViewer` remounts on a file switch, and the HTML and Markdown renderers keep their final save preparation registered through the handoff boundary.
- `FigmaImportModal` now exposes real tab/tabpanel relationships, roving focus and arrow/Home/End navigation. The updater dialog prevents Escape leakage while busy, keeps a failed installer handoff retryable, and the updater revokes pending or previously authorized installer markers during clear-cache. Long command-palette labels wrap instead of being clipped.
- The self-hosted workflows now run committed, user-scoped bootstrap scripts that validate pinned `gh`, `jq` and `7z` versions, verify downloaded package SHA-256 hashes, serialize cache updates, and install official binaries when a cached version is absent or wrong. The scripts passed Bash syntax, PowerShell AST parsing and `git diff --check`; no Node, pnpm or Electron command was run locally. Labelled-runner execution remains unverified.
- The hash boundary is explicit: package downloads are authenticated at fetch time; the persistent user-scoped runner cache is trusted runner state, not a cryptographic trust boundary for extracted executables. An untrusted runner cache requires reprovisioning before use.
- The branch commit is present on `codex/ui-audit-20260806`; no new branch CI run exists yet. Verify `31127492562` is cancelled. Release `31127492852` remains queued after the cancellation endpoint returned HTTP 502, so the queue is not claimed empty and no green verdict is claimed.
- Open issue scans for `material-designer` and `agent-global-memory` returned zero issues at this checkpoint. The default branch integration and remote proof remain pending for the safe half of the requested integration pass.

## CI red run and packer call-site correction (2026-08-06)

- Release run [`31127492852`](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31127492852)
  for `main` at `2cae835a1a9b6b86352b0c3b083ff1a35c061ebc` completed with failure
  in `Build Windows application ΓåÆ Install dependencies`. `pnpm install
  --frozen-lockfile` resolved the workspace; the post-install packer typecheck
  then reported `src/win/lifecycle.ts(473,95): error TS2345` because
  `"uninstall-legacy"` is not assignable to `invokeNsis`'s
  `"install" | "uninstall"` action contract.
- Commit [`5d66600`](https://github.com/Ding-Ding-Projects/material-designer/commit/5d66600)
  makes the minimal call-site correction: `invokeNsis` receives `"uninstall"`,
  while the surrounding `runTimed` record remains `"uninstall-legacy"`. No
  local Node, pnpm or Electron command was run, and no new labelled-runner
  verdict is claimed until the corrected tree executes.
- The exact failure is now part of the CI documentation rather than being
  hidden behind the earlier queued status. Open issue scans for
  `material-designer` and `agent-global-memory` still return zero issues.

## Safe integration and cleanup boundary (2026-08-06)

- The audited task tip was fast-forwarded into an integration checkout, and the
  committed branch tips for the accessible-name, self-hosted CI, Figma modal,
  updater dialog, Squirrel updater, Squirrel packaging and command-palette
  Escape lanes were merged into that history. The command-palette merge is
  [`da4cb71`](https://github.com/Ding-Ding-Projects/material-designer/commit/da4cb714fcff1f518ebe65123949d7f9a1dc2079),
  with source commit [`c833622`](https://github.com/Ding-Ding-Projects/material-designer/commit/c833622)
  and documentation commit [`53e2205`](https://github.com/Ding-Ding-Projects/material-designer/commit/53e2205).
  The merge is an ancestor of the final default-branch tip; no force update is used.
- The available static gates passed on the integration tree: PowerShell AST
  parsing, `actionlint -shellcheck= -ignore 'label "material-designer"'`,
  `git diff --check`, and Bash syntax through an LF view because the fresh
  Windows checkout exposes CRLF to Bash. Node, pnpm and Electron were not run.
  The corrected labelled-runner and installed-build verdicts remain pending;
  Release `31127492852` is the latest observed run and is failed.
- The last queue audit is empty: no queued or in-progress workflow is listed.
  The integration push is kept subject to the same cancellation rule, so a new
  run is not treated as verification merely because its workflow was created.
  Verify `31127492562` is cancelled, and Release `31127492852` is completed
  failure with the `lifecycle.ts(473,95)` action-type error documented above.
- The `pack-squirrel` checkpoint was reconciled on the integration branch rather
  than wired into the active runtime. Merge `d0630480` preserves its ancestry;
  `412e1fc7` removes the uncalled `squirrel.ts` module and `693f6439` removes the
  duplicate/orphan lifecycle imports. The current lifecycle keeps the newer
  ignored-stdio/process-tree implementation that addresses the documented smoke
  deadlock risk. After the final dew, the now-ancestor remote branch is safe to
  delete under the explicitly authorized cleanup pass.
- `git stash list` is empty. Open issue scans for `material-designer` and
  `agent-global-memory` returned zero issues at this final checkpoint.
