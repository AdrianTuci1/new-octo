#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

sh ./scripts/release-cli.sh
sh ./scripts/release-desktop.sh
