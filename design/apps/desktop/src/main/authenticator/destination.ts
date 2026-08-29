import { AuthenticatorStore, type AuthenticatorEntry } from './store.js';
import {
  buildOtpauthUri,
  decodeBase32,
  encodeBase32,
  encodeLocalQr,
  generateSecret as createSecret,
  parseOtpauthUri,
  clockSkewWarning,
  nextTotp,
  parseOtpauthJson,
  secondsRemaining,
  totp,
  type AuthenticatorAlgorithm,
  type AuthenticatorDigits,
  type OtpParameters,
  type QrMatrix,
} from './protocol.js';

export type ManualAuthenticatorInput = {
  issuer: string;
  account: string;
  secret: string;
  algorithm?: AuthenticatorAlgorithm;
  digits?: AuthenticatorDigits;
  period?: number;
};

export type RegistrationInput =
  | { kind: 'otpauth-uri'; value: string; confirmationCode: string }
  | { kind: 'otpauth-json'; value: string; confirmationCode: string }
  | { kind: 'qr-image' | 'qr-clipboard'; bytes: Uint8Array; confirmationCode: string }
  | { kind: 'camera'; confirmationCode: string }
  | { kind: 'manual'; value: ManualAuthenticatorInput; confirmationCode: string };

export interface LocalQrDecoder {
  preflight?(bytes: Uint8Array): { width: number; height: number; frames: number; decodedBytes: number };
  decode(bytes: Uint8Array): string | Promise<string>;
}

export interface CameraQrSource {
  readonly available: boolean;
  read(): Promise<string>;
}

export interface LocalClipboard {
  writeText(value: string): Promise<void>;
}

export type AuthenticatorView = AuthenticatorEntry & {
  currentCode: string;
  nextCode: string;
  secondsRemaining: number;
  clockWarning: string | null;
};

export class AuthenticatorDestination {
  readonly #store: AuthenticatorStore;
  readonly #qrDecoder: LocalQrDecoder;
  readonly #camera?: CameraQrSource;
  readonly #now: () => number;

  constructor(options: {
    store: AuthenticatorStore;
    qrDecoder: LocalQrDecoder;
    camera?: CameraQrSource;
    now?: () => number;
  }) {
    this.#store = options.store;
    this.#qrDecoder = options.qrDecoder;
    this.#camera = options.camera;
    this.#now = options.now ?? Date.now;
  }

  qrFor(parameters: OtpParameters): { uri: string; matrix: QrMatrix } {
    const uri = buildOtpauthUri(parameters);
    return { uri, matrix: encodeLocalQr(uri) };
  }

  generateSecret(): string {
    return encodeBase32(createSecret());
  }

  async register(input: RegistrationInput): Promise<AuthenticatorEntry> {
    const parameters = await this.#parameters(input);
    const expected = totp(parameters, this.#now());
    if (!/^\d{6,8}$/u.test(input.confirmationCode) || input.confirmationCode !== expected) {
      throw new Error('Registration requires one current authenticator code before the entry is armed.');
    }
    return this.#store.add(parameters);
  }

  async view(id: string, trustedNowMs?: number): Promise<AuthenticatorView> {
    const entry = this.#store.list().find((candidate) => candidate.id === id);
    if (!entry) throw new Error('Authenticator entry is not available.');
    const secret = await this.#store.secret(id);
    const now = this.#now();
    const parameters = { secret, algorithm: entry.algorithm, digits: entry.digits, period: entry.period } as const;
    return {
      ...entry,
      currentCode: groupCode(totp(parameters, now)),
      nextCode: groupCode(nextTotp(parameters, now)),
      secondsRemaining: secondsRemaining(entry.period, now),
      clockWarning: trustedNowMs === undefined ? null : clockSkewWarning(now, trustedNowMs),
    };
  }

  list(query = ''): AuthenticatorEntry[] {
    return this.#store.list(query);
  }

  async copyCurrentCode(id: string, clipboard: LocalClipboard): Promise<void> {
    const view = await this.view(id);
    await clipboard.writeText(view.currentCode.replace(/\s+/gu, ''));
  }

  async #parameters(input: RegistrationInput): Promise<OtpParameters> {
    if (input.kind === 'manual') {
      return {
        issuer: input.value.issuer.trim(),
        account: input.value.account.trim(),
        secret: decodeBase32(input.value.secret),
        algorithm: input.value.algorithm ?? 'SHA-1',
        digits: input.value.digits ?? 6,
        period: input.value.period ?? 30,
      };
    }
    if (input.kind === 'camera') {
      if (!this.#camera?.available) {
        throw new Error('Camera QR capture is unavailable on this computer; use an image, clipboard, URI, or manual entry.');
      }
      return parseOtpauthUri(await this.#camera.read());
    }
    if (input.kind === 'qr-image' || input.kind === 'qr-clipboard') {
      if (input.bytes.length === 0 || input.bytes.length > 2 * 1024 * 1024) throw new Error('QR input exceeds the bounded image size.');
      if (this.#qrDecoder.preflight) {
        const inspected = this.#qrDecoder.preflight(input.bytes);
        if (!Number.isSafeInteger(inspected.width) || !Number.isSafeInteger(inspected.height) || inspected.width < 1 || inspected.height < 1 || inspected.width > 4_096 || inspected.height > 4_096 || inspected.width * inspected.height > 16_777_216 || inspected.frames !== 1 || !Number.isSafeInteger(inspected.decodedBytes) || inspected.decodedBytes < 1 || inspected.decodedBytes > 64 * 1024 * 1024) throw new Error('QR image dimensions, frames, pixels, or decoded memory exceed the bounded limits.');
      }
      return parseOtpauthUri(await Promise.race([Promise.resolve(this.#qrDecoder.decode(input.bytes)), new Promise<string>((_, reject) => setTimeout(() => reject(new Error('QR image decoding exceeded the bounded time.')), 2_000))]));
    }
    if (input.kind === 'otpauth-uri') return parseOtpauthUri(input.value);
    if (input.kind === 'otpauth-json') return parseOtpauthJson(input.value);
    throw new Error('The registration input kind is unsupported.');
  }
}

function groupCode(value: string): string {
  return value.match(/.{1,3}/gu)?.join(' ') ?? value;
}
