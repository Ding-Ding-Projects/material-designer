# Documentation and link-preview evidence

This article defines the evidence contract for the documentation site and the
installed application documentation reader. Both are user-facing surfaces, so
their documentation readers, link previews, and recording claims need evidence
that can be inspected without trusting a source-only description.

## Behaviour

The documentation site carries a generated local manifest for every Markdown
file under `docs/`. The reader loads that manifest, validates its schema and
source hashes, renders article bodies through one isolated escaped Markdown
renderer, and keeps internal article links inside the reader. Each article ends
with authored or deterministic suggested reading.

The site also carries one product-specific social preview. A committed generator
writes the root and served copies from the same existing packaged application
capture. The root and served files must be byte-identical. Static HTML supplies
Open Graph and Twitter metadata before JavaScript runs, including an absolute
HTTPS image URL, dimensions, alt text, and `summary_large_image`.

The recording requirement is fail-closed. A recording is accepted only when it
is a real capture of a built application at a named commit, driven by the
approved headless route, and accompanied by a per-action receipt. When that
external capture is not available, the inventory keeps the recording row
pending. It never substitutes a mock, a design file, or a hand-assembled video.

The installed application now has a real Documentation destination at
`/documentation`, a navigation-rail item, a workspace tab, and a command-palette
destination. It consumes the same generated manifest as the site, validates its
source hashes at runtime, renders with the shared isolated Markdown renderer,
keeps internal article links in the application, and stores a bounded local
recent-reading list. This source implementation still needs hosted type,
packaging, and built-runtime interaction evidence before it can be described as
verified.

## Configuration

The manifest generator is:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/generate-docs-manifest.ps1
```

The social preview generator is:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/generate-social-preview.ps1
```

Both commands use only checked-in sources and write deterministic UTF-8 or byte
copies. They do not download content, read credentials, or run a package
manager. The site metadata identifies the current published release in the
image query string so crawlers can distinguish a meaningful preview change.

## Failure modes

| Failure | Evidence result | Required response |
| --- | --- | --- |
| An article is added without a manifest entry | Documentation validation fails on exact path-set comparison. | Regenerate the manifest and review the new article. |
| An article changes without a manifest refresh | The stored SHA-256 is stale. | Regenerate, inspect the diff, and rerun the validation. |
| A renderer accepts raw article markup | The renderer safety Shek Q fails. | Escape the provider-authored body and add a red-then-green regression. |
| A source link points outside the article bundle | The internal-link resolver refuses it. | Use a local article target or a labelled HTTPS external link. |
| Root and served preview bytes differ | Metadata validation fails before publication. | Run the one-source generator again and inspect both hashes. |
| Metadata points at a relative or unversioned image | Metadata validation fails. | Use the generated served image URL and update its version query. |
| A real application recording is unavailable | The recording inventory remains pending and the release-grade pass remains incomplete. | Run the approved packaged capture route, retain receipts, and rerun evidence checks. |
| The installed application bundle is stale | The generated application module no longer matches the site manifest. | Run `scripts/generate-app-docs-manifest.ps1` and `scripts/verify-app-docs-bundle.ps1`. |

## Security considerations

The manifest is public documentation and contains no credentials or private
machine details. The renderer treats article text as data, escaping it before
adding generated links. Only HTTPS external links are emitted. Internal path
resolution rejects traversal segments.

The social preview uses an existing committed application capture rather than a
newly generated or downloaded image. The image generator checks the PNG signature
and copies bytes without re-encoding. The metadata verifier checks the served
file locally, while a deployment check must still fetch the published URL
without credentials before claiming public availability.

Recording receipts must not include user data, credentials, private paths, or
unredacted browser state. A pending row is safer than a fabricated recording,
because a still image cannot prove that the controls moved or that an operation
reported progress.

## Verification

Run:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/generate-docs-manifest.ps1
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/verify-docs-browser.ps1 -SelfTest
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/generate-social-preview.ps1
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/verify-site-metadata.ps1 -SelfTest
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/generate-app-docs-manifest.ps1
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/verify-app-docs-bundle.ps1 -SelfTest
```

The docs-browser self-test removes the exact browser mount and proves red, then
restores it and proves green. The metadata self-test changes the exact image
URL to a relative path and proves red, then proves green after restoration.

The installed application's route and interaction inventory remains in
`docs/standards/ui-drive-evidence.md`. Its recording row is pending until a
current packaged capture is available. A source-only check cannot promote it,
but the application source now owns a separate bundled reader rather than
delegating to the site.

## Suggested articles

- [../site/offline-documentation-browser.md](../site/offline-documentation-browser.md), the reader implementation and manifest contract
- [ui-drive-evidence.md](ui-drive-evidence.md), per-action receipts and built-surface capture evidence
- [design-reference-parity.md](design-reference-parity.md), identical capture tuples and visual comparison
- [local-assets.md](local-assets.md), the no-network asset boundary
