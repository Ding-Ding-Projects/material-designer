# Local personal-vocabulary JSON

## Scope

This article covers the desktop Settings component, the shared loader, and the
static site feature module. The desktop component is mounted by the app shell
through `SettingsDialog.tsx`, and the command palette indexes its
`personalVocabulary` target. The canonical universal-settings runtime is
mounted by `App.tsx`, so the component can observe the shared School-mode
adapter. The static site HTML and main module register the local feature module
without duplicating its logic.

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

Entry keys containing any Unicode Number-category code point are refused as
factual-key entries, so decimal, letter-number, and other numeric forms cannot
rewrite counts, versions, durations, or similar facts. Decoded control,
formatting, bidirectional, and unpaired-surrogate code points are rejected in
both keys and replacement values. Redacted mutation history retains at most 64
events.

The cache uses `open-design:personal-vocabulary:v1`. The source path is never
stored. The component owns its own `personalVocabulary` settings id and
`setting:personalVocabulary` palette target through
`PERSONAL_VOCABULARY_SETTINGS_MOUNT`.

## C1 School-mode boundary

The loader does not import or own the universal-settings implementation. It
accepts an injected `PersonalVocabularyC1` adapter with synchronous
`readSchoolMode` and live `subscribeSchoolMode` functions. Both paths use
`boolean | null`: `null` means the canonical host has not answered or is
unavailable, and remains a fail-closed state rather than being converted to
`false`. The app shell can register its canonical adapter with
`configurePersonalVocabularyC1`, while a standalone browser surface uses the
local settings projection as a fallback.
The executable desktop handoff is owned by the universal-settings runtime at
`design/apps/web/src/components/universal-settings/UniversalSettingsRuntime.tsx`,
which is mounted by the app shell. If the host bridge has not answered yet,
the adapter reports `null` and the feature stays suppressed until a definite
value arrives.

When School mode is active, or when the canonical value is unavailable, the
component returns no rendered surface and its settings search and palette target
are absent. A live C1 transition restores the component without requiring a
reload. This suppression is a complete removal,
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

The match policy is explicit. Latin and other word-like keys match only when
the surrounding code points are not letters, marks, numbers, connector
punctuation, or dash punctuation. A match is also refused when a combining mark
would be split from its neighboring base. CJK phrases match wherever they occur,
including inside a longer phrase, while still respecting combining-mark
boundaries. The match operation compares raw Unicode code points and deliberately
does not normalize NFC to NFD, NFD to NFC, or fold visually confusable letters.
For example, precomposed `é` does not match decomposed `e` plus U+0301, and
Cyrillic lookalikes do not match Latin keys. This is a deliberate local schema
policy, exposed as `PERSONAL_VOCABULARY_MATCH_NORMALIZATION = 'none'`, and is
implemented once in each feature module and exercised by the desktop and site
checks.

The static site module exposes the feature-owned
`PERSONAL_VOCABULARY_MOUNT_EVENT` and `PERSONAL_VOCABULARY_OPEN_EVENT` contracts,
`mountPersonalVocabulary`, `initPersonalVocabulary`, and
`openPersonalVocabulary`. An unresolved injected School-mode state keeps the
site feature hidden until the adapter reports a definite value. The open event
scrolls the mounted surface into view and returns focus to its search field.

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

The static-site behavior test is
`design/apps/web/tests/site/personal-vocabulary.behavior.test.ts`. It loads the
real site module in a child Node process, exercises local file selection, the
Unicode and boundary policy, unresolved and live C1 state, mount/open events,
raw-code-point NFC/NFD and confusable distinctions, cache plus
redacted-history restoration, forced child timeout, output-overflow termination,
and nonzero child exit.
The child runner passes a 30-second timeout and a 2 MiB `maxBuffer` directly to
`execFileSync`; focused negatives prove that a forced timeout, output beyond the
configured bound, and a nonzero child exit are surfaced rather than reported as
successful completion. The overflow case requires the runtime `ENOBUFS` reason,
the `SIGTERM` termination signal, and no completion marker from partial stdout,
so the parent never accepts a partial probe result and the child is cleaned up.

The source guard and both focused tests ran against the isolated checkout.
Built-artifact interaction, hosted verification, and per-click screen-capture evidence
remain outside this source lane and are not claimed here.

## Suggested articles

- [Language modes](language-modes.md)
- [Regex builder](regex-builder.md)
- [Command palette](command-palette.md)
- [Local version history](version-history.md)
- [Accessibility](accessibility.md)
