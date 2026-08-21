import type { RequestHandler } from "express";

/**
 * Hand-written capture boundary inventory. This is intentionally explicit:
 * adding a new process-launching or external-provider route requires adding
 * its path here, instead of letting a discovery-only guard silently miss it.
 */
export const CAPTURE_HANDLER_INVENTORY = [
  "POST /api/runs",
  "POST /api/chat",
  "POST /api/integrations/vela/login",
  "POST /api/integrations/vela/login/cancel",
  "POST /api/integrations/vela/api-proxy/*",
  "POST /api/integrations/vela/message-center/*",
  "POST /api/connectors/:connectorId/connect",
  "POST /api/connectors/auth-configs/prepare",
  "POST /api/tools/connectors/execute",
  "POST /api/projects/:id/terminals",
  "POST /api/projects/:id/browser-sessions",
  "POST /api/mcp/oauth/start",
  "POST /api/mcp/install/codex",
  "POST /api/agents/:agentId/oauth-launch",
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
  "CODEX_HOME",
  "CLAUDE_CONFIG_DIR",
  "OPENCODE_TEST_HOME",
  "VP_HOME",
  "OPEN_DESIGN_AMR_PROFILE",
  "OD_DESIGN_PARITY_CAPTURE",
] as const;

export const CAPTURE_FIXTURE_REVISION = "material-designer-m3-v2" as const;

const EXTERNAL_METHOD_PREFIXES = [
  "POST /api/runs",
  "POST /api/chat",
  "POST /api/integrations/vela/",
  "PUT /api/integrations/vela/",
  "DELETE /api/integrations/vela/",
  "POST /api/connectors/",
  "PUT /api/connectors/",
  "DELETE /api/connectors/",
  "POST /api/tools/connectors/execute",
  "POST /api/projects/",
  "DELETE /api/projects/",
  "POST /api/mcp/",
  "DELETE /api/mcp/",
  "POST /api/agents/",
] as const;

function requestKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

function isExternalCaptureRequest(method: string, path: string): boolean {
  const key = requestKey(method, path.startsWith("/api/") ? path : `/api${path}`);
  return EXTERNAL_METHOD_PREFIXES.some((prefix) => key === prefix || key.startsWith(prefix));
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

    if (isExternalCaptureRequest(req.method, req.path)) {
      res.status(503).json({
        error: "capture.external_runtime_blocked",
        source: "capture-provider",
        fixtureRevision: CAPTURE_FIXTURE_REVISION,
      });
      return;
    }

    return next();
  };
}
