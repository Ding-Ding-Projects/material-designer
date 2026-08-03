# Site

The documentation and landing site: what it publishes, what it is built from,
and the workflow that deploys it.

> [!NOTE]
> **The site is published** at <https://ding-ding-projects.github.io/material-designer/>,
> deployed by `.github/workflows/pages.yml`. The deployment was verified by
> request rather than assumed: the page, both stylesheets, `main.js`, the dish
> catalogue and a dish photograph all return 200, and the served HTML contains
> no unresolved translation keys.
>
> Two things a reader should know about how it got there. GitHub Pages had never
> been configured on this repository, so the first deployment failed with a 404
> from the Pages API — enabling Pages with Actions as its source is a one-time
> repository setting, not something the workflow can do for itself. And the dish
> catalogue lives at the repository root, outside what Pages publishes, so the
> workflow stages it into the artifact; a page addressing `../assets/…` would
> have 404'd for every visitor.

## Files in this category

| File | What it covers |
| --- | --- |
| [pages-deployment.md](pages-deployment.md) | The `Pages` workflow: what it uploads, the self-contained-assets gate and what each of its six checks catches, the base-path trap that makes a green deployment 404, the installer-download-button rule, and how to verify a published site. |

## Why the site has its own category

The site is a **user-facing surface**, so every standard under
[../standards/](../standards/) binds it individually — the three language modes,
both funny-level sliders, Material Design 3 conformance, runtime appearance
customization, browser-style tabs, a regex builder on every search field,
non-blocking notifications, the accessibility and sizing rules, the dim sum
surprise, and the bundled-assets prohibition. "It is only docs" is not an
exemption, and neither is the settings page inside it.

That is also why it does not live inside [../build/](../build/): the build
category is about producing an installer, and the site is a product of its own
with its own conformance obligations.

## What `site/` is built from

No build step, no bundler, no package manager. The site is plain static files, so
previewing it means opening a file — a site that needs a toolchain to preview is
a site nobody previews before publishing.

| Path | What it is |
| --- | --- |
| `site/assets/css/tokens.css` | The Material Design 3 token layer — colour roles, typography, shape and motion scales — as custom properties. |
| `site/assets/css/app.css` | The component styles, which consume those tokens rather than restating literal values. |
| `site/assets/js/i18n.js` | Language modes (`en`, `yue`, `bilingual`, bilingual being the default), the two independent 1–5 funny levels, and the string catalogue. Voice changes with the level; facts do not. |
| `site/assets/js/appearance.js` | Persisted theme, density, seed colour and UI scale, plus the colour translator and its contrast readout. |
| `site/assets/js/tabs.js` | The tab strip: rendering, reordering, pinning, the overflow surface, the searchable tab list, persistence and the ARIA relationships. |
| `site/assets/js/regex.js` | The pattern builder, mounted as a popover **anchored beside one specific field**, one instance per field. |
| `site/assets/js/ui.js` | Toasts, the notification centre, the command palette, and the dim sum draw on load. |
| `site/.nojekyll` | Disables the publisher's default templating so paths beginning with `_` are served as they are. |

No HTML file appears in that table because none exists — see the note at the top
of this page. Every stylesheet and script above is present with nothing to load
it; authoring the pages is outstanding work, not an omission from this table.

## Standards this surface cannot fully satisfy, and why

Recorded here rather than left as a silent gap, as
[../standards/README.md](../standards/README.md) requires.

| Standard | Position on this surface |
| --- | --- |
| Tab **grouping** and the two **bulk-close** actions | Not applicable. The site has a fixed set of permanent sections, so there is nothing to group them into, and closing one would make part of the documentation unreachable with no way to reopen it. |
| Tab-discovery searches **2, 3 and 4** (inside a group, across group names, across every open tab) | Not applicable for the same reason — there are no groups to search inside of and no second window to search across. Search **1**, over the current strip, is required and present. |

Every other standard applies in full and is tracked in that standard's own file.

## Suggested reading

- [pages-deployment.md](pages-deployment.md) — the workflow and its publish-time gate
- [../build/ci.md](../build/ci.md) — the other two workflows at the repository root
- [../standards/tabs.md](../standards/tabs.md) — the tab requirements this surface implements and the two it records as inapplicable
- [../standards/releases.md](../standards/releases.md) — the release whose installer the site's download button must point at
