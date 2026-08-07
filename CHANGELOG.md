# Changelog

Every notable change to this project, newest first.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project intends to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
once it publishes a version of its own.

Two rules this file is held to:

- **Every entry links the commit that made the change.** An entry that says what
  changed but not where is unverifiable — a reader who doubts it, or who needs the
  surrounding context, has no way to get from the sentence to the code.
- **Nothing is invented.** No entry, date, version or fix appears here that did not
  happen. A version with no recorded changes says so rather than being padded.

> [!NOTE]
> **Tags carry a build suffix, not a version this project chose.** `0.16.1` is
> inherited from the imported upstream work and does not yet describe a version this
> project set for itself; the `-rN.N` suffix is what makes each published build
> uniquely identifiable. Every release below carries a dim sum code name beside its
> tag, as this project's release rules require.

## [Unreleased]

Changes land here as they are committed, each with its commit link, and move into a
version section when a release carries them.

### Security

- **The confirmation gate can no longer be defeated five different ways.** An
  adversarial audit confirmed all five, and they matter because this gate is what
  stands between a user and irreversible loss. Armed keys survived a target swap,
  so keys operated for one action stayed engaged for the next. The "full-range"
  slider was satisfiable in a single gesture — one far-end click or one `End`
  press — and now rations forward travel so the end costs at least five
  deliberate advances, while retreat stays free: hard to authorize and easy to
  abandon is the right asymmetry. Dismissing mid-flight discarded the action's
  failure. Escape and the emergency exit reported `cancelled` for an action that
  had already begun, which was a false statement about the user's data
  ([`081ccdd`](https://github.com/Ding-Ding-Projects/material-designer/commit/081ccdd)).
- **`od` no longer deletes what the interface guards.** `od project|files|brand|templates|automation delete`
  executed irreversible deletions with no confirmation of any kind, while the web
  interface gated the identical operations behind the two-key slider — the CLI
  reached the daemon route around it. All five now refuse without `--confirm`,
  naming what would be deleted and printing the command that would proceed, and
  they refuse *before* the request, so nothing reaches the daemon. This is
  enforcement in two interfaces rather than at the operation, which the standard
  asks for and this does not yet achieve; that gap is recorded rather than implied
  to be closed
  ([`c68068e`](https://github.com/Ding-Ding-Projects/material-designer/commit/c68068e)).
- **Typing `constructor` into the colour field crashed it.** `parseColor` indexed
  a plain-object colour map with no ownership check, so an inherited function came
  back truthy and reached the hex parser, throwing out of a React change handler.
  The field parses on every keystroke, so a paste was enough
  ([`87e0118`](https://github.com/Ding-Ding-Projects/material-designer/commit/87e0118)).

- **The destructive check moved to the operation, not the interface.** Gating the
  web interface and then the CLI still leaves the next caller ungated; the daemon
  now refuses an unconfirmed destructive route itself, so the guarantee holds
  wherever the request comes from ([`ecaad97`](https://github.com/Ding-Ding-Projects/material-designer/commit/ecaad97)). Three delete routes that had
  never been gated at all — including memory and library — were routed through
  the same check ([`9cb4e6c`](https://github.com/Ding-Ding-Projects/material-designer/commit/9cb4e6c)), ([`9d5c5d3`](https://github.com/Ding-Ding-Projects/material-designer/commit/9d5c5d3)).

### Changed

- **The final Figma import refutation repairs all six remaining source gaps.**
  [`FigmaImportModal`](https://github.com/Ding-Ding-Projects/material-designer/commit/81ca73826312e1c599e52ff8be943620ee1ec04f)
  now closes before the host focus callback can reach the underlying UI; Home
  keeps a rejected URL handoff visible and retryable; `aria-invalid` and
  `aria-describedby` target only the visible invalid source control; invalid
  file drops clear the previous selection; `FIGMA_URL_RE` is anchored while
  accepting valid query/hash forms; and the title, source labels, helper,
  actions, failure copy and summary labels use the i18n catalog. English
  fallback entries, the `zh-TW` Traditional Chinese seed and deliberate
  `zh-HK` overrides cover the complete visible surface. The focused spec and
  `MODIFICATIONS.md` allowlist are committed, but no local Node, pnpm,
  Electron, build, CI or capture result is claimed; hosted verification remains
  the evidence boundary.

  Figma import 嘅 final refutation 六個 poke guy 而家一次過收掂：modal 先收場，
  host 之後先可以搶返 focus；Home 個 URL handoff 失敗會留低畀人再試；
  `aria-invalid` 同 `aria-describedby` 只黐住真係出事嗰粒可見 control；
  壞 file drop 會清走舊選擇；`FIGMA_URL_RE` 收實條尾但照食合法 query/hash；
  title、source label、helper、button、failure copy 同 summary 全部返入 i18n
  catalog。英文 fallback、`zh-TW` Traditional Chinese seed 同刻意寫落去嘅
  `zh-HK` overrides 都齊。Focused spec 同 `MODIFICATIONS.md` 已入 commit，
  但本機冇扮 Node/pnpm/Electron、build、CI 或 capture 證人，真正驗證留返
  hosted CI。

- **Figma import copy and errors now use the real localization and accessibility seams.** The URL and notes
  controls use visible native `label`/`for` associations and stable ids, while
  `useT` reads the existing `dsCreate.*` catalog entries for labels, upload
  prompts, helper copy, and placeholders. Invalid URL and import errors now
  render as assertive alerts and associate with the URL, notes, and file controls
  through `aria-invalid` and `aria-describedby`. The focused accessibility spec
  checks the `zh-HK` copy, associations, English fallback, and invalid-URL path;
  the local Node/pnpm/Electron toolchain was not run ([`9c8d492`](https://github.com/Ding-Ding-Projects/material-designer/commit/9c8d4927dce44451bacec50e1c3d38aca837dbcc)).

  Figma import 嘅 URL 同 notes 而家自己有真 label/for 同 stable id，upload
  prompt、helper 同 placeholder 亦經 `useT` 食返現成 `dsCreate.*` catalog
  key；invalid URL 同 import error 會用 assertive alert 報到，仲同相關
  controls 綁實 `aria-invalid` 同 `aria-describedby`。Focused accessibility
  spec 會試 `zh-HK`、英文 fallback、association 同壞 URL 路徑；今次冇喺本機
  開 Node/pnpm/Electron 個重型引擎，留返 CI 做正式驗證。

- **The first self-hosted Release run exposed and received a narrow Windows packer fix.**
  Release `31127492852` completed with failure after `pnpm install --frozen-lockfile`
  resolved the workspace: the post-install packer typecheck passed
  `"uninstall-legacy"` to `invokeNsis`, whose executable-action contract is
  `"install" | "uninstall"`. The call site now passes the supported `"uninstall"`
  action while retaining `runTimed(..., "uninstall-legacy")` for the legacy timing
  record. This source fix is committed, but no later labelled-runner verdict is
  claimed yet ([`5d66600`](https://github.com/Ding-Ding-Projects/material-designer/commit/5d66600)).

  第一個 self-hosted Release run 揭開咗 Windows packer 個窄身位：
  `pnpm install --frozen-lockfile` 解析完 workspace 之後，post-install typecheck
  發現 `invokeNsis` 只接受 `"install" | "uninstall"`，call site 卻塞咗
  `"uninstall-legacy"` 入去。依家傳返合法嘅 `"uninstall"`，但
  `runTimed(..., "uninstall-legacy")` 仲保留，legacy timing 唔會失蹤。修正已
  commit，但下一個 labelled-runner 結果仲未有，唔扮綠燈。

- **Close the remaining audited UI handoff gaps and bootstrap self-hosted CI tools.**
  Scrollable context menus now stay open while their own items move; the Figma
  import tabs expose tabpanel semantics and keyboard navigation; long command
  palette labels wrap; and a failed Squirrel installer handoff remains retryable.
  HTML and Markdown renderer saves remain registered through file switches and
  restart preparation, while clear-cache revokes pending installer authorizations.
  The root workflows now validate and bootstrap pinned `gh`, `jq` and `7z` into a
  locked user-scoped runner cache when needed, with pinned SHA-256 checks for
  downloaded packages; the handoff documents that persistent cache state is not
  a cryptographic trust boundary. The source checks passed, but no labelled-runner or
  installed-build verdict is claimed for this commit
  ([`b5f0db6`](https://github.com/Ding-Ding-Projects/material-designer/commit/b5f0db63b8d2ed1d1d8a52b0ca1b463e65e30830)).

  個 UI handoff 嘅尾巴終於收返：context menu 自己郁緊都唔會無端端消失，Figma
  import tabs 有返正規 tabpanel 同鍵盤行法，command palette 長字唔再畀雙語模式
  剪到一截，Squirrel handoff 失敗仲可以再試。HTML 同 Markdown 儲存會陪住換檔案
  同 restart 準備一路收尾，clear-cache 亦會撤銷未用嘅 installer authorization。
  Self-hosted CI 缺工具時會自動放入 pinned `gh`、`jq` 同 `7z`；靜態檢查過咗，
  但今次 commit 未有 labelled-runner 或 installed-build 綠燈扮證人。

- **CI now names its self-hosted runners and rebuilds dependencies from source-of-truth files.** `Verify`, `Release`, and `Pages` select explicit Linux or Windows runner labels; every checkout is clean; dependency jobs install and verify Node 24 plus pnpm 10.33.2 before `pnpm install --frozen-lockfile`. The pnpm-store cache is an optimisation only, and public pull requests no longer execute on the self-hosted runner ([`5556f84f1a4580f0d795f92b912e09833e6eb47f`](https://github.com/Ding-Ding-Projects/material-designer/commit/5556f84f1a4580f0d795f92b912e09833e6eb47f)).

  CI 而家講清楚自己坐邊張櫈，亦由 manifest 同 lockfile 重新砌 dependencies；唔再靠 runner 入面上一手留下嘅 node_modules 扮魔法。Verify、Release、Pages 各自用啱 Linux/Windows label，Node 24 同 pnpm 10.33.2 先驗身，公開 pull request 就唔會喺 self-hosted runner 上亂跑。個 cache 只係幫手加速，唔係偷偷養住第二棵 dependency 樹。

### Added

- **Squirrel.Windows packaging and restartable Windows updates.** The Windows
  packer now defaults to Squirrel.Windows and the release workflow stages
  `Setup.exe`, `RELEASES`, full/delta `.nupkg` packages and project-owned
  `metadata.json`. Stable packaged Windows builds download and checksum-verify
  `Setup.exe` in the background, then wait for the explicit **Restart to install
  update** action; the feed is implemented but not yet proven by a new release
  run ([`7ce7452`](https://github.com/Ding-Ding-Projects/material-designer/commit/7ce745283236e80e542161cf6190720137d1d714)).

- **CIELAB, LCH, OKLab and OKLCH.** The colour translator advertised twelve
  representations and implemented eight; the whole Lab family was absent, and
  typing `oklch(…)` was rejected as invalid. `lab()` and `lch()` are computed
  against D50 and `oklab()`/`oklch()` against D65, because CSS Color 4 defines
  them that way — emitting D65 numbers inside a `lab()` string produces a
  well-formed value a browser renders as a *different colour*. The arithmetic is
  checked against published reference values rather than against itself, which is
  how a wrong digit in the Bradford D50→D65 matrix was caught
  ([`87e0118`](https://github.com/Ding-Ding-Projects/material-designer/commit/87e0118)).
- **The appearance editor and its infinite colour picker are reachable.** Both had
  zero importers — written, typechecking, shipped in the bundle, and mounted by
  nothing. The picker is now the accent control in Settings → Appearance, with the
  fixed swatches kept as a convenience layered on top rather than replaced. The
  appearance runtime mounts in `App.tsx` rather than the dialog, because mounted
  in the dialog a chosen preset silently reverted on the next reload
  ([`ab2a89c`](https://github.com/Ding-Ding-Projects/material-designer/commit/ab2a89c)).
- **The web suite is a gate.** 463 test files now run on every push. They had never
  run in this repository at all; the first run found 454 of 459 passing, and every
  failure was a test describing behaviour the product had deliberately moved on
  from — plus one genuine defect in the regex highlighter and one fixture that
  mis-counted its own dice. Wired in without `|| true`
  ([`ca03246`](https://github.com/Ding-Ding-Projects/material-designer/commit/ca03246)).

### Fixed

- **Escape now closes the command palette from every focused control.** The
  search field and regex builder already had their own dismissal paths, but the
  size button, scope chips and live setting controls left keyboard users with
  nowhere to go. A dialog-level fallback now closes those controls while the
  nested builder keeps first dismissal and IME composition remains untouched
  ([`c833622`](https://github.com/Ding-Ding-Projects/material-designer/commit/c833622)).

  Escape 而家由 command palette 每個 focused control 都收得返。Search field
  同 regex builder 本身有出口，但 size button、scope chips 同 live setting
  controls 之前令 keyboard user 對住個 Escape 發呆。加咗 dialog-level fallback，
  nested builder 仍然先收自己，IME composition 亦唔會畀人截胡
  ([`c833622`](https://github.com/Ding-Ding-Projects/material-designer/commit/c833622))。

- **Restart safety now covers every editor in the workspace.** The renderer
  barrier flushes markdown writes as well as sketch autosaves, while the
  Squirrel/macOS deferred helper opens an installer only after a one-shot
  authorization marker is created. A denied restart leaves no marker to act on,
  and a persisted ready installer gets a fresh helper after a cold start;
  narrow context menus and regex builders now fit their viewport, and the
  command palette's portalled builder stays inside its focus loop
  ([`f2e71c8`](https://github.com/Ding-Ding-Projects/material-designer/commit/f2e71c8b2362bf5e711ce8af7ae6083e04965264)).

  儲存安全而家唔只係 sketch 有份：renderer barrier 連 markdown write 都會等埋，
  Squirrel/macOS helper 要等一次性 authorization marker 先開 installer。Restart
  畀人按 Later 就冇 marker 可以偷跑，cold start 後再明確安裝就會重新整一個 helper；
  窄 context menu 同 regex builder 亦識縮身，palette 個 portalled builder 唔會走出
  focus 圈。之前啲 UI 好似趕住落班，而家每道門都要簽到先行。

- **The UI audit stopped several small surfaces from playing hide-and-seek.**
  The Figma import modal now names its URL and notes fields and scrolls its body;
  context-menu labels wrap instead of vanishing and dismissal returns focus to
  the opener; the updater dialog traps and restores focus and respects reduced
  motion; the design-system Back control has a localized accessible name; and
  the command palette's own search now has the full bounded regex builder. The
  Squirrel restart path also waits for the renderer to flush queued and
  in-flight sketch saves, rejects malformed preparation responses and refuses
  forced restart when saving fails. Focused tests were added or extended for
  each seam; this checkout did not run the local toolchain, and hosted
  verification is still pending
  ([`92a4f94`](https://github.com/Ding-Ding-Projects/material-designer/commit/92a4f9447dee35243f929ef15a54976671fbbd64),
  [`8aa1f90`](https://github.com/Ding-Ding-Projects/material-designer/commit/8aa1f905c0515694a2b3e7f0506a7c90c124da81),
  [`5c6301c`](https://github.com/Ding-Ding-Projects/material-designer/commit/5c6301c0e4efe88b0765f2e22b7d1e5aff59d52d),
  [`3fdd836`](https://github.com/Ding-Ding-Projects/material-designer/commit/3fdd83690e1ac5dcfdd3366064fa041c55b79f7b),
  [`df66c24`](https://github.com/Ding-Ding-Projects/material-designer/commit/df66c2400e12d29b0d092e89a74dfc87fa10266e),
  [`353c0af`](https://github.com/Ding-Ding-Projects/material-designer/commit/353c0af3414bcec51d5f13a67494390c2e9dee80)).

  廣東話：UI audit 終於唔畀幾個細 surface 玩捉迷藏：Figma modal 而家
  叫得出 URL 同 notes，body 又識自己捲；context menu 長 label 唔再失蹤，
  收 menu 會還 focus 畀開門嗰粒掣；updater dialog 捉住同還返 focus，亦
  尊重 reduced motion；design-system Back 有本地化 accessible name；palette
  自己個 search 亦有完整 bounded regex builder。Squirrel restart 會等
  renderer 清晒 queued 同 in-flight sketch saves，response 唔合規就拒絕，
  save 失敗時連 forced restart 都唔畀過。Focused tests 加咗，但本機冇行
  toolchain，hosted verification 仲等緊；個 update button 今次終於扣好安全帶，
  唔會帶住未儲存嘅 sketch 飛走。

- **The command palette now has one honest shortcut.** The historical header
  capture showed `Ctrl K` while the application also accepted `Ctrl+Shift+P`,
  leaving the visible hint and the global contract out of step. The handler,
  header chip, accessibility metadata, setup copy and tests now derive one
  binding from the shared registry: `Ctrl+Shift+F` on Windows/Linux and `⇧⌘F`
  on macOS. The older `Ctrl+K` and `Ctrl+Shift+P` palette routes are retired
  ([`18850c1`](https://github.com/Ding-Ding-Projects/material-designer/commit/18850c1ee6596e847a0588a20509780460dbbd20)).

- **The Design Files bulk delete no longer reports a success it never had.** It said
  "3 done." after a cancelled confirmation, and after a run where every delete was
  refused — `handleDeleteMany` returned nothing, so the panel fell through to a branch
  that counted every selected item as succeeded. The same call site dropped the caller's
  options, which froze the progress bar at zero and made the Stop control decorative.
  The loop is now `runBulkAction`, the shared runner that already existed for this and
  was used by nothing; five tests pin the invariants, including that a helper resolving
  `false` counts as a failure
  ([`6e90fbd`](https://github.com/Ding-Ding-Projects/material-designer/commit/6e90fbd)).
- **Every dialog keeps the promise its own markup makes.** All of them render
  `aria-modal="true"`, which tells assistive technology the rest of the page is inert,
  and nothing enforced it: Tab walked out of the dialog onto the controls behind the
  backdrop — for a confirmation dialog, the exact controls the user had been asked to
  stop and think about. Focus now moves in on open, stays in, and returns to the opening
  control on close. Fixed in the shared primitive, so every dialog gains it at once
  ([`3f30a12`](https://github.com/Ding-Ding-Projects/material-designer/commit/3f30a12)).
- **The window chrome says the product's own name.** The custom title bar and the home
  hero both rendered "Open Design": `app.brand` carried upstream's name in all nineteen
  declaring locales, and the hero hardcoded the wordmark beyond any dictionary's reach.
  Found by reviewing a smoke capture — the first time one had been looked at rather than
  size-asserted — and confirmed fixed in the `v0.16.1-r19.1` artifact. Open Design Cloud
  keeps its name, because that hosted service is upstream's
  ([`b4bf583`](https://github.com/Ding-Ding-Projects/material-designer/commit/b4bf583)).
- **A stray brace stopped failing every build at minute 35.** One extra `}` in
  `entry-layout.css` failed four consecutive Release runs, each after half an hour, with
  an error naming the import graph's entry file rather than the file at fault
  ([`635ec4f`](https://github.com/Ding-Ding-Projects/material-designer/commit/635ec4f)).

- **Density did nothing.** Compact, Default and Comfortable rendered a
  pixel-identical interface: the setting swapped five custom properties, four of
  which had no reader anywhere in the codebase. Controls now read heights and
  padding from tokens that actually move, and default density measures the same
  to the pixel ([`fc5bef9`](https://github.com/Ding-Ding-Projects/material-designer/commit/fc5bef9)).
- **Editing the dialog stylesheet had never changed anything on screen.** `Dialog`
  puts its CSS-module class and the global `modal` class on the same element, and
  the module writes its card inside `:where()` — zero specificity — so the global
  rule had been deciding every dialog's appearance. The same dialog also had no
  viewport height bound and no scroller, so a tall one pushed its own confirm
  button off the screen with nothing to say it was there ([`fc5bef9`](https://github.com/Ding-Ding-Projects/material-designer/commit/fc5bef9)).
- **The rail's collapse button did nothing on a fresh install.** It called
  "close" unconditionally in a rail whose default state is collapsed, so the
  first click set false to false; both it and the topbar toggle also carried the
  same static label in either state, telling a screen-reader user that pressing
  it would expand a rail that was already expanded ([`5544035`](https://github.com/Ding-Ding-Projects/material-designer/commit/5544035)).
- **The UI scale magnified instead of reflowing.** CSS `zoom` scales painted
  lengths without moving the layout viewport, so `100vw` still resolved to the
  unscaled window and the layout overflowed at 125/150/200%. The desktop host now
  scales its own web contents ([`cd0996d`](https://github.com/Ding-Ding-Projects/material-designer/commit/cd0996d)).
- **Bilingual mode said interpolated values twice.** `t()` composed both languages
  and *then* interpolated, so a translated variable was substituted into both
  halves — "Default · 預設 density" became "Default · 預設 density · Default ·
  預設密度". Rendering now interpolates per language and joins afterwards
  ([`81cdbfd`](https://github.com/Ding-Ding-Projects/material-designer/commit/81cdbfd)).
- **The first words of every launch said the old product name.** The loading shell
  read "Loading Open Design…" inside a window titled Material Designer. The rename
  was held back because 42 Playwright waits synchronised on that exact literal and
  a wait for text the app never renders resolves instantly — silently disarming
  every startup gate rather than failing. The literal is now declared once,
  imported by all 42, and a gate proves the two still agree ([`ae0cc4d`](https://github.com/Ding-Ding-Projects/material-designer/commit/ae0cc4d)).
- **The onboarding screen carried the wrong name** — the first screen any new user
  sees, which no scripted capture reached because they all begin past it
  ([`649f81d`](https://github.com/Ding-Ding-Projects/material-designer/commit/649f81d)).
- **Every release since the 25th shipped with no code name**, and nothing went
  red: the pool was 24 bundled dishes, a per-push cadence spent it in a day, and
  running out was designed to be non-fatal. Names now resolve from the public
  catalogue of 2,866 dishes ([`c357876`](https://github.com/Ding-Ding-Projects/material-designer/commit/c357876)).
- **The download page advertised a build forty-five releases old**, beside a
  SHA-256 that matched nothing shipped — worse than no checksum, because a reader
  who verifies it concludes the file was tampered with. The release facts are now
  filled in at publish time from the release that actually exists ([`085f58d`](https://github.com/Ding-Ding-Projects/material-designer/commit/085f58d)).
- **Blocking browser dialogs were removed from the web application** ([`eafc402`](https://github.com/Ding-Ding-Projects/material-designer/commit/eafc402)),
  and a tab was named by what it is called rather than by its hint, which had been
  folding the hint into its accessible name ([`51ef6d7`](https://github.com/Ding-Ding-Projects/material-designer/commit/51ef6d7)).

### Added

- **The spoken narrator has a surface a user can reach.** Every part existed — the
  serialized queue, the per-category cooldown, the screen-reader yield, the preference
  store, the panel, and 19 dictionary keys in all twenty locales — and nothing imported
  any of it. It was unmountable rather than merely unmounted: it imported a stylesheet
  that did not exist, so wiring it would have failed the build. The stylesheet is
  written, the panel is its own settings section, and the command palette indexes it
  with two live inline controls. Still off by default
  ([`92ed8c6`](https://github.com/Ding-Ding-Projects/material-designer/commit/92ed8c6)).
- **Cairo ships locally, ending the application's one network font request.** Three
  variable-font subsets (~81 KB) under `apps/web/public/fonts/cairo/`, with the served
  `unicode-range` values kept verbatim so per-page subsetting still works
  ([`45ff210`](https://github.com/Ding-Ding-Projects/material-designer/commit/45ff210)).
- **A brace-balance gate over every tracked stylesheet**, in the fast Verify job. All
  507 balance today, so a mismatch is a defect rather than noise, and the fault class
  that cost four half-hour runs now fails in seconds naming the right file
  ([`a64f241`](https://github.com/Ding-Ding-Projects/material-designer/commit/a64f241)).
- **The four root governance files** — `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md` and
  `CODE_OF_CONDUCT.md` — so the tabs GitHub renders above the README point at something
  ([`230b115`](https://github.com/Ding-Ding-Projects/material-designer/commit/230b115)).

- **The appearance editor and its infinite colour picker became reachable.** Both
  had been compiling and shipping in the bundle with **zero importers** — no
  surface mounted them, so no user could open them. Judge a feature by whether
  something renders it, never by whether its files exist ([`ab2a89c`](https://github.com/Ding-Ding-Projects/material-designer/commit/ab2a89c)).
- **The navigation rail and the status bar are on the screen.** The rail had been
  rendered into a zero-width grid track, so a fresh install showed no navigation
  at all ([`90e52d3`](https://github.com/Ding-Ding-Projects/material-designer/commit/90e52d3)).
- **Settings became tabbed and searchable** — seventeen sections as a real tab
  strip with an overflow surface, and a search field with its regex affordance
  ([`a1c0027`](https://github.com/Ding-Ding-Projects/material-designer/commit/a1c0027)) — and the home screen gained the header search bar the mockup
  specifies, routed into the command palette rather than owning a fourth result
  list ([`b3d48cb`](https://github.com/Ding-Ding-Projects/material-designer/commit/b3d48cb)).
- **The home content got Material Design 3 anatomy, not just its colours**
  ([`f99fb2b`](https://github.com/Ding-Ding-Projects/material-designer/commit/f99fb2b)); collections followed with segmented buttons, filter chips and
  outlined cards, and the appearance controls for seed, density, auto-fit and
  typography were wired to a state layer that had existed with no UI at all
  ([`fc5bef9`](https://github.com/Ding-Ding-Projects/material-designer/commit/fc5bef9)).
- **The release smoke test captures nine named interface states** and proves each
  one before shooting it ([`6918bb5`](https://github.com/Ding-Ding-Projects/material-designer/commit/6918bb5)).
- **CI reports test counts per package** in the job summary, so a suite that
  quietly stops running files is visible without opening logs ([`28af1f0`](https://github.com/Ding-Ding-Projects/material-designer/commit/28af1f0)).

### Changed

- **The roadmap says what is built, what is merely written, and what is broken.** Its
  matrix claimed every standard was unimplemented while eleven were on `main` and in a
  downloadable build. The rewrite turns on one distinction: a module that nothing mounts
  is not a shipped feature. New section 4.0 records the adversarial pass Phase 4 never
  got — 44 findings, 15 confirmed — including that irreversible deletes bypass the
  confirmation gate entirely
  ([`a40b8b8`](https://github.com/Ding-Ding-Projects/material-designer/commit/a40b8b8)).
- **The port verifier has been observed rejecting a bad tree**, not merely passing. A
  deliberately poisoned branch made it report `bytes differ 1` and exit 1, so its green
  ticks now mean something
  ([`b26c5cc`](https://github.com/Ding-Ding-Projects/material-designer/commit/b26c5cc)).
- **The fast CI workflow supersedes stacked runs instead of queueing them.** Four
  pushes in quick succession left four Verify runs each verifying a commit a later
  push had already replaced, so the verdict that mattered arrived twenty minutes
  late. Safe here because this workflow publishes nothing; the release workflow
  still queues, since cancelling one halfway could leave a tag without its
  installer ([`edad4ca`](https://github.com/Ding-Ding-Projects/material-designer/commit/edad4ca)).


## [v0.16.1-r8.1] — 2026-08-03

**Code name: Beef with Oyster Sauce · 蠔油牛肉** ·
[release](https://github.com/Ding-Ding-Projects/material-designer/releases/tag/v0.16.1-r8.1)

Built from [`dea6b0a`](https://github.com/Ding-Ding-Projects/material-designer/commit/dea6b0a).
The packaged smoke test passed: the built application installed, launched, answered its
own health endpoint and uninstalled without residue.

### Added

- **The Material Design 3 token layer, and a Windows title bar.** The mockup's token
  sheet is transcribed as `md3-tokens.css` — 203 colour roles across light and dark,
  every seed variant, the shape scale, the motion curves and the density steps — and
  the existing token file became a mapping layer, so every legacy token keeps its name
  and resolves to an M3 role. Two things were checked because both fail silently: no
  previously defined token was dropped (a dropped one is an unstyled component, not a
  compile error), and the functional data colours kept their own values rather than
  being remapped onto theme roles, which would have made chart series indistinguishable.
  Windows also gets a frameless window with a custom title bar, using a hidden title-bar
  style rather than a frameless window so Windows 11 keeps its rounded corners, drop
  shadow, Alt+Space and snap behaviour; the window-control messages verify the sender is
  the main window, because embedded frames share the preload
  ([`dea6b0a`](https://github.com/Ding-Ding-Projects/material-designer/commit/dea6b0a)).

> [!IMPORTANT]
> **This is a foundation, not the redesign.** The token layer means components inherit
> M3 values; **no component has been rewritten**. Three departures from the mockup are
> recorded rather than quietly taken: the mockup's subtitle describes the mockup and not
> the product, the focus ring is inset because the window-control buttons sit flush
> against two window edges, and the icon webfont is not bundled — the bar uses the
> application's existing icon set at the contract's sizes.

## [v0.16.1-r7.1] — 2026-08-03

**Code name: Beef with Black Bean and Peppers · 豉椒炒牛肉** ·
[release](https://github.com/Ding-Ding-Projects/material-designer/releases/tag/v0.16.1-r7.1)

The first published release, built from
[`12bfb81`](https://github.com/Ding-Ding-Projects/material-designer/commit/12bfb81). It
carries everything from the verbatim import forward. The packaged smoke test passed.

### Added

- The whole of Open Design v0.16.1 under `design/` — **11,799 files**, copied
  byte-for-byte from the pinned upstream tree, file modes included
  ([`5ef7393`](https://github.com/Ding-Ding-Projects/material-designer/commit/5ef7393)).
- `scripts/verify-port.sh`, which proves that copy has not drifted, and
  `MODIFICATIONS.md`, which is simultaneously the Apache-2.0 §4(b) notice and the
  allowlist the verifier enforces — a file may differ from upstream only if it is
  listed there, and a listed file that no longer differs fails too
  ([`b8dc87d`](https://github.com/Ding-Ding-Projects/material-designer/commit/b8dc87d)).
- `scripts/upstream-manifest.tsv`, a committed table of upstream object ids, so the
  integrity check does not have to clone a 1.7 GB object store on every push. When
  the submodule is present the manifest is checked against it first, so the shortcut
  cannot drift from the thing it stands in for
  ([`65e288f`](https://github.com/Ding-Ding-Projects/material-designer/commit/65e288f)).
- A dish catalogue of 24 dishes across 12 categories under `assets/dim-sum/`, each
  image copied byte-for-byte and verified by SHA-256 against its source manifest,
  plus `scripts/release-codename.sh`, which spends each dish exactly once by reading
  the used ones back out of existing releases
  ([`a454a7b`](https://github.com/Ding-Ding-Projects/material-designer/commit/a454a7b)).
- Three workflows: `verify.yml` (port integrity plus the full unit suite on Linux),
  `release.yml` (install, typecheck, Windows identity tests, installer build, packaged
  smoke test, release publication) and `pages.yml` (the documentation site)
  ([`65e288f`](https://github.com/Ding-Ding-Projects/material-designer/commit/65e288f)).
- The repository's documentation: `README.md`, `AGENTS.md`, `ROADMAP.md`,
  `HANDOFF.md`, a categorized `docs/` tree, a committed line counter, and a
  368-request Postman collection for the daemon's HTTP API
  ([`c2ca744`](https://github.com/Ding-Ding-Projects/material-designer/commit/c2ca744)).
- The documentation site at
  <https://ding-ding-projects.github.io/material-designer/> — self-contained, with
  three language modes, two funny-level sliders, Material Design 3 tokens, appearance
  customization, a regex builder on every search field and browser-style tabs
  ([`29c1476`](https://github.com/Ding-Ding-Projects/material-designer/commit/29c1476)).

### Changed

- **The packaged application is now a standalone product.** Installed beside the
  upstream one, an unmodified build was the same application as far as Windows is
  concerned, and collided in eight ways — five of which corrupt or break something.
  It now has its own display name, application ids, Windows named-pipe prefix,
  uninstall registry key, install location, user-data directory and taskbar identity
  ([`cbd6a14`](https://github.com/Ding-Ding-Projects/material-designer/commit/cbd6a14)).
- The Material Design 3 mockup moved to `mockups/open-design-m3/` so `design/` could
  hold the imported tree
  ([`2567115`](https://github.com/Ding-Ding-Projects/material-designer/commit/2567115)).
- **The site documentation stopped saying the site was unpublished.** It had been for
  several runs. The correction also recorded the two things that were actually in the
  way, because both will catch the next person: the publishing surface had never been
  enabled on the repository, which no workflow can do for itself, and the dish
  catalogue lives outside the published directory, so the deployment has to stage it in
  ([`fb8ba8c`](https://github.com/Ding-Ding-Projects/material-designer/commit/fb8ba8c)).
- **This file was created**, written from the real commit history rather than from
  memory, with every object id it references checked against the object store before it
  was committed. The same commit replaced the README's claim that no
  continuous-integration outcome had been observed with a table of what each workflow
  had actually done — keeping the rows that were still unobserved visible in that table
  rather than omitting them
  ([`ec46f83`](https://github.com/Ding-Ding-Projects/material-designer/commit/ec46f83)).

### Fixed

- **The packaged build no longer updates itself into a different product.** The
  updater shipped enabled by default and pointed at the upstream release feed, so a
  build of this project would have downloaded that project's installer and replaced
  itself with it. Updates are now opt-in and the default origin cannot resolve
  ([`cbd6a14`](https://github.com/Ding-Ding-Projects/material-designer/commit/cbd6a14)).
- The daemon no longer fetches a remotely-controlled document from an upstream-owned
  host on every launch and render its title, body, image and clickable link inside
  this application. That surface is now opt-in with no default
  ([`cbd6a14`](https://github.com/Ding-Ding-Projects/material-designer/commit/cbd6a14)).
- Two build-breaking literals left over from the rename: the payload writer looked for
  an executable under the old product name while the builder produced the new one, and
  the launcher archive path disagreed with the paths module about its own filename
  ([`cbd6a14`](https://github.com/Ding-Ding-Projects/material-designer/commit/cbd6a14)).
- Private references removed from the design mockup — a personal account name, three
  internal tool names and a local endpoint, in a public repository. Earlier revisions
  still contain them; cleaning that is a history rewrite and has not been done
  ([`b5441b3`](https://github.com/Ding-Ding-Projects/material-designer/commit/b5441b3)).
- The site's dish catalogue was addressed outside the published directory and would
  have returned 404 for every visitor; the deployment now stages it into the artifact
  ([`29c1476`](https://github.com/Ding-Ding-Projects/material-designer/commit/29c1476)).
- An unknown translation key rendered as its own name in brackets. Three quarters of
  the site's keys were not yet written, so unknown keys now leave the element's own
  English text in place and report once to the console — the page reads correctly and
  the gap stays visible
  ([`29c1476`](https://github.com/Ding-Ding-Projects/material-designer/commit/29c1476)).
- Continuous integration ran several suites on a platform that cannot satisfy them:
  macOS binaries asserting a Unix executable bit NTFS does not store, a five-second
  test budget written for a developer's disk, a package importing output that had not
  been compiled, and tests symlinking a layout Windows will not let a runner create.
  The suites are now split by what each platform can answer, and every spec still runs
  somewhere ([`187d216`](https://github.com/Ding-Ding-Projects/material-designer/commit/187d216),
  [`217610e`](https://github.com/Ding-Ding-Projects/material-designer/commit/217610e),
  [`d7d3698`](https://github.com/Ding-Ding-Projects/material-designer/commit/d7d3698),
  [`29c1476`](https://github.com/Ding-Ding-Projects/material-designer/commit/29c1476)).
- **The installer build no longer fails schema validation before packing anything.**
  A publisher-name property was set so the executable's company field would not be
  blank; the packaging tool's current major version classes it as a signing input and
  moved it elsewhere, so setting it where it used to live is rejected on sight. The
  property is gone and the comment says why — the company field stays empty, the same
  as upstream, because this build does not sign
  ([`12bfb81`](https://github.com/Ding-Ding-Projects/material-designer/commit/12bfb81)).

## Not done yet

Listed here because a changelog that only records progress misleads about the shape of
the work. This is the current position, not a record of any one release. The full
burn-down is in [`ROADMAP.md`](ROADMAP.md).

- The Material Design 3 redesign is **a foundation, not a finished redesign**. The
  token layer and the Windows title bar have landed; **no component has been
  rewritten**, and the interface is still substantially the imported one.
- The application has no Cantonese locale, no funny-level sliders, no in-app regex
  builder, no dish surprise and no changelog viewer. The site demonstrates all of
  them; the application does not have them.
- No installer is code-signed, so every published one trips SmartScreen on first run.
- Nothing but Windows is published. There is no macOS or Linux artifact and no
  updater feed.
- The daemon's HTTP API has been documented and turned into a request collection, but
  **no request in that collection has been sent** — the route inventory was read from
  source, not observed answering.
