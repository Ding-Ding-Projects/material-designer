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

**Pure core only.** `design/apps/web/src/security/toy-lock-core.ts` now owns the
exact six-policy registry, ordered factor requirements, shared PIN validator,
attempt-budget reducer, and locked-target activation interceptor. Focused tests
prove that a locked activation returns an authentication request and never calls
the protected action, while an unlocked activation calls it exactly once.

The feature is not user-facing yet. Credential storage, hashing and vault use,
TOTP registration, QR and manual pairing, per-element context-menu commands,
the keypad interface, anchored authentication surfaces, persistence,
localization, accessibility verification, packaged interaction, and captures
are all still absent. Consequently the complete feature remains unshipped.

## Failure and safety behavior

- Invalid PIN input is rejected before any credential comparison.
- Empty, non-digit, too-short, and too-long PIN values have distinct outcomes.
- Attempt counts never become negative and a successful match restores the
  configured maximum.
- Exhausted targets return an explicit exhausted outcome and do not invoke the
  protected action.
- Callers must not treat this playful lock as protection for sensitive data.

## Verification

The focused source suite is
`design/apps/web/tests/security/toy-lock-core.test.ts`. Project policy requires
Node-based checks to run in continuous integration, so this implementation lane
does not claim a local test verdict. The byte-verbatim port verifier remains the
applicable local source check.

## Suggested articles

- [accessibility.md](accessibility.md)
- [context-menu-shortcuts.md](context-menu-shortcuts.md)
- [super-confirmation.md](super-confirmation.md)
- [ui-drive-evidence.md](ui-drive-evidence.md)
