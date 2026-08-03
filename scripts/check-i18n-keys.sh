#!/usr/bin/env bash
# Find translation keys the web app uses but never declares, and keys declared in
# one locale but missing from another.
#
# Both are type errors, so the compiler does catch them — but only after the
# workspace has installed and built, which is minutes of work to learn that a
# component references a key nobody added. This is the same answer in seconds,
# with no toolchain, so it can run before a commit rather than after a push.
#
# Usage: scripts/check-i18n-keys.sh
# Exits 0 only when every used key is declared and every locale is complete.

set -u -o pipefail

repo_root=$(git rev-parse --show-toplevel) || exit 2
cd "$repo_root" || exit 2

web=design/apps/web
types=$web/src/i18n/types.ts
locales=$web/src/i18n/locales

if [ ! -f "$types" ]; then
  echo "check-i18n-keys: $types not found" >&2
  exit 2
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# Keys the Dict declares. Scoped to the `interface Dict { … }` block: types.ts
# also holds a locale-label record whose entries look identical to Dict keys, and
# counting those produced confident nonsense — every locale "missing" the key
# `ar`, and so on.
awk '/^export interface Dict \{/ { inside = 1; next }
     inside && /^\}/           { inside = 0 }
     inside                     { print }' "$types" |
  grep -oE "^[[:space:]]+['\"]?[a-z][a-zA-Z0-9._]*['\"]?[[:space:]]*:" |
  tr -d " '\":" | LC_ALL=C sort -u > "$tmp/declared.txt"

# Keys the source passes to a translator call. Deliberately conservative: only
# string literals directly inside t(...), because a computed key cannot be
# checked here and a loose pattern would produce false alarms nobody trusts.
{
  grep -rhoE "\bt\(\s*'[a-z][a-zA-Z0-9._]*'" "$web/src" 2>/dev/null | sed "s/.*'\(.*\)'/\1/"
  grep -rhoE "\bt\(\s*\"[a-z][a-zA-Z0-9._]*\"" "$web/src" 2>/dev/null | sed 's/.*"\(.*\)"/\1/'
} | LC_ALL=C sort -u > "$tmp/used.txt"

comm -23 "$tmp/used.txt" "$tmp/declared.txt" > "$tmp/undeclared.txt"

echo "declared in Dict : $(wc -l < "$tmp/declared.txt" | tr -d ' ')"
echo "used in source   : $(wc -l < "$tmp/used.txt" | tr -d ' ')"
echo "used but NOT declared: $(wc -l < "$tmp/undeclared.txt" | tr -d ' ')"

# Every locale must define every declared key. One locale that spreads another
# inherits its keys, so a file containing a spread is reported but not failed —
# the compiler is the authority there and this cannot resolve it statically.
incomplete=0
for f in "$locales"/*.ts; do
  name=$(basename "$f" .ts)
  if grep -qE '^\s*\.\.\.[a-zA-Z]' "$f"; then
    echo "  $name: inherits via spread — completeness left to the compiler"
    continue
  fi
  grep -oE "^[[:space:]]+['\"]?[a-z][a-zA-Z0-9._]*['\"]?[[:space:]]*:" "$f" |
    tr -d " '\":" | LC_ALL=C sort -u > "$tmp/have.txt"
  n=$(comm -23 "$tmp/declared.txt" "$tmp/have.txt" | wc -l | tr -d ' ')
  if [ "$n" -ne 0 ]; then
    echo "  $name: missing $n key(s)"
    comm -23 "$tmp/declared.txt" "$tmp/have.txt" | head -5 | sed 's/^/      /'
    incomplete=$((incomplete + 1))
  fi
done

undeclared=$(wc -l < "$tmp/undeclared.txt" | tr -d ' ')
if [ "$undeclared" -ne 0 ]; then
  echo ""
  echo "These keys are used but not declared in the Dict — typecheck will fail:" >&2
  head -40 "$tmp/undeclared.txt" >&2
  [ "$undeclared" -gt 40 ] && echo "  … and $((undeclared - 40)) more" >&2
fi

if [ "$undeclared" -ne 0 ] || [ "$incomplete" -ne 0 ]; then
  exit 1
fi

echo "every used key is declared, and every locale is complete."
exit 0
