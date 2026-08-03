# Open in external editor

Hand a project folder — or any file the app produced — to a local editor in one
action. Visual Studio Code is the entry that must always work; everything else
is a bonus the daemon reports honestly.

Surfaces:

| Surface | Entry point |
| --- | --- |
| HTTP | `GET /api/editor/detect`, `POST /api/editor/open` |
| CLI | `od editor detect`, `od editor open`, `od editor use` |
| Contract | `packages/contracts/src/api/editor.ts` |
| Detection + argv | `apps/daemon/src/external-editors.ts` |
| Routes | `apps/daemon/src/routes/editor.ts` |
| Persisted choice | `AppConfigPrefs.externalEditor` (`app-config.json`) |

## Behaviour

### Detection reports, it does not assume

`GET /api/editor/detect` probes each catalogue entry in this order and stops at
the first hit:

1. an `OD_*_BIN` env pin (`OD_VSCODE_BIN`, `OD_VSCODE_INSIDERS_BIN`),
2. the `$PATH` shim — what the user's own shell would run,
3. a portable checkout located through `VSCODE_PORTABLE`,
4. the per-user and machine install locations.

Every command name and absolute location that was tried comes back on the
response as `probedCommands` / `probedPaths`, whether or not the editor was
found. "Not installed" on its own is unactionable; a portable build or a
relocated install is the usual reason a real editor reads as missing, and the
probe trail is what lets a user see which assumption was wrong.

VS Code is covered on all three platforms: the `code` / `code-insiders` shims,
the Windows per-user (`%LOCALAPPDATA%\Programs\…`) and machine
(`%ProgramFiles%\…`) installs including the `Code.exe` binary and the `bin`
`.cmd` shim, the macOS app-bundle CLI under `Contents/Resources/app/bin`, the
Linux distribution/snap/flatpak locations, the Insiders build as its own entry,
and portable builds. Cursor, Windsurf, Zed, Sublime Text, WebStorm and IntelliJ
IDEA are detected too, including the JetBrains Toolbox script directories.

`vscodeAvailable` is true when either stable or Insiders resolved.
`vscodeDownloadUrl` is always present so a client never has to invent one.

### A folder opens as a workspace root

`POST /api/editor/open` builds `<editor> <folder> [<file>]`. The folder comes
first on purpose: that is what makes it the window's root folder, so the file
tree is usable. Passing the file alone gives one document in an empty window,
which is the failure this feature exists to avoid.

Given only a file, the containing directory becomes the workspace root
automatically. That is what makes "open this export in VS Code" a single
action: the file the user just wrote, with a real project around it. Send
`openWorkspaceRoot: false` to opt out.

An editor that cannot take a folder is marked `supportsFolders: false`. If a
folder was explicitly requested, the request fails and names the editor; if the
folder was merely derived from a file, it is dropped silently, because the
caller never asked for it.

### Degrading honestly

If the resolved editor is missing, the daemon returns `409 EDITOR_NOT_FOUND`
and launches nothing. It never substitutes a different editor — opening
something the user did not pick is worse than reporting that the one they
picked is gone. The error `details` carry `EditorNotFoundDetails`: the editor
id, the vendor download URL, and the full probe trail.

The same rule governs `effectiveEditorId` on the detect response. Auto-picking
(VS Code first, per `EXTERNAL_EDITOR_AUTO_PREFERENCE`) applies **only** when no
choice has been stored. A stored choice that no longer resolves yields
`effectiveEditorId: null` even on a machine with three other editors installed.

### The persisted choice

`AppConfigPrefs.externalEditor` holds `{ id, command?, label?, supportsFolders? }`
and is read and written through the existing `GET`/`PUT /api/app-config`
surface, so the web UI and the CLI share one value. `command` is only
meaningful for the `custom` id — a user-added executable. A custom entry is
assumed **not** to accept a folder unless the user says otherwise, because
guessing wrong there produces exactly the no-context failure above.

## Configuration

| Key | Where | Meaning |
| --- | --- | --- |
| `externalEditor` | `app-config.json` | Persisted choice. `null` clears it. |
| `OD_VSCODE_BIN` | env | Absolute path pinning VS Code, for an install none of the probes would find. |
| `OD_VSCODE_INSIDERS_BIN` | env | Same, for Insiders. |
| `VSCODE_PORTABLE` | env | Read (not set) by the daemon; VS Code's own portable-mode marker. |

Nothing here is a daemon data path. The persisted choice lives in
`app-config.json` under the resolved data root like every other preference; see
the **Daemon data directory contract** in `AGENTS.md`.

## Security

- **No shell, ever.** The launch goes through `launchHostTool`, which routes the
  invocation via `createCommandInvocation`: a detached spawn with an argument
  vector, `.cmd` / `.bat` handled by `cmd.exe` with verbatim
  `CommandLineToArgvW`-safe args, and never `shell: true`. Shell metacharacters
  in a path (`&`, `|`, `;`, backticks, `$(…)`, `%VAR%`) are therefore ordinary
  bytes in a filename and need no escaping.
- **A path is data, not a command fragment.** Every path reaching the argument
  vector passes `assertEditorPathArg`, which rejects NUL bytes (they truncate an
  argv element) and anything that is not an absolute, normalized path. The
  absoluteness rule is the argv-layer counterpart to not using a shell: it stops
  a relative path being resolved against whatever working directory the daemon
  happens to have, and stops an option-shaped argument (`--wait`, `-n`) arriving
  disguised as a file.
- **The executable never comes from the request.** A caller chooses *which*
  editor, never *what* binary. The command is either a catalogue probe result or
  the user's own stored `custom` path, and a stored path carrying control
  characters is dropped at validation rather than persisted.
- **Local only.** `POST /api/editor/open` spawns a process, so it sits behind
  `requireLocalDaemonRequest` like every other launching endpoint.

## Failure modes

| Status | Code | Cause |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | Nothing to open; an unknown editor id; a relative or option-shaped path; a folder for an editor that cannot open one. |
| 404 | `PROJECT_NOT_FOUND` | `projectId` does not exist. |
| 404 | `FILE_NOT_FOUND` | The `path` given does not exist on disk. |
| 409 | `EDITOR_NOT_FOUND` | Nothing resolved, or the chosen editor is gone. Carries the download URL and the probe trail. |
| 500 | `EDITOR_LAUNCH_FAILED` | The OS refused the spawn (stale shim, quarantine, `EACCES`). The spawn's own error message is surfaced verbatim. |

The route waits for the OS to confirm the spawn before replying, so a refused
launch is never reported as success — the same contract `POST
/api/projects/:id/open-in` holds.

## CLI

```bash
od editor detect --json
od editor open --project p1
od editor open --path ./exports/deck.pdf
od editor open --project p1 --file ./index.html
od editor open --path ./notes.md --no-workspace-root
od editor use vscode
od editor use custom --command /usr/local/bin/mine --label Mine --supports-folders
od editor use --none

# One action: export and open, without hunting for the file on disk.
od export deck.html --project p1 --format pdf --out deck.pdf --open
```

Relative paths are resolved by the CLI against its own working directory before
the request goes out, because the CLI is the process that knows what
`./out.pdf` means. The daemon only ever accepts absolute paths.

`od editor open` exits 4 on a 409 and prints the download URL plus the probe
trail rather than collapsing into a bare status code.

`od export … --open` posts the written file to `POST /api/editor/open` so the
artifact goes straight to the editor with its folder as the workspace root.
That hand-off is best-effort by design: the bytes are already on disk, so a
missing editor prints the download link on stderr and leaves the export
successful. Under `--json` the outcome travels in the envelope as `openedIn`
and nothing extra is written to stdout.

## Verification

| File | Covers |
| --- | --- |
| `apps/daemon/tests/external-editors-detect.test.ts` | Every VS Code install shape (PATH, per-user, machine, macOS bundle, Insiders, portable, env pin) with an injected probe, so each platform's catalogue is exercised from any host; the probe trail on a miss; auto-pick order; the no-silent-fallback rule; custom editors. |
| `apps/daemon/tests/external-editors-args.test.ts` | Argument construction: folder-before-file ordering, metacharacter paths staying one inert argv element on both posix and win32, NUL rejection, relative and option-shaped rejection, normalization. |
| `apps/daemon/tests/editor-routes.test.ts` | The HTTP surface end to end with `spawn` mocked: workspace-root derivation, on-disk path classification, `shell` never true, and every failure row in the table above. |

## Related

- `apps/daemon/src/routes/host-tools.ts` — the broader "reveal this project in a
  local app" hand-off (Finder, Terminal, Warp, …). It shares `launchHostTool`
  and `projectHostOpenDir` with this feature, but has no persisted choice, no
  workspace-root guarantee, and no arbitrary-path target.
- **Capability exposure (UI/CLI dual-track)** in `AGENTS.md` — the rule that put
  both surfaces on the same endpoints.
