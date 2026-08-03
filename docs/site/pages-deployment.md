# Publishing the site

The third workflow at the repository root, `.github/workflows/pages.yml`, deploys
`site/` to GitHub Pages and refuses to publish a site that would reach the
network for an asset.

> [!IMPORTANT]
> **No deployment has been observed.** Everything below describes the committed
> workflow definition, read from the file. No run outcome, no published URL and
> no page render is claimed anywhere in this repository.

## Behaviour

### What it publishes

The directory `site/`, exactly as it is. There is no build step: the site is
static HTML, CSS and JavaScript, so the workflow checks it, uploads it as a Pages
artifact and deploys it.

| Step | What it does |
| --- | --- |
| Checkout | Plain checkout. No submodule — the site does not read `design/`. |
| Check the site is self-contained | Six `grep` sweeps over `site/`. Any hit fails the job. |
| Configure Pages | Resolves the site's base URL for the deployment. |
| Upload site | Uploads `site/` as the Pages artifact. |
| Deploy | Publishes it and records the resulting URL on the run. |

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

No release exists yet, so no button exists yet. See
[../standards/releases.md](../standards/releases.md).

## Configuration

| Setting | Value | Why |
| --- | --- | --- |
| Triggers | Pushes to the default branch touching `site/**` or the workflow file; plus manual dispatch | A docs deployment should not run on every unrelated commit |
| Runner | `ubuntu-latest` | Standard hosted runner; there is no reason for a self-hosted one here |
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
| The site's root shows a directory listing or a 404 | No `index.html` in `site/` | Present as this was written. The workflow does not check for one, because uploading a partial site during development is legitimate. |
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

**Verified from the tree while writing this page:** that
`.github/workflows/pages.yml` exists; that it uploads `site/`; that it runs six
self-contained checks over `*.html`, `*.css` and `*.js`; that its permissions and
concurrency are as tabulated above; and that `site/` contains
`assets/css/{tokens,app}.css`, `assets/js/{i18n,appearance,tabs,regex,ui}.js` and
`.nojekyll` — **no `index.html`, and in fact no HTML file at all**. A deployment
today would publish stylesheets and scripts with nothing to load them.

**Not verified:** anything about a deployment. The workflow has not been observed
running, no URL has been published, and no page has been rendered from a
published artifact.

The site will be considered proven when a single run demonstrates all of:

- [ ] `Pages` failing on a deliberately introduced remote asset — a `<link>` to a
      web font is the realistic case
- [ ] `Pages` passing on the corrected tree
- [ ] the published URL loading its home page, with every stylesheet, script,
      font and image resolving under the repository-scoped base path
- [ ] the tab strip, the language modes, both funny-level sliders, the appearance
      controls and the anchored regex builder working on the published page, not
      only in the local harness
- [ ] the page rendering correctly at 100/125/150/200% display scale and at the
      narrowest supported width, in bilingual mode where labels are longest
- [ ] the installer download button appearing only once a verified release exists,
      and resolving to that release's immutable asset URL

The failing case matters as much as the passing one: a gate nobody has seen
reject anything is not known to be a gate.

## Suggested reading

- [README.md](README.md) — what the site is built from, and the two standards it records as inapplicable
- [../build/ci.md](../build/ci.md) — `Verify` and `Release`, the other two root workflows
- [../standards/material-design-3.md](../standards/material-design-3.md) — the token layer the site's CSS consumes
- [../standards/regex-builder.md](../standards/regex-builder.md) — why each search field owns its own builder instance
- [../standards/accessibility.md](../standards/accessibility.md) — the scale and width matrix the published page must hold at
