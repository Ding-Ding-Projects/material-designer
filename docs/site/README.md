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
| `site/index.html` | The single page every tab and panel lives in. Each panel is a `<section data-tab-panel="…">` that the tab strip shows and hides, so navigation never costs a request. Its text is marked up with the `data-i18n` contract that `i18n.js` resolves on load; the English wording in the markup is the fallback, not the source of truth. |
| `site/assets/css/tokens.css` | The Material Design 3 token layer — colour roles, typography, shape and motion scales — as custom properties. |
| `site/assets/css/app.css` | The component styles, which consume those tokens rather than restating literal values. |
| `site/assets/js/i18n.js` | Language modes (`en`, `yue`, `bilingual`, bilingual being the default), the two independent 1–5 funny levels, and the string catalogue. Voice changes with the level; facts do not. |
| `site/assets/js/appearance.js` | Persisted theme, density, seed colour and UI scale, plus the colour translator and its contrast readout. |
| `site/assets/js/tabs.js` | The tab strip: rendering, reordering, pinning, the overflow surface, the searchable tab list, persistence and the ARIA relationships. |
| `site/assets/js/regex.js` | The pattern builder, mounted as a popover **anchored beside one specific field**, one instance per field. |
| `site/assets/js/ui.js` | Toasts, the notification centre, the command palette, and the dim sum draw on load. |
| `site/assets/js/toy-locks.js` | The representative site-local toy lock: exact six-policy registry, protected-action interception, anchored authentication prompt, shared keypad/manual PIN path, browser-local attempt budget, and fail-closed non-extractable TOTP key storage. |
| `site/assets/js/main.js` | The wiring, and the only module the page loads directly. It introduces the modules above to each other and to the markup, and deliberately holds no feature logic of its own — so a reader asking how the regex builder works goes to `regex.js` rather than finding half the answer here. |
| `scripts/verify-site-metadata.ps1` | Local check for the complete Open Graph metadata set and absolute image URL. It reports the checked-in state and never publishes. |
| `site/.nojekyll` | Disables the publisher's default templating so paths beginning with `_` are served as they are. |

`site/assets/dim-sum/` is not in that table because it is not committed under
`site/`. The catalogue lives at the repository root, where the application and
the release workflow also read it, and the `Pages` workflow copies it into the
artifact at publish time — one copy in git, and a path that still resolves for a
visitor.

## Standards this surface cannot fully satisfy, and why

Recorded here rather than left as a silent gap, as
[../standards/README.md](../standards/README.md) requires.

| Standard | Position on this surface |
| --- | --- |
| Tab **grouping** and the two **bulk-close** actions | Not applicable. The site has a fixed set of permanent sections, so there is nothing to group them into, and closing one would make part of the documentation unreachable with no way to reopen it. |
| Tab-discovery searches **2, 3 and 4** (inside a group, across group names, across every open tab) | Not applicable for the same reason — there are no groups to search inside of and no second window to search across. Search **1**, over the current strip, is required and present. |

Every other standard applies in full and is tracked in that standard's own file.

## Site-local toy-lock boundary

The Settings surface includes one real protected example action. Activating its
unavailable-looking control opens an anchored authentication prompt and cannot
run the protected action until every factor in the selected policy matches. The
six available policies are PIN, password, PIN plus password, password plus TOTP,
PIN plus TOTP, and password plus PIN plus TOTP. The access-control keypad and
manual PIN field share one validator and one persistent five-attempt budget.

This is deliberately a playful browser-local speed bump, not encryption or an
access-control boundary. Clearing this site's browser storage removes the lock.
PINs and passwords are not retained as plaintext. TOTP uses a non-extractable
Web Crypto key stored by IndexedDB, and TOTP policies fail closed when that
browser facility is unavailable. The implementation is representative rather
than universal: every-element coverage and deployed interaction evidence remain
open and are recorded as partial in the UI-drive inventory.

## Suggested reading

- [pages-deployment.md](pages-deployment.md) — the workflow and its publish-time gate
- [../build/ci.md](../build/ci.md) — the other two workflows at the repository root
- [../standards/tabs.md](../standards/tabs.md) — the tab requirements this surface implements and the two it records as inapplicable
- [../standards/releases.md](../standards/releases.md) — the release whose installer the site's download button must point at
