# Design reference application

This developer-only Electron entry renders `mockups/open-design-m3/Open Design M3.dc.html` directly. It does not copy or transcribe the reference. Its command-line tuple must match one exact hand-written row from `.codex/verification/design-parity/routes.json` and `.codex/verification/design-parity/inventory.json`; there is no second hard-coded screen list.

Before loading the reference, the entry pins the Chromium device scale and locale, installs the declared frozen clock and seeded-random controls in the page's main world, freezes CSS motion, redirects React and all three reference typefaces to committed local files, and rejects every other network request. Readiness is emitted only after the measured CSS viewport, device-pixel ratio, font availability, tuple and motion controls match the request. The Studio route uses its real `aria-label="Run"` control rather than looking for text that the icon-only button does not contain.

Launch it through the repository's hosted build environment and the approved hidden-desktop lifecycle. A typical invocation is:

```text
electron tools/design-reference-app/main.mjs --screen home --state default --theme light --width 1440 --height 900 --scale 1 --locale en-US --fixture material-designer-m3-v2 --time 2026-08-02T21:22:17.000Z --motion frozen --random 3003 --fonts bundled-roboto-v1 --network disabled
```

The process only reaches reference states through the reference's own controls. Capture remains the responsibility of the approved hidden-desktop route; this tool never treats its own renderer state as visual evidence. The corresponding installed-application route is still unimplemented and the readiness verifier fails closed on that fact.
