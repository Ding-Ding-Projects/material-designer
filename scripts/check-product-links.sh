#!/usr/bin/env bash
set -euo pipefail

# Verify that links owned by this product stay on its own public repository.
# The imported design tree contains many deliberate upstream references, so
# this is an explicit owner inventory, not a blind repository-wide replacement.

ROOT=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
PRODUCT_REPO='https://github.com/Ding-Ding-Projects/material-designer'
UPSTREAM_REPO='https://github.com/nexu-io/open-design'

# Each row is path|required product URL fragment. These are product-owned
# destinations: help, issue reporting, release discovery, social sharing,
# landing-page metadata, catalog source links, and generated landing CTAs.
PRODUCT_LINK_OWNERS=(
  'design/apps/desktop/src/main/index.ts|https://github.com/Ding-Ding-Projects/material-designer#readme'
  'design/apps/desktop/src/main/runtime.ts|https://github.com/Ding-Ding-Projects/material-designer/issues/new'
  'design/apps/web/src/components/DesignFilesPanel.tsx|https://github.com/Ding-Ding-Projects/material-designer'
  'design/apps/web/src/components/EntryHelpMenu.tsx|https://github.com/Ding-Ding-Projects/material-designer'
  'design/apps/web/src/components/EntryNavRail.tsx|https://github.com/Ding-Ding-Projects/material-designer'
  'design/apps/web/src/components/SettingsDialog.tsx|https://github.com/Ding-Ding-Projects/material-designer/releases'
  'design/apps/web/src/components/WhatsNewPopup.tsx|https://github.com/Ding-Ding-Projects/material-designer/releases'
  'design/packages/contracts/src/api/social-share.ts|https://github.com/Ding-Ding-Projects/material-designer'
  'design/apps/landing-page/app/cta-actions.ts|https://github.com/Ding-Ding-Projects/material-designer'
  'design/apps/landing-page/app/page.tsx|https://github.com/Ding-Ding-Projects/material-designer'
  'design/apps/landing-page/app/plugin-registry.ts|https://github.com/Ding-Ding-Projects/material-designer'
  'design/apps/landing-page/app/_components/alternative-detail.astro|https://github.com/Ding-Ding-Projects/material-designer'
  'design/apps/landing-page/app/_components/header.tsx|https://github.com/Ding-Ding-Projects/material-designer'
  'design/apps/landing-page/app/_components/header-enhancer.astro|https://api.github.com/repos/Ding-Ding-Projects/material-designer'
  'design/apps/landing-page/app/_components/home-enhancer.astro|https://api.github.com/repos/Ding-Ding-Projects/material-designer'
  'design/apps/landing-page/app/_components/download-engagement-prompt.astro|https://api.github.com/repos/Ding-Ding-Projects/material-designer'
  'design/apps/landing-page/app/_components/plugin-contribute.astro|https://github.com/Ding-Ding-Projects/material-designer'
  'design/apps/landing-page/app/_components/site-footer.astro|https://github.com/Ding-Ding-Projects/material-designer'
  'design/apps/landing-page/app/_components/wire.tsx|https://github.com/Ding-Ding-Projects/material-designer'
  'design/apps/landing-page/app/_lib/bundled-plugins.ts|https://github.com/Ding-Ding-Projects/material-designer/tree/main/design/plugins'
  'design/apps/landing-page/app/_lib/catalog.ts|https://github.com/Ding-Ding-Projects/material-designer/tree/main/design'
  'design/apps/landing-page/app/_lib/github.ts|https://api.github.com/repos/Ding-Ding-Projects/material-designer'
  'design/apps/landing-page/app/_lib/google-analytics.ts|github.com/ding-ding-projects/material-designer'
  'design/apps/landing-page/app/_lib/posthog-analytics.ts|github.com/ding-ding-projects/material-designer'
  'design/apps/landing-page/app/pages/about/index.astro|https://github.com/Ding-Ding-Projects/material-designer'
  'design/apps/landing-page/app/pages/agents/index.astro|https://github.com/Ding-Ding-Projects/material-designer'
  'design/apps/landing-page/app/pages/blog/[slug].astro|https://github.com/Ding-Ding-Projects/material-designer'
  'design/apps/landing-page/app/pages/community/contributors/index.astro|Ding-Ding-Projects/material-designer'
  'design/apps/landing-page/app/pages/download/index.astro|https://github.com/Ding-Ding-Projects/material-designer'
  'design/apps/landing-page/app/pages/faq/index.astro|Ding-Ding-Projects/material-designer'
  'design/apps/landing-page/app/pages/index.astro|https://github.com/Ding-Ding-Projects/material-designer'
  'design/apps/landing-page/app/pages/official/index.astro|https://github.com/Ding-Ding-Projects/material-designer'
  'design/apps/landing-page/app/pages/plugins/index.astro|https://github.com/Ding-Ding-Projects/material-designer'
  'design/apps/landing-page/app/pages/privacy/index.astro|https://github.com/Ding-Ding-Projects/material-designer'
  'design/apps/landing-page/app/pages/quickstart/index.astro|https://github.com/Ding-Ding-Projects/material-designer'
  'design/apps/landing-page/app/pages/skills/[slug]/index.astro|https://github.com/Ding-Ding-Projects/material-designer/releases'
  'design/apps/landing-page/app/pages/terms/index.astro|https://github.com/Ding-Ding-Projects/material-designer'
  'design/apps/landing-page/app/pages/tutorials/[slug].astro|https://github.com/Ding-Ding-Projects/material-designer/blob/main/design'
  'design/apps/landing-page/app/pages/tutorials/index.astro|https://github.com/Ding-Ding-Projects/material-designer/issues/new'
  'design/apps/landing-page/functions/share/[eventId].ts|https://github.com/Ding-Ding-Projects/material-designer'
)

# Deliberate external repository links are named here rather than hidden by a
# broad exclusion. They cover provenance, upstream attribution, community
# catalogs, plugin repositories, and third-party integrations.
INTENTIONAL_EXTERNAL_REPOS=(
  '.gitmodules|upstream source pin'
  'scripts/upstream-manifest.tsv|upstream source manifest'
  'docs/porting/verbatim-import.md|upstream provenance documentation'
  'design/apps/web/src/runtime/plugin-source.ts|bundled upstream plugin attribution'
  'design/apps/web/src/components/useGithubStars.ts|upstream star-count integration'
  'design/apps/web/src/components/PrivacyConsentModal.tsx|upstream privacy-policy document'
  'design/apps/web/src/components/design-files/pluginFolderActions.ts|upstream community catalog submission'
  'design/apps/web/src/components/home-hero/plugin-authoring.ts|upstream community catalog submission'
  'design/apps/web/src/components/share-to-community/shareToCommunityPrompt.ts|upstream community catalog submission'
  'design/packages/contracts/src/prompts/system.ts|upstream provider-authored prompt text'
  'design/apps/landing-page/app/_lib/codex-design.ts|third-party agent repository'
  'design/apps/landing-page/app/_lib/deepseek-design.ts|third-party agent repository'
  'design/apps/landing-page/app/pages/codex-plugin/index.astro|third-party plugin repository'
)

check_file() {
  local root=$1
  local row=$2
  local path=${row%%|*}
  local expected=${row#*|}
  local file="$root/$path"
  if [[ ! -f "$file" ]]; then
    echo "Missing product-link owner: $path" >&2
    return 1
  fi
  if ! grep -Fq -- "$expected" "$file"; then
    echo "Product link owner does not target this repository: $path (expected $expected)" >&2
    return 1
  fi
  if grep -Fq -- "$UPSTREAM_REPO" "$file"; then
    echo "Product link owner still contains an upstream repository target: $path" >&2
    return 1
  fi
}

run_check() {
  local root=$1
  local failures=0
  local row
  for row in "${PRODUCT_LINK_OWNERS[@]}"; do
    if ! check_file "$root" "$row"; then failures=$((failures + 1)); fi
  done
  if (( failures > 0 )); then
    echo "Product-link check failed: $failures owner(s) need repair." >&2
    return 1
  fi
  echo "Product-link check passed: ${#PRODUCT_LINK_OWNERS[@]} product-owned link owners target $PRODUCT_REPO."
  echo "Intentional external repository classifications: ${#INTENTIONAL_EXTERNAL_REPOS[@]}."
}

if [[ ${1:-} == '--self-test' ]]; then
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT
  fixture="$tmp/design/apps/desktop/src/main"
  mkdir -p "$fixture"
  cp "$ROOT/design/apps/desktop/src/main/index.ts" "$fixture/index.ts"
  if ! sed -i "s#https://github.com/Ding-Ding-Projects/material-designer#https://github.com/nexu-io/open-design#g" "$fixture/index.ts"; then
    echo 'Self-test setup failed.' >&2
    exit 1
  fi
  if check_file "$tmp" "${PRODUCT_LINK_OWNERS[0]}" >/dev/null 2>&1; then
    echo 'Self-test failed: a wrong owner target was accepted.' >&2
    exit 1
  fi
  echo 'Self-test red phase observed.'
  cp "$ROOT/design/apps/desktop/src/main/index.ts" "$fixture/index.ts"
  if ! check_file "$tmp" "${PRODUCT_LINK_OWNERS[0]}"; then
    echo 'Self-test failed: the restored owner target was rejected.' >&2
    exit 1
  fi
  echo 'Self-test green phase observed for the fixture owner.'
  echo 'Product-link self-test passed.'
  exit 0
fi

run_check "$ROOT"
