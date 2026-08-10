import { execFile } from "node:child_process";
import { appendFile, mkdir, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import type { ToolPackConfig } from "../config.js";
import { pathExists } from "./fs.js";
import { resolveWinInstallIdentity } from "./identity.js";
import { resolveWinSquirrelInstallRoot, resolveWinSquirrelUpdatePath } from "./paths.js";
import type { WinSquirrelInstalledPaths } from "./types.js";

const execFileAsync = promisify(execFile);
const SQUIRREL_APP_DIRECTORY_PATTERN = /^app-[A-Za-z0-9][A-Za-z0-9._-]*$/;

export async function resolveWinSquirrelInstalledPaths(
  config: Pick<ToolPackConfig, "namespace" | "appVersion">,
): Promise<WinSquirrelInstalledPaths | null> {
  const installDir = resolveWinSquirrelInstallRoot();
  const identity = resolveWinInstallIdentity(config);
  const entries = await readdir(installDir, { withFileTypes: true }).catch(() => []);
  const appDirectories = entries
    .filter((entry) => entry.isDirectory() && SQUIRREL_APP_DIRECTORY_PATTERN.test(entry.name))
    .sort((left, right) => right.name.localeCompare(left.name, undefined, { numeric: true, sensitivity: "base" }));

  for (const appDirectory of appDirectories) {
    const installedExePath = join(installDir, appDirectory.name, identity.exeName);
    if (await pathExists(installedExePath)) {
      return {
        installDir,
        installedExePath,
        updateExePath: resolveWinSquirrelUpdatePath(),
      };
    }
  }
  return null;
}

async function appendSquirrelLog(logPath: string, payload: Record<string, unknown>): Promise<void> {
  await mkdir(dirname(logPath), { recursive: true });
  await appendFile(logPath, `${JSON.stringify({ ...payload, timestamp: new Date().toISOString() })}\n`, "utf8");
}

export async function invokeSquirrel(
  command: string,
  args: string[],
  logPath: string,
  action: "install" | "uninstall",
): Promise<void> {
  await appendSquirrelLog(logPath, { action, args, command, event: "started", installer: "squirrel" });
  try {
    await execFileAsync(command, args, { cwd: dirname(command), windowsHide: true });
    await appendSquirrelLog(logPath, { action, command, event: "finished", installer: "squirrel" });
  } catch (error) {
    const failure = error as { code?: unknown; stderr?: unknown; stdout?: unknown };
    await appendSquirrelLog(logPath, {
      action,
      code: failure.code,
      command,
      event: "failed",
      installer: "squirrel",
      stderr: typeof failure.stderr === "string" ? failure.stderr : undefined,
      stdout: typeof failure.stdout === "string" ? failure.stdout : undefined,
    });
    throw error;
  }
}
