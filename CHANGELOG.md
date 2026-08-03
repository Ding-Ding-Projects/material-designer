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

> [!IMPORTANT]
> **There are no releases yet.** Nothing below has been packaged, published or
> installed by anybody. The version in `design/package.json` is inherited from the
> imported upstream work and does not describe a build of this project.

## [Unreleased]

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

### Not done yet

Listed here because a changelog that only records progress misleads about the shape of
the work. The full burn-down is in [`ROADMAP.md`](ROADMAP.md).

- No installer has been published, so there is nothing to install.
- The application's own interface is **not** Material Design 3 yet. The mockup in
  `mockups/` specifies the redesign; the site demonstrates the token system; the
  application still carries the imported design.
- The application has no Cantonese locale, no funny-level sliders, no regex builder,
  no dish surprise and no changelog viewer. The site has all of them; the application
  does not.
- Windows builds have no frameless window or custom title bar yet.
