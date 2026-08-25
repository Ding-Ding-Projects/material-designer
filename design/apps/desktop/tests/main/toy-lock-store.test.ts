import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test, vi } from "vitest";
import { OPEN_DESIGN_TOY_LOCK_POLICIES, type OpenDesignToyLockPolicy } from "@open-design/host";
import {
  decodeCanonicalBase32, matchesToyLockTotp, SettingsToyLockStore,
  type ToyLockFileOps, type ToyLockOsProtection,
} from "../../src/main/toy-lock-store.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true }))); });
const secretBase32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const factors = { password: "correct horse battery staple", pin: "2468", totpSecretBase32: secretBase32 } as const;
const verifyFactors = { password: factors.password, pin: factors.pin, totp: "287082" } as const;
function protection(): ToyLockOsProtection {
  return {
    isAvailable: vi.fn(() => true),
    protect: vi.fn((value) => Buffer.from(`protected:${value}`)),
    unprotect: vi.fn((value) => {
      const text = value.toString(); if (!text.startsWith("protected:")) throw new Error("native path must stay private");
      return text.slice("protected:".length);
    }),
  };
}
async function fixture(now = 59_000, osProtection = protection()) {
  const directory = await mkdtemp(join(tmpdir(), "toy-lock-store-")); roots.push(directory);
  return { directory, osProtection, store: new SettingsToyLockStore({ directory, now: () => now, osProtection }) };
}
function required(policy: OpenDesignToyLockPolicy): readonly ("pin" | "password" | "totp")[] {
  return {
    pin: ["pin"], password: ["password"], "pin-password": ["pin", "password"],
    "password-totp": ["password", "totp"], "pin-totp": ["pin", "totp"],
    "password-pin-totp": ["password", "pin", "totp"],
  }[policy] as readonly ("pin" | "password" | "totp")[];
}
async function configure(store: SettingsToyLockStore, policy: OpenDesignToyLockPolicy, targetId: "general" | "privacy" = "general") {
  const selected = Object.fromEntries(required(policy).map((factor) => [factor === "totp" ? "totpSecretBase32" : factor, factors[factor === "totp" ? "totpSecretBase32" : factor]]));
  if (!required(policy).includes("totp")) return store.configure({ expectedRevision: null, factors: selected, policy, targetId });
  const begun = await store.beginTotpEnrollment({ expectedRevision: null, factors: selected as never, policy: policy as never, targetId });
  if (!begun.ok) return begun;
  return store.confirmTotpEnrollment({ code: "287082", enrollmentId: begun.enrollmentId, targetId });
}

describe("SettingsToyLockStore", () => {
  test.each(OPEN_DESIGN_TOY_LOCK_POLICIES)("requires every factor and only every factor for %s", async (policy) => {
    const { store } = await fixture(); const configured = await configure(store, policy); expect(configured.ok).toBe(true);
    const exact = Object.fromEntries(required(policy).map((factor) => [factor, verifyFactors[factor]]));
    expect(await store.verify({ factors: exact, revision: 1, targetId: "general" })).toMatchObject({ matched: true, ok: true });
    for (const wrong of required(policy)) {
      const invalid = { ...exact, [wrong]: wrong === "pin" ? "0000" : wrong === "totp" ? "000000" : "wrong password" };
      expect(await store.verify({ factors: invalid, revision: 1, targetId: "general" })).toMatchObject({ matched: false, ok: true });
    }
    for (const missing of required(policy)) {
      const incomplete = { ...exact }; delete incomplete[missing];
      expect(await store.verify({ factors: incomplete, revision: 1, targetId: "general" })).toEqual({ code: "invalid-input", ok: false });
    }
    const extra = required(policy).includes("totp") ? { ...exact, surprise: "x" } : { ...exact, totp: "287082" };
    expect(await store.verify({ factors: extra as never, revision: 1, targetId: "general" })).toEqual({ code: "invalid-input", ok: false });
  });

  test("rejects direct TOTP activation and retains the old lock on mismatch, expiry, or abandonment", async () => {
    let now = 59_000; const { directory, osProtection, store } = await fixture(now);
    expect((await store.configure({ expectedRevision: null, factors, policy: "pin-totp", targetId: "general" })).ok).toBe(false);
    await store.configure({ expectedRevision: null, factors: { pin: "2468" }, policy: "pin", targetId: "general" });
    const live = new SettingsToyLockStore({ directory, now: () => now, osProtection });
    const pinTotpFactors = { pin: factors.pin, totpSecretBase32: factors.totpSecretBase32 };
    const pending = await live.beginTotpEnrollment({ expectedRevision: 1, factors: pinTotpFactors, policy: "pin-totp", targetId: "general" }); expect(pending.ok).toBe(true);
    if (!pending.ok) return;
    expect(await live.confirmTotpEnrollment({ code: "000000", enrollmentId: pending.enrollmentId, targetId: "general" })).toEqual({ code: "enrollment-mismatch", ok: false });
    expect(await live.verify({ factors: { pin: "2468" }, revision: 1, targetId: "general" })).toMatchObject({ matched: true, ok: true });
    const abandoned = await live.beginTotpEnrollment({ expectedRevision: null, factors: pinTotpFactors, policy: "pin-totp", targetId: "privacy" }); expect(abandoned.ok).toBe(true);
    now += 300_001;
    expect(await live.confirmTotpEnrollment({ code: "287082", enrollmentId: pending.enrollmentId, targetId: "general" })).toEqual({ code: "enrollment-expired", ok: false });
    expect(await live.verify({ factors: { pin: "2468" }, revision: 1, targetId: "general" })).toMatchObject({ matched: true, ok: true });
  });

  test("protects hashes, salts, and TOTP together while metadata stays non-secret", async () => {
    const osProtection = protection(); const { directory, store } = await fixture(59_000, osProtection); await configure(store, "password-pin-totp");
    expect(osProtection.protect).toHaveBeenCalled(); const protectedInput = vi.mocked(osProtection.protect).mock.calls.at(-1)![0];
    expect(protectedInput).toMatch(/"digest"/); expect(protectedInput).toMatch(/"salt"/); expect(protectedInput).toMatch(/"totp"/);
    const pointer = JSON.parse(await readFile(join(directory, "current.json"), "utf8")) as { current: string };
    const metadata = await readFile(join(directory, `metadata.${pointer.current}.json`), "utf8");
    expect(metadata).not.toMatch(/digest|salt|credentials/i);
    for (const plaintext of Object.values(factors)) expect(metadata).not.toContain(plaintext);
    for (const plaintext of Object.values(factors)) expect(await readFile(join(directory, `credentials.${pointer.current}.bin`), "utf8")).not.toContain(plaintext);
  });

  test("refuses duplicate target work and bounds the global pending queue", async () => {
    const base = await fixture(); await base.store.configure({ expectedRevision: null, factors: { pin: "2468" }, policy: "pin", targetId: "general" });
    const gate = Promise.withResolvers<void>(); const real = await import("node:fs/promises");
    const fileOps = { ...real, readFile: vi.fn(async (path: Parameters<typeof real.readFile>[0]) => { await gate.promise; return real.readFile(path); }) as unknown as typeof real.readFile } as ToyLockFileOps;
    const store = new SettingsToyLockStore({ directory: base.directory, fileOps, now: () => 59_000, osProtection: base.osProtection });
    const first = store.verify({ factors: { pin: "2468" }, revision: 1, targetId: "general" });
    expect(await store.verify({ factors: { pin: "2468" }, revision: 1, targetId: "general" })).toEqual({ code: "busy", ok: false });
    const queued = Array.from({ length: 32 }, () => store.list()); expect(await queued.at(-1)).toEqual({ code: "busy", ok: false });
    gate.resolve(); await Promise.all([first, ...queued]);
  });

  test("refuses stale revision and exhausted budget cooldown before scheduling asynchronous KDF work", async () => {
    let now = 59_000; const osProtection = protection(); const { directory } = await fixture(now, osProtection);
    const deriveKey = vi.fn(async (value: string, salt: Buffer) => createHash("sha256").update(salt).update(value).digest());
    const counted = new SettingsToyLockStore({ deriveKey, directory, now: () => now, osProtection });
    await counted.configure({ expectedRevision: null, factors: { pin: "2468" }, maximumAttempts: 1, policy: "pin", targetId: "general" });
    deriveKey.mockClear();
    expect(await counted.verify({ factors: { pin: "2468" }, revision: 2, targetId: "general" })).toEqual({ code: "stale-revision", ok: false });
    expect(deriveKey).not.toHaveBeenCalled();
    await counted.verify({ factors: { pin: "0000" }, revision: 1, targetId: "general" });
    expect(deriveKey).toHaveBeenCalledTimes(1); deriveKey.mockClear();
    const restarted = new SettingsToyLockStore({ deriveKey, directory, now: () => now, osProtection });
    expect(await restarted.verify({ factors: { pin: "2468" }, revision: 1, targetId: "general" })).toEqual({ code: "cooldown-active", ok: false });
    expect(deriveKey).not.toHaveBeenCalled();
  });

  test.each(["", "123", "1234567890123", "12x4"])("rejects invalid PIN shape %s before KDF", async (pin) => {
    const { store } = await fixture();
    expect(await store.configure({ expectedRevision: null, factors: { pin }, policy: "pin", targetId: "general" })).toEqual({ code: "invalid-input", ok: false });
  });

  test("keeps the last complete generation usable across every write and rename failure", async () => {
    for (let failAt = 1; failAt <= 8; failAt += 1) {
      const base = await fixture(); await base.store.configure({ expectedRevision: null, factors: { pin: "2468" }, policy: "pin", targetId: "general" });
      const real = await import("node:fs/promises"); let count = 0;
      const maybeFail = async <T>(operation: () => Promise<T>): Promise<T> => { count += 1; if (count === failAt) throw Object.assign(new Error("private path"), { code: "EIO" }); return operation(); };
      const fileOps = { ...real,
        writeFile: ((path: Parameters<typeof real.writeFile>[0], data: string | Buffer, options: object) => maybeFail(() => real.writeFile(path, data, options as never))) as unknown as typeof real.writeFile,
        rename: ((oldPath: Parameters<typeof real.rename>[0], newPath: Parameters<typeof real.rename>[1]) => maybeFail(() => real.rename(oldPath, newPath))) as unknown as typeof real.rename,
      } as ToyLockFileOps;
      const failing = new SettingsToyLockStore({ directory: base.directory, fileOps, now: () => 59_000, osProtection: base.osProtection });
      const result = await failing.configure({ expectedRevision: null, factors: { pin: "1357" }, policy: "pin", targetId: "privacy" });
      expect(JSON.stringify(result)).not.toContain("private path");
      const recovered = new SettingsToyLockStore({ directory: base.directory, now: () => 59_000, osProtection: base.osProtection });
      expect(await recovered.verify({ factors: { pin: "2468" }, revision: 1, targetId: "general" })).toMatchObject({ matched: true, ok: true });
    }
  });

  test("rolls back from corrupt current protected bytes to the validated prior generation", async () => {
    const { directory, store } = await fixture();
    await store.configure({ expectedRevision: null, factors: { pin: "2468" }, policy: "pin", targetId: "general" });
    await store.configure({ expectedRevision: null, factors: { pin: "1357" }, policy: "pin", targetId: "privacy" });
    const pointer = JSON.parse(await readFile(join(directory, "current.json"), "utf8")) as { current: string };
    await writeFile(join(directory, `credentials.${pointer.current}.bin`), "corrupt", "utf8");
    expect(await store.list()).toMatchObject({ ok: true, locks: [{ targetId: "general" }] });
  });

  test("returns bounded codes for protection, KDF, read, write, and rename exceptions", async () => {
    const brokenProtection = protection(); vi.mocked(brokenProtection.protect).mockImplementation(() => { throw new Error("C:\\private\\path"); });
    const protectedFixture = await fixture(59_000, brokenProtection);
    expect(await protectedFixture.store.configure({ expectedRevision: null, factors: { pin: "2468" }, policy: "pin", targetId: "general" })).toEqual({ code: "protection-failed", ok: false });
    expect(JSON.stringify(await protectedFixture.store.list())).not.toContain("private");
    const kdfFixture = await fixture();
    const brokenKdf = new SettingsToyLockStore({
      deriveKey: async () => { throw new Error("C:\\private\\kdf"); },
      directory: kdfFixture.directory,
      now: () => 59_000,
      osProtection: kdfFixture.osProtection,
    });
    const kdfResult = await brokenKdf.configure({ expectedRevision: null, factors: { pin: "2468" }, policy: "pin", targetId: "general" });
    expect(kdfResult).toEqual({ code: "operation-failed", ok: false });
    expect(JSON.stringify(kdfResult)).not.toContain("private");
    const real = await import("node:fs/promises");
    const brokenRead = new SettingsToyLockStore({
      directory: kdfFixture.directory,
      fileOps: { ...real, readFile: vi.fn(async () => { throw Object.assign(new Error("C:\\private\\read"), { code: "EACCES" }); }) as unknown as typeof real.readFile },
      now: () => 59_000,
      osProtection: kdfFixture.osProtection,
    });
    const readResult = await brokenRead.list();
    expect(readResult).toEqual({ code: "persistence-failed", ok: false });
    expect(JSON.stringify(readResult)).not.toContain("private");
  });
});

describe("strict Base32 and toy-lock TOTP profile", () => {
  test.each([["MY", "f"], ["MY======", "f"], ["MZXQ", "fo"], ["MZXQ====", "fo"], ["MZXW6", "foo"], ["MZXW6===", "foo"], ["MZXW6YQ", "foob"], ["MZXW6YQ=", "foob"], ["MZXW6YTB", "fooba"]])("accepts canonical padded or unpadded RFC 4648 Base32 %s", (encoded, decoded) => expect(decodeCanonicalBase32(encoded)?.toString()).toBe(decoded));
  test.each(["M", "MZX", "MZ======", "MY=====", "my======", "MY======A", "MZXW6YQ=="])("rejects noncanonical %s", (value) => expect(decodeCanonicalBase32(value)).toBeNull());
  test("handles counter and code boundaries without negative counters", () => {
    const secret = decodeCanonicalBase32(secretBase32)!;
    expect(matchesToyLockTotp(secret, "755224", 0)).toBe(true); expect(matchesToyLockTotp(secret, "755224", 1)).toBe(true);
    expect(matchesToyLockTotp(secret, "755224", 29_999)).toBe(true); expect(matchesToyLockTotp(secret, "287082", 30_000)).toBe(true);
    expect(matchesToyLockTotp(secret, "755224", 30_000)).toBe(true); expect(matchesToyLockTotp(secret, "359152", 30_000)).toBe(true);
    expect(matchesToyLockTotp(secret, "755224", 60_000)).toBe(false);
    expect(matchesToyLockTotp(secret, "026920", 900_000)).toBe(true);
    for (const clock of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY]) expect(matchesToyLockTotp(secret, "755224", clock)).toBe(false);
    expect(() => matchesToyLockTotp(secret, "000000", Number.MAX_SAFE_INTEGER)).not.toThrow();
    for (const code of ["", "00000", "0000000", "12x456", "012345"]) expect(matchesToyLockTotp(secret, code, 0)).toBe(false);
  });

  test.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY])("returns clock-invalid before KDF for invalid clock %s", async (now) => {
    const base = await fixture(59_000); const deriveKey = vi.fn(async (value: string, salt: Buffer) => createHash("sha256").update(salt).update(value).digest());
    const configured = new SettingsToyLockStore({ deriveKey, directory: base.directory, now: () => 59_000, osProtection: base.osProtection });
    await configured.configure({ expectedRevision: null, factors: { pin: "2468" }, policy: "pin", targetId: "general" }); deriveKey.mockClear();
    const invalidClock = new SettingsToyLockStore({ deriveKey, directory: base.directory, now: () => now, osProtection: base.osProtection });
    expect(await invalidClock.verify({ factors: { pin: "2468" }, revision: 1, targetId: "general" })).toEqual({ code: "clock-invalid", ok: false });
    expect(deriveKey).not.toHaveBeenCalled();
  });
});
