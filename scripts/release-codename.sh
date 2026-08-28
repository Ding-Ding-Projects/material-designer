#!/usr/bin/env bash
# Select one unused dish whose public photograph is already published.
#
# The public catalog is the only source of release code-name metadata. A dish
# is eligible only when its image path is present as a non-empty PNG asset on a
# published catalog-v1* release. The consumer repository is never used as a
# fallback for a code name or photograph.
#
# Usage:
#   scripts/release-codename.sh
#   scripts/release-codename.sh --used hk-dish-0001,hk-dish-0002
#
# Without --used, ids are read from standard input, one per line. The command
# emits KEY=VALUE records suitable for GITHUB_OUTPUT. If the catalog or its
# published assets cannot be resolved, it exits successfully with an empty id
# and source=unavailable. Code-name absence alone does not fail a release, but
# the release workflow independently fails when the required image is absent.

set -u -o pipefail

repo_root=$(git rev-parse --show-toplevel) || exit 2
public_index_url="https://raw.githubusercontent.com/Ding-Ding-Projects/dim-sum-photos/main/catalog/index.json"
public_repo="Ding-Ding-Projects/dim-sum-photos"

used=""
if [ "${1:-}" = "--used" ]; then
  used=$(printf '%s' "${2:-}" | tr ',' '\n')
elif [ ! -t 0 ]; then
  used=$(cat)
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp" 2>/dev/null || true' EXIT

emit_empty() {
  local reason=${1:-unavailable}
  printf 'id=\nslug=\nname_en=\nname_zh=\njyutping=\n'
  printf 'codename=\nphoto_url=\nimage=\nimage_dish=\nimage_bytes=\n'
  printf 'image_content_type=\nimage_tag=\nalt_en=\nalt_yue=\nsource=unavailable\n'
  printf 'reason=%s\n' "$reason"
}

printf '%s\n' "$used" | tr ',' '\n' | sed 's/^ *//; s/ *$//' | grep -v '^$' | LC_ALL=C sort -u > "$tmp/used.txt" || true

if ! command -v jq >/dev/null 2>&1; then
  echo "release-codename: jq is unavailable; no public catalog selection" >&2
  emit_empty missing-jq
  exit 0
fi

if ! curl -fsSL --max-time 60 "$public_index_url" -o "$tmp/public.json" 2>/dev/null; then
  echo "release-codename: public catalog is unavailable" >&2
  emit_empty catalog-unreachable
  exit 0
fi

if ! jq -e '.schemaVersion == "1.0.0" and (.dishes | type == "array")' "$tmp/public.json" >/dev/null 2>&1; then
  echo "release-codename: public catalog schema is invalid" >&2
  emit_empty catalog-invalid
  exit 0
fi

: > "$tmp/assets.tsv"
if ! command -v gh >/dev/null 2>&1; then
  echo "release-codename: gh is unavailable; published catalog assets cannot be verified" >&2
  emit_empty missing-gh
  exit 0
fi

while IFS= read -r tag; do
  [ -n "$tag" ] || continue
  gh release view "$tag" --repo "$public_repo" --json assets --jq \
    '.assets[] | select((.name | endswith(".png")) and (.contentType == "image/png") and ((.size // 0) > 0)) | [.name, (.size | tostring), .contentType] | @tsv' \
    2>/dev/null | awk -v catalog_tag="$tag" '{ print $0 "\t" catalog_tag }' >> "$tmp/assets.tsv" || {
      echo "release-codename: could not read published assets for $tag" >&2
      emit_empty asset-inventory-failed
      exit 0
    }
done < <(gh release list --repo "$public_repo" --limit 1000 --json tagName,isDraft,isPrerelease --jq \
  '.[] | select((.tagName | startswith("catalog-v1")) and (.isDraft == false) and (.isPrerelease == false)) | .tagName' 2>/dev/null)

if [ ! -s "$tmp/assets.tsv" ]; then
  echo "release-codename: no published catalog-v1* PNG assets were found" >&2
  emit_empty no-published-image
  exit 0
fi

if ! jq -r '.dishes[] | [.id, .slug, .name.en, .name.zhHant, .jyutping, .image.path, .image.alt.en, .image.alt.yue] | @tsv' "$tmp/public.json" > "$tmp/dishes.tsv"; then
  echo "release-codename: public catalog dish records could not be parsed" >&2
  emit_empty catalog-dishes-invalid
  exit 0
fi

selected=0
while IFS=$'\t' read -r id slug name_en name_zh jyutping image_path alt_en alt_yue; do
  [ -n "$id" ] || continue
  if grep -Fqx "$id" "$tmp/used.txt" || grep -Fqx "$name_en · $name_zh" "$tmp/used.txt"; then
    continue
  fi
  image_asset=${image_path##*/}
  asset_row=$(awk -F '\t' -v wanted="$image_asset" '$1 == wanted { print; exit }' "$tmp/assets.tsv")
  [ -n "$asset_row" ] || continue
  IFS=$'\t' read -r published_asset image_bytes image_content_type image_tag <<< "$asset_row"
  [ "$published_asset" = "$image_asset" ] || continue
  photo_url="https://github.com/$public_repo/releases/download/$image_tag/$published_asset"

  printf 'id=%s\n' "$id"
  printf 'slug=%s\n' "$slug"
  printf 'name_en=%s\n' "$name_en"
  printf 'name_zh=%s\n' "$name_zh"
  printf 'jyutping=%s\n' "$jyutping"
  printf 'codename=%s · %s\n' "$name_en" "$name_zh"
  printf 'photo_url=%s\n' "$photo_url"
  printf 'image=%s\n' "$published_asset"
  printf 'image_dish=%s\n' "$id"
  printf 'image_bytes=%s\n' "$image_bytes"
  printf 'image_content_type=%s\n' "$image_content_type"
  printf 'image_tag=%s\n' "$image_tag"
  printf 'alt_en=%s\n' "$alt_en"
  printf 'alt_yue=%s\n' "$alt_yue"
  printf 'source=public\n'
  printf 'reason=selected-unused-published-image\n'
  selected=1
  break
done < "$tmp/dishes.tsv"

[ "$selected" = 1 ] && exit 0

echo "release-codename: no unused dish with a published image was found" >&2
emit_empty no-unused-published-image
exit 0
