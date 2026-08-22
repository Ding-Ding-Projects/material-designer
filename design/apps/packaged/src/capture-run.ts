import { lstat, open, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, parse, relative, resolve, sep } from "node:path";

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
export const CAPTURE_RUN_FAILURE_RETENTION_MARKER = "failed.json" as const;

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

/**
 * Capture roots are security-sensitive evidence namespaces. Normalize paths
 * lexically, then inspect every existing component before creating anything;
 * realpath() is deliberately not used because resolving first would hide a
 * symlink/reparse component from the check.
 */
async function assertNoReparseComponents(path: string): Promise<void> {
  const absolute = resolve(path);
  const parsed = parse(absolute);
  const root = parsed.root;
  const remainder = absolute.slice(root.length).split(/[\\/]+/).filter(Boolean);
  let current = root;
  for (const component of remainder) {
    current = join(current, component);
    try {
      const stats = await lstat(current);
      if (stats.isSymbolicLink()) {
        throw new Error(`capture.run_reparse_component: refusing symlink component ${current}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
  }
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
  await assertNoReparseComponents(captureRoot);
  await assertNoReparseComponents(dirname(captureRoot));
  await mkdir(dirname(captureRoot), { recursive: true });
  await assertNoReparseComponents(dirname(captureRoot));
  try {
    await mkdir(captureRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  await assertNoReparseComponents(captureRoot);
  await assertNoReparseComponents(root);
  const now = input.now ?? (() => new Date().toISOString());
  let rootCreated = false;
  let lock: Awaited<ReturnType<typeof open>> | null = null;
  const lockPath = join(root, "active.lock");
  try {
    await mkdir(root);
    rootCreated = true;
    await assertNoReparseComponents(root);
    lock = await open(lockPath, "wx");
    await lock.writeFile(JSON.stringify({
      pid: input.pid ?? process.pid,
      routeId: input.routeId,
      runId,
      startedAt: now(),
    }), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error("capture.run_namespace_collision: capture run identity is already present");
    }
    await lock?.close().catch(() => undefined);
    // Preserve only the exact run root that failed. Never retire, overwrite,
    // or remove a sibling run: failure evidence is part of the run's audit
    // trail and a later reviewer can decide when it is safe to clean up.
    if (rootCreated) {
      await writeFile(
        join(root, CAPTURE_RUN_FAILURE_RETENTION_MARKER),
        JSON.stringify({
          policy: CAPTURE_RUN_RETENTION_POLICY,
          failedAt: now(),
          routeId: input.routeId,
          runId,
          error: error instanceof Error ? error.message : String(error),
        }),
        { encoding: "utf8", flag: "wx" },
      ).catch(() => undefined);
    }
    throw error;
  }
  if (lock == null) throw new Error("capture.run_lock_unavailable: lock handle was not opened");
  let retired = false;
  let retireTask: Promise<void> | null = null;
  return {
    lockPath,
    root,
    routeId: input.routeId,
    runId,
    async retire() {
      if (retireTask != null) return await retireTask;
      if (retired) return;
      retired = true;
      retireTask = (async () => {
        await lock!.close();
        try {
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
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        }
      })();
      return await retireTask;
    },
  };
}
