import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const WINDOWS_CONVERTER_WRITER_FILE = "material-designer-converter-writer.exe";
export const WINDOWS_CONVERTER_WRITER_MANIFEST = "manifest.json";
export const WINDOWS_CONVERTER_WRITER_PROTOCOL_VERSION = 1 as const;
export const WINDOWS_CONVERTER_WRITER_VERSION = "1.0.0";

export type WindowsConverterWriterManifest = {
  bytes: number;
  file: typeof WINDOWS_CONVERTER_WRITER_FILE;
  protocolVersion: typeof WINDOWS_CONVERTER_WRITER_PROTOCOL_VERSION;
  schemaVersion: 1;
  sha256: string;
  sourceSha256: string;
  version: typeof WINDOWS_CONVERTER_WRITER_VERSION;
};

function parseEnvironment(text: string): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const line of text.split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    environment[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return environment;
}

async function pathExists(path: string): Promise<boolean> {
  return access(path).then(() => true).catch(() => false);
}

async function resolveVswhere(): Promise<string> {
  const configured = process.env["ProgramFiles(x86)"];
  const standard = configured ? join(configured, "Microsoft Visual Studio", "Installer", "vswhere.exe") : undefined;
  if (standard && await pathExists(standard)) return standard;
  const { stdout } = await execFileAsync("where.exe", ["vswhere.exe"], { windowsHide: true, timeout: 10_000 });
  const candidate = stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  if (!candidate) throw new Error("tools-pack: vswhere.exe could not be resolved for the converter writer build");
  return candidate;
}

async function loadMsvcEnvironment(): Promise<NodeJS.ProcessEnv> {
  const vswhere = await resolveVswhere();
  const { stdout: installationRoot } = await execFileAsync(vswhere, [
    "-latest",
    "-products",
    "*",
    "-requires",
    "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
    "-property",
    "installationPath",
  ], { windowsHide: true, timeout: 10_000 });
  const root = installationRoot.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  if (!root) throw new Error("tools-pack: an MSVC x64 toolchain is required to build the converter writer");
  const vcvars = join(root, "VC", "Auxiliary", "Build", "vcvars64.bat");
  if (!await pathExists(vcvars)) throw new Error("tools-pack: vcvars64.bat is missing from the selected MSVC toolchain");
  const { stdout } = await execFileAsync("cmd.exe", ["/d", "/s", "/c", `"${vcvars}" >nul && set`], {
    windowsHide: true,
    timeout: 30_000,
  });
  const environment = parseEnvironment(stdout);
  if (!environment.PATH) throw new Error("tools-pack: vcvars64.bat produced no compiler PATH");
  return environment;
}

export function assertPortableExecutable(bytes: Uint8Array): void {
  if (bytes.byteLength < 1024 || bytes.byteLength > 4 * 1024 * 1024 || bytes[0] !== 0x4d || bytes[1] !== 0x5a) {
    throw new Error("tools-pack: converter writer output is not a bounded PE executable");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const peOffset = view.getUint32(0x3c, true);
  if (peOffset < 0x40 || peOffset + 6 >= bytes.byteLength
      || bytes[peOffset] !== 0x50 || bytes[peOffset + 1] !== 0x45
      || bytes[peOffset + 2] !== 0 || bytes[peOffset + 3] !== 0
      || view.getUint16(peOffset + 4, true) !== 0x8664) {
    throw new Error("tools-pack: converter writer output is not an x64 PE executable");
  }
}

export async function buildWindowsConverterWriter(options: {
  destinationRoot: string;
  sourcePath: string;
}): Promise<WindowsConverterWriterManifest> {
  if (process.platform !== "win32") throw new Error("tools-pack: the Windows converter writer must be built on Windows");
  const source = await readFile(options.sourcePath);
  if (source.byteLength === 0 || source.byteLength > 1024 * 1024) throw new Error("tools-pack: converter writer source is missing or outside its bound");
  const environment = await loadMsvcEnvironment();
  await rm(options.destinationRoot, { force: true, recursive: true });
  await mkdir(options.destinationRoot, { recursive: true });
  const executablePath = join(options.destinationRoot, WINDOWS_CONVERTER_WRITER_FILE);
  const objectPath = join(options.destinationRoot, "converter-writer.obj");
  try {
    await execFileAsync("cl.exe", [
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
      `/Fo:${objectPath}`,
      `/Fe:${executablePath}`,
      options.sourcePath,
      "/link",
      "/incremental:no",
      "/opt:ref",
      "/opt:icf",
      "/subsystem:console",
      "bcrypt.lib",
    ], {
      cwd: dirname(options.sourcePath),
      env: environment,
      maxBuffer: 4 * 1024 * 1024,
      timeout: 120_000,
      windowsHide: true,
    });
  } finally {
    await rm(objectPath, { force: true });
  }
  const executable = await readFile(executablePath);
  assertPortableExecutable(executable);
  const manifest: WindowsConverterWriterManifest = {
    bytes: executable.byteLength,
    file: WINDOWS_CONVERTER_WRITER_FILE,
    protocolVersion: WINDOWS_CONVERTER_WRITER_PROTOCOL_VERSION,
    schemaVersion: 1,
    sha256: createHash("sha256").update(executable).digest("hex"),
    sourceSha256: createHash("sha256").update(source).digest("hex"),
    version: WINDOWS_CONVERTER_WRITER_VERSION,
  };
  await writeFile(join(options.destinationRoot, WINDOWS_CONVERTER_WRITER_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}
