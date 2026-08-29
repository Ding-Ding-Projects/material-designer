# Local Ollama suite manager

## Behaviour

The renderer ships a local Ollama suite manager with five tabbed regions: Model
Store, Pull queue, Local chat, Harness profiles, and Recovery help. It uses a
typed, same-origin `/api/ollama/*` boundary. The renderer never forwards to a
user-entered origin. If the host bridge is absent or incomplete, the manager
shows an unavailable state and leaves controls safe until the host responds.
The feature route exports `registerOllamaSuiteRoutes` and returns a typed
mounted status for the central server registration lane. Until central
registration mounts it, the renderer states that the host bridge is
unavailable. Once mounted, the route owns loopback forwarding, queue
persistence, and snapshot restore.

The Model Store consumes the official catalog through a paginated, revisioned
daemon fetch. It records the page count, completion status, fetch time, source
identity, stale state, and every returned variant. A missing page token, source
revision, or stable catalog identity keeps the snapshot incomplete. The source
identity is the fixed official catalog identity and never includes a page token.
Installed tags remain visible when official metadata is absent, and such rows are labelled
**Unknown** instead of being treated as safe. Each variant carries an
evidence-backed **Runs well**, **Runs with limits**, **Unlikely**, or
**Unknown** hardware verdict.

Pulls are queued as durable records owned by the daemon and consume a streamed
progress response. The host persists queued, pulling, paused, completed, cancelled, and failed
states, limits active work to two items, records byte progress and attempts, and
reconciles an interrupted pull after restart. Local chat streams newline-
delimited responses, supports cancellation through the request signal, and
keeps message history in application-local state. Multiple named session
records can be parsed, searched, renamed, and exported with bounded fields.
Chat sessions validate
bounded temperature, top-p, top-k, context, and seed parameters, retain an
editable system prompt, persist a redacted local transcript, and export only
safe metadata and message content. Attachment controls remain visible but are
disabled with the exact capability gap when the selected model does not
advertise vision, text, or file input.

Harness profiles are registered allowlisted records. They use a semantic
executable picker and bounded argument values, display a reviewable preflight,
write one stable snapshot id before launch, start without a shell, perform a
bounded local health check, and restore the snapshot when launch or health
fails. Shell syntax, command concatenation, arbitrary executables, unvalidated
working directories, and unvalidated environment expansion are refused.
Recovery help distinguishes a missing service, a stopped service, an unhealthy
API, stale catalog data, and unknown hardware evidence.

Every manager tab has its own plain-text-first search field and its own anchored
regex builder. Search state is isolated per tab, and the builder keeps its
pattern, flags, sample, and validation state with the originating field. The
host bridge status is always visible, so an unavailable daemon cannot look like
a successful empty catalog.

## Configuration

The renderer uses same-origin daemon paths only. No user-entered URL is sent by
the renderer. The host route obtains the official catalog from its documented catalog
endpoint, preserves one source revision and one fixed catalog identity across
all pages, and marks the snapshot incomplete when either is absent. The catalog
is considered stale after six hours. Responses are bounded at 8 MiB while they
are read, a catalog is bounded at 10,000 pages and 100,000 variants, and every
durable pull record carries explicit provider and terminal metadata. The host
reports RAM, available RAM, free destination storage, architecture, and
explicit nullable GPU, VRAM, driver, and backend fields when a verified probe is
not available. Harness profiles accept at most 64 arguments and 64 environment
key names and only the verified Ollama executable with its `run` argument shape.
Registration persists only executable identity and environment-key names, never
environment values or credentials. The local API forwards images through its
native image field, decodes text and JSON into bounded content, and refuses
other attachment types with their capability reason.
The local language selector persists English, Cantonese, or bilingual
presentation in browser-local application state until the shared language
control is wired into this surface.

## Failure modes

| Failure | User-visible result |
| --- | --- |
| Local service missing or stopped | Runtime status says `missing` or `stopped`; recovery instructions remain available. |
| Host bridge is absent or incomplete | The manager says the bridge is unavailable and keeps local controls from claiming success. |
| Local service is offline | The last verified catalog and installed tags remain available; a refresh reports the failure. |
| Catalog response is malformed, oversized, incomplete, or repeats a page token | The refresh is rejected and the prior verified snapshot is retained. |
| Hardware facts are incomplete | The variant is `Unknown` and the pull action is not presented as safe. |
| Pull stream ends with an error | The queue row is `failed` and existing installed models are not removed. |
| Harness contains shell syntax | Registration is refused before launch and the invalid value is not persisted. |
| Chat request fails | The local error is shown without pretending that a response was generated. |

## Security considerations

Only same-origin `/api/ollama/*` paths are accepted by the renderer client. The
daemon must enforce loopback-only forwarding, reject credentials in URLs,
bound response sizes and timeouts, and avoid logging request bodies. Harness
profiles never carry secret values, only redacted environment-key names. Chat
messages, model payloads, local paths, and credentials must not enter logs,
telemetry, captures, or public exports.

The hardware verdict is advisory evidence, not a promise of successful
execution. Missing evidence is conservative. An allowlist is not a security
boundary for a user who controls the machine; it is a safety boundary against
accidental arbitrary command execution from the UI.

## Verification

The focused source suite is
`design/apps/web/tests/runtime/ollama-suite.test.ts`, with host route contracts
in `design/apps/daemon/tests/routes/ollama-suite.test.ts`. It covers loopback origin
validation, malformed pages, complete pagination, repeated-token refusal,
installed/catalog reconciliation, conservative hardware verdicts, malformed
hardware and pull responses, bounded response reads, host-bridge absence,
attachment restoration, and harness shell-syntax rejection. The source suite
is run only as a focused lane check when the required workspace tooling is
available. A missing workspace tool is reported as unverified rather than
presented as a passing result.

The built desktop surface still needs the full packaged interaction evidence:
healthy, missing, stopped, offline, stale, pulling, partial pull, streamed
chat, unavailable attachment, harness preflight, failed launch, rollback,
all search fields, and every per-click capture. The host API still needs a
platform-specific GPU, VRAM, driver, and backend probe. Resume restarts the
provider pull from the durable record because the provider exposes no
resumable token in this bridge. Those states are deliberately not described as
verified by this source-only change.

## Suggested articles

- [regex-builder.md](regex-builder.md)
- [long-operations.md](long-operations.md)
- [version-history.md](version-history.md)
- [export-and-bulk-actions.md](export-and-bulk-actions.md)
- [accessibility.md](accessibility.md)
