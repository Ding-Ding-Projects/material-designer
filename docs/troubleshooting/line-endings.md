# Line-ending translation, and thousands of false differences

**The port verifier reported thousands of differing files against a tree that was
perfectly correct.** Nothing had drifted. The checkout had rewritten every text
file on its way to disk, and the verifier — which hashes the bytes it finds —
faithfully reported that those bytes were not the upstream bytes.

> [!IMPORTANT]
> **Status: guarded, in both workflows.** The fast gate runs on Linux, where no
> translation happens. The Windows release job sets the checkout to leave bytes
> alone **before** the checkout step, because the build must be made from the bytes
> the provenance claim is about.

## Symptom

```
bytes-differ: design/apps/daemon/src/server.ts
bytes-differ: design/apps/daemon/src/cli.ts
bytes-differ: design/apps/web/src/App.tsx
... (thousands more)
```

The count is the tell. A real drift is a handful of files, usually ones somebody
just edited. **Thousands of differences, spread evenly across every text file in
the tree, is never drift** — it is a transformation applied to all of them at once.

## Cause

The verifier's first check hashes the bytes **on disk** and compares them against
the upstream object ids. That is the whole point: it proves the working tree is
byte-for-byte what it claims to be, not merely that the repository's index says
so.

Two things then combine on a Windows checkout:

1. **The version-control client for Windows enables line-ending translation in its
   system configuration by default.** Files are converted to carriage-return line
   feeds as they are written to disk.
2. **The repository's own attributes mark content as text**, which is what tells
   the client those files are eligible for conversion.

So every text file lands with line endings the upstream blobs do not contain,
every hash differs, and the verifier reports thousands of findings against a tree
nobody has touched.

> [!WARNING]
> **The repository is not broken in this situation; the checkout is.** Do not
> "fix" the files. Do not add them to the change-notice allowlist. Both of those
> would take a transient checkout artefact and make it a permanent, committed
> misstatement about what the imported tree contains.

There is a second-order trap that makes the result even more confusing: the
imported tree pins line endings explicitly on a small number of files. Those stay
as they are while everything around them flips, so the failure is not even
uniform — a handful of files pass while their neighbours fail, which looks like a
selective corruption rather than a blanket transformation.

## Fix

**Preferred: run the verifier on Linux.** No conversion happens there, so the
question never arises. The fast gate does this, and its workflow says so
explicitly rather than leaving it as an unstated property of the runner it
happened to be given.

**When a Windows step genuinely needs it**, guarantee byte-exactness before the
checkout:

```yaml
- name: Keep the checkout byte-exact
  shell: bash
  run: |
    git config --global core.autocrlf false
    git config --global core.eol lf

- uses: actions/checkout@v4
```

**The order is load-bearing.** Conversion happens as files are written, so
configuration applied after the checkout step changes nothing about the files
already on disk. A guard in the wrong position looks exactly like a guard in the
right position, right up until it does not work.

The Windows release job carries this guard for a reason beyond verification: the
installer must be built from the bytes the provenance claim is about. A build made
from a differently-encoded tree is a build of something the change notice does not
describe.

## How to avoid reintroducing it

- **Any job that hashes file contents must control line endings.** Verification,
  checksums, reproducible-build comparisons, cached-artifact keys — all of them.
- **Put the guard before the checkout, always**, and give it a name that says what
  it does rather than what setting it changes.
- **Read the count before reading the list.** Thousands of differences is a
  transformation; a handful is a change. That single heuristic resolves this class
  of failure in seconds.
- **Never resolve a mass difference by declaring the files.** The change-notice
  allowlist exists to record intentional differences from upstream. Filling it with
  checkout artefacts destroys its only value, and the verifier would then also flag
  every one of them as a stale notice on the next correct checkout.
- **Do not normalise files to make the check pass.** Rewriting the imported tree to
  a different encoding is exactly the drift the verifier exists to detect.

## Verification

**Observed:** the fast gate passes on Linux with zero gaps on a clean checkout, and
the Windows release job runs the same verifier after its guard step and passes
there too. Two platforms, one answer, which is the property the guard buys.

```bash
# the verifier, in a checkout you control
scripts/verify-port.sh

# machine-readable, if you want to read the counters yourself
scripts/verify-port.sh --json
```

If a Windows checkout is already wrong, re-checkout rather than repairing files:

```bash
git config --global core.autocrlf false
git config --global core.eol lf
git rm --cached -r . && git reset --hard
```

## Security considerations

Indirect, but real. This repository's central claim is that the imported tree is
byte-for-byte its upstream source, and the verifier is the evidence for that
claim. A workflow that silences a mass difference — by normalising files, by
declaring them, or by dropping the check on the platform where it is inconvenient
— removes the evidence while leaving the claim in place. That is a provenance
failure, not a build failure.

The verifier itself is safe to run on an untrusted tree: it executes no vendored
code, makes no network request, reads only object metadata and file bytes, and
prints only paths and object ids.

## Suggested reading

- [../porting/verification.md](../porting/verification.md) — the verifier in full: its two checks, its counters, its exit codes, and the allowlist contract
- [../porting/verbatim-import.md](../porting/verbatim-import.md) — how the byte-for-byte copy was made, and the four ways a working-tree copy fails
- [../release/release-pipeline.md](../release/release-pipeline.md) — the release job's guard step, and why it verifies before installing
- [../build/ci.md](../build/ci.md) — why the fast gate runs on Linux
