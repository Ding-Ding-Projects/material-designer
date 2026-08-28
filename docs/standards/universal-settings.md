# Universal settings and Status Hub

This article records the shared local settings surface added for the desktop
application and the documentation page. It is a source implementation record,
not a claim that packaged runtime capture has completed.

## Implemented source

The desktop surface is `design/apps/web/src/components/universal/UniversalSettingsPanel.tsx`.
Its state contract is `design/apps/web/src/components/universal/universalSettings.ts`,
and the panel is mounted from `design/apps/web/src/components/SettingsDialog.tsx`.
The documentation page owns the equivalent browser-local module at
`site/assets/js/universal-settings.js` and markup in `site/index.html`.
The authoritative desktop record is owned by
`design/apps/desktop/src/main/universal-settings-store.ts`, exposed through the
host protocol and preload bridge. Writes require the exact previous revision,
publish only after an atomic file replacement, and notify every live desktop
window. Browser storage remains only the documented page equivalent.

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

The desktop Status Hub card now registers a session projection with the host,
reports evidence, maintains a bounded heartbeat, and reads the last report
back. When no authenticated shared endpoint is connected, the card states that
the host projection is a local fallback and gives the no-delivery reason. It
never labels an unrun capture or missing URL as verified.

## State and safety boundaries

The desktop state uses the host-owned `universal-settings/settings.v1.json`
record under the app-data directory and broadcasts changes from the main
process after a revision-checked write. The documentation page uses a separate
browser-storage key because it is a different local-data boundary. The
renderer record is normalized before it is sent, and the host store rejects
unknown schema versions,
bounds strings, dates, times, schedules, notifications, voice identifiers and
numeric controls, and never stores a password, PIN, OTP seed, or other secret.

External schedule sources accept no embedded credentials. HTTPS API and Home
Assistant entries remain visibly configured but do not apply until their exact
source fields validate. An invalid or unavailable source leaves the local base
settings in effect.

The desktop host now exposes a separate Home Assistant token enrollment and
clear operation. The token is protected with the operating-system vault adapter
and never enters `settings.v1.json`, renderer state, exports, logs, or captures.
The resolver validates an HTTPS or loopback base URL, an exact boolean entity
identifier, refuses redirects, bounds the response to 64 KiB, and uses a
four-second cancellation deadline. `on` applies only allowlisted temporary
values, `off` returns an empty overlay so the local base value wins, and missing
vault material reports `credential-unavailable` without an unauthenticated
request.
Responses are read incrementally and cancelled at the 64 KiB bound even when a
source omits `Content-Length`.

The shell runtime applies matching local and externally refreshed rules to the
live document, including theme, density, accent colour, font family, language,
display label, and attention modes. External refreshes run on a bounded
interval and carry a generation check, so a late response cannot overwrite a
newer state. Cross-midnight and weekday/date matching remains local-time based,
and an unavailable source leaves the last valid local state in effect.

School mode keeps its own control and Status Hub visible while suppressing the
other language, tone, narrator, schedule, attention, and notification tabs.
The previous values remain in the versioned record and return when School mode
is turned off. The current source calls the host-vault toy-lock configuration
path for the shared `general` target. The full QR pairing, ordered factor
authentication, keypad, duration, relock, and recovery interaction remains
owned by the dedicated toy-lock lane.

Every picker in the desktop universal panel has its own `RegexSearchField`,
including language mode, narrator language, both voice lists, schedule source,
and lock policy. The page creates a separate `data-regex-builder` field for
each dynamic picker and each dynamic universal tab, so a pattern cannot leak
between choices.

The desktop store also appends redacted setting-change metadata to its local
history stream after a successful state write. The metadata contains revision,
timestamp, action, and field names only. A history-write failure never turns a
successful setting mutation into a reported failure.

In addition to the JSONL recovery stream, the host store maintains an isolated
Git history repository beneath its application-data directory. Each settings
revision writes a redacted snapshot and creates an append-only commit.
Home Assistant credential enrollment and removal create metadata-only history
events, while credential bytes remain protected outside the history repository.
If Git is unavailable, the JSONL stream remains the explicit local fallback and
the live settings write stays intact.

The host store also watches the shared settings file while listeners are
registered. A second running surface therefore receives a changed record after
the file update rather than waiting for a restart. The host schema rejects
unknown top-level and nested keys, unsupported language or narrator values,
out-of-range funny levels, invalid narrator tuning, malformed attention flags,
and notification tones before persistence.

Narrator queue utterances now carry the selected stable voice identity, rate,
and pitch into the speech engine. The runtime keeps voice fallback explicit
when a saved identity is absent, while preserving the existing serialized
queue, debounce, cooldown, screen-reader ducking, and quiet behavior.

The documentation page cannot access an operating-system vault. Its equivalent
uses a bounded credential held in `sessionStorage` for the current browser
visit, exposes presence only, clears it explicitly, and states that no remote
delivery or vault claim is made.

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

## Latest source repair

Commit `5b2f0a67` tightened the host record to an explicit allowlisted schema,
added the shared-file watcher, and made the shell apply scheduled appearance
and attention values instead of merely displaying them in Settings. It also
passes stable voice identity, rate, and pitch from persisted narrator choices
into the serialized speech queue and applies the dialog emoji preference to
newly mounted dialogs. The source assertions cover unknown host fields and
bounded narrator tuning. These are source claims only until hosted checks run.

Commit `ab1450b1` extends that boundary with over-depth and collection limits,
finite-value validation, serialized writes, transient rename retry, watcher
deduplication, live schedule refresh, effective shell consumers, chosen School
name propagation, host-backed disable authentication, hashed browser fallback
credentials, storage and BroadcastChannel synchronization, page attention
effects, scheduled value editors, and roving settings-tab keyboard focus. The
status surface now binds provenance evidence to a validated source commit when
the running package provides one. Hosted and packaged behavior remains unrun.

Commit `702901e1` makes effective scheduled language use the scheduled value,
refreshes local schedules on the same bounded timer as external sources, and
excludes unavailable or explicitly off external rules from both the shell and
the Settings preview. The unscheduled base state therefore remains authoritative
when a source cannot provide a current valid overlay.

## Verification record

The pure source checks for `universalSettings.ts` are in
`design/apps/web/tests/components/universalSettings.test.ts`. They cover
schema rejection, bounded normalization, all six schedule source combinations,
cross-midnight matching, precedence, notification bulk operations, voice
selection, serialized narration parts, and provenance-card fallback.

The current task does not run the Node, package-manager, or desktop runtime
locally. Hosted type, unit, packaged interaction, accessibility, and per-action
capture evidence must be run against the final integrated commit. Until that
evidence exists, the Status Hub cards intentionally report those portions as
unrun.

The host-store test is
`design/apps/desktop/tests/main/universal-settings-store.test.ts`. It covers
revision zero, listener publication, stale-write refusal, atomic persistence,
credential-key refusal, and allowed credential-presence metadata. It is source
evidence only until the hosted suite runs.

The unlock ladder is now a real local-daemon route at
`design/apps/daemon/src/routes/unlock-ladder.ts`, registered by the daemon and
consumed by `design/apps/web/src/components/UnlockLadderPanel.tsx`. Challenges
are server-generated, nonce-bound, single-use, bounded to three ladder uses per
rolling hour, and time-bound for the mole round. School mode begins at sums,
winning returns `clearsWaiting` while keeping `credentialStillRequired: true`,
and the route emits no session cookie. The authentication popover only offers
the ladder after its normal factor attempt budget is exhausted.

Its visible stages and challenge controls use the active language mode, with
screen-reader labels for each arithmetic answer and mole cell. A successful
ladder result remains separate from credential verification and only clears the
waiting period.

The page source keeps a hand-written search inventory for every universal tab,
picker, and list. Each dynamic tab receives its own anchored builder field, and
the page validates that all seven declared panels exist before rendering.

## Suggested articles

- [Language modes](language-modes.md)
- [Notifications](notifications.md)
- [Regex builder](regex-builder.md)
- [Toy locks](toy-locks.md)
- [UI drive evidence](ui-drive-evidence.md)
