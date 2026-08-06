#!/usr/bin/env bash
set -euo pipefail

# Self-hosted Linux runners are persistent and can run jobs concurrently. Keep
# the pinned tools in a user-scoped cache, use the kernel-backed flock lock
# while updating it, validate cached versions and package hashes, and expose
# only this cache through GITHUB_PATH.

tool_root="${RUNNER_TOOL_CACHE:-${RUNNER_TEMP:-/tmp}}/material-designer-ci-tools"
bin_dir="$tool_root/bin"
mkdir -p "$bin_dir"

arch="$(uname -m)"
case "$arch" in
  x86_64)
    gh_arch="amd64"
    jq_arch="amd64"
    gh_sha256="62544b0f3759bbf1155c0ac3d75838b5fe23d66dfb75cf8368f84fff8f82b93e"
    jq_sha256="8926c33326111bcd67a47a970b5a5db933ef9194ad925994934c639c76a0605c"
    ;;
  aarch64|arm64)
    gh_arch="arm64"
    jq_arch="arm64"
    gh_sha256="a77f6d709c5100cda8e9bbb8d8b7143120121233d9102ba2f2bc254134db18dc"
    jq_sha256="1084e6bf5060a463daf77193888d326c83e56bcfbc18a52e6eaa99dbe82a8b54"
    ;;
  *) echo "::error::unsupported Linux runner architecture: $arch"; exit 1 ;;
esac

gh_version="2.76.2"
jq_version="1.8.0"

download() {
  local url="$1" destination="$2"
  curl --fail --location --retry 3 --retry-delay 2 --silent --show-error "$url" --output "$destination"
}

verify_sha256() {
  local expected="$1" path="$2" actual
  actual="$(sha256sum "$path" | awk '{print $1}')"
  if [ "$actual" != "$expected" ]; then
    echo "::error::SHA-256 mismatch for $path"
    exit 1
  fi
}

main() {
  local gh_bin="$bin_dir/gh"
  local gh_archive="$tool_root/gh-${gh_version}-${gh_arch}.tar.gz"
  local gh_extract="$tool_root/gh-${gh_version}-${gh_arch}"
  local gh_line jq_bin jq_line jq_download

  gh_line="$(test -x "$gh_bin" && test -f "$gh_archive" && "$gh_bin" --version 2>/dev/null | head -1 || true)"
  if [[ "$gh_line" != "gh version ${gh_version}"* ]] || [ ! -f "$gh_archive" ]; then
    rm -rf "$gh_extract"
    mkdir -p "$gh_extract"
    download "https://github.com/cli/cli/releases/download/v${gh_version}/gh_${gh_version}_linux_${gh_arch}.tar.gz" "$gh_archive"
    verify_sha256 "$gh_sha256" "$gh_archive"
    tar -xzf "$gh_archive" --strip-components=2 -C "$gh_extract" "gh_${gh_version}_linux_${gh_arch}/bin/gh"
    install -m 0755 "$gh_extract/gh" "$gh_bin"
  else
    verify_sha256 "$gh_sha256" "$gh_archive"
  fi

  jq_bin="$bin_dir/jq"
  jq_line="$(test -x "$jq_bin" && "$jq_bin" --version 2>/dev/null || true)"
  if [ "$jq_line" != "jq-${jq_version}" ] || [ ! -x "$jq_bin" ]; then
    jq_download="$bin_dir/jq.download"
    download "https://github.com/jqlang/jq/releases/download/jq-${jq_version}/jq-linux-${jq_arch}" "$jq_download"
    verify_sha256 "$jq_sha256" "$jq_download"
    chmod 0755 "$jq_download"
    mv -f "$jq_download" "$jq_bin"
  else
    verify_sha256 "$jq_sha256" "$jq_bin"
  fi

  export PATH="$bin_dir:$PATH"
  printf '%s\n' "$bin_dir" >> "${GITHUB_PATH:?GITHUB_PATH is required by GitHub Actions}"

  for tool in bash git curl tar install gh jq awk sed grep cat cp ls wc head tail paste tr mkdir sleep rm sha256sum flock; do
    command -v "$tool" >/dev/null 2>&1 || {
      echo "::error::CI tool bootstrap did not provide $tool"
      exit 1
    }
  done

  case "$(gh --version | head -1)" in
    "gh version ${gh_version}"*) ;;
    *) echo "::error::CI tool bootstrap resolved an unexpected gh version"; exit 1 ;;
  esac
  [ "$(jq --version)" = "jq-${jq_version}" ] || {
    echo "::error::CI tool bootstrap resolved an unexpected jq version"
    exit 1
  }
  echo "Linux CI tools ready: gh $(gh --version | head -1); jq $(jq --version)"
}

command -v flock >/dev/null 2>&1 || {
  echo "::error::Linux CI tool bootstrap requires the standard flock utility"
  exit 1
}
(
  flock -w 120 9 || {
    echo "::error::timed out waiting for the CI tool cache lock"
    exit 1
  }
  main
) 9>"$tool_root/.bootstrap.lock"
