#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
PID_FILE="$ROOT_DIR/.dev.pid"
LOG_FILE="$ROOT_DIR/.dev.log"

if [ ! -f "$ROOT_DIR/package.json" ]; then
  echo "package.json not found in $ROOT_DIR"
  exit 1
fi

if [ ! -d "$ROOT_DIR/node_modules" ]; then
  echo "Dependencies are not installed yet."
  echo "Run: cd \"$ROOT_DIR\" && npm install"
  exit 1
fi

. "$ROOT_DIR/scripts/tauri-env.sh" >/dev/null

if [ -f "$PID_FILE" ]; then
  PID="$(cat "$PID_FILE")"
  if kill -0 "$PID" 2>/dev/null; then
    echo "Launcher prototype is already running with PID $PID"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

cd "$ROOT_DIR"
nohup npm run dev:app >"$LOG_FILE" 2>&1 &
PID=$!
echo "$PID" >"$PID_FILE"

echo "Launcher prototype started with PID $PID"
echo "Logs: $LOG_FILE"
