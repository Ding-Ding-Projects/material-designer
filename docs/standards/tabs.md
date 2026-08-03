# Tabbed navigation

**Status: partial in design, not started in code.** A tab strip is drawn in the
mockup. Overflow, reordering, pinning, grouping, the four discovery searches and
the bulk-close actions are all absent from both the design and the code.

## The requirement

Every user-facing application — **and every documentation or landing site it
ships** — presents its content as **browser-style tabs** rather than one long
scrolling surface. Content separates into discrete pages reachable from a
persistent tab strip, so a user navigates instead of scrolling to find things.

### Behaviour that must be complete, not decorative

| Capability | Requirement |
| --- | --- |
| **Overflow** | An overflow surface when tabs exceed the available width. Tabs are **never silently clipped**. |
| **Reordering** | By drag and by keyboard. |
| **Pinning** | First-class — see below. |
| **Grouping** | First-class — see below. |
| **Searchable tab list** | Wired to the full pattern builder. |
| **Persistence** | Tab order, pinned order, groups, group order, collapsed state and membership all survive a restart. |

### Pinning

Pin and unpin from the tab context menu, from a keyboard path, and from the
searchable tab list. Pinned tabs occupy a **stable dedicated region**, can be
reordered within it, **remain visible when ordinary tabs overflow**, retain an
accessible full name even in compact or icon-only form, and are **excluded by
default** from close-others, close-to-edge and text-based bulk closes.

An explicit include-pinned choice previews the protected tabs before any close.
Existing unsaved-work protection still applies on top of that.

### Grouping

Create, name, rename, colour, reorder, collapse, expand and remove groups. Move
tabs into, out of and between groups by drag and by keyboard. Pin a whole group
or individual members where the product supports it. Restore the complete
structure after a restart.

Groups are **full appearance targets**. Right-click on a group header includes
**Edit group appearance…**; a modifier-click opens its anchored editor directly
where supported. The editor covers typography across all installed fonts, text
and highlight colours, icon or emoji, badges, foreground and background
treatments, borders, shapes, corner radius, spacing, separators, and the
expanded, collapsed, hover and focus states, using the continuous colour picker
and its translator ([material-design-3.md](material-design-3.md)).

Decorations persist per group, remain resettable and exportable, **never replace
the accessible group name or state**, and maintain the required contrast.

### The four tab-discovery searches

All four, each with **its own** adjacent anchored pattern builder, plain text the
default, bidirectional synchronisation, and **no shared hidden state** with any
other field:

1. A search for the **current tab strip**
2. A search **inside every individual group**
3. A search for **groups**, by their visible names and labels
4. A **master search** covering every open tab across all windows, workspaces,
   strips and groups the application owns

Results identify the window or workspace, the strip, the group, the pinned state
and the visible label. They support keyboard activation and an accessible return
path. **Revealing a result inside a collapsed group must not destroy that
collapsed preference.** The same permitted tab-management actions are offered
from results, without losing the active query.

### Bulk close

Every tab strip and searchable tab list provides two actions:

- **Close tabs containing text**
- **Close tabs not containing text**

Matching is against the tab's **visible label or title** — never a silent
inspection of page contents or hidden data. Plain text is the default; an
adjacent affordance opens the full anchored builder and applies its synchronised
pattern, flags, validation and mode to the same action. Regex is optional for the
user; **builder availability is mandatory for both actions**.

The inverse action negates **the exact same predicate**, so flags, casing,
unicode handling and scope cannot drift between the two.

Bulk close never runs on an empty query or an invalid pattern. Before closing it
shows the match mode and the affected count with a reviewable preview; excludes
pinned tabs unless explicitly included; preserves each tab's unsaved-work
protection; and uses a blocking confirmation only where a decision is genuinely
required. Evaluation is local and bounded. Tabs that were excluded or failed to
close are **reported**, not silently counted as closed.

Search and bulk-close previews state whether they apply to the current group,
selected groups or all groups. They never silently cross group boundaries. Empty
groups are retained only when the user deliberately chooses to.

### Accessibility

Correct tab-list, tab and tab-panel roles with roving focus and live panel
associations. Visible focus. Reduced motion respected. Validated at narrow
widths, at every supported display scale, and in bilingual mode where labels are
longest.

## Current implementation status

| Requirement | Status |
| --- | --- |
| Browser-style tab strip | **Designed, not built.** |
| Per-tab close, add button, active-tab lift | Designed. |
| Inline rename | Designed (double-click). |
| Per-tab title styling | **Partially designed** — bold/italic/underline, one family button, one size button, two alignments, one colour. Far short of the typography depth the appearance standard requires. |
| Overflow surface | **Absent from design and code.** Tabs are capped at a maximum width and would clip. |
| Reordering | **Absent.** |
| Pinning | **Absent.** |
| Grouping | **Absent.** |
| Search: current strip | **Absent.** |
| Search: within a group | **Absent.** |
| Search: for groups | **Absent.** |
| Search: master across all windows | **Absent.** |
| Close tabs containing text | **Absent.** |
| Close tabs not containing text | **Absent.** |
| Persistence of order, pins, groups, collapsed state | **Absent.** |
| Tabs on the landing page and documentation site | **Absent.** |

<details>
<summary><b>What the mockup does specify</b> — the strip's exact anatomy</summary>

**Strip**: 42px tall, bottom-aligned, 2px gaps, 8px horizontal padding, on the
surface-container role. It sits directly below the custom title bar and above the
content area.

**Tabs**: 36px tall, asymmetric horizontal padding (12px trailing, 14px leading),
top corners rounded at 12px with square bottoms, 13px medium-weight label, capped
at 260px maximum width, with an 180ms background transition on the emphasized
easing. The active tab takes the surface role with on-surface text; inactive tabs
are transparent with on-surface-variant text. Each carries a 16px leading icon
and a 16px close glyph at 55% opacity rising to full on hover with a ripple
background.

**New-tab button**: 32×32, fully rounded, with an 18px plus icon.

**Right end**: a monospace chip on the surface-container-high role showing the
settings-repository short commit hash — the local version history surfaced in the
chrome rather than buried in settings.

The 260px cap is where the overflow requirement will first bite: the design caps
individual tab width but specifies nothing about what happens when the count
exceeds the strip.

</details>

## Implementation notes

### One predicate, two actions

Implement "close tabs containing" and "close tabs not containing" as a single
match function with a negation flag. Writing them as two functions is how flags,
casing and unicode handling drift apart — and the drift is invisible until a user
runs both and gets results that do not partition the set.

### Persistence needs a stable identity

Restoring order, pins, groups, group order, collapsed state and membership across
a restart requires each tab to have an identity that survives the restart.
Position is not an identity. Neither is a label, which the user can rename.

Where this product persists such state, note that its local version history binds
authenticated data to a stable identifier rather than to a row number, precisely
because a restored row receives a fresh row number and the binding stops
matching. Tab identity has the same shape of problem: reuse a stable identifier,
not an index.

### Revealing must not mutate preferences

Search result activation inside a collapsed group has to show the tab without
permanently expanding the group. Temporarily reveal, then restore the collapsed
state — the user set it deliberately and a search should not undo that.

### Four searches, four independent states

The standard says "never shares hidden state with another field" for a reason:
the natural implementation is one search component reused four times, and the
natural bug is one query object reused four times. Each search owns its query,
pattern, flags, mode and validation, and each opens its own anchored builder.
See [regex-builder.md](regex-builder.md).

## Failure modes

| Failure | Consequence |
| --- | --- |
| Tabs clipped instead of overflowing | Tabs become unreachable. Explicitly forbidden — an overflow surface is required. |
| Pinned tabs scrolling away under overflow | Defeats the point of pinning. |
| Pinned tabs closed by a text bulk close | Pinned means protected by default; including them requires an explicit choice and a preview. |
| A bulk close running on an empty query | Closes everything. Never run on empty or invalid input. |
| A bulk close reporting a count that includes tabs it did not close | The user believes work was closed that is still open, or the reverse. Report exclusions and failures explicitly. |
| The inverse action using a differently-built predicate | The two actions no longer partition the set, and nobody notices until data is gone. |
| Search silently crossing group boundaries | The preview says one thing and the action does another. |
| A collapsed group permanently expanded by a search | A deliberate user preference destroyed by a read-only operation. |
| Group decoration replacing the accessible name | The group becomes unidentifiable to assistive technology. Decoration is additive. |
| Order or groups lost on restart | Persistence is a listed requirement, not a nicety. |
| Bilingual labels clipping | Bilingual mode produces the longest labels; it is the case to test first. |
| The documentation site left as one scrolling page | The requirement covers every shipped site individually. |

## Security considerations

- **Bulk close matches the visible label only.** Never inspect page contents,
  hidden metadata or file bodies to satisfy a label match. A user typing a word
  into a close box has not consented to a content search, and a content-matching
  close would reach data the query never referred to.
- **Pattern evaluation is bounded and local**, exactly as for every other search
  surface. A pathological pattern in a bulk-close box must not freeze the
  application.
- **Closing is destructive.** Unsaved-work protection applies per tab regardless
  of how the close was initiated, and a preview precedes the action. Where the
  scope is large enough to be irreversible in practice, the super-confirmation
  gate applies — see [notifications.md](notifications.md).
- **Persisted tab state can leak.** Titles and group names are stored to survive
  restarts, and they frequently contain project names, client names and file
  paths. Store them with the same protection as the rest of the local data, not
  in a plain sidecar file.

## Verification

**Nothing to verify yet.** Conformance requires all of:

- [ ] an overflow surface appearing when tabs exceed the strip, with **no** tab
      unreachable at any width
- [ ] reordering by drag and by keyboard
- [ ] pin and unpin from the context menu, a keyboard path, and the searchable
      list; pinned tabs in a stable region, visible under overflow, named
      accessibly in compact form
- [ ] pinned tabs excluded by default from close-others, close-to-edge and
      text-based closes, with the include-pinned choice showing a preview
- [ ] groups created, named, renamed, coloured, reordered, collapsed, expanded
      and removed; tabs moved in, out and between by drag and by keyboard
- [ ] **Edit group appearance…** present, anchored, and covering the full
      property set, with the accessible name preserved and contrast maintained
- [ ] all **four** searches present, each with its own anchored builder and its
      own independent state
- [ ] results identifying window, strip, group, pinned state and label
- [ ] a result inside a collapsed group revealed without destroying the collapsed
      preference
- [ ] both bulk closes present, matching visible labels only, refusing empty and
      invalid input, previewing the count, excluding pinned tabs by default, and
      reporting exclusions and failures
- [ ] the inverse action proven to negate the same predicate — a test that runs
      both over the same set and asserts the results partition it exactly
- [ ] order, pins, groups, group order, collapsed state and membership all
      restored after a restart
- [ ] correct roles with roving focus, visible focus, and reduced motion respected
- [ ] validated at the narrowest supported width, at 100/125/150/200% display
      scale, and in bilingual mode
- [ ] the same tab system on the landing page and the documentation site

The partition test is the one worth writing first. It is a single property —
`containing(q) ∪ notContaining(q) = all` and their intersection is empty — and it
catches every form of predicate drift automatically.

## Suggested reading

- [regex-builder.md](regex-builder.md) — the builder each of the four searches needs
- [material-design-3.md](material-design-3.md) — group and tab appearance editing
- [accessibility.md](accessibility.md) — roles, roving focus, and the width and scale matrix
- [notifications.md](notifications.md) — the confirmation gate a large bulk close needs
- [export-and-bulk-actions.md](export-and-bulk-actions.md) — the count-and-preview and honest-exclusion rules the two bulk closes inherit
- [../site/README.md](../site/README.md) — the one surface that records grouping and three of the four searches as inapplicable, and why
