# Regex builder

**Status: partial in code.** The command palette now owns a full local builder
with plain-text default, explicit regex mode, flags, syntax feedback, bounded
matching and capture-aware results. Its builder is anchored to the palette's
own search field. The settings tab overflow menu now also owns an independent
anchored builder for its local section filter, committed at
[`6f03a832`](https://github.com/Ding-Ding-Projects/material-designer/commit/6f03a8321e8f6bf1fd1ddae56e95faf39a3e4d58). The follow-up
[`ec2c76d7`](https://github.com/Ding-Ding-Projects/material-designer/commit/ec2c76d7) keeps that portalled builder in its own focus scope while the menu remains open. The remaining search bars and the four tab-discovery surfaces
still need their own builders; the FileViewer's ten source-inventoried menus now
have independent field-owned builders, so the application does not yet meet the
project-wide standard. No installed build has been rendered for this audit.

## The requirement

**Every project includes a usable pattern builder. No project type is exempt.**
For a user-facing application it is an accessible screen or panel; for a library,
service or configuration repository it is a documented runnable command-line,
terminal or local web tool. A link to an unrelated external pattern-testing site
does not satisfy this.

### What it must offer

Guided construction for literals, character classes, anchors, groups,
alternation and quantifiers, plus a raw pattern editor, the supported flags,
sample text, syntax feedback, live matches and capture groups, and copy or
export. It must **clearly identify the actual engine, dialect, flags and escaping
rules** the project uses — a builder that produces patterns for a different
dialect is worse than none.

### Where it must appear

**Every search bar** provides direct access to the full builder and supports the
resulting pattern and flags in its search operation.

- **Plain-text search is the default.** Regex is an explicit opt-in.
- Query, pattern, flags, validation and mode synchronise **bidirectionally**.
- Constrained layouts use progressive disclosure, not a reduced feature set.
- A reduced regex toggle is not a substitute, and neither is an external tool.

### Anchored beside its field — this is the part the mockup misses

The builder is **anchored directly beside the search bar it belongs to**: an
affordance in or next to the field, opening a popover or inline panel that stays
visually attached to *that specific* field. This is the default presentation, not
an option.

Do not send the user to a separate page, a global dialog detached from the field,
or a different tab to build a pattern for a field already on screen. A modal or
full-screen builder is a fallback for genuinely constrained widths only, and even
then it returns focus to the originating field on close.

**When several search bars exist on one surface, each gets its own anchored
builder** bound to that field's query, pattern, flags and mode — never one shared
builder that silently applies to whichever field was touched last.

### Settings surfaces too

**Every settings, preferences, properties or adjustment surface carries its own
search bar wired to the same builder.** Global settings, per-item settings, every
tab within them, every properties or details panel, every appearance editor, and
every configuration page on the documentation site.

A surface is not exempt for being small, nested or obviously scannable. A user
who knows a setting's name should be able to type it anywhere settings live and
land on it. Each surface searches its own option labels, descriptions and current
values, and **states plainly when a match sits on a different tab** so the user
can navigate to it.

### Safety

Evaluate locally where practical. Do not transmit or persist patterns or sample
text without explicit need and consent. Bound pattern and sample sizes, isolate
or time-limit evaluation, handle zero-width matches safely, and protect the host
from catastrophic backtracking.

## Current implementation status

| Requirement | Status |
| --- | --- |
| A builder exists anywhere in the product | **Partial.** The command palette has the full builder; other required fields do not. |
| Reachable from every search bar | **Partial.** The command palette is wired; the remaining search inventory is not. |
| Anchored per field | **Partial.** The command palette builder is anchored to its field; the remaining fields are not wired. |
| Plain text default, regex opt-in | **Implemented for the command palette** through its own `useRegexSearch` controller; the remaining search inventory is still open. |
| Bidirectional synchronisation | **Implemented for the command palette** — the field, raw pattern editor, guided parts, flags and matcher share one controller; the remaining fields are still open. |
| Search on every settings surface | **Partial in design.** The mockup gives the settings sidebar its own search; individual settings tabs and panels do not have one. |
| Cross-tab match reporting | **Not designed.** |
| Engine and dialect identified in the interface | **Not designed.** |
| Backtracking and size protection | **Partial.** The command palette bounds pattern/sample inputs and match work; every remaining search surface still needs the same guard. |

### The gap between the mockup and the standard

> [!WARNING]
> The mockup implements the builder as **one shared, non-modal, draggable panel
> at a fixed viewport position** — bottom-right, 460px wide. Four different
> search fields open the same panel.
>
> The standard requires a builder **anchored to the field it belongs to**, one
> per field, each bound to that field's own query, pattern, flags and mode. The
> single shared panel is exactly the failure the standard names: a user cannot
> tell which field the panel is currently editing, and two fields cannot hold
> different patterns at once.
>
> The implementation must depart from the mockup here. The panel's *contents* are
> a good specification; its *placement and sharing model* are not.

### What the mockup does specify well

<details>
<summary><b>The builder panel's contents</b> — flags, token chips, live tester, and its four call sites</summary>

**Panel**: non-modal, draggable, 460px wide, 28px corner radius, on the
surface-container-high role with a strong drop shadow. Its header badge reads
"non-modal", which is the right idea stated in the right place.

**Pattern field**: 52px tall with a 2px primary-role border, monospace, showing
the delimiter and the active flag string as affixes so the user sees the complete
expression rather than a bare body.

**Six flags** as 36×36 pills, each with an explanatory title: global, ignore
case, multiline, dot-all, unicode, sticky. Default is global plus ignore case.

**Fifteen token chips** for guided construction: start and end anchors, digit,
word and whitespace classes, a character range, the three basic quantifiers, a
bounded quantifier, capturing and non-capturing groups, alternation, and
lookahead and lookbehind.

**Live tester**: evaluates against a sample using the real engine and reports the
match count, an explicit no-match state, or the engine's own error message in the
error colour when the pattern throws. A "how regex works" link sits beside it.

**Four call sites**, each with plain text as the default and an explicit regex
opt-in toggle: the global header search, the settings sidebar search, the
changelog search, and the command palette search. Two of the four guard
construction in a try/catch so an in-progress pattern cannot throw into the
render path — which is the right instinct and needs to be all four.

</details>

## Implementation notes

### Name the engine, because it is not one engine

The product spans a JavaScript interface, a JavaScript daemon, and a
shell-and-Git verification script. Their pattern dialects are not the same, and a
builder that silently implies one dialect while the search runs another produces
patterns that work in the preview and fail in use.

State the dialect in the builder's own interface, per call site. Where a search
runs somewhere other than the interface's own engine, either evaluate the preview
in that same engine or say plainly which engine the preview used.

### Per-field state is the whole design

Each search field owns: its query, its pattern, its flag set, its validation
state and its mode. The builder is a view onto **one** field's state, opened from
that field, anchored to it. Two fields open two builders with two independent
states.

The synchronisation is bidirectional within a field: typing in the query updates
the pattern when regex mode is on, editing the pattern updates the query,
toggling a flag updates the displayed expression, and switching modes preserves
what the user typed rather than clearing it.

### Guard evaluation everywhere, not in two places out of four

Every construction site wraps pattern compilation, because a partially typed
pattern is invalid far more often than it is valid — a user typing `[a-` has an
invalid pattern for as long as it takes to type the next character. An unguarded
compile throws into the render path on almost every keystroke of a character
class.

Report the engine's own error message. It is more useful than any paraphrase.

### Bound the inputs

Cap pattern length and sample size. Time-limit or isolate evaluation so a
catastrophically backtracking pattern cannot freeze the interface. Handle
zero-width matches explicitly — a global pattern that matches the empty string
loops forever in a naive match-all implementation, and this is the single most
common way a pattern tester hangs.

## Failure modes

| Failure | Consequence |
| --- | --- |
| One shared builder for several fields | The user cannot tell which field is being edited; two fields cannot hold different patterns. This is the mockup's current design and must not be carried forward. |
| A modal or full-screen builder as the primary presentation | Explicitly a fallback for constrained widths only. |
| Focus not returned to the originating field on close | The user has to find their place again after every pattern edit. |
| Regex on by default | Every metacharacter in ordinary text becomes a surprise. Plain text is the default everywhere. |
| Unguarded pattern compilation | Throws on nearly every keystroke inside a character class. |
| Zero-width match not handled | Infinite loop; the interface hangs. |
| No backtracking protection | A pasted pathological pattern freezes the application. |
| A settings tab or panel without its own search | The standard covers every settings surface individually. Small and nested are not exemptions. |
| A match on another tab reported as "no results" | The user concludes the setting does not exist. |
| The builder's dialect differing from the search's engine | Patterns that preview correctly and fail in use — the worst outcome, because it is silent. |
| A link to an external pattern site | Explicitly does not satisfy the requirement. |

## Security considerations

- **Catastrophic backtracking is a denial-of-service vector against the user's
  own machine.** A pattern pasted from anywhere can freeze the interface.
  Time-limit evaluation, cap input sizes, and prefer running evaluation somewhere
  it can be abandoned.
- **Patterns and sample text stay local.** Do not transmit or persist either
  without explicit need and consent. Sample text is frequently a paste of
  something private — that is what people test patterns against.
- **A pattern is not a sanitiser.** Where a builder-produced pattern reaches
  anything that filters, authorises or validates, treat it as untrusted user
  input and not as a security control.
- **Do not evaluate patterns against content the user did not choose.** The
  tester runs over the sample and the search's own scope, never over the wider
  filesystem or another project's data.

## Verification

**Nothing to verify yet.** Conformance requires all of:

- [ ] a builder anchored beside **every** search field in the product, opened
      from an affordance in or next to that field
- [ ] several search bars on one surface each opening their **own** builder with
      independent state
- [ ] plain text the default at every call site; regex an explicit opt-in
- [ ] bidirectional synchronisation of query, pattern, flags, validation and mode
      within a field
- [ ] focus returned to the originating field on close, including from the
      constrained-width fallback
- [ ] the engine and dialect named in the interface at each call site
- [ ] every settings, preferences and properties surface carrying its own search,
      **enumerated and checked one by one** — including each tab, each panel and
      each page of the documentation site
- [ ] a match on a different tab reported as such, with a way to navigate there
- [ ] test coverage against the project's real engine for: valid patterns,
      invalid patterns, no-match, unicode, multiline, zero-width matches, capture
      groups, adversarial backtracking patterns, and plain-text versus regex
      behaviour over the same query
- [ ] the full builder exercised from every search surface, not only the first one

The "enumerated and checked one by one" item is deliberate. This is the standard
most likely to be met on the main screens and quietly skipped on a nested
settings panel, so the verification is a list of surfaces rather than a spot
check.

## Suggested reading

- [tabs.md](tabs.md) — the four tab-discovery searches, each of which needs its own builder
- [material-design-3.md](material-design-3.md) — the appearance controls that each carry a search
- [language-modes.md](language-modes.md) — the builder's own copy is subject to the language modes too
- [accessibility.md](accessibility.md) — keyboard operation and focus return
