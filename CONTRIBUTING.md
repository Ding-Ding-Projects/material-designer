# Contributing

Thanks for looking at this project. It is an unusual repository — a rebranded,
Material Design 3 fork of an upstream monorepo whose tree is kept **verbatim
and machine-verified** — and the two rules below exist so a contribution does
not fight the machinery. Everything else is ordinary.

## The two hard invariants

1. **`design/` is a byte-verbatim copy of upstream, and every exception is
   declared.** Any edit to a file under `design/` — including adding or
   deleting one — needs a matching entry in [`MODIFICATIONS.md`](MODIFICATIONS.md)
   under a **Changed files** heading, listing each path relative to `design/`.
   `scripts/verify-port.sh` enforces this on every push: an undeclared change
   fails, and a declaration whose file no longer differs also fails. Do not
   loosen the verifier; it is the Apache-2.0 §4(b) notice being kept honest.

2. **Building happens in continuous integration, not on your machine.** The
   workspace needs a native compile, an Electron toolchain and a packaging
   step; the supported path is the hosted runner. Local work is editing files
   and running the pure-shell verifier — which is the one check with no
   toolchain dependency:

   ```bash
   bash scripts/verify-port.sh
   ```

   Evidence for any claim is a CI run link, not a local transcript.

## Making a change

- Read [`AGENTS.md`](AGENTS.md) first — it carries the full standards for this
  repository, and [`ROADMAP.md`](ROADMAP.md) shows what is already planned.
- Keep changes scoped. A mechanical move and a behaviour change belong in
  separate commits.
- Update the documentation that describes what you changed **in the same
  change** — `docs/`, `CHANGELOG.md`, and the roadmap line your work closes.
  A claim of "done" needs the run, artifact or output that proves it.
- Commit messages here are bilingual — a concise English subject and body,
  with a Hong Kong Cantonese counterpart in the body. Read `git log` for the
  house style. The subject must still say plainly what changed.

## Pull requests

- One concern per PR. Say what a user sees differently, not only what the
  code does differently.
- If your change touches `design/`, say so explicitly and include the
  `MODIFICATIONS.md` entries in the same PR — CI rejects the PR without them.
- Do not add a root `package.json`, a root aggregate build/test command, or a
  new workflow that assumes a local build happened first.
- The imported tree's own contribution guide at `design/CONTRIBUTING.md` is
  upstream's, for contributions to upstream. It does not govern this
  repository.

## Reporting problems

Bug reports and feature requests are welcome as GitHub issues. For anything
security-sensitive, use [`SECURITY.md`](SECURITY.md) instead of a public
issue.
