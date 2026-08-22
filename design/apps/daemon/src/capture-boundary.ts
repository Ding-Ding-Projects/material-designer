import type { RequestHandler } from "express";

/**
 * Hand-written capture boundary inventory. This is intentionally explicit:
 * adding a new process-launching or external-provider route requires adding
 * its path here, instead of letting a discovery-only guard silently miss it.
 */
export const CAPTURE_HANDLER_INVENTORY = [
  // Process, native, provider, and write routes registered by the daemon.
  "POST /api/runs",
  "POST /api/chat",
  "POST /api/editor/open",
  "POST /api/projects/:id/open-in",
  "POST /api/plugins/install",
  "POST /api/plugins/:id/upgrade",
  "POST /api/plugins/:id/apply",
  "POST /api/plugins/:id/doctor",
  "POST /api/projects/:id/plugins/install-folder",
  "POST /api/projects/:id/plugins/publish-github",
  "POST /api/provider/models",
  "POST /api/media/providers/aihubmix/models",
  "POST /api/tools/media/generate",
  "POST /api/projects/:id/media/generate",
  "POST /api/research/search",
  "POST /api/memory/extract",
  "POST /api/memory/rules/suggest",
  "POST /api/memory/connectors/suggest",
  "POST /api/memory/connectors/extract",
  "POST /api/analytics/mcp/context",
  "POST /api/analytics/mcp/event",
  "POST /api/observability/event",
  "POST /api/orbit/run",
  "POST /api/system/open-external",
  "POST /api/dialog/open-folder",
  "POST /api/xai/oauth/start",
  "POST /api/xai/oauth/complete",
  "POST /api/xai/oauth/cancel",
  "POST /api/mcp/oauth/start",
  "POST /api/mcp/install/codex",
  "POST /api/projects/:id/terminals",
  "POST /api/projects/:id/terminals/:tid/stdin",
  "POST /api/projects/:id/terminals/:tid/kill",
  "POST /api/projects/:id/browser-sessions",
  "POST /api/projects/:id/media/hyperframes/scaffold",
  "POST /api/integrations/vela/login",
  "POST /api/integrations/vela/login/cancel",
  "POST /api/integrations/vela/logout",
  "POST /api/integrations/vela/analytics-entry",
  "POST /api/integrations/vela/analytics-profile",
  "POST /api/integrations/vela/api-proxy/*",
  "POST /api/integrations/vela/message-center/*",
  "POST /api/connectors/:connectorId/connect",
  "POST /api/connectors/auth-configs/prepare",
  "POST /api/tools/connectors/execute",
  "POST /api/agents/:agentId/oauth-launch",
  "POST /api/plugins/upload-zip",
  "POST /api/plugins/upload-folder",
  "POST /api/projects/:id/working-dir",
  "POST /api/import/folder",
  "PUT /api/media/config",
  "PUT /api/app-config",
  "PUT /api/memory/index",
  "PATCH /api/memory/config",
  "DELETE /api/memory/:id",
  "DELETE /api/projects/:id",
] as const;

/** Exact capture fixture/read routes. Every other /api request is refused. */
export const CAPTURE_READ_ROUTE_INVENTORY = [
  "GET /api/health",
  "GET /api/ready",
  "GET /api/version",
  "GET /api/agents",
  "GET /api/integrations/vela/status",
  "GET /api/amr/models",
  "GET /api/connectors",
  "GET /api/connectors/status",
  "GET /api/connectors/discovery",
  "GET /api/media/models",
  "GET /api/analytics/config",
  "GET /api/mcp/install-info",
  "GET /api/mcp/install/codex/status",
  "GET /api/mcp/servers",
  "GET /api/mcp/oauth/status",
  "GET /api/xai/auth/status",
  "GET /api/orbit/status",
  "GET /api/projects",
  "GET /api/projects/:id",
  "GET /api/projects/:id/files",
  "GET /api/projects/:id/folders",
  "GET /api/projects/:id/tabs",
  "GET /api/plugins",
  "GET /api/plugins/:id",
  "GET /api/marketplaces",
  "GET /api/editors",
  "GET /api/memory",
  "GET /api/memory/tree",
  "GET /api/memory/system-prompt",
  "GET /api/runs",
  "GET /api/runs/:id",
  "GET /api/media/config",
  "GET /api/app-config",
] as const;

export const CAPTURE_PROCESS_INVENTORY = [
  "agent detection",
  "agent run/chat launch",
  "Vela login/model/billing subprocess",
  "connector discovery/auth/tool execution",
  "MCP OAuth/install process",
  "terminal/browser-session child process",
  "legacy payload desktop handoff",
] as const;

export const CAPTURE_ENV_INVENTORY = [
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "TMP",
  "TEMP",
  "TMPDIR",
  "CODEX_HOME",
  "CLAUDE_CONFIG_DIR",
  "OPENCODE_TEST_HOME",
  "VP_HOME",
  "OPEN_DESIGN_AMR_PROFILE",
  "OD_DESIGN_PARITY_CAPTURE",
] as const;

export const CAPTURE_FIXTURE_REVISION = "material-designer-m3-v2" as const;

function routePatternMatches(pattern: string, method: string, path: string): boolean {
  const [patternMethod, patternPath] = pattern.split(" ", 2);
  if (patternMethod !== method.toUpperCase() || patternPath == null) return false;
  const regex = new RegExp(`^${patternPath
    .split("/")
    .map((segment) => segment === "*" ? ".+" : segment.startsWith(":") ? "[^/]+" : segment.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&"))
    .join("/")}$`);
  return regex.test(path);
}

function isInventoriedCaptureRoute(inventory: readonly string[], method: string, path: string): boolean {
  const keyPath = path.startsWith("/api/") ? path : `/api${path}`;
  return inventory.some((pattern) => routePatternMatches(pattern, method, keyPath));
}

function fixtureAgentStatus(): {
  agents: Array<Record<string, unknown>>;
  source: string;
  fixtureRevision: string;
} {
  return {
    agents: [
      {
        id: "capture-fixture-agent",
        name: "Capture fixture agent",
        available: false,
        status: "fixture",
        source: "capture-provider",
        fixtureRevision: CAPTURE_FIXTURE_REVISION,
      },
    ],
    source: "capture-provider",
    fixtureRevision: CAPTURE_FIXTURE_REVISION,
  };
}

function fixtureVelaStatus(): object {
  return {
    loggedIn: false,
    sessionState: "signed_out",
    account: null,
    consoleOrigin: null,
    source: "capture-provider",
    fixtureRevision: CAPTURE_FIXTURE_REVISION,
  };
}

/**
 * Install before any route registrar in the daemon. Safe status reads use
 * deterministic fixture payloads; every route that could detect, launch, or
 * contact an external provider receives a structured refusal instead.
 */
export function createCaptureBoundaryMiddleware(
  env: NodeJS.ProcessEnv = process.env,
): RequestHandler {
  return (req, res, next) => {
    if (env.OD_DESIGN_PARITY_CAPTURE !== "1") return next();

    if (req.method === "GET" && req.path === "/agents") {
      if (req.query.stream === "1" || req.query.stream === "true") {
        res.writeHead(200, {
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "Content-Type": "text/event-stream",
        });
        const fixture = fixtureAgentStatus().agents[0];
        res.write(`event: agent\ndata: ${JSON.stringify(fixture)}\n\n`);
        res.write("event: done\ndata: {}\n\n");
        res.end();
        return;
      }
      res.json(fixtureAgentStatus());
      return;
    }

    if (req.method === "GET" && req.path === "/integrations/vela/status") {
      res.json(fixtureVelaStatus());
      return;
    }
    if (req.method === "GET" && req.path === "/amr/models") {
      res.json({ models: [], source: "capture-provider", fixtureRevision: CAPTURE_FIXTURE_REVISION });
      return;
    }

    if (req.method === "GET" && req.path === "/connectors") {
      res.json({ connectors: [], source: "capture-provider", fixtureRevision: CAPTURE_FIXTURE_REVISION });
      return;
    }
    if (req.method === "GET" && req.path === "/connectors/status") {
      res.json({ statuses: [], source: "capture-provider", fixtureRevision: CAPTURE_FIXTURE_REVISION });
      return;
    }
    if (req.method === "GET" && req.path === "/connectors/discovery") {
      res.json({ connectors: [], source: "capture-provider", fixtureRevision: CAPTURE_FIXTURE_REVISION });
      return;
    }

    const apiPath = req.path.startsWith("/api/") ? req.path : `/api${req.path}`;
    if (isInventoriedCaptureRoute(CAPTURE_READ_ROUTE_INVENTORY, req.method, apiPath)) {
      // Every inventoried read receives a deterministic fixture projection;
      // it never falls through to a live database, runtime, provider, or
      // filesystem-backed registrar.
      res.json({
        source: "capture-provider",
        fixtureRevision: CAPTURE_FIXTURE_REVISION,
        data: [],
      });
      return;
    }

    if (
      req.path.startsWith("/integrations/vela/")
      || req.path.startsWith("/connectors/")
      || req.path.startsWith("/mcp/")
    ) {
      res.status(503).json({
        error: "capture.external_runtime_blocked",
        source: "capture-provider",
        fixtureRevision: CAPTURE_FIXTURE_REVISION,
      });
      return;
    }

    if (isInventoriedCaptureRoute(CAPTURE_HANDLER_INVENTORY, req.method, apiPath)) {
      res.status(503).json({
        error: "capture.external_runtime_blocked",
        source: "capture-provider",
        fixtureRevision: CAPTURE_FIXTURE_REVISION,
      });
      return;
    }

    // This middleware is mounted before every registrar. Capture has no safe
    // fallthrough: an unclassified API path must not reach a later handler
    // that can read live state, spawn a process, open a native dialog, write a
    // file, or contact a provider. Ordinary launches continue untouched.
    if (apiPath.startsWith("/api/")) {
      res.status(503).json({
        error: "capture.unclassified_route_blocked",
        method: req.method,
        path: apiPath,
        source: "capture-provider",
        fixtureRevision: CAPTURE_FIXTURE_REVISION,
      });
      return;
    }

    return next();
  };
}
