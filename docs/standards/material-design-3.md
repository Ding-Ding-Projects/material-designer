# Material Design 3 and appearance customization

**Status: partial, with the reviewed Groups A through E source integration landed.**
The current integrated source through `6a841a286` mounts the missing window chrome,
repairs viewport and overlay geometry, resolves exact parity destinations, and
adds a broader component-anatomy and literal-ledger migration. Full component anatomy and runtime visual proof
do not exist. The mockup specifies every colour role, shape and motion scale,
density system, window chrome, and ten screens. The source now carries more of
those contracts, but source declarations are not rendered proof.

What that means in practice: the reviewed component slices now consume more
Material Design 3 roles and several have partial anatomy repairs, while other
owners keep their old structure or remain outside the declared set. Partial
role consumption is not complete conformance, and this file's tables keep the
source migration, anatomy depth, and runtime proof separate.

**The source contract is checked; the rendered result is still pending.** Every
implementation claim on this page is read from the tree or from a unit suite,
never from a rendered interface.

The declared verification follow-up passes 60 of 60 focused title, status, shell,
and overlay assertions. The CSS source checker now retains media-query ancestry,
so responsive `auto` and `none` overrides are verified separately from desktop
viewport budgets instead of being flattened into false duplicates. Locale parity,
destructive media clearing, provenance semantics, and staged export checks are also
green in their focused suites. These are source and jsdom results, not pixel or
installed-application evidence.

The forced web typecheck is still red where coherent repairs require currently
undeclared owners: design-system evidence, Figma modal accessibility, the Home Hero
placeholder test, updater metadata, Library cursor consumers, and folder-picker
options. The packaged test typecheck similarly requires an undeclared headless
runtime fixture. Those owners remain open rather than being added silently.

## 2026-08-29 source integration update

Groups A through E are integrated in the source tree. Group A mounts the custom
Windows title bar and application status bar as direct shell children. Group B
publishes one title-bar and tab-chrome geometry contract for fixed and portalled
surfaces. Group C replaces raw viewport budgets and subtracts both chrome strips
from full-height surfaces. Group D removes the shell filter stacking trap, fixed
tab-height caps, and hidden overflow that could make bounded overlay content
unreachable. Group E updates the developer-only deterministic parity resolver.
Library, Appearance, and Handoff have exact source route mappings. Studio remains
intentionally unresolved and fail-closed because no semantically identical
production destination is available. The follow-up anatomy sweep migrates the
reviewed shape, elevation, typography, and motion consumers onto shared Material
Design tokens and uses a checked-in literal ledger.

The source-level evidence is bounded. No built application, installed package,
screenshot, rendered geometry measurement, display-scale matrix, or bilingual
matrix was exercised in this integration. The source parity structure check is
green, while the full parity verifier remains red at
`route.application_implementation` because installed application readiness,
fixture reachability, and capture evidence are not complete. Focused runtime
geometry is unmeasured.

### Twelve-family anatomy and token inventory

This is the exact twelve-family inventory from the mockup. The table separates
source and token work from the anatomy and runtime proof that are still required.
The integration does not establish direct declared owners for a complete
twelve-family anatomy pass, so no family is marked complete.

| Family | Source-level status through `6a841a286` | Anatomy and runtime status |
| --- | --- | --- |
| Navigation rail | Shell offsets, state surfaces, and motion consumers use shared tokens in the reviewed styles. | Partial source only; rendered width, states, and scale behavior are unmeasured. |
| Application header | Title-bar and status-bar geometry is mounted at the shell boundary and uses shared offsets. | Partial source only; caption controls and rendered geometry are unmeasured. |
| Home hero | Home hero rule boundaries, compact targets, shape, and motion consumers are covered by source checks. | Partial source only; the complete mockup anatomy is not proven in the built application. |
| Home recents | Recent-project styling participates in the reviewed shape and motion migration. | Partial source only; card geometry and long-label behavior are unmeasured. |
| Plugins section | Plugin controls and clear-action spacing are wrap-safe and included in the source migration. | Partial source only; catalog anatomy and runtime targets are unmeasured. |
| Design systems tab | Design-system picker and overlay boundaries are covered by the reviewed source contracts. | Partial source only; full card and segmented-control anatomy is unmeasured. |
| Routines section | Switch, state-chip, action-class, title-wrapping, and settings semantics have focused source coverage. | Partial source only; installed interaction and visual states are unmeasured. |
| Integrations view | Labels wrap and the strip scrolls; the plugin search clear action reserves its target space. | Partial source only; vertical sizing and bilingual rendering are unmeasured. |
| Chat pane and composer | Chat and composer styles consume shared shape and motion contracts. | Partial source only; tonal anatomy, focus, and narrow geometry are unmeasured. |
| Settings dialog | The settings page is non-modal, has owned tabs, and uses the reviewed semantic and token contracts. | Partial source only; complete tab anatomy and installed rendering are unmeasured. |
| Message centre | Message and notification surfaces use bounded overlay geometry and tokenized motion. | Partial source only; side-sheet anatomy, stacking, and runtime behavior are unmeasured. |
| Selects and pills | Shared shape compatibility aliases and primitive control dimensions are explicit and ledger-checked. | Partial source only; every picker and pill still needs full anatomy and rendered proof. |

The table must not be read as a claim that all twelve families are complete. It
records exactly what the integrated source demonstrates and leaves the required
runtime, capture, and direct-owner evidence open.

The source audit also has confirmed ownership gaps. Direct declared owners were
not established for `apps/web/src/components/DesignSystemsTab.module.css`,
`apps/web/src/components/BrandsTab.module.css`,
`apps/web/src/components/FirstArtifactHint.module.css`,
`apps/web/src/styles/primitives.css`, the navigation rail component and module
owners, plugin-view owners, `IntegrationsView.tsx`, or the CustomSelect owners
and their focused tests. These paths remain open inventory items, so the
twelve-family audit cannot be marked complete.

Two additional source owners were intentionally left untouched because they are
not declared in `MODIFICATIONS.md`: `apps/web/src/styles/primitives.css` and
`apps/web/src/styles/workspace/artifacts.css`. The filled-tonal button assertion
and three shared density assertions remain red against `primitives.css`. The
workspace artifact picker remains a follow-up rather than an undeclared change.

## The requirement

### Conformance

Every user-facing surface conforms fully to Material Design 3 in its expressive
form — design tokens, typography, shape, elevation, motion and component anatomy
— with **zero legacy or original design elements remaining**.

One exemption: **functional data colours**. Chart series, data-encoding swatches
and status palettes are data, not chrome, and are not required to come from the
theme's colour roles.

### Runtime appearance customization

Persisted, live-applied controls for:

- **Theme** — light and dark
- **Density** — at least three steps
- **Accent / seed colour** — the scheme regenerates from it
- **Full font control** — family chosen from installed *and* bundled faces, size
  scale, weight, with a live preview and a fallback that keeps Chinese, Japanese
  and Korean text legible

Changes apply to the live interface wherever feasible, not only after a restart.

### The per-element editor

Every rendered element gets an appearance editor. **No app, control, picker,
menu, dialog, tab, toolbar, surface, state or pseudo-state is exempt.** A global
theme alone, a handful of hand-picked controls, or an editor that cannot target
its own interface does not satisfy this.

Each element exposes **Edit appearance…** from its context menu plus a keyboard
equivalent. The editor opens as a **non-modal anchored** dialog beside the exact
element being edited, tracks that anchor while open, handles viewport-edge
collision without becoming visually detached, and returns focus to the
originating element on close.

For tabs specifically: ordinary right-click keeps the full tab-management menu
and adds **Edit tab appearance…**; a modifier-click opens the editor directly
where the platform can distinguish the modifier. Where it cannot, the
context-menu command and the keyboard path remain mandatory.

### The pickers are themselves customizable, to word-processor depth

**Colour** — an **infinite** picker: a continuous spectrum, wheel or
two-dimensional field plus numeric entry. Never a swatch-only chooser. It carries
a **colour translator** converting bidirectionally among named colours, hex and
hex-with-alpha, RGB/RGBA, HSL/HSLA, HSV, HWB, CIELAB and LCH, OKLab and OKLCH,
and CMYK; preserves alpha; identifies the active colour space and gamut; warns
before clipping; shows the accessible contrast against the relevant
foreground/background; and lets the user copy any representation. Swatches,
recent colours, eyedroppers and palettes are conveniences layered on top of the
continuous picker, not replacements for it.

**Typography** — every installed and bundled font searchable and selectable, each
name rendered in its own face, with a CJK-safe fallback. Controls for stepped and
free-entry size, variable-font axes where available, weight and bold, italic and
oblique, underline style and colour, single and double strikethrough, overline,
capitalization and small caps, superscript and subscript, text colour, highlight,
outline, shadow, glow where supported, character spacing, word spacing, line
height, baseline offset, direction and alignment. A property the platform cannot
support stays **visible** with a clear explanation rather than disappearing or
silently dropping a saved value.

**These apply to the pickers' own chrome**, not only to the document. The
picker's dialog, the settings surface, tabs, toolbars, menus, notifications and
the appearance editor itself all obey the same system. A theming feature that
cannot theme its own dialog is incomplete.

### And the rest

Every appearance control carries the project's search bar wired to the pattern
builder ([regex-builder.md](regex-builder.md)), keyboard operation with visible
focus, screen-reader names and values, persistence across restarts, per-element
reset and a global reset. Named presets and user-saved themes export and import
as a file, so a customized appearance survives a reinstall and can be shared.
**A customization surface never silently drops a value it cannot represent** — it
says so and keeps the user's input.

### Assets are local

No third-party network origin for scripts, stylesheets, fonts or images, and no
analytics or third-party tracking. This applies to the landing page and the
documentation site as much as to the application.

### Window chrome

Windows desktop builds use a **frameless window with a custom Material Design 3
title bar and window controls**. The operating system's default title bar is
never product chrome.

## Current implementation status

| Requirement | Status |
| --- | --- |
| MD3 token layer in the application | **Source implemented and extended** at `3a8493925`. `md3-tokens.css` carries the colour roles, seeds, shape, elevation, motion, density, type, and compatibility contracts; `tokens.css` maps product names onto them. This remains source evidence, not rendered proof. |
| MD3 component anatomy | **Partial source only.** The reviewed twelve-family slices have token and semantic repairs, but the integrated source does not establish complete direct owners for all twelve families and no rendered anatomy has been measured. |
| Theme light/dark through MD3 roles | **Implemented** at `dea6b0a`, and made effective on 2026-09-02: until then a later `:root` and the dark blocks of `tokens.css` restated `--bg`, `--text`, `--border` and `--accent` as legacy literals after the mapping, so the roles never reached the product tokens. Roles flip themselves between light and dark, so the mapping layer's dark restatements collapsed; the explicit dark choice, the three alternate seeds and the system-preference block are ordered so a seed choice cannot silently un-darken the interface. |
| Density control | **Source implemented** on 2026-09-02: `styles/primitives.css` reads `--sp`, `--control-h`, `--control-h-sm` and `--control-pad-x`, so buttons, fields and select triggers move with the level; the focused suite is green. No runtime matrix is claimed until a capture shows the three levels. |
| Seed colour with scheme regeneration | **Fixed seeds only.** Four seed variants are declared as complete role overrides — the scheme does not *regenerate* from an arbitrary colour, which is what the standard asks for. The default seed's swatch and its generated primary role are deliberately kept apart; conflating them yields a scheme that is subtly wrong everywhere and reads as a rendering bug. |
| Full font control | **Partial source only.** The `AppearanceControls` module defines persisted family, size, weight, line-height, tracking, and visible unsupported values, but its reachability from the live settings surface is not established here. |
| Per-element **Edit appearance…** | **Not started, and not designed.** Absent from the mockup entirely. |
| Infinite colour picker + translator | **Source module exists but is not mounted in the live Appearance surface.** `InfiniteColorPicker.tsx` is imported only by the unmounted `TabGroupAppearanceEditor`; no runtime reachability or capture is established. |
| Word-depth typography editor | **Partial, unmounted source.** `AppearanceControls.tsx` exposes a bounded typography subset and keeps unsupported values visible, but no per-element Word-depth editor is mounted and no runtime behavior is verified. |
| Named presets, export/import, per-element and global reset | **Not started, and not designed.** |
| Frameless window with custom title bar | **Implemented** at `dea6b0a`, on Windows. The main window uses a hidden title-bar style — not a fully frameless one, which would also discard the platform's rounded corners, drop shadow, window-menu shortcut and snap behaviour — and the renderer draws a 40px bar with the brand mark, the product name, a drag region and three caption buttons wired to the real window operations. macOS and Linux keep their native chrome. **Never seen on a screen.** |
| Shape and motion through tokens | **Partial.** The product's radius vocabulary now resolves through the seven-step corner scale, so anything asking for a radius token gets one from the contract. Literal radii still written directly into component styles have not been swept, and the interface's duration values are still literals in the mapping layer. |
| Functional data colours left alone | **Deliberately unmapped**, and this is conformance rather than a gap. Chart series, status palettes and elevation shadows keep their own values; remapping series onto theme roles would make different series indistinguishable, which is a data defect wearing a design change's clothes. |
| Assets bundled locally | **Fonts met** in the application — Roboto Flex, Roboto Mono, Material Symbols Rounded and Cairo all ship as local assets and no CDN font import remains; see [typography-and-icons.md](typography-and-icons.md). The mockup still loads three font families from a third-party origin. The documentation site *is* fully bundled and its deployment enforces that at publish time. |
| Command palette | **Source module exists, mounted status unproven.** `CommandPalette.tsx` contains the indexed rows and an independent regex field, but no importer was observed in `App.tsx` during this review. Do not call it built and mounted until the route is wired and exercised. |

### The token contract is already a drop-in

The most encouraging fact available: the mockup's handoff sheet maps 18 Material
Design 3 tokens onto 18 variables that **already exist** in the interface's
stylesheet at `design/apps/web/src/styles/tokens.css`. Every one of the 18 target
variables was confirmed present in the tree, and every one of the 12 source files
in the mockup's component inventory was confirmed to exist.

That makes the first implementation step unusually cheap: redefine 18 existing
variables in terms of MD3 roles, and the whole interface moves at once.

<details>
<summary><b>The 18-token handoff map</b> — Material Design 3 role → existing interface variable</summary>

| MD3 token | Interface variable |
| --- | --- |
| `--md-sys-color-surface` | `--bg-app` |
| `--md-sys-color-surface-container-low` | `--bg-panel` |
| `--md-sys-color-surface-container` | `--bg-subtle` |
| `--md-sys-color-surface-container-high` | `--bg-muted` |
| `--md-sys-color-surface-container-highest` | `--bg-elevated` |
| `--md-sys-color-on-surface` | `--text` |
| `--md-sys-color-on-surface-variant` | `--text-muted` |
| `--md-sys-color-outline-variant` | `--border` |
| `--md-sys-color-outline` | `--border-strong` |
| `--md-sys-color-primary` | `--accent` |
| `--md-sys-color-primary-container` | `--accent-tint` |
| `--md-sys-color-secondary-container` | `--selected-soft` |
| `--md-sys-color-error` | `--red` |
| `--md-sys-color-success` | `--green` |
| shape corner medium (12px) | `--radius-lg` |
| shape corner full | `--radius-pill` |
| emphasized easing | `--ease-out` |
| emphasized-decelerate duration | `--dur-enter` |

**Verified:** all 18 interface variables exist in the stylesheet today, and all
12 component files named in the mockup's inventory exist under
`design/apps/web/src/components/`.

**Not verified:** that redefining them produces a correct result at runtime. The
application builds and launches, but nobody has looked at a running interface to
confirm the remapping renders correctly.

</details>

<details>
<summary><b>Component inventory</b> — the 12 components the redesign changes, and what each becomes</summary>

| Component | Today | Material Design 3 |
| --- | --- | --- |
| Navigation rail | Icon-only 64px rail with tooltip labels | Navigation rail — 88px collapsed, 260px drawer, active pill indicator |
| Application header | Flat header with a drag region | Small top app bar plus platform caption controls |
| Home hero | Card composer with a chip rail | Expressive prompt surface at 28dp, scenario cards, primary floating action button |
| Home recents | Bordered project tiles | Filled cards with tonal covers and spring lift |
| Plugins section | Search plus category pills | Filter chips, outlined cards, tonal action button |
| Design systems tab | Preview tiles with a swatch row | Elevated cards, 64dp palette band, default badge |
| Routines section | Rows with text buttons | List items with a switch, tonal run action, state chip |
| Integrations view | Tab strip | Segmented button plus list items with status chips |
| Chat pane and composer | Bubbles with a bordered composer | Tonal bubbles, tool cards, 22dp composer, morphing send button |
| Settings dialog | Modal dialog | Full-page settings with a searchable section list — **non-modal** |
| Message centre | Popover list | Standard side sheet with filter chips and unread dots |
| Selects and pills | Ad-hoc radii between 6 and 10px | Normalised shape scale: 8 / 12 / 16 / 28 / full |

</details>

## The design specification

The mockup at `mockups/open-design-m3/` defines the target precisely.

<details>
<summary><b>Colour roles</b> — 33 roles, four seeds, light and dark</summary>

**33 colour roles**: the 31 canonical Material Design 3 roles used by the design,
plus two non-standard extensions, `success` and `success-container`, for states
the canonical set has no role for.

Roles the mockup does **not** define, and which the implementation will need to
decide about: `surface-tint`, `shadow`, the outline fixed and dim variants, and
every `*-fixed` role.

**Four seeds**: sunset (default), violet, teal, lime. Each non-default seed
overrides 10 roles in light and 12 in dark — the primary, secondary and tertiary
families plus the inverse primary. **All surface, outline, error and success
roles stay on the sunset ramp in every seed**, which is a deliberate simplification
worth being aware of: switching seeds re-tints the accents, not the surfaces.

Dark does not redefine the scrim; it inherits the light value.

> [!WARNING]
> **The seed swatch and the primary role are different values and must not be
> conflated.** The sunset swatch shown in settings is `#C96442`; the sunset
> primary role is `#8F4C34`. The swatch is the seed *input*; the role is the
> tone-40 *output* derived from it. A port that uses the swatch value as the
> primary role will produce a scheme that fails contrast where the real one
> passes.

</details>

<details>
<summary><b>Shape, motion and density scales</b> — and the fact that most of them are declared but never used</summary>

**Shape corner scale**: 4 / 8 / 12 / 16 / 28 / 32 / full (9999px).

> [!IMPORTANT]
> These variables are **declared and never consumed** in the mockup — the
> variable is referenced zero times. Every radius in the markup is a literal, and
> 162 of them are the same pill value. The intended normalisation, stated in the
> handoff sheet, is a five-step scale: **8 / 12 / 16 / 28 / full**.
>
> The port must wire the token layer, not copy the literals. Copying the literals
> reproduces the appearance and none of the customizability, which is the entire
> point of the exercise.

**Motion**: an emphasized easing, an emphasized-decelerate easing, and a spring
curve. Only the spring is actually referenced through a variable; the two easings
appear as literals 19 and 12 times respectively. Same problem, same fix.

Observed durations, for calibration: navigation rail width 400ms · screen
entrance 380ms (home 460ms) · command palette 260ms · context menu 180ms · side
sheet 320ms · notification 400ms · switch thumb 280ms on the spring curve ·
floating-action-button morph 320ms on the spring curve.

**Density**: three steps changing gap, padding, row height and card radius. Two
of the five declared density variables are never referenced.

**Interface scale**: 50–200% in steps of 5, default 100. Implemented in the
mockup entirely through a non-standard CSS zoom property, with the declared scale
variable never read. The port needs a real approach here, not this one — zoom
behaves inconsistently and interacts badly with layout at extremes.

**Typography**: a variable sans for body text, a monospace face for every
technical identifier — hashes, paths, identifiers, flags, counters — and an icon
face. Sizes run from 44px for the hero down to 10px for badges.

</details>

<details>
<summary><b>Window chrome</b> — the frameless title bar in full</summary>

**Bar**: 40px tall, 12px left padding with the right edge flush so the caption
buttons reach the corner, background on the surface-container role, a 1px
outline-variant bottom border, selection disabled.

**Left cluster**: a 20×20 brand mark tinted with the primary role and marked
decorative for assistive technology; the product name at 12px/600 with 0.02em
letter spacing on the on-surface-variant role; a subtitle at 11px, same role, 70%
opacity.

**Caption controls**: three buttons, each 46px wide and full bar height with no
margin and no gap between them.

| Button | Icon size | Base | Hover |
| --- | --- | --- | --- |
| Minimise | 16px | transparent, on-surface-variant | ripple overlay |
| Maximise | 15px | transparent, on-surface-variant | ripple overlay |
| Close | 17px | transparent, on-surface-variant | `#C42B1C`, white icon |

Three details that are easy to lose and worth keeping: the icon sizes are
**deliberately unequal** (16/15/17) so the three glyphs read optically the same;
all three use the default cursor rather than a pointer, matching native caption
behaviour; and the close-button red is the one hard-coded, theme-independent
colour in the whole bar, because it is the platform's convention rather than a
theme decision.

Below the bar sit a 42px tab strip ([tabs.md](tabs.md)) and, at the bottom of the
window, a 28px status bar carrying a pulsing daemon indicator, the active model,
the active design system, the interface scale, the density and the version.

</details>

<details>
<summary><b>The command palette</b> — designed, and it meets the standard on paper</summary>

Toggled with a single shortcut, dismissed with the escape key (which also clears
the context menu and any open calendar).

**Two persisted sizes**: a bounded card and a full-window view, with the bounded
card as the default — a search box that swallows the entire window is
overwhelming on an ordinary display, and a full-screen surface a user lands in
accidentally is worse than one they opted into. The footer states which size
preference is saved.

**Three groups**: all seven navigation destinations; commands with their keyboard
shortcuts; and live settings controls. Empty groups are dropped as the query
filters.

**Rows are live controls, not labels.** A row that *is* a setting renders that
setting's actual control inline — a switch for the theme toggle and for
notification settings, a range slider for interface scale, a segmented control
for density — and changing it there changes the setting. The footer states that
pressing enter teleports to the control.

It carries its own search with a regex opt-in and a builder affordance, like
every other search surface.

</details>

## Failure modes

| Failure | Consequence |
| --- | --- |
| Copying the mockup's literal radii and easings instead of wiring tokens | The appearance is reproduced and the customizability is not — which is the whole requirement. Also guarantees drift the first time one literal is edited. |
| Using the seed swatch value as the primary colour role | A scheme with different contrast from the designed one. `#C96442` is an input; `#8F4C34` is the output. |
| Leaving fonts on a third-party network origin | Fails the local-assets requirement, leaks a request per user, and breaks the product offline — for a local-first application. |
| A global theme presented as satisfying the per-element editor requirement | It does not. The requirement is explicitly *every rendered element*. |
| A swatch grid presented as the colour picker | The requirement is a continuous picker with a colour-space translator. Swatches layer on top of it. |
| An anchored editor that detaches at a viewport edge | Specified as a failure: it must handle collision while staying visually attached. |
| A customization surface silently dropping an unrepresentable value | Explicitly forbidden. Say so and keep the input. |
| Exposing the operating system title bar on Windows | Frameless with custom chrome is the requirement. |
| The landing page or documentation site skipped | Every surface individually, documentation included. |
| Editing files under `design/` without a notice entry | Port verification fails the build. See [../porting/verification.md](../porting/verification.md). |

## Security considerations

- **Local assets are a privacy control, not a performance one.** A font request
  to a third-party origin discloses a user's address and interface usage to that
  origin on every launch. For a product whose selling point is that everything
  stays on the machine, that is a contradiction, not an optimisation.
- **Imported themes are untrusted input.** Theme export/import means accepting a
  file from elsewhere. Parse it strictly, validate every value against its
  expected type and range, never evaluate anything in it, and never let it inject
  markup, style text or a URL that is fetched.
- **A font family name is user input.** Rendering it into a style context without
  escaping is an injection route. Enumerating installed fonts also discloses
  something about the machine; keep the enumeration inside the application.
- **Contrast is a safety property.** The picker reports contrast because a
  customization system that lets a user make a destructive-action warning
  unreadable has created a safety problem, not an aesthetic one.

## Verification

**Nothing about how this looks is verified.** A build exists and has been
launched, but no rendered interface has been inspected: the packaged smoke test
captures a single screenshot and asserts only that the file is non-zero. Every
implementation claim above was checked against the file tree or covered by a unit
suite that runs in CI — the window-control behaviour, for example, is tested; the
window's appearance is not.

The distinction matters more here than anywhere else in this documentation set,
because a design standard is exactly the kind of thing that can be entirely
correct in source and visibly wrong on screen.

### Roles this project deliberately does not define

Recorded here because the requirement asks for it in the feature documentation,
and because a silent gap reads as an oversight to the next person.

| Role family | Position |
| --- | --- |
| `background`, `surface-variant` | Omitted by the mockup's contract and not invented here. The surface-container ramp covers what the interface actually needs. |
| `surface-tint` | Omitted. Nothing in the interface currently applies an elevation tint, so defining the role would create a token with no consumer. |
| `shadow` | Omitted as a colour role. Elevation is expressed by the existing shadow tokens, which no colour role can produce, and those stay unmapped for that reason. |
| The `*-fixed` family | Omitted. These exist for surfaces that must not flip with the theme; the interface has none. |

Two roles run the other way: `success` and `success-container` are **non-standard
inventions** of this contract, not canonical Material Design 3 roles. They are
kept under the names the contract wrote and flagged in the token sheet itself, so
a future reader does not mistake them for part of the specification.

Adding any omitted role later is cheap. Discovering that a token was silently
absent, after building on the assumption it existed, is not.

Conformance requires all of:

- [ ] every colour role defined as a token and consumed through the token, with
      zero literal colours in component styles outside the functional-data exemption
- [ ] shape and motion consumed through tokens — a search for literal radius and
      easing values in component styles returns nothing
- [ ] light and dark verified for every screen, at every seed
- [ ] density verified at all three steps
- [ ] interface scale verified at 50%, 100%, 125%, 150%, 200% with no clipping
- [ ] **Edit appearance…** present on every rendered element, reachable by
      context menu and by keyboard, opening an anchored non-modal editor that
      tracks its anchor and returns focus on close
- [ ] the colour picker continuous, with every listed colour space converting in
      both directions, alpha preserved, gamut identified and contrast reported
- [ ] the typography editor covering every listed property, with unsupported ones
      visible and explained rather than hidden
- [ ] presets saved, exported, imported, and surviving a reinstall
- [ ] per-element and global reset both working
- [ ] a request audit of a running build showing **zero** third-party origins
- [x] the frameless window with custom title bar on Windows, with all three
      caption controls operating and the close button carrying the platform red
      — *implemented at `dea6b0a`; the caption controls are covered by a
      desktop-side suite that runs in CI, and the platform red is in the
      component's stylesheet. **Not** confirmed by looking at a window, which is
      why the scale and clipping boxes above stay unticked*
- [ ] the same appearance system present on the landing page and the
      documentation site, verified individually

The request audit is the cheapest check on the list and the one most likely to
catch a real regression. Run it on every build.

## Suggested reading

- [accessibility.md](accessibility.md) — contrast, focus and scale, which this standard cannot be met without
- [regex-builder.md](regex-builder.md) — the search bar every appearance control carries
- [tabs.md](tabs.md) — the strip that sits directly below the title bar
- [notifications.md](notifications.md) — the non-modal surfaces this design depends on
- [../porting/verification.md](../porting/verification.md) — how to change a file under `design/` legitimately
