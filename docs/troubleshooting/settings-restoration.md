# Restoring partial Settings tab integrations

## Symptom

The Settings dialog failed before rendering a tab, typically with an undefined
workspace-state access. In the same source state, the tab context menu could
appear twice, the authentication popover had a duplicated prop, and a searchable
select menu referenced a keyboard handler that no longer existed.

## Cause

The affected files contained two generations of the same feature. A later
integration retained consumers for persisted tab state, the context-menu regex
controller, and select keyboard navigation, while dropping their initializers or
handlers. It also duplicated one portal and one JSX prop while copying a menu
block.

## Fix

Restore the state from the last complete component contract instead of adding a
fallback around every consumer. `SettingsTabStrip` initializes and persists its
own workspace state, gives its context menu a separate regex controller, and
renders one portal. `CustomSelect` restores its arrow, Home, End, Enter, Escape,
and Tab keyboard handling through the same menu actions as pointer input.

## How to avoid reintroducing it

Keep each search field's `useRegexSearch` call adjacent to its local state and
preserve the paired handler for every JSX callback. When resolving a merge,
compare the component's state declarations, callback definitions, and rendered
consumers as one unit. A copied portal must have one owner and one test id.

## Verification

Run the focused Settings tab toy-lock test. Its added regression opens the context
menu through the keyboard, filters it with its local search field, verifies that
the unrelated appearance action is absent, and proves that authentication reaches
the exact locked tab's configuration callback. This check requires the shared
regex field and authentication popover to be healthy. The focused CustomSelect
test also proves keyboard navigation selects the active filtered option through
the real handler.

## Security considerations

Filtering a context menu never bypasses a toy lock. The protected callback runs
only after the existing authentication route succeeds, and the restored menu
state remains local to the mounted Settings surface.
