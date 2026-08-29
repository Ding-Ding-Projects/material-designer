#!/usr/bin/env sh
set -eu

# This is intentionally a hand-written list. Discovery-only checks disappear
# with the feature they were meant to protect.
ROOT=${SOURCE_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}
INVENTORY=${INVENTORY_FILE:-"$ROOT/docs/standards/search-surface-inventory.md"}
expected='desktop-entry-topbar desktop-command-palette desktop-settings desktop-settings-overflow desktop-changelog desktop-history desktop-notifications desktop-handoff desktop-file-viewer-present-menu desktop-file-viewer-zoom-menu desktop-file-viewer-live-zoom-menu desktop-file-viewer-toolbar-more-menu desktop-file-viewer-version-download-menu desktop-file-viewer-unified-action-menu desktop-file-viewer-component-unified-menu desktop-file-viewer-markdown-download-menu desktop-tabs-current-strip desktop-tabs-groups desktop-tabs-inside-group desktop-tabs-master desktop-library desktop-library-picker desktop-library-kind-filter desktop-library-source-filter desktop-library-design-system-menu documentation-site documentation-settings site-tab-overflow site-tab-list site-context-menu site-tabs-inside-group site-tab-groups site-tabs-master'

for id in $expected; do
  if ! grep -Fq "| \`$id\` |" "$INVENTORY"; then
    printf 'MISSING_INVENTORY=%s\n' "$id" >&2
    exit 1
  fi
done

# These rows are intentionally red, not silently absent. Their owner is the
# separate tabs lane, so a green inventory must preserve both the status and
# the handoff owner until that lane wires the missing surfaces.
for id in site-tabs-inside-group site-tab-groups site-tabs-master; do
  red_line=$(grep -F "| \`$id\` |" "$INVENTORY" || true)
  case "$red_line" in
    *RED*"tabs lane"*) ;;
    *)
      printf 'RED_ROW_STATUS_OR_OWNER_MISSING=%s\n' "$id" >&2
      exit 1
      ;;
  esac
done

# The authoritative component, field-binding, controller, field-id, and
# invocation-count check is AST-based, so a marker split across two JSX
# invocations cannot pass by accident. Keep SOURCE_ROOT forwarding intact for
# the disposable negative fixture used by the companion regression.
if ! SOURCE_ROOT="$ROOT" node "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/check-regex-search-inventory.mjs"; then
  exit 1
fi

# The AST checker owns row registration. This separate site-safety assertion is
# intentionally outside the ownership inventory.
if grep -Eq 'new[[:space:]]+RegExp|(^|[^[:alnum:]_])RegExp[[:space:]]*\(' "$ROOT/site/assets/js/main.js"; then
  printf '%s\n' 'RAW_REGEX_IN_SITE_MAIN=main.js' >&2
  exit 1
fi

printf '%s\n' 'regex search inventory: green'
