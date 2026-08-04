#!/usr/bin/env bash
# Prove the Playwright suite still waits for the text the app actually renders.
#
# The web shell paints one string while the client bundle loads, and 42 startup
# waits across 34 UI test files synchronise on it being hidden. That pairing has
# a failure mode no test suite reports: a wait for text the app never renders is
# satisfied the instant it is evaluated. Change the product string alone and
# nothing goes red — every startup gate silently becomes a no-op, and the UI
# suite starts failing later, elsewhere, for reasons that do not reproduce.
#
# The waits now import one constant, so drift needs the two files to disagree.
# This is the check that says they do not, in milliseconds and with no toolchain.
#
# Usage: scripts/check-loading-shell.sh
# Exits 0 only when the rendered shell text and the e2e constant are identical.

set -u -o pipefail

repo_root=$(git rev-parse --show-toplevel) || exit 2
cd "$repo_root" || exit 2

shell_src='design/apps/web/app/[[...slug]]/client-app.tsx'
const_src='design/e2e/lib/loading-shell.ts'

for f in "$shell_src" "$const_src"; do
  if [ ! -f "$f" ]; then
    echo "error: expected $f to exist" >&2
    exit 2
  fi
done

# The rendered text, read out of the loading element the shell paints.
rendered=$(sed -n 's/.*od-loading-shell"[^>]*>\([^<]*\)<\/div>.*/\1/p' "$shell_src" | head -1)
# The constant every startup wait imports.
declared=$(sed -n "s/^export const LOADING_SHELL_TEXT = '\(.*\)';$/\1/p" "$const_src" | head -1)

status=0

if [ -z "$rendered" ]; then
  echo "error: could not read the od-loading-shell text out of $shell_src" >&2
  status=2
fi

if [ -z "$declared" ]; then
  echo "error: could not read LOADING_SHELL_TEXT out of $const_src" >&2
  status=2
fi

if [ "$status" = 0 ] && [ "$rendered" != "$declared" ]; then
  echo "error: the loading shell and the e2e startup waits disagree." >&2
  echo "  $shell_src renders: $rendered" >&2
  echo "  $const_src declares: $declared" >&2
  echo "  Every Playwright startup wait would resolve immediately instead of waiting." >&2
  status=1
fi

# A literal that escaped the constant is the same drift by another route.
strays=$(git grep -n "Loading Material Designer…" -- design/e2e | grep -v '^design/e2e/lib/loading-shell.ts:' || true)
if [ -n "$strays" ]; then
  echo "error: design/e2e must reference LOADING_SHELL_TEXT, not the literal:" >&2
  echo "$strays" >&2
  status=1
fi

if [ "$status" = 0 ]; then
  echo "loading shell: '$rendered' — rendered text and all 42 startup waits agree"
fi

exit "$status"
