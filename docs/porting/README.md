# Porting

How the upstream design workspace was brought into this repository, and how the
copy is proved to be faithful.

The short version: `design/` holds **11,799 files** copied byte-for-byte from a
pinned upstream commit. A committed shell script re-derives that claim from
`git` alone, and `MODIFICATIONS.md` is both the licence-required change notice
and the allowlist that script reads. The two cannot drift apart, because a file
that differs without a notice fails, and a notice for a file that no longer
differs also fails.

The verifier runs on every push through the root `Verify` workflow — see
[../build/ci.md](../build/ci.md).

## Files in this category

| File | What it covers |
| --- | --- |
| [verbatim-import.md](verbatim-import.md) | How the copy was made: raw blob extraction with filters disabled, why a working-tree copy would not have worked, restoring the executable bit, and the two files that had to be force-added past upstream's own ignore rules. |
| [verification.md](verification.md) | `scripts/verify-port.sh` in full: both independent checks, every counter it reports, the `MODIFICATIONS.md` allowlist contract, the self-test results, the line-ending trap that will break it in continuous integration, and how to run it. |

## Current state

| Fact | Value | Verified |
| --- | --- | --- |
| Upstream project | Open Design, Apache-2.0 | Yes — `design/LICENSE` |
| Pinned upstream commit | `517f39acde402c1a7af2189167a8d6957a3dac71` | Yes — submodule `vendor/open-design` |
| Upstream version | v0.16.1 | Yes — `design/package.json` |
| Files under `design/` | 11,799 tracked, 11,799 expected | Yes — `scripts/verify-port.sh` |
| Files declared as changed | Whatever `MODIFICATIONS.md` currently lists | Read the file; the count moves with every rebrand commit |
| Verifier invariant | **`gaps` must be `0`** | Run the script, or read the `Verify` job summary |

**No verifier transcript is pasted here.** Every counter except `gaps` moves as
rebranding work lands, so a frozen copy is wrong shortly after it is written.
There is exactly one annotated transcript in this repository —
[verification.md § Reading a run](verification.md#reading-a-run) — and the
always-current values come from the `Verify` workflow's job summary, which
regenerates the whole table on every push.

What must stay at zero is **gaps**: every difference from upstream is declared,
and every declaration corresponds to a real difference.

## Why the copy exists at all

The submodule at `vendor/open-design` is provenance: it pins the exact upstream
commit and lets anybody re-derive the manifest. It is not the working copy,
because a submodule cannot be edited in place without either committing to
somebody else's repository or carrying a permanent dirty pointer.

`design/` is the working copy. The redesign has to modify real files — the
branding strings, the token layer, the interface components — and those edits
have to be reviewable as ordinary diffs in this repository's history. Keeping
both means every future change to `design/` shows up as a difference from a fixed
reference, which is exactly what the licence notice has to describe anyway.

## The rule that governs this category

**`design/` is byte-verbatim until a change is declared.** A change is declared by
adding an entry to `MODIFICATIONS.md` naming the reason and listing the changed
paths. Until that entry exists, the verifier fails and so does any workflow that
runs it. This is not a style preference — Apache-2.0 §4(b) requires prominent
notices on changed files, and an unenforced notice is a notice that goes stale.
