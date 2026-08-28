#!/usr/bin/env sh
set -eu

ROOT=${SOURCE_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}
CHECK="$ROOT/scripts/check-regex-search-inventory.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM

cp "$ROOT/docs/standards/search-surface-inventory.md" "$tmp/inventory.md"
sed '/| `desktop-settings` |/d' "$tmp/inventory.md" > "$tmp/removed.md"
if INVENTORY_FILE="$tmp/removed.md" sh "$CHECK" > "$tmp/missing.log" 2>&1; then
  printf '%s\n' 'negative inventory removal stayed green' >&2
  exit 1
fi

cp "$ROOT/design/apps/web/src/components/EntryTopbarSearch.tsx" "$tmp/EntryTopbarSearch.tsx"
sed 's/<RegexSearchField/ <SearchField/' "$tmp/EntryTopbarSearch.tsx" > "$tmp/removed-registration.tsx"
mkdir -p "$tmp/design/apps/web/src/components"
cp "$tmp/removed-registration.tsx" "$tmp/design/apps/web/src/components/EntryTopbarSearch.tsx"
if SOURCE_ROOT="$tmp" INVENTORY_FILE="$ROOT/docs/standards/search-surface-inventory.md" sh "$CHECK" > "$tmp/registration.log" 2>&1; then
  printf '%s\n' 'negative builder-registration removal stayed green' >&2
  exit 1
fi

sed 's/<RegexSearchField/<RegexSearchFieldRenamed/' "$tmp/EntryTopbarSearch.tsx" > "$tmp/renamed-registration.tsx"
cp "$tmp/renamed-registration.tsx" "$tmp/design/apps/web/src/components/EntryTopbarSearch.tsx"
if SOURCE_ROOT="$tmp" INVENTORY_FILE="$ROOT/docs/standards/search-surface-inventory.md" sh "$CHECK" > "$tmp/renamed.log" 2>&1; then
  printf '%s\n' 'renamed builder registration stayed green' >&2
  exit 1
fi

if ! SOURCE_ROOT="$ROOT" INVENTORY_FILE="$ROOT/docs/standards/search-surface-inventory.md" sh "$CHECK" > "$tmp/green.log" 2>&1; then
  printf '%s\n' 'restored regex search inventory did not turn green' >&2
  cat "$tmp/green.log" >&2
  exit 1
fi

printf '%s\n' 'regex search inventory negative: red then green'
