#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

. ./scripts/tauri-env.sh

VERSION="$(sed -n 's/^version = "\(.*\)"/\1/p' src-tauri/Cargo.toml | head -n 1)"
TARGET_TRIPLE="$(cargo -vV | sed -n 's/^host: //p')"
BIN_NAME="octomus-cli"
PACKAGE_NAME="${BIN_NAME}-${VERSION}-${TARGET_TRIPLE}"
STAGE_DIR="$ROOT_DIR/artifacts/cli/$PACKAGE_NAME"
ARCHIVE_PATH="$ROOT_DIR/artifacts/cli/${PACKAGE_NAME}.tar.gz"
CHECKSUM_PATH="${ARCHIVE_PATH}.sha256"

mkdir -p "$ROOT_DIR/artifacts/cli"
mkdir -p "$STAGE_DIR"

echo "Building $BIN_NAME for $TARGET_TRIPLE..."
cargo build --manifest-path src-tauri/Cargo.toml --release --bin "$BIN_NAME"

cp "target/release/$BIN_NAME" "$STAGE_DIR/$BIN_NAME"
cp README.md "$STAGE_DIR/README.md"

tar -czf "$ARCHIVE_PATH" -C "$ROOT_DIR/artifacts/cli" "$PACKAGE_NAME"
echo "Created $ARCHIVE_PATH"

if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$ARCHIVE_PATH" > "$CHECKSUM_PATH"
  echo "Created $CHECKSUM_PATH"
elif command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$ARCHIVE_PATH" > "$CHECKSUM_PATH"
  echo "Created $CHECKSUM_PATH"
fi
