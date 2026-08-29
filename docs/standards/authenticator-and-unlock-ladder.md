# Local authenticator and unlock ladder

This article records the isolated source lane for two related local-first capabilities: a built-in authenticator destination and host-owned lockout recovery. The lane is intentionally separate from the settings toy-lock UI so credential handling and lockout recovery can be reviewed without hiding behind another renderer component.

## Status

The source lane contains protocol, storage, history, vault, confirmation, ladder, and renderer modules plus focused tests and a source contract checker. It is not a claim of packaged runtime verification. The desktop bridge and application mount remain integration work for the owning lane. No user secret is included in source, tests, documentation, exports, or logs.

## Authenticator contract

`design/apps/desktop/src/main/authenticator/protocol.ts` is the dependency-free trusted computation core. It validates canonical RFC 4648 Base32, parses and builds `otpauth://totp/` URIs, computes RFC 4226 HOTP and RFC 6238 TOTP values for SHA-1, SHA-256, and SHA-512, accepts six through eight digits, and bounds the period and counter. It also exposes a text countdown, next-code preview, and clock-drift warning.

The QR route is deterministic byte-mode QR version 5-L or 6-L. Version 5-L uses 108 data codewords and 26 Reed-Solomon codewords. Version 6-L uses two interleaved 68-byte data blocks and 18 parity codewords per block. The returned object contains the core matrix plus a rendered matrix with a true four-module quiet zone, and includes format recovery for all eight standard masks. It makes no request and writes no image. Payloads larger than the bounded matrix are refused instead of silently truncated. The parity verifier is exercised for both versions and every mask. External image-decoder verification remains pending because no external QR decoder is installed in the current host.

`destination.ts` is the registration boundary. URI paste, QR image bytes, clipboard bytes, camera input, and manual Base32 parameters converge on the same parser. A current code is required before an entry is armed. Runtime views return grouped current and next codes, a numeric countdown, and an optional trusted-clock warning. An unavailable camera is an explicit recovery state that points back to the local routes.

The same boundary accepts a bounded versioned JSON form with exactly `version: 1`, `issuer`, `account`, `secretBase32`, `algorithm`, `digits`, and `period`. Unknown or duplicate fields, malformed Base32, unsupported algorithms or digits, and invalid periods are refused. The JSON parser produces the same parameters as the URI parser before the pairing code is checked.

The renderer's `RegistrationRequest` is an alias of the canonical `BridgeRegistration` type. Manual registration therefore uses the flat `issuer`, `account`, `secretBase32`, algorithm, digit, period, and confirmation fields at compile time, matching the desktop host without a renderer-only nested shape.

`store.ts` keeps entry metadata separate from the secret. The only accepted secret backend is an operating-system credential vault. Metadata contains no secret, and ordinary export returns `secretsOmitted: true`. Cleartext export is a separate action requiring a one-use in-app super-confirmation object and states plainly that the result contains usable secrets. Entries can be searched with bounded plain text, reordered, grouped, removed, and changed in bulk through one persistence path.

`electron-vault.ts` defines the injected operating-system credential-vault contract and an explicit unavailable implementation. The source lane does not treat a DPAPI or encrypted metadata file as a credential vault. When the central desktop seam does not supply a real vault, every secret operation remains unavailable with no plaintext fallback. `host.ts` is the feature-owned registration seam for the central C0 bridge and accepts only a supplied vault adapter.

## Local history contract

`history.ts` provides an isolated local Git-backed history seam. A redaction walk rejects credential-shaped fields before an encrypted snapshot is written. Secret snapshots carry stable `authenticator-entry:<entry-id>:v1` AAD, so deleting and restoring an entry does not invalidate its encrypted payload. Each authenticator mutation appends a record and commits it without rewriting prior history. A mutation reports `historyRecorded: false` plus a recovery message when that commit cannot be written, while retaining the live metadata. `PasswordProtectedHistory` reads and restores records only after a locally verified password. Retention pruning is a new commit. Ordinary history views and exports contain action, time, summary, and record identifiers only, and state that sensitive values were omitted.

The browser-side `components/authenticator/history.ts` module provides the same append-only and redacted contract for a host that persists local metadata. Its `WebCryptoHistoryCipher` expects a non-extractable AES-GCM key supplied by the host and never stores a key in settings or a renderer export. The renderer export helper validates the host-produced top-level schema and saves the returned content directly, so the host wrapper is not encoded a second time.

## Unlock ladder contract

`design/apps/desktop/src/main/lockout/service.ts` is host-owned and implements the exported `C5` interface. It issues single-use nonces, consumes a nonce before grading, expires challenges, and never creates a session, cookie, credential result, or attempt refund. It keeps the original remaining attempt count and consecutive-lockout count unchanged when a wait is cleared. A three-use rolling hourly budget is shared by the supplied budget key. After that budget is exhausted, the host returns the clock-only state.

The ordinary start is a four-choice dish challenge. Five wrong dishes move the same lockout to ten generated sums. One wrong sum moves it to a timed whack-a-mole round. The round rejects an early completion, grades each mole at most once, and checks each submitted hit against that mole's visible interval. A successful rung changes only the waiting state. School mode starts at sums and never exposes the dish challenge.

`JsonUnlockLadderPersistence` stores only durable lockout and budget state. Challenges and their nonces are deliberately discarded on restore, so a previously issued nonce cannot be replayed after a restart. The durable wrapper saves after issuance and submission, using a unique same-directory temporary file and bounded rename retry. If persistence rejects a mutation, the durable host restores its prior in-memory state before returning the failure. C0 receives a stable `unlock-ladder-budget:v1:` identity and an explicit `schoolMode` option so the central lockout owner controls account budget sharing and the starting rung.

`components/unlock-ladder/UnlockLadder.tsx` is an accessible renderer surface for the host contract. It provides keyboard-reachable dish choices, ten labelled sum fields, a five-by-five mole grid, a text countdown tied to the host-provided round duration, reduced-motion handling, injected localized and funny copy, and explicit copy that winning clears the wait only. Reduced motion freezes scheduled mole positions, exposes only cells currently valid under the host clock as actionable, leaves other scheduled cells inert, and announces the active cell set with the numeric countdown. Every mole click or keyboard activation sends only its exact currently valid cell to the host. The host records its own time, visible-cell match, and one-hit state; the renderer never submits a client timestamp or hit list. It does not authenticate a user or create a session.

## C0, C1, and C5 interfaces

- `C0` describes registration and local QR pairing.
- `C1` describes metadata listing, code views, grouping, reordering, removal, and code copying.
- `C5` describes the host-owned unlock ladder record, issue, submit, mole-hit, and state operations.
- `bridge.ts` is the canonical typed adapter shared by the feature-owned host and the central preload or renderer seam. It maps host `{ entries }`, `{ entry }`, and flat QR payloads to the renderer list, view, registration, and `{ uri, matrix }` shapes, and maps the mole route to one `cell` per click. Round-trip mapping tests cover success and refusal shapes.

The interfaces are deliberately narrow. Integration code owns authentication, bridge registration, local storage selection, and the super-confirmation UI. The feature modules do not edit the central settings or toy-lock surfaces.

## Hand-written inventory

| Surface or seam | Implementation | Focused proof | Built interaction | Capture |
| --- | --- | --- | --- | --- |
| Base32 and `otpauth://totp/` parser | `authenticator/protocol.ts` | desktop protocol test | Unverified | Not captured |
| HOTP/TOTP algorithms and vectors | `authenticator/protocol.ts` | RFC 4226 and RFC 6238 tests | Unverified | Not captured |
| QR matrix encoding and all masks | `authenticator/protocol.ts` | local matrix round-trip test | Unverified | Not captured |
| URI, JSON, image, clipboard, camera, and manual registration | `authenticator/destination.ts`, `authenticator/protocol.ts`, `authenticator/host.ts`, `AuthenticatorDestination.tsx` | registration route tests | Integration pending | Not captured |
| Vault-only metadata and secret separation | `authenticator/store.ts`, `electron-vault.ts` | store, AAD, and unavailable-vault tests | Integration pending | Not captured |
| Ordinary omission and confirmed cleartext export | `authenticator/store.ts` | export tests | Integration pending | Not captured |
| Append-only encrypted local history and commit outcome | `authenticator/history.ts`, `store.ts`, `components/authenticator/history.ts` | history boundary and real Git append tests | Integration pending | Not captured |
| Password-protected history manager | `authenticator/history.ts` | password access tests | Integration pending | Not captured |
| Dish, sums, timed moles, and clock | `lockout/service.ts`, `UnlockLadder.tsx` | ladder tests | Integration pending | Not captured |
| Nonce, expiry, early-submit, and duplicate-mole refusal | `lockout/service.ts` | negative ladder tests | Integration pending | Not captured |
| School-mode starting stage | `lockout/service.ts` | School-mode test | Integration pending | Not captured |
| C0, C1, and C5 boundary interfaces and typed adapter | `components/authenticator/contracts.ts`, `authenticator/bridge.ts`, `lockout/protocol.ts` | source contract checker and adapter round-trip tests | Integration pending | Not captured |
| Feature-owned desktop host and trusted time seam | `authenticator/host.ts` | host and unavailable-vault tests | Central bridge pending | Not captured |

This inventory is hand-written. A discovery-only list would pass if an entire destination or recovery stage disappeared.

## Red-then-green negative regression

Run `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/verify-authenticator-lockout.ps1 -SelfTest`. It checks an explicit source inventory with exact declarations, calls, and mounts, then runs that same validator against broken in-memory fixtures for the QR decoder, ladder budget, destination mount, vault class, encrypted envelope field, Blob bound, and QR adapter. Each fixture must turn red with its expected reason, and the unmodified source must return green. The validator is source evidence only. It cannot replace a hosted typecheck, a packaged launch, or a real destination drive.

## Security and privacy boundaries

No registration route uses a network request. Secret values are accepted only for the current registration or an explicitly confirmed export, and are kept in the operating-system vault. Metadata, history records, ordinary exports, logs, captures, and public records contain no usable secret. The unlock ladder is a playful wait-recovery mechanism, not authentication or encryption. A ladder win cannot create a session or alter a credential. Image, clipboard, and camera decoder adapters remain local interfaces and must be backed by bounded decoders before a packaged surface is enabled.

## Suggested articles

- [toy-locks.md](toy-locks.md)
- [version-history.md](version-history.md)
- [super-confirmation.md](super-confirmation.md)
- [accessibility.md](accessibility.md)
- [long-operations.md](long-operations.md)
