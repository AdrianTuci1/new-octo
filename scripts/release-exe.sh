#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*|Windows_NT)
    sh ./scripts/release-desktop.sh windows
    ;;
  *)
    echo "Windows installer builds must run on Windows." >&2
    exit 1
    ;;
esac
