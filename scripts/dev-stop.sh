#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
PID_FILE="$ROOT_DIR/.dev.pid"
LOG_FILE="$ROOT_DIR/.dev.log"

if [ ! -f "$PID_FILE" ]; then
  echo "Launcher prototype is not running"
  exit 0
fi

PID="$(cat "$PID_FILE")"

if kill -0 "$PID" 2>/dev/null; then
  kill "$PID" 2>/dev/null || true
  sleep 1
  if kill -0 "$PID" 2>/dev/null; then
    kill -9 "$PID" 2>/dev/null || true
  fi
  echo "Launcher prototype stopped"
else
  echo "Launcher prototype was already stopped"
fi

rm -f "$PID_FILE"
echo "Last log file: $LOG_FILE"
