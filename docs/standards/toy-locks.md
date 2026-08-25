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

`design/apps/web/src/components/settings/SettingsTabStrip.tsx` now accepts
controlled per-tab lock policy data and a host-owned factor verifier. Every tab
rendered by that strip, including an overflow-menu entry, stays focusable and
activation-capable while locked. Pointer and keyboard activation are intercepted
before the original section-selection callback can run. The original callback is
retained and invoked exactly once only after the configured policy succeeds.
Cancellation leaves the section unchanged and returns focus to the originating
tab or overflow action. The strip does not define, store, or infer credentials.

The host supplies `verifyFactor`. Password and TOTP verification are interfaces,
not credential implementations: this source does not persist secrets, hash
passwords, access a credential vault, register TOTP, or pair QR/manual secrets.
Verifier rejection is a visible retryable state and does not silently spend an
attempt. The visible budget is component-local in this slice and resets when a
new prompt mounts; persistent per-lock budgets still belong to the missing host
integration. Switching between keypad and manual entry inside one prompt does
not reset it. `SettingsDialog` now mounts `SettingsTabStrip` as its live section
navigation owner, supplies permission-filtered tabs, and routes ordinary
unlocked selection through one controlled callback. The host currently supplies
an empty lock map and a verifier that always refuses any externally introduced
lock. This makes unlocked navigation real without pretending a user-configured
lock can exist before the credential boundary does. Credential persistence,
lock-configuration context menus, persistent attempt budgets, TOTP pairing,
every-element coverage, packaged interaction, and screenshots remain absent.
Consequently the complete feature remains partial and unshipped.

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
`design/apps/web/tests/components/ToyLockAuthenticationPopover.test.tsx`, plus
`design/apps/web/tests/components/SettingsTabStrip.toy-lock.test.tsx` for direct,
keyboard, overflow, cancellation, focus-return, manual-PIN, and six-policy tab
activation paths.
Project policy requires
Node-based checks to run in continuous integration, so this implementation lane
does not claim a local test verdict. The byte-verbatim port verifier remains the
applicable local source check.

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
