import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";

type ExposedHost = {
  converter: {
    preview(sourceHandle: string, destinationHandle: string, adapterId: string, targetFormat: string): Promise<unknown>;
    acknowledgeDisclosure(previewId: string): Promise<unknown>;
    queue: { export(destinationHandle: string): Promise<unknown> };
  };
  authenticator: { list(query?: string): Promise<unknown> };
  unlockLadder: { issue(lockoutId: string): Promise<unknown> };
};

describe("desktop preload executable host seam", () => {
  it("exposes the current host methods and forwards exact IPC argument shapes", async () => {
    const exposeInMainWorld = vi.fn();
    const invoke = vi.fn(async (channel: string, ...args: unknown[]) => ({ args, channel }));
    const electron = {
      contextBridge: { exposeInMainWorld },
      ipcRenderer: { invoke, on: vi.fn(), send: vi.fn() },
    };
    const source = readFileSync(new URL("../../src/main/preload.cts", import.meta.url), "utf8");
    const compiled = transpileModule(source, {
      compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2024 },
      fileName: "preload.cts",
    }).outputText;
    const exports = {};
    const execute = new Function("require", "exports", "module", "window", "CustomEvent", compiled);
    execute(
      (specifier: string) => {
        if (specifier === "electron") return electron;
        throw new Error(`Unexpected preload require: ${specifier}`);
      },
      exports,
      { exports },
      { dispatchEvent: vi.fn() },
      class { constructor(readonly type: string) {} },
    );
    const host = exposeInMainWorld.mock.calls.find(([name]) => name === "__od__")?.[1] as ExposedHost | undefined;
    expect(host).toBeDefined();

    await expect(host!.converter.preview("source-1", "destination-1", "image-png", "png")).resolves.toEqual({
      args: [{ adapterId: "image-png", destinationHandle: "destination-1", sourceHandle: "source-1", targetFormat: "png" }],
      channel: "od:converter:preview",
    });
    await expect(host!.converter.acknowledgeDisclosure("preview-1")).resolves.toEqual({ args: ["preview-1"], channel: "od:converter:acknowledge-disclosure" });
    await expect(host!.converter.queue.export("destination-1")).resolves.toEqual({ args: ["destination-1"], channel: "od:converter:queue:export" });
    await expect(host!.authenticator.list("Example")).resolves.toEqual({ args: ["Example"], channel: "od:authenticator:list" });
    await expect(host!.unlockLadder.issue("lockout-1")).resolves.toEqual({ args: ["lockout-1"], channel: "od:unlock-ladder:issue" });
  });
});
