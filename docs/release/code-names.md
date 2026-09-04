# Release code names

> [!IMPORTANT]
> **Policy conflict recorded — 2026-08-29.** The public catalog photo remains a
> link for the selected code-name dish, while the mandatory downloadable-photo
> rule requires an attached image. This consumer repository cannot copy a public
> catalog image, and its grandfathered local images are not the selected dish.
> Until the owner supplies a permitted image route, the workflow fails closed
> before `gh release create` and attaches no legacy image.

Every build carries a dim sum code name — a dish's English and Traditional Chinese
names together, resolved from the public catalogue at
[`Ding-Ding-Projects/dim-sum-photos`](https://github.com/Ding-Ding-Projects/dim-sum-photos).
It sits beside the version, never in place of it, and **a dish is used exactly
once**.

> [!IMPORTANT]
> **Status: picker repaired; publication remains blocked by the photo-policy conflict.** `scripts/release-codename.sh`
> picks a public code name when the catalogue is reachable, and the `Release`
> workflow calls it. New notes carry a machine-readable `dim-sum-id` and the
> public photo link, but no grandfathered bundled image is staged. The requirement that the code name also
> appear in the app's About surface, the changelog viewer and the landing page's
> release section is **not met** — today it appears in the release notes and
> nowhere else.

## Behaviour

### Why a code name at all, and why once

A version number is precise and unmemorable. A code name is memorable and
imprecise. Together they let a build be *talked about* — "the har gow build" —
while the version stays the thing a machine identifies it by.

That only works if a name identifies one build. **A repeated code name makes two
different builds indistinguishable in conversation, which is the single job a code
name has.** So the pick has to be idempotent across re-runs and monotonic across
releases, without a counter anybody has to maintain.

### Where the pool comes from

The public catalogue's `catalog/index.json` holds **2,866 dishes**, each with an
id, a slug, English and Traditional Chinese names, a Jyutping romanisation, a
category, a description, and an image path. Its `name.en` and `name.zhHant` are
authoritative for release names.

Photos come from that repository's published `catalog-v1*` releases, **2,928
assets across three of them**, and the release notes link the chosen dish's
source. The no-copy workflow records the selected public asset metadata for
the release, without requesting or adding its bytes to this repository or its
bundled catalog.

> [!NOTE]
> **This used to read from 24 dishes bundled in this repository, and that is how
> the exhaustion was found rather than predicted.** With a release per push, the
> pool was spent inside a single day; every build afterwards shipped with no code
> name at all, silently, because running out was designed to be non-fatal. The
> earlier version of this document even said "the 25th release ships without a
> code name" — correctly, and nobody was watching release 25.

### The photo rule and the unresolved conflict

- **The code-name photo** is resolved from the public catalogue and appears as an
  HTTPS link in the notes. It is not copied into this repository.
- **The mandatory downloadable photo** cannot currently be supplied without
  either copying a public catalog image or attaching a grandfathered local image
  that does not depict the selected code-name dish. Both routes are refused.

The workflow therefore emits an explicit blocker before `gh release create`. It
does not stage or attach any legacy local image, and it never fetches or generates
a replacement image.

### How the spent dishes are found

Not from a counter — from the releases themselves.

Each published release body carries a `dim-sum-id: <id>` line recording the code
name's id. The workflow lists prior releases, reads each body, extracts both that
line and any legacy `Code name: English · Traditional Chinese` line, and passes
the combined set to the picker. The picker maps legacy text back to catalog ids
before deciding what is spent.

Reading the state out of the artifacts the state is *about* is what makes the pick
idempotent. A counter stored anywhere else gets re-read by a re-run and hands out
the same dish twice, or gets incremented by a run that then failed to publish and
burns a dish on nothing.

### How a dish is chosen

The script fetches the public index with `jq`, then walks the dishes in catalogue
order and takes the first that satisfies both conditions:

1. **Its id is not in the spent set.**
2. **Its photo is actually published** as an asset on a `catalog-v1*` release.

The second check is the one people forget. A catalogue can describe a dish whose
image has not been published yet, and choosing that record produces a release
whose code name renders as a broken image — worse than having no code name.

The flattening takes each field **once per record**, because `description` carries
its own `en` and the `name`/`alt` objects span several lines; a naive "last match
wins" pass silently names the build after a sentence from the description.

### Publication behaviour

Three degradations, in order:

| Situation | Behaviour |
| --- | --- |
| Public catalogue unreachable | Emits a warning and leaves the code-name fields empty; publication does not claim an unverified code name |
| No unused dish resolvable anywhere | Emits an empty `id`; the version remains authoritative |
| The mandatory downloadable photo cannot be supplied under the public-source rule | The workflow fails closed before publication and attaches no legacy local image |

This is deliberate and auditable. A code name is decoration with a purpose, and
the conflict remains explicit so the release cannot attach an unapproved binary
or claim that a grandfathered local image depicts the selected dish.

### Output

The script prints key-value lines suitable for a workflow output file:

| Key | Value |
| --- | --- |
| `id` | The catalogue id. Empty when no dish is available. |
| `slug` | The dish's slug. |
| `name_en` / `name_zh` | English and Traditional Chinese names. |
| `jyutping` | Romanisation. |
| `codename` | `<English> · <Traditional Chinese>`, the display form. |
| `photo_url` | Public asset URL for the code name's photo. |
| `image` / `image_dish` | Legacy fallback values emitted by the picker for diagnostics only; they are not staged or attached while the conflict remains. |
| `source` | `public` when the name was resolved from the catalogue, otherwise `unavailable`. |

The workflow uses `codename` in the release title and notes, `id` in the
`dim-sum-id` line, and `photo_url` as a public link. It does not use the legacy
`image` or `image_dish` values for release staging.

### The dish's names stay factual

At every language mode and every tone level, the dish's actual name is correct.
Humour styles the copy *around* the code name, never the dish itself. The alt text
names the dish, so the code name reaches screen-reader users too.

## Configuration

| Invocation | Behaviour |
| --- | --- |
| `scripts/release-codename.sh` | Reads spent ids from standard input, one per line. |
| `scripts/release-codename.sh --used a,b,c` | Reads them inline, comma-separated. |
| `scripts/release-codename.sh --require-published --output-dir <dir>` | Requires a published public photo and downloads it into the supplied run-scoped directory. |

The public catalogue URL and public release owner are fixed in the script. There
is no consumer-image fallback: a code name picked from an unversioned source or a
local copy is not auditable.

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| Releases stop carrying a code name | Every dish in the reachable pool is spent | Read the step log: the script says which pool it used and how many were spent. This is what the 24-dish bundled pool did. |
| The same code name on two releases | A prior release's `dim-sum-id` line or legacy code-name text was missing, malformed, or unreadable | The marker and legacy-text bridge make the pick idempotent. Check the notes template and the token used to read prior releases. |
| The code name is a fragment of a description | The record flattening took a later `en` than the one under `name` | Each field is taken once per record for exactly this reason; if that guard is removed, this returns. |
| The photo link 404s | The dish's asset is not on a `catalog-v1*` release | The script only picks dishes whose asset it found; a 404 means the public release was changed after the pick. |
| No photo attached at all | The mandatory downloadable photo cannot be supplied without copying a public catalog image | Publication stops before `gh release create`; resolve the policy before retrying. |
| Only some prior releases were consulted | The release listing is capped at 200 | Fine for now; if this project ever exceeds it, the cap becomes a correctness bug rather than a performance one. |
| The script exits `2` | It could not find the repository root | It is run from outside a checkout. |

## Security considerations

- **Reading prior releases needs a token**, resolved through the workflow's usual
  chain and passed through the environment convention the tooling expects. It is
  never printed, and the script itself never receives it for that purpose — the
  workflow does the listing and hands the script a list of ids.
- **No public catalogue image is copied or fetched at publish time.** The catalogue
  index is parsed as text and the workflow links the selected public asset. No
  grandfathered local image is staged while the conflict remains.
- **The raw packaging transcript is never retained or published.** The
  `installer-build.log` summary is allowlisted and contains no absolute paths,
  machine details, secrets, credentials, environment values or arbitrary tool
  output.
- **The script executes nothing from the catalogue.** It reads a text index, tests
  set membership, and checks whether files exist.
- **A catalogue fetch failure is reported.** An unreachable public index leaves the
  code-name fields empty, and the workflow does not claim a release code name it
  could not verify.

## Verification

**Observed**, run against the live public catalogue:

```
release-codename: public catalogue — 2866 dishes, 2928 published photos, 1 already spent
id=hk-dish-0001
codename=Classic Har Gow · 蝦餃
photo_url=https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/hk-dish-0001-classic-har-gow.png
image=assets/dim-sum/images/hk-dish-0271-sweet-and-sour-pork-with-pineapple.png
image_dish=hk-dish-0271-sweet-and-sour-pork-with-pineapple
```

- That `photo_url` returns **HTTP 200**.
- The picker also reports a legacy `image` and `image_dish` pair for diagnostics,
  but the blocked release path does not stage or attach that local image.
- Supplying the legacy text `Classic Har Gow · 蝦餃` skips `hk-dish-0001` and
  selects `hk-dish-0002`, proving the historical text-to-id bridge.
- With `hk-dish-0001,hk-dish-0002,hk-dish-0003` spent, it picks `hk-dish-0004`.
- With **24 spent**, it continues through the public catalog rather than using a
  bundled 24-dish fallback.

```bash
# what would be picked right now, with nothing spent
scripts/release-codename.sh --used ''

# the old exhaustion point, which no longer exhausts
scripts/release-codename.sh --used "$(seq -f 'hk-dish-%04g' 1 24 | paste -sd, -)"
```

**The public `installer-build.log` is sanitized.** Its fixed allowlist carries only
release identity, package counts, installer hash and unsigned status. The raw
packaging transcript is not retained, uploaded or attached to the public release.

## Suggested reading

- [release-assets.md](release-assets.md) — which assets are attached and which remain blocked by policy
- [release-pipeline.md](release-pipeline.md) — the step that calls this, and how the marker is read back
- [../standards/releases.md](../standards/releases.md) — the code-name requirement as a standard, including the surfaces it is not yet on
