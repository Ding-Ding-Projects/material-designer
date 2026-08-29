# Offline documentation browser

The documentation site includes an offline reader for every Markdown article
under `docs/`. The reader is part of the published static bundle. It does not
send an article to a server, and it does not require a forge connection to read
the content.

## Behaviour

The committed generator enumerates the complete `docs/**/*.md` tree and writes
`site/assets/data/docs-manifest.json`. Each entry contains its relative path,
category, title, source link, SHA-256 of the source file, suggested reading,
deterministically deduplicated heading fragments, bounded local image mappings,
and the normalized Markdown body. The current manifest contains 68 entries.

The image mapping is intentionally narrow. A Markdown image may reference one
existing file under the repository's `assets/` tree through a bounded relative
path such as `../../assets/screenshots/...`. The generator resolves and hashes
that exact file, and the reader emits only the indexed `assets/...` path. An
unindexed relative image, traversal outside the approved tree, unsupported
scheme, missing file, or stale hash stays escaped text rather than becoming a
browser request.

Selecting an entry opens it in the reader beside the index. Headings, paragraphs,
lists, tables, block quotes, code fences, emphasis, inline code, internal article
links, and external links are rendered as readable content. Links to another
article stay in the reader and return the reader to the selected entry. External
links use HTTPS, open in a separate tab, and carry an accessible new-tab label.

The reader's search is plain-text-first and searches article titles, paths, and
body text. Its own adjacent builder is bound to the reader field, with isolated
query, pattern, flags, validation, mode, and saved-state handling. Regex mode
uses the same bounded JavaScript engine and builder as the other site searches.
Invalid or high-risk patterns report an honest message and do not become a blank
result list. Empty results say that no bundled article matches.

Every article receives a suggested-reading section at the end of the reader. The
manifest preserves authored suggestions and supplies a deterministic same-category
fallback when an older article did not yet have one. The generator normalizes
every relative suggestion to a docs-root path and verifies that it resolves to an
article in the same manifest. Source articles are therefore allowed to omit a
literal final Suggested articles section, because this generated manifest is the
single documented equivalent and is checked on every generation. This keeps an
old article connected without copying its body into a second source of truth.

The renderer is isolated in `site/assets/js/docs-browser.js`. It escapes article
text before adding only the generated elements it owns. A Markdown document
cannot become executable site markup merely because it contains HTML-looking text.

The installed application consumes the same manifest through a generated
`design/apps/web/src/lib/docs/generated.ts` module. Its documentation reader
receives a typed localized-copy adapter from the central shell, so the feature
does not depend directly on a global key union while C0 finishes locale
registration. `openDocumentation()` carries an activation request, an optional
article and fragment, and a deterministic `article` or `search` focus target;
the mounted reader consumes it once. Its `/documentation` route appears in the
navigation rail, workspace tab strip, and command palette once those central
registrations land, uses the shared application Markdown renderer, keeps
internal links in-app, and persists a bounded recent-reading list. That
application route is source-ready but remains unverified until a hosted build
and real packaged interaction run provide evidence.

## Configuration

The generator is deterministic and has no network or package-manager input:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/verify-offline-docs.ps1 -SelfTest
```

This root command regenerates and reparses the Day Teet Hui manifest, regenerates
the installed bundle, then runs both source-ready validators and their red-then-
green regressions. The individual generator remains available when a deployment
check needs `-RepoRoot` or `-OutputPath`; it refuses checked-in outputs so only
the coordinator can publish a pair. Neither command fetches content, reads
credentials, or runs a package manager. The manifest schema is versioned at
`schemaVersion: 1`; the validators reject missing, duplicate, unsafe, stale, or
incomplete entries.

The leaf validators remain honest while central registration is being ported: they
report the C0/C12 mount as pending when it is absent. The integration handoff must
enable the stricter form, `scripts/verify-offline-docs.ps1 -RequireCentralMount`, after
the application and Day Teet Hui mounts, imports, and controls are live. That form
fails closed until the exact mount and focus identities are present.

The default source is `docs/`, and the output is
`site/assets/data/docs-manifest.json`. The root verifier writes only temporary
outputs unless `-Update` is explicit. Update creates both candidates on the
destination volume, validates their shared deterministic generation, then
publishes each output with bounded replacement retries. Readers fail closed when
their generation is missing or malformed, and the coordinator rolls both outputs
back to their exact prior bytes or prior absence if publication fails. The
manifest schema is versioned at `schemaVersion: 1`; the validators reject missing,
duplicate, unsafe, stale, or incomplete entries.

The browser loads only the relative local manifest path
`assets/data/docs-manifest.json`. No CDN, remote script, remote font, analytics
endpoint, or runtime article fetch is configured. The source links shown beside
an article are user-initiated navigation, not reader data requests.

## Failure modes

| Failure | Reader behaviour | Recovery |
| --- | --- | --- |
| Manifest missing | The index reports that the local manifest is unavailable and does not show a false empty state. | Run the generator, then rerun the documentation verifier. |
| Manifest schema or path invalid | The reader refuses the bundle and reports an invalid local manifest. | Restore the generator output from the current `docs/` tree. |
| Article source hash changed | The verifier fails before publication. | Regenerate the manifest and review the changed article. |
| Heading fragments repeat or a link names a missing fragment | The generator and browser validator fail on the exact target. | Regenerate after correcting the heading or link. |
| A publication replacement fails or sees a transient sharing condition | The coordinator restores both outputs to their exact prior bytes or prior absence. Only bounded, known `IOException` HRESULT values are retried. | Fix the reported replacement failure, then rerun `-Update`. |
| Cleanup cannot remove temporary staging material | The primary verification diagnostic remains visible, and the retained staging path is reported for recovery. | Resolve the file-sharing condition and remove only the reported temporary path. |
| A relative image is not indexed | The reader leaves its alt text as escaped text and makes no request. | Add the existing asset through the generator's bounded mapping, or remove the image reference. |
| Article contains unsupported Markdown | The unsupported syntax remains escaped readable text. | Add a renderer case only when the project needs that syntax, then add a focused regression. |
| Internal link target is missing | The link is rendered as ordinary escaped text or remains an external source link. | Correct the article link and rerun the manifest and article checks. |
| Regex pattern is invalid or too risky | Search reports the invalid state and does not pretend that zero matches are a successful evaluation. | Return to plain text or revise the pattern in the anchored builder. |
| Browser storage is unavailable | The article reader still opens; only the builder's persisted state may be unavailable. | Continue in memory or restore browser storage. |

## Security considerations

Article bodies are provider-authored public text. They are escaped before being
inserted into the reader, and only allowlisted HTTPS external links are emitted
as anchors. Internal links are converted to local reader buttons after resolving
their path against the current article. Paths containing traversal segments are
rejected by both the generator contract and the browser validator.

The manifest contains no credentials, private vocabulary values, local machine
paths, or user data. Search patterns and sample text remain local to this
browser. The reader's regex evaluation is bounded by the shared builder's pattern,
sample, risk, and time limits.

The root `social-preview.png` and the served `site/assets/social-preview.png`
are generated from the existing committed packaged application capture. They are
byte-identical, and the metadata verifier checks their PNG signature, dimensions,
hash equality, absolute HTTPS URL, and anonymous served path before publication.

## Verification

Run the source and metadata checks from the repository root:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/verify-offline-docs.ps1 -SelfTest
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/verify-docs-browser.ps1 -SelfTest
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/verify-app-docs-bundle.ps1 -SelfTest
```

The root self-test also exercises the publication boundary with an injected
post-start partial second-output failure, all absent/present output combinations,
bounded transient retries, and a real conflicting file handle. It confirms that
message-only failures are not retried and that every rollback preserves exact
bytes or exact prior absence.

The docs-browser validation checks exact article enumeration, source hashes, unique
identifiers, nonempty titles and bodies, suggested-reading metadata, source URL
allowlisting, deduplicated fragments, fragment targets, indexed image hashes,
the reader's live imports and control identities, the field-owned builder, the
single renderer, and the central mount when C0/C12 has registered it. Its
self-test removes or corrupts one exact hash, article, suggestion, link,
fragment, source URL, image, mount, or focus identity at a time, proves red,
then restores the source and proves green.

The metadata validation checks every published HTML page. It proves that the root and
served image bytes match, that the PNG dimensions match the HTML claims, that
the `og:image` and `twitter:image` values are absolute HTTPS URLs with a version
query, that the page carries the required Open Graph fields, and that the
Twitter card is `summary_large_image`. Its self-test replaces the exact image
URL with a relative path and proves red, then proves green after restoration.

The current built-artifact capture set is recorded in the root README and in
`docs/standards/ui-drive-evidence.md`. This lane does not fabricate a new
screen recording. The deterministic recording contract and its pending evidence
row remain visible until a real cheap Lowlevel headless packaged capture exists.

## Suggested articles

- [pages-deployment.md](pages-deployment.md), how the static bundle is deployed and checked
- [../standards/documentation-currency.md](../standards/documentation-currency.md), keeping articles current in the task that changes behaviour
- [../standards/regex-builder.md](../standards/regex-builder.md), the full field-owned builder contract
- [../standards/ui-drive-evidence.md](../standards/ui-drive-evidence.md), real built-surface capture evidence
