import { access } from "node:fs/promises";

const DEFAULT_SIGNTOOL_CANDIDATES = [
  "signtool.exe",
  "C:\\Program Files (x86)\\Windows Kits\\10\\bin\\10.0.26100.0\\x64\\signtool.exe",
  "C:\\Program Files (x86)\\Windows Kits\\10\\App Certification Kit\\signtool.exe",
];

export type WinSigningCacheKey = {
  certificateSha1?: string;
  digestAlgorithm?: string;
  enabled: boolean;
  timestampAlgorithm?: string;
  timestampUrl?: string;
};

export function resolveWinSigningCacheKey(): WinSigningCacheKey {
  return { enabled: false };
}

export function resolveWinSigningConfig(): never {
  throw new Error("Windows code signing is prohibited; release artifacts must remain unsigned");
}

export async function signAndVerifyWinFile(): Promise<never> {
  throw new Error("Windows code signing is prohibited; release artifacts must remain unsigned");
}

export async function resolveSigntoolPath(
  configured: string,
  candidates: readonly string[] = DEFAULT_SIGNTOOL_CANDIDATES,
): Promise<string> {
  const filesystemCandidates = candidates.filter((candidate) => candidate !== "signtool.exe");
  const orderedFilesystemCandidates = configured === "signtool.exe"
    ? filesystemCandidates
    : [configured, ...filesystemCandidates.filter((candidate) => candidate !== configured)];

  for (const candidate of orderedFilesystemCandidates) {
    if (await fileExists(candidate)) return candidate;
  }

  return configured === "signtool.exe" && candidates.includes("signtool.exe")
    ? "signtool.exe"
    : configured;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
