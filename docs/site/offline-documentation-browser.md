# Offline documentation browser

The documentation site includes an offline reader for every Markdown article
under `docs/`. The reader is part of the published static bundle. It does not
send an article to a server, and it does not require a forge connection to read
the content.

## Behaviour

The committed generator enumerates the complete `docs/**/*.md` tree and writes
`site/assets/data/docs-manifest.json`. Each entry contains its relative path,
category, title, source link, SHA-256 of the source file, suggested reading, and
the normalized Markdown body. The current manifest contains 68 entries.

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
fallback when an older article did not yet have one. This keeps an old article
connected without copying its body into a second source of truth.

The renderer is isolated in `site/assets/js/docs-browser.js`. It escapes article
text before adding only the generated elements it owns. A Markdown document
cannot become executable site markup merely because it contains HTML-looking text.

The installed application consumes the same manifest through a generated
`design/apps/web/src/lib/docs/generated.ts` module. Its `/documentation` route
appears in the navigation rail, workspace tab strip, and command palette, uses
the shared application Markdown renderer, keeps internal links in-app, and
persists a bounded recent-reading list. That application route is source-complete
in this change but remains unverified until a hosted build and real packaged
interaction run provide evidence.

## Configuration

The generator is deterministic and has no network or package-manager input:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/generate-docs-manifest.ps1
```

The default source is `docs/`, and the default output is
`site/assets/data/docs-manifest.json`. `-RepoRoot` and `-OutputPath` can be used
by a deployment check without changing the source tree. The manifest schema is
versioned at `schemaVersion: 1`; the verifier rejects missing, duplicate,
unsafe, stale, or incomplete entries.

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
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/generate-docs-manifest.ps1
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/verify-docs-browser.ps1 -SelfTest
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/generate-social-preview.ps1
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/verify-site-metadata.ps1 -SelfTest
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/generate-app-docs-manifest.ps1
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/verify-app-docs-bundle.ps1 -SelfTest
```

The docs-browser validation checks exact article enumeration, source hashes, unique
identifiers, nonempty titles and bodies, suggested-reading metadata, the reader
mount, the field-owned builder, the single renderer, and the social-preview
generator. Its self-test removes the exact browser mount and proves red, then
restores the source and proves green.

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
