# Releases

> [!IMPORTANT]
> **2026-08-11 release-shutdown status.** Release-grade proof is pending: the current
> exact-SHA workflows are queued, the latest published release is stale and
> lacks the complete Squirrel feed, and no fresh complete installed-build screenshot matrix
> has been captured. The release workflow is being repaired to publish only
> from a real unsigned installer targeted at the workflow SHA, with line-count,
> timing, hash and post-publication evidence. Do not read historical release
> records as proof for the local candidate `0d6e47c7`.

What every release must carry, what the in-app changelog must show, and how
version history works.

**Status: mixed.** The release machinery — workflow, line counter, code-name
picker and dish catalogue — exists, is committed, and **has published releases**:
`v0.16.1-r7.1` and `v0.16.1-r8.1`, each carrying the installer its own run built,
a portable archive, a checksum and a dim sum code name. The **in-application**
surfaces (changelog viewer, version-history panel, startup surprise) are designed
in the mockup and **not built**.

## Requirement 1 — every release ships a real installer

Every push and every manual dispatch that passes its tests publishes **exactly
one** release:

- **Real, not a draft.** Not a tag alone, not an artifact left inside the run.
- **A unique, monotonic tag.** No prior release is recycled or overwritten.
- **A genuinely built installer attached** — the artifact that run produced, that
  a user could download and install.

A run that publishes nothing because its tests failed is correct. A run that
publishes a release with no installer, or with an installer it did not build, is
not.

See [../build/ci.md](../build/ci.md) for the pipeline this sits at the end of.

### Recovery after partial publication

The release workflow writes a public `release-publication-receipt.json` beside
the staged release files. It binds the source commit, exact tag and application
version to the workflow run and attempt, required asset names, installer and
photo digests and byte count, and the original workflow start time. The receipt
is updated only after the draft-to-published API operation returns, so its
completion time and duration describe the publication step rather than draft
creation.

Before creating a release, the workflow enumerates every release with
authenticated pagination and resolves lightweight and annotated tag targets.
One same-source release with a matching receipt is classified as complete,
draft recovery, or published recovery. A complete record is verified in place.
An owned draft or demonstrably incomplete published record is repaired using
the exact receipt identity and the exact published photo bytes. Multiple
same-source records, a missing or mismatched receipt, or missing publication
timing are ambiguous and are left untouched, so a rerun never creates a second
release or mutates a user-owned record.

The root dependency fetcher validates all four manifest records by exact name,
id, version, source, archive and digest or integrity. Python is exactly
`3.12.10`; a stale user-scoped Python tool root is reported instead of being
silently masked by another interpreter.

The receipt schema also requires positive numeric `runId`, `runAttempt` and
`workflowId`, the exact `.github/workflows/release.yml` path, an allowed
`push` or `workflow_dispatch` event, the repository-owner actor, exact dish and
photo metadata, installer digest, and an object-valued asset inventory. Each
known asset record carries a positive size and SHA-256. The publication receipt
itself is the one intentional exception to self-hashing, with a null size and
digest because hashing it would change its own bytes. Before recovery, the
workflow reads the historical run and verifies its workflow id, path, head SHA,
attempt, actor and time interval, then checks the actual release author against
the documented repository-owner allowlist. The run lookup uses the repository
REST endpoint and its documented fields: `id`, `workflow_id`, `path`,
`head_sha`, `run_attempt`, `event`, `actor.login`, `created_at`,
`run_started_at` and `updated_at`. Only an exact `.github/workflows/release.yml`
path or that path with one documented `@refs/heads/...` or `@refs/tags/...`
suffix is accepted. Extra, substituted or duplicate release assets are
ambiguous and are not mutated.

Release authors are checked against an exact allowlist assembled before draft
creation from the repository owner, `github-actions[bot]`, and the actual
authenticated login returned by `gh api user`. The optional non-secret
repository variable `RELEASE_PUBLISHER_ALLOWLIST` adds comma-separated exact
service logins when configured. Every entry is validated, deduplicated, and
rejected when empty, wildcarded or ambiguous. The actual release
`.author.login` and the receipt `publisherLogin` must agree with this list.
The workflow keeps the `RELEASE_TOKEN || ORG_TOKEN || GITHUB_TOKEN` fallback
chain, but never treats that fallback as permission for an arbitrary release
author. A missing optional variable does not block owner, bot or current-token
routes; a malformed or disallowed selected login blocks before draft creation.

Token mode is selected from non-secret presence booleans with explicit
precedence: `RELEASE_TOKEN` first, `ORG_TOKEN` second, and `GITHUB_TOKEN`
fallback last. In the fallback-only mode the expected publisher is exactly
`github-actions[bot]` and no `/user` request is made. In either user-token mode,
`gh api user` must return one valid exact login before draft creation, and that
login is added to the assembled allowlist. Token values and presence details
are never printed.

Diagnostics emit at most `Publisher authentication selected`. They never print
the selected token mode, token-source presence booleans, or equivalent branch
information. The mode remains shell-local state used only for choosing the
correct identity path.

## Requirement 2 — every release reports the project's line count

**Every release states how many lines of code the project has at that release.**
No exemption for size or kind.

The release is the right home for it because a line count is a fact about a
specific commit. Pinned to the tag it was measured at, it is a datum a reader can
compare across releases; floating in prose, it is stale the day after it is
written.

### The rules that make the number mean something

**Continuous integration does the counting.** The release workflow runs the
repository's committed counter over the tagged commit and writes the resulting
table into the release notes. The count is produced by the same run that built
the artifacts, at exactly the commit being released, so a hand-typed number
cannot drift from the tree.

**The counter is a committed script**, so the workflow is one command and anybody
can reproduce the figure locally. The command is recorded in the release notes.

**Break it down.** A single grand total is the least informative version of this
and the easiest to inflate. Report at minimum the project's own source, its
tests, and its styles and markup separately, with both total and non-blank lines,
plus whatever further split the project actually has.

**State exclusions explicitly.** Vendored and third-party trees, dependency
directories, build output and lockfiles are not the project's code and are
excluded — but the exclusion is stated, not silent. A count that quietly folds in
a vendored library misrepresents the project.

**Separate generated from hand-written** wherever a generated file is large
enough to move the number.

**Report agent-written lines beside human-written ones.** Attribute per
**surviving** line using blame, never by summing added lines from the log —
churn is not authorship, and a line written and later deleted belongs to nobody.
Say which attribution rule was used so the number can be checked. State it
plainly and without spin in either direction.

> [!IMPORTANT]
> **This requirement is not yet met by the committed workflows.**
> `scripts/line-count.mjs` implements attribution, but gates it behind `--blame`,
> and neither `release.yml` nor `verify.yml` passes that flag. As committed, the
> counter emits an Authorship table reading "not computed", so a release
> published today would not carry this split. The gap is recorded in the
> [verification checklist](#verification) and in `ROADMAP.md` §1.1; it is stated
> here rather than left for a reader to discover from an empty table.

**Give a grand total alongside the project total.** The project total holds out
vendored trees and non-project records; the grand total is everything counted,
with the excluded rows visible in the same table. Two clearly-labelled totals let
a reader see both what the project is and what the repository holds.

**Make the counter's arithmetic agree with itself.** If the attribution total and
the line total disagree, the counter is wrong and must be fixed before the figure
is published. An unexplained gap between two numbers in the same table destroys
the credibility of both.

> [!WARNING]
> **This repository's shape makes the exclusion rule unusually important.**
> `design/` is 11,799 files of vendored third-party source. A counter that
> includes it reports a number that is overwhelmingly somebody else's work
> presented as this project's. The project total must exclude `design/` and say
> so; the grand total may include it, as a clearly labelled row.

### Never count by hand

Whenever a count is wanted — for a release, a readme, a report, or because
somebody asked — **run the committed script and read its table.** Do not rebuild
the number with an ad-hoc file listing, a per-extension sweep, or a throwaway
script.

Three reasons. It is **cheaper**: ad-hoc counting produces hundreds of per-file
lines to arrive at a handful of totals. It is **more accurate**: a bucketing
written on the spot silently drops every file matching no rule, and a total that
loses whole directories is exactly the misrepresentation these rules forbid. And
it is **fixable once**: a committed counter can carry a catch-all row, be
reviewed, and be corrected for everyone.

If the script's breakdown is wrong, fix the script and re-run it. The script is
what the release publishes, so the correction belongs there.

The count is information, never a boast. Do not present a larger number as a
virtue, pad it with generated or vendored code, or hide test lines to improve a
ratio.

## Requirement 3 — every release carries a code name

Every build or release carries a dish code name drawn from the public catalogue
at [`Ding-Ding-Projects/dim-sum-photos`](https://github.com/Ding-Ding-Projects/dim-sum-photos),
in English and Traditional Chinese exactly as the catalogue records them. It is a
label **beside** the version, never a replacement — the version number stays the
thing a user and a machine identify a build by.

- **Only pick a dish whose photo is actually published.** A code name whose image
  is missing renders as a broken image, which is worse than no code name.
- **Used once per project.** Pick the next unused dish, record which release took
  which dish so the mapping is auditable, and never silently reuse one — a
  repeated code name makes two builds indistinguishable in conversation, which is
  the one job a code name has.
- Show the code name and its public catalogue image where the release is
  presented: the release notes, the changelog viewer entry, the landing page
  and the about surface. The workflow downloads the exact published public
  asset only into run-scoped staging, validates its bytes and decode, and
  attaches it to the release. It never adds a copy to the source repository or
  fetches from a third-party origin.
- The dish's names stay factual at every tone level and in every language mode.
  Alt text names the dish so the code name reaches screen-reader users.
- **It is decoration with a purpose, not a gate.** A release is never blocked,
  delayed or renamed because the catalogue is unavailable. If no unused dish can
  be resolved, ship with the version alone and say so.

### The related startup surprise

Every user-facing application has a **10% chance at startup** of showing a
randomly chosen dish — its name in both languages plus a bundled image. It is a
small delight, not a feature the user manages.

Non-blocking, auto-dismissing, never gating startup, never stealing focus, never
delaying the application becoming usable. It must not appear during a first run,
an error path, an update, or any flow where the user is mid-task. Images are
bundled local assets with meaningful alt text naming the dish, so screen-reader
users get the same delight, and it respects reduced-motion and quiet settings.

**It cannot be opted out of.** No setting disables it; any existing off switch is
removed, with stored preferences migrated forward. The probability comes from a
fresh draw per launch — never more frequent than stated, and never twice in one
launch. The non-blocking rules above are what make an un-optable surprise polite.

> [!WARNING]
> **The mockup shows this with an on/off switch**, which the standard forbids.
> The switch must not be carried into the implementation.

## Requirement 4 — the in-app changelog viewer

An in-app changelog viewer covering **every** released version, not just the
newest, reachable from a discoverable place. A link to release notes on a website
does not satisfy this.

Each entry carries its version, release date, categorized changes, and **a link
to the commit that made the change**. An entry that says what changed but not
where is unverifiable. Carry the full hash, render it as a short clickable
reference, and resolve it against the project's own forge. Where one entry
summarizes several commits, link the commit that completed the change and say it
is a summary.

**A wrong hash is worse than none**, because it sends the reader somewhere
confidently irrelevant. Validate that every referenced commit exists before the
changelog ships, and fail the build rather than emit a dead link.

Also required:

- **A date filter** with an advanced calendar — month and year jump, range
  selection, presets — that also accepts **typed dates**, parsing both the
  locale's format and a plain ISO date. Invalid or partial input is reported
  inline **without discarding what the user typed**.
- **A search over changelog text** wired to the pattern builder: plain text the
  default, regex an explicit opt-in, with bidirectional synchronisation. Search
  and date filter **compose** rather than override one another, and the empty
  result is an honest no-match message.
- **Export and copy**: copy the current selection or filtered view, and export to
  at least one durable text format, honouring the active filter and search so the
  export matches what the user sees. State the exported range in the file. Export
  formats keep the hash in text form so a copied changelog stays traceable.
- The language modes and both tone sliders apply, styling every entry including
  security fixes and breaking changes — with versions, dates and what actually
  changed staying exact.

**Content is factual.** Never invent entries, dates or fixes to fill gaps; a
version with no recorded changes says so.

**The changelog is brought current in every project-changing task**, not at
release time. A task that ships user-visible behaviour and leaves the newest
entry weeks behind has produced a viewer that documents the past and misleads
about the present.

## Requirement 5 — local version history

Every application that owns user documents or projects provides a local,
Git-backed version history: complete per-document snapshots in an isolated
repository kept beside the application's own data directory — **never a
repository inside the user's own folder**. A history panel browses, diffs,
restores and labels revisions. It stays local unless the user explicitly opts in,
with retention, pruning and export controls.

**Not only documents.** Every user-managed record the application owns —
accounts, connected services, generators, rules, and **settings** — so any
creation, edit or deletion can be undone. Settings belong in the same snapshot as
the records they configure: restoring an account without the configuration it ran
under is a subtly wrong state, worse than offering no undo at all.

**Restoring is itself a new revision, never a rewrite.** History is append-only,
so an undo can be undone, and that undo undone in turn. A destructive restore
that discards the branch it replaced is the one failure mode that makes a history
panel unsafe to use, because the user cannot experiment without risking the state
they started from.

**Snapshots preserve whatever encryption the live data uses** — ciphertext stays
ciphertext, so the history is never more sensitive than the store it mirrors.
**Bind any authenticated-encryption associated data to a stable identifier that
survives delete and restore**, not to an autoincrement row number: a restored row
receives a fresh number, the binding stops matching, and the data becomes
permanently undecryptable while failing in a way that looks exactly like
corruption.

**The panel is filterable**, because a history nobody can search is an archive
nobody opens. At minimum a **date picker** — the same advanced control the
changelog requires — and a **filter by action**, where the actions are derived
from the history itself (created, updated, deleted, restored, undone, imported,
settings changed) rather than a hard-coded list that drifts from what is
recorded. Show the count beside each action so an empty one is visibly empty,
allow several at once, and compose the action filter with the date range and the
text search. The panel's own search carries the full pattern builder.

**Label each revision with what changed**, not that something did — "Deleted the
account", not "Updated". An unchanged state records nothing, so the panel stays a
list of real events. A history write that fails must never fail the operation the
user actually asked for; log it and carry on.

## Current implementation status

| Requirement | Status |
| --- | --- |
| Release workflow | **Implemented and run** at `.github/workflows/release.yml`. Builds, validates the payload, smoke-tests and publishes. A *failing* run has not been observed. |
| Unique monotonic tag | **Implemented** as `v<version>-r<run number>`, so no tag can be recycled. |
| Installer attached | **Implemented** — the installer, a `.sha256` file and a portable archive are staged and attached, with an explicit existence check that fails the build if the packer reports a path that is not there. |
| Any release at all | **Two published** — `v0.16.1-r7.1` and `v0.16.1-r8.1`, each by the run that built its installer, each named after a different dish. |
| Line-counting script | **Exists** at `scripts/line-count.mjs`. Discovers files via `git ls-files`, forces every file into exactly one row with a mandatory catch-all, self-checks that rows sum to the tracked-file count, reports excluded paths as visible rows, separates the imported tree into its own scope, and attributes per surviving line with blame behind `--blame`. It fails loudly if the attribution total and the line total disagree. |
| Line count in release notes | **Implemented** in both workflows, with an honest fallback line when the counter fails. |
| Release code name | **Implemented** at `scripts/release-codename.sh`, and **fixed after a real failure**: it read from the 24 bundled dishes, spent them all inside one day of per-push releases, and every build afterwards shipped nameless without failing anything. It now resolves from the public catalogue, reads spent dishes from prior release bodies rather than a counter, picks only dishes whose photo is actually published, and exits `0` with an empty id if nothing can be resolved so a release is never blocked. |
| Code-name pool | **2,866 dishes** in the public catalogue, with 2,928 published photo assets across its `catalog-v1*` releases. The 24 dishes at `assets/dim-sum/index.json` remain as the attached photo and as the offline fallback; see [code-names.md](../release/code-names.md) for why both exist. |
| Startup surprise | **Not started.** Designed in the mockup **with a forbidden off switch**. |
| Changelog viewer | **Designed, not built.** The design meets the requirement on paper, commit links included. |
| Version history | **Designed, not built.** Settings only; documents and records are not covered by the design. |

> [!NOTE]
> The counter's design already answers this repository's hardest counting
> problem: `design/` is 11,799 files of vendored source, and the script reports
> it as a separate labelled scope rather than folding it into the project total.
> That is the exclusion rule above, implemented rather than merely intended.

### How the catalogue is produced

`scripts/import-dim-sum.sh` is the only thing that writes `assets/dim-sum/`. It
matters because the code-name rule forbids ever picking a dish whose image is
missing: a code name that renders as a broken image is worse than no code name,
so the catalogue's integrity is a release-pipeline concern, not housekeeping.

```sh
scripts/import-dim-sum.sh <catalog-dir> [count]     # count defaults to 24
```

**What it reads.** A source catalogue directory containing `index.json` (the dish
records — id, slug, English and Traditional Chinese names, jyutping, category and
bilingual alt text) and `image-manifest.json` (the images that exist and have
been verified, each with a path and a sha256). The directory is **passed in as an
argument rather than hardcoded**, so the script carries no knowledge of where
anyone keeps their copy.

**What it does.**

- Treats the **image manifest, not the dish index, as the eligibility list** —
  only a dish with a verified image can be picked at all.
- Spreads the selection **across categories** rather than taking the first *N*,
  which would produce two dozen near-identical steamed dumplings.
- For each pick: confirms the file exists, recomputes its sha256 and compares it
  to the manifest, then copies it **byte-for-byte**. A missing file or a hash
  mismatch **skips that dish and reports it** rather than shipping it.
- Writes `assets/dim-sum/index.json` with each dish's id, slug, both names,
  jyutping, category, image path, byte size, sha256, and English and Cantonese
  alt text — the alt text taken from the source catalogue, which already carries
  both.
- Prints copied, skipped and the resulting size, and exits non-zero if nothing
  could be verified and copied.

**Images are copied, never created.** Nothing here generates, downloads, resizes
or re-encodes an image, and nothing is fetched at release time — the catalogue is
bundled, and both the release code name and the startup surprise read it from
disk. That is what the alt-text and bundled-assets rules require, and it is also
why the sha256 check is not decorative: a copied file that does not match the
manifest is not the verified image, whatever its filename says.

**Extending it** means re-running it against the source catalogue with a larger
count. Dishes already present keep their filenames, so the index is rewritten
rather than appended to; check the diff before committing, and never hand-edit
`index.json` to add a dish whose image is not in `assets/dim-sum/images/`.

**Verification.** The index and the image directory must agree:

```sh
jq '.dishes | length' assets/dim-sum/index.json     # 24
ls assets/dim-sum/images | wc -l                    # 24
```

Both were **24** when this page was written. `scripts/release-codename.sh`
independently skips any dish whose indexed image is absent, so a drift between
the two degrades a release to "no code name" rather than to a broken image — but
it is still a defect, and the two counts are the way to catch it.

<details>
<summary><b>What the mockup specifies for the changelog viewer</b> — and why it meets the standard on paper</summary>

A copy-view action and a Markdown export. A search bar with a regex opt-in and a
builder affordance. A date picker rendered as an anchored calendar, 320px wide,
height-bounded with internal scrolling, offering month navigation, a year jump, a
seven-column grid with range highlighting, presets for all time and the last 7,
30 and 90 days, and a typed-date field validating both ISO and slash-separated
formats with an inline "incomplete date — keep typing" hint that does not discard
input.

A summary line stating how many entries of how many match, and noting explicitly
that search and date filter **compose**. Four entries, each with a version, a
date, and a short commit hash rendered as a link. An honest empty state: "No
changelog entries match this search and date range."

Every element the standard names is present. The gap is that none of it is code.

</details>

<details>
<summary><b>What the mockup specifies for version history</b> — and the gap</summary>

A settings panel stating that every tabs-and-settings change auto-commits to a
per-account settings repository, with undo and redo actions and five commits each
showing a short hash, a message, a time and a **Restore** action. The tab strip
surfaces the current settings-repository hash in a monospace chip, and a
notification confirms each commit with an undo action.

**The gap**: the design covers **settings only**. The standard requires the same
treatment for documents, projects, accounts, connected services, generators and
rules. It also does not show the required filters — no date picker, no
filter-by-action with counts, no search — although the changelog panel beside it
specifies exactly the date control that this panel needs.

</details>

## Failure modes

| Failure | Consequence |
| --- | --- |
| A release with no installer attached | Looks complete and is not. Worse than no release. |
| An installer from a different run attached | The tested artifact and the shipped artifact are different things. |
| A recycled or overwritten tag | Two builds become indistinguishable. |
| A line count typed by hand | Drifts from the tree immediately and cannot be checked. |
| A count including the vendored tree in the project total | Reports 11,799 files of somebody else's work as this project's. |
| Attribution by summing added lines | Counts churn as authorship; deleted lines credited to their author forever. |
| A counter whose two totals disagree | Destroys the credibility of both numbers. |
| A code name with no bundled image | Renders as a broken image in the release notes. |
| A reused code name | Two builds indistinguishable in conversation — the one job it has. |
| A release blocked because no code name resolved | It is decoration, not a gate. Ship with the version and say so. |
| The startup surprise given an off switch | Explicitly forbidden. |
| The surprise appearing during first run, an update or an error path | It must never interrupt. |
| A changelog entry with a wrong commit hash | Sends the reader somewhere confidently irrelevant. Validate before shipping. |
| A changelog entry invented to fill a gap | The viewer becomes unreliable in a way nobody can detect from inside it. |
| Search and date filter overriding each other | The user cannot narrow twice; the result contradicts both controls. |
| A restore that discards what it replaced | Makes the history panel unsafe to use at all. |
| Encryption associated data bound to a row number | Restored data becomes permanently undecryptable, failing exactly like corruption. |
| A version-history repository created inside the user's own folder | Collides with the user's own version control. |
| A failed history write failing the user's operation | The user loses the action they asked for to a feature meant to protect them. |

## Security considerations

- **A history mirrors a store and must not be less protected than it.**
  Ciphertext stays ciphertext. A snapshot that decrypts on the way in creates a
  plaintext copy of everything the store was protecting.
- **The identifier-binding trap is a data-loss bug wearing a cryptography
  costume.** Binding authenticated-encryption associated data to an autoincrement
  row number means a restored row cannot be decrypted, and the failure is
  indistinguishable from corruption. Bind to an identifier that survives delete
  and restore.
- **History is local by default.** Never sync or push it without an explicit
  opt-in. It is a complete record of everything the user ever had, including
  things they deleted deliberately.
- **Release notes are public.** The line-count table, the commit hashes, the code
  name and the provenance line are all fine; a path from a build machine, a token
  in a log excerpt, or an internal host name is not.
- **Never fabricate release evidence.** Continuous-integration state is recorded
  as running, failed or verified — never predicted. A release that claims a green
  run before the run finished is a false statement about the one thing a reader
  cannot check without leaving the page.

## Verification

**The machinery exists and has published releases.** Boxes ticked below are
verified either from the tree or from a published release, and each says which.

**Release**

- [x] a workflow at the repository root, triggered by push and by manual dispatch
- [x] a tag scheme that cannot recycle — `v<version>-r<run number>`
- [x] an explicit check that the reported installer path exists, failing the
      build otherwise
- [x] the provenance line carrying the upstream project, version, pinned commit,
      licence and non-affiliation statement
- [x] a passing run publishing exactly one non-draft release under a fresh tag —
      **observed**: `v0.16.1-r7.1` and `v0.16.1-r8.1`, distinct tags, neither
      recycled
- [x] the installer attached and installing — **observed**: each release carries a
      setup executable, a portable archive and a checksum, and the packaged smoke
      test installed, launched, health-checked and uninstalled that build
- [ ] a failing run publishing nothing — not demonstrated. No release-job failure
      has been observed reaching the publish step, so this remains asserted from
      the workflow's structure rather than from a run

**Line count**

- [x] a committed counter script printing the exact table the release publishes
- [x] both workflows invoking it — `release.yml` into the release notes,
      `verify.yml` into the job summary
- [x] the imported tree reported as its own scope, not folded into the project
      total
- [x] excluded paths printed as visible rows rather than silently dropped
- [x] a catch-all row plus a self-check that rows sum to the tracked-file count
- [x] attribution by surviving line via blame, not by summing added lines —
      **implemented in the script, behind `--blame`**
- [x] **attribution enabled in the release workflow.** `release.yml` invokes the
      counter with `--blame` and a scoped `--blame-paths`, so it does not spawn a
      blame per file across the 11,799-file imported tree, and falls back to an
      unattributed count if the attribution pass fails rather than publishing no
      table at all. `verify.yml` deliberately runs without attribution: it is a
      gate, not a release, and never publishes the figure
- [x] the script failing loudly when the attribution total and the line total
      disagree
- [ ] the table observed in a published release's notes — **not checked here.**
      Read a release's notes before claiming a particular one carried it

**Code name and surprise**

- [x] a bundled catalogue with local images — 24 indexed, 24 present
- [x] the picker skipping any dish whose image is indexed but absent
- [x] spent dishes read from prior release bodies, so a re-run cannot repeat one
- [x] an empty result shipping the release without a code name rather than
      blocking it
- [ ] two releases observed picking different dishes
- [ ] the surprise firing at the stated probability from a fresh draw per launch,
      never twice in one launch — verified statistically over many launches
- [ ] **no off switch anywhere**, and any stored preference migrated forward
- [ ] never appearing during first run, update or error paths
- [ ] alt text naming the dish

**Changelog viewer**

- [ ] every released version present
- [ ] every entry carrying a version, a date and a commit link
- [ ] **every referenced commit proven to exist**, with the build failing on a
      dead link
- [ ] the date filter accepting calendar and typed input, reporting partial input
      inline without discarding it
- [ ] search and date filter composing, with an honest empty state
- [ ] copy and export honouring the active filter, stating the range, keeping
      hashes in text
- [ ] all three language modes at every tone level, with versions, dates and
      changes exact

**Version history**

- [ ] documents, records **and** settings all snapshotted
- [ ] the repository beside the application's data directory, never inside the
      user's folder
- [ ] restore recorded as a new revision — proven by restoring, then undoing the
      restore, then undoing that
- [ ] ciphertext preserved
- [ ] associated data bound to a stable identifier — proven by deleting and
      restoring a record and decrypting it afterwards
- [ ] the date filter, the action filter with counts, and the search all present
      and composing
- [ ] revision labels naming what changed
- [ ] a failed history write leaving the user's operation successful

The delete-restore-decrypt test and the restore-undo-undo test are the two that
must be written first. Both guard failures that are silent, permanent, and
discovered only by the user who needed the feature to work.

## Suggested reading

- [../build/ci.md](../build/ci.md) — the pipeline that publishes all of this
- [notifications.md](notifications.md) — the gate a destructive restore or prune needs
- [regex-builder.md](regex-builder.md) — the search the changelog and history panels carry
- [language-modes.md](language-modes.md) — tone applied to changelog entries without altering facts
- [export-and-bulk-actions.md](export-and-bulk-actions.md) — the export rules the changelog's own export and the history panel's pruning follow
