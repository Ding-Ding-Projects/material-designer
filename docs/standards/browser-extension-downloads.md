# Browser-extension download surfaces

An extension-originated transfer has three separate user-facing states. The
first state is a real Start download decision, before the browser transfer is
created. The second is an active Downloading surface with live values from the
browser download event stream. The third is a non-blocking completion notice.

**Status: detached and unverified.** The source lifecycle and Node VM tests are
present, but no installed extension has yet been driven through a real browser
window. Host always-on-top support, extension installation, and the final
captured surface remain unverified until that built-artifact drive.

The reusable web contracts live under
`design/apps/web/src/components/downloads/`. `downloadContract.ts` keeps the
extension origin attached to each queue item and accepts progress only after
the Start transition. `DownloadStartDialog.tsx` names the filename, source,
destination, and sender origin before calling its `onStart` handler.
`DownloadProgressDialog.tsx` reports received bytes, total bytes when supplied,
measured rate, ETA, pause, resume, cancel, retry, and the recorded
always-on-top outcome. `DownloadCompleteNotice.tsx` is a separate non-blocking
status surface. `DownloadQueueSurface.tsx` selects exactly one of these states
for the active queue item.

## Hand-written surface inventory

| ID | Surface or contract | Evidence | Verification boundary |
| --- | --- | --- | --- |
| `start` | Start download decision | `design/apps/web/src/components/downloads/DownloadStartDialog.tsx` | The user must choose Start or Cancel before the queue owner is called |
| `progress` | Active Downloading surface | `design/apps/web/src/components/downloads/DownloadProgressDialog.tsx` | Values are rendered from the queue record, never a simulated timer |
| `completion` | Download complete notice | `design/apps/web/src/components/downloads/DownloadCompleteNotice.tsx` | Completion is shown only for a terminal queue record and remains non-blocking |
| `origin` | Extension sender identity | `design/apps/web/src/components/downloads/downloadContract.ts` | Web origins are refused and the normalized extension origin stays on the job |
| `queue-binding` | Queue-to-surface binding | `design/apps/web/src/components/downloads/DownloadQueueSurface.tsx` | One active id renders one stage, with no background-only substitute |
| `always-on-top` | Window presentation state | `design/apps/web/src/components/downloads/downloadContract.ts` | `requested`, `active`, `unsupported`, and `unknown` stay distinguishable |
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
their own pending latch and caught error response. `design/clipper/dialog.js`
is the shared extension dialog primitive for Escape, focus trapping, and
listener disposal.

The extension window asks the browser for always-on-top presentation and then
queries the resulting window state. The visible state is `active`,
`unsupported`, or `unknown`; the code never upgrades a request into a claim.
Completion notifications never focus the window on their own. A focus change
only happens after an explicit notification click or Open action.

The committed validator is
`scripts/verify-browser-download-surfaces.ps1`. It checks exact markers and
copies the listed source files into a temporary tree, removes the Start marker,
proves the check turns red, then restores the source and proves green. It does
not claim that a packaged extension has been installed or driven.

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
- [destructive-action-inventory.md](destructive-action-inventory.md)
- [notifications.md](notifications.md)
