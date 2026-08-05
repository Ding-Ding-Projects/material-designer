# The bundled typefaces and the icon font

**Part of [material-design-3.md](material-design-3.md) (standard 2) and
[local-assets.md](local-assets.md) (standard 15).** The Material Design 3
contract names three faces. This article records which files ship, where each
came from, what licence it is under, which variable axes are live, and what
happens to the nine shipped locales whose script none of them covers.

> [!IMPORTANT]
> **Status: the faces are bundled and no surface fetches one. Nothing has been
> seen rendered.** Every claim below is about files, stylesheets and call sites
> that can be read and checked without a build. **No sentence here asserts that
> a glyph looks right on a screen**, because no interface has been photographed
> since these landed — see *Verification* for exactly which half is proved and
> which half is not.

## The requirement

Material Design 3 specifies **Roboto Flex** as the plain and brand face,
**Roboto Mono** for technical text, and **Material Symbols** for iconography.
The mockup loads all three from a font CDN, which is a mockup convenience and
the exact thing standard 15 forbids in a shipped surface.

So the requirement is two halves that must both hold: the *right* faces, and
*locally*. Either alone fails — the correct typeface fetched from a third party
still discloses every launch, and a bundled wrong typeface is not the contract.

## Why

**A named family nobody serves fails silently.** `md3-tokens.css` has put
`'Roboto Flex'` at the head of `--md-ref-typeface-plain` and `'Roboto Mono'` at
the head of `--md-ref-typeface-mono` since the token sheet landed. Until these
files existed, no browser could resolve either name, so every surface in the
product rendered in the platform fallback behind it — correctly, legibly, and
in the wrong face, with nothing anywhere reporting a problem. A font stack has
no error state; it just quietly uses the next thing.

**An icon font fails loudly, in the worst possible way.** Material Symbols
addresses each glyph by the *ligature* of its name. A missing face or a name the
font does not carry does not render a box — it renders the name, as English
text. A chevron becomes the word `keyboard_arrow_down`, in the toolbar, in
front of the user. That property drives three decisions below: no
`font-display: swap`, no fallback family, and a mapping table validated against
the published name list rather than typed from memory.

**Nine of twenty locales are written in a script Roboto has no glyph for.** The
application ships `ar`, `fa`, `th`, `ja`, `ko`, `zh-CN`, `zh-TW` and `zh-HK`
alongside twelve Latin- and Cyrillic-script locales. Neither Roboto face carries
one CJK, Thai or Arabic character. A stack that stops at `sans-serif` renders
those locales in whatever the browser picks, which on a thin Linux image is
tofu. Bilingual mode makes it worse and more visible, because English and 廣東話
share a single line — so the failure is not "one locale looks poor", it is "half
of every label in the default mode is boxes".

## What ships

All eleven files are under `design/apps/web/public/fonts/`. Nothing here is
fetched, generated, subsetted, or modified — each is the exact byte stream a
Google Fonts stylesheet served, saved to disk.

### Roboto Flex — the plain and brand face

| File | Bytes |
| --- | ---: |
| `roboto-flex/roboto-flex-latin.woff2` | 84,304 |
| `roboto-flex/roboto-flex-latin-ext.woff2` | 59,020 |
| `roboto-flex/roboto-flex-cyrillic.woff2` | 41,732 |
| `roboto-flex/roboto-flex-cyrillic-ext.woff2` | 26,636 |
| `roboto-flex/roboto-flex-greek.woff2` | 27,412 |
| `roboto-flex/roboto-flex-vietnamese.woff2` | 22,784 |
| | **261,888** |

- **Licence:** SIL Open Font License 1.1. Copyright 2017 The Roboto Flex Project
  Authors, `https://github.com/TypeNetwork/Roboto-Flex`. Confirmed against
  `google/fonts` → `ofl/robotoflex/OFL.txt` and its `METADATA.pb`, which records
  `license: "OFL"`.
- **Provenance:** the six subsets served for
  `Roboto Flex:opsz,wght@8..144,100..1000` (family version `v30`).
- **Live axes:** `wght` 100–1000, declared as the `font-weight` range on every
  face; `opsz` 8–144, which has no CSS descriptor and is driven by the browser
  from the rendered size under the default `font-optical-sizing: auto`.
- **Sheet:** `design/apps/web/src/styles/roboto-flex.css`. The `unicode-range`
  values are copied verbatim from the served stylesheet, so a page still
  downloads only the subsets it actually needs.

### Roboto Mono — every piece of technical text

| File | Bytes |
| --- | ---: |
| `roboto-mono/roboto-mono-latin.woff2` | 32,796 |
| `roboto-mono/roboto-mono-latin-ext.woff2` | 22,916 |
| `roboto-mono/roboto-mono-cyrillic.woff2` | 18,592 |
| `roboto-mono/roboto-mono-cyrillic-ext.woff2` | 35,912 |
| `roboto-mono/roboto-mono-greek.woff2` | 14,044 |
| `roboto-mono/roboto-mono-vietnamese.woff2` | 10,308 |
| | **134,568** |

- **Licence:** SIL Open Font License 1.1. Copyright 2015 The Roboto Mono Project
  Authors, `https://github.com/googlefonts/robotomono`. Confirmed against
  `google/fonts` → `ofl/robotomono/OFL.txt` and `METADATA.pb`.
  **Note the common mistake:** Roboto Mono is frequently described as
  Apache-2.0, which it was until the Roboto family was relicensed. The current
  upstream licence is OFL-1.1, and this article states what the upstream
  repository says today rather than what an older README says.
- **Provenance:** the six subsets served for `Roboto Mono:wght@100..700`
  (family version `v31`).
- **Live axes:** `wght` 100–700.
- **Sheet:** `design/apps/web/src/styles/roboto-mono.css`.

### Material Symbols Rounded — the icon set

| File | Bytes |
| --- | ---: |
| `material-symbols/material-symbols-rounded.woff2` | 1,376,348 |

- **Licence:** Apache License 2.0, from `google/material-design-icons`
  (`https://github.com/google/material-design-icons/blob/master/LICENSE`).
- **Provenance:** the file served for
  `Material Symbols Rounded:opsz,wght,FILL,GRAD@20..48,400,0..1,0`
  (family version `v365`). No `unicode-range`: every glyph is in the Private Use
  Area, so one file carries the whole set of 4,268 icons.
- **Sheet:** `design/apps/web/src/styles/material-symbols.css`.

**Two of its four axes are live, and that is a size decision worth stating.**
Google serves this family per requested axis range, and each axis left open
multiplies the file:

| Axes left open | Bytes |
| --- | ---: |
| `FILL` only | 536,884 |
| `FILL` + `opsz` — **what ships** | 1,376,348 |
| `FILL` + `wght` | 1,446,300 |
| `FILL` + `opsz` + `wght` | 3,079,568 |
| all four | 5,349,652 |

`FILL` is the axis the mockup drives — M3 fills the selected navigation icon and
outlines the rest. `opsz` keeps a glyph's stroke correct across the 13–20px
range the application actually renders icons at, and the browser applies it
without being asked. `wght` and `GRAD` are pinned because nothing in the port
drives either, and leaving them open costs another 3,973,304 bytes. Changing
that decision is a one-line URL change, which is why the measured menu is
recorded here and in the stylesheet's own comment rather than left to be
rediscovered.

### Cairo — already bundled

Three subsets under `public/fonts/cairo/` (30,896 + 16,648 + 33,820 = 81,364
bytes), landed at `45ff210`, OFL-1.1. They are the Arabic-capable face the RTL
viewer stack names in `styles/viewer/library.css`, and they now also sit in the
Arabic position of the main plain stack.

## The fallback stack

Declared in `design/apps/web/src/styles/md3-tokens.css` as
`--md-ref-typeface-plain` and `--md-ref-typeface-mono`. The shape is **the
bundled face, then upstream's platform chain unchanged, then one family per
uncovered script, then the generic keyword** — a fallback list only ever
supplies glyphs the families ahead of it do not have, so order within the tail
decides which face wins, never whether a script is covered at all.

### Why a bundled face may lead, when an unbundled one may not

Upstream pinned a rule in `tests/styles/default-background.test.ts` named
*"prefers platform UI fonts over optional local app fonts"*, and it named
`Inter` as the family that must not lead. **The reason is availability, not
native appearance.** `Inter` is vendored nowhere in this repository, so leading
with it makes the interface render one way on a machine that happens to have it
and another on a machine that does not, with nothing reporting the difference.

`Roboto Flex` is a different case: it is bundled and served from the product's
own origin, so it is present by construction. Leading with it is therefore
**more** deterministic than leading with `-apple-system`, which resolves to a
different face on every OS and every OS version. Material Design 3 also names it
as the plain face, and this product deliberately does not chase a native look —
it draws its own window chrome.

So the rule kept its force and was restated rather than deleted: **only a face
this repository actually ships may lead the stack.** The spec now checks that
against the `@font-face` rules in the expanded cascade rather than a hardcoded
family name, so bundling or unbundling a face moves the test automatically.

Upstream's chain is otherwise **untouched and in its original order** —
`Roboto Flex` is prepended and the script families appended, with nothing in the
middle reordered. The contiguous `'Segoe UI', 'Microsoft YaHei UI', 'Noto Sans'`
run is load-bearing on Windows and is pinned by both specs.

| Script | Locales | Families named, in order |
| --- | --- | --- |
| Latin / Cyrillic / Greek | 12 locales | Roboto Flex, then upstream's platform chain |
| Arabic | `ar`, `fa` | Cairo, Segoe UI Arabic, Noto Sans Arabic |
| Thai | `th` | Leelawadee UI, Noto Sans Thai |
| Simplified Chinese | `zh-CN` | Microsoft YaHei UI (in the platform chain), PingFang SC, Noto Sans CJK SC |
| Traditional Chinese | `zh-TW`, `zh-HK` | Microsoft JhengHei UI, PingFang TC, Noto Sans CJK TC |
| Japanese | `ja` | Yu Gothic UI, Hiragino Sans, Noto Sans CJK JP |
| Korean | `ko` | Malgun Gothic, Apple SD Gothic Neo, Noto Sans CJK KR |

Each script names a Windows face, an Apple face and a Noto face, so a machine
from any of the three worlds finds one.

**The monospace stack carries the same protection**, ending
`… Consolas, 'Noto Sans Mono CJK SC', 'Microsoft YaHei UI', 'PingFang SC',
'Microsoft JhengHei UI', 'Yu Gothic UI', 'Malgun Gothic', monospace`. The CJK
families there are proportional, which is correct rather than a compromise: CJK
glyphs are full-width and therefore align on a monospace grid anyway, and a path
or commit subject containing 中文 is far better set in YaHei than in the box the
bare `monospace` keyword would draw.

**The icon face has no fallback at all** — `--md-ref-typeface-icon` is
`'Material Symbols Rounded'` and nothing else. A second family could only supply
the ligature's own name as literal text. A missing glyph is better than a wrong
word.

## The icon migration

### The inventory, before any change

| Icon system | Distinct glyphs | Call sites | Where |
| --- | ---: | ---: | --- |
| Remixicon webfont | 61 names | **95** | 7 files, all through one 27-line `RemixIcon` component |
| Inline SVG (`Icon.tsx`) | 93 glyphs | **859** | 127 files, one `switch` module |
| `EditorIcon.tsx` | 8 marks | 5 | brand/editor logos |
| `AgentIcon.tsx` | — | 15 | image-based agent marks |
| `ConnectorLogo.tsx` | — | 3 | connector marks |

Two facts shaped the plan. The Remixicon surface is **narrow and mechanical** —
no raw `ri-` class strings anywhere, every use funnelled through one component,
so 61 names is the whole contract. And Remixicon was using **61 of the 3,229
classes its stylesheet defines**, or 1.9%: a 189 KB font and a 157 KB stylesheet
carried for sixty-one glyphs.

### What was migrated

**94 of the 95 call sites**, across six files, to a new `MaterialSymbol`
component:

| File | Call sites |
| --- | ---: |
| `FileViewer.tsx` | 65 |
| `PreviewDrawOverlay.tsx` | 11 |
| `AvatarMenu.tsx` | 9 |
| `DesignBrowserPanel.tsx` | 4 |
| `WindowTitleBar.tsx` | 3 |
| `AppChromeHeader.tsx` | 2 |

Four of those sites pick their glyph indirectly — `previewViewportIcon`,
`browserViewportIcon`, `deployActionIconFor` and the mark-tool table — and each
of those helpers now returns `MaterialSymbolName`, so the compiler covers them
rather than a string flowing through untyped.

### What was not, and why

**`SocialShareGrid.tsx` stays on Remixicon.** Its one call site is driven by a
`PLATFORM_ICON` table of nine brand marks — X, LinkedIn, Facebook, Reddit,
Telegram, WhatsApp, Weibo, LINE and Instagram. **Material Symbols carries no
brand logos**, and drawing a replacement is a trademark problem rather than an
icon problem. This is the reason the incumbent font could not simply be deleted;
resolving it means bundling licensed brand SVGs, which is a scoped piece of work
of its own rather than something to improvise inside a font change.

**The 859 `Icon.tsx` call sites were inventoried and left alone.** The migration
path is unusually good — `Icon.tsx` is a single module of 93 `case` branches
behind a stable `IconName` union, so converting it changes **one file and zero
call sites** — but it means choosing 93 symbol equivalents for hand-drawn SVGs,
and a wrong choice renders a *plausible wrong icon* that no test can see.
Doing that without once looking at the result would be guessing at scale. It is
the natural next task, and it is now a one-file task.

### How the names were checked

Material Symbols renders an unknown name as that name, in English, in the
interface. So the mappings were **not typed from memory**: each was first
validated against `variablefont/*.codepoints` published with the font in
`google/material-design-icons`, and every name rendered at a migrated call site
was then checked to be one the mapping vouches for. The second check is pinned
by `design/apps/web/tests/styles/bundled-fonts.test.ts`.

**The codepoints list is necessary but not sufficient, and that distinction cost
a round trip.** It says which icons exist in the family; it does not say which
names the *shipped file* can be addressed by. The authority for that is the
GSUB ligature table inside the woff2 actually on disk. For this build the two
happen to agree exactly — but only once you know what you are counting:

| Measure | Count |
| --- | ---: |
| Names in the published codepoints list | 4,268 |
| Ligature names in the shipped woff2 | 4,268 |
| Distinct target **glyphs** those ligatures resolve to | 3,967 |

The 301-name gap is **aliases**: several names render one glyph. `smartphone`
and `mobile` are such a pair, both targeting glyph 2239. Reading 3,967 as a
count of *names* rather than *glyphs* is what once made a perfectly valid name
look absent from the font.

### Re-running the check

No Node or font library is needed, and the result is the only evidence that
actually proves an icon will render:

1. Parse the woff2 header and table directory (48-byte header; per-table flags
   with a 6-bit known-tag index, `UIntBase128` lengths).
2. `brotli`-decompress the payload and slice out `cmap` and `GSUB` by their
   directory order.
3. Build char→glyph from the `cmap` format-4 subtable, then invert it
   preferring lowercase — the font maps `A` and `a` to one glyph, so a naive
   inversion yields `SMARTPHONE` and every name looks wrong.
4. Walk `GSUB` lookups of type 4, unwrapping type 7 extensions, and rebuild
   each ligature's name from its coverage glyph plus component glyphs.
5. Assert each name's ligature target equals the glyph the `cmap` gives for its
   published codepoint.

Run that way, **all 49 names the shipped mapping renders pass**: each is a real
ligature, and each targets the same glyph as its published codepoint.

The mapping lives in `MATERIAL_SYMBOL_FOR_REMIX_ICON` in
`design/apps/web/src/components/MaterialSymbol.tsx`, exported so the test can
read it and so the next person can see what was decided rather than infer it.

### The dead dependency

`lucide-react@1.16.0` was declared in `design/apps/web/package.json` and
**imported by nothing** — no `.ts`, `.tsx`, `.css`, or config file in the
workspace. Removed, together with its three entries in `design/pnpm-lock.yaml`
(one importer specifier, one `packages:` resolution, one `snapshots:` node; it
had no dependents), because `pnpm install --frozen-lockfile` fails on a manifest
and lockfile that disagree.

Two lookalikes were checked and are **not** usages: RTL rules in
`styles/viewer/library.css` targeting `svg[data-lucide="…"]` inside *generated
artifact* HTML, and a reference-site link label in the locale files.

## Configuration

**There is no setting, and there is no switch.** A control that permitted a
remote font would defeat standard 15; a control that forbade one would imply the
default does not.

The one deliberate absence worth naming is **`font-display`**. Both text faces
declare `font-display: swap`, copied from the served stylesheet — a brief
fallback render of real words is better than invisible text. The icon face
declares **no `font-display` at all**, also matching what is served, and for the
opposite reason: during a swap period the fallback has no glyph at those
codepoints, so the interface would paint `keyboard_arrow_down` where a chevron
belongs and then replace it. Blocking briefly is the correct trade for an icon.

## Failure modes

| Failure | Consequence |
| --- | --- |
| A face named in a stack but not bundled | Renders in the fallback, silently and forever. This is the state the product was in before this change. |
| An icon name the font does not carry | Renders the name as English text in the interface. Only the shipped file's ligature table can rule this out — the codepoints list cannot. |
| Reading a symbol element's `textContent` | It is always the ligature name, never the icon. Read `data-symbol` or the `aria-label` instead; assertions that took raw text broke on exactly this. |
| `font-display: swap` on the icon face | Renders every icon's name as text for the swap period, then replaces it. A visible flash of words. |
| A fallback family added to the icon stack | Same as above, permanently, for any glyph the icon font lacks. |
| Dropping the CJK tail from a stack | Nine locales render as tofu; bilingual mode breaks on every line, not just some. |
| Leaving `wght` and `GRAD` open on the icon font | 5.3 MB shipped to drive two axes nothing reads. |
| A subsetted or re-encoded font committed as if served | The provenance table stops being checkable, and the licence trail with it. |
| Removing a dependency without the lockfile | `pnpm install --frozen-lockfile` fails the whole CI job. |

## Security considerations

- **A font request is a disclosure.** Each one tells a third party the user's
  network address and that the application launched. This is the whole reason
  the files are on disk; see [local-assets.md](local-assets.md).
- **A vendored binary is reviewed once and then trusted.** These eleven files
  are opaque, so the mitigations are provenance and licence, both recorded above
  with the exact upstream repository, family version, and the request that
  produced each file. A future refresh must restate them, not inherit them.
- **A font family name is user input** once the appearance editor lands.
  Rendering one into a style context without escaping is an injection route, and
  enumerating installed fonts is a fingerprinting surface. Neither is in scope
  here; both are recorded in [material-design-3.md](material-design-3.md).
- **The icon font is 1.3 MB of attacker-controlled-shaped data** in the sense
  that any font is: it is parsed by the platform's font engine. Serving it from
  the product's own origin rather than a third party does not make the parser
  safer, but it does mean the bytes cannot change after review.

## Verification

**What is proved, by something a reader can re-run:**

| Check | Command | Result |
| --- | --- | --- |
| Every `@font-face` points at a real woff2 on disk (`wOF2` signature, > 4 KB) | `pnpm --filter @open-design/web test bundled-fonts` | Pinned by the spec |
| No font sheet names a remote origin outside a comment | same | Pinned |
| Both stacks carry a family for all six uncovered scripts | same | Pinned |
| The icon stack has no fallback family | same | Pinned |
| No migrated component still imports `RemixIcon` | same | Pinned |
| Every rendered symbol name is one the mapping vouches for | same | Pinned |
| Every mapped name is a real ligature in the shipped woff2, targeting the same glyph as its published codepoint | offline `cmap` + `GSUB` walk of the file on disk (method above) | **49/49** |
| The built artifact fetches nothing | `bash scripts/check-self-contained.sh <dir>` — run on `site/` by the Pages workflow and on the packed payload by the release workflow | Wired |
| The port stays byte-exact | `bash scripts/verify-port.sh` | 0 gaps |

**What is NOT proved, and must not be claimed:**

- **That any of it renders.** No screenshot exists of a single glyph in Roboto
  Flex, Roboto Mono or Material Symbols Rounded in this application. The faces
  are the right files and the stylesheets are the right stylesheets; whether the
  interface *looks* correct is unmeasured.
- **That the symbol choices are the right glyphs.** Every name is now proved to
  address a real glyph in the shipped file — that is checked against the binary
  — but `article` standing in for `pages-line` and `filter_none` for
  `checkbox-multiple-blank-line` are judgements about *meaning* that only an eye
  can confirm. A name that resolves is not a name that communicates.
- **That the CJK fallback works on any given machine.** The families are named;
  whether a particular host has one installed is a property of that host. Not
  one locale has been rendered and looked at.
- **That the sizes are right.** Material Symbols is drawn on a different metric
  grid from Remixicon, so a glyph that was optically balanced at `size={15}`
  may not be. Every call site kept its original size value, which preserves the
  layout box exactly and says nothing about how the glyph sits in it.

Closing these needs a capture run against a real build. Until then this article
says "bundled and wired", never "looks right".

## Suggested articles

- [local-assets.md](local-assets.md) — standard 15, the rule these files exist to satisfy
- [material-design-3.md](material-design-3.md) — standard 2, which names these three faces
- [language-modes.md](language-modes.md) — why bilingual mode makes the CJK fallback load-bearing
- [accessibility.md](accessibility.md) — the reduced-motion and contrast rules the symbol component obeys
- [../porting/verification.md](../porting/verification.md) — why every file above needed a `MODIFICATIONS.md` entry
- [../site/pages-deployment.md](../site/pages-deployment.md) — the publish-time gate the self-contained check now shares
