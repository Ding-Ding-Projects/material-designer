# The data-directory contract

**One process, one data root, resolved once at startup.** Every daemon-owned path
derives from that single value. This is the most important invariant in the
codebase, and the workspace's own guidance says so explicitly: it is the *only*
repository-wide source of truth for daemon-managed data paths, and every other
document that mentions them is required to point here rather than restate them.

> [!IMPORTANT]
> **Status: an inherited invariant, enforced by convention and review, not by a
> compiler.** Nothing prevents a new file from computing its own path. The
> workspace's own guidance names four escape patterns that already exist in the
> tree and instructs that none of them be extended. That is the state of the art:
> the rule is documented, the known violations are catalogued, and the guard is
> human.

This page exists because the failure this rule prevents is uniquely nasty. A
violated data-directory contract does not crash. It writes real data to a real
place, and the rest of the application looks in a different real place, so the
user's work exists on disk and is simply invisible — which is indistinguishable
from having been deleted.

## Behaviour

### Resolution, once

At daemon startup, `apps/daemon/src/server.ts` resolves the environment's data
directory into a constant conventionally called `RUNTIME_DATA_DIR`. Resolution has
four steps and it happens exactly once:

1. **Trim the configured value.** An empty or whitespace-only value counts as
   unset.
2. **If unset:** fall back to `.od` inside the project root — *unless* sandbox
   mode is enabled, in which case the resolver **throws**. An isolated session that
   silently fell back to the shared default would put isolated data in the shared
   place, which is the one thing sandbox mode exists to prevent.
3. **If set:** expand a leading home reference, resolve it against the project
   root, create the directory, and then prove it is writable.
4. **On failure, throw with a diagnosis, not a stack trace.** The error names the
   resolved path, the underlying error, the current user, the three usual causes —
   a parent owned by another user, a symlink into a protected location, a directory
   previously created with elevated privileges — and the exact commands to inspect
   and repair it.

That fourth step is worth copying elsewhere. "Permission denied" tells a user
nothing; naming the parent directory to inspect turns a support thread into a
one-line fix.

### Everything derives from it

Once resolved, every daemon-owned path is a join onto that root or onto a constant
that was itself derived from it:

| Under the data root | What it holds |
| --- | --- |
| `projects/` | The managed-project root. |
| `artifacts/` | Generated artifacts served over the static artifact route. |
| `critique-artifacts/` | Deliberately outside the static tree, so the per-run endpoint stays the only read path and its membership, size and content-security guards cannot be bypassed. |
| `skills/`, `design-systems/`, `design-templates/`, `brands/` | User-owned content, each mirrored by a bundled read-only root. |
| `library/` | Content-addressed captured assets. |
| `plugin-asset-cache/`, plugin registry roots, the plugin lockfile | Plugin state. |
| The database file | Embedded SQLite. |
| Application configuration, memory, automation state, connector credentials, tool-protocol configuration and tokens, sandbox-owned logs, agent runtime homes | Everything else the daemon persists. |

**One exception is sanctioned:** an *imported-folder* project uses the external
workspace directory the user chose, recorded in the project's own metadata. That
is the point of importing a folder. Everything else stays under the root.

### The canonical alias, and why there are two

The raw root is kept exactly as resolved, because that is the path a user
configured and predictability matters more than tidiness. A second,
`realpath`-resolved alias exists **only** for containment checks against paths that
arrived through `realpath` themselves.

The reason is a real bug class: on some systems a common parent directory is a
symlink, so a user-supplied path canonicalises into a different prefix and a naive
"does this start with the data root" check rejects a path that is genuinely inside
it. Two constants, two jobs — the stable one for resolution, the canonical one for
comparison. Collapsing them breaks whichever job you collapsed toward.

### Propagation to child processes

**Agent subprocesses receive the resolved root** in their environment. They inherit
the daemon's truth source rather than guessing their own. An agent that computed
its own path would write generated files where the daemon is not watching, so the
project file-event stream would never fire and the interface would show nothing
while the files sat on disk.

### Propagation in development

The development tool owns runtime, log and socket namespacing. **A namespace does
not, by itself, isolate daemon data.** A development run that needs an isolated
data root has to pass the data-directory variable explicitly; after that the daemon
resolves it once and every path flows from it as usual.

This trips people up because namespacing *looks* like isolation. It isolates the
things the development tool owns. It does not reach inside the daemon.

### Propagation in a packaged build

The packaging tool and the launcher own the packaged channel and namespace layout.
The launcher resolves the final namespace-scoped root **before** spawning the
daemon and hands it over as the environment value.

The daemon must not infer packaged data paths from the application name, the
framework's user-data directory, a port, a channel name, or a namespace name. Each
of those has broken in a specific way:

| Inference | Why it breaks |
| --- | --- |
| Application name | This repository *renamed* the product. Every name-derived path moved, so an inferring code path lands where the resolved root is not, and the user's data looks gone. |
| Framework user-data directory | It is the shell's location, not the daemon's, and it is not namespace-scoped. Two channels would share it. |
| A port | Development ports are allocated per run. A path containing one persists nothing. |
| Channel or namespace name | Both are inputs the launcher already used to compute the root. Recomputing from them duplicates the logic and drifts from it. |

## The exceptions, stated exactly

These are sanctioned. Nothing else is.

| Name | What it is | What it is not |
| --- | --- | --- |
| Media configuration override | A narrow override for one configuration file | A second data root |
| Legacy data directory | A one-shot migration *source*, copied across before the database opens | An active data root |
| External tool homes | Integration inputs for third-party tools | The product's runtime data |
| Skill staging aliases | Aliases used in an agent or project working directory | Data roots |
| Manifest metadata keys and style identifiers | Semantic namespaces | Filesystem path conventions |

The legacy migration is deliberately **synchronous**, because the database opens
immediately afterwards and an asynchronous copy would race it.

## Known escape patterns — do not extend these

The workspace's own guidance catalogues four patterns that exist in the tree and
must not be reused. They are listed here because a reader who finds one and copies
it in good faith is the most likely way the invariant breaks.

1. **Module-level defaults pointing at a working-directory-relative legacy
   directory.** The value is computed at import time, before anything has resolved
   anything, from whatever directory the process happened to start in.
2. **Helper defaults that recompute a root** from the environment or a
   working-directory fallback instead of receiving the resolved root as an
   argument. This is the most seductive one: it looks like a sensible default and
   it produces a *second* resolution that can disagree with the first.
3. **Database-open calls that rely on a project-root fallback** instead of passing
   the resolved root.
4. **Script help text and examples naming a concrete legacy directory.** Documented
   examples propagate faster than code does.

When the fix is obvious, route the path through the resolved root or an explicit
argument. When it is not, stop and ask rather than inventing a convention — a new
path convention invented under deadline is how a fifth escape pattern gets added
to this list.

## What breaks when the contract is violated

This is the section the page exists for. Each of these is a distinct failure with a
distinct symptom, and none of them looks like a path bug from the outside.

**A second root inside one process.** One feature writes to a
working-directory-relative default while everything else writes to the resolved
root. The user creates a project and it appears; they restart the daemon from a
different working directory and it does not. Nothing is corrupted; nothing is
lost; the data is in the other root. Support reproduces none of it because the
reproduction depends on where the process was started.

**A rename moves name-derived paths.** This repository renamed the product. Any
path inferred from the application name moved with it, and a user upgrading across
the rename opens an application with an empty workspace. Their data is intact, one
directory away, under a name the application no longer uses.

**Two channels sharing a root.** A beta build and a stable build both resolving to
the same place share credentials, tokens and project data. The failure is not that
they *can* see each other's data — it is that uninstalling one removes the other's.

**A port in a path.** Development ports are allocated per run, so a path containing
one is unique per run. Every launch presents an empty workspace and leaves a
directory behind. The disk fills; nothing persists; nobody suspects the path
because the code that built it is obviously correct.

**Namespace churn resetting identity.** Anything that must survive a namespace
reset has to live *above* the namespace subtree. The installation record does,
deliberately. Something stored one level lower resets whenever the namespace
changes between versions, so the application forgets what installation it is.

**An agent subprocess guessing.** The agent writes generated files somewhere the
daemon is not watching. The file-event stream never fires. The run appears to
finish having produced nothing, and the files are on disk the whole time.

**A containment check against the wrong constant.** Comparing a
`realpath`-resolved user path against the raw root rejects legitimate paths on any
system where a parent of the temporary or home directory is a symlink. The user
sees "outside the data directory" for a directory that is plainly inside it.

**Credentials in an unmanaged location.** The data root holds connector credentials
and tool-protocol tokens. A second root is a second copy of those secrets in a
place nothing protects, nothing rotates, and — critically — uninstall does not
remove, because uninstall cleans the root it knows about.

**Authenticated-encryption bindings tied to a row identifier.** Named here because
the standards call it out and it is the same class of mistake: bind additional
authenticated data to a stable identifier that survives delete and restore, never
to an autoincrementing row id. A restored row gets a fresh id, the binding stops
matching, and the data becomes permanently undecryptable while failing in a way
that looks exactly like corruption.

## Configuration

| Variable | Default | Effect |
| --- | --- | --- |
| `OD_DATA_DIR` | `<project root>/.od` | The daemon data root. Must be absolute in a packaged build. |
| `OD_SANDBOX_MODE` | off | Isolated-session mode. Makes the data directory **mandatory**; the resolver throws rather than falling back. |
| `OD_LEGACY_DATA_DIR` | unset | One-shot migration source, copied in synchronously before the database opens, only when the new root is fresh. |
| `OD_MEDIA_CONFIG_DIR` | unset | Narrow override for the media configuration file. Not a data root. |

In a packaged build two additional constraints apply, both enforced with an
explicit error rather than a silent correction: the value must be **absolute**, and
if it is a namespace-scoped data path, its namespace segment must **match the
running namespace**.

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| Startup throws naming the directory, the current user, and a repair command | The resolved root is not writable | Read the message; it names the parent to inspect. Do not add a fallback. |
| Startup throws that the directory is required | Sandbox mode with no value set | Set it. The refusal is the feature. |
| Packaged startup throws that the path must be absolute | A relative value | Set an absolute path. A relative path in a packaged app resolves against whatever working directory the OS launcher supplied. |
| Packaged startup throws over a namespace mismatch | A namespace-scoped path for a different namespace | Point it at the running namespace, or use a path that is not namespace-scoped. |
| Data created in one session is invisible in the next | Two roots in one process, or a working-directory-relative default | Find the path that did not derive from the resolved root. |
| Data appears empty after an upgrade | A name-derived path and a product rename | The data is under the old name. Migrate it; do not re-point the application at the old location. |
| Generated files never appear in the interface | An agent subprocess resolving its own path | Ensure the subprocess receives the resolved root in its environment. |
| A path plainly inside the data root is rejected as outside it | A containment check against the raw root instead of the canonical alias | Compare canonicalised paths on both sides. |
| Uninstall leaves data behind | Data written outside the known root | Every daemon path must derive from the root, or uninstall cannot know about it. |
| Two development runs share a database | A namespace was assumed to isolate data | Namespaces isolate runtime, log and socket paths. Pass the data-directory variable to isolate data. |

## Security considerations

- **The data root is where the secrets are.** Connector credentials and
  tool-protocol tokens live under it. Any second root is a second, unmanaged copy.
- **Uninstall completeness depends on this contract.** The packaged smoke test
  asserts the namespace root does not exist after uninstall. That assertion is only
  meaningful if everything was under it — a file written elsewhere survives an
  uninstall that reports success.
- **Containment checks are a security control, not a convenience.** Import and
  preview paths compare user-supplied locations against the data root. A check
  written against the wrong constant either rejects valid paths (an annoyance) or,
  written loosely to make the annoyance go away, accepts paths outside the root
  (a traversal).
- **Sandbox mode's refusal to fall back is the security property.** A fallback
  would silently place isolated-session data in the shared location.
- **The resource root is separately contained.** The daemon rejects a bundled
  resource root that does not resolve inside the workspace or the application's own
  resources path, because an unconstrained one would let a caller have arbitrary
  directories served as trusted bundled content.

## Verification

**Observed:** the packaged smoke test uninstalled the application with product
user data removal and asserted the namespace root no longer exists, alongside six
other residue checks. That is real evidence that the paths a packaged install
actually used were under the resolved root — for the surfaces the smoke test
exercised.

**Not verified:** that *every* daemon path derives from the root. No mechanical
check enforces it, and the four known escape patterns are documented precisely
because they do not.

A review checklist that would catch a violation before it ships:

```bash
# Any daemon path built from the environment rather than the resolved root
grep -rn "process.env.OD_DATA_DIR" design/apps/daemon/src

# Working-directory-relative path construction in daemon source
grep -rn "process.cwd()" design/apps/daemon/src

# Paths derived from the framework's user-data location in packaged code
grep -rn "userData" design/apps/packaged/src
```

Each hit needs an answer to one question: *does this receive the resolved root, or
does it recompute one?* Recomputation is the defect, even when it currently
produces the same string.

## Suggested reading

- [daemon.md](daemon.md) — the process that performs the resolution, and the rest of its startup order
- [packaged-runtime.md](packaged-runtime.md) — how the launcher resolves the namespace-scoped root before the daemon starts
- [../release/packaged-smoke-test.md](../release/packaged-smoke-test.md) — the residue assertions that depend on this contract holding
- [../standards/releases.md](../standards/releases.md) — the local version-history requirement, which snapshots what lives under this root
- [../troubleshooting/README.md](../troubleshooting/README.md) — failures this project actually hit, written up so they are not rediscovered
