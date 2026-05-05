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

---

## Development

### Setup
1. `npm install`
2. Copy `.env.example` to `.env` and configure your AI provider.
3. `npm run dev:app`

### Commands
- `npm run dev:app`: Run the application.
- `npm run logs`: View development logs.
- `npm run tauri -- dev`: Raw Tauri development command.

### Prerequisites
- Rust Toolchain (cargo & rustc)
- Node.js (v18+)

---

## License & Blessing

The author disclaims copyright to this source code. In place of a legal notice, here is a blessing:

> *"Everything around you that you call life was made up by people that were no smarter than you. And you can change it, you can influence it... Once you learn that, you'll never be the same again."*

---

Developed by StaticLabs.
