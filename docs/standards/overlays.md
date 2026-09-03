# Overlays paint their own surface

## 2026-08-30 modal interaction repair

Full-screen modal backdrops retain the uncovered 56px desktop drag band, while
their direct child panels now paint above that band and remain interactive.
Shared modal backdrops use the established 1700 tier, the command palette uses
1800, and packaged close controls opt out of desktop dragging. The shared
Dialog backdrop also closes only when the pointer press started and ended on
the backdrop, so selecting text out of a dialog cannot destroy its contents.
Focused source and component checks pass; packaged geometry remains pending.

## 2026-08-29 source integration status

Groups B through D now make the reviewed overlay surfaces explicit in source. Shell
chrome offsets are derived from shared viewport and title/status-bar tokens,
radial and palette hit surfaces stop below the title bar, and reduced-motion
rules cover the scrim and menu transitions. Message, notification, handoff,
drawer, mention, theater, and tools surfaces retain bounded inner scrolling.
Focused checks use brace-aware and exact selector boundaries, so a descendant
rule or renamed class cannot satisfy the contract accidentally. The parser also
retains at-rule ancestry: desktop viewport budgets and responsive `auto` or
`none` overrides are inspected in their own cascade contexts instead of being
flattened into false duplicate declarations. The focused title, status, shell,
and overlay run passes 60 of 60 assertions.

This is not runtime evidence. No built application, installed package,
screenshot, rendered geometry measurement, display-scale matrix, or bilingual
matrix was exercised. Overlay placement, focus return, and viewport behavior
remain open until the built application is driven and observed.

Every popover, menu, dropdown, tooltip and anchored panel draws its own
background, border, elevation and shape; is bounded by the viewport; and scrolls
inside that bound rather than hiding what does not fit.

**Status: partial, source-level audit only.** The final Figma import repair is
committed at [`a5a9365`](https://github.com/Ding-Ding-Projects/material-designer/commit/a5a9365b141bb7d31a08c0a8f08c2e61bbc2aefe),
with the residual drop/input repair at [`8b76513`](https://github.com/Ding-Ding-Projects/material-designer/commit/8b7651350daa8b3fdcda3dc9c74e44d7a8d880dd).
The modal body now scrolls inside its bounded card, closes before the host focus
callback runs, keeps rejected URL handoffs open for retry, and announces errors
while associating them with the invalid URL input or the native file input behind
the visible labelled dropzone; a file dropped on the URL tab first switches to
that visible file panel. Context-menu labels wrap instead of being clipped and
focus returns to the originating control after dismissal. No installed build has
yet been rendered and measured
at the full scale, narrow-width and language matrix; no build, CI or capture
success is claimed by this source-level update.

The native-input focus contract was corrected in [`cbdc4f5`](https://github.com/Ding-Ding-Projects/material-designer/commit/cbdc4f5ae673b7387445ad8e2fc0ba49dcdacb4e); its source test now traverses the complete modal keyboard order in both directions, including `figma-import-file`. [`ac3ba56`](https://github.com/Ding-Ding-Projects/material-designer/commit/ac3ba56) also requires the real handler to prevent the default event at both wrap edges, without claiming runtime rendering.

## The requirement

### Paint the surface

**Every overlay paints its own background, border, elevation and shape.** Where
the framework makes decoration optional, the project's default is decorated, and
an undecorated overlay must supply its own surface explicitly.

An overlay that renders transparent lets whatever sits behind it read straight
through the text on top. It is the fastest way to make a well-built dialog look
broken, and it looks like a rendering bug rather than a missing style, so it gets
reported as one.

### Be bounded, and scroll

**An overlay is bounded by the viewport and scrolls when it does not fit.**

Capping its height and then hiding the overflow **deletes** the content past the
cap, with no scrollbar to indicate anything is missing: a calendar loses its last
week, a menu loses its last items, a font list loses every family after the
first screenful. The user has no way to know, because the overlay looks
complete — a clean bottom edge is exactly what a finished list looks like.

Bound the height to the space actually available, and let the content scroll
inside that bound.

### Stay where they belong

- **Never paint outside their own card.** A shadow, a caret or a sub-menu that
  escapes the surface reads as a rendering artifact.
- **Never sit under the surface that opened them.** An overlay behind its own
  trigger is invisible and looks like a control that does nothing.
- **Never cover the control they are anchored to.** The anchor is context; hiding
  it makes the user prove to themselves what the overlay belongs to.

### Validate where they break

At the narrowest supported width, at every supported display scale, and with the
longest localized strings — **an overlay that just fits in English will not fit
in bilingual mode.** See [accessibility.md](accessibility.md) for the full
matrix and [language-modes.md](language-modes.md) for why bilingual is the case
that breaks first.

## Why this needs stating at all

It reads like something nobody would get wrong. It is one of the most common
defects in a modern interface, for three specific reasons worth naming so they
can be watched for.

**Platform overlay primitives increasingly ship undecorated.** A native popover
or top-layer element gives you positioning, dismissal and stacking, and
deliberately no appearance. That is a good default for a primitive and a bad
default for a product: the first component built on it looks fine because it
happens to sit over a solid background, and the second one — over a card, an
image or a scrolled list — reads straight through.

**A height cap is a reasonable-looking fix for a real problem.** An overlay that
grows past the bottom of the window is a genuine bug, and capping the height
appears to solve it. The overflow rule is the difference between solving it and
hiding it, and the hidden version passes every visual review because nothing
looks wrong.

**Stacking contexts are created accidentally.** A transform, a filter, an opacity
value or a containment property on an ancestor traps a child overlay inside it,
regardless of how high its stacking order is. The overlay then renders behind
the surface that opened it, and the fix is never in the overlay's own styles —
which is why this failure survives so long.

## Where overlays appear in this product

Every one of these is subject to the rules above, individually:

| Overlay | Owned by |
| --- | --- |
| The pattern builder anchored beside a search field | [regex-builder.md](regex-builder.md) |
| Context menus on tabs, groups, items and the application | [context-menu-shortcuts.md](context-menu-shortcuts.md) |
| The per-element **Edit appearance…** editor | [appearance-customization.md](appearance-customization.md) |
| The colour picker and its translator | [appearance-customization.md](appearance-customization.md) |
| The font family list | [appearance-customization.md](appearance-customization.md) |
| The tab overflow surface and the searchable tab list | [tabs.md](tabs.md) |
| The command palette in its bounded-card size | [command-palette.md](command-palette.md) |
| The changelog and history date calendars | [changelog-viewer.md](changelog-viewer.md), [version-history.md](version-history.md) |
| Notifications and the notification centre | [notifications.md](notifications.md) |
| The destructive-action gate, where it is anchored | [super-confirmation.md](super-confirmation.md) |

The font list and the calendars are the two where the height-cap failure is most
damaging: one is long by nature, and the other silently loses dates, which the
user will not notice until they cannot select one.

## Current implementation status

| Requirement | Status |
| --- | --- |
| Overlays painting their own surface | **Designed correctly.** Every overlay in the mockup carries an explicit background, border or shadow. Unaudited in code. |
| Bounded height with internal scrolling | **Partial.** The Figma import modal body now scrolls inside its bounded card; the rest of the overlay inventory is unaudited. |
| Not painting outside the card | **Not audited.** |
| Not rendering beneath the trigger | **Not audited.** No stacking-context audit has been run. |
| Not covering the anchor | **Not audited.** |
| Validated at narrow widths, every scale, longest strings | **Not started.** The source fixes have focused tests, but no installed build has been rendered and measured. |
| On the documentation site | **Not audited.** The site's own overlays — the builder popover, the palette, menus — have not been checked against this list. |

## Configuration

**This standard has no configuration.** It is a property every overlay has or
does not have.

Two product settings change the conditions it must hold under, and neither is a
setting for this rule:

| Setting | Why it matters here |
| --- | --- |
| Interface scale | A larger scale shrinks the available viewport in overlay-sized units, so an overlay that fits at 100% may need to scroll at 200%. |
| Language mode | Bilingual mode produces the longest strings, which is where an overlay's width and its text wrapping fail first. |

## Failure modes

| Failure | Consequence |
| --- | --- |
| A transparent overlay | Content behind reads through the text. Looks like a rendering bug and is reported as one. |
| A height cap with overflow hidden | Content past the cap is deleted with no indication. A calendar loses its last week; a menu loses its last items. |
| An overlay taller than the viewport | Its bottom, including any confirm action, is unreachable. |
| An overlay rendered behind its trigger | Looks like a control that does nothing. The cause is an ancestor's stacking context, not the overlay's own styles. |
| An overlay covering its anchor | The user cannot see what they are editing or filtering. |
| A shadow or sub-menu painting outside the card | Reads as an artifact. |
| An anchored overlay that detaches at a viewport edge | It must collide gracefully while staying visually attached. |
| Validated only in English at 100% | The clipping appears in bilingual at 150%, which is a configuration real users run. |
| A scrollable overlay with no visible scroll affordance | Indistinguishable from a truncated one. |
| An overlay that traps focus but cannot be dismissed by keyboard | A keyboard user is stuck. |

## Security considerations

- **Overlays render on top of everything, which makes them the surface most
  likely to appear in a screenshot.** Notifications, tooltips and menus are
  frequently on screen during a screen share. Never put a token, a key, a
  credential or a full private path in one.
- **An overlay must not be usable as a click-jacking surface within the
  product.** An overlay that covers its anchor while remaining transparent to
  input is a way for one control to be operated while the user believes they are
  operating another. Overlays capture their own input and paint their own
  surface, which prevents both halves of that.
- **A consent or confirmation surface must never be able to render off-screen or
  beneath something else.** If a gate can be scrolled out of view or hidden
  behind another surface, the action it guards can be reached with the guard
  invisible — see [super-confirmation.md](super-confirmation.md).

## Verification

**No runtime overlay matrix has been verified.** The Figma modal and context
menu changes have focused source tests, including the URL-tab drop routing and
native-input label/focus contract plus full focus-trap traversal, but no overlay has been rendered and measured
in an installed build from this repository. The focused tests are committed but
were not run locally; CI remains the verification boundary.

Conformance requires all of:

- [ ] **every** overlay enumerated from the component inventory, not spot-checked
- [ ] each one rendered over a light surface, a dark surface, a card, an image
      and a scrolled list, with no content reading through
- [ ] each one rendered with more content than fits, showing a scrollbar and
      reaching its last item
- [ ] the calendar reaching the last day of a long month, and the font list
      reaching its last family
- [ ] each one at the narrowest supported width and at 100/125/150/200% display
      scale
- [ ] each one in bilingual mode with the longest available strings
- [ ] a stacking audit: every overlay proven to render above its trigger,
      including inside ancestors that create a stacking context
- [ ] each anchored overlay colliding with all four viewport edges without
      detaching from its anchor and without covering it
- [ ] keyboard dismissal from every overlay, with focus returned to the trigger

The over-a-scrolled-list case and the more-content-than-fits case are the two to
automate. Both are cheap to render and both fail silently in review, because the
broken result looks like a finished one.

## Suggested reading

- [accessibility.md](accessibility.md) — the clipping matrix these are validated against, and the focus rules on dismissal
- [appearance-customization.md](appearance-customization.md) — the anchored editor with the strictest anchoring requirement in the product
- [context-menu-shortcuts.md](context-menu-shortcuts.md) — the overlay this rule is most often broken in
- [material-design-3.md](material-design-3.md) — the elevation, shape and surface roles an overlay paints itself with
- [language-modes.md](language-modes.md) — bilingual mode, where overlay width fails first
