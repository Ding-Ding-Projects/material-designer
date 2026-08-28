# Local Ollama daemon API

## Behaviour

The daemon exposes a same-origin bridge for the desktop Ollama suite. It
accepts only credential-free loopback origins for runtime operations, rejects
redirects, bounds JSON responses, and forwards the local runtime operations
used by the settings surface: runtime status, hardware facts, installed tags,
official catalog pages, streamed pulls, durable pull actions, streamed chat,
and allowlisted harness preflight, launch, health, snapshot, and restore.

## Configuration

The default local runtime origin is `http://127.0.0.1:11434`. A request may
select another loopback origin through its request body or query value, but
credentials, query strings, fragments, non-loopback hosts, and unsupported
schemes are refused. Request and response limits are enforced before data is
made visible to the renderer. The official catalog route uses the fixed
provider endpoint and does not accept an arbitrary catalog URL.

## Failure modes

Unavailable local service responses become explicit `offline`, `stopped`, or
`unhealthy` states. Oversized or malformed JSON is rejected. Pull and chat
streams preserve the HTTP status and terminate without claiming completion when
the local service cannot be reached.

## Security considerations

The bridge is a local capability boundary, not a general proxy. It never
accepts arbitrary URLs, credentials, shell commands, or environment values.
The daemon does not log request bodies or streamed model content. The browser
surface receives only bounded model metadata and stream bytes from the local
service.

## Verification

The implementation is `design/apps/daemon/src/routes/ollama-suite.ts`, wired by
`design/apps/daemon/src/server.ts`. The renderer domain tests live in
`design/apps/web/tests/runtime/ollama-suite.test.ts`; hosted type, route, and
packaged interaction checks remain required before release.

## Suggested articles

- [../standards/ollama-suite.md](../standards/ollama-suite.md)
- [../architecture/data-directory.md](../architecture/data-directory.md)
- [../standards/regex-builder.md](../standards/regex-builder.md)
