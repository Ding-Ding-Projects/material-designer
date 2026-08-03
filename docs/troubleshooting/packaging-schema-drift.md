# A build-tool property that moved between major versions

**The installer build was rejected before it packed anything.** Not a packaging
failure, not a missing file — a schema validation failure on a configuration
property that reads like plain metadata and is not.

> [!IMPORTANT]
> **Status: fixed.** The property is gone, and the source carries a comment saying
> why, because it is exactly the sort of thing somebody adds back in good faith.

## Symptom

```
⨯ Invalid configuration object. electron-builder has been initialised using a
  configuration object that does not match the API schema.
  - configuration.win has an unknown property 'publisherName'.
```

The build reached the packaging tool and stopped there. Nothing was packed, so
there is no partial installer to inspect and no log beyond the rejection itself.

## Cause

The property was added deliberately, to stop the produced executable's company
name from being blank. It reads like descriptive metadata — a publisher's name —
and in an earlier major version of the packaging tool, at that position in the
configuration, it was.

**The current major version classes it as a signing input and moved it under the
Windows signing-tool options.** Setting it at the top level of the Windows
configuration therefore fails schema validation on sight, before any work begins.

This is the general shape of the failure, and it is worth naming because the
specific property is the least interesting part: **a build tool's configuration
schema is versioned, and a property that was valid at one path can move to
another between major versions.** The error message is accurate and unhelpful in
equal measure — "unknown property" is true, and says nothing about where the
property went.

## Fix

Remove the property.

This build does not sign, so the executable's company name stays empty — the same
as the upstream build this one is derived from. Nothing else changed: one property
removed, so the next run tests the installer rather than the installer plus a new
variable.

**If a publisher name should be carried later, the route is the assembled
package manifest's author field, not that configuration object.** That is
recorded in the source comment as well as here, because the next person to notice
a blank company name will reach for the property that was just removed.

## How to avoid reintroducing it

- **Read the tool's schema for the major version you are on**, not the answer that
  worked two majors ago. Search results and older configurations both age badly,
  and a configuration file gives no indication of which version it was written
  against.
- **When you remove a property, leave a comment saying why.** A silently absent
  property looks like an oversight and gets helpfully restored. A comment naming
  the version and the reason survives.
- **Change one thing per run when a pipeline is being brought up.** Removing this
  property alone meant the next run tested the installer, not the installer plus
  another variable. Bundling a "while I'm here" change into a debugging run is how
  two failures get attributed to one cause.
- **Signing-adjacent metadata is rarely just metadata.** Publisher names,
  certificate subjects and timestamp servers tend to migrate into signing
  configuration blocks as tools formalise their signing story. Treat any of them
  moving as expected rather than surprising.
- **Distinguish schema rejection from build failure.** A schema rejection happens
  before any work; nothing was attempted, so nothing about the packaging itself
  has been tested by that run.

## Verification

**Observed:** with the property removed, the packaging build ran to completion, its
payload validated, and the installer path it reported existed — which is what the
workflow checks explicitly, so a packaging failure that forgot to set a non-zero
exit still fails the job.

```bash
# the same build the release job runs, locally
pnpm tools-pack win build --to nsis
```

A schema rejection is distinguishable from a genuine packaging failure by *when*
it happens: schema validation output appears before any packing progress, and the
uploaded build logs will be empty because nothing ran.

## Security considerations

The removed property is signing-adjacent, and its absence is visible: the produced
executable carries no company name. That is honest — **this build is not signed**,
and an executable claiming a publisher it cannot prove would be worse than one
claiming none. See [../release/release-assets.md](../release/release-assets.md) for
what the unsigned installer means for a user, and how the release notes disclose
it.

Do not restore the property under the signing options as a way of making the
company name appear. That block is for a build that actually signs; populating it
without a certificate configures a signing step that cannot run.

## Suggested reading

- [../release/release-assets.md](../release/release-assets.md) — the unsigned-installer position, and what is deliberately absent from a release
- [../release/release-pipeline.md](../release/release-pipeline.md) — the build step this failed in, and the existence check that guards its output
- [../architecture/packaged-runtime.md](../architecture/packaged-runtime.md) — the identity the installer writes, which *is* configured deliberately
