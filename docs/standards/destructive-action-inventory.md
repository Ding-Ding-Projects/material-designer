# Destructive-action inventory

This is the hand-written inventory for destructive-action protection. It is
kept separate from the UI so a missing route cannot disappear from review. The
shared `DestructiveGate` owns the two independent keys, the full-range slider,
emergency exit, focus return, reduced-motion handling, and in-flight re-entry
refusal. `AuthorizedDestructiveGate` composes that user-facing sequence with
the handler-side, single-use confirmation token exchange.

## Reusable contracts

| ID | Contract | Source | Required property |
| --- | --- | --- | --- |
| `gate-state` | Two keys and full travel | `design/apps/web/src/components/destructive/gateMachine.ts` | `canAuthorize` is false until both keys and the full slider are complete |
| `gate-reentry` | In-flight re-entry refusal | `design/apps/web/src/components/destructive/DestructiveGate.tsx` | `runningRef` prevents a second handler call |
| `gate-copy` | Exact affected-data copy | `design/apps/web/src/components/destructive/DestructiveGate.tsx` | `action`, `target`, `items`, and reversibility are rendered from the captured request |
| `gate-cancel-focus` | Emergency exit, Escape, and focus | `design/apps/web/src/components/destructive/DestructiveGate.tsx` | Cancellation reports its outcome and returns focus when the origin remains connected |
| `handler-bridge` | Actual handler authorization | `design/apps/web/src/components/destructive/AuthorizedDestructiveGate.tsx` | `confirmedDelete` mints and spends a token for the exact resource path and payload |
| `handler-token` | Resource-bound single-use token | `design/apps/web/src/lib/confirm-delete.ts` | The token is sent in `x-od-confirm-token`, never in the URL |

## Route inventory

The route-specific C0 patches are intentionally left for the owning component
lanes. Each owner must replace its plain destructive affordance with the
reusable gate and pass the exact daemon resource path, payload, target, and
affected item list. Until those patches land, a route is not described as
verified merely because this shared contract exists.

| ID | Owning surface | Action | Required protection | Current boundary |
| --- | --- | --- | --- | --- |
| `projects.single` | Designs | Delete one project | `AuthorizedDestructiveGate` and the daemon token | C0 handoff required |
| `projects.bulk` | Designs | Delete selected projects | One gate for the captured selection and one token exchange per project | C0 handoff required |
| `projects.recent` | Home recent projects | Delete one project | The same gate and project operation | C0 handoff required |
| `brand.single` | Brand preview | Delete a captured brand and registered design system | Exact brand scope followed by the handler token | C0 handoff required |
| `design-system.single` | Design-system manager | Delete one user-authored design system | Exact title and files followed by the handler token | C0 handoff required |
| `library.card` | Library card | Remove one asset | Exact asset title and storage consequence | C0 handoff required |
| `library.preview` | Library preview | Remove the viewed asset | The same captured asset as the card route | C0 handoff required |
| `library.bulk` | Library selection bar | Remove selected assets | One gate for every selected title with partial result handling | C0 handoff required |
| `memory.entry` | Memory records | Delete one saved entry | Exact record name, type, and description | C0 handoff required |
| `memory.extraction` | Memory extraction history | Delete one extraction record | Exact extraction record | C0 handoff required |
| `memory.clear` | Memory extraction history | Clear all extraction records | Captured count and clear consequence | C0 handoff required |
| `routine.single` | Automations | Delete one scheduled routine | Exact routine name and real delete request | C0 handoff required |
| `conversation.single` | Chat conversation list | Delete one conversation | Exact title and all messages | C0 handoff required |
| `conversation.menu` | Conversation menu | Delete one conversation | The same captured conversation target | C0 handoff required |
| `project-file.single` | Project file manager | Delete one project file | Exact filename and project scope | C0 handoff required |
| `project-file.bulk` | Project file manager | Delete selected project files | One gate for the selected filenames | C0 handoff required |
| `design-system.project` | Design-system project panel | Delete its project and registered system | Exact project scope and handler token | C0 handoff required |

## Verification contract

`scripts/verify-destructive-action-inventory.ps1` checks every exact marker and
copies one listed source file to a temporary tree. It removes the exact
handler-bridge marker, proves the inventory turns red, restores the source, and
proves green again. The negative pass is required because a substring check can
remain green after a comment, rename, or descendant selector changes the route.

The daemon-side token boundary remains separate from the UI. A caller that
never renders the UI must still be refused without a valid token, and the UI
must not claim that a token proves a human moved the slider. The two checks have
different jobs and neither replaces the other.

## Suggested reading

- [super-confirmation.md](super-confirmation.md)
- [browser-extension-downloads.md](browser-extension-downloads.md)
- [version-history.md](version-history.md)
