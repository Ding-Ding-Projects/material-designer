import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const WINDOWS_CONVERTER_WRITER_FILE = "material-designer-converter-writer.exe";
export const WINDOWS_CONVERTER_WRITER_PROTOCOL_VERSION = 1 as const;
export const WINDOWS_CONVERTER_WRITER_SCHEMA_VERSION = 1 as const;
export const WINDOWS_CONVERTER_WRITER_VERSION = "1.0.0" as const;
const MAX_EXECUTABLE_BYTES = 4 * 1024 * 1024;
const MIN_EXECUTABLE_BYTES = 1024;

export type WindowsConverterWriterManifest = {
  bytes: number;
  file: typeof WINDOWS_CONVERTER_WRITER_FILE;
  protocolVersion: typeof WINDOWS_CONVERTER_WRITER_PROTOCOL_VERSION;
  schemaVersion: typeof WINDOWS_CONVERTER_WRITER_SCHEMA_VERSION;
  sha256: string;
  sourceSha256: string;
  version: typeof WINDOWS_CONVERTER_WRITER_VERSION;
};

export type WindowsConverterWriterBuildInput = {
  executablePath: string;
  objectPath: string;
  sourcePath: string;
};

export type WindowsConverterWriterBuildOptions = {
  compile?: (input: WindowsConverterWriterBuildInput) => Promise<void>;
  outputResourceRoot: string;
  sourcePath: string;
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertCommandPath(value: string, label: string): string {
  const resolved = resolve(value);
  if (resolved.includes("\0") || resolved.includes("\r") || resolved.includes("\n") || resolved.includes('"')) {
    throw new Error(`tools-pack: ${label} contains an unsupported command character`);
  }
  return resolved;
}

function quoteCommandPath(value: string, label: string): string {
  return `"${assertCommandPath(value, label)}"`;
}

export function assertWindowsConverterWriterExecutable(bytes: Uint8Array): void {
  if (
    bytes.byteLength < MIN_EXECUTABLE_BYTES
    || bytes.byteLength > MAX_EXECUTABLE_BYTES
    || bytes[0] !== 0x4d
    || bytes[1] !== 0x5a
  ) {
    throw new Error("tools-pack: converter writer output is not a bounded PE executable");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const peOffset = view.getUint32(0x3c, true);
  if (
    peOffset < 0x40
    || peOffset + 6 > bytes.byteLength
    || bytes[peOffset] !== 0x50
    || bytes[peOffset + 1] !== 0x45
    || bytes[peOffset + 2] !== 0
    || bytes[peOffset + 3] !== 0
    || view.getUint16(peOffset + 4, true) !== 0x8664
  ) {
    throw new Error("tools-pack: converter writer output is not an x64 PE executable");
  }
}

function assertPortableExecutable(executable: Uint8Array): void {
  assertWindowsConverterWriterExecutable(executable);
}

async function compileWithMsvc(input: WindowsConverterWriterBuildInput): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("tools-pack: the Windows converter writer can only be compiled on Windows");
  }
  const programFilesX86 = process.env["ProgramFiles(x86)"];
  if (!programFilesX86) throw new Error("tools-pack: ProgramFiles(x86) is unavailable");
  const vswherePath = join(programFilesX86, "Microsoft Visual Studio", "Installer", "vswhere.exe");
  const { stdout } = await execFileAsync(vswherePath, [
    "-latest",
    "-products",
    "*",
    "-requires",
    "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
    "-property",
    "installationPath",
  ], { encoding: "utf8", windowsHide: true, timeout: 30_000 });
  const installationPath = stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  if (!installationPath) throw new Error("tools-pack: an MSVC x64 toolchain is required for the converter writer");
  const vcvarsPath = join(installationPath, "VC", "Auxiliary", "Build", "vcvars64.bat");
  const command = [
    "call",
    quoteCommandPath(vcvarsPath, "vcvars64 path"),
    ">nul",
    "&&",
    "cl.exe",
    "/nologo",
    "/std:c++20",
    "/O2",
    "/W4",
    "/WX",
    "/GS",
    "/guard:cf",
    "/DUNICODE",
    "/D_UNICODE",
    "/D_CRT_SECURE_NO_WARNINGS",
    "/MT",
    "/EHsc-",
    "/GR-",
    `/Fo:${quoteCommandPath(input.objectPath, "object path")}`,
    `/Fe:${quoteCommandPath(input.executablePath, "executable path")}`,
    quoteCommandPath(input.sourcePath, "source path"),
    "/link",
    "/incremental:no",
    "/opt:ref",
    "/opt:icf",
    "/subsystem:console",
    "bcrypt.lib",
  ].join(" ");
  await execFileAsync("cmd.exe", ["/d", "/s", "/c", command], {
    cwd: dirname(input.executablePath),
    encoding: "utf8",
    windowsHide: true,
    timeout: 120_000,
  });
}

export async function buildWindowsConverterWriter(
  options: WindowsConverterWriterBuildOptions,
): Promise<WindowsConverterWriterManifest> {
  const sourcePath = assertCommandPath(options.sourcePath, "converter writer source");
  const outputResourceRoot = assertCommandPath(options.outputResourceRoot, "converter writer resource root");
  const writerRoot = join(outputResourceRoot, "bin", "converter-writer");
  const executablePath = join(writerRoot, WINDOWS_CONVERTER_WRITER_FILE);
  const objectPath = join(writerRoot, "converter-writer.obj");
  await mkdir(writerRoot, { recursive: true });
  const sourceBytes = await readFile(sourcePath);
  if (sourceBytes.byteLength < 1024 || sourceBytes.byteLength > MAX_EXECUTABLE_BYTES) {
    throw new Error("tools-pack: converter writer source is missing or outside its byte bound");
  }
  try {
    await (options.compile ?? compileWithMsvc)({ executablePath, objectPath, sourcePath });
  } finally {
    await rm(objectPath, { force: true });
  }
  const executable = await readFile(executablePath);
  assertPortableExecutable(executable);
  const manifest: WindowsConverterWriterManifest = {
    bytes: executable.byteLength,
    file: WINDOWS_CONVERTER_WRITER_FILE,
    protocolVersion: WINDOWS_CONVERTER_WRITER_PROTOCOL_VERSION,
    schemaVersion: WINDOWS_CONVERTER_WRITER_SCHEMA_VERSION,
    sha256: sha256(executable),
    sourceSha256: sha256(sourceBytes),
    version: WINDOWS_CONVERTER_WRITER_VERSION,
  };
  await writeFile(join(writerRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}
