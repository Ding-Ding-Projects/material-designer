# Local version history

**Standard 10.** Everything the user owns is snapshotted into a local, Git-backed
history kept beside the application's own data — documents, records, and the
settings that configure them — so any creation, edit or deletion can be undone,
and any undo can itself be undone.

**Status: source-mounted, hosted runtime proof pending.** The web panel now
provides local date, action, domain and text filters, derived action counts,
append-only restore controls, retention preview, redacted exports, and filtered
bulk selection. The daemon-owned persistence and local history repository remain
outside this lane. Packaged interaction is unverified here.

The web consumer now redacts labels, detail lines and sensitive change paths
before rendering or exporting them. Its restore action accepts a changed result
only when the response includes a new restore revision pointing back to the
requested target; unchanged results are accepted only with no recorded revision.
The focused mounted history test also proves that a failed load-all page leaves
the previous selection intact and keeps every-match selection disabled with the
reported reason.

## The requirement

### What is snapshotted

**Every user-managed record the application owns**, not only documents:
accounts, connected services, generators, rules, and **settings**.

Settings belong in the same snapshot as the records they configure. Restoring an
account without the configuration it ran under produces a subtly wrong state, and
a subtly wrong state restored from a history panel is worse than offering no undo
at all — the user believes they are back where they started.

### Where it lives

Complete per-document snapshots in an **isolated repository kept beside the
application's own data directory** — never a repository inside the user's own
folder. A history repository placed in a project folder collides with the user's
own version control, appears in their diffs, and follows their work into their
own commits.

It stays local. No sync, no push, no remote of any kind unless the user
explicitly opts in — a version history is a complete record of everything the
user ever had, **including the things they deleted on purpose**.

### History is append-only

**Restoring is itself a new revision, never a rewrite.** An undo can be undone,
and that undo undone in turn.

A destructive restore that discards the branch it replaced is the single failure
mode that makes a history panel unsafe to use, because the user cannot experiment
without risking the state they started from — and a history panel nobody dares
experiment in is a history panel nobody opens.

**Discarding unsaved work is itself recorded**, as an ordinary history action
(for example, `document discarded`), written *before* the close completes. That
is the one moment where the user's work is about to disappear with no other
record of it, so it is exactly the moment that must be auditable.

### Encryption survives the round trip

Snapshots preserve whatever encryption the live data uses. **Ciphertext stays
ciphertext**, so the history is never less protected than the store it mirrors. A
snapshot that decrypts on the way in creates a plaintext copy of everything the
store was protecting, in a directory nobody thinks of as sensitive.

> [!WARNING]
> **Bind any authenticated-encryption associated data to an identifier that
> survives delete and restore** — never to an autoincrement row number. A restored
> row receives a fresh number, the binding stops matching, and the record becomes
> permanently undecryptable while failing in a way that looks exactly like
> corruption. It is a data-loss bug wearing a cryptography costume, and it is
> discovered by the one user who needed the restore to work.

### The panel is filterable

A history nobody can search is an archive nobody opens. At minimum:

- **A date picker** — the same advanced control the changelog viewer requires:
  an anchored calendar with month and year jump, range selection and named
  presets, accepting typed dates in the locale's format and plain ISO alongside
  it, reporting invalid or partial input inline **without discarding what the
  user typed**. See [changelog-viewer.md](changelog-viewer.md).
- **A filter by action**, where the actions are **derived from the history
  itself** — created, updated, deleted, restored, undone, imported, settings
  changed — not a hard-coded list that drifts from what the application actually
  records. Show the count beside each action so an empty one is visibly empty
  rather than mysteriously absent, and allow more than one at once.
- **A text search** carrying the full pattern builder, like every other search
  surface.

All three **compose**. None of them overrides another.

### Labels say what changed

Label each revision with **what** changed, not that something did — "Deleted the
connected account", not "Updated". An unchanged state records nothing, so the
panel stays a list of real events rather than a list of times the application
noticed something.

**A history write that fails must never fail the operation the user asked for.**
Log it and carry on. The feature exists to protect work; it must not become a way
to lose it.

### Retention, pruning, export

Retention and pruning controls, and an export path. Pruning is destructive and
passes the gate in [super-confirmation.md](super-confirmation.md); export follows
the rules in [export-and-bulk-actions.md](export-and-bulk-actions.md).

## Why Git, specifically

Git is not a decoration here. Three properties do real work:

- **Content addressing** means identical content is stored once, so a history of
  a thousand small edits to a large document does not cost a thousand copies.
- **A commit graph is inherently append-only.** Recording a restore as a new
  commit whose parent is the current tip is the natural operation, and rewriting
  is the awkward one — which is the correct way round for a safety feature.
- **The format is inspectable by something other than this application.** If the
  product is uninstalled, corrupted, or abandoned, the user's history is still a
  repository that standard tools can read. A bespoke snapshot format is a
  hostage-taking, however well-intentioned.

## Current implementation status

| Requirement | Status |
| --- | --- |
| Per-document versions | **Partial upstream.** The vendored contract layer defines a project-file version with an id, a file name, a label, a creation time, a size, and a `source` of `ai`, `manual` or `restore`. |
| Restore recorded as a new revision | **Source-mounted.** The panel routes restore to the append-only service and keeps the original revision available. |
| Content lineage preserved | **Partial upstream.** Versions carry a bounded `origin` recording where the content lineage began, explicitly separate from how the version was created — and the contract states that prompts, file paths, account data and credentials must never be stored in it. |
| Git-backed storage | **Not started.** No Git library is a dependency of the vendored workspace. |
| Isolated repository beside the application's data | **Not started.** |
| Records and accounts snapshotted | **Not started.** |
| Settings snapshotted with the records they configure | **Not started.** Designed in the mockup for settings alone, which is the mirror image of the gap: the mockup covers settings and not documents, the product covers documents and not settings. |
| Discard recorded before the close completes | **Not started.** |
| Ciphertext preserved | **Not applicable yet** — there is no snapshot store to preserve it in. |
| Associated data bound to a stable identifier | **Unverified.** This must be checked when the store is built; the trap is silent until a restore is attempted. |
| Date filter, action filter with counts, composing search | **Source-mounted.** The panel composes all filters and derives action facets from loaded revisions. |
| Retention, pruning, export controls | **Source-mounted.** Retention preview, prune route and Markdown/text/JSON exports are present; packaged proof remains open. |

### Preservation reconciliation

| Behaviour | Accepted source side | Integration boundary |
| --- | --- | --- |
| Filtered history bulk selection and export | `origin/preservation/tabs-history-20260828` | Web panel only; daemon persistence remains outside this lane |
| Request timeout and abort cleanup | `origin/preservation/tabs-history-20260828`, with focused deadline tests | Hosted daemon and packaged timing remain open |
| Redacted summaries and append-only restore consumer proof | Local lane repair over the preserved panel | Sensitive domain metadata still comes from the daemon contract |

> [!IMPORTANT]
> The upstream rows above are read from the vendored **contract types** at
> `design/packages/contracts/src/api/files.ts` — the shapes the daemon and the
> interface agree on. The storage implementation, the panel that renders it, and
> whether a restore behaves at runtime the way the type says it does have **not**
> been exercised in this repository. Read them as "the design intends this", not
> as "this was observed working".

<details>
<summary><b>What the mockup specifies</b> — and the two-sided gap between it and the product</summary>

A settings panel stating that every tabs-and-settings change auto-commits to a
per-account settings repository, with undo and redo actions and five commits each
showing a short hash, a message, a time and a **Restore** action. The tab strip
surfaces the current settings-repository hash in a monospace chip, and a
notification confirms each commit with an undo action.

**The gap runs both ways.** The mockup covers settings and not documents; the
vendored product covers project files and not settings. Neither covers accounts,
connected services, generators or rules. Neither shows the required filters — no
date picker, no filter-by-action with counts, no search — although the changelog
panel beside it in the mockup specifies exactly the date control this panel
needs.

</details>

## Configuration

| Setting | Default | Effect |
| --- | --- | --- |
| History enabled | On | Disabling it is a deliberate choice with a stated consequence, not a silent default. |
| Repository location | Beside the application's data directory | Never inside a user folder. Relocatable, but never to a path the user version-controls themselves. |
| Retention | Keep everything | Pruning is opt-in, because the failure mode of keeping too much is disk usage and the failure mode of pruning too much is permanent. |
| Sync | Off, and there is no remote | Opt-in only, and an opt-in that states plainly that deleted records are included. |
| Snapshot granularity | Per user-visible action | Not per keystroke and not per timer. An action the user did not take should not appear in a list of things they did. |

## Failure modes

| Failure | Consequence |
| --- | --- |
| A restore that discards what it replaced | Makes the panel unsafe to use at all. The user cannot experiment, so they do not. |
| A history repository inside the user's own folder | Collides with their version control and follows their work into their commits. |
| Snapshots that decrypt on the way in | A plaintext copy of everything the store protects, in a directory nobody treats as sensitive. |
| Associated data bound to a row number | Restored records permanently undecryptable, failing exactly like corruption. |
| A failed history write failing the user's operation | The user loses the action they asked for to a feature meant to protect them. |
| Records versioned but settings not | A restore returns the record without the configuration it ran under — right-looking and wrong. |
| Labels reading "Updated" | The panel becomes a list of timestamps. Nobody can find the revision they want. |
| An unchanged state recorded anyway | Real events drown in noise. |
| A hard-coded action filter | Drifts from what is recorded, and the drift is invisible: the missing action simply never appears. |
| Filters that override one another | The user cannot narrow twice, and the result contradicts both controls. |
| Discard not recorded | The one moment work vanishes with no other trace is the one moment with no audit entry. |
| Pruning without the confirmation gate | An irreversible bulk delete behind an ordinary button. |
| History synced by default | Every record the user ever deleted, uploaded somewhere. |

## Security considerations

- **A history mirrors a store and must never be less protected than it.**
  Ciphertext stays ciphertext, permissions match, and the directory is not
  world-readable because it happens to sit outside the store's own path.
- **The identifier-binding trap is the highest-severity item in this file.** It
  is silent at write time, silent at restore time, and only surfaces when the user
  tries to read data back. Bind to an identifier that survives delete and restore,
  and test it by deleting a record, restoring it, and decrypting it.
- **History is local by default, and the opt-in must say what it contains.**
  "Sync my history" reads like a convenience. It means uploading a complete
  record of everything the user ever had, including what they deliberately
  deleted. The consent copy has to say that.
- **Version labels and revision messages are rendered.** They can contain
  document names, account names and paths. Treat them as display text and never
  interpolate them into a shell command, a path, or markup.
- **Pruning and export are the two destructive edges.** Pruning destroys the
  record; export copies it across a trust boundary into a plain file. Both need
  their own consent, and export must state what it will contain.

## Verification

**Nothing has been verified.** The application builds, installs, launches and
passes an automated health check, and its unit suites pass — but no version
history has been exercised, and the required store does not exist.

Conformance requires all of:

- [ ] documents, records **and** settings all snapshotted, enumerated against the
      list of things the application owns rather than spot-checked
- [ ] the repository created beside the application's data directory, and a test
      asserting it is never created inside a user-selected folder
- [ ] **restore recorded as a new revision** — proven by restoring, undoing the
      restore, and undoing that, with all three visible in the panel afterwards
- [ ] ciphertext preserved — proven by reading a snapshot and finding it
      unreadable without the key
- [ ] **associated data bound to a stable identifier** — proven by deleting a
      record, restoring it, and successfully decrypting it afterwards
- [ ] discarding unsaved work recorded before the close completes, and
      restorable afterwards
- [ ] a failed history write leaving the user's operation successful, with the
      failure reported as a notification rather than swallowed
- [ ] the date filter, the action filter with counts, and the search all present
      and **composing**, with an honest empty state
- [ ] the action filter's options derived from recorded history — proven by
      recording a new kind of action and seeing it appear without a code change
- [ ] revision labels naming what changed, audited against a sample of real
      revisions
- [ ] pruning passing the destructive-action gate and reporting exactly what it
      removed
- [ ] history export honouring the active filter and stating its range

The delete-restore-decrypt test and the restore-undo-undo test are the two to
write first. Both guard failures that are silent, permanent, and discovered only
by the user who needed the feature to work.

## Suggested reading

- [changelog-viewer.md](changelog-viewer.md) — the advanced date control this panel reuses
- [super-confirmation.md](super-confirmation.md) — the gate pruning and any destructive restore must pass
- [export-and-bulk-actions.md](export-and-bulk-actions.md) — the export rules, and the bulk actions this history makes undoable
- [regex-builder.md](regex-builder.md) — the search the panel carries
- [releases.md](releases.md) — where this standard was first stated, beside the release machinery
- `ROADMAP.md` §4.4 — the tracked work item
