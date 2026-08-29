# Local file converter

The desktop converter modules, web surface, central host bridge, application
route, packaged native-writer producer, and documentation-page equivalent now
have a source-integrated bounded local foundation. Adapters remain unavailable
until a packaged proof is injected and verified. No build, installed
interaction, or capture is claimed by this source state.

## Behaviour

The registry presents eight categories: Documents/PDF, Images, Audio, Video,
Archives, Structured Data/Spreadsheets, Code/Text, and Binary Encodings. The
catalog keeps unavailable adapters visible with their exact missing bundled-codec
reason. Source detection inspects bounded bytes before considering a filename
extension, so a misleading extension cannot select an unsafe converter.

The source catalog describes bounded UTF-8 text, JSON, JSONL, CSV, TSV, YAML,
TOML, XML, Markdown, HTML, JavaScript, and TypeScript, but source contracts are
not advertised as bundled capability. `createProvenanceBoundAdapters` is the
main-process-only path that enables an adapter, and it resolves an allowlisted
resource and verifies its actual SHA-256 against release metadata. The text adapter
exposes only text-preserving targets until a specific parser is verified, so
JSON, JSONL, CSV, TSV, YAML, TOML, and XML are never silently claimed to convert
into one another. Binary inspection has the same packaged-proof boundary.
Image, audio, video, and archive codecs remain visible but disabled until their
real codecs are bundled.

The main-process provenance factory resolves an allowlisted packaged resource,
reads its actual bytes, hashes them with SHA-256, and compares the digest and
version against fixed release metadata before returning a branded proof. The
renderer cannot construct that proof.

Conversion runs in a terminable worker with an explicit memory resource limit
and a bounded deadline. The host checks input, output, CPU, memory, item, and
recursion limits before starting work. Text escaping and binary encodings measure
their bounded output in chunks before allocating the result, so HTML expansion
and hexadecimal expansion cannot allocate an unbounded string or buffer. The
worker receives input, output, item, recursion, and conservative workspace
limits, and late messages are ignored after termination. If the worker exceeds
its deadline or is cancelled, it is terminated and the result remains failed or
cancelled with no promotion.

The queue accepts an unlimited number of durable host-backed append/update records
through an on-disk index. Fixed-size order chunks point at per-item snapshots, so
page reads fetch only the requested records instead of rebuilding the complete
queue in memory. The authoritative journal is appended and flushed before a
snapshot, order index, or metadata record is published. Metadata records the
journal byte length, so a crash after the journal write causes the derived index
to rebuild from the journal. Journal compaction streams one current snapshot at
a time into a flushed replacement file. It records queued, running, paused,
converted, skipped, cancelled, and failed outcomes, supports pause, resume,
cancellation, retry, bounded concurrency, and restart recovery.
Malformed durable records are retained as an explicit read failure rather than
silently discarded. Records whose state was running when the host restarted are reconciled to a visible
failed outcome rather than silently re-run. The renderer polls this queue as its
single source of truth and never writes a transient queue copy.

The feature-owned C0 registration descriptor records the `/file-converter`
route, `FileConverterView` mount, `file-converter-surface` target, and
`converter` bridge capability without claiming central registration exists.
The mounted renderer route is `/file-converter` once C0 injects central wiring.
It has a category tab strip,
semantic source and destination controls, an isolated `RegexSearchField` beside
each category search, adapter cards with disabled reasons, preview disclosure,
queue progress and outcomes, cancellation, export, and a browser fallback that
states when the desktop host is required for conversion.

Its PDF operation control exposes inspect and visibly lists split, merge, extract
text, reorder, rotate, and metadata as unavailable until a bundled
content-preserving rewrite engine is verified. The host refuses those edits rather
than emitting synthetic or relabelled content. PDF inspection scans bounded
chunks, caps page records at 10,000, labels its page count as a heuristic, and
rejects encrypted or signed inputs. `%PDF-` is required as the complete source
signature. Text aliases `.yml`, `.htm`, and `.ndjson` normalize to `yaml`,
`html`, and `jsonl` before adapter matching.
When a packaged adapter promotes output, it reopens and validates it before
reporting success. Lossy conversions require an explicit, current, one-use
disclosure acknowledgement bound to the source, adapter, and target. Existing
destinations are handled through a host-issued, one-use authorization that is
requested only after the application has completed its two-key full-range slider.
The host binds that authorization to the source, destination, adapter, target
format, and the destination's size and modification snapshot. Promotion holds
an exclusive per-destination lock, rechecks the snapshot, and rolls back the
original file when replacement cannot finish. Queue state, host-backed
notification history, local Git history event summaries, and exported queue
records remain local to the user profile, while conversion paths stay in the
main process and worker boundary. Each mutation writes an initial history event,
commits it, then appends a follow-up event carrying that real commit SHA before
reporting the revision. Complete queue export is host-owned: it
streams bounded JSONL pages into a user-approved new destination, enforces
record and byte ceilings, and refuses repeated cursors or existing destinations.
Lossy conversions are deliberately refused at queue admission in this source
state. Their one-use disclosure acknowledgement is consumed only by the direct
just-in-time conversion flow, so the durable queue never retains one expiring
authorization per record. A later queued-loss review surface must mint a fresh
acknowledgement immediately before execution rather than persisting a
capability.
Disclosure state is pruned before issue and consume, has a hard capacity, keeps
at most one live token for each preview, replaces a duplicate deterministically,
and removes tokens when a preview expires or is evicted. Packaged provenance is
read through a stable opened file handle and verifies the path and handle
identity after opening and after reading. Every converter destination write,
including atomic output and complete export, opens a verified parent directory
before creating temporary bytes, then creates and promotes through its stable
handle-relative child path. Linux uses a verified procfs directory descriptor.
Windows uses the bundled `material-designer-converter-writer.exe`, started with
no command-line values, no shell, and an empty environment. Its fixed bounded
stdin protocol opens the approved parent with `NtCreateFile`, applies
`OBJ_DONT_REPARSE`, validates the opened identity, and resolves every temporary,
final, rollback, and cleanup name from that retained directory handle. Child
values are validated basenames, never paths. New output uses an atomic
no-replace rename. Confirmed replacement retains the exact authorized child
handle. Before moving that object into a CSPRNG-named rollback slot, the helper
emits a write-ahead intent containing the rollback basename plus exact parent
and child identities. Before moving the temporary file to its final name, it
emits a second write-ahead intent containing the exact temporary identity and
intended target. Completion receipts follow each namespace mutation. The
helper revalidates the original identity and metadata after the rollback move
and again after promotion, while final promotion retains no-replace semantics.
A child inserted or mutated after the open acknowledgement cannot be silently
replaced. A substituted entry is left
untouched and the authenticated original remains available for recovery.
Successful promotion flushes the final file and removes the rollback slot.
Parent renames and junction or symbolic-link swaps after the handle opens cannot
redirect output. Every Windows write caller captures the parent native identity
before helper launch and includes that witness in the request. The helper's
deadline applies only while it is waiting for bounded protocol input. Once all
input has arrived, synchronous filesystem flush, rename, cleanup, and rollback
calls are not hard-killed or described as deadline-bounded. Cancellation is
accepted while the helper is waiting for acknowledgement or streamed input.

The host starts a dedicated guardian helper before the writer helper. The
guardian opens the approved parent, creates an independently random CSPRNG
temporary basename relative to that retained parent handle. Its first handle
uses create-time `FILE_DELETE_ON_CLOSE`; the guardian immediately reopens the
same object through a second exact handle, verifies both file IDs, and returns
the volume and 128-bit file ID while the first handle remains crash-clean. The
host acknowledges that authority before the guardian closes the create handle
and clears disposition from the retained hold handle. A `guardian-ready` frame
proves the durable transition completed. The guardian returns no copyable
filesystem marker. The writer accepts the prepared temporary only when its
parent identity and exact file ID match the guardian receipt. After the worker
process starts, the guardian uses `DuplicateHandle` to place the same normal,
mutation-capable hold handle directly in the worker. The worker verifies the
duplicated handle's file ID, enters delete-pending state through a bounded
transient-sharing retry, and emits `worker-guarded`. Only then may the host
release the guardian. The worker retains that same exact handle through
cancellation, streaming, flush, rollback, and handle-relative promotion. It
never drops authority and reopens the temporary by basename.

The create handle is crash-clean before any receipt, so guardian self-termination
in that interval leaves no file. After host acknowledgement, the retained hold
handle is the creation authority and survives a separate worker kill.
Guardian cleanup targets that exact handle even if another process enumerates
the basename, copies its data, ACL, or extended attributes, renames the original,
and installs a clone at the old name. The clone has a different file ID and is
left untouched. No recovery EA, capability, ACL marker, or basename secret is
used or shipped.

Create-time `FILE_DELETE_ON_CLOSE` is used only on the disposable creation
handle, never on the hold handle that reaches promotion. A focused native probe
showed that clearing disposition on the same create handle did not make it
renameable, while closing that handle after host acknowledgement and clearing
the separately reopened hold handle produced durable, renameable output. Narrow TxF
probes were also refused with native code `6832` for ambient root-relative,
transactional-directory, and minimal `CreateFileTransactedW` file shapes, so
the helper does not ship or claim a deprecated transaction route. If the ordinary
disposition transition fails permanently, the helper deletes the exact opened handle
before returning. If deletion is also refused, the helper emits an active
recovery receipt and fails closed without claiming the entry was removed. The
helper emits bounded in-memory recovery receipts containing CSPRNG basenames and
exact parent and child native identities. If the helper is terminated during
write, flush, promotion, cleanup, or rollback, its host starts the same verified
helper in recovery mode. Recovery deletes, finalizes, or restores only a child
whose native identity matches the receipt. It inspects both the intent-named
entry and target, recognizes whether a mutation had or had not completed, and
remains idempotent when recovery itself is repeated after another termination.
It uses bounded retries for transient sharing violations and never deletes an
independently substituted entry.

The host records the provisional guardian basename, volume, and file ID as soon
as the initial guardian receipt arrives. If the guardian clears disposition on
its hold handle but exits before `guardian-ready`, the host waits for process
exit, then launches exact file-ID recovery twice. Recovery uses `OpenFileById`
to locate the object, resolves its current path from that exact handle, reopens
the path with delete rights, revalidates the same file ID, and deletes only that
object. A missing ID or a different-ID clone at the old basename is an
idempotent already-absent result, never authority to delete the clone.

The Windows helper is compiled during resource-tree production from the checked-in
C++ source. Packaging writes a versioned manifest containing source and executable
SHA-256 values, protocol version, byte length, and the fixed executable name. The
desktop host accepts only that allowlisted packaged location, reopens the manifest
and executable through stable handles, validates the executable as a bounded x64
PE file, and verifies its SHA-256 before starting it. A development executable,
`PATH` discovery, command string, script, network service, or environment override
cannot enable the writer.

The documentation page now mounts its own browser-local converter module. It
mediates a user-selected file through browser storage only, shows the same
eight categories and per-category search builders, records queue metadata in
a versioned IndexedDB store, reads only bounded 50-record pages without an
artificial total-record cap, exposes previous and next page controls, and says
plainly that it cannot write to the desktop
filesystem or call the desktop host. Source inspection is complete; deployed
interaction remains unverified.
Clearing that persistent browser-local queue shows the exact affected count and
requires two independent keys plus a full-range slider. Escape and the
always-available emergency exit cancel without deleting records.

Every target picker and PDF operation picker is a keyboard and pointer reachable
searchable choice. Its query, mode, flags, sample and selection persist locally,
and its search owns an anchored regex builder. The converter root exposes
target-specific appearance and toy-lock events for the shared application
contracts. If no consumer is registered, the surface reports the unavailable
state rather than presenting an inert editor or lock as complete. The renderer
pages queue records in bounded pages, labels selection as page-scoped, and asks
the host to stream the complete export so it never falls back to a first-page
snapshot.

## Configuration

All limits are explicit in `design/apps/desktop/src/main/converter/types.ts`:
source bytes are capped at 256 MiB globally, output bytes at 512 MiB globally,
and each adapter advertises stricter bounds. Queue concurrency is between one and
eight, defaulting to two. The host accepts absolute paths and can be restricted to
one selected folder. It performs no network access and does not discover codecs
from `PATH`.

PDF inputs carrying encryption or signatures are refused because rewriting them
without the user's access or without invalidating a signature would be dishonest.
Lossy or representation-changing previews carry a disclosure, and conversion is
refused until the host consumes its one-use acknowledgement.

## Failure modes

Malformed signatures, invalid UTF-8, unsupported formats, encrypted or signed PDFs,
missing destination folders, output-limit violations, invalid page ranges, invalid
page permutations, cancellation, and unavailable adapters produce explicit failed
or cancelled outcomes. Output is validated by its adapter before promotion. A
temporary file uses a unique name and bounded retries for transient rename errors
on the Linux path. The Windows native path uses handle-relative no-replace
operations for both new output and authorized promotion. It retains the exact
authorized original in a rollback slot until the promoted bytes and metadata
have been flushed. A helper protocol input timeout removes its delete-pending
temporary child. Authenticated recovery handles helper termination and bounded
sharing interference without deleting unrelated files. No partial destination
is reported as converted.

## Security considerations

The host is local-only. It bounds source, output, memory, CPU, item, and recursion
limits, rejects NUL and out-of-root paths, never shells out to a converter, and
does not treat a machine-installed codec as bundled proof. Adapter metadata records
its sandbox class, lossiness, encoding, and output validator. PDF encryption and
signature boundaries fail closed. Stable file and directory helpers reject
symbolic links and reparse traversal and compare opened-handle identities after
open. Destination writes use the verified directory descriptor helper, and the
converter fails closed before writing when handle-relative no-reparse creation
is unavailable. The Windows writer accepts one absolute parent, one basename,
bounded bytes, fixed operation flags, and native identity witnesses only. It has
no arbitrary command, shell, script, environment expansion, network, credential,
or path-escape surface. Queue state contains paths and progress only, never
credentials, private vocabulary, or raw payloads.

## Verification

Focused tests are in `design/apps/desktop/tests/main/file-converter.test.ts`,
`design/apps/desktop/tests/main/file-converter-ipc-contract.test.ts`, and
`design/apps/web/tests/file-converter.contract.test.ts`.
The tests cover all eight categories, signature-first detection, text heuristics,
PDF inspection and its explicit edit refusal, output reopening, invalid PDF
states, a 25-item queue with a measured concurrency ceiling of two, 700-item
indexed paging, streaming compaction, incremental source-byte progress, one-use
overwrite authorization, changed-destination refusal, cancellation before
output, durable notifications, a real temporary Git history revision, explicit
loss disclosure acknowledgement, and crash recovery from the authoritative
journal. They also cover one-token-per-preview replacement, token expiry and
capacity boundaries, opened-handle provenance, stable-parent swap resistance,
unsupported-platform export refusal, active worker cancellation and timeout,
late-result suppression, item and recursion limits, high-expansion HTML and
binary output admission, combined input and workspace memory admission, and
temporary-file cleanup. The feature contract tests exercise worker behavior
actively rather than relying on source markers, and read source through
comment-aware boundaries. Central bridge and documentation-page source seams
are now registered. The source-level
red-then-green regression is `scripts/test-file-converter-negative.ps1`; it
deliberately comments or mutates one exact implementation boundary at a time and
expects each check to turn red before the original source is restored. Missing
central seams are reported as integration-required rather than claimed as green.

`scripts/test-file-converter-windows-writer.ps1` compiles a separate focused
fault-enabled helper into a temporary resource tree and drives the real binary
protocol. It proves x64 PE structure and provenance, normal new output,
no-replace refusal, authorized replacement, an after-acknowledgement child
replacement and mutation race, forced post-promotion rollback, parent rename
and junction swaps after open, output only in the originally opened directory,
no bytes in the replacement directory, initial reparse refusal, cancellation,
the exact protocol input-wait deadline, and temporary cleanup. It kills the
real helper during write, pre-flush, the promotion transition, post-promotion,
and rollback. Separate forced kills land after the original-to-rollback mutation
but before its completion receipt, and after the temp-to-final mutation but
before its completion receipt. Injected transient and permanent initial
delete-pending failures prove immediate cleanup and authenticated recovery.
Every recovery is repeated to prove idempotence, then the suite proves zero temporary or
rollback entries and preserves the required original or promoted bytes. It also
pauses the guardian immediately after `FILE_CREATE` and before any temporary
intent or identity receipt, hard-kills that guardian, and proves create-time
delete-on-close leaves zero residue. A second guardian then survives a separate
worker kill. The test enumerates and copies the temporary, clones its ACL
and available metadata, renames the original, installs the clone at the old
name, and proves exact-handle cleanup deletes only the original object. It runs
receipt recovery twice, proves zero writer residue after the test-owned clone is
removed, and proves unrelated sibling bytes remain unchanged. It also
starts a worker while the guardian remains alive, installs a cloned same-name
file after the handle is duplicated but before the worker reads its request,
proves early guardian release is impossible, proves the worker retains and
promotes the moved original through its duplicated handle, and proves the clone
remains untouched. A separate kill after hold-handle disposition clear but
before `guardian-ready` proves repeated exact file-ID cleanup removes the moved
original while preserving a same-name metadata clone and unrelated siblings. It also
injects bounded native sharing violations into the fault-enabled cleanup path
and proves the retry loop converges. The ordinary
packaged producer never defines the focused fault macro. The desktop focused
suite additionally routes conversion output, complete queue export,
notification snapshots, and local Git history snapshots through the packaged
writer on Windows. Its Windows-only hook cases rename and replace the approved
parent between witness capture and helper launch for both generic atomic output
and complete queue export, then require refusal with both directories untouched.

The module, renderer, central bridge, application route, packaging producer,
documentation-page module, and focused tests are source evidence only. No
local toolchain or built application was run, and no packaged UI capture exists
yet. The remaining proof must build and drive the packaged application through
every state with retained captures, including invalid input, unavailable
adapters, preview disclosure, progress, pause, cancellation, recovery, and PDF
operations. The deployed documentation page also needs direct keyboard and
touch interaction proof.
Each catalog row carries a source-contract digest and path. It is deliberately not
called packaged proof until a release build records the packaged file digest.
Target format selectors carry independent persisted search controllers and their
own anchored builder, so filtering one adapter's formats cannot alter another's.
This recovered snapshot is rooted at `ac587f9bf`. The preservation record also
named `271b3da5a606ce28b4f274f0eb4194516691c060` and
`a3c1152c017263611536465f720b102ed9c0baa7`, but neither object is present in
this checkout, so those references are not treated as verification evidence.
The temporary-file coverage and audit-reader validation that are present here
are established only by the focused source and test files listed above.

### Suggested articles

- [export-and-bulk-actions.md](export-and-bulk-actions.md) for faithful-format
  export and batch action rules.
- [long-operations.md](long-operations.md) for progress and re-entry handling.
- [local-assets.md](local-assets.md) for offline bundled-codec requirements.
- [accessibility.md](accessibility.md) for keyboard, focus, sizing, and narrow
  layout verification.
