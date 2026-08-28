# Destructive-action inventory

This is the hand-written inventory for destructive actions in the imported web
application and browser extension. It is intentionally separate from the
implementation so a missing route cannot disappear from review. Each row names
the owning surface, the action, the protection expected before the operation,
and the current evidence boundary.

## Web application routes

| ID | Surface | Action | Required protection | Source evidence |
| --- | --- | --- | --- | --- |
| `projects.single` | Designs | Delete one project | `DestructiveGate`, then the daemon's single-use resource token | `apps/web/src/components/DesignsTab.tsx`, `apps/web/src/App.tsx` |
| `projects.bulk` | Designs | Delete selected projects | One gate for the captured selection, then one token exchange per project | `apps/web/src/components/DesignsTab.tsx` |
| `projects.recent` | Home recent projects | Delete one project | `DestructiveGate`, then the same project operation | `apps/web/src/components/RecentProjectsStrip.tsx` |
| `brand.single` | Brand preview | Delete a captured brand and registered design system | `DestructiveGate`, exact brand scope, then the daemon operation | `apps/web/src/components/BrandPreviewCard.tsx` |
| `design-system.single` | Design-system manager | Delete one user-authored design system | `DestructiveGate`, exact title and files, then the daemon operation | `apps/web/src/components/DesignSystemsTab.tsx` |
| `library.card` | Library card | Remove one asset | `DestructiveGate`, exact asset title and storage consequence | `apps/web/src/components/LibrarySection.tsx` |
| `library.preview` | Library preview | Remove the viewed asset | The same gate and captured asset as the card route | `apps/web/src/components/LibrarySection.tsx` |
| `library.bulk` | Library selection bar | Remove selected assets | One gate for every selected title, with partial result handling | `apps/web/src/components/LibrarySection.tsx` |
| `memory.entry` | Memory records | Delete one saved memory entry | `DestructiveGate`, exact record name, type and description | `apps/web/src/components/MemorySection.tsx` |
| `memory.extraction` | Memory extraction history | Delete one extraction record | `DestructiveGate`, exact extraction record | `apps/web/src/components/MemorySection.tsx` |
| `memory.clear` | Memory extraction history | Clear all extraction records | `DestructiveGate`, captured count and clear consequence | `apps/web/src/components/MemorySection.tsx` |
| `routine.single` | Automations | Delete one scheduled routine | `DestructiveGate`, exact routine name, then the real DELETE request | `apps/web/src/components/RoutinesSection.tsx` |
| `conversation.single` | Chat conversation list | Delete one conversation | `DestructiveGate`, exact title and all messages | `apps/web/src/components/ChatPane.tsx`, `apps/web/src/components/ConversationsMenu.tsx` |
| `routine.tasks-view` | Alternate automations list | Delete one scheduled routine | `DestructiveGate`, exact routine name, then the real DELETE request | `apps/web/src/components/TasksView.tsx` |
| `project-file.single` | Project file manager | Delete one project file | `DestructiveGate`, exact filename and captured project scope | `apps/web/src/components/FileWorkspace.tsx` |
| `project-file.bulk` | Project file manager | Delete selected project files | One gate for the selected filenames, then the real per-file requests | `apps/web/src/components/FileWorkspace.tsx` |
| `design-system.project` | Design-system project panel | Delete its project and registered system | `DestructiveGate`, exact project scope, then the real project operation | `apps/web/src/components/FileWorkspace.tsx` |

The daemon has a second, caller-independent boundary for the irreversible
resource families. It mints a short-lived token for the exact resource and
refuses the destructive request without the token. The interface gate and the
daemon token have different jobs, so neither is treated as a substitute for
the other.

## Deliberately reversible routes

Project files, templates, and other records covered by local version history
remain undo-oriented operations. Their implementation must keep the local
history record and the visible undo or restore route truthful. This is not a
permission to add a one-button destructive path, and it is not evidence that
the irreversible inventory above is complete without its own gate.

## Verification contract

`scripts/verify-destructive-action-inventory.ps1` reads the committed inventory
and checks every exact source boundary. It also copies one source file to a
temporary location, removes its `DestructiveGate` import, and proves that the
inventory turns red before restoring the source and proving green again. The
negative pass is required because a substring check can remain green after a
comment, rename, or descendant selector changes the route.

The browser-extension download flow has a separate three-row inventory because
Start, active progress, and completion are independent surfaces. Its source is
the extension-owned `design/clipper/download.html` surface and its service
worker lifecycle, not a renderer mock or a background-only row.
