# Local authenticator and unlock ladder

This article records the isolated source lane for two related local-first capabilities: a built-in authenticator destination and host-owned lockout recovery. The lane is intentionally separate from the settings toy-lock UI so credential handling and lockout recovery can be reviewed without hiding behind another renderer component.

## Status

The source lane contains protocol, storage, history, vault, confirmation, ladder, and renderer modules plus focused tests and a source contract checker. It is not a claim of packaged runtime verification. The desktop bridge and application mount remain integration work for the owning lane. No user secret is included in source, tests, documentation, exports, or logs.

## Authenticator contract

`design/apps/desktop/src/main/authenticator/protocol.ts` is the dependency-free trusted computation core. It validates canonical RFC 4648 Base32, parses and builds `otpauth://totp/` URIs, computes RFC 4226 HOTP and RFC 6238 TOTP values for SHA-1, SHA-256, and SHA-512, accepts six through eight digits, and bounds the period and counter. It also exposes a text countdown, next-code preview, and clock-drift warning.

The QR route is deterministic byte-mode QR version 5-L or 6-L. It returns an in-process matrix and includes format recovery for all eight standard masks. It makes no request and writes no image. Payloads larger than the bounded matrix are refused instead of silently truncated.

`destination.ts` is the registration boundary. URI paste, QR image bytes, clipboard bytes, camera input, and manual Base32 parameters converge on the same parser. A current code is required before an entry is armed. Runtime views return grouped current and next codes, a numeric countdown, and an optional trusted-clock warning. An unavailable camera is an explicit recovery state that points back to the local routes.

`store.ts` keeps entry metadata separate from the secret. The only accepted secret backend is an operating-system credential vault. Metadata contains no secret, and ordinary export returns `secretsOmitted: true`. Cleartext export is a separate action requiring a one-use in-app super-confirmation object and states plainly that the result contains usable secrets. Entries can be searched with bounded plain text, reordered, grouped, removed, and changed in bulk through one persistence path.

`electron-vault.ts` adapts the desktop encrypted storage boundary. When encryption is unavailable every secret operation fails closed, with no plaintext fallback. Atomic writes use unique temporary names and bounded retries for transient Windows rename errors.

## Local history contract

`history.ts` provides an isolated local Git-backed history seam. A redaction walk rejects credential-shaped fields before an encrypted snapshot is written. Each authenticator mutation appends a record and commits it without rewriting prior history. `PasswordProtectedHistory` reads and restores records only after a locally verified password. Retention pruning is a new commit. Ordinary history views and exports contain action, time, summary, and record identifiers only, and state that sensitive values were omitted.

The browser-side `components/authenticator/history.ts` module provides the same append-only and redacted contract for a host that persists local metadata. Its `WebCryptoHistoryCipher` expects a non-extractable AES-GCM key supplied by the host and never stores a key in settings or a renderer export.

## Unlock ladder contract

`design/apps/desktop/src/main/lockout/service.ts` is host-owned and implements the exported `C5` interface. It issues single-use nonces, consumes a nonce before grading, expires challenges, and never creates a session, cookie, credential result, or attempt refund. It keeps the original remaining attempt count and consecutive-lockout count unchanged when a wait is cleared. A three-use rolling hourly budget is shared by the supplied budget key. After that budget is exhausted, the host returns the clock-only state.

The ordinary start is a four-choice dish challenge. Five wrong dishes move the same lockout to ten generated sums. One wrong sum moves it to a timed whack-a-mole round. The round rejects an early completion, grades each mole at most once, and checks each submitted hit against that mole's visible interval. A successful rung changes only the waiting state. School mode starts at sums and never exposes the dish challenge.

`JsonUnlockLadderPersistence` stores only durable lockout and budget state. Challenges and their nonces are deliberately discarded on restore, so a previously issued nonce cannot be replayed after a restart. The durable wrapper saves after issuance and submission.

`components/unlock-ladder/UnlockLadder.tsx` is an accessible renderer surface for the host contract. It provides keyboard-reachable dish choices, ten labelled sum fields, a five-by-five mole grid, a text countdown, reduced-motion handling, and explicit copy that winning clears the wait only. It does not authenticate a user or create a session.

## C0, C1, and C5 interfaces

- `C0` describes registration and local QR pairing.
- `C1` describes metadata listing, code views, grouping, reordering, removal, and code copying.
- `C5` describes the host-owned unlock ladder issue, submit, and state operations.

The interfaces are deliberately narrow. Integration code owns authentication, bridge registration, local storage selection, and the super-confirmation UI. The feature modules do not edit the central settings or toy-lock surfaces.

## Hand-written inventory

| Surface or seam | Implementation | Focused proof | Built interaction | Capture |
| --- | --- | --- | --- | --- |
| Base32 and `otpauth://totp/` parser | `authenticator/protocol.ts` | desktop protocol test | Unverified | Not captured |
| HOTP/TOTP algorithms and vectors | `authenticator/protocol.ts` | RFC 4226 and RFC 6238 tests | Unverified | Not captured |
| QR matrix encoding and all masks | `authenticator/protocol.ts` | local matrix round-trip test | Unverified | Not captured |
| URI, image, clipboard, camera, and manual registration | `authenticator/destination.ts`, `AuthenticatorDestination.tsx` | registration route tests | Integration pending | Not captured |
| Vault-only metadata and secret separation | `authenticator/store.ts`, `electron-vault.ts` | store and vault tests | Integration pending | Not captured |
| Ordinary omission and confirmed cleartext export | `authenticator/store.ts` | export tests | Integration pending | Not captured |
| Append-only encrypted local history | `authenticator/history.ts`, `components/authenticator/history.ts` | history boundary tests | Integration pending | Not captured |
| Password-protected history manager | `authenticator/history.ts` | password access tests | Integration pending | Not captured |
| Dish, sums, timed moles, and clock | `lockout/service.ts`, `UnlockLadder.tsx` | ladder tests | Integration pending | Not captured |
| Nonce, expiry, early-submit, and duplicate-mole refusal | `lockout/service.ts` | negative ladder tests | Integration pending | Not captured |
| School-mode starting stage | `lockout/service.ts` | School-mode test | Integration pending | Not captured |
| C0, C1, and C5 boundary interfaces | `components/authenticator/contracts.ts`, `lockout/protocol.ts` | source contract checker | Integration pending | Not captured |

This inventory is hand-written. A discovery-only list would pass if an entire destination or recovery stage disappeared.

## Red-then-green negative regression

Run `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/verify-authenticator-lockout.ps1 -SelfTest`. It checks exact source boundaries and deliberately removes the ladder budget, QR decoder, ordinary export omission, nonce consumption, and C0 interface markers in memory. Each removal must turn the validator red, and restoring the exact marker must turn it green. The validator is source evidence only. It cannot replace a hosted typecheck, a packaged launch, or a real destination drive.

## Security and privacy boundaries

No registration route uses a network request. Secret values are accepted only for the current registration or an explicitly confirmed export, and are kept in the operating-system vault. Metadata, history records, ordinary exports, logs, captures, and public records contain no usable secret. The unlock ladder is a playful wait-recovery mechanism, not authentication or encryption. A ladder win cannot create a session or alter a credential. Image, clipboard, and camera decoder adapters remain local interfaces and must be backed by bounded decoders before a packaged surface is enabled.

## Suggested articles

- [toy-locks.md](toy-locks.md)
- [version-history.md](version-history.md)
- [super-confirmation.md](super-confirmation.md)
- [accessibility.md](accessibility.md)
- [long-operations.md](long-operations.md)
