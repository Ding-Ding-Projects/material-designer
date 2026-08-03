# Material Designer documentation

Material Designer is a rebrand and Material Design 3 redesign of a local-first
design workspace. The upstream product is vendored verbatim under `design/`; the
work of this repository is the branding, the MD3 redesign, and the governance
that keeps the copy provably faithful to its source.

> [!IMPORTANT]
> **The application has not been installed, built, run, or tested.** The script
> that has actually been executed is `scripts/verify-port.sh` — and nothing else.
> Its output moves as rebranding work lands, so it is quoted **once**, annotated
> and labelled with the commit it was taken at, in
> [porting/verification.md](porting/verification.md#reading-a-run); no other page
> pastes a copy. Three workflows exist at `.github/workflows/` — `Verify`,
> `Release` and `Pages` — but **no run outcome is recorded anywhere in this
> tree**, and no installer, release or published site is claimed. Every page here
> says plainly which statements are verified, which describe a committed
> definition, and which describe intent.

## Start here

| If you want to… | Read |
| --- | --- |
| Understand what the product actually is | [architecture/overview.md](architecture/overview.md) |
| Know how the upstream copy got here and why you can trust it | [porting/](porting/) |
| Build an installer | [build/ci.md](build/ci.md) |
| Build locally instead | [build/from-source.md](build/from-source.md) |
| Know what this project holds itself to | [standards/](standards/) |
| Publish or change the documentation site | [site/](site/) |
| Call the local daemon over HTTP | [api/](api/) |

## Categories

| Category | What it covers |
| --- | --- |
| [porting/](porting/) | How `design/` was imported byte-for-byte, and the verifier plus licence-notice contract that proves it stayed that way. |
| [architecture/](architecture/) | The daemon / web / desktop / packaged / landing-page split, how the pieces connect, which ports they use, and the role of the command-line entry point. |
| [build/](build/) | Why builds run in continuous integration, what the release workflow is expected to do, and the exact commands for building locally. |
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
| `scripts/line-count.mjs` | The committed line counter continuous integration runs at a released commit, broken down by scope and attributed per surviving line. | [standards/releases.md](standards/releases.md) |
| `scripts/release-codename.sh` | Picks a release's dim sum code name, reading the spent dishes out of prior release bodies and skipping any dish whose image is absent. | [standards/releases.md](standards/releases.md) |
| `scripts/import-dim-sum.sh` | Copies dishes into `assets/dim-sum/` byte-for-byte from a verified catalogue and writes the index. Images are never generated, downloaded or re-encoded. | [standards/releases.md](standards/releases.md) |
| `assets/dim-sum/` | The bundled catalogue — `index.json` plus its images — used for release code names and the startup surprise. Local assets only. | [standards/releases.md](standards/releases.md) |
| `.github/workflows/` | This project's three workflows: `verify.yml`, `release.yml` and `pages.yml`. The 48 under `design/.github/workflows/` are upstream's and inert. | [build/ci.md](build/ci.md), [site/pages-deployment.md](site/pages-deployment.md) |
| `site/` | The static source of the documentation and landing site. No build step. | [site/](site/) |
| `design/LICENSE` | Apache License 2.0, the licence of the vendored work. | [porting/](porting/) |
| `mockups/open-design-m3/` | The Material Design 3 redesign mockup that specifies the intended interface. Not wired into any build. | [standards/material-design-3.md](standards/material-design-3.md) |
