# Release code names

> [!IMPORTANT]
> **Release-integrity repair, 2026-08-27.** The workflow now resolves a
> code-name id and its image from the published public catalog, downloads that
> exact image into run-scoped release staging, verifies its PNG signature,
> decodes it, checks its byte count, hashes it, and attaches it to the release.
> No image is added to this repository or to its bundled catalog. A missing
> public image remains a release blocker, while an unavailable code name is
> represented honestly in the selector output.

Every build carries a dim sum code name — a dish's English and Traditional Chinese
names together, resolved from the public catalogue at
[`Ding-Ding-Projects/dim-sum-photos`](https://github.com/Ding-Ding-Projects/dim-sum-photos).
It sits beside the version, never in place of it, and **a dish is used exactly
once**.

> [!IMPORTANT]
> **Status: source repair complete, hosted release evidence pending.**
> `scripts/release-codename.sh` uses the public catalog and published
> `catalog-v1*` PNG assets only. The `Release` workflow records an exact
> `dim-sum-id` marker, image asset marker, byte count, and SHA-256 in its notes,
> and publication requires the attached image to be present and downloadable.
> A fresh hosted run must still prove the updated path end to end.

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
source. The workflow stages one verified source asset for the release itself,
without adding it to this repository or its bundled catalog.

> [!NOTE]
> **This used to read from 24 dishes bundled in this repository, and that is how
> the exhaustion was found rather than predicted.** With a release per push, the
> pool was spent inside a single day; every build afterwards shipped with no code
> name at all, silently, because running out was designed to be non-fatal. The
> earlier version of this document even said "the 25th release ships without a
> code name" — correctly, and nobody was watching release 25.

### The photo rule, and the tension in it

Two standards pull in different directions here, so the resolution is written
down rather than left implicit:

- **Every release must attach a real dim sum photo** as a downloadable asset.
- **A consumer repository must not copy public catalogue photos** or add to its
  bundled set; it may *link* the public photo.

They are resolved at different storage boundaries. The **code name and source
photo link** come from the public catalogue, while the release job downloads the
published source asset into run-scoped staging, verifies it, and attaches that
verified byteset to the release. The consumer repository never tracks the image,
adds it to its bundled catalog, or uses a stale local copy.

### How the spent dishes are found

Not from a counter — from the releases themselves.

Each published release body carries a marker comment recording the code name's id.
The workflow lists every prior release, reads each body, extracts the exact marker,
sorts the ids, and passes the set to the picker.

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
| Public catalogue unreachable | Emits `source=unavailable` and empty code-name and image fields; the image Chut blocks publication |
| No unused dish with a published image | Emits an empty `id`; the version remains authoritative, but the required image Chut blocks publication |
| Download, decode, size, signature, or hash verification fails | The workflow fails closed before publication and preserves the exact failure in the run log |

This is deliberate and auditable. A code name is decoration with a purpose, while
the required image is independently verified at the release boundary. An
unavailable code name is not turned into a guessed name or a local fallback.

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
| `image` | Exact public catalog asset filename selected for attachment. |
| `image_dish` | Stable catalog id associated with `image`; it must equal `id`. |
| `image_bytes` | Expected public release asset byte count. |
| `image_content_type` | Expected content type, currently `image/png`. |
| `image_tag` | Published public catalog release tag containing `image`. |
| `source` | `public` when the name and image were resolved from the catalogue, otherwise `unavailable`. |

The workflow uses `codename` in the release title and notes, `id` in the
spent-marker comment, `photo_url` as the public source link, and `image` plus
`image_dish` to stage the verified image asset. The image is never tracked in
this repository or added to its bundled catalog.

### The dish's names stay factual

At every language mode and every tone level, the dish's actual name is correct.
Humour styles the copy *around* the code name, never the dish itself. The alt text
names the dish, so the code name reaches screen-reader users too.

## Configuration

| Invocation | Behaviour |
| --- | --- |
| `scripts/release-codename.sh` | Reads spent ids from standard input, one per line. |
| `scripts/release-codename.sh --used a,b,c` | Reads them inline, comma-separated. |

The public catalogue URL and public release owner are fixed in the script. There
is no consumer-image fallback: a code name picked from an unversioned source or a
local copy is not auditable.

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| Releases stop carrying a code name | Every dish with a published image is spent or the catalog is unavailable | Read the selector's `reason` output. The version remains authoritative, but the required release image still blocks publication. |
| The same code name on two releases | A prior release's marker comment was missing, malformed, or unreadable | The marker is what makes the pick idempotent. Check the notes template still emits it, and that the token used to read prior releases has permission to. |
| The code name is a fragment of a description | The record flattening took a later `en` than the one under `name` | Each field is taken once per record for exactly this reason; if that guard is removed, this returns. |
| The photo link 404s | The dish's asset is not on a `catalog-v1*` release | The script only picks dishes whose asset it found; a 404 means the public release was changed after the pick. |
| No photo attached at all | The public catalog image was unavailable, missing, or failed verification | Publication stops before `gh release create`; inspect the image Chut and its preserved run evidence. |
| Only some prior releases were consulted | The release listing was truncated or a body marker was unreadable | The selector uses a 1000-release listing and the publication path fails when the selected marker or image is absent. |
| The script exits `2` | It could not find the repository root | It is run from outside a checkout. |

## Security considerations

- **Reading prior releases needs a token**, resolved through the workflow's usual
  chain and passed through the environment convention the tooling expects. It is
  never printed, and the script itself never receives it for that purpose — the
  workflow does the listing and hands the script a list of ids.
- **The repository does not track catalog images.** The workflow fetches only the
  selected published public asset into run-scoped staging, verifies it, and
  attaches that exact byteset to the release when the governing release contract
  requires a downloadable image.
- **The script executes nothing from the catalogue.** It reads a text index, tests
  set membership, and checks whether files exist.
- **A catalogue fetch failure is reported.** An unreachable public index leaves the
  code-name and image fields empty; the required image Chut prevents publication.

## Verification

**Observed**, run against the live public catalogue:

```
release-codename: public catalogue: 2866 dishes, published PNG assets resolved
id=hk-dish-0001
codename=Classic Har Gow · 蝦餃
photo_url=https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/hk-dish-0001-classic-har-gow.png
image=hk-dish-0001-classic-har-gow.png
image_dish=hk-dish-0001
```

- That `photo_url` returns **HTTP 200**.
- With `hk-dish-0001,hk-dish-0002,hk-dish-0003` spent, it picks `hk-dish-0004`.
- With **24 spent**, it continues through the public catalog rather than using a
  bundled 24-dish fallback.

```bash
# what would be picked right now, with nothing spent
scripts/release-codename.sh --used ''

# the old exhaustion point, which no longer exhausts
scripts/release-codename.sh --used "$(seq -f 'hk-dish-%04g' 1 24 | paste -sd, -)"
```

The live release workflow independently downloads the selected public image,
checks the PNG signature and dimensions, computes its SHA-256 and byte count, and
records those facts in the release notes before publication. A hosted run is the
authoritative evidence for that end-to-end attachment step.

## Suggested reading

- [release-assets.md](release-assets.md) — where the code-name image sits among the other attached files
- [release-pipeline.md](release-pipeline.md) — the step that calls this, and how the marker is read back
- [../standards/releases.md](../standards/releases.md) — the code-name requirement as a standard, including the surfaces it is not yet on
