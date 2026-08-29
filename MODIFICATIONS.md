# Modifications to the imported work

`design/` contains a copy of **Open Design** v0.20.3, licensed under the Apache
License 2.0. The full licence text is at [`design/LICENSE`](design/LICENSE).

- Upstream: <https://github.com/nexu-io/open-design>
- Imported at commit: `05f5b33ef59f078df10ac1125986e00e4a796cf3`
- Import date: 2026-08-25

Apache-2.0 section 4(b) requires prominent notices on files that were changed.
This file is that notice, kept in one place so a reader sees the whole delta
without diffing two repositories.

## This file is enforced, not decorative

`scripts/verify-port.sh` compares every file under `design/` against the pinned
upstream tree and **reads the path list below as its allowlist**. A file that
differs from upstream without an entry here fails verification; an entry here
for a file that no longer differs also fails. The notice and the code cannot
drift apart, because CI checks that they agree.

Paths are relative to `design/` and are written as `` - `path/to/file` `` under
the **Changed files** heading of an entry.

## Import

Copied byte-for-byte from the pinned submodule: all 12,835 files match the
upstream blob ids exactly, file modes included.

## Changes

### 2026-08-29 - Repair installed launch and embed the product icon

**Reason:** the unsigned Squirrel package disabled electron-builder's combined
signing and executable-resource mutation path, so the installed executable and
shortcuts inherited the framework's generic icon. The project-owned resource
editor now embeds and verifies the shipped multi-resolution icon without invoking
a signer. The existing Squirrel package identity remains unchanged so upgrades do
not strand a second installation beside the first. The imported manifest had also
restored the hosted packaging machine's absolute namespace root, overriding the
per-user path and preventing the installed package from superseding a stale
launcher payload. Installed configs omit that build-only path again.

**Changed files:**

- `tools/pack/src/win/builder.ts`
- `tools/pack/src/win/manifest.ts`
- `tools/pack/src/win/version-resource.ts`
- `tools/pack/tests/win-builder.test.ts`

### 2026-08-27 - Show version-bound build provenance on every front screen

**Reason:** The packaged onboarding surface could show upstream identity and
provided no trustworthy way to identify the running package before sign-in.
The web shell and documentation site now show the running version before
navigation, settings, About, or authentication, together with the release or
build timestamp formatted in the visitor's local timezone with seconds and a
timezone label. The daemon accepts the timestamp only when it is bound to the
same package version and a 40-character source commit. Missing, malformed, or
calendar-overflow records remain visibly unavailable rather than falling back
to a launch clock. The packaged configuration and sidecar environment carry
externally supplied release provenance values when available, and focused
source regressions cover valid, missing, mismatched, and malformed records. The onboarding identity uses Material
Designer rather than the upstream product name.

**Changed files:**

- `apps/web/src/App.tsx`
- `apps/web/src/components/EntryShell.tsx`
- `apps/web/src/components/FrontScreenProvenance.module.css` (new)
- `apps/web/src/components/FrontScreenProvenance.tsx` (new)
- `apps/web/src/i18n/locales/ar.ts`
- `apps/web/src/i18n/locales/de.ts`
- `apps/web/src/i18n/locales/en.ts`
- `apps/web/src/i18n/locales/es-ES.ts`
- `apps/web/src/i18n/locales/fa.ts`
- `apps/web/src/i18n/locales/fr.ts`
- `apps/web/src/i18n/locales/hu.ts`
- `apps/web/src/i18n/locales/id.ts`
- `apps/web/src/i18n/locales/it.ts`
- `apps/web/src/i18n/locales/ja.ts`
- `apps/web/src/i18n/locales/ko.ts`
- `apps/web/src/i18n/locales/pl.ts`
- `apps/web/src/i18n/locales/pt-BR.ts`
- `apps/web/src/i18n/locales/ru.ts`
- `apps/web/src/i18n/locales/th.ts`
- `apps/web/src/i18n/locales/tr.ts`
- `apps/web/src/i18n/locales/uk.ts`
- `apps/web/src/i18n/locales/zh-CN.ts`
- `apps/web/src/i18n/locales/zh-TW.ts`
- `apps/web/src/lib/front-screen-provenance.ts` (new)
- `apps/web/src/providers/registry.ts`
- `apps/web/tests/components/EntryShell.front-provenance.test.ts` (new)
- `apps/web/tests/lib/front-screen-provenance.test.ts` (new)
- `apps/web/tests/providers/registry.test.ts`
- `apps/daemon/src/app-version.ts`
- `apps/daemon/tests/app-version.test.ts`
- `apps/daemon/tests/version-route.test.ts`
- `apps/packaged/src/config.ts`
- `apps/packaged/src/headless-runtime.ts`
- `apps/packaged/src/index.ts`
- `apps/packaged/src/sidecars.ts`
- `apps/packaged/tests/sidecars.test.ts`
- `packages/contracts/src/api/version.ts`
- `tools/pack/src/config/index.ts`
- `tools/pack/src/win/manifest.ts`

### 2026-08-25 - Restore unsigned Squirrel executable packaging controls

**Reason:** Release run `32831335767` reached electron-builder with a fresh
packaged-app cache entry and invoked `rcedit-x64.exe` to mutate the application
executable's metadata and icon. That process failed with `Fatal error: Unable
to commit changes`. The preceding electron-builder `signing with signtool.exe`
diagnostics describe its executable-processing route, but the failing command
was rcedit, not an Authenticode signing command. A previous upstream-import
restoration had removed the project-owned unsigned controls and short output
mapping while the focused source contracts still required them. Restore the
schema-supported `signAndEditExecutable: false`, executable exclusion,
update-verification setting, and temporary drive mapping. The cache version
advances so a prior unpacked executable cannot mask the repaired producer.

**Changed files:**

- `tools/pack/src/win/builder.ts`

### 2026-08-25 - Replace the packaged startup splash's upstream identity

**Reason:** the real full Squirrel package built from `64e427cd` showed the
upstream mark, Open Design name, and upstream tagline before the Material
Designer application opened. The splash now uses the existing shipped project
vector, Material Designer display name, and factual local-first description.
It retains live boot stages and monotonic progress, adds explicit accessible
identity relationships, and disables dot and transition motion when reduced
motion is requested. The upstream video source is removed so its baked-in
identity cannot return through an opaque binary. Focused tests and a PowerShell
guard enumerate both remaining identity sources, compare the inlined vector to
the canonical SVG, and prove five deliberate regressions turn red before the
restored fixture turns green.

**Changed files:**

- `apps/desktop/src/main/runtime.ts`
- `apps/desktop/src/main/splash-video.ts` (removed)
- `apps/desktop/tests/main/splash-branding.test.ts` (new)

### 2026-08-25 - Restore General Settings tab ownership

**Reason:** Release run `32813607828` reached the exhaustive settings-tab
registry and found that the live General section had no ownership decision.
General is a real dialog-owned panel and navigation destination, so the tab
registry now gives it one definition and one ordered position. A focused
regression ties the definition to the live panel marker and rejects duplicate
General tab entries.

**Changed files:**

- `apps/web/src/components/settings/settingsTabs.ts`
- `apps/web/tests/components/SettingsDialog.tabs.test.tsx`

### 2026-08-25 - Keep Routines translation variables recursive

**Reason:** The Routines failure-label helper accepts the application's canonical
translator, whose interpolation variables may contain deferred translated values.
`RoutinesSection` had narrowed its local translator alias to plain strings and
numbers, so the hosted release type-check rejected its call to that helper. The
alias now derives from `useT`, and a focused source regression prevents the
narrower signature from returning.

**Changed files:**

- `apps/web/src/components/RoutinesSection.tsx`
- `apps/web/tests/components/RoutinesSection.translation-contract.test.ts`

### 2026-08-25 - Keep FileWorkspace translation variables recursive

**Reason:** The Create-page subcategory label helper accepts the application's
real translator, whose interpolation variables may contain deferred translated
values. `FileWorkspace` had narrowed its local translator alias to plain strings
and numbers, so the hosted release type-check rejected the otherwise valid
helper call. The alias now derives from `useT`, and a focused source regression
prevents the narrower signature from returning.

**Changed files:**

- `apps/web/src/components/FileWorkspace.tsx`
- `apps/web/tests/components/FileWorkspace.translation-contract.test.ts`

### 2026-08-25 - Complete Feishu community-link analytics typing

**Reason:** The Chinese entry navigation rail reports its locale-specific
community link as `feishu`, but the shared account-menu analytics contract
accepted only the non-Chinese `discord` value. The mismatch stopped the hosted
release type-check. The contract now represents both real destinations, and a
focused interaction regression verifies the Chinese rail emits `feishu`.

**Changed files:**

- `apps/web/tests/components/EntryNavRail.analytics.test.tsx`
- `packages/contracts/src/analytics/events/workspace.ts`

### 2026-08-25 - Localize the Chinese Feishu community label

**Reason:** The entry navigation rail intentionally sends Simplified and
Traditional Chinese interfaces to the OpenDesign Feishu group, but the typed
locale contract did not define the accessible label requested by that call
site. The missing key stopped the hosted release type-check. Every locale now
keeps a complete dictionary, the two active Chinese variants name Feishu in
their own scripts, and a focused regression pins the locale-sensitive label.

**Changed files:**

- `apps/web/src/i18n/locales/ar.ts`
- `apps/web/src/i18n/locales/de.ts`
- `apps/web/src/i18n/locales/en.ts`
- `apps/web/src/i18n/locales/es-ES.ts`
- `apps/web/src/i18n/locales/fa.ts`
- `apps/web/src/i18n/locales/fr.ts`
- `apps/web/src/i18n/locales/hu.ts`
- `apps/web/src/i18n/locales/id.ts`
- `apps/web/src/i18n/locales/it.ts`
- `apps/web/src/i18n/locales/ja.ts`
- `apps/web/src/i18n/locales/ko.ts`
- `apps/web/src/i18n/locales/pl.ts`
- `apps/web/src/i18n/locales/pt-BR.ts`
- `apps/web/src/i18n/locales/ru.ts`
- `apps/web/src/i18n/locales/th.ts`
- `apps/web/src/i18n/locales/tr.ts`
- `apps/web/src/i18n/locales/uk.ts`
- `apps/web/src/i18n/locales/zh-CN.ts`
- `apps/web/src/i18n/locales/zh-TW.ts`
- `apps/web/src/i18n/types.ts`
- `apps/web/tests/components/EntryNavRail.community-label.test.ts`

### 2026-08-25 - Preserve project changes across the v0.20.3 baseline

**Reason:** Advancing the pinned upstream tree to commit
`05f5b33ef59f078df10ac1125986e00e4a796cf3` retained 89 project-owned
versions of upstream paths and eight project-only packaging support files.
The deterministic preservation inventory records each local mode and blob,
the corresponding upstream mode and blob where one exists, and the Git
commit that owns the retained version. Raw checkout-byte drift was restored
from the pinned blobs only after the index equality preflight proved that no
committed project change could be overwritten.

**Changed files:**

- `.github/config/scopes.json`
- `.github/scripts/scopes.py`
- `.github/workflows/ci.yml`
- `.gitignore`
- `apps/AGENTS.md`
- `apps/daemon/src/runtimes/defs/mimo.ts`
- `apps/daemon/src/runtimes/opencode-log.ts`
- `apps/daemon/tests/agent-session-resume.test.ts`
- `apps/desktop/tests/main/base-href-precedence.test.ts`
- `apps/desktop/tests/main/export-title-replacement-patterns.test.ts`
- `apps/desktop/tests/main/save-print-ready-document-as-pdf.test.ts`
- `apps/landing-page/app/_components/go-banner.astro`
- `apps/landing-page/app/_components/header.tsx`
- `apps/landing-page/app/_components/locale-switcher-script.astro`
- `apps/landing-page/app/_components/pricing-individual-plans.astro`
- `apps/landing-page/app/_components/sub-page-layout.astro`
- `apps/landing-page/app/_lib/pricing-content.ts`
- `apps/landing-page/app/_lib/pricing-current-plan.ts`
- `apps/landing-page/app/_lib/pricing-team-content.ts`
- `apps/landing-page/app/_lib/pricing.ts`
- `apps/landing-page/app/i18n.ts`
- `apps/landing-page/app/pages/community/events/index.astro`
- `apps/landing-page/app/pages/community/open-design-hong-kong-workshop/index.astro`
- `apps/landing-page/app/pages/community/open-design-osaka-meetup/index.astro`
- `apps/landing-page/app/pages/community/open-design-shanghai-workshop/index.astro`
- `apps/landing-page/app/pages/index.astro`
- `apps/landing-page/app/pages/pricing/index.astro`
- `apps/landing-page/tests/go-banner.test.ts`
- `apps/landing-page/tests/header-download-cta.test.ts`
- `apps/landing-page/tests/home-campaign-banner.test.ts`
- `apps/landing-page/tests/pricing-contract.test.ts`
- `apps/packaged/AGENTS.md`
- `apps/web/src/campaigns/go-plan-content.ts`
- `apps/web/src/campaigns/go-plan.ts`
- `apps/web/src/components/AmrLowBalanceDialog.module.css`
- `apps/web/src/components/UpdaterPopup.module.css`
- `apps/web/tests/analytics/export-error-code.test.ts`
- `apps/web/tests/campaigns/deepseek-v4-flash-modal.test.tsx`
- `apps/web/tests/campaigns/deepseek-v4-flash-ui-contract.test.ts`
- `apps/web/tests/campaigns/deepseek-v4-flash.test.ts`
- `apps/web/tests/campaigns/go-plan.test.ts`
- `apps/web/tests/components/EntryNavRail.credits-zero-balance.test.tsx`
- `apps/web/tests/components/EntryNavRail.updater-after-avatar.test.tsx`
- `apps/web/tests/components/FileViewer.manual-edit-history.test.tsx`
- `apps/web/tests/components/FileViewer.manual-edit.test.tsx`
- `apps/web/tests/components/InlineModelSwitcher.unlimited-badge.test.tsx`
- `apps/web/tests/components/MessageCenter.test.tsx`
- `apps/web/tests/runtime/amr-unlimited-models.plan-tier.test.ts`
- `apps/web/tests/runtime/preview-observability-bridge.test.ts`
- `apps/web/tests/runtime/srcdoc-deck-bridge-framework-deck.test.ts`
- `apps/web/tests/runtime/srcdoc.test.ts`
- `design-templates/ib-pitch-book/example.html`
- `e2e/tests/packaged-smoke-workflow.test.ts`
- `e2e/tests/pricing-unlimited-models.test.ts`
- `e2e/tests/scripts/scopes.test.ts`
- `e2e/ui/amr-onboarding.test.ts`
- `plugins/_official/examples/ib-pitch-book/example.html`
- `specs/current/ci.md`
- `tools/pack/src/cache.ts`
- `tools/pack/src/config/index.ts`
- `tools/pack/src/launcher-runtime-snapshot.ts`
- `tools/pack/src/lock.ts`
- `tools/pack/src/mac-prebundle.ts`
- `tools/pack/src/resources.ts`
- `tools/pack/src/update-cache-lifecycle-snapshot.ts`
- `tools/pack/src/versions.ts`
- `tools/pack/src/win-prebundle.ts`
- `tools/pack/tests/mac-paths.test.ts`
- `tools/pack/tests/node-pty-runtime.test.ts`
- `tools/pack/tests/package-source-hash.test.ts`
- `tools/pack/tests/web-sourcemaps.test.ts`
- `tools/pack/tests/win-app.test.ts`
- `tools/pack/tests/win-custom-installer.test.ts`
- `tools/pack/tests/win-registry.test.ts`
- `tools/pack/tests/win-removal-plan.test.ts`
- `tools/pack/tests/win-resources.test.ts`
- `tools/pack/tests/win-size-index.test.ts`
- `tools/pack/tests/workspace-build.test.ts`
- `tools/pack/tsconfig.tests.json`
- `tools/pack/vitest.config.ts`


### 2026-08-25 - Intercept controlled Settings-tab locks before selection

**Reason:** The reusable Settings tab strip now keeps locked direct and overflow
entries activation-capable while intercepting their protected section action. It
opens the existing anchored authentication prompt for the configured six-policy
contract, invokes the original action only after successful authentication, and
restores focus on completion or cancellation. Focused source tests cover direct,
keyboard, overflow, manual-PIN, cancellation, focus-return, and every-policy
paths. The live Settings dialog now mounts the strip with permission-filtered
tabs, its anchored search field, and one controlled selection callback. Because
Settings does not own a credential backend yet, it supplies an empty lock map
and a verifier that always refuses any externally introduced lock instead of
silently accepting it.

**Changed files:**

- `apps/web/src/components/settings/SettingsTabStrip.tsx`
- `apps/web/src/components/SettingsDialog.tsx`
- `apps/web/tests/components/SettingsTabStrip.toy-lock.test.tsx`

### 2026-08-25 - Complete Handoff workspace-tab title and icon mappings

**Reason:** Release run `32814288407` reached the exhaustive workspace-tab
display mappings and found that the Handoff route had neither a title row nor
an icon row. The tab display now uses the existing `handoff.title` localization
key and the existing `layers-filled` Handoff icon. A focused source contract
derives every `EntryHomeView` from the router, requires exact title and icon
coverage, and proves deliberate Handoff-row removal turns the contract red.
Hosted replacement verification and installed interaction remain pending.

**Changed files:**

- `apps/web/src/components/WorkspaceTabsBar.tsx`
- `apps/web/tests/components/WorkspaceTabsBar.entry-titles.test.ts`

### 2026-08-24 — Add the desktop toy-lock policy core and authentication prompt

**Reason:** The desktop renderer needs one bounded, reusable authorization core
before visible per-element lock controls can be wired safely. The new pure
TypeScript module defines the six supported factor policies, normalizes keypad
and manual PIN entry through one validator, maintains one bounded attempt
budget, and intercepts activation of locked targets without invoking their
protected action. A reusable anchored non-modal component renders those policies,
provides the two PIN entry paths, exposes factor and attempt progress, preserves
cancel and focus behavior across asynchronous verification, and calls its final
authorization callback only after every required factor passes. Focused source
tests pin those boundaries. Credential storage, QR registration, context-menu
wiring, app-wide mounting, and packaged proof remain unimplemented.

**Changed files:**

- `apps/web/src/security/toy-lock-core.ts`
- `apps/web/src/components/ToyLockAuthenticationPopover.module.css`
- `apps/web/src/components/ToyLockAuthenticationPopover.tsx`
- `apps/web/tests/components/ToyLockAuthenticationPopover.test.tsx`
- `apps/web/tests/security/toy-lock-core.test.ts`

### 2026-08-25 - Add the persistent Settings toy-lock host boundary

**Reason:** Settings-tab toy locks need a main-process-owned credential and
attempt-state boundary before a visible configuration surface can safely create
them. This change adds an exact target and policy protocol, an optional narrow
preload namespace, exact main-window main-frame validation, and a bounded
versioned store. One protected credential envelope contains every independent
salted resource-bounded asynchronous scrypt digest, salt, and TOTP secret.
Non-secret metadata stays separate and publishes through recoverable
generations; two-step TOTP enrollment requires a current code before activation.
Attempts and cooldowns survive restart, concurrent mutations are bounded, stale revisions and
unknown targets fail closed, and no secret material or local path crosses the
bridge. The live renderer remains deliberately unwired until the configuration
and pairing surfaces exist.

**Changed files:**

- `packages/host/src/protocol.ts`
- `packages/host/src/index.ts`
- `packages/host/src/detection.ts`
- `packages/host/tests/index.test.ts`
- `apps/desktop/src/main/toy-lock-store.ts`
- `apps/desktop/src/main/runtime.ts`
- `apps/desktop/src/main/preload.cts`
- `apps/desktop/tests/main/toy-lock-store.test.ts`
- `apps/desktop/tests/main/toy-lock-host-boundary.test.ts`

### 2026-08-21 — Remove the artifact-upgrade upsell dialog entirely

**Reason:** The AMR artifact-upgrade surface was a nagging promotional gate:
it interrupted chat sends with a limited-time discount dialog, planted an
"upgrade" card in the home recommendation slot, and shipped countdown pressure
across every locale. The user asked for it removed completely. This change
deletes the gate, dialog, home card, runtime helper, all wiring through App,
ProjectView, EntryView, EntryShell and HomeView, every locale string, and the
feature's own tests. Chat sends now proceed directly with no upsell step.

**Changed files:**

- `apps/web/src/App.tsx`
- `apps/web/src/components/AmrArtifactUpgradeDialog.module.css`
- `apps/web/src/components/AmrArtifactUpgradeDialog.tsx`
- `apps/web/src/components/AmrArtifactUpgradeGate.tsx`
- `apps/web/src/components/AmrArtifactUpgradeHomeCard.module.css`
- `apps/web/src/components/AmrArtifactUpgradeHomeCard.tsx`
- `apps/web/src/components/ProjectView.tsx`
- `apps/web/src/i18n/locales/ar.ts`
- `apps/web/src/i18n/locales/de.ts`
- `apps/web/src/i18n/locales/en.ts`
- `apps/web/src/i18n/locales/es-ES.ts`
- `apps/web/src/i18n/locales/fa.ts`
- `apps/web/src/i18n/locales/fr.ts`
- `apps/web/src/i18n/locales/hu.ts`
- `apps/web/src/i18n/locales/id.ts`
- `apps/web/src/i18n/locales/it.ts`
- `apps/web/src/i18n/locales/ja.ts`
- `apps/web/src/i18n/locales/ko.ts`
- `apps/web/src/i18n/locales/pl.ts`
- `apps/web/src/i18n/locales/pt-BR.ts`
- `apps/web/src/i18n/locales/ru.ts`
- `apps/web/src/i18n/locales/th.ts`
- `apps/web/src/i18n/locales/tr.ts`
- `apps/web/src/i18n/locales/uk.ts`
- `apps/web/src/i18n/locales/zh-CN.ts`
- `apps/web/src/i18n/locales/zh-TW.ts`
- `apps/web/src/i18n/types.ts`
- `apps/web/src/runtime/amr-artifact-upgrade.ts`
- `apps/web/tests/components/AmrArtifactUpgradeDialog.test.tsx`
- `apps/web/tests/components/AmrArtifactUpgradeGate.test.tsx`
- `apps/web/tests/components/AmrArtifactUpgradeHomeCard.test.tsx`
- `apps/web/tests/components/App.amr-plan-tier.test.tsx`
- `apps/web/tests/components/App.update-dialog.test.tsx`
- `apps/web/tests/runtime/amr-artifact-upgrade.test.ts`
- `e2e/ui/amr-artifact-upgrade-gate.test.ts`

### 2026-08-21 — Close Library partial-delete, snapshot, picker, and accessibility gaps

**Reason:** The production Library route still had several source-level gaps at
the seams between the browser and daemon: mutable offset pages could repeat or
skip rows while ingest changed the collection; owned-byte deletion removed the
database row after a failed unlink; full loads and targeted SSE work had separate
freshness domains; picker callbacks had no structured partial result; and busy,
preview, menu, batch-progress, focus, geometry, and 48px boundaries were not
enforced consistently. This repair adds the point-in-time keyset cursor,
bounded/abort-aware worker pool, structured ledgers and retry-preserving UI,
bounded unlink retries with sidecar residue reporting, frozen picker controls,
visible projection navigation, measured menu placement, current-batch progress,
and focused negative source contracts. No build, package-manager, app runtime,
or local test command was run; hosted verification remains pending.

**Changed files:**

- `apps/daemon/src/library-store.ts`
- `apps/daemon/src/routes/library.ts`
- `apps/web/src/components/HomeHero.tsx`
- `apps/web/src/components/LibraryPicker.module.css`
- `apps/web/src/components/LibrarySection.module.css`
- `apps/web/src/components/regex/RegexSearchField.tsx`
- `apps/web/src/lib/confirm-delete.ts`
- `apps/web/tests/library-route-and-search.contract.test.ts`
- `packages/contracts/src/api/library.ts`
### 2026-08-21 — Converge shared shell geometry and tab controls

**Reason:** The shared shell had duplicate declarations that allowed a legacy
two-row routine to override the title, tab and status geometry, a malformed
entry rail stylesheet, and a tab component with duplicated render fragments.
The repair makes the four shell rows explicit, keeps scale-aware dimensions,
removes the inline rail width, restores one-icon/one-label rail anatomy, adds a
localized version segment to the status strip, and replaces the tab context
menu's unbounded group list with a bounded field-owned searchable picker. The
source guard records the negative regression for row ownership and CSS balance;
hosted build and visual evidence remain pending.
### 2026-08-21 — Add the source handoff registry route

**Reason:** The design-reference work needed a genuine, read-only `/handoff`
surface that agents can address and export without reusing the existing website
archive or conversation handoff. The source registry is intentionally explicit:
18 Material Design 3 token mappings and 12 component owners, two independent
regex fields, keyboard/range selection, faithful exports and a negative contract
guard. Runtime parity and installed captures remain unverified.
### 2026-08-21 — Add a real deterministic Studio capture fixture

**Reason:** The checked-in parity inventory names a Studio screen, but the
production application had no safe way to resolve its deterministic
`material-designer://studio` address. This source-only lane adds a strict,
public-safe fixture provider that feeds the existing project, conversation,
message, run, project-file, tab, and live-artifact API seams. The desktop owns
the launch envelope and the renderer accepts only the canonical `od://`
project/conversation/file route, so the existing `ProjectView`, `ChatPane`,
`FileWorkspace`, and `FileViewer` components render the state. The fixture
provider is active only for the exact frozen tuple and the desktop-owned
capture witness, intercepts only declared fixture `/api/` requests, leaves
same-origin bundled assets on the normal fetch path, accepts validated loopback
API origins, blocks external network requests, and keeps the declared file
selection one-shot while binding the provider to the fixture project and
conversation across known file switches. It publishes route/provider witnesses
for the desktop readiness receipt, supplies a direct-loadable live-artifact
preview, and disables analytics/error buffers for the capture lifetime.
The follow-up hardens that boundary with a per-run capture identity, finite
message/version IDs, exact project/conversation and live-artifact scopes,
explicit Vela/AMR/version/media boot consumers, capture-owned appearance and
language values, suppressed config/provider writes, bounded text preview, and a
reload-keyed direct artifact preview. Ordinary routes retain their existing
provider and selection behavior. Hosted
typecheck, built rendering, and installed capture evidence remain pending.

**Changed files:**

- `apps/web/src/App.tsx`
- `apps/web/src/components/AppStatusBar.module.css`
- `apps/web/src/components/AppStatusBar.tsx`
- `apps/web/src/components/WorkspaceTabsBar.module.css`
- `apps/web/src/i18n/locales/en.ts`
- `apps/web/src/i18n/locales/zh-TW.ts`
- `apps/web/src/i18n/types.ts`
- `apps/web/src/styles/home/entry-layout.css`
- `apps/web/src/styles/shell.css`
- `apps/web/src/styles/viewer/routines.css`
- `apps/web/tests/components/WorkspaceTabsBar.shell-contract.test.ts`

### 2026-08-21 — Complete Library pagination, refresh, filters, and modal behavior

**Reason:** Enabling the production Library exposed several boundaries that were
previously unreachable: the first page could hide assets from explicit regex
search, failed refreshes erased a loaded view, reconciliation did not tell other
open views to refresh, and the native filters, handoff menu, picker, and modal
surfaces lacked their own searchable or shared focus behavior. The repair adds
bounded continuation with a typed provider failure result, preserves loaded rows
on errors with a localized retry surface, broadcasts reconciliation SSE, gives
kind/source/design-system/picker searches independent anchored builders, limits
bulk selection to visible matching ids, keeps the collapsed rail operable, and
uses the shared dialog focus scope while upload work is pending. No fixture cards,
catalog photos, or release assets were added; hosted/runtime verification remains
pending.

The continuation parser now accepts only omitted/`null` terminal cursors or
non-negative safe JSON numbers; coercible strings and other malformed values are
rejected. Library page walks carry abort and generation identity so stale rows and
errors cannot overwrite a newer view. Element filtering remains open to both
image and HTML snapshots marked with `metadata.element`, while kind chips use an
`aria-pressed` group and menu/listbox search fields remain outside their owned
interactive roles. Manual uploads use cancellable XHR request progress, byte-
weighted aggregate progress, the shared byte limit for pasted text, and visible
partial outcomes. These source contracts remain unverified until the hosted app
checks run.

**Changed files:**

- `apps/daemon/src/library-store.ts`
- `apps/daemon/src/routes/library.ts`
- `apps/web/src/components/LibraryPicker.module.css`
- `apps/web/src/components/LibraryPreviewModal.module.css`
- `apps/web/src/components/LibrarySection.module.css`
- `apps/web/src/components/LibraryUploadModal.module.css`
- `apps/web/src/components/regex/RegexSearchField.module.css`
- `apps/web/src/components/command-palette/commands.ts`
- `apps/web/src/components/command-palette/settingsIndex.ts`
- `apps/web/src/i18n/locales/en.ts`
- `apps/web/src/i18n/locales/zh-TW.ts`
- `apps/web/src/i18n/types.ts`
- `apps/web/tests/components/LibrarySection.a11y.test.tsx`
- `apps/web/tests/components/LibrarySection.delete-gate.test.tsx`
- `apps/web/tests/components/library-picker-perf.test.tsx`
- `apps/web/tests/components/library-section-perf.test.tsx`
- `apps/web/tests/library-route-and-search.contract.test.ts`
- `packages/contracts/src/api/library.ts`
- `packages/components/src/dialog.tsx`

### 2026-08-21 — Expose the production Library route and own its regex search

**Reason:** The real LibrarySection and its provider/API boundary already existed,
but a release flag hid the destination from `/library` and the normal navigation
rail. The route is now enabled, the rail and workspace analytics recognize it,
and focused source contracts cover route recognition, buildPath, rail reachability,
real component mounting, and the hidden-flag regression. LibrarySection's search
now owns one `useRegexSearch` controller and adjacent `RegexSearchField`: plain
text remains the default, regex mode stays local to the loaded asset records,
bounded matching is shared with the existing regex implementation, and the
screen-reader status reports the visible result count. No fixture data or catalog
image was added; deterministic capture-fixture status remains pending until a
  provider/API-backed public-safe record set is available. The kind/source filters
  and design-system action menu now have their own local search and anchored builder,
  and the focused contract keeps those surfaces from regressing to native controls
  or shared hidden state.

**Changed files:**

- `apps/web/src/components/LibrarySection.module.css`
- `apps/web/src/components/command-palette/commands.ts`
- `apps/web/src/features/libraryUi.ts`
- `apps/web/tests/components/EntryNavRail.library.test.tsx`
- `apps/web/tests/components/LibrarySection.a11y.test.tsx`
- `apps/web/tests/design-system-asset-dropzone.test.tsx`
- `apps/web/tests/library-route-and-search.contract.test.ts`
- `apps/web/tests/router-marketplace.test.ts`
- `packages/contracts/src/analytics/events/workspace.ts`
### 2026-08-21 — Make Appearance theme readiness compatible and recoverable

**Reason:** The Appearance follow-up exposed two classes of source-only failure:
legacy hosts could expose a fire-and-forget theme setter without proving native
readiness, and renderer recovery could reveal a reloaded document without
re-running that proof. The same pass repairs the settings flex flow and tab
ownership, keeps permission-hidden Workspace out of discovery, preserves stable
tab descriptions and selected-tab contrast, exposes the colour field's live
two-dimensional value, keeps hit wrappers at 48px, and wraps unsupported or
translated rows at narrow and bilingual layouts.
The handoff export projection now passes through the registry's exact runtime
validators instead of asserting a broad string record into a narrower schema;
focused regressions prove complete rows pass and incomplete rows fail closed.

**Changed files:**

- `apps/desktop/src/main/preload.cts`
- `apps/desktop/src/main/runtime.ts`
- `apps/desktop/tests/main/appearance-theme-bridge.test.ts`
- `apps/web/src/components/SettingsDialog.tsx`
- `apps/web/src/components/command-palette/CommandPalette.tsx`
- `apps/web/src/components/command-palette/commands.ts`
- `apps/web/src/components/appearance/AppearanceControls.module.css`
- `apps/web/src/components/appearance/InfiniteColorPicker.module.css`
- `apps/web/src/components/appearance/InfiniteColorPicker.tsx`
- `apps/web/src/components/settings/SettingsTabStrip.tsx`
- `apps/web/src/components/settings/SettingsTabs.module.css`
- `apps/web/src/components/settings/settingsTabs.ts`
- `apps/web/src/state/appearance.ts`
- `apps/web/src/styles/workspace/mention-home.css`
- `apps/web/tests/components/AppearanceEditor.test.tsx`
- `apps/web/tests/components/appearance-follow-up-contract.test.ts`
- `apps/web/tests/components/CommandPalette.settings-index.test.ts`
- `apps/web/tests/components/SettingsDialog.tabs.test.tsx`
- `apps/web/tests/state/appearance.test.ts`
- `packages/host/src/detection.ts`
- `packages/host/src/index.ts`
- `packages/host/src/protocol.ts`
- `packages/host/src/testing.ts`
- `packages/host/tests/index.test.ts`
- `apps/web/src/router.ts`
- `apps/web/src/components/SettingsDialog.tsx`
- `apps/web/src/components/command-palette/CommandPalette.tsx`
- `apps/web/src/components/command-palette/settingsIndex.ts`
- `apps/web/src/components/settings/settingsTabs.ts`
- `apps/web/src/components/handoff/HandoffView.module.css`
- `apps/web/src/components/handoff/HandoffView.tsx`
- `apps/web/src/components/handoff/export.ts`
- `apps/web/src/components/handoff/registry.ts`
- `apps/web/src/components/handoff/selection.ts`
- `apps/web/src/components/regex/RegexSearchField.tsx`
- `apps/web/src/i18n/locales/ar.ts`
- `apps/web/src/i18n/locales/de.ts`
- `apps/web/src/i18n/locales/en.ts`
- `apps/web/src/i18n/locales/es-ES.ts`
- `apps/web/src/i18n/locales/fa.ts`
- `apps/web/src/i18n/locales/fr.ts`
- `apps/web/src/i18n/locales/hu.ts`
- `apps/web/src/i18n/locales/id.ts`
- `apps/web/src/i18n/locales/it.ts`
- `apps/web/src/i18n/locales/ja.ts`
- `apps/web/src/i18n/locales/ko.ts`
- `apps/web/src/i18n/locales/pl.ts`
- `apps/web/src/i18n/locales/pt-BR.ts`
- `apps/web/src/i18n/locales/ru.ts`
- `apps/web/src/i18n/locales/th.ts`
- `apps/web/src/i18n/locales/tr.ts`
- `apps/web/src/i18n/locales/uk.ts`
- `apps/web/src/i18n/locales/zh-CN.ts`
- `apps/web/src/i18n/locales/zh-HK.ts`
- `apps/web/src/i18n/locales/zh-TW.ts`
- `apps/web/src/i18n/funny/en.ts`
- `apps/web/src/i18n/funny/zh-HK.ts`
- `apps/web/src/i18n/types.ts`
- `apps/web/tests/components/handoff/HandoffView.test.tsx`
- `apps/web/tests/components/handoff/contract.test.ts`
- `apps/web/tests/components/handoff/export.test.ts`
- `apps/web/tests/components/handoff/registry.test.ts`
- `apps/web/tests/components/settings-handoff.test.ts`
- `apps/web/tests/router-handoff.test.ts`

### 2026-08-21 — Acknowledge native Appearance theme application

**Reason:** The native theme bridge previously accepted a fire-and-forget message, so
the renderer could report a mounted application before the desktop shell had accepted
the persisted theme. The bridge now returns a bounded action result, the desktop
startup witness waits for that acknowledgement, and a timeout or rejection becomes an
honest self-contained startup failure. Browser-only and older hosts keep the local DOM
theme path. The Appearance settings page also keeps an explicit Workspace ownership
decision, normalizes its typed route when switching tabs, wraps full search context,
focuses the labelled page landmark, and keeps all interactive hit areas at 48px.

**Changed files:**

- `packages/host/src/detection.ts`

### 2026-08-21 — Make the Appearance settings route addressable

**Reason:** The Appearance panel was implemented but its section token was normalized into
an unlisted General section, so the real controls could not be reached from the tab strip or
from a direct settings URL. The route now carries a typed `appearance` subsection for
`/settings/appearance`, while `/settings` keeps its ordinary settings entry behavior. The
Appearance panel is the sole owner of its real controls, including the persisted System,
Light and Dark theme selector, and the former General children retain their own reachable
sections instead of being folded into a duplicate navigation branch.

**Changed files:**

- `apps/web/src/router.ts`
- `apps/web/src/state/appearance.ts`
- `apps/web/tests/router.test.ts`

### 2026-08-21 — Complete Appearance accessibility and theme ownership

**Reason:** The reachable Appearance surface still carried stale light-only
assumptions in its tests and native startup path. This repair gives every
supported locale explicit Appearance and System / Light / Dark labels, makes
the direct page name and focus behavior valid, removes the retired global tab
selector cascade, shares one roving radio-group behavior across appearance
choices, keeps every visible settings tab restorable, canonicalizes malformed
current-version themes, and validates the renderer-to-native theme bridge.

**Changed files:**

- `apps/desktop/src/main/appearance-theme.ts`
- `apps/desktop/tests/main/appearance-theme-bridge.test.ts`
- `apps/web/src/components/appearance/RovingRadioGroup.tsx`
- `apps/web/tests/components/appearance/RovingRadioGroup.test.tsx`
- `apps/web/tests/components/SettingsDialog.search-removed.test.tsx`
- `apps/web/tests/components/theme-settings-removed.test.tsx`
### 2026-08-21 — Make project context and portalled composer controls accessible

**Reason:** the portalled composer hid its project context chip, the mention
categories used fixed ids and mouse-only tab movement, and toolbox resources
communicated selection only through styling. The repair keeps project context
visible in the actual fixed layer while file and browser context remain
explicit-only, gives every composer an instance-owned accessibility namespace,
adds tabpanel/listbox relationships with roving keyboard tabs, exposes resource
selection as `menuitemcheckbox`, and announces only localized context deltas in
a polite live region. A shared workspace-kind helper now localizes the labels
through existing locale/funny-level paths without altering user paths or names.
Focused source/component checks cover the negative fixed-id and hardcoded-label
boundaries, plus the live-region contract. Hosted build, runtime interaction
and capture evidence remain pending.

**Changed files:**

- `apps/web/src/components/HomeHero.tsx`
- `apps/web/src/styles/chat.css`
- `apps/web/tests/components/ChatComposer.context-pickers.test.tsx`

### 2026-08-21 — Remove stale implicit file-context contracts after reconciliation

**Reason:** source reconciliation left `FileWorkspace` with an obsolete callback
that rebuilt the composer's implicit context from the active file or tab, while
its visual regression tests still expected a removed active-file chip and CSS
rule. The workspace now keeps the complete context collection for explicit `@`
selection, quick switching and toolbox actions, while `ProjectView` remains the
sole owner of the stable project context. Exact source assertions protect both
the callback and selector removal. This is source-level work; hosted build,
runtime interaction and capture evidence remain pending.

**Changed files:**

- `apps/web/tests/components/ChatComposer.context-pickers.test.tsx`
- `apps/web/tests/components/FileWorkspace.test.tsx`
- `apps/web/tests/styles/workspace-tabs-chrome.test.ts`

### 2026-08-21 — Keep automatic composer context project-only after source reconciliation

**Reason:** a later source reconciliation reintroduced an orphaned active-file name and
the obsolete file-mode styling path into the chat composer. The composer now accepts only
the host's `project` context implicitly, so changing a visible file or browser tab cannot
change the next project-wide send. File and browser context remain available through
explicit `@` selection, toolbox actions, uploads and attachments. Direct component
regressions cover the file-only active state, explicit file selection, folder-imported
mounting and stable project context across viewer-tab changes; an exact source check keeps
the removed identifiers and mode class from returning. This lane contains no hosted build,
runtime interaction or capture verdict.

**Changed files:**

- `apps/web/src/styles/chat.css`
- `apps/web/src/styles/viewer/routines.css`
- `apps/web/tests/components/ChatComposer.context-pickers.test.tsx`
- `apps/web/tests/components/ChatComposer.search.test.tsx`
### 2026-08-21 — Make complete project ZIP handoffs deterministic and editor-ready

**Reason:** The project-level handoff could only be reached through an active-file
export path, streamed source mtimes into ZIP metadata, and gave the receiving tool
no omission ledger or byte/hash receipt. The complete-project action now prepares a
validated, deterministic ZIP even for an empty project, explicitly omits sensitive
paths, redacts bounded local paths in text, records per-entry lengths and SHA-256
values, streams the staged bytes with cancellation/progress, and opens the exact
staged archive through the selected editor without substituting a missing preference.
The desktop scaffold target remains a separate export. Shared Markdown escaping and
source/component/route regressions pin the boundaries; hosted runtime evidence remains
separate.

**Changed files:**

- `packages/contracts/src/api/export-safety.ts`
- `packages/contracts/src/api/data-export.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/tests/export-safety.test.ts`
- `apps/daemon/src/projects.ts`
- `apps/daemon/src/data-export/serialize.ts`
- `apps/daemon/src/data-export/archive.ts`
- `apps/daemon/src/design-systems/index.ts`
- `apps/daemon/src/desktop-scaffold.ts`
- `apps/daemon/src/import-export-routes.ts`
- `apps/daemon/src/server.ts`
- `apps/daemon/src/routes/editor.ts`
- `apps/daemon/tests/project-archive.test.ts`
- `apps/web/src/lib/history/export.ts`
- `apps/web/src/components/ProjectArchiveAction.tsx`
- `apps/web/src/components/ProjectView.tsx`
- `apps/web/src/runtime/exports.ts`
- `apps/web/src/styles/design-system-flow.css`
- `apps/web/src/styles/viewer/routines.css`
- `apps/web/tests/components/HandoffButton.test.tsx`
- `apps/web/tests/components/ProjectArchiveAction.test.tsx`
- `apps/web/tests/runtime/exports.test.ts`
- `apps/web/tests/runtime/ProjectArchiveZipValidation.test.ts`
### 2026-08-21 — Add a fail-closed deterministic production parity route

**Reason:** The parity registry described `material-designer://` routes, but
the installed desktop entry did not parse or carry those tuples into the real
renderer. The desktop now accepts the route only in explicit developer/capture
mode, rejects missing or duplicate route arguments, validates every v2 tuple
field and query boundary, maps only semantically owned destinations to the
existing web router, and reports stable blockers for the four rows that still
need product-owned destinations. The preload-time capture context freezes
clock/randomness/motion and applies the requested locale before the first
document. Capture uses an isolated session, allows only the exact accepted
`od://` route through both main-frame navigation events, rejects external
navigation, validates the exact loopback sidecar origin, blocks redirects, and
returns a stable refusal from screenshot/capture RPCs until readiness is true.
All capture operations share one readiness/receipt/revealed predicate, and
renderer operations have bounded timeouts that invalidate the receipt. Readiness evaluations have bounded
main-process timeouts, require a renderer-owned capture-settled witness after
daemon/config/onboarding/cloud-identity decisions, recheck the route across a
stability interval, and keep live content hidden behind a self-contained
capture-failure splash when they fail. Capture startup uses a separate
user-data namespace and bypasses ordinary existing-window/single-instance
handoff. Each launch receives a validated unique run identity, an exact
exclusive lease, and an evidence-retention retirement marker; the run id is
also embedded in the sidecar namespace, stamps, IPC paths, and session
partition. Lexical containment checks lstat every existing component and
retirement is serialized and idempotent. Capture sidecars clear telemetry,
provider, update, and proxy egress environment, force manual redirects and
credential-free loopback final origins, and readiness remains false until that
audit is explicitly proven. The terminal readiness receipt comes from the canonical URL/search,
renderer-owned route witness, real component invariant, fixture source and
network proof. The renderer adds only witnesses from its actual router state;
it does not receive replacement DOM or a second screen implementation. Capture
remains unready until a real deterministic fixture/provider and capture-aware
sidecars exist.

**Changed files:**

- `apps/desktop/src/main/deterministic-parity-route.ts`
- `apps/desktop/src/main/deterministic-capture-prelude.ts`
- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/main/runtime.ts`
- `apps/desktop/tests/main/deterministic-capture-boundary.test.ts`
- `apps/desktop/tests/main/deterministic-parity-route.test.ts`
- `apps/daemon/src/routes/vela.ts`
- `apps/daemon/src/capture-boundary.ts`
- `apps/daemon/src/server.ts`
- `apps/daemon/tests/capture-boundary.test.ts`
- `apps/daemon/tests/capture-network-policy.test.ts`
- `apps/daemon/src/sidecar/capture-network-policy.ts`
- `apps/daemon/src/sidecar/index.ts`
- `apps/daemon/src/sidecar/server.ts`
- `apps/packaged/tests/protocol.test.ts`
- `apps/packaged/src/capture-run.ts`
- `apps/packaged/src/config.ts`
- `apps/packaged/src/index.ts`
- `apps/packaged/src/protocol.ts`
- `apps/packaged/src/sidecars.ts`
- `apps/packaged/src/payload-desktop-launch.ts`
- `apps/web/sidecar/capture-network-policy.ts`
- `apps/web/sidecar/index.ts`
- `apps/web/sidecar/server.ts`
- `apps/web/src/App.tsx`
### 2026-08-21 — Close FileViewer menu completion and ownership gaps

**Reason:** The FileViewer menu source repair now keeps programmatic Markdown
downloads visible without stealing focus, gives every mounted surface a unique
owner token, returns focus safely when the exact opener is clicked again, closes
mixed surfaces when focus leaves their owner, and clamps measured width and
height to the available viewport. Disabled rows remain visible with their
existing reason while keyboard navigation skips them. Share and Export labels,
portal-aware version-menu checks, inactive Markdown viewers, and the hand-written
inventory now use exact source associations. The focused source checks include
explicit red-then-green mutations for ownership, disabled navigation, mixed
focus, portal boundaries, inactive viewers, row pairing, and invalid regex
feedback. This is source-level evidence only; no installed build or runtime
geometry has been verified here.

**Changed files:**

- `apps/web/src/components/FileViewerMenuSearch.tsx`
- `apps/web/src/styles/viewer/tools.css`
- `apps/web/src/styles/viewer/core.css`
- `apps/web/tests/components/FileViewer.menu-contract.test.ts`
- `apps/web/tests/components/file-viewer-version-download.test.tsx`

### 2026-08-25 - Keep empty FileViewer menu navigation type-safe

**Reason:** The release typecheck correctly rejected relative keyboard navigation
because an indexed action can be absent under strict unchecked-index access, even
after the runtime empty-list return. The focus helper now treats the fallback as
optional, so an empty filtered menu remains a safe no-op while non-empty menus
retain forward, backward and wrapped arrow navigation. A focused regression covers
both the zero-action and populated-action paths. This is source-level evidence;
installed keyboard interaction remains unverified.

**Changed files:**

- `apps/web/src/components/FileViewerMenuSearch.tsx`
- `apps/web/tests/components/FileViewerMenuSearch.focus.test.ts`

### 2026-08-21 — Make FileViewer menus searchable, focusable, and wrap-safe

**Reason:** FileViewer's Download, Share, Present, Zoom, toolbar and version menus
were still unsearchable and did not share one explicit keyboard/focus contract. The
new field-owned menu primitive gives each menu its own plain-text-first search state,
anchored regex builder, localized result status, focus-on-open, arrow/Home/End/Enter
navigation, Escape close-and-clear behaviour, and trigger focus restoration. Existing
menu buttons and handlers remain the action owners; filtering only hides unmatched
items. Share labels and toolbar labels now opt out of the global nowrap/ellipsis
defaults so long bilingual labels wrap without clipping. This is source-level only;
no installed build or runtime geometry has been verified here.

**Changed files:**

- `apps/web/src/components/FileViewerMenuSearch.tsx`
- `apps/web/src/components/regex/RegexSearchField.tsx`
- `apps/web/src/styles/viewer/tools.css`
- `apps/web/src/styles/viewer/core.css`
- `apps/web/tests/components/FileViewer.menu-contract.test.ts`
- `apps/web/app/layout.tsx`
- `apps/web/src/capture/studio-fixture.ts`
- `apps/web/src/components/appearance/store.ts`
- `apps/web/src/components/ProjectView.tsx`
- `apps/web/src/i18n/index.tsx`
- `apps/web/src/router.ts`
- `apps/web/tests/capture/studio-fixture.test.ts`

### 2026-08-21 — Close the Studio capture lifecycle and stale-state seams

**Reason:** The first fixture route correctly bound the happy path, but a malformed
canonical address could still fall through to ordinary fetch, a queryless continuation
could outlive the accepted route, and ordinary tab/configuration/appearance state could
win over the deterministic tuple. This follow-up makes invalid capture-shaped addresses
terminal and unready, keeps the validated per-run session as the only continuation
authority, restores ordinary state on exit, ignores ordinary tab cache and wall-clock
timestamps during capture, and requires the current project/conversation/run witness for
direct artifact previews. Analytics and error-tracking generations now discard stale
async completions before initialization, registration, or context transport. Ordinary
routes keep their prior persistence, fetch, header, and appearance behavior. Hosted
typecheck, built rendering, and installed capture evidence remain pending.

**Changed files:**

- `apps/web/src/App.tsx`
- `apps/web/src/capture/studio-fixture.ts`
- `apps/web/src/components/appearance/store.ts`
- `apps/web/src/i18n/index.tsx`
- `apps/web/src/state/appearance.ts`
- `apps/web/src/router.ts`
- `apps/web/tests/capture/studio-fixture.test.ts`

### 2026-08-21 — Fence Studio lifecycle leases and cache partitions

**Reason:** Refused and accepted capture lifecycles shared too much mutable module
state with ordinary rendering. This repair adds a generation-scoped lifecycle lease,
stateless refusal recognition for reserved `od://` near-misses, post-await request
lease checks, a token-owned fetch wrapper multiplexer, ordinary analytics rehydration,
run/refusal-scoped tab and project caches, lifecycle-scoped app-version loading, and
complete artifact preview identity dependencies. Capture teardown now rehydrates the
ordinary appearance and project display caches. Source-level checks and deliberate
negative-boundary cases are recorded, while hosted typecheck, built rendering, and
installed capture evidence remain pending.

**Changed files:**

- `apps/web/src/App.tsx`
- `apps/web/src/capture/fetch-wrapper-stack.ts`
- `apps/web/src/capture/studio-fixture.ts`
- `apps/web/src/components/ProjectView.tsx`
- `apps/web/src/components/appearance/InfiniteColorPicker.tsx`
- `apps/web/src/components/appearance/presets.ts`
- `apps/web/tests/capture/studio-fixture.test.ts`

### 2026-08-21 — Resolve duplicate desktop update and diagnostics branding

**Reason:** The v0.20.2 source reconciliation left upstream product-name values
immediately after the existing Material Designer values in four object properties. TypeScript
rejects duplicate keys before the desktop build can start, and accepting the later values would
also reverse the fork-owned identity on diagnostics export and update-restart surfaces. The
reconciliation keeps one Material Designer value at each boundary without changing update states,
active-run checks, renderer save preparation, deferred-installer authorization, or quit behavior.
Focused desktop tests pin the diagnostics title, update-menu fallback, and both restart-safety
messages.

**Changed files:**

- `apps/desktop/src/main/diagnostics.ts`
- `apps/desktop/src/main/update-menu.ts`
- `apps/desktop/src/main/update-preflight.ts`
- `apps/desktop/tests/main/diagnostics-save-dialog.test.ts`
- `apps/desktop/tests/main/update-menu.test.ts`
- `apps/desktop/tests/main/update-preflight.test.ts`

### 2026-08-21 — Make agent handoff downloads complete, bounded, and reliable

**Reason:** The first handoff implementation still let a queued Markdown download be
consumed against the previously loaded file, replayed a handled nonce after remount, and
labelled an active-file subfolder ZIP as the complete website handoff. The website action
now requests the whole current project and uses explicit localized copy; Markdown requests
are consumed once per project/file only after the requested bytes load. The generated
desktop shell blocks network and out-of-root file requests, secondary windows, webviews,
non-HTML entry points, case-insensitive scaffold collisions, and project-owned canonical
handoff/manifest collisions. Archive traversal rechecks directory entries before descent,
and the narrow workspace toolbar collapses labels before native overflow chrome can clip
the actions. Focused source regressions cover these boundaries; installed-renderer and
display-scale evidence remains separate.

**Changed files:**

- `apps/daemon/src/projects.ts`
- `apps/daemon/tests/project-archive.test.ts`
- `apps/web/src/i18n/locales/ar.ts`
- `apps/web/src/i18n/locales/de.ts`
- `apps/web/src/i18n/locales/en.ts`
- `apps/web/src/i18n/locales/es-ES.ts`
- `apps/web/src/i18n/locales/fa.ts`
- `apps/web/src/i18n/locales/fr.ts`
- `apps/web/src/i18n/locales/hu.ts`
- `apps/web/src/i18n/locales/id.ts`
- `apps/web/src/i18n/locales/it.ts`
- `apps/web/src/i18n/locales/ja.ts`
- `apps/web/src/i18n/locales/ko.ts`
- `apps/web/src/i18n/locales/pl.ts`
- `apps/web/src/i18n/locales/pt-BR.ts`
- `apps/web/src/i18n/locales/ru.ts`
- `apps/web/src/i18n/locales/th.ts`
- `apps/web/src/i18n/locales/tr.ts`
- `apps/web/src/i18n/locales/uk.ts`
- `apps/web/src/i18n/locales/zh-CN.ts`
- `apps/web/src/i18n/locales/zh-TW.ts`
- `apps/web/src/i18n/types.ts`
- `apps/web/src/styles/workspace/drawer.css`
- `apps/web/tests/components/FileViewer.test.tsx`
- `apps/web/tests/styles/workspace-tabs-chrome.test.ts`

### 2026-08-21 — Consolidate duplicate source imports

**Reason:** An overlapping source integration left several modules imported more than once,
including repeated local bindings that stop TypeScript before it can check the affected files.
Each declaration now preserves the union of its distinct value and type specifiers while naming
its source module only once. A focused source-contract test holds the exact repaired module list
and proves its counter recognizes two declarations independently, so the same merge shape cannot
quietly return.

**Changed files:**

- `apps/web/tests/source-import-consolidation.test.ts`

### 2026-08-21 — Reconcile destructive request and appearance merge boundaries

**Reason:** The v0.20.2 import left several product changes and upstream changes adjacent
instead of combining them, producing duplicate declarations and unreachable function bodies.
The reconciliation keeps the single-use destructive confirmation handshake while carrying
workspace identity through both requests, preserves structured authorization errors and scoped
cache invalidation, restores one Figma import component with its captured workspace context,
retains the Material Design 3 role-based accent alongside both swatch catalogs, and keeps one
pre-hydration appearance script and one project CLI flag registry. Focused contracts now pin the
two-request delete sequence, confirmation-header precedence, workspace headers, cache behavior,
and the uniqueness of every repaired declaration.

**Changed files:**

- `apps/daemon/src/cli.ts`
- `apps/web/app/layout.tsx`
- `apps/web/src/lib/confirm-delete.ts`
- `apps/web/src/state/appearance.ts`
- `apps/web/tests/lib/confirm-delete.test.ts`
- `apps/web/tests/providers/project-workspace-transport-scope.test.ts`
- `apps/web/tests/providers/registry.test.ts`
- `apps/web/tests/state/force-light-theme.test.ts`
- `apps/web/tests/state/projects.test.ts`

### 2026-08-21 — Export a secure desktop application scaffold

**Reason:** Project archives already carried the complete website source, a human-readable
implementation handoff, and a machine-readable design manifest. They now offer an explicit
desktop-scaffold target that adds a minimal, sandboxed Electron shell without claiming to be
an installer or release. The generated main process accepts only the manifest's relative local
entry file, keeps context isolation and the renderer sandbox enabled, exposes no privileged IPC,
and records Squirrel.Windows plus the permanent no-signing boundary for the coding agent that
finishes the application. The HTTP route rejects unknown targets and project-owned scaffold-path
collisions rather than overwriting user content.

**Changed files:**

- `apps/daemon/src/import-export-routes.ts`
- `apps/daemon/src/projects.ts`
- `apps/daemon/tests/project-archive.test.ts`

### 2026-08-21 — Create desktop projects with an explicit scaffold and agent handoff

**Reason:** The desktop target previously existed only as an archive option and a
platform label. Project creation now records an explicit desktop application intent,
materializes a versioned source scaffold from one shared generator, and optionally
queues a typed first-run handoff to the selected coding agent. The generated shell
keeps its context-isolation, sandbox, no-Node, no-webview, local-only and narrow
preload boundaries. The platform picker now owns a plain-text-by-default regex search,
localized no-match output, and roving keyboard focus. Source contracts and focused
regressions cover these paths; hosted and installed-artifact proof remains separate.

**Changed files:**

- `apps/daemon/src/desktop-scaffold.ts`
- `apps/daemon/src/projects.ts`
- `apps/daemon/src/prompts/system.ts`
- `apps/daemon/src/routes/project/index.ts`
- `apps/daemon/tests/desktop-scaffold.test.ts`
- `apps/daemon/tests/project-archive.test.ts`
- `apps/daemon/tests/prompts/system.test.ts`
- `packages/contracts/src/api/projects.ts`
- `packages/contracts/src/plugins/scenario-defaults.ts`
- `packages/contracts/src/prompts/system.ts`
- `packages/contracts/tests/scenario-defaults.test.ts`
- `packages/contracts/tests/system-prompt.test.ts`
- `apps/web/tests/components/NewProjectPanel.test.tsx`

### 2026-08-21 — Make desktop creation claimed, exclusive, and agent-authoritative

**Reason:** The first source implementation could reuse an existing project directory,
trust a client-selected or stale agent, collapse mixed platform targets into a desktop
target, and expose a scaffold whose generated main process had only lexical path checks.
The repair claims only a newly empty directory with a nonce marker, validates every
generated byte before database visibility, reconciles owned claims on startup, keeps
desktop selection explicitly Windows-only and exclusive, derives package identity from
the immutable project id, shares one bounded wire-up prompt helper, validates that the
prompt and selected agent match the daemon's config/runtime witness, and gives the
picker a portalled, keyboard-safe, localized 48px interaction surface.

**Changed files:**

- `apps/daemon/src/desktop-scaffold.ts`
- `apps/daemon/src/projects.ts`
- `apps/daemon/src/routes/project/index.ts`
- `apps/daemon/src/server.ts`
- `apps/daemon/tests/desktop-scaffold.test.ts`
- `apps/daemon/tests/project-archive.test.ts`
- `packages/contracts/src/api/projects.ts`
- `apps/web/tests/components/NewProjectPanel.test.tsx`
- `apps/web/src/i18n/funny/en.ts`
- `apps/web/src/i18n/funny/zh-HK.ts`
- `apps/web/src/i18n/locales/ar.ts`
- `apps/web/src/i18n/locales/de.ts`
- `apps/web/src/i18n/locales/en.ts`
- `apps/web/src/i18n/locales/es-ES.ts`
- `apps/web/src/i18n/locales/fa.ts`
- `apps/web/src/i18n/locales/fr.ts`
- `apps/web/src/i18n/locales/hu.ts`
- `apps/web/src/i18n/locales/id.ts`
- `apps/web/src/i18n/locales/it.ts`
- `apps/web/src/i18n/locales/ja.ts`
- `apps/web/src/i18n/locales/ko.ts`
- `apps/web/src/i18n/locales/pl.ts`
- `apps/web/src/i18n/locales/pt-BR.ts`
- `apps/web/src/i18n/locales/ru.ts`
- `apps/web/src/i18n/locales/th.ts`
- `apps/web/src/i18n/locales/tr.ts`
- `apps/web/src/i18n/locales/uk.ts`
- `apps/web/src/i18n/locales/zh-CN.ts`
- `apps/web/src/i18n/locales/zh-TW.ts`
- `apps/web/src/i18n/types.ts`

### 2026-08-10 — Finish the production Material 3 shell against the checked-in UI contract

**Reason:** The production interface already carried the Material 3 token layer and most
component anatomy, but several high-visibility measurements still disagreed with the
checked-in mockup. Workspace tabs were rounded toward the title strip instead of the
workspace; collapsed navigation destinations used the 56×32 visual indicator as their
entire pointer/keyboard target; the primary New Project action did not have its own 56px
filled treatment; and app-bar, search, recent-project and overlay geometry could still
fall back to legacy dimensions. This change centralizes the contract measurements,
corrects those shell defects, keeps the 88/260px rail and 28px status strip exact,
normalizes the home prompt and scenario cards, bounds menus/dialogs to the viewport,
and preserves reduced-motion and visible-focus behavior. It changes presentation only:
existing React routes, commands, state, data-testid values and local-only asset behavior
remain intact.

**Changed files:**

- `apps/web/src/components/AppStatusBar.module.css`
- `apps/web/src/components/EntryTopbarSearch.module.css`
- `apps/web/src/styles/home/entry-layout.css`
- `apps/web/src/styles/home/home-hero.css`
- `apps/web/src/styles/home/recent-projects.css`
- `apps/web/src/styles/md3-tokens.css`
- `apps/web/src/styles/shell.css`

### 2026-08-07 — Bound and identify Squirrel lifecycle commands

**Reason:** Release run `31186802259` passed Typecheck, focused Windows tests,
unsigned Squirrel packaging, Authenticode `NotSigned`, the self-contained scan
and installer artifact upload, then timed out after `720000ms` before the smoke
test reached UI capture. The report did not identify whether pre-clean uninstall,
install, or a later `tools-pack` command remained pending. Squirrel commands used
buffered `execFile`, whose captured pipes can remain open in descendants after the
direct installer exits. The harness now ignores Squirrel stdio, resolves from the
direct child `exit` event, enforces a 120-second command limit, and terminates the
Windows descendant tree on timeout. The packaged smoke applies a shorter-than-suite
timeout to each `tools-pack` action and appends start, spawn, completion, error and
timeout events to `smoke-steps.jsonl`, so a future failure names the active action
instead of returning only the outer test declaration. Focused source contracts
reject the old buffered, unbounded invocation.

**Changed files:**

- e2e/specs/win.spec.ts
- tools/pack/src/win/lifecycle.ts
- tools/pack/tests/win-lifecycle.test.ts

### 2026-08-08 — Raise smoke-test vitest timeout to survive Defender-slowed installs

**Reason:** Release runs `31178661227`, `31182596964` and `31186802259` all timed
out at exactly `720000ms` — the vitest per-test timeout — while `invokeSquirrel`
was blocked inside `execFileAsync` with no timeout of its own. Windows Defender
real-time protection scans every file that Squirrel's Setup.exe and Update.exe
write to disk. On a machine where the Electron binary is new to Defender's cloud
cache this scan takes well over twelve minutes, longer than the former twelve-minute
vitest gate. The release workflow now adds Defender path exclusions for the two
Squirrel-owned directories (`%LOCALAPPDATA%\open-design-packaged-app` and
`%LOCALAPPDATA%\SquirrelTemp`) before the smoke step runs; the vitest per-test
timeout is also raised from `720_000` ms (12 min) to `1_800_000` ms (30 min) as
a defence-in-depth measure against any residual scanning delay.

**Changed files:**

- `e2e/specs/win.spec.ts`

### 2026-08-07 — Exit Squirrel lifecycle events immediately

**Reason:** Release run `31182596964` proved that packaging, unsigned verification,
self-contained scanning and artifact upload passed, but the packaged Windows smoke
test still timed out after `720000ms` while Squirrel was completing installation.
Detaching the shortcut helper was not enough because Electron's asynchronous
`app.quit()` can wait on imported quit handlers. Lifecycle switches now use
`app.exit(0)` so the event process terminates immediately after handing the
shortcut operation to `Update.exe`; the source contract rejects the asynchronous
quit path.

**Changed files:**

- apps/packaged/src/index.ts
- apps/packaged/tests/squirrel-startup.test.ts

### 2026-08-07 — Let Squirrel lifecycle startup exit without waiting on its helper

**Reason:** Release run 31178661227 built and verified the unsigned Squirrel
installer but the packaged Windows smoke test timed out after 720000ms during
the install path. Squirrel launches the packaged executable for lifecycle
switches before Setup.exe can finish. The lifecycle handler now detaches the
shortcut helper, keeps an asynchronous spawn failure from becoming an
unhandled process error, and quits immediately instead of waiting for the
helper's close event. The focused source contract covers the detached handoff
and rejects the old wait.

**Changed files:**

- apps/packaged/src/index.ts
- apps/packaged/tests/squirrel-startup.test.ts

### 2026-08-07 — Exclude the redundant Windows standalone pnpm store before Squirrel packaging

**Reason:** Release run `31168712919` reached Squirrel extraction and failed with
`System.IO.PathTooLongException` after the output and Squirrel temporary roots had
already been shortened. The Windows standalone hook dereferences its copied links and
hoists the public package targets, so the remaining `.pnpm` store was redundant. The
the Windows copy now excludes that store before materializing the packaged resource and
reads public hoist entries from the standalone source while copying them into their
final locations. The earlier post-copy cleanup and recursive audit made the first repair
spend too long in the packaging hook. The exclusion prevents peer-qualified store paths
from entering the Squirrel package while preserving Unix symlink layouts.

**Changed files:**

- `tools/pack/resources/web-standalone-after-pack.cjs`
- `tools/pack/tests/web-standalone-after-pack.test.ts`

### 2026-08-07 — Shorten the Squirrel output path during Windows packaging

**Reason:** Release run `31164999787` proved that the unsigned Squirrel controls
were working, but `electron-winstaller` still rejected `open-design-packaged-app.nuspec`
because NuGet received an unpacked output tree whose fully qualified paths exceeded
Windows `MAX_PATH`. The Windows packer now maps the output namespace parent to an
unused drive letter only for the electron-builder process, passes the short output
path to Squirrel, and removes the mapping in a `finally` block even after a failed
build. The focused source contract covers the mapping and its failure message.

**Changed files:**

- `tools/pack/src/win/builder.ts`
- `tools/pack/tests/win-builder.test.ts`

### 2026-08-07 — Stop the Squirrel target from invoking executable signing

**Reason:** Release run `31160806459` proved that electron-builder's general
`signAndEditExecutable: false` control does not cover the Squirrel target's
direct `packager.signIf` calls for its stub, application executable and setup
executable. The generated Windows configuration now excludes `.exe` files with
`signExts: ["!exe"]`, while retaining the hard-disabled signing controls and
the `NotSigned` release gate.

**Changed files:**

- `tools/pack/src/win/builder.ts`
- `tools/pack/tests/win-builder.test.ts`

### 2026-08-25 — Keep Squirrel author metadata inside every application manifest

**Reason:** Release run `31159842997` reached the Windows packer and electron-builder
26.8.1 rejected the generated top-level `author` field because it is not a valid
builder option. A later assembled application manifest omitted `author` entirely,
so NuGet rejected the Squirrel package with `Authors is required.` before an
installer could be produced. Squirrel.Windows obtains its required `Authors`
value from `appInfo.companyName`, which is derived from the application package's
author object. The assembled manifest and the builder's `extraMetadata` now both
keep `{ name: PRODUCT_NAME }`, and the focused source contract rejects both the
missing producer field and the invalid string form.

**Changed files:**

- `tools/pack/src/win/builder.ts`
- `tools/pack/src/win/app.ts`
- `tools/pack/tests/win-builder.test.ts`

### 2026-08-07 — Keep the Squirrel artifact contract test aligned with its helper

**Reason:** the release runner reached the focused Windows pack tests and found that
the source-contract assertion still expected the pre-helper artifact template. The
packaging implementation correctly centralizes that template in
`resolveWinSquirrelArtifactName`; the test now asserts the escaped electron-builder
extension template that the helper actually contains.

**Changed files:**

- `tools/pack/tests/win-builder.test.ts`

### 2026-08-07 — Repair the web typecheck boundary exposed by the release runner

**Reason:** the first full self-hosted Windows release reached the application
typecheck and found a missing platform import, three focus traps whose indexed
element access was not narrowed under strict TypeScript settings, and a test
fixture using an artifact kind outside the committed contract. The fixes keep
keyboard focus behavior unchanged while making the non-empty element boundary
explicit, restore the existing platform helper import, and align the fixture
with the supported `html` artifact kind.

**Changed files:**

- `apps/web/src/App.tsx`
- `apps/web/src/components/command-palette/CommandPalette.tsx`
- `apps/web/tests/components/FileWorkspace.test.tsx`

### 2026-08-07 — Make every release artifact intentionally unsigned

**Reason:** code signing is permanently prohibited for this project. The active
Windows packer no longer exposes signing or notarization options, never invokes a
signer, hard-disables electron-builder signing and certificate discovery, and
removes signing inputs from cache keys. The release workflow clears signing
environment values, bootstraps Python and the MSVC/Windows SDK toolchain, and
verifies that every generated `Setup.exe` reports `NotSigned` before publication.
Focused packer tests assert the unsigned boundary.

**Changed files:**

- `tools/pack/CACHE.md`
- `tools/pack/README.md`
- `tools/pack/src/config.ts`
- `tools/pack/src/index.ts`
- `tools/pack/src/win/builder.ts`
- `tools/pack/src/win/custom-installer.ts`
- `tools/pack/src/win/sign.ts`
- `tools/pack/tests/config.test.ts`
- `tools/pack/tests/mac.test.ts`
- `tools/pack/tests/win-builder.test.ts`
- `tools/pack/tests/win-sign.test.ts`

### 2026-08-06 — Show the exact release notes in update prompts

**Reason:** the release workflow already writes a validated `releaseNotesUrl` into
update metadata, but the ready dialog and persistent update banner discarded it and
opened only a generic releases page. The updater model now accepts HTTPS release-note
URLs from metadata, rejects malformed or non-HTTPS values, and keeps the repository
release page as the explicit fallback. Both ready surfaces expose the resulting
target, with focused model and rendered-surface tests. The source update is
committed at [`6f4015b8`](https://github.com/Ding-Ding-Projects/material-designer/commit/6f4015b8).

**Changed files:**

- `apps/web/tests/lib/updater.test.ts`
- `apps/web/tests/components/UpdateDialog.test.tsx`

### 2026-08-06 — Make the Squirrel release path fail closed on signing and smoke

**Reason:** the Windows release was already Squirrel-based and dependencies were
installed from the frozen workspace lockfile on the self-hosted runner, but the
packer could still emit an unsigned installer and the publication condition did not
require the packaged smoke test to run successfully. Squirrel packaging now enables
`forceCodeSigning` for signed builds, uses the configured certificate thumbprint and
timestamp service, and the workflow verifies the resulting Authenticode signature.
Publication requires a successful smoke result; missing or duplicate packaged UI
state evidence fails the job. The persistent runner bootstrap also re-materializes
cached `gh.exe` and `7z.exe` from verified archives/installers instead of trusting
cached binaries. The source update is committed at
[`6daae310`](https://github.com/Ding-Ding-Projects/material-designer/commit/6daae310).

**Changed files:**

- `tools/pack/src/win/builder.ts`
- `tools/pack/tests/win-builder.test.ts`

### 2026-08-06 — Keep UI overlays reachable and onboarding controls truthful

**Reason:** the settings overflow surface could exceed a narrow or short viewport,
onboarding dropdowns could strand focus after Escape or selection and announced only
the selected value without the field name, and the command-palette size control was
smaller than the app's keyboard and touch target. The repair clamps the settings
surface on both axes with genuine above/below placement, restores focus to dropdown
triggers, labels each trigger with its field and value, and gives the palette control
a 48px target. Focused tests cover the geometry, focus return, accessible naming and
target-size contracts. The source update is committed at
[`34426621`](https://github.com/Ding-Ding-Projects/material-designer/commit/34426621).
A follow-up at
[`ec2c76d7`](https://github.com/Ding-Ding-Projects/material-designer/commit/ec2c76d7)
raises the portalled menu above the opaque settings page, keeps Tab inside its
regex-builder focus scope, clamps stale off-screen anchors and restores viewport
globals in the geometry tests.

**Changed files:**

- `apps/web/src/components/command-palette/CommandPalette.module.css`
- `apps/web/src/components/settings/SettingsTabStrip.tsx`
- `apps/web/src/components/settings/SettingsTabs.module.css`
- `apps/web/tests/components/CommandPalette.test.tsx`
- `apps/web/tests/components/EntryShell.onboarding-dropdown.test.tsx`
- `apps/web/tests/components/SettingsDialog.tabs.test.tsx`

### 2026-08-06 — Search and drive the settings overflow menu

**Reason:** the new settings tab strip made every section reachable through an
overflow menu, but that menu still exposed all seventeen dynamic items as an
unsearchable list and offered no arrow-key route. The menu now has its own
plain-text-first regex search field, bounded local filtering, an honest empty
state, arrow/Home/End navigation, and focus restoration on Escape or Tab. The
focused settings spec covers the filter, the menu's independent builder, the
keyboard route and focus return. The source change is committed at
[`6f03a832`](https://github.com/Ding-Ding-Projects/material-designer/commit/6f03a8321e8f6bf1fd1ddae56e95faf39a3e4d58).

**Changed files:**

- `apps/web/src/components/settings/SettingsTabStrip.tsx`
- `apps/web/src/components/settings/SettingsTabs.module.css`
- `apps/web/tests/components/SettingsDialog.tabs.test.tsx`

### 2026-08-06 — Prove the Figma focus-trap wrap edges

**Reason:** the previous regression helper moved focus itself whenever jsdom did
not mark the Tab event as prevented. That could make the test pass at the first
or last control even if the real modal handler failed to own the wrap edge. The
test now identifies the two edge cases and requires the handler to call
`preventDefault()` there, while retaining the helper only for ordinary middle
control movement. The correction is committed at
[`ac3ba56`](https://github.com/Ding-Ding-Projects/material-designer/commit/ac3ba56).

**Changed files:**

- `apps/web/tests/components/FigmaImportModal.a11y.test.tsx`

### 2026-08-06 — Exercise the native Figma input in the focus contract

**Reason:** the residual Figma repair added the native file input to the modal's
production focus selector, but its regression test built a button-only list and
could therefore pass without ever traversing that input. The focused test now
builds the modal's complete keyboard order, asserts that the native input is in
it, and drives forward and reverse Tab traversal through every control. The
jsdom helper models the browser's ordinary middle control move while leaving
wrap-edge ownership to the real modal handler; the later edge assertion is
recorded separately in [`ac3ba56`](https://github.com/Ding-Ding-Projects/material-designer/commit/ac3ba56).
The correction is committed at [`cbdc4f5`](https://github.com/Ding-Ding-Projects/material-designer/commit/cbdc4f5ae673b7387445ad8e2fc0ba49dcdacb4e).

**Changed files:**

- `apps/web/tests/components/FigmaImportModal.a11y.test.tsx`

### 2026-08-06 — Keep Figma drops on a visible, named native file control

**Reason:** a file dropped on the URL tab could leave its localized error tied to
the hidden file surface, and the native file input itself was removed from the
accessibility tree with `display: none`. The modal now switches every file drop to
the file tab before reporting the error, focuses the real file control after that
switch, and keeps the visible dropzone keyboard-operable through a visually-hidden
native input with a localized accessible name, helper association and error
association. The focused source spec covers the URL-tab drop path, retry-safe error
state and the native input contract. `zh-HK` intentionally continues to inherit
`figmaUrl` and `figmaPlaceholder` from `zh-TW`; no duplicate locale keys are needed.

**Changed files:**

- `apps/web/src/components/FigmaImportModal.module.css`
- `apps/web/tests/components/FigmaImportModal.a11y.test.tsx`

### 2026-08-06 — Complete the six Figma import repairs

**Reason:** the final read-only refutation found six remaining source-level gaps in
the Figma import flow: focus could be handed back while the modal was still mounted,
rejected Home URL handoffs closed the retry surface, invalid state was broader than
the visible control, several visible strings bypassed the catalog, invalid file drops
left a stale valid selection behind, and the URL expression accepted arbitrary
trailing content. The repair closes the modal before the host focus handoff, keeps a
rejected URL import open with a retry path, associates file errors with the visible
dropzone and URL errors only with the URL field, clears invalid file selections,
anchors the URL expression while retaining query/hash support, and routes the full
surface through the catalog. `types.ts` and every locale retain the established
English fallback shape; `zh-TW.ts` carries the Traditional Chinese seed and
`zh-HK.ts` adds deliberate Hong Kong Cantonese overrides. The final source tip
is [`81ca738`](https://github.com/Ding-Ding-Projects/material-designer/commit/81ca73826312e1c599e52ff8be943620ee1ec04f);
its follow-up restores only pre-existing locale indentation and changes no
user-facing value.

**Changed files:**

- `apps/web/src/i18n/locales/ar.ts`
- `apps/web/src/i18n/locales/de.ts`
- `apps/web/src/i18n/locales/en.ts`
- `apps/web/src/i18n/locales/es-ES.ts`
- `apps/web/src/i18n/locales/fa.ts`
- `apps/web/src/i18n/locales/fr.ts`
- `apps/web/src/i18n/locales/hu.ts`
- `apps/web/src/i18n/locales/id.ts`
- `apps/web/src/i18n/locales/it.ts`
- `apps/web/src/i18n/locales/ja.ts`
- `apps/web/src/i18n/locales/ko.ts`
- `apps/web/src/i18n/locales/pl.ts`
- `apps/web/src/i18n/locales/pt-BR.ts`
- `apps/web/src/i18n/locales/ru.ts`
- `apps/web/src/i18n/locales/th.ts`
- `apps/web/src/i18n/locales/tr.ts`
- `apps/web/src/i18n/locales/uk.ts`
- `apps/web/src/i18n/locales/zh-CN.ts`
- `apps/web/src/i18n/locales/zh-HK.ts`
- `apps/web/src/i18n/locales/zh-TW.ts`
- `apps/web/src/i18n/types.ts`
- `apps/web/tests/components/FigmaImportModal.a11y.test.tsx`

### 2026-08-06 — Switch Windows packaging to Squirrel and add restartable updates

**Reason:** Windows releases previously built the legacy NSIS target and the
desktop updater had no project-owned stable feed. The packer now makes
Squirrel.Windows the default Windows target, stages `Setup.exe`, `RELEASES` and
full/delta `.nupkg` packages, and the release workflow publishes a checksummed
`metadata.json` feed with a monotonic app version. Packaged startup handles the
Squirrel lifecycle switches before normal Electron startup. The updater downloads
Windows installers in the background and leaves installation behind an explicit
**Restart to install update** action; code signing remains unavailable and is
documented as such.

**Changed files:**

- `apps/desktop/src/main/updater.ts`
- `apps/desktop/src/main/updater/config.ts`
- `apps/desktop/src/main/updater/feed.ts`
- `apps/desktop/tests/main/updater.test.ts`
- `apps/desktop/tests/main/updater/config.test.ts`
- `apps/desktop/tests/main/updater/feed.test.ts`
- `apps/packaged/src/index.ts`
- `apps/packaged/tests/squirrel-startup.test.ts`
- `apps/web/src/i18n/locales/en.ts`
- `apps/web/tests/components/UpdateDialog.test.tsx`
- `apps/web/tests/components/UpdaterPopup.test.tsx`
- `apps/web/tests/lib/updater.test.ts`
- `docs/testing/updater-lifecycle.md`
- `e2e/specs/win.spec.ts`
- `tools/pack/AGENTS.md`
- `tools/pack/src/config.ts`
- `tools/pack/src/index.ts`
- `tools/pack/src/win/build.ts`
- `tools/pack/src/win/builder.ts`
- `tools/pack/src/win/constants.ts`
- `tools/pack/src/win/lifecycle.ts`
- `tools/pack/src/win/paths.ts`
- `tools/pack/src/win/report.ts`
- `tools/pack/src/win/types.ts`
- `tools/pack/tests/config.test.ts`
- `tools/pack/tests/win-builder.test.ts`
- `tools/pack/tests/win-lifecycle.test.ts`
- `tools/pack/tests/win-targets.test.ts`

### 2026-08-06 — Keep the command-palette regex affordance reachable and guarded

**Reason:** The palette already used the shared per-field regex builder, but its
compact inherited affordance was only 26px. The palette now opts into the full
48px keyboard/touch target while leaving the input as the flexible member of the
search row. A focused source-level guard also protects the independent
`useRegexSearch` controller, shared field semantics, accessible dialog affordance
and narrow-viewport bounds. The existing allowlist entries for the palette files
remain the declaration that makes these intentional differences from upstream
legal under Apache-2.0 §4(b).

**Changed files:**

- `apps/web/src/components/command-palette/CommandPalette.module.css`
- `apps/web/src/components/command-palette/CommandPalette.tsx`
- `apps/web/tests/components/CommandPalette.test.tsx`

### 2026-08-06 — Make update restart wait for renderer saves and close audited UI gaps

**Reason:** the UI audit found that an update restart could schedule process
shutdown while a sketch autosave was still queued or in flight. The host bridge
now asks the renderer to flush those saves, rejects malformed responses, times
out safely, and refuses both ordinary and forced restarts when preparation
fails. The same audit added focused coverage for the save handshake and filled
the missing allowlist entries for the Figma, command-palette, context-menu and
design-system accessibility fixes already present in this checkout.

**Changed files:**

- `apps/desktop/src/main/updater/deferred-launch.ts`
- `apps/desktop/tests/main/update-preflight.test.ts`
- `apps/desktop/tests/main/updater-host-boundary.test.ts`
- `apps/web/tests/components/DesignSystemFlow.test.tsx`
- `apps/web/tests/components/FileWorkspace.test.tsx`
- `apps/web/tests/components/FigmaImportModal.a11y.test.tsx`

### 2026-08-06 — Give import fields durable names and contain updater focus

**Reason:** the bounded accessibility follow-up replaces placeholder-era field
naming with visible `label`/`for` associations for the Figma URL and notes
controls. The same modal now reads its upload labels, helper copy, and
placeholders through the existing locale catalog, announces form errors as
assertive alerts, and associates those errors with invalid controls. The
updater dialog now holds focus inside the open surface even when another
element tries to take it, restores focus to the originating control on close or
cancellation, and records both behaviours in focused tests.

**Changed files:**

- `apps/web/src/components/FigmaImportModal.module.css`
- `apps/web/tests/components/FigmaImportModal.a11y.test.tsx`
- `apps/web/src/components/UpdateDialog.module.css`
- `apps/web/tests/components/UpdateDialog.test.tsx`

### 2026-08-06 — Keep scrollable context menus open

**Reason:** The menu is intentionally height-bounded and scrollable, but its
capture-phase scroll listener dismissed it even when the user scrolled inside
the menu. The focused regression spec records that internal scrolling stays
open while an ancestor scroll still dismisses the anchored surface.

**Changed files:**

- `apps/web/tests/components/ContextMenu.behavior.test.tsx`

### 2026-08-06 — Use one command-palette shortcut

**Reason:** The desktop header announced `Ctrl K` while the application accepted
both `Ctrl+K` and `Ctrl+Shift+P`. That left two stale routes and contradicted the
single discoverable `Ctrl+Shift+F` requirement. Added `commandPalette.open` to the
shared shortcut registry and routed the global handler, header hint,
accessibility metadata, setup instructions and focused tests through it.

**Changed files:**

- `apps/web/src/App.tsx`
- `apps/web/src/components/EntryTopbarSearch.tsx`
- `apps/web/src/components/SettingsDialog.tsx`
- `apps/web/src/components/command-palette/CommandPalette.tsx`
- `apps/web/src/components/shortcuts/registry.ts`
- `apps/web/src/i18n/types.ts`
- `apps/web/tests/components/EntryTopbarSearch.test.tsx`
- `apps/web/tests/components/shortcuts-registry.test.ts`

### 2026-08-05 — Six `Test the web application` failures that were the test, not the code

**Reason:** `Verify` run 31022544564 (and the branch run behind it) failed
`Unit tests → Test the web application` at 15 assertions across 9 files. Nine
of those fifteen, in six files, turned out to be the assertion asking a
question its own fixture or helper could no longer answer honestly — each
confirmed by reading the actual rendered markup or CSS the assertion reads,
not guessed. (List prose below is deliberately not bulleted — a leading
`` - `path` `` is this file's declaration syntax, and a bullet here would be
misread as one.)

**`changelog-filter.test.ts`.** The new regex-predicate describe block used
`entry()`'s default `category: 'Added'` for all three fixture entries, so
`entryHaystackRaw` folded the literal word "Added" into every entry's
haystack regardless of its text. The `/Added/` predicate test then matched
all three entries instead of the one whose *text* says "Added" — the
fixture was quietly answering its own question. Given an explicit
non-colliding `category: 'Changed'`, only the intended entry matches.

**`CommandPalette.test.tsx`** (4 assertions). `screen.getByRole('textbox')` is
no longer unique: the default result list also renders an inline
`SettingTextField` (`aria-label="Global rules"`), a second textbox added
alongside the search input. Scoped each call to `{ name: /search commands/i }`.

**`FileViewer.test.tsx`** (2 assertions). `menuItemText()` stripped
`aria-hidden` nodes only one level deep, but the two failing menu items
wrap their `MaterialSymbol` in an extra `<span class="share-menu-icon">`,
putting `aria-hidden="true"` on a grandchild rather than a direct child.
The ligature name (`"description"`, `"link"`) leaked through exactly the
bug this helper exists to prevent, one level lower than it was checking.
Made the strip recursive.

**`Toast.test.tsx`.** Asserted `path[d^="m21.73 18"]`, the old RemixIcon glyph
data, against a component that migrated to a Material Symbols vector path
(`Icon.tsx`'s `alert-triangle` entry, `d="M109 -120…"`). Updated the prefix
to the glyph actually rendered.

**`styles/bundled-fonts.test.ts`.** Its manually-maintained supplementary name
list still listed `'smartphone'`, stale since `ac37ac7` moved the two
viewport switchers onto the symbol table's own value, `'mobile'`. Updated
the list entry to match.

**`styles/settings-polish.test.ts`.** Its `ruleValue()` helper matched
`(?:^|;)\s*property:` directly against the CSS block, so a property
preceded by a comment (rather than directly by `;`) failed to match even
though the value on disk is correct — hit by `.page`'s `z-index: 100`,
which carries a nine-line comment explaining the number just above it.
Strips comments before matching now, the same way the sibling helper in
`workspace-tabs-chrome.test.ts` already did.

None of the source these tests exercise changed. The remaining six failures —
four CSS-value mismatches in `wave8-overlay-m3.test.ts` and
`workspace-tabs-chrome.test.ts`, and one `inert`-attribute assertion in
`SettingsDialog.execution.test.tsx` — are written up instead of guess-fixed;
see `docs/troubleshooting/2026-08-05-web-suite-and-self-contained-check.md`.

**Changed files:**

- `apps/web/tests/changelog-filter.test.ts`
- `apps/web/tests/components/CommandPalette.test.tsx`
- `apps/web/tests/components/FileViewer.test.tsx`
- `apps/web/tests/components/Toast.test.tsx`
- `apps/web/tests/styles/bundled-fonts.test.ts`
- `apps/web/tests/styles/settings-polish.test.ts`

### 2026-08-04 — Two call sites naming a glyph the type no longer publishes

**Reason:** the symbol table publishes `mobile` for the phone glyph, and two
viewport switchers returned the literal `'smartphone'` instead of going through
the table. Both names are real ligatures in the bundled face and both draw the
identical glyph — 4,268 addressable names resolve to 3,967 distinct glyphs, and
that pair is one of the aliases making up the difference — so nothing would have
looked wrong. `MaterialSymbolName` is the set of names the *table* publishes,
though, so the typecheck refused it, which is the check doing exactly its job:
it caught a divergence that no rendered pixel would have revealed.

**Changed files:**


### 2026-08-04 — Settings stops being a modal and becomes a page

**Reason:** roadmap § 2.4 Wave 6, and the non-blocking standard it points at.
Settings was a 920×720 card floating on a blurred scrim with
`aria-modal="true"`: the entire application went unreachable behind it — the
workspace tabs, the status bar, the window's own chrome — until the user
closed it. Modality is for a decision that has to be made before anything else
can continue. Choosing a theme is not one.

**What it does now.** The surface mounts inside `.workspace-shell__body`, as a
second child of that element's single grid cell, and covers the workspace
rather than the window. It paints an opaque `--md-sys-color-surface` and
centres a 1180px column, which is the settings screen's own width in
`mockups/open-design-m3`. The searchable section list Wave 6 asks for is the
tab strip that already landed, unchanged and untouched.

*The grid cell is the load-bearing part.* Covering a sibling normally means
`position: absolute`, which needs a positioned ancestor — and making the shell
body one silently re-homes the containing block of every absolutely-positioned
descendant in the product, including the ones that mean to resolve against the
viewport. A one-cell grid with `grid-area: 1 / 1` on both children costs
nothing when there is one child and stacks them when there are two, and a grid
item takes `z-index` without needing `position` at all. That `z-index` is 100
rather than the 2 that would beat `.app` on its own: 100 is the layer
`.modal-backdrop` gave this surface as a card, so the privacy banner, the
window chrome, the palette, the notification host and the tooltip layer all
keep exactly the relationship to Settings they already had.

*Visually covered is not unreachable.* The page marks its siblings `inert`
while it is open, so Tab cannot walk out of the last settings control into a
chat composer nobody can see, and a screen reader is not reading a screen that
is not on screen. `inert` rather than `aria-hidden` because only one of the
two removes focus, pointer events and the accessibility tree together;
`aria-hidden` alone hides a surface from assistive technology while leaving it
tabbable, which is the worse half. The shell's own chrome is outside that
parent and stays live, which is what makes the surface non-blocking rather
than a modal without a scrim.

*The fullscreen toggle is gone, not moved.* It grew the card to the viewport.
On a surface that is already the whole content area it could only ever change
nothing, and a control that looks operable and does nothing is the
decorative-control failure shipped. Escape and the close button are the two
ways out; there is no "outside" left to click.

*Losing the `modal` class would have taken four style rules with it.* The
shared `.modal h2`, `.modal label`, `.modal .hint` and `.modal .row` rules are
the content rhythm every dialog body is written against, and the settings
sections were written against them too — dropping the class would have left
every hint and every field label in nineteen sections unstyled, quietly and
everywhere at once. Those four selectors now name `.settings-page` beside
`.modal`, at the same specificity, so nothing that used to outrank them starts
losing to them.

The card's shell rules left the global sheet with it — a 920×720 box, its
fullscreen variant, and the head/body overrides — and now live in a colocated
module beside the component. What stayed global is what other surfaces share:
`.modal-head`'s rhythm, the chrome strip, the autosave pill, and
`.settings-content`, which is still the scroller so the tab-change `scrollTop`
reset and the palette's reveal keep working exactly as they did. The two
`modal-` class names on the header and the body are deliberate: they carry the
generic head/body rhythm every surface in the product uses, and renaming them
would have meant duplicating that rhythm rather than reusing it.

**Not done, and not claimed:** nothing here has been executed. This checkout
has no Node toolchain available to it, so the types, the tests and the
rendering are all unverified until CI runs them, and no capture exists — which
is why Wave 6's box stays open, its definition of done being capture-based.

**Changed files:**

- `apps/web/src/App.tsx`
- `apps/web/src/components/SettingsDialog.tsx`
- `apps/web/src/components/settings/SettingsPage.module.css`
- `apps/web/src/styles/shell.css`
- `apps/web/src/styles/workspace/mention-home.css`
- `apps/web/tests/components/SettingsDialog.execution.test.tsx`
- `apps/web/tests/styles/settings-polish.test.ts`

### 2026-08-04 — The palette's settings rows stop being links and start being the settings

**Reason:** roadmap § 3.6. `SettingRowControl` rendered a live control for
twelve of the index's rows and a reveal anchor for the rest, and the roadmap
recorded the gap honestly: extending it is a `SettingsControlId` and a `switch`
case per setting. This does the extending. Twenty-two of forty-three rows now
carry the real control — a select for a choice, a switch for a toggle, a
stepper for a number, a text box for a value.

**Which rows, and why the rest are not.** Every row that names a single
setting is live except one. Twenty of the twenty-one that are not are section
anchors: a row called "Privacy" names a whole tab, and there is no control for
a tab. The twenty-first is `appearance.typography`, which names the typography
*card* — a face list plus nine properties. Four of those properties are now
indexed and live in their own right, so a control on the card row would have
had to pick one of them and present it as the whole card.

*The appearance rows write to the store, not to a copy of it.* Seed, density,
UI scale, auto-fit and typography do not live in `AppConfig` at all; they live
in the appearance store, which persists and applies to the document in the same
call. The palette reads and writes them through `useAppearancePreferences` —
the very hook `AppearanceControls` uses — so a seed picked in the palette is
applied before the handler returns, and the editor shows it if it is open. The
three label maps moved into `components/appearance/labels.ts` for the same
reason: two surfaces rendering the same choices from two copies of "which key
names the lime seed" is a drift nobody would see, because both would keep
rendering *a* label.

*The desktop-notification switch asks the platform first.* Settings requests
the browser permission and stores what it is told. A palette switch that only
wrote `true` would report a setting the platform has refused and leave the user
waiting for banners that can never arrive — so this one asks, stores the
answer, and disables itself where `Notification` does not exist at all.

*The stepper keeps a draft.* A bare controlled number input cannot be edited
from 100 to 18: clearing it hands an empty string to the handler, and whatever
gets written is rendered straight back over what the user is halfway through
typing. So the box keeps the text while the setting keeps the number, an
out-of-range entry is clamped on blur rather than dropped, and a value changed
underneath — by auto-fit, or by the editor in another surface — still wins.

*The text row commits on blur, and on the way out.* Every keystroke would
otherwise be one config save and one daemon sync; the settings surface reaches
the same place through a debounce. It is a one-row `textarea` rather than an
`input` because a single-line text input sanitises newlines out of its own
value, which would silently flatten a multi-line instruction the moment this
row committed. Closing the palette never fires `blur`, so the pending draft is
committed on unmount too.

The hand-rolled 26×14 switch track in the palette is gone: it renders the
`Switch` component, which is Material Design 3's 52×32 anatomy, and that
component gained a `tabIndex` prop so the palette's roving-focus list can keep
giving the highlighted row's control the tab stop. The registry row cap moved
from 60 to 200 — the index alone is forty-three entries now, rows are pushed
commands-then-destinations-then-settings, and the first thing a too-low cap
would have trimmed is the last settings tabs, silently, from a palette that
claims to list every setting.

**Not done, and not claimed:** unexecuted, for the same reason as the entry
above — the new `CommandPalette.test.tsx` cases have never been run here.

**Changed files:**

- `apps/web/src/components/Switch.tsx`
- `apps/web/src/components/appearance/AppearanceControls.tsx`
- `apps/web/src/components/appearance/labels.ts`
- `apps/web/src/components/command-palette/CommandPalette.module.css`
- `apps/web/src/components/command-palette/CommandPalette.tsx`
- `apps/web/src/components/command-palette/settingsIndex.ts`
- `apps/web/tests/components/CommandPalette.test.tsx`

### 2026-08-04 — 79 of the 93 inline icons become real Material Symbols, and the one symbol name that was never in the font

**Reason:** `Icon.tsx` carried 93 hand-drawn stroke glyphs used at 859 sites
across 127 files, and it is the last original design element the icon work left
standing. The previous pass deliberately stopped here, and its reason was
sound: picking 93 replacements by name is where a wrong choice renders a
*plausible* wrong icon — one that looks deliberate, breaks nothing, and no test
catches. Every mapping below was therefore chosen against a rendered image
rather than a remembered name, and fourteen were not made at all.

**The premise that this is a one-file change is wrong, and that is the finding
worth recording.** The obvious migration hands each glyph to the existing
`MaterialSymbol` component, exactly as the 94 Remixicon sites did. That
component renders a `<span>`, and **143 CSS rules across 31 stylesheets select
this component's output as an element** — `.chrome-action > svg:first-child`,
`.mention-item > svg` (a 24px tonal chip), `.od-select-trigger[aria-expanded='true']
svg` (the 180-degree chevron flip), `.subtab-pill button:has(> svg:only-child)`,
`.ws-tab .tab-icon svg`. Those rules carry sizes, backgrounds, colours,
`display: block` and behaviour. Swapping the element detaches all 143 at once —
the icons still render, in the wrong size and the wrong colour, with the
chevron no longer turning, and nothing in the repository asserts any of it. So
the element stays `<svg>` and only the artwork changes.

**The artwork is the font's, not a lookalike.** Each `d` was extracted from
`public/fonts/material-symbols/material-symbols-rounded.woff2` — the same bytes
`MaterialSymbol` renders — instantiated at `opsz` 24 and at the stated `FILL`,
with the y axis negated for SVG's downward y, hence the 960-unit `viewBox`.
Nothing was traced or redrawn. Every extracted outline was then rasterised
independently, from the emitted path string rather than from the font, and
compared against the font's own rendering of the same glyph; all 79 agree.

**Fourteen names keep their inline artwork**, which is the honest half of this
change. `discord`, `github` and `github-filled` are brand marks and Material
Symbols carries no brand logo at all — the same trademark exception
`SocialShareGrid.tsx` already relies on. `blocks`, `fork`, `hammer`,
`integrations-filled`, `layout`, `panel-left`, `present`, `slides`, `sliders`,
`sun-moon` and `swatchbook` each have a *plausible* candidate — `widgets`,
`account_tree`, `hardware`, `hub`, `view_quilt`, `dock_to_right`, `monitor`,
`slideshow`, `tune`, `routine`, `style` — and a plausible candidate is exactly
what this migration is trying not to ship. They stay until someone can compare
them on a screen.

**One live defect fell out of the checking.** `MATERIAL_SYMBOL_FOR_REMIX_ICON`
mapped `smartphone-line` to `smartphone`, and the bundled face does not carry
that name: its ligature table has 3,967 targets and `smartphone` is not one of
them. Because a Material Symbol is addressed by its ligature, the miss did not
render a box or a blank — it printed the literal word "smartphone" in the
viewport switchers of `FileViewer` and `DesignBrowserPanel`. The existing spec
could not catch it: it checks that a mapped name is *shaped* like a symbol
name, which `smartphone` is. It is now `mobile`, which the font does carry.

**Changed files:**

- `apps/web/src/components/MaterialSymbol.tsx`

### 2026-08-04 — Wave 8: the scrims, popovers and sheets the blanket floor never reached, and a tab strip that was never the size it was asked for

**Reason:** Wave 8 is "everything the first seven waves did not reach,
enumerated from a real audit rather than assumed to be empty". The audit's
central finding is that `styles/primitives.css` installs an attribute-selector
M3 floor over `[class*='-modal']`, `[class*='-dialog']`, `[class*='-popover']`,
`[class*='-menu']` and `[class*='-card']` at 0-2-0 to 0-4-0. It reaches most
overlays, which is why most of them already look M3 — and it means the ones it
*misses* are the whole of Wave 8. Three kinds of surface escape it: a scrim
class the floor's `[class*='modal-backdrop']` does not match, a BEM name
carrying `__`, and every CSS Module class, whose hash reads `File_popover__hash`
rather than `-popover`.

**Nine scrims became one scrim.** They were eight different blacks for one job —
`rgba(28, 27, 26, 0.48)`, `rgba(28, 27, 26, 0.42)` twice, `rgba(15, 15, 18, 0.45)`,
`rgba(17, 24, 39, 0.55)` twice, a `color-mix(… #111827 18% …)`, and a
`color-mix(… var(--scrim, rgba(0, 0, 0, 0.45)) …)` whose token is declared
nowhere in the repository and so always resolved to its own literal fallback.
All nine are now `var(--md-sys-color-scrim)`.

**Ten popovers got the surface role.** Each of them wins its own cascade — this
is not dead code being tidied — and each was still on `--bg-panel` / `--radius`
/ `--shadow-md`, including one carrying a bare `10px` radius the token sheet
names as drift.

**The message centre stops being a tall card.** It was a 12px-inset card with
four rounded corners calling itself a dialog; it is now a docked side sheet —
full height, no margin, leading corners only, `surface-container-low` at
elevation 1. Its badge also painted a literal `#fff`, because
`--accent-contrast` is declared nowhere.

**The tab strip was never the size the mockup asked for, and the file everyone
would edit is not the file that renders it.** The roadmap specifies "a 42px
strip of 36px bottom-rounded tabs with a 250px cap and leading/close icons".
`styles/shell.css` said 38px / 24px / 124px with four rounded corners — but in
the project shell none of those numbers apply, because
`styles/viewer/routines.css` overrides the same anatomy at 0-2-0 from a later
import with 34px / 26px / 156px and an off-scale `7px`. Editing shell.css alone
would have changed nothing a user could see. Both files now carry the mockup's
geometry, the tab hangs from the top edge so its shaped bottom corners read as
meeting the content area, and the leading icon (14px → 18px) and close target
(18px → 22px) grew with it — at 14px in a 36px tab the glyph reads as a speck,
and an 18px close target is below the minimum. The spec pins both files
deliberately, so the next change cannot land in only one of them.

**What was deliberately not done.** The floor forces `overflow: auto` and a
`min(90vh, 100%)` cap onto six bespoke modal cards that own an internal
scroller, which gives each of them a second scrollbar around the one it already
has. Those cards' own `background`/`border`/`border-radius`/`box-shadow` are
dead at 0-1-0 and have been moved onto M3 roles so they land correctly if the
floor is ever retired, but the overflow conflict is left alone: fixing it means
either editing the floor every other overlay depends on, or restating intent at
0-4-0, and neither should be chosen without seeing the result. Likewise the
three `.toggle-switch` consumers, the three integration row idioms, the
`connector-drawer`'s floating-card geometry, and the ~99 sites reading the five
tokens (`--danger`, `--warning`, `--success`, `--accent-contrast`, `--scrim`)
that are declared nowhere and always paint their literal fallbacks. The
`var(--workspace-tabs-chrome-height, 38px)` fallbacks are also left at 38px
although no rule now declares 38px: the fallback only applies where no ancestor
declares the variable, and its literal text is pinned by a component spec.

**Changed files:**

- `apps/web/src/styles/shell.css`
- `apps/web/src/styles/viewer/routines.css`
- `apps/web/src/styles/chat.css`
- `apps/web/src/styles/home/entry-layout.css`
- `apps/web/src/styles/home/new-project-modal.css`
- `apps/web/src/styles/home/plus-menu.css`
- `apps/web/src/styles/home/tasks.css`
- `apps/web/src/styles/home/use-everywhere.css`
- `apps/web/src/styles/viewer/templates-plugins.css`
- `apps/web/src/styles/viewer/theater.css`
- `apps/web/src/styles/workspace/drawer.css`
- `apps/web/src/components/FigmaImportModal.module.css`
- `apps/web/src/components/LibraryUploadModal.module.css`
- `apps/web/src/components/MessageCenter.module.css`
- `apps/web/src/components/ManualEditTextToolbar.module.css`
- `apps/web/src/components/regex/RegexSearchField.module.css`
- `apps/web/src/components/changelog/ChangelogDateRange.module.css`
- `apps/web/tests/styles/wave8-overlay-m3.test.ts`
- `apps/web/tests/styles/workspace-tabs-chrome.test.ts`

### 2026-08-04 — A module mock is all-or-nothing, and two suites found out

**Reason:** the tab work added a `WORKSPACE_TAB_PANEL_ID` export so the shell
body can carry the `aria-controls` the tab strip points at. Two suites mock that
whole module, and `vi.mock` replaces the *entire* module rather than merging with
it — so both suites died at import with `No "WORKSPACE_TAB_PANEL_ID" export is
defined on the ... mock`, an error that names the export and says nothing about
the change that introduced it. Eight tests, none of them about tabs.

Also fixes a real defect in the changelog's new regex search rather than only its
test. `entryHaystack` lowercases, because the plain-text path folds its query
too — but handing that folded string to a user's pattern makes `/Added/`
impossible to satisfy and quietly strips the `i` flag of any meaning, since there
is no case left for it to ignore. The regex path now receives
`entryHaystackRaw`, and a test pins that it gets the original case.

**Changed files:**

- `apps/web/src/lib/changelog/filter.ts`
- `apps/web/tests/changelog-filter.test.ts`
- `apps/web/tests/components/App.previewKeepAlive.test.tsx`
- `apps/web/tests/components/App.project-create-race.test.tsx`
- `apps/web/tests/components/FileViewer.test.tsx`
- `apps/web/tests/styles/workspace-tabs-chrome.test.ts`

**Two more of the same family, found by the same run.** A Material Symbol is a
ligature: the glyph is produced by putting its *name* in the element's text, so
`<span aria-hidden>description</span>` draws a document icon and contributes the
literal word "description" to `textContent`. The span is correctly hidden from
the accessibility tree, so accessible names are right — it is only a raw
`textContent` read that sees the ligature, and `FileViewer`'s menu assertions
were doing exactly that. They now strip `aria-hidden` nodes, so they test the
label rather than the icon set.

And `workspace-tabs-chrome.test.ts` pinned the composer's old hand-mixed border
after Wave 5 moved that shell onto M3 roles — `surface-container-high` at
`corner-l` with an `outline-variant` hairline. Only that one assertion moved; the
hover and focus borders still carry accent mixes.

### 2026-08-04 — Give the version history a window, so the snapshots stop being a thing only `curl` can see

**Reason:** the daemon has kept an append-only Git snapshot of every record and
setting since the `2026-08-03` entry below — `apps/daemon/src/history/` and five
`/api/history` routes — and nothing in the application could open it. A search
of `apps/web/src` for `VersionHistory`, `versionHistory` or `version-history`
returned no file, no importer and no reference. The undo existed; the door did
not. This adds the panel.

**What it does.** It lists revisions, filters them four ways at once, shows what
a revision changed down to the stored bytes, restores one, and manages retention
and pruning. Four decisions are worth writing down, because each is the opposite
of what a shorter implementation would have done.

*The action filter is derived, not declared.* The obvious version of "filter by
action" is a fixed menu of the seven verbs the standard names — created,
updated, deleted, restored, undone, imported, settings changed — and that menu
is wrong the moment it disagrees with the store. Nothing in this daemon records
an *import*, so an import filter would sit there offering a click that can never
match. Here the facets are computed from the loaded revisions: an action appears
only when a revision carries it, carrying the count that made it appear, and the
day the store starts recording imports the filter turns up without a line
changing in the panel. `recorded` is its own bucket rather than being folded
into `updated`, because a revision that could not be classified is not evidence
that something was updated.

*The counts describe the loaded set, not the filtered one.* Clicking a facet
must not rewrite the numbers that explained why it was worth clicking, or the
row becomes a set of figures that move whenever they are used.

*Restore is an ordinary button, not a destructive gate.* History is append-only:
restoring writes the historical bytes back and records a NEW revision on top, so
the state being replaced is still there and can be restored in turn. Dressing
that up as an irreversible action would misdescribe the one operation in this
application that genuinely cannot lose anything — and the panel says so in words
above the button, because a history nobody trusts is a history nobody opens.

*The dates are the user's, not UTC's.* A revision written at 23:30 has to fall
inside the range that names the day it visibly happened, so the day a revision
belongs to is computed locally and compared lexically against what the calendar
hands back. The date control is the changelog's own `ChangelogDateRange` rather
than a second calendar built to the same specification, and the search field is
the shared `RegexSearchField` with a controller of its own — never one shared
between two fields.

The panel is mounted once in `App.tsx` and opened by event from Settings → About
and from the entry help menu, the same shape the changelog viewer already uses.
A failed history read never takes a surface down with it: every client call
resolves with the daemon's own message instead of throwing, and the list already
on screen stays there under the error line. Credential-adjacent domains keep
their existing treatment — the daemon refuses to return their stored bytes, and
the panel shows the size and the SHA-256 instead, so a revision stays verifiable
without history becoming a side channel.

The stylesheet's doubled `.dialog.dialog` selector is deliberate. `Dialog` puts
the module class and the global `modal` class on the same element and keeps the
shared rules inside `:where()`, so `.modal`'s `width: 520px` decides the card
unless a selector genuinely outranks it; a single class would only tie, and be
settled by stylesheet order that nothing guarantees.

**Not done, and not claimed:** the panel is absent from the command palette, no
capture has been taken of it, and nothing here has been executed — this checkout
has no Node toolchain, so the types, the tests and the rendering are all
unverified until CI runs them.

**Changed files:**

- `apps/web/src/App.tsx`
- `apps/web/src/components/SettingsDialog.tsx`
- `apps/web/src/components/history/VersionHistoryDialog.module.css`
- `apps/web/src/components/history/VersionHistoryDialog.tsx`
- `apps/web/src/components/history/open-history.ts`
- `apps/web/src/i18n/locales/ar.ts`
- `apps/web/src/i18n/locales/de.ts`
- `apps/web/src/i18n/locales/en.ts`
- `apps/web/src/i18n/locales/es-ES.ts`
- `apps/web/src/i18n/locales/fa.ts`
- `apps/web/src/i18n/locales/fr.ts`
- `apps/web/src/i18n/locales/hu.ts`
- `apps/web/src/i18n/locales/id.ts`
- `apps/web/src/i18n/locales/it.ts`
- `apps/web/src/i18n/locales/ja.ts`
- `apps/web/src/i18n/locales/ko.ts`
- `apps/web/src/i18n/locales/pl.ts`
- `apps/web/src/i18n/locales/pt-BR.ts`
- `apps/web/src/i18n/locales/ru.ts`
- `apps/web/src/i18n/locales/th.ts`
- `apps/web/src/i18n/locales/tr.ts`
- `apps/web/src/i18n/locales/uk.ts`
- `apps/web/src/i18n/locales/zh-CN.ts`
- `apps/web/src/i18n/locales/zh-HK.ts`
- `apps/web/src/i18n/locales/zh-TW.ts`
- `apps/web/src/i18n/types.ts`
- `apps/web/src/lib/history/actions.ts`
- `apps/web/src/lib/history/client.ts`
- `apps/web/src/lib/history/export.ts`
- `apps/web/tests/lib/history-actions.test.ts`

### 2026-08-04 — The conversation gets two bubbles instead of one

**Reason:** roadmap § 2.4 Wave 5. The chat had a user bubble and, facing it,
nothing: `.msg` sets `background: transparent; border: none` and no rule
re-added a surface for the assistant, so one side of the conversation was a
tinted card and the other was loose prose on the page. The bubble that did
exist was a `--selected` fill with a hard-coded `#fff` foreground and a
darkened 1px border — a colour outside the M3 role set, ink that cannot
adapt, and a shadow on a surface that does not float.

Both sides are Material Design 3 tonal bubbles now, with the asymmetric
corner the standard specifies: three round corners and a small one on the
side the message came from, so the shape says who is speaking rather than
leaving the colour to do it alone. The user takes `primary-container`, the
assistant `surface-container-high`. Both radii come off the corner scale —
corner-l for the round corners and corner-xs for the tail. The mockup writes
20px and 6px, and neither is a step on the documented scale; 16 and 4 are,
and the shape reads the same.

Only the prose takes the assistant's bubble. Tool cards, status pills and the
message footer are siblings inside `.assistant-flow` and stay outside it,
exactly as the mockup draws them: the bubble is the message, not the turn.
The prose block's `max-width` grew by its own two insets, because `68ch` was
tuned as a measure of TEXT and padding counts inside `max-width` — leaving it
alone would have quietly shortened every line by 32px.

**The tool-call card did not exist.** `.op-card` said `border: none;
border-radius: 0; background: none` in `viewer/code.css`, and the `.app`-
prefixed twin in `viewer/routines.css` said it again — two files agreeing
that a card should not be drawn. It is a corner-m card on `surface-container`
now, one tone above the bubble beside it, so a run of tool calls reads as a
list of cards rather than as indented text. `padding: 0` on that rule is
load-bearing rather than tidy: `.action-card-body > .op-card` sets `padding:
4px 0` at the same specificity and in an earlier file, so without the reset
the fill would have shown above and below the row instead of behind it.

The typing indicator became the mockup's tonal pill — same tone as the
bubble that follows it, fully rounded rather than tailed, because a transient
status is not a message. It had been a bare line of shimmering text with no
surface at all, indistinguishable from a paragraph that happened to be
animating.

**The composer is the interesting one, and it is a cascade trap in the
opposite direction to the rest of this file.** Everywhere else in the chat,
the `.app`-prefixed rule in `viewer/routines.css` wins over `chat.css`.
`ChatPane` portals the composer to `document.body`, so for the composer the
`.app` twins render **nowhere at all** and the `.chat-composer-fixed-layer`
ones are live — one of the inert rules even carries a comment claiming it
raises specificity, which it does, for an element that is no longer inside
it. Every composer rule touched here was written in both places and the new
test asserts both, because a rule that silently renders nothing is precisely
how a fix gets written into the wrong file and reported as done.

Send morphs on hover, corner-s to corner-l on the contract's spring — the
same treatment Wave 2 gave the home screen's send button — and takes
`primary`/`on-primary` in place of `--accent` and a literal `white`. Getting
the morph to be visible needed a deletion as well as an addition: send sat
in a grouped rule that flattened its corner to `--radius-sm`, and that rule
outranks the base one, so the animation would have been written, shipped and
pinned to a single value at both ends. It has left the group; the `+` button
and the two import controls keep it. Two more defects were fixed on the way:
the send button's focus style was `outline: none` with a soft box-shadow,
which cancelled the app's own `button:focus-visible` ring and is not a
visible focus indicator on a dark surface, and the stop state's
`--text`-on-`--bg-panel` pair became the `inverse-surface` roles that
actually mean "the opposite of the surface you are on" in both themes.

**Not done in this pass:** the mockup's typing indicator animates three
pulsing dots and this one keeps the existing shimmering label inside its new
pill, because swapping the animation is a markup change in a 4,100-line
component for no change in what the indicator communicates. The wave's own
definition of done also asks for captures from an installed build in both
themes, at four display scales, at narrow width and in bilingual mode. None
of that is verified here — there is no build in this environment — so the
wave's box stays unticked.

**Changed files:**

- `apps/web/src/styles/chat.css`
- `apps/web/src/styles/viewer/routines.css`
- `apps/web/tests/styles/conversation-m3.test.ts`

### 2026-08-04 — A switch that is 52×32, and the rows it sits in

**Reason:** roadmap § 2.4 Wave 4. The application drew a toggle in five
places and not one of them was a Material Design 3 switch: `.toggle-switch`
at 36×20 with a 14px dot, `.toggle-switch-sm` at 30×17 with an 11px one,
`.compact-toggle-switch`, `.viewer-toggle .switch`, and — in the MCP server
list — a raw `<input type="checkbox">` with no styling at all. All five were
a `<label>` wrapping a checkbox, which assistive technology announces as
"checked"/"not checked" rather than as on or off, and which gives the host no
way to refuse a change the daemon rejected.

`Switch` is the component that was missing: a 52×32 track, `role="switch"`
with `aria-checked`, a real `<button>` so Space and Enter come from the
platform rather than from a `keydown` handler each call site has to remember,
a primary focus ring, an optional icon, and a 40px state layer that sits on
the handle rather than flashing the whole pill. **The handle changes size
between states** — 16px off, 24px on, 28px pressed — which is the part every
hand-rolled version dropped and the part that carries the affordance: off is
a small dot in a hollow track, on is a full handle in a filled one, and a
switch whose handle is one size is a switch you have to read the colour of.
The geometry is written against the track's content box, which is 48×28
rather than 52×32 because the 2px outline is drawn inside the border box; a
handle M3 places 8dp from the outer edge therefore sits at 6px, and the
selected handle's 22px is the number the mockup wrote, reached from the same
rule. It is stateless: the host owns `checked` and is told which value the
user asked for, so a rejected PATCH leaves the control telling the truth
rather than showing a state that was never persisted.

**The automation rows.** Both of them — the Automations page and the same
feature in Settings, which were two different cards for one thing. They are
M3 list rows now: an `outline-variant` hairline over `surface-container-low`
at corner-l, rising by one surface tone on hover rather than by a shadow,
because a row that lifts off the list it belongs to reads as a card that came
loose. The leading glyph became the mockup's 44px tonal tile, the title line
gained the enabled/paused state chip, and pause/resume — a button whose label
flipped between two words — became the switch.

The state chip is declared once and used by both surfaces, which is the Wave
3 lesson applied before it could be re-learned. Its two states are chrome and
take theme roles. The run-status chip beside it is a different animal: five
colours encoding running/queued/succeeded/failed/canceled is a status
palette, which the Material Design standard exempts as data rather than
chrome, so those hues are untouched and only the chip's shape and type moved.

**`.btn-primary` is declared nowhere.** Nor are `.btn-ghost` or
`.btn-danger`, and all three are written on buttons across this codebase. The
consequence was visible and had no obvious cause: in the Settings automation
list, "Run now", "Edit", "History" and "Delete" rendered as four identical
grey containers, because the only rule reaching them was the base `button`
primitive. The row's high-emphasis action needed a variant that did not
exist, so `button.tonal` joins the shared primitive sheet —
`primary-container` under `on-primary-container`, which is M3's answer for a
recurring row action; the filled button is not, because a list of rows each
carrying a full accent reads as a page of calls to action. Delete now takes
the `error` role. One subtlety is pinned by a test rather than left to be
rediscovered: the row's own hover rule is 0,2,0 and `button.tonal` is 0,1,1,
so without a `:not(.tonal)` the one high-emphasis action in the row would
lose its container the moment it was pointed at.

**The Integrations selector.** A four-column grid of two-line cards inside a
shadowed panel, which is a tray of pills and not a component M3 defines — it
read as four buttons rather than as one control with four positions. It is
the same segmented button the four collection controls took in Wave 3, to the
same contract, focus ring inset for the same reason: the container clips its
own radius, so an offset ring is cut away on precisely the first and last
segment. No copy was lost in the conversion — each tab's second line is
stated below the strip for whichever area is selected, where a long localized
string can wrap instead of being ellipsised away inside a segment. At narrow
widths the strip stops hugging its content and its segments share the full
width, because an `inline-flex` container that clips would otherwise cut the
fourth segment off rather than shrink it.

The MCP row's raw checkbox and the Skills row's 30×17 slider are both the new
switch, and the connector status chip took M3 chip anatomy with its
connected/error/pending palette left alone for the same reason the run-status
one was.

**Deliberately not done.** The three integration panels have three different
row idioms — a flat bordered MCP row, a Skills row with an accent left-rail
and three uppercase pills, and a connector *card grid* — and unifying them is
a larger job than this wave, so the rows themselves are recorded as remaining
Wave 4 work rather than half-converted. `.toggle-switch` still has three
consumers outside the surfaces this wave names (`MemorySection`,
`MemoryHooksPanel`, `DesignSystemsSection`); they should move to the new
component in the wave that reaches them. Four translation keys —
`routines.pause`, `routines.resume`, `automations.pause`,
`automations.resume` — lost their last caller and are left declared rather
than deleted from twenty locale files for a control that may return. The MCP
switch's accessible name is still hard-coded English, exactly as the checkbox
it replaced was; that is a real defect and a different one.

**One thing the migration dropped, found by a red build.** Three of the five
hand-rolled toggles were a `<label>` carrying a `title` — a hover tooltip on
a control with no adjacent text — and the switch had no way to keep one, so
converting the Skills and MCP rows silently removed theirs. `Switch` takes an
optional `title` now and both call sites pass what they passed before. It is
opt-in rather than derived from `label`, because a switch sitting beside a
name that already reads "Morning briefing" does not want a tooltip repeating
it.

The suite that caught it, `SettingsDialog.execution.test.tsx`, was written
against the old control in a second way that restoring the tooltip would have
papered over: it found the control with `getAllByTitle('Toggle')` and clicked
the `<label>`, relying on label-to-input activation. Querying a tooltip
attribute is what coupled the assertion to the markup, so it moves to the
role and the accessible name — which are the contract — and now also asserts
`aria-checked` before the click. Both halves were wrong: the component had
genuinely lost something, and the test was reaching for it in a way that
would break again at the next restyle.

**Also not done:** the wave's definition of done asks for captures from an
installed build in both themes, at four display scales, at narrow width and
in bilingual mode. There is no build in this environment, so the wave's box
stays unticked.

**Changed files:**

- `apps/web/src/components/Switch.module.css`
- `apps/web/src/components/Switch.tsx`
- `apps/web/src/i18n/locales/ar.ts`
- `apps/web/src/i18n/locales/de.ts`
- `apps/web/src/i18n/locales/en.ts`
- `apps/web/src/i18n/locales/es-ES.ts`
- `apps/web/src/i18n/locales/fa.ts`
- `apps/web/src/i18n/locales/fr.ts`
- `apps/web/src/i18n/locales/hu.ts`
- `apps/web/src/i18n/locales/id.ts`
- `apps/web/src/i18n/locales/it.ts`
- `apps/web/src/i18n/locales/ja.ts`
- `apps/web/src/i18n/locales/ko.ts`
- `apps/web/src/i18n/locales/pl.ts`
- `apps/web/src/i18n/locales/pt-BR.ts`
- `apps/web/src/i18n/locales/ru.ts`
- `apps/web/src/i18n/locales/th.ts`
- `apps/web/src/i18n/locales/tr.ts`
- `apps/web/src/i18n/locales/uk.ts`
- `apps/web/src/i18n/locales/zh-CN.ts`
- `apps/web/src/i18n/locales/zh-TW.ts`
- `apps/web/src/i18n/types.ts`
- `apps/web/src/styles/home/integrations.css`
- `apps/web/src/styles/home/tasks.css`
- `apps/web/src/styles/viewer/routines.css`
- `apps/web/src/styles/viewer/templates-plugins.css`
- `apps/web/src/styles/workspace/connectors.css`
- `apps/web/tests/components/RoutinesSection.test.tsx`
- `apps/web/tests/components/SettingsDialog.execution.test.tsx`
- `apps/web/tests/components/Switch.test.tsx`
- `apps/web/tests/components/TasksView.analytics.test.tsx`
- `apps/web/tests/components/TasksView.page.test.tsx`
- `apps/web/tests/styles/lists-and-switches-m3.test.ts`


### 2026-08-04 — Tab groups, and the four searches that find a tab in them

**Reason:** roadmap § 4.1. The workspace strip already had pinning, drag
reordering, an overflow surface and the two text-matched bulk closes. It had no
groups at all, and exactly one search — a plain-text field over the open tabs,
wired to nothing.

**Groups.** A group is an id, a name, one of six palette colours and a collapsed
flag; membership is a separate `tabId -> groupId` map. That split is the whole
design. A group does not own an array of tab ids, because that array would
immediately disagree with the strip's own order the first time a tab was
dragged, and reconciling two orders on every drop is how a tab goes missing.
Instead the strip's list is the only order there is, and
`orderTabsByGroupMembership` rewrites it so each group's members are contiguous
— the visible order and the stored order are the same order, so a drop that
looks like "third in this group" lands third in this group.

Groups can be created, named, recoloured, reordered, collapsed, expanded and
removed; tabs move into, out of and between them by drag — a drop onto a tab in
another group joins that group — and by the tab's own context menu, which lists
every destination as a plain menu item so the whole operation is reachable with
Tab and Enter. Removing a group releases its tabs rather than closing them, and
an emptied group survives, because it is still a group somebody named.

**Persistence.** The payload goes to v3 and carries the groups, the membership
and the per-group decoration in the same write as the tabs, for the same reason
the pins are already in it: a workspace that restored its tabs and lost which
group they were in looks right and behaves wrong. Reading stays total — a v1 or
v2 payload restores every tab in no group, and a hand-edited one with numbers,
unknown colours or membership pointing at a deleted group restores a usable
strip instead of throwing.

**Four searches, four builders.** The requirement is four *separate* searches —
the current strip, the inside of every individual group, groups by their visible
name, and every open tab across every window — and each one now owns a
`useRegexSearch` controller created by the component that renders its field. The
tempting shape is one field with a scope selector, and it is a different
feature: one query that means four things, which forgets what the user typed
every time they narrow. The per-group search is its own component precisely so
its hook call is per group instance rather than a hook inside a loop. Turning
regex on in one field leaves the other three in plain text, which is the
property a shared controller cannot have.

The master search is the one that cannot read its answer out of React state,
because most of its answer is in other windows. Each window publishes a snapshot
of its strip to its own `localStorage` key and republishes on a heartbeat; the
search reads them all, prunes anything past its TTL — a window that crashed
rather than closed — and labels every result with its window, strip, group,
pinned state and visible label. A result inside a collapsed group can be
revealed without expanding it: the collapsed state is a preference the user set,
and a search result is permission to see one tab, not permission to discard it.

**Group appearance.** Right-click a group header for the full management menu,
which includes **Edit group appearance…**; Shift+right-click opens that editor
directly. It is an anchored non-modal popover that tracks its anchor, flips
above when there is more room there, bounds itself to the viewport and scrolls
inside that bound. Accent, label colour, header background, weight, size, radius
and a badge each have their own reset, and reset means deletion — a reset group
follows the theme afterwards rather than being pinned to a snapshot of it. The
decoration reaches the strip as custom properties the stylesheet reads with
fallbacks, and it never replaces the header's accessible name or its expanded
state.

**Tab semantics.** `role="tab"` moved from the wrapper `<div>` onto the button
inside it, which is the element focus actually lands on; the wrapper is
presentational and the close control sits outside the tab role. Every tab now
carries `aria-controls` pointing at the shell body, which is the `tabpanel` it
has always been in practice, and roving focus keeps exactly one tab in the tab
order with the arrow keys, Home and End moving between the tabs that are on
screen — a tab inside a collapsed group is skipped rather than being a focus
stop nobody can see.

**A truncating label is recoverable again.** A tab capped at 104px truncated to
"Welcome t…" with no `title`, so a sighted user had no way back to the full
text; the accessible name always carried it, which is exactly why nobody
noticed. Every tab and every group header now carries its full text in `title`.
An ordinary tab keeps its visible text as its only accessible name — the
`aria-label` that used to duplicate it is gone — so the hover affordance does
not become a second announcement.

**The ARIA role and the measured box are now two different nodes**, and four
existing tests were relying on them being one. The strip measures the
`.workspace-tab` wrapper carrying `data-workspace-tab-id` — the whole visible
tab, including the close control — to anchor the hover preview and to compute
the midpoint that decides whether a drop lands before or after a tab. That has
not changed. What moved is `role="tab"`, from that wrapper onto the button
inside it, so the tests' `getAllByRole('tab')` handle stopped resolving to the
element whose rect they were mocking; the wrapper then reported an all-zero rect
and every measurement collapsed to zero. The tests now find a tab by its
accessible name and map to its box with a `tabBox` helper that says why the two
differ. They also read tab order from `title` rather than `textContent`, which
is exact and cannot be perturbed by a ligature icon contributing its own name to
an element's text.

**Changed files:**

- `apps/web/src/App.tsx`
- `apps/web/src/components/WorkspaceTabsBar.module.css`
- `apps/web/src/components/workspace-tabs/TabGroupAppearanceEditor.module.css`
- `apps/web/src/components/workspace-tabs/TabGroupAppearanceEditor.tsx`
- `apps/web/src/components/workspace-tabs/WorkspaceTabDiscovery.module.css`
- `apps/web/src/components/workspace-tabs/WorkspaceTabDiscovery.tsx`
- `apps/web/src/components/workspace-tabs/groupAppearance.ts`
- `apps/web/src/components/workspace-tabs/tabGroups.ts`
- `apps/web/src/components/workspace-tabs/tabPinning.ts`
- `apps/web/src/components/workspace-tabs/windowRegistry.ts`
- `apps/web/src/i18n/locales/ar.ts`
- `apps/web/src/i18n/locales/de.ts`
- `apps/web/src/i18n/locales/en.ts`
- `apps/web/src/i18n/locales/es-ES.ts`
- `apps/web/src/i18n/locales/fa.ts`
- `apps/web/src/i18n/locales/fr.ts`
- `apps/web/src/i18n/locales/hu.ts`
- `apps/web/src/i18n/locales/id.ts`
- `apps/web/src/i18n/locales/it.ts`
- `apps/web/src/i18n/locales/ja.ts`
- `apps/web/src/i18n/locales/ko.ts`
- `apps/web/src/i18n/locales/pl.ts`
- `apps/web/src/i18n/locales/pt-BR.ts`
- `apps/web/src/i18n/locales/ru.ts`
- `apps/web/src/i18n/locales/th.ts`
- `apps/web/src/i18n/locales/tr.ts`
- `apps/web/src/i18n/locales/uk.ts`
- `apps/web/src/i18n/locales/zh-CN.ts`
- `apps/web/src/i18n/locales/zh-TW.ts`
- `apps/web/src/i18n/types.ts`
- `apps/web/tests/components/WorkspaceTabsBar.groups.test.tsx`
- `apps/web/tests/components/WorkspaceTabsBar.pinning.test.ts`
- `apps/web/tests/components/WorkspaceTabsBar.test.tsx`
- `apps/web/tests/components/workspace-tabs/groupAppearance.test.ts`
- `apps/web/tests/components/workspace-tabs/tabGroups.test.ts`
- `apps/web/tests/components/workspace-tabs/windowRegistry.test.ts`
- `apps/web/tests/styles/workspace-tab-groups.test.ts`

### 2026-08-04 — Bundle the three Material Design 3 faces, and move 94 icons onto the symbol font

**Reason:** the token sheet has named `'Roboto Flex'` at the head of
`--md-ref-typeface-plain` and `'Roboto Mono'` at the head of
`--md-ref-typeface-mono` since `dea6b0a`, and nothing ever served either one —
so every surface in the product rendered in the platform fallback behind them,
silently, because a font stack has no error state. All eleven files now ship
under `public/fonts/` beside Cairo: Roboto Flex in six subsets (OFL-1.1,
261,888 bytes, `wght` 100–1000 plus the browser-driven `opsz`), Roboto Mono in
six (OFL-1.1, 134,568 bytes, `wght` 100–700), and Material Symbols Rounded as
one variable icon file (Apache-2.0, 1,376,348 bytes, with `FILL` and `opsz`
live and `wght`/`GRAD` pinned to save 3.9 MB). Each is the exact byte stream
Google Fonts served for a stated request; nothing was subsetted, re-encoded or
generated here. Both text stacks gained a Windows, Apple and Noto family for
Arabic, Thai, Simplified Chinese, Traditional Chinese, Japanese and Korean,
because nine of the twenty shipped locales are written in a script neither
Roboto face has one glyph for and bilingual mode puts English and 廣東話 on the
same line.

The icon half is a migration, not just a file. Remixicon had 61 distinct names
across 95 call sites in seven files; 94 of them moved to a new `MaterialSymbol`
component, and the four sites that pick a glyph indirectly now return a typed
`MaterialSymbolName` so the compiler covers them. Material Symbols addresses a
glyph by the ligature of its name, so an unknown name renders as English text in
the toolbar rather than as a box — every mapping was therefore validated against
the 4,268-name codepoints list published with the font, the icon face ships with
no `font-display` and no fallback family, and a spec pins all of it.
`SocialShareGrid.tsx` deliberately stays on the incumbent font: its nine glyphs
are brand marks, Material Symbols carries no brand logos, and substituting one
is a trademark question rather than an icon one. `lucide-react` was declared and
imported by nothing, so it and its three lockfile entries are gone — the
lockfile edit is not optional, because a manifest that disagrees with it fails
`pnpm install --frozen-lockfile`.

**Follow-up, after continuous integration ran it.** Two specs failed and both
are recorded here because each changed a decision rather than a line.

*The font stack.* `tests/styles/default-background.test.ts` is upstream's, and
it pins a rule named "prefers platform UI fonts over optional local app fonts" —
the stack must not open with a family the product does not ship. Its named
counter-example is `Inter`, which is vendored nowhere here, so the rule's reason
is **availability**: leading with an unshipped face makes the interface depend
on what happens to be installed. That premise does not cover `Roboto Flex`,
which is now bundled and served from the product's own origin and is therefore
present by construction — more deterministic than `-apple-system`, which
resolves differently on every OS version. The rule was restated rather than
deleted: **only a face this repository actually ships may lead**, checked
against the `@font-face` rules in the expanded cascade rather than a hardcoded
name, so bundling or unbundling a face moves the spec automatically. Upstream's
chain is otherwise untouched and in its original order — `Roboto Flex` is
prepended and the script families appended, nothing in the middle reordered, so
the contiguous `'Segoe UI', 'Microsoft YaHei UI', 'Noto Sans'` run survives.

*A test that contradicted its own stylesheet.* The spec asserting the symbol
component leaves the optical-size axis alone searched the whole file for `opsz`
and matched the comment that explains why the axis is left live. The comment was
doing useful work, so the assertion was the thing at fault: it now scopes to the
`font-variation-settings` declarations and additionally forbids
`font-optical-sizing`.

*And a correction carried in from another session.* A note in the mapping table
claimed the bundled face does not carry `smartphone`, citing a ligature table of
"3,967 targets". Decompressing the shipped woff2 and walking `cmap` + `GSUB`
shows the table holds **4,268 ligature names** — the same 4,268 the published
codepoints list has — resolving to **3,967 distinct target glyphs**, the gap
being aliases. `smartphone` and `mobile` are one such pair, both targeting glyph
2239, so either name renders the identical icon. 3,967 is a count of glyphs, not
of addressable names. All 49 names the mapping renders were re-checked this way
and all 49 pass. The functional choice was left as it shipped; only the
reasoning is corrected, and the method is written up so it can be re-run rather
than re-argued.

**Changed files:**

- `apps/web/package.json`
- `pnpm-lock.yaml`
- `apps/web/tests/styles/default-background.test.ts`
- `apps/web/src/index.css`
- `apps/web/src/styles/md3-tokens.css`
- `apps/web/src/styles/roboto-flex.css`
- `apps/web/src/styles/roboto-mono.css`
- `apps/web/src/styles/material-symbols.css`
- `apps/web/src/components/MaterialSymbol.tsx`
- `apps/web/src/components/MaterialSymbol.module.css`
- `apps/web/src/components/WindowTitleBar.tsx`
- `apps/web/tests/styles/bundled-fonts.test.ts`
- `apps/web/tests/components/WindowTitleBar.test.tsx`
- `apps/web/tests/components/AvatarMenu.test.tsx`
- `apps/web/tests/components/PreviewDrawOverlay.test.tsx`
- `apps/web/tests/components/DesignBrowserPanel.webview.test.tsx`
- `apps/web/public/fonts/roboto-flex/roboto-flex-latin.woff2`
- `apps/web/public/fonts/roboto-flex/roboto-flex-latin-ext.woff2`
- `apps/web/public/fonts/roboto-flex/roboto-flex-cyrillic.woff2`
- `apps/web/public/fonts/roboto-flex/roboto-flex-cyrillic-ext.woff2`
- `apps/web/public/fonts/roboto-flex/roboto-flex-greek.woff2`
- `apps/web/public/fonts/roboto-flex/roboto-flex-vietnamese.woff2`
- `apps/web/public/fonts/roboto-mono/roboto-mono-latin.woff2`
- `apps/web/public/fonts/roboto-mono/roboto-mono-latin-ext.woff2`
- `apps/web/public/fonts/roboto-mono/roboto-mono-cyrillic.woff2`
- `apps/web/public/fonts/roboto-mono/roboto-mono-cyrillic-ext.woff2`
- `apps/web/public/fonts/roboto-mono/roboto-mono-greek.woff2`
- `apps/web/public/fonts/roboto-mono/roboto-mono-vietnamese.woff2`
- `apps/web/public/fonts/material-symbols/material-symbols-rounded.woff2`

### 2026-08-04 — The one search bar that had no regex builder was the one whose requirement names regex

**Reason:** every search bar in the product opens the regex builder anchored
beside it — thirteen surfaces do. The changelog viewer's did not: it was a bare
text input. That is the surface whose own stated requirement is *"regex-capable
search that composes with the date filter"*, so it was both the most obviously
required and the easiest to miss, because the feature it was missing is one you
only notice by trying to use it.

`filterChangelog` now takes an optional compiled predicate, and the dialog
passes it **only in regex mode**. Plain text deliberately keeps its own path:
it splits the query into terms that must all appear, so "density readout" finds
an entry containing both words in either order. Routing plain text through a
single compiled pattern would have quietly narrowed that to a contiguous
substring match — a behaviour change nobody asked for, in the direction of
finding less.

The controller is this field's own, as the standard requires; no search bar in
the application shares one.

**Changed files:**

- `apps/web/src/components/changelog/ChangelogDialog.tsx`
- `apps/web/src/lib/changelog/filter.ts`
- `apps/web/tests/changelog-filter.test.ts`

### 2026-08-04 — A collapse button that only collapsed, in a rail that starts collapsed

**Reason:** driving a released build found "Collapse sidebar" doing nothing on
the home screen. It was not a layout bug: the button called `onClose`
unconditionally, and the rail's default state is collapsed. So on a fresh
profile the first click sets `false` to `false` — nothing moves, nothing is
announced, and the control reads as broken because in that state it is.

It is a toggle now, and it says which way it goes. Both this button and the
topbar toggle carried the same static label in both states, which told a
screen-reader user that pressing it would expand a rail that was already
expanded; `aria-expanded` reports where the rail *is*, and the label reports
where the button will *take* it, so only the label flips.

The test covers the collapsed case specifically. The expanded case always
worked, so a test asserting only "collapse collapses it" would have stayed
green through the entire life of the defect.

**Changed files:**

- `apps/web/tests/components/EntryNavRail.toggle.test.tsx` (new)

### 2026-08-04 — The four collections stop being four different products

**Reason:** roadmap § 2.4 Wave 3. The application has four collection surfaces
— projects, design systems, library assets and plugins — and they were four
separate answers to the same question. Five stylesheets, two of them CSS
Modules, each declared its own card: 12px, 16px and `--radius` corners; three
different hover treatments; three different fills. The filter rows disagreed
too, and the single-select controls most of all — a projects sub-tab, a library
view toggle, a plugin sort toggle and a marketplace catalog filter were four
widgets doing one job.

**Cards.** All five are Material Design 3 outlined cards now: an
`outline-variant` hairline over `surface-container-low` at corner-l, flat at
rest, lifting three pixels to elevation 2 on hover. The lift takes the
contract's spring curve, which overshoots and so needs its full 300ms period,
while colour and elevation stay on the house ease-out — the same split Wave 2
used on the home screen's scenario cards.

**Filter chips.** The three chip families — the application-wide `.filter-pill`,
the plugin facet pills and the plugin Saved chip — are one 36dp fully-rounded
chip: a 1dp `outline` hairline over no fill, `on-surface-variant` at
label-large, and a `secondary-container` fill when selected. The selected
border is kept at 1px *transparent* rather than removed, because dropping the
hairline moves every chip in the row by two pixels the moment one is picked.
The facet pills previously filled with the full accent colour and white ink,
which made a row of filters read as a row of primary buttons; that is exactly
what the `.filter-pill` sheet's own comment had warned against years earlier
for the same reason, and M3 resolves it by reserving the accent for actions.

**The segmented control.** All four single-select controls are now one M3
segmented button: a single fully-rounded `outline` container whose segments are
divided by that same hairline, with `secondary-container` on the selected one —
the mockup's Grid/List control. The previous shape was a tray of separate inner
pills with a raised active one, which is not an M3 component at all.

Focus on a segment is an INSET ring, and that detail is load-bearing rather
than stylistic: the container clips its own outer radius, so an
`outline-offset: 2px` ring is cut away on precisely the first and last segment
— the two a keyboard user reaches first, which would have made the control look
unfocusable exactly where it is most used.

Two real accessibility defects were fixed on the way. `.design-card` is a
`role="button"` with `tabIndex={0}` and had **no** focus style at all, so a
keyboard user tabbing the projects grid could not see where they were; it has a
primary focus ring now, as do the marketplace card and the design-system card's
focusable region, whose old indicator was a soft tint. Every hover lift is
disabled under `prefers-reduced-motion`.

**Deliberately not done:** the mockup draws a leading check glyph on a selected
filter chip and on the active segment. Adding it needs either a shared glyph
asset or four copies of a masked data URI, and selection is already carried by
the fill, the outline's presence or absence, and `aria-pressed` — so it is
recorded here as remaining Wave 3 work rather than smuggled in as a
pseudo-element that assistive technology might announce. `.ds-card` in
`drawer.css` was left alone: it has no consumer in the application and styling
dead selectors would only make them look alive.

**Changed files:**

- `apps/web/src/components/LibrarySection.module.css`
- `apps/web/src/styles/home/marketplace.css`
- `apps/web/src/styles/home/plugins-home.css`
- `apps/web/src/styles/viewer/composio.css`
- `apps/web/src/styles/viewer/library.css`
- `apps/web/src/styles/workspace/drawer.css`
- `apps/web/tests/styles/collections-m3.test.ts`
- `apps/web/tests/styles/filter-pill.test.ts`

### 2026-08-04 — Overlays that paint their own card, and stop at the edge of the screen

**Reason:** the roadmap's overlay wave asks two things of every menu, popover,
sheet and dialog — that it paints its own background, border, elevation and
shape, and that it bounds its height to the space available and scrolls inside
that bound. The shared dialog kept neither promise, and the shared context menu
was painted the same colour as the panels it opens over.

The dialog is the one worth reading about, because the defect hides behind a
piece of cascade nobody would guess at. `Dialog` puts **two** classes on the
same element: its CSS-module class and the global `modal` class. The module
writes its card rule inside `:where()`, which is zero specificity — so for every
declaration the two rules share, the *global* one wins. The module file is the
one a reader finds by following the import, and it had not been the file that
decided what a dialog looked like for some time. Both are now written to say the
same thing, and a test compares them property by property, because the failure
mode of leaving them apart is an edit that changes nothing on screen and gives
no indication of why.

What they now say is Material Design 3 dialog anatomy — the extra-large corner
on `surface-container-high` at elevation 3 — plus a 1px `outline-variant`
hairline, which M3 itself does not draw. That is deliberate: the tone step from
a scrim-dimmed page to the card is small in dark mode, and a card told apart
from what is behind it by its shadow alone is the transparent-overlay failure
wearing a different hat.

The height bound is the part that was missing outright. There was none at all:
the card grew to fit its content, the centring backdrop then pushed the overflow
off **both** the top and the bottom of the viewport, and nothing scrolled. A
confirmation dialog can lose its own two buttons that way — the user is shown a
question and neither answer, with no scrollbar to suggest anything is missing. A
sectioned dialog scrolls its body instead of its whole card, so its header and
its ruled footer stay put; `min-height: 0` on that body is the load-bearing
half, because a column flex item defaults to `min-height: auto` and would push
the footer off the bottom rather than scroll.

The context menu moved to `surface-container-high` for the same reason it was
hard to see: `--bg-panel` is the surface a sidebar is painted with, so a menu
opened over one was a menu found by its shadow. Its rows are the mockup's 44px
now rather than about 32, which is also the first height that clears the pointer
target size the accessibility rules hold the rest of the product to, and the
keycaps moved one tone up to `surface-container-highest` — they had been painted
the colour the card has just become, which would have made them keycaps with no
cap. The placement estimate in the component moved with the stylesheet: it runs
before layout and cannot measure the card, so its row height and inset are kept
in step by hand and named as such.

The shortcut column itself needed no change and now has a test, which is the
point of the test. `ContextMenu` draws its keycaps from `shortcuts/registry` and
`DesignFilesPanel` installs its handlers from the same list, so what is
displayed and what fires cannot drift. Every expectation in the new suite is
derived from that registry rather than hard-coded, so renaming a binding moves
the menu and the test together and *unwiring* one fails.

One more silent delete, found by sweeping for a capped height with no scroller:
the composer plus-menu's preview column. Its flyout has a hard 320px height and
clips, and the column had `overflow: hidden` of its own, so a skill with several
trigger chips pushed its example block somewhere it was simply not drawn. It
scrolls now, keeping the horizontal clip that stops a long plugin name widening
the flyout.

**Not done in this pass:** the wave's own definition of done asks for captures
from an installed build in both themes, at four display scales, at narrow width
and in bilingual mode. None of that is verified here — there is no build in this
environment — so the wave's box stays unticked.

**Changed files:**

- `apps/web/src/components/ContextMenu.module.css`
- `apps/web/src/components/ContextMenu.tsx`
- `apps/web/src/styles/home/plus-menu.css`
- `apps/web/src/styles/workspace/mention-home.css`
- `apps/web/tests/components/ContextMenu.test.tsx`
- `apps/web/tests/styles/overlay-surfaces.test.ts`
- `packages/components/src/dialog.module.css`
- `packages/components/tests/dialog-surface.test.ts`

### 2026-08-04 — Five places text was cut with nothing to say it had been

**Reason:** the pinned templates hint had been lifted off the template cards,
but only half of the overlap it was reported for. Both pinned pills sit at
`bottom: 18px`, and that offset is measured from the bottom of the **viewport**,
whose last 28px is the status bar. The pill's lower third was therefore drawn
on top of the strip's own segments — the same overlap as before, with the
application's chrome underneath instead of the cards. Both offsets now start at
the strip's published height, and the band the scroll column gives up is
measured up from the top of the strip rather than from the bottom of the
window, so the whole arrangement is one token and one gap.

**And four instances of the defect that caused it.** `text-overflow: ellipsis`
applies only to a **block container**. Declared on a flex container it does
nothing at all, and a bare text child of a flex container is an *anonymous flex
item* the property cannot reach — so the text is clipped mid-glyph, with no
ellipsis and no way to tell it was cut. The status bar's own density readout
was fixed this way once already; these are the rest of them:

- The **new project panel's pickers**. `.ds-picker-title` and
  `.ds-picker-item-title` are flex containers so a `+N` pill or a status badge
  can sit beside the name, and the name itself was bare text — across eleven
  render sites covering platforms, prompt templates, design systems, models and
  MCP clients. Each name now lives in a span of its own, which is what the
  ellipsis can land on, and the pill and badge stop shrinking so the name is
  what yields room rather than the count of what it left out.
- The **model picker's trigger**. Its option rows escaped because their text is
  wrapped in a real `> span`; the trigger's value label has no element at all,
  so it becomes a block container instead. It is a flex item either way, and a
  flex item's display is blockified, so nothing about its placement moves.
- The **annotation style summary** in the comment popover, where the value can
  be a font stack or a computed CSS value. Its optional colour swatch stops
  being a flex item with a gap and becomes an inline-block with a margin, so it
  still leads the line and the ellipsis lands on the value behind it.
- The **automation next-run readout**, which is the one that should not
  truncate at all: two of its three states are whole sentences rather than a
  timestamp, and bilingual mode carries their Cantonese half as well. It wraps
  now. The 260px budget stays, because it is what keeps the row's description
  column from being squeezed, and a second line costs nothing in a column that
  is already taller than one line.

**And one overlay that deleted what it could not fit.** The slash-command
popover capped its height at the caret layer's measured budget and then hid the
overflow. It has nothing to scroll: the popover *is* the `listbox` and each
command *is* an `option`, so the rows are its direct children — past the cap
the remaining commands were painted nowhere, with no scrollbar to say anything
was missing and no keyboard route to them either. The cap is right; the box
scrolls inside it now, its head sticky so the popover still says what it is,
and its rows stop shrinking so the overflow is real rather than absorbed.

**Changed files:**

- `apps/web/src/components/SettingsDialog.tsx`
- `apps/web/src/styles/home/entry-layout.css`
- `apps/web/src/styles/home/plugins-home.css`
- `apps/web/src/styles/viewer/core.css`
- `apps/web/src/styles/viewer/library.css`
- `apps/web/src/styles/workspace/connectors.css`
- `apps/web/src/styles/workspace/mention-home.css`
- `apps/web/tests/styles/home-templates-status-bar-clearance.test.ts`
- `apps/web/tests/styles/mention-popover.test.ts`
- `apps/web/tests/styles/model-option-lock-layout.test.ts`
- `apps/web/tests/styles/project-design-system-picker.test.ts`
- `apps/web/tests/styles/settings-polish.test.ts`

### 2026-08-04 — The appearance controls, and the density that changed five numbers nobody read

**Reason:** the runtime appearance contract was half built. Seed, density, UI
scale and typography all had storage, normalisation, a live-apply function and
a preset format — and not one control. The only way to reach any of it was to
pick one of six built-in presets, so the four seeds were effectively four
buttons and the density levels were unreachable except through two of them.

Density was worse than unreachable: it did nothing. `data-density` swapped five
custom properties of which `--gap` had a single reader and `--sp`, `--pad`,
`--row` and `--card` had none, so all three levels rendered a pixel-identical
interface. The variables are driven now rather than dropped — `--sp` moves with
the rest, because a base spacing unit that stays at 8px while the gap built on
it halves is a scale that disagrees with itself — and three control-height
variables join them, because none of the original five described a control's
own height and `--row` is a 48px list row rather than a button. Their `:root`
values restate exactly what `primitives.css` hard-coded, so an install at
default density measures the same as before; only compact and comfortable move.
Every button, text field and select in the application now resizes with the
setting, which is the difference between a density control and a stored number.

Auto-fit is new, and its whole difficulty is that it has to measure the thing
it changes. Scaling divides the layout viewport, so fitting from the layout
viewport is a loop; `unscaledViewportWidth` multiplies the applied factor back
out and fits from the window, which scaling cannot move. It writes into
`uiScale` rather than living beside it, so the status bar, the preset
comparison and the exported theme keep describing the scale that is actually on
screen instead of choosing between two numbers that disagree.

The typography editor mounts `components/appearance/typography.ts`, which was
another module written and imported by nothing. The four properties this
platform cannot honour keep their control, keep the user's saved value, and say
which kind of "no" they are, exactly as that module's contract requires.

UI scale is untouched: it is still applied by `webContents.setZoomFactor` in the
desktop shell, and this change deliberately reintroduces no CSS `zoom`.

**Changed files:**

- `apps/web/src/components/SettingsDialog.tsx`
- `apps/web/src/components/appearance/AppearanceControls.module.css`
- `apps/web/src/components/appearance/AppearanceControls.tsx`
- `apps/web/src/components/appearance/AppearanceRuntime.tsx`
- `apps/web/src/components/appearance/useAutoFit.ts`
- `apps/web/src/components/command-palette/settingsIndex.ts`
- `apps/web/src/i18n/locales/ar.ts`
- `apps/web/src/i18n/locales/de.ts`
- `apps/web/src/i18n/locales/en.ts`
- `apps/web/src/i18n/locales/es-ES.ts`
- `apps/web/src/i18n/locales/fa.ts`
- `apps/web/src/i18n/locales/fr.ts`
- `apps/web/src/i18n/locales/hu.ts`
- `apps/web/src/i18n/locales/id.ts`
- `apps/web/src/i18n/locales/it.ts`
- `apps/web/src/i18n/locales/ja.ts`
- `apps/web/src/i18n/locales/ko.ts`
- `apps/web/src/i18n/locales/pl.ts`
- `apps/web/src/i18n/locales/pt-BR.ts`
- `apps/web/src/i18n/locales/ru.ts`
- `apps/web/src/i18n/locales/th.ts`
- `apps/web/src/i18n/locales/tr.ts`
- `apps/web/src/i18n/locales/uk.ts`
- `apps/web/src/i18n/locales/zh-CN.ts`
- `apps/web/src/i18n/locales/zh-HK.ts`
- `apps/web/src/i18n/locales/zh-TW.ts`
- `apps/web/src/i18n/types.ts`
- `apps/web/src/state/appearance.ts`
- `apps/web/src/styles/md3-tokens.css`
- `apps/web/tests/components/AppearanceControls.test.tsx`
- `apps/web/tests/state/appearance-auto-fit.test.ts`
- `apps/web/tests/styles/appearance-density-tokens.test.ts`

### 2026-08-04 — The first words of every launch, and the 42 waits that never checked them

**Reason:** the loading shell is the very first thing the application paints,
and it said `Loading Open Design…` inside a window titled Material Designer.

It was left until last because the string is not really one string. Forty-two
Playwright waits across thirty-four UI test files synchronise startup on it,
using hidden and count assertions — and that pairing has a failure mode no
suite reports. A wait for text the application never renders is satisfied the
instant it is evaluated. Rename the product string on its own and nothing goes
red; every startup gate quietly becomes a no-op, and the UI suite begins
failing later, elsewhere, for reasons that do not reproduce.

So the duplication went first. `e2e/lib/loading-shell.ts` now exports the text
once and every wait imports it, which means drift needs two files to disagree
rather than one file to be forgotten. `scripts/check-loading-shell.sh` proves
on every push that they still agree, reading the rendered text straight out of
the loading element and rejecting any literal that escapes back into `e2e/`.
It is pure shell, so it answers in milliseconds without a toolchain — and it
was verified to fail on a deliberately drifted constant before being trusted.

**Changed files:**

- `apps/desktop/src/main/runtime.ts`
- `apps/web/app/[[...slug]]/client-app.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/state/appearance.ts`
- `apps/web/tests/observability/white-screen.test.ts`
- `e2e/lib/loading-shell.ts`
- `e2e/lib/playwright/amr.ts`
- `e2e/lib/playwright/visual.ts`
- `e2e/ui/amr-login-pill.test.ts`
- `e2e/ui/api-empty-response.test.ts`
- `e2e/ui/app-design-files.test.ts`
- `e2e/ui/app-manual-edit.test.ts`
- `e2e/ui/app-restoration.test.ts`
- `e2e/ui/app.test.ts`
- `e2e/ui/automations-page.test.ts`
- `e2e/ui/critical-smoke.test.ts`
- `e2e/ui/design-systems-manager.test.ts`
- `e2e/ui/diagnostics-export.test.ts`
- `e2e/ui/entry-chrome-flows.test.ts`
- `e2e/ui/entry-configuration-flows.test.ts`
- `e2e/ui/entry-topbar.test.ts`
- `e2e/ui/home-composer-topbar-stacking.test.ts`
- `e2e/ui/home-hero-rail.test.ts`
- `e2e/ui/message-center.test.ts`
- `e2e/ui/project-file-link-routing.test.ts`
- `e2e/ui/project-management-flows.test.ts`
- `e2e/ui/real-daemon-run.test.ts`
- `e2e/ui/reload-spurious-failed-run.test.ts`
- `e2e/ui/settings-api-protocol.test.ts`
- `e2e/ui/settings-connectors-auth-happy-path.test.ts`
- `e2e/ui/settings-connectors-auth-recovery.test.ts`
- `e2e/ui/settings-design-systems.test.ts`
- `e2e/ui/settings-local-cli-codex-fallback.test.ts`
- `e2e/ui/settings-mcp-snippet-chip.test.ts`
- `e2e/ui/settings-media-providers.test.ts`
- `e2e/ui/settings-memory-routines.test.ts`
- `e2e/ui/split-resize-scrollbar-hitbox.test.ts`
- `e2e/ui/updater-popup-stacking.test.ts`
- `e2e/ui/visual-entry.test.ts`
- `e2e/ui/workspace-keyboard-flows.test.ts`
- `e2e/lib/loading-shell.ts` (new)

### 2026-08-04 — The header search bar, routed into the palette rather than duplicating it

**Reason:** the last of the three pieces of chrome the mockup specifies. The
navigation rail and the status bar landed earlier; this is the search field.

**The mockup settled a question the requirement left open.** It draws *two*
adjacent controls — a search pill and a separate `Ctrl K` button wired to the
palette — so the keyboard hint is a neighbour rather than the field's own
behaviour, and the mockup's own query state is inert, filtering nothing. It
specifies anatomy, not semantics.

So the two became one control that routes into the palette. The three
collections the placeholder names — projects, plugins, design systems — each
already own a regex-search field of their own, and the palette already answers
the question one level up with scopes for exactly those plus settings and
files. A header field with its own result list would have been the fourth
implementation of the same search, and two global searches twelve pixels apart
is worse than one.

**The builder is real rather than decorative**, which is what the standard
actually requires: the pattern and flags travel into the palette's own
filtering, the palette states on screen which pattern it is matching with, and
it offers the way back to plain text. Two traps were closed on the way — the
palette compiles its own matcher rather than borrowing the field's, because a
`/g` expression carries `lastIndex` and would match every other row; and
scope-prefix parsing switches off while a pattern is live, because `#\d+`
would otherwise lose its `#` to the scope parser.

`Cmd/Ctrl+K` now opens the palette, so the chip names a key that works.

**Changed files:**

- `apps/web/src/components/EntryTopbarSearch.tsx`
- `apps/web/src/components/EntryTopbarSearch.module.css`
- `apps/web/src/components/command-palette/open.ts`
- `apps/web/tests/components/EntryTopbarSearch.test.tsx`
- `apps/web/tests/components/CommandPalette.regex-filter.test.ts`


### 2026-08-04 — Give the home screen Material Design 3 anatomy, not just its colours

**Reason:** a reader compared the shipped screenshot to the mockup and said the
application still looked like the one it was forked from. The chrome half of
that — a persistent navigation rail and a status bar — landed earlier. This is
the other half: the home screen's own content, which was upstream's anatomy
wearing Material Design 3 colours. Roadmap § 2.4 Wave 2.

The loudest "old app" cue was a centred 40px serif heading; it is now
`display-large` on the sans face. The prompt surface moved from a 16px
hairline-bordered flat card to the specified **28dp** corners on
`surface-container-high`, resting at elevation 1 and lifting to 3, with a
primary focus ring in place of a tinted border. Its control row is a 36dp
assist-chip rail — fully rounded, `outline-variant` hairline, transparent
fill — with the model switcher as the rail's single filled chip, mirroring the
mockup. The send button morphs on hover, corner-l to corner-xl with a spring.

The template rail became a **card grid**. It was a horizontally scrolling strip
of fixed-width cards whose later entries were reachable only through hover
edge-zones; it is now `auto-fill` columns of outlined M3 cards with a tonal
tile for the scenario art and a spring lift, so every scenario is simply on
screen. Recent-project cards gained the same treatment with tonal covers.

**One test changed meaning rather than breaking, and it is the interesting
one.** `home-hero-rail` asserted `scrollWidth > clientWidth` and then clicked
the rail's right edge-zone to prove it scrolls — a test that *described the old
design*. Neither can hold in a grid. The rewrite keeps the property it was
really protecting, that every scenario is reachable without page overflow, and
strengthens it: the container is a grid, it has more than one row, no card
extends past its right edge, and page overflow stays within two pixels.

Deliberately not done: restructuring the control row's JSX into literal chip
components. The chip contract is applied to the existing triggers through CSS;
doing it structurally would touch four shared components and their suites for
an identical rendered result.

**Changed files:**

- `apps/web/src/styles/home/plus-menu.css`
- `apps/web/tests/styles/home-hero-compact-controls.test.ts`
- `apps/web/src/styles/home/recent-projects.css`


### 2026-08-04 — Finish the rebrand on the surfaces a user actually reads first

**Reason:** driving the packaged build from a clean profile lands on
onboarding — the first screen anyone sees — and it read "Welcome to Open
Design" and "Sign in to Open Design" inside a window titled *Material
Designer*. The release smoke test cannot catch it: its captures begin past
onboarding, so the surface is outside the state list entirely.

**The work was the classification, not the substitution.** Of 111 occurrences
in the English dictionary, 64 name *this product* and were changed. The rest
were kept, each for a reason:

- **Open Design Cloud** is upstream's real hosted service, with real accounts
  and balances. Renaming it would tell a user their account lives somewhere it
  does not.
- The **upstream project, repository, community and social links**, the
  **telemetry recipient**, the **`od:` plugin and skill format nouns**, and
  the sample starter-memory text all legitimately name upstream.
- One is not the brand at all: *"**Open** Design Systems to view the full
  preview"* is an imperative verb, which every other locale confirms by
  translating it as one.

**One call went deliberately against the brief.** The cloud sign-in button
became "Sign in to Open Design **Cloud**" rather than "Material Designer",
because it authenticates against upstream's service — there is no Material
Designer account to sign in to. Spelling the service out removes the "this app
is called Open Design" reading without lying about where the credential lives.

**The copyright line is deliberately unchanged.** `© 2026 Open Design · All
rights reserved.` is an attribution, not a product name. Apache-2.0 §4(c)
requires retaining copyright notices, and this notice is the only place a user
sees upstream credited. Replacing it would erase that; adding this fork's name
would assert a co-holder claim nobody here is in a position to make. The
ambiguity around it was removed instead — the wordmark and heading above it
now say Material Designer, so the footer reads as what it is. **This is the one
item that warrants a human decision rather than an agent's.**

**Substituting a token into twenty languages broke grammar, and it was fixed
rather than shipped.** "Material" is consonant-initial where "Open" is not, so
Hungarian's article changes and its vowel-harmony suffixes flip across 49
sites; Turkish's front-unrounded ending flips 22 more; Korean's vowel-final
디자이너 takes different particles than 디자인 across 28. A rename that reads
as broken grammar in three languages is not a rename that respects them.

**Deliberately left:** the pre-mount `Loading Open Design…` string, because 42
Playwright waits across 32 files synchronise on that exact literal and use
hidden/count assertions — changing the source without changing all 42 would
not fail the suite, it would silently turn every startup wait into a no-op.
That is a one-line change with a 32-file dependency and belongs in its own
pass.

**Changed files:**

- `apps/web/src/components/ProjectView.tsx`
- `apps/web/src/design-system-auto-prompt.ts`
- `apps/web/src/i18n/funny/en.ts`
- `apps/web/src/i18n/funny/zh-HK.ts`
- `apps/web/src/i18n/locales/ar.ts`
- `apps/web/src/i18n/locales/de.ts`
- `apps/web/src/i18n/locales/en.ts`
- `apps/web/src/i18n/locales/es-ES.ts`
- `apps/web/src/i18n/locales/fa.ts`
- `apps/web/src/i18n/locales/fr.ts`
- `apps/web/src/i18n/locales/hu.ts`
- `apps/web/src/i18n/locales/id.ts`
- `apps/web/src/i18n/locales/it.ts`
- `apps/web/src/i18n/locales/ja.ts`
- `apps/web/src/i18n/locales/ko.ts`
- `apps/web/src/i18n/locales/pl.ts`
- `apps/web/src/i18n/locales/pt-BR.ts`
- `apps/web/src/i18n/locales/ru.ts`
- `apps/web/src/i18n/locales/th.ts`
- `apps/web/src/i18n/locales/tr.ts`
- `apps/web/src/i18n/locales/uk.ts`
- `apps/web/src/i18n/locales/zh-CN.ts`
- `apps/web/src/i18n/locales/zh-HK.ts`
- `apps/web/src/i18n/locales/zh-TW.ts`
- `apps/web/tests/components/ChatComposer.search.test.tsx`
- `apps/web/tests/components/EntryShell.onboarding.test.tsx`
- `apps/web/tests/components/preview-modal-unavailable-state.test.tsx`
- `apps/web/tests/components/SettingsDialog.execution.test.tsx`
- `apps/web/tests/components/UpdateDialog.test.tsx`
- `apps/web/tests/components/UpdaterPopup.test.tsx`
- `apps/web/tests/components/WhatsNewPopup.test.tsx`


### 2026-08-04 — Interpolate per language, so a bilingual value stops being said twice

**Reason:** `t()` composed the two languages **and then** interpolated, so a
variable whose value was itself translated copy arrived already bilingual and
the bilingual template substituted it into both halves. `{level} density ·
{level}密度` with a `densityLabel` of `Default · 預設` produced **`Default ·
預設 density · Default · 預設密度`** — thirty-seven characters saying "Default
density" twice in English. It was found as a clipping symptom; it is the cause
of the width, and it affected every bilingual string built from a translated
variable, not the one that happened to overflow.

Rendering now happens **per language before the join**, and a caller marks a
variable that is itself copy with `tv(key, vars?, transform?)` rather than
passing a `t()` result. `tv` resolves through the same per-language read that
renders the outer template, which is what keeps both funny-level sliders
applying — to the nested value as well as to the template around it.

Two shortcuts were rejected for stated reasons. Composing two
`tForLanguageTag` calls would have bypassed the funny-level machinery and
silently un-shipped a feature. Interpolating first and then composing the
rendered halves would have made the join decision read rendered text rather
than the template, so `{n}m` would compose at one value of `n` and decline at
another — the same chip behaving differently at 5 minutes and 1234. The join
now reads templates for the structural guards and rendered text only for
emptiness, which also fixes two identical templates carrying a per-language
variable, where the old guard collapsed them to one half.

Seventeen direct call sites are converted. Roughly sixteen indirect ones —
where the value comes from a helper that returns `t()` output — are recorded
rather than chased, because changing those helpers' return types cascades
much further than this change should; the mechanism handles them whenever
someone does.

**And the bottom overlap it was found beside.** The scroll hint and collapse
pill are `position: fixed`, so they sit against the viewport and knew nothing
about where the scrolling column ends — anything scrolled to the bottom was
painted underneath them. The shell's grid already accounted for the status
bar; the unreserved fixed overlay was the problem. The bar's height is now a
published token, consumed by the bar itself so the number is stated once, and
the scroll column reserves the pill's band so content clips above it instead
of sliding under.

**Changed files:**

- `AGENTS.md`
- `apps/web/src/components/AppStatusBar.module.css`
- `apps/web/src/components/AppStatusBar.tsx`
- `apps/web/src/components/SettingsDialog.tsx`
- `apps/web/src/components/appearance/InfiniteColorPicker.tsx`
- `apps/web/src/components/bulk/messages.ts`
- `apps/web/src/components/command-palette/CommandPalette.tsx`
- `apps/web/src/components/command-palette/commands.ts`
- `apps/web/src/i18n/index.tsx`
- `apps/web/src/i18n/interpolate.ts`
- `apps/web/tests/components/design-system-github-evidence.test.ts`
- `apps/web/src/i18n/runErrors.ts`
- `apps/web/src/styles/home/plugins-home.css`
- `apps/web/src/styles/md3-tokens.css`
- `apps/web/tests/i18n/interpolation.test.ts`
- `apps/web/tests/styles/home-templates-status-bar-clearance.test.ts`


### 2026-08-04 — Make the settings surface tabbed and searchable

**Reason:** two standards, both unmet and both visible in one capture. The
settings dialog showed a seventeen-item scrolling section list with no search
field anywhere on it — while standard 4 requires every settings surface to
carry its own search wired to the regex builder, and standard 5, extended
today, requires those sections to be browser-style tabs rather than a bespoke
list that behaves like nothing else in the product.

**The search reuses the index that already existed.** `SETTINGS_INDEX` was
built for the command palette; the new matcher takes that table as its input
rather than declaring a second one that would drift from it, and uses the
regex controller's own predicate rather than a second matching implementation.
Each field is tested separately, so an anchored pattern like `^theme` anchors
to something the user can see instead of to a joined blob. Hits on the active
tab come first, hits elsewhere carry an "On {tab}" badge and a count — which
is the standard's requirement to say plainly when a match sits on another tab.
Entries whose section has no tab are filtered out, because a result that
cannot be opened from here is worse than no result.

**The seventeen hand-written navigation buttons became a real tab strip** with
`role="tablist"`, roving focus, arrow-key traversal that wraps, and the panel
promoted to a single labelled `tabpanel`. Overflow scrolls rather than
clipping, with a persistent overflow menu listing every section and badging
the ones measured out of view — portalled, because the modal body clips. The
active tab persists across restarts, and is read only when no section was
named, so every explicit call site keeps working unchanged.

**Reordering, pinning, groups, the four discovery searches and the per-tab
appearance editor are not attempted**, and are recorded as remaining rather
than implied. The strip and the search are already a large change across a
9,000-line component; pinning needs its own persistence schema and a region
that interacts with overflow.

**Changed files:**

- `apps/web/src/components/settings/settingsTabs.ts`
- `apps/web/src/components/settings/settingsSearchMatch.ts`
- `apps/web/src/components/settings/SettingsTabStrip.tsx`
- `apps/web/src/components/settings/SettingsSearchResults.tsx`
- `apps/web/src/components/settings/SettingsTabs.module.css`
- `apps/web/src/styles/workspace/mention-home.css`
- `apps/web/tests/components/SettingsDialog.tabs.test.tsx`
- `apps/web/tests/components/settingsSearchMatch.test.ts`


### 2026-08-04 — Make the UI scale reflow instead of magnify, and stop bilingual clipping

**Reason:** captures at 125, 150 and 200% showed a horizontal scrollbar, the
home heading cut off mid-word, and the status bar pushed off the bottom of the
screen. The UI scale setting was broken at every value except 100%, and
raising it is something people do for accessibility reasons.

**The cause was `zoom`, and this repository had already written the warning.**
Roadmap § 2.5 said to replace the mockup's scaling mechanism because it uses a
non-standard `zoom` property; it was ported anyway, because nothing had ever
rendered it. `zoom` multiplies painted lengths without moving the layout
viewport, so `100vw` on a 1280px window still resolved to 1280 and was then
drawn twice as wide. The overflow was arithmetic.

The desktop host now scales its own web contents through `setZoomFactor`,
which divides the real layout viewport — a 1280×900 window at 200% lays out as
640×450. Viewport units and width media queries become truthful at once, with
no stylesheet sweep, and `getBoundingClientRect` keeps agreeing with pointer
coordinates, which is the roadmap's "does not break layout measurement".

A root-font-size approach was considered and rejected as a fix that would look
like one: this application is overwhelmingly px-based, and scaling `:root`
would not have touched the `100vw`/`100vh` that actually overflow. In a plain
browser tab, where no host bridge exists, `zoom` is kept and the window-level
boxes derive their size from it — that stops the *window* overflowing but is
honestly partial, since `@media` cannot read a custom property.

**Bilingual clipping had a different cause than it appeared.** The status bar's
segments were `display: flex` with `text-overflow: ellipsis`, and
`text-overflow` does nothing to an anonymous flex item — so text hard-clipped
mid-glyph against the strip's padding with no ellipsis and no way to read the
rest. Each segment's text now lives in a real element that can ellipsise, every
segment carries its full text in `title`, and the daemon segment — the one a
user acts on — never yields room. The two appearance readouts step aside at
narrow widths through the repository's own screen-reader-only pattern rather
than `display: none`, so they stay in the accessibility tree.

**Changed files:**

- `apps/desktop/src/main/ui-scale.ts`
- `apps/desktop/tests/main/ui-scale.test.ts`
- `apps/web/src/styles/home/home-hero.css`
- `apps/web/tests/state/appearance.test.ts`


### 2026-08-04 — Put the navigation rail and the status bar on the screen

**Reason:** a reader compared the published screenshot to the mockup and said
the application still looked like the one it was forked from. They were right.
The colour layer had landed — every component resolves Material Design 3 roles
— but the mockup's structural furniture was not on screen, and structure is
what makes a screen read as Material Design 3 rather than as a recolour.

**The rail was mounted and invisible.** `EntryShell` rendered `EntryNavRail`
into a grid track whose collapsed width was literally `0`, with
`overflow: hidden`, `inert` and `aria-hidden` applied — present in the DOM,
absent from the screen — and the stored preference defaulted to closed, so a
fresh install showed no rail at all. "Collapsed" meant *gone*, which is a
drawer; a Material Design 3 navigation rail is persistent by definition.

It is now 88px as an icon rail and 260px with labels, the widths this
roadmap's Wave 1 already specified, narrowing to 72/216 below 900px. The
topbar control now means *widen* and the rail's own means *narrow*; neither
means *hide*. `inert` and `aria-hidden` are gone, because both were correct
while collapsing meant hiding and both now conceal a visible, operable
landmark from assistive technology. The stored preference deliberately keeps
its key and both values: `false` meant hidden and now means the icon rail,
`true` meant docked and now means labels, so the mapping is exact and renaming
the key would have discarded a real preference to say the same thing.

**The status bar did not exist.** It is now the shell's last row at the
mockup's 28px, carrying daemon state, model and execution mode, design system,
and right-aligned scale and density. The daemon dot always sits beside the
word naming the state, so colour is never the only channel, and only that
segment is a live region — announcing a scale the user just chose is noise.
The mockup's version segment is deliberately dropped: it arrives
asynchronously and a wrong version is worse than none.

**The header search bar was deliberately not attempted.** It needs a new
surface bound to the regex builder, a shortcut route into the command palette
and new filtering semantics — a third substantial blind change stacked on two,
with no way to typecheck any of them.

Four end-to-end tests changed meaning rather than breaking. Two of them
**asserted the defect**: one required `aria-hidden="true"` on the default
rail, and another was titled for the collapsed rail staying out of the tab
order. An assertion that pins a rail out of the layout is not a test that was
broken by this change; it is a test that was documenting the bug.

**Changed files:**

- `apps/web/src/App.tsx`
- `apps/web/src/components/AppStatusBar.tsx`
- `apps/web/src/components/AppStatusBar.module.css`
- `apps/web/src/styles/home/entry-layout.css`
- `apps/web/src/i18n/types.ts`
- `e2e/lib/playwright/rail.ts`
- `e2e/ui/critical-smoke.test.ts`
- `e2e/ui/entry-chrome-flows.test.ts`
- `e2e/ui/home-hero-rail.test.ts`


### 2026-08-04 — Capture nine named interface states instead of one, and prove each one before shooting it

**Reason:** the entire visual evidence base for a Material Design 3 redesign was
**one** screenshot — the home screen, default window, English, 100% scale. A
reader comparing that capture to the mockup could see the redesign had not
arrived; nothing automated could.

The packaged smoke test now captures the settings dialog, the command palette,
the home screen at 100/125/150/200% scale, bilingual mode, and both at a narrow
window. Scale and language are driven through the application's own persisted
appearance and locale stores and a reload, rather than through the operating
system, so the run does not mutate a shared machine.

Three properties matter more than the coverage. **Each state is verified before
it is photographed** — the scale variable actually on the document, Han
characters actually in the rendered text, the window actually at the narrower
width — with a sentinel that proves the reload happened, because a still-mounted
old document answers a probe perfectly well. **Nothing is skipped silently**: an
unreachable state produces no file, a named reason in the log, an entry in
`ui-states.json` and a workflow annotation, and capturing nothing at all fails
the suite, since that means the mechanism broke rather than one surface being
awkward. And **every frame is hashed**, because `capturePage` returns the last
composited frame — a stalled compositor could hand back the previous state's
pixels under a new name, which is a lie no assertion about the DOM can catch.

Two states were rejected rather than shipped shaky: a window narrower than
900px is impossible (the shell sets that as its minimum, documented as the
breakpoint where the layout clips), and opening settings on a named tab would
need an nth-child click, which is exactly the brittleness that must stay out of
a suite gating every push.

**Changed files:**

- `e2e/lib/vitest/packaged-ui-states.ts`
- `e2e/scripts/release-smoke.ts`
- `e2e/specs/win.spec.ts`

### 2026-08-04 — Gate the last ungated delete affordance, and two routes beside it

**Reason:** the confirmation gate was mounted on every route to a project
delete except one. `RecentProjectsStrip` — the home screen's own card menu —
used a plain one-button dialog while `DesignsTab` put the same operation, via
the same handler, behind two keys and a slider. **The route the user happened
to take decided the ceremony, and the shortest route had the least.**

Two adjacent daemon routes are now gated too, both chosen on the same
restorability test used before. `DELETE /api/projects/:id/folders` removes a
subtree and writes no revision, while the file delete beside it tombstones a
version manifest and stays restorable — same verb, opposite answer. Its token
binds to the **project and folder together**, because the folder arrives in the
body and a grant for one directory must not remove another.
`DELETE /api/design-systems/:id` is two operations sharing one URL: the
marketplace uninstall is re-installable from source and stays ungated, while a
user-authored system is a directory no history domain covers and is gated. The
mint route uses the user-file listing as both an existence check and a
"this is not the uninstall" check, so no token can be minted for a marketplace
id.

`od library rm` is deliberately **not** armed yet. Refusing today breaks every
existing script at an exit code callers read as "you typed it wrong" rather
than "the contract moved" — and a safety change that teaches people to write
`|| true` has made things worse. The flag is accepted and optional now, so
adopting it is safe across the change, with a notice naming the command that
will keep working; the arming step is written into the code for a release whose
notes can say so. The daemon's token already covers the operation meanwhile.

**Changed files:**

- `apps/daemon/src/routes/design-systems.ts`
- `apps/daemon/tests/design-systems/import-auto-rebuild-route.test.ts`
- `apps/daemon/tests/routes/design-systems-confirm-delete.test.ts`
- `apps/daemon/tests/routes/projects.test.ts`
- `apps/web/tests/components/RecentProjectsStrip.destructive-gate.test.tsx`
- `apps/web/tests/lib/confirm-delete.test.ts`


### 2026-08-04 — Fix the animation mock that made five tests race, and one of them flaky

**Reason:** a test failed on a documentation-only commit and passed on a re-run
of the byte-identical tree — the definition of a flake, and a corrosive one now
that this suite gates every push, because an intermittent red trains readers to
re-run a gate instead of reading it.

The cause was not in the test. `tests/helpers/motion-mock.tsx` stands in for
the animation library, and its proxy **constructed a fresh `forwardRef`
component on every property read** — so `motion.div` was a different value each
time it was evaluated. The real library memoises. React reconciles function
components by identity, so a changed type unmounts the whole subtree: the
consent banner was being destroyed and recreated on *every render of `App`*.

A test that resolved `await screen.findByRole('button')` and then clicked that
node was therefore holding a reference that any unrelated bootstrap promise
could detach in the gap. React 18 delegates events at the root container, so a
click on a detached node reaches nothing — silently, with no error. The
assertion then failed on a call that never happened rather than on a wrong
argument, which is exactly what the reported failure said.

The mock now memoises per property name, matching the real library. Five cases
in the connectors suite shared the racy shape and all now query at click time
rather than holding a node across an await — belt and braces, since the mock
fix alone closes the window. A focused regression now pins the single cache
declaration and proves that intrinsic and custom proxy properties each retain
one stable identity, including a duplicate-declaration fixture that turns red.

**Changed files:**

- `apps/web/tests/helpers/motion-mock.tsx`
- `apps/web/tests/helpers/motion-mock.test.ts`
- `apps/web/tests/components/App.connectors.test.tsx`

### 2026-08-04 — Move the destructive-action check out of the interfaces and into the handler

**Reason:** the standard is explicit that this is an authorization boundary and
that boundaries are enforced in the handler, never in the interface. It was
being enforced in the interfaces — and not two of them, as assumed, but
**three**: the web app's two-key-plus-slider gate, the `od` CLI's `--confirm`
flag, and an MCP tool's own `confirm: true`. Three independent gates and zero
boundaries, which is exactly the shape the standard warns about: anything that
is none of the three — a `curl`, a script, a third-party client — deleted
freely.

The three genuinely irreversible deletes now require a single-use confirmation
token, minted for that exact resource at `POST <resource>/confirm-delete` and
returned in an `x-od-confirm-token` header. Bound to kind and id, 120-second
expiry, consumed on success, in memory only so a restart invalidates
outstanding grants — an authorization that outlives its session is the wrong
failure. Refusal is 428 rather than 409 because these routes already return
409 for genuine write conflicts, and two different failures on one endpoint
should not be indistinguishable. The header is deliberate: access, proxy and
shell logs record method and URL.

**Which routes, and the line drawn.** Not "is it a DELETE" but **"can local
version history bring it back?"** — the registered history domains are the
authority. Gated: project (cancels in-flight runs, drops the row, removes the
whole directory), brand (removes the brand tree and the design system it
registered), and library asset (unlinks content-addressed bytes). Deliberately
**not** gated: memory entries, project files, templates, automations, BYOK
profiles, connector accounts and MCP servers all sit inside history domains
and restore. Gating a restorable delete adds ceremony without safety and
dilutes the signal that the gate means irreversible.

**What this does and does not prove.** The token does not establish that a
human moved a slider; the web app mints it at the moment of authorization and
spends it immediately. What it buys is that no caller reaches the operation in
one replayable request, and that every route converges on a single enforcement
point where policy can be strengthened later. That distinction is written into
the standard's own status rather than the row being ticked green.

Incidental fix found on the way: `deleteBrand` never checked the response was
ok, so a server error closed the gate reporting success.

**Changed files:**

- `apps/daemon/src/brand-routes.ts`
- `apps/daemon/src/cli.ts`
- `apps/daemon/src/http/confirm-delete.ts`
- `apps/daemon/src/mcp.ts`
- `apps/daemon/src/routes/library.ts`
- `apps/daemon/src/routes/project/index.ts`
- `apps/daemon/tests/cli-delete-confirmation.test.ts`
- `apps/daemon/tests/confirm-delete.test.ts`
- `apps/daemon/tests/delete-cancels-active-runs.test.ts`
- `apps/daemon/tests/helpers/confirm-delete.ts`
- `apps/daemon/tests/library-edit-as-page.test.ts`
- `apps/daemon/tests/mcp-spawn.test.ts`
- `apps/daemon/tests/mcp-write-tools.test.ts`
- `apps/daemon/tests/project-file-version-routes.test.ts`
- `apps/daemon/tests/project-preview-containment.test.ts`
- `apps/daemon/tests/routes/export-manifest.test.ts`
- `apps/web/src/lib/confirm-delete.ts`
- `apps/web/tests/state/projects.test.ts`
- `e2e/lib/vitest/packaged-pty-smoke.ts`
- `packages/contracts/src/api/destructive-confirmation.ts`
- `packages/contracts/src/errors.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/tests/destructive-confirmation.test.ts`


### 2026-08-04 — Remove every blocking browser dialog from the web application

**Reason:** two standards were being broken by the same eighteen call sites.
Anything that only informs must be a non-blocking notification rather than a
modal that halts the application; and an irreversible action must go through
the super-confirmation gate. `window.confirm` and `window.alert` satisfy
neither — they freeze the application, they cannot be styled or localized, and
as a guard on a destructive action they are answered by a single stray Enter.

**Thirteen were irreversible destruction** and now route through the gate,
each naming the exact data it will destroy: clearing memory extractions,
deleting a routine, an automation, a conversation from two different surfaces,
a project file, a design-system project, a design system, a brand, and
clearing a media provider's stored credential — the last being a key the
application never shows again and cannot re-derive.

**One was a genuinely recoverable decision** and deliberately did *not* get
the gate: closing a sketch tab with unsaved work now asks through the shared
dialog primitive. Putting two keys and a slider in front of closing a tab is
exactly how a gate stops meaning anything. The terminal teardown moved out of
the asking path at the same time, so cancelling now changes nothing at all.

**Six were merely informational** and became notifications. The worst of them
told the user their pop-up had been blocked — in an alert that was itself
blocking them from reaching the browser control that would unblock it.

Several handlers were reshaped to return a real boolean rather than swallowing
their own failure, so a refused delete holds the gate open reporting what went
wrong instead of closing over a removal that never happened. Fifteen keys were
added across all twenty locales, with Cantonese written rather than inherited.

**Changed files:**

- `apps/web/src/components/SettingsDialog.tsx`
- `apps/web/src/components/SketchEditor.tsx`
- `apps/web/src/i18n/locales/ar.ts`
- `apps/web/src/i18n/locales/de.ts`
- `apps/web/src/i18n/locales/en.ts`
- `apps/web/src/i18n/locales/es-ES.ts`
- `apps/web/src/i18n/locales/fa.ts`
- `apps/web/src/i18n/locales/fr.ts`
- `apps/web/src/i18n/locales/hu.ts`
- `apps/web/src/i18n/locales/id.ts`
- `apps/web/src/i18n/locales/it.ts`
- `apps/web/src/i18n/locales/ja.ts`
- `apps/web/src/i18n/locales/ko.ts`
- `apps/web/src/i18n/locales/pl.ts`
- `apps/web/src/i18n/locales/pt-BR.ts`
- `apps/web/src/i18n/locales/ru.ts`
- `apps/web/src/i18n/locales/th.ts`
- `apps/web/src/i18n/locales/tr.ts`
- `apps/web/src/i18n/locales/uk.ts`
- `apps/web/src/i18n/locales/zh-CN.ts`
- `apps/web/src/i18n/locales/zh-HK.ts`
- `apps/web/src/i18n/locales/zh-TW.ts`
- `apps/web/src/i18n/types.ts`
- `apps/web/tests/components/ConversationsMenu.destructive-gate.test.tsx`
- `apps/web/tests/components/MemorySection.test.tsx`
- `apps/web/tests/components/RoutinesSection.test.tsx`
- `apps/web/tests/components/SettingsDialog.execution.test.tsx`
- `apps/web/tests/components/SettingsDialog.media.test.tsx`
- `apps/web/tests/components/TasksView.analytics.test.tsx`
- `apps/web/tests/components/TasksView.page.test.tsx`
- `apps/web/tests/components/preview-modal-image-export.test.tsx`
- `apps/web/tests/runtime/exports.test.ts`
- `e2e/lib/playwright/destructive-gate.ts`
- `e2e/ui/app-design-files.test.ts`
- `e2e/ui/app-restoration.test.ts`
- `e2e/ui/app.test.ts`
- `e2e/ui/automations-page.test.ts`
- `e2e/ui/design-systems-manager.test.ts`
- `e2e/ui/settings-memory-routines.test.ts`


### 2026-08-04 — Route the memory and library deletions through the gate that already existed

**Reason:** an audit confirmed that irreversible deletions fired with no
confirmation at all while the same product gated others behind a two-key
slider. A gate that guards two doors of a dozen is closer to a false assurance
than to a safety feature.

**Memory entries** deleted the markdown file from disk and dropped its line
from the index, with no revision, no trash and no restore path — and no
confirmation whatsoever. Now gated, naming the entry's own title, its type and
what it currently says, so the user is reading the thing they are about to
lose rather than answering "are you sure".

**Library assets** had no confirmation on single delete, and a bulk dialog
that a stray Enter answered because its button was auto-focused. Both are
gated. The copy branches on how the asset is stored: an owned asset loses its
bytes, a referenced one keeps its file but loses the record and every piece of
enrichment on it — caption, OCR text, tags, palette. Both are marked
irreversible, because the record never comes back either way. The bulk gate
lists each asset by name, capped at twelve with an explicit remainder, since a
select-all can run to hundreds and would otherwise bury the keys and the
slider under a scroll.

**What was deliberately not gated**, because over-gating is how a gate stops
meaning anything: the extraction-record rows are a self-evicting twenty-entry
in-memory buffer that does not survive a daemon restart — its own header calls
it a UX surface rather than an audit log — and the memories it wrote are
separate files that outlive it. A regression test now pins that decision so it
is not quietly reversed.

Both call sites' confirm handlers now return a boolean, so a refused delete
holds the gate open reporting failure instead of closing over a removal that
did not happen.

**Changed files:**

- `apps/web/src/i18n/types.ts`
- `apps/web/src/i18n/locales/ar.ts`
- `apps/web/src/i18n/locales/de.ts`
- `apps/web/src/i18n/locales/en.ts`
- `apps/web/src/i18n/locales/es-ES.ts`
- `apps/web/src/i18n/locales/fa.ts`
- `apps/web/src/i18n/locales/fr.ts`
- `apps/web/src/i18n/locales/hu.ts`
- `apps/web/src/i18n/locales/id.ts`
- `apps/web/src/i18n/locales/it.ts`
- `apps/web/src/i18n/locales/ja.ts`
- `apps/web/src/i18n/locales/ko.ts`
- `apps/web/src/i18n/locales/pl.ts`
- `apps/web/src/i18n/locales/pt-BR.ts`
- `apps/web/src/i18n/locales/ru.ts`
- `apps/web/src/i18n/locales/th.ts`
- `apps/web/src/i18n/locales/tr.ts`
- `apps/web/src/i18n/locales/uk.ts`
- `apps/web/src/i18n/locales/zh-CN.ts`
- `apps/web/src/i18n/locales/zh-HK.ts`
- `apps/web/src/i18n/locales/zh-TW.ts`
- `apps/web/tests/components/MemorySection.test.tsx`
- `apps/web/tests/components/LibrarySection.delete-gate.test.tsx`

### 2026-08-04 — Add the four colour spaces the translator never had, and stop it overstating losslessness

**Reason:** the appearance standard requires bidirectional conversion across
named, hex and hex-with-alpha, RGB/RGBA, HSL/HSLA, HSV/HSB, HWB, **CIELAB and
LCH, OKLab and OKLCH**, and CMYK. Four of those were absent outright: the
translator offered ten representations, none of them from the Lab family, and
typing `oklch(…)` into the entry field was rejected as invalid.

The perceptual stack is now real: the sRGB transfer function, linear sRGB ↔ CIE
XYZ, Bradford chromatic adaptation, CIELAB and LCH, and OKLab and OKLCH with
Ottosson's matrices. `lab()` and `lch()` are computed against **D50** and
`oklab()`/`oklch()` against D65, because CSS Color 4 defines them that way —
emitting D65 numbers inside a `lab()` string produces a well-formed value that
a browser renders as a *different colour*, which is exactly the silent
surprise this module's loss machinery exists to prevent.

The arithmetic is checked against published reference values rather than
against itself; that cross-check caught a wrong digit in the Bradford D50→D65
matrix, which had been pushing D50 white to Z = 1.0579 instead of 1.08883.

Two honesty fixes came with it. The **Name** row hard-coded its loss and so
reported a clean round trip while the HEX row it is derived from reported
rounding for the very same colour. And **alpha was exempt from every
round-trip check**, so HEX8, RGBA, HSLA and HWB claimed a losslessness that
had never been tested — alpha `0.5` survives a hex byte as `0.50196`, which is
a real loss the panel was silent about.

Also fixed here: `parseColor` indexed the named-colour map without an
ownership check. The map is a plain object literal, so typing `constructor`,
`toString` or `__proto__` into the colour field returned an inherited
function, which is truthy, which reached the hex parser and threw
`text.trim is not a function` out of a React change handler — breaking the
function's own documented promise never to throw. The field parses on every
keystroke, so a paste was enough.

The module had **no test file at all** before this, which is the same fact as
it having held five of the seven confirmed audit findings.

**Changed files:**

- `apps/web/src/components/appearance/color.ts`
- `apps/web/src/components/appearance/translate.ts`
- `apps/web/tests/components/appearance/color.test.ts`
- `apps/web/tests/components/appearance/translate.test.ts`

### 2026-08-04 — Close the confirmation gate's five defects, and gate the CLI it was reaching around

**Reason:** an adversarial audit confirmed the gate could be defeated, and a
verification pass then confirmed the `od` CLI bypassed it entirely.

**The gate's own defects.** Armed keys survived a target swap, so keys operated
for one action stayed engaged when the gate was re-pointed at the next; the
surface is now keyed on the action's identity, so a new target mounts fresh
while an equal-but-new items array does not reset it. The "full-range" slider
was satisfiable in a single gesture — one far-end click or one `End` press —
and now rations forward travel to a fifth of the range per input event, so
reaching the end costs at least five deliberate advances however it is driven.
Retreat stays unrationed, because abandoning the travel must never be work, and
the keyboard path stays fully operable: arrows still step, `End` still works
and is simply pressed again. Dismissing mid-flight discarded the action's
failure, which is now raised as a notification rather than dropped. Escape and
the emergency exit reported `cancelled` for an action that had already begun,
which was a false statement about the user's data; the outcome union gained
`dismissed` to say the true thing. Focus now returns to the originating control
before `onClose` on every path, guarded so it never yanks focus from somewhere
the host deliberately moved it.

**The CLI.** `od project|files|brand|templates|automation delete` executed
irreversible deletions with no confirmation of any kind, while the web
interface gated the same operations behind the two-key slider — so the CLI
reached the daemon route around the gate. All five now refuse without
`--confirm`, mirroring the `od plugin events purge` precedent already in the
file: same flag name, same exit code, same refusal shape. The refusal names
what would be deleted and prints the exact command that would proceed, emits
the CLI's standard JSON error envelope under `--json`, and fires before the
request, so a refused delete makes no HTTP call at all.

This is enforcement in two interfaces rather than at the operation, which the
standard asks for and this does not yet achieve — the daemon route still
accepts the call from any caller. Recorded in
`docs/standards/super-confirmation.md` rather than implied to be finished.

**Changed files:**

- `apps/web/src/components/destructive/DestructiveGate.tsx`
- `apps/web/src/components/destructive/gateMachine.ts`
- `apps/web/tests/components/destructive/gateMachine.test.ts`
- `apps/web/tests/components/destructive/DestructiveGate.test.tsx`
- `apps/web/tests/components/DesignsTab.select-mode.test.tsx`
- `apps/daemon/src/cli.ts`
- `apps/daemon/src/cli-help/brands-cli-help.ts`
- `apps/daemon/tests/cli-delete-confirmation.test.ts`
- `apps/daemon/tests/cli-templates.test.ts`

### 2026-08-04 — Make the appearance editor and its infinite colour picker reachable

**Reason:** both were written, typechecking, shipping in the bundle, and
mounted by nothing — an audit found zero importers for either. A module no
surface mounts is not a shipped feature, whatever its files contain.

`InfiniteColorPicker` is now the accent control in the settings dialog's
appearance section: a continuous two-dimensional field with hue, saturation,
brightness and alpha axes, typed entry, numeric channel entry, the colour-space
translation table with copy, and a contrast readout. The nine fixed swatches
stay exactly as they were — the standard wants swatches layered on a continuous
picker, never replacing one. The `<input type="color">` that reached the same
space through the operating system's own picker is gone, superseded.

`AppearanceRuntime` is mounted in `App.tsx` rather than inside the dialog. It
renders nothing and applies the persisted seed, density, scale and typography
in a layout effect; mounted in the dialog it would only take effect while that
dialog was open, so a chosen preset silently reverted on the next reload. It
also drives a presets row wired to the built-in presets, a third module that
had no consumer.

One new key, `appearance.presets`, added to the `Dict` and all twenty locales.

**Changed files:**

- `apps/web/src/App.tsx`
- `apps/web/src/components/SettingsDialog.tsx`
- `apps/web/src/components/appearance/color.ts`
- `apps/web/src/i18n/types.ts`
- `apps/web/src/i18n/locales/ar.ts`
- `apps/web/src/i18n/locales/de.ts`
- `apps/web/src/i18n/locales/en.ts`
- `apps/web/src/i18n/locales/es-ES.ts`
- `apps/web/src/i18n/locales/fa.ts`
- `apps/web/src/i18n/locales/fr.ts`
- `apps/web/src/i18n/locales/hu.ts`
- `apps/web/src/i18n/locales/id.ts`
- `apps/web/src/i18n/locales/it.ts`
- `apps/web/src/i18n/locales/ja.ts`
- `apps/web/src/i18n/locales/ko.ts`
- `apps/web/src/i18n/locales/pl.ts`
- `apps/web/src/i18n/locales/pt-BR.ts`
- `apps/web/src/i18n/locales/ru.ts`
- `apps/web/src/i18n/locales/th.ts`
- `apps/web/src/i18n/locales/tr.ts`
- `apps/web/src/i18n/locales/uk.ts`
- `apps/web/src/i18n/locales/zh-CN.ts`
- `apps/web/src/i18n/locales/zh-HK.ts`
- `apps/web/src/i18n/locales/zh-TW.ts`
- `apps/web/tests/components/AppearanceEditor.test.tsx`

### 2026-08-04 — Green the five web suites that had never been run, and make the suite a gate

**Reason:** wiring the web suite into continuous integration made it run for
the first time in this repository's history: **454 of 459 files passed**. All
five failures were pre-existing, and fixing them turns the largest suite in
the workspace from decoration into a gate.

Four were tests describing behaviour the product had deliberately moved on
from, each failing because nothing had run them since the change landed:

- **`DesignFilesPanel`** clicked batch-delete and expected the delete callback
  immediately. Bulk delete now opens a preview dialog first — which is the
  entire point of that dialog — and the callback gained an options argument.
- **`DesignFilesPanel`** queried a row-menu item by the `button` role. Menu
  items are now `<button role="menuitem">`, and an explicit role overrides the
  implicit one: the markup got more correct and the query got stale.
- **`WorkspaceTabsBar`** expected a cross-region tab drop to resolve to "after
  Home". A drag is now confined to its own region and the entry tab is the
  sole member of its own, so the drop is skipped entirely. Home still stays
  leftmost, which is what the test is named for and now asserts directly.
- **`changelog-parse`** expected a folded bullet to lose the full stop that
  closes its sentence. The period sits outside the commit-link parenthetical,
  so it correctly survives the link's removal.

One was a mistaken fixture: **`dim-sum`** interleaved a selecting roll after
each deciding roll, but a losing draw short-circuits and consumes only one —
so the second draw's *deciding* roll became the `0` meant as a selector, and
`0` wins. It now supplies one roll per losing draw and asserts the roll count,
which is what actually proves the short-circuit.

One was a genuine defect: **`buildHighlightSegments`** let zero-width matches
advance the cursor, so `/(?:)/g` over `"ab"` emitted `"a"` and `"b"` as two
adjacent unhighlighted runs instead of one `"ab"`. They render identically and
are not the same — the function owes its caller the invariant that no two
adjacent segments are both plain.

**Changed files:**

- `apps/web/src/components/regex/evaluate.ts`
- `apps/web/tests/dim-sum.test.ts`
- `apps/web/tests/changelog-parse.test.ts`
- `apps/web/tests/components/DesignFilesPanel.test.tsx`
- `apps/web/tests/components/WorkspaceTabsBar.test.tsx`

### 2026-08-04 — Declare the changelog test's fixture paths to the guard that flagged them

**Reason:** wiring `pnpm guard` into continuous integration — where it had
never run — immediately caught something this fork introduced. An earlier
change to `apps/web/tests/changelog-parse.test.ts` gave its two in-memory
fixtures `path` values naming real files under `docs/CHANGELOG/`, a surface
upstream classifies as certain-tier exempt and requires skippable merge-gate
lanes to leave unconsumed.

The consumption is nominal rather than real: those strings are the provenance
field of `ChangelogSourceFile` objects constructed inside the test, and the
parser only carries the value through to `buildRelease`. No changelog file is
opened. Upstream's check offers exactly two remedies — move the dependency, or
record a justified allowlist entry — and since there is no dependency to move,
this is the second, written in the same form as the three entries beside it.

Rewriting the fixture paths to dodge the literal scanner was considered and
rejected: it would have satisfied the check without changing what the test
does, which is gaming a gate rather than answering it.

**Changed files:**

- `scripts/check-certain-exempt-consumption.ts`

### 2026-08-04 — Make the shared dialog keep the promise its own markup makes

**Reason:** every dialog in the application renders `aria-modal="true"`, which
tells assistive technology the rest of the page is inert. Nothing enforced it.
Tab walked straight out of the dialog onto the controls behind the backdrop —
visually obscured, still focusable, and in the case of a confirmation dialog
the exact controls the user had just been asked to stop and think about.

Focus is now moved to the first tab stop when a dialog opens, kept inside it
by Tab and Shift+Tab, pulled back if something moves it out, and returned to
whichever control opened the dialog when it closes. Because this is the shared
primitive, every dialog gains the behaviour at once.

The visibility filter deliberately tests attributes rather than layout:
`offsetParent` is the better check in a browser and is always null under
jsdom, where these tests run, so a layout-based filter would conclude nothing
is focusable in precisely the environment that asserts the behaviour.

**Changed files:**

- `packages/components/src/dialog.tsx`
- `packages/components/tests/Dialog.test.tsx`

### 2026-08-04 — Give the spoken narrator a surface a user can actually reach

**Reason:** the narrator shipped as unreachable code. Every piece existed —
the serialized queue, the per-category cooldown, the screen-reader yield, the
preference store, the settings panel, and 19 dictionary keys in all twenty
locales — and nothing mounted any of it. `NarratorSettingsPanel` had zero
importers, so no user could turn it on however hard they looked.

It was also unmountable rather than merely unmounted: the panel imports
`NarratorSettingsPanel.module.css`, and that file did not exist. Wiring it up
without writing the stylesheet would have failed the build, which is the most
likely reason it was left unwired in the first place.

The panel is now its own section in the settings dialog, and the command
palette indexes it: the section, the on/off switch and the spoken-language
select, the latter two as live inline controls that change the real store
rather than links to it. The language label map moved into `settings.ts` so
the panel and the palette cannot drift into calling the same three languages
different things.

**Changed files:**

- `apps/web/src/components/narrator/NarratorSettingsPanel.module.css`
- `apps/web/src/components/narrator/NarratorSettingsPanel.tsx`
- `apps/web/src/components/narrator/settings.ts`
- `apps/web/src/components/SettingsDialog.tsx`
- `apps/web/src/components/command-palette/CommandPalette.tsx`
- `apps/web/src/components/command-palette/settingsIndex.ts`

### 2026-08-04 — Make the Design Files bulk delete report what actually happened

**Reason:** the bulk delete told the user it had succeeded whatever it did.
`handleDeleteMany` returned nothing, so the panel took its documented "a
parent that reports nothing back is not evidence of success" branch — which
then claimed every selected item succeeded. A delete the user cancelled at
the confirmation, and a delete where every file was refused, both produced
"N done." The same call site dropped the panel's `options` argument, so the
progress bar stayed frozen at zero and the Stop control was decorative.

The loop is now the shared `runBulkAction` runner rather than a second
hand-rolled one: it checks the abort signal between files, reports progress
against the file in flight, and counts a helper that resolves `false` as a
failure — which `deleteProjectFile` does on every refusal. The redundant
native `confirm()` is gone with it; the panel's own preview dialog is the
confirmation, and the two together asked twice.

**Changed files:**

- `apps/web/tests/components/bulk/run.test.ts`

### 2026-08-04 — Bundle the Cairo face, and end the application's one network font request

**Reason:** every asset ships locally. The web application's stylesheet began
with an `@import` of a font CDN stylesheet — the single network font request
in the shipped product, and the one the roadmap's asset standard called out.
The three variable-font subsets that stylesheet served (weight axis 400–700:
arabic, latin-ext, latin) are now bundled under `public/fonts/cairo/` exactly
as `remixicon.woff2` already is, with the served `unicode-range` values copied
verbatim so per-page subsetting keeps working. The import line now points at
the local `@font-face` sheet; rendering is unchanged, the request is gone.

**Changed files:**

- `apps/web/src/index.css`
- `apps/web/src/styles/cairo.css`
- `apps/web/public/fonts/cairo/cairo-arabic.woff2`
- `apps/web/public/fonts/cairo/cairo-latin-ext.woff2`
- `apps/web/public/fonts/cairo/cairo-latin.woff2`

### 2026-08-04 — The 124 keys the notification, gate, bulk, colour and narrator surfaces were written against

**Reason:** the same gate as the entry below, one merge later. The notification
centre and its corner stack, the destructive-action super-confirmation gate,
the bulk-action bar and preview dialog, the infinite colour picker with its
translator, and the spoken narrator were all built against a dictionary they
did not write into, for the same reason as before: five agents appending to
twenty locale files at once produces twenty conflicts and no translations worth
keeping. This entry lands their keys.

**Fifteen of the 124 are invisible to a `t('…')` grep**, and they fail the
build exactly as hard as the rest. `SEVERITY_LABEL_KEYS` in
`notifications/NotificationHost.tsx` is a `Record<NotificationSeverity, …>`
constrained to the translator's key type, so its five severity labels never
appear as a literal argument. `LANGUAGE_LABEL` in
`narrator/NarratorSettingsPanel.tsx` is the same shape for the three spoken
languages. `BuiltInPreset.nameKey` in `appearance/presets.ts` is a union of six
preset-name keys. And `narrator.sample` reaches the dictionary through
`narrate(key: keyof Dict, …)` rather than through `t()`. The scripted check
reports 109; the real number is 124, and the difference was found by reading
every dotted string literal in `apps/web/src` and asking which of them are key
names rather than hostnames, filenames, setting ids or shortcut ids.

**A duplicate that the merge introduced.** `dimSum.blurb` was declared twice in
the `Dict` interface — TypeScript rejects a repeated property, so this was a
live build failure independent of the missing keys. The second declaration and
its redundant comment were removed; the first, and the single entry each locale
already carried, are untouched.

**Twenty locales, translated rather than seeded.** Each locale uses its own
conventional software vocabulary — *Sättigung* / *saturation* / *nasycenie* /
飽和度 for the colour axis, *Notausstieg* / *sortie de secours* / *wyjście
awaryjne* for the gate's emergency exit, and each language's real term for a
screen reader, a swatch and a hue. The only strings that match English exactly
are ones that genuinely are the same word in that language (*Alpha* in German,
*Saturation* and *Violet* in French, *Info* where the abbreviation is native)
plus `appearance.color.spaceSrgb`, which is the identifier `sRGB` everywhere.

**The gate's copy states the facts in every language.** `destructive.
irreversible` says the listed items are destroyed for good, `destructive.
reversible` says the action can be undone from version history, and
`designs.deleteGateProjectDetail` says the project folder leaves the disk with
its history — in all twenty locales, without hedging and without a joke
standing in for the fact. `privacy.deleteGateIdItem` prints the real
installation id through `{id}` so the user reads the value being discarded.

**Placeholder parity is checked, not assumed.** Every `{placeholder}` in the
124 keys was extracted per locale and compared as a set against English: all
twenty agree exactly on every key. Thirteen strings order their placeholders
differently from English — `bulk.progress` reads "{total} 件中 {done} 件完了" in
Japanese — which is a sentence-order choice the named-placeholder interpolator
handles, not a dropped value.

**`zh-HK` gets all 124 explicitly**, appended after the `...zhTW` spread so its
own entries win. Letting Cantonese-authored copy arrive through the spread
would ship Traditional Mandarin phrasing on a brand-new surface. It now holds
968 of its own entries and inherits the remaining 3,573.

**Verified by reading**, since this tree cannot run a typechecker: the `Dict`
interface parses to 4,541 unique keys with no duplicates, each of the twenty
locale dictionaries resolves all 4,541 — nineteen directly, `zh-HK` as 968 own
plus 3,573 inherited — and no locale file declares any key twice. Each file
kept its own quote style: single quotes everywhere except `zh-CN`, `zh-TW` and
`zh-HK`, which use double. `scripts/check-i18n-keys.sh` reports zero
used-but-undeclared keys and every locale complete.

**Changed files:**

- `apps/web/src/i18n/locales/ar.ts`
- `apps/web/src/i18n/locales/de.ts`
- `apps/web/src/i18n/locales/en.ts`
- `apps/web/src/i18n/locales/es-ES.ts`
- `apps/web/src/i18n/locales/fa.ts`
- `apps/web/src/i18n/locales/fr.ts`
- `apps/web/src/i18n/locales/hu.ts`
- `apps/web/src/i18n/locales/id.ts`
- `apps/web/src/i18n/locales/it.ts`
- `apps/web/src/i18n/locales/ja.ts`
- `apps/web/src/i18n/locales/ko.ts`
- `apps/web/src/i18n/locales/pl.ts`
- `apps/web/src/i18n/locales/pt-BR.ts`
- `apps/web/src/i18n/locales/ru.ts`
- `apps/web/src/i18n/locales/th.ts`
- `apps/web/src/i18n/locales/tr.ts`
- `apps/web/src/i18n/locales/uk.ts`
- `apps/web/src/i18n/locales/zh-CN.ts`
- `apps/web/src/i18n/locales/zh-HK.ts`
- `apps/web/src/i18n/locales/zh-TW.ts`
- `apps/web/src/i18n/types.ts`

### 2026-08-04 — The 205 keys the four new surfaces were written against

**Reason:** `i18n/types.ts` declares a flat `Dict`, and a key missing from any
one locale is a type error rather than a runtime fallback. That gate is the
reason the surface work above — the regex builder, the dim sum surprise, the
changelog viewer, the command palette, and tab pinning with bulk close — was
built without touching the dictionaries: four agents writing into twenty files
at once would have produced twenty merge conflicts and no translations worth
having. They reported the keys instead. This entry lands them.

**What the keys were checked against, not just what was reported.** The
reported list was diffed against every translation lookup in the new and
changed components, including the ones that never reach a bare `t('…')` call —
`Record<Flag, keyof Dict>` label maps, `labelKey`/`titleKey`/`hintKey` fields in
the palette's command registry and settings index, and the sparse
`FunnyOverrides` maps, all of which are typed as `keyof Dict` and so fail the
build exactly as hard as a direct call. The two sets agreed exactly: 205 keys
used, 205 keys reported, none used-but-unreported and none reported-but-unused.
Nothing was invented to cover a gap, because there was no gap.

**Twenty locales, translated rather than seeded.** Every locale carries a real
translation in its own language, using that language's conventional term for
the technical nouns — *reguläres Ausdruck* / *expression régulière* /
*wyrażenie regularne* / 正規表示式 / 정규식 for the engine's own vocabulary,
*Erfassungsgruppen* / *groupes de capture* / *grupos de captura* /
キャプチャグループ for capture groups, and the platform-conventional name for a
command palette in each. English is the reported copy; `zh-HK` is the reported
Cantonese. No locale received English text as a placeholder.

**Placeholder parity is checked, not assumed.** Every `{placeholder}` in a
translated string was compared against the English source before the write, in
all twenty locales — a missing `{count}` renders a sentence that silently drops
its number, which is precisely the failure the funny-level rules forbid. Two
strings are deliberately identical everywhere: `changelog.datePlaceholder` is
the format mask `YYYY-MM-DD` rather than prose, and `changelog.commitSummarizes`
keeps its literal `{count}` because the export renderer substitutes it per entry
instead of through `t()`.

**`zh-HK` gets the 205 keys explicitly**, even though it spreads `zh-TW` and
would satisfy the `Dict` gate without them. The spread exists to inherit
Traditional Chinese for keys nobody has rewritten yet, and letting a key that
*has* Cantonese copy arrive through it would have quietly shipped Mandarin
phrasing on a brand-new surface. It now holds 844 of its own entries and
inherits the remaining 3,655.

**Verified by reading**, since this tree cannot run a typechecker: the `Dict`
interface parses to 4,499 unique keys with no duplicates, and each of the
twenty locale dictionaries resolves all 4,499 with zero extras — nineteen
directly, `zh-HK` as 844 own plus 3,655 inherited. Every appended line was then
tokenised as a JS string literal pair to prove the quoting closes: 4,100 new
entry lines — 205 keys in each of the twenty locales — plus the 205 matching
`Dict` declarations, zero malformed. Each file kept its own quote style —
single quotes everywhere except `zh-CN`, `zh-TW` and `zh-HK`, which use double.

**Changed files:**

- `apps/web/src/i18n/locales/ar.ts`
- `apps/web/src/i18n/locales/de.ts`
- `apps/web/src/i18n/locales/en.ts`
- `apps/web/src/i18n/locales/es-ES.ts`
- `apps/web/src/i18n/locales/fa.ts`
- `apps/web/src/i18n/locales/fr.ts`
- `apps/web/src/i18n/locales/hu.ts`
- `apps/web/src/i18n/locales/id.ts`
- `apps/web/src/i18n/locales/it.ts`
- `apps/web/src/i18n/locales/ja.ts`
- `apps/web/src/i18n/locales/ko.ts`
- `apps/web/src/i18n/locales/pl.ts`
- `apps/web/src/i18n/locales/pt-BR.ts`
- `apps/web/src/i18n/locales/ru.ts`
- `apps/web/src/i18n/locales/th.ts`
- `apps/web/src/i18n/locales/tr.ts`
- `apps/web/src/i18n/locales/uk.ts`
- `apps/web/src/i18n/locales/zh-CN.ts`
- `apps/web/src/i18n/locales/zh-HK.ts`
- `apps/web/src/i18n/locales/zh-TW.ts`
- `apps/web/src/i18n/types.ts`

### 2026-08-04 — A command palette, and tabs you can pin and close in bulk

**Reason:** two gaps that look unrelated and are the same gap. The app had a
quick switcher for files and a tab strip that could reorder and overflow, and
in both cases the thing a user actually wanted — "take me to that setting",
"keep these four tabs and close the other thirty" — was not reachable from
either. This adds the surface that answers the first and the two tab
operations that answer the second.

#### The palette is a second surface, not a bigger quick switcher

`components/QuickSwitcher.tsx` is untouched. It keeps Cmd/Ctrl+P, its own
overlay, its own recents and its own scoring, because it is the one people hit
dozens of times an hour and it is already good at its job. The palette takes
**Cmd/Ctrl+Shift+P** and exposes the quick switcher as one *scope* inside it,
by borrowing rather than copying: `command-palette/quickSwitcherScope.ts`
imports `scoreMatch` and `scoreWorkspaceContextMatch` from the quick switcher
itself, so the two surfaces cannot rank the same query differently.

The file list reaches the palette through a small publish store rather than a
prop. `FileWorkspace` is the only component that knows the project's files, the
palette mounts at the app shell above every route, and threading the list up
would have meant a prop drilled through every view that does not care. The
workspace publishes while mounted and withdraws on unmount; the palette says so
honestly when nothing is published instead of showing an empty list. The two
openers travel in a ref rather than the dependency array — publishing every
render would churn every subscriber for no new data, and capturing them once
would open files against a stale snapshot of the workspace.

#### The settings index, and the drift it is designed to fail on

`SettingsDialog.tsx` renders nineteen sections as nineteen bespoke JSX trees.
There is no declarative table to walk, so `command-palette/settingsIndex.ts` is
that table, written by hand — and the risk a hand-written index carries is that
a section added next month is never indexed, leaving a palette that swears a
setting does not exist. Two guards, at two different times:

- **Compile time** — `SETTINGS_SECTION_TOKENS` is a `Record<SettingsSection, true>`.
  A new token that is not listed fails typecheck; a listed token that no longer
  exists fails too.
- **Test time** — `tests/components/CommandPalette.settings-index.test.ts`
  asserts every token in that record has at least one index entry. The record
  can be kept exhaustive by rote; that test is what makes someone actually
  write the entry.

The same suite also pins every `titleKey`/`hintKey` to a key that exists in the
English dictionary, so an index entry can never render a key name back at the
user.

#### A row that is a setting renders the setting

Ten index entries carry a `control`, and those rows render the real control
inline — a `<select>` for the theme, the accent and the locale, a `role="switch"`
for the notification, pet and telemetry booleans, a range input for each
funny-level slider. They are not copies: config-backed controls write through
the same `handleConfigPersist` autosave path the Settings dialog uses, and the
i18n-backed ones call the provider's own setters. The `SettingsControlId` union
is switched exhaustively with a `never` fallthrough, so adding an id to the
index without teaching the component about it is a typecheck error rather than
a row that quietly renders nothing.

#### Selecting a destination finishes the journey

`command-palette/reveal.ts` is the part that makes "teleport" mean something.
The palette records an anchor, the dialog opens, and the reveal scrolls the
exact control into view, moves focus to it and flashes it for 1.6s
(`.od-reveal-flash`, declared in `styles/primitives.css` because the targets are
arbitrary controls all over the app that the applying module does not own; an
`outline` rather than a border or shadow, so flashing a control cannot nudge the
form around it by a pixel).

Three details are load-bearing:

1. **The request is made before the surface opens**, because the control does
   not exist yet — the dialog mounts a frame later and the section's content
   later still. So `revealAnchor` polls for the node with a 2s deadline instead
   of assuming one frame is enough, and gives up quietly rather than throwing.
2. **Two consumers, one request.** A `[activeSection]` effect covers "the dialog
   was closed and is opening now"; a `SETTINGS_REVEAL_EVENT` listener covers
   "the dialog is already open on another section", which would otherwise do
   nothing visible — the worst failure mode, because it looks broken exactly
   when the user is already on the right screen. `takePendingSettingsReveal`
   consumes once, so whichever runs first wins and the other finds nothing.
3. **The reveal is armed on a `requestAnimationFrame`**, after the section's own
   `scrollTop = 0` reset, or the reset would scroll the revealed control away
   the instant it arrived.

Anchors are `data-od-setting` attributes. Section-level entries anchor on
`section:<token>`, stamped **once** on `.settings-content` from the live section
rather than nineteen times, so those cannot drift one attribute at a time;
individual controls carry their own and take precedence. Two of them live
outside `SettingsDialog.tsx` because the controls do (`pet/PetSettings.tsx`,
and `PrivacySection.tsx` where `ToggleRow` gained an optional `anchor` prop
rather than have the anchor land on a container holding two toggles).

App clears any leftover reveal request when the palette **opens**, never when it
closes: choosing a settings row arms the anchor and closes the palette in the
same commit, so clearing on close would race the request the user just made.

#### Size, focus and the keyboard

The palette opens as a **bounded card** and offers a **full-window** mode, and
the choice is persisted (`open-design:command-palette:display-mode`). The card
is the default because a search box that swallows the whole window is startling
on a large display and worse when opened by accident.

Focus returns where it came from on Escape — and the previously-focused element
is captured in the `useRef` **initializer**, during the first render, not in an
effect: the input's ref callback focuses it and ref callbacks run before passive
effects, so an effect would faithfully record the palette's own input as "where
focus came from". An action that navigates somewhere deliberately does *not*
restore focus, because the reveal has just moved it onto the control the user
asked for.

Scopes are reachable from chips, from a one-character prefix (`>` commands,
`@` settings, `/` destinations, `#` files) and from Cmd/Ctrl+Tab. Plain Tab is
deliberately not intercepted: it has to reach the highlighted row's live
control, which is why only the highlighted row's control is tabbable.

#### Tabs: pinning

Pinned tabs get a **sticky region** rather than a sticky class per tab, because
several `position: sticky; left: 0` siblings all stack at the same coordinate
and overlap. The region holds the permanent entry tab plus the user-pinned ones
and is `role="presentation"`, so the tablist still owns the tabs directly in the
accessibility tree. A sticky child of an always-flush-left sticky parent
computes to the same position, so the entry tab's existing `.is-pinned` rule
needed no override.

User-pinned tabs render **icon-only** — 34px in the entry shell, 36px in the
project shell — and the label is *clipped*, not removed: the main button carries
the full title as its `aria-label` and its tooltip, so the compact form loses
nothing to a screen reader, the keyboard or a pointer. The width is restated in
`styles/viewer/routines.css` for the same reason `.is-pinned` already is —
`.workspace-shell .workspace-tab` sets it at equal specificity from a stylesheet
imported later.

Dragging is now confined to its own region (permanent / pinned / flow). A
cross-region target is *skipped* rather than coerced, so the live drop indicator
says exactly what the drop will do; `normalizeTabsState` would re-sort a
cross-region drop straight back, and an indicator that promises a move which
then does not happen is worse than no indicator. This subsumes the old "never
drop before the entry tab" coercion, since that tab is now the only member of
its region.

#### Tabs: bulk close, as one predicate

`workspace-tabs/bulkClose.ts` exists so that "close tabs containing text" and
"close tabs NOT containing text" cannot drift. Written as two matchers they do:
one lowercases and the other forgets, one compiles with `i` and the other does
not, and a user who runs the second expecting the complement of the first loses
tabs the preview said were safe. So `compileBulkCloseMatcher` produces exactly
one `test`, and `planBulkClose` picks with
`direction === 'containing' ? test(label) : !test(label)`. There is no second
call site where a flag could diverge, and the test asserts the partition
property directly: for every query, the two directions' selections union to the
whole tab list and intersect to nothing.

It never runs on an empty query (which would match everything in "not
containing" mode — a way to close the workspace by pressing a button twice), on
a pattern past 200 characters, or on one that does not compile; the reason comes
back as a token so the component owns the copy. Matching reads the tab's visible
label and nothing else, because a bulk close that matched on data the user
cannot see would be unreviewable by construction.

`selected` and `close` are separate fields on purpose: "42 selected" and "42
will close" are different claims, and a preview that showed only the second
would hide the pinned tabs the action is about to skip. Pinned tabs are excluded
by default with an explicit opt-in, the permanent entry tab is never closable,
and both exclusions are reported by count under the preview rather than dropped.

Closing runs through one `closeTabs` call rather than a loop of `closeTab`:
sequential calls each read the render-time `state` snapshot, so the second would
resurrect the tab the first removed.

#### Tabs: persistence that tolerates the shape it finds

Pins live in the **same** localStorage payload as the tabs, not a second key. A
workspace that restored its tabs but lost its pins (or the reverse) is worse
than one that lost both, because the strip then looks right and behaves wrong.
`workspace-tabs/tabPinning.ts` reads a v1 payload (no `pinnedTabIds`) and a v2
payload through one total function, and trusts nothing in either: non-strings,
duplicates, blanks and ids for tabs that no longer exist are all dropped rather
than thrown on. Reconciliation runs on every `normalizeTabsState`, not only on
load, so a pin survives a tab being closed in another window — and it runs
*after* the existing duplicate-id rewrite, so a pin can never point at an id
that was just regenerated.

That change also required auditing every `setState` in the strip: five of them
rebuilt `{ tabs, activeTabId }` as a fresh literal, which would have unpinned
the workspace on the next tab switch, navigation or close. They now spread the
normalized state. `pinnedTabIds` is optional on `WorkspaceTabsState` precisely
so the remaining literals stay valid.

**Not changed, deliberately:** the tab strip's hardcoded English chrome
("Search tabs", "Open tabs", "New tab", "No tabs found") is pre-existing and out
of scope for this entry; the new controls beside it are translated.

**Changed files:**

- `apps/web/src/App.tsx`
- `apps/web/src/components/SettingsDialog.tsx`
- `apps/web/src/components/WorkspaceTabsBar.module.css`
- `apps/web/src/components/command-palette/CommandPalette.module.css`
- `apps/web/src/components/command-palette/CommandPalette.tsx`
- `apps/web/src/components/command-palette/commands.ts`
- `apps/web/src/components/command-palette/quickSwitcherScope.ts`
- `apps/web/src/components/command-palette/reveal.ts`
- `apps/web/src/components/command-palette/settingsIndex.ts`
- `apps/web/src/components/workspace-tabs/bulkClose.ts`
- `apps/web/src/components/workspace-tabs/tabPinning.ts`
- `apps/web/src/styles/shell.css`
- `apps/web/src/styles/viewer/routines.css`
- `apps/web/tests/components/CommandPalette.settings-index.test.ts`
- `apps/web/tests/components/CommandPalette.test.tsx`
- `apps/web/tests/components/WorkspaceTabsBar.bulkClose.test.ts`
- `apps/web/tests/components/WorkspaceTabsBar.pinning.test.ts`

### 2026-08-04 — A regex builder, and search bars that can actually use it

**Reason:** the app had twenty-odd search bars and every one of them did
`haystack.toLowerCase().includes(needle)`. That is the right default and it is
also the only thing they could do. There was no way to anchor a match, no way
to say "any of these three", and nothing anywhere in the product that would
help someone write a pattern if there had been.

**`apps/web/src/components/regex/` is the whole feature**, and it is built so
that one fact holds end to end: **the engine is `new RegExp(source, flags)`,
and the interface says so.** `REGEX_ENGINE_LABEL` is rendered in the builder's
header and in its error heading. The regex the preview matches with is the same
object the wired search bar filters with — there is no second dialect, no
server round trip, and no translation step where a `\d` could come to mean
something different in the two places. A builder that implied PCRE while the
search ran JavaScript would be worse than shipping no builder at all.

**Two editors, one pattern, and an honest refusal between them.** The raw
pattern editor and the guided parts list write to the same string, which is
also the search field's own value — so there is no third copy to reconcile.
`parse.ts` turns a typed pattern back into parts, and it is deliberately
narrow: it recognises exactly what `renderParts` emits plus the plainest
hand-written equivalents, and it **refuses** everything else rather than
approximating. Lookarounds, backreferences, `\n`, `\p{L}`, top-level `|` and an
unterminated class all come back as "unsupported", and the builder then says
which token at which position defeated it, keeps the pattern *exactly* as
typed, and disables the guided controls until the user explicitly asks to
rebuild from parts. The alternative — mapping `(?=foo)` onto a capturing group
because it is roughly parenthesis-shaped — would silently rewrite someone's
working pattern the moment they touched an unrelated dropdown. A test asserts
the property this buys: everything the parser accepts round-trips to byte-
identical source.

**Guided construction covers literals, classes, anchors, groups, alternation
and quantifiers**, each with the regex it emits shown next to it. Literals are
escaped for the user, and a multi-character literal with a quantifier is
wrapped — `ab` repeated is `(?:ab)+`, never `ab+`, which would repeat only the
`b`. Custom character classes are deliberately *not* escaped as text, because
`a-z0-9_` has to stay a range set; only a `]` that would close the class early
and a leading `^` that would negate it behind the user's back are handled, and
the hint under the field says which of the two it is. Quantifiers include the
lazy variants, and the lazy checkbox is hidden for `{n}` where it would mean
nothing.

**Safety is three bounds and one honest disclaimer.** Pattern length, sample
length and `{n,m}` counts are capped before anything reaches the engine;
`runSample` checks a wall-clock deadline *between* `exec` calls and stops at a
match cap; and the list predicate adds up its own time across a filtering pass
and, once over budget, stops evaluating and starts returning `true` for
everything. Giving up by matching everything rather than nothing is deliberate:
an unfiltered list is a visible, recoverable state, whereas silently hiding
rows is indistinguishable from data loss. What none of that covers is stated in
a comment at the top of `evaluate.ts` and in the builder's own footer: this
bounds how *many* evaluations happen, not how long *one* takes. A single
`exec` cannot be interrupted, so a genuinely catastrophic pattern on a subject
that survives the length caps still blocks the main thread until the engine
returns. `looksCatastrophic` warns about the nested-quantifier shape behind
most real blow-ups and is labelled a heuristic, with a test pinning a case it
cannot see. Real interruptibility needs a worker or a non-backtracking engine;
neither is here, and nothing in the file claims otherwise.

**An invalid pattern never breaks the list.** The last pattern that compiled is
kept, and a half-typed `[` leaves the search running on it while the engine's
own error message — verbatim, not a paraphrase — appears under the field.

**`RegexSearchField` is the wiring, and every field owns its own.** The
controller is created by the *host* component and handed down, so mode, flags,
parts, sample text and compiled pattern are per-field; there is no module state
and no context, and two fields on one screen cannot see each other. The field
renders the original `<input>` with its original class inside a thin flex host,
so every existing CSS rule that targeted that input still matches, and puts one
`.*` affordance beside it. The popover is portalled and positioned from the
host's measured rect rather than absolutely positioned — that is what lets a
field inside a modal or an `overflow: hidden` toolbar open a builder that is
not clipped. It closes on Escape and returns focus to the field, closes on an
outside pointer or focus, bounds its height to the room available and scrolls
inside that bound.

**Plain text stays the default in every wired field; regex is a per-field
opt-in.** Until the user turns it on, the builder shows the plain-text notice
and the switch and nothing else — there is no pattern editor to accidentally
type into. Turning it on reads whatever is in the field as a pattern and never
silently rewrites it; "escape this text so it matches literally" is a separate,
explicit button.

**Eight search bars are wired**, chosen for breadth and including three inside
Settings: Examples, Settings → Skills, Settings → Design systems, Settings →
MCP server templates, Brands, the design-systems library, the reference-a-
project modal, and the plugin marketplace. Each keeps its existing behaviour in
plain-text mode — the marketplace's every-word-must-appear matching is
preserved and only bypassed for a pattern, because splitting a regex on spaces
would break it. **The settings dialog itself has no global settings search to
wire**; the three settings-surface fields above are its per-section ones.

**Changed files:**

- `apps/web/src/components/regex/RegexBuilder.module.css`
- `apps/web/src/components/regex/RegexBuilder.tsx`
- `apps/web/src/components/regex/RegexPartRow.tsx`
- `apps/web/src/components/regex/RegexSamplePanel.tsx`
- `apps/web/src/components/regex/RegexSearchField.module.css`
- `apps/web/src/components/regex/RegexSearchField.tsx`
- `apps/web/src/components/regex/evaluate.ts`
- `apps/web/src/components/regex/index.ts`
- `apps/web/src/components/regex/parse.ts`
- `apps/web/src/components/regex/parts-ops.ts`
- `apps/web/src/components/regex/pattern.ts`
- `apps/web/src/components/regex/useRegexSearch.ts`
- `apps/web/tests/components/regex/RegexSearchField.test.tsx`
- `apps/web/tests/components/regex/evaluate.test.ts`
- `apps/web/tests/components/regex/parse.test.ts`
- `apps/web/tests/components/regex/pattern.test.ts`

### 2026-08-04 — A dish at startup, and a changelog you can read inside the app

**Reason:** two of the four things the changelog's own "Not done yet" list
admitted the application lacked. Neither existed in any form; both are built
here out of what the repository already holds rather than out of anything new
invented for them.

**The dim sum surprise.** One launch in ten shows a dish: its photograph, its
name in English and Traditional Chinese, and a line of copy the funny-level
sliders style. Twelve photographs — one per category, the lowest id in each —
are copied byte-for-byte out of `assets/dim-sum/` into `apps/web/public/dim-sum/`
and re-verified by SHA-256 at generation time, so the packaged app ships them
locally and fetches nothing. `scripts/generate-dim-sum-catalog.mjs` does the
copying and writes the typed module the app imports; `--check` proves the
committed outputs still match the catalogue.

The surprise is a non-blocking toast through the app's existing `Toast`, which
gained one optional `media` slot for a picture and nothing else. It is bounded
hard: the draw is spent once per launch whether it wins or loses, so no
remount, route change or development double-invoke can re-roll it; and it is
only offered once the daemon config has hydrated, onboarding and the privacy
disclosure are done, no app-level error toast is up, and no update is in
flight. The media slot preserves the visual node's own accessible name and
styling, while the toast contributes only an ordered wrapper and spacing; a
text-only toast creates no empty media wrapper. There is no setting that turns
it off — what makes that polite is that
it never gates startup, never takes focus and never delays the app becoming
usable.

**The changelog viewer.** Every version the repository records, with its
categorized changes, read from `CHANGELOG.md` and `docs/CHANGELOG/v*/en.md`.
`scripts/generate-changelog.mjs` writes the build-time module: the source
markdown, plus every commit those sources reference resolved against git to a
full object id and an author date, with the link taken verbatim from the source
rather than assembled from a guessed origin. An abbreviation this repository
does not have is recorded as unresolved and **never** linked — the entry says
so instead, as does an entry whose source names no commit at all. The shape of
a release is derived from that markdown by `lib/changelog/parse.ts`, which is
deliberately the only parser: the one the tests exercise and the one the app
runs.

Three details the sources forced. No source records a release date, so a
release is dated by the newest change in it and the viewer labels that as what
it is rather than dressing it up as a publication date. A release written
entirely in prose (0.14.1) is still a release, so paragraphs under a category
heading are entries. And an undated entry cannot be shown to fall inside a date
range, so a set range excludes it and the viewer says how many it excluded —
silently keeping them would make the range a suggestion, silently dropping them
would hide a change.

The filter is a search and an anchored calendar with month and year jumps and
range selection, over two fields you can type into. A half-typed date is
reported as unfinished and an impossible one as impossible, and in neither case
is the field rewritten or cleared underneath the user. Copy and export render
exactly what the filter kept, in Markdown or plain text, and state the range in
the file. It opens from Settings → About, directly under the version.

**Changed files:**

- `apps/web/public/dim-sum/hk-dish-0260-chocolate-lava-egg-tart.png`
- `apps/web/public/dim-sum/hk-dish-0271-sweet-and-sour-pork-with-pineapple.png`
- `apps/web/public/dim-sum/hk-dish-0296-beef-with-black-bean-and-peppers.png`
- `apps/web/public/dim-sum/hk-dish-0406-claypot-rice-with-chinese-sausage.png`
- `apps/web/public/dim-sum/hk-dish-0446-wonton-noodles.png`
- `apps/web/public/dim-sum/hk-dish-0526-dai-pai-dong-style-dry-fried-beef-ho-fun.png`
- `apps/web/public/dim-sum/hk-dish-0551-cha-chaan-teng-baked-pork-chop-rice.png`
- `apps/web/public/dim-sum/hk-dish-0560-chocolate-filled-sesame-balls.png`
- `apps/web/public/dim-sum/hk-dish-0600-chocolate-lava-ma-lai-go.png`
- `apps/web/public/dim-sum/hk-dish-0626-hong-kong-dessert-shop-mango-pomelo-sago.png`
- `apps/web/public/dim-sum/hk-dish-0676-hong-kong-milk-tea.png`
- `apps/web/public/dim-sum/hk-dish-0701-haw-flake-discs.png`
- `apps/web/src/App.tsx`
- `apps/web/src/components/DimSumSurprise.module.css`
- `apps/web/src/components/DimSumSurprise.tsx`
- `apps/web/src/components/SettingsDialog.tsx`
- `apps/web/src/components/Toast.tsx`
- `apps/web/src/components/changelog/ChangelogDateRange.module.css`
- `apps/web/src/components/changelog/ChangelogDateRange.tsx`
- `apps/web/src/components/changelog/ChangelogDialog.module.css`
- `apps/web/src/components/changelog/ChangelogDialog.tsx`
- `apps/web/src/components/changelog/open-changelog.ts`
- `apps/web/src/lib/changelog/dates.ts`
- `apps/web/src/lib/changelog/filter.ts`
- `apps/web/src/lib/changelog/generated.ts`
- `apps/web/src/lib/changelog/index.ts`
- `apps/web/src/lib/changelog/parse.ts`
- `apps/web/src/lib/dim-sum/catalog.ts`
- `apps/web/src/lib/dim-sum/surprise.ts`
- `apps/web/src/styles/home/entry-layout.css`
- `apps/web/src/styles/viewer/routines.css`
- `apps/web/tests/changelog-filter.test.ts`
- `apps/web/tests/changelog-parse.test.ts`
- `apps/web/tests/dim-sum.test.ts`

### 2026-08-04 — Cantonese, a bilingual mode, and two funny-level sliders

**Reason:** the product shipped nineteen locales and no way to read two at
once, no Cantonese at all, and no control over how its copy sounds. All three
are now settings, and all three land in one place — `t()` — because that
function is the single point every component already goes through.

**`zh-HK` (廣東話) is a real locale, not a `zh-TW` alias.** It joins the
`Locale` union, `LOCALES`, `LOCALE_LABEL` and the `DICTS` map. The dictionary
is the one locale file in the tree that satisfies `Dict` by spreading another
(`...zhTW`) and then overriding what has actually been rewritten. That shape
was chosen deliberately over pasting 4,291 near-duplicate lines:

1. It keeps the file honest about its own coverage. 639 keys below the spread
   have been rewritten into spoken Cantonese — 係/嘅/唔/仲/咗/喇 particles,
   spoken word order — covering `common.*`, the chat chrome and every
   `chat.runError.*`, the workspace and tab strip, conversations, the question
   form, onboarding, the tool cards, the updater, the preview/share menus and
   the parts of `settings.*` a user actually opens. Everything else is visibly
   still the seeded Traditional text: correct, readable Chinese that a Hong
   Kong reader understands, just not yet how they speak.
2. A key added to `zh-TW` reaches `zh-HK` for free, so the twentieth locale
   cannot become the one that always breaks the typecheck gate.

Two groups are deliberately left seeded rather than Cantonese-ified, and the
file says so: strings sent to a *model* rather than read by a person
(`chat.contextPrompt.*`, `nextStep.*Prompt`, `home.starter.*.firstPrompt`),
where a register game buys nothing and can cost instruction-following; and
brand proper nouns, which stay verbatim in every locale (the
`plugins.availableDetails.integrity` lock passes through the spread unchanged).

**`resolveSystemLocale` now lets region beat script.** It inspected only the
second subtag, so `zh-Hant-HK` — what macOS reports for a Hong Kong user —
matched `hant` and landed on `zh-TW`. It now scans every subtag: `hk`/`mo`
anywhere wins, `hant`/`tw` otherwise, `zh-CN` as before. The existing
`zh-Hant-HK → zh-TW` assertion in `tests/i18n/locales.test.ts` was the encoded
form of the old behaviour and is replaced by a case that pins all eight tags.

**Bilingual mode needed no component changes at all.** A persisted
`languageMode` of `'single' | 'bilingual'` sits in the provider; in bilingual
mode `t()` renders the key twice and joins the two. English pairs with 廣東話
and every other locale pairs with English, so the pair always holds the
language the reader picked plus one they are likely to read. `composeBilingual`
declines in three cases that would produce noise rather than a translation: an
empty side, two sides that are already the same string (untranslated keys,
brand names), and values whose whole lexical content is one or two characters
or carries no letter — `{n}m`, `⤢`, `·` are units and glyphs, and doubling
them makes a timestamp chip unreadable. A value that already spans lines joins
on a newline instead of the middot.

**Two funny-level sliders, 1–5, one per language, persisted separately.**
Level 1 is the neutral base dictionary, which is also the default: an install
that never opens the setting reads exactly as it did before. Levels 2–5 come
from sparse override maps in `apps/web/src/i18n/funny/{en,zh-HK}.ts` — 216
keys each, 881 variants in total, curated onto the copy a user actually
collides with (errors, empty states, destructive confirmations, toasts,
onboarding) rather than pretending to five full dictionaries of 4,291 keys.
The two maps cover the same key set, so a bilingual reader gets the same energy
on both sides of the separator. A key with no entry renders its base string at
every level; a key that defines only 3 and 5 falls *down* to the nearest
defined step rather than snapping back to neutral.

**The level changes voice, never facts — and that is enforced, not promised.**
`keepsTheFacts` compares each override against its neutral base and discards
any candidate that lost a `{placeholder}` or a number the base carried (a
version, a count, a percentage, a file count); the base string renders in its
place. So a joke that would cost the reader a fact degrades to a silent no-op
rather than shipping. The mechanism cannot catch a line that quietly drops the
word "permanently", so the destructive confirmations were written level by
level with every fact — what is deleted, from where, and that messages go with
it — identical from 1 to 5, and `settings.funnyFactsNotice` is deliberately the
one string that is never funny-levelled, because it is the promise the levels
are made under.

**Settings → Language grew a mode control, the two sliders, and a one-time
disclosure**, following that file's existing `seg-control` / `field` / `hint`
patterns rather than inventing a fourth. The disclosure fires there rather than
at first run because that is the surface that can act on it — the dial it
describes is the next thing on the page — and its dismissal is persisted, so it
is genuinely one-time. Only English and 廣東話 get a slider: a third slider
that moved nothing would be a lie in the shape of a control.

Adding the locale surfaced three places that would otherwise have failed
typecheck or silently served English, and one that would have mixed scripts:

- **Home hero** — its `HOME_PROMPT_EXAMPLES` table is an exhaustive
  `Record<Locale, …>`, and its guard test requires four *non-English* examples
  for all six chips in every locale, so `zh-HK` gets its own Cantonese set.
- **Sketch editor** — its Excalidraw language map is likewise exhaustive.
  Excalidraw ships no `zh-HK` bundle, so Cantonese rides the Traditional one —
  right script, and the closest thing that actually exists upstream. The DOM
  text overrides follow for the same reason.
- **Plugin preset seeding** — it classified only `zh-CN`/`zh-TW` as `'zh'`,
  which would have seeded a Cantonese user's plugin prompts in English.
- **Update dialog** — it picks full-width parentheses for CJK locales and
  would have printed ASCII ones inside Chinese copy.

Nineteen new `Dict` keys carry the settings surface and are declared in all
twenty locale files, since a key missing from any one of them fails typecheck.
`AGENTS.md`'s i18n section named nineteen locale files and described `t()` as a
plain lookup; both are now true again.

Not changed, deliberately: `i18n/content.ts` already routes any `zh*` locale to
the `zh-CN` content bundle, so `hasLocalizedContent('zh-HK')` is true with no
edit; and `tools/pack`'s `NSIS_INSTALLER_LANGUAGE_BY_WEB_LOCALE` is a partial
map that already omits most locales, NSIS ships no `zh_HK`, and its values are
passed to electron-builder as a list — adding `zh-HK → zh_TW` would have
emitted a duplicate installer language for no gain.

**Changed files:**

- `AGENTS.md`
- `apps/web/src/components/HomeHero.tsx`
- `apps/web/src/components/SettingsDialog.tsx`
- `apps/web/src/components/SketchEditor.tsx`
- `apps/web/src/i18n/funny/en.ts`
- `apps/web/src/i18n/funny/zh-HK.ts`
- `apps/web/src/i18n/index.tsx`
- `apps/web/src/i18n/locales/ar.ts`
- `apps/web/src/i18n/locales/de.ts`
- `apps/web/src/i18n/locales/en.ts`
- `apps/web/src/i18n/locales/es-ES.ts`
- `apps/web/src/i18n/locales/fa.ts`
- `apps/web/src/i18n/locales/fr.ts`
- `apps/web/src/i18n/locales/hu.ts`
- `apps/web/src/i18n/locales/id.ts`
- `apps/web/src/i18n/locales/it.ts`
- `apps/web/src/i18n/locales/ja.ts`
- `apps/web/src/i18n/locales/ko.ts`
- `apps/web/src/i18n/locales/pl.ts`
- `apps/web/src/i18n/locales/pt-BR.ts`
- `apps/web/src/i18n/locales/ru.ts`
- `apps/web/src/i18n/locales/th.ts`
- `apps/web/src/i18n/locales/tr.ts`
- `apps/web/src/i18n/locales/uk.ts`
- `apps/web/src/i18n/locales/zh-CN.ts`
- `apps/web/src/i18n/locales/zh-HK.ts`
- `apps/web/src/i18n/locales/zh-TW.ts`
- `apps/web/src/i18n/types.ts`
- `apps/web/tests/i18n/detect-initial-locale.test.ts`
- `apps/web/tests/i18n/language-modes.test.ts`
- `apps/web/tests/i18n/locales.test.ts`

### 2026-08-04 — The accent actually becomes Material Design 3, and motion stops being half-ported

**Reason:** a fidelity review of the token mapping found three places where the
port claimed more than it delivered. The first is the important one.

**The accent family was mapped in name only.** `styles/tokens.css` defines
`--accent` and its four derived tones as the M3 `primary` role, but nothing
downstream ever saw them: `state/appearance.ts` wrote all five as **inline
style on `<html>`**, and inline style outranks every stylesheet rule there is.
`DEFAULT_ACCENT_COLOR` was the literal `#c96442`, `DEFAULT_CONFIG.accentColor`
took that literal, and `App.tsx` fed it to `applyAppearanceToDocument` on every
mount — so every install whose owner never opened the accent picker painted its
primary CTAs the pre-port terracotta, in light *and* in dark, under every seed.
The pre-hydration script in `app/layout.tsx` did the same thing with its own
hardcoded copy of that hex before React even mounted. The most visible colour in
the product was the one the mapping could not reach.

The fix does not remove the inline write; it changes what gets written.
`DEFAULT_ACCENT_COLOR` is now `var(--md-sys-color-primary)` — the role itself
rather than a colour. Because a custom property's computed value is its
specified value *after* `var()` substitution, an inline `--accent` holding a
role reference resolves on `<html>` exactly as the stylesheet would have
resolved it, and re-resolves when the theme or the seed changes. The four
`color-mix()` tones already resolved their `--text-strong` and `--bg-panel`
operands at use time and now resolve their accent operand the same way, so
`accentVars()` itself needed no change at all.

Three consequences had to be handled rather than left to fall out:

1. **The sentinel must not look like a colour.** `var(--md-sys-color-primary)`
   fails `normalizeAccentColor`'s `^#[0-9a-fA-F]{6}$` test, which is what makes
   it safe: it can never be mistaken for a colour the user picked, it round
   trips through `localStorage` (an unrecognised stored accent already falls
   back to `DEFAULT_CONFIG.accentColor`, which is now this), and every existing
   validation path treats it as "no explicit choice" without a new code branch.
2. **Selecting the default swatch had to keep working.** `setAccentColor` fell
   through `normalizeAccentColor(color) ?? c.accentColor`, so a value that does
   not normalize would have silently kept the *previous* accent — clicking
   "Default" would have done nothing. It now matches the role first.
3. **`<input type="color">` cannot hold a role.** It only accepts a hex and
   coerces anything else to black, so the custom-colour control opens on
   `CUSTOM_ACCENT_FALLBACK`, the terracotta that used to be the default. That
   hex also stays in `ACCENT_SWATCHES` as an ordinary pickable swatch, one click
   from where it always was, so nobody who liked it loses it.

The rest follows: `state/config.ts` needed no edit, because `DEFAULT_CONFIG`
already spelled its default as `DEFAULT_ACCENT_COLOR`, and
`tests/state/appearance.test.ts` needed none either, because it asserts against
that constant rather than against the hex. The two suites that pinned the
literal — `DEFAULT_CONFIG.accentColor` in `tests/state/config.test.ts`, and the
two default-accent cases in `SettingsDialog.execution.test.tsx` — now pin the
role, still as literals, so a future change to the default is still deliberate.

**`--ease-out` is back on the app's own curve.** The previous entry repointed it
to `var(--md-sys-motion-emphasized-decel)` and the comment claimed the animation
philosophy survived the move. It did not: `AGENTS.md` still names
`cubic-bezier(0.23, 1, 0.32, 1)` as the canonical curve, and — more concretely —
roughly as many animations in `apps/web` write that curve as a **literal** as
read the token (582 against 584), 23 stylesheets use both sources, and eight
sites write the literal as the token's *own* `var()` fallback — so the repoint
also made those fallbacks disagree with the token they back. The sharpest case
is `styles/workspace/design-files.css`, which has a single `transition`
shorthand where `opacity` takes the literal while `background`, `box-shadow` and
`color` take the token: one element, four properties, two curves. Repointing the
token therefore did not move the app onto the M3 curve, it split the app in
half; the two curves differ by 0.22 of progress a tenth of the way in, which is
enough for those four properties to visibly lead one another at the start of a
200ms enter. Sweeping ~580 literals
was not the trade this change wanted to make, so the token keeps the product's
curve, the comment says why instead of claiming otherwise, `AGENTS.md` stays
true, and the M3 curves remain declared next door for new M3 surfaces to use
directly — which is what `components/WindowTitleBar.module.css` already does.

**`--ui-scale` was a name the contract does not use.** The mockup emits the
factor as `--od-scale` (`rootVars` at `Open Design M3.dc.html` line 2032) and
`md3-tokens.css` transcribes every other contract invention verbatim, its own
header comment included. Nothing in the repository reads either name yet, so the
divergence was free to correct now and would have been a silent no-op later,
when a control wired to the mockup's spelling wrote a property nothing declared.

**Changed files:**

- `apps/web/app/layout.tsx`
- `apps/web/src/components/SettingsDialog.tsx`
- `apps/web/src/state/appearance.ts`
- `apps/web/src/styles/md3-tokens.css`
- `apps/web/src/styles/tokens.css`
- `apps/web/tests/components/SettingsDialog.execution.test.tsx`
- `apps/web/tests/state/config.test.ts`

### 2026-08-04 — The renderer's own title bar, drawn where Windows draws none

**Reason:** the previous entry took the operating system's caption bar away on
win32 and gave the renderer an IPC bridge to replace it. Until something drew
that replacement the Windows build had no minimize, no maximize and no close —
this is the surface that draws it.

`apps/web/src/components/WindowTitleBar.tsx` and its colocated
`WindowTitleBar.module.css` are the whole bar, styled as a CSS Module beside
the component the way `AGENTS.md`'s "Web CSS ownership" section asks new
component-owned UI to be. Every value in it is the Material Design 3 contract
transcribed from this repository's own mockup
(`mockups/open-design-m3/Open Design M3.dc.html`, lines 146–157): a 40px
`surface-container` strip, one hairline `outline-variant` border along the
bottom only, 12px of padding on the left and none on the right so the buttons
run to the window edge, the 20px brand mark in `primary`, the app name at
12px/600 with `.02em` tracking in `on-surface-variant`, a flexible drag region,
and three 46px caption buttons whose hover is the `--ripple` state layer —
except Close, which takes the literal `#C42B1C` on `#fff` that the contract
deliberately keeps outside the token system because it is the Windows system
red rather than a role.

Four things about it are load-bearing rather than cosmetic:

1. **It renders nothing unless the host is the frameless Windows shell.** The
   bridge must report a desktop client on `win32` *and* actually carry the
   optional `windowControls` namespace. Either half alone would be enough
   today, since the preload exposes that namespace on win32 only — asking both
   is what stops a future change to one of them from painting caption buttons
   that do nothing on macOS or Linux.
2. **The maximized glyph follows the window, not the button.** It is seeded
   from `isMaximized()` (a session reopened maximized reaches first paint that
   way) and then tracks the bridge's push, because Windows changes the state
   behind the app's back through snap layouts, Win+Up and a drag off the top
   edge. The subscription is torn down on unmount.
3. **The bar drags, the buttons do not.** The strip is
   `-webkit-app-region: drag`; each button opts back out with `no-drag`, or a
   click on one would begin a window drag instead of firing. Double-click to
   toggle maximize is bound to the drag region rather than the whole bar, so a
   double-click on Close cannot also maximize the window on its way up the
   tree.
4. **The button selectors are two-class (`.bar .button`) on purpose.**
   `styles/primitives.css` styles bare `button`, and its
   `button:hover:not(:disabled)` rule has specificity (0,2,1); a single-class
   module rule would lose the hover the caption bar depends on and repaint it
   in the product's generic button colours.

Two deliberate departures from the mockup, both because the mockup is a
demonstration page and this is the application:

- The mockup's second title-bar span, `— Material 3 Expressive · Windows`,
  describes the mockup itself and is not product copy, so the brand mark is the
  logo and `app.brand` alone.
- The contract's focus ring is `3px solid primary` at `outline-offset: 2px`.
  The offset is inset here, because these buttons sit flush against the top and
  right edges of the window and an outward ring would be drawn outside the
  window and clipped away on two sides of every button.
- The mockup's glyphs are Material Symbols Rounded (`minimize`, `crop_square`,
  `close`), a font this application does not bundle and will not fetch. The bar
  uses the app's own bundled Remix icon set at the contract's sizes —
  `subtract-line` at 16px, `checkbox-blank-line`/`checkbox-multiple-blank-line`
  at 15px, `close-line` at 17px — rather than adding a webfont for three
  glyphs.

`App.tsx` mounts it as the first child of the shell, above the existing
`WorkspaceTabsBar` chrome; nothing else in the tree moved. `styles/shell.css`
gains the one rule that change requires: `.workspace-shell` is a two-row grid,
so a third child needs a third row. The rule selects on
`:has(> [data-window-title-bar])` rather than on a second copy of the platform
test, so the row count cannot drift away from whether the bar is actually on
screen — and on every other platform the component renders nothing, the
selector does not match, and the shell keeps the template it always had. The
tab row in that template is `auto`, not a literal: `:has()` adds the
specificity of its argument, so the rule outranks every bare `.workspace-shell`
selector regardless of import order, and `styles/viewer/routines.css` already
re-declares that template at a different height. Sizing the row to the chrome
header's real height keeps the Windows path from being pinned to a number the
header no longer uses.

The four caption labels are new i18n keys (`titleBar.minimize`,
`titleBar.maximize`, `titleBar.restore`, `titleBar.close`) added to the typed
`Dict` and to all nineteen locale files, since a key missing from any one of
them fails typecheck. They are standard window-control labels, so each locale
uses the term that platform's users already read on those buttons rather than a
literal translation.

**Changed files:**

- `apps/web/src/App.tsx`
- `apps/web/src/components/WindowTitleBar.module.css`
- `apps/web/src/components/WindowTitleBar.tsx`
- `apps/web/src/i18n/locales/ar.ts`
- `apps/web/src/i18n/locales/de.ts`
- `apps/web/src/i18n/locales/en.ts`
- `apps/web/src/i18n/locales/es-ES.ts`
- `apps/web/src/i18n/locales/fa.ts`
- `apps/web/src/i18n/locales/fr.ts`
- `apps/web/src/i18n/locales/hu.ts`
- `apps/web/src/i18n/locales/id.ts`
- `apps/web/src/i18n/locales/it.ts`
- `apps/web/src/i18n/locales/ja.ts`
- `apps/web/src/i18n/locales/ko.ts`
- `apps/web/src/i18n/locales/pl.ts`
- `apps/web/src/i18n/locales/pt-BR.ts`
- `apps/web/src/i18n/locales/ru.ts`
- `apps/web/src/i18n/locales/th.ts`
- `apps/web/src/i18n/locales/tr.ts`
- `apps/web/src/i18n/locales/uk.ts`
- `apps/web/src/i18n/locales/zh-CN.ts`
- `apps/web/src/i18n/locales/zh-TW.ts`
- `apps/web/src/i18n/types.ts`
- `apps/web/src/styles/shell.css`
- `apps/web/tests/components/WindowTitleBar.test.tsx`

### 2026-08-04 — Frameless Windows window with a custom Material Design 3 title bar

**Reason:** Windows builds showed the operating system's own title bar. The
frameless chrome existed only for macOS, where `MAC_WINDOW_CHROME` spread
`titleBarStyle: "hiddenInset"` plus a traffic-light position and spread an
empty object everywhere else, so win32 fell through to the default caption bar
— a grey strip of another design system sitting above a Material Design 3
application.

That constant is now `PLATFORM_WINDOW_CHROME` with a win32 branch of
`{ titleBarStyle: "hidden" }`. The macOS branch is unchanged. Two neighbouring
options were deliberately **not** used, and the reasons are worth recording
because both look like the obvious fix:

- **`frame: false`** removes the whole window frame, not just the caption bar,
  and takes Windows 11's rounded corners, drop shadow and Alt+Space system menu
  down with it. `titleBarStyle: "hidden"` leaves the window an ordinary framed
  window that simply draws no caption bar.
- **`titleBarOverlay`** keeps the OS drawing the caption buttons, in a
  reserved region the app must dodge. That is precisely the chrome this change
  exists to replace, so the buttons would be the operating system's and the
  title bar around them would be the product's.

One Windows 11 behaviour genuinely does not survive, and the code comment says
so rather than claiming otherwise: the **snap-layouts flyout**. The OS raises it
only while it hit-tests the pointer onto a maximize button — `WM_NCHITTEST`
returning `HTMAXBUTTON` — and `-webkit-app-region: drag` reports `HTCAPTION` for
the whole strip, with no Electron API to mark an HTML element as the maximize
button short of letting `titleBarOverlay` draw the OS's own buttons there. So
hovering the renderer's maximize button pops no flyout; Win+Z and drag-to-edge
snapping still work. That is the cost of the caption bar being the product's.

With no OS caption bar there is no OS route to minimize, maximize or close, so
the renderer needs one. `apps/desktop/src/main/window-controls.ts` is a new
module registering four IPC channels (`od:window:minimize`,
`od:window:toggle-maximize`, `od:window:close`, `od:window:is-maximized`) and a
`od:window:maximized-changed` push. Two properties of it are load-bearing:

1. **Every handler verifies the sender is the main window.** The app enables
   `webviewTag` and every frame in the process shares one preload, so an
   embedded design-browser guest reaches the same channels; without the check
   any page a user loaded in that panel could close the application. The check
   and its message mirror `requireMainWindowSender`, which already guards the
   updater and capture channels in `runtime.ts`.
2. **The window's maximized state is pushed, not polled.** Windows changes it
   behind the app's back — a snap layout, a double-clicked drag region, Win+Up,
   or a drag off the top edge all bypass the renderer's own button — so a title
   bar that only tracked its own clicks would show the wrong glyph. The main
   window's `maximize`/`unmaximize` events fan out to the renderer, guarded
   against a destroyed window.

Both surfaces are declared structurally rather than against Electron's classes
so `apps/desktop`'s vitest suite, which runs in a plain node environment with
no Electron, can exercise the whole module with object mocks.

The bridge namespace is **optional** (`windowControls?`) and exposed on win32
only, so a renderer feature-detects it instead of drawing caption buttons that
would do nothing on macOS and Linux. `packages/host` carries the type because
it owns the host-bridge wire contract; the preload duplicates the channel-name
literals for the same reason it already duplicates the updater ones — a
sandboxed preload may only `require('electron')`, so it cannot import the
main-process module that owns them. `apps/desktop/tests/main/window-chrome.test.ts`
asserts the chrome as source text and would otherwise have gone red on this
change; it now pins the win32 branch, the macOS branch, and the absence of both
rejected options.

**Changed files:**

- `apps/desktop/src/main/preload.cts`
- `apps/desktop/src/main/runtime.ts`
- `apps/desktop/src/main/window-controls.ts`
- `apps/desktop/tests/main/preload-host-boundary.test.ts`
- `apps/desktop/tests/main/window-chrome.test.ts`
- `apps/desktop/tests/main/window-controls.test.ts`
- `packages/host/src/index.ts`
- `packages/host/src/protocol.ts`

### 2026-08-21 — Preserve fork branding while importing desktop runtime changes

**Reason:** The v0.20.2 import placed upstream product-name lines beside the
existing Material Designer replacements in the desktop runtime instead of
resolving that branding union. The duplicate `subject`, splash-stage key,
`BrowserWindow` title, and `windowTitle` declarations stopped TypeScript
parsing before Windows packaging could begin; the remaining duplicated copy
would also have rendered both product names on recovery and startup surfaces.
The runtime now retains the upstream mail-routing, preview-navigation,
appearance, and sender-validation behavior while keeping one Material Designer
value at each fork-owned branding boundary. A focused source regression lists
the required fork strings and the forbidden upstream user-facing strings so a
future upstream import cannot silently recreate this mixed state.

**Changed files:**

- `apps/desktop/src/main/runtime.ts`
- `apps/desktop/tests/main/renderer-crash-loop.test.ts`

### 2026-08-03 — Material Design 3 token sheet, and the layer that maps the app onto it

**Reason:** the product had a hand-tuned neutral palette and no design system
behind it. This adds the Material Design 3 contract as a sheet of its own and
rewrites the existing token file into a mapping layer, so every component that
already asks for `--bg`, `--text`, `--border`, `--radius` or `--ease-out`
receives an M3 role without a single component being touched.

The split is the point. `apps/web/src/styles/md3-tokens.css` is the contract,
transcribed from this repository's own mockup
(`mockups/open-design-m3/Open Design M3.dc.html`): the 34 light colour roles,
the dark overrides, the four seed variants, the seven-step shape corner scale,
the three motion curves, the density scale, the `--ripple` state layer, a
`--ui-scale` factor, and a fifteen-role type scale assembled from the mockup's
measured size, weight, line-height and letter-spacing vocabulary (the contract
declares no typescale tokens of its own). It defines tokens and paints nothing.
`apps/web/src/styles/tokens.css` keeps all 61 of its historical property names —
none added, none removed — and redefines each in terms of a role. `index.css`
gains one line so the contract is imported immediately before the mapping layer;
nothing else moves, and it stays import-only as its own guard test requires,
which is also why the explanatory comment lives in the two token sheets and not
in `index.css`.

Dark is declared under **both** selectors the app already uses — explicit
`[data-theme="dark"]` and `html:not([data-theme])` under
`@media (prefers-color-scheme: dark)` — because overriding only the first would
leave every system-mode user on the old palette. Because the roles flip
themselves, the mapping layer's duplicated dark block mostly disappeared.

Three groups deliberately did **not** move:

1. **The status/category palette** (`--green*`, `--blue*`, `--purple*`, `--red*`,
   `--amber*`) is functional data colour, not chrome. The hue *is* the datum —
   mention kind, cost tier, pass/fail — so folding it onto M3 roles would make
   different categories indistinguishable. It keeps its own values and its own
   dark block. `--amber-border` is still deliberately undefined, because
   `workspace/mention-home.css` falls back through it to `--green-border`.
2. **`--selected` / `--selected-soft`** are ambiguous and were left alone. M3
   would call them `secondary`, but in this contract `secondary` is a warm brown
   a few degrees off `primary` — which would collapse the exact CTA-versus-
   selection distinction the token exists to hold — and they are theme-invariant
   on purpose while every M3 role is not.
3. **`--shadow-*`** keep their own light and dark values. The contract expresses
   elevation as literal box-shadows and declares neither a `shadow` colour role
   nor an elevation token set, so there is nothing to derive from.

Also deliberate: `--text-strong` converges onto `on-surface`, M3's
maximum-contrast text colour, rather than inventing a role above it; the two
reading measures (`--prose-line-height`, `--code-line-height`) stay literal
because they are long-form measures wider than any chrome role; and the accent
group is written in terms of `primary` even though `state/appearance.ts` and the
pre-hydration script in `app/layout.tsx` both set it inline on `<html>` and win.
Neither writer needed changing: their stored `color-mix()` strings resolve
against `--text-strong` and `--bg-panel` at use time, so a user's own accent is
now mixed against M3 surfaces for free.

Three style tests asserted the palette this change replaces, and were updated to
the new architecture rather than to new expectations. `default-background` no
longer reads a literal background hex out of `:root` but checks that `--bg` is
the surface role and that the role carries the M3 value; `filter-pill` and
`home-hero-picker-contrast` follow `var()` indirection to a hex before measuring
contrast. All three also had to stop taking the *first* `:root` /
`[data-theme="dark"]` block they found, since there are now two sheets that open
one. The contrast thresholds they guard are still cleared — comfortably, because
M3's `on-surface-variant` is a higher-contrast role than the `--text-muted` it
replaces.

**Changed files:**

- `apps/web/src/index.css`
- `apps/web/src/styles/md3-tokens.css`
- `apps/web/src/styles/tokens.css`
- `apps/web/tests/styles/default-background.test.ts`
- `apps/web/tests/styles/filter-pill.test.ts`
- `apps/web/tests/styles/home-hero-picker-contrast.test.ts`

### 2026-08-03 — Separate application identity, so the two products can coexist

**Reason:** these are correctness fixes, not cosmetics. Installed side by side,
an unmodified build of this fork and upstream Open Design are the *same
application* as far as the operating system is concerned, and they collide in
eight concrete ways:

1. **Shared Electron `userData` directory.** Electron derives `userData` from
   `productName`, so both products resolve to
   `%APPDATA%\Open Design\namespaces\<ns>\data` — the same SQLite database, the
   same artifacts, the same stored credentials. Two apps writing one store is
   guaranteed mutual corruption, not a race that usually works out.
2. **Shared Chromium single-instance lock.** That lock is keyed on the
   `userData` directory. With both products pointing at one directory, launching
   this app while Open Design is running makes it silently `app.quit()` — a
   failure with no error, no window, and nothing in the UI to diagnose.
3. **Shared Windows named pipe.** The daemon IPC endpoint
   `\\.\pipe\open-design-<ns>-daemon` is a single global name; whichever product
   binds it first owns it, and the second one talks to the wrong engine or
   fails to start.
4. **Shared uninstall registry key.** Both installers write the same
   Add/Remove Programs entry, so uninstalling either product deletes the other's
   entry, and `cleanupWinRegistryResidues` would happily remove a key belonging
   to a different application.
5. **Auto-update into a different product.** This is the most serious one. The
   packaged build shipped with the updater *enabled by default* and pointed at
   upstream's release feed (`https://releases.open-design.ai`). Left alone, a
   build of this fork would poll that feed, download upstream's installer, and
   replace itself with the other product. An application must never update
   itself into something else, so the default origin is now an inert
   `.invalid` host that can never resolve, and a packaged build enables the
   updater only when it was actually given a feed of its own. That is the
   bake-time route an installed app really has: `tools/pack` reads
   `OD_UPDATE_METADATA_URL` and writes it into `open-design-config.json`, and
   `apps/packaged` re-exports it into the process before the desktop main
   resolves its updater config. A build packed against this fork's feed
   therefore updates from that feed; a build packed without one never checks
   and never resolves an origin that could answer. `OD_UPDATE_ENABLED` still
   overrides the default in either direction. `apps/desktop`'s updater config
   tests pin both halves, because each is a one-line reversion in a file that
   keeps merging from upstream.
6. **One-click manual routes into the other product.** Three buttons opened
   upstream's downloads page: Settings → About's "View release notes" (shown
   precisely when in-app updating is unavailable, which is now every build
   without a baked feed), the macOS update dialog's manual-download button, and
   the post-update highlights card's fallback link. All three now open this
   repository's own releases page.
7. **Remotely controlled content from an upstream-owned feed.** The daemon
   fetched `https://whatsnew.open-design.ai/whats-new.json` on every launch
   that reached Home on any release channel, and rendered that document's
   title, body, image and link inside the app. A packaged build of this fork
   would have given another project's operators editorial control of a surface
   in this product — including a clickable link — and a launch signal from
   every user, with nothing configured anywhere. The highlights document is now
   opt-in through `OD_WHATS_NEW_URL` alone, with no default: absent that
   variable there is no card and no network call.
8. **The other product's name in a hardcoded menu label.** The macOS
   application menu's "Restart to Update…" item falls back to a hardcoded
   English default until the renderer pushes localized labels over IPC, and
   that default named Open Design. It lives outside `apps/web/src/i18n`, so no
   locale edit reaches it.
9. **A shared user-state directory holding provider credentials.** The daemon
   kept its Vercel and Cloudflare Pages deploy tokens, and its local agent CLI
   profiles, in `~/.open-design` whenever `OD_USER_STATE_DIR` and
   `OD_AGENT_PROFILES_CONFIG` were unset — which is every packaged launch, since
   nothing sets them. Re-authenticating a provider in one product silently
   rewrote the other's token. That root is now `~/.material-designer`; both
   overrides still work exactly as before.
10. **A shared headless data root.** The standalone headless entry defaulted its
    namespace base to `<data home>/open-design/namespaces` — the same SQLite
    database, artifacts and credentials as upstream's headless install. It now
    defaults to `<data home>/material-designer/namespaces`. `OD_DATA_DIR`, which
    the generated launchers bake in, is untouched.
11. **A shared MCP server key in third-party agent configs.** Installing the MCP
    server wrote an entry named `open-design` into files neither product owns —
    `~/.codex/config.toml`, `~/.claude.json`, VS Code's `mcp.json` and the rest —
    so installing from one product repointed the other's entry at the wrong
    executable, and uninstalling from either deleted the other's registration.
    The default key is now `material-designer`; `--name` still overrides it.
12. **`tools-pack win stop` killing the other product.** Windows picked its
    victims by sidecar stamp alone, and a stamp carries no product identity, so
    a developer's running upstream desktop matched and had its whole process
    tree force-killed. Selection is now intersected with this build's own
    install, unpacked, cache and launcher-payload trees. mac and Linux already
    gated on a product-distinct marker root and needed no change.
13. **Release automation still looking for the other product's filenames.** The
    packagers derive every artifact name from the product name, so the rename
    also renamed `Open Design-<ns>.dmg`, `.zip`, `.AppImage`, `-setup.exe` and
    the launcher payload's `payload/Open Design.exe` entry. The asset-staging
    scripts, the Windows payload validator, and the agent documentation that
    records the channel identities, uninstall keys and POSIX IPC socket base
    were still spelling the old names, so a real release would have failed on a
    missing file — and the docs would have told the next reader to put the old
    name back.

The change therefore sets a distinct product display name ("Material Designer",
with the per-channel names following upstream's own pattern), distinct
`appId`s under `io.ding-ding.material-designer*`, a distinct Windows named-pipe
prefix (`material-designer`), distinct Linux desktop-entry, icon and AppImage
names, a distinct macOS bundle identity, and a publisher name of its own. It
also sets an explicit `app.setAppUserModelId()` before `app.whenReady()`, since
Windows otherwise keys taskbar grouping, jump lists and notification identity
off the electron-builder `appId` and would merge the two apps' taskbar
identities.

Internal identifiers are **deliberately left alone**: the `od://` URL scheme,
the `open-design:` `localStorage` key prefix, the `@open-design/*` workspace
package names, the `OD_*` environment variables, `open-design-config.json`, the
`resources/open-design` resource folder, and the `od` CLI bin name. None of
them collides between installs, and renaming them would be a large refactor
that buys no coexistence. `packages/sidecar-proto`'s exported constant keeps its
historical name `OPEN_DESIGN_PRODUCT_NAME` for the same reason — only its value
tracks the product.

**Changed files:**

- `.github/scripts/release/assets/linux.sh`
- `.github/scripts/release/assets/mac-intel.sh`
- `.github/scripts/release/assets/mac.sh`
- `.github/scripts/release/assets/win.ps1`
- `AGENTS.md`
- `apps/daemon/src/cli.ts`
- `apps/daemon/src/deploy.ts`
- `apps/daemon/src/mcp-routes.ts`
- `apps/daemon/src/runtimes/local-profiles.ts`
- `apps/daemon/src/services/whats-new.ts`
- `apps/daemon/tests/whats-new.test.ts`
- `apps/desktop/src/main/diagnostics.ts`
- `apps/desktop/src/main/runtime.ts`
- `apps/desktop/src/main/update-menu.ts`
- `apps/desktop/src/main/update-preflight.ts`
- `apps/desktop/src/main/updater/config.ts`
- `apps/desktop/tests/main/update-menu.test.ts`
- `apps/desktop/tests/main/updater/config.test.ts`
- `apps/packaged/src/errors.ts`
- `apps/packaged/src/headless-runtime.ts`
- `apps/packaged/src/headless.ts`
- `apps/packaged/src/index.ts`
- `apps/packaged/src/launch.ts`
- `apps/packaged/src/paths.ts`
- `apps/packaged/src/window-title.ts`
- `apps/packaged/tests/launch.test.ts`
- `apps/packaged/tests/window-title.test.ts`
- `apps/packaged/tests/windows-lifecycle.test.ts`
- `apps/web/app/layout.tsx`
- `apps/web/src/components/SettingsDialog.tsx`
- `apps/web/tests/components/SettingsDialog.execution.test.tsx`
- `apps/web/tests/components/UpdateDialog.test.tsx`
- `docs/code-review-guidelines.md`
- `e2e/lib/vitest/packaged-win-identity.ts`
- `e2e/specs/linux.spec.ts`
- `e2e/specs/win.spec.ts`
- `e2e/tests/packaged-win-identity.test.ts`
- `packages/release/src/index.ts`
- `packages/release/tests/index.test.ts`
- `packages/sidecar-proto/src/index.ts`
- `tools/pack/AGENTS.md`
- `tools/pack/README.md`
- `tools/pack/resources/linux/open-design.desktop.template`
- `tools/pack/src/launcher-layout.ts`
- `tools/pack/src/mac/constants.ts`
- `tools/pack/src/win/builder.ts`
- `tools/pack/src/win/constants.ts`
- `tools/pack/src/win/lifecycle.ts`
- `tools/pack/src/win/nsis.ts`
- `tools/pack/tests/launcher-layout.test.ts`
- `tools/pack/tests/launcher-payload.test.ts`
- `tools/pack/tests/linux.test.ts`
- `tools/pack/tests/mac-identity.test.ts`
- `tools/pack/tests/mac-lifecycle.test.ts`
- `tools/pack/tests/release-workflows.test.ts`
- `tools/pack/tests/win-builder.test.ts`
- `tools/pack/tests/win-identity.test.ts`
- `tools/pack/tests/win-lifecycle.test.ts`
- `tools/pack/tests/win-nsis.test.ts`
- `tools/release/scripts/build-platform.ps1`
- `tools/release/scripts/prepare-platform-assets.ps1`
- `tools/release/scripts/prepare-platform-assets.sh`

### 2026-08-03 — Local version history, export in every faithful format, and open-in-editor


**Reason:** three capabilities the project's standards require of any application
that owns user data, none of which the imported work had.

**Version history.** Every record the application manages — not only documents,
but accounts, connected services, rules and settings — is snapshotted into a Git
repository kept beside the daemon's own data directory, never inside a user's
own project folder. The decision that matters is that **history is append-only:
restoring is itself recorded as a new revision**, so an undo can be undone and
that undo undone in turn. A restore that discarded the state it replaced would
make the whole feature unsafe to use, because nobody could experiment without
risking what they started from. A failed history write can never fail the
operation the user actually asked for.

Two hazards were found and closed while building it. Restoring a table with
inbound foreign keys had been delete-all-then-reinsert, which cascaded and wiped
dependent rows belonging to records the restore was not touching; it now
reconciles, deleting only rows the snapshot genuinely omits. And a restore now
captures the current state first, so the thing being replaced is always
recoverable.

**Export.** Every dataset the daemon owns, in every format that can carry it
faithfully — JSON, JSONL, YAML, TOML, XML, CSV, TSV, Markdown, HTML — plus ZIP
and 7z archives exposing the compression, encryption and split-volume options 7z
actually offers rather than one hard-coded default. Where a format cannot carry a
field the export says so **before** it runs rather than truncating quietly, and
an archive is never presented as protected while leaving its filenames readable.

**External editor.** Detection of installed editors including portable and
Insiders builds, a persisted choice, and an open action that opens a folder as a
workspace root rather than a single file with no context. Paths are passed as an
argument vector, never interpolated into a shell string.

All three follow this codebase's dual-surface rule — an HTTP endpoint, a shared
DTO and an `od` subcommand — so an external agent can drive them without the UI.

**Changed files:**

- `apps/daemon/src/app-config.ts`
- `apps/daemon/src/data-export-cli.ts`
- `apps/daemon/src/data-export/archive.ts`
- `apps/daemon/src/data-export/datasets.ts`
- `apps/daemon/src/data-export/serialize.ts`
- `apps/daemon/src/external-editors.ts`
- `apps/daemon/src/history/domains.ts`
- `apps/daemon/src/history/git.ts`
- `apps/daemon/src/history/service.ts`
- `apps/daemon/src/history/sqlite-domain.ts`
- `apps/daemon/src/history/store.ts`
- `apps/daemon/src/route-context-contract.ts`
- `apps/daemon/src/routes/data-export.ts`
- `apps/daemon/src/routes/editor.ts`
- `apps/daemon/src/routes/history.ts`
- `apps/daemon/src/routes/host-tools.ts`
- `apps/daemon/src/routes/project/index.ts`
- `apps/daemon/src/routes/routine.ts`
- `apps/daemon/src/server-context.ts`
- `apps/daemon/src/server.ts`
- `apps/daemon/tests/app-config-external-editor.test.ts`
- `apps/daemon/tests/data-export-archive.test.ts`
- `apps/daemon/tests/data-export-cli.test.ts`
- `apps/daemon/tests/data-export-routes.test.ts`
- `apps/daemon/tests/data-export-serialize.test.ts`
- `apps/daemon/tests/editor-routes.test.ts`
- `apps/daemon/tests/external-editors-args.test.ts`
- `apps/daemon/tests/external-editors-detect.test.ts`
- `apps/daemon/tests/history.test.ts`
- `docs/external-editor.md`
- `packages/contracts/src/api/app-config.ts`
- `packages/contracts/src/api/data-export.ts`
- `packages/contracts/src/api/editor.ts`
- `packages/contracts/src/api/history.ts`
- `packages/contracts/src/errors.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/tests/data-export.test.ts`

### 2026-08-03 — Notification centre, destructive-action gate, bulk actions, appearance editor, narrator


**Reason:** the remaining user-facing standards this project holds itself to,
none of which the imported application had.

**Notifications.** Everything that only informs is a non-blocking corner toast;
anything the user must decide stays a dialog. Dismissed notifications are kept
in a centre, because a toast that auto-dismissed and vanished is information the
user cannot get back.

**Destructive-action gate.** Two independently operated keys must both be
engaged before a full-range slider becomes active, and the action fires only
when all three have completed. It names the exact data affected rather than
asking whether the user is sure, keeps an always-available exit, and returns
focus to the control that opened it. The safety facts stay unambiguous at every
funny level — playful copy may style the experience, never obscure what will be
destroyed.

**Bulk actions.** Multi-select with ranges and a keyboard path, a select-all
that states plainly whether it means this page or every match, and a reviewable
preview of the exact count before anything runs. An excluded item is reported
rather than silently skipped.

**Appearance editor.** A continuous colour picker rather than a swatch list,
with a translator converting between colour spaces and reporting the contrast
the chosen colour will actually have. A property the platform cannot honour
stays visible with an explanation instead of silently dropping a saved value.

**Narrator.** Off by default, one utterance at a time through a serialized
queue, superseded lines replaced rather than stacked, and it yields to an active
screen reader rather than talking over it.

**Changed files:**

- `apps/web/src/components/ContextMenu.module.css`
- `apps/web/src/components/ContextMenu.tsx`
- `apps/web/src/components/appearance/AppearanceRuntime.tsx`
- `apps/web/src/components/appearance/InfiniteColorPicker.module.css`
- `apps/web/src/components/appearance/InfiniteColorPicker.tsx`
- `apps/web/src/components/appearance/color.ts`
- `apps/web/src/components/appearance/colorNames.ts`
- `apps/web/src/components/appearance/contrast.ts`
- `apps/web/src/components/appearance/presets.ts`
- `apps/web/src/components/appearance/store.ts`
- `apps/web/src/components/appearance/translate.ts`
- `apps/web/src/components/appearance/typography.ts`
- `apps/web/src/components/bulk/BulkActionBar.module.css`
- `apps/web/src/components/bulk/BulkActionBar.tsx`
- `apps/web/src/components/bulk/BulkPreviewDialog.module.css`
- `apps/web/src/components/bulk/BulkPreviewDialog.tsx`
- `apps/web/src/components/bulk/messages.ts`
- `apps/web/src/components/bulk/plan.ts`
- `apps/web/src/components/bulk/run.ts`
- `apps/web/src/components/bulk/selection.ts`
- `apps/web/src/components/destructive/DestructiveGate.module.css`
- `apps/web/src/components/destructive/DestructiveGate.tsx`
- `apps/web/src/components/destructive/gateMachine.ts`
- `apps/web/src/components/narrator/NarratorSettingsPanel.tsx`
- `apps/web/src/components/narrator/lines.ts`
- `apps/web/src/components/narrator/narrator.ts`
- `apps/web/src/components/narrator/queue.ts`
- `apps/web/src/components/narrator/settings.ts`
- `apps/web/src/components/narrator/speech.ts`
- `apps/web/src/components/notifications/NotificationCenter.module.css`
- `apps/web/src/components/notifications/NotificationCenter.tsx`
- `apps/web/src/components/notifications/NotificationHost.module.css`
- `apps/web/src/components/notifications/NotificationHost.tsx`
- `apps/web/src/components/notifications/notificationStore.ts`
- `apps/web/src/components/shortcuts/registry.ts`
- `apps/web/src/components/shortcuts/useShortcuts.ts`
- `apps/web/src/styles/base.css`
- `apps/web/tests/components/DesignsTab.select-mode.test.tsx`
- `apps/web/tests/components/destructive/gateMachine.test.ts`
- `apps/web/tests/components/notifications/notificationStore.test.ts`

### 2026-08-20 — Keep composer context project-wide

**Reason:** Opening a project used to select its primary file without a user
action, the Design Files surface could silently preview an entry file when it
remounted, and the composer automatically replaced its context with whichever
file or workspace tab happened to be visible. The application now starts at
project scope, keeps the automatic composer context bound to the project, and
requires an explicit file/context choice before attaching narrower evidence.

**Changed files:**

- `apps/web/tests/components/ProjectView.tabs-navigation.test.tsx`

### 2026-08-20 — Keep installed Squirrel runtime paths user-local

**Reason:** the non-portable manifest embedded the hosted build machine's
absolute runtime namespace root into the shipped Squirrel package. A normal
user launch then tried to create data, logs, sessions and update state under a
CI checkout path and could exit before opening a window. Installed packages now
omit that machine path and fall back to Electron's per-user data directory;
tools-pack lifecycle launches retain their explicit isolated override through
their separate launch configuration.

**Changed files:**

- `tools/pack/tests/win-manifest.test.ts`

### 2026-08-21 — Localized full-folder browser and focus-safe failure paths

**Reason:** the Explorer-style replacement was source-complete but its host
failure path still carried duplicate TypeScript properties, Home passed two
arguments to a one-argument state setter, and the native title/error copy was
not routed through the typed locale dictionaries. The desktop picker now
passes the localized title through the host/preload/main/daemon boundary,
restores the owning window and renderer trigger focus after success, cancel or
failure, and has source checks for the exact dialog, path, and result contracts.

**Changed files:**

- `apps/daemon/src/native-folder-dialog.ts`
- `apps/daemon/src/routes/media.ts`
- `apps/daemon/src/server.ts`
- `apps/daemon/tests/native-folder-dialog.test.ts`
- `apps/desktop/src/main/preload.cts`
- `apps/desktop/src/main/runtime.ts`
- `apps/desktop/tests/main/folder-picker-contract.test.ts`
- `apps/web/src/i18n/funny/en.ts`
- `apps/web/src/i18n/funny/zh-HK.ts`
- `apps/web/src/i18n/locales/ar.ts`
- `apps/web/src/i18n/locales/de.ts`
- `apps/web/src/i18n/locales/en.ts`
- `apps/web/src/i18n/locales/es-ES.ts`
- `apps/web/src/i18n/locales/fa.ts`
- `apps/web/src/i18n/locales/fr.ts`
- `apps/web/src/i18n/locales/hu.ts`
- `apps/web/src/i18n/locales/id.ts`
- `apps/web/src/i18n/locales/it.ts`
- `apps/web/src/i18n/locales/ja.ts`
- `apps/web/src/i18n/locales/ko.ts`
- `apps/web/src/i18n/locales/pl.ts`
- `apps/web/src/i18n/locales/pt-BR.ts`
- `apps/web/src/i18n/locales/ru.ts`
- `apps/web/src/i18n/locales/th.ts`
- `apps/web/src/i18n/locales/tr.ts`
- `apps/web/src/i18n/locales/uk.ts`
- `apps/web/src/i18n/locales/zh-CN.ts`
- `apps/web/src/i18n/locales/zh-HK.ts`
- `apps/web/src/i18n/locales/zh-TW.ts`
- `apps/web/tests/providers/registry.test.ts`
- `apps/web/tests/state/projects.test.ts`
- `packages/host/src/actions.ts`
- `packages/host/src/protocol.ts`

### 2026-08-20 — Full Explorer folder browser on Windows

**Reason:** the daemon fallback used WinForms `FolderBrowserDialog`, which is a
tree-only legacy surface with no address bar, breadcrumb navigation, search or
full folder contents. It now uses the Explorer-style common dialog with exact
folder-only validation: only an existing directory or the current directory's
private sentinel is accepted, and selecting a real file cannot silently return
its parent.

**Changed files:**

- `apps/daemon/src/native-folder-dialog.ts`
- `apps/daemon/tests/native-folder-dialog.test.ts`

<!--
Format for entries, newest first:

### 2026-08-04 — Windows frameless window chrome

**Reason:** Windows builds must ship a custom Material Design 3 title bar
instead of the operating system's.

**Changed files:**

- `apps/desktop/src/main/runtime.ts`
- `apps/desktop/src/main/preload.cts`
-->

### 2026-08-25 — Open the exact staged project archive in the external editor

**Reason:** the project archive receipt already named the exact validated ZIP
staged by the daemon, but the reusable handoff control accepted only a project
identifier and therefore opened the project working directory. The control now
accepts the receipt path and sends it to the dedicated external-editor route;
an editor refusal is reported without silently substituting the project folder.

**Changed files:**

- `apps/web/src/components/ProjectArchiveAction.tsx`
- `apps/web/src/components/HandoffButton.tsx`
- `apps/web/src/providers/registry.ts`
- `apps/web/tests/components/HandoffButton.export-path.test.tsx`

### 2026-08-25 — Keep capture startup explicit when desktop inspection is skipped

**Reason:** deterministic capture launches deliberately bypass the duplicate
desktop inspection, so the launcher gate receives no result and must continue.
The gate now handles that nullable state explicitly instead of relying on an
unsafe assertion, while preserving the existing exit and continue outcomes.

**Changed files:**

- `apps/packaged/src/launcher-after-quit.ts`
- `apps/packaged/tests/launcher-after-quit.test.ts`

### 2026-08-29 — Establish the shared Material primitive package

**Reason:** the component package now carries the shared Material Design 3
primitive anatomy, token consumption, compatibility boundaries, keyboard and
focus semantics, overlay ownership, and focused contract coverage. These files
are intentional additions or modifications to the byte-verbatim upstream copy
and must remain visible to the port verifier. The shared RegexSearchField also
reports its concrete mounted builder root to CustomSelect so portalled ownership
does not rely on copied diagnostic markers.

**Changed files:**

- `apps/web/src/components/CustomSelect.tsx`
- `apps/web/src/components/PluginInputsForm.tsx`
- `apps/web/src/components/regex/RegexSearchField.tsx`
- `apps/web/tests/components/CustomSelect.test.tsx`
- `apps/web/tests/components/PluginInputsForm.test.tsx`
- `apps/web/vitest.shared-primitives.config.ts`
- `apps/web/src/styles/primitives.css`
- `packages/components/src/button.module.css`
- `packages/components/src/button.tsx`
- `packages/components/src/form-controls.module.css`
- `packages/components/src/form-controls.tsx`
- `packages/components/src/index.ts`
- `packages/components/src/menu.module.css`
- `packages/components/src/menu.tsx`
- `packages/components/src/primitives.tsx`
- `packages/components/src/selection-controls.module.css`
- `packages/components/src/selection-controls.tsx`
- `packages/components/src/surface.module.css`
- `packages/components/src/surface.tsx`
- `packages/components/src/tabs.module.css`
- `packages/components/src/tabs.tsx`
- `packages/components/src/typography.module.css`
- `packages/components/src/typography.tsx`
- `packages/components/tests/material-primitives.contract.test.ts`
- `packages/components/tests/material-primitives.test.tsx`

## Trademarks

Apache-2.0 grants no trademark rights (section 6). The "Open Design" name, its
logo, and the `io.open-design.desktop` application identity belong to the
upstream project. Builds published from this repository are branded
**Material Designer** with their own application identity, and are not produced
by, endorsed by, or affiliated with the upstream project.
