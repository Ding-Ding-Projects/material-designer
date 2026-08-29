import type { AuthenticatorAlgorithm, AuthenticatorDigits, QrMatrix } from './protocol';

export type AuthenticatorEntry = {
  id: string;
  issuer: string;
  account: string;
  algorithm: AuthenticatorAlgorithm;
  digits: AuthenticatorDigits;
  period: number;
  group: string | null;
  order: number;
};

export type AuthenticatorCodeView = AuthenticatorEntry & {
  currentCode: string;
  nextCode: string;
  secondsRemaining: number;
  clockWarning: string | null;
};

export type ManualRegistration = {
  issuer: string;
  account: string;
  secret: string;
  algorithm?: AuthenticatorAlgorithm;
  digits?: AuthenticatorDigits;
  period?: number;
};

export type RegistrationRequest =
  | { kind: 'otpauth-uri'; value: string; confirmationCode: string }
  | { kind: 'qr-image' | 'qr-clipboard'; bytes: Uint8Array; confirmationCode: string }
  | { kind: 'camera'; confirmationCode: string }
  | { kind: 'manual'; value: ManualRegistration; confirmationCode: string };

export type AuthenticatorResult<T> = { ok: true; value: T } | { ok: false; reason: string };

/** C0 is the registration and pairing contract. */
export interface C0 {
  generateSecret(): Promise<AuthenticatorResult<{ secretBase32: string }>>;
  register(input: RegistrationRequest): Promise<AuthenticatorResult<AuthenticatorEntry>>;
  qrFor(input: {
    issuer: string;
    account: string;
    secretBase32: string;
    algorithm: AuthenticatorAlgorithm;
    digits: AuthenticatorDigits;
    period: number;
  }): Promise<AuthenticatorResult<{ uri: string; matrix: QrMatrix }>>;
}

/** C1 is the local metadata and code-view contract. */
export interface C1 {
  list(query?: string): Promise<AuthenticatorResult<AuthenticatorEntry[]>>;
  view(id: string): Promise<AuthenticatorResult<AuthenticatorCodeView>>;
  setGroup(ids: readonly string[], group: string | null): Promise<AuthenticatorResult<void>>;
  reorder(ids: readonly string[]): Promise<AuthenticatorResult<void>>;
  remove(ids: readonly string[], confirmationToken: string): Promise<AuthenticatorResult<void>>;
  copyCurrentCode(id: string): Promise<AuthenticatorResult<void>>;
}

export interface AuthenticatorBridge extends C0, C1 {
  vaultStatus(): Promise<AuthenticatorResult<{ available: boolean }>>;
  trustedTimeStatus?(): Promise<AuthenticatorResult<{ available: boolean; source?: string }>>;
  historyUnlock(password: string): Promise<AuthenticatorResult<void>>;
  historyList(query?: string): Promise<AuthenticatorResult<HistoryRecord[]>>;
  historyExportRedacted(query?: string): Promise<AuthenticatorResult<RedactedHistoryExport>>;
  historyExportSensitive(scope: { query?: string; entryIds: readonly string[] }, confirmationToken: string): Promise<AuthenticatorResult<SensitiveHistoryExport>>;
}

export type HistoryRecord = {
  id: string;
  action: string;
  createdAt: string;
  summary: string;
  redacted: true;
};

export type RedactedHistoryExport = {
  version: 1;
  secretsOmitted: true;
  records: HistoryRecord[];
};

export type SensitiveHistoryExport = {
  version: 1;
  warning: string;
  records: HistoryRecord[];
};

export type AuthenticatorLabels = {
  english: Record<string, string>;
  cantonese: Record<string, string>;
};
