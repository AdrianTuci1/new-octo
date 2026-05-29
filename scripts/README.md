# Scripts

This folder contains the local development and packaging entrypoints for the project.

## Development

- `tauri-env.sh`: loads the Rust/Tauri toolchain environment
- `tauri-cli.sh`: runs the local Tauri CLI with the expected Cargo runner
- `tauri-dev.sh`: starts the desktop app in development mode
- `dev-start.sh`: convenience wrapper for the local app/dev flow
- `dev-stop.sh`: stops the local dev processes

## Release

- `release-cli.sh`: builds `octomus-cli` and packages it as `artifacts/cli/octomus-cli-<version>-<target>.tar.gz`
- `release-desktop.sh`: builds native desktop bundles for the current host platform and copies them into `artifacts/desktop/<platform>-<version>/`
- `release-aws.sh`: uploads the current workspace to temporary AWS CodeBuild projects for Linux and Windows, downloads the finished bundles into `artifacts/aws-release/<platform>-<version>/`, and can sync the finished bundles to R2 with separate `R2_*` credentials while still cleaning up the temporary S3 bucket used by CodeBuild
- `release-dmg.sh`: macOS-only wrapper for the `.dmg` release flow
- `release-exe.sh`: Windows-only wrapper for the `.exe`/`.msi` release flow
- `release-all.sh`: builds both the CLI archive and the desktop bundles for the current host

## Notes

- macOS `.dmg` generation may require Finder Automation permission for the terminal app that launches the build.
- Windows installers must be built on Windows.
- Linux desktop builds default to `.AppImage` and `.deb`.
- The AWS release flow expects `AWS_REGION` or a configured default region and uses temporary AWS resources that are cleaned up at the end of the run.
- `release-aws.sh` auto-loads `release.env` from the repository root before reading `AWS_*` and `R2_*` settings, and falls back to `.env` only when `release.env` is missing.
- For R2 uploads, set `R2_ENDPOINT_URL`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`. `R2_PREFIX` is optional.
