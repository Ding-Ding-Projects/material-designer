import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  buildOtpauthUri,
  clockSkewWarning,
  decodeBase32,
  encodeBase32,
  encodeLocalQr,
  generateSecret,
  nextTotp,
  parseOtpauthJson,
  parseOtpauthUri,
  secondsRemaining,
  totp,
  type AuthenticatorAlgorithm,
  type AuthenticatorDigits,
} from './protocol.js';
import { AuthenticatorStore, type AuthenticatorEntry, type AuthenticatorMetadataStore, type HistoryMutationStatus, type SecretVault } from './store.js';
import { UnavailableSecretVault, type OperatingSystemCredentialVault } from './electron-vault.js';
import { LocalGitHistory, PasswordProtectedHistory, type AuthenticatorHistorySnapshot } from './history.js';
import { SuperConfirmationVerifier } from './super-confirmation.js';
import type { LadderRecordLockoutOptions, LadderState } from '../lockout/protocol.js';
import { DurableUnlockLadderHost, JsonUnlockLadderPersistence, UnlockLadderHost, type LadderClock, type LadderRandom } from '../lockout/service.js';
import { createCanonicalAuthenticatorBridge, createCanonicalUnlockLadderBridge, type CanonicalAuthenticatorBridge, type CanonicalUnlockLadderBridge } from './bridge.js';
import type { CameraQrSource } from './destination.js';

export type DesktopAuthenticatorCode = AuthenticatorEntry & {
  currentCode: string;
  nextCode: string;
  secondsRemaining: number;
  clockWarning: string | null;
};

export type DesktopAuthenticatorRegistration =
  | { kind: 'manual'; issuer: string; account: string; secretBase32: string; algorithm?: AuthenticatorAlgorithm; digits?: AuthenticatorDigits; period?: number; confirmationCode: string }
  | { kind: 'otpauth-uri'; value: string; confirmationCode: string }
  | { kind: 'otpauth-json'; value: string; confirmationCode: string }
  | { kind: 'qr-image' | 'qr-clipboard'; bytes: Uint8Array; confirmationCode: string }
  | { kind: 'camera'; confirmationCode: string };

export type DesktopAuthenticatorResult<T = Record<string, never>> =
  | { ok: true; value: T; historyRecorded?: boolean; recovery?: string | null }
  | { ok: false; code: 'unavailable' | 'invalid-input' | 'not-found' | 'vault-unavailable' | 'confirmation-required' | 'super-confirmation-required' | 'history-locked' | 'persistence-failed'; reason: string };

export interface LocalQrImageDecoder {
  preflight(bytes: Uint8Array): { width: number; height: number; frames: number; decodedBytes: number };
  decode(bytes: Uint8Array): string | Promise<string>;
}
export interface TrustedTimeProvider { now(): Promise<number> | number; }

export interface DesktopAuthenticatorHostBridge {
  vaultStatus(): Promise<DesktopAuthenticatorResult<{ available: boolean }>>;
  trustedTimeStatus(): Promise<DesktopAuthenticatorResult<{ available: boolean; source?: string }>>;
  generateSecret(): Promise<DesktopAuthenticatorResult<{ secretBase32: string }>>;
  list(query?: string): Promise<DesktopAuthenticatorResult<{ entries: AuthenticatorEntry[] }>>;
  view(id: string): Promise<DesktopAuthenticatorResult<{ entry: DesktopAuthenticatorCode }>>;
  copyCurrentCode(id: string): Promise<DesktopAuthenticatorResult<{ code: string }>>;
  register(input: DesktopAuthenticatorRegistration): Promise<DesktopAuthenticatorResult<{ entry: AuthenticatorEntry }>>;
  qrFor(input: { issuer: string; account: string; secretBase32: string; algorithm?: AuthenticatorAlgorithm; digits?: AuthenticatorDigits; period?: number }): Promise<DesktopAuthenticatorResult<{ uri: string; version: 5 | 6; size: 37 | 41; renderedSize: 45 | 49; quietZone: 4; modules: readonly (readonly boolean[])[]; renderedModules: readonly (readonly boolean[])[] }>>;
  setGroup(ids: readonly string[], group: string | null): Promise<DesktopAuthenticatorResult<void>>;
  reorder(ids: readonly string[]): Promise<DesktopAuthenticatorResult<void>>;
  issueSuperConfirmation(action: string, ids: readonly string[]): Promise<DesktopAuthenticatorResult<{ confirmationToken: string }>>;
  remove(ids: readonly string[], confirmationToken: string): Promise<DesktopAuthenticatorResult<void>>;
  historyUnlock(password: string): Promise<DesktopAuthenticatorResult<void>>;
  historyList(query?: string): Promise<DesktopAuthenticatorResult<{ records: Array<{ id: string; action: string; createdAt: string; summary: string; redacted: true }> }>>;
  historyDiff(id: string): Promise<DesktopAuthenticatorResult<{ diff: string }>>;
  historyRestore(id: string): Promise<DesktopAuthenticatorResult<HistoryMutationStatus>>;
  historySetRetention(retention: 'keep-all' | '30-days' | '90-days'): Promise<DesktopAuthenticatorResult<void>>;
  historyExportRedacted(query?: string): Promise<DesktopAuthenticatorResult<{ content: string }>>;
  historyExportSensitive(scope: { query?: string; entryIds: readonly string[] }, confirmationToken: string): Promise<DesktopAuthenticatorResult<{ content: string }>>;
}

export interface DesktopUnlockLadderBridge {
  recordLockout(lockoutId: string, options: LadderRecordLockoutOptions): ReturnType<DurableUnlockLadderHost['recordLockout']>;
  issue(lockoutId: string): ReturnType<UnlockLadderHost['issue']> | Promise<ReturnType<UnlockLadderHost['issue']>>;
  recordMoleHit(lockoutId: string, nonce: string, cell: number): ReturnType<UnlockLadderHost['recordMoleHit']> | Promise<ReturnType<UnlockLadderHost['recordMoleHit']>>;
  submit(lockoutId: string, nonce: string, answer: unknown): ReturnType<UnlockLadderHost['submit']> | Promise<ReturnType<UnlockLadderHost['submit']>>;
  state(lockoutId: string): ReturnType<UnlockLadderHost['state']> | Promise<ReturnType<UnlockLadderHost['state']>>;
}

type HostVault = SecretVault & {
  seal(value: Uint8Array, aad?: string): Promise<Uint8Array>;
  unseal(value: Uint8Array, aad?: string): Promise<Uint8Array>;
  isAvailable?: () => boolean;
};

class JsonMetadata implements AuthenticatorMetadataStore {
  readonly #path: string;
  constructor(path: string) { this.#path = path; }
  async read(): Promise<AuthenticatorEntry[]> {
    try { const raw = await readFile(this.#path, 'utf8'); if (raw.length > 512 * 1024) throw new Error('Authenticator metadata exceeds the bounded size.'); return JSON.parse(raw) as AuthenticatorEntry[]; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  }
  async write(entries: AuthenticatorEntry[]): Promise<void> {
    await mkdir(dirname(this.#path), { recursive: true });
    const temporary = `${this.#path}.${randomUUID()}.tmp`;
    try { await writeFile(temporary, `${JSON.stringify(entries)}\n`, 'utf8'); await rename(temporary, this.#path); }
    finally { try { await unlink(temporary); } catch { /* best effort cleanup */ } }
  }
}

const success = <T>(value: T, status?: HistoryMutationStatus): DesktopAuthenticatorResult<T> => ({ ok: true, value, ...(status ?? {}) });
const failure = <T>(reason: string, code: Extract<DesktopAuthenticatorResult<T>, { ok: false }>['code'] = 'unavailable'): DesktopAuthenticatorResult<T> => ({ ok: false, code, reason });

function groupCode(value: string): string { return value.match(/.{1,3}/gu)?.join(' ') ?? value; }

export class DesktopAuthenticatorHost implements DesktopAuthenticatorHostBridge {
  readonly #vault: HostVault;
  readonly #metadata: JsonMetadata;
  readonly #history: LocalGitHistory;
  readonly #historyDirectory: string;
  readonly #now: () => number;
  readonly #trustedTime?: TrustedTimeProvider;
  readonly #qrDecoder?: LocalQrImageDecoder;
  readonly #camera?: CameraQrSource;
  readonly #confirmation = new SuperConfirmationVerifier();
  readonly #ladder: DurableUnlockLadderHost;
  #historyManager: PasswordProtectedHistory | null = null;
  #store: Promise<AuthenticatorStore> | null = null;
  #retention: 'keep-all' | '30-days' | '90-days' = 'keep-all';

  constructor(options: { directory: string; credentialVault?: OperatingSystemCredentialVault; now?: () => number; trustedTime?: TrustedTimeProvider; qrDecoder?: LocalQrImageDecoder; camera?: CameraQrSource; ladderClock?: LadderClock; ladderRandom?: LadderRandom }) {
    this.#vault = options.credentialVault ? options.credentialVault as HostVault : new UnavailableSecretVault() as HostVault;
    this.#metadata = new JsonMetadata(join(options.directory, 'entries.json'));
    this.#historyDirectory = join(options.directory, 'history');
    this.#history = new LocalGitHistory({ directory: this.#historyDirectory, vault: this.#vault });
    this.#now = options.now ?? Date.now;
    this.#trustedTime = options.trustedTime;
    this.#qrDecoder = options.qrDecoder;
    this.#camera = options.camera;
    this.#ladder = new DurableUnlockLadderHost({ persistence: new JsonUnlockLadderPersistence(join(options.directory, 'lockout-ladder.json')), clock: options.ladderClock, random: options.ladderRandom });
  }

  async vaultStatus(): Promise<DesktopAuthenticatorResult<{ available: boolean }>> {
    return this.#vaultAvailable() ? success({ available: true }) : failure('The operating-system credential vault is unavailable.', 'vault-unavailable');
  }

  async trustedTimeStatus(): Promise<DesktopAuthenticatorResult<{ available: boolean; source?: string }>> {
    if (!this.#trustedTime) return failure('Trusted time is unavailable; clock drift cannot be checked.', 'unavailable');
    try { await this.#trustedTime.now(); return success({ available: true, source: 'trusted-time-provider' }); }
    catch (error) { return failure(error instanceof Error ? error.message : 'Trusted time is unavailable; clock drift cannot be checked.', 'unavailable'); }
  }

  async generateSecret(): Promise<DesktopAuthenticatorResult<{ secretBase32: string }>> {
    return success({ secretBase32: encodeBase32(generateSecret()) });
  }

  async list(query?: string): Promise<DesktopAuthenticatorResult<{ entries: AuthenticatorEntry[] }>> {
    try { return success({ entries: (await this.#storeReady()).list(query) }); }
    catch (error) { return failure(error instanceof Error ? error.message : 'Authenticator metadata could not be read.', 'persistence-failed'); }
  }

  async view(id: string): Promise<DesktopAuthenticatorResult<{ entry: DesktopAuthenticatorCode }>> {
    try {
      const store = await this.#storeReady();
      const entry = store.list().find((candidate) => candidate.id === id);
      if (!entry) return failure('Authenticator entry was not found.', 'not-found');
      const secret = await store.secret(id);
      const parameters = { secret, algorithm: entry.algorithm, digits: entry.digits, period: entry.period } as const;
      const now = this.#now();
      const trustedNow = this.#trustedTime ? await this.#trustedTime.now() : undefined;
      return success({ entry: { ...entry, currentCode: groupCode(totp(parameters, now)), nextCode: groupCode(nextTotp(parameters, now)), secondsRemaining: secondsRemaining(entry.period, now), clockWarning: trustedNow === undefined ? null : clockSkewWarning(now, trustedNow) } });
    } catch (error) { return failure(error instanceof Error ? error.message : 'Authenticator entry could not be read from the operating-system vault.', 'vault-unavailable'); }
  }

  async copyCurrentCode(id: string): Promise<DesktopAuthenticatorResult<{ code: string }>> {
    const result = await this.view(id);
    if (!result.ok) return result;
    return success({ code: result.value.entry.currentCode.replace(/\s+/gu, '') });
  }

  async register(input: DesktopAuthenticatorRegistration): Promise<DesktopAuthenticatorResult<{ entry: AuthenticatorEntry }>> {
    if (!this.#vaultAvailable()) return failure('The operating-system credential vault is unavailable.', 'vault-unavailable');
    try {
      const parameters = input.kind === 'manual'
        ? { issuer: input.issuer.trim(), account: input.account.trim(), secret: decodeBase32(input.secretBase32), algorithm: input.algorithm ?? 'SHA-1', digits: input.digits ?? 6, period: input.period ?? 30 }
        : input.kind === 'otpauth-uri'
          ? parseOtpauthUri(input.value)
          : input.kind === 'otpauth-json'
            ? parseOtpauthJson(input.value)
          : input.kind === 'camera'
            ? this.#camera?.available ? parseOtpauthUri(await this.#camera.read()) : null
            : this.#qrDecoder ? parseOtpauthUri(await this.#decodeQrBytes(input.bytes)) : null;
      if (!parameters) return failure('Local QR image, clipboard, or camera decoding is unavailable.', 'unavailable');
      if (input.confirmationCode !== totp(parameters, this.#now())) return failure('Registration requires one current authenticator code before the entry is armed.', 'confirmation-required');
      const store = await this.#storeReady();
      const entry = await store.add(parameters);
      return success({ entry }, store.lastMutationStatus);
    } catch (error) { return failure(error instanceof Error ? error.message : 'Authenticator registration failed.', 'invalid-input'); }
  }

  async qrFor(input: { issuer: string; account: string; secretBase32: string; algorithm?: AuthenticatorAlgorithm; digits?: AuthenticatorDigits; period?: number }): Promise<DesktopAuthenticatorResult<{ uri: string; version: 5 | 6; size: 37 | 41; renderedSize: 45 | 49; quietZone: 4; modules: readonly (readonly boolean[])[]; renderedModules: readonly (readonly boolean[])[] }>> {
    try {
      const parameters = { issuer: input.issuer, account: input.account, secret: decodeBase32(input.secretBase32), algorithm: input.algorithm ?? 'SHA-1', digits: input.digits ?? 6, period: input.period ?? 30 } as const;
      const uri = buildOtpauthUri(parameters);
      return success({ uri, ...encodeLocalQr(uri) });
    } catch (error) { return failure(error instanceof Error ? error.message : 'Local QR generation failed.', 'invalid-input'); }
  }

  async #decodeQrBytes(bytes: Uint8Array): Promise<string> {
    if (!this.#qrDecoder) throw new Error('Local QR image decoding is unavailable.');
    if (bytes.length === 0 || bytes.length > 2 * 1024 * 1024) throw new Error('QR input exceeds the bounded byte size.');
    const inspected = this.#qrDecoder.preflight(bytes);
    if (!Number.isSafeInteger(inspected.width) || !Number.isSafeInteger(inspected.height) || inspected.width < 1 || inspected.height < 1 || inspected.width > 4_096 || inspected.height > 4_096 || inspected.width * inspected.height > 16_777_216 || inspected.frames !== 1 || !Number.isSafeInteger(inspected.decodedBytes) || inspected.decodedBytes < 1 || inspected.decodedBytes > 64 * 1024 * 1024) throw new Error('QR image dimensions, frames, pixels, or decoded memory exceed the bounded limits.');
    const result = this.#qrDecoder.decode(bytes);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([Promise.resolve(result), new Promise<string>((_, reject) => { timer = setTimeout(() => reject(new Error('QR image decoding exceeded the bounded time.')), 2_000); })]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  async setGroup(ids: readonly string[], group: string | null): Promise<DesktopAuthenticatorResult<void>> { try { const store = await this.#storeReady(); await store.setGroup(ids, group); return success(undefined, store.lastMutationStatus); } catch (error) { return failure(error instanceof Error ? error.message : 'Authenticator groups could not be saved.', 'persistence-failed'); } }
  async reorder(ids: readonly string[]): Promise<DesktopAuthenticatorResult<void>> { try { const store = await this.#storeReady(); await store.reorder(ids); return success(undefined, store.lastMutationStatus); } catch (error) { return failure(error instanceof Error ? error.message : 'Authenticator order could not be saved.', 'persistence-failed'); } }
  async issueSuperConfirmation(action: string, ids: readonly string[]): Promise<DesktopAuthenticatorResult<{ confirmationToken: string }>> { try { return success({ confirmationToken: this.#confirmation.issue(action, ids) }); } catch (error) { return failure(error instanceof Error ? error.message : 'Confirmation scope is invalid.', 'invalid-input'); } }
  async remove(ids: readonly string[], confirmationToken: string): Promise<DesktopAuthenticatorResult<void>> { if (!this.#confirmation.consume(confirmationToken, 'remove authenticator entries', ids)) return failure('Removing authenticator entries requires the in-app super confirmation.', 'super-confirmation-required'); try { const store = await this.#storeReady(); await store.remove(ids); return success(undefined, store.lastMutationStatus); } catch (error) { return failure(error instanceof Error ? error.message : 'Authenticator entries could not be removed.', 'persistence-failed'); } }

  async historyUnlock(password: string): Promise<DesktopAuthenticatorResult<void>> {
    if (!password || password.length > 512) return failure('History password is empty or exceeds the bounded length.', 'invalid-input');
    try {
      await this.#history.init();
      try { this.#historyManager = await PasswordProtectedHistory.open(this.#historyDirectory, this.#vault, password); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; this.#historyManager = await PasswordProtectedHistory.create(this.#historyDirectory, this.#vault, password); }
      return success(undefined);
    } catch (error) { return failure(error instanceof Error ? error.message : 'History manager could not be unlocked.', 'history-locked'); }
  }

  async historyList(query = ''): Promise<DesktopAuthenticatorResult<{ records: Array<{ id: string; action: string; createdAt: string; summary: string; redacted: true }> }>> {
    if (!this.#historyManager) return failure('History manager authentication is required.', 'history-locked');
    try { const records = await this.#historyManager.records(); const needle = query.trim().toLocaleLowerCase(); return success({ records: records.filter((record) => !needle || `${record.action} ${record.createdAt}`.toLocaleLowerCase().includes(needle)).map((record) => ({ id: record.id, action: record.action, createdAt: record.createdAt, summary: `Authenticator ${record.action}`, redacted: true as const })) }); }
    catch (error) { return failure(error instanceof Error ? error.message : 'History records could not be read.', 'persistence-failed'); }
  }

  async historyDiff(id: string): Promise<DesktopAuthenticatorResult<{ diff: string }>> {
    if (!this.#historyManager) return failure('History manager authentication is required.', 'history-locked');
    try { const record = (await this.#historyManager.records()).find((candidate) => candidate.id === id); if (!record) return failure('History record was not found.', 'not-found'); return success({ diff: JSON.stringify(await this.#historyManager.restore(record), null, 2) }); }
    catch (error) { return failure(error instanceof Error ? error.message : 'History diff could not be read.', 'persistence-failed'); }
  }

  async historyRestore(id: string): Promise<DesktopAuthenticatorResult<HistoryMutationStatus>> {
    if (!this.#historyManager) return failure('History manager authentication is required.', 'history-locked');
    try { const record = (await this.#historyManager.records()).find((candidate) => candidate.id === id); if (!record) return failure('History record was not found.', 'not-found'); const snapshot = await this.#historyManager.restore(record); const status = await (await this.#storeReady()).restoreSnapshot(snapshot as AuthenticatorHistorySnapshot); return success(status, status); }
    catch (error) { return failure(error instanceof Error ? error.message : 'History restore could not be applied and recorded.', 'persistence-failed'); }
  }

  async historySetRetention(retention: 'keep-all' | '30-days' | '90-days'): Promise<DesktopAuthenticatorResult<void>> { if (!this.#historyManager) return failure('History manager authentication is required.', 'history-locked'); if (!['keep-all', '30-days', '90-days'].includes(retention)) return failure('History retention is invalid.', 'invalid-input'); try { this.#retention = retention; await writeFile(join(this.#historyDirectory, 'retention.json'), `${JSON.stringify({ version: 1, retention })}\n`, 'utf8'); if (retention !== 'keep-all') await this.#historyManager.prune(this.#now() - (retention === '30-days' ? 30 : 90) * 86_400_000); return success(undefined); } catch (error) { return failure(error instanceof Error ? error.message : 'History retention could not be persisted or applied.', 'persistence-failed'); } }

  async historyExportRedacted(query = ''): Promise<DesktopAuthenticatorResult<{ content: string }>> { const listed = await this.historyList(query); if (!listed.ok) return listed; return success({ content: JSON.stringify({ version: 1, retention: this.#retention, secretsOmitted: true, records: listed.value.records }, null, 2) }); }

  async historyExportSensitive(scope: { query?: string; entryIds: readonly string[] }, confirmationToken: string): Promise<DesktopAuthenticatorResult<{ content: string }>> {
    if (!this.#historyManager) return failure('History manager authentication is required.', 'history-locked');
    if (!this.#confirmation.consume(confirmationToken, 'export sensitive authenticator history', scope.entryIds)) return failure('Sensitive history export requires the in-app super confirmation.', 'super-confirmation-required');
    try {
      const store = await this.#storeReady();
      const entries = store.list().filter((entry) => scope.entryIds.includes(entry.id));
      const exported = [];
      for (const entry of entries) exported.push({ ...entry, secret: encodeBase32(await store.secret(entry.id)) });
      const query = scope.query?.trim().toLocaleLowerCase() ?? '';
      return success({ content: JSON.stringify({ version: 1, warning: 'This export contains usable authenticator secrets in cleartext.', entries: exported.filter((entry) => !query || `${entry.issuer} ${entry.account}`.toLocaleLowerCase().includes(query)) }, null, 2) });
    } catch (error) { return failure(error instanceof Error ? error.message : 'Sensitive history export could not be prepared.', 'persistence-failed'); }
  }

  async ladderRecordLockout(lockoutId: string, options: LadderRecordLockoutOptions): Promise<LadderState> { return this.#ladder.recordLockout(lockoutId, options); }
  async ladderIssue(lockoutId: string) { return this.#ladder.issue(lockoutId); }
  async ladderRecordMoleHit(lockoutId: string, nonce: string, cell: number) { return this.#ladder.recordMoleHit(lockoutId, nonce, cell); }
  async ladderSubmit(lockoutId: string, nonce: string, answer: unknown) { return this.#ladder.submit(lockoutId, nonce, answer); }
  async ladderState(lockoutId: string) { return this.#ladder.state(lockoutId); }
  #vaultAvailable(): boolean { return this.#vault.kind === 'operating-system-vault' && this.#vault.isAvailable?.() === true; }
  async #storeReady(): Promise<AuthenticatorStore> { return this.#store ??= AuthenticatorStore.open({ metadata: this.#metadata, vault: this.#vault, history: this.#history }); }
}

/** Registration seam consumed by the central desktop bridge lane. */
export function registerAuthenticatorBridge(host: DesktopAuthenticatorHost): DesktopAuthenticatorHostBridge {
  return host;
}

export function registerCanonicalAuthenticatorBridge(host: DesktopAuthenticatorHost): CanonicalAuthenticatorBridge {
  return createCanonicalAuthenticatorBridge(host);
}

/** Registration seam consumed by the central lockout bridge lane. */
export function registerUnlockLadderBridge(host: DesktopAuthenticatorHost): DesktopUnlockLadderBridge {
  return {
    recordLockout: (lockoutId, options) => host.ladderRecordLockout(lockoutId, options),
    issue: (lockoutId) => host.ladderIssue(lockoutId),
    recordMoleHit: (lockoutId, nonce, cell) => host.ladderRecordMoleHit(lockoutId, nonce, cell),
    submit: (lockoutId, nonce, answer) => host.ladderSubmit(lockoutId, nonce, answer),
    state: (lockoutId) => host.ladderState(lockoutId),
  };
}

export function registerCanonicalUnlockLadderBridge(host: DesktopAuthenticatorHost): CanonicalUnlockLadderBridge {
  return createCanonicalUnlockLadderBridge(host);
}
