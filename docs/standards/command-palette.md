# Command palette

## 2026-08-30 application mount wiring

`AppInner` now owns the palette open state, consumes one-shot seeded open
requests, listens for the shared open event, registers `Ctrl+Shift+F` through
the shortcut registry even while typing, mounts the palette beside the tooltip
layer, reuses the settings persistence path, and clears the seed on close.
Focused application tests pass for both the event and shortcut entry points.

**Standard 8.** One discoverable shortcut opens a searchable list of every
command, every setting and every destination the product has — with settings
rendered as live controls in the list itself, and selecting a row teleporting the
user to where the thing actually lives.

**Status: implemented in the application and on the documentation site; full
conformance audit still pending.** The application mounts a command palette and
indexes its settings through `command-palette/settingsIndex.ts`. Its own search
now opens a full anchored regex builder with plain-text default, explicit regex
mode, flags, syntax feedback and bounded local matching. Escape closes the
palette from the dialog's size, scope, and inline-setting controls while the
nested regex builder retains first dismissal. Its single
discoverable desktop binding is `Ctrl+Shift+F` on Windows/Linux and `⇧⌘F` on
macOS, derived from `components/shortcuts/registry.ts` so the handler and every
visible or assistive-technology hint share one source of truth.

The palette passes its own `useRegexSearch` controller to the shared
`RegexSearchField`; it does not borrow the header field's query, pattern, flags
or mode. Its adjacent `.*` affordance keeps the palette's full 48px
keyboard/touch target while the shared host lets the input yield first at
narrow widths. `CommandPalette.test.tsx` carries both rendered cases and a
source-level contract guard for this wiring, while
`scripts/check-command-palette-regex.sh` repeats the dependency-free guard in
the fast Verify job. A future raw-input shortcut cannot quietly remove the
builder.

## The requirement

### One shortcut, everything behind it

A single discoverable shortcut opens the palette. It lists **every** command,
setting and destination. A feature that exists but cannot be reached from the
palette is a feature most users will never find, so absence from the palette is a
defect in the feature, not a gap in the palette.

### Every setting, in every settings surface

Not only top-level actions. Each tab of the application's preferences, every
per-project or per-document properties panel, every appearance and customization
editor. **A user who knows a setting's name must be able to type it and land on
it without knowing which tab it lives under.**

This is the requirement that makes the palette worth building. A palette of
commands is a keyboard shortcut menu; a palette that also indexes settings is the
answer to "where did they put that option", which is the question users actually
ask.

### Rows are controls, not labels

A row that *is* a setting renders that setting's live control inline — a switch
for a toggle, a text box for a value, a stepper for a number, a select for a
choice — and changing it there changes the setting, with the same persistence and
validation as the settings surface itself.

A row that is a destination says where it goes.

### Selecting a row teleports

The application opens the surface, reveals the exact control, and draws attention
to it briefly. **Landing a user on the right tab and leaving them to hunt does
not satisfy this**, and it is the most common way this feature is half-built: the
navigation is easy, the reveal is the work.

### Size is a user choice, persisted

At least a bounded card and a full-window view, defaulting to the **bounded
card**. A search box that swallows the entire window is overwhelming on an
ordinary display, and a full-screen surface a user lands in accidentally is worse
than one they opted into. The choice persists.

### And the usual obligations

The palette carries its own search wired to the full pattern builder
([regex-builder.md](regex-builder.md)), obeys the three language modes and both
tone sliders ([language-modes.md](language-modes.md)), and meets the
accessibility rules ([accessibility.md](accessibility.md)) — reachable and
operable by keyboard alone, with roles that announce it as a listbox of options
and a live count of matches.

## Why each rule is there

**Why must it index settings and not just commands?** Because settings are where
things get lost. Commands usually live in a menu with a name a user can scan for;
a setting lives inside a tab inside a dialog, and the only way to find it is to
already know where it is. The palette is the flat index over a tree that
necessarily has depth.

**Why live controls rather than just navigation?** Because for a toggle, the
navigation *is* the cost. Opening settings, finding the tab, finding the row and
flipping a switch is five interactions to change one boolean the user already
named correctly in the search box. Rendering the switch in the row makes it one.

**Why teleport as well, then?** Because inline is right for changing a value and
wrong for understanding one. A setting's meaning usually comes from the copy
around it and the settings it sits beside. The palette offers both: change it
here, or go see it in context.

**Why default to the bounded card?** A full-window palette obscures the
application entirely, so a user who opened it by mistake has lost their place and
has to work out how to get back. The bounded card leaves the surrounding context
visible, which is also what makes the teleport legible when it happens.

**Why does absence from the palette count as a defect?** Because a palette that
covers 90% of the product trains users to distrust it. The first two failed
searches are enough for someone to go back to hunting through menus, and then the
palette has cost effort and delivered nothing.

## Current implementation status

| Requirement | In the application | On the documentation site |
| --- | --- | --- |
| A single shortcut opening the palette | **Implemented** — `Ctrl+Shift+F` on Windows/Linux and `⇧⌘F` on macOS; the handler, header chip and setup copy use the shared registry. | **Implemented** — a labelled header button showing its shortcut, so the shortcut is discoverable rather than folklore. |
| Every command listed | **Implemented** — the application registry feeds the palette rows; full inventory proof remains open. | **Implemented** for the site's own command set. |
| Every setting in every settings surface listed | **Implemented** through the application settings index; the inventory still needs an exhaustive audit. | **Partial** — the site's settings groups are indexed; the enumeration has not been audited against the settings surface. |
| Rows rendering live controls inline | **Implemented** for the indexed setting controls; hosted and installed-build verification remains open. | **Implemented.** |
| Selecting a row teleporting to and revealing the control | **Implemented** through the reveal path; screen-reader and installed-build verification remains open. | **Implemented.** |
| Two persisted sizes, bounded card default | **Implemented** — bounded card is the default and the full-window choice persists. | **Not verified** against this checklist. |
| Own search wired to the pattern builder | **Implemented** — the palette owns an anchored builder with bounded local matching, an independent controller, a 48px affordance target and a source-level wiring guard; other application search fields remain separate work. | **Implemented** — the site's search surfaces share one builder implementation. |
| Language modes and tone levels | **Implemented** in the palette's source-level controls; exhaustive locale and tone coverage remains pending. | **Implemented** for the site's own copy. |

The application's status is **implemented**, not merely "designed" — the palette,
settings index, shortcut binding, live controls, persisted sizes and dialog-level
Escape handling exist in source. The site's status is read from its committed source at
`site/assets/js/ui.js`, which is what the published site serves; **no interactive
audit against the checklist below has been run on either surface.**

<details>
<summary><b>What the mockup specifies</b> — and why it meets the standard on paper</summary>

Toggled with a single shortcut, dismissed with the escape key, which also clears
the context menu and any open calendar.

**Two persisted sizes**: a bounded card and a full-window view, with the bounded
card as the default. The footer states which size preference is saved, so the
setting is visible from inside the feature it governs.

**Three groups**: all seven navigation destinations; commands with their keyboard
shortcuts; and live settings controls. Empty groups are dropped as the query
filters, rather than left as headings with nothing under them.

**Rows are live controls** — a switch for the theme toggle and for notification
settings, a range slider for interface scale, a segmented control for density.
The footer states that pressing enter teleports to the control.

It carries its own search with a regex opt-in and a builder affordance, like
every other search surface.

Every element the standard names is present. The gap is that none of it is code.

</details>

## Configuration

| Setting | Default | Effect |
| --- | --- | --- |
| Palette size | Bounded card | The alternative is a full-window view. The choice persists per profile. |
| Open shortcut | One platform-conventional chord | Discoverable from the affordance that opens the palette, not only from documentation. It must not collide with a shortcut the host platform or the vendored interface already claims. |
| Search mode | Plain text | Regex is an explicit opt-in, exactly as on every other search surface. |

The palette itself must appear in the palette — its size setting is a setting,
and a palette that cannot find its own configuration is a good early sign the
enumeration is hand-maintained rather than derived.

## Failure modes

| Failure | Consequence |
| --- | --- |
| A hand-maintained command list | Drifts the first time a feature ships without an entry, and nothing detects it. Derive the list from the same registry that defines the commands. |
| Settings omitted, commands only | The palette answers the easy question and not the one users actually ask. |
| A row that navigates when it should toggle | Five interactions to change one boolean the user already named. |
| Teleport that opens the tab but does not reveal the control | The user is left hunting on a page they did not choose. Explicitly not sufficient. |
| A brief highlight that is the *only* indication | Someone using a screen reader gets nothing. The reveal must move focus, not merely animate. |
| Full-window as the default | Overwhelming on an ordinary display, and disorienting when opened by accident. |
| The size choice not persisted | The user re-chooses it every launch. |
| A destructive command executed straight from a row | The gate applies to every route, the palette included. See [super-confirmation.md](super-confirmation.md). |
| The palette unreachable by keyboard from a modal surface | The one input mode it exists to serve is the one that cannot reach it. |
| Search results that do not say how many matched | An empty result is indistinguishable from a broken query. |

## Security considerations

- **The palette is a route to every action, so it is a route past every guard
  that lives on a button.** Any destructive or irreversible command reachable
  from a row must pass the same confirmation gate as its in-place control. Enforce
  it at the operation, never at the affordance.
- **Row labels can contain user content.** A palette that indexes documents,
  projects or accounts by name will render those names, and it renders them over
  whatever is on screen — including during a screen share. Prefer naming the
  command and the type over interpolating the content where the content is
  sensitive.
- **The palette must not become a search over data it has no right to read.**
  Index commands, settings and destinations. Indexing document *contents* is a
  different feature with a different threat model, and it must not arrive
  accidentally through a palette that started by indexing titles.
- **No network.** The index is built locally from the application's own registry.
  A palette that queries anything remote for suggestions leaks what the user is
  looking for, keystroke by keystroke.

## Verification

**The shortcut binding is covered by focused source-level tests** in
`tests/components/shortcuts-registry.test.ts` and
`tests/components/EntryTopbarSearch.test.tsx`. The full application build,
packaged smoke path and the remaining conformance checklist below are still
pending verification for this change; the documentation site's implementation
has not been audited against the list below.

The palette-specific regex contract is also covered in
`tests/components/CommandPalette.test.tsx`: it checks that the search row keeps
the shared `RegexSearchField`, that the palette creates exactly one local
`useRegexSearch` controller, that plain text remains the hook default, and that
the accessible builder affordance remains 48px and viewport-safe. These are
static/source checks; they do not replace the hosted typecheck, unit suite or an
installed-build capture.

The same contract is checked before dependency installation by
`scripts/check-command-palette-regex.sh`; it is intentionally plain Bash so a
missing local Node toolchain does not make the source contract unverifiable.

Conformance requires all of:

- [ ] a single shortcut opening the palette from every surface, including from
      inside a modal
- [ ] the command list **derived** from the registry that defines commands, so a
      new command cannot ship without an entry — proven by adding one and seeing
      it appear without a second edit
- [ ] every setting in every settings surface reachable by typing its name,
      enumerated against the settings inventory rather than spot-checked
- [ ] a setting row's inline control changing the setting, with the same
      validation and persistence as the settings surface
- [ ] selecting a row opening the surface, **moving focus to** the exact control,
      and announcing it — verified with a screen reader, not only visually
- [ ] both sizes present, the bounded card default, the choice persisted across a
      restart
- [ ] the palette's own search offering plain text by default and the full
      builder on opt-in, with a stated match count and an honest empty state
- [ ] keyboard-only operation end to end, with visible focus throughout
- [ ] all three language modes at tone levels 1 and 5, with command names and
      setting values exact in every combination
- [ ] every destructive command reachable from the palette proven to pass through
      the confirmation gate

The derived-command-list test is the one worth writing first. Every other item
degrades gracefully; that one is what stops the palette quietly falling out of
date, which is the failure that kills this feature in practice.

## Suggested reading

- [regex-builder.md](regex-builder.md) — the search the palette carries
- [material-design-3.md](material-design-3.md) — the mockup's palette anatomy and the motion it specifies
- [appearance-customization.md](appearance-customization.md) — the settings the palette must index and be able to change inline
- [super-confirmation.md](super-confirmation.md) — the gate every destructive row must route through
- [accessibility.md](accessibility.md) — focus movement, announcement, and why a visual highlight alone is not a reveal
- `ROADMAP.md` §3.6 — the tracked work item for the application's palette
