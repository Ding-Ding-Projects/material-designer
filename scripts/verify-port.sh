#!/usr/bin/env bash
# Prove that design/ is a byte-for-byte copy of the pinned upstream tree.
#
# Two independent checks, because they fail for different reasons:
#   A. working tree  — every file on disk hashes to the upstream blob id
#                      (catches a stray edit, a truncated copy, a missing file)
#   B. committed index — every tracked path under design/ has the upstream
#                      mode AND blob id (catches line-ending normalisation and
#                      lost executable bits, which check A cannot see)
#
# Usage: scripts/verify-port.sh [--json]
# Exits 0 only when both checks report zero gaps.

set -u -o pipefail

repo_root=$(git rev-parse --show-toplevel) || exit 2
cd "$repo_root" || exit 2

sub=vendor/open-design
prefix=design/
json=0
[ "${1:-}" = "--json" ] && json=1

if [ ! -e "$sub/.git" ]; then
  echo "verify-port: $sub is not checked out; run: git submodule update --init" >&2
  exit 2
fi

pinned=$(git -C "$sub" rev-parse HEAD)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# MODIFICATIONS.md is the Apache-2.0 section 4(b) notice AND the allowlist. A
# file may differ from upstream only if it is listed there, and a listed file
# that no longer differs is stale — both are reported. Keeping one list means
# the licence notice cannot quietly fall out of date.
: > "$tmp/allowed.txt"
if [ -f MODIFICATIONS.md ]; then
  # Skip HTML comment blocks — the file documents its own entry format inside
  # one, and a template must never be mistaken for a declaration.
  awk '
    /<!--/ { incomment = 1 }
    !incomment && match($0, /^- `[^`]+`/) {
      line = substr($0, RSTART + 3, RLENGTH - 3)
      sub(/`$/, "", line)
      print line
    }
    /-->/ { incomment = 0 }
  ' MODIFICATIONS.md | LC_ALL=C sort -u > "$tmp/allowed.txt"
fi
allowed=$(wc -l < "$tmp/allowed.txt" | tr -d ' ')

# Upstream manifest: mode <TAB> oid <TAB> path
git -C "$sub" ls-files -s |
  sed -E 's/^([0-7]+) ([0-9a-f]+) [0-9]+\t/\1\t\2\t/' |
  LC_ALL=C sort -t"$(printf '\t')" -k3,3 > "$tmp/upstream.tsv"
expected=$(wc -l < "$tmp/upstream.tsv" | tr -d ' ')

# ---- Check A: bytes on disk ----------------------------------------------
# One hash-object process for the whole tree. --no-filters is what makes this a
# byte comparison rather than a "what git would store" comparison.
cut -f3 "$tmp/upstream.tsv" | sed "s|^|$prefix|" > "$tmp/paths.txt"
missing=0
: > "$tmp/present.txt"
while IFS= read -r p; do
  if [ -f "$p" ]; then printf '%s\n' "$p" >> "$tmp/present.txt"; else
    printf 'missing\t%s\n' "${p#$prefix}" >> "$tmp/gaps.txt"; missing=$((missing + 1))
  fi
done < "$tmp/paths.txt"

git hash-object --no-filters --stdin-paths < "$tmp/present.txt" > "$tmp/actual-oids.txt"
paste "$tmp/actual-oids.txt" "$tmp/present.txt" |
  sed "s|\t$prefix|\t|" |
  LC_ALL=C sort -t"$(printf '\t')" -k2,2 > "$tmp/disk.tsv"

join -t"$(printf '\t')" -1 3 -2 2 -o '1.3,1.2,2.1' \
  <(LC_ALL=C sort -t"$(printf '\t')" -k3,3 "$tmp/upstream.tsv") "$tmp/disk.tsv" |
  awk -F'\t' '$2 != $3 { printf "bytes-differ\t%s\n", $1 }' >> "$tmp/gaps.txt" 2>/dev/null || true

# ---- Check B: what git actually recorded ---------------------------------
git ls-files -s -- "$prefix" |
  sed -E "s|^([0-7]+) ([0-9a-f]+) [0-9]+\t${prefix}|\1\t\2\t|" |
  LC_ALL=C sort -t"$(printf '\t')" -k3,3 > "$tmp/tracked.tsv"
tracked=$(wc -l < "$tmp/tracked.tsv" | tr -d ' ')

# A zero here means the check silently did nothing, which reads exactly like a
# pass. Fail loudly instead.
if [ "$tracked" -eq 0 ]; then
  echo "verify-port: no tracked paths under $prefix — check B would be a no-op" >&2
  exit 2
fi

join -t"$(printf '\t')" -1 3 -2 3 -o '1.3,1.1,1.2,2.1,2.2' \
  "$tmp/upstream.tsv" "$tmp/tracked.tsv" |
  awk -F'\t' '
    $2 != $4 { printf "mode\t%s\t(%s vs %s)\n", $1, $2, $4 }
    $3 != $5 { printf "oid\t%s\n", $1 }
  ' >> "$tmp/gaps.txt" 2>/dev/null || true

# Paths tracked under design/ that upstream does not have.
comm -13 <(cut -f3 "$tmp/upstream.tsv") <(cut -f3 "$tmp/tracked.tsv") |
  sed 's/^/extra\t/' >> "$tmp/gaps.txt" 2>/dev/null || true

# Untracked, non-ignored files loose in design/ (an interrupted copy leaves these)
git ls-files --others --exclude-standard -- "$prefix" |
  sed "s|^$prefix|untracked\t|" >> "$tmp/gaps.txt" 2>/dev/null || true

touch "$tmp/gaps.txt"

# Drop the gaps that MODIFICATIONS.md declares, then report any declaration that
# no longer corresponds to a real difference — a stale notice is a licence
# problem, not a tidiness one.
if [ "$allowed" -gt 0 ]; then
  LC_ALL=C sort -u -t"$(printf '\t')" -k2,2 "$tmp/gaps.txt" > "$tmp/gaps.sorted"
  cut -f2 "$tmp/gaps.txt" | LC_ALL=C sort -u > "$tmp/differing.txt"
  awk -F'\t' 'NR==FNR { ok[$0]=1; next } !($2 in ok)' \
    "$tmp/allowed.txt" "$tmp/gaps.txt" > "$tmp/gaps.filtered"
  comm -23 "$tmp/allowed.txt" "$tmp/differing.txt" |
    sed 's/^/stale-notice\t/' >> "$tmp/gaps.filtered"
  mv "$tmp/gaps.filtered" "$tmp/gaps.txt"
fi
gaps=$(wc -l < "$tmp/gaps.txt" | tr -d ' ')
matched=$((expected - missing))

count() { grep -c "^$1	" "$tmp/gaps.txt" 2>/dev/null || true; }
n_missing=$(count missing); n_bytes=$(count bytes-differ)
n_mode=$(count mode); n_oid=$(count oid)
n_extra=$(count extra); n_untracked=$(count untracked)
n_stale=$(count stale-notice)

if [ "$json" = 1 ]; then
  printf '{"pinned":"%s","expected":%s,"tracked":%s,"declared":%s,"missing":%s,"bytesDiffer":%s,"modeMismatch":%s,"oidMismatch":%s,"extra":%s,"untracked":%s,"staleNotice":%s,"gaps":%s}\n' \
    "$pinned" "$expected" "$tracked" "$allowed" "${n_missing:-0}" "${n_bytes:-0}" "${n_mode:-0}" "${n_oid:-0}" "${n_extra:-0}" "${n_untracked:-0}" "${n_stale:-0}" "$gaps"
else
  echo "verify-port: design/ vs $sub @ $pinned"
  echo "  expected       $expected"
  echo "  tracked        $tracked"
  echo "  present        $matched"
  echo "  declared       $allowed   (MODIFICATIONS.md)"
  echo "  missing        ${n_missing:-0}"
  echo "  bytes differ   ${n_bytes:-0}"
  echo "  mode mismatch  ${n_mode:-0}"
  echo "  oid mismatch   ${n_oid:-0}"
  echo "  extra          ${n_extra:-0}"
  echo "  untracked      ${n_untracked:-0}"
  echo "  stale notice   ${n_stale:-0}"
fi

if [ "$gaps" -ne 0 ]; then
  echo "" >&2
  echo "verify-port: $gaps gap(s); first 50:" >&2
  head -50 "$tmp/gaps.txt" >&2
  exit 1
fi

[ "$json" = 1 ] || echo "verify-port: 0 gaps."
exit 0
