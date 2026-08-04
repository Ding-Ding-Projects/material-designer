# Changelog

Every notable change to this project, newest first.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project intends to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
once it publishes a version of its own.

Two rules this file is held to:

- **Every entry links the commit that made the change.** An entry that says what
  changed but not where is unverifiable — a reader who doubts it, or who needs the
  surrounding context, has no way to get from the sentence to the code.
- **Nothing is invented.** No entry, date, version or fix appears here that did not
  happen. A version with no recorded changes says so rather than being padded.

> [!NOTE]
> **Tags carry a build suffix, not a version this project chose.** `0.16.1` is
> inherited from the imported upstream work and does not yet describe a version this
> project set for itself; the `-rN.N` suffix is what makes each published build
> uniquely identifiable. Every release below carries a dim sum code name beside its
> tag, as this project's release rules require.

## [Unreleased]

Changes land here as they are committed, each with its commit link, and move into a
version section when a release carries them.

### Fixed

- **The Design Files bulk delete no longer reports a success it never had.** It said
  "3 done." after a cancelled confirmation, and after a run where every delete was
  refused — `handleDeleteMany` returned nothing, so the panel fell through to a branch
  that counted every selected item as succeeded. The same call site dropped the caller's
  options, which froze the progress bar at zero and made the Stop control decorative.
  The loop is now `runBulkAction`, the shared runner that already existed for this and
  was used by nothing; five tests pin the invariants, including that a helper resolving
  `false` counts as a failure
  ([`6e90fbd`](https://github.com/Ding-Ding-Projects/material-designer/commit/6e90fbd)).
- **Every dialog keeps the promise its own markup makes.** All of them render
  `aria-modal="true"`, which tells assistive technology the rest of the page is inert,
  and nothing enforced it: Tab walked out of the dialog onto the controls behind the
  backdrop — for a confirmation dialog, the exact controls the user had been asked to
  stop and think about. Focus now moves in on open, stays in, and returns to the opening
  control on close. Fixed in the shared primitive, so every dialog gains it at once
  ([`3f30a12`](https://github.com/Ding-Ding-Projects/material-designer/commit/3f30a12)).
- **The window chrome says the product's own name.** The custom title bar and the home
  hero both rendered "Open Design": `app.brand` carried upstream's name in all nineteen
  declaring locales, and the hero hardcoded the wordmark beyond any dictionary's reach.
  Found by reviewing a smoke capture — the first time one had been looked at rather than
  size-asserted — and confirmed fixed in the `v0.16.1-r19.1` artifact. Open Design Cloud
  keeps its name, because that hosted service is upstream's
  ([`b4bf583`](https://github.com/Ding-Ding-Projects/material-designer/commit/b4bf583)).
- **A stray brace stopped failing every build at minute 35.** One extra `}` in
  `entry-layout.css` failed four consecutive Release runs, each after half an hour, with
  an error naming the import graph's entry file rather than the file at fault
  ([`635ec4f`](https://github.com/Ding-Ding-Projects/material-designer/commit/635ec4f)).

### Added

- **The spoken narrator has a surface a user can reach.** Every part existed — the
  serialized queue, the per-category cooldown, the screen-reader yield, the preference
  store, the panel, and 19 dictionary keys in all twenty locales — and nothing imported
  any of it. It was unmountable rather than merely unmounted: it imported a stylesheet
  that did not exist, so wiring it would have failed the build. The stylesheet is
  written, the panel is its own settings section, and the command palette indexes it
  with two live inline controls. Still off by default
  ([`92ed8c6`](https://github.com/Ding-Ding-Projects/material-designer/commit/92ed8c6)).
- **Cairo ships locally, ending the application's one network font request.** Three
  variable-font subsets (~81 KB) under `apps/web/public/fonts/cairo/`, with the served
  `unicode-range` values kept verbatim so per-page subsetting still works
  ([`45ff210`](https://github.com/Ding-Ding-Projects/material-designer/commit/45ff210)).
- **A brace-balance gate over every tracked stylesheet**, in the fast Verify job. All
  507 balance today, so a mismatch is a defect rather than noise, and the fault class
  that cost four half-hour runs now fails in seconds naming the right file
  ([`a64f241`](https://github.com/Ding-Ding-Projects/material-designer/commit/a64f241)).
- **The four root governance files** — `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md` and
  `CODE_OF_CONDUCT.md` — so the tabs GitHub renders above the README point at something
  ([`230b115`](https://github.com/Ding-Ding-Projects/material-designer/commit/230b115)).

### Changed

- **The roadmap says what is built, what is merely written, and what is broken.** Its
  matrix claimed every standard was unimplemented while eleven were on `main` and in a
  downloadable build. The rewrite turns on one distinction: a module that nothing mounts
  is not a shipped feature. New section 4.0 records the adversarial pass Phase 4 never
  got — 44 findings, 15 confirmed — including that irreversible deletes bypass the
  confirmation gate entirely
  ([`a40b8b8`](https://github.com/Ding-Ding-Projects/material-designer/commit/a40b8b8)).
- **The port verifier has been observed rejecting a bad tree**, not merely passing. A
  deliberately poisoned branch made it report `bytes differ 1` and exit 1, so its green
  ticks now mean something
  ([`b26c5cc`](https://github.com/Ding-Ding-Projects/material-designer/commit/b26c5cc)).

## [v0.16.1-r8.1] — 2026-08-03

**Code name: Beef with Oyster Sauce · 蠔油牛肉** ·
[release](https://github.com/Ding-Ding-Projects/material-designer/releases/tag/v0.16.1-r8.1)

Built from [`dea6b0a`](https://github.com/Ding-Ding-Projects/material-designer/commit/dea6b0a).
The packaged smoke test passed: the built application installed, launched, answered its
own health endpoint and uninstalled without residue.

### Added

- **The Material Design 3 token layer, and a Windows title bar.** The mockup's token
  sheet is transcribed as `md3-tokens.css` — 203 colour roles across light and dark,
  every seed variant, the shape scale, the motion curves and the density steps — and
  the existing token file became a mapping layer, so every legacy token keeps its name
  and resolves to an M3 role. Two things were checked because both fail silently: no
  previously defined token was dropped (a dropped one is an unstyled component, not a
  compile error), and the functional data colours kept their own values rather than
  being remapped onto theme roles, which would have made chart series indistinguishable.
  Windows also gets a frameless window with a custom title bar, using a hidden title-bar
  style rather than a frameless window so Windows 11 keeps its rounded corners, drop
  shadow, Alt+Space and snap behaviour; the window-control messages verify the sender is
  the main window, because embedded frames share the preload
  ([`dea6b0a`](https://github.com/Ding-Ding-Projects/material-designer/commit/dea6b0a)).

> [!IMPORTANT]
> **This is a foundation, not the redesign.** The token layer means components inherit
> M3 values; **no component has been rewritten**. Three departures from the mockup are
> recorded rather than quietly taken: the mockup's subtitle describes the mockup and not
> the product, the focus ring is inset because the window-control buttons sit flush
> against two window edges, and the icon webfont is not bundled — the bar uses the
> application's existing icon set at the contract's sizes.

## [v0.16.1-r7.1] — 2026-08-03

**Code name: Beef with Black Bean and Peppers · 豉椒炒牛肉** ·
[release](https://github.com/Ding-Ding-Projects/material-designer/releases/tag/v0.16.1-r7.1)

The first published release, built from
[`12bfb81`](https://github.com/Ding-Ding-Projects/material-designer/commit/12bfb81). It
carries everything from the verbatim import forward. The packaged smoke test passed.

### Added

- The whole of Open Design v0.16.1 under `design/` — **11,799 files**, copied
  byte-for-byte from the pinned upstream tree, file modes included
  ([`5ef7393`](https://github.com/Ding-Ding-Projects/material-designer/commit/5ef7393)).
- `scripts/verify-port.sh`, which proves that copy has not drifted, and
  `MODIFICATIONS.md`, which is simultaneously the Apache-2.0 §4(b) notice and the
  allowlist the verifier enforces — a file may differ from upstream only if it is
  listed there, and a listed file that no longer differs fails too
  ([`b8dc87d`](https://github.com/Ding-Ding-Projects/material-designer/commit/b8dc87d)).
- `scripts/upstream-manifest.tsv`, a committed table of upstream object ids, so the
  integrity check does not have to clone a 1.7 GB object store on every push. When
  the submodule is present the manifest is checked against it first, so the shortcut
  cannot drift from the thing it stands in for
  ([`65e288f`](https://github.com/Ding-Ding-Projects/material-designer/commit/65e288f)).
- A dish catalogue of 24 dishes across 12 categories under `assets/dim-sum/`, each
  image copied byte-for-byte and verified by SHA-256 against its source manifest,
  plus `scripts/release-codename.sh`, which spends each dish exactly once by reading
  the used ones back out of existing releases
  ([`a454a7b`](https://github.com/Ding-Ding-Projects/material-designer/commit/a454a7b)).
- Three workflows: `verify.yml` (port integrity plus the full unit suite on Linux),
  `release.yml` (install, typecheck, Windows identity tests, installer build, packaged
  smoke test, release publication) and `pages.yml` (the documentation site)
  ([`65e288f`](https://github.com/Ding-Ding-Projects/material-designer/commit/65e288f)).
- The repository's documentation: `README.md`, `AGENTS.md`, `ROADMAP.md`,
  `HANDOFF.md`, a categorized `docs/` tree, a committed line counter, and a
  368-request Postman collection for the daemon's HTTP API
  ([`c2ca744`](https://github.com/Ding-Ding-Projects/material-designer/commit/c2ca744)).
- The documentation site at
  <https://ding-ding-projects.github.io/material-designer/> — self-contained, with
  three language modes, two funny-level sliders, Material Design 3 tokens, appearance
  customization, a regex builder on every search field and browser-style tabs
  ([`29c1476`](https://github.com/Ding-Ding-Projects/material-designer/commit/29c1476)).

### Changed

- **The packaged application is now a standalone product.** Installed beside the
  upstream one, an unmodified build was the same application as far as Windows is
  concerned, and collided in eight ways — five of which corrupt or break something.
  It now has its own display name, application ids, Windows named-pipe prefix,
  uninstall registry key, install location, user-data directory and taskbar identity
  ([`cbd6a14`](https://github.com/Ding-Ding-Projects/material-designer/commit/cbd6a14)).
- The Material Design 3 mockup moved to `mockups/open-design-m3/` so `design/` could
  hold the imported tree
  ([`2567115`](https://github.com/Ding-Ding-Projects/material-designer/commit/2567115)).
- **The site documentation stopped saying the site was unpublished.** It had been for
  several runs. The correction also recorded the two things that were actually in the
  way, because both will catch the next person: the publishing surface had never been
  enabled on the repository, which no workflow can do for itself, and the dish
  catalogue lives outside the published directory, so the deployment has to stage it in
  ([`fb8ba8c`](https://github.com/Ding-Ding-Projects/material-designer/commit/fb8ba8c)).
- **This file was created**, written from the real commit history rather than from
  memory, with every object id it references checked against the object store before it
  was committed. The same commit replaced the README's claim that no
  continuous-integration outcome had been observed with a table of what each workflow
  had actually done — keeping the rows that were still unobserved visible in that table
  rather than omitting them
  ([`ec46f83`](https://github.com/Ding-Ding-Projects/material-designer/commit/ec46f83)).

### Fixed

- **The packaged build no longer updates itself into a different product.** The
  updater shipped enabled by default and pointed at the upstream release feed, so a
  build of this project would have downloaded that project's installer and replaced
  itself with it. Updates are now opt-in and the default origin cannot resolve
  ([`cbd6a14`](https://github.com/Ding-Ding-Projects/material-designer/commit/cbd6a14)).
- The daemon no longer fetches a remotely-controlled document from an upstream-owned
  host on every launch and render its title, body, image and clickable link inside
  this application. That surface is now opt-in with no default
  ([`cbd6a14`](https://github.com/Ding-Ding-Projects/material-designer/commit/cbd6a14)).
- Two build-breaking literals left over from the rename: the payload writer looked for
  an executable under the old product name while the builder produced the new one, and
  the launcher archive path disagreed with the paths module about its own filename
  ([`cbd6a14`](https://github.com/Ding-Ding-Projects/material-designer/commit/cbd6a14)).
- Private references removed from the design mockup — a personal account name, three
  internal tool names and a local endpoint, in a public repository. Earlier revisions
  still contain them; cleaning that is a history rewrite and has not been done
  ([`b5441b3`](https://github.com/Ding-Ding-Projects/material-designer/commit/b5441b3)).
- The site's dish catalogue was addressed outside the published directory and would
  have returned 404 for every visitor; the deployment now stages it into the artifact
  ([`29c1476`](https://github.com/Ding-Ding-Projects/material-designer/commit/29c1476)).
- An unknown translation key rendered as its own name in brackets. Three quarters of
  the site's keys were not yet written, so unknown keys now leave the element's own
  English text in place and report once to the console — the page reads correctly and
  the gap stays visible
  ([`29c1476`](https://github.com/Ding-Ding-Projects/material-designer/commit/29c1476)).
- Continuous integration ran several suites on a platform that cannot satisfy them:
  macOS binaries asserting a Unix executable bit NTFS does not store, a five-second
  test budget written for a developer's disk, a package importing output that had not
  been compiled, and tests symlinking a layout Windows will not let a runner create.
  The suites are now split by what each platform can answer, and every spec still runs
  somewhere ([`187d216`](https://github.com/Ding-Ding-Projects/material-designer/commit/187d216),
  [`217610e`](https://github.com/Ding-Ding-Projects/material-designer/commit/217610e),
  [`d7d3698`](https://github.com/Ding-Ding-Projects/material-designer/commit/d7d3698),
  [`29c1476`](https://github.com/Ding-Ding-Projects/material-designer/commit/29c1476)).
- **The installer build no longer fails schema validation before packing anything.**
  A publisher-name property was set so the executable's company field would not be
  blank; the packaging tool's current major version classes it as a signing input and
  moved it elsewhere, so setting it where it used to live is rejected on sight. The
  property is gone and the comment says why — the company field stays empty, the same
  as upstream, because this build does not sign
  ([`12bfb81`](https://github.com/Ding-Ding-Projects/material-designer/commit/12bfb81)).

## Not done yet

Listed here because a changelog that only records progress misleads about the shape of
the work. This is the current position, not a record of any one release. The full
burn-down is in [`ROADMAP.md`](ROADMAP.md).

- The Material Design 3 redesign is **a foundation, not a finished redesign**. The
  token layer and the Windows title bar have landed; **no component has been
  rewritten**, and the interface is still substantially the imported one.
- The application has no Cantonese locale, no funny-level sliders, no in-app regex
  builder, no dish surprise and no changelog viewer. The site demonstrates all of
  them; the application does not have them.
- No installer is code-signed, so every published one trips SmartScreen on first run.
- Nothing but Windows is published. There is no macOS or Linux artifact and no
  updater feed.
- The daemon's HTTP API has been documented and turned into a request collection, but
  **no request in that collection has been sent** — the route inventory was read from
  source, not observed answering.
