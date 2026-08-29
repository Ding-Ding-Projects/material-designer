import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { adapterFor, adaptersForCategory, ADAPTER_CATALOG } from "../../src/main/converter/registry.js";
import { createProvenanceBoundAdapters } from "../../src/main/converter/provenance.js";
import { detectSource } from "../../src/main/converter/detect.js";
import { inspectPdf } from "../../src/main/converter/pdf.js";
import { ConversionQueue, exportQueueToFile, FileQueueStore, MemoryQueueStore } from "../../src/main/converter/queue.js";
import { ConverterHost, atomicWrite } from "../../src/main/converter/host.js";
import { OverwriteAuthorizationStore } from "../../src/main/converter/overwrite.js";
import { ConverterAuditStore } from "../../src/main/converter/audit.js";

const encoder = new TextEncoder();
const execFileAsync = promisify(execFile);
async function verifiedTextAdapter() {
  const resources = await mkdtemp(join(tmpdir(), "material-designer-converter-proof-"));
  const resourcePath = join(resources, "adapter.bin");
  const resource = encoder.encode("verified converter resource");
  await writeFile(resourcePath, resource);
  const digest = createHash("sha256").update(resource).digest("hex");
  const adapters = await createProvenanceBoundAdapters(resources, [{ adapterId: "text-structured-local", path: "adapter.bin", version: "test", digest }]);
  await rm(resources, { recursive: true, force: true });
  return adapters.find((adapter) => adapter.id === "text-structured-local")!;
}

async function testHost(): Promise<ConverterHost> {
  return new ConverterHost({ adapters: [await verifiedTextAdapter()] });
}

describe("local converter registry", () => {
  it("keeps every required category visible", () => {
    const categories = new Set(ADAPTER_CATALOG.map((adapter) => adapter.category));
    expect(categories).toEqual(new Set(["documents-pdf", "images", "audio", "video", "archives", "structured-data", "code-text", "binary-encodings"]));
    expect(adaptersForCategory("images").some((adapter) => adapter.unavailableReason != null)).toBe(true);
    expect(adaptersForCategory("audio").some((adapter) => adapter.unavailableReason != null)).toBe(true);
  });
  it("does not enable an adapter without bundled proof", () => {
    for (const adapter of ADAPTER_CATALOG) expect(adapter.bundled).toBe(false);
    const verified = await verifiedTextAdapter();
    expect(verified.bundled).toBe(true);
    expect(verified.packageProof?.kind).toBe("packaged");
  });
  it("advertises only targets implemented by the bounded text adapters", () => {
    expect(adapterFor("structured-data-local")?.targetFormats).toEqual(["txt"]);
    expect(adapterFor("text-structured-local")?.targetFormats).toEqual(["txt", "md", "markdown", "html"]);
    expect(adapterFor("structured-data-local")?.targetFormats).not.toContain("json");
    expect(adapterFor("text-structured-local")?.targetFormats).not.toContain("jsonl");
  });
  it("rejects packaged provenance when the allowlisted bytes or path do not match", async () => {
    const resources = await mkdtemp(join(tmpdir(), "material-designer-converter-proof-reject-"));
    try {
      await writeFile(join(resources, "adapter.bin"), "actual bytes", "utf8");
      await expect(createProvenanceBoundAdapters(resources, [{ adapterId: "text-structured-local", path: "adapter.bin", version: "test", digest: "b".repeat(64) }])).rejects.toThrow("digest");
      await expect(createProvenanceBoundAdapters(resources, [{ adapterId: "text-structured-local", path: "../adapter.bin", version: "test", digest: "b".repeat(64) }])).rejects.toThrow("relative");
    } finally {
      await rm(resources, { recursive: true, force: true });
    }
  });
});

describe("bounded byte detection", () => {
  it("prefers signatures over a misleading extension", () => {
    const result = detectSource(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "wrong.pdf");
    expect(result.format).toBe("png");
    expect(result.confidence).toBe("signature");
  });
  it("uses a text extension only after UTF-8 text inspection", () => {
    expect(detectSource(encoder.encode('{"ok":true}'), "data.json").format).toBe("json");
    expect(detectSource(encoder.encode("廣東話文件"), "notes.txt").format).toBe("txt");
    expect(detectSource(encoder.encode("a: 1"), "data.yml").format).toBe("yaml");
    expect(detectSource(encoder.encode("<p>x</p>"), "page.htm").format).toBe("html");
    expect(detectSource(encoder.encode('{"ok":true}\n'), "data.ndjson").format).toBe("jsonl");
    expect(detectSource(new Uint8Array([0, 1, 2]), "data.json").format).toBe("unknown");
  });
});

describe("PDF inspection", () => {
  it("inspects page count and metadata without emitting synthetic output", () => {
    const source = encoder.encode("%PDF-1.7\n/Title (Test)\n/Type /Page\n/Type /Page\n%%EOF\n");
    const inspected = inspectPdf(source);
    expect(inspected.pages).toHaveLength(2);
    expect(inspected.metadata.title).toBe("Test");
  });
  it("rejects incomplete, encrypted and signed inputs", () => {
    expect(() => inspectPdf(encoder.encode("%PDF\n/Type /Page\n%%EOF"))).toThrow("signature");
    expect(() => inspectPdf(encoder.encode("%PDF-1.7\nno eof"))).toThrow("EOF");
    const base = "%PDF-1.7\n/Type /Page\n%%EOF\n";
    expect(() => inspectPdf(encoder.encode(`${base.replace("%%EOF", "")}/Encrypt 1 0 R\n%%EOF`))).toThrow("Encrypted");
    expect(() => inspectPdf(encoder.encode(`${base.replace("%%EOF", "")}/ByteRange [0 1 2 3]\n%%EOF`))).toThrow("Signed");
  });
  it("caps page records before allocating the page list", () => {
    const source = `%PDF-1.7\n${"/Type /Page\n".repeat(10_001)}%%EOF\n`;
    expect(() => inspectPdf(encoder.encode(source))).toThrow("bounded converter limit");
  });
});

describe("paged bounded conversion queue", () => {
  it("processes pages with bounded active work and resumes paused items", async () => {
    const store = new MemoryQueueStore();
    let peak = 0;
    let active = 0;
    const queue = new ConversionQueue(store, async (item) => { active += 1; peak = Math.max(peak, active); await new Promise((resolve) => setTimeout(resolve, 1)); active -= 1; return { status: "converted", source: item.sourcePath, destination: item.destinationPath, bytes: 1, format: item.targetFormat }; }, 2);
    await Promise.all(Array.from({ length: 25 }, (_, index) => queue.enqueue(`/tmp/in-${index}`, `/tmp/out-${index}`, "txt")));
    await queue.run();
    expect(peak).toBeLessThanOrEqual(2);
    const page = await store.loadPage(undefined, 100);
    expect(page.items).toHaveLength(25);
    expect(page.items.every((item) => item.state === "converted")).toBe(true);
  });
  it("persists queue state and reconciles an interrupted item", async () => {
    const directory = await mkdtemp(join(tmpdir(), "material-designer-converter-"));
    try {
      const store = new FileQueueStore(join(directory, "queue.json"));
      const queue = new ConversionQueue(store, async (item) => ({ status: "converted", source: item.sourcePath, destination: item.destinationPath, bytes: 1, format: item.targetFormat }));
      const item = await queue.enqueue("C:/input.txt", "C:/output.txt", "txt");
      await store.save({ ...item, state: "running" });
      await queue.reconcileAfterRestart();
      const recovered = await queue.listPage(undefined, 10);
      expect(recovered.items[0]?.state).toBe("failed");
      expect(recovered.items[0]?.reason).toContain("previous conversion stopped");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("pages the durable index without reading the complete queue into one array", async () => {
    const directory = await mkdtemp(join(tmpdir(), "material-designer-converter-index-"));
    try {
      const store = new FileQueueStore(join(directory, "queue.jsonl"));
      for (let index = 0; index < 700; index += 1) {
        await store.save({
          id: `item-${String(index).padStart(4, "0")}`,
          adapterId: "text-structured-local",
          sourcePath: `C:/input-${index}.txt`,
          destinationPath: `C:/output-${index}.txt`,
          targetFormat: "txt",
          state: "queued",
          bytesProcessed: 0,
          updatedAt: index + 1,
        });
      }
      const first = await store.loadPage(undefined, 17);
      expect(first.items).toHaveLength(17);
      expect(first.nextCursor).toMatch(/^\d+:\d+$/);
      const second = await store.loadPage(first.nextCursor, 17);
      expect(second.items).toHaveLength(17);
      expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
      await expect(store.loadPage("0:256", 17)).rejects.toThrow("cursor offset is invalid");
      await expect(store.loadPage("99:0", 17)).rejects.toThrow("beyond the indexed records");
      const indexMeta = JSON.parse(await readFile(join(directory, "queue.jsonl.index", "meta.json"), "utf8")) as { nextSequence: number };
      expect(indexMeta.nextSequence).toBe(700);
      expect((await readdir(join(directory, "queue.jsonl.index", "order"))).length).toBeGreaterThan(1);
      await store.compact();
      const compacted = (await readFile(join(directory, "queue.jsonl"), "utf8")).trim().split(/\r?\n/);
      expect(compacted).toHaveLength(700);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rebuilds derived index state from the flushed journal after a crash point", async () => {
    const directory = await mkdtemp(join(tmpdir(), "material-designer-converter-crash-"));
    try {
      let crash = true;
      const store = new FileQueueStore(join(directory, "queue.jsonl"), undefined, {
        afterJournal: async () => {
          if (crash) {
            crash = false;
            throw new Error("simulated derived-state interruption");
          }
        },
      });
      const item = {
        id: "crash-item",
        adapterId: "text-structured-local",
        sourcePath: "C:/input.txt",
        destinationPath: "C:/output.txt",
        targetFormat: "txt",
        state: "queued" as const,
        bytesProcessed: 0,
        updatedAt: 1,
      };
      await expect(store.save(item)).rejects.toThrow("simulated derived-state interruption");
      const recovered = await new FileQueueStore(join(directory, "queue.jsonl")).loadPage(undefined, 10);
      expect(recovered.items).toHaveLength(1);
      expect(recovered.items[0]?.id).toBe(item.id);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("streams a complete queue export with bounded records and rejects repeated cursors", async () => {
    const directory = await mkdtemp(join(tmpdir(), "material-designer-converter-export-"));
    try {
      const store = new MemoryQueueStore();
      for (let index = 0; index < 3; index += 1) await store.save({ id: `export-${index}`, adapterId: "text-structured-local", sourcePath: `C:/in-${index}.txt`, destinationPath: `C:/out-${index}.txt`, targetFormat: "txt", state: "queued", bytesProcessed: 0, updatedAt: index });
      const result = await exportQueueToFile(store, join(directory, "queue.jsonl"), { maxItems: 3, maxBytes: 20_000 });
      expect(result.items).toBe(3);
      expect((await readFile(result.destination, "utf8")).trim().split(/\r?\n/)).toHaveLength(4);
      const repeated: import("../../src/main/converter/queue.js").QueueStore = {
        async loadPage() { return { items: [], nextCursor: "0" }; },
        async save() { return undefined; },
      };
      await expect(exportQueueToFile(repeated, join(directory, "repeated.jsonl"), { maxItems: 5 })).rejects.toThrow("repeated cursor");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("ignores only an incomplete final journal tail and rejects earlier corruption", async () => {
    const directory = await mkdtemp(join(tmpdir(), "material-designer-converter-tail-"));
    try {
      const path = join(directory, "queue.jsonl");
      const record = { id: "tail-item", adapterId: "text-structured-local", sourcePath: "C:/input.txt", destinationPath: "C:/output.txt", targetFormat: "txt", state: "queued", bytesProcessed: 0, updatedAt: 1 };
      await writeFile(path, `${JSON.stringify(record)}\n{"item":`, "utf8");
      const tail = await new FileQueueStore(path).loadPage(undefined, 10);
      expect(tail.items).toHaveLength(1);
      await appendFile(path, "\n", "utf8");
      await expect(new FileQueueStore(path).loadPage(undefined, 10)).rejects.toThrow("malformed state");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("host conversion progress and exclusive replacement", () => {
  it("requires a current one-use loss disclosure acknowledgement", async () => {
    const directory = await mkdtemp(join(tmpdir(), "material-designer-converter-disclosure-"));
    try {
      const sourcePath = join(directory, "input.txt");
      const destinationPath = join(directory, "output.html");
      await writeFile(sourcePath, "lossy input", "utf8");
      const host = await testHost();
      const preview = await host.preview(sourcePath, destinationPath, "text-structured-local", "html");
      expect(preview.lossy).toBe(true);
      expect((await host.convert(preview)).status).toBe("failed");
      const acknowledgement = host.acknowledgeDisclosure(preview, 10_000);
      const converted = await host.convert(preview, undefined, undefined, acknowledgement.token);
      expect(converted.status).toBe("converted");
      expect((await host.convert(preview, undefined, undefined, acknowledgement.token)).status).toBe("failed");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("binds acknowledgement to the preview fingerprint and refuses source or destination drift", async () => {
    const directory = await mkdtemp(join(tmpdir(), "material-designer-converter-drift-"));
    try {
      const sourcePath = join(directory, "input.txt");
      const destinationPath = join(directory, "output.html");
      await writeFile(sourcePath, "first", "utf8");
      const host = await testHost();
      const preview = await host.preview(sourcePath, destinationPath, "text-structured-local", "html");
      const acknowledgement = host.acknowledgeDisclosure(preview);
      await writeFile(sourcePath, "second", "utf8");
      expect((await host.convert(preview, undefined, undefined, acknowledgement.token)).status).toBe("failed");

      await writeFile(sourcePath, "first", "utf8");
      const fresh = await host.preview(sourcePath, destinationPath, "text-structured-local", "html");
      const freshAcknowledgement = host.acknowledgeDisclosure(fresh);
      await writeFile(destinationPath, "already here", "utf8");
      expect((await host.convert(fresh, undefined, undefined, freshAcknowledgement.token)).status).toBe("failed");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("reports incremental source-byte progress for an enabled adapter", async () => {
    const directory = await mkdtemp(join(tmpdir(), "material-designer-converter-progress-"));
    try {
      const sourcePath = join(directory, "input.txt");
      const destinationPath = join(directory, "output.txt");
      await writeFile(sourcePath, "a".repeat(256 * 1024), "utf8");
      const host = await testHost();
      const preview = await host.preview(sourcePath, destinationPath, "text-structured-local", "txt");
      const progress: number[] = [];
      const result = await host.convert(preview, undefined, (value) => progress.push(value.bytesProcessed));
      expect(result.status).toBe("converted");
      expect(progress.length).toBeGreaterThan(2);
      expect(progress[0]).toBe(0);
      expect(progress.at(-1)).toBe(256 * 1024);
      expect((await stat(destinationPath)).isFile()).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("requires a host-issued one-use authorization and refuses a changed destination", async () => {
    const directory = await mkdtemp(join(tmpdir(), "material-designer-converter-overwrite-"));
    try {
      const sourcePath = join(directory, "input.txt");
      const destinationPath = join(directory, "output.txt");
      await writeFile(sourcePath, "new bytes", "utf8");
      await writeFile(destinationPath, "old bytes", "utf8");
      const host = await testHost();
      const preview = await host.preview(sourcePath, destinationPath, "text-structured-local", "txt");
      const authorizer = new OverwriteAuthorizationStore({ now: () => 10_000, ttlMs: 60_000 });
      const challenge = await authorizer.issue({ sourcePath, destinationPath, adapterId: preview.adapterId, targetFormat: preview.targetFormat });
      await writeFile(destinationPath, "changed by another writer", "utf8");
      await expect(authorizer.consume(challenge.token, { sourcePath, destinationPath, adapterId: preview.adapterId, targetFormat: preview.targetFormat })).rejects.toThrow("changed after confirmation");

      await writeFile(destinationPath, "old bytes", "utf8");
      const freshChallenge = await authorizer.issue({ sourcePath, destinationPath, adapterId: preview.adapterId, targetFormat: preview.targetFormat });
      const authorization = await authorizer.consume(freshChallenge.token, { sourcePath, destinationPath, adapterId: preview.adapterId, targetFormat: preview.targetFormat });
      const result = await host.convertAuthorized(preview, authorization);
      expect(result.status).toBe("converted");
      expect(await readFile(destinationPath, "utf8")).toBe("new bytes");
      await expect(authorizer.consume(freshChallenge.token, { sourcePath, destinationPath, adapterId: preview.adapterId, targetFormat: preview.targetFormat })).rejects.toThrow("unknown or already used");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("refuses same-file conversion and paths outside an allowed root", async () => {
    const directory = await mkdtemp(join(tmpdir(), "material-designer-converter-paths-"));
    const outside = await mkdtemp(join(tmpdir(), "material-designer-converter-outside-"));
    try {
      const sourcePath = join(directory, "input.txt");
      await writeFile(sourcePath, "source", "utf8");
      const host = new ConverterHost({ allowedRoot: directory, adapters: [await verifiedTextAdapter()] });
      await expect(host.preview(sourcePath, sourcePath, "text-structured-local", "txt")).rejects.toThrow("different files");
      await expect(host.preview(join(outside, "input.txt"), join(directory, "output.txt"), "text-structured-local", "txt")).rejects.toThrow("outside the converter's selected folder");
    } finally {
      await rm(directory, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("cancels before reading and does not create output", async () => {
    const directory = await mkdtemp(join(tmpdir(), "material-designer-converter-cancel-"));
    try {
      const sourcePath = join(directory, "input.txt");
      const destinationPath = join(directory, "output.txt");
      await writeFile(sourcePath, "cancel me", "utf8");
      const host = await testHost();
      const preview = await host.preview(sourcePath, destinationPath, "text-structured-local", "txt");
      const controller = new AbortController();
      controller.abort();
      const result = await host.convert(preview, controller.signal);
      expect(result.status).toBe("cancelled");
      await expect(stat(destinationPath)).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("promotes concurrent new destinations exclusively", async () => {
    const directory = await mkdtemp(join(tmpdir(), "material-designer-converter-exclusive-"));
    try {
      const destinationPath = join(directory, "output.txt");
      const outcomes = await Promise.allSettled([
        atomicWrite(destinationPath, encoder.encode("first")),
        atomicWrite(destinationPath, encoder.encode("second")),
      ]);
      expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
      expect(["first", "second"]).toContain(await readFile(destinationPath, "utf8"));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("keeps notifications durable and records redacted converter mutations in local Git history", async () => {
    const directory = await mkdtemp(join(tmpdir(), "material-designer-converter-audit-"));
    try {
      const audit = new ConverterAuditStore(directory);
      const notification = await audit.notify({ severity: "info", title: "Conversion queued", body: "A local queue record was saved." });
      expect(notification.ok).toBe(true);
      if (!notification.ok) return;
      const before = await audit.notificationsPage(undefined, 10);
      expect(before.ok).toBe(true);
      if (before.ok) expect(before.value.items[0]?.id).toBe(notification.value.id);
      expect((await audit.dismiss([notification.value.id])).ok).toBe(true);
      const after = await audit.notificationsPage(undefined, 10);
      expect(after.ok).toBe(true);
      if (after.ok) expect(after.value.items[0]?.dismissedAt).toBeTypeOf("number");
      const history = await audit.recordMutation({ action: "conversion", summary: "Converted a local text record without storing source bytes." });
      expect(history.ok).toBe(true);
      if (history.ok) {
        expect(history.value.revision).toMatch(/^[0-9a-f]{40}$/);
        const page = await audit.historyPage(undefined, 10);
        expect(page.ok).toBe(true);
        if (page.ok) {
          expect(page.value.items[0]?.summary).not.toContain("bytes:");
          const revisionEvent = page.value.items.find((item) => item.revision != null);
          expect(revisionEvent?.revision).toMatch(/^[0-9a-f]{40}$/);
          if (revisionEvent?.revision) await execFileAsync("git", ["cat-file", "-e", `${revisionEvent.revision}^{commit}`], { cwd: join(directory, "history", "git"), windowsHide: true });
        }
        const gitRoot = join(directory, "history", "git");
        const workTree = await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: gitRoot, windowsHide: true });
        expect(workTree.stdout.trim()).toBe("true");
        const tracked = await execFileAsync("git", ["ls-tree", "-r", "--name-only", "HEAD"], { cwd: gitRoot, windowsHide: true });
        expect(tracked.stdout).toContain("items/");
        expect(tracked.stdout).toContain("order.jsonl");
        const historyOrder = join(gitRoot, "order.jsonl");
        await appendFile(historyOrder, '{"id":"incomplete-tail"', "utf8");
        const tailPage = await audit.historyPage(undefined, 10);
        expect(tailPage.ok).toBe(true);
        await appendFile(historyOrder, "\n", "utf8");
        expect((await audit.historyPage(undefined, 10)).ok).toBe(false);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
