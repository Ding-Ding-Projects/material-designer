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
tool_root="${XDG_CACHE_HOME:-$HOME/.cache}/material-designer/toolchain"
mkdir -p "$tool_root"

say() { (( silent )) || printf '[download-dependencies] %s\n' "$*"; }
die() { printf 'Dependency bootstrap failed: %s\n' "$*" >&2; exit 1; }
sha256_file() { sha256sum "$1" | awk '{print $1}'; }
sha512_b64() { openssl dgst -sha512 -binary "$1" | base64 | tr -d '\n'; }
download_verified() {
  local url="$1" dest="$2" expected_sha256="${3:-}" expected_sha512="${4:-}" tmp="${dest}.download"
  rm -f -- "$tmp"
  say "Downloading $(basename "$dest") from the canonical source"
  curl --fail --location --retry 3 --retry-delay 2 --silent --show-error --connect-timeout 20 --max-time 600 "$url" --output "$tmp"
  [[ -z "$expected_sha256" || "$(sha256_file "$tmp")" == "$expected_sha256" ]] || die "SHA-256 mismatch for $url"
  [[ -z "$expected_sha512" || "$(sha512_b64 "$tmp")" == "$expected_sha512" ]] || die "SHA-512 integrity mismatch for $url"
  mv -f -- "$tmp" "$dest"
}

if [[ "$(uname -s)" != "Linux" ]]; then die "this companion script supports Linux only; use download-dependencies.bat on Windows"; fi
case "$(uname -m)" in x86_64) ;; *) die "unsupported Linux architecture: $(uname -m)" ;; esac

node_version=24.20.0
node_root="$tool_root/node-v${node_version}-linux-x64"
node_bin="$node_root/bin/node"
node_archive="$tool_root/node-v${node_version}-linux-x64.tar.xz"
if [[ ! -f "$node_archive" || "$(sha256_file "$node_archive")" != "2f2c0da162318f0de47665410c7c8c2ed3d36c8f3105de4bbc61176c70a7cbf2" ]]; then
  download_verified "https://nodejs.org/dist/v${node_version}/node-v${node_version}-linux-x64.tar.xz" "$node_archive" "2f2c0da162318f0de47665410c7c8c2ed3d36c8f3105de4bbc61176c70a7cbf2"
fi
if [[ ! -x "$node_bin" ]]; then
  rm -rf -- "$node_root"
  tar -xJf "$node_archive" -C "$tool_root"
fi
export PATH="$node_root/bin:$PATH"
[[ "$(node --version)" == "v${node_version}" ]] || die "expected Node v${node_version}"

pnpm_version=10.33.2
pnpm_root="$tool_root/pnpm-${pnpm_version}"
pnpm_bin=""
for candidate in "$pnpm_root/pnpm" "$pnpm_root/bin/pnpm" "$pnpm_root/node_modules/.bin/pnpm"; do
  if [[ -x "$candidate" ]]; then pnpm_bin="$candidate"; break; fi
done
pnpm_tarball="$tool_root/pnpm-${pnpm_version}.tgz"
if [[ ! -f "$pnpm_tarball" || "$(sha512_b64 "$pnpm_tarball")" != "qQ+vb+6rca1sblf5Tg/hoS9dzCLNdU20CulZPraj4LaxLjVAIYuzeuCDQEsfLObbKkEh6XmCm0r/lLmfSdoc+A==" ]]; then
  download_verified "https://registry.npmjs.org/pnpm/-/pnpm-${pnpm_version}.tgz" "$pnpm_tarball" "" "qQ+vb+6rca1sblf5Tg/hoS9dzCLNdU20CulZPraj4LaxLjVAIYuzeuCDQEsfLObbKkEh6XmCm0r/lLmfSdoc+A=="
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
