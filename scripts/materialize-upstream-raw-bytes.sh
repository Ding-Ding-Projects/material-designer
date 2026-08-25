#!/usr/bin/env bash
# Restore raw on-disk bytes only when the index already records the pinned
# upstream blob. Product-owned index differences are never materialized.

set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)
cd "$repo_root"

manifest=scripts/upstream-manifest.tsv
prefix=design/
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

if [ ! -f "$manifest" ]; then
  echo "materialize-upstream-raw-bytes: missing $manifest" >&2
  exit 2
fi

pinned=$(sed -n 's/^# commit\t//p' "$manifest" | head -1)
if [ -z "$pinned" ]; then
  echo "materialize-upstream-raw-bytes: manifest has no pinned commit" >&2
  exit 2
fi

if [ -e vendor/open-design/.git ]; then
  submodule_head=$(git -C vendor/open-design rev-parse HEAD)
  if [ "$submodule_head" != "$pinned" ]; then
    echo "materialize-upstream-raw-bytes: submodule $submodule_head does not match manifest $pinned" >&2
    exit 2
  fi
fi

if [ -n "$(git status --porcelain --untracked-files=all -- "$prefix")" ]; then
  echo "materialize-upstream-raw-bytes: design/ has uncommitted work; refusing to overwrite it" >&2
  exit 2
fi

grep -v '^#' "$manifest" |
  LC_ALL=C sort -t"$(printf '\t')" -k3,3 > "$tmp/upstream.tsv"

awk '
  /<!--/ { incomment = 1 }
  !incomment && match($0, /^- `[^`]+`/) {
    line = substr($0, RSTART + 3, RLENGTH - 3)
    sub(/`$/, "", line)
    print line
  }
  /-->/ { incomment = 0 }
' MODIFICATIONS.md | LC_ALL=C sort -u > "$tmp/declared.txt"

git ls-files -s -- "$prefix" |
  sed -E "s|^([0-7]+) ([0-9a-f]+) [0-9]+\t${prefix}|\1\t\2\t|" |
  LC_ALL=C sort -t"$(printf '\t')" -k3,3 > "$tmp/tracked.tsv"

: > "$tmp/present-paths.txt"
: > "$tmp/present-relative.txt"
while IFS= read -r path; do
  if [ -f "$prefix$path" ]; then
    printf '%s\n' "$prefix$path" >> "$tmp/present-paths.txt"
    printf '%s\n' "$path" >> "$tmp/present-relative.txt"
  fi
done < <(cut -f3 "$tmp/upstream.tsv")
git hash-object --no-filters --stdin-paths < "$tmp/present-paths.txt" > "$tmp/disk-oids.txt"
paste "$tmp/disk-oids.txt" "$tmp/present-relative.txt" > "$tmp/disk.tsv"

LC_ALL=C join -t"$(printf '\t')" -1 3 -2 3 \
  -o '1.3,1.1,1.2,2.1,2.2' "$tmp/upstream.tsv" "$tmp/tracked.tsv" > "$tmp/index-joined.tsv"
LC_ALL=C join -t"$(printf '\t')" -1 1 -2 2 \
  -o '1.1,1.2,1.3,1.4,1.5,2.1' "$tmp/index-joined.tsv" "$tmp/disk.tsv" > "$tmp/preflight.tsv"

: > "$tmp/targets.tsv"
: > "$tmp/refused.tsv"
: > "$tmp/declared-protected.tsv"
while IFS=$'\t' read -r path upstream_mode upstream_oid local_mode local_oid disk_oid; do
  [ "$disk_oid" = "$upstream_oid" ] && continue
  if grep -Fqx -- "$path" "$tmp/declared.txt"; then
    printf '%s\t%s\t%s\t%s\t%s\n' \
      "$path" "$upstream_mode" "$upstream_oid" "$local_mode" "$local_oid" >> "$tmp/declared-protected.tsv"
    continue
  fi
  if [ "$local_mode" != "$upstream_mode" ] || [ "$local_oid" != "$upstream_oid" ]; then
    printf '%s\t%s\t%s\t%s\t%s\n' \
      "$path" "$upstream_mode" "$upstream_oid" "$local_mode" "$local_oid" >> "$tmp/refused.tsv"
    continue
  fi
  printf '%s\t%s\t%s\n' "$path" "$upstream_mode" "$upstream_oid" >> "$tmp/targets.tsv"
done < "$tmp/preflight.tsv"

target_count=$(wc -l < "$tmp/targets.tsv" | tr -d ' ')
refused_count=$(wc -l < "$tmp/refused.tsv" | tr -d ' ')
declared_count=$(wc -l < "$tmp/declared-protected.tsv" | tr -d ' ')
echo "materialize-upstream-raw-bytes: preflight targets=$target_count protected-index-differences=$refused_count protected-declarations=$declared_count pinned=$pinned"

while IFS=$'\t' read -r path _mode oid; do
  [ -n "$path" ] || continue
  target="$prefix$path"
  parent=$(dirname "$target")
  mkdir -p "$parent"
  staged=$(mktemp "$parent/.materialize.XXXXXX")
  git cat-file blob "$oid" > "$staged"
  staged_oid=$(git hash-object --no-filters "$staged")
  if [ "$staged_oid" != "$oid" ]; then
    rm -f "$staged"
    echo "materialize-upstream-raw-bytes: staged blob mismatch for $path" >&2
    exit 2
  fi
  mv -f "$staged" "$target"
done < "$tmp/targets.tsv"

post_count=0
while IFS=$'\t' read -r path _mode oid; do
  [ -n "$path" ] || continue
  actual=$(git hash-object --no-filters "$prefix$path")
  if [ "$actual" != "$oid" ]; then
    echo "materialize-upstream-raw-bytes: post-write mismatch for $path" >&2
    exit 2
  fi
  post_count=$((post_count + 1))
done < "$tmp/targets.tsv"

echo "materialize-upstream-raw-bytes: restored=$post_count protected-index-differences=$refused_count protected-declarations=$declared_count"
