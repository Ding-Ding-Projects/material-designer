# Super confirmation for destructive actions

**Standard 7.** Every destructive action passes a gate that cannot be crossed by
an input the user did not intend: two independently operated keys, then a
full-range slider, with an always-available emergency exit.

> [!WARNING]
> **Status: the boundary covers every irreversible delete, and every web
> affordance that reaches one now goes through the gate. What the token proves
> is still narrower than what this document asks for.**
>
> The gate exists — `apps/web/src/components/destructive/` carries the
> two-key-plus-slider machine, its dialog, and an emergency exit — and it is
> rendered from the designs tab and the privacy section.
>
> What changed: the deletes that local version history genuinely cannot undo
> are enforced in the daemon's own handler. Each `DELETE` is refused without a
> single-use confirmation token minted for that exact resource at
> `POST <resource>/confirm-delete` and sent back in the `x-od-confirm-token`
> header. See `apps/daemon/src/http/confirm-delete.ts` and
> `packages/contracts/src/api/destructive-confirmation.ts`. That is the
> authorization boundary this document's security section asks for, and it
> holds for callers no interface can see: `curl`, a third-party client, a
> script.
>
> **The gated resources, and the one question that decides membership** — not
> "is it a `DELETE`", but "can local version history bring it back?"
>
> | Resource | Route | Why history cannot restore it |
> | --- | --- | --- |
> | project | `DELETE /api/projects/:id` | `projects/` is excluded from every history domain; the delete also cancels in-flight runs and removes the directory |
> | brand | `DELETE /api/brands/:id` | removes the brand tree and the design system it registered; installed-extension trees are excluded from history |
> | library asset | `DELETE /api/library/assets/:id` | unlinks the library's content-addressed bytes; `LIBRARY_DIR` is in no domain |
> | project folder | `DELETE /api/projects/:id/folders` | a recursive `rm` of a subtree that writes **no** revision — unlike the single-file delete beside it, which tombstones the file's version manifest and stays restorable |
> | design system (user-authored) | `DELETE /api/design-systems/:id`, `user:` ids only | `design-systems/` is a named absence in `history/domains.ts`; the whole directory goes |
>
> The design-system row is the one that needs reading twice. The same URL also
> serves the **marketplace uninstall** for non-`user:` ids, answered earlier by
> `apps/daemon/src/routes/static-resource.ts`, and that one is **not** gated:
> it removes a checkout `POST /api/design-systems/install` fetches again from
> its source, so gating it would spend the gate's meaning on a one-click undo.
> The project-folder token is bound to the (project, folder) pair rather than to
> the project, because the folder travels in the request body — a grant to
> remove `drafts/` must not remove `final/`.
>
> **Interface routing is now complete on the web side.** Every affordance that
> reaches a gated operation renders `DestructiveGate`: the designs tab (single,
> kanban and bulk), the recent-projects strip on Home, the design-system project
> menu, the brand card, the design-systems manager, and the library's card,
> bulk and preview-modal deletes. The strip was the last plain one-button
> confirm, and it mattered because it and the designs tab call the same handler
> — so the route a user happened to take decided how much stood between them and
> the same irreversible deletion.
>
> What the token still does **not** prove is that a human moved a slider: the
> web app mints it at the moment of authorization and spends it immediately.
> What it buys is that no caller reaches the operation in one replayable
> request, and that every route converges on one enforcement point.
>
> **`od library rm` is mid-deprecation.** Every other destructive `od` verb
> refuses without `--confirm`; that one shipped without the flag, so requiring
> it today would break existing scripts at exit code 2 — which reads as "you
> typed it wrong", not "the contract moved". Phase one ships the flag as
> accepted-and-optional plus a stderr notice naming the exact command that will
> keep working. The daemon's token still covers the operation meanwhile; what is
> missing is only the local refusal that fires before any HTTP request.
>
> **Deliberately not gated, with reasons.** Deletes whose records are captured
> by local version history (`apps/daemon/src/history/domains.ts`) are
> restorable, and this document says to prefer an undo notification for those:
> memory entries, project files, project templates, automations, BYOK profiles,
> connector accounts and MCP servers all fall there — as does the marketplace
> uninstall above, which is reversible by re-installing rather than by history.
> Gating a restorable delete adds ceremony without safety and dilutes the signal
> that the gate means *irreversible*.
>
> An absent gate is honestly absent; a gate that guards two doors of a dozen
> reads as protection the product does not have. This section said "not started,
> and not designed" for some time after the gate shipped, which is how a
> reviewer comes to believe a defended surface is undefended and vice versa.

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

Read this table as of 2026-08-29. "Built" means the code exists and a surface
mounts it; it does not mean the complete built-artifact drive has been performed.

| Requirement | Status |
| --- | --- |
| The gate itself | **Built as a reusable surface.** `destructive/DestructiveGate.tsx` with its state machine in `gateMachine.ts`; `AuthorizedDestructiveGate.tsx` composes it with the handler token exchange. Route mounting remains a C0 handoff for the owning component lanes. |
| Exact action and affected data named | **Built.** The gate names the target rather than asking whether the user is sure. |
| Two independent key controls | **Built.** Both must be engaged before the slider unlocks. |
| Full-range slider gated on both keys | **Built.** `gateMachine.ts` rations forward movement per input event, so a click at the far end or one `End` press cannot skip the deliberate travel. |
| Progress and completion animations | **Built.** |
| Emergency exit and platform cancellation path | **Built.** An audit found Escape and the exit reporting `cancelled` for an action that had already begun. Tracked in § 4.0. |
| Focus return to the originating control | **Built in the reusable gate.** The gate restores focus when the origin remains connected. Every owning route still needs its C0 handoff and built-artifact proof. |
| Enforcement at the operation rather than the button | **Met for every irreversible delete.** `DELETE /api/projects/:id`, `/api/brands/:id`, `/api/library/assets/:id`, `/api/projects/:id/folders` and `/api/design-systems/:id` (`user:` ids only) are refused in the handler without a single-use, resource-bound, short-lived confirmation token (428 `CONFIRMATION_REQUIRED`). The web app, the `od` CLI and the MCP `delete_project` tool all complete the handshake. Restorable deletes — including the marketplace design-system uninstall on that same URL — are deliberately ungated; see the status note above. Nothing yet enforces *two keys and a slider* at the operation; the token proves a deliberate two-step exchange against a named resource, not that a human moved a slider. |
| Destructive actions that will need it | **Inventoried.** `scripts/destructive-action-inventory.tsv` names every route and marks the owning component C0 handoff as the remaining integration boundary. |

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

**The gate exists; none of the list below has been observed passing.** Its unit
suite covers the state machine, and no capture, keyboard walk-through or
assistive-technology check has been performed on the rendered gate. Treat every
unticked box as genuinely unknown rather than merely unrecorded.

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
