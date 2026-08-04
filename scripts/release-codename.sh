#!/usr/bin/env bash
# Pick the dim sum code name for the next release.
#
# A code name is used once. Reusing one makes two different builds
# indistinguishable in conversation, which is the only job a code name has, so
# this reads the dishes already spent from the existing releases rather than
# trusting a counter that a re-run would repeat.
#
# The names come from the public catalog at Ding-Ding-Projects/dim-sum-photos,
# which is the authority for dish metadata and holds 2,866 dishes. The twenty
# four images bundled in this repository were the previous source, and they ran
# out inside a single day of per-push releases — every build after that shipped
# with no code name at all, which is how this was noticed.
#
# On photos, two shared rules pull in different directions: every release must
# attach a real dim sum photo as a downloadable asset, and a consumer repository
# must not copy public catalog photos or add to its bundled set. This satisfies
# both rather than silently picking one: the code name and its photo LINK come
# from the public catalog, and the attached asset is one of the twenty four
# images already tracked here, rotated deterministically. Nothing is fetched or
# vendored at publish time, and the release still carries a real steamer basket.
#
# Usage:
#   scripts/release-codename.sh                 # reads used ids from stdin, one per line
#   scripts/release-codename.sh --used a,b,c    # or pass them inline
#
# Output: KEY=VALUE lines for $GITHUB_OUTPUT (id, slug, name_en, name_zh,
# jyutping, codename, photo_url, image, image_dish, alt_en, alt_yue, source).
# Exits 0 with `id=` empty only when no unused dish can be resolved at all — a
# release is never blocked for want of a code name.

set -u -o pipefail

repo_root=$(git rev-parse --show-toplevel) || exit 2
bundled_index="$repo_root/assets/dim-sum/index.json"
public_index_url="https://raw.githubusercontent.com/Ding-Ding-Projects/dim-sum-photos/main/catalog/index.json"
public_repo="Ding-Ding-Projects/dim-sum-photos"

used=""
if [ "${1:-}" = "--used" ]; then
  used=$(printf '%s' "${2:-}" | tr ',' '\n')
elif [ ! -t 0 ]; then
  used=$(cat)
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

printf '%s\n' "$used" | sed 's/[[:space:]]//g' | grep -v '^$' | LC_ALL=C sort -u > "$tmp/used.txt" || true
spent=$(wc -l < "$tmp/used.txt" | tr -d ' ')

# ---------------------------------------------------------------------------
# The bundled images, which are what actually gets attached to the release.
# ---------------------------------------------------------------------------
bundled_images=()
if [ -d "$repo_root/assets/dim-sum/images" ]; then
  while IFS= read -r p; do
    bundled_images+=("$p")
  done < <(cd "$repo_root/assets/dim-sum/images" && ls -1 *.png 2>/dev/null | LC_ALL=C sort)
fi

attach_image=""
attach_dish=""
if [ "${#bundled_images[@]}" -gt 0 ]; then
  pick=$(( spent % ${#bundled_images[@]} ))
  attach_image="assets/dim-sum/images/${bundled_images[$pick]}"
  attach_dish="${bundled_images[$pick]%.png}"
fi

# ---------------------------------------------------------------------------
# The public catalog, which is the authority for the code name itself.
# ---------------------------------------------------------------------------
emit() {
  printf 'id=%s\n' "$1"
  printf 'slug=%s\n' "$2"
  printf 'name_en=%s\n' "$3"
  printf 'name_zh=%s\n' "$4"
  printf 'jyutping=%s\n' "$5"
  printf 'codename=%s · %s\n' "$3" "$4"
  printf 'photo_url=%s\n' "$6"
  printf 'alt_en=%s\n' "$7"
  printf 'alt_yue=%s\n' "$8"
  printf 'source=%s\n' "$9"
  printf 'image=%s\n' "$attach_image"
  printf 'image_dish=%s\n' "$attach_dish"
}

if curl -fsSL --max-time 60 "$public_index_url" -o "$tmp/public.json" 2>/dev/null; then
  # Which photos are actually published. A dish whose image is not public yet is
  # unavailable to us, however complete its metadata reads.
  : > "$tmp/assets.tsv"
  if command -v gh >/dev/null 2>&1; then
    for tag in $(gh release list --repo "$public_repo" --limit 200 --json tagName --jq '.[].tagName' 2>/dev/null | grep '^catalog-v1'); do
      gh release view "$tag" --repo "$public_repo" --json assets --jq '.assets[].name' 2>/dev/null \
        | while IFS= read -r name; do printf '%s\t%s\n' "$name" "$tag"; done >> "$tmp/assets.tsv"
    done
  fi
  published=$(wc -l < "$tmp/assets.tsv" | tr -d ' ')

  # Flatten the catalog. `name` and `image.alt` are nested objects spread over
  # several lines, and `description` carries its own `en`, so each field is
  # taken once per record and later repeats are ignored.
  awk '
    function val(line,   s) { s = line; sub(/^[^:]*: *"/, "", s); sub(/",?$/, "", s); return s }
    /"id": *"hk-dish-/ { if (id != "") emit(); id = val($0); slug=en=zh=jyut=path=alten=altyue=""; next }
    /"slug": *"/       { if (id != "" && slug  == "") slug  = val($0); next }
    /"en": *"/         { if (id != "" && en    == "") en    = val($0); next }
    /"zhHant": *"/     { if (id != "" && zh    == "") zh    = val($0); next }
    /"jyutping": *"/   { if (id != "" && jyut  == "") jyut  = val($0); next }
    /"path": *"/       { if (id != "" && path  == "") path  = val($0); next }
    /"yue": *"/        { if (id != "" && altyue== "") altyue= val($0); next }
    END { if (id != "") emit() }
    function emit() {
      if (id != "" && path != "")
        printf "%s\t%s\t%s\t%s\t%s\t%s\n", id, slug, en, zh, jyut, path
    }
  ' "$tmp/public.json" > "$tmp/dishes.tsv"

  total=$(wc -l < "$tmp/dishes.tsv" | tr -d ' ')
  echo "release-codename: public catalog — $total dishes, $published published photos, $spent already spent" >&2

  while IFS=$'\t' read -r id slug en zh jyut path; do
    grep -qx "$id" "$tmp/used.txt" && continue
    base=${path##*/}
    tag=$(grep -m1 -P "^\Q$base\E\t" "$tmp/assets.tsv" 2>/dev/null | cut -f2)
    [ -z "$tag" ] && tag=$(awk -F'\t' -v b="$base" '$1==b {print $2; exit}' "$tmp/assets.tsv")
    if [ -z "$tag" ]; then
      continue
    fi
    url="https://github.com/$public_repo/releases/download/$tag/$base"
    emit "$id" "$slug" "$en" "$zh" "$jyut" "$url" \
      "Catalog photograph of $en ($zh) from the public dim sum catalog." \
      "公開點心圖鑑入面「$zh」嘅相。" \
      "public"
    exit 0
  done < "$tmp/dishes.tsv"

  echo "release-codename: no unused dish with a published photo in the public catalog" >&2
else
  echo "release-codename: public catalog unreachable; falling back to the bundled index" >&2
fi

# ---------------------------------------------------------------------------
# Fallback: the bundled index. Never block a release on catalog availability.
# ---------------------------------------------------------------------------
if [ -f "$bundled_index" ]; then
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
  ' "$bundled_index" > "$tmp/bundled.tsv"

  while IFS=$'\t' read -r id slug en zh jyut image alten altyue; do
    grep -qx "$id" "$tmp/used.txt" && continue
    [ -f "$repo_root/assets/dim-sum/$image" ] || continue
    attach_image="assets/dim-sum/$image"
    attach_dish="$id"
    emit "$id" "$slug" "$en" "$zh" "$jyut" "" "$alten" "$altyue" "bundled"
    exit 0
  done < "$tmp/bundled.tsv"
fi

echo "release-codename: no unused dish could be resolved; shipping without a code name" >&2
echo "id="
printf 'image=%s\n' "$attach_image"
printf 'image_dish=%s\n' "$attach_dish"
exit 0
