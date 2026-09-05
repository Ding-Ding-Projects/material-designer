# FileViewer restoration

## Symptom

The FileViewer can fail to compile or mount after a partial merge. Typical
symptoms include missing capability-boundary types, an undefined version-menu
trigger, a version-history filter that references absent state, or a viewport
picker that cannot close after focus enters the preview iframe.

## Cause

A partial merge kept rendered consumers while removing the FileViewer-owned
imports, trigger references, and local query state that supply them.

## Fix

Restore the FileViewer-owned imports and state together. The capability module
is the source of truth for the FileViewer action and destructive-action
receipts. The version-history picker owns separate trigger references for its
header and footer menus, and its search remains backed by its own regex
controller and anchored builder.

The viewport picker also owns its menu state and search controller. It closes
when focus moves into the preview iframe, keeps the menu open for ordinary
window blur, and routes context-menu requests through the supplied capability
owner. Do not replace unavailable capability handlers with implicit success.

## How to avoid reintroducing it

Restore a viewer generation as a coherent unit. Keep menu triggers separate
when their focus-restoration routes differ, and never replace a capability
receipt with an assumed success path.

## Verification

Run the FileViewer-focused tests for version download menus, version opening,
viewport picker iframe dismissal, and menu-search focus. Run the web package
typecheck as an integration signal, then separate FileViewer errors from
unrelated failures in other half-merged surfaces.

## Security considerations

Capability owners remain explicit. Missing, malformed, or throwing handlers
produce unavailable or cancelled receipts and do not authorize an appearance,
lock, or destructive action.
