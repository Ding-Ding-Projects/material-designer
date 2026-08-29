# The in-app changelog viewer

**Standard 9.** Every released version is readable from inside the application,
with each entry carrying its date, its categorized changes and a link to the
commit that made them — filterable by date, searchable, and exportable.

**Status: source implemented, not yet audited in a running interface.** `scripts/generate-changelog.mjs` reads `CHANGELOG.md` and
`design/docs/CHANGELOG/v*/en.md` at build time, resolves every commit those
sources reference against git — full object id, author date, and the link the
source itself wrote — and emits
`design/apps/web/src/lib/changelog/generated.ts`. An abbreviation this repository
does not contain is recorded as unresolved and never rendered as a link; the
entry says so instead, as does an entry whose source names no commit at all.
`design/apps/web/src/lib/changelog/parse.ts` is the single parser, used by both
the app and its tests. The viewer is
`design/apps/web/src/components/changelog/ChangelogDialog.tsx`, opened from
Settings → About (directly under the version) and from the help menu.

Two facts the sources force, and the viewer states rather than papers over: **no
source records a release date**, so a release is dated by the newest change in it
and labelled as that, not as a publication date; and **an entry with no commit
has no date**, so a date range excludes it and the viewer reports how many it
excluded. `changelog-parse.test.ts` and `changelog-filter.test.ts` cover the
parser, the commit resolution, the filter composition, the typed-date handling
and the export. **Nobody has yet opened the viewer in a running build**, so its
layout, keyboard path and calendar behaviour are unverified by eye. The
The documentation site does not implement it. The viewer exposes reusable
`ChangelogMountProps` plus the `C0`, `C2`, `C7`, and `C12` mount ids for
integration. Its date control includes named presets for all time and the last
7, 30, and 90 days, anchored to the newest dated entry so a historical build
never invents a future result. Host integrations can supply translated preset
labels.

## The requirement

### Coverage

**Every released version, not just the newest**, reachable from a discoverable
place in the application — a help or about surface, or the equivalent.

**A link to release notes on a website does not satisfy this.** A local-first
product that has to open a browser to tell the user what changed has outsourced
the one piece of information a user is most likely to want offline, immediately
after an update.

### What an entry carries

| Field | Requirement |
| --- | --- |
| Version | Exact, and identifying — never only a code name. |
| Release date | Exact. |
| Categorized changes | Grouped, so a reader scanning for breaking changes is not reading feature copy. |
| **A link to the commit that made the change** | The full hash, rendered as a short clickable reference, resolved against the project's own forge. |

**An entry that says what changed but not where is unverifiable.** A reader who
doubts it, or who needs the surrounding context, has no route from the sentence
to the code. Where one entry summarizes several commits, link the commit that
completed the change and say plainly that it is a summary.

> [!IMPORTANT]
> **A wrong hash is worse than none**, because it sends the reader somewhere
> confidently irrelevant — and it looks exactly like a correct one. Validate that
> every referenced commit exists in the repository before the changelog ships,
> and **fail the build rather than emit a dead link.** An entry whose commit
> genuinely cannot be identified says so, instead of guessing at a neighbour.

### Filtering and search

**A date filter** with an advanced calendar picker — month and year jump, range
selection, named presets — that **also accepts typed dates**, parsing both the
locale's format and a plain ISO date. Invalid or partial input is reported inline
**without discarding what the user typed**.

**A search over changelog text** wired to the pattern builder: plain text stays
the default, regex is an explicit opt-in, and query, pattern, flags, validation
and mode synchronise bidirectionally. See [regex-builder.md](regex-builder.md).

**The two compose.** Neither overrides the other, and the empty result is an
honest no-match message naming what was filtered out — not a blank panel that
reads as a loading failure.

### Export and copy

Copy the current selection or filtered view to the clipboard, and export to at
least one durable text format, **honouring the active filter and search so the
export matches what the user sees**. State the exported range in the file. Export
formats keep the hash in text form, so a copied changelog stays traceable after
it leaves the application.

### Language and tone

The three language modes and both tone sliders apply, styling **every** entry
including security fixes and breaking changes. Version numbers, dates and what
actually changed stay exact and unambiguous however playfully they are narrated —
the voice-not-facts rule, see [language-modes.md](language-modes.md).

### Content is factual, and current

**Never invent entries, dates or fixes to fill gaps.** A version with no recorded
changes says so. A fabricated entry makes the viewer unreliable in a way nobody
can detect from inside it, which is worse than a gap the reader can see.

**The changelog is brought current in every project-changing task**, not at
release time. A task that ships user-visible behaviour and leaves the newest
entry weeks behind has produced a viewer that documents the past and misleads
about the present. Where a changelog has fallen behind, catching it up is part of
the next task, worked out from the real commit history rather than from memory.

## Why the commit link is the load-bearing part

Everything else in this standard is convenience. The commit link is what makes
the changelog a *record* rather than marketing copy.

Three things follow from it:

- **It is checkable.** A user who reads "fixed the updater" and does not believe
  it can go and look. A changelog nobody can check accumulates optimistic
  phrasing until it means nothing.
- **It is a debugging tool.** The most common real use of a changelog is "this
  broke between two versions" — and the useful answer is not a sentence, it is a
  diff.
- **It disciplines the writing.** An entry that must name a commit cannot be
  vague about what it covers. "Various improvements" has no commit.

The validation rule follows from the same reasoning. A dead link fails silently
at exactly the moment someone is relying on the changelog for something serious,
so it is checked at build time, where the failure is cheap.

## Current implementation status

| Requirement | Status |
| --- | --- |
| The viewer | **Source implemented** in `ChangelogDialog.tsx`; host integration still owns the mount. |
| A source changelog to render | **Exists** at `CHANGELOG.md`, with commit-linked entries. |
| Released versions to cover | **They now exist.** Releases have been published, so "every released version" is no longer an empty set — the viewer would have content on its first run. |
| Commit link per entry | **Present in the source changelog**; no build-time existence check yet. |
| Date filter with an advanced calendar | **Source implemented** with month/year jump, range selection, and named presets. |
| Typed dates parsed inline without discarding input | **Source implemented**; partial and impossible values remain in the field. |
| Search wired to the pattern builder | **Source implemented** with one local controller and anchored builder. |
| Search and date filter composing | **Source implemented** by `filterChangelog`. |
| Export and copy honouring the filter | **Source implemented** for Markdown and plain text. |
| Language modes and tone levels | **Not started.** |
| On the documentation site | **Not present.** |

<details>
<summary><b>What the mockup specifies</b> — and why it meets the standard on paper</summary>

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

The height-bounded, internally scrolling calendar is worth keeping deliberately —
it is the overlay rule from [overlays.md](overlays.md) applied correctly, and a
calendar is the surface where getting it wrong silently deletes the last week of
a month.

</details>

## Configuration

| Setting | Default | Effect |
| --- | --- | --- |
| Date range | All time | A preset, not an empty state — the viewer opens showing everything rather than nothing. |
| Search mode | Plain text | Regex is an explicit opt-in, as on every search surface. |
| Export format | Markdown | Any durable text format satisfies the standard; the export states its range and keeps hashes in text. |
| Forge base | The repository the build came from | Commit links must resolve against the project's own forge, not a hard-coded one — a fork's changelog must link the fork's commits. |

## Failure modes

| Failure | Consequence |
| --- | --- |
| A link to a website instead of an in-app viewer | Does not satisfy the standard, and fails exactly when the user is offline after an update. |
| Only the newest version shown | The most common question — "what changed between the version I had and this one" — is unanswerable. |
| A wrong commit hash | Sends the reader somewhere confidently irrelevant. Validate before shipping. |
| No build-time existence check | Dead links appear only when someone clicks one, which is when they were relying on it. |
| An entry invented to fill a gap | The viewer becomes unreliable in a way nobody can detect from inside it. |
| Search and date filter overriding each other | The user cannot narrow twice, and the result contradicts both controls. |
| Typed date input discarded on a partial entry | The user loses their keystrokes mid-typing, every time. |
| A blank panel for no matches | Indistinguishable from a failure to load. |
| An export that ignores the active filter | The file does not match what the user was looking at when they exported it. |
| An export that drops the hashes | A copied changelog stops being traceable the moment it leaves the application. |
| A calendar overlay capped in height with overflow hidden | The last week of the month is deleted with no scrollbar to say so. |
| A changelog weeks behind the build | Documents the past and misleads about the present. |
| Tone level 5 obscuring a breaking change | Facts survive every tone level. |

## Security considerations

- **Changelog text is rendered, and it comes from a file.** Treat it as content,
  not markup: render it through the project's own renderer with the same
  sandboxing every other provider-authored text gets, and never with the
  application's privileges.
- **Commit links leave the application.** They open an external browser to a
  forge URL. Build the URL from a validated base and a validated hash; never
  interpolate an unvalidated string into a URL that is then opened.
- **Do not put anything private in a changelog.** It ships inside the
  application, it is exported by users, and it is quoted in bug reports. No
  internal host names, no paths from a build machine, no ticket systems that are
  not public.
- **An export crosses a trust boundary.** The exported file is plain text on
  disk. That is fine for a changelog and worth stating, because the same export
  machinery is shared with surfaces where it is not — see
  [export-and-bulk-actions.md](export-and-bulk-actions.md).

## Verification

**Nothing has been verified.** The application builds, installs, launches and
passes an automated health check, and its unit suites pass — but the viewer does
not exist, so none of the behaviour below has been observed.

Conformance requires all of:

- [ ] every released version present, checked against the published release list
      rather than against the source file
- [ ] every entry carrying a version, a date, categorized changes and a commit
      link
- [ ] **every referenced commit proven to exist**, with the build failing on a
      dead link — proven by introducing a bad hash and watching the build fail
- [ ] commit links resolving against the repository the build actually came from
- [ ] the date filter accepting calendar input and typed input in both the
      locale's format and ISO, reporting partial input inline **without
      discarding it**
- [ ] the calendar overlay painting its own surface and scrolling within the
      viewport at the narrowest supported width
- [ ] search and date filter composing, with an honest empty state naming what
      was filtered
- [ ] copy and export honouring the active filter, stating the range, and keeping
      hashes in text form
- [ ] all three language modes at tone levels 1 and 5, with versions, dates and
      the substance of each change exact in every combination
- [ ] the newest entry matching the build it shipped in — checked at release
      time, not assumed

The dead-link test is the one to write first: it is cheap, it runs in the build,
and it guards the only claim in this feature that a reader cannot check for
themselves without leaving the application.

## Suggested reading

- [releases.md](releases.md) — where releases and their notes come from, and the code name each entry carries
- [version-history.md](version-history.md) — the panel that reuses this feature's date control
- [regex-builder.md](regex-builder.md) — the search this viewer carries
- [overlays.md](overlays.md) — the calendar's surface, bounding and scrolling rules
- [export-and-bulk-actions.md](export-and-bulk-actions.md) — the export rules the copy and export actions follow
- [language-modes.md](language-modes.md) — tone applied to entries without altering facts
- `ROADMAP.md` §3.5 — the tracked work item
