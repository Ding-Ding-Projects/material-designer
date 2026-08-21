#!/usr/bin/env sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
checks=0

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

assert_count() {
  path=$1
  pattern=$2
  expected=$3
  label=$4
  actual=$(grep -Ec "$pattern" "$root/$path" || true)
  [ "$actual" -eq "$expected" ] || fail "$label (expected $expected, found $actual)"
  checks=$((checks + 1))
}

assert_text() {
  text=$1
  needle=$2
  label=$3
  printf '%s\n' "$text" | grep -F -- "$needle" >/dev/null || fail "$label"
  checks=$((checks + 1))
}

figma_path=design/apps/web/src/components/FigmaImportModal.tsx
registry_path=design/apps/web/src/providers/registry.ts
projects_path=design/apps/web/src/state/projects.ts
appearance_path=design/apps/web/src/state/appearance.ts
layout_path=design/apps/web/app/layout.tsx
cli_path=design/apps/daemon/src/cli.ts
confirm_path=design/apps/web/src/lib/confirm-delete.ts

assert_count "$figma_path" '^export function FigmaImportModal[(]' 1 \
  'FigmaImportModal must have one declaration'
assert_count "$registry_path" '^export async function deleteDesignSystemDraft[(]' 1 \
  'deleteDesignSystemDraft must have one declaration'
assert_count "$projects_path" '^export async function deleteProject[(]' 1 \
  'deleteProject must have one declaration'
assert_count "$appearance_path" '^export const DEFAULT_ACCENT_COLOR = ' 1 \
  'DEFAULT_ACCENT_COLOR must have one declaration'
assert_count "$appearance_path" '^export const ACCENT_SWATCHES = ' 1 \
  'ACCENT_SWATCHES must have one declaration'
assert_count "$layout_path" '^const themeInitScript = ' 1 \
  'themeInitScript must have one declaration'
assert_count "$cli_path" '^const PROJECT_BOOLEAN_FLAGS = ' 1 \
  'PROJECT_BOOLEAN_FLAGS must have one declaration'

figma_section=$(sed -n '/^export function FigmaImportModal(/,/^  const submitUrl =/p' "$root/$figma_path")
assert_text "$figma_section" 'workspaceContext = null' \
  'FigmaImportModal must capture the project workspace context'
assert_text "$figma_section" 'workspaceContext,' \
  'Figma import must send the captured workspace context'

registry_section=$(sed -n '/^export async function deleteDesignSystemDraft(/,/^export async function importLocalDesignSystem(/p' "$root/$registry_path")
assert_text "$registry_section" 'confirmedDelete(resourcePath' \
  'design-system delete must use the confirmation handshake'
assert_text "$registry_section" 'workspaceProjectHeaders(workspaceContext)' \
  'design-system delete must carry workspace identity'
assert_text "$registry_section" 'error instanceof ConfirmedDeleteError' \
  'design-system delete must preserve detailed refusal errors'

projects_section=$(sed -n '/^export async function deleteProject(/,/^\/\/ ---------- conversations/p' "$root/$projects_path")
assert_text "$projects_section" 'confirmedDelete(resourcePath' \
  'project delete must use the confirmation handshake'
assert_text "$projects_section" 'workspaceProjectHeaders(workspaceContext)' \
  'project delete must carry workspace identity'
assert_text "$projects_section" 'removeCachedTabs(id, workspaceContext)' \
  'project delete must invalidate the scoped tabs cache'
assert_text "$projects_section" 'removeDesignBrowserProjectCache(id)' \
  'project delete must invalidate Design Browser caches'

confirm_source=$(cat "$root/$confirm_path")
assert_text "$confirm_source" 'options.headers' \
  'the shared confirmation seam must accept caller identity headers'
assert_text "$confirm_source" 'headers.set(CONFIRM_DELETE_HEADER, attempt.confirmation.token)' \
  'the minted confirmation token must override caller headers on DELETE'

appearance_source=$(cat "$root/$appearance_path")
assert_text "$appearance_source" "DEFAULT_ACCENT_COLOR = 'var(--md-sys-color-primary)'" \
  'the default accent must remain the Material Design 3 primary role'
assert_text "$appearance_source" "'#353535'" \
  'the upstream default accent must remain available as an explicit swatch'

layout_source=$(cat "$root/$layout_path")
assert_text "$layout_source" "if(t==='light'||t==='dark')" \
  'pre-hydration must preserve saved light and dark themes'
assert_text "$layout_source" "else if(t==='system')document.documentElement.removeAttribute('data-theme')" \
  'pre-hydration system theme must remain controlled by the operating system'
assert_text "$layout_source" "a='var(--md-sys-color-primary)'" \
  'accent migration must fall back to the Material Design 3 primary role'

cli_source=$(cat "$root/$cli_path")
assert_text "$cli_source" "PROJECT_BOOLEAN_FLAGS = new Set(['help', 'h', 'json', 'follow', 'confirm'])" \
  'project boolean flags must retain destructive confirmation'
assert_text "$cli_source" "'workspace-member'," \
  'project resource flags must retain workspace identity'

printf 'PASS: %s web safety union checks\n' "$checks"
