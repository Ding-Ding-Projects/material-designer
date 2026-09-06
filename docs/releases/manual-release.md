# Local build and manual unsigned Squirrel publication

The operational adapter is `scripts/publish-manual-release.ps1`. It runs from a
clean checkout of the exact built commit, even when the reviewed adapter itself
is held in a separate checkout. It never invokes a workflow or invents workflow
identifiers or timestamps. Run it with Windows PowerShell 5.1; the strict source
provenance validator must be available beside the adapter.

## Reservation before packaging

`-Phase Reserve -ReservationFile <private-path> -SourceCommit <sha> -Version
<version> -Candidate <number>` refuses an existing reservation, tag, or same-source
release. It creates exactly one draft, retaining a local intent before the call,
then records the numeric REST release id, owner, unique body marker and actual API
creation timestamp. The strict four-field provenance is written beside it before
packaging. An interrupted intent must be inspected before another attempt.

For an explicitly parent-owned reservation, use `-Phase Publish -RootReservation`.
The input must carry its original exact body, marker, numeric release id, source,
version, candidate, publisher login, creation time and provenance path. The adapter
reads the actual API release and requires those identities and the original body
to match before adopting it. It preserves the original file and writes a separate
`.publisher-state.json` record. The tag must be `v<Version>-r<Candidate>.1` and match
the installer manifest and metadata URL.

## Publication

Publish additionally requires `-RunDirectory`, `-DishId`, `-DishName`, `-PhotoUrl`,
`-PhotoSha256`, `-PhotoBytes`, and `-ReleaseNotesFile`. The notes file is reviewed
bilingual text describing actual changes and known limitations. It is capped at
32 KiB. The publisher adds the exact source, unsigned-install warning, canonical
photo link, and current committed line-count summary.

Only the canonical public dim-sum catalog is authoritative for photo metadata.
The publisher downloads and verifies its published PNG bytes and decode, but
never attaches or copies the image into this product's release assets. The owner
selects an unused dish from the current catalog before calling Publish.

The local package set is projected into `manual-public-assets`. Raw execution
logs and private `liveProof` details remain unchanged and local. Public packaging
logs use a fixed allowlisted summary. Required safe provenance fields, signing
controls and observed audit limitations are preserved, with a relative public-log
path and its actual hash. `builtAt` is the externally recorded provenance time,
not a guessed local clock. The committed Squirrel validator runs on the public
set and regenerates its artifact receipt against those exact provenance bytes.

Existing remote assets are never clobbered. Unknown or different assets stop the
operation. Every uploaded asset is downloaded and compared by bytes and SHA-256 while the
release is still a draft. A mismatch prevents publication. The complete inventory
and download comparison are repeated after publication.
The immutable `release-publication-receipt.json` describes preparation; it remains
`publicationStatus: draft` rather than pretending to know a future publication
time. A local `manual-download-verification.json` records the subsequently
observed published API timestamp and all downloaded hashes. Reconciliation
requires exact reservation identity, current API publication state, and this byte
proof before reporting complete. Merely observing asset metadata is insufficient.

## Executable verification and limitations

`scripts/test-publish-manual-release.ps1` uses local fake CLI, signature and
validator functions to test reservation and publication control flow, ownership,
source cleanliness, tag mismatch, unknown assets, public projection privacy,
link-only photos, matching provenance receipt bytes, and corrupted downloads.
`scripts/test-reconcile-release-state.mjs` tests the separate reconciliation
contract. These fixtures do not claim a genuine package, installed launch, or
published release. The real publisher runs the source's genuine Squirrel byte
validator; installed runtime verification remains a separate required operation.
