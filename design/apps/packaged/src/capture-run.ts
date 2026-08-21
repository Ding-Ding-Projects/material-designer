import { open, mkdir, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

import {
  validateDeterministicParityCaptureRunId,
} from "@open-design/desktop/main";

/**
 * Capture run directories are evidence roots, not disposable caches. Retire
 * only the exact run lease after shutdown; keep the bytes until an explicit
 * evidence-retention cleanup proves that the run is no longer referenced.
 */
export const CAPTURE_RUN_RETENTION_POLICY =
  "retain-evidence-until-explicit-review-cleanup" as const;

export type DeterministicParityCaptureRunLease = {
  readonly routeId: string;
  readonly runId: string;
  readonly root: string;
  readonly lockPath: string;
  retire(): Promise<void>;
};

function isWithinRoot(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate);
  return relativePath.length > 0
    && relativePath !== ".."
    && !relativePath.startsWith(`..${sep}`)
    && !relativePath.startsWith("../");
}

export async function acquireDeterministicParityCaptureRun(input: {
  captureRoot: string;
  routeId: string;
  runId: string;
  pid?: number;
  now?: () => string;
}): Promise<DeterministicParityCaptureRunLease> {
  const runId = validateDeterministicParityCaptureRunId(input.runId);
  const captureRoot = resolve(input.captureRoot);
  const root = resolve(join(captureRoot, runId));
  if (!isWithinRoot(captureRoot, root)) {
    throw new Error("capture.run_namespace_invalid: run namespace escaped the capture root");
  }
  await mkdir(captureRoot, { recursive: true });
  try {
    await mkdir(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error("capture.run_namespace_collision: capture run identity is already present");
    }
    throw error;
  }

  const lockPath = join(root, "active.lock");
  const lock = await open(lockPath, "wx");
  const now = input.now ?? (() => new Date().toISOString());
  await lock.writeFile(JSON.stringify({
    pid: input.pid ?? process.pid,
    routeId: input.routeId,
    runId,
    startedAt: now(),
  }), "utf8");
  let retired = false;
  return {
    lockPath,
    root,
    routeId: input.routeId,
    runId,
    async retire() {
      if (retired) return;
      retired = true;
      await lock.close();
      await writeFile(
        join(root, "retired.json"),
        JSON.stringify({
          policy: CAPTURE_RUN_RETENTION_POLICY,
          retiredAt: now(),
          routeId: input.routeId,
          runId,
        }),
        { encoding: "utf8", flag: "wx" },
      );
    },
  };
}
