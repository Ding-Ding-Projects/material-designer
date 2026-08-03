# The line count

Every release states how many lines of code the project has at that release, and
**continuous integration produces the figure**, not a person. The counter is a
committed script, run by the same job that built the artifacts, at exactly the
commit being released.

> [!IMPORTANT]
> **Status: built, wired into both workflows, and published.** The counter runs in
> `Verify` (without attribution) and in `Release` (with attribution, scoped to
> this repository's own files), and its table appears in the notes of the releases
> that exist.

## Why a script, and why CI

A line count is a fact about a specific commit. Pinned to the tag it was measured
at, it is a real datum a reader can compare across releases; floating in prose, it
is stale the day after it is written. Putting the measurement in the run that
built the artifacts removes every opportunity for a hand-typed number to drift
from the tree.

There is a second reason, and it is about cost. Re-deriving a count by hand —
listing files, piping them through a word counter, bucketing by path prefix —
dumps hundreds of per-file lines into a log to arrive at a handful of totals. It
is also *less accurate*: an ad-hoc bucketing silently drops every file matching no
prefix, so whole directories vanish from a total nobody checks. A committed
counter can carry a catch-all row, be reviewed, and be fixed once for everybody.

**So: never count by hand.** If the script's breakdown is wrong, fix the script
and re-run it. The script is what the release publishes, so the correction belongs
there.

## Behaviour

### What is counted, and how it is discovered

File discovery is the repository's own tracked-file list. Untracked build output
can therefore never be counted, and nothing is discovered by walking the
filesystem.

Every tracked file lands in **exactly one row**. Each scope carries a mandatory
`Uncategorized` catch-all — printed even at zero, so a reader can see nothing was
dropped — and a self-check that the rows sum back to the tracked-file count. A
bucketing that loses files misrepresents the project, so the script fails rather
than printing a total it cannot justify.

### The two scopes

| Scope | What it is |
| --- | --- |
| The project's own code | Everything tracked outside the imported upstream tree. This is what this repository actually wrote. |
| The imported upstream tree | Everything under the vendored prefix, reported separately and labelled as imported. |

Separating them is the whole point. A single number that folds in 11,799 imported
files says nothing about the work this repository has done, and quoting it as a
project size would be a misrepresentation.

### The three totals

| Total | Covers |
| --- | --- |
| Project's own code | The first scope alone |
| Grand total counted | Own code plus the imported tree |
| All tracked files | The above plus every excluded row |

Two clearly labelled totals let a reader see both what the project is and what the
repository holds; one total with silent exclusions lets them see neither. The
third total is annotated **"text rows only"** when any excluded row has no line
count — binary files, symlinks and submodule pointers have none, and the script
says so rather than implying the figure covers them.

### Categories and areas

Rows appear in a fixed order so two runs are comparable: `Source`, `Tests`,
`Styles & markup`, `Configuration`, `Documentation`, `Generated`,
`Data & assets`, `Uncategorized`. Each scope is also split by subproject inside a
collapsible block, with two-level labels for the conventional container
directories, so `apps/daemon` reads as one area rather than everything under
`apps` reading as one.

Generated files are separated from hand-written ones — by directory name, by
lockfile name, and by a set of self-declaring markers a file may carry in its
opening lines. A reader should be able to see how much of the project a person
actually wrote.

### Exclusions are visible rows, never silent drops

| Excluded | How it is detected |
| --- | --- |
| Version-control internals, dependency directories, vendored and third-party trees, build output, framework caches, coverage | A directory-name segment anywhere in the path |
| Lockfiles | Exact basename, across a dozen ecosystems |
| Binary content | Extension. Never read, never line-counted. |

Every exclusion is printed as a row with its own file count, its lines where they
are knowable, and example paths. A count that quietly folds in a vendored library
misrepresents the project; so does one that quietly drops something without
saying it did.

### Authorship, per surviving line

Attribution uses `git blame`, **never** a sum of added lines from the log. Churn
is not authorship: a line written and later deleted belongs to nobody.

A commit counts as agent-authored when its author name or email matches a
published automation-identity pattern, or when its message carries a
`Co-Authored-By:` trailer whose value matches the same pattern. Everything else
counts as human-authored. **The pattern itself is printed in the output**, so the
number can be checked against the rule that produced it rather than taken on
trust. Lines present in the working tree but not yet committed get their own row,
as do lines from commits the rule could not classify.

The figure is stated plainly and without spin in either direction. A high agent
share is not a boast and not an apology.

> [!IMPORTANT]
> **The counter's arithmetic must agree with itself.** If the attribution total
> and the counted line total disagree for the same scope, the script fails loudly
> rather than printing two numbers that contradict each other. An unexplained gap
> between two figures in one table destroys the credibility of both. The usual
> cause is counting a file's trailing newline as an extra line, which `git blame`
> does not.

### Why attribution is opt-in

Attribution spawns one `git blame` per counted file. The imported tree is roughly
11,800 files, so a full-tree attribution pass is thousands of subprocesses. Hence
two flags:

| Flag | Effect |
| --- | --- |
| `--blame` | Compute attribution. Without it, the table honestly says **not computed** and tells the reader how to compute it. |
| `--blame-paths <globs>` | Comma-separated globs limiting which files are blamed. The counter reports the scope it used, so the published table says what it covers rather than implying the whole tree. |
| `--json` | Machine-readable output instead of the Markdown table. |

## Configuration in the two workflows

| Workflow | Invocation | Result |
| --- | --- | --- |
| `Verify` | `node scripts/line-count.mjs`, teed into both the log and the job summary | Full counts; the authorship table reads **not computed** |
| `Release` | `node scripts/line-count.mjs --blame --blame-paths '<globs>'` into a file | Full counts plus attribution over this repository's own files |

The `Release` scope is:

```
scripts/**,mockups/**,assets/**,docs/**,site/**,.github/**,*.md,.git*
```

— this repository's own files, deliberately excluding the imported tree.

`Verify` **tees** rather than redirecting, because a table that exists only in a
job summary cannot be read back from the logs when the number looks wrong, which
is exactly when you want to read it.

`Release` has a three-step fallback and keeps standard error:

1. Run with attribution.
2. If that fails, log the reason and re-run without it.
3. If that fails too, write an honest "not available for this build" line.

Standard error is **not** discarded, because a non-zero exit from this counter
means one of its own self-checks tripped — the accounting check or the attribution
invariant, both of which list the offending files. That reason belongs in the step
log, not in a bit bucket. The two longest messages are also the two most important
ones, which is why the script's failure path writes synchronously: process exit
discards pending asynchronous writes, and a piped standard error is asynchronous,
so the explanation is exactly what would be truncated.

## The README copy

The README may carry the latest figure, refreshed when a release publishes one.
That copy is a convenience, **not the record** — the release notes are. Never
hand-edit the README to a number no release ever published, and never let the two
disagree.

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| The counter exits non-zero and lists files | The accounting self-check failed: the rows do not sum to the tracked-file count | A bucketing bug. Fix the script; do not suppress the check. |
| The counter exits non-zero over attribution | The attribution total disagrees with the counted total | Usually a trailing-newline discrepancy. Fix the arithmetic before publishing. |
| The authorship table says "not computed" | The run did not pass the attribution flag | Expected in the fast gate. In a release, check the fallback chain did not fire. |
| The release notes say the count was not available | Both counter invocations failed | The reason is in the step log, because standard error is kept. |
| A whole directory is missing from the table | Impossible by construction — the catch-all row would have caught it | If it happens anyway, the catch-all was removed. Restore it. |
| The number jumped implausibly between releases | A generated or vendored tree started being counted, or stopped | Read the excluded rows; they are printed for this reason. |
| The counter is slow in a release run | Attribution scope is too broad | Narrow the path globs. The scope is reported in the output either way. |

## Security considerations

The counter reads tracked files and repository metadata and prints aggregate
counts, a category breakdown, example paths for excluded rows, and the identity
rule it applied. **It does not print author names or email addresses** — only two
aggregate authorship rows. No file contents reach the output, so a failing run in
a public log cannot leak source.

## Verification

**Observed:** the counter runs in both workflows and its table appears in the
notes of the published releases.

```bash
# the human-readable table, exactly as the fast gate produces it
node scripts/line-count.mjs

# machine-readable, for a check of your own
node scripts/line-count.mjs --json

# with attribution, scoped the way the release job scopes it
node scripts/line-count.mjs --blame --blame-paths 'scripts/**,docs/**,site/**,*.md'
```

Three properties are worth checking by hand once, and never again by hand after
that:

- the `Uncategorized` row exists in every scope, even at zero;
- the excluded rows are present with real numbers;
- the authorship total equals the counted total for the same scope.

## Suggested reading

- [release-pipeline.md](release-pipeline.md) — the step that runs this, and what it does when it fails
- [release-assets.md](release-assets.md) — the rest of what a release carries
- [../standards/releases.md](../standards/releases.md) — the requirement this satisfies, stated as a standard
- [../build/ci.md](../build/ci.md) — the fast gate that also publishes a table, without attribution
