# The packaged app dies before its first window

## Symptom

An installed Windows build shows the splash for a moment and disappears. No error
box, no crash dialog, nothing in the interface at all. Running the installed
executable with its output redirected shows one line:

```
packaged runtime failed Error: daemon exited before reporting status (code=1, signal=none);
  see %APPDATA%\Material Designer\namespaces\release-stable-win\logs\daemon\latest.log for details
```

and that daemon log holds the real cause:

```
ReferenceError: __dirname is not defined in ES module scope
    at ../../node_modules/.pnpm/@ffmpeg-installer+ffmpeg@1.1.0/node_modules/@ffmpeg-installer/ffmpeg/index.js
       (.../prebundled/daemon/chunks/server-<hash>.mjs)
```

Reproduced against the published `0.21.503` installer payload: the daemon exited
`1` on every launch, so every installed build of that release was unusable.

## Cause

Two independent faults stacked, and each on its own is enough to kill a launch.

1. **A CommonJS dependency read `__dirname` in an ESM bundle.** The Windows
   packer prebundles the daemon to ESM with esbuild. Bundled CommonJS modules
   still reference `require`, `__dirname` and `__filename`; the banner supplied
   `require` and nothing else. `@ffmpeg-installer/ffmpeg` reads `__dirname` at
   import time, so the daemon threw before it could report status.
2. **That dependency was imported at module scope, and throws by design.**
   `@ffmpeg-installer/ffmpeg` hunts for its platform binary package on disk and
   throws when it is absent — which, in a packaged build that does not ship the
   binary, it always is. A top-level `import` in the daemon's media module turned
   a missing optional video encoder into a fatal boot failure.

The failure was invisible from the outside because the packaged main process
showed an error box only for `PackagedPathAccessError`; every other fatal startup
failure called `process.exit(1)` with no visible message.

## Fix

- The daemon prebundle banner now declares uniquely named `__odDirname` /
  `__odFilename` shims, and `WIN_DAEMON_PREBUNDLE_ESM_DIRNAME_DEFINES` maps the
  bare identifiers onto them through esbuild `--define`. The names must be unique:
  at least one bundled chunk declares its own top-level `__filename`, and a banner
  using that name is a duplicate-declaration `SyntaxError` — a second instant
  crash wearing different clothes.
- The daemon resolves ffmpeg lazily (`resolveFfmpegPath()`), behind the existing
  `HYPERFRAMES_FFMPEG_PATH` override. A missing encoder now fails MP4 encoding
  and nothing else.
- Every fatal startup failure gets a visible error box naming the failure, not
  just the path-access one.

## How to avoid reintroducing it

- Never `import` a package at module scope when it resolves external state at
  import time and throws on absence. Resolve it where it is used.
- Keep the ESM shims uniquely named. A banner declaring bare `__dirname` /
  `__filename` collides with bundled code that declares its own.
- `tools/pack/tests/prebundle/esm-globals.test.ts`,
  `apps/daemon/tests/media/ffmpeg-lazy.test.ts` and
  `apps/packaged/tests/errors.test.ts` guard the three halves. Each was watched
  failing on a deliberate break before being trusted.

## Verification

The published `0.21.503` payload was extracted, launched on an off-screen desktop
through the cheap Lowlevel headless route, and its daemon log read — that is where
the `__dirname` error above comes from. Neutralising the boot-time ffmpeg import in
that same payload and relaunching produced a live `1296x908` `Material Designer`
window with `Daemon live` in its status bar, which is the evidence that the
boot-time import was the whole blocker.

## Security considerations

None of this weakens a boundary. The lazy resolver reads the same environment
override the encoder already honoured, and the new error box prints the failure
message the log already contained — no paths beyond the ones the failure itself
names, and no credentials.
