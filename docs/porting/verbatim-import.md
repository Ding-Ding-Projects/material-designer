# Verbatim import

How the 13,155 upstream files under `design/` were copied from the pinned upstream commit
without a single byte, permission bit, or path being altered by the copy.

> [!NOTE]
> This page describes the import by its **outcome**, which is verified, and gives
> the procedure that reproduces that outcome. The proof is
> [`scripts/verify-port.sh`](../../scripts/verify-port.sh), not a transcript:
> anybody can re-run it and get the same answer regardless of how the bytes
> arrived. See [verification.md](verification.md).

## Behaviour

The import produced, for every path in the upstream tree:

- the **same bytes** on disk,
- the **same blob object id** in this repository's index,
- the **same file mode** recorded for every one of the 13,155 upstream files,

and it tracked **two paths that upstream's own `.gitignore` excludes**, because
those two files are present in the upstream commit and a faithful copy of a
commit includes everything the commit contains.

All three properties are checked on every run of the verifier. None of them is
taken on trust.

## Why not a working-tree copy

The obvious approach — recursively copy `vendor/open-design/` to `design/`, then
`git add design/` — fails in four separate ways, any one of which is enough to
break the byte-for-byte claim. It is worth naming them individually, because
three of the four fail *silently*: the copy appears to succeed and the damage is
only visible if something checks.

<details>
<summary><b>The four failure modes of a naive copy-and-add</b> — line-ending rewriting on read, line-ending rewriting on write, lost executable bits, and silently skipped ignored files</summary>

### 1. The checkout you would be copying may already be rewritten

A submodule's working tree is not the commit; it is the commit *after* checkout
filters ran. On a host configured with `core.autocrlf=true`, every text file in
`vendor/open-design/` is sitting on disk with CRLF line endings that are not in
the upstream blobs. Copying that tree copies the rewritten bytes.

### 2. `git add` rewrites again on the way in

This repository's root `.gitattributes` contains:

```
* text=auto
```

and the vendored tree carries its own `design/.gitattributes`:

```
design-systems/**/design-tokens.json text eol=lf
design-systems/**/tailwind-v4.css    text eol=lf
design-systems/**/tokens.css         text eol=lf
```

`text=auto` tells Git to normalise line endings when a file is staged. That is
correct behaviour for a project's own source and exactly wrong for a byte-exact
copy: the blob Git stores is no longer the blob upstream stored, so the object
ids differ even when the working tree looks right. This is the failure that
`text=auto` is *designed* to cause, which is why it has to be bypassed rather
than fought.

### 3. The executable bit does not survive every filesystem

74 files in the upstream tree are mode `100755`. On Windows filesystems there is
no POSIX permission bit to copy, so a recursive file copy produces 13,155 entries
that all look like `100644` to Git. Nothing warns about this; the tree simply
loses its shell scripts' executability and the difference only surfaces when
somebody tries to run one on a Unix host.

### 4. `git add` silently skips ignored paths

Seven files in the upstream commit match patterns in upstream's own
`design/.gitignore`:

| Path (relative to `design/`) | Matched by |
| --- | --- |
| `.looper-attachments/kbpage_late.png` | `.gitignore:104` — `.looper-attachments/` |
| `docs/superpowers/plans/2026-05-10-linux-client-parity.md` | `.gitignore:73` — `docs/superpowers/` |
| `docs/superpowers/plans/2026-08-21-pricing-deepseek-v4-flash-vision-exp.md` | `.gitignore:73` — `docs/superpowers/` |
| `docs/superpowers/plans/2026-08-23-restore-migrated-pricing-analytics.md` | `.gitignore:73` — `docs/superpowers/` |
| `docs/superpowers/plans/2026-08-23-vela-pricing-analytics-bridge.md` | `.gitignore:73` — `docs/superpowers/` |
| `docs/superpowers/specs/2026-08-21-pricing-deepseek-v4-flash-vision-exp-design.md` | `.gitignore:73` — `docs/superpowers/` |
| `docs/superpowers/specs/2026-08-23-restore-pricing-plan-exposure-design.md` | `.gitignore:73` — `docs/superpowers/` |

`git add design/` would skip all seven without a word, and the copy would be seven files
short of the commit it claims to reproduce. Upstream tracks these files despite
its own ignore rules — an ignore rule only prevents *adding*, it never untracks
what is already committed — so a faithful copy must track them too.

Verify the seven paths for yourself:

```bash
git ls-files design/ | git check-ignore --stdin --no-index
```

</details>

## The import procedure

One mechanism solves all four problems at once: **never let the copy pass through
a filter or an ignore rule.** Read blobs from the object database, write bytes
directly, and stage by object id and mode rather than by path.

### 1. Take the manifest from the pinned commit

```bash
git -C vendor/open-design ls-files -s
```

This prints `<mode> <oid> <stage>\t<path>` for every file in the checked-out
commit — the authoritative list of what has to exist, with the exact mode and the
exact object id each path must end up carrying. It reads the index, not the
working tree, so it is unaffected by however the host checked the submodule out.

### 2. Materialise each blob with conversion disabled

For each entry, the blob content is written straight to `design/<path>`:

```bash
git -C vendor/open-design cat-file blob <oid> > "design/<path>"
```

`git cat-file blob` emits the stored bytes. It applies no smudge filter, no
line-ending conversion, and no `.gitattributes` rule — which is precisely the
property that makes it the right tool and `cp` the wrong one.

### 3. Stage by object id, not by path

```bash
oid=$(git hash-object -w --no-filters "design/<path>")
git update-index --add --cacheinfo "<mode>,$oid,design/<path>"
```

Two flags carry the whole guarantee:

- **`--no-filters`** makes `hash-object` compute the id from the bytes on disk
  rather than from what the clean filter would have produced. Because the bytes
  are the upstream bytes, the resulting id *is* the upstream id — which is how
  the copy can be proved rather than asserted.
- **`-w`** writes that object into this repository's object database, so the id
  the index references actually resolves here.

`git update-index --add --cacheinfo` then writes the index entry directly, taking
the mode from the upstream manifest. This is what restores the **executable bit**
on all 73 `100755` files regardless of what the filesystem could represent, and
it is also what force-adds the **two ignored paths** — `update-index` operates on
the index, so `.gitignore` never enters the picture.

> [!TIP]
> `git add -f` would also defeat the ignore rules, but it would still run the
> clean filter and still take the mode from the filesystem. It solves one of the
> four problems. `update-index --cacheinfo` solves three, and `cat-file blob`
> solves the fourth.

### 4. Prove it

```bash
git submodule update --init
scripts/verify-port.sh
```

The verifier compares the same manifest against both the working tree and the
index. Its current output is reported by [verification.md](verification.md): 13,155
expected upstream files and 0 gaps.

## Configuration

The import itself has no configuration. Two repository settings govern whether it
stays intact:

| Setting | Value | Why it matters |
| --- | --- | --- |
| `.gitmodules` → `vendor/open-design` | `https://github.com/nexu-io/open-design` | The provenance pin. Changing the URL or the recorded commit invalidates every claim on this page. |
| `core.autocrlf` | **must be `false`** wherever `design/` is checked out or verified | With `true`, a fresh checkout writes CRLF into the working tree and the verifier's working-tree check reports thousands of differing files. The tree is fine; the checkout is not. See the failure-modes section of [verification.md](verification.md). |

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| Verifier reports thousands of `bytes-differ` | The tree was checked out with `core.autocrlf=true` | `git config --global core.autocrlf false`, then re-clone or `git checkout -- design/`. Do not "fix" the files. |
| Verifier reports `mode` mismatches | Files were re-staged from a filesystem without permission bits | Re-stage the affected paths with `update-index --cacheinfo` using the upstream mode. |
| Verifier reports `missing` | A path exists in the upstream manifest but not on disk — a truncated or interrupted copy | Re-materialise that path with `cat-file blob`. |
| Verifier reports `extra` | A path is tracked under `design/` that upstream does not have | Either remove it, or move it outside `design/`. `design/` is not a place to add files. |
| Verifier exits `2` with "is not checked out" | The submodule was never initialised | `git submodule update --init` |
| The seven ignored files disappear after a re-add | Somebody ran `git add design/` | Re-stage them with `update-index`; `git add` will never pick them up. |

## Security considerations

The import copies an entire third-party source tree, including 48 workflow
definitions under `design/.github/workflows/`, package manifests, and lockfiles.
Three consequences follow.

- **The vendored workflows are inert here and must stay that way.** Continuous
  integration only reads `.github/workflows/` at the *repository root*, which
  holds three workflows written deliberately for this project — `Verify`,
  `Release` and `Pages` — and nothing from the vendored tree. Moving or
  symlinking the vendored workflows upward would enable 48 unreviewed workflow
  definitions in one action.
- **Pinning is the supply-chain control.** The submodule pins one commit id. A
  copy verified against a pinned commit is only as trustworthy as the decision to
  trust that commit; re-pointing the pin is a supply-chain change and should be
  reviewed as one.
- **Nothing from the vendored tree is installed or executed outside ephemeral
  continuous-integration runners.** The release job does resolve the vendored
  lockfile and run its allowlisted install scripts, compiling the native modules
  from source, on a runner created for that build and destroyed afterwards. No
  dependency in those lockfiles is resolved or executed anywhere that persists.
  See [../build/ci.md](../build/ci.md) for why the confinement is deliberate.

## Verification

```bash
# provenance: which upstream commit is pinned
git submodule status

# the full proof
git submodule update --init
scripts/verify-port.sh          # human-readable
scripts/verify-port.sh --json   # machine-readable, one line

# the executable-bit claim, independently
git ls-files -s design/ | awk '{print $1}' | sort | uniq -c
#   13081 100644
#      74 100755

# the seven force-added paths, independently
git ls-files design/ | git check-ignore --stdin --no-index
```

The mode histogram and the ignored-path list above were both produced from this
tree while writing this page. The verifier result is quoted in
[verification.md](verification.md).

**Not verified:** that the vendored source builds, runs, or passes its own tests.
Nothing under `design/` has been installed or executed. Byte-fidelity to upstream
is the only claim this page makes.

## Suggested reading

- [verification.md](verification.md) — the verifier, its counters, and its self-test
- [../architecture/overview.md](../architecture/overview.md) — what the imported code actually is
- [../build/ci.md](../build/ci.md) — why building is confined to continuous integration
