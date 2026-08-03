# Modifications to the imported work

`design/` contains a copy of **Open Design** v0.16.1, licensed under the Apache
License 2.0. The full licence text is at [`design/LICENSE`](design/LICENSE).

- Upstream: <https://github.com/nexu-io/open-design>
- Imported at commit: `517f39acde402c1a7af2189167a8d6957a3dac71`
- Import date: 2026-08-03

Apache-2.0 section 4(b) requires prominent notices on files that were changed.
This file is that notice, kept in one place so a reader sees the whole delta
without diffing two repositories.

## This file is enforced, not decorative

`scripts/verify-port.sh` compares every file under `design/` against the pinned
upstream tree and **reads the path list below as its allowlist**. A file that
differs from upstream without an entry here fails verification; an entry here
for a file that no longer differs also fails. The notice and the code cannot
drift apart, because CI checks that they agree.

Paths are relative to `design/` and are written as `` - `path/to/file` `` under
the **Changed files** heading of an entry.

## Import

Copied byte-for-byte from the pinned submodule: all 11,799 files match the
upstream blob ids exactly, file modes included.

## Changes

_None yet — `design/` is currently identical to upstream._

<!--
Format for entries, newest first:

### 2026-08-04 — Windows frameless window chrome

**Reason:** Windows builds must ship a custom Material Design 3 title bar
instead of the operating system's.

**Changed files:**

- `apps/desktop/src/main/runtime.ts`
- `apps/desktop/src/main/preload.cts`
-->

## Trademarks

Apache-2.0 grants no trademark rights (section 6). The "Open Design" name, its
logo, and the `io.open-design.desktop` application identity belong to the
upstream project. Builds published from this repository are branded
**Material Designer** with their own application identity, and are not produced
by, endorsed by, or affiliated with the upstream project.
