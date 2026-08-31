# Universal settings and Status Hub

This article records the shared local settings surface added for the desktop
application and the documentation page. It is a source implementation record,
not a claim that packaged runtime capture has completed.

## Implemented source

The desktop surface is mounted from Settings at
`design/apps/web/src/components/universal-settings/UniversalSettingsPanel.tsx`.
Its state contract is
`design/apps/web/src/components/universal-settings/universalSettings.ts`, and
the live observer is
`design/apps/web/src/components/universal-settings/UniversalSettingsRuntime.tsx`.
The shell mounts the observer continuously, while the panel remains the editor.
The desktop store is prepared at
`design/apps/desktop/src/main/universal-settings-store.ts`, with focused
tests at `design/apps/desktop/tests/main/universal-settings-store.test.ts`.
The static-page module is
`site/assets/js/universal-settings.js`. The documentation page now mounts and
acknowledges it through `site/assets/js/canonical-feature-suite.js`, with the
complete panel markup in `site/index.html`. Browser state uses bounded local
storage and cross-tab events. The desktop preload and runtime bridge remain
pending, so the renderer uses the same honest local fallback there.

The exported central handoff inventory marks the Settings panel, shell runtime,
notification center, page registration, and page markup as mounted. Command
palette completion, every School-mode consumer, and the desktop preload/runtime
bridge remain `pending-c0`. The focused page Chut deliberately reverts one
mounted row and requires red, then restores it and requires green.

The versioned local record covers:

- exactly English, playful Hong Kong Cantonese, and bilingual modes;
- independent English and Cantonese tone levels, each bounded from 1 to 5 and
  initialized at 5;
- the dialog emoji preference;
- a user-renamable display label that never changes stable package or data
  identity;
- a shared School mode record with a user-selected name and credential-presence
  status, while never storing credential material;
- narrator opt-in, English/Cantonese/Both sequencing, runtime voice URI choices,
  unavailable-voice reporting, rate, pitch, quiet mode, and a serialized sample
  queue;
- bounded local, HTTPS API, and Home Assistant boolean schedules with dates,
  times, weekdays, priority, timezone display, validation, and safe fallback;
- five independently persisted attention accommodations, all off initially;
- local notification records with search, multi-selection, invert, mark-read,
  and bulk clear actions;
- evidence cards for provenance, the settings contract, and built-surface
  interaction evidence.

The Status Hub card is ready to register a session projection when a host
supplies the optional bridge. Without that bridge, it states that delivery is
local-only and never labels an unrun capture or missing URL as verified. The
status remains unrun until the central mount acknowledges the feature.

## State and safety boundaries

The renderer state contract uses a versioned browser-local record and exposes a
feature-detected host bridge. The desktop store provides the host-owned
app-data implementation, including atomic writes, revision checks, an isolated
redacted history repository, and a watcher for live propagation. The
documentation page has a separate browser-storage key because it is a different
local-data boundary. The renderer record is normalized before it is written or
sent, and the normalization path rejects unknown schema versions,
bounds strings, dates, times, schedules, notifications, voice identifiers and
numeric controls, and never stores a password, PIN, OTP seed, or other secret.

External schedule sources accept no embedded credentials. HTTPS API and Home
Assistant entries remain visibly configured but do not apply until their exact
source fields validate. An invalid or unavailable source leaves the local base
settings in effect. The optional host bridge owns privileged requests and vault
access when the shell lane provides it.

The host source resolver bounds DNS lookup itself and pins the validated public
address into the HTTPS connection. It retains the original hostname for Host
and TLS SNI, keeps certificate validation enabled, and does not follow redirect
responses. Private, loopback, link-local, IPv4-mapped, benchmark,
documentation, and special-use ranges are refused before connection.

The renderer exposes Home Assistant token methods only through its optional host
bridge. The host store source owns vault access, bounded response reads,
redirect refusal, public-DNS checks, and cancellation deadlines. External
refreshes use a generation check, so a late response cannot overwrite a newer
state.
Cross-midnight and weekday/date matching remains local-time based, and an
unavailable source leaves the last valid local state in effect.

School mode keeps its own control and Status Hub visible while suppressing the
other language, tone, narrator, schedule, attention, and notification tabs.
The previous values remain in the versioned record and return when School mode
is turned off. The current source exposes the shared `general` toy-lock seam;
the full QR pairing, ordered factor authentication, keypad, duration, relock,
and recovery interaction remains owned by the dedicated toy-lock lane. The
hand-written consumer inventory and subscription API include routes,
command-palette results, notifications, vocabulary, and dim-sum surfaces, but
the source does not claim comprehensive suppression until C0 registers every
consumer.

Every picker in the desktop universal panel has its own `RegexSearchField`,
including language mode, narrator language, both voice lists, schedule source,
and lock policy. The page creates a separate `data-regex-builder` field for
each dynamic picker and each dynamic universal tab, so a pattern cannot leak
between choices.

The renderer emits revisioned change events through local storage, `storage`,
and `BroadcastChannel`. The desktop host store records redacted metadata and
maintains an isolated app-data history repository without placing credential
material in the settings record.

The web panel uses the real notification store for review and bulk selection.
Selected removal passes through the native destructive-confirmation component.
The static page exposes a confirmation callback seam and refuses to remove
records when no confirmation owner is registered.
Notification bulk operations return structured outcomes with requested,
succeeded, failed, not-attempted, skipped, cancellation, remaining-count, and
status fields matching the shared bulk-action vocabulary needed by the tabs and
history lanes.

Narrator queue utterances now carry the selected stable voice identity, rate,
and pitch into the speech engine. The runtime keeps voice fallback explicit
when a saved identity is absent, while preserving the existing serialized
queue, debounce, cooldown, screen-reader ducking, and quiet behavior.

The documentation page equivalent keeps any credential presence bounded to the
current browser visit and never claims a vault or remote delivery. Its mounted
surface also owns the page-local two-key slider confirmation, personal-wording
picker, logo customization, and the exact thirty-row source-status matrix.

## Search and accessibility

Each universal settings tab creates its own `RegexSearchField` controller in
the desktop panel. Plain text remains the default, and the adjacent builder is
bound to that tab's query and flags. The documentation page marks its own
search input with `data-regex-builder`, so the page's existing regex module
attaches an independent anchored builder. Tabs use `role=tablist`, `role=tab`,
and `role=tabpanel`; controls have labels, live status text, visible focus from
the existing design system, and 44px minimum interaction sizing in the new
panel stylesheet. The layout collapses to one column at narrow widths and
honors reduced motion.

## Current source status

This lane ports the preserved universal settings surface into the isolated
`universal-settings` module boundary. It adds strict top-level and nested
record-key validation, bounded browser storage reads, local-time schedule
matching including cross-midnight weekday ownership, per-language funny levels,
optional host seams, and dedicated ADHD, schedule, School mode, and startup
surprise modules. The desktop host store adds revision-checked persistence,
protected Home Assistant source resolution, bounded response handling, DNS
address checks, and redacted local history. The page module adds its own
bounded local record, per-panel search state, narrator fallback, schedule
overlays, momentum snooze, and callable surprise surface. The narrator now
carries the selected stable voice identity, rate, and pitch into its serialized
speech environment. These are source claims only until C0 mounts and
acknowledges the central consumers and hosted checks run.

## Verification record

The pure source checks for `universalSettings.ts` are in
`design/apps/web/tests/components/universalSettings.test.ts`. They cover
schema rejection, bounded normalization, all schedule source combinations,
cross-midnight matching, precedence, notification bulk operations, voice
selection, serialized narration parts, ADHD and School mode helpers, and the
startup surprise probability and one-draw rule.

The host source checks are in
`design/apps/desktop/tests/main/universal-settings-store.test.ts`. They cover
revision checks, protected credential handling, exact source request validation,
private and loopback address refusal, DNS-backed private-address refusal,
redirect and credential request options, bounded response bytes, timeout
cancellation, allowlisted remote values, and truthful local Status Hub records.

The page source checks are in
`scripts/test-universal-settings-site.mjs`. They cover the page defaults,
unknown-record rejection, local-time and cross-midnight schedule matching,
equal-time semantics, external-rule fallback, narrator language ordering,
search inventory, and the explicit local-asset surprise boundary.

The current task does not run the Node, package-manager, or desktop runtime
locally. Hosted type, unit, packaged interaction, accessibility, and per-action
capture evidence must be run against the final integrated commit. Until that
evidence exists, the Status Hub cards intentionally report those portions as
unrun.

The daemon unlock ladder bridge and built-surface capture records remain outside
this source mount. The renderer destination fails closed when that bridge is
missing. Page and renderer sources are mounted, while packaged interaction must
still be verified against the final integrated commit.

The narrow completeness Shek Q is `scripts/check-universal-settings.mjs`. It
checks the hand-written module inventory and exact export boundaries. It was
deliberately broken by renaming `scheduledSettingsAt`, returned exit code 1,
then restored and returned exit code 0. That red-then-green run proves the
negative path is live rather than decorative.

## Suggested articles

- [Language modes](language-modes.md)
- [Notifications](notifications.md)
- [Regex builder](regex-builder.md)
- [Toy locks](toy-locks.md)
- [UI drive evidence](ui-drive-evidence.md)
