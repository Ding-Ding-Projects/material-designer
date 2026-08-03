# All assets are bundled locally

**Standard 15.** No script, stylesheet, font or image is fetched from a
third-party origin, and no analytics or third-party tracking ships — in the
application, on the landing page, and on the documentation site alike.

> [!IMPORTANT]
> **Status: not met in the application, met on the documentation site.** The
> interface loads a font family from a third-party font service, and the preview
> runtime fetches a JavaScript framework and a compiler from a public package
> mirror. The design mockup loads three further font families the same way. The
> exact locations are named below, because a requirement stated without its
> current violations is a requirement nobody can act on.

## The requirement

**No third-party network origin** for scripts, stylesheets, fonts or images. **No
analytics, no third-party tracking**, of any kind.

This applies to every surface individually: the application, the landing page and
the documentation site. "It is only the documentation site" is not an exemption —
a documentation site is a surface a user visits, and a font request from it
discloses exactly as much as one from the application.

The obligation is on **runtime fetches**. Vendoring a third-party font, script or
image into the repository and serving it from the product is exactly what this
standard asks for; the prohibition is on the request leaving the machine, not on
the provenance of the file.

## Why

**It is a privacy control, not a performance one.** A font request to a
third-party origin discloses the user's network address, the fact that they
launched the application, and roughly how often — to a company that is not party
to the transaction. For a product whose entire selling point is that everything
stays on the machine, that is a contradiction rather than an optimisation.

**It is a correctness property for a local-first product.** An application that
needs the network to render its own text does not work on a plane, on a locked-
down network, or behind a firewall that has not been told about the font service.
The failure is also ugly rather than absent: text reflows into a fallback face
part-way through startup, so the product looks broken rather than offline.

**It is a supply-chain boundary.** A stylesheet or script fetched at runtime from
somewhere else is code the product executes and does not control, changed by
someone else, at a time of their choosing, with no review and no pinning. The
same file vendored into the repository is reviewed once and changes only when
somebody commits a change.

**It is a determinism property.** A build whose output depends on what a remote
origin served that day is a build that cannot be reproduced.

## Current implementation status

Checked in the working tree at commit `dea6b0a` by searching for third-party
origins in the interface source, the mockup and the site.

| Surface | Status |
| --- | --- |
| **The application — fonts** | **Not met.** `design/apps/web/src/index.css` opens with an `@import` of a font family from a third-party font service. It is the first line of the stylesheet, so it is fetched on every launch. |
| **The application — preview runtime** | **Not met.** The runtime that renders a preview of a generated component fetches a JavaScript framework, its DOM package and a standalone compiler from a public package mirror at runtime — see `design/apps/web/src/runtime/react-component.ts` and the equivalent script tags in `design/apps/web/src/components/DesignSystemFlow.tsx`. |
| **The application — analytics** | **Unaudited.** No request audit of a running build has been performed. |
| **The mockup** | **Not met, by design-file convention.** It loads two text faces and an icon face from a third-party font service. A mockup is not a shipped surface, but this is the source the port copies from, so the violation transfers unless it is deliberately removed. |
| **The documentation site** | **Met.** The site's markup contains no third-party asset reference; its external URLs are anchors to the project's own repository and release assets, which are navigations the user chooses, not requests the page makes. |
| **The site's publish-time gate** | **Implemented.** The deployment workflow enforces self-contained assets before publishing — see [../site/pages-deployment.md](../site/pages-deployment.md). |

### The preview-runtime case is the hard one

The font violations have an obvious fix: vendor the faces and serve them from the
product. `ROADMAP.md` §2.2 tracks exactly that.

The preview runtime is genuinely harder, and it is worth being precise about why
rather than filing it beside the fonts:

- The feature renders a **generated component** inside a sandboxed preview. To
  run, that component needs a framework and, for source that has not been
  compiled, a compiler.
- Those are large, and they are only needed by that one feature — so bundling
  them costs every user of the product download size for a feature many will not
  open.
- The generated artifacts themselves may legitimately reference third-party
  resources, because they are the *user's* content rather than the product's
  chrome. The interface already maintains an allowlist of font origins for
  parsing such artifacts, with an explicit note that a loose match would let a
  hostile URL impersonate an allowed origin — which is the right instinct
  applied to a genuinely different problem.

The standard still applies to the product's own runtime. The resolution is to
bundle the framework and compiler with the product, or to make the preview
feature's dependency an explicit, user-visible, opt-in network use — not to leave
an unannounced fetch on a path the user reaches by clicking a preview button.
Whichever route is taken, it is a decision that must be recorded rather than
inherited.

## Configuration

**There is no setting.** A switch that permits remote assets would defeat the
purpose, and a switch that forbids them implies the default does not.

The only related configuration is the honest one: where a feature genuinely
requires the network — a preview that fetches a framework, a link the user
clicked — that requirement is **stated at the point of use**, and the user
chooses.

| Case | Treatment |
| --- | --- |
| Product chrome — fonts, icons, styles, scripts | Bundled. Never fetched. |
| An anchor the user clicks | Not an asset fetch. Permitted, and it opens externally. |
| A feature that genuinely needs a remote resource | Explicit, visible, and declining it leaves the feature unavailable rather than silently broken. |
| User content that references remote resources | The user's data, rendered in a sandbox. Not the product's chrome, and not covered by this standard — but it must not be able to reach the product's own privileges. |

## Failure modes

| Failure | Consequence |
| --- | --- |
| A font loaded from a third-party origin | Discloses every launch to that origin, and reflows the interface on a slow network. |
| A stylesheet or script loaded from a package mirror | Executes code the product does not control and cannot pin. |
| Any analytics | Forbidden outright. |
| A "just this once" remote asset in a new feature | The audit passes on the day it is added and the requirement quietly stops being true. |
| The documentation site treated as exempt | Every surface individually. A docs site leaks the same information. |
| The mockup's font links ported faithfully | The violation transfers into the product along with the design it was drawn in. |
| A remote asset with no local fallback | The product renders wrongly rather than differently when offline. |
| An allowlist matched loosely | A hostile origin whose hostname *contains* an allowed one is accepted. |

## Security considerations

- **A runtime fetch is remote code execution by consent.** A script or stylesheet
  from another origin runs with whatever privileges the loading context has. This
  is the whole argument for vendoring, and it does not weaken because the origin
  is well known.
- **Origin allowlists must match exactly.** A substring or suffix match accepts
  a hostname that merely *contains* the allowed one. The interface's own parser
  carries a note about this exact trap; wherever an allowlist is added, match the
  full host.
- **User content rendered in a preview is untrusted.** It may reference anything.
  Sandbox it so it cannot reach the product's storage, credentials, or daemon,
  and never let the sandbox's needs justify relaxing the product's own asset
  rules.
- **A request audit is the cheapest security check this project has.** It runs in
  seconds, needs no instrumentation beyond the platform's own network log, and
  catches a regression that no unit test will ever see.

## Verification

**Partially verified, by source inspection only.** The violations above were
found by searching the tree. **No request audit of a running build has been
performed**, so the list is a lower bound: it names what is visible in source and
cannot rule out a fetch constructed at runtime.

Conformance requires all of:

- [ ] a **request audit of a running build** showing zero third-party origins for
      the application's own chrome — run on every build, because this is the
      check that catches regressions
- [ ] the same audit for the landing page and the documentation site,
      individually
- [ ] the font `@import` removed from the interface stylesheet and the faces
      served from the product
- [ ] the preview runtime's framework and compiler either bundled, or made an
      explicit opt-in network use with the requirement stated at the point of use
- [ ] the mockup's font links either removed or clearly marked as not portable,
      so the port does not inherit them
- [ ] no analytics or third-party tracking anywhere, verified by the same audit
- [ ] a build performed with the network disabled, rendering correctly
- [ ] every origin allowlist in the tree matching full hostnames, never
      substrings
- [ ] the site's publish-time self-contained-assets gate kept in place and
      extended to any new asset kind

The offline-build test is the one that cannot be gamed. A request audit shows
what was requested; running with no network shows what the product actually needs.

## Suggested reading

- [material-design-3.md](material-design-3.md) — the fonts and icon face this standard governs, and the token layer that consumes them
- [dim-sum-surprise.md](dim-sum-surprise.md) — the most visible instance of the bundled-assets rule, and why its images are copied byte-for-byte
- [../site/pages-deployment.md](../site/pages-deployment.md) — the publish-time gate that enforces this on the documentation site
- [../architecture/overview.md](../architecture/overview.md) — the local-first posture this standard exists to protect
- `ROADMAP.md` §2.2 — the tracked work item for local fonts and the icon face
