# Security policy

## Reporting a vulnerability

Use **GitHub's private vulnerability reporting** on this repository
(*Security → Report a vulnerability*). Do not open a public issue for
anything exploitable — a public report is a disclosure, not a report.

You can expect an acknowledgement on the advisory thread, and the fix — when
one ships — to be named in the release notes of the release that carries it,
with its commit linked. No fix is announced before it is actually published.

## Supported versions

Only the **latest published release** receives fixes. Releases here are
frequent and each one carries the full application, so updating is the
mitigation for anything already fixed.

## Scope, honestly stated

- **This repository's own surface** — the workflows under `.github/`, the
  scripts under `scripts/`, the site under `site/`, and the declared
  modifications listed in `MODIFICATIONS.md` — is where a report is most
  actionable here.
- **The imported tree under `design/` is upstream's code, kept byte-verbatim.**
  A vulnerability found there through a build of this project should still be
  reported here first — our builds ship that code — but the fix may need to
  land upstream, and we will say so on the advisory rather than sitting on it.

## Positions worth knowing before reporting

- **Installers are not code-signed.** The operating system's reputation
  prompt on first run is expected behaviour and documented in every release's
  notes, not a compromise indicator.
- **No telemetry credential is configured anywhere in this repository.** The
  upstream analytics code paths are present verbatim and are no-ops without a
  destination key; builds from here transmit nothing on that channel. This is
  deliberately stated as "no key is configured", not "telemetry was removed".
- **The daemon binds loopback only by default** (port 7456). Exposure beyond
  loopback requires explicit host and allowed-origin configuration; a report
  that assumes a public bind should check the configuration first.
