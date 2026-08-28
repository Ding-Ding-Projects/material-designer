# Local personal-vocabulary JSON

## Behaviour

Material Designer exposes a local JSON picker in the desktop Settings surface
and in the documentation site's Settings surface. The control is visible even
when no file has been supplied. Until a valid file is chosen, original shipped
wording remains active.

The supported file shape is versioned and intentionally small:

```json
{
  "schemaVersion": 1,
  "entries": {
    "ordinary label": "chosen private label"
  }
}
```

The loader validates the complete UTF-8 byte payload before storing anything.
It rejects malformed JSON, duplicate keys, unknown top-level fields, unknown
schema versions, unsafe object keys, non-string replacements, empty values,
oversized entries, excessive entry counts, and excessive nesting. A rejected
file never partially replaces an earlier valid cache.

The cache is revalidated on every read. A valid replacement applies only at an
explicit private UI text boundary, including the corresponding accessible name.
Technical identifiers, commands, URLs, paths, exports, history, telemetry,
logs, prompts, diagnostics, and public records retain their original text.
Clear removes the cache and restores original wording immediately. Replace and
clear propagate to other same-origin surfaces through the storage event and a
local change event.

Each successful load, replace, and clear also appends a bounded local history
event containing only the schema version, action name, and local event time.
The history contains no replacement value, entry count, source filename, source
path, byte count, or file metadata. Storage write, readback, removal, and
history recording all have discriminated outcomes. A failed write, failed
readback, failed removal, or failed history recording is reported as a failure
and does not apply a new replacement.

The control has its own local search field with an adjacent anchored regex
builder. Plain text is the default, and the builder owns isolated query,
pattern, flags, validation, and saved state. School mode removes this feature
from the rendered surface and restores it when School mode ends.

The documentation site's control also exposes a local history panel. Its search
field has its own anchored regex builder, and its date and action filters compose
with that search. The panel shows only redacted action and local time, and its
export contains only those fields. A malformed history record is reported as
unavailable and is never overwritten. The desktop mutation is handed to the
application's existing Git-backed history boundary through a redacted
`personalVocabularyHistory` configuration marker, so the live payload never
becomes a history value.

On the desktop host, the marker is written through the daemon app-config route,
the daemon records the marker through its existing history service, flushes the
history queue, and acknowledges a real committed revision before the route
reports success. A failed acknowledgement restores the prior config marker and
the renderer restores the prior cache.

History entries support visible multi-selection, select-all-visible, inverse
selection, and deletion through a local two-key plus full-range confirmation
surface. The deletion is bounded to the selected redacted events and verifies
the stored result before refreshing the list.

## Configuration

The neutral schema uses `schemaVersion: 1` and an `entries` object. The current
limits are:

| Limit | Value |
| --- | ---: |
| Complete payload | 262144 bytes |
| Entries | 2048 |
| Entry key | 128 Unicode code units |
| Replacement value | 256 Unicode code units |
| Nested JSON depth | 4 |

Entry keys containing numeric characters are refused as factual-key entries, so
numeric counts, versions, durations, and similar facts stay outside this
personal wording channel. Redacted mutation history retains at most 64 events;
the `deleted` event records a history deletion without carrying removed values.

The desktop and site implementations use the same storage key,
`open-design:personal-vocabulary:v1`, but each surface validates independently.
The cache contains only the validated payload supplied by the user. No source
path is stored.

## Failure modes

An oversized or malformed file leaves the last valid cache active and reports a
localized inline status. If no valid cache exists, the original wording stays
active. If local browser storage or the desktop renderer's local storage is
unavailable, the surface remains usable with original wording and reports its
empty state. A cache that later becomes malformed is ignored rather than
applied.

The site and desktop control are not a network upload feature. There is no
account, request, remote sync, or background transfer. School mode is a
complete suppression state, not a disabled replacement that remains discoverable
through search or the command palette.

## Security considerations

The implementation does not ship a private mapping and does not read a private
repository file. It accepts only user-selected local bytes, bounds parsing and
entry sizes, rejects prototype-polluting keys, and creates a null-prototype
entry map. Credentials, paths, replacement payloads, source metadata, and
cache contents are not written to logs, telemetry, analytics, exports, history,
prompts, clipboard data, or public records.
The local history record is a redacted action event only, and is independently
verified before a mutation is reported successful.

Applying a replacement requires the explicit `private-ui` boundary. The helper
returns its input unchanged for `technical` and `public` boundaries. This
keeps a display-only customization from changing commands, URLs, identifiers,
or externally verifiable records.

## Verification

The source-level contract inventory and deliberate negative regression are
checked with:

```powershell
pwsh -NoProfile -File scripts/test-personal-vocabulary-contract.ps1 -SelfTest
```

The focused validator suite is
`design/apps/web/tests/lib/personal-vocabulary.test.ts`. It covers valid
versioned input, duplicate keys, unknown fields, unsafe keys, wrong value
types, empty values, size/depth/count limits, cache persistence, no partial
application, private-boundary application, public-boundary preservation,
clear/reset, mutation outcomes, and redacted history. The component test covers
the actual rendered empty, loaded, invalid, clear, School-mode, live canonical
School transitions, and language/funny-level states. Built-artifact UI driving and per-click capture
evidence remain task-level evidence owned by the release orchestrator; this
lane records the required surface and evidence rows without claiming those
captures exist.

The hosted site behavior suite is
`design/apps/web/tests/site/personal-vocabulary.behavior.test.ts`. It loads the
real site module, exercises local file selection and picker reset, and checks
local-date filtering against a filtered history projection. It is intentionally
not run in this lane because the Node and browser Chuts execute in hosted
verification after the canonical universal-settings source is approved.

## Suggested articles

- [Language modes](language-modes.md)
- [Regex builder](regex-builder.md)
- [Command palette](command-palette.md)
- [Local version history](version-history.md)
- [Accessibility](accessibility.md)
