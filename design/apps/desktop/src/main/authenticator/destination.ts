import { AuthenticatorStore, type AuthenticatorEntry } from "./store.js";
import { buildOtpauthUri, decodeBase32, encodeLocalQr, parseOtpauthUri, totp, type AuthenticatorAlgorithm, type AuthenticatorDigits, type OtpParameters, type QrMatrix } from "./protocol.js";

export type ManualAuthenticatorInput = { issuer: string; account: string; secret: string; algorithm?: AuthenticatorAlgorithm; digits?: AuthenticatorDigits; period?: number };
export type RegistrationInput =
  | { kind: "otpauth-uri"; value: string; confirmationCode: string }
  | { kind: "qr-image" | "qr-clipboard"; bytes: Uint8Array; confirmationCode: string }
  | { kind: "camera"; confirmationCode: string }
  | { kind: "manual"; value: ManualAuthenticatorInput; confirmationCode: string };

export interface LocalQrDecoder { decode(bytes: Uint8Array): string; }
export interface CameraQrSource { readonly available: boolean; read(): Promise<string>; }
export interface LocalClipboard { writeText(value: string): Promise<void>; }

export type AuthenticatorView = AuthenticatorEntry & { currentCode: string; nextCode: string; secondsRemaining: number; clockWarning: string | null };

export class AuthenticatorDestination {
  readonly #store: AuthenticatorStore;
  readonly #qrDecoder: LocalQrDecoder;
  readonly #camera?: CameraQrSource;
  readonly #now: () => number;
  constructor(options: { store: AuthenticatorStore; qrDecoder: LocalQrDecoder; camera?: CameraQrSource; now?: () => number }) { this.#store = options.store; this.#qrDecoder = options.qrDecoder; this.#camera = options.camera; this.#now = options.now ?? Date.now; }

  qrFor(parameters: OtpParameters): { uri: string; matrix: QrMatrix } { const uri = buildOtpauthUri(parameters); return { uri, matrix: encodeLocalQr(uri) }; }

  async register(input: RegistrationInput): Promise<AuthenticatorEntry> {
    const parameters = await this.#parameters(input); const now = this.#now(); const expected = totp(parameters, now);
    if (!/^\d{6,8}$/.test(input.confirmationCode) || input.confirmationCode !== expected) throw new Error("Registration requires one current authenticator code before the entry is armed.");
    return this.#store.add(parameters);
  }

  async view(id: string, trustedNowMs?: number): Promise<AuthenticatorView> {
    const entry = this.#store.list().find((candidate) => candidate.id === id); if (!entry) throw new Error("Authenticator entry is not available.");
    const secret = await this.#store.secret(id); const now = this.#now(); const parameters = { secret, algorithm: entry.algorithm, digits: entry.digits, period: entry.period } as const;
    const drift = trustedNowMs === undefined ? null : Math.abs(now - trustedNowMs) > 90_000 ? `Clock differs from the trusted reference by ${Math.round((now - trustedNowMs) / 1000)} seconds.` : null;
    return { ...entry, currentCode: groupCode(totp(parameters, now)), nextCode: groupCode(totp(parameters, (Math.floor(now / 1000 / entry.period) + 1) * entry.period * 1000)), secondsRemaining: entry.period - (Math.floor(now / 1000) % entry.period), clockWarning: drift };
  }

  list(query = ""): AuthenticatorEntry[] { return this.#store.list(query); }

  async copyCurrentCode(id: string, clipboard: LocalClipboard): Promise<void> { const view = await this.view(id); await clipboard.writeText(view.currentCode.replace(/\s+/g, "")); }

  async #parameters(input: RegistrationInput): Promise<OtpParameters> {
    if (input.kind === "manual") return { issuer: input.value.issuer, account: input.value.account, secret: decodeBase32(input.value.secret), algorithm: input.value.algorithm ?? "SHA-1", digits: input.value.digits ?? 6, period: input.value.period ?? 30 };
    if (input.kind === "camera") { if (!this.#camera?.available) throw new Error("Camera QR capture is unavailable on this computer; use an image, clipboard, URI, or manual entry."); return parseOtpauthUri(await this.#camera.read()); }
    if (input.kind === "qr-image" || input.kind === "qr-clipboard") return parseOtpauthUri(this.#qrDecoder.decode(input.bytes));
    return parseOtpauthUri(input.value);
  }
}

function groupCode(value: string): string { return value.match(/.{1,3}/g)?.join(" ") ?? value; }
