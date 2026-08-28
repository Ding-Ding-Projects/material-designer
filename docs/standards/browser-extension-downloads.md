# Browser-extension download surfaces

The Figma capture action is a real extension handoff. Capturing a file does
not start a browser transfer. The extension first opens its own Start download
surface, where the user can review the filename, source and destination and
choose Start download or Cancel.

After Start download, the same extension-owned surface becomes an active
Downloading surface. It reads the browser download event stream and reports
received bytes, total bytes, progress, transfer rate, estimated remaining time,
pause, resume, cancel, and interruption. The service worker owns the transfer
and the surface only sends allowlisted lifecycle messages to it.

Completion is separate state and is also reported through a non-blocking
browser notification. The extension window is created above the originating
surface when the browser permits the `alwaysOnTop` hint, and notification
activation restores focus to that window. A browser profile that refuses that
hint still has the extension-owned completion surface and the notification.

## Hand-written surface inventory

| ID | Surface | Real trigger | Required evidence |
| --- | --- | --- | --- |
| `start` | Start download | Figma capture from the installed extension opens `download.html` before `chrome.downloads.download` | `design/clipper/popup.js`, `design/clipper/download.html` |
| `progress` | Downloading | Start activates `confirmDownload`, which alone calls `chrome.downloads.download` | `design/clipper/background.js`, `design/clipper/download.js` |
| `completion` | Download complete | `chrome.downloads.onChanged` receives `complete`, updates the window and raises a non-blocking notification | `design/clipper/background.js`, `design/clipper/download.html` |

The three rows are independent. A source preview, a page-injected mock, a
background-only row, or a test that calls the service worker directly is not a
surface proof. The deterministic capture scene is the installed extension's
Figma action on a controlled page, with one extension-owned `download.html`
window, fixed 520 by 430 dimensions, a fixed capture title, and a receipt that
records the state, filename, source, destination, byte counts, and privacy
result without storing captured payload bytes.

`scripts/verify-browser-download-surfaces.ps1` checks the exact lifecycle
markers and proves its negative regression by removing the Start trigger from a
temporary copy, observing red, then restoring the source and observing green.
It does not claim that a built extension has been installed or driven. That
requires the approved hidden-desktop route and a real capture receipt.
