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

# Extract top-level quoted object/interface keys with a small lexical scanner.
# Locale dictionaries contain compact one-line properties and multiline values,
# so a line-oriented grep mistakes every property after the first for a missing
# translation. Track comments, quoted strings, and brace depth instead. Records
# are tab-separated: K (key), S (top-level spread), and D (duplicate key).
extract_object_keys() {
  kind=$1
  file=$2
  awk -v kind="$kind" '
    BEGIN {
      depth = 0
      started = 0
      done = 0
      quote = ""
      escaped = 0
      block_comment = 0
    }

    function is_key_char(c) {
      return c ~ /^[a-zA-Z0-9._-]$/
    }

    function starts_target(line) {
      if (kind == "dict")
        return line ~ /^[[:space:]]*export[[:space:]]+interface[[:space:]]+Dict[[:space:]]*\{/
      return line ~ /^[[:space:]]*export[[:space:]]+const[[:space:]]+[a-zA-Z0-9_]+[[:space:]]*:[[:space:]]*Dict[[:space:]]*=[[:space:]]*\{/
    }

    {
      line = $0
      line_comment = 0
      start_index = 0

      if (!started && !done && starts_target(line))
        start_index = index(line, "{")

      for (i = 1; i <= length(line); i++) {
        c = substr(line, i, 1)

        if (line_comment)
          break

        if (block_comment) {
          if (c == "*" && substr(line, i + 1, 1) == "/") {
            block_comment = 0
            i++
          }
          continue
        }

        if (quote != "") {
          if (escaped) {
            escaped = 0
            continue
          }
          if (c == "\\") {
            escaped = 1
            continue
          }
          if (c == quote)
            quote = ""
          continue
        }

        if (c == "/" && substr(line, i + 1, 1) == "/") {
          line_comment = 1
          continue
        }
        if (c == "/" && substr(line, i + 1, 1) == "*") {
          block_comment = 1
          i++
          continue
        }

        if (!started) {
          if (start_index > 0 && i >= start_index) {
            started = 1
            depth = 0
          } else {
            continue
          }
        }
        if (done)
          continue

        if (c == "{") {
          depth++
          continue
        }
        if (c == "}") {
          depth--
          if (depth == 0) {
            done = 1
            started = 0
          }
          continue
        }

        if (depth != 1)
          continue

        if (substr(line, i, 3) == "...") {
          j = i + 3
          spread = ""
          while (j <= length(line) && is_key_char(substr(line, j, 1))) {
            spread = spread substr(line, j, 1)
            j++
          }
          if (spread != "") {
            print "S\t" spread
            i = j - 1
          }
          continue
        }

        if (c != "\047" && c != "\042")
          continue

        key_quote = c
        j = i + 1
        key = ""
        key_escaped = 0
        while (j <= length(line)) {
          d = substr(line, j, 1)
          if (key_escaped) {
            key = key d
            key_escaped = 0
            j++
            continue
          }
          if (d == "\\") {
            key_escaped = 1
            key = key d
            j++
            continue
          }
          if (d == key_quote)
            break
          key = key d
          j++
        }
        if (j <= length(line) && key ~ /^[a-z][a-zA-Z0-9._-]*$/) {
          after = substr(line, j + 1)
          if (after ~ /^[[:space:]]*:/) {
            print "K\t" key
            if (seen[key]++)
              print "D\t" key
            i = j
            continue
          }
        }
        quote = key_quote
      }
    }
  ' "$file"
}

# Keys the Dict declares. Scoped to the `interface Dict { … }` block: types.ts
# also holds a locale-label record whose entries look identical to Dict keys, and
# counting those produced confident nonsense — every locale "missing" the key
# `ar`, and so on.
extract_object_keys dict "$types" > "$tmp/dict.records"
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
for f in "$locales"/*.ts; do
  name=$(basename "$f" .ts)
  if ! grep -Eq '^[[:space:]]*export[[:space:]]+const[[:space:]]+[a-zA-Z0-9_]+[[:space:]]*:[[:space:]]*Dict[[:space:]]*=' "$f"; then
    continue
  fi
  records="$tmp/$name.records"
  extract_object_keys locale "$f" > "$records"
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
    else
      if [ ! -s "$tmp/zh-TW.direct.txt" ] && [ -f "$locales/zh-TW.ts" ]; then
        extract_object_keys locale "$locales/zh-TW.ts" |
          awk -F '\t' '$1 == "K" { print $2 }' |
          LC_ALL=C sort -u > "$tmp/zh-TW.direct.txt"
      fi
      if [ ! -s "$tmp/zh-TW.direct.txt" ]; then
        echo "  $name: zh-TW base locale is unavailable" >&2
        incomplete=$((incomplete + 1))
        cp "$tmp/$name.direct.txt" "$tmp/$name.have.txt"
      else
        cat "$tmp/$name.direct.txt" "$tmp/zh-TW.direct.txt" |
          LC_ALL=C sort -u > "$tmp/$name.have.txt"
      fi
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
