#!/bin/sh
set -eu

REPO="pzarzycki/token-companion"
VERSION="${TOKEN_COMPANION_VERSION:-latest}"
BUILD_ROOT="${TOKEN_COMPANION_BUILD_ROOT:-${XDG_CACHE_HOME:-$HOME/.cache}/token-companion}"

usage() {
  cat <<'EOF'
Token Companion source installer

Usage:
  sh install.sh [options]

Options:
  --version <ref>        Git tag or branch to build. Defaults to latest release, then main.
  --dry-run              Print commands and install targets without building.
  --package-only         Build packages but do not copy or install the built app.
  --install-dir <path>   macOS app destination. Defaults to ~/Applications. Ignored on Windows.
  --help                 Show this help.

Environment:
  TOKEN_COMPANION_VERSION      Same as --version.
  TOKEN_COMPANION_BUILD_ROOT   Source/build cache root.
EOF
}

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}

resolve_latest() {
  if command -v curl >/dev/null 2>&1; then
    tag="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1 || true)"
  else
    tag=""
  fi

  if [ -n "$tag" ]; then
    printf '%s\n' "$tag"
  else
    printf '%s\n' "main"
  fi
}

ref_kind() {
  case "$1" in
    main|master) printf '%s\n' "heads" ;;
    *) printf '%s\n' "tags" ;;
  esac
}

sanitize_ref() {
  printf '%s\n' "$1" | sed 's/[^A-Za-z0-9._-]/-/g'
}

download_source() {
  ref="$1"
  kind="$(ref_kind "$ref")"
  safe_ref="$(sanitize_ref "$ref")"
  target="$BUILD_ROOT/source-$safe_ref"
  archive="$BUILD_ROOT/source-$safe_ref.tar.gz"
  url="https://github.com/$REPO/archive/refs/$kind/$ref.tar.gz"

  mkdir -p "$BUILD_ROOT"
  rm -rf "$target"
  mkdir -p "$target"

  echo "Downloading source: $url"
  if command -v curl >/dev/null 2>&1; then
    curl -fL "$url" -o "$archive"
  elif command -v wget >/dev/null 2>&1; then
    wget -O "$archive" "$url"
  else
    echo "curl or wget is required to download source archives." >&2
    exit 1
  fi

  tar -xzf "$archive" -C "$target" --strip-components 1
  printf '%s\n' "$target"
}

SCRIPT_DIR=""
case "${0:-}" in
  */*) SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)" ;;
esac

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  usage
  exit 0
fi

expect_version=0
for arg in "$@"; do
  if [ "$expect_version" -eq 1 ]; then
    VERSION="$arg"
    expect_version=0
    continue
  fi

  case "$arg" in
    --version)
      expect_version=1
      ;;
    --version=*)
      VERSION="${arg#--version=}"
      ;;
  esac
done

if [ "$expect_version" -eq 1 ]; then
  echo "--version requires a value" >&2
  exit 1
fi

need node
need npm

if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/scripts/install.mjs" ]; then
  SOURCE_DIR="$SCRIPT_DIR"
else
  if [ "$VERSION" = "latest" ]; then
    VERSION="$(resolve_latest)"
  fi
  SOURCE_DIR="$(download_source "$VERSION")"
fi

echo "Building Token Companion from $SOURCE_DIR"
cd "$SOURCE_DIR"
exec node scripts/install.mjs "$@"
