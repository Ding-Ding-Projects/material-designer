# Local Ollama suite manager

## Behaviour

The desktop settings surface exposes a local Ollama suite manager with five
tabbed regions: Model Store, Pull queue, Local chat, Harness profiles, and
Recovery help. The manager uses the daemon's same-origin `/api/ollama/*`
boundary. The daemon, rather than the renderer, is responsible for forwarding
requests to an explicitly configured loopback service.

The Model Store consumes the official catalog through a paginated, revisioned
daemon fetch. It records the page count, completion status, fetch time, source
identity, stale state, and every returned variant. A missing page token, source
revision, or source identity keeps the snapshot incomplete. Installed tags
remain visible when official metadata is absent, and such rows are labelled
**Unknown** instead of being treated as safe. Each variant carries an
evidence-backed **Runs well**, **Runs with limits**, **Unlikely**, or
**Unknown** hardware verdict.

Pulls are queued as durable records and consume a streamed progress response.
The host persists queued, pulling, paused, completed, cancelled, and failed
states, limits active work to two items, records byte progress and attempts, and
reconciles an interrupted pull after restart. Local chat streams newline-
delimited responses, supports cancellation through the request signal, and
keeps message history in application-local state. Chat sessions validate
bounded temperature, top-p, top-k, context, and seed parameters, retain an
editable system prompt, persist a redacted local transcript, and export only
safe metadata and message content. Attachment controls remain visible but are
disabled with the exact capability gap when the selected model does not
advertise vision, text, or file input.

Harness profiles are allowlisted records. They use a semantic executable picker
and bounded argument values, display a reviewable preflight, snapshot the
profile before launch, start without a shell, perform a bounded local health
check, and roll back the snapshot when launch or health fails. Shell syntax,
command concatenation, arbitrary executables, and unvalidated environment
expansion are refused. Recovery help distinguishes a missing service, a
stopped service, an unhealthy API, stale catalog data, and unknown hardware
evidence.

Every manager tab has its own plain-text-first search field and its own anchored
regex builder. Search state is isolated per tab, and the builder keeps its
pattern, flags, sample, and validation state with the originating field.

## Configuration

The renderer uses same-origin daemon paths only. No user-entered URL is sent by
the renderer. The daemon obtains the official catalog from its documented
catalog endpoint, preserves the response ETag as source revision and the
response URL plus page token as source identity, and marks the snapshot
incomplete when either is absent. The catalog is considered stale after six
hours. Responses are bounded at 8 MiB, a catalog is bounded at 10,000 pages,
and a page is bounded at 100,000 variants. The host reports RAM, available RAM,
free destination storage, architecture, and explicit Unknown GPU, VRAM, driver,
and backend fields when no verified platform probe exists. Harness profiles
accept at most 64 arguments and 64 environment-key names. The local language
selector persists English, Cantonese, or bilingual presentation in
browser-local application state until the shared language control is wired into
this surface.

## Failure modes

| Failure | User-visible result |
| --- | --- |
| Local service missing or stopped | Runtime status says `missing` or `stopped`; recovery instructions remain available. |
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
`design/apps/web/tests/runtime/ollama-suite.test.ts`. It covers loopback
origin validation, malformed pages, complete pagination, repeated-token
refusal, installed/catalog reconciliation, conservative hardware verdicts,
and harness shell-syntax rejection. The source suite is not run locally in this
lane because repository policy reserves Node, package-manager, and app
execution for CI.

The built desktop surface still needs the full packaged interaction evidence:
healthy, missing, stopped, offline, stale, pulling, partial pull, streamed
chat, unavailable attachment, harness preflight, failed launch, rollback,
all search fields, and every per-click capture. The host API still needs a
platform-specific GPU, VRAM, driver, and backend probe, and the queue needs
provider-aware resume rather than only durable state reconciliation. Those
states are deliberately not described as verified by this source-only change.

## Suggested articles

- [regex-builder.md](regex-builder.md)
- [long-operations.md](long-operations.md)
- [version-history.md](version-history.md)
- [export-and-bulk-actions.md](export-and-bulk-actions.md)
- [accessibility.md](accessibility.md)
