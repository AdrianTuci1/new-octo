# Runtime and Release Plan

This repository is moving toward a dual-output architecture:

- `Octomus`: the Tauri application used as the control plane.
- `octomus-cli`: a headless runtime entrypoint that can later evolve into the remote harness runtime for cloud terminals and agent execution.

## Execution Model

### Desktop App

The desktop app remains responsible for:

- Octomus UI flows
- workspace tabs and settings
- secret selection and credential mapping
- cloud session lifecycle orchestration
- terminal and agent event rendering

### CLI / Headless Runtime

The CLI is the first shared-runtime artifact. It is intentionally small today, but it establishes the right packaging boundary for:

- headless startup on macOS, Linux, or Windows
- future remote bootstrap on VM or container targets
- runtime metadata and health reporting
- eventual relocation of harness execution from desktop to remote compute

The current command surface is minimal:

- `octomus-cli runtime-info`
- `octomus-cli version`
- `octomus-cli help`

## Build Outputs

### CLI

The CLI release flow builds:

- Rust binary: `octomus-cli`
- compressed archive: `octomus-cli-<version>-<target>.tar.gz`

Artifacts are written to:

- `artifacts/cli/`

### Desktop

The desktop release flow builds host-native Tauri bundles:

- macOS: `.app`, `.dmg`
- Linux: `.AppImage`, `.deb`
- Windows: `.exe`, `.msi`

Artifacts are copied to:

- `artifacts/desktop/<platform>-<version>/`

## Release Scripts

The following scripts define the current packaging workflow:

- `scripts/release-cli.sh`
- `scripts/release-desktop.sh`
- `scripts/release-dmg.sh`
- `scripts/release-exe.sh`
- `scripts/release-all.sh`

### Expectations

- `release-cli.sh` builds the headless runtime and creates a tarball.
- `release-desktop.sh` detects the current host and builds the appropriate native bundles.
- `release-dmg.sh` is a macOS-only wrapper around the desktop release flow.
- `release-exe.sh` is a Windows-only wrapper around the desktop release flow.
- `release-all.sh` builds both CLI and desktop outputs for the current host.

### macOS note

DMG creation can require Finder Automation permission for the app that launches the build, because Tauri's DMG bundler uses AppleScript to arrange the installation window. In that case:

- the `.app` bundle can still be produced successfully
- the `.dmg` step should be retried after granting Finder automation access

## Why This Structure Matters

This structure keeps the product direction clean:

- desktop stays the control plane
- CLI becomes the portable runtime substrate
- future cloud execution can reuse the same Rust library modules
- packaging logic is explicit and reproducible from scripts instead of manual release steps

## Next Runtime Steps

The next technical milestone after packaging is to evolve `octomus-cli` into a real remote runtime:

1. add a structured IPC transport between desktop and runtime
2. move terminal execution behind a shared session protocol
3. move agent harness execution into the headless runtime
4. inject user-selected secrets into the remote runtime explicitly
5. stream terminal, agent, and filesystem events back to desktop using a unified contract
