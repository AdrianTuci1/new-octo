#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "DMG builds must run on macOS." >&2
  exit 1
fi

sh ./scripts/release-desktop.sh macos
