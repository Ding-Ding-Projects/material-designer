# Language modes and tone levels

**Status: not started.** No Cantonese locale exists, and no tone control exists
anywhere in the product. The requirement is specified in the design mockup and
nothing has been implemented.

## The requirement

Every user-facing surface — the application, the landing page, the documentation
site, every settings tab, every dialog and every nested panel — provides:

**A persisted language mode** with exactly three baseline choices:

| Mode | Behaviour |
| --- | --- |
| English | English copy throughout. |
| Playful Hong Kong Cantonese | Written Cantonese, locally natural, in a playful register. |
| Bilingual | Both languages shown together, without crowding the interface. |

**Two independent persisted tone sliders**, from 1 (fully professional) to 5
(maximum playfulness) — one for English, one for Cantonese, adjustable
separately. They are a shipping requirement: two controls, actually wired to the
copy the product renders, persisted across restarts, and reachable from the
settings surface. One shared slider does not satisfy this. An unwired slider does
not satisfy this.

**The tone level applies to every category of message, with no exemptions** —
including destructive, financial, security, accessibility and error copy.

### Voice, never facts

This is the rule the whole standard turns on, and the one easiest to get wrong.

At **any** level, a message must still name what happened or is about to happen,
what will be affected, and what the user's options are, in unambiguous words:
which file, which account, which action is irreversible, what the error actually
was. Humour wraps those facts. It never replaces, softens or omits them.

A warning nobody can act on is a broken warning, not a funny one. A message that
is amusing but leaves the user unsure what a button will do has failed the
standard regardless of the slider position.

Cantonese copy stays respectful at every level. Humour never targets the user,
their data loss, their money, or their disability.

### Bilingual layout

Bilingual mode shows both languages without crowding. Keep the primary label
prominent and use a compact secondary label or progressive disclosure for the
second. Validate at narrow widths — bilingual mode produces the longest strings
in the product and is where clipping appears first.

### Disclosure

At first run, and in the setting itself, state plainly that the tone level styles
**all** messages including errors and warnings, and let the user change or reset
it at any time. Default to a level the audience would expect rather than assuming
maximum playfulness.

### Scope

Non-user-facing libraries and infrastructure are exempt until they expose a
user-facing surface. Everything with a rendered surface is in scope, the
documentation site and its own settings page included.

## Current implementation status

### What exists

**19 locales ship** in the vendored interface:

`en` · `id` · `de` · `zh-CN` · `zh-TW` · `pt-BR` · `es-ES` · `ru` · `fa` · `ar` ·
`ja` · `ko` · `pl` · `hu` · `fr` · `uk` · `tr` · `th` · `it`

Each has a dictionary registered in the interface's locale index, with a display
label in its own script. Documentation is separately translated into thirteen
languages.

The translation system is well shaped for what this standard needs: the
dictionary is a **flat, dot-namespaced typed key interface**, so a missing key is
a compile error naming the exact string rather than a blank space at runtime, and
a coverage check enforces completeness.

### What does not exist

| Requirement | Status |
| --- | --- |
| Hong Kong Cantonese locale (`zh-HK`) | **Absent.** A repository-wide search for `zh-HK` and `zh_HK` across TypeScript, JSON and Markdown under `design/` returns **zero** matches — no locale file, no union member, no display label, no translated documentation. |
| Three-way language mode (rather than a 19-item locale list) | **Absent.** There is a locale picker; there is no English / Cantonese / bilingual mode concept. |
| Bilingual mode | **Absent.** No surface renders two languages together. |
| English tone slider | **Absent.** |
| Cantonese tone slider | **Absent.** |
| Tone applied to error and warning copy | **Absent** — there is no tone system to apply. |
| First-run disclosure of what the tone setting affects | **Absent.** |
| The same controls on the landing page and documentation site | **Absent.** |

> [!NOTE]
> `zh-TW` is Traditional Chinese, not Cantonese. It is written in the same script
> Cantonese uses but is a different language variety with different vocabulary
> and grammar. Treating it as a substitute would produce copy that reads as
> stiff, non-local Mandarin-in-traditional-characters to a Hong Kong reader.
> The standard asks for Cantonese; `zh-TW` does not satisfy it.

### What the mockup specifies

The design mockup's **Language & tone** settings panel specifies the whole
requirement concretely:

- Three radio options, each with a live sample of the same message:
  - English — "Release published. Installer attached."
  - Cantonese — "出咗版喇，安裝檔跟埋落去。"
  - Bilingual — "Release published. · 出咗版喇。"
- **Bilingual is the default.**
- Two independent 1–5 sliders, the English one tinted with the primary colour
  role and the Cantonese one with the tertiary role, so they are visibly separate
  controls rather than one control shown twice. Defaults: English 5, Cantonese 5.
- **Five authored samples per language, one per level** — not generated, not
  interpolated. The English level-1 sample is "Fixed the crash on empty input.";
  the level-5 sample is "Empty input crashed the app, which is a bold
  interpretation of \"handle gracefully\". Fixed." Both name the same defect and
  the same fix, which is the voice-not-facts rule shown rather than described.
- A live preview panel that re-renders as the sliders move.

The mockup is a specification. **None of it is wired into the application.**

## Implementation notes

### Adding the Cantonese locale

Three files under `design/` must change, and therefore three `MODIFICATIONS.md`
allowlist paths are needed before the edit — one per changed path, and a newly
added file counts the same as an edited one. See
[../porting/verification.md](../porting/verification.md):

| File (relative to `design/`) | Change |
| --- | --- |
| `apps/web/src/i18n/locales/zh-HK.ts` | New dictionary. |
| `apps/web/src/i18n/index.tsx` | Import and register it. |
| `apps/web/src/i18n/types.ts` | Add to the locale union, the locale list, and the display-label map. |

The type header states the rule directly: adding a locale requires a new
dictionary and its registration. Because the dictionary interface is flat and
typed, an incomplete Cantonese dictionary will not compile — which is the
verification mechanism, not an obstacle.

**Three is the count for the interface dictionary, not for every string the
product renders.** The vendored tree carries a second, separate content-string
system: `apps/web/src/i18n/content.ts` imports a per-locale `content.<locale>.ts`
module for each language it covers. Extending Cantonese into that system would
add its own new file and its own edit to `content.ts`, and therefore its own
allowlist entries. Count the paths actually touched when the work lands rather
than quoting a number from here — the verifier counts paths, and it is the only
authority on how many there were. ROADMAP 3.1 tracks the same work.

That second system is optional at first, which is why three is the *minimum* and
not the whole answer: without a `content.zh-HK.ts`, `zh-HK` falls through the
existing `locale.startsWith('zh')` branch to the `zh-CN` content, exactly as
`zh-TW` does today. It reads as non-local Mandarin to a Hong Kong reader, so it is
a stopgap rather than a destination — but it means the locale can land in three
paths and grow a fourth later.

### The mode layer sits above the locale layer

Do not model the three modes as three locales. English maps to `en` and Cantonese
to `zh-HK`, but **bilingual is not a locale** — it is a rendering mode that
composes two dictionaries. Modelling it as a third dictionary means every string
is written three times and the two halves drift apart the first time somebody
edits only one.

### The tone level is a dictionary dimension, not a post-processor

Five authored variants per string, per language, selected by the slider. Do not
attempt to generate tone by transforming a neutral string at runtime: that is how
a warning loses the clause that named the file. Authoring all five is more work
and is the only approach in which the facts are guaranteed to survive, because a
human wrote each variant and can be reviewed on whether it still names them.

Where a string genuinely has one correct form at every level — an identifier, a
version number, a file path, an error code — it has one variant and the tone
system leaves it alone.

## Failure modes

| Failure | What it looks like | Why it matters |
| --- | --- | --- |
| A tone variant drops a fact | "Something went a bit wrong 🙃" at level 5, where level 1 said "Could not write `report.pdf`: disk full" | The whole standard fails. The user cannot act. |
| One shared slider | A single 1–5 control affecting both languages | Explicitly not the requirement. The two languages have different registers and a user may want formal English with playful Cantonese. |
| A slider that persists but does not render | Setting saves, copy never changes | Worse than no slider: it claims a capability that is absent. |
| Errors exempted from tone | Error copy stays flat while everything else changes | The standard has no exemptions. The disclosure is what makes that acceptable. |
| Bilingual mode clips | Truncated labels at narrow widths or high display scale | Bilingual produces the longest strings; it is the mode to test first, not last. |
| A missing Cantonese key falls back to English silently | A half-translated interface presented as translated | The typed dictionary prevents this at compile time. Do not add a runtime fallback that hides it. |
| `zh-TW` treated as Cantonese | Traditional characters, Mandarin phrasing | Reads as foreign to the intended audience. Not a shortcut. |
| The landing page or documentation site skipped | Modes in the application only | Every surface, individually. Documentation sites are the most commonly skipped and are in scope. |

## Security considerations

- **Tone must never obscure a security decision.** Credential prompts, permission
  grants, destructive confirmations and scope warnings keep their exact meaning at
  level 5. If a playful variant makes it unclear what is being authorised, the
  variant is wrong — not the rule.
- **Translated strings are code.** A dictionary can carry markup or interpolation
  placeholders. Treat locale files as reviewed source, and never render a
  translated string as raw markup into a context that trusts it.
- **Do not send text off the machine to translate or restyle it.** The product is
  local-first. Tone variants are authored and shipped, not generated at runtime
  from user content.

## Verification

**Nothing to verify yet.** The commands below are what will demonstrate
conformance once the work exists.

```bash
cd design
pnpm i18n:check       # every key present in every locale, Cantonese included
pnpm i18n:coverage    # the coverage report
pnpm typecheck        # an incomplete dictionary is a compile error
```

Conformance requires all of:

- [ ] `zh-HK` present in the locale union, the locale list, and the label map
- [ ] a complete `zh-HK` dictionary — proven by the translation check passing
- [ ] three language modes selectable, persisted, and surviving a restart
- [ ] bilingual mode rendering both languages with no clipping at the narrowest
      supported width and at every supported display scale
- [ ] two independent sliders, each persisted separately
- [ ] moving each slider demonstrably changes rendered copy **at every level from
      1 to 5** in **both** languages
- [ ] error and warning copy included, shown by capturing the same error at level
      1 and level 5 and confirming both name the same file, cause and remedy
- [ ] the first-run disclosure present and dismissible
- [ ] the same controls present on the landing page and the documentation site,
      each verified individually

The error-copy check is the one that must not be skipped. It is the requirement
most likely to be quietly dropped, and the one where dropping it does real harm.

## Suggested reading

- [material-design-3.md](material-design-3.md) — the appearance system these controls live inside
- [accessibility.md](accessibility.md) — why bilingual mode is the layout test that matters
- [../architecture/overview.md](../architecture/overview.md) — where the translation layer sits
- [../porting/verification.md](../porting/verification.md) — how to legitimately edit files under `design/`
