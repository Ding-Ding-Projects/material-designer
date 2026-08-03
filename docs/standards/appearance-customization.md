# Appearance customization

**Standard 3.** Every rendered element is adjustable at runtime, through an
editor anchored beside the element itself, with a continuous colour picker and a
word-processor-depth typography editor behind every colour and font value.

**Status: not started in the application.** The token substrate this standard
stands on landed at commit `dea6b0a` — an MD3 token sheet plus a mapping layer —
but no appearance editor, no continuous colour picker and no preset system
exists in the application. The documentation site implements a subset of the
runtime controls; the details and the gaps are in the status table below.

> [!NOTE]
> This file owns standard 3. [material-design-3.md](material-design-3.md) owns
> standard 2 — conformance itself — and describes the token layer, the colour
> roles and the shape and motion scales that everything here reads from. Read
> that file first if you want to know *what* the values are; read this one to
> know *who gets to change them*.

## The requirement

### Runtime controls, persisted and live

| Control | Requirement |
| --- | --- |
| Theme | Light and dark. |
| Density | At least three steps, changing gap, padding and row height. |
| Accent / seed colour | The whole scheme regenerates from it, not one tinted button. |
| Font | Family chosen from installed **and** bundled faces, size scale, weight, with a live preview and a fallback that keeps Chinese, Japanese and Korean text legible. |

Changes apply to the live interface wherever feasible, not only after a restart.
Every value persists across restarts.

### An editor for every element

**No app, control, picker, menu, dialog, tab, toolbar, surface, state or
pseudo-state is exempt.** A global theme, a handful of hand-picked controls, or
an editor that cannot target its own interface does not satisfy this.

Each element exposes **Edit appearance…** from its context menu and from a
keyboard equivalent. The editor opens as a **non-modal anchored** surface beside
the exact element being edited, tracks that anchor while it is open, handles
viewport-edge collision without becoming visually detached, and returns focus to
the originating element on close.

For tabs, ordinary right-click keeps the full tab-management menu and adds
**Edit tab appearance…**; a modifier-click opens the editor directly where the
platform can distinguish the modifier. Where it cannot, the context-menu command
and the keyboard path remain mandatory — a modifier gesture is never the only
route.

### The colour picker is continuous, and it translates

An **infinite** picker: a continuous spectrum, wheel or two-dimensional field,
plus numeric entry. Never a swatch-only chooser.

It carries a **colour translator** converting bidirectionally among named
colours, hex and hex-with-alpha, RGB/RGBA, HSL/HSLA, HSV/HSB, HWB, CIELAB and
LCH, OKLab and OKLCH, and CMYK. It preserves alpha, identifies the active colour
space and gamut, **warns before clipping**, shows the accessible contrast against
the relevant foreground or background, and lets the user copy any
representation.

Swatches, recent colours, eyedroppers and palettes are conveniences layered on
top of the continuous picker — never replacements for it.

### The typography editor is word-processor deep

Every installed and bundled family searchable and selectable, **each name
rendered in its own face**, with a CJK-safe fallback. Controls for stepped and
free-entry size, variable-font axes where available, weight and bold, italic and
oblique, underline style and colour, single and double strikethrough, overline,
capitalization and small caps, superscript and subscript, text colour, highlight,
outline, shadow, glow where supported, character spacing, word spacing, line
height, baseline offset, direction and alignment.

**A property the platform cannot support stays visible with a clear
explanation** rather than disappearing or silently dropping a saved value.

### The pickers theme themselves

The picker's own dialog, the settings surface, tabs, toolbars, menus,
notifications and the appearance editor itself all obey the same system. A
theming feature that cannot theme its own dialog is incomplete.

### Presets, export, import, reset

Named presets and user-saved themes export and import as a file, so a customized
appearance survives a reinstall and can be shared. Per-element reset and a global
reset are both present. Every appearance control carries the project's search bar
wired to the pattern builder — see [regex-builder.md](regex-builder.md).

## Why each rule is there

**Why every element, rather than a good global theme?** Because the requests
that reach a theming feature are never "make everything blue". They are "this one
tab is unreadable at my display scale", "this status chip's colour means
something to me". A global theme answers none of them, and each unanswered one
becomes a feature request that gets satisfied with a one-off setting — until the
settings surface is fifty unrelated switches. A per-element editor is the general
answer that stops the specific ones accumulating.

**Why continuous rather than swatches?** A swatch grid is a designer's opinion
about which colours a user is allowed to want. It also silently fails the
accessibility case: a user who needs a specific contrast ratio cannot reach it
from twelve fixed choices. The translator is there for the same reason from the
other direction — a user arriving with a brand colour in CMYK, or a value copied
out of a design tool in OKLCH, should not have to convert it by hand and
introduce a rounding error.

**Why "warn before clipping" rather than clip?** Silently clamping an
out-of-gamut colour returns a value the user did not choose, and returns it
*looking* like it worked. The next time they open the picker, the number they
typed has changed and nothing explains why.

**Why must an unsupported property stay visible?** Because the alternative —
hiding it — is indistinguishable from the property not existing, and a saved
value silently dropped on a platform that cannot render it will be silently
dropped again when the file moves to a platform that can.

**Why anchored and non-modal?** The whole point of editing an element's
appearance is watching the element change. A modal dialog covers the thing being
edited, and a detached dialog makes the user prove to themselves which element it
is bound to.

## Current implementation status

| Requirement | Status |
| --- | --- |
| MD3 token layer to customize against | **Implemented** at commit `dea6b0a` — `design/apps/web/src/styles/md3-tokens.css` defines the role set and `tokens.css` became a mapping layer onto it. This is the substrate, not the feature. |
| Theme light/dark in the application | **Partial upstream.** A theme exists; it is not yet a user-facing MD3 appearance control. |
| Density control | **Not started** in the application. |
| Seed colour with scheme regeneration | **Not started** in the application. |
| Full font control | **Not started, and not designed.** |
| Per-element **Edit appearance…** | **Not started, and not designed.** Absent from the mockup entirely. |
| Infinite colour picker | **Not started, and not designed.** The mockup offers four fixed swatches. |
| Colour translator | **Not started** in the application. |
| Word-depth typography editor | **Not started.** The mockup's tab-title card offers bold, italic, underline, one family button, one size button, two alignments and one colour swatch — a small fraction of the requirement. |
| Named presets, export/import | **Not started, and not designed.** |
| Per-element and global reset | **Not started.** |
| Search bar on every appearance control | **Not started** in the application. |

### What the documentation site implements

The site is a separate surface and is held to the same standard individually. Its
appearance system is implemented in committed source at
`site/assets/js/appearance.js`, which is what the published site serves.

| Requirement | On the site |
| --- | --- |
| Theme | **Implemented** — light, dark and system, applied before first paint so the page cannot flash the wrong theme. |
| Density | **Implemented** — three steps driving the gap, padding, row and card tokens. |
| Seed colour | **Implemented** — four named seeds plus an arbitrary colour, with the dependent roles derived in the OKLab space and recomputed on every theme change. |
| Interface scale | **Implemented** — 50–200% in steps of 5. |
| Colour translator | **Partial.** Shows the current colour as hex, RGB, HSL and HSV, each copyable, with a contrast readout against the current surface. **Missing**: HWB, CIELAB/LCH, OKLab/OKLCH and CMYK, alpha preservation across every representation, gamut identification and the clipping warning. |
| Per-element **Edit appearance…** | **Not present.** |
| Font control | **Not present.** |
| Named presets, export/import | **Not present.** No preset concept exists in the source. |

> [!IMPORTANT]
> **The site implementing a subset is not the standard being met.** Every rule
> applies to every surface individually, so a site that customizes four things
> well is a site with a documented gap, not a site that is exempt. The gaps above
> are the site's own backlog, and they are listed here rather than left for a
> reader to infer from what the settings page does not contain.

## Configuration

Every control in this standard *is* configuration, so the table below is the
default state rather than a set of knobs that govern it.

| Setting | Default | Notes |
| --- | --- | --- |
| Theme | Follow the operating system | An explicit light or dark choice overrides it and persists. |
| Density | The middle step | The compact step is opt-in because it reduces hit-target size; see [accessibility.md](accessibility.md). |
| Seed colour | The product's own default seed | Changing it regenerates the scheme rather than tinting a control. |
| Interface scale | 100% | The supported range and the clipping matrix are in [accessibility.md](accessibility.md). |
| Per-element overrides | None | An element with no override inherits from the theme. Reset returns it to that state rather than to a hard-coded value. |

Persistence is per profile and local. Nothing in this standard synchronises
anywhere.

## Failure modes

| Failure | Consequence |
| --- | --- |
| A global theme presented as satisfying this standard | It does not. The requirement is explicitly *every rendered element*. |
| A swatch grid presented as the colour picker | The requirement is a continuous picker with a translator. Swatches layer on top. |
| An anchored editor that detaches at a viewport edge | Specified as a failure: it must handle collision while staying visually attached. See [overlays.md](overlays.md). |
| A modal appearance editor | Covers the element being edited, which is the one thing the user needs to see. |
| Focus lost when the editor closes | The keyboard user is dropped somewhere unrelated after every edit. |
| A customization surface silently dropping a value it cannot represent | Explicitly forbidden. Say so and keep the input. |
| Clipping an out-of-gamut colour without warning | Returns a colour the user did not choose, and the number changes behind their back. |
| A modifier-click as the only route to the editor | Not every platform can distinguish it, and no keyboard user can reach it. |
| Per-element overrides with no reset | The user can reach a state they cannot leave. |
| Presets that cannot be exported | A reinstall discards work the user did deliberately. |
| Contrast unreported in the picker | The user can make a destructive-action warning unreadable and never be told. |

## Security considerations

- **Imported themes are untrusted input.** Export and import means accepting a
  file from elsewhere. Parse it strictly, validate every value against its
  expected type and range, never evaluate anything in it, and never let it inject
  markup, style text, or a URL that is subsequently fetched.
- **A font family name is user input.** Rendering it into a style context without
  escaping is an injection route.
- **Enumerating installed fonts discloses something about the machine.** Keep the
  enumeration inside the application; never send a font list anywhere.
- **Contrast is a safety property, not an aesthetic one.** A customization system
  that lets a user make the destructive-action gate's copy unreadable has created
  a safety problem. The picker reports contrast so that outcome is visible at the
  moment it is chosen — see [super-confirmation.md](super-confirmation.md).
- **A preset file can carry a name and a comment.** Treat both as display text
  from an unknown author: no markup, no links that are followed automatically.

## Verification

**Nothing in this standard has been verified.** The application builds, installs,
launches and passes an automated health check, and its unit suites pass — but no
interactive audit of any appearance surface has been performed, and the feature
does not exist to audit.

Conformance requires all of:

- [ ] theme, density, seed and font all present, applying live, and surviving a
      restart
- [ ] **Edit appearance…** reachable on every rendered element by context menu
      **and** by keyboard, enumerated against the application's own element
      inventory rather than spot-checked
- [ ] the editor opening anchored and non-modal, tracking its anchor while the
      surface scrolls, colliding with a viewport edge without detaching, and
      returning focus on close
- [ ] the colour picker continuous, with **every** listed colour space converting
      in both directions, alpha preserved, gamut identified, clipping warned
      before it happens, and contrast reported against the relevant background
- [ ] the typography editor covering every listed property, with unsupported ones
      **visible and explained** rather than hidden — proven by checking a
      platform that lacks one of them
- [ ] a value the platform cannot represent kept and reported, not dropped
- [ ] presets saved, exported, imported into a fresh profile, and surviving a
      reinstall
- [ ] per-element reset and global reset both returning to inheritance, not to a
      hard-coded value
- [ ] the appearance system theming its own dialog, the settings surface, tabs,
      menus and notifications
- [ ] every appearance control carrying its search bar wired to the pattern
      builder
- [ ] the same system present on the landing page and the documentation site,
      verified individually

The per-element enumeration is the item that decides whether this standard is met
or merely approximated. Everything else can be demonstrated on one control; that
one cannot.

## Suggested reading

- [material-design-3.md](material-design-3.md) — the token layer, colour roles and scales this standard edits
- [overlays.md](overlays.md) — the anchoring, surface-painting and viewport-bounding rules the editor must obey
- [context-menu-shortcuts.md](context-menu-shortcuts.md) — the menu **Edit appearance…** is reached from
- [regex-builder.md](regex-builder.md) — the search every appearance control carries
- [accessibility.md](accessibility.md) — contrast, focus and the display-scale matrix, which this standard cannot be met without
- `ROADMAP.md` §2.5, §4.10, §4.11, §4.12 — the tracked work items for the runtime controls, the picker, the typography editor and presets
