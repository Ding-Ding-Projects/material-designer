#!/usr/bin/env bash
# Exercise delivery evidence producers without building or downloading assets.
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
fixture="$(mktemp -d)"
trap 'rm -rf "$fixture"' EXIT
pages="$repo_root/.github/workflows/pages.yml"
release="$repo_root/.github/workflows/release.yml"
if [ -n "${DELIVERY_EVIDENCE_REF:-}" ]; then
  pages="$fixture/pages.yml"
  release="$fixture/release.yml"
  git -C "$repo_root" show "${DELIVERY_EVIDENCE_REF}:.github/workflows/pages.yml" > "$pages"
  git -C "$repo_root" show "${DELIVERY_EVIDENCE_REF}:.github/workflows/release.yml" > "$release"
fi
expect_rejected() {
  local name=$1
  shift
  if ( "$@" ); then echo "FAIL: accepted $name" >&2; exit 1; fi
  echo "PASS: rejects $name"
}
if [ "${DELIVERY_EVIDENCE_CASE:-all}" != checksum ]; then
  mkdir "$fixture/counter"
  git -C "$fixture/counter" init -q
  git -C "$fixture/counter" config core.autocrlf false
  printf 'export const example = 1;\n' > "$fixture/counter/example.js"
  git -C "$fixture/counter" add -- example.js
  git -C "$fixture/counter" -c user.name='Claude Fable 5.1' -c user.email='noreply@anthropic.com' commit -q -m 'Create a one-line counter fixture' -m 'One line is enough to put the counter on the clock. 一行都夠叫計數器開工。' -m 'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'
  counter_output=$(cd "$fixture/counter" && node "$repo_root/scripts/line-count.mjs")
  line_count_check=$(awk '/current release has no line-count evidence/ { sub(/^          /, ""); print }' "$pages")
  [ -n "$line_count_check" ] || { echo 'FAIL: Pages line-count consumer disappeared' >&2; exit 1; }
  validate_counter() {
    local body=$1
    eval "$line_count_check"
  }
  validate_counter "$counter_output"
  echo 'PASS: actual committed counter output is accepted by the Pages consumer'
  expect_rejected 'absent counter output' validate_counter ''
  expect_rejected 'removed counter heading' validate_counter "$(printf '%s\n' "$counter_output" | sed '/^### Line count$/d')"
  expect_rejected 'lookalike counter heading' validate_counter 'prefix ### Line count suffix'
fi
if [ "${DELIVERY_EVIDENCE_CASE:-all}" != line-count ]; then
  printf 'delivery checksum fixture\n' > "$fixture/checksum.bin"
  if command -v cygpath >/dev/null 2>&1; then
    staged_path=$(cygpath -w "$fixture/checksum.bin")
  else
    staged_path="$fixture/checksum\fixture.bin"
    cp "$fixture/checksum.bin" "$staged_path"
  fi
  escaped=$(sha256sum "$staged_path" | awk '{print $1}')
  case "$escaped" in \\*) ;; *) echo 'FAIL: fixture did not exercise escaped filename output' >&2; exit 1 ;; esac
  expected=$(node -e 'process.stdout.write(require("node:crypto").createHash("sha256").update("delivery checksum fixture\n").digest("hex"))')
  receipt_hash_source=$(awk '/^[[:space:]]*staged_sha=/{sub(/^              /, "");print} /staged asset checksum is malformed/{sub(/^              /, "");print}' "$release")
  [ -n "$receipt_hash_source" ] || { echo 'FAIL: receipt checksum producer disappeared' >&2; exit 1; }
  eval "$receipt_hash_source"
  [ "$staged_sha" = "$expected" ] || { echo 'FAIL: receipt checksum contains filename escape metadata' >&2; exit 1; }
  printf '%s' "$staged_sha" | grep -Eq '^[0-9a-f]{64}$'
  echo 'PASS: receipt hash of a native backslash path is exactly the independent 64-character SHA-256'
  image_hash_source=$(awk '/^[[:space:]]*image_actual_sha=/{sub(/^          /, "");print}' "$pages")
  [ -n "$image_hash_source" ] || { echo 'FAIL: Pages image checksum producer disappeared' >&2; exit 1; }
  if command -v cygpath >/dev/null 2>&1; then verify_dir=$(cygpath -w "$fixture"); image_asset=checksum.bin
  else verify_dir=$fixture; image_asset='checksum\fixture.bin'; fi
  eval "$image_hash_source"
  [ "$image_actual_sha" = "$expected" ] || { echo 'FAIL: Pages image checksum contains filename escape metadata' >&2; exit 1; }
  echo 'PASS: Pages image hash also ignores filename escape metadata'
  checksum_guard=$(awk '/staged asset checksum is malformed/{sub(/^              /, "");print}' "$release")
  [ -n "$checksum_guard" ] || { echo 'FAIL: receipt checksum validation disappeared' >&2; exit 1; }
  validate_digest() { local staged_sha=$1; eval "$checksum_guard"; }
  expect_rejected 'escaped receipt digest' validate_digest "\\$expected"
  expect_rejected 'truncated receipt digest' validate_digest "${expected:1}"
fi
echo 'PASS: focused delivery evidence fixture completed.'
