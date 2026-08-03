# Release code names

Every build carries a dim sum code name — a dish's English and Traditional Chinese
names together, drawn from a catalogue bundled in this repository. It sits beside
the version, never in place of it, and **a dish is used exactly once**.

> [!IMPORTANT]
> **Status: built and running.** `scripts/release-codename.sh` picks the name, the
> `Release` workflow calls it, and the published releases carry a code name, its
> image and its spent-marker. The catalogue holds **24 dishes** with 24 images.
> The requirement that the code name also appear in the app's About surface, the
> changelog viewer and the landing page's release section is **not met** — today
> it appears in the release notes and nowhere else.

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

`assets/dim-sum/index.json` indexes the catalogue: 24 dishes, each with an id, a
slug, English and Traditional Chinese names, a Jyutping romanisation, a category,
an image path, a byte count, a SHA-256, and bilingual alt text.

The images are **bundled local assets**. `scripts/import-dim-sum.sh` copies each
one byte-for-byte from a verified source catalogue and checks its SHA-256; nothing
is generated, downloaded at build time, resized or re-encoded. That matters for
three separate reasons: a release asset fetched from a third party is a third
party in your release, an image regenerated per build is not the same image
twice, and a catalogue whose contents cannot be checked cannot be trusted to
contain what it says.

### How the spent dishes are found

Not from a counter — from the releases themselves.

Each published release body carries a marker comment recording the code name's id.
The workflow lists prior releases, reads each body, extracts the marker, sorts the
ids and passes the set to the picker.

Reading the state out of the artifacts the state is *about* is what makes the pick
idempotent. A counter stored anywhere else gets re-read by a re-run and hands out
the same dish twice, or gets incremented by a run that then failed to publish and
burns a dish on nothing.

### How a dish is chosen

The script flattens the catalogue with a line-oriented pass — the index is written
in a fixed shape by the importer, so this stays dependency-free and runs anywhere
a POSIX shell does — then walks the dishes in catalogue order and takes the first
that satisfies both conditions:

1. **Its id is not in the spent set.**
2. **Its image file actually exists on disk.**

The second check is the one people forget. A catalogue can index a record whose
image has not been added yet, and choosing that record produces a release whose
code name renders as a broken image — which is worse than having no code name at
all. A skipped dish is reported on standard error, not silently passed over.

### It never blocks a release

If every dish is spent, or the catalogue is missing entirely, the script prints an
explanation to standard error, emits an empty id, and **exits `0`**. The workflow's
title expression then omits the code-name suffix and the release ships with its
version alone.

This is deliberate and worth preserving. A code name is decoration with a purpose;
a release must never be blocked, delayed or renamed because the catalogue is
unavailable.

> [!NOTE]
> With 24 dishes, **the 25th release ships without a code name.** That is the
> designed behaviour, not a bug to discover in production. Extending the catalogue
> means importing more dishes through the importer, byte-for-byte, from the
> verified source — never generating one.

### Output

The script prints key-value lines suitable for a workflow output file:

| Key | Value |
| --- | --- |
| `id` | The catalogue id. Empty when no dish is available. |
| `slug` | The dish's slug. |
| `name_en` / `name_zh` | English and Traditional Chinese names. |
| `jyutping` | Romanisation. |
| `image` | Repository-relative path to the bundled image. |
| `alt_en` / `alt_yue` | Bilingual alt text. |
| `codename` | `<English> · <Traditional Chinese>`, the display form. |

The workflow uses `codename` in the release title and the notes, `id` in the
spent-marker comment, and `image` to attach the picture as a release asset named
after the id.

### The dish's names stay factual

At every language mode and every tone level, the dish's actual name is correct.
Humour styles the copy *around* the code name, never the dish itself. The alt text
names the dish, so the code name reaches screen-reader users too.

## Configuration

| Invocation | Behaviour |
| --- | --- |
| `scripts/release-codename.sh` | Reads spent ids from standard input, one per line. |
| `scripts/release-codename.sh --used a,b,c` | Reads them inline, comma-separated. |

The catalogue location is fixed at `assets/dim-sum/index.json`, resolved from the
repository root. There is no override, deliberately: a code name picked from an
unversioned catalogue is not auditable.

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| The same code name on two releases | A prior release's marker comment was missing, malformed, or unreadable | The marker is what makes the pick idempotent. Check the notes template still emits it, and that the token used to read prior releases has permission to. |
| A release ships with no code name unexpectedly | Every dish spent, or the catalogue is absent | Both print a reason on standard error. Read the step log before assuming a bug. |
| The code name image is missing from the release | The indexed image file does not exist | The script skips such a dish and says so. If it was chosen anyway, the existence check was bypassed. |
| Only some prior releases were consulted | The release listing is capped at 200 | Fine for now; if this project ever exceeds it, the cap becomes a correctness bug rather than a performance one. |
| The script exits `2` | It could not find the repository root | It is run from outside a checkout. |
| The picked dish is always the same early one | The spent set is arriving empty | Check the extraction of the marker from prior release bodies; an empty set makes every dish look unused. |

## Security considerations

- **Reading prior releases needs a token**, resolved through the workflow's usual
  chain and passed through the environment convention the tooling expects. It is
  never printed, and the script itself never touches it — the workflow does the
  listing and hands the script a list of ids.
- **The images are local and verified.** No network request happens at release
  time to obtain them. An image fetched at publish time would be an unreviewed
  binary in a signed-off release.
- **The script executes nothing from the catalogue.** It reads a text index and
  checks whether files exist.

## Verification

**Observed:** the published releases carry a code name, its image as an attached
asset, and the spent-marker comment in their notes — and the second release picked
a *different* dish from the first, which is the property that actually matters.

```bash
# what would be picked right now, with nothing spent
scripts/release-codename.sh --used ''

# with two dishes already spent
scripts/release-codename.sh --used hk-dish-0296,hk-dish-0297

# the catalogue's own integrity: every indexed image present and correctly sized
node -e "const i=require('./assets/dim-sum/index.json');const fs=require('fs');\
for(const d of i.dishes){const p='assets/dim-sum/'+d.image;\
if(!fs.existsSync(p))console.log('missing',d.id);\
else if(fs.statSync(p).size!==d.bytes)console.log('size mismatch',d.id);}"
```

**Not verified here:** that the SHA-256 of every image still matches the index.
The importer checks it at import time; nothing re-checks it since.

## Suggested reading

- [release-assets.md](release-assets.md) — where the code-name image sits among the other attached files
- [release-pipeline.md](release-pipeline.md) — the step that calls this, and how the marker is read back
- [../standards/releases.md](../standards/releases.md) — the code-name requirement as a standard, including the surfaces it is not yet on
