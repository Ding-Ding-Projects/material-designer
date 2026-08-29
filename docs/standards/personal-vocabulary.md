# Local personal-vocabulary JSON

## Scope

This article covers the desktop Settings component and its shared loader. The
component is mounted by the app shell through the C0 settings and command-palette
identifiers exported from
`design/apps/web/src/components/PersonalVocabularySettings.tsx`. Site-specific
surfaces are separate consumers and are not represented by this source lane.

## Behaviour

Material Designer exposes a local JSON picker in its Settings surface. The
control is visible even when no file has been supplied. Until a valid file is
chosen, original shipped wording remains active.

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
It rejects malformed JSON or UTF-8, duplicate keys, unknown top-level fields,
unknown schema versions, unsafe object keys, non-string replacements, empty
values, oversized entries, excessive entry counts, and excessive nesting. A
rejected file never partially replaces an earlier valid cache.

The cache is revalidated on every read. A valid replacement applies only at an
explicit private UI text boundary, including the corresponding accessible name.
Technical identifiers, commands, URLs, paths, exports, history, telemetry,
logs, prompts, diagnostics, and public records retain their original text.
Replacement matching is one-pass and longest-key-first, so a replacement value
that happens to contain another key is not rewritten a second time. Clear
removes the cache and restores original wording immediately. Replace and clear
propagate to other same-origin surfaces through the storage event and a local
change event.

Each successful load, replace, and clear also appends a bounded local history
event containing only the schema version, action name, and local event time.
The history contains no replacement value, entry count, source filename, source
path, byte count, or file metadata. Storage write, readback, removal, and
history recording all have discriminated outcomes. A failed write, failed
readback, failed removal, or failed history recording is reported as a failure
and does not apply a new replacement.

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
personal wording channel. Redacted mutation history retains at most 64 events.

The cache uses `open-design:personal-vocabulary:v1`. The source path is never
stored. The component owns its own `personalVocabulary` settings id and
`setting:personalVocabulary` palette target through
`PERSONAL_VOCABULARY_SETTINGS_MOUNT`.

## C1 School-mode boundary

The loader does not import or own the universal-settings implementation. It
accepts an injected `PersonalVocabularyC1` adapter with synchronous
`readSchoolMode` and live `subscribeSchoolMode` functions. The app shell can
register its canonical adapter with `configurePersonalVocabularyC1`, while a
standalone browser surface uses the local settings projection as a fallback.

When School mode is active, the component returns no rendered surface and its
settings search and palette target are absent. A live C1 transition restores the
component without requiring a reload. This suppression is a complete removal,
not a disabled replacement that remains discoverable.

## Failure modes

An oversized or malformed file leaves the last valid cache active and reports a
localized inline status. If no valid cache exists, the original wording stays
active. If local browser storage is unavailable, the surface remains usable with
original wording and reports its empty state. A cache that later becomes
malformed is ignored rather than applied. A rollback payload is validated again
before it can restore state after an app-history refusal.

The picker is not a network upload feature. There is no account, request,
remote sync, or background transfer. The focused no-network check replaces the
global `fetch` with a spy and verifies that validation and storage never call
it.

## Security considerations

The implementation does not ship a private mapping and does not read a private
repository file. It accepts only user-selected local bytes, bounds parsing and
entry sizes, rejects prototype-polluting keys, and creates a null-prototype
entry map. Credentials, paths, replacement payloads, source metadata, and cache
contents are not written to logs, telemetry, analytics, exports, history,
prompts, clipboard data, or public records.

Applying a replacement requires the explicit `private-ui` boundary. The helper
returns its input unchanged for `technical` and `public` boundaries. This keeps
a display-only customization from changing commands, URLs, identifiers, or
externally verifiable records. The accessible-name path uses the same private UI
boundary as visible labels.

## Verification

The source-level contract inventory and deliberate negative regression are
checked with:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-personal-vocabulary-contract.ps1 -SelfTest
```

The focused validator test is
`design/apps/web/tests/lib/personal-vocabulary.test.ts`. It covers valid
versioned input, duplicate keys, unknown fields, unsafe keys, wrong value
types, empty values, size/depth/count limits, cache persistence, no partial
application, one-pass private-boundary application, public-boundary
preservation, clear/reset, rollback validation, mutation outcomes, redacted
history, injected C1 reads and subscriptions, and the no-network assertion.

The component test is
`design/apps/web/tests/components/PersonalVocabularySettings.test.tsx`. It
covers the rendered empty, loaded, invalid, clear, School-mode, live C1
transition, language/funny-level, C0 metadata, and accessibility-name states.

The source guard and both focused tests ran against the isolated checkout.
Built-artifact interaction, hosted verification, and per-click screen-capture evidence
remain outside this source lane and are not claimed here.

## Suggested articles

- [Language modes](language-modes.md)
- [Regex builder](regex-builder.md)
- [Command palette](command-palette.md)
- [Local version history](version-history.md)
- [Accessibility](accessibility.md)
