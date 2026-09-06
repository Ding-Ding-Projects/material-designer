import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { spawn } from 'node:child_process';
import { open, readFile, stat, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { CredentialVaultUnavailableError, type OperatingSystemCredentialVault } from './electron-vault.js';

const text = new TextEncoder();
const MAX_KEY_LENGTH = 160;
const MAX_SECRET_BYTES = 512;
const MAX_MIGRATION_KEYS = 1_024;
const MASTER_KEY_NAME = '__material_designer_authenticator_master_key_v1';
const SEALED_VERSION = 1;

export interface WindowsCredentialBackend {
  readonly available: boolean;
  read(name: string): Promise<Uint8Array | null>;
  write(name: string, value: Uint8Array): Promise<void>;
  remove(name: string): Promise<void>;
}

export interface WindowsCredentialVaultOptions {
  /** A stable, product-owned namespace. It is not a file path or user input. */
  readonly serviceName?: string;
  /** Test-only seam. Production construction intentionally uses Credential Manager. */
  readonly backend?: WindowsCredentialBackend;
  readonly random?: (size: number) => Uint8Array;
}

/** Narrow compatibility seam for the removed encrypted-file implementation. */
export interface LegacyElectronVaultReader {
  isEncryptionAvailable(): boolean;
  decryptString(value: Buffer): string;
}

export interface LegacyVaultMigrationResult {
  readonly migrated: readonly string[];
  readonly skipped: readonly string[];
}

function unavailable(message = 'The operating-system credential vault is unavailable.'): never { throw new CredentialVaultUnavailableError(message); }

function validKey(key: string): boolean { return typeof key === 'string' && key.length > 0 && key.length <= MAX_KEY_LENGTH && /^[A-Za-z0-9._:-]+$/u.test(key); }

function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let difference = 0;
  for (let i = 0; i < a.byteLength; i += 1) difference |= a[i]! ^ b[i]!;
  return difference === 0;
}
function decodeCanonicalBase64(value: string, maximum: number): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) unavailable('Credential-vault data is invalid.');
  const decoded = Buffer.from(value, 'base64');
  if (decoded.byteLength === 0 || decoded.byteLength > maximum || decoded.toString('base64') !== value) unavailable('Credential-vault data is invalid.');
  return decoded;
}
async function readBoundedUtf8(path: string, maximum: number): Promise<string> {
  const handle = await open(path, 'r');
  try {
    const size = (await handle.stat()).size;
    if (size < 4 || size > maximum) unavailable('Legacy credential migration found an invalid protected value.');
    const buffer = Buffer.allocUnsafe(maximum + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, 0);
    if (bytesRead < 4 || bytesRead > maximum) unavailable('Legacy credential migration found an invalid protected value.');
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally { await handle.close(); }
}

/**
 * Real Windows Credential Manager bridge. Values travel through standard input
 * and standard output only, never a command argument, file, or diagnostic.
 */
export class CredentialManagerBackend implements WindowsCredentialBackend {
  readonly available: boolean;
  readonly #prefix: string;
  readonly #executable: string | null;
  constructor(serviceName: string) {
    const root = process.env.SystemRoot ?? process.env.WINDIR;
    const executable = typeof root === 'string' ? join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : null;
    this.#executable = executable;
    this.available = process.platform === 'win32' && executable != null && existsSync(executable);
    this.#prefix = `${serviceName}/`;
  }
  async read(name: string): Promise<Uint8Array | null> {
    const result = await this.#call({ action: 'read', name: this.#qualified(name) });
    return result == null ? null : new Uint8Array(decodeCanonicalBase64(result, MAX_SECRET_BYTES));
  }
  async write(name: string, value: Uint8Array): Promise<void> {
    if (value.byteLength > MAX_SECRET_BYTES) unavailable('Credential Manager refuses this value because it exceeds the supported bounded size.');
    await this.#call({ action: 'write', name: this.#qualified(name), value: Buffer.from(value).toString('base64') });
  }
  async remove(name: string): Promise<void> { await this.#call({ action: 'remove', name: this.#qualified(name) }); }
  #qualified(name: string): string { return `${this.#prefix}${name}`; }
  async #call(input: { action: 'read' | 'write' | 'remove'; name: string; value?: string }): Promise<string | null> {
    if (!this.available) unavailable();
    if (!this.#executable) unavailable();
    let output: { ok: boolean; value?: string | null };
    try { output = await runCredentialManagerHelper(this.#executable, JSON.stringify(input)); }
    catch { unavailable(); }
    if (output.ok !== true) unavailable();
    return output.value ?? null;
  }
}

export class WindowsCredentialVault implements OperatingSystemCredentialVault {
  readonly kind = 'operating-system-vault' as const;
  readonly #backend: WindowsCredentialBackend;
  readonly #random: (size: number) => Uint8Array;
  #masterKey: Uint8Array | null = null;
  constructor(options: WindowsCredentialVaultOptions = {}) {
    this.#backend = options.backend ?? new CredentialManagerBackend(options.serviceName ?? 'MaterialDesigner/authenticator');
    this.#random = options.random ?? randomBytes;
  }
  isAvailable(): boolean { return this.#backend.available; }
  async put(key: string, secret: Uint8Array): Promise<void> {
    this.#assertUsable(key, secret);
    await this.#backend.write(key, secret.slice());
  }
  async get(key: string): Promise<Uint8Array | null> {
    this.#assertKey(key);
    const value = await this.#backend.read(key);
    return value == null ? null : new Uint8Array(value);
  }
  async delete(key: string): Promise<void> { this.#assertKey(key); await this.#backend.remove(key); }
  async seal(value: Uint8Array, aad = ''): Promise<Uint8Array> {
    if (value.byteLength > 2 * 1024 * 1024 || aad.length > 512) unavailable('The value is outside the credential-vault encryption bounds.');
    const iv = this.#random(12); if (iv.byteLength !== 12) unavailable('Credential-vault randomness is unavailable.');
    const cipher = createCipheriv('aes-256-gcm', await this.#loadMasterKey(), iv);
    cipher.setAAD(text.encode(aad));
    const payload = Buffer.concat([cipher.update(value), cipher.final()]);
    return Buffer.concat([Buffer.from([SEALED_VERSION]), Buffer.from(iv), cipher.getAuthTag(), payload]);
  }
  async unseal(value: Uint8Array, aad = ''): Promise<Uint8Array> {
    if (value.byteLength < 29 || value.byteLength > 2 * 1024 * 1024 + 29 || value[0] !== SEALED_VERSION || aad.length > 512) unavailable('Credential-vault encrypted data is invalid.');
    const decipher = createDecipheriv('aes-256-gcm', await this.#loadMasterKey(), value.subarray(1, 13));
    decipher.setAAD(text.encode(aad)); decipher.setAuthTag(value.subarray(13, 29));
    return new Uint8Array(Buffer.concat([decipher.update(value.subarray(29)), decipher.final()]));
  }
  async #loadMasterKey(): Promise<Uint8Array> {
    if (this.#masterKey) return this.#masterKey.slice();
    if (!this.isAvailable()) unavailable();
    const existing = await this.#backend.read(MASTER_KEY_NAME);
    if (existing) {
      if (existing.byteLength !== 32) unavailable('Credential-vault key material is invalid.');
      this.#masterKey = existing.slice(); return existing;
    }
    const created = this.#random(32); if (created.byteLength !== 32) unavailable('Credential-vault randomness is unavailable.');
    await this.#backend.write(MASTER_KEY_NAME, created);
    const verified = await this.#backend.read(MASTER_KEY_NAME);
    if (!verified || !equal(created, verified)) unavailable('Credential-vault key creation could not be verified.');
    this.#masterKey = verified.slice(); return verified;
  }
  #assertKey(key: string): void { if (!this.isAvailable() || !validKey(key)) unavailable(); }
  #assertUsable(key: string, value: Uint8Array): void { this.#assertKey(key); if (value.byteLength === 0 || value.byteLength > MAX_SECRET_BYTES) unavailable('Credential Manager refuses this value because it is outside the supported bounded size.'); }
}

export function createWindowsCredentialVault(options: WindowsCredentialVaultOptions = {}): OperatingSystemCredentialVault {
  return new WindowsCredentialVault(options);
}

/**
 * Migrates only named authenticator secrets from the former safeStorage files.
 * A source entry is removed only after the target store returns the identical
 * bytes. Any unavailable or malformed record stays in place for recovery.
 */
export async function migrateLegacyElectronVault(options: {
  readonly directory: string;
  readonly keys: readonly string[];
  readonly legacySafeStorage: LegacyElectronVaultReader;
  readonly target: OperatingSystemCredentialVault;
  /** The host atomically publishes its validated metadata before source retirement. */
  readonly publishMetadata: (migratedKey: string) => Promise<void>;
  readonly files?: { readFile: typeof readFile; stat: typeof stat; unlink: typeof unlink };
}): Promise<LegacyVaultMigrationResult> {
  const files = { readFile, stat, unlink, ...options.files };
  if (!options.legacySafeStorage.isEncryptionAvailable() || !options.target.isAvailable()) unavailable();
  const migrated: string[] = []; const skipped: string[] = [];
  if (options.keys.length > MAX_MIGRATION_KEYS) unavailable('Legacy credential migration exceeds the bounded entry count.');
  const keys = [...new Set(options.keys)]; if (keys.length > MAX_MIGRATION_KEYS) unavailable('Legacy credential migration exceeds the bounded entry count.');
  for (const key of keys) {
    if (!validKey(key) || !key.startsWith('authenticator:')) unavailable('Legacy credential migration refused an invalid key.');
    const path = join(options.directory, `${Buffer.from(key, 'utf8').toString('hex')}.vault`);
    let encoded: string;
    try { encoded = options.files ? await files.readFile(path, 'utf8') : await readBoundedUtf8(path, 4 * 1024); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') { skipped.push(key); continue; } throw error; }
    const envelope = decodeCanonicalBase64(encoded, 2 * 1024);
    const secret = decodeCanonicalBase64(options.legacySafeStorage.decryptString(Buffer.from(envelope)), MAX_SECRET_BYTES);
    const existing = await options.target.get(key);
    if (existing && !equal(secret, existing)) unavailable('Legacy credential migration found a conflicting target vault entry.');
    if (!existing) await options.target.put(key, secret);
    const verified = await options.target.get(key);
    if (!verified || !equal(secret, verified)) unavailable('Legacy credential migration could not verify the target vault.');
    await options.publishMetadata(key);
    await files.unlink(path); migrated.push(key);
  }
  return { migrated, skipped };
}

const credentialManagerScript = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class MDVault {
 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct CREDENTIAL { public UInt32 Flags; public UInt32 Type; public string TargetName; public string Comment; public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten; public UInt32 CredentialBlobSize; public IntPtr CredentialBlob; public UInt32 Persist; public UInt32 AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName; }
 [DllImport("Advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool CredRead(string target, UInt32 type, UInt32 flags, out IntPtr credential);
 [DllImport("Advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool CredWrite(ref CREDENTIAL credential, UInt32 flags);
 [DllImport("Advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool CredDelete(string target, UInt32 type, UInt32 flags);
 [DllImport("Advapi32.dll", SetLastError=true)] public static extern void CredFree(IntPtr credential);
}
'@
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
$type = [uint32]1
if ($request.action -eq 'read') { $pointer=[IntPtr]::Zero; if (-not [MDVault]::CredRead([string]$request.name,$type,0,[ref]$pointer)) { if ([Runtime.InteropServices.Marshal]::GetLastWin32Error() -eq 1168) { @{ok=$true;value=$null}|ConvertTo-Json -Compress; exit 0 }; throw 'Credential Manager read failed' }; try { $credential=[Runtime.InteropServices.Marshal]::PtrToStructure($pointer,[type][MDVault+CREDENTIAL]); if ($credential.CredentialBlobSize -lt 1 -or $credential.CredentialBlobSize -gt 512) { throw 'Credential Manager read size invalid' }; $bytes=New-Object byte[] $credential.CredentialBlobSize; [Runtime.InteropServices.Marshal]::Copy($credential.CredentialBlob,$bytes,0,$bytes.Length); @{ok=$true;value=[Convert]::ToBase64String($bytes)}|ConvertTo-Json -Compress } finally { [MDVault]::CredFree($pointer) }; exit 0 }
if ($request.action -eq 'remove') { if (-not [MDVault]::CredDelete([string]$request.name,$type,0)) { if ([Runtime.InteropServices.Marshal]::GetLastWin32Error() -ne 1168) { throw 'Credential Manager delete failed' } }; @{ok=$true}|ConvertTo-Json -Compress; exit 0 }
$bytes=[Convert]::FromBase64String([string]$request.value); if ($bytes.Length -gt 512) { throw 'Credential Manager value too large' }; $blob=[Runtime.InteropServices.Marshal]::AllocCoTaskMem($bytes.Length); try { if ($bytes.Length -gt 0) { [Runtime.InteropServices.Marshal]::Copy($bytes,0,$blob,$bytes.Length) }; $credential=[Activator]::CreateInstance([type]'MDVault+CREDENTIAL'); $credential.Type=$type; $credential.TargetName=[string]$request.name; $credential.CredentialBlobSize=$bytes.Length; $credential.CredentialBlob=$blob; $credential.Persist=2; $credential.UserName='Material Designer'; if (-not [MDVault]::CredWrite([ref]$credential,0)) { throw 'Credential Manager write failed' }; @{ok=$true}|ConvertTo-Json -Compress } finally { [Runtime.InteropServices.Marshal]::FreeCoTaskMem($blob) }
`;

function runCredentialManagerHelper(executable: string, input: string): Promise<{ ok: boolean; value?: string | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', credentialManagerScript], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    let stdout = ''; let settled = false;
    const fail = () => { if (settled) return; settled = true; reject(new Error('The operating-system credential vault is unavailable.')); };
    const timer = setTimeout(() => { child.kill(); fail(); }, 10_000);
    const output = child.stdout; const inputStream = child.stdin;
    if (!output || !inputStream) { clearTimeout(timer); child.kill(); fail(); return; }
    output.setEncoding('utf8'); output.on('data', (chunk: string) => { if (stdout.length <= 4_096) stdout += chunk; });
    inputStream.once('error', () => { clearTimeout(timer); child.kill(); fail(); });
    child.once('error', () => { clearTimeout(timer); fail(); });
    child.once('close', (code) => { clearTimeout(timer); if (settled || code !== 0 || stdout.length > 4_096) { fail(); return; } try { const parsed = JSON.parse(stdout) as { ok?: unknown; value?: unknown }; if (parsed.ok !== true || (parsed.value !== undefined && parsed.value !== null && typeof parsed.value !== 'string')) throw new Error(); settled = true; resolve({ ok: true, value: typeof parsed.value === 'string' ? parsed.value : null }); } catch { fail(); } });
    inputStream.end(input, 'utf8');
  });
}
