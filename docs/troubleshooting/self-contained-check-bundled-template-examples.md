# The self-contained check fails on the packaged app, and everything it names is a bundled template's own demo file

## Symptom

*Release* run
[31022548494](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31022548494)
(`main`, commit `aaf93d0`; the same failure is present on parent `ac37ac7`),
job **Build Windows application** → step **Check the packaged application is
self-contained**, `bash scripts/check-self-contained.sh "$target"`:

```
##[error]D:\a\_temp/payload-unpacked loads a remote script
##[error]D:\a\_temp/payload-unpacked loads a remote stylesheet
##[error]D:\a\_temp/payload-unpacked loads a remote image
##[error]D:\a\_temp/payload-unpacked imports a remote stylesheet
##[error]D:\a\_temp/payload-unpacked loads a remote CSS asset
##[error]D:\a\_temp/payload-unpacked makes an external request
##[error]Process completed with exit code 1.
```

435 individual matches precede those six summary lines, e.g.:

```
…/payload-unpacked/payload/resources/open-design/plugins/_official/examples/article-magazine/example.html:7:<script src="https://cdn.tailwindcss.com"></script>
…/payload-unpacked/payload/resources/open-design/skills/video-hyperframes/example.html:7:<link href="https://fonts.googleapis.com/css2?family=Inter+Tight…" rel="stylesheet">
…/payload-unpacked/payload/resources/open-design/design-templates/html-ppt/examples/demo-deck/index.html:11:<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"></script>
```

## What was checked

Every one of the 435 matches (174 distinct files) sits under
`payload/resources/open-design/{design-templates,plugins,skills}/…` — 163 under
`design-templates/`, 201 under `plugins/`, 68 under `skills/`. **None** are
under `payload/resources/app` (the actual Electron application bundle) or
`payload/resources/open-design-web-standalone`. The five distinct remote hosts
referenced are `fonts.googleapis.com` (260), `fonts.gstatic.com` (108),
`cdn.tailwindcss.com` (43), `cdn.jsdelivr.net` (18), and `unpkg.com` (2).

Every flagged file is an `example.html` or `template.html` — a rendered sample
of what a design template or plugin produces, bundled as reference content
inside `design-templates/`, `plugins/` and `skills/` (see `design/AGENTS.md`,
"Top-level content directories": *"design-templates/ (rendering catalogue:
decks, prototypes, image/video/audio templates…)"*). These ship as part of the
packaged app's resources because the daemon serves them as part of the
catalogue — they are not code paths the application's own chrome executes on
startup.

## The cause

`scripts/check-self-contained.sh` was written for one artifact — the published
static site — and later, deliberately, reused for a second: *"the same
question had to be asked of a second artifact: the packaged application, whose
stylesheet used to open with an `@import` of a font CDN and now bundles four
faces of its own"* (script's own header comment). That reuse pointed the check
at the packaged app's **entire** `resources/` payload, which is broader than
"the application's own code" — it also contains the full bundled
`design-templates/`, `plugins/` and `skills/` catalogue, whose example/preview
HTML is written to be illustrative, not to be network-independent. Nothing
suggests these were ever meant to satisfy the same "no runtime network
dependency" contract the application shell itself does — an `example.html`
demonstrating a Tailwind-based template legitimately reaches for
`cdn.tailwindcss.com` the same way a recipe's photo is not expected to be part
of the recipe.

This is not new: the check's own comment records that *"the first run of this
gate failed on exactly that"* (pointing at an unopened `.7z` rather than its
contents) and was fixed by unpacking the real payload — a fix that, as a side
effect, exposed the catalogue content to the same scan for the first time.
Nothing indicates this scope question was deliberately decided at that point
rather than simply not yet encountered.

## Why this was not fixed here

Two directions are both defensible and this session cannot choose between them
without a maintainer decision:

1. **Narrow the check's scope** to `payload/resources/app` (and
   `open-design-web-standalone`), on the premise that the catalogue's example
   content is reference material, not application code, and was never
   supposed to be covered.
2. **Keep the check's current scope** and instead make the *catalogue* fully
   offline — either stripping/inlining the CDN references in all 174 files
   (a `design/` edit at real scale, since `design-templates/`, `plugins/` and
   `skills/` are byte-verbatim upstream content and every touched path needs
   a `MODIFICATIONS.md` entry), or excluding example/preview files from what
   ships in the packaged payload.

Direction 1 is a few-line change to `scripts/check-self-contained.sh` (not
under `design/`, so no port-verifier entry needed) but silently narrows a gate
whose whole point, per its own comment, is refusing to "report a pass for
something it never opened" — loosening it without being sure the narrower
scope was the original intent is exactly the kind of unverified judgment call
`HANDOFF.md` §5.4 warns against ("never write down a success that has not
happened" applies just as much to quietly deciding a check no longer needs to
watch something). Direction 2 is large (174 files, some under `design/`'s
byte-verbatim contract) and changes product behavior — several templates would
stop rendering their live CDN-hosted fonts/frameworks in preview — which is a
product decision, not a CI fix.

## How to resolve it

Get a maintainer decision on scope, then either:

- narrow `check-self-contained.sh`'s target directory list at the call site in
  `.github/workflows/release.yml` (the script itself already accepts multiple
  `<dir>` arguments, so this needs no change to the script), or
- decide which of the 174 example files should be inlined/stripped of CDN
  references, land that under `design/` with the matching `MODIFICATIONS.md`
  entries, and re-run this same step to confirm 0 matches.

Either way, re-run `bash scripts/check-self-contained.sh` against a freshly
unpacked payload before trusting the result — the check's own design (refusing
to pass on a directory it has not actually inspected) means a partial fix
shows up as a shorter list of matches, not a silent pass.

## Verification

Failing run: [31022548494](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31022548494),
job `Build Windows application`
(`92362690355`), step `Check the packaged application is self-contained`. Same
failure present on parent commit `ac37ac7`, so this is pre-existing, not a
regression from this session's changes — none of which touch
`design-templates/`, `plugins/`, `skills/`, or `scripts/check-self-contained.sh`.

## Security considerations

The check exists to prove no runtime network dependency, which is a legitimate
property to want of the *application* — a build that quietly started phoning
home would be exactly what this gate is for. The specific 435 matches found
here are lower-severity by nature (CDN font/script/framework requests from
static preview HTML a user opens deliberately, not silent application
telemetry), but that is an argument for narrowing the check's *scope*
carefully, not for ignoring its result — the resolution above should end with
the check still enforcing the same guarantee for `resources/app`, just not
misapplied to catalogue content it was never designed to judge.
