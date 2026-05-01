#!/bin/sh
set -eu

if [ -f "$HOME/.cargo/env" ]; then
  # shellcheck disable=SC1090
  . "$HOME/.cargo/env"
fi

export PATH="$HOME/.cargo/bin:$PATH"
export CARGO_HOME="${CARGO_HOME:-$HOME/.cargo}"
export RUSTUP_HOME="${RUSTUP_HOME:-$HOME/.rustup}"
export TAURI_CARGO_BIN="$HOME/.cargo/bin/cargo"

if ! command -v cargo >/dev/null 2>&1; then
  echo "cargo is still unavailable after loading ~/.cargo/env"
  exit 1
fi

if [ ! -x "$TAURI_CARGO_BIN" ]; then
  echo "Expected cargo binary at $TAURI_CARGO_BIN but it is not executable"
  exit 1
fi
