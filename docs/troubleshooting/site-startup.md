# Documentation site startup wiring

## Symptom

The documentation page stopped during startup before its first interactive surface became usable. The browser reported `ReferenceError: initSiteShell is not defined` from `site/assets/js/main.js`.

## Cause

The startup entry point called the site-shell contract, its audit helpers, the local personal-wording control, the local converter, and logo customization without importing their owning modules. The same merge also left duplicate owner wiring and a settings-search School mode listener that read a nonexistent variable. The global content search referred to an undefined aggregate when rendering its result count.

## Fix

`main.js` imports and wires the owning modules once. Universal settings ownership now initializes before personal-wording mounting, and the logo controller uses its full existing search and builder wiring. Content search uses `content-search.js` to keep the complete match total separate from the visible sixty-result cap and to state when the two-second scan stopped early. The converter owns clearing its browser queue.

## How to avoid reintroducing it

Keep each startup call paired with an explicit import from its owner. Keep controller ownership singular. Search status must distinguish zero matches, a complete under-limit result, a capped result, and a time-bounded partial sweep. Do not append exports to an ESM module in a fixture when that module already exports the symbol.

## Verification

Run these focused source-level checks:

```powershell
node --check site/assets/js/main.js
node scripts/test-site-regex-safety.mjs
node scripts/test-site-startup-repair.mjs
```

The focused startup check verifies the module bindings and duplicate-owner removal, then exercises zero, under-limit, over-limit, and time-bounded search results. It does not replace a built-page browser run with an uncaught-page-error assertion; that runtime proof remains required.

## Security considerations

The repair preserves browser-local state boundaries. It adds no network request, no new storage key, and no raw regex construction in the page search controller.
