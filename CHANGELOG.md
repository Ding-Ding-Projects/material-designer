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

### Changed

- **FileViewer menu ownership and focus boundaries are now explicit.** Commit
  [`919073e7a`](https://github.com/Ding-Ding-Projects/material-designer/commit/919073e7ae3cc0d55316000549ba1aa2cf15c810)
  repairs the ten-menu source contract: simple actions live in a nested menu
  collection, mixed Share/Export/Access/Publish content lives in a named dialog
  or group without flattening listboxes, each owner has a local searchable action
  registry and exact regex-builder token, version Download has one head/footer
  origin at a time, and measured placement clamps, flips and scrolls inside the
  viewport. Actual opener refs now restore focus; programmatic opens explicitly
  have no opener. Search, toggle and action hit areas use a 48px floor. The
  hand-written negative-regression contract covers nested widgets, focus,
  geometry and the dual viewer scopes. This is source-level evidence only: no
  installed build, runtime geometry, or screen capture is claimed.

  FileViewer menu ownership 同 focus boundary 而家講清楚晒。`919073e7a`
  將十個 menu 分好：普通 action 放入 nested menu collection，Share/Export/
  Access/Publish 呢啲混合內容就用 named dialog/group，listbox 唔會畀人撈亂；
  每個 owner 有自己 searchable action registry 同 exact regex-builder token，
  version Download 一次只會有 head 或 footer 一個來源。實際 opener ref 會
  收返 focus，programmatic open 就明講冇 opener；placement 會量度、避位、
  clamp 同內部 scroll，search/toggle/action hit area 有 48px 底線。呢個係
  source-level evidence，未有 installed build、runtime geometry 或 screen-capture claim。

- **FileViewer menus now search locally, restore focus, and wrap long labels.**
  Commit [`bca23732d`](https://github.com/Ding-Ding-Projects/material-designer/commit/bca23732de1fdf7568da0227b220fdbce19969e0)
  adds independent plain-text-first search and anchored regex builders to the
  ten FileViewer Download, Share, Present, Zoom, toolbar and version menus.
  Each menu reports localized counts/no-match state, focuses its field on open,
  supports Arrow/Home/End/Enter/Escape keyboard handling, and returns focus to
  its trigger. Existing action handlers and disabled/error/re-entry semantics
  remain the owners of behaviour. Direct Share and toolbar labels now wrap at
  narrow bilingual widths. This is source-level evidence only; no installed
  build or runtime geometry is claimed. Follow-up commit
  [`6473425c5`](https://github.com/Ding-Ding-Projects/material-designer/commit/6473425c5d4ae72ecb8a7b3a7dbdc71f9c6529d4)
  keeps clicks inside the portalled regex builder from dismissing its owning
  menu while preserving ordinary outside-click dismissal.

  FileViewer 嘅 menu 而家可以就地搵嘢、收 menu 還 focus，同埋長 label 自己
  換行。`bca23732d` 畀十個 Download、Share、Present、Zoom、toolbar 同 version
  menu 各自有 plain-text-first search 同 anchored regex builder；開 menu 先落
  search，Arrow/Home/End/Enter/Escape 都有路，收返仲識搵返開門粒掣。原本
  action handler、disabled/error/re-entry 行為照舊，窄雙語畫面唔再將 label
  斬到一半。呢度係 source-level evidence，未有 installed build 或 runtime
  geometry claim。Follow-up commit `6473425c5` 令 portalled regex builder 入面
  嘅 click 唔會誤收自己個 menu，普通撳出面照樣收。

- **Website and desktop-agent handoff downloads now fail closed instead of
  quietly exporting the wrong thing.** Commit
  [`252bb5cc2`](https://github.com/Ding-Ding-Projects/material-designer/commit/252bb5cc27666ef429d6f0125b30b1de61902e80)
  makes the visible website action request the complete current project, keeps
  queued Markdown downloads attached to the requested loaded file across
  remounts, localizes the explicit handoff label across every locale, and
  removes the narrow-toolbar overflow scroller. The generated desktop source
  scaffold blocks network and out-of-root file requests, webviews and secondary
  windows; rejects non-HTML inputs and case-only extraction collisions; and
  refuses project-owned canonical handoff/manifest paths rather than presenting
  them as generated evidence. Focused source regressions are committed; hosted
  test, built-renderer, narrow/high-scale and installed-artifact proof remain
  pending.

  Website 同 desktop-agent handoff 而家唔會靜靜雞匯出錯嘢。`252bb5cc2`
  令 website action 真係拎成個 current project，Markdown queued Download
  跨 remount 都只跟載好嘅正確 file，所有 locale 有清楚 handoff label，窄
  toolbar 亦唔再伸條 scrollbar 出嚟扮鬍鬚。Desktop source scaffold 封住
  network、越界 local file、webview 同新 window；非 HTML input、淨係大小寫
  唔同嘅 extraction collision、同 project 自己霸咗 canonical handoff/manifest
  路徑都會明確 fail。Focused source regression 已落地；hosted test、built UI、
  narrow/high-scale 同 installed artifact 證據仍然 pending。

- **The v0.20.2 release-channel registry now follows upstream's exact-name model
  without losing Material Designer identity.** Release run
  [`32449571270`](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/32449571270)
  failed during dependency postinstall because the upstream reconciliation had
  retained both the old enumerated descriptor table and the new dynamic table.
  The duplicate declaration and obsolete `preview` row are removed; dynamic
  non-reserved channels now receive the Material Designer application ID.

  v0.20.2 upstream 改用 exact-name channel，合併時舊 descriptor table 同新 table
  一齊企喺度，esbuild 見到兩個同名 `const` 即刻反枱。依家刪走舊枱同過期
  `preview` row，dynamic channel 照樣用 Material Designer app ID，唔會換咗名牌。

- **The imported Open Design baseline advances by 309 commits to `393af2f99`,
  and Download now offers explicit agent handoffs.** The Tow Fat, byte manifest,
  and 12,835-file upstream mirror now point at v0.20.2. Non-declared paths were
  imported as exact blobs; declared product changes were three-way merged. The
  project ZIP remains the complete website handoff, while a new desktop scaffold
  target adds a secure Electron source shell, manifest, and coding guide without
  claiming to be an installer. Markdown next-step Download requests now open the
  Markdown export menu, and narrow workspace action rows compact labels instead
  of clipping the Download control.

  Open Design baseline 一口氣追 309 個 commits 去 `393af2f99`，12,835 個 upstream
  files 用原裝 blob 搬入嚟，產品自己改過嘅 file 就三方合併，唔係大水沖走晒。
  Website ZIP 照舊係完整 handoff；新 desktop scaffold 加安全 Electron 外殼同
  agent wiring guide，但唔會扮 installer。Markdown Download 同窄畫面 clipped
  button 亦一齊執返正，唔再㩒完扮無事發生。

- **Release checksums now use BOM-free UTF-8 with an explicit LF.** Removing
  the BOM exposed the next cross-shell boundary in Release
  [`32442336410`](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/32442336410):
  PowerShell's CRLF made GNU `sha256sum` look for a filename ending in `\r`.
  `File.WriteAllText` now writes exactly one LF-terminated checksum line. The
  published installer digest already matched; this fixes the verifier input.

  拆走 BOM 之後，`32442336410` 又照到下一粒蕉皮：PowerShell CRLF 令 GNU
  `sha256sum` 以為 filename 尾有 `\r`。依家 `File.WriteAllText` 明確寫一行 LF；
  published installer digest 本身一早一致，今次係修正 verifier 食嘅文字格式。

- **Installed Squirrel builds now launch from user-local state and create real
  Material Designer shortcuts.** Commit
  [`cb03705b`](https://github.com/Ding-Ding-Projects/material-designer/commit/cb03705b)
  removes the hosted build machine's absolute runtime root from shipped config,
  leaving tools-pack's explicit launch override intact. The Squirrel lifecycle
  also creates/removes product-named Start-menu and desktop shortcuts itself,
  targeting the Squirrel root launcher, and removes only the known wrong
  Electron-named shortcuts. Signing and executable resource editing remain off.

  Installed Squirrel build 之前帶埋 hosted machine 絕對 runtime path 出街，又因為
  unsigned executable metadata 整咗 Electron shortcut。`cb03705b` 將普通 launch
  放返 user-local state，tools-pack 特別 override 照舊；shortcut 亦正式叫 Material
  Designer。Signing 同 executable resource editing 完全無開，無偷雞。

- **The Windows daemon now opens a full Explorer-style folder browser.** The
  legacy tree-only `FolderBrowserDialog` is replaced with the shell browser's
  address bar, breadcrumbs, history, sidebar, search, contents/details views
  and new-folder controls. A `FileOk` boundary accepts only an existing folder
  or the exact current-folder sentinel, so choosing a real file cannot silently
  link its parent directory ([`cb03705b`](https://github.com/Ding-Ding-Projects/material-designer/commit/cb03705b)).

  Windows daemon 舊 folder dialog 得棵樹，address bar、search、breadcrumb 全部請假。
  而家換完整 Explorer browser；`FileOk` 只畀 existing folder 或精確 sentinel
  過關，揀錯 file 唔會靜靜雞變成 link 佢個 parent。

- **Release-created tag pushes no longer start another release.** Publishing
  `v0.16.128-r127.1` exposed that unrestricted `push:` triggers dispatched
  Release, Verify and Pages again for the new tag. All three workflows now
  accept branch pushes plus manual dispatch and ignore tag pushes, preventing a
  release → tag → release loop while preserving the per-branch-push contract.

  Publish `v0.16.128-r127.1` 之後先發現個 tag push 又叫醒 Release、Verify 同
  Pages，差啲變成 release 生 tag、tag 再生 release 嘅俄羅斯娃娃。三個
  workflow 而家淨係接 branch push 同 manual dispatch，tag 唔再撳鐘。

- **Released checksum files are now BOM-free and accepted by `sha256sum`.**
  Release [`32441347386`](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/32441347386)
  successfully published `v0.16.128-r127.1`, but its post-publication verifier
  rejected the checksum file because Windows PowerShell's UTF-8 encoding added
  a byte-order mark before the hash. The producer now writes the ASCII-only
  checksum format as ASCII; the hash and installer bytes were not changed.

  `v0.16.128-r127.1` 真係 publish 咗，但 checksum file 開頭畀 PowerShell UTF-8
  加咗 BOM，`sha256sum` 見到即刻話格式唔啱。依家 producer 用 ASCII 寫純 hash
  line；installer bytes 同 hash 本身無變，淨係唔再喺門口放粒隱形蕉皮。

- **The current release temporarily skips the contradictory dim-sum photo
  attachment by explicit owner direction.** The workflow no longer fails at the
  photo-policy step for this release. It emits a warning, exposes a
  `temporarily-skipped` status and writes the omission into the release notes;
  no catalog image is copied into or attached by this repository. Squirrel,
  unsigned, provenance, target, asset-hash and post-publication verification
  remain unchanged.

  今次 release 由 owner 明確叫住先 skip dim-sum photo。Workflow 唔再喺兩條
  photo 規矩打交嗰步自爆，會出 warning、記低 `temporarily-skipped`，release
  notes 亦寫明無相；repository 唔會偷搬 catalog image。Squirrel、unsigned、
  provenance、target、asset hash 同 publish 後驗證全部照舊，無放水。

- **The hosted Squirrel build now judges the packer by its exit code instead of
  treating ordinary stderr progress as a fatal PowerShell exception.** Release
  [`32438682495`](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/32438682495)
  completed prerequisites and packaged for nine minutes, then Windows
  PowerShell terminated the assignment on the first captured phase diagnostic
  before the explicit exit-code check. The repair scopes `Continue` to that one
  native call, restores `Stop` immediately afterward, and keeps every unsigned,
  signer-process and artifact validation unchanged.

  Hosted Squirrel build 行咗九分鐘先畀 PowerShell 誤會普通 stderr progress 係致命
  exception，真正 exit code 仲未有機會出聲。修正只喺嗰一下 native call 暫時用
  `Continue`，跟住即刻還原 `Stop`；unsigned、signer process 同 artifact validation
  一樣照睇實，唔會因為 PowerShell 太緊張就放水。

- **Project chat context no longer follows incidental file/tab selection, and
  Windows delivery requests only Squirrel.Windows.** Commit
  [`8129ac77`](https://github.com/Ding-Ding-Projects/material-designer/commit/8129ac77)
  keeps the automatic composer context project-wide, removes fresh-project and
  Design Files auto-selection, adds focused regressions, stops staging a
  portable ZIP, validates the complete Squirrel feed and runtime receipts, and
  introduces the ten-screen design-parity inventory and direct reference app.
  The parity rows and installed runtime remain explicitly unverified until the
  hosted artifact and hidden-desktop evidence land.

  Project chat context 以前會見到邊個 file/tab 就跟住走，無人叫佢都自己帶埋
  入下一句；而家固定 project-wide，窄啲嘅 context 要用戶親手揀。Windows
  delivery 亦淨係叫 Squirrel.Windows，portable ZIP 唔再扮第二個 installer；
  feed、runtime receipt 同十個畫面嘅 parity inventory 都有 guard 睇實，未有
  installed evidence 嘅 row 就老老實實寫 `unverified`，唔會靠想像變綠。

- **Viewing a file no longer attaches it to project chat.** Commit
  [`d88178c5`](https://github.com/Ding-Ding-Projects/material-designer/commit/d88178c5)
  removes the folder-project path that silently prepended the active preview
  file to every send. Explicit `@file` selection, file opening, sharing,
  downloading and routed deep links remain available; only the unrequested
  attachment and file-specific composer mode are gone.

  睇緊個 file 以前會自動變成下一句嘅 attachment，個 preview 好熱心但無人請佢。
  `d88178c5` 收返呢條暗路；明確 `@file`、開檔、share、download 同 deep link
  全部照舊，淨係移除未經選擇嘅 attachment 同 file-specific composer mode。

- **The hosted release path now reaches the real packaging gate.** Commit
  [`e99f40de`](https://github.com/Ding-Ding-Projects/material-designer/commit/e99f40debb20de1ee7029e5c3106bf50e23489db)
  fixes the release workflow's temporary-parent calculation: the previous
  three-level walk collapsed `RUNNER_TEMP` to `D:\\`, so the workflow rejected
  its own hosted workspace before Squirrel ran. Exact-SHA Verify
  [`31480515255`](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31480515255)
  and Pages [`31480515281`](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31480515281)
  are green; Release [`31480515300`](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31480515300)
  built the unsigned Squirrel payload and line-count evidence, then stopped at
  the documented dim-sum photo policy conflict before publication. No new
  release is claimed.

  Hosted release 個 temp parent 之前行三層，行到 `D:\\` 就自己嚇親自己，Squirrel
  未出場已經被 safety check 逐客。`e99f40de` 改用 `RUNNER_TEMP` 直接上一層，
  Verify 同 Pages 綠晒，Release 真係打到 unsigned Squirrel 包，最後先喺兩條
  dim-sum 規矩打交嗰度停低；未有亂 publish。

- **Release shutdown now records the boundary instead of guessing past it.**
  The local candidate is [`e99f40de`](https://github.com/Ding-Ding-Projects/material-designer/commit/e99f40debb20de1ee7029e5c3106bf50e23489db), while exact-SHA Verify
  [`31480515255`](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31480515255)
  and Pages [`31480515281`](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31480515281)
  are green. Release [`31480515300`](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31480515300)
  reached packaging and then stopped at the explicit dim-sum publication blocker.
  The manual build path, hosted `windows-2022` workflow route, defensive artifact
  evidence and target-SHA checks are present; no new release is claimed while the
  photo-policy conflict remains unresolved.

  Release shutdown 而家先畫清楚 release 條界線，唔再靠估。`e99f40de` 已經接棒；
  Verify 同 Pages 有綠色證據，Release 去到 packaging 後喺 dim-sum 相片規矩衝突位
  停低。手動 build path、hosted `windows-2022`、artifact provenance 同 target-SHA
  proof 都留低，未解決之前寧願停 publish，都唔會偷運 catalogue 相入 release。

- **The half-wired Squirrel checkpoint is preserved but no longer shipped as code.**
  Merge `d0630480` records the checkpoint ancestry; `412e1fc7` removes its stale
  `squirrel.ts` module and `693f6439` restores the single active lifecycle import
  boundary. The existing ignored-stdio/process-tree repair remains the runtime
  implementation; no new release or packaged-runtime proof is claimed
  ([`693f6439`](https://github.com/Ding-Ding-Projects/material-designer/commit/693f64394efbd0a8749878c2fb7bc6882f67d772)).

- **The production M3 shell now matches the checked-in geometry contract.** The
  bounded CSS completion blocks centralize rail, tab, app-bar, home, overlay,
  focus and reduced-motion measurements without changing routes, commands,
  state, data flow or assets. Static CSS and port-integrity checks pass; packaged
  runtime and visual-matrix proof remain pending CI
  ([`a03c16d9`](https://github.com/Ding-Ding-Projects/material-designer/commit/a03c16d939262ddc0482c104ef1b1b6d14fc2651)).

- **The packaged smoke test survives a Defender-cold Electron binary.** Three
  Release runs timed out at exactly `720000ms` while `invokeSquirrel` blocked in
  `execFileAsync` with no timeout of its own, because Windows Defender's real-time
  protection scans every file Squirrel writes and a cloud-cold Electron binary can
  take well over twelve minutes to scan. The release workflow now adds Defender
  path exclusions for the two Squirrel-owned directories before the smoke step,
  and the vitest per-test timeout is raised from `720_000` to `1_800_000` ms as
  defence in depth
  ([`8931380d`](https://github.com/Ding-Ding-Projects/material-designer/commit/8931380d)).

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

- **The Squirrel smoke can no longer spend twelve silent minutes hiding the active command.**
  Release run
  [31186802259](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31186802259)
  at `f6549861` passed Typecheck, Windows tests, unsigned Squirrel packaging,
  `NotSigned`, self-contained scanning and installer artifact upload, then timed
  out after `720000ms` before UI capture. The report did not identify whether
  pre-clean uninstall, install, start or another `tools-pack` action remained
  pending. Squirrel commands now avoid inherited captured pipes, have a bounded
  lifetime and terminate their Windows descendant tree on timeout. The packaged
  smoke also bounds each `tools-pack` action and persists `smoke-steps.jsonl` as
  actions start and finish, so the next failure names its pending command instead
  of pointing only at the outer test declaration. Publication remains gated on a
  successful real smoke (`TBD-COMMIT`).

  Squirrel smoke 以前可以靜靜雞食晒十二分鐘，最後淨係指住 test declaration，
  完全唔講係 pre-clean uninstall、install、start 定其他 `tools-pack` action 卡住。
  `31186802259` 證明打包、`NotSigned` 同 artifact upload 過關，但 UI capture 前
  timeout。依家 Squirrel 唔再攬住 inherited pipe，command 同 process tree 都有
  時限；smoke 亦一路寫 `smoke-steps.jsonl`，下次再跌低都要講低自己喺邊一級
  樓梯跣親。真正 release 仲要等 real smoke 綠先算（`TBD-COMMIT`）。

- **The second packaging attempt caught a schema mismatch before the signer could run.**
  Run [31158740651](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31158740651)
  at [`f484639a`](https://github.com/Ding-Ding-Projects/material-designer/commit/f484639a3d6a70ce30fc6a2c798e6e59518ecf8e)
  passed the design verifier, self-hosted bootstrap, dependency installation, web
  Typecheck and the Windows identity/installer tests. Locked `electron-builder`
  26.8.1 then rejected `win.sign` as an unknown Windows configuration property
  before packaging. No installer, smoke result or release was published. Commit
  [`e768b5b`](https://github.com/Ding-Ding-Projects/material-designer/commit/e768b5bef5a308a93747ef0c60e01881baef5ce0)
  replaces the invalid property with the supported
  `signAndEditExecutable: false` control and adds a release-contract assertion.
  A replacement run is required before publication is claimed.

  第二次 packaging 想行快啲，點知先畀 schema mismatch 截停，signer 仲未有機會
  出場。31158740651 過咗 verifier、self-hosted bootstrap、dependency install、web
  Typecheck 同 Windows identity/installer tests，但 locked electron-builder 26.8.1
  唔識 `win.sign`，所以未開始 packaging 就報 unknown Windows configuration property。
  `e768b5b` 改用佢真正支援嘅 `signAndEditExecutable: false`，再加 release contract
  assertion；installer、smoke 同 release 仍然要等 replacement run 實證。

- **The replacement Release reached Squirrel packaging and found the last two builder gaps.**
  Run [31156822158](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31156822158)
  at [`64d58b1e`](https://github.com/Ding-Ding-Projects/material-designer/commit/64d58b1e32d3055ffc90bf03cf8266865190ced5)
  passed the design verifier, self-hosted bootstrap, dependency installation, web
  Typecheck and the Windows identity/installer tests. Packaging then logged repeated
  `signing with signtool.exe` lines and Squirrel.Windows stopped with `Authors is
  required.` No installer, smoke result or release was published. Commit
  [`6911c62`](https://github.com/Ding-Ding-Projects/material-designer/commit/6911c6235917cb59d2fcf2a31e6041aad9c81488)
  adds a top-level package author, `win.sign: false` and
  `verifyUpdateCodeSignature: false`, with source-contract assertions for the
  unsigned builder. A replacement run is required before publication is claimed.

  Replacement Release 終於行到 Squirrel packaging，先發現 builder 仲有兩個窿。
  31156822158 過咗 verifier、self-hosted bootstrap、dependency install、web
  Typecheck 同 Windows identity/installer tests，去到 packaging 卻再三叫
  `signing with signtool.exe`，跟住 Squirrel.Windows 報 `Authors is required.`，所以
  installer、smoke result 同 release 都未出街。`6911c62` 補返 top-level package
  author，明確設 `win.sign: false` 同 `verifyUpdateCodeSignature: false`，再用
  source contract tests 望實 unsigned builder；要等 replacement run 真正驗證先可以
  報 publication 完成。

- **The web repair passed Typecheck, and the next Windows contract caught a stale expectation.**
  Release run [31155747324](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31155747324)
  at [`2b7e06a`](https://github.com/Ding-Ding-Projects/material-designer/commit/2b7e06a2009148878f2eded00acbebd5be0b0956)
  passed the design verifier, self-hosted bootstrap, dependency installation and
  web Typecheck, then failed the Windows identity/installer test with 125 tests
  passing, 1 skipped and 1 stale source-contract assertion. Commit
  [`0357266`](https://github.com/Ding-Ding-Projects/material-designer/commit/0357266f1e529c87da5988b4c2d1ecd3128192f9)
  updates that assertion to the escaped Squirrel artifact template exposed by
  `resolveWinSquirrelArtifactName` and declares the changed test in
  `MODIFICATIONS.md`. No installer or release is claimed from the failed run.

  Web repair pass 咗 Typecheck，但下一關 Windows contract test 發現自己仲望住舊
  template。31155747324 過咗 verifier、self-hosted bootstrap、dependency install
  同 web Typecheck，125 個 tests pass、1 個 skip，偏偏 1 個 assertion 仲守住舊
  Squirrel string。`0357266` 對返 `resolveWinSquirrelArtifactName` 真正輸出，等個
  test 唔使再同化石鬥氣；installer 同 release 仲未可以當已經出街。

- **Release CI now reaches the web typecheck with a precise failure report.**
  Run [31155063471](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31155063471)
  passed the portable Python bootstrap and frozen dependency installation, then
  found 10 existing `apps/web` type errors before packaging. Commit
  [`a769c35`](https://github.com/Ding-Ding-Projects/material-designer/commit/a769c35609254e6e4dc71daddf4be076cad396b2)
  restores the missing platform import, narrows three focus-trap element
  accesses, aligns the HTML fixture with `ArtifactKind`, and declares all five
  changed `design/` paths in `MODIFICATIONS.md`.

  Release CI 而家終於行到 web typecheck，唔再畀 bootstrap 遮住真相。31155063471
  過咗 portable Python 同 frozen dependency install，先揪出 `apps/web` 十個
  type errors。`a769c35` 補返 platform import、收窄三個 focus trap、將 HTML
  fixture 對返 `ArtifactKind`，仲喺 `MODIFICATIONS.md` 報齊五條 design path，
  等 compiler 唔使再對住空氣發脾氣。

- **Python bootstrap now uses the official embeddable archive.** Release run
  [31154756724](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31154756724)
  showed the direct installer returning `-2147024891` (`0x80070005`, access
  denied) for the self-hosted runner service account. Commit
  [`37534e5`](https://github.com/Ding-Ding-Projects/material-designer/commit/37534e58ccbe28fdef6a3010a845d9bd46db9ced)
  switches to the official Python 3.12.10
  `python-3.12.10-embed-amd64.zip`, verifies its SHA-256 and extracts it into
  the user-scoped cache without registry or installer operations
  ([`37534e5`](https://github.com/Ding-Ding-Projects/material-designer/commit/37534e58ccbe28fdef6a3010a845d9bd46db9ced)).

  31154756724 試到 direct installer，但 self-hosted runner service account 收到
  `-2147024891`（`0x80070005`，access denied），連 Python 都未入場。今次改用
  官方 Python 3.12.10 embeddable archive，先驗 SHA-256，再解壓入 user-scoped
  cache，唔郁 registry，唔叫 installer，等個 bootstrap 唔使再撞同一度門。

- **Python installer completion now uses an explicit process result.** Release
  run [31154520542](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31154520542)
  reached the direct installer, but Windows PowerShell left `$LASTEXITCODE`
  empty and the null comparison stopped the job before interpreter discovery.
  Commit [`9dcdb2f`](https://github.com/Ding-Ding-Projects/material-designer/commit/9dcdb2f31de96dd54e7425066ef6cecb4761f65d)
  waits with `Start-Process -Wait -PassThru`, logs the numeric exit code, and
  accepts only success or the documented reboot-required result before checking
  `python.exe`.

  31154520542 終於行到 direct installer，但 Windows PowerShell 留低空白
  `$LASTEXITCODE`，null comparison 又將個 job 提早請出場。`9dcdb2f` 而家用
  `Start-Process -Wait -PassThru` 等 process 完成，記低實數字 exit code，淨係
  接受成功或者 documented reboot-required，先再驗 `python.exe`，唔畀空白數字
  再扮大佬。

- **Python bootstrap now uses the archive's installer executable.** Release run
  [31154123479](https://github.com/Ding-Ding-Projects/material-designer/actions/runs/31154123479)
  proved that the verified `actions/python-versions` archive contains
  `python-3.12.10-amd64.exe` and `setup.ps1`, not a portable `python.exe`.
  The first repair therefore stopped at interpreter discovery. Commit
  [`c45e243`](https://github.com/Ding-Ding-Projects/material-designer/commit/c45e243da8001435b4fafd8eeb03659ecb195fb7)
  locates the installer and runs it directly with `InstallAllUsers=0` into the
  user-scoped cache, so PowerShell never loads the unsigned setup script.

  個 archive 原來係 installer bundle，唔係 portable `python.exe`：入面有
  `python-3.12.10-amd64.exe` 同 `setup.ps1`。31154123479 證明第一版只係
  hash-check 完就搵錯地方，未入到真正 build。`c45e243` 而家直接叫 installer
  入 user-scoped cache，用 `InstallAllUsers=0`，唔再畀 PowerShell 請 unsigned
  setup script 入場，個 Python bootstrap 終於識睇門牌。

- **Python now enters the release job through a policy-safe bootstrap.**
  actions/setup-python downloaded the right 3.12 archive but then tried to run
  an unsigned setup.ps1, which the self-hosted runner rejected under AllSigned.
  The release now uses a user-scoped, lock-protected bootstrap with a pinned
  actions/python-versions archive, SHA-256 verification and an explicit PATH
  handoff
  ([511c452](https://github.com/Ding-Ding-Projects/material-designer/commit/511c4526535031791fe9ead0e4127ed6c7431dcd)).

  Python 而家經 policy-safe bootstrap 入 release job：actions/setup-python
  download 到啱嘅 3.12 archive，但跟住要跑 unsigned setup.ps1，畀 self-hosted
  runner 個 AllSigned 擋住。今次改用 user-scoped、lock-protected bootstrap，
  pinned actions/python-versions archive，SHA-256 驗證，同埋明確 PATH handoff，
  唔再畀個 action 喺門口跌倒。

- **The Windows release shell now bypasses policy at the loader boundary.**
  Windows PowerShell existed, but its default command wrapper tried to load the
  generated step before the step body could invoke a child process with Bypass.
  The shell template now carries the per-process execution-policy switch, leaving
  the user's persistent policy untouched
  ([129cb90](https://github.com/Ding-Ding-Projects/material-designer/commit/129cb90120c5b57b1e644f0ba0a142b1fea86c2b)).

  Windows release shell 而家喺 loader boundary 就 bypass policy：Windows
  PowerShell 明明存在，但 default wrapper 先 load generated step，step body
  仲未有機會叫 child process 設 Bypass 就已經畀 unsigned script 擋低。
  Shell template 而家帶住 per-process execution-policy switch，唔郁用戶
  persistent policy，個 script 終於有機會入場。

- **Windows release bootstrap now uses the shell the runner actually has.** The
  labelled image has powershell.exe but no pwsh command, so the first default
  branch run reached checkout and then stopped before dependency installation.
  The workflow now invokes Windows PowerShell, the bootstrap script remains
  compatible with that engine, and the contract test rejects a future pwsh
  regression
  ([993f86a](https://github.com/Ding-Ding-Projects/material-designer/commit/993f86ad3540333d55f3a4b2e4f92dbb0346aabd)).

  Windows release bootstrap 而家用 runner 真係有嗰個 shell：labelled image
  有 powershell.exe，但冇 pwsh command，第一次 default branch run 去到
  checkout 先發現 dependency 門口冇人開門。Workflow 而家行 Windows
  PowerShell，bootstrap script 同 engine 相容，contract test 仲會擋住
  pwsh 偷偷返生。

- **The Windows release shell now avoids a second path-shaped trap.** The first
  repair named Git Bash but quoted an executable path with spaces; the runner
  combined that command with a PATH shim and failed before checkout. The
  workflow now uses the installation's space-free Windows short path, keeping
  the release explicitly on Git-for-Windows without adding WSL
  ([64ef401](https://github.com/Ding-Ding-Projects/material-designer/commit/64ef401818d453ea87161c62fcb4997632ccc158)).

  Windows release shell 而家避開第二個 path 陷阱：第一次修補雖然叫咗
  Git Bash，但 quote 住有空格嘅 executable path，runner 將佢同 PATH shim
  撈埋一齊，checkout 前已經收工。Workflow 而家用安裝位置嘅無空格
  Windows short path，繼續明確行 Git-for-Windows，唔使加 WSL。

- **Windows release jobs now ask for Git Bash by name.** The self-hosted runner's
  bare `shell: bash` resolved to a WSL launcher with no installed distribution,
  so the job failed before checkout and never reached the interesting machinery.
  The release workflow now selects the installed Git-for-Windows Bash executable
  explicitly, leaving WSL out of the dependency list
  ([`99974ae`](https://github.com/Ding-Ding-Projects/material-designer/commit/99974ae2fb9b4bdc2ee6bd80cdc3a1dcb1cf542a)).

  Windows release job 而家明確叫 Git Bash：self-hosted runner 將 bare
  `shell: bash` 誤認成冇 distro 嘅 WSL launcher，未 checkout 就已經收工，
  連真正 machinery 都未見過。Workflow 而家直接揀 Git-for-Windows Bash，
  WSL 唔再偷偷混入 dependency list。

- **The release pipeline now refuses to sign anything.** The active Squirrel
  packer removes signer and notarization entry points, clears certificate and
  timestamp inputs, and verifies `Setup.exe` is `NotSigned` before publication.
  Self-hosted CI now bootstraps Python 3.12 and the Windows C++ toolchain beside
  Node 24, pnpm 10.33.2 and the utility cache, publishes measured workflow timing,
  and documents the fresh-runner dependency inventory. The installer warning is
  intentional: the code-signing cupboard is permanently empty, but Squirrel's
  update feed still brings its hashes and rollback checks
  ([`8fb9eec5`](https://github.com/Ding-Ding-Projects/material-designer/commit/8fb9eec5d1cc16312007a40d0c672c9534fdd3f9)).

  發佈流程而家拒絕幫任何嘢簽名：active Squirrel packer 拆走 signer 同
  notarization 入口，清走 certificate/timestamp inputs，發佈前驗證
  `Setup.exe` 係 `NotSigned`。Self-hosted CI 加埋 Python 3.12 同 Windows C++
  toolchain，配合 Node 24、pnpm 10.33.2 同 utility cache，仲會記低真實
  workflow timing 同 fresh-runner dependency inventory。安裝器個 warning
  係故意嘅——code-signing 個櫃永久空空如也，但 Squirrel update feed 仲有
  hash 同 rollback checks，唔會畀個更新流程食白果。

- **The settings overflow menu stopped being a 17-item scavenger hunt.** It now
  carries its own plain-text-first regex search, keeps an honest empty state,
  filters only the visible section labels and hints, supports Arrow/Home/End
  navigation and returns focus to the opener on Escape or Tab. The focused spec
  covers the independent builder, filtering and keyboard route; no local build,
  CI or installed-build result is claimed
  ([`6f03a832`](https://github.com/Ding-Ding-Projects/material-designer/commit/6f03a8321e8f6bf1fd1ddae56e95faf39a3e4d58)).

  設定 overflow menu 唔再係十七格捉迷藏：而家有自己嘅 plain-text-first
  regex search、真實 no-match 狀態，只篩 section label 同 hint，仲有
  Arrow/Home/End 鍵盤路線，Escape 或 Tab 會將 focus 送返 opener。Focused
  spec 覆蓋獨立 builder、filter 同 keyboard route；今次冇聲稱有本機 build、
  CI 或 installed-build 結果。

- **The settings menu, onboarding dropdowns and command-palette control now respect
  the edges.** The overflow surface computes its real width and above/below
  placement instead of rendering a fixed rectangle; onboarding dropdowns return
  focus after Escape or selection and expose field-plus-value accessible names; the
  palette's size toggle is a 48px target. Focused source checks are committed in
  [`34426621`](https://github.com/Ding-Ding-Projects/material-designer/commit/34426621);
  no local build, CI or installed-build result is claimed.

  Settings menu、onboarding dropdown 同 command palette control 而家識得睇邊界：
  overflow surface 會按真實寬高揀向上或者向下開，dropdown 關閉或揀完會返
  focus 去 trigger，讀屏會聽到 field 加 value，palette size toggle 就有 48px
  target。Focused source checks 已經 commit，今次冇聲稱有本機 build、CI 或
  installed-build 結果。

- **The settings overflow refutation is now part of the repair.** The portalled
  menu sits above the opaque settings page, its own regex builder is a separate
  focus scope for Tab navigation, stale anchors clamp to the visible viewport,
  and geometry tests restore the global viewport dimensions they borrow. This is
  source-level coverage only; no local build, CI or installed-build result is
  claimed
  ([`ec2c76d7`](https://github.com/Ding-Ding-Projects/material-designer/commit/ec2c76d7)).

  設定 overflow menu 嘅 refutation 而家正式收尾：portalled menu 會企喺 opaque
  settings page 上面，自己個 regex builder 有獨立 focus scope，舊 anchor 出界
  會夾返入 viewport，geometry test 借完 viewport 尺寸亦會還原。今次只係
  source-level coverage，冇扮有本機 build、CI 或 installed-build 結果。

- **Update surfaces now open the exact release notes for the update.** HTTPS
  `releaseNotesUrl` metadata flows through the updater model into the ready dialog
  and persistent banner, while malformed or non-HTTPS values use the repository
  releases page instead
  ([`6f4015b8`](https://github.com/Ding-Ding-Projects/material-designer/commit/6f4015b8)).

  Update surface 而家會開返該次 update 真正嘅 release notes：HTTPS
  `releaseNotesUrl` 由 metadata 一路傳到 ready dialog 同常駐 banner，亂格式
  或非 HTTPS 值就穩陣跌返 repository releases page，唔再帶住錯地圖出門口。

- **Squirrel publication now fails closed on release evidence.** The workflow
  requires a valid Authenticode signature, a successful packaged smoke test and
  non-duplicate UI-state evidence before publication; persistent self-hosted CI
  tools are rebuilt from verified sources, and the custom runner label is declared
  for `actionlint`
  ([`6daae310`](https://github.com/Ding-Ding-Projects/material-designer/commit/6daae310)).

  Squirrel release 而家要有真 Authenticode signature、packaged smoke test 成功、
  UI state 唔重複，先可以出街；persistent self-hosted CI tools 每次由 verified
  source 重新砌，custom runner label 亦寫入 `actionlint` 設定。證據未齊就停，
  唔會整個 unsigned installer 出嚟扮完成。

- **The Figma focus-trap regression now proves its wrap edges.**
  [`ac3ba56`](https://github.com/Ding-Ding-Projects/material-designer/commit/ac3ba56) extends the
  [`cbdc4f5`](https://github.com/Ding-Ding-Projects/material-designer/commit/cbdc4f5ae673b7387445ad8e2fc0ba49dcdacb4e)
  coverage from the complete modal keyboard order to the handler's actual edge
  contract: forward and reverse traversal must call `preventDefault()` at the
  corresponding wrap edge, so the jsdom fallback cannot mask a broken real
  handler. This is source-level coverage only; no local Node, pnpm, Electron,
  build, CI or capture result is claimed.

  Figma focus-trap regression 而家唔止行到 native file input，連 wrap 邊位都要
  真係交由 handler 取消 default：forward 同 reverse 到邊界都必須有
  `preventDefault()`，唔畀 jsdom 後備 focus 偷偷扮成功。呢個係 source-level
  coverage，今次冇扮有本機 Node、pnpm、Electron、build、CI 或 capture 結果。

- **Figma file drops now stay attached to a visible, named native control.**
  [`8b76513`](https://github.com/Ding-Ding-Projects/material-designer/commit/8b7651350daa8b3fdcda3dc9c74e44d7a8d880dd)
  moves a file dropped on the URL tab to the file tab before reporting the
  localized error, focuses the real file input, and keeps the alert plus retry
  path associated with that control. The input is visually hidden with a real
  accessible name and helper/error relationships instead of being removed with
  `display: none`; the visible dropzone remains keyboard-operable and the modal
  focus trap includes the native control. `zh-HK` deliberately inherits
  `figmaUrl` and `figmaPlaceholder` from `zh-TW`, so no duplicate locale keys were
  introduced. Focused static coverage is committed; no local Node, pnpm, Electron,
  build, CI or capture result is claimed.

  Figma file drop 而家唔會同 visible native control 走失：URL tab 開住時掉
  file，會先跳返 file tab，再將 focus 放返真 input，localized error、alert 同
  retry 路徑全部黐實正確 control。Input 用真正可讀嘅 visually-hidden strategy，
  有 accessible name 同 helper/error 關聯，唔再用 `display: none` 變隱形人；
  visible dropzone 照樣畀 keyboard 用，modal focus trap 亦冇漏低 native control。
  `zh-HK` 有意繼承 `zh-TW` 嘅 `figmaUrl` 同 `figmaPlaceholder`，所以冇重複 locale
  key。Focused static coverage 已 commit；今次冇扮有本機 Node、pnpm、Electron、
  build、CI 或 capture 結果。

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

  Figma import 嘅 final refutation 六個 bugs 而家一次過收掂：modal 先收場，
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
