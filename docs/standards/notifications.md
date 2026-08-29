# Notifications and destructive-action confirmation

Two standards that are opposite sides of one rule: **interrupt the user only for
a decision they must make.** Everything that merely informs becomes a
non-blocking notification; the small set of things that are genuinely
irreversible get a gate that is deliberately hard to pass by accident.

**Status:** the notification centre, local bulk orchestration and export are
**source-mounted**. The notification store's persistence and multi-record delete
port remain owned by the C1 store lane. Hosted packaged interaction and visual
evidence remain open.

The accepted preservation side keeps ordinary pointer and Space activation on a
single checkbox toggle path, uses modifier-aware range selection, and places
the store dependency behind `notificationBulk.ts`. Delete is disabled before
the destructive gate when the C1 `clearNotificationIds` export is unavailable, with the
exact missing-capability reason exposed through the control name and tooltip.
When C1 does expose deletion, the adapter requires one structured
`deleted`/`skipped`/`failed` outcome for every requested id. Partial results stay
visible in the gate with each returned reason and keep the failed or skipped
records selected, so the centre never turns an incomplete operation into a
success claim.

## Requirement 1 — non-blocking notifications

Informational, success, progress and non-decision error messages appear as
**non-blocking notifications** anchored in a screen corner, never as modal
dialogs that halt the application.

| Property | Requirement |
| --- | --- |
| Placement | Anchored in a corner. Consistent across the product. |
| Dismissal | Auto-dismiss on a sensible timeout. **Errors and warnings persist until dismissed.** |
| Stacking | Multiple notifications stack without overlapping. |
| Content | Title, body, and optional actions or links — retry, undo, open, view details. |
| Accessibility | Focusable, announced by assistive technology, sufficient contrast, an adequate dismiss target. |
| Language | Subject to the language modes and both tone sliders, like all other copy. |

**Modals are reserved strictly for decisions the user must make before
continuing**: confirmations, unsaved-changes prompts, destructive-action gates,
and credential or consent steps. Everything that only informs becomes a
notification.

### No nagging

The product must not interrupt users with unsolicited dialogs, banners,
popovers, notifications or startup interruptions asking for payment, donations,
sponsorship, support, reviews, ratings, upgrades or subscriptions. No "support
us" or equivalent recurring prompt ships.

User-initiated account, billing, purchase, support or feedback flows may explain
their own next steps in context, but stay non-blocking unless the user must
explicitly confirm a consequential action.

### A notification centre

Dismissed notifications stay reviewable in a notification centre or history, so
an auto-dismissed message is not a lost one.

## Requirement 2 — super confirmation for destructive actions

Every destructive action passes a confirmation gate implemented **in the
application's own interface layer and codebase**. Not a separate helper
application, not a detached window, not a hosted page, not an external service,
not a separate site.

### The gate

1. It **clearly identifies the exact destructive action and the affected data** —
   which items, how many, what becomes irreversible.
2. It exposes **two independently operated key controls**.
3. **Both keys** must be engaged before a full-range confirmation slider becomes
   enabled.
4. A **dramatic but non-blocking progress animation** plays while the slider
   moves, and a distinct completion animation plays after authorization.
5. An **always-available emergency exit** or equivalent cancel control is
   present, alongside the platform's own cancellation path.
6. Focus returns to the originating control after cancellation or completion.
7. The action **never** executes unless both keys and the slider have completed.

Prefer an **anchored** dialog beside the destructive control; use a modal only
where the layout cannot safely host an anchored surface.

### Safety facts stay unambiguous

Animation and playful copy may style the experience. They must not obscure what
will be deleted, changed or made irreversible. At every language mode and every
tone level, the gate still names the exact items and the exact consequence — the
voice-not-facts rule from [language-modes.md](language-modes.md), applied where
it matters most.

The gate is keyboard-operable, screen-reader named, visibly focused, aware of
reduced-motion preferences, contrast-safe, and usable at narrow widths and high
display scales.

## Current implementation status

| Requirement | Status |
| --- | --- |
| Non-blocking notification surface | **Source-mounted.** The host renders a corner stack without taking focus. |
| Auto-dismiss with a timeout | **Source-mounted.** Severity-specific timers are owned by the store. |
| Errors and warnings persisting until dismissed | **Source-mounted in the base store.** The store keeps urgent records live until dismissal; persistence across reload remains owned by C1. |
| Stacking without overlap | **Source-mounted.** The host bounds and stacks the live records. |
| Actions and links in a notification | **Source-mounted.** Actions run through the record and mark it read before invoking the callback. |
| Notification centre | **Source-mounted.** Search, local regex builder, bulk selection and export are present. |
| Non-blocking settings surface | Designed — settings become a full page rather than a modal dialog, which is the rule applied correctly. |
| No nagging | Nothing nagging appears in the design. |
| **Super-confirmation gate** | **Source-mounted for centre deletion.** The centre routes deletion through the two-key plus full-range slider, pending the C1 store bulk-delete export. |

### The gap

> [!WARNING]
> **The destructive-action gate is absent from the mockup entirely.** Delete
> actions exist — in the bulk-selection bar and in the item context menu, the
> latter styled in the error colour — but there is no two-key control, no
> full-range slider, no progress or completion animation, and no emergency exit.
>
> This is the largest undesigned gap in the whole standards set. Every other
> unmet standard has at least a specification to build from; this one needs to be
> designed before it can be built, and it guards the actions where getting it
> wrong destroys user data.

<details>
<summary><b>What the mockup does specify</b> — the notification and message-centre anatomy</summary>

**Notification**: fixed to the lower-left, clear of the navigation rail, 48px
minimum height with a 14px corner radius, on the inverse-surface role with
inverse-on-surface text and a strong shadow. It carries a status icon, a message
naming the exact change and its commit hash, and an **Undo** action tinted with
the inverse-primary role. It auto-dismisses after 6 seconds.

Two details worth keeping: the message names the concrete change and its
identifier rather than saying "saved", and the undo action is inside the
notification rather than somewhere the user has to go and find.

**Message centre**: a 380px **standard side sheet** — not a popover, which is
what the current component is and what the redesign explicitly changes. It
carries all/unread/read filter chips, a mark-all-read action, and notification
entries with tonal icon wells, unread dots and timestamps. The bell in the header
shows an unread count badge ringed against the surface so it stays legible over
any background.

**Notification settings**: four switches — task completion, system notifications,
completion sound, automation digests — under copy that states the rule directly:
completion notices land in the message centre and a notification, never a modal.

</details>

## Implementation notes

### The dismissal rule is not one timeout

Informational and success notifications auto-dismiss. **Errors and warnings do
not** — they persist until the user dismisses them. A single global timeout
applied to everything is the most common way this standard is failed, and the
failure is silent: the error appears, nobody is looking, and it vanishes.

Progress notifications persist for the duration of their operation and then
resolve into a success or an error, rather than disappearing and leaving the user
unsure whether the operation finished.

### Two keys means two, and independent

The point of two independent key controls is that no single mis-click, stray
keypress or accidental drag can reach the slider. If both keys can be engaged by
one gesture, or one enables the other, there is one control with extra steps.

The slider is full-range and deliberate — a drag that must be completed, not a
button styled as a slider. Together they mean the gate cannot be passed by an
input the user did not intend.

### Reduced motion does not remove the gate

The progress and completion animations respect a reduced-motion preference by
becoming a non-animated state change. What must not happen is the gate itself
being skipped or shortened because animation is reduced. Reduced motion is an
accessibility preference, not a safety preference.

### The emergency exit is always reachable

Available at every moment of the gate, including mid-slider, and reachable by
keyboard. The platform's own cancellation path works too. After either,
focus returns to the control that opened the gate.

## Failure modes

| Failure | Consequence |
| --- | --- |
| An informational message shown as a modal | Halts the application to say something the user did not need to answer. |
| One timeout for every notification | Errors vanish unseen. Errors and warnings must persist. |
| Notifications overlapping | The newest hides the previous; a stack of results becomes one result. |
| A dismissed notification unrecoverable | The centre exists precisely so auto-dismissal is safe. Without it, auto-dismissal loses information. |
| A destructive action with an ordinary confirm dialog | Does not meet the standard. Two keys, then a slider, then an emergency exit. |
| Two keys that one gesture can engage | One control wearing a costume. |
| The gate implemented as a separate window or hosted page | Explicitly forbidden. It lives in the application's own interface layer. |
| Playful copy at a high tone level obscuring what will be deleted | The facts survive every tone level. This is where that rule matters most. |
| The gate skipped under reduced motion | An accessibility preference must never weaken a safety control. |
| Focus lost after cancel or completion | The user is dropped somewhere unrelated after the most consequential interaction in the product. |
| A nagging prompt for support, ratings or upgrades | Explicitly forbidden. |

## Security considerations

- **The gate is a safety control, and safety controls are not decorative.** Any
  code path that reaches a destructive operation without passing the gate defeats
  it entirely. Enforce it at the operation, not only at the button — a keyboard
  shortcut, a command-palette entry, a context-menu item and a bulk action must
  all route through the same gate.
- **Name the real scope.** A gate that says "delete these items" when the
  operation also removes their version history has obtained consent for something
  other than what happens. The count and the consequence must be exact.
- **Notifications can leak.** They render on top of everything and are frequently
  screen-shared. Never put a token, a key, a credential or a full private path in
  a notification body.
- **Credential and consent steps stay modal.** They are one of the few genuine
  exceptions to the non-blocking rule, because proceeding without an answer would
  mean proceeding without consent.
- **Undo is not a substitute for the gate.** Where an action is genuinely
  reversible through the local version history, say so and prefer a notification
  with an undo action. Where it is not, the gate applies — and the gate's copy
  must not imply an undo that does not exist.

## Verification

**Nothing to verify yet.** Conformance requires all of:

**Notifications**

- [ ] every informational, success and progress message rendered as a
      non-blocking notification, with an audit that no modal remains for a
      non-decision message
- [ ] success and informational messages auto-dismissing; **errors and warnings
      persisting** until dismissed — tested by triggering one of each and waiting
- [ ] several simultaneous notifications stacking without overlap
- [ ] actions inside notifications working, including undo
- [ ] every dismissed notification present in the centre afterwards
- [ ] notifications focusable, announced, contrast-checked, with an adequate
      dismiss target
- [ ] copy correct in all three language modes at every tone level, with the
      facts intact at level 5
- [ ] no nagging prompt of any kind at startup or during use

**Super confirmation**, for every destructive action in the product:

- [ ] untouched state — the slider is disabled
- [ ] one key only — still disabled
- [ ] both keys — enabled
- [ ] partial slider — no action
- [ ] full slider — the action runs, exactly once
- [ ] cancel and the platform cancellation path, both mid-gate
- [ ] focus returned to the originating control after cancel and after completion
- [ ] reduced motion — the gate intact, the animation reduced
- [ ] keyboard-only operation end to end
- [ ] assistive-technology labels naming the action and the affected data
- [ ] all three language modes at tone levels 1 and 5, with the affected items
      and the irreversibility named in every combination
- [ ] the action's real success **and** failure paths
- [ ] every route to the destructive operation — button, shortcut, command
      palette, context menu, bulk action — proven to pass through the gate

The last item is the one that makes the gate real. A gate on the button and an
unprotected path from the command palette is not a gate.

## Suggested reading

- [language-modes.md](language-modes.md) — the voice-not-facts rule this standard depends on
- [accessibility.md](accessibility.md) — focus, announcement and reduced motion
- [tabs.md](tabs.md) — bulk close, which is the most likely first destructive action to need the gate
- [material-design-3.md](material-design-3.md) — anchored non-modal surfaces
