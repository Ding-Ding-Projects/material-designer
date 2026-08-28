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

check_source() {
  path=$1
  needle=$2
  file="$ROOT/$path"
  if [ ! -f "$file" ]; then
    printf 'MISSING_SOURCE=%s\n' "$path" >&2
    return 1
  fi
  if [ "$needle" = '<RegexSearchField' ] || [ "$needle" = '<FileViewerMenuSearch' ]; then
    if ! grep -Eq "^[[:space:]]*${needle}([[:space:]/>]|$)" "$file"; then
      printf 'MISSING_REGISTRATION=%s:%s\n' "$path" "$needle" >&2
      return 1
    fi
    return 0
  fi
  # Only an executable source line counts. A commented marker and a renamed
  # identifier must not satisfy this check by substring accident.
  if ! awk -v needle="$needle" '
    {
      line=$0
      sub(/^[[:space:]]*/, "", line)
      if (substr(line, 1, 2) != "//") {
        if (index(line, needle) > 0) found=1
      }
    }
    END { exit(found ? 0 : 1) }
  ' "$file"; then
    printf 'MISSING_REGISTRATION=%s:%s\n' "$path" "$needle" >&2
    return 1
  fi
}

check_component_source() {
  path=$1
  name=$2
  file="$ROOT/$path"
  if ! awk -v name="$name" '
    {
      line=$0
      sub(/^[[:space:]]*/, "", line)
      if (substr(line, 1, 2) == "//") next
      if (line ~ ("<" name "([[:space:]/>]|$)")) found=1
    }
    END { exit(found ? 0 : 1) }
  ' "$file"; then
    printf 'MISSING_COMPONENT_REGISTRATION=%s:<%s>\n' "$path" "$name" >&2
    return 1
  fi
}

check_source 'design/apps/web/src/components/EntryTopbarSearch.tsx' '<RegexSearchField' || exit 1
check_source 'design/apps/web/src/components/command-palette/CommandPalette.tsx' '<RegexSearchField' || exit 1
check_source 'design/apps/web/src/components/SettingsDialog.tsx' '<RegexSearchField' || exit 1
check_source 'design/apps/web/src/components/settings/SettingsTabStrip.tsx' '<RegexSearchField' || exit 1
check_source 'design/apps/web/src/components/changelog/ChangelogDialog.tsx' '<RegexSearchField' || exit 1
check_source 'design/apps/web/src/components/history/VersionHistoryDialog.tsx' '<RegexSearchField' || exit 1
check_source 'design/apps/web/src/components/notifications/NotificationCenter.tsx' '<RegexSearchField' || exit 1
check_source 'design/apps/web/src/components/handoff/HandoffView.tsx' '<RegexSearchField' || exit 1
check_source 'design/apps/web/src/components/FileViewerMenuSearch.tsx' 'data-file-viewer-menu-builder' || exit 1
check_source 'design/apps/web/src/components/FileViewer.tsx' 'fieldId="file-viewer-live-present-menu-search"' || exit 1
check_source 'design/apps/web/src/components/FileViewer.tsx' 'fieldId="file-viewer-present-menu-search"' || exit 1
check_source 'design/apps/web/src/components/FileViewer.tsx' 'fieldId="file-viewer-zoom-menu-search"' || exit 1
check_source 'design/apps/web/src/components/FileViewer.tsx' 'fieldId="file-viewer-live-zoom-menu-search"' || exit 1
check_source 'design/apps/web/src/components/FileViewer.tsx' 'fieldId="file-viewer-toolbar-more-menu-search"' || exit 1
check_source 'design/apps/web/src/components/FileViewer.tsx' 'fieldId="file-viewer-version-download-menu-search"' || exit 1
check_source 'design/apps/web/src/components/FileViewer.tsx' 'fieldId="file-viewer-unified-action-menu-search"' || exit 1
check_source 'design/apps/web/src/components/FileViewer.tsx' 'fieldId="file-viewer-component-unified-menu-search"' || exit 1
check_source 'design/apps/web/src/components/FileViewer.tsx' 'fieldId="file-viewer-markdown-download-menu-search"' || exit 1
check_component_source 'design/apps/web/src/components/FileViewer.tsx' 'FileViewerMenuSearch' || exit 1
check_source 'design/apps/web/src/components/workspace-tabs/WorkspaceTabDiscovery.tsx' '<RegexSearchField' || exit 1
check_source 'design/apps/web/src/components/LibrarySection.tsx' '<RegexSearchField' || exit 1
check_source 'design/apps/web/src/components/LibraryPicker.tsx' 'testId="library-picker-search"' || exit 1
check_source 'design/apps/web/src/components/LibrarySection.tsx' 'function LibraryFilterCombobox' || exit 1
check_source 'design/apps/web/src/components/LibrarySection.tsx' 'testId={`${testId}-search`}' || exit 1
check_source 'design/apps/web/src/providers/registry.ts' 'export async function fetchAllLibraryAssets' || exit 1
check_source 'design/apps/web/src/providers/registry.ts' 'const seenCursors = new Set<string>();' || exit 1
check_source 'design/apps/web/src/components/regex/diagnostics.ts' 'export const REGEX_CAPABILITIES' || exit 1
check_source 'design/apps/web/src/components/regex/RegexWorkbenchPanels.tsx' 'export function RegexWorkbenchPanels' || exit 1
check_source 'design/apps/web/src/components/regex/searchSurfaceInventory.ts' 'EXPECTED_REGEX_SEARCH_SURFACE_IDS' || exit 1
check_source 'site/index.html' 'id="site-search-builder"' || exit 1
check_source 'site/index.html' 'id="settings-search-builder"' || exit 1
check_source 'site/assets/js/main.js' 'attachRegexBuilder' || exit 1
check_source 'site/assets/js/main.js' 'regex.createEvaluator' || exit 1
check_source 'site/assets/js/main.js' 'evaluator.evaluate' || exit 1
if grep -Eq 'new[[:space:]]+RegExp|(^|[^[:alnum:]_])RegExp[[:space:]]*\(' "$ROOT/site/assets/js/main.js"; then
  printf '%s\n' 'RAW_REGEX_IN_SITE_MAIN=main.js' >&2
  exit 1
fi
check_source 'site/assets/js/tabs.js' 'createSearchField({' || exit 1

printf '%s\n' 'regex search inventory: green'
