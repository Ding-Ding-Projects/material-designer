#!/usr/bin/env bash
# List every path under design/ that actually differs from upstream, in the form
# MODIFICATIONS.md declares them.
#
# The verifier answers "does the notice match the tree". This answers "what
# should the notice say", which is what you want when several changes have
# landed at once and hand-maintaining the list has stopped being realistic.
#
# Usage:
#   scripts/declared-paths.sh            # the paths, one per line
#   scripts/declared-paths.sh --markdown # ready to paste under "Changed files"
#   scripts/declared-paths.sh --diff     # compare against what MODIFICATIONS.md says
#
# Deliberately read-only. It never edits the notice, because deciding that a
# difference is intentional is a judgement, and a script that writes the
# allowlist from the working tree would make the allowlist meaningless — it
# would agree with whatever happened to be on disk, including a mistake.

set -u -o pipefail

repo_root=$(git rev-parse --show-toplevel) || exit 2
cd "$repo_root" || exit 2

sub=vendor/open-design
manifest=scripts/upstream-manifest.tsv
prefix=design/
mode=${1:-plain}

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

if [ -e "$sub/.git" ]; then
  git -C "$sub" ls-files -s |
    sed -E 's/^([0-7]+) ([0-9a-f]+) [0-9]+\t/\1\t\2\t/' |
    LC_ALL=C sort -t"$(printf '\t')" -k3,3 > "$tmp/upstream.tsv"
elif [ -f "$manifest" ]; then
  grep -v '^#' "$manifest" | LC_ALL=C sort -t"$(printf '\t')" -k3,3 > "$tmp/upstream.tsv"
else
  echo "declared-paths: no upstream reference available" >&2
  exit 2
fi

# Tracked paths whose recorded blob differs from upstream's, plus anything
# tracked here that upstream does not have.
git ls-files -s -- "$prefix" |
  sed -E "s|^([0-7]+) ([0-9a-f]+) [0-9]+\t${prefix}|\1\t\2\t|" |
  LC_ALL=C sort -t"$(printf '\t')" -k3,3 > "$tmp/tracked.tsv"

join -t"$(printf '\t')" -1 3 -2 3 -o '1.3,1.1,1.2,2.1,2.2' \
  "$tmp/upstream.tsv" "$tmp/tracked.tsv" |
  awk -F'\t' '$2 != $4 || $3 != $5 { print $1 }' > "$tmp/differing.txt"

comm -13 <(cut -f3 "$tmp/upstream.tsv") <(cut -f3 "$tmp/tracked.tsv") >> "$tmp/differing.txt"

# Files on disk that differ but are not staged yet — they still have to be
# declared, and forgetting them is the usual way a batch of work fails the gate.
git diff --name-only -- "$prefix" | sed "s|^$prefix||" >> "$tmp/differing.txt"
git ls-files --others --exclude-standard -- "$prefix" | sed "s|^$prefix||" >> "$tmp/differing.txt"

LC_ALL=C sort -u "$tmp/differing.txt" | grep -v '^$' > "$tmp/final.txt"

case "$mode" in
  --markdown)
    sed 's/^/- `/; s/$/`/' "$tmp/final.txt"
    ;;
  --diff)
    if [ -f MODIFICATIONS.md ]; then
      awk '
        /<!--/ { c = 1 }
        !c && match($0, /^- `[^`]+`/) {
          line = substr($0, RSTART + 3, RLENGTH - 3); sub(/`$/, "", line); print line
        }
        /-->/ { c = 0 }
      ' MODIFICATIONS.md | LC_ALL=C sort -u > "$tmp/declared.txt"
    else
      : > "$tmp/declared.txt"
    fi
    echo "differs but NOT declared (would fail the gate):"
    comm -23 "$tmp/final.txt" "$tmp/declared.txt" | sed 's/^/  + /'
    echo "declared but does NOT differ (stale notice):"
    comm -13 "$tmp/final.txt" "$tmp/declared.txt" | sed 's/^/  - /'
    echo "in agreement: $(comm -12 "$tmp/final.txt" "$tmp/declared.txt" | wc -l | tr -d ' ')"
    ;;
  *)
    cat "$tmp/final.txt"
    ;;
esac
