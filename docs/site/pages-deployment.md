# Publishing the site

The third workflow at the repository root, `.github/workflows/pages.yml`, deploys
`site/` to GitHub Pages and refuses to publish a site that would reach the
network for an asset.

> [!NOTE]
> **The site is deployed.** The workflow has run and published the site at the
> repository-scoped Pages URL recorded in [README.md](README.md). The deployment
> was checked by request rather than assumed: the page, both stylesheets,
> `main.js`, the dish catalogue and a dish photograph each returned 200, and the
> served HTML carried no unresolved translation keys.
>
> Two things that run did **not** demonstrate, and which this page therefore does
> not claim: the self-contained gate has never been observed rejecting anything,
> and nothing on the published page has been driven — the tab strip, the language
> modes, the sliders, the appearance controls and the regex builder are known to
> be in the served markup, not known to work in a browser.
>
> Everything else below describes the committed workflow definition, read from
> the file. Where this page states a run outcome it says so explicitly.

## Behaviour

### What it publishes

The directory `site/`, exactly as it is. There is no build step: the site is
static HTML, CSS and JavaScript, so the workflow checks it, uploads it as a Pages
artifact and deploys it.

| Step | What it does |
| --- | --- |
| Checkout | Plain checkout. No submodule — the site does not read `design/`. |
| Check the site is self-contained | Six `grep` sweeps over `site/`. Any hit fails the job. |
| Stage the dish catalogue | Copies `assets/dim-sum/` into `site/assets/dim-sum/`. The catalogue lives at the repository root because the application and the release workflow use it too, and only `site/` is published — a page addressing `../assets/…` would 404 for every visitor. A missing catalogue warns and continues rather than failing the deployment. |
| Configure Pages | Resolves the site's base URL for the deployment. |
| Upload site | Uploads `site/` as the Pages artifact. |
| Deploy | Publishes it and records the resulting URL on the run. |

### Front-screen version provenance

The site source keeps the front-screen identity fields empty and displays an
explicit unavailable state until publication data is available. The Pages
workflow paginates published releases, dereferences each tag to its actual
commit, and selects only the release whose actual commit is the exact deployed
commit. It downloads that release's `build-provenance.json`, validates the
package version, source commit, and timestamp, and injects the tuple into the
temporary Pages payload, including the visible version, timestamp, and status
nodes so the no-JavaScript HTML agrees with the data attributes. A push deployment that races release publication
therefore remains honestly unavailable, while the subsequent publication event
refreshes the same deployment with the exact matching release data. No
visitor-time clock or hand-entered release fact is used.

The substitution helpers count their full matching lines before and after every
replacement. Installer links require exactly two immutable URLs, and each
visible provenance field requires exactly one source and one resulting value.
The committed `scripts/test-front-screen-provenance-pages-fixture.sh` extracts
and executes those workflow helpers against a temporary copy of `site/index.html`,
then proves missing and wrong markers turn the helper red.

For the metadata contract, `scripts/verify-site-metadata.ps1` checks the
checked-in HTML for one complete Open Graph set, an absolute HTTPS image URL,
image dimensions, alt text, `summary_large_image`, and a non-empty theme
colour. `scripts/verify-published-site.ps1` performs the same checks against a
published HTTPS URL and fetches the image anonymously. These helpers report
what they observed and do not publish or mutate the site. The checked-in page
must remain honest when a release tuple or social preview is not available.

### The self-contained-assets gate

Standard 15 forbids CDN scripts, remote stylesheets, remote fonts, remote images
and third-party tracking on every surface, the site included. That rule is
**enforced at publish time rather than trusted**, because it is the kind of rule
that holds for a year and then breaks in one convenient commit.

Each check names one way a remote resource gets loaded:

| Files | What it catches |
| --- | --- |
| `*.html` | `<script src="https://…">` — a remote script |
| `*.html` | `<link href="https://…">` — a remote stylesheet, which is how a web font usually arrives |
| `*.html` | `<img src>` / `<source src>` / `srcset` pointing at `https://` — a remote image |
| `*.css` | `@import url(https://…)` — a remote stylesheet imported from CSS |
| `*.css` | `url(https://…)` — a remote font file, background image or mask |
| `*.js` | `fetch(`, `new XMLHttpRequest(`, `new WebSocket(` called with an `https://` literal — a runtime request |

**Ordinary hyperlinks in prose are deliberately not matched.** `<a href="https://…">`
is a link the reader chooses to follow, not an asset the page loads without
asking, and a gate that blocked those would be uselessly noisy. The distinction
is between what the page *fetches* and what the page *points at*.

A failing check prints the matching file and line through a workflow error
annotation, so the offending path is visible on the run summary without opening
logs.

### The base-path trap

A fork publishes under a repository-scoped path — `https://<owner>.github.io/<repo>/` —
because a custom domain is verified to exactly one repository and any second
repository asking for it is refused.

A site whose asset URLs are absolute from the root therefore breaks in the most
misleading way available: **the build goes green, the deployment succeeds, and
every page returns 404**. Nothing in the run says anything is wrong, because from
the pipeline's point of view nothing was.

Two consequences:

- Reference assets relatively (`assets/css/app.css`), or make the base path a
  configurable value and verify the built output actually carries the prefix.
- **Never conclude the site works because its workflow passed.** Open a page.
  This is recorded in ROADMAP 1.3 as well, because it is the single easiest way
  to ship a broken site while believing it shipped.

### The installer download button

When a verified release exists, the site's home page carries a direct, clearly
labelled installer download button:

- built from the **immutable release asset URL** of a published release, never a
  guessed or predicted one;
- stating the version and the platform;
- keyboard-operable and screen-reader named, like any other control;
- and **absent entirely** until publication is verified. A button pointing at a
  release that does not exist is worse than no button, because it fails after the
  click rather than before it.

The checked-in source has no active installer button or release facts. The
workflow injects the immutable release-asset URL, version, architecture and
download size only after it reads a published release. Until then, the pending
anchors stay hidden and the visible fields say `Unavailable`.

It deliberately does **not** point at a `latest` redirect. A moving link makes
the checksum printed next to it meaningless, because the file behind it can
change without the page changing. See
[../standards/releases.md](../standards/releases.md).

## Configuration

| Setting | Value | Why |
| --- | --- | --- |
| Triggers | Every push, published release, and manual dispatch | A published release event refreshes version-bound facts after a push deployment race |
| Runner | `[self-hosted, linux, material-designer]` | Dedicated project runner; the workflow cleans the checkout and verifies `gh`, `jq`, Bash and its static-site text utilities before publishing |
| Permissions | `contents: read`, `pages: write`, `id-token: write` | The minimum the Pages deployment action needs |
| Concurrency | group `pages`, `cancel-in-progress: false` | A deployment cancelled midway can leave a partially published site; queue instead |
| Environment | `github-pages`, with the deployment URL recorded as its output | The published URL is read off the run rather than assumed |

**The Pages site must be enabled in the repository settings before the first
run.** A missing site setting fails the deployment in a way that reads like a
broken build and is actually one repository setting.

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| `site/ does not exist yet; nothing to deploy.`, exit 1 | The workflow ran with no `site/` directory | Deliberate. A silent success on a missing directory would publish nothing and report a green tick. |
| `::error::site/ loads a remote script` (or stylesheet, image, CSS asset, external request) | Standard 15 violated | Bundle the asset locally. Do not weaken the pattern to let it through. |
| The workflow is green and every page 404s | Absolute asset URLs with a repository-scoped base path | See the base-path trap above. Open a page before believing a deployment. |
| The deployment step fails before uploading | GitHub Pages not enabled for the repository | Enable it in the repository settings; it is a setting, not a code defect. |
| The site's root shows a directory listing or a 404 | No `index.html` at the root of `site/` | The workflow does not check for one, because uploading a partial site during development is legitimate. `site/index.html` is present, so this is a hazard to avoid reintroducing rather than a current fault. |
| The startup dish never appears and the catalogue 404s | The staging step warned instead of copying — no `assets/dim-sum/index.json` at the repository root | Deliberate: a missing dish catalogue is a degraded surprise, not a reason to refuse to publish documentation. Restore the catalogue at the root; do not add a second copy under `site/`. |
| A file beginning with `_` is not served | Default static-site templating | `.nojekyll` exists to prevent exactly this; do not delete it. |

## Security considerations

- **Publishing is public and irreversible in practice.** Anything committed under
  `site/` becomes a public URL. The repository-wide rule against private paths,
  hostnames, addresses, usernames and credentials applies with no exceptions
  here, because this is the surface most likely to be read by a stranger.
- **The self-contained gate is also a privacy control.** A remote font or a CDN
  script tells a third party who visited the page. That is why the rule is
  enforced at publish time rather than reviewed by eye.
- **`contents: read` only.** The deployment cannot write to the repository, so a
  compromised site build cannot rewrite the tree that produced it.
- **`id-token: write` is required by the Pages deployment action** to mint the
  OIDC token that authorises the deployment. It grants nothing else, and no
  secret is passed to any step in this workflow.
- **Nothing from `design/` is published by this workflow.** The site is written
  by this project; the vendored tree is not deployed here.

## Verification

**Observed from a run:** the workflow deployed, and the published URL was then
checked by request. The page itself, `assets/css/tokens.css`,
`assets/css/app.css`, `assets/js/main.js`, the staged dish catalogue and one dish
photograph each returned 200 under the repository-scoped base path, and the
served HTML contained no unresolved translation keys. The first attempt failed
before uploading anything, because GitHub Pages had never been enabled on the
repository — a one-time repository setting, not something the workflow can do for
itself.

**Verified from the tree:** that `.github/workflows/pages.yml` exists; that it
uploads `site/`; that it runs six self-contained checks over `*.html`, `*.css`
and `*.js`; that its permissions and concurrency are as tabulated above; and that
`site/` contains `index.html`, `assets/css/{tokens,app}.css`,
`assets/js/{main,i18n,appearance,tabs,regex,ui}.js` and `.nojekyll`.

**Not observed:** the gate rejecting anything, and any behaviour of the published
page. Nothing on the deployed site has been driven in a browser — the controls
are known to be in the served markup, not known to work — and the page has not
been rendered at any display scale other than whatever the by-request check used.

What a run has already demonstrated:

- [x] `Pages` passing and deploying
- [x] the published URL serving its page, with the stylesheets, `main.js`, the
      staged dish catalogue and a dish photograph all resolving under the
      repository-scoped base path
- [x] the installer download button resolving to the immutable asset URL of a
      published release rather than a `latest` redirect

What is still outstanding, and must not be read as passing:

- [ ] `Pages` failing on a deliberately introduced remote asset — a `<link>` to a
      web font is the realistic case
- [ ] the tab strip, the language modes, both funny-level sliders, the appearance
      controls and the anchored regex builder working on the published page, not
      only in the local harness
- [ ] the page rendering correctly at 100/125/150/200% display scale and at the
      narrowest supported width, in bilingual mode where labels are longest

The failing case matters as much as the passing one: a gate nobody has seen
reject anything is not known to be a gate.

## Suggested reading

- [README.md](README.md) — what the site is built from, and the two standards it records as inapplicable
- [../build/ci.md](../build/ci.md) — `Verify` and `Release`, the other two root workflows
- [../standards/material-design-3.md](../standards/material-design-3.md) — the token layer the site's CSS consumes
- [../standards/regex-builder.md](../standards/regex-builder.md) — why each search field owns its own builder instance
- [../standards/accessibility.md](../standards/accessibility.md) — the scale and width matrix the published page must hold at
