#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ENV_FILE="${TESTS_ENV_FILE:-$ROOT_DIR/tests.env}"

if [ "$#" -eq 0 ]; then
  echo "Usage: sh ./scripts/test-model-env.sh <command> [args...]"
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing test env file: $ENV_FILE"
  echo "Copy tests.env.example to tests.env and fill in the model credentials for test-only runs."
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

exec "$@"
