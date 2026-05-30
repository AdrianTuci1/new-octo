#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

RELEASE_ENV_FILE="${RELEASE_ENV_FILE:-$ROOT_DIR/release.env}"

if [ -f "$RELEASE_ENV_FILE" ]; then
  set -a
  # Load release signing settings such as TAURI_SIGNING_PRIVATE_KEY for local bundles.
  . "$RELEASE_ENV_FILE"
  set +a
elif [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # Fall back to the app-local .env if no dedicated release env file exists.
  . "$ROOT_DIR/.env"
  set +a
fi

. ./scripts/tauri-env.sh

VERSION="$(sed -n 's/^version = "\(.*\)"/\1/p' src-tauri/Cargo.toml | head -n 1)"
PLATFORM_OVERRIDE="${1:-}"

detect_platform() {
  if [ -n "$PLATFORM_OVERRIDE" ]; then
    printf '%s\n' "$PLATFORM_OVERRIDE"
    return 0
  fi

  case "$(uname -s)" in
    Darwin) printf '%s\n' "macos" ;;
    Linux) printf '%s\n' "linux" ;;
    MINGW*|MSYS*|CYGWIN*|Windows_NT) printf '%s\n' "windows" ;;
    *)
      echo "Unsupported host platform: $(uname -s)" >&2
      exit 1
      ;;
  esac
}

copy_if_exists() {
  src_dir="$1"
  pattern="$2"

  if [ -d "$src_dir" ]; then
    find "$src_dir" -maxdepth 1 -type f -name "$pattern" -exec cp {} "$DEST_DIR/" \;
  fi
}

copy_dir_if_exists() {
  src_dir="$1"
  if [ -d "$src_dir" ]; then
    cp -R "$src_dir" "$DEST_DIR/"
  fi
}

run_tauri_build() {
  bundles="$1"
  echo "Building desktop bundles for $PLATFORM ($bundles)..."
  sh ./scripts/tauri-cli.sh build --bundles "$bundles"
}

PLATFORM="$(detect_platform)"
DEST_DIR="$ROOT_DIR/artifacts/desktop/${PLATFORM}-${VERSION}"
mkdir -p "$DEST_DIR"

case "$PLATFORM" in
  macos)
    run_tauri_build "app"
    copy_dir_if_exists "$ROOT_DIR/target/release/bundle/macos/Octomus Launcher Prototype.app"
    copy_if_exists "$ROOT_DIR/target/release/bundle/macos" "*.app.tar.gz"
    copy_if_exists "$ROOT_DIR/target/release/bundle/macos" "*.app.tar.gz.sig"

    if ! run_tauri_build "dmg"; then
      echo "DMG bundling failed. On macOS this is often caused by Finder Automation permissions for Terminal or Codex." >&2
      echo "Grant Finder automation access and rerun 'npm run release:dmg' if you need the installer image." >&2
      exit 1
    fi

    copy_if_exists "$ROOT_DIR/target/release/bundle/dmg" "*.dmg"
    echo "Desktop artifacts copied to $DEST_DIR"
    exit 0
    ;;
  linux)
    BUNDLES="appimage,deb"
    ;;
  windows)
    BUNDLES="nsis,msi"
    ;;
  *)
    echo "Unsupported desktop platform: $PLATFORM" >&2
    exit 1
    ;;
esac

run_tauri_build "$BUNDLES"

case "$PLATFORM" in
  macos)
    copy_dir_if_exists "$ROOT_DIR/target/release/bundle/macos/Octomus Launcher Prototype.app"
    copy_if_exists "$ROOT_DIR/target/release/bundle/dmg" "*.dmg"
    ;;
  linux)
    copy_if_exists "$ROOT_DIR/target/release/bundle/appimage" "*.AppImage"
    copy_if_exists "$ROOT_DIR/target/release/bundle/appimage" "*.AppImage.sig"
    copy_if_exists "$ROOT_DIR/target/release/bundle/deb" "*.deb"
    ;;
  windows)
    copy_if_exists "$ROOT_DIR/target/release/bundle/nsis" "*.exe"
    copy_if_exists "$ROOT_DIR/target/release/bundle/nsis" "*.exe.sig"
    copy_if_exists "$ROOT_DIR/target/release/bundle/msi" "*.msi"
    copy_if_exists "$ROOT_DIR/target/release/bundle/msi" "*.msi.sig"
    ;;
esac

echo "Desktop artifacts copied to $DEST_DIR"
