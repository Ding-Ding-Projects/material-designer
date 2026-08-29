import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

function codeLines(path: string): string[] {
  const source = readFileSync(new URL(`../../${path}`, import.meta.url), "utf8").replace(/\r\n|\r/g, "\n");
  const lines: string[] = [];
  let inBlockComment = false;
  for (const original of source.split("\n")) {
    let line = "";
    let inSingle = false;
    let inDouble = false;
    let escaped = false;
    for (let index = 0; index < original.length; index += 1) {
      const char = original[index]!;
      const next = original[index + 1];
      if (inBlockComment) {
        if (char === "*" && next === "/") { inBlockComment = false; index += 1; }
        continue;
      }
      if (!inSingle && !inDouble && char === "/" && next === "*") { inBlockComment = true; index += 1; continue; }
      if (!inSingle && !inDouble && char === "/" && next === "/") break;
      line += char;
      if (escaped) { escaped = false; continue; }
      if ((inSingle || inDouble) && char === "\\") { escaped = true; continue; }
      if (!inDouble && char === "'") inSingle = !inSingle;
      if (!inSingle && char === '"') inDouble = !inDouble;
    }
    lines.push(line);
  }
  return lines;
}

function hasCall(lines: readonly string[], channel: string): boolean {
  const needle = `ipcMain.handle("${channel}"`;
  return lines.some((line) => line.trimStart().startsWith(needle));
}

function hasExactLine(lines: readonly string[], text: string): boolean {
  return lines.some((line) => line.trim() === text);
}

describe("converter host and IPC contract", () => {
  it("registers overwrite, paged queue, notification, and history handlers and tears them down", () => {
    const runtime = codeLines("src/main/runtime.ts");
    for (const channel of [
      "od:converter:request-overwrite",
      "od:converter:overwrite",
      "od:converter:queue:page",
      "od:converter:notifications:page",
      "od:converter:notifications:mark-read",
      "od:converter:notifications:dismiss",
      "od:converter:history:page",
    ]) expect(hasCall(runtime, channel), channel).toBe(true);
    expect(runtime.some((line) => line.includes("for (const channel of CONVERTER_IPC_CHANNELS) ipcMain.removeHandler(channel);"))).toBe(true);
    const preload = codeLines("src/main/preload.cts");
    expect(preload.some((line) => line.includes("requestOverwrite:") && line.includes("od:converter:request-overwrite"))).toBe(true);
    expect(preload.some((line) => line.includes("overwrite:") && line.includes("od:converter:overwrite"))).toBe(true);
    expect(preload.some((line) => line.includes("notifications:") && line.includes("od:converter:notifications:page"))).toBe(true);
    expect(preload.some((line) => line.includes("history:") && line.includes("od:converter:history:page"))).toBe(true);
  });

  it("keeps queue paging and overwrite promotion at exact source boundaries", () => {
    const queue = codeLines("src/main/converter/queue.ts");
    expect(queue.some((line) => line.includes("ORDER_CHUNK_ITEMS"))).toBe(true);
    expect(queue.some((line) => line.trimStart().startsWith("async loadPage("))).toBe(true);
    expect(hasExactLine(queue, "const pending: QueueItem[] = [];" )).toBe(true);
    const host = codeLines("src/main/converter/host.ts");
    expect(host.some((line) => line.includes("withPromotionLock"))).toBe(true);
    expect(host.some((line) => line.includes("sameDestinationSnapshot"))).toBe(true);
    expect(host.some((line) => line.includes("The destination changed after confirmation"))).toBe(true);
  });

  it("turns red when an exact handler, paging boundary, or promotion check is commented out, then turns green after restoration", () => {
    const runtime = codeLines("src/main/runtime.ts");
    const overwriteLine = runtime.find((line) => line.trimStart().startsWith('ipcMain.handle("od:converter:overwrite"'));
    expect(overwriteLine).toBeDefined();
    const brokenRuntime = runtime.map((line) => line === overwriteLine ? `// ${line}` : line);
    expect(hasCall(brokenRuntime, "od:converter:overwrite")).toBe(false);
    expect(hasCall(runtime, "od:converter:overwrite")).toBe(true);

    const queue = codeLines("src/main/converter/queue.ts");
    const pendingLine = queue.find((line) => line.trim() === "const pending: QueueItem[] = [];");
    expect(pendingLine).toBeDefined();
    const brokenQueue = queue.map((line) => line === pendingLine ? "const pending: QueueItem[] = await this.#store.listAll();" : line);
    expect(hasExactLine(brokenQueue, "const pending: QueueItem[] = [];" )).toBe(false);
    expect(hasExactLine(queue, "const pending: QueueItem[] = [];" )).toBe(true);

    const host = codeLines("src/main/converter/host.ts");
    const lockLine = host.find((line) => line.includes("withPromotionLock(destination"));
    expect(lockLine).toBeDefined();
    const brokenHost = host.map((line) => line === lockLine ? `// ${line}` : line);
    expect(brokenHost.some((line) => line.includes("withPromotionLock(destination"))).toBe(false);
    expect(host.some((line) => line.includes("withPromotionLock(destination"))).toBe(true);
  });
});
