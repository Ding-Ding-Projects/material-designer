# Design reference application

This developer-only Electron entry renders `mockups/open-design-m3/Open Design M3.dc.html` directly. It does not copy or transcribe the reference. Its command-line tuple selects one hand-written route from `.codex/verification/design-parity/routes.json`, replaces the reference runtime's React requests with the exact locally installed packages, and rejects every other network request.

Launch it through the repository's hosted build environment and the approved hidden-desktop lifecycle. A typical invocation is:

```text
electron tools/design-reference-app/main.mjs --screen home --state default --theme light --width 1440 --height 900 --scale 1 --locale en-US --fixture material-designer-m3-v1
```

The process only reaches reference states through the reference's own controls. Capture remains the responsibility of the cheap headless route; this tool never treats its own renderer state as visual evidence.
