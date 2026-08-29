#!/usr/bin/env bash
# Select the next unused dish whose public catalog photograph is published.
#
# The public catalog is the only authority for release code names. When the
# caller supplies --output-dir, the selected public PNG is downloaded into
# that run-scoped directory, checked against GitHub's recorded asset digest,
# and exposed as an output for the release workflow to decode and stage.

set -u -o pipefail

repo_root=$(git rev-parse --show-toplevel) || exit 2
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
cleanup() { rm -rf "$tmp"; }
trap cleanup EXIT

printf '%s\n' "$used" | tr ',' '\n' | sed 's/[[:space:]]//g' | grep -v '^$' | LC_ALL=C sort -u > "$tmp/used.txt" || true
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

download_public_image() {
  local url=$1 id=$2 expected_digest=$3 expected_bytes=$4 dest magic actual_digest actual_bytes
  [ -n "$output_dir" ] || return 0
  dest="$output_dir/codename-${id}.png"
  rm -f -- "$dest"
  curl --fail --silent --show-error --location --max-time 120 --proto '=https' --tlsv1.2 "$url" --output "$dest" || return 1
  [ -s "$dest" ] || return 1
  magic=$(od -An -tx1 -N8 "$dest" | tr -d ' \n')
  [ "$magic" = "89504e470d0a1a0a" ] || return 1
  actual_bytes=$(wc -c < "$dest" | tr -d ' ')
  [ "$actual_bytes" = "$expected_bytes" ] || return 1
  actual_digest=$(sha256sum "$dest" | awk '{print $1}')
  [ "$actual_digest" = "${expected_digest#sha256:}" ] || return 1
  printf '%s\t%s\n' "$dest" "$actual_bytes"
}

if ! curl --fail --silent --show-error --location --max-time 60 --proto '=https' --tlsv1.2 "$public_index_url" --output "$tmp/public.json"; then
  echo "release-codename: public catalog is unavailable" >&2
  [ "$require_published" -eq 1 ] && exit 1
else
  if ! command -v jq >/dev/null 2>&1 || ! command -v gh >/dev/null 2>&1; then
    echo "release-codename: jq and gh are required to verify published catalog assets" >&2
    [ "$require_published" -eq 1 ] && exit 1
  else
    jq -r '.dishes[] | [.id, .slug, .name.en, .name.zhHant, (.jyutping // ""), .image.path] | @tsv' "$tmp/public.json" > "$tmp/dishes.tsv"
    gh api --paginate "repos/$public_repo/releases?per_page=100" 2>/dev/null \
      | jq -s -r 'add[] | select(.draft == false and .prerelease == false and (.tag_name | startswith("catalog-v1"))) | . as $release | .assets[]? | select(.state == "uploaded" and (.name | endswith(".png"))) | [.name, $release.tag_name, .browser_download_url, (.digest // ""), (.size // 0)] | @tsv' \
      > "$tmp/assets.tsv" || true
    published=$(wc -l < "$tmp/assets.tsv" | tr -d ' ')
    total=$(wc -l < "$tmp/dishes.tsv" | tr -d ' ')
    echo "release-codename: public catalog $total dishes, $published published photos, $spent already spent" >&2

    while IFS=$'\t' read -r id slug name_en name_zh jyutping path; do
      [ -n "$id" ] || continue
      grep -Fxq "$id" "$tmp/used.txt" && continue
      base=${path##*/}
      asset=$(awk -F '\t' -v b="$base" '$1 == b { print; exit }' "$tmp/assets.tsv")
      [ -n "$asset" ] || continue
      IFS=$'\t' read -r asset_name tag photo_url digest expected_bytes <<EOF
$asset
EOF
      [ "$asset_name" = "$base" ] || continue
      printf '%s' "$digest" | grep -Eq '^sha256:[0-9a-fA-F]{64}$' || continue
      expected_url="https://github.com/$public_repo/releases/download/$tag/$base"
      [ "$photo_url" = "$expected_url" ] || continue
      image_path=""
      image_bytes="$expected_bytes"
      if [ -n "$output_dir" ]; then
        downloaded=$(download_public_image "$photo_url" "$id" "$digest" "$expected_bytes") || {
          echo "release-codename: published image failed validation for $id" >&2
          rm -f -- "$output_dir/codename-${id}.png"
          continue
        }
        image_path=${downloaded%%$'\t'*}
        image_bytes=${downloaded#*$'\t'}
      fi
      emit "$id" "$slug" "$name_en" "$name_zh" "$jyutping" "$photo_url" "$digest" "$image_path" "$image_bytes"
      exit 0
    done < "$tmp/dishes.tsv"

    echo "release-codename: no unused dish has a published, digest-recorded photo" >&2
    [ "$require_published" -eq 1 ] && exit 1
  fi
fi

if [ "$require_published" -eq 1 ]; then
  echo "release-codename: a published catalog photo is required" >&2
  exit 1
fi

# The non-required invocation remains useful to local callers that only need a
# best-effort name. It never supplies an image to the release workflow.
echo "release-codename: no public code name could be resolved" >&2
printf 'id=\nsource=unavailable\n'
exit 0
