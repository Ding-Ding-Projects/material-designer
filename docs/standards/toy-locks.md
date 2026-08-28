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
must be zero. The unused-bit counts are explicit for encoded residues 2, 4, 5,
and 7: 2, 4, 1, and 3 respectively. The host then creates one bounded, expiring pending
record. Confirm requires a current valid code before publishing a generation.
Mismatch, expiry, abandonment, write refusal, and revision drift retain the
prior lock. The toy-lock profile is RFC 6238 SHA-1, six digits, 30 seconds, with
one bounded skew step and no negative counters. The separate built-in
authenticator requirement supports broader algorithms, digits, and periods; it
remains unimplemented and this narrow toy-lock profile does not satisfy it.

`SettingsDialog` now consumes the optional bridge. It refreshes non-secret
metadata into its controlled tab map, keeps a locked tab focusable but inert for
direct selection, and routes a complete collected policy attempt to the host
with that lock's current revision. Returned metadata replaces the visible
remaining-attempt state, so remounting a prompt cannot renew a spent budget.
The built-in tab pointer, keyboard, overflow, Settings search, and in-panel
connector routes all delegate a locked request through the same tab activation
path before `activeSection` can change.

The General Settings surface now includes a lock panel for every allowed
Settings target. It exposes the exact six policies, a shared keypad/manual PIN
route, password entry, replace/remove actions, unlock duration choices, and
recovery disclosure. TOTP policies call the host-owned begin transaction and
then call the host-owned confirm transaction with a current code; the lock does
not publish until that confirmation succeeds. The pairing surface renders a
local in-process QR code for the bounded otpauth URI, states the SHA1, six-digit,
30-second parameters, and keeps the manual Base32 value behind an explicit
reveal action. The secret is held only in transient component state and is not
logged, persisted, exported, or sent over the network. Each tab's right-click
and Shift+F10 context-menu route opens the same configuration surface, whose
popup choices and Support Tickets list each have their own regex-capable search
field.

After a successful tab authentication, Settings caches authorization for the
selected surface lifetime, five minutes, or until close. A bounded five-minute
cache expires live, and Lock again removes it immediately. The locked tab keeps
an activation-capable wrapper with an explicit disabled state; pointer,
keyboard, overflow, search-result, command-palette, and programmatic activation
all run through the same authentication interception before section selection.

Support Tickets is local fiction rather than a network service. The panel is
reachable directly from the lock configuration, unlock prompt, and the Help
account menu. The Help route opens Settings and mounts the Support Tickets panel
immediately rather than dropping the user on a generic section. It stores bounded
ticket records in local browser storage, offers category search, selection,
inverse selection, bulk dismiss, filtered JSON export, and an action that asks
the host to open the application-data folder. It never deletes the folder
itself. The plain disclosure states that no ticket leaves the computer and
remains outside the funny copy.

Every renderer call into the toy-lock host has a 10-second deadline. Rejected
or timed-out list calls put Settings into an explicit unavailable state, and
the active content is inert while host state is loading or unavailable. Other
mutations surface a localized no-change notification when the host does not
answer.

The recovery response includes the exact validated application-data path used
by the host, displayed in a copyable code value. The privileged handler obtains
`app.getPath("userData")` once, confirms it resolves to an existing directory,
opens that same value, and returns that same value only after the open succeeds.
Invalid, empty, and failed results contain no path or credential detail, and the
renderer never derives or opens a second path.

Choice popups use a real listbox with one active option, roving tab stops, and
`aria-activedescendant` on the focused popup search input, alongside keyboard
arrow movement, Enter activation, Escape clear-then-close, focus restoration,
and a localized live result announcement.
Each context-menu action is filtered against its own translated label, so a
query never leaves an unrelated action visible and an empty result is stated.

Ticket records use the fixed, explicitly stored severity `dramatic`, the exact
three-category registry, collision-resistant local identifiers, and a bounded
serialized store checked before parsing. Older valid records that predate the
severity field are migrated to `dramatic` without dropping their descriptions,
and a local migration record is written. A newly created ticket progresses from
open to resolved and receives the fictional first response locally; five failed
identifier allocations report a distinct no-ticket-created outcome.

The tab context menu's Edit tab appearance action is wired through a typed
anchored adapter contract rather than a dead label. `SettingsDialog` passes the
production adapter into the strip; it dispatches the exact tab and activation
anchor to the shared appearance editor owned by the appearance lane, and
Shift+right-click dispatches the same request directly. The Settings strip does
not duplicate editor state. A consumer may use the callback or the
`SETTINGS_TAB_APPEARANCE_REQUEST_EVENT` fallback, but neither path is an inert
test-only action.

The production boundary also exposes a small consumer registry in
`settings-tab-appearance-consumer.ts`. The coordinated appearance editor lane
must register its consumer for the current mounted surface, receive the exact
section and DOM anchor, and dispose the registration on unmount. The registry
still emits the typed event for compatible consumers, so the authentication lane
owns policy and credentials while the appearance lane owns rendering and editor
state. The current appearance tip contains the editor but has not yet added
this registration, so complete production consumption remains an integration
dependency rather than a shipped claim.

Support Tickets opened from Help or directly from an unlock prompt use a
support-only panel. That route keeps the existing lock's save, replace, and
remove controls out of reach until the normal authenticated configuration route
has been completed. The configuration route can still open Support Tickets from
inside its own already-authorized panel.

The complete feature remains partial and unshipped: all-element configuration,
full app/page coverage, built-in authenticator breadth, packaged interaction,
and screenshots remain absent. The local QR pairing and Settings-surface
duration cache are implemented here, but still require packaged interaction
evidence before they can be described as shipped.

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
- A successful authentication cache is bounded to the selected surface,
  five-minute, or until-close duration. Lock again and unmount both clear it.
- Native selects remain a compatibility fallback, while each rich popup choice
  owns an anchored search field and its own regex state.
- Support Tickets stores only local, non-credential ticket records. Export is
  limited to the filtered selection and the recovery action never deletes data.
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
`design/apps/web/tests/components/SettingsToyLockPanel.test.tsx` covers the
successful exact-path recovery copy, invalid and empty recovery results,
legacy-ticket migration, and the actual Support Tickets button. The deadline
helper's synchronous-throw cleanup is covered by
`design/apps/web/tests/components/toy-lock-host-call.test.ts`, and the desktop
host directory boundary is covered by
`design/apps/desktop/tests/main/toy-lock-recovery-folder.test.ts`.
The local QR decoder validates the Reed-Solomon codeword blocks before reading
the URI, while the exact decoder round-trip test remains independent of the SVG
markup. Clipboard-unavailable recovery reports a localized manual-copy route.
Project policy requires
Node-based checks to run in continuous integration, so this implementation lane
does not claim a local test verdict. The byte-verbatim port verifier remains the
applicable local source check.

`scripts/verify-desktop-toy-lock-store.ps1 -SelfTest` is the desktop host-store
source validator. It checks the exact target and policy registries, constant-time
and resource-bounded factor handling, operating-system protection, narrow bridge
channels, exact sender-frame checks, bounded queueing, two-step enrollment, and
recoverable generation publication. Its in-memory mutations remove, duplicate,
add, and reorder inventory entries; reorder factor requirements; rename the
asynchronous KDF; remove envelope protection and prior-generation recovery; and
remove one handler's sender check. Every mutation must turn red before the
restored source turns green. This is source evidence, not a hosted TypeScript or
packaged interaction verdict.

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
