#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

. ./scripts/tauri-env.sh

# 1. Verificăm dacă 'zig' este instalat
if ! command -v zig >/dev/null 2>&1; then
  echo "Eroare: 'zig' nu este instalat pe sistemul tău." >&2
  echo "Te rog rulează: brew install zig" >&2
  exit 1
fi

# 2. Verificăm dacă 'cargo-zigbuild' este instalat
if ! command -v cargo-zigbuild >/dev/null 2>&1; then
  echo "Eroare: 'cargo-zigbuild' nu este instalat." >&2
  echo "Te rog rulează: cargo install cargo-zigbuild" >&2
  exit 1
fi

TARGET_TRIPLE="x86_64-unknown-linux-musl"

# Asigurăm existența target-ului de Rust
echo "Verificare target Rust pentru Linux ($TARGET_TRIPLE)..."
rustup target add "$TARGET_TRIPLE" >/dev/null 2>&1 || true

VERSION="$(sed -n 's/^version = "\(.*\)"/\1/p' octomus-cli/Cargo.toml | head -n 1)"
BIN_NAME="octomus-cli"
PACKAGE_NAME="${BIN_NAME}-${VERSION}-${TARGET_TRIPLE}"
STAGE_DIR="$ROOT_DIR/artifacts/cli/$PACKAGE_NAME"
ARCHIVE_PATH="$ROOT_DIR/artifacts/cli/${PACKAGE_NAME}.tar.gz"
CHECKSUM_PATH="${ARCHIVE_PATH}.sha256"

# Curățăm și pregătim folderele
rm -rf "$STAGE_DIR"
mkdir -p "$ROOT_DIR/artifacts/cli"
mkdir -p "$STAGE_DIR"

echo "Compilare locală $BIN_NAME pentru Linux ($TARGET_TRIPLE) folosind cargo-zigbuild..."
cargo zigbuild --manifest-path octomus-cli/Cargo.toml --release --target "$TARGET_TRIPLE"

# Copiem fișierele în folderul de release staging
cp "target/$TARGET_TRIPLE/release/$BIN_NAME" "$STAGE_DIR/$BIN_NAME"
if [ -f README.md ]; then
  cp README.md "$STAGE_DIR/README.md"
fi

# Împachetăm totul într-o arhivă .tar.gz curată
echo "Împachetare arhivă..."
tar -czf "$ARCHIVE_PATH" -C "$ROOT_DIR/artifacts/cli" "$PACKAGE_NAME"
echo "Arhivă creată cu succes la: $ARCHIVE_PATH"

# Generăm checksum-ul SHA256 pentru verificare securitate
if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$ARCHIVE_PATH" > "$CHECKSUM_PATH"
  echo "Checksum creat la: $CHECKSUM_PATH"
elif command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$ARCHIVE_PATH" > "$CHECKSUM_PATH"
  echo "Checksum creat la: $CHECKSUM_PATH"
fi

echo "---"
echo "Build local de Linux CLI finalizat cu succes! Fișierele sunt în:"
echo "artifacts/cli/$PACKAGE_NAME.tar.gz"
