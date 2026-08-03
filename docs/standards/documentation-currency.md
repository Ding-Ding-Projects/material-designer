# Documentation stays current, task by task

**Standard 16.** Every task that changes the project brings its documentation,
its changelog and its roadmap current **in that same task** — not at release
time, and not in a later cleanup pass.

**Status: in force.** This documentation tree is the first instance of it. The
standard is met when no task lands with a document describing behaviour the task
changed; it is not a state the project reaches once and keeps.

## The requirement

### What must be current, and when

| Surface | Brought current |
| --- | --- |
| `README.md` | In the task that changes what it describes. |
| The categorized feature documentation under `docs/` | In the task. A new feature gets its article before the task is called complete; a fix that changes behaviour edits the article that described the old behaviour. |
| `CHANGELOG.md` | In the task that ships user-visible behaviour, worked out from the real commit history rather than from memory. |
| `ROADMAP.md` | In the task. An item that landed is marked as landed; an item that turned out to be bigger is re-described. |
| `HANDOFF.md` | In the task. It records what changed, the verification evidence, what remains, and any external dependency. |
| The landing page and the documentation site | In the task. A feature that ships and never appears there is undocumented in practice, however good its code is. |

### What "current" means

Three things, in order of how often they are got wrong:

1. **No document describes behaviour that no longer exists.** This is the one
   that matters. A reader has no way to tell a confidently wrong page from a
   correct one.
2. **No document claims something that has not been observed.** Verified,
   defined-but-unrun, and intended are three different states, and every page
   says which one it is describing.
3. **No shipped feature is undocumented.** Including on the site, which is where
   most readers will look.

### Status claims carry their evidence

A claim about what works names how it was checked, and a claim that has *not*
been checked says so. This is the rule that makes the rest of the documentation
tree usable: a reader who knows which sentences are load-bearing can act on them,
and a reader who cannot tell has to re-verify everything or trust nothing.

Where a number or a transcript is quoted, it is anchored to the commit and the
date it was taken at — see
[../porting/verification.md](../porting/verification.md#reading-a-run), which
quotes the only verifier transcript in the repository and says exactly that about
it.

## Why "in the same task"

**Stale documentation is worse than none**, because it is confidently wrong and
the reader has no way to know. A missing page sends someone to read the source;
a wrong page sends them to do the wrong thing and be sure about it.

The "same task" part is not pedantry, it is the only rule that works. Deferred
documentation is written from memory, by somebody who has lost the context, about
a change whose reasons are no longer obvious — if it is written at all. The cost
of writing it during the task is minutes; the cost afterwards is a re-reading of
the diff, and the cost of never is a document that misleads until somebody is
burned by it.

**The reason is documented, not just the rule.** A rule whose reason is unstated
gets "simplified" away by the next person, who reasonably concludes it was
ceremony. Every article in this tree explains the failure its rule prevents, for
that reason.

## The failure this repository has already demonstrated

Worth recording, because it is the specific shape this standard fails in and it
is not obvious in advance.

**Status written in many places goes stale in many places.** When five documents
each carry their own paragraph about what has been built, a task that changes
what has been built has five edits to make, and it will make two of them. The
result is a set of documents that disagree with each other — and a reader who
finds the disagreement cannot tell which one is behind, so all five lose their
authority at once.

The fix is structural, not diligence:

- **One document owns each fact.** Everything else links to it rather than
  restating it. This tree already does that for the verifier transcript, which is
  quoted once and linked from everywhere else.
- **Prefer facts that do not go stale.** "The `Verify` workflow regenerates this
  table on every run" stays true; a pasted table does not. Where a number must be
  quoted, anchor it to a commit and a date, so a reader can see how old it is.
- **Say the state, not the vintage.** "Not started", "designed, not built",
  "implemented, not audited" and "verified, by this command" age far better than
  "not yet", which is true until the moment it silently is not.

## Current implementation status

| Requirement | Status |
| --- | --- |
| A categorized documentation tree with a per-category index | **Implemented.** Eight categories, each with a `README.md` index. |
| One article per feature | **Partial.** Several standards have gained their own article; the tree is still growing, and any standard without one is named in the [category index](README.md). |
| Every article stating behaviour, configuration, failure modes, security and verification | **Implemented** as the house convention — see [../README.md](../README.md) for the five-section floor. |
| Every article ending in suggested reading | **Implemented** as the house convention. |
| Status stated honestly per feature | **Implemented** as the house convention, with a defined status vocabulary in the [category index](README.md). |
| Every shipped feature present on the documentation site | **Not met.** The site presents the project; it does not yet publish per-feature articles, so the "every feature gets its own article, with suggested reading" requirement is unmet on that surface. |
| Root status documents agreeing with each other | **Not met historically**, for the reason described above. |
| Changelog current with the build | **Tracked** — see [changelog-viewer.md](changelog-viewer.md), which also carries the requirement that the changelog is brought current per task rather than per release. |

## Configuration

**This standard has no configuration.** It is a rule about when work is
considered finished.

The one thing worth stating explicitly is the definition it implies: **a task is
not complete when the code works.** It is complete when the code works, the
article that describes it is true, the changelog says what changed, the roadmap
reflects it, and the handoff records the evidence.

## Failure modes

| Failure | Consequence |
| --- | --- |
| Documentation deferred to a later pass | Written from memory, by somebody who lost the context — or not written. |
| A page describing behaviour that changed | Confidently wrong, and the reader cannot tell. Worse than a missing page. |
| Status restated in several documents | Guaranteed to diverge. When it does, all of them lose authority at once. |
| A claim with no stated evidence | The reader must re-verify everything or trust nothing. |
| A number pasted without its commit and date | Stale the day after it is written, and it looks current forever. |
| "Not yet" as a status | True until it silently is not. |
| A feature shipped and absent from the site | Undocumented in practice, however good its code is. |
| A rule stated without its reason | Removed by the next person as ceremony. |
| A fix that edits the code and not the article that described the old behaviour | The article becomes a trap for the next reader. |

## Security considerations

- **Documentation is published.** Everything in this tree is readable by anyone,
  so it must never contain a credential, a token, an internal host name, a
  private network address, or an absolute path from somebody's machine. Describe
  the *kind* of thing.
- **Evidence quoted from a run is output from a machine.** A transcript can carry
  a path, a user name, or a token in an error string. Read what is being pasted
  before pasting it.
- **A stale security claim is the most dangerous stale claim there is.** "This is
  sandboxed", "this binds to loopback only", "this never leaves the machine" —
  each of those must be re-checked in the task that changes the relevant code, or
  removed. A reader relies on those sentences to decide what is safe.
- **Screenshots are documentation too**, and they capture whatever was on screen.

## Verification

**This standard is verified per task, not once.** It is met for a given task when:

- [ ] every document that described behaviour the task changed has been edited in
      that task
- [ ] every feature the task shipped has an article, and the article ends with
      suggested reading
- [ ] `CHANGELOG.md` names what changed, derived from the real commit history
- [ ] `ROADMAP.md` reflects what landed and what did not
- [ ] `HANDOFF.md` records the evidence and what remains
- [ ] the site and landing page present the feature
- [ ] every new claim states how it was checked, and every unchecked claim says so
- [ ] every quoted number or transcript is anchored to a commit and a date
- [ ] no document contradicts another about the same fact — checked by searching
      for the fact, not by reading one document
- [ ] no private path, host name, address or credential appears anywhere in the
      tree

The contradiction check is the one worth doing mechanically. Pick the facts that
matter — what has been built, what has been run, what has been released — and
search the whole tree for each one. Disagreement is easy to find and impossible
to notice while reading a single file.

## Suggested reading

- [../README.md](../README.md) — the house convention every article follows, and the five sections that are its floor
- [README.md](README.md) — the status vocabulary, and which standards still lack an article
- [changelog-viewer.md](changelog-viewer.md) — the changelog this standard keeps current, and the viewer that renders it
- [releases.md](releases.md) — the evidence rules for release claims, where an unverified claim is most costly
- [../porting/verification.md](../porting/verification.md) — the house-style reference, and the only anchored transcript in the repository
