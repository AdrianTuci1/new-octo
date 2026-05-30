#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

RELEASE_ENV_FILE="${RELEASE_ENV_FILE:-$ROOT_DIR/release.env}"

if [ -f "$RELEASE_ENV_FILE" ]; then
  set -a
  # Load release-only settings such as AWS_REGION or R2_* values.
  . "$RELEASE_ENV_FILE"
  set +a
elif [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # Fall back to the app-local .env if no dedicated release env file exists.
  . "$ROOT_DIR/.env"
  set +a
fi

TARGETS="${1:-all}"
VERSION="$(sed -n 's/^version = "\(.*\)"/\1/p' src-tauri/Cargo.toml | head -n 1)"
TIMESTAMP="$(date -u +%Y%m%d%H%M%S)"
RUN_ID="${TIMESTAMP}"

case "$TARGETS" in
  all|linux|windows)
    ;;
  *)
    echo "Usage: npm run release:aws -- [all|linux|windows]" >&2
    exit 1
    ;;
esac

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd aws
require_cmd zip
require_cmd unzip
require_cmd git
require_cmd node

aws_r2() {
  AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID:-}" \
  AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY:-}" \
  AWS_SESSION_TOKEN="${R2_SESSION_TOKEN:-}" \
  aws "$@"
}

strip_trailing_slash() {
  value="$1"
  while [ "${value%/}" != "$value" ]; do
    value="${value%/}"
  done
  printf '%s\n' "$value"
}

base64_inline() {
  printf '%s' "$1" | base64 | tr -d '\n'
}

resolve_signing_private_key() {
  if [ -n "${TAURI_SIGNING_PRIVATE_KEY_FILE:-}" ]; then
    cat "$TAURI_SIGNING_PRIVATE_KEY_FILE"
    return 0
  fi

  if [ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ]; then
    printf '%s' "$TAURI_SIGNING_PRIVATE_KEY"
    return 0
  fi

  return 1
}

SIGNING_PRIVATE_KEY_RAW="$(resolve_signing_private_key 2>/dev/null || true)"
if [ -n "$SIGNING_PRIVATE_KEY_RAW" ]; then
  TAURI_SIGNING_PRIVATE_KEY_B64="$(base64_inline "$SIGNING_PRIVATE_KEY_RAW")"
else
  TAURI_SIGNING_PRIVATE_KEY_B64=""
fi

if [ -n "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}" ]; then
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD_B64="$(base64_inline "$TAURI_SIGNING_PRIVATE_KEY_PASSWORD")"
else
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD_B64=""
fi

AWS_REGION_VALUE="${AWS_REGION:-${AWS_DEFAULT_REGION:-}}"
if [ -z "$AWS_REGION_VALUE" ]; then
  AWS_REGION_VALUE="$(aws configure get region 2>/dev/null || true)"
fi

if [ -z "${AWS_REGION_VALUE:-}" ]; then
  echo "Set AWS_REGION or configure a default region before running this release flow." >&2
  exit 1
fi

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
if [ -z "${ACCOUNT_ID:-}" ] || [ "$ACCOUNT_ID" = "None" ]; then
  echo "Unable to determine the AWS account ID from aws sts get-caller-identity." >&2
  exit 1
fi

if [ -n "${RELEASE_AWS_BUCKET:-}" ]; then
  ARTIFACT_BUCKET="$RELEASE_AWS_BUCKET"
  MANAGED_BUCKET=0
else
  ARTIFACT_BUCKET="octomus-release-${ACCOUNT_ID}-${AWS_REGION_VALUE}-${RUN_ID}"
  MANAGED_BUCKET=1
fi

SOURCE_PREFIX="source/${RUN_ID}"
ARTIFACT_PREFIX="artifacts/${RUN_ID}"
DEST_ROOT="$ROOT_DIR/artifacts/aws-release"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/octomus-release-aws.XXXXXX")"
SOURCE_DIR="$WORK_DIR/source"
SOURCE_ZIP="$WORK_DIR/source.zip"

ROLE_NAME="octomus-release-${RUN_ID}"
LINUX_PROJECT_NAME="octomus-release-linux-${RUN_ID}"
WINDOWS_PROJECT_NAME="octomus-release-windows-${RUN_ID}"

ROLE_ARN=""
LINUX_BUILD_ID=""
WINDOWS_BUILD_ID=""

cleanup() {
  set +e

  if [ -n "$LINUX_BUILD_ID" ]; then
    aws codebuild stop-build --id "$LINUX_BUILD_ID" >/dev/null 2>&1
  fi

  if [ -n "$WINDOWS_BUILD_ID" ]; then
    aws codebuild stop-build --id "$WINDOWS_BUILD_ID" >/dev/null 2>&1
  fi

  if [ -n "$LINUX_PROJECT_NAME" ]; then
    aws codebuild delete-project --name "$LINUX_PROJECT_NAME" >/dev/null 2>&1
  fi

  if [ -n "$WINDOWS_PROJECT_NAME" ]; then
    aws codebuild delete-project --name "$WINDOWS_PROJECT_NAME" >/dev/null 2>&1
  fi

  if [ -n "$ROLE_NAME" ]; then
    aws iam delete-role-policy --role-name "$ROLE_NAME" --policy-name octomus-release-policy >/dev/null 2>&1
    aws iam delete-role --role-name "$ROLE_NAME" >/dev/null 2>&1
  fi

  if [ "$MANAGED_BUCKET" = "1" ] && [ -n "$ARTIFACT_BUCKET" ]; then
    aws s3 rm "s3://$ARTIFACT_BUCKET" --recursive >/dev/null 2>&1
    aws s3api delete-bucket --bucket "$ARTIFACT_BUCKET" >/dev/null 2>&1
  fi

  rm -rf "$WORK_DIR"
}

trap cleanup EXIT INT TERM

echo "Preparing source snapshot in $WORK_DIR..."
mkdir -p "$SOURCE_DIR"

if command -v rsync >/dev/null 2>&1; then
  rsync -a \
    --exclude '.git/' \
    --exclude 'target/' \
    --exclude 'artifacts/' \
    --exclude 'node_modules/' \
    ./ "$SOURCE_DIR/"
else
  cp -R . "$SOURCE_DIR/"
  rm -rf "$SOURCE_DIR/.git" "$SOURCE_DIR/target" "$SOURCE_DIR/artifacts" "$SOURCE_DIR/node_modules"
fi

(cd "$SOURCE_DIR" && zip -qr "$SOURCE_ZIP" .)

if [ "$MANAGED_BUCKET" = "1" ]; then
  echo "Creating temporary S3 bucket $ARTIFACT_BUCKET..."
  case "$AWS_REGION_VALUE" in
    us-east-1)
      aws s3api create-bucket --bucket "$ARTIFACT_BUCKET" >/dev/null
      ;;
    *)
      aws s3api create-bucket \
        --bucket "$ARTIFACT_BUCKET" \
        --create-bucket-configuration "LocationConstraint=$AWS_REGION_VALUE" >/dev/null
      ;;
  esac
fi

echo "Creating temporary IAM role for CodeBuild..."
TRUST_POLICY="$WORK_DIR/trust-policy.json"
cat > "$TRUST_POLICY" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "codebuild.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

aws iam create-role \
  --role-name "$ROLE_NAME" \
  --assume-role-policy-document "file://$TRUST_POLICY" >/dev/null

ROLE_ARN="$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text)"

INLINE_POLICY="$WORK_DIR/inline-policy.json"
cat > "$INLINE_POLICY" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowBuildBucketAccess",
      "Effect": "Allow",
      "Action": [
        "s3:GetBucketLocation",
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::$ARTIFACT_BUCKET"
    },
    {
      "Sid": "AllowBuildObjectAccess",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:GetObjectVersion",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::$ARTIFACT_BUCKET/*"
    },
    {
      "Sid": "AllowLogs",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "*"
    }
  ]
}
EOF

aws iam put-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-name octomus-release-policy \
  --policy-document "file://$INLINE_POLICY" >/dev/null

sleep 8

upload_source() {
  echo "Uploading source archive to s3://$ARTIFACT_BUCKET/$SOURCE_KEY..."
  aws s3 cp "$SOURCE_ZIP" "s3://$ARTIFACT_BUCKET/$SOURCE_KEY" >/dev/null
}

wait_for_build() {
  build_id="$1"
  label="$2"

  while :; do
    status="$(aws codebuild batch-get-builds --ids "$build_id" --query 'builds[0].buildStatus' --output text)"
    phase="$(aws codebuild batch-get-builds --ids "$build_id" --query 'builds[0].currentPhase' --output text)"
    echo "[$label] $status ($phase)"

    case "$status" in
      SUCCEEDED)
        return 0
        ;;
      FAILED|FAULT|TIMED_OUT|STOPPED)
        log_link="$(aws codebuild batch-get-builds --ids "$build_id" --query 'builds[0].logs.deepLink' --output text)"
        echo "[$label] build failed. Logs: $log_link" >&2
        return 1
        ;;
      *)
        sleep 20
        ;;
    esac
  done
}

create_project() {
  platform="$1"
  project_name="$2"
  buildspec_path="$3"
  image="$4"
  compute_type="$5"
  env_type="$6"
  bundles="$7"

  project_json="$WORK_DIR/${platform}-project.json"
  cat > "$project_json" <<EOF
{
  "name": "$project_name",
  "serviceRole": "$ROLE_ARN",
  "artifacts": {
    "type": "S3",
    "location": "$ARTIFACT_BUCKET",
    "path": "$ARTIFACT_PREFIX/$platform",
    "name": "release.zip",
    "packaging": "ZIP"
  },
  "source": {
    "type": "S3",
    "location": "$ARTIFACT_BUCKET/$SOURCE_KEY",
    "buildspec": "$buildspec_path"
  },
  "environment": {
    "type": "$env_type",
    "image": "$image",
    "computeType": "$compute_type",
    "privilegedMode": false,
    "environmentVariables": [
      { "name": "RELEASE_BUNDLES", "value": "$bundles", "type": "PLAINTEXT" },
      { "name": "CI", "value": "true", "type": "PLAINTEXT" },
      { "name": "TAURI_SIGNING_PRIVATE_KEY_B64", "value": "$TAURI_SIGNING_PRIVATE_KEY_B64", "type": "PLAINTEXT" },
      { "name": "TAURI_SIGNING_PRIVATE_KEY_PASSWORD_B64", "value": "$TAURI_SIGNING_PRIVATE_KEY_PASSWORD_B64", "type": "PLAINTEXT" }
    ]
  },
  "timeoutInMinutes": 120,
  "queuedTimeoutInMinutes": 30
}
EOF

  aws codebuild create-project --cli-input-json "file://$project_json" >/dev/null
}

download_and_expand() {
  platform="$1"
  dest_dir="$2"
  archive_path="$WORK_DIR/$platform-release.zip"
  artifact_key="$ARTIFACT_PREFIX/$platform/release.zip"

  echo "Downloading $platform artifact from s3://$ARTIFACT_BUCKET/$artifact_key..."
  aws s3 cp "s3://$ARTIFACT_BUCKET/$artifact_key" "$archive_path" >/dev/null

  rm -rf "$dest_dir"
  mkdir -p "$dest_dir"
  unzip -oq "$archive_path" -d "$dest_dir"
}

upload_to_r2_if_configured() {
  platform="$1"
  source_dir="$2"

  if [ -z "${R2_ENDPOINT_URL:-}" ] || [ -z "${R2_BUCKET:-}" ]; then
    return 0
  fi

  r2_prefix="${R2_PREFIX:-octomus-release/${VERSION}}"
  target_uri="s3://$R2_BUCKET/$r2_prefix/$platform/"
  echo "Syncing $platform artifacts to $target_uri..."

  if [ -z "${R2_ACCESS_KEY_ID:-}" ] || [ -z "${R2_SECRET_ACCESS_KEY:-}" ]; then
    echo "Set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY before enabling R2 uploads." >&2
    return 1
  fi

  aws_r2 s3 sync "$source_dir" "$target_uri" --endpoint-url "$R2_ENDPOINT_URL" >/dev/null
}

generate_updater_manifest() {
  platform="$1"
  source_dir="$2"

  if [ -z "${R2_ENDPOINT_URL:-}" ] || [ -z "${R2_BUCKET:-}" ]; then
    return 0
  fi

  if [ -z "${R2_PUBLIC_BASE_URL:-}" ]; then
    echo "Skipping updater manifest for $platform because R2_PUBLIC_BASE_URL is not set." >&2
    return 0
  fi

  r2_prefix="${R2_PREFIX:-octomus-release/${VERSION}}"
  updater_prefix="${R2_UPDATER_PREFIX:-updater}"
  public_base_url="$(strip_trailing_slash "$R2_PUBLIC_BASE_URL")"
  pub_date="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  updater_dir="$DEST_ROOT/updater"
  mkdir -p "$updater_dir"

  case "$platform" in
    linux)
      target_key="linux-x86_64"
      artifact_path="$(find "$source_dir" -maxdepth 1 -type f -name '*.AppImage' ! -name '*.sig' | head -n 1)"
      ;;
    windows)
      target_key="windows-x86_64"
      artifact_path="$(find "$source_dir" -maxdepth 1 -type f -name '*.exe' | head -n 1)"
      if [ -z "$artifact_path" ]; then
        artifact_path="$(find "$source_dir" -maxdepth 1 -type f -name '*.msi' | head -n 1)"
      fi
      ;;
    *)
      echo "Updater manifest generation is not configured for platform: $platform" >&2
      return 0
      ;;
  esac

  if [ -z "$artifact_path" ]; then
    echo "Missing updater artifact for $platform in $source_dir" >&2
    return 1
  fi

  signature_path="${artifact_path}.sig"
  if [ ! -f "$signature_path" ]; then
    echo "Missing updater signature for $artifact_path" >&2
    return 1
  fi

  artifact_name="$(basename "$artifact_path")"
  artifact_url="$public_base_url/$r2_prefix/$platform/$artifact_name"
  manifest_path="$updater_dir/$target_key.json"

  node ./scripts/generate-updater-manifest.mjs \
    --version "$VERSION" \
    --url "$artifact_url" \
    --signature-file "$signature_path" \
    --output "$manifest_path" \
    --pub-date "$pub_date"

  target_uri="s3://$R2_BUCKET/$updater_prefix/$target_key.json"
  echo "Uploading updater manifest for $target_key to $target_uri..."
  aws_r2 s3 cp "$manifest_path" "$target_uri" --endpoint-url "$R2_ENDPOINT_URL" >/dev/null
}

build_linux() {
  SOURCE_KEY="${SOURCE_PREFIX}/linux/source.zip"
  upload_source
  create_project \
    "linux" \
    "$LINUX_PROJECT_NAME" \
    "codebuild/linux-buildspec.yml" \
    "aws/codebuild/standard:7.0" \
    "BUILD_GENERAL1_LARGE" \
    "LINUX_CONTAINER" \
    "appimage,deb"

  echo "Starting Linux build..."
  LINUX_BUILD_ID="$(aws codebuild start-build --project-name "$LINUX_PROJECT_NAME" --query 'build.id' --output text)"
  wait_for_build "$LINUX_BUILD_ID" "linux"
  DEST_DIR="$DEST_ROOT/linux-${VERSION}"
  download_and_expand "linux" "$DEST_DIR"
  upload_to_r2_if_configured "linux" "$DEST_DIR"
  generate_updater_manifest "linux" "$DEST_DIR"
  echo "Linux artifacts available at $DEST_DIR"
}

build_windows() {
  SOURCE_KEY="${SOURCE_PREFIX}/windows/source.zip"
  upload_source
  create_project \
    "windows" \
    "$WINDOWS_PROJECT_NAME" \
    "codebuild/windows-buildspec.yml" \
    "aws/codebuild/windows-base:2022-1.0" \
    "BUILD_GENERAL1_LARGE" \
    "WINDOWS_SERVER_2022_CONTAINER" \
    "nsis,msi"

  echo "Starting Windows build..."
  WINDOWS_BUILD_ID="$(aws codebuild start-build --project-name "$WINDOWS_PROJECT_NAME" --query 'build.id' --output text)"
  wait_for_build "$WINDOWS_BUILD_ID" "windows"
  DEST_DIR="$DEST_ROOT/windows-${VERSION}"
  download_and_expand "windows" "$DEST_DIR"
  upload_to_r2_if_configured "windows" "$DEST_DIR"
  generate_updater_manifest "windows" "$DEST_DIR"
  echo "Windows artifacts available at $DEST_DIR"
}

mkdir -p "$DEST_ROOT"

case "$TARGETS" in
  all)
    build_linux
    build_windows
    ;;
  linux)
    build_linux
    ;;
  windows)
    build_windows
    ;;
esac

echo "Release completed."
