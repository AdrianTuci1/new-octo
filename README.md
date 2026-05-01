# Octomus Launcher Prototype

This folder contains a fresh Rust + React prototype for the main launcher shell.

Scope:
- fixed-width spotlight-style launcher
- 3 core regions only:
  - chat input
  - tray area above input
  - chat area
- placeholder panels for onboarding and settings

Notes:
- Built as a Tauri-style Rust + React app structure
- No build artifacts are checked in
- The UI is intentionally isolated from the existing Wails client

Development:
- `npm run start` starts the Rust + React prototype in dev mode
- `npm run stop` stops the background dev process
- `npm run logs` tails the dev log
- `npm run tauri -- dev` runs raw Tauri commands with the Rust env loaded
- `npm run dev:app` runs the Tauri app in the foreground
- `./run.sh` starts it without using an npm alias
- `./stop.sh` stops it without using an npm alias

Live updates:
- React changes are picked up by Vite HMR
- Rust/Tauri changes are recompiled by `tauri dev`
- You do not need to run a production build for normal UI iteration

First run:
- `npm install`
- install Rust so `cargo` and `rustc` are available in your shell

Required native toolchain:
- `cargo --version`
- `rustc --version`

If Cargo is missing on macOS:
- `curl https://sh.rustup.rs -sSf | sh`
- restart the terminal
