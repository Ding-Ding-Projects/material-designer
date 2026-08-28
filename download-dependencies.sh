#!/usr/bin/env bash
set -euo pipefail

silent=0
for arg in "$@"; do
  case "$arg" in
    /s|--silent) silent=1 ;;
    *) printf 'Unknown option: %s\n' "$arg" >&2; exit 2 ;;
  esac
done
if [[ "${SILENT:-0}" == "1" ]]; then silent=1; fi

repo_root="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
manifest_path="$repo_root/dependencies.manifest.json"
tool_root="${XDG_CACHE_HOME:-$HOME/.cache}/material-designer/toolchain"
mkdir -p "$tool_root"

say() { (( silent )) || printf '[download-dependencies] %s\n' "$*"; }
die() { printf 'Dependency bootstrap failed: %s\n' "$*" >&2; exit 1; }
manifest_value() {
  local id="$1" key="$2"
  awk -v wanted_id="$id" -v wanted_key="$key" '
    index($0, "\"id\": \"" wanted_id "\"") > 0 { inside=1; next }
    inside && index($0, "\"id\":") > 0 { exit }
    inside && index($0, "\"" wanted_key "\":") > 0 {
      line=$0
      sub(/^[^:]*:[[:space:]]*"/, "", line)
      sub(/",?[[:space:]]*$/, "", line)
      print line
      exit
    }
  ' "$manifest_path"
}
manifest_validate() {
  [[ "$(awk '/"schemaVersion": 1/{count++} END{print count+0}' "$manifest_path")" == 1 ]] || die 'dependency manifest schemaVersion must be exactly 1'
  [[ "$(grep -c '"format":' "$manifest_path")" == 6 ]] || die 'dependency manifest must contain exactly six platform entries'
  [[ "$(manifest_value git format)" == zip && "$(manifest_value node format)" == zip && "$(manifest_value pnpm format)" == npm-tarball && "$(manifest_value python format)" == zip ]] || die 'dependency manifest formats are invalid'
  grep -q '"format": "tar.xz"' "$manifest_path" || die 'Linux Node format is missing from the dependency manifest'
  [[ "$(manifest_value node url)" == https://nodejs.org/* ]] || die 'Node source is not the canonical HTTPS host'
  [[ "$(manifest_value pnpm url)" == https://registry.npmjs.org/* ]] || die 'pnpm source is not the canonical HTTPS host'
  [[ "$(manifest_value git url)" == https://github.com/git-for-windows/* ]] || die 'Git source is not the canonical HTTPS host'
  [[ "$(manifest_value python url)" == https://www.python.org/* ]] || die 'Python source is not the canonical HTTPS host'
  [[ "$(manifest_value git sha256)" =~ ^[0-9a-fA-F]{64}$ ]] || die 'Git SHA-256 is invalid'
  [[ "$(manifest_value node sha256)" =~ ^[0-9a-fA-F]{64}$ ]] || die 'Node SHA-256 is invalid'
  [[ "$(manifest_value python sha256)" =~ ^[0-9a-fA-F]{64}$ ]] || die 'Python SHA-256 is invalid'
  [[ "$(manifest_value pnpm sha512Base64)" =~ ^[A-Za-z0-9+/]+=*$ ]] || die 'pnpm SHA-512 integrity is invalid'
  [[ "$(manifest_value git version)" == 2.55.0.windows.5 && "$(manifest_value node version)" == 24.20.0 && "$(manifest_value pnpm version)" == 10.33.2 && "$(manifest_value python version)" == 3.12.10 ]] || die 'dependency manifest versions are not the supported exact pins'
}
sha256_file() { sha256sum "$1" | awk '{print $1}'; }
sha512_b64() { openssl dgst -sha512 -binary "$1" | base64 | tr -d '\n'; }
download_verified() {
  local url="$1" dest="$2" expected_sha256="${3:-}" expected_sha512="${4:-}" tmp
  tmp="$(mktemp "${dest}.download.XXXXXX")" || die "could not create a unique temporary file beside $dest"
  say "Downloading $(basename "$dest") from the canonical source"
  if ! curl --fail --location --retry 3 --retry-delay 2 --silent --show-error --connect-timeout 20 --max-time 600 "$url" --output "$tmp"; then
    rm -f -- "$tmp"
    die "download failed for $url"
  fi
  [[ -z "$expected_sha256" || "$(sha256_file "$tmp")" == "$expected_sha256" ]] || die "SHA-256 mismatch for $url"
  [[ -z "$expected_sha512" || "$(sha512_b64 "$tmp")" == "$expected_sha512" ]] || die "SHA-512 integrity mismatch for $url"
  mv -f -- "$tmp" "$dest"
}

[[ -f "$manifest_path" ]] || die "dependency manifest is missing: $manifest_path"
manifest_validate
exec 9>"$tool_root/.download-dependencies.lock"
flock -w 120 9 || die "timed out waiting for dependency bootstrap lock"

if [[ "$(uname -s)" != "Linux" ]]; then die "this companion script supports Linux only; use download-dependencies.bat on Windows"; fi
case "$(uname -m)" in x86_64) ;; *) die "unsupported Linux architecture: $(uname -m)" ;; esac

node_version="$(manifest_value node version)"
node_url="$(manifest_value node url)"
node_sha256="$(manifest_value node sha256)"
[[ -n "$node_version" && -n "$node_url" && -n "$node_sha256" ]] || die 'the Linux Node manifest entry is incomplete'
node_root="$tool_root/node-v${node_version}-linux-x64"
node_bin="$node_root/bin/node"
node_archive="$tool_root/node-v${node_version}-linux-x64.tar.xz"
if [[ ! -f "$node_archive" || "$(sha256_file "$node_archive")" != "$node_sha256" ]]; then
  download_verified "$node_url" "$node_archive" "$node_sha256"
fi
if [[ ! -x "$node_bin" ]]; then
  rm -rf -- "$node_root"
  tar -xJf "$node_archive" -C "$tool_root"
fi
export PATH="$node_root/bin:$PATH"
[[ "$(node --version)" == "v${node_version}" ]] || die "expected Node v${node_version}"

pnpm_version="$(manifest_value pnpm version)"
pnpm_url="$(manifest_value pnpm url)"
pnpm_sha512="$(manifest_value pnpm sha512Base64)"
[[ -n "$pnpm_version" && -n "$pnpm_url" && -n "$pnpm_sha512" ]] || die 'the Linux pnpm manifest entry is incomplete'
pnpm_root="$tool_root/pnpm-${pnpm_version}"
pnpm_bin=""
for candidate in "$pnpm_root/pnpm" "$pnpm_root/bin/pnpm" "$pnpm_root/node_modules/.bin/pnpm"; do
  if [[ -x "$candidate" ]]; then pnpm_bin="$candidate"; break; fi
done
pnpm_tarball="$tool_root/pnpm-${pnpm_version}.tgz"
if [[ ! -f "$pnpm_tarball" || "$(sha512_b64 "$pnpm_tarball")" != "$pnpm_sha512" ]]; then
  download_verified "$pnpm_url" "$pnpm_tarball" "" "$pnpm_sha512"
fi
if [[ ! -x "$pnpm_bin" ]]; then
  mkdir -p "$pnpm_root"
  npm install --prefix "$pnpm_root" --global "$pnpm_tarball" --ignore-scripts --no-audit --no-fund >/dev/null
  for candidate in "$pnpm_root/pnpm" "$pnpm_root/bin/pnpm" "$pnpm_root/node_modules/.bin/pnpm"; do
    if [[ -x "$candidate" ]]; then pnpm_bin="$candidate"; break; fi
  done
fi
[[ -x "$pnpm_bin" ]] || die "pnpm ${pnpm_version} was installed but its executable was not materialized"
export PATH="$(dirname "$pnpm_bin"):$pnpm_root:$pnpm_root/node_modules/.bin:$PATH"
[[ "$(pnpm --version)" == "$pnpm_version" ]] || die "expected pnpm ${pnpm_version}"
command -v git >/dev/null 2>&1 || die 'git is required to open the checkout and is not available on PATH'
say "Dependencies ready: Node ${node_version}, pnpm ${pnpm_version}, and Git"
