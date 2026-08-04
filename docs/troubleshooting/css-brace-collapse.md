# A stray CSS brace that failed the build at minute 35, blaming the wrong file

## Symptom

Four consecutive *Release* runs on `main` failed in the **Build the Windows
installer** step, each after roughly half an hour, with:

```
CssSyntaxError: tailwindcss: …\design\apps\web\src\styles\home\index.css:1:1: Missing opening {
```

The named file was fine. Its first line was an `@import`, and nothing about it
had changed in any of the four failing pushes.

## Cause

`design/apps/web/src/styles/home/entry-layout.css` closed one more block than
it opened — a single extra `}` on line 676, left behind by the navigation-rail
rewrite. Tailwind's PostCSS pass reads the whole `@import` graph as one
document, so the syntax error surfaced at the *entry file's* position 1:1
rather than at the file actually at fault.

Nothing cheaper than the Windows packaging job could see it:

- **Typecheck does not read CSS.** The workspace typechecked green on every
  one of the four failing commits.
- **The port verifier compares bytes, not syntax.** The file was declared in
  `MODIFICATIONS.md`, so its contents were a permitted difference whatever
  they said.
- **The unit suites do not build the web app.** Only the installer build runs
  the Next production build that invokes PostCSS.

So the fault sat exactly in the blind spot between every fast gate, and each
diagnosis attempt cost a 35-minute round trip.

## Fix

Delete the stray brace — commit `635ec4f`, one deletion. A brace-balance sweep
over every tracked stylesheet confirmed it was the only unbalanced file.

## How to avoid reintroducing it

The *Verify* workflow now balance-checks every tracked `*.css` file in the
fast job (commit `a64f241`): a raw open-minus-close brace count per file, with
a mismatch failing in seconds and naming the actual file. A raw count is
deliberate — all 507 tracked stylesheets balance today, comments included, so
a mismatch is a defect, not noise. If a future stylesheet legitimately embeds
an unbalanced brace in a string, the gate needs a smarter parser at that
point, not an exemption.

## Verification

The failing runs: [30849169747](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/30849169747),
[30849559445](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/30849559445),
[30849689933](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/30849689933),
[30850181639](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/30850181639) —
the last is the one whose log carries the `CssSyntaxError` verbatim. The local
sweep that found the culprit is the same `awk` count the gate now runs.

## Security considerations

None. The failure was a build-time syntax error; nothing shipped, which is the
release gating working as designed — four failed runs published nothing.
