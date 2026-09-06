# Manual release adapter checkpoint

Status: unfinished, held source. Do not use this adapter to publish a release.
The supported release workflow remains the current publication route and can be
started manually through `workflow_dispatch`.

The experimental `scripts/publish-manual-release.ps1` now separates `Reserve`
from `Publish`. Its proposed interface accepts `ReservationFile`, `SourceCommit`,
`Version`, and numeric `Candidate`; publication additionally takes `RunDirectory`
and `DishId`. Reservation would create an owned draft and record its numeric
REST id, publisher identity, reservation marker, and actual creation timestamp
before a build. The proposed tag is `v<Version>-r<Candidate>.1`.

The unfinished implementation adds clean-source checks, strict external
provenance validation, catalog photo hash and decode checks, a build-evidence
producer, upload without clobbering, and byte-download comparisons. These paths
have not received executable functional tests or independent review. No draft,
upload, publication, or other remote mutation was executed with this adapter.
Only PowerShell syntax parsing was performed.

Remaining work before any use:

- Test both phases with deterministic CLI fixtures and interrupted operations.
- Validate existing local publication receipts instead of trusting their file
  presence, and reconcile immutable draft-stage receipts with final observed
  publication state.
- Align manual reconciliation with reservation ownership and downloaded-byte
  evidence. The existing reconciliation implementation is not yet updated.
- Reconcile the exact sanitized delivery asset schemas and validate every
  provenance and receipt boundary before uploading.
- Verify line-count freshness and enforce a complete safe-output inventory.
- Independently review ownership, retry behavior, and final release validation.

This checkpoint is not release evidence and does not authorize publication.
