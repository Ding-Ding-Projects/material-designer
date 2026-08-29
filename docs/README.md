# Material Designer documentation

Material Designer is a rebrand and Material Design 3 redesign of a local-first
design workspace. The upstream product is vendored verbatim under `design/`; the
work of this repository is the branding, the MD3 redesign, and the governance
that keeps the copy provably faithful to its source.

> [!IMPORTANT]
> **What has actually been observed, and what has not.** Continuous integration
> has verified the port on a clean checkout, installed the workspace with native
> modules compiled from source, typechecked it, run its unit suites, built Windows
> installers, published releases, and — through the packaged smoke test —
> installed a built application, launched it, had the running process answer its
> own health endpoint, screenshotted it and uninstalled it with zero residue. The
> documentation site is published.
>
> **The application is not finished.** Several formerly isolated feature modules
> are source-reachable, but product-wide coverage and built interaction remain
> incomplete. The Material Design 3 redesign now includes the token layer, the
> Windows title bar, shared component primitives, and one production searchable
> select. Dependency-complete package checks, installed interaction, accessibility
> measurements, and capture evidence remain pending.
>
> The verifier's own output moves as rebranding work lands, so it is quoted
> **once**, annotated and labelled with the commit it was taken at, in
> [porting/verification.md](porting/verification.md#reading-a-run); no other page
> pastes a copy. Every page here says plainly which statements are observed, which
> describe a committed definition, and which describe intent.

## Start here

| If you want to… | Read |
| --- | --- |
| Understand what the product actually is | [architecture/overview.md](architecture/overview.md) |
| Know how the upstream copy got here and why you can trust it | [porting/](porting/) |
| Add code that writes anything to disk | [architecture/data-directory.md](architecture/data-directory.md) — **before** writing it |
| Build an installer | [build/ci.md](build/ci.md) |
| Build locally instead | [build/from-source.md](build/from-source.md) |
| Understand how a release is produced and what proves it works | [release/](release/) |
| Diagnose a failure somebody here has already hit | [troubleshooting/](troubleshooting/) |
| Know what this project holds itself to | [standards/](standards/) |
| Publish or change the documentation site | [site/](site/) |
| Call the local daemon over HTTP | [api/](api/) |

## Categories

| Category | What it covers |
| --- | --- |
| [porting/](porting/) | How `design/` was imported byte-for-byte, and the verifier plus licence-notice contract that proves it stayed that way. |
| [architecture/](architecture/) | The daemon / web / desktop / packaged / landing-page split, plus a page for each runnable piece and one for the data-directory contract — the single most important invariant in the codebase. |
| [build/](build/) | Why builds run in continuous integration, what each workflow does, and the exact commands for building locally. |
| [release/](release/) | How a release is produced end to end, what the packaged smoke test actually proves, how the line count is produced and what its scopes mean, how a dim sum code name is chosen and spent, and what each published asset is. |
| [troubleshooting/](troubleshooting/) | Failures this project actually hit — line-ending translation, tests on a platform that cannot satisfy them, an unbuilt import, a timeout written for a fast disk, a build-tool property that moved between major versions — each with its symptom, cause and fix. |
| [standards/](standards/) | The requirements this product is being brought up to — language modes, Material Design 3, the regex builder, tabs, notifications, export and bulk actions, accessibility, releases — each with an honest implementation status. |
| [site/](site/) | The documentation and landing site: what `site/` is built from, the `Pages` workflow that deploys it, its publish-time bundled-assets gate, and the base-path trap that makes a green deployment 404. |
| [api/](api/) | The local daemon's HTTP surface, grouped by route file, and the state of the request-collection artifact. |

## The convention this tree follows

**One Markdown file per feature.** A feature is a thing a user can do or a thing
an operator has to configure — not a source file and not a package. A file is
named after the feature, lives under the category that owns it, and is linked
from that category's `README.md`.

**Every category has a `README.md` index.** The index lists each file in the
category with a one-line description and states, for the category as a whole,
what is implemented and what is not. A reader must be able to tell from the index
alone whether the thing they came for exists yet.

**Every feature file covers the same five things**, in this order, because the
questions a reader arrives with are always the same:

1. **Behaviour** — what it does, from the point of view of somebody using it. The
   observable contract, not the implementation.
2. **Configuration** — every setting, environment variable, flag, and default
   that changes the behaviour, with the default stated explicitly.
3. **Failure modes** — how it breaks, what the breakage looks like from outside,
   and what the reader should do about it. A feature file with no failure-modes
   section is an incomplete file, not a simple feature.
4. **Security considerations** — what trust boundary the feature sits on, what it
   exposes, and what an operator must not do with it. Where a feature genuinely
   has no security surface, the file says so in one line rather than omitting the
   heading.
5. **Verification** — how somebody else can check that the claims above are true.
   Exact commands where they exist. Where a claim is *not* currently verifiable,
   the file says which claim and why.

**One category is deliberately shaped differently.** Articles under
[troubleshooting/](troubleshooting/) use **Symptom / Cause / Fix / How to avoid
reintroducing it / Verification / Security considerations** instead, because the
whole article *is* a failure mode — a separate failure-modes section inside one
would restate its own subject. Those pages are conformant; every other category
follows the five headings above.

**Long reference material goes inside `<details>` blocks.** GitHub renders those
natively, so a page is navigated rather than scrolled. The `<summary>` line
describes what is inside well enough to find with the browser's own text search.
What a first-time reader needs — what a thing is, how to run it, where to go next
— is never collapsed.

**Unimplemented work is described as unimplemented.** Where a standard is not met
yet, the file states the requirement, states plainly that it is not started or
partially met, and describes how conformance will be verified once it exists. It
never uses the present tense for something that does not run.

## Related files outside this tree

| Path | What it is | Documented in |
| --- | --- | --- |
| `MODIFICATIONS.md` | The Apache-2.0 §4(b) change notice **and** the machine-read allowlist of files permitted to differ from upstream. | [porting/verification.md](porting/verification.md) |
| `scripts/verify-port.sh` | The verifier that enforces the above. Pure `git` and POSIX shell, so it runs without a toolchain. | [porting/verification.md](porting/verification.md) |
| `scripts/upstream-manifest.tsv` | The committed table of upstream blob ids the verifier falls back to when the submodule is not checked out, so continuous integration need not clone it. | [porting/verification.md](porting/verification.md) |
| `scripts/line-count.mjs` | The committed line counter continuous integration runs at a released commit, broken down by scope and attributed per surviving line. | [release/line-count.md](release/line-count.md) |
| `download-dependencies.bat` | One-click silent and idempotent acquisition of the pinned build toolchain, verified by its committed manifest. | [build/from-source.md](build/from-source.md) |
| `scripts/release-codename.sh` | Picks a release's next unused dim sum code name, verifies a published catalog image digest, and downloads it only into run-scoped staging. | [release/code-names.md](release/code-names.md) |
| `scripts/import-dim-sum.sh` | Copies dishes into `assets/dim-sum/` byte-for-byte from a verified catalogue and writes the index. Images are never generated, downloaded or re-encoded. | [release/code-names.md](release/code-names.md), [standards/releases.md](standards/releases.md) |
| `assets/dim-sum/` | The bundled catalogue — `index.json` plus its images — used for release code names and the startup surprise. Local assets only. | [release/code-names.md](release/code-names.md), [standards/releases.md](standards/releases.md) |
| `design/e2e/specs/win.spec.ts` | The packaged smoke test: installs the built installer, launches it, health-checks the running process, screenshots it, uninstalls it and asserts zero residue. | [release/packaged-smoke-test.md](release/packaged-smoke-test.md) |
| `.github/workflows/` | This project's three workflows: `verify.yml`, `release.yml` and `pages.yml`. The 48 under `design/.github/workflows/` are upstream's and inert. | [build/ci.md](build/ci.md), [site/pages-deployment.md](site/pages-deployment.md) |
| `postman/` | The daemon's HTTP API as a Postman collection — 368 requests in 28 folders — plus its own README covering import, folders, destructive and streaming requests. Committed and **unexercised**: no request in it has been sent. | [api/](api/) |
| `site/` | The static source of the documentation and landing site. No build step. | [site/](site/) |
| `design/LICENSE` | Apache License 2.0, the licence of the vendored work. | [porting/](porting/) |
| `mockups/open-design-m3/` | The Material Design 3 redesign mockup that specifies the intended interface. Not wired into any build. | [standards/material-design-3.md](standards/material-design-3.md) |
