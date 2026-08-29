import { lstat, open, stat, type FileHandle } from "node:fs/promises";
import { isAbsolute, parse, relative, resolve, sep } from "node:path";
import type { DestinationSnapshot } from "./types.js";

export function assertLocalPath(path: string): string {
  if (!isAbsolute(path)) throw new Error("Converter paths must be absolute host paths.");
  const resolved = resolve(path);
  if (resolved.includes("\0")) throw new Error("Converter paths cannot contain NUL bytes.");
  return resolved;
}

export async function assertNoReparsePath(path: string): Promise<void> {
  const resolved = assertLocalPath(path);
  const root = parse(resolved).root;
  const rootInfo = await lstat(root).catch(() => undefined);
  if (rootInfo?.isSymbolicLink()) throw new Error("Converter paths cannot traverse symbolic links or reparse points.");
  const remainder = relative(root, resolved);
  let current = root;
  for (const segment of remainder.split(/[\\/]/).filter(Boolean)) {
    current = `${current.endsWith(sep) ? current : `${current}${sep}`}${segment}`;
    const info = await lstat(current).catch(() => undefined);
    if (info?.isSymbolicLink()) throw new Error("Converter paths cannot traverse symbolic links or reparse points.");
  }
}

export function snapshotForStats(info: { size: number; mtimeMs: number; ctimeMs?: number; dev?: number; ino?: number }): DestinationSnapshot {
  return {
    exists: true,
    size: info.size,
    mtimeMs: info.mtimeMs,
    ...(typeof info.ctimeMs === "number" ? { ctimeMs: info.ctimeMs } : {}),
    ...(typeof info.dev === "number" && typeof info.ino === "number" ? { identity: `${info.dev}:${info.ino}` } : {}),
  };
}

export function sameSnapshot(a: DestinationSnapshot, b: DestinationSnapshot): boolean {
  return a.exists === b.exists && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs && a.identity === b.identity;
}

export function sameIdentity(a: DestinationSnapshot, b: DestinationSnapshot): boolean {
  return typeof a.identity === "string" && a.identity.length > 0 && a.identity === b.identity;
}

export async function openStableFile(path: string): Promise<{ handle: FileHandle; snapshot: DestinationSnapshot }> {
  const checked = assertLocalPath(path);
  await assertNoReparsePath(checked);
  const info = await stat(checked);
  if (!info.isFile()) throw new Error("The stable converter resource is not a regular file.");
  const expected = snapshotForStats(info);
  const handle = await open(checked, "r");
  try {
    const opened = snapshotForStats(await handle.stat());
    await assertNoReparsePath(checked);
    const current = snapshotForStats(await stat(checked));
    if (!sameSnapshot(expected, opened) || !sameSnapshot(current, opened)) throw new Error("The file changed while its stable handle was being opened.");
    return { handle, snapshot: opened };
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  }
}

export async function openStableDirectory(path: string): Promise<{ handle: FileHandle; snapshot: DestinationSnapshot }> {
  const checked = assertLocalPath(path);
  await assertNoReparsePath(checked);
  const info = await stat(checked);
  if (!info.isDirectory()) throw new Error("The stable converter destination parent is not a directory.");
  const expected = snapshotForStats(info);
  const handle = await open(checked, "r");
  try {
    const opened = snapshotForStats(await handle.stat());
    await assertNoReparsePath(checked);
    const current = snapshotForStats(await stat(checked));
    if (!opened.exists || !sameSnapshot(expected, opened) || !sameSnapshot(current, opened)) throw new Error("The destination folder changed while its stable handle was being opened.");
    return { handle, snapshot: opened };
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  }
}
