#!/usr/bin/env bash
set -euo pipefail

# Self-hosted Linux runners are persistent, but the workflow must not assume
# that a previous job left GitHub CLI or jq installed. Keep these downloads in
# the runner's tool cache, use fixed upstream release URLs, and expose the
# directory only to this job through GITHUB_PATH.

tool_root="${RUNNER_TOOL_CACHE:-${RUNNER_TEMP:-/tmp}}/material-designer-ci-tools"
bin_dir="$tool_root/bin"
mkdir -p "$bin_dir"

arch="$(uname -m)"
case "$arch" in
  x86_64) gh_arch="amd64"; jq_arch="amd64" ;;
  aarch64|arm64) gh_arch="arm64"; jq_arch="arm64" ;;
  *) echo "::error::unsupported Linux runner architecture: $arch"; exit 1 ;;
esac

download() {
  local url="$1" destination="$2"
  curl --fail --location --retry 3 --retry-delay 2 --silent --show-error "$url" --output "$destination"
}

if ! command -v gh >/dev/null 2>&1; then
  gh_version="2.76.2"
  gh_archive="$tool_root/gh.tar.gz"
  gh_extract="$tool_root/gh"
  rm -rf "$gh_extract"
  mkdir -p "$gh_extract"
  download "https://github.com/cli/cli/releases/download/v${gh_version}/gh_${gh_version}_linux_${gh_arch}.tar.gz" "$gh_archive"
  tar -xzf "$gh_archive" --strip-components=2 -C "$gh_extract" "gh_${gh_version}_linux_${gh_arch}/bin/gh"
  install -m 0755 "$gh_extract/gh" "$bin_dir/gh"
fi

if ! command -v jq >/dev/null 2>&1; then
  jq_version="1.8.0"
  download "https://github.com/jqlang/jq/releases/download/jq-${jq_version}/jq-linux-${jq_arch}" "$bin_dir/jq"
  chmod 0755 "$bin_dir/jq"
fi

export PATH="$bin_dir:$PATH"
printf '%s\n' "$bin_dir" >> "${GITHUB_PATH:?GITHUB_PATH is required by GitHub Actions}"

for tool in bash git curl tar install gh jq awk sed grep cat cp ls wc head tr; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "::error::CI tool bootstrap did not provide $tool"
    exit 1
  }
done

echo "Linux CI tools ready: gh $(gh --version | head -1); jq $(jq --version)"
