import type {
  OpenDesignHostActionResult,
  OpenDesignHostUpdaterPrepareQuitResponse,
  OpenDesignHostUpdaterSavePreparation,
} from "@open-design/host";

export type UpdateActionRequest = {
  force: boolean;
  source: string | null;
};

export type UpdateRestartSafety =
  | { activeRunCount: 0; state: "clear" }
  | { activeRunCount: number; state: "blocked" }
  | { activeRunCount: null; reason: string; state: "unknown" };

export const UPDATE_RESTART_BLOCKED_ERROR_CODE = "active-runs-blocked";
export const UPDATE_RESTART_UNKNOWN_ERROR_CODE = "active-runs-unknown";
export const UPDATE_RENDERER_SAVE_FAILED_ERROR_CODE = "renderer-save-failed";
export const UPDATE_RENDERER_SAVE_UNAVAILABLE_ERROR_CODE = "renderer-save-unavailable";

const MAX_RENDERER_SAVE_REASON_LENGTH = 120;

function parseRendererSavePreparation(input: unknown): OpenDesignHostUpdaterSavePreparation | null {
  if (!isRecord(input)) return null;
  if (input.state === "clean" || input.state === "saved") return { state: input.state };
  if (
    input.state === "failed"
    && typeof input.reason === "string"
    && input.reason.length > 0
    && input.reason.length <= MAX_RENDERER_SAVE_REASON_LENGTH
    && /^[a-z0-9:_-]+$/i.test(input.reason)
  ) {
    return { reason: input.reason, state: "failed" };
  }
  return null;
}

/** Parse the untrusted response crossing from the renderer into main. */
export function parseUpdateRendererSavePreparationResponse(
  input: unknown,
): OpenDesignHostUpdaterPrepareQuitResponse | null {
  if (!isRecord(input)) return null;
  if (
    typeof input.requestId !== "string"
    || input.requestId.length === 0
    || input.requestId.length > 80
    || !/^[a-z0-9_-]+$/i.test(input.requestId)
  ) {
    return null;
  }
  const preparation = parseRendererSavePreparation(input.preparation);
  return preparation == null ? null : { preparation, requestId: input.requestId };
}

export function updateRendererSavePreparationError(
  preparation: Extract<OpenDesignHostUpdaterSavePreparation, { state: "failed" }>,
  code: string = UPDATE_RENDERER_SAVE_FAILED_ERROR_CODE,
): OpenDesignHostActionResult {
  return {
    details: {
      preparation: preparation.state,
      reason: preparation.reason,
    },
    ok: false,
    reason: code,
  };
}

/**
 * The force flag belongs to daemon-run preflight only. It is deliberately
 * accepted here so the seam test can exercise the forced path, but it never
 * changes the renderer save decision.
 */
export function updateQuitDecisionAfterRendererSave(
  preparation: OpenDesignHostUpdaterSavePreparation,
  _force: boolean,
): OpenDesignHostActionResult {
  if (preparation.state === "failed") {
    const unavailable =
      preparation.reason === "renderer-save-preparation-unavailable"
      || preparation.reason === "renderer-save-preparation-timeout"
      || preparation.reason === "renderer-save-preparation-closed";
    return updateRendererSavePreparationError(
      preparation,
      unavailable ? UPDATE_RENDERER_SAVE_UNAVAILABLE_ERROR_CODE : UPDATE_RENDERER_SAVE_FAILED_ERROR_CODE,
    );
  }
  return { ok: true };
}

/** Await the renderer barrier before scheduling the actual process quit. */
export async function finishUpdateQuitAfterRendererSave(input: {
  force: boolean;
  prepare: () => Promise<OpenDesignHostUpdaterSavePreparation>;
  requestQuit: () => void;
}): Promise<OpenDesignHostActionResult> {
  let preparation: OpenDesignHostUpdaterSavePreparation;
  try {
    preparation = await input.prepare();
  } catch {
    preparation = { reason: "renderer-save-preparation-failed", state: "failed" };
  }
  const decision = updateQuitDecisionAfterRendererSave(preparation, input.force);
  if (!decision.ok) return decision;
  input.requestQuit();
  return decision;
}

export function updateRestartSafetyError(safety: Exclude<UpdateRestartSafety, { state: "clear" }>): {
  code: string;
  details: { activeRunCount: number | null };
  message: string;
} {
  if (safety.state === "blocked") {
    return {
      code: UPDATE_RESTART_BLOCKED_ERROR_CODE,
      details: { activeRunCount: safety.activeRunCount },
      message: `Material Designer is still working on ${safety.activeRunCount} active task${safety.activeRunCount === 1 ? "" : "s"}.`,
    };
  }
  return {
    code: UPDATE_RESTART_UNKNOWN_ERROR_CODE,
    details: { activeRunCount: null },
    message: "Material Designer could not confirm whether tasks are still running.",
  };
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

export function parseUpdateActionRequest(input: unknown): UpdateActionRequest {
  if (!isRecord(input) || !isRecord(input.payload)) return { force: false, source: null };
  const source = input.payload.source;
  return {
    force: input.payload.force === true,
    source:
      typeof source === "string" && source.length > 0 && source.length <= 80 && /^[a-z0-9:_-]+$/i.test(source)
        ? source
        : null,
  };
}

export async function checkUpdateRestartSafety(input: {
  discoverDaemonBaseUrl: () => Promise<string>;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}): Promise<UpdateRestartSafety> {
  try {
    const baseUrl = (await input.discoverDaemonBaseUrl()).replace(/\/$/, "");
    if (baseUrl.length === 0) throw new Error("daemon URL is unavailable");
    const response = await (input.fetchImpl ?? fetch)(`${baseUrl}/api/runs?status=active`, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(input.timeoutMs ?? 1500),
    });
    if (!response.ok) throw new Error(`active runs request failed with ${response.status}`);
    const payload: unknown = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.runs)) {
      throw new Error("active runs response is invalid");
    }
    const activeRunCount = payload.runs.length;
    return activeRunCount === 0
      ? { activeRunCount: 0, state: "clear" }
      : { activeRunCount, state: "blocked" };
  } catch (error) {
    return {
      activeRunCount: null,
      reason: error instanceof Error ? error.message : String(error),
      state: "unknown",
    };
  }
}
