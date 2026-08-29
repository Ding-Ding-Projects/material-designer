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

web=${I18N_WEB_ROOT:-design/apps/web}
types=$web/src/i18n/types.ts
locales=$web/src/i18n/locales

if [ ! -f "$types" ]; then
  echo "check-i18n-keys: $types not found" >&2
  exit 2
fi
if [ ! -d "$locales" ]; then
  echo "check-i18n-keys: $locales not found" >&2
  exit 2
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

parser="$repo_root/scripts/i18n-object-keys.awk"
authority_parser="$repo_root/scripts/i18n-authority.awk"
authority=${I18N_AUTHORITY_FILE:-$repo_root/scripts/i18n-handoff-authority.tsv}
if [ ! -f "$parser" ]; then
  echo "check-i18n-keys: $parser not found" >&2
  exit 2
fi
if [ ! -f "$authority_parser" ] || [ ! -f "$authority" ]; then
  echo "check-i18n-keys: authority parser or authority file not found" >&2
  exit 2
fi

if ! awk -f "$authority_parser" "$authority" > "$tmp/authority.records"; then
  echo "check-i18n-keys: invalid handoff authority" >&2
  exit 1
fi

awk -F '\t' '$1 == "A" && $2 == "locales" { print $3 }' "$tmp/authority.records" |
  LC_ALL=C sort -u > "$tmp/authority.locales"
awk -F '\t' '$1 == "A" && $2 == "direct-locales" { print $3 }' "$tmp/authority.records" |
  LC_ALL=C sort -u > "$tmp/authority.direct"
awk -F '\t' '$1 == "A" && $2 == "handoff-keys" { print $3 }' "$tmp/authority.records" |
  LC_ALL=C sort -u > "$tmp/authority.keys"
if [ "$(wc -l < "$tmp/authority.locales" | tr -d ' ')" -ne 20 ] ||
   [ "$(wc -l < "$tmp/authority.direct" | tr -d ' ')" -ne 17 ] ||
   [ "$(wc -l < "$tmp/authority.keys" | tr -d ' ')" -ne 27 ]; then
  echo "check-i18n-keys: authority counts must be 20 locales, 17 direct locales, 27 keys" >&2
  exit 1
fi

# Keys the Dict declares. Scoped to the `interface Dict { … }` block: types.ts
# also holds a locale-label record whose entries look identical to Dict keys, and
# counting those produced confident nonsense — every locale "missing" the key
# `ar`, and so on. The scanner also handles compact properties and multiline
# values without letting comments or nested objects become declarations.
awk -v kind=dict -f "$parser" "$types" > "$tmp/dict.records"
awk -F '\t' '$1 == "K" { print $2 }' "$tmp/dict.records" |
  LC_ALL=C sort -u > "$tmp/declared.txt"
if [ ! -s "$tmp/declared.txt" ]; then
  echo "check-i18n-keys: no Dict keys found" >&2
  exit 2
fi
dict_duplicates=$(awk -F '\t' '$1 == "D" { print $2 }' "$tmp/dict.records")
if [ -n "$dict_duplicates" ]; then
  echo "check-i18n-keys: duplicate Dict key(s): $dict_duplicates" >&2
  exit 1
fi

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

# Parse every exported locale object before comparing. A top-level spread is
# resolved only for zh-HK, whose contract is exactly `...zhTW`; spreads nested
# inside values do not count. Duplicate properties are always an error.
incomplete=0
while IFS= read -r name; do
  f="$locales/$name.ts"
  if [ ! -f "$f" ]; then
    echo "  $name: catalog file not found" >&2
    incomplete=$((incomplete + 1))
    continue
  fi
  records="$tmp/$name.records"
  awk -v kind=locale -f "$parser" "$f" > "$records"
  awk -F '\t' '$1 == "K" { print $2 }' "$records" |
    LC_ALL=C sort -u > "$tmp/$name.direct.txt"
  if [ ! -s "$tmp/$name.direct.txt" ]; then
    echo "  $name: no exported locale object found" >&2
    incomplete=$((incomplete + 1))
    continue
  fi

  duplicates=$(awk -F '\t' '$1 == "D" { print $2 }' "$records")
  if [ -n "$duplicates" ]; then
    echo "  $name: duplicate key(s): $duplicates" >&2
    incomplete=$((incomplete + 1))
  fi

  spreads=$(awk -F '\t' '$1 == "S" { print $2 }' "$records")
  spread_count=$(printf '%s\n' "$spreads" | sed '/^$/d' | wc -l | tr -d ' ')
  if [ "$name" = "zh-HK" ]; then
    if [ "$spread_count" -ne 1 ] || [ "$spreads" != "zhTW" ]; then
      echo "  $name: must inherit exactly from zhTW" >&2
      incomplete=$((incomplete + 1))
      cp "$tmp/$name.direct.txt" "$tmp/$name.have.txt"
    elif [ ! -s "$tmp/zh-TW.direct.txt" ] && [ -f "$locales/zh-TW.ts" ]; then
      awk -v kind=locale -f "$parser" "$locales/zh-TW.ts" |
        awk -F '\t' '$1 == "K" { print $2 }' |
        LC_ALL=C sort -u > "$tmp/zh-TW.direct.txt"
      if [ ! -s "$tmp/zh-TW.direct.txt" ]; then
        echo "  $name: zh-TW base locale is unavailable" >&2
        incomplete=$((incomplete + 1))
        cp "$tmp/$name.direct.txt" "$tmp/$name.have.txt"
      else
        cat "$tmp/$name.direct.txt" "$tmp/zh-TW.direct.txt" |
          LC_ALL=C sort -u > "$tmp/$name.have.txt"
      fi
    elif [ ! -s "$tmp/zh-TW.direct.txt" ]; then
      echo "  $name: zh-TW base locale is unavailable" >&2
      incomplete=$((incomplete + 1))
      cp "$tmp/$name.direct.txt" "$tmp/$name.have.txt"
    else
      cat "$tmp/$name.direct.txt" "$tmp/zh-TW.direct.txt" |
        LC_ALL=C sort -u > "$tmp/$name.have.txt"
    fi
  else
    if [ "$spread_count" -ne 0 ]; then
      echo "  $name: unexpected top-level spread" >&2
      incomplete=$((incomplete + 1))
    fi
    cp "$tmp/$name.direct.txt" "$tmp/$name.have.txt"
  fi

  n=$(comm -23 "$tmp/declared.txt" "$tmp/$name.have.txt" | wc -l | tr -d ' ')
  if [ "$n" -ne 0 ]; then
    echo "  $name: missing $n key(s)"
    comm -23 "$tmp/declared.txt" "$tmp/$name.have.txt" | head -5 | sed 's/^/      /'
    incomplete=$((incomplete + 1))
  fi
done < "$tmp/authority.locales"

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
