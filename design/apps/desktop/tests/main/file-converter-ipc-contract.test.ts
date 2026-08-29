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

function hasExactLine(lines: readonly string[], text: string): boolean {
  return lines.some((line) => line.trim() === text);
}

describe("converter host and IPC contract", () => {
  it("keeps queue paging, worker isolation, disclosure acknowledgement, and promotion at exact source boundaries", () => {
    const queue = codeLines("src/main/converter/queue.ts");
    expect(queue.some((line) => line.includes("ORDER_CHUNK_ITEMS"))).toBe(true);
    expect(queue.some((line) => line.trimStart().startsWith("async loadPage("))).toBe(true);
    expect(hasExactLine(queue, "const pending: QueueItem[] = [];" )).toBe(true);
    expect(queue.some((line) => line.includes("appendAndFlush(this.#path"))).toBe(true);
    const host = codeLines("src/main/converter/host.ts");
    expect(host.some((line) => line.includes("new Worker(CONVERSION_WORKER_SOURCE"))).toBe(true);
    expect(host.some((line) => line.includes("#consumeDisclosure"))).toBe(true);
    expect(host.some((line) => line.includes("withPromotionLock(destination"))).toBe(true);
    expect(host.some((line) => line.includes("sameSnapshot"))).toBe(true);
    const pathSafety = codeLines("src/main/converter/path-safety.ts");
    expect(pathSafety.some((line) => line.includes("openStableFile"))).toBe(true);
    expect(pathSafety.some((line) => line.includes("openStableDirectory"))).toBe(true);
  });

  it("records the central bridge and documentation website seam as parent-owned until C0 injects it", () => {
    const registration = readFileSync(new URL("../../../web/src/components/converter/converterRegistration.ts", import.meta.url), "utf8");
    expect(registration).toContain("FILE_CONVERTER_C0_REGISTRATION");
    expect(registration).toContain("design/apps/desktop/src/main/preload.cts");
    expect(registration).toContain("site/assets/js/converter.js");
  });

  it("turns red when an exact queue journal or worker boundary is removed, then returns green after restoration", () => {
    const queueSource = readFileSync(new URL("../../src/main/converter/queue.ts", import.meta.url), "utf8");
    const brokenQueue = queueSource.replace("await appendAndFlush(this.#path, `${frameJournalItem(normalized)}\\n`);", "await appendFile(this.#path, `${frameJournalItem(normalized)}\\n`);");
    expect(brokenQueue).not.toContain("await appendAndFlush(this.#path");
    expect(queueSource).toContain("await appendAndFlush(this.#path");
    const hostSource = readFileSync(new URL("../../src/main/converter/host.ts", import.meta.url), "utf8");
    const brokenHost = hostSource.replace("const worker = new Worker(CONVERSION_WORKER_SOURCE", "const worker = new Worker_removed(CONVERSION_WORKER_SOURCE");
    expect(brokenHost).not.toContain("const worker = new Worker(CONVERSION_WORKER_SOURCE");
    expect(hostSource).toContain("const worker = new Worker(CONVERSION_WORKER_SOURCE");
  });

  it("keeps worker cancellation, timeout, late-result, item, recursion, expansion, and memory boundaries exact", () => {
    const hostSource = readFileSync(new URL("../../src/main/converter/host.ts", import.meta.url), "utf8");
    const required = [
      "void worker.terminate()",
      "workerData.maxItems",
      "workerData.maxRecursionDepth",
      "if (settled || signal?.aborted) return",
      "message.output.byteLength > maxMemoryBytes - inputBytes",
      "resourceLimits:",
      "The converter adapter exceeded its CPU time bound.",
      "Conversion was cancelled.",
      "The converter item limit was exceeded.",
      "The converter worker output exceeded the bounded memory or output limit.",
      "The converter text workspace exceeds the conservative memory bound.",
      "Conversion options exceed the recursion bound.",
      "transferList: [inputBuffer]",
      "before output promotion",
      "encodeHex",
      "encodeBase64",
      "encodeText",
    ];
    for (const marker of required) expect(hostSource).toContain(marker);
    const brokenTermination = hostSource.replace("void worker.terminate();", "void worker.terminate_removed();");
    expect(brokenTermination).not.toContain("void worker.terminate();");
    expect(hostSource).toContain("void worker.terminate();");
    const brokenItemBound = hostSource.replace("workerData.maxItems", "workerData.maxItems_removed");
    expect(brokenItemBound).not.toContain("workerData.maxItems)");
    expect(hostSource).toContain("workerData.maxItems)");
    const brokenLateResult = hostSource.replace("if (settled || signal?.aborted) return;", "if (settled) return;");
    expect(brokenLateResult).not.toContain("if (settled || signal?.aborted) return;");
    expect(hostSource).toContain("if (settled || signal?.aborted) return;");
  });

  it("requires stable opened-handle identity for provenance and queue export, and keeps the Windows refusal explicit", () => {
    const provenance = readFileSync(new URL("../../src/main/converter/provenance.ts", import.meta.url), "utf8");
    expect(provenance).toContain("openStableFile(resourcePath)");
    expect(provenance).toContain("opened.handle.stat()");
    expect(provenance).toContain("sameSnapshot(opened.snapshot, afterHandle)");
    const queue = readFileSync(new URL("../../src/main/converter/queue.ts", import.meta.url), "utf8");
    expect(queue).toContain("openStableDirectory(dirname(destination))");
    expect(queue).toContain("sameIdentity(parent.snapshot");
    expect(queue).toContain("handle-relative no-reparse destination creation");
  });
});
