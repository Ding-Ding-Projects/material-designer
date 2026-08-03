# Tests that cannot pass on the runner they were given

**Two failures, one shape.** A test asserts something about the filesystem that
the runner's filesystem cannot represent, so it fails for a reason that has
nothing whatsoever to do with the code under test. No amount of reading the diff
helps, because the diff is fine.

> [!IMPORTANT]
> **Status: fixed.** The suites are now split by what each platform can actually
> answer. Windows runs the specs only Windows can answer; Linux runs the full
> suite for the same three packages. **Every spec still runs somewhere** — this is
> a platform split, not a skip, and the distinction is the whole point.

## Symptom 1 — a Unix executable bit on a filesystem that has none

The first build reached the tests and stopped there:

```
Test Files  ...
     Tests  258 passed | 3 failed

  × node-pty spawn-helper is not executable (darwin-x64)
  × node-pty spawn-helper is not executable (darwin-arm64)
  × node-pty spawn-helper is not executable
```

Three failures, all the same complaint, all about macOS prebuilt binaries.

### The cause

The specs unpack macOS prebuilt binaries and assert that the helper's **executable
bit survived** the unpack. That is a genuinely important thing to check: a
prebuilt binary that arrives without its executable bit is a binary that will fail
to spawn at runtime, on a user's machine, in a way that is hard to trace back.

But NTFS has no Unix executable bit to preserve. The assertion cannot pass on a
Windows runner and was never going to. Upstream never ran those specs there;
running them on Windows was this repository's addition.

### The fix

Split the suites by what each platform can answer.

- **The Windows job** runs the specs about Windows identity, install paths,
  installer targets and the launcher payload — the ones whose failure would mean a
  broken installer.
- **A Linux job** in the fast-gate workflow runs the full suite for all three
  packages, which is where the macOS specs are meaningful and where they pass.

Both workflow files carry a comment saying which and why, so that the Windows
filter is not later read as "somebody found the mac tests inconvenient".

> [!NOTE]
> Worth stating plainly, because it is the part that gets lost: in that same run
> **the install succeeded and the whole workspace typechecked.** Native modules
> compiled from source on the runner and every post-install target built. The
> failure was three tests about a different operating system.

## Symptom 2 — a symlinked layout the runner may not create

With the timeout fixed and the packaging tool's suite green on Windows, the
packaged launcher's suite then failed five specs on Windows that had passed on
Linux minutes earlier:

```
  × prewarm resolves the packaged module layout
    → expected [ '<resolved path A>' ] to deeply equal [ '<resolved path B>' ]
```

### The cause

The specs build a module layout with `symlinkSync`. Creating a symbolic link on
Windows requires a privilege the runner does not have unless developer mode or
elevation is in play. Without it the layout is not what the spec assumed, the
resolved paths differ, and a deep-equality assertion fails — again, for a reason
unrelated to the code under test.

This one is subtler than the executable bit, because it does not fail at the
`symlinkSync` call in an obvious way. It fails several assertions later, on a path
comparison, which reads like a path-resolution bug.

### The fix

The same split. The Windows job runs only the specs Windows alone can answer:
installer identity, install paths, build targets, launcher payload. Linux already
runs the full suite for all three packages and is green.

## Why this is a split and not a skip

The difference matters enough to have its own heading, because a future reader
looking at a filtered test invocation will want to know whether awkward tests were
quietly dropped.

| | A skip | This split |
| --- | --- | --- |
| Where does the spec run? | Nowhere | On a platform that can answer it |
| What happens if it regresses? | Nothing | A job goes red |
| Is the reason recorded? | Usually not | In the workflow, in the commit, and here |
| Is the coverage total? | No | Yes — every spec runs somewhere |

Two specs in the Windows set are additionally gated to run **only** on Windows, so
that job is the only place they ever execute. Linux skips them, which is why the
Linux suite can be entirely green while those two keep failing on Windows —
covered in [test-timeouts.md](test-timeouts.md).

## How to avoid reintroducing it

- **Before adding a suite to a job, ask what the runner's filesystem can
  represent.** Unix permission bits, symbolic links, case sensitivity, path length
  limits and reparse points all differ, and every one of them can turn a correct
  test into a red one.
- **Gate on capability, not on convenience.** A spec that legitimately needs a
  platform should be gated to that platform in the spec, so the gate travels with
  the test rather than living in a workflow file somebody will later edit.
- **Never widen a filter to make a job green.** If a spec stops running, say where
  it runs instead. A test suite whose coverage nobody can state is a suite nobody
  can trust.
- **Read the failure before assuming the code is wrong.** "Expected A to deeply
  equal B" on two paths that differ only in resolution is a filesystem story, not a
  logic story.

## Verification

**Observed:** the Linux job runs the full suite for the packaging tool, the
packaged launcher and the desktop shell, and passes — macOS specs included. The
Windows job runs the identity, path, target and payload specs, and passes.

```bash
# what the Linux job runs — the full suite for the three identity-carrying packages
pnpm --filter @open-design/tools-pack run test
pnpm --filter @open-design/packaged run test
pnpm --filter @open-design/desktop run test
```

To confirm the split is still total rather than eroded, compare the spec files the
Windows filter selects against the full file list, and check that everything not
selected is covered by the Linux job.

## Security considerations

None directly. One indirect note: the temptation to "fix" the symlink failure by
enabling developer mode or elevating the runner is a real one, and it would be the
wrong trade — granting a build agent link-creation privileges to satisfy a test
that another runner already satisfies buys nothing and widens what a compromised
workflow can do.

## Suggested reading

- [test-timeouts.md](test-timeouts.md) — the two Windows-only specs that failed next, for a completely different reason
- [unbuilt-package-imports.md](unbuilt-package-imports.md) — the failure the Linux job hit once it was created
- [../release/release-pipeline.md](../release/release-pipeline.md) — where each of these jobs sits in the pipeline
- [../build/ci.md](../build/ci.md) — the workflows as a set
