#!/usr/bin/env bash
# Prove that the application command palette keeps its own full regex search
# field rather than regressing to a raw input or a borrowed controller.
#
# This is intentionally dependency-free. The web unit suite exercises the
# rendered interaction, but this check runs before package installation and
# catches the source-level regression in the fast verification job as well.

set -u -o pipefail

# Resolve from the script itself rather than `git rev-parse`: on Windows Git
# Bash a linked worktree's `.git` file can contain a Windows gitdir path that
# Bash's `/mnt/c` view cannot re-resolve. The check only reads files, so it has
# no reason to make that repository metadata a prerequisite.
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd) || exit 2
repo_root=$(cd -- "$script_dir/.." && pwd) || exit 2
cd "$repo_root" || exit 2

palette='design/apps/web/src/components/command-palette/CommandPalette.tsx'
palette_css='design/apps/web/src/components/command-palette/CommandPalette.module.css'
field='design/apps/web/src/components/regex/RegexSearchField.tsx'
field_css='design/apps/web/src/components/regex/RegexSearchField.module.css'
search='design/apps/web/src/components/regex/useRegexSearch.ts'

for file in "$palette" "$palette_css" "$field" "$field_css" "$search"; do
  if [ ! -f "$file" ]; then
    echo "error: expected $file to exist" >&2
    exit 2
  fi
done

status=0
check_literal() {
  local file=$1
  local literal=$2
  local label=$3
  if grep -Fq "$literal" "$file"; then
    echo "ok: $label"
  else
    echo "error: missing $label in $file" >&2
    status=1
  fi
}

check_literal "$palette" 'import { RegexSearchField }' 'palette imports the shared search field'
check_literal "$palette" 'const search = useRegexSearch(rawQuery, setRawQuery);' 'palette owns one regex controller'
check_literal "$palette" 'search={search}' 'palette passes its controller to the field'
check_literal "$palette" 'toggleClassName={styles.regexToggle}' 'palette opts into its accessible affordance target'
check_literal "$search" "useState<RegexSearchMode>('text')" 'plain text remains the controller default'
check_literal "$search" 'const [flags, setFlags]' 'flags remain controller-local state'
check_literal "$search" 'const [parts, setParts]' 'guided parts remain controller-local state'
check_literal "$field" 'value={search.query}' 'field renders the controller query'
check_literal "$field" 'data-regex-mode={search.mode}' 'field exposes the active mode'
check_literal "$field" 'search.setQuery' 'field writes back to its own controller'
check_literal "$field" 'aria-expanded={open}' 'builder affordance reports open state'
check_literal "$field" 'aria-haspopup="dialog"' 'builder affordance exposes dialog semantics'
check_literal "$field" '<RegexBuilder' 'field opens the full shared builder'
check_literal "$field_css" 'min-width: 0;' 'shared host yields at narrow widths'
check_literal "$field_css" 'max-width: calc(100vw - 24px);' 'builder is viewport-bounded'

toggle_block=$(sed -n '/^\.regexToggle[[:space:]]*{/,/^}/p' "$palette_css")
if printf '%s\n' "$toggle_block" | grep -Fq 'min-width: 48px;' &&
  printf '%s\n' "$toggle_block" | grep -Fq 'min-height: 48px;'; then
  echo 'ok: palette regex affordance keeps a 48px target'
else
  echo 'error: palette regex affordance is missing its 48px target' >&2
  status=1
fi

search_row=$(awk '
  index($0, "<div className={styles.searchRow}>") { inside=1 }
  inside { print }
  inside && index($0, "/* A pattern is active") { exit }
' "$palette")
if printf '%s\n' "$search_row" | grep -Fq '<input'; then
  echo 'error: command palette search row contains a raw input; use RegexSearchField' >&2
  status=1
else
  echo 'ok: command palette search row has no raw input escape hatch'
fi

controller_calls=$(grep -o 'useRegexSearch(' "$palette" | wc -l | tr -d ' ')
if [ "$controller_calls" != '1' ]; then
  echo "error: expected one useRegexSearch call in the palette, found $controller_calls" >&2
  status=1
else
  echo 'ok: palette controller count is one'
fi

if [ "$status" = 0 ]; then
  echo 'command-palette regex contract: passed'
fi
exit "$status"
