# A package importing built output that has not been built

**Three suites died before running a single assertion**, on a job that had just
been created specifically to run them. Nothing was wrong with the code. The thing
being imported had not been compiled yet.

> [!IMPORTANT]
> **Status: fixed.** Both jobs now build the daemon and the desktop shell before
> running the suites that import them, and both carry a comment saying why —
> because "why is there a build step in a test job" is a question somebody will
> ask.

## Symptom

```
Error: Cannot find module '<workspace>/apps/desktop/dist/main/index.js'
imported from '<workspace>/apps/packaged/tests/...'
    code: 'ERR_MODULE_NOT_FOUND'
```

Three suites, all in the packaged launcher's package, all failing at import time.
Zero tests executed, so the report shows no failures — just files that could not
load, which is easy to skim past when the summary line is dominated by the suites
that did run.

## Cause

The packaged launcher's tests import the desktop shell through its **package
export**, and that export resolves to built output — a compiled entry point under
`dist/`, not the TypeScript source.

The workspace's post-install step builds the shared packages and the tools. It
does **not** build the desktop application. So on a fresh clone the export points
at a file that does not exist yet, and module resolution fails before any test
code runs.

This is a completely ordinary consequence of a monorepo where some packages are
consumed as source and others as build output. The trap is that it works
perfectly on a developer machine, because a developer has built the desktop app at
some point and the output is still sitting there. It only surfaces on a clean
checkout — which is to say, only in continuous integration, which is exactly where
it is most annoying to diagnose.

## Fix

Build the daemon and the desktop shell before running the suites:

```bash
pnpm --filter @open-design/daemon run build
pnpm --filter @open-design/desktop run build
```

Two things make this the right fix rather than a workaround:

1. **The Windows release job already did it**, in its typecheck step, for the same
   reason: the packaged application cannot typecheck against declaration files that
   do not exist. The same dependency exists at test time.
2. **The packaged package's own typecheck script does it for itself.** The
   dependency is already acknowledged by the package; the test job simply was not
   honouring it.

The comment in the workflow explains the reason, because a build step inside a
test job reads like a mistake to anybody who has not hit this.

### Why not fix it by importing source instead

Because the export is the contract. The packaged launcher consumes the desktop
shell the way a shipped build does — through its published entry point — and a
test that imported source would stop testing the thing that ships. The build step
is cheap; the coverage loss would not be.

## How to avoid reintroducing it

- **Know which of your dependencies are consumed as source and which as build
  output.** In this workspace the interface transpiles one shared package from
  source during development, and the desktop shell is consumed as built output.
  Those are different contracts with different prerequisites.
- **Assume a clean checkout.** Any command in a workflow must work on a machine
  that has never built anything. "It works on mine" is, in this specific failure
  mode, a statement about stale build output.
- **`ERR_MODULE_NOT_FOUND` naming a `dist/` path is almost never a missing
  dependency.** It is almost always an unbuilt one. Check whether the path *would*
  exist after a build before touching the manifest.
- **When you add a test job, add the build steps its imports need**, and say why
  in a comment next to them.

## Verification

**Observed:** with the build steps in place, the Linux job ran the full suite for
the packaging tool, the packaged launcher and the desktop shell, and passed.
Before them, the packaging tool's own suite had already passed on that job — 37
files, 259 tests, zero failures, macOS specs included — which is what established
that the platform split was the right call and that this was a separate problem.

```bash
# reproduce the failure deliberately
git clean -xdf design/apps/desktop/dist
pnpm --filter @open-design/packaged run test    # ERR_MODULE_NOT_FOUND

# and the fix
pnpm --filter @open-design/desktop run build
pnpm --filter @open-design/packaged run test
```

## Security considerations

None. This is a build-ordering defect with no trust boundary anywhere near it.
Recorded here because a failure that produces zero test results is easy to
misread as a passing run.

## Suggested reading

- [platform-specific-tests.md](platform-specific-tests.md) — the failure that led to this job being created in the first place
- [test-timeouts.md](test-timeouts.md) — the next thing that went red, on the other platform
- [../architecture/desktop-shell.md](../architecture/desktop-shell.md) — the package whose built output is being imported
- [../build/from-source.md](../build/from-source.md) — the full local build order
