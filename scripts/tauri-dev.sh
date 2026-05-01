#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

. ./scripts/tauri-env.sh
exec npx tauri dev --runner "$TAURI_CARGO_BIN"
