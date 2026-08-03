# The startup dim sum surprise

**Standard 12.** One launch in ten shows a randomly chosen dish — its name in both
languages and a bundled photograph — as a non-blocking, auto-dismissing surface
that never gets in the user's way and cannot be switched off.

**Status: implemented in the application, not yet audited in a running
interface.** The repository catalogue is verified — 24 dishes with 24 local
images — and twelve of them, one per category, are bundled into the web app at
`design/apps/web/public/dim-sum/` by `scripts/generate-dim-sum-catalog.mjs`,
copied byte-for-byte and re-checked against the catalogue's own SHA-256. The
draw, the dish's name and its alt text are in
`design/apps/web/src/lib/dim-sum/surprise.ts`; the toast is
`design/apps/web/src/components/DimSumSurprise.tsx`, mounted once from `App.tsx`.
There is no setting that disables it.

`design/apps/web/tests/dim-sum.test.ts` asserts the 10% rate over 100,000 seeded
draws, that a launch's draw is spent exactly once whether it wins or loses, that
every bundled photograph still hashes to what the catalogue records, and that
each dish's alt text names the dish it shows. **Nobody has yet watched the toast
appear in a running build**, so the reduced-motion behaviour, the anchoring and
the bilingual layout are unverified by eye. The documentation site implements the
draw separately.

## The requirement

### The draw

- **A 10% chance at startup**, from a **fresh random draw per launch**.
- **Never more frequent than stated**, and **never twice in one launch**.
- The dish is chosen at random from the bundled catalogue.

### What it shows

The dish's name in **both languages** — for example "Shrimp dumpling · 蝦餃" —
plus its bundled photograph.

The active language mode governs the presentation, and the per-language tone
level styles the copy *around* the dish. **The dish's own name stays correct at
every tone level and in every mode**: it is a fact, and the voice-not-facts rule
applies to it exactly as it applies to an error message. Nobody's lunch gets
renamed because the humour slider is at 5.

### How it behaves

**Non-blocking and auto-dismissing.** It never gates startup, never steals focus,
and never delays the application becoming usable.

It **must not appear** during:

- a first run,
- an error path,
- an update,
- or any flow where the user is mid-task.

### Assets are bundled

Local assets only. No network fetch, no third-party origin, no tracking — the
same rule that governs every other asset in the product, see
[local-assets.md](local-assets.md). Each image carries **meaningful alt text
naming the dish**, so a screen-reader user gets the same delight rather than
"image".

It respects reduced-motion preferences and any quiet or do-not-disturb setting.

### It cannot be opted out of

**No setting disables it.** Any existing off switch is removed, and stored
preferences are migrated forward so an old profile simply rejoins the draw.

> [!WARNING]
> **The mockup draws this with an on/off switch**, which the standard forbids.
> The switch must not be carried into the implementation, and a port that copies
> the mockup faithfully will carry it in without anyone noticing.

## Why an un-optable feature is acceptable here

A feature the user cannot turn off is normally a bad idea, and the objection is
worth taking seriously rather than waving away.

It holds here **only because of the behaviour rules above, and those rules are
what make it acceptable.** The surprise never blocks, never takes focus, never
delays anything, never interrupts a task, and disappears on its own. There is no
state in which a user is stuck with it, or has to dismiss it to continue, or
loses a second of work to it. What would be there to switch off is a small
picture that appears near the edge of the screen once every ten launches and then
leaves.

The rules are therefore not decoration around the feature — **they are the
argument for it**. An implementation that keeps the un-optable part and relaxes
the non-blocking part has kept the wrong half, and has shipped a nag. See
[notifications.md](notifications.md) for the general rule against those.

The exclusions matter for the same reason. A first run is when a user is deciding
whether to trust the product; an error path is when they need to read something
carefully; an update is when they want to know what changed. A dish photograph in
any of those three is not a delight, it is an interruption wearing one.

## Current implementation status

| Requirement | Status |
| --- | --- |
| Bundled catalogue | **Implemented.** 24 dishes indexed at `assets/dim-sum/index.json`, 24 images present under `assets/dim-sum/images/`. Both counts were checked when this page was written. |
| Images copied, never generated | **Implemented** by `scripts/import-dim-sum.sh`, which treats the source image manifest as the eligibility list, recomputes each file's checksum before copying, and skips and reports any dish that fails. See [releases.md](releases.md#how-the-catalogue-is-produced). |
| Bilingual names and alt text in the catalogue | **Implemented.** Each record carries English and Traditional Chinese names, jyutping, category, and English and Cantonese alt text. |
| The draw in the application | **Not present.** |
| Non-blocking presentation in the application | **Not present.** |
| Exclusion during first run, error, update, mid-task | **Not present.** |
| No off switch | **Not yet applicable in the application**, and the mockup contains one that must not be ported. |
| The draw on the documentation site | **Implemented** in the site's committed source. Not audited against the checklist below. |

> [!NOTE]
> The catalogue being complete is genuinely useful even before the surprise
> exists, because the release code name reads from the same index — see
> [releases.md](releases.md). That is why the catalogue landed first: one
> verified asset set serves two requirements.

## Configuration

**There is no configuration, and that is the requirement.** The table below
records the fixed values so that a future reader can tell a deliberate constant
from an accident.

| Value | Setting | Why it is fixed |
| --- | --- | --- |
| Probability | 10% per launch | Stated in the standard. Never raised, never lowered by a preference. |
| Draws per launch | Exactly one | A second draw in the same launch would double the effective rate. |
| Enabled | Always | No switch, and any stored preference from an earlier build is migrated forward rather than honoured. |
| Source | The bundled catalogue | No remote source, no runtime download, no fallback that fetches. |

The only things that vary are the ones that vary everywhere: the active language
mode, the per-language tone level, reduced motion, and any quiet-hours setting
the product already has.

## Failure modes

| Failure | Consequence |
| --- | --- |
| An off switch | Explicitly forbidden. The most likely way it arrives is by porting the mockup faithfully. |
| A stored preference from an old build silently disabling it | The same failure with a longer fuse: nothing in the interface shows why one profile never sees a dish. |
| A draw per session-restore rather than per launch | The effective rate is no longer 10% and nobody can tell what it is. |
| Two draws in one launch | The same. Also produces the one thing the rule against it exists to prevent — a "surprise" twice in a row. |
| Appearing during first run | The first impression of the product is an interruption. |
| Appearing on an error path | Sits on top of the message the user needs to read. |
| Appearing mid-task | The whole justification for it being un-optable evaporates. |
| Stealing focus | The user's next keystroke goes somewhere they did not intend. |
| Delaying the window becoming usable | Turns a delight into a measurable startup regression. |
| A network fetch for the image | Breaks a local-first product offline, and discloses a launch to a third party. |
| Missing or generic alt text | The delight is sighted-only, which is the opposite of the intent. |
| The dish's name translated or "made funnier" at tone level 5 | Its name is a fact. Style the copy around it. |
| An index entry whose image is absent | A broken image where a photograph should be. The importer's checksum step exists to prevent exactly this. |

## Security considerations

- **Everything is local, which is the point.** No request leaves the machine for
  this feature. A launch-time request to a third-party origin would disclose that
  the user opened the application, and how often — for a product whose selling
  point is that everything stays on the machine, that is a contradiction rather
  than an optimisation.
- **The images are third-party content held byte-for-byte.** They are copied and
  checksum-verified rather than re-encoded, so what ships is what was verified.
  Never substitute an image at build time or fetch a replacement.
- **The surface renders on top of the application.** Keep it free of anything
  drawn from user content — it must show a dish and its name and nothing else, so
  there is no path from a document, project or account name into a surface that
  appears unprompted and is frequently on screen during a screen share.
- **Randomness does not need to be cryptographic**, and should not pretend to be.
  It is a decorative draw with no security property; use the platform's ordinary
  random source and do not consume entropy that something else needs.

## Verification

**Nothing has been verified.** The catalogue's two counts were checked; the
behaviour has not been observed anywhere, because the feature does not exist in
the application.

Conformance requires all of:

- [ ] the surprise firing at the stated probability from a **fresh draw per
      launch**, verified statistically over many launches rather than inferred
      from the code
- [ ] never firing twice in one launch
- [ ] **no off switch anywhere** — verified by searching the settings surface,
      the command palette and the stored preference schema
- [ ] a stored preference from an earlier build migrated forward, so an old
      profile rejoins the draw
- [ ] never appearing during first run, an update, or an error path — each
      triggered deliberately
- [ ] never stealing focus, verified by typing immediately after launch and
      checking where the characters went
- [ ] no measurable delay to the window becoming usable
- [ ] auto-dismissing without interaction, and dismissible early
- [ ] alt text naming the dish, read back through a screen reader
- [ ] reduced motion and quiet settings honoured
- [ ] the dish's name exact in all three language modes at tone levels 1 and 5,
      with only the surrounding copy changing
- [ ] every indexed dish resolving to a bundled image that decodes
- [ ] a request audit of a running build showing **no** network activity
      attributable to this feature

The statistical check and the request audit are the two that cannot be replaced
by reading the source. Everything else is visible in a diff; those two are
properties of the running build.

## Suggested reading

- [releases.md](releases.md) — the release code name that reads the same catalogue, and how `scripts/import-dim-sum.sh` produces it
- [local-assets.md](local-assets.md) — the bundled-assets rule this feature is the most visible instance of
- [notifications.md](notifications.md) — the non-blocking rules that make an un-optable surface acceptable
- [language-modes.md](language-modes.md) — bilingual naming, and why the dish's name is a fact rather than copy
- [accessibility.md](accessibility.md) — alt text, focus, and reduced motion
- `ROADMAP.md` §3.4 — the tracked work item
