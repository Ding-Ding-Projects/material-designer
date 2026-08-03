# AGENTS.md — working rules for this repository

**This file is a sanitized mirror of the project's shared standards.** It states the
behavioural requirements every agent and contributor works to in this repository, with
every environment-specific detail omitted.

Three things follow from "mirror":

- **It is refreshed when the shared standards change.** If the standards move, this file
  is updated in the same task that notices the drift, not "later".
- **Editing this file does not propagate anywhere.** A change made here changes this
  repository's copy and nothing else. Propose changes to the standards themselves at
  their source; mirror the result outward.
- **It may narrow, never silently disable.** A rule below may be made *stricter* for this
  repository. If a local requirement genuinely conflicts with a rule here, stop and report
  the conflict rather than picking a winner quietly.

### This file outranks `design/AGENTS.md`

`design/` carries the upstream project's own `AGENTS.md` and `CLAUDE.md`, imported
verbatim along with everything else. They describe *that* project's conventions and are
kept unaltered because the copy is proved byte-for-byte — not because they govern here.

Where the two disagree, this file wins, and the disagreements are real rather than
hypothetical. Two known ones:

| Subject | `design/AGENTS.md` says | This repository does |
|---|---|---|
| Commit trailers | Commits must carry no `Co-authored-by` trailer | Commits **do** carry one, because the line counter attributes authorship from it and a release that reports who wrote the code needs the evidence to be there |
| Packaged app identity | The packaged app is named for the upstream product | The packaged app is **Material Designer**, with its own application id, install location, data directory and registry keys — see [`MODIFICATIONS.md`](MODIFICATIONS.md) |

Read the upstream file for how the *code* is organised — its boundaries, its data-path
contract, its animation rules — all of which still apply, because it is still that
codebase. Read this file for how work is done *here*.

---

## What this repository is

**Material Designer** — a Material Design 3 rebuild of a local-first design workspace.

| Path | What it holds |
|---|---|
| `design/` | A **byte-verbatim** copy of the upstream project (Apache-2.0). 11,799 files. |
| `vendor/open-design` | The pinned upstream submodule the copy is proven against. |
| `mockups/open-design-m3/` | The Material Design 3 mockup that specifies the intended redesign of the product's own UI. |
| `docs/` | **The categorized feature documentation.** One file per feature, one `README.md` index per category. Start at [`docs/README.md`](docs/README.md) — read the category that owns whatever you are about to change. |
| `site/` | The static source of the documentation and landing site. No build step; deployed by `Pages`. Documented in [`docs/site/`](docs/site/). |
| `assets/dim-sum/` | The bundled dish catalogue — `index.json` plus its images — used for release code names and the startup surprise. Local assets only, never fetched. |
| `.github/workflows/` | This project's own three workflows: `verify.yml`, `release.yml`, `pages.yml`. The 48 under `design/.github/workflows/` are upstream's and inert. |
| `scripts/verify-port.sh` | Proves `design/` still matches upstream. Pure `git` + shell. |
| `scripts/upstream-manifest.tsv` | The committed upstream blob-id table the verifier falls back to when the submodule is not checked out. |
| `scripts/line-count.mjs` | The committed line counter CI runs at a released commit. Never count by hand — run this. |
| `scripts/release-codename.sh` | Picks a release's dish code name from the catalogue, skipping any dish whose image is absent. |
| `scripts/import-dim-sum.sh` | Copies catalogue images in byte-for-byte from a verified source and writes `assets/dim-sum/index.json`. |
| `MODIFICATIONS.md` | Apache-2.0 §4(b) notice **and** the allowlist the verifier reads. |

**Status, stated plainly.** The repository root holds this project's own three workflows —
`.github/workflows/verify.yml` (*Verify*), `.github/workflows/release.yml` (*Release*) and
`.github/workflows/pages.yml` (*Pages*) — and **all three have run**. Port verification
passes at 0 gaps; the workspace has installed with its native modules compiled from source,
typechecked, and passed the Windows identity suites; Windows installers have been built and
put through the packaged smoke test, which installed, launched, health-checked and
uninstalled the application with zero residue; two releases are published; the documentation
site is deployed.

**What is emphatically not finished is the application.** The Cantonese locale, the two
funny-level sliders, the in-app regex builder, the startup surprise and the changelog viewer
are **in progress** — the documentation site demonstrates them, the application does not have
them. The Material Design 3 redesign has landed its token layer and the custom Windows title
bar and no more. Never describe any of those as shipped.

Keep the distinction between a definition and a result sharp in everything you write: a
workflow that *would* verify, build or deploy is not a verification, a build or a
deployment. Cite a run, not a file, as evidence — and where no run has demonstrated
something, say so rather than reasoning from the workflow's contents. No run has yet been
observed *failing*, so nothing here may be described as a proven gate.

Separately, the 48 workflow files under `design/.github/workflows/` belong to upstream and
are **inert** — GitHub Actions only reads `.github/workflows/` at the repository root, so
none of them runs here. They share nothing with this project's three. A reader who mistakes
them for this project's CI has been misled; say so wherever it could be assumed.

---

## Hard invariants

These are not preferences. A change that breaks one of them is wrong regardless of how
good the rest of it is.

### 1. `design/` is byte-verbatim. Declare every change or the verifier fails.

`design/` is a byte-for-byte copy of the pinned upstream tree — same bytes, same file
modes, same blob ids. It is not a starting point to edit freely.

**Any file under `design/` that differs from upstream MUST have an entry in
`MODIFICATIONS.md`.** The verifier reads that file as its allowlist, so the notice and the
code cannot drift apart:

- a file that differs **without** an entry → verification fails;
- an entry for a file that **no longer** differs → verification also fails.

Paths are relative to `design/` and are written as `` - `path/to/file` `` under the
**Changed files** heading of an entry. Each entry states the reason in plain language.
`MODIFICATIONS.md` is simultaneously the Apache-2.0 §4(b) "prominent notice" and the
machine-checked allowlist — treat both jobs as load-bearing.

**Run the verifier before every commit that touches `design/`:**

```sh
git submodule update --init            # optional: without it the verifier falls back
                                       # to scripts/upstream-manifest.tsv and says so
sh scripts/verify-port.sh              # human-readable
sh scripts/verify-port.sh --json       # machine-readable summary
```

It reports: expected · tracked · present · declared · missing · bytes differ · mode
mismatch · oid mismatch · extra · untracked · stale notice.

> [!IMPORTANT]
> **Line endings will fail this check if you let them.** The verifier hashes on-disk bytes.
> A checkout with `core.autocrlf=true` rewrites LF to CRLF under `design/` and the verifier
> then reports thousands of `bytes-differ` results that have nothing to do with your change.
> Configure `core.autocrlf=false` **before** checking out, or run the verifier on a
> LF-native platform.

Prefer changing nothing under `design/` at all. Where the redesign genuinely requires it
(branding strings, application identity, added locales, token wiring), make the smallest
possible edit and declare it.

### 2. Heavy work happens in CI, not on a contributor's machine.

Installing this project compiles native modules, builds every workspace target, and packs
an Electron application. That is a heavyweight operation with real toolchain prerequisites,
and **continuous integration on a hosted Windows runner is this project's supported path
for all of it**.

- Do **not** run `node`, `pnpm`, or `electron` locally as a matter of course. Install,
  build, typecheck, test, and package in CI.
- Local work is editing, reading, reviewing, and running the pure-shell verifier.
- If a check can only be answered by building, the answer is "CI will tell us" — not a
  guess, and not a local build undertaken quietly.
- Report the CI run and its **actual** verdict. Never predict one.

Toolchain facts, for the workflows that need them: Node ~24 and pnpm 10.33.2 are pinned by
the imported project and are not negotiable downward. On Windows the SQLite native module
has no prebuilt binary for this Node line and compiles from source, which requires Visual
Studio Build Tools 2022 (Desktop C++ workload) and Python 3.x on `PATH`. There is
deliberately no root aggregate `build`/`test`/`dev` script upstream; drive package-scoped
commands instead.

### 3. Commit messages are bilingual, and both halves are funny.

Every commit message is written in **English and playful Hong Kong-style Cantonese**, both
saying the same thing, both actually witty — not a joke in one language beside a dry
changelog in the other.

- The **subject line stays a precise, scannable summary**. Someone reading the log must
  learn what happened without decoding a joke. Put the Cantonese counterpart in the body
  when a combined subject would be unclear or too long.
- **Humour styles the telling, never the facts.** The body names the real behaviour, the
  real cause, and the real fix in unambiguous words. Identifiers — paths, flags, versions,
  commit ids, environment variable names — are written **exactly** in both languages.
- **Roast the code, never a person.** No blaming a contributor, an author, or a previous
  agent. No self-deprecation that muddies what actually changed.
- `WIP` is not a commit message. A genuine checkpoint says it is one and says what state
  the work was left in.

<details>
<summary>Shape of a commit message (structure, not a template to copy verbatim)</summary>

```
Declare the Windows title-bar change in MODIFICATIONS.md

The verifier was failing because two files under design/ had been edited and
nobody had told the allowlist, which is exactly the failure mode the allowlist
exists to produce. Added the entry; verify-port.sh is green again.

改咗 design/ 入面兩個檔案，但無同 MODIFICATIONS.md 講聲，個 verifier 即刻黑面。
而家補返個 entry，scripts/verify-port.sh 再行過，冇事喇。

Changed: apps/desktop/src/main/runtime.ts, apps/desktop/src/main/preload.cts
```
</details>

### 4. Every task ends with the documentation, roadmap and changelog accurate — and pushed.

A task is not finished when the code is written. It is finished when:

- the README, the categorized feature documentation, the roadmap and the changelog all
  describe what is actually true **after** this change;
- the work is merged into the default branch and pushed to the remote;
- the push is verified to contain the intended commit;
- and the CI outcome is recorded honestly as running, failed, or verified.

Never force-push unless a reviewed history rewrite has been explicitly requested. Never
leave completed work only on a task branch, in a linked worktree, or in a stash.

### 5. This is a public repository. Keep private material out of it.

Never commit — in any file, commit message, comment, issue, discussion, release note, or
published page — machine names, host inventories, IP addresses, SSH targets, absolute local
paths, operating-system usernames or home directories, credentials, tokens, or any other
detail identifying where the work was done or on what infrastructure. Where a rule cannot
be stated without such a detail, **generalize it** — describe the kind of location or host,
never the specific one. Do not silently drop a requirement because sanitizing it is awkward.

**Sample data in mockups, fixtures, screenshots and documentation is public content and is
held to exactly the same rule.** Every account handle, repository name, organization, host,
URL, port and tool name shown as example data must be fictional — `designer`,
`example-org/sample-app`, `local-tools` — never a real account, a real repository, a real
endpoint, or the name of a real internal tool. A mockup is not a private scratch file: it is
committed, it is published with the repository, and it is the specification the shipping
interface is built from, so a real name placed there travels straight into the product.

### 6. Branding scope is minimal and deliberate.

The product ships as **Material Designer** with its own application identity. Package names,
the CLI name, environment variable prefixes, and storage keys inherited from upstream stay
as they are — renaming them is out of scope and breaks compatibility for no benefit.

Apache-2.0 §6 grants no trademark rights. The upstream project's name, logo and application
identity remain theirs; builds from this repository are not produced by, endorsed by, or
affiliated with it, and must say so where the question could arise.

Upstream's own telemetry code is present verbatim under `design/` and is inert here because
**no telemetry credentials are configured in this repository**. State it that way. Do not
write "telemetry was removed" — the code paths still exist byte-for-byte, and a false claim
about data collection is the worst kind of documentation error.

---

## The standards

These sixteen are the project's own requirements. They apply to **every user-facing surface
individually** — the desktop application, every screen, every panel, every dialog, the
landing page, and the documentation site including its own settings page. "It is small",
"it is obviously scannable", "it is only docs" are not exemptions. Where a rule genuinely
cannot apply to a surface, say which rule and why in that surface's documentation rather
than leaving a silent gap.

<details open>
<summary><b>1–4 · Language, Material Design 3, appearance, search</b></summary>

**1. Language modes and two funny-level sliders.**
Every user-facing surface provides a persisted language mode with exactly three choices:
English, playful Hong Kong-style Cantonese, and a bilingual mode. Alongside it, **two
independent persisted sliders from 1 (fully serious) to 5 (maximum playfulness)** — one per
language — restyle *all* copy, with no category exempt: errors, warnings, destructive
confirmations, security notices. *Rationale: the funny level changes **voice, never facts**
— at every level the message still names what happened, what is affected, and what the
user's options are, so a warning nobody can act on is a broken warning, not a funny one.
Two sliders because the two languages carry humour differently.*

**2. Full Material Design 3 (M3 Expressive) conformance.**
Tokens, typography, shape, elevation, motion and component anatomy, with zero legacy design
elements remaining. Functional data colours — chart series, status palettes, data-encoding
swatches — are exempt as data, not chrome. *Rationale: partial conformance reads as
inconsistency rather than as a design; and the token layer must actually be **consumed**
(`var(--md-sys-…)`), not declared and then bypassed with literals.*

**3. Runtime appearance customization, to a word-processor depth.**
Persisted controls for theme, density, seed/accent colour and full font control; a
per-element **Edit appearance…** command in every context menu with an anchored, non-modal
editor beside the element it edits; an **infinite colour picker** — a continuous
spectrum/wheel plus numeric entry, never swatches alone — with a colour-space translator
covering HEX/HEX8, RGB(A), HSL(A), HSV, HWB, LAB/LCH, OKLab/OKLCH and CMYK; named presets;
theme export/import; per-element and global reset. The pickers theme **themselves and their
own chrome**, not only the document. *Rationale: a theming feature that cannot theme its own
dialog is incomplete, and a customization surface that silently drops a value it cannot
represent has lost the user's input without telling them.*

**4. A full regex builder, anchored beside every search bar.**
Every search field has an adjacent affordance opening a full builder — guided construction
for literals, classes, anchors, groups, alternation and quantifiers, a raw pattern editor,
flags, sample text, live matches and capture groups, and copy/export — bound to *that*
field's query, pattern, flags and mode. Plain text is the default; regex is an explicit
opt-in. **Every settings, preferences and properties surface carries its own search wired to
the same builder**, and says plainly when a match sits on a different tab. *Rationale: the
builder belongs to the field the user is already typing in; one shared floating panel that
four fields all open is a shared hidden state waiting to be applied to the wrong search.
Evaluate locally, bound pattern and sample sizes, and guard against catastrophic
backtracking.*

</details>

<details open>
<summary><b>5–8 · Tabs, notifications, destructive gates, command palette</b></summary>

**5. Browser-style tabs everywhere.**
Content separates into discrete pages reached from a persistent tab strip, never one long
scroll. Required in full: an overflow surface when tabs exceed the width (never silently
clipped), reordering, pinning into a stable dedicated region, grouping with names, colours
and collapse, **four tab-discovery searches** (current strip · inside each group · groups by
name · a master search across every open tab), each with its own anchored builder; and
**Close tabs containing text** / **Close tabs not containing text** with a match-count
preview, matching only visible labels, pinned tabs excluded by default. Tab order, pins,
groups, group order, collapsed state and membership persist across restarts. *Rationale: a
bulk close that runs on an empty query, an invalid pattern, or without a preview is a data
loss event with a friendly button on it.*

**6. Non-blocking notifications; modals only for decisions.**
Informational, success, progress and non-decision error messages appear as corner-anchored
toasts that stack without overlapping and auto-dismiss — errors and warnings persist until
dismissed. Modals are reserved for decisions the user must make before continuing:
confirmations, unsaved-changes prompts, destructive gates, credential and consent steps. A
**notification centre** keeps dismissed messages reviewable. No unsolicited prompts asking
for payment, donations, reviews, ratings, or upgrades — ever. *Rationale: a dialog that only
informs has stopped the user to tell them something they did not need to stop for.*

**7. Super confirmation for destructive actions.**
A destructive action passes a gate built in the application's own UI layer that names the
exact action and the exact data affected, requires **two independently operated keys**,
then enables a **full-range slider** that must be completed, shows non-blocking progress
while it moves and a distinct completion state after, and offers an always-available
**emergency exit** plus the platform's cancel path. Focus returns to the originating control
on cancel or completion. Keyboard-operable, screen-reader named, reduced-motion aware. *Rationale:
playful copy and animation may style the gate, but must never obscure what is about to become
irreversible.*

**8. A command palette covering everything.**
One discoverable shortcut opens a palette listing every command, setting and destination —
including **every setting in every settings surface**, not just top-level actions. Rows that
*are* settings render the live control inline (switch, stepper, text box, select) with the
same persistence and validation as the settings surface itself; rows that are destinations
**teleport** — open the surface, reveal the exact control, and draw attention to it briefly.
Size is a user choice, persisted, defaulting to a bounded card rather than the full window.
*Rationale: a feature that exists but cannot be reached from the palette is a feature most
users will never find.*

</details>

<details open>
<summary><b>9–12 · Changelog, version history, export and bulk, the dim sum surprise</b></summary>

**9. An in-app changelog viewer for every released version.**
Each entry carries its version, release date, categorized changes, and **a link to the commit
that made the change**. An advanced date filter (anchored calendar, month/year jump, range
selection, presets, *and* typed dates parsed in both the locale format and plain ISO, with
inline validation that never discards what the user typed) composes with a regex-capable
search rather than overriding it. Copy the current view; export to a durable text format
honouring the active filter. *Rationale: an entry that says what changed but not where is
unverifiable — and a wrong commit id is worse than none, so validate every referenced commit
exists before shipping and fail the build rather than emit a dead link. The changelog is
brought current in the task that changes behaviour, not at release time.*

**10. Local Git-backed version history for documents, records and settings.**
Snapshots live in an isolated repository beside the application's own data directory —
never a `.git` inside the user's folder — covering not only documents but every user-managed
record the app owns, **settings included**. **Restoring is itself recorded as a new
revision**, so history is append-only and an undo can be undone. The history panel filters by
**date** (the same advanced picker) and by **action**, with the actions derived from the
history itself and a count beside each. *Rationale: a restore that discards the branch it
replaced is the one failure mode that makes a history panel unsafe to open.*

**11. Export everything; bulk actions on every list.**
Anything a surface can show, the user can take away — in every format that can faithfully
represent it (JSON, JSONL, YAML, TOML, XML, CSV, TSV, Markdown, HTML, and the archive
formats with their real options exposed). Say what will be lost *before* an export runs
rather than truncating quietly. Every list, table and grid supports multi-select with
shift-ranges and a keyboard equivalent, a select-all that states whether it means this page
or every match, and the whole set of actions in bulk with an exact count and a reviewable
preview. *Rationale: "you can copy it off the screen" is not an export, and repeating a
single-item action forty times is the app failing to do its job.*

**12. The dim sum surprise.**
A **10% chance at startup** of showing a randomly chosen dim sum dish — its name in English
and Chinese, with a picture, from **bundled local images**. Non-blocking, auto-dismissing,
never gating startup, never stealing focus, never during a first run, an error path, an
update, or any flow where the user is mid-task. Meaningful alt text naming the dish.
**There is no opt-out and no off switch.** *Rationale: the non-blocking rules are exactly what
make an un-optable surprise polite; a fresh draw per launch, never twice in one launch.*

</details>

<details open>
<summary><b>13–16 · Releases, accessibility, bundled assets, task completion</b></summary>

**13. Every release carries a dim sum code name and a line count.**
The code name is a dish from the bundled catalog — English and Traditional Chinese names
together — used **once per project**, recorded so the mapping is auditable, and only ever
drawn from a dish whose bundled image actually exists. It sits *beside* the version number,
never in place of it. The release also reports the project's **line count, produced by a
committed script that CI runs at the released commit** — never typed by hand — broken down
by source, tests and markup, with generated and vendored content separated out and the
exclusions stated, and with human/agent authorship attributed per **surviving** line. The
counter's own arithmetic must agree with itself before the figure is published. *Rationale:
a line count pinned to a tag is a comparable fact; one floating in prose is stale the next
day. It is information, never a boast — do not pad it and do not hide tests to flatter a
ratio.*

> **The machinery is built, and releases have been published carrying the counter's table.**
> `scripts/line-count.mjs` is the counter, and both `.github/workflows/release.yml` and
> `.github/workflows/verify.yml` invoke it.
>
> The two calls differ deliberately. `release.yml` runs the counter **with `--blame` and a
> scoped `--blame-paths`**, so authorship is attributed without blaming the 11,799-file
> vendored tree; if that attribution pass fails it falls back to an unattributed count rather
> than publishing no table at all. `verify.yml` runs it **without attribution on purpose** —
> that workflow is a gate, not a release, and the blame pass is expensive for a figure it
> never publishes.
>
> **Not established here:** whether a given published release body actually rendered the
> Authorship rows. Read the release's notes before claiming a particular one did.
>
> Whatever happens, the count comes from the committed script run by CI at the released
> commit — never from an agent counting by hand.

**14. Accessibility and sizing are completion blockers, not polish.**
Keyboard reachability, visible focus, correct roles/names/states, sufficient contrast,
reduced-motion respect, and screen-reader-sensible structure. **No clipped, truncated,
overlapping or off-screen text or controls** at any supported window size, display scale
(100/125/150/200%), density, or language mode — validate at narrow widths and with the
longest localized strings, which bilingual mode produces. Controls sized to spec with
adequate hit targets. **Anything that looks operable must be operable**: an icon, preview,
mock window, badge or affordance styled like a live control either performs its labelled
action or is plainly labelled a static preview. *Rationale: visual resemblance is never
evidence of working behaviour, and a defect visible in a screenshot joins the task's scope
the moment it is seen.*

**15. All assets bundled locally.**
No CDN scripts, stylesheets, fonts or remote images; no analytics or third-party tracking;
no runtime artwork fetched from a network. This applies to the landing page and the
documentation site exactly as it applies to the application. *Rationale: a local-first tool
that phones out for its typeface is not local-first, and an offline user gets a broken page.*

**16. Every project-changing task ends complete.**
Documentation, roadmap and changelog accurate; work merged to the default branch and pushed;
CI evidence recorded honestly as running, failed, or verified — **never predicted**. Open
issues on every repository the task touches are scanned before finishing and re-scanned at
each natural checkpoint, so an issue filed mid-task is picked up in the same session.
*Rationale: "code written" and "tests started" are proxies; the requested outcome itself is
the only thing that counts as done.*

</details>

---

## Working discipline

- **Read before editing.** Read this file, `MODIFICATIONS.md`, and the feature documentation
  relevant to the change — that documentation lives in [`docs/`](docs/README.md), one file
  per feature under the category that owns it, and the category index says whether the thing
  you came for exists yet. Keep changes scoped and reversible.
- **Update the documentation in the same task.** A change that alters behaviour edits the
  feature file that described the old behaviour, the roadmap item that tracked it, and the
  changelog — not "later". Stale documentation is worse than none, because it is confidently
  wrong and the reader cannot tell.
- **Do not stop at a plan.** Do not voluntarily halt at an audit, a TODO list, a partial
  implementation, a first passing test, or a running CI job, and never ask
  "want me to keep going?" when the remaining work is already inside the authorized task.
  Pause only for a decision that genuinely requires new information or new authority, and
  ask only that focused question.
- **Report evidence, not expectation.** Quote the command, the output, the run link, and the
  verdict that actually landed. Where something is unverified, say it is unverified.
- **Preserve unrelated work.** Never overwrite user content or another contributor's changes;
  never delete a branch, worktree or stash holding uncommitted, unmerged or unpushed work.
- **Prefer the smallest change that is honest.** Especially under `design/`, where every edit
  costs an allowlist entry and a line in the public modifications notice.

---

## Definition of done

A task in this repository is done when **every** box is genuinely true. Not "expected to be
true" — true, and checked.

**Correctness and the verbatim invariant**

- [ ] `sh scripts/verify-port.sh` passes (submodule initialized, line endings LF).
- [ ] Every file changed under `design/` has a matching entry in `MODIFICATIONS.md`, and
      `MODIFICATIONS.md` has no entry for a file that no longer differs.
- [ ] No `node`, `pnpm` or `electron` was run outside CI.

**The standards**

- [ ] Every user-facing surface the task touched satisfies the sixteen standards above, or
      names the rule it cannot satisfy and why, in that surface's documentation.
- [ ] Accessibility and sizing verified at 100/125/150/200% scale, at narrow widths, and in
      bilingual mode — no clipping, keyboard reachable, focus visible.
- [ ] No new CDN, remote font, remote image, or third-party tracker was introduced.

**Documentation**

- [ ] README, categorized feature documentation, roadmap and changelog all describe what is
      true after this change.
- [ ] The changelog entry carries its version, date and a **validated** commit link.
- [ ] Nothing unbuilt, unrun or untested is described as built, run or tested.
- [ ] No private paths, hostnames, addresses, usernames, credentials or infrastructure
      details appear anywhere in the diff.

**Delivery**

- [ ] Commit messages are bilingual, both halves funny, subject lines precise and scannable,
      identifiers exact in both languages.
- [ ] Work is merged into the default branch and pushed; the remote is verified to contain
      the intended commit.
- [ ] The CI run is linked and its **actual** verdict recorded — running, failed, or
      verified. No predicted success.
- [ ] Open issues on every repository the task touched were scanned, and the result recorded
      even when nothing was actionable.
