# Local file converter

The desktop host and web renderer now have a bounded local converter foundation
and a mounted destination surface. It is deliberately reported as partial until
the current packaged application is driven and produces real interaction evidence.

## Behaviour

The registry presents eight categories: Documents/PDF, Images, Audio, Video,
Archives, Structured Data/Spreadsheets, Code/Text, and Binary Encodings. The
catalog keeps unavailable adapters visible with their exact missing bundled-codec
reason. Source detection inspects bounded bytes before considering a filename
extension, so a misleading extension cannot select an unsafe converter.

The bundled text adapter handles bounded UTF-8 text, JSON, JSONL, CSV, TSV, YAML,
TOML, XML, Markdown, HTML, JavaScript, and TypeScript. The bundled PDF adapter
inspects page count and metadata. Content-preserving page reorder, split, merge,
extraction, rotation, metadata changes, and PDF emission are visibly unavailable
until a real bundled rewrite engine is verified.
Binary inspection can export bounded hexadecimal or Base64 text. Image, audio,
video, and archive codecs remain visible but disabled until their real codecs are
bundled.

The queue accepts an unlimited number of durable host-backed append/update records
through an on-disk index. Fixed-size order chunks point at per-item snapshots, so
page reads fetch only the requested records instead of rebuilding the complete
queue in memory. Journal compaction streams one current snapshot at a time into
a replacement file. It records queued, running, paused, converted, skipped,
cancelled, and failed outcomes, supports pause, resume, cancellation, retry,
bounded concurrency, and restart recovery.
Malformed durable records are retained as an explicit read failure rather than
silently discarded. Records whose state was running when the host restarted are reconciled to a visible
failed outcome rather than silently re-run. The renderer polls this queue as its
single source of truth and never writes a transient queue copy.

The mounted renderer route is `/file-converter`. It has a category tab strip,
semantic source and destination controls, an isolated `RegexSearchField` beside
each category search, adapter cards with disabled reasons, preview disclosure,
queue progress and outcomes, cancellation, export, and a browser fallback that
states when the desktop host is required for conversion.

Its PDF operation control exposes inspect and visibly lists split, merge, extract
text, reorder, rotate, and metadata as unavailable until a bundled
content-preserving rewrite engine is verified. The host refuses those edits rather
than emitting synthetic or relabelled content. When an enabled adapter promotes
output, it reopens and validates it before reporting success. Existing destinations
are handled through a host-issued, one-use authorization that is requested only
after the application has completed its two-key full-range slider. The host binds
that authorization to the source, destination, adapter, target format, and the
destination's size and modification snapshot. Promotion holds an exclusive
per-destination lock, rechecks the snapshot, and rolls back the original file when
replacement cannot finish. Queue state, host-backed notification history, local
Git history event summaries, and exported queue records remain local to
the user profile, while conversion paths stay in the main process.

The documentation site carries a separate browser-local equivalent. It mediates a
user-selected file through browser storage only, shows the same eight categories
and per-category search builders, records queue actions locally, and says plainly
that it cannot write to the desktop filesystem or call the desktop host.

Every target picker and PDF operation picker is a keyboard and pointer reachable
searchable choice. Its query, mode, flags, sample and selection persist locally,
and its search owns an anchored regex builder. The converter root exposes
target-specific appearance and toy-lock events for the shared application
contracts. If no consumer is registered, the surface reports the unavailable
state rather than presenting an inert editor or lock as complete.

## Configuration

All limits are explicit in `design/apps/desktop/src/main/converter/types.ts`:
source bytes are capped at 256 MiB globally, output bytes at 512 MiB globally,
and each adapter advertises stricter bounds. Queue concurrency is between one and
eight, defaulting to two. The host accepts absolute paths and can be restricted to
one selected folder. It performs no network access and does not discover codecs
from `PATH`.

PDF inputs carrying encryption or signatures are refused because rewriting them
without the user's access or without invalidating a signature would be dishonest.
Lossy or representation-changing previews carry a disclosure before conversion.

## Failure modes

Malformed signatures, invalid UTF-8, unsupported formats, encrypted or signed PDFs,
missing destination folders, output-limit violations, invalid page ranges, invalid
page permutations, cancellation, and unavailable adapters produce explicit failed
or cancelled outcomes. Output is validated by its adapter before promotion. A
temporary file uses a unique name and bounded retries for transient Windows rename
errors, then the final error remains visible. No partial destination is reported as
converted.

## Security considerations

The host is local-only. It bounds source, output, memory, CPU, item, and recursion
limits, rejects NUL and out-of-root paths, never shells out to a converter, and
does not treat a machine-installed codec as bundled proof. Adapter metadata records
its sandbox class, lossiness, encoding, and output validator. PDF encryption and
signature boundaries fail closed. Queue state contains paths and progress only,
never credentials, private vocabulary, or raw payloads.

## Verification

Focused tests are in `design/apps/desktop/tests/main/file-converter.test.ts` and
`design/apps/desktop/tests/main/file-converter-ipc-contract.test.ts`,
`design/apps/web/tests/router.test.ts`, and
`design/apps/web/tests/file-converter.contract.test.ts`.
The tests cover all eight categories, signature-first detection, text heuristics,
PDF inspection and its explicit edit refusal, output reopening, invalid PDF
states, a 25-item queue with a measured concurrency ceiling of two, 700-item
indexed paging, streaming compaction, incremental source-byte progress, one-use
overwrite authorization, changed-destination refusal, cancellation before
output, durable notifications, and a redacted local Git history revision. The
IPC contract test reads source through a comment-aware lexer and checks the exact
registered and teardown channels. The source-level red-then-green regression is
`scripts/test-file-converter-negative.ps1`; it deliberately comments or mutates
one exact implementation boundary at a time and expects each check to turn red
before the original source is restored.

The module, renderer, bridge, site equivalent, and focused tests are source evidence only in this
lane. No local toolchain or built application was run, and no packaged UI capture
exists yet. The remaining proof must drive the packaged application through every
state with retained captures, including invalid input, unavailable adapters,
preview disclosure, progress, pause, cancellation, recovery, and PDF operations.
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
