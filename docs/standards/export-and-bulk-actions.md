# Export everything, bulk actions everywhere

**Standard 11.** Anything a surface can show, the user can take away — in every
format that can faithfully represent it. Every list, table and grid supports
multi-select and the full set of its actions in bulk.

> [!IMPORTANT]
> **Status: source-complete for complete project ZIP handoffs; hosted runtime proof pending.** The vendored product already
> exports a design artifact to several formats. The full format matrix, the
> "say what will be lost before it runs" rule, the archive options and universal
> bulk actions are **not started**. Nothing in this file has been observed
> running, because the application has not been built here.

### Agent handoff archives

The project Download surface now distinguishes two complete-tree handoffs:

- **Website handoff ZIP** — the existing project archive, containing the project files,
  `DESIGN-HANDOFF.md`, and `DESIGN-MANIFEST.json`.
- **Desktop application scaffold ZIP** — the same complete project tree plus a generated
  `desktop/` source scaffold with a private `package.json`, a sandboxed Electron main process,
  a narrow preload marker, and `desktop-scaffold.json`.

The desktop scaffold is deliberately not an installer or release. It exposes no filesystem,
shell, environment, credential, or arbitrary IPC bridge; accepts only a relative entry file
inside the exported source root; records Squirrel.Windows as the eventual Windows packaging
target; and records that code signing remains disabled. If a project already owns one of the
generated `desktop/` paths, export fails instead of overwriting it. Historical single-file
versions do not offer this complete-project scaffold and never fall back to a misleading
one-file desktop ZIP.

The visible website-handoff action always requests the complete current project root; it no
longer derives a subfolder from whichever HTML file happens to be open, and it does not fall
back to a one-file ZIP while presenting that result as a complete handoff. Canonical
`DESIGN-HANDOFF.md` and `DESIGN-MANIFEST.json` names are reserved for generated evidence: a
project-owned collision fails closed instead of silently replacing the generated map. The
desktop scaffold additionally requires a real HTML entry, blocks network and out-of-root local
file requests, denies secondary windows and webviews, and treats case-only path collisions as
collisions for Windows extraction.

The project-level Export complete website handoff ZIP action is mounted beside
the project tabs rather than inside a file viewer. It remains reachable when no
file is active, when the project is empty, and for a read-only project the caller
is authorized to read. The prepare route writes a short-lived staged archive under
the daemon data root, returns a receipt with byte length, SHA-256, expiry and the
exact staged path for the editor handoff, then the browser streams and validates
the ZIP before saving it. The archive uses a fixed timestamp and code-point path
ordering, includes EXPORT-MANIFEST.json with per-entry byte lengths and hashes,
and carries an omission ledger for sensitive paths and redacted local absolute
paths. The archive digest is reported in the receipt over the complete ZIP byte
stream, while the manifest deliberately records the scope rather than its own
digest to avoid a self-referential hash.

## Behaviour

### Export is a property of every surface, not a feature of one

If a surface renders a record, a view, a list, a log, a document, a setting or a
generated artifact, that thing is exportable. "You can copy it off the screen" is
not an export, and a feature that renders data with no way out of it is
incomplete.

### The format matrix

Formats are chosen **per datum**, not per application:

| Shape of the data | Formats offered |
| --- | --- |
| Tabular — rows and columns | CSV, TSV |
| Structured records | JSON, JSONL/NDJSON, YAML, TOML, XML |
| Prose and documents | Markdown, HTML |
| Schemas and interchange | JSON Schema, Protobuf, SQL |
| Language source, where it makes sense | TypeScript/JavaScript, Python, Go, Rust |

**Never offer a format that would silently drop a field.** Where a format cannot
carry something — nested records flattened into CSV, comments lost from JSON,
precision lost from a numeric column — the export **says what will be lost before
it runs**, and the user decides. Truncating quietly is the failure this rule
exists to prevent.

Every export states its encoding (UTF-8 unless there is a stated reason), its
line endings, and the schema or version the file follows, so the file is readable
by something other than the application that wrote it. Where the shape allows a
round trip, exports are complete and re-importable.

### Archives

Archive exports are **ZIP or 7z**, and the 7z path exposes what 7z actually
offers rather than one hard-coded default:

| Control | Options |
| --- | --- |
| Method | LZMA2, LZMA, PPMd, BZip2, Deflate |
| Level | Store through Ultra |
| Layout | Dictionary, word and solid-block sizes; solid vs non-solid |
| Throughput | Multi-threading |
| Splitting | Multi-volume output |
| Encryption | AES-256 content encryption, **and encrypted headers** |

Each option states what it costs in time and memory rather than presenting a
menu of opaque names. **Never present an encrypted archive as protected while
leaving its filenames in the clear** — that is what the encrypted-headers option
is for, and an archive encrypted without it leaks the shape of its contents.

Archives name what is inside before they are written, keep paths relative so
extraction cannot escape its target directory, and never place a secret in an
archive the surrounding flow has not clearly marked as sensitive.

### Bulk actions

Selecting one item and repeating an action forty times is the application failing
to do its job. Every list, table and grid provides:

- **Multi-select** by click, shift-click for ranges, and a keyboard equivalent.
- **Select-all that states what it means** — *this page* or *every match* — in
  words, not by implication. These are different selections and the difference is
  usually large.
- **Inverse selection.**
- **The whole set of actions in bulk**, not a token subset: delete, export, move,
  copy, duplicate, rename by pattern, tag and untag, enable and disable, retry,
  and whatever else the surface offers singly.
- **Composition with search and filter**, so "select everything matching this
  query" is one step. The search bar's regex builder applies here exactly as it
  does everywhere else — see [regex-builder.md](regex-builder.md).

### Saying what will happen before it happens

- Show the **exact count** and a **reviewable preview** of the affected items.
- Distinguish **"42 selected" from "42 will change"** when some are skipped, and
  say why the others were skipped.
- Use a blocking confirmation **only** for the destructive or irreversible ones —
  and where it is destructive, it passes the super-confirmation gate in
  [notifications.md](notifications.md), not a plain dialog.
- **Never silently skip an item.** Report what was excluded and why.

### Undo, progress and honest partial results

Bulk actions are undoable through the same local version history everything else
uses — see [releases.md](releases.md#requirement-5--local-version-history) — or
they explain plainly why a particular one cannot be.

A long-running bulk action reports progress, remains cancellable, and states
partial results honestly. A batch where nine of forty items failed reports
exactly that; it never reports the batch as successful because the operation
finished.

## Configuration

| Setting | Default | Effect |
| --- | --- | --- |
| Default export format | Per surface, matched to the data's shape | The format pre-selected in the export dialog. Never a format that would drop a field for that surface. |
| Encoding | UTF-8 | Stated in the export dialog and in the file's own header where the format has one. |
| Line endings | Platform-native on Windows, LF elsewhere, stated either way | Only relevant to text formats. |
| Archive format | ZIP | 7z with its full option set is opt-in, because its defaults are not obvious. |
| Archive encryption | Off | When enabled, encrypted headers are on by default; turning them off is an explicit choice with a stated consequence. |
| Select-all scope | This page | The every-match scope is deliberately the second click, because it is the larger and less reversible selection. |
| Include-pinned in bulk close | Off | Pinned items are excluded by default; including them shows the protected items in the preview first. See [tabs.md](tabs.md). |

Every one of these is reachable from the command palette and from the settings
surface's own search, like any other setting.

## Failure modes

| Symptom | Cause | What should happen instead |
| --- | --- | --- |
| An export "succeeds" but the file is missing fields | A format that cannot represent the data was offered without warning | The format is either not offered, or the loss is stated before the export runs |
| A CSV export of nested records produces unreadable columns | Structured data forced into a tabular format | Offer JSON/YAML for that surface and say why CSV would flatten it |
| An encrypted 7z reveals every filename | Content encrypted, headers not | Encrypted headers on by default whenever content encryption is on |
| Extraction writes outside the target directory | Absolute or `..` paths stored in the archive | Paths are relative and normalised at write time |
| A bulk delete removes more than the preview showed | The selection changed between preview and execution | The preview and the execution operate on the same captured set |
| A bulk action reports success with items untouched | Per-item failures swallowed | Partial results reported item by item, with the reason |
| A bulk action cannot be undone | No history entry written | Every bulk action writes a history entry, or says in the confirmation that it cannot be undone |
| "Select all" selected only the visible page | Ambiguous label | The control states its scope in words, and the every-match option is offered beside it |

## Security considerations

- **An export moves data across a trust boundary.** A record that was protected
  inside the application's store is a plain file the moment it lands on disk. Say
  so where the data is sensitive, and never default a sensitive export to an
  unencrypted archive.
- **Never export a secret the flow has not marked as sensitive.** Credentials,
  tokens and keys are excluded from bulk exports unless the user has explicitly
  and specifically asked for them, and the export says what it will contain.
- **Encrypted headers are a confidentiality control, not a nicety.** Filenames
  routinely carry account names, project names and dates.
- **Archive extraction is an attack surface.** Relative, normalised paths only;
  never write outside the target directory.
- **A bulk action is a bulk mistake.** The count, the preview and the exclusion
  report exist because the blast radius is the whole selection, and the
  irreversible ones pass the destructive-action gate.

## Verification

**Source verification only for this lane.** No Node, pnpm, Electron, build, or test
command was run locally. The staged project ZIP path, ZIP-byte validation, export
policy, deterministic manifest, cancellation/progress controller, and editor
preference boundary are covered by committed source-level Chuts. Hosted build,
installed interaction, and real editor process evidence remain pending.

Conformance will be demonstrated by:

- [ ] every surface that renders data offering an export, enumerated against the
      application's own screen inventory rather than spot-checked
- [ ] a round-trip test per format: export, re-import, compare — for the formats
      that claim a round trip
- [ ] a lossy-format test: exporting nested data as CSV warns before running and
      names the fields that will be flattened
- [ ] an archive test producing 7z output at more than one method and level, with
      content **and** header encryption, verified by listing the archive without
      the password and seeing no filenames
- [ ] a path-traversal test: an archive entry with `..` in its path is refused at
      write time
- [ ] multi-select by click, shift-range and keyboard on every list surface
- [ ] select-all stating its scope, and the every-match variant selecting more
      than the visible page
- [ ] a bulk action preview whose count matches the number actually changed, with
      skipped items reported and named
- [ ] a bulk action undone through the version history, and that undo itself
      undone
- [ ] a cancelled long-running bulk action reporting exactly which items were
      completed before cancellation
- [x] the project-level complete-tree ZIP action is reachable without an active
      file and keeps the desktop scaffold as a separately named target
- [x] the project ZIP has fixed timestamps, stable ordering, an omission ledger,
      per-entry lengths/hashes, and a non-self-referential archive digest receipt
- [x] the browser validates content type, ZIP structure, required manifests,
      receipt length and digest before saving; hosted runtime proof remains pending

The lossy-format warning and the partial-results report are the two to write
first. Both guard failures that are silent at the moment they happen and are
discovered later by the person who trusted the export.

## Suggested reading

- [regex-builder.md](regex-builder.md) — the pattern builder that "select everything matching" depends on
- [notifications.md](notifications.md) — the gate a destructive bulk action must pass, and the toast that reports a long one
- [releases.md](releases.md) — the local version history that makes a bulk action undoable
- [tabs.md](tabs.md) — bulk close containing / not containing text, the same rules applied to a tab strip
- [accessibility.md](accessibility.md) — keyboard multi-select, and announcing a selection count to assistive technology
