# Local Ollama daemon API

## Behaviour

The renderer domain exposes a typed, same-origin client for the desktop Ollama
suite. It accepts only `/api/ollama/*` paths, bounds response bytes before JSON
parsing, and validates runtime status, hardware facts, installed tags, official
catalog pages, streamed pulls, durable pull actions, streamed chat, and
allowlisted harness preflight, launch, and restore responses.

The client keeps the host seam explicit. When the daemon bridge is absent or
incomplete, `resolveOllamaHostBridge` reports an unavailable state and the
manager keeps controls safe rather than inventing local success. The feature
route exports `registerOllamaSuiteRoutes`, which returns a typed mounted
status for the central server registration lane. Until that mount occurs, the
renderer continues to show the unavailable bridge state.

## Configuration

The default host-owned local runtime URL is `http://127.0.0.1:11434`. An
operator may set `OD_OLLAMA_BASE_URL` before mounting the route, but request
bodies and query strings cannot replace it. The renderer never accepts a
user-entered origin. Credentials, query strings, fragments, non-loopback hosts,
and unsupported schemes are refused by the host validator. Response bytes are
bounded while they are read, before JSON is parsed or made visible to the
renderer.

The official catalog uses a fixed provider endpoint and records one source
identity across every page. A provider ETag is accepted as the shared revision
only when every page carries the same value. When no ETag is supplied, the
revision is `null`, page content is still collected without comparing unrelated
page hashes, and pagination remains explicitly incomplete until an upstream
snapshot revision is available. Each page carries a bounded variant list and
either a bounded next-page token or an explicit terminal `null`. Bounded local
`/api/show` detail responses populate verified capabilities for a limited number
of variants, including bounded local-only installed or selected tags; unknown
capabilities remain disabled in the renderer. One refresh id carries a single
10-second detail budget and a 30-second bounded per-tag cache across all pages,
so a selected or installed tag is not queried repeatedly.
Hardware facts require explicit total RAM, available RAM, free storage,
architecture, backend status, and nullable GPU, VRAM, and driver fields.

## Failure modes

An absent host bridge is exposed as an unavailable state. Unavailable local
service responses become explicit `offline`, `stopped`, or `unhealthy` states.
Oversized or malformed JSON is rejected. Pull and chat streams preserve the
HTTP status and terminate without claiming completion when the local service
cannot be reached. A pull record without provider status, byte totals, or
terminal metadata is rejected instead of being treated as queued success.

## Security considerations

The bridge is a local capability boundary, not a general proxy. It never
accepts arbitrary URLs, credentials, shell commands, or environment values.
Harness profiles are restricted to the verified Ollama executable and the
allowlisted `run` argument shape. The host lane must not log request bodies or
streamed model content. The renderer receives only bounded model metadata and
stream bytes from the local service. Registration records an executable
identity containing a SHA-256 digest, a controlled working directory, and an
empty-by-default environment-key allowlist. Symlinks and reparse-style links
are refused. Launch requires a short-lived, single-use preflight nonce bound to
the exact registered profile, hash, arguments, working directory, environment
schema, and one stable snapshot id. It restores that snapshot on failed health
checks, and the explicit restore route revalidates the snapshot before
relaunching it. A launch waits for the child `spawn` boundary, observes later
child errors and early exits, requires a short stability interval, and checks
health only after the launched process is alive; a pid alone never produces a
success response.
Image attachments are forwarded through the API's `images` field, and text or
JSON attachments are decoded into the bounded message content. Text content
that would exceed the 100,000-byte message bound is refused with an explicit
size reason, never silently sliced. Other attachment types are refused instead
of being silently dropped.

## Verification

The renderer implementation is
`design/apps/web/src/runtime/ollama-suite.ts`, with its manager in
`design/apps/web/src/components/ollama/OllamaSuiteManager.tsx`. The focused
domain tests live in `design/apps/web/tests/runtime/ollama-suite.test.ts` and
the host contract tests live in
`design/apps/daemon/tests/routes/ollama-suite.test.ts`. The source contract is
checked by `scripts/verify-ollama-suite.ps1`. The host route implementation is
`design/apps/daemon/src/routes/ollama-suite.ts`; central server mounting,
hosted type checks, and packaged interaction checks remain required before
release.

## Suggested articles

- [../standards/ollama-suite.md](../standards/ollama-suite.md)
- [../architecture/data-directory.md](../architecture/data-directory.md)
- [../standards/regex-builder.md](../standards/regex-builder.md)
