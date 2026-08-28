# Local Ollama suite manager

## Behaviour

The desktop settings surface exposes a local Ollama suite manager with five
tabbed regions: Model Store, Pull queue, Local chat, Harness profiles, and
Recovery help. The manager uses the daemon's same-origin `/api/ollama/*`
boundary. The daemon, rather than the renderer, is responsible for forwarding
requests to an explicitly configured loopback service.

The Model Store consumes a paginated, revisioned catalog. It records the page
count, completion status, fetch time, stale state, and every returned variant.
Installed tags remain visible when catalog metadata is absent, and such rows
are labelled **Unknown** instead of being treated as safe. Each variant carries
an evidence-backed **Runs well**, **Runs with limits**, **Unlikely**, or
**Unknown** hardware verdict.

Pulls are queued as durable records and consume a streamed progress response.
The UI preserves queued, pulling, paused, completed, cancelled, and failed
states. Local chat streams newline-delimited responses, supports cancellation
through the request signal, and keeps message history in the application-local
state. Attachments are intentionally capability-gated by the model metadata.

Harness profiles are allowlisted records. They use an executable picker and
bounded argument values, display a reviewable preflight, and reject shell
syntax, command concatenation, and unvalidated environment expansion. Recovery
help distinguishes a missing service, a stopped service, an unhealthy API,
stale catalog data, and unknown hardware evidence.

Every manager tab has its own plain-text-first search field and its own anchored
regex builder. Search state is isolated per tab, and the builder keeps its
pattern, flags, sample, and validation state with the originating field.

## Configuration

The renderer uses same-origin daemon paths only. No user-entered URL is sent by
the renderer. The catalog is considered stale after six hours. Responses are
bounded at 8 MiB, a catalog is bounded at 10,000 pages, and a page is bounded
at 100,000 variants. Harness profiles accept at most 64 arguments and 64
environment-key names. The local language selector persists English, Cantonese,
or bilingual presentation in browser-local application state until the shared
language control is wired into this surface.

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
and harness shell-syntax rejection. The source suite is not run locally in
this lane because repository policy reserves Node, package-manager, and app
execution for CI.

The built desktop surface still needs the full packaged interaction evidence:
healthy, missing, stopped, offline, stale, pulling, partial pull, streamed
chat, unavailable attachment, harness preflight, failed launch, rollback,
all search fields, and every per-click capture. Those states are deliberately
not described as verified by this source-only change.

## Suggested articles

- [regex-builder.md](regex-builder.md)
- [long-operations.md](long-operations.md)
- [version-history.md](version-history.md)
- [export-and-bulk-actions.md](export-and-bulk-actions.md)
- [accessibility.md](accessibility.md)
