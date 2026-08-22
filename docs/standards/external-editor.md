# External editor integration

Anything the product owns — a project, a file, an export — can be opened in the
user's own code editor in one action, without them going to find it on disk.

**Status: partial, inherited from upstream, and narrower than the requirement.**
The vendored product already detects installed editors and opens a *project* in
the chosen one. What it does not do is close the loop on **exports**: there is no
one-action route from an exported file, or from the record it came from, into an
editor. Nothing here has been exercised in this repository.

## The requirement

### Detect, choose, persist, degrade

| Requirement | Meaning |
| --- | --- |
| **Detect** | Find the editors actually installed on this machine, at the time of asking. |
| **Choose or add** | Let the user pick from what was found, and add one that was not. |
| **Persist** | Remember the choice. |
| **Degrade clearly** | When nothing is found, say so plainly and offer the route forward — never fail silently, and never open some other editor the user did not ask for. |

### Every export lands in an editor

**Anything the product can export is openable in a code editor directly from the
product** — one action, taken either from the export itself or from the record it
came from, that opens the exported file or folder.

**Opening a folder must open it as a workspace root**, so the file tree is
usable. Opening a single file with no surrounding context is a different, much
less useful operation, and the difference is invisible until the user is looking
at an editor with one tab and no project.

Where a common editor is expected and absent, detect it properly before
concluding it is missing: the command shim on the executable search path, the
usual per-user and machine-wide install locations, and the insiders and portable
builds. **When it genuinely is not installed, say so and offer the download** —
do not fail silently, and do not substitute a different editor.

## Why this is a standard and not a convenience

An export that lands somewhere the user then has to find is only half an export.
The realistic sequence is: export, minimise the application, open a file manager,
remember which folder was chosen, open an editor, open the folder in the editor.
Six steps, of which five are the product's fault.

The rule about workspace roots exists because this is the point where the feature
is usually half-implemented. Opening the exported *file* is the obvious
implementation and it is the wrong one for anything that exported more than one
file — the user gets a single buffer with no siblings, no search, and no way to
navigate to the thing they actually wanted.

The rule about degrading clearly exists because the failure is otherwise
invisible. A spawn that fails because the shim is not on the search path looks
exactly like a button that does nothing, and a user who clicks a button twice and
sees nothing concludes the product is broken rather than that an editor is
missing.

## Current implementation status

| Requirement | Status |
| --- | --- |
| Editor catalogue | **Implemented upstream.** A declarative catalogue at `design/apps/daemon/src/routes/host-tools.ts` covering a code editor, several agentic editors, two JetBrains products, the platform file manager on each operating system, and platform terminals. |
| Detection | **Implemented upstream**, at request time rather than cached: each entry's command shim is probed on the executable search path. On Windows the probe also tries the executable, command and batch suffixes; on macOS and Linux it adds the common install directories a login shell would have, and on macOS it falls back to probing for an application bundle by name. |
| Choose an editor | **Implemented upstream.** The daemon exposes the resolved list, and the interface renders it. |
| **Add** an editor the catalogue does not know | **Not started.** The catalogue is fixed. |
| Persist the choice | **Implemented upstream; preference-boundary regression added.** A missing stored preference is not replaced by an available editor on the primary action; the chooser remains the explicit recovery path. Hosted persistence proof remains pending. |
| Open a project in the chosen editor | **Implemented upstream.** A detached spawn with the project's resolved directory as the single argument — which is the form that opens a folder as a workspace root. |
| Open a folder as a workspace root | **Implemented in shape**, per the line above. Not observed running. |
| **Open an export** in an editor | **Implemented in source.** The complete project ZIP prepare receipt carries its exact staged path and the result surface opens that path through the editor route, using its containing folder as the workspace root. Hosted process proof remains pending. |
| Detect per-user, machine-wide, insiders and portable installs | **Not met on Windows.** The Windows probe covers the executable search path only; the extra directory list is empty on that platform, so an editor installed without its shim on the path is reported as absent. |
| Degrade with a clear message, and offer the download | **Not verified.** |

> [!NOTE]
> The upstream rows are read from the vendored source, not from a running
> daemon. The application builds, installs, launches and passes an automated
> health check, but no editor hand-off has been exercised in this repository.

<details>
<summary><b>One upstream detail worth keeping</b> — an entry restricted to the platform where it actually works</summary>

One terminal in the catalogue is restricted to a single operating system, with
the reason recorded beside it: on the other platforms a cold start ignores the
directory argument, so the hand-off silently opens the wrong thing.

That is the degrade-honestly rule applied correctly, and it is worth stating
because the tempting alternative — list it everywhere and let it misbehave on two
platforms — produces an affordance that looks supported and is not. See
[accessibility.md](accessibility.md) on decorative-looking interface that must be
functional.

</details>

## Configuration

| Setting | Default | Effect |
| --- | --- | --- |
| Preferred editor | None chosen; the detected list is offered | Once chosen, it persists and becomes the one-action target. |
| Detection timing | At request time | Not cached at startup, so an editor installed while the application is running is found on the next ask. This costs a probe per request and is the right trade: a stale cache reports an editor the user just installed as missing. |
| Custom editor entry | Not supported yet | Adding one means spawning a command the product did not choose — see the security note below. |
| Open target | The project's resolved directory | A folder, not a file, so the editor opens a workspace root. |

## Failure modes

| Symptom | Cause | What should happen instead |
| --- | --- | --- |
| The button appears to do nothing | The spawn failed and the failure was swallowed | Report it as a notification naming the editor and the reason |
| An installed editor reported as missing | Detected only by a command shim that was never installed on the search path | Also probe the platform's usual install locations, and the insiders and portable builds |
| A different editor opens | A fallback that opens whatever the operating system associates with the path | Never substitute. Say the chosen editor was not found |
| The editor opens one file with no project | The export's file was passed instead of its folder | Pass the folder so it opens as a workspace root |
| The export cannot be opened at all | The integration is project-level only | Every export offers the same one-action hand-off |
| A cached detection result | Detection run once at startup | Probe at request time |
| The hand-off works on one platform | An entry listed everywhere but functional in one place | Restrict the entry to the platforms where it works, with the reason recorded |
| The user's choice forgotten | Not persisted | Persist per profile |

## Security considerations

- **This feature spawns a process on the user's machine.** That is its whole
  purpose, and it is also the reason the catalogue is a fixed, reviewed list
  rather than free text. Every entry names a specific command or application
  bundle, and the launch passes exactly one argument: a directory the product
  already owns.
- **"Let the user add an editor" loosens that deliberately**, and must be built
  with the loosening visible. An arbitrary command entered into a settings field
  is an arbitrary binary executed with the daemon's privileges. Require an
  explicit, unambiguous confirmation, store the resolved absolute path rather
  than a name to be searched for later, never accept extra arguments as free
  text, and never let a project file, an import, or a synced setting introduce
  one.
- **The directory passed must be one the product resolved**, never a path taken
  from user input or from a record's contents. A path that escapes the project
  root turns "open my project" into "open anything on this disk".
- **The executable search path is attacker-influenceable.** A shim resolved from
  the path is whatever is first on it. Probe with an absolute path, verify the
  file is executable before spawning, and do not extend the search path with
  directories a non-privileged process can write to.
- **Detection discloses what is installed.** The list of editors on a machine is
  a fingerprint. Keep the enumeration local; never report it anywhere.
- **Failure messages should name the editor, not the path.** A message quoting an
  absolute path from the user's machine is the kind of thing that ends up pasted
  into a public issue.

## Verification

**Nothing has been verified.** The upstream behaviour is described from its
source; no editor hand-off has been observed running in this repository.

Conformance requires all of:

- [ ] detection finding an editor installed **without** its command shim on the
      search path, on every supported operating system
- [ ] insiders and portable builds detected as the same editor
- [ ] the detected list matching what is actually installed on a clean machine
      and on a fully-loaded one
- [ ] a chosen editor persisting across a restart
- [ ] a one-action hand-off from **every** export surface, enumerated against the
      export inventory rather than spot-checked
- [ ] a folder export opening as a **workspace root**, verified by the editor
      showing a file tree
- [ ] a single-file export opening that file, with its containing folder as the
      root where the product owns that folder
- [ ] a missing editor reported clearly, with the download offered and no
      substitution
- [ ] a failed spawn surfaced as a notification naming the editor and the reason
- [ ] a custom editor entry, if implemented, storing a resolved absolute path,
      confirmed explicitly, and unable to be introduced by an imported file or a
      synced setting
- [ ] a path-escape test: a record whose stored directory points outside the
      project root is refused

The path-escape test and the missing-editor message are the two to write first.
One guards a real security boundary; the other guards the failure that users
report as "the button is broken".

## Suggested reading

- [export-and-bulk-actions.md](export-and-bulk-actions.md) — the exports this hand-off must reach, and the formats they come in
- [notifications.md](notifications.md) — how a failed spawn is reported without halting the application
- [accessibility.md](accessibility.md) — the rule against affordances that look functional and are not
- [../architecture/overview.md](../architecture/overview.md) — the daemon that owns process spawning, and why the interface does not
- [../api/](../api/) — the daemon route surface this feature is exposed through
- `ROADMAP.md` §4.7 — the tracked work item
