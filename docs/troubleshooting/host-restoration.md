# Host contract restoration

## Symptom

## Universal settings bridge, 2026-09-06

The optional `universalSettings` host namespace now connects typed reads,
revision-checked writes, subscriptions, schedule resolution, and protected
credential set/clear operations to the existing main-process handlers. Older
hosts may omit the namespace; a present malformed namespace is rejected by
structural detection. Renderer recovery and migration are separate work.

Schedule IPC delegates to the existing store resolver, preserving its bounded
DNS lookup, vetted address pinning, HTTPS validation, response limit, timeout,
and unavailable states. The IPv6 link-local filter now covers `fe80::/10`.
Unsubscribing during asynchronous watcher setup no longer leaves a watcher alive.

Commit `3eed6966fe23220f3d64e9c2f36e1965119480a3` passed 23 host-contract tests,
15 desktop store/preload tests, host and desktop typechecks, independent
correctness/security review, and zero-gap imported-source verification.
This evidence covers the source and bridge seam. Complete installed interaction,
credential-vault integration, and the viewport/language/theme matrix remain open.

### Earlier converter symptom

The desktop host bridge can look complete in TypeScript while runtime feature
detection rejects it. The converter is especially exposed because its protocol
evolved from direct source and destination arguments to host-owned preview
identifiers.

## Cause

The host type declaration and the desktop preload had advanced to the preview
contract, with `acknowledgeDisclosure` and `queue.export`. The structural
validator still required the retired `queue.list` method. The mismatch did not
belong in a compatibility shim: the method is intentionally absent because a
whole queue read is not a bounded renderer operation.

## Repair

Keep the protocol declaration, public barrel, structural validator, preload,
and runtime IPC registrations in one generation. The current bridge requires
the disclosure acknowledgement and queue export methods, rejects the retired
queue-list-only generation, and leaves the authenticator vault honestly
unavailable until a real operating-system credential-vault seam is supplied.
`OpenDesignHostConverter` is the current supported alias. The retired direct
path shape remains available only as `OpenDesignHostLegacyV0Converter`, so a
migration reader cannot accidentally type a current preload against the old
queue-list surface.

## Verification

The focused host tests compile the public types and verify both bridge
generations. The desktop preload seam test executes the real preload module
under a recording Electron boundary and checks exact channels and arguments.
A full desktop typecheck also needs the workspace's generated host declaration
output, so build the host package before checking the desktop package in an
otherwise fresh checkout.
