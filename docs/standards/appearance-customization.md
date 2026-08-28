# Appearance customization

**Standard 3.** Every rendered element is adjustable at runtime, through an
editor anchored beside the element itself, with a continuous colour picker and a
word-processor-depth typography editor behind every colour and font value.

**Status: source-implemented, runtime-unverified.** The application now has one
reachable Appearance settings tab that mounts the real System / Light / Dark
theme control, accent picker, presets, seed, density, scale and typography controls.
`/settings/appearance` selects
that tab from the typed route before the settings surface renders; the ordinary
`/settings` route still opens the normal first tab. The controls' hosted build,
restart persistence and installed-renderer behavior remain unverified here.

The current Appearance lane also makes the native theme handoff acknowledged:
desktop IPC returns a bounded success/failure result, and the hidden startup
window reports its mounted witness only after the optional host accepts the
resolved theme. The current host advertises acknowledgement capability version
1; a legacy fire-and-forget host remains discoverable for unrelated capabilities
but is reported as incompatible for native-theme readiness rather than being
claimed as ready. A browser-only build with no host keeps applying the local DOM
theme; a throwing, rejected or timed-out host produces an explicit startup
failure instead of a false readiness claim. Renderer recovery resets the
revealed/revealing/readiness latches and re-runs the acknowledgement before a
reloaded application becomes visible.

The settings page focuses its labelled region only on initial route entry or an
external deep link; roving tab focus stays on the selected tab during local
switches. Workspace, Orbit and Routines are real dialog-owned tabs; Workspace is
filtered from both the tab strip and palette when its permission snapshot says
the viewer cannot see it. Library remains owned by the entry route and is not
advertised as a SettingsDialog tab. Appearance hit areas are source-sized to at
least 48px even when compact density keeps the visual glyph or track smaller.
The latest source follow-up also shares one pending native acknowledgement
between the ordinary preview and startup witness, gives the 2D colour field a
current S/V/value announcement, and wraps unsupported typography and colour
translation rows at narrow or bilingual layouts. Hosted build and installed
interaction evidence remain open.

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
| Theme | System, light and dark, persisted and applied live. |
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
| Theme System / Light / Dark in the application | **Source implemented.** System, Light and Dark are persisted, rendered by the Appearance section and applied live to the document/native shell. The native startup path begins in System and waits for the renderer's validated persisted-theme handoff before revealing the main window. Hosted and installed behavior remain unverified. |
| Localized theme labels | **Source implemented.** `settings.appearance`, its hint, and the System / Light / Dark labels are typed and present in every supported locale, with explicit translated or safe fallback values. |
| Roving appearance choices | **Source implemented.** Seed, density, font family, and accent use one shared radio-group primitive with one tab stop and Arrow / Home / End selection and focus behavior. |
| Direct-page landmark and focus | **Source implemented.** `/settings/appearance` exposes a visible page heading, focuses the `tabIndex=-1` page root on entry, and restores the opener when the page closes. Hosted and installed behavior remain unverified. |
| Density control | **Source implemented.** The real Appearance tab mounts the persisted three-step control. Hosted and installed behavior remain unverified. |
| Seed colour with scheme regeneration | **Source implemented.** The real Appearance tab mounts the persisted seed control and live runtime. Hosted and installed behavior remain unverified. |
| Full font control | **Source implemented.** The real Appearance tab mounts the persisted font, size, weight, line-height and tracking controls, including visible unsupported values. Hosted and installed behavior remain unverified. |
| Per-element **Edit appearance…** | **Partial source implementation at the current lane.** `ElementAppearanceBoundary` now wraps the Windows desktop renderer root, observes body-owned portals, registers every rendered descendant including dialogs, menus, notifications, and the editor itself, and opens a target-specific menu through pointer, Shift+F10/Context Menu, and touch long-press paths. `ElementAppearanceEditor` is a bounded anchored non-modal editor. Built-artifact interaction and per-action capture evidence remain unverified. |
| Infinite colour picker | **Source implemented.** The real Appearance tab mounts the continuous picker beside the accent swatches. Hosted and installed behavior remain unverified. |
| Colour translator | **Source implemented.** The mounted picker owns the translation and contrast readout; runtime evidence remains open. |
| Word-depth typography editor | **Partial source implementation.** Global controls cover the existing supported properties, while the per-element editor adds family preview choices, size, weight, line height, colors, underline, strike, overline, capitalization, direction, alignment and spacing. Unsupported variable-font axes stay visible with an exact reason. Hosted and packaged evidence remain open. |
| Named presets, export/import | **Source implemented for built-in presets.** The mounted section applies the existing preset store; user-saved preset export/import remains open. |
| Per-element and global reset | **Partial source implementation.** The per-element editor records per-property, per-layer, per-state, per-element, and global reset operations, undo and redo snapshots in an append-only local history. Cross-restart and packaged proof remain open. |
| Search bar on every appearance control | **Partial.** Each target context menu and the property inspector own an independent `RegexSearchField`; the editor's capability matrix is filtered through that field. The full application-wide search inventory and built interaction remain open. |
| Native theme acknowledgement | **Source implemented.** The optional desktop bridge returns a validated action result with a bounded timeout; the startup witness is withheld on rejection or timeout. Hosted and installed behavior remain unverified. |
| Settings route and panel ownership | **Source implemented.** Appearance is the typed settings sub-route; Workspace, Orbit and Routines are real SettingsDialog tabs with labelled panels. Workspace is removed from the strip and palette when its permission snapshot is not authorized, while Library remains owned by the entry route. |
| Appearance/settings hit areas | **Source implemented.** Appearance rows, theme and seed choices, picker controls, copy actions, settings tabs, search results, reset actions, regex toggles, overflow and page-back controls carry 48px hit-area floors. Hosted display-scale measurements remain unverified. |
| Native capability compatibility | **Source implemented.** Acknowledgement capability version 1 distinguishes the current promise-returning theme action from a legacy void setter; the latter cannot satisfy the desktop startup witness and produces a truthful incompatibility result. |
| Renderer recovery witness | **Source implemented.** Crash-screen recovery clears the visible/readiness latches, re-arms the splash, and runs the same acknowledged theme witness on every reload before revealing the application surface. |
| Narrow and bilingual appearance rows | **Source implemented.** Unsupported typography rows and colour-translation rows wrap or stack instead of clipping; the 2D colour field exposes live saturation, brightness and RGBA text to assistive technology. |

### Current every-element editor matrix

The current source lane keeps one hand-written capability and state matrix in
`design/apps/web/src/components/appearance/elementAppearance.ts`. The registry
is runtime-owned, so it can address dynamically mounted controls without
inventing a second list of product elements. `ElementAppearanceBoundary` scans
the live subtree and maintains target identity from the element's test id,
DOM id, accessible label, or a deterministic fallback. Each target has an
independent state record for normal, hover, focus, pressed, selected, disabled,
dragged, validation, loading, success, warning and error.

Target ids prefer an explicit product-owned `data-testid`, `id`, or the
boundary's own root marker. Anonymous nodes receive a deterministic semantic
digest from their tag, role, accessible text, and control metadata. There is no
ordinal fallback. Duplicate identities are reported as unsupported and are not
styled, while a visible unsupported-target count explains the collision. This
prevents a dynamic reorder or restart from applying one element's saved style to
another.
When an image operation has no renderer consumer, its matrix entry stays
visible as unavailable with the exact capability reason rather than claiming
that metadata is a working Photoshop operation.

| Contract area | Source owner | Persistence and history | Accessibility and evidence |
| --- | --- | --- | --- |
| Target registry and all states | `ElementAppearanceBoundary.tsx`, `elementAppearance.ts` | Versioned local storage, bounded to 2,000 targets; neutral defaults remain inherited until an explicit edit; each edit appends a redacted snapshot entry | Pointer context menu, Shift+F10/Context Menu, Shift+right-click direct editor, and touch long-press routes resolve one exact target. Built-artifact drive and per-click screenshot receipts remain pending. |
| Layered workspace | `elementAppearance.ts`, `ElementAppearanceEditor.tsx` | Ordered layers and groups, visibility, lock, duplicate, rename, reorder, opacity, blend mode, fill, stroke, effects and geometry are stored per target and state | Keyboard-focusable controls, live status, bounded scroll panel. Runtime and display-scale evidence remain pending. |
| Image editing | `ElementAppearanceEditor.tsx` | Selections, channels, masks, adjustment metadata, smart embedded content, crop/focal/safe-area values, filters, paths and warp metadata are retained in the state snapshot | Unsupported capability entries remain visible with an exact reason. Actual renderer fidelity and packaged evidence are not claimed. |
| Word-depth typography | `ElementAppearanceEditor.tsx` | Family, size, weight, style, text effects, color, highlight, spacing, line height, baseline, direction and alignment are stored per state | Installed-family choices are rendered as previews; variable axes remain visible as unavailable where the renderer lacks the API. |
| State inheritance and preview | `elementAppearance.ts`, `ElementAppearanceEditor.tsx` | Each state records an explicit parent state or overrides; updates append history | State tabs expose all twelve states and the active target remains the focus return point. |
| Resets, undo and redo | `elementAppearance.ts` | Bounded append-only local history; reset and inverse changes create new entries rather than rewriting prior entries | Status text confirms each mutation. No built runtime claim is made until the UI drive lands. |
| Property search | `ElementAppearanceEditor.tsx` | Query is owned by the editor instance and is not persisted with target style | Uses the existing `RegexSearchField` contract, plain text first with an anchored builder. Every editor dropdown uses its own local search and builder instance. The regex implementation is intentionally untouched in this lane. |
| Portable style operations | `elementAppearance.ts`, `ElementAppearanceEditor.tsx` | Bounded schema version 1 rejects duplicate keys, unknown top-level or style fields, malformed JSON, oversized files, missing states, invalid zoom, and excessive layers. Named presets and copy/paste remain local. | Import refusal is announced in the editor status region. Export and import are source-integrated; packaged interaction remains pending. |
| Toy-lock adapter | `toyLockAdapter.ts`, `App.tsx` | No credential value is stored or handled by appearance. The root dispatches a target id, label, role, and anchor to the authentication lane. | The context action remains target-specific and the authentication lane owns policy and prompt semantics. |
| Localization and funny levels | `copy.ts`, `ElementAppearanceEditor.tsx` | Copy state is read from the shared i18n context; no private values are persisted in appearance snapshots | English, Cantonese, and bilingual labels are selected from the active language mode, while funny-level variations style surrounding copy without changing factual target or capability values. Packaged language evidence remains pending. |
| Git-backed history boundary | `elementAppearance.ts` | Appearance history is append-only and local to the application profile; no renderer-side Git process is available in this surface | The capability remains explicitly unavailable until the host history service is connected. The editor does not claim Git-backed history or silently substitute a remote store. |

This matrix is a source implementation record, not a conformance claim. The
application still needs a fresh built package, exhaustive interaction ledger,
per-click screenshot set, and a red-then-green completeness run before any row can
be called verified.

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
| Per-element **Edit appearance…** | **Partial source implementation.** `site/assets/js/element-appearance.js` now provides explicit-id and deterministic semantic-digest target discovery, pointer, keyboard, Shift+right-click and touch context routes, an anchored browser-local editor, state previews, typography, presets, copy/paste, reset and validated transfer. Unresolved duplicate identities and raster-only operations remain visibly unsupported. Deployed interaction evidence remains pending. |
| Font control | **Partial source implementation.** The per-element editor offers installed-family values exposed by the browser surface plus Word-depth typography fields. |
| Named presets, export/import | **Partial source implementation.** Named presets, copy/paste and bounded JSON transfer are local to the visitor. Full deployed evidence remains open. |

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

**The current lane is source-level only.** The real Appearance section is now
mounted and its focused source contracts are recorded, but the application has
not been built or interacted with from an installed artifact in this lane. No
runtime visual or display-scale verdict is claimed.

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
