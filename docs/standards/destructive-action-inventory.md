# Destructive-action inventory

This is the hand-written inventory for destructive-action protection. It is
kept separate from the UI so a missing route cannot disappear from review. The
shared `DestructiveGate` owns the two independent keys, the full-range slider,
emergency exit, focus return, reduced-motion handling, and in-flight re-entry
refusal. `AuthorizedDestructiveGate` composes that user-facing sequence with
the handler-side, single-use confirmation token exchange.

**Status: detached and unverified.** The reusable contract, handler bridge, and
source-level negative regressions are present. Route-owned C0 wiring, installed
application operation, and built-artifact interaction evidence remain open.

The wrapper first obtains a handler-generated summary and keeps it immutable for
the open interaction. Its request identity is a SHA-256 digest of the exact
resource path plus a recursively key-sorted payload. A changed resource path or
payload causes the old summary to be discarded and remounts the gate with both
keys and the slider reset. Before the final request, the wrapper checks that the
preflight has not expired, that the request identity still matches, and that the
fresh handler summary still matches the displayed target, item list, and
reversibility. A mismatch refuses the request and exposes a retry path.

## Reusable contracts

| ID | Contract | Source | Required property |
| --- | --- | --- | --- |
| `gate-state` | Two keys and full travel | `design/apps/web/src/components/destructive/gateMachine.ts` | `canAuthorize` is false until both keys and the full slider are complete |
| `gate-reentry` | In-flight re-entry refusal | `design/apps/web/src/components/destructive/DestructiveGate.tsx` | `runningRef` prevents a second handler call |
| `gate-copy` | Exact affected-data copy | `design/apps/web/src/components/destructive/DestructiveGate.tsx` | `action`, `target`, `items`, and reversibility are rendered from the captured request |
| `gate-cancel-focus` | Emergency exit, Escape, and focus | `design/apps/web/src/components/destructive/DestructiveGate.tsx` | Cancellation reports its outcome and returns focus when the origin remains connected |
| `handler-bridge` | Actual handler authorization | `design/apps/web/src/components/destructive/AuthorizedDestructiveGate.tsx` | `confirmedDelete` mints and spends a token for the exact resource path and payload |
| `handler-token` | Resource-bound single-use token | `design/apps/web/src/lib/confirm-delete.ts` | The token is sent in `x-od-confirm-token`, never in the URL |
| `request-identity` | Canonical path and payload digest | `design/apps/web/src/components/destructive/AuthorizedDestructiveGate.tsx` | Replacing either input resets the preflight and the two-key sequence |
| `summary-match` | Fresh summary comparison | `design/apps/web/src/lib/confirm-delete.ts` | The final request is refused when the handler summary differs from what was displayed |
| `success-separation` | DELETE result versus receipt callback | `design/apps/web/src/lib/confirm-delete.ts` | A successful DELETE stays successful even when optional result handling throws |

## Route inventory

The route-specific C0 patches are intentionally left for the owning component
lanes. Each irreversible owner must replace its plain destructive affordance
with the reusable gate and pass the exact daemon resource path, payload, target,
and affected item list. Restorable owners must keep their history and undo path
instead of adding the irreversible gate. Until those patches land, a route is
not described as verified merely because this shared contract exists.

| ID | Owning surface | Action | Required protection | Current boundary |
| --- | --- | --- | --- | --- |
| `projects.single` | Designs | Delete one project | `AuthorizedDestructiveGate` and the daemon token | C0 handoff required |
| `projects.bulk` | Designs | Delete selected projects | One gate for the captured selection and one token exchange per project | C0 handoff required |
| `projects.recent` | Home recent projects | Delete one project | The same gate and project operation | C0 handoff required |
| `brand.single` | Brand preview | Delete a captured brand and registered design system | Exact brand scope followed by the handler token | C0 handoff required |
| `design-system.single` | Design-system manager | Delete one user-authored design system | Exact title and files followed by the handler token | C0 handoff required |
| `design-system.marketplace` | Design-system manager | Uninstall one marketplace design system | Reinstallable source operation, no irreversible token | C0 handoff required |
| `library.card` | Library card | Remove one asset | Exact asset title and storage consequence | C0 handoff required |
| `library.preview` | Library preview | Remove the viewed asset | The same captured asset as the card route | C0 handoff required |
| `library.bulk` | Library selection bar | Remove selected assets | One gate for every selected title with partial result handling | C0 handoff required |
| `memory.entry` | Memory records | Delete one saved entry | Local history and undo, no irreversible gate | C0 handoff required |
| `memory.extraction` | Memory extraction history | Delete one extraction record | Local history and undo, no irreversible gate | C0 handoff required |
| `memory.clear` | Memory extraction history | Clear all extraction records | Captured count plus local history and undo | C0 handoff required |
| `routine.single` | Automations | Delete one scheduled routine | Local history and undo, no irreversible gate | C0 handoff required |
| `conversation.single` | Chat conversation list | Delete one conversation | Local history and undo, no irreversible gate | C0 handoff required |
| `conversation.menu` | Conversation menu | Delete one conversation | Same history-backed operation as the list route | C0 handoff required |
| `project-file.single` | Project file manager | Delete one project file | Version tombstone and restore, no irreversible gate | C0 handoff required |
| `project-file.bulk` | Project file manager | Delete selected project files | Per-file history and partial undo results | C0 handoff required |
| `design-system.project` | Design-system project panel | Delete its project and registered system | Exact project scope and handler token | C0 handoff required |

## Route outcome classification

This second table is the reverse index for the route inventory. The route list
above says where a control lives; this table says what the handler must do when
the caller reaches it. Keeping both directions hand-written prevents a route
from disappearing simply because its implementation file was renamed.

| ID | Class | Expected failure or outcome |
| --- | --- | --- |
| `projects.single` | Irreversible | Missing, expired, reused, or mismatched handler token returns `428 CONFIRMATION_REQUIRED`; the UI must use `AuthorizedDestructiveGate` first |
| `projects.bulk` | Irreversible | The captured set must be displayed, then each project request needs its own handler token; a partial result stays partial |
| `projects.recent` | Irreversible | The captured project remains the request identity; no DELETE is sent without the handler token |
| `brand.single` | Irreversible | The brand and registered design system are one captured scope; a missing or mismatched token returns `428 CONFIRMATION_REQUIRED` |
| `design-system.single` | Irreversible | A user-authored design system needs exact summary matching and a resource-bound token |
| `library.card` | Irreversible | The asset title and storage consequence stay in the displayed summary; handler refusal remains visible |
| `library.preview` | Irreversible | Preview deletion uses the same captured asset identity as the card route |
| `library.bulk` | Irreversible | Every selected asset remains named and receives its own token exchange; failed items are not reported as deleted |
| `design-system.project` | Irreversible | Project and registered system deletion needs the exact project scope and handler token |
| `memory.entry` | Restorable | Local history records the delete and an undo or restore route remains available; no super confirmation is needed |
| `memory.extraction` | Restorable | Local history records the delete and an undo or restore route remains available |
| `memory.clear` | Restorable | The captured count is recorded and the clear action remains undo-oriented |
| `routine.single` | Restorable | The routine delete records local history and keeps the restore route |
| `conversation.single` | Restorable | The conversation delete records local history and keeps the restore route |
| `conversation.menu` | Restorable | The menu path reaches the same history-backed conversation operation |
| `project-file.single` | Restorable | A single file delete records a tombstone and remains restorable |
| `project-file.bulk` | Restorable | Bulk file deletion records each item and reports partial results without an irreversible token |
| `design-system.marketplace` | Restorable | Marketplace uninstall can be reinstalled from its source and must not consume the irreversible token boundary |

## Expected operation outcomes

The route inventory is deliberately bidirectional. Irreversible routes must
reach `AuthorizedDestructiveGate` and the handler token boundary. Restorable
routes must retain their local history and undo path rather than gaining a
destructive shortcut. The expected outcome is recorded here so a route cannot
silently change class.

| Route class | Expected refusal or outcome | Reason |
| --- | --- | --- |
| Irreversible delete without a token | HTTP `428 CONFIRMATION_REQUIRED` | The handler must refuse callers that did not complete the resource-bound token exchange |
| Irreversible delete with a missing, expired, reused, or mismatched token | HTTP `428 CONFIRMATION_REQUIRED` | A token authorizes one captured resource and one execution only |
| Destructive preflight with a changed path or payload | No DELETE request | The immutable request identity no longer matches the displayed summary |
| Destructive preflight with changed target, item list, or reversibility | No DELETE request | The handler's fresh summary no longer matches what the user read |
| Destructive preflight after expiry | No DELETE request and a retry route | An expired summary cannot authorize a later operation |
| Restorable record delete | Local history revision plus undo or restore | The record remains recoverable, so a super confirmation is not the correct boundary |
| Optional success receipt callback throws after HTTP success | DELETE remains successful | Result handling must not convert a completed operation into a duplicate retry |

## Verification contract

`scripts/verify-destructive-action-inventory.ps1` checks the hand-written id set,
strips JavaScript and TypeScript comments with a stateful lexer, and checks each
exact marker in its owning source. It copies one listed source file to a
temporary tree, removes the exact handler-bridge marker, proves the inventory
turns red, restores the source, and proves green again. The same source copy is
the boundary for comment, rename, and no-op negative probes, so a marker inside a
comment or inside a renamed symbol cannot satisfy the inventory.

The daemon-side token boundary remains separate from the UI. A caller that
never renders the UI must still be refused without a valid token, and the UI
must not claim that a token proves a human moved the slider. The two checks have
different jobs and neither replaces the other.

## Suggested reading

- [super-confirmation.md](super-confirmation.md)
- [browser-extension-downloads.md](browser-extension-downloads.md)
- [version-history.md](version-history.md)
