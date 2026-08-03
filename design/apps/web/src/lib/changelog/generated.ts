// GENERATED FILE — do not edit by hand.
//
// Written by `node scripts/generate-changelog.mjs` from this repository's own
// changelog sources. Two things are recorded here that only a repository can
// answer: the source markdown itself, and every commit those sources
// reference — resolved to a full object id and an author date, with the link
// taken verbatim from the source. An abbreviation this repository does not
// have is listed as unresolved and never linked.
//
// `../changelog` turns this into releases through `parse.ts`, which is the one
// parser the app and its tests both use.

export interface ChangelogSourceFile {
  /** Repository-relative path this markdown was read from. */
  readonly path: string;
  readonly kind: 'keep-a-changelog' | 'release-notes';
  /** Version the file documents, when the path names one. */
  readonly version: string | null;
  readonly markdown: string;
}

export interface ChangelogCommitRecord {
  /** Full object id, resolved against this repository at build time. */
  readonly sha: string;
  /** The abbreviation the source wrote. */
  readonly shortSha: string;
  /** The link the source wrote — never assembled from a guessed origin. */
  readonly url: string;
  /** Commit date, ISO-8601 with offset. */
  readonly date: string;
}

export const CHANGELOG_SOURCES: readonly ChangelogSourceFile[] = [
  {
    path: "CHANGELOG.md",
    kind: "keep-a-changelog",
    version: null,
    markdown: "# Changelog\n\nEvery notable change to this project, newest first.\n\nThe format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the\nproject intends to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html)\nonce it publishes a version of its own.\n\nTwo rules this file is held to:\n\n- **Every entry links the commit that made the change.** An entry that says what\n  changed but not where is unverifiable — a reader who doubts it, or who needs the\n  surrounding context, has no way to get from the sentence to the code.\n- **Nothing is invented.** No entry, date, version or fix appears here that did not\n  happen. A version with no recorded changes says so rather than being padded.\n\n> [!NOTE]\n> **Tags carry a build suffix, not a version this project chose.** `0.16.1` is\n> inherited from the imported upstream work and does not yet describe a version this\n> project set for itself; the `-rN.N` suffix is what makes each published build\n> uniquely identifiable. Every release below carries a dim sum code name beside its\n> tag, as this project's release rules require.\n\n## [Unreleased]\n\nNothing yet. Changes land here as they are committed, each with its commit link, and\nmove into a version section when a release carries them.\n\n## [v0.16.1-r8.1] — 2026-08-03\n\n**Code name: Beef with Oyster Sauce · 蠔油牛肉** ·\n[release](https://github.com/Ding-Ding-Projects/material-designer/releases/tag/v0.16.1-r8.1)\n\nBuilt from [`dea6b0a`](https://github.com/Ding-Ding-Projects/material-designer/commit/dea6b0a).\nThe packaged smoke test passed: the built application installed, launched, answered its\nown health endpoint and uninstalled without residue.\n\n### Added\n\n- **The Material Design 3 token layer, and a Windows title bar.** The mockup's token\n  sheet is transcribed as `md3-tokens.css` — 203 colour roles across light and dark,\n  every seed variant, the shape scale, the motion curves and the density steps — and\n  the existing token file became a mapping layer, so every legacy token keeps its name\n  and resolves to an M3 role. Two things were checked because both fail silently: no\n  previously defined token was dropped (a dropped one is an unstyled component, not a\n  compile error), and the functional data colours kept their own values rather than\n  being remapped onto theme roles, which would have made chart series indistinguishable.\n  Windows also gets a frameless window with a custom title bar, using a hidden title-bar\n  style rather than a frameless window so Windows 11 keeps its rounded corners, drop\n  shadow, Alt+Space and snap behaviour; the window-control messages verify the sender is\n  the main window, because embedded frames share the preload\n  ([`dea6b0a`](https://github.com/Ding-Ding-Projects/material-designer/commit/dea6b0a)).\n\n> [!IMPORTANT]\n> **This is a foundation, not the redesign.** The token layer means components inherit\n> M3 values; **no component has been rewritten**. Three departures from the mockup are\n> recorded rather than quietly taken: the mockup's subtitle describes the mockup and not\n> the product, the focus ring is inset because the window-control buttons sit flush\n> against two window edges, and the icon webfont is not bundled — the bar uses the\n> application's existing icon set at the contract's sizes.\n\n## [v0.16.1-r7.1] — 2026-08-03\n\n**Code name: Beef with Black Bean and Peppers · 豉椒炒牛肉** ·\n[release](https://github.com/Ding-Ding-Projects/material-designer/releases/tag/v0.16.1-r7.1)\n\nThe first published release, built from\n[`12bfb81`](https://github.com/Ding-Ding-Projects/material-designer/commit/12bfb81). It\ncarries everything from the verbatim import forward. The packaged smoke test passed.\n\n### Added\n\n- The whole of Open Design v0.16.1 under `design/` — **11,799 files**, copied\n  byte-for-byte from the pinned upstream tree, file modes included\n  ([`5ef7393`](https://github.com/Ding-Ding-Projects/material-designer/commit/5ef7393)).\n- `scripts/verify-port.sh`, which proves that copy has not drifted, and\n  `MODIFICATIONS.md`, which is simultaneously the Apache-2.0 §4(b) notice and the\n  allowlist the verifier enforces — a file may differ from upstream only if it is\n  listed there, and a listed file that no longer differs fails too\n  ([`b8dc87d`](https://github.com/Ding-Ding-Projects/material-designer/commit/b8dc87d)).\n- `scripts/upstream-manifest.tsv`, a committed table of upstream object ids, so the\n  integrity check does not have to clone a 1.7 GB object store on every push. When\n  the submodule is present the manifest is checked against it first, so the shortcut\n  cannot drift from the thing it stands in for\n  ([`65e288f`](https://github.com/Ding-Ding-Projects/material-designer/commit/65e288f)).\n- A dish catalogue of 24 dishes across 12 categories under `assets/dim-sum/`, each\n  image copied byte-for-byte and verified by SHA-256 against its source manifest,\n  plus `scripts/release-codename.sh`, which spends each dish exactly once by reading\n  the used ones back out of existing releases\n  ([`a454a7b`](https://github.com/Ding-Ding-Projects/material-designer/commit/a454a7b)).\n- Three workflows: `verify.yml` (port integrity plus the full unit suite on Linux),\n  `release.yml` (install, typecheck, Windows identity tests, installer build, packaged\n  smoke test, release publication) and `pages.yml` (the documentation site)\n  ([`65e288f`](https://github.com/Ding-Ding-Projects/material-designer/commit/65e288f)).\n- The repository's documentation: `README.md`, `AGENTS.md`, `ROADMAP.md`,\n  `HANDOFF.md`, a categorized `docs/` tree, a committed line counter, and a\n  368-request Postman collection for the daemon's HTTP API\n  ([`c2ca744`](https://github.com/Ding-Ding-Projects/material-designer/commit/c2ca744)).\n- The documentation site at\n  <https://ding-ding-projects.github.io/material-designer/> — self-contained, with\n  three language modes, two funny-level sliders, Material Design 3 tokens, appearance\n  customization, a regex builder on every search field and browser-style tabs\n  ([`29c1476`](https://github.com/Ding-Ding-Projects/material-designer/commit/29c1476)).\n\n### Changed\n\n- **The packaged application is now a standalone product.** Installed beside the\n  upstream one, an unmodified build was the same application as far as Windows is\n  concerned, and collided in eight ways — five of which corrupt or break something.\n  It now has its own display name, application ids, Windows named-pipe prefix,\n  uninstall registry key, install location, user-data directory and taskbar identity\n  ([`cbd6a14`](https://github.com/Ding-Ding-Projects/material-designer/commit/cbd6a14)).\n- The Material Design 3 mockup moved to `mockups/open-design-m3/` so `design/` could\n  hold the imported tree\n  ([`2567115`](https://github.com/Ding-Ding-Projects/material-designer/commit/2567115)).\n- **The site documentation stopped saying the site was unpublished.** It had been for\n  several runs. The correction also recorded the two things that were actually in the\n  way, because both will catch the next person: the publishing surface had never been\n  enabled on the repository, which no workflow can do for itself, and the dish\n  catalogue lives outside the published directory, so the deployment has to stage it in\n  ([`fb8ba8c`](https://github.com/Ding-Ding-Projects/material-designer/commit/fb8ba8c)).\n- **This file was created**, written from the real commit history rather than from\n  memory, with every object id it references checked against the object store before it\n  was committed. The same commit replaced the README's claim that no\n  continuous-integration outcome had been observed with a table of what each workflow\n  had actually done — keeping the rows that were still unobserved visible in that table\n  rather than omitting them\n  ([`ec46f83`](https://github.com/Ding-Ding-Projects/material-designer/commit/ec46f83)).\n\n### Fixed\n\n- **The packaged build no longer updates itself into a different product.** The\n  updater shipped enabled by default and pointed at the upstream release feed, so a\n  build of this project would have downloaded that project's installer and replaced\n  itself with it. Updates are now opt-in and the default origin cannot resolve\n  ([`cbd6a14`](https://github.com/Ding-Ding-Projects/material-designer/commit/cbd6a14)).\n- The daemon no longer fetches a remotely-controlled document from an upstream-owned\n  host on every launch and render its title, body, image and clickable link inside\n  this application. That surface is now opt-in with no default\n  ([`cbd6a14`](https://github.com/Ding-Ding-Projects/material-designer/commit/cbd6a14)).\n- Two build-breaking literals left over from the rename: the payload writer looked for\n  an executable under the old product name while the builder produced the new one, and\n  the launcher archive path disagreed with the paths module about its own filename\n  ([`cbd6a14`](https://github.com/Ding-Ding-Projects/material-designer/commit/cbd6a14)).\n- Private references removed from the design mockup — a personal account name, three\n  internal tool names and a local endpoint, in a public repository. Earlier revisions\n  still contain them; cleaning that is a history rewrite and has not been done\n  ([`b5441b3`](https://github.com/Ding-Ding-Projects/material-designer/commit/b5441b3)).\n- The site's dish catalogue was addressed outside the published directory and would\n  have returned 404 for every visitor; the deployment now stages it into the artifact\n  ([`29c1476`](https://github.com/Ding-Ding-Projects/material-designer/commit/29c1476)).\n- An unknown translation key rendered as its own name in brackets. Three quarters of\n  the site's keys were not yet written, so unknown keys now leave the element's own\n  English text in place and report once to the console — the page reads correctly and\n  the gap stays visible\n  ([`29c1476`](https://github.com/Ding-Ding-Projects/material-designer/commit/29c1476)).\n- Continuous integration ran several suites on a platform that cannot satisfy them:\n  macOS binaries asserting a Unix executable bit NTFS does not store, a five-second\n  test budget written for a developer's disk, a package importing output that had not\n  been compiled, and tests symlinking a layout Windows will not let a runner create.\n  The suites are now split by what each platform can answer, and every spec still runs\n  somewhere ([`187d216`](https://github.com/Ding-Ding-Projects/material-designer/commit/187d216),\n  [`217610e`](https://github.com/Ding-Ding-Projects/material-designer/commit/217610e),\n  [`d7d3698`](https://github.com/Ding-Ding-Projects/material-designer/commit/d7d3698),\n  [`29c1476`](https://github.com/Ding-Ding-Projects/material-designer/commit/29c1476)).\n- **The installer build no longer fails schema validation before packing anything.**\n  A publisher-name property was set so the executable's company field would not be\n  blank; the packaging tool's current major version classes it as a signing input and\n  moved it elsewhere, so setting it where it used to live is rejected on sight. The\n  property is gone and the comment says why — the company field stays empty, the same\n  as upstream, because this build does not sign\n  ([`12bfb81`](https://github.com/Ding-Ding-Projects/material-designer/commit/12bfb81)).\n\n## Not done yet\n\nListed here because a changelog that only records progress misleads about the shape of\nthe work. This is the current position, not a record of any one release. The full\nburn-down is in [`ROADMAP.md`](ROADMAP.md).\n\n- The Material Design 3 redesign is **a foundation, not a finished redesign**. The\n  token layer and the Windows title bar have landed; **no component has been\n  rewritten**, and the interface is still substantially the imported one.\n- The application has no Cantonese locale, no funny-level sliders, no in-app regex\n  builder, no dish surprise and no changelog viewer. The site demonstrates all of\n  them; the application does not have them.\n- No installer is code-signed, so every published one trips SmartScreen on first run.\n- Nothing but Windows is published. There is no macOS or Linux artifact and no\n  updater feed.\n- The daemon's HTTP API has been documented and turned into a request collection, but\n  **no request in that collection has been sent** — the route inventory was read from\n  source, not observed answering.\n",
  },
  {
    path: "design/docs/CHANGELOG/v0.16.0/en.md",
    kind: "release-notes",
    version: "0.16.0",
    markdown: "---\ntitle: Open Design 0.16.0\ndescription: Choose a visual direction, keep your work intact, and move from creation to delivery with confidence.\n---\n\n# Open Design 0.16.0 — The Confident Creative Loop\n\n🎨 **92 PRs · 20 contributors · 5 days** — **Choose the direction, keep the work, and ship without second-guessing the path.** Visual guidance now reaches more kinds of work, model setup is easier to trust before a task begins, and long tasks and app updates are less likely to interrupt access to your latest results. 0.16.0 makes the whole journey more dependable—from choosing the look to reopening the app that delivers it.\n\n## 🔥 Highlights\n\n- 🎨 **Visual direction now follows the thing you are actually making.** Style choices are no longer limited to decks and prototypes. Documents, posters and other images, videos, Web Clones, wireframes, mobile work, and Hyperframes each get previews suited to their format—with four quick choices inline and the full library one click away. (#5746)\n\n- 🔔 **Product news now has a home inside Open Design.** A new bell in the Home and project headers opens a message center with unread counts, filters, mark-all-read, and links to relevant content. Read state stays on the device for anonymous use or follows a signed-in account. Dates use your locale, and the close button is always easy to find. (#5920, #5954, #5959, #5968) Thanks @nettee.\n\n- 🔄 **Automatic updates now cover more of the app.** After upgrading, the new version takes effect more reliably and features affected by an incomplete update—including PPTX export—work again. On macOS, “Check for Updates…” now clearly shows whether the app is current, downloading, ready to restart, waiting for active work to finish, or needs a manual download. Update reliability also improves on Windows. (#5789, #5766, #5678, #5915, #5940, #5955, #5967) Thanks @PerishCode.\n\n- 🔑 **BYOK catches setup problems before they interrupt a task.** Incomplete edits stay as recoverable drafts instead of replacing a working configuration. Connection tests now behave more like real tasks, show service errors more clearly, preserve each provider’s model ordering, and handle compatible MiniMax, DeepSeek, and MiMo addresses more consistently. (#5745, #5712, #5713, #5774, #5807) Thanks @Siri-Ray, @mturac.\n\n- 🧠 **Long tasks keep their answer—and the files that came with it.** Work approaching a conversation limit can continue with the newest useful context instead of failing abruptly. Earlier generated files stay attached, recovered helper agents no longer turn successful work into a failure, interrupted tasks show an accurate state after restart, and unrecoverable errors stop with a useful explanation. (#5816, #5850, #5845, #5817, #5882) Thanks @Siri-Ray, @tomsen02.\n\n- 🖼️ **Image generation is more resilient to brief service interruptions.** Nano Banana and custom image generation retry once when a provider is temporarily busy, while GPT Image reference edits work across more compatible services. A short interruption becomes a brief wait instead of a lost creative turn. (#5702, #5760) Thanks @Siri-Ray, @xxiaoxiong.\n\n- 🧩 **Start from what people actually use.** Slides, image, video, and other non-prototype galleries now lead with templates that have earned real usage, while blank entries and cards without previews stop crowding the top. Prototype keeps its editorial showcase, and every category keeps its full catalog. (#5106, #5881) Thanks @ScarletttMoon.\n\n- 🧬 **Design systems import more faithfully from real repositories.** Repository imports now choose the right flow, split token packages keep their layout values, and common YAML list and multiline formats preserve the metadata their authors wrote. (#5779, #5797, #5499) Thanks @mturac, @MuduiClaw, @EthanGuo-coder.\n\n- 🪟 **Previews spend less time making you fight the frame.** Wide desktop pages fit the pane until you choose your own zoom, older decks respond to navigation keys immediately, and the latest main HTML file appears as soon as a task finishes. When an asset is blocked for safety, the preview identifies the relevant project file without exposing a sensitive system path. (#5751, #5755, #5577, #5784) Thanks @lefarcen, @maxmilian, @mturac.\n\n- 🛡️ **Local work now has stronger safety boundaries.** Imported projects keep hidden credentials private, removing a plugin stays within that plugin’s files, marketplace and saved-site content are handled more safely, and each conversation stays attached to the correct project. (#5857, #5855, #5880, #5503, #5813) Thanks @tomsen02, @wiggdevin.\n\n## ✨ Added\n\n### 🚀 Deployment and integrations\n\n- **Preview before you publish.** Cloudflare Pages deployment now exposes Preview and Production as explicit targets in both the interface and `od deploy --target … --json`. Preview returns its own URL without replacing the live production hostname. (#4576) Thanks @cbeaulieu-gt.\n\n- **Kiro joins the MCP setup picker.** Copy the correct shared-server snippet from Settings and move it into Kiro’s configuration without translating another client’s format by hand. (#5275) Thanks @BusanGukbap.\n\n## 🔁 Changed\n\n### 🔑 Models, media, and memory\n\n- **The model list follows the provider, not the alphabet.** The provider’s original ordering is preserved, outdated Moonshot and DeepSeek defaults move to currently available models, and Settings and onboarding now show the same choices. (#5774) Thanks @Siri-Ray.\n\n- **Memory can use the MiniMax key you already saved.** A compatible saved key is no longer reported as missing. If a provider only supports image or audio, Memory now explains that it is unsupported and shows useful next steps. (#5767) Thanks @lefarcen.\n\n- **Provider mode changes are reflected immediately.** Switching to BYOK updates the composer icon at once, and a cleared custom model in Local CLI mode now stays cleared. (#5379, #5749) Thanks @yashrao2607, @jzhishu.\n\n## 🐛 Fixed\n\n### 🧠 Agents and runs\n\n- **MCP follow-ups now receive the latest message.** Reusing a conversation continues with the new request instead of finishing without doing any new work. (#5851) Thanks @mturac.\n\n- **Restarting or canceling work now leaves a more accurate result.** Tasks can still finish when saving their session hits a problem, canceled work stays canceled, and interrupted messages no longer remain stuck as queued or running after the app returns. (#5808, #5904, #5817) Thanks @mturac, @Siri-Ray.\n\n- **ACP histories no longer grow blank rows after refresh.** Empty status entries are removed while real tool activity remains available. (#5145) Thanks @xxiaoxiong.\n\n- **Windows devices with older processors can run OpenCode again.** Compatible builds now arrive through the normal update path instead of repeatedly crashing on launch. (#5733) Thanks @lefarcen.\n\n### 🖼️ Preview and interface\n\n- **Small visual signals tell the truth again.** Browser-extraction failures keep a visible red surface, the model picker stays on screen, and the Open Design Website Clone example loads its real logo with the first screen. (#5454, #5907, #5765) Thanks @xxiaoxiong, @lefarcen.\n\n## 🙏 Thanks to everyone who shipped 0.16.0\n\n@alchemistklk · @BusanGukbap · @cbeaulieu-gt · @EthanGuo-coder · @joeylee12629-star · @jzhishu · @lefarcen · @maxmilian · @mrcfps · @mturac · @MuduiClaw · @nettee · @PerishCode · @ScarletttMoon · @Siri-Ray · @tomsen02 · @VikingOwl91 · @wiggdevin · @xxiaoxiong · @yashrao2607\n",
  },
  {
    path: "design/docs/CHANGELOG/v0.15.0/en.md",
    kind: "release-notes",
    version: "0.15.0",
    markdown: "---\ntitle: Open Design 0.15.0\ndescription: Cost Less. Ship Faster. OD's DeepSeek Moment.\n---\n\n# Open Design 0.15.0 — Cost Less. Ship Faster. OD’s DeepSeek Moment\n\nOpen Design 0.15.0 optimizes the Design System Prompt to make everyday design tasks faster and more efficient. In representative evaluation runs, time to first token was **49.5% shorter**, end-to-end duration was **21.2% shorter**, and average input-token use was **25.1% lower**. The broader creative workflow is smoother too—from building and presenting decks, to cloning public websites from a URL, to understanding and recovering from failed tasks.\n\n## ✨ New\n\n### 🎞 Decks, Presentations, and Export\n\n- **Decks now feel like a workspace, not just a static preview.** Multi-page decks support thumbnail navigation, direct page selection, and keyboard navigation with the arrow, Home, and End keys—so you no longer have to hunt for controls.\n\n- **Speaker notes stay with the slide they belong to.** Read and edit notes alongside the current slide, save them in place, and view them in Presenter View without covering the audience-facing presentation.\n\n- **Present the way the moment calls for.** Enter an immersive presentation in the current tab or in full screen, then move backward or forward, pause, resume, or restart without losing deck state.\n\n- **Export the exact version you approved.** Download a specific file version as PDF, images, ZIP, or HTML without silently exporting the latest edits. Speaker notes are excluded from exported slides.\n\n### 🌐 Website Clone\n\n- **Start cloning a website with a URL, not a blank prompt.** Website Clone is now a first-class entry point on Home and in the Library: choose the capability, paste a public URL, and Open Design creates the project with the right context.\n\n- **The cloning process leaves an audit trail.** The workflow first inspects page structure, routes, assets, and interactions. The generated project retains NOTES.md-style documentation describing its approach, asset sources, and known differences.\n\n- **Results are both more useful and more responsible.** Generated sites are ready for local preview and do not carry over third-party analytics or advertising scripts. For complex targets such as login-walled sites, Open Design explains the limitations instead of pretending the clone is complete.\n\n### 💬 Motion and Examples\n\n- **Turn conversations into motion.** The new Chat Motion Overlay skill converts two-person conversations into animated chat overlays, with WeChat-, Telegram-, and Messenger-style containers plus transparent-output options for post-production.\n\n- **Find the right starting point faster from Home.** Website Clone now has a clearer entry point, ready-to-use examples, and prompts that begin with the target URL. Template and plugin cards also open the correct preview more reliably, so you can decide whether to use or remix them.\n\n## 🔁 Changed\n\n### 🧠 Tasks, Models, and Integrations\n\n- **A leaner Design System Prompt makes tasks respond faster.** By optimizing the Design System Prompt, representative evaluation runs showed a **49.5% reduction in time to first token**, a **21.2% reduction in end-to-end duration**, and **25.1% lower average input-token use**. Everyday design tasks now respond faster, use fewer tokens, and can be completed more efficiently.\n\n- **Failures now explain what happened and what to do next.** Missing local agents, oversized inputs, unavailable models or services, exhausted quotas, timeouts, empty output, save failures, and tool loops now provide more specific recovery paths.\n\n- **A completed task now means there is a real deliverable.** Runs that fail to generate or save usable project files are no longer shown as successfully completed.\n\n- **BYOK and third-party agent configuration is more accurate.** This release adds an Atlas Cloud preset; routes OpenAI-compatible endpoints through the compatible chat-completions path; keeps embedding and rerank models out of the chat model selector; and provides clearer configuration and runtime feedback for Kiro, Reasonix, Antigravity, Grok Build, and OpenRouter.\n\n- **Privacy choices are easier to understand.** Consent and settings screens now distinguish anonymous runtime metrics from redacted quality-review content more clearly, while analytics retain more useful provider and entry-point attribution.\n\n## 🐛 Fixed\n\n### 🛟 Recovery and Lifecycle\n\n- **Stopping work now stops the work behind it.** Deleting a conversation or project, or stopping a long-running task, cancels the corresponding run and child processes instead of allowing them to continue consuming time or quota.\n\n- **Retries and sessions now keep their proper boundaries.** Retries no longer inherit state from failed processes; expired native sessions reset truthfully; and the completion of a child agent no longer causes its parent task to appear finished too early.\n\n- **The desktop app now has a recovery path when the renderer fails.** Repeated renderer crashes open a recovery screen instead of triggering an endless reload loop, with an option to export diagnostic logs. Startup wait handling, download and save flows, and CLI cache scenarios are more reliable on Windows as well.\n\n### 🎨 Design Systems, Templates, and Localization\n\n- **Design system projects preserve more of your work.** Regeneration no longer discards user files, renamed workspace projects retain their names, Swift palette parsing is more reliable, and missing preview assets no longer leave the page at a dead end.\n\n- **The Library looks more like it should.** Plugin category counts and translations are more reliable, baked previews are less likely to mismatch their templates, deck previews keep the correct aspect ratio, and WebGL previews behave better when resized.\n\n- **The interface is more complete across languages.** Russian, Thai, Traditional Chinese, and other localized paths now cover more updated copy, reducing the chance of internal labels leaking into localized interfaces.\n\n### 🔒 Safer Boundaries\n\n- **External input now fails safely.** Brand extraction rejects unsafe local-network targets; corrupted asset streams and proxy interruptions no longer bring down the daemon; and design system parsing is more resilient to malformed input.\n",
  },
  {
    path: "design/docs/CHANGELOG/v0.14.1/en.md",
    kind: "release-notes",
    version: "0.14.1",
    markdown: "---\ntitle: Open Design 0.14.1\ndescription: Opt in to silent updates that are applied the next time Open Design starts.\n---\n\n## Silent updates\n\nYou can now allow Open Design to apply a downloaded update silently the next\ntime the app starts. Enable the option while installing an update or manage it\nlater in Settings.\n\nThe preference remains off until you explicitly confirm an installation. It\nonly affects the automatic update check performed at startup; periodic checks\nand manual installer actions keep their existing behavior.\n",
  },
];

/** Keyed by the abbreviation as written in the source markdown. */
export const CHANGELOG_COMMITS: Readonly<Record<string, ChangelogCommitRecord>> = {
  "12bfb81": {
    sha: "12bfb81773c4d7324da903a12c9be27bad3ad1bd",
    shortSha: "12bfb81",
    url: "https://github.com/Ding-Ding-Projects/material-designer/commit/12bfb81",
    date: "2026-08-03T10:02:26-04:00",
  },
  "187d216": {
    sha: "187d2168339ec50c51c8cbe5260ecfa270904122",
    shortSha: "187d216",
    url: "https://github.com/Ding-Ding-Projects/material-designer/commit/187d216",
    date: "2026-08-03T01:53:03-04:00",
  },
  "217610e": {
    sha: "217610e2836dd4bde82d1cc9062c6ba93566696d",
    shortSha: "217610e",
    url: "https://github.com/Ding-Ding-Projects/material-designer/commit/217610e",
    date: "2026-08-03T01:56:25-04:00",
  },
  "2567115": {
    sha: "2567115db0831cb29afb5587cf21ca98f3e8519c",
    shortSha: "2567115",
    url: "https://github.com/Ding-Ding-Projects/material-designer/commit/2567115",
    date: "2026-08-03T00:15:49-04:00",
  },
  "29c1476": {
    sha: "29c1476f5dd9aa50b363e6d506253cb8e4f60de5",
    shortSha: "29c1476",
    url: "https://github.com/Ding-Ding-Projects/material-designer/commit/29c1476",
    date: "2026-08-03T09:51:13-04:00",
  },
  "5ef7393": {
    sha: "5ef73934884da860b6f53bcd7cd495977b7e1f6a",
    shortSha: "5ef7393",
    url: "https://github.com/Ding-Ding-Projects/material-designer/commit/5ef7393",
    date: "2026-08-03T00:19:29-04:00",
  },
  "65e288f": {
    sha: "65e288f35bbb3253f9c2b2ea5c4fa75c9d224594",
    shortSha: "65e288f",
    url: "https://github.com/Ding-Ding-Projects/material-designer/commit/65e288f",
    date: "2026-08-03T00:53:18-04:00",
  },
  "a454a7b": {
    sha: "a454a7bef99fd4082f00d03c3ce5be0f965dcdad",
    shortSha: "a454a7b",
    url: "https://github.com/Ding-Ding-Projects/material-designer/commit/a454a7b",
    date: "2026-08-03T00:47:41-04:00",
  },
  "b5441b3": {
    sha: "b5441b3acbde2b1bf09ddd3e503e551304da4ea0",
    shortSha: "b5441b3",
    url: "https://github.com/Ding-Ding-Projects/material-designer/commit/b5441b3",
    date: "2026-08-03T01:42:58-04:00",
  },
  "b8dc87d": {
    sha: "b8dc87dc1a7946e3360a765a63e5e8168e076b46",
    shortSha: "b8dc87d",
    url: "https://github.com/Ding-Ding-Projects/material-designer/commit/b8dc87d",
    date: "2026-08-03T00:25:39-04:00",
  },
  "c2ca744": {
    sha: "c2ca744b248cdaba195ce6e882085ce3b384d85b",
    shortSha: "c2ca744",
    url: "https://github.com/Ding-Ding-Projects/material-designer/commit/c2ca744",
    date: "2026-08-03T01:42:35-04:00",
  },
  "cbd6a14": {
    sha: "cbd6a149b86854aea0e4a088da0c8fb24c824c47",
    shortSha: "cbd6a14",
    url: "https://github.com/Ding-Ding-Projects/material-designer/commit/cbd6a14",
    date: "2026-08-03T01:41:53-04:00",
  },
  "d7d3698": {
    sha: "d7d36980116d278f1c0efd8257db139ac16681b0",
    shortSha: "d7d3698",
    url: "https://github.com/Ding-Ding-Projects/material-designer/commit/d7d3698",
    date: "2026-08-03T09:41:31-04:00",
  },
  "dea6b0a": {
    sha: "dea6b0a5b56bf6726bf284f722f5aff85b0b558a",
    shortSha: "dea6b0a",
    url: "https://github.com/Ding-Ding-Projects/material-designer/commit/dea6b0a",
    date: "2026-08-03T11:24:26-04:00",
  },
  "ec46f83": {
    sha: "ec46f8364fb3a7f371fb28cd8fa927da370250cb",
    shortSha: "ec46f83",
    url: "https://github.com/Ding-Ding-Projects/material-designer/commit/ec46f83",
    date: "2026-08-03T10:00:25-04:00",
  },
  "fb8ba8c": {
    sha: "fb8ba8c41d3d706e1fe355a5cccdf64bba797a2e",
    shortSha: "fb8ba8c",
    url: "https://github.com/Ding-Ding-Projects/material-designer/commit/fb8ba8c",
    date: "2026-08-03T09:57:43-04:00",
  },
};

/**
 * Abbreviations a source references that this repository does not contain.
 * The viewer says so on the entry instead of linking somewhere that 404s.
 */
export const CHANGELOG_UNRESOLVED_COMMITS: readonly string[] = [
];
