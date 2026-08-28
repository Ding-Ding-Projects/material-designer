import { describe, expect, test } from "vitest";
import { AuthenticatorDestination } from "../../src/main/authenticator/destination.js";
import { AuthenticatorStore, type AuthenticatorEntry, type AuthenticatorMetadataStore, type SecretVault } from "../../src/main/authenticator/store.js";
import { ElectronSecretVault } from "../../src/main/authenticator/electron-vault.js";
import { buildOtpauthUri, decodeBase32, decodeLocalQr, encodeBase32, encodeLocalQr, hotp, nextTotp, parseOtpauthUri, secondsRemaining, totp } from "../../src/main/authenticator/protocol.js";
import { UnlockLadderHost, type LadderClock, type LadderRandom } from "../../src/main/lockout/service.js";

describe("local authenticator protocol", () => {
  test("strict Base32 round-trips and rejects non-zero trailing bits", () => {
    const bytes = Uint8Array.from([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
    expect(decodeBase32(encodeBase32(bytes))).toEqual(bytes);
    expect(() => decodeBase32("AB")).toThrow(/trailing bits/);
  });

  test("parses and builds a bounded otpauth URI without a network route", () => {
    const parameters = { issuer: "E", account: "a", secret: decodeBase32("JBSWY3DPEHPK3PXP"), algorithm: "SHA-1" as const, digits: 6 as const, period: 30 };
    const uri = buildOtpauthUri(parameters); expect(uri.startsWith("otpauth://totp/")).toBe(true); expect(parseOtpauthUri(uri)).toMatchObject({ issuer: parameters.issuer, account: parameters.account, algorithm: "SHA-1", digits: 6, period: 30 });
    const matrix = encodeLocalQr(uri); expect(matrix.modules).toHaveLength(37); expect(decodeLocalQr(matrix)).toBe(uri);
  });

  test("matches RFC 6238 SHA-1, SHA-256, and SHA-512 vectors", () => {
    const secret = new TextEncoder().encode("12345678901234567890");
    expect(totp({ secret, algorithm: "SHA-1", digits: 8, period: 30 }, 59_000)).toBe("94287082");
    expect(totp({ secret: new TextEncoder().encode("12345678901234567890123456789012"), algorithm: "SHA-256", digits: 8, period: 30 }, 59_000)).toBe("46119246");
    expect(totp({ secret: new TextEncoder().encode("1234567890123456789012345678901234567890123456789012345678901234"), algorithm: "SHA-512", digits: 8, period: 30 }, 59_000)).toBe("90693936");
    expect(hotp(secret, 0n, "SHA-1", 6)).toBe("755224");
    expect(secondsRemaining(30, 59_000)).toBe(1); expect(nextTotp({ secret, algorithm: "SHA-1", digits: 8, period: 30 }, 59_000)).toBe("00359152");
  });
});

describe("authenticator destination and local store", () => {
  class MemoryVault implements SecretVault { readonly kind = "operating-system-vault" as const; #values = new Map<string, Uint8Array>(); async put(key: string, secret: Uint8Array) { this.#values.set(key, secret.slice()); } async get(key: string) { return this.#values.get(key)?.slice() ?? null; } async delete(key: string) { this.#values.delete(key); } }
  class MemoryMetadata implements AuthenticatorMetadataStore { entries: AuthenticatorEntry[] = []; async read() { return this.entries; } async write(entries: AuthenticatorEntry[]) { this.entries = entries; } }

  test("requires a current code before arming and keeps secrets in the vault", async () => {
    const metadata = new MemoryMetadata(); const vault = new MemoryVault(); const store = await AuthenticatorStore.open({ metadata, vault, id: () => "entry-1" }); const now = 1_700_000_000_000;
    const destination = new AuthenticatorDestination({ store, now: () => now, qrDecoder: { decode: () => { throw new Error("not used"); } } }); const parameters = { issuer: "Example", account: "designer@example.invalid", secret: decodeBase32("JBSWY3DPEHPK3PXP"), algorithm: "SHA-1" as const, digits: 6 as const, period: 30 };
    await expect(destination.register({ kind: "manual", value: { issuer: parameters.issuer, account: parameters.account, secret: "JBSWY3DPEHPK3PXP" }, confirmationCode: "000000" })).rejects.toThrow(/current authenticator code/);
    const entry = await destination.register({ kind: "manual", value: { issuer: parameters.issuer, account: parameters.account, secret: "JBSWY3DPEHPK3PXP" }, confirmationCode: totp(parameters, now) }); expect(await store.secret(entry.id)).toEqual(parameters.secret); expect(metadata.entries[0]).not.toHaveProperty("secret");
    expect(store.exportPublic()).toMatchObject({ secretsOmitted: true }); await expect(store.exportCleartext([entry.id], { kind: "super-confirmation", isValid: () => false })).rejects.toThrow(/super confirmation/);
    await expect(store.exportCleartext([entry.id], { kind: "super-confirmation", isValid: () => true })).resolves.toMatchObject({ entries: [{ secret: "JBSWY3DPEHPK3PXP" }] });
  });

  test("exposes grouped code state and rejects unavailable camera capability", async () => {
    const metadata = new MemoryMetadata(); const vault = new MemoryVault(); const store = await AuthenticatorStore.open({ metadata, vault, id: () => "entry-1" }); const now = 1_700_000_000_000; const destination = new AuthenticatorDestination({ store, now: () => now, qrDecoder: { decode: () => "" }, camera: { available: false, read: async () => "" } });
    await expect(destination.register({ kind: "camera", confirmationCode: "000000" })).rejects.toThrow(/Camera QR capture is unavailable/);
    const parameters = { issuer: "Example", account: "designer@example.invalid", secret: decodeBase32("JBSWY3DPEHPK3PXP"), algorithm: "SHA-1" as const, digits: 6 as const, period: 30 }; const entry = await destination.register({ kind: "manual", value: { issuer: parameters.issuer, account: parameters.account, secret: "JBSWY3DPEHPK3PXP" }, confirmationCode: totp(parameters, now) }); const view = await destination.view(entry.id); expect(view.currentCode).toMatch(/^\d{3} \d{3}$/); let copied = ""; await destination.copyCurrentCode(entry.id, { writeText: async (value) => { copied = value; } }); expect(copied).toHaveLength(6);
  });

  test("platform vault adapter fails closed without safeStorage and never writes plaintext", async () => {
    const writes: string[] = [];
    const vault = new ElectronSecretVault({ directory: "/isolated-vault", safeStorage: { isEncryptionAvailable: () => false, encryptString: () => { throw new Error("should not be called"); }, decryptString: () => { throw new Error("should not be called"); } }, fileOps: { mkdir: async () => undefined, writeFile: async (_path, data) => { writes.push(String(data)); }, rename: async () => undefined, unlink: async () => undefined, readFile: async () => "" } });
    await expect(vault.put("authenticator:entry", Uint8Array.from([1, 2, 3]))).rejects.toThrow(/operating-system credential vault is unavailable/); expect(writes).toEqual([]);
  });
});

describe("host-owned unlock ladder", () => {
  class FakeClock implements LadderClock { value = 1_000_000; now() { return this.value; } }
  class FakeRandom implements LadderRandom { next = 0; uuid() { this.next += 1; return `nonce-${this.next}`; } integer(maxExclusive: number) { return this.next++ % maxExclusive; } }

  test("School mode starts at sums, clears only the wait, and preserves attempts", () => {
    const clock = new FakeClock(); const random = new FakeRandom(); const host = new UnlockLadderHost({ clock, random }); const initial = host.recordLockout("lock", { waitingUntilMs: clock.value + 60_000, remainingAttempts: 2, consecutiveLockouts: 4, schoolMode: true }); const challenge = host.issue("lock"); expect(challenge).toMatchObject({ stage: "sums" }); if ("nonce" in challenge && challenge.sums) { const answer = challenge.sums.map((sum) => sum.left + sum.right); const result = host.submit("lock", challenge.nonce, answer); expect(result).toMatchObject({ ok: true, clearedWait: true }); expect(host.state("lock")).toMatchObject({ waitingUntilMs: clock.value, remainingAttempts: initial.remainingAttempts, consecutiveLockouts: initial.consecutiveLockouts }); }
  });

  test("five wrong dishes escalate to sums without refunding credentials or attempts", () => {
    const clock = new FakeClock(); const random = new FakeRandom(); const host = new UnlockLadderHost({ clock, random }); host.recordLockout("lock", { waitingUntilMs: clock.value + 60_000, remainingAttempts: 3, consecutiveLockouts: 2 });
    for (let i = 0; i < 5; i++) { const challenge = host.issue("lock"); expect(challenge).toMatchObject({ stage: "dish" }); if ("nonce" in challenge) expect(host.submit("lock", challenge.nonce, "wrong")).toMatchObject({ ok: false, code: "wrong-answer" }); }
    expect(host.state("lock")).toMatchObject({ stage: "sums", remainingAttempts: 3 });
  });

  test("mole submissions are single-use, reject early completion, and grade each mole once", () => {
    const clock = new FakeClock(); const random = new FakeRandom(); const host = new UnlockLadderHost({ clock, random }); host.recordLockout("lock", { waitingUntilMs: clock.value + 60_000, remainingAttempts: 3, consecutiveLockouts: 1 });
    for (let i = 0; i < 5; i++) { const dish = host.issue("lock"); if ("nonce" in dish) host.submit("lock", dish.nonce, 99); }
    const sums = host.issue("lock"); if ("nonce" in sums && sums.sums) host.submit("lock", sums.nonce, sums.sums.map((sum) => sum.left + sum.right)); const mole = host.issue("lock"); expect(mole).toMatchObject({ stage: "mole" }); if ("nonce" in mole && mole.moles) { expect(host.submit("lock", mole.nonce, [])).toMatchObject({ ok: false, code: "early-submit" }); expect(host.submit("lock", mole.nonce, [])).toMatchObject({ ok: false, code: "already-used" }); }
  });

  test("shares the three-use rolling budget across lockouts without refunding an attempt", () => {
    const clock = new FakeClock(); const random = { uuid: (() => { let n = 0; return () => `nonce-${++n}`; })(), integer: () => 0 }; const host = new UnlockLadderHost({ clock, random });
    for (let index = 0; index < 3; index++) { host.recordLockout(`lock-${index}`, { budgetKey: "account", waitingUntilMs: clock.value + 60_000, remainingAttempts: 2, consecutiveLockouts: index + 1 }); const challenge = host.issue(`lock-${index}`); if ("nonce" in challenge) expect(host.submit(`lock-${index}`, challenge.nonce, 0)).toMatchObject({ ok: true, clearedWait: true }); }
    host.recordLockout("lock-3", { budgetKey: "account", waitingUntilMs: clock.value + 60_000, remainingAttempts: 2, consecutiveLockouts: 4 }); expect(host.issue("lock-3")).toMatchObject({ ok: false, code: "budget-exhausted" });
  });
});
