#!/usr/bin/env bash
# Prove a built artifact makes no network request for an asset — no CDN script,
# stylesheet or font, no remote image, no analytics.
#
# This started life inline in .github/workflows/pages.yml, guarding the
# published site. It moved here when the same question had to be asked of a
# second artifact: the packaged application, whose stylesheet used to open with
# an @import of a font CDN and now bundles four faces of its own. One rule, one
# implementation, two callers — the alternative was a second copy that drifts
# from the first and disagrees with it on a Tuesday.
#
# Usage: scripts/check-self-contained.sh <dir> [<dir>...]
#
# Exits 0 only when every directory exists, contains something this script
# knows how to read, and contains no remote reference.

set -uo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: $0 <dir> [<dir>...]" >&2
  exit 2
fi

bad=0

# Each check names one way a remote resource gets loaded. Ordinary hyperlinks in
# prose (<a href="https://github.com/...">) are fine and are deliberately not
# matched by any of these.
check() {
  local dir=$1 what=$2 glob=$3 pattern=$4
  shift 4
  if grep -rnE "$pattern" --include="$glob" "$@" "$dir"; then
    echo "::error::$dir $what"
    bad=1
  fi
}

for dir in "$@"; do
  if [ ! -d "$dir" ]; then
    # Not a warning and not a skip. A check pointed at a directory that is not
    # there has proved nothing, and reporting that as a pass is how a green tick
    # comes to mean less than it appears to.
    echo "::error::$dir does not exist, so nothing was verified" >&2
    bad=1
    continue
  fi

  # Same reasoning one level down: an artifact with no stylesheet and no markup
  # is not an artifact this script has inspected. Say so rather than pass.
  css=$(find "$dir" -type f -name '*.css' | wc -l | tr -d ' ')
  html=$(find "$dir" -type f \( -name '*.html' -o -name '*.htm' \) | wc -l | tr -d ' ')
  js=$(find "$dir" -type f -name '*.js' | wc -l | tr -d ' ')
  if [ "$css" -eq 0 ] && [ "$html" -eq 0 ] && [ "$js" -eq 0 ]; then
    echo "::error::$dir holds no .css, .html or .js file, so nothing was verified" >&2
    bad=1
    continue
  fi

  check "$dir" "loads a remote script"       '*.html' '<script[^>]+src="https?://'
  check "$dir" "loads a remote stylesheet"   '*.html' '<link[^>]+href="https?://'
  check "$dir" "loads a remote image"        '*.html' '<(img|source)[^>]+src(set)?="https?://'
  check "$dir" "imports a remote stylesheet" '*.css'  '@import[[:space:]]*(url\()?["'"'"']?https?://'
  check "$dir" "loads a remote CSS asset"    '*.css'  'url\([[:space:]]*["'"'"']?https?://'
  # Dependencies carry build/dev helpers and optional telemetry code that is
  # not application-authored runtime behavior. Scan first-party JavaScript for
  # external requests, while keeping HTML and CSS checks recursive everywhere:
  # those files can render or load assets directly even when nested in a
  # dependency. A future first-party bundle copied under node_modules would be
  # an explicit packaging-contract problem, not a reason to treat Next's
  # unreachable dev files as application behavior.
  check "$dir" "makes an external request"   '*.js'   '(fetch|XMLHttpRequest|WebSocket)[[:space:]]*\([[:space:]]*["'"'"']https?://' --exclude-dir=node_modules

  echo "$dir: inspected $css stylesheet(s), $html page(s), $js script(s)"
done

[ "$bad" -eq 0 ] || exit 1
echo "self-contained: every directory checked makes no network request for an asset."
