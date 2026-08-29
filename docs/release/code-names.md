# Release code names

> [!IMPORTANT]
> **Public-photo route active: 2026-08-29.** The release workflow selects the
> next unused dish from the public catalogue, downloads its published `catalog-v1*`
> PNG into run-scoped staging, verifies GitHub's SHA-256 digest and PNG decode,
> then attaches that exact validated file to the release. No photograph is stored
> in this repository.

Every build carries a dim sum code name — a dish's English and Traditional Chinese
names together, resolved from the public catalogue at
[`Ding-Ding-Projects/dim-sum-photos`](https://github.com/Ding-Ding-Projects/dim-sum-photos).
It sits beside the version, never in place of it, and **a dish is used exactly
once**.

> [!IMPORTANT]
> **Status: picker and attachment route implemented.** `scripts/release-codename.sh`
> picks a public code name when the catalogue is reachable, and the `Release`
> workflow downloads, validates and attaches its photo. The requirement that the code name also
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

### The photo rule, and the tension in it

Two standards pull in different directions here, so the resolution is written
down rather than left implicit:

- **Every release must attach a real dim sum photo** as a downloadable asset.
- **A consumer repository must not copy public catalogue photos** or add to its
  bundled set; it may *link* the public photo.

The workflow satisfies both rules by using a run-scoped copy from the public
catalogue's published release asset. The selected bytes never enter the source
repository. The release carries the validated copy, while the notes retain the
public asset URL and digest so the source and the attached file remain auditable.

### How the spent dishes are found

Not from a counter — from the releases themselves.

Each published release body carries a marker comment recording the code name's id.
The workflow enumerates every release through authenticated `gh api --paginate`
with no fixed release-count ceiling, validates the complete paginated response and
every release identity before reading bodies, rejects partial or malformed results,
extracts the markers, and rejects duplicate ids before passing the complete set to
the picker.

Reading the state out of the artifacts the state is *about* is what makes the pick
idempotent. A counter stored anywhere else gets re-read by a re-run and hands out
the same dish twice, or gets incremented by a run that then failed to publish and
burns a dish on nothing.

### How a dish is chosen

The script fetches the public index with `jq`, reads published `catalog-v1*`
release asset metadata, then walks the
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
| Public catalogue unreachable | The required release step fails before publication |
| No unused dish with a published, digest-recorded photo | The required release step fails before publication |
| Downloaded bytes differ from the published size, digest or PNG signature | The picker rejects the candidate and tries the next one; if none remains, publication fails |
| Image decode fails in the PowerShell validator | The release fails before publication |

This is deliberate and auditable. A code name is decoration with a purpose, and
the release never claims success until its own run-scoped photo has passed the
size, digest, signature and decode checks.

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
| `image` | Run-scoped downloaded PNG path when `--output-dir` is supplied. |
| `image_name` | `codename-<dish id>.png`, the staged release asset name. |
| `image_sha256` | SHA-256 from the published GitHub asset digest. |
| `image_bytes` | Expected and downloaded byte count. |
| `source` | `public` when the name was resolved from the catalogue, otherwise `unavailable`. |

The workflow uses `codename` in the release title and notes, `id` in the
spent-marker comment, and `photo_url` as a public link. It stages `image` as
`image_name` only inside the current release run, after validation.

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

The public catalogue URL is fixed in the script. There is no override,
deliberately: a code name picked from an unversioned catalogue is not auditable.

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| Releases stop carrying a code name | Every dish in the reachable pool is spent | Read the step log: the script says which pool it used and how many were spent. This is what the 24-dish bundled pool did. |
| The same code name on two releases | A prior release's marker comment was missing, malformed, or unreadable | The marker is what makes the pick idempotent. Check the notes template still emits it, and that the token used to read prior releases has permission to. |
| The code name is a fragment of a description | The record flattening took a later `en` than the one under `name` | Each field is taken once per record for exactly this reason; if that guard is removed, this returns. |
| The photo link 404s | The dish's asset is not on a `catalog-v1*` release | The script only picks dishes whose asset it found; a 404 means the public release was changed after the pick. |
| No photo attached at all | The public catalog selection or staging check failed | Publication stops before `gh release create`; inspect the run-scoped validator evidence. |
| Only some prior releases were consulted | The release listing is capped at 200 | Fine for now; if this project ever exceeds it, the cap becomes a correctness bug rather than a performance one. |
| The script exits `2` | It could not find the repository root | It is run from outside a checkout. |

## Security considerations

- **Reading prior releases needs a token**, resolved through the workflow's usual
  chain and passed through the environment convention the tooling expects. It is
  never printed, and the script itself never receives it for that purpose — the
  workflow does the listing and hands the script a list of ids.
- **The selected image is fetched only into run-scoped staging.** It is never
  committed to the consumer repository. The workflow validates its public digest,
  byte count, PNG signature and decode before attaching it.
- **The script executes nothing from the catalogue.** It reads a text index, tests
  set membership, and checks whether files exist.
- **A catalogue or asset fetch failure is reported.** In required mode an
  unreachable index, missing published asset, digest mismatch or decode failure
  stops publication before `gh release create`.

## Verification

**Observed**, run against the live public catalogue:

```
release-codename: public catalog 2866 dishes, 2928 published photos, 0 already spent
id=hk-dish-0001
codename=Classic Har Gow · 蝦餃
photo_url=https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/hk-dish-0001-classic-har-gow.png
image_name=codename-hk-dish-0001.png
```

- That `photo_url` returns **HTTP 200**.
- With `hk-dish-0001,hk-dish-0002,hk-dish-0003` spent, it picks `hk-dish-0004`.
- With **24 spent** — the exact point the old bundled pool ran dry and started
  shipping nameless builds — it picks `hk-dish-0025` and carries on.

```bash
# what would be picked right now, with nothing spent
scripts/release-codename.sh --used ''

# the old exhaustion point, which no longer exhausts
scripts/release-codename.sh --used "$(seq -f 'hk-dish-%04g' 1 24 | paste -sd, -)"
```

The release workflow's PowerShell validator checks the downloaded bytes against the
published GitHub asset digest and decodes the PNG before staging it. After the
release is published, the verification step downloads the exact attached photo
asset again, checks its byte count and digest against the catalog facts, and reruns
the signature and decode checks. The full release run remains the authoritative
proof that the release upload succeeded.

## Suggested reading

- [release-assets.md](release-assets.md) — where the code-name image sits among the other attached files
- [release-pipeline.md](release-pipeline.md) — the step that calls this, and how the marker is read back
- [../standards/releases.md](../standards/releases.md) — the code-name requirement as a standard, including the surfaces it is not yet on
