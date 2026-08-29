#!/usr/bin/env sh
set -eu

# Build a complete disposable source fixture first. The production guard is
# intentionally red until C0 registers its FileViewer callers, so testing the
# negative path directly against the current tree would stop before the
# mutation and would never prove the guard itself.
ROOT=${SOURCE_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}
CHECK="$ROOT/scripts/check-regex-search-inventory.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM

fixture="$tmp/fixture"
mkdir -p "$fixture"
FIXTURE_REF=${FIXTURE_REF:-origin/preservation/advanced-regex-snapshot-20260828}
if ! git -C "$ROOT" rev-parse --verify "$FIXTURE_REF^{commit}" >/dev/null 2>&1; then
  printf '%s\n' "missing complete fixture ref: $FIXTURE_REF" >&2
  exit 1
fi
git -C "$ROOT" archive "$FIXTURE_REF" \
  design/apps/web/src site docs/standards/search-surface-inventory.md \
  | tar -x -C "$fixture"

fixture_viewer="$fixture/design/apps/web/src/components/FileViewer.tsx"

if ! SOURCE_ROOT="$fixture" INVENTORY_FILE="$fixture/docs/standards/search-surface-inventory.md" sh "$CHECK" > "$tmp/fixture-green.log" 2>&1; then
  printf '%s\n' 'complete fixture did not turn green' >&2
  cat "$tmp/fixture-green.log" >&2
  exit 1
fi

# Remove exactly one executable registration and require the guard's exact
# reason. A broad substring or an unrelated missing-file error is not enough.
sed '/fieldId="file-viewer-live-present-menu-search"/d' "$fixture_viewer" > "$tmp/FileViewer.removed.tsx"
cp "$tmp/FileViewer.removed.tsx" "$fixture_viewer"
if SOURCE_ROOT="$fixture" node "$ROOT/scripts/check-regex-search-inventory.mjs" > "$tmp/ast-red.log" 2>&1; then
  printf '%s\n' 'AST checker accepted a removed multi-instance field id' >&2
  exit 1
fi
if ! grep -Fq 'MISSING_REGISTRATION=design/apps/web/src/components/FileViewer.tsx:fieldId="file-viewer-live-present-menu-search"' "$tmp/ast-red.log"; then
  printf '%s\n' 'AST checker reported the wrong missing multi-instance field id' >&2
  cat "$tmp/ast-red.log" >&2
  exit 1
fi
if SOURCE_ROOT="$fixture" INVENTORY_FILE="$fixture/docs/standards/search-surface-inventory.md" sh "$CHECK" > "$tmp/fixture-red.log" 2>&1; then
  printf '%s\n' 'single registration removal stayed green' >&2
  exit 1
fi
if ! grep -Fq 'MISSING_REGISTRATION=design/apps/web/src/components/FileViewer.tsx:fieldId="file-viewer-live-present-menu-search"' "$tmp/fixture-red.log"; then
  printf '%s\n' 'single registration removal reported the wrong reason' >&2
  cat "$tmp/fixture-red.log" >&2
  exit 1
fi

# Restore the complete fixture from its preserved source ref and prove green again.
git -C "$ROOT" archive "$FIXTURE_REF" -- design/apps/web/src/components/FileViewer.tsx \
  | tar -x -C "$fixture"
if ! SOURCE_ROOT="$fixture" INVENTORY_FILE="$fixture/docs/standards/search-surface-inventory.md" sh "$CHECK" > "$tmp/fixture-restored.log" 2>&1; then
  printf '%s\n' 'complete fixture did not restore to green' >&2
  cat "$tmp/fixture-restored.log" >&2
  exit 1
fi

# Remove the other member of the same multi-instance row. The diagnostic must
# name the actual missing field id, not whichever member happened to be listed
# first in the inventory.
sed '/fieldId="file-viewer-present-menu-search"/d' "$fixture_viewer" > "$tmp/FileViewer.present-removed.tsx"
cp "$tmp/FileViewer.present-removed.tsx" "$fixture_viewer"
if SOURCE_ROOT="$fixture" node "$ROOT/scripts/check-regex-search-inventory.mjs" > "$tmp/ast-present-red.log" 2>&1; then
  printf '%s\n' 'AST checker accepted the other removed multi-instance field id' >&2
  exit 1
fi
if ! grep -Fq 'MISSING_REGISTRATION=design/apps/web/src/components/FileViewer.tsx:fieldId="file-viewer-present-menu-search"' "$tmp/ast-present-red.log"; then
  printf '%s\n' 'AST checker did not name the actual missing field id' >&2
  cat "$tmp/ast-present-red.log" >&2
  exit 1
fi
if SOURCE_ROOT="$fixture" INVENTORY_FILE="$fixture/docs/standards/search-surface-inventory.md" sh "$CHECK" > "$tmp/fixture-present-red.log" 2>&1; then
  printf '%s\n' 'other multi-instance registration removal stayed green' >&2
  exit 1
fi
if ! grep -Fq 'MISSING_REGISTRATION=design/apps/web/src/components/FileViewer.tsx:fieldId="file-viewer-present-menu-search"' "$tmp/fixture-present-red.log"; then
  printf '%s\n' 'other multi-instance removal reported the wrong reason' >&2
  cat "$tmp/fixture-present-red.log" >&2
  exit 1
fi

git -C "$ROOT" archive "$FIXTURE_REF" -- design/apps/web/src/components/FileViewer.tsx \
  | tar -x -C "$fixture"
if ! SOURCE_ROOT="$fixture" INVENTORY_FILE="$fixture/docs/standards/search-surface-inventory.md" sh "$CHECK" > "$tmp/fixture-final-green.log" 2>&1; then
  printf '%s\n' 'complete fixture did not restore after the second removal' >&2
  cat "$tmp/fixture-final-green.log" >&2
  exit 1
fi

# Also observe the real production AST inventory. The shell wrapper owns an
# additional documentation-site raw-regex check that is outside this focused
# FileViewer field-identity regression.
if SOURCE_ROOT="$ROOT" node "$ROOT/scripts/check-regex-search-inventory.mjs" > "$tmp/primary.log" 2>&1; then
  printf '%s\n' 'primary AST inventory: green (C0 FileViewer registrations present)'
else
  if ! grep -Fq 'MISSING_REGISTRATION=design/apps/web/src/components/FileViewer.tsx:fieldId="file-viewer-live-present-menu-search"' "$tmp/primary.log"; then
    printf '%s\n' 'primary inventory is red for an unexpected reason' >&2
    cat "$tmp/primary.log" >&2
    exit 1
  fi
  printf '%s\n' 'primary AST inventory: red at the C0 FileViewer registration seam'
fi

printf '%s\n' 'regex search inventory negative: red then green'
