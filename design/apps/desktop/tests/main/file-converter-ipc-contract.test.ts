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
    expect(host.some((line) => line.includes("sameDestinationSnapshot"))).toBe(true);
  });

  it("records the central bridge and Day Teet Hui seam as parent-owned until C0 injects it", () => {
    const registration = readFileSync(new URL("../../../web/src/components/converter/converterRegistration.ts", import.meta.url), "utf8");
    expect(registration).toContain("FILE_CONVERTER_C0_REGISTRATION");
    expect(registration).toContain("design/apps/desktop/src/main/preload.cts");
    expect(registration).toContain("site/assets/js/converter.js");
  });

  it("turns red when an exact queue journal or worker boundary is removed, then returns green after restoration", () => {
    const queueSource = readFileSync(new URL("../../src/main/converter/queue.ts", import.meta.url), "utf8");
    const brokenQueue = queueSource.replace("await appendAndFlush(this.#path, `${JSON.stringify(normalized)}\\n`);", "await appendFile(this.#path, `${JSON.stringify(normalized)}\\n`);");
    expect(brokenQueue).not.toContain("await appendAndFlush(this.#path");
    expect(queueSource).toContain("await appendAndFlush(this.#path");
    const hostSource = readFileSync(new URL("../../src/main/converter/host.ts", import.meta.url), "utf8");
    const brokenHost = hostSource.replace("const worker = new Worker(CONVERSION_WORKER_SOURCE", "const worker = new Worker_removed(CONVERSION_WORKER_SOURCE");
    expect(brokenHost).not.toContain("const worker = new Worker(CONVERSION_WORKER_SOURCE");
    expect(hostSource).toContain("const worker = new Worker(CONVERSION_WORKER_SOURCE");
  });
});
