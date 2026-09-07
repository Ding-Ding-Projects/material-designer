#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
workflow="${WORKFLOW_FIXTURE_WORKFLOW:-$repo_root/.github/workflows/pages.yml}"
fixture_root="$(mktemp -d)"
trap 'rm -rf "$fixture_root"' EXIT
mkdir -p "$fixture_root/site" "$fixture_root/tmp"
if [ -n "${WORKFLOW_FIXTURE_REF:-}" ]; then
  workflow="$fixture_root/tmp/baseline-pages.yml"
  git -C "$repo_root" show "${WORKFLOW_FIXTURE_REF}:.github/workflows/pages.yml" > "$workflow"
fi

helper_text="$(
  awk '
    /^[[:space:]]*(escape_html|set_field|set_cell_field|set_link|set_front_attr|set_front_text|validate_front_provenance)\(\) \{/ { capture = 1 }
    capture {
      sub(/^          /, "")
      print
      if ($0 == "}") capture = 0
    }
  ' "$workflow"
)"
[ -n "$helper_text" ] || { echo "Pages helper extraction produced no source" >&2; exit 1; }

export RUNNER_TEMP="$fixture_root/tmp"
export GITHUB_RUN_ID=fixture
export GITHUB_RUN_ATTEMPT=1

reset_fixture() {
  cp "$repo_root/site/index.html" "$fixture_root/site/index.html"
  f="$fixture_root/site/index.html"
  eval "$helper_text"
}

expect_rejected() {
  local description=$1
  shift
  if ( "$@" ); then
    echo "expected rejection: $description" >&2
    exit 1
  fi
}

expected_commit=abcdef0123456789abcdef0123456789abcdef01
installer_url='https://example.invalid/releases/download/v1.2.3/material-designer-1.2.3-win-x64-setup.exe'
image_url='https://example.invalid/releases/download/v1.2.3/hk-dish-0001-example.png'

reset_fixture
set_field tag '1.2.3'
set_field version '1.2.3'
set_field commit "$expected_commit"
set_field installer 'material-designer-1.2.3-win-x64-setup.exe'
set_field sha '012345678901234567890123456789012345678901234567890123456789abcd'
set_field chip '1.2.3 · x64 · 1 MB' 2
set_field image 'hk-dish-0001-example.png'
set_field image-sha '012345678901234567890123456789012345678901234567890123456789abcd'
set_cell_field codename 'Fish & Chips <"daily"> \release'
set_link installer "$installer_url" 2
set_link image "$image_url" 1
set_front_attr 'data-front-version="' '1.2.3'
set_front_attr 'data-front-updated-at="' '2026-08-27T12:34:56.000Z'
set_front_attr 'data-front-source-commit="' "$expected_commit"
set_front_text 'data-front-provenance-value="version"' '1.2.3'
set_front_text 'data-front-provenance-value="updated-at"' '2026-08-27T12:34:56.000Z'
set_front_text 'data-front-provenance-value="status" role="status" aria-live="polite"' 'Provenance verified'

grep -F 'Fish &amp; Chips &lt;&quot;daily&quot;&gt; \release</td>' "$f" >/dev/null
awk -v marker='data-release-href="installer"' -v expected="$installer_url" '
  index($0, marker) > 0 {
    href_pos = index($0, " href=\"")
    if (href_pos == 0) exit 1
    href_tail = substr($0, href_pos + 7)
    href_end = index(href_tail, "\"")
    if (href_end == 0 || substr(href_tail, 1, href_end - 1) != expected) exit 1
    matches++
  }
  END { exit matches == 2 ? 0 : 1 }
' "$f"
awk -v marker='data-release-href="image"' -v expected="$image_url" '
  index($0, marker) > 0 {
    href_pos = index($0, " href=\"")
    if (href_pos == 0) exit 1
    href_tail = substr($0, href_pos + 7)
    href_end = index(href_tail, "\"")
    if (href_end == 0 || substr(href_tail, 1, href_end - 1) != expected) exit 1
    matches++
  }
  END { exit matches == 1 ? 0 : 1 }
' "$f"
grep -F 'data-release="chip">1.2.3 · x64 · 1 MB<' "$f" | wc -l | tr -d '[:space:]' | grep -qx '2'
grep -F "data-front-version=\"1.2.3\"" "$f" | wc -l | tr -d '[:space:]' | grep -qx '1'
grep -F 'data-front-provenance-value="status" role="status" aria-live="polite">Provenance verified<' "$f" | wc -l | tr -d '[:space:]' | grep -qx '1'

validate_front_provenance '1.2.3' "$expected_commit" '1.2.3' "$expected_commit" '2026-08-27T12:34:56Z' verified
validate_front_provenance '1.2.3' "$expected_commit" '1.2.3' "$expected_commit" '2026-08-27T12:34:56.123456789+05:30' verified
expect_rejected 'invalid timestamp' validate_front_provenance '1.2.3' "$expected_commit" '1.2.3' "$expected_commit" '2026-08-27 12:34:56Z' verified
expect_rejected 'mismatched version' validate_front_provenance '1.2.3' "$expected_commit" '1.2.4' "$expected_commit" '2026-08-27T12:34:56Z' verified
expect_rejected 'mismatched commit' validate_front_provenance '1.2.3' "$expected_commit" '1.2.3' '0123456789012345678901234567890123456789' '2026-08-27T12:34:56Z' verified
expect_rejected 'unverified provenance' validate_front_provenance '1.2.3' "$expected_commit" '1.2.3' "$expected_commit" '2026-08-27T12:34:56Z' unavailable
expect_rejected 'invalid calendar date' validate_front_provenance '1.2.3' "$expected_commit" '1.2.3' "$expected_commit" '2026-02-30T12:34:56Z' verified
expect_rejected 'invalid hour' validate_front_provenance '1.2.3' "$expected_commit" '1.2.3' "$expected_commit" '2026-08-27T25:34:56Z' verified
expect_rejected 'invalid timezone offset' validate_front_provenance '1.2.3' "$expected_commit" '1.2.3' "$expected_commit" '2026-08-27T12:34:56+99:99' verified
if [ "${PROVENANCE_ONLY:-0}" = 1 ]; then
  echo 'PASS: Pages HTML population and provenance validation, including seven negative identity and timestamp cases.'
  exit 0
fi

reset_fixture
sed -i '0,/data-front-updated-at=""/s//data-front-updated-at="already-filled"/' "$f"
set_front_attr 'data-front-updated-at="' '2026-08-27T12:34:56Z'
grep -F 'data-front-updated-at="2026-08-27T12:34:56Z"' "$f" >/dev/null

reset_fixture
sed -i '0,/data-release="tag"/s//data-release="tag-missing"/' "$f"
expect_rejected 'missing release marker' set_field tag '1.2.3'

reset_fixture
sed -i '0,/data-front-version=""/s//data-front-version="" data-front-version="duplicate"/' "$f"
expect_rejected 'duplicate provenance marker' set_front_attr 'data-front-version="' '1.2.3'

reset_fixture
sed -i '0,/data-front-source-commit=""/s//data-front-source-commit="unterminated/' "$f"
expect_rejected 'malformed provenance marker' set_front_attr 'data-front-source-commit="' "$expected_commit"

reset_fixture
sed -i '0,/data-release-href="installer" data-release-pending="true" href="#"/s//data-release-href="installer" data-release-pending="true" href="https:\/\/example.invalid\/old"/' "$f"
set_link installer "$installer_url" 2

release_workflow="$repo_root/.github/workflows/release.yml"
release_marker_text="$(awk '
  /^[[:space:]]*release_marker\(\) \{/ { capture = 1 }
  capture {
    sub(/^          /, "")
    print
    if ($0 == "}") exit
  }
' "$release_workflow")"
marker_calls="$(awk '/^[[:space:]]*release_marker [a-z0-9-]+ / { sub(/^            /, ""); print }' "$release_workflow")"
producer_validation="$(awk '/^[[:space:]]*# Derive catalog identity / { capture=1; next } /^[[:space:]]*release_marker\(\)/ { capture=0 } capture { sub(/^          /, ""); print }' "$release_workflow")"
consumer_validation="$(awk '/^[[:space:]]*release_tag_marker=\$\(marker_value / { capture=1 } /^[[:space:]]*installer=\$\(printf / { capture=0 } capture { sub(/^          /, ""); print }' "$workflow")"
marker_reader="$(awk '/^[[:space:]]*marker_value\(\)/ { capture=1 } capture { sub(/^          /, ""); print; if ($0 == "}") exit }' "$workflow")"
[ -n "$release_marker_text" ] && [ -n "$marker_calls" ] || { echo 'release marker extraction produced no source' >&2; exit 1; }
eval "$release_marker_text"
TAG='v1.2.3-r1.1'
APP_VERSION='1.2.3'
GITHUB_SHA="$expected_commit"
ASSET_NAME='material-designer-1.2.3-win-x64-setup.exe'
CODENAME='Example dish · 示例點心'
DISH_ID='hk-dish-0001'
DISH_PHOTO_URL='https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/hk-dish-0001-example.png'
DISH_PHOTO_NAME="codename-${DISH_ID}.png"
DISH_PHOTO_SHA='012345678901234567890123456789012345678901234567890123456789abcd'
eval "$producer_validation"
marker_body="$(eval "$marker_calls")"
for marker in release-tag release-version release-commit release-package release-installer release-codename dim-sum-id dim-sum-catalog-tag dim-sum-image-source dim-sum-image-dish dim-sum-image-asset dim-sum-image-sha256; do
  printf '%s\n' "$marker_body" | grep -F -c "<!-- $marker: " | grep -qx '1'
done
printf '%s\n' "$marker_body" | grep -F "<!-- release-commit: $expected_commit -->" >/dev/null
printf '%s\n' "$marker_body" | grep -F "<!-- dim-sum-image-source: $DISH_PHOTO_URL -->" >/dev/null
printf '%s\n' "$marker_body" | grep -F "<!-- dim-sum-image-asset: $DISH_PHOTO_NAME -->" >/dev/null

validate_markers() {
  local body=$1 release_tag=$TAG expected_sha=$expected_commit
  eval "$marker_reader"
  eval "$consumer_validation"
}
validate_markers "$marker_body"
for marker in release-tag release-version release-commit release-package release-installer release-codename dim-sum-id dim-sum-catalog-tag dim-sum-image-source dim-sum-image-dish dim-sum-image-asset dim-sum-image-sha256; do
  missing=$(printf '%s\n' "$marker_body" | grep -Fv "<!-- $marker: ")
  expect_rejected "missing $marker" validate_markers "$missing"
  duplicate=$(printf '%s\n' "$marker_body" | grep -F "<!-- $marker: ")
  expect_rejected "duplicate $marker" validate_markers "$marker_body"$'\n'"$duplicate"
done
for replacement in 'dim-sum-image-asset: codename-hk-dish-9999.png' 'dim-sum-image-source: https://example.invalid/hk-dish-0001-example.png' 'dim-sum-image-source: https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/hk-dish-9999-example.png' 'dim-sum-image-source: https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/../hk-dish-0001-example.png' 'dim-sum-image-sha256: invalid' 'dim-sum-image-dish: hk-dish-9999'; do
  key=${replacement%%:*}
  changed=$(printf '%s\n' "$marker_body" | awk -v key="$key" -v replacement="$replacement" 'index($0, "<!-- " key ": ") { print "<!-- " replacement " -->"; next } { print }')
  expect_rejected "invalid $key" validate_markers "$changed"
done
expect_rejected 'unterminated comment' validate_markers "${marker_body% -->}"
echo 'PASS: Pages release helpers, producer fields, and consumer validation execute against workflow source with negative boundary coverage.'
