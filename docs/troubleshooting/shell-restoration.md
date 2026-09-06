# Restoring a shell after a partial merge

## Symptom

The web shell has a short list of apparently unrelated compile errors: a JSX
symbol has no import, a rail label is missing, a delete click refers to state
that does not exist, and a regex error renderer assumes every error has the
same fields.

## Cause

The feature code survived a partial merge while the small registration seams
around it did not. The renderer still mounted the status surface, converter
route and settings-tab popover, but their imports were absent. The chat delete
button still opened its state transition, but the state and confirmation
surface were gone.

## Fix

Recover the exact seam from the commit that introduced the feature. Search the
history for the unresolved identifier, inspect the former owner, and restore
the import, local state, or callback without replacing the existing feature
with a placeholder. Discriminated regex errors must render their actual
variant fields: syntax messages, unsafe-pattern reasons, and bounded length
values.

## How to avoid reintroducing it

Run focused mounts for the shell consumer and verify that an action reaches its
real confirmation surface before its callback fires. Keep each search field on
its own regex controller and pass the documented `RegexSearchField` props,
rather than adding consumer-specific aliases.

## Verification

The focused documentation test exercises all three regex error variants. The
chat-row test opens the real destructive gate and proves that the delete
callback has not fired first. The package-scoped checker remains the broader
compile proof once the workspace's required generated dependencies are present.

## Security considerations

This repair restores existing local-only routes and the existing destructive
confirmation boundary. It does not add a new host bridge, access path, or
credential store.
