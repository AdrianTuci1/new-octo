#!/bin/sh
set -eu
ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$ROOT_DIR"

if ! command -v cargo >/dev/null 2>&1; then
  echo "Rust toolchain is missing. Install Rust first:"
  echo "curl https://sh.rustup.rs -sSf | sh"
  exit 1
fi

sh ./scripts/dev-start.sh
