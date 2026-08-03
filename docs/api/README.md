# Daemon HTTP API

The local daemon's HTTP surface: **38 route files registering 351 route handlers
across 304 distinct path patterns**, plus several server-sent event streams.

> [!IMPORTANT]
> **Nothing here has been called.** No daemon has been started in this
> repository. Every route below was read from the vendored source, not observed
> answering a request. Prefixes and ownership are accurate transcriptions;
> request and response shapes are **not** documented here because they have not
> been verified.

## Base URL and defaults

| Property | Value |
| --- | --- |
| Base URL | `http://127.0.0.1:7456` |
| Bind address | `127.0.0.1` — override with `OD_BIND_HOST` or `--host` |
| Port | `7456` — override with `OD_PORT` or `--port` |
| Framework | Express 5.2.1 |
| Streaming | Server-sent events on the `/events` and `/stream` routes |

> [!NOTE]
> Express 5 changed wildcard syntax: route wildcards are **named** (`*splat`),
> not bare `*`. This matters when reading route definitions or adding one.

## Authentication and origin

There is **no authentication by default**, because there is no network exposure
by default: the daemon binds loopback and an origin guard sits in front of the
whole `/api` tree.

| Variable | Effect |
| --- | --- |
| `OD_ALLOWED_ORIGINS` | Origins the guard permits. **Required** with a non-loopback bind. |
| `OD_API_TOKEN` | Shared-secret authentication. Required for the container deployment. |
| `OD_ALLOWED_INTERNAL_HOSTS` | Per-host opt-out from the proxy's private-network blocking. |

Anything that can reach this API can drive a local agent tool with the user's
privileges. Treat exposing it as equivalent to granting shell access.

## Postman collection

**Status: pending. `postman/` does not exist yet.**

There is **no OpenAPI, Swagger or Postman artifact anywhere in the vendored
tree** — the collection is new work, hand-derived from the route table below.

When written it will live at `postman/` with:

| File | Contents |
| --- | --- |
| `postman/material-designer.postman_collection.json` | The full collection, foldered to match the route groups below. |
| `postman/material-designer.postman_environment.json` | Base URL, port and token variables. |
| `postman/README.md` | How to import it, what each folder covers, and which requests are destructive. |

Two rules for whoever writes it. **Every request must be exercised against a
running daemon before the collection is committed** — a hand-derived collection
that has never been run is a list of guesses, and the request and response shapes
in it would be fiction. And **destructive requests must be marked as such** in
their folder and name: this collection will contain project deletion, database
vacuum, and daemon shutdown.

## Route groups

Grouped by the source file that owns them. All paths are relative to the base URL.

<details>
<summary><b>Core, health and static</b> — health, readiness, version, artifact and frame serving, the origin guard, the single-page fallback</summary>

| Source | Prefixes |
| --- | --- |
| `server.ts` | `/api/health`, `/api/ready`, `/api/version`, `/api/preview/isolation`, `/api/projects/:id/figma/import`, `/artifacts`, `/frames` |
| `origin-validation.ts` | Middleware over the whole `/api` tree |
| `static-spa.ts` | `/*splat` — the single-page-app fallback, serving the built interface |

`server.ts` also re-registers `/api/brands/:id/extract-from-html` and
`/api/library/ingest`.

</details>

<details>
<summary><b>Projects, files and conversations</b> — the core workspace surface</summary>

| Source | Prefixes |
| --- | --- |
| `routes/project/index.ts` | `/api/projects`, `/api/projects/:id`, and under it `files`, `files/:name`, `files/:name/preview`, `files/rename`, `folders`, `events`, `search`, `tabs`, `duplicate`, `preview-url`, `design-system-copy`, `design-system-package-audit`; plus `/api/project-locations`, `/api/project-locations/scan`, `/api/templates`, `/api/templates/:id`, `/api/upload`, `/api/artifacts/save`, `/api/artifacts/lint` |
| `routes/project/conversations.ts` | `/api/projects/:id/conversations`, `…/:cid`, `…/:cid/messages`, `…/:cid/messages/:mid` |
| `routes/project/comments.ts` | `/api/projects/:id/conversations/:cid/comments` |
| `routes/terminal.ts` | `/api/projects/:id/terminals`, `…/:tid`, and `kill`, `resize`, `stdin`, `stream` |

`/api/projects/:id/events` is a server-sent event stream for project file changes.

</details>

<details>
<summary><b>Runs, chat and generated interface</b> — driving the agent and streaming results</summary>

| Source | Prefixes |
| --- | --- |
| `routes/runs.ts` | `/api/runs`, `/api/runs/:id`, and `agui`, `cancel`, `events`, `result-package`; plus `/api/runs/by-plugin-workflow/:workflowId` and `/api/chat` |
| `routes/chat.ts` | `/api/proxy/:provider/stream` and the named provider streams; `/api/provider/models`, `/api/test/connection`, `/api/runs/:id/feedback` |
| `routes/genui.ts` | `/api/runs/:runId/genui` and `…/:surfaceId[/respond]`; `/api/runs/:runId/devloop-iterations`, `…/replay`; `/api/projects/:projectId/genui`, `…/prefill`, `…/:surfaceId/revoke` |

`/api/runs/:id/events` is a server-sent event stream for run progress.

</details>

<details>
<summary><b>Design systems, skills, templates and static resources</b></summary>

| Source | Prefixes |
| --- | --- |
| `routes/design-systems.ts` | `/api/design-systems` and `:id`, `archive`, `file`, `files`, `preview`, `showcase`, `static`, `workspace`, `revisions`, `revisions/:revisionId`, `revision-jobs`, `token-contract/rebuild-jobs`; plus `/api/design-systems/generation-jobs[/:jobId]` and `/api/craft[/:id]` |
| `routes/static-resource.ts` | `/api/skills` and `:id`, `files`, `example`, `assets/*splat`, `import`, `install`; `/api/design-templates[/:id]`, `/api/prompt-templates[/:surface/:id]`, `/api/atoms[/:id]`, `/api/agents`, `/api/codex-pets`; and the design-system import routes for remote, local and component-library sources |
| `routes/design-system-tool.ts` | `/api/tools/design-systems/read` |

</details>

<details>
<summary><b>Plugins and marketplaces</b></summary>

| Source | Prefixes |
| --- | --- |
| `routes/plugins/index.ts` | `/api/plugins` and `:id`, `apply`, `doctor`, `trust`, `uninstall`, `upgrade`, `duplicate-project`, `share-project`; `/api/plugins/install`, `stats`, `upload-zip`, `upload-folder`, `events`, `share-tasks/:id/wait`; `/api/applied-plugins`; `/api/projects/:id/plugin-candidates`; `/api/projects/:id/plugins/install-folder`, `publish-github`, `share-tasks`, `contribute-open-design` |
| `routes/plugins/assets.ts` | `/api/plugins/:id/asset/*splat`, `…/example/:name`, `…/preview`; `/api/asset-cache` |
| `routes/plugins/marketplaces.ts` | `/api/marketplaces`, `…/:id`, `…/:id/plugins`, `…/:id/refresh`, `…/:id/trust` |

</details>

<details>
<summary><b>Artifacts, media, library and memory</b></summary>

| Source | Prefixes |
| --- | --- |
| `routes/live-artifact.ts` | `/api/live-artifacts`, `…/:artifactId`, `…/preview`, `…/refresh`, `…/refreshes`; `/api/tools/live-artifacts/create`, `list`, `update`, `refresh` |
| `routes/media.ts` | `/api/media/config`, `models`, `tasks/:id/wait`, and provider model and voice listings; `/api/projects/:id/media/generate`, `…/tasks`; `/api/tools/media/generate`; `/api/orbit/run`, `…/status`; `/api/research/search`; `/api/app-config`; `/api/dir-exists`, `recent-dirs`, `dialog/open-folder`, `system/open-external` |
| `routes/library.ts` | `/api/library/assets` and `:id`, `apply`, `edit-as-page`, `element`, `figma`, `raw`; `/api/library/clipper-probe`, `connection`, `events`, `ingest`, `pair`, `pair/confirm`, `sync`; `/api/tools/library/apply`, `…/search` |
| `routes/memory.ts` | `/api/memory` and `:id`, `config`, `events`, `extract`, `extractions[/:id]`, `index`, `system-prompt`, `tree[/:id]`, `rules/suggest`, `connectors/extract`, `connectors/suggest`, `verifications[/:id]` |

</details>

<details>
<summary><b>Automation and deployment</b></summary>

| Source | Prefixes |
| --- | --- |
| `routes/routine.ts` | `/api/routines`, `…/:id`, `…/run`, `…/runs`, `…/runs/:runId/crystallize`; `/api/automation-templates[/:id]` |
| `routes/automation.ts` | `/api/automation-proposals`, `…/:id[/apply|/reject]`; `/api/automation-ingestions`; `/api/automation-source-packets[/:id]` |
| `routes/deploy.ts` | `/api/deploy/config`, `/api/deploy/cloudflare-pages/zones`; `/api/projects/:id/deploy`, `…/deploy/preflight`, `…/deployments` |

</details>

<details>
<summary><b>Import, export and host integration</b></summary>

| Source | Prefixes |
| --- | --- |
| `import-export-routes.ts` | `/api/import/folder`; `/api/projects/:id/export`, `export/*splat`, `export/image`, `export/manifest`, `export/pdf`, `export/pdf-image`, `export/pptx`, `archive`, `archive/batch`, `finalize/:provider`, `working-dir` |
| `routes/host-tools.ts` | `/api/editors`, `/api/projects/:id/open-in` |
| `routes/handoff.ts` | `/api/projects/:id/handoff` |
| `routes/social-share.ts` | `/api/social-share` |

The PDF, image and slide export routes rasterise through the desktop shell's
bundled browser engine and are unavailable from a bare daemon.

</details>

<details>
<summary><b>Daemon control, metrics and telemetry</b></summary>

| Source | Prefixes |
| --- | --- |
| `routes/daemon.ts` | `/api/daemon/status`, `shutdown`, `db`, `db/vacuum`, `db/verify`; `/api/metrics`; `/api/critique/conformance`; `/api/agents/:agentId/oauth-launch` |
| `routes/telemetry.ts` | `/api/analytics/config`, `mcp/context`, `mcp/event`; `/api/observability/event` |
| `routes/whats-new.ts` | `/api/whats-new` |
| `routes/attribution.ts` | `/api/attribution/bridge-url` |

`/api/daemon/shutdown` stops the daemon. `/api/daemon/db/vacuum` mutates the
database file. Both are destructive and must be marked as such in any collection.

</details>

<details>
<summary><b>Credentials, connectors and external integrations</b></summary>

| Source | Prefixes |
| --- | --- |
| `routes/byok-credentials.ts` | `/api/byok/profiles`, `…/:id`, `…/:id/test` |
| `connectors/routes.ts` | `/api/connectors/*` — discovery, status, `:connectorId`, connect, connection, authorization cancel, an OAuth callback, credential-config preparation, provider config, logos; plus `/api/tools/connectors/list`, `…/execute` |
| `mcp-routes.ts` | `/api/mcp/servers`, `install-info`, `install/codex[/status]`, `oauth/start`, `status`, `callback`, `disconnect` |
| `routes/vela.ts` | `/api/integrations/vela/*` — login, logout, status, wallet, analytics, an API proxy, a message centre; plus `/api/amr/models` |
| `routes/xai.ts` | `/api/xai/search`, `auth/status`, `oauth/start`, `complete`, `cancel`, `disconnect` |
| `brand-routes.ts` | `/api/brands`, `…/:id`, `logo`, `preview`, `finalize`, `extract-from-html`, `continue-extraction`, `cancel-extraction` |
| `routes/open-design-public-metadata.ts` | `/api/github/open-design[/releases/latest]`, `/api/community/discord` |

</details>

> [!NOTE]
> `routes/active-context.ts` exists but registers **no** routes.
>
> The last group's routes reach **upstream project services** — its release
> metadata, its community endpoint, and its account and wallet integrations.
> Those are the upstream project's services, not this project's. Any rebranded
> build must decide deliberately what to do with them rather than inheriting
> them by default, and must not present upstream's endpoints as its own.

## Failure modes

| Symptom | Cause | Response |
| --- | --- | --- |
| Connection refused on 7456 | The daemon is not running, or is on another port | Start it; check `OD_PORT`. |
| Requests rejected by the origin guard | Non-loopback bind without `OD_ALLOWED_ORIGINS` | Set the allowed origins. Failing closed is correct. |
| A proxy request refused for a private address | Server-side-request-forgery protection | Intentional. `OD_ALLOWED_INTERNAL_HOSTS` opts a named host out — understand what that re-enables. |
| Export to PDF, image or slides fails | Those paths need the desktop shell's browser engine | Not available from a bare daemon. |
| A route pattern with a bare `*` does not match | Express 5 requires named wildcards | Use `*splat`. |
| An event stream disconnects | Server-sent events over a long-lived connection | Reconnect; the streams are designed to be resumed. |

## Security considerations

- **Reaching this API is equivalent to shell access.** Its purpose is executing
  locally installed agent tools with the user's privileges. Loopback binding is
  the primary control, not a default to override casually.
- **Two deliberate acts are required to expose it**, and the container deployment
  additionally requires a token. That is not redundancy; it is the difference
  between an accident and a decision.
- **The proxy blocks private address space**, including link-local,
  carrier-grade-NAT and cloud-metadata ranges. The opt-out is per host and
  re-enables a class of attack for that host.
- **Destructive routes exist**: project deletion, database vacuum, daemon
  shutdown. Mark them in any collection and never leave them adjacent to a
  read-only request that a reader might run by habit.
- **The terminal routes are exactly what they sound like.** They stream input and
  output to a real shell process on the machine.
- **Never paste a token into a committed collection.** Environment files carry
  variable names; values stay out of version control.

## Verification

**Nothing has been called.** The route inventory was read from source. The
following will confirm it once a daemon runs:

```bash
curl -sf http://127.0.0.1:7456/api/health
curl -sf http://127.0.0.1:7456/api/ready
curl -sf http://127.0.0.1:7456/api/version
curl -sf http://127.0.0.1:7456/api/daemon/status
curl -sf http://127.0.0.1:7456/api/metrics
```

Before the Postman collection can be committed, every request in it must have
been run against a live daemon, with its real response recorded. Requests that
were never executed do not go in.

## Suggested reading

- [../architecture/overview.md](../architecture/overview.md) — what serves this API and how it fits together
- [../build/from-source.md](../build/from-source.md) — how to get a daemon running to test against
- [../standards/releases.md](../standards/releases.md) — the honesty rules that apply to documenting unverified things
