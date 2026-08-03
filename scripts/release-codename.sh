#!/usr/bin/env bash
# Pick the dim sum code name for the next release.
#
# A code name is used once. Reusing one makes two different builds
# indistinguishable in conversation, which is the only job a code name has, so
# this reads the dishes already spent from the existing releases rather than
# trusting a counter that a re-run would repeat.
#
# Usage:
#   scripts/release-codename.sh                 # reads used ids from stdin, one per line
#   scripts/release-codename.sh --used a,b,c    # or pass them inline
#
# Output: KEY=VALUE lines for $GITHUB_OUTPUT (id, slug, name_en, name_zh,
# jyutping, image, alt_en, alt_yue). Exits 0 with `id=` empty when every dish
# has been spent — a release is never blocked for want of a code name.

set -u -o pipefail

repo_root=$(git rev-parse --show-toplevel) || exit 2
index="$repo_root/assets/dim-sum/index.json"

if [ ! -f "$index" ]; then
  echo "release-codename: no dim sum catalog at assets/dim-sum/index.json" >&2
  echo "id="
  exit 0
fi

used=""
if [ "${1:-}" = "--used" ]; then
  used=$(printf '%s' "${2:-}" | tr ',' '\n')
elif [ ! -t 0 ]; then
  used=$(cat)
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

printf '%s\n' "$used" | sed 's/[[:space:]]//g' | grep -v '^$' | LC_ALL=C sort -u > "$tmp/used.txt" || true

# Flatten the catalog. Each dish is a fixed-shape block written by
# scripts/import-dim-sum.sh, so a line-oriented pass is enough and keeps this
# script dependency-free.
awk '
  function val(line,   s) { s = line; sub(/^[^:]*: *"/, "", s); sub(/",?$/, "", s); return s }
  function nested(line, key,   s) {
    s = line
    sub(".*\"" key "\": *\"", "", s)
    sub("\".*", "", s)
    return s
  }
  /"id":/       { if (id != "") emit(); id = val($0); next }
  /"slug":/     { slug = val($0); next }
  /"name":/     { en = nested($0, "en"); zh = nested($0, "zhHant"); next }
  /"jyutping":/ { jyut = val($0); next }
  /"image":/    { image = val($0); next }
  /"alt":/      { alten = nested($0, "en"); altyue = nested($0, "yue"); next }
  END { if (id != "") emit() }
  function emit() {
    if (id != "" && image != "")
      printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n", id, slug, en, zh, jyut, image, alten, altyue
    slug = en = zh = jyut = image = alten = altyue = ""
  }
' "$index" > "$tmp/dishes.tsv"

total=$(wc -l < "$tmp/dishes.tsv" | tr -d ' ')
spent=$(wc -l < "$tmp/used.txt" | tr -d ' ')
echo "release-codename: $total in catalog, $spent already spent" >&2

while IFS=$'\t' read -r id slug en zh jyut image alten altyue; do
  grep -qx "$id" "$tmp/used.txt" && continue
  [ -f "$repo_root/assets/dim-sum/$image" ] || {
    echo "release-codename: skipping $id, $image is indexed but absent" >&2
    continue
  }
  printf 'id=%s\n' "$id"
  printf 'slug=%s\n' "$slug"
  printf 'name_en=%s\n' "$en"
  printf 'name_zh=%s\n' "$zh"
  printf 'jyutping=%s\n' "$jyut"
  printf 'image=assets/dim-sum/%s\n' "$image"
  printf 'alt_en=%s\n' "$alten"
  printf 'alt_yue=%s\n' "$altyue"
  printf 'codename=%s · %s\n' "$en" "$zh"
  exit 0
done < "$tmp/dishes.tsv"

echo "release-codename: every dish has been used; shipping without a code name" >&2
echo "id="
exit 0
