# Context menus: shortcuts and search

Every context-menu item that has a keyboard shortcut displays it, and the
shortcut displayed is the one that actually works in that context. Every context
menu carries its own search field.

**Status: partial source-level audit.** The 2026-08-06 audit fixed the context
menu's concrete clipping and dismissal defects: long bilingual labels wrap, and
Escape, outside click, scroll, Tab and item selection restore focus to the
originating control. The FileViewer menu inventory now has a field-owned,
plain-text-first search and anchored regex builder for every listed FileViewer
menu, with an explicit owner-local action registry, exact builder tokens, and
source-level keyboard and focus contracts. Simple action menus use a named
outer group plus a nested `role="menu"`; mixed Share/Export/Access/Publish
surfaces use a named dialog/group and preserve their listbox and tab widgets.
Registry-derived shortcut labels and all non-FileViewer context menus remain
open in `ROADMAP.md` §4.9. No installed build has been rendered for this audit.

## The requirement

### Show the shortcut

Every context-menu item that has a keyboard shortcut **displays it,
right-aligned beside the label, in the platform's own notation.**

The context menu is where users go to find out what an object can do. An item
whose shortcut is hidden there is a shortcut nobody learns, and the menu becomes
the only route to a command that has a faster one — which is a small tax charged
to every user of that command, forever.

### It must be the shortcut that actually works

The displayed shortcut is the one that **fires in that context**. Never one
inferred from a similar command, never one that only fires when a different
surface has focus, and never one that was true in an earlier version.

**Derive it from the same source that registers the binding**, so the two cannot
drift apart. A hard-coded label and a registered binding are two facts that must
agree, maintained in two places, which means they will eventually disagree — and
the disagreement is invisible until a user presses the key.

> [!IMPORTANT]
> **A wrong shortcut is worse than no shortcut.** No shortcut costs a user one
> extra menu trip. A wrong one trains them to press a key that does nothing, and
> they will press it several times before they stop believing the label. The
> product has taught them a false fact about itself.

### Announce it correctly

Expose it to assistive technology **as a shortcut**, not as decorative text, and
**do not announce the same keys twice** — an item whose accessible name already
ends in "Control S" and which also carries a shortcut property is read twice, and
the second reading sounds like a second shortcut.

An item with genuinely no shortcut **shows none**. Padding the column with a
placeholder is worse than an empty space: it implies a binding exists and could
not be displayed.

### Every context menu carries a search

Every context menu — tab, group, appearance, application and overflow — carries
its own **keyboard-accessible search field** that filters the visible menu items
locally.

Filtering **never changes the menu's action semantics**: an item that survives
the filter does exactly what it would have done unfiltered, in the same place in
the same hierarchy. The search narrows what is shown; it does not build a new
menu.

Like every other search surface, plain text is the default and the full pattern
builder is available from an adjacent affordance — see
[regex-builder.md](regex-builder.md).

### FileViewer menu inventory

The source guard keeps this list hand-written so a menu that disappears cannot
also disappear from its own check:

| Menu | Source identifier | Focus return |
| --- | --- | --- |
| Live artifact Present | `live-artifact-present-menu` | Actual Present trigger |
| Live artifact Zoom | `live-artifact-zoom-menu` | Actual Zoom trigger |
| Version header Download | `file-version-head-download-menu` | Active version header trigger |
| Version footer Download | `file-version-footer-download-menu` | Active version footer trigger |
| React component Share/Export | `react-component-share-menu` | Actual last Share or Export trigger |
| HTML viewer Zoom | `html-viewer-zoom-menu` | Actual Zoom trigger |
| HTML viewer toolbar More | `html-viewer-toolbar-more-menu` | More trigger |
| HTML viewer Present | `html-viewer-present-menu` | Actual Present trigger |
| HTML viewer Share/Export | `html-viewer-share-menu` | Actual last Share or Export trigger |
| Markdown Download | `markdown-download-menu` | Actual Download trigger, or explicit no-opener programmatic source |

Each row uses its own `RegexSearchField` controller and stable menu/field IDs.
Unmatched existing actions are hidden without replacing their handlers, so
disabled states, error copy and re-entry protection remain owned by the original
action code. The owner-local registry includes buttons, links and menu items,
records a label and section, and deliberately excludes nested listbox/tree/tab
widgets so their arrow, text and selection keys are not stolen by the outer
menu. The shared surface measures the actual opener, clamps to the viewport,
flips above when needed, and scrolls within the available height. All search,
toggle and action wrappers use a 48px minimum hit area. The source contract is
`apps/web/tests/components/FileViewer.menu-contract.test.ts`; it fails when any
inventory row, exact owner token, nested-widget exclusion, one-version-origin
boundary, geometry rule or primitive wiring is removed, and checks the
direct-label wrapping declarations.

## Why a menu needs a search

The objection is fair: a context menu is short, and a search field in a short
list is ceremony.

It holds for a five-item menu. It stops holding for the menus this product is
required to have. A tab context menu carries the full tab-management set plus
**Edit tab appearance…**; a group menu carries creation, naming, colouring,
reordering, collapsing, removal and its own appearance editor; an appearance
editor's own menus carry a font list and a colour palette. These are not five
items, and the ones that grow do so because the standards above require them to.

The search also does something the length argument misses: it makes a menu
**keyboard-navigable by name** rather than by position. Arrowing to the eleventh
item is a worse interaction than typing three letters, even when eleven items fit
on screen.

## Current implementation status

| Requirement | Status |
| --- | --- |
| Shortcut displayed on items that have one | **Designed.** The mockup's items carry shortcut attributes and right-aligned monospace labels. Not built. |
| Shortcut derived from the binding registry | **Not started, and not designed.** The mockup's labels are static text — which is correct for a design file and is exactly the pattern that must not be ported. |
| Correct in that context | **Unverifiable today.** There is no binding registry to check a label against. |
| Announced as a shortcut, not duplicated | **Not started.** |
| No placeholder for items without one | **Designed correctly** — the mockup shows a blank rather than a dash. |
| A search field in every context menu | **Partial.** The ten FileViewer menus have independent local fields and builders at source level; the broader context-menu inventory remains open. |
| Search preserving action semantics | **Partial at source level.** The owner-local registry hides unmatched actions without replacing handlers or disabled/destructive semantics; mixed nested widgets remain outside the registry. |
| Search wired to the pattern builder | **Partial at source level.** Each inventoried FileViewer field has its own anchored builder and exact owner token; the broader context-menu inventory remains open. |
| Long labels visible and focus restored after dismissal | **Partial.** Context-menu labels wrap and the opener regains focus in the audited file-menu path; the full menu inventory remains unverified. |

> [!WARNING]
> **The porting hazard here is specific.** A design file's shortcut labels are
> necessarily hard-coded strings, and they look exactly like the finished
> product. An implementation that copies them ships a menu whose labels are
> correct on the day it is written and drift from that day onward, with nothing
> to detect the drift. The label must be read from the binding, not transcribed
> from the design.

## Configuration

| Setting | Default | Effect |
| --- | --- | --- |
| Shortcut notation | The host platform's convention | Not a user preference. A shortcut shown in the wrong platform's notation is a shortcut the user has to translate. |
| Menu search | Always present | Not optional per menu. A menu small enough not to need it still gets it, so the interaction is the same everywhere. |
| Search mode | Plain text | Regex is an explicit opt-in, as on every search surface. |

Where a user can rebind a shortcut, the label follows the rebinding
automatically — which is the same requirement as deriving it from the registry,
observed from the other end.

## Failure modes

| Failure | Consequence |
| --- | --- |
| A displayed shortcut that does not work in that context | Trains the user to press a key that does nothing. Worse than showing none. |
| A hard-coded label beside a registered binding | Two facts in two places. They will disagree, and nothing detects it. |
| A shortcut inferred from a similar command | Correct-looking and wrong, which is the hardest kind to notice. |
| A shortcut that only fires with a different surface focused | The label is true somewhere else, which the user has no way to know. |
| A placeholder in the shortcut column | Implies a binding exists and could not be shown. |
| The shortcut exposed as decorative text | Assistive technology reads it as part of the label, or not at all. |
| The same keys announced twice | Sounds like two shortcuts. |
| The wrong platform's notation | The user translates every label. |
| A menu search that reorders or flattens items | Changes the action semantics. An item must mean the same thing filtered and unfiltered. |
| A menu search that is mouse-only | The one input mode a menu search most helps is the one that cannot reach it. |
| A search field that swallows the menu's own type-ahead | Two competing keyboard behaviours in one surface. Decide which owns the keystroke and be consistent. |

## Security considerations

- **A menu item's label can contain user content** — a document name, an account
  name, a project title. It renders on top of everything, and context menus are
  frequently open during a screen share. Prefer naming the action and the type
  over interpolating the content where the content is sensitive.
- **The search query is local and stays local.** It filters items already
  rendered; it must not query anything, and it must not be logged.
- **Filtering must not become authorization.** An item hidden by a search filter
  is hidden, not disabled. Any item that a user must not be able to invoke is
  refused in the handler, exactly as with a disabled control — see
  [accessibility.md](accessibility.md).
- **A destructive item reachable from a context menu is a route like any other**,
  and routes through the gate in
  [super-confirmation.md](super-confirmation.md). Its shortcut is a route too.

## Verification

**No runtime menu matrix has been verified.** The FileViewer inventory and
primitive have focused source contracts, but no menu has been rendered from an
installed build in this repository. Registry-derived shortcuts and the broader
context-menu inventory remain open.

Conformance requires all of:

- [ ] every context-menu item with a binding displaying it, enumerated from the
      binding registry rather than by inspecting menus
- [ ] **every displayed shortcut fired in that context and observed to perform
      that item's action** — the check that makes the rest meaningful
- [ ] the label proven to come from the registry, by rebinding a shortcut and
      seeing the menu change without a second edit
- [ ] items with no binding showing nothing, with no placeholder
- [ ] a screen-reader pass confirming the shortcut is announced once, as a
      shortcut
- [ ] platform notation correct on every supported operating system
- [ ] a search field present in every context menu — tab, group, appearance,
      application, overflow — reachable and operable by keyboard
- [x] the ten FileViewer menus listed above use independent local search state,
      an anchored regex builder, localized count/no-match status, exact owner
      tokens, a nested-widget-safe action registry, measured placement and
      trigger focus restoration at source level; installed-build proof remains
      open
- [ ] filtering preserving action semantics, hierarchy and ordering in the
      built artifact
- [x] the inventoried FileViewer search offers plain text by default and the
      full builder on opt-in at source level; the broader inventory remains open
- [ ] the menu usable with the search field present and empty, so the search
      never becomes a step the user has to pass through
- [ ] menus checked at the narrowest supported width, at every display scale and
      in bilingual mode, where the label and the shortcut column compete for
      width

The rebinding test is the one that decides whether this standard is met or
merely appears to be. Every other item can pass with hard-coded labels on the day
they are written.

## Suggested reading

- [overlays.md](overlays.md) — the surface, bounding and scrolling rules a menu must obey
- [regex-builder.md](regex-builder.md) — the builder each menu search is wired to
- [appearance-customization.md](appearance-customization.md) — **Edit appearance…**, the item that makes these menus long
- [tabs.md](tabs.md) — the tab and group menus with the largest item sets
- [accessibility.md](accessibility.md) — announcement, keyboard reachability, and the rule that hiding is not refusing
- `ROADMAP.md` §4.9 — the tracked work item covering both halves of this file
