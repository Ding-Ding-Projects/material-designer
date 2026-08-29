# Release code names

> [!IMPORTANT]
> **Policy resolution recorded — 2026-08-29.** The public catalog photo remains a
> link for the selected code-name dish. The release may also attach one
> grandfathered image already tracked in this repository, but it must be named
> for its actual `image_dish` and labelled as a separate release photo. It must
> never be named `codename-<code-name-id>.png` or described as depicting the
> code-name dish.

Every build carries a dim sum code name — a dish's English and Traditional Chinese
names together, resolved from the public catalogue at
[`Ding-Ding-Projects/dim-sum-photos`](https://github.com/Ding-Ding-Projects/dim-sum-photos).
It sits beside the version, never in place of it, and **a dish is used exactly
once**.

> [!IMPORTANT]
> **Status: picker and publication path repaired; hosted evidence remains pending.** `scripts/release-codename.sh`
> picks a public code name when the catalogue is reachable, and the `Release`
> workflow calls it. New notes carry a machine-readable `dim-sum-id`; any
> grandfathered bundled photo is named from its own `image_dish` and explicitly
> separated from the public code-name link. The requirement that the code name also
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

Photos come from that repository's published `catalog-v1*` releases — **2,928
assets across three of them** — and the release notes link the chosen dish's photo
rather than copying it here.

> [!NOTE]
> **This used to read from 24 dishes bundled in this repository, and that is how
> the exhaustion was found rather than predicted.** With a release per push, the
> pool was spent inside a single day; every build afterwards shipped with no code
> name at all, silently, because running out was designed to be non-fatal. The
> earlier version of this document even said "the 25th release ships without a
> code name" — correctly, and nobody was watching release 25.

### The photo rule and the separate bundled release photo

Two photo roles are kept distinct, so the release notes cannot accidentally
claim that one image depicts another dish:

- **The code-name photo** is resolved from the public catalogue and appears as an
  HTTPS link in the notes. It is not copied into this repository.
- **The separate bundled release photo** is an already-tracked grandfathered
  image. Its release asset name is `release-photo-<image_dish>.png`, where
  `<image_dish>` is taken from the tracked filename. The notes state that it is
  unrelated to the public code-name photo link.

The workflow validates that this separate image is tracked, non-empty and
decodable, then copies the exact bytes into the staged release set. It never
renames the image after the fact to make it look like the code-name dish, and it
never fetches or generates a replacement image.

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

The script fetches the public index, flattens it with a line-oriented `awk` pass —
so it stays dependency-free and runs anywhere a POSIX shell does — then walks the
dishes in catalogue order and takes the first that satisfies both conditions:

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
| The selected bundled release photo is absent, untracked, malformed or undecodable | The workflow fails closed before publication |
| The bundled release photo filename implies the public code-name id | The workflow contract fails closed; the separate asset must use its actual `image_dish` |

This is deliberate and auditable. A code name is decoration with a purpose, and
the two photo roles remain explicit so the release cannot attach an unapproved
binary or claim that the separate bundled photo depicts the selected dish.

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
| `image` | Repository-relative path to the already-tracked bundled release photo. |
| `image_dish` | Dish identifier derived from that tracked image's filename, distinct from the selected code-name `id`. |
| `source` | `public` when the name was resolved from the catalogue, otherwise `unavailable`. |

The workflow uses `codename` in the release title and notes, `id` in the
`dim-sum-id` line, and `photo_url` as a public link. It uses `image` and
`image_dish` only for the separate grandfathered bundled release photo, whose
filename and unrelated relationship to the code-name photo are stated plainly.

### The dish's names stay factual

At every language mode and every tone level, the dish's actual name is correct.
Humour styles the copy *around* the code name, never the dish itself. The alt text
names the dish, so the code name reaches screen-reader users too.

## Configuration

| Invocation | Behaviour |
| --- | --- |
| `scripts/release-codename.sh` | Reads spent ids from standard input, one per line. |
| `scripts/release-codename.sh --used a,b,c` | Reads them inline, comma-separated. |

The public catalogue URL and the bundled fallback path are both fixed in the
script. There is no override, deliberately: a code name picked from an unversioned
catalogue is not auditable.

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| Releases stop carrying a code name | Every dish in the reachable pool is spent | Read the step log: the script says which pool it used and how many were spent. This is what the 24-dish bundled pool did. |
| The same code name on two releases | A prior release's `dim-sum-id` line or legacy code-name text was missing, malformed, or unreadable | The marker and legacy-text bridge make the pick idempotent. Check the notes template and the token used to read prior releases. |
| The code name is a fragment of a description | The record flattening took a later `en` than the one under `name` | Each field is taken once per record for exactly this reason; if that guard is removed, this returns. |
| The photo link 404s | The dish's asset is not on a `catalog-v1*` release | The script only picks dishes whose asset it found; a 404 means the public release was changed after the pick. |
| No photo attached at all | The selected bundled release photo was absent, untracked, malformed or undecodable | Publication stops before `gh release create`; repair the tracked source or keep the release unpublished. |
| Only some prior releases were consulted | The release listing is capped at 200 | Fine for now; if this project ever exceeds it, the cap becomes a correctness bug rather than a performance one. |
| The script exits `2` | It could not find the repository root | It is run from outside a checkout. |

## Security considerations

- **Reading prior releases needs a token**, resolved through the workflow's usual
  chain and passed through the environment convention the tooling expects. It is
  never printed, and the script itself never receives it for that purpose — the
  workflow does the listing and hands the script a list of ids.
- **No public catalogue image is copied or fetched at publish time.** The catalogue
  index is parsed as text and the workflow links the selected public asset. The
  separate release photo is copied only from an already-tracked local file, after
  its path, bytes and decoder result are checked.
- **The raw packaging transcript is never a release asset.** It remains in
  restricted run evidence. The published `installer-build.log` is an allowlisted
  summary with no absolute paths, machine details, secrets, credentials,
  environment values or arbitrary tool output.
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
- The `image` path is tracked locally and decodes as a `1254x1254` PNG. A release
  stages it as `release-photo-hk-dish-0271-sweet-and-sour-pork-with-pineapple.png`,
  explicitly separate from the public code-name photo.
- Supplying the legacy text `Classic Har Gow · 蝦餃` skips `hk-dish-0001` and
  selects `hk-dish-0002`, proving the historical text-to-id bridge.
- With `hk-dish-0001,hk-dish-0002,hk-dish-0003` spent, it picks `hk-dish-0004`.
- With **24 spent** — the exact point the old bundled pool ran dry and started
  shipping nameless builds — it picks `hk-dish-0025` and carries on.

```bash
# what would be picked right now, with nothing spent
scripts/release-codename.sh --used ''

# the old exhaustion point, which no longer exhausts
scripts/release-codename.sh --used "$(seq -f 'hk-dish-%04g' 1 24 | paste -sd, -)"
```

**The public `installer-build.log` is sanitized.** Its fixed allowlist carries only
release identity, package counts, installer hash and unsigned status. The raw
packaging transcript stays in restricted run evidence and is not attached to the
public release.

## Suggested reading

- [release-assets.md](release-assets.md) — where the separate bundled release photo sits among the other attached files
- [release-pipeline.md](release-pipeline.md) — the step that calls this, and how the marker is read back
- [../standards/releases.md](../standards/releases.md) — the code-name requirement as a standard, including the surfaces it is not yet on
