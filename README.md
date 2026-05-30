# Octomus Launcher

An autonomous AI-native launcher shell built with Tauri, Rust, and React. Octomus acts as an intelligent agent orchestrator, bridging Large Language Models with the local system through a high-performance Rust backend.

---

## Architecture

- **Backend**: Rust + Tauri for system-level access and AI orchestration.
- **Frontend**: React + Vite for a low-latency spotlight interface.
- **Protocol**: Custom event-sinking for real-time token streaming and tool-call management.

## Documentation

- [Chain of Thought](docs/01_chain_of_thought.md)
- [Tool Call Lifecycle](docs/02_tool_call_lifecycle.md)
- [Conversation Model](docs/03_conversation_exchange_model.md)
- [MCP Integration](docs/05_mcp_integration.md)
- [Autonomous Loop](docs/06_autonomous_agent_loop.md)
- [Predict & Tips](docs/07_predict_and_tips.md)
- [Runtime and Release Plan](docs/08_runtime_and_release_plan.md)

---

## Development

### Setup
1. `npm install`
2. Copy `.env.example` to `.env` and configure your AI provider.
3. `npm run dev:app`

### Commands
- `npm run dev:app`: Run the application.
- `npm run test`: Run the default non-model-backed JS and Rust test suites.
- `npm run logs`: View development logs.
- `npm run tauri -- dev`: Raw Tauri development command.
- `npm run release:cli`: Build and archive the `octomus-cli` runtime.
- `npm run release:desktop`: Build desktop bundles for the current host OS.
- `npm run release:aws`: Build Linux and Windows release bundles in AWS CodeBuild, then download them locally.
- `npm run release:dmg`: Build the macOS `.dmg` installer.
- `npm run release:exe`: Build the Windows `.exe` installer.
- See [scripts/README.md](scripts/README.md) for the packaging script map.
- See [tests/README.md](tests/README.md) for the full testing command map, including `src-tauri/tests` and model-backed runs with `tests.env`.

### Prerequisites
- Rust Toolchain (cargo & rustc)
- Node.js (v18+)

### Release Artifacts
- CLI archives are written to `artifacts/cli/` as `octomus-cli-<version>-<target>.tar.gz`.
- Desktop bundles are copied into `artifacts/desktop/<platform>-<version>/`.
- `.dmg` bundles must be produced on macOS.
- `.exe` and `.msi` bundles must be produced on Windows.
- Linux hosts default to `.AppImage` and `.deb` bundles when using `npm run release:desktop`.
- macOS `.dmg` bundling may require Finder Automation permission for the calling terminal app.
- `npm run release:aws` expects `AWS_REGION` to be set or configured in your AWS profile.
- `scripts/release-aws.sh` loads release settings from `release.env` by default, falls back to `.env` only if `release.env` is missing, and still lets explicit shell environment variables override both.
- To keep only R2 copies of AWS builds, set `R2_ENDPOINT_URL`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`. The script will still use a temporary S3 bucket during CodeBuild because AWS CodeBuild sources/artifacts are S3-backed, then delete that bucket during cleanup.

---

## License & Blessing

The author disclaims copyright to this source code. In place of a legal notice, here is a blessing:

> *"Everything around you that you call life was made up by people that were no smarter than you. And you can change it, you can influence it... Once you learn that, you'll never be the same again."*

---

Developed by StaticLabs.
