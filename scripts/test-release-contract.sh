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
buildscript="$root/scripts/build.ps1"
manifest="$root/scripts/download-dependencies.manifest.json"
manifest_test="$root/scripts/test-download-dependencies-manifest.ps1"
reconciler="$root/scripts/reconcile-release-state.mjs"
reconciler_test="$root/scripts/test-reconcile-release-state.mjs"

fail() { echo "release contract failure: $1" >&2; exit 1; }
active() { sed -e '/^[[:space:]]*#/d' -e '/^[[:space:]]*\/\//d' "$1"; }
has() { active "$1" | grep -F -- "$2" >/dev/null || fail "$3"; }
has_regex() { active "$1" | grep -Eq -- "$2" || fail "$3"; }

trigger_block=$(sed -n '/^on:/,/^permissions:/p' "$pages")
printf '%s\n' "$trigger_block" | grep -Eq '^  release:' && fail 'Pages still triggers from a release event'
has "$release" '  push:' 'Release does not retain push triggering'
has "$release" '  workflow_dispatch:' 'Release does not retain manual dispatch'
has "$build" 'call "%SCRIPT_DIR%download-dependencies.bat" /s' 'build.bat does not invoke the silent dependency fetcher'
has "$installer" 'call "%SCRIPT_DIR%download-dependencies.bat" /s' 'build-installer.bat does not invoke the silent dependency fetcher'
has "$root/download-dependencies.bat" 'scripts\download-dependencies.ps1' 'root dependency fetcher does not invoke its pinned implementation'
has "$root/scripts/download-dependencies.ps1" 'download-dependencies.manifest.json' 'dependency fetcher does not load its pinned manifest'
has "$manifest" '"id": "nodejs"' 'dependency manifest lost the Node.js record id'
has "$manifest" '"version": "24.20.0"' 'dependency manifest lost the exact Node.js version'
has "$manifest" '6cac9ffbca8f6a47091e4b5c772e0606049c3871cb67d900c0cedde630e545ba' 'dependency manifest lost the Node.js digest'
has "$manifest" '"id": "pnpm"' 'dependency manifest lost the pnpm record id'
has "$manifest" '"version": "10.33.2"' 'dependency manifest lost the exact pnpm version'
has "$manifest" 'sha512-qQ+vb+6rca1sblf5Tg/hoS9dzCLNdU20CulZPraj4LaxLjVAIYuzeuCDQEsfLObbKkEh6XmCm0r/lLmfSdoc+A==' 'dependency manifest lost the pnpm integrity'
has "$manifest" '"id": "python"' 'dependency manifest lost the Python record id'
has "$manifest" '4acbed6dd1c744b0376e3b1cf57ce906f9dc9e95e68824584c8099a63025a3c3' 'dependency manifest lost the Python digest'
has "$manifest" '"id": "Microsoft.VisualStudio.2022.BuildTools"' 'dependency manifest lost the C++ bootstrapper id'
has "$manifest" '"version": "17.14.39"' 'dependency manifest lost the C++ bootstrapper version'
has "$manifest" '236367b68ba9a51708263ab10a1c85546cc4a8eca78b365168811d19c4fb2f29' 'dependency manifest lost the C++ bootstrapper digest'
has "$buildscript" "Get-DependencyRecord 'Node.js'" 'build script does not consume the exact Node.js record'
has "$buildscript" 'Node.js $expectedVersion' 'build script does not enforce the exact Node.js version'
has "$buildscript" "Get-DependencyRecord 'Microsoft C++ build tools'" 'build script does not consume the exact C++ record'
has "$root/scripts/download-dependencies.ps1" '$ValidateOnly' 'dependency fetcher has no validation-only manifest route'
has "$root/scripts/download-dependencies.ps1" 'expected Python 3.12.10' 'dependency fetcher accepts a broad Python 3.12 version'
has "$root/scripts/download-dependencies.ps1" 'user-scoped Python tool root is stale' 'dependency fetcher does not report a stale Python tool root'
has "$root/scripts/download-dependencies.ps1" '$toolRootVersion' 'dependency fetcher does not verify the Python tool-root version'
has "$manifest_test" 'Node version' 'dependency manifest red-green coverage is missing the Node version case'
has "$manifest_test" 'C++ id' 'dependency manifest red-green coverage is missing the C++ id case'
has "$manifest_test" 'pnpm integrity' 'dependency manifest red-green coverage is missing the pnpm integrity case'
has "$manifest_test" 'Python archive' 'dependency manifest red-green coverage is missing the Python archive case'
has "$manifest_test" 'unknown field' 'dependency manifest red-green coverage is missing the unknown-field case'
if active "$buildscript" | grep -Eiq 'winget|indexResponse|nodejs\.org/dist/index\.json'; then fail 'build script still permits dynamic or unmanifested acquisition'; fi
has "$release" 'node-version: 24.20.0' 'Release does not pin Node.js to the manifest version'
if active "$release" | grep -Eq 'node-version: 24[[:space:]]*$'; then fail 'Release still uses a broad Node.js version'; fi
has "$release" '--require-published' 'Release does not require a published catalog photo'
has "$release" 'validate-dim-sum-image.ps1' 'Release does not decode and hash the catalog photo'
has "$release" 'DISH_PHOTO_NAME' 'Release does not stage a dish-bound photo asset'
has "$release" 'DISH_PHOTO_SHA' 'Release does not carry the public photo digest'
has "$release" 'DISH_PHOTO_BYTES' 'Release does not carry the public photo byte count'
has "$release" 'gh release download "$TAG" --repo "$GITHUB_REPOSITORY" --pattern "$DISH_PHOTO_NAME"' 'Release does not re-download the attached photo after publication'
has "$release" 'workflow_completed_at=$(date -u' 'Release does not capture completion after publishing the draft'
has "$codename" 'gh api --paginate' 'Code-name picker does not read published catalog release assets'
has "$codename" 'digest' 'Code-name picker does not require a recorded public asset digest'
has "$codename" 'sha256sum' 'Code-name picker does not hash the downloaded photo'
has "$codename" '89504e470d0a1a0a' 'Code-name picker does not validate the PNG signature'
has "$codename" 'grep -Fxq "$id" "$tmp/used.txt"' 'Code-name picker does not reject a reused dish id'
has "$release" 'published_releases=$(gh api --paginate' 'Release does not inspect every release before publication'
has "$release" 'resolve_tag_commit()' 'Release does not resolve annotated and lightweight release tags'
has "$release" 'reconcile-release-state.mjs' 'Release does not reconcile same-source release state'
has "$release" 'recover-draft' 'Release does not repair a draft same-source release'
has "$release" 'recover-published' 'Release does not repair an incomplete published release'
has "$release" 'release-publication-receipt.json' 'Release does not preserve publication receipt identity'
has "$reconciler" 'kind: "complete"' 'Release reconciler does not verify complete releases'
has "$reconciler" 'kind: "ambiguous"' 'Release reconciler does not refuse ambiguous releases'
has "$reconciler_test" 'timing-note edit failure' 'Release reconciliation lacks timing-note recovery coverage'
has "$reconciler_test" 'already-complete same source' 'Release reconciliation lacks complete rerun coverage'
has "$reconciler_test" 'duplicate prevention without ownership receipt' 'Release reconciliation lacks ambiguous duplicate coverage'
has "$release" "Status -ne 'NotSigned'" 'Release does not enforce unsigned Setup.exe output'
has "$builder" 'forceCodeSigning: false' 'Windows builder no longer hard-disables signing'
has "$builder" 'signAndEditExecutable: false' 'Windows builder no longer disables signer-side resource editing'
has "$release" 'if: ${{ always() }}' 'Release evidence is not collected on failure'
has "$release" 'Workflow duration:' 'Release notes no longer preserve workflow timing'
has "$release" 'scripts/line-count.mjs --blame' 'Release no longer counts lines at the released commit'
workflow_names=$(for workflow in "$root/.github/workflows"/*.yml "$root/.github/workflows"/*.yaml; do [ -f "$workflow" ] && basename "$workflow"; done | LC_ALL=C sort | tr '\n' '|')
[ "$workflow_names" = 'pages.yml|release.yml|verify.yml|' ] || fail "root workflow inventory drifted: $workflow_names"
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

cp "$release" "$fixture/release-comment.yml"
sed -i 's/^          node-version: 24\.20\.0$/          # node-version: 24.20.0/' "$fixture/release-comment.yml"
if active "$fixture/release-comment.yml" | grep -F 'node-version: 24.20.0' >/dev/null; then fail 'commented Node pin red case did not become red'; fi
cp "$release" "$fixture/release-comment.yml"
has "$fixture/release-comment.yml" 'node-version: 24.20.0' 'commented Node pin did not return green after restoration'

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
sed -i '/reconcile-release-state\.mjs/d' "$fixture/release-duplicate.yml"
if grep -F 'reconcile-release-state.mjs' "$fixture/release-duplicate.yml" >/dev/null; then fail 'duplicate-release reconciliation red case did not become red'; fi
cp "$release" "$fixture/release-duplicate.yml"
has "$fixture/release-duplicate.yml" 'reconcile-release-state.mjs' 'duplicate-release reconciliation did not return green after restoration'

cp "$builder" "$fixture/builder.ts"
sed -i 's/forceCodeSigning: false/forceCodeSigning: true/' "$fixture/builder.ts"
if grep -F 'forceCodeSigning: false' "$fixture/builder.ts" >/dev/null; then fail 'no-signing red case did not become red'; fi
cp "$builder" "$fixture/builder.ts"
has "$fixture/builder.ts" 'forceCodeSigning: false' 'no-signing check did not return green after restoration'

cp "$manifest" "$fixture/manifest.json"
sed -i 's/6cac9ffbca8f6a47091e4b5c772e0606049c3871cb67d900c0cedde630e545ba/0000000000000000000000000000000000000000000000000000000000000000/' "$fixture/manifest.json"
if grep -F '6cac9ffbca8f6a47091e4b5c772e0606049c3871cb67d900c0cedde630e545ba' "$fixture/manifest.json" >/dev/null; then fail 'Node digest red case did not become red'; fi
cp "$manifest" "$fixture/manifest.json"
has "$fixture/manifest.json" '6cac9ffbca8f6a47091e4b5c772e0606049c3871cb67d900c0cedde630e545ba' 'Node digest did not return green after restoration'

cp "$manifest" "$fixture/manifest-cpp.json"
sed -i 's/236367b68ba9a51708263ab10a1c85546cc4a8eca78b365168811d19c4fb2f29/0000000000000000000000000000000000000000000000000000000000000000/' "$fixture/manifest-cpp.json"
if grep -F '236367b68ba9a51708263ab10a1c85546cc4a8eca78b365168811d19c4fb2f29' "$fixture/manifest-cpp.json" >/dev/null; then fail 'C++ bootstrapper digest red case did not become red'; fi
cp "$manifest" "$fixture/manifest-cpp.json"
has "$fixture/manifest-cpp.json" '236367b68ba9a51708263ab10a1c85546cc4a8eca78b365168811d19c4fb2f29' 'C++ bootstrapper digest did not return green after restoration'

echo 'PASS: release contract checks and deliberate red-green regressions passed.'
