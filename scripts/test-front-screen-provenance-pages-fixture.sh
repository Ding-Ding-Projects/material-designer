#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
workflow="$repo_root/.github/workflows/pages.yml"
fixture_root="$(mktemp -d)"
trap 'rm -rf "$fixture_root"' EXIT
mkdir -p "$fixture_root/site"

helper_text="$(
  awk '
    /^[[:space:]]*set_field\(\) \{/ { capture = 1 }
    /^[[:space:]]*set_field tag[[:space:]]/ { capture = 0 }
    capture { sub(/^          /, ""); print }
  ' "$workflow"
)"
if [ -z "$helper_text" ]; then
  echo "Pages helper extraction produced no source" >&2
  exit 1
fi

run_helpers() {
  cp "$repo_root/site/index.html" "$fixture_root/site/index.html"
  f="$fixture_root/site/index.html"
  eval "$helper_text"
  set_field tag "1.2.3"
  set_field version "1.2.3"
  set_field commit "abcdef0123456789abcdef0123456789abcdef01"
  set_field installer "material-designer-1.2.3-win-x64-setup.exe"
  set_field sha "012345678901234567890123456789012345678901234567890123456789abcd"
  set_field chip "1.2.3 · x64 · 1 MB" 2
  set_field codename "Example dish" 1
  set_release_href installer "https://example.invalid/releases/download/v1.2.3/material-designer-1.2.3-win-x64-setup.exe" 2
  set_front_value 'data-front-version=""' 'data-front-version="1.2.3"'
  set_front_value 'data-front-updated-at=""' 'data-front-updated-at="2026-08-27T12:34:56.000Z"'
  set_front_value 'data-front-source-commit=""' 'data-front-source-commit="abcdef0123456789abcdef0123456789abcdef01"'
  set_front_value 'data-front-provenance-value="version">Unavailable' 'data-front-provenance-value="version">1.2.3'
  set_front_value 'data-front-provenance-value="updated-at">Unavailable' 'data-front-provenance-value="updated-at">2026-08-27T12:34:56.000Z'
  set_front_value 'data-front-provenance-value="status" role="status" aria-live="polite">Unavailable' 'data-front-provenance-value="status" role="status" aria-live="polite">Provenance verified'
}

run_helpers
grep -F 'data-release="chip">1.2.3 · x64 · 1 MB' "$f" | wc -l | grep -qx '2'
grep -F 'data-release-href="installer"' "$f" | grep -F 'href="https://example.invalid/releases/download/v1.2.3/material-designer-1.2.3-win-x64-setup.exe"' | wc -l | grep -qx '2'
grep -F 'data-front-provenance-value="status" role="status" aria-live="polite">Provenance verified' "$f" | wc -l | grep -qx '1'

run_helpers
sed -i 's/data-release="tag"/data-release="tag-missing"/' "$f"
if set_field tag "1.2.3"; then
  echo "missing release marker stayed green" >&2
  exit 1
fi

cp "$repo_root/site/index.html" "$fixture_root/site/index.html"
f="$fixture_root/site/index.html"
eval "$helper_text"
sed -i 's|data-release-href="installer" data-release-pending="true" href="#"|data-release-href="installer" data-release-pending="true" href="https://example.invalid/old"|' "$f"
if set_release_href installer "https://example.invalid/releases/download/v1.2.3/material-designer-1.2.3-win-x64-setup.exe" 2; then
  echo "wrong installer marker stayed green" >&2
  exit 1
fi

run_helpers
sed -i 's/data-front-updated-at=""/data-front-updated-at="already-filled"/' "$f"
if set_front_value 'data-front-updated-at=""' 'data-front-updated-at="2026-08-27T12:34:56.000Z"'; then
  echo "missing front-screen marker stayed green" >&2
  exit 1
fi

echo "PASS: Pages helpers execute against a real temporary site fixture and reject missing or wrong markers."
