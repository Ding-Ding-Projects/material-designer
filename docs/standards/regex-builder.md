# Regex builder

**Status: source implementation hardened, built-artifact evidence pending.** The
command palette now owns a full local builder
with plain-text default, explicit regex mode, flags, syntax feedback, bounded
matching and capture-aware results. Its builder is anchored to the palette's
own search field. The settings tab overflow menu now also owns an independent
anchored builder for its local section filter, and the production LibrarySection
search now owns the same field-local controller and anchored builder, committed
at
[`6f03a832`](https://github.com/Ding-Ding-Projects/material-designer/commit/6f03a8321e8f6bf1fd1ddae56e95faf39a3e4d58). The follow-up
[`ec2c76d7`](https://github.com/Ding-Ding-Projects/material-designer/commit/ec2c76d7) keeps that portalled builder in its own focus scope while the menu remains open. The current source lane carries independent builders for the inventoried desktop and documentation fields, including FileViewer's ten real menus plus documentation tab overflow, tab list, and tab context menu. The five Library search/filter rows remain explicitly RED after the upstream reconciliation rather than being claimed from stale source.
The builder also exposes a capability matrix, exact token annotations, bounded
replacement preview with native capture semantics, Unicode code-point
construction, match navigation, expected match/no-match cases, field-owned
persistent snippets, profiling, and an honest structural trace boundary. High-risk
synchronous backtracking shapes are refused before evaluation, while budget
exhaustion remains visible. The hand-written inventory is recorded in
[search-surface-inventory.md](search-surface-inventory.md).
No hosted build or installed capture has rendered this lane yet.

## The requirement

**Every project includes a usable pattern builder. No project type is exempt.**
For a user-facing application it is an accessible screen or panel; for a library,
service or configuration repository it is a documented runnable command-line,
terminal or local web tool. A link to an unrelated external pattern-testing site
does not satisfy this.

### What it must offer

Guided construction for literals, character classes, anchors, groups,
alternation and quantifiers, plus a raw pattern editor, the supported flags
(`d`, `g`, `i`, `m`, `s`, `u`, `v`, `y` where the runtime exposes them),
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

The active JavaScript engine is synchronous, so a single `exec()` call cannot be
killed from the renderer. The shared compiler therefore refuses conservative
high-risk shapes before constructing or evaluating a `RegExp`: nested
quantifiers, quantified alternations, and quantified backreferences. The raw
pattern remains visible, the refusal reason is shown, and a previously valid
pattern remains the active search predicate. This is an explicit refusal
boundary, not a claim that a heuristic can prove all patterns safe.

Normal evaluations have separate pattern, sample, match-count, haystack and
cumulative list budgets. A timeout or exhausted budget is a visible state. The
list never silently turns a partial predicate into an apparently complete
filtered result: rows remain visible and the surface says that further filtering
was not performed. Unicode zero-width advancement follows ECMAScript's
code-point rule when `u` or `v` is active.

Snippet import checks the file byte bound before decoding, rejects invalid UTF-8,
duplicate keys and unknown top-level fields, and persists validated snippets
under a key derived from the originating field id. Sample text is never included
in a snippet.

## Current implementation status

| Requirement | Status |
| --- | --- |
| A builder exists anywhere in the product | **Implemented in source.** The anchored builder is shared, while controller and popover state remains field-local. |
| Reachable from every inventoried search bar | **33 rows are hand-written, 23 are wired at source level, and 10 remain explicitly RED.** The open rows are five Library fields, two split-source site registrations, and three documentation tab-discovery fields. Wired rows include exact stable ids for FileViewer's ten actual menus and the current desktop/documentation fields. Raw feature inputs outside this current route inventory remain open follow-up work. |
| Anchored per field | **Implemented in source.** Each `RegexSearchField` measures its own host, portals its own builder, re-anchors on viewport changes, and returns focus to its own input. |
| Plain text default, regex opt-in | **Implemented** through independent `useRegexSearch` controllers. |
| Bidirectional synchronisation | **Implemented.** Query, raw pattern, flags, validation, guided parts, and matcher share one controller per field. |
| Search on every settings surface | **Inventory-covered for the current settings routes**, with broader application audit kept open rather than silently marked complete. |
| Cross-tab match reporting | **Source contract present where the owning host supplies tab context; built-app verification is pending.** |
| Engine and dialect identified in the interface | **Implemented.** The builder names JavaScript RegExp, ECMAScript regular expressions, active flags, and a runtime-derived version or honest unavailable state. |
| Structured explanation and capability matrix | **Implemented.** `tokenizePattern`, `explainPattern`, and `REGEX_CAPABILITIES` retain exact source ranges and visible reasons for unsupported constructs. |
| Replacement preview, snippets, profiling and trace boundary | **Implemented.** Replacement input/output follows native unmatched-capture semantics, field-owned snippets persist locally after bounded byte validation, elapsed time and bounded match count are shown, and the engine's unavailable backtracking trace is stated honestly. |
| Backtracking and size protection | **Implemented fail-closed for the synchronous engine.** High-risk nested quantifier, quantified alternation, and quantified backreference shapes are refused before engine evaluation. Match and sample limits remain bounded, Unicode zero-width advancement preserves code points, and any list budget exhaustion is visibly surfaced without silently hiding rows. |
| Unicode construction and expected cases | **Implemented in source.** The workbench offers a Unicode code-point escape with a flag explanation, match navigation, and a bounded expected-match/no-match case suite. |
| Library cursor completeness | **Implemented in source.** The provider walks every opaque cursor with a stable snapshot, detects repeated cursors and pagination limits, and returns an explicit incomplete result that the Library and picker surfaces retain and label for retry. |

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

The JavaScript engine's `d` (indices) and `v` (Unicode sets) flags remain
visible in the picker. The picker feature-detects each flag at runtime and
leaves an unavailable flag visible with its reason. UnicodeSet intersection
and subtraction are conditional on `v`; without it the workbench explains the
syntax but does not claim that the active engine interprets set operations.

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

**Source verification added, built-artifact verification pending.** Conformance requires all of:

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

The source checks are `diagnostics.test.ts`, `RegexWorkbenchPanels.test.tsx`,
`searchSurfaceInventory.test.ts`, `scripts/check-regex-search-inventory.sh`,
and the behavioral site fixture `scripts/test-site-regex-safety.mjs`. The site
fixture imports the real tab matcher, exercises three nested false-negative
shapes that the old flat heuristic missed, and proves an ordinary quantified
sequence remains usable. It is source-level evidence until the hosted check runs.
The inventory test deliberately removes one row and one builder registration,
expects red, then restores the complete list and expects green. Hosted CI still
owns the package check and the real built-artifact interaction proof.

The "enumerated and checked one by one" item is deliberate. This is the standard
most likely to be met on the main screens and quietly skipped on a nested
settings panel, so the verification is a list of surfaces rather than a spot
check.

## Suggested reading

- [tabs.md](tabs.md) — the four tab-discovery searches, each of which needs its own builder
- [material-design-3.md](material-design-3.md) — the appearance controls that each carry a search
- [language-modes.md](language-modes.md) — the builder's own copy is subject to the language modes too
- [accessibility.md](accessibility.md) — keyboard operation and focus return
