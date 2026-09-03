# Packaged startup identity

The desktop shell owns the first surface shown by an installed application. It
appears before the daemon and web runtime are available, so it must be complete
inside the desktop main bundle and must not depend on a local server, a loose
asset path, or the network.

## Identity source

`apps/desktop/src/main/runtime.ts` is the only startup-splash producer. Its
`createPendingHtml()` function renders:

- the packaged `apps/web/public/app-icon.png` through a local `file:` URL resolved
  by the desktop main process;
- the shipped display name, **Material Designer**;
- the factual description, **A local-first design workspace**;
- the existing step counter, stage label, and monotonic progress bar.

The source guard keeps a hand-written list of the startup identity sources. It
requires the packaged icon resolver and local file URL, requires the actual
image element and text alternative, and refuses the retired video and inline
upstream SVG sources. The desktop main process resolves the packaged resource
directly, so the splash does not wait for a local server or network route.

## Accessibility and motion

The identity region is a semantic `main` labelled by its visible name and
description. The SVG has a text alternative, while the boot stage keeps its
polite live region. The step counter and visible progress remain available
without animation. When reduced motion is requested, the dot animation stops
and both stage and progress transitions are removed.

## Failure modes

| Failure | Effect | Detection |
| --- | --- | --- |
| A pre-rendered brand video returns | Old name, mark, or copy can reappear without a searchable source string | The source guard refuses `splash-video.ts`, video markup, video data URLs, and the old video constant. |
| The packaged icon reference drifts | Startup displays a missing or different mark from the application | The guard requires the exact packaged icon resolver, local file URL, image source, and alternative text. |
| The visible name drifts | The installed application introduces itself as another product | Required and forbidden identity literals are checked inside the complete `createPendingHtml()` boundary. |
| Stage wiring disappears | A cold start looks frozen | The guard requires the stage callback, progress element, and live region. |
| Motion remains enabled | Reduced-motion users still receive looping dots or transitions | The guard requires the reduced-motion media query and its exact overrides. |

## Evidence

The source defect was observed in the real full Squirrel package produced from
commit `64e427cd36b202e49842700012a9e9bffca51291`:

> [!WARNING]
> The historical splash image from the pre-repair build is stale evidence and
> is intentionally not rendered as a current product capture. A fresh
> post-repair packaged capture must be supplied by the evidence lane before
> this surface can claim a current visual result.

The package SHA-256 is
`a30459a82f24c65851f0c1095ab1b7ad4302c98e067b3f8a718584d8c8ddd962`.
The inspected PNG is 1280 by 900 pixels and was captured on the named headless
desktop at 144 DPI and 150% display scale. The PNG container reports 96 DPI as
image metadata; the desktop tuple remains the authoritative interaction scale.
Its SHA-256 is
`8cb58c01bd31af45ad1e488c45861d1794a93e33f65e0afaeef133a1db2d7f02`.
The adjacent JSON record keeps the exact artifact, capture tuple, privacy
verdict, and observation for historical diagnosis only. It is stale evidence,
not a current bundled image or a replacement for the future final capture.

The historical capture proves the old defect. It does not prove the repair. A
package built from the integration commit must be launched through the same
headless route, captured at the same tuple, and inspected before the startup
identity is described as visually verified.

## Verification

The locally permitted source checks are:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/check-packaged-splash-branding.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-packaged-splash-branding-negative.ps1
```

The negative regression deliberately restores the upstream name, removes the
packaged icon reference, removes reduced-motion handling, removes live progress,
and restores the retired video source. Each break must turn red, followed by a
green restored fixture.

The desktop Vitest suite also checks the exact producer boundary in
`apps/desktop/tests/main/splash-branding.test.ts`. It must run on the hosted
build path; this source-only lane did not run Node, pnpm, the desktop runtime, or
a local application capture.

## Suggested articles

- [Desktop shell](desktop-shell.md)
- [Packaged runtime](packaged-runtime.md)
- [UI drive evidence](../standards/ui-drive-evidence.md)
- [Accessibility](../standards/accessibility.md)
