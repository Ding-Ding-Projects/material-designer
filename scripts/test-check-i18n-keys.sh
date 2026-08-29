#!/usr/bin/env bash
# Focused red-green regression for the syntax-aware locale-key checker.
# It uses a temporary copy of the real locale sources, so no source mutation
# survives the run and no build or package toolchain is needed.

set -u -o pipefail

repo_root=$(git rev-parse --show-toplevel) || exit 2
cd "$repo_root" || exit 2

authority="$repo_root/scripts/i18n-handoff-authority.tsv"
checker="$repo_root/scripts/check-i18n-keys.sh"
parser="$repo_root/scripts/i18n-object-keys.awk"
source_root="$repo_root/design/apps/web/src/i18n"
source_i18n="$source_root/locales"

for required in "$authority" "$checker" "$parser" "$source_root/types.ts"; do
  if [ ! -e "$required" ]; then
    echo "test-check-i18n-keys: missing $required" >&2
    exit 2
  fi
done

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fixture="$tmp/web"
mkdir -p "$fixture/src"

section_lines() {
  section=$1
  awk -v wanted="[$section]" '
    /^\[/ { active = ($0 == wanted); next }
    active && NF && $1 !~ /^#/ { print $1 }
  ' "$authority"
}

locales_expected="$tmp/locales.expected"
direct_expected="$tmp/direct.expected"
keys_expected="$tmp/keys.expected"
section_lines locales | LC_ALL=C sort > "$locales_expected"
section_lines direct-locales | LC_ALL=C sort > "$direct_expected"
section_lines handoff-keys | LC_ALL=C sort > "$keys_expected"

locale_count=$(wc -l < "$locales_expected" | tr -d ' ')
direct_count=$(wc -l < "$direct_expected" | tr -d ' ')
key_count=$(wc -l < "$keys_expected" | tr -d ' ')
if [ "$locale_count" -ne 20 ] || [ "$direct_count" -ne 17 ] || [ "$key_count" -ne 27 ]; then
  echo "authority counts changed: locales=$locale_count direct=$direct_count keys=$key_count" >&2
  exit 1
fi

actual_locales="$tmp/locales.actual"
for f in "$source_i18n"/*.ts; do
  name=$(basename "$f" .ts)
  if grep -Eq '^[[:space:]]*export[[:space:]]+const[[:space:]]+[a-zA-Z0-9_]+[[:space:]]*:[[:space:]]*Dict[[:space:]]*=' "$f"; then
    echo "$name"
  fi
done | LC_ALL=C sort > "$actual_locales"
if ! diff -u "$locales_expected" "$actual_locales" >/dev/null; then
  echo "locale authority does not match the exact 20 catalog files" >&2
  diff -u "$locales_expected" "$actual_locales" >&2 || true
  exit 1
fi

actual_direct="$tmp/direct.actual"
for f in "$source_i18n"/*.ts; do
  name=$(basename "$f" .ts)
  if grep -Fxq "$name" "$direct_expected" &&
     grep -Eq '^[[:space:]]*export[[:space:]]+const[[:space:]]+[a-zA-Z0-9_]+[[:space:]]*:[[:space:]]*Dict[[:space:]]*=' "$f"; then
    echo "$name"
  fi
done | LC_ALL=C sort > "$actual_direct"
if ! diff -u "$direct_expected" "$actual_direct" >/dev/null; then
  echo "direct-locale authority does not match the exact 17 catalogs" >&2
  diff -u "$direct_expected" "$actual_direct" >&2 || true
  exit 1
fi

mkdir -p "$fixture/src/i18n/locales"
cp "$source_root/types.ts" "$fixture/src/i18n/types.ts"
for f in "$source_i18n"/*.ts; do
  cp "$f" "$fixture/src/i18n/locales/$(basename "$f")"
done

run_checker() {
  I18N_WEB_ROOT="$fixture" bash "$checker" > "$tmp/checker.log" 2>&1
}

if ! run_checker; then
  echo "baseline checker is red" >&2
  cat "$tmp/checker.log" >&2
  exit 1
fi
if ! grep -Fq 'used but NOT declared: 0' "$tmp/checker.log" ||
   ! grep -Fq 'every used key is declared, and every locale is complete.' "$tmp/checker.log"; then
  echo "baseline checker did not report the expected zero-missing result" >&2
  cat "$tmp/checker.log" >&2
  exit 1
fi

# Confirm the authority keys are recognized on every direct locale, including
# the compact one-line object and multiline properties.
recognized=0
for name in $(cat "$direct_expected"); do
  records="$tmp/$name.records"
  awk -v kind=locale -f "$parser" "$fixture/src/i18n/locales/$name.ts" > "$records"
  while IFS= read -r key; do
    if ! awk -F '\t' -v wanted="$key" '$1 == "K" && $2 == wanted { found = 1 } END { exit(found ? 0 : 1) }' "$records"; then
      echo "$name does not expose authority key $key" >&2
      exit 1
    fi
    recognized=$((recognized + 1))
  done < "$keys_expected"
done

reset_fixture() {
  rm -rf "$fixture/src/i18n"
  mkdir -p "$fixture/src/i18n/locales"
  cp "$source_root/types.ts" "$fixture/src/i18n/types.ts"
  for f in "$source_i18n"/*.ts; do
    cp "$f" "$fixture/src/i18n/locales/$(basename "$f")"
  done
}

expect_red() {
  label=$1
  if run_checker; then
    echo "$label: expected red checker, got green" >&2
    cat "$tmp/checker.log" >&2
    return 1
  fi
  echo "  $label: red"
  return 0
}

reset_fixture
perl -0pi -e "s/'handoff\\.tabHint': 'Review current Material Design 3 token and component ownership', //" "$fixture/src/i18n/locales/ar.ts"
expect_red missing-compact-key || exit 1

reset_fixture
perl -0pi -e "s/  \"handoff\\.promptReadFiles\":\\s*\"[^\"]*\",\\s*//" "$fixture/src/i18n/locales/zh-CN.ts"
expect_red missing-multiline-key || exit 1

reset_fixture
perl -0pi -e "s/^  'handoff\\.toTarget':/\\/\\/  'handoff.toTarget':/m" "$fixture/src/i18n/locales/de.ts"
expect_red commented-key || exit 1

reset_fixture
perl -0pi -e "s/'handoff\\.tabHint': 'Review current Material Design 3 token and component ownership', //" "$fixture/src/i18n/locales/ar.ts"
perl -0pi -e "s/\\z/\\nconst detached = { 'handoff.tabHint': 'detached' };\\n/" "$fixture/src/i18n/locales/ar.ts"
expect_red detached-object || exit 1

reset_fixture
sed -i "s/export const ar: Dict = {/export const ar: Dict = { 'handoff.tabHint': 'duplicate',/" "$fixture/src/i18n/locales/ar.ts"
expect_red duplicate-key || exit 1

reset_fixture
perl -0pi -e "s/'handoff\\.tabHint': 'Review current Material Design 3 token and component ownership'/'handoff.tabHintRenamed': 'Review current Material Design 3 token and component ownership'/" "$fixture/src/i18n/locales/ar.ts"
expect_red renamed-containing-original || exit 1

reset_fixture
perl -0pi -e "s/\\.\\.\\.zhTW/\\.\\.\\.zhCN/" "$fixture/src/i18n/locales/zh-HK.ts"
expect_red zh-HK-inheritance-break || exit 1

reset_fixture
if ! run_checker; then
  echo "checker stayed red after restoring every mutation" >&2
  cat "$tmp/checker.log" >&2
  exit 1
fi

echo "authority: 20 locales, 17 direct locales, 27 handoff keys"
echo "recognized authority properties: $recognized"
echo "baseline: used-but-undeclared 0, missing per-locale 0"
echo "seven deliberate mutations turned the checker red and restoration returned green"
exit 0
