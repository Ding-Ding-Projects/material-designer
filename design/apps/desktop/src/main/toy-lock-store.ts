import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  OPEN_DESIGN_SETTINGS_TOY_LOCK_TARGETS, OPEN_DESIGN_TOY_LOCK_POLICIES,
  type OpenDesignSettingsToyLockTarget, type OpenDesignToyLockBeginTotpEnrollmentRequest,
  type OpenDesignToyLockConfigureRequest, type OpenDesignToyLockConfirmTotpEnrollmentRequest,
  type OpenDesignToyLockMetadata, type OpenDesignToyLockPolicy, type OpenDesignToyLockResult,
  type OpenDesignToyLockVerifyRequest,
} from "@open-design/host";

const STORE_VERSION = 2 as const;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_FACTOR_CHARS = 512;
const HASH_BYTES = 32;
const SALT_BYTES = 16;
const SCRYPT_OPTIONS = Object.freeze({ N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
const DEFAULT_MAXIMUM_ATTEMPTS = 5;
const MAXIMUM_ATTEMPTS_LIMIT = 20;
const COOLDOWN_MS = 30_000;
const TOTP_PERIOD_MS = 30_000;
const MAX_HOTP_COUNTER = (1n << 64n) - 1n;
const TOTP_ENROLLMENT_TTL_MS = 5 * 60_000;
const MAX_PENDING_OPERATIONS = 32;
const MAX_PENDING_ENROLLMENTS = 16;
const RENAME_RETRY_DELAYS_MS = Object.freeze([0, 20, 50, 100, 150]);
const TRANSIENT_RENAME_CODES = new Set(["EPERM", "EACCES", "EBUSY"]);
const TARGETS = new Set<string>(OPEN_DESIGN_SETTINGS_TOY_LOCK_TARGETS);
const POLICIES = new Set<string>(OPEN_DESIGN_TOY_LOCK_POLICIES);
const TOTP_POLICIES = new Set<OpenDesignToyLockPolicy>(["password-totp", "pin-totp", "password-pin-totp"]);
const POLICY_FACTORS: Readonly<Record<OpenDesignToyLockPolicy, readonly ("pin" | "password" | "totp")[]>> = Object.freeze({
  "pin": Object.freeze(["pin"] as const), "password": Object.freeze(["password"] as const),
  "pin-password": Object.freeze(["pin", "password"] as const),
  "password-totp": Object.freeze(["password", "totp"] as const),
  "pin-totp": Object.freeze(["pin", "totp"] as const),
  "password-pin-totp": Object.freeze(["password", "pin", "totp"] as const),
});

type StoreFailure = Extract<OpenDesignToyLockResult, { ok: false }>;
type HashRecord = { digest: string; salt: string };
type CredentialRecord = { password?: HashRecord; pin?: HashRecord; totp?: string };
type CredentialEnvelope = { credentials: Record<string, CredentialRecord>; generation: string; version: typeof STORE_VERSION };
type MetadataDocument = { generation: string; locks: OpenDesignToyLockMetadata[]; version: typeof STORE_VERSION };
type PointerDocument = { current: string; previous: string | null; version: typeof STORE_VERSION };
type Snapshot = { envelope: CredentialEnvelope; metadata: MetadataDocument; pointer: PointerDocument };
type PendingEnrollment = {
  envelope: CredentialRecord; expectedRevision: number | null; expiresAtMs: number; maximumAttempts: number;
  expiryTimer: ReturnType<typeof setTimeout>;
  policy: Extract<OpenDesignToyLockPolicy, "password-totp" | "pin-totp" | "password-pin-totp">;
  secret: Buffer; targetId: OpenDesignSettingsToyLockTarget;
};

class StoreOperationError extends Error {
  constructor(readonly code: "persistence-failed" | "protection-failed") { super(code); }
}
export interface ToyLockOsProtection { isAvailable(): boolean; protect(value: string): Buffer; unprotect(value: Buffer): string }
export interface ToyLockFileOps { mkdir: typeof mkdir; readFile: typeof readFile; rename: typeof rename; unlink: typeof unlink; writeFile: typeof writeFile }
export interface ToyLockStoreOptions { deriveKey?: (value: string, salt: Buffer) => Promise<Buffer>; directory: string; fileOps?: ToyLockFileOps; now?: () => number; osProtection: ToyLockOsProtection; randomBytes?: (size: number) => Buffer }

const failure = (code: StoreFailure["code"]): StoreFailure => ({ code, ok: false });
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean { const set = new Set(allowed); return Object.keys(value).every((key) => set.has(key)); }
const isTarget = (value: unknown): value is OpenDesignSettingsToyLockTarget => typeof value === "string" && TARGETS.has(value);
const isPolicy = (value: unknown): value is OpenDesignToyLockPolicy => typeof value === "string" && POLICIES.has(value);
const isFactor = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= MAX_FACTOR_CHARS;
const isGeneration = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{24}$/.test(value);
const validClock = (value: number): boolean => Number.isSafeInteger(value) && value >= 0
  && BigInt(Math.floor(value / TOTP_PERIOD_MS)) <= MAX_HOTP_COUNTER;

function validMetadata(value: unknown): value is OpenDesignToyLockMetadata {
  if (!isRecord(value) || !hasOnlyKeys(value, ["cooldownUntilMs", "maximumAttempts", "policy", "remainingAttempts", "revision", "targetId"])) return false;
  return isTarget(value.targetId) && isPolicy(value.policy)
    && Number.isSafeInteger(value.revision) && Number(value.revision) >= 1
    && Number.isSafeInteger(value.maximumAttempts) && Number(value.maximumAttempts) >= 1 && Number(value.maximumAttempts) <= MAXIMUM_ATTEMPTS_LIMIT
    && Number.isSafeInteger(value.remainingAttempts) && Number(value.remainingAttempts) >= 0 && Number(value.remainingAttempts) <= Number(value.maximumAttempts)
    && (value.cooldownUntilMs === null || (Number.isSafeInteger(value.cooldownUntilMs) && Number(value.cooldownUntilMs) >= 0));
}
function validHash(value: unknown): value is HashRecord {
  if (!isRecord(value) || !hasOnlyKeys(value, ["digest", "salt"]) || typeof value.digest !== "string" || typeof value.salt !== "string") return false;
  const digest = Buffer.from(value.digest, "base64"); const salt = Buffer.from(value.salt, "base64");
  return digest.length === HASH_BYTES && salt.length === SALT_BYTES
    && digest.toString("base64") === value.digest && salt.toString("base64") === value.salt;
}
function validCredential(value: unknown): value is CredentialRecord {
  if (!isRecord(value) || !hasOnlyKeys(value, ["password", "pin", "totp"])) return false;
  return (value.pin === undefined || validHash(value.pin)) && (value.password === undefined || validHash(value.password))
    && (value.totp === undefined || (typeof value.totp === "string" && Buffer.from(value.totp, "base64").length > 0
      && Buffer.from(value.totp, "base64").length <= 256 && Buffer.from(value.totp, "base64").toString("base64") === value.totp));
}
const publicMetadata = (value: OpenDesignToyLockMetadata): OpenDesignToyLockMetadata => Object.freeze({ ...value });
async function defaultDeriveKey(value: string, salt: Buffer): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    scrypt(value, salt, HASH_BYTES, SCRYPT_OPTIONS, (error, derivedKey) => {
      if (error) reject(error); else resolve(derivedKey);
    });
  });
}
async function hashFactor(value: string, random: (size: number) => Buffer, derive: (value: string, salt: Buffer) => Promise<Buffer>): Promise<HashRecord> {
  const salt = random(SALT_BYTES); const digest = await derive(value, salt);
  return { digest: digest.toString("base64"), salt: salt.toString("base64") };
}
async function matchesHash(value: string, record: HashRecord, derive: (value: string, salt: Buffer) => Promise<Buffer>): Promise<boolean> {
  const expected = Buffer.from(record.digest, "base64");
  const actual = await derive(value, Buffer.from(record.salt, "base64"));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function decodeCanonicalBase32(value: unknown): Buffer | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 256 || !/^[A-Z2-7]+=*$/.test(value)) return null;
  const firstPadding = value.indexOf("="); const body = firstPadding < 0 ? value : value.slice(0, firstPadding);
  const padding = firstPadding < 0 ? 0 : value.length - firstPadding; const residue = body.length % 8;
  const paddingByResidue: Readonly<Record<number, number>> = Object.freeze({ 0: 0, 2: 6, 4: 4, 5: 3, 7: 1 });
  if (!(residue in paddingByResidue) || (padding !== 0 && (value.length % 8 !== 0 || padding !== paddingByResidue[residue]))) return null;
  let accumulator = 0; let bitCount = 0; const output: number[] = [];
  for (const character of body) {
    accumulator = (accumulator << 5) | "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(character); bitCount += 5;
    while (bitCount >= 8) { bitCount -= 8; output.push((accumulator >>> bitCount) & 0xff); accumulator &= (1 << bitCount) - 1; }
  }
  if (bitCount > 0 && accumulator !== 0) return null;
  return output.length > 0 ? Buffer.from(output) : null;
}
function hotp(secret: Buffer, counter: number): string {
  const bytes = Buffer.alloc(8); bytes.writeBigUInt64BE(BigInt(counter)); const digest = createHmac("sha1", secret).update(bytes).digest();
  const offset = digest[digest.length - 1]! & 0x0f; return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}
export function matchesToyLockTotp(secret: Buffer, code: unknown, nowMs: number): boolean {
  if (!validClock(nowMs) || typeof code !== "string" || !/^\d{6}$/.test(code)) return false;
  const counter = Math.floor(nowMs / TOTP_PERIOD_MS); let matched = 0;
  for (const delta of [-1, 0, 1]) { const candidate = counter + delta; if (candidate < 0) continue; matched |= timingSafeEqual(Buffer.from(hotp(secret, candidate)), Buffer.from(code)) ? 1 : 0; }
  return matched === 1;
}
async function delay(ms: number): Promise<void> { if (ms > 0) await new Promise<void>((resolve) => setTimeout(resolve, ms)); }

export class SettingsToyLockStore {
  readonly #directory: string; readonly #files: ToyLockFileOps; readonly #now: () => number;
  readonly #protection: ToyLockOsProtection; readonly #random: (size: number) => Buffer;
  readonly #derive: (value: string, salt: Buffer) => Promise<Buffer>;
  readonly #pendingTargets = new Set<string>(); readonly #enrollments = new Map<string, PendingEnrollment>();
  #pendingCount = 0; #tail: Promise<void> = Promise.resolve();
  constructor(options: ToyLockStoreOptions) {
    this.#directory = options.directory; this.#files = options.fileOps ?? { mkdir, readFile, rename, unlink, writeFile };
    this.#now = options.now ?? Date.now; this.#protection = options.osProtection; this.#random = options.randomBytes ?? randomBytes; this.#derive = options.deriveKey ?? defaultDeriveKey;
  }
  list(): Promise<OpenDesignToyLockResult<{ locks: OpenDesignToyLockMetadata[]; protectionAvailable: boolean }>> {
    return this.#submit(null, async () => { const loaded = await this.#load(); return loaded.ok
      ? { locks: loaded.snapshot.metadata.locks.map(publicMetadata), ok: true, protectionAvailable: this.#protection.isAvailable() } : loaded; });
  }
  configure(request: OpenDesignToyLockConfigureRequest): Promise<OpenDesignToyLockResult<{ lock: OpenDesignToyLockMetadata }>> {
    const target = isRecord(request) && isTarget(request.targetId) ? request.targetId : null;
    return this.#submit(target, async () => {
      const parsed = this.#parseConfigure(request, false); if (!parsed.ok) return parsed;
      if (TOTP_POLICIES.has(parsed.request.policy)) return failure("invalid-input");
      if (!this.#protection.isAvailable()) return failure("os-protection-unavailable");
      const loaded = await this.#load(); if (!loaded.ok) return loaded;
      const current = loaded.snapshot.metadata.locks.find((lock) => lock.targetId === parsed.request.targetId);
      if ((current?.revision ?? null) !== parsed.request.expectedRevision) return failure("stale-revision");
      const credential = await this.#buildCredential(parsed.request.policy, parsed.request.factors);
      const next = this.#nextMetadata(parsed.request, current?.revision ?? 0); const written = await this.#commit(loaded.snapshot, next, credential);
      return written.ok ? { lock: publicMetadata(next), ok: true } : written;
    });
  }
  beginTotpEnrollment(request: OpenDesignToyLockBeginTotpEnrollmentRequest): Promise<OpenDesignToyLockResult<{ enrollmentId: string; expiresAtMs: number }>> {
    const target = isRecord(request) && isTarget(request.targetId) ? request.targetId : null;
    return this.#submit(target, async () => {
      const now = this.#now(); if (!validClock(now)) return failure("clock-invalid");
      for (const [id, pending] of this.#enrollments) if (pending.expiresAtMs <= now) { clearTimeout(pending.expiryTimer); this.#enrollments.delete(id); }
      if (this.#enrollments.size >= MAX_PENDING_ENROLLMENTS || [...this.#enrollments.values()].some((entry) => entry.targetId === target)) return failure("busy");
      const parsed = this.#parseConfigure(request as OpenDesignToyLockConfigureRequest, true); if (!parsed.ok) return parsed;
      if (!TOTP_POLICIES.has(parsed.request.policy)) return failure("invalid-input");
      if (!this.#protection.isAvailable()) return failure("os-protection-unavailable");
      const secret = decodeCanonicalBase32(parsed.request.factors.totpSecretBase32); if (secret == null) return failure("invalid-input");
      const loaded = await this.#load(); if (!loaded.ok) return loaded;
      const current = loaded.snapshot.metadata.locks.find((lock) => lock.targetId === parsed.request.targetId);
      if ((current?.revision ?? null) !== parsed.request.expectedRevision) return failure("stale-revision");
      const envelope = await this.#buildCredential(parsed.request.policy, parsed.request.factors);
      let enrollmentId = "";
      for (let attempt = 0; attempt < 3 && (enrollmentId.length === 0 || this.#enrollments.has(enrollmentId)); attempt += 1) enrollmentId = this.#random(16).toString("hex");
      if (!/^[a-f0-9]{32}$/.test(enrollmentId) || this.#enrollments.has(enrollmentId)) return failure("operation-failed");
      const expiresAtMs = now + TOTP_ENROLLMENT_TTL_MS;
      const expiryTimer = setTimeout(() => { this.#enrollments.delete(enrollmentId); }, TOTP_ENROLLMENT_TTL_MS);
      expiryTimer.unref();
      this.#enrollments.set(enrollmentId, { envelope, expectedRevision: parsed.request.expectedRevision, expiresAtMs, expiryTimer,
        maximumAttempts: parsed.request.maximumAttempts!, policy: parsed.request.policy as PendingEnrollment["policy"], secret, targetId: parsed.request.targetId });
      return { enrollmentId, expiresAtMs, ok: true };
    });
  }
  confirmTotpEnrollment(request: OpenDesignToyLockConfirmTotpEnrollmentRequest): Promise<OpenDesignToyLockResult<{ lock: OpenDesignToyLockMetadata }>> {
    const target = isRecord(request) && isTarget(request.targetId) ? request.targetId : null;
    return this.#submit(target, async () => {
      if (!isRecord(request) || !hasOnlyKeys(request, ["code", "enrollmentId", "targetId"]) || !isTarget(request.targetId)
        || typeof request.enrollmentId !== "string" || !/^[a-f0-9]{32}$/.test(request.enrollmentId) || typeof request.code !== "string" || !/^\d{6}$/.test(request.code)) return failure("invalid-input");
      const pending = this.#enrollments.get(request.enrollmentId); if (pending == null || pending.targetId !== request.targetId) return failure("enrollment-not-found");
      const now = this.#now(); if (!validClock(now)) return failure("clock-invalid");
      if (now >= pending.expiresAtMs) { clearTimeout(pending.expiryTimer); this.#enrollments.delete(request.enrollmentId); return failure("enrollment-expired"); }
      if (!matchesToyLockTotp(pending.secret, request.code, now)) return failure("enrollment-mismatch");
      if (!this.#protection.isAvailable()) return failure("os-protection-unavailable");
      const loaded = await this.#load(); if (!loaded.ok) return loaded;
      const current = loaded.snapshot.metadata.locks.find((lock) => lock.targetId === pending.targetId);
      if ((current?.revision ?? null) !== pending.expectedRevision) return failure("stale-revision");
      const credential = { ...pending.envelope, totp: pending.secret.toString("base64") };
      const next = this.#nextMetadata({ maximumAttempts: pending.maximumAttempts, policy: pending.policy, targetId: pending.targetId }, current?.revision ?? 0);
      const written = await this.#commit(loaded.snapshot, next, credential); if (!written.ok) return written;
      clearTimeout(pending.expiryTimer); this.#enrollments.delete(request.enrollmentId); return { lock: publicMetadata(next), ok: true };
    });
  }
  remove(targetId: OpenDesignSettingsToyLockTarget, expectedRevision: number): Promise<OpenDesignToyLockResult> {
    return this.#submit(isTarget(targetId) ? targetId : null, async () => {
      if (!isTarget(targetId)) return failure("target-refused"); if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) return failure("invalid-input");
      if (!this.#protection.isAvailable()) return failure("os-protection-unavailable");
      const loaded = await this.#load(); if (!loaded.ok) return loaded; const current = loaded.snapshot.metadata.locks.find((lock) => lock.targetId === targetId);
      if (current == null) return failure("not-configured"); if (current.revision !== expectedRevision) return failure("stale-revision");
      const working = structuredClone(loaded.snapshot); working.metadata.locks = working.metadata.locks.filter((lock) => lock.targetId !== targetId); delete working.envelope.credentials[targetId];
      return this.#writeGeneration(working, loaded.snapshot.pointer);
    });
  }
  verify(request: OpenDesignToyLockVerifyRequest): Promise<OpenDesignToyLockResult<{ lock: OpenDesignToyLockMetadata; matched: boolean }>> {
    const target = isRecord(request) && isTarget(request.targetId) ? request.targetId : null;
    return this.#submit(target, async () => {
      if (!isRecord(request) || !hasOnlyKeys(request, ["factors", "revision", "targetId"]) || !isTarget(request.targetId)
        || !Number.isSafeInteger(request.revision) || request.revision < 1 || !isRecord(request.factors) || !hasOnlyKeys(request.factors, ["password", "pin", "totp"])) return failure("invalid-input");
      if (!this.#protection.isAvailable()) return failure("os-protection-unavailable");
      const loaded = await this.#load(); if (!loaded.ok) return loaded; const lock = loaded.snapshot.metadata.locks.find((entry) => entry.targetId === request.targetId);
      if (lock == null) return failure("not-configured"); if (lock.revision !== request.revision) return failure("stale-revision");
      const now = this.#now(); if (!validClock(now)) return failure("clock-invalid");
      if (lock.cooldownUntilMs != null && lock.cooldownUntilMs > now) return failure("cooldown-active");
      if (lock.cooldownUntilMs != null) { lock.cooldownUntilMs = null; lock.remainingAttempts = lock.maximumAttempts; }
      const expected = POLICY_FACTORS[lock.policy]; const supplied = Object.keys(request.factors).filter((key) => request.factors[key as keyof typeof request.factors] !== undefined);
      if (supplied.length !== expected.length || supplied.some((factor) => !expected.includes(factor as never))) return failure("invalid-input");
      const credential = loaded.snapshot.envelope.credentials[request.targetId]; if (!validCredential(credential)) return failure("store-corrupt"); let matched = true;
      for (const factor of expected) {
        const value = request.factors[factor]; if (!isFactor(value)) return failure("invalid-input");
        if (factor === "pin") { if (!/^\d{4,12}$/.test(value)) return failure("invalid-input"); matched = await matchesHash(value, credential.pin!, this.#derive) && matched; }
        else if (factor === "password") matched = await matchesHash(value, credential.password!, this.#derive) && matched;
        else matched = matchesToyLockTotp(Buffer.from(credential.totp!, "base64"), value, now) && matched;
      }
      if (matched) { lock.remainingAttempts = lock.maximumAttempts; lock.cooldownUntilMs = null; }
      else { lock.remainingAttempts = Math.max(0, lock.remainingAttempts - 1); if (lock.remainingAttempts === 0) lock.cooldownUntilMs = now + COOLDOWN_MS; }
      const written = await this.#writeGeneration(loaded.snapshot, loaded.snapshot.pointer);
      return written.ok ? { lock: publicMetadata(lock), matched, ok: true } : written;
    });
  }
  #parseConfigure(request: OpenDesignToyLockConfigureRequest, requireTotp: boolean): { ok: true; request: OpenDesignToyLockConfigureRequest & { maximumAttempts: number } } | StoreFailure {
    if (!isRecord(request) || !hasOnlyKeys(request, ["expectedRevision", "factors", "maximumAttempts", "policy", "targetId"]) || !isTarget(request.targetId)
      || !isPolicy(request.policy) || !isRecord(request.factors) || !hasOnlyKeys(request.factors, ["password", "pin", "totpSecretBase32"])) return failure("invalid-input");
    if (request.expectedRevision !== null && (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 1)) return failure("invalid-input");
    const maximumAttempts = request.maximumAttempts ?? DEFAULT_MAXIMUM_ATTEMPTS;
    if (!Number.isSafeInteger(maximumAttempts) || maximumAttempts < 1 || maximumAttempts > MAXIMUM_ATTEMPTS_LIMIT) return failure("invalid-input");
    const factors = POLICY_FACTORS[request.policy]; if (requireTotp !== factors.includes("totp")) return failure("invalid-input");
    for (const factor of factors) { const value = request.factors[factor === "totp" ? "totpSecretBase32" : factor]; if (!isFactor(value) || (factor === "pin" && !/^\d{4,12}$/.test(value))) return failure("invalid-input"); }
    const supplied = Object.keys(request.factors).filter((key) => request.factors[key as keyof typeof request.factors] !== undefined); if (supplied.length !== factors.length) return failure("invalid-input");
    return { ok: true, request: { ...request, maximumAttempts } };
  }
  async #buildCredential(policy: OpenDesignToyLockPolicy, factors: OpenDesignToyLockConfigureRequest["factors"]): Promise<CredentialRecord> {
    const record: CredentialRecord = {}; if (POLICY_FACTORS[policy].includes("pin")) record.pin = await hashFactor(factors.pin!, this.#random, this.#derive);
    if (POLICY_FACTORS[policy].includes("password")) record.password = await hashFactor(factors.password!, this.#random, this.#derive); return record;
  }
  #nextMetadata(request: Pick<OpenDesignToyLockConfigureRequest, "maximumAttempts" | "policy" | "targetId">, revision: number): OpenDesignToyLockMetadata {
    const maximumAttempts = request.maximumAttempts ?? DEFAULT_MAXIMUM_ATTEMPTS;
    return { cooldownUntilMs: null, maximumAttempts, policy: request.policy, remainingAttempts: maximumAttempts, revision: revision + 1, targetId: request.targetId };
  }
  #submit<T>(targetId: string | null, operation: () => Promise<T>): Promise<T | StoreFailure> {
    if (this.#pendingCount >= MAX_PENDING_OPERATIONS || (targetId != null && this.#pendingTargets.has(targetId))) return Promise.resolve(failure("busy"));
    this.#pendingCount += 1; if (targetId != null) this.#pendingTargets.add(targetId); const prior = this.#tail; let release!: () => void;
    this.#tail = new Promise<void>((resolve) => { release = resolve; });
    return prior.then(operation).catch((error: unknown) => error instanceof StoreOperationError ? failure(error.code) : failure("operation-failed")).finally(() => {
      this.#pendingCount -= 1; if (targetId != null) this.#pendingTargets.delete(targetId); release();
    });
  }
  async #readBounded(path: string): Promise<Buffer | null> {
    try { const value = await this.#files.readFile(path); return value.length <= MAX_FILE_BYTES ? value : null; }
    catch (error) { if (isRecord(error) && error.code === "ENOENT") return null; throw new StoreOperationError("persistence-failed"); }
  }
  async #readGeneration(generation: string): Promise<{ envelope: CredentialEnvelope; metadata: MetadataDocument } | null> {
    const metadataBytes = await this.#readBounded(join(this.#directory, `metadata.${generation}.json`)); const envelopeBytes = await this.#readBounded(join(this.#directory, `credentials.${generation}.bin`));
    if (metadataBytes == null || envelopeBytes == null) return null; let metadataValue: unknown; let envelopeValue: unknown;
    try { metadataValue = JSON.parse(metadataBytes.toString("utf8")); if (!this.#protection.isAvailable()) return null; envelopeValue = JSON.parse(this.#protection.unprotect(envelopeBytes)); } catch { return null; }
    if (!isRecord(metadataValue) || !hasOnlyKeys(metadataValue, ["generation", "locks", "version"]) || metadataValue.version !== STORE_VERSION || metadataValue.generation !== generation || !Array.isArray(metadataValue.locks) || !metadataValue.locks.every(validMetadata)
      || !isRecord(envelopeValue) || !hasOnlyKeys(envelopeValue, ["credentials", "generation", "version"]) || envelopeValue.version !== STORE_VERSION || envelopeValue.generation !== generation || !isRecord(envelopeValue.credentials)) return null;
    const locks = metadataValue.locks as OpenDesignToyLockMetadata[]; if (locks.length > OPEN_DESIGN_SETTINGS_TOY_LOCK_TARGETS.length || new Set(locks.map((lock) => lock.targetId)).size !== locks.length) return null;
    const credentials = envelopeValue.credentials as Record<string, unknown>;
    const keys = Object.keys(credentials); if (keys.length !== locks.length || keys.some((key) => !isTarget(key) || !validCredential(credentials[key]))) return null;
    if (locks.some((lock) => { const record = credentials[lock.targetId] as CredentialRecord; const required = POLICY_FACTORS[lock.policy]; return Object.keys(record).length !== required.length || required.some((factor) => record[factor] == null); })) return null;
    return { envelope: { credentials: credentials as Record<string, CredentialRecord>, generation, version: STORE_VERSION }, metadata: { generation, locks: locks.map((lock) => ({ ...lock })), version: STORE_VERSION } };
  }
  async #readPointer(name: "current" | "previous"): Promise<PointerDocument | null | false> {
    const bytes = await this.#readBounded(join(this.#directory, `${name}.json`)); if (bytes == null) return null;
    try { const value: unknown = JSON.parse(bytes.toString("utf8")); return isRecord(value) && hasOnlyKeys(value, ["current", "previous", "version"]) && value.version === STORE_VERSION && isGeneration(value.current) && (value.previous === null || isGeneration(value.previous)) ? value as PointerDocument : false; }
    catch { return false; }
  }
  async #load(): Promise<{ ok: true; snapshot: Snapshot } | StoreFailure> {
    const pointer = await this.#readPointer("current");
    if (pointer === false) { const backup = await this.#readPointer("previous"); if (backup !== null && backup !== false) { const restored = await this.#readGeneration(backup.current); return restored == null ? failure("store-corrupt") : { ok: true, snapshot: { ...restored, pointer: backup } }; } return failure("store-corrupt"); }
    if (pointer == null) { const backup = await this.#readPointer("previous"); if (backup === false) return failure("store-corrupt"); if (backup != null) { const restored = await this.#readGeneration(backup.current); return restored == null ? failure("store-corrupt") : { ok: true, snapshot: { ...restored, pointer: backup } }; }
      const generation = "000000000000000000000000"; return { ok: true, snapshot: { envelope: { credentials: {}, generation, version: STORE_VERSION }, metadata: { generation, locks: [], version: STORE_VERSION }, pointer: { current: generation, previous: null, version: STORE_VERSION } } }; }
    if (!this.#protection.isAvailable()) return failure("os-protection-unavailable");
    const current = await this.#readGeneration(pointer.current); if (current != null) return { ok: true, snapshot: { ...current, pointer } };
    const backupPointer = await this.#readPointer("previous");
    const fallbackGeneration = pointer.previous ?? (backupPointer !== null && backupPointer !== false ? backupPointer.current : null); if (fallbackGeneration == null) return failure("store-corrupt");
    const fallback = await this.#readGeneration(fallbackGeneration); return fallback == null ? failure("store-corrupt") : { ok: true, snapshot: { ...fallback, pointer: { current: fallbackGeneration, previous: null, version: STORE_VERSION } } };
  }
  async #commit(snapshot: Snapshot, next: OpenDesignToyLockMetadata, credential: CredentialRecord): Promise<StoreFailure | { ok: true }> {
    const working = structuredClone(snapshot); working.metadata.locks = working.metadata.locks.filter((lock) => lock.targetId !== next.targetId).concat(next); working.envelope.credentials[next.targetId] = credential;
    return this.#writeGeneration(working, snapshot.pointer);
  }
  async #atomicWrite(path: string, bytes: string | Buffer, nonce: string): Promise<void> {
    try { await this.#files.mkdir(dirname(path), { recursive: true }); const temporary = `${path}.${process.pid}.${nonce}.tmp`; await this.#files.writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
      try { for (let index = 0; index < RENAME_RETRY_DELAYS_MS.length; index += 1) { await delay(RENAME_RETRY_DELAYS_MS[index]!); try { await this.#files.rename(temporary, path); return; } catch (error) { const code = isRecord(error) && typeof error.code === "string" ? error.code : ""; if (!TRANSIENT_RENAME_CODES.has(code) || index === RENAME_RETRY_DELAYS_MS.length - 1) throw error; } } }
      finally { await this.#files.unlink(temporary).catch(() => undefined); } } catch { throw new StoreOperationError("persistence-failed"); }
  }
  async #writeGeneration(snapshot: Snapshot, prior: PointerDocument): Promise<StoreFailure | { ok: true }> {
    if (!this.#protection.isAvailable()) return failure("os-protection-unavailable");
    let generation = "";
    for (let attempt = 0; attempt < 3 && (generation.length === 0 || generation === prior.current || generation === prior.previous); attempt += 1) generation = this.#random(12).toString("hex");
    if (!isGeneration(generation) || generation === prior.current || generation === prior.previous) return failure("operation-failed");
    snapshot.metadata.generation = generation; snapshot.envelope.generation = generation;
    let protectedEnvelope: Buffer; try { protectedEnvelope = this.#protection.protect(JSON.stringify(snapshot.envelope)); } catch { return failure("protection-failed"); }
    const pointer: PointerDocument = { current: generation, previous: prior.current === "000000000000000000000000" ? null : prior.current, version: STORE_VERSION };
    await this.#atomicWrite(join(this.#directory, `credentials.${generation}.bin`), protectedEnvelope, `${generation}.credentials`);
    await this.#atomicWrite(join(this.#directory, `metadata.${generation}.json`), JSON.stringify(snapshot.metadata), `${generation}.metadata`);
    if (prior.current !== "000000000000000000000000") await this.#atomicWrite(join(this.#directory, "previous.json"), JSON.stringify(prior), `${generation}.previous`);
    await this.#atomicWrite(join(this.#directory, "current.json"), JSON.stringify(pointer), `${generation}.current`);
    if (prior.previous != null) {
      await this.#files.unlink(join(this.#directory, `credentials.${prior.previous}.bin`)).catch(() => undefined);
      await this.#files.unlink(join(this.#directory, `metadata.${prior.previous}.json`)).catch(() => undefined);
    }
    return { ok: true };
  }
}
