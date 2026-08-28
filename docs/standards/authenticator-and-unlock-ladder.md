# Local authenticator and unlock ladder

This article records the isolated source lane for two related local-first
capabilities: an authenticator destination and the host-owned unlock ladder.
The lane is intentionally separate from the Settings toy-lock UI so that
credential handling and lockout recovery can be reviewed without hiding behind
an existing renderer component.

## Status

**Source-mounted and unverified.** The protocol, storage boundary, history
writer, destination adapter, ladder host, renderer destination, route, and
command-palette registry row are present in the current task checkout. The
renderer destination deliberately reports that the operating-system vault and
bounded QR image decoder are unavailable until their desktop bridge adapters
are connected. No local Node, package-manager, Electron, build, or test command
was run. Packaged interaction, runtime QR scan, vault-backed registration,
protected history actions, and capture evidence remain open. This article must
not be read as evidence that the complete feature is shipped.

## Authenticator contract

`design/apps/desktop/src/main/authenticator/protocol.ts` is the dependency-free
protocol core. It validates canonical RFC 4648 Base32, parses and builds local
`otpauth://totp/` URIs, computes RFC 4226 HOTP and RFC 6238 TOTP values for
SHA-1, SHA-256 and SHA-512, accepts six through eight digits, and bounds the
period and counter. It also exposes text countdown, next-code, and clock-drift
helpers. The local QR route is deterministic byte-mode QR version 5-L and
returns an in-process matrix. It makes no request and writes no image. Payloads
larger than the bounded matrix are refused instead of silently truncated.

`destination.ts` supplies the registration boundary. URI paste, QR image,
clipboard bytes, a camera source when the platform reports one, and manual
Base32 parameters all converge on the same parser. A current code is required
before an entry is armed. Runtime code views include grouped current and next
codes, a seconds countdown, and an optional trusted-clock warning. A missing
camera is an explicit recovery state that points back to the local routes.

`store.ts` keeps non-secret entry metadata separate from the secret. The only
accepted secret backend is an operating-system credential vault. The metadata
store contains no secret, and ordinary export says `secretsOmitted: true`.
Cleartext export is a separate action requiring an in-app super-confirmation
object and states plainly that the result contains usable secrets. Entries can
be searched with bounded plain text, reordered, grouped, removed, and changed
in bulk through one persistence path.

`electron-vault.ts` adapts the desktop `safeStorage` boundary to the vault
interface. The runtime exposes only an availability probe through a
main-window, main-frame IPC handler. Encryption unavailable is visible and
there is no plaintext fallback. The renderer consumes that probe and keeps
registration disabled with a concrete reason until the remaining registration
bridge is present.

`packages/host/src/protocol.ts`, `packages/host/src/detection.ts`, and the
desktop preload now carry a typed authenticator bridge for list, view,
registration, reorder, grouping, removal, and protected history operations.
The main host consumes URI and manual registration through the real vault and
returns explicit unavailable results for QR image, clipboard, and camera
decoding until a bounded desktop decoder is connected. Every IPC route checks
the main window and its main frame before invoking the host.

`history.ts` provides the isolated local Git-backed history seam. It seals a
redacted snapshot before writing a record, commits each mutation append-only,
and offers a password-protected manager for reading and restoring encrypted
records. The history directory belongs beside application data, not inside a
user project. The renderer destination is mounted at `/authenticator` with
Codes, Register, and History tabs. It has a local entry search with its own
anchored pattern builder, semantic file selection, explicit camera and vault
unavailable explanations, and an honest protected-history state. The real
desktop vault adapter and protected history actions still need to be wired and
exercised in the packaged application.

`super-confirmation.ts` is the host-owned one-use token verifier used by
destructive removal and sensitive history export. Tokens bind the action and
ordered ids, expire after a bounded interval, and are consumed before a retry
can replay them. An absent or mismatched token is refused; no destructive
operation silently falls back to an unconfirmed call.

## Unlock ladder contract

`design/apps/desktop/src/main/lockout/service.ts` is host-owned. It issues
single-use nonces, consumes a nonce before grading, expires challenges, and
never creates a session or credential result. It keeps the original remaining
attempt count and consecutive lockout count unchanged when a wait is cleared.
The ladder has a three-use rolling hourly budget. After the budget is exhausted
the host returns the clock-only state.

The ordinary start is a four-choice dish challenge. Five wrong dishes move the
same lockout to ten generated sums. One wrong sum moves it to a timed
whack-a-mole round. The round accepts each mole only once, checks the submitted
hit time against that mole's visible interval, rejects an early completion,
and then falls through to the clock after failure. School mode starts at the
sums stage and never exposes the dish challenge. A successful rung changes only
the waiting state; it cannot sign the user in, mint a cookie, or refund an
attempt.

## Hand-written inventory

| Surface or seam | Implementation | Focused proof | Documentation | Built interaction | Capture |
| --- | --- | --- | --- | --- | --- |
| Base32 and `otpauth://totp/` parser | `authenticator/protocol.ts` | `authenticator-lockout.test.ts` | This article | Unverified | Missing |
| HOTP/TOTP algorithms and vectors | `authenticator/protocol.ts` | RFC 6238 and HOTP tests | This article | Unverified | Missing |
| QR matrix route | `authenticator/protocol.ts` | Matrix-bound source tests | This article | Unverified | Missing |
| URI, image, clipboard, camera and manual registration | `authenticator/destination.ts`, `AuthenticatorDestination.tsx` | Registration and route tests | This article | Unverified | Missing |
| Vault-only metadata and secret separation | `authenticator/store.ts`, `authenticator/electron-vault.ts` | Store and vault tests | This article | Unverified | Missing |
| Public omission and confirmed cleartext export | `authenticator/store.ts` | Export tests | This article | Unverified | Missing |
| Append-only encrypted local history | `authenticator/history.ts`, `AuthenticatorDestination.tsx` | History protection tests | This article | Unverified | Missing |
| Password-protected history manager | `authenticator/history.ts` | Access tests | This article | Unverified | Missing |
| Dish, sums, timed moles and clock | `lockout/service.ts` | Ladder tests | This article | Unverified | Missing |
| Nonce, expiry, early-submit and duplicate-mole refusal | `lockout/service.ts` | Negative ladder tests | This article | Unverified | Missing |
| School-mode starting stage | `lockout/service.ts` | School-mode test | This article | Unverified | Missing |
| Mounted desktop destination and workspace tab | `AuthenticatorDestination.tsx`, `router.ts`, `App.tsx`, `WorkspaceTabsBar.tsx` | Route and mount contract tests | This article | Unverified | Missing |

The inventory is deliberately hand-written. A discovery-only list would pass
if an entire destination disappeared.

## Red-then-green negative regression

Run `pwsh -NoProfile -ExecutionPolicy Bypass -File
scripts/verify-authenticator-lockout.ps1 -SelfTest`. It checks exact source
boundaries and mutates the ladder budget and QR-decoder registration in memory.
Each removal must turn the validator red, and restoring the exact marker must
turn it green. The validator is source evidence only; it cannot replace a
hosted typecheck, a packaged launch, or a real destination drive.

## Security and privacy boundaries

No registration route uses a network request. Secret values are accepted only
for the current registration or explicit confirmed export, and are kept in the
operating-system vault. Metadata, history records, ordinary exports, logs,
captures, and public records contain no usable secret. The unlock ladder is a
playful wait-recovery mechanism, not authentication, encryption, or protection
for sensitive data. A ladder win cannot create a session or alter the
credential. The camera and QR decoder adapters remain local interfaces and
must be backed by bounded decoders before a packaged surface is enabled.

## Suggested articles

- [toy-locks.md](toy-locks.md)
- [version-history.md](version-history.md)
- [super-confirmation.md](super-confirmation.md)
- [accessibility.md](accessibility.md)
- [long-operations.md](long-operations.md)
- [ui-drive-evidence.md](ui-drive-evidence.md)
