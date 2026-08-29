# Porting

How the upstream design workspace was brought into this repository, and how the
copy is proved to be faithful.

The short version: `design/` holds a **13,155-file upstream baseline** copied byte-for-byte from a
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
| [verbatim-import.md](verbatim-import.md) | How the copy was made: raw blob extraction with filters disabled, why a working-tree copy would not have worked, restoring the executable bit, and the seven files that had to be force-added past upstream's own ignore rules. |
| [verification.md](verification.md) | `scripts/verify-port.sh` in full: both independent checks, every counter it reports, the `MODIFICATIONS.md` allowlist contract, the self-test results, the line-ending trap that will break it in continuous integration, and how to run it. |
| [feature-lineage.md](feature-lineage.md) | The explicit commit, preservation-branch, custom-feature, and per-surface inventory, with its fail-closed validator and red-then-green negative regression. |
| [c0-source-preservation.md](c0-source-preservation.md) | The bounded 51-path C0 terminal source-preservation inventory in [c0-source-preservation.json](c0-source-preservation.json), exact blob hashes, semantic reasons, and red-then-green [verify-c0-source-preservation.ps1](../../scripts/verify-c0-source-preservation.ps1) verifier. |

## Current state

| Fact | Value | Verified |
| --- | --- | --- |
| Upstream project | Open Design, Apache-2.0 | Yes — `design/LICENSE` |
| Pinned upstream commit | `a554d017c8fa12d8913354ba6cf792d26d0c3b54` | Yes - submodule `vendor/open-design` and `scripts/upstream-manifest.tsv` |
| Upstream version | v0.21.1 development baseline | Yes - `design/package.json` and the pinned commit |
| Files under `design/` | 13,473 tracked, 13,143 expected upstream | Yes - `scripts/verify-port.sh`; project-only additions account for the difference |
| Files declared as changed | 767 unique paths | Yes - `MODIFICATIONS.md`, checked by `scripts/verify-port.sh` |
| Current overlay shape | 396 changed upstream paths, 322 project-only paths, 13 removed upstream paths | Yes - target and current index mode/blob comparison; verifier reports zero stale notices |
| Historical raw-byte repair | 1,200 index-equal paths materialized during the 2026-08-25 reconciliation | Yes - retained as history; the current verifier reports zero raw-byte gaps |
| Verifier invariant | **`gaps` must be `0`** | Run the script, or read the `Verify` job summary |

**No verifier transcript is pasted here.** Every counter except `gaps` moves as
rebranding work lands, so a frozen copy is wrong shortly after it is written.
There is exactly one annotated transcript in this repository:
[verification.md, Reading a run](verification.md#reading-a-run). The
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

## Suggested reading

- [../architecture/overview.md](../architecture/overview.md) — what the imported tree actually is, once you trust that it is intact
- [../troubleshooting/line-endings.md](../troubleshooting/line-endings.md) — the failure this category produces most often: thousands of differences against a tree nobody touched
- [../standards/README.md](../standards/README.md) — what is being changed in the verbatim copy, and the honest status of each requirement
- [../build/ci.md](../build/ci.md) — where the verifier runs in continuous integration, and why the gate checks out without the submodule
