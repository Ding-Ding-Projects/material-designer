# A merge that leaves two generations of one feature

## Symptom

The tree does not compile, and every error looks like a different, unrelated
mistake:

```
packages/host/src/protocol.ts(818,3): error TS2300: Duplicate identifier 'converter'.
apps/daemon/src/routes/history.ts(168,63): error TS2339: Property 'acknowledgeMutation'
  does not exist on type 'HistoryService'.
apps/desktop/src/main/runtime.ts(2785,6): error TS1472: 'catch' or 'finally' expected.
apps/desktop/src/main/preload.cts(509,3): error TS18004: No value exists in scope for
  the shorthand property 'converter'.
apps/desktop/src/main/runtime.ts(3670,5): error TS2353: Object literal may only specify
  known properties, and 'safeStorage' does not exist in type '{ directory: string; ... }'
```

Each reads as a local slip. Together they are one cause.

## Cause

A merge integrated a feature at **one end and not the other**, repeatedly. The
observed shapes, all in the same tree:

- **A dropped line in a barrel or import block.** `converter/index.ts` stopped
  re-exporting `./audit.js`; `runtime.ts` lost its whole `./converter/index.js`
  import while every call site stayed. Twenty `Cannot find name` errors, one
  missing block.
- **A duplicated block.** The folder-picker guard (`acquireFolderOperation()` plus
  a `try`) was inserted a second time above the capture-route check in three
  handlers, giving each two `try`s and one `finally`. The parser blamed the line
  after the `finally`, forty lines from the actual duplication — and the extra
  copy also acquired the lock before the early return, so the capture path leaked
  it.
- **A deleted method whose caller and state both survived.**
  `HistoryService.acknowledgeMutation` was gone while `routes/history.ts` still
  called it and the class still declared its two idempotency maps.
- **Two generations of one contract.** The renderer spoke the newer converter
  bridge (`previewId`, `acknowledgeDisclosure`, `queue.export`) while
  `host/protocol.ts` still declared the older one, and `preload.cts` referenced a
  bridge whose definition had been deleted outright.
- **A deliberate removal that its caller never learned about.** The authenticator
  stopped accepting a `safeStorage` adapter when a repair commit removed the
  file-backed vault on principle; `runtime.ts` kept passing one.

## Fix

**Recover the hunk, do not rewrite it.** `git log -S '<missing symbol>' -- <path>`
names the commit that last had it, and `git show <commit>:<path>` gives the exact
text. Every restoration above came back verbatim from the commit that introduced
it, so nothing had to be reinvented and no semantics were guessed.

**Decide which generation is canonical by looking at the consumers.** The
renderer already used the newer converter contract, which is what made
`host/protocol.ts` the stale side rather than the other way round. Reading one
call site settles what reading two type definitions cannot.

**Where the canonical side genuinely does not exist yet, say so in the code.**
The authenticator now takes only its directory and reports its vault
unavailable, because no real credential-vault seam exists and inventing one
would be claiming protection the build does not have.

## How to avoid reintroducing it

- After a merge that touches a feature spanning packages, compile every package
  it touches, not the one that conflicted.
- Duplicate identical `import` lines and duplicate members inside one type are
  cheap to find and worth sweeping for: both are pure merge residue and neither
  survives a compile.
- A `try` with no `catch` reported far from any `try` you can see means a
  duplicated block above it, not a missing keyword where the error points.

## Verification

`scripts/build.ps1 -Silent` exits 0 across all 29 workspace projects. Each
package's own `tsc --noEmit` was run as its repair landed, so no fix rested on
another still being pending.

## Security considerations

One repair reduces a claim rather than making one: the authenticator reports its
vault unavailable instead of presenting file-backed encryption as an
operating-system credential vault. Nothing here weakens a boundary, and no
credential path was invented to make a compile succeed.
