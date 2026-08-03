# A test budget written for a developer's disk

**Two failures, and neither was a wrong answer.** Both said "timed out". The
assertions never got the chance to be wrong, because the clock ran out while the
tests were still doing real work.

> [!IMPORTANT]
> **Status: fixed.** The Windows job runs those specs with a 30-second budget.
> Nothing is skipped, no assertion is relaxed, and a genuine hang still fails —
> it just fails after 30 seconds instead of on a fast disk's schedule.

## Symptom

```
  × syncs the launcher runtime pointers
    → Test timed out in 5000ms.
  × writes the cleanup metadata
    → Test timed out in 5000ms.
```

Two specs, both in the launcher-runtime-sync group, both exceeding the
framework's five-second default on the hosted Windows runner, every time.

The confusing part: **the Linux job was entirely green across all 37 spec files
while these two kept failing on Windows.** That looks like a Windows-specific code
defect, and it is not.

## Cause

Two facts combine.

**First, both specs are gated to Windows.** They run only when the platform is
`win32`, so the Windows job is the only place in the whole pipeline they ever
execute. Linux skips them, which is why the Linux suite could be green while these
two failed — the Linux run never touched them.

**Second, they do real filesystem work.** They synchronise launcher runtime
pointers and write cleanup metadata: actual directories, actual files, actual
`fsync`-shaped costs. That is the behaviour under test, not incidental setup.

The package ships no test-framework configuration of its own, so the specs inherit
the framework's default per-test budget of **five seconds**. Five seconds is a
developer-machine number — it assumes a fast local disk. A hosted runner's storage
is slower, and the tests run out of clock before they run out of work.

## Fix

Raise the budget on that job's invocation to 30 seconds:

```
--testTimeout=30000
```

Three properties of that fix are worth stating, because "raise the timeout" is
also what somebody does when they are papering over a real problem:

1. **Nothing is skipped.** Both specs still run, on the only platform that runs
   them.
2. **No assertion is relaxed.** The tests still have to pass; they simply have
   longer to finish the work they were always doing.
3. **A genuine hang still fails.** A deadlock does not complete in 30 seconds any
   more than in 5. The budget distinguishes "slow disk" from "never", which is
   exactly what a timeout is for.

The workflow carries a comment recording all three, because a raised timeout with
no explanation is indistinguishable from a suppressed failure.

## How to avoid reintroducing it

- **A default timeout is a hardware assumption.** Any framework default was chosen
  against somebody's laptop. A test that touches a disk, a network, or a
  subprocess is measuring hardware as much as logic.
- **Set the budget where the cost is, not globally.** Raising every timeout in the
  repository to hide two slow specs removes the signal everywhere else. This fix
  applies to one invocation on one job.
- **Beware the platform-gated spec.** A spec that runs on exactly one platform has
  exactly one job's worth of evidence. When one job is green and another is red for
  "the same suite", check first whether they are actually running the same specs.
- **Distinguish "timed out" from "wrong".** A timeout is a *budget* failure, and
  the first question is always whether the work legitimately takes that long. If it
  does, the budget was wrong. If it does not, something is stuck and raising the
  budget hides it.
- **If a spec is slow because the code is slow, fix the code.** These two are slow
  because they write files, which is the thing being tested.

## Verification

**Observed:** with the budget raised, the packaging tool's suite passed on the
Windows runner — 20 files, 121 tests, zero failures — which confirmed the timeout
had been the whole story for those two specs.

```bash
# reproduce the default-budget failure
pnpm --filter @open-design/tools-pack exec vitest run launcher-

# and the job's actual invocation
pnpm --filter @open-design/tools-pack exec vitest run --testTimeout=30000 \
  win- launcher- release-workflows config versions resources
```

To check the budget is still doing its job rather than hiding something, watch the
reported durations: if those specs start approaching 30 seconds, the work has grown
and the next failure will be a real one.

## Security considerations

None. Recorded here because "raise the timeout" is a fix that deserves scrutiny,
and the scrutiny is easier when the reasoning is written down.

## Suggested reading

- [platform-specific-tests.md](platform-specific-tests.md) — why these two specs run only on Windows, and what else the split moved
- [unbuilt-package-imports.md](unbuilt-package-imports.md) — the failure on the other job, in the same stretch of work
- [../release/release-pipeline.md](../release/release-pipeline.md) — the step this invocation belongs to
