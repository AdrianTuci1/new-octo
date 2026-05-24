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
- `release-aws.sh`: uploads the current workspace to temporary AWS CodeBuild projects for Linux and Windows, downloads the finished bundles into `artifacts/aws-release/<platform>-<version>/`, and optionally syncs them to R2 when `R2_ENDPOINT_URL` and `R2_BUCKET` are set
- `release-dmg.sh`: macOS-only wrapper for the `.dmg` release flow
- `release-exe.sh`: Windows-only wrapper for the `.exe`/`.msi` release flow
- `release-all.sh`: builds both the CLI archive and the desktop bundles for the current host

## Notes

- macOS `.dmg` generation may require Finder Automation permission for the terminal app that launches the build.
- Windows installers must be built on Windows.
- Linux desktop builds default to `.AppImage` and `.deb`.
- The AWS release flow expects `AWS_REGION` or a configured default region and uses temporary AWS resources that are cleaned up at the end of the run.
