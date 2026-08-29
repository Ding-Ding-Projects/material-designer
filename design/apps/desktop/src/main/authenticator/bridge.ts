import type { AuthenticatorAlgorithm, AuthenticatorDigits, QrMatrix } from './protocol.js';
import type { AuthenticatorEntry } from './store.js';
import type { LadderChallenge, LadderRecordLockoutOptions, LadderResult, LadderState, MoleClickResult } from '../lockout/protocol.js';

export type BridgeResult<T> = { ok: true; value: T; historyRecorded?: boolean; recovery?: string | null } | { ok: false; code: string; reason: string };
export type BridgeRegistration =
  | { kind: 'manual'; issuer: string; account: string; secretBase32: string; algorithm?: AuthenticatorAlgorithm; digits?: AuthenticatorDigits; period?: number; confirmationCode: string }
  | { kind: 'otpauth-uri'; value: string; confirmationCode: string }
  | { kind: 'otpauth-json'; value: string; confirmationCode: string }
  | { kind: 'qr-image' | 'qr-clipboard'; bytes: Uint8Array; confirmationCode: string }
  | { kind: 'camera'; confirmationCode: string };
export type BridgeCodeView = AuthenticatorEntry & { currentCode: string; nextCode: string; secondsRemaining: number; clockWarning: string | null };
export type BridgeQr = { uri: string; matrix: QrMatrix };
export type HostQr = { uri: string; version: 5 | 6; size: 37 | 41; renderedSize: 45 | 49; quietZone: 4; modules: readonly (readonly boolean[])[]; renderedModules: readonly (readonly boolean[])[] };
export type BridgeHistoryRecord = { id: string; action: string; createdAt: string; summary: string; redacted: true };

export interface CanonicalAuthenticatorBridge {
  vaultStatus(): Promise<BridgeResult<{ available: boolean }>>;
  trustedTimeStatus(): Promise<BridgeResult<{ available: boolean; source?: string }>>;
  generateSecret(): Promise<BridgeResult<{ secretBase32: string }>>;
  list(query?: string): Promise<BridgeResult<AuthenticatorEntry[]>>;
  view(id: string): Promise<BridgeResult<BridgeCodeView>>;
  register(input: BridgeRegistration): Promise<BridgeResult<AuthenticatorEntry>>;
  qrFor(input: { issuer: string; account: string; secretBase32: string; algorithm?: AuthenticatorAlgorithm; digits?: AuthenticatorDigits; period?: number }): Promise<BridgeResult<BridgeQr>>;
  copyCurrentCode(id: string): Promise<BridgeResult<{ code: string }>>;
  setGroup(ids: readonly string[], group: string | null): Promise<BridgeResult<void>>;
  reorder(ids: readonly string[]): Promise<BridgeResult<void>>;
  issueSuperConfirmation(action: string, ids: readonly string[]): Promise<BridgeResult<{ confirmationToken: string }>>;
  remove(ids: readonly string[], confirmationToken: string): Promise<BridgeResult<void>>;
  historyUnlock(password: string): Promise<BridgeResult<void>>;
  historyList(query?: string): Promise<BridgeResult<BridgeHistoryRecord[]>>;
  historyDiff(id: string): Promise<BridgeResult<{ diff: string }>>;
  historyRestore(id: string): Promise<BridgeResult<{ historyRecorded: boolean; recovery: string | null }>>;
  historyExportRedacted(query?: string): Promise<BridgeResult<{ content: string }>>;
  historyExportSensitive(scope: { query?: string; entryIds: readonly string[] }, confirmationToken: string): Promise<BridgeResult<{ content: string }>>;
}

export interface CanonicalUnlockLadderBridge {
  recordLockout(lockoutId: string, options: LadderRecordLockoutOptions): Promise<LadderState>;
  issue(lockoutId: string): Promise<LadderChallenge | LadderResult>;
  recordMoleHit(lockoutId: string, nonce: string, cell: number): Promise<MoleClickResult>;
  submit(lockoutId: string, nonce: string, answer: unknown): Promise<LadderResult>;
  state(lockoutId: string): Promise<LadderState | null>;
}

export type CanonicalHostShape = {
  vaultStatus(): Promise<BridgeResult<{ available: boolean }>>;
  trustedTimeStatus(): Promise<BridgeResult<{ available: boolean; source?: string }>>;
  generateSecret(): Promise<BridgeResult<{ secretBase32: string }>>;
  list(query?: string): Promise<BridgeResult<{ entries: AuthenticatorEntry[] }>>;
  view(id: string): Promise<BridgeResult<{ entry: BridgeCodeView }>>;
  register(input: BridgeRegistration): Promise<BridgeResult<{ entry: AuthenticatorEntry }>>;
  qrFor(input: { issuer: string; account: string; secretBase32: string; algorithm?: AuthenticatorAlgorithm; digits?: AuthenticatorDigits; period?: number }): Promise<BridgeResult<HostQr>>;
  copyCurrentCode(id: string): Promise<BridgeResult<{ code: string }>>;
  setGroup(ids: readonly string[], group: string | null): Promise<BridgeResult<void>>;
  reorder(ids: readonly string[]): Promise<BridgeResult<void>>;
  issueSuperConfirmation(action: string, ids: readonly string[]): Promise<BridgeResult<{ confirmationToken: string }>>;
  remove(ids: readonly string[], confirmationToken: string): Promise<BridgeResult<void>>;
  historyUnlock(password: string): Promise<BridgeResult<void>>;
  historyList(query?: string): Promise<BridgeResult<{ records: BridgeHistoryRecord[] }>>;
  historyDiff(id: string): Promise<BridgeResult<{ diff: string }>>;
  historyRestore(id: string): Promise<BridgeResult<{ historyRecorded: boolean; recovery: string | null }>>;
  historyExportRedacted(query?: string): Promise<BridgeResult<{ content: string }>>;
  historyExportSensitive(scope: { query?: string; entryIds: readonly string[] }, confirmationToken: string): Promise<BridgeResult<{ content: string }>>;
  ladderRecordLockout(lockoutId: string, options: LadderRecordLockoutOptions): Promise<LadderState>;
  ladderIssue(lockoutId: string): Promise<LadderChallenge | LadderResult>;
  ladderRecordMoleHit(lockoutId: string, nonce: string, cell: number): Promise<MoleClickResult>;
  ladderSubmit(lockoutId: string, nonce: string, answer: unknown): Promise<LadderResult>;
  ladderState(lockoutId: string): Promise<LadderState | null>;
};

/** Typed adapter used by the desktop host, preload seam, and renderer bridge. */
export function createCanonicalAuthenticatorBridge(host: CanonicalHostShape): CanonicalAuthenticatorBridge {
  return {
    vaultStatus: () => host.vaultStatus(),
    trustedTimeStatus: () => host.trustedTimeStatus(),
    generateSecret: () => host.generateSecret(),
    list: async (query) => mapValue(await host.list(query), (value) => value.entries),
    view: async (id) => mapValue(await host.view(id), (value) => value.entry),
    register: async (input) => mapValue(await host.register(input), (value) => value.entry),
    qrFor: async (input) => mapValue(await host.qrFor(input), (value) => { const { uri, ...matrix } = value; return { uri, matrix }; }),
    copyCurrentCode: (id) => host.copyCurrentCode(id),
    setGroup: (ids, group) => host.setGroup(ids, group),
    reorder: (ids) => host.reorder(ids),
    issueSuperConfirmation: (action, ids) => host.issueSuperConfirmation(action, ids),
    remove: (ids, token) => host.remove(ids, token),
    historyUnlock: (password) => host.historyUnlock(password),
    historyList: async (query) => mapValue(await host.historyList(query), (value) => value.records),
    historyDiff: (id) => host.historyDiff(id),
    historyRestore: (id) => host.historyRestore(id),
    historyExportRedacted: (query) => host.historyExportRedacted(query),
    historyExportSensitive: (scope, token) => host.historyExportSensitive(scope, token),
  };
}

export function createCanonicalUnlockLadderBridge(host: CanonicalHostShape): CanonicalUnlockLadderBridge {
  return { recordLockout: (id, options) => host.ladderRecordLockout(id, options), issue: (id) => host.ladderIssue(id), recordMoleHit: (id, nonce, cell) => host.ladderRecordMoleHit(id, nonce, cell), submit: (id, nonce, answer) => host.ladderSubmit(id, nonce, answer), state: (id) => host.ladderState(id) };
}

function mapValue<T, U>(result: BridgeResult<T>, map: (value: T) => U): BridgeResult<U> {
  if (!result.ok) return result;
  return { ok: true, value: map(result.value), historyRecorded: result.historyRecorded, recovery: result.recovery };
}
