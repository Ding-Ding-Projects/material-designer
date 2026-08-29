# Every-element Material Design registry

This project keeps explicit committed classifications for every element that
the desktop source graph or documentation site can render. The inventory is
evidence, not a completion claim. All 42 user-facing registry rows remain
`partial`, and every interaction receipt, capture, and measured contrast value
remains `unverified` until a real built artifact supplies the required proof.

## Files and authority

| File | Authority |
| --- | --- |
| `.codex/verification/lang-gui/registry.json` | The 42 user-facing surface-owner rows and their 30-field, 12-state evidence contract. |
| `.codex/verification/lang-gui/registry.schema.json` | The closed JSON Schema for registry rows and interaction receipts. |
| `.codex/verification/lang-gui/source-owners.json` | The exact 42 owner registrations that connect the registry to parsed source nodes. |
| `.codex/verification/lang-gui/source-owners.schema.json` | The closed schema for owner registrations, parser provenance, classification file paths, and counts. |
| `.codex/verification/lang-gui/desktop-elements.json` | Every desktop entry root, reachable module, component owner, JSX or factory element, source exclusion, and render-like comment exclusion. |
| `.codex/verification/lang-gui/desktop-elements.schema.json` | The closed schema for desktop classifications. |
| `.codex/verification/lang-gui/site-elements.json` | Every static HTML start tag, every parsed JavaScript DOM creator, and every render-like comment exclusion on the documentation site. |
| `.codex/verification/lang-gui/site-elements.schema.json` | The closed schema for site classifications. |
| `scripts/lang-gui-source-classifier.mjs` | The parser-backed source graph, stable identities, hand-written authority policy, and classification refresh logic. |
| `scripts/verify-lang-gui-elements.mjs` | The normal and exact red-then-green validator, including immutable evidence admission. |
| `scripts/run-lang-gui-verifier.ps1` | The Node 24 and locked parser bootstrap that always invokes the owned validator. |
| `scripts/scan-lang-gui-evidence-privacy.mjs` | The committed bounded byte-pattern and PNG-metadata scanner required by a verified evidence report. |

Every extension namespace in these files carries its own integer version. No
unversioned extension object is accepted. Every fixed nested schema object uses
`additionalProperties: false`, so an unknown property is an error rather than
an undocumented extension.

## Parser and bootstrap boundary

JavaScript, TypeScript, JSX, and TSX are parsed with
`@babel/parser` `7.29.3`, exactly as declared by
`design/apps/daemon/package.json`. The validator resolves the package from that
manifest, reads the installed package version, and refuses a missing or
mismatched parser. The supported bootstrap and verification entry point is:

```text
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/run-lang-gui-verifier.ps1
```

The wrapper requires Node 24, probes the exact declared parser, and, only when
it is missing, installs the locked `@open-design/daemon` dependency closure
with package scripts disabled before invoking the owned validator. The
validator canonicalizes the resolved package path and accepts only the exact
`design/node_modules/.pnpm/@babel+parser@7.29.3` closure inside the current
checkout. It rejects a same-version package found in an ancestor or global
`node_modules`, any symbolic-link or reparse escape, a package-tree hash that
differs from the reviewed eight-file closure, and a lockfile identity or
integrity value that differs from `design/pnpm-lock.yaml`. It does not fall back
to a regular expression or to an undeclared parser. `site/index.html` is parsed
by the versioned HTML state machine in
`scripts/lang-gui-source-classifier.mjs#parseHtmlDocument`. It recognizes
comments, declarations, start and end tags, quoted attributes, void elements,
self-closing elements, and raw script, style, textarea, and title content.
The hostile run injects a reparse result at the expected `.pnpm` closure
component and proves the parser is rejected before the real path is restored.

## Current explicit source census

The current committed classifications contain:

| Boundary | Exact count |
| --- | ---: |
| Desktop entry roots under `design/apps/web/app/` | 5 |
| Desktop main-process entry root | 1 |
| Desktop modules reachable through static imports, local exports, re-exports, literal dynamic imports, and desktop source edges | 582 |
| Desktop component owners classified in reachable modules | 588 |
| Component owners proven reachable through parsed render references | 505 |
| Desktop JSX, fragment, portal, factory, imperative DOM, HTML assignment, shadow-root, registry-boundary, and render-prop nodes classified in reachable modules | 11,723 |
| Element nodes owned by render-reachable components | 10,801 |
| Desktop JavaScript or TypeScript source exclusions outside the entry-root graph | 112 |
| Desktop render-like comment exclusions | 419 |
| Static documentation-site HTML elements | 1,542 |
| Documentation-site JavaScript runtime creators | 328 |
| Documentation-site render-like comment exclusions | 20 |
| Explicit genuinely dynamic limits | 5 |

The 588 desktop owners contain 505 owners reached through parsed component
references and 83 owners whose modules are reachable but whose component
declarations are not resolved from a render reference. Those 83 rows are
retained as explicit `module-reachable-only-owner` classifications rather than
quietly disappearing. Their 922 element rows are similarly classified as
`module-reachable-only-element`. The remaining 10,801 element rows are proven
inside render-reachable owners. The complete 11,723-row source census breaks
down as follows:

| Parsed kind | Count |
| --- | ---: |
| Intrinsic JSX elements | 9,088 |
| Component JSX elements | 2,176 |
| Fragments | 212 |
| React portals | 76 |
| Imperative `createElement` calls, including aliases | 55 |
| Render-prop invocations | 38 |
| Member-expression components | 36 |
| Statically parsed `innerHTML` template tags | 19 |
| Dynamic `innerHTML` boundaries | 10 |
| Imperative `createElementNS` calls, including aliases | 4 |
| Computed component-registry boundaries | 2 |
| Dynamic `insertAdjacentHTML` boundaries | 2 |
| Render-prop function boundaries | 2 |
| Component-registry object-spread boundary | 1 |
| Genuinely dynamic factory target | 1 |
| Shadow-root boundary | 1 |

The same rows record 7,318 conditional contexts, 1,805 map-produced contexts,
75 logical-expression contexts, and 181 spread-attribute elements. The collab
source directory is inside the same graph and contributes 7 owners and 90
elements. Named, default, and aliased imports, local and nested declarations,
re-exports, literal lazy or dynamic imports, route-table component variables,
fragments, portals, `React.createElement`, imported create-element aliases,
JSX runtime factories, multiline elements, and spread attributes all have
focused negative probes.

The 328 site runtime creators include 263 calls through local creator helpers,
25 direct `document.createElement` calls, 20 statically parsed `innerHTML`
template tags, 7 `document.createTextNode` calls, 6 dynamic `innerHTML`
boundaries, 3 helper HTML boundaries, 2 `document.createDocumentFragment`
calls, and 2 `document.createElementNS` calls.
Creator aliases, bound creators, helper parameters, multiline calls,
`insertAdjacentHTML`, static template content, and dynamic content are parsed
and classified by call site. Static HTML and JavaScript creator lists are both
checked in both directions against discovery.

## Stable identities and exclusions

Every classification row includes a stable identifier derived from its source
path, lexical owner, AST node kind, tag or component target, and occurrence
within that owner. It also carries the exact AST call-site identity, source
hash, classification, and review reason. Line numbers are not identities, so a
line-ending or whitespace change does not quietly turn one element into a new
one.

Comment exclusions are not hidden in source code. Each excluded comment is an
explicit inventory row with its parser node kind, source hash, classification,
and reason. Changing the comment text or changing its node kind makes the
validator red. Every JavaScript or TypeScript file outside the reachable
entry-root graph is also an explicit source exclusion with a full-file hash and
reason, so a new or removed source file cannot vanish from discovery.

Five dynamic boundaries remain deliberately honest:

1. A runtime-computed component target without a finite literal binding is
   classified at its call site. The validator does not invent target
   components.
2. A runtime HTML or tag expression whose values cannot be derived safely is
   classified as a dynamic site creator. The validator does not invent tags.
3. A higher-order component chain deeper than eight calls remains an explicit
   bounded limit rather than a guessed owner.
4. An unresolved object spread or computed component-registry key remains an
   explicit dynamic boundary.
5. A runtime-selected render-prop implementation remains an explicit function
   or invocation boundary rather than an invented target.

## Owner registration contract

The 42 registry owners retain a separate hand-written membership list: 27 for
the Windows desktop application and 15 for the documentation site. Each owner
registration resolves to exactly one parsed node:

- a `FunctionDeclaration` or `ClassDeclaration`;
- an exact named, default, namespace, or aliased import specifier; or
- an exact parsed `HTMLStartTag` with its call-site identity.

The registry lineage stores that node identity, node kind, owner token, and
source hash. Substring matches are not used. A renamed import, a commented
example, a descendant with a similar name, a duplicate registration, or a
changed HTML attribute cannot satisfy the owner registration.

## Required 30-field and 12-state row contract

Every registry row carries all 30 required fields. They cover semantic roles,
accessible names, actions, keyboard and touch routes, source lineage, Material
primitive anatomy, color, typography, shape, elevation, state layers, motion,
density, focus, target size, contrast, responsive tuples, context menus,
appearance editing, all six toy-lock policies, search and regex routing,
localization, persistence, tests, negative proof, interaction evidence,
capture evidence, and current status.

The exact state authority is: normal, hover, focus, pressed, selected,
disabled, dragged, validation, loading, success, warning, and error. Each row
also carries all four required responsive tuples and the three language modes.

## Immutable evidence contract

The eleven persisted evidence roles below prove structure and consistency only.
They can never promote a registry row to `verified`, even when every byte, hash,
Git blob, receipt, package, and capture is internally valid. Promotion requires
an additional verifier-owned live capability that exists only inside one
running verifier process and is held in a `WeakMap`; it has no JSON, environment,
receipt, source-file, or command-line representation.

A registry row cannot become `verified` until all eleven evidence roles point
to different paths in
`.codex/verification/lang-gui/evidence/<stable-element-id>/`:

1. the staged Squirrel `Setup.exe`;
2. the staged full `.nupkg`;
3. the staged `RELEASES` index;
4. the structured interaction receipt;
5. the real PNG capture;
6. the structured build receipt;
7. the version-bound build provenance;
8. the installer manifest;
9. the installed-runtime receipt;
10. the committed privacy scanner report; and
11. the bounded build log referenced by the provenance document.

Source fixtures, synthetic directories, path traversal, and evidence outside
that canonical staging directory are rejected. All eleven paths must be Git
blobs at the receipt's 40-character
`sourceCommit`, and the working bytes must still match those blobs. The
separate `buildSourceCommit` and `buildSourceTree` record the application source
revision and tree from which the package was built. The commit must be an
ancestor of `sourceCommit`. The interaction receipt and build receipt must both
carry the same commit, tree, and bounded input-tree hash. The build receipt also
binds `build.bat`, `build-installer.bat`, `scripts/build.ps1`, and
`scripts/build-installer.ps1` by exact SHA-256 and Git blob at the build source,
evidence source, checked-out `HEAD`, and working file. Both supported commands
must finish with zero exit status, and their exact start, completion, and
duration must contain the version-bound provenance timestamp. Keeping the build
source and evidence commit separate avoids a self-referential receipt while
still proving the exact source that produced the evidence files.

The validator checks each Git blob identity and SHA-256. A PE artifact needs a
real DOS header, PE signature, executable COFF and optional headers, aligned
non-overlapping sections, an executable entry point, and resource content. A
Squirrel package needs a complete, CRC-checked ZIP central directory, safe and
unique paths, package relationships, one manifest with package id
`open-design-packaged-app`, the exact `lib/net45/Material Designer.exe` and
`lib/net45/resources/app.asar` payload entries, and an executable that passes
the PE validator. The `RELEASES` row must bind that full package by filename,
byte length, and SHA-1. The installer manifest, build provenance, installed
receipt, package version, and staged filenames must agree exactly. The installed
receipt must prove the packaged executable hash was installed, launched through
the isolated headless route, and captured at the recorded dimensions. The
capture must be a
decodable, non-trivial PNG with strict chunk ordering, CRCs, IHDR, IDAT, IEND,
no trailing bytes, and bounded decoded dimensions and content. The committed
privacy report identifies the exact scanner path and scanner SHA-256 at
`sourceCommit`; it first requires that commit to equal checked-out `HEAD` and
requires the working scanner blob and hash to equal the commit. The locked
parser then enforces a one-import AST allowlist. Computed global aliases,
obfuscated network access, dynamic import or require, process or environment
access, child process, worker, native add-on, filesystem access, code generation,
and related escape forms are rejected before execution. The pure scanner runs
inside a code-generation-disabled VM module context that exposes only
`createHash`, `Buffer`, and the bounded byte inputs. A pinned, committed VM
runner owns file reads and emits the report. A pass-shaped report is accepted
only with process exit status `0`; an exit-status `1` report cannot dress itself
as a pass. Historical evidence must be checked out at its recorded commit before
validation, so the verifier never executes an arbitrary historical scanner
blob. Contrast is recalculated from the
committed PNG pixels at the receipt's named foreground and background sample
roles. The receipt is checked against a closed, versioned schema and must agree
with the registry on element ID, source provenance, artifact identity, capture
identity, route, state, theme, viewport, scale, privacy, and measured contrast.
Evidence paths cannot be reused by another role or another verified row.

## Verifier-owned live proof

`-LiveProof -Candidate <positive-integer>` is the only promotion route. When at
least one row requests `verified`, the CLI mints a random in-memory nonce and an
empty frozen capability object registered only in its private `WeakMap`. Before
creating a session directory or invoking any process, it validates the complete
registry and schema shape for every requested row. It then completes the static
source and evidence preflight. A malformed or fake row turns red before
`.yum-tong`, a build, an installer, or a driver can be touched.

For a valid request, the wrapper resolves the actual operating-system system
directory through the platform runtime instead of trusting `ComSpec`, `PATH`,
or `SystemRoot`. The verifier canonicalizes the exact system `cmd.exe` and
Windows PowerShell paths, verifies their Microsoft Authenticode provenance,
pins the active Node and Git executable hashes and publishers, and constructs a
minimal allowlisted environment from validated absolute directories. Caller
environment overrides and extra variables are rejected. It checks the four
supported script blobs at checked-out `HEAD`, invokes
`build.bat /s` and `build-installer.bat --candidate <n> /s` itself, observes
their process exit status and timing through that exact interpreter, and
rechecks the scripts before each launch and after execution.

The CLI exclusively creates a random nonce-owned session directory beneath the
trusted temporary root and holds an exclusive owner file open. File ID, creation
time, owner bytes, and nonce are revalidated throughout the run. The build and
installer scripts place manifests, provenance, logs, `Setup.exe`, the full
package, and `RELEASES` beneath that fresh root. Build directories outside it
are cryptographically bound by per-tree file counts, byte counts, file hashes,
and a stable aggregate hash in the nonce-bearing manifest. Creation identity is
required for the package set, installed executable, and captures; touching
modification time cannot make stale bytes fresh.

The verifier launches one pinned, committed cheap Lowlevel driver with a pinned
Node executable and minimal environment. Their long-lived process channel is
bound to the same nonce. The verifier checks desktop absence, launches the
current `Setup.exe`, locates the newly created installed executable, launches it
on the same hidden desktop, lists windows dynamically, and maps exactly one
non-zero `Chrome_WidgetWin_1` titled `Material Designer` to the newly created PID
and executable. It selects the HWND, delivers an allowlisted background action,
polls that exact window again, requests a capture for the HWND, receives the PNG
bytes over the nonce-bound driver channel, and exclusively writes and hashes the
capture. Caller-submitted PID, HWND, class, title, dimensions, path, or PNG data
are not accepted. Only after these live checks does the CLI authorize its
private capability, validate the static contract, and revoke the capability in
a `finally` path. A canonical source fixture with valid PE, `.nupkg`, `RELEASES`,
and unchanged scripts remains red without that capability.

If no row requests `verified`, `-LiveProof` reports that no live run is needed
and does not invoke a build, installer, installed application, or capture route.

## Validator and deliberate negative run

From the project root, after the declared dependencies are installed:

```text
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/run-lang-gui-verifier.ps1
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/run-lang-gui-verifier.ps1 -Negative
```

The live form owns its pinned hidden-desktop driver and does not accept a
persisted runtime observation on standard input:

```text
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/run-lang-gui-verifier.ps1 -LiveProof -Candidate <positive-integer>
```

The normal command validates the four JSON documents against their four closed
schemas, checks the 42 hand-written memberships, resolves owner registrations
through parsed nodes, rebuilds the source graph, compares every committed
classification in both directions, and enforces the evidence boundary.

Every registry, classification, schema, parser manifest, and receipt JSON file
is admitted through a stat-before-read boundary. Byte length is checked before
the read, and string, array, nesting, property, and node limits are checked
before or immediately after parsing. The hostile suite includes an oversized
on-disk sparse file that turns red before a whole-file read or JSON parse.

The negative command satisfies unrelated preconditions before mutating one
boundary at a time, then checks the exact diagnostic. The current suite proves
174 exact red-then-restored boundaries. It covers owner and row
removal, AST registration changes, nested schema extras and wrong types,
invalid statuses, missing states, surface drift, source and site omissions,
comment hash drift, all named desktop syntax forms, site creator aliases and
helpers, multiline calls, HTML creator changes, parser closure escape,
oversized JSON, reused roles, synthetic evidence staging, stub build scripts,
fake PE and Squirrel containers, malformed `RELEASES`, historic scanner code,
an exit-status `1` pass-shaped scanner report, computed-global and obfuscated
network attempts, a concrete reparse seam, absent, serialized, and
environment-shaped live capabilities, preflight-before-process ordering, fake
`ComSpec`, poisoned environment input, alternate driver bytes, touched stale
package, executable, and PNG identities, forged PID, HWND, class, and dimensions,
old process identity, nonce replay, false media, route, state, theme, viewport,
and scale mismatches, stale artifact provenance, privacy, dimensions, contrast,
and arbitrary receipt JSON. It
finishes by validating the untouched inputs again.

`-RefreshClassifications` is a maintenance aid, not evidence. It reparses the
source and rewrites the explicit JSON rows while preserving reviewed
classification and reason fields for unchanged identities. It fails when a
reviewed row disappears and marks every genuinely new identity unclassified,
so neither removal nor addition can become authoritative through refresh
alone. The normal and negative commands still decide whether the committed
result is acceptable.

## Current evidence boundary

This registry is exhaustive about current source classification and strict
about what proof must look like. It does not build or drive the application.
All 42 registry rows are therefore still `partial`, with zero verified receipt,
capture, or contrast records. A later built-artifact run must populate the eleven
committed evidence paths, invoke the verifier-owned live route, and satisfy every
immutable and live check before a row can become `verified`. No build, install,
installed-application launch, or capture was run while adding this live route.
