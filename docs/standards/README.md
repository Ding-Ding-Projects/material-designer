# Standards

The requirements Material Designer holds itself to, and an honest account of how
far each one has got.

> [!IMPORTANT]
> **Almost nothing here is implemented in the product.** The vendored upstream
> product satisfies a few of these requirements incidentally; release machinery
> exists as committed scripts and workflows; the rest are not started. The
> application has not been built or run, so every entry below is assessed by
> reading source, scripts and the design mockup — never by using a running
> application.
>
> Every file in this category states the requirement, its status, and how
> conformance will be verified. Where the answer is "not started", it says so.

## Files in this category

| File | Standard |
| --- | --- |
| [language-modes.md](language-modes.md) | English, playful Hong Kong Cantonese, and a bilingual mode; two independent 1–5 tone sliders that restyle voice without changing facts. |
| [material-design-3.md](material-design-3.md) | Full Material Design 3 conformance, and the runtime appearance customization that goes with it. |
| [regex-builder.md](regex-builder.md) | A pattern builder anchored beside every search field, with plain text as the default. |
| [tabs.md](tabs.md) | Browser-style tabs everywhere: overflow, reordering, pinning, grouping, four discovery searches, bulk close, persistence. |
| [notifications.md](notifications.md) | Non-blocking notifications, a notification centre, and the super-confirmation gate that destructive actions must pass. |
| [accessibility.md](accessibility.md) | Keyboard reachability, visible focus, roles and names, contrast, reduced motion, and no clipping at any scale — as completion blockers, not polish. |
| [export-and-bulk-actions.md](export-and-bulk-actions.md) | Everything exportable in every format that can faithfully represent it, saying what would be lost before it runs; multi-select and the full action set in bulk on every list. |
| [releases.md](releases.md) | What every release must carry: an installer, a code name, a line-count table, and honest continuous-integration evidence. |

## Status at a glance

| # | Standard | Status | File |
| --- | --- | --- | --- |
| 1 | Language modes + two tone sliders | **Not started.** 19 locales ship; Cantonese is not one of them. No tone slider exists. | [language-modes.md](language-modes.md) |
| 2 | Material Design 3 conformance | **Not started.** Specified in full by the mockup; no code written. | [material-design-3.md](material-design-3.md) |
| 3 | Runtime appearance customization | **Not started.** No per-element editor, no continuous colour picker, no presets. | [material-design-3.md](material-design-3.md) |
| 4 | Regex builder on every search bar | **Not started.** Designed in the mockup as one shared panel, which does not yet meet the anchored-per-field requirement. | [regex-builder.md](regex-builder.md) |
| 5 | Browser-style tabs everywhere | **Partial in design only.** A tab strip is drawn; overflow, pinning, grouping and the four searches are absent. | [tabs.md](tabs.md) |
| 6 | Non-blocking notifications + centre | **Designed, not built.** Both surfaces appear in the mockup. | [notifications.md](notifications.md) |
| 7 | Super-confirmation for destructive actions | **Not started, and not yet designed.** Absent from the mockup entirely. | [notifications.md](notifications.md) |
| 8 | Command palette | **Designed, not built.** Meets the requirement on paper, including inline live controls. | [material-design-3.md](material-design-3.md) |
| 9 | Changelog viewer | **Designed, not built.** Meets the requirement on paper, commit links included. | [releases.md](releases.md) |
| 10 | Local version history | **Designed, not built.** Shown for settings only; documents and records are not covered yet. | [releases.md](releases.md) |
| 11 | Export everything, bulk actions everywhere | **Partial upstream.** The product exports several formats already; the full matrix, the archive options, the say-what-will-be-lost rule and universal bulk actions are not done. | [export-and-bulk-actions.md](export-and-bulk-actions.md) |
| 12 | Startup dim sum surprise | **Not started** in the application. Drawn in the mockup with an off switch, which the standard forbids. A 24-dish catalogue with local images is bundled. | [releases.md](releases.md) |
| 13 | Release code name + line count | **Machinery built, no release observed.** A committed counter, a code-name picker and the release workflow all exist. | [releases.md](releases.md) |
| 14 | Accessibility and sizing | **Not started.** Stated as an intent in the mockup; unverified in code. | [accessibility.md](accessibility.md) |
| 15 | All assets bundled locally | **Not met.** The mockup loads fonts from a third-party network origin. | [material-design-3.md](material-design-3.md) |
| 16 | Docs, changelog and roadmap current each task | **In force from now.** This documentation tree is the first instance. | this file |

## How to read a status

| Status | Means |
| --- | --- |
| **Not started** | No code, and possibly no design. |
| **Not yet designed** | Not even specified by the mockup. These carry the most risk, because the shape of the work is unknown. |
| **Designed, not built** | The mockup specifies it completely enough to implement. Nothing runs. |
| **Partial** | Something exists upstream that covers part of the requirement. The gap is named in the file. |
| **Met** | Implemented, and verified by something a reader can re-run. **Nothing is at this status yet.** |

Nothing may be promoted to **Met** on the strength of code existing. Promotion
requires the verification described in that standard's own file to have actually
been run, with its result recorded.

## The two constraints every standard is implemented under

**1. The interface source is a verbatim copy.** Every file that would need to
change lives under `design/`, which the port verifier holds byte-identical to the
pinned upstream tree. Each edit requires an entry in `MODIFICATIONS.md` naming
the reason and listing the paths. This is not an obstacle to route around — it is
what makes the delta from upstream reviewable, and what keeps the licence notice
accurate. See [../porting/verification.md](../porting/verification.md).

**2. Every rule applies to every surface, individually.** The application, the
landing page, the documentation site, each settings tab, each nested panel and
each dialog. "It is small", "it is only documentation" and "nobody customizes
that one" are not exemptions. Where a rule genuinely cannot apply to a surface,
the standard's own file names the rule and the reason — leaving a silent gap
reads as an oversight to the next person and as a decision to nobody.

## The design source of truth

`mockups/open-design-m3/` holds a single-page mockup specifying the intended
interface: ten screens, the full colour-role set in light and dark across four
palette seeds, the shape and motion scales, the window chrome, and most of the
standards above rendered as working markup. It is a specification, not a build —
nothing in it is wired into the application.

Where a standard is met by the mockup but not by code, its file says **designed,
not built** and points at the specific part of the mockup that specifies it.
Where the mockup itself falls short of the standard, the file says that too —
there are eleven such gaps, and they are recorded in the relevant files rather
than quietly fixed later.
