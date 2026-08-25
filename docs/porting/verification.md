# Port verification

`scripts/verify-port.sh` proves that `design/` is a byte-for-byte copy of the
pinned upstream tree, and that every file which is *not* a byte-for-byte copy has
a licence notice declaring it. It is pure `git` and POSIX shell — no package
manager, no runtime, no network. The current baseline is
`05f5b33ef59f078df10ac1125986e00e4a796cf3`, with 12,884 upstream paths.

## Behaviour

The script resolves an upstream reference, runs **two independent checks**
against it, filters their findings through the `MODIFICATIONS.md` allowlist, and
exits non-zero if anything is left over.

Two checks rather than one, because they fail for different reasons and either
one alone would pass while the tree was broken in the other's direction.

### First: where "upstream" comes from

The upstream tree can be read from two places, and the script reports which one
it used in every run — as `(via submodule)` or `(via manifest)` in the
human-readable output, and as a `source` field in the JSON.

| Source | When it is used | What it is |
| --- | --- | --- |
| `submodule` | `vendor/open-design` is checked out | The pinned submodule's own index. |
| `manifest` | The submodule is absent but `scripts/upstream-manifest.tsv` exists | A committed table of the upstream mode, blob id and path for all 12,884 upstream files, with the source URL and commit in header comments. |

### Raw-byte preservation repair

`scripts/materialize-upstream-raw-bytes.sh` repairs working-file byte drift only
after a fail-closed preflight. A target is eligible only when its tracked mode
and blob already equal the pinned upstream mode and blob, the path is not
declared in `MODIFICATIONS.md`, and `design/` has no uncommitted content. The
script stages each blob through `git cat-file`, validates its raw object id
before replacement, and validates the destination again afterward. Any local
index difference or declared path is protected and never overwritten.

The 2026-08-25 reconciliation materialized 1,200 eligible paths. It preserved
89 index-different upstream paths and eight project-only paths in
`scripts/import-preservation-inventory.tsv`, removed 91 declarations that the
new upstream baseline had made stale, and finished with every verifier counter
at zero gaps.

The manifest exists so continuous integration does not have to clone a 1.7 GB
object store to answer a question about file hashes. It is a shortcut, and the
script is built so the shortcut cannot drift:

**When both are present, the manifest is validated against the submodule before
anything else happens.** The manifest's recorded commit must equal the
submodule's `HEAD`, and its body must be byte-identical to the manifest derived
from the submodule. Either mismatch exits `2` with an instruction to regenerate.

Regenerate it — which requires the submodule — with:

```bash
scripts/verify-port.sh --write-manifest
```

That prints the entry count and the commit it recorded, and exits `0` without
running the checks.

If neither source is available the script exits `2` and says so, rather than
verifying against nothing.

### Check A — the working tree

Every path in the upstream manifest is looked for on disk and hashed:

```bash
git hash-object --no-filters --stdin-paths
```

`--no-filters` is what makes this a **byte** comparison rather than a "what Git
would store" comparison. It catches a stray edit, a truncated file, and a file
that is simply absent.

It cannot see line-ending normalisation that happened at staging time, and it
cannot see a lost executable bit — the bytes are identical in both cases.

### Check B — the committed index

Every tracked path under `design/` is compared against the upstream manifest on
**both mode and object id**:

```bash
git ls-files -s -- design/
```

This is what catches the two things Check A is blind to: a blob that was
normalised on the way in (different object id, same visible content) and a file
that lost its `100755` mode. It also finds paths tracked under `design/` that
upstream does not have at all.

Check B refuses to pass vacuously. If it finds zero tracked paths under `design/`
— which would make the whole check a silent no-op that reads exactly like success
— it prints an error and exits `2`.

### Then: the allowlist filter

Findings from both checks are matched against the paths declared in
`MODIFICATIONS.md`. A declared path's findings are dropped. A declared path with
*no* findings is reported as `stale-notice`. What remains is the gap count.

## The `MODIFICATIONS.md` contract

`MODIFICATIONS.md` at the repository root is two things at once, deliberately:

1. the **Apache-2.0 §4(b) notice** — the licence requires prominent notices
   stating that files were changed, and
2. the **machine-read allowlist** the verifier uses to decide which differences
   are permitted.

Because they are the same list, the notice cannot quietly fall out of date. A
change without a notice fails the build; a notice without a change also fails the
build.

### How a path is declared

The verifier reads lines of exactly this shape, anywhere in the file outside an
HTML comment:

```markdown
- `apps/desktop/src/main/runtime.ts`
```

Paths are **relative to `design/`** — not to the repository root. The convention
is to group them under a `**Changed files:**` heading inside a dated entry that
also states the reason:

```markdown
### 2026-08-04 — Windows frameless window chrome

**Reason:** Windows builds ship a custom Material Design 3 title bar instead of
the operating system's.

**Changed files:**

- `apps/desktop/src/main/runtime.ts`
- `apps/desktop/src/main/preload.cts`
```

The `### ` heading and the `**Reason:**` line are for human readers; the parser
only looks for the backticked-path bullets.

### HTML comments are skipped

`MODIFICATIONS.md` documents its own entry format inside an HTML comment block,
using a realistic-looking example. The parser tracks `<!--` and `-->` and ignores
everything between them, so a template can never be mistaken for a declaration.
If you extend the file, keep examples inside comments.

<details>
<summary><b>The exact parser</b> — the awk program that turns MODIFICATIONS.md into the allowlist</summary>

```awk
/<!--/ { incomment = 1 }
!incomment && match($0, /^- `[^`]+`/) {
  line = substr($0, RSTART + 3, RLENGTH - 3)
  sub(/`$/, "", line)
  print line
}
/-->/ { incomment = 0 }
```

Consequences worth knowing:

- The bullet must start at **column 1**. An indented bullet — inside a nested
  list, a blockquote, or a table cell — is not a declaration.
- Only the **first** backticked span on the line is read, so trailing prose after
  the path is ignored and harmless.
- The comment tracking is line-based, not a real parser. A `<!--` and a `-->` on
  the same line open and close correctly; a path bullet on that same line would
  be skipped.
- The result is passed through `sort -u`, so a duplicate declaration is harmless.

</details>

## Counters

Every run reports the same eleven numbers. `--json` emits them on one line;
without it they are printed as a labelled block.

| Counter | JSON key | Meaning | Non-zero means |
| --- | --- | --- | --- |
| *(source)* | `source` | `submodule` or `manifest` — which upstream reference was used | Not a count; always check it, because it says what the run actually compared against |
| expected | `expected` | Files in the pinned upstream manifest | — (baseline: **11799**) |
| tracked | `tracked` | Paths tracked under `design/` in this repository | Should equal `expected` plus any declared additions |
| present | *(printed only)* | `expected − missing`; files actually found on disk | — |
| declared | `declared` | Paths listed in `MODIFICATIONS.md` | The size of the allowlist |
| missing | `missing` | In the manifest, absent from disk | A truncated or interrupted copy |
| bytes differ | `bytesDiffer` | On disk, but hashes to a different blob | An edit, **or a CRLF checkout** — see below |
| mode mismatch | `modeMismatch` | Tracked with a different file mode | A lost or added executable bit |
| oid mismatch | `oidMismatch` | Tracked with a different blob id | Content changed at staging time, e.g. line-ending normalisation |
| extra | `extra` | Tracked under `design/` but not in the manifest | A file was added to the vendored tree |
| untracked | `untracked` | Loose, non-ignored files under `design/` | An interrupted copy, or scratch files left behind |
| stale notice | `staleNotice` | Declared in `MODIFICATIONS.md` but no longer differs | The licence notice is out of date |
| gaps | `gaps` | Total findings surviving the allowlist | **Exit code 1** |

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Both checks clean after the allowlist filter. |
| `1` | One or more gaps. The first 50 are printed to standard error, each as `<kind>\t<path>`. |
| `2` | The script could not run a meaningful check. Five causes: the repository root could not be resolved; **neither** the submodule nor the manifest is available; the manifest's recorded commit disagrees with the submodule; the manifest's body disagrees with the submodule; or Check B found zero tracked paths. |

Exit `2` is deliberately distinct from exit `1`. "The check failed" and "the check
did not happen" are different facts, and a workflow that conflates them will one
day report a green tick for a check that silently did nothing.

## Reading a run

> [!IMPORTANT]
> **This is the only pasted verifier transcript in the repository, and it is a
> point-in-time observation, not a statement about the tree you have.** Every
> counter except `gaps` moves as rebranding work lands, so a number frozen into a
> document is wrong shortly after it is written. Every other page links here
> instead of pasting its own copy. For the current value, run the script; for the
> value at a given push, read the `Verify` workflow's job summary, which
> regenerates the whole table on every run.

Taken in the working tree at commit
`65e288f35bbb3253f9c2b2ea5c4fa75c9d224594` on 2026-08-03, with the rebrand edits
present **and declared**:

```
$ scripts/verify-port.sh --json
{"pinned":"517f39acde402c1a7af2189167a8d6957a3dac71","source":"submodule","expected":11799,"tracked":11799,"declared":67,"missing":0,"bytesDiffer":0,"modeMismatch":0,"oidMismatch":0,"extra":0,"untracked":0,"staleNotice":0,"gaps":0}

verify-port: 0 gaps.
exit 0
```

Read it in this order:

- **`gaps: 0` and exit `0`.** Both checks are clean after the allowlist filter.
  This is the only counter that decides pass or fail.
- **`declared: 67` is not a score.** It is the size of the allowlist — the 67
  files the rebrand has touched — and it grows every time the rebrand reaches
  another file. On its own it says nothing about whether the tree is correct.
- **`staleNotice: 0` is the other half of the contract.** Every declaration
  describes a difference that really exists, so the Apache-2.0 notice has not
  drifted into listing files that were later reverted.
- **`missing`, `bytesDiffer`, `modeMismatch`, `oidMismatch`, `extra` and
  `untracked` are all `0`**: the import itself has not drifted, nothing was lost,
  and no stray file is loose under `design/`.

**The invariant is `gaps == 0`.** Every difference from upstream is declared, and
every declaration describes a real difference. A run with many declared
differences and zero gaps is the contract working; a run with zero declared
differences and zero gaps is the same contract on an untouched tree. Both ends
have been observed — see the self-test below, where each state was produced
deliberately.

<details>
<summary>An earlier failing run, kept because a failure is more instructive than a pass</summary>

Taken in the same working tree earlier the same day, while the rebrand was ahead
of the allowlist — 15 files had been edited and not yet declared:

```
$ scripts/verify-port.sh --json
{"pinned":"517f39acde402c1a7af2189167a8d6957a3dac71","source":"submodule","expected":11799,"tracked":11799,"declared":52,"missing":0,"bytesDiffer":15,"modeMismatch":0,"oidMismatch":0,"extra":0,"untracked":0,"staleNotice":0,"gaps":15}

verify-port: 15 gap(s); first 50:
bytes-differ	.github/scripts/release/assets/linux.sh
bytes-differ	AGENTS.md
bytes-differ	apps/desktop/src/main/diagnostics.ts
…
exit 1
```

`bytesDiffer: 15` names the kind of gap — on-disk bytes, not modes or blob ids —
and the offending paths are printed, so the fix is mechanical: declare each one
in `MODIFICATIONS.md`, or revert it. Note that even here the import was intact;
`missing`, `modeMismatch`, `oidMismatch`, `extra` and `untracked` were all zero.
A failing run of this shape means the paperwork is behind the code, not that the
port is broken.

</details>

The fix for a failing run is always to declare the change or revert it. It is
never to loosen the verifier.

## Self-test

A verifier that has only ever been seen passing is a verifier nobody has any
reason to believe. The results below were produced by deliberately breaking the
tree, running the script, and restoring — each state was observed, not reasoned
about.

<details>
<summary><b>Seven observed allowlist states</b> — undeclared edit, declared edit, stale notice, restored, missing file, untracked file, clean</summary>

**T1 — an undeclared byte edit.** Appended a line to `design/README.md`:

```json
{"declared":0,"bytesDiffer":1,"staleNotice":0,"gaps":1}   exit 1
```

**T2 — the same edit, now declared.** Added `` - `README.md` `` to
`MODIFICATIONS.md` under a `**Changed files:**` heading:

```json
{"declared":1,"bytesDiffer":0,"staleNotice":0,"gaps":0}   exit 0
```

The finding is absorbed by the allowlist and the counter it was reported under
returns to zero. This is the round trip the contract depends on.

**T3 — the edit reverted, the declaration left behind.** Restored
`design/README.md` but kept the `MODIFICATIONS.md` entry:

```json
{"declared":1,"bytesDiffer":0,"staleNotice":1,"gaps":1}   exit 1
```

The stale notice fails the run. This is the half of the contract that keeps the
licence notice honest in the other direction — you cannot leave a change notice
lying around after reverting the change.

**T4 — both reverted.** Back to `gaps: 0`, exit `0`.

**T5 — a file missing from disk.** Moved `design/README.md` away:

```json
{"missing":1,"bytesDiffer":0,"gaps":1}   exit 1
```

**T6 — a stray untracked file.** Created `design/__stray.txt`:

```json
{"untracked":1,"gaps":1}   exit 1
```

**T7 — clean.** Full human-readable output as quoted above, exit `0`.

Every mutation was reverted; `git status --porcelain` reported no changes under
`design/` or to `MODIFICATIONS.md` afterwards.

</details>

<details>
<summary><b>Four observed source-of-truth states</b> — manifest fallback, no reference at all, and both manifest-drift guards</summary>

Run against copies of the script with the submodule path or the manifest path
redirected, so the real tree was never touched.

**M1 — submodule absent, manifest present.** The script falls back and reaches
the identical verdict. Recorded on a tree whose allowlist held 33 entries at the
time; the counter to compare is `gaps`, and `declared` is shown only because the
script prints it:

```json
{"pinned":"517f39ac…","source":"manifest","expected":11799,"tracked":11799,"declared":33,"gaps":0}   exit 0
```

This is the result that matters most: **the shortcut and the full submodule
produce the same answer on the same tree**, differing only in the `source` field.
That is what makes it safe for continuous integration to skip the 1.7 GB clone.

**M2 — neither source available.**

```
verify-port: no upstream reference available.
  Either check out the submodule (git submodule update --init)
  or restore <manifest path>.
exit 2
```

Exit `2`, not a pass. The script refuses to verify against nothing.

**M3 — the manifest's recorded commit disagrees with the submodule.** Rewrote the
`# commit` header to a bogus hash:

```
verify-port: <manifest> records deadbeef… but the submodule is at 517f39ac…
verify-port: regenerate it with scripts/verify-port.sh --write-manifest
exit 2
```

**M4 — the manifest's body disagrees with the submodule.** Deleted one entry from
the body while leaving the header intact:

```
verify-port: <manifest> disagrees with the submodule it claims to describe
0a1
> 100644  06b893ea…  .claude-plugin/marketplace.json
exit 2
```

M3 and M4 are the guards that keep the shortcut honest. A stale or tampered
manifest cannot silently stand in for the real tree — it is caught before either
check runs, and the diff names the missing entry.

</details>

**Not covered by the self-tests above:** the `modeMismatch`, `oidMismatch` and
`extra` counters were read from the source and are described here on that basis.
They require staging a mutated index entry to exercise, which was not done.

## Failure modes

### The line-ending trap — read this before writing a workflow

Check A hashes the bytes **on disk**. If a runner checks the repository out with
`core.autocrlf=true` — the default on some Windows configurations — every text
file under `design/` lands with CRLF line endings that are not in the upstream
blobs, and Check A reports **thousands** of `bytes-differ` findings against a
tree that is perfectly correct.

The repository is not broken in that situation; the checkout is. Do not "fix" the
files, and do not add them to the allowlist.

**The root `Verify` workflow sidesteps this by running on a Linux runner**, where
no line-ending conversion happens. That is the simplest fix and the one in use.

If the verifier is ever run from a Windows step, that step must guarantee LF:

```yaml
- name: Force LF checkout
  run: git config --global core.autocrlf false
- uses: actions/checkout@v4
```

The `core.autocrlf` setting must be applied **before** the checkout step, because
the conversion happens as files are written.

Note that the `Verify` workflow checks out **without** the submodule and relies
on the committed manifest — see the source-of-truth section above. That is
deliberate and safe, because the manifest is cross-checked against the submodule
whenever both are present.

### Other failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| Exit `2`, "no upstream reference available" | Neither the submodule nor the manifest is present | `git submodule update --init`, or restore `scripts/upstream-manifest.tsv` |
| Exit `2`, "records … but the submodule is at …" | The manifest is stale — the submodule pin moved and the manifest was not regenerated | `scripts/verify-port.sh --write-manifest` |
| Exit `2`, "disagrees with the submodule it claims to describe" | The manifest body was edited or truncated | Regenerate it. Never hand-edit the manifest. |
| Exit `2`, "check B would be a no-op" | No tracked paths under `design/` — a bad checkout, or the script run in the wrong repository | Confirm you are in the right repository and the tree is fully checked out |
| Thousands of `bytes-differ` | CRLF checkout | See the trap above |
| `stale-notice` for a path you did change | The path in `MODIFICATIONS.md` is relative to the repository root instead of to `design/` | Drop the `design/` prefix |
| A declaration is ignored entirely | The bullet is indented, or sits inside an HTML comment | Move it to column 1, outside any comment block |
| `extra` for a file you added on purpose | `design/` is a verbatim copy; new files do not belong in it | Put the file outside `design/` |
| Script runs but reports nothing on Windows | It is a POSIX shell script | Run it under a POSIX shell environment, or on a Linux runner |

### Known limitations

- **It proves fidelity, not correctness.** A green run says the copy matches
  upstream. It says nothing about whether upstream builds, runs, or is free of
  defects.
- **It trusts the pin.** Everything is compared against
  `393af2f991525a6c85cb04ee4aea0cd8967693c8`. Re-pointing the submodule changes
  what "verbatim" means, and the script will happily verify against the new pin —
  though it will refuse to run until the manifest is regenerated to match, which
  makes re-pinning a visible, two-file change rather than a silent one.
- **It does not read the reason.** The parser extracts paths. Whether the stated
  reason in a `MODIFICATIONS.md` entry is truthful or adequate is a review
  question, not a machine one.
- **`--json` is positional.** It is read as `$1`; it must be the first argument.

## Security considerations

- The script executes **no vendored code**. It reads Git object metadata and
  hashes files. Running it on an untrusted tree is safe in a way that running
  that tree's install scripts is not — which is the whole reason it is the one
  thing that has been executed in this repository.
- It writes only to a `mktemp -d` directory, removed by an `EXIT` trap.
- It makes **no network requests**. The submodule must already be checked out;
  the script will not fetch it.
- It prints paths and object ids only. No file contents reach the output, so a
  failing run in a public log cannot leak source.

## Verification

```bash
# one-time, for the full submodule path (optional — the manifest also works)
git submodule update --init

# human-readable; reports which source it used
scripts/verify-port.sh

# machine-readable, single line, suitable for a workflow assertion
scripts/verify-port.sh --json

# regenerate the committed manifest after re-pinning the submodule
scripts/verify-port.sh --write-manifest

# exit code only
scripts/verify-port.sh >/dev/null 2>&1 && echo ok || echo "failed: $?"
```

Always read the `source` field. A run that says `manifest` verified against a
committed table; a run that says `submodule` verified against the upstream
objects and also proved the table still matches them.

To reproduce the self-test, append a line to any file under `design/`, run the
script, then restore the file with `git checkout -- design/`.

### The CI gate has been observed rejecting a bad tree

For a long time every workflow here had only ever been watched *passing*, so
none was yet known to gate. That is closed for this gate: a deliberately
poisoned branch (`prove/gates-actually-bite`, an edit to `design/QUICKSTART.md`
with no `MODIFICATIONS.md` entry) made the *Verify* workflow fail exactly as
designed —
[run 30864702696](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/30864702696)
reports `bytes differ 1`, names `QUICKSTART.md` in both the bytes-differ and
blob-id lists, and exits 1. The branch existed only for that demonstration and
was deleted after the run; the run record is the durable evidence.

The *Pages* bundle gate could not be exercised the same way: the
`github-pages` environment refuses deployments from a non-default ref before
any step runs
([run 30864712524](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/30864712524)
failed with zero steps executed), which is a protection in its own right but
means a branch cannot reach the gate. Its six check commands, run verbatim
against the same poisoned tree locally, caught the planted remote script tag
(`site/index.html: loads a remote script`). So the gate's *logic* is
demonstrated; its *wiring* has still only been watched passing, and proving it
in CI would need a deliberate red commit on `main`, which has not been judged
worth it.

## Suggested reading

- [verbatim-import.md](verbatim-import.md) — how the copy was made in the first place
- [../build/ci.md](../build/ci.md) — where this script is expected to run automatically
- `MODIFICATIONS.md` — the notice and allowlist itself
