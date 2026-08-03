# Super confirmation for destructive actions

**Standard 7.** Every destructive action passes a gate that cannot be crossed by
an input the user did not intend: two independently operated keys, then a
full-range slider, with an always-available emergency exit.

> [!WARNING]
> **Status: not started, and not designed.** This is the largest undesigned gap
> in the whole standards set. Every other unmet standard has at least a
> specification to build from; this one has to be designed before it can be built
> — and it guards the actions where getting it wrong destroys the user's work.

## The requirement

### Where it lives

**In the application's own interface layer and codebase.** Not a separate helper
application, not a detached window, not a hosted page, not an external service,
not a separate site.

Prefer an **anchored** surface beside the destructive control; use a modal only
where the layout cannot safely host an anchored one. This is one of the few
places a modal is legitimate at all — see
[notifications.md](notifications.md) for the rule it is an exception to.

### The gate, in order

1. It **clearly identifies the exact destructive action and the affected data** —
   which items, how many, and what becomes irreversible.
2. It exposes **two independently operated key controls**.
3. **Both keys** must be engaged before a full-range confirmation slider becomes
   enabled.
4. A **dramatic but non-blocking progress animation** plays while the slider
   moves, and a **distinct completion animation** plays after authorization.
5. An **always-available emergency exit** is present, alongside the platform's
   own cancellation path.
6. **Focus returns to the originating control** after cancellation or completion.
7. The action **never** executes unless both keys and the slider have completed.

### Facts survive every setting

Animation and playful copy may style the experience. They must not obscure what
will be deleted, changed or made irreversible.

At every language mode and every tone level, the gate still names the exact items
and the exact consequence. This is the voice-not-facts rule from
[language-modes.md](language-modes.md), applied where it matters most: a warning
nobody can act on is a broken warning, not a funny one.

### It is accessible, and accessibility never weakens it

Keyboard-operable end to end, screen-reader named, visibly focused, contrast-safe,
usable at narrow widths and high display scales, and aware of reduced-motion
preferences.

**Reduced motion reduces the animation, never the gate.** The progress and
completion animations become non-animated state changes; the two keys and the
full-range slider stay exactly as they were. An accessibility preference is not a
safety preference, and a user who prefers less motion has not asked for less
protection.

## Why a gate this elaborate

The obvious objection is that a confirmation dialog already exists and users click
through it. That is precisely the argument for this design: **an ordinary confirm
dialog is defeated by the habit it creates.** After the fiftieth "Are you sure?",
the answer is muscle memory, and the dialog is a speed bump that costs everyone
time and protects nobody.

Each element answers a specific failure:

- **Naming the exact data** answers *consent to the wrong thing*. "Delete 42
  items" and "Delete 42 items and their entire version history" are different
  operations; a gate that obtains agreement to the first while performing the
  second has not obtained consent at all.
- **Two independent keys** answer *the accidental input*. A stray click, a
  keypress into an unexpectedly focused surface, a drag that lands somewhere the
  user did not look. One control can be hit by accident; two controls in different
  places, requiring separate deliberate gestures, cannot.
- **A full-range slider** answers *the habit*. It cannot be completed without
  sustained, deliberate effort, so it never becomes reflex — and because it takes
  time, there is a window in which the user reads what they are about to do.
- **The progress animation** answers *the invisible commitment*. The user should
  be able to see how far through the irreversible threshold they are, and stop.
- **The emergency exit** answers *the change of mind mid-gesture*. A gate with no
  escape is a trap, and a trap teaches users to avoid the surface entirely.
- **Focus return** answers *the disorientation after the most consequential
  interaction in the product*.

> [!IMPORTANT]
> **Two keys means two, and independent.** If both keys can be engaged by one
> gesture, or if one enables the other, there is one control with extra steps and
> the whole design is decoration. The test is simple: can any single input event
> reach the slider? If yes, it is not two keys.

## Where the gate applies

**Every route to the destructive operation, not every button.**

Enforce the gate **at the operation**, not at the affordance. A keyboard
shortcut, a command-palette row, a context-menu item, a bulk action and an
automation all reach the same code, and a gate installed on the button is bypassed
by all four of the others.

Actions that need it in this product include, at minimum:

| Action | Where it is reached from |
| --- | --- |
| Delete a document, project or record | Context menu, item action, bulk selection |
| Bulk close tabs by text match | The strip's bulk-close actions — see [tabs.md](tabs.md) |
| Prune version history | The history panel — see [version-history.md](version-history.md) |
| Reset all appearance customization | The appearance surface — see [appearance-customization.md](appearance-customization.md) |
| Delete a connected account or service | Settings |
| Any bulk action whose per-item form is destructive | Every list surface — see [export-and-bulk-actions.md](export-and-bulk-actions.md) |

**Where an action is genuinely reversible** through the local version history,
prefer a notification with an undo action and say so. The gate is for what cannot
be taken back — and the gate's own copy must never imply an undo that does not
exist.

## Current implementation status

| Requirement | Status |
| --- | --- |
| The gate itself | **Not started, and not designed.** |
| Exact action and affected data named | **Not designed.** |
| Two independent key controls | **Not designed.** |
| Full-range slider gated on both keys | **Not designed.** |
| Progress and completion animations | **Not designed.** |
| Emergency exit and platform cancellation path | **Not designed.** |
| Focus return to the originating control | **Not designed.** |
| Enforcement at the operation rather than the button | **Not designed.** |
| Destructive actions that will need it | **Present in the mockup** — a delete in the bulk-selection bar and a delete in the item context menu, the latter styled in the error colour. Both are plain actions with no gate. |

The mockup draws the destructive actions and none of the protection. That is the
worst combination to inherit, because the surfaces look finished: an
implementation that ports the mockup faithfully ships working delete buttons with
no gate behind them, and nothing in the design file signals that anything is
missing.

## Configuration

**This standard has no user-facing configuration, deliberately.** There is no
setting to weaken or skip the gate, because a safety control the user can switch
off protects nobody at the moment it matters — the moment they have already
decided they are in a hurry.

Two things vary, and neither is a switch:

| Varies with | What changes | What never changes |
| --- | --- | --- |
| Reduced-motion preference | The progress and completion animations become state changes | Both keys, the full slider, the emergency exit |
| Language mode and tone level | The voice of the surrounding copy | The named items, the named consequence, the word "irreversible" where it applies |

## Failure modes

| Failure | Consequence |
| --- | --- |
| An ordinary confirm dialog | Defeated by habit. Does not meet the standard. |
| Two keys one gesture can engage | One control wearing a costume. |
| A slider that is really a button | Restores the reflex the slider exists to break. |
| The gate on the button, not the operation | Bypassed by the shortcut, the palette, the context menu, the bulk action and the automation. |
| Copy that names the action but not the scope | Consent obtained for something other than what happens. |
| A gate implemented as a separate window or hosted page | Explicitly forbidden. It lives in the application's own interface layer. |
| Playful copy at tone level 5 obscuring what will be deleted | The facts survive every tone level. This is where that rule matters most. |
| The gate skipped or shortened under reduced motion | An accessibility preference weakening a safety control. |
| No emergency exit mid-slider | A trap. Users learn to avoid the surface rather than the mistake. |
| Focus lost after cancel or completion | The user is dropped somewhere unrelated after the most consequential interaction in the product. |
| The action running twice on a double completion | The gate must be idempotent: one authorization, one execution. |
| The gate implying an undo that does not exist | Consent obtained under a false premise. |
| A gate on the destructive action but not on its bulk form | The bulk form is the one with the larger blast radius. |

## Security considerations

- **A safety control that is not enforced at the operation is not a safety
  control.** Any code path reaching the destructive operation without passing the
  gate defeats it entirely. This is an authorization boundary, and boundaries are
  enforced in the handler, never in the interface.
- **Name the real scope.** A gate that says "delete these items" when the
  operation also removes their version history has obtained consent for a
  different action. The count and the consequence must be exact, and they must be
  computed from the same captured set the operation will act on — not recomputed
  afterwards, or the preview and the execution can diverge.
- **Authorization is single-use.** Completing the slider authorizes one execution
  of one captured set. It does not authorize a retry, a second identical action,
  or the same action after the selection changed.
- **Do not put sensitive values in the gate's copy.** It renders on top of
  everything and is exactly the kind of surface that ends up in a screenshot
  attached to a bug report. Name the record, not its contents.
- **Cancellation must leave nothing half-done.** An emergency exit pressed
  mid-slider has authorized nothing, so nothing may have started. Do not begin the
  work when the slider starts moving.

## Verification

**Nothing to verify yet.** The gate does not exist, and unlike the rest of the
standards set, no design specifies it.

Conformance requires all of, **for every destructive action in the product**:

- [ ] untouched state — the slider is disabled
- [ ] one key only — still disabled
- [ ] both keys — enabled
- [ ] partial slider — no action
- [ ] full slider — the action runs, **exactly once**
- [ ] a second completion of an already-authorized gate running nothing
- [ ] cancel and the platform cancellation path, both mid-gate, leaving no
      partial work behind
- [ ] focus returned to the originating control after cancel **and** after
      completion
- [ ] reduced motion — the gate intact, the animation reduced
- [ ] keyboard-only operation end to end
- [ ] assistive-technology labels naming the action **and** the affected data
- [ ] all three language modes at tone levels 1 and 5, with the affected items
      and the irreversibility named in every combination
- [ ] the action's real success **and** failure paths, with the failure reported
      rather than assumed
- [ ] narrow widths and 100/125/150/200% display scale, with nothing clipped —
      the copy that names the consequence is the copy most likely to overflow
- [ ] **every route to the operation** — button, shortcut, command palette,
      context menu, bulk action, automation — proven to pass through the gate

The last item is what makes the gate real. A gate on the button and an
unprotected path from the command palette is not a gate; it is a gate-shaped
delay in front of one of five doors.

## Suggested reading

- [notifications.md](notifications.md) — the non-blocking rule this is the deliberate exception to, and the undo that replaces the gate where an action is reversible
- [language-modes.md](language-modes.md) — the voice-not-facts rule, at the point where it matters most
- [accessibility.md](accessibility.md) — keyboard operation, focus return, and why reduced motion must not weaken a safety control
- [export-and-bulk-actions.md](export-and-bulk-actions.md) — the preview and count the gate must be computed from
- [version-history.md](version-history.md) — the undo that decides whether an action needs the gate at all
- [tabs.md](tabs.md) — bulk close, the most likely first destructive action to need it
- `ROADMAP.md` §4.3 — the tracked work item
