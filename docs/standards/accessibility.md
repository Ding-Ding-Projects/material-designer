# Accessibility and sizing

**Status: partial, source-level audit only.** The design mockup states the intent,
and the final Figma import repair is committed at [`81ca738`](https://github.com/Ding-Ding-Projects/material-designer/commit/81ca73826312e1c599e52ff8be943620ee1ec04f).
The modal now closes before host focus work, keeps rejected Home URL handoffs
open for retry, scopes `aria-invalid` and `aria-describedby` to the visible
invalid URL or dropzone, clears a stale file after an invalid drop, rejects
arbitrary URL suffixes while accepting query/hash forms, and localizes every
visible Figma label and summary. The catalog keeps the English fallback, uses
`zh-TW` as the Traditional Chinese seed and adds deliberate `zh-HK` overrides.
The modal body scrolls; context-menu labels wrap instead of disappearing and
dismissal restores the opener's focus; the updater dialog traps focus, restores
it on every close path and disables progress transitions for reduced motion; and
the design-system Back control has an explicit localized name. Focused source
tests are committed, but no installed build has yet been rendered through the
full scale, narrow-width and language matrix, so runtime conformance remains
unverified.

## The requirement

**Accessibility defects are completion blockers, not polish.** A task that
introduces one is not finished. A task that encounters one fixes it, whether or
not the defect is in scope — encountering it is what puts it in scope.

### What must hold on every surface

| Area | Requirement |
| --- | --- |
| **Keyboard reachability** | Every interactive element reachable and operable by keyboard alone. No mouse-only affordance anywhere. |
| **Visible focus** | A visible focus indicator on every focusable element, at sufficient contrast against its own background. |
| **Roles, names, states** | Correct roles, accessible names, and current states per the platform's norms. Icon-only controls carry a name. |
| **Contrast** | Text at 4.5:1 minimum; interface boundaries and meaningful graphics at 3:1. |
| **Reduced motion** | Respected. Animation reduces to a state change; it never removes function. |
| **Structure** | Screen-reader-sensible document structure — headings, landmarks, list semantics, and live regions where content updates. |

### No clipping, at any supported configuration

**No clipped, truncated, overlapping or off-screen text or controls** at any
supported window size, display scale, density, or language mode.

The matrix to check, every time:

- The narrowest supported width
- 100%, 125%, 150% and 200% display scale
- Every density step
- **The longest localized strings — bilingual mode especially**

Bilingual mode is named explicitly because it produces the longest strings in the
product. A layout that holds in English and breaks in bilingual is a layout that
was tested in the easiest case. See [language-modes.md](language-modes.md).

### Sizing

Controls sized to their design specification and consistent with their siblings.
Adequate click and touch targets. No mis-sized icons, fields or buttons. Layouts
that hold at every supported scale.

**When a screenshot or capture shows a sizing, clipping or accessibility defect,
fixing it joins the task's scope.** This is the rule that stops such defects
accumulating: the moment one is visible in evidence, it is a known defect.

### Decorative-looking interface must be functional

Any icon, preview, mock window, toolbar control, card, tab, badge, illustration
or affordance presented as if it can be used **must** perform its labelled
action, expose an accessible equivalent, persist state where applicable, and be
covered by an interaction test.

An element that is intentionally illustrative and cannot be operated is **labelled
plainly as a static preview** and is not styled like a live control.

Verify tiny affordances — window controls, overflow buttons, menu items, close
and reset actions, status indicators, decorative navigation — at the same time as
the primary flow. **Visual resemblance is never evidence of working behaviour.**

### No fake placeholders

Do not ship fake default placeholders where a real value or empty state is
required. Use explicit empty-state copy and a real creation or edit path. A
placeholder-looking document, control or feature must either work or be labelled
as a static preview.

Releases are real applications, not demonstration shells: no seeded fake sample
documents, no mock-only workflows, no demonstration startup content. Start with
truthful empty states and real create and open paths.

## Related interface-quality rules

These sit in the same family and are checked at the same time.

**Overlays paint their own surface.** Every popover, menu, dropdown, tooltip and
anchored panel paints its own background, border, elevation and shape. A
transparent overlay lets whatever is behind it read through the text on top — the
fastest way to make a well-built dialog look broken. An overlay is **bounded by
the viewport and scrolls when it does not fit**: capping height and hiding
overflow deletes the content past the cap with no scrollbar to indicate anything
is missing. Overlays never paint outside their own card, never sit under the
surface that opened them, and never cover the control they are anchored to.

**Context menus show their keyboard shortcuts.** Every context-menu item that has
a shortcut displays it, right-aligned, in the platform's notation. The displayed
shortcut is the one that **actually works in that context** — never one inferred
from a similar command, one that only fires when a different surface has focus,
or one that was true in an earlier version. Derive it from the same source that
registers the binding so the two cannot drift. Expose it to assistive technology
as a shortcut, not as decorative text, and do not announce the same keys twice.
An item with no shortcut shows none; a placeholder is worse than a blank.

**Long operations report progress where they were started.** A dialog that starts
a long operation shows that operation's real progress inside the dialog, not a
bare spinner — a spinner is indistinguishable from a hang. The submitting control
is disabled for the duration **and** the handler refuses re-entry: a disabled
button is the visible guard, not the real one, because a keyboard submit walks
straight past it. Where an operation includes a slow optional phase, let the user
decline it and say plainly what declining leaves undone.

**Filters and statistics stay out of the way.** Search bars, filter rows and
statistics panels are collapsible, and the ones that only describe a collection
rather than change it start collapsed. The collapsed state persists, is
keyboard-operable with a visible focus ring, is announced with its expanded
state, and **never hides a currently-active filter without saying so** — a
collapsed row silently excluding results is how a user comes to believe data is
missing.

## Current implementation status

| Requirement | Status |
| --- | --- |
| Keyboard reachability audit | **Partial source-level audit.** The updater dialog, context-menu dismissal path and design-system Back control now have focused keyboard/name coverage; the full surface audit is open. |
| Visible focus on every element | **Partial.** The updater dialog traps focus and returns it on close; the full focus matrix is not verified. |
| Roles, names, states | **Partial.** Figma URL/notes fields now use explicit native `label`/`for` associations, localized upload copy, and assertive invalid-state associations; the design-system Back control has an explicit name; the full inventory remains open. |
| Contrast measured | **Not started.** The mockup **states** text is checked at 4.5:1 and boundaries at 3:1. That is a claim in a design file, not a measurement. |
| Reduced motion | **Partial.** The updater dialog removes progress transitions under `prefers-reduced-motion`; the full application motion inventory remains open. |
| No clipping across the matrix | **Partial source-level audit.** Figma modal content scrolls and context-menu labels wrap; no installed build has been measured. |
| 48×48 minimum targets | **Stated in the mockup** and applied to its header icon buttons and navigation rows. Not verified anywhere. |
| Large-hit-target option raising targets to 56px | Designed as a switch. |
| Decorative-looking interface functional | **Unknown.** The mockup is a design file, so by definition its controls are illustrative. |
| Overlays painting their own surface and scrolling when bounded | **Partial source-level audit.** The Figma modal body now scrolls inside its card; the full overlay inventory remains open. |
| Context menus showing shortcuts | **Partial.** Long labels wrap and dismissal restores focus in the audited menu path; shortcut/search completeness remains open. |
| Long operations reporting progress | **Designed.** The clone panel shows per-item progress, phase text, a disabled submit control with a distinct label, and an optional slow phase that names what declining costs. |
| Filters collapsible and stating active state | **Designed.** A filters-and-statistics disclosure with expansion state and a summary naming the active filter. |

## Implementation notes

### The matrix is the deliverable

"Accessible" is not a state a build is in; it is a set of configurations it has
been checked at. The check is the matrix above — narrow width × four display
scales × three densities × three language modes — and it has to be re-run when
layout changes, not once at the end.

Automate what can be automated. Contrast ratios, missing accessible names,
duplicate identifiers, focus-order anomalies and missing roles are all
machine-checkable, and a machine check that runs on every build catches
regressions that a manual pass at the end never will.

What cannot be automated: whether the focus order makes sense, whether an
accessible name describes the thing it names, and whether a live region announces
at a useful moment. Those need a person with a screen reader.

### Measure contrast against what is actually behind it

A token pair that passes on paper can fail in place — over a tonal cover, a
gradient, an image, a hover state, or a translucent overlay. Check the composited
result, especially for text on the surface roles used for covers and for the
inverse-surface roles used by notifications.

### Reduced motion reduces animation, never function

An animation becomes an immediate state change. A morph becomes a swap. What must
never happen: an interaction becoming unavailable, a confirmation gate being
shortened, or a progress indicator disappearing because it was implemented as an
animation. See [notifications.md](notifications.md).

### The 48px minimum is a floor, not a target

The mockup's stated 48×48 minimum exceeds the usual guidance, and the large-hit-
target option raises it further to 56px. Both are good. What matters at
implementation time is that the *hit area* meets it — a 24px icon inside a 48px
button satisfies the rule; a 24px icon with a 24px hit area does not, however it
looks.

## Failure modes

| Failure | Consequence |
| --- | --- |
| A control reachable only by mouse | Unusable by keyboard and by assistive technology. A completion blocker. |
| Focus indicator removed for appearance | The keyboard user cannot tell where they are. |
| An icon-only button with no accessible name | Announced as "button", which is no name at all. |
| Contrast checked against the token instead of the composite | Passes in the palette, fails on screen. |
| Reduced motion removing a control or shortening a gate | An accessibility preference weakening a safety control. |
| Layout checked only in English at 100% | The clipping appears in bilingual at 150%, which is a configuration real users run. |
| A decorative control styled like a live one | The user clicks it and nothing happens; they conclude the product is broken. |
| A transparent overlay | Content behind reads through the text. Looks like a rendering bug. |
| An overlay capped in height with overflow hidden | Content past the cap is deleted with no indication — a calendar loses its last week, a menu loses its last items. |
| A displayed shortcut that does not work in that context | Trains the user to press a key that does nothing. Worse than showing none. |
| A bare spinner for a long operation | Indistinguishable from a hang; users kill the application. |
| A disabled button as the only re-entry guard | A keyboard submit walks past it and the operation runs twice. |
| A collapsed filter row silently excluding results | The user believes their data is missing. |
| A fake placeholder document shipped as a real one | The user edits it and loses the work, or reports it as a defect. |

## Security considerations

- **Reduced motion and other accessibility preferences must never weaken a safety
  control.** The confirmation gate keeps both keys and the full slider under
  every preference. Reducing animation is not reducing the requirement.
- **Accessible names are read aloud.** A name generated from user content can
  disclose a project name, a file path or a client name to anyone within earshot.
  Name the control, not its contents, where the contents are sensitive.
- **A disabled control is a hint, not an authorisation boundary.** Enforce
  refusal in the handler. This matters most for the operations that are expensive
  or irreversible, where a double submit is a real cost.
- **Screenshots taken as accessibility evidence are still screenshots.** They
  capture whatever is on screen — paths, project names, tokens in a status bar.
  Check before attaching one to anything public.

## Verification

**No runtime matrix has been verified.** The source-level fixes have focused
tests, but no installed build has rendered the full scale, narrow-width,
display-density and language matrix. The Figma focus handoff, URL retry,
visible-control error targeting, invalid-file reset, anchored URL forms,
localized catalog coverage and callback ordering are covered by
`design/apps/web/tests/components/FigmaImportModal.a11y.test.tsx`;
the CI command is
`pnpm --filter @open-design/web exec vitest run tests/components/FigmaImportModal.a11y.test.tsx`.
That command was not run locally. Builds, CI runs, captures and the claims in
the mockup about contrast and target sizes remain unverified design intent, not
results.

Conformance requires all of:

- [ ] a keyboard-only pass over every surface, reaching and operating every control
- [ ] a visible focus indicator on every focusable element, contrast-checked
      against its own background
- [ ] an automated audit on every build reporting zero violations for missing
      names, missing roles, contrast failures and duplicate identifiers
- [ ] contrast measured on **composited** output, including text over tonal
      covers, gradients, hover states and translucent surfaces
- [ ] a screen-reader pass confirming structure, names, states and live-region
      announcements make sense — not merely that they exist
- [ ] the full matrix rendered with no clipping: narrowest supported width ×
      100/125/150/200% scale × every density × all three language modes
- [ ] every interactive target measured at 48×48 minimum by **hit area**, and at
      56px with the large-target option on
- [ ] reduced motion honoured on every animated surface, with no loss of function
- [ ] every decorative-looking element either operating its labelled action with
      an interaction test, or plainly labelled a static preview
- [ ] every overlay painting its own surface and scrolling within the viewport,
      checked at the narrowest width and highest scale
- [ ] every context-menu shortcut verified to fire in that context, derived from
      the binding registry rather than hard-coded
- [ ] every long operation reporting real progress, with its submit control
      disabled **and** its handler refusing re-entry — the latter tested by
      keyboard submit
- [ ] every collapsible filter row persisting its state, announcing it, and
      naming any active filter while collapsed
- [ ] no fake placeholder content anywhere in a shipped build

Capture evidence from the real built artifact, at the specific surface, framed on
the thing being demonstrated. A whole-window screenshot in which the relevant
detail occupies a few pixels does not demonstrate anything.

## Suggested reading

- [language-modes.md](language-modes.md) — bilingual mode, the layout case that breaks first
- [material-design-3.md](material-design-3.md) — the scale, density and contrast systems
- [notifications.md](notifications.md) — announcement, focus return, and the gate that reduced motion must not weaken
- [tabs.md](tabs.md) — roving focus and the width and scale matrix applied to the strip
