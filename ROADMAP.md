# Roadmap

The honest burn-down between where this repository is today and full conformance
with the project's standards.

Almost nothing here is done. This document exists so that the size of the
remaining work is visible rather than implied, and so no reader mistakes an
imported upstream tree for a shipping product.

> [!IMPORTANT]
> **Nothing in this repository has been installed, built, run, or tested.**
> The only thing that has ever been executed against this tree is
> `scripts/verify-port.sh`. There is no installer and no release. Three
> workflows *are* committed at the repository root — `verify.yml`, `release.yml`
> and `pages.yml` — but **no run outcome has been observed for any of them**, so
> there is still no CI evidence of any kind: a committed workflow is a
> definition, not a result. Every "Verified by" line below describes a check that
> *will* exist, not one that has already passed, unless it is written under
> Phase 0.

---

## How to read this

| Marker | Meaning |
| --- | --- |
| `[x]` | Done, and verified by evidence named on the line |
| `[~]` | **Machinery committed, no result observed.** The file that does the work exists and can be read; nothing has been produced by it |
| `[ ]` | Not started |

The middle marker is load-bearing and is not a softer `[x]`. A workflow that
would build an installer is not an installer; a committed counter is not a
published line count. Everything marked `[~]` becomes `[x]` when — and only
when — a run link, an artifact or an output exists to name on the line. Items are
ordered by dependency, not by importance: an item near the top is usually one
that other items cannot begin without.

Two constraints shape every phase and are repeated here because they change what
"do the work" means:

1. **All installation, building, testing, and running happens in continuous
   integration on a hosted Windows runner.** The development machine does not
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
None of it has produced a build.

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

**Still provably absent:** no installer, no release, no observed CI run, no
published line count, no published documentation site, no `CONTRIBUTING.md`,
`LICENSE` at the repository root, `SECURITY.md`, `CODE_OF_CONDUCT.md` or
`CHANGELOG.md`, and no Cantonese locale. Note the distinction that the rest of
this document depends on: the machinery for several of these is committed (the
counter, the code-name picker, the catalogue, the site source, the workflows) —
what is absent is any *result* produced by it.

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

- [~] **Create the root `.github/workflows/` directory.** It holds three
      workflows written for this project — `verify.yml` (*Verify*),
      `release.yml` (*Release*) and `pages.yml` (*Pages*). The 48 upstream
      workflow files under `design/` stay where they are and stay inert; they
      were not a starting point, because they assume upstream's secrets,
      environments, and release targets.
      *Verified by:* reading the three files at `.github/workflows/`. The
      definitions exist; **no run of any of them has been observed**, which is
      why this is `[~]` and not `[x]`.
- [~] **Install job on a hosted Windows runner.** `release.yml` runs on
      `windows-latest` and installs the package manager through its own setup
      action rather than through the shim-based enabler, which fails with a
      permissions error on Windows. The install compiles a native SQLite binding
      from source because no prebuilt binary exists for this platform/runtime
      pair, so expect it to take minutes rather than seconds — and expect the
      first real run to be where that assumption is actually tested.
      *Written; never executed.*
- [~] **Set the working directory to `design/`.** Every install, typecheck, test
      and build step in `release.yml` carries `working-directory: design`,
      because the repository root has no `package.json`. This is the single most
      likely cause of a first CI attempt failing for a reason that has nothing to
      do with the code, which is why it is written down rather than assumed.
      *Written; never executed.*
- [~] **Run the port verifier in CI, with line endings forced to LF.**
      `verify.yml` runs `scripts/verify-port.sh` on `ubuntu-latest`, on every
      push, pull request and manual dispatch. The Linux runner is the
      line-ending answer: the verifier hashes on-disk bytes, and a Windows
      checkout that converts line endings would report thousands of spurious
      differences on a tree that is perfectly fine. The committed
      `scripts/upstream-manifest.tsv` is the fallback when the pinned submodule
      is not checked out, so a missing submodule no longer exits early.
      *Written; no run outcome observed.*
- [ ] **Typecheck and lint.** `release.yml` runs the workspace-wide typecheck,
      after building the daemon and desktop declaration files it depends on. The
      guard script, the translation-coverage check and the craft lint are **not
      wired in yet**; all four should run.
- [ ] **Prebuild the three packages the tests depend on** before typechecking or
      testing — the daemon, the desktop main process, and the web sidecar
      bundle. The first two are built in the typecheck step; **the web sidecar
      bundle is not**. Upstream's own CI builds all three, and the test suites
      fail without them.
- [ ] **Run the test suites per package.** `release.yml` runs three suites today
      — the packaging tool, the packaged launcher and the desktop shell — chosen
      because the rebrand changed what they assert. That is a gate on product
      identity, not coverage, and the remaining packages still need their own
      invocations. There is deliberately no aggregate test command in the
      imported tree and one must not be added; the workspace convention is
      package-scoped invocation. Expect roughly 1,150 test files across the
      workspace, dominated by the daemon and the web app. The daemon suite
      disables file parallelism because its tests bind real local servers, so it
      is slow by design.
- [ ] **Report test counts per package in the job summary**, so a regression in
      coverage is visible without opening logs. The `Summarise` step reports
      version, tag, installer name, smoke-test outcome and code name — not test
      counts.
- [~] **Build the Windows installer.** `release.yml` sets up NSIS, builds the
      packaging tool and invokes the installer target, then uploads the result as
      a workflow artifact even when a later step fails, so a bad run still leaves
      something to inspect. *Written; no installer has been produced.*
- [~] **Publish exactly one release per successful run**, with a unique
      monotonic tag, the genuinely built installer attached, and no draft state.
      The publish step is gated on `success()`, so a run whose tests fail
      publishes nothing — that is correct. A run that publishes a release with no
      installer, or an installer it did not build, would not be.
      *Written; nothing has been published.*
- [~] **Do not sign the installer yet, and say so in the release notes.** The
      generated notes say it outright: the installer is not code-signed, so the
      operating system's reputation prompt appears on first run, and its "run
      anyway" affordance is hidden behind a "more info" link. Users will hit
      this. Documenting it is not optional politeness; it is the difference
      between a confused user and an abandoned install.
      *Written into the notes template; no notes have been published.*
- [~] **Commit a line-count script and have CI run it at the released commit.**
      `scripts/line-count.mjs` is written and both workflows invoke it
      (`release.yml` into the release notes, `verify.yml` into the job summary).
      Two things are still outstanding, and neither is cosmetic: the file was
      **still untracked** at `65e288f`, so it is not committed yet; and both
      workflows call it **without `--blame`**, which is the flag that turns on
      authorship attribution — without it the script emits an Authorship table
      reading "not computed". It must break the count down by category —
      application source, tests, styles and markup — with both total and
      non-blank lines, and report authorship per *surviving* line rather than by
      summing additions, because churn is not authorship.
- [ ] **Enable authorship attribution in the release workflow.** Add `--blame`
      to the counter invocation, scoped with `--blame-paths` so it does not
      blame the 11,799-file vendored tree file by file. Until this lands, no
      release can carry the human/agent split that
      [`docs/standards/releases.md`](docs/standards/releases.md) requires.
- [~] **Report the vendored tree as a separate, visible row.** The counter
      reports the imported `design/` tree separately from this repository's own
      code, prints excluded paths as visible rows with their own numbers rather
      than dropping them silently, and buckets every tracked file into exactly
      one row behind a mandatory catch-all. The 11,799 imported files are not
      this project's code, and folding them into a total would misrepresent the
      project by roughly two orders of magnitude. *Implemented in the script —
      see its tracking status in the line-count item above; never published.*
- [~] **Make the counter's arithmetic agree with itself** before any figure is
      published. The script fails loudly when the authorship rows do not sum to
      the line rows, rather than printing two numbers that contradict each other.
      *Implemented; never exercised on a release, which is the only place the
      check matters.*
- [~] **Assign each release a dim sum code name** drawn from a bundled catalog,
      in English and Traditional Chinese, used once per project and recorded so
      the mapping is auditable. The catalogue exists —
      `assets/dim-sum/index.json` declares 24 dishes and 24 PNGs are tracked
      under `assets/dim-sum/images/` — and `scripts/release-codename.sh` picks
      from it. No release has consumed a name, so the once-per-project mapping
      is still empty. A release must never be delayed for this: if no name can
      be resolved, ship with the version alone and say so.

### 1.2 Governance documents

- [x] **`README.md`** — tabbed rather than scrolled: a compact index at the top
      (what this is, how to install, where the docs are), with long reference
      sections folded into collapsible blocks. It must state plainly that this
      is a rebranded fork, that nothing has been verified by a build yet, and
      what the upstream project's trademarks are.
      *Verified by:* `README.md` — a Contents table followed by `<details>`
      blocks for the layout, build, verification, privacy, standards and
      provenance sections; a Status section that names what has never been run;
      and a Trademarks paragraph under Provenance. No CI run outcome is claimed
      anywhere in it.
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
- [ ] **`CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`.** These render
      as tabs above the README, so keeping them real and current is free
      navigation. Do not paste their contents into the README as well.
      *Genuinely absent* — none of the three exists at the repository root.
- [ ] **`LICENSE`** at the root, matching the imported Apache-2.0 licence.
      *Genuinely absent* at the root; the licence text ships at `design/LICENSE`.
- [ ] **`CHANGELOG.md`**, started now rather than at the first release, with
      every entry carrying its commit reference.
      *Genuinely absent.* Until the file exists, `README.md` must **not** link to
      it — a link in the section that tells a first-time reader where the
      project's records live is a 404 at the worst possible place. The README
      currently says the changelog is not written yet; that sentence becomes the
      link on the same commit that creates the file, and not before.
- [x] **`HANDOFF.md`**, recording what changed, what evidence exists, what
      remains, and every external dependency — with no claim of unverified
      success.
      *Verified by:* `HANDOFF.md` — a status-at-a-glance table, a verification
      section quoting a real verifier run with its exit code, a "what is not
      verified" section, and ordered next steps. No run outcome is claimed for
      any workflow.
- [x] **`docs/` with a categorized index**, one Markdown file per feature
      covering behaviour, configuration, failure modes, security
      considerations, and verification.
      *Verified by:* `docs/README.md` plus six category indexes — `porting/`,
      `architecture/`, `build/`, `standards/`, `site/` and `api/` — each listing
      its files with an honest implementation status. Each standard in
      `docs/standards/` resolves to a file; none is left as a dash.
- [ ] **Set the repository's homepage field to the documentation site** once it
      publishes, so the link renders in the sidebar where every visitor looks
      first. Blocked on the site publishing — see 1.3.

### 1.3 Documentation site

- [ ] **Publish a landing page and documentation site**, using the imported
      static-site application or a replacement. It is a user-facing surface and
      therefore carries every standard the application carries — Material
      Design 3, the three language modes, both funny-level sliders, tabbed
      navigation, a search bar wired to the regex builder, a settings page where
      every rendered detail is adjustable, non-blocking notifications, the
      accessibility rules, and the dim sum surprise. "It is only docs" is not an
      exemption, and the settings page is not exempt from having its own search
      either.
- [ ] **Enable the publishing surface in the repository settings** before the
      first docs run. A missing site setting fails the deployment in a way that
      looks like a broken build and is actually one checkbox.
- [ ] **Make the site's base path configurable and verify the built output
      carries it.** A fork publishing under a repository-scoped path with a
      hardcoded root will emit absolute asset URLs: the build goes green, the
      deployment succeeds, and every page returns a 404. Never conclude the site
      works because its workflow passed — open a page.
- [ ] **Add an installer download button to the site's home page**, using the
      immutable release asset URL from a verified release, showing version and
      platform, and absent entirely until a real release exists rather than
      pointing at a guessed URL.
- [ ] **Bundle every site asset locally.** No CDN scripts, stylesheets, fonts,
      or remote images, and no third-party analytics.

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

Confirmed by reading the imported desktop main process: the frameless chrome
configuration is applied only when the platform is macOS, and is an empty object
otherwise. On Windows the main window therefore renders the operating system's
default title bar today. Two other windows are already frameless — a startup
splash and a small always-on-top companion window — but neither is the main
window.

- [ ] **Make the main window frameless on Windows** and mount a custom title bar
      in the application's own chrome. Both files are under `design/` and need
      allowlist entries.
- [ ] **Build the title bar to the mockup's measurements:** 40px tall, 12px of
      left padding with the right edge flush so the caption buttons run into the
      corner, a surface-container background, and a one-pixel outline-variant
      bottom border.
- [ ] **Left cluster:** a 20×20 brand mark tinted with the primary role, the
      product name at 12px/600 with 0.02em tracking in the on-surface-variant
      role, and a lighter subtitle at 11px.
- [ ] **Caption controls:** three 46×40 buttons stretched to full bar height
      with no margin or gap between them, hover filled with the ripple token,
      and a default cursor rather than a pointer to match native behaviour. Icon
      sizes are deliberately unequal — 16px, 15px, 17px — so the three glyphs
      read optically the same size. The close button's hover is the literal
      Windows red `#C42B1C` with white glyph; it is the one hard-coded,
      theme-independent colour in the whole bar, and it should stay that way.
- [ ] **Wire minimize, maximize/restore, and close to the real window
      operations**, including the maximize/restore icon swap. A caption control
      that looks right and does nothing is worse than the native bar it
      replaced.
- [ ] **Set the drag region correctly**, so the bar moves the window but the
      buttons do not.
- [~] **Apply the minimal rebrand at the same time:** the product name string,
      the window title, the installer's product name, and the application
      identity. Package names, the command-line tool's name, environment
      variable prefixes, and storage keys stay as they are — the rebrand is
      deliberately minimal. This one has moved ahead of the rest of 2.1: the
      identity edits are on disk and declared under the *Separate application
      identity* entry in [`MODIFICATIONS.md`](MODIFICATIONS.md), which covers the
      packaging tool's Windows, Linux and macOS builders, the release package's
      channel definitions, the packaged launcher, the daemon and the web shell.
      It is `[~]` because **none of it has been compiled, packaged or launched**:
      no window title has been read off a window and no installer entry has been
      seen. The frameless-window work above is genuinely still `[ ]` — the
      desktop main process applies its frameless chrome only on macOS, so the
      Windows main window still renders the operating system's title bar.
- [ ] **Add the tab strip and status bar beneath the title bar** as the mockup
      specifies — a 42px strip of 36px bottom-rounded tabs with a 250px cap and
      leading/close icons, and a 28px status bar carrying live daemon state,
      model, design system, and the current scale and density.

### 2.2 Local fonts and Material Symbols

The mockup loads all three of its typefaces from a font CDN. That is a mockup
convenience and must not be ported. Separately, the *shipping* web application
already has one genuine CDN dependency: an Arabic-supporting font imported at the
first line of its main stylesheet. It must be bundled too.

- [ ] **Bundle Roboto Flex** as a variable font, exposing the optical-size and
      weight axes the mockup uses.
- [ ] **Bundle Roboto Mono** for all technical text — commit references, paths,
      identifiers, flags, and counters.
- [ ] **Bundle Material Symbols Rounded** as a variable icon font, exposing the
      fill axis, which the mockup uses to fill the active navigation icon.
- [ ] **Remove the CDN font import from the web application's stylesheet** and
      self-host that face. This is an edit under `design/` and needs an
      allowlist entry.
- [ ] **Inventory and migrate icon call sites.** The incumbent icon font is a
      self-hosted webfont loaded from the application's own public directory,
      referenced from a small number of source files; the great majority of the
      interface uses inline SVG components instead. The migration is therefore
      mostly an SVG-to-symbol sweep across the component tree, not a font swap —
      size it after a real inventory, not from this sentence.
- [ ] **Remove any declared-but-unused icon dependency** discovered during the
      sweep, so the dependency list describes what the application actually
      uses.
- [ ] **Verify no network font request is made at runtime**, by inspecting the
      built artifact rather than the source.

### 2.3 Token sheet and mapping layer

The mockup's handoff sheet is a genuine drop-in contract: all 18 of its target
variables already exist in the web application's token stylesheet, and all 12
source files in its component inventory exist at the paths it names. This is
what makes a mapping layer viable — existing components can inherit the new
scheme without being rewritten first.

- [ ] **Transcribe the Material Design 3 token sheet from the mockup:** 33
      colour roles in light, the dark overrides, the seven-step shape scale, the
      three motion tokens, and the density variables.
- [ ] **Add the mapping layer**, redefining the application's existing ~147
      custom properties in terms of the new roles, so every current component
      inherits the scheme with no changes of its own. The 18 documented mappings
      are the starting set, not the complete one.
- [ ] **Actually consume the tokens.** In the mockup the shape and easing
      variables are declared and referenced zero times — every radius and easing
      is written as a literal, and three further variables are declared and never
      read. The port must wire the token layer rather than copying the literals,
      or the appearance controls in 2.5 will have nothing to drive.
- [ ] **Normalise the radius sprawl to the documented scale** — 8 / 12 / 16 / 28
      / full. The mockup uses more than a dozen distinct literal radii, over 160
      of them the pill value; the handoff sheet itself states the intended
      normalisation.
- [ ] **Do not conflate the seed with its output.** The default seed's *swatch*
      is `#C96442` and its *primary role* is `#8F4C34`. The first is the input
      colour, the second is the generated tone. Treating them as the same value
      produces a scheme that is subtly wrong everywhere and very hard to debug.
- [ ] **Implement the three additional seeds** as documented — each overrides
      ten roles in light and twelve in dark, covering the primary, secondary and
      tertiary families plus the inverse primary, while every surface, outline,
      error and success role stays on the default ramp.
- [ ] **Keep the two non-standard success roles** the mockup adds, and document
      them as an intentional extension rather than letting a future reader take
      them for canonical roles.
- [ ] **Add the roles the mockup omits** — surface tint, shadow, and the fixed
      role family — or record in the feature documentation which are
      deliberately unused and why. A silent gap reads as an oversight.

### 2.4 Component anatomy waves

Roughly 197 component files and 42 stylesheets under the web application. This
is the largest single body of work in the roadmap and the least interesting to
describe, so it is tracked as ordered waves with a definition of done per wave
rather than as one item that stays unchecked for months.

- [ ] **Wave 1 — chrome.** Navigation rail (88px collapsed to 260px expanded, a
      56×32 pill indicator on the active destination, a 56px tall extended
      action button), top app bar with the Windows caption controls from 2.1,
      and the tab strip.
- [ ] **Wave 2 — home.** The prompt surface at 28dp with its chip rail, the
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

- [ ] **Theme** — light and dark, persisted, applied live.
- [ ] **Density** — compact / default / comfortable, changing the gap, padding
      and row-height variables. Note that the mockup declares a base spacing
      unit and a card variable that no density level redefines and nothing
      reads; the port should either drive them or drop them.
- [ ] **Seed colour** — the four documented seeds as a starting point. The
      mockup ships four fixed swatches, which is *not* sufficient for the
      standards; the continuous picker that replaces them is Phase 4.
- [ ] **UI scale** — 50–200% in steps of 5, default 100.
- [ ] **Replace the mockup's scaling mechanism.** It sets a custom property that
      nothing reads and does the actual scaling with a non-standard CSS zoom
      property. Implement scaling in a way that is standard, testable, and does
      not break layout measurement.
- [ ] **Auto-fit to window**, as the mockup's appearance card offers.
- [ ] **Font family, size scale, and weight**, chosen from bundled and installed
      faces, with a live preview and a fallback that keeps CJK text legible.
- [ ] **Persist every control across restarts** and apply changes to the live
      interface, not only after a restart.

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

- [ ] **Two independent persisted sliders, 1–5** — one for English, one for
      Cantonese — reachable from the settings surface and actually wired to the
      copy the application renders. One shared slider does not satisfy this, and
      neither does an unwired pair.
- [ ] **Author five distinct samples per language per level.** The mockup
      demonstrates the shape with a live preview panel; the real work is
      authoring the variants for every message the application shows.
- [ ] **Apply the level to every category with no exemptions**, including
      destructive, security and error copy.
- [ ] **Style voice, never facts.** At every level the message still names what
      happened, what is affected, and what the options are, in unambiguous
      words. A warning nobody can act on is a broken warning, not a funny one.
- [ ] **Disclose the behaviour at first run and in the setting itself**, so a
      user knows before opting in that the level styles errors too.

### 3.3 Regex builder on every search bar

- [ ] **Build the regex builder** — guided construction for literals, character
      classes, anchors, groups, alternation and quantifiers; a raw pattern
      editor; the six supported flags; sample text; syntax feedback; live
      matches and capture groups; and copy or export. The mockup's version is a
      good functional starting point: a pattern field with delimiter and flag
      affixes, six flag toggles, fifteen token chips, and a live tester
      reporting match counts, an empty state, and the actual error message when
      a pattern throws.
- [ ] **Anchor it to its field.** The mockup uses one shared floating panel at a
      fixed viewport position that four different search fields all open. The
      standard requires an anchored popover beside each field, bound to that
      field's own query, pattern, flags and mode. This is a deliberate
      improvement on the mockup, not a port of it.
- [ ] **Wire it to every collection search bar**, keeping plain text the default
      and regex an explicit opt-in, with query, pattern, flags, validation and
      mode synchronised in both directions.
- [ ] **Give every settings surface its own search bar wired to the same
      builder** — the application's settings, every tab within them, every
      properties panel, every appearance editor, and every configuration page on
      the documentation site. Searching option labels, descriptions and current
      values, and saying plainly when a match sits on another tab.
- [ ] **Evaluate locally and defensively** — bounded pattern and sample sizes,
      safe zero-width handling, and protection against catastrophic
      backtracking.
- [ ] **Test against the real engine**: valid, invalid, no-match, Unicode,
      multiline, zero-width, capture-group, adversarial, and plain-text versus
      regex cases, exercised from every search surface.

### 3.4 Dim sum surprise

- [ ] **Add a bundled local image catalog** with dish names in English and
      Traditional Chinese. None exists in this repository today. Images are
      bundled assets — no network fetch, no third-party host, no tracking.
- [ ] **Draw fresh at each launch, 10% chance, at most once per launch.**
- [ ] **Present it non-blocking and auto-dismissing.** It never gates startup,
      never steals focus, and never appears during a first run, an error path,
      an update, or any flow where the user is mid-task.
- [ ] **Name the dish in both languages**, honouring the active language mode,
      with the funny level styling the surrounding copy while the dish name
      stays correct.
- [ ] **Give it meaningful alternative text** naming the dish, and respect
      reduced-motion and quiet settings.
- [ ] **Ship no off switch.** The mockup shows this as a row with an ON switch,
      which the standard forbids — the surprise cannot be opted out of, and the
      non-blocking rules above are what keep that polite. Remove the control and
      migrate any stored preference forward.

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
- [ ] **Regex-capable search that composes with the date filter** rather than
      overriding it, with an honest no-match empty state.
- [ ] **Copy the current view and export to Markdown**, honouring the active
      filter and search so the export matches what the user sees, and stating
      the exported range in the file.
- [ ] **Bring the changelog current in every project-changing task**, worked out
      from the real commit history. A viewer that documents the past and
      misleads about the present is worse than no viewer.

### 3.6 Command palette

- [ ] **One discoverable shortcut**, listing every command, setting and
      destination the application has.
- [ ] **Cover every setting in every settings surface**, not only top-level
      actions, so a user who knows a setting's name can type it without knowing
      which tab it lives under.
- [ ] **Render live inline controls in the rows** — a switch for a toggle, a
      text box for a value, a stepper for a number, a select for a choice —
      changing the real setting with the same persistence and validation as the
      settings surface.
- [ ] **Teleport on selection:** open the surface, reveal the exact control, and
      draw attention to it briefly. Landing the user on the right tab and
      leaving them to hunt does not satisfy this.
- [ ] **Two persisted sizes**, defaulting to the bounded card rather than the
      full window.
- [ ] **Its own search wired to the regex builder**, with live group filtering
      that drops empty groups.

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
- [ ] **4.9 Context-menu search and shortcut labels.** Every context menu — tab,
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
- [ ] **4.13 Remaining Cantonese waves.** The dictionary keys not reached in
      Phase 3, tracked wave by wave alongside the component waves.
- [ ] **4.14 Remaining Material Design 3 waves.** Whatever the audit in 2.4
      wave 8 turns up, plus the surfaces added by Phase 4 itself, which must be
      built to the token layer rather than retrofitted to it.

---

<details>
<summary><strong>Standards conformance matrix</strong> — all sixteen standards, the phase that lands each, and today's honest status</summary>

Every row is "not implemented" today. The matrix exists so that stops being
true one row at a time, visibly.

| # | Standard | Phase | Status |
| --- | --- | --- | --- |
| 1 | Language modes and two funny-level sliders | 3.1, 3.2 | Not implemented — no Hong Kong Chinese locale exists at all |
| 2 | Full Material Design 3 conformance | 2.1–2.4 | Not implemented — mockup only, nothing ported |
| 3 | Runtime appearance customization | 2.5, 4.10–4.12 | Not implemented |
| 4 | Regex builder on every search bar | 3.3 | Not implemented |
| 5 | Browser-style tabs everywhere | 3.7, 4.1 | Not implemented |
| 6 | Non-blocking notifications | 4.2 | Not implemented |
| 7 | Super-confirmation gate | 4.3 | Not implemented — absent from the mockup too |
| 8 | Command palette | 3.6 | Not implemented |
| 9 | In-app changelog viewer | 3.5 | Not implemented |
| 10 | Local version history | 4.4 | Not implemented |
| 11 | Export everything, bulk actions | 4.5, 4.6 | Not implemented |
| 12 | Dim sum surprise | 3.4 | Not implemented in the application. A 24-dish catalogue with bundled local images exists under `assets/dim-sum/` |
| 13 | Release code name and line count | 1.1 | Machinery built, no release observed — a committed counter, a code-name picker and the release workflow all exist; none has produced anything |
| 14 | Accessibility and sizing as blockers | Every phase | Not implemented — no build exists to audit |
| 15 | All assets bundled locally | 2.2, 1.3 | Not implemented — one CDN font import in the shipping app, three in the mockup |
| 16 | Docs, changelog, roadmap accurate; honest CI evidence | 1.1, 1.2 | Partially in place — this file, the notice file and `docs/` are kept honest; three workflows exist and no run outcome has been observed, which is what there is to be honest about. No `CHANGELOG.md` yet |

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

**An unverified drop-in contract.** The mockup's handoff sheet maps 18 tokens
onto variables that all exist today, and names 12 component files that all
exist today. That has been checked against the tree. Whether the mapping
produces a correct-looking interface at runtime has *not* been checked, because
nothing has been run. Treat the contract as promising, not proven.

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
