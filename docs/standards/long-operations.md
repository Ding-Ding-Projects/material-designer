# Long operations report progress where they were started

A dialog that starts a long operation shows that operation's real progress inside
the dialog. The submitting control is disabled for the duration **and** the
handler refuses re-entry. Where the operation has a slow optional phase, the user
can decline it and is told what declining leaves undone.

**Status: designed, not built.** The mockup's clone panel specifies per-item
progress, phase text, a disabled submit control with a distinct label, and an
optional slow phase that names what declining costs. Nothing implements it.

The production Library route applies the same contract to refresh, targeted SSE
hydration, upload, and bulk deletion: each operation has a generation/abort
boundary, bounded concurrency, visible progress or per-item outcomes, and a
handler-side re-entry latch. A partial delete is not completion; failed ids stay
selected for retry and the confirmation surface stays in its failed state.

## The requirement

### Real progress, in the dialog

**Not a bare spinner.** A spinner is indistinguishable from a hang, and the
operations that most need reporting — fetching a large history, initialising
sub-projects, indexing, packaging — are exactly the ones slow enough for a user
to conclude the application has frozen and kill it.

Progress is reported **where the operation was started**. A user who pressed a
button in a dialog looks at that dialog; a progress indicator that appears
somewhere else, or only in a notification behind the dialog, is a progress
indicator they will not find.

What "real progress" means, in order of preference:

1. **Determinate progress** — a count of items done out of a known total.
2. **Phase text** — the named stage currently running, when the total is unknown.
3. **The current item** — what is being worked on right now.

A spinner alone qualifies as none of these. A spinner *with* phase text is fine:
the point is that the user can distinguish work from a hang.

### The submit control is disabled, and the handler refuses re-entry

Both. **A disabled button is the visible guard, not the real one**, because a
keyboard submit — the enter key in a focused field — walks straight past a
disabled button and calls the handler again.

The failure this prevents is a duplicated irreversible action: two clones into
the same directory, two purchases, two of whatever the dialog was for. The visual
guard tells the user not to; the handler guard is what stops them.

The disabled control should also **say what it is doing** rather than only
greying out — a submit button that reads its current phase is both the progress
indicator and the guard.

### Expensive optional work is a choice

Where an operation includes a slow optional phase, **let the user decline it**,
**show the choice only where it is relevant**, and **say plainly what declining
leaves undone.**

> [!IMPORTANT]
> **A choice that does not actually reach the operation is decoration.** A
> checkbox whose value is never read is worse than no checkbox: the user
> believes they declined the slow phase, waits for it anyway, and has been
> misled by their own interface. Wire it before you draw it.

### When it fails, offer the way out where the failure appeared

A long operation that fails does so in front of a user who is now looking at an
error and a dialog they cannot make progress in.

- **Offer the recovery route at the surface where the failure was discovered** —
  beside the control that failed, not in a menu elsewhere. Someone whose upload
  was rejected is looking at the upload button.
- **Where the failure is a refused credential or a missing permission, offer
  re-authentication directly.** Reporting "insufficient permission" and leaving
  the user to find the sign-in screen is a dead end at the exact moment they know
  what they want to do.
- **Where the product can hand the failure to a local coding agent**, the prompt
  it builds names the real situation — the actual target, the actual reference,
  the reported error — and **forbids by name the remedies that lose work**: never
  force-overwrite a remote, never rewrite or drop existing commits, never switch
  branches. Those are precisely the fixes that look fastest when an upload is
  rejected, and precisely the ones that destroy something.

## Why "where they were started" is the load-bearing phrase

Progress reporting is rarely absent; it is usually in the wrong place.

The common shape is a dialog that closes on submit and a notification that
reports progress behind it. That is defensible in the abstract and wrong in
practice for a dialog-initiated operation, because the user's mental model is
still the dialog: they filled in a form, they pressed the button, and they are
waiting for *that* to finish. A toast in a corner does not answer "did my form
work" — it answers a question they have not asked yet.

The second common shape is progress that exists but is not granular enough to
distinguish work from a stall. A single indeterminate bar for a ten-minute
operation tells the user nothing after the first ten seconds. Per-item counts and
phase text cost almost nothing and turn "it is frozen" into "it is on item 40 of
310".

## Where this applies in this product

| Operation | Why it is slow |
| --- | --- |
| Importing or cloning a project with a large history | Network, and the size of the history |
| Initialising sub-projects | Several network operations in sequence |
| Building or packaging | Compilation, native modules |
| Bulk actions over a large selection | Per-item work, see [export-and-bulk-actions.md](export-and-bulk-actions.md) |
| Archive export at a high compression level | Deliberately expensive, and the cost varies enormously by option |
| Indexing for search | Proportional to the corpus |

The archive case is the clearest example of the optional-phase rule: the
difference between compression levels is minutes, so the level is a choice that
must be offered with its cost stated — see
[export-and-bulk-actions.md](export-and-bulk-actions.md).

## Current implementation status

| Requirement | Status |
| --- | --- |
| Real progress inside the initiating dialog | **Designed.** The mockup's clone panel shows per-item progress and phase text. Not built. |
| Submit control disabled for the duration | **Designed** — with a distinct label rather than a plain greyed-out state, which is the better form. Not built. |
| Handler refusing re-entry | **Not designed.** It cannot be, in a design file — and that is precisely why it is the half most likely to be skipped. |
| A declinable slow phase | **Designed**, naming what declining costs. Not built. |
| The choice actually reaching the operation | **Unverifiable today.** No implementation exists. |
| Recovery offered at the failing surface | **Not started, and not designed.** |
| Direct re-authentication on a refused credential | **Not started, and not designed.** |
| Cancellation | **Not designed.** Where an operation can be cancelled safely, it should be — and the design does not say. |

## Configuration

| Setting | Default | Effect |
| --- | --- | --- |
| Optional slow phases | Enabled | Declining is an explicit choice, and the consequence is stated at the point of declining rather than in documentation. |
| Progress detail | Determinate where a total is known | Falls back to phase text, then to the current item. Never to a bare spinner. |
| Cancellation | Available wherever it is safe | Where an operation cannot be cancelled safely, the dialog says so **before** it starts, not after. |

## Failure modes

| Failure | Consequence |
| --- | --- |
| A bare spinner | Indistinguishable from a hang. Users kill the application, sometimes mid-write. |
| Progress reported somewhere other than the initiating surface | The user does not find it, and concludes nothing happened. |
| A disabled button as the only re-entry guard | A keyboard submit walks past it and the operation runs twice. |
| An indeterminate bar for a ten-minute operation | Tells the user nothing after ten seconds. |
| A dialog that closes on submit | Removes the surface the user is watching, mid-operation. |
| An optional-phase checkbox whose value is never read | The user believes they declined, waits anyway, and has been misled by their own interface. |
| The optional phase offered where it does not apply | The user declines something that was never going to run and mistrusts the next choice. |
| A failure reported with no route forward | The user is left on an error with the recovery in a menu they have not opened. |
| A permission failure with no re-authentication path | A dead end at the exact moment the user knows what they want. |
| A recovery prompt that permits history rewriting | The fastest-looking fix, and the one that destroys work. Forbid it by name. |
| No cancellation on a long, safe-to-cancel operation | The user's only exit is killing the process, which is the unsafe one. |
| Cancellation that leaves partial state unreported | The user does not know what did and did not happen. |

## Security considerations

- **A disabled control is a hint, not an authorization boundary.** Refusal
  belongs in the handler. This matters most for operations that are expensive or
  irreversible, where a double submit has a real cost — the same principle as
  [super-confirmation.md](super-confirmation.md), applied to accident rather than
  intent.
- **Progress text is rendered on screen and often in a shared window.** Item
  names, file paths and remote addresses all leak through a per-item progress
  line. Show enough to be useful; do not show full private paths or credentials
  embedded in a target address.
- **An error message quoted verbatim from a failing tool can contain a token.**
  Tool output is not automatically safe to display. Redact before rendering, and
  again before including it in any prompt or report.
- **A recovery prompt handed to an agent is an instruction with real
  privileges.** State the actual situation, forbid the destructive remedies by
  name, and never let the prompt be assembled from text an untrusted source
  controls.
- **Cancellation must leave a known state.** An operation cancelled halfway
  reports what completed. Silence after a cancel is indistinguishable from
  corruption.

## Verification

**Nothing has been verified.** No long operation has been observed running from a
build in this repository.

Conformance requires all of:

- [ ] every operation that can exceed a couple of seconds enumerated, and each
      one reporting progress in the surface that started it
- [ ] determinate progress wherever a total is knowable; phase text elsewhere;
      **no bare spinner anywhere**
- [ ] the submit control disabled for the duration, with its label naming the
      current phase
- [ ] **the handler refusing re-entry — tested by keyboard submit**, not by
      clicking the disabled button
- [ ] a declinable slow phase whose declined value demonstrably reaches the
      operation, proven by declining it and observing that the phase did not run
- [ ] the optional choice shown only where it applies
- [ ] a failure offering its recovery route at the failing surface
- [ ] a refused credential offering re-authentication directly
- [ ] any generated recovery prompt containing the real target, the real error,
      and explicit prohibitions on the work-losing remedies
- [ ] cancellation available where safe, reporting exactly what completed
- [ ] progress announced to assistive technology through a live region, at a
      useful cadence rather than on every tick

The keyboard re-entry test is the one to write first. It is the only item here
whose absence is invisible in every screenshot and every manual pass, and the
only one whose failure duplicates an irreversible action.

## Suggested reading

- [notifications.md](notifications.md) — progress notifications for operations *not* started in a dialog, and how they resolve
- [accessibility.md](accessibility.md) — live regions, focus, and why a disabled control is not a boundary
- [export-and-bulk-actions.md](export-and-bulk-actions.md) — bulk progress, cancellation and honest partial results
- [super-confirmation.md](super-confirmation.md) — single-use authorization, the deliberate counterpart to accidental re-entry
- [overlays.md](overlays.md) — keeping the dialog usable while it reports
