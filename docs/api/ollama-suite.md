# Local Ollama daemon API

## Behaviour

The renderer domain exposes a typed, same-origin client for the desktop Ollama
suite. It accepts only `/api/ollama/*` paths, bounds response bytes before JSON
parsing, and validates runtime status, hardware facts, installed tags, official
catalog pages, streamed pulls, durable pull actions, streamed chat, and
allowlisted harness preflight, launch, and restore responses.

The client keeps the host seam explicit. When the daemon bridge is absent or
incomplete, `resolveOllamaHostBridge` reports an unavailable state and the
manager keeps controls safe rather than inventing local success. The daemon
route and queue persistence are owned by the host lane, not by this renderer
change.

## Configuration

The default local runtime origin is `http://127.0.0.1:11434`, and the host
route remains responsible for enforcing loopback forwarding. The renderer
never accepts a user-entered origin. Credentials, query strings, fragments,
non-loopback hosts, and unsupported schemes are refused by the loopback
validator. Response bytes are bounded while they are read, before JSON is
parsed or made visible to the renderer.

The official catalog uses a fixed provider endpoint and records one source
identity and revision across every page. Each page carries a bounded variant
list and either a bounded next-page token or an explicit terminal `null`.
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
stream bytes from the local service.

## Verification

The renderer implementation is
`design/apps/web/src/runtime/ollama-suite.ts`, with its manager in
`design/apps/web/src/components/ollama/OllamaSuiteManager.tsx`. The focused
domain tests live in `design/apps/web/tests/runtime/ollama-suite.test.ts`, and
the source contract is checked by `scripts/verify-ollama-suite.ps1`. Host route
wiring, hosted type checks, and packaged interaction checks remain required
before release.

## Suggested articles

- [../standards/ollama-suite.md](../standards/ollama-suite.md)
- [../architecture/data-directory.md](../architecture/data-directory.md)
- [../standards/regex-builder.md](../standards/regex-builder.md)
