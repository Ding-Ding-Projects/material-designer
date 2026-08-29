#!/usr/bin/env bash
set -u -o pipefail

root=${1:-$(git rev-parse --show-toplevel)}
release="$root/.github/workflows/release.yml"
pages="$root/.github/workflows/pages.yml"
build="$root/build.bat"
installer="$root/build-installer.bat"
codename="$root/scripts/release-codename.sh"
validator="$root/scripts/validate-dim-sum-image.ps1"
builder="$root/design/tools/pack/src/win/builder.ts"

fail() { echo "release contract failure: $1" >&2; exit 1; }
has() { grep -F -- "$2" "$1" >/dev/null || fail "$3"; }
has_regex() { grep -Eq -- "$2" "$1" || fail "$3"; }

trigger_block=$(sed -n '/^on:/,/^permissions:/p' "$pages")
printf '%s\n' "$trigger_block" | grep -Eq '^  release:' && fail 'Pages still triggers from a release event'
has "$release" '  push:' 'Release does not retain push triggering'
has "$release" '  workflow_dispatch:' 'Release does not retain manual dispatch'
has "$build" 'call "%SCRIPT_DIR%download-dependencies.bat" /s' 'build.bat does not invoke the silent dependency fetcher'
has "$installer" 'call "%SCRIPT_DIR%download-dependencies.bat" /s' 'build-installer.bat does not invoke the silent dependency fetcher'
has "$root/download-dependencies.bat" 'scripts\download-dependencies.ps1' 'root dependency fetcher does not invoke its pinned implementation'
has "$root/scripts/download-dependencies.ps1" 'download-dependencies.manifest.json' 'dependency fetcher does not load its pinned manifest'
has "$root/scripts/download-dependencies.manifest.json" '10.33.2' 'dependency manifest lost the pnpm pin'
has "$root/scripts/download-dependencies.manifest.json" '4acbed6dd1c744b0376e3b1cf57ce906f9dc9e95e68824584c8099a63025a3c3' 'dependency manifest lost the Python digest'
has "$release" '--require-published' 'Release does not require a published catalog photo'
has "$release" 'validate-dim-sum-image.ps1' 'Release does not decode and hash the catalog photo'
has "$release" 'DISH_PHOTO_NAME' 'Release does not stage a dish-bound photo asset'
has "$release" 'DISH_PHOTO_SHA' 'Release does not carry the public photo digest'
has "$codename" 'gh api --paginate' 'Code-name picker does not read published catalog release assets'
has "$codename" 'digest' 'Code-name picker does not require a recorded public asset digest'
has "$codename" 'sha256sum' 'Code-name picker does not hash the downloaded photo'
has "$codename" '89504e470d0a1a0a' 'Code-name picker does not validate the PNG signature'
has "$codename" 'grep -Fxq "$id" "$tmp/used.txt"' 'Code-name picker does not reject a reused dish id'
has "$release" 'existing_count=$(gh api --paginate' 'Release does not inspect existing releases before publication'
has "$release" 'refusing duplicate publication' 'Release does not refuse duplicate publication'
has "$release" "Status -ne 'NotSigned'" 'Release does not enforce unsigned Setup.exe output'
has "$builder" 'forceCodeSigning: false' 'Windows builder no longer hard-disables signing'
has "$builder" 'signAndEditExecutable: false' 'Windows builder no longer disables signer-side resource editing'
has "$release" 'if: ${{ always() }}' 'Release evidence is not collected on failure'
has "$release" 'Workflow duration:' 'Release notes no longer preserve workflow timing'
has "$release" 'scripts/line-count.mjs --blame' 'Release no longer counts lines at the released commit'
if rg -n 'temporary dim-sum|temporarily-skipped|photo-policy conflict' "$release" "$codename" >/dev/null; then
  fail 'temporary catalog-photo exception remains in the release path'
fi

fixture=$(mktemp -d)
trap 'rm -rf "$fixture"' EXIT

# Each mutation is a deliberate red case. The original file is restored before
# the next assertion, so the same check proves red and green in one run.
cp "$pages" "$fixture/pages.yml"
sed -i '/^  workflow_dispatch:/i\  release:\n    types:\n      - published' "$fixture/pages.yml"
if ! sed -n '/^on:/,/^permissions:/p' "$fixture/pages.yml" | grep -Eq '^  release:'; then fail 'Pages tag-trigger red case did not become red'; fi
cp "$pages" "$fixture/pages.yml"
if sed -n '/^on:/,/^permissions:/p' "$fixture/pages.yml" | grep -Eq '^  release:'; then fail 'Pages trigger did not return green after restoration'; fi

cp "$build" "$fixture/build.bat"
sed -i '/download-dependencies\.bat/d' "$fixture/build.bat"
if grep -F 'download-dependencies.bat' "$fixture/build.bat" >/dev/null; then fail 'missing fetcher red case did not become red'; fi
cp "$build" "$fixture/build.bat"
has "$fixture/build.bat" 'download-dependencies.bat' 'fetcher call did not return green after restoration'

cp "$codename" "$fixture/codename.sh"
sed -i 's/grep -Fxq/grep -Fq/' "$fixture/codename.sh"
if grep -F 'grep -Fxq "$id" "$tmp/used.txt"' "$fixture/codename.sh" >/dev/null; then fail 'reused code-name red case did not become red'; fi
cp "$codename" "$fixture/codename.sh"
has "$fixture/codename.sh" 'grep -Fxq "$id" "$tmp/used.txt"' 'reused code-name check did not return green after restoration'

cp "$release" "$fixture/release.yml"
sed -i '/the run-scoped catalog photo was not downloaded/d' "$fixture/release.yml"
if grep -F 'the run-scoped catalog photo was not downloaded' "$fixture/release.yml" >/dev/null; then fail 'absent-photo red case did not become red'; fi
cp "$release" "$fixture/release.yml"
has "$fixture/release.yml" 'the run-scoped catalog photo was not downloaded' 'absent-photo check did not return green after restoration'

cp "$release" "$fixture/release-duplicate.yml"
sed -i '/existing_count=$(gh api --paginate/,/refusing duplicate publication/d' "$fixture/release-duplicate.yml"
if grep -F 'refusing duplicate publication' "$fixture/release-duplicate.yml" >/dev/null; then fail 'duplicate-release red case did not become red'; fi
cp "$release" "$fixture/release-duplicate.yml"
has "$fixture/release-duplicate.yml" 'refusing duplicate publication' 'duplicate-release check did not return green after restoration'

cp "$builder" "$fixture/builder.ts"
sed -i 's/forceCodeSigning: false/forceCodeSigning: true/' "$fixture/builder.ts"
if grep -F 'forceCodeSigning: false' "$fixture/builder.ts" >/dev/null; then fail 'no-signing red case did not become red'; fi
cp "$builder" "$fixture/builder.ts"
has "$fixture/builder.ts" 'forceCodeSigning: false' 'no-signing check did not return green after restoration'

echo 'PASS: release contract checks and six deliberate red-green regressions passed.'
