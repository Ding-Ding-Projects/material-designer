# The packaged smoke test

The step that decides whether a build is a release or a pile of bytes. It takes
the installer the run just produced, **installs it**, **launches the installed
application**, makes the **running process answer its own health endpoint**,
**photographs it in a named set of states** — four display scales, a bilingual
UI, the narrowest supported window, the settings dialog, the command palette —
then **uninstalls it and asserts nothing was left behind**.

Everything else in the pipeline checks that source is well-formed. This is the
only step that checks the product works.

> [!IMPORTANT]
> **Status: run, and passing — except for the newest part of it.** The `core`
> profile has installed, launched, health-checked, screenshotted and uninstalled
> a real built Windows application inside the `Release` workflow, with zero
> residue on every check. The **named UI-state set** described below is new and
> **has never run**; read
> [Verification](#verification) for what the first run should be inspected for.
> The Squirrel-aware `core` lifecycle and the published feed still need a new
> Release run as evidence. The `full` profile additionally exercises the
> auto-updater, reinstall over a running instance, and upgrade data persistence;
> it requires a separately-built update fixture and is not silently claimed by
> the release workflow.

## Behaviour

### What runs it

A runner script drives one specification file under a test framework, and wraps it
in a report directory. Before the suite starts, the runner writes a manifest
recording the platform, the namespace, the release channel and version, the
commit, the run id and attempt, and the path of the screenshot it expects — so the
report is self-describing even when the suite fails. It copies the packaging
build's machine-readable output in as evidence, saves the full test log, and
writes a result record with the exit code, duration and status.

The whole test has a **12-minute budget**, and the install alone has its own
budget of **120 seconds** by default, asserted from the installer's own timing
record rather than measured from outside.

### What it asserts, in order

**1 — Pre-clean.** Uninstall anything left over, including product user data, and
reset the updater namespace roots. A smoke test that inherits state from a prior
run is testing the prior run.

**2 — Install.** Through the packaging tool, then assert:

- the reported namespace is the expected one;
- the installer path is inside the build output directory for that namespace;
- the legacy NSIS install directory is inside the runtime namespace root, or the
  Squirrel app directory is inside its per-user `%LOCALAPPDATA%` package root;
- the Windows removal handle is beside the Squirrel app directory at the package
  root: Squirrel exposes `Update.exe`, while the explicit legacy NSIS target
  exposes `Uninstall <product display name>.exe` inside its install directory;
- a desktop shortcut and a Start-menu shortcut both exist, both named after the
  product display name;
- for the legacy NSIS target, at least one registry entry was written, and the
  entries contain **both** the display name and the namespaced key; Squirrel
  lifecycle uses its per-user install root and does not require those NSIS
  registry assertions;
- the installed payload is non-empty by file count, byte count and number of
  top-level entries;
- the install's own timing record says `success` and came in under the budget —
  and on failure the error reports the file count, byte total and top-level
  payload, so a slow install can be told apart from a bloated one.

Those identity assertions are the point of the rebrand. An unmodified build
installed beside the upstream one was the same application as far as Windows is
concerned; these are the checks that would catch that regression before a user
does.

**3 — Seed onboarding as complete**, so the launch lands on the application rather
than a first-run flow.

**4 — Start.** Through the packaging tool, then assert the namespace, that the
source is an **installed** build (not a development one), that the executable is
inside the install directory, that the log path is under the namespace's desktop
log directory, and that the process id is real.

**5 — Wait for a healthy desktop, and prove it from inside.** The status channel
must report `running`, and the URL must have the right shape for whether desktop
inter-process control is available — the custom application scheme when it is, the
daemon's own loopback URL when it is not.

Then the assertion that matters most: an expression is evaluated **in the running
renderer** that performs `fetch('/api/health')` with a four-second abort, and the
result must be status `200`, `ok: true`, and a version **equal to the release
version the run was building**.

That last equality is doing more work than it looks. It proves the artifact that
installed is the artifact that was built for this version — not a cached one, not
a leftover, not a different channel.

**6 — Prove the terminal capability works.** A probe creates a project, seeds it,
opens a pseudo-terminal, writes to its standard input, and checks the output
contains its own marker and the process exited zero, then cleans both up. This is
the one product capability the smoke test exercises end to end, and it is chosen
because it is the one most likely to be broken by packaging: it depends on a
native binding surviving the bundle.

**7 — Assert the launcher pointers**, active and last-successful, at the expected
version.

**8 — Confirm the application shell mounted**, then capture a screenshot, assert
the file is non-zero, and save it into the report.

**9 — Capture the named UI-state set.** See
[the section below](#the-named-ui-state-set); it runs strictly after step 8 so
nothing it does can disturb the frame that step took.

**10 — Uninstall**, removing product user data, and assert **seven** residue
conditions, all of which must be clean:

| Residue check | Must be |
| --- | --- |
| Managed process ids still alive | none |
| The product namespace root and Squirrel install root on disk | absent |
| Registry residues | none |
| The installed executable | absent |
| The removal helper (`Update.exe` for Squirrel) | absent |
| The Start-menu shortcut | absent |
| The user desktop shortcut | absent |

The namespace-root check is where the data-directory contract gets tested for
real. Uninstall can only remove what it knows about, so a file written outside the
resolved data root survives an uninstall that reports success — see
[../architecture/data-directory.md](../architecture/data-directory.md).

**11 — Save the report**: the health result, the install detail, the timings, the
terminal probe, the start record, the uninstall record, the screenshots, and the
UI-state index.

**12 — Clean up regardless.** A `finally` block restores the environment, prints
the packaged application's own logs when the test failed, and stops and uninstalls
anything still running. A smoke test that leaves an application installed on a
runner is a smoke test that poisons the next run.

### The named UI-state set

For most of this repository's life the screenshot in step 8 was the *entire*
visual evidence base for a Material Design 3 redesign: the home screen, at the
default window size, in English, at 100% UI scale. One frame. The standards this
product holds itself to name four display scales, a narrow width, and a
bilingual mode — and none of them had ever been photographed, nor had any
surface other than home.

Step 9 captures a named set of further states from the **same running
application**, each one driven into place through the app's own persisted
settings and its own keyboard shortcuts:

| Frame | The state | How it is driven |
| --- | --- | --- |
| `settings-dialog.png` | The settings dialog, open | <kbd>Ctrl</kbd>+<kbd>,</kbd> dispatched at the window — the shortcut the app itself binds |
| `command-palette.png` | The command palette, open | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd>, likewise |
| `home-scale-100.png` … `home-scale-200.png` | Home at 100%, 125%, 150% and 200% UI scale | The app's own persisted appearance preference, then a reload, so the frame proves the product applies a saved scale on a cold render |
| `home-bilingual.png` | Home in bilingual mode (English · 廣東話) | The app's own persisted locale and language mode, then a reload |
| `home-bilingual-narrow-900.png` | Bilingual home at the narrowest supported window | A renderer-driven resize to the desktop shell's own `minWidth` floor |
| `home-narrow-900.png` | The same narrow window in English | Language mode returned to single, then a reload |

Three properties make this evidence rather than decoration.

**Each frame is the real application.** Nothing is synthesised, no placeholder
is ever written, and no frame is republished under a second name. A state that
cannot be reached produces **no file** — and a named reason, in the run log, in
the report's `ui-states.json`, and as a warning annotation on the run page. A
capture path that quietly skips is worse than one that does not exist, because
the report then looks complete.

**Each frame is verified before it is taken.** Not "the preference was written"
but the observable consequence: the scale the document actually carries, the Han
characters bilingual mode actually renders, the viewport width the window
actually has. An unverified capture is a capture that can lie.

**Each frame records its own hash.** `capturePage` returns the last *composited*
frame, so a compositor that has stopped producing frames would hand back the
previous state's pixels under the new state's name — a failure mode no assertion
about the DOM can see. Every capture therefore carries a `sha256`, and a frame
whose bytes match an earlier, differently-named frame is reported as a duplicate
rather than silently trusted.

The set adds roughly a minute and a half to a twelve-minute budget. Failing to
capture one state does not fail the build; capturing **none** does, because that
means the mechanism itself is broken rather than one surface being awkward.

Two states were deliberately left out. **Changing the operating system's display
scale** is not driven, because the appearance preference reaches the same layout
consequence without a machine-wide setting the runner would have to be trusted
to restore. **A window narrower than 900px** is not attempted, because the
desktop shell declares `minWidth: 900` and refuses to go below it — that floor
*is* the narrow case.

### The two profiles

| Profile | What it adds | Used here |
| --- | --- | --- |
| `core` | The sequence above | **Yes** |
| `full` | Updater acceptance (payload or installer fallback), updater recovery, silent-update-on-cold-start, reinstall while running, upgrade data persistence, log assertions, an explicit stop with no remaining process ids | No |

The `full` profile is not skipped out of convenience. It exercises the
auto-updater, but it requires a separately-built update fixture. The release
workflow uses `core` for the real Squirrel install/start/uninstall proof and
keeps the updater feed and restart action in focused tests until a full fixture
is wired into the Windows lane.

## What it proves, and what it does not

Being precise about this matters, because "smoke test passed" is the single most
quoted line in a release.

**It proves:**

- the installer runs to completion within a time budget on a clean machine;
- the installed identity is this product's, distinct and complete, in the
  filesystem and shortcuts; the legacy NSIS path additionally proves the
  registry identity, while Squirrel proves its per-user package root;
- the installed application launches from the installed executable;
- the daemon, the web runtime and the desktop shell start together and reach each
  other;
- the running process serves its own API, at the version it claims;
- a native-binding-dependent capability survives packaging;
- uninstall removes everything it created.

**It does not prove:**

- that the interface is *correct*. No rendered pixel is asserted. The state set
  proves each state was **reached and photographed**, and that its frames are
  distinct from one another; it does not judge what is in them. A window that
  renders the wrong thing consistently at every scale still passes.
- that any standard is met — not Material Design 3 conformance, not the language
  modes, not accessibility, not the regex builder. The state set gives a human a
  frame to look at for four scales, two languages and two widths; looking is
  still a person's job.
- anything about macOS or Linux.
- anything about upgrading from a previous version, or about the updater.
- anything about a user's real data, since it runs against a clean namespace and
  removes it afterwards.

A green smoke test means *the artifact is a working application*. It does not mean
the application is finished.

## Configuration

| Variable | Default | Effect |
| --- | --- | --- |
| `OD_PACKAGED_E2E_WIN_SMOKE_PROFILE` | `core` | `core` or `full`. |
| `OD_PACKAGED_E2E_BUILD_JSON_PATH` | — | The packaging build's machine-readable output. Required; it is how the test finds the installer. |
| `OD_PACKAGED_E2E_NAMESPACE` | per platform | The namespace to install into. |
| `OD_PACKAGED_E2E_RELEASE_CHANNEL` | — | Recorded in the report and used to derive the expected identity. |
| `OD_PACKAGED_E2E_RELEASE_VERSION` | — | The version the health endpoint must report. Omit it and the assertion weakens to "some string". |
| `OD_PACKAGED_E2E_REPORT_DIR` | `.tmp/release-report/<platform>` | Where the report is written. |
| `OD_PACKAGED_E2E_TOOLS_PACK_DIR` | `.tmp/tools-pack` | The packaging tool's working directory. |
| `OD_PACKAGED_E2E_WIN_MAX_INSTALL_MS` | `120000` | Install time budget. |
| `OD_PACKAGED_E2E_WIN_VERIFY_REINSTALL` | on in `full` | Reinstall-while-running acceptance. |
| `OD_PACKAGED_E2E_WIN_VERIFY_UPGRADE_PERSISTENCE` | off | Seed a project before an update and prove it survives. |
| `OD_PACKAGED_E2E_WIN_UPDATE_*` | unset | The updater fixture: metadata URL, target version, build output paths, fixture mode and port. `full` only. |

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| The step is silently skipped on a push | A condition relying on an input default — an absent input compares equal to false | Test the event name explicitly. The workflow does; do not simplify it. |
| Install exceeds its budget | A genuinely slow runner, or a payload that grew | The error prints file count, byte total and top-level entries so the two can be told apart. |
| The health assertion fails on the version | The installed artifact is not the one this run built | Do not relax the assertion. Find out which artifact installed. |
| The URL-shape assertion fails | Desktop inter-process control was unavailable and the fallback URL was expected instead | Both shapes are handled; a failure here means neither matched. |
| The terminal probe fails | A native binding did not survive packaging | A real defect in the artifact. |
| A residue check fails | Something wrote outside the namespace or Squirrel package root, or uninstall did not remove a registry entry or shortcut | Treat as a defect. An uninstall that leaves credentials is a privacy failure. |
| The suite times out at 12 minutes | Something hung rather than failed | The `finally` block still stops and uninstalls; read the packaged logs it printed. |
| The next run behaves strangely | A prior run left an install behind | The pre-clean step exists for this; check it ran. |

## Security considerations

- **This step installs and runs a real application on the machine it is on.** It
  belongs on an ephemeral hosted runner and nowhere else. Never point it at a
  machine holding real user data: it uninstalls with product-user-data removal,
  which is exactly as destructive as it sounds.
- **It seeds onboarding state and creates projects.** Those are writes to the data
  root, cleaned up by the uninstall. On a persistent machine they would not be.
- **The report is uploaded as a workflow artifact**, and it contains a screenshot
  of the running application plus the packaging build's output. Nothing secret
  should ever be visible in that window; if the application ever renders a token
  on its first screen, this test publishes it.
- **The `full` profile stands up a local update fixture** serving a real installer
  payload. That is a local server on the runner, and it must not outlive the test.

## Verification

**Observed before the migration:** the `core` profile passed inside the
`Release` workflow on a Windows runner, against a real built legacy installer,
with every legacy assertion satisfied and all seven residue checks clean. The
post-migration Squirrel `core` run and published feed remain pending CI evidence.
The report — manifest, packaging output, test log, result record, summary and
screenshots — is uploaded as a workflow artifact when the run reaches that step.

**Not observed:** the **named UI-state set**, which has never run — it was
written against the harness's existing renderer-eval and screenshot channels and
has not yet executed on a runner. Nothing here claims it works. The first run to
carry it should be read for three things: how many of the nine states the
`ui-states.json` index says were captured, whether any two frames share a
`sha256` (which would mean the compositor, not the app, is at fault), and
whether the narrow states were reached at all — a renderer-driven window resize
is the one mechanism in the set that could turn out to be unavailable, in which
case both narrow frames are absent with that reason recorded.

Also not observed: the `full` profile, any non-Windows platform, and a *failing*
smoke test whose failure was correctly reported in published release notes. The
notes mechanism reads the step's real outcome, so a failure would be published as
one; that path has not been exercised.

```bash
# run the same suite locally against a build you have just produced
pnpm tools-pack win build --to squirrel
# then, from the end-to-end workspace, with the build output path exported:
pnpm exec tsx scripts/release-smoke.ts win specs/win.spec.ts
```

## Suggested reading

- [release-pipeline.md](release-pipeline.md) — where this step sits, and what happens either side of it
- [../architecture/packaged-runtime.md](../architecture/packaged-runtime.md) — what is being installed, and why its identity is asserted so carefully
- [../architecture/data-directory.md](../architecture/data-directory.md) — the contract the residue checks depend on
- [release-assets.md](release-assets.md) — the artifact this test consumes, and what ships beside it
- [../troubleshooting/platform-specific-tests.md](../troubleshooting/platform-specific-tests.md) — why this runs on Windows while most of the suite runs on Linux
