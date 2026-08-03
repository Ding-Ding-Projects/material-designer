# Troubleshooting

Failures this project actually hit, written up so the next person does not have to
rediscover them. Every page here describes something that really happened, with
the symptom as it appeared in a log, the cause, and the fix.

Nothing on these pages is hypothetical. A troubleshooting guide padded with
failures nobody has seen is a guide whose real entries are harder to find.

These pages use **Symptom / Cause / Fix / How to avoid reintroducing it /
Verification / Security considerations** rather than the five headings every other
category follows ([the tree's convention](../README.md#the-convention-this-tree-follows)),
because the whole article is a failure mode and a failure-modes section inside one
would restate its own subject. That is the one declared exemption in the tree.

## Files in this category

| File | The failure |
| --- | --- |
| [line-endings.md](line-endings.md) | A byte-comparison reported **thousands** of differing files against a tree nobody had touched, because the checkout translated line endings on the way to disk. Includes why the guard must come *before* the checkout step. |
| [platform-specific-tests.md](platform-specific-tests.md) | Tests asserting a Unix executable bit on a filesystem that has none, and tests building a symlinked layout a runner may not be permitted to create. Both fixed by splitting the suites by what each platform can answer — a split, not a skip. |
| [unbuilt-package-imports.md](unbuilt-package-imports.md) | Three suites died at import time with a missing module, because they import built output that the install step does not build. |
| [test-timeouts.md](test-timeouts.md) | Two platform-gated specs that do real filesystem work, inheriting a five-second default budget written for a fast local disk. |
| [packaging-schema-drift.md](packaging-schema-drift.md) | An installer build rejected before packing anything, because a configuration property moved between major versions of the build tool and now fails schema validation on sight. |

## How to read a failure quickly

Most of the entries above were initially misread as something else. These
heuristics are what turned each of them around, and they generalise:

| Signal | What it usually means |
| --- | --- |
| **Thousands** of differences, evenly spread | A transformation applied to everything, not a change to something. Check the checkout, not the files. |
| The same job green on one platform, red on another, "for the same suite" | The two are not running the same specs. Check the platform gates first. |
| Zero tests executed and no failures reported | Nothing loaded. Look for an import error, not an assertion. |
| "Timed out" rather than a wrong value | A budget failure. Ask whether the work legitimately takes that long before assuming a hang. |
| A tool rejecting configuration before doing any work | A schema mismatch, not a build failure. Nothing was attempted, so nothing was tested. |
| A path comparison failing on two paths that differ only in resolution | A filesystem capability story — symlinks, canonicalisation, case — not a logic bug. |
| Data present on disk but invisible to the application | A path that did not derive from the resolved data root. See [../architecture/data-directory.md](../architecture/data-directory.md). |

## Two rules these pages are held to

**Say what actually happened.** Log excerpts are the real ones, counts are the real
counts, and where a run's outcome is quoted it is an outcome that was observed. A
troubleshooting page that invents a plausible error message sends the next reader
searching for a string that does not exist.

**Explain why the fix is the fix.** Several of these — a raised timeout, a build
step inside a test job, a filtered test invocation — look exactly like somebody
papering over a problem. Each one carries the reasoning that distinguishes it from
that, in the source or the workflow as well as here, because a rule whose reason is
unstated gets "simplified" away by the next person.

## Suggested reading

- [../release/release-pipeline.md](../release/release-pipeline.md) — the pipeline these failures were hit while building
- [../build/ci.md](../build/ci.md) — the three workflows, and the failure-mode tables that live with each
- [../porting/verification.md](../porting/verification.md) — the verifier, its counters, and its own failure modes
- [../architecture/data-directory.md](../architecture/data-directory.md) — the invariant whose violation produces the least legible failure in the whole product
