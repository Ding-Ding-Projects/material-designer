# Browser-extension download surfaces

An extension-originated transfer has three separate user-facing states. The
first state is a real Start download decision, before the browser transfer is
created. The second is an active Downloading surface with live values from the
browser download event stream. The third is a non-blocking completion notice.

**Status: detached and unverified.** No installed extension has yet been driven
through a real browser window. Host always-on-top support, extension
installation, and the final captured surface remain unverified until that
built-artifact drive.

## Hand-written surface inventory

| ID | Surface or contract | Evidence | Verification boundary |
| --- | --- | --- | --- |
| `start` | Start download decision | `design/clipper/download.html`, `design/clipper/download.js` | The user must choose Start or Cancel before the browser transfer is created |
| `progress` | Active Downloading surface | `design/clipper/download.html`, `design/clipper/download.js` | Values are rendered from browser download events, never a simulated timer |
| `completion` | Download complete notice | `design/clipper/download.html`, `design/clipper/background.js` | Completion is shown only for a terminal browser download record and remains non-blocking |
| `origin` | Extension sender identity | `design/clipper/background.js` | The service worker validates the browser-supplied extension id and origin |
| `queue-binding` | Proposal-to-surface binding | `design/clipper/background.js`, `design/clipper/download.js` | One in-memory flow id selects one stage, with no background-only substitute |
| `always-on-top` | Window presentation state | `design/clipper/popup.js`, `design/clipper/background.js` | The requested state is queried and reported as active, unsupported, or unknown |
| `extension-lifecycle` | Installed extension proposal and event flow | `design/clipper/background.js`, `design/clipper/popup.js`, `design/clipper/download.js` | Node tests prove proposal-before-download, trusted sender checks, browser event updates, and legal retry actions; installed-browser evidence remains detached and unverified |

The inventory rows are independent. A source preview, a page-injected mock, a
background-only row, or a test that calls a service worker without rendering a
surface is not proof of this contract. The installed extension handoff and the
host window's actual always-on-top behaviour still need a built-artifact drive;
this repository records those as unverified until that drive exists.

The installed extension path now follows the same contract. `design/clipper/popup.js`
opens `download.html` after the worker returns an in-memory proposal, and the
worker's only `chrome.downloads.download` call is inside explicit
`confirmDownload`. `design/clipper/background.js` accepts the browser-supplied
extension id and URL, generates the expected origin from
`chrome.runtime.getURL`, and refuses a page or spoofed sender. It records
browser `chrome.downloads.onChanged` events, including byte and total changes,
interruption, and completion. Pause, resume, cancel, retry, and Open each have
their own pending latch and caught error response. `design/clipper/download.js`
owns Escape cancellation, focus trapping, and listener disposal for the
extension-owned window.

Retry creates a new attempt and removes the old browser-id mapping before
polling is re-armed. Browser events are accepted only for the current download
id, forward byte deltas, and non-decreasing totals. Duplicate, stale, and
post-terminal events are ignored. The React surfaces use the same legal-action
rules, with latches and visible failures; completion does not autofocus.

The extension window asks the browser for always-on-top presentation and then
queries the resulting window state. The visible state is `active`,
`unsupported`, or `unknown`; the code never upgrades a request into a claim.
Completion notifications never focus the window on their own. A focus change
only happens after an explicit notification click or Open action.

The committed validator is
`scripts/verify-browser-download-surfaces.ps1`. It checks exact markers and
copies the listed source files into a temporary tree, removes, comments, and
renames each marker, proves the check turns red, then restores the source and
proves green. It does not claim that a packaged extension has been installed or
driven.

## Failure modes

- Starting a transfer while the Start decision is still visible skips the only
  place where the filename, source, destination, and sender can be reviewed.
- Rendering progress from elapsed time rather than browser events reports bytes
  and ETA that did not happen.
- Replacing the active surface with a list row hides pause, resume, cancel, and
  interruption state.
- Treating an unsupported always-on-top request as active misleads the user
  about where completion will appear.
- Accepting a normal web origin as the sender loses the extension handoff
  boundary and allows an unrelated page to enqueue work.

## Suggested reading

- [super-confirmation.md](super-confirmation.md)
- [notifications.md](notifications.md)
