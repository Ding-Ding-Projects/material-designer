#!/usr/bin/env bash
# Offline selector behavior: real jq and hashing, stubbed catalog/network commands.
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
selector="${SELECTOR_FIXTURE_SOURCE:-$repo_root/scripts/release-codename.sh}"
command -v jq >/dev/null || { echo 'jq is required for the offline selector fixture' >&2; exit 1; }
fixture="$(mktemp -d)"
trap 'rm -rf "$fixture"' EXIT
mkdir -p "$fixture/bin" "$fixture/out"
export SELECTOR_FIXTURE_ROOT="$fixture"
printf '\211PNG\r\n\032\nfixture-public-photo' > "$fixture/photo.png"
digest=$(sha256sum "$fixture/photo.png" | awk '{print $1}')
bytes=$(wc -c < "$fixture/photo.png" | tr -d '[:space:]')
jq -n '{
  schemaVersion:"1.0.0", total:2,
  dishes:[range(1;3) | . as $n | ("hk-dish-000" + ($n|tostring)) as $id |
    {id:$id, slug:"example", name:{en:("Example " + ($n|tostring)), zhHant:("示例" + ($n|tostring))},
     jyutping:"", image:{path:("images/" + $id + "-example.png"), alt:{en:"Example photograph", yue:"示例相片"}}}]
}' > "$fixture/catalog-original.json"
jq -n --arg digest "sha256:$digest" --argjson bytes "$bytes" '[
 {draft:false, prerelease:false, tag_name:"catalog-v1",
  assets:[range(1;3) | ("hk-dish-000" + (.|tostring) + "-example.png") as $name |
    {name:$name, state:"uploaded", content_type:"image/png", size:$bytes, digest:$digest,
     browser_download_url:("https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/" + $name)}]}
]' > "$fixture/releases-original.json"
cat > "$fixture/bin/curl" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
url="" dest=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output|-o) dest=$2; shift 2 ;;
    https://*) url=$1; shift ;;
    *) shift ;;
  esac
done
[ -n "$dest" ]
case "$url" in
  https://raw.githubusercontent.com/Ding-Ding-Projects/dim-sum-photos/main/catalog/index.json)
    [ "${FIXTURE_CASE:-}" != unreachable ] || exit 22
    cp "$SELECTOR_FIXTURE_ROOT/catalog.json" "$dest" ;;
  https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/hk-dish-000[12]-example.png)
    [ "${FIXTURE_CASE:-}" != download-failed ] || exit 22
    if [ "${FIXTURE_CASE:-}" = corrupt ]; then printf corrupt > "$dest"
    else cp "$SELECTOR_FIXTURE_ROOT/photo.png" "$dest"; fi ;;
  *) echo "unexpected fixture URL" >&2; exit 2 ;;
esac
STUB
cat > "$fixture/bin/gh" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
[ "$*" = "api --paginate repos/Ding-Ding-Projects/dim-sum-photos/releases?per_page=100" ] || exit 2
[ "${FIXTURE_CASE:-}" != release-read-failed ] || exit 1
cat "$SELECTOR_FIXTURE_ROOT/releases.json"
STUB
chmod +x "$fixture/bin/curl" "$fixture/bin/gh"
export PATH="$fixture/bin:$PATH"
reset_case() {
  cp "$fixture/catalog-original.json" "$fixture/catalog.json"
  cp "$fixture/releases-original.json" "$fixture/releases.json"
  export FIXTURE_CASE=valid
}
run_selector() {
  bash "$selector" --require-published --output-dir "$fixture/out" "$@" > "$fixture/selected.env" 2> "$fixture/result.log" || { cat "$fixture/result.log" >&2; return 1; }
}
reject() {
  local name=$1
  shift
  if run_selector "$@"; then echo "FAIL: selector accepted $name" >&2; exit 1; fi
  ! grep -q '^source=public$' "$fixture/selected.env"
  echo "PASS: rejects $name"
}
reset_case
run_selector
grep -qx 'id=hk-dish-0001' "$fixture/selected.env"
grep -qx 'image_name=codename-hk-dish-0001.png' "$fixture/selected.env"
grep -qx "image_sha256=$digest" "$fixture/selected.env"
cmp "$fixture/photo.png" "$fixture/out/codename-hk-dish-0001.png"
echo 'PASS: selects and hashes a published catalog photo with empty jyutping'
run_selector --used hk-dish-0001
grep -qx 'id=hk-dish-0002' "$fixture/selected.env"
run_selector --used 'Example 1 · 示例1'
grep -qx 'id=hk-dish-0002' "$fixture/selected.env"
echo 'PASS: spent ids and historical code names both advance selection'
reject exhausted --used 'hk-dish-0001,hk-dish-0002'
for name in unreachable release-read-failed download-failed corrupt; do
  reset_case
  export FIXTURE_CASE=$name
  reject "$name"
done
for mutation in \
  '.schemaVersion = "bad"' \
  '.dishes[0].name.en = "bad\noutput=value"' \
  '.dishes[0].name.en = "<!-- forged -->"' \
  '.dishes[0].image.path = "images/../escape.png"' \
  '.dishes[0].image.path = "images/hk-dish-9999-example.png"' \
  '.dishes[1].id = .dishes[0].id'; do
  reset_case
  jq "$mutation" "$fixture/catalog-original.json" > "$fixture/catalog.json"
  reject "catalog mutation $mutation"
done
for mutation in \
  '.[0].assets |= map(.digest = "sha256:invalid")' \
  '.[0].assets |= map(.digest = ("sha256:" + ("0" * 64)))' \
  '.[0].assets |= map(.size = 16777217)' \
  '.[0].assets |= map(.size += 1)' \
  '.[0].assets |= map(.content_type = "text/plain")' \
  '.[0].assets |= map(.browser_download_url = "https://example.invalid/photo.png")' \
  '.[0].assets += [.[0].assets[0]]' \
  '.[0].draft = true' \
  '.[0].tag_name = "catalog-v1/unsafe"'; do
  reset_case
  jq "$mutation" "$fixture/releases-original.json" > "$fixture/releases.json"
  reject "asset mutation $mutation"
done
reset_case
jq '.dishes[0].name.en = "Fish & Chips \\ special"' "$fixture/catalog-original.json" > "$fixture/catalog.json"
run_selector
grep -Fx 'name_en=Fish & Chips \ special' "$fixture/selected.env" >/dev/null
echo 'PASS: catalog wording preserves literal backslashes and ampersands'
echo 'PASS: offline release code-name fixture completed without live catalog or photo access.'
