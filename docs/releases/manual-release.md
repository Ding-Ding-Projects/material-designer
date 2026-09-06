# Manual unsigned Squirrel release

`scripts/publish-manual-release.ps1` publishes a verified local candidate only after an explicit `-Publish` switch. It accepts the candidate run directory, exact source commit and version, unique tag, externally recorded build provenance, and a verified catalog photo. The script creates or resumes only a draft that targets the exact source commit, uploads the complete Squirrel asset set, records the forge-created release id and timestamps, then publishes and reads every asset back by name, size, and SHA-256 digest.

The publisher writes `release-publication-receipt.json` with `publisherKind: "manual"`. It intentionally contains no workflow id, run attempt, workflow timing, or invented workflow fields. The receipt records only externally observed release facts and the supplied provenance record.
