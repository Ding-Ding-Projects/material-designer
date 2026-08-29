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
  it("keeps queue paging, disclosure acknowledgement, and stable destination seams at exact source boundaries", () => {
    const queue = codeLines("src/main/converter/queue.ts");
    expect(queue.some((line) => line.includes("ORDER_CHUNK_ITEMS"))).toBe(true);
    expect(queue.some((line) => line.trimStart().startsWith("async loadPage("))).toBe(true);
    expect(hasExactLine(queue, "const pending: QueueItem[] = [];" )).toBe(true);
    expect(queue.some((line) => line.includes("appendAndFlush(this.#path"))).toBe(true);
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

  it("turns red when the exact queue journal boundary is removed, then returns green after restoration", () => {
    const queueSource = readFileSync(new URL("../../src/main/converter/queue.ts", import.meta.url), "utf8");
    const brokenQueue = queueSource.replace("await appendAndFlush(this.#path, `${frameJournalItem(normalized)}\\n`);", "await appendFile(this.#path, `${frameJournalItem(normalized)}\\n`);");
    expect(brokenQueue).not.toContain("await appendAndFlush(this.#path");
    expect(queueSource).toContain("await appendAndFlush(this.#path");
  });

  it("requires stable opened-handle identity for provenance and queue export, and keeps the Windows refusal explicit", () => {
    const provenance = readFileSync(new URL("../../src/main/converter/provenance.ts", import.meta.url), "utf8");
    expect(provenance).toContain("openStableFile(resourcePath)");
    expect(provenance).toContain("opened.handle.stat()");
    expect(provenance).toContain("sameSnapshot(opened.snapshot, afterHandle)");
    const queue = readFileSync(new URL("../../src/main/converter/queue.ts", import.meta.url), "utf8");
    expect(queue).toContain("openStableDirectory(dirname(destination))");
    expect(queue).toContain("sameIdentity(parent.snapshot");
    expect(queue).toContain("assertHandleRelativeWriteSupport()");
    const pathSafety = readFileSync(new URL("../../src/main/converter/path-safety.ts", import.meta.url), "utf8");
    expect(pathSafety).toContain("handle-relative no-reparse creation");
  });
});
