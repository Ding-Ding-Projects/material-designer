import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  assertWindowsConverterWriterExecutable,
  buildWindowsConverterWriter,
  WINDOWS_CONVERTER_WRITER_FILE,
} from "../src/win/converter-writer.js";

const roots: string[] = [];

function x64PeFixture(): Buffer {
  const bytes = Buffer.alloc(1024);
  bytes[0] = 0x4d;
  bytes[1] = 0x5a;
  bytes.writeUInt32LE(0x80, 0x3c);
  bytes.write("PE\0\0", 0x80, "binary");
  bytes.writeUInt16LE(0x8664, 0x84);
  return bytes;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("Windows converter writer packaging producer", () => {
  it("materializes the fixed executable and provenance manifest from the exact source", async () => {
    const root = await mkdtemp(join(tmpdir(), "material-designer-converter-writer-pack-"));
    roots.push(root);
    const sourcePath = join(root, "converter-writer.cpp");
    const source = Buffer.alloc(2048, 0x63);
    await writeFile(sourcePath, source);
    const outputResourceRoot = join(root, "resources", "open-design");
    const manifest = await buildWindowsConverterWriter({
      outputResourceRoot,
      sourcePath,
      compile: async ({ executablePath }) => {
        await writeFile(executablePath, x64PeFixture());
      },
    });
    const executablePath = join(outputResourceRoot, "bin", "converter-writer", WINDOWS_CONVERTER_WRITER_FILE);
    const writtenManifest = JSON.parse(
      await readFile(join(outputResourceRoot, "bin", "converter-writer", "manifest.json"), "utf8"),
    ) as typeof manifest;
    expect(manifest).toEqual(writtenManifest);
    expect(manifest.bytes).toBe(1024);
    expect(manifest.file).toBe(WINDOWS_CONVERTER_WRITER_FILE);
    expect(manifest.protocolVersion).toBe(1);
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.sha256).toBe(createHash("sha256").update(await readFile(executablePath)).digest("hex"));
    expect(manifest.sourceSha256).toBe(createHash("sha256").update(source).digest("hex"));
  });

  it("refuses a compiler result that is not a bounded x64 PE file", async () => {
    const root = await mkdtemp(join(tmpdir(), "material-designer-converter-writer-invalid-"));
    roots.push(root);
    const sourcePath = join(root, "converter-writer.cpp");
    await writeFile(sourcePath, Buffer.alloc(2048, 0x63));
    await expect(buildWindowsConverterWriter({
      outputResourceRoot: join(root, "resources", "open-design"),
      sourcePath,
      compile: async ({ executablePath }) => {
        await writeFile(executablePath, Buffer.alloc(1024));
      },
    })).rejects.toThrow("bounded PE executable");
  });

  it("rejects non-x64 PE structure independently from the compiler", () => {
    const fixture = x64PeFixture();
    fixture.writeUInt16LE(0x014c, 0x84);
    expect(() => assertWindowsConverterWriterExecutable(fixture)).toThrow("x64 PE");
  });
});
