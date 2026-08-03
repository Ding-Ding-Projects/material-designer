#!/usr/bin/env bash
# Copy a curated set of dishes out of the verified dim sum catalog into this
# repository, byte-for-byte, and write an index the release workflow and the
# application can both read.
#
# Images are never generated, downloaded, resized or re-encoded here — each one
# is copied from its indexed path and its sha256 is checked against the
# catalog's manifest. A dish whose image is missing or whose hash does not match
# is skipped and reported, because a release that ships a broken code-name photo
# is worse than one that ships none.
#
# Usage: scripts/import-dim-sum.sh <catalog-dir> [count]
#
# The catalog directory is passed in rather than hardcoded, so this script has
# no knowledge of where anyone keeps their copy.

set -u -o pipefail

catalog=${1:-}
want=${2:-24}

if [ -z "$catalog" ] || [ ! -f "$catalog/index.json" ] || [ ! -f "$catalog/image-manifest.json" ]; then
  echo "usage: scripts/import-dim-sum.sh <catalog-dir> [count]" >&2
  echo "  <catalog-dir> must contain index.json and image-manifest.json" >&2
  exit 2
fi

repo_root=$(git rev-parse --show-toplevel) || exit 2
dest="$repo_root/assets/dim-sum"
mkdir -p "$dest/images"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# The manifest lists only images that exist and have been verified, so it — not
# the dish index — decides what is eligible. Flatten it to: id, path, sha256.
tr -d '\n' < "$catalog/image-manifest.json" |
  grep -o '{[^{}]*"id"[^{}]*}' |
  sed -n 's/.*"id": *"\([^"]*\)".*"path": *"\([^"]*\)".*"sha256": *"\([^"]*\)".*/\1\t\2\t\3/p' \
  > "$tmp/manifest.tsv"

echo "catalog: $(wc -l < "$tmp/manifest.tsv" | tr -d ' ') verified images available"

# Flatten the dish index to one tab-separated row per dish. The file is
# pretty-printed with stable indentation and the fields we want sit at known
# depths inside named blocks, so a small state machine over the lines is both
# simpler and far more robust than trying to match nested JSON with a regex.
# Fields: id, slug, english, chinese, jyutping, category, alt-en, alt-yue
awk '
  function val(line,   s) { s = line; sub(/^[^:]*: *"/, "", s); sub(/",?$/, "", s); return s }
  /^      "id": "hk-dish/       { if (id != "") emit(); id = val($0); block = ""; next }
  /^      "name": \{/           { block = "name";  next }
  /^      "description": \{/    { block = "desc";  next }
  /^      "image": \{/          { block = "image"; next }
  /^        "alt": \{/          { block = "alt";   next }
  /^      "slug":/              { slug = val($0); next }
  /^      "jyutping":/          { jyut = val($0); next }
  /^      "category":/          { cat  = val($0); next }
  block == "name"  && /^        "en":/     { en = val($0); next }
  block == "name"  && /^        "zhHant":/ { zh = val($0); next }
  block == "alt"   && /^          "en":/   { alten = val($0); next }
  block == "alt"   && /^          "yue":/  { altyue = val($0); next }
  END { if (id != "") emit() }
  function emit() {
    if (id != "" && slug != "" && en != "" && zh != "")
      printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n", id, slug, en, zh, jyut, cat, alten, altyue
    slug = en = zh = jyut = cat = alten = altyue = ""
  }
' "$catalog/index.json" > "$tmp/dishes.tsv"

echo "catalog: $(wc -l < "$tmp/dishes.tsv" | tr -d ' ') dishes indexed"

# Spread the selection across categories rather than taking the first N, which
# would be 24 near-identical steamed dumplings.
LC_ALL=C sort -t"$(printf '\t')" -k6,6 -k1,1 "$tmp/dishes.tsv" |
  awk -F'\t' '{ n[$6]++; if (n[$6] <= 2) print }' |
  head -n "$want" > "$tmp/picked.tsv"

picked=$(wc -l < "$tmp/picked.tsv" | tr -d ' ')
echo "picking $picked dishes across categories"

copied=0
skipped=0
: > "$tmp/entries.json"

while IFS=$'\t' read -r id slug en zh jyut category alt_en alt_yue; do
  row=$(grep -m1 "^$id	" "$tmp/manifest.tsv" || true)
  if [ -z "$row" ]; then
    echo "  skip $id ($en): no verified image in the manifest" >&2
    skipped=$((skipped + 1)); continue
  fi
  rel=$(printf '%s' "$row" | cut -f2)
  want_sha=$(printf '%s' "$row" | cut -f3)
  src="$catalog/$rel"
  if [ ! -f "$src" ]; then
    echo "  skip $id ($en): $rel is listed but absent" >&2
    skipped=$((skipped + 1)); continue
  fi
  got_sha=$(sha256sum "$src" | cut -d' ' -f1)
  if [ "$got_sha" != "$want_sha" ]; then
    echo "  skip $id ($en): sha256 mismatch, image does not match the manifest" >&2
    skipped=$((skipped + 1)); continue
  fi

  base=$(basename "$rel")
  cp "$src" "$dest/images/$base"
  bytes=$(wc -c < "$dest/images/$base" | tr -d ' ')

  # Alt text comes from the catalog, which already writes it in both languages.
  # Only fall back to a generated line if a record genuinely lacks one.
  [ -n "$alt_en" ] || alt_en="A photograph of $en"
  [ -n "$alt_yue" ] || alt_yue="${zh}嘅相片"

  printf '    {\n      "id": "%s",\n      "slug": "%s",\n      "name": { "en": "%s", "zhHant": "%s" },\n      "jyutping": "%s",\n      "category": "%s",\n      "image": "images/%s",\n      "bytes": %s,\n      "sha256": "%s",\n      "alt": { "en": "%s", "yue": "%s" }\n    },\n' \
    "$id" "$slug" "$en" "$zh" "$jyut" "$category" "$base" "$bytes" "$want_sha" "$alt_en" "$alt_yue" >> "$tmp/entries.json"
  copied=$((copied + 1))
done < "$tmp/picked.tsv"

if [ "$copied" -eq 0 ]; then
  echo "no images could be verified and copied" >&2
  exit 1
fi

{
  printf '{\n'
  printf '  "schemaVersion": "1.0.0",\n'
  printf '  "source": "Hong Kong dim sum and dish catalog",\n'
  printf '  "note": "Images are copied byte-for-byte from the source catalog and verified by sha256. They are never generated, resized or re-encoded here.",\n'
  printf '  "total": %s,\n' "$copied"
  printf '  "dishes": [\n'
  sed '$ s/,$//' "$tmp/entries.json"
  printf '  ]\n'
  printf '}\n'
} > "$dest/index.json"

echo ""
echo "copied  $copied"
echo "skipped $skipped"
echo "index   assets/dim-sum/index.json"
du -sh "$dest" 2>/dev/null | sed 's/^/size    /'
