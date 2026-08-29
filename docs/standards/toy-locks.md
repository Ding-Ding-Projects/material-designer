# Toy locks and authentication policies

## Contract

Every rendered element will eventually be independently lockable as a playful
interaction speed bump. A locked target must look unavailable for its protected
action, but activating it must open authentication rather than silently doing
nothing or invoking the protected action. This is not encryption or a security
boundary.

The desktop application supports exactly these factor policies:

1. PIN
2. Password
3. PIN plus password
4. Password plus TOTP
5. PIN plus TOTP
6. Password plus PIN plus TOTP

PIN entry from the access-control-style keypad and from manual typing uses the
same normalization and validation path. Both sources also consume the same
bounded attempt budget, so switching input methods cannot reset failed attempts.

## Current implementation status

**Reusable source component, not app-wide wiring.**
`design/apps/web/src/security/toy-lock-core.ts` owns the
exact six-policy registry, ordered factor requirements, shared PIN validator,
attempt-budget reducer, and locked-target activation interceptor. Focused tests
prove that a locked activation returns an authentication request and never calls
the protected action, while an unlocked activation calls it exactly once.

`design/apps/web/src/components/ToyLockAuthenticationPopover.tsx` adds a reusable
visible, non-modal prompt anchored to a supplied element. It renders every policy
in the core's declared order, offers both an access-control-style PIN keypad and
manual PIN entry through `normalizePin`, shows one bounded attempt budget,
restores focus on cancel or completion, handles Escape, and emits its protected
action callback only after all required factors have been accepted. A cancelled
or replaced prompt invalidates an in-flight verifier result, so a late response
cannot authorize the old target. English, Hong Kong Cantonese, and bilingual
copy are present for this component.

The dedicated `design/apps/web/src/components/toy-locks/` components add reusable
policy configuration, an operable activation boundary, a bounded host-call
deadline, and the local Support Tickets surface. The activation boundary keeps
pointer, keyboard, touch, assistive-technology, shortcut, and programmatic paths
on the same locked-target interceptor. It uses an operable wrapper instead of a
native disabled target, so activating a locked control can open authentication
without invoking its protected action.

Support Tickets are fictional and local to the application. The surface stores
bounded ticket records in local browser storage, offers category and text search,
multi-select, inverse selection, dismissal, and filtered JSON export, and advances
new tickets to a canned local response. Its disclosure states that nothing is
sent, no network request is made, no data is collected, and no person reads the
ticket. Export is an explicit two-step action that warns that descriptions are
included and must be reviewed before saving. Recovery only asks the desktop host
to open the exact application-data folder; the surface never deletes that folder
in-app and shows or copies its path only after the host confirms a successful open.

`design/apps/web/src/components/settings/SettingsTabStrip.tsx` now accepts
controlled per-tab lock policy data and a host-owned factor verifier. Every tab
rendered by that strip, including an overflow-menu entry, stays focusable and
activation-capable while locked. Pointer and keyboard activation are intercepted
before the original section-selection callback can run. The original callback is
retained and invoked exactly once only after the configured policy succeeds.
Cancellation leaves the section unchanged and returns focus to the originating
tab or overflow action. The strip does not define, store, or infer credentials.

The desktop host now owns a persistent Settings-tab credential store and a
narrow optional bridge. Its exact allowlist is the 22 Settings tab targets, and
its policy registry preserves the same six ordered factor combinations as the
renderer core. Main-process handlers reject unknown targets, unexpected or
oversized fields, stale revisions, and any sender other than the main window's
main frame. Results are structured and expose only non-secret lock metadata.
PIN and password values become independently salted, resource-bounded
asynchronous scrypt digests inside one per-generation credential envelope. The
complete envelope, including every digest, salt, and TOTP secret, is protected
through Electron `safeStorage`; none of those fields is a standalone file.
If operating-system encryption is unavailable, every credential mutation and
verification fails closed with an explicit unavailable result. The existing
plaintext connector credential file is not reused.

Each generation has one non-secret metadata document and one protected
credential envelope. Generation-addressed files are written before an atomic
current pointer; a separately validated previous pointer and generation remain
available for recovery. A failed write or rename before pointer publication
leaves the last complete generation active. This is recoverable publication,
not a claim that two independent files change atomically. Every replacement
uses a unique temporary file plus bounded retry for transient Windows rename
sharing violations. A bounded serialized main-process queue refuses duplicate
per-target work and excess global work. Asynchronous scrypt runs only after
revision, attempt, and cooldown checks. Remaining attempts and cooldowns persist
across remounts, input modes, and restart. Native exceptions become bounded
codes without paths or messages.

TOTP activation is a two-step host-owned pending transaction. Begin validates a
strict RFC 4648 Base32 secret in either canonical padded or canonical unpadded
form. Legal length residues and padding are enforced and unused trailing bits
must be zero. The host then creates one bounded, expiring pending
record. Confirm requires a current valid code before publishing a generation.
Mismatch, expiry, abandonment, write refusal, and revision drift retain the
prior lock. The toy-lock profile is RFC 6238 SHA-1, six digits, 30 seconds, with
one bounded skew step and no negative counters. The separate built-in
authenticator requirement supports broader algorithms, digits, and periods; it
remains unimplemented and this narrow toy-lock profile does not satisfy it.

The Base32 decoder also rejects non-zero unused tail bits, so two encodings cannot
represent the same secret through a malformed final symbol. The host bridge
exposes a sender-checked `openRecoveryFolder` operation. It validates the existing
application-data directory, opens it through the platform file manager, and keeps
the directory path out of failure results.

Unlock duration and state are host-owned metadata, not renderer-only choices.
Each lock records `unlockDuration`, `unlockUntilMs`, and `unlocked`; a fresh host
process clears the unlocked state before returning metadata, so locks are locked
on launch. A five-minute unlock expires when the host observes its deadline, while
surface and until-close unlocks remain in the current host session until an
explicit `relock` operation. The relock operation is independently revisioned and
returns the updated non-secret metadata.

This host slice deliberately does not yet replace the live controlled empty
lock map in `SettingsDialog`: the missing context-menu configuration and TOTP
pairing surfaces must supply reviewed requests before a user can create a lock.
The renderer prompt therefore remains unable to create user-configured locks,
and its component-local displayed budget is not yet synchronized to the
host-owned metadata. Lock-configuration context menus, QR/manual TOTP pairing,
central interception of every alternate Settings navigation route,
every-element coverage, packaged interaction, and screenshots remain absent.
Consequently the complete feature remains partial and unshipped.

The central integration handoff is recorded in
`.codex/verification/ui-drive/toy-lock-c0-handoff.json`. It lists the per-element
context-menu, configuration, TOTP pairing, command-palette, search, Support Tickets,
and host relock routes. Every row is explicitly marked as not operation-claimed;
the inventory records the feature-owned seam and the central work and proof still
required, without implying that any route is mounted or exercised.

The documentation site now carries one bounded browser-local implementation in
`site/assets/js/toy-locks.js`. Its Settings surface exposes all six policies, a
manual PIN field and access-control keypad that share one normalization path,
an anchored prompt, persistent five-attempt budget and cooldown, and a protected
example action whose click is synchronously intercepted before it can run.
Password and PIN verifiers are stored only as digests. A TOTP secret is imported
as a non-extractable Web Crypto key and persisted through IndexedDB; when that
private key store is unavailable, TOTP policies remain visible but fail closed
with an exact explanation. Secret values are not written to notifications,
history, exports, or console output.

The site states the browser boundary plainly: this is for fun, is not security
or encryption, and clearing the site's browser storage is the recovery route.
This representative action is not every-element coverage. The documentation
site row therefore remains partial until every rendered target is independently
lockable and the built deployed page has complete interaction and capture proof.

## Failure and safety behavior

- Invalid PIN input is rejected before any credential comparison.
- Empty, non-digit, too-short, and too-long PIN values have distinct outcomes.
- Attempt counts never become negative and a successful match restores the
  configured maximum.
- Attempt counts and cooldowns are main-process-owned and generation-published;
  renderer remounts and concurrent requests cannot restore spent attempts.
- Stale revisions and unknown Settings targets are refused before mutation.
- Older desktop hosts remain valid because the new bridge namespace is
  optional and feature-detected.
- Cancelling stays available during asynchronous verification and invalidates
  its result before focus returns to the originating element.
- Changing the target, policy, or configured budget resets factor progress and
  discards any authorization state belonging to the previous target.
- Exhausted targets return an explicit exhausted outcome and do not invoke the
  protected action.
- Callers must not treat this playful lock as protection for sensitive data.

## Verification

The focused source suites are
`design/apps/web/tests/security/toy-lock-core.test.ts` and
`design/apps/web/tests/security/toy-lock-support-tickets.test.ts` and
`design/apps/web/tests/security/toy-lock-integration.test.ts` and
`design/apps/web/tests/components/ToyLockAuthenticationPopover.test.tsx`, plus
`design/apps/web/tests/components/toy-lock-activation-boundary.test.tsx`,
`design/apps/web/tests/components/SupportTicketsPanel.test.tsx`, and
`design/apps/web/tests/components/SettingsTabStrip.toy-lock.test.tsx` for direct,
keyboard, overflow, cancellation, focus-return, manual-PIN, and six-policy tab
activation paths.
Project policy requires
Node-based checks to run in continuous integration, so this implementation lane
does not claim a local test verdict. The byte-verbatim port verifier remains the
applicable local source check.

`scripts/verify-desktop-toy-lock-store.ps1 -SelfTest` is the desktop host-store
source validator. It checks the exact target and policy registries, constant-time
and resource-bounded factor handling, operating-system protection, narrow bridge
channels, the recovery-folder bridge, exact sender-frame checks, bounded queueing,
two-step enrollment, strict Base32 tail-bit handling, and recoverable generation
publication. Its in-memory mutations remove, duplicate, add, and reorder inventory
entries; reorder factor requirements; rename the asynchronous KDF; remove envelope
protection and prior-generation recovery; remove one handler's sender check; and
remove one recovery-folder validation step. Every mutation must turn red before the
restored source turns green. This is source evidence, not a hosted TypeScript or
packaged interaction verdict.

`scripts/verify-toy-lock-core.ps1 -SelfTest` checks the hand-written six-policy and
activation-route inventories, whole-policy verification seam, independent locked
target state, Support Tickets persistence and bulk/export operations, strict ticket
schema, no-network disclosure, recovery handoff, the integration adapter, the
policy wizard, the bounded host helper, the compatibility export, optional host
methods, host-owned duration and relock state, stale-revision handling, and
attempt-budget reasons. It removes each exact boundary once, including renamed
symbols and comment-like replacements, observes a red result, restores the source,
and observes green. This source check does not replace the focused hosted test or
packaged interaction evidence.

`scripts/verify-site-toy-locks.ps1 -SelfTest` is the site's static local
validator. It checks the exact six-policy registry, protected-action
interception, shared PIN path, bounded persistent attempts, non-extractable TOTP
key storage, disclosures, prompt accessibility, and absence of network APIs. Its
in-memory mutations prove the validator turns red when a required contract item
is removed, then green again on the restored source. This is source evidence,
not deployed-page interaction or capture evidence.

## Suggested articles

- [accessibility.md](accessibility.md)
- [context-menu-shortcuts.md](context-menu-shortcuts.md)
- [super-confirmation.md](super-confirmation.md)
- [ui-drive-evidence.md](ui-drive-evidence.md)
