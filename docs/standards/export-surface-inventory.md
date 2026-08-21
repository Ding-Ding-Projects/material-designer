# Export surface inventory

This hand-written inventory keeps the project-level ZIP handoff distinct from
file and record export paths. It records source state only; hosted build,
installed interaction, and process-level editor evidence remain open.

| Surface | Route or owner | Scope | Source verdict |
| --- | --- | --- | --- |
| Complete project handoff | POST /api/projects/:id/archive/prepare plus staged GET | Whole project root, including empty projects | Implemented: deterministic for fixed source/project/build inputs, omission ledger, per-entry lengths/hashes, receipt digest, bounded staged lifetime |
| Active-file website handoff | GET /api/projects/:id/archive and downloadProjectArchive | Complete project when the file has no version; versioned artifact path otherwise | Existing path retained; project-level action is the preferred no-file route |
| Desktop scaffold | target=desktop-scaffold and downloadDesktopScaffold | Complete project plus generated desktop source scaffold | Separate named target; never silently substituted into the ordinary handoff |
| Selected design-system package | Design-system archive route and downloadDesignSystemArchive | Design-system package and generated usage guide | Existing route retained; shared Markdown helper now protects generated guide headings/lists |
| Structured records | /api/export/* and od export data | Records, lists, logs, and settings | Existing matrix retained; shared fence/table Markdown escaping is used |
| History view | renderHistoryMarkdown | Filtered revisions currently visible | Shared heading/list/inline-code escaping is used |
| Diagnostics | Diagnostics export handler and CLI | Redacted diagnostic bundle | No fake project ZIP action added; diagnostics remains its own explicit export |
| Editor handoff | POST /api/editor/open | Exact staged archive path plus containing workspace root | Implemented in source; missing preferred editor stays visible in chooser and is never silently replaced |

## Privacy and receipt boundaries

The ordinary project ZIP has no sensitive opt-in. Credential, token, private-key,
personal-vocabulary, cache, and traversal paths are omitted and recorded in
EXPORT-MANIFEST.json; bounded text files have local absolute paths redacted.
The archive digest is reported by the receipt over the complete ZIP byte stream,
while the manifest records the digest scope rather than embedding a
self-referential digest.

## Verification boundary

Static source contracts and the Git Bash port verifier are the only local checks
run for this lane. Hosted source checks, built-artifact browser interaction,
installed ZIP download, and real VS Code/editor launch remain pending.
