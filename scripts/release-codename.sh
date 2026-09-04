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

public_index_url="https://raw.githubusercontent.com/Ding-Ding-Projects/dim-sum-photos/main/catalog/index.json"
public_repo="Ding-Ding-Projects/dim-sum-photos"
used=""
output_dir=""
require_published=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --used)
      [ "$#" -ge 2 ] || { echo "release-codename: --used requires a value" >&2; exit 2; }
      used=$2
      shift 2
      ;;
    --output-dir)
      [ "$#" -ge 2 ] || { echo "release-codename: --output-dir requires a value" >&2; exit 2; }
      output_dir=$2
      shift 2
      ;;
    --require-published)
      require_published=1
      shift
      ;;
    *)
      echo "usage: scripts/release-codename.sh [--require-published] [--output-dir DIR] [--used id,id]" >&2
      exit 2
      ;;
  esac
done

tmp=$(mktemp -d)
trap 'rm -rf "$tmp" 2>/dev/null || true' EXIT

printf '%s\n' "$used" \
  | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' \
  | grep -v '^$' | LC_ALL=C sort -u > "$tmp/used.txt" || true
spent=$(wc -l < "$tmp/used.txt" | tr -d ' ')

if [ -n "$output_dir" ]; then
  mkdir -p "$output_dir"
fi

emit() {
  local id=$1 slug=$2 name_en=$3 name_zh=$4 jyutping=$5 photo_url=$6 digest=$7 image=$8 image_bytes=$9
  printf 'id=%s\n' "$id"
  printf 'slug=%s\n' "$slug"
  printf 'name_en=%s\n' "$name_en"
  printf 'name_zh=%s\n' "$name_zh"
  printf 'jyutping=%s\n' "$jyutping"
  printf 'codename=%s · %s\n' "$name_en" "$name_zh"
  printf 'photo_url=%s\n' "$photo_url"
  printf 'image=%s\n' "$image"
  printf 'image_name=%s\n' "codename-${id}.png"
  printf 'image_sha256=%s\n' "${digest#sha256:}"
  printf 'image_bytes=%s\n' "$image_bytes"
  printf 'alt_en=%s\n' "Catalog photograph of $name_en ($name_zh) from the public dim sum catalog."
  printf 'alt_yue=%s\n' "公開點心圖鑑入面「$name_zh」嘅相。"
  printf 'source=public\n'
}

used_bytes=$(printf '%s' "$used" | wc -c | tr -d '[:space:]')
if [ -z "$used_bytes" ] || [ "$used_bytes" -gt 1048576 ]; then
  echo "release-codename: spent-id input exceeds the 1 MiB safety bound" >&2
  emit_empty used-too-large
  exit 0
fi
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

catalog_bytes=$(wc -c < "$tmp/public.json" | tr -d '[:space:]')
if [ -z "$catalog_bytes" ] || [ "$catalog_bytes" -gt 12582912 ]; then
  echo "release-codename: public catalog exceeds the 12 MiB safety bound" >&2
  emit_empty catalog-too-large
  exit 0
fi

if ! jq -e '
  type == "object"
  and .schemaVersion == "1.0.0"
  and (.total | type == "number" and . > 0 and . <= 4000)
  and (.dishes | type == "array" and length > 0 and length <= 4000)
  and (.total == (.dishes | length))
  and ((.dishes | map(.id) | unique | length) == (.dishes | length))
  and ((.dishes | map(.image.path) | unique | length) == (.dishes | length))
  and all(.dishes[];
    (.id | type == "string" and test("^hk-dish-[0-9]{4}$") and (test("[[:cntrl:]]") | not))
    and (.slug | type == "string" and length > 0 and length <= 160 and test("^[a-z0-9]+(-[a-z0-9]+)*$") and (test("[[:cntrl:]]") | not))
    and (.name | type == "object")
    and (.name.en | type == "string" and length > 0 and length <= 160 and (test("[[:cntrl:]]|<!--|-->") | not))
    and (.name.zhHant | type == "string" and length > 0 and length <= 160 and (test("[[:cntrl:]]|<!--|-->") | not))
    and (.jyutping | type == "string" and length <= 160 and (test("[[:cntrl:]]") | not))
    and (.image | type == "object")
    and (.image.path | type == "string" and length > 14 and length <= 240 and test("^images/hk-dish-[0-9]{4}-[a-z0-9-]+\\.png$") and (contains("..") | not) and (test("[[:cntrl:]]") | not))
    and (.image.alt | type == "object")
    and (.image.alt.en | type == "string" and length > 0 and length <= 320 and (test("[[:cntrl:]]") | not))
    and (.image.alt.yue | type == "string" and length > 0 and length <= 320 and (test("[[:cntrl:]]") | not))
  )
' "$tmp/public.json" >/dev/null 2>&1; then
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

if ! gh api --paginate "repos/$public_repo/releases?per_page=100" --jq \
  '.[] | select((.tag_name | startswith("catalog-v1")) and (.draft == false) and (.prerelease == false)) | .tag_name' \
  > "$tmp/catalog-tags.txt" 2>/dev/null; then
  echo "release-codename: public catalog release listing failed" >&2
  emit_empty release-list-failed
  exit 0
fi

while IFS= read -r tag; do
  [ -n "$tag" ] || continue
  if ! printf '%s' "$tag" | grep -Eq '^catalog-v1([.-][a-z0-9]+)*$'; then
    echo "release-codename: release listing contained an unsafe catalog tag" >&2
    emit_empty unsafe-catalog-tag
    exit 0
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

  # Older releases predate the machine-readable marker. Treat their exact
  # `Code name: English · Traditional Chinese` text as spent too, then carry
  # the catalog id forward in the new release. Without this bridge a rerun
  # would happily serve the same dish again under a newly minted marker.
  is_used() {
    local candidate_id="$1" candidate_en="$2" candidate_zh="$3"
    grep -Fqx "$candidate_id" "$tmp/used.txt" && return 0
    grep -Fqx "$candidate_en · $candidate_zh" "$tmp/used.txt" && return 0
    return 1
  }

  while IFS=$'\t' read -r id slug en zh jyut path; do
    is_used "$id" "$en" "$zh" && continue
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
  fi
  if ! jq -e '.assets | type == "array"' "$asset_json" >/dev/null 2>&1; then
    echo "release-codename: published catalog asset response is invalid for $tag" >&2
    emit_empty asset-response-invalid
    exit 0
  fi
  if ! jq -e 'all(.assets[] | select((.name | endswith(".png"))); (.name | type == "string" and length <= 240 and test("^hk-dish-[0-9]{4}-[a-z0-9-]+\\.png$") and (test("[[:cntrl:]]") | not)) and (.contentType == "image/png") and ((.size // 0) > 0 and (.size // 0) <= 16777216))' "$asset_json" >/dev/null 2>&1; then
    echo "release-codename: published catalog asset metadata is outside its safety bounds for $tag" >&2
    emit_empty unsafe-asset-metadata
    exit 0
  fi
  jq -r \
    '.assets[] | select((.name | endswith(".png")) and (.contentType == "image/png") and ((.size // 0) > 0)) | [.name, (.size | tostring), .contentType] | @tsv' \
    "$asset_json" | awk -v catalog_tag="$tag" '{ print $0 "\t" catalog_tag }' >> "$tmp/assets.tsv" || {
      echo "release-codename: published catalog asset parsing failed for $tag" >&2
      emit_empty asset-parse-failed
      exit 0
    }
done < "$tmp/catalog-tags.txt"

if [ ! -s "$tmp/assets.tsv" ]; then
  echo "release-codename: no published catalog-v1* PNG assets were found" >&2
  emit_empty no-published-image
  exit 0
fi

if [ "$(cut -f1 "$tmp/assets.tsv" | sort | uniq -d | wc -l | tr -d '[:space:]')" != "0" ]; then
  echo "release-codename: duplicate published catalog asset names are ambiguous" >&2
  emit_empty ambiguous-image
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
  case "$image_path" in
    "images/$id-"*.png) ;;
    *) continue ;;
  esac
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
