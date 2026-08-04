# Modifications to the imported work

`design/` contains a copy of **Open Design** v0.16.1, licensed under the Apache
License 2.0. The full licence text is at [`design/LICENSE`](design/LICENSE).

- Upstream: <https://github.com/nexu-io/open-design>
- Imported at commit: `517f39acde402c1a7af2189167a8d6957a3dac71`
- Import date: 2026-08-03

Apache-2.0 section 4(b) requires prominent notices on files that were changed.
This file is that notice, kept in one place so a reader sees the whole delta
without diffing two repositories.

## This file is enforced, not decorative

`scripts/verify-port.sh` compares every file under `design/` against the pinned
upstream tree and **reads the path list below as its allowlist**. A file that
differs from upstream without an entry here fails verification; an entry here
for a file that no longer differs also fails. The notice and the code cannot
drift apart, because CI checks that they agree.

Paths are relative to `design/` and are written as `` - `path/to/file` `` under
the **Changed files** heading of an entry.

## Import

Copied byte-for-byte from the pinned submodule: all 11,799 files match the
upstream blob ids exactly, file modes included.

## Changes

### 2026-08-04 — The header search bar, routed into the palette rather than duplicating it

**Reason:** the last of the three pieces of chrome the mockup specifies. The
navigation rail and the status bar landed earlier; this is the search field.

**The mockup settled a question the requirement left open.** It draws *two*
adjacent controls — a search pill and a separate `Ctrl K` button wired to the
palette — so the keyboard hint is a neighbour rather than the field's own
behaviour, and the mockup's own query state is inert, filtering nothing. It
specifies anatomy, not semantics.

So the two became one control that routes into the palette. The three
collections the placeholder names — projects, plugins, design systems — each
already own a regex-search field of their own, and the palette already answers
the question one level up with scopes for exactly those plus settings and
files. A header field with its own result list would have been the fourth
implementation of the same search, and two global searches twelve pixels apart
is worse than one.

**The builder is real rather than decorative**, which is what the standard
actually requires: the pattern and flags travel into the palette's own
filtering, the palette states on screen which pattern it is matching with, and
it offers the way back to plain text. Two traps were closed on the way — the
palette compiles its own matcher rather than borrowing the field's, because a
`/g` expression carries `lastIndex` and would match every other row; and
scope-prefix parsing switches off while a pattern is live, because `#\d+`
would otherwise lose its `#` to the scope parser.

`Cmd/Ctrl+K` now opens the palette, so the chip names a key that works.

**Changed files:**

- `apps/web/src/components/EntryTopbarSearch.tsx`
- `apps/web/src/components/EntryTopbarSearch.module.css`
- `apps/web/src/components/command-palette/open.ts`
- `apps/web/tests/components/EntryTopbarSearch.test.tsx`
- `apps/web/tests/components/CommandPalette.regex-filter.test.ts`


### 2026-08-04 — Give the home screen Material Design 3 anatomy, not just its colours

**Reason:** a reader compared the shipped screenshot to the mockup and said the
application still looked like the one it was forked from. The chrome half of
that — a persistent navigation rail and a status bar — landed earlier. This is
the other half: the home screen's own content, which was upstream's anatomy
wearing Material Design 3 colours. Roadmap § 2.4 Wave 2.

The loudest "old app" cue was a centred 40px serif heading; it is now
`display-large` on the sans face. The prompt surface moved from a 16px
hairline-bordered flat card to the specified **28dp** corners on
`surface-container-high`, resting at elevation 1 and lifting to 3, with a
primary focus ring in place of a tinted border. Its control row is a 36dp
assist-chip rail — fully rounded, `outline-variant` hairline, transparent
fill — with the model switcher as the rail's single filled chip, mirroring the
mockup. The send button morphs on hover, corner-l to corner-xl with a spring.

The template rail became a **card grid**. It was a horizontally scrolling strip
of fixed-width cards whose later entries were reachable only through hover
edge-zones; it is now `auto-fill` columns of outlined M3 cards with a tonal
tile for the scenario art and a spring lift, so every scenario is simply on
screen. Recent-project cards gained the same treatment with tonal covers.

**One test changed meaning rather than breaking, and it is the interesting
one.** `home-hero-rail` asserted `scrollWidth > clientWidth` and then clicked
the rail's right edge-zone to prove it scrolls — a test that *described the old
design*. Neither can hold in a grid. The rewrite keeps the property it was
really protecting, that every scenario is reachable without page overflow, and
strengthens it: the container is a grid, it has more than one row, no card
extends past its right edge, and page overflow stays within two pixels.

Deliberately not done: restructuring the control row's JSX into literal chip
components. The chip contract is applied to the existing triggers through CSS;
doing it structurally would touch four shared components and their suites for
an identical rendered result.

**Changed files:**

- `apps/web/src/styles/home/plus-menu.css`
- `apps/web/tests/styles/home-hero-compact-controls.test.ts`
- `apps/web/src/styles/home/recent-projects.css`


### 2026-08-04 — Finish the rebrand on the surfaces a user actually reads first

**Reason:** driving the packaged build from a clean profile lands on
onboarding — the first screen anyone sees — and it read "Welcome to Open
Design" and "Sign in to Open Design" inside a window titled *Material
Designer*. The release smoke test cannot catch it: its captures begin past
onboarding, so the surface is outside the state list entirely.

**The work was the classification, not the substitution.** Of 111 occurrences
in the English dictionary, 64 name *this product* and were changed. The rest
were kept, each for a reason:

- **Open Design Cloud** is upstream's real hosted service, with real accounts
  and balances. Renaming it would tell a user their account lives somewhere it
  does not.
- The **upstream project, repository, community and social links**, the
  **telemetry recipient**, the **`od:` plugin and skill format nouns**, and
  the sample starter-memory text all legitimately name upstream.
- One is not the brand at all: *"**Open** Design Systems to view the full
  preview"* is an imperative verb, which every other locale confirms by
  translating it as one.

**One call went deliberately against the brief.** The cloud sign-in button
became "Sign in to Open Design **Cloud**" rather than "Material Designer",
because it authenticates against upstream's service — there is no Material
Designer account to sign in to. Spelling the service out removes the "this app
is called Open Design" reading without lying about where the credential lives.

**The copyright line is deliberately unchanged.** `© 2026 Open Design · All
rights reserved.` is an attribution, not a product name. Apache-2.0 §4(c)
requires retaining copyright notices, and this notice is the only place a user
sees upstream credited. Replacing it would erase that; adding this fork's name
would assert a co-holder claim nobody here is in a position to make. The
ambiguity around it was removed instead — the wordmark and heading above it
now say Material Designer, so the footer reads as what it is. **This is the one
item that warrants a human decision rather than an agent's.**

**Substituting a token into twenty languages broke grammar, and it was fixed
rather than shipped.** "Material" is consonant-initial where "Open" is not, so
Hungarian's article changes and its vowel-harmony suffixes flip across 49
sites; Turkish's front-unrounded ending flips 22 more; Korean's vowel-final
디자이너 takes different particles than 디자인 across 28. A rename that reads
as broken grammar in three languages is not a rename that respects them.

**Deliberately left:** the pre-mount `Loading Open Design…` string, because 42
Playwright waits across 32 files synchronise on that exact literal and use
hidden/count assertions — changing the source without changing all 42 would
not fail the suite, it would silently turn every startup wait into a no-op.
That is a one-line change with a 32-file dependency and belongs in its own
pass.

**Changed files:**

- `apps/web/src/components/DesignSystemFlow.tsx`
- `apps/web/src/components/EntryShell.tsx`
- `apps/web/src/components/FileWorkspace.tsx`
- `apps/web/src/components/HomeView.tsx`
- `apps/web/src/components/McpClientSection.tsx`
- `apps/web/src/components/NewProjectPanel.tsx`
- `apps/web/src/components/PluginsView.tsx`
- `apps/web/src/components/ProjectView.tsx`
- `apps/web/src/components/WhatsNewPopup.tsx`
- `apps/web/src/components/XaiOAuthControl.tsx`
- `apps/web/src/components/use-everywhere/sections.ts`
- `apps/web/src/design-system-auto-prompt.ts`
- `apps/web/src/i18n/funny/en.ts`
- `apps/web/src/i18n/funny/zh-HK.ts`
- `apps/web/src/i18n/locales/ar.ts`
- `apps/web/src/i18n/locales/de.ts`
- `apps/web/src/i18n/locales/en.ts`
- `apps/web/src/i18n/locales/es-ES.ts`
- `apps/web/src/i18n/locales/fa.ts`
- `apps/web/src/i18n/locales/fr.ts`
- `apps/web/src/i18n/locales/hu.ts`
- `apps/web/src/i18n/locales/id.ts`
- `apps/web/src/i18n/locales/it.ts`
- `apps/web/src/i18n/locales/ja.ts`
- `apps/web/src/i18n/locales/ko.ts`
- `apps/web/src/i18n/locales/pl.ts`
- `apps/web/src/i18n/locales/pt-BR.ts`
- `apps/web/src/i18n/locales/ru.ts`
- `apps/web/src/i18n/locales/th.ts`
- `apps/web/src/i18n/locales/tr.ts`
- `apps/web/src/i18n/locales/uk.ts`
- `apps/web/src/i18n/locales/zh-CN.ts`
- `apps/web/src/i18n/locales/zh-HK.ts`
- `apps/web/src/i18n/locales/zh-TW.ts`
- `apps/web/tests/components/ChatComposer.search.test.tsx`
- `apps/web/tests/components/EntryShell.onboarding.test.tsx`
- `apps/web/tests/components/preview-modal-unavailable-state.test.tsx`
- `apps/web/tests/components/SettingsDialog.execution.test.tsx`
- `apps/web/tests/components/UpdateDialog.test.tsx`
- `apps/web/tests/components/UpdaterPopup.test.tsx`
- `apps/web/tests/components/WhatsNewPopup.test.tsx`


### 2026-08-04 — Interpolate per language, so a bilingual value stops being said twice

**Reason:** `t()` composed the two languages **and then** interpolated, so a
variable whose value was itself translated copy arrived already bilingual and
the bilingual template substituted it into both halves. `{level} density ·
{level}密度` with a `densityLabel` of `Default · 預設` produced **`Default ·
預設 density · Default · 預設密度`** — thirty-seven characters saying "Default
density" twice in English. It was found as a clipping symptom; it is the cause
of the width, and it affected every bilingual string built from a translated
variable, not the one that happened to overflow.

Rendering now happens **per language before the join**, and a caller marks a
variable that is itself copy with `tv(key, vars?, transform?)` rather than
passing a `t()` result. `tv` resolves through the same per-language read that
renders the outer template, which is what keeps both funny-level sliders
applying — to the nested value as well as to the template around it.

Two shortcuts were rejected for stated reasons. Composing two
`tForLanguageTag` calls would have bypassed the funny-level machinery and
silently un-shipped a feature. Interpolating first and then composing the
rendered halves would have made the join decision read rendered text rather
than the template, so `{n}m` would compose at one value of `n` and decline at
another — the same chip behaving differently at 5 minutes and 1234. The join
now reads templates for the structural guards and rendered text only for
emptiness, which also fixes two identical templates carrying a per-language
variable, where the old guard collapsed them to one half.

Seventeen direct call sites are converted. Roughly sixteen indirect ones —
where the value comes from a helper that returns `t()` output — are recorded
rather than chased, because changing those helpers' return types cascades
much further than this change should; the mechanism handles them whenever
someone does.

**And the bottom overlap it was found beside.** The scroll hint and collapse
pill are `position: fixed`, so they sit against the viewport and knew nothing
about where the scrolling column ends — anything scrolled to the bottom was
painted underneath them. The shell's grid already accounted for the status
bar; the unreserved fixed overlay was the problem. The bar's height is now a
published token, consumed by the bar itself so the number is stated once, and
the scroll column reserves the pill's band so content clips above it instead
of sliding under.

**Changed files:**

- `AGENTS.md`
- `apps/web/src/components/AppStatusBar.module.css`
- `apps/web/src/components/AppStatusBar.tsx`
- `apps/web/src/components/AssistantMessage.tsx`
- `apps/web/src/components/BoardComposerPopover.tsx`
- `apps/web/src/components/ChatComposer.tsx`
- `apps/web/src/components/ChatPane.tsx`
- `apps/web/src/components/ConversationsMenu.tsx`
- `apps/web/src/components/DesignBrowserPanel.tsx`
- `apps/web/src/components/DesignFilesPanel.tsx`
- `apps/web/src/components/DesignKitView.tsx`
- `apps/web/src/components/DesignSystemSwitchPicker.tsx`
- `apps/web/src/components/ExamplesTab.tsx`
- `apps/web/src/components/FileViewer.tsx`
- `apps/web/src/components/FileWorkspace.tsx`
- `apps/web/src/components/NewAutomationModal.tsx`
- `apps/web/src/components/NewProjectPanel.tsx`
- `apps/web/src/components/NextStepActions.tsx`
- `apps/web/src/components/PluginsView.tsx`
- `apps/web/src/components/PreviewModal.tsx`
- `apps/web/src/components/PrivacySection.tsx`
- `apps/web/src/components/RoutinesSection.tsx`
- `apps/web/src/components/SettingsDialog.tsx`
- `apps/web/src/components/UpdaterPopup.tsx`
- `apps/web/src/components/appearance/InfiniteColorPicker.tsx`
- `apps/web/src/components/bulk/messages.ts`
- `apps/web/src/components/command-palette/CommandPalette.tsx`
- `apps/web/src/components/command-palette/commands.ts`
- `apps/web/src/components/design-system-github-evidence.ts`
- `apps/web/src/components/routineScheduleLabels.ts`
- `apps/web/src/components/workspace/TabLauncherMenu.tsx`
- `apps/web/src/i18n/index.tsx`
- `apps/web/src/i18n/interpolate.ts`
- `apps/web/tests/components/design-system-github-evidence.test.ts`
- `apps/web/src/i18n/runErrors.ts`
- `apps/web/src/runtime/design-toolbox.ts`
- `apps/web/src/styles/home/plugins-home.css`
- `apps/web/src/styles/md3-tokens.css`
- `apps/web/src/utils/chatTime.ts`
- `apps/web/tests/i18n/interpolation.test.ts`
- `apps/web/tests/styles/home-templates-status-bar-clearance.test.ts`


### 2026-08-04 — Make the settings surface tabbed and searchable

**Reason:** two standards, both unmet and both visible in one capture. The
settings dialog showed a seventeen-item scrolling section list with no search
field anywhere on it — while standard 4 requires every settings surface to
carry its own search wired to the regex builder, and standard 5, extended
today, requires those sections to be browser-style tabs rather than a bespoke
list that behaves like nothing else in the product.

**The search reuses the index that already existed.** `SETTINGS_INDEX` was
built for the command palette; the new matcher takes that table as its input
rather than declaring a second one that would drift from it, and uses the
regex controller's own predicate rather than a second matching implementation.
Each field is tested separately, so an anchored pattern like `^theme` anchors
to something the user can see instead of to a joined blob. Hits on the active
tab come first, hits elsewhere carry an "On {tab}" badge and a count — which
is the standard's requirement to say plainly when a match sits on another tab.
Entries whose section has no tab are filtered out, because a result that
cannot be opened from here is worse than no result.

**The seventeen hand-written navigation buttons became a real tab strip** with
`role="tablist"`, roving focus, arrow-key traversal that wraps, and the panel
promoted to a single labelled `tabpanel`. Overflow scrolls rather than
clipping, with a persistent overflow menu listing every section and badging
the ones measured out of view — portalled, because the modal body clips. The
active tab persists across restarts, and is read only when no section was
named, so every explicit call site keeps working unchanged.

**Reordering, pinning, groups, the four discovery searches and the per-tab
appearance editor are not attempted**, and are recorded as remaining rather
than implied. The strip and the search are already a large change across a
9,000-line component; pinning needs its own persistence schema and a region
that interacts with overflow.

**Changed files:**

- `apps/web/src/components/settings/settingsTabs.ts`
- `apps/web/src/components/settings/settingsSearchMatch.ts`
- `apps/web/src/components/settings/SettingsTabStrip.tsx`
- `apps/web/src/components/settings/SettingsSearchResults.tsx`
- `apps/web/src/components/settings/SettingsTabs.module.css`
- `apps/web/src/styles/workspace/mention-home.css`
- `apps/web/tests/components/SettingsDialog.tabs.test.tsx`
- `apps/web/tests/components/settingsSearchMatch.test.ts`


### 2026-08-04 — Make the UI scale reflow instead of magnify, and stop bilingual clipping

**Reason:** captures at 125, 150 and 200% showed a horizontal scrollbar, the
home heading cut off mid-word, and the status bar pushed off the bottom of the
screen. The UI scale setting was broken at every value except 100%, and
raising it is something people do for accessibility reasons.

**The cause was `zoom`, and this repository had already written the warning.**
Roadmap § 2.5 said to replace the mockup's scaling mechanism because it uses a
non-standard `zoom` property; it was ported anyway, because nothing had ever
rendered it. `zoom` multiplies painted lengths without moving the layout
viewport, so `100vw` on a 1280px window still resolved to 1280 and was then
drawn twice as wide. The overflow was arithmetic.

The desktop host now scales its own web contents through `setZoomFactor`,
which divides the real layout viewport — a 1280×900 window at 200% lays out as
640×450. Viewport units and width media queries become truthful at once, with
no stylesheet sweep, and `getBoundingClientRect` keeps agreeing with pointer
coordinates, which is the roadmap's "does not break layout measurement".

A root-font-size approach was considered and rejected as a fix that would look
like one: this application is overwhelmingly px-based, and scaling `:root`
would not have touched the `100vw`/`100vh` that actually overflow. In a plain
browser tab, where no host bridge exists, `zoom` is kept and the window-level
boxes derive their size from it — that stops the *window* overflowing but is
honestly partial, since `@media` cannot read a custom property.

**Bilingual clipping had a different cause than it appeared.** The status bar's
segments were `display: flex` with `text-overflow: ellipsis`, and
`text-overflow` does nothing to an anonymous flex item — so text hard-clipped
mid-glyph against the strip's padding with no ellipsis and no way to read the
rest. Each segment's text now lives in a real element that can ellipsise, every
segment carries its full text in `title`, and the daemon segment — the one a
user acts on — never yields room. The two appearance readouts step aside at
narrow widths through the repository's own screen-reader-only pattern rather
than `display: none`, so they stay in the accessibility tree.

**Changed files:**

- `apps/desktop/src/main/ui-scale.ts`
- `apps/desktop/tests/main/ui-scale.test.ts`
- `apps/web/src/styles/home/home-hero.css`
- `apps/web/tests/state/appearance.test.ts`


### 2026-08-04 — Put the navigation rail and the status bar on the screen

**Reason:** a reader compared the published screenshot to the mockup and said
the application still looked like the one it was forked from. They were right.
The colour layer had landed — every component resolves Material Design 3 roles
— but the mockup's structural furniture was not on screen, and structure is
what makes a screen read as Material Design 3 rather than as a recolour.

**The rail was mounted and invisible.** `EntryShell` rendered `EntryNavRail`
into a grid track whose collapsed width was literally `0`, with
`overflow: hidden`, `inert` and `aria-hidden` applied — present in the DOM,
absent from the screen — and the stored preference defaulted to closed, so a
fresh install showed no rail at all. "Collapsed" meant *gone*, which is a
drawer; a Material Design 3 navigation rail is persistent by definition.

It is now 88px as an icon rail and 260px with labels, the widths this
roadmap's Wave 1 already specified, narrowing to 72/216 below 900px. The
topbar control now means *widen* and the rail's own means *narrow*; neither
means *hide*. `inert` and `aria-hidden` are gone, because both were correct
while collapsing meant hiding and both now conceal a visible, operable
landmark from assistive technology. The stored preference deliberately keeps
its key and both values: `false` meant hidden and now means the icon rail,
`true` meant docked and now means labels, so the mapping is exact and renaming
the key would have discarded a real preference to say the same thing.

**The status bar did not exist.** It is now the shell's last row at the
mockup's 28px, carrying daemon state, model and execution mode, design system,
and right-aligned scale and density. The daemon dot always sits beside the
word naming the state, so colour is never the only channel, and only that
segment is a live region — announcing a scale the user just chose is noise.
The mockup's version segment is deliberately dropped: it arrives
asynchronously and a wrong version is worse than none.

**The header search bar was deliberately not attempted.** It needs a new
surface bound to the regex builder, a shortcut route into the command palette
and new filtering semantics — a third substantial blind change stacked on two,
with no way to typecheck any of them.

Four end-to-end tests changed meaning rather than breaking. Two of them
**asserted the defect**: one required `aria-hidden="true"` on the default
rail, and another was titled for the collapsed rail staying out of the tab
order. An assertion that pins a rail out of the layout is not a test that was
broken by this change; it is a test that was documenting the bug.

**Changed files:**

- `apps/web/src/App.tsx`
- `apps/web/src/components/AppStatusBar.tsx`
- `apps/web/src/components/AppStatusBar.module.css`
- `apps/web/src/components/EntryNavRail.tsx`
- `apps/web/src/components/EntryShell.tsx`
- `apps/web/src/styles/home/entry-layout.css`
- `apps/web/src/i18n/types.ts`
- `e2e/lib/playwright/rail.ts`
- `e2e/ui/critical-smoke.test.ts`
- `e2e/ui/entry-chrome-flows.test.ts`
- `e2e/ui/home-hero-rail.test.ts`


### 2026-08-04 — Capture nine named interface states instead of one, and prove each one before shooting it

**Reason:** the entire visual evidence base for a Material Design 3 redesign was
**one** screenshot — the home screen, default window, English, 100% scale. A
reader comparing that capture to the mockup could see the redesign had not
arrived; nothing automated could.

The packaged smoke test now captures the settings dialog, the command palette,
the home screen at 100/125/150/200% scale, bilingual mode, and both at a narrow
window. Scale and language are driven through the application's own persisted
appearance and locale stores and a reload, rather than through the operating
system, so the run does not mutate a shared machine.

Three properties matter more than the coverage. **Each state is verified before
it is photographed** — the scale variable actually on the document, Han
characters actually in the rendered text, the window actually at the narrower
width — with a sentinel that proves the reload happened, because a still-mounted
old document answers a probe perfectly well. **Nothing is skipped silently**: an
unreachable state produces no file, a named reason in the log, an entry in
`ui-states.json` and a workflow annotation, and capturing nothing at all fails
the suite, since that means the mechanism broke rather than one surface being
awkward. And **every frame is hashed**, because `capturePage` returns the last
composited frame — a stalled compositor could hand back the previous state's
pixels under a new name, which is a lie no assertion about the DOM can catch.

Two states were rejected rather than shipped shaky: a window narrower than
900px is impossible (the shell sets that as its minimum, documented as the
breakpoint where the layout clips), and opening settings on a named tab would
need an nth-child click, which is exactly the brittleness that must stay out of
a suite gating every push.

**Changed files:**

- `e2e/lib/vitest/packaged-ui-states.ts`
- `e2e/scripts/release-smoke.ts`
- `e2e/specs/win.spec.ts`

### 2026-08-04 — Gate the last ungated delete affordance, and two routes beside it

**Reason:** the confirmation gate was mounted on every route to a project
delete except one. `RecentProjectsStrip` — the home screen's own card menu —
used a plain one-button dialog while `DesignsTab` put the same operation, via
the same handler, behind two keys and a slider. **The route the user happened
to take decided the ceremony, and the shortest route had the least.**

Two adjacent daemon routes are now gated too, both chosen on the same
restorability test used before. `DELETE /api/projects/:id/folders` removes a
subtree and writes no revision, while the file delete beside it tombstones a
version manifest and stays restorable — same verb, opposite answer. Its token
binds to the **project and folder together**, because the folder arrives in the
body and a grant for one directory must not remove another.
`DELETE /api/design-systems/:id` is two operations sharing one URL: the
marketplace uninstall is re-installable from source and stays ungated, while a
user-authored system is a directory no history domain covers and is gated. The
mint route uses the user-file listing as both an existence check and a
"this is not the uninstall" check, so no token can be minted for a marketplace
id.

`od library rm` is deliberately **not** armed yet. Refusing today breaks every
existing script at an exit code callers read as "you typed it wrong" rather
than "the contract moved" — and a safety change that teaches people to write
`|| true` has made things worse. The flag is accepted and optional now, so
adopting it is safe across the change, with a notice naming the command that
will keep working; the arming step is written into the code for a release whose
notes can say so. The daemon's token already covers the operation meanwhile.

**Changed files:**

- `apps/daemon/src/routes/design-systems.ts`
- `apps/daemon/tests/design-systems/import-auto-rebuild-route.test.ts`
- `apps/daemon/tests/routes/design-systems-confirm-delete.test.ts`
- `apps/daemon/tests/routes/projects.test.ts`
- `apps/web/src/components/RecentProjectsStrip.tsx`
- `apps/web/tests/components/RecentProjectsStrip.destructive-gate.test.tsx`
- `apps/web/tests/lib/confirm-delete.test.ts`


### 2026-08-04 — Fix the animation mock that made five tests race, and one of them flaky

**Reason:** a test failed on a documentation-only commit and passed on a re-run
of the byte-identical tree — the definition of a flake, and a corrosive one now
that this suite gates every push, because an intermittent red trains readers to
re-run a gate instead of reading it.

The cause was not in the test. `tests/helpers/motion-mock.tsx` stands in for
the animation library, and its proxy **constructed a fresh `forwardRef`
component on every property read** — so `motion.div` was a different value each
time it was evaluated. The real library memoises. React reconciles function
components by identity, so a changed type unmounts the whole subtree: the
consent banner was being destroyed and recreated on *every render of `App`*.

A test that resolved `await screen.findByRole('button')` and then clicked that
node was therefore holding a reference that any unrelated bootstrap promise
could detach in the gap. React 18 delegates events at the root container, so a
click on a detached node reaches nothing — silently, with no error. The
assertion then failed on a call that never happened rather than on a wrong
argument, which is exactly what the reported failure said.

The mock now memoises per property name, matching the real library. Five cases
in the connectors suite shared the racy shape and all now query at click time
rather than holding a node across an await — belt and braces, since the mock
fix alone closes the window.

**Changed files:**

- `apps/web/tests/helpers/motion-mock.tsx`
- `apps/web/tests/components/App.connectors.test.tsx`

### 2026-08-04 — Move the destructive-action check out of the interfaces and into the handler

**Reason:** the standard is explicit that this is an authorization boundary and
that boundaries are enforced in the handler, never in the interface. It was
being enforced in the interfaces — and not two of them, as assumed, but
**three**: the web app's two-key-plus-slider gate, the `od` CLI's `--confirm`
flag, and an MCP tool's own `confirm: true`. Three independent gates and zero
boundaries, which is exactly the shape the standard warns about: anything that
is none of the three — a `curl`, a script, a third-party client — deleted
freely.

The three genuinely irreversible deletes now require a single-use confirmation
token, minted for that exact resource at `POST <resource>/confirm-delete` and
returned in an `x-od-confirm-token` header. Bound to kind and id, 120-second
expiry, consumed on success, in memory only so a restart invalidates
outstanding grants — an authorization that outlives its session is the wrong
failure. Refusal is 428 rather than 409 because these routes already return
409 for genuine write conflicts, and two different failures on one endpoint
should not be indistinguishable. The header is deliberate: access, proxy and
shell logs record method and URL.

**Which routes, and the line drawn.** Not "is it a DELETE" but **"can local
version history bring it back?"** — the registered history domains are the
authority. Gated: project (cancels in-flight runs, drops the row, removes the
whole directory), brand (removes the brand tree and the design system it
registered), and library asset (unlinks content-addressed bytes). Deliberately
**not** gated: memory entries, project files, templates, automations, BYOK
profiles, connector accounts and MCP servers all sit inside history domains
and restore. Gating a restorable delete adds ceremony without safety and
dilutes the signal that the gate means irreversible.

**What this does and does not prove.** The token does not establish that a
human moved a slider; the web app mints it at the moment of authorization and
spends it immediately. What it buys is that no caller reaches the operation in
one replayable request, and that every route converges on a single enforcement
point where policy can be strengthened later. That distinction is written into
the standard's own status rather than the row being ticked green.

Incidental fix found on the way: `deleteBrand` never checked the response was
ok, so a server error closed the gate reporting success.

**Changed files:**

- `apps/daemon/src/brand-routes.ts`
- `apps/daemon/src/cli.ts`
- `apps/daemon/src/http/confirm-delete.ts`
- `apps/daemon/src/mcp.ts`
- `apps/daemon/src/routes/library.ts`
- `apps/daemon/src/routes/project/index.ts`
- `apps/daemon/tests/cli-delete-confirmation.test.ts`
- `apps/daemon/tests/confirm-delete.test.ts`
- `apps/daemon/tests/delete-cancels-active-runs.test.ts`
- `apps/daemon/tests/helpers/confirm-delete.ts`
- `apps/daemon/tests/library-edit-as-page.test.ts`
- `apps/daemon/tests/mcp-spawn.test.ts`
- `apps/daemon/tests/mcp-write-tools.test.ts`
- `apps/daemon/tests/project-file-version-routes.test.ts`
- `apps/daemon/tests/project-preview-containment.test.ts`
- `apps/daemon/tests/routes/export-manifest.test.ts`
- `apps/web/src/components/BrandPreviewCard.tsx`
- `apps/web/src/lib/confirm-delete.ts`
- `apps/web/src/providers/registry.ts`
- `apps/web/src/state/projects.ts`
- `apps/web/tests/state/projects.test.ts`
- `e2e/lib/vitest/packaged-pty-smoke.ts`
- `packages/contracts/src/api/destructive-confirmation.ts`
- `packages/contracts/src/errors.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/tests/destructive-confirmation.test.ts`


### 2026-08-04 — Remove every blocking browser dialog from the web application

**Reason:** two standards were being broken by the same eighteen call sites.
Anything that only informs must be a non-blocking notification rather than a
modal that halts the application; and an irreversible action must go through
the super-confirmation gate. `window.confirm` and `window.alert` satisfy
neither — they freeze the application, they cannot be styled or localized, and
as a guard on a destructive action they are answered by a single stray Enter.

**Thirteen were irreversible destruction** and now route through the gate,
each naming the exact data it will destroy: clearing memory extractions,
deleting a routine, an automation, a conversation from two different surfaces,
a project file, a design-system project, a design system, a brand, and
clearing a media provider's stored credential — the last being a key the
application never shows again and cannot re-derive.

**One was a genuinely recoverable decision** and deliberately did *not* get
the gate: closing a sketch tab with unsaved work now asks through the shared
dialog primitive. Putting two keys and a slider in front of closing a tab is
exactly how a gate stops meaning anything. The terminal teardown moved out of
the asking path at the same time, so cancelling now changes nothing at all.

**Six were merely informational** and became notifications. The worst of them
told the user their pop-up had been blocked — in an alert that was itself
blocking them from reaching the browser control that would unblock it.

Several handlers were reshaped to return a real boolean rather than swallowing
their own failure, so a refused delete holds the gate open reporting what went
wrong instead of closing over a removal that never happened. Fifteen keys were
added across all twenty locales, with Cantonese written rather than inherited.

**Changed files:**

- `apps/web/src/components/BrandPreviewCard.tsx`
- `apps/web/src/components/ChatPane.tsx`
- `apps/web/src/components/ConversationsMenu.tsx`
- `apps/web/src/components/DesignFilesPanel.tsx`
- `apps/web/src/components/DesignSystemsTab.tsx`
- `apps/web/src/components/FileWorkspace.tsx`
- `apps/web/src/components/MemorySection.tsx`
- `apps/web/src/components/PreviewModal.tsx`
- `apps/web/src/components/RoutinesSection.tsx`
- `apps/web/src/components/SettingsDialog.tsx`
- `apps/web/src/components/SketchEditor.tsx`
- `apps/web/src/components/TasksView.tsx`
- `apps/web/src/i18n/locales/ar.ts`
- `apps/web/src/i18n/locales/de.ts`
- `apps/web/src/i18n/locales/en.ts`
- `apps/web/src/i18n/locales/es-ES.ts`
- `apps/web/src/i18n/locales/fa.ts`
- `apps/web/src/i18n/locales/fr.ts`
- `apps/web/src/i18n/locales/hu.ts`
- `apps/web/src/i18n/locales/id.ts`
- `apps/web/src/i18n/locales/it.ts`
- `apps/web/src/i18n/locales/ja.ts`
- `apps/web/src/i18n/locales/ko.ts`
- `apps/web/src/i18n/locales/pl.ts`
- `apps/web/src/i18n/locales/pt-BR.ts`
- `apps/web/src/i18n/locales/ru.ts`
- `apps/web/src/i18n/locales/th.ts`
- `apps/web/src/i18n/locales/tr.ts`
- `apps/web/src/i18n/locales/uk.ts`
- `apps/web/src/i18n/locales/zh-CN.ts`
- `apps/web/src/i18n/locales/zh-HK.ts`
- `apps/web/src/i18n/locales/zh-TW.ts`
- `apps/web/src/i18n/types.ts`
- `apps/web/src/runtime/exports.ts`
- `apps/web/tests/components/ConversationsMenu.destructive-gate.test.tsx`
- `apps/web/tests/components/MemorySection.test.tsx`
- `apps/web/tests/components/RoutinesSection.test.tsx`
- `apps/web/tests/components/SettingsDialog.execution.test.tsx`
- `apps/web/tests/components/SettingsDialog.media.test.tsx`
- `apps/web/tests/components/TasksView.analytics.test.tsx`
- `apps/web/tests/components/TasksView.page.test.tsx`
- `apps/web/tests/components/preview-modal-image-export.test.tsx`
- `apps/web/tests/runtime/exports.test.ts`
- `e2e/lib/playwright/destructive-gate.ts`
- `e2e/ui/app-design-files.test.ts`
- `e2e/ui/app-restoration.test.ts`
- `e2e/ui/app.test.ts`
- `e2e/ui/automations-page.test.ts`
- `e2e/ui/design-systems-manager.test.ts`
- `e2e/ui/settings-memory-routines.test.ts`


### 2026-08-04 — Route the memory and library deletions through the gate that already existed

**Reason:** an audit confirmed that irreversible deletions fired with no
confirmation at all while the same product gated others behind a two-key
slider. A gate that guards two doors of a dozen is closer to a false assurance
than to a safety feature.

**Memory entries** deleted the markdown file from disk and dropped its line
from the index, with no revision, no trash and no restore path — and no
confirmation whatsoever. Now gated, naming the entry's own title, its type and
what it currently says, so the user is reading the thing they are about to
lose rather than answering "are you sure".

**Library assets** had no confirmation on single delete, and a bulk dialog
that a stray Enter answered because its button was auto-focused. Both are
gated. The copy branches on how the asset is stored: an owned asset loses its
bytes, a referenced one keeps its file but loses the record and every piece of
enrichment on it — caption, OCR text, tags, palette. Both are marked
irreversible, because the record never comes back either way. The bulk gate
lists each asset by name, capped at twelve with an explicit remainder, since a
select-all can run to hundreds and would otherwise bury the keys and the
slider under a scroll.

**What was deliberately not gated**, because over-gating is how a gate stops
meaning anything: the extraction-record rows are a self-evicting twenty-entry
in-memory buffer that does not survive a daemon restart — its own header calls
it a UX surface rather than an audit log — and the memories it wrote are
separate files that outlive it. A regression test now pins that decision so it
is not quietly reversed.

Both call sites' confirm handlers now return a boolean, so a refused delete
holds the gate open reporting failure instead of closing over a removal that
did not happen.

**Changed files:**

- `apps/web/src/components/MemorySection.tsx`
- `apps/web/src/components/LibrarySection.tsx`
- `apps/web/src/i18n/types.ts`
- `apps/web/src/i18n/locales/ar.ts`
- `apps/web/src/i18n/locales/de.ts`
- `apps/web/src/i18n/locales/en.ts`
- `apps/web/src/i18n/locales/es-ES.ts`
- `apps/web/src/i18n/locales/fa.ts`
- `apps/web/src/i18n/locales/fr.ts`
- `apps/web/src/i18n/locales/hu.ts`
- `apps/web/src/i18n/locales/id.ts`
- `apps/web/src/i18n/locales/it.ts`
- `apps/web/src/i18n/locales/ja.ts`
- `apps/web/src/i18n/locales/ko.ts`
- `apps/web/src/i18n/locales/pl.ts`
- `apps/web/src/i18n/locales/pt-BR.ts`
- `apps/web/src/i18n/locales/ru.ts`
- `apps/web/src/i18n/locales/th.ts`
- `apps/web/src/i18n/locales/tr.ts`
- `apps/web/src/i18n/locales/uk.ts`
- `apps/web/src/i18n/locales/zh-CN.ts`
- `apps/web/src/i18n/locales/zh-HK.ts`
- `apps/web/src/i18n/locales/zh-TW.ts`
- `apps/web/tests/components/MemorySection.test.tsx`
- `apps/web/tests/components/LibrarySection.delete-gate.test.tsx`

### 2026-08-04 — Add the four colour spaces the translator never had, and stop it overstating losslessness

**Reason:** the appearance standard requires bidirectional conversion across
named, hex and hex-with-alpha, RGB/RGBA, HSL/HSLA, HSV/HSB, HWB, **CIELAB and
LCH, OKLab and OKLCH**, and CMYK. Four of those were absent outright: the
translator offered ten representations, none of them from the Lab family, and
typing `oklch(…)` into the entry field was rejected as invalid.

The perceptual stack is now real: the sRGB transfer function, linear sRGB ↔ CIE
XYZ, Bradford chromatic adaptation, CIELAB and LCH, and OKLab and OKLCH with
Ottosson's matrices. `lab()` and `lch()` are computed against **D50** and
`oklab()`/`oklch()` against D65, because CSS Color 4 defines them that way —
emitting D65 numbers inside a `lab()` string produces a well-formed value that
a browser renders as a *different colour*, which is exactly the silent
surprise this module's loss machinery exists to prevent.

The arithmetic is checked against published reference values rather than
against itself; that cross-check caught a wrong digit in the Bradford D50→D65
matrix, which had been pushing D50 white to Z = 1.0579 instead of 1.08883.

Two honesty fixes came with it. The **Name** row hard-coded its loss and so
reported a clean round trip while the HEX row it is derived from reported
rounding for the very same colour. And **alpha was exempt from every
round-trip check**, so HEX8, RGBA, HSLA and HWB claimed a losslessness that
had never been tested — alpha `0.5` survives a hex byte as `0.50196`, which is
a real loss the panel was silent about.

Also fixed here: `parseColor` indexed the named-colour map without an
ownership check. The map is a plain object literal, so typing `constructor`,
`toString` or `__proto__` into the colour field returned an inherited
function, which is truthy, which reached the hex parser and threw
`text.trim is not a function` out of a React change handler — breaking the
function's own documented promise never to throw. The field parses on every
keystroke, so a paste was enough.

The module had **no test file at all** before this, which is the same fact as
it having held five of the seven confirmed audit findings.

**Changed files:**

- `apps/web/src/components/appearance/color.ts`
- `apps/web/src/components/appearance/translate.ts`
- `apps/web/tests/components/appearance/color.test.ts`
- `apps/web/tests/components/appearance/translate.test.ts`

### 2026-08-04 — Close the confirmation gate's five defects, and gate the CLI it was reaching around

**Reason:** an adversarial audit confirmed the gate could be defeated, and a
verification pass then confirmed the `od` CLI bypassed it entirely.

**The gate's own defects.** Armed keys survived a target swap, so keys operated
for one action stayed engaged when the gate was re-pointed at the next; the
surface is now keyed on the action's identity, so a new target mounts fresh
while an equal-but-new items array does not reset it. The "full-range" slider
was satisfiable in a single gesture — one far-end click or one `End` press —
and now rations forward travel to a fifth of the range per input event, so
reaching the end costs at least five deliberate advances however it is driven.
Retreat stays unrationed, because abandoning the travel must never be work, and
the keyboard path stays fully operable: arrows still step, `End` still works
and is simply pressed again. Dismissing mid-flight discarded the action's
failure, which is now raised as a notification rather than dropped. Escape and
the emergency exit reported `cancelled` for an action that had already begun,
which was a false statement about the user's data; the outcome union gained
`dismissed` to say the true thing. Focus now returns to the originating control
before `onClose` on every path, guarded so it never yanks focus from somewhere
the host deliberately moved it.

**The CLI.** `od project|files|brand|templates|automation delete` executed
irreversible deletions with no confirmation of any kind, while the web
interface gated the same operations behind the two-key slider — so the CLI
reached the daemon route around the gate. All five now refuse without
`--confirm`, mirroring the `od plugin events purge` precedent already in the
file: same flag name, same exit code, same refusal shape. The refusal names
what would be deleted and prints the exact command that would proceed, emits
the CLI's standard JSON error envelope under `--json`, and fires before the
request, so a refused delete makes no HTTP call at all.

This is enforcement in two interfaces rather than at the operation, which the
standard asks for and this does not yet achieve — the daemon route still
accepts the call from any caller. Recorded in
`docs/standards/super-confirmation.md` rather than implied to be finished.

**Changed files:**

- `apps/web/src/components/destructive/DestructiveGate.tsx`
- `apps/web/src/components/destructive/gateMachine.ts`
- `apps/web/tests/components/destructive/gateMachine.test.ts`
- `apps/web/tests/components/destructive/DestructiveGate.test.tsx`
- `apps/web/tests/components/DesignsTab.select-mode.test.tsx`
- `apps/daemon/src/cli.ts`
- `apps/daemon/src/cli-help/brands-cli-help.ts`
- `apps/daemon/tests/cli-delete-confirmation.test.ts`
- `apps/daemon/tests/cli-templates.test.ts`

### 2026-08-04 — Make the appearance editor and its infinite colour picker reachable

**Reason:** both were written, typechecking, shipping in the bundle, and
mounted by nothing — an audit found zero importers for either. A module no
surface mounts is not a shipped feature, whatever its files contain.

`InfiniteColorPicker` is now the accent control in the settings dialog's
appearance section: a continuous two-dimensional field with hue, saturation,
brightness and alpha axes, typed entry, numeric channel entry, the colour-space
translation table with copy, and a contrast readout. The nine fixed swatches
stay exactly as they were — the standard wants swatches layered on a continuous
picker, never replacing one. The `<input type="color">` that reached the same
space through the operating system's own picker is gone, superseded.

`AppearanceRuntime` is mounted in `App.tsx` rather than inside the dialog. It
renders nothing and applies the persisted seed, density, scale and typography
in a layout effect; mounted in the dialog it would only take effect while that
dialog was open, so a chosen preset silently reverted on the next reload. It
also drives a presets row wired to the built-in presets, a third module that
had no consumer.

One new key, `appearance.presets`, added to the `Dict` and all twenty locales.

**Changed files:**

- `apps/web/src/App.tsx`
- `apps/web/src/components/SettingsDialog.tsx`
- `apps/web/src/components/appearance/color.ts`
- `apps/web/src/i18n/types.ts`
- `apps/web/src/i18n/locales/ar.ts`
- `apps/web/src/i18n/locales/de.ts`
- `apps/web/src/i18n/locales/en.ts`
- `apps/web/src/i18n/locales/es-ES.ts`
- `apps/web/src/i18n/locales/fa.ts`
- `apps/web/src/i18n/locales/fr.ts`
- `apps/web/src/i18n/locales/hu.ts`
- `apps/web/src/i18n/locales/id.ts`
- `apps/web/src/i18n/locales/it.ts`
- `apps/web/src/i18n/locales/ja.ts`
- `apps/web/src/i18n/locales/ko.ts`
- `apps/web/src/i18n/locales/pl.ts`
- `apps/web/src/i18n/locales/pt-BR.ts`
- `apps/web/src/i18n/locales/ru.ts`
- `apps/web/src/i18n/locales/th.ts`
- `apps/web/src/i18n/locales/tr.ts`
- `apps/web/src/i18n/locales/uk.ts`
- `apps/web/src/i18n/locales/zh-CN.ts`
- `apps/web/src/i18n/locales/zh-HK.ts`
- `apps/web/src/i18n/locales/zh-TW.ts`
- `apps/web/tests/components/AppearanceEditor.test.tsx`

### 2026-08-04 — Green the five web suites that had never been run, and make the suite a gate

**Reason:** wiring the web suite into continuous integration made it run for
the first time in this repository's history: **454 of 459 files passed**. All
five failures were pre-existing, and fixing them turns the largest suite in
the workspace from decoration into a gate.

Four were tests describing behaviour the product had deliberately moved on
from, each failing because nothing had run them since the change landed:

- **`DesignFilesPanel`** clicked batch-delete and expected the delete callback
  immediately. Bulk delete now opens a preview dialog first — which is the
  entire point of that dialog — and the callback gained an options argument.
- **`DesignFilesPanel`** queried a row-menu item by the `button` role. Menu
  items are now `<button role="menuitem">`, and an explicit role overrides the
  implicit one: the markup got more correct and the query got stale.
- **`WorkspaceTabsBar`** expected a cross-region tab drop to resolve to "after
  Home". A drag is now confined to its own region and the entry tab is the
  sole member of its own, so the drop is skipped entirely. Home still stays
  leftmost, which is what the test is named for and now asserts directly.
- **`changelog-parse`** expected a folded bullet to lose the full stop that
  closes its sentence. The period sits outside the commit-link parenthetical,
  so it correctly survives the link's removal.

One was a mistaken fixture: **`dim-sum`** interleaved a selecting roll after
each deciding roll, but a losing draw short-circuits and consumes only one —
so the second draw's *deciding* roll became the `0` meant as a selector, and
`0` wins. It now supplies one roll per losing draw and asserts the roll count,
which is what actually proves the short-circuit.

One was a genuine defect: **`buildHighlightSegments`** let zero-width matches
advance the cursor, so `/(?:)/g` over `"ab"` emitted `"a"` and `"b"` as two
adjacent unhighlighted runs instead of one `"ab"`. They render identically and
are not the same — the function owes its caller the invariant that no two
adjacent segments are both plain.

**Changed files:**

- `apps/web/src/components/regex/evaluate.ts`
- `apps/web/tests/dim-sum.test.ts`
- `apps/web/tests/changelog-parse.test.ts`
- `apps/web/tests/components/DesignFilesPanel.test.tsx`
- `apps/web/tests/components/WorkspaceTabsBar.test.tsx`

### 2026-08-04 — Declare the changelog test's fixture paths to the guard that flagged them

**Reason:** wiring `pnpm guard` into continuous integration — where it had
never run — immediately caught something this fork introduced. An earlier
change to `apps/web/tests/changelog-parse.test.ts` gave its two in-memory
fixtures `path` values naming real files under `docs/CHANGELOG/`, a surface
upstream classifies as certain-tier exempt and requires skippable merge-gate
lanes to leave unconsumed.

The consumption is nominal rather than real: those strings are the provenance
field of `ChangelogSourceFile` objects constructed inside the test, and the
parser only carries the value through to `buildRelease`. No changelog file is
opened. Upstream's check offers exactly two remedies — move the dependency, or
record a justified allowlist entry — and since there is no dependency to move,
this is the second, written in the same form as the three entries beside it.

Rewriting the fixture paths to dodge the literal scanner was considered and
rejected: it would have satisfied the check without changing what the test
does, which is gaming a gate rather than answering it.

**Changed files:**

- `scripts/check-certain-exempt-consumption.ts`

### 2026-08-04 — Make the shared dialog keep the promise its own markup makes

**Reason:** every dialog in the application renders `aria-modal="true"`, which
tells assistive technology the rest of the page is inert. Nothing enforced it.
Tab walked straight out of the dialog onto the controls behind the backdrop —
visually obscured, still focusable, and in the case of a confirmation dialog
the exact controls the user had just been asked to stop and think about.

Focus is now moved to the first tab stop when a dialog opens, kept inside it
by Tab and Shift+Tab, pulled back if something moves it out, and returned to
whichever control opened the dialog when it closes. Because this is the shared
primitive, every dialog gains the behaviour at once.

The visibility filter deliberately tests attributes rather than layout:
`offsetParent` is the better check in a browser and is always null under
jsdom, where these tests run, so a layout-based filter would conclude nothing
is focusable in precisely the environment that asserts the behaviour.

**Changed files:**

- `packages/components/src/dialog.tsx`
- `packages/components/tests/Dialog.test.tsx`

### 2026-08-04 — Give the spoken narrator a surface a user can actually reach

**Reason:** the narrator shipped as unreachable code. Every piece existed —
the serialized queue, the per-category cooldown, the screen-reader yield, the
preference store, the settings panel, and 19 dictionary keys in all twenty
locales — and nothing mounted any of it. `NarratorSettingsPanel` had zero
importers, so no user could turn it on however hard they looked.

It was also unmountable rather than merely unmounted: the panel imports
`NarratorSettingsPanel.module.css`, and that file did not exist. Wiring it up
without writing the stylesheet would have failed the build, which is the most
likely reason it was left unwired in the first place.

The panel is now its own section in the settings dialog, and the command
palette indexes it: the section, the on/off switch and the spoken-language
select, the latter two as live inline controls that change the real store
rather than links to it. The language label map moved into `settings.ts` so
the panel and the palette cannot drift into calling the same three languages
different things.

**Changed files:**

- `apps/web/src/components/narrator/NarratorSettingsPanel.module.css`
- `apps/web/src/components/narrator/NarratorSettingsPanel.tsx`
- `apps/web/src/components/narrator/settings.ts`
- `apps/web/src/components/SettingsDialog.tsx`
- `apps/web/src/components/command-palette/CommandPalette.tsx`
- `apps/web/src/components/command-palette/settingsIndex.ts`

### 2026-08-04 — Make the Design Files bulk delete report what actually happened

**Reason:** the bulk delete told the user it had succeeded whatever it did.
`handleDeleteMany` returned nothing, so the panel took its documented "a
parent that reports nothing back is not evidence of success" branch — which
then claimed every selected item succeeded. A delete the user cancelled at
the confirmation, and a delete where every file was refused, both produced
"N done." The same call site dropped the panel's `options` argument, so the
progress bar stayed frozen at zero and the Stop control was decorative.

The loop is now the shared `runBulkAction` runner rather than a second
hand-rolled one: it checks the abort signal between files, reports progress
against the file in flight, and counts a helper that resolves `false` as a
failure — which `deleteProjectFile` does on every refusal. The redundant
native `confirm()` is gone with it; the panel's own preview dialog is the
confirmation, and the two together asked twice.

**Changed files:**

- `apps/web/src/components/FileWorkspace.tsx`
- `apps/web/src/components/DesignFilesPanel.tsx`
- `apps/web/tests/components/bulk/run.test.ts`

### 2026-08-04 — Bundle the Cairo face, and end the application's one network font request

**Reason:** every asset ships locally. The web application's stylesheet began
with an `@import` of a font CDN stylesheet — the single network font request
in the shipped product, and the one the roadmap's asset standard called out.
The three variable-font subsets that stylesheet served (weight axis 400–700:
arabic, latin-ext, latin) are now bundled under `public/fonts/cairo/` exactly
as `remixicon.woff2` already is, with the served `unicode-range` values copied
verbatim so per-page subsetting keeps working. The import line now points at
the local `@font-face` sheet; rendering is unchanged, the request is gone.

**Changed files:**

- `apps/web/src/index.css`
- `apps/web/src/styles/cairo.css`
- `apps/web/public/fonts/cairo/cairo-arabic.woff2`
- `apps/web/public/fonts/cairo/cairo-latin-ext.woff2`
- `apps/web/public/fonts/cairo/cairo-latin.woff2`

### 2026-08-04 — The 124 keys the notification, gate, bulk, colour and narrator surfaces were written against

**Reason:** the same gate as the entry below, one merge later. The notification
centre and its corner stack, the destructive-action super-confirmation gate,
the bulk-action bar and preview dialog, the infinite colour picker with its
translator, and the spoken narrator were all built against a dictionary they
did not write into, for the same reason as before: five agents appending to
twenty locale files at once produces twenty conflicts and no translations worth
keeping. This entry lands their keys.

**Fifteen of the 124 are invisible to a `t('…')` grep**, and they fail the
build exactly as hard as the rest. `SEVERITY_LABEL_KEYS` in
`notifications/NotificationHost.tsx` is a `Record<NotificationSeverity, …>`
constrained to the translator's key type, so its five severity labels never
appear as a literal argument. `LANGUAGE_LABEL` in
`narrator/NarratorSettingsPanel.tsx` is the same shape for the three spoken
languages. `BuiltInPreset.nameKey` in `appearance/presets.ts` is a union of six
preset-name keys. And `narrator.sample` reaches the dictionary through
`narrate(key: keyof Dict, …)` rather than through `t()`. The scripted check
reports 109; the real number is 124, and the difference was found by reading
every dotted string literal in `apps/web/src` and asking which of them are key
names rather than hostnames, filenames, setting ids or shortcut ids.

**A duplicate that the merge introduced.** `dimSum.blurb` was declared twice in
the `Dict` interface — TypeScript rejects a repeated property, so this was a
live build failure independent of the missing keys. The second declaration and
its redundant comment were removed; the first, and the single entry each locale
already carried, are untouched.

**Twenty locales, translated rather than seeded.** Each locale uses its own
conventional software vocabulary — *Sättigung* / *saturation* / *nasycenie* /
飽和度 for the colour axis, *Notausstieg* / *sortie de secours* / *wyjście
awaryjne* for the gate's emergency exit, and each language's real term for a
screen reader, a swatch and a hue. The only strings that match English exactly
are ones that genuinely are the same word in that language (*Alpha* in German,
*Saturation* and *Violet* in French, *Info* where the abbreviation is native)
plus `appearance.color.spaceSrgb`, which is the identifier `sRGB` everywhere.

**The gate's copy states the facts in every language.** `destructive.
irreversible` says the listed items are destroyed for good, `destructive.
reversible` says the action can be undone from version history, and
`designs.deleteGateProjectDetail` says the project folder leaves the disk with
its history — in all twenty locales, without hedging and without a joke
standing in for the fact. `privacy.deleteGateIdItem` prints the real
installation id through `{id}` so the user reads the value being discarded.

**Placeholder parity is checked, not assumed.** Every `{placeholder}` in the
124 keys was extracted per locale and compared as a set against English: all
twenty agree exactly on every key. Thirteen strings order their placeholders
differently from English — `bulk.progress` reads "{total} 件中 {done} 件完了" in
Japanese — which is a sentence-order choice the named-placeholder interpolator
handles, not a dropped value.

**`zh-HK` gets all 124 explicitly**, appended after the `...zhTW` spread so its
own entries win. Letting Cantonese-authored copy arrive through the spread
would ship Traditional Mandarin phrasing on a brand-new surface. It now holds
968 of its own entries and inherits the remaining 3,573.

**Verified by reading**, since this tree cannot run a typechecker: the `Dict`
interface parses to 4,541 unique keys with no duplicates, each of the twenty
locale dictionaries resolves all 4,541 — nineteen directly, `zh-HK` as 968 own
plus 3,573 inherited — and no locale file declares any key twice. Each file
kept its own quote style: single quotes everywhere except `zh-CN`, `zh-TW` and
`zh-HK`, which use double. `scripts/check-i18n-keys.sh` reports zero
used-but-undeclared keys and every locale complete.

**Changed files:**

- `apps/web/src/i18n/locales/ar.ts`
- `apps/web/src/i18n/locales/de.ts`
- `apps/web/src/i18n/locales/en.ts`
- `apps/web/src/i18n/locales/es-ES.ts`
- `apps/web/src/i18n/locales/fa.ts`
- `apps/web/src/i18n/locales/fr.ts`
- `apps/web/src/i18n/locales/hu.ts`
- `apps/web/src/i18n/locales/id.ts`
- `apps/web/src/i18n/locales/it.ts`
- `apps/web/src/i18n/locales/ja.ts`
- `apps/web/src/i18n/locales/ko.ts`
- `apps/web/src/i18n/locales/pl.ts`
- `apps/web/src/i18n/locales/pt-BR.ts`
- `apps/web/src/i18n/locales/ru.ts`
- `apps/web/src/i18n/locales/th.ts`
- `apps/web/src/i18n/locales/tr.ts`
- `apps/web/src/i18n/locales/uk.ts`
- `apps/web/src/i18n/locales/zh-CN.ts`
- `apps/web/src/i18n/locales/zh-HK.ts`
- `apps/web/src/i18n/locales/zh-TW.ts`
- `apps/web/src/i18n/types.ts`

### 2026-08-04 — The 205 keys the four new surfaces were written against

**Reason:** `i18n/types.ts` declares a flat `Dict`, and a key missing from any
one locale is a type error rather than a runtime fallback. That gate is the
reason the surface work above — the regex builder, the dim sum surprise, the
changelog viewer, the command palette, and tab pinning with bulk close — was
built without touching the dictionaries: four agents writing into twenty files
at once would have produced twenty merge conflicts and no translations worth
having. They reported the keys instead. This entry lands them.

**What the keys were checked against, not just what was reported.** The
reported list was diffed against every translation lookup in the new and
changed components, including the ones that never reach a bare `t('…')` call —
`Record<Flag, keyof Dict>` label maps, `labelKey`/`titleKey`/`hintKey` fields in
the palette's command registry and settings index, and the sparse
`FunnyOverrides` maps, all of which are typed as `keyof Dict` and so fail the
build exactly as hard as a direct call. The two sets agreed exactly: 205 keys
used, 205 keys reported, none used-but-unreported and none reported-but-unused.
Nothing was invented to cover a gap, because there was no gap.

**Twenty locales, translated rather than seeded.** Every locale carries a real
translation in its own language, using that language's conventional term for
the technical nouns — *reguläres Ausdruck* / *expression régulière* /
*wyrażenie regularne* / 正規表示式 / 정규식 for the engine's own vocabulary,
*Erfassungsgruppen* / *groupes de capture* / *grupos de captura* /
キャプチャグループ for capture groups, and the platform-conventional name for a
command palette in each. English is the reported copy; `zh-HK` is the reported
Cantonese. No locale received English text as a placeholder.

**Placeholder parity is checked, not assumed.** Every `{placeholder}` in a
translated string was compared against the English source before the write, in
all twenty locales — a missing `{count}` renders a sentence that silently drops
its number, which is precisely the failure the funny-level rules forbid. Two
strings are deliberately identical everywhere: `changelog.datePlaceholder` is
the format mask `YYYY-MM-DD` rather than prose, and `changelog.commitSummarizes`
keeps its literal `{count}` because the export renderer substitutes it per entry
instead of through `t()`.

**`zh-HK` gets the 205 keys explicitly**, even though it spreads `zh-TW` and
would satisfy the `Dict` gate without them. The spread exists to inherit
Traditional Chinese for keys nobody has rewritten yet, and letting a key that
*has* Cantonese copy arrive through it would have quietly shipped Mandarin
phrasing on a brand-new surface. It now holds 844 of its own entries and
inherits the remaining 3,655.

**Verified by reading**, since this tree cannot run a typechecker: the `Dict`
interface parses to 4,499 unique keys with no duplicates, and each of the
twenty locale dictionaries resolves all 4,499 with zero extras — nineteen
directly, `zh-HK` as 844 own plus 3,655 inherited. Every appended line was then
tokenised as a JS string literal pair to prove the quoting closes: 4,100 new
entry lines — 205 keys in each of the twenty locales — plus the 205 matching
`Dict` declarations, zero malformed. Each file kept its own quote style —
single quotes everywhere except `zh-CN`, `zh-TW` and `zh-HK`, which use double.

**Changed files:**

- `apps/web/src/i18n/locales/ar.ts`
- `apps/web/src/i18n/locales/de.ts`
- `apps/web/src/i18n/locales/en.ts`
- `apps/web/src/i18n/locales/es-ES.ts`
- `apps/web/src/i18n/locales/fa.ts`
- `apps/web/src/i18n/locales/fr.ts`
- `apps/web/src/i18n/locales/hu.ts`
- `apps/web/src/i18n/locales/id.ts`
- `apps/web/src/i18n/locales/it.ts`
- `apps/web/src/i18n/locales/ja.ts`
- `apps/web/src/i18n/locales/ko.ts`
- `apps/web/src/i18n/locales/pl.ts`
- `apps/web/src/i18n/locales/pt-BR.ts`
- `apps/web/src/i18n/locales/ru.ts`
- `apps/web/src/i18n/locales/th.ts`
- `apps/web/src/i18n/locales/tr.ts`
- `apps/web/src/i18n/locales/uk.ts`
- `apps/web/src/i18n/locales/zh-CN.ts`
- `apps/web/src/i18n/locales/zh-HK.ts`
- `apps/web/src/i18n/locales/zh-TW.ts`
- `apps/web/src/i18n/types.ts`

### 2026-08-04 — A command palette, and tabs you can pin and close in bulk

**Reason:** two gaps that look unrelated and are the same gap. The app had a
quick switcher for files and a tab strip that could reorder and overflow, and
in both cases the thing a user actually wanted — "take me to that setting",
"keep these four tabs and close the other thirty" — was not reachable from
either. This adds the surface that answers the first and the two tab
operations that answer the second.

#### The palette is a second surface, not a bigger quick switcher

`components/QuickSwitcher.tsx` is untouched. It keeps Cmd/Ctrl+P, its own
overlay, its own recents and its own scoring, because it is the one people hit
dozens of times an hour and it is already good at its job. The palette takes
**Cmd/Ctrl+Shift+P** and exposes the quick switcher as one *scope* inside it,
by borrowing rather than copying: `command-palette/quickSwitcherScope.ts`
imports `scoreMatch` and `scoreWorkspaceContextMatch` from the quick switcher
itself, so the two surfaces cannot rank the same query differently.

The file list reaches the palette through a small publish store rather than a
prop. `FileWorkspace` is the only component that knows the project's files, the
palette mounts at the app shell above every route, and threading the list up
would have meant a prop drilled through every view that does not care. The
workspace publishes while mounted and withdraws on unmount; the palette says so
honestly when nothing is published instead of showing an empty list. The two
openers travel in a ref rather than the dependency array — publishing every
render would churn every subscriber for no new data, and capturing them once
would open files against a stale snapshot of the workspace.

#### The settings index, and the drift it is designed to fail on

`SettingsDialog.tsx` renders nineteen sections as nineteen bespoke JSX trees.
There is no declarative table to walk, so `command-palette/settingsIndex.ts` is
that table, written by hand — and the risk a hand-written index carries is that
a section added next month is never indexed, leaving a palette that swears a
setting does not exist. Two guards, at two different times:

- **Compile time** — `SETTINGS_SECTION_TOKENS` is a `Record<SettingsSection, true>`.
  A new token that is not listed fails typecheck; a listed token that no longer
  exists fails too.
- **Test time** — `tests/components/CommandPalette.settings-index.test.ts`
  asserts every token in that record has at least one index entry. The record
  can be kept exhaustive by rote; that test is what makes someone actually
  write the entry.

The same suite also pins every `titleKey`/`hintKey` to a key that exists in the
English dictionary, so an index entry can never render a key name back at the
user.

#### A row that is a setting renders the setting

Ten index entries carry a `control`, and those rows render the real control
inline — a `<select>` for the theme, the accent and the locale, a `role="switch"`
for the notification, pet and telemetry booleans, a range input for each
funny-level slider. They are not copies: config-backed controls write through
the same `handleConfigPersist` autosave path the Settings dialog uses, and the
i18n-backed ones call the provider's own setters. The `SettingsControlId` union
is switched exhaustively with a `never` fallthrough, so adding an id to the
index without teaching the component about it is a typecheck error rather than
a row that quietly renders nothing.

#### Selecting a destination finishes the journey

`command-palette/reveal.ts` is the part that makes "teleport" mean something.
The palette records an anchor, the dialog opens, and the reveal scrolls the
exact control into view, moves focus to it and flashes it for 1.6s
(`.od-reveal-flash`, declared in `styles/primitives.css` because the targets are
arbitrary controls all over the app that the applying module does not own; an
`outline` rather than a border or shadow, so flashing a control cannot nudge the
form around it by a pixel).

Three details are load-bearing:

1. **The request is made before the surface opens**, because the control does
   not exist yet — the dialog mounts a frame later and the section's content
   later still. So `revealAnchor` polls for the node with a 2s deadline instead
   of assuming one frame is enough, and gives up quietly rather than throwing.
2. **Two consumers, one request.** A `[activeSection]` effect covers "the dialog
   was closed and is opening now"; a `SETTINGS_REVEAL_EVENT` listener covers
   "the dialog is already open on another section", which would otherwise do
   nothing visible — the worst failure mode, because it looks broken exactly
   when the user is already on the right screen. `takePendingSettingsReveal`
   consumes once, so whichever runs first wins and the other finds nothing.
3. **The reveal is armed on a `requestAnimationFrame`**, after the section's own
   `scrollTop = 0` reset, or the reset would scroll the revealed control away
   the instant it arrived.

Anchors are `data-od-setting` attributes. Section-level entries anchor on
`section:<token>`, stamped **once** on `.settings-content` from the live section
rather than nineteen times, so those cannot drift one attribute at a time;
individual controls carry their own and take precedence. Two of them live
outside `SettingsDialog.tsx` because the controls do (`pet/PetSettings.tsx`,
and `PrivacySection.tsx` where `ToggleRow` gained an optional `anchor` prop
rather than have the anchor land on a container holding two toggles).

App clears any leftover reveal request when the palette **opens**, never when it
closes: choosing a settings row arms the anchor and closes the palette in the
same commit, so clearing on close would race the request the user just made.

#### Size, focus and the keyboard

The palette opens as a **bounded card** and offers a **full-window** mode, and
the choice is persisted (`open-design:command-palette:display-mode`). The card
is the default because a search box that swallows the whole window is startling
on a large display and worse when opened by accident.

Focus returns where it came from on Escape — and the previously-focused element
is captured in the `useRef` **initializer**, during the first render, not in an
effect: the input's ref callback focuses it and ref callbacks run before passive
effects, so an effect would faithfully record the palette's own input as "where
focus came from". An action that navigates somewhere deliberately does *not*
restore focus, because the reveal has just moved it onto the control the user
asked for.

Scopes are reachable from chips, from a one-character prefix (`>` commands,
`@` settings, `/` destinations, `#` files) and from Cmd/Ctrl+Tab. Plain Tab is
deliberately not intercepted: it has to reach the highlighted row's live
control, which is why only the highlighted row's control is tabbable.

#### Tabs: pinning

Pinned tabs get a **sticky region** rather than a sticky class per tab, because
several `position: sticky; left: 0` siblings all stack at the same coordinate
and overlap. The region holds the permanent entry tab plus the user-pinned ones
and is `role="presentation"`, so the tablist still owns the tabs directly in the
accessibility tree. A sticky child of an always-flush-left sticky parent
computes to the same position, so the entry tab's existing `.is-pinned` rule
needed no override.

User-pinned tabs render **icon-only** — 34px in the entry shell, 36px in the
project shell — and the label is *clipped*, not removed: the main button carries
the full title as its `aria-label` and its tooltip, so the compact form loses
nothing to a screen reader, the keyboard or a pointer. The width is restated in
`styles/viewer/routines.css` for the same reason `.is-pinned` already is —
`.workspace-shell .workspace-tab` sets it at equal specificity from a stylesheet
imported later.

Dragging is now confined to its own region (permanent / pinned / flow). A
cross-region target is *skipped* rather than coerced, so the live drop indicator
says exactly what the drop will do; `normalizeTabsState` would re-sort a
cross-region drop straight back, and an indicator that promises a move which
then does not happen is worse than no indicator. This subsumes the old "never
drop before the entry tab" coercion, since that tab is now the only member of
its region.

#### Tabs: bulk close, as one predicate

`workspace-tabs/bulkClose.ts` exists so that "close tabs containing text" and
"close tabs NOT containing text" cannot drift. Written as two matchers they do:
one lowercases and the other forgets, one compiles with `i` and the other does
not, and a user who runs the second expecting the complement of the first loses
tabs the preview said were safe. So `compileBulkCloseMatcher` produces exactly
one `test`, and `planBulkClose` picks with
`direction === 'containing' ? test(label) : !test(label)`. There is no second
call site where a flag could diverge, and the test asserts the partition
property directly: for every query, the two directions' selections union to the
whole tab list and intersect to nothing.

It never runs on an empty query (which would match everything in "not
containing" mode — a way to close the workspace by pressing a button twice), on
a pattern past 200 characters, or on one that does not compile; the reason comes
back as a token so the component owns the copy. Matching reads the tab's visible
label and nothing else, because a bulk close that matched on data the user
cannot see would be unreviewable by construction.

`selected` and `close` are separate fields on purpose: "42 selected" and "42
will close" are different claims, and a preview that showed only the second
would hide the pinned tabs the action is about to skip. Pinned tabs are excluded
by default with an explicit opt-in, the permanent entry tab is never closable,
and both exclusions are reported by count under the preview rather than dropped.

Closing runs through one `closeTabs` call rather than a loop of `closeTab`:
sequential calls each read the render-time `state` snapshot, so the second would
resurrect the tab the first removed.

#### Tabs: persistence that tolerates the shape it finds

Pins live in the **same** localStorage payload as the tabs, not a second key. A
workspace that restored its tabs but lost its pins (or the reverse) is worse
than one that lost both, because the strip then looks right and behaves wrong.
`workspace-tabs/tabPinning.ts` reads a v1 payload (no `pinnedTabIds`) and a v2
payload through one total function, and trusts nothing in either: non-strings,
duplicates, blanks and ids for tabs that no longer exist are all dropped rather
than thrown on. Reconciliation runs on every `normalizeTabsState`, not only on
load, so a pin survives a tab being closed in another window — and it runs
*after* the existing duplicate-id rewrite, so a pin can never point at an id
that was just regenerated.

That change also required auditing every `setState` in the strip: five of them
rebuilt `{ tabs, activeTabId }` as a fresh literal, which would have unpinned
the workspace on the next tab switch, navigation or close. They now spread the
normalized state. `pinnedTabIds` is optional on `WorkspaceTabsState` precisely
so the remaining literals stay valid.

**Not changed, deliberately:** the tab strip's hardcoded English chrome
("Search tabs", "Open tabs", "New tab", "No tabs found") is pre-existing and out
of scope for this entry; the new controls beside it are translated.

**Changed files:**

- `apps/web/src/App.tsx`
- `apps/web/src/components/FileWorkspace.tsx`
- `apps/web/src/components/PrivacySection.tsx`
- `apps/web/src/components/SettingsDialog.tsx`
- `apps/web/src/components/WorkspaceTabsBar.module.css`
- `apps/web/src/components/WorkspaceTabsBar.tsx`
- `apps/web/src/components/command-palette/CommandPalette.module.css`
- `apps/web/src/components/command-palette/CommandPalette.tsx`
- `apps/web/src/components/command-palette/commands.ts`
- `apps/web/src/components/command-palette/quickSwitcherScope.ts`
- `apps/web/src/components/command-palette/reveal.ts`
- `apps/web/src/components/command-palette/settingsIndex.ts`
- `apps/web/src/components/pet/PetSettings.tsx`
- `apps/web/src/components/workspace-tabs/bulkClose.ts`
- `apps/web/src/components/workspace-tabs/tabPinning.ts`
- `apps/web/src/styles/primitives.css`
- `apps/web/src/styles/shell.css`
- `apps/web/src/styles/viewer/routines.css`
- `apps/web/tests/components/CommandPalette.settings-index.test.ts`
- `apps/web/tests/components/CommandPalette.test.tsx`
- `apps/web/tests/components/WorkspaceTabsBar.bulkClose.test.ts`
- `apps/web/tests/components/WorkspaceTabsBar.pinning.test.ts`

### 2026-08-04 — A regex builder, and search bars that can actually use it

**Reason:** the app had twenty-odd search bars and every one of them did
`haystack.toLowerCase().includes(needle)`. That is the right default and it is
also the only thing they could do. There was no way to anchor a match, no way
to say "any of these three", and nothing anywhere in the product that would
help someone write a pattern if there had been.

**`apps/web/src/components/regex/` is the whole feature**, and it is built so
that one fact holds end to end: **the engine is `new RegExp(source, flags)`,
and the interface says so.** `REGEX_ENGINE_LABEL` is rendered in the builder's
header and in its error heading. The regex the preview matches with is the same
object the wired search bar filters with — there is no second dialect, no
server round trip, and no translation step where a `\d` could come to mean
something different in the two places. A builder that implied PCRE while the
search ran JavaScript would be worse than shipping no builder at all.

**Two editors, one pattern, and an honest refusal between them.** The raw
pattern editor and the guided parts list write to the same string, which is
also the search field's own value — so there is no third copy to reconcile.
`parse.ts` turns a typed pattern back into parts, and it is deliberately
narrow: it recognises exactly what `renderParts` emits plus the plainest
hand-written equivalents, and it **refuses** everything else rather than
approximating. Lookarounds, backreferences, `\n`, `\p{L}`, top-level `|` and an
unterminated class all come back as "unsupported", and the builder then says
which token at which position defeated it, keeps the pattern *exactly* as
typed, and disables the guided controls until the user explicitly asks to
rebuild from parts. The alternative — mapping `(?=foo)` onto a capturing group
because it is roughly parenthesis-shaped — would silently rewrite someone's
working pattern the moment they touched an unrelated dropdown. A test asserts
the property this buys: everything the parser accepts round-trips to byte-
identical source.

**Guided construction covers literals, classes, anchors, groups, alternation
and quantifiers**, each with the regex it emits shown next to it. Literals are
escaped for the user, and a multi-character literal with a quantifier is
wrapped — `ab` repeated is `(?:ab)+`, never `ab+`, which would repeat only the
`b`. Custom character classes are deliberately *not* escaped as text, because
`a-z0-9_` has to stay a range set; only a `]` that would close the class early
and a leading `^` that would negate it behind the user's back are handled, and
the hint under the field says which of the two it is. Quantifiers include the
lazy variants, and the lazy checkbox is hidden for `{n}` where it would mean
nothing.

**Safety is three bounds and one honest disclaimer.** Pattern length, sample
length and `{n,m}` counts are capped before anything reaches the engine;
`runSample` checks a wall-clock deadline *between* `exec` calls and stops at a
match cap; and the list predicate adds up its own time across a filtering pass
and, once over budget, stops evaluating and starts returning `true` for
everything. Giving up by matching everything rather than nothing is deliberate:
an unfiltered list is a visible, recoverable state, whereas silently hiding
rows is indistinguishable from data loss. What none of that covers is stated in
a comment at the top of `evaluate.ts` and in the builder's own footer: this
bounds how *many* evaluations happen, not how long *one* takes. A single
`exec` cannot be interrupted, so a genuinely catastrophic pattern on a subject
that survives the length caps still blocks the main thread until the engine
returns. `looksCatastrophic` warns about the nested-quantifier shape behind
most real blow-ups and is labelled a heuristic, with a test pinning a case it
cannot see. Real interruptibility needs a worker or a non-backtracking engine;
neither is here, and nothing in the file claims otherwise.

**An invalid pattern never breaks the list.** The last pattern that compiled is
kept, and a half-typed `[` leaves the search running on it while the engine's
own error message — verbatim, not a paraphrase — appears under the field.

**`RegexSearchField` is the wiring, and every field owns its own.** The
controller is created by the *host* component and handed down, so mode, flags,
parts, sample text and compiled pattern are per-field; there is no module state
and no context, and two fields on one screen cannot see each other. The field
renders the original `<input>` with its original class inside a thin flex host,
so every existing CSS rule that targeted that input still matches, and puts one
`.*` affordance beside it. The popover is portalled and positioned from the
host's measured rect rather than absolutely positioned — that is what lets a
field inside a modal or an `overflow: hidden` toolbar open a builder that is
not clipped. It closes on Escape and returns focus to the field, closes on an
outside pointer or focus, bounds its height to the room available and scrolls
inside that bound.

**Plain text stays the default in every wired field; regex is a per-field
opt-in.** Until the user turns it on, the builder shows the plain-text notice
and the switch and nothing else — there is no pattern editor to accidentally
type into. Turning it on reads whatever is in the field as a pattern and never
silently rewrites it; "escape this text so it matches literally" is a separate,
explicit button.

**Eight search bars are wired**, chosen for breadth and including three inside
Settings: Examples, Settings → Skills, Settings → Design systems, Settings →
MCP server templates, Brands, the design-systems library, the reference-a-
project modal, and the plugin marketplace. Each keeps its existing behaviour in
plain-text mode — the marketplace's every-word-must-appear matching is
preserved and only bypassed for a pattern, because splitting a regex on spaces
would break it. **The settings dialog itself has no global settings search to
wire**; the three settings-surface fields above are its per-section ones.

**Changed files:**

- `apps/web/src/components/BrandsTab.tsx`
- `apps/web/src/components/DesignSystemsSection.tsx`
- `apps/web/src/components/DesignSystemsTab.tsx`
- `apps/web/src/components/ExamplesTab.tsx`
- `apps/web/src/components/McpClientSection.tsx`
- `apps/web/src/components/PluginsView.tsx`
- `apps/web/src/components/ProjectReferenceModal.tsx`
- `apps/web/src/components/SkillsSection.tsx`
- `apps/web/src/components/regex/RegexBuilder.module.css`
- `apps/web/src/components/regex/RegexBuilder.tsx`
- `apps/web/src/components/regex/RegexPartRow.tsx`
- `apps/web/src/components/regex/RegexSamplePanel.tsx`
- `apps/web/src/components/regex/RegexSearchField.module.css`
- `apps/web/src/components/regex/RegexSearchField.tsx`
- `apps/web/src/components/regex/evaluate.ts`
- `apps/web/src/components/regex/index.ts`
- `apps/web/src/components/regex/parse.ts`
- `apps/web/src/components/regex/parts-ops.ts`
- `apps/web/src/components/regex/pattern.ts`
- `apps/web/src/components/regex/useRegexSearch.ts`
- `apps/web/tests/components/regex/RegexSearchField.test.tsx`
- `apps/web/tests/components/regex/evaluate.test.ts`
- `apps/web/tests/components/regex/parse.test.ts`
- `apps/web/tests/components/regex/pattern.test.ts`

### 2026-08-04 — A dish at startup, and a changelog you can read inside the app

**Reason:** two of the four things the changelog's own "Not done yet" list
admitted the application lacked. Neither existed in any form; both are built
here out of what the repository already holds rather than out of anything new
invented for them.

**The dim sum surprise.** One launch in ten shows a dish: its photograph, its
name in English and Traditional Chinese, and a line of copy the funny-level
sliders style. Twelve photographs — one per category, the lowest id in each —
are copied byte-for-byte out of `assets/dim-sum/` into `apps/web/public/dim-sum/`
and re-verified by SHA-256 at generation time, so the packaged app ships them
locally and fetches nothing. `scripts/generate-dim-sum-catalog.mjs` does the
copying and writes the typed module the app imports; `--check` proves the
committed outputs still match the catalogue.

The surprise is a non-blocking toast through the app's existing `Toast`, which
gained one optional `media` slot for a picture and nothing else. It is bounded
hard: the draw is spent once per launch whether it wins or loses, so no
remount, route change or development double-invoke can re-roll it; and it is
only offered once the daemon config has hydrated, onboarding and the privacy
disclosure are done, no app-level error toast is up, and no update is in
flight. There is no setting that turns it off — what makes that polite is that
it never gates startup, never takes focus and never delays the app becoming
usable.

**The changelog viewer.** Every version the repository records, with its
categorized changes, read from `CHANGELOG.md` and `docs/CHANGELOG/v*/en.md`.
`scripts/generate-changelog.mjs` writes the build-time module: the source
markdown, plus every commit those sources reference resolved against git to a
full object id and an author date, with the link taken verbatim from the source
rather than assembled from a guessed origin. An abbreviation this repository
does not have is recorded as unresolved and **never** linked — the entry says
so instead, as does an entry whose source names no commit at all. The shape of
a release is derived from that markdown by `lib/changelog/parse.ts`, which is
deliberately the only parser: the one the tests exercise and the one the app
runs.

Three details the sources forced. No source records a release date, so a
release is dated by the newest change in it and the viewer labels that as what
it is rather than dressing it up as a publication date. A release written
entirely in prose (0.14.1) is still a release, so paragraphs under a category
heading are entries. And an undated entry cannot be shown to fall inside a date
range, so a set range excludes it and the viewer says how many it excluded —
silently keeping them would make the range a suggestion, silently dropping them
would hide a change.

The filter is a search and an anchored calendar with month and year jumps and
range selection, over two fields you can type into. A half-typed date is
reported as unfinished and an impossible one as impossible, and in neither case
is the field rewritten or cleared underneath the user. Copy and export render
exactly what the filter kept, in Markdown or plain text, and state the range in
the file. It opens from Settings → About, directly under the version.

**Changed files:**

- `apps/web/public/dim-sum/hk-dish-0260-chocolate-lava-egg-tart.png`
- `apps/web/public/dim-sum/hk-dish-0271-sweet-and-sour-pork-with-pineapple.png`
- `apps/web/public/dim-sum/hk-dish-0296-beef-with-black-bean-and-peppers.png`
- `apps/web/public/dim-sum/hk-dish-0406-claypot-rice-with-chinese-sausage.png`
- `apps/web/public/dim-sum/hk-dish-0446-wonton-noodles.png`
- `apps/web/public/dim-sum/hk-dish-0526-dai-pai-dong-style-dry-fried-beef-ho-fun.png`
- `apps/web/public/dim-sum/hk-dish-0551-cha-chaan-teng-baked-pork-chop-rice.png`
- `apps/web/public/dim-sum/hk-dish-0560-chocolate-filled-sesame-balls.png`
- `apps/web/public/dim-sum/hk-dish-0600-chocolate-lava-ma-lai-go.png`
- `apps/web/public/dim-sum/hk-dish-0626-hong-kong-dessert-shop-mango-pomelo-sago.png`
- `apps/web/public/dim-sum/hk-dish-0676-hong-kong-milk-tea.png`
- `apps/web/public/dim-sum/hk-dish-0701-haw-flake-discs.png`
- `apps/web/src/App.tsx`
- `apps/web/src/components/DimSumSurprise.module.css`
- `apps/web/src/components/DimSumSurprise.tsx`
- `apps/web/src/components/EntryHelpMenu.tsx`
- `apps/web/src/components/SettingsDialog.tsx`
- `apps/web/src/components/Toast.tsx`
- `apps/web/src/components/changelog/ChangelogDateRange.module.css`
- `apps/web/src/components/changelog/ChangelogDateRange.tsx`
- `apps/web/src/components/changelog/ChangelogDialog.module.css`
- `apps/web/src/components/changelog/ChangelogDialog.tsx`
- `apps/web/src/components/changelog/open-changelog.ts`
- `apps/web/src/lib/changelog/dates.ts`
- `apps/web/src/lib/changelog/filter.ts`
- `apps/web/src/lib/changelog/generated.ts`
- `apps/web/src/lib/changelog/index.ts`
- `apps/web/src/lib/changelog/parse.ts`
- `apps/web/src/lib/dim-sum/catalog.ts`
- `apps/web/src/lib/dim-sum/surprise.ts`
- `apps/web/src/styles/home/entry-layout.css`
- `apps/web/src/styles/viewer/routines.css`
- `apps/web/tests/changelog-filter.test.ts`
- `apps/web/tests/changelog-parse.test.ts`
- `apps/web/tests/dim-sum.test.ts`

### 2026-08-04 — Cantonese, a bilingual mode, and two funny-level sliders

**Reason:** the product shipped nineteen locales and no way to read two at
once, no Cantonese at all, and no control over how its copy sounds. All three
are now settings, and all three land in one place — `t()` — because that
function is the single point every component already goes through.

**`zh-HK` (廣東話) is a real locale, not a `zh-TW` alias.** It joins the
`Locale` union, `LOCALES`, `LOCALE_LABEL` and the `DICTS` map. The dictionary
is the one locale file in the tree that satisfies `Dict` by spreading another
(`...zhTW`) and then overriding what has actually been rewritten. That shape
was chosen deliberately over pasting 4,291 near-duplicate lines:

1. It keeps the file honest about its own coverage. 639 keys below the spread
   have been rewritten into spoken Cantonese — 係/嘅/唔/仲/咗/喇 particles,
   spoken word order — covering `common.*`, the chat chrome and every
   `chat.runError.*`, the workspace and tab strip, conversations, the question
   form, onboarding, the tool cards, the updater, the preview/share menus and
   the parts of `settings.*` a user actually opens. Everything else is visibly
   still the seeded Traditional text: correct, readable Chinese that a Hong
   Kong reader understands, just not yet how they speak.
2. A key added to `zh-TW` reaches `zh-HK` for free, so the twentieth locale
   cannot become the one that always breaks the typecheck gate.

Two groups are deliberately left seeded rather than Cantonese-ified, and the
file says so: strings sent to a *model* rather than read by a person
(`chat.contextPrompt.*`, `nextStep.*Prompt`, `home.starter.*.firstPrompt`),
where a register game buys nothing and can cost instruction-following; and
brand proper nouns, which stay verbatim in every locale (the
`plugins.availableDetails.integrity` lock passes through the spread unchanged).

**`resolveSystemLocale` now lets region beat script.** It inspected only the
second subtag, so `zh-Hant-HK` — what macOS reports for a Hong Kong user —
matched `hant` and landed on `zh-TW`. It now scans every subtag: `hk`/`mo`
anywhere wins, `hant`/`tw` otherwise, `zh-CN` as before. The existing
`zh-Hant-HK → zh-TW` assertion in `tests/i18n/locales.test.ts` was the encoded
form of the old behaviour and is replaced by a case that pins all eight tags.

**Bilingual mode needed no component changes at all.** A persisted
`languageMode` of `'single' | 'bilingual'` sits in the provider; in bilingual
mode `t()` renders the key twice and joins the two. English pairs with 廣東話
and every other locale pairs with English, so the pair always holds the
language the reader picked plus one they are likely to read. `composeBilingual`
declines in three cases that would produce noise rather than a translation: an
empty side, two sides that are already the same string (untranslated keys,
brand names), and values whose whole lexical content is one or two characters
or carries no letter — `{n}m`, `⤢`, `·` are units and glyphs, and doubling
them makes a timestamp chip unreadable. A value that already spans lines joins
on a newline instead of the middot.

**Two funny-level sliders, 1–5, one per language, persisted separately.**
Level 1 is the neutral base dictionary, which is also the default: an install
that never opens the setting reads exactly as it did before. Levels 2–5 come
from sparse override maps in `apps/web/src/i18n/funny/{en,zh-HK}.ts` — 216
keys each, 881 variants in total, curated onto the copy a user actually
collides with (errors, empty states, destructive confirmations, toasts,
onboarding) rather than pretending to five full dictionaries of 4,291 keys.
The two maps cover the same key set, so a bilingual reader gets the same energy
on both sides of the separator. A key with no entry renders its base string at
every level; a key that defines only 3 and 5 falls *down* to the nearest
defined step rather than snapping back to neutral.

**The level changes voice, never facts — and that is enforced, not promised.**
`keepsTheFacts` compares each override against its neutral base and discards
any candidate that lost a `{placeholder}` or a number the base carried (a
version, a count, a percentage, a file count); the base string renders in its
place. So a joke that would cost the reader a fact degrades to a silent no-op
rather than shipping. The mechanism cannot catch a line that quietly drops the
word "permanently", so the destructive confirmations were written level by
level with every fact — what is deleted, from where, and that messages go with
it — identical from 1 to 5, and `settings.funnyFactsNotice` is deliberately the
one string that is never funny-levelled, because it is the promise the levels
are made under.

**Settings → Language grew a mode control, the two sliders, and a one-time
disclosure**, following that file's existing `seg-control` / `field` / `hint`
patterns rather than inventing a fourth. The disclosure fires there rather than
at first run because that is the surface that can act on it — the dial it
describes is the next thing on the page — and its dismissal is persisted, so it
is genuinely one-time. Only English and 廣東話 get a slider: a third slider
that moved nothing would be a lie in the shape of a control.

Adding the locale surfaced three places that would otherwise have failed
typecheck or silently served English, and one that would have mixed scripts:

- **Home hero** — its `HOME_PROMPT_EXAMPLES` table is an exhaustive
  `Record<Locale, …>`, and its guard test requires four *non-English* examples
  for all six chips in every locale, so `zh-HK` gets its own Cantonese set.
- **Sketch editor** — its Excalidraw language map is likewise exhaustive.
  Excalidraw ships no `zh-HK` bundle, so Cantonese rides the Traditional one —
  right script, and the closest thing that actually exists upstream. The DOM
  text overrides follow for the same reason.
- **Plugin preset seeding** — it classified only `zh-CN`/`zh-TW` as `'zh'`,
  which would have seeded a Cantonese user's plugin prompts in English.
- **Update dialog** — it picks full-width parentheses for CJK locales and
  would have printed ASCII ones inside Chinese copy.

Nineteen new `Dict` keys carry the settings surface and are declared in all
twenty locale files, since a key missing from any one of them fails typecheck.
`AGENTS.md`'s i18n section named nineteen locale files and described `t()` as a
plain lookup; both are now true again.

Not changed, deliberately: `i18n/content.ts` already routes any `zh*` locale to
the `zh-CN` content bundle, so `hasLocalizedContent('zh-HK')` is true with no
edit; and `tools/pack`'s `NSIS_INSTALLER_LANGUAGE_BY_WEB_LOCALE` is a partial
map that already omits most locales, NSIS ships no `zh_HK`, and its values are
passed to electron-builder as a list — adding `zh-HK → zh_TW` would have
emitted a duplicate installer language for no gain.

**Changed files:**

- `AGENTS.md`
- `apps/web/src/components/HomeHero.tsx`
- `apps/web/src/components/SettingsDialog.tsx`
- `apps/web/src/components/SketchEditor.tsx`
- `apps/web/src/components/UpdateDialog.tsx`
- `apps/web/src/components/plugins-home/presetSeedPrompt.ts`
- `apps/web/src/i18n/funny/en.ts`
- `apps/web/src/i18n/funny/zh-HK.ts`
- `apps/web/src/i18n/index.tsx`
- `apps/web/src/i18n/locales/ar.ts`
- `apps/web/src/i18n/locales/de.ts`
- `apps/web/src/i18n/locales/en.ts`
- `apps/web/src/i18n/locales/es-ES.ts`
- `apps/web/src/i18n/locales/fa.ts`
- `apps/web/src/i18n/locales/fr.ts`
- `apps/web/src/i18n/locales/hu.ts`
- `apps/web/src/i18n/locales/id.ts`
- `apps/web/src/i18n/locales/it.ts`
- `apps/web/src/i18n/locales/ja.ts`
- `apps/web/src/i18n/locales/ko.ts`
- `apps/web/src/i18n/locales/pl.ts`
- `apps/web/src/i18n/locales/pt-BR.ts`
- `apps/web/src/i18n/locales/ru.ts`
- `apps/web/src/i18n/locales/th.ts`
- `apps/web/src/i18n/locales/tr.ts`
- `apps/web/src/i18n/locales/uk.ts`
- `apps/web/src/i18n/locales/zh-CN.ts`
- `apps/web/src/i18n/locales/zh-HK.ts`
- `apps/web/src/i18n/locales/zh-TW.ts`
- `apps/web/src/i18n/types.ts`
- `apps/web/src/styles/workspace/artifacts.css`
- `apps/web/tests/i18n/detect-initial-locale.test.ts`
- `apps/web/tests/i18n/language-modes.test.ts`
- `apps/web/tests/i18n/locales.test.ts`

### 2026-08-04 — The accent actually becomes Material Design 3, and motion stops being half-ported

**Reason:** a fidelity review of the token mapping found three places where the
port claimed more than it delivered. The first is the important one.

**The accent family was mapped in name only.** `styles/tokens.css` defines
`--accent` and its four derived tones as the M3 `primary` role, but nothing
downstream ever saw them: `state/appearance.ts` wrote all five as **inline
style on `<html>`**, and inline style outranks every stylesheet rule there is.
`DEFAULT_ACCENT_COLOR` was the literal `#c96442`, `DEFAULT_CONFIG.accentColor`
took that literal, and `App.tsx` fed it to `applyAppearanceToDocument` on every
mount — so every install whose owner never opened the accent picker painted its
primary CTAs the pre-port terracotta, in light *and* in dark, under every seed.
The pre-hydration script in `app/layout.tsx` did the same thing with its own
hardcoded copy of that hex before React even mounted. The most visible colour in
the product was the one the mapping could not reach.

The fix does not remove the inline write; it changes what gets written.
`DEFAULT_ACCENT_COLOR` is now `var(--md-sys-color-primary)` — the role itself
rather than a colour. Because a custom property's computed value is its
specified value *after* `var()` substitution, an inline `--accent` holding a
role reference resolves on `<html>` exactly as the stylesheet would have
resolved it, and re-resolves when the theme or the seed changes. The four
`color-mix()` tones already resolved their `--text-strong` and `--bg-panel`
operands at use time and now resolve their accent operand the same way, so
`accentVars()` itself needed no change at all.

Three consequences had to be handled rather than left to fall out:

1. **The sentinel must not look like a colour.** `var(--md-sys-color-primary)`
   fails `normalizeAccentColor`'s `^#[0-9a-fA-F]{6}$` test, which is what makes
   it safe: it can never be mistaken for a colour the user picked, it round
   trips through `localStorage` (an unrecognised stored accent already falls
   back to `DEFAULT_CONFIG.accentColor`, which is now this), and every existing
   validation path treats it as "no explicit choice" without a new code branch.
2. **Selecting the default swatch had to keep working.** `setAccentColor` fell
   through `normalizeAccentColor(color) ?? c.accentColor`, so a value that does
   not normalize would have silently kept the *previous* accent — clicking
   "Default" would have done nothing. It now matches the role first.
3. **`<input type="color">` cannot hold a role.** It only accepts a hex and
   coerces anything else to black, so the custom-colour control opens on
   `CUSTOM_ACCENT_FALLBACK`, the terracotta that used to be the default. That
   hex also stays in `ACCENT_SWATCHES` as an ordinary pickable swatch, one click
   from where it always was, so nobody who liked it loses it.

The rest follows: `state/config.ts` needed no edit, because `DEFAULT_CONFIG`
already spelled its default as `DEFAULT_ACCENT_COLOR`, and
`tests/state/appearance.test.ts` needed none either, because it asserts against
that constant rather than against the hex. The two suites that pinned the
literal — `DEFAULT_CONFIG.accentColor` in `tests/state/config.test.ts`, and the
two default-accent cases in `SettingsDialog.execution.test.tsx` — now pin the
role, still as literals, so a future change to the default is still deliberate.

**`--ease-out` is back on the app's own curve.** The previous entry repointed it
to `var(--md-sys-motion-emphasized-decel)` and the comment claimed the animation
philosophy survived the move. It did not: `AGENTS.md` still names
`cubic-bezier(0.23, 1, 0.32, 1)` as the canonical curve, and — more concretely —
roughly as many animations in `apps/web` write that curve as a **literal** as
read the token (582 against 584), 23 stylesheets use both sources, and eight
sites write the literal as the token's *own* `var()` fallback — so the repoint
also made those fallbacks disagree with the token they back. The sharpest case
is `styles/workspace/design-files.css`, which has a single `transition`
shorthand where `opacity` takes the literal while `background`, `box-shadow` and
`color` take the token: one element, four properties, two curves. Repointing the
token therefore did not move the app onto the M3 curve, it split the app in
half; the two curves differ by 0.22 of progress a tenth of the way in, which is
enough for those four properties to visibly lead one another at the start of a
200ms enter. Sweeping ~580 literals
was not the trade this change wanted to make, so the token keeps the product's
curve, the comment says why instead of claiming otherwise, `AGENTS.md` stays
true, and the M3 curves remain declared next door for new M3 surfaces to use
directly — which is what `components/WindowTitleBar.module.css` already does.

**`--ui-scale` was a name the contract does not use.** The mockup emits the
factor as `--od-scale` (`rootVars` at `Open Design M3.dc.html` line 2032) and
`md3-tokens.css` transcribes every other contract invention verbatim, its own
header comment included. Nothing in the repository reads either name yet, so the
divergence was free to correct now and would have been a silent no-op later,
when a control wired to the mockup's spelling wrote a property nothing declared.

**Changed files:**

- `apps/web/app/layout.tsx`
- `apps/web/src/components/SettingsDialog.tsx`
- `apps/web/src/state/appearance.ts`
- `apps/web/src/styles/md3-tokens.css`
- `apps/web/src/styles/tokens.css`
- `apps/web/tests/components/SettingsDialog.execution.test.tsx`
- `apps/web/tests/state/config.test.ts`

### 2026-08-04 — The renderer's own title bar, drawn where Windows draws none

**Reason:** the previous entry took the operating system's caption bar away on
win32 and gave the renderer an IPC bridge to replace it. Until something drew
that replacement the Windows build had no minimize, no maximize and no close —
this is the surface that draws it.

`apps/web/src/components/WindowTitleBar.tsx` and its colocated
`WindowTitleBar.module.css` are the whole bar, styled as a CSS Module beside
the component the way `AGENTS.md`'s "Web CSS ownership" section asks new
component-owned UI to be. Every value in it is the Material Design 3 contract
transcribed from this repository's own mockup
(`mockups/open-design-m3/Open Design M3.dc.html`, lines 146–157): a 40px
`surface-container` strip, one hairline `outline-variant` border along the
bottom only, 12px of padding on the left and none on the right so the buttons
run to the window edge, the 20px brand mark in `primary`, the app name at
12px/600 with `.02em` tracking in `on-surface-variant`, a flexible drag region,
and three 46px caption buttons whose hover is the `--ripple` state layer —
except Close, which takes the literal `#C42B1C` on `#fff` that the contract
deliberately keeps outside the token system because it is the Windows system
red rather than a role.

Four things about it are load-bearing rather than cosmetic:

1. **It renders nothing unless the host is the frameless Windows shell.** The
   bridge must report a desktop client on `win32` *and* actually carry the
   optional `windowControls` namespace. Either half alone would be enough
   today, since the preload exposes that namespace on win32 only — asking both
   is what stops a future change to one of them from painting caption buttons
   that do nothing on macOS or Linux.
2. **The maximized glyph follows the window, not the button.** It is seeded
   from `isMaximized()` (a session reopened maximized reaches first paint that
   way) and then tracks the bridge's push, because Windows changes the state
   behind the app's back through snap layouts, Win+Up and a drag off the top
   edge. The subscription is torn down on unmount.
3. **The bar drags, the buttons do not.** The strip is
   `-webkit-app-region: drag`; each button opts back out with `no-drag`, or a
   click on one would begin a window drag instead of firing. Double-click to
   toggle maximize is bound to the drag region rather than the whole bar, so a
   double-click on Close cannot also maximize the window on its way up the
   tree.
4. **The button selectors are two-class (`.bar .button`) on purpose.**
   `styles/primitives.css` styles bare `button`, and its
   `button:hover:not(:disabled)` rule has specificity (0,2,1); a single-class
   module rule would lose the hover the caption bar depends on and repaint it
   in the product's generic button colours.

Two deliberate departures from the mockup, both because the mockup is a
demonstration page and this is the application:

- The mockup's second title-bar span, `— Material 3 Expressive · Windows`,
  describes the mockup itself and is not product copy, so the brand mark is the
  logo and `app.brand` alone.
- The contract's focus ring is `3px solid primary` at `outline-offset: 2px`.
  The offset is inset here, because these buttons sit flush against the top and
  right edges of the window and an outward ring would be drawn outside the
  window and clipped away on two sides of every button.
- The mockup's glyphs are Material Symbols Rounded (`minimize`, `crop_square`,
  `close`), a font this application does not bundle and will not fetch. The bar
  uses the app's own bundled Remix icon set at the contract's sizes —
  `subtract-line` at 16px, `checkbox-blank-line`/`checkbox-multiple-blank-line`
  at 15px, `close-line` at 17px — rather than adding a webfont for three
  glyphs.

`App.tsx` mounts it as the first child of the shell, above the existing
`WorkspaceTabsBar` chrome; nothing else in the tree moved. `styles/shell.css`
gains the one rule that change requires: `.workspace-shell` is a two-row grid,
so a third child needs a third row. The rule selects on
`:has(> [data-window-title-bar])` rather than on a second copy of the platform
test, so the row count cannot drift away from whether the bar is actually on
screen — and on every other platform the component renders nothing, the
selector does not match, and the shell keeps the template it always had. The
tab row in that template is `auto`, not a literal: `:has()` adds the
specificity of its argument, so the rule outranks every bare `.workspace-shell`
selector regardless of import order, and `styles/viewer/routines.css` already
re-declares that template at a different height. Sizing the row to the chrome
header's real height keeps the Windows path from being pinned to a number the
header no longer uses.

The four caption labels are new i18n keys (`titleBar.minimize`,
`titleBar.maximize`, `titleBar.restore`, `titleBar.close`) added to the typed
`Dict` and to all nineteen locale files, since a key missing from any one of
them fails typecheck. They are standard window-control labels, so each locale
uses the term that platform's users already read on those buttons rather than a
literal translation.

**Changed files:**

- `apps/web/src/App.tsx`
- `apps/web/src/components/WindowTitleBar.module.css`
- `apps/web/src/components/WindowTitleBar.tsx`
- `apps/web/src/i18n/locales/ar.ts`
- `apps/web/src/i18n/locales/de.ts`
- `apps/web/src/i18n/locales/en.ts`
- `apps/web/src/i18n/locales/es-ES.ts`
- `apps/web/src/i18n/locales/fa.ts`
- `apps/web/src/i18n/locales/fr.ts`
- `apps/web/src/i18n/locales/hu.ts`
- `apps/web/src/i18n/locales/id.ts`
- `apps/web/src/i18n/locales/it.ts`
- `apps/web/src/i18n/locales/ja.ts`
- `apps/web/src/i18n/locales/ko.ts`
- `apps/web/src/i18n/locales/pl.ts`
- `apps/web/src/i18n/locales/pt-BR.ts`
- `apps/web/src/i18n/locales/ru.ts`
- `apps/web/src/i18n/locales/th.ts`
- `apps/web/src/i18n/locales/tr.ts`
- `apps/web/src/i18n/locales/uk.ts`
- `apps/web/src/i18n/locales/zh-CN.ts`
- `apps/web/src/i18n/locales/zh-TW.ts`
- `apps/web/src/i18n/types.ts`
- `apps/web/src/styles/shell.css`
- `apps/web/tests/components/WindowTitleBar.test.tsx`

### 2026-08-04 — Frameless Windows window with a custom Material Design 3 title bar

**Reason:** Windows builds showed the operating system's own title bar. The
frameless chrome existed only for macOS, where `MAC_WINDOW_CHROME` spread
`titleBarStyle: "hiddenInset"` plus a traffic-light position and spread an
empty object everywhere else, so win32 fell through to the default caption bar
— a grey strip of another design system sitting above a Material Design 3
application.

That constant is now `PLATFORM_WINDOW_CHROME` with a win32 branch of
`{ titleBarStyle: "hidden" }`. The macOS branch is unchanged. Two neighbouring
options were deliberately **not** used, and the reasons are worth recording
because both look like the obvious fix:

- **`frame: false`** removes the whole window frame, not just the caption bar,
  and takes Windows 11's rounded corners, drop shadow and Alt+Space system menu
  down with it. `titleBarStyle: "hidden"` leaves the window an ordinary framed
  window that simply draws no caption bar.
- **`titleBarOverlay`** keeps the OS drawing the caption buttons, in a
  reserved region the app must dodge. That is precisely the chrome this change
  exists to replace, so the buttons would be the operating system's and the
  title bar around them would be the product's.

One Windows 11 behaviour genuinely does not survive, and the code comment says
so rather than claiming otherwise: the **snap-layouts flyout**. The OS raises it
only while it hit-tests the pointer onto a maximize button — `WM_NCHITTEST`
returning `HTMAXBUTTON` — and `-webkit-app-region: drag` reports `HTCAPTION` for
the whole strip, with no Electron API to mark an HTML element as the maximize
button short of letting `titleBarOverlay` draw the OS's own buttons there. So
hovering the renderer's maximize button pops no flyout; Win+Z and drag-to-edge
snapping still work. That is the cost of the caption bar being the product's.

With no OS caption bar there is no OS route to minimize, maximize or close, so
the renderer needs one. `apps/desktop/src/main/window-controls.ts` is a new
module registering four IPC channels (`od:window:minimize`,
`od:window:toggle-maximize`, `od:window:close`, `od:window:is-maximized`) and a
`od:window:maximized-changed` push. Two properties of it are load-bearing:

1. **Every handler verifies the sender is the main window.** The app enables
   `webviewTag` and every frame in the process shares one preload, so an
   embedded design-browser guest reaches the same channels; without the check
   any page a user loaded in that panel could close the application. The check
   and its message mirror `requireMainWindowSender`, which already guards the
   updater and capture channels in `runtime.ts`.
2. **The window's maximized state is pushed, not polled.** Windows changes it
   behind the app's back — a snap layout, a double-clicked drag region, Win+Up,
   or a drag off the top edge all bypass the renderer's own button — so a title
   bar that only tracked its own clicks would show the wrong glyph. The main
   window's `maximize`/`unmaximize` events fan out to the renderer, guarded
   against a destroyed window.

Both surfaces are declared structurally rather than against Electron's classes
so `apps/desktop`'s vitest suite, which runs in a plain node environment with
no Electron, can exercise the whole module with object mocks.

The bridge namespace is **optional** (`windowControls?`) and exposed on win32
only, so a renderer feature-detects it instead of drawing caption buttons that
would do nothing on macOS and Linux. `packages/host` carries the type because
it owns the host-bridge wire contract; the preload duplicates the channel-name
literals for the same reason it already duplicates the updater ones — a
sandboxed preload may only `require('electron')`, so it cannot import the
main-process module that owns them. `apps/desktop/tests/main/window-chrome.test.ts`
asserts the chrome as source text and would otherwise have gone red on this
change; it now pins the win32 branch, the macOS branch, and the absence of both
rejected options.

**Changed files:**

- `apps/desktop/src/main/preload.cts`
- `apps/desktop/src/main/runtime.ts`
- `apps/desktop/src/main/window-controls.ts`
- `apps/desktop/tests/main/preload-host-boundary.test.ts`
- `apps/desktop/tests/main/window-chrome.test.ts`
- `apps/desktop/tests/main/window-controls.test.ts`
- `packages/host/src/index.ts`
- `packages/host/src/protocol.ts`

### 2026-08-03 — Material Design 3 token sheet, and the layer that maps the app onto it

**Reason:** the product had a hand-tuned neutral palette and no design system
behind it. This adds the Material Design 3 contract as a sheet of its own and
rewrites the existing token file into a mapping layer, so every component that
already asks for `--bg`, `--text`, `--border`, `--radius` or `--ease-out`
receives an M3 role without a single component being touched.

The split is the point. `apps/web/src/styles/md3-tokens.css` is the contract,
transcribed from this repository's own mockup
(`mockups/open-design-m3/Open Design M3.dc.html`): the 34 light colour roles,
the dark overrides, the four seed variants, the seven-step shape corner scale,
the three motion curves, the density scale, the `--ripple` state layer, a
`--ui-scale` factor, and a fifteen-role type scale assembled from the mockup's
measured size, weight, line-height and letter-spacing vocabulary (the contract
declares no typescale tokens of its own). It defines tokens and paints nothing.
`apps/web/src/styles/tokens.css` keeps all 61 of its historical property names —
none added, none removed — and redefines each in terms of a role. `index.css`
gains one line so the contract is imported immediately before the mapping layer;
nothing else moves, and it stays import-only as its own guard test requires,
which is also why the explanatory comment lives in the two token sheets and not
in `index.css`.

Dark is declared under **both** selectors the app already uses — explicit
`[data-theme="dark"]` and `html:not([data-theme])` under
`@media (prefers-color-scheme: dark)` — because overriding only the first would
leave every system-mode user on the old palette. Because the roles flip
themselves, the mapping layer's duplicated dark block mostly disappeared.

Three groups deliberately did **not** move:

1. **The status/category palette** (`--green*`, `--blue*`, `--purple*`, `--red*`,
   `--amber*`) is functional data colour, not chrome. The hue *is* the datum —
   mention kind, cost tier, pass/fail — so folding it onto M3 roles would make
   different categories indistinguishable. It keeps its own values and its own
   dark block. `--amber-border` is still deliberately undefined, because
   `workspace/mention-home.css` falls back through it to `--green-border`.
2. **`--selected` / `--selected-soft`** are ambiguous and were left alone. M3
   would call them `secondary`, but in this contract `secondary` is a warm brown
   a few degrees off `primary` — which would collapse the exact CTA-versus-
   selection distinction the token exists to hold — and they are theme-invariant
   on purpose while every M3 role is not.
3. **`--shadow-*`** keep their own light and dark values. The contract expresses
   elevation as literal box-shadows and declares neither a `shadow` colour role
   nor an elevation token set, so there is nothing to derive from.

Also deliberate: `--text-strong` converges onto `on-surface`, M3's
maximum-contrast text colour, rather than inventing a role above it; the two
reading measures (`--prose-line-height`, `--code-line-height`) stay literal
because they are long-form measures wider than any chrome role; and the accent
group is written in terms of `primary` even though `state/appearance.ts` and the
pre-hydration script in `app/layout.tsx` both set it inline on `<html>` and win.
Neither writer needed changing: their stored `color-mix()` strings resolve
against `--text-strong` and `--bg-panel` at use time, so a user's own accent is
now mixed against M3 surfaces for free.

Three style tests asserted the palette this change replaces, and were updated to
the new architecture rather than to new expectations. `default-background` no
longer reads a literal background hex out of `:root` but checks that `--bg` is
the surface role and that the role carries the M3 value; `filter-pill` and
`home-hero-picker-contrast` follow `var()` indirection to a hex before measuring
contrast. All three also had to stop taking the *first* `:root` /
`[data-theme="dark"]` block they found, since there are now two sheets that open
one. The contrast thresholds they guard are still cleared — comfortably, because
M3's `on-surface-variant` is a higher-contrast role than the `--text-muted` it
replaces.

**Changed files:**

- `apps/web/src/index.css`
- `apps/web/src/styles/md3-tokens.css`
- `apps/web/src/styles/tokens.css`
- `apps/web/tests/styles/default-background.test.ts`
- `apps/web/tests/styles/filter-pill.test.ts`
- `apps/web/tests/styles/home-hero-picker-contrast.test.ts`

### 2026-08-03 — Separate application identity, so the two products can coexist

**Reason:** these are correctness fixes, not cosmetics. Installed side by side,
an unmodified build of this fork and upstream Open Design are the *same
application* as far as the operating system is concerned, and they collide in
eight concrete ways:

1. **Shared Electron `userData` directory.** Electron derives `userData` from
   `productName`, so both products resolve to
   `%APPDATA%\Open Design\namespaces\<ns>\data` — the same SQLite database, the
   same artifacts, the same stored credentials. Two apps writing one store is
   guaranteed mutual corruption, not a race that usually works out.
2. **Shared Chromium single-instance lock.** That lock is keyed on the
   `userData` directory. With both products pointing at one directory, launching
   this app while Open Design is running makes it silently `app.quit()` — a
   failure with no error, no window, and nothing in the UI to diagnose.
3. **Shared Windows named pipe.** The daemon IPC endpoint
   `\\.\pipe\open-design-<ns>-daemon` is a single global name; whichever product
   binds it first owns it, and the second one talks to the wrong engine or
   fails to start.
4. **Shared uninstall registry key.** Both installers write the same
   Add/Remove Programs entry, so uninstalling either product deletes the other's
   entry, and `cleanupWinRegistryResidues` would happily remove a key belonging
   to a different application.
5. **Auto-update into a different product.** This is the most serious one. The
   packaged build shipped with the updater *enabled by default* and pointed at
   upstream's release feed (`https://releases.open-design.ai`). Left alone, a
   build of this fork would poll that feed, download upstream's installer, and
   replace itself with the other product. An application must never update
   itself into something else, so the default origin is now an inert
   `.invalid` host that can never resolve, and a packaged build enables the
   updater only when it was actually given a feed of its own. That is the
   bake-time route an installed app really has: `tools/pack` reads
   `OD_UPDATE_METADATA_URL` and writes it into `open-design-config.json`, and
   `apps/packaged` re-exports it into the process before the desktop main
   resolves its updater config. A build packed against this fork's feed
   therefore updates from that feed; a build packed without one never checks
   and never resolves an origin that could answer. `OD_UPDATE_ENABLED` still
   overrides the default in either direction. `apps/desktop`'s updater config
   tests pin both halves, because each is a one-line reversion in a file that
   keeps merging from upstream.
6. **One-click manual routes into the other product.** Three buttons opened
   upstream's downloads page: Settings → About's "View release notes" (shown
   precisely when in-app updating is unavailable, which is now every build
   without a baked feed), the macOS update dialog's manual-download button, and
   the post-update highlights card's fallback link. All three now open this
   repository's own releases page.
7. **Remotely controlled content from an upstream-owned feed.** The daemon
   fetched `https://whatsnew.open-design.ai/whats-new.json` on every launch
   that reached Home on any release channel, and rendered that document's
   title, body, image and link inside the app. A packaged build of this fork
   would have given another project's operators editorial control of a surface
   in this product — including a clickable link — and a launch signal from
   every user, with nothing configured anywhere. The highlights document is now
   opt-in through `OD_WHATS_NEW_URL` alone, with no default: absent that
   variable there is no card and no network call.
8. **The other product's name in a hardcoded menu label.** The macOS
   application menu's "Restart to Update…" item falls back to a hardcoded
   English default until the renderer pushes localized labels over IPC, and
   that default named Open Design. It lives outside `apps/web/src/i18n`, so no
   locale edit reaches it.
9. **A shared user-state directory holding provider credentials.** The daemon
   kept its Vercel and Cloudflare Pages deploy tokens, and its local agent CLI
   profiles, in `~/.open-design` whenever `OD_USER_STATE_DIR` and
   `OD_AGENT_PROFILES_CONFIG` were unset — which is every packaged launch, since
   nothing sets them. Re-authenticating a provider in one product silently
   rewrote the other's token. That root is now `~/.material-designer`; both
   overrides still work exactly as before.
10. **A shared headless data root.** The standalone headless entry defaulted its
    namespace base to `<data home>/open-design/namespaces` — the same SQLite
    database, artifacts and credentials as upstream's headless install. It now
    defaults to `<data home>/material-designer/namespaces`. `OD_DATA_DIR`, which
    the generated launchers bake in, is untouched.
11. **A shared MCP server key in third-party agent configs.** Installing the MCP
    server wrote an entry named `open-design` into files neither product owns —
    `~/.codex/config.toml`, `~/.claude.json`, VS Code's `mcp.json` and the rest —
    so installing from one product repointed the other's entry at the wrong
    executable, and uninstalling from either deleted the other's registration.
    The default key is now `material-designer`; `--name` still overrides it.
12. **`tools-pack win stop` killing the other product.** Windows picked its
    victims by sidecar stamp alone, and a stamp carries no product identity, so
    a developer's running upstream desktop matched and had its whole process
    tree force-killed. Selection is now intersected with this build's own
    install, unpacked, cache and launcher-payload trees. mac and Linux already
    gated on a product-distinct marker root and needed no change.
13. **Release automation still looking for the other product's filenames.** The
    packagers derive every artifact name from the product name, so the rename
    also renamed `Open Design-<ns>.dmg`, `.zip`, `.AppImage`, `-setup.exe` and
    the launcher payload's `payload/Open Design.exe` entry. The asset-staging
    scripts, the Windows payload validator, and the agent documentation that
    records the channel identities, uninstall keys and POSIX IPC socket base
    were still spelling the old names, so a real release would have failed on a
    missing file — and the docs would have told the next reader to put the old
    name back.

The change therefore sets a distinct product display name ("Material Designer",
with the per-channel names following upstream's own pattern), distinct
`appId`s under `io.ding-ding.material-designer*`, a distinct Windows named-pipe
prefix (`material-designer`), distinct Linux desktop-entry, icon and AppImage
names, a distinct macOS bundle identity, and a publisher name of its own. It
also sets an explicit `app.setAppUserModelId()` before `app.whenReady()`, since
Windows otherwise keys taskbar grouping, jump lists and notification identity
off the electron-builder `appId` and would merge the two apps' taskbar
identities.

Internal identifiers are **deliberately left alone**: the `od://` URL scheme,
the `open-design:` `localStorage` key prefix, the `@open-design/*` workspace
package names, the `OD_*` environment variables, `open-design-config.json`, the
`resources/open-design` resource folder, and the `od` CLI bin name. None of
them collides between installs, and renaming them would be a large refactor
that buys no coexistence. `packages/sidecar-proto`'s exported constant keeps its
historical name `OPEN_DESIGN_PRODUCT_NAME` for the same reason — only its value
tracks the product.

**Changed files:**

- `.github/scripts/release/assets/linux.sh`
- `.github/scripts/release/assets/mac-intel.sh`
- `.github/scripts/release/assets/mac.sh`
- `.github/scripts/release/assets/win.ps1`
- `AGENTS.md`
- `apps/daemon/src/cli.ts`
- `apps/daemon/src/deploy.ts`
- `apps/daemon/src/mcp-routes.ts`
- `apps/daemon/src/runtimes/local-profiles.ts`
- `apps/daemon/src/services/whats-new.ts`
- `apps/daemon/tests/whats-new.test.ts`
- `apps/desktop/src/main/diagnostics.ts`
- `apps/desktop/src/main/runtime.ts`
- `apps/desktop/src/main/update-menu.ts`
- `apps/desktop/src/main/update-preflight.ts`
- `apps/desktop/src/main/updater/config.ts`
- `apps/desktop/tests/main/update-menu.test.ts`
- `apps/desktop/tests/main/updater/config.test.ts`
- `apps/packaged/src/errors.ts`
- `apps/packaged/src/headless-runtime.ts`
- `apps/packaged/src/headless.ts`
- `apps/packaged/src/index.ts`
- `apps/packaged/src/launch.ts`
- `apps/packaged/src/paths.ts`
- `apps/packaged/src/window-title.ts`
- `apps/packaged/tests/launch.test.ts`
- `apps/packaged/tests/window-title.test.ts`
- `apps/packaged/tests/windows-lifecycle.test.ts`
- `apps/web/app/layout.tsx`
- `apps/web/src/components/SettingsDialog.tsx`
- `apps/web/src/components/UpdateDialog.tsx`
- `apps/web/src/components/WhatsNewPopup.tsx`
- `apps/web/tests/components/SettingsDialog.execution.test.tsx`
- `apps/web/tests/components/UpdateDialog.test.tsx`
- `docs/code-review-guidelines.md`
- `e2e/lib/vitest/packaged-win-identity.ts`
- `e2e/specs/linux.spec.ts`
- `e2e/specs/win.spec.ts`
- `e2e/tests/packaged-win-identity.test.ts`
- `packages/release/src/index.ts`
- `packages/release/tests/index.test.ts`
- `packages/sidecar-proto/src/index.ts`
- `tools/pack/AGENTS.md`
- `tools/pack/README.md`
- `tools/pack/resources/linux/open-design.desktop.template`
- `tools/pack/src/launcher-layout.ts`
- `tools/pack/src/linux.ts`
- `tools/pack/src/mac/constants.ts`
- `tools/pack/src/mac/identity.ts`
- `tools/pack/src/win/builder.ts`
- `tools/pack/src/win/constants.ts`
- `tools/pack/src/win/lifecycle.ts`
- `tools/pack/src/win/nsis.ts`
- `tools/pack/src/win/payload.ts`
- `tools/pack/tests/launcher-layout.test.ts`
- `tools/pack/tests/launcher-payload.test.ts`
- `tools/pack/tests/linux.test.ts`
- `tools/pack/tests/mac-identity.test.ts`
- `tools/pack/tests/mac-lifecycle.test.ts`
- `tools/pack/tests/release-workflows.test.ts`
- `tools/pack/tests/win-builder.test.ts`
- `tools/pack/tests/win-identity.test.ts`
- `tools/pack/tests/win-lifecycle.test.ts`
- `tools/pack/tests/win-nsis.test.ts`
- `tools/release/scripts/build-platform.ps1`
- `tools/release/scripts/prepare-platform-assets.ps1`
- `tools/release/scripts/prepare-platform-assets.sh`

### 2026-08-03 — Local version history, export in every faithful format, and open-in-editor


**Reason:** three capabilities the project's standards require of any application
that owns user data, none of which the imported work had.

**Version history.** Every record the application manages — not only documents,
but accounts, connected services, rules and settings — is snapshotted into a Git
repository kept beside the daemon's own data directory, never inside a user's
own project folder. The decision that matters is that **history is append-only:
restoring is itself recorded as a new revision**, so an undo can be undone and
that undo undone in turn. A restore that discarded the state it replaced would
make the whole feature unsafe to use, because nobody could experiment without
risking what they started from. A failed history write can never fail the
operation the user actually asked for.

Two hazards were found and closed while building it. Restoring a table with
inbound foreign keys had been delete-all-then-reinsert, which cascaded and wiped
dependent rows belonging to records the restore was not touching; it now
reconciles, deleting only rows the snapshot genuinely omits. And a restore now
captures the current state first, so the thing being replaced is always
recoverable.

**Export.** Every dataset the daemon owns, in every format that can carry it
faithfully — JSON, JSONL, YAML, TOML, XML, CSV, TSV, Markdown, HTML — plus ZIP
and 7z archives exposing the compression, encryption and split-volume options 7z
actually offers rather than one hard-coded default. Where a format cannot carry a
field the export says so **before** it runs rather than truncating quietly, and
an archive is never presented as protected while leaving its filenames readable.

**External editor.** Detection of installed editors including portable and
Insiders builds, a persisted choice, and an open action that opens a folder as a
workspace root rather than a single file with no context. Paths are passed as an
argument vector, never interpolated into a shell string.

All three follow this codebase's dual-surface rule — an HTTP endpoint, a shared
DTO and an `od` subcommand — so an external agent can drive them without the UI.

**Changed files:**

- `apps/daemon/src/app-config.ts`
- `apps/daemon/src/data-export-cli.ts`
- `apps/daemon/src/data-export/archive.ts`
- `apps/daemon/src/data-export/datasets.ts`
- `apps/daemon/src/data-export/serialize.ts`
- `apps/daemon/src/external-editors.ts`
- `apps/daemon/src/history/domains.ts`
- `apps/daemon/src/history/git.ts`
- `apps/daemon/src/history/service.ts`
- `apps/daemon/src/history/sqlite-domain.ts`
- `apps/daemon/src/history/store.ts`
- `apps/daemon/src/route-context-contract.ts`
- `apps/daemon/src/routes/data-export.ts`
- `apps/daemon/src/routes/editor.ts`
- `apps/daemon/src/routes/history.ts`
- `apps/daemon/src/routes/host-tools.ts`
- `apps/daemon/src/routes/project/index.ts`
- `apps/daemon/src/routes/routine.ts`
- `apps/daemon/src/server-context.ts`
- `apps/daemon/src/server.ts`
- `apps/daemon/tests/app-config-external-editor.test.ts`
- `apps/daemon/tests/data-export-archive.test.ts`
- `apps/daemon/tests/data-export-cli.test.ts`
- `apps/daemon/tests/data-export-routes.test.ts`
- `apps/daemon/tests/data-export-serialize.test.ts`
- `apps/daemon/tests/editor-routes.test.ts`
- `apps/daemon/tests/external-editors-args.test.ts`
- `apps/daemon/tests/external-editors-detect.test.ts`
- `apps/daemon/tests/history.test.ts`
- `docs/external-editor.md`
- `packages/contracts/src/api/app-config.ts`
- `packages/contracts/src/api/data-export.ts`
- `packages/contracts/src/api/editor.ts`
- `packages/contracts/src/api/history.ts`
- `packages/contracts/src/errors.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/tests/data-export.test.ts`

### 2026-08-03 — Notification centre, destructive-action gate, bulk actions, appearance editor, narrator


**Reason:** the remaining user-facing standards this project holds itself to,
none of which the imported application had.

**Notifications.** Everything that only informs is a non-blocking corner toast;
anything the user must decide stays a dialog. Dismissed notifications are kept
in a centre, because a toast that auto-dismissed and vanished is information the
user cannot get back.

**Destructive-action gate.** Two independently operated keys must both be
engaged before a full-range slider becomes active, and the action fires only
when all three have completed. It names the exact data affected rather than
asking whether the user is sure, keeps an always-available exit, and returns
focus to the control that opened it. The safety facts stay unambiguous at every
funny level — playful copy may style the experience, never obscure what will be
destroyed.

**Bulk actions.** Multi-select with ranges and a keyboard path, a select-all
that states plainly whether it means this page or every match, and a reviewable
preview of the exact count before anything runs. An excluded item is reported
rather than silently skipped.

**Appearance editor.** A continuous colour picker rather than a swatch list,
with a translator converting between colour spaces and reporting the contrast
the chosen colour will actually have. A property the platform cannot honour
stays visible with an explanation instead of silently dropping a saved value.

**Narrator.** Off by default, one utterance at a time through a serialized
queue, superseded lines replaced rather than stacked, and it yields to an active
screen reader rather than talking over it.

**Changed files:**

- `apps/web/src/components/ContextMenu.module.css`
- `apps/web/src/components/ContextMenu.tsx`
- `apps/web/src/components/DesignFilesPanel.tsx`
- `apps/web/src/components/DesignsTab.tsx`
- `apps/web/src/components/appearance/AppearanceRuntime.tsx`
- `apps/web/src/components/appearance/InfiniteColorPicker.module.css`
- `apps/web/src/components/appearance/InfiniteColorPicker.tsx`
- `apps/web/src/components/appearance/color.ts`
- `apps/web/src/components/appearance/colorNames.ts`
- `apps/web/src/components/appearance/contrast.ts`
- `apps/web/src/components/appearance/presets.ts`
- `apps/web/src/components/appearance/store.ts`
- `apps/web/src/components/appearance/translate.ts`
- `apps/web/src/components/appearance/typography.ts`
- `apps/web/src/components/bulk/BulkActionBar.module.css`
- `apps/web/src/components/bulk/BulkActionBar.tsx`
- `apps/web/src/components/bulk/BulkPreviewDialog.module.css`
- `apps/web/src/components/bulk/BulkPreviewDialog.tsx`
- `apps/web/src/components/bulk/messages.ts`
- `apps/web/src/components/bulk/plan.ts`
- `apps/web/src/components/bulk/run.ts`
- `apps/web/src/components/bulk/selection.ts`
- `apps/web/src/components/destructive/DestructiveGate.module.css`
- `apps/web/src/components/destructive/DestructiveGate.tsx`
- `apps/web/src/components/destructive/gateMachine.ts`
- `apps/web/src/components/narrator/NarratorSettingsPanel.tsx`
- `apps/web/src/components/narrator/lines.ts`
- `apps/web/src/components/narrator/narrator.ts`
- `apps/web/src/components/narrator/queue.ts`
- `apps/web/src/components/narrator/settings.ts`
- `apps/web/src/components/narrator/speech.ts`
- `apps/web/src/components/notifications/NotificationCenter.module.css`
- `apps/web/src/components/notifications/NotificationCenter.tsx`
- `apps/web/src/components/notifications/NotificationHost.module.css`
- `apps/web/src/components/notifications/NotificationHost.tsx`
- `apps/web/src/components/notifications/notificationStore.ts`
- `apps/web/src/components/shortcuts/registry.ts`
- `apps/web/src/components/shortcuts/useShortcuts.ts`
- `apps/web/src/styles/base.css`
- `apps/web/tests/components/DesignsTab.select-mode.test.tsx`
- `apps/web/tests/components/destructive/gateMachine.test.ts`
- `apps/web/tests/components/notifications/notificationStore.test.ts`

<!--
Format for entries, newest first:

### 2026-08-04 — Windows frameless window chrome

**Reason:** Windows builds must ship a custom Material Design 3 title bar
instead of the operating system's.

**Changed files:**

- `apps/desktop/src/main/runtime.ts`
- `apps/desktop/src/main/preload.cts`
-->

## Trademarks

Apache-2.0 grants no trademark rights (section 6). The "Open Design" name, its
logo, and the `io.open-design.desktop` application identity belong to the
upstream project. Builds published from this repository are branded
**Material Designer** with their own application identity, and are not produced
by, endorsed by, or affiliated with the upstream project.
