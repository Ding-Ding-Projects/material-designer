# Three ways `Test the web application` stayed red after the test bugs were fixed

Companion to the six failures fixed directly (see `MODIFICATIONS.md`, "Six
`Test the web application` failures that were the test, not the code"). These
three are written up instead, because each either needs a product decision
this session cannot make, or a fix broad enough that it should not land
without running the suite it would change — and this repository's own rule is
install/build/test happens in CI, not on a contributor machine (`AGENTS.md`,
"Validation strategy").

> [!NOTE]
> **Status: diagnosed, not fixed.** All three still fail as of commit
> `aaf93d0` on `Verify` runs
> [31022544564](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31022544564)
> (`main`) and
> [31022352728](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31022352728)
> (branch), job `Unit tests` → step `Test the web application`
> (`92362677000`), and on the same failing run on `main`'s parent, `ac37ac7`.

## Symptom 1 — two CSS assertions read a value from behind a media query they don't know exists

```
FAIL  tests/styles/workspace-tabs-chrome.test.ts > workspace tabs chrome styles > keeps workspace tabs compact and centered in the top chrome
AssertionError: expected '44px' to be '250px'

FAIL  tests/styles/wave8-overlay-m3.test.ts > Wave 8 overlay surfaces > docks the message centre as a side sheet instead of floating an inset card
AssertionError: expected 'var(--radius) var(--radius) 0 0' to be 'var(--md-sys-shape-corner-xl) 0 0 var(--md-sys-shape-corner-xl)'
```

### The cause

Both values are exactly right in the unconditional rule:

- `apps/web/src/styles/shell.css` — `.workspace-tab { … max-width: 250px; … }`
  at line 214.
- `apps/web/src/components/MessageCenter.module.css` — `.panel { … border-radius:
  var(--md-sys-shape-corner-xl) 0 0 var(--md-sys-shape-corner-xl); … }` at
  line 36.

Both files also have a **narrow-viewport `@media` block**, further down, that
legitimately redeclares the same selector with different, intentional values
for a compact layout — `shell.css` shrinks the tab to a 44px icon-only tab
under some width, and `MessageCenter.module.css` squares off the side sheet
into a bottom sheet under 640px (`border-radius: var(--radius) var(--radius) 0
0`, at line 458 — itself still on the pre-M3 `--radius` token, which is a
second, smaller, undecided question).

Both test files read CSS with a hand-rolled block extractor:

```ts
const rulePattern = /([^{}]+)\{([^}]*)\}/g;
```

This regex has no concept of nesting. Handed `@media (...) { .panel { ...one
brace pair... } }`, it matches the *inner* rule as if it were a top-level one —
the "selector" text before `{` happens to still read `.panel`, because the
`@media (...)` wrapper's own opening brace and the inner rule's opening brace
both look like ordinary rule starts to a flat regex. The helper then
concatenates every block whose selector text matches, in file order, and
takes the **last** declared value for a given property
(`.at(-1)` in both `ruleValue`/`value`) — which is a correct design for "a
later rule in the cascade wins," but silently wrong here because "later in the
file" and "later in the cascade" are not the same thing once a `@media` block
is involved. The narrow-viewport override always sorts after the base rule in
both files, so it always wins the `.at(-1)`, regardless of which one the
un-conditioned assertion actually means to read.

### Why this was not fixed here

Both helpers are shared by every other assertion in their file — 6 more calls
in `workspace-tabs-chrome.test.ts`, a dozen more in `wave8-overlay-m3.test.ts`
— and none of those currently fail, which means none of them currently reads a
selector that only exists inside a media query. A brace-nesting-aware rewrite
(track depth, only collect blocks whose selector chain has zero `@media`
ancestors, or explicitly parameterize on media context) is the correct fix,
but "correct" here can only be confirmed by running the whole file's suite
afterward, and this repository's install is heavy enough that it happens in CI
only (`AGENTS.md`, "Validation strategy" and "5.2 Building happens in
continuous integration, not on a contributor machine" in `HANDOFF.md`). A
narrower patch scoped to just these two call sites would dodge the same risk
for these two assertions but leave the shared helper carrying the same blind
spot for the next person who adds a selector that happens to live only inside
a media query — worth doing, but as a reviewed PR against the helper itself,
not a fix folded into an unrelated CI triage pass.

### How to fix it properly

Replace the flat regex scan with one that tracks brace depth and only records
a block when depth returns to the file's top level (or, more simply, strip
every `@media (...) { … }` span — matched with its own depth counter, not a
regex — before running the existing block scan, since none of the currently
passing assertions in either file appear to need a media-scoped value).
Re-run `pnpm --filter @open-design/web test -- workspace-tabs-chrome
wave8-overlay-m3` after, and diff the full pass/fail list against this run's,
not just the two lines above — the point of the shared helper is that a fix to
it can change more than the two known callers.

## Symptom 2 — two more CSS assertions in the same file disagree with an un-nested rule, for real

```
FAIL  tests/styles/workspace-tabs-chrome.test.ts > workspace tabs chrome styles > keeps the project composer input inset and focus ring polished
AssertionError: expected 'var(--md-sys-elevation-0)' to be 'var(--shadow-sm)'

FAIL  tests/styles/workspace-tabs-chrome.test.ts > workspace tabs chrome styles > uses a rounded highlight for inactive workspace tab hover
AssertionError: expected '0 0 var(--md-sys-shape-corner-s) var(--md-sys-shape-corner-s)' to be '7px'
```

Unlike Symptom 1, both selectors here (`.app .composer-shell` and
`.workspace-shell .workspace-tab:not(.is-active):hover`, both in
`apps/web/src/styles/viewer/routines.css`) resolve to exactly **one** block
each, no `@media` involved — confirmed by re-running the test file's own
`cssDeclarations`/`ruleValue` logic against the real files. The disagreement is
real, not a parsing artifact.

### The cause, as far as it can be read from here

`box-shadow: var(--md-sys-elevation-0)` on `.app .composer-shell` was
introduced by commit `fb5334c` ("land four workstreams," the Wave 4/5 M3
migration), which changed it from `var(--shadow-sm)`. The **test's own inline
comment**, written at the same time as the assertion, says only `border-color`
was meant to move: *"The focus and hover borders below still carry accent
mixes, which is why only this one moved."* `--md-sys-elevation-0` resolves to
`none` (`styles/md3-tokens.css`); `--shadow-sm` resolves to
`var(--md-sys-elevation-1)` (`styles/tokens.css`) — a real, visible drop
shadow. So either the CSS drifted further than the comment describing it
says it should have, or the comment is the part that is stale and the box
shadow's move to flat was intentional and just never got written back into the
assertion. Both readings are plausible; nothing in `fb5334c`'s commit message
resolves which.

The hover-tab `border-radius` (`.workspace-shell .workspace-tab:not(.is-active):hover`)
has the same shape: the test wants a plain `7px`, the file has the M3 corner
token expression. No commit message or comment nearby explains whether this
one was meant to move onto the token scale too.

### Why this was not fixed here

This is a design call, not a bug with one correct answer visible from the
source: "should the composer's resting elevation be flat or a soft shadow"
and "should the hover highlight's corner follow the M3 shape scale or stay a
fixed `7px`" are both product decisions, and `HANDOFF.md` §4 records plainly
that **nobody has looked at the running interface** for this wave — "Waves
1–5 and 7 landed; 6 and 8 in progress," verified only by typecheck and unit
tests, with visual review still the largest recorded gap in this project's
evidence. Changing the CSS to match the test, or the test to match the CSS,
without seeing either rendered is exactly the kind of guess this project's own
history warns against (`HANDOFF.md` §3's density-setting story: five custom
properties changed with one reader between them, and every check anyone
thought to run said it worked).

### How to resolve it

Render the composer and an inactive hovered tab at both candidate values,
decide which one is intended, then fix whichever side (CSS or test) is wrong
— and write the reason down next to the change, the way `fb5334c`'s own
comment tried to and fell one clause short of doing completely.

## Symptom 3 — an `inert` attribute that the source sets and the test does not see

```
FAIL  tests/components/SettingsDialog.execution.test.tsx > SettingsDialog execution settings BYOK interactions > takes the surface it covers out of the keyboard path, and gives it back
AssertionError: expected false to be true
  ❯ tests/components/SettingsDialog.execution.test.tsx:615:45
    expect(workspace.hasAttribute('inert')).toBe(true);
```

### What was checked

`SettingsDialog.tsx` has a `useLayoutEffect` (line 3551) that reads
`settingsPageRef.current.parentElement`, marks every sibling that is not
already `inert` as `inert`, and removes it again on cleanup. `settingsPageRef`
is attached to the component's actual root element (line 4388,
`data-testid="settings-page"`) — not a portal, not a wrapper a level further
in, confirmed by the *same test file*'s adjacent, passing assertion
(`document.querySelector('.settings-page')` resolves at line 582). The test
helper's own comment states the intended DOM shape correctly: *"The page's
parent IS the container, so a node placed there first is a genuine sibling of
it,"* and the test appends `workspace` to `container` before calling
`render(<SettingsDialog … />, { container })`, which by React Testing
Library's contract renders the component's output as `container`'s children —
so `workspace` and the settings page's root element should land as siblings
under one parent, exactly what the effect scans.

Reading the source did not turn up why the effect would not fire or would not
find `workspace`: no early return before the ref's element renders (the
`.settings-page` div is the unconditional return value), no portal, and the
effect's dependency array (`[]`) is the ordinary "run once after the first
commit" shape, which should still see a populated `parentElement` because
`useLayoutEffect` runs after the DOM mutations for that same commit are
already in place.

### Why this was not fixed here

Nothing above rules out a genuine defect versus a test-harness quirk (a second
render, an unexpected wrapper from a provider not visible in this file, or an
interaction with one of `SettingsDialog`'s other effects that removes the
attribute before the assertion runs) — and guessing between "add a dependency
array entry," "move the ref," or "the test's DOM assumption is subtly wrong"
without seeing the actual DOM at the moment of assertion would be exactly the
kind of unverified fix this repository's discipline exists to prevent.

### How to resolve it

Run this one test in isolation with `screen.debug()` (or a breakpoint)
immediately before line 615, inside CI or a Windows/Linux dev environment with
the workspace installed — this needs the actual React runtime, which this
diagnosis pass did not have (`AGENTS.md`, "Validation strategy": heavy install
happens in CI). Compare the live `container.outerHTML` against what the test's
own comment says it should be; the divergence, once seen, should point
straight at whichever of the theories above (or a fourth one) is real.

## Security considerations

None of the three. All are either a test-infrastructure blind spot (Symptom
1), a CSS value that affects only visual presentation (Symptom 2), or an
accessibility-affecting DOM attribute exercised only in a test harness
(Symptom 3) — none touches an auth, network, or data-handling path.
